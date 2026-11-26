(function (root) {
  "use strict";
  const css = `
.mwi-labyrinth-map-group{display:flex!important;justify-content:safe center!important;align-items:flex-start!important;gap:20px!important;width:100%;box-sizing:border-box;overflow-x:auto;}
.mwi-labyrinth-map-group > [class*="LabyrinthPanel_roomGrid"]{flex:none;margin:0!important;}
.mwi-labyrinth-map-group > #mwi-labyrinth-planner{position:static!important;flex:0 0 280px;width:280px;max-width:100%;margin:0;}
.mwi-labyrinth-map-group > #mwi-labyrinth-planner .mwi-lab-content{max-height:none;overflow:visible;}
.mwi-labyrinth-map-group[data-mwi-labyrinth-stacked="true"]{flex-direction:column;align-items:safe center!important;}
.mwi-labyrinth-map-group[data-mwi-labyrinth-stacked="true"] > #mwi-labyrinth-planner{flex:none;}

#mwi-labyrinth-planner { position:fixed; z-index:25; width:264px; max-width:calc(100vw - 16px); color:#eeeef5; background:#23243a; border:1px solid #555979; border-radius:6px; text-align:left; padding:10px; font:13px/1.5 system-ui,sans-serif; font-variant-numeric:tabular-nums; box-sizing:border-box; }
#mwi-labyrinth-planner .mwi-lab-launcher { display:flex; align-items:center; justify-content:space-between; gap:24px; width:100%; color:inherit; background:transparent; border:0; padding:2px 0; font:inherit; cursor:pointer; text-align:left; }
#mwi-labyrinth-planner .mwi-lab-launcher strong { font-size:14px; }
#mwi-labyrinth-planner .mwi-lab-content { max-height:65vh; overflow:auto; padding-top:16px; scrollbar-color:#747b9c #23243a; }
#mwi-labyrinth-planner .mwi-lab-route-section h3 { margin:0 0 8px; font-size:13px; }
#mwi-labyrinth-planner .mwi-lab-route-section p { margin:0 0 8px; overflow-wrap:anywhere; }
#mwi-labyrinth-planner [hidden] { display:none; }
#mwi-labyrinth-planner .mwi-lab-muted { color:#c1c4d8; font-size:12px; }
#mwi-labyrinth-planner .mwi-lab-route-section label { display:flex; align-items:center; gap:6px; margin-top:12px; font-size:12px; }
#mwi-labyrinth-planner input { accent-color:#91d8e4; }
#mwi-labyrinth-planner :focus-visible { outline:2px solid #9bdfe9; outline-offset:2px; }
.mwi-lab-route { position:absolute; left:3px; right:3px; bottom:2px; height:14px; border:0; border-bottom:3px dashed #91d8e4; pointer-events:none; z-index:2; box-sizing:border-box; }
.mwi-lab-route[data-known="true"] { border-bottom-style:solid; }
.mwi-lab-route b { position:absolute; right:0; bottom:1px; padding:0 2px; color:#91d8e4; background:#161722; font:700 10px/11px sans-serif; }
.mwi-lab-route[data-treasure="true"] { border-color:#efc778; }
.mwi-lab-route[data-treasure="true"] b { color:#efc778; }
.mwi-lab-route[data-force="true"] { border-color:#ffad66; border-bottom-style:double; border-bottom-width:4px; }
.mwi-lab-route[data-force="true"] b { color:#ffad66; }
#mwi-labyrinth-planner .mwi-lab-beacon-advice { color:#efc778; }
`;
  function create(document) {
    const style = document.createElement("style");
    style.id = "mwi-labyrinth-style";
    style.textContent =
      css +
      `
#mwi-labyrinth-planner .mwi-lab-map-zoom{display:flex;align-items:center;gap:8px;margin:10px 0;}
#mwi-labyrinth-planner .mwi-lab-map-zoom > span{white-space:nowrap;font-size:12px;margin:0;}
#mwi-labyrinth-planner .mwi-lab-map-zoom > span{margin-right:auto;}
#mwi-labyrinth-planner .mwi-lab-map-zoom button{min-width:50px;padding:4px;font-variant-numeric:tabular-nums;}
`;
    document.head.append(style);
    root.MwiLabyrinthTheme.install(document);
    const panel = document.createElement("section");
    panel.id = "mwi-labyrinth-planner";
    panel.setAttribute("aria-label", "迷宫助手：路径规划与房间计算");
    const toggleLabel = document.createElement("label"),
      toggle = document.createElement("input"),
      toggleText = document.createElement("span");
    toggle.type = "checkbox";
    toggle.checked = true;
    toggleText.textContent = "自动路线";
    toggleLabel.className = "mwi-lab-pill-toggle";
    toggleLabel.dataset.checked = "true";
    toggleLabel.append(toggle, toggleText);
    const floorLabel = document.createElement("label"),
      floorInput = document.createElement("input"),
      floorHelp = document.createElement("p"),
      displayError = document.createElement("p"),
      floorButton = document.createElement("button");
    floorLabel.className = "mwi-lab-floor-setting";
    floorInput.type = "number";
    floorInput.min = "1";
    floorInput.step = "1";
    floorInput.placeholder = "不限";
    floorInput.id = "mwi-labyrinth-route-stop-floor";
    floorHelp.id = "mwi-labyrinth-route-floor-help";
    floorHelp.className = "mwi-lab-muted";
    floorInput.setAttribute("aria-describedby", floorHelp.id);
    floorLabel.append("速通", floorInput, "层");
    floorInput.setAttribute("aria-label", "快速通过至第几层");
    displayError.className = "mwi-lab-display-error";
    displayError.setAttribute("role", "status");
    displayError.hidden = true;
    floorButton.type = "button";
    floorButton.className = "mwi-lab-floor-toggle";
    floorButton.textContent = "本层";
    const routeSegment = document.createElement("div");
    routeSegment.className = "mwi-lab-segmented";
    routeSegment.append(toggleLabel, floorButton);
    const routeCard = document.createElement("div");
    routeCard.className = "mwi-lab-card mwi-lab-route-card";
    routeCard.append(routeSegment, floorLabel);
    const note = document.createElement("p");
    note.className = "mwi-lab-muted mwi-lab-route-notice";
    const content = document.createElement("div"),
      launcher = document.createElement("header");
    content.className = "mwi-lab-content";
    content.id = "mwi-labyrinth-content";
    const routeSection = document.createElement("section"),
      calculationSlot = document.createElement("div"),
      launcherTitle = document.createElement("strong");
    routeSection.className = "mwi-lab-route-section";
    routeSection.append(routeCard, floorHelp, displayError, note);
    const zoomKey = "mwi-labyrinth:map-zoom:v1";
    let zoomPercent = 100,
      zoomGrid = null,
      originalZoom = "",
      originalZoomPriority = "";
    try {
      const saved = Number(document.defaultView.localStorage.getItem(zoomKey));
      if (Number.isInteger(saved) && saved >= 50 && saved <= 200) zoomPercent = saved;
    } catch {
      /* Storage may be unavailable; zoom still works for this session. */
    }
    const zoomControls = document.createElement("div"),
      zoomLabel = document.createElement("span"),
      zoomMinus = document.createElement("button"),
      zoomPlus = document.createElement("button"),
      zoomReset = document.createElement("button");
    zoomControls.className = "mwi-lab-map-zoom";
    zoomLabel.className = "mwi-lab-zoom-label";
    zoomLabel.textContent = "地图大小";
    zoomControls.setAttribute("role", "group");
    zoomControls.setAttribute("aria-label", "地图大小");
    for (const [button, label, symbol] of [
      [zoomMinus, "缩小地图", "−"],
      [zoomPlus, "放大地图", "+"]
    ]) {
      button.type = "button";
      button.textContent = symbol;
      button.setAttribute("aria-label", label);
      button.title = `${label} 10%`;
    }
    zoomReset.type = "button";
    zoomReset.title = "恢复 100%";
    zoomReset.setAttribute("aria-label", "恢复地图大小至 100%");
    function syncZoom() {
      zoomMinus.disabled = !zoomGrid || zoomPercent <= 50;
      zoomPlus.disabled = !zoomGrid || zoomPercent >= 200;
      zoomReset.disabled = !zoomGrid;
      zoomReset.textContent = `${zoomPercent}%`;
      if (zoomGrid) {
        if (zoomPercent === 100) {
          if (originalZoom) zoomGrid.style.setProperty("zoom", originalZoom, originalZoomPriority);
          else zoomGrid.style.removeProperty("zoom");
        } else zoomGrid.style.setProperty("zoom", `${zoomPercent}%`);
      }
    }
    function attachZoom(grid) {
      if (grid === zoomGrid) return;
      if (zoomGrid) {
        if (originalZoom) zoomGrid.style.setProperty("zoom", originalZoom, originalZoomPriority);
        else zoomGrid.style.removeProperty("zoom");
      }
      zoomGrid = grid || null;
      originalZoom = zoomGrid?.style.getPropertyValue("zoom") || "";
      originalZoomPriority = zoomGrid?.style.getPropertyPriority("zoom") || "";
      syncZoom();
    }
    function setZoom(value) {
      zoomPercent = Math.max(50, Math.min(200, value));
      syncZoom();
      schedulePosition();
      try {
        document.defaultView.localStorage.setItem(zoomKey, String(zoomPercent));
      } catch {
        zoomReset.title = "恢复 100%（当前缩放仅在本次页面有效）";
      }
    }
    zoomMinus.addEventListener("click", () => setZoom(zoomPercent - 10));
    zoomPlus.addEventListener("click", () => setZoom(zoomPercent + 10));
    zoomReset.addEventListener("click", () => setZoom(100));
    zoomControls.append(zoomLabel, zoomMinus, zoomReset, zoomPlus);
    syncZoom();
    const beaconView = root.MwiLabyrinthBeaconView.create(document, schedulePosition);
    routeSection.append(beaconView.element);
    calculationSlot.id = "mwi-labyrinth-calculation-slot";
    content.append(routeSection, calculationSlot);
    const launcherHead = document.createElement("div");
    launcherHead.className = "mwi-lab-launcher-head";
    launcher.className = "mwi-lab-launcher";
    launcherTitle.textContent = "迷宫助手";
    launcherHead.append(launcherTitle);
    const companionLauncher = root.MwiLabyrinthCompanion?.createLauncherIntegration?.(document) || null;
    if (companionLauncher?.button) launcherHead.append(companionLauncher.button);
    launcher.append(launcherHead, zoomControls);
    if (companionLauncher?.popover) launcher.append(companionLauncher.popover);
    panel.append(launcher, content);
    const win = document.defaultView;
    const displayKey = "mwi-labyrinth:route-stop-before-floor:v1";
    let stopBeforeFloor = null,
      floorOverride = null,
      currentFloorKey = null;
    try {
      const stored = Number(win.localStorage.getItem(displayKey));
      if (Number.isSafeInteger(stored) && stored >= 1) stopBeforeFloor = stored;
    } catch {
      /* The current session remains usable when storage is unavailable. */
    }
    const routeKey = "mwi-labyrinth:route-display:v1";
    let savedRoute = {};
    try {
      const stored = JSON.parse(win.localStorage.getItem(routeKey));
      if (stored && typeof stored === "object" && !Array.isArray(stored)) savedRoute = stored;
    } catch {
      /* Invalid or unavailable storage keeps the default route settings. */
    }
    if (typeof savedRoute.automatic === "boolean") toggle.checked = savedRoute.automatic;
    toggleLabel.dataset.checked = String(toggle.checked);
    function saveRoute() {
      savedRoute = {
        automatic: toggle.checked,
        override:
          typeof currentFloorKey === "string" && typeof floorOverride === "boolean"
            ? { key: currentFloorKey, value: floorOverride }
            : null
      };
      try {
        win.localStorage.setItem(routeKey, JSON.stringify(savedRoute));
      } catch {
        displayError.textContent = "设置未能保存，刷新后需重新设置。";
        displayError.hidden = false;
      }
    }
    floorInput.value = stopBeforeFloor === null ? "" : String(stopBeforeFloor);
    let lastMap,
      lastResult,
      anchor,
      layoutHost = null,
      frame = null;
    function position() {
      if (root.MwiLabyrinthSidebar.enabled) {
        panel.hidden = false;
        panel.dataset.expanded = "true";
        content.hidden = false;
        return;
      }
      if (!anchor?.isConnected || !panel.isConnected) return;
      panel.hidden = anchor.getClientRects().length === 0;
      panel.dataset.expanded = "true";
      content.hidden = false;
      const width = anchor.getBoundingClientRect().width;
      layoutHost.dataset.mwiLabyrinthStacked = String(width + 300 > layoutHost.clientWidth);
    }

    function schedulePosition() {
      if (frame !== null) return;
      frame = win.requestAnimationFrame(() => {
        frame = null;
        position();
      });
    }
    win.addEventListener("resize", schedulePosition);
    win.addEventListener("scroll", schedulePosition, true);
    function mount(grid) {
      anchor = grid;
      if (!root.MwiLabyrinthSidebar.enabled) {
        const nextHost = grid?.parentElement;
        if (nextHost && layoutHost !== nextHost) {
          releaseLayout();
          layoutHost = nextHost;
          layoutHost.classList.add("mwi-labyrinth-map-group");
          resizeObserver?.observe(layoutHost);
          resizeObserver?.observe(grid);
        }
        if (layoutHost && panel.parentElement !== layoutHost) layoutHost.prepend(panel);
        position();
        return;
      }
      const sidebar = root.MwiLabyrinthSidebar.ensure(document);
      sidebar.mount();
      if (panel.parentElement !== sidebar.slots.planner) sidebar.slots.planner.append(panel);
      position();
    }
    const resizeObserver = typeof win.ResizeObserver === "function" ? new win.ResizeObserver(schedulePosition) : null;
    function releaseLayout() {
      resizeObserver?.disconnect();
      layoutHost?.classList.remove("mwi-labyrinth-map-group");
      if (layoutHost) delete layoutHost.dataset.mwiLabyrinthStacked;
      layoutHost = null;
    }
    function detach() {
      releaseLayout();
      anchor = null;
      panel.remove();
    }
    function clear() {
      document.querySelectorAll(".mwi-lab-route").forEach((e) => e.remove());
    }
    function routeVisible() {
      return (
        floorOverride ??
        (toggle.checked &&
          (stopBeforeFloor === null ||
            (Number.isSafeInteger(lastMap?.floor) && lastMap.floor > 0 && lastMap.floor < stopBeforeFloor)))
      );
    }
    function updateDisplayControls() {
      const visible = routeVisible();
      floorButton.textContent = "本层";
      floorButton.dataset.active = String(floorOverride === true);
      floorButton.title = visible ? "点击隐藏本层路线" : "点击显示本层路线";
      floorButton.setAttribute("aria-pressed", String(visible));
      floorButton.disabled = !lastMap || !lastResult;
      floorHelp.hidden = !(lastMap && stopBeforeFloor !== null && lastMap.floor == null);
      floorHelp.textContent = floorHelp.hidden ? "" : "暂未识别当前层，可手动显示本层路线";
    }
    function draw() {
      clear();
      updateDisplayControls();
      if (!routeVisible() || !lastMap || !lastResult) return;
      const paint = (route, isTreasure) => {
        if (!route) return;
        let number = 0;
        const seen = new Set();
        for (const id of route.path) {
          const cell = lastMap.cells[id],
            forced = route.forcedRooms?.includes(id);
          if (id === route.source || cell.visited || (cell.entered && !forced) || seen.has(id)) continue;
          seen.add(id);
          if (!cell.entered) number++;
          if (lastMap.nodes[id].querySelector(".mwi-lab-route")) continue;
          const marker = document.createElement("span");
          marker.className = "mwi-lab-route";
          marker.setAttribute("aria-hidden", "true");
          marker.dataset.known = String(cell.revealed && cell.passable === true);
          marker.dataset.treasure = String(isTreasure);
          marker.dataset.force = String(Boolean(forced));
          if (forced) marker.title = `需手动使用道具，成功率 ${Math.round(cell.forceChance * 100)}%`;
          const text = document.createElement("b");
          text.textContent = forced
            ? `${cell.entered ? "" : `${number}·`}道`
            : isTreasure
              ? id === route.target
                ? "宝"
                : "·"
              : String(number);
          marker.append(text);
          lastMap.nodes[id].append(marker);
        }
      };
      // Main-route numbers must not be replaced by an overlapping treasure branch.
      paint(lastResult.main || lastResult.breakthrough, false);
      paint(lastResult.treasures[0], true);
    }
    toggle.addEventListener("change", () => {
      toggleLabel.dataset.checked = String(toggle.checked);
      floorOverride = null;
      saveRoute();
      draw();
      position();
    });
    floorButton.addEventListener("click", () => {
      floorOverride = !routeVisible();
      saveRoute();
      draw();
    });
    floorInput.addEventListener("change", () => {
      const raw = floorInput.value.trim(),
        value = raw === "" ? null : Number(raw);
      if (floorInput.validity.badInput || (value !== null && (!Number.isSafeInteger(value) || value < 1))) {
        displayError.textContent = "请输入大于等于 1 的整数，或留空表示不限。";
        displayError.hidden = false;
        floorInput.setAttribute("aria-invalid", "true");
        position();
        return;
      }
      floorInput.removeAttribute("aria-invalid");
      stopBeforeFloor = value;
      floorOverride = null;
      displayError.hidden = true;
      saveRoute();
      try {
        if (value === null) win.localStorage.removeItem(displayKey);
        else win.localStorage.setItem(displayKey, String(value));
      } catch {
        displayError.textContent = "设置已在本次生效，但未能保存，刷新后需重新设置。";
        displayError.hidden = false;
      }
      draw();
      position();
    });
    function clearBeacons() {
      beaconView.hide();
    }
    function updateReveal(map) {
      attachZoom(map.grid);
      beaconView.update(map, lastResult);
      position();
    }
    return {
      position,
      updateReveal,
      calculationHost(grid) {
        mount(grid);
        return calculationSlot;
      },
      update(map, result) {
        const key = map.floorKey ?? map.grid;
        if (key !== currentFloorKey) {
          floorOverride =
            typeof key === "string" &&
            savedRoute.override?.key === key &&
            typeof savedRoute.override.value === "boolean"
              ? savedRoute.override.value
              : null;
          if (typeof key === "string" && savedRoute.override && savedRoute.override.key !== key) {
            savedRoute.override = null;
          }
        }
        currentFloorKey = key;
        lastMap = map;
        lastResult = result;
        mount(map.grid);
        updateReveal(map);
        const m = result.main,
          forced = result.breakthrough;
        const notices = [];
        if (!m && !forced) notices.push("暂无可行路线");
        if (forced?.forceSuccess < 1) notices.push("道具可能失败，失败后重新规划");
        const forceMessages = {
          insufficient: "道具不足，参考路线当前无法执行",
          "unknown-count": "未读到剩余道具数，请先核对",
          "unknown-item": "未识别当前道具，无法判断可突破房间",
          ineligible: "当前道具无法突破已知障碍"
        };
        if (forceMessages[result.forceStatus]) notices.push(forceMessages[result.forceStatus]);
        if (m && !m.explorationOptimal)
          routeSection.title = m.forceCount
            ? "最少道具与新格路线已找到；同成本成功率及探索收益未穷尽。"
            : "路线已找到；顺路探索收益未穷尽。";
        else routeSection.removeAttribute("title");
        note.textContent = notices.join(" · ");
        note.hidden = !notices.length;
        draw();
        beaconView.layout();
        companionLauncher?.sync?.();
        position();
      },
      error(message, grid) {
        clear();
        clearBeacons();
        if (grid) mount(grid);
        note.textContent = `${message}。地图恢复后自动重试`;
        note.hidden = false;
        routeSection.removeAttribute("title");
        lastMap = lastResult = null;
        floorOverride = null;
        updateDisplayControls();
      },
      hide() {
        attachZoom(null);
        clear();
        clearBeacons();
        companionLauncher?.close?.();
        if (root.MwiLabyrinthSidebar.enabled) mount();
        else detach();
        note.textContent = "打开迷宫地图后，可查看路线并计算房间。";
        note.hidden = false;
        if (!lastMap?.floorKey) {
          floorOverride = null;
          currentFloorKey = null;
        }
        lastMap = null;
        updateDisplayControls();
      },
      destroy() {
        attachZoom(null);
        clear();
        beaconView.destroy();
        companionLauncher?.destroy?.();
        detach();
        style.remove();
        win.removeEventListener("resize", schedulePosition);
        win.removeEventListener("scroll", schedulePosition, true);
        if (frame !== null) win.cancelAnimationFrame(frame);
      }
    };
  }
  root.MwiLabyrinthView = { create };
})(globalThis);
