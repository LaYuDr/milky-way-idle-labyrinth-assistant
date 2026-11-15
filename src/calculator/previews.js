// Adapted from 迷宫胜率计算器 1.6.0, dakonglong, MIT. See docs/THIRD_PARTY.md.
(function (root) {
  "use strict";
  root.MwiLabyrinthCalculatorModules ||= {};
  root.MwiLabyrinthCalculatorModules["previews"] = function (ctx) {
    let hideTimer = null;
    let hoveredCell = null;
    let renderedPreview = null;
    let moveFrame = null;
    let pointer = null;
    function cancelMove() {
      if (moveFrame !== null) ctx.window.cancelAnimationFrame(moveFrame);
      moveFrame = null;
    }
    function queueMove(cell, event) {
      pointer = { clientX: event.clientX, clientY: event.clientY };
      if (moveFrame !== null) return;
      moveFrame = ctx.window.requestAnimationFrame(() => {
        moveFrame = null;
        if (!ctx.destroyed && hoveredCell === cell) ctx.showSkillingPreviewTooltip(cell, pointer);
      });
    }
    // Game client monsterWeaknesses hints; do not infer weaknesses from resistance values.
    const weaknesses = {
      shadow_archer: ["刺击、劈砍近战", "Stab and slash melee"],
      pyre_hunter: ["劈砍、钝击近战", "Slash and smash melee"],
      frost_sniper: ["钝击、刺击近战", "Smash and stab melee"],
      siren: ["远程", "Ranged"],
      salamander: ["远程", "Ranged"],
      dryad: ["远程", "Ranged"],
      giant_scorpion: ["水系、自然系魔法", "Water and nature magic"],
      giant_mantis: ["自然系、火系魔法", "Nature and fire magic"],
      cyclops: ["火系、水系魔法", "Fire and water magic"],
      mimic: ["荆棘、反击", "Thorn and retaliation"]
    };
    ctx.getMonsterWeakness = (hrid) => {
      if (typeof hrid !== "string" || !hrid.startsWith("/monsters/")) return null;
      return weaknesses[hrid.slice("/monsters/".length)]?.[ctx.isChineseUi() ? 0 : 1] || null;
    };
    function cancelHide() {
      if (hideTimer !== null) ctx.window.clearTimeout(hideTimer);
      hideTimer = null;
    }
    function scheduleHide() {
      cancelMove();
      cancelHide();
      hideTimer = ctx.window.setTimeout(() => {
        const tooltip = ctx.getPreviewTooltip();
        if (!tooltip?.contains(document.activeElement)) ctx.hidePreviewTooltip();
      }, 160);
    }
    ctx.getPreviewTooltip = function getPreviewTooltip() {
      return document.getElementById(ctx.PREVIEW_TOOLTIP_ID);
    };

    ctx.ensurePreviewTooltip = function ensurePreviewTooltip() {
      let tooltip = ctx.getPreviewTooltip();
      if (tooltip) {
        return tooltip;
      }
      tooltip = document.createElement("div");
      tooltip.id = ctx.PREVIEW_TOOLTIP_ID;
      tooltip.className = ctx.PREVIEW_TOOLTIP_CLASS;
      ctx.listen(tooltip, "mouseenter", cancelHide);
      ctx.listen(tooltip, "mouseleave", scheduleHide);
      ctx.listen(tooltip, "focusin", cancelHide);
      ctx.listen(tooltip, "focusout", scheduleHide);
      document.body.appendChild(tooltip);
      return tooltip;
    };

    ctx.hidePreviewTooltip = function hidePreviewTooltip() {
      cancelHide();
      hoveredCell = null;
      renderedPreview = null;
      pointer = null;
      cancelMove();
      const tooltip = ctx.getPreviewTooltip();
      if (!tooltip) {
        return;
      }
      tooltip.style.display = "none";
      tooltip.style.left = "-9999px";
      tooltip.style.top = "-9999px";
      tooltip.textContent = "";
    };

    ctx.formatPreviewPercent = function formatPreviewPercent(value) {
      return `${(ctx.clamp01(value) * 100).toFixed(1)}%`;
    };

    ctx.formatPreviewDeltaPercent = function formatPreviewDeltaPercent(value, digits = 2) {
      if (!Number.isFinite(value)) {
        return "--";
      }
      const percent = Math.max(0, ctx.finiteNumber(value, 0)) * 100;
      return `+${percent.toFixed(Math.max(0, Math.floor(digits)))}%`;
    };

    ctx.computeEfficiencyDeltaForOneLessProgressUnit = function computeEfficiencyDeltaForOneLessProgressUnit(
      targetProgress,
      effectiveSkillLevel,
      currentEfficiencyBonus,
      neededUnits
    ) {
      const target = ctx.finiteNumber(targetProgress, 0);
      const skillLevel = ctx.finiteNumber(effectiveSkillLevel, 0);
      const efficiency = ctx.finiteNumber(currentEfficiencyBonus, 0);
      const units = Math.floor(ctx.finiteNumber(neededUnits, 0));
      if (!(target > 0) || !(skillLevel > 0) || units <= 1) {
        return null;
      }
      const requiredProgressPerSuccess = Math.ceil(target / (units - 1) - 1e-9);
      const requiredEfficiency = requiredProgressPerSuccess / skillLevel - 1;
      if (!Number.isFinite(requiredEfficiency)) {
        return null;
      }
      return Math.max(0, requiredEfficiency - efficiency);
    };

    ctx.computeActionSpeedDeltaForOneMoreAttempt = function computeActionSpeedDeltaForOneMoreAttempt(
      baseActionSeconds,
      currentActionSpeedBonus,
      attempts
    ) {
      const baseSeconds = ctx.finiteNumber(baseActionSeconds, 0);
      const speed = ctx.finiteNumber(currentActionSpeedBonus, 0);
      const currentAttempts = Math.max(0, Math.floor(ctx.finiteNumber(attempts, 0)));
      if (!(baseSeconds > 0)) {
        return null;
      }
      const requiredSpeed = (baseSeconds * (currentAttempts + 1)) / ctx.ROOM_DURATION_SECONDS - 1;
      if (!Number.isFinite(requiredSpeed)) {
        return null;
      }
      return Math.max(0, requiredSpeed - speed);
    };

    ctx.formatExpectedRewardCount = function formatExpectedRewardCount(value) {
      const n = Math.max(0, ctx.finiteNumber(value, 0));
      if (Math.abs(n - Math.round(n)) < 1e-9) {
        return `${Math.round(n)}`;
      }
      return n.toFixed(2).replace(/\.?0+$/, "");
    };

    ctx.getCurrentLabyrinthFloor = function getCurrentLabyrinthFloor(state) {
      const floor = Math.floor(ctx.finiteNumber(state?.characterLabyrinth?.currentFloor, 1));
      return Math.max(1, floor);
    };

    ctx.createRoomRewardPreview = function createRoomRewardPreview(state, room) {
      if (!room || !room.roomType) {
        return null;
      }
      const roomType = String(room.roomType || "");
      const floor = ctx.getCurrentLabyrinthFloor(state);
      const rows = [];

      if (roomType === ctx.LABYRINTH_COMBAT_ROOM_TYPE || roomType === ctx.LABYRINTH_SKILLING_ROOM_TYPE) {
        const tokenChance = Math.min(floor * 0.05, 0.5);
        const boxChance = Math.min(floor * 0.01, 0.1);
        const boxLabel =
          roomType === ctx.LABYRINTH_SKILLING_ROOM_TYPE ? ctx.t("skillingBoxExpected") : ctx.t("combatBoxExpected");
        rows.push({
          label: ctx.t("tokenExpected"),
          value: ctx.formatExpectedRewardCount(tokenChance)
        });
        rows.push({
          label: boxLabel,
          value: ctx.formatExpectedRewardCount(boxChance)
        });
      } else if (roomType === ctx.LABYRINTH_TREASURE_ROOM_TYPE) {
        const tokenCount = Math.min(floor, 10);
        const boxChance = Math.min(floor * 0.05, 0.5);
        rows.push({
          label: ctx.t("tokenExpected"),
          value: ctx.formatExpectedRewardCount(tokenCount)
        });
        rows.push({
          label: ctx.t("skillingBoxExpected"),
          value: ctx.formatExpectedRewardCount(boxChance)
        });
        rows.push({
          label: ctx.t("combatBoxExpected"),
          value: ctx.formatExpectedRewardCount(boxChance)
        });
      } else if (roomType === ctx.LABYRINTH_DESCEND_ROOM_TYPE) {
        const tokenCount = 5 * floor;
        const boxAverage = floor >= 4 ? (floor - 3) / 2 : 0;
        const refineAverage = floor >= 6 ? (floor - 4) / 2 : 0;
        rows.push({
          label: ctx.t("tokenExpected"),
          value: ctx.formatExpectedRewardCount(tokenCount)
        });
        rows.push({
          label: ctx.t("skillingBoxExpected"),
          value: ctx.formatExpectedRewardCount(boxAverage)
        });
        rows.push({
          label: ctx.t("combatBoxExpected"),
          value: ctx.formatExpectedRewardCount(boxAverage)
        });
        rows.push({
          label: ctx.t("refiningChestExpected"),
          value: ctx.formatExpectedRewardCount(refineAverage)
        });
      } else {
        return null;
      }

      return {
        floor,
        rows
      };
    };

    ctx.appendRewardPreviewRows = function appendRewardPreviewRows(tooltip, rewardPreview) {
      if (!tooltip || !rewardPreview || !Array.isArray(rewardPreview.rows) || rewardPreview.rows.length === 0) {
        return;
      }
      for (const row of rewardPreview.rows) {
        if (!row || !row.label) {
          continue;
        }
        ctx.appendPreviewRow(tooltip, String(row.label), String(row.value ?? "--"));
      }
    };

    ctx.getRoomPreviewTitle = function getRoomPreviewTitle(roomType) {
      const type = String(roomType || "");
      if (type === ctx.LABYRINTH_SKILLING_ROOM_TYPE) {
        return ctx.t("skillingRoomPreview");
      }
      if (type === ctx.LABYRINTH_COMBAT_ROOM_TYPE) {
        return ctx.t("combatRoomPreview");
      }
      if (type === ctx.LABYRINTH_TREASURE_ROOM_TYPE) {
        return ctx.t("treasureRoomPreview");
      }
      if (type === ctx.LABYRINTH_DESCEND_ROOM_TYPE) {
        return ctx.t("floorExitPreview");
      }
      return ctx.t("roomPreview");
    };

    ctx.buildRewardOnlyPreview = function buildRewardOnlyPreview(state, room) {
      const rewardPreview = ctx.createRoomRewardPreview(state, room);
      if (!rewardPreview) {
        return null;
      }
      return {
        type: "reward-only",
        title: ctx.getRoomPreviewTitle(room?.roomType),
        rewardPreview
      };
    };

    const floorExitCells = new WeakSet();
    ctx.getFloorExitCell = function getFloorExitCell(state) {
      const rows = state?.characterLabyrinth?.roomData;
      if (
        !Array.isArray(rows) ||
        rows.length < 2 ||
        !Array.isArray(rows[0]) ||
        rows[0].length !== rows.length ||
        !rows.every((row) => Array.isArray(row) && row.length === rows.length)
      )
        return null;
      const cells = ctx.findRoomGridCells(rows.length * rows.length);
      return cells.length === rows.length * rows.length ? cells.at(-1) : null;
    };
    ctx.buildFloorExitPreview = function buildFloorExitPreview(state) {
      const floor = state?.characterLabyrinth?.currentFloor;
      if (!Number.isSafeInteger(floor) || floor < 1) return null;
      return {
        type: "reward-only",
        title: ctx.t("floorRewardPreviewFmt", { floor }),
        rewardPreview: ctx.createRoomRewardPreview(state, { roomType: ctx.LABYRINTH_DESCEND_ROOM_TYPE })
      };
    };
    ctx.bindFloorExitPreview = function bindFloorExitPreview(state) {
      const cell = ctx.getFloorExitCell(state);
      if (!cell) return;
      // The visible exit flag exists before roomData reveals its roomType.
      floorExitCells.add(cell);
      ctx.bindSkillingPreviewEvents(cell);
    };

    ctx.formatPreviewDecimal = function formatPreviewDecimal(value, digits = 1) {
      const n = ctx.finiteNumber(value, 0);
      return n.toFixed(digits);
    };

    ctx.getEffectiveSkillingProgressPerSuccess = function getEffectiveSkillingProgressPerSuccess(workPower) {
      return Math.max(0, Math.floor(ctx.finiteNumber(workPower, 0)));
    };

    ctx.computeProgressPerSuccessForOneLessProgressUnit = function computeProgressPerSuccessForOneLessProgressUnit(
      targetProgress,
      neededUnits
    ) {
      const target = ctx.finiteNumber(targetProgress, 0);
      const units = Math.floor(ctx.finiteNumber(neededUnits, 0));
      if (!(target > 0) || units <= 1) {
        return null;
      }
      return Math.max(1, Math.ceil(target / (units - 1) - 1e-9));
    };

    ctx.formatSkillingWorkPowerWithEffectiveProgress = function formatSkillingWorkPowerWithEffectiveProgress(
      workPower,
      effectiveProgress
    ) {
      const raw = ctx.finiteNumber(workPower, 0);
      const effective = ctx.getEffectiveSkillingProgressPerSuccess(
        effectiveProgress === null || effectiveProgress === undefined ? raw : effectiveProgress
      );
      return String(effective);
    };

    ctx.formatPreviewInteger = function formatPreviewInteger(value) {
      return `${Math.round(ctx.finiteNumber(value, 0))}`;
    };

    ctx.formatPreviewExperience = function formatPreviewExperience(value) {
      const n = Math.max(0, ctx.finiteNumber(value, 0));
      if (Math.abs(n - Math.round(n)) < 1e-9) {
        return `${Math.round(n)}`;
      }
      return n.toFixed(1).replace(/\.0$/, "");
    };

    ctx.formatPreviewExperiencePerHourK = function formatPreviewExperiencePerHourK(value) {
      const n = Math.max(0, ctx.finiteNumber(value, 0));
      return `${(n / 1000).toFixed(1)} K/h`;
    };

    ctx.formatPreviewPercentValue = function formatPreviewPercentValue(value, digits = 0) {
      const percent = ctx.finiteNumber(value, 0) * 100;
      if (digits <= 0) {
        return `${Math.round(percent)}%`;
      }
      return `${percent.toFixed(digits)}%`;
    };

    ctx.getCombatStylePreviewLabel = function getCombatStylePreviewLabel(styleHrid) {
      switch (styleHrid) {
        case "/combat_styles/stab":
          return ctx.t("styleStab");
        case "/combat_styles/slash":
          return ctx.t("styleSlash");
        case "/combat_styles/smash":
          return ctx.t("styleSmash");
        case "/combat_styles/ranged":
          return ctx.t("styleRanged");
        case "/combat_styles/magic":
          return ctx.t("styleMagic");
        default:
          return ctx.t("unknown");
      }
    };

    ctx.getCombatStyleAccuracyLabel = function getCombatStyleAccuracyLabel(styleHrid) {
      const joiner = ctx.isChineseUi() ? "" : " ";
      return `${ctx.getCombatStylePreviewLabel(styleHrid)}${joiner}${ctx.t("accuracySuffix")}`;
    };

    ctx.getCombatStyleDamageLabel = function getCombatStyleDamageLabel(styleHrid) {
      const joiner = ctx.isChineseUi() ? "" : " ";
      return `${ctx.getCombatStylePreviewLabel(styleHrid)}${joiner}${ctx.t("damageSuffix")}`;
    };

    ctx.getCombatStyleEvasionLabel = function getCombatStyleEvasionLabel(styleHrid) {
      const joiner = ctx.isChineseUi() ? "" : " ";
      return `${ctx.getCombatStylePreviewLabel(styleHrid)}${joiner}${ctx.t("evasionSuffix")}`;
    };

    ctx.getDamageTypePreviewLabel = function getDamageTypePreviewLabel(damageTypeHrid) {
      switch (damageTypeHrid) {
        case "/damage_types/water":
          return ctx.t("water");
        case "/damage_types/nature":
          return ctx.t("nature");
        case "/damage_types/fire":
          return ctx.t("fire");
        case "/damage_types/physical":
          return ctx.t("physical");
        default:
          return ctx.t("unknown");
      }
    };

    ctx.getDamageTypeMitigationLabel = function getDamageTypeMitigationLabel(damageTypeHrid) {
      switch (damageTypeHrid) {
        case "/damage_types/water":
          return ctx.t("waterResistance");
        case "/damage_types/nature":
          return ctx.t("natureResistance");
        case "/damage_types/fire":
          return ctx.t("fireResistance");
        case "/damage_types/physical":
        default:
          return ctx.t("armor");
      }
    };

    ctx.appendPreviewRow = function appendPreviewRow(tooltip, label, value) {
      const row = document.createElement("div");
      row.className = `${ctx.PREVIEW_TOOLTIP_CLASS}__row`;

      const labelNode = document.createElement("span");
      labelNode.className = `${ctx.PREVIEW_TOOLTIP_CLASS}__label`;
      labelNode.textContent = label;

      const valueNode = document.createElement("span");
      valueNode.className = `${ctx.PREVIEW_TOOLTIP_CLASS}__value`;
      valueNode.textContent = value;

      row.appendChild(labelNode);
      row.appendChild(valueNode);
      tooltip.appendChild(row);
    };

    ctx.deriveCombatFailureReasonFromCounts = function deriveCombatFailureReasonFromCounts(
      totalFailures,
      failedByTimeout,
      failedByDeath
    ) {
      const failures = Math.max(0, Math.floor(ctx.finiteNumber(totalFailures, 0)));
      if (failures <= 0) {
        return "";
      }
      const timeoutCount = Math.max(0, Math.floor(ctx.finiteNumber(failedByTimeout, 0)));
      const deathCount = Math.max(0, Math.floor(ctx.finiteNumber(failedByDeath, 0)));
      if (deathCount > timeoutCount) {
        return ctx.t("failureDefense");
      }
      return ctx.t("failureDamage");
    };

    ctx.renderSkillingPreviewTooltip = function renderSkillingPreviewTooltip(preview) {
      const tooltip = ctx.ensurePreviewTooltip();
      tooltip.textContent = "";

      const titleNode = document.createElement("div");
      titleNode.className = `${ctx.PREVIEW_TOOLTIP_CLASS}__title`;
      titleNode.textContent =
        preview.type === "enhancing"
          ? ctx.isChineseUi()
            ? "强化试炼"
            : "Enhancing trial"
          : ctx.t("skillingRoomPreview");
      tooltip.appendChild(titleNode);

      if (preview.type === "enhancing") {
        ctx.appendPreviewRow(
          tooltip,
          ctx.t("targetEnhancement"),
          `+${Math.max(0, Math.floor(ctx.finiteNumber(preview.targetLevel, 0)))}`
        );
        ctx.appendPreviewRow(tooltip, ctx.t("successRate"), ctx.formatPreviewPercent(preview.successChance));
        ctx.appendPreviewRow(tooltip, ctx.t("doubleProgress"), ctx.formatPreviewPercent(preview.doubleChance));
        ctx.appendPreviewRow(
          tooltip,
          ctx.t("twoMinuteActions"),
          `${Math.max(0, Math.floor(ctx.finiteNumber(preview.attempts, 0)))}`
        );
        ctx.appendPreviewRow(
          tooltip,
          ctx.t("actionDuration"),
          `${ctx.formatPreviewDecimal(preview.actionSeconds, 2)}s`
        );
        ctx.appendPreviewRow(
          tooltip,
          ctx.t("experiencePerRoom"),
          ctx.formatPreviewExperience(preview.experiencePerRoom)
        );
        ctx.appendPreviewRow(
          tooltip,
          ctx.t("experiencePerHour"),
          ctx.formatPreviewExperiencePerHourK(preview.experiencePerHour)
        );
        ctx.appendPreviewRow(
          tooltip,
          ctx.t("needSpeedForOneMoreAction"),
          ctx.formatPreviewDeltaPercent(preview.speedDeltaForOneMoreAttempt, 2)
        );
        ctx.appendPreviewRow(
          tooltip,
          ctx.t("speedTierClearChance"),
          Number.isFinite(preview.speedTierClearChance) ? ctx.formatPreviewPercent(preview.speedTierClearChance) : "--"
        );
        ctx.appendPreviewRow(
          tooltip,
          ctx.t("nextLevelClearChance"),
          Number.isFinite(preview.nextLevelClearChance) ? ctx.formatPreviewPercent(preview.nextLevelClearChance) : "--"
        );
        if (Number.isFinite(preview.nextSkillingSuccessClearChance)) {
          ctx.appendPreviewRow(
            tooltip,
            ctx.t("nextSkillingSuccessClearChance"),
            ctx.formatPreviewPercent(preview.nextSkillingSuccessClearChance)
          );
        }
        if (Number.isFinite(preview.nextSkillingDoubleProgressClearChance)) {
          ctx.appendPreviewRow(
            tooltip,
            ctx.t("nextSkillingDoubleProgressClearChance"),
            ctx.formatPreviewPercent(preview.nextSkillingDoubleProgressClearChance)
          );
        }
      } else {
        ctx.appendPreviewRow(
          tooltip,
          ctx.t("workPower"),
          ctx.formatSkillingWorkPowerWithEffectiveProgress(preview.workPower, preview.effectiveProgressPerSuccess)
        );
        ctx.appendPreviewRow(tooltip, ctx.t("successRate"), ctx.formatPreviewPercent(preview.successChance));
        ctx.appendPreviewRow(tooltip, ctx.t("doubleProgress"), ctx.formatPreviewPercent(preview.doubleChance));
        ctx.appendPreviewRow(
          tooltip,
          ctx.t("twoMinuteActions"),
          `${Math.max(0, Math.floor(ctx.finiteNumber(preview.attempts, 0)))}`
        );
        ctx.appendPreviewRow(
          tooltip,
          ctx.t("actionDuration"),
          `${ctx.formatPreviewDecimal(preview.actionSeconds, 2)}s`
        );
        ctx.appendPreviewRow(
          tooltip,
          ctx.t("experiencePerRoom"),
          ctx.formatPreviewExperience(preview.experiencePerRoom)
        );
        ctx.appendPreviewRow(
          tooltip,
          ctx.t("experiencePerHour"),
          ctx.formatPreviewExperiencePerHourK(preview.experiencePerHour)
        );
        ctx.appendPreviewRow(
          tooltip,
          ctx.t("needEfficiencyForOneLessProgress"),
          preview.efficiencyDeltaForOneLessProgressUnit === null
            ? ctx.t("alreadyOptimal")
            : ctx.formatPreviewDeltaPercent(preview.efficiencyDeltaForOneLessProgressUnit, 2)
        );
        ctx.appendPreviewRow(
          tooltip,
          ctx.t("needSpeedForOneMoreAction"),
          ctx.formatPreviewDeltaPercent(preview.speedDeltaForOneMoreAttempt, 2)
        );
        ctx.appendPreviewRow(
          tooltip,
          ctx.t("nextLevelClearChance"),
          Number.isFinite(preview.nextLevelClearChance) ? ctx.formatPreviewPercent(preview.nextLevelClearChance) : "--"
        );
        ctx.appendPreviewRow(
          tooltip,
          ctx.t("efficiencyTierClearChance"),
          Number.isFinite(preview.efficiencyTierClearChance)
            ? ctx.formatPreviewPercent(preview.efficiencyTierClearChance)
            : ctx.t("alreadyOptimal")
        );
        ctx.appendPreviewRow(
          tooltip,
          ctx.t("speedTierClearChance"),
          Number.isFinite(preview.speedTierClearChance) ? ctx.formatPreviewPercent(preview.speedTierClearChance) : "--"
        );
        if (Number.isFinite(preview.nextSkillingSuccessClearChance)) {
          ctx.appendPreviewRow(
            tooltip,
            ctx.t("nextSkillingSuccessClearChance"),
            ctx.formatPreviewPercent(preview.nextSkillingSuccessClearChance)
          );
        }
        if (Number.isFinite(preview.nextSkillingDoubleProgressClearChance)) {
          ctx.appendPreviewRow(
            tooltip,
            ctx.t("nextSkillingDoubleProgressClearChance"),
            ctx.formatPreviewPercent(preview.nextSkillingDoubleProgressClearChance)
          );
        }
      }
      ctx.appendRewardPreviewRows(tooltip, preview.rewardPreview);

      return tooltip;
    };

    ctx.renderCombatPreviewTooltip = function renderCombatPreviewTooltip(preview) {
      const tooltip = ctx.ensurePreviewTooltip();
      tooltip.textContent = "";

      const titleNode = document.createElement("div");
      titleNode.className = `${ctx.PREVIEW_TOOLTIP_CLASS}__title`;
      titleNode.textContent = String(preview.monsterName || "--");
      tooltip.appendChild(titleNode);

      const weakness = ctx.getMonsterWeakness(preview.monsterHrid);
      if (weakness) {
        ctx.appendPreviewRow(tooltip, ctx.isChineseUi() ? "弱点" : "Weakness", weakness);
        tooltip.lastElementChild.classList.add("mwi-labyrinth-calc-preview-weakness");
      }
      ctx.appendPreviewRow(tooltip, ctx.t("combatStyle"), String(preview.styleLabel || "--"));
      ctx.appendPreviewRow(tooltip, ctx.t("damageType"), String(preview.damageTypeLabel || "--"));
      ctx.appendRewardPreviewRows(tooltip, preview.rewardPreview);
      ctx.appendPreviewRow(tooltip, ctx.t("operation"), ctx.t("rightClickOpenSimulator"));

      return tooltip;
    };

    ctx.renderRewardOnlyPreviewTooltip = function renderRewardOnlyPreviewTooltip(preview) {
      const tooltip = ctx.ensurePreviewTooltip();
      tooltip.textContent = "";

      const titleNode = document.createElement("div");
      titleNode.className = `${ctx.PREVIEW_TOOLTIP_CLASS}__title`;
      titleNode.textContent = String(preview?.title || ctx.t("roomPreview"));
      tooltip.appendChild(titleNode);

      ctx.appendRewardPreviewRows(tooltip, preview?.rewardPreview || null);
      return tooltip;
    };

    ctx.buildCombatPreview = function buildCombatPreview(state, room, initClientData, result = null) {
      if (!room || room.roomType !== ctx.LABYRINTH_COMBAT_ROOM_TYPE || !room.monsterHrid) {
        return null;
      }
      const monster = initClientData?.combatMonsterDetailMap?.[room.monsterHrid];
      const baseDetails = monster?.combatDetails;
      if (!baseDetails || !baseDetails.combatStats) {
        return null;
      }

      const scaledTemplate = ctx.createMonsterCombatTemplate(initClientData, room);
      const details = scaledTemplate?.combatDetails || baseDetails;
      const stats = details.combatStats || baseDetails.combatStats;
      const roomLevel = ctx.positiveNumber(room?.recommendedLevel, ctx.positiveNumber(baseDetails.combatLevel, 100));
      const combatLevel = Math.max(1, Math.floor(roomLevel));
      const baseCombatLevel = ctx.positiveNumber(baseDetails.combatLevel, combatLevel);
      const abilityLevelScale = roomLevel / Math.max(1, baseCombatLevel);
      const styleHrid = ctx.getCombatStyleHrid(stats);
      const damageTypeHrid = ctx.getDamageTypeHrid(stats);
      const loadoutWeaponMeta = ctx.getLoadoutWeaponCombatMetaForRoom(state, initClientData, room);
      const currentPlayerCombatStats = state?.combatUnit?.combatDetails?.combatStats || null;
      const targetStyleHrid = loadoutWeaponMeta?.styleHrid || ctx.getCombatStyleHrid(currentPlayerCombatStats);
      const targetDamageTypeHrid = loadoutWeaponMeta?.damageTypeHrid || ctx.getDamageTypeHrid(currentPlayerCombatStats);
      const rewardPreview = ctx.createRoomRewardPreview(state, room);
      const attackIntervalNs = ctx.positiveNumber(
        details.attackInterval || stats.attackInterval,
        ctx.COMBAT_ONE_SECOND_NS
      );
      const abilityMap = initClientData?.abilityDetailMap || {};
      const abilities = [];
      if (Array.isArray(monster?.abilities)) {
        for (const rawAbility of monster.abilities) {
          if (!rawAbility || !rawAbility.abilityHrid) {
            continue;
          }
          const abilityHrid = String(rawAbility.abilityHrid);
          const abilityDetail =
            ctx.getAbilityDetailByHrid(state, initClientData, abilityHrid) ||
            ctx.getContainerValue(abilityMap, abilityHrid);
          const fallbackName = abilityHrid.split("/").pop() || abilityHrid;
          const localizedName = ctx.isChineseUi() ? ctx.LABYRINTH_ABILITY_NAME_ZH_MAP[abilityHrid] : "";
          const baseAbilityLevel = ctx.positiveNumber(rawAbility.level, 1);
          abilities.push({
            level: Math.max(1, Math.round(baseAbilityLevel * abilityLevelScale)),
            name: String(localizedName || abilityDetail?.name || fallbackName)
          });
        }
      }

      return {
        type: "combat",
        monsterHrid: room.monsterHrid,
        combatExperience: result?.combatExperience,
        experiencePerHour: result?.experiencePerHour,
        experiencePerRoom: result?.experiencePerRoom,
        clearChance: result?.clearChance,
        expectedSecondsPerClear: result?.expectedSecondsPerClear,
        monsterName: String(
          (ctx.isChineseUi() &&
            (ctx.LABYRINTH_MONSTER_NAME_ZH_BY_TAIL[
              String(room.monsterHrid || "")
                .split("/")
                .pop() || ""
            ] ||
              ctx.LABYRINTH_MONSTER_NAME_ZH_MAP[room.monsterHrid])) ||
            monster?.name ||
            room.monsterHrid.split("/").pop() ||
            room.monsterHrid
        ),
        baseCombatLevel: combatLevel,
        styleLabel: ctx.getCombatStylePreviewLabel(styleHrid),
        damageTypeLabel: ctx.getDamageTypePreviewLabel(damageTypeHrid),
        attackIntervalSeconds: attackIntervalNs / ctx.COMBAT_ONE_SECOND_NS,
        totalCastSpeed: ctx.finiteNumber(details.totalCastSpeed, ctx.finiteNumber(baseDetails.totalCastSpeed, 0)),
        styleAccuracyLabel: ctx.getCombatStyleAccuracyLabel(styleHrid),
        styleDamageLabel: ctx.getCombatStyleDamageLabel(styleHrid),
        maxHitpoints: ctx.positiveNumber(details.maxHitpoints, 1),
        maxManapoints: ctx.positiveNumber(details.maxManapoints, 1),
        styleAccuracy: ctx.getAccuracyRating(details, styleHrid),
        styleDamage: ctx.getMaxDamage(details, styleHrid),
        defensiveMaxDamage: ctx.positiveNumber(details.defensiveMaxDamage, 0),
        targetEvasionLabel: ctx.getCombatStyleEvasionLabel(targetStyleHrid),
        targetEvasionRating: ctx.getEvasionRating(details, targetStyleHrid),
        targetMitigationLabel: ctx.getDamageTypeMitigationLabel(targetDamageTypeHrid),
        targetMitigationValue: ctx.getResistance(details, targetDamageTypeHrid),
        totalThreat: ctx.positiveNumber(details.totalThreat, 100),
        rewardPreview,
        failureReason: String(result?.combatMeta?.failureReason || ""),
        combatModelSignature: result?.combatMeta?.modelSignature || null,
        abilities
      };
    };

    ctx.getLoadoutWeaponCombatMetaForRoom = function getLoadoutWeaponCombatMetaForRoom(state, initClientData, room) {
      const loadoutInfo = ctx.resolveCombatRoomLoadout(state, room);
      const loadout = loadoutInfo?.loadout;
      if (!ctx.isCombatLoadout(loadout)) {
        return null;
      }
      const wearableMap = loadout.wearableMap || {};
      const weaponSlots = ["/item_locations/two_hand", "/item_locations/main_hand"];
      let styleHrid = "";
      let damageTypeHrid = "";
      for (const slotKey of weaponSlots) {
        const entry = ctx.parseWearableReference(wearableMap[slotKey]);
        if (!entry || !entry.itemHrid) {
          continue;
        }
        const itemDetail = ctx.getItemDetailByHrid(state, initClientData, entry.itemHrid);
        const baseStats = itemDetail?.equipmentDetail?.combatStats || {};
        if (!styleHrid) {
          if (Array.isArray(baseStats.combatStyleHrids) && baseStats.combatStyleHrids.length > 0) {
            styleHrid = String(baseStats.combatStyleHrids[0] || "");
          } else if (typeof baseStats.combatStyleHrid === "string" && baseStats.combatStyleHrid) {
            styleHrid = baseStats.combatStyleHrid;
          }
        }
        if (!damageTypeHrid && typeof baseStats.damageType === "string" && baseStats.damageType) {
          damageTypeHrid = baseStats.damageType;
        }
        if (styleHrid && damageTypeHrid) {
          break;
        }
      }
      if (!styleHrid && !damageTypeHrid) {
        return null;
      }
      return {
        styleHrid,
        damageTypeHrid
      };
    };

    ctx.getCellPreview = function getCellPreview(cell) {
      if (!cell) {
        return null;
      }
      if (floorExitCells.has(cell)) {
        const state = ctx.getGameState();
        return ctx.getFloorExitCell(state) === cell ? ctx.buildFloorExitPreview(state) : null;
      }
      const combatPreview = ctx.combatPreviewByCell.get(cell);
      if (combatPreview) {
        return combatPreview;
      }
      return ctx.skillingPreviewByCell.get(cell) || null;
    };

    ctx.renderCellPreviewTooltip = function renderCellPreviewTooltip(preview) {
      if (preview?.type === "combat") {
        return ctx.renderCombatPreviewTooltip(preview);
      }
      if (preview?.type === "reward-only") {
        return ctx.renderRewardOnlyPreviewTooltip(preview);
      }
      return ctx.renderSkillingPreviewTooltip(preview);
    };

    ctx.positionPreviewTooltip = function positionPreviewTooltip(tooltip, x, y) {
      const offset = 12;
      const margin = 8;
      tooltip.style.display = "block";
      tooltip.style.maxHeight = `${Math.max(32, ctx.window.innerHeight - margin * 2)}px`;
      const width = tooltip.offsetWidth || 180;
      let height = tooltip.offsetHeight || 100;
      const fitsRight = x + offset + width + margin <= ctx.window.innerWidth;
      const fitsLeft = x - offset - width >= margin;
      let left = fitsRight ? x + offset : fitsLeft ? x - width - offset : margin;
      let top = y + offset;
      if (!fitsRight && !fitsLeft) {
        // On narrow screens keep the scrollable panel above/below the pointer,
        // so opening it never intercepts the room under the user's mouse.
        const below = ctx.window.innerHeight - y - offset - margin;
        const above = y - offset - margin;
        tooltip.style.maxHeight = `${Math.max(32, Math.max(below, above))}px`;
        height = tooltip.offsetHeight || height;
        top = below >= above ? y + offset : y - height - offset;
      } else if (top + height + margin > ctx.window.innerHeight) {
        top = Math.max(margin, y - height - offset);
      }
      const scrollable =
        tooltip.scrollHeight > tooltip.clientHeight + 1 || tooltip.scrollWidth > tooltip.clientWidth + 1;
      tooltip.dataset.scrollable = String(scrollable);
      if (scrollable) tooltip.setAttribute("tabindex", "0");
      else tooltip.removeAttribute("tabindex");
      tooltip.style.left = `${Math.max(margin, Math.min(left, ctx.window.innerWidth - width - margin))}px`;
      tooltip.style.top = `${Math.max(margin, Math.min(top, ctx.window.innerHeight - height - margin))}px`;
    };

    ctx.showSkillingPreviewTooltip = function showSkillingPreviewTooltip(cell, event) {
      cancelHide();
      const preview = ctx.getCellPreview(cell);
      if (!preview) {
        ctx.hidePreviewTooltip();
        return;
      }
      const scrollTop = hoveredCell === cell ? ctx.getPreviewTooltip()?.scrollTop || 0 : 0;
      hoveredCell = cell;
      const existing = ctx.getPreviewTooltip();
      const tooltip =
        renderedPreview === preview && existing?.childElementCount ? existing : ctx.renderCellPreviewTooltip(preview);
      renderedPreview = preview;
      pointer = { clientX: event.clientX, clientY: event.clientY };
      ctx.positionPreviewTooltip(tooltip, event.clientX, event.clientY);
      tooltip.scrollTop = scrollTop;
    };

    ctx.bindSkillingPreviewEvents = function bindSkillingPreviewEvents(cell) {
      if (!cell || cell[ctx.PREVIEW_CELL_BOUND_FLAG]) {
        return;
      }
      cell[ctx.PREVIEW_CELL_BOUND_FLAG] = true;
      ctx.listen(cell, "mouseenter", (event) => {
        cancelMove();
        renderedPreview = null;
        ctx.showSkillingPreviewTooltip(cell, event);
      });
      ctx.listen(cell, "mousemove", (event) => {
        queueMove(cell, event);
      });
      ctx.listen(cell, "mouseleave", scheduleHide);
      ctx.listen(cell, "contextmenu", (event) => {
        const preview = ctx.getCellPreview(cell);
        const room = preview?.type === "combat" ? null : ctx.getRoomFromCell(ctx.getGameState(), cell);
        if (preview?.type !== "combat" && (room?.roomType !== ctx.LABYRINTH_COMBAT_ROOM_TYPE || !room?.monsterHrid)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        ctx.openCombatRoomSimulatorFromCell(cell);
      });
    };

    ctx.setCellSkillingPreview = function setCellSkillingPreview(cell, preview) {
      if (!cell || !preview) {
        return;
      }
      ctx.bindSkillingPreviewEvents(cell);
      ctx.skillingPreviewByCell.set(cell, preview);
      if (hoveredCell === cell && pointer) queueMove(cell, pointer);
    };

    ctx.setCellCombatPreview = function setCellCombatPreview(cell, preview) {
      if (!cell || !preview) {
        return;
      }
      ctx.bindSkillingPreviewEvents(cell);
      ctx.combatPreviewByCell.set(cell, preview);
      if (hoveredCell === cell && pointer) queueMove(cell, pointer);
    };

    ctx.clearCellSkillingPreview = function clearCellSkillingPreview(cell) {
      if (!cell) {
        return;
      }
      ctx.skillingPreviewByCell.delete(cell);
    };

    ctx.clearCellCombatPreview = function clearCellCombatPreview(cell) {
      if (!cell) {
        return;
      }
      ctx.combatPreviewByCell.delete(cell);
    };
  };
})(globalThis);
