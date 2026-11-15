/* global window, document */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { outputs } from "./build.mjs";
import { ROOT } from "./project.mjs";
// All requests are fulfilled locally or blocked; no account, cookies, or real game operations.
const directory = path.join(ROOT, ".workbench/calculator-browser");
fs.mkdirSync(directory, { recursive: true });
const engineSource = fs.readFileSync(path.join(ROOT, "src/calculator/combat-engine.js"), "utf8");
const embeddedData = JSON.parse(
  zlib.gunzipSync(Buffer.from(engineSource.match(/ctx\.MWISIM_DATA_GZ_BASE64\s*=\s*"([^"]+)"/)[1], "base64"))
);
const gameData = { ...embeddedData.fallbackData, ...embeddedData.originalMaps };
const runtime = outputs()["runtime.js"];
const html = fs
  .readFileSync(path.join(ROOT, "tools/harness/calculator.html"), "utf8")
  .replace('localStorage.setItem("mwi-labyrinth:calculator:clear_rate_combat_trials:character:1001", "5");', "")
  .replace("<title>", '<script src="/static/js/main.fixture.chunk.js"></script><title>');
// An optional local copy permits visual checks with real game art; offline runs still test every symbol link.
const spritePath = path.join(ROOT, ".workbench/skills-sprite.svg");
const skillSprite = fs.existsSync(spritePath)
  ? fs.readFileSync(spritePath, "utf8")
  : '<svg xmlns="http://www.w3.org/2000/svg">' +
    [
      "milking",
      "foraging",
      "woodcutting",
      "cheesesmithing",
      "crafting",
      "tailoring",
      "cooking",
      "brewing",
      "alchemy",
      "enhancing",
      "shadow_archer",
      "pyre_hunter",
      "frost_sniper",
      "siren",
      "salamander",
      "dryad",
      "giant_scorpion",
      "giant_mantis",
      "cyclops",
      "mimic"
    ]
      .map((key) => `<symbol id="${key}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#a9baff"/></symbol>`)
      .join("") +
    "</svg>";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.MWI_TEST_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/runtime.js")
        return route.fulfill({ contentType: "application/javascript", body: runtime });
      if (url.pathname.endsWith(".svg")) return route.fulfill({ contentType: "image/svg+xml", body: skillSprite });
      if (url.pathname.endsWith(".js")) return route.fulfill({ contentType: "application/javascript", body: "" });
      if (route.request().isNavigationRequest()) return route.fulfill({ contentType: "text/html", body: html });
      return route.abort();
    });
    await context.addInitScript((data) => localStorage.setItem("initClientData", JSON.stringify(data)), gameData);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const prepare = async () => {
      await page.locator("#mwi-labyrinth-calc-dock").waitFor();
      await page.evaluate(() => {
        window.fixtureState.characterLabyrinth.beaconItemHrid = "/items/expert_beacon";
        window.fixtureState.characterLabyrinth.beaconCount = 4;
        window.draw();
      });
      await page.getByLabel("规划使用数量", { exact: true }).waitFor();
    };
    const change = async (label, value) => {
      const input = page.getByLabel(label, { exact: true });
      await input.fill(value);
      await input.dispatchEvent("change");
      await input.press("Tab");
    };
    await page.goto("https://mwi-fixture.invalid/");
    await prepare();
    await change("快速通过至第几层", "6");
    await change("战斗场数", "600");
    await change("规划使用数量", "3");
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "放大地图", exact: true }).click();
    await page.getByRole("checkbox", { name: "自动路线", exact: true }).uncheck();
    await page.locator(".mwi-lab-floor-toggle").click();
    // Persist the user toggle then reload immediately, rather than waiting for the optional distribution scan.
    await page.getByRole("checkbox", { name: "胜率分布", exact: true }).evaluate((input) => {
      input.checked = true;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.reload();
    await prepare();
    assert.equal(await page.getByLabel("快速通过至第几层", { exact: true }).inputValue(), "6");
    assert.equal(await page.getByLabel("战斗场数", { exact: true }).inputValue(), "600");
    assert.equal(await page.getByLabel("规划使用数量", { exact: true }).inputValue(), "3");
    assert.equal(await page.getByRole("button", { name: "恢复地图大小至 100%", exact: true }).textContent(), "130%");
    assert.equal(await page.getByRole("checkbox", { name: "自动路线", exact: true }).isChecked(), false);
    assert.equal(await page.getByRole("checkbox", { name: "胜率分布", exact: true }).isChecked(), true);
    assert.equal(await page.locator(".mwi-lab-floor-toggle").getAttribute("aria-pressed"), "true");
    // Restore an intentionally unlocked count only on the same floor.
    await change("规划使用数量", "4");
    const plus = page.getByRole("button", { name: "增加一盏", exact: true });
    await plus.click();
    await plus.click();
    await page.reload();
    await prepare();
    assert.equal(await page.getByLabel("规划使用数量", { exact: true }).inputValue(), "5");
    await page.evaluate(() => {
      window.fixtureState.characterLabyrinth.currentFloor = 2;
      window.draw();
    });
    await page.waitForFunction(() => document.querySelector("#mwi-lab-beacon-quantity").value === "4");
    assert.equal(await page.locator(".mwi-lab-floor-toggle").getAttribute("aria-pressed"), "false");
    assert.equal(
      await page.evaluate(() => JSON.parse(localStorage.getItem("mwi-labyrinth:beacon-quantity:v1")).quantity),
      5
    );
    await change("规划使用数量", "0");
    await page.reload();
    await prepare();
    assert.equal(await page.getByLabel("规划使用数量", { exact: true }).inputValue(), "0");
    await page.evaluate(() => {
      localStorage.setItem("mwi-labyrinth:beacon-quantity:v1", '{"quantity":-3}');
      localStorage.setItem("mwi-labyrinth:route-display:v1", "broken");
    });
    await page.reload();
    await prepare();
    assert.equal(await page.getByLabel("规划使用数量", { exact: true }).inputValue(), "1");
    assert.equal(await page.getByRole("checkbox", { name: "自动路线", exact: true }).isChecked(), true);
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new Error("blocked");
      };
    });
    await change("规划使用数量", "2");
    assert.equal(await page.getByLabel("规划使用数量", { exact: true }).inputValue(), "2");
    assert.match(await page.locator(".mwi-lab-beacon-error").textContent(), /未能保存/);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log("通过：菜单全部参数刷新恢复、同层解锁、换层复位、零数量、损坏存储和保存失败。");
} finally {
  await browser.close();
}
