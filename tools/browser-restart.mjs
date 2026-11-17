/* global window, document */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import sources from "./runtime-sources.mjs";
import { ROOT } from "./project.mjs";
const directory = path.join(ROOT, ".workbench/restart-browser");
fs.mkdirSync(directory, { recursive: true });
const scripts = sources
  .filter((file) => file.startsWith("src/calculator/") || file.startsWith("src/vendor/") || file == "src/ui/theme.js")
  .map((file) => fs.readFileSync(path.join(ROOT, file), "utf8"))
  .join("\n");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.MWI_TEST_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
const results = [];
try {
  for (const [width, enableRestartAdvice] of [[390, false], ...[1440, 390, 320].map((value) => [value, true])]) {
    const page = await browser.newPage({ viewport: { width, height: 500 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => route.abort());
    await page.clock.install({ time: new Date("2026-11-11T00:00:00Z") });
    await page.clock.pauseAt(new Date("2026-11-11T00:00:01Z"));
    await page.setContent(
      '<style>body{margin:20px;background:#24273b;color:#edf0fa;font:14px/1.5 system-ui}h1{font-size:16px}.Header_displayName_fixture{padding:12px 0}</style><h1>提前重开提醒 · 离线测试</h1><div class="Header_actionName_fixture"><div class="Header_displayName_fixture">挤奶</div></div>'
    );
    await page.addScriptTag({ content: scripts });
    await page.evaluate((enableRestartAdvice) => {
      window.testApi = window.MwiLabyrinthCalculator.create(
        enableRestartAdvice ? { start: false, enableRestartAdvice } : { start: false }
      );
      const ctx = window.testApi.context;
      ctx.gameTravelTiming = { restart: 3, retry: 1 };
      if (!enableRestartAdvice) {
        ctx.estimateRestart = () => {
          throw new Error("Disabled restart advice must not run");
        };
      }
      ctx.ensureStyle();
      window.progress = {
        actionCounter: 1,
        actionTimeMs: 10000,
        successRate: 0.65,
        doubleProgressChance: 0.1,
        progressPerAction: 100,
        targetWorkValue: 1000,
        currentWorkValue: 0,
        timeoutAt: new Date(Date.now() + 110000).toISOString()
      };
      window.refreshLive = () => ctx.refreshLiveActionRateDisplay({ labyrinthRoomProgress: window.progress });
      window.refreshLive();
      // Use the same one-second cadence as the lifecycle's panel polling.
      ctx.setInterval(window.refreshLive, ctx.PANEL_REFRESH_POLL_MS);
    }, enableRestartAdvice);
    const notice = page.locator("#mwi-labyrinth-calc-live-action-rate");
    if (!enableRestartAdvice) {
      const before = await notice.innerText();
      assert.match(before, /19\.5%.*11/);
      assert.doesNotMatch(await notice.getAttribute("title"), /重开/);
      await page.clock.fastForward(1000);
      assert.equal(await notice.innerText(), before);
      await page.evaluate(() => {
        window.progress.actionCounter++;
        window.refreshLive();
      });
      assert.match(await notice.innerText(), /10/);
      assert.doesNotMatch(await notice.innerText(), /可考虑重开|继续本场/);
      assert.deepEqual(errors, []);
      await page.close();
      console.log("默认关闭重开建议，剩余胜率随行动更新");
      continue;
    }
    assert.match(await notice.innerText(), /可考虑重开，预计省约/);
    assert.equal(await notice.getAttribute("data-restart-advice"), "restart");
    assert.match(await notice.getAttribute("title"), /未计点击与网络延迟/);
    const geometry = await notice.evaluate((el) => ({
      right: el.getBoundingClientRect().right,
      left: el.getBoundingClientRect().left,
      width: document.documentElement.clientWidth,
      scroll: el.scrollWidth,
      client: el.clientWidth
    }));
    assert.ok(
      geometry.right <= geometry.width && geometry.left >= 0 && geometry.scroll <= geometry.client,
      JSON.stringify(geometry)
    );
    await page.screenshot({ path: path.join(directory, `restart-${width}.png`) });
    await page.clock.fastForward(9000);
    assert.match(await notice.innerText(), /继续本场/);
    assert.equal(await notice.getAttribute("data-restart-advice"), "continue");
    await page.clock.fastForward(1000);
    assert.doesNotMatch(await notice.innerText(), /可考虑重开|继续本场/);
    assert.match(await notice.getAttribute("title"), /等待新的动作结果/);
    await page.evaluate(() => {
      window.progress = {
        ...window.progress,
        actionCounter: 10,
        actionTimeMs: 11000,
        targetWorkValue: 500,
        timeoutAt: new Date(Date.now() + 10000).toISOString()
      };
      window.refreshLive();
    });
    assert.match(await notice.innerText(), /剩 0 次.*预计省约 8 秒/);
    await page.clock.fastForward(6000);
    assert.match(await notice.innerText(), /等待本场结束/);
    await page.evaluate(() => {
      window.progress.currentWorkValue = 500;
      window.refreshLive();
    });
    assert.match(await notice.innerText(), /已达目标/);
    await page.evaluate(() => {
      window.progress = {
        ...window.progress,
        actionCounter: 1,
        actionTimeMs: 10000,
        targetWorkValue: 1000,
        currentWorkValue: 0,
        timeoutAt: new Date(Date.now() + 110000).toISOString()
      };
      window.testApi.context.gameTravelTiming = null;
      window.refreshLive();
    });
    assert.doesNotMatch(await notice.innerText(), /可考虑重开/);
    await page.evaluate(() => {
      window.testApi.context.gameTravelTiming = { restart: 3, retry: 1 };
      window.refreshLive();
    });
    assert.match(await notice.innerText(), /可考虑重开/);
    // A repaired partial packet within the same second must not hit the old rounded token.
    await page.evaluate(() => {
      delete window.progress.actionCounter;
      window.refreshLive();
    });
    assert.doesNotMatch(await notice.innerText(), /可考虑重开/);
    await page.evaluate(() => {
      window.progress.actionCounter = 1;
      window.refreshLive();
    });
    assert.match(await notice.innerText(), /可考虑重开/);
    await page.evaluate(() => {
      window.progress = {
        actionCounter: 5,
        actionTimeMs: 8000,
        successRate: 0.55,
        doubleProgressChance: 0.1,
        targetLevel: 5,
        currentEnhLevel: 0,
        timeoutAt: new Date(Date.now() + 80000).toISOString()
      };
      window.refreshLive();
    });
    assert.match(await notice.innerText(), /\+0\/\+5/);
    await page.screenshot({ path: path.join(directory, `enhancing-${width}.png`) });
    await page.evaluate(() => {
      window.progress = null;
      window.refreshLive();
    });
    assert.equal(await notice.count(), 0);
    await page.evaluate(() => window.testApi.destroy());
    await page.clock.fastForward(2000);
    assert.equal(await notice.count(), 0);
    assert.deepEqual(errors, []);
    results.push({ width, passed: true });
    await page.close();
  }
} finally {
  await browser.close();
}
fs.writeFileSync(path.join(directory, "results.json"), JSON.stringify(results, null, 2) + "\n");
console.log(JSON.stringify(results));
