(function (root) {
  "use strict";
  root.MwiLabyrinthCalculatorModules.experience = function (ctx) {
    const storageKey = "mwi-labyrinth:calculator:experience-targets:v1";
    const formId = "mwi-labyrinth-calc-experience-goals";
    const buttonClass = "mwi-labyrinth-calc-experience-recommend";
    const scanStorageKey = "mwi-labyrinth:calculator:experience-scan:v1";
    const sessions = new Map();
    const skills = ctx.LABYRINTH_AUTOMATION_SKILL_ROOM_TYPES;
    const rooms = [
      ...skills.map((entry) => ({ ...entry, isCombat: false })),
      ...ctx.LABYRINTH_AUTOMATION_COMBAT_ROOM_TYPES.map((entry) => ({ ...entry, isCombat: true }))
    ];
    const keys = new Set(rooms.map((entry) => entry.key));
    const text = (zh, en) => (ctx.isChineseUi() ? zh : en);
    let owner = null,
      targets = {},
      settings = null;
    ctx.experienceRevision = 0;
    ctx.normalizeExperienceTarget = (value) => {
      if (value === null || value === undefined || String(value).trim() === "") return null;
      const n = Number(value);
      return Number.isFinite(n) && n >= 0 ? n : null;
    };
    // Keep persisted goals and calculations in EXP/hour; only the input uses K/h.
    ctx.experienceInputToTarget = (value) => {
      const n = ctx.normalizeExperienceTarget(value);
      return n === null ? null : ctx.normalizeExperienceTarget(n * 1000);
    };
    ctx.experienceTargetToInput = (value) => {
      const n = ctx.normalizeExperienceTarget(value);
      return n === null ? "" : String(n / 1000);
    };
    ctx.getExperienceTargets = () => {
      const identity = ctx.storageIdentity();
      if (owner !== identity) {
        owner = identity;
        targets = {};
        if (sessions.has(owner)) settings = sessions.get(owner);
        else {
          settings = { targets, mode: "quick", targetsDirty: false, modeDirty: false };
          try {
            const saved = JSON.parse(ctx.storage.getItem(storageKey) || "{}");
            for (const key of keys) {
              const n = ctx.normalizeExperienceTarget(saved?.[key]);
              if (n !== null) targets[key] = n;
            }
          } catch {
            /* Invalid saved goals are treated as unset. */
          }
          settings.mode = ctx.storage.getItem(scanStorageKey) === "full" ? "full" : "quick";
          sessions.set(owner, settings);
        }
        targets = settings.targets;
        ctx.experienceStorageError = settings.targetsDirty || settings.modeDirty;
        ctx.experienceRevision++;
      }
      return { ...targets };
    };
    ctx.persistExperienceSettings = () => {
      ctx.getExperienceTargets();
      for (const [key, flag, raw] of [
        [storageKey, "targetsDirty", JSON.stringify(targets)],
        [scanStorageKey, "modeDirty", settings.mode]
      ]) {
        if (!settings[flag]) continue;
        try {
          if (!owner) continue;
          ctx.storage.setItem(key, raw, owner);
          settings[flag] = ctx.storage.getItem(key, owner) !== raw;
        } catch {
          /* Keep this character's edits in memory for retry. */
        }
      }
      ctx.experienceStorageError = settings.targetsDirty || settings.modeDirty;
      ctx.refreshExperienceSettingsStatus();
      return !ctx.experienceStorageError;
    };
    ctx.getExperienceScanMode = () => {
      ctx.getExperienceTargets();
      return settings.mode;
    };
    ctx.saveExperienceScanMode = (mode) => {
      ctx.getExperienceTargets();
      settings.mode = mode === "full" ? "full" : "quick";
      settings.modeDirty = true;
      ctx.experienceRevision++;
      ctx.persistExperienceSettings();
    };
    ctx.refreshExperienceSettingsStatus = () => {
      if (typeof document === "undefined" || ctx.destroyed) return;
      const form = document.getElementById(formId);
      if (!form || !settings) return;
      const warning = form.querySelector("[data-experience-save-error]");
      if (warning) warning.hidden = !ctx.experienceStorageError;
      const mode = form.querySelector("[data-experience-full-scan]");
      if (mode) mode.checked = settings.mode === "full";
      const note = form.querySelector("[data-experience-scan-note]");
      if (note) {
        const content =
          settings.mode === "full"
            ? text(
                "战斗：检查当前扫描范围内的全部等级，耗时较长。",
                "Combat: check every level in the search range; takes longer."
              )
            : text(
                "战斗：连续六级未达标即停止，可能漏掉后续达标等级。",
                "Combat: stop after six misses in a row; later qualifying levels may be missed."
              );
        if (note.textContent !== content) note.textContent = content;
      }
    };
    ctx.saveExperienceTarget = (key, value) => {
      ctx.getExperienceTargets();
      if (!keys.has(key)) return;
      const n = ctx.normalizeExperienceTarget(value);
      if (n === null) delete targets[key];
      else targets[key] = n;
      settings.targetsDirty = true;
      ctx.persistExperienceSettings();
      ctx.experienceRevision++;
    };
    ctx.formatExperienceRate = (value) => ctx.formatPreviewExperiencePerHourK(value);
    // Read live progress when opening a preview; room-result caches deliberately ignore XP gains.
    ctx.getNextLevelTime = (skillId) => {
      const key = String(skillId || "").replace(/^\/skills\//, "");
      if (!keys.has(key)) return null;
      const target = ctx.getExperienceTargets()[key];
      if (!Number.isFinite(target) || target <= 0) return null;
      const skillMap = ctx.getGameState()?.characterSkillMap;
      const hrid = `/skills/${key}`;
      const level = ctx.getSkillLevel(skillMap, hrid);
      const experience = ctx.getSkillExperienceValue(skillMap, hrid);
      const table = ctx.getInitClientData()?.levelExperienceTable;
      const start = table?.[level],
        next = table?.[level + 1];
      if (
        !Number.isSafeInteger(level) ||
        level < 1 ||
        !Number.isFinite(experience) ||
        !Number.isFinite(start) ||
        start < 0 ||
        !Number.isFinite(next) ||
        next <= start ||
        experience < start ||
        experience >= next
      )
        return null;
      const remaining = next - experience;
      const hours = remaining / target;
      return Number.isFinite(hours) && hours > 0 ? { remaining, target, hours } : null;
    };
    ctx.formatNextLevelTime = (hours) => {
      if (!Number.isFinite(hours) || hours <= 0) return "—";
      if (hours < 1 / 60) return text("<1 分钟", "<1 min");
      if (hours < 1) return `${Math.ceil(hours * 60)} ${text("分钟", "min")}`;
      return `${hours.toFixed(1)} ${text("小时", "h")}`;
    };
    // Copy only calculation data, not the React component state or methods.
    ctx.createAutomationRunSnapshot = (state) => ({
      identity: ctx.storageIdentity(),
      labyrinthUpgradeLevels: structuredClone(ctx.resolveLabyrinthUpgradeLevels()),
      state: structuredClone(
        Object.fromEntries(
          [
            "characterSkillMap",
            "characterLoadoutDict",
            "characterSetting",
            "characterLabyrinth",
            "characterItemMap",
            "characterItemByLocationMap",
            "characterAbilityMap",
            "abilityCombatTriggersDict",
            "characterHouseRoomDict",
            "characterAchievementMap",
            "characterGuildBuffDict",
            "abilityDetailDict",
            "itemDetailDict",
            "abilitySlotsLevelRequirementList",
            "labyrinthRoomProgress",
            "labyrinthBattleMonsters",
            "equipmentActionTypeBuffsDict",
            "skillingActionTypeBuffsDict",
            "consumableActionTypeBuffsDict",
            "personalActionTypeBuffsDict",
            "communityActionTypeBuffsDict",
            "houseActionTypeBuffsDict",
            "achievementActionTypeBuffsDict",
            "mooPassActionTypeBuffsDict"
          ]
            .map((key) => [key, state[key]])
            .concat([
              ["character", state.character ? { combatLevel: state.character.combatLevel } : undefined],
              [
                "combatUnit",
                state.combatUnit
                  ? { combatLevel: state.combatUnit.combatLevel, combatDetails: state.combatUnit.combatDetails }
                  : undefined
              ]
            ])
        )
      )
    });
    ctx.findExperienceRecommendation = async (params) => {
      const scanMode = ctx.getExperienceScanMode();
      const revision = ctx.inputRevision,
        experienceRevision = ctx.experienceRevision,
        identity = ctx.storageIdentity();
      const effective = params.effectiveLevel;
      if (!Number.isFinite(effective) || effective < 0) throw new Error("缺少有效技能等级");
      const maxLevel = Math.max(1, Math.floor(effective + ctx.AUTOMATION_RECOMMEND_MAX_DELTA));
      const baseLevel = params.entry.isCombat
        ? ctx.getAutomationCombatBaseLevel(params.state)
        : ctx.getSkillLevel(params.state?.characterSkillMap, params.entry.skillHrid);
      const minLevel = Math.max(1, Math.floor(Number(baseLevel) || 1));
      const concurrency = params.entry.isCombat ? ctx.getCombatParallelism() : 1;
      const clearStatsCache = new Map();
      const ordinaryLife = !params.entry.isCombat && params.entry.skillHrid !== "/skills/enhancing";
      const analysis = await root.MwiLabyrinthExperiencePolicy.scan({
        minLevel,
        maxLevel: Math.max(minLevel, maxLevel),
        concurrency,
        tailLevels: params.entry.isCombat && scanMode === "quick" ? 5 : null,
        // With frozen inputs, increasing level cannot increase clear probability
        // or decrease unconditional attempt duration. Reward is linear in level.
        // Therefore rate(L) * max/L bounds every remaining ordinary life level,
        // including rebounds within an integer progress tier. No binary search.
        futureUpperBound: ordinaryLife ? (sample, level, max) => sample.experiencePerHour * (max / level) : null,
        onProgress: ({ completed, level }) => {
          if (!ctx.automationEstimateRunning) return;
          ctx.automationEstimateStatusText = `${ctx.getAutomationRoomLabel(params.entry, params.initClientData)} · Lv.${level} · ${completed} ${text("级", "levels")}${concurrency > 1 ? ` · ${ctx.getCombatConcurrencyState().limit} ${text("路并行上限", "worker limit")}` : ""}`;
          ctx.setAutomationEstimateControlStatus({ running: true, message: ctx.automationEstimateStatusText });
        },
        target: params.targetExperience,
        cancelled: () =>
          ctx.destroyed ||
          ctx.automationStopRequested ||
          identity !== ctx.storageIdentity() ||
          revision !== ctx.inputRevision ||
          experienceRevision !== ctx.experienceRevision,

        yieldControl: ctx.nextFrame,
        evaluate: async (roomLevel) => {
          const room = ctx.createAutomationRoomFromEntry(params.entry, roomLevel);
          if (!params.entry.isCombat)
            return ctx.computeRoomClearChance(params.state, params.initClientData, room, params.maxEnhancementByItem, {
              includePersonalBuffs: false,
              labyrinthUpgradeLevels: params.labyrinthUpgradeLevels,
              summaryOnly: true,
              clearStatsCache
            });
          const result = await ctx.computeCombatRoomClearChance(
            params.state,
            params.initClientData,
            room,
            params.maxEnhancementByItem,
            null,
            params.recommendCombatTrials,
            `auto:experience:${params.entry.key}:${roomLevel}`,
            {
              includePersonalBuffs: false,
              seed: 173,
              reuseSimulation: true,
              parallel: true,
              labyrinthUpgradeLevels: params.labyrinthUpgradeLevels
            }
          );
          return { clearChance: result?.clearChance, experiencePerHour: result?.experiencePerHour, result };
        }
      });
      analysis.scanMode = params.entry.isCombat ? scanMode : "full";
      if (analysis.best) {
        if (!params.entry.isCombat) {
          const room = ctx.createAutomationRoomFromEntry(params.entry, analysis.best.roomLevel);
          analysis.best.result = ctx.computeRoomClearChance(
            params.state,
            params.initClientData,
            room,
            params.maxEnhancementByItem,
            { includePersonalBuffs: false, labyrinthUpgradeLevels: params.labyrinthUpgradeLevels }
          );
        }
        analysis.best.levelDelta = Math.floor(analysis.best.roomLevel - effective);
      }
      return analysis;
    };

    const signature = ctx.buildAutomationRecommendSharedSignature;
    ctx.buildAutomationRecommendSharedSignature = (state, targetRate) => {
      const base = signature(state, targetRate);
      return ctx.automationRecommendBasis === "experience"
        ? `${ctx.buildAutomationEstimateSharedSignature(state)}|experience=${JSON.stringify(ctx.getExperienceTargets())}`
        : base;
    };
    const ensure = ctx.ensureAutomationEstimateControl;
    ctx.ensureAutomationEstimateControl = (section) => {
      const control = ensure(section);
      if (!control) return control;
      let form = control.querySelector(`#${formId}`);
      if (!form) {
        const row = document.createElement("div");
        row.className = "mwi-labyrinth-calc-experience-actions";
        const button = document.createElement("button");
        button.type = "button";
        button.className = buttonClass;
        button.textContent = text("按经验效率推荐", "Recommend by EXP/hour");
        ctx.listen(button, "click", () => ctx.runAutomationRecommendCalculation("experience"));
        row.append(button);
        form = document.createElement("section");
        form.id = formId;
        const summary = document.createElement("h4");
        summary.id = `${formId}-title`;
        form.setAttribute("aria-labelledby", summary.id);
        summary.textContent = text("经验目标 · K/h", "EXP goals · K/h");
        const grid = document.createElement("div");
        grid.className = "mwi-labyrinth-calc-experience-inputs";
        const lifeHeading = document.createElement("div");
        lifeHeading.className = "mwi-labyrinth-calc-life-goals-heading";
        lifeHeading.textContent = text("生活项目", "Life skills");
        grid.append(lifeHeading);
        for (const entry of rooms) {
          if (entry === rooms[skills.length]) {
            const heading = document.createElement("div");
            heading.className = "mwi-labyrinth-calc-combat-goals-heading";
            heading.textContent = text("战斗项目 · 七项技能总经验", "Combat rooms · total EXP across seven skills");
            heading.title = text(
              "每个候选等级使用设置的战斗场数，经验效率包含失败和入场耗时。",
              "Each level uses the configured battle count; EXP/hour includes failures and entry time."
            );
            grid.append(heading);
          }
          const label = document.createElement("label"),
            name = document.createElement("span"),
            input = document.createElement("input");
          const skillName = entry.isCombat
            ? ctx.getAutomationRoomLabel(entry, ctx.getInitClientData())
            : ctx.getSkillNameByHrid(entry.skillHrid);
          name.textContent = skillName;
          name.className = "mwi-labyrinth-calc-experience-skill";
          const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          icon.setAttribute("aria-hidden", "true");
          icon.setAttribute("focusable", "false");
          icon.classList.add("mwi-labyrinth-calc-experience-icon");
          icon.style.display = "none";
          const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
          if (entry.isCombat) use.dataset.monster = entry.key;
          else use.dataset.skill = entry.key;
          use.setAttribute("width", "100%");
          use.setAttribute("height", "100%");
          icon.append(use);
          name.prepend(icon);
          input.type = "number";
          input.min = "0";
          input.step = "any";
          input.placeholder = text("未设置", "Not set");
          input.inputMode = "decimal";
          input.dataset.skill = entry.key;
          input.setAttribute("aria-label", `${skillName} ${text("目标经验", "target EXP")} (K/h)`);
          ctx.listen(input, "input", () => {
            const target = ctx.experienceInputToTarget(input.value);
            ctx.saveExperienceTarget(entry.key, target);
            input.setCustomValidity(
              input.validity.badInput || (input.value && target === null)
                ? text("请输入不小于 0 的有效数值（K/h）", "Enter a valid nonnegative amount in K/h")
                : ""
            );
          });
          label.append(name, input);
          grid.append(label);
        }
        const scanLabel = document.createElement("label");
        scanLabel.className = "mwi-labyrinth-calc-experience-scan";
        const scan = document.createElement("input");
        scan.type = "checkbox";
        scan.dataset.experienceFullScan = "";
        const caption = document.createElement("span");
        caption.textContent = text("完整扫描战斗等级", "Scan all combat levels");
        scanLabel.append(scan, caption);
        ctx.listen(scan, "change", () => ctx.saveExperienceScanMode(scan.checked ? "full" : "quick"));
        const note = document.createElement("p");
        note.dataset.experienceScanNote = "";
        note.id = `${formId}-scan-note`;
        note.className = "mwi-labyrinth-calc-experience-note";
        scan.setAttribute("aria-describedby", note.id);
        const warning = document.createElement("div");
        warning.dataset.experienceSaveError = "";
        warning.className = "mwi-labyrinth-calc-experience-save-error";
        warning.setAttribute("role", "status");
        warning.hidden = true;
        const message = document.createElement("span");
        message.textContent = text(
          "没能保存经验设置。本次修改仍在，请重试并暂勿关闭页面。",
          "Could not save EXP settings. Your edits remain here; retry before closing this page."
        );
        const retry = document.createElement("button");
        retry.type = "button";
        retry.textContent = text("重试保存", "Retry save");
        ctx.listen(retry, "click", ctx.persistExperienceSettings);
        warning.append(message, retry);
        form.append(summary, scanLabel, note, warning, grid);
        control.append(row, form);
      }
      // Reuse native sprite URLs, without hard-coding versioned asset names.
      for (const [kind, pattern] of [
        ["skill", /\/skills_sprite[^/#]*\.svg#/],
        ["monster", /\/combat_monsters_sprite[^/#]*\.svg#/]
      ]) {
        const nativeIcon = [...document.querySelectorAll("svg use")].find((node) => {
          const href = node.getAttribute("href") || node.getAttribute("xlink:href") || "";
          return !form.contains(node) && pattern.test(href);
        });
        if (!nativeIcon) continue;
        const href = nativeIcon.getAttribute("href") || nativeIcon.getAttribute("xlink:href");
        const base = href.slice(0, href.indexOf("#"));
        for (const use of form.querySelectorAll(`use[data-${kind}]`)) {
          const next = `${base}#${use.dataset[kind]}`;
          if (use.getAttribute("href") !== next) use.setAttribute("href", next);
          use.parentElement.style.removeProperty("display");
        }
      }
      const current = ctx.getExperienceTargets();
      if (form.dataset.character !== ctx.storageIdentity()) {
        form.dataset.character = ctx.storageIdentity();
        for (const input of form.querySelectorAll("input[data-skill]"))
          input.value = ctx.experienceTargetToInput(current[input.dataset.skill]);
      }
      ctx.refreshExperienceSettingsStatus();
      return control;
    };
    const status = ctx.setAutomationEstimateControlStatus;
    ctx.setAutomationEstimateControlStatus = (value = {}) => {
      status(value);
      if (ctx.destroyed) return;
      const control = document.getElementById(ctx.AUTOMATION_ESTIMATE_CONTROL_ID);
      if (!control) return;
      const running = Object.hasOwn(value, "running") ? !!value.running : ctx.automationEstimateRunning;
      for (const input of control.querySelectorAll(`.${buttonClass}, #${formId} input`)) input.disabled = running;
      const button = control.querySelector(`.${buttonClass}`);
      if (button)
        button.textContent =
          running && ctx.automationRecommendBasis === "experience" && ctx.automationEstimateRunningMode === "recommend"
            ? ctx.t("calculating")
            : text("按经验效率推荐", "Recommend by EXP/hour");
    };
    const cellContent = ctx.upsertAutomationRecommendCellContent;
    ctx.upsertAutomationRecommendCellContent = (cell, estimate) => {
      if (!cell || estimate?.basis !== "experience") return cellContent(cell, estimate);
      const a = estimate.experienceAnalysis;
      const token = JSON.stringify([
        "experience",
        estimate.status,
        estimate.message,
        estimate.levelDelta,
        a?.target,
        a?.ranges,
        a?.peak?.experiencePerHour,
        a?.best?.experiencePerHour,
        a?.minLevel,
        a?.maxLevel,
        a?.stopReason,
        a?.scanMode
      ]);
      if (cell.getAttribute(ctx.AUTOMATION_RECOMMEND_CELL_RENDER_TOKEN_ATTR) === token) return;
      cell.setAttribute(ctx.AUTOMATION_RECOMMEND_CELL_RENDER_TOKEN_ATTR, token);
      cell.textContent = "";
      const main = document.createElement("strong");
      main.textContent =
        estimate.status === "ready"
          ? ctx.formatAutomationSignedDelta(estimate.levelDelta + 1)
          : estimate.status === "excluded"
            ? "-"
            : estimate.message;
      cell.append(main);
      cell.removeAttribute("title");
      if (a)
        cell.title = `${a.scanMode === "quick" ? text("快速扫描", "Quick scan") : text("完整扫描", "Full scan")} · ${text("已检查", "Checked")} Lv.${a.minLevel}–${a.maxLevel}${a.stoppedEarly ? (a.stopReason === "certified-upper-bound" ? text(" · 后续等级均不达标", " · Remaining levels cannot meet target") : text(" · 连续六级未达标，后续未检查", " · Six consecutive misses; later levels unchecked")) : a.atSearchLimit ? text(" · 已到扫描上限", " · Search limit reached") : ""}`;
    };
    const preview = ctx.renderSkillingPreviewTooltip;
    ctx.renderSkillingPreviewTooltip = (data) => {
      const tooltip = preview(data);
      const target = ctx.getExperienceTargets()[data?.skillId];
      if (tooltip && target !== undefined && Number.isFinite(data?.experiencePerHour)) {
        ctx.appendPreviewRow(tooltip, text("目标经验", "EXP goal"), `${ctx.experienceTargetToInput(target)} K/h`);
        ctx.appendPreviewRow(
          tooltip,
          text("经验效率判断", "EXP efficiency"),
          data.experiencePerHour > target ? text("高于目标", "Above goal") : text("未高于目标", "Does not exceed goal")
        );
      }
      return tooltip;
    };
    const combatPreview = ctx.renderCombatPreviewTooltip;
    ctx.renderCombatPreviewTooltip = (data) => {
      const tooltip = combatPreview(data);
      const xp = data?.combatExperience;
      if (!xp) return tooltip;
      ctx.appendPreviewRow(
        tooltip,
        ctx.t("experiencePerRoom"),
        xp.experiencePerRoom === null ? "—" : ctx.formatPreviewExperience(xp.experiencePerRoom)
      );
      ctx.appendPreviewRow(tooltip, ctx.t("experiencePerHour"), ctx.formatExperienceRate(xp.experiencePerHour));
      const target =
        ctx.getExperienceTargets()[
          String(data.monsterHrid || "")
            .split("/")
            .pop()
        ];
      if (target !== undefined) {
        ctx.appendPreviewRow(tooltip, text("目标经验", "EXP goal"), `${ctx.experienceTargetToInput(target)} K/h`);
        ctx.appendPreviewRow(
          tooltip,
          text("经验效率判断", "EXP efficiency"),
          xp.experiencePerHour > target ? text("高于目标", "Above goal") : text("未高于目标", "Does not exceed goal")
        );
      }
      const names = {
        stamina: "耐力",
        intelligence: "智力",
        attack: "攻击",
        melee: "近战",
        defense: "防御",
        ranged: "远程",
        magic: "魔法"
      };
      const skillExperience = Object.entries(xp.bySkill || {}).filter(
        ([, value]) => Number.isFinite(value?.experiencePerHour) && value.experiencePerHour > 0
      );
      if (skillExperience.length < 2) return tooltip;
      for (const [key, value] of skillExperience) {
        ctx.appendPreviewRow(
          tooltip,
          ctx.isChineseUi() ? names[key] || key : key,
          ctx.formatExperienceRate(value.experiencePerHour)
        );
        tooltip.lastElementChild.dataset.combatExperience = key;
      }
      return tooltip;
    };
    const style = ctx.ensureStyle;
    ctx.ensureStyle = () => {
      style();
      if (document.getElementById("mwi-labyrinth-calc-experience-style")) return;
      const element = document.createElement("style");
      element.id = "mwi-labyrinth-calc-experience-style";
      element.textContent = `
.mwi-labyrinth-calc-experience-actions{flex-basis:100%;margin-top:8px;}
.mwi-labyrinth-calc-experience-scan{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px;}
#${formId} [data-experience-full-scan]{width:16px;min-width:16px;height:16px;padding:0;accent-color:var(--ml-action,#43c4ad);}
#${formId} [data-experience-save-error]{color:var(--ml-warn,#e9c487);display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:8px 0;}
#${formId} [data-experience-save-error][hidden]{display:none;}
.${buttonClass}{font:inherit;font-size:12px;color:#fff;background:#3269c7;border:1px solid #6a94da;border-radius:4px;padding:6px 10px;cursor:pointer;}
.${buttonClass}:disabled{opacity:.65;cursor:wait;}
#${formId}{flex-basis:100%;max-width:620px;color:#eeeef5;font:12px/1.5 system-ui,sans-serif;}
#${formId} summary{cursor:pointer;padding:6px 0;}
#${formId} p,.mwi-labyrinth-calc-experience-note{color:#c1c4d8;font-size:12px;line-height:1.5;margin:8px 0;white-space:normal;}
.mwi-labyrinth-calc-experience-note{flex-basis:100%;max-width:620px;}
.mwi-labyrinth-calc-experience-inputs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 18px;}
.mwi-labyrinth-calc-experience-inputs label{display:flex;gap:8px;align-items:center;justify-content:space-between;min-width:0;}
.mwi-labyrinth-calc-experience-inputs input{width:128px;min-width:0;box-sizing:border-box;background:#161722;color:#eeeef5;border:1px solid #747b9c;border-radius:4px;font:inherit;padding:6px;}
.mwi-labyrinth-calc-experience-inputs input::placeholder{color:#c1c4d8;opacity:1;}
.mwi-labyrinth-calc-experience-inputs input:invalid{border-color:#ffba92;}
.mwi-labyrinth-calc-experience-result{font-size:11px;line-height:1.5;font-weight:400;white-space:normal;max-width:240px;margin-top:4px;overflow-wrap:anywhere;}
.mwi-labyrinth-calc-experience-result summary{cursor:pointer;}
@media(max-width:700px){.mwi-labyrinth-calc-experience-inputs{grid-template-columns:1fr;}.mwi-labyrinth-calc-experience-inputs input{width:150px;}}
`;
      document.head.append(element);
    };
  };
})(globalThis);
