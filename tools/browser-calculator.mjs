/* global document, window, location, getComputedStyle, draw */
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
const results = [];
async function checkGuildLayout(page, auto, width) {
  const originalStyle = await auto.getAttribute("style");
  // A narrow game sidebar must stack even when the browser itself is wide.
  const values = await auto.locator("input").evaluateAll((nodes) => nodes.map((node) => node.value));
  for (const hostWidth of [320, 360, 448, 560]) {
    await auto.evaluate((el, size) => (el.style.width = `${size}px`), hostWidth);
    const overflow = await auto.evaluate((el) => {
      const parent = el.getBoundingClientRect();
      return [...el.querySelectorAll("input,button,label")]
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width && (rect.left < parent.left || rect.right > parent.right + 1);
        })
        .map((node) => node.outerHTML);
    });
    assert.deepEqual(overflow, [], `${width}px viewport / ${hostWidth}px host: controls must fit`);
    assert.equal(await auto.locator("input:visible").count(), 24);
    assert.deepEqual(await auto.locator("input").evaluateAll((nodes) => nodes.map((node) => node.value)), values);
    for (const target of [
      auto,
      auto.locator(".mwi-labyrinth-calc-auto-heading"),
      auto.locator("#mwi-labyrinth-calc-experience-goals"),
      auto.locator("input").first()
    ])
      assert.equal(await target.evaluate((node) => getComputedStyle(node).backgroundColor), "rgba(0, 0, 0, 0)");
    const rows = auto.locator(".mwi-labyrinth-calc-experience-inputs label");
    assert.equal(await rows.count(), 20);
    const row1 = await rows.nth(0).boundingBox(),
      row2 = await rows.nth(1).boundingBox();
    if (hostWidth >= 360) {
      assert.equal(row1.y, row2.y, "twenty room types retain the same compact two-column rows");
      assert.ok((await auto.boundingBox()).height < 650, "compact recommendation panel height");
    } else assert.ok(row2.y >= row1.y + row1.height);
    await auto.screenshot({ path: path.join(directory, `compact-transparent-${width}-${hostWidth}.png`) });
    const methods = await auto.locator(".mwi-labyrinth-calc-auto-method").all();
    const first = await methods[0].boundingBox(),
      second = await methods[1].boundingBox();
    assert.ok(second.y >= first.y + first.height, "narrow host stacks recommendation methods");
  }
  await auto.evaluate((el, style) => {
    if (style === null) el.removeAttribute("style");
    else el.setAttribute("style", style);
  }, originalStyle);
  const button = auto.locator(".mwi-labyrinth-calc-auto-primary").first();
  await page.keyboard.press("Tab");
  await button.focus();
  assert.equal(await button.evaluate((el) => getComputedStyle(el).outlineStyle), "solid");
  assert.equal(await button.evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(67, 196, 173)");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await button.evaluate((el) => getComputedStyle(el).transitionDuration), "0s");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.mouse.move(0, 0);
}
async function checkPrefill(page) {
  const recommendationTexts = await page.locator("td.mwi-labyrinth-calc-auto-recommend-cell").allTextContents();
  const expected = await page
    .locator("td.mwi-labyrinth-calc-auto-recommend-cell")
    .first()
    .getAttribute("data-mwi-labyrinth-calc-recommend-setting");
  assert.ok(expected);
  const firstRow = page.locator(".LabyrinthPanel_automationTable_fixture tbody tr").first();
  const needsAdjustment = Number(expected) !== 20;
  assert.equal((await firstRow.getAttribute("data-mwi-labyrinth-adjust")) !== null, needsAdjustment);
  assert.equal(await page.locator("tr[data-mwi-labyrinth-combat-start]").count(), 1);
  await page.evaluate(() => {
    const cell = document.querySelector(".LabyrinthPanel_automationTable_fixture tbody tr").children[2];
    cell.innerHTML = '<div class="LabyrinthPanel_skipThreshold_fixture"><button>编辑</button></div>';
    cell.querySelector("button").onclick = () => {
      cell.firstElementChild.innerHTML =
        '<div class="LabyrinthPanel_thresholdInputContainer_fixture"><input type="number" value="20" min="-999" max="999"></div><button>保存</button>';
      window.prefillSaves = 0;
      cell.querySelector("button").onclick = () => {
        window.prefillSaves++;
        const value = Number(cell.querySelector("input").value);
        window.fixtureState.characterSetting.labyrinthSkipMilking = value;
        cell.textContent = String(value);
      };
    };
  });
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.waitForFunction(
    (value) =>
      document.querySelector(".LabyrinthPanel_thresholdInputContainer_fixture input")?.value === String(Number(value)),
    expected
  );
  const input = page.locator(".LabyrinthPanel_thresholdInputContainer_fixture input");
  await input.fill("17");
  await page.waitForTimeout(1200);
  assert.equal(await input.inputValue(), "17");
  assert.equal(await page.evaluate(() => window.prefillSaves), 0);
  assert.equal(
    (await firstRow.getAttribute("data-mwi-labyrinth-adjust")) !== null,
    needsAdjustment,
    "draft does not clear highlight"
  );
  // A user saving a recommendation changes selection thresholds, not the recommendation inputs.
  await input.fill(String(Number(expected)));
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.waitForTimeout(1400);
  assert.equal(await page.evaluate(() => window.prefillSaves), 1);
  assert.equal(
    await firstRow.getAttribute("data-mwi-labyrinth-adjust"),
    null,
    "saved matching setting clears highlight"
  );
  assert.deepEqual(
    await page.locator("td.mwi-labyrinth-calc-auto-recommend-cell").allTextContents(),
    recommendationTexts
  );
  await page.evaluate(() => {
    document.querySelector(".LabyrinthPanel_automationTable_fixture tbody tr").children[2].textContent = "20";
    window.fixtureState.characterSetting.labyrinthSkipMilking = 20;
  });
  // Let the estimate cache observe the restored native threshold before the next run.
  await page.waitForTimeout(1200);
}
try {
  for (const width of [1440, 390]) {
    console.log("Viewport", width);
    const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width < 500 });
    const errors = [];
    context.on("page", (page) => {
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("dialog", (dialog) => {
        errors.push(dialog.message());
        dialog.dismiss();
      });
    });
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/static/js/main.fixture.chunk.js")
        return route.fulfill({
          contentType: "application/javascript",
          body: "window.fixtureTravel={LabyrinthTravelTimeSeconds:1,LabyrinthInitialTravelTimeSeconds:3};"
        });
      if (url.pathname === "/runtime.js")
        return route.fulfill({ contentType: "application/javascript", body: runtime });
      if (
        ["/static/media/skills_sprite.fixture.svg", "/static/media/combat_monsters_sprite.fixture.svg"].includes(
          url.pathname
        )
      )
        return route.fulfill({ contentType: "image/svg+xml", body: skillSprite });
      if (url.hostname === "mwi-fixture.invalid") return route.fulfill({ contentType: "text/html", body: html });
      if (url.hostname === "shykai.github.io")
        return route.fulfill({
          contentType: "text/html",
          body: '<!doctype html><input id="inputSetSolo"><button id="buttonImportSet" onclick="document.body.dataset.imported=\'yes\'">Import</button><input id="inputRoomLevel"><select id="selectLabyrinth"><option value="/monsters/shadow_archer">Archer</option></select><input type="checkbox" id="simLabyrinthToggle"><script src="/runtime.js"></script>'
        });
      return route.abort();
    });
    await context.addInitScript((data) => {
      Object.defineProperty(navigator, "hardwareConcurrency", { configurable: true, get: () => 8 });
      Object.defineProperty(navigator, "deviceMemory", { configurable: true, get: () => 8 });
      if (location.origin === "null") return;
      localStorage.setItem("initClientData", JSON.stringify(data));
      window.__originalProgressGetter = Object.getOwnPropertyDescriptor(MessageEvent.prototype, "data").get;
    }, gameData);
    const page = await context.newPage();
    const trialRecovery = process.argv.includes("--combat-trials-only");
    await page.goto(trialRecovery ? "https://mwi-fixture.invalid/#legacy-trials" : "https://mwi-fixture.invalid/");
    await page.locator("#mwi-labyrinth-calc-dock").waitFor({ state: "attached" });
    if (process.argv.includes("--floor-snapshot-only")) {
      const button = page.getByRole("button", { name: "计算迷宫", exact: true });
      await page.waitForFunction(() => document.querySelectorAll(".mwi-labyrinth-calc-clear-rate-badge").length === 3);
      await page.evaluate(() => {
        const rooms = window.fixtureState.characterLabyrinth.roomData;
        rooms[1][0] = { ...rooms[0][3], recommendedLevel: 21 };
        window.battleInputs = [];
        const post = window.Worker.prototype.postMessage;
        window.Worker.prototype.postMessage = function (message, ...args) {
          if (message.type === "run") {
            const p = message.params;
            window.battleInputs.push([p.mazeDifficulty, p.playerDto.meleeLevel]);
            if (window.battleInputs.length === 1) {
              window.resumeFirstBattle = () => post.call(this, message, ...args);
              return;
            }
          }
          return post.call(this, message, ...args);
        };
      });
      await button.click();
      await page.waitForFunction(() => typeof window.resumeFirstBattle === "function");
      await page.evaluate(() => {
        const state = window.fixtureState;
        state.characterSkillMap["/skills/melee"].level++;
        state.characterLabyrinth.roomData[1][1] = { ...state.characterLabyrinth.roomData[0][3], recommendedLevel: 22 };
      });
      // Let the normal poll observe both changes while the first worker request is still pending.
      await page.waitForTimeout(1400);
      await page.evaluate(() => window.resumeFirstBattle());
      await page.waitForFunction(() => document.querySelectorAll(".mwi-labyrinth-calc-clear-rate-badge").length === 5);
      const inputs = await page.evaluate(() => window.battleInputs);
      assert.deepEqual(
        inputs,
        [
          [20, 100],
          [21, 100],
          [22, 101]
        ].flatMap((row) => Array(5).fill(row))
      );
      await button.click();
      await page.waitForFunction(
        () =>
          window.battleInputs.length >= 30 &&
          !document.querySelector(".mwi-labyrinth-calc-clear-rate-control__button").disabled
      );
      assert.deepEqual(
        await page.evaluate(() => window.battleInputs.slice(15)),
        [20, 21, 22].flatMap((level) => Array(5).fill([level, 101]))
      );
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`通过 ${width}px：属性升级后本轮继续，新房间补算及下次手动计算使用新属性。`);
      continue;
    }
    if (trialRecovery) {
      const button = page.getByRole("button", { name: "计算迷宫", exact: true });
      const trials = page.getByRole("spinbutton", { name: "战斗场数", exact: true });
      const storedTrials = () =>
        page.evaluate(() => localStorage.getItem("mwi-labyrinth:calculator:clear_rate_combat_trials:character:1001"));
      await page.waitForFunction(() => document.querySelectorAll(".mwi-labyrinth-calc-clear-rate-badge").length === 3);
      assert.equal(await trials.inputValue(), "3000");
      assert.equal(await storedTrials(), "3000");
      await trials.fill("3001");
      await trials.blur();
      assert.equal(await trials.inputValue(), "3000");
      // Hold the first combat request until the input has been edited, then exercise the error path.
      await page.evaluate(() => {
        const proto = window.Worker.prototype;
        const post = proto.postMessage;
        proto.postMessage = function (message, ...args) {
          if (message.type !== "run") return post.call(this, message, ...args);
          proto.postMessage = post;
          window.fixtureFailBattle = () =>
            this.dispatchEvent(
              new window.MessageEvent("message", { data: { type: "error", id: message.id, error: "模拟中断测试" } })
            );
        };
      });
      await button.click();
      await page.waitForFunction(() => typeof window.fixtureFailBattle === "function");
      await trials.fill("25");
      await trials.blur();
      await page.evaluate(() => window.fixtureFailBattle());
      await page.getByText(/计算失败.*模拟中断测试/).waitFor({ state: "visible" });
      assert.equal(await storedTrials(), "25");
      await button.click();
      await page.waitForFunction(() => {
        const raw = localStorage.getItem("mwi-labyrinth:calculator:room-results:v1:character:1001");
        return raw && JSON.parse(raw).rooms.some((entry) => entry.result?.debug?.includes("trials=25 |"));
      });
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`通过 ${width}px：旧值恢复、超限输入、计算中改数和失败后重试，全程无弹窗。`);
      continue;
    }
    if (process.argv.includes("--combat-preview-only")) {
      await page.waitForFunction(
        () => document.querySelectorAll(".mwi-labyrinth-calc-clear-rate-badge").length === 3,
        {},
        { timeout: 60000 }
      );
      await page.locator('[data-room-x="3"][data-room-y="0"]').hover();
      const preview = page.locator("#mwi-labyrinth-calc-clear-rate-preview");
      await preview.waitFor({ state: "visible" });
      assert.match(await preview.innerText(), /失败原因\s+(防御不足|伤害不足)/);
      const upgradeRows = preview.locator(".mwi-labyrinth-calc-preview-upgrade");
      assert.equal(await upgradeRows.count(), 4);
      const baseChance = Number.parseFloat(
        await preview.locator(".mwi-labyrinth-calc-preview-summary [class$='__value']").first().innerText()
      );
      for (const [index, name] of ["战斗伤害", "攻击速度", "施法速度", "暴击率"].entries()) {
        const [label, cost, chance, delta] = await upgradeRows.nth(index).locator("span").allTextContents();
        assert.equal(label, name);
        assert.equal(cost, "40 代币");
        assert.match(chance, /^\d+\.\d%$/);
        assert.equal(Number(delta), Number((Number.parseFloat(chance) - baseChance).toFixed(1)));
      }
      await preview.screenshot({ path: path.join(directory, `failure-reason-${width}.png`) });
      const failurePreviews = await page.evaluate(() => {
        const ctx = window.MwiLabyrinthCalculator.create({ start: false }).context;
        ctx.ensurePreviewTooltip = () => document.createElement("div");
        return [
          [10, 2, 8],
          [10, 8, 2],
          [0, 0, 0]
        ].map(([failures, timeouts, deaths]) => {
          const failureReason = ctx.deriveCombatFailureReasonFromCounts(failures, timeouts, deaths);
          return ctx.renderCombatPreviewTooltip({ failureReason }).textContent;
        });
      });
      assert.match(failurePreviews[0], /失败原因防御不足/);
      assert.match(failurePreviews[1], /失败原因伤害不足/);
      assert.doesNotMatch(failurePreviews[2], /失败原因|防御不足|伤害不足/);

      assert.deepEqual(errors, []);
      await context.close();
      console.log(`Combat failure preview ${width}: passed`);
      continue;
    }

    await page.waitForFunction(
      () => document.querySelector('[data-room-x="5"][data-room-y="5"]')?.__mwiLabyrinthCalcPreviewBound
    );
    await page.locator('[data-room-x="5"][data-room-y="5"]').hover();
    await page.locator("#mwi-labyrinth-calc-clear-rate-preview").waitFor({ state: "visible" });
    assert.match(await page.locator("#mwi-labyrinth-calc-clear-rate-preview").innerText(), /第 1 层通关奖励/);
    assert.deepEqual(
      await page.locator("#mwi-labyrinth-calc-clear-rate-preview [class$='__value']").allTextContents(),
      ["5", "0", "0", "0"]
    );
    await page.mouse.move(0, 0);
    if (width < 500) await page.locator("#mwi-labyrinth-planner .mwi-lab-launcher").click();
    assert.equal(await page.locator("#mwi-labyrinth-planner #mwi-labyrinth-calc-dock").count(), 1);
    assert.equal(await page.locator("#mwi-labyrinth-planner").count(), 1);
    assert.equal(
      await page.evaluate(async () => {
        const frame = () =>
          new Promise((resolve) => {
            globalThis.requestAnimationFrame(resolve);
          });
        const native = document.querySelector(".LabyrinthPanel_labyrinthPanel_fixture");
        const parent = native.parentElement,
          next = native.nextSibling;
        const visible = () => Boolean(document.querySelector("#mwi-labyrinth-planner")?.checkVisibility());
        await frame();
        native.hidden = true;
        await frame();
        if (visible()) return false;
        native.hidden = false;
        await frame();
        if (!visible()) return false;
        native.remove();
        await frame();
        if (visible()) return false;
        parent.insertBefore(native, next);
        await frame();
        return visible() && document.querySelectorAll("#mwi-labyrinth-planner #mwi-labyrinth-calc-dock").length === 1;
      }),
      true,
      "planner and calculator follow native hide/show and removal/reinsert in the first frame"
    );
    assert.equal(
      await page.locator("#mwi-labyrinth-calc-dock").evaluate((el) => getComputedStyle(el).position),
      "static"
    );
    assert.equal(await page.locator("#mwi-labyrinth-planner").evaluate((el) => getComputedStyle(el).position), "fixed");
    const originalMapBox = await page.locator(".LabyrinthPanel_roomGrid_fixture").boundingBox();
    await page.locator("#mwi-labyrinth-planner .mwi-lab-launcher").click();
    assert.equal(await page.locator("#mwi-labyrinth-content").isVisible(), true);
    await page.locator("#mwi-labyrinth-planner .mwi-lab-launcher").click();
    assert.equal(await page.locator("#mwi-labyrinth-calc-clear-rate-control").isVisible(), true);
    assert.deepEqual(await page.locator(".LabyrinthPanel_roomGrid_fixture").boundingBox(), originalMapBox);
    await page.screenshot({ path: path.join(directory, `unified-${width}.png`) });
    const settings = page.locator("#mwi-labyrinth-planner .mwi-lab-calculate-action");
    assert.equal(await settings.locator("summary, details").count(), 0);
    assert.equal(await page.locator(".mwi-labyrinth-calc-restart-setting").count(), 0);
    await settings.locator('input[type="number"]').first().focus();
    assert.equal(
      await settings
        .locator('input[type="number"]')
        .first()
        .evaluate((el) => getComputedStyle(el).outlineStyle),
      "solid"
    );
    await page.locator("#mwi-labyrinth-planner").screenshot({ path: path.join(directory, `settings-${width}.png`) });
    assert.equal(await settings.locator("summary, details").count(), 0);
    assert.equal(await page.locator(".mwi-labyrinth-calc-restart-setting").count(), 0);
    // Entering the map calculates revealed rooms automatically, without a Calculate click.
    await page.waitForFunction(
      () => document.querySelectorAll(".mwi-labyrinth-calc-clear-rate-badge").length === 3,
      {},
      { timeout: 60000 }
    );
    await page.waitForFunction(
      () => !document.querySelector("#mwi-labyrinth-calc-clear-rate-control button").disabled,
      {},
      { timeout: 60000 }
    );
    // Refresh the fixture deadline before checking advice; this suite performs lengthy simulations.
    await page.evaluate(() => {
      window.fixtureState.labyrinthRoomProgress.timeoutAt = new Date(Date.now() + 110000).toISOString();
    });
    await page.waitForFunction(() =>
      /重开|继续/.test(document.querySelector("#mwi-labyrinth-calc-live-action-rate")?.textContent || "")
    );
    const badgeGeometry = await page
      .locator(".mwi-labyrinth-calc-clear-rate-badge")
      .first()
      .evaluate((badge) => {
        const chance = badge.children[0],
          eta = badge.children[1],
          before = [chance.textContent, eta.textContent];
        chance.textContent = "100%";
        eta.textContent = "999+";
        const rect = badge.getBoundingClientRect(),
          cell = badge.parentElement.getBoundingClientRect();
        const result = {
          chance: getComputedStyle(chance).fontSize,
          eta: getComputedStyle(eta).fontSize,
          fits: badge.scrollWidth <= badge.clientWidth,
          inside: rect.left >= cell.left && rect.right <= cell.right,
          bottomGap: cell.bottom - rect.bottom,
          pointer: getComputedStyle(badge).pointerEvents
        };
        [chance.textContent, eta.textContent] = before;
        return result;
      });
    assert.deepEqual(badgeGeometry, {
      chance: "9px",
      eta: "8px",
      fits: true,
      inside: true,
      bottomGap: 1,
      pointer: "none"
    });
    await page.screenshot({ path: path.join(directory, `badges-${width}.png`) });
    await page.locator('[data-room-x="1"][data-room-y="0"]').hover();
    await page.locator("#mwi-labyrinth-calc-clear-rate-preview").waitFor({ state: "visible" });
    const preview = page.locator("#mwi-labyrinth-calc-clear-rate-preview");
    assert.match(await preview.innerText(), /通关胜率/);
    for (const label of ["工作能力", "成功率", "双倍进度", "2分钟次数", "每场经验", "每小时经验", "代币期望"]) {
      assert.ok((await preview.innerText()).includes(label), `完整预览应显示 ${label}`);
    }
    assert.equal(await preview.locator("[hidden]").count(), 0);
    assert.equal(await page.getByRole("checkbox", { name: "详细预览", exact: true }).count(), 0);
    await page.screenshot({ path: path.join(directory, `details-${width}.png`) });
    await page.mouse.move(0, 0);
    for (const [x, name, expected] of [
      [2, "enhancing", /目标强化/],
      [3, "combat", /弱点/],
      [4, "rewards", /代币期望/]
    ]) {
      await page.locator(`[data-room-x="${x}"][data-room-y="0"]`).hover();
      assert.match(await preview.innerText(), expected);
      assert.equal(await preview.locator("[hidden]").count(), 0);
      if (name === "combat") {
        for (const label of ["战斗风格", "伤害类型", "代币期望"])
          assert.ok((await preview.innerText()).includes(label));
        assert.match(await preview.innerText(), /失败原因\s+(防御不足|伤害不足)/);
        assert.doesNotMatch(await preview.innerText(), /攻击间隔|最大HP/);
      }
      await page.screenshot({ path: path.join(directory, `${name}-${width}.png`) });
    }
    const failurePreviews = await page.evaluate(() => {
      const ctx = window.MwiLabyrinthCalculator.create({ start: false }).context;
      ctx.ensurePreviewTooltip = () => document.createElement("div");
      return [
        [10, 2, 8],
        [10, 8, 2],
        [0, 0, 0]
      ].map(([failures, timeouts, deaths]) => {
        const failureReason = ctx.deriveCombatFailureReasonFromCounts(failures, timeouts, deaths);
        return ctx.renderCombatPreviewTooltip({ failureReason }).textContent;
      });
    });
    assert.match(failurePreviews[0], /失败原因防御不足/);
    assert.match(failurePreviews[1], /失败原因伤害不足/);
    assert.doesNotMatch(failurePreviews[2], /失败原因|防御不足|伤害不足/);
    await page.mouse.move(0, 0);
    const resultKey = "mwi-labyrinth:calculator:room-results:v1:character:1001";
    const savedPreview = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).rooms.find((r) => r.key === "1,0"),
      resultKey
    );
    await page.evaluate(() => {
      window.fixtureState.characterLabyrinth.roomData[1][0] = {
        roomType: "/labyrinth_room_types/skilling",
        skillHrid: "/skills/milking",
        recommendedLevel: 80
      };
      draw();
    });
    await page.waitForFunction(() => document.querySelectorAll(".mwi-labyrinth-calc-clear-rate-badge").length === 4);
    assert.deepEqual(
      await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).rooms.find((r) => r.key === "1,0"), resultKey),
      savedPreview
    );
    // A real document reload must restore full result data without clicking Calculate.
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll(".mwi-labyrinth-calc-clear-rate-badge").length === 3);
    await page.locator('[data-room-x="1"][data-room-y="0"]').hover();
    assert.match(await preview.innerText(), /工作能力/);
    assert.deepEqual(
      await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).rooms.find((r) => r.key === "1,0"), resultKey),
      savedPreview
    );
    await page.screenshot({ path: path.join(directory, `restored-${width}.png`) });
    await page.mouse.move(0, 0);
    await page.evaluate(() => {
      window.fixtureState.characterLabyrinth.roomData[0][1].isCleared = true;
      draw();
    });
    await page.waitForTimeout(1200);
    assert.equal(
      await page.locator('[data-room-x="1"][data-room-y="0"] .mwi-labyrinth-calc-clear-rate-badge').count(),
      0
    );
    assert.deepEqual(
      await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).rooms.find((r) => r.key === "1,0"), resultKey),
      savedPreview
    );
    await page.screenshot({ path: path.join(directory, `cleared-room-${width}.png`) });
    await page.evaluate(() => {
      window.fixtureState.characterLabyrinth.roomData[0][1].isCleared = false;
      draw();
    });
    await page.waitForFunction(() => document.querySelectorAll(".mwi-labyrinth-calc-clear-rate-badge").length === 3);

    await page.mouse.move(0, 0);
    if (!(await page.locator("#mwi-labyrinth-content").isVisible()))
      await page.locator("#mwi-labyrinth-planner .mwi-lab-launcher").click();
    await page.getByRole("button", { name: "计算迷宫", exact: true }).click();
    await page.waitForFunction((key) => {
      const rooms = JSON.parse(localStorage.getItem(key) || "null")?.rooms || [];
      return (
        rooms.some((r) => r.key === "3,0") &&
        !rooms.some((r) => r.key === "0,1") &&
        !document.querySelector("#mwi-labyrinth-calc-clear-rate-control button").disabled
      );
    }, resultKey);
    assert.equal(await page.locator(".mwi-labyrinth-calc-clear-rate-badge").count(), 3);
    await page.mouse.move(0, 0);
    if (await page.locator("#mwi-labyrinth-content").isVisible())
      await page.locator("#mwi-labyrinth-planner .mwi-lab-launcher").click();
    const auto = page.locator("#mwi-labyrinth-calc-auto-estimate-control");
    // Force a live skill update while a non-EXP Worker request is in flight.
    await page.evaluate(() => {
      const original = window.Worker.prototype.postMessage;
      window.Worker.prototype.postMessage = function (message, ...args) {
        if (message?.type === "run" && window.mwiLabyrinthUpgradeAutomation) {
          window.mwiLabyrinthUpgradeAutomation = false;
          const skill = window.fixtureState.characterSkillMap["/skills/combat"];
          const saved = skill.level;
          skill.level = saved + 1;
          setTimeout(() => {
            skill.level = saved;
            original.call(this, message, ...args);
          }, 1600);
          return;
        }
        return original.call(this, message, ...args);
      };
    });
    for (const label of ["计算胜率", "按胜率推荐", "按耗时推荐"]) {
      await page.evaluate(() => {
        window.mwiLabyrinthUpgradeAutomation = true;
      });
      await auto.getByRole("button", { name: label, exact: true }).click();
      await page.waitForFunction(() => window.mwiLabyrinthUpgradeAutomation === false);
      await auto.getByRole("button", { name: "停止", exact: true }).click();
      await page.waitForFunction(
        () => !document.querySelector(".mwi-labyrinth-calc-auto-estimate-control__button").disabled
      );
      assert.match(await auto.locator(".mwi-labyrinth-calc-auto-estimate-control__status").innerText(), /已手动停止/);
    }
    await page.evaluate(() => {
      window.mwiLabyrinthUpgradeAutomation = true;
    });
    await auto.getByRole("button", { name: "计算胜率", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelectorAll("td.mwi-labyrinth-calc-auto-estimate-cell").length === 3
    );
    await page.waitForFunction(
      () =>
        !Array.from(document.querySelectorAll("#mwi-labyrinth-calc-auto-estimate-control button")).some(
          (x) => x.disabled
        ),
      {},
      { timeout: 60000 }
    );

    assert.equal(await page.evaluate(() => window.mwiLabyrinthUpgradeAutomation), false);
    assert.match(await auto.locator(".mwi-labyrinth-calc-auto-estimate-control__status").innerText(), /3\/3/);
    await page.waitForTimeout(1200); // Cross a normal refresh tick; results must survive it.
    assert.match(await page.locator("td.mwi-labyrinth-calc-auto-estimate-cell").first().innerText(), /%/);
    await page.evaluate(() => window.scrollTo(0, 0));
    if (width < 500)
      await page.locator(".LabyrinthPanel_automationSection_fixture").evaluate((el) => {
        el.scrollLeft = el.scrollWidth;
      });
    await page.screenshot({ path: path.join(directory, `estimates-${width}.png`), fullPage: true });
    const savedEstimates = await page.locator("td.mwi-labyrinth-calc-auto-estimate-cell").allTextContents();
    await page.locator("#upgrade").click();
    await page.waitForTimeout(1200);
    assert.deepEqual(await page.locator("td.mwi-labyrinth-calc-auto-estimate-cell").allTextContents(), savedEstimates);
    await page.evaluate(() => window.fixtureState.characterSkillMap["/skills/milking"].level--);
    await page.waitForTimeout(1200);
    assert.deepEqual(await page.locator("td.mwi-labyrinth-calc-auto-estimate-cell").allTextContents(), savedEstimates);
    console.log("Estimates passed", width);
    assert.equal(await auto.locator("select, details, summary").count(), 0);
    assert.equal(await auto.locator("input:visible").count(), 24);
    assert.doesNotMatch(await auto.innerText(), /千经验|留空不参与|仅推荐上限|计算设置|推荐依据/);
    await page.evaluate(() => {
      window.mwiLabyrinthUpgradeAutomation = true;
    });
    await auto.getByRole("button", { name: "按胜率推荐", exact: true }).click();
    await page.waitForFunction(
      () =>
        !Array.from(document.querySelectorAll("#mwi-labyrinth-calc-auto-estimate-control button")).some(
          (x) => x.disabled
        ),
      {},
      { timeout: 60000 }
    );
    assert.equal(await page.evaluate(() => window.mwiLabyrinthUpgradeAutomation), false);
    assert.match(await auto.locator(".mwi-labyrinth-calc-auto-estimate-control__status").innerText(), /3\/3/);
    assert.equal(await page.locator("td.mwi-labyrinth-calc-auto-recommend-cell").count(), 3);
    await page.waitForTimeout(1200);
    assert.match(await page.locator("td.mwi-labyrinth-calc-auto-recommend-cell").first().innerText(), /^[+-]?\d+$/);
    await checkPrefill(page);
    await page.evaluate(() => {
      window.mwiLabyrinthUpgradeAutomation = true;
    });
    await auto.getByRole("button", { name: "按耗时推荐", exact: true }).click();
    await page.waitForFunction(
      () =>
        !Array.from(document.querySelectorAll("#mwi-labyrinth-calc-auto-estimate-control button")).some(
          (x) => x.disabled
        ),
      {},
      { timeout: 60000 }
    );
    await page.waitForTimeout(1200);
    assert.match(await page.locator("td.mwi-labyrinth-calc-auto-recommend-cell").first().innerText(), /^[+-]?\d+$/);
    assert.equal(await page.evaluate(() => window.mwiLabyrinthUpgradeAutomation), false);
    assert.match(await auto.locator(".mwi-labyrinth-calc-auto-estimate-control__status").innerText(), /3\/3/);
    assert.doesNotMatch(await auto.innerText(), /待计算/);
    await checkGuildLayout(page, auto, width);
    await checkPrefill(page);
    console.log("Retention checks", width);
    // Previously a level/buff/floor signature update deleted every recommendation.
    const retained = await page.locator("td.mwi-labyrinth-calc-auto-recommend-cell").allTextContents();
    await page.locator("#upgrade").click();
    await page.waitForTimeout(1200);
    assert.equal(await page.locator("[data-mwi-labyrinth-calc-recommend-stale]").count(), 0);
    assert.deepEqual(await page.locator("td.mwi-labyrinth-calc-auto-recommend-cell").allTextContents(), retained);
    assert.equal(await page.locator("td[data-mwi-labyrinth-calc-recommend-setting]").count(), 2);
    await checkPrefill(page);
    await page.evaluate(() => {
      const table = document.querySelector(".LabyrinthPanel_automationTable_fixture");
      table.querySelectorAll(".mwi-labyrinth-calc-auto-recommend-cell").forEach((node) => node.remove());
    });
    await page.waitForFunction(
      () => document.querySelectorAll("td.mwi-labyrinth-calc-auto-recommend-cell").length === 3
    );
    assert.deepEqual(await page.locator("td.mwi-labyrinth-calc-auto-recommend-cell").allTextContents(), retained);
    console.log("Recreating calculator", width);
    await page.evaluate(() => window.__mwiLabyrinthAssistant.destroy());
    await page.addScriptTag({ content: runtime });
    await page.waitForFunction(
      () => document.querySelectorAll("td.mwi-labyrinth-calc-auto-recommend-cell").length === 3
    );
    assert.deepEqual(await page.locator("td.mwi-labyrinth-calc-auto-recommend-cell").allTextContents(), retained);
    await page.evaluate(() => {
      window.recommendationFixtureLabyrinth = window.fixtureState.characterLabyrinth;
      window.fixtureState.characterLabyrinth = null;
    });
    await page.waitForFunction(
      () => document.querySelectorAll("td.mwi-labyrinth-calc-auto-recommend-cell").length === 0
    );
    await page.evaluate(() => {
      window.fixtureState.characterLabyrinth = window.recommendationFixtureLabyrinth;
    });
    await page.waitForFunction(
      () => document.querySelectorAll("td.mwi-labyrinth-calc-auto-recommend-cell").length === 3
    );
    assert.deepEqual(await page.locator("td.mwi-labyrinth-calc-auto-recommend-cell").allTextContents(), retained);
    await page.evaluate(() => {
      window.fixtureState.characterLabyrinth.currentFloor++;
    });
    await page.waitForTimeout(1200);
    assert.deepEqual(await page.locator("td.mwi-labyrinth-calc-auto-recommend-cell").allTextContents(), retained);
    await page.evaluate(() => {
      window.fixtureState.characterLabyrinth.currentFloor--;
      window.fixtureState.characterSkillMap["/skills/milking"].level--;
    });
    await page.waitForTimeout(1200);
    await auto.getByRole("button", { name: "按耗时推荐", exact: true }).click();
    await page
      .waitForFunction(
        () =>
          document.querySelectorAll("td[data-mwi-labyrinth-calc-recommend-setting]").length === 2 &&
          document.querySelectorAll("tr[data-mwi-labyrinth-adjust]").length === 2 &&
          !document.querySelector("[data-mwi-labyrinth-calc-recommend-stale]"),
        null,
        { timeout: 60000 }
      )
      .catch(async (error) => {
        console.error(
          await auto.innerText(),
          await page.locator("td.mwi-labyrinth-calc-auto-recommend-cell").allTextContents()
        );
        throw error;
      });

    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.querySelector(".LabyrinthPanel_automationSection_fixture").scrollLeft = 0;
    });
    assert.equal(
      await page
        .locator("td.mwi-labyrinth-calc-auto-recommend-cell")
        .last()
        .evaluate((cell) => {
          const range = document.createRange();
          range.selectNodeContents(cell);
          const text = range.getBoundingClientRect();
          const bounds = cell.getBoundingClientRect();
          return text.left >= bounds.left && text.right <= Math.min(bounds.right, window.innerWidth);
        }),
      true,
      "Recommendation status must remain readable within its cell and viewport"
    );
    await page.screenshot({ path: path.join(directory, `automation-${width}.png`), fullPage: true });
    if (width < 500) {
      await page.locator(".LabyrinthPanel_automationSection_fixture").evaluate((el) => {
        el.scrollLeft = el.scrollWidth;
      });
      await page.screenshot({ path: path.join(directory, `automation-results-${width}.png`), fullPage: true });
    }
    // The fast scan uses the exact same rate as the complete tooltip for every life skill.
    const rateCheck = await page.evaluate(() => {
      const ctx = window.MwiLabyrinthCalculator.create({ start: false }).context;
      const state = window.fixtureState,
        data = ctx.getInitClientData();
      const equipment = ctx.buildMaxEnhancementByItem(state);
      for (const entry of ctx.LABYRINTH_AUTOMATION_SKILL_ROOM_TYPES) {
        for (const level of [20, 100, 250]) {
          const room = ctx.createAutomationRoomFromEntry(entry, level);
          const full = ctx.computeRoomClearChance(state, data, room, equipment);
          const fast = ctx.computeRoomClearChance(state, data, room, equipment, { summaryOnly: true });
          if (!full || !fast || Math.abs(full.skillingPreview.experiencePerHour - fast.experiencePerHour) > 1e-7)
            return entry.key + ":" + level;
        }
      }
      return "ok";
    });
    assert.equal(rateCheck, "ok");
    const goals = page.locator("#mwi-labyrinth-calc-experience-goals");
    assert.equal(await goals.locator("summary").count(), 0);
    assert.equal(await goals.locator("input:visible").count(), 21);
    await page.evaluate(() => {
      const host = document.createElement("div");
      host.id = "fixture-native-skill-icon";
      host.hidden = true;
      host.innerHTML =
        '<svg><use href="/static/media/skills_sprite.fixture.svg#milking"></use><use href="/static/media/combat_monsters_sprite.fixture.svg#shadow_archer"></use></svg>';
      document.body.append(host);
    });
    await page.waitForFunction(
      () => document.querySelectorAll("#mwi-labyrinth-calc-experience-goals use[href]").length === 20
    );
    assert.deepEqual(
      await goals
        .locator("use[data-skill]")
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href").split("#")[1])),
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
        "enhancing"
      ]
    );
    assert.equal(await goals.locator("input").count(), 21);
    await goals.getByRole("spinbutton", { name: "挤奶 目标经验 (K/h)", exact: true }).fill("10");
    await goals.getByRole("spinbutton", { name: "强化 目标经验 (K/h)", exact: true }).fill("10");
    await auto.getByRole("button", { name: "按经验推荐", exact: true }).click();
    await page.waitForFunction(
      () => !document.querySelector(".mwi-labyrinth-calc-experience-recommend").disabled,
      {},
      { timeout: 60000 }
    );
    await page.waitForTimeout(1200);
    const expCells = page.locator("td.mwi-labyrinth-calc-auto-recommend-cell");
    assert.match(await expCells.nth(0).innerText(), /^[+-]?\d+$/);
    assert.match(await expCells.nth(1).innerText(), /^[+-]?\d+$/);
    assert.equal(await expCells.nth(2).innerText(), "-");
    assert.doesNotMatch(await expCells.allTextContents().then((values) => values.join(" ")), /K\/h/);
    assert.equal(await expCells.locator("details").count(), 0);
    assert.doesNotMatch(await expCells.first().innerText(), /达标区间/);
    await checkPrefill(page);
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.querySelector(".LabyrinthPanel_automationSection_fixture").scrollLeft = 0;
    });
    const controlBounds = await auto.boundingBox();
    assert.ok(
      controlBounds.x >= 0 && controlBounds.x + controlBounds.width <= width + 1,
      "recommendation panel fits viewport"
    );
    for (const input of await goals.locator("input").all()) {
      const bounds = await input.boundingBox();
      assert.ok(
        bounds.x >= controlBounds.x && bounds.x + bounds.width <= controlBounds.x + controlBounds.width + 1,
        "goal input stays inside panel"
      );
    }
    await page.screenshot({ path: path.join(directory, `experience-${width}.png`), fullPage: true });
    await auto.screenshot({ path: path.join(directory, `recommendation-panel-${width}.png`) });
    await page.evaluate(() => {
      // Keep a positive combat recommendation in this weak-loadout fixture;
      // separate tests cover the real combat-level start and no-pass window.
      window.fixtureState.characterSkillMap["/skills/combat"].level = 1;
      window.mwiLabyrinthTestWorkers = new Set();
      window.mwiLabyrinthTestCombatRuns = 0;
      const original = window.Worker.prototype.postMessage;
      window.Worker.prototype.postMessage = function (message, ...args) {
        if (message?.type === "run") {
          window.mwiLabyrinthTestCombatRuns++;
          if (message.params?.seed === 173) window.mwiLabyrinthTestWorkers.add(this);
        }
        if (message?.type === "run" && message.params?.seed === 173 && window.mwiLabyrinthTestUpgradeDuringScan) {
          window.mwiLabyrinthTestUpgradeDuringScan = false;
          window.fixtureState.characterSkillMap["/skills/milking"].level++;
          window.setTimeout(() => original.call(this, message, ...args), 1600);
          return;
        }
        return original.call(this, message, ...args);
      };
    });
    await goals.getByRole("spinbutton", { name: "暗影弓手 目标经验 (K/h)", exact: true }).fill("0");
    await auto.getByRole("button", { name: "按经验推荐", exact: true }).click();
    await auto.getByRole("button", { name: "停止", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector(".mwi-labyrinth-calc-experience-recommend").disabled);
    assert.equal(await auto.locator(".mwi-labyrinth-calc-experience-stop").isVisible(), false);
    // Stopping can finish and cache the entire small scan. Use a new trial count
    // so this next assertion always observes a real Worker run, not a cache hit.
    const scanBudget = auto.getByRole("spinbutton", { name: "模拟预算", exact: true });
    await scanBudget.fill(String(Number(await scanBudget.inputValue()) - 1));
    await page.evaluate(() => {
      window.mwiLabyrinthTestUpgradeDuringScan = true;
      window.mwiLabyrinthTestWorkers.clear();
    });
    await auto.getByRole("button", { name: "按经验推荐", exact: true }).click();
    await page.waitForFunction(
      () => !document.querySelector(".mwi-labyrinth-calc-experience-recommend").disabled,
      {},
      { timeout: 180000 }
    );
    await page.waitForTimeout(1200);
    assert.match(await expCells.nth(2).innerText(), /^[+-]?\d+$/);
    assert.equal(await page.evaluate(() => window.mwiLabyrinthTestUpgradeDuringScan), false);
    assert.ok(await page.evaluate(() => window.mwiLabyrinthTestWorkers.size >= 2));
    assert.match(await expCells.nth(2).getAttribute("title"), /未达标后追加5级/);
    assert.match(await expCells.nth(0).innerText(), /^[+-]?\d+$/);
    assert.match(await expCells.nth(1).innerText(), /^[+-]?\d+$/);
    // The completed run kept its snapshot; warm the cache for the new live state.
    await auto.getByRole("button", { name: "按经验推荐", exact: true }).click();
    await page.waitForFunction(
      () => !document.querySelector(".mwi-labyrinth-calc-experience-recommend").disabled,
      {},
      { timeout: 180000 }
    );
    await page.waitForTimeout(1200);
    const combatRecommendation = await expCells.nth(2).innerText();
    const runsBeforeRepeat = await page.evaluate(() => window.mwiLabyrinthTestCombatRuns);
    assert.ok(runsBeforeRepeat > 0);
    await auto.getByRole("button", { name: "按经验推荐", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector(".mwi-labyrinth-calc-experience-recommend").disabled);
    await page.waitForTimeout(1200);
    assert.equal(await page.evaluate(() => window.mwiLabyrinthTestCombatRuns), runsBeforeRepeat);
    assert.equal(await expCells.nth(2).innerText(), combatRecommendation);
    await expCells.nth(2).hover();
    const combatXP = page.locator("#mwi-labyrinth-calc-clear-rate-preview");
    await combatXP.waitFor({ state: "visible" });
    assert.match(await combatXP.innerText(), /每小时经验/);
    assert.match(await combatXP.innerText(), /目标经验\s+0 K\/h/);
    const skillRows = combatXP.locator("[data-combat-experience]");
    const skillCount = await skillRows.count();
    assert.ok(skillCount === 0 || (skillCount >= 2 && skillCount < 7), "不足两项经验时不展示重复明细");
    assert.ok(
      await skillRows.evaluateAll((rows) =>
        rows.every((row) => Number.parseFloat(row.querySelector('[class$="__value"]').textContent) > 0)
      ),
      "战斗详情只显示非零技能经验"
    );
    assert.doesNotMatch(await combatXP.innerText(), /模拟口径|Rust · 完整场数/);
    await combatXP.screenshot({ path: path.join(directory, `combat-experience-${width}.png`) });
    await page.mouse.move(0, 0);
    await goals.getByRole("spinbutton", { name: "暗影弓手 目标经验 (K/h)", exact: true }).fill("");

    await goals.getByRole("spinbutton", { name: "挤奶 目标经验 (K/h)", exact: true }).fill("1000000000");
    await page.waitForTimeout(1200);
    assert.equal(await page.locator("td[data-mwi-labyrinth-calc-recommend-setting]").count(), 3);
    assert.equal(await page.locator("[data-mwi-labyrinth-calc-recommend-stale]").count(), 0);
    await goals.getByRole("spinbutton", { name: "强化 目标经验 (K/h)", exact: true }).fill("");
    await auto.getByRole("button", { name: "按经验推荐", exact: true }).click();
    await page.waitForFunction(
      () => !document.querySelector(".mwi-labyrinth-calc-experience-recommend").disabled,
      {},
      { timeout: 60000 }
    );
    assert.match(await expCells.nth(0).innerText(), /扫描范围内未达标/);
    assert.equal(await expCells.nth(1).innerText(), "-");
    assert.equal(await expCells.nth(2).innerText(), "-");
    assert.equal(await page.locator("tr[data-mwi-labyrinth-adjust]").count(), 0);
    await goals.getByRole("spinbutton", { name: "挤奶 目标经验 (K/h)", exact: true }).fill("10");
    await page.locator('[data-room-x="1"][data-room-y="0"]').hover();
    await page.locator("#mwi-labyrinth-calc-clear-rate-preview").waitFor({ state: "visible" });
    assert.match(await page.locator("#mwi-labyrinth-calc-clear-rate-preview").innerText(), /目标经验\s+10 K\/h/);
    assert.match(await page.locator("#mwi-labyrinth-calc-clear-rate-preview").innerText(), /每小时经验\s+[\d.]+ K\/h/);
    assert.match(await page.locator("#mwi-labyrinth-calc-clear-rate-preview").innerText(), /高于目标/);
    await page.mouse.move(0, 0);
    console.log("Experience passed", width);
    if (!(await page.locator("#mwi-labyrinth-content").isVisible()))
      await page.locator("#mwi-labyrinth-planner .mwi-lab-launcher").click();
    await page.getByRole("checkbox", { name: "胜率分布", exact: true }).check();
    await page.waitForFunction(
      () => document.querySelector("#mwi-labyrinth-calc-room-distribution-floating")?.textContent.includes("有效样本"),
      {},
      { timeout: 120000 }
    );
    assert.match(
      await page.locator("#mwi-labyrinth-calc-room-distribution-floating").innerText(),
      /有效样本 420\/420 · 失败 0/
    );
    for (const selector of ["#mwi-labyrinth-planner", "#mwi-labyrinth-calc-room-distribution-floating"]) {
      const rect = await page.locator(selector).boundingBox();
      assert.ok(
        rect.x >= 0 && rect.x + rect.width <= width + 1 && rect.y >= 0 && rect.y + rect.height <= 1001,
        selector
      );
    }
    assert.equal(
      await page.locator(".mwi-labyrinth-calc-clear-rate-control__distribution-step-input").inputValue(),
      "25"
    );
    assert.ok(
      (await page.locator(".mwi-labyrinth-calc-clear-rate-control__distribution-step-input").boundingBox()).width >= 60
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(directory, `distribution-${width}.png`) });
    await page.getByRole("checkbox", { name: "胜率分布", exact: true }).uncheck();
    console.log("Distribution passed", width);
    const popupPromise = page.waitForEvent("popup");
    await page.locator('[data-room-x="3"][data-room-y="0"]').click({ button: "right" });
    const popup = await popupPromise;
    await popup.waitForFunction(() => document.body.dataset.imported === "yes");
    assert.equal(await popup.locator("#inputRoomLevel").inputValue(), "20");
    assert.ok((await popup.locator("#inputSetSolo").inputValue()).includes("equipment"));
    await popup.close();
    console.log("Bridge passed", width);

    await page.locator("#mwi-labyrinth-calc-clear-rate-control button").filter({ hasText: /日志/ }).click();
    await page.locator("#mwi-labyrinth-calc-room-log-floating").waitFor({ state: "visible" });
    assert.match(await page.locator("#mwi-labyrinth-calc-room-log-floating").innerText(), /挤奶/);
    await page.evaluate(() => window.scrollTo(0, 0));
    const log = page.locator("#mwi-labyrinth-calc-room-log-floating");
    for (const button of await log.locator("button").all()) {
      const box = await button.boundingBox();
      assert.ok(box.width >= 32 && box.height >= 32, "floating window actions remain reachable");
    }
    assert.equal(
      await log.locator('[class$="__log-list"]').evaluate((el) => getComputedStyle(el).overflowY),
      "visible",
      "log has no nested scroll area"
    );
    assert.equal(await log.locator("details, summary").count(), 0);
    await page.waitForTimeout(1200);
    assert.equal(await log.locator("details, summary").count(), 0);
    await page.screenshot({ path: path.join(directory, `history-${width}.png`), fullPage: true });
    // Synthetic long history verifies that scrolling never loses the window controls.
    const clones = await log.evaluate((el) => {
      const list = el.querySelector('[class$="__log-list"]');
      const entry = list.firstElementChild;
      for (let i = 0; i < 20; i++) {
        const clone = entry.cloneNode(true);
        clone.dataset.fixtureClone = "true";
        list.append(clone);
      }
      el.scrollTop = el.scrollHeight;
      const panel = el.getBoundingClientRect();
      const header = el.firstElementChild.getBoundingClientRect();
      const result = { scroll: el.scrollTop, top: header.top - panel.top, bottom: header.bottom - panel.bottom };
      return result;
    });
    assert.ok(
      clones.scroll > 0 && clones.top >= 0 && clones.top < 2 && clones.bottom <= 0,
      "long log keeps its title and close controls visible"
    );
    await log.screenshot({ path: path.join(directory, `history-long-${width}.png`) });
    await log.evaluate((el) => {
      el.querySelectorAll("[data-fixture-clone]").forEach((node) => node.remove());
      el.scrollTop = 0;
    });
    await log.getByRole("button", { name: "清空", exact: true }).click();
    assert.match(await log.innerText(), /完成房间挑战后显示记录/);
    assert.equal(await log.getByRole("button", { name: "清空", exact: true }).isDisabled(), true);
    await page.screenshot({ path: path.join(directory, `history-empty-${width}.png`), fullPage: true });
    await page
      .locator("#mwi-labyrinth-calc-room-log-floating button")
      .filter({ hasText: /关闭|×/ })
      .click();
    const before = await page.evaluate(() => ({
      keys: Object.keys(localStorage).filter((k) => k.startsWith("mwi-labyrinth:")),
      nativeStyle: document.querySelector(".LabyrinthPanel_gridContainer_fixture").getAttribute("style")
    }));
    await page.locator("#upgrade").click();
    await page.waitForTimeout(1200);
    assert.ok((await page.locator(".mwi-labyrinth-calc-clear-rate-badge").count()) >= 3, "升级后保留上次模拟");
    assert.equal(await page.locator(".LabyrinthPanel_gridContainer_fixture").getAttribute("style"), before.nativeStyle);
    if (await page.locator("#mwi-labyrinth-content").isVisible())
      await page.locator("#mwi-labyrinth-planner .mwi-lab-launcher").click();
    await page.locator(".mwi-labyrinth-calc-prefill-toggle input").uncheck();
    assert.equal(await page.evaluate(() => localStorage.getItem("mwi-labyrinth:prefill-enabled:v1")), "false");
    await page.evaluate(() => window.__mwiLabyrinthAssistant.destroy());
    assert.equal(await page.locator(".mwi-labyrinth-calc-prefill-toggle").count(), 0);
    assert.equal(await page.locator('[id^="mwi-labyrinth-calc-"]').count(), 0);
    assert.equal(
      await page.evaluate(
        () => Object.getOwnPropertyDescriptor(MessageEvent.prototype, "data").get === window.__originalProgressGetter
      ),
      true
    );
    await page.addScriptTag({ content: runtime });
    await page.locator("#mwi-labyrinth-calc-dock").waitFor({ state: "attached" });
    if (process.argv.includes("--combat-preview-only")) {
      await page.waitForFunction(
        () => document.querySelectorAll(".mwi-labyrinth-calc-clear-rate-badge").length === 3,
        {},
        { timeout: 60000 }
      );
      await page.locator('[data-room-x="3"][data-room-y="0"]').hover();
      const preview = page.locator("#mwi-labyrinth-calc-clear-rate-preview");
      await preview.waitFor({ state: "visible" });
      assert.match(await preview.innerText(), /失败原因\s+(防御不足|伤害不足)/);
      await preview.screenshot({ path: path.join(directory, `failure-reason-${width}.png`) });
      const failurePreviews = await page.evaluate(() => {
        const ctx = window.MwiLabyrinthCalculator.create({ start: false }).context;
        ctx.ensurePreviewTooltip = () => document.createElement("div");
        return [
          [10, 2, 8],
          [10, 8, 2],
          [0, 0, 0]
        ].map(([failures, timeouts, deaths]) => {
          const failureReason = ctx.deriveCombatFailureReasonFromCounts(failures, timeouts, deaths);
          return ctx.renderCombatPreviewTooltip({ failureReason }).textContent;
        });
      });
      assert.match(failurePreviews[0], /失败原因防御不足/);
      assert.match(failurePreviews[1], /失败原因伤害不足/);
      assert.doesNotMatch(failurePreviews[2], /失败原因|防御不足|伤害不足/);

      assert.deepEqual(errors, []);
      await context.close();
      console.log(`Combat failure preview ${width}: passed`);
      continue;
    }

    await page.locator("#mwi-labyrinth-calc-experience-goals").waitFor({ state: "attached" });
    assert.equal(await page.locator(".mwi-labyrinth-calc-prefill-toggle input").isChecked(), false);
    assert.equal(
      await page.locator('#mwi-labyrinth-calc-experience-goals input[data-skill="milking"]').inputValue(),
      "10"
    );
    assert.equal(
      await page.locator('#mwi-labyrinth-calc-experience-goals input[data-skill="enhancing"]').inputValue(),
      ""
    );
    await page.locator("#leave").click();
    await page.locator("#mwi-labyrinth-planner").waitFor({ state: "hidden" });
    await page.locator("#mwi-labyrinth-calc-dock").waitFor({ state: "hidden" });
    await page.locator("#leave").click();
    await page.locator("#mwi-labyrinth-planner").waitFor({ state: "visible" });
    await page.locator("#mwi-labyrinth-calc-dock").waitFor({ state: "attached" });
    if (process.argv.includes("--combat-preview-only")) {
      await page.waitForFunction(
        () => document.querySelectorAll(".mwi-labyrinth-calc-clear-rate-badge").length === 3,
        {},
        { timeout: 60000 }
      );
      await page.locator('[data-room-x="3"][data-room-y="0"]').hover();
      const preview = page.locator("#mwi-labyrinth-calc-clear-rate-preview");
      await preview.waitFor({ state: "visible" });
      assert.match(await preview.innerText(), /失败原因\s+(防御不足|伤害不足)/);
      await preview.screenshot({ path: path.join(directory, `failure-reason-${width}.png`) });
      const failurePreviews = await page.evaluate(() => {
        const ctx = window.MwiLabyrinthCalculator.create({ start: false }).context;
        ctx.ensurePreviewTooltip = () => document.createElement("div");
        return [
          [10, 2, 8],
          [10, 8, 2],
          [0, 0, 0]
        ].map(([failures, timeouts, deaths]) => {
          const failureReason = ctx.deriveCombatFailureReasonFromCounts(failures, timeouts, deaths);
          return ctx.renderCombatPreviewTooltip({ failureReason }).textContent;
        });
      });
      assert.match(failurePreviews[0], /失败原因防御不足/);
      assert.match(failurePreviews[1], /失败原因伤害不足/);
      assert.doesNotMatch(failurePreviews[2], /失败原因|防御不足|伤害不足/);

      assert.deepEqual(errors, []);
      await context.close();
      console.log(`Combat failure preview ${width}: passed`);
      continue;
    }

    assert.equal(await page.locator("#mwi-labyrinth-planner").count(), 1);
    assert.equal(await page.locator("#mwi-labyrinth-planner #mwi-labyrinth-calc-dock").count(), 1);
    assert.equal(await page.locator("#mwi-labyrinth-calc-clear-rate-control").count(), 1);
    assert.ok((await page.locator(".mwi-labyrinth-calc-clear-rate-badge").count()) >= 3);
    await page.locator("#floor").click();
    await page.waitForFunction((key) => {
      const data = JSON.parse(localStorage.getItem(key) || "null");
      return (
        data &&
        JSON.parse(data.scope)[2] === 2 &&
        data.rooms.some((r) => r.key === "3,0") &&
        document.querySelectorAll(".mwi-labyrinth-calc-clear-rate-badge").length === 3
      );
    }, resultKey);
    assert.equal(
      await page.evaluate(
        (key) =>
          JSON.parse(localStorage.getItem(key)).rooms.find((r) => r.key === "1,0").skillingPreview.rewardPreview.floor,
        resultKey
      ),
      2
    );
    await page.locator('[data-room-x="5"][data-room-y="5"]').hover();
    await page.locator("#mwi-labyrinth-calc-clear-rate-preview").waitFor({ state: "visible" });
    assert.match(await page.locator("#mwi-labyrinth-calc-clear-rate-preview").innerText(), /第 2 层通关奖励/);
    assert.deepEqual(
      await page.locator("#mwi-labyrinth-calc-clear-rate-preview [class$='__value']").allTextContents(),
      ["10", "0", "0", "0"]
    );
    assert.deepEqual(errors, []);
    results.push({
      width,
      checks: [
        "unrevealed-exit-rewards-before-calculation-and-after-floor-change",
        "unified-panel",
        "guild-theme-and-keyboard-focus",
        "narrow-desktop-host-layout",
        "reduced-motion",
        "floating-window-action-targets",
        "long-log-sticky-header",
        "full-room-preview",
        "flat-recommendation-controls",
        "history-disclosure",
        "shared-collapse",
        "unchanged-map-layout",
        "skilling",
        "enhancing",
        "real-wasm",
        "live-restart",
        "preview",
        "automation",
        "win-rate-recommendation",
        "all-automation-modes-finish-across-live-updates",
        "time-recommendation",
        "experience-goals",
        "prefill-all-recommendation-modes",
        "recommendation-difference-highlight-saved-not-draft",
        "skilling-combat-separator-without-extra-table-rows",
        "empty-experience-goals-show-dash",
        "combat-experience-goal-recommendation-and-nonzero-skill-preview",
        "experience-stop-and-restart",
        "combat-experience-repeat-without-new-simulations",
        "experience-scan-completes-across-live-character-upgrade",
        "experience-summary-equivalence",
        "experience-goal-change-retains-results",
        "experience-impossible-and-empty",
        "distribution",
        "external-bridge",
        "history",
        "recommendation-invalidation-room-snapshot-retention",
        "recommendation-persistence-table-rebuild-and-runtime-reload",
        "recommendation-retention-across-missing-state-and-floor-changes",
        "manual-only-results-retain-prefill-after-input-changes",
        "new-room-preserves-results",
        "page-reload-restores-results",
        "next-floor-replaces-results-automatically",
        "automatic-initial-calculation",
        "original-badge-style-long-time-fit",
        "cleared-room-hides-persisted-badge",
        "teardown",
        "reload",
        "leave",
        "return"
      ],
      errors
    });
    await context.close();
  }
  fs.writeFileSync(path.join(directory, "results.json"), JSON.stringify(results, null, 2) + "\n");
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
