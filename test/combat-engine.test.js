const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const zlib = require("node:zlib");
const { webcrypto, createHash } = require("node:crypto");
const source = fs.readFileSync(path.join(__dirname, "../src/calculator/combat-engine.js"), "utf8");
const reference = require("./fixtures/combat-engine-reference.json");
function fixture() {
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
  vm.runInNewContext(source, sandbox);
  const ctx = {
    window: { crypto: webcrypto },
    combatWorkerPendingRequests: new Map(),
    combatWorkerRequestId: 0,
    setTimeout,
    clearTimeout,
    listen: (target, name, handler) => target.addEventListener(name, handler),
    finiteNumber: (n, fallback) => (Number.isFinite(Number(n)) ? Number(n) : fallback),
    deepCloneJson: (v) => JSON.parse(JSON.stringify(v)),
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
    [16, 8, 8],
    [32, 32, 16],
    [18, 32, 16],
    [32, undefined, 8],
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
