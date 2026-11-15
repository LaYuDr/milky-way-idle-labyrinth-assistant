// Adapted from 迷宫胜率计算器 1.6.0, dakonglong, MIT. See docs/THIRD_PARTY.md.
(function (root) {
  "use strict";
  root.MwiLabyrinthCalculatorModules ||= {};
  root.MwiLabyrinthCalculatorModules["controller"] = function (ctx) {
    ctx.isCalculableRoom = function isCalculableRoom(room) {
      return room?.roomType === ctx.LABYRINTH_COMBAT_ROOM_TYPE || room?.roomType === ctx.LABYRINTH_SKILLING_ROOM_TYPE;
    };

    ctx.getTotalProgressUnits = function getTotalProgressUnits(rooms, combatTrials) {
      const trials = ctx.normalizeCombatSimTrials(combatTrials);
      let total = 0;
      for (const room of rooms) {
        if (room?.roomType === ctx.LABYRINTH_COMBAT_ROOM_TYPE) {
          total += trials;
        } else if (room?.roomType === ctx.LABYRINTH_SKILLING_ROOM_TYPE) {
          total += 1;
        }
      }
      return total;
    };

    ctx.getTotalProgressUnitsForIndexes = function getTotalProgressUnitsForIndexes(rooms, indexes, combatTrials) {
      const trials = ctx.normalizeCombatSimTrials(combatTrials);
      let total = 0;
      for (const index of indexes) {
        const room = rooms[index];
        if (room?.roomType === ctx.LABYRINTH_COMBAT_ROOM_TYPE) {
          total += trials;
        } else if (room?.roomType === ctx.LABYRINTH_SKILLING_ROOM_TYPE) {
          total += 1;
        }
      }
      return total;
    };

    ctx.parseRoomKeyToIndex = function parseRoomKeyToIndex(roomKey, colCount, totalCount) {
      if (!roomKey || !Number.isInteger(colCount) || colCount <= 0) {
        return -1;
      }
      const [xRaw, yRaw] = String(roomKey).split(",");
      const x = Number(xRaw);
      const y = Number(yRaw);
      if (!Number.isInteger(x) || !Number.isInteger(y)) {
        return -1;
      }
      if (x < 0 || y < 0 || x >= colCount) {
        return -1;
      }
      const index = y * colCount + x;
      if (!Number.isInteger(index) || index < 0 || index >= totalCount) {
        return -1;
      }
      return index;
    };

    ctx.getTargetRoomIndexes = function getTargetRoomIndexes(flatRooms, colCount, roomKeys) {
      const totalCount = Array.isArray(flatRooms) ? flatRooms.length : 0;
      if (!totalCount) {
        return [];
      }
      if (!Array.isArray(roomKeys) || roomKeys.length === 0) {
        return Array.from({ length: totalCount }, (_unused, index) => index);
      }
      const indexes = new Set();
      for (const roomKey of roomKeys) {
        const index = ctx.parseRoomKeyToIndex(roomKey, colCount, totalCount);
        if (index < 0) {
          continue;
        }
        if (!ctx.isCalculableRoom(flatRooms[index])) {
          continue;
        }
        indexes.add(index);
      }
      return Array.from(indexes).sort((a, b) => a - b);
    };

    ctx.refreshControlPanelPlacement = function refreshControlPanelPlacement() {
      ctx.syncVisibleLabyrinthUpgradeLevelsCache();
      if (ctx.roomDistributionEnabled && ctx.isRoomDistributionUnsupportedDevice()) {
        ctx.setRoomDistributionEnabled(false);
      }
      const state = ctx.getGameState();
      ctx.refreshLiveActionRateDisplay(state);
      ctx.syncRoomLogSessionState(state);
      if (!state || !state.characterLabyrinth) {
        ctx.markLabyrinthTransition("");
        ctx.hidePreviewTooltip();
        ctx.clearAutomationWideLayout();
        ctx.automationEstimateSignatureByRoomTypeKey.clear();
        // Temporary missing game state must not erase the last recommendation.
        ctx.automationRecommendSignatureByRoomTypeKey.clear();
        ctx.automationEstimateStatusText = ctx.t("pending");
        ctx.automationEstimateRunning = false;
        ctx.automationEstimateRunningMode = "";
        ctx.removeAutomationEstimateColumn(ctx.getAutomationEstimateTable());
        ctx.removeAutomationRecommendColumn(ctx.getAutomationEstimateTable());
        const existing = ctx.getControlPanel();
        if (existing && !ctx.manualUpdateRunning) {
          existing.remove();
        }
        return null;
      }

      // Automation page should render independently from active labyrinth room grid data.
      ctx.refreshAutomationEstimatePanel(state);

      const roomRows = Array.isArray(state.characterLabyrinth.roomData) ? state.characterLabyrinth.roomData : [];
      const flatRooms = roomRows.flat();
      if (!flatRooms.length) {
        if (ctx.isAutomationEstimatePanelVisible()) {
          ctx.markLabyrinthTransitionPreserveTooltip("");
        } else {
          ctx.markLabyrinthTransition("");
          ctx.hidePreviewTooltip();
        }
        return null;
      }

      const signature = ctx.getLabyrinthDisplaySignature(state);
      if (signature && signature !== ctx.lastLabyrinthDisplaySignature) {
        ctx.markLabyrinthTransition(signature);
        ctx.setControlStatus({
          running: false,
          ratio: 0,
          message: ctx.t("pending")
        });
      }

      ctx.syncCompletedRoomCleanup(state);
      ctx.pruneInvalidRoomDisplays(state);

      const gridParent = ctx.findRoomGridParent(flatRooms.length);
      if (!gridParent) {
        if (!ctx.isAutomationEstimatePanelVisible()) {
          ctx.hidePreviewTooltip();
        }
        return null;
      }
      const panel = ctx.ensureControlPanel(gridParent);
      if (ctx.roomDistributionEnabled) {
        ctx.renderRoomDistributionPanel();
      }
      ctx.scheduleAutoRecalcIfNeeded(state);
      return panel;
    };

    ctx.updateRoomBadges = async function updateRoomBadges(options = {}) {
      if (ctx.destroyed) return false;
      ctx.ensureStyle();
      ctx.hidePreviewTooltip();
      ctx.lastLabyrinthCalcDoneMessage = ctx.t("calcDone");

      const state = ctx.getGameState();
      if (!state || !state.characterLabyrinth || !Array.isArray(state.characterLabyrinth.roomData)) {
        ctx.markLabyrinthTransition("");
        ctx.setControlStatus({
          running: false,
          ratio: 0,
          message: ctx.t("notInLabyrinth")
        });
        return false;
      }

      const roomRows = state.characterLabyrinth.roomData;
      const flatRooms = roomRows.flat();
      const colCount = Array.isArray(roomRows[0]) ? roomRows[0].length : 0;
      const targetRoomKeys = Array.isArray(options?.roomKeys) ? options.roomKeys : [];
      const hasTargetRoomFilter = targetRoomKeys.length > 0;
      if (!flatRooms.length) {
        ctx.markLabyrinthTransition("");
        ctx.setControlStatus({
          running: false,
          ratio: 0,
          message: ctx.t("noLabyrinthData")
        });
        return false;
      }
      const runSignature = ctx.getLabyrinthDisplaySignature(state);
      ctx.lastLabyrinthDisplaySignature = runSignature;

      function isRunStale() {
        const latestSignature = ctx.getLabyrinthDisplaySignature(ctx.getGameState());
        return ctx.destroyed || Boolean(runSignature && latestSignature !== runSignature);
      }

      const roomCells = ctx.findRoomGridCells(flatRooms.length);
      if (roomCells.length !== flatRooms.length) {
        ctx.setControlStatus({
          running: false,
          ratio: 0,
          message: ctx.t("cellsNotFound")
        });
        return false;
      }
      ctx.ensureControlPanel(roomCells[0]?.parentElement || null);

      const combatTrials = ctx.saveCombatSimTrialsSetting(ctx.getSelectedCombatSimTrials());
      const targetIndexes = ctx.getTargetRoomIndexes(flatRooms, colCount, targetRoomKeys);
      if (hasTargetRoomFilter && targetIndexes.length === 0) {
        ctx.setControlStatus({
          running: false,
          ratio: 1,
          message: ctx.t("noNewTiles")
        });
        return true;
      }
      const progressTracker = ctx.createProgressTracker(
        hasTargetRoomFilter
          ? ctx.getTotalProgressUnitsForIndexes(flatRooms, targetIndexes, combatTrials)
          : ctx.getTotalProgressUnits(flatRooms, combatTrials)
      );
      const initClientData = ctx.getInitClientData();
      const maxEnhancementByItem = ctx.buildMaxEnhancementByItem(state);
      const labyrinthUpgradeLevels = ctx.getLabyrinthUpgradeLevels(true);
      const targetCount = targetIndexes.length;

      for (let targetPos = 0; targetPos < targetCount; targetPos += 1) {
        if (ctx.destroyed) return false;
        if (isRunStale()) {
          ctx.markLabyrinthTransition(ctx.getLabyrinthDisplaySignature(ctx.getGameState()));
          ctx.setControlStatus({
            running: false,
            ratio: 0,
            message: ctx.t("pending")
          });
          return false;
        }

        const i = targetIndexes[targetPos];
        const room = flatRooms[i];
        const cell = roomCells[i];
        const roomX = colCount > 0 ? i % colCount : -1;
        const roomY = colCount > 0 ? Math.floor(i / colCount) : -1;
        const roomKey = roomX >= 0 && roomY >= 0 ? `${roomX},${roomY}` : "";
        if (!cell) {
          continue;
        }

        const roomProgressMessage = hasTargetRoomFilter
          ? ctx.t("roomFmt", { current: targetPos + 1, total: targetCount })
          : ctx.t("roomFmt", { current: i + 1, total: flatRooms.length });
        const combatProgressMessage = hasTargetRoomFilter
          ? ctx.t("combatFmt", { current: targetPos + 1, total: targetCount })
          : ctx.t("combatFmt", { current: i + 1, total: flatRooms.length });

        let result = null;
        if (room?.roomType === ctx.LABYRINTH_SKILLING_ROOM_TYPE) {
          result = ctx.computeRoomClearChance(state, initClientData, room, maxEnhancementByItem, {
            labyrinthUpgradeLevels
          });
          progressTracker.add(1, roomProgressMessage);
        } else if (room?.roomType === ctx.LABYRINTH_COMBAT_ROOM_TYPE) {
          ctx.setControlStatus({
            running: true,
            message: combatProgressMessage
          });
          result = await ctx.computeCombatRoomClearChance(
            state,
            initClientData,
            room,
            maxEnhancementByItem,
            progressTracker,
            combatTrials,
            roomKey,
            { labyrinthUpgradeLevels }
          );
        }

        if (ctx.destroyed) return false;
        if (isRunStale()) {
          ctx.markLabyrinthTransition(ctx.getLabyrinthDisplaySignature(ctx.getGameState()));
          ctx.setControlStatus({
            running: false,
            ratio: 0,
            message: ctx.t("pending")
          });
          return false;
        }

        if (!result) {
          ctx.removeBadge(cell);
          ctx.clearCellSkillingPreview(cell);
          ctx.clearCellCombatPreview(cell);
          if (ctx.isCalculableRoom(room)) {
            ctx.clearRoomEstimate(roomKey);
          } else {
            const rewardOnlyPreview = ctx.buildRewardOnlyPreview(state, room);
            if (rewardOnlyPreview) {
              ctx.setCellSkillingPreview(cell, rewardOnlyPreview);
            }
          }
        } else {
          if (ctx.isRoomResultDisplayable(ctx.getGameState(), roomKey, cell))
            ctx.upsertBadge(cell, result.clearChance, result.expectedSecondsPerClear, result.debug);
          else ctx.removeBadge(cell);
          if (ctx.isCalculableRoom(room)) {
            ctx.updateRoomEstimate(roomKey, result);
          }
          if (result.skillingPreview) {
            ctx.setCellSkillingPreview(cell, result.skillingPreview);
          } else {
            ctx.clearCellSkillingPreview(cell);
          }
          const combatPreview = ctx.buildCombatPreview(state, room, initClientData, result);
          if (combatPreview) {
            ctx.setCellCombatPreview(cell, combatPreview);
          } else {
            ctx.clearCellCombatPreview(cell);
            if (room?.roomType === ctx.LABYRINTH_COMBAT_ROOM_TYPE && room?.monsterHrid) {
              ctx.bindSkillingPreviewEvents(cell);
            }
          }
        }

        ctx.saveRoomResult?.(state, roomKey, result, cell);

        if ((targetPos + 1) % 2 === 0) {
          await ctx.nextFrame();
        }
      }

      const doneMessage = ctx.buildLabyrinthCalcDoneMessage(state, flatRooms, targetIndexes);
      ctx.lastLabyrinthCalcDoneMessage = doneMessage;
      progressTracker.finish(doneMessage);
      return true;
    };

    ctx.runManualUpdate = async function runManualUpdate(options = {}) {
      if (ctx.manualUpdateRunning) {
        return;
      }
      if (ctx.autoRecalcTimerId) {
        ctx.window.clearTimeout(ctx.autoRecalcTimerId);
        ctx.autoRecalcTimerId = 0;
      }
      ctx.pendingAutoRecalcRoomKeys.clear();
      const trigger = String(options?.trigger || "manual");
      const runOptions = {
        ...(options && typeof options === "object" ? options : {})
      };

      ctx.manualUpdateRunning = true;
      ctx.setControlStatus({
        running: true,
        ratio: 0,
        message: trigger === "auto-new-tiles" ? ctx.t("autoNewTiles") : ctx.t("preparing")
      });

      try {
        const ok = await ctx.updateRoomBadges(runOptions);
        if (ctx.destroyed) return;
        if (ok) {
          if (
            trigger !== "auto-new-tiles" &&
            ctx.roomDistributionEnabled &&
            !ctx.isRoomDistributionUnsupportedDevice()
          ) {
            try {
              await ctx.calculateCurrentFloorRoomDistribution(runOptions);
            } catch (distributionError) {
              console.error("[Lab Clear Rate] room distribution calculation failed:", distributionError);
            }
          }
          const latestState = ctx.getGameState();
          if (latestState?.characterLabyrinth) {
            ctx.updateAutoRecalcBaseline(latestState);
          }
          ctx.setControlStatus({
            running: false,
            ratio: 1,
            message: ctx.lastLabyrinthCalcDoneMessage || ctx.t("calcDone")
          });
        }
      } catch (error) {
        if (ctx.destroyed) return;
        console.error("[Lab Clear Rate] manual update failed:", error);
        if (trigger === "auto-new-tiles") {
          const latestState = ctx.getGameState();
          if (latestState?.characterLabyrinth) {
            ctx.updateAutoRecalcBaseline(latestState);
          }
        }
        ctx.setControlStatus({
          running: false,
          message: ctx.t("calcFailed")
        });
      } finally {
        ctx.manualUpdateRunning = false;
      }
    };

    ctx.schedulePanelRefresh = function schedulePanelRefresh() {
      if (ctx.destroyed || ctx.panelRefreshTimerId) {
        return;
      }
      ctx.panelRefreshTimerId = ctx.window.setTimeout(() => {
        ctx.panelRefreshTimerId = 0;
        ctx.refreshControlPanelPlacement();
      }, ctx.PANEL_REFRESH_DEBOUNCE_MS);
    };
  };
})(globalThis);
