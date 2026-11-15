/* global document, window, getComputedStyle */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { ROOT } from "./project.mjs";
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
try {
  for (const [width, height, size] of [
    [1440, 900, 20],
    [390, 600, 8]
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.route("**/*", (route) => route.abort());
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setContent(
      `<style>body{margin:8px;background:#121318;color:#eee}main{margin:8px auto;width:max-content}.grid{display:grid;grid-template-columns:repeat(${size},24px);gap:2px}.cell{position:relative;display:grid;width:24px;height:24px;background:#30334c}.cell>*{grid-area:1/1}.native{font:9px system-ui;align-self:start}.badge{font:8px system-ui;align-self:end}</style><main><div class="grid">${Array.from({ length: size * size }, (_, id) => `<div class="cell">${id % 7 === 0 ? '<span class="native">Lv.99</span><span class="badge">100% 25s</span>' : ""}</div>`).join("")}</div></main>`
    );
    for (const file of [
      "src/core.js",
      "src/runtime/beacons.js",
      "src/ui/theme.js",
      "src/ui/sidebar.js",
      "src/ui/beacon-view.js",
      "src/ui/planner-view.js"
    ])
      await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, file), "utf8") });
    const before = await page.locator(".grid").boundingBox();
    await page.evaluate((size) => {
      const nodes = [...document.querySelectorAll(".cell")];
      window.fixtureMap = {
        size,
        grid: document.querySelector(".grid"),
        nodes,
        cells: nodes.map((_, id) => ({
          type: id === 0 ? "start" : id === size * size - 1 ? "exit" : "unknown",
          revealed: id === 0,
          visited: id === 0,
          passable: id === 0 ? true : null
        })),
        floorKey: "run:1",
        floor: 1,
        beaconMode: true,
        beaconHover: null,
        beaconPreviewCount: null
      };
      window.fixtureState = {
        characterLabyrinth: {
          beaconItemHrid: "/items/expert_beacon",
          beaconCount: 3,
          roomData: Array.from({ length: size }, () => Array(size).fill(null))
        }
      };
      window.MwiLabyrinthBeacons.apply(window.fixtureMap, window.fixtureState);
      window.fixtureView = window.MwiLabyrinthView.create(document);
      window.fixtureView.update(window.fixtureMap, window.MwiLabyrinthCore.plan(window.fixtureMap));
    }, size);
    await page.getByRole("button", { name: "3 盏", exact: true }).click();
    assert.equal(await page.locator(".mwi-lab-beacon-table tbody tr").count(), 3);
    assert.equal(await page.locator(".mwi-lab-beacons details").count(), 0);
    // Text containers stretch across native grid cells: crowded cells get no overlay instead of hiding text.
    assert.equal(
      await page.locator(".cell:has(.native) .mwi-lab-beacon-best,.cell:has(.native) .mwi-lab-beacon-pin").count(),
      0
    );
    assert.equal(await page.locator(".mwi-lab-beacons").evaluate((n) => n.scrollWidth <= n.clientWidth + 1), true);
    const map = await page.locator(".grid").boundingBox(),
      panel = await page.locator("#mwi-labyrinth-planner").boundingBox();
    assert.equal(map.width, before.width);
    assert.equal(map.height, before.height);
    assert.ok(panel.x + panel.width <= map.x || panel.y >= map.y + map.height || panel.y + panel.height <= map.y);

    assert.equal(
      await page
        .locator(".mwi-lab-beacon-pin")
        .evaluateAll((ns) => ns.every((n) => getComputedStyle(n).pointerEvents === "none")),
      true
    );
    await page.evaluate(() => {
      window.fixtureMap.floorKey = "run:2";
      window.fixtureView.update(window.fixtureMap, window.MwiLabyrinthCore.plan(window.fixtureMap));
    });
    assert.equal(await page.locator(".mwi-lab-beacon-table tbody tr").count(), 3);
    await page.evaluate(() => window.fixtureView.destroy());
    assert.equal(await page.locator("#mwi-labyrinth-beacon-style,.mwi-lab-beacon-pin").count(), 0);
    assert.deepEqual(errors, []);
    console.log(`通过 ${width}×${height} / ${size}×${size}：三盏规划、拥挤房间避让、面板不遮地图、换层与清理。`);
    await page.close();
  }
} finally {
  await browser.close();
}
