const test = require("node:test");
const assert = require("node:assert/strict");
const Companion = require("../src/ui/companion-tools.js");

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
    dump() {
      return Object.fromEntries(map.entries());
    }
  };
}

const COMBAT_MONSTERS = [
  { key: "shadow_archer" },
  { key: "pyre_hunter" },
  { key: "frost_sniper" },
  { key: "siren" },
  { key: "salamander" },
  { key: "dryad" },
  { key: "giant_scorpion" },
  { key: "giant_mantis" },
  { key: "cyclops" },
  { key: "mimic" }
];

test("外链 URL 白名单校验：放行 https 与本机 localhost，拒绝不安全协议", () => {
  assert.equal(
    Companion.validateUrl("https://planner.example.com/#labyrinth"),
    "https://planner.example.com/#labyrinth"
  );
  assert.equal(Companion.validateUrl("http://127.0.0.1:8769/#labyrinth"), "http://127.0.0.1:8769/#labyrinth");
  assert.equal(Companion.validateUrl("http://localhost:8769/"), "http://localhost:8769/");
  assert.equal(Companion.validateUrl("http://127.0.0.1:8769/", { allowLocalhost: false }), "");
  assert.equal(Companion.validateUrl("http://example.com/"), "");
  assert.equal(Companion.validateUrl("javascript:alert(1)"), "");
  assert.equal(Companion.validateUrl("data:text/html,hi"), "");
  assert.equal(Companion.validateUrl("https://user:pass@example.com/"), "");
  assert.equal(Companion.validateUrl("not-a-url"), "");
  assert.equal(Companion.validateUrl(""), "");
});

test("两阶段门控、本地自定义覆盖与历史域名自动迁移", () => {
  const storage = memoryStorage();
  // 阶段 A：默认空串时整块静默不可用
  const stageAConfig = { enabled: true, defaultUrl: "", legacyUrlPrefixes: [] };
  assert.equal(Companion.isAvailable(storage, stageAConfig), false);
  assert.equal(Companion.resolveUrl(storage, stageAConfig), "");

  // 开发者本地写入 customUrl 预演
  Companion.savePrefs({ customUrl: "http://127.0.0.1:8769/#labyrinth" }, storage);
  assert.equal(Companion.isAvailable(storage, stageAConfig), true);
  assert.equal(Companion.resolveUrl(storage, stageAConfig), "http://127.0.0.1:8769/#labyrinth");

  // 阶段 B：固定域名启用且旧域名自动迁移
  const stageBConfig = {
    enabled: true,
    defaultUrl: "https://new-planner.example.com/#labyrinth",
    legacyUrlPrefixes: ["https://old-planner.example.com/"]
  };
  Companion.savePrefs({ customUrl: "https://old-planner.example.com/#labyrinth" }, storage);
  assert.equal(Companion.resolveUrl(storage, stageBConfig), "https://new-planner.example.com/#labyrinth");
  assert.equal(Companion.loadPrefs(storage).customUrl, "");

  // 总开关关闭时即使有 URL 也不展示
  assert.equal(Companion.resolveUrl(storage, { ...stageBConfig, enabled: false }), "");
});

test("偏好读写容错：损坏数据与存储异常不抛错", () => {
  const broken = memoryStorage({ [Companion.STORAGE_KEY]: "{bad json" });
  assert.deepEqual(Companion.loadPrefs(broken), { schema: 1, bannerDismissed: false, customUrl: "" });

  const throwing = {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("quota");
    }
  };
  assert.deepEqual(Companion.loadPrefs(throwing), { schema: 1, bannerDismissed: false, customUrl: "" });
  const saved = Companion.savePrefs({ bannerDismissed: true }, throwing);
  assert.equal(saved.ok, false);
  assert.equal(saved.prefs.bannerDismissed, true);
});

test("自动化页痛点场景判定：未达标优先、单一/无配装次之、正常态兜底", () => {
  const recMap = new Map([
    ["shadow_archer", { status: "error", message: "未达标" }],
    ["siren", { status: "ready", clearChance: 0.35 }],
    ["mimic", { status: "ready", clearChance: 0.92 }]
  ]);
  const missedCtx = {
    LABYRINTH_AUTOMATION_COMBAT_ROOM_TYPES: COMBAT_MONSTERS,
    automationRecommendColumnEnabled: true,
    automationRecommendByRoomTypeKey: recMap
  };
  const missed = Companion.evaluateAutomationContext(missedCtx);
  assert.equal(missed.scenario, "missed-target");
  assert.equal(missed.missedCount, 2);
  assert.match(Companion.formatAutomationCopy(missed, true), /2 个战斗房未达预期/);

  // 估算列出现无限耗时与低胜率同样识别为未达标
  const estMap = new Map([
    ["shadow_archer", { status: "ready", clearChance: 0.8, expectedSeconds: Infinity, etaText: "∞" }],
    ["cyclops", { status: "ready", clearChance: 0.42, expectedSeconds: 200, etaText: "200s" }]
  ]);
  const estMissed = Companion.evaluateAutomationContext({
    LABYRINTH_AUTOMATION_COMBAT_ROOM_TYPES: COMBAT_MONSTERS,
    ETA_INFINITE_TEXT: "∞",
    automationEstimateColumnEnabled: true,
    automationEstimateByRoomTypeKey: estMap
  });
  assert.equal(estMissed.scenario, "missed-target");

  // 多数战斗房共用同一套配装
  const sharedLoadoutCtx = {
    LABYRINTH_AUTOMATION_COMBAT_ROOM_TYPES: COMBAT_MONSTERS,
    getGameState: () => ({ characterSetting: {} }),
    getLabyrinthPanelInstance: () => null,
    resolveAutomationRoomLoadoutId: (_panel, key) => (key === "mimic" ? 2 : 1)
  };
  const shared = Companion.evaluateAutomationContext(sharedLoadoutCtx);
  assert.equal(shared.scenario, "unconfigured-loadouts");
  assert.match(Companion.formatAutomationCopy(shared, true), /尚未分配独立配装/);

  // 配装分散且无异常时返回默认温和提示
  const okCtx = {
    LABYRINTH_AUTOMATION_COMBAT_ROOM_TYPES: COMBAT_MONSTERS,
    getGameState: () => ({ characterSetting: {} }),
    getLabyrinthPanelInstance: () => null,
    resolveAutomationRoomLoadoutId: (_panel, key) => COMBAT_MONSTERS.findIndex((m) => m.key === key) + 1
  };
  const normal = Companion.evaluateAutomationContext(okCtx);
  assert.equal(normal.scenario, "default");
  assert.match(Companion.formatAutomationCopy(normal, true), /规划助手/);
});

test("默认固定域名已按阶段 B 启用，且配装助手优先代理直装并向资源中心降级", () => {
  const storage = memoryStorage();
  assert.equal(Companion.PLANNER_TOOL.defaultUrl, "https://layu.love/#labyrinth");
  assert.equal(Companion.isAvailable(storage), true);
  assert.equal(Companion.resolveUrl(storage), "https://layu.love/#labyrinth");
  assert.equal(
    Companion.LOADOUT_ASSISTANT_TOOL.installUrl,
    "https://js.nainai.eu.org/proxy/https://update.greasyfork.org/scripts/602254/%E9%85%8D%E8%A3%85%E5%8A%A9%E6%89%8B.user.js"
  );
  assert.equal(Companion.LOADOUT_ASSISTANT_TOOL.resourceCenterUrl, "https://js.nainai.eu.org/");
  assert.equal(Companion.LOADOUT_ASSISTANT_TOOL.homepageUrl, "https://greasyfork.org/zh-CN/scripts/602254");
  assert.equal(Companion.resolveLoadoutToolUrl(), Companion.LOADOUT_ASSISTANT_TOOL.installUrl);

  // 代理直装链缺失或非法时，优先回落至免梯资源中心而非 GreasyFork
  assert.equal(
    Companion.resolveLoadoutToolUrl({
      installUrl: "",
      resourceCenterUrl: "https://js.nainai.eu.org/",
      homepageUrl: "https://greasyfork.org/zh-CN/scripts/602254"
    }),
    "https://js.nainai.eu.org/"
  );
  assert.equal(
    Companion.resolveLoadoutToolUrl({
      installUrl: "javascript:alert(1)",
      resourceCenterUrl: "https://js.nainai.eu.org/",
      homepageUrl: "https://greasyfork.org/zh-CN/scripts/602254"
    }),
    "https://js.nainai.eu.org/"
  );
  assert.equal(
    Companion.resolveLoadoutToolUrl({
      installUrl: "",
      resourceCenterUrl: "",
      homepageUrl: "https://greasyfork.org/zh-CN/scripts/602254"
    }),
    "https://greasyfork.org/zh-CN/scripts/602254"
  );
  assert.equal(Companion.resolveLoadoutToolUrl({ installUrl: "", resourceCenterUrl: "", homepageUrl: "" }), "");

  // 确认油猴可达时优先 GreasyFork 详情页，不可达/未完成探测时走代理直装并向资源中心降级
  assert.equal(
    Companion.resolveLoadoutToolUrl(Companion.LOADOUT_ASSISTANT_TOOL, { greasyForkReachable: true }),
    "https://greasyfork.org/zh-CN/scripts/602254"
  );
  assert.deepEqual(Companion.resolveLoadoutToolLink(Companion.LOADOUT_ASSISTANT_TOOL, { probeState: "pending" }), {
    href: Companion.LOADOUT_ASSISTANT_TOOL.installUrl,
    text: "配装助手 ↗",
    title: Companion.LOADOUT_TITLE_PROXY,
    source: "proxy"
  });
  assert.deepEqual(Companion.resolveLoadoutToolLink(Companion.LOADOUT_ASSISTANT_TOOL, { probeState: "unreachable" }), {
    href: Companion.LOADOUT_ASSISTANT_TOOL.installUrl,
    text: "配装助手 ↗",
    title: Companion.LOADOUT_TITLE_PROXY,
    source: "proxy"
  });
  assert.deepEqual(Companion.resolveLoadoutToolLink(Companion.LOADOUT_ASSISTANT_TOOL, { probeState: "reachable" }), {
    href: Companion.LOADOUT_ASSISTANT_TOOL.homepageUrl,
    text: "配装助手 ↗",
    title: Companion.LOADOUT_TITLE_GREASYFORK,
    source: "greasyfork"
  });
  assert.deepEqual(
    Companion.resolveLoadoutToolLink(
      {
        nameZh: "配装助手",
        installUrl: "",
        resourceCenterUrl: "https://js.nainai.eu.org/",
        homepageUrl: "https://greasyfork.org/zh-CN/scripts/602254"
      },
      { probeState: "unreachable" }
    ),
    {
      href: "https://js.nainai.eu.org/",
      text: "配装助手 ↗",
      title: Companion.LOADOUT_TITLE_PROXY,
      source: "proxy"
    }
  );
});

function createFakeElement(tag) {
  const listeners = new Map();
  const attrs = new Map();
  const el = {
    tagName: String(tag).toUpperCase(),
    className: "",
    id: "",
    type: "",
    href: "",
    target: "",
    rel: "",
    title: "",
    placeholder: "",
    value: "",
    hidden: false,
    textContent: "",
    innerHTML: "",
    dataset: {},
    children: [],
    isConnected: true,
    classList: {
      add(...names) {
        el.className = [el.className, ...names].filter(Boolean).join(" ");
      }
    },
    setAttribute(name, value) {
      attrs.set(name, String(value));
    },
    getAttribute(name) {
      return attrs.has(name) ? attrs.get(name) : null;
    },
    removeAttribute(name) {
      attrs.delete(name);
    },
    append(...nodes) {
      for (const node of nodes) el.children.push(node);
    },
    contains(target) {
      if (target === el) return true;
      return el.children.some((child) => typeof child === "object" && child?.contains?.(target));
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    dispatch(type, event = {}) {
      const evt = { preventDefault() {}, stopPropagation() {}, target: el, ...event };
      for (const fn of [...(listeners.get(type) || [])]) fn(evt);
    },
    focus() {},
    remove() {
      el.isConnected = false;
    }
  };
  return el;
}

function createFakeDocument(sessionStorage) {
  const docListeners = new Map();
  return {
    activeElement: null,
    defaultView: { sessionStorage },
    createElement(tag) {
      return createFakeElement(tag);
    },
    createElementNS(_ns, tag) {
      return createFakeElement(tag);
    },
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, new Set());
      docListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      docListeners.get(type)?.delete(fn);
    }
  };
}

function findByClass(node, className) {
  if (!node || typeof node !== "object") return null;
  if (
    String(node.className || "")
      .split(/\s+/)
      .includes(className)
  )
    return node;
  for (const child of node.children || []) {
    const match = findByClass(child, className);
    if (match) return match;
  }
  return null;
}

test("GreasyFork 探测：覆盖 reachable / unreachable / 超时 / 并发去重 / sessionStorage 20 分钟缓存与异常降级", async () => {
  // 1. reachable + sessionStorage 缓存命中 + 20 分钟过期重探
  let fakeNow = 1_000_000;
  let calls = 0;
  const session = memoryStorage();
  const reachable = await Companion.probeGreasyForkReachable({
    sessionStorage: session,
    now: () => fakeNow,
    probeFn: async ({ url, signal }) => {
      calls += 1;
      assert.equal(url, "https://greasyfork.org/favicon.ico");
      assert.ok(signal && typeof signal.aborted === "boolean");
      return { ok: true };
    }
  });
  assert.equal(reachable, true);
  assert.equal(calls, 1);
  assert.equal(Companion.readCachedGreasyForkProbe(session, { now: () => fakeNow }), true);

  // 缓存有效期内再次调用不重复触发探测
  fakeNow += Companion.PROBE_TTL_MS - 1;
  const cachedHit = await Companion.probeGreasyForkReachable({
    sessionStorage: session,
    now: () => fakeNow,
    probeFn: async () => {
      calls += 1;
      return false;
    }
  });
  assert.equal(cachedHit, true);
  assert.equal(calls, 1);

  // 超过 20 分钟 TTL 后重新探测并写入新结果（unreachable）
  fakeNow += 1;
  const expiredReprobe = await Companion.probeGreasyForkReachable({
    sessionStorage: session,
    now: () => fakeNow,
    probeFn: async () => {
      calls += 1;
      return { ok: false, status: 403 };
    }
  });
  assert.equal(expiredReprobe, false);
  assert.equal(calls, 2);

  // 2. 异常抛出判为 unreachable
  const errorSession = memoryStorage();
  const errored = await Companion.probeGreasyForkReachable({
    sessionStorage: errorSession,
    probeFn: async () => {
      throw new Error("network failed");
    }
  });
  assert.equal(errored, false);

  // 3. 超时自动 abort 并判为 unreachable
  const timeoutSession = memoryStorage();
  let observedSignal = null;
  const timedOut = await Companion.probeGreasyForkReachable({
    sessionStorage: timeoutSession,
    timeoutMs: 20,
    probeFn: ({ signal }) => {
      observedSignal = signal;
      return new Promise(() => {});
    }
  });
  assert.equal(timedOut, false);
  assert.equal(observedSignal?.aborted, true);

  // 4. 并发调用复用同一 Promise，只触发一次 probeFn
  const dedupSession = memoryStorage();
  let dedupCalls = 0;
  let releaseProbe;
  const gate = new Promise((resolve) => {
    releaseProbe = resolve;
  });
  const p1 = Companion.probeGreasyForkReachable({
    sessionStorage: dedupSession,
    probeFn: async () => {
      dedupCalls += 1;
      await gate;
      return true;
    }
  });
  const p2 = Companion.probeGreasyForkReachable({
    sessionStorage: dedupSession,
    probeFn: async () => {
      dedupCalls += 1;
      return false;
    }
  });
  assert.strictEqual(p1, p2);
  releaseProbe();
  assert.deepEqual(await Promise.all([p1, p2]), [true, true]);
  assert.equal(dedupCalls, 1);

  // 5. 隐私模式下 sessionStorage 抛错时降级到内存缓存，不抛异常
  let privateCalls = 0;
  const throwingSession = {
    getItem() {
      throw new Error("SecurityError");
    },
    setItem() {
      throw new Error("SecurityError");
    }
  };
  assert.equal(
    await Companion.probeGreasyForkReachable({
      sessionStorage: throwingSession,
      probeFn: async () => {
        privateCalls += 1;
        return true;
      }
    }),
    true
  );
  assert.equal(
    await Companion.probeGreasyForkReachable({
      sessionStorage: throwingSession,
      probeFn: async () => {
        privateCalls += 1;
        return false;
      }
    }),
    true
  );
  assert.equal(privateCalls, 1);

  // 6. 默认 fetch 参数严格符合 CORS 零预检规格
  const originalFetch = globalThis.fetch;
  const fetchCalls = [];
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url, init });
    return { ok: true, status: 200 };
  };
  try {
    const defaultFetchSession = memoryStorage();
    const ok = await Companion.probeGreasyForkReachable({ sessionStorage: defaultFetchSession });
    assert.equal(ok, true);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, "https://greasyfork.org/favicon.ico");
    assert.equal(fetchCalls[0].init.method, "GET");
    assert.equal(fetchCalls[0].init.mode, "cors");
    assert.equal(fetchCalls[0].init.credentials, "omit");
    assert.equal(fetchCalls[0].init.cache, "no-store");
    assert.ok(fetchCalls[0].init.signal);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("地图主控浮层懒探测：打开前零请求，打开后按探测结果无感切换配装助手 href 与 title", async () => {
  // 场景 A：油猴官网可达 -> 探测前默认代理链，探测完成后无感切为 GreasyFork 详情页
  const storageA = memoryStorage();
  const sessionA = memoryStorage();
  const docA = createFakeDocument(sessionA);
  let probeCallsA = 0;
  let resolveProbeA;
  const launcherA = Companion.createLauncherIntegration(docA, {
    storage: storageA,
    sessionStorage: sessionA,
    probeFn: () => {
      probeCallsA += 1;
      return new Promise((resolve) => {
        resolveProbeA = resolve;
      });
    }
  });
  const subLinkA = findByClass(launcherA.popover, "mwi-lab-companion-sublink");
  assert.equal(probeCallsA, 0);
  assert.equal(subLinkA.textContent, "配装助手 ↗");
  assert.equal(subLinkA.href, Companion.LOADOUT_ASSISTANT_TOOL.installUrl);
  assert.equal(subLinkA.title, Companion.LOADOUT_TITLE_PROXY);

  // 用户点击打开浮层才触发懒探测
  launcherA.button.dispatch("click");
  assert.equal(probeCallsA, 1);
  assert.equal(subLinkA.href, Companion.LOADOUT_ASSISTANT_TOOL.installUrl);

  resolveProbeA(true);
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  assert.equal(subLinkA.textContent, "配装助手 ↗");
  assert.equal(subLinkA.href, "https://greasyfork.org/zh-CN/scripts/602254");
  assert.equal(subLinkA.title, Companion.LOADOUT_TITLE_GREASYFORK);

  // 关闭后再次打开直接命中 sessionStorage 缓存，不重复探测
  launcherA.close();
  launcherA.button.dispatch("click");
  assert.equal(probeCallsA, 1);
  assert.equal(subLinkA.href, "https://greasyfork.org/zh-CN/scripts/602254");
  launcherA.destroy();

  // 场景 B：油猴官网不可达 -> 保持代理直装链与代理提示 title，链接文本零跳动
  const storageB = memoryStorage();
  const sessionB = memoryStorage();
  const docB = createFakeDocument(sessionB);
  let probeCallsB = 0;
  const launcherB = Companion.createLauncherIntegration(docB, {
    storage: storageB,
    sessionStorage: sessionB,
    probeFn: async () => {
      probeCallsB += 1;
      return false;
    }
  });
  const subLinkB = findByClass(launcherB.popover, "mwi-lab-companion-sublink");
  assert.equal(probeCallsB, 0);
  launcherB.button.dispatch("click");
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  assert.equal(probeCallsB, 1);
  assert.equal(subLinkB.textContent, "配装助手 ↗");
  assert.equal(subLinkB.href, Companion.LOADOUT_ASSISTANT_TOOL.installUrl);
  assert.equal(subLinkB.title, Companion.LOADOUT_TITLE_PROXY);
  launcherB.destroy();
});
