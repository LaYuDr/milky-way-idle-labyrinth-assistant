(function (root) {
  "use strict";
  root.MwiLabyrinthCalculatorModules.presentation = function (ctx) {
    const text = (zh, en) => (ctx.isChineseUi() ? zh : en);
    const style = ctx.ensureStyle;
    ctx.ensureStyle = () => {
      if (ctx.destroyed) return;
      style();
      root.MwiLabyrinthTheme.install(document);
    };
    const control = ctx.createControlPanel;
    ctx.createControlPanel = () => {
      if (ctx.destroyed) return null;
      const panel = control();
      if (!panel || panel.querySelector(".mwi-labyrinth-calc-options")) return panel;
      const advanced = document.createElement("div");
      advanced.className = "mwi-labyrinth-calc-options";
      const budget = panel.querySelector(`.${ctx.CONTROL_CLASS}__settings`);
      if (budget) {
        budget.querySelector("input").setAttribute("aria-label", ctx.t("combatTrials"));
        const action = document.createElement("div");
        action.className = "mwi-lab-calculate-action";
        const button = panel.querySelector(`.${ctx.CONTROL_CLASS}__button`);
        panel.prepend(action);
        action.append(button, budget);
      }
      panel.append(advanced);
      return panel;
    };
    function syncRecommendationControls(control) {
      if (!control) return;
      const running = ctx.automationEstimateRunning;
      const names = {
        winRate: text("按胜率推荐", "Recommend by win rate"),
        seconds: text("按耗时推荐", "Recommend by time"),
        experience: text("按经验推荐", "Recommend by EXP")
      };
      for (const button of control.querySelectorAll(".mwi-labyrinth-calc-auto-primary")) {
        const active =
          running &&
          ctx.automationEstimateRunningMode === "recommend" &&
          ctx.automationRecommendBasis === button.dataset.mwiLabMode;
        button.textContent = active ? ctx.t("calculating") : names[button.dataset.mwiLabMode];
        button.disabled = running;
      }
      const stop = control.querySelector(".mwi-labyrinth-calc-experience-stop");
      if (stop) {
        stop.hidden = !running;
        if (!running) stop.disabled = false;
      }
      const status = control.querySelector(`.${ctx.AUTOMATION_ESTIMATE_CONTROL_CLASS}__status`);
      if (status) status.hidden = !running && ["", ctx.t("pending"), ctx.t("calcDone")].includes(status.textContent);
    }
    const ensure = ctx.ensureAutomationEstimateControl;
    ctx.ensureAutomationEstimateControl = (section) => {
      if (ctx.destroyed) return null;
      const control = ensure(section);
      if (!control) return control;
      if (!control.querySelector(".mwi-labyrinth-calc-auto-toolbar")) {
        const heading = document.createElement("div"),
          title = document.createElement("h3"),
          actions = document.createElement("div"),
          toolbar = document.createElement("div");
        heading.className = "mwi-labyrinth-calc-auto-heading";
        actions.className = "mwi-labyrinth-calc-auto-actions";
        title.textContent = text("房间推荐", "Room recommendations");
        toolbar.className = "mwi-labyrinth-calc-auto-toolbar";
        const calculate = control.querySelector(`.${ctx.AUTOMATION_ESTIMATE_CONTROL_CLASS}__button`);
        const budget = control.querySelector(`.${ctx.AUTOMATION_ESTIMATE_CONTROL_TRIALS_INPUT_CLASS}`)?.parentElement;
        if (budget) {
          budget.classList.add("mwi-labyrinth-calc-auto-budget");
          budget.querySelector("input").setAttribute("aria-label", text("模拟预算", "Simulation budget"));
          actions.append(budget);
        }
        const stop = document.createElement("button");
        stop.type = "button";
        stop.className = "mwi-labyrinth-calc-experience-stop";
        stop.textContent = text("停止", "Stop");
        stop.hidden = true;
        ctx.listen(stop, "click", () => {
          ctx.automationStopRequested = true;
          ctx.experienceRevision++;
          stop.disabled = true;
        });
        actions.append(calculate, stop);
        heading.append(title, actions);
        for (const [basis, inputClass, buttonClass] of [
          [
            "winRate",
            ctx.AUTOMATION_ESTIMATE_CONTROL_TARGET_RATE_INPUT_CLASS,
            ctx.AUTOMATION_ESTIMATE_CONTROL_RECOMMEND_BUTTON_CLASS
          ],
          [
            "seconds",
            ctx.AUTOMATION_ESTIMATE_CONTROL_TARGET_SECONDS_INPUT_CLASS,
            ctx.AUTOMATION_ESTIMATE_CONTROL_RECOMMEND_SECONDS_BUTTON_CLASS
          ],
          ["experience", null, "mwi-labyrinth-calc-experience-recommend"]
        ]) {
          const row = document.createElement("div");
          row.className = "mwi-labyrinth-calc-auto-method";
          if (inputClass) {
            const input = control.querySelector(`.${inputClass}`),
              group = input.parentElement;
            group.classList.add("mwi-labyrinth-calc-auto-target");
            input.setAttribute(
              "aria-label",
              basis === "winRate"
                ? text("目标胜率 (%)", "Target win rate (%)")
                : text("目标耗时 (秒)", "Target time (seconds)")
            );
            row.append(group);
          }
          const button = control.querySelector(`.${buttonClass}`);
          button.classList.add("mwi-labyrinth-calc-auto-primary");
          button.dataset.mwiLabMode = basis;
          if (inputClass) {
            row.append(button);
            toolbar.append(row);
          }
        }
        const goals = control.querySelector("#mwi-labyrinth-calc-experience-goals");
        const experienceHeading = document.createElement("div");
        experienceHeading.className = "mwi-labyrinth-calc-experience-heading";
        experienceHeading.append(
          goals.querySelector("h4"),
          control.querySelector(".mwi-labyrinth-calc-experience-recommend")
        );
        goals.prepend(experienceHeading);
        const status = control.querySelector(`.${ctx.AUTOMATION_ESTIMATE_CONTROL_CLASS}__status`);
        status.classList.add("mwi-labyrinth-calc-auto-status");
        status.setAttribute("role", "status");
        control.querySelector(".mwi-labyrinth-calc-experience-actions")?.remove();
        for (const lineBreak of control.querySelectorAll(`.${ctx.AUTOMATION_ESTIMATE_CONTROL_CLASS}__break`))
          lineBreak.remove();
        control.replaceChildren(heading, toolbar, goals, status);
      }
      ctx.getAutomationEstimateTable()?.classList.add("mwi-labyrinth-auto-table");
      syncRecommendationControls(control);
      return control;
    };
    const adjustmentAttribute = "data-mwi-labyrinth-adjust";
    const groupAttribute = "data-mwi-labyrinth-combat-start";
    const savedThresholds = new WeakMap();
    ctx.getAutomationAdjustment = (current, recommendation) => {
      const target = recommendation?.levelDelta + 1;
      if (
        recommendation?.status !== "ready" ||
        !Number.isSafeInteger(current) ||
        !Number.isSafeInteger(target) ||
        target < -999 ||
        target > 999 ||
        current === target
      )
        return null;
      return { target, difference: target - current, direction: target > current ? "up" : "down" };
    };
    const renderTable = ctx.renderAutomationEstimateTable;
    ctx.renderAutomationEstimateTable = (entries) => {
      renderTable(entries);
      const table = ctx.getAutomationEstimateTable();
      if (!table) return;
      const state = ctx.getGameState();
      const panel = ctx.getLabyrinthPanelInstance();
      const set = (node, name, value) => {
        if (value === null) {
          if (node.hasAttribute(name)) node.removeAttribute(name);
        } else if (node.getAttribute(name) !== value) node.setAttribute(name, value);
      };
      const rows = [...table.querySelectorAll("tbody tr")];
      rows.forEach((row, index) => {
        const entry = entries?.[index];
        set(
          row,
          groupAttribute,
          entry?.isCombat && index > 0 && entries[index - 1]?.isCombat === false ? "true" : null
        );
        const firstInGroup =
          entry && (index === 0 || Boolean(entry.isCombat) !== Boolean(entries[index - 1]?.isCombat));
        if (row.children[0])
          set(
            row.children[0],
            "data-mwi-labyrinth-room-group",
            firstInGroup ? (entry.isCombat ? text("战斗项目", "Combat rooms") : text("生活项目", "Life rooms")) : null
          );
        let current = NaN;
        const editing = row.children[2]?.querySelector("input");
        if (!editing) current = ctx.parseAutomationSkipThresholdFromRow(row);
        else {
          const value =
            panel?.getSkipThresholdForRoomType?.(entry?.key) ??
            state?.characterSetting?.[`labyrinthSkip${ctx.toPascalCase(entry?.key || "")}`];
          if (value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(value)))
            current = Number(value);
          else if (savedThresholds.get(row)?.key === entry?.key) current = savedThresholds.get(row).value;
        }
        if (Number.isSafeInteger(current)) savedThresholds.set(row, { key: entry?.key, value: current });
        const recommendation = entry && ctx.automationRecommendByRoomTypeKey.get(entry.key);
        const adjustment =
          ctx.automationRecommendColumnEnabled && !ctx.automationEstimateRunning
            ? ctx.getAutomationAdjustment(current, recommendation)
            : null;
        set(row, adjustmentAttribute, adjustment?.direction || null);
        const cell = row.querySelector(`.${ctx.AUTOMATION_RECOMMEND_CELL_CLASS}`);
        if (!cell) return;
        const label = adjustment
          ? text(
              `当前 ${current}，推荐 ${adjustment.target}，需${adjustment.direction === "up" ? "调高" : "调低"} ${Math.abs(adjustment.difference)} 级`,
              `Current ${current}, recommended ${adjustment.target}; ${adjustment.direction === "up" ? "raise" : "lower"} by ${Math.abs(adjustment.difference)}`
            )
          : null;
        set(cell, "data-mwi-labyrinth-adjust-hint", label);
        set(cell, "aria-label", label);
      });
    };
    const status = ctx.setAutomationEstimateControlStatus;
    ctx.setAutomationEstimateControlStatus = (value) => {
      if (ctx.destroyed) return;
      status(value);
      syncRecommendationControls(document.getElementById(ctx.AUTOMATION_ESTIMATE_CONTROL_ID));
    };
    const progress = ctx.setControlStatus;
    ctx.setControlStatus = (value) => {
      if (ctx.destroyed) return;
      progress(value);
      const panel = ctx.getControlPanel();
      const status = panel?.querySelector(`.${ctx.CONTROL_CLASS}__progress`);
      if (status) {
        const running = value?.running ?? ctx.manualUpdateRunning;
        status.hidden = !running && ["", ctx.t("pending"), ctx.t("calcDone")].includes(status.textContent.trim());
        const track = status.querySelector(`.${ctx.CONTROL_CLASS}__track`);
        if (track) track.hidden = !running;
      }
    };
    const row = ctx.appendPreviewRow;
    ctx.appendPreviewRow = (tooltip, label, value) => {
      row(tooltip, label, value);
      const element = tooltip.lastElementChild;
      if ([ctx.t("experiencePerHour"), text("通关胜率", "Clear chance")].includes(label))
        element.dataset.emphasis = "true";
      if (label === text("经验效率判断", "EXP efficiency"))
        element.dataset.tone = value === text("高于目标", "Above goal") ? "good" : "warn";
    };
    const skillPreview = ctx.renderSkillingPreviewTooltip;
    ctx.renderSkillingPreviewTooltip = (data) => {
      const tooltip = skillPreview(data);
      if (Number.isFinite(data.clearChance)) {
        ctx.appendPreviewRow(tooltip, text("通关胜率", "Clear chance"), ctx.formatPreviewPercent(data.clearChance));
        const row = tooltip.lastElementChild;
        tooltip.children[1]?.before(row);
      }
      const seconds = data.expectedSecondsPerClear;
      ctx.appendPreviewRow(
        tooltip,
        text("期望通关时长", "Expected clear time"),
        seconds === Infinity ? "∞" : Number.isFinite(seconds) && seconds >= 0 ? `${Math.round(seconds)}s` : "—"
      );
      return tooltip;
    };
    const combatPreview = ctx.renderCombatPreviewTooltip;
    ctx.renderCombatPreviewTooltip = (data) => {
      const tooltip = combatPreview(data);
      if (Number.isFinite(data.clearChance)) {
        ctx.appendPreviewRow(tooltip, text("通关胜率", "Clear chance"), ctx.formatPreviewPercent(data.clearChance));
        tooltip.children[1]?.before(tooltip.lastElementChild);
      }
      if (Number.isFinite(data.expectedSecondsPerClear))
        ctx.appendPreviewRow(
          tooltip,
          text("预计耗时", "Expected time"),
          `${Math.round(data.expectedSecondsPerClear)}s`
        );
      return tooltip;
    };
    ctx.disposePresentation = () => {
      document
        .querySelectorAll("[data-mwi-labyrinth-room-group]")
        .forEach((node) => node.removeAttribute("data-mwi-labyrinth-room-group"));
      document.querySelectorAll(`[${adjustmentAttribute}],[${groupAttribute}]`).forEach((row) => {
        row.removeAttribute(adjustmentAttribute);
        row.removeAttribute(groupAttribute);
      });
      document
        .querySelectorAll(".mwi-labyrinth-auto-table")
        .forEach((table) => table.classList.remove("mwi-labyrinth-auto-table"));
    };
  };
})(globalThis);
