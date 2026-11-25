// Adapted from 迷宫胜率计算器 1.6.0, dakonglong, MIT. See docs/THIRD_PARTY.md.
(function (root) {
  "use strict";
  root.MwiLabyrinthCalculatorModules ||= {};
  root.MwiLabyrinthCalculatorModules["room-log"] = function (ctx) {
    ctx.formatRoomLogPercent = function formatRoomLogPercent(percentValue) {
      const value = Math.max(0, ctx.finiteNumber(percentValue, 0));
      const oneDecimal = Math.round(value * 10) / 10;
      if (Math.abs(oneDecimal - Math.round(oneDecimal)) < 0.0001) {
        return String(Math.round(oneDecimal));
      }
      return oneDecimal.toFixed(1);
    };

    ctx.formatRoomLogExperience = function formatRoomLogExperience(value) {
      const n = Math.max(0, ctx.finiteNumber(value, 0));
      if (Math.abs(n - Math.round(n)) < 1e-9) {
        return `${Math.round(n)}`;
      }
      return n.toFixed(1).replace(/\.0$/, "");
    };

    ctx.getSkillNameByHrid = function getSkillNameByHrid(skillHrid) {
      const hrid = String(skillHrid || "");
      const key = hrid.split("/").pop() || "";
      if (ctx.isChineseUi()) {
        return ctx.LABYRINTH_AUTOMATION_SKILL_NAME_ZH_BY_KEY[key] || key || "--";
      }
      return ctx.LABYRINTH_AUTOMATION_SKILL_NAME_EN_BY_KEY[key] || key || "--";
    };

    ctx.getSkillExperienceValue = function getSkillExperienceValue(skillMap, skillHrid) {
      const hrid = String(skillHrid || "");
      if (!skillMap || !hrid) {
        return NaN;
      }
      if (ctx.isMapObject(skillMap)) {
        const entry = skillMap.get(hrid);
        if (Number.isFinite(entry?.experience)) {
          return Number(entry.experience);
        }
        return NaN;
      }
      const entry = skillMap[hrid];
      if (entry && Number.isFinite(entry.experience)) {
        return Number(entry.experience);
      }
      return NaN;
    };

    ctx.buildRoomLogContextFromSession = function buildRoomLogContextFromSession(session) {
      if (!session || typeof session !== "object") {
        return null;
      }
      const skillHrid = String(session.skillHrid || "");
      if (!skillHrid) {
        return null;
      }
      return {
        roomKey: String(session.roomKey || ""),
        roomType: ctx.LABYRINTH_SKILLING_ROOM_TYPE,
        skillHrid,
        skillName: String(session.skillName || ctx.getSkillNameByHrid(skillHrid)),
        recommendedLevel: Math.max(0, Math.floor(ctx.finiteNumber(session.recommendedLevel, 0)))
      };
    };

    ctx.createEmptyRoomLogStorage = function createEmptyRoomLogStorage() {
      return {
        sessions: [],
        active: null
      };
    };

    ctx.trimRoomLogSessions = function trimRoomLogSessions(sessions) {
      if (!Array.isArray(sessions)) {
        return [];
      }
      return sessions.filter((entry) => entry && typeof entry === "object").slice(0, ctx.ROOM_LOG_MAX_SESSIONS);
    };

    ctx.sanitizeRoomLogAction = function sanitizeRoomLogAction(action, fallbackCounter = 0) {
      if (!action || typeof action !== "object") {
        return {
          counter: Math.max(0, Math.floor(ctx.finiteNumber(fallbackCounter, 0))),
          outcome: ctx.ROOM_LOG_ACTION_OUTCOME_UNKNOWN,
          text: "?",
          missing: true
        };
      }
      return {
        counter: Math.max(0, Math.floor(ctx.finiteNumber(action.counter, fallbackCounter))),
        outcome: String(action.outcome || ctx.ROOM_LOG_ACTION_OUTCOME_UNKNOWN),
        text: String(action.text || "?"),
        missing: action.missing === true
      };
    };

    ctx.sanitizeRoomLogSession = function sanitizeRoomLogSession(session) {
      if (!session || typeof session !== "object") {
        return null;
      }
      const startedAt = Math.max(0, Math.floor(ctx.finiteNumber(session.startedAt, 0)));
      const actions = Array.isArray(session.actions)
        ? session.actions.map((action) => ctx.sanitizeRoomLogAction(action))
        : [];
      return {
        id: String(session.id || `room-log-${startedAt}`),
        startedAt,
        endedAt: Math.max(0, Math.floor(ctx.finiteNumber(session.endedAt, 0))),
        runKey: String(session.runKey || ""),
        roomKey: String(session.roomKey || ""),
        mode: String(session.mode || "skilling"),
        skillHrid: String(session.skillHrid || ""),
        skillName: String(session.skillName || "--"),
        recommendedLevel: Math.max(0, Math.floor(ctx.finiteNumber(session.recommendedLevel, 0))),
        successRate: ctx.clamp01(ctx.finiteNumber(session.successRate, 0)),
        doubleChance: ctx.clamp01(ctx.finiteNumber(session.doubleChance, 0)),
        progressPerAction: Math.max(0, ctx.finiteNumber(session.progressPerAction, 0)),
        experiencePerAction: Math.max(0, ctx.finiteNumber(session.experiencePerAction, 0)),
        predictedExperience: Math.max(
          0,
          ctx.finiteNumber(session.predictedExperience, ctx.finiteNumber(session.experiencePerAction, 0))
        ),
        actualExperienceGain: Math.max(0, ctx.finiteNumber(session.actualExperienceGain, 0)),
        startSkillExperience: Math.max(0, ctx.finiteNumber(session.startSkillExperience, 0)),
        endSkillExperience: Math.max(0, ctx.finiteNumber(session.endSkillExperience, 0)),
        totalExperience: Math.max(0, ctx.finiteNumber(session.totalExperience, 0)),
        targetWorkValue: Math.max(0, ctx.finiteNumber(session.targetWorkValue, 0)),
        currentWorkValue: Math.max(0, ctx.finiteNumber(session.currentWorkValue, 0)),
        currentProgressPct: Math.max(0, ctx.finiteNumber(session.currentProgressPct, 0)),
        targetLevel: Math.max(0, Math.floor(ctx.finiteNumber(session.targetLevel, 0))),
        currentEnhLevel: Math.max(0, Math.floor(ctx.finiteNumber(session.currentEnhLevel, 0))),
        actions,
        incomplete: session.incomplete === true,
        incompleteReasons: Array.isArray(session.incompleteReasons)
          ? Array.from(new Set(session.incompleteReasons.map((reason) => String(reason || "").trim()).filter(Boolean)))
          : [],
        completed: session.completed === true
      };
    };

    ctx.persistRoomLogStorage = function persistRoomLogStorage() {
      const payload = {
        sessions: ctx.trimRoomLogSessions(ctx.roomLogSessions),
        active: ctx.sanitizeRoomLogSession(ctx.activeRoomLogSession)
      };
      try {
        ctx.storage.setItem(ctx.ROOM_LOG_STORAGE_KEY, JSON.stringify(payload));
      } catch (_error) {
        // Ignore storage errors.
      }
    };

    ctx.loadRoomLogStorage = function loadRoomLogStorage() {
      const fallback = ctx.createEmptyRoomLogStorage();
      try {
        const raw = ctx.storage.getItem(ctx.ROOM_LOG_STORAGE_KEY);
        if (!raw) {
          return fallback;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
          return fallback;
        }
        const sessions = Array.isArray(parsed.sessions)
          ? ctx.trimRoomLogSessions(parsed.sessions.map((entry) => ctx.sanitizeRoomLogSession(entry)).filter(Boolean))
          : [];
        const active = ctx.sanitizeRoomLogSession(parsed.active);
        return {
          sessions,
          active
        };
      } catch (_error) {
        return fallback;
      }
    };

    ctx.getRoomLogFloatingPanel = function getRoomLogFloatingPanel() {
      return document.getElementById(ctx.ROOM_LOG_FLOAT_ID);
    };

    ctx.refreshRoomLogPanelIfVisible = function refreshRoomLogPanelIfVisible() {
      const panel = ctx.getRoomLogFloatingPanel();
      if (!panel || panel.hasAttribute("hidden")) {
        return;
      }
      ctx.renderRoomLogPanel();
    };

    ctx.markRoomLogSessionIncomplete = function markRoomLogSessionIncomplete(session, reason) {
      if (!session || typeof session !== "object") {
        return;
      }
      session.incomplete = true;
      if (!Array.isArray(session.incompleteReasons)) {
        session.incompleteReasons = [];
      }
      const normalized = String(reason || "").trim();
      if (normalized && !session.incompleteReasons.includes(normalized)) {
        session.incompleteReasons.push(normalized);
      }
    };

    ctx.getRoomLogRunKey = function getRoomLogRunKey(state) {
      const labyrinth = state?.characterLabyrinth;
      if (!labyrinth) {
        return "";
      }
      const startedAt = String(labyrinth.startedAt || "");
      const floor = Math.max(0, Math.floor(ctx.finiteNumber(labyrinth.currentFloor, 0)));
      return `${startedAt}|${floor}`;
    };

    ctx.buildRoomLogSessionKey = function buildRoomLogSessionKey(state, roomContext, mode) {
      if (!roomContext) {
        return "";
      }
      return [
        ctx.getRoomLogRunKey(state),
        String(roomContext.roomKey || ""),
        String(roomContext.skillHrid || ""),
        String(mode || "skilling")
      ].join("|");
    };

    ctx.getCurrentSkillingRoomContext = function getCurrentSkillingRoomContext(state) {
      const roomKey = ctx.getCurrentPathRoomKey(state);
      if (!roomKey) {
        return null;
      }
      const room = ctx.getRoomAtKey(state, roomKey);
      if (!room || room.roomType !== ctx.LABYRINTH_SKILLING_ROOM_TYPE) {
        return null;
      }
      const skillHrid = String(room.skillHrid || "");
      return {
        roomKey,
        roomType: String(room.roomType || ""),
        skillHrid,
        skillName: ctx.getSkillNameByHrid(skillHrid),
        recommendedLevel: Math.max(0, Math.floor(ctx.finiteNumber(room.recommendedLevel, 0)))
      };
    };

    ctx.getCombatMonsterDisplayName = function getCombatMonsterDisplayName(monsterHrid, initClientData) {
      const hrid = String(monsterHrid || "");
      if (!hrid) {
        return ctx.t("roomLogModeCombat");
      }
      const tail = hrid.split("/").pop() || hrid;
      const monster = initClientData?.combatMonsterDetailMap?.[hrid];
      if (ctx.isChineseUi()) {
        const localizedByTail = ctx.LABYRINTH_MONSTER_NAME_ZH_BY_TAIL[tail];
        if (localizedByTail) {
          return String(localizedByTail);
        }
        const localized = ctx.LABYRINTH_MONSTER_NAME_ZH_MAP[hrid];
        if (localized) {
          return String(localized);
        }
      }
      return String(monster?.name || tail || hrid);
    };

    ctx.getCurrentCombatRoomContext = function getCurrentCombatRoomContext(state) {
      const roomKey = ctx.getCurrentPathRoomKey(state);
      if (!roomKey) {
        return null;
      }
      const room = ctx.getRoomAtKey(state, roomKey);
      if (!room || room.roomType !== ctx.LABYRINTH_COMBAT_ROOM_TYPE) {
        return null;
      }
      const initClientData = ctx.getInitClientData();
      const monsterHrid = String(room.monsterHrid || "");
      return {
        roomKey,
        roomType: String(room.roomType || ""),
        skillHrid: "",
        skillName: ctx.getCombatMonsterDisplayName(monsterHrid, initClientData),
        recommendedLevel: Math.max(0, Math.floor(ctx.finiteNumber(room.recommendedLevel, 0)))
      };
    };

    ctx.buildRoomLogSnapshot = function buildRoomLogSnapshot(roomProgress) {
      if (!roomProgress || typeof roomProgress !== "object") {
        return null;
      }
      const isEnhancing = roomProgress.targetLevel !== null && roomProgress.targetLevel !== undefined;
      const targetWorkValue = Math.max(0, ctx.finiteNumber(roomProgress.targetWorkValue, 0));
      let currentProgressRatio = ctx.clamp01(ctx.finiteNumber(roomProgress.currentProgress, 0));
      let currentWorkValue = Math.max(0, ctx.finiteNumber(roomProgress.currentWorkValue, 0));
      if (targetWorkValue > 0 && currentWorkValue <= 0 && currentProgressRatio > 0) {
        currentWorkValue = targetWorkValue * currentProgressRatio;
      }
      if (targetWorkValue > 0) {
        currentProgressRatio = ctx.clamp01(currentWorkValue / targetWorkValue);
      }
      return {
        isEnhancing,
        actionCounter: Math.max(0, Math.floor(ctx.finiteNumber(roomProgress.actionCounter, 0))),
        successRate: ctx.normalizeChance(roomProgress.successRate),
        doubleChance: ctx.normalizeChance(roomProgress.doubleProgressChance),
        progressPerAction: Math.max(0, ctx.finiteNumber(roomProgress.progressPerAction, 0)),
        targetWorkValue,
        currentWorkValue,
        currentProgressRatio,
        targetLevel: Math.max(0, Math.floor(ctx.finiteNumber(roomProgress.targetLevel, 0))),
        currentEnhLevel: Math.max(0, Math.floor(ctx.finiteNumber(roomProgress.currentEnhLevel, 0))),
        actionTimeMs: Math.max(1, ctx.finiteNumber(roomProgress.actionTimeMs, 1))
      };
    };

    ctx.computeSkillingRoomExperiencePerRoom = function computeSkillingRoomExperiencePerRoom(
      state,
      _initClientData,
      roomContext
    ) {
      if (!state || !roomContext?.skillHrid) {
        return 0;
      }
      const skillId = ctx.skillHridToSkillId(roomContext.skillHrid);
      if (!skillId) {
        return 0;
      }
      const actionTypeHrid = ctx.skillIdToActionTypeHrid(skillId);
      if (!actionTypeHrid) {
        return 0;
      }

      const liveRoom = ctx.getRoomAtKey(state, roomContext.roomKey);
      const room = liveRoom || {
        roomType: ctx.LABYRINTH_SKILLING_ROOM_TYPE,
        skillHrid: roomContext.skillHrid,
        recommendedLevel: roomContext.recommendedLevel,
        roomKey: roomContext.roomKey
      };
      const roomLevel = Math.max(0, ctx.finiteNumber(room.recommendedLevel, roomContext.recommendedLevel));
      const baseExperiencePerRoom = roomLevel * 50;
      if (baseExperiencePerRoom <= 0) {
        return 0;
      }

      const equipmentMetrics = ctx.getSkillingActionMetricsFromState(
        state,
        skillId,
        actionTypeHrid,
        "equipmentActionTypeBuffsDict"
      );
      const consumableMetrics = ctx.getSkillingActionMetricsFromState(
        state,
        skillId,
        actionTypeHrid,
        "consumableActionTypeBuffsDict"
      );
      const labyrinthUpgradeLevels = ctx.getLabyrinthUpgradeLevels();
      const labyrinthExperienceBonus = ctx.getLabyrinthUpgradeExperienceBonus(labyrinthUpgradeLevels);
      const experienceBonusDetail = ctx.computeSkillingExperienceBonusForRoom(
        state,
        skillId,
        actionTypeHrid,
        equipmentMetrics,
        consumableMetrics,
        ctx.createEmptySkillingMetrics(),
        true,
        labyrinthExperienceBonus
      );
      const experienceMultiplier = Math.max(0, ctx.finiteNumber(experienceBonusDetail?.multiplier, 1));
      return Math.max(0, baseExperiencePerRoom * experienceMultiplier);
    };

    ctx.computeSkillingRoomExperiencePerAction = function computeSkillingRoomExperiencePerAction(
      state,
      initClientData,
      roomContext
    ) {
      return ctx.computeSkillingRoomExperiencePerRoom(state, initClientData, roomContext);
    };

    ctx.refreshRoomLogSessionActualExperience = function refreshRoomLogSessionActualExperience(session, state) {
      if (!session || !state || !session.skillHrid) {
        return NaN;
      }
      const latestSkillExperience = ctx.getSkillExperienceValue(state.characterSkillMap, session.skillHrid);
      if (Number.isFinite(latestSkillExperience)) {
        session.endSkillExperience = latestSkillExperience;
      }
      const startSkillExperience = ctx.finiteNumber(session.startSkillExperience, NaN);
      const endSkillExperience = ctx.finiteNumber(session.endSkillExperience, NaN);
      if (!Number.isFinite(startSkillExperience) || !Number.isFinite(endSkillExperience)) {
        return NaN;
      }
      const gained = Math.max(0, endSkillExperience - startSkillExperience);
      session.actualExperienceGain = gained;
      return gained;
    };

    ctx.resolveRoomLogTotalExperience = function resolveRoomLogTotalExperience(session, actualGain) {
      const safeActual = ctx.finiteNumber(actualGain, NaN);
      if (Number.isFinite(safeActual) && (safeActual > 0 || session?.completed)) {
        return Math.max(0, safeActual);
      }
      return Math.max(
        0,
        ctx.finiteNumber(
          session?.predictedExperience,
          ctx.finiteNumber(session?.experiencePerAction, ctx.finiteNumber(session?.totalExperience, 0))
        )
      );
    };

    ctx.refreshRoomLogSessionExperience = function refreshRoomLogSessionExperience(
      session,
      state,
      roomContext,
      _snapshot
    ) {
      if (!session || !roomContext) {
        return;
      }
      const initClientData = ctx.getInitClientData();
      // Keep the legacy field name for backward compatibility, but this value is room-completion EXP.
      const predicted = ctx.computeSkillingRoomExperiencePerRoom(state, initClientData, roomContext);
      session.experiencePerAction = Math.max(0, ctx.finiteNumber(predicted, 0));
      session.predictedExperience = session.experiencePerAction;
      const actualGain = ctx.refreshRoomLogSessionActualExperience(session, state);
      session.totalExperience = ctx.resolveRoomLogTotalExperience(session, actualGain);
    };

    ctx.createRoomLogUnknownAction = function createRoomLogUnknownAction(counter) {
      return {
        counter: Math.max(0, Math.floor(ctx.finiteNumber(counter, 0))),
        outcome: ctx.ROOM_LOG_ACTION_OUTCOME_UNKNOWN,
        text: "?",
        missing: true
      };
    };

    ctx.deriveRoomLogAction = function deriveRoomLogAction(prevSnapshot, nextSnapshot, actionCounter) {
      if (!nextSnapshot || typeof nextSnapshot !== "object") {
        return ctx.createRoomLogUnknownAction(actionCounter);
      }

      if (nextSnapshot.isEnhancing) {
        const previousLevel = Math.max(0, Math.floor(ctx.finiteNumber(prevSnapshot?.currentEnhLevel, 0)));
        const nextLevel = Math.max(0, Math.floor(ctx.finiteNumber(nextSnapshot.currentEnhLevel, 0)));
        const levelDelta = nextLevel - previousLevel;
        let outcome = ctx.ROOM_LOG_ACTION_OUTCOME_FAIL;
        if (levelDelta >= 2) {
          outcome = ctx.ROOM_LOG_ACTION_OUTCOME_DOUBLE;
        } else if (levelDelta >= 1) {
          outcome = ctx.ROOM_LOG_ACTION_OUTCOME_SUCCESS;
        }
        const text = `+${nextLevel}`;
        return {
          counter: Math.max(0, Math.floor(ctx.finiteNumber(actionCounter, 0))),
          outcome,
          text,
          missing: false
        };
      }

      const prevWork = Math.max(0, ctx.finiteNumber(prevSnapshot?.currentWorkValue, 0));
      const nextWork = Math.max(0, ctx.finiteNumber(nextSnapshot.currentWorkValue, 0));
      const workDelta = nextWork - prevWork;
      const prevProgress = ctx.clamp01(ctx.finiteNumber(prevSnapshot?.currentProgressRatio, 0));
      const nextProgress = ctx.clamp01(ctx.finiteNumber(nextSnapshot.currentProgressRatio, 0));
      const progressDelta = nextProgress - prevProgress;
      const expectedSingle = Math.max(0, ctx.finiteNumber(prevSnapshot?.progressPerAction, 0));

      let outcome = ctx.ROOM_LOG_ACTION_OUTCOME_FAIL;
      if (workDelta > 0.0001 || progressDelta > 0.0001) {
        if (expectedSingle > 0 && workDelta >= expectedSingle * 1.8) {
          outcome = ctx.ROOM_LOG_ACTION_OUTCOME_DOUBLE;
        } else {
          outcome = ctx.ROOM_LOG_ACTION_OUTCOME_SUCCESS;
        }
      }

      return {
        counter: Math.max(0, Math.floor(ctx.finiteNumber(actionCounter, 0))),
        outcome,
        text: `${ctx.formatRoomLogPercent(nextProgress * 100)}%`,
        missing: false
      };
    };

    ctx.applyRoomLogSnapshotToSession = function applyRoomLogSnapshotToSession(session, snapshot) {
      if (!session || !snapshot) {
        return;
      }
      session.successRate = snapshot.successRate;
      session.doubleChance = snapshot.doubleChance;
      session.progressPerAction = snapshot.progressPerAction;
      session.targetWorkValue = snapshot.targetWorkValue;
      session.currentWorkValue = snapshot.currentWorkValue;
      session.currentProgressPct = snapshot.currentProgressRatio * 100;
      session.targetLevel = snapshot.targetLevel;
      session.currentEnhLevel = snapshot.currentEnhLevel;
      session.totalExperience = Math.max(
        0,
        ctx.finiteNumber(session.totalExperience, ctx.finiteNumber(session.experiencePerAction, 0))
      );
    };

    ctx.appendRoomLogAction = function appendRoomLogAction(session, nextSnapshot) {
      if (!session || !nextSnapshot) {
        return;
      }
      const prevSnapshot = session.lastSnapshot || null;
      const prevCounter = Math.max(0, Math.floor(ctx.finiteNumber(prevSnapshot?.actionCounter, 0)));
      const nextCounter = Math.max(0, Math.floor(ctx.finiteNumber(nextSnapshot.actionCounter, 0)));

      if (!prevSnapshot) {
        session.lastSnapshot = nextSnapshot;
        session.lastActionCounter = nextCounter;
        ctx.applyRoomLogSnapshotToSession(session, nextSnapshot);
        return;
      }

      if (nextCounter <= prevCounter) {
        session.lastSnapshot = nextSnapshot;
        session.lastActionCounter = nextCounter;
        ctx.applyRoomLogSnapshotToSession(session, nextSnapshot);
        return;
      }

      if (!Array.isArray(session.actions)) {
        session.actions = [];
      }

      if (nextCounter - prevCounter > 1) {
        ctx.markRoomLogSessionIncomplete(session, "action_gap");
        for (let counter = prevCounter + 1; counter < nextCounter; counter += 1) {
          session.actions.push(ctx.createRoomLogUnknownAction(counter));
        }
      }

      const action = ctx.deriveRoomLogAction(prevSnapshot, nextSnapshot, nextCounter);
      session.actions.push(action);
      if (session.actions.length > 200) {
        ctx.markRoomLogSessionIncomplete(session, "action_overflow");
        session.actions = session.actions.slice(session.actions.length - 200);
      }

      session.lastSnapshot = nextSnapshot;
      session.lastActionCounter = nextCounter;
      ctx.applyRoomLogSnapshotToSession(session, nextSnapshot);
    };

    ctx.isRoomLogSessionComplete = function isRoomLogSessionComplete(session) {
      if (!session || typeof session !== "object") {
        return false;
      }
      if (session.mode === "combat") {
        return true;
      }
      if (session.mode === "enhancing") {
        const targetLevel = Math.max(0, Math.floor(ctx.finiteNumber(session.targetLevel, 0)));
        const currentLevel = Math.max(0, Math.floor(ctx.finiteNumber(session.currentEnhLevel, 0)));
        return targetLevel > 0 && currentLevel >= targetLevel;
      }
      const targetWork = Math.max(0, ctx.finiteNumber(session.targetWorkValue, 0));
      const currentWork = Math.max(0, ctx.finiteNumber(session.currentWorkValue, 0));
      const progressPct = Math.max(0, ctx.finiteNumber(session.currentProgressPct, 0));
      if (targetWork > 0) {
        return currentWork >= targetWork - 0.0001 || progressPct >= 99.9;
      }
      return progressPct >= 99.9;
    };

    ctx.finalizeActiveRoomLogSession = function finalizeActiveRoomLogSession(options = {}) {
      if (!ctx.activeRoomLogSession) {
        return;
      }
      const session = ctx.activeRoomLogSession;
      const latestState = ctx.getGameState();
      const fallbackContext = ctx.buildRoomLogContextFromSession(session);
      if (latestState && fallbackContext) {
        ctx.refreshRoomLogSessionExperience(session, latestState, fallbackContext, session.lastSnapshot || null);
      }
      if (options && options.forceIncompleteReason) {
        ctx.markRoomLogSessionIncomplete(session, options.forceIncompleteReason);
      }

      let completed;
      if (options && typeof options.completed === "boolean") {
        completed = options.completed;
      } else {
        completed = ctx.isRoomLogSessionComplete(session);
      }

      if (!completed) {
        ctx.markRoomLogSessionIncomplete(session, "not_complete");
      }

      session.endedAt = Date.now();
      session.completed = completed && !session.incomplete;

      const stored = ctx.sanitizeRoomLogSession(session);
      if (stored) {
        ctx.roomLogSessions.unshift(stored);
        ctx.roomLogSessions = ctx.trimRoomLogSessions(ctx.roomLogSessions);
      }

      ctx.activeRoomLogSession = null;
      ctx.persistRoomLogStorage();
      ctx.refreshRoomLogPanelIfVisible();
    };

    ctx.ensureRoomLogSession = function ensureRoomLogSession(state, roomContext, snapshot) {
      if (!roomContext || !snapshot) {
        return null;
      }
      const mode = snapshot.isEnhancing ? "enhancing" : "skilling";
      const sessionKey = ctx.buildRoomLogSessionKey(state, roomContext, mode);
      if (!sessionKey) {
        return null;
      }

      if (ctx.activeRoomLogSession && ctx.activeRoomLogSession.sessionKey !== sessionKey) {
        ctx.finalizeActiveRoomLogSession({ forceIncompleteReason: "room_switch" });
      }

      if (ctx.activeRoomLogSession) {
        return ctx.activeRoomLogSession;
      }

      const now = Date.now();
      const startSkillExperience = ctx.getSkillExperienceValue(state?.characterSkillMap, roomContext.skillHrid);
      ctx.activeRoomLogSession = {
        id: `room-log-${now}-${Math.random().toString(36).slice(2, 8)}`,
        startedAt: now,
        endedAt: 0,
        runKey: ctx.getRoomLogRunKey(state),
        sessionKey,
        roomKey: String(roomContext.roomKey || ""),
        mode,
        skillHrid: String(roomContext.skillHrid || ""),
        skillName: String(roomContext.skillName || "--"),
        recommendedLevel: Math.max(0, Math.floor(ctx.finiteNumber(roomContext.recommendedLevel, 0))),
        successRate: snapshot.successRate,
        doubleChance: snapshot.doubleChance,
        progressPerAction: snapshot.progressPerAction,
        experiencePerAction: 0,
        predictedExperience: 0,
        actualExperienceGain: 0,
        startSkillExperience: Number.isFinite(startSkillExperience) ? startSkillExperience : 0,
        endSkillExperience: Number.isFinite(startSkillExperience) ? startSkillExperience : 0,
        totalExperience: 0,
        targetWorkValue: snapshot.targetWorkValue,
        currentWorkValue: snapshot.currentWorkValue,
        currentProgressPct: snapshot.currentProgressRatio * 100,
        targetLevel: snapshot.targetLevel,
        currentEnhLevel: snapshot.currentEnhLevel,
        actions: [],
        lastActionCounter: snapshot.actionCounter,
        lastSnapshot: snapshot,
        incomplete: false,
        incompleteReasons: [],
        completed: false
      };
      ctx.refreshRoomLogSessionExperience(ctx.activeRoomLogSession, state, roomContext, snapshot);
      if (snapshot.actionCounter > 0) {
        ctx.markRoomLogSessionIncomplete(ctx.activeRoomLogSession, "start_midway");
      }
      ctx.persistRoomLogStorage();
      return ctx.activeRoomLogSession;
    };

    ctx.ensureCombatRoomLogSession = function ensureCombatRoomLogSession(state, roomContext) {
      if (!roomContext) {
        return null;
      }
      const mode = "combat";
      const sessionKey = ctx.buildRoomLogSessionKey(state, roomContext, mode);
      if (!sessionKey) {
        return null;
      }

      if (ctx.activeRoomLogSession && ctx.activeRoomLogSession.sessionKey !== sessionKey) {
        ctx.finalizeActiveRoomLogSession({ forceIncompleteReason: "room_switch" });
      }

      if (ctx.activeRoomLogSession) {
        return ctx.activeRoomLogSession;
      }

      const now = Date.now();
      ctx.activeRoomLogSession = {
        id: `room-log-${now}-${Math.random().toString(36).slice(2, 8)}`,
        startedAt: now,
        endedAt: 0,
        runKey: ctx.getRoomLogRunKey(state),
        sessionKey,
        roomKey: String(roomContext.roomKey || ""),
        mode,
        skillHrid: "",
        skillName: String(roomContext.skillName || ctx.t("roomLogModeCombat")),
        recommendedLevel: Math.max(0, Math.floor(ctx.finiteNumber(roomContext.recommendedLevel, 0))),
        successRate: 0,
        doubleChance: 0,
        progressPerAction: 0,
        experiencePerAction: 0,
        predictedExperience: 0,
        actualExperienceGain: 0,
        startSkillExperience: 0,
        endSkillExperience: 0,
        totalExperience: 0,
        targetWorkValue: 0,
        currentWorkValue: 0,
        currentProgressPct: 0,
        targetLevel: 0,
        currentEnhLevel: 0,
        actions: [],
        lastActionCounter: 0,
        lastSnapshot: null,
        incomplete: false,
        incompleteReasons: [],
        completed: false
      };
      ctx.persistRoomLogStorage();
      ctx.refreshRoomLogPanelIfVisible();
      return ctx.activeRoomLogSession;
    };

    ctx.handleRoomLogProgressMessage = function handleRoomLogProgressMessage(roomProgressMessage) {
      if (!roomProgressMessage || typeof roomProgressMessage !== "object") {
        return;
      }
      const state = ctx.getGameState();
      const roomContext = ctx.getCurrentSkillingRoomContext(state);
      if (!roomContext) {
        return;
      }
      const snapshot = ctx.buildRoomLogSnapshot(roomProgressMessage);
      if (!snapshot) {
        return;
      }
      const session = ctx.ensureRoomLogSession(state, roomContext, snapshot);
      if (!session) {
        return;
      }
      ctx.appendRoomLogAction(session, snapshot);
      ctx.refreshRoomLogSessionExperience(session, state, roomContext, snapshot);
      ctx.persistRoomLogStorage();
      ctx.refreshRoomLogPanelIfVisible();
    };

    ctx.syncRoomLogSessionState = function syncRoomLogSessionState(state) {
      if (!state?.characterLabyrinth) {
        if (ctx.activeRoomLogSession) {
          ctx.finalizeActiveRoomLogSession({ forceIncompleteReason: "left_labyrinth", completed: false });
        }
        return;
      }

      const combatRoomContext = ctx.getCurrentCombatRoomContext(state);
      const isCombatRunning = Boolean(
        combatRoomContext && Array.isArray(state.labyrinthBattleMonsters) && state.labyrinthBattleMonsters.length > 0
      );
      if (isCombatRunning) {
        ctx.ensureCombatRoomLogSession(state, combatRoomContext);
        return;
      }

      if (!ctx.activeRoomLogSession) {
        return;
      }

      if (ctx.activeRoomLogSession.mode === "combat") {
        ctx.finalizeActiveRoomLogSession({ completed: true });
        return;
      }

      const roomContext = ctx.getCurrentSkillingRoomContext(state);
      if (!roomContext || !state.labyrinthRoomProgress) {
        ctx.finalizeActiveRoomLogSession();
        return;
      }
      const snapshot = ctx.buildRoomLogSnapshot(state.labyrinthRoomProgress);
      if (!snapshot) {
        return;
      }
      const mode = snapshot.isEnhancing ? "enhancing" : "skilling";
      const activeSessionKey = ctx.buildRoomLogSessionKey(state, roomContext, mode);
      if (ctx.activeRoomLogSession.sessionKey !== activeSessionKey) {
        ctx.finalizeActiveRoomLogSession({ forceIncompleteReason: "room_switch" });
        return;
      }
      ctx.activeRoomLogSession.lastSnapshot = snapshot;
      ctx.activeRoomLogSession.lastActionCounter = snapshot.actionCounter;
      ctx.applyRoomLogSnapshotToSession(ctx.activeRoomLogSession, snapshot);
      ctx.refreshRoomLogSessionExperience(ctx.activeRoomLogSession, state, roomContext, snapshot);
    };

    ctx.initializeRoomLogState = function initializeRoomLogState() {
      const loaded = ctx.loadRoomLogStorage();
      ctx.roomLogSessions = ctx.trimRoomLogSessions(loaded.sessions);
      ctx.activeRoomLogSession = null;

      const staleActive = loaded.active;
      if (staleActive) {
        ctx.markRoomLogSessionIncomplete(staleActive, "reload_recovered");
        staleActive.completed = false;
        staleActive.endedAt = Date.now();
        const stored = ctx.sanitizeRoomLogSession(staleActive);
        if (stored) {
          ctx.roomLogSessions.unshift(stored);
          ctx.roomLogSessions = ctx.trimRoomLogSessions(ctx.roomLogSessions);
        }
      }

      ctx.persistRoomLogStorage();
    };
  };
})(globalThis);
