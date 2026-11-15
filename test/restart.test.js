const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const sandbox = vm.createContext({});
vm.runInContext(fs.readFileSync(require.resolve("../src/calculator/restart.js"), "utf8"), sandbox);
const { solve } = sandbox.MwiLabyrinthRestart;

// Enumerate every deterministic policy for a tiny room. Each state is an affine
// cost A + B * fresh; solve the renewal equation directly, without bisection.
function exhaustive(options) {
  const { goal, success: p, double: d, interval, duration, restart, retry, kind } = options;
  const count = Math.floor(duration / interval),
    tail = duration - count * interval;
  const policies = [];
  for (let mask = 0; mask < 2 ** (count * goal); mask++) {
    const rows = [];
    for (let n = 0; n < count; n++) {
      rows[n] = Array.from({ length: goal + 1 }, (_, x) => {
        if (x === goal) return [0, 0];
        if (mask & (1 << (n * goal + x))) return [restart, 1];
        if (n === 0) return [tail + retry, 1];
        return advance(rows[n - 1], x);
      });
    }
    function advance(row, x) {
      const result = [interval, 0];
      const paths = [
        [1 - p, kind === "enhancing" ? Math.max(0, x - 1) : x],
        [p * (1 - d), Math.min(goal, x + 1)],
        [p * d, Math.min(goal, x + 2)]
      ];
      for (const [weight, y] of paths) for (let i = 0; i < 2; i++) result[i] += weight * row[y][i];
      return result;
    }
    const [a, b] = advance(rows[count - 1], 0);
    if (b < 1) policies.push({ fresh: a / (1 - b), rows });
  }
  const fresh = Math.min(...policies.map((p) => p.fresh));
  return { fresh, best: (n, x) => Math.min(...policies.map(({ rows }) => rows[n][x][0] + rows[n][x][1] * fresh)) };
}

test("重开策略与独立策略穷举一致，包括失败降级、双倍和尾部等待", () => {
  for (const kind of ["skilling", "enhancing"])
    for (const success of [0.25, 0.7, 1])
      for (const double of [0, 0.3, 1])
        for (const duration of [8, 11]) {
          const options = { kind, goal: 2, success, double, interval: 4, duration, restart: 2, retry: 1 };
          const expected = exhaustive(options),
            model = solve(options);
          assert.ok(Math.abs(model.fresh - expected.fresh) < 1e-7, JSON.stringify(options));
          for (let n = 0; n < model.count; n++)
            for (let x = 0; x < model.goal; x++) {
              const value = model.evaluate(n, x);
              assert.ok(Math.abs(Math.min(value.continueSeconds, value.restartSeconds) - expected.best(n, x)) < 1e-7);
            }
        }
});

test("最后动作后使用实际剩余等待，临近结束应等待自然重试", () => {
  const model = solve({ kind: "skilling", goal: 5, success: 0.7, double: 0.2, interval: 11, restart: 3 });
  assert.equal(model.tail, 10);
  assert.equal(model.evaluate(0, 0).decision, "restart");
  assert.equal(model.evaluate(0, 0, 1).decision, "continue");
  assert.equal(model.evaluate(0, 0, 1).saving, -1);
  assert.equal(model.evaluate(0, 0, 11), null);
  assert.equal(model.evaluate(0, 5, 1).decision, "done");
  assert.equal(solve({ kind: "unknown", goal: 5, success: 0.7, double: 0.2, interval: 11 }), null);
});
