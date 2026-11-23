// Adapted from 迷宫胜率计算器 1.6.0, dakonglong, MIT. See docs/THIRD_PARTY.md.
(function (root) {
  "use strict";
  root.MwiLabyrinthCalculatorModules ||= {};
  root.MwiLabyrinthCalculatorModules["distribution"] = function (ctx) {
    ctx.isRoomDistributionUnsupportedDevice = function isRoomDistributionUnsupportedDevice() {
      if (typeof ctx.window.matchMedia !== "function") {
        return (ctx.window.innerWidth || 1280) <= 700;
      }
      return ctx.window.matchMedia("(max-width: 700px), (pointer: coarse)").matches;
    };

    ctx.normalizeRoomDistributionStep = function normalizeRoomDistributionStep(value) {
      const numeric = Math.floor(ctx.finiteNumber(Number(value), ctx.ROOM_DISTRIBUTION_DEFAULT_STEP));
      return Math.min(ctx.ROOM_DISTRIBUTION_MAX_STEP, Math.max(ctx.ROOM_DISTRIBUTION_MIN_STEP, numeric));
    };

    ctx.getRoomDistributionStepInput = function getRoomDistributionStepInput() {
      return (
        ctx.getRoomDistributionFloatingPanel()?.querySelector(`.${ctx.CONTROL_DISTRIBUTION_STEP_INPUT_CLASS}`) || null
      );
    };

    ctx.getSelectedRoomDistributionStep = function getSelectedRoomDistributionStep() {
      return ctx.normalizeRoomDistributionStep(ctx.getRoomDistributionStepInput()?.value);
    };

    ctx.getRoomDistributionFloatingPanel = function getRoomDistributionFloatingPanel() {
      return document.getElementById(ctx.ROOM_DISTRIBUTION_FLOAT_ID);
    };

    ctx.getRoomDistributionContext = function getRoomDistributionContext(state = null) {
      const latestState = state || ctx.getGameState();
      const labyrinth = latestState?.characterLabyrinth;
      const labyrinthSignature = ctx.getLabyrinthDisplaySignature(latestState);
      if (!labyrinth || !labyrinthSignature) {
        return null;
      }
      const floor = Math.max(1, Math.floor(ctx.finiteNumber(labyrinth.currentFloor, 1)));
      const minLevel = floor * ctx.ROOM_DISTRIBUTION_LEVEL_SPAN;
      return {
        labyrinthSignature,
        floor,
        minLevel,
        maxLevel: minLevel + ctx.ROOM_DISTRIBUTION_LEVEL_SPAN
      };
    };

    ctx.clearRoomDistributionSnapshot = function clearRoomDistributionSnapshot() {
      ctx.roomDistributionRunToken += 1;
      ctx.roomDistributionSnapshot = null;
      ctx.roomDistributionProgress = null;
    };

    const enabledKey = "mwi-labyrinth:calculator:distribution-enabled:v1";
    let enabledIdentity;
    ctx.restoreRoomDistributionSetting = () => {
      const identity = ctx.storageIdentity();
      if (identity === enabledIdentity) return;
      enabledIdentity = identity;
      ctx.roomDistributionEnabled = ctx.storage.getItem(enabledKey) === "true";
      ctx.clearRoomDistributionSnapshot();
    };
    ctx.syncRoomDistributionToggleState = function syncRoomDistributionToggleState() {
      ctx.restoreRoomDistributionSetting();
      const root = ctx.getControlPanel();
      const checkbox = root?.querySelector(`.${ctx.CONTROL_DISTRIBUTION_TOGGLE_CLASS} input[type="checkbox"]`);
      if (checkbox) {
        checkbox.checked = ctx.roomDistributionEnabled;
      }
    };

    ctx.setRoomDistributionEnabled = function setRoomDistributionEnabled(enabled) {
      ctx.restoreRoomDistributionSetting();
      const nextEnabled = Boolean(enabled) && !ctx.isRoomDistributionUnsupportedDevice();
      if (ctx.roomDistributionEnabled === nextEnabled) {
        ctx.syncRoomDistributionToggleState();
        if (nextEnabled) {
          ctx.renderRoomDistributionPanel();
        }
        return;
      }
      ctx.roomDistributionEnabled = nextEnabled;
      ctx.storage.setItem(enabledKey, String(nextEnabled));
      ctx.clearRoomDistributionSnapshot();
      ctx.syncRoomDistributionToggleState();
      const panel = ctx.getRoomDistributionFloatingPanel();
      if (!nextEnabled) {
        if (panel) {
          panel.setAttribute("hidden", "hidden");
        }
        return;
      }
      ctx.renderRoomDistributionPanel();
    };

    ctx.handleRoomDistributionLabyrinthTransition = function handleRoomDistributionLabyrinthTransition(
      nextSignature = ""
    ) {
      const normalizedSignature = String(nextSignature || "");
      if (
        ctx.roomDistributionSnapshot &&
        String(ctx.roomDistributionSnapshot.labyrinthSignature || "") === normalizedSignature
      ) {
        return;
      }
      ctx.clearRoomDistributionSnapshot();
      if (ctx.roomDistributionEnabled) {
        ctx.renderRoomDistributionPanel();
      }
    };

    ctx.loadRoomDistributionPanelPosition = function loadRoomDistributionPanelPosition() {
      const fallback = {
        left: Math.max(10, (ctx.window.innerWidth || 1280) - 698),
        top: 92
      };
      try {
        const raw = ctx.storage.getItem(ctx.ROOM_DISTRIBUTION_POSITION_STORAGE_KEY);
        if (!raw) {
          return fallback;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
          return fallback;
        }
        return {
          left: Math.floor(ctx.finiteNumber(parsed.left, fallback.left)),
          top: Math.floor(ctx.finiteNumber(parsed.top, fallback.top))
        };
      } catch (_error) {
        return fallback;
      }
    };

    ctx.saveRoomDistributionPanelPosition = function saveRoomDistributionPanelPosition(position) {
      if (!position || typeof position !== "object") {
        return;
      }
      try {
        ctx.storage.setItem(
          ctx.ROOM_DISTRIBUTION_POSITION_STORAGE_KEY,
          JSON.stringify({
            left: Math.floor(ctx.finiteNumber(position.left, 0)),
            top: Math.floor(ctx.finiteNumber(position.top, 0))
          })
        );
      } catch (_error) {
        // Ignore storage errors.
      }
    };

    ctx.clampRoomDistributionPanelPosition = function clampRoomDistributionPanelPosition(panel, position) {
      const panelRect = panel ? panel.getBoundingClientRect() : null;
      const panelWidth = Math.max(280, Math.ceil(panelRect?.width || 310));
      const panelHeight = Math.max(160, Math.ceil(panelRect?.height || 300));
      const viewportWidth = Math.max(320, ctx.window.innerWidth || document.documentElement.clientWidth || 1280);
      const viewportHeight = Math.max(240, ctx.window.innerHeight || document.documentElement.clientHeight || 720);
      const margin = 8;
      return {
        left: Math.min(
          Math.max(margin, viewportWidth - panelWidth - margin),
          Math.max(margin, Math.floor(ctx.finiteNumber(position?.left, margin)))
        ),
        top: Math.min(
          Math.max(margin, viewportHeight - panelHeight - margin),
          Math.max(margin, Math.floor(ctx.finiteNumber(position?.top, margin)))
        )
      };
    };

    ctx.applyRoomDistributionPanelPosition = function applyRoomDistributionPanelPosition(
      panel,
      position,
      persist = false
    ) {
      if (!panel) {
        return;
      }
      const clamped = ctx.clampRoomDistributionPanelPosition(panel, position);
      panel.style.left = `${clamped.left}px`;
      panel.style.top = `${clamped.top}px`;
      panel.style.right = "auto";
      if (persist) {
        ctx.saveRoomDistributionPanelPosition(clamped);
      }
    };

    ctx.ensureRoomDistributionFloatingPanel = function ensureRoomDistributionFloatingPanel() {
      if (ctx.isRoomDistributionUnsupportedDevice()) {
        return null;
      }
      let root = ctx.getRoomDistributionFloatingPanel();
      if (root) {
        return root;
      }

      root = document.createElement("div");
      root.id = ctx.ROOM_DISTRIBUTION_FLOAT_ID;
      root.className = ctx.ROOM_DISTRIBUTION_FLOAT_CLASS;
      root.setAttribute("role", "region");
      root.setAttribute("aria-label", ctx.t("roomDistribution"));
      root.setAttribute("hidden", "hidden");
      root.innerHTML = `
<div class="${ctx.ROOM_DISTRIBUTION_HEADER_CLASS}">
  <div class="${ctx.ROOM_DISTRIBUTION_TITLE_CLASS}"></div>
  <button type="button" class="${ctx.ROOM_DISTRIBUTION_CLOSE_CLASS}" aria-label="${ctx.t("roomLogClose")}" title="${ctx.t("roomLogClose")}">×</button>
</div>
<div class="${ctx.ROOM_DISTRIBUTION_BODY_CLASS}">
  <label class="${ctx.CONTROL_DISTRIBUTION_STEP_CLASS}">
    <span>${ctx.t("roomDistributionStep")}</span>
    <input type="number" class="${ctx.CONTROL_DISTRIBUTION_STEP_INPUT_CLASS}" min="${ctx.ROOM_DISTRIBUTION_MIN_STEP}" max="${ctx.ROOM_DISTRIBUTION_MAX_STEP}" step="1" value="${ctx.ROOM_DISTRIBUTION_DEFAULT_STEP}" inputmode="numeric" />
    <span>%</span>
  </label>
  <div class="${ctx.ROOM_DISTRIBUTION_META_CLASS}"></div>
  <div class="${ctx.ROOM_DISTRIBUTION_LIST_CLASS}"></div>
</div>`;
      document.body.appendChild(root);
      ctx.applyRoomDistributionPanelPosition(root, ctx.loadRoomDistributionPanelPosition(), false);

      const closeButton = root.querySelector(`.${ctx.ROOM_DISTRIBUTION_CLOSE_CLASS}`);
      if (closeButton) {
        ctx.listen(closeButton, "click", (event) => {
          event?.preventDefault();
          event?.stopPropagation();
          ctx.setRoomDistributionEnabled(false);
        });
      }

      const stepInput = root.querySelector(`.${ctx.CONTROL_DISTRIBUTION_STEP_INPUT_CLASS}`);
      if (stepInput) {
        const syncStep = (finalize = false) => {
          const raw = String(stepInput.value ?? "").trim();
          if (!raw && !finalize) {
            return;
          }
          const normalized = ctx.normalizeRoomDistributionStep(raw || ctx.ROOM_DISTRIBUTION_DEFAULT_STEP);
          if (finalize || /^\d+$/.test(raw)) {
            stepInput.value = String(normalized);
          }
          ctx.renderRoomDistributionPanel();
        };
        ctx.listen(stepInput, "input", () => syncStep(false));
        ctx.listen(stepInput, "change", () => syncStep(true));
        ctx.listen(stepInput, "blur", () => syncStep(true));
      }

      const header = root.querySelector(`.${ctx.ROOM_DISTRIBUTION_HEADER_CLASS}`);
      if (header) {
        ctx.listen(header, "pointerdown", (event) => {
          const target = event?.target;
          if (
            target &&
            typeof target.closest === "function" &&
            target.closest(`.${ctx.ROOM_DISTRIBUTION_CLOSE_CLASS}`)
          ) {
            return;
          }
          if (!(event instanceof PointerEvent) || event.button !== 0) {
            return;
          }
          event.preventDefault();
          const initialRect = root.getBoundingClientRect();
          const startX = event.clientX;
          const startY = event.clientY;
          const startLeft = initialRect.left;
          const startTop = initialRect.top;
          const onMove = (moveEvent) => {
            ctx.applyRoomDistributionPanelPosition(
              root,
              {
                left: startLeft + (moveEvent.clientX - startX),
                top: startTop + (moveEvent.clientY - startY)
              },
              false
            );
          };
          const onUp = () => {
            ctx.window.removeEventListener("pointermove", onMove);
            ctx.window.removeEventListener("pointerup", onUp);
            ctx.window.removeEventListener("pointercancel", onUp);
            const finalRect = root.getBoundingClientRect();
            ctx.applyRoomDistributionPanelPosition(root, { left: finalRect.left, top: finalRect.top }, true);
          };
          ctx.listen(ctx.window, "pointermove", onMove);
          ctx.listen(ctx.window, "pointerup", onUp);
          ctx.listen(ctx.window, "pointercancel", onUp);
        });
      }

      if (!ctx.ensureRoomDistributionFloatingPanel.__resizeBound) {
        ctx.ensureRoomDistributionFloatingPanel.__resizeBound = true;
        ctx.listen(ctx.window, "resize", () => {
          if (ctx.isRoomDistributionUnsupportedDevice()) {
            ctx.setRoomDistributionEnabled(false);
            return;
          }
          const panel = ctx.getRoomDistributionFloatingPanel();
          if (!panel || panel.hasAttribute("hidden")) {
            return;
          }
          const rect = panel.getBoundingClientRect();
          ctx.applyRoomDistributionPanelPosition(panel, { left: rect.left, top: rect.top }, true);
        });
      }

      return root;
    };

    ctx.summarizeRoomDistribution = function summarizeRoomDistribution(chances, stepValue) {
      const step = ctx.normalizeRoomDistributionStep(stepValue);
      const source = Array.isArray(chances) ? chances : [];
      const binCount = Math.max(1, Math.ceil(100 / step));
      const bins = Array.from({ length: binCount }, (_unused, index) => ({
        min: index * step,
        max: Math.min(100, (index + 1) * step),
        count: 0
      }));
      for (const chanceValue of source) {
        const chance = ctx.clamp01(ctx.finiteNumber(chanceValue, 0));
        const chancePercent = chance * 100;
        const index = chance >= 1 ? bins.length - 1 : Math.min(bins.length - 1, Math.floor(chancePercent / step));
        bins[index].count += 1;
      }
      return bins.map((bin) => ({
        ...bin,
        ratio: source.length > 0 ? bin.count / source.length : 0
      }));
    };

    ctx.renderRoomDistributionPanel = function renderRoomDistributionPanel() {
      if (ctx.destroyed) return;
      const existingPanel = ctx.getRoomDistributionFloatingPanel();
      if (!ctx.roomDistributionEnabled || ctx.isRoomDistributionUnsupportedDevice()) {
        if (existingPanel) {
          existingPanel.setAttribute("hidden", "hidden");
        }
        return;
      }
      const panel = existingPanel || ctx.ensureRoomDistributionFloatingPanel();
      if (!panel) {
        return;
      }
      const context = ctx.getRoomDistributionContext();
      if (!context) {
        panel.setAttribute("hidden", "hidden");
        return;
      }
      const wasHidden = panel.hasAttribute("hidden");
      panel.removeAttribute("hidden");
      if (wasHidden) {
        ctx.applyRoomDistributionPanelPosition(panel, ctx.loadRoomDistributionPanelPosition(), false);
      }

      const title = panel.querySelector(`.${ctx.ROOM_DISTRIBUTION_TITLE_CLASS}`);
      const closeButton = panel.querySelector(`.${ctx.ROOM_DISTRIBUTION_CLOSE_CLASS}`);
      const meta = panel.querySelector(`.${ctx.ROOM_DISTRIBUTION_META_CLASS}`);
      const list = panel.querySelector(`.${ctx.ROOM_DISTRIBUTION_LIST_CLASS}`);
      if (!title || !meta || !list) {
        return;
      }
      title.textContent = ctx.t("roomDistributionTitleFmt", { floor: context.floor });
      if (closeButton) {
        closeButton.title = ctx.t("roomLogClose");
      }
      list.textContent = "";

      const fixedTrials = ctx.normalizeCombatSimTrials(ctx.AUTOMATION_RECOMMEND_COMBAT_TRIALS);
      if (
        ctx.roomDistributionProgress &&
        context &&
        ctx.roomDistributionProgress.labyrinthSignature === context.labyrinthSignature
      ) {
        meta.textContent = `${ctx.t("roomDistributionCalculatingFmt", {
          current: ctx.roomDistributionProgress.current,
          total: ctx.roomDistributionProgress.total
        })} · Lv.${context.minLevel}～${context.maxLevel} · ${ctx.t("roomDistributionTrialsFmt", { trials: fixedTrials })}`;
        return;
      }

      const snapshot =
        context && ctx.roomDistributionSnapshot?.labyrinthSignature === context.labyrinthSignature
          ? ctx.roomDistributionSnapshot
          : null;
      if (!snapshot) {
        meta.textContent = context
          ? `Lv.${context.minLevel}～${context.maxLevel} · ${ctx.t("roomDistributionWaiting")} · ${ctx.t(
              "roomDistributionTrialsFmt",
              { trials: fixedTrials }
            )}`
          : ctx.t("roomDistributionWaiting");
        return;
      }

      const validCount = Array.isArray(snapshot.chances) ? snapshot.chances.length : 0;
      meta.textContent = `${ctx.t("roomDistributionMetaFmt", {
        min: snapshot.minLevel,
        max: snapshot.maxLevel,
        valid: validCount,
        total: snapshot.totalCount,
        failed: snapshot.failedCount
      })}`;
      meta.title = ctx.t("roomDistributionTrialsFmt", { trials: fixedTrials });
      if (validCount === 0) {
        const empty = document.createElement("div");
        empty.className = ctx.ROOM_DISTRIBUTION_META_CLASS;
        empty.textContent = ctx.t("roomDistributionNoSamples");
        list.appendChild(empty);
        return;
      }

      const bins = ctx.summarizeRoomDistribution(snapshot.chances, ctx.getSelectedRoomDistributionStep());
      for (const bin of bins) {
        const row = document.createElement("div");
        row.className = ctx.ROOM_DISTRIBUTION_ROW_CLASS;
        const label = document.createElement("span");
        label.className = `${ctx.ROOM_DISTRIBUTION_ROW_CLASS}__label`;
        label.textContent = `${bin.min}%-${bin.max}%`;
        const bar = document.createElement("span");
        bar.className = ctx.ROOM_DISTRIBUTION_BAR_CLASS;
        const fill = document.createElement("span");
        fill.style.width = `${(bin.ratio * 100).toFixed(1)}%`;
        bar.appendChild(fill);
        const value = document.createElement("span");
        value.className = `${ctx.ROOM_DISTRIBUTION_ROW_CLASS}__value`;
        value.textContent = `${(bin.ratio * 100).toFixed(1)}%`;
        row.appendChild(label);
        row.appendChild(bar);
        row.appendChild(value);
        list.appendChild(row);
      }
    };

    ctx.getRoomDistributionEntries = function getRoomDistributionEntries() {
      return [
        ...ctx.LABYRINTH_AUTOMATION_SKILL_ROOM_TYPES.map((entry) => ({ ...entry, isCombat: false })),
        ...ctx.LABYRINTH_AUTOMATION_COMBAT_ROOM_TYPES.map((entry) => ({ ...entry, isCombat: true }))
      ];
    };

    ctx.calculateCurrentFloorRoomDistribution = async function calculateCurrentFloorRoomDistribution(options = {}) {
      if (!ctx.roomDistributionEnabled || ctx.isRoomDistributionUnsupportedDevice() || ctx.roomDistributionRunning) {
        return false;
      }
      const state = options.snapshot?.state || ctx.getGameState();
      const context = ctx.getRoomDistributionContext(state);
      const initClientData = ctx.getInitClientData();
      if (!state || !context || !initClientData) {
        ctx.renderRoomDistributionPanel();
        return false;
      }
      const inputSignature = options.snapshot?.inputSignature ?? ctx.calculationSignature(state);
      if (
        ctx.roomDistributionSnapshot?.labyrinthSignature === context.labyrinthSignature &&
        ctx.roomDistributionSnapshot.inputSignature === inputSignature
      ) {
        ctx.renderRoomDistributionPanel();
        return true;
      }

      const entries = ctx.getRoomDistributionEntries();
      const levels = [];
      for (let level = context.minLevel; level <= context.maxLevel; level += 1) {
        levels.push(level);
      }
      const totalCount = entries.length * levels.length;
      const maxEnhancementByItem = ctx.buildMaxEnhancementByItem(state);
      const labyrinthUpgradeLevels = options.snapshot?.labyrinthUpgradeLevels || ctx.getLabyrinthUpgradeLevels(true);
      const combatTrials = ctx.normalizeCombatSimTrials(ctx.AUTOMATION_RECOMMEND_COMBAT_TRIALS);
      const chances = [];
      let failedCount = 0;
      let completedCount = 0;
      const runToken = ++ctx.roomDistributionRunToken;
      ctx.roomDistributionRunning = true;
      ctx.roomDistributionProgress = {
        labyrinthSignature: context.labyrinthSignature,
        current: 0,
        total: totalCount
      };
      ctx.renderRoomDistributionPanel();

      const isRunStale = () =>
        ctx.destroyed ||
        options.snapshot?.isStale() ||
        runToken !== ctx.roomDistributionRunToken ||
        !ctx.roomDistributionEnabled ||
        ctx.isRoomDistributionUnsupportedDevice() ||
        ctx.getRoomDistributionContext()?.labyrinthSignature !== context.labyrinthSignature;

      try {
        for (const entry of entries) {
          for (const roomLevel of levels) {
            if (isRunStale()) {
              return false;
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
                    `distribution:${context.labyrinthSignature}:${entry.key}:${roomLevel}`,
                    { labyrinthUpgradeLevels }
                  )
                : ctx.computeRoomClearChance(state, initClientData, room, maxEnhancementByItem, {
                    labyrinthUpgradeLevels
                  });
              if (isRunStale()) return false;
              if (result && Number.isFinite(Number(result.clearChance))) {
                chances.push(ctx.clamp01(Number(result.clearChance)));
              } else {
                failedCount += 1;
              }
            } catch (error) {
              if (isRunStale()) return false;
              failedCount += 1;
              console.warn(`[Lab Clear Rate] distribution sample failed: ${entry.key} Lv.${roomLevel}`, error);
            }
            completedCount += 1;
            ctx.roomDistributionProgress = {
              labyrinthSignature: context.labyrinthSignature,
              current: completedCount,
              total: totalCount
            };
            ctx.setControlStatus({
              running: true,
              ratio: completedCount / totalCount,
              message: ctx.t("roomDistributionCalculatingFmt", { current: completedCount, total: totalCount })
            });
            ctx.renderRoomDistributionPanel();
            if (!entry.isCombat && completedCount % 10 === 0) {
              await ctx.nextFrame();
            }
          }
        }

        if (isRunStale()) {
          return false;
        }
        ctx.roomDistributionSnapshot = {
          inputSignature,
          labyrinthSignature: context.labyrinthSignature,
          floor: context.floor,
          minLevel: context.minLevel,
          maxLevel: context.maxLevel,
          chances,
          failedCount,
          totalCount,
          calculatedAt: Date.now()
        };
        return true;
      } finally {
        ctx.roomDistributionRunning = false;
        ctx.roomDistributionProgress = null;
        ctx.renderRoomDistributionPanel();
      }
    };
  };
})(globalThis);
