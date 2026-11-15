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
      markers = [],
      ranges = [];
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
    function clearRanges() {
      ranges.forEach((n) => {
        n.parentElement?.removeAttribute("data-mwi-lab-beacon-fill");
        n.remove();
      });
      ranges = [];
    }
    function clearMarkers() {
      clearRanges();
      markers.forEach((n) => n.remove());
      markers = [];
    }
    function highlight(index = null) {
      activePoint = index;
      clearRanges();
      if (!currentPlan || !map || map.beaconMode) return;
      const seen = new Set();
      const activeTargets = new Set();
      currentPlan.points.forEach((point, i) => {
        for (const target of analysis.candidates[point.id].targets) {
          if (!seen.has(target) && i === index) activeTargets.add(target);
          seen.add(target);
        }
      });
      for (const target of seen) {
        const cell = map.nodes[target];
        if (!cell?.isConnected) continue;
        const range = el("span", "mwi-lab-beacon-range");
        range.dataset.active = String(activeTargets.has(target));
        range.setAttribute("aria-hidden", "true");
        // Paint the cell background, never a layer over native labels or icons.
        // A namespaced data attribute also avoids triggering the game's class observer.
        cell.setAttribute("data-mwi-lab-beacon-fill", activeTargets.has(target) ? "active" : "preview");
        cell.append(range);
        ranges.push(range);
      }
    }
    function mark(id, label, dot = false) {
      const cell = map.nodes[id];
      if (!cell?.isConnected) return;
      const rect = cell.getBoundingClientRect();
      if (!cell.offsetWidth || !cell.offsetHeight || !rect.width || !rect.height) return;
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
        .filter(
          (n) =>
            !n.classList.contains("mwi-lab-beacon-best") &&
            !n.classList.contains("mwi-lab-beacon-pin") &&
            (n.childElementCount === 0 || n.matches("svg,img,canvas"))
        )
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
      if (!slot) return;
      const marker = el("span", dot ? "mwi-lab-beacon-best" : "mwi-lab-beacon-pin", label);
      marker.id = `mwi-labyrinth-beacon-${dot ? "best" : "pin"}-${id}`;
      marker.setAttribute("aria-hidden", "true");
      marker.style.left = `${slot[0]}px`;
      marker.style.top = `${slot[1]}px`;
      marker.style.right = "auto";
      cell.append(marker);
      markers.push(marker);
    }
    function placeHover() {
      hoverPreview.remove();
      hoverPreview.hidden = true;
      const id = map?.beaconHover,
        count = map?.beaconPreviewCount;
      const cell = Number.isInteger(id) ? map?.nodes[id] : null;
      if (!map?.beaconMode || !cell?.isConnected || !Number.isInteger(count) || count < 0) return;
      const rect = cell.getBoundingClientRect();
      if (!rect.width || !rect.height || !cell.offsetWidth || !cell.offsetHeight) return;
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
        return;
      }
      hoverPreview.style.left = `${slot[0]}px`;
      hoverPreview.style.top = `${slot[1]}px`;
    }
    function render() {
      hoverPreview.remove();
      clearMarkers();
      currentPlan = null;
      if (!map || container.hidden) return;
      placeHover();
      const supply = map.beaconAdvice || {};
      const available = Number.isInteger(supply.remaining) ? supply.remaining : 0;
      const previousQuantity = quantity;
      quantity = Math.min(preferredQuantity, quantityLimit());
      const tierName = {
        "/items/basic_beacon": "初级",
        "/items/advanced_beacon": "高级",
        "/items/expert_beacon": "专家"
      }[supply.item];
      meta.textContent = `${quantity}/${supply.remaining ?? "—"}`;
      if (tierName) meta.title = `${tierName}探照灯 · 剩余 ${supply.remaining ?? "—"}`;
      off.setAttribute("aria-pressed", String(quantity === 0));
      input.max = String(quantityLimit());
      if (document.activeElement !== input || quantity !== previousQuantity) input.value = String(quantity);
      input.disabled = !analysis || !knownInventory();
      minus.disabled = quantity === 0;
      plus.disabled = !analysis || !knownInventory() || quantity >= map.cells.length;
      plus.dataset.limit = String(unlockPending);
      stepper.dataset.unlocked = String(unlocked);
      input.dataset.overstock = String(quantity > available);
      plus.setAttribute(
        "aria-description",
        unlockPending ? "再次激活可超出库存规划" : "到库存上限后，激活两次可解除限制"
      );
      if (quantity === 0) {
        total.textContent = "未启用";
        return;
      }
      const native = analysis?.candidates[map.beaconHover];
      const mismatch =
        map.beaconMode && native && map.beaconPreviewCount != null && native.count !== map.beaconPreviewCount;
      if (!analysis || !knownInventory() || (!unlocked && available === 0) || mismatch) {
        total.textContent = mismatch
          ? "范围不一致"
          : !analysis
            ? "未识别"
            : supply.remaining === 0
              ? "已用完"
              : "未知余量";
        return;
      }
      if (!cache.has(quantity)) cache.set(quantity, root.MwiLabyrinthBeacons.plan(analysis, quantity));
      const result = cache.get(quantity);
      currentPlan = result;
      total.textContent = `+${result.total}格揭示`;
      result.points.forEach((point, i) => {
        mark(point.id, String(i + 1));
      });
      highlight(activePoint);
    }
    function update(nextMap) {
      map = nextMap;
      container.hidden = false;
      const nextScope = JSON.stringify([map.floorKey, map.size, map.beaconAdvice?.item]);
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
      if (nextKey !== key) {
        key = nextKey;
        activePoint = null;
        cache.clear();
        analysis = root.MwiLabyrinthBeacons.analyze(map, map.beaconAdvice?.item);
      }
      render();
    }
    function hide() {
      container.hidden = true;
      hoverPreview.hidden = true;
      hoverPreview.remove();
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
    document.defaultView.addEventListener("resize", render);
    return {
      element: container,
      update,
      layout: render,
      hide,
      destroy() {
        hide();
        document.defaultView.removeEventListener("resize", render);
        container.remove();
        style.remove();
      }
    };
  }
  root.MwiLabyrinthBeaconView = { create };
})(globalThis);
