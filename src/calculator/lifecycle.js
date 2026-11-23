(function (root) {
  "use strict";
  function create(options = {}) {
    const controller = new AbortController();
    const timers = new Map();
    const ctx = { destroyed: false, options };
    ctx.storageIdentity = () => {
      if (options.identity) return String(options.identity);
      try {
        const state = ctx.getGameState?.();
        return String(state?.character?.id || state?.characterId || "");
      } catch {
        return "";
      }
    };
    const storageKey = (key, identity) => {
      if (!key.startsWith("mwi-labyrinth:")) return key;
      const owner = identity === undefined ? ctx.storageIdentity() : identity;
      return owner ? `${key}:character:${owner}` : null;
    };
    ctx.storage = {
      getItem(key, identity) {
        try {
          const scoped = storageKey(key, identity);
          return scoped ? window.localStorage.getItem(scoped) : null;
        } catch {
          return null;
        }
      },
      setItem(key, value, identity) {
        try {
          const scoped = storageKey(key, identity);
          if (scoped) window.localStorage.setItem(scoped, value);
        } catch {
          /* Keep the current session usable. */
        }
      },
      removeItem(key) {
        try {
          const scoped = storageKey(key);
          if (scoped) window.localStorage.removeItem(scoped);
        } catch {
          /* No other storage is cleared. */
        }
      }
    };
    for (const kind of ["Timeout", "Interval"]) {
      ctx[`set${kind}`] = (callback, delay, ...args) => {
        if (ctx.destroyed) return 0;
        const id = window[`set${kind}`](() => {
          if (kind === "Timeout") timers.delete(id);
          if (!ctx.destroyed) callback(...args);
        }, delay);
        timers.set(id, kind);
        return id;
      };
      ctx[`clear${kind}`] = (id) => {
        timers.delete(id);
        window[`clear${kind}`](id);
      };
    }
    ctx.window = new Proxy(window, {
      get(target, key) {
        if (/^(set|clear)(Timeout|Interval)$/.test(String(key))) return ctx[key];
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    ctx.listen = (target, type, listener, options = {}) => {
      const settings = typeof options === "boolean" ? { capture: options } : options;
      target.addEventListener(type, listener, { ...settings, signal: controller.signal });
    };
    for (const name of [
      "configuration",
      "game-data",
      "room-log",
      "simulator-bridge",
      "skilling",
      "appearance",
      "previews",
      "automation",
      "history-view",
      "distribution",
      "controls",
      "combat-engine",
      "live-progress",
      "loadouts",
      "combat",
      "controller",
      "game-timing",
      "integration",
      "room-results",
      "experience",
      "recommendation-results",
      "prefill",
      "presentation",
      "preview-layout",
      "archive",
      "tokens"
    ])
      root.MwiLabyrinthCalculatorModules[name](ctx);
    let observer;
    function destroy() {
      if (ctx.destroyed) return;
      ctx.flushRoomResults?.();
      ctx.destroyed = true;
      ctx.roomDistributionRunToken += 1;
      observer?.disconnect();
      ctx.hidePreviewTooltip();
      ctx.recommendationPrefill?.dispose();
      ctx.disposePresentation?.();
      void ctx.stopChallengeArchive?.();
      ctx.stopTokens?.();
      controller.abort();
      for (const [id, kind] of timers) window[`clear${kind}`](id);
      timers.clear();
      ctx.resetCombatSimulatorWorker(new Error("迷宫助手已停止计算"));
      ctx.disposeSimulationCache();
      ctx.restoreProgressHook?.();
      ctx.clearAutomationWideLayout();
      const table = ctx.getAutomationEstimateTable();
      if (table) {
        ctx.removeAutomationEstimateColumn(table);
        ctx.removeAutomationRecommendColumn(table);
      }
      for (const el of document.querySelectorAll(
        '[id^="mwi-labyrinth-calc-"], [class*="mwi-labyrinth-calc-clear-rate-badge"], [class*="mwi-labyrinth-calc-auto-floor-"]'
      ))
        el.remove();
      for (const el of document.querySelectorAll("[data-room-x], td, th")) {
        for (const key of [
          ctx.PREVIEW_CELL_BOUND_FLAG,
          ctx.AUTOMATION_ESTIMATE_CELL_BOUND_FLAG,
          ctx.AUTOMATION_RECOMMEND_CELL_BOUND_FLAG
        ])
          delete el[key];
      }
    }
    if (options.start !== false) {
      if (ctx.isSimulatorBridgePage()) {
        ctx.bootstrapSimulatorBridgePage();
      } else {
        ctx.initializeRoomLogState();
        ctx.startRecommendationPrefill();
        ctx.installLiveActionRateWsHook();
        ctx.startChallengeArchive();
        ctx.startTokens();
        const placementSelector = '[class*="LabyrinthPanel_roomGrid"], [class*="LabyrinthPanel_automationTable"]';
        const owned = '[id^="mwi-labyrinth-"], .mwi-lab-route, [class^="mwi-labyrinth-calc-"]';
        const observation = {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["class", "style", "hidden", "aria-hidden"]
        };
        let placements = [],
          anchors = [];
        const visiblePlacements = () => {
          // Retain hidden anchors too: an ancestor outside the labyrinth can be
          // hidden and shown without adding/removing the map or table itself.
          anchors = [...document.querySelectorAll(placementSelector)];
          return anchors.filter((node) => node.getClientRects().length);
        };
        const nativePanel = '[class*="LabyrinthPanel_labyrinthPanel"]';
        const relevantMutation = (record) => {
          const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
          if (!target || target.closest(owned)) return false;
          const changed = [...record.addedNodes, ...record.removedNodes];
          if (record.type === "childList" && changed.every((node) => node.nodeType === 1 && node.matches(owned)))
            return false;
          if (target.closest(nativePanel) || placements.some((node) => node.contains(target))) return true;
          if (record.type === "attributes") return anchors.some((node) => target.contains(node));
          return changed.some(
            (node) =>
              node.nodeType === 1 &&
              (node.matches(`${placementSelector}, ${nativePanel}`) ||
                node.querySelector(`${placementSelector}, ${nativePanel}`))
          );
        };
        observer = new MutationObserver((records) => {
          if (document.hidden || !records.some(relevantMutation)) return;
          const next = visiblePlacements();
          if (next.length === placements.length && next.every((node, i) => node === placements[i])) {
            // Attribute observation is only for opening/closing. Keep data refreshes on the existing child-list path.
            if (
              (next.length || ctx.manualUpdateRunning || ctx.automationEstimateRunning) &&
              records.some((record) => record.type === "childList")
            )
              ctx.schedulePanelRefresh();
            return;
          }
          placements = next;
          // Mount/close with the native page; retain the existing debounce for data calculations.
          observer.disconnect();
          try {
            ctx.refreshControlPanelPlacement();
          } finally {
            if (!ctx.destroyed) observer.observe(document.body, observation);
          }
        });
        observer.observe(document.body, observation);
        ctx.setInterval(() => {
          if (!document.hidden && (placements.length || ctx.manualUpdateRunning || ctx.automationEstimateRunning))
            ctx.schedulePanelRefresh();
        }, ctx.PANEL_REFRESH_POLL_MS);
        ctx.listen(document, "visibilitychange", () => {
          if (!document.hidden) {
            placements = visiblePlacements();
            ctx.schedulePanelRefresh();
          }
        });
        ctx.ensureStyle();
        ctx.refreshControlPanelPlacement();
        placements = visiblePlacements();
      }
    }
    return Object.freeze({ destroy, refresh: ctx.schedulePanelRefresh, context: ctx });
  }
  root.MwiLabyrinthCalculator = Object.freeze({ create });
})(globalThis);
