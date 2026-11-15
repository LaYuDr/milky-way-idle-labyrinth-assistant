const test = require("node:test");
const assert = require("node:assert/strict");
const { plan, neighbors, scoreRoute } = require("../src/core.js");
const shrouds = require("../src/runtime/shrouds.js");
const fixture = require("./fixtures/isolated-origin.json");
function screenshot(fixture = require("./fixtures/isolated-origin.json")) {
  const cells = Array.from({ length: fixture.size ** 2 }, () => ({
    type: "unknown",
    revealed: false,
    visited: false,
    passable: null
  }));
  for (const id of fixture.cleared) Object.assign(cells[id], { revealed: true, visited: true, passable: true });
  for (const [kind, passable] of [
    ["white", true],
    ["red", false]
  ])
    for (const [id, level] of Object.entries(fixture[kind]))
      Object.assign(cells[id], { type: "challenge", revealed: true, passable, label: `Lv.${level}` });
  for (const id of fixture.treasures) Object.assign(cells[id], { type: "treasure", revealed: true, passable: true });
  cells[0].type = "start";
  Object.assign(cells.at(-1), { type: "exit", passable: true });
  return { size: fixture.size, cells };
}
function applyShrouds(b, count, item = "/items/expert_shroud") {
  shrouds.apply(b, {
    characterLabyrinth: {
      roomData: Array.from({ length: b.size }, () => Array(b.size).fill(null)),
      shroudItemHrid: item,
      shroudCount: count
    }
  });
}
test("用户截图：已通关区域外围全红，孤立冲泡房不能给出普通出口", () => {
  const b = screenshot();
  const boundary = new Set(fixture.cleared.flatMap((id) => neighbors(id, b.size)));
  for (const id of fixture.cleared) boundary.delete(id);
  assert.ok([...boundary].every((id) => b.cells[id].passable === false));
  assert.equal(plan(b).main, null);
  assert.deepEqual(plan(b).treasures, []);
  for (const queue of [[29], [29, 30, 31, 39, 47, 55, 63], [61, 62, 63]]) {
    b.queue = queue;
    assert.equal(plan(b).main, null);
  }
});
test("用户截图：道具数量和适用等级决定破局建议，不能跳过最先的红房", () => {
  const b = screenshot();
  applyShrouds(b, 1);
  const r = plan(b);
  assert.equal(r.main.forceCount, 1);
  assert.deepEqual(r.main.forcedRooms, [61]);
  assert.deepEqual(r.main.newCells, [61, 62, 63]);
  assert.equal(r.main.cost, 3);
  assert.ok(fixture.cleared.includes(r.main.source));
  assert.equal(r.main.forceSuccess, 1);
  for (let i = 1; i < r.main.path.length; i++)
    assert.ok(neighbors(r.main.path[i - 1], b.size).includes(r.main.path[i]));
  applyShrouds(b, 0);
  assert.equal(plan(b).main, null);
  assert.equal(plan(b).forceStatus, "insufficient");
  assert.deepEqual(plan(b).breakthrough.forcedRooms, [61]);
  applyShrouds(b, 1, "/items/basic_shroud");
  assert.equal(plan(b).main, null);
  assert.equal(plan(b).breakthrough, null);
  assert.equal(plan(b).forceStatus, "ineligible");
  shrouds.apply(b, null);
  assert.equal(plan(b).forceStatus, "unknown-item");
});
test("用户截图：连接打通才可续接，变红、取消和失败都不留下旧起点", () => {
  const b = screenshot();
  applyShrouds(b, 1);
  b.cells[61].passable = true;
  assert.equal(plan(b).main.source, 61);
  assert.equal(plan(b).main.cost, 2);
  assert.equal(plan(b).breakthrough, null);
  b.cells[61].passable = false;
  b.cells[61].entered = true;
  b.queue = [61, 62, 63];
  const failed = plan(b);
  assert.equal(failed.main.forceCount, 1);
  assert.deepEqual(failed.main.forcedRooms, [61]);
  assert.equal(failed.main.cost, 2); // Torch already spent, obstacle still requires a shroud.
  Object.assign(b.cells[61], { passable: true, visited: true });
  assert.deepEqual(plan(b).main.path, [63]);
  b.queue = [];
  assert.equal(plan(b).main.cost, 2);
  assert.equal(plan(b).breakthrough, null);
});

const continuation = require("./fixtures/queue-continuation.json");
test("四张截图：探索收益包括队列前段，不能把总覆盖 33 改成 30 或 32", () => {
  const b = screenshot(continuation);
  const first = plan({ ...b, queue: continuation.initialQueue }).main;
  assert.deepEqual(first.path, continuation.initialPath);
  assert.equal(first.opportunityReach, 33);
  assert.equal(scoreRoute(b, [...continuation.queues[1], ...continuation.oldSuffixes[1]]).opportunityReach, 30);
  assert.equal(scoreRoute(b, [...continuation.queues[2], ...continuation.oldSuffixes[2]]).opportunityReach, 32);
  for (const queue of continuation.queues.slice(0, 3)) {
    const r = plan({ ...b, queue }).main;
    assert.deepEqual(r.path, first.path.slice(queue.length - 1));
    assert.equal(r.opportunityReach, 33);
    assert.equal(r.cost, first.cost - queue.length + 1);
  }
  const branch = plan({ ...b, queue: continuation.queues[3] }).main;
  assert.equal(branch.source, 25);
  assert.equal(branch.cost, 5);
  assert.equal(branch.opportunityReach, 31);
});
test("沿截图原路线逐格或成批入队，仅缩短剩余路线；低搜索预算仍保留最少新格", () => {
  const b = screenshot(continuation),
    full = continuation.initialPath;
  for (const maxStates of [1, 20000]) {
    let previous = full;
    for (let count = 1; count <= full.length; count++) {
      const r = plan({ ...b, queue: full.slice(0, count) }, { maxStates, preferredPath: previous }).main;
      assert.deepEqual(r.path, full.slice(count - 1));
      assert.equal(r.cost, full.length - count);
      assert.equal(r.opportunityReach, 33);
      previous = r.path;
    }
  }
  const queue = full.slice(0, 5);
  b.cells[31].passable = false;
  const r = plan({ ...b, queue }, { preferredPath: full }).main;
  assert.ok(!r.path.includes(31));
  assert.equal(r.cost, 6);
  assert.deepEqual(plan({ ...b, queue: [] }, { preferredPath: r.path }).main, plan(b).main);
});

const whiteOrigin = require("./fixtures/queued-white-origin.json");
test("新截图：只选 Lv.90 起点不会再免费跳到 Lv.80 蘑菇房，重载也正确", () => {
  const b = screenshot(whiteOrigin);
  const first = plan(b).main;
  assert.deepEqual(first.path, whiteOrigin.initialPath);
  assert.equal(first.cost, 3);
  b.queue = [39];
  for (const options of [{}, { preferredPath: first.path }, { maxStates: 1, preferredPath: first.path }]) {
    const r = plan(b, options).main;
    assert.deepEqual(r.path, first.path);
    assert.equal(r.cost, 3);
    assert.equal(r.opportunityReach, 10);
  }
  b.queue = [39, 40];
  assert.deepEqual(plan(b, { preferredPath: first.path }).main.path, [40, 41, 48]);
  assert.equal(plan(b).main.cost, 2);
  b.queue = [39, 33]; // Choosing the other branch explicitly makes it a valid continuation.
  assert.equal(plan(b).main.source, 33);
  b.queue = [];
  assert.deepEqual(plan(b).main, first);
});
test("续接需经过未入队白房时实际计费，宝箱支线不能漏算这间白房", () => {
  const b = screenshot(whiteOrigin);
  b.queue = [39];
  Object.assign(b.cells[40], { type: "challenge", revealed: true, passable: false });
  Object.assign(b.cells[46], { type: "challenge", revealed: true, passable: false });
  const r = plan(b, { preferredPath: whiteOrigin.initialPath }).main;
  assert.ok(r.path.includes(33));
  assert.ok(r.newCells.includes(33));
  assert.equal(r.cost, 4);
  assert.notEqual(r.source, 33);
  Object.assign(b.cells[34], { type: "treasure", revealed: true, passable: true });
  Object.assign(b.cells[41], { type: "challenge", revealed: true, passable: false });
  const treasure = plan(b).treasures.find((route) => route.target === 34);
  assert.ok(treasure);
  assert.equal(treasure.cost, 2);
  assert.ok(treasure.newCells.includes(33));
});
