// Adapted from 迷宫胜率计算器 1.6.0, dakonglong, MIT. See docs/THIRD_PARTY.md.
(function (root) {
  "use strict";
  root.MwiLabyrinthCalculatorModules ||= {};
  root.MwiLabyrinthCalculatorModules["controls"] = function (ctx) {
    ctx.createControlPanel = function createControlPanel() {
      ctx.restoreRoomDistributionSetting();
      let root = ctx.getControlPanel();
      if (root && root.getAttribute(ctx.CONTROL_SCHEMA_ATTR) !== ctx.CONTROL_SCHEMA_VERSION) {
        root.remove();
        root = null;
      }
      if (root) {
        const settingsLabel = root.querySelector(`.${ctx.CONTROL_CLASS}__settings-label`);
        if (settingsLabel) {
          settingsLabel.textContent = ctx.t("combatTrials");
        }
        const logToggle = root.querySelector(`.${ctx.CONTROL_LOG_TOGGLE_CLASS}`);
        if (logToggle) {
          logToggle.textContent = ctx.t("roomLog");
        }
        const distributionLabel = root.querySelector(`.${ctx.CONTROL_DISTRIBUTION_TOGGLE_CLASS} span`);
        if (distributionLabel) {
          distributionLabel.textContent = ctx.t("roomDistribution");
        }
        const text = root.querySelector(`.${ctx.CONTROL_CLASS}__text`);
        if (text && !String(text.textContent || "").trim()) {
          text.textContent = ctx.t("pending");
        }
        ctx.bindControlPanelInteractions(root);
        ctx.syncRoomDistributionToggleState();
        ctx.refreshRoomLogPanelIfVisible();
        return root;
      }
      root = document.createElement("div");
      root.id = ctx.CONTROL_ID;
      root.className = ctx.CONTROL_CLASS;
      root.setAttribute(ctx.CONTROL_SCHEMA_ATTR, ctx.CONTROL_SCHEMA_VERSION);
      root.innerHTML = `
<button type="button" class="${ctx.CONTROL_CLASS}__button">${ctx.t("calcMaze")}</button>
<button type="button" class="${ctx.CONTROL_LOG_TOGGLE_CLASS}">${ctx.t("roomLog")}</button>
<label class="${ctx.CONTROL_DISTRIBUTION_TOGGLE_CLASS}">
  <input type="checkbox" />
  <span>${ctx.t("roomDistribution")}</span>
</label>
<div class="${ctx.CONTROL_CLASS}__settings">
  <span class="${ctx.CONTROL_CLASS}__settings-label">${ctx.t("combatTrials")}</span>
  <input type="number" class="${ctx.CONTROL_CLASS}__settings-input" min="${ctx.MIN_COMBAT_SIM_TRIALS}" max="${ctx.MAX_COMBAT_SIM_TRIALS}" step="1" value="${ctx.DEFAULT_COMBAT_SIM_TRIALS}" inputmode="numeric" />
  <span class="${ctx.CONTROL_CLASS}__settings-unit">场</span>
</div>
<div class="${ctx.CONTROL_CLASS}__progress" hidden>
  <div class="${ctx.CONTROL_CLASS}__track"><div class="${ctx.CONTROL_CLASS}__bar"></div></div>
  <div class="${ctx.CONTROL_CLASS}__text">${ctx.t("pending")}</div>
</div>
`;
      ctx.bindControlPanelInteractions(root);
      ctx.syncRoomDistributionToggleState();
      ctx.refreshRoomLogPanelIfVisible();
      return root;
    };

    ctx.bindControlPanelInteractions = function bindControlPanelInteractions(root) {
      if (!root || root[ctx.CONTROL_BOUND_FLAG]) {
        return;
      }

      const button = root.querySelector(`.${ctx.CONTROL_CLASS}__button`);
      if (button) {
        ctx.listen(
          button,
          "click",
          (event) => {
            if (event) {
              event.preventDefault();
              if (typeof event.stopImmediatePropagation === "function") {
                event.stopImmediatePropagation();
              }
              event.stopPropagation();
            }
            ctx.runManualUpdate();
          },
          true
        );
      }

      const logToggle = root.querySelector(`.${ctx.CONTROL_LOG_TOGGLE_CLASS}`);
      if (logToggle) {
        ctx.listen(
          logToggle,
          "click",
          (event) => {
            if (event) {
              event.preventDefault();
              if (typeof event.stopImmediatePropagation === "function") {
                event.stopImmediatePropagation();
              }
              event.stopPropagation();
            }
            ctx.setRoomLogPanelOpen(!ctx.isRoomLogPanelOpen());
          },
          true
        );
      }

      const distributionCheckbox = root.querySelector(
        `.${ctx.CONTROL_DISTRIBUTION_TOGGLE_CLASS} input[type="checkbox"]`
      );
      if (distributionCheckbox) {
        distributionCheckbox.checked = ctx.roomDistributionEnabled;
        ctx.listen(
          distributionCheckbox,
          "change",
          (event) => {
            if (event && typeof event.stopImmediatePropagation === "function") {
              event.stopImmediatePropagation();
            }
            ctx.setRoomDistributionEnabled(distributionCheckbox.checked);
          },
          true
        );
      }

      const trialsInput = root.querySelector(`.${ctx.CONTROL_CLASS}__settings-input`);
      if (trialsInput) {
        const initialTrials = ctx.loadCombatSimTrialsSetting();
        trialsInput.value = String(initialTrials);
        const syncTrials = (finalize = false) => {
          const raw = String(trialsInput.value ?? "").trim();
          if (!raw) {
            if (finalize) {
              const fallback = ctx.saveCombatSimTrialsSetting(ctx.DEFAULT_COMBAT_SIM_TRIALS);
              trialsInput.value = String(fallback);
            }
            return;
          }

          const parsed = Number(raw);
          if (!Number.isFinite(parsed)) {
            if (finalize) {
              const fallback = ctx.saveCombatSimTrialsSetting(ctx.DEFAULT_COMBAT_SIM_TRIALS);
              trialsInput.value = String(fallback);
            }
            return;
          }

          const normalized = ctx.saveCombatSimTrialsSetting(parsed);
          if (finalize || /^\d+$/.test(raw)) {
            trialsInput.value = String(normalized);
          }
        };
        ctx.listen(
          trialsInput,
          "input",
          (event) => {
            if (event && typeof event.stopImmediatePropagation === "function") {
              event.stopImmediatePropagation();
            }
            syncTrials(false);
          },
          true
        );
        ctx.listen(
          trialsInput,
          "change",
          (event) => {
            if (event && typeof event.stopImmediatePropagation === "function") {
              event.stopImmediatePropagation();
            }
            syncTrials(true);
          },
          true
        );
        ctx.listen(
          trialsInput,
          "blur",
          (event) => {
            if (event && typeof event.stopImmediatePropagation === "function") {
              event.stopImmediatePropagation();
            }
            syncTrials(true);
          },
          true
        );
      }

      root[ctx.CONTROL_BOUND_FLAG] = true;
    };

    ctx.findLongestPathControlHost = function findLongestPathControlHost(gridParent) {
      if (!gridParent) {
        return null;
      }
      const searchRoot =
        gridParent.closest('div[class*="LabyrinthPanel_activeRun"]') || gridParent.parentElement || gridParent;
      let marker = null;

      const xpathQueries = [
        ".//*[contains(normalize-space(text()), '最长路径')]",
        ".//*[contains(translate(normalize-space(text()), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'longest path')]"
      ];
      for (const xpath of xpathQueries) {
        const snapshot = document.evaluate(xpath, searchRoot, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        for (let i = 0; i < snapshot.snapshotLength; i += 1) {
          const node = snapshot.snapshotItem(i);
          if (!node) {
            continue;
          }
          const text = String(node.textContent || "").trim();
          if (!text || text.length > 96) {
            continue;
          }
          marker = node;
          break;
        }
        if (marker) {
          break;
        }
      }

      if (!marker) {
        const nodes = Array.from(searchRoot.querySelectorAll("div, span, p, strong"));
        marker = nodes.find((node) => {
          if (node.childElementCount > 0) {
            return false;
          }
          const text = String(node.textContent || "")
            .replace(/\s+/g, "")
            .toLowerCase();
          return text.includes("最长路径") || text.includes("longestpath");
        });
      }
      if (!marker) {
        return null;
      }

      let host = marker.parentElement;
      for (let depth = 0; depth < 4 && host; depth += 1) {
        const display = getComputedStyle(host).display;
        if (display.includes("flex")) {
          return host;
        }
        host = host.parentElement;
      }
      return marker.parentElement;
    };

    ctx.ensureControlPanel = function ensureControlPanel(gridParent) {
      if (!gridParent) {
        return ctx.getControlPanel();
      }
      const root = ctx.createControlPanel();
      const inlineHost = ctx.findLongestPathControlHost(gridParent);

      if (inlineHost) {
        root.classList.add(`${ctx.CONTROL_CLASS}--inline`);
        root.classList.remove(`${ctx.CONTROL_CLASS}--block`);
        if (root.parentElement !== inlineHost) {
          inlineHost.appendChild(root);
        }
        return root;
      }

      const gridContainer = gridParent.parentElement || gridParent;
      const host = gridContainer.parentElement || gridContainer;
      const anchor = gridContainer;
      if (!host) {
        return ctx.getControlPanel();
      }
      root.classList.add(`${ctx.CONTROL_CLASS}--block`);
      root.classList.remove(`${ctx.CONTROL_CLASS}--inline`);
      if (root.parentElement !== host || root.nextElementSibling !== anchor) {
        host.insertBefore(root, anchor);
      }
      return root;
    };

    ctx.setControlStatus = function setControlStatus(status) {
      const root = ctx.getControlPanel();
      if (!root) {
        return;
      }
      const button = root.querySelector(`.${ctx.CONTROL_CLASS}__button`);
      const logToggle = root.querySelector(`.${ctx.CONTROL_LOG_TOGGLE_CLASS}`);
      const distributionCheckbox = root.querySelector(
        `.${ctx.CONTROL_DISTRIBUTION_TOGGLE_CLASS} input[type="checkbox"]`
      );
      const bar = root.querySelector(`.${ctx.CONTROL_CLASS}__bar`);
      const text = root.querySelector(`.${ctx.CONTROL_CLASS}__text`);
      if (button && Object.prototype.hasOwnProperty.call(status, "running")) {
        const running = Boolean(status.running);
        button.disabled = running;
        button.textContent = running ? ctx.t("calculating") : ctx.t("calcMaze");
        if (logToggle) {
          logToggle.disabled = running;
        }
        if (distributionCheckbox) {
          distributionCheckbox.disabled = running;
        }
      }
      if (bar && Object.prototype.hasOwnProperty.call(status, "ratio")) {
        const ratio = ctx.clamp01(ctx.finiteNumber(status.ratio, 0));
        bar.style.width = `${(ratio * 100).toFixed(1)}%`;
      }
      if (text && typeof status.message === "string") {
        text.textContent = status.message;
        text.style.display = status.error ? "block" : "";
      }
    };

    ctx.nextFrame = function nextFrame() {
      return new Promise((resolve) => {
        // Animation frames pause in hidden tabs; a timer yields without stranding a calculation.
        ctx.window.setTimeout(resolve, 0);
      });
    };

    ctx.createProgressTracker = function createProgressTracker(totalUnits) {
      const safeTotal = Math.max(1, Math.floor(ctx.finiteNumber(totalUnits, 1)));
      let completed = 0;

      function update(message) {
        const ratio = ctx.clamp01(completed / safeTotal);
        const percent = Math.round(ratio * 100);
        const msg = message || ctx.t("progressFmt", { percent });
        ctx.setControlStatus({
          running: true,
          ratio,
          message: msg
        });
      }

      update(ctx.t("preparing"));

      return {
        add(units = 1, message) {
          const value = Math.max(0, Math.floor(ctx.finiteNumber(units, 0)));
          completed = Math.min(safeTotal, completed + value);
          update(message);
        },
        finish(message) {
          completed = safeTotal;
          update(message || ctx.t("calcDone"));
        }
      };
    };
  };
})(globalThis);
