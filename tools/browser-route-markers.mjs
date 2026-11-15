/* global document, window */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { ROOT } from "./project.mjs";
const output = path.join(ROOT, ".workbench/route-markers");
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.MWI_TEST_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    await page.route("**/*", (route) => route.abort());
    await page.setContent(
      `<style>body{background:#161722;color:white;font:14px system-ui}main{margin:80px auto;width:330px}#grid{display:grid;grid-template-columns:repeat(5,64px);gap:2px}.cell{height:64px;position:relative;background:#30334c;font-size:11px}.cleared{background:#484e80}</style><main><p>模拟地图：旧房间不占编号，回头不重复编号。</p><div id="grid">${Array.from({ length: 25 }, (_, id) => `<div class="cell ${[0, 5].includes(id) ? "cleared" : ""}" data-id="${id}">${id === 0 ? "入口" : id === 1 ? "已进入" : id === 5 ? "已通关" : ""}</div>`).join("")}</div></main>`
    );
    for (const file of ["src/core.js", "src/ui/theme.js", "src/ui/beacon-view.js", "src/ui/planner-view.js"])
      await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, file), "utf8") });
    const before = await page.locator("#grid").boundingBox();
    const cost = await page.evaluate(() => {
      const cells = Array.from({ length: 25 }, (_, id) => ({
        type: id === 0 ? "start" : id === 24 ? "exit" : "challenge",
        visited: [0, 5].includes(id),
        entered: [0, 1, 5].includes(id),
        revealed: true,
        passable: true
      }));
      const map = {
        size: 5,
        cells,
        grid: document.querySelector("#grid"),
        nodes: [...document.querySelectorAll(".cell")]
      };
      // Includes free old rooms and a loop through two new cells.
      const result = {
        main: { source: 1, path: [1, 2, 7, 6, 5, 6, 7, 12, 17, 22, 23, 24], cost: 8, explorationOptimal: true },
        // This overlap must not consume or replace main-route numbers.
        treasures: [{ source: 1, target: 7, path: [1, 2, 7], cost: 2 }]
      };
      window.markerView = window.MwiLabyrinthView.create(document);
      window.markerMap = map;
      window.markerResult = result;
      window.markerView.update(map, result);
      return result.main.cost;
    });
    assert.equal(cost, 8);
    assert.deepEqual(await page.locator(".mwi-lab-route b").allTextContents(), [
      "1",
      "3",
      "2",
      "4",
      "5",
      "6",
      "7",
      "8"
    ]);
    assert.equal(
      await page
        .locator('[data-id="0"] .mwi-lab-route,[data-id="1"] .mwi-lab-route,[data-id="5"] .mwi-lab-route')
        .count(),
      0
    );
    assert.equal(await page.locator(".mwi-lab-route-summary,.mwi-lab-route-next,.mwi-lab-revealed-count").count(), 0);
    assert.doesNotMatch(await page.locator("#mwi-labyrinth-planner").textContent(), /还需|下一格|已揭示|虚线待探索/);
    assert.deepEqual(await page.locator("#grid").boundingBox(), before);
    await page.screenshot({ path: path.join(output, `markers-${width}.png`) });
    await page.evaluate(() => {
      window.markerMap.cells[4].type = "treasure";
      window.markerResult.treasures = [{ source: 1, target: 4, path: [1, 2, 3, 4], cost: 3 }];
      window.markerView.update(window.markerMap, window.markerResult);
    });
    assert.equal(await page.locator('[data-id="3"] .mwi-lab-route b').textContent(), "·");
    assert.equal(await page.locator('[data-id="4"] .mwi-lab-route b').textContent(), "宝");
    assert.equal(await page.locator('[data-id="2"] .mwi-lab-route b').textContent(), "1");
    await page.screenshot({ path: path.join(output, `treasure-target-${width}.png`) });
    await page.close();
    const live = await browser.newPage({ viewport: { width, height: 800 } });
    await live.route("**/*", (route) => route.abort());
    await live.setContent(
      `<style>body{background:#161722;color:white}main{width:330px;margin:80px auto}.LabyrinthPanel_roomGrid_fixture{display:grid;grid-template-columns:repeat(5,64px);gap:2px}.LabyrinthPanel_roomCell_fixture{position:relative;height:64px;background:#30334c}</style><main><div class="LabyrinthPanel_roomGrid_fixture">${Array.from({ length: 25 }, (_, id) => `<div class="LabyrinthPanel_roomCell_fixture ${[0, 5, 6].includes(id) ? "LabyrinthPanel_clearedRoom_fixture" : ""}" data-room-x="${id % 5}" data-room-y="${Math.floor(id / 5)}">${id === 18 ? '<span class="LabyrinthPanel_roomLevel_fixture">Lv.10</span>' : ""}</div>`).join("")}</div></main>`
    );
    for (const file of [
      "src/core.js",
      "src/runtime/map-reader.js",
      "src/ui/theme.js",
      "src/ui/beacon-view.js",
      "src/ui/planner-view.js"
    ])
      await live.addScriptTag({ content: fs.readFileSync(path.join(ROOT, file), "utf8") });
    await live.evaluate(() => {
      window.MwiLabyrinthCalculator = { create: () => ({ destroy() {} }) };
      window.testPlans = [];
      const create = window.MwiLabyrinthView.create;
      window.MwiLabyrinthView.create = (doc) => {
        const view = create(doc),
          update = view.update;
        view.update = (map, result) => {
          window.testPlans.push(result.main);
          update(map, result);
        };
        return view;
      };
    });
    await live.addScriptTag({ content: fs.readFileSync(path.join(ROOT, "src/userscript.js"), "utf8") });
    const isolated = await live.evaluate(() => window.testPlans.at(-1));
    assert.notEqual(isolated.source, 18);
    assert.equal(isolated.cost, 6);
    await live.evaluate(() => {
      for (const id of [11, 12, 17])
        document
          .querySelector(`[data-room-x="${id % 5}"][data-room-y="${Math.floor(id / 5)}"]`)
          .classList.add("LabyrinthPanel_clearedRoom_fixture");
    });
    await live.waitForFunction(() => window.testPlans.at(-1)?.source === 18);
    const initialPlan = await live.evaluate(() => window.testPlans.at(-1));
    assert.equal(initialPlan.source, 18);
    assert.equal(initialPlan.cost, 2);
    assert.deepEqual(await live.locator('.mwi-lab-route:not([data-treasure="true"]) b').allTextContents(), ["1", "2"]);
    // A nearer unclaimed treasure must not become a free origin until queued or entered.
    await live.evaluate(() => {
      document.querySelector('[data-room-x="3"][data-room-y="4"]').innerHTML =
        '<span class="LabyrinthPanel_roomIcon_fixture"><svg><use href="#loot"></use></svg></span>';
    });
    await live.waitForTimeout(1100);
    assert.equal(await live.evaluate(() => window.testPlans.at(-1).source), 18);
    await live.evaluate(() => {
      document
        .querySelector('[data-room-x="3"][data-room-y="3"]')
        .insertAdjacentHTML("beforeend", '<span class="LabyrinthPanel_queueNumber_fixture">1</span>');
      document
        .querySelector('[data-room-x="3"][data-room-y="4"]')
        .insertAdjacentHTML("beforeend", '<span class="LabyrinthPanel_queueNumber_fixture">2</span>');
    });
    await live.waitForFunction(() => window.testPlans.at(-1)?.source === 23);
    assert.deepEqual(await live.locator('.mwi-lab-route:not([data-treasure="true"]) b').allTextContents(), ["1"]);
    await live.evaluate(() =>
      document.querySelectorAll(".LabyrinthPanel_queueNumber_fixture").forEach((node) => node.remove())
    );
    await live.waitForFunction(() => window.testPlans.at(-1)?.source === 18);
    await live.evaluate(() =>
      document
        .querySelector('[data-room-x="3"][data-room-y="4"]')
        .insertAdjacentHTML("beforeend", '<span class="LabyrinthPanel_roomEntered_fixture"></span>')
    );
    // An entered treasure is free: an equally cheap route may start at 18 and cross it for zero cost.
    await live.waitForFunction(() => window.testPlans.at(-1)?.cost === 1);
    assert.ok((await live.evaluate(() => window.testPlans.at(-1).path)).includes(23));
    await live.evaluate(() => document.querySelector('[data-room-x="3"][data-room-y="4"]').replaceChildren());
    await live.waitForFunction(() => window.testPlans.at(-1)?.source === 18);
    for (const [queue, source, cost] of [
      [[1, 2, 7], 18, 2],
      [[18, 19, 7], 19, 1],
      [[18, 19, 24], 24, 0],
      [[], 18, 2]
    ]) {
      const previousCount = await live.evaluate(() => window.testPlans.length);
      await live.evaluate((ids) => {
        document.querySelectorAll(".LabyrinthPanel_queueNumber_fixture").forEach((node) => node.remove());
        ids.forEach((id, index) => {
          const label = document.createElement("span");
          label.className = "LabyrinthPanel_queueNumber_fixture";
          label.textContent = String(index + 8);
          document.querySelector(`[data-room-x="${id % 5}"][data-room-y="${Math.floor(id / 5)}"]`).append(label);
        });
      }, queue);
      await live.waitForFunction((count) => window.testPlans.length > count, previousCount);
      const result = await live.evaluate(() => window.testPlans.at(-1));
      assert.equal(result.source, source);
      assert.equal(result.cost, cost);
      assert.deepEqual(
        await live.locator('.mwi-lab-route:not([data-treasure="true"]) b').allTextContents(),
        Array.from({ length: cost }, (_, i) => String(i + 1))
      );
      assert.equal(
        await live
          .locator(`[data-room-x="${source % 5}"][data-room-y="${Math.floor(source / 5)}"] .mwi-lab-route`)
          .count(),
        0
      );
      const count = await live.evaluate(() => window.testPlans.length);
      await live.evaluate(() =>
        document.querySelectorAll(".LabyrinthPanel_queueNumber_fixture").forEach((node) => {
          node.textContent = String(Number(node.textContent) + 100);
        })
      );
      await live.waitForTimeout(1100);
      assert.equal(
        await live.evaluate(() => window.testPlans.length),
        count,
        "renumbering the same queued rooms does not replan"
      );
    }
    await live.evaluate(() => {
      document.querySelector('[data-room-x="3"][data-room-y="3"]').classList.add("LabyrinthPanel_clearedRoom_fixture");
      document.querySelector('[data-room-x="4"][data-room-y="3"]').innerHTML =
        '<span class="LabyrinthPanel_roomLevel_fixture">Lv.20</span>';
    });
    await live.waitForFunction(() => window.testPlans.at(-1)?.source === 19);
    assert.equal(await live.evaluate(() => window.testPlans.at(-1).cost), 1);
    assert.deepEqual(await live.locator('.mwi-lab-route:not([data-treasure="true"]) b').allTextContents(), ["1"]);
    await live.evaluate(() => {
      document
        .querySelector('[data-room-x="4"][data-room-y="3"] span')
        .classList.add("LabyrinthPanel_roomLevelWarning_fixture");
    });
    await live.waitForFunction(() => window.testPlans.at(-1)?.source !== 19);
    assert.equal(await live.evaluate(() => window.testPlans.at(-1).cost), 2);
    assert.equal(await live.locator('[data-room-x="4"][data-room-y="3"] .mwi-lab-route').count(), 0);
    await live.screenshot({ path: path.join(output, `connected-sources-${width}.png`) });
    const mapBefore = await live.locator('[class*="LabyrinthPanel_roomGrid"]').boundingBox();
    // A spotlight preview and a queued room must not become revealed until contents appear.
    await live.evaluate(() => {
      document.querySelectorAll('[class*="LabyrinthPanel_roomLevel"]').forEach((node) => node.remove());
      for (const node of document.querySelectorAll("[data-room-x][data-room-y]"))
        node.classList.toggle(
          "LabyrinthPanel_clearedRoom_fixture",
          [0, 5, 6].includes(Number(node.dataset.roomY) * 5 + Number(node.dataset.roomX))
        );
      const cell = (id) => document.querySelector(`[data-room-x="${id % 5}"][data-room-y="${Math.floor(id / 5)}"]`);
      cell(2).classList.add("LabyrinthPanel_spotlightPreview_fixture");
      cell(24).innerHTML = '<span class="LabyrinthPanel_roomIcon_fixture">旗帜</span>';
      cell(1).innerHTML =
        '<span class="LabyrinthPanel_roomLevel_fixture">Lv.10</span><span class="LabyrinthPanel_queueNumber_fixture">1</span>';
    });
    const waitCount = (count) =>
      live.waitForFunction(
        (expected) =>
          window.MwiLabyrinthMapReader.read(document).cells.filter((cell) => cell.revealed).length === expected,
        count
      );
    await waitCount(4); // Entrance, two cleared rooms and one visible challenge.
    await live.evaluate(() => {
      document.querySelector('[data-room-x="2"][data-room-y="0"]').innerHTML =
        '<span class="LabyrinthPanel_roomLevel_fixture">Lv.20</span>';
      document.querySelector('[data-room-x="3"][data-room-y="0"]').innerHTML =
        '<span class="LabyrinthPanel_roomIcon_fixture"><svg><use href="#loot"></use></svg></span>';
    });
    await waitCount(6);
    await live.evaluate(() => {
      const node = document.querySelector('[data-room-x="2"][data-room-y="0"]');
      node.classList.add("LabyrinthPanel_clearedRoom_fixture");
      node.replaceChildren();
    });
    await live.waitForFunction(() => window.MwiLabyrinthMapReader.read(document).cells[2].visited);
    await waitCount(6);
    assert.deepEqual(await live.locator('[class*="LabyrinthPanel_roomGrid"]').boundingBox(), mapBefore);
    if (width < 700) await live.locator(".mwi-lab-launcher").click();
    assert.equal(await live.locator(".mwi-lab-revealed-count").count(), 0);
    assert.doesNotMatch(await live.locator(".mwi-lab-route-section").textContent(), /还需|下一格|已揭示|虚线待探索/);
    await live.screenshot({ path: path.join(output, `simplified-panel-${width}.png`) });
    // Native beacon classes change without changing the path-planning input.
    const plansBeforePreview = await live.evaluate(() => window.testPlans.length);
    await live.evaluate(() => {
      const supply = document.createElement("div");
      supply.className = "LabyrinthPanel_supplyWithButton_fixture";
      supply.innerHTML = '<svg><use href="/static/items.svg#expert_beacon"></use></svg><button>X</button>';
      document.querySelector("main").append(supply);
      window.setBeaconPreview = (ids, hover) => {
        document.querySelectorAll("[data-room-x][data-room-y]").forEach((node, id) => {
          node.classList.toggle("LabyrinthPanel_beaconPreview_fixture", ids.includes(id));
          node.classList.toggle("LabyrinthPanel_supplyHover_fixture", id === hover);
        });
      };
      window.setBeaconPreview([0, 2, 3, 7, 8, 24], 7);
    });
    const waitPreview = (count) =>
      live.waitForFunction((expected) => {
        const label = document.querySelector(".mwi-lab-beacon-preview");
        return label && !label.hidden && label.textContent === `本次可新揭示 ${expected} 格`;
      }, count);
    await waitPreview(2);
    await waitCount(6);
    await live.screenshot({ path: path.join(output, `beacon-preview-${width}.png`) });
    await live.evaluate(() => window.setBeaconPreview([8], 8));
    await waitPreview(1);
    await live.evaluate(() => window.setBeaconPreview([], 0));
    await waitPreview(0);
    assert.equal(await live.evaluate(() => window.testPlans.length), plansBeforePreview);
    await live.evaluate(() => window.setBeaconPreview([], null));
    await live.waitForFunction(() => document.querySelector(".mwi-lab-beacon-preview").hidden);
    // Using the beacon reveals contents; even a transient preview class cannot count them twice.
    await live.evaluate(() => {
      window.setBeaconPreview([8], 8);
      document.querySelector('[data-room-x="3"][data-room-y="1"]').innerHTML =
        '<span class="LabyrinthPanel_roomLevel_fixture">Lv.30</span>';
    });
    await waitCount(7);
    await waitPreview(0);
    await live.evaluate(() => {
      window.setBeaconPreview([], 8);
      document.querySelector(".LabyrinthPanel_supplyWithButton_fixture use").setAttribute("href", "#expert_shroud");
    });
    await live.waitForFunction(() => document.querySelector(".mwi-lab-beacon-preview").hidden);
    await live.evaluate(() => window.setBeaconPreview([], null));
    assert.deepEqual(await live.locator('[class*="LabyrinthPanel_roomGrid"]').boundingBox(), mapBefore);
    // Reloading the runtime reads the same count directly from the map.
    await live.evaluate(() => window.__mwiLabyrinthAssistant.destroy());
    await live.addScriptTag({ content: fs.readFileSync(path.join(ROOT, "src/userscript.js"), "utf8") });
    await waitCount(7);
    await live.evaluate(() => {
      document.querySelectorAll("[data-room-x][data-room-y]").forEach((node) => {
        node.replaceChildren();
        node.className = "LabyrinthPanel_roomCell_fixture";
        if (node.dataset.roomX === "0" && node.dataset.roomY === "0")
          node.classList.add("LabyrinthPanel_clearedRoom_fixture");
      });
    });
    await waitCount(1);
    await live.close();
  }
  console.log(
    "已验证桌面与窄屏：孤立白房被排除、连通白房与有序队列续接、队列变更重算且新增路线独立编号、主路与宝箱重叠编号、删除四项文案，以及地图读取、探照灯预览、重载和换层。"
  );
} finally {
  await browser.close();
}
