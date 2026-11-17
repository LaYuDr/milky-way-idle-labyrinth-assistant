/* global window, document */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import sources from "./runtime-sources.mjs";
import { ROOT } from "./project.mjs";
const directory = path.join(ROOT, ".workbench/preview-layout");
fs.mkdirSync(directory, { recursive: true });
const scripts = sources
  .filter((file) => file.startsWith("src/calculator/") || file.startsWith("src/vendor/") || file === "src/ui/theme.js")
  .map((file) => fs.readFileSync(path.join(ROOT, file), "utf8"))
  .join("\n");
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
try {
  for (const [width, height, language] of [
    [1440, 900, "zh"],
    [390, 844, "zh"],
    [390, 320, "zh"],
    [320, 700, "zh"],
    [800, 700, "en"]
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.route("**/*", (route) => route.abort());
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(
      '<style>body{margin:24px;background:#121318;color:#edf0fa;font:14px system-ui}#cell{width:70px;height:70px;background:#494b75;margin:30px}</style><p>生活试炼详情 · 截图数据复现</p><div id="cell">Lv.103</div>'
    );
    await page.addScriptTag({ content: scripts });
    const expected = await page.evaluate(
      ({ language }) => {
        const modules = window.MwiLabyrinthCalculatorModules,
          layout = modules["preview-layout"];
        modules["preview-layout"] = () => {};
        const legacy = window.MwiLabyrinthCalculator.create({ start: false });
        modules["preview-layout"] = layout;
        const api = window.MwiLabyrinthCalculator.create({ start: false });
        window.testApi = api;
        const ctx = api.context,
          old = legacy.context;
        for (const context of [ctx, old]) {
          context.isChineseUi = () => language === "zh";
          context.getUiLanguage = () => (language === "zh" ? context.UI_LANGUAGE_ZH : "en");
          context.getExperienceTargets = () => ({ "/skills/milking": 100000, milking: 100000 });
          context.getGameState = () => ({
            characterSkillMap: { "/skills/milking": { level: 10, experience: 750000 } }
          });
          context.getInitClientData = () => ({ levelExperienceTable: { 10: 500000, 11: 1000000 } });
        }
        window.legacyPreviewContext = old;
        ctx.ensureStyle();
        const data = {
          type: "skilling",
          skillId: "/skills/milking",
          clearChance: 0.423,
          workPower: 155.33,
          effectiveProgressPerSuccess: 155,
          successChance: 0.348,
          doubleChance: 0.07,
          attempts: 27,
          actionSeconds: 4.3,
          expectedSecondsPerClear: 264,
          experiencePerRoom: 13132,
          experiencePerHour: 179300,
          efficiencyDeltaForOneLessProgressUnit: 0.0487,
          speedDeltaForOneMoreAttempt: 0.0083,
          nextLevelClearChance: 0.457,
          efficiencyTierClearChance: 0.567,
          speedTierClearChance: 0.477,
          nextSkillingSuccessCost: 240,
          nextSkillingDoubleProgressCost: 480,
          nextSkillingSuccessClearChance: 0.44,
          nextSkillingDoubleProgressClearChance: 0.437,
          rewardPreview: {
            rows: [
              { label: ctx.t("tokenExpected"), value: "0.35" },
              { label: ctx.t("skillingBoxExpected"), value: "0.07" }
            ]
          }
        };
        window.previewData = data;
        const rows = (tip) =>
          [...tip.querySelectorAll(".mwi-labyrinth-calc-clear-rate-preview__row")].map((row) => [
            row.querySelector(".mwi-labyrinth-calc-clear-rate-preview__label").textContent,
            row.querySelector(".mwi-labyrinth-calc-clear-rate-preview__value").textContent
          ]);
        window.previewRows = rows;
        const baseline = rows(old.renderSkillingPreviewTooltip(data)).filter(
          ([label]) =>
            ![
              ctx.t("needEfficiencyForOneLessProgress"),
              ctx.t("needSpeedForOneMoreAction"),
              ctx.t("workPower"),
              ctx.t("successRate"),
              ctx.t("doubleProgress"),
              ctx.t("twoMinuteActions"),
              ctx.t("targetEnhancement"),
              ctx.t("actionDuration"),
              language === "zh" ? "经验效率判断" : "EXP efficiency"
            ].includes(label)
        );
        // The comparison renderer owns its own hover listeners; discard its node before testing the live instance.
        old.getPreviewTooltip().remove();
        ctx.setCellSkillingPreview(document.querySelector("#cell"), data);
        return baseline;
      },
      { language }
    );
    await page.locator("#cell").hover();
    const tip = page.locator("#mwi-labyrinth-calc-clear-rate-preview");
    await tip.waitFor({ state: "visible" });
    if (width === 1440) {
      const stacking = await tip.evaluate((el) => {
        const reference = document.createElement("div");
        reference.id = "mwi-lab-clear-rate-preview";
        const { left, top } = el.getBoundingClientRect();
        // Match the standalone calculator v1.6.0 layer. Enable hit testing for both previews to inspect their order.
        reference.style.cssText = `position:fixed;z-index:2147483646;left:${left}px;top:${top}px;width:140px;height:80px;`;
        const pointerEvents = el.style.pointerEvents;
        el.style.pointerEvents = "auto";
        try {
          const layersAtOverlap = () =>
            document.elementsFromPoint(left + 12, top + 12).filter((node) => node === el || node === reference);
          el.before(reference);
          const insertedBefore = layersAtOverlap();
          el.after(reference);
          const insertedAfter = layersAtOverlap();
          return [insertedBefore, insertedAfter].map((layers) => layers.map((node) => node.id));
        } finally {
          el.style.pointerEvents = pointerEvents;
          reference.remove();
        }
      });
      const expectedLayers = ["mwi-labyrinth-calc-clear-rate-preview", "mwi-lab-clear-rate-preview"];
      assert.deepEqual(stacking, [expectedLayers, expectedLayers], "两种插入顺序下，迷宫助手的预览都应显示在上层");
    }
    const actual = await tip.evaluate((el) => window.previewRows(el));
    const sharedStructure = await tip.evaluate((el) => ({
      width: el.getBoundingClientRect().width,
      summary: [...el.querySelectorAll(".mwi-labyrinth-calc-preview-summary [class$='__label']")].map(
        (x) => x.textContent
      ),
      yieldLabels: [...el.querySelectorAll(".mwi-labyrinth-calc-preview-yield [class$='__label']")].map(
        (x) => x.textContent
      ),
      topGroups: [...el.querySelector(".mwi-labyrinth-calc-preview-body").children]
        .slice(0, 3)
        .map((x) => x.firstElementChild.className)
    }));
    assert.deepEqual(
      sharedStructure.summary,
      await page.evaluate(() => [
        window.testApi.context.isChineseUi() ? "通关胜率" : "Clear chance",
        window.testApi.context.t("experiencePerHour")
      ])
    );
    assert.equal(sharedStructure.yieldLabels.length, 1);
    assert.equal(actual.length, 12);
    assert.deepEqual(
      await tip.locator(".mwi-labyrinth-calc-preview-requirement").allTextContents(),
      language === "zh"
        ? ["2.5 小时", "+4.87%", "+0.83%", "240 代币", "480 代币"]
        : ["2.5 h", "+4.87%", "+0.83%", "240 tokens", "480 tokens"]
    );
    assert.ok(!(await tip.locator("h4").allTextContents()).some((title) => /下一档门槛|Next thresholds/.test(title)));
    const aligned = await tip.locator(".mwi-labyrinth-calc-preview-upgrade").evaluateAll((rows) =>
      rows.every((row) => {
        const children = [...row.children].map((el) => el.getBoundingClientRect());
        return children.length === 4 && children.every((rect, i) => i === 0 || rect.x >= children[i - 1].right - 0.5);
      })
    );
    assert.ok(aligned, "项目、门槛花费、胜率、变化四列不能重叠");
    assert.ok(
      actual.some(([label, value]) => ["期望通关时长", "Expected clear time"].includes(label) && value === "264s")
    );
    assert.deepEqual(
      actual.toSorted((a, b) => a[0].localeCompare(b[0])),
      expected.toSorted((a, b) => a[0].localeCompare(b[0]))
    );
    assert.deepEqual(await tip.locator(".mwi-labyrinth-calc-preview-delta").allTextContents(), [
      "+3.4",
      "+14.4",
      "+5.4",
      "+1.7",
      "+1.4"
    ]);
    assert.equal(await tip.locator("[hidden]").count(), 0);
    const bounds = await tip.boundingBox();
    assert.ok(
      bounds.x >= 7 && bounds.y >= 7 && bounds.x + bounds.width <= width - 7 && bounds.y + bounds.height <= height - 7
    );
    assert.equal(await tip.evaluate((el) => el.scrollWidth <= el.clientWidth), true);
    if (width === 1440) {
      assert.ok(bounds.width <= 320, "四列详情始终保持 320px 紧凑宽度");
      assert.ok(bounds.height <= 470, "门槛移入升级表后的紧凑详情高度不超过 470px");
    }
    await page.screenshot({ path: path.join(directory, `${language}-${width}-${height}.png`) });
    const scrollable = (await tip.getAttribute("data-scrollable")) === "true";
    if (height === 320) assert.equal(scrollable, true);
    if (scrollable) {
      await tip.hover();
      await page.waitForTimeout(220);
      assert.equal(await tip.isVisible(), true);
      await page.mouse.wheel(0, 1200);
      await page.waitForFunction(() => document.querySelector("#mwi-labyrinth-calc-clear-rate-preview").scrollTop > 0);
      await tip.focus();
      await page.keyboard.press("End");
      await page.waitForTimeout(150);
      assert.equal(await tip.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight < 2), true);
      await page.screenshot({ path: path.join(directory, `${language}-${width}-${height}-bottom.png`) });
      await tip.evaluate((el) => el.blur());
    }
    // Below-target previews add hourly experience for each independent upgrade at the far right.
    await page.evaluate(() => {
      const ctx = window.testApi.context;
      ctx.getExperienceTargets = () => ({ "/skills/milking": 200000 });
      window.upgradeData = {
        ...window.previewData,
        nextLevelClearChance: 1,
        nextLevelExperiencePerHour: 210000,
        efficiencyTierExperiencePerHour: 198000,
        speedTierExperiencePerHour: 220000,
        nextSkillingSuccessExperiencePerHour: 200000,
        nextSkillingDoubleProgressExperiencePerHour: 0
      };
      const tip = ctx.renderSkillingPreviewTooltip(window.upgradeData);
      ctx.positionPreviewTooltip(tip, 80, 100);
      tip.scrollTop = 0;
    });
    assert.ok((await tip.boundingBox()).width <= (language === "zh" ? 320 : width - 24), "详情按语言和内容收紧宽度");
    assert.deepEqual(await tip.locator(".mwi-labyrinth-calc-preview-upgrade-experience").allTextContents(), [
      "210.0 K/h",
      "198.0 K/h",
      "220.0 K/h",
      "200.0 K/h",
      "0.0 K/h"
    ]);
    assert.equal(await tip.locator('.mwi-labyrinth-calc-preview-upgrade-experience[data-tone="good"]').count(), 2);
    assert.ok(await tip.evaluate((el) => el.scrollWidth <= el.clientWidth));
    assert.ok(
      await tip.locator(".mwi-labyrinth-calc-preview-upgrade").evaluateAll((rows) =>
        rows.every((row) => {
          const rects = [...row.children].map((el) => el.getBoundingClientRect());
          return rects.length === 5 && rects.every((r, i) => i === 0 || r.x >= rects[i - 1].right - 0.5);
        })
      )
    );
    await page.screenshot({ path: path.join(directory, `experience-${language}-${width}-${height}.png`) });
    const singleLine = await tip.locator(".mwi-labyrinth-calc-preview-upgrades span").evaluateAll((cells) =>
      cells.every((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return range.getClientRects().length === 1;
      })
    );
    assert.ok(singleLine, "升级表头、名称、数值及单位必须完整保持单行");
    const nameColumn = await tip.locator(".mwi-labyrinth-calc-preview-upgrades").evaluate((group) => {
      const labels = [...group.querySelectorAll(".mwi-labyrinth-calc-preview-upgrade > :first-child")];
      const textWidth = Math.max(
        ...labels.map((label) => {
          const range = document.createRange();
          range.selectNodeContents(label);
          return range.getBoundingClientRect().width;
        })
      );
      return { allocated: labels[0].getBoundingClientRect().width, textWidth };
    });
    assert.ok(Math.abs(nameColumn.allocated - nameColumn.textWidth) < 1, "项目列只占最长名称的宽度，不吸收浮窗余量");
    const alignment = await tip.evaluate((el) => {
      const upgrades = el.querySelector(".mwi-labyrinth-calc-preview-upgrades");
      const rows = [...upgrades.children];
      const right = upgrades.getBoundingClientRect().right;
      const groups = ["summary", "goals", "pairs"].map((name) =>
        el.querySelector(`.mwi-labyrinth-calc-preview-${name}`)
      );
      return {
        scrolls: upgrades.scrollWidth > upgrades.clientWidth,
        rightGaps: rows.map((row) => right - row.lastElementChild.getBoundingClientRect().right),
        secondColumns: groups.map((group) => (group.children[1] || group.children[0]).getBoundingClientRect().left)
      };
    });
    if (!alignment.scrolls)
      assert.ok(
        alignment.rightGaps.every((gap) => Math.abs(gap) < 1),
        "表头和每行最右列贴齐内容右边界"
      );
    if (width > 360)
      assert.ok(
        Math.max(...alignment.secondColumns) - Math.min(...alignment.secondColumns) < 1,
        "每小时经验、目标经验与每场经验的右半列对齐"
      );
    const palette = await page.evaluate(() => {
      const ctx = window.testApi.context,
        result = [];
      for (const chance of [0.017, 0.4, 0.6, 0.8, 0.95]) {
        const tip = ctx.renderSkillingPreviewTooltip({ ...window.upgradeData, clearChance: chance });
        const row = tip.querySelector("[data-chance-tone]");
        result.push([row.dataset.chanceTone, window.getComputedStyle(row.querySelector('[class$="__value"]')).color]);
      }
      ctx.getExperienceTargets = () => ({ "/skills/milking": 100000 });
      const tip = ctx.renderSkillingPreviewTooltip({
        ...window.previewData,
        clearChance: 0.017,
        successChance: 0.212,
        experiencePerHour: 7500,
        experiencePerRoom: 14527.3,
        efficiencyDeltaForOneLessProgressUnit: 0.0591,
        nextLevelClearChance: 0.022,
        efficiencyTierClearChance: 0.039,
        speedTierClearChance: 0.023,
        nextSkillingSuccessClearChance: 0.02,
        nextSkillingDoubleProgressClearChance: 0.019,
        nextSkillingSuccessCost: 160,
        nextSkillingDoubleProgressCost: 80,
        nextLevelExperiencePerHour: 9600,
        efficiencyTierExperiencePerHour: 17100,
        speedTierExperiencePerHour: 9800,
        nextSkillingSuccessExperiencePerHour: 8500,
        nextSkillingDoubleProgressExperiencePerHour: 8400
      });
      ctx.positionPreviewTooltip(tip, 80, 100);
      tip.scrollTop = 0;
      const rgb = (value) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      const luminance = (color) =>
        rgb(color)
          .map((value) => {
            const c = value / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          })
          .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
      const contrasts = [...tip.querySelectorAll('span,h4,[class$="__title"]')]
        .filter((el) => el.textContent.trim())
        .map((el) => {
          let ancestor = el;
          while (
            ancestor &&
            ["transparent", "rgba(0, 0, 0, 0)"].includes(window.getComputedStyle(ancestor).backgroundColor)
          )
            ancestor = ancestor.parentElement;
          const foreground = luminance(window.getComputedStyle(el).color),
            background = luminance(window.getComputedStyle(ancestor || tip).backgroundColor);
          return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
        });
      return {
        result,
        minimumContrast: Math.min(...contrasts),
        experience: window.getComputedStyle(tip.querySelector('[data-experience-tone] [class$="__value"]')).color
      };
    });
    assert.deepEqual(palette.result, [
      ["poor", "rgb(239, 160, 168)"],
      ["low", "rgb(239, 181, 138)"],
      ["fair", "rgb(237, 204, 140)"],
      ["good", "rgb(184, 216, 139)"],
      ["excellent", "rgb(142, 219, 197)"]
    ]);
    assert.equal(palette.experience, "rgb(237, 204, 140)");
    assert.ok(palette.minimumContrast >= 4.5, `preview text contrast ${palette.minimumContrast}`);
    assert.ok((await tip.boundingBox()).width <= (language === "zh" ? 320 : width - 24));
    if (language === "zh" && width >= 390) {
      assert.ok(
        await tip
          .locator(".mwi-labyrinth-calc-preview-upgrade > :first-child")
          .evaluateAll((labels) => labels.every((el) => el.getBoundingClientRect().height < 20)),
        "常规宽度下升级项目名称保持单行"
      );
    }
    await tip.screenshot({ path: path.join(directory, `compact-${language}-${width}-${height}.png`) });
    const levelTimes = await page.evaluate(() => {
      const ctx = window.testApi.context;
      const getTargets = ctx.getExperienceTargets,
        getState = ctx.getGameState;
      const skill = { level: 10, experience: 750000 };
      ctx.getGameState = () => ({ characterSkillMap: new Map([["/skills/milking", skill]]) });
      const read = () =>
        ctx
          .renderSkillingPreviewTooltip({ ...window.previewData, skillId: "milking" })
          .querySelector(".mwi-labyrinth-calc-preview-requirement").textContent;
      ctx.getExperienceTargets = () => ({ milking: 100000 });
      const values = [read()];
      skill.experience = 900000;
      values.push(read());
      ctx.getExperienceTargets = () => ({ milking: 200000 });
      values.push(read());
      ctx.getExperienceTargets = () => ({ milking: 0 });
      values.push(read());
      ctx.getExperienceTargets = getTargets;
      ctx.getGameState = getState;
      return values;
    });
    assert.deepEqual(
      levelTimes,
      language === "zh" ? ["2.5 小时", "1.0 小时", "30 分钟", "—"] : ["2.5 h", "1.0 h", "30 min", "—"]
    );
    const cases = await page.evaluate(() => {
      const ctx = window.testApi.context,
        counts = [];
      for (const [target, current] of [
        [200000, 200000],
        [100000, 179300],
        [undefined, 179300],
        [200000, NaN],
        [0, 0]
      ]) {
        ctx.getExperienceTargets = () => (target === undefined ? {} : { "/skills/milking": target });
        const tip = ctx.renderSkillingPreviewTooltip({ ...window.upgradeData, experiencePerHour: current });
        counts.push(tip.querySelectorAll(".mwi-labyrinth-calc-preview-upgrade-experience").length);
      }
      ctx.getExperienceTargets = () => ({ "/skills/milking": 200000 });
      const tip = ctx.renderSkillingPreviewTooltip(window.previewData);
      const missing = [...tip.querySelectorAll(".mwi-labyrinth-calc-preview-upgrade-experience")].map(
        (el) => el.textContent
      );
      ctx.getExperienceTargets = () => ({ "/skills/milking": 100000 });
      return { counts, missing };
    });
    assert.deepEqual(cases.counts, [5, 0, 0, 0, 5]);
    assert.deepEqual(cases.missing, ["—", "—", "—", "—", "—"]);
    const withoutGoal = await tip.evaluate((el) => {
      const ctx = window.testApi.context;
      const getTargets = ctx.getExperienceTargets;
      ctx.getExperienceTargets = () => ({});
      try {
        ctx.renderSkillingPreviewTooltip(window.previewData);
        const goals = el.querySelector(".mwi-labyrinth-calc-preview-goals");
        const [time, experience] = [...goals.children].map((row) => row.getBoundingClientRect());
        return {
          rows: window.previewRows(goals),
          separateYield: Boolean(el.querySelector(".mwi-labyrinth-calc-preview-life-yield")),
          aligned: Boolean(experience && experience.top === time.top && experience.left >= time.right)
        };
      } finally {
        ctx.getExperienceTargets = getTargets;
      }
    });
    assert.deepEqual(withoutGoal, {
      rows: [
        [language === "zh" ? "期望通关时长" : "Expected clear time", "264s"],
        [language === "zh" ? "每场经验" : "EXP / Room", "13132"]
      ],
      separateYield: false,
      aligned: true
    });
    // Optional/missing/zero values and enhancing retain the original fields.
    const checks = await page.evaluate(() => {
      const ctx = window.testApi.context;
      const data = {
        ...window.previewData,
        type: "enhancing",
        targetLevel: 8,
        clearChance: 0,
        nextLevelClearChance: 0,
        speedTierClearChance: null,
        nextSkillingSuccessClearChance: undefined,
        nextSkillingDoubleProgressClearChance: undefined
      };
      const tip = ctx.renderSkillingPreviewTooltip(data);
      const result = {
        text: tip.textContent,
        requirements: [...tip.querySelectorAll(".mwi-labyrinth-calc-preview-requirement")].map((el) => el.textContent),
        deltas: [...tip.querySelectorAll(".mwi-labyrinth-calc-preview-delta")].map((el) => el.textContent)
      };
      const missingCostTip = ctx.renderSkillingPreviewTooltip({
        ...window.previewData,
        nextSkillingSuccessCost: undefined,
        nextSkillingDoubleProgressCost: null
      });
      result.missingCosts = [...missingCostTip.querySelectorAll(".mwi-labyrinth-calc-preview-requirement")]
        .slice(-2)
        .map((el) => el.textContent);
      ctx.renderRewardOnlyPreviewTooltip({
        title: "Rewards",
        rewardPreview: { rows: [{ label: "Token", value: "3" }] }
      });
      result.rewardLayout = tip.dataset.layout;
      result.rewardRows = window.previewRows(tip);
      ctx.renderCombatPreviewTooltip({
        type: "combat",
        monsterName: "Combat",
        clearChance: 0.5,
        expectedSecondsPerClear: 60,
        abilities: [{ name: "Skill", level: 10 }]
      });
      result.combatLayout = tip.dataset.layout;
      result.combatText = tip.textContent;
      return result;
    });
    assert.equal(checks.requirements.length, 2);
    assert.deepEqual(checks.missingCosts, ["—", "—"]);
    assert.ok(checks.deltas.includes("0.0") && checks.deltas.includes("—"));
    assert.equal(checks.rewardLayout, undefined);
    assert.deepEqual(checks.rewardRows, [["Token", "3"]]);
    assert.equal(checks.combatLayout, "combat");
    assert.ok(checks.combatText.includes("50.0%"));
    const combat = await page.evaluate(() => {
      const ctx = window.testApi.context;
      ctx.getExperienceTargets = () => ({ siren: 110000 });
      window.legacyPreviewContext.getExperienceTargets = ctx.getExperienceTargets;
      const data = {
        type: "combat",
        monsterName: "海妖",
        monsterHrid: "/monsters/siren",
        experiencePerHour: 80000,
        combatExperience: { experiencePerHour: 80000, experiencePerRoom: 7629 },
        expectedSecondsPerClear: 85,
        clearChance: 0,
        styleLabel: ctx.t("styleMagic"),
        damageTypeLabel: ctx.t("water"),
        attackIntervalSeconds: 2.66,
        totalCastSpeed: 0.05,
        styleAccuracyLabel: ctx.getCombatStyleAccuracyLabel("/combat_styles/magic"),
        styleAccuracy: 382,
        styleDamageLabel: ctx.getCombatStyleDamageLabel("/combat_styles/magic"),
        styleDamage: 350,
        maxHitpoints: 6556,
        targetEvasionLabel: ctx.getCombatStyleEvasionLabel("/combat_styles/ranged"),
        targetEvasionRating: 350,
        targetMitigationLabel: ctx.t("armor"),
        targetMitigationValue: 238,
        abilities: [
          { level: 60, name: "元素光环" },
          { level: 89, name: "元素增幅" },
          { level: 89, name: "冰霜爆裂" },
          { level: 89, name: "法力喷泉" },
          { level: 89, name: "流水冲击" }
        ],
        rewardPreview: {
          rows: [
            { label: ctx.t("tokenExpected"), value: "0.35" },
            { label: ctx.t("combatBoxExpected"), value: "0.07" }
          ]
        },
        failureReason: ctx.t("failureDefense")
      };
      window.combatPreviewData = data;
      const baseline = window.previewRows(window.legacyPreviewContext.renderCombatPreviewTooltip(data));
      const tip = ctx.renderCombatPreviewTooltip(data);
      ctx.positionPreviewTooltip(tip, 80, 100);
      tip.scrollTop = 0;
      return { baseline, actual: window.previewRows(tip) };
    });
    assert.equal(combat.actual.length, 13);
    assert.ok(
      combat.actual.some(([label, value]) =>
        language === "zh"
          ? label === "失败原因" && value === "防御不足"
          : label === "Failure Reason" && value === "Insufficient Defense"
      )
    );
    assert.doesNotMatch(
      await tip.innerText(),
      /攻击间隔|施法速度|最大HP|护甲|Lv\.\d|Attack Interval|Cast Speed|Max HP/
    );
    assert.equal((await tip.boundingBox()).width, sharedStructure.width, "生活与战斗详情使用相同宽度");
    const firstGroups = await tip.locator(".mwi-labyrinth-calc-preview-body > section").evaluateAll((nodes) =>
      nodes.slice(0, 4).map((node) => ({
        group: node.firstElementChild.className,
        warning: node.querySelector('[data-tone="warn"]')?.textContent
      }))
    );
    assert.equal(firstGroups[1].warning, language === "zh" ? "失败原因防御不足" : "Failure ReasonInsufficient Defense");
    assert.deepEqual(
      [firstGroups[0], ...firstGroups.slice(2)].map(({ group }) => group),
      sharedStructure.topGroups.map((name) => name.replace(" mwi-labyrinth-calc-preview-life-yield", "")),
      "战斗保持原分区，生活每场经验移到右列"
    );
    assert.deepEqual(
      combat.actual.toSorted((a, b) => a[0].localeCompare(b[0])),
      combat.baseline.toSorted((a, b) => a[0].localeCompare(b[0]))
    );
    assert.equal(
      await tip.locator(".mwi-labyrinth-calc-preview-abilities .mwi-labyrinth-calc-clear-rate-preview__row").count(),
      0
    );
    assert.equal(await tip.locator("[hidden]").count(), 0);
    const combatLayout = await tip.evaluate((el) => {
      const body = el.querySelector(".mwi-labyrinth-calc-preview-body");
      const groups = [...body.querySelectorAll(".mwi-labyrinth-calc-preview-group")].filter(
        (g) => !g.classList.contains("mwi-labyrinth-calc-preview-notes")
      );
      const pairRows = (group) =>
        [...group.children].filter((row) => !row.classList.contains("mwi-labyrinth-calc-preview-weakness"));
      const texts = [...el.querySelectorAll('span,[class$="__title"]')];
      return {
        singleLine: texts.every((node) => {
          const range = document.createRange();
          range.selectNodeContents(node);
          return range.getClientRects().length === 1;
        }),
        columns: groups.map((g) => pairRows(g)[1]?.getBoundingClientRect().left).filter((x) => x !== undefined),
        rightEdges: groups
          .filter(
            (g) =>
              !g.classList.contains("mwi-labyrinth-calc-preview-abilities") &&
              !g.classList.contains("mwi-labyrinth-calc-preview-summary") &&
              g.children.length > 1
          )
          .map((g) => pairRows(g)[1]?.lastElementChild.getBoundingClientRect().right),
        right: body.getBoundingClientRect().right,
        scrolls: el.scrollWidth > el.clientWidth + 1,
        accessible: el.dataset.scrollable === "true" && el.tabIndex === 0
      };
    });
    assert.ok(combatLayout.singleLine, "战斗标题、标签和数值保持单行");
    assert.ok(Math.max(...combatLayout.columns) - Math.min(...combatLayout.columns) < 1, "战斗各分区共享右半列起点");
    assert.ok(
      combatLayout.rightEdges.every((x) => Math.abs(x - combatLayout.right) < 1),
      "战斗结果、属性和奖励的最右侧数值对齐"
    );
    if (combatLayout.scrolls) assert.ok(combatLayout.accessible, "横向溢出时可聚焦并滚动查看");
    assert.ok((await tip.boundingBox()).width <= width - 24);
    await page.screenshot({ path: path.join(directory, `combat-${language}-${width}-${height}.png`) });
    if (width === 1440) assert.ok((await tip.boundingBox()).height < 520, "完整战斗数据保持紧凑高度");
    const longCombat = await page.evaluate(() => {
      const ctx = window.testApi.context;
      const data = {
        ...window.combatPreviewData,
        monsterName: "Very long combat room name / 很长的房间名称",
        expectedSecondsPerClear: 12345,
        abilities: [{ level: 123, name: "A long ability name that stays on one line without losing any text" }],
        failureReason: ""
      };
      const baseline = window.previewRows(window.legacyPreviewContext.renderCombatPreviewTooltip(data));
      const tip = ctx.renderCombatPreviewTooltip(data);
      ctx.positionPreviewTooltip(tip, 80, 100);
      const singleLine = [...tip.querySelectorAll('span,[class$="__title"]')].every((node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return range.getClientRects().length === 1;
      });
      tip.scrollLeft = tip.scrollWidth;
      return {
        baseline,
        actual: window.previewRows(tip),
        singleLine,
        reachesEnd: Math.abs(tip.scrollWidth - tip.clientWidth - tip.scrollLeft) < 1,
        fits: tip.getBoundingClientRect().right <= window.innerWidth - 7
      };
    });
    assert.deepEqual(
      longCombat.actual.toSorted((a, b) => a[0].localeCompare(b[0])),
      longCombat.baseline.toSorted((a, b) => a[0].localeCompare(b[0]))
    );
    assert.equal(longCombat.fits, true);
    assert.ok(longCombat.singleLine && longCombat.reachesEnd, "长标题完整单行且能滚动到末尾");
    await tip.evaluate((el) => {
      el.scrollLeft = 0;
    });
    await page.evaluate(() => {
      const ctx = window.testApi.context;
      ctx.renderCombatPreviewTooltip({
        ...window.combatPreviewData,
        abilities: [],
        rewardPreview: null,
        failureReason: ""
      });
    });
    assert.equal(await tip.locator(".mwi-labyrinth-calc-preview-abilities").count(), 0);

    const hoverChecks = await page.evaluate(async () => {
      const ctx = window.testApi.context,
        cell = document.querySelector("#cell");
      const data = {
        ...window.combatPreviewData,
        monsterHrid: "/monsters/giant_scorpion",
        monsterName: "巨蝎",
        combatExperience: {
          experiencePerRoom: 7607.8,
          experiencePerHour: 342600,
          bySkill: {
            stamina: { experiencePerHour: 0 },
            magic: { experiencePerHour: 342600 },
            invalid: { experiencePerHour: NaN },
            missing: null
          }
        }
      };
      ctx.hidePreviewTooltip();
      ctx.setCellCombatPreview(cell, data);
      ctx.showSkillingPreviewTooltip(cell, { clientX: 80, clientY: 100 });
      const tooltip = ctx.getPreviewTooltip(),
        first = tooltip.firstElementChild;
      const result = {
        skills: [...tooltip.querySelectorAll("[data-combat-experience]")].map((el) => el.dataset.combatExperience),
        singleSkillSection: /技能经验|Skill EXP/.test(tooltip.textContent),
        totalExperience: tooltip.querySelector(".mwi-labyrinth-calc-preview-summary").textContent,
        weakness: tooltip.querySelector(".mwi-labyrinth-calc-preview-weakness").textContent,
        modelRemoved: !/模拟口径|Rust|Previous engine|Model/.test(tooltip.textContent),
        unknown: ctx.getMonsterWeakness("/monsters/unknown")
      };
      const position = ctx.positionPreviewTooltip,
        render = ctx.renderCellPreviewTooltip;
      let positions = 0,
        renders = 0;
      ctx.positionPreviewTooltip = (...args) => {
        positions++;
        return position(...args);
      };
      ctx.renderCellPreviewTooltip = (...args) => {
        renders++;
        return render(...args);
      };
      const frame = () =>
        new Promise((resolve) => {
          window.requestAnimationFrame(resolve);
        });
      for (let i = 0; i < 300; i++)
        cell.dispatchEvent(new window.MouseEvent("mousemove", { clientX: 80 + (i % 10), clientY: 100 }));
      await frame();
      result.moves = { positions, renders, sameNode: first === tooltip.firstElementChild };
      // Moving inside the panel must not replace its content or reset scrolling.
      for (let i = 0; i < 100; i++) tooltip.dispatchEvent(new window.MouseEvent("mousemove", { bubbles: true }));
      await frame();
      result.panelRenders = renders;
      ctx.setCellCombatPreview(cell, { ...data, monsterName: "Updated" });
      await frame();
      result.updated = tooltip.firstElementChild.textContent === "Updated" && renders === 1;
      ctx.setCellCombatPreview(cell, {
        ...data,
        combatExperience: {
          ...data.combatExperience,
          bySkill: { ...data.combatExperience.bySkill, stamina: { experiencePerHour: 1 } }
        }
      });
      await frame();
      result.multipleSkills = [...tooltip.querySelectorAll("[data-combat-experience]")].map(
        (el) => el.dataset.combatExperience
      );
      result.multipleSkillSection = /技能经验|Skill EXP/.test(tooltip.textContent);
      ctx.setCellCombatPreview(cell, {
        ...data,
        combatExperience: { ...data.combatExperience, bySkill: { magic: { experiencePerHour: 0 } } }
      });
      await frame();
      result.emptySkillSection = /技能经验|Skill EXP/.test(tooltip.textContent);
      cell.dispatchEvent(new window.MouseEvent("mousemove", { clientX: 80, clientY: 100 }));
      ctx.hidePreviewTooltip();
      await frame();
      result.staysHidden = tooltip.style.display === "none";
      ctx.positionPreviewTooltip = position;
      ctx.renderCellPreviewTooltip = render;
      ctx.setCellCombatPreview(cell, data);
      ctx.showSkillingPreviewTooltip(cell, { clientX: 80, clientY: 100 });
      return result;
    });
    assert.deepEqual(hoverChecks.skills, []);
    assert.equal(hoverChecks.singleSkillSection, false);
    assert.match(hoverChecks.totalExperience, /342\.6 K\/h/);
    assert.deepEqual(hoverChecks.multipleSkills, ["stamina", "magic"]);
    assert.equal(hoverChecks.multipleSkillSection, true);
    assert.match(hoverChecks.weakness, language === "zh" ? /水系、自然系魔法/ : /Water and nature magic/);
    assert.equal(hoverChecks.modelRemoved, true);
    assert.equal(hoverChecks.unknown, null);
    assert.deepEqual(hoverChecks.moves, { positions: 1, renders: 0, sameNode: true });
    assert.equal(hoverChecks.panelRenders, 0);
    assert.equal(hoverChecks.updated, true);
    assert.equal(hoverChecks.emptySkillSection, false);
    assert.equal(hoverChecks.staysHidden, true);
    await page.screenshot({ path: path.join(directory, `weakness-${language}-${width}-${height}.png`) });
    await page.evaluate(() => window.testApi.context.hidePreviewTooltip());

    await page.mouse.move(width - 1, height - 1);
    await page.waitForTimeout(220);
    assert.equal(await tip.isVisible(), false);
    await page.evaluate(() => window.testApi.destroy());
    assert.deepEqual(errors, []);
    await page.close();
    console.log(
      `通过 ${width}×${height} ${language}：统一详情布局、生活升级表与战斗精简字段正确，战斗分组、长技能名、空技能及预览切换正常。`
    );
  }
} finally {
  await browser.close();
}
