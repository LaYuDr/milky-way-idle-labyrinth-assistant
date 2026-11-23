/* global document, window, IDBObjectStore */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { ROOT } from "./project.mjs";
const output = path.join(ROOT, ".workbench/tokens-workspace");
fs.mkdirSync(output, { recursive: true });
const files = [
  "src/tokens/model.js",
  "src/tokens/store.js",
  "src/ui/theme.js",
  "src/ui/token-workspace.js",
  "src/ui/sidebar.js",
  "src/ui/token-native-view.js",
  "src/ui/token-view.js",
  "src/calculator/live-progress.js",
  "src/calculator/tokens.js"
];
const nativeTabs = `<div class="LabyrinthPanel_tabsComponentContainer_fixture"><div class="TabsComponent_tabsComponent__fixture"><div class="TabsComponent_tabsContainer_fixture"><div class="MuiTabs-root"><div class="MuiTabs-scroller MuiTabs-fixed"><div role="tablist" aria-label="迷宫页签">${["库存", "装备", "技能", "房屋", "公会助手"].map((label, i) => `<button role="tab" class="native-tab${i ? "" : " Mui-selected"}" aria-selected="${!i}" tabindex="${i ? -1 : 0}">${label}</button>`).join("")}</div></div></div></div><div class="TabsComponent_tabPanelsContainer_fixture"><div class="native">迷宫内容 <button id="native-buy">游戏购买按钮（测试）</button></div></div></div></div>`;
const html = `<meta charset="UTF-8"><style>body{margin:0;background:#15151d;color:#eee;font:14px system-ui}main{max-width:980px;margin:30px auto;padding:0 16px}.LabyrinthPanel_labyrinthPanel_fixture{background:#202130;padding:16px;border-radius:6px}h1{font-size:20px;margin:0 0 8px}.native{padding:16px 0;color:#aaa;border-top:1px solid #444}button{font:inherit}.MuiTabs-root{overflow:hidden;width:100%}.MuiTabs-fixed{width:100%;overflow:hidden}[role=tablist]{display:flex;gap:3px;border-bottom:2px solid #34354d}.native-tab{flex-shrink:0;border:0;background:#2c2e45;color:#e4e5ef;padding:6px 18px;min-height:40px;border-radius:5px 5px 0 0}.native-tab.Mui-selected{background:#4558ad;color:white}</style><main><p>离线测试 · 演示数据</p><div class="LabyrinthPanel_labyrinthPanel_fixture"><h1>迷宫</h1><div class="LabyrinthPanel_labyrinthTokenStack_fixture">迷宫代币：500</div>${nativeTabs}</div></main>`;
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.MWI_TEST_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
try {
  for (const width of [1440, 390, 1784]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.route("**/*", (route) =>
      route.request().isNavigationRequest()
        ? route.fulfill({ contentType: "text/html; charset=utf-8", body: html })
        : route.abort()
    );
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.stack || e.message));
    async function boot() {
      await page.goto("http://mwi-tokens.fixture.test/");
      for (const file of files) await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, file), "utf8") });
      await page.evaluate(async () => {
        window.MwiLabyrinthSidebar.enabled = true;
        const M = window.MwiLabyrinthTokens;
        const seedStore = window.MwiLabyrinthTokenStore.create();
        const seed = await seedStore.load("42");
        if (!seed.plan.entries.length && !seed.runs.length) {
          await seedStore.savePlan("42", { ...seed.plan, reserve: 2000, futureRuns: 99, perRun: 900 });
        }
        seedStore.close();
        window.state = {
          character: { id: 42 },
          characterInfo: Object.fromEntries(M.definitions.map((d) => [d[2], d[5]])),
          characterItemMap: new Map([
            ["tokens", { itemHrid: M.TOKEN, itemLocationHrid: "/item_locations/inventory", count: 500 }]
          ]),
          characterLabyrinth: {
            startedAt: "2026-11-10T00:00:00Z",
            currentFloor: 8,
            isActive: true,
            lootedItemsData: JSON.stringify({ [M.TOKEN]: 120 })
          }
        };
        window.init = {
          labyrinthShopItemDetailMap: {
            shard: {
              hrid: "/labyrinth_shop_items/shard",
              itemHrid: "/items/shard",
              outputCount: 5,
              cost: { itemHrid: M.TOKEN, count: 25 }
            }
          }
        };
        const timers = [],
          controller = new AbortController();
        window.ctx = {
          destroyed: false,
          getGameState: () => window.state,
          getInitClientData: () => window.init,
          getItemDetailByHrid: () => ({ name: "迷宫精炼碎片" }),
          setTimeout: (...args) => window.setTimeout(...args),
          setInterval: (fn, ms) => {
            const id = setInterval(fn, ms);
            timers.push(id);
            return id;
          },
          listen: (target, type, fn) => target.addEventListener(type, fn, { signal: controller.signal })
        };
        window.MwiLabyrinthCalculatorModules["live-progress"](window.ctx);
        window.MwiLabyrinthCalculatorModules.tokens(window.ctx);
        window.WebSocket = class extends EventTarget {};
        window.socket = new window.WebSocket();
        window.socket.addEventListener("message", (e) => {
          void e.data;
          void e.data;
        });
        window.ctx.installLiveActionRateWsHook();
        window.emit = (labyrinth, characterId = 42) =>
          window.socket.dispatchEvent(
            new MessageEvent("message", { data: JSON.stringify({ type: "labyrinth_updated", characterId, labyrinth }) })
          );
        window.stop = () => {
          window.ctx.destroyed = true;
          timers.forEach(clearInterval);
          controller.abort();
          window.ctx.stopTokens();
          window.MwiLabyrinthSidebar.destroy();
          window.ctx.restoreProgressHook();
        };
        document.querySelectorAll(".native-tab").forEach((button) => {
          button.addEventListener("click", () => {
            document.querySelectorAll(".native-tab").forEach((other) => {
              const selected = other === button;
              other.classList.toggle("Mui-selected", selected);
              other.setAttribute("aria-selected", String(selected));
              other.tabIndex = selected ? 0 : -1;
            });
          });
        });
        window.gameClicks = 0;
        document.querySelector("#native-buy").addEventListener("click", () => window.gameClicks++);
        const createView = window.MwiLabyrinthTokenView.create;
        window.MwiLabyrinthTokenView.create = (...args) => {
          const view = createView(...args);
          return {
            ...view,
            update(data) {
              window.tokenSaving = !data.loaded || data.saving;
              view.update(data);
              if (data.loaded && data.saving && !data.saveError && !document.querySelector(".mt-save").hidden)
                throw new Error("保存过程中应隐藏保存进度文字");
            }
          };
        };
        window.ctx.startTokens();
      });
      await page.getByRole("tab", { name: "迷宫助手", exact: true }).click();
      await page.getByRole("tab", { name: "代币规划", exact: true }).click();
      await page.waitForFunction(
        () => window.tokenSaving === false && document.querySelector(".mt-save")?.hidden === true
      );
    }
    await boot();
    assert.equal(
      await page
        .locator("#mwi-labyrinth-calc-tokens small, .mt-basis, .mt-stat-summary, .mt-forecast-hint, .mt-more-actions")
        .count(),
      0
    );
    assert.equal(await page.locator(".mt-savebar").isVisible(), false);
    assert.doesNotMatch(
      await page.locator(".mt-workspace").innerText(),
      /拖动手柄排序|仅保存本地计划|起点固定|0 表示|留空时使用/
    );
    assert.equal(await page.locator("#mwi-labyrinth-sidebar-tab").count(), 1);
    assert.equal(await page.locator("#mwi-labyrinth-token-tab").count(), 0);
    await page.getByRole("tab", { name: "公会助手", exact: true }).click();
    assert.equal(await page.locator("#mwi-labyrinth-calc-tokens").isVisible(), false);
    assert.equal(await page.locator(".native").isVisible(), true);
    await page.getByRole("tab", { name: "迷宫助手", exact: true }).click();
    assert.equal(await page.locator("#mwi-labyrinth-calc-tokens").isVisible(), true);
    const budget = page.getByRole("spinbutton", { name: "规划数量", exact: true });
    const remaining = page.locator(".mt-balance");
    const stored = () =>
      page.evaluate(async () => {
        const store = window.MwiLabyrinthTokenStore.create();
        try {
          return await store.load("42");
        } finally {
          store.close();
        }
      });
    const income = async () => (await stored()).runs.reduce((sum, run) => sum + run.tokens, 0);
    assert.equal(await page.locator(".mt-budget-area input").count(), 1);
    assert.equal(
      await page
        .locator(
          ".mt-stats, .mt-eta, .mt-metrics, [data-budget=reserve], [data-budget=futureRuns], [data-budget=perRun]"
        )
        .count(),
      0
    );
    assert.equal(await budget.inputValue(), "");
    assert.equal(await budget.getAttribute("placeholder"), "当前 500");
    assert.equal(await remaining.textContent(), "500");
    const id = (key) => `/labyrinth_upgrades/${key}`;
    const row = (key) => page.locator(`.mt-group[data-id="${key}"]`);
    const target = (key) => row(key).locator("[data-target]");
    const costs = async () =>
      (await page.locator(".mt-group .mt-cost strong").allTextContents()).map((text) => text.replace(" 代币", ""));
    async function add(name) {
      await page.getByRole("button", { name: `加入${name}`, exact: true }).click();
    }
    await add("生活行动速度");
    await target(id("skill_action_speed")).selectOption("3");
    await add("入场冷却");
    await add("迷宫精炼碎片");
    await target("/labyrinth_shop_items/shard").fill("4");
    await target("/labyrinth_shop_items/shard").press("Tab");
    assert.deepEqual(await costs(), ["240", "800", "100"]);
    assert.equal(await remaining.textContent(), "-640");
    assert.match(await page.locator(".mt-cutoff").innerText(), /还差 540/);
    await page.getByRole("button", { name: "上移迷宫精炼碎片", exact: true }).click();
    assert.deepEqual(await costs(), ["240", "100", "800"]);
    await page.getByRole("button", { name: "上移迷宫精炼碎片", exact: true }).focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await page.evaluate(() => document.activeElement?.getAttribute("aria-label")),
      "迷宫精炼碎片的兑换次数"
    );
    await page.getByRole("button", { name: "下移迷宫精炼碎片", exact: true }).click();
    // Search/category, existing catalog item opens its plan rather than adding copies.
    await page.getByRole("button", { name: "生活", exact: true }).click();
    assert.equal(await page.locator(".mt-tile:visible").count(), 4);
    await page.getByRole("searchbox", { name: "搜索升级或商品" }).fill("效率");
    assert.equal(await page.locator(".mt-tile:visible").count(), 1);
    await page.getByRole("searchbox", { name: "搜索升级或商品" }).fill("不存在");
    assert.equal(await page.locator(".mt-filter-empty").isVisible(), true);
    await page.getByRole("searchbox", { name: "搜索升级或商品" }).fill("");
    await page.getByRole("button", { name: "全部", exact: true }).click();
    await page.getByRole("button", { name: "查看生活行动速度", exact: true }).click();
    assert.equal(await page.locator(".mt-group").count(), 3);
    assert.equal(await row(id("skill_action_speed")).locator(".mt-step").count(), 3);
    assert.equal(
      await row(id("skill_action_speed")).locator('[data-action="plus1"], [data-action="plus5"]').count(),
      0
    );
    await target(id("skill_action_speed")).selectOption("8");
    assert.equal(await target(id("skill_action_speed")).inputValue(), "8");
    await target(id("skill_action_speed")).selectOption("3");
    // Real pointer drag moves a group; keyboard alternative moves it back.
    const handle = page.getByRole("button", { name: "拖动入场冷却排序", exact: true });
    await page.waitForFunction(
      () => window.tokenSaving === false && document.querySelector(".mt-save")?.hidden === true
    );
    await handle.scrollIntoViewIfNeeded();
    const a = await handle.boundingBox(),
      b = await row(id("skill_action_speed")).boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + 15, b.y + 15, { steps: 8 });
    await page.mouse.up();
    assert.equal(await page.locator(".mt-group").first().getAttribute("data-id"), id("cooldown"));
    await page.getByRole("button", { name: "拖动入场冷却排序", exact: true }).press("Alt+ArrowDown");
    await page.getByRole("button", { name: "拖动入场冷却排序", exact: true }).press("Alt+ArrowDown");
    assert.deepEqual(await costs(), ["240", "100", "800"]);
    // Explicit zero is a real budget; blank follows live inventory. Old forecasts are ignored.
    for (const [value, expected] of [
      ["1250", "110"],
      ["0", "-1,140"],
      ["", "-640"]
    ]) {
      await budget.fill(value);
      await budget.press("Tab");
      assert.equal(await remaining.textContent(), expected);
    }
    await page.waitForFunction(
      () => window.tokenSaving === false && document.querySelector(".mt-save")?.hidden === true
    );
    assert.equal((await stored()).plan.budget, null);
    await page.evaluate(() => {
      window.state.characterItemMap.get("tokens").count = 700;
      window.ctx.refreshTokens();
    });
    assert.equal(await remaining.textContent(), "-440");
    assert.equal(await budget.getAttribute("placeholder"), "当前 700");
    await budget.fill("1500");
    await budget.press("Tab");
    await page.evaluate(() => {
      window.state.characterItemMap.get("tokens").count = 100;
      window.ctx.refreshTokens();
    });
    assert.equal(await remaining.textContent(), "360");
    await page.waitForFunction(
      () => window.tokenSaving === false && document.querySelector(".mt-save")?.hidden === true
    );
    assert.equal((await stored()).plan.budget, 1500);
    // Copy/export only use the active budget and plan.
    await page.evaluate(() =>
      Object.defineProperty(window.navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.copied = text;
          }
        }
      })
    );
    await page.getByRole("button", { name: "复制计划", exact: true }).click();
    assert.match(await page.evaluate(() => window.copied), /生活行动速度 0 → 3/);
    for (const [label, file] of [["导出 CSV", "plan"]]) {
      const pending = page.waitForEvent("download");
      await page.getByRole("button", { name: label, exact: true }).click();
      const download = await pending;
      const pathName = path.join(output, `${file}-${width}.csv`);
      await download.saveAs(pathName);
      assert.match(fs.readFileSync(pathName, "utf8"), file === "plan" ? /累计/ : /实际代币/);
    }
    // Clear/undo changes only the plan, not actual income.
    await page.getByRole("button", { name: "清空计划", exact: true }).click();
    assert.equal(await page.locator(".mt-group").count(), 0);
    await page.getByRole("button", { name: "撤销清空", exact: true }).click();
    assert.equal(await page.locator(".mt-group").count(), 3);
    assert.equal(await income(), 120);
    await page.waitForFunction(
      () => window.tokenSaving === false && document.querySelector(".mt-save")?.hidden === true
    );
    await page.evaluate(() => {
      document.activeElement?.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({ path: path.join(output, `workspace-${width}.png`), fullPage: true });
    // Real state changes update remaining costs but cannot erase income.
    await page.evaluate(() => {
      window.state.characterItemMap.get("tokens").count = 100;
      window.state.characterInfo.labyrinthSkillActionSpeedLevel = 2;
      window.ctx.refreshTokens();
    });
    assert.equal(await row(id("skill_action_speed")).locator(".mt-cost strong").textContent(), "120 代币");
    assert.equal(await income(), 120);
    await page.evaluate(() =>
      window.emit({ ...window.state.characterLabyrinth, lootedItemsData: '{"/items/labyrinth_token":9999}' }, 999)
    );
    await page.waitForFunction(
      () => window.tokenSaving === false && document.querySelector(".mt-save")?.hidden === true
    );
    await page.evaluate(() => window.stop());
    await boot();
    assert.equal(await page.locator(".mt-group").count(), 3);
    assert.equal(await budget.inputValue(), "1500");
    assert.equal(await remaining.textContent(), "360");
    assert.equal(await income(), 120);
    await page.evaluate(async () => {
      const a = window.MwiLabyrinthTokenStore.create(),
        b = window.MwiLabyrinthTokenStore.create();
      const record = window.MwiLabyrinthTokens.observation(window.state);
      await Promise.all([a.observe({ ...record, tokens: 130 }), b.observe({ ...record, tokens: 125 })]);
      const profile = await a.load("42");
      if (profile.runs.find((r) => r.startedAt === record.startedAt).tokens !== 130) throw Error("并发收入丢失");
      a.close();
      b.close();
      window.dispatchEvent(new Event("focus"));
    });
    await page.waitForFunction(async () => {
      const store = window.MwiLabyrinthTokenStore.create();
      try {
        return (await store.load("42")).runs[0]?.tokens === 130;
      } finally {
        store.close();
      }
    });
    await page.evaluate(() => {
      window.originalPut = IDBObjectStore.prototype.put;
      window.failWrites = true;
      IDBObjectStore.prototype.put = function (...args) {
        if (window.failWrites) throw new DOMException("空间不足", "QuotaExceededError");
        return window.originalPut.apply(this, args);
      };
    });
    await budget.fill("50");
    await budget.press("Tab");
    await page.waitForFunction(() => document.querySelector(".mt-error")?.textContent.includes("未能保存"));
    assert.equal(await budget.inputValue(), "50");
    await page.evaluate(() => {
      window.failWrites = false;
    });
    await page.getByRole("button", { name: "重试保存", exact: true }).click();
    await page.waitForFunction(
      () => window.tokenSaving === false && document.querySelector(".mt-save")?.hidden === true
    );
    assert.equal(await page.locator(".mt-error").isVisible(), false);
    await budget.fill("-1");
    await budget.press("Tab");
    assert.equal(await page.locator(".mt-error").isVisible(), true);
    await budget.fill("50");
    await budget.press("Tab");
    await page.evaluate(() => {
      const native = document.querySelector(".TabsComponent_tabsComponent__fixture"),
        clone = native.cloneNode(true);
      clone.querySelector("#mwi-labyrinth-sidebar-tab").remove();
      clone.querySelector("#mwi-labyrinth-sidebar").remove();
      native.replaceWith(clone);
      window.ctx.refreshTokens();
    });
    assert.equal(await page.locator("#mwi-labyrinth-sidebar-tab").count(), 1);
    await page.evaluate(() => {
      window.state = null;
      window.ctx.refreshTokens();
    });
    assert.equal(await page.locator("#mwi-labyrinth-calc-tokens").count(), 0);
    await page.evaluate(() => {
      window.state = { character: { id: 99 }, characterInfo: {}, characterItemMap: new Map() };
      window.ctx.refreshTokens();
    });
    await page.getByRole("tab", { name: "迷宫助手", exact: true }).click();
    await page.getByRole("tab", { name: "代币规划", exact: true }).click();
    await page.waitForFunction(
      () => window.tokenSaving === false && document.querySelector(".mt-save")?.hidden === true
    );
    assert.equal(await page.locator(".mt-group").count(), 0);
    assert.equal(await page.getByRole("button", { name: "加入入场冷却", exact: true }).isDisabled(), true);
    await add("迷宫精炼碎片");
    await page.getByRole("button", { name: "移除迷宫精炼碎片", exact: true }).focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "搜索升级或商品");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert.equal(await page.evaluate(() => window.gameClicks), 0);
    await page.evaluate(() => window.stop());
    assert.equal(await page.locator("#mwi-labyrinth-token-tab").count(), 0);
    assert.equal(await page.locator(".mwi-labyrinth-token-tab-list").count(), 0);
    assert.equal(await page.locator(".TabsComponent_tabPanelsContainer_fixture").isVisible(), true);
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(output, `result-${width}.json`),
      JSON.stringify({ width, passed: true, pageErrors: errors, checkedAt: new Date().toISOString() }, null, 2)
    );
    await context.close();
    console.log(
      `通过 ${width}px：两栏预算、空值跟随余额、零预算、负数缺口、旧预测隔离、目录/排序、撤销、保存恢复与原生隔离。`
    );
  }
} finally {
  await browser.close();
}
