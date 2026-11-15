/* global document, window */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { ROOT } from "./project.mjs";
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/queue-continuation.json"), "utf8"));
const whiteOrigin = JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/queued-white-origin.json"), "utf8"));
const output = path.join(ROOT, ".workbench/queue-continuation");
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.MWI_TEST_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(
      `<style>body{margin:16px;background:#111218;color:#eee;font:13px system-ui}main{max-width:620px;margin:auto}#map{overflow:auto}.LabyrinthPanel_roomGrid_fixture{display:grid;grid-template-columns:repeat(7,64px);gap:3px;width:max-content}.cell{position:relative;height:64px;background:#191a23}.LabyrinthPanel_clearedRoom_fixture{background:#474774}.LabyrinthPanel_visibleRoom_fixture{background:#303047}.queued{background:#4955a4}.LabyrinthPanel_queueNumber_fixture{position:absolute;left:24px;top:24px;font-size:22px}.LabyrinthPanel_roomLevelWarning_fixture{color:#ff4c57}</style><main><p>队列续接截图复现 · 本地测试</p><div id="map"><div class="LabyrinthPanel_roomGrid_fixture">${
        fixture.initialPath.length &&
        Array.from({ length: 49 }, (_, id) => {
          const level = fixture.red[id] ?? fixture.white[id];
          return `<div class="cell ${fixture.cleared.includes(id) ? "LabyrinthPanel_clearedRoom_fixture" : ""}" data-room-x="${id % 7}" data-room-y="${Math.floor(id / 7)}">${id === 0 ? "入口" : id === 48 ? '<span class="LabyrinthPanel_roomIcon_fixture">出口</span>' : level ? `<span class="LabyrinthPanel_roomLevel_fixture ${fixture.red[id] ? "LabyrinthPanel_roomLevelWarning_fixture" : ""}">Lv.${level}</span>` : ""}</div>`;
        }).join("")
      }</div></div></main>`
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
        character: { id: "fixture" },
        characterLabyrinth: {
          roomData: Array.from({ length: 7 }, () => Array(7).fill(null)),
          currentFloor: 1,
          startedAt: "first"
        }
      };
      window.MwiLabyrinthCalculator = {
        create: () => ({ context: { getGameState: () => window.fixtureState }, destroy() {} })
      };
      const plan = window.MwiLabyrinthCore.plan;
      window.MwiLabyrinthCore.plan = (map, options) => {
        window.lastPreferred = options?.preferredPath || null;
        window.lastMap = map;
        window.lastPlan = plan(map, options);
        return window.lastPlan;
      };
      window.cell = (id) => document.querySelector(`[data-room-x="${id % 7}"][data-room-y="${Math.floor(id / 7)}"]`);
      window.setQueue = (ids) => {
        document.querySelectorAll(".LabyrinthPanel_queueNumber_fixture").forEach((node) => node.remove());
        document
          .querySelectorAll(".cell")
          .forEach((node) => node.classList.remove("queued", "LabyrinthPanel_visibleRoom_fixture"));
        ids.forEach((id, index) => {
          window.cell(id).classList.add("queued");
          window
            .cell(id)
            .insertAdjacentHTML("beforeend", `<span class="LabyrinthPanel_queueNumber_fixture">${index + 1}</span>`);
          window.MwiLabyrinthCore.neighbors(id, 7).forEach((next) =>
            window.cell(next).classList.add("LabyrinthPanel_visibleRoom_fixture")
          );
        });
      };
      window.setQueue([2]);
      window.gameClicks = 0;
      document.querySelector(".LabyrinthPanel_roomGrid_fixture").addEventListener("click", () => window.gameClicks++);
    });
    const before = await page.locator(".LabyrinthPanel_roomGrid_fixture").boundingBox();
    await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, "src/userscript.js"), "utf8") });
    await page.waitForFunction(() => window.lastPlan?.main);
    assert.deepEqual(await page.evaluate(() => window.lastPlan.main.path), fixture.initialPath);
    const revealed = await page.evaluate(() => window.lastMap.cells.map((c) => c.revealed));
    for (const count of [5, 6, 7, 8, 9, 10, 11]) {
      const queue = fixture.initialPath.slice(0, count);
      await page.evaluate((ids) => window.setQueue(ids), queue);
      await page.waitForFunction((id) => window.lastPlan?.main?.source === id, queue.at(-1));
      assert.deepEqual(await page.evaluate(() => window.lastPlan.main.path), fixture.initialPath.slice(count - 1));
      assert.ok(await page.evaluate(() => window.lastPreferred !== null));
      assert.deepEqual(await page.evaluate(() => window.lastMap.cells.map((c) => c.revealed)), revealed);
      assert.deepEqual(
        await page.locator(".mwi-lab-route b").allTextContents(),
        Array.from({ length: 11 - count }, (_, i) => String(i + 1))
      );
      if (count <= 6) await page.screenshot({ path: path.join(output, `prefix-${count}-${width}.png`) });
    }
    async function changeQueue(ids) {
      await page.evaluate((ids) => window.setQueue(ids), ids);
      await page.waitForFunction((ids) => JSON.stringify(window.lastMap.queue) === JSON.stringify(ids), ids);
    }
    await changeQueue(fixture.queues[3]);
    assert.equal(await page.evaluate(() => window.lastPreferred), null);
    assert.equal(await page.evaluate(() => window.lastPlan.main.source), 25);
    await changeQueue([2]);
    assert.equal(await page.evaluate(() => window.lastPreferred), null);
    assert.deepEqual(await page.evaluate(() => window.lastPlan.main.path), fixture.initialPath);
    await changeQueue([3, 2]);
    assert.equal(await page.evaluate(() => window.lastPreferred), null);
    assert.notEqual(await page.evaluate(() => window.lastPlan.main.source), 3);
    await changeQueue([2, 3, 10, 17, 24]);
    await page.evaluate(() =>
      window
        .cell(31)
        .insertAdjacentHTML(
          "beforeend",
          '<span class="LabyrinthPanel_roomLevel_fixture LabyrinthPanel_roomLevelWarning_fixture">Lv.150</span>'
        )
    );
    await page.waitForFunction(() => window.lastMap.cells[31].passable === false);
    assert.equal(await page.evaluate(() => window.lastPreferred), null);
    assert.equal(await page.evaluate(() => window.lastPlan.main.path.includes(31)), false);
    await page.evaluate(() => {
      window.fixtureState.characterLabyrinth.currentFloor = 2;
    });
    await page.waitForFunction(() => window.lastMap.floor === 2);
    assert.equal(await page.evaluate(() => window.lastPreferred), null);
    assert.deepEqual(await page.locator(".LabyrinthPanel_roomGrid_fixture").boundingBox(), before);
    assert.equal(await page.evaluate(() => window.gameClicks), 0);
    // A second screenshot starts with no queue and several white frontier rooms.
    await page.evaluate((fixture) => {
      window.fixtureState.characterLabyrinth.currentFloor = 3;
      window.lastPlan = null;
      for (let id = 0; id < 49; id++) {
        const cell = window.cell(id),
          level = fixture.red[id] ?? fixture.white[id];
        cell.className = `cell ${fixture.cleared.includes(id) ? "LabyrinthPanel_clearedRoom_fixture" : ""}`;
        cell.innerHTML =
          id === 0
            ? "入口"
            : id === 48
              ? '<span class="LabyrinthPanel_roomIcon_fixture">出口</span>'
              : level
                ? `<span class="LabyrinthPanel_roomLevel_fixture ${fixture.red[id] ? "LabyrinthPanel_roomLevelWarning_fixture" : ""}">Lv.${level}</span>`
                : "";
      }
    }, whiteOrigin);
    await page.waitForFunction(() => window.lastMap.floor === 3 && window.lastPlan?.main?.source === 39);
    assert.deepEqual(await page.evaluate(() => window.lastPlan.main.path), whiteOrigin.initialPath);
    await changeQueue([39]);
    assert.deepEqual(await page.evaluate(() => window.lastPlan.main.path), whiteOrigin.initialPath);
    assert.equal(await page.evaluate(() => window.lastPlan.main.cost), 3);
    assert.deepEqual(await page.locator(".mwi-lab-route b").allTextContents(), ["1", "2", "3"]);
    assert.equal(await page.locator('[data-room-x="6"][data-room-y="4"] .mwi-lab-route').count(), 0);
    await page.screenshot({ path: path.join(output, `white-origin-selected-${width}.png`) });
    await page.evaluate(() => {
      window.__mwiLabyrinthAssistant.destroy();
      window.lastPlan = null;
    });
    await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, "src/userscript.js"), "utf8") });
    await page.waitForFunction(() => window.lastPlan?.main);
    assert.deepEqual(await page.evaluate(() => window.lastPlan.main.path), whiteOrigin.initialPath);
    assert.equal(await page.evaluate(() => window.lastPreferred), null);
    await changeQueue([39, 40]);
    assert.deepEqual(await page.evaluate(() => window.lastPlan.main.path), [40, 41, 48]);
    assert.equal(await page.evaluate(() => window.lastPlan.main.cost), 2);
    await changeQueue([39, 33]);
    assert.equal(await page.evaluate(() => window.lastPlan.main.source), 33);
    await changeQueue([]);
    assert.deepEqual(await page.evaluate(() => window.lastPlan.main.path), whiteOrigin.initialPath);
    await page.evaluate(() => window.__mwiLabyrinthAssistant.destroy());
    assert.equal(await page.locator(".mwi-lab-route").count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `通过 ${width}px：截图前段批量/逐格入队稳定续接、标记连续、可选格不误判揭示、改选/取消/重排/变红/换层重新规划。`
    );
  }
} finally {
  await browser.close();
}
