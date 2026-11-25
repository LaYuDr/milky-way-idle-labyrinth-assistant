(function (root) {
  "use strict";
  root.MwiLabyrinthCalculatorModules["preview-layout"] = function (ctx) {
    const prefix = "mwi-labyrinth-calc-preview";
    const text = (zh, en) => (ctx.isChineseUi() ? zh : en);
    const upgradeFields = {
      nextLevelClearChance: "nextLevelClearChance",
      efficiencyTierClearChance: "efficiencyTierClearChance",
      speedTierClearChance: "speedTierClearChance",
      nextSkillingSuccessClearChance: "nextSkillingSuccessClearChance",
      nextSkillingDoubleProgressClearChance: "nextSkillingDoubleProgressClearChance"
    };
    function appendDelta(row, current, next) {
      const delta = document.createElement("span");
      delta.className = `${prefix}-delta`;
      delta.textContent = "—";
      if (Number.isFinite(next) && Number.isFinite(current)) {
        // Compare the same rounded probabilities displayed in the original rows.
        const change = (Math.round(ctx.clamp01(next) * 1000) - Math.round(ctx.clamp01(current) * 1000)) / 10;
        delta.textContent = `${change > 0 ? "+" : ""}${change.toFixed(1)}`;
        delta.dataset.direction = change > 0 ? "up" : change < 0 ? "down" : "same";
      }
      row.append(delta);
    }
    function organize(tooltip, data, type = "skilling") {
      tooltip.dataset.layout = type;
      const rows = [...tooltip.querySelectorAll(`.${ctx.PREVIEW_TOOLTIP_CLASS}__row`)];
      const label = (row) => row.querySelector(`.${ctx.PREVIEW_TOOLTIP_CLASS}__label`)?.textContent;
      const targetKey =
        type === "skilling"
          ? data?.skillId
          : String(data?.monsterHrid || "")
              .split("/")
              .pop();
      const target = ctx.getExperienceTargets()[targetKey];
      const showUpgradeExperience =
        Number.isFinite(target) && Number.isFinite(data?.experiencePerHour) && data.experiencePerHour <= target;
      tooltip.dataset.upgradeExperience = String(showUpgradeExperience);
      function appendUpgradeExperience(row, hourly) {
        if (!showUpgradeExperience) return;
        const experience = document.createElement("span");
        experience.className = `${prefix}-upgrade-experience`;
        experience.textContent =
          Number.isFinite(hourly) && hourly >= 0 ? ctx.formatPreviewExperiencePerHourK(hourly) : "—";
        if (Number.isFinite(hourly) && hourly > target) experience.dataset.tone = "good";
        row.append(experience);
      }
      const chanceTones = {
        "#1fbf60": "excellent",
        "#77b82a": "good",
        "#d2ac19": "fair",
        "#d27a1f": "low",
        "#d84b4b": "poor"
      };
      for (const row of rows) {
        if (label(row) === text("通关胜率", "Clear chance") && Number.isFinite(data.clearChance))
          row.dataset.chanceTone = chanceTones[ctx.getBadgeColor(data.clearChance)];
        if (
          label(row) === ctx.t("experiencePerHour") &&
          Number.isFinite(target) &&
          Number.isFinite(data.experiencePerHour)
        )
          row.dataset.experienceTone = data.experiencePerHour > target ? "good" : "warn";
      }
      const remaining = new Set(rows);
      function take(labels, ordered = false) {
        const selected = rows.filter((row) => remaining.has(row) && labels.includes(label(row)));
        if (ordered) selected.sort((a, b) => labels.indexOf(label(a)) - labels.indexOf(label(b)));
        selected.forEach((row) => remaining.delete(row));
        return selected;
      }
      function showUpgrades(upgrades) {
        const header = document.createElement("div");
        header.className = `${prefix}-upgrade-head`;
        for (const title of [
          text("项目", "Upgrade"),
          type === "combat" ? text("花费", "Cost") : text("门槛/花费", "Cost"),
          text("胜率", "Chance"),
          text("百分点", "Δ pp"),
          ...(showUpgradeExperience ? [text("经验/h", "EXP/h")] : [])
        ]) {
          const span = document.createElement("span");
          span.textContent = title;
          header.append(span);
        }
        header.children[1].title = text(
          "升级耗时、属性门槛或代币花费",
          "Level-up time, stat requirement or token cost"
        );
        header.children[3].title =
          type === "combat"
            ? text(
                "与当前模拟胜率相差的百分点，结果有抽样波动",
                "Difference from the current simulated chance in percentage points, subject to sampling variation"
              )
            : text("通关胜率变化（百分点）", "Clear chance change in percentage points");
        if (showUpgradeExperience)
          header.children[4].title = text("升级后每小时经验", "Experience per hour after upgrade");
        section(text("升级收益", "Upgrade impact"), [header, ...upgrades], `${prefix}-upgrades`);
        tooltip.querySelector(`.${prefix}-upgrades`).tabIndex = 0;
      }
      // Both room types start with the same metrics in the same positions.
      section("", take([text("通关胜率", "Clear chance"), ctx.t("experiencePerHour")], true), `${prefix}-summary`);
      take([text("经验效率判断", "EXP efficiency")]).forEach((row) => row.remove());
      if (type === "skilling") take([ctx.t("actionDuration")]).forEach((row) => row.remove());
      const goals = take(
        [
          type === "combat" ? text("预计耗时", "Expected time") : text("期望通关时长", "Expected clear time"),
          Number.isFinite(target) ? text("目标经验", "EXP goal") : ctx.t("experiencePerRoom")
        ],
        true
      );
      const failure = type === "combat" ? take([ctx.t("failureReason")]) : [];
      for (const row of failure) {
        row.dataset.tone = "warn";
        row.classList.add(`${prefix}-failure`);
      }
      const roomExperience = take([ctx.t("experiencePerRoom")]);
      if (type === "combat") {
        for (const row of roomExperience) row.classList.add(`${prefix}-room-experience`);
        section("", [...goals, ...failure, ...roomExperience], `${prefix}-goals ${prefix}-combat-metrics`);
      } else {
        section("", goals, `${prefix}-goals`);
        section("", roomExperience, `${prefix}-pairs ${prefix}-yield ${prefix}-life-yield`);
      }
      if (type === "combat") {
        section(
          text("技能经验 · K/h", "Skill EXP · K/h"),
          take(rows.filter((row) => row.dataset.combatExperience).map(label)),
          `${prefix}-pairs`
        );
        section(
          text("战斗属性", "Combat stats"),
          take([
            text("弱点", "Weakness"),
            ctx.t("combatStyle"),
            ctx.t("damageType"),
            ctx.t("attackInterval"),
            ctx.t("castSpeed"),
            data.styleAccuracyLabel || ctx.t("accuracyDefault"),
            data.styleDamageLabel || ctx.t("damageDefault"),
            ctx.t("maxHp"),
            data.targetEvasionLabel || ctx.t("evasionDefault"),
            data.targetMitigationLabel || ctx.t("mitigationDefault")
          ]),
          `${prefix}-pairs`
        );
        section(
          text("技能", "Abilities"),
          take(rows.filter((row) => /^Lv\.\d+$/.test(label(row))).map(label)),
          `${prefix}-pairs ${prefix}-abilities`
        );
        if (data.upgradeImpact) {
          const upgrades = [];
          for (const { key, zh, en } of ctx.COMBAT_STAT_UPGRADES) {
            const impact = data.upgradeImpact[key];
            if (!impact || impact.cost === null) continue;
            const { cost, clearChance } = impact;
            ctx.appendPreviewRow(
              tooltip,
              text(zh, en),
              Number.isFinite(clearChance) ? ctx.formatPreviewPercent(clearChance) : "—"
            );
            const row = tooltip.lastElementChild;
            row.classList.add(`${prefix}-upgrade`);
            const requirement = document.createElement("span");
            requirement.className = `${prefix}-requirement`;
            requirement.textContent = `${cost} ${text("代币", "tokens")}`;
            row.insertBefore(requirement, row.lastElementChild);
            appendDelta(row, data.clearChance, clearChance);
            appendUpgradeExperience(row, impact.experiencePerHour);
            upgrades.push(row);
          }
          if (upgrades.length) showUpgrades(upgrades);
        } else if (data.upgradeImpactLoading) {
          const note = document.createElement("div");
          note.className = `${prefix}-loading`;
          note.textContent = text("正在按需多核计算升级收益…", "Calculating upgrade impact on demand…");
          section(text("升级收益", "Upgrade impact"), [note], `${prefix}-upgrades`);
        }
        section(
          text("奖励期望", "Expected rewards"),
          take((data.rewardPreview?.rows || []).map((row) => row.label)),
          `${prefix}-pairs`
        );
        section("", [...remaining], `${prefix}-notes ${prefix}-footer`);
        finish();
        return;
      }
      function section(title, contents, modifier = "") {
        if (!contents.length) return;
        const group = document.createElement("section");
        group.className = `${prefix}-section`;
        if (title) {
          const heading = document.createElement("h4");
          heading.textContent = title;
          group.append(heading);
        }
        const body = document.createElement("div");
        body.className = `${prefix}-group ${modifier}`;
        body.append(...contents);
        group.append(body);
        tooltip.append(group);
      }
      // Omit detailed action parameters from the compact life-room view.
      take([
        ctx.t("targetEnhancement"),
        ctx.t("workPower"),
        ctx.t("successRate"),
        ctx.t("doubleProgress"),
        ctx.t("twoMinuteActions")
      ]).forEach((row) => row.remove());
      const thresholdRows = take([ctx.t("needEfficiencyForOneLessProgress"), ctx.t("needSpeedForOneMoreAction")]);
      const thresholds = new Map(
        thresholdRows.map((row) => [label(row), row.querySelector(`.${ctx.PREVIEW_TOOLTIP_CLASS}__value`)?.textContent])
      );
      thresholdRows.forEach((row) => row.remove());
      const upgrades = take(Object.keys(upgradeFields).map((key) => ctx.t(key))).filter((row) => {
        const costKey =
          label(row) === ctx.t("nextSkillingSuccessClearChance")
            ? "nextSkillingSuccessCost"
            : label(row) === ctx.t("nextSkillingDoubleProgressClearChance")
              ? "nextSkillingDoubleProgressCost"
              : null;
        if (costKey && data[costKey] === null) {
          row.remove();
          return false;
        }
        return true;
      });
      if (upgrades.length) {
        for (const row of upgrades) {
          row.classList.add(`${prefix}-upgrade`);
          const field = Object.keys(upgradeFields).find((key) => ctx.t(key) === label(row));
          const next = data[upgradeFields[field]];
          const requirement = document.createElement("span");
          requirement.className = `${prefix}-requirement`;
          const thresholdKey =
            field === "efficiencyTierClearChance"
              ? "needEfficiencyForOneLessProgress"
              : field === "speedTierClearChance"
                ? "needSpeedForOneMoreAction"
                : null;
          if (thresholdKey) {
            requirement.textContent = thresholds.get(ctx.t(thresholdKey)) || "—";
            requirement.title = `${ctx.t(thresholdKey)}：${requirement.textContent}`;
          } else if (field === "nextLevelClearChance") {
            const estimate = ctx.getNextLevelTime(data.skillId);
            requirement.textContent = ctx.formatNextLevelTime(estimate?.hours);
            requirement.title = estimate
              ? text(
                  `预计升级耗时：剩余 ${ctx.formatPreviewExperience(estimate.remaining)} 经验 ÷ 目标 ${ctx.formatExperienceRate(estimate.target)}`,
                  `Time to next level: ${ctx.formatPreviewExperience(estimate.remaining)} remaining EXP ÷ target ${ctx.formatExperienceRate(estimate.target)}`
                )
              : text(
                  "需设置大于 0 的目标经验，并读取有效的角色经验与下一级门槛",
                  "Requires a positive EXP goal and valid character EXP and next-level threshold"
                );
          } else {
            const cost =
              data[
                field === "nextSkillingSuccessClearChance"
                  ? "nextSkillingSuccessCost"
                  : "nextSkillingDoubleProgressCost"
              ];
            requirement.textContent =
              Number.isSafeInteger(cost) && cost > 0 ? `${cost} ${text("代币", "tokens")}` : "—";
            if (Number.isSafeInteger(cost) && cost > 0)
              requirement.title = text(`升一档需 ${cost} 迷宫代币`, `Next upgrade costs ${cost} labyrinth tokens`);
          }
          row.insertBefore(requirement, row.querySelector(`.${ctx.PREVIEW_TOOLTIP_CLASS}__value`));
          appendDelta(row, data.clearChance, next);
          appendUpgradeExperience(row, data[field.replace("ClearChance", "ExperiencePerHour")]);
        }
        showUpgrades(upgrades);
      }
      section(
        text("奖励期望", "Expected rewards"),
        take((data.rewardPreview?.rows || []).map((row) => row.label)),
        `${prefix}-pairs`
      );
      section(text("说明", "Notes"), [...remaining], `${prefix}-notes`);
      finish();
      function finish() {
        const body = document.createElement("div");
        body.className = `${prefix}-body`;
        body.append(...tooltip.querySelectorAll(`.${prefix}-section`));
        tooltip.append(body);
      }
    }
    for (const method of [
      "renderSkillingPreviewTooltip",
      "renderCombatPreviewTooltip",
      "renderRewardOnlyPreviewTooltip"
    ]) {
      const render = ctx[method];
      ctx[method] = (data) => {
        const tooltip = render(data);
        delete tooltip.dataset.layout;
        delete tooltip.dataset.upgradeExperience;
        if (method === "renderSkillingPreviewTooltip") organize(tooltip, data);
        if (method === "renderCombatPreviewTooltip") organize(tooltip, data, "combat");
        return tooltip;
      };
    }
  };
})(globalThis);
