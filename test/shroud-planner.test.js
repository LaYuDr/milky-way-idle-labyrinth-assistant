const test = require("node:test");
const assert = require("node:assert/strict");
const { plan, neighbors } = require("../src/core.js");
const shrouds = require("../src/runtime/shrouds.js");
function board(n) {
  const cells = Array.from({ length: n * n }, () => ({
    type: "challenge",
    revealed: false,
    visited: false,
    passable: true,
    forceChance: 1,
    label: "Lv.100"
  }));
  cells[0] = { ...cells[0], type: "start", revealed: true, visited: true, entered: true };
  cells.at(-1).type = "exit";
  return { size: n, cells, forcePlanningEnabled: true, shroudCount: 3, shroudInfoKnown: true };
}
function block(b, ids) {
  for (const id of ids) Object.assign(b.cells[id], { passable: false, revealed: true });
  return b;
}
function valid(b, r) {
  assert.ok(r);
  assert.equal(r.path[0], r.source);
  assert.equal(b.cells[r.source].revealed, true);
  assert.equal(b.cells[r.source].passable, true);
  assert.equal(r.path.at(-1), b.cells.length - 1);
  for (let i = 1; i < r.path.length; i++) assert.ok(neighbors(r.path[i - 1], b.size).includes(r.path[i]));
  assert.equal(r.cost, new Set(r.path.slice(1).filter((id) => !b.cells[id].visited && !b.cells[id].entered)).size);
  assert.deepEqual(r.forcedRooms, [...new Set(r.path.filter((id) => b.cells[id].passable === false))]);
}
test("有普通路线即不耗道具，选中的红房不能绕过这条规则", () => {
  const b = block(board(4), [1]);
  const normal = plan(b);
  assert.equal(normal.main.forceCount, 0);
  assert.equal(normal.breakthrough, null);
  b.queue = [1];
  const selected = plan(b);
  assert.deepEqual(selected.main, normal.main);
  assert.equal(selected.breakthrough, null);
});
test("堵死后少用道具，再选最少新格，同成本优先道具成功率", () => {
  const b = block(board(3), [1, 3]);
  b.cells[1].forceChance = 0.5;
  const result = plan(b);
  valid(b, result.main);
  assert.equal(result.main.forceCount, 1);
  assert.deepEqual(result.main.forcedRooms, [3]);
  assert.equal(result.main.cost, 4);
  assert.equal(result.main.forceSuccess, 1);
  b.cells[3].forceChance = 0;
  const risky = plan(b).main;
  assert.deepEqual(risky.forcedRooms, [1]);
  assert.equal(risky.forceSuccess, 0.5);
});
test("用过入口格不重复计步，次数不足给参考路线而非可执行主路", () => {
  const b = block(board(3), [1, 3]);
  b.cells[1].entered = true;
  const first = plan(b).main;
  assert.deepEqual(first.forcedRooms, [1]);
  assert.equal(first.cost, 3);
  b.shroudCount = 0;
  const empty = plan(b);
  assert.equal(empty.main, null);
  assert.equal(empty.forceStatus, "insufficient");
  valid(b, empty.breakthrough);
  b.shroudCount = null;
  assert.equal(plan(b).forceStatus, "unknown-count");
  b.cells[1].forceChance = b.cells[3].forceChance = 0;
  assert.equal(plan(b).breakthrough, null);
  assert.equal(plan(b).forceStatus, "ineligible");
});
test("两层障碍需两次，普通路线打通后停止推荐道具，队列不影响结果", () => {
  const b = block(board(4), [1, 4, 3, 6, 9, 12]);
  b.shroudCount = 1;
  assert.equal(plan(b).breakthrough.forceCount, 2);
  assert.equal(plan(b).main, null);
  b.shroudCount = 2;
  b.queue = [1];
  const forced = plan(b).main;
  valid(b, forced);
  const unqueued = plan({ ...b, queue: [] }).main;
  assert.deepEqual(forced, unqueued);
  assert.equal(forced.forceCount, 2);
  for (const id of forced.forcedRooms) {
    b.cells[id].revealed = b.cells[id].visited = b.cells[id].entered = true;
    b.cells[id].passable = true;
  }
  b.queue = [];
  b.shroudCount = 0;
  const next = plan(b, { previousMain: forced });
  assert.equal(next.main.forceCount, 0);
  assert.equal(next.breakthrough, null);
});
test("截图8×8：道具破局后仍能规划到出口", () => {
  const b = block(board(8), [5, 8, 11, 12, 17, 18]);
  for (const id of [0, 1, 2, 3, 4, 9, 10]) b.cells[id].revealed = b.cells[id].visited = b.cells[id].entered = true;
  const result = plan(b).main;
  valid(b, result);
  assert.equal(result.forceCount, 1);
  assert.equal(result.cost, 10);
  assert.ok([5, 12].includes(result.forcedRooms[0]));
});
test("小图独立穷举核对最少道具、最少新格与成功率", () => {
  let seed = 37;
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let k = 0; k < 60; k++) {
    const b = block(board(3), [1, 3]);
    b.shroudCount = 9;
    for (let id = 1; id < 8; id++) {
      b.cells[id].passable = id === 1 || id === 3 ? false : random() > 0.45;
      b.cells[id].forceChance = random() > 0.25 ? 1 : 0.5;
      b.cells[id].entered = random() < 0.3;
      b.cells[id].revealed = b.cells[id].passable === false || b.cells[id].entered;
    }
    let best = [Infinity, Infinity, -1];
    function walk(path, used, cost, chance) {
      const u = path.at(-1);
      if (u === 8) {
        if (used < best[0] || (used === best[0] && (cost < best[1] || (cost === best[1] && chance > best[2]))))
          best = [used, cost, chance];
        return;
      }
      for (const v of neighbors(u, 3))
        if (!path.includes(v))
          walk(
            [...path, v],
            used + (b.cells[v].passable === false ? 1 : 0),
            cost + (b.cells[v].entered ? 0 : 1),
            chance * (b.cells[v].passable === false ? b.cells[v].forceChance : 1)
          );
    }
    // Both entrance neighbors are blocked, so the entrance is the only valid origin.
    walk([0], 0, 0, 1);
    const r = plan(b).main;
    valid(b, r);
    assert.deepEqual([r.forceCount, r.cost, r.forceSuccess], best);
  }
});
test("道具适用等级、数量及 DOM 地图读取，不读取隐藏等级", () => {
  assert.equal(shrouds.success("/items/basic_shroud", 50), 1);
  assert.equal(shrouds.success("/items/basic_shroud", 75), 0.5);
  assert.equal(shrouds.success("/items/advanced_shroud", 150), 0);
  assert.equal(shrouds.success("/items/expert_shroud", 120), 1);
  assert.equal(shrouds.success("/items/unknown", 10), null);
  const b = board(3);
  b.cells[1].label = "";
  b.cells[1].revealed = false;
  b.cells[2].revealed = true;
  const state = {
    characterLabyrinth: {
      shroudCount: 2,
      shroudItemHrid: "/items/advanced_shroud",
      roomData: Array.from({ length: 3 }, () => Array(3).fill({ recommendedLevel: 1 }))
    }
  };
  shrouds.apply(b, state);
  assert.equal(b.shroudCount, 2);
  assert.equal(b.cells[1].forceChance, null);
  assert.equal(b.cells[2].forceChance, 1);
  state.characterLabyrinth.shroudCount = 0;
  shrouds.apply(b, state);
  assert.equal(b.shroudCount, 0);
  shrouds.apply(b, null);
  assert.equal(b.shroudCount, null);
  assert.equal(b.shroudInfoKnown, false);
});

test("孤立队列不能掩盖破局，打通前段后才提供普通续接", () => {
  const b = block(board(3), [1, 3]);
  b.queue = [7];
  const r = plan(b);
  assert.equal(r.main.source, 0);
  assert.equal(r.main.forceCount, 1);
  assert.ok(r.breakthrough);
  b.queue = [3, 6, 7];
  assert.equal(plan(b).main.forceCount, 1);
  Object.assign(b.cells[3], { visited: true, entered: true, revealed: true, passable: true });
  const opened = plan(b);
  assert.equal(opened.main.source, 7);
  assert.equal(opened.main.cost, 1);
  assert.equal(opened.breakthrough, null);
});
