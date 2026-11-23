/* global getComputedStyle */
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
const runtime = outputs()["runtime.js"];
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
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1100 } });
    await page.route("**/*", (route) =>
      route.fulfill({
        contentType: route.request().url().endsWith("/runtime.js") ? "application/javascript" : "text/html",
        body: route.request().url().endsWith("/runtime.js") ? runtime : html
      })
    );
    await page.addInitScript((value) => localStorage.setItem("initClientData", JSON.stringify(value)), {
      ...data.fallbackData,
      ...data.originalMaps
    });
    await page.goto("https://restore.fixture.invalid/");
    await page.locator("#mwi-labyrinth-calc-dock").waitFor({ state: "attached" });

    assert.equal(await page.locator("#mwi-labyrinth-sidebar-tab").count(), 0);
    assert.equal(await page.getByRole("button", { name: "清除模拟缓存", exact: true }).count(), 0);
    assert.equal(
      await page.locator("#mwi-labyrinth-planner").evaluate((node) => getComputedStyle(node).position),
      "static"
    );
    assert.equal(
      await page
        .locator('[class*="LabyrinthPanel_automationSection"] #mwi-labyrinth-calc-auto-estimate-control')
        .count(),
      1
    );
    await page.locator("#mwi-labyrinth-calc-clear-rate-control button").filter({ hasText: /日志/ }).click();
    const log = page.locator("#mwi-labyrinth-calc-room-log-floating");
    await log.waitFor({ state: "visible" });
    assert.equal(await log.locator("details, summary").count(), 0);
    assert.ok((await log.locator('[class$="__actions"]').count()) > 0);
    assert.ok(await log.locator('[class$="__actions"]').last().isVisible());
    await page.waitForTimeout(1200);
    assert.equal(await log.locator("details, summary").count(), 0);
    assert.ok(
      await page.locator(".mwi-labyrinth-map-group").evaluate((host) => {
        const panel = host.querySelector("#mwi-labyrinth-planner").getBoundingClientRect();
        const grid = host.querySelector('[class*="LabyrinthPanel_roomGrid"]').getBoundingClientRect();
        const bounds = host.getBoundingClientRect();
        if (host.dataset.mwiLabyrinthStacked === "true") return grid.top >= panel.bottom;
        return (
          panel.right <= grid.left && Math.abs((panel.left + grid.right) / 2 - (bounds.left + bounds.right) / 2) < 2
        );
      })
    );
    await page.screenshot({ path: path.join(output, `restored-${width}.png`), fullPage: true });
    await page.close();
    console.log(`通过原布局 ${width}px`);
  }
} finally {
  await browser.close();
}
