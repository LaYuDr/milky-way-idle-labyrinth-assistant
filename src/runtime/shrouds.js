(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MwiLabyrinthShrouds = api;
})(globalThis, function () {
  "use strict";
  // Game client getShroudSuccessRate: no rewards/XP, -2 percentage points per level above the item tier.
  const levels = { "/items/basic_shroud": 50, "/items/advanced_shroud": 100, "/items/expert_shroud": 999 };
  function success(item, level) {
    if (!Object.hasOwn(levels, item) || !Number.isFinite(level) || level < 0) return null;
    return Math.max(0, 1 - Math.max(0, level - levels[item]) * 0.02);
  }
  function apply(map, state) {
    const labyrinth = state?.characterLabyrinth;
    const rows = labyrinth?.roomData;
    const matched =
      Array.isArray(rows) &&
      rows.length === map.size &&
      rows.every((row) => Array.isArray(row) && row.length === map.size);
    const item = matched ? labyrinth.shroudItemHrid : null;
    const rawCount = matched ? labyrinth.shroudCount : null;
    map.forcePlanningEnabled = true;
    map.shroudInfoKnown = Object.hasOwn(levels, item);
    map.shroudCount = Number.isInteger(rawCount) && rawCount >= 0 ? rawCount : null;
    for (const cell of map.cells) {
      // Only the already visible level is used; no hidden room data is consulted.
      const match = String(cell.label || "").match(/^(?:Lv\.?\s*)?(\d+)$/i);
      cell.forceChance = cell.revealed && cell.type === "challenge" && match ? success(item, Number(match[1])) : null;
    }
    return map;
  }
  return { success, apply };
});
