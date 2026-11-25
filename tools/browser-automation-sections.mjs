/* global window, document, getComputedStyle */
import fs from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import sources from "./runtime-sources.mjs";
const scripts = sources
  .filter(
    (f) =>
      f.startsWith("src/calculator/") ||
      f.startsWith("src/vendor/") ||
      f === "src/ui/theme.js" ||
      f === "src/ui/recommendation-prefill.js"
  )
  .map((f) => fs.readFileSync(f, "utf8"))
  .join("\n");
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
try {
  for (const [name, width, sectionMax] of [
    ["1200", 1200, "920px"],
    ["448", 900, "448px"],
    ["390", 390, "100%"]
  ]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.setContent(
      `<style>body{background:#121318;color:#eee;font:14px system-ui;margin:16px}section{max-width:${sectionMax};margin:auto}table{width:100%;border-collapse:collapse}td,th{padding:6px 4px;text-align:left}</style><section class="LabyrinthPanel_automationSection_fixture"><div id="single">单房间设置<br>每房间最多尝试次数：20</div><table class="LabyrinthPanel_automationTable_fixture"><thead><tr><th>房间类型</th><th>配装</th><th>跳过如果高出等级</th><th class="mwi-labyrinth-calc-auto-recommend-header">推荐等级</th></tr></thead><tbody><tr><td>挤奶</td><td>所有行动</td><td>≥ 80</td><td class="mwi-labyrinth-calc-auto-recommend-cell" data-mwi-labyrinth-calc-recommend-setting="+81">+81</td></tr><tr><td>暗影弓手</td><td>近战</td><td>≥ 3</td><td class="mwi-labyrinth-calc-auto-recommend-cell" data-mwi-labyrinth-calc-recommend-setting="+3">+3</td></tr></tbody></table></section>`
    );
    await page.addScriptTag({ content: scripts });
    await page.evaluate(() => {
      const api = window.MwiLabyrinthCalculator.create({ start: false }),
        ctx = api.context;
      window.api = api;
      ctx.ensureStyle();
      ctx.getAutomationEstimateTable = () => document.querySelector("table");
      ctx.renderAutomationEstimateTable = () => {};
      ctx.getGameState = () => ({});
      ctx.getLabyrinthPanelInstance = () => null;
      window.MwiLabyrinthCalculatorModules.presentation(ctx);
      ctx.startRecommendationPrefill();
      ctx.ensureAutomationEstimateControl(document.querySelector("section"));
      ctx.renderAutomationEstimateTable([
        { key: "milking", isCombat: false },
        { key: "shadow_archer", isCombat: true }
      ]);
      const milk = document.querySelector('#mwi-labyrinth-calc-experience-goals input[data-skill="milking"]');
      if (milk) milk.value = "120";
    });
    assert.equal(
      await page.evaluate(
        () =>
          document
            .querySelector("#single")
            .compareDocumentPosition(document.querySelector("#mwi-labyrinth-calc-auto-estimate-control")) & 4
      ),
      4
    );
    assert.equal(
      await page.evaluate(
        () =>
          document
            .querySelector("#mwi-labyrinth-calc-auto-estimate-control")
            .compareDocumentPosition(document.querySelector(".mwi-labyrinth-calc-prefill-toggle")) & 4
      ),
      4,
      "预填开关应紧贴表格上方，位于房间推荐之后"
    );
    assert.deepEqual(
      await page
        .locator("[data-mwi-labyrinth-room-group]")
        .evaluateAll((ns) => ns.map((n) => n.getAttribute("data-mwi-labyrinth-room-group"))),
      ["生活", "战斗"]
    );
    assert.equal(await page.locator("tbody tr").count(), 2);
    assert.equal(
      await page
        .locator("[data-mwi-labyrinth-room-group]")
        .first()
        .evaluate((n) => getComputedStyle(n, "::before").content),
      '"生活"'
    );
    await page.screenshot({ path: `.workbench/automation-sections-${name}.png`, fullPage: true });
    await page.close();
    console.log(name, "分区与顺序通过");
  }
} finally {
  await browser.close();
}
