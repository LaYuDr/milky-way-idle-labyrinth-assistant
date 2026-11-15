/* global document, window */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { ROOT } from "./project.mjs";
const output = path.join(ROOT, ".workbench/route-display");
fs.mkdirSync(output, { recursive: true });
const files = [
  "src/core.js",
  "src/ui/sidebar.js",
  "src/runtime/beacons.js",
  "src/runtime/map-reader.js",
  "src/ui/theme.js",
  "src/ui/beacon-view.js",
  "src/ui/planner-view.js",
  "src/userscript.js"
];
const html = `<style>body{margin:16px;background:#121318;color:#eee;font:14px system-ui}main{width:330px;margin:40px auto}.LabyrinthPanel_roomGrid_fixture{display:grid;grid-template-columns:repeat(5,64px);gap:2px}.cell{height:64px;position:relative;background:#30334c}</style><main><div class="LabyrinthPanel_roomGrid_fixture">${Array.from({ length: 25 }, (_, id) => `<div class="cell ${id === 0 ? "LabyrinthPanel_clearedRoom_fixture" : ""}" data-room-x="${id % 5}" data-room-y="${Math.floor(id / 5)}">${id === 18 ? '<span class="LabyrinthPanel_roomLevel_fixture">Lv.10</span>' : ""}</div>`).join("")}</div></main>`;
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
try {
  for (const width of process.argv.includes("--narrow") ? [390] : [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 850 } });
    await context.route("**/*", (route) =>
      route.request().isNavigationRequest() ? route.fulfill({ contentType: "text/html", body: html }) : route.abort()
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://mwi.fixture.test/");
    await page.evaluate(() => {
      window.testState = {
        character: { id: "a" },
        characterLabyrinth: {
          startedAt: "run-a",
          currentFloor: 1,
          roomData: Array.from({ length: 5 }, () => Array(5).fill(null))
        }
      };
      window.MwiLabyrinthCalculator = {
        create: () => ({ context: { getGameState: () => window.testState }, destroy() {} })
      };
    });
    for (const file of files) await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, file), "utf8") });
    const markers = page.locator(".mwi-lab-route");
    const input = page.locator("#mwi-labyrinth-route-stop-floor");
    const button = page.locator(".mwi-lab-floor-toggle");
    const waitShown = (shown) =>
      page.waitForFunction((expected) => Boolean(document.querySelector(".mwi-lab-route")) === expected, shown);
    const expand = async () => {
      if ((await page.locator("#mwi-labyrinth-planner").getAttribute("data-expanded")) === "false")
        await page.locator(".mwi-lab-launcher").click();
    };
    const setting = async (value) => {
      await input.fill(value);
      await input.press("Tab");
    };
    const floor = async (value) => {
      await page.evaluate((n) => {
        window.testState.characterLabyrinth.currentFloor = n;
      }, value);
      await page.waitForTimeout(1100);
    };
    await waitShown(true);
    const gridBefore = await page.locator('[class*="roomGrid"]').boundingBox();
    await expand();
    await setting("6");
    assert.equal(
      await page.evaluate(() => window.localStorage.getItem("mwi-labyrinth:route-stop-before-floor:v1")),
      "6"
    );
    for (const n of [1, 2, 3, 4, 5]) {
      await floor(n);
      await waitShown(true);
    }
    for (const n of [6, 7]) {
      await floor(n);
      await waitShown(false);
    }
    await page.screenshot({ path: path.join(output, `hidden-${width}.png`) });
    await button.click();
    await waitShown(true);
    assert.equal(await button.textContent(), "本层");
    // Ordinary route updates preserve the override on this floor.
    await page.evaluate(() => {
      for (const [index, id] of [1, 2, 3, 4, 9, 14, 19].entries())
        document.querySelector(`[data-room-x="${id % 5}"][data-room-y="${Math.floor(id / 5)}"]`).innerHTML =
          `<span class="LabyrinthPanel_queueNumber_fixture">${index + 1}</span>`;
    });
    await page.waitForTimeout(100);
    assert.equal(await markers.count(), 1);
    await page.screenshot({ path: path.join(output, `enabled-${width}.png`) });
    await floor(8);
    await waitShown(false);
    await button.click();
    await waitShown(true);
    await page.evaluate(() => {
      window.testState.characterLabyrinth.startedAt = "run-b";
    });
    await waitShown(false);
    await button.click();
    await waitShown(true);
    await page.evaluate(() => {
      window.testState.character.id = "b";
    });
    await waitShown(false);
    await button.click();
    await waitShown(true);
    // Runtime reload keeps the saved range, but never persists the one-floor override.
    await page.evaluate(() => window.__mwiLabyrinthAssistant.destroy());
    await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, "src/userscript.js"), "utf8") });
    await waitShown(false);
    await expand();
    assert.equal(await input.inputValue(), "6");
    await floor(null);
    await waitShown(false);
    assert.match(await page.locator("#mwi-labyrinth-route-floor-help").textContent(), /暂未识别/);
    await button.click();
    await waitShown(true);
    await floor(6);
    await waitShown(false);
    for (const invalid of ["0", "-1", "2.5"]) {
      await setting(invalid);
      assert.equal(await input.getAttribute("aria-invalid"), "true");
      assert.equal(
        await page.evaluate(() => window.localStorage.getItem("mwi-labyrinth:route-stop-before-floor:v1")),
        "6"
      );
      await waitShown(false);
    }
    await setting("1");
    await floor(1);
    await waitShown(false);
    await setting("");
    await waitShown(true);
    await floor(99);
    await waitShown(true);
    assert.equal(
      await page.evaluate(() => window.localStorage.getItem("mwi-labyrinth:route-stop-before-floor:v1")),
      null
    );
    await page.getByLabel("自动路线", { exact: true }).uncheck();
    await waitShown(false);
    await button.click();
    await waitShown(true);
    await floor(100);
    await waitShown(false);
    await page.getByLabel("自动路线", { exact: true }).check();
    await waitShown(true);
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new Error("storage blocked");
      };
    });
    await setting("6");
    await waitShown(false);
    assert.match(await page.locator(".mwi-lab-display-error").textContent(), /未能保存/);
    await button.focus();
    await page.keyboard.press("Enter");
    await waitShown(true);
    const gridAfter = await page.locator('[class*="roomGrid"]').boundingBox();
    if (width >= 700) assert.deepEqual(gridAfter, gridBefore);
    else {
      // Inline validation expands the always-open menu above the map on narrow screens.
      assert.equal(gridAfter.width, gridBefore.width);
      assert.equal(gridAfter.height, gridBefore.height);
      assert.equal(gridAfter.x, gridBefore.x);
      const panelBox = await page.locator("#mwi-labyrinth-planner").boundingBox();
      assert.ok(gridAfter.y >= panelBox.y + panelBox.height);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `通过 ${width}px：1—5层显示、6层起隐藏、本层切换、换层/新挑战/角色重置、保存与重载、未知层数、无效输入、存储失败、键盘和布局。`
    );
  }
} finally {
  await browser.close();
}
