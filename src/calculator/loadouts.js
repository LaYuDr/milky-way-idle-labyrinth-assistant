// Adapted from 迷宫胜率计算器 1.6.0, dakonglong, MIT. See docs/THIRD_PARTY.md.
(function (root) {
  "use strict";
  root.MwiLabyrinthCalculatorModules ||= {};
  root.MwiLabyrinthCalculatorModules["loadouts"] = function (ctx) {
    ctx.toPascalCase = function toPascalCase(text) {
      return String(text || "")
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("");
    };

    ctx.getLabyrinthRoomLoadoutSettingKey = function getLabyrinthRoomLoadoutSettingKey(room) {
      if (!room) {
        return "";
      }
      if (room.roomType === ctx.LABYRINTH_SKILLING_ROOM_TYPE && room.skillHrid) {
        const suffix = ctx.toPascalCase(ctx.skillHridToSkillId(room.skillHrid));
        return suffix ? `labyrinthLoadout${suffix}` : "";
      }
      if (room.roomType === ctx.LABYRINTH_COMBAT_ROOM_TYPE && room.monsterHrid) {
        const monsterTail = String(room.monsterHrid).split("/").pop() || "";
        const suffix = ctx.toPascalCase(monsterTail);
        return suffix ? `labyrinthLoadout${suffix}` : "";
      }
      return "";
    };

    ctx.getLoadoutById = function getLoadoutById(loadoutDict, loadoutId) {
      if (!loadoutDict || !Number.isFinite(Number(loadoutId))) {
        return null;
      }
      const numericId = Number(loadoutId);
      if (loadoutDict[numericId]) {
        return loadoutDict[numericId];
      }
      if (loadoutDict[String(numericId)]) {
        return loadoutDict[String(numericId)];
      }
      for (const value of Object.values(loadoutDict)) {
        if (Number(value?.id) === numericId) {
          return value;
        }
      }
      return null;
    };

    ctx.getLabyrinthRoomLoadout = function getLabyrinthRoomLoadout(state, room) {
      const settingKey = ctx.getLabyrinthRoomLoadoutSettingKey(room);
      const loadoutId = Number(state?.characterSetting?.[settingKey] || 0);
      const loadout = ctx.getLoadoutById(state?.characterLoadoutDict, loadoutId);
      return {
        settingKey,
        loadoutId,
        loadout
      };
    };

    ctx.isCombatLoadout = function isCombatLoadout(loadout) {
      return Boolean(loadout && loadout.actionTypeHrid === "/action_types/combat");
    };

    ctx.isUsableCombatRoomLoadout = function isUsableCombatRoomLoadout(loadout) {
      return Boolean(loadout && (loadout.actionTypeHrid === "/action_types/combat" || loadout.actionTypeHrid === ""));
    };

    ctx.getSupportedCombatEquipmentLocationHrids = function getSupportedCombatEquipmentLocationHrids() {
      const locations = [];
      for (const equipmentType of ctx.SIMULATOR_SUPPORTED_EQUIPMENT_TYPES || []) {
        const raw = String(equipmentType || "");
        if (raw.startsWith("/equipment_types/")) {
          locations.push(raw.replace("/equipment_types/", "/item_locations/"));
        }
      }
      return locations;
    };

    ctx.getCurrentEquippedCombatItems = function getCurrentEquippedCombatItems(state) {
      const locations = ctx.getSupportedCombatEquipmentLocationHrids();
      const locationSet = new Set(locations);
      const items = [];
      const seenLocations = new Set();

      if (state?.characterItemByLocationMap) {
        for (const locationHrid of locations) {
          const entry = ctx.getCurrentEquippedItemForLocation(state, locationHrid);
          if (!entry?.itemHrid) {
            continue;
          }
          seenLocations.add(locationHrid);
          items.push({
            ...entry,
            locationHrid
          });
        }
        return items;
      }

      const itemMap = state?.characterItemMap;
      const rawItems = ctx.isMapObject(itemMap)
        ? itemMap.values()
        : itemMap && typeof itemMap === "object"
          ? Object.values(itemMap)
          : [];
      for (const item of rawItems) {
        const locationHrid = String(item?.itemLocationHrid || "");
        if (!locationHrid || !locationSet.has(locationHrid) || seenLocations.has(locationHrid)) {
          continue;
        }
        if (!item?.itemHrid || (Number.isFinite(Number(item.count)) && Number(item.count) <= 0)) {
          continue;
        }
        seenLocations.add(locationHrid);
        items.push({
          locationHrid,
          itemHrid: String(item.itemHrid || ""),
          enhancementLevel: Math.max(0, ctx.finiteNumber(item.enhancementLevel, 0)),
          fromCurrentEquipment: true
        });
      }
      return items;
    };

    ctx.buildCurrentEquippedAbilityMap = function buildCurrentEquippedAbilityMap(state) {
      const abilityMap = {};
      for (const [key, ability] of ctx.getContainerEntries(state?.characterAbilityMap)) {
        const slot = Number(ability?.slotNumber);
        if (!Number.isInteger(slot) || slot < 1 || slot > ctx.COMBAT_SLOT_COUNT) {
          continue;
        }
        const abilityHrid = String(ability?.abilityHrid || key || "");
        if (!abilityHrid) {
          continue;
        }
        abilityMap[slot] = abilityHrid;
      }
      return abilityMap;
    };

    ctx.hasCurrentCombatSetup = function hasCurrentCombatSetup(state) {
      const locationMap = state?.characterItemByLocationMap;
      if (ctx.isMapObject(locationMap)) {
        return true;
      }
      if (locationMap && typeof locationMap === "object" && Object.keys(locationMap).length > 0) {
        return true;
      }
      if (ctx.getCurrentEquippedCombatItems(state).length > 0) {
        return true;
      }
      return Object.keys(ctx.buildCurrentEquippedAbilityMap(state)).length > 0;
    };

    ctx.listCombatLoadouts = function listCombatLoadouts(state) {
      const loadouts = [];
      for (const value of Object.values(state?.characterLoadoutDict || {})) {
        if (ctx.isCombatLoadout(value)) {
          loadouts.push(value);
        }
      }
      loadouts.sort((a, b) => Number(a?.id || 0) - Number(b?.id || 0));
      return loadouts;
    };

    ctx.listUsableCombatRoomLoadouts = function listUsableCombatRoomLoadouts(state) {
      const combatLoadouts = ctx.listCombatLoadouts(state);
      if (combatLoadouts.length > 0) {
        return combatLoadouts;
      }
      const genericLoadouts = [];
      for (const value of Object.values(state?.characterLoadoutDict || {})) {
        if (ctx.isUsableCombatRoomLoadout(value)) {
          genericLoadouts.push(value);
        }
      }
      genericLoadouts.sort((a, b) => Number(a?.id || 0) - Number(b?.id || 0));
      return genericLoadouts;
    };

    ctx.getMostUsedCombatLoadoutIdOnCurrentLabyrinth = function getMostUsedCombatLoadoutIdOnCurrentLabyrinth(state) {
      const roomData = state?.characterLabyrinth?.roomData;
      if (!Array.isArray(roomData) || roomData.length === 0) {
        return 0;
      }
      const countByLoadoutId = new Map();
      for (const row of roomData) {
        if (!Array.isArray(row)) {
          continue;
        }
        for (const room of row) {
          if (!room || room.roomType !== ctx.LABYRINTH_COMBAT_ROOM_TYPE) {
            continue;
          }
          const key = ctx.getLabyrinthRoomLoadoutSettingKey(room);
          const id = Number(state?.characterSetting?.[key] || 0);
          if (!Number.isFinite(id) || id <= 0) {
            continue;
          }
          const loadout = ctx.getLoadoutById(state?.characterLoadoutDict, id);
          if (!ctx.isUsableCombatRoomLoadout(loadout)) {
            continue;
          }
          countByLoadoutId.set(id, (countByLoadoutId.get(id) || 0) + 1);
        }
      }
      let bestId = 0;
      let bestCount = 0;
      for (const [id, count] of countByLoadoutId.entries()) {
        if (count > bestCount || (count === bestCount && id < bestId)) {
          bestId = id;
          bestCount = count;
        }
      }
      return bestId;
    };

    ctx.resolveCombatRoomLoadout = function resolveCombatRoomLoadout(state, room) {
      const direct = ctx.getLabyrinthRoomLoadout(state, room);
      const selectedLoadoutId = Number(direct.loadoutId || 0);
      if (ctx.isUsableCombatRoomLoadout(direct.loadout) && selectedLoadoutId > 0) {
        return {
          ...direct,
          source: "room",
          selectedLoadoutId
        };
      }

      // MWI enters rooms configured with "No Loadout" (0) using the character's currently equipped setup.
      if (ctx.hasCurrentCombatSetup(state)) {
        return {
          ...direct,
          loadoutId: 0,
          loadout: null,
          source: "current",
          selectedLoadoutId
        };
      }

      const fallbackIdOnFloor = ctx.getMostUsedCombatLoadoutIdOnCurrentLabyrinth(state);
      if (fallbackIdOnFloor > 0) {
        const fallbackLoadout = ctx.getLoadoutById(state?.characterLoadoutDict, fallbackIdOnFloor);
        if (ctx.isUsableCombatRoomLoadout(fallbackLoadout)) {
          return {
            ...direct,
            loadoutId: fallbackIdOnFloor,
            loadout: fallbackLoadout,
            source: "fallback-floor",
            selectedLoadoutId
          };
        }
      }

      const combatLoadouts = ctx.listUsableCombatRoomLoadouts(state);
      if (combatLoadouts.length > 0) {
        const fallbackLoadout = combatLoadouts[0];
        return {
          ...direct,
          loadoutId: Number(fallbackLoadout.id || 0),
          loadout: fallbackLoadout,
          source: "fallback-any",
          selectedLoadoutId
        };
      }

      return {
        ...direct,
        loadout: null,
        source: "missing",
        selectedLoadoutId
      };
    };

    ctx.getItemDetailByHrid = function getItemDetailByHrid(state, initClientData, itemHrid) {
      if (!itemHrid) {
        return null;
      }
      const fromState = state?.itemDetailDict?.[itemHrid];
      if (fromState) {
        return fromState;
      }
      return initClientData?.itemDetailMap?.[itemHrid] || null;
    };

    ctx.getAbilityDetailByHrid = function getAbilityDetailByHrid(state, initClientData, abilityHrid) {
      if (!abilityHrid) {
        return null;
      }
      const fromState = ctx.getContainerValue(state?.abilityDetailDict, abilityHrid);
      if (fromState) {
        return fromState;
      }
      return ctx.getContainerValue(initClientData?.abilityDetailMap, abilityHrid) || null;
    };

    ctx.getAbilityLevelFromState = function getAbilityLevelFromState(state, abilityHrid) {
      if (!abilityHrid) {
        return 1;
      }
      const ability = ctx.getContainerValue(state?.characterAbilityMap, abilityHrid);
      return ctx.positiveNumber(ability?.level, 1);
    };

    ctx.getCombatTriggerList = function getCombatTriggerList(triggerMap, triggerKey) {
      const value = ctx.getContainerValue(triggerMap, triggerKey);
      if (!Array.isArray(value)) {
        return null;
      }
      return ctx.normalizeTriggerList(value);
    };

    ctx.hasContainerKey = function hasContainerKey(container, key) {
      const normalizedKey = String(key || "");
      if (!normalizedKey) {
        return false;
      }
      if (ctx.isMapObject(container)) {
        return container.has(normalizedKey);
      }
      if (container && typeof container === "object") {
        return Object.prototype.hasOwnProperty.call(container, normalizedKey);
      }
      return false;
    };

    ctx.hasAnyContainerEntries = function hasAnyContainerEntries(container) {
      if (ctx.isMapObject(container)) {
        return container.size > 0;
      }
      if (container && typeof container === "object") {
        return Object.keys(container).length > 0;
      }
      return false;
    };

    ctx.getDefaultAbilityTriggers = function getDefaultAbilityTriggers(state, initClientData, abilityHrid) {
      const detail = ctx.getAbilityDetailByHrid(state, initClientData, abilityHrid);
      return ctx.normalizeTriggerList(detail?.defaultCombatTriggers);
    };

    ctx.buildHouseRoomLevelMap = function buildHouseRoomLevelMap(state) {
      const result = {};
      for (const [roomHrid, room] of ctx.getContainerEntries(state?.characterHouseRoomDict)) {
        if (!roomHrid) {
          continue;
        }
        result[roomHrid] = Math.max(0, Math.floor(ctx.finiteNumber(room?.level, 0)));
      }
      return result;
    };

    ctx.buildAchievementCompletionMap = function buildAchievementCompletionMap(state) {
      const result = {};
      for (const [achievementHrid, info] of ctx.getContainerEntries(state?.characterAchievementMap)) {
        if (!achievementHrid) {
          continue;
        }
        const completed = info === true || info?.isCompleted === true;
        if (completed) {
          result[achievementHrid] = true;
        }
      }
      return result;
    };

    ctx.isTaskBadgeItemHrid = function isTaskBadgeItemHrid(itemHrid) {
      const tail =
        String(itemHrid || "")
          .split("/")
          .pop() || "";
      return tail.includes("task_badge");
    };

    ctx.isSupportedCombatEquipmentType = function isSupportedCombatEquipmentType(equipmentType) {
      const typeHrid = String(equipmentType || "");
      return typeHrid ? ctx.SIMULATOR_SUPPORTED_EQUIPMENT_TYPES.has(typeHrid) : false;
    };

    ctx.shouldIncludeCombatEquipment = function shouldIncludeCombatEquipment(itemHrid, equipmentType) {
      if (!ctx.isSupportedCombatEquipmentType(equipmentType)) {
        return false;
      }
      if (ctx.isTaskBadgeItemHrid(itemHrid)) {
        return false;
      }
      return true;
    };

    ctx.buildCurrentCombatEquipmentDto = function buildCurrentCombatEquipmentDto(state, initClientData) {
      const equipment = {};
      for (const entry of ctx.getCurrentEquippedCombatItems(state)) {
        if (!entry?.itemHrid) {
          continue;
        }
        const itemDetail = ctx.getItemDetailByHrid(state, initClientData, entry.itemHrid);
        const equipmentType = itemDetail?.equipmentDetail?.type;
        if (!ctx.shouldIncludeCombatEquipment(entry.itemHrid, equipmentType)) {
          continue;
        }
        equipment[equipmentType] = {
          hrid: entry.itemHrid,
          enhancementLevel: Math.max(0, Math.floor(ctx.finiteNumber(entry.enhancementLevel, 0)))
        };
      }
      return equipment;
    };

    ctx.buildCombatLoadoutEquipmentDto = function buildCombatLoadoutEquipmentDto(
      state,
      initClientData,
      loadout,
      maxEnhancementByItem
    ) {
      const equipment = {};
      for (const rawRef of Object.values(loadout?.wearableMap || {})) {
        const entry = ctx.parseWearableReference(rawRef);
        if (!entry?.itemHrid) {
          continue;
        }
        const itemDetail = ctx.getItemDetailByHrid(state, initClientData, entry.itemHrid);
        const equipmentType = itemDetail?.equipmentDetail?.type;
        if (!ctx.shouldIncludeCombatEquipment(entry.itemHrid, equipmentType)) {
          continue;
        }
        const enhancementLevel = Math.max(
          0,
          Math.floor(ctx.resolveWearableEnhancement(entry, loadout, maxEnhancementByItem))
        );
        equipment[equipmentType] = {
          hrid: entry.itemHrid,
          enhancementLevel
        };
      }
      return equipment;
    };

    ctx.buildCombatLoadoutAbilityDtos = function buildCombatLoadoutAbilityDtos(
      state,
      initClientData,
      loadout,
      intelligenceLevel
    ) {
      const abilityDtos = [];
      const requirementList = Array.isArray(state?.abilitySlotsLevelRequirementList)
        ? state.abilitySlotsLevelRequirementList
        : [0, 1, 1, 20, 50, 90];
      const useCurrentEquippedAbilities =
        !loadout || (loadout.actionTypeHrid === "" && !ctx.hasAnyContainerEntries(loadout.abilityMap));
      const loadoutAbilityMap = useCurrentEquippedAbilities
        ? ctx.buildCurrentEquippedAbilityMap(state)
        : loadout?.abilityMap || {};
      const loadoutTriggerMap = useCurrentEquippedAbilities ? null : loadout?.abilityCombatTriggersMap;
      const globalTriggerMap = state?.abilityCombatTriggersDict;
      const loadoutHasTriggerConfig = ctx.hasAnyContainerEntries(loadoutTriggerMap);

      for (let slot = 1; slot <= ctx.COMBAT_SLOT_COUNT; slot += 1) {
        const abilityHrid = String(loadoutAbilityMap[slot] || loadoutAbilityMap[String(slot)] || "");
        if (!abilityHrid) {
          abilityDtos.push(null);
          continue;
        }

        const minIntelligence = Math.max(0, Math.floor(ctx.finiteNumber(requirementList[slot], 0)));
        if (intelligenceLevel < minIntelligence) {
          abilityDtos.push(null);
          continue;
        }

        let abilityTriggers = null;
        if (loadoutHasTriggerConfig) {
          if (ctx.hasContainerKey(loadoutTriggerMap, abilityHrid)) {
            const explicitLoadoutTriggers = ctx.getCombatTriggerList(loadoutTriggerMap, abilityHrid);
            abilityTriggers = Array.isArray(explicitLoadoutTriggers) ? explicitLoadoutTriggers : [];
          } else {
            // When a loadout has its own trigger config, missing ability key means intentionally empty.
            abilityTriggers = [];
          }
        } else {
          abilityTriggers =
            ctx.getCombatTriggerList(globalTriggerMap, abilityHrid) ||
            ctx.getDefaultAbilityTriggers(state, initClientData, abilityHrid);
        }

        abilityDtos.push({
          hrid: abilityHrid,
          level: ctx.getAbilityLevelFromState(state, abilityHrid),
          triggers: abilityTriggers
        });
      }
      return abilityDtos;
    };

    ctx.buildCombatPlayerDtoForRoom = function buildCombatPlayerDtoForRoom(
      state,
      initClientData,
      room,
      maxEnhancementByItem,
      options = {}
    ) {
      const loadoutInfo = ctx.resolveCombatRoomLoadout(state, room);
      const loadout = loadoutInfo.loadout;
      const useCurrentSetup = loadoutInfo.source === "current";
      if (!useCurrentSetup && !ctx.isUsableCombatRoomLoadout(loadout)) {
        return {
          playerDto: null,
          loadoutInfo
        };
      }

      const levels = ctx.getCombatSkillLevelsFromState(state);
      const intelligenceLevel = ctx.positiveNumber(levels.intelligence, 1);
      const equipment = useCurrentSetup
        ? ctx.buildCurrentCombatEquipmentDto(state, initClientData)
        : ctx.buildCombatLoadoutEquipmentDto(state, initClientData, loadout, maxEnhancementByItem);
      const abilities = ctx.buildCombatLoadoutAbilityDtos(
        state,
        initClientData,
        useCurrentSetup ? null : loadout,
        intelligenceLevel
      );
      const houseRooms = ctx.buildHouseRoomLevelMap(state);
      const achievements = ctx.buildAchievementCompletionMap(state);

      const playerDto = {
        hrid: "player1",
        staminaLevel: ctx.positiveNumber(levels.stamina, 1),
        intelligenceLevel,
        attackLevel: ctx.positiveNumber(levels.attack, 1),
        meleeLevel: ctx.positiveNumber(levels.melee, 1),
        defenseLevel: ctx.positiveNumber(levels.defense, 1),
        rangedLevel: ctx.positiveNumber(levels.ranged, 1),
        magicLevel: ctx.positiveNumber(levels.magic, 1),
        equipment,
        food: [],
        drinks: [],
        abilities,
        houseRooms,
        achievements,
        labyrinthUpgrades: ctx.buildSimulatorLabyrinthUpgrades(ctx.resolveLabyrinthUpgradeLevels(options)),
        guildBuffs: ctx.getActiveGuildCombatShrineLevels(state),
        debuffOnLevelGap: 0
      };

      return {
        playerDto,
        loadoutInfo
      };
    };

    ctx.buildCombatInputSnapshot = function buildCombatInputSnapshot(playerData, room) {
      const playerDto = playerData?.playerDto;
      const loadoutInfo = playerData?.loadoutInfo || {};
      const loadout = loadoutInfo.loadout || null;
      if (!playerDto) {
        return null;
      }

      const equipment = [];
      for (const [slot, detail] of Object.entries(playerDto.equipment || {})) {
        if (!detail?.hrid) {
          continue;
        }
        equipment.push({
          slot: String(slot),
          hrid: String(detail.hrid),
          enhancementLevel: Math.max(0, Math.floor(ctx.finiteNumber(detail.enhancementLevel, 0)))
        });
      }
      equipment.sort((a, b) => a.slot.localeCompare(b.slot));

      const abilitySlots = [];
      const abilityList = Array.isArray(playerDto.abilities) ? playerDto.abilities : [];
      for (let i = 0; i < abilityList.length; i += 1) {
        const ability = abilityList[i];
        if (!ability?.hrid) {
          continue;
        }
        abilitySlots.push({
          slot: i + 1,
          hrid: String(ability.hrid),
          level: Math.max(1, Math.floor(ctx.finiteNumber(ability.level, 1)))
        });
      }

      return {
        roomKey: "",
        roomMonsterHrid: String(room?.monsterHrid || ""),
        roomRecommendedLevel: Math.max(0, Math.floor(ctx.finiteNumber(room?.recommendedLevel, 0))),
        loadoutId: Number(loadoutInfo.loadoutId || 0),
        loadoutName: String(loadout?.name || ""),
        loadoutMode: loadout ? (loadout.useExactEnhancement ? "exact" : "highest") : "current",
        loadoutSource: String(loadoutInfo.source || "room"),
        selectedLoadoutId: Number(loadoutInfo.selectedLoadoutId || loadoutInfo.loadoutId || 0),
        loadoutSettingKey: String(loadoutInfo.settingKey || ""),
        levels: {
          stamina: ctx.positiveNumber(playerDto.staminaLevel, 1),
          intelligence: ctx.positiveNumber(playerDto.intelligenceLevel, 1),
          attack: ctx.positiveNumber(playerDto.attackLevel, 1),
          melee: ctx.positiveNumber(playerDto.meleeLevel, 1),
          defense: ctx.positiveNumber(playerDto.defenseLevel, 1),
          ranged: ctx.positiveNumber(playerDto.rangedLevel, 1),
          magic: ctx.positiveNumber(playerDto.magicLevel, 1)
        },
        equipment,
        abilitySlots,
        houseRoomCount: Object.keys(playerDto.houseRooms || {}).length,
        achievementCount: Object.keys(playerDto.achievements || {}).length
      };
    };

    ctx.parseWearableReference = function parseWearableReference(rawValue) {
      if (!rawValue) {
        return null;
      }
      const parts = String(rawValue).split("::");
      if (parts.length < 4) {
        return null;
      }
      return {
        itemHrid: parts[2] || "",
        enhancementLevel: ctx.finiteNumber(Number(parts[3]), 0)
      };
    };

    ctx.buildMaxEnhancementByItem = function buildMaxEnhancementByItem(state) {
      const maxByItem = new Map();
      const itemMap = state?.characterItemMap;

      function consume(item) {
        if (!item || !item.itemHrid) {
          return;
        }
        if (!Number.isFinite(Number(item.count)) || Number(item.count) <= 0) {
          return;
        }
        const itemHrid = item.itemHrid;
        const enhancement = Math.max(0, ctx.finiteNumber(item.enhancementLevel, 0));
        const existing = maxByItem.get(itemHrid);
        if (!Number.isFinite(existing) || enhancement > existing) {
          maxByItem.set(itemHrid, enhancement);
        }
      }

      if (ctx.isMapObject(itemMap)) {
        for (const item of itemMap.values()) {
          consume(item);
        }
      } else if (itemMap && typeof itemMap === "object") {
        for (const item of Object.values(itemMap)) {
          consume(item);
        }
      }

      return maxByItem;
    };

    ctx.resolveWearableEnhancement = function resolveWearableEnhancement(entry, loadout, maxEnhancementByItem) {
      if (!entry) {
        return 0;
      }
      if (entry.fromCurrentEquipment) {
        return Math.max(0, ctx.finiteNumber(entry.enhancementLevel, 0));
      }
      if (loadout?.useExactEnhancement) {
        return Math.max(0, ctx.finiteNumber(entry.enhancementLevel, 0));
      }
      const highest = maxEnhancementByItem.get(entry.itemHrid);
      if (Number.isFinite(highest)) {
        return Math.max(0, highest);
      }
      return Math.max(0, ctx.finiteNumber(entry.enhancementLevel, 0));
    };

    ctx.getCurrentEquippedItemForLocation = function getCurrentEquippedItemForLocation(state, itemLocationHrid) {
      const location = String(itemLocationHrid || "");
      if (!location) {
        return null;
      }
      const locationMap = state?.characterItemByLocationMap;
      let item = null;
      if (ctx.isMapObject(locationMap)) {
        item = locationMap.get(location) || null;
      } else if (locationMap && typeof locationMap === "object") {
        item = locationMap[location] || null;
      }
      if (!item || !item.itemHrid) {
        return null;
      }
      if (Number.isFinite(Number(item.count)) && Number(item.count) <= 0) {
        return null;
      }
      return {
        itemHrid: String(item.itemHrid || ""),
        enhancementLevel: Math.max(0, ctx.finiteNumber(item.enhancementLevel, 0)),
        fromCurrentEquipment: true
      };
    };

    ctx.getEnhancementBonusMultiplier = function getEnhancementBonusMultiplier(initClientData, enhancementLevel) {
      const level = Math.max(0, Math.floor(ctx.finiteNumber(enhancementLevel, 0)));
      const table = initClientData?.enhancementLevelTotalBonusMultiplierTable;
      const fromTable = table && Object.prototype.hasOwnProperty.call(table, level) ? Number(table[level]) : Number.NaN;
      if (Number.isFinite(fromTable)) {
        return fromTable;
      }
      return level;
    };

    ctx.addFlatBuff = function addFlatBuff(buffs, typeHrid, amount) {
      const value = ctx.finiteNumber(amount, 0);
      if (!typeHrid || !Number.isFinite(value) || value === 0) {
        return;
      }
      buffs.push({
        typeHrid,
        flatBoost: value,
        flatBoostLevelBonus: 0,
        ratioBoost: 0,
        ratioBoostLevelBonus: 0
      });
    };

    ctx.addRatioBuff = function addRatioBuff(buffs, typeHrid, amount) {
      const value = ctx.finiteNumber(amount, 0);
      if (!typeHrid || !Number.isFinite(value) || value === 0) {
        return;
      }
      buffs.push({
        typeHrid,
        flatBoost: 0,
        flatBoostLevelBonus: 0,
        ratioBoost: value,
        ratioBoostLevelBonus: 0
      });
    };

    ctx.getToolSlotForActionType = function getToolSlotForActionType(actionTypeHrid) {
      if (!actionTypeHrid || typeof actionTypeHrid !== "string") {
        return "";
      }
      if (!actionTypeHrid.startsWith("/action_types/")) {
        return "";
      }
      const skillId = actionTypeHrid.split("/").pop() || "";
      if (!skillId || skillId === "combat" || skillId === "special" || skillId === "labyrinth") {
        return "";
      }
      return `/item_locations/${skillId}_tool`;
    };

    ctx.shouldUseWearableSlotForSkillingAction = function shouldUseWearableSlotForSkillingAction(
      slotKey,
      actionTypeHrid
    ) {
      if (!slotKey) {
        return false;
      }
      if (!slotKey.endsWith("_tool")) {
        return true;
      }
      const requiredToolSlot = ctx.getToolSlotForActionType(actionTypeHrid);
      return requiredToolSlot ? slotKey === requiredToolSlot : false;
    };

    ctx.addNoncombatStatsForWearableEntry = function addNoncombatStatsForWearableEntry(
      totals,
      state,
      initClientData,
      loadout,
      maxEnhancementByItem,
      entry
    ) {
      if (!totals || !entry || !entry.itemHrid) {
        return;
      }

      const itemDetail = ctx.getItemDetailByHrid(state, initClientData, entry.itemHrid);
      const equipmentDetail = itemDetail?.equipmentDetail;
      if (!equipmentDetail) {
        return;
      }

      const enhancementLevel = ctx.resolveWearableEnhancement(entry, loadout, maxEnhancementByItem);
      const enhancementMultiplier = ctx.getEnhancementBonusMultiplier(initClientData, enhancementLevel);
      const baseStats = equipmentDetail.noncombatStats || {};
      const enhancementStats = equipmentDetail.noncombatEnhancementBonuses || {};

      for (const [key, value] of Object.entries(baseStats)) {
        if (!Number.isFinite(Number(value))) {
          continue;
        }
        totals[key] = ctx.finiteNumber(totals[key], 0) + Number(value);
      }
      for (const [key, value] of Object.entries(enhancementStats)) {
        if (!Number.isFinite(Number(value))) {
          continue;
        }
        totals[key] = ctx.finiteNumber(totals[key], 0) + Number(value) * enhancementMultiplier;
      }
    };

    ctx.buildLoadoutNoncombatStatTotals = function buildLoadoutNoncombatStatTotals(
      state,
      initClientData,
      loadout,
      maxEnhancementByItem,
      actionTypeHrid
    ) {
      const totals = {};
      if (!loadout) {
        return totals;
      }

      const requiredToolSlot = ctx.getToolSlotForActionType(actionTypeHrid);
      let sawRequiredToolSlot = false;
      for (const [slotKey, rawRef] of Object.entries(loadout.wearableMap || {})) {
        if (!ctx.shouldUseWearableSlotForSkillingAction(slotKey, actionTypeHrid)) {
          continue;
        }
        if (requiredToolSlot && slotKey === requiredToolSlot) {
          sawRequiredToolSlot = true;
        }
        let entry = ctx.parseWearableReference(rawRef);
        if (!entry && requiredToolSlot && slotKey === requiredToolSlot) {
          entry = ctx.getCurrentEquippedItemForLocation(state, requiredToolSlot);
        }
        ctx.addNoncombatStatsForWearableEntry(totals, state, initClientData, loadout, maxEnhancementByItem, entry);
      }
      if (requiredToolSlot && !sawRequiredToolSlot) {
        ctx.addNoncombatStatsForWearableEntry(
          totals,
          state,
          initClientData,
          loadout,
          maxEnhancementByItem,
          ctx.getCurrentEquippedItemForLocation(state, requiredToolSlot)
        );
      }

      return totals;
    };

    ctx.buildSkillingEquipmentBuffsFromTotals = function buildSkillingEquipmentBuffsFromTotals(skillId, totals) {
      const buffs = [];
      if (!skillId || !totals) {
        return buffs;
      }

      const actionSpeed = ctx.finiteNumber(totals[`${skillId}Speed`], 0) + ctx.finiteNumber(totals.skillingSpeed, 0);
      const efficiency =
        ctx.finiteNumber(totals[`${skillId}Efficiency`], 0) + ctx.finiteNumber(totals.skillingEfficiency, 0);
      const gathering = ctx.finiteNumber(totals.gatheringQuantity, 0);
      const success = ctx.finiteNumber(totals[`${skillId}Success`], 0);
      const skillingExperience = ctx.finiteNumber(totals.skillingExperience, 0);
      const skillExperience = ctx.finiteNumber(totals[`${skillId}Experience`], 0);
      const wisdom = ctx.finiteNumber(totals.wisdom, 0);
      // Runtime state folds equipment skilling/skill EXP stats into generic EXP (wisdom/experience).
      // Keep reconstruction aligned with actual in-game actionType buff buckets.
      const genericExperience = wisdom + skillingExperience + skillExperience;

      ctx.addFlatBuff(buffs, "/buff_types/action_speed", actionSpeed);
      ctx.addFlatBuff(buffs, "/buff_types/efficiency", efficiency);
      ctx.addFlatBuff(buffs, "/buff_types/gathering", gathering);
      ctx.addRatioBuff(buffs, `/buff_types/${skillId}_success`, success);
      ctx.addRatioBuff(buffs, "/buff_types/wisdom", genericExperience);

      return buffs;
    };

    ctx.getSkillingRoomLoadoutMetrics = function getSkillingRoomLoadoutMetrics(
      state,
      initClientData,
      room,
      skillId,
      actionTypeHrid,
      maxEnhancementByItem,
      fallbackMetrics
    ) {
      const loadoutInfo = ctx.getLabyrinthRoomLoadout(state, room);
      const fallback = ctx.cloneSkillingMetrics(fallbackMetrics);
      const loadout = loadoutInfo.loadout;
      if (!loadout) {
        return {
          metrics: fallback,
          loadoutInfo,
          mode: "current"
        };
      }

      const noncombatTotals = ctx.buildLoadoutNoncombatStatTotals(
        state,
        initClientData,
        loadout,
        maxEnhancementByItem,
        actionTypeHrid
      );
      const equipmentBuffs = ctx.buildSkillingEquipmentBuffsFromTotals(skillId, noncombatTotals);
      const metrics = ctx.createEmptySkillingMetrics();
      ctx.addSkillingMetrics(metrics, ctx.getSkillingBuffMetrics(skillId, equipmentBuffs));
      const mode =
        loadout.actionTypeHrid === actionTypeHrid ? (loadout.useExactEnhancement ? "exact" : "highest") : "configured";

      return {
        metrics,
        loadoutInfo,
        mode
      };
    };

    ctx.computeSkillingExperienceBonusForRoom = function computeSkillingExperienceBonusForRoom(
      state,
      skillId,
      actionTypeHrid,
      roomLoadoutMetrics,
      crateMetrics,
      includePersonalBuffs,
      labyrinthExperienceBonus = 0
    ) {
      const { globalMetrics: globalWithoutPersonal } = ctx.getSkillingGlobalMetrics(state, skillId, actionTypeHrid, {
        includePersonalBuffs: false
      });
      let genericBonus = 0;
      let skillingBonus = 0;
      let skillBonus = 0;

      const appendExperienceBuckets = (metrics) => {
        genericBonus += ctx.finiteNumber(metrics?.genericExperienceBonus, 0);
        skillingBonus += ctx.finiteNumber(metrics?.skillingExperienceBonus, 0);
        skillBonus += ctx.finiteNumber(metrics?.skillExperienceBonus, 0);
      };

      appendExperienceBuckets(globalWithoutPersonal);
      appendExperienceBuckets(roomLoadoutMetrics);
      appendExperienceBuckets(crateMetrics);
      genericBonus += ctx.finiteNumber(labyrinthExperienceBonus, 0);

      if (includePersonalBuffs) {
        const personalMetrics = ctx.getSkillingActionMetricsFromState(
          state,
          skillId,
          actionTypeHrid,
          "personalActionTypeBuffsDict"
        );
        appendExperienceBuckets(personalMetrics);
      }

      const genericMultiplier = Math.max(0, 1 + genericBonus);
      const skillingMultiplier = Math.max(0, 1 + skillingBonus);
      const skillMultiplier = Math.max(0, 1 + skillBonus);
      const multiplier = genericMultiplier * skillingMultiplier * skillMultiplier;

      return {
        genericBonus,
        skillingBonus,
        skillBonus,
        multiplier,
        totalBonus: multiplier - 1
      };
    };
  };
})(globalThis);
