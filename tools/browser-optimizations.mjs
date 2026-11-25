/* global window, document */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { outputs } from "./build.mjs";
import { ROOT } from "./project.mjs";
// Offline fixtures only: all requests are fulfilled locally or aborted.
const directory = path.join(ROOT, ".workbench/optimizations");
fs.mkdirSync(directory, { recursive: true });
const source = fs.readFileSync(path.join(ROOT, "src/calculator/combat-engine.js"), "utf8");
const data = JSON.parse(
  zlib.gunzipSync(Buffer.from(source.match(/ctx\.MWISIM_DATA_GZ_BASE64\s*=\s*"([^"]+)"/)[1], "base64"))
);
const runtime = outputs()["runtime.js"].replace(
  "calculator = globalThis.MwiLabyrinthCalculator.create",
  "calculator = window.optimizationCalculator = globalThis.MwiLabyrinthCalculator.create"
);
const html = fs.readFileSync(path.join(ROOT, "tools/harness/calculator.html"), "utf8");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.MWI_TEST_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
const reports = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== "optimization.fixture.invalid") return route.abort();
      if (url.pathname === "/runtime.js") return route.fulfill({ contentType: "text/javascript", body: runtime });
      if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: html });
      return route.abort();
    });
    await page.addInitScript((value) => localStorage.setItem("initClientData", JSON.stringify(value)), {
      ...data.fallbackData,
      ...data.originalMaps
    });
    await page.goto("https://optimization.fixture.invalid/");
    const goals = page.locator("#mwi-labyrinth-calc-experience-goals");
    await goals.waitFor({ state: "visible" });
    await page.waitForFunction(() => !window.optimizationCalculator.context.manualUpdateRunning);
    const full = goals.getByRole("checkbox", { name: "完整扫描", exact: true });
    assert.equal(await goals.locator("[data-experience-scan-note]").count(), 0);
    await full.check();
    assert.match(await full.getAttribute("title"), /全部等级/);
    await page.reload();
    await goals.waitFor({ state: "visible" });
    assert.equal(await full.isChecked(), true);
    await full.uncheck();
    assert.match(await full.getAttribute("title"), /可能漏掉/);
    // A real storage exception must leave the draft visible and offer a working retry.
    await page.evaluate(() => {
      window.optimizationSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.includes("experience-targets")) throw new DOMException("fixture quota", "QuotaExceededError");
        return window.optimizationSetItem.call(this, key, value);
      };
    });
    const milk = goals.locator('input[data-skill="milking"]');
    await milk.fill("91.7");
    const warning = goals.locator("[data-experience-save-error]");
    assert.equal(await warning.isVisible(), true);
    assert.equal(await milk.inputValue(), "91.7");
    await goals.screenshot({ path: path.join(directory, `save-error-${width}.png`) });
    await page.evaluate(() => {
      Storage.prototype.setItem = window.optimizationSetItem;
    });
    await warning.getByRole("button", { name: "重试保存" }).click();
    assert.equal(await warning.isVisible(), false);
    await page.reload();
    await goals.waitFor({ state: "visible" });
    assert.equal(await milk.inputValue(), "91.7");
    await goals.screenshot({ path: path.join(directory, `goals-${width}.png`) });
    const overflowing = await goals.evaluate((host) => {
      const box = host.getBoundingClientRect();
      return [...host.querySelectorAll("input,button,label,p")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width && (r.left < box.left - 1 || r.right > box.right + 1);
        })
        .map((el) => el.outerHTML);
    });
    assert.deepEqual(overflowing, []);
    // Use the real worker and cache with a bounded range to verify both modes share samples.
    const scans = await page.evaluate(async () => {
      const ctx = window.optimizationCalculator.context;
      while (ctx.manualUpdateRunning)
        await new Promise((resolve) => {
          setTimeout(resolve, 20);
        });
      ctx.autoRecalcArmed = false;
      const originalMax = ctx.AUTOMATION_RECOMMEND_MAX_DELTA;
      ctx.AUTOMATION_RECOMMEND_MAX_DELTA = 10;
      const state = ctx.createCalculationRunSnapshot(ctx.getGameState());
      state.state.characterSkillMap["/skills/combat"].level = 1;
      const params = {
        state: state.state,
        initClientData: ctx.getInitClientData(),
        maxEnhancementByItem: ctx.buildMaxEnhancementByItem(state.state),
        labyrinthUpgradeLevels: state.labyrinthUpgradeLevels,
        entry: { ...ctx.LABYRINTH_AUTOMATION_COMBAT_ROOM_TYPES[0], isCombat: true },
        effectiveLevel: 1,
        recommendCombatTrials: 1,
        targetExperience: 1e20
      };
      let requests = 0;
      const post = window.Worker.prototype.postMessage;
      window.Worker.prototype.postMessage = function (message, ...args) {
        if (message.type === "run") requests++;
        return post.call(this, message, ...args);
      };
      ctx.saveExperienceScanMode("quick");
      const quick = await ctx.findExperienceRecommendation(params),
        quickRequests = requests;
      ctx.saveExperienceScanMode("full");
      const full = await ctx.findExperienceRecommendation(params),
        totalRequests = requests;
      await ctx.findExperienceRecommendation(params);
      window.Worker.prototype.postMessage = post;
      ctx.AUTOMATION_RECOMMEND_MAX_DELTA = originalMax;
      return {
        quickTo: quick.maxLevel,
        fullTo: full.maxLevel,
        quickRequests,
        totalRequests,
        repeatRequests: requests - totalRequests
      };
    });
    assert.equal(scans.quickTo, 6);
    assert.equal(scans.fullTo, 11);
    assert.equal(scans.quickRequests, 6);
    assert.equal(scans.totalRequests, 11);
    assert.equal(scans.repeatRequests, 0);
    // Unrelated page changes and polling outside the labyrinth should do no panel work.
    const idle = await page.evaluate(async () => {
      const ctx = window.optimizationCalculator.context;
      const native = document.querySelector('[class*="LabyrinthPanel_labyrinthPanel"]');
      const ancestor = native.parentElement;
      ancestor.hidden = true;
      await new Promise((resolve) => {
        setTimeout(resolve, 350);
      });
      let refreshes = 0;
      const refresh = ctx.refreshControlPanelPlacement;
      ctx.refreshControlPanelPlacement = (...args) => {
        refreshes++;
        return refresh(...args);
      };
      const outside = document.createElement("div");
      document.body.append(outside);
      for (let i = 0; i < 30; i++) {
        outside.textContent = `unrelated ${i}`;
        await new Promise((resolve) => {
          setTimeout(resolve, 50);
        });
      }
      outside.remove();
      const hiddenRefreshes = refreshes;
      ancestor.hidden = false;
      await new Promise((resolve) => {
        setTimeout(resolve, 350);
      });
      ctx.refreshControlPanelPlacement = refresh;
      return { hiddenRefreshes, reopenedRefreshes: refreshes - hiddenRefreshes };
    });
    assert.equal(idle.hiddenRefreshes, 0);
    assert.ok(idle.reopenedRefreshes > 0);
    // Native shop inline token bar builds its catalog only when the shop tab is visible, then reuses it.
    const tokens = await page.evaluate(async () => {
      const ctx = window.optimizationCalculator.context;
      const native = document.querySelector('[class*="LabyrinthPanel_labyrinthPanel"]');
      const shop = document.createElement("div");
      shop.className = "LabyrinthPanel_labyrinthShopTab_optimization";
      shop.innerHTML =
        '<div class="LabyrinthPanel_buyableGrid_optimization"><div class="LabyrinthPanel_upgrade_optimization"><div class="LabyrinthPanel_name_optimization">入场冷却</div><div class="LabyrinthPanel_iconContainer_optimization"><svg><use href="#labyrinth_cooldown"/></svg></div><div class="LabyrinthPanel_price_optimization">800</div></div></div>';
      let catalogs = 0;
      const model = window.MwiLabyrinthTokens,
        original = model.catalog;
      model.catalog = (...args) => {
        catalogs++;
        return original(...args);
      };
      for (let i = 0; i < 10; i++) ctx.refreshTokens();
      const closed = catalogs;
      native.append(shop);
      ctx.refreshTokens();
      const opened = catalogs;
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
      // Let mounting mutations settle, then repeated reads must not rebuild catalog.
      ctx.refreshTokens();
      const warm = catalogs;
      for (let i = 0; i < 10; i++) ctx.refreshTokens();
      const repeated = catalogs - warm;
      const visible =
        document.getElementById("mwi-labyrinth-calc-tokens")?.getClientRects().length > 0 &&
        shop.querySelectorAll(".mwi-labyrinth-calc-token-ctrl").length === 1;
      shop.remove();
      for (let i = 0; i < 10; i++) ctx.refreshTokens();
      const reclosed = catalogs - warm;
      model.catalog = original;
      return { closed, opened, repeated, reclosed, visible };
    });
    assert.equal(tokens.closed, 0);
    assert.equal(tokens.opened, 1);
    assert.equal(tokens.repeated, 0);
    assert.equal(tokens.reclosed, 0);
    assert.equal(tokens.visible, true);
    assert.deepEqual(errors, []);
    reports.push({ width, scans, idle, tokens, errors });
    await page.evaluate(() => window.__mwiLabyrinthAssistant.destroy());
    await context.close();
  }
} finally {
  await browser.close();
}
fs.writeFileSync(path.join(directory, "browser-results.json"), JSON.stringify(reports, null, 2));
console.log(JSON.stringify(reports));
