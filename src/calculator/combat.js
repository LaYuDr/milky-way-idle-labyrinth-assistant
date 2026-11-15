// Adapted from 迷宫胜率计算器 1.6.0, dakonglong, MIT. See docs/THIRD_PARTY.md.
(function (root) {
  "use strict";
  root.MwiLabyrinthCalculatorModules ||= {};
  root.MwiLabyrinthCalculatorModules["combat"] = function (ctx) {
    ctx.getCombatSkillLevelsFromState = function getCombatSkillLevelsFromState(state) {
      const levels = {};
      for (const [key, hrid] of Object.entries(ctx.COMBAT_SKILL_HRID_BY_KEY)) {
        levels[key] = ctx.positiveNumber(ctx.getSkillLevel(state?.characterSkillMap, hrid), 1);
      }
      if (!state?.characterSkillMap && state?.combatUnit?.combatDetails) {
        levels.attack = ctx.positiveNumber(state.combatUnit.combatDetails.attackLevel, levels.attack);
        levels.melee = ctx.positiveNumber(state.combatUnit.combatDetails.meleeLevel, levels.melee);
        levels.defense = ctx.positiveNumber(state.combatUnit.combatDetails.defenseLevel, levels.defense);
        levels.ranged = ctx.positiveNumber(state.combatUnit.combatDetails.rangedLevel, levels.ranged);
        levels.magic = ctx.positiveNumber(state.combatUnit.combatDetails.magicLevel, levels.magic);
        levels.stamina = ctx.positiveNumber(state.combatUnit.combatDetails.staminaLevel, levels.stamina);
        levels.intelligence = ctx.positiveNumber(state.combatUnit.combatDetails.intelligenceLevel, levels.intelligence);
      }
      return levels;
    };

    ctx.createEmptyCombatStats = function createEmptyCombatStats() {
      return {
        combatStyleHrid: "/combat_styles/smash",
        damageType: "/damage_types/physical",
        attackInterval: 3000000000,
        autoAttackDamage: 0,
        castSpeed: 0,
        criticalRate: 0,
        criticalDamage: 0,
        stabAccuracy: 0,
        slashAccuracy: 0,
        smashAccuracy: 0,
        rangedAccuracy: 0,
        magicAccuracy: 0,
        stabDamage: 0,
        slashDamage: 0,
        smashDamage: 0,
        rangedDamage: 0,
        magicDamage: 0,
        defensiveDamage: 0,
        taskDamage: 0,
        armorPenetration: 0,
        waterPenetration: 0,
        naturePenetration: 0,
        firePenetration: 0,
        maxHitpoints: 0,
        maxManapoints: 0,
        stabEvasion: 0,
        slashEvasion: 0,
        smashEvasion: 0,
        rangedEvasion: 0,
        magicEvasion: 0,
        armor: 0,
        waterResistance: 0,
        natureResistance: 0,
        fireResistance: 0,
        tenacity: 0,
        hpRegenPer10: 0,
        mpRegenPer10: 0,
        drinkConcentration: 0,
        combatRareFind: 0,
        combatDropRate: 0,
        combatDropQuantity: 0,
        combatExperience: 0,
        foodSlots: 1,
        drinkSlots: 1,
        physicalAmplify: 0,
        waterAmplify: 0,
        natureAmplify: 0,
        fireAmplify: 0,
        healingAmplify: 0,
        physicalThorns: 0,
        elementalThorns: 0,
        lifeSteal: 0,
        abilityHaste: 0,
        manaLeech: 0,
        threat: 100,
        parry: 0,
        mayhem: 0,
        pierce: 0,
        curse: 0,
        fury: 0,
        weaken: 0,
        ripple: 0,
        bloom: 0,
        blaze: 0,
        attackSpeed: 0,
        foodHaste: 0,
        damageTaken: 0,
        retaliation: 0,
        primaryTraining: "/skills/melee",
        focusTraining: ""
      };
    };

    ctx.addNumericStat = function addNumericStat(stats, key, value) {
      const n = Number(value);
      if (!Number.isFinite(n)) {
        return;
      }
      stats[key] = ctx.finiteNumber(stats[key], 0) + n;
    };

    ctx.getPositiveMultiplier = function getPositiveMultiplier(value) {
      return Math.max(0.05, 1 + ctx.finiteNumber(value, 0));
    };

    ctx.buildPlayerDetailsFromCombatProfile = function buildPlayerDetailsFromCombatProfile(profile) {
      const levels = profile.levels;
      const combatStats = profile.combatStats;

      const attack = ctx.positiveNumber(levels.attack, 1);
      const melee = ctx.positiveNumber(levels.melee, 1);
      const defense = ctx.positiveNumber(levels.defense, 1);
      const ranged = ctx.positiveNumber(levels.ranged, 1);
      const magic = ctx.positiveNumber(levels.magic, 1);
      const stamina = ctx.positiveNumber(levels.stamina, 1);
      const intelligence = ctx.positiveNumber(levels.intelligence, 1);

      const details = {
        attackLevel: attack,
        meleeLevel: melee,
        defenseLevel: defense,
        rangedLevel: ranged,
        magicLevel: magic,
        staminaLevel: stamina,
        intelligenceLevel: intelligence,
        maxHitpoints: Math.floor(10 * (10 + stamina) + ctx.finiteNumber(combatStats.maxHitpoints, 0)),
        maxManapoints: Math.floor(10 * (10 + intelligence) + ctx.finiteNumber(combatStats.maxManapoints, 0)),
        stabAccuracyRating: (10 + attack) * ctx.getPositiveMultiplier(combatStats.stabAccuracy),
        slashAccuracyRating: (10 + attack) * ctx.getPositiveMultiplier(combatStats.slashAccuracy),
        smashAccuracyRating: (10 + attack) * ctx.getPositiveMultiplier(combatStats.smashAccuracy),
        rangedAccuracyRating: (10 + attack) * ctx.getPositiveMultiplier(combatStats.rangedAccuracy),
        magicAccuracyRating: (10 + attack) * ctx.getPositiveMultiplier(combatStats.magicAccuracy),
        stabMaxDamage: (10 + melee) * ctx.getPositiveMultiplier(combatStats.stabDamage),
        slashMaxDamage: (10 + melee) * ctx.getPositiveMultiplier(combatStats.slashDamage),
        smashMaxDamage: (10 + melee) * ctx.getPositiveMultiplier(combatStats.smashDamage),
        rangedMaxDamage: (10 + ranged) * ctx.getPositiveMultiplier(combatStats.rangedDamage),
        magicMaxDamage: (10 + magic) * ctx.getPositiveMultiplier(combatStats.magicDamage),
        defensiveMaxDamage: (10 + defense) * ctx.getPositiveMultiplier(combatStats.defensiveDamage),
        stabEvasionRating: (10 + defense) * ctx.getPositiveMultiplier(combatStats.stabEvasion),
        slashEvasionRating: (10 + defense) * ctx.getPositiveMultiplier(combatStats.slashEvasion),
        smashEvasionRating: (10 + defense) * ctx.getPositiveMultiplier(combatStats.smashEvasion),
        rangedEvasionRating: (10 + defense) * ctx.getPositiveMultiplier(combatStats.rangedEvasion),
        magicEvasionRating: (10 + defense) * ctx.getPositiveMultiplier(combatStats.magicEvasion),
        totalArmor: 0.2 * defense + ctx.finiteNumber(combatStats.armor, 0),
        totalWaterResistance: 0.2 * defense + ctx.finiteNumber(combatStats.waterResistance, 0),
        totalNatureResistance: 0.2 * defense + ctx.finiteNumber(combatStats.natureResistance, 0),
        totalFireResistance: 0.2 * defense + ctx.finiteNumber(combatStats.fireResistance, 0)
      };

      details.currentHitpoints = details.maxHitpoints;
      details.currentManapoints = details.maxManapoints;

      const baseInterval = ctx.positiveNumber(combatStats.attackInterval, ctx.COMBAT_ONE_SECOND_NS);
      let attackInterval = baseInterval / (1 + attack / 2000);
      attackInterval /= Math.max(0.05, 1 + ctx.finiteNumber(combatStats.attackSpeed, 0));
      attackInterval /= Math.max(0.05, 1 + ctx.finiteNumber(profile.extraAttackSpeedRatio, 0));

      combatStats.attackInterval = attackInterval;
      combatStats.hpRegenPer10 = 0.01 + ctx.finiteNumber(combatStats.hpRegenPer10, 0);
      combatStats.mpRegenPer10 = 0.01 + ctx.finiteNumber(combatStats.mpRegenPer10, 0);
      combatStats.castSpeed = ctx.finiteNumber(combatStats.castSpeed, 0) + attack / 2000;

      details.combatStats = combatStats;
      return details;
    };

    ctx.cloneCombatStatsForSimulation = function cloneCombatStatsForSimulation(rawCombatStats, rawAttackIntervalNs) {
      const source = rawCombatStats || {};
      const combatStats = ctx.createEmptyCombatStats();
      for (const [key, value] of Object.entries(source)) {
        const numericValue = Number(value);
        if (Number.isFinite(numericValue)) {
          combatStats[key] = numericValue;
        }
      }
      combatStats.combatStyleHrid = ctx.getCombatStyleHrid(source);
      combatStats.damageType = ctx.getDamageTypeHrid(source);
      combatStats.attackInterval = ctx.positiveNumber(
        rawAttackIntervalNs || source.attackInterval,
        ctx.COMBAT_ONE_SECOND_NS
      );
      return combatStats;
    };

    ctx.buildMazeMonsterDetailsForRoom = function buildMazeMonsterDetailsForRoom(monsterDetails, roomLevel) {
      if (!monsterDetails || !monsterDetails.combatStats) {
        return null;
      }
      const resolvedRoomLevel = ctx.positiveNumber(roomLevel, ctx.positiveNumber(monsterDetails.combatLevel, 100));
      const mazeScale = resolvedRoomLevel / 100;
      const levels = {
        attack: ctx.positiveNumber(monsterDetails.attackLevel, 1) * mazeScale,
        melee: ctx.positiveNumber(monsterDetails.meleeLevel, 1) * mazeScale,
        defense: ctx.positiveNumber(monsterDetails.defenseLevel, 1) * mazeScale,
        ranged: ctx.positiveNumber(monsterDetails.rangedLevel, 1) * mazeScale,
        magic: ctx.positiveNumber(monsterDetails.magicLevel, 1) * mazeScale,
        stamina: ctx.positiveNumber(monsterDetails.staminaLevel, 1) * mazeScale,
        intelligence: ctx.positiveNumber(monsterDetails.intelligenceLevel, 1) * mazeScale
      };
      const combatStats = ctx.cloneCombatStatsForSimulation(monsterDetails.combatStats, monsterDetails.attackInterval);
      const details = ctx.buildPlayerDetailsFromCombatProfile({
        levels,
        combatStats,
        extraAttackSpeedRatio: 0
      });
      if (!details) {
        return null;
      }
      // Monster template max HP/MP already includes monster-specific modifiers (e.g. aura-like effects).
      // Prefer scaling template values directly to avoid underestimating preview stats.
      const scaledTemplateMaxHp = ctx.finiteNumber(monsterDetails.maxHitpoints, NaN) * mazeScale;
      const scaledTemplateMaxMp = ctx.finiteNumber(monsterDetails.maxManapoints, NaN) * mazeScale;
      if (Number.isFinite(scaledTemplateMaxHp) && scaledTemplateMaxHp > 0) {
        details.maxHitpoints = Math.max(1, Math.floor(scaledTemplateMaxHp));
      }
      if (Number.isFinite(scaledTemplateMaxMp) && scaledTemplateMaxMp > 0) {
        details.maxManapoints = Math.max(1, Math.floor(scaledTemplateMaxMp));
      }
      // Use game's labyrinth rule: armor/resistance scales by room level from base values.
      details.totalArmor = ctx.finiteNumber(monsterDetails.totalArmor, details.totalArmor) * mazeScale;
      details.totalWaterResistance =
        ctx.finiteNumber(monsterDetails.totalWaterResistance, details.totalWaterResistance) * mazeScale;
      details.totalNatureResistance =
        ctx.finiteNumber(monsterDetails.totalNatureResistance, details.totalNatureResistance) * mazeScale;
      details.totalFireResistance =
        ctx.finiteNumber(monsterDetails.totalFireResistance, details.totalFireResistance) * mazeScale;
      details.currentHitpoints = details.maxHitpoints;
      details.currentManapoints = details.maxManapoints;
      return details;
    };

    ctx.getCombatStyleHrid = function getCombatStyleHrid(combatStats) {
      if (!combatStats) {
        return "/combat_styles/smash";
      }
      if (Array.isArray(combatStats.combatStyleHrids) && combatStats.combatStyleHrids.length > 0) {
        return combatStats.combatStyleHrids[0] || "/combat_styles/smash";
      }
      return combatStats.combatStyleHrid || "/combat_styles/smash";
    };

    ctx.getDamageTypeHrid = function getDamageTypeHrid(combatStats) {
      if (!combatStats) {
        return "/damage_types/physical";
      }
      return combatStats.damageType || "/damage_types/physical";
    };

    ctx.getAccuracyRating = function getAccuracyRating(details, combatStyle) {
      switch (combatStyle) {
        case "/combat_styles/stab":
          return ctx.positiveNumber(details.stabAccuracyRating, 1);
        case "/combat_styles/slash":
          return ctx.positiveNumber(details.slashAccuracyRating, 1);
        case "/combat_styles/smash":
          return ctx.positiveNumber(details.smashAccuracyRating, 1);
        case "/combat_styles/ranged":
          return ctx.positiveNumber(details.rangedAccuracyRating, 1);
        case "/combat_styles/magic":
          return ctx.positiveNumber(details.magicAccuracyRating, 1);
        default:
          return ctx.positiveNumber(details.smashAccuracyRating, 1);
      }
    };

    ctx.getMaxDamage = function getMaxDamage(details, combatStyle) {
      switch (combatStyle) {
        case "/combat_styles/stab":
          return ctx.positiveNumber(details.stabMaxDamage, 1);
        case "/combat_styles/slash":
          return ctx.positiveNumber(details.slashMaxDamage, 1);
        case "/combat_styles/smash":
          return ctx.positiveNumber(details.smashMaxDamage, 1);
        case "/combat_styles/ranged":
          return ctx.positiveNumber(details.rangedMaxDamage, 1);
        case "/combat_styles/magic":
          return ctx.positiveNumber(details.magicMaxDamage, 1);
        default:
          return ctx.positiveNumber(details.smashMaxDamage, 1);
      }
    };

    ctx.getEvasionRating = function getEvasionRating(details, combatStyle) {
      switch (combatStyle) {
        case "/combat_styles/stab":
          return ctx.positiveNumber(details.stabEvasionRating, 1);
        case "/combat_styles/slash":
          return ctx.positiveNumber(details.slashEvasionRating, 1);
        case "/combat_styles/smash":
          return ctx.positiveNumber(details.smashEvasionRating, 1);
        case "/combat_styles/ranged":
          return ctx.positiveNumber(details.rangedEvasionRating, 1);
        case "/combat_styles/magic":
          return ctx.positiveNumber(details.magicEvasionRating, 1);
        default:
          return ctx.positiveNumber(details.smashEvasionRating, 1);
      }
    };

    ctx.getResistance = function getResistance(details, damageType) {
      switch (damageType) {
        case "/damage_types/water":
          return ctx.finiteNumber(details.totalWaterResistance, 0);
        case "/damage_types/nature":
          return ctx.finiteNumber(details.totalNatureResistance, 0);
        case "/damage_types/fire":
          return ctx.finiteNumber(details.totalFireResistance, 0);
        case "/damage_types/physical":
        default:
          return ctx.finiteNumber(details.totalArmor, 0);
      }
    };

    ctx.createMonsterCombatTemplate = function createMonsterCombatTemplate(initClientData, room) {
      const monsterDetails = initClientData?.combatMonsterDetailMap?.[room?.monsterHrid]?.combatDetails;
      if (!monsterDetails) {
        return null;
      }
      const details = ctx.buildMazeMonsterDetailsForRoom(monsterDetails, room?.recommendedLevel);
      if (!details) {
        return {
          isPlayer: false,
          combatDetails: monsterDetails
        };
      }
      return {
        isPlayer: false,
        combatDetails: details
      };
    };

    ctx.computeCombatRoomClearChanceFullFlow = async function computeCombatRoomClearChanceFullFlow(
      state,
      initClientData,
      room,
      maxEnhancementByItem,
      progressTracker,
      combatTrials,
      roomKey = "",
      options = {}
    ) {
      const roomLevel = ctx.positiveNumber(room?.recommendedLevel, 1);
      const trials = ctx.normalizeCombatSimTrials(combatTrials);
      const combatCrate = ctx.getCombatCrateBuffs(state, initClientData);
      const guildCombatShrineLevels = ctx.getActiveGuildCombatShrineLevels(state);
      const combatCrateSignature = String(combatCrate.combatCrateSignature || combatCrate.teaCrateItemHrid || "");
      const playerData = ctx.buildCombatPlayerDtoForRoom(state, initClientData, room, maxEnhancementByItem, options);
      if (!playerData.playerDto) {
        return null;
      }
      const inputSnapshot = ctx.buildCombatInputSnapshot(playerData, room);
      if (inputSnapshot) {
        inputSnapshot.roomKey = String(roomKey || "");
      }

      const workerResult = await ctx.simulateCombatRoomWithWorker(
        {
          playerDto: playerData.playerDto,
          monsterHrid: room.monsterHrid,
          mazeDifficulty: roomLevel,
          roomDurationSeconds: ctx.ROOM_DURATION_SECONDS,
          mazeCrateItemHrids: Array.isArray(combatCrate.combatCrateItemHrids)
            ? combatCrate.combatCrateItemHrids.slice()
            : [],
          trials,
          seed: options.seed,
          reuseSimulation: options.reuseSimulation,
          parallel: options.parallel
        },
        progressTracker
      );

      const combatExperience = root.MwiLabyrinthCombatExperience.summarize(workerResult, ctx.ROOM_ENTRY_SECONDS);
      const executedTrials = Math.max(0, Math.floor(ctx.finiteNumber(workerResult?.trials, trials)));
      const successes = Math.max(0, Math.floor(ctx.finiteNumber(workerResult?.successes, 0)));
      const totalSpentSeconds = Math.max(0, ctx.finiteNumber(workerResult?.totalSpentSeconds, 0));
      const minElapsedSeconds = Math.max(0, ctx.finiteNumber(workerResult?.minElapsedSeconds, 0));
      const maxElapsedSeconds = Math.max(
        minElapsedSeconds,
        ctx.finiteNumber(workerResult?.maxElapsedSeconds, minElapsedSeconds)
      );
      const failedByTimeoutRaw = Math.max(0, Math.floor(ctx.finiteNumber(workerResult?.failedByTimeout, 0)));
      const failedByDeathRaw = Math.max(0, Math.floor(ctx.finiteNumber(workerResult?.failedByDeath, 0)));
      const firstRunDebug = workerResult?.firstRunDebug || null;
      const clearChance = executedTrials > 0 ? ctx.clamp01(successes / executedTrials) : 0;
      const expectedSecondsPerClear = successes > 0 ? totalSpentSeconds / successes : Infinity;
      const totalFailures = Math.max(0, executedTrials - successes);
      const knownFailures = Math.max(0, failedByTimeoutRaw + failedByDeathRaw);
      const failedByTimeout =
        knownFailures >= totalFailures ? failedByTimeoutRaw : failedByTimeoutRaw + (totalFailures - knownFailures);
      const failedByDeath = knownFailures >= totalFailures ? failedByDeathRaw : failedByDeathRaw;
      const failureReason =
        clearChance < 1 ? ctx.deriveCombatFailureReasonFromCounts(totalFailures, failedByTimeout, failedByDeath) : "";

      return {
        clearChance,
        expectedSecondsPerClear,
        combatExperience,
        experiencePerHour: combatExperience.experiencePerHour,
        experiencePerRoom: combatExperience.experiencePerRoom,
        combatMeta: {
          source: "full",
          modelSignature: ctx.COMBAT_MODEL_SIGNATURE,
          completedTrials: executedTrials,
          roomKey: String(roomKey || ""),
          monsterHrid: String(room?.monsterHrid || ""),
          roomLevel,
          trials: executedTrials,
          successes,
          failures: totalFailures,
          failedByTimeout,
          failedByDeath,
          failureReason,
          totalSpentSeconds,
          minElapsedSeconds,
          maxElapsedSeconds,
          expectedSecondsPerClearRaw: expectedSecondsPerClear,
          loadoutId: playerData.loadoutInfo.loadoutId || 0,
          loadoutName: playerData.loadoutInfo.loadout?.name || "",
          loadoutMode: playerData.loadoutInfo.loadout?.useExactEnhancement ? "exact" : "highest",
          loadoutSource: playerData.loadoutInfo.source || "room",
          selectedLoadoutId: playerData.loadoutInfo.selectedLoadoutId || playerData.loadoutInfo.loadoutId || 0,
          mazeCrateItemHrid: combatCrateSignature,
          mazeCrateItemHrids: Array.isArray(combatCrate.combatCrateItemHrids)
            ? combatCrate.combatCrateItemHrids.slice()
            : [],
          mazeCrateBuffCount: Array.isArray(combatCrate.combatBuffs) ? combatCrate.combatBuffs.length : 0,
          labyrinthBuffCount: Object.values(playerData.playerDto.labyrinthUpgrades).filter((level) => level > 0).length,
          guildBuffCount: Object.values(guildCombatShrineLevels).filter((level) => level > 0).length,
          guildCombatShrineLevels,
          combatInputSnapshot: inputSnapshot,
          firstRunDebug: firstRunDebug || null
        },
        debug: [
          "combat-full",
          `monster=${room.monsterHrid.split("/").pop() || room.monsterHrid}`,
          `loadout=${playerData.loadoutInfo.loadout?.name || playerData.loadoutInfo.loadoutId || "current"}`,
          `source=${playerData.loadoutInfo.source || "room"}`,
          playerData.loadoutInfo.selectedLoadoutId &&
          playerData.loadoutInfo.selectedLoadoutId !== playerData.loadoutInfo.loadoutId
            ? `selected=${playerData.loadoutInfo.selectedLoadoutId}`
            : "",
          `mode=${playerData.loadoutInfo.loadout?.useExactEnhancement ? "exact" : "highest"}`,
          `crate=${combatCrateSignature || "none"}`,
          `guildLv=${Object.values(guildCombatShrineLevels).join("/")}`,
          `labLv=${Object.values(playerData.playerDto.labyrinthUpgrades).join("/")}`,
          `roomLv=${roomLevel}`,
          `trials=${executedTrials}`,
          `wins=${successes}`,
          `t=${minElapsedSeconds.toFixed(2)}-${maxElapsedSeconds.toFixed(2)}s`,
          firstRunDebug && Number.isFinite(Number(firstRunDebug.encounters))
            ? `enc=${Math.max(0, Math.floor(ctx.finiteNumber(firstRunDebug.encounters, 0)))}`
            : "",
          firstRunDebug && Number.isFinite(Number(firstRunDebug.simulatedTime))
            ? `simT=${(ctx.finiteNumber(firstRunDebug.simulatedTime, 0) / ctx.COMBAT_ONE_SECOND_NS).toFixed(2)}s`
            : "",
          firstRunDebug && firstRunDebug.deaths && typeof firstRunDebug.deaths === "object"
            ? `deaths=${Object.values(firstRunDebug.deaths).reduce(
                (sum, value) => sum + Math.max(0, Math.floor(ctx.finiteNumber(value, 0))),
                0
              )}`
            : "",
          totalFailures > 0 ? `failT=${failedByTimeout}` : "",
          totalFailures > 0 ? `failD=${failedByDeath}` : "",
          failureReason ? `why=${failureReason}` : "",
          `eta=${ctx.formatEtaText(expectedSecondsPerClear, Math.round(clearChance * 100))}`
        ].join(" | ")
      };
    };

    ctx.computeCombatRoomClearChance = async function computeCombatRoomClearChance(
      state,
      initClientData,
      room,
      maxEnhancementByItem,
      progressTracker,
      combatTrials,
      roomKey = "",
      options = {}
    ) {
      if (!room || room.roomType !== ctx.LABYRINTH_COMBAT_ROOM_TYPE || !room.monsterHrid) {
        return null;
      }
      const trials = ctx.normalizeCombatSimTrials(combatTrials);

      let result = null;
      try {
        result = await ctx.computeCombatRoomClearChanceFullFlow(
          state,
          initClientData,
          room,
          maxEnhancementByItem,
          progressTracker,
          trials,
          roomKey,
          {
            labyrinthUpgradeLevels: ctx.resolveLabyrinthUpgradeLevels(options),
            seed: options.seed,
            reuseSimulation: options.reuseSimulation,
            parallel: options.parallel
          }
        );
      } catch (error) {
        const fatalError = error instanceof Error ? error : new Error(String(error));
        console.error("[Lab Clear Rate] full combat simulation failed:", fatalError);
        const alertMessage = ctx.t("combatFlowFailedFmt", { message: fatalError.message || String(fatalError) });
        if (
          !ctx.destroyed &&
          !ctx.automationEstimateRunning &&
          !ctx.inputInvalidated &&
          typeof ctx.window !== "undefined" &&
          typeof ctx.window.alert === "function"
        ) {
          ctx.window.alert(alertMessage);
        }
        throw fatalError;
      }

      if (!result) {
        return null;
      }

      return {
        ...result,
        combatMeta: {
          ...(result.combatMeta || {}),
          source: "full",
          roomKey: String(roomKey || result.combatMeta?.roomKey || "")
        }
      };
    };
  };
})(globalThis);
