// Unified 1..300+ level curve engine, P0/P1/P2 background scheduler, and O(1) room query facade.
(function (root) {
  "use strict";

  root.MwiLabyrinthCalculatorModules ||= {};
  root.MwiLabyrinthCalculatorModules["curve-engine"] = function (ctx) {
    const statsMod = root.MwiLabyrinthCombatStats;
    const storeMod = root.MwiLabyrinthCurveStore;

    const FULL_PRECISION_STORAGE_KEY = "mwi-labyrinth:calculator:curve-full-precision:v1";
    const DEFAULT_BASE_TRIALS = statsMod?.DEFAULT_BASE_TRIALS || 250;
    const DEFAULT_CHUNK_TRIALS = statsMod?.DEFAULT_CHUNK_TRIALS || 250;
    const DEFAULT_MAX_LEVEL = statsMod?.DEFAULT_MAX_LEVEL || 300;
    const DEFAULT_BATCH_SIZE = 10;

    const curveStore = storeMod?.create({ indexedDB: ctx.window?.indexedDB }) || null;
    const combatCurves = new Map(); // curveKey -> CurveEntry
    const hydratingCurves = new Map(); // curveKey -> Promise<CurveEntry>
    const inFlightLevels = new Map(); // `${curveKey}:${level}:${targetTrials}` -> Promise<stats>
    const upgradeImpactCache = new Map(); // upgradeCacheKey -> { upgradeImpact, failedUpgrades }
    const upgradeInFlight = new Map(); // upgradeCacheKey -> Promise

    let backgroundRunId = 0;
    let backgroundRunning = false;
    let backgroundPaused = false;
    let backgroundProgress = {
      readyMonsters: 0,
      totalMonsters: 10,
      refinedMonsters: 0,
      currentMonster: "",
      stage: "idle" // idle | hydrating | stage1 | stage2 | ready | paused
    };
    const curveListeners = new Set();

    function notifyCurveListeners() {
      for (const listener of curveListeners) {
        try {
          listener(ctx.getCurvePrecomputeStatus());
        } catch {
          /* UI listeners must never disrupt the engine. */
        }
      }
    }

    ctx.onCurveStatusChange = function onCurveStatusChange(listener) {
      if (typeof listener !== "function") return () => {};
      curveListeners.add(listener);
      return () => curveListeners.delete(listener);
    };

    ctx.getCurveFullPrecisionSetting = function getCurveFullPrecisionSetting() {
      try {
        return ctx.storage.getItem(FULL_PRECISION_STORAGE_KEY) === "true";
      } catch {
        return false;
      }
    };

    ctx.setCurveFullPrecisionSetting = function setCurveFullPrecisionSetting(enabled) {
      const value = Boolean(enabled);
      try {
        ctx.storage.setItem(FULL_PRECISION_STORAGE_KEY, String(value));
      } catch {
        /* Keep runtime responsive even if storage is unavailable. */
      }
      // Mark active curves as needing refinement check if upgraded to full precision.
      if (value) {
        for (const entry of combatCurves.values()) {
          if (!entry.fullPrecision) entry.refinedComplete = false;
        }
      }
      notifyCurveListeners();
      return value;
    };

    if (typeof ctx.window?.addEventListener === "function") {
      ctx.listen(ctx.window, "pagehide", () => void curveStore?.flush?.());
    }
    if (typeof ctx.window?.document?.addEventListener === "function") {
      ctx.listen(ctx.window.document, "visibilitychange", () => {
        if (ctx.window.document.hidden) {
          void curveStore?.flush?.();
        }
      });
    }

    function createCurveEntry(profile, maxLevel = DEFAULT_MAX_LEVEL, buffer = null) {
      const levels = Math.max(DEFAULT_MAX_LEVEL, Math.floor(ctx.finiteNumber(maxLevel, DEFAULT_MAX_LEVEL)));
      const rawBuffer = statsMod.isArrayBuffer(buffer) ? buffer : statsMod.createCurveBuffer(levels);
      const view = new Float64Array(rawBuffer);
      const actualMaxLevel = Math.floor(view.length / statsMod.STRIDE);
      return {
        key: profile.curveKey,
        characterId: profile.characterId,
        monsterHrid: profile.monsterHrid,
        profileHash: profile.profileHash,
        engineSignature: profile.engineSignature,
        gameDataHash: profile.gameDataHash,
        maxLevel: actualMaxLevel,
        baseTrials: DEFAULT_BASE_TRIALS,
        targetTrials: 0,
        completedLevels: countCompletedLevels(view, actualMaxLevel),
        refinedComplete: false,
        fullPrecision: false,
        hydrated: false,
        updatedAt: Date.now(),
        buffer: rawBuffer,
        view
      };
    }

    function countCompletedLevels(view, maxLevel) {
      let count = 0;
      for (let lv = 1; lv <= maxLevel; lv++) {
        if (statsMod.readTrialsAt(view, lv) > 0) count++;
      }
      return count;
    }

    function ensureCurveCapacity(entry, requiredLevel) {
      const needed = Math.max(1, Math.floor(ctx.finiteNumber(requiredLevel, DEFAULT_MAX_LEVEL)));
      if (needed <= entry.maxLevel) return entry;
      const nextMax = Math.ceil(needed / 50) * 50;
      const expanded = statsMod.expandCurveBuffer(entry.buffer, nextMax);
      entry.buffer = expanded;
      entry.view = new Float64Array(expanded);
      entry.maxLevel = nextMax;
      entry.refinedComplete = false;
      return entry;
    }

    function rememberCombatCurve(entry) {
      if (!entry?.key) return entry;
      combatCurves.delete(entry.key);
      combatCurves.set(entry.key, entry);
      if (combatCurves.size > 48) {
        combatCurves.delete(combatCurves.keys().next().value);
      }
      return entry;
    }

    function persistCurveEntry(entry) {
      if (!curveStore || !entry?.key || !entry.characterId) return;
      entry.updatedAt = Date.now();
      entry.completedLevels = countCompletedLevels(entry.view, entry.maxLevel);
      curveStore.schedulePut(entry.key, {
        characterId: entry.characterId,
        monsterHrid: entry.monsterHrid,
        profileHash: entry.profileHash,
        engineSignature: entry.engineSignature,
        gameDataHash: entry.gameDataHash,
        maxLevel: entry.maxLevel,
        baseTrials: entry.baseTrials,
        targetTrials: entry.targetTrials,
        completedLevels: entry.completedLevels,
        refinedComplete: entry.refinedComplete,
        fullPrecision: entry.fullPrecision,
        updatedAt: entry.updatedAt,
        buffer: entry.buffer
      });
    }

    function getCombatCurveSync(profile) {
      if (!profile?.curveKey) return null;
      const entry = combatCurves.get(profile.curveKey);
      if (!entry) return null;
      if (entry.engineSignature !== profile.engineSignature || entry.gameDataHash !== profile.gameDataHash) {
        combatCurves.delete(profile.curveKey);
        return null;
      }
      rememberCombatCurve(entry);
      return entry;
    }

    async function hydrateCombatCurve(profile, minMaxLevel = DEFAULT_MAX_LEVEL) {
      if (!profile?.curveKey) {
        // Unidentified character: keep transient in-memory entry without disk persistence.
        const transientKey = `transient:${profile?.monsterHrid || ""}:${profile?.profileHash || ""}`;
        const existing = combatCurves.get(transientKey);
        if (existing) return ensureCurveCapacity(existing, minMaxLevel);
        const created = createCurveEntry({ ...profile, curveKey: transientKey }, minMaxLevel);
        created.hydrated = true;
        return rememberCombatCurve(created);
      }

      const existing = getCombatCurveSync(profile);
      if (existing?.hydrated) {
        return ensureCurveCapacity(existing, minMaxLevel);
      }
      if (hydratingCurves.has(profile.curveKey)) {
        const loaded = await hydratingCurves.get(profile.curveKey);
        return ensureCurveCapacity(loaded, minMaxLevel);
      }

      const pending = (async () => {
        const entry = existing || rememberCombatCurve(createCurveEntry(profile, minMaxLevel));
        if (curveStore) {
          try {
            const stored = await curveStore.get(profile.curveKey);
            if (
              stored &&
              stored.engineSignature === profile.engineSignature &&
              stored.gameDataHash === profile.gameDataHash &&
              statsMod.isArrayBuffer(stored.buffer)
            ) {
              ensureCurveCapacity(entry, stored.maxLevel);
              const storedView = new Float64Array(stored.buffer);
              const limit = Math.min(entry.maxLevel, stored.maxLevel);
              // Preserve whichever level has higher sample count so concurrent live runs never lose work.
              for (let lv = 1; lv <= limit; lv++) {
                const diskTrials = statsMod.readTrialsAt(storedView, lv);
                const memTrials = statsMod.readTrialsAt(entry.view, lv);
                if (diskTrials > memTrials) {
                  statsMod.writeLevel(entry.view, lv, statsMod.readLevel(storedView, lv));
                }
              }
              entry.completedLevels = countCompletedLevels(entry.view, entry.maxLevel);
              entry.targetTrials = Math.max(entry.targetTrials, stored.targetTrials || 0);
              entry.fullPrecision = Boolean(stored.fullPrecision);
              entry.refinedComplete = Boolean(stored.refinedComplete && entry.maxLevel <= stored.maxLevel);
            }
          } catch {
            /* Storage failures degrade gracefully to in-memory curves. */
          }
        }
        entry.hydrated = true;
        return ensureCurveCapacity(entry, minMaxLevel);
      })().finally(() => {
        if (hydratingCurves.get(profile.curveKey) === pending) {
          hydratingCurves.delete(profile.curveKey);
        }
      });

      hydratingCurves.set(profile.curveKey, pending);
      return pending;
    }

    ctx.buildCombatResultFromCurveStats = function buildCombatResultFromCurveStats(
      stats,
      profile,
      room,
      roomKey = "",
      extraMeta = {}
    ) {
      if (!stats || !profile) return null;
      const workerResult = statsMod.toWorkerResult(stats);
      if (!workerResult) return null;
      const roomLevel = Math.max(1, Math.floor(ctx.positiveNumber(room?.recommendedLevel, 1)));
      const combatExperience = root.MwiLabyrinthCombatExperience.summarize(workerResult, ctx.ROOM_ENTRY_SECONDS);
      const executedTrials = workerResult.trials;
      const successes = workerResult.successes;
      const totalSpentSeconds = workerResult.totalSpentSeconds;
      const minElapsedSeconds = workerResult.minElapsedSeconds;
      const maxElapsedSeconds = workerResult.maxElapsedSeconds;
      const failedByTimeout = workerResult.failedByTimeout;
      const failedByDeath = workerResult.failedByDeath;
      const totalFailures = Math.max(0, executedTrials - successes);
      const clearChance = workerResult.clearChance;
      const expectedSecondsPerClear = workerResult.expectedSecondsPerClear;
      const failureReason =
        clearChance < 1 ? ctx.deriveCombatFailureReasonFromCounts(totalFailures, failedByTimeout, failedByDeath) : "";
      const inputSnapshot = ctx.buildCombatInputSnapshot(profile.playerData, room);
      if (inputSnapshot) inputSnapshot.roomKey = String(roomKey || "");
      const loadoutInfo = profile.playerData.loadoutInfo;
      const combatCrate = profile.combatCrate;
      const guildCombatShrineLevels = profile.guildCombatShrineLevels;
      const combatCrateSignature = profile.combatCrateSignature;

      return {
        clearChance,
        upgradeImpact: extraMeta.upgradeImpact,
        expectedSecondsPerClear,
        combatExperience,
        experiencePerHour: combatExperience.experiencePerHour,
        experiencePerRoom: combatExperience.experiencePerRoom,
        combatMeta: {
          source: extraMeta.source || "curve",
          modelSignature: ctx.COMBAT_MODEL_SIGNATURE,
          profileHash: profile.profileHash,
          completedTrials: executedTrials,
          roomKey: String(roomKey || ""),
          monsterHrid: String(room?.monsterHrid || profile.monsterHrid || ""),
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
          loadoutId: loadoutInfo.loadoutId || 0,
          loadoutName: loadoutInfo.loadout?.name || "",
          loadoutMode: loadoutInfo.loadout
            ? loadoutInfo.loadout.useExactEnhancement
              ? "exact"
              : "highest"
            : "current",
          loadoutSource: loadoutInfo.source || "room",
          selectedLoadoutId: loadoutInfo.selectedLoadoutId || loadoutInfo.loadoutId || 0,
          mazeCrateItemHrid: combatCrateSignature,
          mazeCrateItemHrids: Array.isArray(combatCrate.combatCrateItemHrids)
            ? combatCrate.combatCrateItemHrids.slice()
            : [],
          mazeCrateBuffCount: Array.isArray(combatCrate.combatBuffs) ? combatCrate.combatBuffs.length : 0,
          labyrinthBuffCount: Object.values(profile.playerDto.labyrinthUpgrades).filter((level) => level > 0).length,
          guildBuffCount: Object.values(guildCombatShrineLevels).filter((level) => level > 0).length,
          guildCombatShrineLevels,
          combatInputSnapshot: inputSnapshot,
          firstRunDebug: null
        },
        debug: [
          "combat-curve",
          `monster=${String(profile.monsterHrid).split("/").pop() || profile.monsterHrid}`,
          `loadout=${loadoutInfo.loadout?.name || loadoutInfo.loadoutId || "current"}`,
          `roomLv=${roomLevel}`,
          `trials=${executedTrials}`,
          `wins=${successes}`,
          `t=${minElapsedSeconds.toFixed(2)}-${maxElapsedSeconds.toFixed(2)}s`,
          totalFailures > 0 ? `failT=${failedByTimeout}` : "",
          totalFailures > 0 ? `failD=${failedByDeath}` : "",
          failureReason ? `why=${failureReason}` : "",
          `eta=${ctx.formatEtaText(expectedSecondsPerClear, Math.round(clearChance * 100))}`
        ]
          .filter(Boolean)
          .join(" | ")
      };
    };

    // O(1) synchronous lookup from active L1 memory combat curve.
    ctx.lookupCombatLevelSync = function lookupCombatLevelSync(profile, roomLevel, minTrials = 1) {
      const lv = Math.floor(ctx.finiteNumber(roomLevel, 0));
      if (!profile || lv < 1) return null;
      const entry = getCombatCurveSync(profile);
      if (!entry || lv > entry.maxLevel) return null;
      const stats = statsMod.readLevel(entry.view, lv);
      if (!stats || stats.trials < minTrials) return null;
      return stats;
    };

    // Ensure a specific (profile, level) reaches at least targetTrials using P0 chunked multi-core dispatch.
    ctx.ensureCombatLevelStats = async function ensureCombatLevelStats(
      profile,
      roomLevel,
      {
        targetTrials = DEFAULT_BASE_TRIALS,
        priority = 0,
        seed = 173,
        chunkSize = DEFAULT_CHUNK_TRIALS,
        progressTracker = null,
        isRunStale = null
      } = {}
    ) {
      if (!profile || !statsMod) return null;
      const lv = Math.max(1, Math.floor(ctx.finiteNumber(roomLevel, 1)));
      const goal = Math.max(1, Math.min(3000, Math.floor(ctx.finiteNumber(targetTrials, DEFAULT_BASE_TRIALS))));
      const entry = await hydrateCombatCurve(profile, lv);
      if (isRunStale?.() || ctx.destroyed) return null;

      const existing = statsMod.readLevel(entry.view, lv);
      if (existing && existing.trials >= goal) {
        progressTracker?.add(goal);
        return existing;
      }

      const existingTrials = existing ? existing.trials : 0;
      if (existingTrials > 0) progressTracker?.add(existingTrials);

      const dedupeKey = `${entry.key}:${lv}:${goal}`;
      if (inFlightLevels.has(dedupeKey)) {
        const res = await inFlightLevels.get(dedupeKey);
        if (res) {
          const remaining = Math.max(0, goal - existingTrials);
          if (remaining > 0) progressTracker?.add(remaining);
        }
        return res;
      }

      const pending = (async () => {
        const latestBefore = statsMod.readLevel(entry.view, lv);
        const already = latestBefore ? latestBefore.trials : 0;
        if (already >= goal) return latestBefore;

        const deltaStats = await ctx.simulateCombatChunkedWithWorker(
          {
            playerDto: profile.playerDto,
            monsterHrid: profile.monsterHrid,
            mazeDifficulty: lv,
            mazeCrateItemHrids: profile.mazeCrateItemHrids,
            existingTrials: already,
            trials: goal,
            seed,
            chunkSize,
            parallel: true,
            priority
          },
          progressTracker
        );
        if (!deltaStats || ctx.destroyed) return statsMod.readLevel(entry.view, lv);
        const merged = statsMod.mergeIntoLevel(entry.view, lv, deltaStats);
        persistCurveEntry(entry);
        return merged;
      })().finally(() => {
        if (inFlightLevels.get(dedupeKey) === pending) inFlightLevels.delete(dedupeKey);
      });

      inFlightLevels.set(dedupeKey, pending);
      return pending;
    };

    // High-level room query for combat rooms (used by map badges, automation, distribution).
    ctx.queryCombatRoomViaCurve = async function queryCombatRoomViaCurve(
      state,
      initClientData,
      room,
      maxEnhancementByItem,
      progressTracker,
      combatTrials,
      roomKey = "",
      options = {}
    ) {
      if (!room || room.roomType !== ctx.LABYRINTH_COMBAT_ROOM_TYPE || !room.monsterHrid) return null;
      const profile =
        options.profile && options.profile.monsterHrid === room.monsterHrid
          ? options.profile
          : ctx.extractCombatProfile(state, initClientData, room.monsterHrid, maxEnhancementByItem, options);
      if (!profile) return null;

      const roomLevel = Math.max(1, Math.floor(ctx.positiveNumber(room.recommendedLevel, 1)));
      const trials = ctx.normalizeCombatSimTrials(combatTrials);
      const minAcceptableTrials = options.allowBaseCurveHit ? Math.min(trials, DEFAULT_BASE_TRIALS) : trials;

      // Fast synchronous O(1) curve hit when memory table already has enough samples.
      const syncStats = ctx.lookupCombatLevelSync(profile, roomLevel, minAcceptableTrials);
      if (syncStats && (!options.combatUpgrades || options.deferUpgradesToHover)) {
        progressTracker?.add(trials);
        return ctx.buildCombatResultFromCurveStats(syncStats, profile, room, roomKey, { source: "curve" });
      }

      const stats = await ctx.ensureCombatLevelStats(profile, roomLevel, {
        targetTrials: minAcceptableTrials,
        priority: options.priority ?? 0,
        seed: options.seed ?? 173,
        progressTracker,
        isRunStale: options.isRunStale
      });
      if (!stats || options.isRunStale?.()) return null;

      let upgradeImpact;
      if (options.combatUpgrades && !options.deferUpgradesToHover) {
        const outcome = await ctx.computeCombatUpgradesForParams(
          {
            playerDto: profile.playerDto,
            monsterHrid: profile.monsterHrid,
            mazeDifficulty: roomLevel,
            mazeCrateItemHrids: profile.mazeCrateItemHrids,
            trials,
            seed: options.seed ?? 173,
            reuseSimulation: true,
            parallel: true
          },
          options.combatUpgrades,
          progressTracker,
          options
        );
        upgradeImpact = outcome?.upgradeImpact;
      }

      return ctx.buildCombatResultFromCurveStats(stats, profile, room, roomKey, {
        source: "curve",
        upgradeImpact
      });
    };

    // On-demand hover computation for the 4 combat stat upgrades (+1 level each).
    // Decoupled from floor precomputation to cut total CPU cost by ~80%.
    ctx.ensureCombatUpgradeImpactOnHover = async function ensureCombatUpgradeImpactOnHover(
      state,
      initClientData,
      room,
      options = {}
    ) {
      if (!state || !initClientData || !room || room.roomType !== ctx.LABYRINTH_COMBAT_ROOM_TYPE || !room.monsterHrid) {
        return null;
      }
      const maxEnhancementByItem = options.maxEnhancementByItem || ctx.buildMaxEnhancementByItem(state);
      const labyrinthUpgradeLevels = ctx.resolveLabyrinthUpgradeLevels(options);
      const combatUpgrades = ctx.getCombatUpgradeOptions(labyrinthUpgradeLevels);
      if (!combatUpgrades.some((u) => u.cost !== null)) {
        return { upgradeImpact: {}, failedUpgrades: [] };
      }

      const profile = ctx.extractCombatProfile(state, initClientData, room.monsterHrid, maxEnhancementByItem, {
        labyrinthUpgradeLevels
      });
      if (!profile) return null;

      const roomLevel = Math.max(1, Math.floor(ctx.positiveNumber(room.recommendedLevel, 1)));
      const trials = ctx.normalizeCombatSimTrials(options.trials ?? ctx.getSelectedCombatSimTrials());
      const cacheKey = `${profile.curveKey}:${roomLevel}:${trials}`;

      const hit = upgradeImpactCache.get(cacheKey);
      if (hit) {
        upgradeImpactCache.delete(cacheKey);
        upgradeImpactCache.set(cacheKey, hit);
        return structuredClone(hit);
      }
      if (upgradeInFlight.has(cacheKey)) {
        return structuredClone(await upgradeInFlight.get(cacheKey));
      }

      const pending = (async () => {
        const upgradeImpact = {};
        const failedUpgrades = [];
        await Promise.all(
          combatUpgrades.map(async ({ key, buff, level, cost }) => {
            if (cost === null) {
              upgradeImpact[key] = { level, cost: null, clearChance: null, experiencePerHour: null };
              return;
            }
            const nextDto = {
              ...profile.playerDto,
              labyrinthUpgrades: { ...profile.playerDto.labyrinthUpgrades, [buff]: level + 1 }
            };
            try {
              const upgradedStats = await ctx.simulateCombatChunkedWithWorker({
                playerDto: nextDto,
                monsterHrid: profile.monsterHrid,
                mazeDifficulty: roomLevel,
                mazeCrateItemHrids: profile.mazeCrateItemHrids,
                existingTrials: 0,
                trials,
                seed: options.seed ?? 173,
                parallel: true,
                priority: 0
              });
              if (!upgradedStats) throw new Error("升级模拟返回空统计");
              const workerResult = statsMod.toWorkerResult(upgradedStats);
              const xp = root.MwiLabyrinthCombatExperience.summarize(workerResult, ctx.ROOM_ENTRY_SECONDS);
              upgradeImpact[key] = {
                level,
                cost,
                clearChance: workerResult.clearChance,
                experiencePerHour: xp.experiencePerHour
              };
            } catch (error) {
              failedUpgrades.push({ key, error });
              upgradeImpact[key] = { level, cost, clearChance: null, experiencePerHour: null };
            }
          })
        );

        const outcome = { upgradeImpact, failedUpgrades };
        if (!failedUpgrades.length) {
          upgradeImpactCache.set(cacheKey, outcome);
          if (upgradeImpactCache.size > 256) {
            upgradeImpactCache.delete(upgradeImpactCache.keys().next().value);
          }
        }
        return outcome;
      })().finally(() => {
        if (upgradeInFlight.get(cacheKey) === pending) upgradeInFlight.delete(cacheKey);
        ctx.scheduleIdleCombatWorkerRelease?.(60000);
      });

      upgradeInFlight.set(cacheKey, pending);
      return structuredClone(await pending);
    };

    // Two-stage adaptive builder for a single monster's 1..maxLevel curve:
    // Stage 1: fill all missing levels in [1..maxLevel] with baseTrials (default 250) in batched multi-core waves.
    // Stage 2: refine transition band (+/-15 levels) & anomaly jumps (or full range if fullPrecision) to targetTrials.
    ctx.buildCombatCurve = async function buildCombatCurve(
      profile,
      {
        minLevel = 1,
        maxLevel = DEFAULT_MAX_LEVEL,
        baseTrials = DEFAULT_BASE_TRIALS,
        targetTrials = 2500,
        fullPrecision = ctx.getCurveFullPrecisionSetting(),
        priorityLevels = null,
        priority = 2,
        batchSize = DEFAULT_BATCH_SIZE,
        seed = 173,
        cancelled = () => false,
        onBatchProgress = null
      } = {}
    ) {
      if (!profile || !statsMod) return null;
      const hi = Math.max(DEFAULT_MAX_LEVEL, Math.floor(ctx.finiteNumber(maxLevel, DEFAULT_MAX_LEVEL)));
      const lo = Math.max(1, Math.min(hi, Math.floor(ctx.finiteNumber(minLevel, 1))));
      const baseN = Math.max(50, Math.min(3000, Math.floor(ctx.finiteNumber(baseTrials, DEFAULT_BASE_TRIALS))));
      const targetN = Math.max(baseN, Math.min(3000, Math.floor(ctx.finiteNumber(targetTrials, 2500))));
      const entry = await hydrateCombatCurve(profile, hi);
      if (cancelled() || ctx.destroyed) return entry;

      const runWave = async (jobs, wavePriority, stageName) => {
        if (!jobs.length) return;
        const batches = [];
        for (let i = 0; i < jobs.length; i += batchSize) {
          batches.push(jobs.slice(i, i + batchSize));
        }
        let cursor = 0;
        const lanes = Math.max(1, Math.min(batches.length, ctx.getCombatParallelism()));
        await Promise.all(
          Array.from({ length: lanes }, async () => {
            while (!cancelled() && !ctx.destroyed) {
              const idx = cursor++;
              if (idx >= batches.length) return;
              const batch = batches[idx];
              const rows = await ctx.simulateCombatBatchWithWorker({
                playerDto: profile.playerDto,
                monsterHrid: profile.monsterHrid,
                mazeCrateItemHrids: profile.mazeCrateItemHrids,
                jobs: batch,
                parallel: true,
                priority: wavePriority
              });
              if (ctx.destroyed) return;
              for (const row of rows) {
                if (row?.stats) statsMod.mergeIntoLevel(entry.view, row.level, row.stats);
              }
              persistCurveEntry(entry);
              onBatchProgress?.({
                stage: stageName,
                completedLevels: countCompletedLevels(entry.view, hi),
                maxLevel: hi
              });
            }
          })
        );
      };

      // Stage 1A: P1 hot neighborhood around the active floor first so map exploration gets instant hits.
      if (Array.isArray(priorityLevels) && priorityLevels.length) {
        const hotJobs = [];
        const seenHot = new Set();
        for (const rawLv of priorityLevels) {
          const lv = Math.floor(Number(rawLv));
          if (lv < lo || lv > hi || seenHot.has(lv)) continue;
          seenHot.add(lv);
          const have = statsMod.readTrialsAt(entry.view, lv);
          if (have < baseN) {
            const plan = statsMod.buildChunkPlan(have, baseN, { baseSeed: seed, chunkSize: baseN });
            for (const c of plan) hotJobs.push({ level: lv, trials: c.trials, seed: c.seed });
          }
        }
        await runWave(hotJobs, Math.min(priority, 1), "stage1-hot");
        if (cancelled() || ctx.destroyed) return entry;
      }

      // Stage 1B: fill remaining levels in [lo..hi] with baseTrials.
      const stage1Jobs = [];
      for (let lv = lo; lv <= hi; lv++) {
        const have = statsMod.readTrialsAt(entry.view, lv);
        if (have < baseN) {
          const plan = statsMod.buildChunkPlan(have, baseN, { baseSeed: seed, chunkSize: baseN });
          for (const c of plan) stage1Jobs.push({ level: lv, trials: c.trials, seed: c.seed });
        }
      }
      await runWave(stage1Jobs, priority, "stage1");
      if (cancelled() || ctx.destroyed) return entry;

      // Stage 2: refine transition levels +/-15 buffer & anomaly points (or all levels in fullPrecision mode).
      if (targetN > baseN) {
        const refineLevels = statsMod.selectRefinementLevels(entry.view, hi, targetN, {
          minLevel: lo,
          forceFull: Boolean(fullPrecision)
        });
        const stage2Jobs = [];
        for (const lv of refineLevels) {
          const have = statsMod.readTrialsAt(entry.view, lv);
          const plan = statsMod.buildChunkPlan(have, targetN, { baseSeed: seed, chunkSize: DEFAULT_CHUNK_TRIALS });
          for (const c of plan) stage2Jobs.push({ level: lv, trials: c.trials, seed: c.seed });
        }
        // Use smaller batches for multi-chunk refinement so cores stay evenly balanced.
        const prevBatch = batchSize;
        batchSize = Math.min(prevBatch, 4);
        try {
          await runWave(stage2Jobs, priority, "stage2");
        } finally {
          batchSize = prevBatch;
        }
      }

      if (!cancelled() && !ctx.destroyed) {
        entry.baseTrials = Math.max(entry.baseTrials, baseN);
        entry.targetTrials = Math.max(entry.targetTrials, targetN);
        entry.fullPrecision = Boolean(fullPrecision);
        entry.refinedComplete = true;
        persistCurveEntry(entry);
      }
      return entry;
    };

    ctx.getCurvePrecomputeStatus = function getCurvePrecomputeStatus() {
      return {
        running: backgroundRunning,
        paused: backgroundPaused,
        ...backgroundProgress
      };
    };

    ctx.stopBackgroundCurvePrecompute = function stopBackgroundCurvePrecompute() {
      backgroundRunId += 1;
      backgroundRunning = false;
      backgroundPaused = false;
      backgroundProgress = { ...backgroundProgress, stage: "idle", currentMonster: "" };
      notifyCurveListeners();
    };

    function isLabyrinthSurfaceActive() {
      if (typeof document === "undefined" || document.hidden) return false;
      return Boolean(
        document.querySelector('[class*="LabyrinthPanel_roomGrid"], [class*="LabyrinthPanel_automationTable"]')
      );
    }

    // Background P1/P2 precomputation gated strictly on labyrinth visibility & attribute change.
    ctx.scheduleBackgroundCurvePrecompute = function scheduleBackgroundCurvePrecompute(state, options = {}) {
      if (ctx.destroyed || !state?.characterLabyrinth) return;
      const initClientData = ctx.getInitClientData();
      if (!initClientData) return;
      if (!options.force && !isLabyrinthSurfaceActive()) {
        if (backgroundRunning) {
          backgroundPaused = true;
          backgroundRunId += 1;
          backgroundRunning = false;
          backgroundProgress = { ...backgroundProgress, stage: "paused" };
          notifyCurveListeners();
        }
        return;
      }

      const identity = ctx.storageIdentity?.() || "";
      if (!identity) return;

      const maxEnhancementByItem = options.maxEnhancementByItem || ctx.buildMaxEnhancementByItem(state);
      const labyrinthUpgradeLevels = ctx.resolveLabyrinthUpgradeLevels(options);
      const fullPrecision = ctx.getCurveFullPrecisionSetting();
      const targetTrials = Math.max(
        DEFAULT_BASE_TRIALS,
        ctx.normalizeCombatSimTrials(ctx.loadAutomationCombatSimTrialsSetting?.() ?? 2500)
      );

      // Build ordered monster list: monsters present on current floor first, then the remaining monsters.
      const floorMonsters = new Set();
      const floorLevelsByMonster = new Map();
      const roomRows = Array.isArray(state.characterLabyrinth?.roomData) ? state.characterLabyrinth.roomData : [];
      for (const row of roomRows) {
        if (!Array.isArray(row)) continue;
        for (const room of row) {
          if (room?.roomType === ctx.LABYRINTH_COMBAT_ROOM_TYPE && room.monsterHrid) {
            floorMonsters.add(room.monsterHrid);
            const lv = Math.max(1, Math.floor(ctx.finiteNumber(room.recommendedLevel, 1)));
            if (!floorLevelsByMonster.has(room.monsterHrid)) floorLevelsByMonster.set(room.monsterHrid, []);
            floorLevelsByMonster.get(room.monsterHrid).push(lv);
          }
        }
      }

      const floor = Math.max(1, Math.floor(ctx.finiteNumber(state.characterLabyrinth?.currentFloor, 1)));
      const hotMin = Math.max(1, floor * 20 - 10);
      const hotMax = Math.max(DEFAULT_MAX_LEVEL, floor * 20 + 60);
      const defaultMaxLevel = Math.max(DEFAULT_MAX_LEVEL, floor * 20 + 40);

      const entries = (ctx.LABYRINTH_AUTOMATION_COMBAT_ROOM_TYPES || []).slice().sort((a, b) => {
        const aHot = floorMonsters.has(a.monsterHrid) ? 0 : 1;
        const bHot = floorMonsters.has(b.monsterHrid) ? 0 : 1;
        return aHot - bHot;
      });

      const profiles = [];
      for (const item of entries) {
        const profile = ctx.extractCombatProfile(state, initClientData, item.monsterHrid, maxEnhancementByItem, {
          labyrinthUpgradeLevels,
          identity
        });
        if (profile) profiles.push(profile);
      }
      if (!profiles.length) return;

      // Also warm all 10 skilling 1..300 curves synchronously (~3ms total).
      for (const item of ctx.LABYRINTH_AUTOMATION_SKILL_ROOM_TYPES || []) {
        const skProfile = ctx.extractSkillingProfile(state, initClientData, item.skillHrid, maxEnhancementByItem, {
          labyrinthUpgradeLevels
        });
        if (skProfile) ctx.getOrBuildSkillingCurve(skProfile, defaultMaxLevel);
      }

      // Check if all combat profiles are already hydrated and refined in memory.
      const allReady = profiles.every((p) => {
        const e = getCombatCurveSync(p);
        return (
          e &&
          e.hydrated &&
          e.maxLevel >= defaultMaxLevel &&
          e.completedLevels >= defaultMaxLevel &&
          e.refinedComplete &&
          e.targetTrials >= targetTrials &&
          (!fullPrecision || e.fullPrecision)
        );
      });
      if (allReady) {
        backgroundRunning = false;
        backgroundPaused = false;
        backgroundProgress = {
          readyMonsters: profiles.length,
          totalMonsters: profiles.length,
          refinedMonsters: profiles.length,
          currentMonster: "",
          stage: "ready"
        };
        notifyCurveListeners();
        return;
      }

      // Avoid restarting if already running for the exact same profile signature set.
      const runSignature =
        profiles.map((p) => p.curveKey).join(",") + `|${targetTrials}|${fullPrecision}|${defaultMaxLevel}`;
      if (backgroundRunning && ctx.__activeBackgroundCurveSignature === runSignature) {
        return;
      }

      ctx.__activeBackgroundCurveSignature = runSignature;
      const runId = ++backgroundRunId;
      backgroundRunning = true;
      backgroundPaused = false;
      const isCancelled = () =>
        ctx.destroyed ||
        runId !== backgroundRunId ||
        ctx.storageIdentity?.() !== identity ||
        (!options.force && !isLabyrinthSurfaceActive());

      void (async () => {
        try {
          backgroundProgress = {
            readyMonsters: 0,
            totalMonsters: profiles.length,
            refinedMonsters: 0,
            currentMonster: "",
            stage: "hydrating"
          };
          notifyCurveListeners();

          // Hydrate all 10 monsters from IndexedDB first (typically < 5ms total).
          const hydratedEntries = await Promise.all(profiles.map((p) => hydrateCombatCurve(p, defaultMaxLevel)));
          if (isCancelled()) return;

          const recount = () => {
            let ready = 0;
            let refined = 0;
            for (const e of hydratedEntries) {
              if (e.completedLevels >= defaultMaxLevel) ready++;
              if (e.refinedComplete && e.targetTrials >= targetTrials && (!fullPrecision || e.fullPrecision)) refined++;
            }
            backgroundProgress.readyMonsters = ready;
            backgroundProgress.refinedMonsters = refined;
          };
          recount();
          notifyCurveListeners();

          for (let i = 0; i < profiles.length; i++) {
            if (isCancelled()) return;
            const profile = profiles[i];
            const entry = hydratedEntries[i];
            const needsStage1 = entry.completedLevels < defaultMaxLevel;
            const needsStage2 =
              !entry.refinedComplete || entry.targetTrials < targetTrials || (fullPrecision && !entry.fullPrecision);
            if (!needsStage1 && !needsStage2) continue;

            const hotList = [];
            for (let lv = hotMin; lv <= Math.min(defaultMaxLevel, hotMax); lv++) hotList.push(lv);
            for (const lv of floorLevelsByMonster.get(profile.monsterHrid) || []) hotList.push(lv);

            backgroundProgress.currentMonster = profile.monsterHrid;
            backgroundProgress.stage = needsStage1 ? "stage1" : "stage2";
            notifyCurveListeners();

            await ctx.buildCombatCurve(profile, {
              minLevel: 1,
              maxLevel: defaultMaxLevel,
              baseTrials: DEFAULT_BASE_TRIALS,
              targetTrials,
              fullPrecision,
              priorityLevels: hotList,
              priority: 2,
              cancelled: isCancelled,
              onBatchProgress: ({ stage }) => {
                recount();
                backgroundProgress.stage = stage === "stage2" ? "stage2" : "stage1";
                notifyCurveListeners();
              }
            });
            recount();
            notifyCurveListeners();
          }

          if (!isCancelled()) {
            recount();
            backgroundProgress.currentMonster = "";
            backgroundProgress.stage = "ready";
            void curveStore?.flush?.();
          }
        } catch {
          /* Background precomputation errors never surface as modal failures. */
        } finally {
          if (runId === backgroundRunId) {
            backgroundRunning = false;
            if (!isLabyrinthSurfaceActive() && backgroundProgress.stage !== "ready") {
              backgroundPaused = true;
              backgroundProgress.stage = "paused";
            }
            ctx.scheduleIdleCombatWorkerRelease?.(60000);
            notifyCurveListeners();
          }
        }
      })();
    };

    ctx.flushCurveStore = async () => curveStore?.flush?.();
    ctx.clearCurveStore = async () => {
      ctx.stopBackgroundCurvePrecompute();
      combatCurves.clear();
      upgradeImpactCache.clear();
      ctx.clearSkillingSimulationCache?.();
      return curveStore ? curveStore.clear() : true;
    };
    ctx.disposeCurveEngine = () => {
      ctx.stopBackgroundCurvePrecompute();
      combatCurves.clear();
      hydratingCurves.clear();
      inFlightLevels.clear();
      upgradeImpactCache.clear();
      upgradeInFlight.clear();
      curveListeners.clear();
      curveStore?.close?.();
    };
  };
})(globalThis);
