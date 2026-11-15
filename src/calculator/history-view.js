// Adapted from 迷宫胜率计算器 1.6.0, dakonglong, MIT. See docs/THIRD_PARTY.md.
(function (root) {
  "use strict";
  root.MwiLabyrinthCalculatorModules ||= {};
  root.MwiLabyrinthCalculatorModules["history-view"] = function (ctx) {
    ctx.getControlPanel = function getControlPanel() {
      return document.getElementById(ctx.CONTROL_ID);
    };

    ctx.getControlCombatTrialsInput = function getControlCombatTrialsInput() {
      const root = ctx.getControlPanel();
      if (!root) {
        return null;
      }
      return root.querySelector(`.${ctx.CONTROL_CLASS}__settings-input`);
    };

    ctx.getSelectedCombatSimTrials = function getSelectedCombatSimTrials() {
      const input = ctx.getControlCombatTrialsInput();
      if (!input) {
        return ctx.loadCombatSimTrialsSetting();
      }
      const normalized = ctx.normalizeCombatSimTrials(Number(input.value));
      if (input.value !== String(normalized)) {
        input.value = String(normalized);
      }
      return normalized;
    };

    ctx.loadRoomLogPanelPosition = function loadRoomLogPanelPosition() {
      const fallback = {
        left: Math.max(10, (ctx.window.innerWidth || 1280) - 360),
        top: 92
      };
      try {
        const raw = ctx.storage.getItem(ctx.ROOM_LOG_POSITION_STORAGE_KEY);
        if (!raw) {
          return fallback;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
          return fallback;
        }
        const left = Math.floor(ctx.finiteNumber(parsed.left, fallback.left));
        const top = Math.floor(ctx.finiteNumber(parsed.top, fallback.top));
        return { left, top };
      } catch (_error) {
        return fallback;
      }
    };

    ctx.saveRoomLogPanelPosition = function saveRoomLogPanelPosition(position) {
      if (!position || typeof position !== "object") {
        return;
      }
      const payload = {
        left: Math.floor(ctx.finiteNumber(position.left, 0)),
        top: Math.floor(ctx.finiteNumber(position.top, 0))
      };
      try {
        ctx.storage.setItem(ctx.ROOM_LOG_POSITION_STORAGE_KEY, JSON.stringify(payload));
      } catch (_error) {
        // Ignore storage errors.
      }
    };

    ctx.clampRoomLogPanelPosition = function clampRoomLogPanelPosition(panel, position) {
      const panelRect = panel ? panel.getBoundingClientRect() : null;
      const panelWidth = Math.max(280, Math.ceil(panelRect?.width || 340));
      const panelHeight = Math.max(180, Math.ceil(panelRect?.height || 320));
      const viewportWidth = Math.max(320, ctx.window.innerWidth || document.documentElement.clientWidth || 1280);
      const viewportHeight = Math.max(240, ctx.window.innerHeight || document.documentElement.clientHeight || 720);
      const margin = 8;
      const maxLeft = Math.max(margin, viewportWidth - panelWidth - margin);
      const maxTop = Math.max(margin, viewportHeight - panelHeight - margin);
      return {
        left: Math.min(maxLeft, Math.max(margin, Math.floor(ctx.finiteNumber(position?.left, margin)))),
        top: Math.min(maxTop, Math.max(margin, Math.floor(ctx.finiteNumber(position?.top, margin))))
      };
    };

    ctx.applyRoomLogPanelPosition = function applyRoomLogPanelPosition(panel, position, persist = false) {
      if (!panel) {
        return;
      }
      const clamped = ctx.clampRoomLogPanelPosition(panel, position);
      panel.style.left = `${clamped.left}px`;
      panel.style.top = `${clamped.top}px`;
      panel.style.right = "auto";
      if (persist) {
        ctx.saveRoomLogPanelPosition(clamped);
      }
    };

    ctx.ensureRoomLogFloatingPanel = function ensureRoomLogFloatingPanel() {
      let root = ctx.getRoomLogFloatingPanel();
      if (root) {
        return root;
      }

      root = document.createElement("div");
      root.id = ctx.ROOM_LOG_FLOAT_ID;
      root.className = ctx.ROOM_LOG_FLOAT_CLASS;
      root.setAttribute("role", "region");
      root.setAttribute("aria-label", ctx.t("roomLog"));
      root.setAttribute("hidden", "hidden");
      root.innerHTML = `
<div class="${ctx.ROOM_LOG_FLOAT_HEADER_CLASS}">
  <div class="${ctx.ROOM_LOG_FLOAT_TITLE_CLASS}">${ctx.t("roomLogTitleFmt", { count: ctx.ROOM_LOG_MAX_SESSIONS })}</div>
  <div class="${ctx.ROOM_LOG_FLOAT_ACTIONS_CLASS}">
    <button type="button" class="${ctx.ROOM_LOG_FLOAT_CLEAR_CLASS}">${ctx.t("roomLogClear")}</button>
    <button type="button" class="${ctx.ROOM_LOG_FLOAT_CLOSE_CLASS}" aria-label="${ctx.t("roomLogClose")}" title="${ctx.t("roomLogClose")}">×</button>
  </div>
</div>
<div class="${ctx.CONTROL_LOG_PANEL_CLASS}">
  <div class="${ctx.CONTROL_LOG_LIST_CLASS}"></div>
</div>
`;
      document.body.appendChild(root);

      ctx.applyRoomLogPanelPosition(root, ctx.loadRoomLogPanelPosition(), false);

      const closeButton = root.querySelector(`.${ctx.ROOM_LOG_FLOAT_CLOSE_CLASS}`);
      if (closeButton) {
        ctx.listen(closeButton, "click", (event) => {
          if (event) {
            event.preventDefault();
            event.stopPropagation();
          }
          root.setAttribute("hidden", "hidden");
        });
      }

      const clearButton = root.querySelector(`.${ctx.ROOM_LOG_FLOAT_CLEAR_CLASS}`);
      if (clearButton) {
        ctx.listen(clearButton, "click", (event) => {
          if (event) {
            event.preventDefault();
            event.stopPropagation();
          }
          ctx.clearRoomLogData();
        });
      }

      const header = root.querySelector(`.${ctx.ROOM_LOG_FLOAT_HEADER_CLASS}`);
      if (header) {
        ctx.listen(header, "pointerdown", (event) => {
          const target = event?.target;
          if (target && typeof target.closest === "function" && target.closest("button")) {
            return;
          }
          if (!(event instanceof PointerEvent) || event.button !== 0) {
            return;
          }
          event.preventDefault();
          const initialRect = root.getBoundingClientRect();
          const startX = event.clientX;
          const startY = event.clientY;
          const startLeft = initialRect.left;
          const startTop = initialRect.top;

          const onMove = (moveEvent) => {
            const nextLeft = startLeft + (moveEvent.clientX - startX);
            const nextTop = startTop + (moveEvent.clientY - startY);
            ctx.applyRoomLogPanelPosition(root, { left: nextLeft, top: nextTop }, false);
          };
          const onUp = () => {
            ctx.window.removeEventListener("pointermove", onMove);
            ctx.window.removeEventListener("pointerup", onUp);
            ctx.window.removeEventListener("pointercancel", onUp);
            const finalRect = root.getBoundingClientRect();
            ctx.applyRoomLogPanelPosition(root, { left: finalRect.left, top: finalRect.top }, true);
          };

          ctx.listen(ctx.window, "pointermove", onMove);
          ctx.listen(ctx.window, "pointerup", onUp);
          ctx.listen(ctx.window, "pointercancel", onUp);
        });
      }

      if (!ctx.ensureRoomLogFloatingPanel.__resizeBound) {
        ctx.ensureRoomLogFloatingPanel.__resizeBound = true;
        ctx.listen(ctx.window, "resize", () => {
          const panel = ctx.getRoomLogFloatingPanel();
          if (!panel || panel.hasAttribute("hidden")) {
            return;
          }
          const rect = panel.getBoundingClientRect();
          ctx.applyRoomLogPanelPosition(panel, { left: rect.left, top: rect.top }, true);
        });
      }

      return root;
    };

    ctx.isRoomLogPanelOpen = function isRoomLogPanelOpen() {
      const panel = ctx.getRoomLogFloatingPanel();
      return Boolean(panel) && !panel.hasAttribute("hidden");
    };

    ctx.setRoomLogPanelOpen = function setRoomLogPanelOpen(opening) {
      let panel = ctx.getRoomLogFloatingPanel();
      if (!panel && !opening) {
        return;
      }
      if (!panel) {
        panel = ctx.ensureRoomLogFloatingPanel();
      }
      if (!panel) {
        return;
      }
      if (opening) {
        panel.removeAttribute("hidden");
        ctx.applyRoomLogPanelPosition(panel, ctx.loadRoomLogPanelPosition(), false);
        ctx.renderRoomLogPanel();
        return;
      }
      panel.setAttribute("hidden", "hidden");
    };

    ctx.clearRoomLogData = function clearRoomLogData() {
      ctx.roomLogSessions = [];
      ctx.activeRoomLogSession = null;
      ctx.persistRoomLogStorage();
      ctx.refreshRoomLogPanelIfVisible();
    };

    ctx.formatRoomLogDurationSeconds = function formatRoomLogDurationSeconds(session) {
      if (!session || typeof session !== "object") {
        return "--";
      }
      const startedAt = Math.max(0, Math.floor(ctx.finiteNumber(session.startedAt, 0)));
      if (!startedAt) {
        return "--";
      }
      const endedAtRaw = Math.max(0, Math.floor(ctx.finiteNumber(session.endedAt, 0)));
      const endedAt = endedAtRaw > 0 ? endedAtRaw : Date.now();
      const durationMs = Math.max(0, endedAt - startedAt);
      const seconds = Math.max(0, Math.round(durationMs / 1000));
      return ctx.t("roomLogDurationFmt", { seconds });
    };

    ctx.normalizeRoomLogDisplaySkillName = function normalizeRoomLogDisplaySkillName(rawName) {
      const input = String(rawName || "").trim();
      if (!input) {
        return "--";
      }
      const cleaned = input.replace(/^(技能|skill|skilling|强化|enhancing)\s*[·.:：-]?\s*/i, "").trim();
      return cleaned || input;
    };

    ctx.getRoomLogActionOutcomeClass = function getRoomLogActionOutcomeClass(action) {
      const outcome = String(action?.outcome || ctx.ROOM_LOG_ACTION_OUTCOME_UNKNOWN);
      if (outcome === ctx.ROOM_LOG_ACTION_OUTCOME_DOUBLE) {
        return `${ctx.CONTROL_LOG_ACTION_CLASS} ${ctx.CONTROL_LOG_ACTION_CLASS}--double`;
      }
      if (outcome === ctx.ROOM_LOG_ACTION_OUTCOME_SUCCESS) {
        return `${ctx.CONTROL_LOG_ACTION_CLASS} ${ctx.CONTROL_LOG_ACTION_CLASS}--success`;
      }
      if (outcome === ctx.ROOM_LOG_ACTION_OUTCOME_FAIL) {
        return `${ctx.CONTROL_LOG_ACTION_CLASS} ${ctx.CONTROL_LOG_ACTION_CLASS}--fail`;
      }
      return `${ctx.CONTROL_LOG_ACTION_CLASS} ${ctx.CONTROL_LOG_ACTION_CLASS}--unknown`;
    };

    ctx.getRoomLogMetaText = function getRoomLogMetaText(session) {
      if (session?.mode === "combat") {
        return ctx.t("roomLogComingSoon");
      }
      const successText = ctx.formatRoomLogPercent(ctx.clamp01(ctx.finiteNumber(session?.successRate, 0)) * 100);
      const doubleText = ctx.formatRoomLogPercent(ctx.clamp01(ctx.finiteNumber(session?.doubleChance, 0)) * 100);
      const parts = [ctx.t("roomLogRateFmt", { success: successText, double: doubleText })];

      if (session?.mode === "enhancing") {
        parts.push(
          ctx.t("roomLogEnhFmt", {
            current: Math.max(0, Math.floor(ctx.finiteNumber(session?.currentEnhLevel, 0))),
            target: Math.max(0, Math.floor(ctx.finiteNumber(session?.targetLevel, 0)))
          })
        );
      } else {
        parts.push(
          ctx.t("roomLogWorkFmt", {
            value: ctx.getEffectiveSkillingProgressPerSuccess(session?.progressPerAction)
          })
        );
        parts.push(
          ctx.t("roomLogProgressFmt", {
            current: ctx.formatRoomLogPercent(Math.max(0, ctx.finiteNumber(session?.currentProgressPct, 0))),
            target: 100
          })
        );
      }
      return parts.join(" | ");
    };

    ctx.getRoomLogIncompleteText = function getRoomLogIncompleteText(session) {
      const reasons = Array.isArray(session?.incompleteReasons) ? session.incompleteReasons : [];
      if (reasons.includes("action_gap")) {
        return `${ctx.t("roomLogIncomplete")} · ${ctx.t("roomLogActionGap")}`;
      }
      return ctx.t("roomLogIncomplete");
    };

    ctx.appendRoomLogActionNodes = function appendRoomLogActionNodes(container, actions) {
      if (!container) {
        return;
      }
      const actionList = Array.isArray(actions) ? actions : [];
      if (!actionList.length) {
        const empty = document.createElement("span");
        empty.className = `${ctx.CONTROL_LOG_ACTION_CLASS} ${ctx.CONTROL_LOG_ACTION_CLASS}--unknown`;
        empty.textContent = "--";
        container.appendChild(empty);
        return;
      }

      for (let i = 0; i < actionList.length; i += 1) {
        if (i > 0) {
          const separator = document.createElement("span");
          separator.className = `${ctx.CONTROL_LOG_ITEM_CLASS}__sep`;
          separator.textContent = " - ";
          container.appendChild(separator);
        }
        const action = actionList[i];
        const node = document.createElement("span");
        node.className = ctx.getRoomLogActionOutcomeClass(action);
        node.textContent = String(action?.text || "?");
        container.appendChild(node);
      }
    };

    ctx.renderRoomLogPanel = function renderRoomLogPanel() {
      const panelRoot = ctx.ensureRoomLogFloatingPanel();
      if (!panelRoot) {
        return;
      }
      const title = panelRoot.querySelector(`.${ctx.ROOM_LOG_FLOAT_TITLE_CLASS}`);
      const clearButton = panelRoot.querySelector(`.${ctx.ROOM_LOG_FLOAT_CLEAR_CLASS}`);
      const closeButton = panelRoot.querySelector(`.${ctx.ROOM_LOG_FLOAT_CLOSE_CLASS}`);
      const list = panelRoot.querySelector(`.${ctx.CONTROL_LOG_LIST_CLASS}`);
      if (!title || !list) {
        return;
      }

      title.textContent = ctx.t("roomLogTitleFmt", { count: ctx.ROOM_LOG_MAX_SESSIONS });
      if (clearButton) {
        clearButton.textContent = ctx.t("roomLogClear");
        clearButton.title = ctx.t("roomLogClear");
        clearButton.disabled = !ctx.roomLogSessions.length;
      }
      if (closeButton) {
        closeButton.title = ctx.t("roomLogClose");
      }
      const signature = JSON.stringify([
        title.textContent,
        ctx.roomLogSessions,
        ctx.roomLogSessions.some((session) => !session.completed) ? Math.floor(Date.now() / 1000) : 0
      ]);
      if (ctx.roomLogRenderedList === list && ctx.roomLogRenderSignature === signature) return;
      ctx.roomLogRenderedList = list;
      ctx.roomLogRenderSignature = signature;
      list.textContent = "";

      if (!Array.isArray(ctx.roomLogSessions) || ctx.roomLogSessions.length === 0) {
        const empty = document.createElement("div");
        empty.className = ctx.CONTROL_LOG_META_CLASS;
        empty.textContent = ctx.t("roomLogEmpty");
        list.appendChild(empty);
        return;
      }

      const displaySessions = ctx.roomLogSessions.slice(0, ctx.ROOM_LOG_MAX_SESSIONS);
      for (const session of displaySessions) {
        const card = document.createElement("div");
        card.className = ctx.CONTROL_LOG_ITEM_CLASS;

        const header = document.createElement("div");
        header.className = `${ctx.CONTROL_LOG_ITEM_CLASS}__header`;
        const level = Math.max(0, Math.floor(ctx.finiteNumber(session?.recommendedLevel, 0)));
        const displaySkillName = ctx.normalizeRoomLogDisplaySkillName(session?.skillName);
        const nameText = level > 0 ? `${displaySkillName} Lv.${level}` : displaySkillName;
        const titleText = document.createElement("span");
        titleText.textContent = nameText;
        const timeText = document.createElement("span");
        timeText.className = `${ctx.CONTROL_LOG_ITEM_CLASS}__time`;
        const durationText = ctx.formatRoomLogDurationSeconds(session);
        if (session?.mode === "combat") {
          timeText.textContent = durationText;
        } else {
          const expText = ctx.t("roomLogExpFmt", { value: ctx.formatRoomLogExperience(session?.totalExperience) });
          timeText.textContent = `${durationText} | ${expText}`;
        }
        header.appendChild(titleText);
        header.appendChild(timeText);
        if (session?.incomplete || !session?.completed) {
          const incomplete = document.createElement("span");
          incomplete.className = ctx.CONTROL_LOG_INCOMPLETE_CLASS;
          incomplete.textContent = ctx.getRoomLogIncompleteText(session);
          header.appendChild(incomplete);
        }
        card.appendChild(header);

        const meta = document.createElement("div");
        meta.className = ctx.CONTROL_LOG_META_CLASS;
        meta.textContent = ctx.getRoomLogMetaText(session);
        const actionRow = document.createElement("div");
        actionRow.className = `${ctx.CONTROL_LOG_ITEM_CLASS}__actions`;
        ctx.appendRoomLogActionNodes(actionRow, session?.actions);
        if (session.mode !== "combat") {
          card.append(meta, actionRow);
        }

        list.appendChild(card);
      }
    };
  };
})(globalThis);
