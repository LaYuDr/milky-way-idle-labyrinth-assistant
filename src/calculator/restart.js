(function (root) {
  "use strict";
  const cache = new Map();
  function solve({ kind, goal, success, double, interval, duration = 120, restart = 5, retry = 1 }) {
    if (
      ![goal, success, double, interval, duration, restart, retry].every(Number.isFinite) ||
      !["skilling", "enhancing"].includes(kind) ||
      goal <= 0 ||
      !Number.isInteger(goal) ||
      interval <= 0 ||
      duration <= 0 ||
      restart <= 0 ||
      retry < 0 ||
      success < 0 ||
      success > 1 ||
      double < 0 ||
      double > 1
    )
      return null;
    const count = Math.floor(duration / interval + 1e-9),
      tail = Math.max(0, duration - count * interval);
    if (count < 1 || count > 1200 || goal > count * 2 || goal * count > 50000 || success === 0) return null;
    const key = JSON.stringify([kind, goal, success, double, interval, duration, restart, retry]);
    if (cache.has(key)) return cache.get(key);
    const failure = 1 - success,
      single = success * (1 - double),
      doubled = success * double;
    const down = Int32Array.from({ length: goal }, (_, x) => (kind === "enhancing" ? Math.max(0, x - 1) : x)),
      up = Int32Array.from({ length: goal }, (_, x) => Math.min(goal, x + 1)),
      upDouble = Int32Array.from({ length: goal }, (_, x) => Math.min(goal, x + 2));
    const sums = (row, x) => failure * row[down[x]] + single * row[up[x]] + doubled * row[upDouble[x]];
    const probability = [new Float64Array(goal + 1)];
    probability[0][goal] = 1;
    let elapsed = new Float64Array(goal + 1).fill(tail),
      nextElapsed = new Float64Array(goal + 1);
    elapsed[goal] = 0;
    for (let n = 1; n <= count; n++) {
      const row = new Float64Array(goal + 1);
      row[goal] = 1;
      for (let x = 0; x < goal; x++) {
        row[x] = sums(probability[n - 1], x);
        nextElapsed[x] = interval + sums(elapsed, x);
      }
      probability.push(row);
      [elapsed, nextElapsed] = [nextElapsed, elapsed];
    }
    const p0 = probability[count][0];
    if (p0 < 1e-12) return null;
    const baseline = (elapsed[0] + (1 - p0) * retry) / p0;
    // Bisection only needs the last row. Reuse two buffers instead of allocating
    // every state and its transition tuples on each of the 65 passes.
    const buffers = [new Float64Array(goal + 1), new Float64Array(goal + 1)];
    function table(fresh, retain = false) {
      const reset = restart + fresh;
      let previous = buffers[0],
        next = buffers[1];
      previous.fill(Math.min(reset, tail + retry + fresh));
      previous[goal] = next[goal] = 0;
      const rows = retain ? [previous.slice()] : null;
      for (let n = 1; n <= count; n++) {
        for (let x = 0; x < goal; x++) next[x] = Math.min(reset, interval + sums(previous, x));
        if (retain) rows.push(next.slice());
        [previous, next] = [next, previous];
      }
      return retain ? rows : previous[0];
    }
    let low = 0,
      high = baseline;
    for (let i = 0; i < 65; i++) {
      const mid = (low + high) / 2;
      if (table(mid) > mid) low = mid;
      else high = mid;
    }
    const fresh = (low + high) / 2,
      values = table(fresh, true);
    const result = {
      fresh,
      baseline,
      count,
      tail,
      goal,
      probability,
      evaluate(n, x, wait = n === 0 ? tail : interval) {
        if (
          !Number.isInteger(n) ||
          !Number.isInteger(x) ||
          n < 0 ||
          n > count ||
          x < 0 ||
          x > goal ||
          !Number.isFinite(wait) ||
          wait < 0 ||
          wait > (n === 0 ? tail : interval)
        )
          return null;
        if (x === goal)
          return { decision: "done", saving: 0, continueSeconds: 0, restartSeconds: restart + fresh, chance: 1 };
        const keep = n === 0 ? wait + retry + fresh : wait + sums(values[n - 1], x);
        const reset = restart + fresh;
        return {
          decision: keep > reset + 1e-7 ? "restart" : "continue",
          saving: keep - reset,
          continueSeconds: keep,
          restartSeconds: reset,
          chance: probability[n][x]
        };
      }
    };
    if (cache.size >= 64) cache.delete(cache.keys().next().value);
    cache.set(key, result);
    return result;
  }
  root.MwiLabyrinthRestart = Object.freeze({ solve, clearCache: () => cache.clear() });
})(globalThis);
