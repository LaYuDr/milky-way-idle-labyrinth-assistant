/* global document, window */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { ROOT } from "./project.mjs";
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/isolated-origin.json"), "utf8"));
const output = path.join(ROOT, ".workbench/path-connectivity");
fs.mkdirSync(output, { recursive: true });
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
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(
      `<style>body{margin:16px;background:#111218;color:#eee;font:13px system-ui}main{max-width:620px;margin:auto}#map{overflow:auto}.LabyrinthPanel_roomGrid_fixture{display:grid;grid-template-columns:repeat(8,64px);gap:3px;width:max-content}.cell{position:relative;height:64px;background:#191a23}.LabyrinthPanel_clearedRoom_fixture{background:#474774}.LabyrinthPanel_roomLevelWarning_fixture{color:#ff4c57}</style><main><p>用户截图复现 · 本地模拟，不操作游戏</p><div id="map"><div class="LabyrinthPanel_roomGrid_fixture">${Array.from(
        { length: 64 },
        (_, id) => {
          const level = fixture.red[id] ?? fixture.white[id];
          return `<div class="cell ${fixture.cleared.includes(id) ? "LabyrinthPanel_clearedRoom_fixture" : ""}" data-room-x="${id % 8}" data-room-y="${Math.floor(id / 8)}">${id === 0 ? "入口" : id === 63 ? '<span class="LabyrinthPanel_roomIcon_fixture">出口</span>' : level ? `<span class="LabyrinthPanel_roomLevel_fixture ${fixture.red[id] ? "LabyrinthPanel_roomLevelWarning_fixture" : ""}">Lv.${level}</span>` : fixture.treasures.includes(id) ? '<span class="LabyrinthPanel_roomIcon_fixture"><svg><use href="#loot"></use></svg>宝箱</span>' : ""}</div>`;
        }
      ).join("")}</div></div></main>`
    );
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
          roomData: Array.from({ length: 8 }, () => Array(8).fill(null)),
          shroudItemHrid: "/items/expert_shroud",
          shroudCount: 1
        }
      };
      window.MwiLabyrinthCalculator = {
        create: () => ({ context: { getGameState: () => window.fixtureState }, destroy() {} })
      };
      const create = window.MwiLabyrinthView.create;
      window.MwiLabyrinthView.create = (doc) => {
        const view = create(doc),
          update = view.update;
        view.update = (map, result) => {
          window.lastPlan = result;
          update(map, result);
        };
        return view;
      };
      window.cell = (id) => document.querySelector(`[data-room-x="${id % 8}"][data-room-y="${Math.floor(id / 8)}"]`);
      window.setQueue = (ids) => {
        document.querySelectorAll(".LabyrinthPanel_queueNumber_fixture").forEach((node) => node.remove());
        ids.forEach((id, index) =>
          window
            .cell(id)
            .insertAdjacentHTML("beforeend", `<span class="LabyrinthPanel_queueNumber_fixture">${index + 1}</span>`)
        );
      };
      window.gameClicks = 0;
      document.querySelector(".LabyrinthPanel_roomGrid_fixture").addEventListener("click", () => window.gameClicks++);
    });
    const before = await page.locator(".LabyrinthPanel_roomGrid_fixture").boundingBox();
    await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, "src/userscript.js"), "utf8") });
    await page.waitForFunction(() => window.lastPlan?.main?.forceCount === 1);
    assert.deepEqual(await page.evaluate(() => window.lastPlan.main.forcedRooms), [61]);
    assert.deepEqual(await page.locator(".mwi-lab-route b").allTextContents(), ["1·道", "2", "3"]);
    assert.equal(await page.locator('[data-room-x="5"][data-room-y="3"] .mwi-lab-route').count(), 0);
    if (width < 700) await page.locator(".mwi-lab-launcher").click();
    await page.screenshot({ path: path.join(output, `screenshot-corrected-${width}.png`) });
    await page.evaluate(() => {
      window.fixtureState.characterLabyrinth.shroudCount = 0;
    });
    await page.waitForFunction(() => window.lastPlan?.forceStatus === "insufficient");
    assert.equal(await page.evaluate(() => window.lastPlan.main), null);
    assert.match(await page.locator(".mwi-lab-force-hint").innerText(), /参考路线/);
    await page.evaluate(() => {
      window.fixtureState.characterLabyrinth.shroudItemHrid = "/items/missing";
    });
    await page.waitForFunction(() => window.lastPlan?.forceStatus === "unknown-item");
    assert.equal(await page.locator(".mwi-lab-route").count(), 0);
    await page.evaluate(() => {
      window.fixtureState.characterLabyrinth.shroudCount = 1;
      window.fixtureState.characterLabyrinth.shroudItemHrid = "/items/expert_shroud";
      window.cell(21).querySelector("span").classList.remove("LabyrinthPanel_roomLevelWarning_fixture");
    });
    await page.waitForFunction(() => window.lastPlan?.main?.source === 21 && !window.lastPlan.breakthrough);
    await page.evaluate(() => window.setQueue([21, 22, 30, 38, 46, 54, 62]));
    await page.waitForFunction(() => window.lastPlan?.main?.source === 62);
    assert.deepEqual(await page.locator(".mwi-lab-route b").allTextContents(), ["1"]);
    await page.evaluate(() =>
      window.cell(21).querySelector("span").classList.add("LabyrinthPanel_roomLevelWarning_fixture")
    );
    await page.waitForFunction(() => window.lastPlan?.main?.forceCount === 1);
    assert.deepEqual(await page.evaluate(() => window.lastPlan.main.forcedRooms), [61]);
    await page.evaluate(() => {
      window.cell(21).querySelector("span").classList.remove("LabyrinthPanel_roomLevelWarning_fixture");
      window.setQueue([22, 21, 30, 38, 46, 54, 62]);
    });
    await page.waitForFunction(() => !window.lastPlan?.breakthrough && window.lastPlan?.main?.source !== 62);
    // Pending room 21 is accepted; unqueued white room 29 is not another free origin.
    assert.equal(await page.evaluate(() => window.lastPlan.main.source), 21);
    await page.evaluate(() => window.setQueue([22, 30, 38, 46, 54, 62]));
    await page.waitForFunction(() => window.lastPlan?.main?.source === 21);
    assert.deepEqual(await page.locator(".LabyrinthPanel_roomGrid_fixture").boundingBox(), before);
    assert.equal(await page.evaluate(() => window.gameClicks), 0);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`通过 ${width}px：截图连通判断、破局与库存、队列接通/变红/重排/取消、连续编号和地图无位移。`);
  }
} finally {
  await browser.close();
}
