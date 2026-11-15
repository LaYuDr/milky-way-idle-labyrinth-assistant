/* global document, window */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import sources from "./runtime-sources.mjs";
import { ROOT } from "./project.mjs";
const output = path.join(ROOT, ".workbench/exit-rewards");
fs.mkdirSync(output, { recursive: true });
const scripts = sources
  .filter((file) => file.startsWith("src/calculator/") || file.startsWith("src/vendor/") || file === "src/ui/theme.js")
  .map((file) => fs.readFileSync(path.join(ROOT, file), "utf8"))
  .join("\n");
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
try {
  for (const [width, language] of [
    [1440, "zh"],
    [390, "zh"],
    [800, "en"]
  ]) {
    const page = await browser.newPage({ viewport: { width, height: 700 } });
    await page.route("**/*", (route) => route.abort());
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(
      `<style>body{background:#121318;color:#edf0fa;font:14px system-ui;margin:20px}.LabyrinthPanel_roomGrid_fixture{display:grid;grid-template-columns:repeat(3,70px);gap:2px}.LabyrinthPanel_roomCell_fixture{height:70px;background:#2c3047}</style><p>终点奖励 · 离线验证</p><div class="LabyrinthPanel_roomGrid_fixture">${Array.from({ length: 9 }, (_, id) => `<div class="LabyrinthPanel_roomCell_fixture" data-room-x="${id % 3}" data-room-y="${Math.floor(id / 3)}">${id === 8 ? "终点" : ""}</div>`).join("")}</div>`
    );
    await page.addScriptTag({ content: scripts });
    await page.evaluate((language) => {
      window.testApi = window.MwiLabyrinthCalculator.create({ start: false });
      const ctx = window.testApi.context;
      ctx.isChineseUi = () => language === "zh";
      ctx.getUiLanguage = () => (language === "zh" ? ctx.UI_LANGUAGE_ZH : "en");
      window.state = {
        characterLabyrinth: {
          currentFloor: 1,
          roomData: Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({})))
        }
      };
      ctx.getGameState = () => window.state;
      ctx.ensureStyle();
      window.clickCount = 0;
      document.querySelector('[class*="roomGrid"]').addEventListener("click", () => window.clickCount++);
      ctx.restoreSavedRoomResults(window.state);
    }, language);
    const exit = () => page.locator('[class*="LabyrinthPanel_roomCell"]').last();
    const tip = page.locator("#mwi-labyrinth-calc-clear-rate-preview");
    for (const [floor, expected] of [
      [1, ["5", "0", "0", "0"]],
      [4, ["20", "0.5", "0.5", "0"]],
      [6, ["30", "1.5", "1.5", "1"]],
      [8, ["40", "2.5", "2.5", "2"]]
    ]) {
      await page.evaluate((floor) => {
        window.state.characterLabyrinth.currentFloor = floor;
        window.testApi.context.restoreSavedRoomResults(window.state);
      }, floor);
      await page.mouse.move(0, 0);
      await exit().hover();
      await tip.waitFor({ state: "visible" });
      assert.equal(
        await tip.locator('[class$="__title"]').textContent(),
        language === "zh" ? `第 ${floor} 层通关奖励` : `Floor ${floor} completion rewards`
      );
      assert.deepEqual(await tip.locator('[class$="__value"]').allTextContents(), expected);
      assert.equal(await page.evaluate(() => window.state.characterLabyrinth.roomData[2][2].roomType), undefined);
    }
    await page.screenshot({ path: path.join(output, `${language}-${width}.png`) });
    assert.ok(await tip.evaluate((el) => el.scrollWidth <= el.clientWidth));
    const bounds = await tip.boundingBox();
    assert.ok(bounds.x >= 8 && bounds.x + bounds.width <= width - 8);
    await page.evaluate(() => {
      window.state.characterLabyrinth.currentFloor = null;
    });
    await page.mouse.move(0, 0);
    await exit().hover();
    assert.equal(await tip.isVisible(), false);
    await page.evaluate(() => {
      window.state.characterLabyrinth.currentFloor = 6;
      const grid = document.querySelector('[class*="roomGrid"]');
      grid.replaceChildren(...[...grid.children].map((cell) => cell.cloneNode(true)));
      window.testApi.context.restoreSavedRoomResults(window.state);
    });
    await page.mouse.move(0, 0);
    await exit().hover();
    await tip.waitFor({ state: "visible" });
    assert.deepEqual(await tip.locator('[class$="__value"]').allTextContents(), ["30", "1.5", "1.5", "1"]);
    await page.mouse.move(width - 1, 690);
    await page.waitForTimeout(200);
    assert.equal(await tip.isVisible(), false);
    assert.equal(await page.evaluate(() => window.clickCount), 0);
    await page.evaluate(() => window.testApi.destroy());
    assert.deepEqual(errors, []);
    await page.close();
    console.log(
      `通过 ${width}px ${language}：未揭示终点直接悬浮奖励、分层奖励、即时换层、未知层数、DOM重建、移出隐藏，无游戏点击。`
    );
  }
} finally {
  await browser.close();
}
