/* global document, window */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { ROOT } from "./project.mjs";
const output = path.join(ROOT, ".workbench/beacon-browser");
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.MWI_TEST_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.route("**/*", (route) => route.abort());
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(
      `<style>body{margin:20px;background:#121318;color:#eee;font:14px system-ui}main{max-width:1000px;margin:auto}h1{font-size:18px}.LabyrinthPanel_roomGrid_fixture{display:grid;grid-template-columns:repeat(8,64px);gap:3px;width:max-content;margin:40px auto}.LabyrinthPanel_roomCell_fixture{position:relative;height:64px;background:#191b24}.LabyrinthPanel_clearedRoom_fixture{background:#494b75}.LabyrinthPanel_roomLevel_fixture{position:absolute;left:2px;top:2px}.LabyrinthPanel_beaconPreview_fixture{background:#28665e}#map-scroll{overflow:auto}</style><main><h1>探照灯推荐 · 本地模拟地图</h1><div id="map-scroll"><div class="LabyrinthPanel_roomGrid_fixture">${Array.from({ length: 64 }, (_, id) => `<div class="LabyrinthPanel_roomCell_fixture ${[0, 1, 9].includes(id) ? "LabyrinthPanel_clearedRoom_fixture" : ""}" data-room-x="${id % 8}" data-room-y="${Math.floor(id / 8)}">${id === 0 ? "入口" : id === 63 ? '<span class="LabyrinthPanel_roomIcon_fixture">出口</span>' : [2, 8, 10, 17].includes(id) ? '<span class="LabyrinthPanel_roomLevel_fixture">Lv.101</span>' : ""}</div>`).join("")}</div></div></main>`
    );
    for (const file of [
      "src/core.js",
      "src/runtime/map-reader.js",
      "src/runtime/beacons.js",
      "src/ui/theme.js",
      "src/ui/sidebar.js",
      "src/ui/beacon-view.js",
      "src/ui/planner-view.js"
    ])
      await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, file), "utf8") });
    await page.evaluate(() => {
      window.fixtureState = {
        characterLabyrinth: {
          beaconItemHrid: "/items/expert_beacon",
          beaconCount: 2,
          roomData: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => ({})))
        }
      };
      window.MwiLabyrinthCalculator = {
        create: () => ({ context: { getGameState: () => window.fixtureState }, destroy() {} })
      };
      // Native activeRun contains only the map; supplies live in its sibling bottomArea.
      const activeRun = document.createElement("div");
      activeRun.className = "LabyrinthPanel_activeRun_fixture";
      const scroll = document.querySelector("#map-scroll");
      scroll.before(activeRun);
      activeRun.append(scroll);
      const bottomArea = document.createElement("div");
      bottomArea.className = "LabyrinthPanel_bottomArea_fixture";
      activeRun.after(bottomArea);
      const supply = document.createElement("div");
      supply.className = "LabyrinthPanel_supplyWithButton_fixture";
      supply.innerHTML = '<svg><use href="#expert_beacon"></use></svg><button id="beacon-use">使用</button>';
      bottomArea.append(supply);
      supply.querySelector("button").addEventListener("click", (event) => {
        const button = event.currentTarget;
        button.textContent = button.textContent === "X" ? "使用" : "X";
        document
          .querySelectorAll("[data-room-x]")
          .forEach((node) =>
            node.classList.remove("LabyrinthPanel_beaconPreview_fixture", "LabyrinthPanel_supplyHover_fixture")
          );
      });
      window.planCalls = 0;
      const plan = window.MwiLabyrinthCore.plan;
      window.MwiLabyrinthCore.plan = (...args) => {
        window.planCalls++;
        return plan(...args);
      };
      document.querySelectorAll("[data-room-x]").forEach((cell) =>
        cell.addEventListener("pointerover", () => {
          if (document.querySelector("#beacon-use").textContent !== "X") return;
          const map = window.MwiLabyrinthMapReader.read(document);
          const x = Number(cell.dataset.roomX),
            y = Number(cell.dataset.roomY);
          map.nodes.forEach((node, id) => {
            const dx = Math.abs((id % 8) - x),
              dy = Math.abs(Math.floor(id / 8) - y);
            node.classList.toggle(
              "LabyrinthPanel_beaconPreview_fixture",
              dx + dy <= 2 && !map.cells[id].revealed && id !== 63
            );
            node.classList.toggle("LabyrinthPanel_supplyHover_fixture", node === cell);
          });
        })
      );
    });
    await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, "src/userscript.js"), "utf8") });
    await page.waitForSelector(".mwi-lab-beacon-table tbody tr");
    assert.equal(await page.locator(".mwi-lab-beacons details,.mwi-lab-beacon-prepare").count(), 0);
    const initialPlanCalls = await page.evaluate(() => window.planCalls);
    await page.getByRole("button", { name: "2 盏", exact: true }).click();
    assert.equal(await page.locator(".mwi-lab-beacon-table tbody tr").count(), 2);
    await page.locator("#beacon-use").click();
    await page.locator("[data-room-x]").nth(22).hover();
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => window.planCalls), initialPlanCalls);
    assert.equal(await page.locator(".mwi-lab-beacon-table tbody tr").count(), 2);
    await page.locator("#beacon-use").click();
    await page.waitForTimeout(400);
    assert.equal(await page.locator(".mwi-lab-beacons").isVisible(), true);
    await page.screenshot({ path: path.join(output, `joint-${width}.png`), fullPage: true });
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`通过 ${width}px：原生预览开关不影响联合菜单，不重复计算路线。`);
  }
} finally {
  await browser.close();
}
