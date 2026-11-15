/* global document, window */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { outputs } from "./build.mjs";
import { ROOT } from "./project.mjs";
const output = path.join(ROOT, ".workbench/map-zoom");
fs.mkdirSync(output, { recursive: true });
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
    const context = await browser.newContext({ viewport: { width, height: 1100 } });
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/runtime.js")
        return route.fulfill({ contentType: "application/javascript", body: runtime });
      if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: html });
      return route.abort();
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("https://sidebar.fixture.invalid/");

    const slider = page.getByRole("button", { name: "恢复地图大小至 100%", exact: true });
    const grid = page.locator('[class*="LabyrinthPanel_roomGrid"]').first();
    const baseline = await grid.boundingBox();
    const controls = await slider.boundingBox();
    const scale = async (value) => {
      let current = Number((await slider.textContent()).replace("%", ""));
      while (current !== value) {
        await page.getByRole("button", { name: current < value ? "放大地图" : "缩小地图", exact: true }).click();
        current += current < value ? 10 : -10;
      }
      assert.equal(await page.getByRole("button", { name: "缩小地图", exact: true }).isDisabled(), value === 50);
      assert.equal(await page.getByRole("button", { name: "放大地图", exact: true }).isDisabled(), value === 200);
      await page.waitForTimeout(100);
      const bounds = await grid.boundingBox();
      assert.ok(Math.abs(bounds.width / baseline.width - value / 100) < 0.02);
      assert.ok(Math.abs(bounds.height / baseline.height - value / 100) < 0.02);
      assert.ok(Math.abs((await slider.boundingBox()).width - controls.width) < 1, "侧栏控件不随地图缩放");
      const marker = page.locator(".mwi-lab-route").first();
      const aligned = await marker.evaluate((el) => {
        const a = el.getBoundingClientRect(),
          b = el.parentElement.getBoundingClientRect();
        return a.left >= b.left && a.right <= b.right + 1 && a.bottom <= b.bottom + 1;
      });
      assert.ok(aligned, "路线仍位于对应格子内");
      const cell = grid.locator('[class*="roomCell"]').first();
      await cell.scrollIntoViewIfNeeded();
      assert.ok(
        await cell.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
        }),
        "缩放后鼠标命中原生房间"
      );
    };
    for (const value of [50, 150, 200]) await scale(value);
    await page.screenshot({ path: path.join(output, `zoom-${width}.png`), fullPage: true });
    await page.reload();

    assert.equal(await slider.textContent(), "200%");
    await page.getByRole("button", { name: "恢复地图大小至 100%", exact: true }).click();
    assert.equal(await slider.textContent(), "100%");
    assert.ok(Math.abs((await grid.boundingBox()).width - baseline.width) < 1);
    await scale(150);
    await page.evaluate(() => window.__mwiLabyrinthAssistant.destroy());
    assert.ok(Math.abs((await grid.boundingBox()).width - baseline.width) < 1, "销毁恢复原始地图大小");
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`通过 ${width}px：独立缩放、路线对齐、刷新保留、恢复和销毁。`);
  }
} finally {
  await browser.close();
}
