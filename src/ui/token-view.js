(function (root) {
  "use strict";
  const M = root.MwiLabyrinthTokens;
  const STYLE_ID = "mwi-labyrinth-calc-tokens-style";
  const BAR_ID = "mwi-labyrinth-calc-tokens";
  const CTRL_CLASS = "mwi-labyrinth-calc-token-ctrl";
  const PLANNED_ATTR = "data-mwi-labyrinth-token-planned";
  const FLASH_ATTR = "data-mwi-labyrinth-token-flash";
  const UPGRADE_SYMBOLS = {
    labyrinth_cooldown: "/labyrinth_upgrades/cooldown",
    torch_capacity: "/labyrinth_upgrades/torch_cap",
    shroud_capacity: "/labyrinth_upgrades/shroud_cap",
    beacon_capacity: "/labyrinth_upgrades/beacon_cap",
    floor_automation: "/labyrinth_upgrades/full_auto",
    labyrinth_skilling_speed: "/labyrinth_upgrades/skill_action_speed",
    labyrinth_skilling_efficiency: "/labyrinth_upgrades/skilling_efficiency",
    labyrinth_skilling_success: "/labyrinth_upgrades/skilling_success",
    labyrinth_double_progress: "/labyrinth_upgrades/skilling_double_progress",
    labyrinth_combat_damage: "/labyrinth_upgrades/combat_damage",
    labyrinth_attack_speed: "/labyrinth_upgrades/attack_speed",
    labyrinth_cast_speed: "/labyrinth_upgrades/cast_speed",
    labyrinth_critical_rate: "/labyrinth_upgrades/critical_rate",
    labyrinth_experience: "/labyrinth_upgrades/labyrinth_experience"
  };
  const ICON_PATHS = {
    plus: '<path d="M6 2.25v7.5M2.25 6h7.5"/>',
    minus: '<path d="M2.5 6h7"/>',
    close: '<path d="M3.25 3.25l5.5 5.5M8.75 3.25l-5.5 5.5"/>'
  };
  const CSS = `
#${BAR_ID}{position:sticky;bottom:8px;z-index:5;width:fit-content;max-width:100%;margin:12px auto 0;padding:7px 12px;border:0;border-radius:12px;background:linear-gradient(180deg,rgba(36,39,60,.92),rgba(23,25,40,.96));backdrop-filter:blur(12px) saturate(1.2);-webkit-backdrop-filter:blur(12px) saturate(1.2);box-shadow:0 0 0 1px rgba(255,255,255,.1),inset 0 1px 0 rgba(255,255,255,.09),0 10px 28px rgba(0,0,0,.46);font-size:12px;line-height:1.4;color:#edf0fa;font-variant-numeric:tabular-nums;text-align:left;box-sizing:border-box}
#${BAR_ID} [hidden],.${CTRL_CLASS} [hidden]{display:none!important}
#${BAR_ID} .mwi-labyrinth-calc-token-bar{display:flex;align-items:center;flex-wrap:wrap;gap:6px 12px;min-height:26px}
#${BAR_ID} .mwi-labyrinth-calc-token-field{display:inline-flex;align-items:center;gap:6px;color:#96a0bc;font-size:11px;font-weight:500;margin:0}
#${BAR_ID} .mwi-labyrinth-calc-token-field input[type="number"]{width:78px;height:26px;min-height:0;padding:1px 8px;text-align:right;font-size:12px;font-weight:600;line-height:24px;border:0;border-radius:6px;background:rgba(12,14,24,.58);color:#f3f5fc;box-shadow:0 0 0 1px rgba(255,255,255,.1),inset 0 1px 2px rgba(0,0,0,.35);appearance:textfield;box-sizing:border-box;transition:background-color .15s ease,box-shadow .15s ease}
#${BAR_ID} .mwi-labyrinth-calc-token-field input[type="number"]::placeholder{color:#7f8aa8;font-weight:500}
#${BAR_ID} .mwi-labyrinth-calc-token-field input[type="number"]:hover:not(:disabled){box-shadow:0 0 0 1px rgba(255,255,255,.18),inset 0 1px 2px rgba(0,0,0,.35)}
#${BAR_ID} .mwi-labyrinth-calc-token-field input[type="number"]:focus{outline:none;background:rgba(15,18,30,.85);box-shadow:0 0 0 1.5px rgba(145,223,203,.78),0 0 0 4px rgba(145,223,203,.14),inset 0 1px 2px rgba(0,0,0,.3)}
#${BAR_ID} .mwi-labyrinth-calc-token-field input[type="number"]::-webkit-inner-spin-button,#${BAR_ID} .mwi-labyrinth-calc-token-field input[type="number"]::-webkit-outer-spin-button{appearance:none;margin:0}
#${BAR_ID} .mwi-labyrinth-calc-token-divider{width:1px;height:14px;background:rgba(255,255,255,.09);flex-shrink:0}
#${BAR_ID} .mwi-labyrinth-calc-token-metric{display:inline-flex;align-items:baseline;gap:5px;white-space:nowrap;color:#96a0bc;font-size:11px;font-weight:500}
#${BAR_ID} .mwi-labyrinth-calc-token-metric strong{font-size:14px;font-weight:650;letter-spacing:-.01em;color:#f3f5fc;transition:color .15s ease}
#${BAR_ID} .mwi-labyrinth-calc-token-metric[data-state="ok"] strong{color:#8ee3cc;text-shadow:0 0 12px rgba(142,227,204,.22)}
#${BAR_ID} .mwi-labyrinth-calc-token-metric[data-state="over"] strong{color:#ff9aa9;text-shadow:0 0 12px rgba(255,154,169,.22)}
#${BAR_ID} .mwi-labyrinth-calc-token-end{display:inline-flex;align-items:center;gap:6px;margin-left:auto}
#${BAR_ID} .mwi-labyrinth-calc-token-error{color:#ff9aa9;font-size:11px;font-weight:500}
#${BAR_ID} .mwi-labyrinth-calc-token-link{height:26px;min-height:0;padding:0 10px;border:0;border-radius:999px;background:rgba(255,255,255,.05);box-shadow:0 0 0 1px rgba(255,255,255,.08),inset 0 1px 0 rgba(255,255,255,.06);color:#b0b9d1;font-size:12px;font-weight:500;line-height:26px;cursor:pointer;transition:background-color .15s ease,color .15s ease,box-shadow .15s ease}
#${BAR_ID} .mwi-labyrinth-calc-token-link:hover:not(:disabled){color:#f3f5fc;background:rgba(255,255,255,.11);box-shadow:0 0 0 1px rgba(255,255,255,.16),inset 0 1px 0 rgba(255,255,255,.1)}
#${BAR_ID} .mwi-labyrinth-calc-token-clear:hover:not(:disabled){color:#ff9aa9;background:rgba(255,154,169,.12);box-shadow:0 0 0 1px rgba(255,154,169,.32)}
#${BAR_ID} .mwi-labyrinth-calc-token-list{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px;padding-top:7px;border-top:1px solid rgba(255,255,255,.07);max-height:98px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.16) transparent}
#${BAR_ID} .mwi-labyrinth-calc-token-chip{display:inline-flex;align-items:center;gap:5px;max-width:100%;height:28px;padding:0 4px 0 10px;border:0;border-radius:999px;background:rgba(255,255,255,.045);box-shadow:0 0 0 1px rgba(255,255,255,.08),inset 0 1px 0 rgba(255,255,255,.06);font-size:12px;box-sizing:border-box;transition:background-color .15s ease,box-shadow .15s ease}
#${BAR_ID} .mwi-labyrinth-calc-token-chip:hover{background:rgba(255,255,255,.085);box-shadow:0 0 0 1px rgba(145,223,203,.32),inset 0 1px 0 rgba(255,255,255,.1)}
#${BAR_ID} .mwi-labyrinth-calc-token-locate{display:inline-flex;align-items:center;gap:5px;min-width:0;padding:0;border:0;background:transparent;color:#eef1fa;font:inherit;cursor:pointer}
#${BAR_ID} .mwi-labyrinth-calc-token-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px;font-weight:500;transition:color .15s ease}
#${BAR_ID} .mwi-labyrinth-calc-token-locate:hover .mwi-labyrinth-calc-token-name{color:#91dfcb}
#${BAR_ID} .mwi-labyrinth-calc-token-qty{color:#a8b7e6;font-size:11px;font-weight:500;white-space:nowrap}
#${BAR_ID} .mwi-labyrinth-calc-token-cost{font-size:12px;font-weight:650;color:#8ee3cc;white-space:nowrap}
#${BAR_ID} .mwi-labyrinth-calc-token-chip[data-done="true"] .mwi-labyrinth-calc-token-cost{color:#8c96b2}
#${BAR_ID} .mwi-labyrinth-calc-token-remove{display:grid;place-items:center;width:22px;height:22px;min-height:0;padding:0;border:0;border-radius:999px;background:transparent;color:#8c96b2;cursor:pointer;transition:background-color .15s ease,color .15s ease}
#${BAR_ID} .mwi-labyrinth-calc-token-remove:hover:not(:disabled){color:#ff9aa9;background:rgba(255,154,169,.16)}
#${BAR_ID} .mwi-labyrinth-calc-token-svg{display:block;width:11px;height:11px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
.${CTRL_CLASS} .mwi-labyrinth-calc-token-svg{display:block;width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
[${PLANNED_ATTR}="true"]{box-shadow:inset 0 1px 0 rgba(145,223,203,.24),inset 0 0 24px rgba(145,223,203,.06),0 4px 12px rgba(0,0,0,.22)!important}
[${PLANNED_ATTR}="true"]::after{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;background:linear-gradient(135deg,rgba(145,223,203,.72) 0%,rgba(145,223,203,.24) 48%,rgba(145,223,203,.12) 100%);-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}
[${FLASH_ATTR}="true"]{box-shadow:0 0 0 2px #91dfcb,0 0 18px rgba(145,223,203,.38)!important}
.${CTRL_CLASS}{position:absolute;top:25px;right:5px;z-index:2;display:inline-flex;align-items:center;height:28px;padding:1px;border:0;border-radius:999px;background:rgba(19,21,35,.74);box-shadow:0 0 0 1px rgba(255,255,255,.15),inset 0 1px 0 rgba(255,255,255,.1),0 2px 6px rgba(0,0,0,.28);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-sizing:border-box;font:12px/1 system-ui,-apple-system,"PingFang SC",sans-serif;font-variant-numeric:tabular-nums;color:#edf0fa;transition:background-color .16s ease,box-shadow .16s ease}
.${CTRL_CLASS}:hover{background:rgba(24,28,46,.92);box-shadow:0 0 0 1px rgba(145,223,203,.52),inset 0 1px 0 rgba(255,255,255,.14),0 3px 10px rgba(0,0,0,.35)}
.${CTRL_CLASS}[data-planned="true"]{background:linear-gradient(180deg,rgba(31,42,58,.94),rgba(19,24,38,.96));box-shadow:0 0 0 1px rgba(145,223,203,.48),inset 0 1px 0 rgba(255,255,255,.12),0 2px 10px rgba(0,0,0,.36)}
.${CTRL_CLASS}[data-planned="true"]:hover{box-shadow:0 0 0 1px rgba(145,223,203,.76),inset 0 1px 0 rgba(255,255,255,.16),0 3px 12px rgba(0,0,0,.4)}
.${CTRL_CLASS} .mwi-labyrinth-calc-token-btn{display:grid;place-items:center;width:26px;height:26px;min-width:0;min-height:0;padding:0;margin:0;border:0;border-radius:999px;background:transparent;color:#d6def2;cursor:pointer;box-sizing:border-box;transition:background-color .14s ease,color .14s ease,transform .1s ease}
.${CTRL_CLASS} .mwi-labyrinth-calc-token-btn:hover:not(:disabled){background:rgba(145,223,203,.18);color:#91dfcb}
.${CTRL_CLASS} .mwi-labyrinth-calc-token-btn:active:not(:disabled){transform:scale(.88)}
.${CTRL_CLASS} .mwi-labyrinth-calc-token-btn:disabled{opacity:.32;cursor:default}
.${CTRL_CLASS} .mwi-labyrinth-calc-token-btn:focus-visible,.${CTRL_CLASS} .mwi-labyrinth-calc-token-num:focus-visible{outline:2px solid #91dfcb;outline-offset:-1px}
.${CTRL_CLASS} .mwi-labyrinth-calc-token-num{width:24px;height:26px;min-width:0;min-height:0;padding:0 1px;margin:0;border:0;border-radius:4px;background:transparent;color:#f5f7fd;font:650 12px/26px system-ui,sans-serif;text-align:center;appearance:textfield;box-sizing:border-box}
.${CTRL_CLASS} .mwi-labyrinth-calc-token-num::-webkit-inner-spin-button,.${CTRL_CLASS} .mwi-labyrinth-calc-token-num::-webkit-outer-spin-button{appearance:none;margin:0}
@media (max-width:600px){#${BAR_ID}{width:100%;bottom:4px;padding:6px 8px;border-radius:10px}#${BAR_ID} .mwi-labyrinth-calc-token-bar{gap:4px 6px}#${BAR_ID} .mwi-labyrinth-calc-token-divider{display:none}#${BAR_ID} .mwi-labyrinth-calc-token-field,#${BAR_ID} .mwi-labyrinth-calc-token-metric{gap:3px}#${BAR_ID} .mwi-labyrinth-calc-token-metric strong{font-size:13px}#${BAR_ID} .mwi-labyrinth-calc-token-field input[type="number"]{width:50px;padding:1px 4px}#${BAR_ID} .mwi-labyrinth-calc-token-link{padding:0 8px;font-size:11px}#${BAR_ID} .mwi-labyrinth-calc-token-list{max-height:64px;margin-top:5px;padding-top:5px}.${CTRL_CLASS}{top:25px;height:30px}.${CTRL_CLASS} .mwi-labyrinth-calc-token-btn{width:28px;height:28px}.${CTRL_CLASS} .mwi-labyrinth-calc-token-svg{width:13px;height:13px}.${CTRL_CLASS} .mwi-labyrinth-calc-token-num{height:28px;line-height:28px;font-size:13px}}
@media (prefers-reduced-motion:reduce){#${BAR_ID} *, .${CTRL_CLASS}, .${CTRL_CLASS} *{transition:none!important}}
`;

  const fmt = (n) =>
    typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("zh-CN", { maximumFractionDigits: 1 }) : "—";

  function glyph(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 12 12");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("mwi-labyrinth-calc-token-svg");
    svg.innerHTML = ICON_PATHS[name] || "";
    return svg;
  }

  function readReactKey(node) {
    for (const key of Object.keys(node)) {
      if (key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")) {
        const fiber = node[key];
        if (typeof fiber?.key === "string") return fiber.key;
      }
    }
    return "";
  }

  function extractSlug(card) {
    const scope = card.querySelector('[class*="LabyrinthPanel_iconContainer"]') || card;
    for (const node of scope.querySelectorAll("use, img, image")) {
      if (node.closest(`[class*="LabyrinthPanel_price"], .${CTRL_CLASS}`)) continue;
      const url = node.getAttribute("href") || node.getAttribute("xlink:href") || node.getAttribute("src") || "";
      const match = url.match(/(?:#|\/)([a-z0-9_]+)(?:\.[a-z]+)?$/i);
      if (match) return match[1];
    }
    return "";
  }

  function parseInteger(text) {
    const cleaned = String(text || "").replace(/[\s,]/g, "");
    const match = cleaned.match(/\d+/);
    return match ? Number(match[0]) : null;
  }

  function identifyCard(card, catalog, byId) {
    if (!card || !Array.isArray(catalog)) return null;
    const map = byId || new Map(catalog.map((item) => [item.id, item]));
    const reactKey = readReactKey(card);
    if (reactKey && map.has(reactKey)) return reactKey;

    const isUpgrade = String(card.className).includes("LabyrinthPanel_upgrade");
    const isItem = String(card.className).includes("LabyrinthPanel_item");
    const slug = extractSlug(card);
    if (isUpgrade && slug) {
      const id = UPGRADE_SYMBOLS[slug];
      if (id && map.has(id)) return id;
    }
    if (isItem && slug) {
      let candidates = catalog.filter((item) => item.kind === "item" && item.itemHrid === `/items/${slug}`);
      if (candidates.length === 1) return candidates[0].id;
      if (candidates.length > 1) {
        const price = parseInteger(card.querySelector('[class*="LabyrinthPanel_price"]')?.textContent);
        if (price !== null) {
          const byPrice = candidates.filter((item) => item.cost === price);
          if (byPrice.length) candidates = byPrice;
        }
        if (candidates.length === 1) return candidates[0].id;
        const nameText = card.querySelector('[class*="LabyrinthPanel_name"]')?.textContent.trim() || "";
        const leading = nameText.match(/^(\d+)\s+/);
        const output = leading ? Number(leading[1]) : 1;
        const byOutput = candidates.filter((item) => item.output === output);
        if (byOutput.length === 1) return byOutput[0].id;
      }
    }

    const nameText = card.querySelector('[class*="LabyrinthPanel_name"]')?.textContent.trim() || "";
    if (!nameText) return null;
    const kind = isUpgrade ? "upgrade" : isItem ? "item" : "";
    if (!kind) return null;
    const matched = catalog.filter((item) => {
      if (item.kind !== kind) return false;
      if (item.name === nameText) return true;
      return kind === "item" && item.output > 1 && `${item.output} ${item.name}` === nameText;
    });
    return matched.length === 1 ? matched[0].id : null;
  }

  function cardDisplayName(card, item) {
    const raw = card?.querySelector('[class*="LabyrinthPanel_name"]')?.textContent.trim();
    if (!raw) return item?.name || "";
    if (item?.kind === "item" && item.output > 1 && raw.startsWith(`${item.output} `)) {
      return raw.slice(String(item.output).length + 1).trim() || item.name;
    }
    return raw;
  }

  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS;
      (document.head || document.documentElement).append(style);
    }
    return style;
  }

  function findShopTab() {
    for (const node of document.querySelectorAll('[class*="LabyrinthPanel_labyrinthShopTab"]')) {
      if (node.isConnected && node.getClientRects().length > 0) return node;
    }
    return null;
  }

  function create({ onPlan, onRetry, onOpen }) {
    let data = null;
    let owner = "";
    let shopTab = null;
    let undo = null;
    let undoTimer = null;
    let flashTimer = null;
    let flashedCard = null;
    let inputError = "";
    let disposed = false;
    let cardById = new Map();

    const bar = document.createElement("section");
    bar.id = BAR_ID;
    bar.setAttribute("aria-label", "代币规划");
    bar.innerHTML = `<div class="mwi-labyrinth-calc-token-bar"><label class="mwi-labyrinth-calc-token-field"><span>预算</span><input type="number" min="0" step="1" data-token-budget aria-label="规划代币预算，留空跟随当前代币"></label><span class="mwi-labyrinth-calc-token-divider" aria-hidden="true"></span><span class="mwi-labyrinth-calc-token-metric"><span>合计</span><strong data-token-total>0</strong></span><span class="mwi-labyrinth-calc-token-metric" data-token-remaining-box><span>剩余</span><strong data-token-remaining>—</strong></span><span class="mwi-labyrinth-calc-token-end"><span class="mwi-labyrinth-calc-token-error" role="alert" hidden></span><button type="button" class="mwi-labyrinth-calc-token-link" data-token-action="retry" hidden>重试</button><button type="button" class="mwi-labyrinth-calc-token-link" data-token-action="undo" hidden>撤销</button><button type="button" class="mwi-labyrinth-calc-token-link mwi-labyrinth-calc-token-clear" data-token-action="clear" hidden>清空</button></span></div><div class="mwi-labyrinth-calc-token-list" hidden></div>`;

    const $ = (selector) => bar.querySelector(selector);
    const budgetInput = $("[data-token-budget]");
    const totalEl = $("[data-token-total]");
    const remainingBox = $("[data-token-remaining-box]");
    const remainingEl = $("[data-token-remaining]");
    const errorEl = $(".mwi-labyrinth-calc-token-error");
    const retryBtn = $('[data-token-action="retry"]');
    const undoBtn = $('[data-token-action="undo"]');
    const clearBtn = $('[data-token-action="clear"]');
    const listEl = $(".mwi-labyrinth-calc-token-list");

    function clearUndo() {
      undo = null;
      if (undoTimer !== null) {
        clearTimeout(undoTimer);
        undoTimer = null;
      }
    }

    function clearFlash() {
      if (flashTimer !== null) {
        clearTimeout(flashTimer);
        flashTimer = null;
      }
      flashedCard?.removeAttribute(FLASH_ATTR);
      flashedCard = null;
    }

    function cleanCard(card) {
      card.removeAttribute(PLANNED_ATTR);
      card.removeAttribute(FLASH_ATTR);
      card.querySelector(`:scope > .${CTRL_CLASS}`)?.remove();
    }

    function cleanCards(rootNode) {
      if (!rootNode) return;
      for (const ctrl of rootNode.querySelectorAll(`.${CTRL_CLASS}`)) ctrl.remove();
      for (const node of rootNode.querySelectorAll(`[${PLANNED_ATTR}], [${FLASH_ATTR}]`)) {
        node.removeAttribute(PLANNED_ATTR);
        node.removeAttribute(FLASH_ATTR);
      }
    }

    function detach() {
      clearFlash();
      cleanCards(shopTab);
      bar.remove();
      shopTab = null;
      cardById = new Map();
    }

    function computeResult(planOverride) {
      const plan = planOverride || data.profile.plan;
      return M.buildPlan(
        { ...plan, reserve: 0, futureRuns: 0, perRun: null, forecastStart: null },
        data.catalog,
        data.balance,
        []
      );
    }

    function commit(nextPlan, keepUndo = false) {
      if (!data?.loaded) return false;
      try {
        M.validatePlan(nextPlan);
        if (!keepUndo) clearUndo();
        inputError = "";
        onPlan(nextPlan);
        return true;
      } catch (error) {
        inputError = error.message || "输入无效";
        renderSummary(computeResult());
        return false;
      }
    }

    function updateQuantity(id, nextCount) {
      if (!data?.loaded) return;
      const item = data.catalog.find((entry) => entry.id === id);
      if (!item || item.current === null) return;
      const limit = item.kind === "upgrade" ? Math.max(0, item.max - item.current) : item.max;
      const clamped = Math.max(0, Math.min(limit, nextCount));
      const plan = structuredClone(data.profile.plan);
      const index = plan.entries.findIndex((entry) => entry.id === id);
      if (clamped === 0) {
        if (index >= 0) plan.entries.splice(index, 1);
      } else {
        const target = item.kind === "upgrade" ? item.current + clamped : clamped;
        if (index >= 0) plan.entries[index].target = target;
        else plan.entries.push({ id, target });
      }
      commit(plan);
    }

    function stepItem(id, delta, trigger) {
      if (!data?.loaded) return;
      const item = data.catalog.find((entry) => entry.id === id);
      if (!item || item.current === null) return;
      const existing = data.profile.plan.entries.find((entry) => entry.id === id);
      const currentCount = existing
        ? item.kind === "upgrade"
          ? Math.max(0, existing.target - item.current)
          : existing.target
        : 0;
      const limit = item.kind === "upgrade" ? Math.max(0, item.max - item.current) : item.max;
      const nextCount = Math.max(0, Math.min(limit, currentCount + delta));
      updateQuantity(id, nextCount);
      if (nextCount === 0 && trigger?.dataset.tokenAction === "dec") {
        trigger.closest(`.${CTRL_CLASS}`)?.querySelector('[data-token-action="inc"]')?.focus({ preventScroll: true });
      }
    }

    function renderSummary(result) {
      totalEl.textContent = fmt(result.total);
      remainingEl.textContent = fmt(result.remaining);
      remainingBox.dataset.state =
        result.remaining === null ? "" : result.remaining < 0 ? "over" : result.total > 0 ? "ok" : "";
      const hasSaveError = Boolean(data.saveError);
      const errorText = inputError || (hasSaveError ? (data.loaded ? "未保存" : "读取失败") : "");
      errorEl.textContent = errorText;
      errorEl.title = hasSaveError ? data.saveError : "";
      errorEl.hidden = !errorText;
      retryBtn.hidden = !hasSaveError;
      undoBtn.hidden = !undo;
      clearBtn.hidden = !data.profile.plan.entries.length || Boolean(undo);
      clearBtn.disabled = !data.loaded;
      undoBtn.disabled = !data.loaded;
    }

    function buildCardControl(card, id) {
      const ctrl = document.createElement("div");
      ctrl.className = CTRL_CLASS;
      ctrl.dataset.id = id;
      ctrl.dataset.planned = "false";

      const dec = document.createElement("button");
      dec.type = "button";
      dec.className = "mwi-labyrinth-calc-token-btn";
      dec.dataset.tokenAction = "dec";
      dec.dataset.id = id;
      dec.append(glyph("minus"));
      dec.hidden = true;

      const num = document.createElement("input");
      num.type = "number";
      num.className = "mwi-labyrinth-calc-token-num";
      num.dataset.tokenQty = id;
      num.min = "0";
      num.step = "1";
      num.hidden = true;

      const inc = document.createElement("button");
      inc.type = "button";
      inc.className = "mwi-labyrinth-calc-token-btn mwi-labyrinth-calc-token-add";
      inc.dataset.tokenAction = "inc";
      inc.dataset.id = id;
      inc.append(glyph("plus"));

      ctrl.append(dec, num, inc);

      for (const type of ["mousedown", "mouseup", "pointerdown", "pointerup", "touchstart"]) {
        ctrl.addEventListener(type, (event) => event.stopPropagation());
      }
      ctrl.addEventListener("click", (event) => {
        event.stopPropagation();
        const button = event.target.closest("[data-token-action]");
        if (!button || button.disabled) return;
        const action = button.dataset.tokenAction;
        if (action === "inc") stepItem(ctrl.dataset.id, 1, button);
        else if (action === "dec") stepItem(ctrl.dataset.id, -1, button);
      });
      ctrl.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.target === num && event.key === "Escape") {
          num.value = num.dataset.committed || "";
          num.blur();
        } else if (event.target === num && event.key === "Enter") {
          num.blur();
        }
      });
      num.addEventListener("focus", () => num.select());
      num.addEventListener("change", () => {
        const raw = num.value.trim();
        if (!raw || !/^\d+$/.test(raw)) {
          num.value = num.dataset.committed || "";
          return;
        }
        const value = Number(raw);
        if (!Number.isSafeInteger(value)) {
          num.value = num.dataset.committed || "";
          return;
        }
        updateQuantity(ctrl.dataset.id, value);
      });

      card.append(ctrl);
      return ctrl;
    }

    function syncCards() {
      const nextCardById = new Map();
      const byId = new Map(data.catalog.map((item) => [item.id, item]));
      const entriesById = new Map(data.profile.plan.entries.map((entry) => [entry.id, entry]));

      for (const card of shopTab.querySelectorAll(
        '[class*="LabyrinthPanel_upgrade"], [class*="LabyrinthPanel_item"]'
      )) {
        const id = identifyCard(card, data.catalog, byId);
        const item = id ? byId.get(id) : null;
        if (!item) {
          cleanCard(card);
          continue;
        }
        nextCardById.set(id, card);
        const maxed =
          item.kind === "upgrade" &&
          ((item.current !== null && item.current >= item.max) ||
            Boolean(card.querySelector('[class*="LabyrinthPanel_maxed"]')));
        if (maxed) {
          cleanCard(card);
          continue;
        }

        let ctrl = card.querySelector(`:scope > .${CTRL_CLASS}`);
        if (!ctrl) ctrl = buildCardControl(card, id);
        ctrl.dataset.id = id;

        const name = cardDisplayName(card, item);
        const entry = entriesById.get(id);
        const count =
          entry && item.current !== null
            ? item.kind === "upgrade"
              ? Math.max(0, entry.target - item.current)
              : entry.target
            : 0;
        const limit =
          item.current === null ? 0 : item.kind === "upgrade" ? Math.max(0, item.max - item.current) : item.max;
        const planned = count > 0;
        const editable = data.loaded && item.current !== null;

        ctrl.dataset.planned = String(planned);
        if (planned) card.setAttribute(PLANNED_ATTR, "true");
        else card.removeAttribute(PLANNED_ATTR);

        const dec = ctrl.querySelector('[data-token-action="dec"]');
        const num = ctrl.querySelector("[data-token-qty]");
        const inc = ctrl.querySelector('[data-token-action="inc"]');

        dec.dataset.id = id;
        dec.hidden = !planned;
        dec.disabled = !editable;
        dec.setAttribute("aria-label", `减少${name}`);

        num.dataset.tokenQty = id;
        num.dataset.committed = String(count);
        num.hidden = !planned;
        num.disabled = !editable;
        num.max = String(limit);
        num.setAttribute("aria-label", `${name}${item.kind === "upgrade" ? "计划升级数" : "计划兑换次数"}`);
        if (document.activeElement !== num) num.value = String(count);
        num.style.width = `${Math.min(46, Math.max(22, String(count).length * 8 + 6))}px`;

        inc.dataset.id = id;
        inc.disabled = !editable || count >= limit;
        inc.setAttribute("aria-label", `增加${name}`);
      }

      cardById = nextCardById;
    }

    function renderList(result) {
      listEl.replaceChildren();
      listEl.hidden = !result.groups.length;
      for (const group of result.groups) {
        const item = group.item;
        const card = cardById.get(group.id);
        const name = cardDisplayName(card, item) || group.id;

        const chip = document.createElement("span");
        chip.className = "mwi-labyrinth-calc-token-chip";
        chip.dataset.id = group.id;
        chip.dataset.done = String(group.budgetState === "complete");

        const locate = document.createElement("button");
        locate.type = "button";
        locate.className = "mwi-labyrinth-calc-token-locate";
        locate.dataset.tokenAction = "locate";
        locate.dataset.id = group.id;

        const nameEl = document.createElement("span");
        nameEl.className = "mwi-labyrinth-calc-token-name";
        nameEl.textContent = name;

        const qtyEl = document.createElement("span");
        qtyEl.className = "mwi-labyrinth-calc-token-qty";
        if (item?.kind === "item") {
          qtyEl.textContent =
            item.output > 1 ? `×${group.target}(${fmt(group.target * item.output)})` : `×${group.target}`;
        } else if (group.budgetState === "complete") {
          qtyEl.textContent = "已达";
        } else if (item?.current != null) {
          qtyEl.textContent = `${item.current}→${group.target}`;
        } else {
          qtyEl.textContent = `→${group.target}`;
        }
        locate.append(nameEl, qtyEl);

        const costEl = document.createElement("strong");
        costEl.className = "mwi-labyrinth-calc-token-cost";
        costEl.textContent = fmt(group.cost);

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "mwi-labyrinth-calc-token-remove";
        remove.dataset.tokenAction = "remove";
        remove.dataset.id = group.id;
        remove.disabled = !data.loaded;
        remove.setAttribute("aria-label", `移除${name}`);
        remove.append(glyph("close"));

        chip.append(locate, costEl, remove);
        listEl.append(chip);
      }
    }

    function render() {
      if (!data || !shopTab || disposed) return;
      ensureStyle();
      if (bar.parentElement !== shopTab || shopTab.lastElementChild !== bar) shopTab.append(bar);

      budgetInput.placeholder = fmt(data.balance);
      budgetInput.disabled = !data.loaded;
      if (document.activeElement !== budgetInput) {
        budgetInput.value = data.profile.plan.budget ?? "";
      }

      syncCards();
      const result = computeResult();
      renderSummary(result);
      renderList(result);
    }

    budgetInput.addEventListener("input", () => {
      if (!data?.loaded) return;
      const raw = budgetInput.value.trim();
      if (raw === "") {
        inputError = "";
        renderSummary(computeResult({ ...data.profile.plan, budget: null }));
        return;
      }
      if (/^\d+$/.test(raw) && Number.isSafeInteger(Number(raw))) {
        inputError = "";
        renderSummary(computeResult({ ...data.profile.plan, budget: Number(raw) }));
      }
    });

    budgetInput.addEventListener("change", () => {
      if (!data?.loaded) return;
      const plan = structuredClone(data.profile.plan);
      const raw = budgetInput.value.trim();
      plan.budget = budgetInput.validity.badInput ? NaN : raw === "" ? null : Number(raw);
      commit(plan);
    });

    budgetInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") budgetInput.blur();
    });

    bar.addEventListener("click", (event) => {
      const button = event.target.closest("[data-token-action]");
      if (!button || button.disabled || !data) return;
      const action = button.dataset.tokenAction;
      const id = button.dataset.id;
      if (action === "retry") {
        inputError = "";
        onRetry();
        return;
      }
      if (action === "locate") {
        const card = cardById.get(id);
        if (!card) return;
        const reduced = root.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
        card.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
        clearFlash();
        flashedCard = card;
        card.setAttribute(FLASH_ATTR, "true");
        flashTimer = setTimeout(clearFlash, 800);
        return;
      }
      if (!data.loaded) return;
      if (action === "remove") {
        const chips = [...listEl.querySelectorAll('[data-token-action="remove"]')];
        const removeIndex = chips.indexOf(button);
        const plan = structuredClone(data.profile.plan);
        plan.entries = plan.entries.filter((entry) => entry.id !== id);
        if (commit(plan)) {
          const remainingButtons = listEl.querySelectorAll('[data-token-action="remove"]');
          const nextFocus = remainingButtons[Math.min(removeIndex, remainingButtons.length - 1)] || budgetInput;
          nextFocus?.focus({ preventScroll: true });
        }
      } else if (action === "clear") {
        clearUndo();
        const plan = structuredClone(data.profile.plan);
        undo = structuredClone(plan.entries);
        plan.entries = [];
        if (commit(plan, true)) {
          undoTimer = setTimeout(() => {
            clearUndo();
            render();
          }, 8000);
          undoBtn.focus({ preventScroll: true });
        } else {
          clearUndo();
        }
      } else if (action === "undo" && undo) {
        const plan = structuredClone(data.profile.plan);
        plan.entries = undo;
        clearUndo();
        commit(plan);
      }
    });

    return {
      isVisible: () => Boolean(shopTab && shopTab.isConnected && shopTab.getClientRects().length > 0),
      setOwner(next) {
        if (owner === next) return;
        owner = next;
        data = null;
        inputError = "";
        clearUndo();
        clearFlash();
      },
      mount(available) {
        const nextShop = available ? findShopTab() : null;
        if (!nextShop) {
          if (shopTab) detach();
          return;
        }
        const changed = shopTab !== nextShop;
        if (changed) {
          detach();
          shopTab = nextShop;
          ensureStyle();
          shopTab.append(bar);
          onOpen?.();
        } else if (bar.parentElement !== shopTab || shopTab.lastElementChild !== bar) {
          shopTab.append(bar);
        }
      },
      update(next) {
        if (owner !== next.owner) {
          owner = next.owner;
          inputError = "";
          clearUndo();
          clearFlash();
        }
        data = next;
        render();
      },
      destroy() {
        disposed = true;
        clearUndo();
        detach();
        document.getElementById(STYLE_ID)?.remove();
      }
    };
  }

  root.MwiLabyrinthTokenView = { create, identifyCard, UPGRADE_SYMBOLS };
})(globalThis);
