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
      // Both room types start with the same metrics in the same positions.
      section("", take([text("通关胜率", "Clear chance"), ctx.t("experiencePerHour")], true), `${prefix}-summary`);
      if (type === "skilling") {
        take([text("经验效率判断", "EXP efficiency"), ctx.t("actionDuration")]).forEach((row) => row.remove());
        section(
          "",
          take([text("期望通关时长", "Expected clear time"), text("目标经验", "EXP goal")], true),
          `${prefix}-goals`
        );
        section("", take([ctx.t("experiencePerRoom")]), `${prefix}-pairs ${prefix}-yield ${prefix}-life-yield`);
      } else {
        section(
          "",
          take([text("目标经验", "EXP goal"), text("经验效率判断", "EXP efficiency")], true),
          `${prefix}-goals`
        );
        section(
          "",
          take(
            [
              ctx.t("experiencePerRoom"),
              type === "combat" ? text("预计耗时", "Expected time") : ctx.t("actionDuration")
            ],
            true
          ),
          `${prefix}-pairs ${prefix}-yield`
        );
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
        section(
          text("奖励期望", "Expected rewards"),
          take((data.rewardPreview?.rows || []).map((row) => row.label)),
          `${prefix}-pairs`
        );
        const notes = [...remaining];
        for (const row of notes) if (label(row) === ctx.t("failureReason")) row.dataset.tone = "warn";
        section(text("说明", "Notes"), notes, `${prefix}-notes`);
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
      const showUpgradeExperience =
        Number.isFinite(target) && Number.isFinite(data?.experiencePerHour) && data.experiencePerHour <= target;
      tooltip.dataset.upgradeExperience = String(showUpgradeExperience);
      const upgrades = take(Object.keys(upgradeFields).map((key) => ctx.t(key)));
      if (upgrades.length) {
        const header = document.createElement("div");
        header.className = `${prefix}-upgrade-head`;
        for (const title of [
          text("项目", "Upgrade"),
          text("门槛/花费", "Cost"),
          text("胜率", "Chance"),
          text("百分点", "Δ pp"),
          ...(showUpgradeExperience ? [text("经验/h", "EXP/h")] : [])
        ]) {
          const span = document.createElement("span");
          span.textContent = title;
          header.append(span);
        }
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
          const delta = document.createElement("span");
          delta.className = `${prefix}-delta`;
          delta.textContent = "—";
          if (Number.isFinite(next) && Number.isFinite(data.clearChance)) {
            // Compare the same rounded probabilities displayed in the original rows.
            const change =
              (Math.round(ctx.clamp01(next) * 1000) - Math.round(ctx.clamp01(data.clearChance) * 1000)) / 10;
            delta.textContent = `${change > 0 ? "+" : ""}${change.toFixed(1)}`;
            delta.dataset.direction = change > 0 ? "up" : change < 0 ? "down" : "same";
          }
          row.append(delta);
          if (showUpgradeExperience) {
            const hourly = data[field.replace("ClearChance", "ExperiencePerHour")];
            const experience = document.createElement("span");
            experience.className = `${prefix}-upgrade-experience`;
            experience.textContent =
              Number.isFinite(hourly) && hourly >= 0 ? ctx.formatPreviewExperiencePerHourK(hourly) : "—";
            if (Number.isFinite(hourly) && hourly > target) experience.dataset.tone = "good";
            row.append(experience);
          }
        }
        header.children[1].title = text(
          "升级耗时、属性门槛或代币花费",
          "Level-up time, stat requirement or token cost"
        );
        header.children[3].title = text("通关胜率变化（百分点）", "Clear chance change in percentage points");
        if (showUpgradeExperience)
          header.children[4].title = text("升级后每小时经验", "Experience per hour after upgrade");
        section(text("升级收益", "Upgrade impact"), [header, ...upgrades], `${prefix}-upgrades`);
        tooltip.querySelector(`.${prefix}-upgrades`).tabIndex = 0;
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
