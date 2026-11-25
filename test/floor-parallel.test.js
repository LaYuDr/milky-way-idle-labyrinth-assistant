const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function fixture(count = 8, { upgrades = [] } = {}) {
  const root = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/calculator/controller.js"), "utf8"), root);
  const rooms = Array.from({ length: count }, (_, id) => ({
    roomType: "combat",
    id,
    monsterHrid: `/monsters/m${id}`
  }));
  const state = { characterLabyrinth: { roomData: [rooms] } };
  const cells = rooms.map(() => ({}));
  const saved = new Map(),
    badges = new Map(),
    previews = new Map(),
    statuses = [],
    pending = [],
    pendingUpgrades = [];
  let completed = 0,
    finished = 0;
  let stale = false;
  const activeUpgradeCount = upgrades.filter((u) => u.cost !== null).length;
  const ctx = {
    window: { crypto: require("node:crypto").webcrypto },
    LABYRINTH_COMBAT_ROOM_TYPE: "combat",
    LABYRINTH_SKILLING_ROOM_TYPE: "skill",
    COMBAT_STAT_UPGRADES: upgrades.map((u) => ({ key: u.key, zh: u.zh || u.key, en: u.en || u.key })),
    isChineseUi: () => true,
    ensureStyle() {},
    hidePreviewTooltip() {},
    t: (key) => key,
    getGameState: () => state,
    getLabyrinthDisplaySignature: () => "floor",
    findRoomGridCells: () => cells,
    ensureControlPanel() {},
    saveCombatSimTrialsSetting: (value) => value,
    getSelectedCombatSimTrials: () => 3000,
    getInitClientData: () => ({}),
    buildMaxEnhancementByItem: () => ({}),
    getLabyrinthUpgradeLevels: () => ({}),
    getCombatUpgradeOptions: () => upgrades,
    getCombatParallelism: () => 4,
    createProgressTracker(total) {
      assert.equal(total, count * 3000 * (1 + activeUpgradeCount));
      return { add: (n) => (completed += n), finish: () => finished++ };
    },
    setControlStatus(status) {
      statuses.push(status);
    },
    isRoomResultDisplayable: () => true,
    upsertBadge(cell, clearChance) {
      badges.set(cell, clearChance);
    },
    removeBadge(cell) {
      badges.delete(cell);
    },
    updateRoomEstimate() {},
    clearRoomEstimate() {},
    clearCellSkillingPreview() {},
    buildCombatPreview: (_state, room, _data, result) => ({
      type: "combat",
      monsterHrid: room.monsterHrid,
      clearChance: result?.clearChance,
      upgradeImpact: result?.upgradeImpact
    }),
    setCellCombatPreview(cell, preview) {
      previews.set(cell, preview);
    },
    clearCellCombatPreview(cell) {
      previews.delete(cell);
    },
    saveRoomResult: (_state, key, result) => saved.set(key, structuredClone(result)),
    nextFrame: async () => {},
    buildLabyrinthCalcDoneMessage: () => "done",
    computeCombatRoomClearChance(_state, _data, room, _items, tracker, trials, key, options) {
      assert.equal(options.parallel, true);
      assert.equal(trials, 3000);
      return new Promise((resolve, reject) => {
        pending.push({
          id: room.id,
          key,
          reject,
          resolve() {
            tracker.add(trials);
            resolve({ clearChance: room.id / 10 });
          }
        });
      });
    },
    computeCombatRoomUpgradeImpact(_state, _data, room, _items, tracker, trials, key, options) {
      assert.equal(options.parallel, true);
      assert.equal(options.tolerateUpgradeErrors, true);
      return new Promise((resolve, reject) => {
        pendingUpgrades.push({
          id: room.id,
          key,
          reject,
          resolve(outcome) {
            tracker.add(trials * activeUpgradeCount);
            resolve(
              outcome || {
                upgradeImpact: Object.fromEntries(
                  upgrades.map((u) => [u.key, { level: u.level, cost: u.cost, clearChance: room.id / 10 + 0.05 }])
                ),
                failedUpgrades: []
              }
            );
          }
        });
      });
    }
  };
  root.MwiLabyrinthCalculatorModules.controller(ctx);
  return {
    ctx,
    cells,
    badges,
    previews,
    statuses,
    pending,
    pendingUpgrades,
    saved,
    snapshot: { state, isStale: () => stale },
    cancel: () => (stale = true),
    counts: () => ({ completed, finished })
  };
}
const flush = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

test("地图房间有界并行、乱序完成不串格，全部收齐后才结束", async () => {
  const f = fixture();
  const run = f.ctx.updateRoomBadges({ snapshot: f.snapshot });
  assert.equal(f.pending.length, 4);
  f.pending[2].resolve();
  await flush();
  assert.equal(f.saved.get("2,0").clearChance, 0.2);
  assert.equal(f.pending.length, 5);
  assert.equal(f.counts().finished, 0);
  for (let i = 0; i < 8; i++) {
    if (i !== 2) f.pending[i].resolve();
    await flush();
  }
  assert.equal(await run, true);
  assert.equal(f.saved.size, 8);
  for (let i = 0; i < 8; i++) assert.equal(f.saved.get(`${i},0`).clearChance, i / 10);
  assert.deepEqual(f.counts(), { completed: 24000, finished: 1 });
});

test("单个房间失败不拖停其余房间，其余结果正常保存并明确列出失败项，可重新计算", async (t) => {
  t.mock.method(console, "error", () => {});
  const f = fixture();
  const run = f.ctx.updateRoomBadges({ snapshot: f.snapshot });
  f.pending[0].reject(new Error("test failure"));
  await flush();
  assert.equal(f.pending.length, 5, "remaining rooms continue dispatching after a single failure");
  for (let i = 1; i < 8; i++) {
    f.pending[i].resolve();
    await flush();
  }
  assert.equal(await run, true);
  assert.equal(f.saved.size, 7);
  assert.equal(f.saved.has("0,0"), false);
  for (let i = 1; i < 8; i++) assert.equal(f.saved.get(`${i},0`).clearChance, i / 10);
  assert.equal(f.ctx.lastLabyrinthCalcHadFailures, true);
  assert.equal(f.ctx.lastLabyrinthCalcFailedItems.length, 1);
  assert.match(f.ctx.lastLabyrinthCalcDoneMessage, /m0 \(0,0\)/);
  assert.match(f.ctx.lastLabyrinthCalcDoneMessage, /test failure/);
  assert.equal(f.statuses.at(-1).error, true);
  assert.deepEqual(f.counts(), { completed: 24000, finished: 1 });

  const retry = f.ctx.updateRoomBadges({ snapshot: f.snapshot });
  for (let i = 8; i < 16; i++) {
    f.pending[i].resolve();
    await flush();
  }
  assert.equal(await retry, true);
  assert.equal(f.ctx.lastLabyrinthCalcHadFailures, false);
  assert.equal(f.saved.size, 8);
});

test("先完成全图基础胜率并立即可见，再补齐战斗升级收益；单项升级失败不清空胜率并列出失败项", async (t) => {
  t.mock.method(console, "error", () => {});
  const upgrades = [
    { key: "/labyrinth_upgrades/combat_damage", buff: "dmg", level: 1, cost: 80, zh: "战斗伤害" },
    { key: "/labyrinth_upgrades/attack_speed", buff: "spd", level: 2, cost: 120, zh: "攻击速度" }
  ];
  const f = fixture(4, { upgrades });
  const run = f.ctx.updateRoomBadges({ snapshot: f.snapshot });
  assert.equal(f.pending.length, 4);
  assert.equal(f.pendingUpgrades.length, 0, "no upgrade sims before base rooms finish");
  // Resolve first 3 base rooms: badges and base previews appear immediately while room 4 is still running.
  for (let i = 0; i < 3; i++) {
    f.pending[i].resolve();
    await flush();
    assert.equal(f.badges.get(f.cells[i]), i / 10);
    assert.equal(f.previews.get(f.cells[i]).upgradeImpact, undefined);
    assert.equal(f.pendingUpgrades.length, 0, "upgrades wait until all base win rates are shown");
  }
  f.pending[3].resolve();
  await flush();
  assert.equal(f.badges.size, 4, "all base room win rates displayed before Phase 2 starts");
  assert.equal(f.pendingUpgrades.length, 4, "Phase 2 dispatches upgrade sims after Phase 1 completes");
  // Room 0 has one failed upgrade and one succeeded upgrade; base badge stays intact.
  f.pendingUpgrades[0].resolve({
    upgradeImpact: {
      "/labyrinth_upgrades/combat_damage": { level: 1, cost: 80, clearChance: 0.15, experiencePerHour: 100 },
      "/labyrinth_upgrades/attack_speed": { level: 2, cost: 120, clearChance: null, experiencePerHour: null }
    },
    failedUpgrades: [{ key: "/labyrinth_upgrades/attack_speed", error: new Error("升级模拟超时") }]
  });
  for (let i = 1; i < 4; i++) f.pendingUpgrades[i].resolve();
  await flush();
  assert.equal(await run, true);
  assert.equal(f.badges.get(f.cells[0]), 0);
  assert.equal(f.previews.get(f.cells[0]).upgradeImpact["/labyrinth_upgrades/combat_damage"].clearChance, 0.15);
  assert.equal(f.saved.get("2,0").upgradeImpact["/labyrinth_upgrades/attack_speed"].clearChance, 0.25);
  assert.equal(f.ctx.lastLabyrinthCalcHadFailures, true);
  assert.match(f.ctx.lastLabyrinthCalcDoneMessage, /m0 \(0,0\) 升级收益\[攻击速度\]/);
  assert.match(f.ctx.lastLabyrinthCalcDoneMessage, /升级模拟超时/);
  assert.equal(f.counts().completed, 4 * 3000 * 3);
  assert.equal(f.counts().finished, 1);
});

test("换层取消时不保存旧结果、不派发剩余房间", async () => {
  const f = fixture();
  const run = f.ctx.updateRoomBadges({ snapshot: f.snapshot });
  f.cancel();
  for (const task of f.pending) task.resolve();
  assert.equal(await run, false);
  assert.equal(f.pending.length, 4);
  assert.equal(f.saved.size, 0);
  assert.equal(f.counts().finished, 0);
});
