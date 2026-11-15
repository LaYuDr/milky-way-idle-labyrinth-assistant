(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MwiLabyrinthCore = api;
})(globalThis, function () {
  "use strict";
  function neighbors(id, size) {
    const x = id % size,
      y = Math.floor(id / size);
    return [
      x + 1 < size ? id + 1 : -1,
      y + 1 < size ? id + size : -1,
      x > 0 ? id - 1 : -1,
      y > 0 ? id - size : -1
    ].filter((n) => n >= 0);
  }
  function normalize(input) {
    const { size, cells } = input;
    if (!Number.isInteger(size) || size < 2 || size > 20 || !Array.isArray(cells) || cells.length !== size * size)
      throw new Error("地图尺寸或格子数量无效");
    const types = ["unknown", "challenge", "treasure", "start", "exit"];
    const normalized = cells.map((c, id) => {
      if (!c || !types.includes(c.type) || ![true, false, null].includes(c.passable))
        throw new Error(`房间 ${id} 状态无效`);
      if (typeof c.revealed !== "boolean" || typeof c.visited !== "boolean") throw new Error("探索状态缺失");
      if (c.visited && (!c.revealed || c.passable === false)) throw new Error("已通关房间状态冲突");
      return { ...c, entered: c.visited || c.entered === true };
    });
    if (!normalized[0].visited) throw new Error("尚未确认入口状态");
    return { size, cells: normalized };
  }
  const bit = (i) => 1n << BigInt(i);
  function count(mask) {
    let n = 0;
    while (mask) {
      mask &= mask - 1n;
      n++;
    }
    return n;
  }
  function distances(adj, costs, source, reverse = false) {
    const d = Array(adj.length).fill(Infinity),
      queue = Array.isArray(source) ? [...source] : [source];
    for (const id of queue) d[id] = 0;
    while (queue.length) {
      const u = queue.shift();
      for (const v of adj[u]) {
        const w = reverse ? costs[u] : costs[v];
        if (d[v] > d[u] + w) {
          d[v] = d[u] + w;
          if (w === 0) queue.unshift(v);
          else queue.push(v);
        }
      }
    }
    return d;
  }
  // Each connected zero-cost region is one vertex, avoiding free-travel cycles.
  const canForce = (cell) =>
    cell.passable === false &&
    cell.type === "challenge" &&
    cell.revealed &&
    Number.isFinite(cell.forceChance) &&
    cell.forceChance > 0 &&
    cell.forceChance <= 1;
  function graph(board, knownOnly, force = false) {
    const { size, cells } = board,
      nodeOf = Array(cells.length).fill(-1),
      nodes = [];
    const allowed = (id) =>
      (cells[id].passable !== false || (force && canForce(cells[id]))) &&
      (!knownOnly ||
        (cells[id].revealed &&
          (cells[id].visited ||
            cells[id].passable === true ||
            ["start", "exit", "treasure"].includes(cells[id].type))));
    for (let id = 0; id < cells.length; id++) {
      if (nodeOf[id] !== -1 || !allowed(id)) continue;
      const index = nodes.length,
        members = [id];
      nodeOf[id] = index;
      if (cells[id].entered && cells[id].passable !== false) {
        for (let k = 0; k < members.length; k++)
          for (const v of neighbors(members[k], size)) {
            if (nodeOf[v] === -1 && allowed(v) && cells[v].entered && cells[v].passable !== false) {
              nodeOf[v] = index;
              members.push(v);
            }
          }
      }
      nodes.push(members);
    }
    const adj = nodes.map(() => new Set()),
      // One forced room outweighs every possible new room in a simple route.
      costs = nodes.map((n) => (cells[n[0]].entered ? 0 : 1) + (cells[n[0]].passable === false ? cells.length + 1 : 0));
    for (let id = 0; id < cells.length; id++)
      if (nodeOf[id] >= 0)
        for (const v of neighbors(id, size)) {
          if (nodeOf[v] >= 0 && nodeOf[v] !== nodeOf[id]) adj[nodeOf[id]].add(nodeOf[v]);
        }
    return { nodeOf, nodes, costs, adj: adj.map((s) => [...s]) };
  }
  function expand(nodePath, g, board, target, source = 0) {
    const selected = new Set(nodePath),
      previous = new Map([[source, null]]),
      queue = [source];
    // Within the chosen chain, BFS gives an explicit adjacent walk through free rooms.
    for (let k = 0; k < queue.length && !previous.has(target); k++) {
      const u = queue[k],
        a = nodePath.indexOf(g.nodeOf[u]);
      for (const v of neighbors(u, board.size)) {
        const b = nodePath.indexOf(g.nodeOf[v]);
        if (!previous.has(v) && selected.has(g.nodeOf[v]) && (a === b || b === a + 1)) {
          previous.set(v, u);
          queue.push(v);
        }
      }
    }
    if (!previous.has(target)) throw new Error("路线展开失败");
    const path = [];
    for (let u = target; u !== null; u = previous.get(u)) path.push(u);
    return path.reverse();
  }
  function coverageMasks(board, path) {
    let direct = 0n,
      opportunity = 0n;
    for (const id of path) {
      for (const v of [id, ...neighbors(id, board.size)]) {
        if (!board.cells[v].revealed) direct |= bit(v);
      }
      for (const side of neighbors(id, board.size)) {
        const cell = board.cells[side];
        // Unknown rooms may be treasure; known non-treasure rooms are not harvest opportunities.
        if (
          cell.passable === false ||
          cell.visited ||
          (cell.revealed && cell.type !== "treasure" && cell.type !== "unknown")
        )
          continue;
        for (const outer of neighbors(side, board.size)) if (!board.cells[outer].revealed) opportunity |= bit(outer);
      }
    }
    return { direct, opportunity: opportunity | direct };
  }
  function scoreRoute(board, path) {
    const { direct, opportunity } = coverageMasks(board, path);
    return {
      newRevealed: count(direct),
      opportunityReach: count(opportunity),
      extraOpportunity: count(opportunity & ~direct)
    };
  }
  function planningOrigins(board, queue) {
    const { cells, size } = board;
    const connected = new Set();
    function connect(id) {
      const pending = [id];
      connected.add(id);
      for (let i = 0; i < pending.length; i++)
        for (const next of neighbors(pending[i], size))
          if (!connected.has(next) && cells[next].visited) {
            connected.add(next);
            pending.push(next);
          }
    }
    connect(0);
    // Native queue order matters: a later selection cannot repair an earlier gap.
    // Failed/entered rooms save new-room cost, but do not connect cleared regions.
    const planned = new Set();
    for (const id of Array.isArray(queue) ? queue : []) {
      if (!Number.isInteger(id) || !cells[id] || cells[id].passable === false || planned.has(id)) continue;
      if (!connected.has(id) && !neighbors(id, size).some((next) => connected.has(next))) continue;
      planned.add(id);
      connect(id);
    }
    // Once a pending room is committed, another unqueued white room is not
    // a second free starting challenge. It must be reached and paid for normally.
    const hasPendingQueue = [...planned].some((id) => !cells[id].visited);
    const sources = cells.flatMap((cell, id) =>
      connected.has(id) ||
      (!hasPendingQueue &&
        cell.type === "challenge" &&
        cell.revealed &&
        cell.passable === true &&
        neighbors(id, size).some((next) => connected.has(next)))
        ? [id]
        : []
    );
    return { sources, planned };
  }
  function solve(board, target, knownOnly, maxStates, source = 0, force = false, options = {}) {
    const committed = options.committed || [];
    const baseline = coverageMasks(board, committed);
    if ((Array.isArray(source) ? source : [source]).includes(target))
      return {
        path: [target],
        source: target,
        newCells: [],
        cost: 0,
        ...scoreRoute(board, [...committed, target]),
        explorationOptimal: true,
        searchedStates: 1,
        uncertain: !board.cells[target].revealed,
        next: null
      };
    const g = graph(board, knownOnly, force),
      sources = Array.isArray(source) ? source : [source],
      starts = [...new Set(sources.map((id) => g.nodeOf[id]).filter((id) => id >= 0))],
      end = g.nodeOf[target];
    if (!starts.length || end < 0) return null;
    const from = distances(g.adj, g.costs, starts),
      to = distances(g.adj, g.costs, end, true),
      cost = from[end];
    if (!Number.isFinite(cost)) return null;
    const coverage = g.nodes.map((members) => coverageMasks(board, members));
    const masks = coverage.map((c) => c.direct);
    const opportunities = coverage.map((c) => c.opportunity);
    const next = g.adj.map((list, u) =>
      list.filter((v) => from[u] + g.costs[v] === from[v] && from[v] + to[v] === cost)
    );
    const reliability = (path) =>
      path.reduce(
        (value, node) =>
          value * (board.cells[g.nodes[node][0]].passable === false ? board.cells[g.nodes[node][0]].forceChance : 1),
        1
      );
    let best = null,
      bestReliability = -1,
      bestScore = -1,
      bestOpportunity = -1,
      states = 0,
      complete = true;
    function consider(path, direct, opportunity) {
      const score = count(direct),
        potentialScore = count(opportunity),
        chance = reliability(path);
      if (
        chance > bestReliability ||
        (chance === bestReliability &&
          (potentialScore > bestOpportunity || (potentialScore === bestOpportunity && score > bestScore)))
      ) {
        bestReliability = chance;
        bestOpportunity = potentialScore;
        bestScore = score;
        best = [...path];
      }
    }
    function seed(ids) {
      if (
        !Array.isArray(ids) ||
        !ids.length ||
        ids.at(-1) !== target ||
        ids.some(
          (id, i) =>
            !Number.isInteger(id) || !board.cells[id] || (i > 0 && !neighbors(ids[i - 1], board.size).includes(id))
        )
      )
        return;
      const nodePath = [];
      for (const id of ids) if (g.nodeOf[id] !== nodePath.at(-1)) nodePath.push(g.nodeOf[id]);
      const originIndex = nodePath.findLastIndex((node) => starts.includes(node) && to[node] === cost);
      if (originIndex < 0) return;
      nodePath.splice(0, originIndex);
      if (
        nodePath.some((v) => v < 0) ||
        new Set(nodePath).size !== nodePath.length ||
        nodePath.some((v, i) => i > 0 && !next[nodePath[i - 1]].includes(v))
      )
        return;
      let direct = baseline.direct,
        potential = baseline.opportunity;
      for (const node of nodePath) {
        direct |= masks[node];
        potential |= opportunities[node];
      }
      consider(nodePath, direct, potential);
    }
    // A previous suffix may win ties, but never override connectivity, cost or better coverage.
    seed(options.preferredPath);
    function visit(u, path, mask, opportunity) {
      if (states >= maxStates) {
        complete = false;
        return;
      }
      states++;
      const combined = mask | masks[u];
      const potential = opportunity | opportunities[u];
      if (u === end) {
        consider(path, combined, potential);
        return;
      }
      const candidates = next[u]
        .filter((v) => !path.includes(v))
        .sort(
          (a, b) =>
            count(opportunities[b] & ~potential) - count(opportunities[a] & ~potential) ||
            count(masks[b] & ~combined) - count(masks[a] & ~combined) ||
            a - b
        );
      for (const v of candidates) {
        visit(v, [...path, v], combined, potential);
        if (!complete) break;
      }
    }
    // Seed several interior corridors before bounded DFS, so large maps do not
    // spend the entire budget exploring variants of the first edge-hugging branch.
    if (!knownOnly && sources.includes(0) && target === board.cells.length - 1) {
      const n = board.size;
      for (let x = 1; x < n - 1; x++)
        for (let y = 1; y < n - 1; y++)
          for (const transpose of [false, true]) {
            const points = [
              [0, 0],
              [x, 0],
              [x, y],
              [n - 2, y],
              [n - 2, n - 1],
              [n - 1, n - 1]
            ];
            const ids = [0];
            for (let k = 1; k < points.length; k++) {
              let [a, b] = points[k - 1];
              const [c, d] = points[k];
              while (a !== c || b !== d) {
                if (a !== c) a += Math.sign(c - a);
                else b += Math.sign(d - b);
                ids.push(transpose ? a * n + b : b * n + a);
              }
            }
            seed(ids);
          }
    }
    for (const start of starts) {
      if (to[start] === cost) visit(start, [start], baseline.direct, baseline.opportunity);
    }
    // A bounded exploration still always returns a minimum-cost route.
    if (!best) {
      const queue = starts.filter((id) => to[id] === cost).map((id) => [id]),
        seen = new Set(queue.map(([id]) => id));
      while (queue.length) {
        const p = queue.shift(),
          u = p.at(-1);
        if (u === end) {
          best = p;
          break;
        }
        for (const v of next[u])
          if (!seen.has(v)) {
            seen.add(v);
            queue.push([...p, v]);
          }
      }
    }
    const origin = sources.find((id) => g.nodeOf[id] === best[0]);
    const path = expand(best, g, board, target, origin);
    const score = scoreRoute(board, [...committed, ...best.flatMap((node) => g.nodes[node])]);
    // The selected known or queued origin is free, even if it has not been entered yet.
    const newCells = path.slice(1).filter((id) => !board.cells[id].entered);
    return {
      path,
      source: origin,
      newCells,
      cost: newCells.length,
      ...score,
      explorationOptimal: complete,
      searchedStates: states,
      uncertain: path.some(
        (id) =>
          !board.cells[id].revealed ||
          (board.cells[id].type === "challenge" && !board.cells[id].visited && board.cells[id].passable !== true)
      ),
      next: path.slice(1).find((id) => !board.cells[id].visited) ?? null
    };
  }
  function plan(input, options = {}) {
    const board = normalize(input),
      limit = options.maxStates ?? 20000;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200000) throw new Error("搜索上限无效");
    const { sources, planned } = planningOrigins(board, input.queue);
    const scoring = { committed: [...planned], preferredPath: options.preferredPath };
    let main = solve(board, board.cells.length - 1, false, limit, sources, false, scoring);
    let breakthrough = null,
      forceStatus = "";
    if (!main && input.forcePlanningEnabled) {
      breakthrough = solve(board, board.cells.length - 1, false, limit, sources, true, scoring);
      if (breakthrough) {
        const forcedRooms = [...new Set(breakthrough.path.filter((id) => board.cells[id].passable === false))];
        Object.assign(breakthrough, {
          forcedRooms,
          forceCount: forcedRooms.length,
          forceSuccess: forcedRooms.reduce((chance, id) => chance * board.cells[id].forceChance, 1),
          availableShrouds: Number.isInteger(input.shroudCount) && input.shroudCount >= 0 ? input.shroudCount : null
        });
        if (breakthrough.availableShrouds !== null && breakthrough.forceCount <= breakthrough.availableShrouds) {
          main = breakthrough;
          forceStatus = "ready";
        } else forceStatus = breakthrough.availableShrouds === null ? "unknown-count" : "insufficient";
      } else forceStatus = input.shroudInfoKnown ? "ineligible" : "unknown-item";
    }
    if (main && main !== breakthrough) Object.assign(main, { forcedRooms: [], forceCount: 0, forceSuccess: 1 });
    const treasures = [];
    board.cells.forEach((c, id) => {
      if (c.type === "treasure" && c.revealed && !c.visited && !planned.has(id) && !main?.path.includes(id)) {
        const route = solve(board, id, true, 1, sources);
        if (route) treasures.push({ target: id, ...route });
      }
    });
    treasures.sort((a, b) => a.cost - b.cost || a.target - b.target);
    return { main, treasures, breakthrough, forceStatus };
  }
  return { neighbors, normalize, plan, scoreRoute };
});
