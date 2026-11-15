const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const core = require("../src/core.js");
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/runtime/map-reader.js"), "utf8"), context);
const read = context.MwiLabyrinthMapReader.read;
function fixture() {
  const nodes = Array.from({ length: 9 }, (_, id) => ({
    dataset: { roomX: String(id % 3), roomY: String(Math.floor(id / 3)) },
    className: id === 0 ? "LabyrinthPanel_clearedRoom_hash" : "LabyrinthPanel_fogRoom_hash",
    level: null,
    querySelector(selector) {
      return selector.includes("roomLevel") ? this.level : null;
    }
  }));
  const grid = { querySelectorAll: () => nodes };
  return { nodes, document: { querySelector: () => grid } };
}
function level(node, blocked) {
  node.level = {
    textContent: "Lv.73",
    className: `LabyrinthPanel_roomLevel_hash ${blocked ? "LabyrinthPanel_roomLevelWarning_hash" : ""}`
  };
}
test("等级警告为障碍，白色可通行，未揭示格仍未知", () => {
  const f = fixture();
  level(f.nodes[1], true);
  level(f.nodes[3], false);
  const map = read(f.document);
  assert.equal(map.cells[1].passable, false);
  assert.equal(map.cells[3].passable, true);
  assert.equal(map.cells[2].passable, null);
  assert.equal(map.cells[2].revealed, false);
  assert.equal(core.plan(map).main.source, 3);
  assert.ok(!core.plan(map).main.path.includes(1));
});
test("同一地图警告更新后立即使用新规则，不保留手动覆盖", () => {
  const f = fixture();
  level(f.nodes[1], true);
  level(f.nodes[3], true);
  assert.equal(core.plan(read(f.document)).main, null);
  level(f.nodes[1], false);
  assert.equal(core.plan(read(f.document)).main.source, 1);
  level(f.nodes[1], true);
  level(f.nodes[3], false);
  assert.equal(core.plan(read(f.document)).main.source, 3);
});
test("已通关房不因残留警告被阻断，缺少等级不猜测可通行", () => {
  const f = fixture();
  level(f.nodes[1], true);
  f.nodes[1].className = "LabyrinthPanel_clearedRoom_hash";
  f.nodes[3].level = { textContent: "", className: "LabyrinthPanel_roomLevel_hash" };
  const map = read(f.document);
  assert.equal(map.cells[1].passable, true);
  assert.equal(map.cells[3].passable, null);
});
test("队列扩展的 visibleRoom 样式不代表揭示，也不代表已经进入", () => {
  const f = fixture();
  f.nodes[1].className = "LabyrinthPanel_visibleRoom_hash";
  f.nodes[1].querySelector = (selector) => (selector.includes("queueNumber") ? { textContent: "2" } : null);
  f.nodes[3].querySelector = (selector) => (selector.includes("queueNumber") ? { textContent: "1" } : null);
  const map = read(f.document);
  assert.equal(map.cells[1].revealed, false);
  assert.equal(map.cells[1].entered, false);
  assert.equal(map.cells[1].visited, false);
  assert.deepEqual(Array.from(map.queue), [3, 1]);
  assert.equal(core.plan(map).main.cost, 3);
  assert.equal(map.cells[1].queueOrder, undefined);
});

test("只有有效原生编号才作为已规划房间，孤立编号不提供起点", () => {
  const f = fixture();
  let number = "1";
  f.nodes[7].querySelector = (selector) => (selector.includes("queueNumber") ? { textContent: number } : null);
  for (const value of ["1", "8", " 12 "]) {
    number = value;
    const map = read(f.document);
    assert.deepEqual(Array.from(map.queue), [7]);
    assert.equal(map.cells[7].revealed, false);
    assert.equal(core.plan(map).main.source, 0);
    assert.equal(core.plan(map).main.cost, 4);
  }
  for (const value of ["", "0", "-1", "预览", "1.5", "9007199254740992"]) {
    number = value;
    assert.deepEqual(Array.from(read(f.document).queue), []);
  }
});

test("楼层范围使用匹配地图的当前层，本次挑战和角色共同标识楼层", () => {
  const f = fixture();
  const state = {
    character: { id: "a" },
    characterLabyrinth: {
      currentFloor: 6,
      startedAt: "run-a",
      roomData: Array.from({ length: 3 }, () => Array(3).fill(null))
    }
  };
  const map = read(f.document, state);
  assert.equal(map.floor, 6);
  assert.equal(map.floorKey, JSON.stringify(["a", "run-a", 6]));
  state.characterLabyrinth.startedAt = "run-b";
  assert.notEqual(read(f.document, state).floorKey, map.floorKey);
  state.character.id = "b";
  assert.equal(read(f.document, state).floorKey, JSON.stringify(["b", "run-b", 6]));
  for (const value of [undefined, null, 0, -1, 1.5, "6"]) {
    state.characterLabyrinth.currentFloor = value;
    assert.equal(read(f.document, state).floor, null);
  }
  state.characterLabyrinth.currentFloor = 6;
  state.characterLabyrinth.roomData = [[]];
  assert.equal(read(f.document, state).floorKey, null);
  assert.equal(read(f.document).floor, null);
});

test("探照灯按钮位于地图容器外侧，预览实时去重且退出后清除", () => {
  const f = fixture();
  let item = "#expert_beacon";
  const button = { textContent: "使用" };
  const supply = {
    querySelectorAll(selector) {
      if (selector === "use,image,img") return [{ getAttribute: () => item }];
      if (selector === "button") return [button];
      return [];
    }
  };
  const panel = { querySelectorAll: () => [supply] };
  const activeRun = { parentElement: panel, querySelectorAll: () => [] };
  const grid = f.document.querySelector();
  grid.closest = () => activeRun;
  assert.equal(read(f.document).beaconMode, false);
  button.textContent = "X";
  assert.equal(read(f.document).beaconMode, true);
  assert.equal(read(f.document).beaconPreviewCount, null);
  f.nodes[0].className += " LabyrinthPanel_supplyHover_hash LabyrinthPanel_beaconPreview_hash";
  level(f.nodes[1], false);
  for (const id of [1, 2, 8]) f.nodes[id].className += " LabyrinthPanel_beaconPreview_hash";
  assert.equal(read(f.document).beaconPreviewCount, 1); // Exclude known, cleared and exit rooms.
  assert.equal(read(f.document).beaconPreviewCount, 1);
  f.nodes[2].className = "LabyrinthPanel_fogRoom_hash";
  assert.equal(read(f.document).beaconPreviewCount, 0);
  for (const node of f.nodes) node.className = node.className.replaceAll(" LabyrinthPanel_beaconPreview_hash", "");
  assert.equal(read(f.document).beaconPreviewCount, 0);
  button.textContent = "使用";
  assert.equal(read(f.document).beaconPreviewCount, null);
  button.textContent = "X";
  item = "#expert_shroud";
  assert.equal(read(f.document).beaconMode, false);
  assert.equal(read(f.document).beaconPreviewCount, null);
});

test("原生队列按编号排序，重复编号保守忽略，顺序改变会影响连接", () => {
  const f = fixture();
  const orders = { 1: "1", 4: "2" };
  for (const id of [1, 4])
    f.nodes[id].querySelector = (selector) => (selector.includes("queueNumber") ? { textContent: orders[id] } : null);
  assert.deepEqual(Array.from(read(f.document).queue), [1, 4]);
  assert.equal(core.plan(read(f.document)).main.source, 4);
  orders[1] = "2";
  orders[4] = "1";
  assert.deepEqual(Array.from(read(f.document).queue), [4, 1]);
  assert.equal(core.plan(read(f.document)).main.source, 1);
  orders[1] = "1";
  assert.deepEqual(Array.from(read(f.document).queue), []);
});
