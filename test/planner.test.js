const test = require("node:test");
const assert = require("node:assert/strict");
const { plan, neighbors, scoreRoute } = require("../src/core.js");
function board(n) {
  const cells = Array.from({ length: n * n }, () => ({
    type: "unknown",
    revealed: false,
    visited: false,
    passable: null
  }));
  cells[0] = { type: "start", revealed: true, visited: true, passable: true };
  for (const id of neighbors(0, n)) cells[id] = { type: "challenge", revealed: true, visited: false, passable: true };
  cells.at(-1).type = "exit";
  cells.at(-1).passable = true;
  return { size: n, cells };
}
function clear(b, ids) {
  for (const id of ids) {
    Object.assign(b.cells[id], { visited: true, revealed: true, passable: true });
    for (const v of neighbors(id, b.size)) if (v !== b.cells.length - 1) b.cells[v].revealed = true;
  }
  return b;
}
// Independent fixed-point oracle; production expands each accepted room with a flood fill.
function eligibleOrigins(b, planned = new Set()) {
  let reached = new Set([0]);
  function extend(seeds) {
    reached = new Set([...reached, ...seeds]);
    let changed = true;
    while (changed) {
      changed = false;
      b.cells.forEach((c, id) => {
        if (c.visited && !reached.has(id) && neighbors(id, b.size).some((v) => reached.has(v))) {
          reached.add(id);
          changed = true;
        }
      });
    }
  }
  extend([]);
  for (const id of b.queue || [])
    if (
      Number.isInteger(id) &&
      b.cells[id]?.passable !== false &&
      b.cells[id] &&
      (reached.has(id) || neighbors(id, b.size).some((v) => reached.has(v)))
    ) {
      planned.add(id);
      extend([id]);
    }
  const hasPendingQueue = [...planned].some((id) => !b.cells[id].visited);
  return b.cells.flatMap((c, id) =>
    reached.has(id) ||
    (!hasPendingQueue &&
      c.type === "challenge" &&
      c.revealed &&
      c.passable === true &&
      neighbors(id, b.size).some((v) => reached.has(v)))
      ? [id]
      : []
  );
}
function valid(b, r) {
  assert.ok(r);
  assert.equal(r.path[0], r.source);
  assert.ok(eligibleOrigins(b).includes(r.source));
  assert.notEqual(b.cells[r.source].passable, false);
  for (let i = 1; i < r.path.length; i++) assert.ok(neighbors(r.path[i - 1], b.size).includes(r.path[i]));
  assert.equal(r.cost, new Set(r.path.slice(1).filter((id) => !b.cells[id].visited && !b.cells[id].entered)).size);
  assert.ok(r.path.every((id) => b.cells[id].passable !== false));
}
test("8×8：从已知房起步最低13新格，优先保留收获时继续探索的机会", () => {
  const b = board(8),
    r = plan(b).main;
  valid(b, r);
  assert.equal(r.cost, 13);
  assert.ok(r.opportunityReach >= 48);
  assert.equal(r.explorationOptimal, true);
});
test("利用全部已通关区域免费回头，避开明确障碍", () => {
  const b = clear(board(5), [1, 2, 3, 4, 9, 14, 19]);
  b.cells[18].passable = false;
  const r = plan(b).main;
  valid(b, r);
  assert.equal(r.cost, 1);
  assert.equal(r.next, 24);
});
test("入口被封闭，无路线，不穿过障碍", () => {
  const b = board(5);
  b.cells[1].passable = false;
  b.cells[5].passable = false;
  assert.equal(plan(b).main, null);
});
test("宝箱支线单独计费，未知或未确认房间不作为可达支线", () => {
  const b = board(5);
  b.cells[1].type = "treasure";
  b.cells[2] = { type: "treasure", visited: false, revealed: true, passable: true };
  b.cells[15] = { type: "treasure", visited: false, revealed: true, passable: true };
  const result = plan(b);
  assert.deepEqual(
    result.treasures.map((r) => [r.target, r.cost]),
    [
      [1, 1],
      [2, 2]
    ]
  );
  assert.equal(result.main.cost, 7);
  clear(b, [1]);
  const updated = plan(b);
  assert.ok(updated.main.path.includes(2));
  assert.ok(!updated.treasures.some((route) => route.target === 2));
});
test("出口已通关时成本为零；预算截断不伪称探索最优", () => {
  const b = clear(board(5), [1, 2, 3, 4, 9, 14, 19, 24]);
  assert.equal(plan(b).main.cost, 0);
  const large = board(15),
    r = plan(large, { maxStates: 1 }).main;
  valid(large, r);
  assert.equal(r.cost, 27);
  assert.equal(r.explorationOptimal, false);
});
test("非法地图、冲突状态和搜索上限明确报错", () => {
  assert.throws(() => plan({ size: 5, cells: [] }), /尺寸/);
  const b = board(5);
  b.cells[0].passable = false;
  assert.throws(() => plan(b), /冲突/);
  assert.throws(() => plan(board(5), { maxStates: 0 }), /上限/);
});
test("揭示数量使用集合去重，未知通行标明不确定", () => {
  const b = board(5),
    r = plan(b).main;
  const revealed = new Set();
  for (const id of r.path) for (const v of [id, ...neighbors(id, 5)]) if (!b.cells[v].revealed) revealed.add(v);
  assert.equal(r.newRevealed, revealed.size);
  assert.equal(r.uncertain, true);
});
test("动态封路重算，并能从已通关区域选择另一个出口方向", () => {
  const b = clear(board(5), [1, 5]);
  const first = plan(b).main;
  b.cells[first.next].passable = false;
  const next = plan(b).main;
  valid(b, next);
  assert.notEqual(next.next, first.next);
});
test("随机小图与独立穷举比较最少新格和最大揭示", () => {
  for (let seed = 1; seed <= 30; seed++) {
    const b = board(3);
    let random = seed;
    const rand = () => {
      random = (random * 1664525 + 1013904223) >>> 0;
      return random / 2 ** 32;
    };
    for (let id = 1; id < 8; id++) {
      if (rand() < 0.2) b.cells[id].passable = false;
      else if (rand() < 0.25) Object.assign(b.cells[id], { type: "challenge", revealed: true, passable: true });
    }
    b.queue = b.cells.flatMap((_, id) => (id > 0 && rand() < 0.2 ? [id] : []));
    let best = Infinity,
      gain = -1,
      opportunity = -1;
    const planned = new Set();
    const origins = eligibleOrigins(b, planned);
    function dfs(path, cost) {
      const u = path.at(-1);
      if (cost > best) return;
      if (u === 8) {
        const seen = new Set();
        for (const id of [...planned, ...path])
          for (const v of [id, ...neighbors(id, 3)]) if (!b.cells[v].revealed) seen.add(v);
        const potential = new Set(seen);
        for (const id of [...planned, ...path])
          for (const side of neighbors(id, 3)) {
            const c = b.cells[side];
            if (c.passable === false || c.visited || (c.revealed && !["unknown", "treasure"].includes(c.type)))
              continue;
            for (const outer of neighbors(side, 3)) if (!b.cells[outer].revealed) potential.add(outer);
          }
        if (
          cost < best ||
          (cost === best && (potential.size > opportunity || (potential.size === opportunity && seen.size > gain)))
        ) {
          best = cost;
          opportunity = potential.size;
          gain = seen.size;
        }
        return;
      }
      for (const v of neighbors(u, 3))
        if (!path.includes(v) && b.cells[v].passable !== false) dfs([...path, v], cost + (b.cells[v].visited ? 0 : 1));
    }
    for (const id of origins) dfs([id], 0);
    const r = plan(b).main;
    if (!Number.isFinite(best)) assert.equal(r, null);
    else {
      valid(b, r);
      assert.equal(r.cost, best);
      assert.equal(r.newRevealed, gain);
      assert.equal(r.opportunityReach, opportunity);
      assert.equal(r.explorationOptimal, true);
    }
  }
});

test("图片回归：上图少直接看两格，但一次收获支线可多触及三格", () => {
  const b = board(8);
  const upper = [0, 1, 2, 10, 18, 26, 34, 42, 43, 44, 45, 46, 54, 62, 63];
  const lower = [0, 1, 9, 17, 25, 33, 41, 49, 50, 51, 52, 53, 54, 55, 63];
  const a = scoreRoute(b, upper),
    z = scoreRoute(b, lower);
  assert.equal(a.newRevealed + 3, 36);
  assert.equal(z.newRevealed + 3, 38);
  assert.equal(a.opportunityReach + 3, 51);
  assert.equal(z.opportunityReach + 3, 48);
  assert.ok(a.opportunityReach > z.opportunityReach);
});
test("连通队列可以续接，断点、红房和取消不能留下孤立起点", () => {
  const b = board(6);
  const initial = plan(b).main;
  b.queue = [1, 7, 13, 19, 25, 31, 32, 33, 34];
  for (const maxStates of [1, 20000]) {
    const r = plan(b, { maxStates }).main;
    valid(b, r);
    assert.equal(r.source, 34);
    assert.equal(r.cost, 1);
  }
  b.queue.push(35);
  assert.deepEqual(plan(b).main.path, [35]);
  b.queue = [34, 35];
  assert.deepEqual(plan(b).main, initial);
  b.queue = [1, 7, 13, 19, 25, 31, 32, 33, 34];
  b.cells[13].passable = false;
  const interrupted = plan(b).main;
  valid(b, interrupted);
  assert.equal(interrupted.source, 7);
  assert.equal(interrupted.cost, 8);
  b.queue = [];
  assert.deepEqual(plan(b).main, plan({ ...b, queue: undefined }).main);
});

test("队列按先后连接，非法和重复编号不提供额外起点", () => {
  const b = board(5);
  b.queue = [6, 1]; // 6 is not attached yet when encountered.
  assert.deepEqual(plan(b).main, plan({ ...b, queue: [1] }).main);
  assert.notEqual(plan(b).main.source, 6);
  b.queue = [1, 6];
  const selected = plan(b).main;
  assert.equal(selected.source, 6);
  b.queue = [1, 1, 99, -1, "24", 6, 6];
  assert.deepEqual(plan(b).main, selected);
  b.queue = [1, 6, 5, 10]; // A separate branch can still attach to cleared territory.
  assert.ok(eligibleOrigins(b).includes(10));
});

test("远处白房、进入过的失败房和孤立通关岛不能免费起步", () => {
  const b = board(5);
  b.cells[1].passable = b.cells[5].passable = false;
  Object.assign(b.cells[18], { revealed: true, passable: true, type: "challenge" });
  for (const state of [{}, { entered: true }, { visited: true }]) {
    Object.assign(b.cells[18], state);
    assert.equal(plan(b).main, null);
    b.queue = [18, 19, 24];
    assert.equal(plan(b).main, null);
    b.queue = [];
  }
});

test("白房只免费起步一层，前方白房和未知连接段必须保留", () => {
  const b = board(5);
  for (const id of [1, 2, 3, 4, 9, 14, 19])
    Object.assign(b.cells[id], { type: "challenge", revealed: true, passable: true });
  const r = plan(b).main;
  valid(b, r);
  assert.ok([1, 5].includes(r.source));
  assert.equal(r.cost, 7);
  b.cells[1].visited = true;
  const next = plan(b).main;
  assert.equal(next.source, 2);
  assert.equal(next.cost, 6);
  b.cells[2].passable = false;
  assert.notEqual(plan(b).main.source, 2);
});

test("连通白房及队列在低预算下仍保证最少新格", () => {
  const b = clear(board(6), [1, 7, 13, 19]);
  Object.assign(b.cells[25], { type: "challenge", revealed: true, passable: true });
  Object.assign(b.cells[34], { type: "challenge", revealed: true, passable: true });
  for (const maxStates of [1, 20000]) {
    const r = plan(b, { maxStates }).main;
    valid(b, r);
    assert.equal(r.source, 25);
    assert.equal(r.cost, 5);
  }
});

test("进入但失败的白房不向外扩展起点，仍可零新格经过", () => {
  const b = board(5);
  b.cells[1].entered = true;
  Object.assign(b.cells[2], { type: "challenge", revealed: true, passable: true });
  const r = plan(b).main;
  assert.notEqual(r.source, 2);
  assert.equal(r.cost, 7);
  b.cells[1].visited = true;
  assert.equal(plan(b).main.source, 2);
});

test("队列接到通关岛后可扩展，取消连接后立即失效", () => {
  const b = board(5);
  for (const id of [7, 12, 17, 22]) Object.assign(b.cells[id], { visited: true, revealed: true, passable: true });
  Object.assign(b.cells[23], { type: "challenge", revealed: true, passable: true });
  assert.notEqual(plan(b).main.source, 23);
  b.queue = [1, 2];
  const connected = plan(b).main;
  valid(b, connected);
  assert.notEqual(connected.source, 23);
  assert.ok(connected.path.some((id) => [7, 12, 17, 22].includes(id)));
  assert.equal(connected.cost, 2); // The unqueued white room is no longer a second free origin.
  b.queue = [2];
  assert.notEqual(plan(b).main.source, 23);
});

test("出口仅揭示、孤立入队或进入不等于完成；连接后才允许零续接", () => {
  const b = board(5);
  b.cells[24].revealed = true;
  b.cells[24].entered = true;
  b.queue = [24];
  assert.ok(plan(b).main.cost > 0);
  clear(b, [1, 2, 3, 4, 9, 14, 19]);
  b.queue = [24];
  assert.deepEqual(plan(b).main.path, [24]);
  assert.equal(plan(b).main.cost, 0);
});

test("未领取宝箱不作免费起点，连通入队后续接且不重复推荐", () => {
  const b = clear(board(5), [1, 2, 3, 4, 9, 14]);
  Object.assign(b.cells[19], { type: "treasure", revealed: true, passable: true });
  assert.notEqual(plan(b).main.source, 19);
  b.queue = [19];
  const r = plan(b);
  assert.equal(r.main.source, 19);
  assert.equal(r.main.cost, 1);
  assert.ok(!r.treasures.some((route) => route.target === 19));
  b.queue = [];
  b.cells[19].entered = true;
  assert.equal(plan(b).main.cost, 1);
});

test("宝箱支线沿用连通起点，但不能经过未知房；主路宝箱不重复推荐", () => {
  const b = board(5);
  Object.assign(b.cells[2], { type: "treasure", revealed: true, passable: true });
  const r = plan(b);
  const treasure = r.treasures.find((route) => route.target === 2);
  assert.ok(treasure);
  assert.equal(treasure.source, 1);
  assert.equal(treasure.cost, 1);
  b.cells[1].type = "unknown";
  b.cells[1].revealed = false;
  b.cells[1].passable = null;
  assert.ok(!plan(b).treasures.some((route) => route.target === 2));
  const c = board(3);
  Object.assign(c.cells[5], { type: "treasure", revealed: true, passable: true });
  c.cells[3].passable = c.cells[4].passable = c.cells[7].passable = false;
  const only = plan(c);
  assert.ok(only.main.path.includes(5));
  assert.ok(!only.treasures.some((route) => route.target === 5));
});

test("随机混合地图独立松弛核对连通起点、道具数和新格成本", () => {
  let seed = 20261109;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const better = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  for (let sample = 0; sample < 120; sample++) {
    const b = board(4);
    for (let id = 1; id < 15; id++) {
      const mode = Math.floor(random() * 6);
      b.cells[id] = {
        type: mode === 0 ? "unknown" : mode === 1 ? "treasure" : "challenge",
        revealed: mode !== 0,
        visited: mode === 5,
        entered: mode === 5 || random() < 0.3,
        passable: mode === 0 ? null : mode !== 2,
        forceChance: random() < 0.15 ? 0 : 1
      };
    }
    b.queue = [];
    for (let i = 0; i < 12; i++) b.queue.push(Math.floor(random() * 16));
    b.forcePlanningEnabled = true;
    b.shroudCount = 20;
    const starts = eligibleOrigins(b);
    const costs = b.cells.map(() => [Infinity, Infinity]);
    for (const id of starts) costs[id] = [0, 0];
    // Bellman-Ford with explicit lexicographic pairs, independent of graph contraction/weight encoding.
    for (let iteration = 0; iteration < 16; iteration++) {
      let changed = false;
      for (let u = 0; u < 16; u++)
        for (const v of neighbors(u, 4)) {
          const c = b.cells[v];
          if (c.passable === false && !(c.type === "challenge" && c.revealed && c.forceChance > 0)) continue;
          const candidate = [
            costs[u][0] + Number(c.passable === false),
            costs[u][1] + Number(!c.entered && !c.visited)
          ];
          if (better(candidate, costs[v])) {
            costs[v] = candidate;
            changed = true;
          }
        }
      if (!changed) break;
    }
    const result = plan(b).main;
    if (!Number.isFinite(costs[15][0])) assert.equal(result, null);
    else {
      assert.ok(starts.includes(result.source));
      assert.deepEqual([result.forceCount, result.cost], costs[15], `sample ${sample}`);
      assert.equal(result.path.at(-1), 15);
      assert.ok(result.path.every((id, index) => index === 0 || neighbors(result.path[index - 1], 4).includes(id)));
    }
  }
});

test("同成本同收益保留旧路线，但不保留更差、绕远、断开或变红的路线", () => {
  const b = board(3),
    preferredPath = [3, 4, 5, 8];
  assert.deepEqual(plan(b, { preferredPath }).main.path, preferredPath);
  for (const path of [
    [3, 6, 7, 8],
    [0, 1, 4, 5, 8],
    [3, 5, 8],
    [99, 8]
  ])
    assert.deepEqual(plan(b, { preferredPath: path }).main, plan(b).main);
  b.cells[4].passable = false;
  const changed = plan(b, { preferredPath }).main;
  valid(b, changed);
  assert.ok(!changed.path.includes(4));
});
