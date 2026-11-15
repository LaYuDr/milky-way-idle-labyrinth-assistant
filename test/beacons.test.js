const test = require("node:test");
const assert = require("node:assert/strict");
const { recommend, apply } = require("../src/runtime/beacons.js");
const item = (tier) => `/items/${tier}_beacon`;
const board = (size) => ({
  size,
  cells: Array.from({ length: size * size }, (_, id) => ({ revealed: id === 0, visited: id === 0 }))
});

test("三种探照灯分别覆盖 5、9、13 格；保留所有并列最佳位置", () => {
  for (const [tier, count] of [
    ["basic", 5],
    ["advanced", 9],
    ["expert", 13]
  ]) {
    const result = recommend(board(8), item(tier));
    assert.equal(result.maxNew, count);
    assert.ok(result.positions.length > 1);
    assert.ok(result.positions.includes(27));
    assert.ok(!result.positions.includes(0));
    assert.ok(!result.positions.includes(63));
  }
});

test("去除已揭示和已通关格、入口及出口；中心可以是已知房间", () => {
  const map = board(3);
  map.cells.forEach((cell) => {
    cell.revealed = true;
  });
  for (const id of [1, 3, 5, 7, 8]) map.cells[id].revealed = false;
  assert.deepEqual(recommend(map, item("basic")), { maxNew: 4, positions: [4] });
  map.cells[1].visited = true;
  assert.equal(recommend(map, item("basic")).maxNew, 3);
  map.cells.forEach((cell) => {
    cell.revealed = true;
  });
  map.cells[8].revealed = false;
  assert.deepEqual(recommend(map, item("expert")), { maxNew: 0, positions: [] });
});

test("随机地图逐位置独立枚举，验证边界裁切、去重和最大值", () => {
  let seed = 19;
  for (const size of [2, 3, 5, 8, 15, 20]) {
    for (let run = 0; run < 5; run++) {
      const map = board(size);
      map.cells.forEach((cell) => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        cell.revealed = seed % 3 === 0;
      });
      for (const tier of ["basic", "advanced", "expert"]) {
        const counts = map.cells.map((_, center) =>
          map.cells.reduce((count, cell, target) => {
            if (target === 0 || target === map.cells.length - 1 || cell.revealed || cell.visited) return count;
            const dx = Math.abs((center % size) - (target % size));
            const dy = Math.abs(Math.floor(center / size) - Math.floor(target / size));
            const inside = tier === "advanced" ? Math.max(dx, dy) <= 1 : dx + dy <= (tier === "expert" ? 2 : 1);
            return count + Number(inside);
          }, 0)
        );
        const maxNew = Math.max(...counts);
        assert.deepEqual(recommend(map, item(tier)), {
          maxNew,
          positions: maxNew ? counts.flatMap((count, id) => (count === maxNew ? [id] : [])) : []
        });
      }
    }
  }
});

test("只读取道具和余量，不读取隐藏房间；未知道具不猜测形状", () => {
  const map = board(8);
  const state = {
    characterLabyrinth: {
      beaconItemHrid: item("expert"),
      beaconCount: 2,
      roomData: Array.from({ length: 8 }, () =>
        Array.from(
          { length: 8 },
          () =>
            new Proxy(
              {},
              {
                get() {
                  throw new Error("不得读取隐藏房间");
                }
              }
            )
        )
      )
    }
  };
  apply(map, state);
  assert.equal(map.beaconAdvice.maxNew, 13);
  assert.equal(map.beaconAdvice.status, "ready");
  state.characterLabyrinth.beaconCount = 0;
  assert.equal(apply(map, state).beaconAdvice.status, "empty");
  state.characterLabyrinth.beaconCount = undefined;
  assert.equal(apply(map, state).beaconAdvice.remaining, null);
  state.characterLabyrinth.beaconItemHrid = "/items/future_beacon";
  assert.equal(apply(map, state).beaconAdvice.status, "unknown");
  state.characterLabyrinth.roomData = [[]];
  assert.equal(apply(map, state).beaconAdvice.status, "unknown");
  assert.equal(recommend(map, item("unknown")), null);
});

const { analyze, bestPair } = require("../src/runtime/beacons.js");
test("范围构成相加等于灯的完整范围，路线外收益按整条路线揭示并集计算", () => {
  const map = board(5);
  map.cells[6].revealed = true;
  const path = [0, 1, 2, 7, 12, 17, 22, 23, 24];
  const result = analyze(map, item("expert"), path);
  const route = new Set(path);
  for (let target = 0; target < 25; target++) {
    if (
      path.some(
        (center) =>
          Math.abs((center % 5) - (target % 5)) + Math.abs(Math.floor(center / 5) - Math.floor(target / 5)) === 1
      )
    )
      route.add(target);
  }
  for (const candidate of result.candidates) {
    assert.equal(candidate.count + candidate.known + candidate.exit + candidate.outside, 13);
    assert.equal(candidate.offRoute, candidate.targets.filter((id) => !route.has(id)).length);
    assert.equal(new Set(candidate.targets).size, candidate.count);
  }
  assert.equal(analyze(map, item("basic")).candidates[0].offRoute, null);
  const flattened = result.groups.flatMap((group) => group.centers).sort((a, b) => a - b);
  assert.deepEqual(
    flattened,
    result.candidates.filter((c) => c.count).map((c) => c.id)
  );
  for (const group of result.groups)
    for (const id of group.centers) assert.deepEqual(result.candidates[id].targets, group.targets);
});

test("两盏联合规划与独立穷举一致，不相加重复覆盖，不只搜索单盏前三名", () => {
  let seed = 41;
  for (const size of [3, 5, 8])
    for (let run = 0; run < 8; run++) {
      const map = board(size);
      for (const cell of map.cells) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        cell.revealed = seed % 4 === 0;
      }
      for (const tier of ["basic", "advanced", "expert"]) {
        const result = analyze(map, item(tier));
        const independent = map.cells.map(
          (_, center) =>
            new Set(
              map.cells.flatMap((cell, id) => {
                const dx = Math.abs((center % size) - (id % size)),
                  dy = Math.abs(Math.floor(center / size) - Math.floor(id / size));
                const inside = tier === "advanced" ? Math.max(dx, dy) <= 1 : dx + dy <= (tier === "expert" ? 2 : 1);
                return inside && id !== 0 && id !== size * size - 1 && !cell.revealed && !cell.visited ? [id] : [];
              })
            )
        );
        let maximum = 0;
        for (const a of independent)
          for (const b of independent) maximum = Math.max(maximum, new Set([...a, ...b]).size);
        const pair = bestPair(result);
        assert.equal(pair?.total ?? result.maxNew, maximum);
        if (pair) {
          assert.equal(pair.first + pair.second, pair.total);
          assert.equal(new Set(pair.targets).size, pair.total);
          assert.equal(result.candidates[pair.b].count - pair.overlap, pair.second);
        }
      }
    }
});

test("空地图和只需一盏时不推荐多用，最大尺寸仍返回精确可复算的组合", () => {
  const map = board(5);
  map.cells.forEach((c) => {
    c.revealed = true;
  });
  assert.equal(bestPair(analyze(map, item("expert"))), null);
  map.cells[12].revealed = false;
  assert.equal(bestPair(analyze(map, item("basic"))), null);
  const large = analyze(board(20), item("expert"));
  assert.equal(bestPair(large).total, 26);
  assert.equal(bestPair(null), null);
});

test("一至三盏联合规划与穷举一致，重复覆盖只计一次", () => {
  const { analyze, plan } = require("../src/runtime/beacons.js");
  for (let seed = 1; seed <= 12; seed++) {
    const map = board(4);
    map.cells.forEach((c, i) => {
      c.revealed = (i * 7 + seed * 11) % 13 < 5;
    });
    const analysis = analyze(map, item("expert"));
    for (const count of [1, 2, 3]) {
      let maximum = 0;
      const scan = (start, ids, depth) => {
        maximum = Math.max(maximum, new Set(ids).size);
        if (!depth) return;
        for (let i = start; i < analysis.candidates.length; i++)
          scan(i + 1, [...ids, ...analysis.candidates[i].targets], depth - 1);
      };
      scan(0, [], count);
      const result = plan(analysis, count);
      assert.equal(result.total, maximum);
      assert.equal(
        result.points.reduce((sum, p) => sum + p.added, 0),
        maximum
      );
      assert.equal(new Set(result.targets).size, maximum);
    }
  }
  const map = board(20);
  assert.equal(plan(analyze(map, item("expert")), 3).total, 39);
  map.cells.forEach((c) => {
    c.revealed = true;
  });
  map.cells[20].revealed = false;
  assert.equal(plan(analyze(map, item("expert")), 3).points.length, 1);
  assert.equal(plan(null, 3).total, 0);
});

test("数量允许零与三盏以上，大库存不重复使用无收益点位", () => {
  const { analyze, plan } = require("../src/runtime/beacons.js");
  const analysis = analyze(board(8), item("expert"));
  assert.equal(plan(analysis, 0).points.length, 0);
  for (const count of [4, 5, 8, 999]) {
    const result = plan(analysis, count),
      seen = new Set();
    assert.ok(result.points.length <= count);
    assert.equal(new Set(result.points.map((p) => p.id)).size, result.points.length);
    for (const point of result.points) {
      const fresh = analysis.candidates[point.id].targets.filter((id) => !seen.has(id));
      assert.equal(point.added, fresh.length);
      assert.ok(point.added > 0);
      fresh.forEach((id) => seen.add(id));
    }
    assert.equal(seen.size, result.total);
    assert.ok(result.total >= plan(analysis, 3).total);
    assert.equal(typeof result.exact, "boolean");
  }
  const small = analyze(board(3), item("basic"));
  assert.equal(plan(small, 4).total, 7);
  assert.equal(plan(small, 4).exact, true);
});
