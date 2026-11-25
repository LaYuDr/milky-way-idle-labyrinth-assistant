/* global document, window, IDBObjectStore */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { ROOT } from "./project.mjs";

const output = path.join(ROOT, ".workbench/token-shop-lite");
fs.mkdirSync(output, { recursive: true });

const files = [
  "src/tokens/model.js",
  "src/tokens/store.js",
  "src/ui/theme.js",
  "src/ui/sidebar.js",
  "src/ui/token-view.js",
  "src/calculator/live-progress.js",
  "src/calculator/tokens.js"
];

const iconSvg = `<svg style="display:none"><symbol id="labyrinth_skilling_success" viewBox="0 0 24 24"><path d="M12 21V11m0 5C3 16 3 6 4 3c8 0 10 4 8 13Zm0-5c0-6 5-8 9-8 0 6-2 10-9 10" fill="none" stroke="#8edbca" stroke-width="1.7"/></symbol><symbol id="labyrinth_cast_speed" viewBox="0 0 24 24"><path d="M9 3h6m-5 0v7L4 20h16l-6-10V3M7 15h10" fill="none" stroke="#9bb5ee" stroke-width="1.7"/></symbol><symbol id="labyrinth_critical_rate" viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9Z" fill="none" stroke="#c3a9e2" stroke-width="1.7"/></symbol><symbol id="labyrinth_attack_speed" viewBox="0 0 24 24"><path d="m14 2-9 12h7l-2 8 9-12h-7Z" fill="none" stroke="#ebc68e" stroke-width="1.7"/></symbol><symbol id="processing_scroll" viewBox="0 0 24 24"><path d="M7 3h12v15c0 4-6 4-6 0H3V6a3 3 0 0 1 6 0H3m10 12H7M10 9h6m-6 4h6" fill="none" stroke="#e9c689" stroke-width="1.7"/></symbol><symbol id="labyrinth_shard" viewBox="0 0 24 24"><path d="m12 2 8 5v10l-8 5-8-5V7Z" fill="none" stroke="#82dcca" stroke-width="1.7"/></symbol><symbol id="non_token_crate" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="#aaa" stroke-width="1.7"/></symbol><symbol id="labyrinth_token" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="#efc576" stroke-width="1.8"/><circle cx="8" cy="8" r="2.5" fill="#efc576"/></symbol></svg>`;

const html = `<!doctype html><meta charset="UTF-8"><style>
:root{--spacing-xs:0.25rem;--spacing-sm:0.5rem;--radius-sm:0.25rem;--font-size-sm:0.8125rem;--font-size-base:0.875rem;--item-size-normal:3.75rem;--color-midnight-300:#393a5b;--color-midnight-500:#2c2e45;--color-text-secondary:#b7bfd4;--color-success:#e9a24b}
*{box-sizing:border-box}
body{margin:0;background:#131419;color:#edf0fa;font:14px/1.4 system-ui,-apple-system,"PingFang SC",sans-serif}
main{max-width:1040px;margin:16px auto;padding:0 12px}
.LabyrinthPanel_labyrinthPanel_fixture{background:#20212f;padding:12px;border-radius:6px}
.tabs{display:flex;gap:3px;border-bottom:2px solid #34354d;margin-bottom:8px;overflow-x:auto}
.tabs button{flex-shrink:0;border:0;background:#2c2e45;color:#e4e5ef;padding:6px 14px;min-height:36px;border-radius:5px 5px 0 0;cursor:pointer;font:inherit}
.tabs button[aria-selected="true"]{background:#4558ad;color:#fff}
.LabyrinthPanel_labyrinthShopTab_fixture{padding:var(--spacing-xs)}
.LabyrinthPanel_buyableGrid_fixture{display:grid;grid-template-columns:repeat(auto-fill,10rem);gap:var(--spacing-sm);justify-content:center}
.LabyrinthPanel_label_fixture{grid-column:1/-1;margin-top:var(--spacing-xs);margin-bottom:-2px;font-size:var(--font-size-base);font-weight:500;line-height:var(--font-size-base);text-align:left}
.LabyrinthPanel_upgrade_fixture,.LabyrinthPanel_item_fixture{position:relative;width:10rem;height:10rem;border-radius:var(--radius-sm);padding:var(--spacing-sm);background-color:var(--color-midnight-500);font-size:var(--font-size-base);font-weight:500;display:flex;flex-direction:column;gap:var(--spacing-xs);align-items:center;cursor:pointer;text-align:center}
.LabyrinthPanel_upgrade_fixture:hover,.LabyrinthPanel_item_fixture:hover{background-color:var(--color-midnight-300)}
.LabyrinthPanel_unlocked_fixture{cursor:auto}
.LabyrinthPanel_unlocked_fixture:hover{background-color:var(--color-midnight-500)}
.LabyrinthPanel_name_fixture{flex-grow:1;line-height:1.2}
.LabyrinthPanel_iconContainer_fixture{position:absolute;top:3.125rem;height:var(--item-size-normal);display:flex;flex-direction:column;justify-content:center;align-items:center}
.LabyrinthPanel_iconContainer_fixture svg{width:3rem;height:3rem}
.LabyrinthPanel_level_fixture{font-size:var(--font-size-sm);font-weight:400;color:var(--color-text-secondary)}
.LabyrinthPanel_price_fixture{display:flex;align-items:center;gap:3px;font-size:var(--font-size-base)}
.LabyrinthPanel_price_fixture svg{width:14px;height:14px}
.LabyrinthPanel_maxed_fixture{font-size:var(--font-size-base);font-weight:600;color:var(--color-success)}
</style>${iconSvg}<main><div class="LabyrinthPanel_labyrinthPanel_fixture"><div class="tabs" role="tablist"><button role="tab" id="tab-map" aria-selected="false">迷宫</button><button role="tab" id="tab-shop" aria-selected="true">迷宫商店</button></div><div id="tab-body"></div></div></main>`;

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.MWI_TEST_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});

try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 960 } });
    await context.route("**/*", (route) =>
      route.request().isNavigationRequest()
        ? route.fulfill({ contentType: "text/html; charset=utf-8", body: html })
        : route.abort()
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.stack || error.message));

    async function boot() {
      await page.goto("http://mwi-tokens.fixture.test/");
      for (const file of files) await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, file), "utf8") });
      await page.evaluate(async () => {
        const M = window.MwiLabyrinthTokens;
        const seedStore = window.MwiLabyrinthTokenStore.create();
        const seed = await seedStore.load("42");
        if (!seed.plan.entries.length && !seed.runs.length) {
          await seedStore.savePlan("42", { ...seed.plan, reserve: 2000, futureRuns: 99, perRun: 900 });
        }
        seedStore.close();

        window.state = {
          character: { id: 42 },
          characterInfo: {
            ...Object.fromEntries(M.definitions.map((d) => [d[2], d[5]])),
            labyrinthSkillingSuccessLevel: 4,
            labyrinthCastSpeedLevel: 1,
            labyrinthCriticalRateLevel: 12,
            labyrinthAttackSpeedLevel: undefined
          },
          characterItemMap: new Map([
            ["tokens", { itemHrid: M.TOKEN, itemLocationHrid: "/item_locations/inventory", count: 800 }]
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
            scroll: {
              hrid: "/labyrinth_shop_items/processing_scroll",
              itemHrid: "/items/processing_scroll",
              outputCount: 1,
              cost: { itemHrid: M.TOKEN, count: 30 }
            },
            shard: {
              hrid: "/labyrinth_shop_items/shard",
              itemHrid: "/items/labyrinth_shard",
              outputCount: 5,
              cost: { itemHrid: M.TOKEN, count: 25 }
            },
            coinItem: {
              hrid: "/labyrinth_shop_items/coin_crate",
              itemHrid: "/items/non_token_crate",
              outputCount: 1,
              cost: { itemHrid: "/items/coin", count: 100 }
            }
          }
        };

        window.nativeClicks = [];
        window.renderShopDom = () => {
          const info = window.state?.characterInfo || {};
          const body = document.getElementById("tab-body");
          const sLv = info.labyrinthSkillingSuccessLevel;
          const cLv = info.labyrinthCastSpeedLevel;
          const crLv = info.labyrinthCriticalRateLevel;
          const aLv = info.labyrinthAttackSpeedLevel;
          const cardUpgrade = (id, name, symbol, lv, max, base) => {
            const maxed = typeof lv === "number" && lv >= max;
            const el = document.createElement("div");
            el.className = `LabyrinthPanel_upgrade_fixture${maxed ? " LabyrinthPanel_unlocked_fixture" : ""}`;
            el.dataset.cardId = id;
            el.innerHTML = `<div class="LabyrinthPanel_name_fixture">${name}</div><div class="LabyrinthPanel_iconContainer_fixture"><svg><use href="#${symbol}"/></svg></div><div class="LabyrinthPanel_level_fixture">${typeof lv === "number" ? `${lv} / ${max}` : "—"}</div>${maxed ? '<div class="LabyrinthPanel_maxed_fixture">已满级</div>' : `<div class="LabyrinthPanel_price_fixture">${typeof lv === "number" ? base * (lv + 1) : "—"}<svg><use href="#labyrinth_token"/></svg></div>`}`;
            if (!maxed) el.addEventListener("click", () => window.nativeClicks.push(id));
            return el;
          };
          const cardItem = (id, name, symbol, cost) => {
            const el = document.createElement("div");
            el.className = "LabyrinthPanel_item_fixture";
            el.dataset.cardId = id;
            el.innerHTML = `<div class="LabyrinthPanel_name_fixture">${name}</div><div class="LabyrinthPanel_iconContainer_fixture"><svg><use href="#${symbol}"/></svg></div><div class="LabyrinthPanel_price_fixture">${cost}<svg><use href="#labyrinth_token"/></svg></div>`;
            el.addEventListener("click", () => window.nativeClicks.push(id));
            return el;
          };

          const shop = document.createElement("div");
          shop.className = "LabyrinthPanel_labyrinthShopTab_fixture";
          const grid = document.createElement("div");
          grid.className = "LabyrinthPanel_buyableGrid_fixture";
          const upLabel = document.createElement("div");
          upLabel.className = "LabyrinthPanel_label_fixture";
          upLabel.textContent = "升级";
          const itemLabel = document.createElement("div");
          itemLabel.className = "LabyrinthPanel_label_fixture";
          itemLabel.textContent = "物品";
          grid.append(
            upLabel,
            cardUpgrade(
              "/labyrinth_upgrades/skilling_success",
              "生活成功率",
              "labyrinth_skilling_success",
              sLv,
              12,
              40
            ),
            cardUpgrade("/labyrinth_upgrades/cast_speed", "施法速度", "labyrinth_cast_speed", cLv, 12, 40),
            cardUpgrade("/labyrinth_upgrades/critical_rate", "暴击率", "labyrinth_critical_rate", crLv, 12, 40),
            cardUpgrade("/labyrinth_upgrades/attack_speed", "攻击速度", "labyrinth_attack_speed", aLv, 12, 40),
            itemLabel,
            cardItem("/labyrinth_shop_items/processing_scroll", "加工卷轴", "processing_scroll", 30),
            cardItem("/labyrinth_shop_items/shard", "5 精炼碎片", "labyrinth_shard", 25),
            cardItem("/labyrinth_shop_items/coin_crate", "金币宝箱", "non_token_crate", 100)
          );
          shop.append(grid);
          body.replaceChildren(shop);
        };

        window.renderShopDom();

        const timers = [];
        const controller = new AbortController();
        window.ctx = {
          destroyed: false,
          getGameState: () => window.state,
          getInitClientData: () => window.init,
          getItemDetailByHrid: (_s, _i, id) =>
            ({ "/items/processing_scroll": { name: "加工卷轴" }, "/items/labyrinth_shard": { name: "精炼碎片" } })[
              id
            ] || { name: id },
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
        window.updateCount = 0;
        const createView = window.MwiLabyrinthTokenView.create;
        window.MwiLabyrinthTokenView.create = (...args) => {
          const view = createView(...args);
          return {
            ...view,
            update(data) {
              window.tokenSaving = !data.loaded || data.saving;
              window.updateCount++;
              view.update(data);
            }
          };
        };
        window.stop = () => {
          window.ctx.destroyed = true;
          timers.forEach(clearInterval);
          controller.abort();
          window.ctx.stopTokens();
          window.ctx.restoreProgressHook();
        };
        window.ctx.startTokens();
      });
      await page.locator("#mwi-labyrinth-calc-tokens").waitFor({ state: "visible" });
      await page.waitForFunction(() => window.tokenSaving === false);
    }

    await boot();

    // 1. 无旧独立页签与无废话空状态
    assert.equal(await page.locator("#mwi-labyrinth-token-tab, #mwi-labyrinth-sidebar-tokens-tab").count(), 0);
    const emptyText = await page.locator("#mwi-labyrinth-calc-tokens").innerText();
    assert.doesNotMatch(emptyText, /暂无计划|正在保存|拖动手柄|导出|复制|商店目录|购物车|开始选择/);
    assert.equal(await page.locator(".mwi-labyrinth-calc-token-list").isVisible(), false);
    const budget = page.locator("[data-token-budget]");
    const total = page.locator("[data-token-total]");
    const remaining = page.locator("[data-token-remaining]");
    assert.equal(await budget.inputValue(), "");
    assert.equal(await budget.getAttribute("placeholder"), "800");
    assert.equal(await total.textContent(), "0");
    assert.equal(await remaining.textContent(), "800");
    if (width === 1440) {
      await page.screenshot({ path: path.join(output, "empty-1440.png"), fullPage: true });
    }

    // 2. 满级、未知等级、非代币物品处理
    const card = (id) => page.locator(`[data-card-id="${id}"]`);
    assert.equal(await card("/labyrinth_upgrades/critical_rate").locator(".mwi-labyrinth-calc-token-ctrl").count(), 0);
    assert.equal(await card("/labyrinth_shop_items/coin_crate").locator(".mwi-labyrinth-calc-token-ctrl").count(), 0);
    assert.equal(
      await card("/labyrinth_upgrades/attack_speed").locator('[data-token-action="inc"]').isDisabled(),
      true
    );

    // 3. 连点 + 原位不漂移，逐级计价，且 0 次误触发原生卡片购买
    const incSuccess = card("/labyrinth_upgrades/skilling_success").locator('[data-token-action="inc"]');
    const beforeBox = await incSuccess.boundingBox();
    await incSuccess.click();
    const afterBox = await incSuccess.boundingBox();
    assert.ok(Math.abs(beforeBox.x - afterBox.x) < 1 && Math.abs(beforeBox.y - afterBox.y) < 1);
    await incSuccess.click();
    assert.equal(await total.textContent(), "440");
    assert.equal(await remaining.textContent(), "360");
    assert.equal(await card("/labyrinth_upgrades/skilling_success").locator("[data-token-qty]").inputValue(), "2");

    // 直接修改兑换物品数量并支持加减
    await card("/labyrinth_shop_items/processing_scroll").locator('[data-token-action="inc"]').click();
    await card("/labyrinth_shop_items/processing_scroll").locator('[data-token-action="inc"]').click();
    const shardInc = card("/labyrinth_shop_items/shard").locator('[data-token-action="inc"]');
    await shardInc.click();
    const shardInput = card("/labyrinth_shop_items/shard").locator("[data-token-qty]");
    await shardInput.fill("3");
    await shardInput.press("Enter");

    assert.equal(await total.textContent(), "575");
    assert.equal(await remaining.textContent(), "225");
    assert.deepEqual(await page.evaluate(() => window.nativeClicks), []);

    // 点击卡片原生主体仍正常触发游戏购买，点控制容器空白不触发
    await card("/labyrinth_upgrades/cast_speed").locator(".LabyrinthPanel_iconContainer_fixture").click();
    assert.deepEqual(await page.evaluate(() => window.nativeClicks), ["/labyrinth_upgrades/cast_speed"]);

    // 几何不越界检查（卡片控件完全在卡片内部，且不压到图标主体与价格）
    const geometry = await page.evaluate(() => {
      const issues = [];
      for (const ctrl of document.querySelectorAll(".mwi-labyrinth-calc-token-ctrl")) {
        const host = ctrl.parentElement.getBoundingClientRect();
        const box = ctrl.getBoundingClientRect();
        if (box.left < host.left || box.right > host.right || box.top < host.top || box.bottom > host.bottom) {
          issues.push(`out-of-card:${ctrl.dataset.id}`);
        }
        const icon = ctrl.parentElement
          .querySelector(".LabyrinthPanel_iconContainer_fixture svg")
          .getBoundingClientRect();
        const price = ctrl.parentElement.querySelector(".LabyrinthPanel_price_fixture")?.getBoundingClientRect();
        const overlap = (a, b) => b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        if (overlap(box, icon)) issues.push(`overlap-icon:${ctrl.dataset.id}`);
        if (overlap(box, price)) issues.push(`overlap-price:${ctrl.dataset.id}`);
      }
      return issues;
    });
    assert.deepEqual(geometry, []);

    // 4. 预算：留空跟随余额、手动填写、显式 0 与红色负数超支
    await page.evaluate(() => {
      window.state.characterItemMap.get("tokens").count = 500;
      window.ctx.refreshTokens();
    });
    assert.equal(await remaining.textContent(), "-75");
    assert.equal(await page.locator("[data-token-remaining-box]").getAttribute("data-state"), "over");

    for (const [val, expectedRemaining] of [
      ["1000", "425"],
      ["0", "-575"],
      ["", "-75"]
    ]) {
      await budget.fill(val);
      await budget.press("Tab");
      assert.equal(await remaining.textContent(), expectedRemaining);
    }

    await budget.fill("1000");
    await budget.press("Tab");
    await page.waitForFunction(() => window.tokenSaving === false);
    await page.evaluate(() => {
      document.activeElement?.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({ path: path.join(output, `shop-${width}.png`), fullPage: true });

    // 5. 定位闪烁、清空与撤销、收入保留
    await page.locator('.mwi-labyrinth-calc-token-locate[data-id="/labyrinth_upgrades/skilling_success"]').click();
    assert.equal(
      await card("/labyrinth_upgrades/skilling_success").getAttribute("data-mwi-labyrinth-token-flash"),
      "true"
    );

    await page.locator('[data-token-action="clear"]').click();
    assert.equal(await page.locator(".mwi-labyrinth-calc-token-chip").count(), 0);
    assert.equal(await page.locator('[data-token-action="undo"]').isVisible(), true);
    await page.locator('[data-token-action="undo"]').click();
    assert.equal(await page.locator(".mwi-labyrinth-calc-token-chip").count(), 3);
    assert.equal(await total.textContent(), "575");

    // 6. 真实游戏升级同步：升到 5 级费用减为 240，升到 6 级回到未选态，再点 + 升到 7 级不报错
    await page.evaluate(() => {
      window.state.characterInfo.labyrinthSkillingSuccessLevel = 5;
      window.ctx.refreshTokens();
    });
    assert.equal(await card("/labyrinth_upgrades/skilling_success").locator("[data-token-qty]").inputValue(), "1");
    assert.equal(await total.textContent(), "375");
    await page.evaluate(() => {
      window.state.characterInfo.labyrinthSkillingSuccessLevel = 6;
      window.ctx.refreshTokens();
    });
    assert.equal(
      await card("/labyrinth_upgrades/skilling_success")
        .locator(".mwi-labyrinth-calc-token-ctrl")
        .getAttribute("data-planned"),
      "false"
    );
    await incSuccess.click();
    assert.equal(await card("/labyrinth_upgrades/skilling_success").locator("[data-token-qty]").inputValue(), "1");
    assert.equal(
      await page
        .locator(
          '.mwi-labyrinth-calc-token-chip[data-id="/labyrinth_upgrades/skilling_success"] .mwi-labyrinth-calc-token-qty'
        )
        .textContent(),
      "6→7"
    );

    // 7. IndexedDB 持久化与并发收入恢复
    await page.waitForFunction(() => window.tokenSaving === false);
    await page.evaluate(() => window.stop());
    await boot();
    assert.equal(await page.locator(".mwi-labyrinth-calc-token-chip").count(), 3);
    assert.equal(await budget.inputValue(), "1000");
    await page.evaluate(async () => {
      const a = window.MwiLabyrinthTokenStore.create();
      const b = window.MwiLabyrinthTokenStore.create();
      const rec = window.MwiLabyrinthTokens.observation(window.state);
      await Promise.all([a.observe({ ...rec, tokens: 130 }), b.observe({ ...rec, tokens: 125 })]);
      const profile = await a.load("42");
      if (profile.runs.find((r) => r.startedAt === rec.startedAt).tokens !== 130) throw new Error("并发收入丢失");
      a.close();
      b.close();
    });

    // 8. 保存失败保留输入并重试，以及非法预算拒绝
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
    await page.waitForFunction(
      () => document.querySelector(".mwi-labyrinth-calc-token-error")?.textContent === "未保存"
    );
    assert.equal(await budget.inputValue(), "50");
    await page.evaluate(() => {
      window.failWrites = false;
    });
    await page.locator('[data-token-action="retry"]').click();
    await page.waitForFunction(() => window.tokenSaving === false);
    assert.equal(await page.locator(".mwi-labyrinth-calc-token-error").isVisible(), false);

    await budget.fill("-1");
    await budget.press("Tab");
    assert.equal(await page.locator(".mwi-labyrinth-calc-token-error").isVisible(), true);
    await budget.fill("50");
    await budget.press("Tab");
    assert.equal(await page.locator(".mwi-labyrinth-calc-token-error").isVisible(), false);

    // 9. 切离商店再切回（DOM 重建）、目录按需缓存与稳态无持续更新
    const catalogAudit = await page.evaluate(async () => {
      document.getElementById("tab-body").replaceChildren(document.createElement("div"));
      window.ctx.refreshTokens();
      let catalogs = 0;
      const model = window.MwiLabyrinthTokens;
      const original = model.catalog;
      model.catalog = (...args) => {
        catalogs++;
        return original(...args);
      };
      for (let i = 0; i < 10; i++) window.ctx.refreshTokens();
      const closed = catalogs;
      window.renderShopDom();
      window.ctx.refreshTokens();
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
      const warm = catalogs;
      for (let i = 0; i < 10; i++) window.ctx.refreshTokens();
      const repeated = catalogs - warm;
      model.catalog = original;
      return { closed, repeated };
    });
    assert.equal(catalogAudit.closed, 0);
    assert.equal(catalogAudit.repeated, 0);
    await page.locator("#mwi-labyrinth-calc-tokens").waitFor({ state: "visible" });
    assert.equal(await page.locator(".mwi-labyrinth-calc-token-ctrl").count(), 5);
    await page.waitForTimeout(150);
    const stableBefore = await page.evaluate(() => window.updateCount);
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => window.updateCount), stableBefore);

    // 10. 账号切换、无账号隐藏、窄屏无横向溢出、销毁完全恢复
    await page.evaluate(() => {
      window.state = null;
      window.ctx.refreshTokens();
    });
    assert.equal(await page.locator("#mwi-labyrinth-calc-tokens, .mwi-labyrinth-calc-token-ctrl").count(), 0);
    await page.evaluate(() => {
      window.state = { character: { id: 99 }, characterInfo: {}, characterItemMap: new Map() };
      window.ctx.refreshTokens();
    });
    await page.locator("#mwi-labyrinth-calc-tokens").waitFor({ state: "visible" });
    await page.waitForFunction(() => window.tokenSaving === false);
    assert.equal(await page.locator(".mwi-labyrinth-calc-token-chip").count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

    await page.evaluate(() => window.stop());
    assert.equal(
      await page
        .locator("#mwi-labyrinth-calc-tokens, #mwi-labyrinth-calc-tokens-style, .mwi-labyrinth-calc-token-ctrl")
        .count(),
      0
    );
    assert.equal(await page.locator("[data-mwi-labyrinth-token-planned], [data-mwi-labyrinth-token-flash]").count(), 0);
    assert.deepEqual(errors, []);

    fs.writeFileSync(
      path.join(output, `result-${width}.json`),
      JSON.stringify({ width, passed: true, pageErrors: errors, checkedAt: new Date().toISOString() }, null, 2)
    );
    await context.close();
    console.log(
      `通过 ${width}px：原商店图标小按钮、点击隔离、加减与逐级计价、预算与超支、撤销、持久化重试、DOM重挂、无持续更新与销毁恢复。`
    );
  }
} finally {
  await browser.close();
}
