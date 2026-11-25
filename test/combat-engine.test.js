const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const zlib = require("node:zlib");
const { webcrypto, createHash } = require("node:crypto");
const source = fs.readFileSync(path.join(__dirname, "../src/calculator/combat-engine.js"), "utf8");
const reference = require("./fixtures/combat-engine-reference.json");
function fixture({ storage, navigator, cache } = {}) {
  const blobs = new Map();
  const state = { created: 0, runs: 0, stopped: 0, silent: false, transform: (m) => m };
  const packed = (name) => Buffer.from(source.match(new RegExp(`ctx\\.${name}\\s*=\\s*"([^"]+)"`))[1], "base64");
  const workerSource = zlib.gunzipSync(packed("MWISIM_WORKER_GZ_BASE64")).toString();
  const embedded = JSON.parse(zlib.gunzipSync(packed("MWISIM_DATA_GZ_BASE64")));
  class Worker extends EventTarget {
    constructor() {
      super();
      state.created++;
      this.stopped = false;
      const self = {
        postMessage: (message) => {
          if (this.stopped) return;
          const event = new Event("message");
          event.data = state.transform(structuredClone(message));
          queueMicrotask(() => {
            if (!this.stopped) this.dispatchEvent(event);
          });
        }
      };
      this.self = self;
      vm.runInNewContext(workerSource, {
        self,
        WebAssembly,
        TextEncoder,
        TextDecoder,
        structuredClone,
        crypto: webcrypto,
        performance
      });
    }
    postMessage(message) {
      if (message.type === "run") state.runs++;
      if (state.silent || this.stopped) return;
      Promise.resolve(this.self.onmessage({ data: structuredClone(message) })).catch((error) => {
        const event = new Event("error");
        event.message = error.message;
        this.dispatchEvent(event);
      });
    }
    terminate() {
      this.stopped = true;
      state.stopped++;
    }
  }
  const sandbox = {
    crypto: webcrypto,
    TextEncoder,
    structuredClone,
    atob,
    Blob,
    Response,
    DecompressionStream,
    Worker,
    URL: {
      createObjectURL: (blob) => {
        const id = `blob:${blobs.size}`;
        blobs.set(id, blob);
        return id;
      },
      revokeObjectURL: (id) => blobs.delete(id)
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/calculator/combat-experience.js"), "utf8"), sandbox);
  if (cache) sandbox.MwiLabyrinthSimulationCache = { create: () => cache };
  vm.runInNewContext(source, sandbox);
  const ctx = {
    window: { crypto: webcrypto, localStorage: storage, navigator },
    combatWorkerPendingRequests: new Map(),
    combatWorkerRequestId: 0,
    setTimeout,
    clearTimeout,
    listen: (target, name, handler) => target.addEventListener(name, handler),
    finiteNumber: (n, fallback) => (Number.isFinite(Number(n)) ? Number(n) : fallback),
    deepCloneJson: (v) => JSON.parse(JSON.stringify(v)),
    cachedInitClientDataRaw: JSON.stringify({ ...embedded.fallbackData, ...embedded.originalMaps }),
    getInitClientData: () => ({ ...embedded.fallbackData, ...embedded.originalMaps })
  };
  sandbox.MwiLabyrinthCalculatorModules["combat-engine"](ctx);
  return { ctx, state, blobs, packed };
}
test("固定 WASM 与上游一致，Worker 只扩展经验输出；20 组胜负与耗时逐项匹配", async () => {
  const { ctx, blobs, packed } = fixture();
  assert.equal(
    createHash("sha256")
      .update(zlib.gunzipSync(packed("MWISIM_WASM_GZ_BASE64")))
      .digest("hex"),
    reference.wasmSha256
  );
  assert.equal(
    createHash("sha256")
      .update(zlib.gunzipSync(packed("MWISIM_WORKER_GZ_BASE64")))
      .digest("hex"),
    require("../references/combat-engine.json").experienceWorkerSha256
  );
  try {
    for (const row of reference.cases) {
      let done = 0;
      const result = await ctx.simulateCombatRoomWithWorker(row.params, { add: (n) => (done += n) });
      assert.equal(done, row.params.trials);
      for (const [key, value] of Object.entries(row.expected))
        assert.equal(result[key], value, `${row.params.monsterHrid}: ${key}`);
      assert.equal(result.completedTrials, row.params.trials);
      const xp = Object.values(result.experienceGained).flatMap((skills) => Object.values(skills));
      assert.ok(xp.every((value) => Number.isFinite(value) && value >= 0));
      assert.equal(xp.reduce((sum, value) => sum + value, 0) > 0, result.successes > 0);
      assert.equal(
        result.expectedSecondsPerClear,
        result.successes ? result.totalSpentSeconds / result.successes : Infinity
      );
    }
  } finally {
    ctx.resetCombatSimulatorWorker();
  }
  assert.equal(blobs.size, 0);
});
test("完整场数精确执行、进度累计正确、固定种子重复运行一致", async () => {
  const { ctx } = fixture();
  try {
    for (const trials of [1, 7, 300, 1000]) {
      const params = { ...reference.cases[0].params, trials };
      let done = 0;
      const a = await ctx.simulateCombatRoomWithWorker(params, {
        add: (n) => {
          assert.ok(n > 0);
          done += n;
        }
      });
      const b = await ctx.simulateCombatRoomWithWorker(params);
      assert.equal(done, trials);
      assert.equal(a.trials, trials);
      assert.equal(a.successes + a.failedByDeath + a.failedByTimeout, trials);
      for (const key of ["successes", "failedByDeath", "failedByTimeout", "totalSpentSeconds"])
        assert.equal(a[key], b[key]);
      assert.ok(a.maxElapsedSeconds <= 120);
    }
  } finally {
    ctx.resetCombatSimulatorWorker();
  }
});
test("拒绝不完整场数并终止 Worker，下一次可重新初始化", async () => {
  const { ctx, state } = fixture();
  state.transform = (m) => (m.type === "result" ? { ...m, result: { ...m.result, completedTrials: 0 } } : m);
  await assert.rejects(ctx.simulateCombatRoomWithWorker(reference.cases[0].params), /未完成请求场数/);
  assert.equal(state.stopped, 1);
  assert.equal(ctx.combatWorkerPendingRequests.size, 0);
  state.transform = (m) => m;
  try {
    assert.equal((await ctx.simulateCombatRoomWithWorker(reference.cases[0].params)).trials, 17);
  } finally {
    ctx.resetCombatSimulatorWorker();
  }
});
test("初始化超时清理所有等待请求和 URL；取消解压中的初始化不创建 Worker", async () => {
  const { ctx, state, blobs } = fixture();
  state.silent = true;
  ctx.COMBAT_WORKER_TIMEOUT_MS = 20;
  await assert.rejects(ctx.ensureCombatSimulatorWorker(), /超时/);
  assert.equal(blobs.size, 0);
  assert.equal(ctx.combatWorkerPendingRequests.size, 0);
  const next = fixture();
  let release;
  next.ctx.prepareMwisimWorkerAssets = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const pending = next.ctx.ensureCombatSimulatorWorker();
  next.ctx.resetCombatSimulatorWorker();
  release({});
  await assert.rejects(pending, /初始化已取消/);
  assert.equal(next.state.created, 0);
});
// Boundary scenarios adapted from the pinned upstream calculator/tests/deadline.test.mjs.
async function rawEngine(wasm) {
  const { instance } = await WebAssembly.instantiate(wasm, { env: { labyrinth_progress() {} } });
  const x = instance.exports;
  const out = () => new TextDecoder().decode(new Uint8Array(x.memory.buffer, x.out_ptr(), x.out_len()));
  const put = (object) => {
    const b = new TextEncoder().encode(JSON.stringify(object));
    const p = x.alloc(b.length);
    new Uint8Array(x.memory.buffer, p, b.length).set(b);
    return [p, b.length];
  };
  return {
    load: (data) => assert.equal(x.load_gamedata(...put(data)), 0),
    run: (scenario) => {
      x.run(...put(scenario), 0);
      const result = JSON.parse(out());
      assert.equal(result.error, undefined);
      return result.result.labyrinthStats;
    }
  };
}
test("实际 WASM 严格执行 120 秒截止：截止时击杀有效，截止后事件不执行", async () => {
  const { packed } = fixture();
  const engine = await rawEngine(zlib.gunzipSync(packed("MWISIM_WASM_GZ_BASE64")));
  for (const winner of ["player", "monster"])
    for (const seconds of [119.999999, 120, 120.000001]) {
      const details = {
        attackInterval: 500e9,
        combatStats: {
          combatStyleHrids: ["/combat_styles/stab"],
          damageType: "/damage_types/physical",
          attackInterval: winner === "monster" ? seconds * 1e9 : 500e9,
          autoAttackDamage: winner === "monster" ? 1e8 : -1,
          stabAccuracy: 1e12
        }
      };
      for (const skill of ["stamina", "intelligence", "attack", "melee", "defense", "ranged", "magic"])
        details[`${skill}Level`] = 0;
      engine.load({
        abilities: {},
        abilityAliases: {},
        combatStyles: {},
        triggerDependencies: {},
        monsters: { dummy: { experience: 0, enrageTime: 600e9, abilities: [], combatDetails: details } }
      });
      const stats = engine.run({
        seed: 7,
        labyrinthTrials: 3,
        labyrinthFixedMonsterCooldown: true,
        labyrinth: { monsterHrid: "dummy", roomLevel: 100 },
        players: [
          {
            hrid: "player1",
            levels: [0, 0, 0, 0, 0, 0, 0],
            equipStats: { autoAttackDamage: winner === "player" ? 1e8 : -1, stabAccuracy: 1e12 },
            combatStyleHrid: "/combat_styles/stab",
            damageType: "/damage_types/physical",
            attackInterval: winner === "player" ? seconds * 1e9 : 500e9,
            debuffOnLevelGap: 0,
            abilities: [],
            food: [],
            drinks: []
          }
        ]
      });
      assert.equal(stats.completedTrials, 3);
      assert.equal(stats.successes, seconds <= 120 && winner === "player" ? 3 : 0);
      assert.equal(stats.failedByDeath, seconds <= 120 && winner === "monster" ? 3 : 0);
      assert.equal(stats.failedByTimeout, seconds > 120 ? 3 : 0);
      assert.ok(Math.abs(stats.totalSpentSeconds - 3 * Math.min(seconds, 120)) < 1e-7);
    }
});

test("真实 WASM 经验升级只改变经验，不改变同种子胜负与耗时", async () => {
  const { ctx } = fixture();
  try {
    const params = structuredClone(reference.cases[0].params);
    params.trials = 100;
    const a = await ctx.simulateCombatRoomWithWorker(params);
    params.playerDto.labyrinthUpgrades["/buff_uniques/labyrinth_upgrade_experience"] = 100;
    const b = await ctx.simulateCombatRoomWithWorker(params);
    assert.equal(b.successes, a.successes);
    assert.equal(b.totalSpentSeconds, a.totalSpentSeconds);
    for (const key of Object.keys(a.experienceGained.player1))
      assert.ok(Math.abs(b.experienceGained.player1[key] - 2 * a.experienceGained.player1[key]) < 1e-6);
  } finally {
    ctx.resetCombatSimulatorWorker();
  }
});

// CPU wall time is diagnostic only; every numerical simulation field is compared.
function simulationValues(value) {
  const copy = structuredClone(value);
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.firstRunDebug) delete node.firstRunDebug.elapsedMs;
    for (const child of Object.values(node)) visit(child);
  }
  visit(copy);
  return copy;
}

test("经验模拟只复用完整相同输入，结果隔离且失败后可重算", async () => {
  const { ctx, state } = fixture();
  const params = { ...reference.cases[0].params, reuseSimulation: true };
  try {
    const original = await ctx.simulateCombatRoomWithWorker(params);
    let progress = 0;
    const cached = await ctx.simulateCombatRoomWithWorker(params, { add: (n) => (progress += n) });
    assert.deepEqual(cached, original);
    assert.equal(progress, params.trials);
    assert.equal(state.runs, 1);
    cached.experienceGained = {};
    assert.deepEqual(await ctx.simulateCombatRoomWithWorker(params), original);
    for (const change of [
      { trials: params.trials + 1 },
      { seed: params.seed + 1 },
      { mazeDifficulty: params.mazeDifficulty + 1 },
      { monsterHrid: reference.cases.find((r) => r.params.monsterHrid !== params.monsterHrid).params.monsterHrid },
      { mazeCrateItemHrids: ["/items/basic_coffee_crate"] },
      { playerDto: { ...params.playerDto, rangedLevel: params.playerDto.rangedLevel + 1 } },
      {
        playerDto: {
          ...params.playerDto,
          equipment: { "/equipment_types/two_hand": { hrid: "/items/wooden_bow", enhancementLevel: 6 } }
        }
      },
      {
        playerDto: { ...params.playerDto, labyrinthUpgrades: { ...params.playerDto.labyrinthUpgrades, experience: 3 } }
      }
    ]) {
      const before = state.runs;
      const changed = { ...params, ...change };
      const fresh = await ctx.simulateCombatRoomWithWorker({ ...changed, reuseSimulation: false });
      assert.deepEqual(simulationValues(await ctx.simulateCombatRoomWithWorker(changed)), simulationValues(fresh));
      assert.equal(state.runs, before + 2, JSON.stringify(change));
    }
    for (const changed of [
      { ...params, seed: undefined },
      { ...params, reuseSimulation: false }
    ]) {
      const before = state.runs;
      await ctx.simulateCombatRoomWithWorker(changed);
      await ctx.simulateCombatRoomWithWorker(changed);
      assert.equal(state.runs, before + 2);
    }
    let before = state.runs;
    ctx.storageIdentity = () => "another-character";
    await ctx.simulateCombatRoomWithWorker(params);
    assert.equal(state.runs, before + 1);
    before = state.runs;
    ctx.COMBAT_MODEL_SIGNATURE = "new-model";
    await ctx.simulateCombatRoomWithWorker(params);
    assert.equal(state.runs, before + 1);
    ctx.resetCombatSimulatorWorker();
    state.transform = (m) => (m.type === "result" ? { ...m, result: { ...m.result, completedTrials: 0 } } : m);
    await assert.rejects(ctx.simulateCombatRoomWithWorker(params), /未完成请求场数/);
    state.transform = (m) => m;
    before = state.runs;
    assert.deepEqual(simulationValues(await ctx.simulateCombatRoomWithWorker(params)), simulationValues(original));
    assert.equal(state.runs, before + 1);
  } finally {
    ctx.resetCombatSimulatorWorker();
  }
});

test("相同并发请求只模拟一次；LRU 容量和内存上限生效", async () => {
  const { ctx, state } = fixture();
  const params = { ...reference.cases[0].params, reuseSimulation: true };
  try {
    const progress = [0, 0];
    const results = await Promise.all(
      progress.map((_, i) => ctx.simulateCombatRoomWithWorker(params, { add: (n) => (progress[i] += n) }))
    );
    assert.equal(state.runs, 1);
    assert.deepEqual(results[0], results[1]);
    assert.deepEqual(progress, [params.trials, params.trials]);
    ctx.resetCombatSimulatorWorker();
    ctx.COMBAT_REUSE_MAX_ENTRIES = 2;
    for (const mazeDifficulty of [1, 2, 1, 3, 1]) await ctx.simulateCombatRoomWithWorker({ ...params, mazeDifficulty });
    assert.equal(state.runs, 4);
    await ctx.simulateCombatRoomWithWorker({ ...params, mazeDifficulty: 2 });
    assert.equal(state.runs, 5);
    ctx.resetCombatSimulatorWorker();
    ctx.COMBAT_REUSE_MAX_BYTES = 1;
    await ctx.simulateCombatRoomWithWorker(params);
    await ctx.simulateCombatRoomWithWorker(params);
    assert.equal(state.runs, 7);
  } finally {
    ctx.resetCombatSimulatorWorker();
  }
});

test("完整等级曲线、经验目标与推荐不变；重复扫描零新增模拟", async (t) => {
  const { ctx, state } = fixture();
  const policy = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/calculator/experience-policy.js"), "utf8"), policy);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/calculator/combat-experience.js"), "utf8"), policy);
  const scan = (target, reuseSimulation) =>
    policy.MwiLabyrinthExperiencePolicy.scan({
      maxLevel: 12,
      target,
      evaluate: async (mazeDifficulty) => {
        const result = await ctx.simulateCombatRoomWithWorker({
          ...reference.cases[0].params,
          trials: 30,
          seed: 173,
          mazeDifficulty,
          reuseSimulation
        });
        return { ...policy.MwiLabyrinthCombatExperience.summarize(result), result };
      }
    });
  try {
    const baseline = await scan(0, false);
    const firstStart = performance.now();
    const first = await scan(0, true);
    const firstMs = performance.now() - firstStart;
    assert.deepEqual(simulationValues(first), simulationValues(baseline));
    const before = state.runs;
    const repeatStart = performance.now();
    assert.deepEqual(simulationValues(await scan(0, true)), simulationValues(baseline));
    const repeatMs = performance.now() - repeatStart;
    assert.equal(state.runs, before);
    const target = first.peak.experiencePerHour / 2;
    const cached = await scan(target, true);
    assert.equal(state.runs, before);
    assert.deepEqual(simulationValues(cached), simulationValues(await scan(target, false)));
    t.diagnostic(`12 等级 × 30 场：首次 ${firstMs.toFixed(1)}ms，复用 ${repeatMs.toFixed(1)}ms；重复扫描新增模拟 0 场`);
  } finally {
    ctx.resetCombatSimulatorWorker();
  }
});

test("多 Worker 共用完整样本缓存，乱序调度结果与串行一致，释放空闲线程", async () => {
  const { ctx, state, blobs } = fixture();
  ctx.window.navigator = { hardwareConcurrency: 8, deviceMemory: 8 };
  assert.equal(ctx.getCombatParallelism(), 7);
  try {
    const params = reference.cases.slice(0, 8).map((r) => ({ ...r.params, reuseSimulation: true, parallel: true }));
    const concurrent = await Promise.all(params.map((p) => ctx.simulateCombatRoomWithWorker(p)));
    assert.ok(state.created >= 4 && state.created <= 7);
    const runs = state.runs;
    assert.deepEqual(
      await Promise.all(
        params
          .slice()
          .reverse()
          .map((p) => ctx.simulateCombatRoomWithWorker(p))
      ),
      concurrent.slice().reverse()
    );
    assert.equal(state.runs, runs);
    for (let i = 0; i < params.length; i++) {
      const serial = await ctx.simulateCombatRoomWithWorker({ ...params[i], reuseSimulation: false, parallel: false });
      assert.deepEqual(simulationValues(serial), simulationValues(concurrent[i]));
    }
    ctx.releaseIdleCombatWorkers();
    assert.equal(state.stopped, state.created - 1);
    assert.equal(blobs.size, 1);
  } finally {
    ctx.resetCombatSimulatorWorker();
  }
  assert.equal(state.stopped, state.created);
  assert.equal(blobs.size, 0);
});

test("并发上限为核心数减一且最多十六路，低内存降级；取消清空队列且可恢复", async () => {
  const { ctx, state, blobs } = fixture();
  for (const [cores, memory, count] of [
    [undefined, undefined, 1],
    [1, 8, 1],
    [2, 8, 1],
    [4, 8, 3],
    [16, 8, 15],
    [32, 32, 16],
    [18, 32, 16],
    [32, undefined, 16],
    [16, 4, 2],
    [16, 2, 1]
  ]) {
    ctx.window.navigator = { hardwareConcurrency: cores, deviceMemory: memory };
    assert.equal(ctx.getCombatParallelism(), count);
  }
  ctx.window.navigator = { hardwareConcurrency: 8, deviceMemory: 8 };
  await Promise.all(
    Array.from({ length: 4 }, (_, i) =>
      ctx.simulateCombatRoomWithWorker({ ...reference.cases[i].params, parallel: true })
    )
  );
  state.silent = true;
  const jobs = Array.from({ length: 10 }, () =>
    ctx.simulateCombatRoomWithWorker({ ...reference.cases[0].params, parallel: true })
  );
  const settled = Promise.allSettled(jobs);
  ctx.resetCombatSimulatorWorker(new Error("cancel pool"));
  assert.ok((await settled).every((r) => r.status === "rejected"));
  assert.equal(ctx.combatWorkerPendingRequests.size, 0);
  assert.equal(blobs.size, 0);
  state.silent = false;
  try {
    assert.equal((await ctx.simulateCombatRoomWithWorker(reference.cases[0].params)).trials, 17);
  } finally {
    ctx.resetCombatSimulatorWorker();
  }
});

test("自适应池逐步扩容，页面延迟时减半，后台计时不误判，恢复后继续增加", async () => {
  const { ctx, state } = fixture();
  let clock = 1000;
  ctx.window.performance = { now: () => clock };
  ctx.window.document = { hidden: true };
  ctx.window.navigator = { hardwareConcurrency: 18, deviceMemory: 32 };
  state.transform = (message) => {
    if (message.type === "result") clock += 200;
    return message;
  };
  const run = () =>
    Promise.all(
      Array.from({ length: 90 }, (_, i) =>
        ctx.simulateCombatRoomWithWorker({
          ...reference.cases[i % reference.cases.length].params,
          trials: 1,
          parallel: true
        })
      )
    );
  try {
    assert.equal(ctx.getCombatConcurrencyState().limit, 4);
    await run();
    const high = ctx.getCombatConcurrencyState().limit;
    assert.ok(high > 4 && high <= 16);
    assert.ok(state.created > 4 && state.created <= 16);
    ctx.observeCombatResponsiveness(500, true);
    assert.equal(ctx.getCombatConcurrencyState().limit, high);
    ctx.observeCombatResponsiveness(500, false);
    assert.equal(ctx.getCombatConcurrencyState().limit, Math.floor(high / 2));
    assert.equal(ctx.getCombatConcurrencyState().backoffs, 1);
    await run();
    assert.ok(ctx.getCombatConcurrencyState().limit > Math.floor(high / 2));
    assert.equal(ctx.getCombatConcurrencyState().queued, 0);
  } finally {
    ctx.resetCombatSimulatorWorker();
  }
});

test("降低并发后不继续补位；取消时在途任务和队列全部落定", async () => {
  const { ctx, state } = fixture();
  ctx.window.navigator = { hardwareConcurrency: 18, deviceMemory: 32 };
  await ctx.ensureCombatSimulatorWorker();
  state.silent = true;
  const jobs = Array.from({ length: 12 }, () =>
    ctx.simulateCombatRoomWithWorker({ ...reference.cases[0].params, parallel: true })
  );
  const settled = Promise.allSettled(jobs);
  await new Promise((r) => {
    setTimeout(r, 5);
  });
  assert.equal(ctx.getCombatConcurrencyState().active, 4);
  ctx.observeCombatResponsiveness(200);
  assert.equal(ctx.getCombatConcurrencyState().limit, 2);
  const runs = state.runs;
  const extra = ctx.simulateCombatRoomWithWorker({ ...reference.cases[0].params, parallel: true });
  const extraSettled = Promise.allSettled([extra]);
  await new Promise((r) => {
    setTimeout(r, 5);
  });
  assert.equal(state.runs, runs);
  assert.equal(ctx.getCombatConcurrencyState().active, 4);
  ctx.resetCombatSimulatorWorker(new Error("stop test"));
  assert.ok((await settled).every((r) => r.status === "rejected"));
  assert.equal((await extraSettled)[0].status, "rejected");
});

test("长任务按 4→6→9→14→16 扩容，卡顿降档后仍保存并放慢恢复", async () => {
  const storage = concurrencyStorage();
  const { ctx, state } = fixture({ storage });
  const timers = new Map();
  let id = 0;
  let clock = 1000;
  ctx.setTimeout = (fn, delay) => {
    timers.set(++id, { fn, delay });
    return id;
  };
  ctx.clearTimeout = (key) => timers.delete(key);
  ctx.window.performance = { now: () => clock };
  ctx.window.navigator = { hardwareConcurrency: 20, deviceMemory: 8 };
  await ctx.ensureCombatSimulatorWorker();
  state.silent = true;
  const pending = Promise.allSettled(
    Array.from({ length: 20 }, () => ctx.simulateCombatRoomWithWorker({ ...reference.cases[0].params, parallel: true }))
  );
  function tick(delay = 0) {
    const [key, timer] = [...timers].find(([, value]) => value.delay === 100);
    timers.delete(key);
    clock += 100 + delay;
    timer.fn();
  }
  try {
    // Cache fingerprints use asynchronous WebCrypto before entering the queue.
    for (let i = 0; i < 200 && ctx.getCombatConcurrencyState().queued !== 16; i++)
      await new Promise((resolve) => {
        setTimeout(resolve, 5);
      });
    assert.equal(ctx.getCombatConcurrencyState().active, 4);
    for (const expected of [6, 9, 14, 16]) {
      tick();
      tick();
      assert.ok(ctx.getCombatConcurrencyState().limit < expected);
      tick();
      assert.equal(ctx.getCombatConcurrencyState().limit, expected);
      assert.equal(ctx.getCombatConcurrencyState().active, expected);
    }
    assert.equal(ctx.getCombatConcurrencyState().ceiling, 16);
    assert.equal(storage.getItem(concurrencyStorageKey), null);
    tick(200);
    assert.equal(ctx.getCombatConcurrencyState().limit, 8);
    assert.equal(ctx.getCombatConcurrencyState().active, 16);
    assert.equal(JSON.parse(storage.getItem(concurrencyStorageKey)).limit, 8);
    // No replacement tasks after backoff until running jobs drain.
    for (let i = 0; i < 9; i++) tick();
    assert.equal(ctx.getCombatConcurrencyState().limit, 8);
    ctx.window.document = { hidden: true };
    for (let i = 0; i < 20; i++) tick();
    assert.equal(ctx.getCombatConcurrencyState().limit, 8);
    ctx.window.document.hidden = false;
    for (let i = 0; i < 10; i++) tick();
    assert.equal(ctx.getCombatConcurrencyState().limit, 12);
    // Recovery is still tentative until successful work validates it.
    assert.equal(JSON.parse(storage.getItem(concurrencyStorageKey)).limit, 8);
  } finally {
    ctx.resetCombatSimulatorWorker();
    assert.ok((await pending).every((item) => item.status === "rejected"));
    assert.equal(timers.size, 0);
  }
});

const concurrencyStorageKey = "mwi-labyrinth:combat-concurrency:v1";
function concurrencyStorage(initial) {
  const values = new Map(initial ? [[concurrencyStorageKey, initial]] : []);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
}
function savedConcurrency(limit, cores = 20, memory = 8) {
  return JSON.stringify({ schema: 1, profile: JSON.stringify([cores, memory]), limit });
}

test("并发偏好跨实例恢复，按设备配置隔离，坏记录回退且始终遵守硬上限", () => {
  const navigator = { hardwareConcurrency: 20, deviceMemory: 8 };
  const storage = concurrencyStorage(savedConcurrency(12));
  const { ctx } = fixture({ storage, navigator });
  assert.equal(ctx.getCombatConcurrencyState().limit, 12);
  ctx.resetCombatSimulatorWorker();
  assert.equal(ctx.getCombatConcurrencyState().limit, 12);
  ctx.window.navigator = { hardwareConcurrency: 8, deviceMemory: 8 };
  assert.equal(ctx.getCombatConcurrencyState().limit, 4);
  ctx.window.navigator = navigator;
  assert.equal(ctx.getCombatConcurrencyState().limit, 12);
  for (const invalid of [
    "{",
    "null",
    savedConcurrency(0),
    savedConcurrency(17),
    savedConcurrency(1.5),
    JSON.stringify({ schema: 2, profile: "[20,8]", limit: 12 }),
    savedConcurrency(12, 24)
  ]) {
    const next = fixture({ storage: concurrencyStorage(invalid), navigator }).ctx;
    assert.equal(next.getCombatConcurrencyState().limit, 4);
  }
  const low = fixture({
    storage: concurrencyStorage(savedConcurrency(16, 20, 4)),
    navigator: { hardwareConcurrency: 20, deviceMemory: 4 }
  }).ctx;
  assert.equal(low.getCombatConcurrencyState().limit, 2);
});

test("只记住已稳定完成的并发数，取消和释放线程不抹掉偏好", async () => {
  const storage = concurrencyStorage();
  const navigator = { hardwareConcurrency: 20, deviceMemory: 8 };
  const { ctx, state } = fixture({ storage, navigator });
  let clock = 1000;
  ctx.window.performance = { now: () => clock };
  ctx.window.document = { hidden: false };
  ctx.observeCombatResponsiveness(0);
  state.transform = (message) => {
    if (message.type === "result") clock += 200;
    return message;
  };
  try {
    await Promise.all(
      Array.from({ length: 80 }, (_, i) =>
        ctx.simulateCombatRoomWithWorker({
          ...reference.cases[i % reference.cases.length].params,
          trials: 1,
          parallel: true
        })
      )
    );
    const saved = JSON.parse(storage.getItem(concurrencyStorageKey));
    assert.ok(saved.limit >= 4 && saved.limit <= ctx.getCombatConcurrencyState().limit);
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    ctx.releaseIdleCombatWorkers();
    assert.equal(ctx.getCombatConcurrencyState().limit, saved.limit);
    ctx.resetCombatSimulatorWorker();
    assert.equal(ctx.getCombatConcurrencyState().limit, saved.limit);
    assert.equal(fixture({ storage, navigator }).ctx.getCombatConcurrencyState().limit, saved.limit);
  } finally {
    ctx.resetCombatSimulatorWorker();
  }
});

test("卡顿降档立即保存，后台不误降，Worker 故障后的下次启动采用较低并发", () => {
  const navigator = { hardwareConcurrency: 20, deviceMemory: 8 };
  const storage = concurrencyStorage(savedConcurrency(12));
  const { ctx } = fixture({ storage, navigator });
  ctx.observeCombatResponsiveness(500, true);
  assert.equal(JSON.parse(storage.getItem(concurrencyStorageKey)).limit, 12);
  ctx.observeCombatResponsiveness(500);
  assert.equal(JSON.parse(storage.getItem(concurrencyStorageKey)).limit, 6);
  ctx.resetCombatSimulatorWorker(new Error("worker failure"), { failed: true });
  assert.equal(JSON.parse(storage.getItem(concurrencyStorageKey)).limit, 3);
  assert.equal(ctx.getCombatConcurrencyState().limit, 3);
  ctx.resetCombatSimulatorWorker();
  assert.equal(fixture({ storage, navigator }).ctx.getCombatConcurrencyState().limit, 3);
});

test("浏览器禁止存储时计算仍可完成，当前页面仍记住降低后的并发", async () => {
  const storage = {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("full");
    }
  };
  const { ctx } = fixture({ storage, navigator: { hardwareConcurrency: 20, deviceMemory: 8 } });
  assert.equal(ctx.getCombatConcurrencyState().limit, 4);
  ctx.observeCombatResponsiveness(500);
  ctx.resetCombatSimulatorWorker();
  assert.equal(ctx.getCombatConcurrencyState().limit, 2);
  try {
    assert.equal((await ctx.simulateCombatRoomWithWorker(reference.cases[0].params)).trials, 17);
  } finally {
    ctx.resetCombatSimulatorWorker();
  }
});

test("跨页面恢复完整样本；只重算变更配装，游戏数据与账号隔离，清理不触碰展示", async () => {
  const disk = new Map();
  const cache = {
    get: async (key) => structuredClone(disk.get(key)),
    put: async (key, value) => disk.set(key, structuredClone(value)),
    clear: async () => {
      disk.clear();
      return true;
    }
  };
  const params = { ...reference.cases[0].params, reuseSimulation: true };
  const original = fixture({ cache });
  original.ctx.storageIdentity = () => "origin:owner";
  const expected = await original.ctx.simulateCombatRoomWithWorker(params);
  original.ctx.resetCombatSimulatorWorker();
  const next = fixture({ cache });
  const { ctx, state } = next;
  ctx.storageIdentity = () => "origin:owner";
  try {
    let progress = 0;
    assert.deepEqual(await ctx.simulateCombatRoomWithWorker(params, { add: (n) => (progress += n) }), expected);
    assert.equal(progress, params.trials);
    assert.equal(state.runs, 0);
    assert.equal(state.created, 0);
    const changed = { ...params, playerDto: { ...params.playerDto, rangedLevel: 105 } };
    await ctx.simulateCombatRoomWithWorker(changed);
    assert.equal(state.runs, 1);
    assert.deepEqual(await ctx.simulateCombatRoomWithWorker(params), expected);
    assert.equal(state.runs, 1);
    ctx.cachedInitClientDataRaw += " ";
    await ctx.simulateCombatRoomWithWorker(params);
    assert.equal(state.runs, 2);
    assert.equal(state.created, 2, "updated game data reinitializes the worker");
    ctx.storageIdentity = () => "other-owner";
    await ctx.simulateCombatRoomWithWorker(params);
    assert.equal(state.runs, 3);
    ctx.automationRecommendByRoomTypeKey = new Map([["room", { levelDelta: 5 }]]);
    ctx.manualUpdateRunning = true;
    assert.equal(await ctx.clearSimulationCache(), false);
    ctx.manualUpdateRunning = false;
    assert.equal(await ctx.clearSimulationCache(), true);
    assert.equal(disk.size, 0);
    assert.equal(ctx.automationRecommendByRoomTypeKey.get("room").levelDelta, 5);
    await ctx.simulateCombatRoomWithWorker(params);
    assert.equal(state.runs, 4);
  } finally {
    ctx.resetCombatSimulatorWorker();
  }
});

test("损坏的持久化样本回退重算；读取期间取消不派发、不写缓存", async () => {
  let stored, release;
  const cache = {
    get: async () => stored,
    put: async (_key, value) => {
      stored = structuredClone(value);
    },
    clear: async () => true
  };
  const { ctx, state } = fixture({ cache });
  ctx.storageIdentity = () => "owner";
  const params = { ...reference.cases[0].params, reuseSimulation: true };
  try {
    await ctx.simulateCombatRoomWithWorker(params);
    stored.completedTrials = 0;
    ctx.resetCombatSimulatorWorker();
    await ctx.simulateCombatRoomWithWorker(params);
    assert.equal(state.runs, 2);
    assert.equal(stored.completedTrials, params.trials);
    ctx.resetCombatSimulatorWorker();
    cache.get = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    const pending = ctx.simulateCombatRoomWithWorker(params);
    while (!release)
      await new Promise((resolve) => {
        setTimeout(resolve, 5);
      });
    ctx.resetCombatSimulatorWorker();
    release(null);
    await assert.rejects(pending, /取消/);
    assert.equal(state.runs, 2);
  } finally {
    ctx.resetCombatSimulatorWorker();
  }
});

test("单槽 Worker 报错只重建出错线程并有限重试，不中断其余任务与缓存，重试进度不重复累加", async () => {
  const { ctx, state } = fixture();
  ctx.window.navigator = { hardwareConcurrency: 8, deviceMemory: 8 };
  const targetTrials = 25;
  let crashedRequestId = null;
  state.transform = (message) => {
    if (message.type === "progress" && message.target === targetTrials && message.completed === 10) {
      if (crashedRequestId === null) {
        crashedRequestId = message.id;
        return { type: "error", id: message.id, error: "模拟单槽瞬时故障" };
      }
    }
    return message;
  };
  try {
    // Warm memory cache with case 0 to verify slot failure does not wipe completed cache.
    const cachedParams = { ...reference.cases[0].params, reuseSimulation: true, parallel: true };
    const cachedResult = await ctx.simulateCombatRoomWithWorker(cachedParams);
    const runsAfterWarm = state.runs;
    const progressByJob = [0, 0, 0, 0];
    const batchParams = reference.cases.slice(1, 5).map((row, idx) => ({
      ...row.params,
      trials: idx === 0 ? targetTrials : row.params.trials,
      reuseSimulation: true,
      parallel: true
    }));
    const jobs = batchParams.map((p, idx) =>
      ctx.simulateCombatRoomWithWorker(p, {
        add(n) {
          assert.ok(n > 0);
          progressByJob[idx] += n;
        }
      })
    );
    const results = await Promise.all(jobs);
    assert.notEqual(crashedRequestId, null);
    assert.equal(results.length, 4);
    for (let i = 0; i < 4; i++) {
      assert.equal(results[i].trials, batchParams[i].trials);
      assert.equal(progressByJob[i], batchParams[i].trials);
    }
    // Only the single crashed slot worker was terminated; memory cache stayed intact.
    assert.equal(state.stopped, 1);
    const runsBeforeReuse = state.runs;
    assert.deepEqual(await ctx.simulateCombatRoomWithWorker(cachedParams), cachedResult);
    assert.equal(state.runs, runsBeforeReuse);
    assert.equal(runsBeforeReuse, runsAfterWarm + 5, "4 jobs + 1 retry");
  } finally {
    ctx.resetCombatSimulatorWorker();
  }
});

test("重试耗尽后仅失败任务报错，其余并发与排队任务继续完成", async () => {
  const { ctx, state } = fixture();
  ctx.window.navigator = { hardwareConcurrency: 8, deviceMemory: 8 };
  ctx.COMBAT_JOB_MAX_RETRIES = 1;
  // Trigger failure only on one specific trial count so other jobs succeed cleanly.
  const failingTrials = 19;
  const failedRequestIds = new Set();
  state.transform = (message) => {
    if (message.type === "progress" && message.target === failingTrials) {
      failedRequestIds.add(message.id);
      return { type: "error", id: message.id, error: "持续故障" };
    }
    return message;
  };
  try {
    const params = reference.cases.slice(0, 6).map((row, idx) => ({
      ...row.params,
      trials: idx === 1 ? failingTrials : row.params.trials,
      reuseSimulation: false,
      parallel: true
    }));
    const settled = await Promise.allSettled(params.map((p) => ctx.simulateCombatRoomWithWorker(p)));
    assert.equal(settled[1].status, "rejected");
    assert.match(settled[1].reason.message, /持续故障/);
    assert.equal(failedRequestIds.size, 2, "failed once initially and once on retry");
    assert.equal(state.stopped, 2, "only the failing slot worker was rebuilt twice");
    for (const i of [0, 2, 3, 4, 5]) {
      assert.equal(settled[i].status, "fulfilled", `job ${i} must succeed`);
      assert.equal(settled[i].value.trials, reference.cases[i].params.trials);
    }
  } finally {
    ctx.resetCombatSimulatorWorker();
  }
});

test("新模拟结果不等缓存落盘即返回，清理缓存等待后台写入完成避免竞态", async () => {
  const disk = new Map();
  let releasePut = null;
  let clearedAfterPut = false;
  const cache = {
    get: async (key) => structuredClone(disk.get(key)),
    put: (key, value) =>
      new Promise((resolve) => {
        releasePut = () => {
          disk.set(key, structuredClone(value));
          resolve(null);
        };
      }),
    flush: async () => {},
    clear: async () => {
      clearedAfterPut = disk.size > 0;
      disk.clear();
      return true;
    }
  };
  const { ctx } = fixture({ cache });
  ctx.storageIdentity = () => "owner";
  const params = { ...reference.cases[0].params, reuseSimulation: true };
  try {
    const result = await ctx.simulateCombatRoomWithWorker(params);
    assert.equal(result.trials, params.trials);
    assert.equal(disk.size, 0, "result returned before slow persistent put resolved");
    assert.equal(typeof releasePut, "function");
    const clearing = ctx.clearSimulationCache();
    releasePut();
    assert.equal(await clearing, true);
    assert.equal(clearedAfterPut, true, "clear waited for pending background put");
    assert.equal(disk.size, 0);
  } finally {
    ctx.resetCombatSimulatorWorker();
  }
});
