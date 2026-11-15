// Adapted from 迷宫胜率计算器 1.6.0, dakonglong, MIT. See docs/THIRD_PARTY.md.
(function (root) {
  "use strict";
  root.MwiLabyrinthCalculatorModules ||= {};
  root.MwiLabyrinthCalculatorModules["simulator-bridge"] = function (ctx) {
    ctx.isSimulatorBridgePage = function isSimulatorBridgePage() {
      const host = String(ctx.window.location.host || "").toLowerCase();
      const path = String(ctx.window.location.pathname || "");
      return host === "shykai.github.io" && path.includes("/MWICombatSimulatorTest/dist");
    };

    ctx.normalizeSimulatorBridgeUrl = function normalizeSimulatorBridgeUrl(value) {
      const raw = String(value || "").trim();
      if (!raw) {
        return ctx.SIMULATOR_BRIDGE_DEFAULT_URL;
      }
      try {
        const url = new URL(raw, ctx.window.location.href);
        if (!/^https?:$/i.test(url.protocol)) {
          return ctx.SIMULATOR_BRIDGE_DEFAULT_URL;
        }
        return url.toString();
      } catch (_error) {
        return ctx.SIMULATOR_BRIDGE_DEFAULT_URL;
      }
    };

    ctx.getSimulatorBridgeUrl = function getSimulatorBridgeUrl() {
      try {
        const fromStorage = ctx.storage.getItem(ctx.SIMULATOR_BRIDGE_URL_STORAGE_KEY);
        return ctx.normalizeSimulatorBridgeUrl(fromStorage);
      } catch (_error) {
        return ctx.SIMULATOR_BRIDGE_DEFAULT_URL;
      }
    };

    ctx.migrateLegacySimulatorBridgeUrl = function migrateLegacySimulatorBridgeUrl() {
      try {
        const raw = ctx.storage.getItem(ctx.SIMULATOR_BRIDGE_URL_STORAGE_KEY);
        if (!raw) {
          return;
        }
        const normalized = ctx.normalizeSimulatorBridgeUrl(raw);
        const normalizedLower = normalized.toLowerCase();
        const defaultLower = String(ctx.SIMULATOR_BRIDGE_DEFAULT_URL || "").toLowerCase();
        if (defaultLower && normalizedLower.startsWith(defaultLower)) {
          return;
        }
        const shouldMigrate = ctx.SIMULATOR_BRIDGE_LEGACY_URL_PREFIXES.some((legacyPrefix) => {
          return normalizedLower.startsWith(String(legacyPrefix || "").toLowerCase());
        });
        if (shouldMigrate) {
          ctx.storage.setItem(ctx.SIMULATOR_BRIDGE_URL_STORAGE_KEY, ctx.SIMULATOR_BRIDGE_DEFAULT_URL);
        }
      } catch (_error) {
        // Ignore storage write errors.
      }
    };

    ctx.encodeSimulatorBridgePayload = function encodeSimulatorBridgePayload(payload) {
      const json = JSON.stringify(payload || {});
      const lz = typeof globalThis.MwiLabyrinthCompression !== "undefined" ? globalThis.MwiLabyrinthCompression : null;
      if (lz && typeof lz.compressToEncodedURIComponent === "function") {
        const encoded = lz.compressToEncodedURIComponent(json);
        if (encoded) {
          return encoded;
        }
      }
      return encodeURIComponent(json);
    };

    ctx.decodeSimulatorBridgePayload = function decodeSimulatorBridgePayload(encoded) {
      const raw = String(encoded || "");
      if (!raw) {
        return null;
      }
      const lz = typeof globalThis.MwiLabyrinthCompression !== "undefined" ? globalThis.MwiLabyrinthCompression : null;
      if (lz && typeof lz.decompressFromEncodedURIComponent === "function") {
        try {
          const decompressed = lz.decompressFromEncodedURIComponent(raw);
          if (decompressed) {
            return JSON.parse(decompressed);
          }
        } catch (_error) {
          // Fall back to plain decoding.
        }
      }
      try {
        return JSON.parse(decodeURIComponent(raw));
      } catch (_error) {
        return null;
      }
    };

    ctx.extractSimulatorBridgePayloadFromLocation = function extractSimulatorBridgePayloadFromLocation() {
      try {
        const searchParams = new URLSearchParams(ctx.window.location.search || "");
        const searchValue = searchParams.get(ctx.SIMULATOR_BRIDGE_PAYLOAD_PARAM);
        if (searchValue) {
          return ctx.decodeSimulatorBridgePayload(searchValue);
        }
      } catch (_error) {
        // Continue to hash parsing.
      }

      try {
        const hashRaw = String(ctx.window.location.hash || "").replace(/^#/, "");
        if (!hashRaw) {
          return null;
        }
        const hashParams = new URLSearchParams(hashRaw);
        const hashValue = hashParams.get(ctx.SIMULATOR_BRIDGE_PAYLOAD_PARAM);
        if (hashValue) {
          return ctx.decodeSimulatorBridgePayload(hashValue);
        }
      } catch (_error) {
        return null;
      }
      return null;
    };

    ctx.clearSimulatorBridgePayloadFromLocation = function clearSimulatorBridgePayloadFromLocation() {
      try {
        const url = new URL(ctx.window.location.href);
        const searchParams = new URLSearchParams(url.search);
        searchParams.delete(ctx.SIMULATOR_BRIDGE_PAYLOAD_PARAM);
        url.search = searchParams.toString();

        const hashRaw = String(url.hash || "").replace(/^#/, "");
        if (hashRaw) {
          const hashParams = new URLSearchParams(hashRaw);
          hashParams.delete(ctx.SIMULATOR_BRIDGE_PAYLOAD_PARAM);
          const hash = hashParams.toString();
          url.hash = hash ? `#${hash}` : "";
        }

        history.replaceState(null, "", url.toString());
      } catch (_error) {
        // Ignore URL cleanup errors.
      }
    };

    ctx.buildSimulatorBridgeLaunchUrl = function buildSimulatorBridgeLaunchUrl(payload) {
      const baseUrl = ctx.normalizeSimulatorBridgeUrl(ctx.getSimulatorBridgeUrl());
      const encoded = ctx.encodeSimulatorBridgePayload(payload);
      const url = new URL(baseUrl, ctx.window.location.href);
      url.hash = `${ctx.SIMULATOR_BRIDGE_PAYLOAD_PARAM}=${encoded}`;
      return url.toString();
    };

    ctx.equipmentTypeToItemLocationHrid = function equipmentTypeToItemLocationHrid(equipmentTypeHrid) {
      const raw = String(equipmentTypeHrid || "");
      if (!raw.startsWith("/equipment_types/")) {
        return "";
      }
      return raw.replace("/equipment_types/", "/item_locations/");
    };

    ctx.normalizeSimulatorImportConsumableSlots = function normalizeSimulatorImportConsumableSlots(
      entries,
      slotCount = 3
    ) {
      const result = [];
      const source = Array.isArray(entries) ? entries : [];
      for (const entry of source) {
        const itemHrid = String(entry?.hrid || entry?.itemHrid || "");
        result.push({ itemHrid });
        if (result.length >= slotCount) {
          break;
        }
      }
      while (result.length < slotCount) {
        result.push({ itemHrid: "" });
      }
      return result;
    };

    ctx.normalizeSimulatorImportAbilitySlots = function normalizeSimulatorImportAbilitySlots(entries, slotCount = 5) {
      const result = [];
      const source = Array.isArray(entries) ? entries : [];
      for (let i = 0; i < slotCount; i += 1) {
        const ability = source[i];
        const abilityHrid = String(ability?.hrid || ability?.abilityHrid || "");
        const level = Math.max(1, Math.floor(ctx.finiteNumber(ability?.level, 1)));
        result.push({
          abilityHrid,
          level: String(level)
        });
      }
      return result;
    };

    ctx.buildSimulatorImportTriggerMap = function buildSimulatorImportTriggerMap(playerDto, options = {}) {
      const includeConsumables = options?.includeConsumables !== false;
      const triggerMap = {};

      function include(entry) {
        const hrid = String(entry?.hrid || "");
        if (!hrid) {
          return;
        }
        const triggers = ctx.normalizeTriggerList(entry?.triggers || []);
        if (!triggers.length && options?.keepEmptyAbilityTriggers !== true) {
          return;
        }
        triggerMap[hrid] = ctx.deepCloneJson(triggers);
      }

      const foods = Array.isArray(playerDto?.food) ? playerDto.food : [];
      const drinks = Array.isArray(playerDto?.drinks) ? playerDto.drinks : [];
      const abilities = Array.isArray(playerDto?.abilities) ? playerDto.abilities : [];

      if (includeConsumables) {
        for (const entry of foods) {
          include(entry);
        }
        for (const entry of drinks) {
          include(entry);
        }
      }
      for (const entry of abilities) {
        include(entry);
      }

      return triggerMap;
    };

    ctx.buildCombatZoneCandidatesByMonster = function buildCombatZoneCandidatesByMonster(initClientData, monsterHrid) {
      const targetMonsterHrid = String(monsterHrid || "");
      if (!targetMonsterHrid) {
        return [];
      }
      const actionDetailMap = initClientData?.actionDetailMap;
      if (!actionDetailMap) {
        return [];
      }

      const candidateMap = new Map();

      function pushCandidate(actionHrid, actionDetail, difficultyTier, sourceTag, waveHint = 0) {
        const normalizedActionHrid = String(actionHrid || "");
        if (!normalizedActionHrid) {
          return;
        }
        const normalizedDifficultyTier = Math.max(0, Math.floor(ctx.finiteNumber(difficultyTier, 0)));
        const normalizedWaveHint = Math.max(0, Math.floor(ctx.finiteNumber(waveHint, 0)));
        const key = `${normalizedActionHrid}|${normalizedDifficultyTier}`;
        const current = candidateMap.get(key);
        if (!current) {
          candidateMap.set(key, {
            actionHrid: normalizedActionHrid,
            difficultyTier: normalizedDifficultyTier,
            source: sourceTag,
            sortIndex: ctx.finiteNumber(actionDetail?.sortIndex, Number.MAX_SAFE_INTEGER),
            isDungeon: actionDetail?.combatZoneInfo?.isDungeon === true,
            startWave:
              normalizedWaveHint > 0 && (sourceTag === "dungeon-fixed" || sourceTag === "dungeon-random")
                ? normalizedWaveHint
                : 0
          });
          return;
        }
        if (!current.startWave && normalizedWaveHint > 0) {
          current.startWave = normalizedWaveHint;
        } else if (current.startWave > 0 && normalizedWaveHint > 0) {
          current.startWave = Math.min(current.startWave, normalizedWaveHint);
        }
      }

      function collectFromSpawnList(actionHrid, actionDetail, spawnList, sourceTag, waveHint = 0) {
        for (const spawn of Array.isArray(spawnList) ? spawnList : []) {
          if (!spawn || String(spawn.combatMonsterHrid || "") !== targetMonsterHrid) {
            continue;
          }
          pushCandidate(actionHrid, actionDetail, spawn.difficultyTier, sourceTag, waveHint);
        }
      }

      for (const [actionHrid, actionDetail] of ctx.getContainerEntries(actionDetailMap)) {
        if (!actionDetail || actionDetail.type !== "/action_types/combat") {
          continue;
        }
        const zoneInfo = actionDetail.combatZoneInfo;
        if (!zoneInfo) {
          continue;
        }

        const fightInfo = zoneInfo.fightInfo || {};
        collectFromSpawnList(actionHrid, actionDetail, fightInfo.bossSpawns, "boss");
        collectFromSpawnList(actionHrid, actionDetail, fightInfo?.randomSpawnInfo?.spawns, "random");

        const dungeonInfo = zoneInfo.dungeonInfo || {};
        for (const [waveKey, fixedSpawns] of Object.entries(dungeonInfo.fixedSpawnsMap || {})) {
          collectFromSpawnList(actionHrid, actionDetail, fixedSpawns, "dungeon-fixed", Number(waveKey));
        }
        for (const [waveKey, randomInfo] of Object.entries(dungeonInfo.randomSpawnInfoMap || {})) {
          collectFromSpawnList(actionHrid, actionDetail, randomInfo?.spawns, "dungeon-random", Number(waveKey));
        }
      }

      const candidates = Array.from(candidateMap.values());
      if (!candidates.length) {
        return [];
      }

      candidates.sort((a, b) => {
        if (a.isDungeon !== b.isDungeon) {
          return a.isDungeon ? -1 : 1;
        }
        if (a.sortIndex !== b.sortIndex) {
          return a.sortIndex - b.sortIndex;
        }
        if (a.difficultyTier !== b.difficultyTier) {
          return a.difficultyTier - b.difficultyTier;
        }
        return a.actionHrid.localeCompare(b.actionHrid);
      });
      return candidates;
    };

    ctx.findSuggestedCombatZoneByMonster = function findSuggestedCombatZoneByMonster(initClientData, monsterHrid) {
      const candidates = ctx.buildCombatZoneCandidatesByMonster(initClientData, monsterHrid);
      return candidates.length ? candidates[0] : null;
    };

    ctx.buildSimulatorImportSetFromPlayerDto = function buildSimulatorImportSetFromPlayerDto(
      state,
      playerDto,
      defaultZoneHrid,
      simulationTime = "24"
    ) {
      const levels = {
        attackLevel: ctx.positiveNumber(playerDto?.attackLevel, 1),
        magicLevel: ctx.positiveNumber(playerDto?.magicLevel, 1),
        meleeLevel: ctx.positiveNumber(playerDto?.meleeLevel, 1),
        rangedLevel: ctx.positiveNumber(playerDto?.rangedLevel, 1),
        defenseLevel: ctx.positiveNumber(playerDto?.defenseLevel, 1),
        staminaLevel: ctx.positiveNumber(playerDto?.staminaLevel, 1),
        intelligenceLevel: ctx.positiveNumber(playerDto?.intelligenceLevel, 1)
      };

      const equipment = [];
      for (const [equipmentTypeHrid, entry] of Object.entries(playerDto?.equipment || {})) {
        const itemHrid = String(entry?.hrid || "");
        if (!itemHrid) {
          continue;
        }
        const itemLocationHrid = ctx.equipmentTypeToItemLocationHrid(equipmentTypeHrid);
        if (!itemLocationHrid) {
          continue;
        }
        equipment.push({
          itemLocationHrid,
          itemHrid,
          enhancementLevel: Math.max(0, Math.floor(ctx.finiteNumber(entry?.enhancementLevel, 0)))
        });
      }
      equipment.sort((a, b) => a.itemLocationHrid.localeCompare(b.itemLocationHrid));

      const food = ctx.normalizeSimulatorImportConsumableSlots(playerDto?.food, 3);
      const drinks = ctx.normalizeSimulatorImportConsumableSlots(playerDto?.drinks, 3);
      const abilities = ctx.normalizeSimulatorImportAbilitySlots(playerDto?.abilities, 5);
      const triggerMap = ctx.buildSimulatorImportTriggerMap(playerDto, {
        includeConsumables: false,
        keepEmptyAbilityTriggers: true
      });

      return {
        player: {
          ...levels,
          equipment
        },
        food: {
          "/action_types/combat": food
        },
        drinks: {
          "/action_types/combat": drinks
        },
        abilities,
        triggerMap,
        zone: String(defaultZoneHrid || "/actions/combat/fly"),
        simulationTime: String(simulationTime || "24"),
        houseRooms: ctx.buildHouseRoomLevelMap(state),
        achievements: ctx.buildAchievementCompletionMap(state),
        labyrinth: ctx.buildSimulatorLabyrinthImportLevels(playerDto?.labyrinthUpgrades),
        guildBuffs: playerDto?.guildBuffs || ctx.getActiveGuildCombatShrineLevels(state)
      };
    };

    ctx.buildEmptySimulatorImportConsumableSlots = function buildEmptySimulatorImportConsumableSlots(slotCount = 3) {
      const result = [];
      for (let i = 0; i < slotCount; i += 1) {
        result.push({ itemHrid: "" });
      }
      return result;
    };

    ctx.stripConsumablesFromSimulatorImportSet = function stripConsumablesFromSimulatorImportSet(importSet) {
      if (!importSet || typeof importSet !== "object") {
        return importSet;
      }
      const sanitizedTriggerMap = {};
      for (const [key, value] of Object.entries(importSet.triggerMap || {})) {
        const hrid = String(key || "");
        if (!hrid.startsWith("/abilities/")) {
          continue;
        }
        sanitizedTriggerMap[hrid] = ctx.deepCloneJson(value);
      }
      return {
        ...importSet,
        food: {
          "/action_types/combat": ctx.buildEmptySimulatorImportConsumableSlots(3)
        },
        drinks: {
          "/action_types/combat": ctx.buildEmptySimulatorImportConsumableSlots(3)
        },
        triggerMap: sanitizedTriggerMap
      };
    };

    ctx.buildFallbackSimulatorImportSetFromState = function buildFallbackSimulatorImportSetFromState(
      state,
      defaultZoneHrid,
      simulationTime = "24"
    ) {
      const levels = ctx.getCombatSkillLevelsFromState(state);
      const fallbackDto = {
        attackLevel: ctx.positiveNumber(levels.attack, 1),
        magicLevel: ctx.positiveNumber(levels.magic, 1),
        meleeLevel: ctx.positiveNumber(levels.melee, 1),
        rangedLevel: ctx.positiveNumber(levels.ranged, 1),
        defenseLevel: ctx.positiveNumber(levels.defense, 1),
        staminaLevel: ctx.positiveNumber(levels.stamina, 1),
        intelligenceLevel: ctx.positiveNumber(levels.intelligence, 1),
        equipment: {},
        food: [],
        drinks: [],
        abilities: [],
        labyrinthUpgrades: ctx.buildSimulatorLabyrinthUpgrades(ctx.resolveLabyrinthUpgradeLevels()),
        guildBuffs: ctx.getActiveGuildCombatShrineLevels(state)
      };
      return ctx.buildSimulatorImportSetFromPlayerDto(state, fallbackDto, defaultZoneHrid, simulationTime);
    };

    ctx.buildCombatRoomSimulatorBridgePayload = function buildCombatRoomSimulatorBridgePayload(
      state,
      initClientData,
      room,
      maxEnhancementByItem
    ) {
      if (!room || room.roomType !== ctx.LABYRINTH_COMBAT_ROOM_TYPE || !room.monsterHrid) {
        return null;
      }
      const roomLevel = Math.max(1, Math.floor(ctx.positiveNumber(room?.recommendedLevel, 1)));
      const zoneCandidates = ctx.buildCombatZoneCandidatesByMonster(initClientData, room.monsterHrid);
      const zoneSuggestion = zoneCandidates.length ? zoneCandidates[0] : null;
      const suggestedZoneHrid = String(zoneSuggestion?.actionHrid || "/actions/combat/fly");
      const suggestedDifficultyTier = Math.max(0, Math.floor(ctx.finiteNumber(zoneSuggestion?.difficultyTier, 0)));
      const suggestedStartWave = Math.max(0, Math.floor(ctx.finiteNumber(zoneSuggestion?.startWave, 0)));
      const loadoutInfo = ctx.resolveCombatRoomLoadout(state, room);
      const combatCrate = ctx.getCombatCrateBuffs(state, initClientData);
      const combatCrateItemHrids = Array.isArray(combatCrate?.combatCrateItemHrids)
        ? combatCrate.combatCrateItemHrids
        : [];
      const coffeeCrateItemHrid = String(
        combatCrate?.coffeeCrateItemHrid ||
          combatCrateItemHrids.find((itemHrid) => String(itemHrid || "").includes("coffee_crate")) ||
          ""
      );
      const foodCrateItemHrid = String(
        combatCrate?.foodCrateItemHrid ||
          combatCrateItemHrids.find((itemHrid) => String(itemHrid || "").includes("food_crate")) ||
          ""
      );
      const teaCrateItemHrid = String(combatCrate?.teaCrateItemHrid || "");
      const playerData = ctx.buildCombatPlayerDtoForRoom(state, initClientData, room, maxEnhancementByItem);
      const importSetRaw = playerData?.playerDto
        ? ctx.buildSimulatorImportSetFromPlayerDto(state, playerData.playerDto, suggestedZoneHrid, "24")
        : ctx.buildFallbackSimulatorImportSetFromState(state, suggestedZoneHrid, "24");
      const importSet = ctx.stripConsumablesFromSimulatorImportSet(importSetRaw);

      return {
        source: ctx.SIMULATOR_BRIDGE_SOURCE,
        version: ctx.SIMULATOR_BRIDGE_VERSION,
        generatedAt: new Date().toISOString(),
        uiLanguage: ctx.getUiLanguage(),
        monsterHrid: String(room.monsterHrid),
        roomLevel,
        mazeDifficulty: roomLevel,
        suggestedZoneHrid,
        suggestedDifficultyTier,
        suggestedIsDungeon: zoneSuggestion?.isDungeon === true,
        suggestedStartWave,
        zoneCandidates: zoneCandidates.slice(0, 32).map((candidate) => ({
          zoneHrid: String(candidate?.actionHrid || ""),
          difficultyTier: Math.max(0, Math.floor(ctx.finiteNumber(candidate?.difficultyTier, 0))),
          isDungeon: candidate?.isDungeon === true,
          startWave: Math.max(0, Math.floor(ctx.finiteNumber(candidate?.startWave, 0)))
        })),
        loadoutSource: String(loadoutInfo?.source || "unknown"),
        loadoutId: Number(loadoutInfo?.loadoutId || 0),
        selectedLoadoutId: Number(loadoutInfo?.selectedLoadoutId || loadoutInfo?.loadoutId || 0),
        teaCrateItemHrid,
        coffeeCrateItemHrid,
        foodCrateItemHrid,
        importSet
      };
    };

    ctx.getRoomFromCell = function getRoomFromCell(state, cell) {
      const roomKey = ctx.getRoomKeyFromCell(cell);
      const point = ctx.parseRoomKey(roomKey);
      const roomRows = state?.characterLabyrinth?.roomData;
      if (!point || !Array.isArray(roomRows) || !Array.isArray(roomRows[point.y])) {
        return null;
      }
      return roomRows[point.y][point.x] || null;
    };

    ctx.openCombatRoomSimulatorFromCell = function openCombatRoomSimulatorFromCell(cell) {
      const state = ctx.getGameState();
      const initClientData = ctx.getInitClientData();
      if (!state || !initClientData) {
        ctx.window.alert(ctx.t("readGameDataFailed"));
        return;
      }
      const room = ctx.getRoomFromCell(state, cell);
      if (!room || room.roomType !== ctx.LABYRINTH_COMBAT_ROOM_TYPE || !room.monsterHrid) {
        ctx.window.alert(ctx.t("exportableCombatRoomNotFound"));
        return;
      }
      const maxEnhancementByItem = ctx.buildMaxEnhancementByItem(state);
      const payload = ctx.buildCombatRoomSimulatorBridgePayload(state, initClientData, room, maxEnhancementByItem);
      if (!payload?.importSet) {
        ctx.window.alert(ctx.t("simulatorExportNoLoadout"));
        return;
      }
      const launchUrl = ctx.buildSimulatorBridgeLaunchUrl(payload);
      ctx.window.open(launchUrl, "_blank", "noopener,noreferrer");
    };

    ctx.getAutomationCombatRoomFromCell = function getAutomationCombatRoomFromCell(cell, state, initClientData) {
      if (!cell || !state || !initClientData) {
        return null;
      }
      const roomTypeKey = String(cell.getAttribute("data-mwi-labyrinth-calc-auto-room-key") || "");
      if (!roomTypeKey) {
        return null;
      }
      const panelInstance = ctx.getLabyrinthPanelInstance();
      const entry = ctx.getAutomationRoomTypeEntryByKey(roomTypeKey, panelInstance);
      if (!entry || !entry.isCombat || !entry.monsterHrid) {
        return null;
      }

      let roomLevel = NaN;
      const recommend = ctx.getAutomationRecommendFromCell(cell);
      if (recommend?.status === "ready" && recommend?.isCombat) {
        roomLevel = Math.floor(ctx.finiteNumber(recommend.roomLevel, NaN));
      }
      const estimate = ctx.getAutomationEstimateFromCell(cell);
      if (!Number.isFinite(roomLevel) && estimate?.status === "ready" && estimate?.isCombat) {
        roomLevel = Math.floor(ctx.finiteNumber(estimate.roomLevel, NaN));
      }

      if (!Number.isFinite(roomLevel)) {
        const entries = ctx.getAutomationRoomTypeEntries(panelInstance);
        const skipThresholdOverrides = ctx.buildAutomationSkipThresholdOverrideMap(entries);
        const skipThreshold = ctx.resolveAutomationSkipThreshold(
          panelInstance,
          entry.key,
          state,
          skipThresholdOverrides
        );
        const effectiveLevel = ctx.resolveAutomationEffectiveLevel(panelInstance, entry, state, initClientData, {
          includePersonalBuffs: false
        });
        roomLevel = ctx.computeAutomationTargetRoomLevel(effectiveLevel, skipThreshold);
      }

      if (!Number.isFinite(roomLevel) || roomLevel < 1) {
        return {
          skipped: true
        };
      }

      return {
        room: ctx.createAutomationRoomFromEntry(entry, roomLevel)
      };
    };

    ctx.openCombatRoomSimulatorFromAutomationCell = function openCombatRoomSimulatorFromAutomationCell(cell) {
      const state = ctx.getGameState();
      const initClientData = ctx.getInitClientData();
      if (!state || !initClientData) {
        ctx.window.alert(ctx.t("readGameDataFailed"));
        return;
      }
      const resolved = ctx.getAutomationCombatRoomFromCell(cell, state, initClientData);
      if (!resolved) {
        ctx.window.alert(ctx.t("exportableCombatRoomNotFound"));
        return;
      }
      if (resolved.skipped) {
        ctx.window.alert(ctx.t("skippedCannotExport"));
        return;
      }
      const room = resolved.room;
      if (!room || room.roomType !== ctx.LABYRINTH_COMBAT_ROOM_TYPE || !room.monsterHrid) {
        ctx.window.alert(ctx.t("exportableCombatRoomNotFound"));
        return;
      }
      const maxEnhancementByItem = ctx.buildMaxEnhancementByItem(state);
      const payload = ctx.buildCombatRoomSimulatorBridgePayload(state, initClientData, room, maxEnhancementByItem);
      if (!payload?.importSet) {
        ctx.window.alert(ctx.t("simulatorExportNoLoadout"));
        return;
      }
      const launchUrl = ctx.buildSimulatorBridgeLaunchUrl(payload);
      ctx.window.open(launchUrl, "_blank", "noopener,noreferrer");
    };

    ctx.setInputControlValue = function setInputControlValue(element, value) {
      if (!element) {
        return;
      }
      element.value = String(value ?? "");
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    };

    ctx.setSelectControlValue = function setSelectControlValue(select, value) {
      if (!select || !select.options) {
        return false;
      }
      const target = String(value || "");
      if (!target) {
        return false;
      }
      for (const option of Array.from(select.options)) {
        if (String(option.value || "") === target) {
          select.value = option.value;
          select.dispatchEvent(new Event("input", { bubbles: true }));
          select.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
      }

      const targetTail = target.split("/").pop() || target;
      for (const option of Array.from(select.options)) {
        const optionValue = String(option.value || "");
        const optionTail = optionValue.split("/").pop() || optionValue;
        if (optionTail === targetTail) {
          select.value = option.value;
          select.dispatchEvent(new Event("input", { bubbles: true }));
          select.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
      }
      return false;
    };

    ctx.setCheckboxControlValue = function setCheckboxControlValue(checkbox, checked) {
      if (!checkbox) {
        return false;
      }
      const target = checked === true;
      if (checkbox.checked !== target) {
        checkbox.checked = target;
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return true;
    };

    ctx.resolveSimulatorLabyrinthSelection = function resolveSimulatorLabyrinthSelection(payload) {
      const monsterHrid = String(payload?.monsterHrid || "");
      if (!monsterHrid) {
        return null;
      }
      const roomLevelRaw = Number(payload?.mazeDifficulty);
      const roomLevel = Number.isFinite(roomLevelRaw) ? Math.max(20, Math.floor(roomLevelRaw)) : null;
      return {
        labyrinthHrid: monsterHrid,
        roomLevel
      };
    };

    ctx.applyMonsterSelectionOnSimulatorPage = function applyMonsterSelectionOnSimulatorPage(payload) {
      let applied = false;
      ctx.setCheckboxControlValue(document.querySelector("input#simAllZoneToggle"), false);
      ctx.setCheckboxControlValue(document.querySelector("input#simAllSoloToggle"), false);
      ctx.setCheckboxControlValue(document.querySelector("input#simAllLabyrinthsToggle"), false);

      const labyrinthSelection = ctx.resolveSimulatorLabyrinthSelection(payload);
      if (!labyrinthSelection) {
        return false;
      }
      if (ctx.setCheckboxControlValue(document.querySelector("input#simLabyrinthToggle"), true)) {
        applied = true;
      }
      if (ctx.setCheckboxControlValue(document.querySelector("input#simDungeonToggle"), false)) {
        applied = true;
      }
      if (
        ctx.setSelectControlValue(document.querySelector("select#selectLabyrinth"), labyrinthSelection.labyrinthHrid)
      ) {
        applied = true;
      }
      if (Number.isFinite(Number(labyrinthSelection.roomLevel))) {
        ctx.setInputControlValue(
          document.querySelector("input#inputRoomLevel"),
          String(Math.max(20, Math.floor(Number(labyrinthSelection.roomLevel))))
        );
        applied = true;
      }
      return applied;
    };

    ctx.applySimulatorPlayerSelectionOnPage = function applySimulatorPlayerSelectionOnPage() {
      let applied = false;
      for (let i = 1; i <= 5; i += 1) {
        const checkbox =
          document.querySelector(`input#player${i}.form-check-input.player-checkbox`) ||
          document.querySelector(`input#player${i}`);
        if (!checkbox) {
          continue;
        }
        const shouldCheck = i === 1;
        if (ctx.setCheckboxControlValue(checkbox, shouldCheck)) {
          applied = true;
        }
      }
      return applied;
    };

    ctx.applySimulatorCrateSelectionOnPage = function applySimulatorCrateSelectionOnPage(payload) {
      let applied = false;
      if (
        ctx.setSelectControlValue(document.querySelector("select#selectCoffeeCrates"), payload?.coffeeCrateItemHrid)
      ) {
        applied = true;
      }
      if (ctx.setSelectControlValue(document.querySelector("select#selectFoodCrates"), payload?.foodCrateItemHrid)) {
        applied = true;
      }
      if (ctx.setSelectControlValue(document.querySelector("select#selectTeaCrates"), payload?.teaCrateItemHrid)) {
        applied = true;
      }
      return applied;
    };

    ctx.applySimulatorLanguageOnPage = function applySimulatorLanguageOnPage(payload) {
      const nextLanguage = ctx.normalizeUiLanguage(payload?.uiLanguage) || ctx.UI_LANGUAGE_EN;
      try {
        ctx.storage.setItem(ctx.UI_LANGUAGE_STORAGE_KEY, nextLanguage);
      } catch (_error) {
        // Ignore storage write errors.
      }
      try {
        if (ctx.window.i18next && typeof ctx.window.i18next.changeLanguage === "function") {
          ctx.window.i18next.changeLanguage(nextLanguage);
        }
      } catch (_error) {
        // Ignore language switching errors.
      }
    };

    ctx.applySimulatorBridgeFieldsOnPage = function applySimulatorBridgeFieldsOnPage(payload, sanitizedImportSet) {
      ctx.applySimulatorLanguageOnPage(payload);
      ctx.applyMonsterSelectionOnSimulatorPage(payload);
      ctx.applySimulatorPlayerSelectionOnPage();
      ctx.applySimulatorCrateSelectionOnPage(payload);

      if (Number.isFinite(Number(payload?.mazeDifficulty))) {
        const roomLevel = Math.max(20, Math.floor(Number(payload.mazeDifficulty)));
        ctx.setInputControlValue(document.querySelector("input#inputRoomLevel"), String(roomLevel));
      }

      if (sanitizedImportSet?.simulationTime !== undefined) {
        ctx.setInputControlValue(
          document.querySelector("input#inputSimulationTime"),
          String(sanitizedImportSet.simulationTime)
        );
      }
    };

    ctx.collectSimulatorSupportedHrids = function collectSimulatorSupportedHrids(attributeName) {
      const supported = new Set();
      if (!attributeName) {
        return supported;
      }
      const selector = `[${attributeName}]`;
      for (const element of Array.from(document.querySelectorAll(selector))) {
        const hrid = String(element?.getAttribute(attributeName) || "").trim();
        if (hrid) {
          supported.add(hrid);
        }
      }
      return supported;
    };

    ctx.sanitizeImportMapBySupportedHrids = function sanitizeImportMapBySupportedHrids(
      rawMap,
      supportedHrids,
      transformValue
    ) {
      const result = {};
      if (!rawMap || typeof rawMap !== "object" || Array.isArray(rawMap)) {
        return result;
      }
      if (!(supportedHrids instanceof Set) || supportedHrids.size === 0) {
        return result;
      }
      for (const [rawKey, rawValue] of Object.entries(rawMap)) {
        const hrid = String(rawKey || "");
        if (!hrid || !supportedHrids.has(hrid)) {
          continue;
        }
        result[hrid] = typeof transformValue === "function" ? transformValue(rawValue) : rawValue;
      }
      return result;
    };

    ctx.sanitizeSimulatorImportSetForPage = function sanitizeSimulatorImportSetForPage(importSet) {
      if (!importSet || typeof importSet !== "object") {
        return importSet;
      }
      const sanitized = {
        ...importSet
      };

      const supportedHouseRoomHrids = ctx.collectSimulatorSupportedHrids("data-house-hrid");
      sanitized.houseRooms = ctx.sanitizeImportMapBySupportedHrids(
        importSet.houseRooms,
        supportedHouseRoomHrids,
        (value) => {
          return Math.max(0, Math.floor(ctx.finiteNumber(value, 0)));
        }
      );

      const supportedAchievementHrids = ctx.collectSimulatorSupportedHrids("data-achievement-hrid");
      sanitized.achievements = ctx.sanitizeImportMapBySupportedHrids(
        importSet.achievements,
        supportedAchievementHrids,
        (value) => {
          return value === true;
        }
      );

      return sanitized;
    };

    ctx.buildSimulatorGroupImportSetForPage = function buildSimulatorGroupImportSetForPage(importSet) {
      if (!importSet || typeof importSet !== "object") {
        return null;
      }
      const serialized = JSON.stringify(importSet);
      return {
        1: serialized,
        2: serialized,
        3: serialized,
        4: serialized,
        5: serialized
      };
    };

    ctx.applySimulatorBridgePayloadOnSimulatorPage = function applySimulatorBridgePayloadOnSimulatorPage(payload) {
      const importSet = payload?.importSet;
      if (!importSet || typeof importSet !== "object") {
        return false;
      }

      const sanitizedImportSet = ctx.sanitizeSimulatorImportSetForPage(importSet);
      const importButton = document.querySelector("button#buttonImportSet");
      if (!importButton) {
        return false;
      }

      let imported = false;

      const groupTab = document.querySelector("a#group-combat-tab");
      if (groupTab) {
        groupTab.click();
      }
      const inputSetGroupAll = document.querySelector("input#inputSetGroupCombatAll, textarea#inputSetGroupCombatAll");
      if (inputSetGroupAll) {
        const groupImportSet = ctx.buildSimulatorGroupImportSetForPage(sanitizedImportSet);
        if (groupImportSet) {
          ctx.setInputControlValue(inputSetGroupAll, JSON.stringify(groupImportSet));
          importButton.click();
          imported = true;
        }
      }

      if (!imported) {
        const soloTab = document.querySelector("a#solo-tab");
        if (soloTab) {
          soloTab.click();
        }
        const inputSetSolo = document.querySelector("input#inputSetSolo, textarea#inputSetSolo");
        if (!inputSetSolo) {
          return false;
        }
        ctx.setInputControlValue(inputSetSolo, JSON.stringify(sanitizedImportSet));
        importButton.click();
        imported = true;
      }

      if (!imported) {
        return false;
      }

      ctx.applySimulatorBridgeFieldsOnPage(payload, sanitizedImportSet);
      // Some controls are initialized a moment after import completes.
      // Perform one delayed sync, but avoid long-running rewrites that block user edits.
      ctx.window.setTimeout(() => {
        ctx.applySimulatorBridgeFieldsOnPage(payload, sanitizedImportSet);
      }, 180);

      return true;
    };

    ctx.bootstrapSimulatorBridgePage = function bootstrapSimulatorBridgePage() {
      const payload = ctx.extractSimulatorBridgePayloadFromLocation();
      if (!payload || typeof payload !== "object") {
        return;
      }
      ctx.clearSimulatorBridgePayloadFromLocation();

      let attempts = 0;
      const maxAttempts = 120;
      const timerId = ctx.window.setInterval(() => {
        attempts += 1;
        try {
          if (ctx.applySimulatorBridgePayloadOnSimulatorPage(payload)) {
            ctx.window.clearInterval(timerId);
            return;
          }
        } catch (error) {
          console.error("[Lab Clear Rate] Simulator bridge apply failed:", error);
          ctx.window.clearInterval(timerId);
          return;
        }
        if (attempts >= maxAttempts) {
          ctx.window.clearInterval(timerId);
          console.error("[Lab Clear Rate] Simulator bridge timeout: import controls not found.");
        }
      }, 150);
    };
  };
})(globalThis);
