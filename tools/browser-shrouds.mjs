/* global document, window */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { ROOT } from "./project.mjs";
const directory = path.join(ROOT, ".workbench/shroud-browser");
fs.mkdirSync(directory, { recursive: true });
const cleared = [0, 1, 2, 3, 4, 9, 10];
const levels = { 5: 101, 8: 120, 11: 107, 12: 115, 17: 114, 18: 114 };
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.MWI_TEST_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setContent(
      `<style>body{margin:20px;background:#121318;color:#eee;font:14px system-ui}main{max-width:900px;margin:auto}h1{font-size:20px}.LabyrinthPanel_roomGrid_fixture{display:grid;grid-template-columns:repeat(8,64px);gap:3px;width:max-content;margin:30px auto}.LabyrinthPanel_roomCell_fixture{position:relative;height:64px;background:#191b24}.LabyrinthPanel_clearedRoom_fixture{background:#494b75}.LabyrinthPanel_roomLevelWarning_fixture{color:#ff4c57}#root{overflow:auto}</style><main><h1>道具破局 · 截图布局复现</h1><p>本地模拟：仅绘制路线，不执行游戏操作。</p><div id="root"><div class="LabyrinthPanel_roomGrid_fixture">${Array.from({ length: 64 }, (_, id) => `<div class="LabyrinthPanel_roomCell_fixture ${cleared.includes(id) ? "LabyrinthPanel_clearedRoom_fixture" : ""}" data-room-x="${id % 8}" data-room-y="${Math.floor(id / 8)}">${id === 0 ? "入口" : id === 63 ? "出口" : levels[id] ? `<span class="LabyrinthPanel_roomLevel_fixture LabyrinthPanel_roomLevelWarning_fixture">Lv.${levels[id]}</span>` : ""}</div>`).join("")}</div></div></main>`
    );
    const mapBox = await page.locator(".LabyrinthPanel_roomGrid_fixture").boundingBox();
    for (const file of [
      "src/core.js",
      "src/runtime/map-reader.js",
      "src/runtime/shrouds.js",
      "src/ui/theme.js",
      "src/ui/beacon-view.js",
      "src/ui/planner-view.js"
    ])
      await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, file), "utf8") });
    await page.evaluate(() => {
      window.fixtureState = {
        characterLabyrinth: {
          shroudCount: 2,
          shroudItemHrid: "/items/expert_shroud",
          roomData: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => ({})))
        }
      };
      window.MwiLabyrinthCalculator = {
        create: () => ({ context: { getGameState: () => window.fixtureState }, destroy() {} })
      };
    });
    await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, "src/userscript.js"), "utf8") });
    if (width < 700) await page.locator(".mwi-lab-launcher").click();
    await page.waitForFunction(() => document.querySelectorAll('.mwi-lab-route[data-force="true"]').length === 1);
    assert.match(await page.locator(".mwi-lab-force-hint").innerText(), /道具至少 1 次/);
    assert.match(await page.locator(".mwi-lab-force-hint").innerText(), /剩余 2 次/);
    assert.deepEqual(await page.locator(".LabyrinthPanel_roomGrid_fixture").boundingBox(), mapBox);
    await page.screenshot({ path: path.join(directory, `ready-${width}.png`) });
    // Supply changes outside the map must be picked up by the normal refresh poll.
    await page.evaluate(() => {
      window.fixtureState.characterLabyrinth.shroudCount = 0;
    });
    await page.waitForFunction(() => document.querySelector(".mwi-lab-route-notice")?.textContent.includes("道具不足"));
    assert.match(await page.locator(".mwi-lab-force-hint").innerText(), /参考路线/);
    await page.screenshot({ path: path.join(directory, `insufficient-${width}.png`) });
    await page.evaluate(() => {
      window.fixtureState.characterLabyrinth.shroudCount = 2;
      window.fixtureState.characterLabyrinth.shroudItemHrid = "/items/advanced_shroud";
    });
    await page.waitForFunction(() => document.querySelector(".mwi-lab-force-hint")?.textContent.includes("98%"));
    assert.equal(await page.locator('[data-room-x="5"][data-room-y="0"] .mwi-lab-route[data-force="true"]').count(), 1);
    assert.match(await page.locator(".mwi-lab-route-notice").innerText(), /可能失败/);
    await page.evaluate(() => {
      window.fixtureState.characterLabyrinth.shroudItemHrid = "/items/basic_shroud";
    });
    await page.waitForFunction(() => document.querySelector(".mwi-lab-route-notice")?.textContent.includes("无法突破"));
    assert.equal(await page.locator('.mwi-lab-route[data-force="true"]').count(), 0);
    await page.evaluate(() => {
      window.fixtureState.characterLabyrinth.shroudItemHrid = "/items/missing";
    });
    await page.waitForFunction(() =>
      document.querySelector(".mwi-lab-route-notice")?.textContent.includes("未识别当前道具")
    );
    await page.evaluate(() => {
      const room = document.querySelector('[data-room-x="4"][data-room-y="1"]');
      room.classList.add("LabyrinthPanel_clearedRoom_fixture");
    });
    await page.waitForFunction(() => document.querySelector(".mwi-lab-force-hint")?.hidden);
    assert.equal(await page.locator(".mwi-lab-force-hint").isVisible(), false);
    assert.equal(await page.locator('.mwi-lab-route[data-force="true"]').count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`通过 ${width}px：破局路线、道具数量更新、适用等级、失败概率及普通路线优先。`);
  }
} finally {
  await browser.close();
}
