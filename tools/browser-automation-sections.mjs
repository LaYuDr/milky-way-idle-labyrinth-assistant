/* global window, document, getComputedStyle */
import fs from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import sources from "./runtime-sources.mjs";
const scripts = sources
  .filter((f) => f.startsWith("src/calculator/") || f.startsWith("src/vendor/") || f === "src/ui/theme.js")
  .map((f) => fs.readFileSync(f, "utf8"))
  .join("\n");
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
try {
  for (const width of [1200, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.setContent(
      '<style>body{background:#121318;color:#eee;font:14px system-ui}section{max-width:600px;margin:auto}table{width:100%;border-collapse:collapse}td{padding:10px}</style><section class="LabyrinthPanel_automationSection_fixture"><div id="single">单房间设置<br>每房间最多尝试次数：20</div><table class="LabyrinthPanel_automationTable_fixture"><tbody><tr><td>挤奶</td><td>所有行动</td><td>≥ 80</td><td>+81</td></tr><tr><td>暗影弓手</td><td>近战</td><td>≥ 3</td><td>+3</td></tr></tbody></table></section>'
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
      ctx.ensureAutomationEstimateControl(document.querySelector("section"));
      ctx.renderAutomationEstimateTable([
        { key: "milking", isCombat: false },
        { key: "shadow_archer", isCombat: true }
      ]);
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
    assert.deepEqual(
      await page
        .locator("[data-mwi-labyrinth-room-group]")
        .evaluateAll((ns) => ns.map((n) => n.getAttribute("data-mwi-labyrinth-room-group"))),
      ["生活项目", "战斗项目"]
    );
    assert.equal(await page.locator("tbody tr").count(), 2);
    assert.equal(
      await page
        .locator("[data-mwi-labyrinth-room-group]")
        .first()
        .evaluate((n) => getComputedStyle(n, "::before").content),
      '"生活项目"'
    );
    await page.screenshot({ path: `.workbench/automation-sections-${width}.png`, fullPage: true });
    await page.close();
    console.log(width, "分区与顺序通过");
  }
} finally {
  await browser.close();
}
