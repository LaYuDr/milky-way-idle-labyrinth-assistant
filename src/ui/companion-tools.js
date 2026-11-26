(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MwiLabyrinthCompanion = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STORAGE_KEY = "mwi-labyrinth:companion-planner:v1";
  const PROBE_STORAGE_KEY = "mwi-labyrinth:greasyfork-probe:v1";
  const GREASYFORK_PROBE_URL = "https://greasyfork.org/favicon.ico";
  const PROBE_TTL_MS = 20 * 60 * 1000;
  const PROBE_TIMEOUT_MS = 2500;
  const POPOVER_ID = "mwi-labyrinth-companion-popover";

  const LOADOUT_TITLE_PROXY =
    "当前已自动切换为免翻墙代理安装（后续更新同步走代理）；需先安装 Tampermonkey 或脚本猫扩展";
  const LOADOUT_TITLE_GREASYFORK = "前往 Greasy Fork 安装配装助手；需先安装 Tampermonkey 或脚本猫扩展";

  const PLANNER_TOOL = Object.freeze({
    enabled: true,
    // 规划助手固定公网 HTTPS 深链（支持登录后自动直达迷宫配装页；零追踪参数）。
    defaultUrl: "https://layu.love/#labyrinth",
    legacyUrlPrefixes: Object.freeze([])
  });

  const LOADOUT_ASSISTANT_TOOL = Object.freeze({
    nameZh: "配装助手",
    nameEn: "Loadout Assistant",
    installUrl:
      "https://js.nainai.eu.org/proxy/https://update.greasyfork.org/scripts/602254/%E9%85%8D%E8%A3%85%E5%8A%A9%E6%89%8B.user.js",
    resourceCenterUrl: "https://js.nainai.eu.org/",
    homepageUrl: "https://greasyfork.org/zh-CN/scripts/602254"
  });

  const listeners = new Set();
  const NULL_STORAGE_KEY = {};
  const fallbackProbeCacheByStorage = new WeakMap();
  const inFlightProbeByStorage = new WeakMap();

  function defaultStorage() {
    try {
      return typeof window !== "undefined" ? window.localStorage : null;
    } catch {
      return null;
    }
  }

  function defaultSessionStorage(doc) {
    try {
      if (doc?.defaultView?.sessionStorage) return doc.defaultView.sessionStorage;
      return typeof window !== "undefined" ? window.sessionStorage : null;
    } catch {
      return null;
    }
  }

  function getProbeStorageKey(storage) {
    return storage && (typeof storage === "object" || typeof storage === "function") ? storage : NULL_STORAGE_KEY;
  }

  function isFreshProbeRecord(record, currentTime, ttlMs) {
    if (!record || typeof record !== "object" || typeof record.reachable !== "boolean") return false;
    if (typeof record.checkedAt !== "number" || !Number.isFinite(record.checkedAt)) return false;
    const age = currentTime - record.checkedAt;
    return age >= 0 && age < ttlMs;
  }

  function readCachedGreasyForkProbe(
    sessionStorage = defaultSessionStorage(),
    { now = Date.now, ttlMs = PROBE_TTL_MS } = {}
  ) {
    const currentTime = now();
    if (sessionStorage && typeof sessionStorage.getItem === "function") {
      try {
        const raw = sessionStorage.getItem(PROBE_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (isFreshProbeRecord(parsed, currentTime, ttlMs)) return parsed.reachable;
        }
      } catch {
        /* Storage may be restricted in private mode; fall back to in-memory cache. */
      }
    }
    const mem = fallbackProbeCacheByStorage.get(getProbeStorageKey(sessionStorage));
    if (isFreshProbeRecord(mem, currentTime, ttlMs)) return mem.reachable;
    return null;
  }

  function writeCachedGreasyForkProbe(sessionStorage, reachable, { now = Date.now } = {}) {
    const record = { reachable: Boolean(reachable), checkedAt: now() };
    const key = getProbeStorageKey(sessionStorage);
    if (sessionStorage && typeof sessionStorage.setItem === "function") {
      try {
        sessionStorage.setItem(PROBE_STORAGE_KEY, JSON.stringify(record));
        fallbackProbeCacheByStorage.delete(key);
        return;
      } catch {
        /* Fall back to in-memory session cache when sessionStorage throws. */
      }
    }
    fallbackProbeCacheByStorage.set(key, record);
  }

  function resetGreasyForkProbeCache(sessionStorage) {
    if (arguments.length > 0) {
      const key = getProbeStorageKey(sessionStorage);
      fallbackProbeCacheByStorage.delete(key);
      inFlightProbeByStorage.delete(key);
      if (sessionStorage && typeof sessionStorage.removeItem === "function") {
        try {
          sessionStorage.removeItem(PROBE_STORAGE_KEY);
        } catch {
          /* Ignore storage removal errors. */
        }
      }
      return;
    }
    fallbackProbeCacheByStorage.delete(NULL_STORAGE_KEY);
    inFlightProbeByStorage.delete(NULL_STORAGE_KEY);
    const defaultStore = defaultSessionStorage();
    if (defaultStore) resetGreasyForkProbeCache(defaultStore);
  }

  async function defaultGreasyForkProbe({ url, signal }) {
    if (typeof fetch !== "function") return false;
    const res = await fetch(url, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      signal
    });
    return Boolean(res && res.ok === true);
  }

  function normalizeProbeResult(value) {
    if (typeof value === "boolean") return value;
    if (value && typeof value === "object" && "ok" in value) return value.ok === true;
    return false;
  }

  function runProbeWithTimeout(probeFn, timeoutMs) {
    const effectiveTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : PROBE_TIMEOUT_MS;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const signal = controller ? controller.signal : undefined;
    return new Promise((resolve) => {
      let settled = false;
      const finish = (reachable) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(Boolean(reachable));
      };
      const timer = setTimeout(() => {
        try {
          controller?.abort();
        } catch {
          /* Ignore abort errors from custom controllers. */
        }
        finish(false);
      }, effectiveTimeout);
      try {
        Promise.resolve(probeFn({ url: GREASYFORK_PROBE_URL, signal, timeoutMs: effectiveTimeout })).then(
          (result) => finish(normalizeProbeResult(result)),
          () => finish(false)
        );
      } catch {
        finish(false);
      }
    });
  }

  function probeGreasyForkReachable({
    probeFn,
    sessionStorage,
    timeoutMs = PROBE_TIMEOUT_MS,
    now = Date.now,
    ttlMs = PROBE_TTL_MS
  } = {}) {
    const storage = sessionStorage === undefined ? defaultSessionStorage() : sessionStorage;
    const cached = readCachedGreasyForkProbe(storage, { now, ttlMs });
    if (cached !== null) return Promise.resolve(cached);

    const key = getProbeStorageKey(storage);
    const existing = inFlightProbeByStorage.get(key);
    if (existing) return existing;

    const runner = typeof probeFn === "function" ? probeFn : defaultGreasyForkProbe;
    const tracked = runProbeWithTimeout(runner, timeoutMs)
      .then((reachable) => {
        writeCachedGreasyForkProbe(storage, reachable, { now });
        return reachable;
      })
      .finally(() => {
        if (inFlightProbeByStorage.get(key) === tracked) inFlightProbeByStorage.delete(key);
      });
    inFlightProbeByStorage.set(key, tracked);
    return tracked;
  }

  function isLocalhostHost(hostname) {
    const normalized = String(hostname || "").toLowerCase();
    if (normalized === "localhost" || normalized === "[::1]") return true;
    const octets = normalized.split(".");
    return octets.length === 4 && octets[0] === "127" && octets[1] === "0" && octets[2] === "0" && octets[3] === "1";
  }

  function validateUrl(raw, { allowLocalhost = true } = {}) {
    const trimmed = String(raw ?? "").trim();
    if (!trimmed) return "";
    try {
      const parsed = new URL(trimmed);
      if (parsed.username || parsed.password) return "";
      if (parsed.protocol === "https:") return parsed.toString();
      if (allowLocalhost && parsed.protocol === "http:" && isLocalhostHost(parsed.hostname)) {
        return parsed.toString();
      }
      return "";
    } catch {
      return "";
    }
  }

  function loadPrefs(storage = defaultStorage()) {
    const fallback = { schema: 1, bannerDismissed: false, customUrl: "" };
    if (!storage) return fallback;
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
      return {
        schema: 1,
        bannerDismissed: parsed.bannerDismissed === true,
        customUrl: validateUrl(parsed.customUrl, { allowLocalhost: true })
      };
    } catch {
      return fallback;
    }
  }

  function notify() {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        /* Listener errors must never break companion controls. */
      }
    }
  }

  function savePrefs(patch, storage = defaultStorage()) {
    const current = loadPrefs(storage);
    const next = {
      schema: 1,
      bannerDismissed: typeof patch?.bannerDismissed === "boolean" ? patch.bannerDismissed : current.bannerDismissed,
      customUrl:
        typeof patch?.customUrl === "string"
          ? validateUrl(patch.customUrl, { allowLocalhost: true })
          : current.customUrl
    };
    let ok = true;
    if (storage) {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        ok = false;
      }
    }
    notify();
    return { ok, prefs: next };
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function resolveUrl(storage = defaultStorage(), config = PLANNER_TOOL) {
    if (!config || config.enabled === false) return "";
    const defaultValid = validateUrl(config.defaultUrl, { allowLocalhost: false });
    const prefs = loadPrefs(storage);
    if (prefs.customUrl) {
      const lower = prefs.customUrl.toLowerCase();
      const legacyPrefixes = Array.isArray(config.legacyUrlPrefixes) ? config.legacyUrlPrefixes : [];
      const isLegacy =
        Boolean(defaultValid) &&
        legacyPrefixes.some((prefix) => prefix && lower.startsWith(String(prefix).toLowerCase()));
      if (isLegacy) {
        savePrefs({ customUrl: "" }, storage);
        return defaultValid;
      }
      return prefs.customUrl;
    }
    return defaultValid;
  }

  function isAvailable(storage = defaultStorage(), config = PLANNER_TOOL) {
    return Boolean(resolveUrl(storage, config));
  }

  function resolveLoadoutToolUrl(loadoutTool = LOADOUT_ASSISTANT_TOOL, { greasyForkReachable = false } = {}) {
    const installUrl = validateUrl(loadoutTool?.installUrl, { allowLocalhost: false });
    const resourceCenterUrl = validateUrl(loadoutTool?.resourceCenterUrl, { allowLocalhost: false });
    const homepageUrl = validateUrl(loadoutTool?.homepageUrl, { allowLocalhost: false });
    if (greasyForkReachable === true) {
      return homepageUrl || installUrl || resourceCenterUrl;
    }
    return installUrl || resourceCenterUrl || homepageUrl;
  }

  function resolveLoadoutToolLink(loadoutTool = LOADOUT_ASSISTANT_TOOL, { probeState = "pending" } = {}) {
    const label = `${loadoutTool?.nameZh || "配装助手"} ↗`;
    const installUrl = validateUrl(loadoutTool?.installUrl, { allowLocalhost: false });
    const resourceCenterUrl = validateUrl(loadoutTool?.resourceCenterUrl, { allowLocalhost: false });
    const homepageUrl = validateUrl(loadoutTool?.homepageUrl, { allowLocalhost: false });
    const preferGreasyFork = probeState === "reachable";

    if (preferGreasyFork && homepageUrl) {
      return {
        href: homepageUrl,
        text: label,
        title: LOADOUT_TITLE_GREASYFORK,
        source: "greasyfork"
      };
    }
    const proxyHref = installUrl || resourceCenterUrl;
    if (proxyHref) {
      return {
        href: proxyHref,
        text: label,
        title: LOADOUT_TITLE_PROXY,
        source: "proxy"
      };
    }
    if (homepageUrl) {
      return {
        href: homepageUrl,
        text: label,
        title: LOADOUT_TITLE_GREASYFORK,
        source: "greasyfork"
      };
    }
    return {
      href: "",
      text: label,
      title: "",
      source: "none"
    };
  }

  function evaluateAutomationContext(ctx) {
    const combatEntries = Array.isArray(ctx?.LABYRINTH_AUTOMATION_COMBAT_ROOM_TYPES)
      ? ctx.LABYRINTH_AUTOMATION_COMBAT_ROOM_TYPES
      : [];
    if (!combatEntries.length) return { scenario: "default" };

    let missedCount = 0;
    if (ctx.automationRecommendColumnEnabled && ctx.automationRecommendByRoomTypeKey instanceof Map) {
      for (const entry of combatEntries) {
        const rec = ctx.automationRecommendByRoomTypeKey.get(entry.key);
        if (!rec) continue;
        if (
          rec.status === "error" ||
          (rec.status === "ready" && Number.isFinite(rec.clearChance) && rec.clearChance < 0.5)
        ) {
          missedCount += 1;
        }
      }
    } else if (ctx.automationEstimateColumnEnabled && ctx.automationEstimateByRoomTypeKey instanceof Map) {
      for (const entry of combatEntries) {
        const est = ctx.automationEstimateByRoomTypeKey.get(entry.key);
        if (!est) continue;
        if (
          est.status === "error" ||
          (est.status === "ready" &&
            (est.clearChance < 0.5 || est.expectedSeconds === Infinity || est.etaText === ctx.ETA_INFINITE_TEXT))
        ) {
          missedCount += 1;
        }
      }
    }
    if (missedCount >= 2) {
      return { scenario: "missed-target", missedCount };
    }

    const state = ctx.getGameState?.();
    const panelInstance = ctx.getLabyrinthPanelInstance?.();
    const canReadLoadouts =
      typeof ctx.resolveAutomationRoomLoadoutId === "function" &&
      (Boolean(state?.characterSetting) || typeof panelInstance?.getLoadoutIdForRoomType === "function");
    if (canReadLoadouts) {
      let noneCount = 0;
      const countsById = new Map();
      for (const entry of combatEntries) {
        const id = ctx.resolveAutomationRoomLoadoutId(panelInstance, entry.key, state);
        if (!id) {
          noneCount += 1;
        } else {
          countsById.set(id, (countsById.get(id) || 0) + 1);
        }
      }
      let maxSameCount = 0;
      for (const count of countsById.values()) {
        if (count > maxSameCount) maxSameCount = count;
      }
      if (noneCount >= 7 || maxSameCount >= 7) {
        return { scenario: "unconfigured-loadouts", noneCount, maxSameCount };
      }
    }

    return { scenario: "default" };
  }

  function formatAutomationCopy(evaluation, isZh = true) {
    if (evaluation?.scenario === "missed-target") {
      return isZh
        ? `配套工具 · 有 ${evaluation.missedCount} 个战斗房未达预期，可用「规划助手」按当前装备与预算优化 10 怪配装`
        : `Companion · ${evaluation.missedCount} combat rooms missed target. Optimize 10-monster loadouts in Planner`;
    }
    if (evaluation?.scenario === "unconfigured-loadouts") {
      return isZh
        ? "配套工具 · 多数战斗房尚未分配独立配装，可用「规划助手」一键生成迷宫多怪配装方案"
        : "Companion · Most combat rooms share one/no loadout. Build per-monster sets in Planner";
    }
    return isZh
      ? "配套工具 · 需要规划 10 怪迷宫配装或预算优化？可搭配「规划助手」使用"
      : "Companion · Need multi-loadout & budget planning for labyrinth combat? Try Planner";
  }

  function createIconSvg(document) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.classList.add("mwi-lab-companion-trigger-svg");
    svg.innerHTML =
      '<path d="M6.5 3.5H3.5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3"/><path d="M9.5 2.5h4v4"/><path d="M13.5 2.5L7.5 8.5"/>';
    return svg;
  }

  function setExternalLinkAttributes(anchor, href) {
    anchor.href = href || "#";
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer external";
  }

  function createAutomationIntegration(ctx, { storage = defaultStorage(), config = PLANNER_TOOL } = {}) {
    const text = (zh, en) => (ctx?.isChineseUi?.() !== false ? zh : en);

    const inlineLink = document.createElement("a");
    inlineLink.className = "mwi-labyrinth-calc-companion-inline";
    inlineLink.textContent = text("配装规划 ↗", "Loadout Planner ↗");
    inlineLink.title = text(
      "打开「规划助手」网页版，优化迷宫 10 怪配装与预算",
      "Open Planner web app for labyrinth 10-monster loadouts & budget optimization"
    );
    inlineLink.hidden = true;

    const banner = document.createElement("div");
    banner.className = "mwi-labyrinth-calc-companion-bar";
    banner.setAttribute("role", "note");
    banner.hidden = true;

    const copyNode = document.createElement("span");
    copyNode.className = "mwi-labyrinth-calc-companion-text";

    const actions = document.createElement("span");
    actions.className = "mwi-labyrinth-calc-companion-actions";

    const openLink = document.createElement("a");
    openLink.className = "mwi-labyrinth-calc-companion-link";
    openLink.textContent = text("打开规划助手 ↗", "Open Planner ↗");

    const dismissButton = document.createElement("button");
    dismissButton.type = "button";
    dismissButton.className = "mwi-labyrinth-calc-companion-dismiss";
    dismissButton.textContent = text("不再提示", "Dismiss");

    actions.append(openLink, dismissButton);
    banner.append(copyNode, actions);

    let lastScenarioCopy = "";

    function sync() {
      const url = resolveUrl(storage, config);
      if (!url) {
        banner.hidden = true;
        inlineLink.hidden = true;
        return;
      }
      const prefs = loadPrefs(storage);
      setExternalLinkAttributes(openLink, url);
      setExternalLinkAttributes(inlineLink, url);

      if (prefs.bannerDismissed) {
        banner.hidden = true;
        inlineLink.hidden = false;
        return;
      }

      inlineLink.hidden = true;
      banner.hidden = false;
      if (!ctx?.automationEstimateRunning || !lastScenarioCopy) {
        const evaluation = evaluateAutomationContext(ctx);
        lastScenarioCopy = formatAutomationCopy(evaluation, ctx?.isChineseUi?.() !== false);
      }
      if (copyNode.textContent !== lastScenarioCopy) copyNode.textContent = lastScenarioCopy;
    }

    const onDismiss = (event) => {
      event?.preventDefault();
      event?.stopPropagation();
      savePrefs({ bannerDismissed: true }, storage);
      sync();
    };
    if (typeof ctx?.listen === "function") ctx.listen(dismissButton, "click", onDismiss);
    else dismissButton.addEventListener("click", onDismiss);

    const unsubscribe = subscribe(sync);
    sync();

    return {
      inlineLink,
      banner,
      sync,
      dispose() {
        unsubscribe();
        if (typeof ctx?.listen !== "function") dismissButton.removeEventListener("click", onDismiss);
        inlineLink.remove();
        banner.remove();
      }
    };
  }

  function createLauncherIntegration(
    doc,
    {
      storage = defaultStorage(),
      sessionStorage,
      config = PLANNER_TOOL,
      loadoutTool = LOADOUT_ASSISTANT_TOOL,
      probeFn,
      probeTimeoutMs = PROBE_TIMEOUT_MS
    } = {}
  ) {
    const resolvedSessionStorage = sessionStorage === undefined ? defaultSessionStorage(doc) : sessionStorage;
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "mwi-lab-companion-trigger";
    button.dataset.open = "false";
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-controls", POPOVER_ID);
    button.setAttribute("aria-label", "配套工具");
    button.title = "配套工具：规划助手";
    button.append(createIconSvg(doc));
    button.hidden = true;

    const popover = doc.createElement("div");
    popover.id = POPOVER_ID;
    popover.className = "mwi-lab-companion-popover";
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", "配套工具");
    popover.hidden = true;

    const head = doc.createElement("div");
    head.className = "mwi-lab-companion-popover-head";

    const title = doc.createElement("span");
    title.className = "mwi-lab-companion-title";
    title.textContent = "配套工具";

    const closeBtn = doc.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "mwi-lab-companion-close";
    closeBtn.setAttribute("aria-label", "关闭");
    closeBtn.title = "关闭";
    closeBtn.textContent = "×";
    head.append(title, closeBtn);

    const body = doc.createElement("div");
    body.className = "mwi-lab-companion-popover-body";

    const item = doc.createElement("div");
    item.className = "mwi-lab-companion-item";

    const name = doc.createElement("div");
    name.className = "mwi-lab-companion-name";
    name.textContent = "规划助手（网页版）";

    const desc = doc.createElement("p");
    desc.className = "mwi-lab-companion-desc";
    desc.textContent = "自动计算迷宫 10 怪配装与预算优化，配好后回到「自动化」页验证跳过等级。";

    const row = doc.createElement("div");
    row.className = "mwi-lab-companion-row";

    const openLink = doc.createElement("a");
    openLink.className = "mwi-lab-companion-open";
    openLink.textContent = "打开规划助手 ↗";

    const configToggle = doc.createElement("button");
    configToggle.type = "button";
    configToggle.className = "mwi-lab-companion-config-toggle";
    configToggle.textContent = "设置地址";

    row.append(openLink, configToggle);

    const configBox = doc.createElement("div");
    configBox.className = "mwi-lab-companion-config";
    configBox.hidden = true;

    const urlInput = doc.createElement("input");
    urlInput.type = "url";
    urlInput.className = "mwi-lab-companion-url";
    urlInput.placeholder = config.defaultUrl || "https://...";
    urlInput.setAttribute("aria-label", "自定义规划助手网址");

    const configActions = doc.createElement("div");
    configActions.className = "mwi-lab-companion-config-actions";

    const saveBtn = doc.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "mwi-lab-companion-action";
    saveBtn.dataset.companionAction = "save";
    saveBtn.textContent = "保存";

    const resetBtn = doc.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "mwi-lab-companion-action";
    resetBtn.dataset.companionAction = "reset";
    resetBtn.textContent = "恢复默认";

    configActions.append(saveBtn, resetBtn);

    const errorNode = doc.createElement("p");
    errorNode.className = "mwi-lab-companion-config-error";
    errorNode.setAttribute("role", "alert");
    errorNode.hidden = true;

    configBox.append(urlInput, configActions, errorNode);
    item.append(name, desc, row, configBox);

    const foot = doc.createElement("div");
    foot.className = "mwi-lab-companion-foot";
    let subLink = null;
    let loadoutProbeState = "pending";
    let probeRequested = false;

    function applyLoadoutLink() {
      if (!subLink) return;
      const resolved = resolveLoadoutToolLink(loadoutTool, { probeState: loadoutProbeState });
      if (!resolved.href) return;
      setExternalLinkAttributes(subLink, resolved.href);
      subLink.textContent = resolved.text;
      subLink.title = resolved.title;
      subLink.dataset.source = resolved.source;
    }

    const initialLoadoutLink = resolveLoadoutToolLink(loadoutTool, { probeState: loadoutProbeState });
    if (initialLoadoutLink.href) {
      subLink = doc.createElement("a");
      subLink.className = "mwi-lab-companion-sublink";
      applyLoadoutLink();
      foot.append("建议搭配：", subLink, "（导入子方案/虚拟配装，高亮指引手动切装）");
    } else {
      foot.textContent = "建议搭配：配装助手（导入子方案/虚拟配装，高亮指引手动切装）";
    }

    body.append(item, foot);
    popover.append(head, body);

    let open = false;
    let disposed = false;

    function ensureLoadoutLinkProbe() {
      if (!subLink || disposed) return;
      if (!validateUrl(loadoutTool?.homepageUrl, { allowLocalhost: false })) return;
      const cached = readCachedGreasyForkProbe(resolvedSessionStorage);
      if (cached !== null) {
        loadoutProbeState = cached ? "reachable" : "unreachable";
        applyLoadoutLink();
        return;
      }
      if (probeRequested) return;
      probeRequested = true;
      probeGreasyForkReachable({
        probeFn,
        sessionStorage: resolvedSessionStorage,
        timeoutMs: probeTimeoutMs
      }).then((reachable) => {
        probeRequested = false;
        if (disposed) return;
        loadoutProbeState = reachable ? "reachable" : "unreachable";
        applyLoadoutLink();
      });
    }

    function clearError() {
      errorNode.textContent = "";
      errorNode.hidden = true;
      urlInput.removeAttribute("aria-invalid");
    }

    function close(restoreFocus = false) {
      if (!open) return;
      open = false;
      popover.hidden = true;
      configBox.hidden = true;
      button.dataset.open = "false";
      clearError();
      if (restoreFocus && button.isConnected && !button.hidden) button.focus();
    }

    function sync() {
      if (disposed) return;
      const url = resolveUrl(storage, config);
      if (!url) {
        close(false);
        button.hidden = true;
        return;
      }
      button.hidden = false;
      setExternalLinkAttributes(openLink, url);
      const prefs = loadPrefs(storage);
      resetBtn.hidden = !prefs.customUrl;
      if (doc.activeElement !== urlInput) {
        urlInput.value = prefs.customUrl || "";
      }
    }

    const onTriggerClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!resolveUrl(storage, config)) return;
      open = !open;
      popover.hidden = !open;
      button.dataset.open = String(open);
      if (!open) {
        configBox.hidden = true;
        clearError();
      } else {
        sync();
        ensureLoadoutLinkProbe();
      }
    };

    const onPopoverClick = (event) => {
      event.stopPropagation();
    };

    const onCloseClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    };

    const onConfigToggle = (event) => {
      event.preventDefault();
      event.stopPropagation();
      configBox.hidden = !configBox.hidden;
      clearError();
      if (!configBox.hidden) {
        const prefs = loadPrefs(storage);
        urlInput.value = prefs.customUrl || "";
        resetBtn.hidden = !prefs.customUrl;
        urlInput.focus();
      }
    };

    const onSaveClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const raw = urlInput.value.trim();
      if (!raw) {
        savePrefs({ customUrl: "" }, storage);
        configBox.hidden = true;
        clearError();
        sync();
        return;
      }
      const valid = validateUrl(raw, { allowLocalhost: true });
      if (!valid) {
        errorNode.textContent = "请输入有效的 https:// 或本机 http://localhost 地址";
        errorNode.hidden = false;
        urlInput.setAttribute("aria-invalid", "true");
        return;
      }
      const { ok } = savePrefs({ customUrl: valid }, storage);
      if (!ok) {
        errorNode.textContent = "地址未能保存到浏览器存储，请检查存储权限。";
        errorNode.hidden = false;
        return;
      }
      configBox.hidden = true;
      clearError();
      sync();
    };

    const onResetClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      savePrefs({ customUrl: "" }, storage);
      urlInput.value = "";
      configBox.hidden = true;
      clearError();
      sync();
    };

    const onUrlKeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onSaveClick(event);
      }
    };

    const onDocumentClick = (event) => {
      if (!open) return;
      const target = event.target;
      if (target && (button.contains(target) || popover.contains(target))) return;
      close(false);
    };

    const onDocumentKeydown = (event) => {
      if (open && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      }
    };

    button.addEventListener("click", onTriggerClick);
    popover.addEventListener("click", onPopoverClick);
    closeBtn.addEventListener("click", onCloseClick);
    configToggle.addEventListener("click", onConfigToggle);
    saveBtn.addEventListener("click", onSaveClick);
    resetBtn.addEventListener("click", onResetClick);
    urlInput.addEventListener("keydown", onUrlKeydown);
    doc.addEventListener("click", onDocumentClick);
    doc.addEventListener("keydown", onDocumentKeydown);

    const unsubscribe = subscribe(sync);
    sync();

    return {
      button,
      popover,
      sync,
      close: () => close(false),
      destroy() {
        disposed = true;
        close(false);
        unsubscribe();
        button.removeEventListener("click", onTriggerClick);
        popover.removeEventListener("click", onPopoverClick);
        closeBtn.removeEventListener("click", onCloseClick);
        configToggle.removeEventListener("click", onConfigToggle);
        saveBtn.removeEventListener("click", onSaveClick);
        resetBtn.removeEventListener("click", onResetClick);
        urlInput.removeEventListener("keydown", onUrlKeydown);
        doc.removeEventListener("click", onDocumentClick);
        doc.removeEventListener("keydown", onDocumentKeydown);
        button.remove();
        popover.remove();
      }
    };
  }

  return {
    STORAGE_KEY,
    PROBE_STORAGE_KEY,
    GREASYFORK_PROBE_URL,
    PROBE_TTL_MS,
    PROBE_TIMEOUT_MS,
    POPOVER_ID,
    LOADOUT_TITLE_PROXY,
    LOADOUT_TITLE_GREASYFORK,
    PLANNER_TOOL,
    LOADOUT_ASSISTANT_TOOL,
    validateUrl,
    loadPrefs,
    savePrefs,
    resolveUrl,
    isAvailable,
    readCachedGreasyForkProbe,
    probeGreasyForkReachable,
    resetGreasyForkProbeCache,
    resolveLoadoutToolUrl,
    resolveLoadoutToolLink,
    evaluateAutomationContext,
    formatAutomationCopy,
    createAutomationIntegration,
    createLauncherIntegration
  };
});
