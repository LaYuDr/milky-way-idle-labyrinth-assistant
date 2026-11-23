const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function fixture(count = 8) {
  const root = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/calculator/controller.js"), "utf8"), root);
  const rooms = Array.from({ length: count }, (_, id) => ({ roomType: "combat", id }));
  const state = { characterLabyrinth: { roomData: [rooms] } };
  const cells = rooms.map(() => ({}));
  const saved = new Map(),
    pending = [];
  let completed = 0,
    finished = 0;
  let stale = false;
  const ctx = {
    window: { crypto: require("node:crypto").webcrypto },
    LABYRINTH_COMBAT_ROOM_TYPE: "combat",
    LABYRINTH_SKILLING_ROOM_TYPE: "skill",
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
    getCombatUpgradeOptions: () => [],
    getCombatParallelism: () => 4,
    createProgressTracker(total) {
      assert.equal(total, count * 3000);
      return { add: (n) => (completed += n), finish: () => finished++ };
    },
    setControlStatus() {},
    isRoomResultDisplayable: () => true,
    upsertBadge() {},
    updateRoomEstimate() {},
    clearCellSkillingPreview() {},
    buildCombatPreview: () => null,
    clearCellCombatPreview() {},
    saveRoomResult: (_state, key, result) => saved.set(key, result),
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
    }
  };
  root.MwiLabyrinthCalculatorModules.controller(ctx);
  return {
    ctx,
    pending,
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

test("一个房间失败后停止派发，等在途任务结束再报错，可重新计算", async () => {
  const f = fixture();
  let settled = false;
  const run = f.ctx.updateRoomBadges({ snapshot: f.snapshot });
  const rejected = assert.rejects(run, /test failure/).then(() => (settled = true));
  f.pending[0].reject(new Error("test failure"));
  await flush();
  assert.equal(settled, false);
  for (const task of f.pending.slice(1)) task.resolve();
  await rejected;
  assert.equal(f.pending.length, 4);
  assert.equal(f.saved.size, 0);
  assert.equal(f.counts().finished, 0);
  const retry = f.ctx.updateRoomBadges({ snapshot: f.snapshot });
  for (let i = 4; i < 12; i++) {
    f.pending[i].resolve();
    await flush();
  }
  assert.equal(await retry, true);
  assert.equal(f.saved.size, 8);
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
