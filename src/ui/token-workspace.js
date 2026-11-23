(function (root) {
  "use strict";
  const M = root.MwiLabyrinthTokens;
  const fmt = (n) =>
    typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("zh-CN", { maximumFractionDigits: 1 }) : "—";
  const categories = { all: "全部", basic: "基础", life: "生活", combat: "战斗", exchange: "兑换" };
  const states = {
    within: "预算内",
    partial: "部分预算内",
    outside: "超出预算",
    unknown: "待核对",
    complete: "已完成"
  };
  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("mt-icon");
    svg.innerHTML =
      {
        up: '<path d="M8 13V3m-4 4 4-4 4 4"/>',
        down: '<path d="M8 3v10m-4-4 4 4 4-4"/>',
        add: '<path d="M8 3v10M3 8h10"/>',
        expand: '<path d="m4 6 4 4 4-4"/>',
        remove: '<path d="m4 4 8 8M12 4l-8 8"/>',
        drag: '<path d="M5 3h.1M10 3h.1M5 8h.1M10 8h.1M5 13h.1M10 13h.1"/>',
        item: '<path d="m3 5 5-3 5 3v6l-5 3-5-3Zm0 0 5 3 5-3M8 8v6"/>',
        upgrade: '<path d="m3 8 5-5 5 5M8 3v10M3 13h10"/>'
      }[name] || "";
    return svg;
  }
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function button(label, action, id, content) {
    const b = el("button", "", content ?? label);
    b.type = "button";
    b.dataset.action = action;
    if (id) b.dataset.id = id;
    b.setAttribute("aria-label", label);
    b.title = label;
    return b;
  }
  function symbolButton(label, action, id, symbol) {
    const b = button(label, action, id, "");
    b.append(icon(symbol));
    return b;
  }
  function itemIcon(item) {
    const node = el("span", "mt-item-icon");
    if (item?.iconHref) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const use = document.createElementNS(svg.namespaceURI, "use");
      use.setAttribute("href", item.iconHref);
      svg.append(use);
      svg.setAttribute("aria-hidden", "true");
      node.append(svg);
    } else node.append(icon(item?.kind === "item" ? "item" : "upgrade"));
    return node;
  }
  function create({ section, onPlan, onRetry, onExport, onCopy }) {
    let data,
      owner = "",
      result,
      message = "",
      undo = null,
      undoTimer = null,
      drag = null,
      disposed = false;
    const body = el("div", "mt-workspace");
    body.innerHTML = `<style>
#mwi-labyrinth-calc-tokens{container-type:inline-size;color:var(--ml-text);font:13px/1.5 system-ui,sans-serif;text-align:left;font-variant-numeric:tabular-nums}
#mwi-labyrinth-calc-tokens [hidden]{display:none!important}
#mwi-labyrinth-calc-tokens .mt-workspace{padding:14px 12px;background:var(--ml-header);min-width:0}
#mwi-labyrinth-calc-tokens button,#mwi-labyrinth-calc-tokens input,#mwi-labyrinth-calc-tokens select{font:inherit;min-height:32px;box-sizing:border-box;color:var(--ml-text);border:1px solid var(--ml-field-line);border-radius:4px;background:var(--ml-inset);max-width:100%}
#mwi-labyrinth-calc-tokens button{padding:4px 8px;background:var(--ml-hover);cursor:pointer}
#mwi-labyrinth-calc-tokens button:hover{background:var(--ml-hover-active)}
#mwi-labyrinth-calc-tokens button:disabled{opacity:.5;cursor:default}
#mwi-labyrinth-calc-tokens input,#mwi-labyrinth-calc-tokens select{padding:4px 8px;min-width:0}
#mwi-labyrinth-calc-tokens :focus-visible{outline:2px solid var(--ml-accent);outline-offset:2px}
#mwi-labyrinth-calc-tokens h3{font-size:16px;font-weight:650;margin:0}
#mwi-labyrinth-calc-tokens p{margin:6px 0}
#mwi-labyrinth-calc-tokens .mt-muted{color:var(--ml-muted)}
#mwi-labyrinth-calc-tokens .mt-heading{display:flex;align-items:baseline;justify-content:space-between;gap:8px 12px;flex-wrap:wrap}
#mwi-labyrinth-calc-tokens .mt-heading strong{font-size:20px;margin-left:8px}
#mwi-labyrinth-calc-tokens .mt-savebar:has(.mt-save[hidden]):has(.mt-error[hidden]){display:none}
#mwi-labyrinth-calc-tokens .mt-feedback:has(span:empty):has(button[hidden]){display:none}
#mwi-labyrinth-calc-tokens .mt-actions [data-action="clear"]{color:var(--ml-danger)}
#mwi-labyrinth-calc-tokens .mt-step span{display:grid}
#mwi-labyrinth-calc-tokens .mt-savebar{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px}
#mwi-labyrinth-calc-tokens .mt-error{color:var(--ml-danger)}
#mwi-labyrinth-calc-tokens .mt-feedback{display:flex;flex-wrap:wrap;align-items:center;gap:8px;color:var(--ml-accent);margin:8px 0}
#mwi-labyrinth-calc-tokens .mt-budget-area{display:grid;grid-template-columns:minmax(0,240px) minmax(0,1fr);gap:24px;align-items:start;padding-bottom:16px;border-bottom:1px solid var(--ml-line);margin-bottom:16px}
#mwi-labyrinth-calc-tokens .mt-budget-area label,#mwi-labyrinth-calc-tokens .mt-balance-metric{display:grid;gap:6px;min-width:0}
#mwi-labyrinth-calc-tokens .mt-budget-area input{width:100%;height:36px}
#mwi-labyrinth-calc-tokens .mt-balance{font-size:20px;line-height:36px;overflow-wrap:anywhere}
#mwi-labyrinth-calc-tokens [data-danger="true"] .mt-balance{color:var(--ml-danger)}
#mwi-labyrinth-calc-tokens .mt-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;align-items:start}
#mwi-labyrinth-calc-tokens .mt-queue-pane,#mwi-labyrinth-calc-tokens .mt-picker{min-width:0;container-type:inline-size}
#mwi-labyrinth-calc-tokens .mt-actions{display:flex;align-items:center;flex-wrap:wrap;gap:4px}
#mwi-labyrinth-calc-tokens .mt-actions button{font-size:12px}
#mwi-labyrinth-calc-tokens .mt-queue-heading{border-bottom:1px solid var(--ml-line);padding-bottom:10px}
#mwi-labyrinth-calc-tokens .mt-queue{display:grid;list-style:none;margin:0;padding:0}
#mwi-labyrinth-calc-tokens .mt-group{min-width:0;border-bottom:1px solid var(--ml-line)}
#mwi-labyrinth-calc-tokens .mt-group:hover{background:var(--ml-surface)}
#mwi-labyrinth-calc-tokens .mt-row{display:grid;grid-template-columns:24px 30px minmax(0,1fr) auto;grid-template-rows:auto auto;align-items:center;gap:6px 8px;padding:10px 0}
#mwi-labyrinth-calc-tokens .mt-drag{grid-column:1;grid-row:1/-1;align-self:stretch;touch-action:none;cursor:grab;min-width:24px;padding:0;background:transparent;border:0}
#mwi-labyrinth-calc-tokens .mt-identity{grid-column:3;grid-row:1;min-width:0;display:grid;gap:3px;overflow-wrap:anywhere}
#mwi-labyrinth-calc-tokens .mt-identity strong{font-size:14px;font-weight:600}
#mwi-labyrinth-calc-tokens .mt-item-icon{width:30px;height:30px;display:grid;place-items:center}
#mwi-labyrinth-calc-tokens .mt-item-icon svg{width:30px;height:30px}
#mwi-labyrinth-calc-tokens .mt-cost{grid-column:4;grid-row:1;display:grid;gap:2px;text-align:right;min-width:0}
#mwi-labyrinth-calc-tokens .mt-cost strong{font-size:16px;font-weight:600}
#mwi-labyrinth-calc-tokens .mt-cost em{font-size:12px;font-style:normal;color:var(--ml-muted)}
#mwi-labyrinth-calc-tokens [data-budget-state="within"] .mt-cost em{color:var(--ml-accent)}
#mwi-labyrinth-calc-tokens [data-budget-state="partial"] .mt-cost em{color:var(--ml-warn)}
#mwi-labyrinth-calc-tokens [data-budget-state="outside"] .mt-cost em{color:var(--ml-danger)}
#mwi-labyrinth-calc-tokens .mt-row-actions{grid-column:2/-1;grid-row:2;display:flex;flex-wrap:wrap;gap:4px;align-items:center;min-width:0}
#mwi-labyrinth-calc-tokens .mt-target-label{display:flex;align-items:center;gap:6px;color:var(--ml-muted)}
#mwi-labyrinth-calc-tokens .mt-target{width:72px;height:32px}
#mwi-labyrinth-calc-tokens .mt-order{display:flex;gap:4px;margin-left:auto}
#mwi-labyrinth-calc-tokens .mt-order button{display:grid;place-items:center;width:30px;padding:0}
#mwi-labyrinth-calc-tokens .mt-icon{display:block;width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
#mwi-labyrinth-calc-tokens .mt-cutoff{margin:0 0 8px 32px;padding:4px 8px;background:var(--ml-notice-bg,#3a3340);color:var(--ml-warn);border-radius:4px;font-size:12px}
#mwi-labyrinth-calc-tokens .mt-steps{margin-left:32px;border-top:1px solid var(--ml-line)}
#mwi-labyrinth-calc-tokens .mt-step{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:6px 8px;border-bottom:1px solid var(--ml-line)}
#mwi-labyrinth-calc-tokens .mt-step[data-over="true"] strong{color:var(--ml-danger)}
#mwi-labyrinth-calc-tokens .mt-group[data-drop="true"]{box-shadow:inset 0 2px var(--ml-accent)}
#mwi-labyrinth-calc-tokens .mt-group[data-drag="true"]{opacity:.6}
#mwi-labyrinth-calc-tokens .mt-picker{background:var(--ml-surface);border-radius:6px}
#mwi-labyrinth-calc-tokens .mt-picker-toggle{display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;min-height:42px;text-align:left;border:0;background:transparent;color:var(--ml-accent)}
#mwi-labyrinth-calc-tokens .mt-picker-body{border-top:1px solid var(--ml-line)}
#mwi-labyrinth-calc-tokens .mt-catalog-heading{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding:10px}
#mwi-labyrinth-calc-tokens .mt-search{flex:1 1 120px;width:100%}
#mwi-labyrinth-calc-tokens .mt-categories{display:flex;gap:4px;flex-wrap:wrap;padding:0 10px 8px;border-bottom:1px solid var(--ml-line)}
#mwi-labyrinth-calc-tokens .mt-categories button{border:0;background:transparent;color:var(--ml-muted)}
#mwi-labyrinth-calc-tokens .mt-categories [aria-pressed="true"]{background:var(--ml-selected-bg,#2d4947);color:var(--ml-accent)}
#mwi-labyrinth-calc-tokens .mt-catalog{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,156px),1fr));gap:2px;padding:6px;max-height:340px;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--ml-field-line) var(--ml-surface)}
#mwi-labyrinth-calc-tokens .mt-tile{display:grid;grid-template-columns:30px minmax(0,1fr);align-items:center;gap:8px;padding:6px;border:1px solid transparent;background:transparent;text-align:left;min-height:66px}
#mwi-labyrinth-calc-tokens .mt-tile>span:last-child{display:grid;gap:2px;min-width:0;overflow-wrap:anywhere}
#mwi-labyrinth-calc-tokens .mt-tile strong{font-size:14px;font-weight:500}
#mwi-labyrinth-calc-tokens .mt-tile[data-planned="true"]{background:var(--ml-selected-bg,#2d4947);border-color:var(--ml-selected-line,#527d73)}
#mwi-labyrinth-calc-tokens .mt-empty{padding:16px 0;color:var(--ml-muted)}
@container (min-width:720px){#mwi-labyrinth-calc-tokens .mt-layout[data-picker-open="true"]{grid-template-columns:minmax(0,1.25fr) minmax(0,1fr)}}
@container (max-width:370px){#mwi-labyrinth-calc-tokens .mt-row{grid-template-columns:20px 28px minmax(0,1fr);gap:6px}#mwi-labyrinth-calc-tokens .mt-drag{grid-row:1/4;min-width:20px}#mwi-labyrinth-calc-tokens .mt-cost{grid-column:2/-1;grid-row:2;display:flex;flex-wrap:wrap;gap:4px 8px;text-align:left}#mwi-labyrinth-calc-tokens .mt-row-actions{grid-row:3}#mwi-labyrinth-calc-tokens .mt-order{margin-left:0}#mwi-labyrinth-calc-tokens .mt-budget-area{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}}
</style>
<div class="mt-savebar"><span class="mt-save mt-muted" role="status"></span><button data-action="retry" hidden>重试保存</button><span class="mt-error" role="alert" hidden></span></div>
<div class="mt-feedback" role="status"><span></span><button data-action="undo" hidden>撤销清空</button></div>
<section class="mt-budget-area" aria-label="代币预算"><label>规划数量<input data-budget="budget" type="number" min="0" step="1" aria-label="规划数量" placeholder="使用当前数量"></label><div class="mt-balance-metric"><span>剩余数量</span><strong class="mt-balance" role="status"></strong></div></section>
<div class="mt-layout"><section class="mt-queue-pane" aria-label="代币使用计划"><div class="mt-heading mt-queue-heading"><span><h3>使用计划</h3></span><div class="mt-actions"><button data-action="copy">复制计划</button><button data-action="export-plan">导出 CSV</button><button data-action="clear">清空计划</button></div></div><ol class="mt-queue"></ol><div class="mt-empty mt-queue-empty">暂无计划</div></section>
<section class="mt-picker"><button class="mt-picker-toggle" data-action="picker" aria-controls="mwi-labyrinth-token-picker"><span class="mt-picker-title">收起商店目录</span></button><div class="mt-picker-body" id="mwi-labyrinth-token-picker"><div class="mt-catalog-heading"><input class="mt-search" type="search" placeholder="搜索升级或商品" aria-label="搜索升级或商品" maxlength="200"></div><div class="mt-categories" role="group" aria-label="商店项目分类"></div><div class="mt-catalog"></div><p class="mt-filter-empty mt-muted" hidden>没有匹配的项目。</p></div></section></div>

`;
    section.append(body);
    const $ = (s) => body.querySelector(s);
    for (const [key, label] of Object.entries(categories)) $(".mt-categories").append(button(label, "category", key));
    function feedback(text = "") {
      message = text;
      $(".mt-feedback span").textContent = text;
    }
    function discardUndo() {
      undo = null;
      clearTimeout(undoTimer);
      undoTimer = null;
    }
    function commit(next, keepUndo = false) {
      if (!data?.loaded) return;
      try {
        M.validatePlan(next);
        if (!keepUndo) discardUndo();
        $(".mt-error").hidden = true;
        onPlan(next);
      } catch (e) {
        $(".mt-error").textContent = e.message;
        $(".mt-error").hidden = false;
      }
    }
    function changeUi(patch) {
      const plan = structuredClone(data.profile.plan);
      plan.ui = { ...M.preferences(plan), ...patch };
      commit(plan, true);
    }
    function captureFocus() {
      const node = document.activeElement;
      if (!body.contains(node)) return null;
      return {
        action: node.dataset.action,
        id: node.dataset.id || node.dataset.target,
        target: !!node.dataset.target,
        value: node.value,
        start: node.selectionStart,
        index: [...$(".mt-queue").children].indexOf(node.closest(".mt-group"))
      };
    }
    function restoreFocus(focus) {
      if (!focus?.id) return;
      let target = [...body.querySelectorAll(focus.target ? "[data-target]" : "[data-action]")].find(
        (n) =>
          !n.disabled &&
          (n.dataset.id || n.dataset.target) === focus.id &&
          (focus.target || n.dataset.action === focus.action)
      );
      if (focus.target && target) target.value = focus.value;
      if (!target)
        target =
          [...body.querySelectorAll("[data-target]")].find((n) => n.dataset.target === focus.id) ||
          body.querySelectorAll("[data-target]")[Math.max(0, Math.min(focus.index, result.groups.length - 1))] ||
          $(".mt-search");
      target?.focus({ preventScroll: true });
    }
    function filter() {
      const prefs = M.preferences(data.profile.plan),
        query = $(".mt-search").value.trim().toLocaleLowerCase();
      let count = 0;
      for (const tile of body.querySelectorAll(".mt-tile")) {
        tile.hidden =
          (prefs.category !== "all" && tile.dataset.category !== prefs.category) ||
          !tile.dataset.search.includes(query);
        if (!tile.hidden) count++;
      }
      $(".mt-filter-empty").hidden = count !== 0;
    }
    function renderQueue(prefs) {
      $(".mt-queue").replaceChildren();
      for (let index = 0; index < result.groups.length; index++) {
        const g = result.groups[index],
          item = g.item,
          name = item?.name || g.id;
        const group = el("li", "mt-group");
        group.dataset.id = g.id;
        group.dataset.budgetState = g.budgetState;
        group.setAttribute("aria-posinset", index + 1);
        group.setAttribute("aria-setsize", result.groups.length);
        const row = el("div", "mt-row"),
          handle = symbolButton(`拖动${name}排序`, "drag", g.id, "drag");
        handle.className = "mt-drag";
        const identity = el("span", "mt-identity");
        identity.append(
          el("strong", "", name),
          el(
            "span",
            "",
            item?.kind === "item" ? `共 ${fmt(g.target * item.output)} 个` : `${fmt(item?.current)} → ${g.target} 级`
          )
        );
        const cost = el("span", "mt-cost");
        cost.append(el("strong", "", `${fmt(g.cost)} 代币`), el("em", "", states[g.budgetState]));
        row.append(handle, itemIcon(item), identity, cost);
        const actions = el("div", "mt-row-actions"),
          label = el("label", "mt-target-label", item?.kind === "item" ? "兑换次数" : "目标等级");
        const input = el(item?.kind === "upgrade" && item.current !== null ? "select" : "input", "mt-target");
        input.dataset.target = g.id;
        input.setAttribute("aria-label", `${name}的${item?.kind === "item" ? "兑换次数" : "目标等级"}`);
        if (input.tagName === "SELECT") {
          for (let level = Math.min(g.target, item.current + 1); level <= item.max; level++) {
            const option = el("option", "", `${level} 级`);
            option.value = level;
            input.append(option);
          }
        } else {
          input.type = "number";
          input.min = "1";
          input.max = item?.max ?? 1000000;
          input.step = "1";
        }
        input.value = g.target;
        input.disabled = !data.loaded || !item || item.current === null;
        label.append(input);
        actions.append(label);
        const order = el("span", "mt-order");
        for (const [action, text, symbol, disabled] of [
          ["up", "上移", "up", index === 0],
          ["down", "下移", "down", index === result.groups.length - 1],
          ["expand", prefs.expanded.includes(g.id) ? "收起" : "展开", "expand", false],
          ["remove", "移除", "remove", false]
        ]) {
          const b = symbolButton(`${text}${name}${action === "expand" ? "费用明细" : ""}`, action, g.id, symbol);
          b.disabled = !data.loaded || disabled;
          if (action === "expand") {
            b.setAttribute("aria-expanded", prefs.expanded.includes(g.id));
            b.setAttribute("aria-controls", `mwi-labyrinth-token-steps-${index}`);
          }
          order.append(b);
        }
        actions.append(order);
        row.append(actions);
        group.append(row);
        if (result.cutoff?.id === g.id)
          group.append(
            el(
              "div",
              "mt-cutoff",
              `预算可${item.kind === "item" ? `兑换 ${g.covered} 次` : `升至 ${g.affordableTarget} 级`}；下一${item.kind === "item" ? "次" : "级"}还差 ${fmt(result.cutoff.shortfall)} 代币。`
            )
          );
        const steps = el("div", "mt-steps");
        steps.id = `mwi-labyrinth-token-steps-${index}`;
        steps.hidden = !prefs.expanded.includes(g.id);
        for (const step of g.steps) {
          const node = el("div", "mt-step");
          node.dataset.over = step.fits === false;
          const copy = el(
            "span",
            "",
            item.kind === "item" ? `${g.target} 次 × ${fmt(item.cost)} 代币` : `${step.from} → ${step.to} 级`
          );
          copy.append(
            el(
              "span",
              "",
              `累计 ${fmt(step.cumulative)} · ${step.fits === null ? "待核对" : step.fits ? "预算内" : "超出预算"}`
            )
          );
          node.append(copy, el("strong", "", fmt(step.cost)));
          steps.append(node);
        }
        group.append(steps);
        $(".mt-queue").append(group);
      }
    }
    function render() {
      if (!data || disposed || drag) return;
      const plan = data.profile.plan,
        prefs = M.preferences(plan),
        focus = captureFocus();
      // Legacy forecast/reserve fields remain readable but no longer affect this budget-only view.
      result = M.buildPlan(
        { ...plan, reserve: 0, futureRuns: 0, perRun: null, forecastStart: null },
        data.catalog,
        data.balance,
        []
      );
      $(".mt-save").textContent = data.saveError ? "未保存" : !data.loaded ? "正在读取" : "";
      $(".mt-save").hidden = !$(".mt-save").textContent;
      $("[data-action=retry]").hidden = !data.saveError;
      $("[data-action=retry]").textContent = data.loaded ? "重试保存" : "重试读取";
      $(".mt-error").textContent = data.saveError || "";
      $(".mt-error").hidden = !data.saveError;
      $(".mt-feedback span").textContent = message;
      $("[data-action=undo]").hidden = !undo;
      $('[data-budget="budget"]').placeholder = `当前 ${fmt(data.balance)}`;
      for (const input of body.querySelectorAll("[data-budget]")) {
        if (document.activeElement !== input) input.value = plan[input.dataset.budget] ?? "";
        input.disabled = !data.loaded;
      }
      $(".mt-balance").textContent = fmt(result.remaining);
      $(".mt-balance-metric").dataset.danger = result.remaining !== null && result.remaining < 0;
      $(".mt-queue-empty").hidden = !!result.groups.length;
      for (const action of ["copy", "export-plan", "clear"])
        $(`[data-action=${action}]`).disabled = !data.loaded || !result.groups.length;
      renderQueue(prefs);
      $(".mt-layout").dataset.pickerOpen = prefs.pickerOpen;
      $(".mt-picker-body").hidden = !prefs.pickerOpen;
      $("[data-action=picker]").setAttribute("aria-expanded", prefs.pickerOpen);
      $(".mt-picker-title").textContent = prefs.pickerOpen ? "收起商店目录" : "添加升级或商品";
      if (document.activeElement !== $(".mt-search")) $(".mt-search").value = prefs.search;
      for (const b of body.querySelectorAll('[data-action="category"]'))
        b.setAttribute("aria-pressed", b.dataset.id === prefs.category);
      const scroll = $(".mt-catalog").scrollTop;
      $(".mt-catalog").replaceChildren();
      for (const item of data.catalog) {
        const existing = plan.entries.find((e) => e.id === item.id),
          b = button(`${existing ? "查看" : "加入"}${item.name}`, "add", item.id, "");
        b.className = "mt-tile";
        b.dataset.planned = !!existing;
        b.dataset.category = item.category;
        b.dataset.search = `${item.name} ${item.id} ${item.effect}`.toLocaleLowerCase();
        b.disabled =
          !data.loaded ||
          (!existing && (item.current === null || (item.kind === "upgrade" && item.current >= item.max)));
        const text = el("span");
        text.append(
          el("strong", "", item.name),
          el(
            "span",
            "",
            existing
              ? `已加入 · 目标 ${existing.target}${item.kind === "item" ? " 次" : " 级"}`
              : item.kind === "item"
                ? `每次兑换 ${item.output} 个`
                : item.current === null
                  ? "等级未读取"
                  : `当前 ${item.current} / ${item.max} 级`
          ),
          el(
            "span",
            "",
            item.kind === "item"
              ? `${fmt(item.cost)} 代币 / 次`
              : item.current === null
                ? "费用待核对"
                : item.current >= item.max
                  ? "已满级"
                  : `下一级 ${fmt(item.costs[item.current])} 代币`
          )
        );
        b.append(itemIcon(item), text);
        $(".mt-catalog").append(b);
      }
      $(".mt-catalog").scrollTop = scroll;
      filter();
      restoreFocus(focus);
    }
    function move(id, target) {
      const plan = structuredClone(data.profile.plan),
        index = plan.entries.findIndex((e) => e.id === id);
      if (index < 0 || target < 0 || target >= plan.entries.length || index === target) return;
      plan.entries.splice(target, 0, plan.entries.splice(index, 1)[0]);
      commit(plan);
      feedback(`已调整为第 ${target + 1} 项。`);
    }
    body.addEventListener("change", (event) => {
      const input = event.target;
      if (input.matches("[data-budget]")) {
        const plan = structuredClone(data.profile.plan),
          key = input.dataset.budget,
          raw = input.value.trim();
        plan[key] = input.validity.badInput ? NaN : raw === "" ? null : Number(raw);
        commit(plan);
      } else if (input.dataset.target) {
        const plan = structuredClone(data.profile.plan),
          entry = plan.entries.find((e) => e.id === input.dataset.target),
          item = data.catalog.find((c) => c.id === entry?.id),
          value = Number(input.value);
        if (
          !entry ||
          !input.value.trim() ||
          !Number.isSafeInteger(value) ||
          value < 1 ||
          value > (item?.max ?? 0) ||
          (item?.kind === "upgrade" && value <= item.current)
        ) {
          feedback("请输入高于当前等级且不超过上限的目标；兑换次数需为正整数。");
          return;
        }
        entry.target = value;
        commit(plan);
      } else if (input.matches(".mt-search")) changeUi({ search: input.value });
    });
    body.addEventListener("input", (e) => {
      if (e.target.matches(".mt-search")) filter();
    });
    body.addEventListener("click", async (event) => {
      const b = event.target.closest("[data-action]");
      if (!b || b.disabled || !data) return;
      const action = b.dataset.action,
        id = b.dataset.id,
        plan = structuredClone(data.profile.plan),
        prefs = M.preferences(plan),
        entry = plan.entries.find((e) => e.id === id),
        item = data.catalog.find((i) => i.id === id);
      if (action === "retry") {
        onRetry();
        return;
      }
      if (action === "export-plan") {
        onExport({ text: M.planCsv(result), name: "迷宫代币计划" });
        return;
      }
      if (action === "copy") {
        const capturedOwner = owner;
        try {
          await onCopy(M.planText(result));
          if (!disposed && owner === capturedOwner) feedback("计划已复制。");
        } catch {
          if (!disposed && owner === capturedOwner) feedback("复制失败，可以使用导出 CSV。");
        }
        return;
      }
      if (!data.loaded) return;
      if (action === "picker") changeUi({ pickerOpen: !prefs.pickerOpen });
      else if (action === "category") changeUi({ category: id });
      else if (action === "expand")
        changeUi({
          expanded: prefs.expanded.includes(id) ? prefs.expanded.filter((v) => v !== id) : [...prefs.expanded, id]
        });
      else if (action === "add") {
        if (!entry && item && item.current !== null) {
          plan.entries.push({ id, target: item.kind === "item" ? 1 : item.current + 1 });
          commit(plan);
        } else if (entry) changeUi({ expanded: [...new Set([...prefs.expanded, id])] });
        [...body.querySelectorAll("[data-target]")].find((n) => n.dataset.target === id)?.focus();
      } else if (action === "up" || action === "down")
        move(id, plan.entries.findIndex((e) => e.id === id) + (action === "up" ? -1 : 1));
      else if (action === "remove") {
        plan.entries = plan.entries.filter((e) => e.id !== id);
        commit(plan);
      } else if (action === "clear") {
        discardUndo();
        undo = structuredClone(plan.entries);
        plan.entries = [];
        plan.ui = { ...prefs, pickerOpen: true };
        commit(plan, true);
        feedback("计划已清空");
        undoTimer = setTimeout(() => {
          discardUndo();
          feedback();
          render();
        }, 8000);
        $("[data-action=undo]").focus();
      } else if (action === "undo" && undo) {
        plan.entries = undo;
        discardUndo();
        commit(plan);
        feedback("已恢复计划。");
      }
    });
    body.addEventListener("keydown", (event) => {
      const handle = event.target.closest('[data-action="drag"]');
      if (!handle || !event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const index = data.profile.plan.entries.findIndex((e) => e.id === handle.dataset.id);
      move(handle.dataset.id, index + (event.key === "ArrowUp" ? -1 : 1));
    });
    body.addEventListener("pointerdown", (event) => {
      const handle = event.target.closest('[data-action="drag"]');
      if (!handle || event.button !== 0 || !data.loaded) return;
      const group = handle.closest(".mt-group");
      drag = { id: handle.dataset.id, pointer: event.pointerId, handle, target: null, owner };
      handle.setPointerCapture(event.pointerId);
      group.dataset.drag = "true";
      event.preventDefault();
    });
    body.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.pointer) return;
      const over = document.elementFromPoint(event.clientX, event.clientY)?.closest(".mt-group");
      for (const row of body.querySelectorAll(".mt-group")) row.removeAttribute("data-drop");
      if (over && body.contains(over)) {
        drag.target = over.dataset.id;
        over.dataset.drop = "true";
      }
    });
    function finishDrag(event) {
      if (!drag || event.pointerId !== drag.pointer) return;
      const previous = drag;
      drag = null;
      if (previous.handle.hasPointerCapture(event.pointerId)) previous.handle.releasePointerCapture(event.pointerId);
      if (event.type === "pointerup" && previous.owner === owner && previous.target)
        move(
          previous.id,
          data.profile.plan.entries.findIndex((e) => e.id === previous.target)
        );
      render();
      [...body.querySelectorAll('[data-action="drag"]')]
        .find((n) => n.dataset.id === previous.id)
        ?.focus({ preventScroll: true });
    }
    body.addEventListener("pointerup", finishDrag);
    body.addEventListener("pointercancel", finishDrag);
    return {
      update(next) {
        if (owner !== next.owner) {
          owner = next.owner;
          discardUndo();
          message = "";
          drag = null;
        }
        data = next;
        render();
      },
      destroy() {
        disposed = true;
        discardUndo();
        body.remove();
      }
    };
  }
  root.MwiLabyrinthTokenWorkspace = { create };
})(globalThis);
