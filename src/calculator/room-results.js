(function (root) {
  "use strict";
  root.MwiLabyrinthCalculatorModules["room-results"] = function (ctx) {
    const key = "mwi-labyrinth:calculator:room-results:v1";
    const encode = (value) => JSON.stringify(value, (_key, v) => (v === Infinity ? { mwiLabNumber: "Infinity" } : v));
    const decode = (value) =>
      JSON.parse(value, (_key, v) =>
        v && typeof v === "object" && Object.keys(v).length === 1 && v.mwiLabNumber === "Infinity" ? Infinity : v
      );
    let scope = "",
      records = new Map(),
      dirty = false,
      saveTimer = null;
    const pending = new Map();
    ctx.roomResultsStorageError = false;
    ctx.flushRoomResults = () => {
      if (saveTimer !== null) ctx.clearTimeout(saveTimer);
      saveTimer = null;
      if (dirty && scope) {
        const owner = JSON.parse(scope)[0];
        pending.set(owner, { schema: 1, scope, rooms: [...records.values()] });
        dirty = false;
      }
      for (const [owner, payload] of pending) {
        try {
          const raw = encode(payload);
          if (raw.length > 2000000) continue;
          ctx.storage.setItem(key, raw, owner);
          if (ctx.storage.getItem(key, owner) === raw) pending.delete(owner);
        } catch {
          // Keep the pending snapshot for retry; never write it under the live owner.
        }
      }
      ctx.roomResultsStorageError = pending.has(ctx.storageIdentity());
      return pending.size === 0;
    };
    if (typeof document !== "undefined") {
      ctx.listen(ctx.window, "pagehide", ctx.flushRoomResults);
      ctx.listen(document, "visibilitychange", () => {
        if (document.hidden) ctx.flushRoomResults();
      });
    }
    ctx.roomResultScope = (state) => {
      const labyrinth = state?.characterLabyrinth,
        identity = ctx.storageIdentity();
      return identity && labyrinth?.startedAt && Number.isInteger(labyrinth.currentFloor)
        ? JSON.stringify([identity, String(labyrinth.startedAt), labyrinth.currentFloor])
        : "";
    };
    ctx.syncRoomResultScope = (state) => {
      const next = ctx.roomResultScope(state);
      // Loading, temporary navigation and missing identity must not erase the saved floor.
      if (!next || next === scope) return next;
      ctx.flushRoomResults();
      scope = next;
      records = new Map();
      ctx.roomResultsStorageError = false;
      ctx.clearDisplayedRoomData();
      const raw = ctx.storage.getItem(key);
      if (!raw) return next;
      try {
        if (raw.length > 2000000) throw new Error("Room results too large");
        const data = decode(raw);
        if (data.schema !== 1 || data.scope !== scope || !Array.isArray(data.rooms) || data.rooms.length > 4096)
          throw new Error("Room results scope or schema mismatch");
        for (const entry of data.rooms) {
          if (!/^\d{1,2},\d{1,2}$/.test(entry?.key) || !Number.isFinite(entry.savedAt)) continue;
          const r = entry.result;
          if (
            r &&
            (!Number.isFinite(r.clearChance) ||
              r.clearChance < 0 ||
              r.clearChance > 1 ||
              !(
                r.expectedSecondsPerClear === Infinity ||
                (Number.isFinite(r.expectedSecondsPerClear) && r.expectedSecondsPerClear >= 0)
              ))
          )
            continue;
          if (!r && !entry.skillingPreview && !entry.combatPreview) continue;
          records.set(entry.key, entry);
        }
      } catch {
        ctx.storage.removeItem(key);
      }
      return next;
    };
    ctx.resetSavedRoomResults = (state) => {
      if (!ctx.syncRoomResultScope(state)) return;
      if (saveTimer !== null) ctx.clearTimeout(saveTimer);
      saveTimer = null;
      dirty = false;
      pending.delete(ctx.storageIdentity());
      records.clear();
      ctx.storage.removeItem(key);
      ctx.roomResultsStorageError = ctx.storage.getItem(key) !== null;
      ctx.clearDisplayedRoomData();
    };
    ctx.saveRoomResult = (state, roomKey, result, cell) => {
      // Do not let an old asynchronous simulation write into a different floor or character.
      if (!scope || ctx.roomResultScope(state) !== scope || ctx.roomResultScope(ctx.getGameState()) !== scope) return;
      const skillingPreview = ctx.skillingPreviewByCell.get(cell) || null;
      const combatPreview = ctx.combatPreviewByCell.get(cell) || null;
      if (!result && !skillingPreview && !combatPreview) return;
      const entry = decode(
        encode({
          key: roomKey,
          savedAt: Date.now(),
          result: result
            ? {
                clearChance: result.clearChance,
                expectedSecondsPerClear: result.expectedSecondsPerClear ?? Infinity,
                debug: String(result.debug || "")
              }
            : null,
          skillingPreview,
          combatPreview
        })
      );
      records.set(roomKey, entry);
      dirty = true;
      if (saveTimer === null) saveTimer = ctx.setTimeout(ctx.flushRoomResults, 250);
    };
    ctx.isRoomResultDisplayable = (state, roomKey, cell) => {
      const [x, y] = roomKey.split(",").map(Number);
      const room = state?.characterLabyrinth?.roomData?.[y]?.[x];
      return (
        ctx.isCalculableRoom(room) &&
        room.isCleared !== true &&
        !String(cell?.className || "").includes("LabyrinthPanel_clearedRoom")
      );
    };
    ctx.hasSavedRoomResult = (state, roomKey) => {
      if (ctx.roomResultScope(state) !== scope || !records.has(roomKey)) return false;
      const record = records.get(roomKey);
      if (record.combatPreview && record.combatPreview.combatModelSignature !== ctx.COMBAT_MODEL_SIGNATURE)
        return false;
      const preview = record.skillingPreview;
      // Keep older badges visible while the normal incremental calculation fills new preview fields.
      return !preview || preview.type === "reward-only" || preview.upgradePreviewVersion === 1;
    };
    ctx.restoreSavedRoomResults = (state) => {
      ctx.bindFloorExitPreview(state);
      if (!ctx.roomResultScope(state) || ctx.roomResultScope(state) !== scope) return;
      const rows = state.characterLabyrinth.roomData;
      if (!Array.isArray(rows) || !rows.length || !rows[0]?.length) return;
      const width = rows[0].length,
        cells = ctx.findRoomGridCells(rows.flat().length);
      if (cells.length !== rows.flat().length) return;
      rows.flat().forEach((room, index) => {
        const roomKey = `${index % width},${Math.floor(index / width)}`;
        if (
          !room?.roomType ||
          records.has(roomKey) ||
          ![ctx.LABYRINTH_TREASURE_ROOM_TYPE, ctx.LABYRINTH_DESCEND_ROOM_TYPE].includes(room.roomType)
        )
          return;
        const preview = ctx.buildRewardOnlyPreview(state, room);
        if (preview) {
          ctx.setCellSkillingPreview(cells[index], preview);
          ctx.saveRoomResult(state, roomKey, null, cells[index]);
        }
      });
      for (const entry of records.values()) {
        const [x, y] = entry.key.split(",").map(Number),
          cell = x < width && y < rows.length ? cells[y * width + x] : null;
        if (!cell) continue;
        if (entry.result && !ctx.isRoomResultDisplayable(state, entry.key, cell)) {
          ctx.removeBadge(cell);
          ctx.clearCellSkillingPreview(cell);
          ctx.clearCellCombatPreview(cell);
          ctx.clearRoomEstimate(entry.key);
          continue;
        }
        if (entry.result && !cell.querySelector(`.${ctx.BADGE_CLASS}`)) {
          const r = entry.result;
          ctx.upsertBadge(
            cell,
            r.clearChance,
            r.expectedSecondsPerClear,
            `${r.debug}\n上次计算：${new Date(entry.savedAt).toLocaleString()}`
          );
        }
        if (entry.result && !ctx.latestRoomEstimateByRoomKey.has(entry.key))
          ctx.updateRoomEstimate(entry.key, entry.result);
        if (entry.skillingPreview && !ctx.skillingPreviewByCell.has(cell))
          ctx.setCellSkillingPreview(cell, entry.skillingPreview);
        if (entry.combatPreview && !ctx.combatPreviewByCell.has(cell))
          ctx.setCellCombatPreview(cell, entry.combatPreview);
      }
    };
    const refresh = ctx.refreshControlPanelPlacement;
    ctx.refreshControlPanelPlacement = () => {
      if (ctx.destroyed) return null;
      ctx.syncRoomResultScope(ctx.getGameState());
      const panel = refresh();
      ctx.restoreSavedRoomResults(ctx.getGameState());
      return panel;
    };
    const signature = ctx.getLabyrinthDisplaySignature;
    ctx.getLabyrinthDisplaySignature = (state) => ctx.roomResultScope(state) || signature(state);
    const newRooms = ctx.getNewCalculableRoomKeys;
    ctx.getNewCalculableRoomKeys = (state) =>
      newRooms(state).filter(
        (roomKey) => !ctx.hasSavedRoomResult(state, roomKey) && ctx.isRoomResultDisplayable(state, roomKey)
      );
    const schedule = ctx.scheduleAutoRecalcIfNeeded;
    ctx.scheduleAutoRecalcIfNeeded = (state) => {
      if (ctx.destroyed || ctx.manualUpdateRunning || !ctx.roomResultScope(state) || !ctx.getInitClientData()) return;
      if (!ctx.autoRecalcArmed) {
        // An empty baseline discovers all currently revealed rooms; persisted rooms are filtered above.
        ctx.autoRecalcArmed = true;
        ctx.autoRecalcLabyrinthSignature = ctx.getLabyrinthDisplaySignature(state);
        ctx.lastCalculatedCalculableRoomEntries = new Set();
      }
      schedule(state);
    };
    const manual = ctx.runManualUpdate;
    ctx.runManualUpdate = async (options = {}) => {
      if (ctx.destroyed || ctx.manualUpdateRunning) return;
      const state = ctx.getGameState();
      ctx.syncRoomResultScope(state);
      if ((options.trigger || "manual") === "manual") ctx.resetSavedRoomResults(state);
      try {
        await manual(options);
      } finally {
        ctx.flushRoomResults();
      }
      if (!ctx.destroyed && ctx.roomResultsStorageError)
        ctx.setControlStatus({ running: false, message: "结果仅保留在本页，本机保存失败。请检查浏览器存储空间。" });
    };
  };
})(globalThis);
