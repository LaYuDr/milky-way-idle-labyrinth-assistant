// Adapted from 迷宫胜率计算器 1.6.0, dakonglong, MIT. See docs/THIRD_PARTY.md.
(function (root) {
  "use strict";
  root.MwiLabyrinthCalculatorModules ||= {};
  root.MwiLabyrinthCalculatorModules["automation"] = function (ctx) {
    ctx.isLabyrinthPanelInstance = function isLabyrinthPanelInstance(value) {
      return Boolean(
        value &&
        typeof value === "object" &&
        typeof value.getSkillingRoomTypes === "function" &&
        typeof value.getCombatRoomTypes === "function" &&
        typeof value.getEffectiveLevelForRoom === "function"
      );
    };

    ctx.findLabyrinthPanelInstanceFromFiber = function findLabyrinthPanelInstanceFromFiber(rootFiber) {
      if (!rootFiber || typeof rootFiber !== "object") {
        return null;
      }
      const queue = [rootFiber];
      const visited = new Set();
      let steps = 0;
      while (queue.length > 0 && steps < 12000) {
        const fiber = queue.shift();
        if (!fiber || typeof fiber !== "object" || visited.has(fiber)) {
          continue;
        }
        visited.add(fiber);
        steps += 1;

        if (ctx.isLabyrinthPanelInstance(fiber.stateNode)) {
          return fiber.stateNode;
        }

        if (fiber.child) {
          queue.push(fiber.child);
        }
        if (fiber.sibling) {
          queue.push(fiber.sibling);
        }
        if (fiber.return) {
          queue.push(fiber.return);
        }
      }
      return null;
    };

    ctx.getLabyrinthPanelInstance = function getLabyrinthPanelInstance() {
      const panelElement = document.querySelector('div[class*="LabyrinthPanel_labyrinthPanel"]');
      if (!panelElement) {
        return null;
      }
      const reactKey = Object.keys(panelElement).find((key) => key.startsWith("__reactFiber$"));
      if (!reactKey) {
        return null;
      }
      const fiberNode = panelElement[reactKey];
      return ctx.findLabyrinthPanelInstanceFromFiber(fiberNode);
    };

    ctx.getAutomationEstimateTable = function getAutomationEstimateTable() {
      const direct = document.querySelector('table[class*="LabyrinthPanel_automationTable"]');
      if (direct) {
        return direct;
      }
      const panel = document.querySelector('div[class*="LabyrinthPanel_labyrinthPanel"]');
      if (!panel) {
        return null;
      }
      const tables = Array.from(panel.querySelectorAll("table"));
      for (const table of tables) {
        const headerCells = Array.from(table.querySelectorAll("thead th")).map((th) =>
          String(th.textContent || "").trim()
        );
        if (!headerCells.length) {
          continue;
        }
        const hasRoomType = headerCells.some((text) => /房间类型|room\s*type/i.test(text));
        const hasSkip = headerCells.some((text) => /跳过如果高出等级|跳过等级|skip.*level|skip\s*if/i.test(text));
        if (hasRoomType && hasSkip) {
          return table;
        }
      }
      return null;
    };

    ctx.getAutomationEstimateSection = function getAutomationEstimateSection(table) {
      if (!table) {
        return null;
      }
      return table.closest('div[class*="LabyrinthPanel_automationSection"]') || table.parentElement || null;
    };

    ctx.clearAutomationWideLayout = function clearAutomationWideLayout() {
      if (!Array.isArray(ctx.automationWideLayoutNodes) || ctx.automationWideLayoutNodes.length === 0) {
        return;
      }
      for (const node of ctx.automationWideLayoutNodes) {
        if (!node || !node.style) {
          continue;
        }
        node.style.removeProperty("width");
        node.style.removeProperty("max-width");
        node.style.removeProperty("min-width");
      }
      ctx.automationWideLayoutNodes = [];
    };

    ctx.applyAutomationWideLayout = function applyAutomationWideLayout(_section, _table) {};

    ctx.isAutomationEstimatePanelVisible = function isAutomationEstimatePanelVisible() {
      return Boolean(ctx.getAutomationEstimateTable());
    };

    ctx.hasAnyLabyrinthCrateSelected = function hasAnyLabyrinthCrateSelected(state) {
      const selection = ctx.getLabyrinthCrateSelection(state);
      const tea = String(selection?.teaCrateItemHrid || "");
      const coffee = String(selection?.coffeeCrateItemHrid || "");
      const food = String(selection?.foodCrateItemHrid || "");
      return Boolean(tea || coffee || food);
    };

    ctx.getAutomationMissingCratesForEntry = function getAutomationMissingCratesForEntry(entry, crateSelection) {
      const tea = String(crateSelection?.teaCrateItemHrid || "");
      const coffee = String(crateSelection?.coffeeCrateItemHrid || "");
      const food = String(crateSelection?.foodCrateItemHrid || "");
      if (entry?.isCombat) {
        const missing = [];
        if (!coffee) {
          missing.push(ctx.t("missingCoffeeCrate"));
        }
        if (!food) {
          missing.push(ctx.t("missingFoodCrate"));
        }
        return missing;
      }
      return tea ? [] : [ctx.t("missingTeaCrate")];
    };

    ctx.formatAutomationMissingCratesMessage = function formatAutomationMissingCratesMessage(missingCrates) {
      if (!Array.isArray(missingCrates) || missingCrates.length === 0) {
        return "";
      }
      const joiner = ctx.isChineseUi() ? "、" : " / ";
      return ctx.t("missingCrateFmt", { crates: missingCrates.join(joiner) });
    };

    ctx.normalizeAutomationRoomTypeEntry = function normalizeAutomationRoomTypeEntry(rawEntry, isCombat) {
      const key = String(rawEntry?.key || "");
      if (!key) {
        return null;
      }
      if (isCombat) {
        const monsterHrid = String(rawEntry?.monsterHrid || "");
        if (!monsterHrid) {
          return null;
        }
        return {
          key,
          isCombat: true,
          monsterHrid
        };
      }
      const skillHrid = String(rawEntry?.skillHrid || "");
      if (!skillHrid) {
        return null;
      }
      return {
        key,
        isCombat: false,
        skillHrid
      };
    };

    ctx.getAutomationRoomTypeEntries = function getAutomationRoomTypeEntries(panelInstance) {
      const skillingFromPanel =
        typeof panelInstance?.getSkillingRoomTypes === "function" ? panelInstance.getSkillingRoomTypes() : null;
      const combatFromPanel =
        typeof panelInstance?.getCombatRoomTypes === "function" ? panelInstance.getCombatRoomTypes() : null;
      const skillingRaw =
        Array.isArray(skillingFromPanel) && skillingFromPanel.length > 0
          ? skillingFromPanel
          : ctx.LABYRINTH_AUTOMATION_SKILL_ROOM_TYPES;
      const combatRaw =
        Array.isArray(combatFromPanel) && combatFromPanel.length > 0
          ? combatFromPanel
          : ctx.LABYRINTH_AUTOMATION_COMBAT_ROOM_TYPES;
      const result = [];
      for (const rawEntry of Array.isArray(skillingRaw) ? skillingRaw : []) {
        const normalized = ctx.normalizeAutomationRoomTypeEntry(rawEntry, false);
        if (normalized) {
          result.push(normalized);
        }
      }
      for (const rawEntry of Array.isArray(combatRaw) ? combatRaw : []) {
        const normalized = ctx.normalizeAutomationRoomTypeEntry(rawEntry, true);
        if (normalized) {
          result.push(normalized);
        }
      }
      return result;
    };

    ctx.getAutomationRoomTypeEntryByKey = function getAutomationRoomTypeEntryByKey(roomTypeKey, panelInstance = null) {
      const key = String(roomTypeKey || "");
      if (!key) {
        return null;
      }
      const panel = panelInstance || ctx.getLabyrinthPanelInstance();
      const entries = ctx.getAutomationRoomTypeEntries(panel);
      for (const entry of entries) {
        if (String(entry?.key || "") === key) {
          return entry;
        }
      }
      return null;
    };

    ctx.createAutomationRoomFromEntry = function createAutomationRoomFromEntry(entry, roomLevel) {
      const level = Math.max(1, Math.floor(ctx.finiteNumber(roomLevel, 1)));
      if (entry?.isCombat) {
        return {
          roomType: ctx.LABYRINTH_COMBAT_ROOM_TYPE,
          monsterHrid: String(entry.monsterHrid || ""),
          recommendedLevel: level
        };
      }
      return {
        roomType: ctx.LABYRINTH_SKILLING_ROOM_TYPE,
        skillHrid: String(entry?.skillHrid || ""),
        recommendedLevel: level
      };
    };

    ctx.resolveAutomationRoomLoadoutId = function resolveAutomationRoomLoadoutId(panelInstance, key, state) {
      let value = null;
      if (typeof panelInstance?.getLoadoutIdForRoomType === "function") {
        value = panelInstance.getLoadoutIdForRoomType(key);
      }
      if (!Number.isFinite(Number(value))) {
        const settingKey = `labyrinthLoadout${ctx.toPascalCase(key)}`;
        value = state?.characterSetting?.[settingKey];
      }
      return Math.max(0, Math.floor(ctx.finiteNumber(value, 0)));
    };

    ctx.resolveAutomationSkipThreshold = function resolveAutomationSkipThreshold(
      panelInstance,
      key,
      state,
      skipThresholdOverrides = null
    ) {
      let value = null;
      if (skipThresholdOverrides instanceof Map && skipThresholdOverrides.has(String(key || ""))) {
        value = skipThresholdOverrides.get(String(key || ""));
      }
      if (typeof panelInstance?.getSkipThresholdForRoomType === "function") {
        const panelValue = panelInstance.getSkipThresholdForRoomType(key);
        if (!Number.isFinite(Number(value))) {
          value = panelValue;
        }
      }
      if (!Number.isFinite(Number(value))) {
        const settingKey = `labyrinthSkip${ctx.toPascalCase(key)}`;
        value = state?.characterSetting?.[settingKey];
      }
      if (!Number.isFinite(Number(value))) {
        value = ctx.AUTOMATION_ESTIMATE_DEFAULT_SKIP_THRESHOLD;
      }
      return Math.floor(ctx.finiteNumber(value, ctx.AUTOMATION_ESTIMATE_DEFAULT_SKIP_THRESHOLD));
    };

    ctx.getAutomationCombatBaseLevel = function getAutomationCombatBaseLevel(state) {
      const fromCombatSkill = ctx.finiteNumber(
        ctx.getSkillLevel(state?.characterSkillMap, ctx.COMBAT_LEVEL_SKILL_HRID),
        NaN
      );
      if (Number.isFinite(fromCombatSkill) && fromCombatSkill > 0) {
        return fromCombatSkill;
      }
      const fromCombatDetails = ctx.finiteNumber(state?.combatUnit?.combatDetails?.combatLevel, NaN);
      if (Number.isFinite(fromCombatDetails) && fromCombatDetails > 0) {
        return fromCombatDetails;
      }
      const fromCombatUnit = ctx.finiteNumber(state?.combatUnit?.combatLevel, NaN);
      if (Number.isFinite(fromCombatUnit) && fromCombatUnit > 0) {
        return fromCombatUnit;
      }
      const fromCharacter = ctx.finiteNumber(state?.character?.combatLevel, NaN);
      if (Number.isFinite(fromCharacter) && fromCharacter > 0) {
        return fromCharacter;
      }

      const levels = ctx.getCombatSkillLevelsFromState(state);
      const avg =
        (ctx.finiteNumber(levels.stamina, 1) +
          ctx.finiteNumber(levels.intelligence, 1) +
          ctx.finiteNumber(levels.attack, 1) +
          ctx.finiteNumber(levels.defense, 1) +
          ctx.finiteNumber(levels.melee, 1) +
          ctx.finiteNumber(levels.ranged, 1) +
          ctx.finiteNumber(levels.magic, 1)) /
        7;
      return Math.max(0, avg);
    };

    ctx.getAutomationCombatCrateLevelBonus = function getAutomationCombatCrateLevelBonus(state, initClientData) {
      if (!state || !initClientData) {
        return 0;
      }
      const combatCrate = ctx.getCombatCrateBuffs(state, initClientData);
      const buffs = Array.isArray(combatCrate?.combatBuffs) ? combatCrate.combatBuffs : [];
      if (!buffs.length) {
        return 0;
      }
      const skillLevelTypes = new Set([
        "/buff_types/stamina_level",
        "/buff_types/intelligence_level",
        "/buff_types/attack_level",
        "/buff_types/defense_level",
        "/buff_types/melee_level",
        "/buff_types/ranged_level",
        "/buff_types/magic_level"
      ]);

      let directLevelBonus = 0;
      let skillLevelSum = 0;
      let skillLevelCount = 0;

      for (const buff of buffs) {
        const typeHrid = String(buff?.typeHrid || "");
        if (!typeHrid) {
          continue;
        }
        const amount = ctx.getBuffAmount(buff);
        if (!Number.isFinite(amount) || amount === 0) {
          continue;
        }
        if (typeHrid === "/buff_types/combat_level" || typeHrid === "/buff_types/action_level") {
          directLevelBonus += amount;
          continue;
        }
        if (skillLevelTypes.has(typeHrid)) {
          skillLevelSum += amount;
          skillLevelCount += 1;
        }
      }

      const averagedSkillLevelBonus = skillLevelCount > 0 ? skillLevelSum / skillLevelCount : 0;
      return Math.max(0, directLevelBonus + averagedSkillLevelBonus);
    };

    ctx.resolveAutomationEffectiveLevel = function resolveAutomationEffectiveLevel(
      panelInstance,
      entry,
      state,
      initClientData,
      options = {}
    ) {
      const includePersonalBuffs = !(options && options.includePersonalBuffs === false);
      if (!entry?.isCombat) {
        if (includePersonalBuffs) {
          const testRoom = ctx.createAutomationRoomFromEntry(entry, 1);
          const fromPanel =
            typeof panelInstance?.getEffectiveLevelForRoom === "function"
              ? ctx.finiteNumber(panelInstance.getEffectiveLevelForRoom(testRoom), NaN)
              : NaN;
          if (Number.isFinite(fromPanel)) {
            return Math.max(0, fromPanel);
          }
        }
        const baseLevel = ctx.positiveNumber(ctx.getSkillLevel(state?.characterSkillMap, entry.skillHrid), 1);
        const selection = ctx.getLabyrinthCrateSelection(state);
        const teaCrateItemHrid = String(selection?.teaCrateItemHrid || "");
        const skillId = ctx.skillHridToSkillId(entry.skillHrid);
        const crateMetrics = ctx.getSkillingBuffMetrics(skillId, ctx.getCrateBuffs(initClientData, teaCrateItemHrid));
        return Math.max(0, baseLevel + ctx.finiteNumber(crateMetrics.skillLevelBonus, 0));
      }

      const baseCombatLevel = ctx.getAutomationCombatBaseLevel(state);
      const crateLevelBonus = ctx.getAutomationCombatCrateLevelBonus(state, initClientData);
      return Math.max(0, baseCombatLevel + crateLevelBonus);
    };

    ctx.computeAutomationTargetRoomLevel = function computeAutomationTargetRoomLevel(effectiveLevel, skipThreshold) {
      const effective = ctx.finiteNumber(effectiveLevel, 0);
      const threshold = Math.floor(ctx.finiteNumber(skipThreshold, ctx.AUTOMATION_ESTIMATE_DEFAULT_SKIP_THRESHOLD));
      return Math.floor(effective + threshold - 1);
    };

    ctx.computeAutomationMaxFloorByRoomLevel = function computeAutomationMaxFloorByRoomLevel(roomLevel) {
      const level = Math.max(0, Math.floor(ctx.finiteNumber(roomLevel, 0)));
      if (level <= 0) {
        return 0;
      }
      return Math.max(0, Math.floor(level / 20));
    };

    ctx.getAutomationRoomLabel = function getAutomationRoomLabel(entry, initClientData = null) {
      if (entry?.isCombat) {
        const monsterHrid = String(entry?.monsterHrid || "");
        const monsterDetail = monsterHrid
          ? ctx.getContainerValue(initClientData?.combatMonsterDetailMap, monsterHrid)
          : null;
        return String(
          (ctx.isChineseUi() &&
            (ctx.LABYRINTH_MONSTER_NAME_ZH_MAP[monsterHrid] ||
              ctx.LABYRINTH_MONSTER_NAME_ZH_BY_TAIL[monsterHrid.split("/").pop() || ""])) ||
            monsterDetail?.name ||
            monsterHrid.split("/").pop() ||
            monsterHrid ||
            "--"
        );
      }
      const key = String(entry?.key || "");
      return ctx.isChineseUi()
        ? ctx.LABYRINTH_AUTOMATION_SKILL_NAME_ZH_BY_KEY[key] || key || "--"
        : ctx.LABYRINTH_AUTOMATION_SKILL_NAME_EN_BY_KEY[key] || key || "--";
    };

    ctx.parseAutomationSkipThresholdFromRow = function parseAutomationSkipThresholdFromRow(row) {
      if (!row) {
        return NaN;
      }
      const cells = Array.from(row.querySelectorAll("td"));
      const skipCell = cells[2] || null;
      const rawText = String(skipCell?.textContent || "");
      const match = rawText.match(/-?\d+/);
      if (!match) {
        return NaN;
      }
      return Math.floor(ctx.finiteNumber(Number(match[0]), NaN));
    };

    ctx.buildAutomationSkipThresholdOverrideMap = function buildAutomationSkipThresholdOverrideMap(entries) {
      const overrides = new Map();
      if (!Array.isArray(entries) || entries.length === 0) {
        return overrides;
      }
      const table = ctx.getAutomationEstimateTable();
      if (!table) {
        return overrides;
      }
      const rows = Array.from(table.querySelectorAll("tbody tr"));
      const count = Math.min(entries.length, rows.length);
      for (let i = 0; i < count; i += 1) {
        const entry = entries[i];
        if (!entry?.key) {
          continue;
        }
        const parsed = ctx.parseAutomationSkipThresholdFromRow(rows[i]);
        if (!Number.isFinite(parsed)) {
          continue;
        }
        overrides.set(String(entry.key), parsed);
      }
      return overrides;
    };

    ctx.buildAutomationEstimateSharedSignature = function buildAutomationEstimateSharedSignature(state) {
      if (!state || !state.characterLabyrinth) {
        return "";
      }
      const selection = ctx.getLabyrinthCrateSelection(state);
      const crateSignature = [
        String(selection?.teaCrateItemHrid || ""),
        String(selection?.coffeeCrateItemHrid || ""),
        String(selection?.foodCrateItemHrid || "")
      ].join("|");
      const trials = ctx.getSelectedAutomationCombatTrials();
      return `revision=${ctx.inputRevision}|crate=${crateSignature}|trials=${trials}`;
    };

    ctx.buildAutomationRecommendSharedSignature = function buildAutomationRecommendSharedSignature(
      state,
      targetWinRate
    ) {
      if (!state || !state.characterLabyrinth) {
        return "";
      }
      const selection = ctx.getLabyrinthCrateSelection(state);
      const crateSignature = [
        String(selection?.teaCrateItemHrid || ""),
        String(selection?.coffeeCrateItemHrid || ""),
        String(selection?.foodCrateItemHrid || "")
      ].join("|");
      const trials = ctx.getSelectedAutomationCombatTrials();
      const target = ctx.normalizeAutomationTargetWinRate(targetWinRate);
      return ctx.automationRecommendBasis === "seconds"
        ? `revision=${ctx.inputRevision}|crate=${crateSignature}|trials=${trials}|seconds=${ctx.getSelectedAutomationTargetSeconds()}`
        : `revision=${ctx.inputRevision}|crate=${crateSignature}|trials=${trials}|target=${target}`;
    };

    ctx.buildAutomationEstimateEntrySignature = function buildAutomationEstimateEntrySignature(
      panelInstance,
      entry,
      state,
      sharedSignature,
      skipThresholdOverrides
    ) {
      if (!entry?.key || !state) {
        return "";
      }
      const threshold = ctx.resolveAutomationSkipThreshold(panelInstance, entry.key, state, skipThresholdOverrides);
      const loadoutId = ctx.resolveAutomationRoomLoadoutId(panelInstance, entry.key, state);
      const effective = ctx.resolveAutomationEffectiveLevel(panelInstance, entry, state, null, {
        includePersonalBuffs: false
      });
      const roundedEffective = Math.round(effective * 100) / 100;
      return `${sharedSignature}|${entry.key}:${threshold}:${loadoutId}:${roundedEffective}`;
    };

    ctx.buildAutomationRecommendEntrySignature = function buildAutomationRecommendEntrySignature(
      panelInstance,
      entry,
      state,
      sharedSignature
    ) {
      if (!entry?.key || !state) {
        return "";
      }
      const loadoutId = ctx.resolveAutomationRoomLoadoutId(panelInstance, entry.key, state);
      const effective = ctx.resolveAutomationEffectiveLevel(panelInstance, entry, state, null, {
        includePersonalBuffs: false
      });
      const roundedEffective = Math.round(effective * 100) / 100;
      return `${sharedSignature}|${entry.key}:${loadoutId}:${roundedEffective}`;
    };

    ctx.captureAutomationInputSignatures = function (state, entries, panelInstance, mode) {
      const recommend = mode === "recommend";
      const shared = recommend
        ? ctx.buildAutomationRecommendSharedSignature(state, ctx.getSelectedAutomationTargetWinRate())
        : ctx.buildAutomationEstimateSharedSignature(state);
      const overrides = recommend ? null : ctx.buildAutomationSkipThresholdOverrideMap(entries);
      const signatures = new Map(
        entries.map((entry) => [
          entry.key,
          recommend
            ? ctx.buildAutomationRecommendEntrySignature(panelInstance, entry, state, shared)
            : ctx.buildAutomationEstimateEntrySignature(panelInstance, entry, state, shared, overrides)
        ])
      );
      if (recommend) ctx.automationRecommendSignatureByRoomTypeKey = signatures;
      else ctx.automationEstimateSignatureByRoomTypeKey = signatures;
    };

    ctx.renderAutomationEstimateTooltip = function renderAutomationEstimateTooltip(estimate) {
      if (!estimate || estimate.status !== "ready") {
        const tooltip = ctx.ensurePreviewTooltip();
        tooltip.textContent = "";
        const titleNode = document.createElement("div");
        titleNode.className = `${ctx.PREVIEW_TOOLTIP_CLASS}__title`;
        titleNode.textContent = String(estimate?.roomLabel || ctx.t("automationPreview"));
        tooltip.appendChild(titleNode);
        ctx.appendPreviewRow(tooltip, ctx.t("status"), String(estimate?.message || ctx.t("pending")));
        return tooltip;
      }

      const tooltip = estimate.detailPreview
        ? ctx.renderCellPreviewTooltip(estimate.detailPreview)
        : ctx.ensurePreviewTooltip();
      const hiddenLabels = new Set([
        ctx.t("combatTrials"),
        "Combat Trials",
        "战斗次数",
        ctx.t("successRate"),
        "胜率",
        "ETA",
        "耗时",
        ctx.t("tokenExpected"),
        "代币期望"
      ]);
      const hiddenLabelIncludes = ["Box Expected", "盒子期望", "盒期望", "紫盒期望", "宝箱期望"];
      const rows = Array.from(tooltip.querySelectorAll(`.${ctx.PREVIEW_TOOLTIP_CLASS}__row`));
      for (const row of rows) {
        const labelNode = row.querySelector(`.${ctx.PREVIEW_TOOLTIP_CLASS}__label`);
        const labelText = String(labelNode?.textContent || "").trim();
        if (!labelText) {
          continue;
        }
        if (hiddenLabels.has(labelText) || hiddenLabelIncludes.some((part) => labelText.includes(part))) {
          row.remove();
        }
      }
      if (!estimate.detailPreview) {
        tooltip.textContent = "";
        const titleNode = document.createElement("div");
        titleNode.className = `${ctx.PREVIEW_TOOLTIP_CLASS}__title`;
        titleNode.textContent = String(estimate.roomLabel || ctx.t("automationPreview"));
        tooltip.appendChild(titleNode);
      }
      ctx.appendPreviewRow(
        tooltip,
        ctx.t("level"),
        `Lv.${Math.max(1, Math.floor(ctx.finiteNumber(estimate.roomLevel, 1)))}`
      );
      if (!estimate.detailPreview && estimate.isCombat && estimate.failureReason) {
        ctx.appendPreviewRow(tooltip, ctx.t("failureReason"), String(estimate.failureReason));
      }
      return tooltip;
    };

    ctx.getAutomationEstimateFromCell = function getAutomationEstimateFromCell(cell) {
      if (!cell) {
        return null;
      }
      const roomTypeKey = String(cell.getAttribute("data-mwi-labyrinth-calc-auto-room-key") || "");
      if (!roomTypeKey) {
        return null;
      }
      return ctx.automationEstimateByRoomTypeKey.get(roomTypeKey) || null;
    };

    ctx.getAutomationRecommendFromCell = function getAutomationRecommendFromCell(cell) {
      if (!cell) {
        return null;
      }
      const roomTypeKey = String(cell.getAttribute("data-mwi-labyrinth-calc-auto-room-key") || "");
      if (!roomTypeKey) {
        return null;
      }
      return ctx.automationRecommendByRoomTypeKey.get(roomTypeKey) || null;
    };

    ctx.showAutomationEstimateTooltip = function showAutomationEstimateTooltip(cell, event) {
      const estimate = ctx.getAutomationEstimateFromCell(cell);
      if (!estimate) {
        ctx.hidePreviewTooltip();
        return;
      }
      const tooltip = ctx.renderAutomationEstimateTooltip(estimate);
      ctx.positionPreviewTooltip(tooltip, event.clientX, event.clientY);
    };

    ctx.showAutomationRecommendTooltip = function showAutomationRecommendTooltip(cell, event) {
      const estimate = ctx.getAutomationRecommendFromCell(cell);
      if (!estimate) {
        ctx.hidePreviewTooltip();
        return;
      }
      const tooltip = ctx.renderAutomationEstimateTooltip(estimate);
      ctx.positionPreviewTooltip(tooltip, event.clientX, event.clientY);
    };

    ctx.bindAutomationEstimateCellEvents = function bindAutomationEstimateCellEvents(cell) {
      if (!cell || cell[ctx.AUTOMATION_ESTIMATE_CELL_BOUND_FLAG]) {
        return;
      }
      cell[ctx.AUTOMATION_ESTIMATE_CELL_BOUND_FLAG] = true;
      ctx.listen(cell, "mouseenter", (event) => {
        ctx.showAutomationEstimateTooltip(cell, event);
      });
      ctx.listen(cell, "mousemove", (event) => {
        ctx.showAutomationEstimateTooltip(cell, event);
      });
      ctx.listen(cell, "mouseleave", () => {
        ctx.hidePreviewTooltip();
      });
      ctx.listen(cell, "contextmenu", (event) => {
        const roomTypeKey = String(cell.getAttribute("data-mwi-labyrinth-calc-auto-room-key") || "");
        if (!roomTypeKey) {
          return;
        }
        const estimate = ctx.getAutomationEstimateFromCell(cell);
        const entry = ctx.getAutomationRoomTypeEntryByKey(roomTypeKey);
        const isCombat = Boolean(estimate?.isCombat || entry?.isCombat);
        if (!isCombat) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        ctx.openCombatRoomSimulatorFromAutomationCell(cell);
      });
    };

    ctx.bindAutomationRecommendCellEvents = function bindAutomationRecommendCellEvents(cell) {
      if (!cell || cell[ctx.AUTOMATION_RECOMMEND_CELL_BOUND_FLAG]) {
        return;
      }
      cell[ctx.AUTOMATION_RECOMMEND_CELL_BOUND_FLAG] = true;
      ctx.listen(cell, "mouseenter", (event) => {
        ctx.showAutomationRecommendTooltip(cell, event);
      });
      ctx.listen(cell, "mousemove", (event) => {
        ctx.showAutomationRecommendTooltip(cell, event);
      });
      ctx.listen(cell, "mouseleave", () => {
        ctx.hidePreviewTooltip();
      });
      ctx.listen(cell, "contextmenu", (event) => {
        const roomTypeKey = String(cell.getAttribute("data-mwi-labyrinth-calc-auto-room-key") || "");
        if (!roomTypeKey) {
          return;
        }
        const recommend = ctx.getAutomationRecommendFromCell(cell);
        const entry = ctx.getAutomationRoomTypeEntryByKey(roomTypeKey);
        const isCombat = Boolean(recommend?.isCombat || entry?.isCombat);
        if (!isCombat) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        ctx.openCombatRoomSimulatorFromAutomationCell(cell);
      });
    };

    ctx.ensureAutomationMaxFloorHeader = function ensureAutomationMaxFloorHeader(table) {
      const headRow = table?.querySelector("thead tr");
      if (!headRow) {
        return;
      }
      if (headRow.querySelector(`.${ctx.AUTOMATION_MAX_FLOOR_TABLE_HEADER_CLASS}`)) {
        return;
      }
      const th = document.createElement("th");
      th.className = ctx.AUTOMATION_MAX_FLOOR_TABLE_HEADER_CLASS;
      th.textContent = ctx.t("maxFloor");
      const estimateHeader = headRow.querySelector(`.${ctx.AUTOMATION_ESTIMATE_TABLE_HEADER_CLASS}`);
      if (estimateHeader) {
        headRow.insertBefore(th, estimateHeader);
      } else {
        headRow.appendChild(th);
      }
    };

    ctx.ensureAutomationEstimateHeader = function ensureAutomationEstimateHeader(table) {
      const headRow = table?.querySelector("thead tr");
      if (!headRow) {
        return;
      }
      if (headRow.querySelector(`.${ctx.AUTOMATION_ESTIMATE_TABLE_HEADER_CLASS}`)) {
        return;
      }
      const th = document.createElement("th");
      th.className = ctx.AUTOMATION_ESTIMATE_TABLE_HEADER_CLASS;
      th.textContent = ctx.t("chanceEta");
      headRow.appendChild(th);
    };

    ctx.ensureAutomationRecommendHeader = function ensureAutomationRecommendHeader(table) {
      const headRow = table?.querySelector("thead tr");
      if (!headRow) {
        return;
      }
      const existingHeader = headRow.querySelector(`.${ctx.AUTOMATION_RECOMMEND_TABLE_HEADER_CLASS}`);
      if (existingHeader) {
        if (existingHeader.textContent !== ctx.t("recommendSettingLevel")) {
          existingHeader.textContent = ctx.t("recommendSettingLevel");
        }
        return;
      }
      const th = document.createElement("th");
      th.className = ctx.AUTOMATION_RECOMMEND_TABLE_HEADER_CLASS;
      th.textContent = ctx.t("recommendSettingLevel");
      headRow.appendChild(th);
    };

    ctx.updateAutomationSkipHeaderText = function updateAutomationSkipHeaderText(_table, _compact = false) {};

    ctx.removeAutomationEstimateColumn = function removeAutomationEstimateColumn(table) {
      if (!table) {
        return;
      }
      const floorHeader = table.querySelector(`thead th.${ctx.AUTOMATION_MAX_FLOOR_TABLE_HEADER_CLASS}`);
      if (floorHeader) {
        floorHeader.remove();
      }
      const header = table.querySelector(`thead th.${ctx.AUTOMATION_ESTIMATE_TABLE_HEADER_CLASS}`);
      if (header) {
        header.remove();
      }
      const floorCells = Array.from(table.querySelectorAll(`tbody td.${ctx.AUTOMATION_MAX_FLOOR_CELL_CLASS}`));
      for (const cell of floorCells) {
        cell.remove();
      }
      const cells = Array.from(table.querySelectorAll(`tbody td.${ctx.AUTOMATION_ESTIMATE_CELL_CLASS}`));
      for (const cell of cells) {
        cell.remove();
      }
    };

    ctx.removeAutomationRecommendColumn = function removeAutomationRecommendColumn(table) {
      if (!table) {
        return;
      }
      const header = table.querySelector(`thead th.${ctx.AUTOMATION_RECOMMEND_TABLE_HEADER_CLASS}`);
      if (header) {
        header.remove();
      }
      const cells = Array.from(table.querySelectorAll(`tbody td.${ctx.AUTOMATION_RECOMMEND_CELL_CLASS}`));
      for (const cell of cells) {
        cell.remove();
      }
    };

    ctx.getAutomationEstimateCellRenderToken = function getAutomationEstimateCellRenderToken(estimate) {
      if (!estimate) {
        return "none";
      }
      if (estimate.status !== "ready") {
        return `status:${String(estimate.status || "")}:${String(estimate.message || "")}`;
      }
      const roomLevel = Math.max(1, Math.floor(ctx.finiteNumber(estimate.roomLevel, 1)));
      const chancePercent = Math.round(ctx.clamp01(estimate.clearChance) * 100);
      const etaText = String(estimate.etaText || ctx.ETA_INFINITE_TEXT);
      return `ready:${roomLevel}:${chancePercent}:${etaText}`;
    };

    ctx.getAutomationMaxFloorText = function getAutomationMaxFloorText(estimate) {
      if (!estimate) {
        return "--";
      }
      if (String(estimate.status || "") === "skipped") {
        return ctx.t("skipRoom");
      }
      const roomLevel = ctx.finiteNumber(estimate?.roomLevel, NaN);
      if (!Number.isFinite(roomLevel) || roomLevel <= 0) {
        return ctx.t("skipRoom");
      }
      const floor = ctx.computeAutomationMaxFloorByRoomLevel(roomLevel);
      if (!Number.isFinite(floor) || floor < 1) {
        return ctx.t("skipRoom");
      }
      return String(floor);
    };

    ctx.upsertAutomationMaxFloorCellContent = function upsertAutomationMaxFloorCellContent(cell, estimate) {
      if (!cell) {
        return;
      }
      const nextText = ctx.getAutomationMaxFloorText(estimate);
      if (cell.textContent !== nextText) {
        cell.textContent = nextText;
      }
      cell.classList.add(ctx.AUTOMATION_MAX_FLOOR_CELL_CLASS);
      cell.removeAttribute("title");
    };

    ctx.upsertAutomationEstimateCellContent = function upsertAutomationEstimateCellContent(cell, estimate) {
      if (!cell) {
        return;
      }
      const nextToken = ctx.getAutomationEstimateCellRenderToken(estimate);
      const currentToken = String(cell.getAttribute(ctx.AUTOMATION_ESTIMATE_CELL_RENDER_TOKEN_ATTR) || "");
      if (currentToken === nextToken) {
        return;
      }
      cell.setAttribute(ctx.AUTOMATION_ESTIMATE_CELL_RENDER_TOKEN_ATTR, nextToken);
      cell.classList.add(ctx.AUTOMATION_ESTIMATE_CELL_CLASS);
      cell.removeAttribute("title");
      cell.textContent = "";

      const statusText = document.createElement("span");
      statusText.className = `${ctx.AUTOMATION_ESTIMATE_CELL_CLASS}__text`;

      if (!estimate) {
        statusText.textContent = "--";
        cell.appendChild(statusText);
        return;
      }

      if (estimate.status !== "ready") {
        statusText.textContent = String(estimate.message || ctx.t("pending"));
        cell.appendChild(statusText);
        return;
      }

      const chanceNode = document.createElement("span");
      chanceNode.className = ctx.AUTOMATION_ESTIMATE_CELL_CHANCE_CLASS;
      chanceNode.textContent = `${Math.round(ctx.clamp01(estimate.clearChance) * 100)}%`;

      const etaNode = document.createElement("span");
      etaNode.className = ctx.AUTOMATION_ESTIMATE_CELL_ETA_CLASS;
      const etaText = String(estimate.etaText || ctx.ETA_INFINITE_TEXT);
      etaNode.textContent = ` / ${etaText}`;
      const expectedSeconds = ctx.finiteNumber(estimate.expectedSeconds, Infinity);
      const etaIsDanger = etaText === ctx.ETA_INFINITE_TEXT || expectedSeconds > 999;
      chanceNode.classList.toggle(ctx.AUTOMATION_ESTIMATE_CELL_ETA_DANGER_CLASS, etaIsDanger);
      etaNode.classList.toggle(ctx.AUTOMATION_ESTIMATE_CELL_ETA_DANGER_CLASS, etaIsDanger);

      cell.appendChild(chanceNode);
      cell.appendChild(etaNode);
    };

    ctx.getAutomationRecommendCellRenderToken = function getAutomationRecommendCellRenderToken(estimate) {
      if (!estimate) {
        return "none";
      }
      if (estimate.status !== "ready") {
        return `status:${String(estimate.status || "")}:${String(estimate.message || "")}`;
      }
      const delta = Math.floor(ctx.finiteNumber(estimate.levelDelta, 0));
      const roomLevel = Math.max(1, Math.floor(ctx.finiteNumber(estimate.roomLevel, 1)));
      const chancePercent = Math.round(ctx.clamp01(ctx.finiteNumber(estimate.clearChance, 0)) * 1000) / 10;
      return `ready:${delta}:${roomLevel}:${chancePercent}`;
    };

    ctx.formatAutomationSignedDelta = function formatAutomationSignedDelta(value) {
      const n = Math.floor(ctx.finiteNumber(value, 0));
      if (n > 0) {
        return `+${n}`;
      }
      return String(n);
    };

    ctx.upsertAutomationRecommendCellContent = function upsertAutomationRecommendCellContent(cell, estimate) {
      if (!cell) {
        return;
      }
      const nextToken = ctx.getAutomationRecommendCellRenderToken(estimate);
      const currentToken = String(cell.getAttribute(ctx.AUTOMATION_RECOMMEND_CELL_RENDER_TOKEN_ATTR) || "");
      if (currentToken === nextToken) {
        return;
      }
      cell.setAttribute(ctx.AUTOMATION_RECOMMEND_CELL_RENDER_TOKEN_ATTR, nextToken);
      cell.classList.add(ctx.AUTOMATION_RECOMMEND_CELL_CLASS);
      cell.removeAttribute("title");
      cell.textContent = "";

      if (!estimate) {
        cell.textContent = "--";
        return;
      }
      if (estimate.status !== "ready") {
        cell.textContent = String(estimate.message || ctx.t("pending"));
        return;
      }
      const settingLevel = Math.floor(ctx.finiteNumber(estimate.levelDelta, 0)) + 1;
      cell.textContent = ctx.formatAutomationSignedDelta(settingLevel);
    };

    ctx.ensureAutomationEstimateControl = function ensureAutomationEstimateControl(section) {
      if (globalThis.MwiLabyrinthSidebar?.enabled) {
        section = globalThis.MwiLabyrinthSidebar.ensure(document).slots.recommendation;
        section.querySelector(".mwi-lab-sidebar-empty")?.remove();
      }
      if (!section) {
        return null;
      }
      let root = section.querySelector(`#${ctx.AUTOMATION_ESTIMATE_CONTROL_ID}`);
      if (
        root &&
        root.getAttribute(ctx.AUTOMATION_ESTIMATE_CONTROL_SCHEMA_ATTR) !==
          ctx.AUTOMATION_ESTIMATE_CONTROL_SCHEMA_VERSION
      ) {
        root.remove();
        root = null;
      }
      if (!root) {
        const initialTrials = ctx.loadAutomationCombatSimTrialsSetting();
        const initialTargetWinRate = ctx.loadAutomationTargetWinRateSetting();
        const initialTargetSeconds = ctx.loadAutomationTargetSecondsSetting();
        root = document.createElement("div");
        root.id = ctx.AUTOMATION_ESTIMATE_CONTROL_ID;
        root.className = ctx.AUTOMATION_ESTIMATE_CONTROL_CLASS;
        root.setAttribute(ctx.AUTOMATION_ESTIMATE_CONTROL_SCHEMA_ATTR, ctx.AUTOMATION_ESTIMATE_CONTROL_SCHEMA_VERSION);
        root.innerHTML = `
<div class="${ctx.AUTOMATION_ESTIMATE_CONTROL_CLASS}__settings">
  <span class="${ctx.AUTOMATION_ESTIMATE_CONTROL_CLASS}__settings-label">${ctx.t("combatTrials")}</span>
  <input type="number" class="${ctx.AUTOMATION_ESTIMATE_CONTROL_TRIALS_INPUT_CLASS}" min="${ctx.MIN_COMBAT_SIM_TRIALS}" max="${ctx.MAX_COMBAT_SIM_TRIALS}" step="1" value="${initialTrials}" inputmode="numeric" />
</div>
<button type="button" class="${ctx.AUTOMATION_ESTIMATE_CONTROL_CLASS}__button">${ctx.t("calcChance")}</button>
<span class="${ctx.AUTOMATION_ESTIMATE_CONTROL_CLASS}__break"></span>
<div class="${ctx.AUTOMATION_ESTIMATE_CONTROL_CLASS}__settings">
  <span class="${ctx.AUTOMATION_ESTIMATE_CONTROL_TARGET_RATE_LABEL_CLASS}">${ctx.t("targetWinRate")}</span>
  <input type="number" class="${ctx.AUTOMATION_ESTIMATE_CONTROL_TARGET_RATE_INPUT_CLASS}" min="0" max="100" step="0.1" value="${initialTargetWinRate}" inputmode="decimal" />
</div>
<button type="button" class="${ctx.AUTOMATION_ESTIMATE_CONTROL_CLASS}__button ${ctx.AUTOMATION_ESTIMATE_CONTROL_RECOMMEND_BUTTON_CLASS}">${ctx.t("recommendDelta")}</button>
<span class="${ctx.AUTOMATION_ESTIMATE_CONTROL_CLASS}__break"></span>
<div class="${ctx.AUTOMATION_ESTIMATE_CONTROL_CLASS}__settings">
  <span class="${ctx.AUTOMATION_ESTIMATE_CONTROL_TARGET_SECONDS_LABEL_CLASS}">${ctx.t("targetSeconds")}</span>
  <input type="number" class="${ctx.AUTOMATION_ESTIMATE_CONTROL_TARGET_SECONDS_INPUT_CLASS}" min="1" max="${ctx.MAX_AUTOMATION_TARGET_SECONDS}" step="1" value="${initialTargetSeconds}" title="${ctx.t("targetSecondsHint")}" inputmode="numeric" />
</div>
<button type="button" class="${ctx.AUTOMATION_ESTIMATE_CONTROL_CLASS}__button ${ctx.AUTOMATION_ESTIMATE_CONTROL_RECOMMEND_SECONDS_BUTTON_CLASS}">${ctx.t("recommendBySeconds")}</button>
<span class="${ctx.AUTOMATION_ESTIMATE_CONTROL_CLASS}__status">${ctx.t("pending")}</span>`;
        const table = ctx.getAutomationEstimateTable();
        let anchor = table;
        while (anchor && anchor.parentElement !== section) anchor = anchor.parentElement;
        section.insertBefore(root, anchor || null);
      }
      const settingsLabel = root.querySelector(`.${ctx.AUTOMATION_ESTIMATE_CONTROL_CLASS}__settings-label`);
      if (settingsLabel) {
        settingsLabel.textContent = ctx.t("combatTrials");
      }
      const targetRateLabel = root.querySelector(`.${ctx.AUTOMATION_ESTIMATE_CONTROL_TARGET_RATE_LABEL_CLASS}`);
      if (targetRateLabel) {
        targetRateLabel.textContent = ctx.t("targetWinRate");
      }
      const targetSecondsLabel = root.querySelector(`.${ctx.AUTOMATION_ESTIMATE_CONTROL_TARGET_SECONDS_LABEL_CLASS}`);
      if (targetSecondsLabel) {
        targetSecondsLabel.textContent = ctx.t("targetSeconds");
      }
      const statusNode = root.querySelector(`.${ctx.AUTOMATION_ESTIMATE_CONTROL_CLASS}__status`);
      if (statusNode && !String(statusNode.textContent || "").trim()) {
        statusNode.textContent = ctx.t("pending");
      }
      const button = root.querySelector(`.${ctx.AUTOMATION_ESTIMATE_CONTROL_CLASS}__button`);
      if (button && !button.dataset.bound) {
        button.dataset.bound = "1";
        ctx.listen(button, "click", () => {
          ctx.runAutomationEstimateCalculation();
        });
      }
      if (button) {
        button.textContent = ctx.t("calcChance");
      }
      const recommendButton = root.querySelector(`.${ctx.AUTOMATION_ESTIMATE_CONTROL_RECOMMEND_BUTTON_CLASS}`);
      if (recommendButton && !recommendButton.dataset.bound) {
        recommendButton.dataset.bound = "1";
        ctx.listen(recommendButton, "click", () => {
          ctx.runAutomationRecommendCalculation("winRate");
        });
      }
      if (recommendButton) {
        recommendButton.textContent = ctx.t("recommendDelta");
      }
      const recommendSecondsButton = root.querySelector(
        `.${ctx.AUTOMATION_ESTIMATE_CONTROL_RECOMMEND_SECONDS_BUTTON_CLASS}`
      );
      if (recommendSecondsButton && !recommendSecondsButton.dataset.bound) {
        recommendSecondsButton.dataset.bound = "1";
        ctx.listen(recommendSecondsButton, "click", () => {
          ctx.runAutomationRecommendCalculation("seconds");
        });
      }
      if (recommendSecondsButton) {
        recommendSecondsButton.textContent = ctx.t("recommendBySeconds");
      }
      const trialsInput = root.querySelector(`.${ctx.AUTOMATION_ESTIMATE_CONTROL_TRIALS_INPUT_CLASS}`);
      if (trialsInput && !trialsInput.dataset.bound) {
        trialsInput.dataset.bound = "1";
        trialsInput.value = String(ctx.loadAutomationCombatSimTrialsSetting());
        const syncTrials = (finalize = false) => {
          const raw = String(trialsInput.value ?? "").trim();
          if (!raw) {
            if (finalize) {
              const fallback = ctx.saveAutomationCombatSimTrialsSetting(ctx.DEFAULT_AUTOMATION_COMBAT_SIM_TRIALS);
              trialsInput.value = String(fallback);
            }
            return;
          }
          const parsed = Number(raw);
          if (!Number.isFinite(parsed)) {
            if (finalize) {
              const fallback = ctx.saveAutomationCombatSimTrialsSetting(ctx.DEFAULT_AUTOMATION_COMBAT_SIM_TRIALS);
              trialsInput.value = String(fallback);
            }
            return;
          }
          const normalized = ctx.saveAutomationCombatSimTrialsSetting(parsed);
          if (finalize || /^\d+$/.test(raw)) {
            trialsInput.value = String(normalized);
          }
        };
        ctx.listen(trialsInput, "input", () => {
          syncTrials(false);
        });
        ctx.listen(trialsInput, "change", () => {
          syncTrials(true);
        });
        ctx.listen(trialsInput, "blur", () => {
          syncTrials(true);
        });
      }
      const targetRateInput = root.querySelector(`.${ctx.AUTOMATION_ESTIMATE_CONTROL_TARGET_RATE_INPUT_CLASS}`);
      if (targetRateInput && !targetRateInput.dataset.bound) {
        targetRateInput.dataset.bound = "1";
        targetRateInput.value = String(ctx.loadAutomationTargetWinRateSetting());
        const syncTargetRate = (finalize = false) => {
          const raw = String(targetRateInput.value ?? "").trim();
          if (!raw) {
            if (finalize) {
              const fallback = ctx.saveAutomationTargetWinRateSetting(ctx.DEFAULT_AUTOMATION_TARGET_WIN_RATE);
              targetRateInput.value = String(fallback);
            }
            return;
          }
          const parsed = Number(raw);
          if (!Number.isFinite(parsed)) {
            if (finalize) {
              const fallback = ctx.saveAutomationTargetWinRateSetting(ctx.DEFAULT_AUTOMATION_TARGET_WIN_RATE);
              targetRateInput.value = String(fallback);
            }
            return;
          }
          const normalized = ctx.saveAutomationTargetWinRateSetting(parsed);
          if (finalize) {
            targetRateInput.value = String(normalized);
          }
        };
        ctx.listen(targetRateInput, "input", () => {
          syncTargetRate(false);
        });
        ctx.listen(targetRateInput, "change", () => {
          syncTargetRate(true);
        });
        ctx.listen(targetRateInput, "blur", () => {
          syncTargetRate(true);
        });
      }
      const targetSecondsInput = root.querySelector(`.${ctx.AUTOMATION_ESTIMATE_CONTROL_TARGET_SECONDS_INPUT_CLASS}`);
      if (targetSecondsInput && !targetSecondsInput.dataset.bound) {
        targetSecondsInput.dataset.bound = "1";
        targetSecondsInput.value = String(ctx.loadAutomationTargetSecondsSetting());
        // Typing saves valid values as is; leaving the field (or an empty / invalid value) normalises it.
        ctx.listen(targetSecondsInput, "input", () => {
          const raw = String(targetSecondsInput.value ?? "").trim();
          if (raw && Number.isFinite(Number(raw)) && Number(raw) > 0) {
            ctx.saveAutomationTargetSecondsSetting(Number(raw));
          }
        });
        const finalizeTargetSeconds = () => {
          const raw = String(targetSecondsInput.value ?? "").trim();
          targetSecondsInput.value = String(ctx.saveAutomationTargetSecondsSetting(raw === "" ? NaN : Number(raw)));
        };
        ctx.listen(targetSecondsInput, "change", finalizeTargetSeconds);
        ctx.listen(targetSecondsInput, "blur", finalizeTargetSeconds);
      }
      return root;
    };

    ctx.getAutomationEstimateTrialsInput = function getAutomationEstimateTrialsInput() {
      const root = document.getElementById(ctx.AUTOMATION_ESTIMATE_CONTROL_ID);
      if (!root) {
        return null;
      }
      return root.querySelector(`.${ctx.AUTOMATION_ESTIMATE_CONTROL_TRIALS_INPUT_CLASS}`);
    };

    ctx.getAutomationTargetWinRateInput = function getAutomationTargetWinRateInput() {
      const root = document.getElementById(ctx.AUTOMATION_ESTIMATE_CONTROL_ID);
      if (!root) {
        return null;
      }
      return root.querySelector(`.${ctx.AUTOMATION_ESTIMATE_CONTROL_TARGET_RATE_INPUT_CLASS}`);
    };

    ctx.getSelectedAutomationCombatTrials = function getSelectedAutomationCombatTrials() {
      const input = ctx.getAutomationEstimateTrialsInput();
      if (!input) {
        return ctx.loadAutomationCombatSimTrialsSetting();
      }
      const normalized = ctx.normalizeCombatSimTrials(Number(input.value));
      if (input.value !== String(normalized)) {
        input.value = String(normalized);
      }
      return normalized;
    };

    ctx.getSelectedAutomationTargetWinRate = function getSelectedAutomationTargetWinRate() {
      const input = ctx.getAutomationTargetWinRateInput();
      if (!input) {
        return ctx.loadAutomationTargetWinRateSetting();
      }
      const normalized = ctx.normalizeAutomationTargetWinRate(Number(input.value));
      if (input.value !== String(normalized)) {
        input.value = String(normalized);
      }
      return normalized;
    };

    ctx.getSelectedAutomationTargetSeconds = function getSelectedAutomationTargetSeconds() {
      const root = document.getElementById(ctx.AUTOMATION_ESTIMATE_CONTROL_ID);
      const input = root && root.querySelector(`.${ctx.AUTOMATION_ESTIMATE_CONTROL_TARGET_SECONDS_INPUT_CLASS}`);
      if (!input) {
        return ctx.loadAutomationTargetSecondsSetting();
      }
      const raw = String(input.value ?? "").trim();
      const normalized = ctx.normalizeAutomationTargetSeconds(raw === "" ? NaN : Number(raw));
      if (input.value !== String(normalized)) {
        input.value = String(normalized);
      }
      return normalized;
    };

    ctx.setAutomationEstimateControlStatus = function setAutomationEstimateControlStatus(status = {}) {
      if (ctx.destroyed) return;
      const root = document.getElementById(ctx.AUTOMATION_ESTIMATE_CONTROL_ID);
      if (!root) {
        return;
      }
      const button = root.querySelector(`.${ctx.AUTOMATION_ESTIMATE_CONTROL_CLASS}__button`);
      const recommendButton = root.querySelector(`.${ctx.AUTOMATION_ESTIMATE_CONTROL_RECOMMEND_BUTTON_CLASS}`);
      const text = root.querySelector(`.${ctx.AUTOMATION_ESTIMATE_CONTROL_CLASS}__status`);
      const trialsInput = root.querySelector(`.${ctx.AUTOMATION_ESTIMATE_CONTROL_TRIALS_INPUT_CLASS}`);
      const targetRateInput = root.querySelector(`.${ctx.AUTOMATION_ESTIMATE_CONTROL_TARGET_RATE_INPUT_CLASS}`);
      const targetSecondsInput = root.querySelector(`.${ctx.AUTOMATION_ESTIMATE_CONTROL_TARGET_SECONDS_INPUT_CLASS}`);
      const recommendSecondsButton = root.querySelector(
        `.${ctx.AUTOMATION_ESTIMATE_CONTROL_RECOMMEND_SECONDS_BUTTON_CLASS}`
      );
      if (button && Object.prototype.hasOwnProperty.call(status, "running")) {
        const running = Boolean(status.running);
        const runningMode = String(ctx.automationEstimateRunningMode || "");
        const nextCalcText = running && runningMode === "estimate" ? ctx.t("calculating") : ctx.t("calcChance");
        const recommendingBy = running && runningMode === "recommend" ? ctx.automationRecommendBasis : "";
        const nextRecommendText = recommendingBy === "winRate" ? ctx.t("calculating") : ctx.t("recommendDelta");
        const nextRecommendSecondsText =
          recommendingBy === "seconds" ? ctx.t("calculating") : ctx.t("recommendBySeconds");
        if (button.disabled !== running) {
          button.disabled = running;
        }
        if (recommendButton && recommendButton.disabled !== running) {
          recommendButton.disabled = running;
        }
        if (recommendSecondsButton && recommendSecondsButton.disabled !== running) {
          recommendSecondsButton.disabled = running;
        }
        if (trialsInput && trialsInput.disabled !== running) {
          trialsInput.disabled = running;
        }
        if (targetRateInput && targetRateInput.disabled !== running) {
          targetRateInput.disabled = running;
        }
        if (targetSecondsInput && targetSecondsInput.disabled !== running) {
          targetSecondsInput.disabled = running;
        }
        if (button.textContent !== nextCalcText) {
          button.textContent = nextCalcText;
        }
        if (recommendButton && recommendButton.textContent !== nextRecommendText) {
          recommendButton.textContent = nextRecommendText;
        }
        if (recommendSecondsButton && recommendSecondsButton.textContent !== nextRecommendSecondsText) {
          recommendSecondsButton.textContent = nextRecommendSecondsText;
        }
      }
      if (text && typeof status.message === "string" && text.textContent !== status.message) {
        text.textContent = status.message;
      }
    };

    ctx.renderAutomationEstimateTable = function renderAutomationEstimateTable(entries) {
      const table = ctx.getAutomationEstimateTable();
      if (!table) {
        return;
      }
      const showEstimateColumns = ctx.automationEstimateColumnEnabled;
      const showRecommendColumn = ctx.automationRecommendColumnEnabled;
      ctx.updateAutomationSkipHeaderText(table, showEstimateColumns || showRecommendColumn);

      if (!showEstimateColumns) {
        ctx.removeAutomationEstimateColumn(table);
      }
      if (!showRecommendColumn) {
        ctx.removeAutomationRecommendColumn(table);
      }
      if (!showEstimateColumns && !showRecommendColumn) {
        return;
      }
      if (!Array.isArray(entries) || entries.length === 0) {
        ctx.removeAutomationEstimateColumn(table);
        ctx.removeAutomationRecommendColumn(table);
        return;
      }

      const rowList = Array.from(table.querySelectorAll("tbody tr"));
      if (showEstimateColumns) {
        ctx.ensureAutomationMaxFloorHeader(table);
        ctx.ensureAutomationEstimateHeader(table);
        for (let i = 0; i < rowList.length; i += 1) {
          const row = rowList[i];
          const entry = entries[i] || null;
          const estimate = entry ? ctx.automationEstimateByRoomTypeKey.get(entry.key) || null : null;

          let estimateCell = row.querySelector(`td.${ctx.AUTOMATION_ESTIMATE_CELL_CLASS}`);
          let floorCell = row.querySelector(`td.${ctx.AUTOMATION_MAX_FLOOR_CELL_CLASS}`);
          if (!floorCell) {
            floorCell = document.createElement("td");
            floorCell.className = ctx.AUTOMATION_MAX_FLOOR_CELL_CLASS;
            if (estimateCell) {
              row.insertBefore(floorCell, estimateCell);
            } else {
              row.appendChild(floorCell);
            }
          }
          if (!estimateCell) {
            estimateCell = document.createElement("td");
            estimateCell.className = ctx.AUTOMATION_ESTIMATE_CELL_CLASS;
            row.appendChild(estimateCell);
          }
          ctx.upsertAutomationMaxFloorCellContent(floorCell, estimate);

          if (!entry) {
            if (estimateCell.getAttribute("data-mwi-labyrinth-calc-auto-room-key") !== "") {
              estimateCell.setAttribute("data-mwi-labyrinth-calc-auto-room-key", "");
            }
            ctx.upsertAutomationEstimateCellContent(estimateCell, null);
            continue;
          }
          if (estimateCell.getAttribute("data-mwi-labyrinth-calc-auto-room-key") !== entry.key) {
            estimateCell.setAttribute("data-mwi-labyrinth-calc-auto-room-key", entry.key);
          }
          ctx.bindAutomationEstimateCellEvents(estimateCell);
          ctx.upsertAutomationEstimateCellContent(estimateCell, estimate);
        }
      }

      if (showRecommendColumn) {
        ctx.ensureAutomationRecommendHeader(table);
        for (let i = 0; i < rowList.length; i += 1) {
          const row = rowList[i];
          const entry = entries[i] || null;
          const recommend = entry ? ctx.automationRecommendByRoomTypeKey.get(entry.key) || null : null;

          let recommendCell = row.querySelector(`td.${ctx.AUTOMATION_RECOMMEND_CELL_CLASS}`);
          if (!recommendCell) {
            recommendCell = document.createElement("td");
            recommendCell.className = ctx.AUTOMATION_RECOMMEND_CELL_CLASS;
            row.appendChild(recommendCell);
          }
          if (!entry) {
            if (recommendCell.getAttribute("data-mwi-labyrinth-calc-auto-room-key") !== "") {
              recommendCell.setAttribute("data-mwi-labyrinth-calc-auto-room-key", "");
            }
            ctx.upsertAutomationRecommendCellContent(recommendCell, null);
            continue;
          }
          if (recommendCell.getAttribute("data-mwi-labyrinth-calc-auto-room-key") !== entry.key) {
            recommendCell.setAttribute("data-mwi-labyrinth-calc-auto-room-key", entry.key);
          }
          ctx.bindAutomationRecommendCellEvents(recommendCell);
          ctx.upsertAutomationRecommendCellContent(recommendCell, recommend);
        }
      }
    };

    ctx.computeAutomationEntryClearChanceByRoomLevel = async function computeAutomationEntryClearChanceByRoomLevel(
      params,
      roomLevel
    ) {
      const safeRoomLevel = Math.max(1, Math.floor(ctx.finiteNumber(roomLevel, 1)));
      const room = ctx.createAutomationRoomFromEntry(params.entry, safeRoomLevel);
      const combatTrials = ctx.normalizeCombatSimTrials(
        params.entry?.isCombat ? params.recommendCombatTrials : params.combatTrials
      );
      const result = params.entry.isCombat
        ? await ctx.computeCombatRoomClearChance(
            params.state,
            params.initClientData,
            room,
            params.maxEnhancementByItem,
            null,
            combatTrials,
            `auto:recommend:${params.entry.key}:${safeRoomLevel}:target${Math.round(params.targetChance * 1000)}`,
            { includePersonalBuffs: false, parallel: true, labyrinthUpgradeLevels: params.labyrinthUpgradeLevels }
          )
        : ctx.computeRoomClearChance(params.state, params.initClientData, room, params.maxEnhancementByItem, {
            includePersonalBuffs: false,
            labyrinthUpgradeLevels: params.labyrinthUpgradeLevels
          });

      if (!result) {
        return null;
      }
      return {
        room,
        roomLevel: safeRoomLevel,
        clearChance: ctx.clamp01(ctx.finiteNumber(result.clearChance, 0)),
        result
      };
    };

    ctx.getAutomationRecommendStepByChanceDiff = function getAutomationRecommendStepByChanceDiff(chanceDiff) {
      const diffPercent = Math.abs(ctx.clamp01(ctx.finiteNumber(chanceDiff, 0))) * 100;
      if (diffPercent >= 70) {
        return 64;
      }
      if (diffPercent >= 55) {
        return 48;
      }
      if (diffPercent >= 40) {
        return 32;
      }
      if (diffPercent >= 25) {
        return 20;
      }
      if (diffPercent >= 15) {
        return 12;
      }
      if (diffPercent >= 8) {
        return 6;
      }
      if (diffPercent >= 4) {
        return 3;
      }
      if (diffPercent >= 2) {
        return 2;
      }
      return 1;
    };

    ctx.findAutomationRecommendedLevelDelta = async function findAutomationRecommendedLevelDelta(params) {
      const targetChance = ctx.clamp01(ctx.finiteNumber(params.targetChance, 0));
      const targetPercent = targetChance * 100;
      // Time mode (targetSeconds > 0): the target win rate is 0, only the expected clear time limits the level.
      const targetSeconds = Math.max(0, ctx.finiteNumber(params.targetSeconds, 0));
      // Expected clear time as shown in the table (seconds, failed runs included); Infinity if never cleared.
      const getSampleSeconds = (sample) => ctx.finiteNumber(sample?.result?.expectedSecondsPerClear, Infinity);
      const effectiveLevel = Math.max(0, ctx.finiteNumber(params.effectiveLevel, 0));
      const maxDelta = Math.max(0, Math.floor(ctx.AUTOMATION_RECOMMEND_MAX_DELTA));
      const isCombatEntry = Boolean(params?.entry?.isCombat);
      const minRoomLevel = isCombatEntry ? ctx.COMBAT_MIN_ROOM_LEVEL : 1;
      const minDelta = Math.min(
        -1,
        Math.max(Math.floor(ctx.AUTOMATION_RECOMMEND_MIN_DELTA), Math.ceil(minRoomLevel - effectiveLevel))
      );
      const evalCacheByDelta = new Map();
      let bestMatch = null;
      const getDisplayPercentFromChance = (chance) => {
        // Keep recommendation threshold aligned with "计算胜率" table display (integer percent).
        return Math.round(ctx.clamp01(ctx.finiteNumber(chance, 0)) * 100);
      };
      const isAtOrAboveTarget = (sample) => {
        if (!sample) {
          return false;
        }
        if ((sample.constraintChance ?? sample.clearChance) + 1e-12 < targetChance) {
          return false;
        }
        return targetSeconds <= 0 || getSampleSeconds(sample) <= targetSeconds;
      };
      const shouldValidateHighTarget = targetPercent >= 99;
      const upwardValidationMaxSteps = isCombatEntry ? 14 : 48;
      const upwardValidationFailStreak = isCombatEntry ? 5 : 14;
      const sweepUpwardForHighestPass = async (startDelta) => {
        let highestPassDelta = Math.max(
          minDelta,
          Math.min(maxDelta, Math.floor(ctx.finiteNumber(startDelta, minDelta)))
        );
        let failStreak = 0;
        let steps = 0;
        let probeDelta = highestPassDelta + 1;
        while (probeDelta <= maxDelta && steps < upwardValidationMaxSteps) {
          const sample = await evaluateDelta(probeDelta);
          steps += 1;
          if (isAtOrAboveTarget(sample)) {
            highestPassDelta = probeDelta;
            failStreak = 0;
          } else {
            failStreak += 1;
            if (failStreak >= upwardValidationFailStreak) {
              break;
            }
          }
          probeDelta += 1;
        }
        return highestPassDelta;
      };
      const getInitialProbeStep = (chanceDiff) => {
        const dynamicStep = Math.max(1, Math.floor(ctx.getAutomationRecommendStepByChanceDiff(chanceDiff)));
        const minStep = isCombatEntry ? 8 : 4;
        return Math.max(minStep, dynamicStep);
      };
      const getNextProbeStep = (currentStep, chanceDiff) => {
        const dynamicStep = Math.max(1, Math.floor(ctx.getAutomationRecommendStepByChanceDiff(chanceDiff)));
        const doubledStep = Math.max(1, currentStep * 2);
        const maxStep = isCombatEntry ? 96 : 64;
        return Math.max(dynamicStep, Math.min(maxStep, doubledStep));
      };

      const rememberBest = (sample) => {
        if (!sample || !isAtOrAboveTarget(sample)) return;
        if (!bestMatch || sample.levelDelta > bestMatch.levelDelta)
          bestMatch = {
            ...sample,
            displayChancePercent: getDisplayPercentFromChance(sample.clearChance),
            targetMet: true
          };
      };

      const revision = ctx.inputRevision,
        identity = ctx.storageIdentity();
      const evaluateDelta = async (rawDelta) => {
        if (
          ctx.destroyed ||
          ctx.automationStopRequested ||
          identity !== ctx.storageIdentity() ||
          revision !== ctx.inputRevision
        )
          throw new Error("计算已停止或输入已变化");
        const levelDelta = Math.max(minDelta, Math.min(maxDelta, Math.floor(ctx.finiteNumber(rawDelta, 0))));
        if (evalCacheByDelta.has(levelDelta)) {
          return evalCacheByDelta.get(levelDelta);
        }
        const roomLevel = Math.max(minRoomLevel, Math.floor(effectiveLevel + levelDelta));
        const computed = await ctx.computeAutomationEntryClearChanceByRoomLevel(params, roomLevel);
        const sample = computed
          ? {
              levelDelta,
              roomLevel,
              clearChance: computed.clearChance,
              constraintChance: params.entry.isCombat
                ? ctx.wilsonLower(computed.result?.combatMeta?.successes, computed.result?.combatMeta?.trials)
                : computed.clearChance,
              result: computed.result
            }
          : null;
        evalCacheByDelta.set(levelDelta, sample);
        rememberBest(sample);
        return sample;
      };

      const base = await evaluateDelta(0);
      if (!base) {
        return null;
      }

      if (isAtOrAboveTarget(base)) {
        // Find a [pass, fail] bracket quickly with exponential probing, then binary-search the highest pass level.
        let passDelta = 0;
        let failDelta = maxDelta + 1;
        let probeStep = getInitialProbeStep(base.clearChance - targetChance);
        let probeDelta = Math.min(maxDelta, passDelta + probeStep);

        while (probeDelta <= maxDelta) {
          const probeSample = await evaluateDelta(probeDelta);
          if (!probeSample) {
            failDelta = probeDelta;
            break;
          }
          if (isAtOrAboveTarget(probeSample)) {
            passDelta = probeDelta;
            if (passDelta >= maxDelta) {
              break;
            }
            probeStep = getNextProbeStep(probeStep, probeSample.clearChance - targetChance);
            probeDelta = Math.min(maxDelta, passDelta + probeStep);
            if (probeDelta <= passDelta) {
              break;
            }
            continue;
          }
          failDelta = probeDelta;
          break;
        }

        if (failDelta <= maxDelta) {
          while (failDelta - passDelta > 1) {
            const mid = Math.floor((passDelta + failDelta) / 2);
            const midSample = await evaluateDelta(mid);
            if (!midSample) {
              failDelta = mid;
              continue;
            }
            if (isAtOrAboveTarget(midSample)) {
              passDelta = mid;
            } else {
              failDelta = mid;
            }
          }
          await evaluateDelta(passDelta);
          await evaluateDelta(failDelta);
        } else {
          await evaluateDelta(passDelta);
          if (passDelta < maxDelta) {
            await evaluateDelta(maxDelta);
          }
        }
        if (shouldValidateHighTarget && passDelta < maxDelta) {
          passDelta = await sweepUpwardForHighestPass(passDelta);
          await evaluateDelta(passDelta);
        }
      } else {
        // Base is below target, probe downward quickly to find first pass, then binary-search the highest pass.
        let passDelta = minDelta - 1;
        let failDelta = 0;
        let probeStep = getInitialProbeStep(base.clearChance - targetChance);
        let probeDelta = Math.max(minDelta, failDelta - probeStep);

        while (probeDelta >= minDelta) {
          const probeSample = await evaluateDelta(probeDelta);
          if (!probeSample) {
            break;
          }
          if (isAtOrAboveTarget(probeSample)) {
            passDelta = probeDelta;
            break;
          }
          if (probeDelta === minDelta) {
            break;
          }
          failDelta = probeDelta;
          probeStep = getNextProbeStep(probeStep, probeSample.clearChance - targetChance);
          probeDelta = Math.max(minDelta, failDelta - probeStep);
          if (probeDelta >= failDelta) {
            break;
          }
        }

        if (passDelta >= minDelta) {
          while (failDelta - passDelta > 1) {
            const mid = Math.floor((passDelta + failDelta) / 2);
            const midSample = await evaluateDelta(mid);
            if (!midSample) {
              failDelta = mid;
              continue;
            }
            if (isAtOrAboveTarget(midSample)) {
              passDelta = mid;
            } else {
              failDelta = mid;
            }
          }
          await evaluateDelta(passDelta);
          await evaluateDelta(failDelta);
          if (shouldValidateHighTarget && passDelta < maxDelta) {
            passDelta = await sweepUpwardForHighestPass(passDelta);
            await evaluateDelta(passDelta);
          }
        } else {
          await evaluateDelta(failDelta);
          if (failDelta > minDelta) {
            await evaluateDelta(minDelta);
          }
        }
      }

      return bestMatch;
    };

    // One bounded set of row runners shares the adaptive Worker pool. A room's
    // dependent probes stay ordered; independent room types can run together.
    ctx.runAutomationEntries = async (entries, cancelled, task) => {
      let next = 0,
        finished = 0,
        failure = null;
      const lanes = Math.min(entries.length, ctx.getCombatParallelism());
      const run = async () => {
        while (!failure && !cancelled()) {
          const i = next++;
          if (i >= entries.length) return;
          try {
            await task(entries[i], i);
          } catch (error) {
            failure ||= error;
            return;
          }
          if (cancelled()) return;
          finished++;
          const pool = ctx.getCombatConcurrencyState();
          ctx.automationEstimateStatusText = ctx.isChineseUi()
            ? `已完成 ${finished}/${entries.length} 项${pool.active > 1 ? ` · ${pool.active} 路并行` : ""}`
            : `Completed ${finished}/${entries.length}${pool.active > 1 ? ` · ${pool.active} workers` : ""}`;
          ctx.setAutomationEstimateControlStatus({ running: true, message: ctx.automationEstimateStatusText });
          await ctx.nextFrame();
        }
      };
      await Promise.all(
        Array.from({ length: lanes }, () =>
          run().catch((error) => {
            failure ||= error;
          })
        )
      );
      if (failure) throw failure;
      return finished;
    };
    ctx.automationCancellationReason = (revision, identity, experienceRevision = null) => {
      if (ctx.destroyed) return "计算器已关闭";
      if (ctx.storageIdentity() !== identity) return "已切换角色";
      if (ctx.automationStopRequested) return "已手动停止";
      if (revision !== ctx.inputRevision) return "计算输入已变化";
      if (experienceRevision !== null && experienceRevision !== ctx.experienceRevision) return "经验目标已变化";
      return "";
    };
    ctx.finishAutomationStatus = (reason, completed, total, errors) => {
      ctx.automationEstimateStatusText = ctx.isChineseUi()
        ? reason
          ? `${reason}，已完成 ${completed}/${total} 项，结果已保留`
          : errors
            ? `已处理 ${completed}/${total} 项，${errors} 项失败，请查看对应行`
            : `计算完成 · ${completed}/${total} 项`
        : reason
          ? `Stopped: ${reason}; ${completed}/${total} completed, results kept`
          : errors
            ? `Processed ${completed}/${total}; ${errors} failed, see affected rows`
            : `Calculation complete · ${completed}/${total}`;
    };

    ctx.runAutomationRecommendCalculation = async function runAutomationRecommendCalculation(basis = "winRate") {
      if (ctx.automationEstimateRunning) {
        return;
      }
      ctx.automationEstimateRunningMode = "";
      let state = ctx.getGameState();
      const panelInstance = ctx.getLabyrinthPanelInstance();
      const table = ctx.getAutomationEstimateTable();
      if (!state?.characterLabyrinth || !table) {
        ctx.automationEstimateStatusText = ctx.t("automationListNotFound");
        ctx.setAutomationEstimateControlStatus({
          running: false,
          message: ctx.automationEstimateStatusText
        });
        return;
      }

      const entries = ctx.getAutomationRoomTypeEntries(panelInstance);
      if (!entries.length) {
        ctx.automationEstimateStatusText = ctx.t("noCalculableRooms");
        ctx.setAutomationEstimateControlStatus({
          running: false,
          message: ctx.automationEstimateStatusText
        });
        return;
      }

      ctx.automationRecommendBasis = basis;
      ctx.automationEstimateColumnEnabled = false;
      ctx.automationRecommendColumnEnabled = true;
      ctx.renderAutomationEstimateTable(entries);

      const initClientData = ctx.getInitClientData();
      if (!initClientData) {
        ctx.automationEstimateStatusText = ctx.t("missingClientData");
        ctx.setAutomationEstimateControlStatus({
          running: false,
          message: ctx.automationEstimateStatusText
        });
        return;
      }

      ctx.automationRunSnapshot = ctx.createAutomationRunSnapshot(state);
      state = ctx.automationRunSnapshot.state;
      ctx.automationStopRequested = false;
      const calculationRevision = ctx.inputRevision;
      ctx.automationEstimateRunning = true;
      ctx.automationEstimateRunningMode = "recommend";
      ctx.setAutomationEstimateControlStatus({
        running: true,
        message: ctx.t("preparing")
      });

      try {
        const maxEnhancementByItem = ctx.buildMaxEnhancementByItem(state);
        const recommendCombatTrials = ctx.getSelectedAutomationCombatTrials();
        const experienceTargets = basis === "experience" ? ctx.getExperienceTargets() : null;
        const experienceRevision = ctx.experienceRevision;
        const targetWinRate = ctx.saveAutomationTargetWinRateSetting(ctx.getSelectedAutomationTargetWinRate());
        const targetChance = basis === "seconds" ? 0 : ctx.clamp01(targetWinRate / 100);
        const targetSeconds =
          basis === "seconds" ? ctx.saveAutomationTargetSecondsSetting(ctx.getSelectedAutomationTargetSeconds()) : 0;
        ctx.captureAutomationInputSignatures(state, entries, panelInstance, "recommend");
        ctx.beginRecommendationSnapshot();
        let errorCount = 0;
        let processedCount = 0;
        const cancelled = () =>
          ctx.automationCancellationReason(
            calculationRevision,
            ctx.automationRunSnapshot?.identity,
            basis === "experience" ? experienceRevision : null
          );

        processedCount = await ctx.runAutomationEntries(entries, cancelled, async (entry, i) => {
          const roomLabel = ctx.getAutomationRoomLabel(entry, initClientData);
          const effectiveLevel = ctx.resolveAutomationEffectiveLevel(panelInstance, entry, state, initClientData, {
            includePersonalBuffs: false
          });

          try {
            if (basis === "experience" && experienceTargets[entry.key] === undefined) {
              ctx.automationRecommendByRoomTypeKey.set(entry.key, {
                status: "excluded",
                basis,
                roomLabel,
                isCombat: entry.isCombat,
                message: "-"
              });
              ctx.renderAutomationEstimateTable(entries);
              return;
            }
            const params = {
              state,
              initClientData,
              entry,
              maxEnhancementByItem,
              recommendCombatTrials,
              effectiveLevel,
              targetChance,
              targetSeconds,
              labyrinthUpgradeLevels: ctx.automationRunSnapshot?.labyrinthUpgradeLevels
            };
            const experienceAnalysis =
              basis === "experience"
                ? await ctx.findExperienceRecommendation({ ...params, targetExperience: experienceTargets[entry.key] })
                : null;
            const match =
              basis === "experience" ? experienceAnalysis.best : await ctx.findAutomationRecommendedLevelDelta(params);
            if (cancelled()) return;
            if (!match) {
              ctx.automationRecommendByRoomTypeKey.set(entry.key, {
                status: "error",
                basis,
                experienceAnalysis,
                roomLabel,
                isCombat: entry.isCombat,
                message:
                  basis === "experience"
                    ? ctx.isChineseUi()
                      ? "扫描范围内未达标"
                      : "No level in range exceeds goal"
                    : ctx.t("targetNotMet")
              });
            } else {
              const recommendedRoomLevel = Math.max(1, Math.floor(ctx.finiteNumber(match.roomLevel, 1)));
              const recommendedRoom = ctx.createAutomationRoomFromEntry(entry, recommendedRoomLevel);
              const detailPreview = entry.isCombat
                ? ctx.buildCombatPreview(state, recommendedRoom, initClientData, match.result)
                : match.result?.skillingPreview || null;
              ctx.automationRecommendByRoomTypeKey.set(entry.key, {
                status: "ready",
                basis,
                experienceAnalysis,
                roomLabel,
                isCombat: entry.isCombat,
                levelDelta: Math.floor(ctx.finiteNumber(match.levelDelta, 0)),
                roomLevel: recommendedRoomLevel,
                clearChance: ctx.clamp01(ctx.finiteNumber(match.clearChance, 0)),
                detailPreview,
                failureReason: String(match.result?.combatMeta?.failureReason || "")
              });
            }
          } catch (error) {
            if (cancelled()) return;
            errorCount++;
            console.error("[Lab Clear Rate] automation recommend failed:", error);
            ctx.automationRecommendByRoomTypeKey.set(entry.key, {
              status: "error",
              basis,
              roomLabel,
              isCombat: entry.isCombat,
              message: String(error?.message || ctx.t("calcFailed"))
            });
          }

          ctx.renderAutomationEstimateTable(entries);
          if ((i + 1) % 2 === 0) {
            await ctx.nextFrame();
          }
        });

        ctx.finishAutomationStatus(cancelled(), processedCount, entries.length, errorCount);
        ctx.setAutomationEstimateControlStatus({
          running: false,
          message: ctx.automationEstimateStatusText
        });
      } catch (error) {
        ctx.automationEstimateStatusText = `${ctx.t("calcFailed")}：${String(error?.message || error)}`;
      } finally {
        ctx.automationRunSnapshot = null;
        ctx.releaseIdleCombatWorkers();
        ctx.automationEstimateRunning = false;
        ctx.automationEstimateRunningMode = "";
        if (!ctx.destroyed) ctx.renderAutomationEstimateTable(entries);
        ctx.setAutomationEstimateControlStatus({
          running: false,
          message: ctx.automationEstimateStatusText
        });
      }
    };

    ctx.runAutomationEstimateCalculation = async function runAutomationEstimateCalculation() {
      if (ctx.automationEstimateRunning) {
        return;
      }
      ctx.automationEstimateRunningMode = "";
      let state = ctx.getGameState();
      const panelInstance = ctx.getLabyrinthPanelInstance();
      const table = ctx.getAutomationEstimateTable();
      if (!state?.characterLabyrinth || !table) {
        ctx.automationEstimateStatusText = ctx.t("automationListNotFound");
        ctx.setAutomationEstimateControlStatus({
          running: false,
          message: ctx.automationEstimateStatusText
        });
        return;
      }

      const entries = ctx.getAutomationRoomTypeEntries(panelInstance);
      if (!entries.length) {
        ctx.automationEstimateStatusText = ctx.t("noCalculableRooms");
        ctx.setAutomationEstimateControlStatus({
          running: false,
          message: ctx.automationEstimateStatusText
        });
        return;
      }

      ctx.automationRecommendColumnEnabled = false;
      ctx.automationEstimateColumnEnabled = true;
      ctx.hideSavedRecommendations();
      ctx.automationRecommendSignatureByRoomTypeKey.clear();
      ctx.renderAutomationEstimateTable(entries);

      const initClientData = ctx.getInitClientData();
      if (!initClientData) {
        ctx.automationEstimateStatusText = ctx.t("missingClientData");
        ctx.setAutomationEstimateControlStatus({
          running: false,
          message: ctx.automationEstimateStatusText
        });
        return;
      }

      ctx.automationRunSnapshot = ctx.createAutomationRunSnapshot(state);
      state = ctx.automationRunSnapshot.state;
      ctx.automationStopRequested = false;
      const calculationRevision = ctx.inputRevision;
      ctx.automationEstimateRunning = true;
      ctx.automationEstimateRunningMode = "estimate";
      ctx.setAutomationEstimateControlStatus({
        running: true,
        message: ctx.t("preparing")
      });

      try {
        const maxEnhancementByItem = ctx.buildMaxEnhancementByItem(state);
        const combatTrials = ctx.saveAutomationCombatSimTrialsSetting(ctx.getSelectedAutomationCombatTrials());
        const skipThresholdOverrides = ctx.buildAutomationSkipThresholdOverrideMap(entries);
        for (const entry of entries)
          skipThresholdOverrides.set(
            entry.key,
            ctx.resolveAutomationSkipThreshold(panelInstance, entry.key, state, skipThresholdOverrides)
          );
        ctx.captureAutomationInputSignatures(state, entries, panelInstance, "estimate");
        ctx.automationEstimateByRoomTypeKey.clear();
        let errorCount = 0;
        let processedCount = 0;
        const cancelled = () =>
          ctx.automationCancellationReason(calculationRevision, ctx.automationRunSnapshot?.identity, null);

        processedCount = await ctx.runAutomationEntries(entries, cancelled, async (entry, i) => {
          const roomLabel = ctx.getAutomationRoomLabel(entry, initClientData);
          const skipThreshold = ctx.resolveAutomationSkipThreshold(
            panelInstance,
            entry.key,
            state,
            skipThresholdOverrides
          );
          const effectiveLevel = ctx.resolveAutomationEffectiveLevel(panelInstance, entry, state, initClientData, {
            includePersonalBuffs: false
          });
          const roomLevel = ctx.computeAutomationTargetRoomLevel(effectiveLevel, skipThreshold);
          if (roomLevel < 1) {
            ctx.automationEstimateByRoomTypeKey.set(entry.key, {
              status: "skipped",
              roomLabel,
              roomLevel,
              isCombat: entry.isCombat,
              message: ctx.t("skipRoom")
            });

            ctx.renderAutomationEstimateTable(entries);
            if ((i + 1) % 2 === 0) {
              await ctx.nextFrame();
            }
            return;
          }
          const room = ctx.createAutomationRoomFromEntry(entry, roomLevel);

          try {
            const result = entry.isCombat
              ? await ctx.computeCombatRoomClearChance(
                  state,
                  initClientData,
                  room,
                  maxEnhancementByItem,
                  null,
                  combatTrials,
                  `auto:${entry.key}:${roomLevel}`,
                  {
                    includePersonalBuffs: false,
                    parallel: true,
                    labyrinthUpgradeLevels: ctx.automationRunSnapshot.labyrinthUpgradeLevels
                  }
                )
              : ctx.computeRoomClearChance(state, initClientData, room, maxEnhancementByItem, {
                  includePersonalBuffs: false,
                  labyrinthUpgradeLevels: ctx.automationRunSnapshot.labyrinthUpgradeLevels
                });

            if (cancelled()) return;
            if (!result) {
              errorCount++;
              ctx.automationEstimateByRoomTypeKey.set(entry.key, {
                status: "error",
                roomLabel,
                roomLevel,
                isCombat: entry.isCombat,
                message: ctx.t("calcFailed")
              });
            } else {
              const clearChance = ctx.clamp01(ctx.finiteNumber(result.clearChance, 0));
              const shownPercent = Math.round(clearChance * 100);
              const expectedSeconds = ctx.finiteNumber(result.expectedSecondsPerClear, Infinity);
              const etaText = ctx.formatEtaText(expectedSeconds, shownPercent);
              const detailPreview = entry.isCombat
                ? ctx.buildCombatPreview(state, room, initClientData, result)
                : result.skillingPreview || null;
              ctx.automationEstimateByRoomTypeKey.set(entry.key, {
                status: "ready",
                roomLabel,
                roomLevel,
                isCombat: entry.isCombat,
                clearChance,
                expectedSeconds,
                etaText,
                failureReason: String(result?.combatMeta?.failureReason || ""),
                combatTrials: entry.isCombat ? combatTrials : 0,
                detailPreview
              });
            }
          } catch (error) {
            if (cancelled()) return;
            errorCount++;
            console.error("[Lab Clear Rate] automation estimate failed:", error);
            ctx.automationEstimateByRoomTypeKey.set(entry.key, {
              status: "error",
              roomLabel,
              roomLevel,
              isCombat: entry.isCombat,
              message: String(error?.message || ctx.t("calcFailed"))
            });
          }

          ctx.renderAutomationEstimateTable(entries);
          if ((i + 1) % 2 === 0) {
            await ctx.nextFrame();
          }
        });

        ctx.finishAutomationStatus(cancelled(), processedCount, entries.length, errorCount);
        ctx.setAutomationEstimateControlStatus({
          running: false,
          message: ctx.automationEstimateStatusText
        });
      } catch (error) {
        ctx.automationEstimateStatusText = `${ctx.t("calcFailed")}：${String(error?.message || error)}`;
      } finally {
        ctx.automationRunSnapshot = null;
        ctx.releaseIdleCombatWorkers();
        ctx.automationEstimateRunning = false;
        ctx.automationEstimateRunningMode = "";
        ctx.setAutomationEstimateControlStatus({
          running: false,
          message: ctx.automationEstimateStatusText
        });
      }
    };

    ctx.refreshAutomationEstimatePanel = function refreshAutomationEstimatePanel() {
      const table = ctx.getAutomationEstimateTable();
      if (globalThis.MwiLabyrinthSidebar?.enabled)
        ctx.ensureAutomationEstimateControl(globalThis.MwiLabyrinthSidebar.ensure(document).slots.recommendation);
      if (!table) {
        ctx.clearAutomationWideLayout();
        return;
      }
      const panelInstance = ctx.getLabyrinthPanelInstance();
      const entries = ctx.getAutomationRoomTypeEntries(panelInstance);

      // Keep completed values until the player explicitly starts another calculation.
      // A changing native table or character input must not clear its last results.

      const section = ctx.getAutomationEstimateSection(table);
      ctx.applyAutomationWideLayout(section, table);
      ctx.ensureAutomationEstimateControl(section);
      ctx.setAutomationEstimateControlStatus({
        running: ctx.automationEstimateRunning,
        message: ctx.automationEstimateStatusText
      });
      ctx.renderAutomationEstimateTable(entries);
    };
  };
})(globalThis);
