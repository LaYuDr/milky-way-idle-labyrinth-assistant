/* global window, document, IDBObjectStore, IDBDatabase */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { ROOT } from "./project.mjs";
const params = JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/combat-engine-reference.json"))).cases[0]
  .params;
const files = ["configuration", "appearance", "controls", "simulation-cache", "combat-experience", "combat-engine"];
const out = path.join(ROOT, ".workbench/simulation-cache");
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.MWI_TEST_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
const report = [];
try {
  for (const width of [390, 1440, 1920]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route("**/*", (route) =>
      route.request().isNavigationRequest()
        ? route.fulfill({
            contentType: "text/html",
            body: '<meta charset="utf-8"><style>body{background:#121318;color:#eee;font:14px system-ui;margin:16px}section{max-width:460px;padding:12px;border:1px solid #41465d}button{font:inherit}</style><section><h3>迷宫助手</h3><div id="controls"></div><p id="result">已有推荐等级 +81</p></section>'
          })
        : route.abort()
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    async function boot() {
      await page.goto("https://mwi-cache.fixture.test/");
      for (const file of files)
        await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, `src/calculator/${file}.js`), "utf8") });
      await page.evaluate(async (params) => {
        window.workerRuns = 0;
        const Native = window.Worker;
        window.Worker = class extends Native {
          postMessage(message, ...args) {
            if (message.type === "run") window.workerRuns++;
            super.postMessage(message, ...args);
          }
        };
        const ctx = (window.ctx = {
          window,
          storage: window.localStorage,
          storageIdentity: () => "test-owner",
          setTimeout: window.setTimeout.bind(window),
          clearTimeout: window.clearTimeout.bind(window),
          listen: (target, event, handler) => target.addEventListener(event, handler),
          finiteNumber: (n, fallback) => (Number.isFinite(Number(n)) ? Number(n) : fallback),
          deepCloneJson: (value) => JSON.parse(JSON.stringify(value))
        });
        for (const name of ["configuration", "appearance", "controls", "combat-engine"])
          window.MwiLabyrinthCalculatorModules[name](ctx);
        const assets = await ctx.prepareMwisimWorkerAssets();
        const data = { ...assets.data.fallbackData, ...assets.data.originalMaps };
        ctx.prepareMwisimWorkerAssets = async () => assets;
        ctx.getInitClientData = () => data;
        ctx.cachedInitClientDataRaw = JSON.stringify(data);
        ctx.ensureStyle();
        const host = document.getElementById("controls");
        host.innerHTML = '<button class="calculate">计算迷宫</button>';
        document.querySelector(".calculate").onclick = () => window.calculate();
        window.calculate = () => ctx.simulateCombatRoomWithWorker({ ...params, reuseSimulation: true });
      }, params);
    }
    await boot();
    const first = await page.evaluate(async () => {
      const value = await window.calculate();
      await window.ctx.flushSimulationCache();
      return { value, runs: window.workerRuns };
    });
    assert.equal(first.runs, 1);
    await boot();
    const restored = await page.evaluate(async () => {
      const value = await window.calculate();
      return { value, runs: window.workerRuns };
    });
    assert.equal(restored.runs, 0, "reload must restore sample without Worker simulation");
    assert.deepEqual(restored.value, first.value);
    // Two consumers on a freshly loaded page share a single persisted sample.
    const other = await context.newPage();
    await other.goto("https://mwi-cache.fixture.test/");
    await other.addScriptTag({
      content: fs.readFileSync(path.join(ROOT, "src/calculator/simulation-cache.js"), "utf8")
    });
    assert.equal(
      await other.evaluate(async () => {
        const cache = window.MwiLabyrinthSimulationCache.create();
        await cache.put("cross-tab", { expectedSecondsPerClear: Infinity });
        return (await cache.get("cross-tab")).expectedSecondsPerClear === Infinity;
      }),
      true
    );
    await other.close();
    assert.equal(await page.evaluate(() => window.ctx.clearSimulationCache()), true);
    assert.equal(await page.locator("#result").textContent(), "已有推荐等级 +81");
    await page.evaluate(() => window.calculate());
    assert.equal(await page.evaluate(() => window.workerRuns), 1);
    await page.screenshot({ path: path.join(out, `cache-${width}.png`) });
    const storage = await page.evaluate(async () => {
      const factory = window.MwiLabyrinthSimulationCache;
      const cache = factory.create({ maxEntries: 2, maxBytes: 1024 });
      await cache.clear();
      await cache.put("a", { value: 1 });
      await cache.put("b", { value: 2 });
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
      const txModes = [];
      const origTx = IDBDatabase.prototype.transaction;
      try {
        IDBDatabase.prototype.transaction = function (stores, mode) {
          txModes.push(mode || "readonly");
          return origTx.call(this, stores, mode);
        };
        await cache.get("a");
      } finally {
        IDBDatabase.prototype.transaction = origTx;
      }
      await cache.put("c", { value: 3 });
      const lru = [await cache.get("a"), await cache.get("b"), await cache.get("c")];
      await cache.flush();
      await cache.put("a", { value: 4 });
      const db = await new Promise((resolve) => {
        const request = window.indexedDB.open("mwi-labyrinth:simulation-cache:v1", 1);
        request.onsuccess = () => resolve(request.result);
      });
      const readTotals = () =>
        new Promise((resolve) => {
          const request = db.transaction("meta").objectStore("meta").get("totals");
          request.onsuccess = () => resolve(request.result);
        });
      const totals = await readTotals();
      const tiny = factory.create({ maxBytes: 200 });
      await tiny.clear();
      await tiny.put("x", { text: "x".repeat(35) });
      await tiny.put("y", { text: "y".repeat(35) });
      await tiny.put("z", { text: "z".repeat(35) });
      const bounded = await readTotals();
      await tiny.put("huge", { text: "x".repeat(1000) });
      const oversize = await tiny.get("huge");
      const unavailable = factory.create({
        indexedDB: {
          open() {
            throw new Error("disabled");
          }
        }
      });
      const fallback = await unavailable.get("x");
      const put = IDBObjectStore.prototype.put;
      let quota, recovered;
      const recoverable = factory.create({ retryCooldownMs: 20, maxCooldownMs: 40 });
      try {
        IDBObjectStore.prototype.put = function () {
          throw new DOMException("quota", "QuotaExceededError");
        };
        quota = await recoverable.put("full", { value: 1 });
      } finally {
        IDBObjectStore.prototype.put = put;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 30);
      });
      await recoverable.put("recovered", { value: 9 });
      recovered = await recoverable.get("recovered");
      recoverable.close();
      cache.close();
      tiny.close();
      db.close();
      window.ctx.resetCombatSimulatorWorker();
      return { txModes, lru, totals, bounded, oversize, fallback, quota, recovered };
    });
    assert.deepEqual(storage.txModes, ["readonly"]);
    assert.deepEqual(storage.lru, [{ value: 1 }, null, { value: 3 }]);
    assert.equal(storage.totals.entries, 2);
    assert.ok(storage.bounded.bytes <= 200);
    assert.equal(storage.oversize, null);
    assert.equal(storage.fallback, null);
    assert.equal(storage.quota, null);
    assert.deepEqual(storage.recovered, { value: 9 });
    assert.deepEqual(errors, []);
    report.push({
      width,
      reloadWorkerRuns: restored.runs,
      afterClearWorkerRuns: 1,
      lru: "passed",
      storageFailure: "passed"
    });
    await context.close();
  }
  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
