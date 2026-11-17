(function (root) {
  "use strict";
  root.MwiLabyrinthCalculatorModules.integration = function (ctx) {
    ctx.skillingSuccessChance = (value) => Math.max(0.05, Math.min(1, Number(value) || 0));
    ctx.inputRevision = 0;
    ctx.inputInvalidated = false;
    ctx.UI_TEXT.zh.targetNotMet = "未找到达到目标的等级";
    ctx.UI_TEXT.en.targetNotMet = "No level meets the target";
    ctx.wilsonLower = (wins, trials) => {
      if (!(trials > 0) || !Number.isFinite(wins)) return 0;
      const p = Math.max(0, Math.min(1, wins / trials)),
        z = 1.96,
        z2 = z * z;
      return (
        (p + z2 / (2 * trials) - z * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials))) / (1 + z2 / trials)
      );
    };
    ctx.calculationSignature = (state) => {
      if (!state) return "";
      const data = { character: ctx.storageIdentity() };
      for (const key of [
        "characterLoadoutDict",
        "abilityCombatTriggersDict",
        "characterAbilityMap",
        "characterHouseRoomDict",
        "characterAchievementMap",
        "equipmentActionTypeBuffsDict",
        "skillingActionTypeBuffsDict",
        "consumableActionTypeBuffsDict",
        "personalActionTypeBuffsDict",
        "communityActionTypeBuffsDict",
        "houseActionTypeBuffsDict",
        "achievementActionTypeBuffsDict",
        "mooPassActionTypeBuffsDict"
      ])
        data[key] = state[key];
      data.levels = ctx.getContainerEntries(state.characterSkillMap).map(([key, value]) => [key, value?.level]);
      data.equipment = ctx.buildMaxEnhancementByItem(state);
      data.settings = Object.fromEntries(
        // Skip thresholds select rooms; they do not change character performance or recommended levels.
        // The estimate table tracks each row's threshold separately.
        Object.entries(state.characterSetting || {}).filter(
          ([key]) => key.startsWith("labyrinth") && !key.startsWith("labyrinthSkip")
        )
      );
      data.crates = ctx.getLabyrinthCrateSelection(state);
      data.upgrades = ctx.mergeLabyrinthUpgradeLevels(
        ctx.latestLabyrinthUpgradeLevels || ctx.loadStoredLabyrinthUpgradeLevels(),
        ctx.readLabyrinthUpgradeLevelsFromState(state)
      );
      data.guild = ctx.getActiveGuildCombatShrineLevels(state);
      data.floor = [state.characterLabyrinth?.startedAt, state.characterLabyrinth?.currentFloor];
      return ctx.hashString(ctx.stableStringify(data));
    };
    const refresh = ctx.refreshControlPanelPlacement;
    let previousSignature = null,
      previousIdentity = ctx.storageIdentity();
    ctx.refreshControlPanelPlacement = () => {
      if (ctx.destroyed) return null;
      const identity = ctx.storageIdentity();
      if (identity !== previousIdentity) {
        previousIdentity = identity;
        ctx.automationEstimateByRoomTypeKey.clear();
        ctx.automationEstimateColumnEnabled = false;
        ctx.latestLabyrinthUpgradeLevels = null;
        ctx.initializeRoomLogState();
        document.getElementById("mwi-labyrinth-calc-dock")?.remove();
      }
      const signature = ctx.calculationSignature(ctx.getGameState());
      // Every automation calculation uses its captured data until completion. Defer same-character
      // invalidation; changing characters must still cancel and isolate the old calculation.
      const preserveAutomationRun = ctx.automationRunSnapshot?.identity === identity;
      if (previousSignature !== null && signature !== previousSignature && !preserveAutomationRun) {
        ctx.inputRevision++;
        ctx.inputInvalidated = true;
        ctx.resetCombatSimulatorWorker(new Error("角色或房间数据已变化，请重新计算"));
        // Keep the last room simulation visible until a manual recalculation or floor change.
        // Completed automation results are manual snapshots; character changes do not invalidate them.
        ctx.clearRoomDistributionSnapshot();
        ctx.roomDistributionRunToken++;
        ctx.resetAutoRecalcState();
        ctx.setControlStatus({ running: false, ratio: 0, message: "数据已更新，请重新计算" });
      }
      if (!preserveAutomationRun) previousSignature = signature;
      const panel = refresh();
      const dock = document.getElementById("mwi-labyrinth-calc-dock");
      if (dock) dock.hidden = !panel;
      return panel;
    };
    const signature = ctx.getLabyrinthDisplaySignature;
    ctx.getLabyrinthDisplaySignature = (state) => {
      const value = signature(state);
      return value ? `${value}:${ctx.inputRevision}` : "";
    };
    const manual = ctx.runManualUpdate;
    ctx.runManualUpdate = async (options) => {
      ctx.inputInvalidated = false;
      return manual(options);
    };

    ctx.restartAdviceEnabled = ctx.options.enableRestartAdvice === true;
    ctx.estimateRestart = (progress, estimate) => {
      if (!progress || !estimate) return null;
      const unavailable = (message) => {
        estimate.restartUnavailable = message;
        return null;
      };
      if (!ctx.gameTravelTiming) return unavailable("正在等待游戏移动耗时，暂不建议重开");
      const interval = Number(progress.actionTimeMs) / 1000;
      const counter = progress.actionCounter;
      const finite = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
      if (!(interval > 0) || !Number.isInteger(counter) || counter < 0 || counter > estimate.totalAttempts)
        return unavailable("动作次数不完整，等待下一次进度更新");
      const fields = estimate.isEnhancing
        ? [progress.targetLevel, progress.currentEnhLevel]
        : [progress.targetWorkValue, progress.progressPerAction, progress.currentWorkValue ?? progress.currentProgress];
      if (
        !fields.every(finite) ||
        fields.some((value) => Number(value) < 0) ||
        (estimate.isEnhancing && ![progress.targetLevel, progress.currentEnhLevel].every(Number.isInteger))
      )
        return unavailable("房间进度不完整，等待下一次进度更新");
      const deadline = Date.parse(progress.timeoutAt);
      if (!Number.isFinite(deadline)) return unavailable("缺少有效倒计时，暂不建议重开");
      const remaining = (deadline - Date.now()) / 1000;
      const goal = estimate.isEnhancing
        ? estimate.targetLevel
        : Math.ceil(estimate.targetWorkValue / estimate.progressPerSuccess - 1e-9);
      const model = root.MwiLabyrinthRestart.solve({
        kind: estimate.isEnhancing ? "enhancing" : "skilling",
        goal,
        success: estimate.successChance,
        double: estimate.doubleChance,
        interval,
        duration: ctx.ROOM_DURATION_SECONDS,
        restart: ctx.gameTravelTiming.restart,
        retry: ctx.gameTravelTiming.retry
      });
      if (!model) return unavailable("当前参数无法可靠估算重开收益");
      const x = estimate.isEnhancing
        ? estimate.currentLevel
        : Math.round(estimate.currentWorkValue / estimate.progressPerSuccess);
      if (!estimate.isEnhancing && Math.abs(x * estimate.progressPerSuccess - estimate.currentWorkValue) > 1e-5)
        return unavailable("进度与每次行动收益不一致，暂不建议重开");
      const ideal = estimate.attemptsLeft * interval + model.tail;
      // Once the next result is due, the old state cannot tell us what happened.
      // Do not silently clamp a stale packet into an immediate, still-pending action.
      const wait = estimate.attemptsLeft === 0 ? remaining : remaining - ideal + interval;
      if (remaining <= 0 || remaining > ideal + 0.25 || wait <= 0)
        return unavailable("正在等待新的动作结果，暂不建议重开");
      return model.evaluate(
        estimate.attemptsLeft,
        Math.min(goal, x),
        Math.min(wait, estimate.attemptsLeft ? interval : model.tail)
      );
    };
    const estimateLive = ctx.computeLabyrinthLiveSkillingEstimate;
    ctx.computeLabyrinthLiveSkillingEstimate = (progress) => {
      const interval = Number(progress?.actionTimeMs);
      if (
        !(interval >= 100) ||
        !Number.isFinite(interval) ||
        [progress?.successRate, progress?.doubleProgressChance].some(
          (value) => value === null || value === undefined || value === "" || !Number.isFinite(Number(value))
        )
      )
        return null;
      const estimate = estimateLive(progress);
      if (estimate && ctx.restartAdviceEnabled) {
        estimate.progressPerSuccess = ctx.getEffectiveSkillingProgressPerSuccess(progress.progressPerAction);
        estimate.restart = ctx.estimateRestart(progress, estimate);
      }
      return estimate;
    };
    ctx.getRestartAdviceState = (estimate) => {
      const r = estimate?.restart;
      return !r ? "unavailable" : r.decision === "done" ? "done" : r.saving > 2 ? "restart" : "continue";
    };
    const liveText = ctx.formatLabyrinthLiveEstimateText,
      liveTitle = ctx.formatLabyrinthLiveEstimateTitle;
    ctx.formatLabyrinthLiveEstimateText = (estimate) => {
      const state = ctx.getRestartAdviceState(estimate);
      const suffix = {
        restart: ` · 可考虑重开，预计省约 ${Math.floor(estimate?.restart?.saving || 0)} 秒`,
        continue: estimate?.attemptsLeft === 0 ? " · 等待本场结束" : " · 继续本场",
        done: " · 已达目标",
        unavailable: ""
      }[state];
      return liveText(estimate) + suffix;
    };
    ctx.formatLabyrinthLiveEstimateTitle = (estimate) => {
      if (!ctx.restartAdviceEnabled) return liveTitle(estimate);
      const r = estimate?.restart;
      if (!r)
        return liveTitle(estimate) + "\n" + (estimate?.restartUnavailable || "重开建议需要完整、及时的动作数据。");
      if (r.decision === "done") return liveTitle(estimate) + "\n已达目标，等待游戏更新。";
      return (
        liveTitle(estimate) +
        `\n预计通关：继续本场约 ${Math.round(r.continueSeconds)} 秒；现在重开约 ${Math.round(r.restartSeconds)} 秒。` +
        "\n均包含后续重试；继续后仍可根据新进度重开。预计节省不超过 2 秒时，保留本场。" +
        `\n首次移动 ${ctx.gameTravelTiming.restart} 秒，后续移动 ${ctx.gameTravelTiming.retry} 秒；未计点击与网络延迟。` +
        "\n仅比较时间，不计经验、火把和尝试次数限制。"
      );
    };
    const toggleDistribution = ctx.setRoomDistributionEnabled;
    ctx.setRoomDistributionEnabled = (enabled) => {
      toggleDistribution(enabled);
      if (enabled && !ctx.manualUpdateRunning) ctx.runManualUpdate({ trigger: "distribution" });
    };
    ctx.ensureControlPanel = (gridParent) => {
      if (!gridParent) return ctx.getControlPanel();
      const host = ctx.options.getControlHost?.(gridParent);
      if (!host) return null;
      let dock = document.getElementById("mwi-labyrinth-calc-dock");
      if (!dock) {
        dock = document.createElement("section");
        dock.id = "mwi-labyrinth-calc-dock";
        dock.setAttribute("aria-label", "房间计算");
        host.append(dock);
      }
      if (ctx.restartAdviceEnabled) void ctx.loadGameTravelTiming();
      dock.hidden = false;
      const panel = ctx.createControlPanel();
      if (panel.parentElement !== dock) dock.append(panel);
      for (const input of panel.querySelectorAll('input[type="number"]'))
        if (!input.getAttribute("aria-label")) input.setAttribute("aria-label", "战斗模拟预算，每份为 120 秒模拟时长");
      return panel;
    };
    const style = ctx.ensureStyle;
    ctx.ensureStyle = () => {
      style();
      if (document.getElementById("mwi-labyrinth-calc-integration-style")) return;
      const el = document.createElement("style");
      el.id = "mwi-labyrinth-calc-integration-style";
      el.textContent = `
#mwi-labyrinth-calc-dock{position:static;margin-top:16px;padding-top:14px;border-top:1px solid #555979;}
#mwi-labyrinth-calc-dock h3{margin:0 0 8px;font-size:13px;font-weight:600;}
#mwi-labyrinth-calc-dock .${ctx.CONTROL_CLASS}{gap:6px;}
#mwi-labyrinth-calc-dock button,#mwi-labyrinth-calc-dock input[type="number"]{min-height:28px;font-size:12px;}
#mwi-labyrinth-calc-dock .${ctx.CONTROL_CLASS}__settings-label,#mwi-labyrinth-calc-dock .${ctx.CONTROL_DISTRIBUTION_TOGGLE_CLASS}{font-size:11px;line-height:1.4;}
.${ctx.CONTROL_CLASS}{flex-wrap:wrap;max-width:100%;background:transparent;border:0;padding:8px 0;}
.${ctx.LIVE_ACTION_RATE_CLASS}{white-space:normal;max-width:calc(100% - 6px);line-height:1.5;vertical-align:top;}
[id^="mwi-labyrinth-calc-"] :focus-visible{outline:2px solid #9bdfe9;outline-offset:2px;}
.${ctx.PREVIEW_TOOLTIP_CLASS},.${ctx.ROOM_LOG_FLOAT_CLASS},.${ctx.ROOM_DISTRIBUTION_FLOAT_CLASS}{max-width:calc(100vw - 24px);max-height:75vh;overflow:auto;box-sizing:border-box;}
@media(max-width:700px){.mwi-labyrinth-calc-clear-rate-preview{font-size:12px;}}
@media(prefers-reduced-motion:reduce){[id^="mwi-labyrinth-calc-"] *{transition:none!important;}}
`;
      document.head.append(el);
    };
    // The reference disables distribution on touch devices. Its bounded panel now works there too.
    ctx.isRoomDistributionUnsupportedDevice = () => false;
  };
})(globalThis);
