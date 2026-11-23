// Adapted from 迷宫胜率计算器 1.6.0, dakonglong, MIT. See docs/THIRD_PARTY.md.
(function (root) {
  "use strict";
  root.MwiLabyrinthCalculatorModules ||= {};
  root.MwiLabyrinthCalculatorModules["configuration"] = function (ctx) {
    ctx.normalizeUiLanguage = function normalizeUiLanguage(value) {
      const raw = String(value || "")
        .trim()
        .toLowerCase();
      if (raw.startsWith("zh")) {
        return ctx.UI_LANGUAGE_ZH;
      }
      if (raw.startsWith("en")) {
        return ctx.UI_LANGUAGE_ZH;
      }
      return "";
    };

    ctx.getUiLanguage = function getUiLanguage() {
      try {
        const fromStorage = ctx.normalizeUiLanguage(ctx.storage.getItem(ctx.UI_LANGUAGE_STORAGE_KEY));
        if (fromStorage) {
          return fromStorage;
        }
      } catch (_error) {
        // Ignore storage read errors.
      }
      return ctx.UI_LANGUAGE_ZH;
    };

    ctx.isChineseUi = function isChineseUi() {
      return ctx.getUiLanguage() === ctx.UI_LANGUAGE_ZH;
    };

    ctx.t = function t(key, vars) {
      const lang = ctx.getUiLanguage();
      const template = (ctx.UI_TEXT[lang] && ctx.UI_TEXT[lang][key]) || ctx.UI_TEXT.en[key] || key;
      if (!vars || typeof vars !== "object") {
        return template;
      }
      return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, name) => {
        if (Object.prototype.hasOwnProperty.call(vars, name)) {
          return String(vars[name]);
        }
        return "";
      });
    };

    ctx.normalizeCombatSimTrials = function normalizeCombatSimTrials(value) {
      const n = Math.floor(Number(value));
      if (!Number.isFinite(n)) {
        return ctx.DEFAULT_COMBAT_SIM_TRIALS;
      }
      if (n < ctx.MIN_COMBAT_SIM_TRIALS) {
        return ctx.MIN_COMBAT_SIM_TRIALS;
      }
      if (n > ctx.MAX_COMBAT_SIM_TRIALS) {
        return ctx.MAX_COMBAT_SIM_TRIALS;
      }
      return n;
    };

    function saveTrialsSetting(key, value) {
      const normalized = ctx.normalizeCombatSimTrials(value);
      try {
        ctx.storage.setItem(key, String(normalized));
      } catch (_error) {
        // The current calculation can still use the normalized value.
      }
      return normalized;
    }

    function loadTrialsSetting(key, fallback) {
      try {
        const raw = ctx.storage.getItem(key)?.trim();
        if (!raw) return fallback;
        // Earlier versions accepted up to 5000, beyond the embedded engine's limit.
        if (Number(raw) > ctx.MAX_COMBAT_SIM_TRIALS) return saveTrialsSetting(key, ctx.MAX_COMBAT_SIM_TRIALS);
        return ctx.normalizeCombatSimTrials(raw);
      } catch (_error) {
        return fallback;
      }
    }

    ctx.loadCombatSimTrialsSetting = () =>
      loadTrialsSetting(ctx.COMBAT_SIM_TRIALS_STORAGE_KEY, ctx.DEFAULT_COMBAT_SIM_TRIALS);
    ctx.saveCombatSimTrialsSetting = (value) => saveTrialsSetting(ctx.COMBAT_SIM_TRIALS_STORAGE_KEY, value);
    ctx.loadAutomationCombatSimTrialsSetting = () =>
      loadTrialsSetting(ctx.AUTOMATION_COMBAT_SIM_TRIALS_STORAGE_KEY, ctx.DEFAULT_AUTOMATION_COMBAT_SIM_TRIALS);
    ctx.saveAutomationCombatSimTrialsSetting = (value) =>
      saveTrialsSetting(ctx.AUTOMATION_COMBAT_SIM_TRIALS_STORAGE_KEY, value);

    ctx.normalizeAutomationTargetWinRate = function normalizeAutomationTargetWinRate(value) {
      let n = Number(value);
      if (!Number.isFinite(n)) {
        return ctx.DEFAULT_AUTOMATION_TARGET_WIN_RATE;
      }
      if (n >= 0 && n <= 1) {
        n *= 100;
      }
      if (n < 0) {
        n = 0;
      }
      if (n > 100) {
        n = 100;
      }
      return Math.round(n * 10) / 10;
    };

    ctx.loadAutomationTargetWinRateSetting = function loadAutomationTargetWinRateSetting() {
      try {
        const raw = ctx.storage.getItem(ctx.AUTOMATION_TARGET_WIN_RATE_STORAGE_KEY);
        if (raw === null || raw === undefined) {
          return ctx.DEFAULT_AUTOMATION_TARGET_WIN_RATE;
        }
        const trimmed = String(raw).trim();
        if (!trimmed) {
          return ctx.DEFAULT_AUTOMATION_TARGET_WIN_RATE;
        }
        return ctx.normalizeAutomationTargetWinRate(trimmed);
      } catch (_error) {
        return ctx.DEFAULT_AUTOMATION_TARGET_WIN_RATE;
      }
    };

    ctx.saveAutomationTargetWinRateSetting = function saveAutomationTargetWinRateSetting(value) {
      const normalized = ctx.normalizeAutomationTargetWinRate(value);
      try {
        ctx.storage.setItem(ctx.AUTOMATION_TARGET_WIN_RATE_STORAGE_KEY, String(normalized));
      } catch (_error) {
        // Ignore storage errors and keep runtime value.
      }
      return normalized;
    };

    ctx.normalizeAutomationTargetSeconds = function normalizeAutomationTargetSeconds(value) {
      const n = Math.floor(Number(value));
      if (!Number.isFinite(n) || n <= 0) {
        return ctx.DEFAULT_AUTOMATION_TARGET_SECONDS;
      }
      return Math.min(ctx.MAX_AUTOMATION_TARGET_SECONDS, n);
    };

    ctx.loadAutomationTargetSecondsSetting = function loadAutomationTargetSecondsSetting() {
      try {
        const raw = ctx.storage.getItem(ctx.AUTOMATION_TARGET_SECONDS_STORAGE_KEY);
        if (raw === null || String(raw).trim() === "") {
          return ctx.DEFAULT_AUTOMATION_TARGET_SECONDS;
        }
        return ctx.normalizeAutomationTargetSeconds(raw);
      } catch (_error) {
        return ctx.DEFAULT_AUTOMATION_TARGET_SECONDS;
      }
    };

    ctx.saveAutomationTargetSecondsSetting = function saveAutomationTargetSecondsSetting(value) {
      const normalized = ctx.normalizeAutomationTargetSeconds(value);
      try {
        ctx.storage.setItem(ctx.AUTOMATION_TARGET_SECONDS_STORAGE_KEY, String(normalized));
      } catch (_error) {
        // Ignore storage errors and keep runtime value.
      }
      return normalized;
    };

    ctx.ROOM_DURATION_SECONDS = 120;

    ctx.ROOM_ENTRY_SECONDS = 1;

    ctx.BASE_ACTION_SECONDS = 10;

    ctx.BASE_ENHANCING_ACTION_SECONDS = 8;

    ctx.LABYRINTH_ENHANCING_BASE_TARGET_LEVEL = 3;

    ctx.LABYRINTH_ENHANCING_LEVEL_STEP = 50;

    ctx.LABYRINTH_COMBAT_ROOM_TYPE = "/labyrinth_room_types/combat";

    ctx.LABYRINTH_SKILLING_ROOM_TYPE = "/labyrinth_room_types/skilling";

    ctx.LABYRINTH_TREASURE_ROOM_TYPE = "/labyrinth_room_types/treasure";

    ctx.LABYRINTH_DESCEND_ROOM_TYPE = "/labyrinth_room_types/descend";

    ctx.DEFAULT_COMBAT_SIM_TRIALS = 500;

    ctx.DEFAULT_AUTOMATION_COMBAT_SIM_TRIALS = 2500;

    ctx.DEFAULT_AUTOMATION_TARGET_WIN_RATE = 70;

    ctx.MIN_COMBAT_SIM_TRIALS = 1;

    ctx.MAX_COMBAT_SIM_TRIALS = 3000;

    ctx.COMBAT_SIM_TRIALS_STORAGE_KEY = "mwi-labyrinth:calculator:clear_rate_combat_trials";

    ctx.AUTOMATION_COMBAT_SIM_TRIALS_STORAGE_KEY = "mwi-labyrinth:calculator:auto_combat_trials";

    ctx.AUTOMATION_TARGET_WIN_RATE_STORAGE_KEY = "mwi-labyrinth:calculator:auto_target_win_rate";

    ctx.AUTOMATION_TARGET_SECONDS_STORAGE_KEY = "mwi-labyrinth:calculator:auto_target_seconds";

    ctx.DEFAULT_AUTOMATION_TARGET_SECONDS = 300;

    ctx.MAX_AUTOMATION_TARGET_SECONDS = 100000;

    ctx.COMBAT_ONE_SECOND_NS = 1e9;

    ctx.COMBAT_SLOT_COUNT = 5;

    ctx.SIMULATOR_SUPPORTED_EQUIPMENT_TYPES = new Set([
      "/equipment_types/head",
      "/equipment_types/body",
      "/equipment_types/legs",
      "/equipment_types/feet",
      "/equipment_types/hands",
      "/equipment_types/main_hand",
      "/equipment_types/two_hand",
      "/equipment_types/off_hand",
      "/equipment_types/pouch",
      "/equipment_types/back",
      "/equipment_types/neck",
      "/equipment_types/earrings",
      "/equipment_types/ring",
      "/equipment_types/charm"
    ]);

    ctx.COMBAT_MODEL_SIGNATURE = "labyrinth-clear-rate-1.8.2-e30f758841ba-completed-xp-v1";

    ctx.LABYRINTH_ABILITY_NAME_ZH_MAP = {
      "/abilities/critical_aura": "暴击光环",
      "/abilities/elusiveness": "闪避",
      "/abilities/rain_of_arrows": "箭雨",
      "/abilities/penetrating_shot": "贯穿射击",
      "/abilities/steady_shot": "稳定射击",
      "/abilities/precision": "精确",
      "/abilities/flame_arrow": "烈焰箭",
      "/abilities/silencing_shot": "沉默之箭",
      "/abilities/aqua_arrow": "流水箭",
      "/abilities/quick_shot": "快速射击",
      "/abilities/mystic_aura": "元素光环",
      "/abilities/elemental_affinity": "元素增幅",
      "/abilities/frost_surge": "冰霜爆裂",
      "/abilities/mana_spring": "法力喷泉",
      "/abilities/water_strike": "流水冲击",
      "/abilities/firestorm": "火焰风暴",
      "/abilities/smoke_burst": "烟爆灭影",
      "/abilities/fireball": "火球",
      "/abilities/guardian_aura": "守护光环",
      "/abilities/toxic_pollen": "剧毒粉尘",
      "/abilities/natures_veil": "自然菌幕",
      "/abilities/life_drain": "生命吸取",
      "/abilities/entangle": "缠绕",
      "/abilities/fierce_aura": "物理光环",
      "/abilities/berserk": "狂暴",
      "/abilities/impale": "透骨之刺",
      "/abilities/puncture": "破甲之刺",
      "/abilities/penetrating_strike": "贯心之刺",
      "/abilities/cleave": "分裂斩",
      "/abilities/maim": "血刃斩",
      "/abilities/crippling_slash": "致残斩",
      "/abilities/toughness": "坚韧",
      "/abilities/sweep": "重扫",
      "/abilities/stunning_blow": "重锤",
      "/abilities/fracturing_impact": "碎裂冲击",
      "/abilities/speed_aura": "速度光环",
      "/abilities/frenzy": "狂速"
    };

    ctx.LABYRINTH_MONSTER_NAME_ZH_MAP = {
      "/monsters/shadow_archer": "暗影弓手",
      "/monsters/pyre_hunter": "火焰猎手",
      "/monsters/frost_sniper": "霜冻狙击手",
      "/monsters/siren": "海妖",
      "/monsters/salamander": "火蜥蜴",
      "/monsters/dryad": "树精",
      "/monsters/giant_scorpion": "巨蝎",
      "/monsters/giant_mantis": "巨螳螂",
      "/monsters/cyclops": "独眼巨人",
      "/monsters/mimic": "宝箱怪"
    };

    ctx.LABYRINTH_MONSTER_NAME_ZH_BY_TAIL = {
      shadow_archer: "暗影弓手",
      pyre_hunter: "火焰猎手",
      frost_sniper: "霜冻狙击手",
      siren: "海妖",
      salamander: "火蜥蜴",
      dryad: "树精",
      giant_scorpion: "巨蝎",
      giant_mantis: "巨螳螂",
      cyclops: "独眼巨人",
      mimic: "宝箱怪"
    };

    ctx.COMBAT_SKILL_HRID_BY_KEY = {
      stamina: "/skills/stamina",
      intelligence: "/skills/intelligence",
      attack: "/skills/attack",
      melee: "/skills/melee",
      defense: "/skills/defense",
      ranged: "/skills/ranged",
      magic: "/skills/magic"
    };

    ctx.COMBAT_LEVEL_SKILL_HRID = "/skills/combat";

    ctx.BADGE_CLASS = "mwi-labyrinth-calc-clear-rate-badge";

    ctx.STYLE_ID = "mwi-labyrinth-calc-clear-rate-style";

    ctx.CONTROL_ID = "mwi-labyrinth-calc-clear-rate-control";

    ctx.CONTROL_CLASS = "mwi-labyrinth-calc-clear-rate-control";

    ctx.CONTROL_LOG_TOGGLE_CLASS = "mwi-labyrinth-calc-clear-rate-control__log-toggle";

    ctx.CONTROL_LOG_PANEL_CLASS = "mwi-labyrinth-calc-clear-rate-control__log-panel";

    ctx.CONTROL_LOG_LIST_CLASS = "mwi-labyrinth-calc-clear-rate-control__log-list";

    ctx.CONTROL_LOG_ITEM_CLASS = "mwi-labyrinth-calc-clear-rate-control__log-item";

    ctx.CONTROL_LOG_ACTION_CLASS = "mwi-labyrinth-calc-clear-rate-control__log-action";

    ctx.CONTROL_LOG_META_CLASS = "mwi-labyrinth-calc-clear-rate-control__log-meta";

    ctx.CONTROL_LOG_INCOMPLETE_CLASS = "mwi-labyrinth-calc-clear-rate-control__log-incomplete";

    ctx.ROOM_LOG_FLOAT_ID = "mwi-labyrinth-calc-room-log-floating";

    ctx.ROOM_LOG_FLOAT_CLASS = "mwi-labyrinth-calc-room-log-floating";

    ctx.ROOM_LOG_FLOAT_HEADER_CLASS = "mwi-labyrinth-calc-room-log-floating__header";

    ctx.ROOM_LOG_FLOAT_TITLE_CLASS = "mwi-labyrinth-calc-room-log-floating__title";

    ctx.ROOM_LOG_FLOAT_ACTIONS_CLASS = "mwi-labyrinth-calc-room-log-floating__actions";

    ctx.ROOM_LOG_FLOAT_CLEAR_CLASS = "mwi-labyrinth-calc-room-log-floating__clear";

    ctx.ROOM_LOG_FLOAT_CLOSE_CLASS = "mwi-labyrinth-calc-room-log-floating__close";

    ctx.ROOM_LOG_STORAGE_KEY = "mwi-labyrinth:calculator:skilling_room_logs_v1";

    ctx.ROOM_LOG_POSITION_STORAGE_KEY = "mwi-labyrinth:calculator:skilling_room_logs_position_v1";

    ctx.ROOM_LOG_MAX_SESSIONS = 30;

    ctx.ROOM_LOG_ACTION_OUTCOME_SUCCESS = "success";

    ctx.ROOM_LOG_ACTION_OUTCOME_FAIL = "fail";

    ctx.ROOM_LOG_ACTION_OUTCOME_DOUBLE = "double";

    ctx.ROOM_LOG_ACTION_OUTCOME_UNKNOWN = "unknown";

    ctx.CONTROL_DISTRIBUTION_TOGGLE_CLASS = "mwi-labyrinth-calc-clear-rate-control__distribution-toggle";

    ctx.CONTROL_DISTRIBUTION_STEP_CLASS = "mwi-labyrinth-calc-clear-rate-control__distribution-step";

    ctx.CONTROL_DISTRIBUTION_STEP_INPUT_CLASS = "mwi-labyrinth-calc-clear-rate-control__distribution-step-input";

    ctx.ROOM_DISTRIBUTION_FLOAT_ID = "mwi-labyrinth-calc-room-distribution-floating";

    ctx.ROOM_DISTRIBUTION_FLOAT_CLASS = "mwi-labyrinth-calc-room-distribution-floating";

    ctx.ROOM_DISTRIBUTION_HEADER_CLASS = "mwi-labyrinth-calc-room-distribution-floating__header";

    ctx.ROOM_DISTRIBUTION_TITLE_CLASS = "mwi-labyrinth-calc-room-distribution-floating__title";

    ctx.ROOM_DISTRIBUTION_CLOSE_CLASS = "mwi-labyrinth-calc-room-distribution-floating__close";

    ctx.ROOM_DISTRIBUTION_BODY_CLASS = "mwi-labyrinth-calc-room-distribution-floating__body";

    ctx.ROOM_DISTRIBUTION_META_CLASS = "mwi-labyrinth-calc-room-distribution-floating__meta";

    ctx.ROOM_DISTRIBUTION_LIST_CLASS = "mwi-labyrinth-calc-room-distribution-floating__list";

    ctx.ROOM_DISTRIBUTION_ROW_CLASS = "mwi-labyrinth-calc-room-distribution-floating__row";

    ctx.ROOM_DISTRIBUTION_BAR_CLASS = "mwi-labyrinth-calc-room-distribution-floating__bar";

    ctx.ROOM_DISTRIBUTION_POSITION_STORAGE_KEY = "mwi-labyrinth:calculator:room_distribution_position_v1";

    ctx.ROOM_DISTRIBUTION_DEFAULT_STEP = 25;

    ctx.ROOM_DISTRIBUTION_MIN_STEP = 5;

    ctx.ROOM_DISTRIBUTION_MAX_STEP = 100;

    ctx.ROOM_DISTRIBUTION_LEVEL_SPAN = 20;

    ctx.LIVE_ACTION_RATE_ID = "mwi-labyrinth-calc-live-action-rate";

    ctx.LIVE_ACTION_RATE_CLASS = "mwi-labyrinth-calc-live-action-rate";

    ctx.LIVE_ACTION_RATE_MWITOOLS_COLOR = "#ffffff";

    ctx.LIVE_ACTION_RATE_MWITOOLS_FONT_SIZE = "0.875rem";

    ctx.CONTROL_SCHEMA_ATTR = "data-mwi-labyrinth-calc-labyrinth-calc-clear-schema";

    ctx.CONTROL_SCHEMA_VERSION = "7";

    ctx.CONTROL_BOUND_FLAG = "__mwiLabyrinthCalcControlBound";

    ctx.PREVIEW_TOOLTIP_ID = "mwi-labyrinth-calc-clear-rate-preview";

    ctx.PREVIEW_TOOLTIP_CLASS = "mwi-labyrinth-calc-clear-rate-preview";

    ctx.PREVIEW_CELL_BOUND_FLAG = "__mwiLabyrinthCalcPreviewBound";

    ctx.AUTOMATION_ESTIMATE_CONTROL_ID = "mwi-labyrinth-calc-auto-estimate-control";

    ctx.AUTOMATION_ESTIMATE_CONTROL_CLASS = "mwi-labyrinth-calc-auto-estimate-control";

    ctx.AUTOMATION_ESTIMATE_CONTROL_SCHEMA_ATTR = "data-mwi-labyrinth-calc-labyrinth-calc-auto-schema";

    ctx.AUTOMATION_ESTIMATE_CONTROL_SCHEMA_VERSION = "5";

    ctx.AUTOMATION_ESTIMATE_CONTROL_TRIALS_INPUT_CLASS = "mwi-labyrinth-calc-auto-estimate-control__trials-input";

    ctx.AUTOMATION_ESTIMATE_CONTROL_TARGET_RATE_INPUT_CLASS =
      "mwi-labyrinth-calc-auto-estimate-control__target-rate-input";

    ctx.AUTOMATION_ESTIMATE_CONTROL_TARGET_RATE_LABEL_CLASS =
      "mwi-labyrinth-calc-auto-estimate-control__target-rate-label";

    ctx.AUTOMATION_ESTIMATE_CONTROL_TARGET_SECONDS_INPUT_CLASS =
      "mwi-labyrinth-calc-auto-estimate-control__target-seconds-input";

    ctx.AUTOMATION_ESTIMATE_CONTROL_TARGET_SECONDS_LABEL_CLASS =
      "mwi-labyrinth-calc-auto-estimate-control__target-seconds-label";

    ctx.AUTOMATION_ESTIMATE_CONTROL_RECOMMEND_SECONDS_BUTTON_CLASS =
      "mwi-labyrinth-calc-auto-estimate-control__recommend-seconds-button";

    ctx.AUTOMATION_ESTIMATE_CONTROL_RECOMMEND_BUTTON_CLASS =
      "mwi-labyrinth-calc-auto-estimate-control__recommend-button";

    ctx.AUTOMATION_MAX_FLOOR_TABLE_HEADER_CLASS = "mwi-labyrinth-calc-auto-floor-header";

    ctx.AUTOMATION_MAX_FLOOR_CELL_CLASS = "mwi-labyrinth-calc-auto-floor-cell";

    ctx.AUTOMATION_ESTIMATE_TABLE_HEADER_CLASS = "mwi-labyrinth-calc-auto-estimate-header";

    ctx.AUTOMATION_ESTIMATE_CELL_CLASS = "mwi-labyrinth-calc-auto-estimate-cell";

    ctx.AUTOMATION_ESTIMATE_CELL_CHANCE_CLASS = "mwi-labyrinth-calc-auto-estimate-cell__chance";

    ctx.AUTOMATION_ESTIMATE_CELL_ETA_CLASS = "mwi-labyrinth-calc-auto-estimate-cell__eta";

    ctx.AUTOMATION_ESTIMATE_CELL_ETA_DANGER_CLASS = "mwi-labyrinth-calc-auto-estimate-cell__eta--danger";

    ctx.AUTOMATION_ESTIMATE_CELL_BOUND_FLAG = "__mwiLabyrinthCalcAutoEstimateCellBound";

    ctx.AUTOMATION_ESTIMATE_CELL_RENDER_TOKEN_ATTR = "data-mwi-labyrinth-calc-auto-render-token";

    ctx.AUTOMATION_RECOMMEND_TABLE_HEADER_CLASS = "mwi-labyrinth-calc-auto-recommend-header";

    ctx.AUTOMATION_RECOMMEND_CELL_CLASS = "mwi-labyrinth-calc-auto-recommend-cell";

    ctx.AUTOMATION_RECOMMEND_CELL_RENDER_TOKEN_ATTR = "data-mwi-labyrinth-calc-auto-recommend-token";

    ctx.AUTOMATION_RECOMMEND_CELL_BOUND_FLAG = "__mwiLabyrinthCalcAutoRecommendCellBound";

    ctx.AUTOMATION_RECOMMEND_MIN_DELTA = -300;

    ctx.AUTOMATION_RECOMMEND_MAX_DELTA = 300;

    ctx.COMBAT_MIN_ROOM_LEVEL = 20;

    ctx.AUTOMATION_RECOMMEND_COMBAT_TRIALS = Math.max(
      ctx.MIN_COMBAT_SIM_TRIALS,
      Math.min(ctx.MAX_COMBAT_SIM_TRIALS, Math.floor(3600 / ctx.ROOM_DURATION_SECONDS))
    );

    ctx.AUTOMATION_RECOMMEND_ACCEPTABLE_DIFF = 0.005;

    ctx.AUTOMATION_ESTIMATE_DEFAULT_SKIP_THRESHOLD = 100;

    ctx.LABYRINTH_UPGRADE_LEVELS_STORAGE_KEY = "mwi-labyrinth:calculator:upgrades:v1";

    ctx.LABYRINTH_STAT_UPGRADE_MAX_LEVEL = 12;

    ctx.LABYRINTH_UPGRADE_STEP_RATIO = 0.01;

    ctx.LABYRINTH_UPGRADE_SKILLING_SUCCESS_STEP_RATIO = 0.005;

    ctx.LABYRINTH_UPGRADE_KEY_SKILL_ACTION_SPEED = "/labyrinth_upgrades/skill_action_speed";

    ctx.LABYRINTH_UPGRADE_KEY_SKILLING_EFFICIENCY = "/labyrinth_upgrades/skilling_efficiency";

    ctx.LABYRINTH_UPGRADE_KEY_SKILLING_SUCCESS = "/labyrinth_upgrades/skilling_success";

    ctx.LABYRINTH_UPGRADE_KEY_SKILLING_DOUBLE_PROGRESS = "/labyrinth_upgrades/skilling_double_progress";

    ctx.LABYRINTH_UPGRADE_KEY_COMBAT_DAMAGE = "/labyrinth_upgrades/combat_damage";

    ctx.LABYRINTH_UPGRADE_KEY_ATTACK_SPEED = "/labyrinth_upgrades/attack_speed";

    ctx.LABYRINTH_UPGRADE_KEY_CAST_SPEED = "/labyrinth_upgrades/cast_speed";

    ctx.LABYRINTH_UPGRADE_KEY_CRITICAL_RATE = "/labyrinth_upgrades/critical_rate";

    ctx.LABYRINTH_UPGRADE_KEY_LABYRINTH_EXPERIENCE = "/labyrinth_upgrades/labyrinth_experience";

    ctx.COMBAT_STAT_UPGRADES = [
      {
        key: ctx.LABYRINTH_UPGRADE_KEY_COMBAT_DAMAGE,
        buff: "/buff_uniques/labyrinth_upgrade_combat_damage",
        zh: "战斗伤害",
        en: "Combat damage"
      },
      {
        key: ctx.LABYRINTH_UPGRADE_KEY_ATTACK_SPEED,
        buff: "/buff_uniques/labyrinth_upgrade_attack_speed",
        zh: "攻击速度",
        en: "Attack speed"
      },
      {
        key: ctx.LABYRINTH_UPGRADE_KEY_CAST_SPEED,
        buff: "/buff_uniques/labyrinth_upgrade_cast_speed",
        zh: "施法速度",
        en: "Cast speed"
      },
      {
        key: ctx.LABYRINTH_UPGRADE_KEY_CRITICAL_RATE,
        buff: "/buff_uniques/labyrinth_upgrade_critical_rate",
        zh: "暴击率",
        en: "Critical rate"
      }
    ];

    ctx.LABYRINTH_UPGRADE_KEYS = [
      ctx.LABYRINTH_UPGRADE_KEY_SKILL_ACTION_SPEED,
      ctx.LABYRINTH_UPGRADE_KEY_SKILLING_EFFICIENCY,
      ctx.LABYRINTH_UPGRADE_KEY_SKILLING_SUCCESS,
      ctx.LABYRINTH_UPGRADE_KEY_SKILLING_DOUBLE_PROGRESS,
      ctx.LABYRINTH_UPGRADE_KEY_COMBAT_DAMAGE,
      ctx.LABYRINTH_UPGRADE_KEY_ATTACK_SPEED,
      ctx.LABYRINTH_UPGRADE_KEY_CAST_SPEED,
      ctx.LABYRINTH_UPGRADE_KEY_CRITICAL_RATE,
      ctx.LABYRINTH_UPGRADE_KEY_LABYRINTH_EXPERIENCE
    ];

    ctx.LABYRINTH_AUTOMATION_SKILL_ROOM_TYPES = [
      { key: "milking", skillHrid: "/skills/milking" },
      { key: "foraging", skillHrid: "/skills/foraging" },
      { key: "woodcutting", skillHrid: "/skills/woodcutting" },
      { key: "cheesesmithing", skillHrid: "/skills/cheesesmithing" },
      { key: "crafting", skillHrid: "/skills/crafting" },
      { key: "tailoring", skillHrid: "/skills/tailoring" },
      { key: "cooking", skillHrid: "/skills/cooking" },
      { key: "brewing", skillHrid: "/skills/brewing" },
      { key: "alchemy", skillHrid: "/skills/alchemy" },
      { key: "enhancing", skillHrid: "/skills/enhancing" }
    ];

    ctx.LABYRINTH_AUTOMATION_COMBAT_ROOM_TYPES = [
      { key: "shadow_archer", monsterHrid: "/monsters/shadow_archer" },
      { key: "pyre_hunter", monsterHrid: "/monsters/pyre_hunter" },
      { key: "frost_sniper", monsterHrid: "/monsters/frost_sniper" },
      { key: "siren", monsterHrid: "/monsters/siren" },
      { key: "salamander", monsterHrid: "/monsters/salamander" },
      { key: "dryad", monsterHrid: "/monsters/dryad" },
      { key: "giant_scorpion", monsterHrid: "/monsters/giant_scorpion" },
      { key: "giant_mantis", monsterHrid: "/monsters/giant_mantis" },
      { key: "cyclops", monsterHrid: "/monsters/cyclops" },
      { key: "mimic", monsterHrid: "/monsters/mimic" }
    ];

    ctx.LABYRINTH_AUTOMATION_SKILL_NAME_ZH_BY_KEY = {
      milking: "挤奶",
      foraging: "采摘",
      woodcutting: "伐木",
      cheesesmithing: "奶酪锻造",
      crafting: "制作",
      tailoring: "缝纫",
      cooking: "烹饪",
      brewing: "冲泡",
      alchemy: "炼金",
      enhancing: "强化"
    };

    ctx.LABYRINTH_AUTOMATION_SKILL_NAME_EN_BY_KEY = {
      milking: "Milking",
      foraging: "Foraging",
      woodcutting: "Woodcutting",
      cheesesmithing: "Cheesesmithing",
      crafting: "Crafting",
      tailoring: "Tailoring",
      cooking: "Cooking",
      brewing: "Brewing",
      alchemy: "Alchemy",
      enhancing: "Enhancing"
    };

    ctx.SIMULATOR_BRIDGE_URL_STORAGE_KEY = "mwi-labyrinth:calculator:simulator_bridge_url";

    ctx.SIMULATOR_BRIDGE_DEFAULT_URL = "https://shykai.github.io/MWICombatSimulatorTest/dist/";

    ctx.SIMULATOR_BRIDGE_LEGACY_URL_PREFIXES = [
      "https://amvoidguy.github.io/MWICombatSimulatorTest/",
      "https://shykai.github.io/MWICombatSimulatorTest/",
      "https://shykai.github.io/mwisim/",
      "https://truthligh.github.io/MWICombatSimulator/"
    ];

    ctx.SIMULATOR_BRIDGE_PAYLOAD_PARAM = "mwiLabBridge";

    ctx.SIMULATOR_BRIDGE_SOURCE = "mwi-labyrinth-calc-clear-rate-overlay";

    ctx.SIMULATOR_BRIDGE_VERSION = 1;

    ctx.ETA_INFINITE_TEXT = "∞";

    ctx.PANEL_REFRESH_POLL_MS = 1000;

    ctx.PANEL_REFRESH_DEBOUNCE_MS = 120;

    ctx.AUTO_RECALC_DEBOUNCE_MS = 600;

    ctx.UI_LANGUAGE_STORAGE_KEY = "i18nextLng";

    ctx.UI_LANGUAGE_EN = "en";

    ctx.UI_LANGUAGE_ZH = "zh";

    ctx.UI_TEXT = {
      en: {
        pending: "Pending",
        tokenExpected: "Token Expected",
        experiencePerAction: "EXP / Action",
        experiencePerRoom: "EXP / Room",
        experiencePerHour: "EXP / Hour",
        skillingBoxExpected: "Skilling Box Expected",
        combatBoxExpected: "Combat Box Expected",
        refiningChestExpected: "Refining Chest Expected",
        skillingRoomPreview: "Skilling Room Preview",
        combatRoomPreview: "Combat Room Preview",
        treasureRoomPreview: "Treasure Room Preview",
        floorExitPreview: "Floor Exit Preview",
        floorRewardPreviewFmt: "Floor {floor} completion rewards",
        roomPreview: "Room Preview",
        styleStab: "Stab",
        styleSlash: "Slash",
        styleSmash: "Smash",
        styleRanged: "Ranged",
        styleMagic: "Magic",
        unknown: "Unknown",
        accuracySuffix: "Accuracy",
        damageSuffix: "Damage",
        evasionSuffix: "Evasion",
        water: "Water",
        nature: "Nature",
        fire: "Fire",
        physical: "Physical",
        waterResistance: "Water Resistance",
        natureResistance: "Nature Resistance",
        fireResistance: "Fire Resistance",
        armor: "Armor",
        failureDefense: "Insufficient Defense",
        failureDamage: "Insufficient Damage",
        targetEnhancement: "Target Enhancement",
        successRate: "Success Rate",
        doubleProgress: "Double Progress",
        twoMinuteActions: "Actions in 2m",
        actionDuration: "Action Duration",
        needSpeedForOneMoreAction: "Speed for +1 Action",
        workPower: "Work Power",
        needEfficiencyForOneLessProgress: "Efficiency for -1 Progress",
        nextLevelClearChance: "Level",
        efficiencyTierClearChance: "Efficiency",
        speedTierClearChance: "Speed",
        nextSkillingSuccessClearChance: "Skilling Success",
        nextSkillingDoubleProgressClearChance: "Skilling Double Progress",
        alreadyOptimal: "Already Optimal",
        combatStyle: "Combat Style",
        damageType: "Damage Type",
        attackInterval: "Attack Interval",
        castSpeed: "Cast Speed",
        maxHp: "Max HP",
        operation: "Action",
        rightClickOpenSimulator: "Right-click to open simulator",
        failureReason: "Failure Reason",
        accuracyDefault: "Accuracy",
        damageDefault: "Damage",
        evasionDefault: "Evasion",
        mitigationDefault: "Armor",
        automationPreview: "Automation Preview",
        status: "Status",
        level: "Level",
        maxFloor: "Max Floor",
        chanceEta: "Chance / ETA",
        targetWinRate: "Target Win %",
        recommendDelta: "Recommend by Win %",
        recommendBySeconds: "Recommend by Time",
        targetSeconds: "Target Time (s)",
        targetSecondsHint: "Upper limit of the expected clear time in seconds (failed runs included)",
        recommendSettingLevel: "Recommend Setting Level",
        skipLevel: "Skip Level",
        skipLevelLong: "Skip if above level",
        combatTrials: "Completed Battles",
        calcChance: "Calculate",
        calculating: "Calculating...",
        calcMaze: "Calculate Labyrinth",
        automationListNotFound: "Open the labyrinth Automation tab, then calculate here",
        noCalculableRooms: "No calculable rooms",
        missingClientData: "Missing client data",
        preparing: "Preparing...",
        calculatingProgressFmt: "Calculating {current}/{total}",
        skipRoom: "Skip Room",
        calcFailed: "Calculation failed",
        calcDone: "Calculation complete",
        roomLog: "Logs",
        roomLogTitleFmt: "Room logs",
        roomLogEmpty: "Records appear after a room challenge",
        roomLogIncomplete: "Incomplete",
        roomLogModeSkilling: "Skilling",
        roomLogModeEnhancing: "Enhancing",
        roomLogModeCombat: "Combat",
        roomLogActionGap: "Missed action records",
        roomLogComingSoon: "Coming Soon",
        roomLogRateFmt: "Success {success}% / Double {double}%",
        roomLogWorkFmt: "Work {value}",
        roomLogExpFmt: "EXP {value}",
        roomLogProgressFmt: "Progress {current}% / {target}%",
        roomLogEnhFmt: "Enh +{current}/+{target}",
        roomLogDurationFmt: "{seconds}s",
        roomLogClear: "Clear",
        roomLogClose: "Close",
        roomDistribution: "Win Rate Distribution",
        roomDistributionStep: "Bin Width",
        roomDistributionTitleFmt: "Win rates · Floor {floor}",
        roomDistributionWaiting: "Waiting for Calculate Labyrinth",
        roomDistributionCalculatingFmt: "Calculating {current}/{total}",
        roomDistributionMetaFmt: "Lv.{min}–{max} · Valid {valid}/{total} · Failed {failed}",
        roomDistributionTrialsFmt: "Combat: {trials} completed battles",
        roomDistributionNoSamples: "No valid samples",
        skippedRooms: "Rooms skipped",
        noSupplies: "No supply crates equipped",
        partialSkipped: "Some rooms skipped",
        missingCoffeeCrate: "Coffee Crate",
        missingFoodCrate: "Food Crate",
        missingTeaCrate: "Tea Crate",
        missingCrateFmt: "Missing {crates}",
        progressFmt: "Progress {percent}%",
        notInLabyrinth: "Not in labyrinth",
        noLabyrinthData: "No labyrinth data",
        cellsNotFound: "Grid cells not found",
        noNewTiles: "No new tiles",
        roomFmt: "Room {current}/{total}",
        combatFmt: "Combat {current}/{total}",
        autoNewTiles: "New tiles found, auto calculating",
        readGameDataFailed: "Unable to read game data. Refresh and try again.",
        exportableCombatRoomNotFound: "Could not identify an exportable combat room.",
        skippedCannotExport: "This room is skipped and cannot be exported.",
        simulatorExportNoLoadout: "Simulator export failed: missing usable loadout.",
        liveEnhFmt: " [Clear {chance}% | +{current}/+{target} | {left} left]",
        liveBasicFmt: " [Clear {chance}% | {left} left]",
        liveSuccessFmt: "Success {chance}%",
        liveDoubleFmt: "Double {chance}%",
        liveActionsFmt: "Actions {current}/{total}",
        liveEnhTitleFmt: "Enhance +{current}/+{target}",
        liveProgressFmt: "Progress {current}/{target}",
        waitingOptimization: "(Pending optimization)"
      },
      zh: {
        pending: "待计算",
        tokenExpected: "代币期望",
        experiencePerAction: "每次经验",
        experiencePerRoom: "每场经验",
        experiencePerHour: "每小时经验",
        skillingBoxExpected: "生活紫盒期望",
        combatBoxExpected: "战斗紫盒期望",
        refiningChestExpected: "精炼宝箱期望",
        skillingRoomPreview: "生活试炼",
        combatRoomPreview: "战斗房间",
        treasureRoomPreview: "宝箱房间预览",
        floorExitPreview: "楼层出口预览",
        floorRewardPreviewFmt: "第 {floor} 层通关奖励",
        roomPreview: "房间预览",
        styleStab: "刺击",
        styleSlash: "斩击",
        styleSmash: "钝击",
        styleRanged: "远程",
        styleMagic: "魔法",
        unknown: "未知",
        accuracySuffix: "精准度",
        damageSuffix: "伤害",
        evasionSuffix: "闪避",
        water: "水系",
        nature: "自然系",
        fire: "火系",
        physical: "物理",
        waterResistance: "水系抗性",
        natureResistance: "自然系抗性",
        fireResistance: "火系抗性",
        armor: "护甲",
        failureDefense: "防御不足",
        failureDamage: "伤害不足",
        targetEnhancement: "目标强化",
        successRate: "成功率",
        doubleProgress: "双倍进度",
        twoMinuteActions: "2分钟次数",
        actionDuration: "单次时长",
        needSpeedForOneMoreAction: "多1次行动需速度",
        workPower: "工作能力",
        needEfficiencyForOneLessProgress: "减1次进度需效率",
        nextLevelClearChance: "等级",
        efficiencyTierClearChance: "效率",
        speedTierClearChance: "速度",
        nextSkillingSuccessClearChance: "专业成功率",
        nextSkillingDoubleProgressClearChance: "专业双倍进度",
        alreadyOptimal: "已最优",
        combatStyle: "战斗风格",
        damageType: "伤害类型",
        attackInterval: "攻击间隔",
        castSpeed: "施法速度",
        maxHp: "最大HP",
        operation: "操作",
        rightClickOpenSimulator: "右键打开模拟器",
        failureReason: "失败原因",
        accuracyDefault: "精准度",
        damageDefault: "伤害",
        evasionDefault: "闪避",
        mitigationDefault: "护甲",
        automationPreview: "自动化预览",
        status: "状态",
        level: "等级",
        maxFloor: "最高层数",
        chanceEta: "胜率/耗时",
        targetWinRate: "目标胜率 (%)",
        recommendDelta: "按胜率推荐",
        recommendBySeconds: "按耗时推荐",
        targetSeconds: "目标耗时(秒)",
        targetSecondsHint: "预计通关耗时上限（秒，含失败场次）",
        recommendSettingLevel: "推荐设置等级",
        skipLevel: "跳过等级",
        skipLevelLong: "跳过如果高出等级",
        combatTrials: "战斗场数",
        calcChance: "计算胜率",
        calculating: "计算中...",
        calcMaze: "计算迷宫",
        automationListNotFound: "请先打开迷宫的自动化页，再在这里计算",
        noCalculableRooms: "无可计算房间",
        missingClientData: "缺少客户端数据",
        preparing: "准备中...",
        calculatingProgressFmt: "计算中 {current}/{total}",
        skipRoom: "跳过房间",
        calcFailed: "计算失败",
        calcDone: "计算完成",
        roomLog: "日志",
        roomLogTitleFmt: "房间日志",
        roomLogEmpty: "完成房间挑战后显示记录",
        roomLogIncomplete: "不完整",
        roomLogModeSkilling: "技能",
        roomLogModeEnhancing: "强化",
        roomLogModeCombat: "战斗",
        roomLogActionGap: "行动记录缺失",
        roomLogComingSoon: "敬请期待",
        roomLogRateFmt: "成功率 {success}% / 双倍 {double}%",
        roomLogWorkFmt: "工作能力 {value}",
        roomLogExpFmt: "经验 {value}",
        roomLogProgressFmt: "进度 {current}% / {target}%",
        roomLogEnhFmt: "强化 +{current}/+{target}",
        roomLogDurationFmt: "{seconds} 秒",
        roomLogClear: "清空",
        roomLogClose: "关闭",
        roomDistribution: "胜率分布",
        roomDistributionStep: "分档",
        roomDistributionTitleFmt: "胜率分布 · {floor} 层",
        roomDistributionWaiting: "点击“计算迷宫”生成分布",
        roomDistributionCalculatingFmt: "正在计算 {current}/{total}",
        roomDistributionMetaFmt: "Lv.{min}～{max} · 有效样本 {valid}/{total} · 失败 {failed}",
        roomDistributionTrialsFmt: "战斗完成 {trials} 场",
        roomDistributionNoSamples: "没有有效样本",
        skippedRooms: "已跳过房间",
        noSupplies: "未携带补给箱",
        partialSkipped: "部分房间已跳过",
        missingCoffeeCrate: "咖啡箱",
        missingFoodCrate: "食物箱",
        missingTeaCrate: "茶叶箱",
        missingCrateFmt: "未携带{crates}",
        progressFmt: "进度 {percent}%",
        notInLabyrinth: "不在迷宫",
        noLabyrinthData: "无迷宫数据",
        cellsNotFound: "未找到格子",
        noNewTiles: "无新增地块",
        roomFmt: "房间 {current}/{total}",
        combatFmt: "战斗 {current}/{total}",
        autoNewTiles: "发现新地块，自动计算",
        readGameDataFailed: "无法读取游戏数据，请刷新页面后重试。",
        exportableCombatRoomNotFound: "未识别到可导出的战斗房间。",
        skippedCannotExport: "该房间当前设置会跳过，无法导出模拟器。",
        simulatorExportNoLoadout: "导出模拟器数据失败：缺少可用配装。",
        liveEnhFmt: "胜率 {chance}% · +{current}/+{target} · 剩 {left} 次",
        liveBasicFmt: "胜率 {chance}% · 剩 {left} 次",
        liveSuccessFmt: "成功率 {chance}%",
        liveDoubleFmt: "双倍 {chance}%",
        liveActionsFmt: "已行动 {current}/{total}",
        liveEnhTitleFmt: "强化 +{current}/+{target}",
        liveProgressFmt: "进度 {current}/{target}",
        waitingOptimization: "(等待优化)"
      }
    };

    ctx.cachedInitClientDataRaw = "";

    ctx.cachedInitClientData = null;

    ctx.manualUpdateRunning = false;

    ctx.combatWorkerScriptPromise = null;

    ctx.combatSimulatorWorker = null;

    ctx.combatSimulatorWorkerUrl = "";

    ctx.combatWorkerRequestId = 0;

    ctx.lastLabyrinthDisplaySignature = "";

    ctx.lastProgressRoomKey = "";

    ctx.wasRoomChallengeRunning = false;

    ctx.lastObservedPathRoomKey = "";

    ctx.autoRecalcArmed = false;

    ctx.autoRecalcLabyrinthSignature = "";

    ctx.lastCalculatedCalculableRoomSignature = "";

    ctx.lastCalculatedCalculableRoomCount = 0;

    ctx.lastCalculatedCalculableRoomEntries = new Set();

    ctx.pendingAutoRecalcRoomKeys = new Set();

    ctx.autoRecalcTimerId = 0;

    ctx.panelRefreshTimerId = 0;

    ctx.combatWorkerPendingRequests = new Map();

    ctx.skillingPreviewByCell = new WeakMap();

    ctx.combatPreviewByCell = new WeakMap();

    ctx.latestRoomEstimateByRoomKey = new Map();

    ctx.lastLiveActionRateToken = "";

    ctx.liveActionRateWsHookInstalled = false;

    ctx.automationEstimateByRoomTypeKey = new Map();

    ctx.automationEstimateSignatureByRoomTypeKey = new Map();

    ctx.automationRecommendByRoomTypeKey = new Map();

    ctx.automationRecommendSignatureByRoomTypeKey = new Map();

    ctx.automationEstimateRunning = false;

    ctx.automationEstimateRunningMode = "";

    ctx.automationRecommendBasis = "";

    ctx.automationEstimateStatusText = ctx.t("pending");

    ctx.automationEstimateColumnEnabled = false;

    ctx.automationRecommendColumnEnabled = false;

    ctx.automationWideLayoutNodes = [];

    ctx.lastLabyrinthCalcDoneMessage = "";

    ctx.latestLabyrinthUpgradeLevels = null;

    ctx.roomLogSessions = [];

    ctx.activeRoomLogSession = null;

    ctx.roomDistributionEnabled = false;

    ctx.roomDistributionSnapshot = null;

    ctx.roomDistributionRunning = false;

    ctx.roomDistributionProgress = null;

    ctx.roomDistributionRunToken = 0;
  };
})(globalThis);
