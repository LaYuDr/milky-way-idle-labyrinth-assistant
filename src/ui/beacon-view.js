(function (root) {
  "use strict";
  const css = `
#mwi-labyrinth-planner .mwi-lab-beacons{border-top:1px solid var(--ml-line,#44485c);padding-top:10px;margin-top:10px;font-size:12px;}
#mwi-labyrinth-planner .mwi-lab-beacons header{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:8px;}
#mwi-labyrinth-planner .mwi-lab-beacons header strong{font-size:13px;}
#mwi-labyrinth-planner .mwi-lab-beacons small{color:var(--ml-muted,#b8bfd0);font-size:11px;}
#mwi-labyrinth-planner .mwi-lab-beacon-preview{color:var(--ml-accent,#8cdecd);font-weight:650;font-size:16px;line-height:1.5;}
#mwi-labyrinth-planner .mwi-lab-beacon-actions{display:flex;gap:5px;flex-wrap:wrap;margin:7px 0;}
#mwi-labyrinth-planner .mwi-lab-beacons button{font:inherit;color:inherit;background:var(--ml-inset,#191b29);border:1px solid var(--ml-line,#44485c);border-radius:3px;padding:4px 7px;min-height:28px;cursor:pointer;}
#mwi-labyrinth-planner .mwi-lab-beacons button:hover{background:var(--ml-hover,#34384f);}
#mwi-labyrinth-planner .mwi-lab-beacons button:disabled{opacity:.5;cursor:default;}
#mwi-labyrinth-planner .mwi-lab-beacons button[aria-pressed="true"]{border-color:var(--ml-accent,#8cdecd);color:var(--ml-accent,#8cdecd);}
#mwi-labyrinth-planner .mwi-lab-beacon-stepper[data-unlocked="true"]{border-color:var(--ml-warn,#e9c487);}
#mwi-labyrinth-planner .mwi-lab-beacon-quantity[data-overstock="true"]{color:var(--ml-warn,#e9c487);}
#mwi-labyrinth-planner .mwi-lab-beacons [hidden]{display:none;}
#mwi-labyrinth-planner .mwi-lab-beacons button[data-limit="true"]{color:var(--ml-warn,#e9c487);background:var(--ml-notice-bg,#3a3340);}
#mwi-labyrinth-planner .mwi-lab-beacons button:active:not(:disabled){background:var(--ml-hover-active,#454e68);}
#mwi-labyrinth-planner .mwi-lab-beacons :is(button,input):focus-visible{outline:2px solid var(--ml-accent,#8cdecd);outline-offset:-2px;}
.mwi-lab-beacon-pin{position:absolute!important;box-sizing:border-box!important;pointer-events:none!important;z-index:2;font:600 10px/16px system-ui!important;background:#c5d6e9!important;color:#243448!important;border:0!important;border-radius:50%!important;padding:0!important;width:16px!important;height:16px!important;text-align:center}.mwi-lab-beacon-range{display:none!important;pointer-events:none!important;}
#mwi-labyrinth-planner .mwi-lab-beacon-stepper{display:flex;align-items:center;border:1px solid var(--ml-line,#44485c);border-radius:4px;overflow:hidden;gap:3px;}
#mwi-labyrinth-planner .mwi-lab-beacon-stepper button{border:0;border-radius:0;min-width:28px;}
#mwi-labyrinth-planner .mwi-lab-beacon-quantity{width:44px;min-width:0;padding:4px 0;background:transparent;color:inherit;border:0;text-align:center;font:inherit;appearance:textfield;}
#mwi-labyrinth-planner .mwi-lab-beacon-quantity::-webkit-inner-spin-button{appearance:none;}
#mwi-labyrinth-planner .mwi-lab-beacon-stepper span{font-size:11px;color:#b8bfd0;margin-right:3px;}
#mwi-labyrinth-planner .mwi-lab-beacon-error{color:#efacb2;}
#mwi-labyrinth-beacon-hover{position:absolute!important;box-sizing:border-box!important;z-index:3;pointer-events:none!important;margin:0!important;padding:0!important;width:32px!important;min-width:32px!important;max-width:32px!important;height:20px!important;min-height:20px!important;max-height:20px!important;grid-area:auto!important;justify-self:start!important;align-self:start!important;border:0!important;border-radius:4px!important;background:#c5d8e9!important;color:#23364a!important;font:650 12px/20px system-ui!important;text-align:center!important;white-space:nowrap!important;}#mwi-labyrinth-beacon-hover[hidden]{display:none!important;}
[data-mwi-lab-beacon-fill]{background-color:#486b7d!important;}
[data-mwi-lab-beacon-fill="active"]{background-color:#587e91!important;}

`;
  function create(document, reposition) {
    const style = document.createElement("style");
    style.id = "mwi-labyrinth-beacon-style";
    style.textContent = css;
    document.head.append(style);
    const el = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const container = el("section", "mwi-lab-beacons mwi-lab-beacon-container");
    container.setAttribute("aria-label", "探照灯规划");
    container.hidden = true;
    const header = el("header"),
      meta = el("small");
    header.append(el("strong", "", "探照灯"), meta);
    const controls = el("div", "mwi-lab-beacon-actions");
    const quantityLabel = el("label", "", "数量");
    quantityLabel.htmlFor = "mwi-lab-beacon-quantity";
    let map = null,
      analysis = null,
      key = null,
      quantity = 1,
      lastPinZoom = "";
    const pinMap = new Map(),
      rangeMap = new Map();
    let hoverState = { cell: null, id: null, count: null, zoom: "", siblingCount: -1, pinMarker: null, placed: false };
    let currentPlan = null,
      activePoint = null;
    // The override is local to this floor and beacon type; it never changes game inventory.
    let unlocked = false,
      unlockPending = false,
      scopeKey = null,
      lastRemaining = null;
    const quantityKey = "mwi-labyrinth:beacon-quantity:v1";
    let preferredQuantity = 1,
      savedUnlockScope = null;
    try {
      const saved = JSON.parse(document.defaultView.localStorage.getItem(quantityKey));
      if (Number.isSafeInteger(saved?.quantity) && saved.quantity >= 0) preferredQuantity = saved.quantity;
      if (typeof saved?.unlockScope === "string") savedUnlockScope = saved.unlockScope;
    } catch {
      /* Invalid or unavailable storage keeps the default quantity. */
    }
    quantity = preferredQuantity;
    function saveQuantity() {
      savedUnlockScope = unlocked && map?.floorKey ? scopeKey : null;
      try {
        document.defaultView.localStorage.setItem(
          quantityKey,
          JSON.stringify({
            quantity: preferredQuantity,
            unlockScope: savedUnlockScope
          })
        );
      } catch {
        error.textContent = "数量未能保存，刷新后需重新设置。";
        error.hidden = false;
      }
    }
    const cache = new Map();
    function knownInventory() {
      const remaining = map?.beaconAdvice?.remaining;
      return Number.isInteger(remaining) && remaining >= 0;
    }
    function quantityLimit() {
      return unlocked ? map.cells.length : Math.min(map?.beaconAdvice?.remaining ?? 0, map?.cells.length ?? 0);
    }
    function setQuantity(value) {
      quantity = value;
      preferredQuantity = value;
      if (knownInventory() && quantity <= map.beaconAdvice.remaining) unlocked = false;
      unlockPending = false;
      error.hidden = true;
      input.removeAttribute("aria-invalid");
      saveQuantity();
      activePoint = null;
      render();
      reposition();
    }
    const off = el("button", "", "不使用"),
      minus = el("button", "", "−"),
      plus = el("button", "", "＋");
    for (const b of [off, minus, plus]) b.type = "button";
    minus.setAttribute("aria-label", "减少一盏");
    plus.setAttribute("aria-label", "增加一盏");
    const input = el("input", "mwi-lab-beacon-quantity");
    input.id = quantityLabel.htmlFor;
    input.setAttribute("aria-label", "规划使用数量");
    input.type = "number";
    input.min = "0";
    input.step = "1";
    const error = el("small", "mwi-lab-beacon-error");
    error.id = "mwi-lab-beacon-quantity-error";
    error.setAttribute("role", "alert");
    error.hidden = true;
    input.setAttribute("aria-describedby", error.id);
    input.addEventListener("change", () => {
      const value = Number(input.value),
        max = quantityLimit();
      if (!input.value.trim() || !Number.isInteger(value) || value < 0 || value > max) {
        error.textContent = `请输入 0—${max} 之间的整数`;
        error.hidden = false;
        input.setAttribute("aria-invalid", "true");
        return;
      }
      setQuantity(value);
    });
    off.addEventListener("click", () => setQuantity(0));
    minus.addEventListener("click", () => setQuantity(Math.max(0, quantity - 1)));
    plus.addEventListener("blur", () => {
      if (!unlockPending) return;
      unlockPending = false;
      render();
    });
    plus.addEventListener("keydown", (event) => {
      if (event.repeat && (event.key === "Enter" || event.key === " ")) event.preventDefault();
    });
    plus.addEventListener("click", () => {
      if (!analysis || !knownInventory()) return;
      if (!unlocked && quantity >= quantityLimit()) {
        if (!unlockPending) {
          unlockPending = true;
          render();
          reposition();
          return;
        }
        unlocked = true;
      }
      setQuantity(Math.min(quantityLimit(), quantity + 1));
    });
    const card = el("div", "mwi-lab-card mwi-lab-beacon-card");
    const info = el("div", "mwi-lab-beacon-info");
    const total = el("p", "mwi-lab-beacon-preview");
    total.setAttribute("aria-live", "polite");
    const stepper = el("div", "mwi-lab-beacon-stepper");
    stepper.append(minus, input, plus);
    controls.append(stepper);
    info.append(header, total);
    card.append(info, controls);
    const hoverPreview = el("span", "mwi-lab-beacon-hover-preview");
    hoverPreview.id = "mwi-labyrinth-beacon-hover";
    hoverPreview.setAttribute("aria-live", "polite");
    hoverPreview.hidden = true;
    container.append(card, error);
    function isBeaconOverlayNode(node) {
      return (
        node === hoverPreview ||
        node.classList.contains("mwi-lab-beacon-best") ||
        node.classList.contains("mwi-lab-beacon-pin") ||
        node.classList.contains("mwi-lab-beacon-range")
      );
    }
    function nonBeaconChildCount(cell) {
      let count = 0;
      for (const child of cell.children) {
        if (!isBeaconOverlayNode(child)) count++;
      }
      return count;
    }
    function clearRanges() {
      for (const entry of rangeMap.values()) {
        entry.cell?.removeAttribute("data-mwi-lab-beacon-fill");
        entry.range.parentElement?.removeAttribute("data-mwi-lab-beacon-fill");
        entry.range.remove();
      }
      rangeMap.clear();
    }
    function clearPins() {
      for (const entry of pinMap.values()) entry.marker?.remove();
      pinMap.clear();
      lastPinZoom = "";
    }
    function clearHover() {
      if (hoverPreview.parentElement) hoverPreview.remove();
      hoverPreview.hidden = true;
      hoverState = { cell: null, id: null, count: null, zoom: "", siblingCount: -1, pinMarker: null, placed: false };
    }
    function clearMarkers() {
      clearRanges();
      clearPins();
    }
    function highlight(index = null) {
      activePoint = index;
      const desired = new Map();
      if (currentPlan && map && !map.beaconMode) {
        const seen = new Set();
        currentPlan.points.forEach((point, i) => {
          for (const target of analysis.candidates[point.id].targets) {
            if (!seen.has(target)) {
              seen.add(target);
              desired.set(target, i === index ? "active" : "preview");
            }
          }
        });
      }
      for (const [id, entry] of rangeMap.entries()) {
        const nextCell = map?.nodes[id];
        if (!desired.has(id) || entry.cell !== nextCell || !entry.range.isConnected) {
          entry.cell?.removeAttribute("data-mwi-lab-beacon-fill");
          entry.range.parentElement?.removeAttribute("data-mwi-lab-beacon-fill");
          entry.range.remove();
          rangeMap.delete(id);
        }
      }
      for (const [target, mode] of desired.entries()) {
        const cell = map.nodes[target];
        if (!cell?.isConnected) continue;
        const existing = rangeMap.get(target);
        if (existing && existing.cell === cell && existing.range.isConnected) {
          if (existing.mode !== mode) {
            existing.mode = mode;
            existing.range.dataset.active = String(mode === "active");
            cell.setAttribute("data-mwi-lab-beacon-fill", mode);
          } else if (cell.getAttribute("data-mwi-lab-beacon-fill") !== mode) {
            cell.setAttribute("data-mwi-lab-beacon-fill", mode);
          }
          continue;
        }
        const range = el("span", "mwi-lab-beacon-range");
        range.dataset.active = String(mode === "active");
        range.setAttribute("aria-hidden", "true");
        // Paint the cell background, never a layer over native labels or icons.
        // A namespaced data attribute also avoids triggering the game's class observer.
        cell.setAttribute("data-mwi-lab-beacon-fill", mode);
        cell.append(range);
        rangeMap.set(target, { range, cell, mode });
      }
    }
    function placePin(id, label, existingMarker = null, dot = false) {
      const cell = map.nodes[id];
      if (!cell?.isConnected) {
        existingMarker?.remove();
        return null;
      }
      const rect = cell.getBoundingClientRect();
      if (!cell.offsetWidth || !cell.offsetHeight || !rect.width || !rect.height) {
        existingMarker?.remove();
        return null;
      }
      // Rects are viewport pixels; CSS left/top use the cell's unscaled padding box.
      const scaleX = rect.width / cell.offsetWidth,
        scaleY = rect.height / cell.offsetHeight;
      const localWidth = cell.clientWidth,
        localHeight = cell.clientHeight;
      const originX = rect.left + cell.clientLeft * scaleX,
        originY = rect.top + cell.clientTop * scaleY;
      const width = dot ? 4 : 16,
        height = dot ? 4 : 16;
      // Never cover native levels, icons, queue numbers, progress or other assistants.
      const occupied = [...cell.querySelectorAll("*")]
        .filter((n) => !isBeaconOverlayNode(n) && (n.childElementCount === 0 || n.matches("svg,img,canvas")))
        .map((n) => n.getBoundingClientRect())
        .filter((r) => r.width && r.height)
        .map((r) => ({
          left: (r.left - originX) / scaleX,
          right: (r.right - originX) / scaleX,
          top: (r.top - originY) / scaleY,
          bottom: (r.bottom - originY) / scaleY
        }));
      const slots = [
        [localWidth - width - 2, localHeight - height - 2],
        [2, localHeight - height - 2],
        [localWidth - width - 2, 2],
        [localWidth - width - 2, localHeight / 2 - height / 2],
        [2, localHeight / 2 - height / 2]
      ];
      const slot = slots.find(
        ([x, y]) =>
          x >= 0 &&
          y >= 0 &&
          x + width <= localWidth &&
          y + height <= localHeight &&
          !occupied.some((r) => x < r.right + 1 && x + width > r.left - 1 && y < r.bottom + 1 && y + height > r.top - 1)
      );
      if (!slot) {
        existingMarker?.remove();
        return null;
      }
      const marker =
        existingMarker && existingMarker.parentElement === cell
          ? existingMarker
          : el("span", dot ? "mwi-lab-beacon-best" : "mwi-lab-beacon-pin", label);
      marker.id = `mwi-labyrinth-beacon-${dot ? "best" : "pin"}-${id}`;
      marker.setAttribute("aria-hidden", "true");
      if (marker.textContent !== label) marker.textContent = label;
      marker.style.left = `${slot[0]}px`;
      marker.style.top = `${slot[1]}px`;
      marker.style.right = "auto";
      if (marker.parentElement !== cell) cell.append(marker);
      return marker;
    }
    function syncPins(points, forceLayout = false) {
      const gridZoom = map?.grid?.style?.zoom || "";
      const zoomChanged = gridZoom !== lastPinZoom;
      const desired = new Map(points.map((point, i) => [point.id, String(i + 1)]));
      for (const [id, entry] of pinMap.entries()) {
        const nextCell = map?.nodes[id];
        if (!desired.has(id) || entry.cell !== nextCell || (entry.marker && !entry.marker.isConnected)) {
          entry.marker?.remove();
          pinMap.delete(id);
        }
      }
      for (const [id, label] of desired.entries()) {
        const cell = map.nodes[id];
        if (!cell?.isConnected) continue;
        const siblingCount = nonBeaconChildCount(cell);
        const existing = pinMap.get(id);
        if (
          existing &&
          !forceLayout &&
          !zoomChanged &&
          existing.cell === cell &&
          existing.siblingCount === siblingCount &&
          (!existing.marker || existing.marker.isConnected)
        ) {
          if (existing.marker && existing.label !== label) {
            existing.marker.textContent = label;
          }
          existing.label = label;
          continue;
        }
        const marker = placePin(id, label, existing?.marker || null);
        pinMap.set(id, { marker, cell, label, siblingCount });
      }
      lastPinZoom = gridZoom;
    }
    function placeHover(forceLayout = false) {
      const id = map?.beaconHover,
        count = map?.beaconPreviewCount;
      const cell = Number.isInteger(id) ? map?.nodes[id] : null;
      if (!map?.beaconMode || !cell?.isConnected || !Number.isInteger(count) || count < 0) {
        clearHover();
        return;
      }
      const gridZoom = map?.grid?.style?.zoom || "";
      const siblingCount = nonBeaconChildCount(cell);
      const pinMarker = pinMap.get(id)?.marker || null;
      if (
        !forceLayout &&
        hoverState.cell === cell &&
        hoverState.zoom === gridZoom &&
        hoverState.siblingCount === siblingCount &&
        hoverState.pinMarker === pinMarker &&
        (!hoverState.placed || (hoverPreview.parentElement === cell && !hoverPreview.hidden))
      ) {
        if (hoverState.placed && hoverState.count !== count) {
          hoverPreview.textContent = `+${count}`;
          hoverPreview.setAttribute("aria-label", `本次可新揭示 ${count} 格`);
          hoverState.count = count;
        }
        return;
      }
      if (hoverPreview.parentElement) hoverPreview.remove();
      hoverPreview.hidden = true;
      const rect = cell.getBoundingClientRect();
      if (!rect.width || !rect.height || !cell.offsetWidth || !cell.offsetHeight) {
        hoverState = { cell, id, count, zoom: gridZoom, siblingCount, pinMarker, placed: false };
        return;
      }
      const sx = rect.width / cell.offsetWidth,
        sy = rect.height / cell.offsetHeight;
      const ox = rect.left + cell.clientLeft * sx,
        oy = rect.top + cell.clientTop * sy;
      const occupied = [];
      const walker = document.createTreeWalker(cell, 4);
      while (walker.nextNode()) {
        if (!walker.currentNode.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(walker.currentNode);
        occupied.push(...range.getClientRects());
      }
      for (const n of cell.querySelectorAll("svg,img,canvas,progress,[role=progressbar]"))
        occupied.push(n.getBoundingClientRect());
      hoverPreview.textContent = `+${count}`;
      hoverPreview.setAttribute("aria-label", `本次可新揭示 ${count} 格`);
      hoverPreview.hidden = false;
      cell.append(hoverPreview);
      const width = hoverPreview.offsetWidth,
        height = hoverPreview.offsetHeight;
      const right = cell.clientWidth - width - 3,
        bottom = cell.clientHeight - height - 3;
      const slots = [
        [right, 3],
        [right, (cell.clientHeight - height) / 2],
        [right, bottom],
        [3, bottom],
        [3, 3]
      ];
      const slot = slots.find(
        ([x, y]) =>
          x >= 0 &&
          y >= 0 &&
          x + width <= cell.clientWidth &&
          y + height <= cell.clientHeight &&
          !occupied.some(
            (r) =>
              r.width &&
              r.height &&
              ox + x * sx < r.right + sx &&
              ox + (x + width) * sx > r.left - sx &&
              oy + y * sy < r.bottom + sy &&
              oy + (y + height) * sy > r.top - sy
          )
      );
      if (!slot) {
        hoverPreview.remove();
        hoverPreview.hidden = true;
        hoverState = { cell, id, count, zoom: gridZoom, siblingCount, pinMarker, placed: false };
        return;
      }
      hoverPreview.style.left = `${slot[0]}px`;
      hoverPreview.style.top = `${slot[1]}px`;
      hoverState = { cell, id, count, zoom: gridZoom, siblingCount, pinMarker, placed: true };
    }
    function render({ forceLayout = false } = {}) {
      if (!map || container.hidden) {
        currentPlan = null;
        clearHover();
        clearMarkers();
        return;
      }
      const supply = map.beaconAdvice || {};
      const available = Number.isInteger(supply.remaining) ? supply.remaining : 0;
      const previousQuantity = quantity;
      quantity = Math.min(preferredQuantity, quantityLimit());
      const tierName = {
        "/items/basic_beacon": "初级",
        "/items/advanced_beacon": "高级",
        "/items/expert_beacon": "专家"
      }[supply.item];
      const nextMeta = `${quantity}/${supply.remaining ?? "—"}`;
      if (meta.textContent !== nextMeta) meta.textContent = nextMeta;
      if (tierName) {
        const nextTitle = `${tierName}探照灯 · 剩余 ${supply.remaining ?? "—"}`;
        if (meta.title !== nextTitle) meta.title = nextTitle;
      }
      off.setAttribute("aria-pressed", String(quantity === 0));
      const nextMax = String(quantityLimit());
      if (input.max !== nextMax) input.max = nextMax;
      if (document.activeElement !== input || quantity !== previousQuantity) {
        const nextValue = String(quantity);
        if (input.value !== nextValue) input.value = nextValue;
      }
      input.disabled = !analysis || !knownInventory();
      minus.disabled = quantity === 0;
      plus.disabled = !analysis || !knownInventory() || quantity >= map.cells.length;
      plus.dataset.limit = String(unlockPending);
      stepper.dataset.unlocked = String(unlocked);
      input.dataset.overstock = String(quantity > available);
      const nextDesc = unlockPending ? "再次激活可超出库存规划" : "到库存上限后，激活两次可解除限制";
      if (plus.getAttribute("aria-description") !== nextDesc) plus.setAttribute("aria-description", nextDesc);

      let nextPlan = null;
      let nextTotalText = "";
      if (quantity === 0) {
        nextTotalText = "未启用";
      } else {
        const native = analysis?.candidates[map.beaconHover];
        const mismatch =
          map.beaconMode && native && map.beaconPreviewCount != null && native.count !== map.beaconPreviewCount;
        if (!analysis || !knownInventory() || (!unlocked && available === 0) || mismatch) {
          nextTotalText = mismatch
            ? "范围不一致"
            : !analysis
              ? "未识别"
              : supply.remaining === 0
                ? "已用完"
                : "未知余量";
        } else {
          if (!cache.has(quantity)) cache.set(quantity, root.MwiLabyrinthBeacons.plan(analysis, quantity));
          nextPlan = cache.get(quantity);
          nextTotalText = `+${nextPlan.total}格揭示`;
        }
      }
      if (total.textContent !== nextTotalText) total.textContent = nextTotalText;
      currentPlan = nextPlan;
      syncPins(currentPlan ? currentPlan.points : [], forceLayout);
      highlight(currentPlan ? activePoint : null);
      placeHover(forceLayout);
    }
    function update(nextMap) {
      map = nextMap;
      container.hidden = false;
      const nextScope = JSON.stringify([map.floorKey, map.size, map.beaconAdvice?.item]);
      const remaining = map.beaconAdvice?.remaining;
      const used =
        map.floorKey && nextScope === scopeKey && knownInventory() && Number.isInteger(lastRemaining)
          ? Math.max(0, lastRemaining - remaining)
          : 0;
      if (used > 0) {
        preferredQuantity = Math.max(0, quantity - used);
        if (preferredQuantity <= remaining) unlocked = false;
        unlockPending = false;
        error.hidden = true;
        input.removeAttribute("aria-invalid");
        saveQuantity();
      }
      if (nextScope !== scopeKey || !knownInventory()) {
        unlocked = Boolean(map.floorKey && knownInventory() && savedUnlockScope === nextScope);
        unlockPending = false;
        error.hidden = true;
        input.removeAttribute("aria-invalid");
      }
      if (lastRemaining !== map.beaconAdvice?.remaining) unlockPending = false;
      scopeKey = nextScope;
      lastRemaining = map.beaconAdvice?.remaining;
      const nextKey = JSON.stringify([
        map.floorKey,
        map.size,
        map.beaconAdvice?.item,
        map.cells.map((c) => Boolean(c.revealed || c.visited))
      ]);
      const keyChanged = nextKey !== key;
      if (keyChanged) {
        key = nextKey;
        activePoint = null;
        cache.clear();
        analysis = root.MwiLabyrinthBeacons.analyze(map, map.beaconAdvice?.item);
      }
      render({ forceLayout: keyChanged });
    }
    function hide() {
      container.hidden = true;
      clearHover();
      clearMarkers();
      map = null;
      unlocked = false;
      unlockPending = false;
      scopeKey = null;
      currentPlan = null;
      activePoint = null;
      key = null;
      cache.clear();
    }
    const handleResize = () => render({ forceLayout: true });
    document.defaultView.addEventListener("resize", handleResize);
    return {
      element: container,
      update,
      layout: () => render({ forceLayout: true }),
      hide,
      destroy() {
        hide();
        document.defaultView.removeEventListener("resize", handleResize);
        container.remove();
        style.remove();
      }
    };
  }
  root.MwiLabyrinthBeaconView = { create };
})(globalThis);
