/* global document, window */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { ROOT } from "./project.mjs";
const output = path.join(ROOT, ".workbench/automation-layout");
fs.mkdirSync(output, { recursive: true });
const nativeCss = fs.readFileSync(path.join(ROOT, "tools/harness/automation-native.css"), "utf8");
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
try {
  for (const width of [390, 900, 1440])
    for (const locale of ["zh", "en"]) {
      const page = await browser.newPage({ viewport: { width, height: 1100 } });
      await page.route("**/*", (route) => route.abort());
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.setContent(
        `<style>:root{--spacing-xs:4px;--spacing-xs-plus:6px;--button-height-small:24px;--button-min-width-small:26px;--button-padding-x-small:6px;--font-size-base:16px;--font-size-sm:14px;--font-weight-semibold:600;--font-weight-medium:500;--radius-sm:4px;--color-midnight-700:#232438;--color-midnight-800:#191a23;--color-primary:#465bb3;--color-text-dark-mode:#eee;--color-space-100:#dfe3fa}body{background:#121318;color:#eee;font:16px/1.5 system-ui;margin:20px}main{max-width:28rem;margin:auto}#scroller{overflow:auto}select{width:150px;font:inherit}.icon{width:28px;height:32px;flex:none;background:#465bb3}button,input,select{box-sizing:border-box}h1{font-size:18px} ${nativeCss}</style><main><h1>原生自动化表格 · 离线布局验证</h1><div class="LabyrinthPanel_labyrinthPanel__20JNz"><div class="LabyrinthPanel_tabsComponentContainer__nYNJQ"><div class="LabyrinthPanel_automationTab__TLTUz"><div id="scroller"><table class="LabyrinthPanel_automationTable__38WwV mwi-labyrinth-auto-table"><thead><tr><th>${locale === "zh" ? "房间类型" : "Room type"}</th><th>${locale === "zh" ? "配装" : "Loadout"}</th><th>${locale === "zh" ? "跳过如果高出等级" : "Skip if level above"}</th><th class="mwi-labyrinth-calc-auto-recommend-header">${locale === "zh" ? "推荐设置等级" : "Recommended level"}</th></tr></thead><tbody></tbody></table></div></div></div></div></main>`
      );
      for (const file of ["src/ui/theme.js", "src/ui/recommendation-prefill.js"])
        await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, file), "utf8") });
      await page.evaluate(
        ({ locale }) => {
          window.saved = [];
          window.MwiLabyrinthTheme.install(document);
          const names =
            locale === "zh"
              ? ["挤奶", "采摘", "伐木", "奶酪锻造", "制作", "缝纫", "烹饪", "霜冻狙击手", "独眼巨人", "宝箱怪"]
              : [
                  "Shadow Archer",
                  "Flame Hunter",
                  "Frost Sniper",
                  "Cheesesmithing",
                  "Salamander",
                  "Treant",
                  "Giant Scorpion",
                  "Giant Mantis",
                  "Cyclops",
                  "Mimic"
                ];
          const button = (text) => `<button class="Button_button__1Fe9z Button_small__3fqC7">${text}</button>`;
          names.forEach((name, id) => {
            const row = document.createElement("tr");
            row.innerHTML = `<td><div class="LabyrinthPanel_roomLabel__Sju5O"><i class="icon"></i><span>${name}</span></div></td><td><select><option>${locale === "zh" ? "远程迷宫配装" : "Ranged labyrinth"}</option></select></td><td><div class="LabyrinthPanel_skipThreshold__1qXz5"></div></td><td class="mwi-labyrinth-calc-auto-recommend-cell" data-mwi-labyrinth-calc-recommend-setting="-999" data-mwi-labyrinth-calc-auto-recommend-token="ready:${id}">-999</td>`;
            const threshold = row.querySelector('[class*="skipThreshold"]');
            let current = 27;
            const render = () => {
              threshold.innerHTML = `<span>≥ ${current}</span>${button(locale === "zh" ? "编辑" : "Edit")}`;
              threshold.querySelector("button").onclick = () => {
                threshold.innerHTML = `<div class="LabyrinthPanel_thresholdButtonContainer__35skt">${button("−")}</div><div class="LabyrinthPanel_thresholdButtonContainer__35skt">${button("+")}</div><div class="LabyrinthPanel_thresholdInputContainer__3cxLu"><div class="Input_inputContainer__22GnD Input_small__1-Eva"><input class="Input_input__2-t98" type="number" value="${current}"></div></div>${button(locale === "zh" ? "保存" : "Save")}`;
                const input = threshold.querySelector("input");
                let draft = current;
                input.oninput = () => {
                  draft = Number(input.value);
                };
                const buttons = threshold.querySelectorAll("button");
                buttons[0].onclick = () => {
                  input.value = String(--draft);
                };
                buttons[1].onclick = () => {
                  input.value = String(++draft);
                };
                buttons[2].onclick = () => {
                  window.saved.push(draft);
                  current = draft;
                  render();
                };
              };
            };
            render();
            document.querySelector("tbody").append(row);
          });
          window.prefill = window.MwiLabyrinthPrefill.create({
            document,
            pageWindow: window,
            t: () => "编辑时填入推荐等级"
          });
          window.prefill.start();
        },
        { locale }
      );
      const layout = await page.locator("tbody tr").evaluateAll((nodes) =>
        nodes.map((row) => {
          const label = row.querySelector('[class*="roomLabel"]');
          const text = label.querySelector("span");
          const range = document.createRange();
          range.selectNodeContents(text);
          return {
            textLines: range.getClientRects().length,
            labelWidth: label.getBoundingClientRect().width,
            labelFits: label.scrollWidth <= label.clientWidth,
            selectWidth: row.querySelector("select").getBoundingClientRect().width,
            thresholdWidth: row.querySelector('[class*="skipThreshold"]').getBoundingClientRect().width
          };
        })
      );
      layout.forEach((row) => {
        assert.equal(row.textLines, 1, `${width} ${locale}: room name must remain on one line`);
        assert.ok(row.labelWidth >= 112 && row.labelFits, `${width} ${locale}: room name is squeezed`);
        assert.equal(row.selectWidth, 88);
        assert.equal(row.thresholdWidth, 137);
      });
      // Narrow hosts scroll the table instead of breaking room names into individual characters.
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      const rows = page.locator("tbody tr");
      const target = rows.nth(3);
      await target.locator("button").scrollIntoViewIfNeeded();
      const rectangles = () =>
        page.locator("tbody tr, tbody td").evaluateAll((nodes) =>
          nodes.map((node) => {
            const { x, y, width, height } = node.getBoundingClientRect();
            return { x, y, width, height };
          })
        );
      const before = await rectangles();
      const edit = await target.locator("button").boundingBox();
      const point = { x: edit.x + edit.width / 2, y: edit.y + edit.height / 2 };
      await page.mouse.click(point.x, point.y);
      await page.waitForFunction(() => document.querySelector("tbody tr:nth-child(4) input")?.value === "-999");
      const save = await target.locator("button").last().boundingBox();
      const inputFits = await target.locator("input").evaluate((input) => {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        const style = window.getComputedStyle(input);
        context.font = style.font;
        return (
          context.measureText(input.value).width <=
          input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
        );
      });
      assert.ok(inputFits, `${width} ${locale}: signed recommendation must fit the input`);
      const after = await rectangles();
      for (const key of ["x", "y", "width", "height"])
        assert.ok(
          Math.abs(edit[key] - save[key]) < 0.5,
          `${width} ${locale}: action ${key} moved ${edit[key]} -> ${save[key]}`
        );
      before.forEach((rect, i) => {
        for (const key of ["x", "y", "width", "height"])
          assert.ok(Math.abs(rect[key] - after[i][key]) < 0.5, `${width} ${locale}: cell ${i} ${key} moved`);
      });
      assert.deepEqual(await page.evaluate(() => window.saved), []);
      await page.screenshot({ path: path.join(output, `${locale}-${width}-editing.png`) });
      // Reuse the exact mouse position without locating or scrolling the Save button.
      await page.mouse.click(point.x, point.y);
      assert.deepEqual(await page.evaluate(() => window.saved), [-999]);
      assert.equal(await target.locator("input").count(), 0);
      assert.deepEqual(await rectangles(), before);
      await page.screenshot({ path: path.join(output, `${locale}-${width}-saved.png`) });
      // Optional calculation columns must not take space away from room names either.
      await page.evaluate(() => {
        const head = document.querySelector("thead tr");
        head.insertAdjacentHTML(
          "beforeend",
          '<th class="mwi-labyrinth-calc-auto-floor-header">最高层数</th><th class="mwi-labyrinth-calc-auto-estimate-header">胜率 / 耗时</th>'
        );
        document
          .querySelectorAll("tbody tr")
          .forEach((row) =>
            row.insertAdjacentHTML(
              "beforeend",
              '<td class="mwi-labyrinth-calc-auto-floor-cell">999</td><td class="mwi-labyrinth-calc-auto-estimate-cell">100%<br>99分59秒</td>'
            )
          );
      });
      assert.ok(
        await page.locator('[class*="roomLabel"] span').evaluateAll((nodes) =>
          nodes.every((node) => {
            const range = document.createRange();
            range.selectNodeContents(node);
            return range.getClientRects().length === 1 && node.scrollWidth <= node.clientWidth;
          })
        )
      );
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      assert.deepEqual(errors, []);
      await page.close();
      console.log(
        `通过 ${width}px ${locale}：房间名完整单行、配装和等级列收窄，所有行列尺寸稳定，编辑与保存坐标一致，同一坐标二次点击保存预填值。`
      );
    }
} finally {
  await browser.close();
}
