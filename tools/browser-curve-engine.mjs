/* global window */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { ROOT } from "./project.mjs";

// Offline browser verification for the redesigned 1..300 curve engine,
// Worker batch shim + progress throttling, IndexedDB ArrayBuffer persistence,
// and on-demand hover combat upgrade calculation. No game/network requests.
const reference = JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/combat-engine-reference.json")));
const files = [
  "configuration",
  "game-data",
  "combat-stats",
  "curve-store",
  "simulation-cache",
  "combat-experience",
  "combat-engine",
  "loadouts",
  "combat",
  "profile-fingerprint",
  "curve-engine"
];

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.MWI_TEST_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route("**/*", (route) =>
    route.request().isNavigationRequest()
      ? route.fulfill({
          contentType: "text/html",
          body: "<!doctype html><meta charset=utf-8><title>离线 1~300 级曲线引擎验证</title>"
        })
      : route.abort()
  );
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  async function boot() {
    await page.goto("https://mwi-curve.fixture.test/");
    for (const file of files) {
      await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, `src/calculator/${file}.js`), "utf8") });
    }
    return page.evaluate(async (sampleParams) => {
      window.metrics = {
        batchMsgs: 0,
        singleMsgs: 0,
        progressMsgs: 0,
        batchProgressMsgs: 0,
        capabilities: null,
        workerCount: 0
      };
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(...args) {
          super(...args);
          window.metrics.workerCount += 1;
          this.addEventListener("message", ({ data }) => {
            if (data?.type === "ready") window.metrics.capabilities = data.capabilities || null;
            if (data?.type === "progress") window.metrics.progressMsgs += 1;
            if (data?.type === "batchProgress") window.metrics.batchProgressMsgs += 1;
          });
        }
        postMessage(message, ...args) {
          if (message?.type === "runBatch") window.metrics.batchMsgs += 1;
          if (message?.type === "run") window.metrics.singleMsgs += 1;
          super.postMessage(message, ...args);
        }
      };

      const ctx = (window.ctx = {
        destroyed: false,
        window,
        storage: window.localStorage,
        storageIdentity: () => "browser-char-1",
        combatWorkerPendingRequests: new Map(),
        combatWorkerRequestId: 0,
        setTimeout: window.setTimeout.bind(window),
        clearTimeout: window.clearTimeout.bind(window),
        listen: (target, event, handler) => target.addEventListener(event, handler)
      });
      for (const name of [
        "configuration",
        "game-data",
        "combat-engine",
        "loadouts",
        "combat",
        "profile-fingerprint",
        "curve-engine"
      ]) {
        window.MwiLabyrinthCalculatorModules[name](ctx);
      }
      const assets = await ctx.prepareMwisimWorkerAssets();
      const data = { ...assets.data.fallbackData, ...assets.data.originalMaps };
      ctx.prepareMwisimWorkerAssets = async () => assets;
      ctx.getInitClientData = () => data;
      ctx.cachedInitClientDataRaw = JSON.stringify(data);
      ctx.buildCombatPlayerDtoForRoom = () => ({
        playerDto: structuredClone(sampleParams.playerDto),
        loadoutInfo: { loadoutId: 1, loadout: { name: "Bow" }, source: "room", selectedLoadoutId: 1 }
      });
      ctx.getCombatCrateBuffs = () => ({ combatCrateItemHrids: [], combatBuffs: [], combatCrateSignature: "" });
      ctx.getActiveGuildCombatShrineLevels = () => ({});
      ctx.resolveLabyrinthUpgradeLevels = () => ({
        [ctx.LABYRINTH_UPGRADE_KEY_COMBAT_DAMAGE]: 2,
        [ctx.LABYRINTH_UPGRADE_KEY_ATTACK_SPEED]: 12,
        [ctx.LABYRINTH_UPGRADE_KEY_CAST_SPEED]: 12,
        [ctx.LABYRINTH_UPGRADE_KEY_CRITICAL_RATE]: 12,
        [ctx.LABYRINTH_UPGRADE_KEY_LABYRINTH_EXPERIENCE]: 0
      });
      ctx.buildCombatInputSnapshot = () => ({});
      ctx.deriveCombatFailureReasonFromCounts = (_tot, to, d) => (d > to ? "防御不足" : "伤害不足");
      ctx.formatEtaText = (s) => (Number.isFinite(s) ? `${Math.ceil(s)}s` : "∞");
      return { hasWasmModule: Boolean(assets.wasmModule) };
    }, reference.cases[0].params);
  }

  const initInfo = await boot();
  assert.equal(initInfo.hasWasmModule, true, "browser must precompile shared WebAssembly.Module once");

  // 1. Build a full 1..300 curve in real Chrome Workers with multi-core batch + adaptive transition refinement
  const buildReport = await page.evaluate(async () => {
    const { ctx } = window;
    await ctx.clearCurveStore();
    const data = ctx.getInitClientData();
    const profile = ctx.extractCombatProfile({}, data, "/monsters/shadow_archer", new Map());
    let maxFrameGap = 0;
    let lastTick = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      maxFrameGap = Math.max(maxFrameGap, now - lastTick);
      lastTick = now;
    }, 20);
    const t0 = performance.now();
    const entry = await ctx.buildCombatCurve(profile, {
      minLevel: 1,
      maxLevel: 300,
      baseTrials: 250,
      targetTrials: 1000,
      priority: 1
    });
    const buildMs = performance.now() - t0;
    window.clearInterval(timer);
    await ctx.flushCurveStore();

    // Measure 300x synchronous O(1) lookups
    const tLookup0 = performance.now();
    let totalWins = 0;
    for (let lv = 1; lv <= 300; lv++) {
      const s = ctx.lookupCombatLevelSync(profile, lv, 1);
      if (s) totalWins += s.successes;
    }
    const lookup300Ms = performance.now() - tLookup0;
    const lv1 = ctx.lookupCombatLevelSync(profile, 1, 1);
    const lv150 = ctx.lookupCombatLevelSync(profile, 150, 1);

    // Measure on-demand hover combat upgrades (only 1 non-maxed upgrade in fixture)
    const room = {
      roomType: ctx.LABYRINTH_COMBAT_ROOM_TYPE,
      monsterHrid: "/monsters/shadow_archer",
      recommendedLevel: 1
    };
    const tHover0 = performance.now();
    const hover1 = await ctx.ensureCombatUpgradeImpactOnHover({}, data, room, { trials: 250 });
    const hoverMs = performance.now() - tHover0;
    const batchesAfterHover1 = window.metrics.batchMsgs;
    const hover2 = await ctx.ensureCombatUpgradeImpactOnHover({}, data, room, { trials: 250 });
    const hoverCacheHit = window.metrics.batchMsgs === batchesAfterHover1;

    ctx.resetCombatSimulatorWorker();
    return {
      buildMs,
      maxFrameGap,
      lookup300Ms,
      completedLevels: entry.completedLevels,
      refinedComplete: entry.refinedComplete,
      lv1Trials: lv1?.trials,
      lv1Wins: lv1?.successes,
      lv150Trials: lv150?.trials,
      totalWins,
      hoverMs,
      hoverCacheHit,
      hoverDmgChance: hover1?.upgradeImpact?.[ctx.LABYRINTH_UPGRADE_KEY_COMBAT_DAMAGE]?.clearChance,
      hoverSpdCost: hover2?.upgradeImpact?.[ctx.LABYRINTH_UPGRADE_KEY_ATTACK_SPEED]?.cost,
      metrics: window.metrics
    };
  });

  assert.equal(buildReport.metrics.capabilities?.batch, true, "real Worker must activate batch shim");
  assert.equal(buildReport.metrics.capabilities?.throttledProgress, true);
  assert.equal(buildReport.completedLevels, 300);
  assert.equal(buildReport.refinedComplete, true);
  assert.equal(buildReport.lv1Trials, 1000, "transition Lv.1 refined to 1000 trials");
  assert.equal(buildReport.lv150Trials, 250, "deep 0% plateau kept at 250 trials");
  assert.ok(buildReport.lookup300Ms < 5, `300 lookups should be sub-5ms, got ${buildReport.lookup300Ms}ms`);
  assert.equal(buildReport.hoverCacheHit, true);
  assert.ok(Number.isFinite(buildReport.hoverDmgChance));
  assert.equal(buildReport.hoverSpdCost, null);

  // 2. Reload page and verify IndexedDB revives the entire 1..300 curve with 0 Worker runs!
  await boot();
  const reloadReport = await page.evaluate(async () => {
    const { ctx } = window;
    const data = ctx.getInitClientData();
    const room = {
      roomType: ctx.LABYRINTH_COMBAT_ROOM_TYPE,
      monsterHrid: "/monsters/shadow_archer",
      recommendedLevel: 1
    };
    const t0 = performance.now();
    const result = await ctx.queryCombatRoomViaCurve({}, data, room, new Map(), null, 1000, "0,0");
    const hydrateAndLookupMs = performance.now() - t0;
    ctx.disposeCurveEngine();
    ctx.resetCombatSimulatorWorker();
    return {
      hydrateAndLookupMs,
      trials: result?.combatMeta?.trials,
      successes: result?.combatMeta?.successes,
      metrics: window.metrics
    };
  });

  assert.equal(reloadReport.metrics.workerCount, 0, "reload lookup must spawn 0 Workers");
  assert.equal(reloadReport.metrics.batchMsgs, 0);
  assert.equal(reloadReport.metrics.singleMsgs, 0);
  assert.equal(reloadReport.trials, buildReport.lv1Trials);
  assert.equal(reloadReport.successes, buildReport.lv1Wins);
  assert.deepEqual(pageErrors, []);

  console.log(
    JSON.stringify(
      {
        buildMs: Number(buildReport.buildMs.toFixed(1)),
        maxFrameGapMs: Number(buildReport.maxFrameGap.toFixed(1)),
        lookup300Ms: Number(buildReport.lookup300Ms.toFixed(3)),
        reloadHydrateMs: Number(reloadReport.hydrateAndLookupMs.toFixed(2)),
        hoverUpgradeMs: Number(buildReport.hoverMs.toFixed(1)),
        workerCount: buildReport.metrics.workerCount,
        batchMsgs: buildReport.metrics.batchMsgs,
        lv1Trials: buildReport.lv1Trials,
        lv150Trials: buildReport.lv150Trials
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
}
