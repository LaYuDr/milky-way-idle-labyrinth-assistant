(function (root, factory) {
  const api = factory(
    typeof module === "object" && module.exports ? require("../../../src/core.js") : root.MwiLabyrinthCore
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MwiRouteLab = api;
})(globalThis, function (core) {
  "use strict";
  function blank(size = 8) {
    if (!Number.isInteger(size) || size < 5 || size > 20) throw new Error("地图边长需为 5–20 格");
    const cells = Array.from({ length: size * size }, () => ({
      type: "unknown",
      revealed: false,
      visited: false,
      passable: null
    }));
    cells[0] = { type: "start", revealed: true, visited: true, passable: true };
    cells.at(-1).type = "exit";
    cells.at(-1).passable = true;
    return { size, cells };
  }
  function board(state) {
    const b = structuredClone(state.board);
    b.cells.forEach((cell, id) => {
      if (cell.visited) for (const v of core.neighbors(id, b.size)) b.cells[v].revealed = true;
    });
    return core.normalize(b);
  }
  function drawTo(b, path, id) {
    if (!Number.isInteger(id) || !b.cells[id]) throw new Error("路线超出地图");
    const previous = path.indexOf(id);
    if (previous >= 0) return path.slice(0, previous + 1);
    const n = b.size,
      last = path.at(-1);
    if (Math.floor(last / n) !== Math.floor(id / n) && last % n !== id % n)
      throw new Error("请接着路线末端画，只能上下左右移动。");
    const delta = Math.floor(last / n) === Math.floor(id / n) ? Math.sign(id - last) : Math.sign(id - last) * n;
    const segment = [];
    for (let v = last + delta; ; v += delta) {
      if (b.cells[v].passable === false) throw new Error("这段路线经过不能通过的房间。");
      segment.push(v);
      if (v === id) break;
    }
    const next = [...path];
    for (const v of segment) {
      const index = next.indexOf(v);
      if (index >= 0) next.length = index + 1;
      else next.push(v);
    }
    return next;
  }
  function measure(b, path) {
    const issues = [];
    if (path[0] !== 0) issues.push("路线需从入口开始");
    path.forEach((id, i) => {
      if (!Number.isInteger(id) || !b.cells[id]) issues.push("路线超出地图");
      else {
        if (b.cells[id].passable === false) issues.push("经过不能通过的房间");
        if (i && !core.neighbors(path[i - 1], b.size).includes(id)) issues.push("路线存在不相邻跳跃");
      }
    });
    const safe = path.filter((id) => b.cells[id]);
    const known = new Set(b.cells.flatMap((c, id) => (c.revealed ? [id] : [])));
    const direct = new Set(safe.flatMap((id) => [id, ...core.neighbors(id, b.size)]));
    const extra = new Set();
    for (const id of safe)
      for (const side of core.neighbors(id, b.size)) {
        const c = b.cells[side];
        if (c.passable === false || c.visited || (c.revealed && !["unknown", "treasure"].includes(c.type))) continue;
        for (const v of core.neighbors(side, b.size)) if (!direct.has(v) && !known.has(v)) extra.add(v);
      }
    const newly = new Set([...direct].filter((id) => !known.has(id)));
    const unique = new Set(safe);
    return {
      issues: [...new Set(issues)],
      complete: !issues.length && path.at(-1) === b.cells.length - 1,
      moves: Math.max(0, path.length - 1),
      cost: [...unique].filter((id) => !b.cells[id].entered).length,
      revisits: safe.length - unique.size,
      newRevealed: newly.size,
      total: new Set([...known, ...direct]).size,
      extraOpportunity: extra.size,
      opportunityReach: newly.size + extra.size,
      treasures: [...unique].filter((id) => b.cells[id].type === "treasure" && !b.cells[id].visited).length,
      known,
      direct,
      newly,
      extra
    };
  }
  function validate(value) {
    if (!value || value.schema !== 1) throw new Error("不是路线对比工具的存档");
    blank(value.board?.size);
    core.normalize(value.board);
    if (!Array.isArray(value.routes) || value.routes.length < 1 || value.routes.length > 6)
      throw new Error("需有 1–6 条路线");
    for (const r of value.routes) {
      if (
        typeof r.name !== "string" ||
        !r.name.trim() ||
        r.name.length > 30 ||
        !Array.isArray(r.path) ||
        r.path.length > 5000 ||
        r.path[0] !== 0
      )
        throw new Error("路线名称或路径无效");
      if (
        r.path.some(
          (id, i) =>
            !Number.isInteger(id) ||
            !value.board.cells[id] ||
            (i && !core.neighbors(r.path[i - 1], value.board.size).includes(id))
        )
      )
        throw new Error("存档含不相邻或越界路线");
    }
    return {
      schema: 1,
      board: structuredClone(value.board),
      routes: structuredClone(value.routes),
      selected: Math.min(Math.max(Number.isInteger(value.selected) ? value.selected : 0, 0), value.routes.length - 1)
    };
  }
  function preset(name, size = 8) {
    const b = blank(name === "original" ? 8 : name === "shortcut" ? 7 : size);
    let routes = [
      { name: "路线 A", path: [0] },
      { name: "路线 B", path: [0] }
    ];
    if (name === "original")
      routes = [
        { name: "内侧折线", path: [0, 1, 2, 10, 18, 26, 34, 42, 43, 44, 45, 46, 54, 62, 63] },
        { name: "靠边折线", path: [0, 1, 9, 17, 25, 33, 41, 49, 50, 51, 52, 53, 54, 55, 63] }
      ];
    if (name === "shortcut") {
      for (const id of [1, 8, 15, 16])
        b.cells[id] = { type: "challenge", visited: true, revealed: true, passable: true };
      for (const id of [2, 7, 9, 14, 17, 22, 23])
        b.cells[id] = { type: "challenge", visited: false, revealed: true, passable: ![14, 17, 22, 23].includes(id) };
      routes = [
        { name: "88 级起步", path: [0, 1, 2, 3, 4, 11, 18, 25, 32, 39, 46, 47, 48] },
        { name: "89 级起步", path: [0, 1, 8, 9, 10, 11, 18, 25, 32, 39, 46, 47, 48] }
      ];
    }
    return { schema: 1, board: b, routes, selected: 0 };
  }
  return { blank, board, drawTo, measure, validate, preset };
});
