(function (root) {
  "use strict";
  root.MwiLabyrinthCalculatorModules.prefill = function (ctx) {
    const valueAttribute = "data-mwi-labyrinth-calc-recommend-setting";
    const storageKey = "mwi-labyrinth:prefill-enabled:v1";
    const render = ctx.upsertAutomationRecommendCellContent;
    ctx.upsertAutomationRecommendCellContent = (cell, estimate) => {
      render(cell, estimate);
      if (!cell) return;
      const setting = Number.isInteger(estimate?.levelDelta) ? estimate.levelDelta + 1 : NaN;
      if (estimate?.status === "ready" && Number.isSafeInteger(setting) && setting >= -999 && setting <= 999) {
        const value = ctx.formatAutomationSignedDelta(setting);
        if (cell.getAttribute(valueAttribute) !== value) cell.setAttribute(valueAttribute, value);
      } else cell.removeAttribute(valueAttribute);
    };
    ctx.startRecommendationPrefill = () => {
      const copy = {
        labyrinthPrefillToggle: ["编辑时填入推荐等级", "Fill recommended level when editing"],
        labyrinthPrefillHint: [
          "点击编辑时填入当前行推荐等级，保存仍需手动点击。",
          "Fill this row’s recommended level when you click Edit. Click Save yourself to apply it."
        ],
        labyrinthPrefillSaveFailed: [
          "设置仅对本次页面生效，未能保存到浏览器。",
          "This setting applies to this page only; it could not be saved in the browser."
        ]
      };
      ctx.recommendationPrefill = root.MwiLabyrinthPrefill.create({
        document,
        pageWindow: window,
        t: (key) => copy[key][ctx.isChineseUi() ? 0 : 1],
        getEnabled: () => {
          try {
            return window.localStorage.getItem(storageKey) !== "false";
          } catch {
            return true;
          }
        },
        setEnabled: (enabled) => {
          try {
            window.localStorage.setItem(storageKey, String(enabled));
            return true;
          } catch {
            return false;
          }
        }
      });
      ctx.recommendationPrefill.start();
    };
  };
})(globalThis);
