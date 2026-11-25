// Adapted from 迷宫胜率计算器 1.6.0, dakonglong, MIT. See docs/THIRD_PARTY.md.
(function (root) {
  "use strict";
  root.MwiLabyrinthCalculatorModules ||= {};
  root.MwiLabyrinthCalculatorModules["controller"] = function (ctx) {
    ctx.isCalculableRoom = function isCalculableRoom(room) {
      return room?.roomType === ctx.LABYRINTH_COMBAT_ROOM_TYPE || room?.roomType === ctx.LABYRINTH_SKILLING_ROOM_TYPE;
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

    let lastProfileCheckRevision = -1;
    let lastProfileCheckIdentity = "";
    let lastProfileCheckDone = false;

    ctx.resetControllerProfileCheck = function resetControllerProfileCheck() {
      lastProfileCheckRevision = -1;
      lastProfileCheckIdentity = "";
      lastProfileCheckDone = false;
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
      const currentIdentity = ctx.storageIdentity?.() || "";
      const currentRevision = Number(ctx.inputRevision) || 0;
      const profileCheckStale =
        !lastProfileCheckDone ||
        currentRevision !== lastProfileCheckRevision ||
        currentIdentity !== lastProfileCheckIdentity;
      if (ctx.isAutomationEstimatePanelVisible()) {
        const curveStatus = ctx.getCurvePrecomputeStatus?.();
        if (
          profileCheckStale ||
          curveStatus?.stage === "idle" ||
          (curveStatus?.stage === "paused" && !curveStatus?.userPaused)
        ) {
          ctx.scheduleBackgroundCurvePrecompute?.(state);
        }
      }

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
      const initClientData = ctx.getInitClientData();
      if (initClientData && typeof ctx.detectRoomProfileChanges === "function") {
        if (profileCheckStale) {
          lastProfileCheckDone = true;
          lastProfileCheckRevision = currentRevision;
          lastProfileCheckIdentity = currentIdentity;
          const diff = ctx.detectRoomProfileChanges(state, initClientData);
          if (!diff.identityChanged && (diff.changedSkills.length || diff.changedMonsters.length)) {
            const changedSkillSet = new Set(diff.changedSkills);
            const changedMonsterSet = new Set(diff.changedMonsters);
            const affectedCombatKeys = [];
            const colCount = Array.isArray(roomRows[0]) ? roomRows[0].length : 0;
            const roomCells = colCount > 0 ? ctx.findRoomGridCells(flatRooms.length) : [];
            for (let idx = 0; idx < flatRooms.length; idx += 1) {
              const room = flatRooms[idx];
              if (!room) continue;
              const roomKey = colCount > 0 ? `${idx % colCount},${Math.floor(idx / colCount)}` : "";
              if (!roomKey) continue;
              if (room.roomType === ctx.LABYRINTH_SKILLING_ROOM_TYPE && changedSkillSet.has(room.skillHrid)) {
                const cell = roomCells[idx];
                if (cell && ctx.isRoomResultDisplayable(state, roomKey, cell)) {
                  const profile = diff.skillProfiles.get(room.skillHrid);
                  const updated = ctx.computeRoomClearChance(state, initClientData, room, diff.maxEnhancementByItem, {
                    labyrinthUpgradeLevels: diff.labyrinthUpgradeLevels,
                    profile
                  });
                  if (updated) {
                    ctx.upsertBadge(cell, updated.clearChance, updated.expectedSecondsPerClear, updated.debug);
                    ctx.updateRoomEstimate(roomKey, updated);
                    if (updated.skillingPreview) ctx.setCellSkillingPreview(cell, updated.skillingPreview);
                    ctx.saveRoomResult?.(state, roomKey, updated, cell);
                  }
                }
              } else if (room.roomType === ctx.LABYRINTH_COMBAT_ROOM_TYPE && changedMonsterSet.has(room.monsterHrid)) {
                const cell = roomCells[idx];
                if (cell && ctx.isRoomResultDisplayable(state, roomKey, cell)) {
                  affectedCombatKeys.push(roomKey);
                }
              }
            }
            if (affectedCombatKeys.length) {
              ctx.invalidateSavedRoomKeys?.(state, affectedCombatKeys);
              for (const key of affectedCombatKeys) ctx.pendingAutoRecalcRoomKeys?.add(key);
            }
          }
          ctx.scheduleBackgroundCurvePrecompute?.(state, {
            maxEnhancementByItem: diff.maxEnhancementByItem,
            labyrinthUpgradeLevels: diff.labyrinthUpgradeLevels,
            combatProfiles: diff.combatProfiles,
            skillProfiles: diff.skillProfiles
          });
        } else {
          const curveStatus = ctx.getCurvePrecomputeStatus?.();
          if (curveStatus?.stage === "idle" || (curveStatus?.stage === "paused" && !curveStatus?.userPaused)) {
            ctx.scheduleBackgroundCurvePrecompute?.(state);
          }
        }
      }
      ctx.scheduleAutoRecalcIfNeeded(state);
      return panel;
    };

    ctx.updateRoomBadges = async function updateRoomBadges(options = {}) {
      if (ctx.destroyed) return false;
      ctx.ensureStyle();
      ctx.hidePreviewTooltip();
      ctx.lastLabyrinthCalcDoneMessage = ctx.t("calcDone");
      ctx.lastLabyrinthCalcHadFailures = false;
      ctx.lastLabyrinthCalcFailedItems = [];

      const state = options.snapshot?.state || ctx.getGameState();
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
      const runSignature = options.snapshot?.floorSignature ?? ctx.getLabyrinthDisplaySignature(state);
      ctx.lastLabyrinthDisplaySignature = runSignature;

      function isRunStale() {
        if (options.snapshot) return options.snapshot.isStale();
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
      const initClientData = ctx.getInitClientData();
      const maxEnhancementByItem = ctx.buildMaxEnhancementByItem(state);
      const labyrinthUpgradeLevels = options.snapshot?.labyrinthUpgradeLevels || ctx.getLabyrinthUpgradeLevels(true);
      const deferUpgradesToHover = Boolean(ctx.COMBAT_UPGRADE_ON_HOVER && !options.eagerCombatUpgrades);
      const combatUpgrades = deferUpgradesToHover ? [] : ctx.getCombatUpgradeOptions(labyrinthUpgradeLevels);
      const activeCombatUpgradeCount = combatUpgrades.filter(({ cost }) => cost !== null).length;
      const deferCombatUpgrades =
        !deferUpgradesToHover &&
        activeCombatUpgradeCount > 0 &&
        typeof ctx.computeCombatRoomUpgradeImpact === "function";
      const combatUnits = combatTrials * (1 + activeCombatUpgradeCount);
      const skillingProfileCache = new Map();
      const combatProfileCache = new Map();
      const getCachedSkillingProfile = (skillHrid) => {
        if (!skillHrid || typeof ctx.extractSkillingProfile !== "function") return null;
        if (!skillingProfileCache.has(skillHrid)) {
          skillingProfileCache.set(
            skillHrid,
            ctx.extractSkillingProfile(state, initClientData, skillHrid, maxEnhancementByItem, {
              labyrinthUpgradeLevels
            })
          );
        }
        return skillingProfileCache.get(skillHrid);
      };
      const getCachedCombatProfile = (monsterHrid) => {
        if (!monsterHrid || typeof ctx.extractCombatProfile !== "function") return null;
        if (!combatProfileCache.has(monsterHrid)) {
          combatProfileCache.set(
            monsterHrid,
            ctx.extractCombatProfile(state, initClientData, monsterHrid, maxEnhancementByItem, {
              labyrinthUpgradeLevels
            })
          );
        }
        return combatProfileCache.get(monsterHrid);
      };
      let totalUnits = 0;
      for (const i of targetIndexes) {
        if (flatRooms[i]?.roomType === ctx.LABYRINTH_COMBAT_ROOM_TYPE) totalUnits += combatUnits;
        if (flatRooms[i]?.roomType === ctx.LABYRINTH_SKILLING_ROOM_TYPE) totalUnits++;
      }
      const progressTracker = ctx.createProgressTracker(totalUnits);
      const targetCount = targetIndexes.length;
      const failedItems = [];
      const pendingUpgrades = [];

      function createBoundedProgressTracker(maxUnits, message) {
        let added = 0;
        return {
          add(units = 1, customMessage) {
            const parsed = Number(units);
            const n = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
            const delta = Math.min(Math.max(0, maxUnits - added), n);
            if (delta > 0) {
              added += delta;
              progressTracker.add(delta, customMessage || message);
            }
          },
          complete() {
            const remaining = Math.max(0, maxUnits - added);
            if (remaining > 0) {
              added = maxUnits;
              progressTracker.add(remaining, message);
            }
          }
        };
      }

      function formatRoomLabel(room, roomKey) {
        const zh = ctx.isChineseUi ? ctx.isChineseUi() : true;
        let name = "";
        if (room?.roomType === ctx.LABYRINTH_COMBAT_ROOM_TYPE && room?.monsterHrid) {
          const tail = String(room.monsterHrid).split("/").pop() || "";
          name = String(
            (zh &&
              (ctx.LABYRINTH_MONSTER_NAME_ZH_BY_TAIL?.[tail] ||
                ctx.LABYRINTH_MONSTER_NAME_ZH_MAP?.[room.monsterHrid])) ||
              initClientData?.combatMonsterDetailMap?.[room.monsterHrid]?.name ||
              tail ||
              room.monsterHrid
          );
        } else if (room?.roomType === ctx.LABYRINTH_SKILLING_ROOM_TYPE && room?.skillHrid) {
          const tail = String(room.skillHrid).split("/").pop() || "";
          name = String(initClientData?.skillDetailMap?.[room.skillHrid]?.name || tail || room.skillHrid);
        }
        const coords = roomKey ? `(${roomKey})` : "";
        return name && coords ? `${name} ${coords}` : name || coords || (zh ? "未知房间" : "Room");
      }

      function formatUpgradeLabel(upgradeKey) {
        const zh = ctx.isChineseUi ? ctx.isChineseUi() : true;
        const info = ctx.COMBAT_STAT_UPGRADES?.find((entry) => entry.key === upgradeKey);
        if (info) return zh ? info.zh : info.en;
        return (
          String(upgradeKey || "")
            .split("/")
            .pop() || String(upgradeKey || "")
        );
      }

      function formatFailureSummary(items) {
        const zh = ctx.isChineseUi ? ctx.isChineseUi() : true;
        const details = items
          .map((item) => {
            const scope = item.upgradeKeys?.length
              ? `${item.label}${zh ? " 升级收益" : " upgrades"}[${item.upgradeKeys.map(formatUpgradeLabel).join(zh ? "、" : ", ")}]`
              : item.label;
            return item.reason ? `${scope}${zh ? `（${item.reason}）` : ` (${item.reason})`}` : scope;
          })
          .join(zh ? "；" : "; ");
        return zh
          ? `部分计算失败（${items.length} 项）：${details}`
          : `Partial calculation failure (${items.length}): ${details}`;
      }

      function clearRoomDisplay(room, cell, roomKey) {
        ctx.removeBadge?.(cell);
        ctx.clearCellSkillingPreview?.(cell);
        ctx.clearCellCombatPreview?.(cell);
        if (ctx.isCalculableRoom(room)) {
          ctx.clearRoomEstimate?.(roomKey);
        }
      }

      function applyRoomResult(room, cell, roomKey, result) {
        if (!result) {
          clearRoomDisplay(room, cell, roomKey);
          if (!ctx.isCalculableRoom(room)) {
            const rewardOnlyPreview = ctx.buildRewardOnlyPreview(state, room);
            if (rewardOnlyPreview) {
              ctx.setCellSkillingPreview(cell, rewardOnlyPreview);
            }
          }
        } else {
          if (ctx.isRoomResultDisplayable(ctx.getGameState(), roomKey, cell))
            ctx.upsertBadge(cell, result.clearChance, result.expectedSecondsPerClear, result.debug);
          else ctx.removeBadge?.(cell);
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
              ctx.bindSkillingPreviewEvents?.(cell);
            }
          }
        }
        ctx.saveRoomResult?.(state, roomKey, result, cell);
      }

      async function calculateRoom(targetPos) {
        if (isRunStale()) return;

        const i = targetIndexes[targetPos];
        const room = flatRooms[i];
        const cell = roomCells[i];
        const roomX = colCount > 0 ? i % colCount : -1;
        const roomY = colCount > 0 ? Math.floor(i / colCount) : -1;
        const roomKey = roomX >= 0 && roomY >= 0 ? `${roomX},${roomY}` : "";
        if (!cell) return;

        const roomProgressMessage = hasTargetRoomFilter
          ? ctx.t("roomFmt", { current: targetPos + 1, total: targetCount })
          : ctx.t("roomFmt", { current: i + 1, total: flatRooms.length });
        const combatProgressMessage = hasTargetRoomFilter
          ? ctx.t("combatFmt", { current: targetPos + 1, total: targetCount })
          : ctx.t("combatFmt", { current: i + 1, total: flatRooms.length });

        let result = null;
        if (room?.roomType === ctx.LABYRINTH_SKILLING_ROOM_TYPE) {
          try {
            result = ctx.computeRoomClearChance(state, initClientData, room, maxEnhancementByItem, {
              labyrinthUpgradeLevels,
              profile: getCachedSkillingProfile(room.skillHrid)
            });
            progressTracker.add(1, roomProgressMessage);
          } catch (error) {
            if (isRunStale()) return;
            console.error("[Lab Clear Rate] room calculation failed:", roomKey, error);
            progressTracker.add(1, roomProgressMessage);
            clearRoomDisplay(room, cell, roomKey);
            failedItems.push({
              targetPos,
              roomKey,
              label: formatRoomLabel(room, roomKey),
              reason: error?.message || String(error)
            });
            return;
          }
        } else if (room?.roomType === ctx.LABYRINTH_COMBAT_ROOM_TYPE) {
          const baseBudget = deferCombatUpgrades ? combatTrials : combatUnits;
          const roomTracker = createBoundedProgressTracker(baseBudget, combatProgressMessage);
          const combatProfile = getCachedCombatProfile(room.monsterHrid);
          const roomLv = Math.max(1, Math.floor(Number(room?.recommendedLevel) || 1));
          const isFastCurveHit = Boolean(
            combatProfile &&
            typeof ctx.lookupCombatLevelSync === "function" &&
            ctx.lookupCombatLevelSync(combatProfile, roomLv, Math.min(combatTrials, 250))
          );
          if (!isFastCurveHit) {
            ctx.setControlStatus({
              running: true,
              message: combatProgressMessage
            });
          }
          try {
            result = await ctx.computeCombatRoomClearChance(
              state,
              initClientData,
              room,
              maxEnhancementByItem,
              roomTracker,
              combatTrials,
              roomKey,
              {
                labyrinthUpgradeLevels,
                profile: combatProfile,
                deferUpgradesToHover,
                allowBaseCurveHit: true,
                priority: 0,
                ...(deferCombatUpgrades || deferUpgradesToHover ? {} : { combatUpgrades }),
                parallel: true,
                isRunStale
              }
            );
          } catch (error) {
            if (isRunStale()) return;
            console.error("[Lab Clear Rate] room calculation failed:", roomKey, error);
            roomTracker.complete();
            if (deferCombatUpgrades)
              progressTracker.add(combatTrials * activeCombatUpgradeCount, combatProgressMessage);
            clearRoomDisplay(room, cell, roomKey);
            failedItems.push({
              targetPos,
              roomKey,
              label: formatRoomLabel(room, roomKey),
              reason: error?.message || String(error)
            });
            return;
          }
          if (isRunStale()) return;
          roomTracker.complete();
          if (deferCombatUpgrades && !result) {
            progressTracker.add(combatTrials * activeCombatUpgradeCount, combatProgressMessage);
          }
        }

        if (isRunStale()) return;

        applyRoomResult(room, cell, roomKey, result);
        if (deferCombatUpgrades && result && room?.roomType === ctx.LABYRINTH_COMBAT_ROOM_TYPE) {
          pendingUpgrades.push({ targetPos, i, room, cell, roomKey, result });
        }

        if ((targetPos + 1) % 2 === 0) {
          await ctx.nextFrame();
        }
      }

      // Phase 1: compute and display every room's base clear chance first.
      // Single-room failures stay isolated so the rest of the floor still finishes.
      let nextTarget = 0;
      const lanes = Math.min(targetCount, ctx.getCombatParallelism());
      await Promise.all(
        Array.from({ length: lanes }, async () => {
          while (nextTarget < targetCount && !isRunStale()) {
            await calculateRoom(nextTarget++);
          }
        })
      );
      if (isRunStale()) return false;

      // Phase 2: backfill combat upgrade impact without delaying map win-rate badges.
      if (pendingUpgrades.length > 0) {
        pendingUpgrades.sort((a, b) => a.targetPos - b.targetPos);
        let nextUpgrade = 0;
        const upgradeTotal = pendingUpgrades.length;
        const upgradeLanes = Math.min(upgradeTotal, ctx.getCombatParallelism());
        const upgradeBudget = combatTrials * activeCombatUpgradeCount;
        await Promise.all(
          Array.from({ length: upgradeLanes }, async () => {
            while (nextUpgrade < upgradeTotal && !isRunStale()) {
              const pos = nextUpgrade++;
              const entry = pendingUpgrades[pos];
              const upgradeMessage = ctx.t("combatUpgradeFmt", { current: pos + 1, total: upgradeTotal });
              const upgradeTracker = createBoundedProgressTracker(upgradeBudget, upgradeMessage);
              ctx.setControlStatus({
                running: true,
                message: upgradeMessage
              });
              try {
                const outcome = await ctx.computeCombatRoomUpgradeImpact(
                  state,
                  initClientData,
                  entry.room,
                  maxEnhancementByItem,
                  upgradeTracker,
                  combatTrials,
                  entry.roomKey,
                  {
                    labyrinthUpgradeLevels,
                    combatUpgrades,
                    parallel: true,
                    isRunStale,
                    tolerateUpgradeErrors: true
                  }
                );
                if (isRunStale()) return;
                upgradeTracker.complete();
                if (outcome?.upgradeImpact) {
                  entry.result.upgradeImpact = outcome.upgradeImpact;
                  if (ctx.isRoomResultDisplayable(ctx.getGameState(), entry.roomKey, entry.cell)) {
                    const combatPreview = ctx.buildCombatPreview(state, entry.room, initClientData, entry.result);
                    if (combatPreview) {
                      ctx.setCellCombatPreview(entry.cell, combatPreview);
                    }
                    ctx.saveRoomResult?.(state, entry.roomKey, entry.result, entry.cell);
                  } else {
                    ctx.removeBadge?.(entry.cell);
                    ctx.clearCellCombatPreview?.(entry.cell);
                  }
                }
                if (outcome?.failedUpgrades?.length) {
                  const firstError = outcome.failedUpgrades[0].error;
                  console.error("[Lab Clear Rate] combat upgrade calculation failed:", entry.roomKey, firstError);
                  failedItems.push({
                    targetPos: entry.targetPos,
                    roomKey: entry.roomKey,
                    label: formatRoomLabel(entry.room, entry.roomKey),
                    upgradeKeys: outcome.failedUpgrades.map((item) => item.key),
                    reason: firstError?.message || String(firstError)
                  });
                }
              } catch (error) {
                if (isRunStale()) return;
                console.error("[Lab Clear Rate] combat upgrade calculation failed:", entry.roomKey, error);
                upgradeTracker.complete();
                failedItems.push({
                  targetPos: entry.targetPos,
                  roomKey: entry.roomKey,
                  label: formatRoomLabel(entry.room, entry.roomKey),
                  upgradeKeys: combatUpgrades.filter(({ cost }) => cost !== null).map(({ key }) => key),
                  reason: error?.message || String(error)
                });
              }
              if ((pos + 1) % 2 === 0) {
                await ctx.nextFrame();
              }
            }
          })
        );
      }

      if (isRunStale()) return false;
      if (failedItems.length > 0) {
        failedItems.sort((a, b) => a.targetPos - b.targetPos);
        ctx.lastLabyrinthCalcHadFailures = true;
        ctx.lastLabyrinthCalcFailedItems = failedItems;
        const doneMessage = formatFailureSummary(failedItems);
        ctx.lastLabyrinthCalcDoneMessage = doneMessage;
        progressTracker.finish(doneMessage);
        ctx.setControlStatus({
          running: false,
          ratio: 1,
          error: true,
          message: doneMessage
        });
        return true;
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

      let snapshot;
      try {
        const live = ctx.getGameState();
        if (live?.characterLabyrinth) {
          snapshot = ctx.createCalculationRunSnapshot(live);
          snapshot.floorSignature = ctx.getLabyrinthDisplaySignature(live);
          if (ctx.roomDistributionEnabled && trigger !== "auto-new-tiles")
            snapshot.inputSignature = ctx.calculationSignature(live);
          snapshot.isStale = () =>
            ctx.destroyed ||
            snapshot.cancelled ||
            ctx.storageIdentity() !== snapshot.identity ||
            ctx.getLabyrinthDisplaySignature(ctx.getGameState()) !== snapshot.floorSignature;
          runOptions.snapshot = snapshot;
          ctx.activeFloorRun = snapshot;
        }
        const ok = await ctx.updateRoomBadges(runOptions);
        if (ctx.destroyed) return;
        if (ok && !snapshot?.isStale()) {
          if (
            trigger !== "auto-new-tiles" &&
            ctx.roomDistributionEnabled &&
            !ctx.isRoomDistributionUnsupportedDevice()
          ) {
            try {
              await ctx.calculateCurrentFloorRoomDistribution(runOptions);
            } catch (distributionError) {
              if (ctx.destroyed || snapshot?.isStale()) return;
              console.error("[Lab Clear Rate] room distribution calculation failed:", distributionError);
            }
          }
          if (snapshot?.isStale()) return;
          // A tile revealed mid-run was not part of this calculation and still needs its own pass.
          if (snapshot) {
            ctx.updateAutoRecalcBaseline(snapshot.state);
            ctx.scheduleBackgroundCurvePrecompute?.(snapshot.state, {
              labyrinthUpgradeLevels: snapshot.labyrinthUpgradeLevels
            });
          }
          ctx.setControlStatus({
            running: false,
            ratio: 1,
            error: Boolean(ctx.lastLabyrinthCalcHadFailures),
            message: ctx.lastLabyrinthCalcDoneMessage || ctx.t("calcDone")
          });
        }
      } catch (error) {
        if (ctx.destroyed || snapshot?.isStale()) return;
        console.error("[Lab Clear Rate] manual update failed:", error);
        if (trigger === "auto-new-tiles") {
          const latestState = snapshot?.state || ctx.getGameState();
          if (latestState?.characterLabyrinth) {
            ctx.updateAutoRecalcBaseline(latestState);
          }
        }
        ctx.setControlStatus({
          running: false,
          error: true,
          message: [ctx.t("calcFailed"), error?.message || String(error)].join(" · ")
        });
      } finally {
        if (typeof ctx.scheduleIdleCombatWorkerRelease === "function") ctx.scheduleIdleCombatWorkerRelease(60000);
        else ctx.releaseIdleCombatWorkers();
        ctx.activeFloorRun = null;
        ctx.manualUpdateRunning = false;
        if (!ctx.destroyed && snapshot?.isStale())
          ctx.setControlStatus({ running: false, ratio: 0, message: ctx.t("pending") });
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
