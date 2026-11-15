/* global document, window */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { outputs } from "./build.mjs";
import { ROOT } from "./project.mjs";
const output = path.join(ROOT, ".workbench/sidebar");
fs.mkdirSync(output, { recursive: true });
const source = fs.readFileSync(path.join(ROOT, "src/calculator/combat-engine.js"), "utf8");
const data = JSON.parse(
  zlib.gunzipSync(Buffer.from(source.match(/ctx\.MWISIM_DATA_GZ_BASE64\s*=\s*"([^"]+)"/)[1], "base64"))
);
const runtime = outputs()["runtime.js"].replace("enabled: false,", "enabled: true,");
const sidebar = `<aside id="fixture-sidebar"><div class="TabsComponent_tabsComponent__fixture"><div role="tablist" id="fixture-tabs">${["库存", "装备", "技能", "房屋", "公会助手"].map((label, i) => `<button role="tab" aria-selected="${!i}" tabindex="${i ? -1 : 0}">${label}</button>`).join("")}</div><div class="TabsComponent_tabPanelsContainer_fixture"><div id="fixture-native">原生侧栏内容</div></div></div></aside>`;
const html = fs
  .readFileSync(path.join(ROOT, "tools/harness/calculator.html"), "utf8")
  .replace(
    '<script src="/runtime.js"></script>',
    `${sidebar}<style>body{margin:12px}body>main{max-width:none;margin:0}#fixture-sidebar{width: min(620px,100%);margin-left:auto;background:#24273b;min-width:0}#fixture-tabs{display:flex;overflow:auto}#fixture-tabs>button{flex-shrink:0}#mwi-labyrinth-sidebar nav{overflow:auto}#mwi-labyrinth-sidebar nav button{white-space:nowrap}@media(min-width:1100px){body>main{width:calc(100% - 650px);float:left}} </style><script src="/runtime.js"></script>`
  );
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
try {
  for (const width of [1440, 900, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1100 } });
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/runtime.js")
        return route.fulfill({ contentType: "application/javascript", body: runtime });
      if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: html });
      return route.abort();
    });
    await context.addInitScript((value) => localStorage.setItem("initClientData", JSON.stringify(value)), {
      ...data.fallbackData,
      ...data.originalMaps
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("https://sidebar.fixture.invalid/");
    await page.locator("#mwi-labyrinth-sidebar-tab").waitFor();
    await page.getByRole("tab", { name: "迷宫助手", exact: true }).click();
    assert.equal(
      await page.locator("#mwi-labyrinth-planner").evaluate((node) => window.getComputedStyle(node).position),
      "static"
    );
    await page.locator("#mwi-labyrinth-calc-dock").waitFor({ state: "visible" });
    assert.equal((await page.locator(".mwi-lab-route").count()) > 0, true);
    await page.screenshot({ path: path.join(output, `planner-${width}.png`), fullPage: true });
    await page.getByRole("tab", { name: "路线与计算", exact: true }).click();
    await page.locator("#mwi-labyrinth-calc-auto-estimate-control").waitFor({ state: "visible" });
    assert.equal(await page.getByRole("tab", { name: "房间推荐", exact: true }).count(), 0);
    assert.deepEqual(await page.locator('#mwi-labyrinth-sidebar nav [role="tab"]').allTextContents(), [
      "路线与计算",
      "代币规划"
    ]);
    assert.ok(
      await page.evaluate(() => {
        const planner = document.querySelector("#mwi-labyrinth-sidebar-planner").getBoundingClientRect();
        const recommendation = document.querySelector("#mwi-labyrinth-sidebar-recommendation").getBoundingClientRect();
        return planner.height > 0 && recommendation.top >= planner.bottom;
      })
    );
    assert.equal(
      await page
        .locator('[class*="LabyrinthPanel_automationSection"] #mwi-labyrinth-calc-auto-estimate-control')
        .count(),
      0
    );
    await page.getByLabel("目标胜率 (%)", { exact: true }).fill("45");
    await page.getByLabel("目标胜率 (%)", { exact: true }).press("Tab");
    await page.screenshot({ path: path.join(output, `recommendation-${width}.png`), fullPage: true });
    if (width === 1440) {
      await page.getByRole("button", { name: "计算胜率", exact: true }).click();
      await page.waitForFunction(
        () => document.querySelector("#mwi-labyrinth-calc-auto-estimate-control")?.textContent.includes("计算完成"),
        null,
        { timeout: 60000 }
      );
      assert.equal(await page.locator(".mwi-labyrinth-calc-auto-estimate-cell").count(), 3);
    }
    await page.getByRole("tab", { name: "代币规划", exact: true }).click();
    await page.locator("#mwi-labyrinth-calc-tokens").waitFor({ state: "visible" });
    assert.equal(await page.locator("#mwi-labyrinth-calc-dock").isVisible(), false);
    assert.equal(await page.locator("#mwi-labyrinth-calc-auto-estimate-control").isVisible(), false);
    await page.getByRole("tab", { name: "路线与计算", exact: true }).click();
    assert.equal(await page.getByLabel("目标胜率 (%)", { exact: true }).inputValue(), "45");
    await page.getByRole("tab", { name: "公会助手", exact: true }).click();
    assert.equal(await page.locator("#mwi-labyrinth-sidebar").isVisible(), false);
    assert.equal(await page.locator("#fixture-native").isVisible(), true);
    await page.getByRole("tab", { name: "迷宫助手", exact: true }).click();
    await page.evaluate(() =>
      document.dispatchEvent(new CustomEvent("mwi:sidebar-plugin-activated", { detail: "guild" }))
    );
    assert.equal(await page.locator("#mwi-labyrinth-sidebar").isVisible(), false);
    await page.getByRole("tab", { name: "迷宫助手", exact: true }).click();
    await page.getByRole("tab", { name: "路线与计算", exact: true }).press("ArrowRight");
    assert.equal(await page.locator("#mwi-labyrinth-calc-tokens").isVisible(), true);
    assert.ok(
      await page.locator("#mwi-labyrinth-sidebar").evaluate((node) => node.scrollWidth <= node.clientWidth + 1)
    );
    await page.addScriptTag({ content: runtime });
    await page.locator("#mwi-labyrinth-sidebar-tab").waitFor();
    assert.equal(await page.locator("#mwi-labyrinth-sidebar-tab").count(), 1);
    await page.getByRole("tab", { name: "迷宫助手", exact: true }).click();
    await page.getByRole("tab", { name: "路线与计算", exact: true }).click();
    assert.equal(await page.getByLabel("目标胜率 (%)", { exact: true }).inputValue(), "45");
    assert.deepEqual(errors, []);
    await page.evaluate(() => window.MwiLabyrinthSidebar.destroy());
    assert.equal(await page.locator("#fixture-native").isVisible(), true);
    await context.close();
    console.log(`通过 ${width}px：路线/计算/推荐/代币，状态保留、插件互斥、键盘与销毁恢复。`);
  }
} finally {
  await browser.close();
}
