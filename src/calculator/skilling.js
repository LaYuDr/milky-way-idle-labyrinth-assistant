// Adapted from 迷宫胜率计算器 1.6.0, dakonglong, MIT. See docs/THIRD_PARTY.md.
(function (root) {
  "use strict";
  root.MwiLabyrinthCalculatorModules ||= {};
  root.MwiLabyrinthCalculatorModules["skilling"] = function (ctx) {
    // A recommendation run owns this cache. Equal progress units and probabilities
    // have exactly the same distribution, even when the room level differs.
    ctx.computeNonEnhancingClearStats = function computeNonEnhancingClearStats(params, cache) {
      if (!cache) return calculateNonEnhancingClearStats(params);
      const progress = ctx.getEffectiveSkillingProgressPerSuccess(params.progressPerSuccess);
      const units = Math.ceil(params.targetProgress / progress - 1e-9);
      const key = JSON.stringify([
        params.attempts,
        ctx.clamp01(params.successChance),
        ctx.clamp01(params.doubleChance),
        units
      ]);
      if (!(progress > 0) || !Number.isFinite(units)) return calculateNonEnhancingClearStats(params);
      if (cache.has(key)) return { ...cache.get(key) };
      const result = calculateNonEnhancingClearStats(params);
      cache.set(key, result);
      return { ...result };
    };
    function calculateNonEnhancingClearStats(params) {
      const { attempts, successChance, doubleChance, progressPerSuccess, targetProgress } = params;
      const effectiveProgressPerSuccess = ctx.getEffectiveSkillingProgressPerSuccess(progressPerSuccess);

      if (!Number.isFinite(targetProgress) || targetProgress <= 0) {
        return { clearChance: 1, expectedAttemptsOnClear: 0 };
      }
      if (!Number.isFinite(attempts) || attempts <= 0) {
        return { clearChance: 0, expectedAttemptsOnClear: null };
      }
      if (!Number.isFinite(effectiveProgressPerSuccess) || effectiveProgressPerSuccess <= 0) {
        return { clearChance: 0, expectedAttemptsOnClear: null };
      }

      const p = ctx.clamp01(successChance);
      const d = ctx.clamp01(doubleChance);
      if (p <= 0) {
        return { clearChance: 0, expectedAttemptsOnClear: null };
      }

      const neededUnits = Math.ceil(targetProgress / effectiveProgressPerSuccess - 1e-9);
      if (neededUnits <= 0) {
        return { clearChance: 1, expectedAttemptsOnClear: 0 };
      }
      if (neededUnits > attempts * 2) {
        return { clearChance: 0, expectedAttemptsOnClear: null };
      }

      const q0 = 1 - p;
      const q1 = p * (1 - d);
      const q2 = p * d;

      let stateDist = new Float64Array(neededUnits + 1);
      stateDist[0] = 1;
      let expectedAttemptsNumerator = 0;

      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const nextDist = new Float64Array(neededUnits + 1);

        for (let units = 0; units <= neededUnits; units += 1) {
          const prob = stateDist[units];
          if (prob <= 0) {
            continue;
          }

          if (units === neededUnits) {
            nextDist[neededUnits] += prob;
            continue;
          }

          nextDist[units] += prob * q0;
          nextDist[Math.min(neededUnits, units + 1)] += prob * q1;
          nextDist[Math.min(neededUnits, units + 2)] += prob * q2;
        }

        const reachedNow = nextDist[neededUnits] - stateDist[neededUnits];
        if (reachedNow > 0) {
          expectedAttemptsNumerator += attempt * reachedNow;
        }

        stateDist = nextDist;
      }

      const clearChance = ctx.clamp01(stateDist[neededUnits]);
      const expectedAttemptsOnClear = clearChance > 0 ? expectedAttemptsNumerator / clearChance : null;

      return {
        clearChance,
        expectedAttemptsOnClear
      };
    }

    ctx.computeEnhancingClearStats = function computeEnhancingClearStats(params) {
      const { attempts, successChance, doubleChance, targetLevel, startLevel } = params;
      const target = Math.max(0, Math.floor(ctx.finiteNumber(targetLevel, 0)));
      const start = Math.max(0, Math.floor(ctx.finiteNumber(startLevel, 0)));
      if (target <= 0 || start >= target) {
        return { clearChance: 1, expectedAttemptsOnClear: 0 };
      }
      if (!Number.isFinite(attempts) || attempts <= 0) {
        return { clearChance: 0, expectedAttemptsOnClear: null };
      }

      const p = ctx.clamp01(successChance);
      const d = ctx.clamp01(doubleChance);
      const failChance = 1 - p;
      const singleSuccessChance = p * (1 - d);
      const doubleSuccessChance = p * d;

      let stateDist = new Float64Array(target + 1);
      stateDist[Math.min(start, target)] = 1;
      let expectedAttemptsNumerator = 0;

      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const nextDist = new Float64Array(target + 1);
        for (let level = 0; level <= target; level += 1) {
          const prob = stateDist[level];
          if (prob <= 0) {
            continue;
          }
          if (level === target) {
            nextDist[target] += prob;
            continue;
          }
          nextDist[Math.max(0, level - 1)] += prob * failChance;
          nextDist[Math.min(target, level + 1)] += prob * singleSuccessChance;
          nextDist[Math.min(target, level + 2)] += prob * doubleSuccessChance;
        }
        const reachedNow = nextDist[target] - stateDist[target];
        if (reachedNow > 0) {
          expectedAttemptsNumerator += attempt * reachedNow;
        }
        stateDist = nextDist;
      }

      const clearChance = ctx.clamp01(stateDist[target]);
      const expectedAttemptsOnClear = clearChance > 0 ? expectedAttemptsNumerator / clearChance : null;
      return {
        clearChance,
        expectedAttemptsOnClear
      };
    };

    ctx.getEnhancingTargetLevelByRoomLevel = function getEnhancingTargetLevelByRoomLevel(_roomLevel) {
      return 5;
    };

    ctx.getBadgeColor = function getBadgeColor(probability) {
      if (probability >= 0.95) {
        return "#1fbf60";
      }
      if (probability >= 0.8) {
        return "#77b82a";
      }
      if (probability >= 0.6) {
        return "#d2ac19";
      }
      if (probability >= 0.4) {
        return "#d27a1f";
      }
      return "#d84b4b";
    };

    ctx.computeRoomClearChance = function computeRoomClearChance(
      state,
      initClientData,
      room,
      maxEnhancementByItem,
      options = {}
    ) {
      if (!room || room.roomType !== ctx.LABYRINTH_SKILLING_ROOM_TYPE || !room.skillHrid) {
        return null;
      }

      const skillId = ctx.skillHridToSkillId(room.skillHrid);
      if (!skillId) {
        return null;
      }

      const actionTypeHrid = ctx.skillIdToActionTypeHrid(skillId);
      const isEnhancingRoom = skillId === "enhancing";
      const crateSelection = ctx.getLabyrinthCrateSelection(state);
      const labyrinthUpgradeLevels = ctx.resolveLabyrinthUpgradeLevels(options);
      const teaCrateItemHrid = String(crateSelection?.teaCrateItemHrid || "");
      const crateBuffs = ctx.getCrateBuffs(initClientData, teaCrateItemHrid);
      const labyrinthUpgradeMetrics = ctx.buildLabyrinthUpgradeSkillingMetrics(labyrinthUpgradeLevels);
      const labyrinthExperienceBonus = ctx.getLabyrinthUpgradeExperienceBonus(labyrinthUpgradeLevels);
      const includePersonalBuffs = false;
      const { equipmentMetrics, globalMetrics } = ctx.getSkillingGlobalMetrics(state, skillId, actionTypeHrid, {
        includePersonalBuffs
      });

      const fallbackMetrics = ctx.createEmptySkillingMetrics();
      ctx.addSkillingMetrics(fallbackMetrics, equipmentMetrics);

      const roomLoadout = ctx.getSkillingRoomLoadoutMetrics(
        state,
        initClientData,
        room,
        skillId,
        actionTypeHrid,
        maxEnhancementByItem,
        fallbackMetrics
      );
      const crateMetrics = ctx.getSkillingBuffMetrics(skillId, crateBuffs);
      const combinedMetrics = ctx.createEmptySkillingMetrics();
      ctx.addSkillingMetrics(combinedMetrics, globalMetrics);
      ctx.addSkillingMetrics(combinedMetrics, roomLoadout.metrics);
      ctx.addSkillingMetrics(combinedMetrics, crateMetrics);
      ctx.addSkillingMetrics(combinedMetrics, labyrinthUpgradeMetrics);

      const baseSkillLevel = ctx.getSkillLevel(state.characterSkillMap, room.skillHrid);
      const skillLevelBonus = combinedMetrics.skillLevelBonus;
      const efficiencyBonus = combinedMetrics.efficiencyBonus;
      const actionSpeedBonus = combinedMetrics.actionSpeedBonus;
      const successBonus = combinedMetrics.successBonus;
      const experienceBonusDetail = ctx.computeSkillingExperienceBonusForRoom(
        state,
        skillId,
        actionTypeHrid,
        roomLoadout.metrics,
        crateMetrics,
        includePersonalBuffs,
        labyrinthExperienceBonus
      );
      const experienceBonus = ctx.finiteNumber(experienceBonusDetail?.totalBonus, 0);
      const crateDoubleProgressBonus = combinedMetrics.crateDoubleProgressBonus;
      const gatheringBonus = combinedMetrics.gatheringBonus;

      const effectiveSkillLevel = baseSkillLevel + skillLevelBonus;
      const roomLevel = Number(room.recommendedLevel || 0);
      const levelDelta = effectiveSkillLevel - roomLevel;
      const levelBonus = levelDelta >= 0 ? levelDelta * 0.005 : levelDelta * 0.01;
      const successChance = ctx.skillingSuccessChance(0.8 * (1 + levelBonus + successBonus));
      const doubleChance = ctx.clamp01(crateDoubleProgressBonus + gatheringBonus);
      const rewardPreview = options.summaryOnly ? null : ctx.createRoomRewardPreview(state, room);

      const baseActionSeconds = isEnhancingRoom ? ctx.BASE_ENHANCING_ACTION_SECONDS : ctx.BASE_ACTION_SECONDS;
      const actionSeconds = baseActionSeconds / Math.max(0.05, 1 + actionSpeedBonus);
      const attempts = Math.max(1, Math.floor(ctx.ROOM_DURATION_SECONDS / actionSeconds));
      const baseExperiencePerRoom = Math.max(0, roomLevel * 50);
      const experienceMultiplier = Math.max(0, ctx.finiteNumber(experienceBonusDetail?.multiplier, 1));
      const experiencePerRoom = Math.max(0, baseExperiencePerRoom * experienceMultiplier);
      const experiencePerAction = attempts > 0 ? Math.max(0, experiencePerRoom / attempts) : experiencePerRoom;
      const speedDeltaForOneMoreAttempt = ctx.computeActionSpeedDeltaForOneMoreAttempt(
        baseActionSeconds,
        actionSpeedBonus,
        attempts
      );

      let progressPerSuccess = null;
      let workPower = null;
      let targetProgress = null;
      let targetEnhLevel = null;
      let clearStats = null;
      let preview = null;
      const upgradeRate = (stats, seconds = actionSeconds) =>
        stats === null
          ? null
          : root.MwiLabyrinthExperiencePolicy.rate({
              chance: stats.clearChance,
              successSeconds: stats.expectedAttemptsOnClear === null ? null : stats.expectedAttemptsOnClear * seconds,
              experience: experiencePerRoom,
              duration: ctx.ROOM_DURATION_SECONDS,
              entry: ctx.ROOM_ENTRY_SECONDS
            });
      const summary = () => ({ clearChance: clearStats.clearChance, experiencePerHour: upgradeRate(clearStats) });
      const nextSpeedActionSeconds = Number.isFinite(speedDeltaForOneMoreAttempt)
        ? baseActionSeconds / Math.max(0.05, 1 + actionSpeedBonus + speedDeltaForOneMoreAttempt)
        : actionSeconds;

      if (isEnhancingRoom) {
        targetEnhLevel = ctx.getEnhancingTargetLevelByRoomLevel(roomLevel);
        clearStats = ctx.computeEnhancingClearStats({
          attempts,
          successChance,
          doubleChance,
          targetLevel: targetEnhLevel,
          startLevel: 0
        });
        if (options.summaryOnly) return summary();
        const nextLevelDelta = effectiveSkillLevel + 1 - roomLevel;
        const nextLevelBonus = nextLevelDelta >= 0 ? nextLevelDelta * 0.005 : nextLevelDelta * 0.01;
        const nextLevelClearStats = ctx.computeEnhancingClearStats({
          attempts,
          successChance: ctx.skillingSuccessChance(0.8 * (1 + nextLevelBonus + successBonus)),
          doubleChance,
          targetLevel: targetEnhLevel,
          startLevel: 0
        });
        const speedTierClearStats = Number.isFinite(speedDeltaForOneMoreAttempt)
          ? ctx.computeEnhancingClearStats({
              attempts: attempts + 1,
              successChance,
              doubleChance,
              targetLevel: targetEnhLevel,
              startLevel: 0
            })
          : null;
        const skillingSuccessUpgradeLevel = ctx.getLabyrinthUpgradeLevel(
          labyrinthUpgradeLevels,
          ctx.LABYRINTH_UPGRADE_KEY_SKILLING_SUCCESS
        );
        const nextSkillingSuccessClearStats =
          skillingSuccessUpgradeLevel < ctx.LABYRINTH_STAT_UPGRADE_MAX_LEVEL
            ? ctx.computeEnhancingClearStats({
                attempts,
                successChance: ctx.skillingSuccessChance(
                  0.8 * (1 + levelBonus + successBonus + ctx.LABYRINTH_UPGRADE_SKILLING_SUCCESS_STEP_RATIO)
                ),
                doubleChance,
                targetLevel: targetEnhLevel,
                startLevel: 0
              })
            : null;
        const skillingDoubleProgressUpgradeLevel = ctx.getLabyrinthUpgradeLevel(
          labyrinthUpgradeLevels,
          ctx.LABYRINTH_UPGRADE_KEY_SKILLING_DOUBLE_PROGRESS
        );
        const nextSkillingDoubleProgressClearStats =
          skillingDoubleProgressUpgradeLevel < ctx.LABYRINTH_STAT_UPGRADE_MAX_LEVEL
            ? ctx.computeEnhancingClearStats({
                attempts,
                successChance,
                doubleChance: ctx.clamp01(doubleChance + ctx.LABYRINTH_UPGRADE_STEP_RATIO),
                targetLevel: targetEnhLevel,
                startLevel: 0
              })
            : null;
        preview = {
          type: "enhancing",
          targetLevel: targetEnhLevel,
          successChance,
          doubleChance,
          attempts,
          actionSeconds,
          speedDeltaForOneMoreAttempt,
          speedTierClearChance:
            speedTierClearStats === null ? null : ctx.clamp01(ctx.finiteNumber(speedTierClearStats.clearChance, 0)),
          nextLevelExperiencePerHour: upgradeRate(nextLevelClearStats),
          speedTierExperiencePerHour: upgradeRate(speedTierClearStats, nextSpeedActionSeconds),
          nextSkillingSuccessExperiencePerHour: upgradeRate(nextSkillingSuccessClearStats),
          nextSkillingDoubleProgressExperiencePerHour: upgradeRate(nextSkillingDoubleProgressClearStats),
          nextLevelClearChance: ctx.clamp01(ctx.finiteNumber(nextLevelClearStats.clearChance, 0)),
          nextSkillingSuccessClearChance:
            nextSkillingSuccessClearStats === null
              ? null
              : ctx.clamp01(ctx.finiteNumber(nextSkillingSuccessClearStats.clearChance, 0)),
          nextSkillingDoubleProgressClearChance:
            nextSkillingDoubleProgressClearStats === null
              ? null
              : ctx.clamp01(ctx.finiteNumber(nextSkillingDoubleProgressClearStats.clearChance, 0)),
          experiencePerAction,
          experiencePerRoom,
          experiencePerHour: 0,
          rewardPreview
        };
      } else {
        workPower = Math.max(0, effectiveSkillLevel * (1 + efficiencyBonus));
        progressPerSuccess = ctx.getEffectiveSkillingProgressPerSuccess(workPower);
        targetProgress = roomLevel * 10;
        const neededUnits = progressPerSuccess > 0 ? Math.ceil(targetProgress / progressPerSuccess - 1e-9) : 0;
        const efficiencyDeltaForOneLessProgressUnit = ctx.computeEfficiencyDeltaForOneLessProgressUnit(
          targetProgress,
          effectiveSkillLevel,
          efficiencyBonus,
          neededUnits
        );
        clearStats = ctx.computeNonEnhancingClearStats(
          {
            attempts,
            successChance,
            doubleChance,
            progressPerSuccess,
            targetProgress
          },
          options.clearStatsCache
        );
        if (options.summaryOnly) return summary();
        const nextLevelEffectiveSkillLevel = effectiveSkillLevel + 1;
        const nextLevelDelta = nextLevelEffectiveSkillLevel - roomLevel;
        const nextLevelBonus = nextLevelDelta >= 0 ? nextLevelDelta * 0.005 : nextLevelDelta * 0.01;
        const nextLevelSuccessChance = ctx.skillingSuccessChance(0.8 * (1 + nextLevelBonus + successBonus));
        const nextLevelClearStats = ctx.computeNonEnhancingClearStats({
          attempts,
          successChance: nextLevelSuccessChance,
          doubleChance,
          progressPerSuccess: ctx.getEffectiveSkillingProgressPerSuccess(
            nextLevelEffectiveSkillLevel * (1 + efficiencyBonus)
          ),
          targetProgress
        });
        const efficiencyTierClearStats =
          efficiencyDeltaForOneLessProgressUnit === null
            ? null
            : ctx.computeNonEnhancingClearStats({
                attempts,
                successChance,
                doubleChance,
                progressPerSuccess: ctx.computeProgressPerSuccessForOneLessProgressUnit(targetProgress, neededUnits),
                targetProgress
              });
        const speedTierClearStats = Number.isFinite(speedDeltaForOneMoreAttempt)
          ? ctx.computeNonEnhancingClearStats({
              attempts: attempts + 1,
              successChance,
              doubleChance,
              progressPerSuccess,
              targetProgress
            })
          : null;
        const skillingSuccessUpgradeLevel = ctx.getLabyrinthUpgradeLevel(
          labyrinthUpgradeLevels,
          ctx.LABYRINTH_UPGRADE_KEY_SKILLING_SUCCESS
        );
        const nextSkillingSuccessClearStats =
          skillingSuccessUpgradeLevel < ctx.LABYRINTH_STAT_UPGRADE_MAX_LEVEL
            ? ctx.computeNonEnhancingClearStats({
                attempts,
                successChance: ctx.skillingSuccessChance(
                  0.8 * (1 + levelBonus + successBonus + ctx.LABYRINTH_UPGRADE_SKILLING_SUCCESS_STEP_RATIO)
                ),
                doubleChance,
                progressPerSuccess,
                targetProgress
              })
            : null;
        const skillingDoubleProgressUpgradeLevel = ctx.getLabyrinthUpgradeLevel(
          labyrinthUpgradeLevels,
          ctx.LABYRINTH_UPGRADE_KEY_SKILLING_DOUBLE_PROGRESS
        );
        const nextSkillingDoubleProgressClearStats =
          skillingDoubleProgressUpgradeLevel < ctx.LABYRINTH_STAT_UPGRADE_MAX_LEVEL
            ? ctx.computeNonEnhancingClearStats({
                attempts,
                successChance,
                doubleChance: ctx.clamp01(doubleChance + ctx.LABYRINTH_UPGRADE_STEP_RATIO),
                progressPerSuccess,
                targetProgress
              })
            : null;
        preview = {
          type: "skilling",
          workPower,
          effectiveProgressPerSuccess: progressPerSuccess,
          successChance,
          doubleChance,
          attempts,
          actionSeconds,
          efficiencyDeltaForOneLessProgressUnit,
          efficiencyTierExperiencePerHour: upgradeRate(efficiencyTierClearStats),
          efficiencyTierProgressPerSuccess: ctx.computeProgressPerSuccessForOneLessProgressUnit(
            targetProgress,
            neededUnits
          ),
          speedDeltaForOneMoreAttempt,
          nextLevelExperiencePerHour: upgradeRate(nextLevelClearStats),
          speedTierExperiencePerHour: upgradeRate(speedTierClearStats, nextSpeedActionSeconds),
          nextSkillingSuccessExperiencePerHour: upgradeRate(nextSkillingSuccessClearStats),
          nextSkillingDoubleProgressExperiencePerHour: upgradeRate(nextSkillingDoubleProgressClearStats),
          nextLevelClearChance: ctx.clamp01(ctx.finiteNumber(nextLevelClearStats.clearChance, 0)),
          efficiencyTierClearChance:
            efficiencyTierClearStats === null
              ? null
              : ctx.clamp01(ctx.finiteNumber(efficiencyTierClearStats.clearChance, 0)),
          speedTierClearChance:
            speedTierClearStats === null ? null : ctx.clamp01(ctx.finiteNumber(speedTierClearStats.clearChance, 0)),
          nextSkillingSuccessClearChance:
            nextSkillingSuccessClearStats === null
              ? null
              : ctx.clamp01(ctx.finiteNumber(nextSkillingSuccessClearStats.clearChance, 0)),
          nextSkillingDoubleProgressClearChance:
            nextSkillingDoubleProgressClearStats === null
              ? null
              : ctx.clamp01(ctx.finiteNumber(nextSkillingDoubleProgressClearStats.clearChance, 0)),
          experiencePerAction,
          experiencePerRoom,
          experiencePerHour: 0,
          rewardPreview
        };
      }
      const clearChance = clearStats.clearChance;
      const expectedSecondsOnSuccessfulRun = Number.isFinite(clearStats.expectedAttemptsOnClear)
        ? clearStats.expectedAttemptsOnClear * actionSeconds
        : null;
      const expectedSecondsPerClear =
        clearChance > 0 && Number.isFinite(expectedSecondsOnSuccessfulRun)
          ? (clearChance * expectedSecondsOnSuccessfulRun + (1 - clearChance) * ctx.ROOM_DURATION_SECONDS) / clearChance
          : Infinity;
      const experiencePerHour = summary().experiencePerHour;
      if (preview && typeof preview === "object") {
        preview.upgradePreviewVersion = 1;
        preview.nextSkillingSuccessCost = ctx.getLabyrinthStatUpgradeTokenCost(
          ctx.getLabyrinthUpgradeLevel(labyrinthUpgradeLevels, ctx.LABYRINTH_UPGRADE_KEY_SKILLING_SUCCESS)
        );
        preview.nextSkillingDoubleProgressCost = ctx.getLabyrinthStatUpgradeTokenCost(
          ctx.getLabyrinthUpgradeLevel(labyrinthUpgradeLevels, ctx.LABYRINTH_UPGRADE_KEY_SKILLING_DOUBLE_PROGRESS)
        );
        preview.experiencePerHour = experiencePerHour;
        preview.skillId = skillId;
        preview.clearChance = clearChance;
        preview.expectedSecondsPerClear = expectedSecondsPerClear;
      }

      return {
        clearChance,
        expectedSecondsPerClear,
        skillingPreview: preview,
        debug: [
          `skill=${skillId}`,
          `loadout=${roomLoadout.loadoutInfo.loadout?.name || roomLoadout.loadoutInfo.loadoutId || "current"}`,
          `mode=${roomLoadout.mode}`,
          `base=${baseSkillLevel.toFixed(2)}`,
          `skill+${skillLevelBonus.toFixed(2)}`,
          `globalSkill+${globalMetrics.skillLevelBonus.toFixed(2)}`,
          `lvlBonus=${(levelBonus * 100).toFixed(1)}%`,
          `eff+${(efficiencyBonus * 100).toFixed(1)}%`,
          `globalEff+${(globalMetrics.efficiencyBonus * 100).toFixed(1)}%`,
          labyrinthUpgradeMetrics.actionSpeedBonus > 0
            ? `labAct+${(labyrinthUpgradeMetrics.actionSpeedBonus * 100).toFixed(1)}%`
            : "",
          labyrinthUpgradeMetrics.efficiencyBonus > 0
            ? `labEff+${(labyrinthUpgradeMetrics.efficiencyBonus * 100).toFixed(1)}%`
            : "",
          labyrinthUpgradeMetrics.successBonus > 0
            ? `labSuccess+${(labyrinthUpgradeMetrics.successBonus * 100).toFixed(1)}%`
            : "",
          labyrinthUpgradeMetrics.crateDoubleProgressBonus > 0
            ? `labDouble+${(labyrinthUpgradeMetrics.crateDoubleProgressBonus * 100).toFixed(1)}%`
            : "",
          `exp+${(experienceBonus * 100).toFixed(1)}%`,
          `exp(wisdom)=${(ctx.finiteNumber(experienceBonusDetail?.genericBonus, 0) * 100).toFixed(1)}%`,
          `exp(skilling)=${(ctx.finiteNumber(experienceBonusDetail?.skillingBonus, 0) * 100).toFixed(1)}%`,
          `exp(skill)=${(ctx.finiteNumber(experienceBonusDetail?.skillBonus, 0) * 100).toFixed(1)}%`,
          labyrinthExperienceBonus > 0 ? `labExp+${(labyrinthExperienceBonus * 100).toFixed(1)}%` : "",
          `success=${(successChance * 100).toFixed(1)}%`,
          `globalSuccess+${(globalMetrics.successBonus * 100).toFixed(1)}%`,
          `double=${(doubleChance * 100).toFixed(1)}%`,
          isEnhancingRoom ? `target=+${targetEnhLevel}` : `target=${Math.round(targetProgress)}`,
          isEnhancingRoom
            ? ""
            : `work=${workPower.toFixed(2)}${Math.abs(workPower - progressPerSuccess) > 1e-9 ? `->${progressPerSuccess}` : ""}`,
          `attempts=${attempts}`,
          `eta=${ctx.formatEtaText(expectedSecondsPerClear, Math.round(clearChance * 100))}`
        ]
          .filter(Boolean)
          .join(" | ")
      };
    };
  };
})(globalThis);
