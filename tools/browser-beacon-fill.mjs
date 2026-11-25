/* global window, document, getComputedStyle */
import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.setContent(
      '<style>body{background:#191c2e;color:#edf0fa;font-family:system-ui}#mwi-labyrinth-planner{width:256px;padding:12px;background:#24273b}.grid{display:grid;grid-template-columns:repeat(8,60px);gap:3px}.cell{position:relative;width:60px;height:60px;background:#191b24;color:white}.label{position:absolute;top:2px;left:2px}</style><div id="mwi-labyrinth-planner"></div><div class="grid"></div>'
    );
    for (const file of ["src/runtime/beacons.js", "src/ui/beacon-view.js"])
      await page.addScriptTag({ content: fs.readFileSync(file, "utf8") });
    await page.evaluate(() => {
      const grid = document.querySelector(".grid");
      const nodes = Array.from({ length: 64 }, (_, i) => {
        const n = document.createElement("div");
        n.className = "cell";
        n.innerHTML = '<span class="label">' + i + "</span>";
        grid.append(n);
        return n;
      });
      window.map = {
        size: 8,
        grid,
        nodes,
        cells: nodes.map((_, i) => ({ revealed: i === 0, visited: i === 0 })),
        floorKey: "fill",
        beaconMode: false
      };
      window.MwiLabyrinthBeacons.apply(window.map, {
        characterLabyrinth: {
          beaconItemHrid: "/items/expert_beacon",
          beaconCount: 3,
          roomData: Array.from({ length: 8 }, () => Array(8).fill(null))
        }
      });
      window.view = window.MwiLabyrinthBeaconView.create(document, () => {});
      document.querySelector("#mwi-labyrinth-planner").append(window.view.element);
      window.view.update(window.map);
    });
    for (const zoom of [0.5, 1, 2]) {
      await page.evaluate((z) => {
        window.map.grid.style.zoom = z;
        window.view.layout();
      }, zoom);
      const result = await page.evaluate(() => {
        const cells = [...document.querySelectorAll("[data-mwi-lab-beacon-fill]")];
        return {
          count: cells.length,
          colors: cells.every((c) => getComputedStyle(c).backgroundColor === "rgb(72, 107, 125)"),
          labels: cells.every((c) => {
            const l = c.querySelector(".label"),
              r = l.getBoundingClientRect();
            // Hit testing only applies inside the viewport; the zoomed map can scroll.
            if (r.x + 2 >= window.innerWidth || r.y + 2 >= window.innerHeight) return true;
            return document.elementFromPoint(r.x + 2, r.y + 2) === l;
          }),
          known: window.map.nodes[0].hasAttribute("data-mwi-lab-beacon-fill")
        };
      });
      assert.deepEqual(result, { count: 13, colors: true, labels: true, known: false });
    }
    await page.evaluate(() => {
      window.map.beaconAdvice.remaining = 8;
      window.view.update(window.map);
    });
    const quantity = page.getByLabel("规划使用数量", { exact: true });
    await quantity.fill("5");
    await quantity.dispatchEvent("change");
    assert.equal(await quantity.inputValue(), "5");
    assert.ok((await page.locator(".mwi-lab-beacon-pin").count()) > 3);
    assert.ok((await page.locator(".mwi-lab-beacon-pin").allTextContents()).includes("1"));
    assert.equal(
      await page
        .locator(".mwi-lab-beacon-pin")
        .first()
        .evaluate((n) => getComputedStyle(n).borderRadius),
      "50%"
    );
    await quantity.fill("0");
    await quantity.dispatchEvent("change");
    assert.equal(await page.locator("[data-mwi-lab-beacon-fill],.mwi-lab-beacon-pin").count(), 0);
    await page.evaluate(() => window.view.update(window.map));
    assert.equal(await quantity.inputValue(), "0");
    await page.getByRole("button", { name: "增加一盏" }).click();
    assert.equal(await quantity.inputValue(), "1");
    await quantity.fill("9");
    await quantity.dispatchEvent("change");
    assert.equal(await quantity.getAttribute("aria-invalid"), "true");
    await quantity.fill("8");
    await quantity.dispatchEvent("change");
    assert.equal(await page.getByRole("button", { name: "增加一盏" }).isDisabled(), false);
    const plus = page.getByRole("button", { name: "增加一盏" });
    assert.equal(await page.locator(".mwi-lab-beacon-feedback").count(), 0);
    assert.equal(await page.getByRole("button", { name: "恢复库存限制" }).count(), 0);
    await plus.click();
    assert.equal(await quantity.inputValue(), "8");
    assert.equal(await plus.getAttribute("data-limit"), "true");
    await page.evaluate(() => window.view.update(window.map));
    await plus.press("Enter");
    assert.equal(await quantity.inputValue(), "9");
    assert.equal(await quantity.getAttribute("data-overstock"), "true");
    await quantity.fill("12");
    await quantity.dispatchEvent("change");
    await page.evaluate(() => window.view.update(window.map));
    assert.equal(await quantity.inputValue(), "12");
    await quantity.fill("65");
    await quantity.dispatchEvent("change");
    assert.equal(await quantity.getAttribute("aria-invalid"), "true");
    await quantity.fill("8");
    await quantity.dispatchEvent("change");
    assert.equal(await quantity.inputValue(), "8");
    await plus.click();
    await quantity.focus();
    assert.equal(await plus.getAttribute("data-limit"), "false");
    await page.getByRole("button", { name: "减少一盏" }).click();
    await page.evaluate(() => {
      window.map.beaconAdvice.remaining = 2;
      window.view.update(window.map);
    });
    assert.equal(await quantity.inputValue(), "1");
    await plus.click();
    await plus.click();
    await plus.click();
    assert.equal(await quantity.inputValue(), "3");
    assert.equal(await quantity.getAttribute("data-overstock"), "true");
    await page.evaluate(() => {
      window.map.beaconAdvice.remaining = 0;
      window.view.update(window.map);
    });
    assert.equal(await quantity.inputValue(), "1");
    assert.equal(await quantity.getAttribute("data-overstock"), "true");
    await page.screenshot({ path: `.workbench/beacon-quantity-${width}.png`, fullPage: true });
    await page.evaluate(() => {
      window.map.floorKey = "next-floor";
      window.view.update(window.map);
    });
    assert.equal(await quantity.inputValue(), "0");
    await plus.click();
    await plus.click();
    assert.equal(await quantity.inputValue(), "1");
    assert.ok(await page.locator(".mwi-lab-beacon-pin").count());
    await quantity.fill("64");
    await quantity.dispatchEvent("change");
    assert.equal(await plus.isDisabled(), true);
    await page.evaluate(() => {
      window.map.beaconAdvice.item = "/items/basic_beacon";
      window.view.update(window.map);
    });
    assert.equal(await quantity.inputValue(), "0");
    await plus.click();
    await plus.click();
    await page.evaluate(() => {
      window.view.hide();
      window.view.update(window.map);
    });
    assert.equal(await quantity.inputValue(), "1");
    await page.evaluate(() => {
      window.map.beaconAdvice.item = "/items/expert_beacon";
      window.view.update(window.map);
    });
    await page.evaluate(() => {
      window.map.beaconAdvice.remaining = null;
      window.view.update(window.map);
    });
    assert.equal(await plus.isDisabled(), true);
    assert.equal(await quantity.isDisabled(), true);
    assert.equal(await page.locator(".mwi-lab-beacon-pin").count(), 0);
    await page.evaluate(() => {
      window.map.beaconAdvice.remaining = 2;
      window.view.update(window.map);
    });
    await plus.click();
    await page.evaluate(() => {
      window.map.beaconMode = true;
      window.view.update(window.map);
      window.savedPins = [...document.querySelectorAll(".mwi-lab-beacon-pin")];
    });
    assert.equal(await page.locator("[data-mwi-lab-beacon-fill]").count(), 0);
    const hover = page.locator(".mwi-lab-beacon-hover-preview");
    assert.equal(await hover.count(), 0);
    await page.evaluate(() => {
      window.map.beaconHover = 22;
      window.map.beaconPreviewCount = 12;
      window.view.update(window.map);
    });
    assert.equal(await hover.textContent(), "+12");
    assert.equal(
      await page.evaluate(() => {
        const current = [...document.querySelectorAll(".mwi-lab-beacon-pin")];
        return current.length === window.savedPins.length && current.every((n, i) => n === window.savedPins[i]);
      }),
      true,
      "hover updates must reuse existing beacon pin DOM nodes"
    );
    assert.equal(await page.locator("#mwi-labyrinth-planner .mwi-lab-beacon-hover-preview").count(), 0);
    await page.addStyleTag({
      content:
        ".grid{grid-template-columns:repeat(8,46px)}.cell{width:46px;height:46px;display:grid}.cell>*{grid-area:1/1}"
    });
    for (const zoom of [0.5, 1, 2]) {
      await page.evaluate((z) => {
        window.map.grid.style.zoom = z;
        window.map.nodes[22].querySelector(".label").hidden = true;
        window.view.layout();
      }, zoom);
      assert.equal(
        await hover.evaluate((n) => {
          const r = n.getBoundingClientRect(),
            c = n.parentElement.getBoundingClientRect();
          return (
            n.parentElement === window.map.nodes[22] &&
            r.left >= c.left &&
            r.right <= c.right &&
            r.top >= c.top &&
            r.bottom <= c.bottom &&
            n.style.top === "3px" &&
            n.offsetWidth === 32 &&
            n.offsetHeight === 20 &&
            getComputedStyle(n).fontSize === "12px" &&
            getComputedStyle(n).pointerEvents === "none"
          );
        }),
        true
      );
    }
    await quantity.fill("0");
    await quantity.dispatchEvent("change");
    assert.equal(await hover.isVisible(), true);
    await page.evaluate(() => {
      window.map.nodes[0].querySelector(".label").hidden = true;
      window.map.beaconHover = 0;
      window.map.beaconPreviewCount = 0;
      window.view.update(window.map);
    });
    assert.equal(await hover.textContent(), "+0");
    await page.evaluate(() => {
      window.map.beaconHover = null;
      window.map.beaconPreviewCount = null;
      window.view.update(window.map);
    });
    assert.equal(await hover.count(), 0);
    await page.evaluate(() => {
      window.map.beaconMode = false;
      window.view.update(window.map);
    });
    assert.equal(await hover.isVisible(), false);
    await page.evaluate(() => {
      window.map.beaconMode = false;
      window.view.update(window.map);
      window.view.destroy();
    });
    assert.equal(await page.locator("[data-mwi-lab-beacon-fill]").count(), 0);
    assert.equal(
      await page
        .locator(".cell")
        .first()
        .evaluate((c) => getComputedStyle(c).backgroundColor),
      "rgb(25, 27, 36)"
    );
    await page.close();
  }
  console.log(
    "通过：桌面及窄屏库存解锁、键盘反馈、库存变化、换层复位、未知库存保护；蓝灰底色、原生文字点击、50%—200%缩放、原生预览让位和销毁恢复。"
  );
} finally {
  await browser.close();
}
