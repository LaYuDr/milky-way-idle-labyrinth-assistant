// Fine-grained normalized capability snapshots & per-room-type change detection.
// Ensures recalculation occurs strictly for room types whose effective stats changed.
(function (root) {
  "use strict";

  root.MwiLabyrinthCalculatorModules ||= {};

  function quantize(value, scale = 1e9) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * scale);
  }

  // Fast synchronous 128-bit deterministic hash (4 independent 32-bit mixed lanes).
  function hash128(text) {
    const str = String(text || "");
    let h1 = 0x811c9dc5;
    let h2 = 0x9e3779b1;
    let h3 = 0x85ebca6b;
    let h4 = 0xc2b2ae35;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b) >>> 0;
      h3 = Math.imul(h3 ^ (c ^ (i >>> 1)), 0xc2b2ae35) >>> 0;
      h4 = Math.imul(h4 ^ ((c << 3) ^ i), 0x27d4eb2d) >>> 0;
    }
    const mix = (x) => {
      x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
      x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
      return ((x ^ (x >>> 16)) >>> 0).toString(16).padStart(8, "0");
    };
    return mix(h1 ^ h3) + mix(h2 ^ h4) + mix(h3 ^ h1) + mix(h4 ^ h2);
  }

  root.MwiLabyrinthCalculatorModules["profile-fingerprint"] = function (ctx) {
    let cachedGameDataRaw = null;
    let cachedGameDataHash = "";
    let lastSnapshotIdentity = "";
    let lastSkillKeys = new Map();
    let lastCombatKeys = new Map();

    ctx.hash128 = hash128;

    ctx.getSyncGameDataHash = function getSyncGameDataHash(initClientData) {
      const raw = ctx.cachedInitClientDataRaw;
      if (raw && raw === cachedGameDataRaw && cachedGameDataHash) {
        return cachedGameDataHash;
      }
      if (raw) {
        cachedGameDataRaw = raw;
        cachedGameDataHash = hash128(raw);
        return cachedGameDataHash;
      }
      if (!initClientData) return "";
      const fallbackRaw = JSON.stringify(initClientData);
      if (fallbackRaw === cachedGameDataRaw && cachedGameDataHash) return cachedGameDataHash;
      cachedGameDataRaw = fallbackRaw;
      cachedGameDataHash = hash128(fallbackRaw);
      return cachedGameDataHash;
    };

    function resolveUpgradeLevelsSafely(state, options) {
      if (options?.labyrinthUpgradeLevels && typeof options.labyrinthUpgradeLevels === "object") {
        return typeof ctx.normalizeLabyrinthUpgradeLevels === "function"
          ? ctx.normalizeLabyrinthUpgradeLevels(options.labyrinthUpgradeLevels)
          : options.labyrinthUpgradeLevels;
      }
      const fromState = ctx.readLabyrinthUpgradeLevelsFromState?.(state);
      if (fromState) {
        return typeof ctx.mergeLabyrinthUpgradeLevels === "function"
          ? ctx.mergeLabyrinthUpgradeLevels(ctx.latestLabyrinthUpgradeLevels || {}, fromState)
          : fromState;
      }
      if (ctx.latestLabyrinthUpgradeLevels) return ctx.latestLabyrinthUpgradeLevels;
      try {
        return ctx.resolveLabyrinthUpgradeLevels(options);
      } catch {
        return typeof ctx.createEmptyLabyrinthUpgradeLevels === "function"
          ? ctx.createEmptyLabyrinthUpgradeLevels()
          : {};
      }
    }

    ctx.extractSkillingProfile = function extractSkillingProfile(
      state,
      initClientData,
      skillHrid,
      maxEnhancementByItem,
      options = {}
    ) {
      if (!state || !skillHrid) return null;
      const skillId = ctx.skillHridToSkillId(skillHrid);
      if (!skillId) return null;
      const actionTypeHrid = ctx.skillIdToActionTypeHrid(skillId);
      const isEnhancing = skillId === "enhancing";
      const crateSelection = ctx.getLabyrinthCrateSelection(state);
      const labyrinthUpgradeLevels = resolveUpgradeLevelsSafely(state, options);
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

      const dummyRoom = {
        roomType: ctx.LABYRINTH_SKILLING_ROOM_TYPE,
        skillHrid
      };
      const roomLoadout = ctx.getSkillingRoomLoadoutMetrics(
        state,
        initClientData,
        dummyRoom,
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

      const baseSkillLevel = ctx.getSkillLevel(state.characterSkillMap, skillHrid);
      const skillLevelBonus = combinedMetrics.skillLevelBonus;
      const efficiencyBonus = combinedMetrics.efficiencyBonus;
      const actionSpeedBonus = combinedMetrics.actionSpeedBonus;
      const successBonus = combinedMetrics.successBonus;
      const crateDoubleProgressBonus = combinedMetrics.crateDoubleProgressBonus;
      const gatheringBonus = combinedMetrics.gatheringBonus;
      const effectiveSkillLevel = baseSkillLevel + skillLevelBonus;
      const doubleChance = ctx.clamp01(crateDoubleProgressBonus + gatheringBonus);

      const baseActionSeconds = isEnhancing ? ctx.BASE_ENHANCING_ACTION_SECONDS : ctx.BASE_ACTION_SECONDS;
      const actionSeconds = baseActionSeconds / Math.max(0.05, 1 + actionSpeedBonus);
      const attempts = Math.max(1, Math.floor(ctx.ROOM_DURATION_SECONDS / actionSeconds));

      const workPower = isEnhancing ? null : Math.max(0, effectiveSkillLevel * (1 + efficiencyBonus));
      const progressPerSuccess = isEnhancing ? null : ctx.getEffectiveSkillingProgressPerSuccess(workPower);

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
      const experienceMultiplier = Math.max(0, ctx.finiteNumber(experienceBonusDetail?.multiplier, 1));

      // Curve key depends ONLY on win-rate & attempt-count scalars (experienceMultiplier excluded!).
      const coreProfileKey = [
        skillId,
        isEnhancing ? 1 : 0,
        quantize(effectiveSkillLevel, 1e6),
        isEnhancing ? 0 : quantize(progressPerSuccess, 1e6),
        quantize(successBonus, 1e9),
        quantize(doubleChance, 1e9),
        attempts
      ].join("|");

      const fullProfileKey = [
        coreProfileKey,
        quantize(actionSpeedBonus, 1e9),
        quantize(efficiencyBonus, 1e9),
        quantize(experienceMultiplier, 1e9),
        quantize(baseSkillLevel, 1e6),
        ctx.getLabyrinthUpgradeLevel(labyrinthUpgradeLevels, ctx.LABYRINTH_UPGRADE_KEY_SKILLING_SUCCESS),
        ctx.getLabyrinthUpgradeLevel(labyrinthUpgradeLevels, ctx.LABYRINTH_UPGRADE_KEY_SKILLING_DOUBLE_PROGRESS)
      ].join("|");

      return {
        skillId,
        skillHrid,
        actionTypeHrid,
        isEnhancing,
        baseSkillLevel,
        skillLevelBonus,
        effectiveSkillLevel,
        efficiencyBonus,
        actionSpeedBonus,
        successBonus,
        doubleChance,
        crateDoubleProgressBonus,
        gatheringBonus,
        baseActionSeconds,
        actionSeconds,
        attempts,
        workPower,
        progressPerSuccess,
        experienceBonusDetail,
        experienceBonus,
        experienceMultiplier,
        globalMetrics,
        roomLoadout,
        crateMetrics,
        labyrinthUpgradeLevels,
        labyrinthUpgradeMetrics,
        labyrinthExperienceBonus,
        coreProfileKey,
        fullProfileKey
      };
    };

    ctx.normalizeCombatProfilePayload = function normalizeCombatProfilePayload(playerDto, mazeCrateItemHrids) {
      if (!playerDto || typeof playerDto !== "object") return null;
      const sortedEquipment = Object.entries(playerDto.equipment || {})
        .filter(([, item]) => item && item.hrid)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([slot, item]) => [slot, String(item.hrid), Math.max(0, Math.floor(Number(item.enhancementLevel) || 0))]);
      const abilities = (Array.isArray(playerDto.abilities) ? playerDto.abilities : []).map((ab) =>
        ab && ab.hrid
          ? [
              String(ab.hrid),
              Math.max(1, Math.floor(Number(ab.level) || 1)),
              (Array.isArray(ab.triggers) ? ab.triggers : []).map((t) => [
                String(t.dependencyHrid || ""),
                String(t.conditionHrid || ""),
                String(t.comparatorHrid || ""),
                Number(t.value) || 0
              ])
            ]
          : null
      );
      const sortNonZeroMap = (obj) =>
        Object.entries(obj || {})
          .filter(([, v]) => Number(v) > 0)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, Number(v)]);
      const achievements = Object.entries(playerDto.achievements || {})
        .filter(([, v]) => v === true)
        .map(([k]) => k)
        .sort();
      const crates = (Array.isArray(mazeCrateItemHrids) ? mazeCrateItemHrids : []).filter(Boolean).map(String).sort();

      return {
        levels: [
          Math.floor(Number(playerDto.staminaLevel) || 1),
          Math.floor(Number(playerDto.intelligenceLevel) || 1),
          Math.floor(Number(playerDto.attackLevel) || 1),
          Math.floor(Number(playerDto.meleeLevel) || 1),
          Math.floor(Number(playerDto.defenseLevel) || 1),
          Math.floor(Number(playerDto.rangedLevel) || 1),
          Math.floor(Number(playerDto.magicLevel) || 1)
        ],
        equipment: sortedEquipment,
        abilities,
        houseRooms: sortNonZeroMap(playerDto.houseRooms),
        achievements,
        labyrinthUpgrades: sortNonZeroMap(playerDto.labyrinthUpgrades),
        guildBuffs: sortNonZeroMap(playerDto.guildBuffs),
        crates,
        debuffOnLevelGap: Number(playerDto.debuffOnLevelGap) || 0
      };
    };

    ctx.extractCombatProfile = function extractCombatProfile(
      state,
      initClientData,
      monsterHrid,
      maxEnhancementByItem,
      options = {}
    ) {
      if (!state || !monsterHrid) return null;
      const room = {
        roomType: ctx.LABYRINTH_COMBAT_ROOM_TYPE,
        monsterHrid: String(monsterHrid),
        recommendedLevel: 1
      };
      const labyrinthUpgradeLevels = resolveUpgradeLevelsSafely(state, options);
      const combatCrate = ctx.getCombatCrateBuffs(state, initClientData);
      const guildCombatShrineLevels = ctx.getActiveGuildCombatShrineLevels(state);
      const playerData = ctx.buildCombatPlayerDtoForRoom(state, initClientData, room, maxEnhancementByItem, {
        ...options,
        labyrinthUpgradeLevels
      });
      if (!playerData?.playerDto) return null;

      const mazeCrateItemHrids = Array.isArray(combatCrate.combatCrateItemHrids)
        ? combatCrate.combatCrateItemHrids.slice()
        : [];
      const normalized = ctx.normalizeCombatProfilePayload(playerData.playerDto, mazeCrateItemHrids);
      const gameDataHash = ctx.getSyncGameDataHash(initClientData);
      const engineSignature = `${ctx.COMBAT_MODEL_SIGNATURE || ""}|${ctx.MWISIM_ENGINE_TAG || ""}`;
      const playerProfileHash = hash128(JSON.stringify([engineSignature, gameDataHash, normalized]));
      const characterId = String(options.identity ?? ctx.storageIdentity?.() ?? "");
      const curveKey = characterId ? `${characterId}:${monsterHrid}:${playerProfileHash}` : "";

      return {
        characterId,
        monsterHrid: String(monsterHrid),
        playerProfileHash,
        profileHash: playerProfileHash,
        curveKey,
        engineSignature,
        gameDataHash,
        playerData,
        playerDto: playerData.playerDto,
        mazeCrateItemHrids,
        combatCrate,
        combatCrateSignature: String(combatCrate.combatCrateSignature || combatCrate.teaCrateItemHrid || ""),
        guildCombatShrineLevels,
        labyrinthUpgradeLevels
      };
    };

    ctx.detectRoomProfileChanges = function detectRoomProfileChanges(state, initClientData, options = {}) {
      const identity = String(options.identity ?? ctx.storageIdentity?.() ?? "");
      const identityChanged = identity !== lastSnapshotIdentity;
      if (!state || !initClientData) {
        if (identityChanged) {
          lastSnapshotIdentity = identity;
          lastSkillKeys = new Map();
          lastCombatKeys = new Map();
        }
        return {
          identityChanged,
          changedSkills: [],
          changedMonsters: [],
          skillProfiles: new Map(),
          combatProfiles: new Map()
        };
      }

      const maxEnhancementByItem = options.maxEnhancementByItem || ctx.buildMaxEnhancementByItem(state);
      const labyrinthUpgradeLevels = resolveUpgradeLevelsSafely(state, options);
      const sharedOpts = { ...options, identity, labyrinthUpgradeLevels };

      const skillProfiles = new Map();
      const combatProfiles = new Map();
      const nextSkillKeys = new Map();
      const nextCombatKeys = new Map();
      const changedSkills = [];
      const changedMonsters = [];

      for (const entry of ctx.LABYRINTH_AUTOMATION_SKILL_ROOM_TYPES || []) {
        const profile = ctx.extractSkillingProfile(
          state,
          initClientData,
          entry.skillHrid,
          maxEnhancementByItem,
          sharedOpts
        );
        if (!profile) continue;
        skillProfiles.set(entry.skillHrid, profile);
        nextSkillKeys.set(entry.skillHrid, profile.fullProfileKey);
        if (identityChanged || lastSkillKeys.get(entry.skillHrid) !== profile.fullProfileKey) {
          changedSkills.push(entry.skillHrid);
        }
      }

      for (const entry of ctx.LABYRINTH_AUTOMATION_COMBAT_ROOM_TYPES || []) {
        const profile = ctx.extractCombatProfile(
          state,
          initClientData,
          entry.monsterHrid,
          maxEnhancementByItem,
          sharedOpts
        );
        if (!profile) continue;
        combatProfiles.set(entry.monsterHrid, profile);
        nextCombatKeys.set(entry.monsterHrid, profile.profileHash);
        if (identityChanged || lastCombatKeys.get(entry.monsterHrid) !== profile.profileHash) {
          changedMonsters.push(entry.monsterHrid);
        }
      }

      if (options.commit !== false) {
        lastSnapshotIdentity = identity;
        lastSkillKeys = nextSkillKeys;
        lastCombatKeys = nextCombatKeys;
      }

      return {
        identityChanged,
        changedSkills,
        changedMonsters,
        skillProfiles,
        combatProfiles,
        maxEnhancementByItem,
        labyrinthUpgradeLevels
      };
    };

    ctx.resetProfileChangeTracker = function resetProfileChangeTracker() {
      lastSnapshotIdentity = "";
      lastSkillKeys = new Map();
      lastCombatKeys = new Map();
    };
  };
})(globalThis);
