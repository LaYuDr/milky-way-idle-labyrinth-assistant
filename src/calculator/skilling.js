// Adapted from 迷宫胜率计算器 1.6.0, dakonglong, MIT. See docs/THIRD_PARTY.md.
(function (root) {
  "use strict";
  root.MwiLabyrinthCalculatorModules ||= {};
  root.MwiLabyrinthCalculatorModules["skilling"] = function (ctx) {
    const sharedStats = new Map(),
      enhancingStats = new Map(),
      skillingCurves = new Map();
    let dpBufA = new Float64Array(512);
    let dpBufB = new Float64Array(512);
    let enhBufA = new Float64Array(16);
    let enhBufB = new Float64Array(16);

    ctx.clearSkillingSimulationCache = () => {
      sharedStats.clear();
      enhancingStats.clear();
      skillingCurves.clear();
    };
    function rememberStats(cache, key, result) {
      cache.set(key, result);
      if (cache.size > 2048) cache.delete(cache.keys().next().value);
      return { ...result };
    }
    function ensureDpBuffers(size) {
      if (size > dpBufA.length) {
        const nextSize = Math.max(size + 64, dpBufA.length * 2);
        dpBufA = new Float64Array(nextSize);
        dpBufB = new Float64Array(nextSize);
      }
    }
    function ensureEnhBuffers(size) {
      if (size > enhBufA.length) {
        const nextSize = Math.max(size + 8, enhBufA.length * 2);
        enhBufA = new Float64Array(nextSize);
        enhBufB = new Float64Array(nextSize);
      }
    }

    // Zero-allocation double-buffered exact DP with active upper-bound pruning.
    ctx.solveNonEnhancingClearStats = function solveNonEnhancingClearStats(
      attempts,
      successChance,
      doubleChance,
      neededUnits
    ) {
      if (!Number.isFinite(neededUnits) || neededUnits <= 0) {
        return { clearChance: 1, expectedAttemptsOnClear: 0 };
      }
      if (!Number.isFinite(attempts) || attempts <= 0) {
        return { clearChance: 0, expectedAttemptsOnClear: null };
      }
      const p = ctx.clamp01(successChance);
      const d = ctx.clamp01(doubleChance);
      if (p <= 0 || neededUnits > attempts * 2) {
        return { clearChance: 0, expectedAttemptsOnClear: null };
      }
      if (p >= 1 && d <= 0) {
        return neededUnits <= attempts
          ? { clearChance: 1, expectedAttemptsOnClear: neededUnits }
          : { clearChance: 0, expectedAttemptsOnClear: null };
      }

      ensureDpBuffers(neededUnits);
      const q0 = 1 - p;
      const q1 = p * (1 - d);
      const q2 = p * d;
      const q12 = q1 + q2;
      const uMinus1 = neededUnits - 1;
      const uMinus2 = neededUnits - 2;

      let cur = dpBufA;
      let nxt = dpBufB;
      cur[0] = 1;
      let cleared = 0;
      let expectedAttemptsNumerator = 0;

      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const prevMax = Math.min(uMinus1, (attempt - 1) * 2);
        const nextMax = Math.min(uMinus1, attempt * 2);
        nxt.fill(0, 0, nextMax + 1);
        let reachedNow = 0;

        for (let units = 0; units <= prevMax; units += 1) {
          const prob = cur[units];
          if (prob <= 0) continue;
          if (q0 > 0) nxt[units] += prob * q0;
          if (units < uMinus2) {
            nxt[units + 1] += prob * q1;
            nxt[units + 2] += prob * q2;
          } else if (units === uMinus2) {
            nxt[uMinus1] += prob * q1;
            reachedNow += prob * q2;
          } else {
            reachedNow += prob * q12;
          }
        }

        if (reachedNow > 0) {
          cleared += reachedNow;
          expectedAttemptsNumerator += attempt * reachedNow;
        }
        const tmp = cur;
        cur = nxt;
        nxt = tmp;
      }

      const clearChance = ctx.clamp01(cleared);
      const expectedAttemptsOnClear = clearChance > 0 ? expectedAttemptsNumerator / clearChance : null;
      return { clearChance, expectedAttemptsOnClear };
    };

    // Scalar-unrolled exact DP for the standard +5 enhancing target (zero allocations),
    // falling back to double-buffered DP for arbitrary targets/start levels.
    ctx.solveEnhancingClearStats = function solveEnhancingClearStats(
      attempts,
      successChance,
      doubleChance,
      targetLevel,
      startLevel
    ) {
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
      const q0 = 1 - p;
      const q1 = p * (1 - d);
      const q2 = p * d;
      const q12 = q1 + q2;

      if (target === 5 && start === 0) {
        let s0 = 1,
          s1 = 0,
          s2 = 0,
          s3 = 0,
          s4 = 0,
          cleared = 0,
          expectedAttemptsNumerator = 0;
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
          const n0 = (s0 + s1) * q0;
          const n1 = s0 * q1 + s2 * q0;
          const n2 = s0 * q2 + s1 * q1 + s3 * q0;
          const n3 = s1 * q2 + s2 * q1 + s4 * q0;
          const n4 = s2 * q2 + s3 * q1;
          const reachedNow = s3 * q2 + s4 * q12;
          if (reachedNow > 0) {
            cleared += reachedNow;
            expectedAttemptsNumerator += attempt * reachedNow;
          }
          s0 = n0;
          s1 = n1;
          s2 = n2;
          s3 = n3;
          s4 = n4;
        }
        const clearChance = ctx.clamp01(cleared);
        return {
          clearChance,
          expectedAttemptsOnClear: clearChance > 0 ? expectedAttemptsNumerator / clearChance : null
        };
      }

      ensureEnhBuffers(target + 1);
      let cur = enhBufA;
      let nxt = enhBufB;
      cur.fill(0, 0, target + 1);
      cur[Math.min(start, target)] = 1;
      let cleared = 0;
      let expectedAttemptsNumerator = 0;

      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        nxt.fill(0, 0, target);
        let reachedNow = 0;
        for (let level = 0; level < target; level += 1) {
          const prob = cur[level];
          if (prob <= 0) continue;
          nxt[level > 0 ? level - 1 : 0] += prob * q0;
          if (level + 1 >= target) {
            reachedNow += prob * q12;
          } else if (level + 2 >= target) {
            nxt[level + 1] += prob * q1;
            reachedNow += prob * q2;
          } else {
            nxt[level + 1] += prob * q1;
            nxt[level + 2] += prob * q2;
          }
        }
        if (reachedNow > 0) {
          cleared += reachedNow;
          expectedAttemptsNumerator += attempt * reachedNow;
        }
        const tmp = cur;
        cur = nxt;
        nxt = tmp;
      }

      const clearChance = ctx.clamp01(cleared);
      return {
        clearChance,
        expectedAttemptsOnClear: clearChance > 0 ? expectedAttemptsNumerator / clearChance : null
      };
    };

    // Build and cache a full 1..maxLevel exact lookup table for a normalized skilling profile (~0.3ms/skill).
    ctx.getOrBuildSkillingCurve = function getOrBuildSkillingCurve(profile, requestedMaxLevel = 300) {
      if (!profile || !profile.coreProfileKey) return null;
      const targetMax = Math.max(300, Math.ceil(ctx.finiteNumber(requestedMaxLevel, 300)));
      const existing = skillingCurves.get(profile.coreProfileKey);
      if (existing && existing.maxLevel >= targetMax) {
        skillingCurves.delete(profile.coreProfileKey);
        skillingCurves.set(profile.coreProfileKey, existing);
        return existing;
      }

      const startLevel = existing ? existing.maxLevel + 1 : 1;
      const clearChanceArr = new Float64Array(targetMax);
      const expectedAttemptsArr = new Float64Array(targetMax);
      expectedAttemptsArr.fill(NaN);
      if (existing) {
        clearChanceArr.set(existing.clearChance);
        expectedAttemptsArr.set(existing.expectedAttempts);
      }

      const { isEnhancing, effectiveSkillLevel, successBonus, doubleChance, attempts, progressPerSuccess } = profile;
      let prevP = NaN;
      let prevUnits = -1;
      let prevStats = null;

      for (let lv = startLevel; lv <= targetMax; lv += 1) {
        const levelDelta = effectiveSkillLevel - lv;
        const levelBonus = levelDelta >= 0 ? levelDelta * 0.005 : levelDelta * 0.01;
        const successChance = ctx.skillingSuccessChance(0.8 * (1 + levelBonus + successBonus));
        let stats;
        if (isEnhancing) {
          const targetEnh = ctx.getEnhancingTargetLevelByRoomLevel(lv);
          if (successChance === prevP && targetEnh === prevUnits && prevStats) {
            stats = prevStats;
          } else {
            stats = ctx.solveEnhancingClearStats(attempts, successChance, doubleChance, targetEnh, 0);
            prevP = successChance;
            prevUnits = targetEnh;
            prevStats = stats;
          }
        } else {
          const targetProgress = lv * 10;
          const neededUnits = progressPerSuccess > 0 ? Math.ceil(targetProgress / progressPerSuccess - 1e-9) : Infinity;
          if (successChance === prevP && neededUnits === prevUnits && prevStats) {
            stats = prevStats;
          } else {
            stats =
              progressPerSuccess > 0 && Number.isFinite(neededUnits)
                ? ctx.solveNonEnhancingClearStats(attempts, successChance, doubleChance, neededUnits)
                : { clearChance: 0, expectedAttemptsOnClear: null };
            prevP = successChance;
            prevUnits = neededUnits;
            prevStats = stats;
          }
        }
        clearChanceArr[lv - 1] = stats.clearChance;
        expectedAttemptsArr[lv - 1] = stats.expectedAttemptsOnClear === null ? NaN : stats.expectedAttemptsOnClear;
      }

      const entry = {
        coreProfileKey: profile.coreProfileKey,
        maxLevel: targetMax,
        clearChance: clearChanceArr,
        expectedAttempts: expectedAttemptsArr
      };
      skillingCurves.delete(profile.coreProfileKey);
      skillingCurves.set(profile.coreProfileKey, entry);
      if (skillingCurves.size > 256) {
        skillingCurves.delete(skillingCurves.keys().next().value);
      }
      return entry;
    };

    ctx.lookupSkillingCurveStats = function lookupSkillingCurveStats(profile, roomLevel) {
      const lv = Math.floor(ctx.finiteNumber(roomLevel, 0));
      if (!profile || lv < 1) return null;
      const curve = ctx.getOrBuildSkillingCurve(profile, lv);
      if (!curve) return null;
      const clearChance = curve.clearChance[lv - 1];
      const expected = curve.expectedAttempts[lv - 1];
      return {
        clearChance,
        expectedAttemptsOnClear: Number.isFinite(expected) ? expected : null
      };
    };

    // Only distribution inputs are shared; live labels and rewards are rebuilt.
    ctx.computeNonEnhancingClearStats = function computeNonEnhancingClearStats(params, cache) {
      cache ||= sharedStats;
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
      if (sharedStats.has(key)) return rememberStats(cache, key, sharedStats.get(key));
      const result = calculateNonEnhancingClearStats(params);
      rememberStats(sharedStats, key, result);
      return rememberStats(cache, key, result);
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

      const neededUnits = Math.ceil(targetProgress / effectiveProgressPerSuccess - 1e-9);
      return ctx.solveNonEnhancingClearStats(attempts, successChance, doubleChance, neededUnits);
    }

    ctx.computeEnhancingClearStats = function computeEnhancingClearStats(params) {
      const key = JSON.stringify([
        params.attempts,
        params.successChance,
        params.doubleChance,
        params.targetLevel,
        params.startLevel
      ]);
      if (enhancingStats.has(key)) return { ...enhancingStats.get(key) };
      return rememberStats(enhancingStats, key, calculateEnhancingClearStats(params));
    };
    function calculateEnhancingClearStats(params) {
      const { attempts, successChance, doubleChance, targetLevel, startLevel } = params;
      return ctx.solveEnhancingClearStats(attempts, successChance, doubleChance, targetLevel, startLevel);
    }

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

      const roomLevel = Number(room.recommendedLevel || 0);
      const profile =
        options.profile && options.profile.skillHrid === room.skillHrid
          ? options.profile
          : typeof ctx.extractSkillingProfile === "function"
            ? ctx.extractSkillingProfile(state, initClientData, room.skillHrid, maxEnhancementByItem, options)
            : null;

      let skillId;
      let actionTypeHrid;
      let isEnhancingRoom;
      let labyrinthUpgradeLevels;
      let labyrinthUpgradeMetrics;
      let labyrinthExperienceBonus;
      let globalMetrics;
      let roomLoadout;
      let baseSkillLevel;
      let skillLevelBonus;
      let efficiencyBonus;
      let actionSpeedBonus;
      let successBonus;
      let experienceBonusDetail;
      let experienceBonus;
      let doubleChance;
      let effectiveSkillLevel;
      let baseActionSeconds;
      let actionSeconds;
      let attempts;
      let experienceMultiplier;

      if (profile) {
        skillId = profile.skillId;
        actionTypeHrid = profile.actionTypeHrid;
        isEnhancingRoom = profile.isEnhancing;
        labyrinthUpgradeLevels = profile.labyrinthUpgradeLevels;
        labyrinthUpgradeMetrics = profile.labyrinthUpgradeMetrics;
        labyrinthExperienceBonus = profile.labyrinthExperienceBonus;
        globalMetrics = profile.globalMetrics;
        roomLoadout = profile.roomLoadout;
        baseSkillLevel = profile.baseSkillLevel;
        skillLevelBonus = profile.skillLevelBonus;
        efficiencyBonus = profile.efficiencyBonus;
        actionSpeedBonus = profile.actionSpeedBonus;
        successBonus = profile.successBonus;
        experienceBonusDetail = profile.experienceBonusDetail;
        experienceBonus = profile.experienceBonus;
        doubleChance = profile.doubleChance;
        effectiveSkillLevel = profile.effectiveSkillLevel;
        baseActionSeconds = profile.baseActionSeconds;
        actionSeconds = profile.actionSeconds;
        attempts = profile.attempts;
        experienceMultiplier = profile.experienceMultiplier;
      } else {
        skillId = ctx.skillHridToSkillId(room.skillHrid);
        if (!skillId) {
          return null;
        }
        actionTypeHrid = ctx.skillIdToActionTypeHrid(skillId);
        isEnhancingRoom = skillId === "enhancing";
        const crateSelection = ctx.getLabyrinthCrateSelection(state);
        labyrinthUpgradeLevels = ctx.resolveLabyrinthUpgradeLevels(options);
        const teaCrateItemHrid = String(crateSelection?.teaCrateItemHrid || "");
        const crateBuffs = ctx.getCrateBuffs(initClientData, teaCrateItemHrid);
        labyrinthUpgradeMetrics = ctx.buildLabyrinthUpgradeSkillingMetrics(labyrinthUpgradeLevels);
        labyrinthExperienceBonus = ctx.getLabyrinthUpgradeExperienceBonus(labyrinthUpgradeLevels);
        const includePersonalBuffs = false;
        const globalPair = ctx.getSkillingGlobalMetrics(state, skillId, actionTypeHrid, {
          includePersonalBuffs
        });
        globalMetrics = globalPair.globalMetrics;

        const fallbackMetrics = ctx.createEmptySkillingMetrics();
        ctx.addSkillingMetrics(fallbackMetrics, globalPair.equipmentMetrics);

        roomLoadout = ctx.getSkillingRoomLoadoutMetrics(
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

        baseSkillLevel = ctx.getSkillLevel(state.characterSkillMap, room.skillHrid);
        skillLevelBonus = combinedMetrics.skillLevelBonus;
        efficiencyBonus = combinedMetrics.efficiencyBonus;
        actionSpeedBonus = combinedMetrics.actionSpeedBonus;
        successBonus = combinedMetrics.successBonus;
        experienceBonusDetail = ctx.computeSkillingExperienceBonusForRoom(
          state,
          skillId,
          actionTypeHrid,
          roomLoadout.metrics,
          crateMetrics,
          includePersonalBuffs,
          labyrinthExperienceBonus
        );
        experienceBonus = ctx.finiteNumber(experienceBonusDetail?.totalBonus, 0);
        doubleChance = ctx.clamp01(combinedMetrics.crateDoubleProgressBonus + combinedMetrics.gatheringBonus);
        effectiveSkillLevel = baseSkillLevel + skillLevelBonus;
        baseActionSeconds = isEnhancingRoom ? ctx.BASE_ENHANCING_ACTION_SECONDS : ctx.BASE_ACTION_SECONDS;
        actionSeconds = baseActionSeconds / Math.max(0.05, 1 + actionSpeedBonus);
        attempts = Math.max(1, Math.floor(ctx.ROOM_DURATION_SECONDS / actionSeconds));
        experienceMultiplier = Math.max(0, ctx.finiteNumber(experienceBonusDetail?.multiplier, 1));
      }

      const levelDelta = effectiveSkillLevel - roomLevel;
      const levelBonus = levelDelta >= 0 ? levelDelta * 0.005 : levelDelta * 0.01;
      const successChance = ctx.skillingSuccessChance(0.8 * (1 + levelBonus + successBonus));
      const rewardPreview = options.summaryOnly ? null : ctx.createRoomRewardPreview(state, room);

      const baseExperiencePerRoom = Math.max(0, roomLevel * 50);
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

      const integerRoomLevel = Number.isInteger(roomLevel) && roomLevel >= 1 ? roomLevel : 0;

      if (isEnhancingRoom) {
        targetEnhLevel = ctx.getEnhancingTargetLevelByRoomLevel(roomLevel);
        clearStats =
          profile && integerRoomLevel
            ? ctx.lookupSkillingCurveStats(profile, integerRoomLevel)
            : ctx.computeEnhancingClearStats({
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
        workPower = profile ? profile.workPower : Math.max(0, effectiveSkillLevel * (1 + efficiencyBonus));
        progressPerSuccess = profile
          ? profile.progressPerSuccess
          : ctx.getEffectiveSkillingProgressPerSuccess(workPower);
        targetProgress = roomLevel * 10;
        const neededUnits = progressPerSuccess > 0 ? Math.ceil(targetProgress / progressPerSuccess - 1e-9) : 0;
        const efficiencyDeltaForOneLessProgressUnit = options.summaryOnly
          ? null
          : ctx.computeEfficiencyDeltaForOneLessProgressUnit(
              targetProgress,
              effectiveSkillLevel,
              efficiencyBonus,
              neededUnits
            );
        clearStats =
          profile && integerRoomLevel
            ? ctx.lookupSkillingCurveStats(profile, integerRoomLevel)
            : ctx.computeNonEnhancingClearStats(
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
