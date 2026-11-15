// Adapted from 迷宫胜率计算器 1.6.0, dakonglong, MIT. See docs/THIRD_PARTY.md.
(function (root) {
  "use strict";
  root.MwiLabyrinthCalculatorModules ||= {};
  root.MwiLabyrinthCalculatorModules["game-data"] = function (ctx) {
    ctx.clamp01 = function clamp01(value) {
      if (!Number.isFinite(value)) {
        return 0;
      }
      if (value < 0) {
        return 0;
      }
      if (value > 1) {
        return 1;
      }
      return value;
    };

    ctx.finiteNumber = function finiteNumber(value, fallback = 0) {
      return Number.isFinite(value) ? Number(value) : fallback;
    };

    ctx.positiveNumber = function positiveNumber(value, fallback = 0) {
      const n = ctx.finiteNumber(value, fallback);
      return n > 0 ? n : fallback;
    };

    ctx.createEmptyLabyrinthUpgradeLevels = function createEmptyLabyrinthUpgradeLevels() {
      const result = {};
      for (const key of ctx.LABYRINTH_UPGRADE_KEYS) {
        result[key] = 0;
      }
      return result;
    };

    ctx.normalizeLabyrinthUpgradeLevels = function normalizeLabyrinthUpgradeLevels(raw) {
      const result = ctx.createEmptyLabyrinthUpgradeLevels();
      if (!raw || typeof raw !== "object") {
        return result;
      }
      for (const key of ctx.LABYRINTH_UPGRADE_KEYS) {
        result[key] = Math.max(0, Math.floor(ctx.finiteNumber(raw[key], 0)));
      }
      return result;
    };

    ctx.mergeLabyrinthUpgradeLevels = function mergeLabyrinthUpgradeLevels(base, override) {
      const result = ctx.normalizeLabyrinthUpgradeLevels(base);
      if (!override || typeof override !== "object") {
        return result;
      }
      for (const key of ctx.LABYRINTH_UPGRADE_KEYS) {
        if (Object.prototype.hasOwnProperty.call(override, key)) {
          result[key] = Math.max(0, Math.floor(ctx.finiteNumber(override[key], result[key])));
        }
      }
      return result;
    };

    ctx.loadStoredLabyrinthUpgradeLevels = function loadStoredLabyrinthUpgradeLevels() {
      try {
        return ctx.normalizeLabyrinthUpgradeLevels(
          JSON.parse(ctx.storage.getItem(ctx.LABYRINTH_UPGRADE_LEVELS_STORAGE_KEY) || "null")
        );
      } catch (_error) {
        return ctx.createEmptyLabyrinthUpgradeLevels();
      }
    };

    ctx.saveLabyrinthUpgradeLevels = function saveLabyrinthUpgradeLevels(levels) {
      const normalized = ctx.normalizeLabyrinthUpgradeLevels(levels);
      try {
        ctx.storage.setItem(ctx.LABYRINTH_UPGRADE_LEVELS_STORAGE_KEY, JSON.stringify(normalized));
      } catch (_error) {
        // Ignore storage errors.
      }
      ctx.latestLabyrinthUpgradeLevels = normalized;
      return normalized;
    };

    ctx.readLabyrinthUpgradeLevelsFromState = function readLabyrinthUpgradeLevelsFromState(state) {
      const info = state?.characterInfo;
      if (!info || typeof info !== "object") {
        return null;
      }
      const result = {};
      let matched = 0;
      const assign = (key, value) => {
        if (!Number.isFinite(Number(value))) {
          return;
        }
        result[key] = Math.max(0, Math.floor(Number(value)));
        matched += 1;
      };
      assign(ctx.LABYRINTH_UPGRADE_KEY_SKILL_ACTION_SPEED, info.labyrinthSkillActionSpeedLevel);
      assign(ctx.LABYRINTH_UPGRADE_KEY_SKILLING_EFFICIENCY, info.labyrinthSkillingEfficiencyLevel);
      assign(ctx.LABYRINTH_UPGRADE_KEY_SKILLING_SUCCESS, info.labyrinthSkillingSuccessLevel);
      assign(ctx.LABYRINTH_UPGRADE_KEY_SKILLING_DOUBLE_PROGRESS, info.labyrinthSkillingDoubleProgressLevel);
      assign(ctx.LABYRINTH_UPGRADE_KEY_COMBAT_DAMAGE, info.labyrinthCombatDamageLevel);
      assign(ctx.LABYRINTH_UPGRADE_KEY_ATTACK_SPEED, info.labyrinthAttackSpeedLevel);
      assign(ctx.LABYRINTH_UPGRADE_KEY_CAST_SPEED, info.labyrinthCastSpeedLevel);
      assign(ctx.LABYRINTH_UPGRADE_KEY_CRITICAL_RATE, info.labyrinthCriticalRateLevel);
      assign(ctx.LABYRINTH_UPGRADE_KEY_LABYRINTH_EXPERIENCE, info.labyrinthExperienceLevel);
      return matched > 0 ? result : null;
    };

    ctx.areLabyrinthUpgradeLevelsEqual = function areLabyrinthUpgradeLevelsEqual(left, right) {
      for (const key of ctx.LABYRINTH_UPGRADE_KEYS) {
        if (
          Math.max(0, Math.floor(ctx.finiteNumber(left?.[key], 0))) !==
          Math.max(0, Math.floor(ctx.finiteNumber(right?.[key], 0)))
        ) {
          return false;
        }
      }
      return true;
    };

    ctx.getLabyrinthUpgradeLevels = function getLabyrinthUpgradeLevels(_forceRefresh = false) {
      if (!ctx.latestLabyrinthUpgradeLevels) {
        ctx.latestLabyrinthUpgradeLevels = ctx.loadStoredLabyrinthUpgradeLevels();
      }
      const fromState = ctx.readLabyrinthUpgradeLevelsFromState(ctx.getGameState());
      const resolved = fromState
        ? ctx.mergeLabyrinthUpgradeLevels(ctx.latestLabyrinthUpgradeLevels, fromState)
        : ctx.latestLabyrinthUpgradeLevels;
      return ctx.areLabyrinthUpgradeLevelsEqual(resolved, ctx.latestLabyrinthUpgradeLevels)
        ? ctx.latestLabyrinthUpgradeLevels
        : ctx.saveLabyrinthUpgradeLevels(resolved);
    };

    ctx.syncVisibleLabyrinthUpgradeLevelsCache = function syncVisibleLabyrinthUpgradeLevelsCache() {
      if (!ctx.latestLabyrinthUpgradeLevels) {
        ctx.latestLabyrinthUpgradeLevels = ctx.loadStoredLabyrinthUpgradeLevels();
      }
      const fromState = ctx.readLabyrinthUpgradeLevelsFromState(ctx.getGameState());
      const resolved = fromState
        ? ctx.mergeLabyrinthUpgradeLevels(ctx.latestLabyrinthUpgradeLevels, fromState)
        : ctx.latestLabyrinthUpgradeLevels;
      if (!ctx.areLabyrinthUpgradeLevelsEqual(resolved, ctx.latestLabyrinthUpgradeLevels)) {
        return ctx.saveLabyrinthUpgradeLevels(resolved);
      }
      ctx.latestLabyrinthUpgradeLevels = ctx.normalizeLabyrinthUpgradeLevels(resolved);
      return ctx.latestLabyrinthUpgradeLevels;
    };

    ctx.getLabyrinthUpgradeLevel = function getLabyrinthUpgradeLevel(levels, upgradeKey) {
      return Math.max(0, Math.floor(ctx.finiteNumber(levels?.[upgradeKey], 0)));
    };

    // Local game client getUpgradeCost: skilling success/double progress use labyrinth tokens.
    // Each next level costs 40 × its level; maxed upgrades have no next purchase.
    ctx.getSkillingUpgradeTokenCost = function getSkillingUpgradeTokenCost(currentLevel) {
      if (
        !Number.isSafeInteger(currentLevel) ||
        currentLevel < 0 ||
        currentLevel >= ctx.LABYRINTH_SKILLING_UPGRADE_MAX_LEVEL
      )
        return null;
      return 40 * (currentLevel + 1);
    };

    ctx.resolveLabyrinthUpgradeLevels = function resolveLabyrinthUpgradeLevels(options = null) {
      if (options?.labyrinthUpgradeLevels && typeof options.labyrinthUpgradeLevels === "object") {
        return ctx.normalizeLabyrinthUpgradeLevels(options.labyrinthUpgradeLevels);
      }
      return ctx.getLabyrinthUpgradeLevels();
    };

    ctx.normalizeChance = function normalizeChance(value) {
      const n = ctx.finiteNumber(value, 0);
      if (n > 1 && n <= 100) {
        return ctx.clamp01(n / 100);
      }
      return ctx.clamp01(n);
    };

    ctx.nowIsoString = function nowIsoString(timestamp = Date.now()) {
      try {
        return new Date(timestamp).toISOString();
      } catch (_error) {
        return "";
      }
    };

    ctx.isLikelyGameState = function isLikelyGameState(state) {
      return Boolean(
        state &&
        typeof state === "object" &&
        (Object.prototype.hasOwnProperty.call(state, "characterLabyrinth") ||
          Object.prototype.hasOwnProperty.call(state, "combatUnit") ||
          Object.prototype.hasOwnProperty.call(state, "gameConn"))
      );
    };

    ctx.findGameStateFromFiber = function findGameStateFromFiber(rootFiber) {
      if (!rootFiber || typeof rootFiber !== "object") {
        return null;
      }
      const queue = [rootFiber];
      const visited = new Set();
      let steps = 0;
      while (queue.length > 0 && steps < 20000) {
        const fiber = queue.shift();
        if (!fiber || typeof fiber !== "object" || visited.has(fiber)) {
          continue;
        }
        visited.add(fiber);
        steps += 1;

        const state = fiber.stateNode?.state;
        if (ctx.isLikelyGameState(state)) {
          return state;
        }

        if (fiber.child) {
          queue.push(fiber.child);
        }
        if (fiber.sibling) {
          queue.push(fiber.sibling);
        }
      }
      return null;
    };

    ctx.getGameState = function getGameState() {
      const gamePage = document.querySelector('[class^="GamePage"]');
      if (gamePage) {
        const reactKey = Object.keys(gamePage).find((key) => key.startsWith("__reactFiber$"));
        if (reactKey) {
          const fiberNode = gamePage[reactKey];
          const directState = fiberNode?.return?.stateNode?.state || null;
          if (ctx.isLikelyGameState(directState)) {
            return directState;
          }
        }
      }

      const rootElement = document.getElementById("root");
      let rootContainer = rootElement?._reactRootContainer || null;
      if (!rootContainer) {
        const fallbackRoot = Array.from(document.querySelectorAll("div")).find((el) =>
          Object.prototype.hasOwnProperty.call(el, "_reactRootContainer")
        );
        rootContainer = fallbackRoot?._reactRootContainer || null;
      }
      return ctx.findGameStateFromFiber(rootContainer?.current || null);
    };

    ctx.getInitClientData = function getInitClientData() {
      const raw = ctx.storage.getItem("initClientData");
      if (!raw) {
        return null;
      }

      if (ctx.cachedInitClientData && ctx.cachedInitClientDataRaw === raw) {
        return ctx.cachedInitClientData;
      }

      const lz = typeof globalThis.MwiLabyrinthCompression !== "undefined" ? globalThis.MwiLabyrinthCompression : null;
      const parsers = [
        () => JSON.parse(raw),
        () => {
          if (!lz || typeof lz.decompressFromUTF16 !== "function") {
            return null;
          }
          const decompressed = lz.decompressFromUTF16(raw);
          return decompressed ? JSON.parse(decompressed) : null;
        },
        () => {
          if (!lz || typeof lz.decompressFromBase64 !== "function") {
            return null;
          }
          const decompressed = lz.decompressFromBase64(raw);
          return decompressed ? JSON.parse(decompressed) : null;
        }
      ];

      for (const parser of parsers) {
        try {
          const parsed = parser();
          if (parsed && typeof parsed === "object") {
            ctx.cachedInitClientData = parsed;
            ctx.cachedInitClientDataRaw = raw;
            return ctx.cachedInitClientData;
          }
        } catch (_error) {
          // Try next parser.
        }
      }

      console.error("[Lab Clear Rate] Failed to parse initClientData with all parsers.");
      return null;
    };

    ctx.getContainerValue = function getContainerValue(container, key) {
      if (!container || key === undefined || key === null) {
        return undefined;
      }
      if (container instanceof Map) {
        return container.get(key);
      }
      return container[key];
    };

    ctx.getContainerEntries = function getContainerEntries(container) {
      if (!container) {
        return [];
      }
      if (container instanceof Map) {
        return Array.from(container.entries());
      }
      if (typeof container === "object") {
        return Object.entries(container);
      }
      return [];
    };

    ctx.deepCloneJson = function deepCloneJson(value) {
      if (value === null || value === undefined) {
        return value;
      }
      if (typeof structuredClone === "function") {
        return structuredClone(value);
      }
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (_error) {
        return value;
      }
    };

    ctx.stableStringify = function stableStringify(value) {
      if (value === null || value === undefined) {
        return String(value);
      }
      const type = typeof value;
      if (type === "number" || type === "boolean") {
        return JSON.stringify(value);
      }
      if (type === "string") {
        return JSON.stringify(value);
      }
      if (Array.isArray(value)) {
        return `[${value.map((item) => ctx.stableStringify(item)).join(",")}]`;
      }
      if (value instanceof Map) {
        const entries = Array.from(value.entries()).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
        return ctx.stableStringify(entries);
      }
      if (type === "object") {
        const keys = Object.keys(value).sort();
        const body = keys.map((key) => `${JSON.stringify(key)}:${ctx.stableStringify(value[key])}`).join(",");
        return `{${body}}`;
      }
      return JSON.stringify(String(value));
    };

    ctx.hashString = function hashString(text) {
      const source = String(text || "");
      let hash = 2166136261;
      for (let i = 0; i < source.length; i += 1) {
        hash ^= source.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(36);
    };

    ctx.normalizeTriggerList = function normalizeTriggerList(rawList) {
      if (!Array.isArray(rawList)) {
        return [];
      }
      return rawList
        .map((trigger) => ({
          dependencyHrid: String(trigger?.dependencyHrid || ""),
          conditionHrid: String(trigger?.conditionHrid || ""),
          comparatorHrid: String(trigger?.comparatorHrid || ""),
          value: ctx.finiteNumber(trigger?.value, 0)
        }))
        .filter((trigger) => trigger.dependencyHrid && trigger.conditionHrid && trigger.comparatorHrid);
    };

    ctx.skillHridToSkillId = function skillHridToSkillId(skillHrid) {
      if (!skillHrid || typeof skillHrid !== "string") {
        return "";
      }
      const parts = skillHrid.split("/");
      return parts[parts.length - 1] || "";
    };

    ctx.skillIdToActionTypeHrid = function skillIdToActionTypeHrid(skillId) {
      return skillId ? `/action_types/${skillId}` : "";
    };

    ctx.isGatheringSkillId = function isGatheringSkillId(skillId) {
      return skillId === "milking" || skillId === "foraging" || skillId === "woodcutting";
    };

    ctx.isGourmetSkillId = function isGourmetSkillId(skillId) {
      return skillId === "cooking" || skillId === "brewing";
    };

    ctx.isDoubleProgressBuffApplicable = function isDoubleProgressBuffApplicable(skillId, buffTypeHrid) {
      if (buffTypeHrid === "/buff_types/gathering") {
        return ctx.isGatheringSkillId(skillId);
      }
      if (buffTypeHrid === "/buff_types/gourmet") {
        return ctx.isGourmetSkillId(skillId);
      }
      return false;
    };

    ctx.sumBuffValue = function sumBuffValue(buffs, predicate) {
      let total = 0;
      for (const buff of buffs) {
        if (!buff || !predicate(buff)) {
          continue;
        }
        total += Number(buff.flatBoost || 0);
        total += Number(buff.flatBoostLevelBonus || 0);
        total += Number(buff.ratioBoost || 0);
        total += Number(buff.ratioBoostLevelBonus || 0);
      }
      return total;
    };

    ctx.getBuffAmount = function getBuffAmount(buff) {
      if (!buff) {
        return 0;
      }
      return (
        ctx.finiteNumber(buff.flatBoost, 0) +
        ctx.finiteNumber(buff.flatBoostLevelBonus, 0) +
        ctx.finiteNumber(buff.ratioBoost, 0) +
        ctx.finiteNumber(buff.ratioBoostLevelBonus, 0)
      );
    };

    ctx.createEmptySkillingMetrics = function createEmptySkillingMetrics() {
      return {
        skillLevelBonus: 0,
        efficiencyBonus: 0,
        actionSpeedBonus: 0,
        successBonus: 0,
        experienceBonus: 0,
        genericExperienceBonus: 0,
        skillingExperienceBonus: 0,
        skillExperienceBonus: 0,
        crateDoubleProgressBonus: 0,
        gatheringBonus: 0
      };
    };

    ctx.cloneSkillingMetrics = function cloneSkillingMetrics(metrics) {
      return {
        skillLevelBonus: ctx.finiteNumber(metrics?.skillLevelBonus, 0),
        efficiencyBonus: ctx.finiteNumber(metrics?.efficiencyBonus, 0),
        actionSpeedBonus: ctx.finiteNumber(metrics?.actionSpeedBonus, 0),
        successBonus: ctx.finiteNumber(metrics?.successBonus, 0),
        experienceBonus: ctx.finiteNumber(metrics?.experienceBonus, 0),
        genericExperienceBonus: ctx.finiteNumber(metrics?.genericExperienceBonus, 0),
        skillingExperienceBonus: ctx.finiteNumber(metrics?.skillingExperienceBonus, 0),
        skillExperienceBonus: ctx.finiteNumber(metrics?.skillExperienceBonus, 0),
        crateDoubleProgressBonus: ctx.finiteNumber(metrics?.crateDoubleProgressBonus, 0),
        gatheringBonus: ctx.finiteNumber(metrics?.gatheringBonus, 0)
      };
    };

    ctx.addSkillingMetrics = function addSkillingMetrics(target, source) {
      if (!target || !source) {
        return target;
      }
      target.skillLevelBonus += ctx.finiteNumber(source.skillLevelBonus, 0);
      target.efficiencyBonus += ctx.finiteNumber(source.efficiencyBonus, 0);
      target.actionSpeedBonus += ctx.finiteNumber(source.actionSpeedBonus, 0);
      target.successBonus += ctx.finiteNumber(source.successBonus, 0);
      target.experienceBonus += ctx.finiteNumber(source.experienceBonus, 0);
      target.genericExperienceBonus += ctx.finiteNumber(source.genericExperienceBonus, 0);
      target.skillingExperienceBonus += ctx.finiteNumber(source.skillingExperienceBonus, 0);
      target.skillExperienceBonus += ctx.finiteNumber(source.skillExperienceBonus, 0);
      target.crateDoubleProgressBonus += ctx.finiteNumber(source.crateDoubleProgressBonus, 0);
      target.gatheringBonus += ctx.finiteNumber(source.gatheringBonus, 0);
      return target;
    };

    ctx.buildLabyrinthUpgradeSkillingMetrics = function buildLabyrinthUpgradeSkillingMetrics(levels) {
      const metrics = ctx.createEmptySkillingMetrics();
      metrics.actionSpeedBonus +=
        ctx.getLabyrinthUpgradeLevel(levels, ctx.LABYRINTH_UPGRADE_KEY_SKILL_ACTION_SPEED) *
        ctx.LABYRINTH_UPGRADE_STEP_RATIO;
      metrics.efficiencyBonus +=
        ctx.getLabyrinthUpgradeLevel(levels, ctx.LABYRINTH_UPGRADE_KEY_SKILLING_EFFICIENCY) *
        ctx.LABYRINTH_UPGRADE_STEP_RATIO;
      metrics.successBonus +=
        ctx.getLabyrinthUpgradeLevel(levels, ctx.LABYRINTH_UPGRADE_KEY_SKILLING_SUCCESS) *
        ctx.LABYRINTH_UPGRADE_SKILLING_SUCCESS_STEP_RATIO;
      metrics.crateDoubleProgressBonus +=
        ctx.getLabyrinthUpgradeLevel(levels, ctx.LABYRINTH_UPGRADE_KEY_SKILLING_DOUBLE_PROGRESS) *
        ctx.LABYRINTH_UPGRADE_STEP_RATIO;
      return metrics;
    };

    ctx.getLabyrinthUpgradeExperienceBonus = function getLabyrinthUpgradeExperienceBonus(levels) {
      return (
        ctx.getLabyrinthUpgradeLevel(levels, ctx.LABYRINTH_UPGRADE_KEY_LABYRINTH_EXPERIENCE) *
        ctx.LABYRINTH_UPGRADE_STEP_RATIO
      );
    };

    ctx.subtractSkillingMetrics = function subtractSkillingMetrics(target, source) {
      if (!target || !source) {
        return target;
      }
      target.skillLevelBonus -= ctx.finiteNumber(source.skillLevelBonus, 0);
      target.efficiencyBonus -= ctx.finiteNumber(source.efficiencyBonus, 0);
      target.actionSpeedBonus -= ctx.finiteNumber(source.actionSpeedBonus, 0);
      target.successBonus -= ctx.finiteNumber(source.successBonus, 0);
      target.experienceBonus -= ctx.finiteNumber(source.experienceBonus, 0);
      target.genericExperienceBonus -= ctx.finiteNumber(source.genericExperienceBonus, 0);
      target.skillingExperienceBonus -= ctx.finiteNumber(source.skillingExperienceBonus, 0);
      target.skillExperienceBonus -= ctx.finiteNumber(source.skillExperienceBonus, 0);
      target.crateDoubleProgressBonus -= ctx.finiteNumber(source.crateDoubleProgressBonus, 0);
      target.gatheringBonus -= ctx.finiteNumber(source.gatheringBonus, 0);
      return target;
    };

    ctx.getSkillingBuffMetrics = function getSkillingBuffMetrics(skillId, buffs) {
      const metrics = ctx.createEmptySkillingMetrics();
      const skillLevelType = `/buff_types/${skillId}_level`;
      const skillSuccessType = `/buff_types/${skillId}_success`;
      const skillExperienceType = `/buff_types/${skillId}_experience`;
      for (const buff of Array.isArray(buffs) ? buffs : []) {
        if (!buff?.typeHrid) {
          continue;
        }
        const amount = ctx.getBuffAmount(buff);
        if (!Number.isFinite(amount) || amount === 0) {
          continue;
        }

        if (buff.typeHrid === skillLevelType) {
          metrics.skillLevelBonus += amount;
        } else if (buff.typeHrid === "/buff_types/efficiency") {
          metrics.efficiencyBonus += amount;
        } else if (buff.typeHrid === "/buff_types/action_speed") {
          metrics.actionSpeedBonus += amount;
        } else if (buff.typeHrid === "/buff_types/labyrinth_double_progress") {
          metrics.crateDoubleProgressBonus += amount;
        } else if (buff.typeHrid === "/buff_types/experience" || buff.typeHrid === "/buff_types/wisdom") {
          metrics.experienceBonus += amount;
          metrics.genericExperienceBonus += amount;
        } else if (buff.typeHrid === "/buff_types/skilling_experience") {
          metrics.experienceBonus += amount;
          metrics.skillingExperienceBonus += amount;
        } else if (buff.typeHrid === skillExperienceType) {
          metrics.experienceBonus += amount;
          metrics.skillExperienceBonus += amount;
        } else if (ctx.isDoubleProgressBuffApplicable(skillId, buff.typeHrid)) {
          metrics.gatheringBonus += amount;
        } else if (buff.typeHrid === "/buff_types/success_rate" || buff.typeHrid === skillSuccessType) {
          metrics.successBonus += amount;
        }
      }

      return metrics;
    };

    ctx.getSkillingActionMetricsFromState = function getSkillingActionMetricsFromState(
      state,
      skillId,
      actionTypeHrid,
      stateKey
    ) {
      const actionTypeBuffs = state?.[stateKey];
      const buffs = actionTypeBuffs?.[actionTypeHrid];
      return ctx.getSkillingBuffMetrics(skillId, Array.isArray(buffs) ? buffs : []);
    };

    ctx.getSkillingGlobalMetrics = function getSkillingGlobalMetrics(state, skillId, actionTypeHrid, options = {}) {
      const includePersonalBuffs = !(options && options.includePersonalBuffs === false);
      const equipmentMetrics = ctx.getSkillingActionMetricsFromState(
        state,
        skillId,
        actionTypeHrid,
        "equipmentActionTypeBuffsDict"
      );
      const hasTotalBuffs = Array.isArray(state?.skillingActionTypeBuffsDict?.[actionTypeHrid]);
      if (!hasTotalBuffs) {
        const fallbackGlobalMetrics = ctx.createEmptySkillingMetrics();
        const fallbackGlobalStateKeys = [
          "communityActionTypeBuffsDict",
          "houseActionTypeBuffsDict",
          "achievementActionTypeBuffsDict",
          "mooPassActionTypeBuffsDict"
        ];
        if (includePersonalBuffs) {
          fallbackGlobalStateKeys.unshift("personalActionTypeBuffsDict");
        }
        for (const stateKey of fallbackGlobalStateKeys) {
          ctx.addSkillingMetrics(
            fallbackGlobalMetrics,
            ctx.getSkillingActionMetricsFromState(state, skillId, actionTypeHrid, stateKey)
          );
        }
        return {
          equipmentMetrics,
          globalMetrics: fallbackGlobalMetrics
        };
      }

      const totalMetrics = ctx.getSkillingActionMetricsFromState(
        state,
        skillId,
        actionTypeHrid,
        "skillingActionTypeBuffsDict"
      );
      const consumableMetrics = ctx.getSkillingActionMetricsFromState(
        state,
        skillId,
        actionTypeHrid,
        "consumableActionTypeBuffsDict"
      );
      const globalMetrics = ctx.cloneSkillingMetrics(totalMetrics);
      ctx.subtractSkillingMetrics(globalMetrics, equipmentMetrics);
      ctx.subtractSkillingMetrics(globalMetrics, consumableMetrics);
      if (!includePersonalBuffs) {
        const personalMetrics = ctx.getSkillingActionMetricsFromState(
          state,
          skillId,
          actionTypeHrid,
          "personalActionTypeBuffsDict"
        );
        ctx.subtractSkillingMetrics(globalMetrics, personalMetrics);
      }

      return {
        equipmentMetrics,
        globalMetrics
      };
    };

    ctx.hasMeaningfulSkillingMetrics = function hasMeaningfulSkillingMetrics(metrics) {
      const epsilon = 1e-9;
      return (
        Math.abs(ctx.finiteNumber(metrics?.skillLevelBonus, 0)) > epsilon ||
        Math.abs(ctx.finiteNumber(metrics?.efficiencyBonus, 0)) > epsilon ||
        Math.abs(ctx.finiteNumber(metrics?.actionSpeedBonus, 0)) > epsilon ||
        Math.abs(ctx.finiteNumber(metrics?.successBonus, 0)) > epsilon ||
        Math.abs(ctx.finiteNumber(metrics?.experienceBonus, 0)) > epsilon ||
        Math.abs(ctx.finiteNumber(metrics?.genericExperienceBonus, 0)) > epsilon ||
        Math.abs(ctx.finiteNumber(metrics?.skillingExperienceBonus, 0)) > epsilon ||
        Math.abs(ctx.finiteNumber(metrics?.skillExperienceBonus, 0)) > epsilon ||
        Math.abs(ctx.finiteNumber(metrics?.crateDoubleProgressBonus, 0)) > epsilon ||
        Math.abs(ctx.finiteNumber(metrics?.gatheringBonus, 0)) > epsilon
      );
    };

    ctx.buildLabyrinthCalcDoneMessage = function buildLabyrinthCalcDoneMessage(_state, _flatRooms, _targetIndexes) {
      return ctx.t("calcDone");
    };

    ctx.getSkillLevel = function getSkillLevel(skillMap, skillHrid) {
      if (!skillMap) {
        return 0;
      }
      if (skillMap instanceof Map) {
        return Number(skillMap.get(skillHrid)?.level || 0);
      }
      return Number(skillMap[skillHrid]?.level || 0);
    };

    ctx.getCrateBuffs = function getCrateBuffs(initClientData, teaCrateItemHrid) {
      if (!initClientData || !teaCrateItemHrid) {
        return [];
      }
      const map = initClientData.labyrinthCrateDetailMap || {};
      const buffs = map[teaCrateItemHrid];
      return Array.isArray(buffs) ? buffs : [];
    };

    ctx.normalizeCombatBuffEntry = function normalizeCombatBuffEntry(buff) {
      if (!buff?.typeHrid) {
        return null;
      }
      return {
        uniqueHrid: String(buff.uniqueHrid || ""),
        typeHrid: String(buff.typeHrid || ""),
        ratioBoost: ctx.finiteNumber(buff.ratioBoost, 0),
        ratioBoostLevelBonus: ctx.finiteNumber(buff.ratioBoostLevelBonus, 0),
        flatBoost: ctx.finiteNumber(buff.flatBoost, 0),
        flatBoostLevelBonus: ctx.finiteNumber(buff.flatBoostLevelBonus, 0),
        startTime: String(buff.startTime || "0001-01-01T00:00:00Z"),
        duration: Math.max(0, ctx.finiteNumber(buff.duration, 0))
      };
    };

    ctx.buildSimulatorLabyrinthUpgrades = function buildSimulatorLabyrinthUpgrades(levels) {
      return {
        "/buff_uniques/labyrinth_upgrade_combat_damage": ctx.getLabyrinthUpgradeLevel(
          levels,
          ctx.LABYRINTH_UPGRADE_KEY_COMBAT_DAMAGE
        ),
        "/buff_uniques/labyrinth_upgrade_attack_speed": ctx.getLabyrinthUpgradeLevel(
          levels,
          ctx.LABYRINTH_UPGRADE_KEY_ATTACK_SPEED
        ),
        "/buff_uniques/labyrinth_upgrade_cast_speed": ctx.getLabyrinthUpgradeLevel(
          levels,
          ctx.LABYRINTH_UPGRADE_KEY_CAST_SPEED
        ),
        "/buff_uniques/labyrinth_upgrade_critical_rate": ctx.getLabyrinthUpgradeLevel(
          levels,
          ctx.LABYRINTH_UPGRADE_KEY_CRITICAL_RATE
        ),
        "/buff_uniques/labyrinth_upgrade_experience": ctx.getLabyrinthUpgradeLevel(
          levels,
          ctx.LABYRINTH_UPGRADE_KEY_LABYRINTH_EXPERIENCE
        )
      };
    };

    ctx.buildSimulatorLabyrinthImportLevels = function buildSimulatorLabyrinthImportLevels(upgrades) {
      const result = {};
      for (const [hrid, key] of [
        ["/buff_uniques/labyrinth_upgrade_attack_speed", "labyrinthAttackSpeedLevel"],
        ["/buff_uniques/labyrinth_upgrade_cast_speed", "labyrinthCastSpeedLevel"],
        ["/buff_uniques/labyrinth_upgrade_combat_damage", "labyrinthCombatDamageLevel"],
        ["/buff_uniques/labyrinth_upgrade_critical_rate", "labyrinthCriticalRateLevel"],
        ["/buff_uniques/labyrinth_upgrade_experience", "labyrinthExperienceLevel"]
      ]) {
        result[key] = upgrades?.[hrid] || 0;
      }
      return result;
    };

    ctx.appendNormalizedCombatBuffs = function appendNormalizedCombatBuffs(target, seen, rawBuffs) {
      if (!Array.isArray(rawBuffs)) {
        return target;
      }
      const dedupeSet = seen instanceof Set ? seen : new Set();
      for (const buff of rawBuffs) {
        const normalized = ctx.normalizeCombatBuffEntry(buff);
        if (!normalized || !normalized.typeHrid) {
          continue;
        }
        const dedupeKey = [
          normalized.typeHrid,
          normalized.ratioBoost,
          normalized.ratioBoostLevelBonus,
          normalized.flatBoost,
          normalized.flatBoostLevelBonus,
          normalized.duration
        ].join("|");
        if (dedupeSet.has(dedupeKey)) {
          continue;
        }
        dedupeSet.add(dedupeKey);
        target.push(normalized);
      }
      return target;
    };

    ctx.getActiveGuildCombatShrineLevels = function getActiveGuildCombatShrineLevels(state) {
      const activeBuffs = state?.characterGuildBuffDict || {};
      const readLevel = (hrid) => Math.max(0, Math.floor(ctx.finiteNumber(activeBuffs?.[hrid]?.level, 0)));
      return {
        "/guild_buffs/force_combat": readLevel("/guild_buffs/force_combat"),
        "/guild_buffs/rarity_combat": readLevel("/guild_buffs/rarity_combat"),
        "/guild_buffs/scholar_combat": readLevel("/guild_buffs/scholar_combat"),
        "/guild_buffs/spirit_combat": readLevel("/guild_buffs/spirit_combat"),
        "/guild_buffs/tempo_combat": readLevel("/guild_buffs/tempo_combat")
      };
    };

    ctx.isLabyrinthRunActiveForCrateSelection = function isLabyrinthRunActiveForCrateSelection(state) {
      if (!state?.characterLabyrinth) {
        return false;
      }
      const labyrinth = state.characterLabyrinth;
      if (Array.isArray(labyrinth.roomData) && labyrinth.roomData.length > 0) {
        return true;
      }
      const path = ctx.parseLabyrinthPathData(labyrinth.pathData);
      if (Array.isArray(path) && path.length > 0) {
        return true;
      }
      if (state.labyrinthRoomProgress) {
        return true;
      }
      return Array.isArray(state.labyrinthBattleMonsters) && state.labyrinthBattleMonsters.length > 0;
    };

    ctx.getLabyrinthCrateSelection = function getLabyrinthCrateSelection(state) {
      const labyrinth = state?.characterLabyrinth || {};
      const setting = state?.characterSetting || {};
      const fromLabyrinth = {
        teaCrateItemHrid: String(labyrinth?.teaCrateItemHrid || ""),
        coffeeCrateItemHrid: String(labyrinth?.coffeeCrateItemHrid || ""),
        foodCrateItemHrid: String(labyrinth?.foodCrateItemHrid || ""),
        source: "labyrinth"
      };
      const runActive = ctx.isLabyrinthRunActiveForCrateSelection(state);
      const hasSettingCrateKeys =
        Object.prototype.hasOwnProperty.call(setting, "labyrinthTeaCrateHrid") ||
        Object.prototype.hasOwnProperty.call(setting, "labyrinthCoffeeCrateHrid") ||
        Object.prototype.hasOwnProperty.call(setting, "labyrinthFoodCrateHrid");
      if (!runActive && hasSettingCrateKeys) {
        return {
          teaCrateItemHrid: String(setting?.labyrinthTeaCrateHrid || ""),
          coffeeCrateItemHrid: String(setting?.labyrinthCoffeeCrateHrid || ""),
          foodCrateItemHrid: String(setting?.labyrinthFoodCrateHrid || ""),
          source: "setting"
        };
      }
      return fromLabyrinth;
    };

    ctx.getCombatCrateBuffs = function getCombatCrateBuffs(state, initClientData) {
      const crateSelection = ctx.getLabyrinthCrateSelection(state);
      const teaCrateItemHrid = String(crateSelection?.teaCrateItemHrid || "");
      const coffeeCrateItemHrid = String(crateSelection?.coffeeCrateItemHrid || "");
      const foodCrateItemHrid = String(crateSelection?.foodCrateItemHrid || "");
      const combatCrateItemHrids = [];
      if (coffeeCrateItemHrid) {
        combatCrateItemHrids.push(coffeeCrateItemHrid);
      }
      if (foodCrateItemHrid) {
        combatCrateItemHrids.push(foodCrateItemHrid);
      }
      // Compatibility fallback: old states may only expose one crate field.
      if (!combatCrateItemHrids.length && teaCrateItemHrid) {
        if (teaCrateItemHrid.includes("coffee_crate") || teaCrateItemHrid.includes("food_crate")) {
          combatCrateItemHrids.push(teaCrateItemHrid);
        }
      }

      const combatBuffs = [];
      const seen = new Set();
      for (const itemHrid of combatCrateItemHrids) {
        const crateBuffs = ctx.getCrateBuffs(initClientData, itemHrid);
        ctx.appendNormalizedCombatBuffs(combatBuffs, seen, crateBuffs);
      }
      const combatCrateSignature = combatCrateItemHrids.join("+");
      return {
        teaCrateItemHrid,
        coffeeCrateItemHrid,
        foodCrateItemHrid,
        combatCrateItemHrids,
        combatCrateSignature,
        combatBuffs
      };
    };
  };
})(globalThis);
