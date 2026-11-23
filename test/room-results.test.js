const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "../src/calculator/room-results.js"), "utf8");
function fixture(store = new Map()) {
  let identity = "a",
    state = {
      characterLabyrinth: {
        startedAt: "run1",
        currentFloor: 1,
        roomData: [[{ roomType: "skilling" }, { roomType: "new" }]]
      }
    };
  let cells = [0, 1].map(() => ({
    badge: null,
    querySelector() {
      return this.badge;
    }
  }));
  const ctx = {
    setTimeout: () => 1,
    clearTimeout() {},
    storageIdentity: () => identity,
    getGameState: () => state,
    storage: {
      getItem: (key, owner = identity) => store.get(`${owner}:${key}`) ?? null,
      setItem: (key, value, owner = identity) => store.set(`${owner}:${key}`, value),
      removeItem: (key) => store.delete(`${identity}:${key}`)
    },
    bindFloorExitPreview() {},
    skillingPreviewByCell: new WeakMap(),
    combatPreviewByCell: new WeakMap(),
    latestRoomEstimateByRoomKey: new Map(),
    BADGE_CLASS: "badge",
    isCalculableRoom: (room) => ["skilling", "new"].includes(room?.roomType),
    removeBadge: (cell) => {
      cell.badge = null;
    },
    clearCellSkillingPreview: (cell) => ctx.skillingPreviewByCell.delete(cell),
    clearCellCombatPreview: (cell) => ctx.combatPreviewByCell.delete(cell),
    clearRoomEstimate: (key) => ctx.latestRoomEstimateByRoomKey.delete(key),
    findRoomGridCells: () => cells,
    clearDisplayedRoomData() {
      ctx.skillingPreviewByCell = new WeakMap();
      ctx.combatPreviewByCell = new WeakMap();
      ctx.latestRoomEstimateByRoomKey.clear();
      for (const cell of cells) cell.badge = null;
    },
    upsertBadge: (cell, p, t) => {
      cell.badge = { p, t };
    },
    updateRoomEstimate: (key, value) => ctx.latestRoomEstimateByRoomKey.set(key, value),
    setCellSkillingPreview: (cell, value) => ctx.skillingPreviewByCell.set(cell, value),
    setCellCombatPreview: (cell, value) => ctx.combatPreviewByCell.set(cell, value),
    updateAutoRecalcBaseline: () => {
      ctx.autoRecalcArmed = true;
    },
    refreshControlPanelPlacement() {},
    getLabyrinthDisplaySignature: () => "fallback",
    clearSingleRoomDisplay: (_state, key) => ctx.latestRoomEstimateByRoomKey.delete(key),
    getNewCalculableRoomKeys: () => ["0,0", "1,0"],
    runManualUpdate: async () => {},
    setControlStatus: (v) => {
      ctx.status = v;
    }
  };
  const root = { MwiLabyrinthCalculatorModules: {} };
  vm.runInNewContext(source, root);
  root.MwiLabyrinthCalculatorModules["room-results"](ctx);
  return {
    ctx,
    store,
    get state() {
      return state;
    },
    get cells() {
      return cells;
    },
    changeIdentity: (id) => {
      identity = id;
    },
    changeState: (v) => {
      state = v;
    },
    redraw: () => {
      cells = cells.map(() => ({
        badge: null,
        querySelector() {
          return this.badge;
        }
      }));
    }
  };
}
function save(f, seconds = 25) {
  f.ctx.syncRoomResultScope(f.state);
  f.ctx.setCellSkillingPreview(f.cells[0], {
    type: "skilling",
    upgradePreviewVersion: 1,
    workPower: 123,
    speedTierClearChance: 0.9
  });
  f.ctx.saveRoomResult(
    f.state,
    "0,0",
    { clearChance: 0.8, expectedSecondsPerClear: seconds, debug: "result" },
    f.cells[0]
  );
  f.ctx.flushRoomResults();
}
test("新房间与 DOM 重建保留结果，刷新恢复完整预览和无穷耗时", () => {
  const f = fixture();
  save(f, Infinity);
  const signature = f.ctx.getLabyrinthDisplaySignature(f.state);
  f.state.characterLabyrinth.roomData[0][1] = { roomType: "new" };
  assert.equal(f.ctx.getLabyrinthDisplaySignature(f.state), signature);
  f.redraw();
  f.ctx.refreshControlPanelPlacement();
  assert.equal(f.cells[0].badge.t, Infinity);
  assert.equal(f.ctx.skillingPreviewByCell.get(f.cells[0]).workPower, 123);
  assert.equal(f.ctx.latestRoomEstimateByRoomKey.size, 1);
  assert.deepEqual(Array.from(f.ctx.getNewCalculableRoomKeys(f.state)), ["1,0"]);
  const refreshed = fixture(f.store);
  refreshed.ctx.refreshControlPanelPlacement();
  assert.equal(refreshed.cells[0].badge.t, Infinity);
  assert.equal(refreshed.ctx.skillingPreviewByCell.get(refreshed.cells[0]).speedTierClearChance, 0.9);
});
test("切换角色隔离结果，临时缺数据不删除，下层或新挑战删除旧层", () => {
  const f = fixture();
  save(f);
  const previous = f.state;
  f.changeState(null);
  f.ctx.refreshControlPanelPlacement();
  assert.equal(f.store.size, 1);
  f.changeState(previous);
  f.ctx.refreshControlPanelPlacement();
  f.changeIdentity("b");
  f.ctx.refreshControlPanelPlacement();
  assert.equal(f.cells[0].badge, null);
  f.changeIdentity("a");
  f.ctx.refreshControlPanelPlacement();
  assert.equal(f.cells[0].badge.t, 25);
  f.state.characterLabyrinth.currentFloor++;
  f.ctx.refreshControlPanelPlacement();
  assert.equal(f.cells[0].badge, null);
  assert.equal(f.store.size, 0);
  save(f);
  f.state.characterLabyrinth.startedAt = "run2";
  f.ctx.refreshControlPanelPlacement();
  assert.equal(f.cells[0].badge, null);
  assert.equal(f.store.size, 0);
});
test("自动补算不清旧结果，手动重算立即清除且刷新不会复活", async () => {
  const f = fixture();
  save(f);
  await f.ctx.runManualUpdate({ trigger: "auto-new-tiles" });
  assert.equal(f.store.size, 1);
  f.ctx.manualUpdateRunning = true;
  await f.ctx.runManualUpdate();
  assert.equal(f.store.size, 1);
  f.ctx.manualUpdateRunning = false;
  await f.ctx.runManualUpdate();
  assert.equal(f.store.size, 0);
  const refreshed = fixture(f.store);
  refreshed.ctx.refreshControlPanelPlacement();
  assert.equal(refreshed.cells[0].badge, null);
});
test("未知角色、损坏存档与存储失败不影响当前计算或串用旧数据", async () => {
  const f = fixture();
  f.changeIdentity("");
  save(f);
  assert.equal(f.store.size, 0);
  f.changeIdentity("a");
  f.store.set("a:mwi-labyrinth:calculator:room-results:v1", "broken");
  f.ctx.refreshControlPanelPlacement();
  assert.equal(f.store.size, 0);
  f.ctx.storage.setItem = () => {};
  save(f);
  assert.equal(f.ctx.roomResultsStorageError, true);
  await f.ctx.runManualUpdate({ trigger: "auto-new-tiles" });
  assert.match(f.ctx.status.message, /保存失败/);
  f.redraw();
  f.ctx.restoreSavedRoomResults(f.state);
  assert.equal(f.cells[0].badge.t, 25);
});

test("进入地图自动安排缺失房间，等待客户端数据并防止并发重复", () => {
  const f = fixture();
  let ready = false,
    calls = 0;
  // Test the module with the real scheduling entry point supplied at installation.
  const root = { MwiLabyrinthCalculatorModules: {} };
  vm.runInNewContext(source, root);
  const ctx = {
    ...f.ctx,
    getInitClientData: () => (ready ? {} : null),
    scheduleAutoRecalcIfNeeded: () => {
      calls++;
    }
  };
  root.MwiLabyrinthCalculatorModules["room-results"](ctx);
  ctx.scheduleAutoRecalcIfNeeded(f.state);
  assert.equal(calls, 0);
  ready = true;
  ctx.scheduleAutoRecalcIfNeeded(f.state);
  assert.equal(calls, 1);
  assert.equal(ctx.autoRecalcArmed, true);
  assert.equal(ctx.lastCalculatedCalculableRoomEntries.size, 0);
  ctx.manualUpdateRunning = true;
  ctx.scheduleAutoRecalcIfNeeded(f.state);
  assert.equal(calls, 1);
});

test("通关、空房和已通关 DOM 不显示旧胜率，记录仍保留且刷新不复活", () => {
  for (const kind of ["cleared", "empty", "dom"]) {
    const f = fixture();
    save(f);
    f.ctx.restoreSavedRoomResults(f.state);
    const raw = [...f.store.values()][0];
    const apply = (target) => {
      if (kind === "cleared") target.state.characterLabyrinth.roomData[0][0].isCleared = true;
      if (kind === "empty") target.state.characterLabyrinth.roomData[0][0] = {};
      if (kind === "dom") target.cells[0].className = "LabyrinthPanel_clearedRoom_fixture";
    };
    apply(f);
    f.ctx.refreshControlPanelPlacement();
    assert.equal(f.cells[0].badge, null);
    assert.equal(f.ctx.skillingPreviewByCell.has(f.cells[0]), false);
    assert.equal([...f.store.values()][0], raw);
    const restored = fixture(f.store);
    apply(restored);
    restored.ctx.refreshControlPanelPlacement();
    assert.equal(restored.cells[0].badge, null);
  }
});

test("旧版升级详情保留显示并重新计算，补齐花费与升级后经验", () => {
  const f = fixture();
  save(f);
  assert.equal(f.ctx.hasSavedRoomResult(f.state, "0,0"), true);
  f.ctx.setCellSkillingPreview(f.cells[0], { type: "skilling", workPower: 123 });
  f.ctx.saveRoomResult(f.state, "0,0", { clearChance: 0.8, expectedSecondsPerClear: 25 }, f.cells[0]);
  assert.equal(f.ctx.hasSavedRoomResult(f.state, "0,0"), false);
  f.redraw();
  f.ctx.restoreSavedRoomResults(f.state);
  assert.equal(f.ctx.skillingPreviewByCell.get(f.cells[0]).workPower, 123);
  assert.ok(f.ctx.getNewCalculableRoomKeys(f.state).includes("0,0"));
  save(f);
  assert.equal(f.ctx.hasSavedRoomResult(f.state, "0,0"), true);
});

test("战斗内核升级后旧缓存继续显示并补算，新签名缓存正常复用", () => {
  const f = fixture();
  f.ctx.COMBAT_MODEL_SIGNATURE = "new-completed-engine";
  f.ctx.syncRoomResultScope(f.state);
  f.ctx.setCellCombatPreview(f.cells[0], { type: "combat", combatModelSignature: "old-engine" });
  f.ctx.saveRoomResult(f.state, "0,0", { clearChance: 0.6, expectedSecondsPerClear: 30 }, f.cells[0]);
  assert.equal(f.ctx.hasSavedRoomResult(f.state, "0,0"), false);
  f.redraw();
  f.ctx.restoreSavedRoomResults(f.state);
  assert.equal(f.cells[0].badge.p, 0.6);
  assert.equal(f.ctx.combatPreviewByCell.get(f.cells[0]).combatModelSignature, "old-engine");
  f.ctx.setCellCombatPreview(f.cells[0], { type: "combat", combatModelSignature: f.ctx.COMBAT_MODEL_SIGNATURE });
  f.ctx.saveRoomResult(f.state, "0,0", { clearChance: 0.8, expectedSecondsPerClear: 20 }, f.cells[0]);
  assert.equal(f.ctx.hasSavedRoomResult(f.state, "0,0"), false);
  const upgradeImpact = { "/labyrinth_upgrades/critical_rate": { level: 1, cost: 80, clearChance: 0.82 } };
  f.ctx.setCellCombatPreview(f.cells[0], {
    type: "combat",
    combatModelSignature: f.ctx.COMBAT_MODEL_SIGNATURE,
    upgradeImpact
  });
  f.ctx.saveRoomResult(f.state, "0,0", { clearChance: 0.8, expectedSecondsPerClear: 20 }, f.cells[0]);
  assert.equal(f.ctx.hasSavedRoomResult(f.state, "0,0"), false);
  upgradeImpact["/labyrinth_upgrades/critical_rate"].experiencePerHour = 0;
  f.ctx.saveRoomResult(f.state, "0,0", { clearChance: 0.8, expectedSecondsPerClear: 20 }, f.cells[0]);
  f.redraw();
  f.ctx.restoreSavedRoomResults(f.state);
  assert.deepEqual(structuredClone(f.ctx.combatPreviewByCell.get(f.cells[0]).upgradeImpact), upgradeImpact);
  assert.equal(f.ctx.hasSavedRoomResult(f.state, "0,0"), true);
});

test("整批房间只保存一次，切角色前的待写结果使用原角色，失败可重试", () => {
  const f = fixture();
  let writes = 0;
  const original = f.ctx.storage.setItem;
  f.ctx.storage.setItem = (...args) => {
    writes++;
    return original(...args);
  };
  f.ctx.syncRoomResultScope(f.state);
  for (let i = 0; i < 50; i++)
    f.ctx.saveRoomResult(f.state, `${i},0`, { clearChance: 0.5, expectedSecondsPerClear: 20 }, f.cells[0]);
  assert.equal(writes, 0);
  assert.equal(f.ctx.hasSavedRoomResult(f.state, "0,0"), true);
  f.changeIdentity("b");
  f.ctx.syncRoomResultScope(f.state);
  assert.equal(writes, 1);
  assert.equal(f.store.size, 1);
  assert.ok(f.store.has("a:mwi-labyrinth:calculator:room-results:v1"));
  assert.equal(JSON.parse([...f.store.values()][0]).rooms.length, 50);
  f.ctx.storage.setItem = () => {};
  f.ctx.saveRoomResult(f.state, "0,0", { clearChance: 0.7, expectedSecondsPerClear: 10 }, f.cells[0]);
  assert.equal(f.ctx.flushRoomResults(), false);
  assert.equal(f.ctx.roomResultsStorageError, true);
  f.ctx.storage.setItem = original;
  assert.equal(f.ctx.flushRoomResults(), true);
  assert.equal(f.ctx.roomResultsStorageError, false);
  assert.equal(f.store.size, 2);
});

test("批次取消或抛错也提交已完成房间，重置后定时器不能复活旧数据", async () => {
  const f = fixture();
  const root = { MwiLabyrinthCalculatorModules: {} };
  vm.runInNewContext(source, root);
  f.ctx.runManualUpdate = async () => {
    f.ctx.saveRoomResult(f.state, "0,0", { clearChance: 0.5, expectedSecondsPerClear: 10 }, f.cells[0]);
    throw new Error("cancel fixture");
  };
  root.MwiLabyrinthCalculatorModules["room-results"](f.ctx);
  await assert.rejects(f.ctx.runManualUpdate(), /cancel fixture/);
  assert.equal(f.store.size, 1);
  f.ctx.resetSavedRoomResults(f.state);
  f.ctx.flushRoomResults();
  assert.equal(f.store.size, 0);
});
