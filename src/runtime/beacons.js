(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MwiLabyrinthBeacons = api;
})(globalThis, function () {
  "use strict";
  // Client getBeaconPattern / getBeaconRevealRooms (2026-11-08).
  const patterns = {
    "/items/basic_beacon": [
      [0, -1],
      [-1, 0],
      [0, 0],
      [1, 0],
      [0, 1]
    ],
    "/items/advanced_beacon": [
      [-1, -1],
      [0, -1],
      [1, -1],
      [-1, 0],
      [0, 0],
      [1, 0],
      [-1, 1],
      [0, 1],
      [1, 1]
    ],
    "/items/expert_beacon": [
      [-2, 0],
      [-1, 0],
      [0, 0],
      [1, 0],
      [2, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
      [-1, -1],
      [0, -1],
      [1, -1],
      [0, 2],
      [0, -2]
    ]
  };
  function analyze(map, item, path = null) {
    if (!Object.hasOwn(patterns, item)) return null;
    const { size, cells } = map;
    const routeReveal = new Set();
    for (const id of path || []) {
      if (!Number.isInteger(id) || id < 0 || id >= cells.length) continue;
      routeReveal.add(id);
      if (id % size > 0) routeReveal.add(id - 1);
      if (id % size < size - 1) routeReveal.add(id + 1);
      if (id >= size) routeReveal.add(id - size);
      if (id + size < cells.length) routeReveal.add(id + size);
    }
    const candidates = cells.map((_, id) => {
      const targets = [];
      let known = 0,
        exit = 0,
        outside = 0;
      for (const [dx, dy] of patterns[item]) {
        const nx = (id % size) + dx,
          ny = Math.floor(id / size) + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) {
          outside++;
          continue;
        }
        const target = ny * size + nx;
        if (target === cells.length - 1) exit++;
        else if (target === 0 || cells[target].revealed || cells[target].visited) known++;
        else targets.push(target);
      }
      targets.sort((a, b) => a - b);
      return {
        id,
        targets,
        count: targets.length,
        known,
        exit,
        outside,
        offRoute: path ? targets.filter((target) => !routeReveal.has(target)).length : null
      };
    });
    const ranked = candidates
      .filter((c) => c.count > 0)
      .slice()
      .sort((a, b) => b.count - a.count || (b.offRoute ?? 0) - (a.offRoute ?? 0) || a.id - b.id);
    const groups = [],
      byTargets = new Map();
    for (const candidate of ranked) {
      const key = candidate.targets.join(",");
      const group = byTargets.get(key);
      if (group) group.centers.push(candidate.id);
      else {
        const next = { ...candidate, centers: [candidate.id] };
        groups.push(next);
        byTargets.set(key, next);
      }
    }
    const maxNew = ranked[0]?.count || 0;
    return {
      candidates,
      groups,
      maxNew,
      positions: candidates.filter((c) => maxNew && c.count === maxNew).map((c) => c.id)
    };
  }
  function recommend(map, item) {
    const result = analyze(map, item);
    return result && { maxNew: result.maxNew, positions: result.positions };
  }
  // Exact union search. Only equal target sets are merged; no top-N pruning.
  function bestPair(analysis) {
    if (!analysis) return null;
    let best = null;
    const groups = analysis.groups;
    const sets = groups.map((c) => new Set(c.targets));
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i],
          b = groups[j];
        const secondTargets = b.targets.filter((id) => !sets[i].has(id));
        const total = a.count + secondTargets.length;
        if (total <= analysis.maxNew || (best && total <= best.total)) continue;
        best = {
          a: a.id,
          b: b.id,
          first: a.count,
          second: secondTargets.length,
          total,
          overlap: b.count - secondTargets.length,
          targets: [...a.targets, ...secondTargets]
        };
      }
    }
    return best;
  }
  // Exact maximum coverage for up to three lamps; bounded improvement above three. Count bounds only prune
  // branches that cannot improve the result; equal coverage prefers fewer lamps.
  function plan(analysis, count) {
    const groups = analysis?.groups || [];
    const limit = Number.isFinite(count) ? Math.max(0, Math.min(groups.length, Math.trunc(count))) : 0;
    let best = { total: 0, points: [], targets: [] };
    const covered = new Set(),
      chosen = [];
    let operations = 0,
      stopped = false;
    const budget = limit > 3 ? 20000 : Infinity;
    // Seed larger searches with a useful full plan before bounded improvement.
    if (limit > 3) {
      const seen = new Set(),
        points = [];
      for (let n = 0; n < limit; n++) {
        let candidate = null,
          added = [];
        for (const group of groups) {
          const fresh = group.targets.filter((id) => !seen.has(id));
          if (fresh.length > added.length) {
            candidate = group;
            added = fresh;
          }
        }
        if (!candidate) break;
        for (const id of added) seen.add(id);
        points.push({ id: candidate.id, added: added.length });
      }
      best = { total: seen.size, points, targets: [...seen] };
    }
    function search(start) {
      if (covered.size > best.total || (covered.size === best.total && chosen.length < best.points.length)) {
        best = { total: covered.size, points: chosen.map((p) => ({ ...p })), targets: [...covered] };
      }
      const left = limit - chosen.length;
      if (!left) return;
      for (let i = start; i < groups.length; i++) {
        if (stopped || ++operations > budget) {
          stopped = true;
          return;
        }
        let bound = covered.size;
        for (let k = i; k < Math.min(groups.length, i + left); k++) bound += groups[k].count;
        if (bound < best.total || (bound === best.total && chosen.length + 1 >= best.points.length)) break;
        const candidate = groups[i];
        const added = candidate.targets.filter((id) => !covered.has(id));
        if (!added.length) continue;
        for (const id of added) covered.add(id);
        chosen.push({ id: candidate.id, added: added.length });
        search(i + 1);
        chosen.pop();
        for (const id of added) covered.delete(id);
      }
    }
    search(0);
    return { ...best, exact: !stopped };
  }
  function apply(map, state) {
    const labyrinth = state?.characterLabyrinth;
    const rows = labyrinth?.roomData;
    const matched =
      Array.isArray(rows) &&
      rows.length === map.size &&
      rows.every((row) => Array.isArray(row) && row.length === map.size);
    const item = matched ? labyrinth.beaconItemHrid : null;
    const rawCount = matched ? labyrinth.beaconCount : null;
    const remaining = Number.isInteger(rawCount) && rawCount >= 0 ? rawCount : null;
    // Read only the supply identity/count and shape, never hidden room contents.
    const result = recommend(map, item);
    map.beaconAdvice = {
      ...result,
      item,
      remaining,
      status: remaining === 0 ? "empty" : !result ? "unknown" : result.maxNew === 0 ? "covered" : "ready"
    };
    return map;
  }
  return { recommend, analyze, bestPair, plan, apply };
});
