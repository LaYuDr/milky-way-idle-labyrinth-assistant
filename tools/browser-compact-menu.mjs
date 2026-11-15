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
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
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
    await page.goto("https://mwi-fixture.invalid/");
    const panel = page.locator("#mwi-labyrinth-planner");
    await page.locator("#mwi-labyrinth-calc-dock").waitFor();
    await page.evaluate(() => {
      window.fixtureState.characterLabyrinth.beaconItemHrid = "/items/expert_beacon";
      window.fixtureState.characterLabyrinth.beaconCount = 4;
      window.draw();
    });
    const quantity = page.getByLabel("规划使用数量", { exact: true });
    await quantity.waitFor();
    const floor = page.getByLabel("快速通过至第几层", { exact: true });
    await floor.fill("5");
    await floor.dispatchEvent("change");
    const budget = page.getByLabel("战斗场数", { exact: true });
    await budget.fill("500");
    await budget.dispatchEvent("input");
    await budget.press("Tab");
    assert.equal(await page.getByRole("button", { name: "计算迷宫", exact: true }).isEnabled(), true);
    assert.equal(await page.locator(".mwi-lab-calculate-action").getByLabel("战斗场数", { exact: true }).count(), 1);
    assert.equal(await page.locator(".mwi-labyrinth-calc-clear-rate-control__progress").isVisible(), false);
    const auto = page.getByRole("checkbox", { name: "自动路线", exact: true });
    await auto.focus();
    await auto.press("Space");
    assert.equal(await auto.isChecked(), false);
    await auto.press("Space");
    assert.equal(await auto.isChecked(), true);
    await page.getByRole("button", { name: "放大地图", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "恢复地图大小至 100%", exact: true }).textContent(), "110%");
    await page.getByRole("button", { name: "恢复地图大小至 100%", exact: true }).click();
    await quantity.fill("4");
    await quantity.dispatchEvent("change");
    assert.equal(await panel.locator("details,summary,[aria-expanded]").count(), 0);
    await panel.locator("header.mwi-lab-launcher").click();
    assert.equal(await page.locator("#mwi-labyrinth-content").isVisible(), true);
    assert.doesNotMatch(await panel.innerText(), /收起|展开|快速联合方案|规划使用数量/);
    await panel.screenshot({ path: path.join(directory, `menu-compact-${width}.png`) });
    assert.ok((await panel.boundingBox()).height < 560);
    const credits = panel.getByRole("region", { name: "作者与致谢" });
    assert.equal(await credits.isVisible(), true);
    assert.equal(
      await credits.getByRole("link", { name: "dakonglong", exact: true }).getAttribute("href"),
      "https://greasyfork.org/zh-CN/scripts/566829"
    );
    assert.equal(await credits.getByRole("link").count(), 5);
    for (const link of await credits.getByRole("link").all()) {
      assert.equal(await link.getAttribute("target"), "_blank");
      assert.equal(await link.getAttribute("rel"), "noopener noreferrer");
    }
    await credits.getByRole("link", { name: "dakonglong", exact: true }).focus();
    assert.equal(
      await credits
        .getByRole("link", { name: "dakonglong", exact: true })
        .evaluate((el) => el === document.activeElement),
      true
    );
    assert.equal(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth), true);
    await panel.screenshot({ path: path.join(directory, `menu-compact-${width}.png`) });
    await page.getByRole("button", { name: "增加一盏", exact: true }).click();
    await page.getByRole("button", { name: "增加一盏", exact: true }).click();
    assert.equal(await quantity.inputValue(), "5");
    assert.doesNotMatch(await panel.innerText(), /快速联合方案/);
    await page.getByRole("button", { name: "日志", exact: true }).click();
    assert.equal(await page.locator("#mwi-labyrinth-calc-room-log-floating").isVisible(), true);
    await page.getByRole("button", { name: "日志", exact: true }).click();
    assert.equal(await page.locator("#mwi-labyrinth-calc-room-log-floating").isVisible(), false);
    await page.getByRole("button", { name: "计算迷宫", exact: true }).click();
    await page.waitForFunction(
      () => !document.querySelector(".mwi-labyrinth-calc-clear-rate-control__button").disabled
    );
    assert.equal(await budget.inputValue(), "500");
    assert.notEqual(await page.locator(".mwi-labyrinth-calc-clear-rate-control__text").textContent(), "待计算");
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log("通过：桌面及窄屏紧凑菜单、无折叠、精简文案、库存解锁。");
} finally {
  await browser.close();
}
