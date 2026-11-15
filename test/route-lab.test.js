const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../tools/harness/route-lab/model.js");
const core = require("../src/core.js");
test("回划截断路线，快速拖动交叉也不产生重复格，统计回退", () => {
  const s = M.preset("blank", 5),
    b = M.board(s);
  const original = [0, 1, 2, 7, 12];
  assert.deepEqual(M.drawTo(s.board, original, 1), [0, 1]);
  assert.deepEqual(M.drawTo(s.board, original, 0), [0]);
  assert.deepEqual(M.drawTo(s.board, original, 12), original);
  const back = M.drawTo(s.board, original, 7);
  assert.equal(M.measure(b, back).moves, 3);
  assert.equal(M.measure(b, back).cost, 3);
  assert.ok(M.measure(b, back).newRevealed < M.measure(b, original).newRevealed);
  assert.deepEqual(M.drawTo(s.board, back, 8), [0, 1, 2, 7, 8]);
  assert.deepEqual(M.drawTo(s.board, [0, 1, 2, 7, 6, 5], 8), [0, 1, 2, 7, 8]);
  assert.deepEqual(original, [0, 1, 2, 7, 12]);
  s.board.cells[8].passable = false;
  assert.throws(() => M.drawTo(s.board, back, 9), /不能通过/);
  assert.throws(() => M.drawTo(s.board, back, 13), /上下左右/);
});
test("实验台原图两条路线与插件覆盖口径一致", () => {
  const s = M.preset("original"),
    b = M.board(s);
  const results = s.routes.map((r) => {
    const m = M.measure(b, r.path),
      score = core.scoreRoute(b, r.path);
    assert.equal(m.newRevealed, score.newRevealed);
    assert.equal(m.extraOpportunity, score.extraOpportunity);
    assert.equal(m.opportunityReach, score.opportunityReach);
    assert.equal(m.cost, 14);
    assert.equal(m.complete, true);
    return m;
  });
  assert.deepEqual(
    results.map((m) => m.total),
    [36, 38]
  );
  assert.deepEqual(
    results.map((m) => m.opportunityReach + m.known.size),
    [51, 48]
  );
});
test("实验台复现88级比89级多耗一格", () => {
  const s = M.preset("shortcut"),
    b = M.board(s);
  assert.deepEqual(
    s.routes.map((r) => M.measure(b, r.path).cost),
    [11, 10]
  );
});
test("重复进入只增加移动数，不增加首次成本、揭示和宝箱数", () => {
  const s = M.preset("blank", 5);
  s.board.cells[1] = { type: "treasure", visited: false, revealed: true, passable: true };
  const b = M.board(s),
    a = M.measure(b, [0, 1]),
    z = M.measure(b, [0, 1, 0, 1]);
  assert.equal(z.cost, 1);
  assert.equal(z.moves, 3);
  assert.equal(z.revisits, 2);
  assert.equal(z.treasures, 1);
  assert.equal(z.newRevealed, a.newRevealed);
});
test("已通关四邻作为基线，回放新增数非负，终点才算完成", () => {
  const s = M.preset("original"),
    b = M.board(s),
    r = s.routes[0].path;
  assert.equal(M.measure(b, [0]).newRevealed, 0);
  for (let i = 1; i < r.length; i++)
    assert.ok(M.measure(b, r.slice(0, i + 1)).newRevealed >= M.measure(b, r.slice(0, i)).newRevealed);
  assert.equal(M.measure(b, r.slice(0, -1)).complete, false);
});
test("障碍和跳跃明确无效，导入拒绝错尺寸与越界路径", () => {
  const s = M.preset("blank", 5);
  s.board.cells[1].passable = false;
  assert.match(M.measure(M.board(s), [0, 1]).issues.join(), /不能通过/);
  assert.match(M.measure(M.board(s), [0, 12]).issues.join(), /跳跃/);
  const copy = M.validate(s);
  assert.notEqual(copy.board, s.board);
  s.routes[0].path = [0, 12];
  assert.throws(() => M.validate(s), /不相邻/);
  assert.throws(() => M.blank(30), /5–20/);
});
test("生成独立实验台不包含游戏桥接或占位代码", async () => {
  const { outputs } = await import("../tools/build.mjs");
  const html = outputs()["route-lab.html"];
  assert.ok(html.startsWith("<!doctype html>"));
  assert.doesNotMatch(html, /CORE_SOURCE|MODEL_SOURCE|APP_SOURCE|GM_xmlhttpRequest|WebSocket|characterLabyrinth/);
  assert.match(html, /MwiRouteLab/);
});
