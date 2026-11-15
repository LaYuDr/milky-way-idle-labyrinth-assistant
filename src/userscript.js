(function () {
  "use strict";
  const key = "__mwiLabyrinthAssistant";
  if (globalThis[key]) return;
  const core = globalThis.MwiLabyrinthCore;
  let calculator = null;
  let view = null,
    timer = null,
    observer = null,
    destroyed = false,
    fingerprint = null,
    lastNodes = [],
    previousRoute = null,
    previousQueue = [],
    routeFingerprint = null;
  function refresh() {
    if (destroyed || typeof document === "undefined" || document.hidden) return;
    try {
      if (globalThis.MwiLabyrinthSidebar.enabled) globalThis.MwiLabyrinthSidebar.ensure(document).mount();
      const state = calculator?.context?.getGameState?.();
      const map = globalThis.MwiLabyrinthMapReader.read(document, state);
      if (!map) {
        view?.hide();
        fingerprint = null;
        routeFingerprint = null;
        previousRoute = null;
        return;
      }
      globalThis.MwiLabyrinthShrouds?.apply(map, state);
      globalThis.MwiLabyrinthBeacons?.apply(map, state);
      const terrainSignature = JSON.stringify([
        map.size,
        map.cells,
        map.floorKey,
        map.shroudCount,
        map.shroudInfoKnown
      ]);
      const signature = JSON.stringify([terrainSignature, map.queue]);
      if (
        signature === fingerprint &&
        document.getElementById("mwi-labyrinth-planner") &&
        map.nodes.every((node, index) => node === lastNodes[index])
      ) {
        view?.updateReveal(map);
        return;
      }
      if (!view) view = globalThis.MwiLabyrinthView.create(document);
      // Only following the current recommendation can retain its tie preference.
      // Cancellation, reordering, another branch, new room facts or another floor start fresh.
      const added = map.queue.slice(previousQueue.length);
      const offset = previousRoute?.indexOf(added[0]) ?? -1;
      const followsRoute =
        terrainSignature === routeFingerprint &&
        map.queue.length >= previousQueue.length &&
        previousQueue.every((id, i) => map.queue[i] === id) &&
        (added.length === 0 ||
          (offset >= 0 && offset <= 1 && added.every((id, i) => previousRoute[offset + i] === id)));
      const result = core.plan(map, { preferredPath: followsRoute ? previousRoute : undefined });
      previousRoute = (result.main || result.breakthrough)?.path || null;
      previousQueue = [...map.queue];
      routeFingerprint = terrainSignature;
      view.update(map, result);
      fingerprint = signature;
      lastNodes = map.nodes;
    } catch (error) {
      fingerprint = null;
      routeFingerprint = null;
      previousRoute = null;
      if (!view) view = globalThis.MwiLabyrinthView.create(document);
      view.error(`无法规划：${error.message}`, document.querySelector('[class*="LabyrinthPanel_roomGrid"]'));
    }
  }
  const instance = Object.freeze({
    version: "__BUILD_VERSION__",
    status: "ready",
    plan: core?.plan,
    destroy() {
      destroyed = true;
      if (timer !== null) clearInterval(timer);
      observer?.disconnect();
      view?.destroy();
      calculator?.destroy();
      globalThis.MwiLabyrinthSidebar.destroy();
      if (globalThis[key] === instance) delete globalThis[key];
    }
  });
  globalThis[key] = instance;
  if (typeof document !== "undefined") {
    view = globalThis.MwiLabyrinthView.create(document);
    view.hide();
    try {
      calculator = globalThis.MwiLabyrinthCalculator.create({
        getControlHost(grid) {
          if (!view) view = globalThis.MwiLabyrinthView.create(document);
          return view.calculationHost(grid);
        }
      });
    } catch (error) {
      console.error("[迷宫助手] 胜率模块启动失败", error);
    }
    const gridSelector = '[class*="LabyrinthPanel_roomGrid"]';
    const supplySelector = '[class*="LabyrinthPanel_supplyWithButton"]';
    const owned = '[id^="mwi-labyrinth-"], .mwi-lab-route, [class^="mwi-labyrinth-calc-"]';
    const observation = {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden", "href", "xlink:href", "src"]
    };
    observer = new MutationObserver((records) => {
      const relevant = records.some((record) => {
        const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        if (!target || target.closest(owned)) return false;
        if (target.closest(supplySelector)) return true;
        if (record.type !== "childList")
          return Boolean(target.closest(gridSelector) || target.querySelector(gridSelector));
        const nodes = [...record.addedNodes, ...record.removedNodes].filter(
          (node) => node.nodeType !== 1 || !node.matches(owned)
        );
        return (
          nodes.length &&
          (target.closest(gridSelector) ||
            nodes.some(
              (node) =>
                node.nodeType === 1 &&
                (node.matches(`${gridSelector}, ${supplySelector}`) ||
                  node.querySelector(`${gridSelector}, ${supplySelector}`))
            ))
        );
      });
      if (!relevant) return;
      observer.disconnect();
      try {
        refresh();
      } finally {
        if (!destroyed) observer.observe(document.documentElement, observation);
      }
    });
    refresh();
    observer.observe(document.documentElement, observation);
    timer = setInterval(refresh, 1000);
  }
})();
