/* global window, document, getComputedStyle */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import sources from "./runtime-sources.mjs";
import { ROOT } from "./project.mjs";

const directory = path.join(ROOT, ".workbench/native-room-status");
fs.mkdirSync(directory, { recursive: true });
const scripts = sources
  .filter((file) => file.startsWith("src/calculator/") || file.startsWith("src/vendor/") || file === "src/ui/theme.js")
  .map((file) => fs.readFileSync(path.join(ROOT, file), "utf8"))
  .join("\n");
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    await page.route("**/*", (route) => route.abort());
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(`<style>
body{margin:16px;background:#121318;color:#eee;font:14px system-ui}
.grid{display:grid;grid-template-columns:repeat(4,46px);gap:3px}
.cell{position:relative;width:46px;height:46px;display:grid;background:#2d2e43;border-radius:3px}
.cell>*{grid-area:1/1}
.level{justify-self:start;align-self:start;font-size:12px;line-height:1}
.icon{justify-self:center;align-self:center;font-size:18px}
.LabyrinthPanel_roomEntered_fixture,.LabyrinthPanel_roomFailCount_fixture{justify-self:center;align-self:end;margin-bottom:1px;font-size:10px;line-height:1}
.LabyrinthPanel_roomFailCount_fixture{color:#f99}
.LabyrinthPanel_clearedRoom_fixture{background:#484872}
</style><p>原生房间状态 · 离线回归</p><div class="grid"></div>`);
    await page.addScriptTag({ content: scripts });
    await page.evaluate(() => {
      const api = window.MwiLabyrinthCalculator.create({ start: false });
      window.statusTest = api;
      const ctx = api.context;
      ctx.ensureStyle();
      for (let i = 0; i < 4; i++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.dataset.roomX = String(i);
        cell.dataset.roomY = "0";
        cell.innerHTML = '<span class="level">Lv.80</span><span class="icon">♟</span>';
        document.querySelector(".grid").append(cell);
        ctx.upsertBadge(cell, 0.75, 60, "fixture");
        ctx.setCellSkillingPreview(cell, {
          clearChance: 0.75,
          expectedSecondsPerClear: 60,
          experiencePerRoom: 2000,
          experiencePerHour: 100000
        });
      }
      document
        .querySelector('[data-room-x="1"]')
        .insertAdjacentHTML("beforeend", '<span class="LabyrinthPanel_roomEntered_fixture">已进入</span>');
      document
        .querySelector('[data-room-x="2"]')
        .insertAdjacentHTML("beforeend", '<span class="LabyrinthPanel_roomFailCount_fixture">失败: 3</span>');
      document.querySelector('[data-room-x="3"]').classList.add("LabyrinthPanel_clearedRoom_fixture");
    });
    for (const zoom of [0.75, 1, 1.4, 2]) {
      await page.locator(".grid").evaluate((grid, value) => (grid.style.zoom = value), zoom);
      const state = await page.evaluate(() => ({
        badges: [...document.querySelectorAll(".mwi-labyrinth-calc-clear-rate-badge")].map(
          (node) => getComputedStyle(node).display !== "none"
        ),
        native: [...document.querySelectorAll('[class*="roomEntered"],[class*="roomFailCount"]')].map((node) => {
          const rect = node.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === node
          );
        })
      }));
      assert.deepEqual(state, { badges: [true, false, false, false], native: [true, true] });
    }
    await page.locator('[data-room-x="1"]').hover();
    await page.locator("#mwi-labyrinth-calc-clear-rate-preview").waitFor({ state: "visible" });
    assert.match(await page.locator("#mwi-labyrinth-calc-clear-rate-preview").innerText(), /75\.0%/);
    await page.mouse.move(width - 5, 750);
    await page.screenshot({ path: path.join(directory, `${width}.png`) });
    await page.evaluate(() => {
      const cell = document.querySelector('[data-room-x="1"]');
      cell.querySelector('[class*="roomEntered"]').remove();
    });
    assert.equal(await page.locator('[data-room-x="1"] .mwi-labyrinth-calc-clear-rate-badge').isVisible(), true);
    await page.evaluate(() => {
      const cell = document.querySelector('[data-room-x="1"]');
      const replacement = cell.cloneNode(true);
      replacement.insertAdjacentHTML("beforeend", '<span class="LabyrinthPanel_roomEntered_new">已进入</span>');
      cell.replaceWith(replacement);
    });
    assert.equal(await page.locator('[data-room-x="1"] .mwi-labyrinth-calc-clear-rate-badge').isVisible(), false);
    assert.deepEqual(errors, []);
    await page.evaluate(() => window.statusTest.destroy());
    assert.equal(await page.locator('[class*="roomEntered"]').innerText(), "已进入");
    await page.close();
  }
  console.log("Native entered/failure labels preserved; hover, dynamic state, rebuild, zoom and teardown passed.");
} finally {
  await browser.close();
}
