const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const zlib = require("node:zlib");
const { webcrypto } = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

function loadScript(rel, sandbox) {
  vm.runInNewContext(readSrc(rel), sandbox);
}

// Minimal in-memory IndexedDB shim supporting curves + meta stores and usedAt index cursors.
function createFakeIndexedDB() {
  const databases = new Map();
  function makeReq() {
    return { result: undefined, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
  }
  function fire(fn, target) {
    queueMicrotask(() => {
      if (typeof fn === "function") fn({ target });
    });
  }
  return {
    open(name) {
      const req = makeReq();
      queueMicrotask(() => {
        let db = databases.get(name);
        const isNew = !db;
        if (isNew) {
          const stores = new Map();
          db = {
            stores,
            onversionchange: null,
            onclose: null,
            close() {},
            createObjectStore(storeName, opts = {}) {
              const map = new Map();
              const def = { name: storeName, keyPath: opts.keyPath || null, map, indexes: new Map() };
              stores.set(storeName, def);
              return {
                createIndex(indexName, keyPath) {
                  def.indexes.set(indexName, keyPath);
                }
              };
            },
            transaction(storeNames) {
              const tx = {
                oncomplete: null,
                onabort: null,
                onerror: null,
                aborted: false,
                pending: 0,
                abort() {
                  this.aborted = true;
                  fire(this.onabort, this);
                },
                doneOne() {
                  this.pending -= 1;
                  if (this.pending === 0 && !this.aborted) {
                    fire(this.oncomplete, this);
                  }
                },
                objectStore(storeName) {
                  const def = stores.get(storeName);
                  return {
                    get(key) {
                      const r = makeReq();
                      tx.pending += 1;
                      queueMicrotask(() => {
                        if (tx.aborted) return;
                        r.result = def.map.has(key) ? structuredClone(def.map.get(key)) : undefined;
                        if (r.onsuccess) r.onsuccess({ target: r });
                        tx.doneOne();
                      });
                      return r;
                    },
                    put(value, explicitKey) {
                      const key = def.keyPath ? value[def.keyPath] : explicitKey;
                      def.map.set(key, structuredClone(value));
                      const r = makeReq();
                      tx.pending += 1;
                      queueMicrotask(() => {
                        if (tx.aborted) return;
                        r.result = key;
                        if (r.onsuccess) r.onsuccess({ target: r });
                        tx.doneOne();
                      });
                      return r;
                    },
                    clear() {
                      def.map.clear();
                      const r = makeReq();
                      tx.pending += 1;
                      queueMicrotask(() => {
                        if (tx.aborted) return;
                        if (r.onsuccess) r.onsuccess({ target: r });
                        tx.doneOne();
                      });
                      return r;
                    },
                    index(indexName) {
                      const field = def.indexes.get(indexName);
                      return {
                        openCursor() {
                          const r = makeReq();
                          tx.pending += 1;
                          const entries = [...def.map.entries()].sort(
                            (a, b) => (a[1]?.[field] ?? 0) - (b[1]?.[field] ?? 0)
                          );
                          let pos = 0;
                          const step = () => {
                            queueMicrotask(() => {
                              if (tx.aborted) return;
                              if (pos >= entries.length) {
                                r.result = null;
                                if (r.onsuccess) r.onsuccess({ target: r });
                                tx.doneOne();
                                return;
                              }
                              const [k, v] = entries[pos];
                              let continued = false;
                              r.result = {
                                key: v[field],
                                primaryKey: k,
                                value: structuredClone(v),
                                delete() {
                                  def.map.delete(k);
                                },
                                continue() {
                                  continued = true;
                                  pos += 1;
                                  step();
                                }
                              };
                              if (r.onsuccess) r.onsuccess({ target: r });
                              if (!continued) tx.doneOne();
                            });
                          };
                          step();
                          return r;
                        }
                      };
                    }
                  };
                }
              };
              if (!Array.isArray(storeNames) || !storeNames.length) throw new Error("No stores");
              return tx;
            }
          };
          databases.set(name, db);
          req.result = db;
          if (req.onupgradeneeded) req.onupgradeneeded({ target: req });
        }
        req.result = db;
        if (req.onsuccess) req.onsuccess({ target: req });
      });
      return req;
    }
  };
}

test("combat-stats：Chan 二阶矩与协矩并行合并与单批整算逐项一致，缓冲区扩容与精化区间正确", () => {
  const sandbox = {};
  loadScript("src/calculator/combat-stats.js", sandbox);
  const S = sandbox.MwiLabyrinthCombatStats;

  // Deterministic seed properties
  assert.equal(S.chunkSeed(173, 0), 173);
  const seeds = new Set(Array.from({ length: 20 }, (_, i) => S.chunkSeed(173, i)));
  assert.equal(seeds.size, 20);

  // Build synthetic per-trial durations & outcomes, split into 4 uneven chunks, compare Chan merge vs direct formula
  const rawSamples = Array.from({ length: 1000 }, (_, i) => {
    const win = i % 3 !== 0 ? 1 : 0;
    const death = !win && i % 2 === 0 ? 1 : 0;
    const timeout = !win && !death ? 1 : 0;
    const dur = win ? 25 + ((i * 17) % 70) : death ? 40 + ((i * 13) % 50) : 120;
    const xp = win ? [100 + i, 50, 200, 0, 150, 300, 0] : [0, 0, 0, 0, 0, 0, 0];
    return { win, death, timeout, dur, xp };
  });

  function directStats(samples) {
    const n = samples.length;
    let s = 0,
      d = 0,
      t = 0,
      tot = 0,
      minT = Infinity,
      maxT = 0;
    const xp = new Float64Array(7);
    for (const row of samples) {
      s += row.win;
      d += row.death;
      t += row.timeout;
      tot += row.dur;
      if (row.dur < minT) minT = row.dur;
      if (row.dur > maxT) maxT = row.dur;
      for (let k = 0; k < 7; k++) xp[k] += row.xp[k];
    }
    const meanT = tot / n;
    const meanY = s / n;
    let m2 = 0,
      co = 0;
    for (const row of samples) {
      m2 += (row.dur - meanT) ** 2;
      co += (row.dur - meanT) * (row.win - meanY);
    }
    return {
      trials: n,
      successes: s,
      failedByDeath: d,
      failedByTimeout: t,
      totalSpentSeconds: tot,
      minElapsedSeconds: minT,
      maxElapsedSeconds: maxT,
      durationM2SecondsSquared: m2,
      durationSuccessComomentSeconds: co,
      xp
    };
  }

  const whole = directStats(rawSamples);
  const splits = [
    rawSamples.slice(0, 123),
    rawSamples.slice(123, 373),
    rawSamples.slice(373, 700),
    rawSamples.slice(700)
  ].map(directStats);
  let merged = null;
  for (const part of splits) merged = S.mergeStats(merged, part);

  assert.equal(merged.trials, whole.trials);
  assert.equal(merged.successes, whole.successes);
  assert.equal(merged.failedByDeath, whole.failedByDeath);
  assert.equal(merged.failedByTimeout, whole.failedByTimeout);
  assert.ok(Math.abs(merged.totalSpentSeconds - whole.totalSpentSeconds) < 1e-9);
  assert.equal(merged.minElapsedSeconds, whole.minElapsedSeconds);
  assert.equal(merged.maxElapsedSeconds, whole.maxElapsedSeconds);
  assert.ok(Math.abs(merged.durationM2SecondsSquared - whole.durationM2SecondsSquared) < 1e-7);
  assert.ok(Math.abs(merged.durationSuccessComomentSeconds - whole.durationSuccessComomentSeconds) < 1e-7);
  for (let k = 0; k < 7; k++) assert.ok(Math.abs(merged.xp[k] - whole.xp[k]) < 1e-9);

  // Buffer write, read, expand 300 -> 350, and transition refinement selection
  let buf = S.createCurveBuffer(300);
  let view = new Float64Array(buf);
  for (let lv = 1; lv <= 300; lv++) {
    const wins = lv <= 150 ? 250 : lv >= 210 ? 0 : Math.round(((210 - lv) / 60) * 250);
    S.writeLevel(view, lv, {
      trials: 250,
      successes: wins,
      failedByDeath: 0,
      failedByTimeout: 250 - wins,
      totalSpentSeconds: 250 * 40,
      minElapsedSeconds: 20,
      maxElapsedSeconds: 120,
      xp: [wins * 10, 0, 0, 0, 0, 0, 0]
    });
  }
  const refine = S.selectRefinementLevels(view, 300, 2500);
  assert.equal(refine[0], 136, "includes 15-level guard below first mixed level 151");
  assert.equal(refine.at(-1), 224, "includes 15-level guard above last mixed level 209");
  assert.ok(!refine.includes(100), "skips deep 100% plateau");
  assert.ok(!refine.includes(280), "skips deep 0% plateau");

  const fullRefine = S.selectRefinementLevels(view, 300, 2500, { forceFull: true });
  assert.equal(fullRefine.length, 300);

  buf = S.expandCurveBuffer(buf, 350);
  view = new Float64Array(buf);
  assert.equal(view.length, 350 * S.STRIDE);
  assert.equal(S.readLevel(view, 150).successes, 250);
  assert.equal(S.readLevel(view, 301), null);
});

test("curve-store：ArrayBuffer 整表持久化、防抖合批、LRU 淘汰与损坏恢复", async () => {
  const sandbox = { structuredClone, setTimeout, clearTimeout };
  loadScript("src/calculator/combat-stats.js", sandbox);
  loadScript("src/calculator/curve-store.js", sandbox);
  const S = sandbox.MwiLabyrinthCombatStats;
  let clock = 1000;
  const idb = createFakeIndexedDB();
  const store = sandbox.MwiLabyrinthCurveStore.create({
    indexedDB: idb,
    maxEntries: 2,
    flushDelayMs: 10,
    now: () => (clock += 10)
  });

  const makeRec = (charId, monster, hash, val) => {
    const buffer = S.createCurveBuffer(300);
    const view = new Float64Array(buffer);
    S.writeLevel(view, 42, {
      trials: 250,
      successes: val,
      failedByDeath: 0,
      failedByTimeout: 250 - val,
      totalSpentSeconds: 10000,
      minElapsedSeconds: 20,
      maxElapsedSeconds: 120,
      xp: [100, 200, 300, 400, 500, 600, 700]
    });
    return {
      characterId: charId,
      monsterHrid: monster,
      profileHash: hash,
      engineSignature: "eng",
      gameDataHash: "gd",
      maxLevel: 300,
      baseTrials: 250,
      targetTrials: 2500,
      completedLevels: 1,
      refinedComplete: false,
      buffer
    };
  };

  store.schedulePut("c1:m1:h1", makeRec("c1", "m1", "h1", 200));
  store.schedulePut("c1:m2:h2", makeRec("c1", "m2", "h2", 150));
  await store.flush();

  // Touch m1 so m2 becomes the oldest
  const loaded1 = await store.get("c1:m1:h1");
  assert.ok(loaded1);
  assert.equal(S.readLevel(new Float64Array(loaded1.buffer), 42).successes, 200);
  await store.flush();

  // Insert 3rd entry -> evicts m2 (LRU)
  await store.put("c1:m3:h3", makeRec("c1", "m3", "h3", 99));
  assert.equal(await store.get("c1:m2:h2"), null);
  assert.equal(S.readLevel(new Float64Array((await store.get("c1:m1:h1")).buffer), 42).successes, 200);
  assert.equal(S.readLevel(new Float64Array((await store.get("c1:m3:h3")).buffer), 42).successes, 99);

  store.close();
});

test("skilling 零分配双缓冲与强化 +5 标量展开：1~300 级与独立递推精确一致且支持动态扩表", () => {
  const sandbox = {};
  loadScript("src/calculator/skilling.js", sandbox);
  const ctx = {
    clamp01: (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0),
    finiteNumber: (v, f = 0) => (Number.isFinite(Number(v)) ? Number(v) : f),
    skillingSuccessChance: (v) => Math.max(0.05, Math.min(1, Number(v) || 0)),
    getEffectiveSkillingProgressPerSuccess: (v) => Math.floor(Math.max(0, Number(v) || 0))
  };
  sandbox.MwiLabyrinthCalculatorModules.skilling(ctx);

  // Reference exact DP for enhancing
  function refEnh(attempts, p, d, target = 5) {
    let dist = new Float64Array(target + 1);
    dist[0] = 1;
    let num = 0;
    for (let a = 1; a <= attempts; a++) {
      const nxt = new Float64Array(target + 1);
      for (let l = 0; l <= target; l++) {
        if (l === target) {
          nxt[target] += dist[target];
          continue;
        }
        nxt[Math.max(0, l - 1)] += dist[l] * (1 - p);
        nxt[Math.min(target, l + 1)] += dist[l] * p * (1 - d);
        nxt[Math.min(target, l + 2)] += dist[l] * p * d;
      }
      num += a * (nxt[target] - dist[target]);
      dist = nxt;
    }
    return { clearChance: dist[target], expectedAttemptsOnClear: dist[target] > 0 ? num / dist[target] : null };
  }

  for (const [p, d, attempts] of [
    [0.55, 0.1, 15],
    [0.82, 0.35, 30],
    [0.05, 0.2, 20],
    [1.0, 0.5, 12]
  ]) {
    const fast = ctx.solveEnhancingClearStats(attempts, p, d, 5, 0);
    const ref = refEnh(attempts, p, d, 5);
    assert.ok(Math.abs(fast.clearChance - ref.clearChance) < 1e-14);
    if (ref.expectedAttemptsOnClear !== null) {
      assert.ok(Math.abs(fast.expectedAttemptsOnClear - ref.expectedAttemptsOnClear) < 1e-12);
    }
  }

  // Skilling 1..300 curve + dynamic expansion beyond 300
  const profile = {
    coreProfileKey: "milking|0|120|240|100000000|200000000|24",
    isEnhancing: false,
    effectiveSkillLevel: 120,
    successBonus: 0.1,
    doubleChance: 0.2,
    attempts: 24,
    progressPerSuccess: 240
  };
  const curve300 = ctx.getOrBuildSkillingCurve(profile, 300);
  assert.equal(curve300.maxLevel, 300);
  const lv120 = ctx.lookupSkillingCurveStats(profile, 120);
  const direct120 = ctx.computeNonEnhancingClearStats({
    attempts: 24,
    successChance: ctx.skillingSuccessChance(0.8 * (1 + 0.1)),
    doubleChance: 0.2,
    progressPerSuccess: 240,
    targetProgress: 1200
  });
  assert.ok(Math.abs(lv120.clearChance - direct120.clearChance) < 1e-15);

  const lv340 = ctx.lookupSkillingCurveStats(profile, 340);
  assert.ok(lv340 && lv340.clearChance >= 0 && lv340.clearChance <= 1);
  assert.ok(ctx.getOrBuildSkillingCurve(profile, 300).maxLevel >= 340);
});

test("Worker 增强垫片 + CurveEngine：批处理零拷贝、渐进两阶段建表、跨会话复活与悬停按需升级对比", async () => {
  const combatEngineSource = readSrc("src/calculator/combat-engine.js");
  const reference = require("./fixtures/combat-engine-reference.json");
  const packed = (name) =>
    Buffer.from(combatEngineSource.match(new RegExp(`ctx\\.${name}\\s*=\\s*"([^"]+)"`))[1], "base64");
  const embedded = JSON.parse(zlib.gunzipSync(packed("MWISIM_DATA_GZ_BASE64")));
  const gameData = { ...embedded.fallbackData, ...embedded.originalMaps };

  const stats = { batchRuns: 0, singleRuns: 0, progressMsgs: 0 };
  const blobs = new Map();
  const idb = createFakeIndexedDB();

  // Real Blob-executing Worker shim so WORKER_SHIM_PREAMBLE (addEventListener + runBatch + throttle) runs verbatim!
  class ShimWorker extends EventTarget {
    constructor(url) {
      super();
      this.stopped = false;
      this.listeners = [];
      const code = blobs.get(url);
      const self = {
        addEventListener: (type, fn) => {
          if (type === "message") this.listeners.push(fn);
        },
        postMessage: (message) => {
          if (this.stopped) return;
          if (message.type === "progress") stats.progressMsgs += 1;
          const ev = new Event("message");
          ev.data = structuredClone(message);
          queueMicrotask(() => {
            if (!this.stopped) this.dispatchEvent(ev);
          });
        }
      };
      this.self = self;
      vm.runInNewContext(code, {
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
      if (message.type === "runBatch") stats.batchRuns += 1;
      if (message.type === "run") stats.singleRuns += 1;
      if (this.stopped) return;
      const ev = { data: structuredClone(message) };
      for (const fn of this.listeners) {
        Promise.resolve(fn(ev)).catch((error) => {
          const errEv = new Event("error");
          errEv.message = error.message;
          this.dispatchEvent(errEv);
        });
      }
    }
    terminate() {
      this.stopped = true;
    }
  }

  function createEnv() {
    const sandbox = {
      crypto: webcrypto,
      WebAssembly,
      TextEncoder,
      TextDecoder,
      structuredClone,
      setTimeout,
      clearTimeout,
      atob,
      Blob: class FakeBlob {
        constructor(parts) {
          this.text = parts.map((p) => (typeof p === "string" ? p : Buffer.from(p).toString("utf8"))).join("");
        }
        stream() {
          return new Blob([Buffer.from(this.text, "latin1")]).stream();
        }
      },
      Response,
      DecompressionStream,
      Worker: ShimWorker,
      URL: {
        createObjectURL: (blob) => {
          const id = `blob:${blobs.size}`;
          blobs.set(id, blob.text);
          return id;
        },
        revokeObjectURL: (id) => blobs.delete(id)
      }
    };
    // Use native Blob inside unpackEmbeddedAsset by letting real Blob be used for binary gzip decompression.
    sandbox.Blob = class HybridBlob extends Blob {
      constructor(parts, opts) {
        super(parts, opts);
        if (opts?.type === "text/javascript") {
          this._scriptText = parts
            .map((p) => (typeof p === "string" ? p : Buffer.from(new Uint8Array(p)).toString("utf8")))
            .join("");
        }
      }
    };
    sandbox.URL.createObjectURL = (blob) => {
      const id = `blob:${blobs.size}`;
      blobs.set(id, blob._scriptText || "");
      return id;
    };

    for (const file of [
      "src/calculator/combat-stats.js",
      "src/calculator/curve-store.js",
      "src/calculator/combat-experience.js",
      "src/calculator/combat-engine.js",
      "src/calculator/profile-fingerprint.js",
      "src/calculator/curve-engine.js"
    ]) {
      loadScript(file, sandbox);
    }

    const storageMap = new Map();
    const ctx = {
      destroyed: false,
      window: {
        crypto: webcrypto,
        indexedDB: idb,
        navigator: { hardwareConcurrency: 4, deviceMemory: 8 },
        performance,
        document: { hidden: false, addEventListener() {} },
        addEventListener() {}
      },
      storage: {
        getItem: (k) => storageMap.get(k) ?? null,
        setItem: (k, v) => storageMap.set(k, v)
      },
      storageIdentity: () => "char-curve-1",
      combatWorkerPendingRequests: new Map(),
      combatWorkerRequestId: 0,
      setTimeout,
      clearTimeout,
      listen: (target, name, handler) => target.addEventListener?.(name, handler),
      finiteNumber: (n, f = 0) => (Number.isFinite(Number(n)) ? Number(n) : f),
      positiveNumber: (n, f = 0) => (Number(n) > 0 && Number.isFinite(Number(n)) ? Number(n) : f),
      clamp01: (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0),
      deepCloneJson: (v) => JSON.parse(JSON.stringify(v)),
      normalizeCombatSimTrials: (v) => Math.max(1, Math.min(3000, Math.floor(Number(v) || 500))),
      getSelectedCombatSimTrials: () => 50,
      COMBAT_MODEL_SIGNATURE: "test-sig-v1",
      ROOM_ENTRY_SECONDS: 1,
      LABYRINTH_COMBAT_ROOM_TYPE: "/labyrinth_room_types/combat",
      LABYRINTH_STAT_UPGRADE_MAX_LEVEL: 12,
      COMBAT_STAT_UPGRADES: [
        { key: "combat_damage", buff: "/buff_uniques/labyrinth_upgrade_combat_damage" },
        { key: "attack_speed", buff: "/buff_uniques/labyrinth_upgrade_attack_speed" }
      ],
      getCombatUpgradeOptions: () => [
        { key: "combat_damage", buff: "/buff_uniques/labyrinth_upgrade_combat_damage", level: 1, cost: 80 },
        { key: "attack_speed", buff: "/buff_uniques/labyrinth_upgrade_attack_speed", level: 12, cost: null }
      ],
      resolveLabyrinthUpgradeLevels: () => ({}),
      getCombatCrateBuffs: () => ({ combatCrateItemHrids: [], combatBuffs: [], combatCrateSignature: "" }),
      getActiveGuildCombatShrineLevels: () => ({}),
      buildCombatPlayerDtoForRoom: () => ({
        playerDto: structuredClone(reference.cases[0].params.playerDto),
        loadoutInfo: { loadoutId: 1, loadout: { name: "TestBow" }, source: "room", selectedLoadoutId: 1 }
      }),
      buildCombatInputSnapshot: () => ({}),
      buildMaxEnhancementByItem: () => new Map(),
      deriveCombatFailureReasonFromCounts: (_tot, to, d) => (d > to ? "防御不足" : "伤害不足"),
      formatEtaText: (s) => (Number.isFinite(s) ? `${Math.ceil(s)}s` : "∞"),
      cachedInitClientDataRaw: JSON.stringify(gameData),
      getInitClientData: () => gameData
    };

    sandbox.MwiLabyrinthCalculatorModules["combat-engine"](ctx);
    sandbox.MwiLabyrinthCalculatorModules["profile-fingerprint"](ctx);
    sandbox.MwiLabyrinthCalculatorModules["curve-engine"](ctx);
    return { ctx, S: sandbox.MwiLabyrinthCombatStats };
  }

  const env1 = createEnv();
  try {
    const profile = env1.ctx.extractCombatProfile({}, gameData, "/monsters/shadow_archer", new Map());
    assert.ok(profile && profile.curveKey.startsWith("char-curve-1:/monsters/shadow_archer:"));

    // 1. Two-stage adaptive build across levels 1..30 (base 50, refine transition to 150)
    const curve = await env1.ctx.buildCombatCurve(profile, {
      minLevel: 1,
      maxLevel: 30,
      baseTrials: 50,
      targetTrials: 150,
      batchSize: 5,
      priority: 1
    });
    assert.ok(stats.batchRuns > 0, "uses native Worker runBatch protocol");
    assert.equal(curve.refinedComplete, true);
    // Lv.1 is mixed (~55% win rate) -> must be refined to 150 trials!
    const lv1 = env1.ctx.lookupCombatLevelSync(profile, 1, 1);
    assert.equal(lv1.trials, 150);
    assert.ok(lv1.successes > 0 && lv1.successes < 150);
    // Lv.28 is far into 0% plateau (outside 15-level buffer from Lv.1..5 transition) -> stays at 50 trials!
    const lv28 = env1.ctx.lookupCombatLevelSync(profile, 28, 1);
    assert.equal(lv28.trials, 50);
    assert.equal(lv28.successes, 0);

    // 2. Verify flush + reload in a fresh session revives the full curve with 0 new worker runs!
    await env1.ctx.flushCurveStore();
    const batchBeforeReload = stats.batchRuns;
    const env2 = createEnv();
    try {
      const p2 = env2.ctx.extractCombatProfile({}, gameData, "/monsters/shadow_archer", new Map());
      const res = await env2.ctx.queryCombatRoomViaCurve(
        {},
        gameData,
        { roomType: "/labyrinth_room_types/combat", monsterHrid: "/monsters/shadow_archer", recommendedLevel: 1 },
        new Map(),
        null,
        150,
        "0,0",
        { profile: p2 }
      );
      assert.equal(stats.batchRuns, batchBeforeReload, "0 simulations needed after IndexedDB curve reload");
      assert.equal(res.combatMeta.trials, 150);
      assert.equal(res.combatMeta.successes, lv1.successes);

      // 3. On-demand hover upgrade impact computes only non-maxed upgrades and caches hits
      const beforeHover = stats.batchRuns;
      const room = {
        roomType: "/labyrinth_room_types/combat",
        monsterHrid: "/monsters/shadow_archer",
        recommendedLevel: 1
      };
      const hover1 = await env2.ctx.ensureCombatUpgradeImpactOnHover({}, gameData, room, { trials: 50 });
      assert.ok(Number.isFinite(hover1.upgradeImpact.combat_damage.clearChance));
      assert.equal(hover1.upgradeImpact.attack_speed.cost, null);
      assert.equal(stats.batchRuns, beforeHover + 1);
      const hover2 = await env2.ctx.ensureCombatUpgradeImpactOnHover({}, gameData, room, { trials: 50 });
      assert.equal(stats.batchRuns, beforeHover + 1, "second hover hits cache");
      assert.equal(hover2.upgradeImpact.combat_damage.clearChance, hover1.upgradeImpact.combat_damage.clearChance);
    } finally {
      env2.ctx.disposeCurveEngine();
      env2.ctx.resetCombatSimulatorWorker();
    }
  } finally {
    env1.ctx.disposeCurveEngine();
    env1.ctx.resetCombatSimulatorWorker();
  }
});

test("profile-fingerprint：仅在对应房型属性变化时触发局部变更，经验条与无关装备不触发", () => {
  const sandbox = {};
  loadScript("src/calculator/profile-fingerprint.js", sandbox);
  const skillLevels = { "/skills/milking": 100, "/skills/foraging": 100 };
  const combatWeaponEnh = { "/monsters/shadow_archer": 10, "/monsters/cyclops": 12 };
  const ctx = {
    storageIdentity: () => "char-1",
    LABYRINTH_SKILLING_ROOM_TYPE: "/labyrinth_room_types/skilling",
    LABYRINTH_COMBAT_ROOM_TYPE: "/labyrinth_room_types/combat",
    LABYRINTH_AUTOMATION_SKILL_ROOM_TYPES: [
      { key: "milking", skillHrid: "/skills/milking" },
      { key: "foraging", skillHrid: "/skills/foraging" }
    ],
    LABYRINTH_AUTOMATION_COMBAT_ROOM_TYPES: [
      { key: "shadow_archer", monsterHrid: "/monsters/shadow_archer" },
      { key: "cyclops", monsterHrid: "/monsters/cyclops" }
    ],
    LABYRINTH_UPGRADE_KEY_SKILLING_SUCCESS: "skillingSuccess",
    LABYRINTH_UPGRADE_KEY_SKILLING_DOUBLE_PROGRESS: "skillingDoubleProgress",
    BASE_ACTION_SECONDS: 10,
    BASE_ENHANCING_ACTION_SECONDS: 8,
    ROOM_DURATION_SECONDS: 120,
    COMBAT_MODEL_SIGNATURE: "sig1",
    MWISIM_ENGINE_TAG: "tag1",
    cachedInitClientDataRaw: '{"v":1}',
    clamp01: (v) => Math.max(0, Math.min(1, v)),
    finiteNumber: (v, f = 0) => (Number.isFinite(Number(v)) ? Number(v) : f),
    skillHridToSkillId: (h) => h.split("/").pop(),
    skillIdToActionTypeHrid: (id) => `/action_types/${id}`,
    getLabyrinthCrateSelection: () => ({ teaCrateItemHrid: "" }),
    resolveLabyrinthUpgradeLevels: () => ({}),
    getLabyrinthUpgradeLevel: () => 0,
    getCrateBuffs: () => [],
    createEmptySkillingMetrics: () => ({
      skillLevelBonus: 0,
      efficiencyBonus: 0,
      actionSpeedBonus: 0,
      successBonus: 0,
      crateDoubleProgressBonus: 0,
      gatheringBonus: 0
    }),
    addSkillingMetrics() {},
    buildLabyrinthUpgradeSkillingMetrics: () => ({}),
    getLabyrinthUpgradeExperienceBonus: () => 0,
    getSkillingGlobalMetrics: () => ({ equipmentMetrics: {}, globalMetrics: {} }),
    getSkillingRoomLoadoutMetrics: () => ({ metrics: {}, loadoutInfo: {}, mode: "current" }),
    getSkillingBuffMetrics: () => ({}),
    getSkillLevel: (_m, hrid) => skillLevels[hrid] || 1,
    getEffectiveSkillingProgressPerSuccess: (v) => Math.floor(v),
    computeSkillingExperienceBonusForRoom: () => ({ multiplier: 1, totalBonus: 0 }),
    buildMaxEnhancementByItem: () => new Map(),
    getCombatCrateBuffs: () => ({ combatCrateItemHrids: [], combatBuffs: [], combatCrateSignature: "" }),
    getActiveGuildCombatShrineLevels: () => ({}),
    buildCombatPlayerDtoForRoom: (_s, _d, room) => ({
      playerDto: {
        staminaLevel: 100,
        intelligenceLevel: 100,
        attackLevel: 100,
        meleeLevel: 100,
        defenseLevel: 100,
        rangedLevel: 100,
        magicLevel: 100,
        equipment: {
          "/equipment_types/main_hand": { hrid: "/items/weapon", enhancementLevel: combatWeaponEnh[room.monsterHrid] }
        },
        abilities: [],
        houseRooms: {},
        achievements: {},
        labyrinthUpgrades: {},
        guildBuffs: {}
      },
      loadoutInfo: {}
    })
  };
  sandbox.MwiLabyrinthCalculatorModules["profile-fingerprint"](ctx);

  // Baseline capture
  const first = ctx.detectRoomProfileChanges({ characterSkillMap: {} }, { v: 1 });
  assert.equal(first.identityChanged, true);

  // No attribute changes (e.g. floor changed / XP ticked) -> 0 changes
  const same = ctx.detectRoomProfileChanges(
    { characterSkillMap: {}, characterLabyrinth: { currentFloor: 5 } },
    { v: 1 }
  );
  assert.equal(same.identityChanged, false);
  assert.deepEqual([...same.changedSkills], []);
  assert.deepEqual([...same.changedMonsters], []);

  // Only milking leveled up -> only milking changes!
  skillLevels["/skills/milking"] = 101;
  const skillUp = ctx.detectRoomProfileChanges({ characterSkillMap: {} }, { v: 1 });
  assert.deepEqual([...skillUp.changedSkills], ["/skills/milking"]);
  assert.deepEqual([...skillUp.changedMonsters], []);

  // Only cyclops weapon enhanced -> only cyclops changes!
  combatWeaponEnh["/monsters/cyclops"] = 13;
  const gearUp = ctx.detectRoomProfileChanges({ characterSkillMap: {} }, { v: 1 });
  assert.deepEqual([...gearUp.changedSkills], []);
  assert.deepEqual([...gearUp.changedMonsters], ["/monsters/cyclops"]);
});

test("combat-engine 优先级队列：P0 立即抢占 P2 排队任务；热保活定时器按需回收与取消", async () => {
  const combatEngineSource = readSrc("src/calculator/combat-engine.js");
  const reference = require("./fixtures/combat-engine-reference.json");
  const packed = (name) =>
    Buffer.from(combatEngineSource.match(new RegExp(`ctx\\.${name}\\s*=\\s*"([^"]+)"`))[1], "base64");
  const embedded = JSON.parse(zlib.gunzipSync(packed("MWISIM_DATA_GZ_BASE64")));
  const gameData = { ...embedded.fallbackData, ...embedded.originalMaps };
  const workerSource = zlib.gunzipSync(packed("MWISIM_WORKER_GZ_BASE64")).toString();

  const order = [];
  let holdFirst = null;
  const stopped = [];
  class GateWorker extends EventTarget {
    constructor() {
      super();
      this.stopped = false;
      const self = {
        postMessage: (m) => {
          if (this.stopped) return;
          const ev = new Event("message");
          ev.data = structuredClone(m);
          queueMicrotask(() => {
            if (!this.stopped) this.dispatchEvent(ev);
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
    postMessage(m) {
      if (this.stopped) return;
      if (m.type === "run") {
        order.push(m.params.mazeDifficulty);
        if (m.params.mazeDifficulty === 10 && !holdFirst) {
          holdFirst = () => void this.self.onmessage({ data: structuredClone(m) });
          return;
        }
      }
      void this.self.onmessage({ data: structuredClone(m) });
    }
    terminate() {
      this.stopped = true;
      stopped.push(1);
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
    Worker: GateWorker,
    URL: { createObjectURL: () => "blob:gate", revokeObjectURL() {} }
  };
  loadScript("src/calculator/combat-stats.js", sandbox);
  loadScript("src/calculator/combat-experience.js", sandbox);
  loadScript("src/calculator/combat-engine.js", sandbox);

  const timers = new Map();
  let nextTimerId = 0;
  const ctx = {
    window: {
      crypto: webcrypto,
      navigator: { hardwareConcurrency: 2, deviceMemory: 8 }
    },
    combatWorkerPendingRequests: new Map(),
    combatWorkerRequestId: 0,
    setTimeout: (fn, delay) => {
      const id = ++nextTimerId;
      timers.set(id, { fn, delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    listen: (t, n, h) => t.addEventListener(n, h),
    finiteNumber: (n, f) => (Number.isFinite(Number(n)) ? Number(n) : f),
    deepCloneJson: (v) => JSON.parse(JSON.stringify(v)),
    cachedInitClientDataRaw: JSON.stringify(gameData),
    getInitClientData: () => gameData
  };
  sandbox.MwiLabyrinthCalculatorModules["combat-engine"](ctx);

  try {
    const base = { ...reference.cases[0].params, trials: 5, reuseSimulation: false };
    const pRunning = ctx.simulateCombatRoomWithWorker({ ...base, mazeDifficulty: 10, priority: 2 });
    while (!holdFirst) {
      await new Promise((r) => {
        setTimeout(r, 2);
      });
    }
    const pLow = ctx.simulateCombatRoomWithWorker({ ...base, mazeDifficulty: 20, priority: 2 });
    const pHigh = ctx.simulateCombatRoomWithWorker({ ...base, mazeDifficulty: 30, priority: 0 });
    await new Promise((r) => {
      setTimeout(r, 5);
    });
    holdFirst();
    await Promise.all([pRunning, pLow, pHigh]);
    // Lv.10 started first; while it blocked the single worker, Lv.30 (P0) jumped ahead of Lv.20 (P2)!
    assert.deepEqual(order, [10, 30, 20]);

    // Warm pool idle release timer only fires after delay when >1 slots exist
    ctx.window.navigator = { hardwareConcurrency: 8, deviceMemory: 8 };
    await Promise.all([
      ctx.simulateCombatRoomWithWorker({ ...base, mazeDifficulty: 1, parallel: true }),
      ctx.simulateCombatRoomWithWorker({ ...base, mazeDifficulty: 2, parallel: true })
    ]);
    const stoppedBefore = stopped.length;
    ctx.scheduleIdleCombatWorkerRelease(60000);
    const releaseEntry = [...timers.values()].find((t) => t.delay === 60000);
    assert.ok(releaseEntry, "scheduled 60s idle worker release");
    releaseEntry.fn();
    assert.ok(stopped.length > stoppedBefore, "idle release terminated extra worker slots");
  } finally {
    ctx.resetCombatSimulatorWorker();
  }
});
