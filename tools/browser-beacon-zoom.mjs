/* global window, document, getComputedStyle */
import fs from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
try {
  const page = await browser.newPage();
  await page.route("**/*", (r) => r.abort());
  await page.setContent(
    `<style>.grid{display:grid;grid-template-columns:repeat(8,76px);gap:2px;width:max-content}.cell{position:relative;box-sizing:border-box;width:76px;height:76px;border:1px solid black}.native{position:absolute;inset:0}</style><div class="grid">${Array.from({ length: 64 }, (_, i) => `<div class="cell">${i === 27 ? '<span class="native">Lv.141</span>' : ""}</div>`).join("")}</div>`
  );
  for (const file of ["src/runtime/beacons.js", "src/ui/beacon-view.js"])
    await page.addScriptTag({ content: fs.readFileSync(file, "utf8") });
  await page.evaluate(() => {
    const nodes = [...document.querySelectorAll(".cell")];
    window.map = {
      size: 8,
      grid: document.querySelector(".grid"),
      nodes,
      cells: nodes.map((_, i) => ({ revealed: [0, 1, 8].includes(i), visited: i === 0 })),
      floorKey: "zoom",
      beaconMode: true,
      beaconHover: 22,
      beaconPreviewCount: 12
    };
    window.MwiLabyrinthBeacons.apply(window.map, {
      characterLabyrinth: {
        beaconItemHrid: "/items/expert_beacon",
        beaconCount: 3,
        roomData: Array.from({ length: 8 }, () => Array(8).fill(null))
      }
    });
    window.view = window.MwiLabyrinthBeaconView.create(document, () => {});
    document.body.append(window.view.element);
  });
  for (const scale of [1, 0.5, 1.5, 2, 1]) {
    const result = await page.evaluate((scale) => {
      window.map.grid.style.zoom = String(scale);
      window.view.update(window.map, null);
      window.view.layout();
      const marks = [...document.querySelectorAll(".mwi-lab-beacon-best,.mwi-lab-beacon-pin")];
      return {
        count: marks.length,
        pin: document.querySelector(".mwi-lab-beacon-pin")?.textContent,
        crowded: document
          .querySelector(".native")
          .parentElement.querySelectorAll(".mwi-lab-beacon-best,.mwi-lab-beacon-pin").length,
        contained: marks.every((el) => {
          const r = el.getBoundingClientRect(),
            p = el.parentElement.getBoundingClientRect();
          return r.left >= p.left && r.right <= p.right + 0.5 && r.top >= p.top && r.bottom <= p.bottom + 0.5;
        })
      };
    }, scale);
    assert.ok(result.count >= 1);
    assert.equal(result.pin, "①");
    assert.equal(result.crowded, 0);
    assert.ok(result.contained, JSON.stringify({ scale, result }));
  }
  await page.evaluate(() => {
    window.map.beaconMode = false;
    window.map.beaconHover = null;
    window.map.beaconPreviewCount = null;
    window.view.update(window.map, null);
  });
  assert.equal(await page.locator(".mwi-lab-beacons").isVisible(), true);
  assert.equal(await page.locator(".mwi-lab-beacons details,.mwi-lab-beacons input").count(), 0);
  for (const count of [1, 2, 3]) {
    await page.getByRole("button", { name: `${count} 盏`, exact: true }).click();
    assert.equal(await page.locator(".mwi-lab-beacon-table tbody tr").count(), count);
    const text = await page.locator(".mwi-lab-beacon-preview").textContent();
    assert.equal(text, `合计新揭示 ${[0, 13, 26, 37][count]} 格`);
    assert.equal(await page.locator(".mwi-lab-beacon-range").count(), [0, 13, 26, 37][count]);
    assert.equal(
      await page.evaluate(() =>
        [...document.querySelectorAll(".mwi-lab-beacon-range")].every((n) => {
          const id = window.map.nodes.indexOf(n.parentElement);
          return !window.map.cells[id].revealed && id !== 63 && getComputedStyle(n).pointerEvents === "none";
        })
      ),
      true
    );
  }
  await page.locator(".mwi-lab-beacon-table tbody tr").first().hover();
  assert.equal(await page.locator('.mwi-lab-beacon-range[data-active="true"]').count(), 13);
  await page.getByRole("button", { name: "3 盏", exact: true }).hover();
  assert.equal(await page.locator(".mwi-lab-beacon-range").count(), 37);
  assert.equal(await page.locator('.mwi-lab-beacon-range[data-active="true"]').count(), 0);
  await page.locator(".mwi-lab-beacon-table tbody tr").nth(2).hover();
  assert.equal(await page.locator('.mwi-lab-beacon-range[data-active="true"]').count(), 11);
  await page.evaluate(() => window.view.layout());
  assert.equal(await page.locator('.mwi-lab-beacon-range[data-active="true"]').count(), 11);
  assert.equal(await page.evaluate(() => window.map.beaconMode), false);
  await page.evaluate(() => {
    window.map.beaconAdvice.remaining = 1;
    window.view.update(window.map);
  });
  assert.equal(await page.getByRole("button", { name: "3 盏", exact: true }).isDisabled(), true);
  assert.equal(await page.locator(".mwi-lab-beacon-table tbody tr").count(), 1);
  await page.evaluate(() => {
    window.map.beaconAdvice.remaining = 0;
    window.view.update(window.map);
  });
  assert.equal(await page.locator(".mwi-lab-beacon-pin,.mwi-lab-beacon-range").count(), 0);
  await page.evaluate(() => window.view.hide());
  assert.equal(await page.locator(".mwi-lab-beacons").isVisible(), false);
  console.log("通过：一至三盏规划、库存变化、悬停范围、清理及 50%—200% 缩放。");
} finally {
  await browser.close();
}
