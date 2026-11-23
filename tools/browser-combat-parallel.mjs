/* global window */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { ROOT } from "./project.mjs";

// Offline fixture: real browser Workers/WASM, no game/account/network requests.
const reference = JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/combat-engine-reference.json")));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.MWI_TEST_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
const report = [];
try {
  for (const [cores, memory, width, expectedCeiling] of [
    [2, 8, 390, 1],
    [8, 4, 1440, 2],
    [20, 8, 1440, 16]
  ]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.route("**/*", (route) =>
      route.fulfill({ contentType: "text/html", body: "<!doctype html><title>离线并行验证</title>" })
    );
    await page.goto("https://labyrinth.test/");
    for (const file of ["combat-experience.js", "combat-engine.js"])
      await page.addScriptTag({ path: path.join(ROOT, "src/calculator", file) });
    const result = await page.evaluate(
      async ({ cores, memory, params }) => {
        let active = 0,
          peak = 0,
          heartbeats = 0;
        const NativeWorker = window.Worker;
        window.Worker = class extends NativeWorker {
          constructor(...args) {
            super(...args);
            this.addEventListener("message", ({ data }) => {
              if (data.type === "result") active--;
            });
          }
          postMessage(message, ...args) {
            if (message.type === "run") peak = Math.max(peak, ++active);
            super.postMessage(message, ...args);
          }
        };
        const ctx = {
          window: {
            navigator: { hardwareConcurrency: cores, deviceMemory: memory },
            crypto: window.crypto,
            performance: window.performance,
            document: window.document,
            localStorage: window.localStorage
          },
          combatWorkerPendingRequests: new Map(),
          combatWorkerRequestId: 0,
          setTimeout: window.setTimeout.bind(window),
          clearTimeout: window.clearTimeout.bind(window),
          listen: (target, event, handler) => target.addEventListener(event, handler),
          finiteNumber: (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback),
          deepCloneJson: (value) => JSON.parse(JSON.stringify(value))
        };
        window.MwiLabyrinthCalculatorModules["combat-engine"](ctx);
        const assets = await ctx.prepareMwisimWorkerAssets();
        ctx.prepareMwisimWorkerAssets = async () => assets;
        ctx.getInitClientData = () => ({ ...assets.data.fallbackData, ...assets.data.originalMaps });
        const jobs = Array.from({ length: 20 }, (_, i) => ({
          ...params[i % params.length],
          trials: 3000,
          seed: 1700 + i
        }));
        function values(result) {
          const copy = structuredClone(result);
          if (copy.firstRunDebug) delete copy.firstRunDebug.elapsedMs;
          return copy;
        }
        await ctx.ensureCombatSimulatorWorker();
        const serialStart = window.performance.now();
        const serial = [];
        for (const job of jobs) serial.push(values(await ctx.simulateCombatRoomWithWorker(job)));
        const serialMs = window.performance.now() - serialStart;
        peak = 0;
        const heartbeat = window.setInterval(() => heartbeats++, 20);
        let progress = 0;
        const parallelStart = window.performance.now();
        try {
          const concurrent = await Promise.all(
            jobs.map((job) =>
              ctx.simulateCombatRoomWithWorker({ ...job, parallel: true }, { add: (n) => (progress += n) }).then(values)
            )
          );
          const parallelMs = window.performance.now() - parallelStart;
          // Force a responsive-policy backoff, then verify real localStorage
          // survives a full navigation below (not merely a new JS context).
          ctx.observeCombatResponsiveness(200);
          const savedStartup = ctx.getCombatConcurrencyState().limit;
          return {
            savedStartup,
            cores,
            memory,
            ceiling: ctx.getCombatParallelism(),
            peak,
            heartbeats,
            progress,
            serialMs: Math.round(serialMs),
            parallelMs: Math.round(parallelMs),
            identical: JSON.stringify(serial) === JSON.stringify(concurrent)
          };
        } finally {
          window.clearInterval(heartbeat);
          ctx.resetCombatSimulatorWorker();
        }
      },
      { cores, memory, params: reference.cases.slice(0, 8).map((entry) => entry.params) }
    );
    assert.equal(result.identical, true);
    assert.equal(result.ceiling, expectedCeiling);
    assert.equal(result.progress, 60000);
    assert.ok(result.peak <= expectedCeiling);
    assert.ok(result.peak >= Math.min(4, expectedCeiling));
    assert.ok(result.heartbeats > 0);
    await page.reload();
    await page.addScriptTag({ path: path.join(ROOT, "src/calculator/combat-engine.js") });
    result.restoredStartup = await page.evaluate(
      ({ cores, memory }) => {
        const ctx = {
          window: { navigator: { hardwareConcurrency: cores, deviceMemory: memory }, localStorage: window.localStorage }
        };
        window.MwiLabyrinthCalculatorModules["combat-engine"](ctx);
        return ctx.getCombatConcurrencyState().limit;
      },
      { cores, memory }
    );
    assert.equal(result.restoredStartup, result.savedStartup);
    report.push(result);
    console.log(JSON.stringify(result));
    await page.close();
  }
} finally {
  await browser.close();
}
fs.mkdirSync(path.join(ROOT, ".workbench"), { recursive: true });
fs.writeFileSync(path.join(ROOT, ".workbench/combat-parallel-browser.json"), JSON.stringify(report, null, 2) + "\n");
