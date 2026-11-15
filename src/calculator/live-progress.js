// Adapted from 迷宫胜率计算器 1.6.0, dakonglong, MIT. See docs/THIRD_PARTY.md.
(function (root) {
  "use strict";
  root.MwiLabyrinthCalculatorModules ||= {};
  root.MwiLabyrinthCalculatorModules["live-progress"] = function (ctx) {
    ctx.findRoomGridParent = function findRoomGridParent(totalCells) {
      const allCells = Array.from(document.querySelectorAll('div[class*="LabyrinthPanel_roomCell"]'));
      if (!allCells.length) {
        return null;
      }

      const parentCount = new Map();
      for (const cell of allCells) {
        const parent = cell.parentElement;
        if (!parent) {
          continue;
        }
        parentCount.set(parent, (parentCount.get(parent) || 0) + 1);
      }

      const candidates = [];
      for (const [parent, count] of parentCount.entries()) {
        if (count === totalCells) {
          candidates.push(parent);
        }
      }
      if (!candidates.length) {
        return null;
      }

      return (
        candidates.find((parent) =>
          parent.querySelector('svg[aria-label="Exit"], use[href$="#flag"], use[xlink\\:href$="#flag"]')
        ) || candidates[0]
      );
    };

    ctx.findRoomGridCells = function findRoomGridCells(totalCells) {
      const preferredParent = ctx.findRoomGridParent(totalCells);
      if (!preferredParent) {
        return [];
      }
      return Array.from(preferredParent.children).filter((el) =>
        String(el.className || "").includes("LabyrinthPanel_roomCell")
      );
    };

    ctx.toRoomKey = function toRoomKey(x, y) {
      return `${x},${y}`;
    };

    ctx.parseRoomKey = function parseRoomKey(roomKey) {
      if (!roomKey) {
        return null;
      }
      const [xRaw, yRaw] = String(roomKey).split(",");
      const x = Number(xRaw);
      const y = Number(yRaw);
      if (!Number.isInteger(x) || !Number.isInteger(y)) {
        return null;
      }
      return { x, y };
    };

    ctx.getRoomKeyFromCell = function getRoomKeyFromCell(cell) {
      if (!cell) {
        return "";
      }
      const x = Number(cell.getAttribute("data-room-x"));
      const y = Number(cell.getAttribute("data-room-y"));
      if (!Number.isInteger(x) || !Number.isInteger(y)) {
        return "";
      }
      return ctx.toRoomKey(x, y);
    };

    ctx.clearDisplayedRoomData = function clearDisplayedRoomData() {
      ctx.hidePreviewTooltip();
      ctx.skillingPreviewByCell = new WeakMap();
      ctx.combatPreviewByCell = new WeakMap();
      ctx.latestRoomEstimateByRoomKey.clear();
      const roomCells = Array.from(document.querySelectorAll('div[class*="LabyrinthPanel_roomCell"]'));
      for (const cell of roomCells) {
        ctx.removeBadge(cell);
      }
    };

    ctx.parseLabyrinthPathData = function parseLabyrinthPathData(pathData) {
      if (Array.isArray(pathData)) {
        return pathData;
      }
      if (typeof pathData === "string" && pathData) {
        try {
          const parsed = JSON.parse(pathData);
          return Array.isArray(parsed) ? parsed : [];
        } catch (_error) {
          return [];
        }
      }
      return [];
    };

    ctx.getCurrentPathRoomKey = function getCurrentPathRoomKey(state) {
      const labyrinth = state?.characterLabyrinth;
      if (!labyrinth) {
        return "";
      }
      const path = ctx.parseLabyrinthPathData(labyrinth.pathData);
      const point = path[0];
      if (!point) {
        return "";
      }
      const x = Number(point.x);
      const y = Number(point.y);
      if (!Number.isInteger(x) || !Number.isInteger(y)) {
        return "";
      }
      return `${x},${y}`;
    };

    ctx.getLiveActionRateHost = function getLiveActionRateHost() {
      const actionName = document.querySelector("div[class*='Header_actionName']");
      if (!actionName) {
        return null;
      }
      return actionName.querySelector("div[class*='Header_displayName']") || actionName;
    };

    ctx.clearLiveActionRateDisplay = function clearLiveActionRateDisplay() {
      const existing = document.getElementById(ctx.LIVE_ACTION_RATE_ID);
      if (existing) {
        existing.remove();
      }
      ctx.lastLiveActionRateToken = "";
    };

    ctx.upsertLiveActionRateDisplay = function upsertLiveActionRateDisplay(text, title, adviceState = "unavailable") {
      const host = ctx.getLiveActionRateHost();
      if (!host) {
        return false;
      }
      let node = document.getElementById(ctx.LIVE_ACTION_RATE_ID);
      if (!node || node.parentElement !== host) {
        if (node) {
          node.remove();
        }
        node = document.createElement("span");
        node.id = ctx.LIVE_ACTION_RATE_ID;
        node.className = ctx.LIVE_ACTION_RATE_CLASS;
        host.appendChild(node);
      }
      // Avoid generating child-list mutations on every unchanged polling pass.
      if (node.textContent !== text) node.textContent = text;
      node.dataset.restartAdvice = adviceState;
      node.style.color = adviceState === "restart" ? "#e9c487" : ctx.LIVE_ACTION_RATE_MWITOOLS_COLOR;
      node.style.fontSize = ctx.LIVE_ACTION_RATE_MWITOOLS_FONT_SIZE;
      node.title = title || "";
      return true;
    };

    ctx.buildLabyrinthLiveProgressToken = function buildLabyrinthLiveProgressToken(roomProgress) {
      if (!roomProgress || typeof roomProgress !== "object") {
        return "";
      }
      // Keep raw fields: rounding or defaulting here can hide a repaired packet.
      return JSON.stringify([
        roomProgress.targetLevel,
        roomProgress.currentEnhLevel,
        roomProgress.actionCounter,
        roomProgress.currentProgress,
        roomProgress.currentWorkValue,
        roomProgress.targetWorkValue,
        roomProgress.progressPerAction,
        roomProgress.successRate,
        roomProgress.doubleProgressChance,
        roomProgress.actionTimeMs,
        roomProgress.timeoutAt
      ]);
    };

    ctx.computeLabyrinthLiveSkillingEstimate = function computeLabyrinthLiveSkillingEstimate(roomProgress) {
      if (!roomProgress || typeof roomProgress !== "object") {
        return null;
      }
      const isEnhancing = roomProgress.targetLevel !== null && roomProgress.targetLevel !== undefined;
      const successChance = ctx.normalizeChance(roomProgress.successRate);
      const doubleChance = ctx.normalizeChance(roomProgress.doubleProgressChance);
      const fallbackActionMs = (isEnhancing ? ctx.BASE_ENHANCING_ACTION_SECONDS : ctx.BASE_ACTION_SECONDS) * 1000;
      const actionTimeMs = Math.max(1, ctx.finiteNumber(roomProgress.actionTimeMs, fallbackActionMs));
      const totalAttempts = Math.max(0, Math.floor((ctx.ROOM_DURATION_SECONDS * 1000) / actionTimeMs));
      const actionCounter = Math.max(0, Math.floor(ctx.finiteNumber(roomProgress.actionCounter, 0)));
      const attemptsLeft = Math.max(0, totalAttempts - actionCounter);

      if (isEnhancing) {
        const targetLevel = Math.max(0, Math.floor(ctx.finiteNumber(roomProgress.targetLevel, 0)));
        if (targetLevel <= 0) {
          return null;
        }
        const currentLevel = Math.max(0, Math.floor(ctx.finiteNumber(roomProgress.currentEnhLevel, 0)));
        const clearStats = ctx.computeEnhancingClearStats({
          attempts: attemptsLeft,
          successChance,
          doubleChance,
          targetLevel,
          startLevel: currentLevel
        });
        return {
          isEnhancing: true,
          successChance,
          doubleChance,
          actionCounter,
          totalAttempts,
          attemptsLeft,
          targetLevel,
          currentLevel,
          clearChance: ctx.clamp01(ctx.finiteNumber(clearStats?.clearChance, 0))
        };
      }

      const workPower = Math.max(0, ctx.finiteNumber(roomProgress.progressPerAction, 0));
      const progressPerSuccess = ctx.getEffectiveSkillingProgressPerSuccess(workPower);
      const targetWorkValue = Math.max(0, ctx.finiteNumber(roomProgress.targetWorkValue, 0));
      if (targetWorkValue <= 0) {
        return null;
      }
      let currentWorkValue = Math.max(0, ctx.finiteNumber(roomProgress.currentWorkValue, 0));
      if (targetWorkValue > 0 && currentWorkValue <= 0) {
        const progressRatio = ctx.clamp01(ctx.finiteNumber(roomProgress.currentProgress, 0));
        if (progressRatio > 0) {
          currentWorkValue = targetWorkValue * progressRatio;
        }
      }
      const remainingWorkValue = Math.max(0, targetWorkValue - currentWorkValue);
      const clearStats = ctx.computeNonEnhancingClearStats({
        attempts: attemptsLeft,
        successChance,
        doubleChance,
        progressPerSuccess,
        targetProgress: remainingWorkValue
      });
      return {
        isEnhancing: false,
        successChance,
        doubleChance,
        actionCounter,
        totalAttempts,
        attemptsLeft,
        targetWorkValue,
        currentWorkValue,
        workPower,
        progressPerSuccess,
        clearChance: ctx.clamp01(ctx.finiteNumber(clearStats?.clearChance, 0))
      };
    };

    ctx.formatLabyrinthLiveEstimateText = function formatLabyrinthLiveEstimateText(estimate) {
      const chanceText = (ctx.clamp01(estimate?.clearChance) * 100).toFixed(1);
      if (estimate?.isEnhancing) {
        return ctx.t("liveEnhFmt", {
          chance: chanceText,
          current: estimate.currentLevel,
          target: estimate.targetLevel,
          left: estimate.attemptsLeft
        });
      }
      return ctx.t("liveBasicFmt", {
        chance: chanceText,
        left: estimate?.attemptsLeft || 0
      });
    };

    ctx.formatLabyrinthLiveEstimateTitle = function formatLabyrinthLiveEstimateTitle(estimate) {
      if (!estimate) {
        return "";
      }
      const parts = [
        ctx.t("liveSuccessFmt", { chance: (ctx.clamp01(estimate.successChance) * 100).toFixed(1) }),
        ctx.t("liveDoubleFmt", { chance: (ctx.clamp01(estimate.doubleChance) * 100).toFixed(1) }),
        ctx.t("liveActionsFmt", { current: estimate.actionCounter, total: estimate.totalAttempts })
      ];
      if (estimate.isEnhancing) {
        parts.push(ctx.t("liveEnhTitleFmt", { current: estimate.currentLevel, target: estimate.targetLevel }));
      } else {
        parts.push(
          ctx.t("liveProgressFmt", {
            current: Math.round(ctx.finiteNumber(estimate.currentWorkValue, 0)),
            target: Math.round(ctx.finiteNumber(estimate.targetWorkValue, 0))
          })
        );
      }
      return parts.join(" | ");
    };

    ctx.refreshLiveActionRateDisplay = function refreshLiveActionRateDisplay(state, roomProgressOverride = null) {
      const roomProgress =
        roomProgressOverride || (state && typeof state === "object" ? state.labyrinthRoomProgress || null : null);
      const progressToken =
        ctx.buildLabyrinthLiveProgressToken(roomProgress) +
        (roomProgress ? `|${Math.floor(Date.now() / 1000)}|${JSON.stringify(ctx.gameTravelTiming)}` : "");
      if (!progressToken) {
        ctx.clearLiveActionRateDisplay();
        return;
      }
      const existing = document.getElementById(ctx.LIVE_ACTION_RATE_ID);
      if (progressToken === ctx.lastLiveActionRateToken && existing?.parentElement === ctx.getLiveActionRateHost()) {
        return;
      }
      const estimate = ctx.computeLabyrinthLiveSkillingEstimate(roomProgress);
      if (!estimate) {
        ctx.clearLiveActionRateDisplay();
        return;
      }
      const text = ctx.formatLabyrinthLiveEstimateText(estimate);
      const title = ctx.formatLabyrinthLiveEstimateTitle(estimate);
      const rendered = ctx.upsertLiveActionRateDisplay(text, title, ctx.getRestartAdviceState(estimate));
      if (rendered) {
        ctx.lastLiveActionRateToken = progressToken;
      }
    };

    ctx.handleLiveActionRateWsMessage = function handleLiveActionRateWsMessage(rawData) {
      if (typeof rawData !== "string") {
        return;
      }
      if (!rawData.includes('"labyrinth_room_progress"')) {
        return;
      }
      try {
        const msg = JSON.parse(rawData);
        if (!msg || msg.type !== "labyrinth_room_progress") {
          return;
        }
        ctx.refreshLiveActionRateDisplay(null, msg);
        ctx.handleRoomLogProgressMessage(msg);
      } catch (_error) {
        // Ignore malformed message payloads.
      }
    };

    ctx.installLiveActionRateWsHook = function installLiveActionRateWsHook() {
      if (ctx.liveActionRateWsHookInstalled) {
        return;
      }
      const descriptor = Object.getOwnPropertyDescriptor(MessageEvent.prototype, "data");
      if (!descriptor || typeof descriptor.get !== "function") {
        return;
      }
      const originalGetter = descriptor.get;
      try {
        const getter = function () {
          const data = originalGetter.call(this);
          if (!ctx.destroyed && this.currentTarget instanceof WebSocket && typeof data === "string") {
            ctx.observeArchiveMessage?.(data, this);
            ctx.observeTokenMessage?.(data, this);
            ctx.handleLiveActionRateWsMessage(data);
          }
          return data;
        };
        Object.defineProperty(MessageEvent.prototype, "data", { ...descriptor, get: getter });
        ctx.restoreProgressHook = () => {
          if (Object.getOwnPropertyDescriptor(MessageEvent.prototype, "data")?.get === getter)
            Object.defineProperty(MessageEvent.prototype, "data", descriptor);
        };
        ctx.liveActionRateWsHookInstalled = true;
      } catch (error) {
        console.warn("[Lab Clear Rate] Failed to install live action WS hook:", error);
      }
    };

    ctx.isRoomChallengeRunning = function isRoomChallengeRunning(state) {
      if (!state?.characterLabyrinth) {
        return false;
      }
      if (state.labyrinthRoomProgress) {
        return true;
      }
      return Array.isArray(state.labyrinthBattleMonsters) && state.labyrinthBattleMonsters.length > 0;
    };

    ctx.clearSingleRoomDisplay = function clearSingleRoomDisplay(state, roomKey) {
      if (!roomKey) {
        return;
      }
      const labyrinth = state?.characterLabyrinth;
      if (!labyrinth || !Array.isArray(labyrinth.roomData) || labyrinth.roomData.length === 0) {
        return;
      }
      const [xRaw, yRaw] = String(roomKey).split(",");
      const x = Number(xRaw);
      const y = Number(yRaw);
      if (!Number.isInteger(x) || !Number.isInteger(y)) {
        return;
      }
      const rowCount = labyrinth.roomData.length;
      const colCount = Array.isArray(labyrinth.roomData[0]) ? labyrinth.roomData[0].length : 0;
      if (!colCount || x < 0 || y < 0 || x >= colCount || y >= rowCount) {
        return;
      }
      const roomCells = ctx.findRoomGridCells(rowCount * colCount);
      if (!roomCells.length) {
        return;
      }
      const cell = roomCells[y * colCount + x];
      if (!cell) {
        return;
      }
      ctx.removeBadge(cell);
      ctx.clearCellSkillingPreview(cell);
      ctx.clearCellCombatPreview(cell);
      ctx.clearRoomEstimate(roomKey);
    };

    ctx.getRoomAtKey = function getRoomAtKey(state, roomKey) {
      if (!state?.characterLabyrinth || !Array.isArray(state.characterLabyrinth.roomData)) {
        return null;
      }
      const point = ctx.parseRoomKey(roomKey);
      if (!point) {
        return null;
      }
      const row = state.characterLabyrinth.roomData[point.y];
      if (!Array.isArray(row)) {
        return null;
      }
      return row[point.x] || null;
    };

    ctx.isRoomKeyStillCalculable = function isRoomKeyStillCalculable(state, roomKey) {
      return ctx.isCalculableRoom(ctx.getRoomAtKey(state, roomKey));
    };

    ctx.pruneInvalidRoomDisplays = function pruneInvalidRoomDisplays(state) {
      if (!state?.characterLabyrinth) {
        return;
      }
      if (!(ctx.latestRoomEstimateByRoomKey instanceof Map) || ctx.latestRoomEstimateByRoomKey.size === 0) {
        return;
      }
      for (const roomKey of Array.from(ctx.latestRoomEstimateByRoomKey.keys())) {
        if (ctx.isRoomKeyStillCalculable(state, roomKey)) {
          continue;
        }
        ctx.clearSingleRoomDisplay(state, roomKey);
      }
    };

    ctx.syncCompletedRoomCleanup = function syncCompletedRoomCleanup(state) {
      if (!state?.characterLabyrinth) {
        ctx.lastProgressRoomKey = "";
        ctx.wasRoomChallengeRunning = false;
        ctx.lastObservedPathRoomKey = "";
        return;
      }

      const currentKey = ctx.getCurrentPathRoomKey(state);
      const hasProgress = ctx.isRoomChallengeRunning(state);

      if (hasProgress) {
        if (!ctx.wasRoomChallengeRunning) {
          ctx.lastProgressRoomKey = currentKey || ctx.lastObservedPathRoomKey || ctx.lastProgressRoomKey;
        } else if (!ctx.lastProgressRoomKey && currentKey) {
          ctx.lastProgressRoomKey = currentKey;
        }
        ctx.wasRoomChallengeRunning = true;
        if (currentKey) {
          ctx.lastObservedPathRoomKey = currentKey;
        }
        return;
      }

      if (ctx.wasRoomChallengeRunning && ctx.lastProgressRoomKey) {
        if (!ctx.isRoomKeyStillCalculable(state, ctx.lastProgressRoomKey)) {
          ctx.clearSingleRoomDisplay(state, ctx.lastProgressRoomKey);
        }
      } else if (
        !ctx.wasRoomChallengeRunning &&
        ctx.lastObservedPathRoomKey &&
        currentKey &&
        currentKey !== ctx.lastObservedPathRoomKey
      ) {
        // Fallback: if a very short room run did not get sampled while active, clear the previous head cell on path shift.
        if (!ctx.isRoomKeyStillCalculable(state, ctx.lastObservedPathRoomKey)) {
          ctx.clearSingleRoomDisplay(state, ctx.lastObservedPathRoomKey);
        }
      }

      ctx.lastProgressRoomKey = "";
      ctx.wasRoomChallengeRunning = false;
      ctx.lastObservedPathRoomKey = currentKey || "";
    };

    ctx.getLabyrinthDisplaySignature = function getLabyrinthDisplaySignature(state) {
      const labyrinth = state?.characterLabyrinth;
      if (!labyrinth) {
        return "";
      }
      return ctx.hashString(
        ctx.stableStringify({
          startedAt: String(labyrinth.startedAt || ""),
          currentFloor: Math.max(0, Math.floor(ctx.finiteNumber(labyrinth.currentFloor, 0)))
        })
      );
    };

    ctx.getCalculableRoomSnapshot = function getCalculableRoomSnapshot(state) {
      const roomData = state?.characterLabyrinth?.roomData;
      if (!Array.isArray(roomData) || roomData.length === 0) {
        return {
          count: 0,
          signature: ""
        };
      }
      const parts = [];
      for (let y = 0; y < roomData.length; y += 1) {
        const row = roomData[y];
        if (!Array.isArray(row)) {
          continue;
        }
        for (let x = 0; x < row.length; x += 1) {
          const room = row[x];
          const roomType = String(room?.roomType || "");
          if (roomType !== ctx.LABYRINTH_COMBAT_ROOM_TYPE && roomType !== ctx.LABYRINTH_SKILLING_ROOM_TYPE) {
            continue;
          }
          parts.push(
            `${x},${y}|${roomType}|${String(room?.monsterHrid || "")}|${String(room?.skillHrid || "")}|${Math.max(
              0,
              Math.floor(ctx.finiteNumber(room?.recommendedLevel, 0))
            )}`
          );
        }
      }
      parts.sort();
      return {
        count: parts.length,
        signature: parts.length > 0 ? ctx.hashString(parts.join("||")) : "",
        entries: parts
      };
    };

    ctx.resetAutoRecalcState = function resetAutoRecalcState() {
      ctx.autoRecalcArmed = false;
      ctx.autoRecalcLabyrinthSignature = "";
      ctx.lastCalculatedCalculableRoomSignature = "";
      ctx.lastCalculatedCalculableRoomCount = 0;
      ctx.lastCalculatedCalculableRoomEntries = new Set();
      ctx.pendingAutoRecalcRoomKeys = new Set();
      if (ctx.autoRecalcTimerId) {
        ctx.window.clearTimeout(ctx.autoRecalcTimerId);
        ctx.autoRecalcTimerId = 0;
      }
    };

    ctx.updateAutoRecalcBaseline = function updateAutoRecalcBaseline(state) {
      const snapshot = ctx.getCalculableRoomSnapshot(state);
      ctx.autoRecalcArmed = true;
      ctx.autoRecalcLabyrinthSignature = ctx.getLabyrinthDisplaySignature(state);
      ctx.lastCalculatedCalculableRoomSignature = snapshot.signature;
      ctx.lastCalculatedCalculableRoomCount = snapshot.count;
      ctx.lastCalculatedCalculableRoomEntries = new Set(snapshot.entries || []);
    };

    ctx.getNewCalculableRoomKeys = function getNewCalculableRoomKeys(state) {
      if (!ctx.autoRecalcArmed || ctx.manualUpdateRunning) {
        return [];
      }
      if (!state?.characterLabyrinth || !Array.isArray(state.characterLabyrinth.roomData)) {
        return [];
      }
      const signature = ctx.getLabyrinthDisplaySignature(state);
      if (!signature) {
        return [];
      }
      if (ctx.autoRecalcLabyrinthSignature && signature !== ctx.autoRecalcLabyrinthSignature) {
        ctx.resetAutoRecalcState();
        return [];
      }
      const snapshot = ctx.getCalculableRoomSnapshot(state);
      if (!Array.isArray(snapshot.entries) || snapshot.entries.length === 0) {
        return [];
      }
      const addedRoomKeys = [];
      const seenRoomKeys = new Set();
      for (const entry of snapshot.entries) {
        if (ctx.lastCalculatedCalculableRoomEntries.has(entry)) {
          continue;
        }
        const roomKey = String(entry).split("|")[0] || "";
        if (!roomKey || seenRoomKeys.has(roomKey)) {
          continue;
        }
        seenRoomKeys.add(roomKey);
        addedRoomKeys.push(roomKey);
      }
      return addedRoomKeys;
    };

    ctx.scheduleAutoRecalcIfNeeded = function scheduleAutoRecalcIfNeeded(state) {
      const roomKeys = ctx.getNewCalculableRoomKeys(state);
      if (!roomKeys.length) {
        return;
      }
      for (const roomKey of roomKeys) {
        ctx.pendingAutoRecalcRoomKeys.add(roomKey);
      }
      if (ctx.autoRecalcTimerId) {
        return;
      }
      ctx.autoRecalcTimerId = ctx.window.setTimeout(() => {
        ctx.autoRecalcTimerId = 0;
        const latestState = ctx.getGameState();
        const latestRoomKeys = ctx.getNewCalculableRoomKeys(latestState);
        for (const roomKey of latestRoomKeys) {
          ctx.pendingAutoRecalcRoomKeys.add(roomKey);
        }
        const keysToRecalc = Array.from(ctx.pendingAutoRecalcRoomKeys);
        ctx.pendingAutoRecalcRoomKeys.clear();
        if (!keysToRecalc.length) {
          return;
        }
        ctx.runManualUpdate({ trigger: "auto-new-tiles", roomKeys: keysToRecalc });
      }, ctx.AUTO_RECALC_DEBOUNCE_MS);
    };

    ctx.markLabyrinthTransition = function markLabyrinthTransition(nextSignature = "") {
      const normalizedSignature = String(nextSignature || "");
      ctx.clearDisplayedRoomData();
      ctx.lastProgressRoomKey = "";
      ctx.wasRoomChallengeRunning = false;
      ctx.lastObservedPathRoomKey = "";
      ctx.lastLabyrinthDisplaySignature = normalizedSignature;
      ctx.resetAutoRecalcState();
      ctx.handleRoomDistributionLabyrinthTransition(normalizedSignature);
    };

    ctx.markLabyrinthTransitionPreserveTooltip = function markLabyrinthTransitionPreserveTooltip(nextSignature = "") {
      const normalizedSignature = String(nextSignature || "");
      ctx.skillingPreviewByCell = new WeakMap();
      ctx.combatPreviewByCell = new WeakMap();
      ctx.latestRoomEstimateByRoomKey.clear();
      const roomCells = Array.from(document.querySelectorAll('div[class*="LabyrinthPanel_roomCell"]'));
      for (const cell of roomCells) {
        ctx.removeBadge(cell);
      }
      ctx.lastProgressRoomKey = "";
      ctx.wasRoomChallengeRunning = false;
      ctx.lastObservedPathRoomKey = "";
      ctx.lastLabyrinthDisplaySignature = normalizedSignature;
      ctx.resetAutoRecalcState();
      ctx.handleRoomDistributionLabyrinthTransition(normalizedSignature);
    };

    ctx.removeBadge = function removeBadge(cell) {
      const badge = cell.querySelector(`.${ctx.BADGE_CLASS}`);
      if (badge) {
        badge.remove();
      }
    };

    ctx.formatEtaText = function formatEtaText(expectedSeconds, _shownPercent) {
      if (expectedSeconds === Infinity) {
        return ctx.ETA_INFINITE_TEXT;
      }
      if (!Number.isFinite(expectedSeconds)) {
        return "--";
      }
      const roundedSeconds = Math.max(0, Math.ceil(expectedSeconds));
      if (roundedSeconds > 999) {
        return "999+";
      }
      return `${roundedSeconds}s`;
    };

    ctx.upsertBadge = function upsertBadge(cell, probability, expectedSeconds, details) {
      let badge = cell.querySelector(`.${ctx.BADGE_CLASS}`);
      if (!badge) {
        badge = document.createElement("div");
        badge.className = ctx.BADGE_CLASS;
        cell.appendChild(badge);
      }
      let chanceNode = badge.querySelector(`.${ctx.BADGE_CLASS}__chance`);
      if (!chanceNode) {
        chanceNode = document.createElement("div");
        chanceNode.className = `${ctx.BADGE_CLASS}__chance`;
        badge.appendChild(chanceNode);
      }

      let etaNode = badge.querySelector(`.${ctx.BADGE_CLASS}__eta`);
      if (!etaNode) {
        etaNode = document.createElement("div");
        etaNode.className = `${ctx.BADGE_CLASS}__eta`;
        badge.appendChild(etaNode);
      }

      const shownPercent = Math.round(probability * 100);
      chanceNode.textContent = `${shownPercent}%`;
      etaNode.textContent = ctx.formatEtaText(expectedSeconds, shownPercent);
      badge.style.backgroundColor = ctx.getBadgeColor(probability);
      badge.title = details;
    };

    ctx.clearRoomEstimate = function clearRoomEstimate(roomKey) {
      if (!roomKey) {
        return;
      }
      ctx.latestRoomEstimateByRoomKey.delete(roomKey);
    };

    ctx.updateRoomEstimate = function updateRoomEstimate(roomKey, result) {
      if (!roomKey || !result) {
        return;
      }
      const clearChance = ctx.clamp01(ctx.finiteNumber(result.clearChance, 0));
      const expectedSeconds = ctx.finiteNumber(result.expectedSecondsPerClear, Infinity);
      const shownPercent = Math.round(clearChance * 100);
      const etaText = ctx.formatEtaText(expectedSeconds, shownPercent);
      ctx.latestRoomEstimateByRoomKey.set(roomKey, {
        clearChance,
        expectedSeconds,
        shownPercent,
        etaText,
        isImpassable: etaText === ctx.ETA_INFINITE_TEXT
      });
    };
  };
})(globalThis);
