(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MwiLabyrinthTokens = api;
})(globalThis, function () {
  "use strict";
  const TOKEN = "/items/labyrinth_token";
  const integer = (value) => Number.isSafeInteger(value) && value >= 0;
  // Local client getUpgradeCost/getUpgradeMaxLevel/getUpgradeLevelFromCharacterInfo, checked 2026-11-10.
  const definitions = [
    [
      "cooldown",
      "入场冷却",
      "labyrinthCooldownHours",
      6,
      [800, 1200, 1800, 2600, 3600, 4800],
      72,
      -4,
      "每级减少 4 小时"
    ],
    ["torch_cap", "火把容量", "labyrinthTorchCap", 15, 100, 100, 20, "每级增加 20 支"],
    ["shroud_cap", "迷雾容量", "labyrinthShroudCap", 8, 80, 4, 1, "每级增加 1 个"],
    ["beacon_cap", "探照灯容量", "labyrinthBeaconCap", 10, 60, 5, 1, "每级增加 1 个"],
    ["full_auto", "完全自动化", "labyrinthFullAutoLevel", 15, 30, 0, 1, "每级增加 1 层"],
    ["skill_action_speed", "生活行动速度", "labyrinthSkillActionSpeedLevel", 12, 40, 0, 1, "每级增加 1%"],
    ["skilling_efficiency", "生活效率", "labyrinthSkillingEfficiencyLevel", 12, 40, 0, 1, "每级增加 1%"],
    ["skilling_success", "生活成功率", "labyrinthSkillingSuccessLevel", 12, 40, 0, 1, "每级增加 0.5%"],
    ["skilling_double_progress", "生活双倍进度", "labyrinthSkillingDoubleProgressLevel", 12, 40, 0, 1, "每级增加 1%"],
    ["combat_damage", "战斗伤害", "labyrinthCombatDamageLevel", 12, 40, 0, 1, "每级增加 1%"],
    ["attack_speed", "攻击速度", "labyrinthAttackSpeedLevel", 12, 40, 0, 1, "每级增加 1%"],
    ["cast_speed", "施法速度", "labyrinthCastSpeedLevel", 12, 40, 0, 1, "每级增加 1%"],
    ["critical_rate", "暴击率", "labyrinthCriticalRateLevel", 12, 40, 0, 1, "每级增加 1%"],
    ["labyrinth_experience", "迷宫经验", "labyrinthExperienceLevel", 12, 80, 0, 1, "每级增加 1%"]
  ];
  function values(container) {
    return container && typeof container.values === "function" && typeof container.get === "function"
      ? [...container.values()]
      : container && typeof container === "object"
        ? Object.values(container)
        : null;
  }
  function catalog(state, init, name = (hrid) => hrid) {
    const upgrades = definitions.map(([key, label, field, max, price, base, step, effect]) => {
      const raw = state?.characterInfo?.[field];
      const level = typeof raw === "number" ? (raw - base) / step : NaN;
      return {
        id: `/labyrinth_upgrades/${key}`,
        kind: "upgrade",
        name: label,
        effect,
        category: [
          "skill_action_speed",
          "skilling_efficiency",
          "skilling_success",
          "skilling_double_progress"
        ].includes(key)
          ? "life"
          : ["combat_damage", "attack_speed", "cast_speed", "critical_rate"].includes(key)
            ? "combat"
            : "basic",
        max,
        current: integer(level) && level <= max ? Math.max(0, level) : null,
        costs: Array.from({ length: max }, (_, i) => (Array.isArray(price) ? price[i] : price * (i + 1)))
      };
    });
    const items = (values(init?.labyrinthShopItemDetailMap) || []).flatMap((item) => {
      if (
        typeof item?.hrid !== "string" ||
        typeof item.itemHrid !== "string" ||
        item.cost?.itemHrid !== TOKEN ||
        !integer(item.cost.count) ||
        item.cost.count <= 0 ||
        !integer(item.outputCount ?? 1) ||
        (item.outputCount ?? 1) < 1
      )
        return [];
      return [
        {
          id: item.hrid,
          kind: "item",
          category: "exchange",
          itemHrid: item.itemHrid,
          name: name(item.itemHrid),
          output: item.outputCount ?? 1,
          cost: item.cost.count,
          max: 1000000,
          current: 0,
          effect: `每次兑换 ${item.outputCount ?? 1} 个`
        }
      ];
    });
    return [...upgrades, ...items];
  }
  function balance(state) {
    const list = values(state?.characterItemMap);
    if (!list) return null;
    const owner = state?.character?.id ?? state?.characterId;
    if (owner != null && list.some((item) => item?.characterId != null && String(item.characterId) !== String(owner)))
      return null;
    const matches = list.filter(
      (item) => item?.itemHrid === TOKEN && item.itemLocationHrid === "/item_locations/inventory"
    );
    if (matches.some((item) => !integer(item.count))) return null;
    const count = matches.reduce((sum, item) => sum + item.count, 0);
    return integer(count) ? count : null;
  }
  function emptyPlan() {
    return { entries: [], budget: null, reserve: 0, perRun: null, futureRuns: 0 };
  }
  function validatePlan(plan) {
    if (
      !plan ||
      !Array.isArray(plan.entries) ||
      plan.entries.length > 100 ||
      ![plan.budget, plan.perRun].every((v) => v === null || integer(v)) ||
      !integer(plan.reserve) ||
      !integer(plan.futureRuns) ||
      plan.futureRuns > 10000 ||
      new Set(plan.entries.map((p) => p.id)).size !== plan.entries.length ||
      plan.entries.some(
        (p) =>
          typeof p.id !== "string" || !/^\/[a-z_]+\/[a-z0-9_]+$/.test(p.id) || !integer(p.target) || p.target > 1000000
      )
    )
      throw new Error("代币方案数据无效");
    if (
      plan.forecastStart != null &&
      (typeof plan.forecastStart !== "string" || !Number.isFinite(Date.parse(plan.forecastStart)))
    )
      throw new Error("预测起始挑战无效");
    if (plan.ui != null) {
      const ui = plan.ui;
      if (
        typeof ui.pickerOpen !== "boolean" ||
        typeof ui.historyOpen !== "boolean" ||
        typeof ui.search !== "string" ||
        ui.search.length > 200 ||
        !["all", "basic", "life", "combat", "exchange"].includes(ui.category) ||
        !Array.isArray(ui.expanded) ||
        ui.expanded.length > 100 ||
        ui.expanded.some((v) => typeof v !== "string")
      )
        throw new Error("代币界面设置无效");
    }
    return plan;
  }
  function quote(plan, catalog, liveBalance, average) {
    validatePlan(plan);
    const base = plan.budget ?? liveBalance;
    const available = integer(base) ? Math.max(0, base - plan.reserve) : null;
    const income = plan.perRun ?? average;
    const future =
      plan.futureRuns === 0
        ? 0
        : typeof income === "number" && Number.isFinite(income) && income >= 0
          ? income * plan.futureRuns
          : null;
    const projected =
      integer(base) && future !== null && Number.isSafeInteger(Math.ceil(base + future))
        ? Math.max(0, base + future - plan.reserve)
        : null;
    let total = 0;
    const rows = plan.entries.map((entry) => {
      const item = catalog.find((c) => c.id === entry.id);
      let cost = null;
      if (item && integer(entry.target) && entry.target <= item.max && item.current !== null) {
        cost =
          item.kind === "item"
            ? entry.target * item.cost
            : item.costs.slice(item.current, Math.max(item.current, entry.target)).reduce((sum, n) => sum + n, 0);
        if (!integer(cost)) cost = null;
      }
      total = cost === null || total === null || !integer(total + cost) ? null : total + cost;
      const short =
        total !== null && integer(base) ? (total === 0 ? 0 : Math.max(0, total + plan.reserve - base)) : null;
      return {
        ...entry,
        item,
        cost,
        cumulative: total,
        shortage: short,
        runs: short === 0 ? 0 : short !== null && income > 0 ? Math.ceil(short / income) : null,
        status:
          cost === null
            ? "待核对"
            : cost === 0
              ? "已完成"
              : total === null
                ? "前项待核对"
                : available !== null && total <= available
                  ? "预算内"
                  : projected !== null && total <= projected
                    ? "预计可付"
                    : "待积攒"
      };
    });
    return {
      rows,
      total,
      available,
      projected,
      income,
      shortage: total !== null && projected !== null ? Math.max(0, total - projected) : null
    };
  }
  function observation(state, at = Date.now()) {
    const owner = state?.character?.id ?? state?.characterId;
    const run = state?.characterLabyrinth;
    const start = Date.parse(run?.startedAt);
    if (
      !owner ||
      !Number.isFinite(start) ||
      !integer(run?.currentFloor) ||
      run.currentFloor < 1 ||
      typeof run.lootedItemsData !== "string"
    )
      return null;
    let loot;
    try {
      loot = JSON.parse(run.lootedItemsData);
    } catch {
      return null;
    }
    if (!loot || typeof loot !== "object" || Array.isArray(loot)) return null;
    const tokens = Object.hasOwn(loot, TOKEN) ? loot[TOKEN] : 0;
    if (!integer(tokens)) return null;
    return {
      owner: String(owner),
      startedAt: new Date(start).toISOString(),
      tokens,
      floor: run.currentFloor,
      complete: run.isActive === false,
      firstSeen: at,
      lastSeen: at,
      conflict: false
    };
  }
  function mergeRun(previous, next) {
    if (!previous) return { ...next };
    if (previous.owner !== next.owner || previous.startedAt !== next.startedAt) throw new Error("挑战记录不匹配");
    return {
      ...previous,
      tokens: Math.max(previous.tokens, next.tokens),
      floor: Math.max(previous.floor, next.floor),
      complete: previous.complete || next.complete,
      firstSeen: Math.min(previous.firstSeen, next.firstSeen),
      lastSeen: Math.max(previous.lastSeen, next.lastSeen),
      conflict:
        previous.conflict ||
        next.conflict ||
        (next.complete && next.tokens < previous.tokens && next.lastSeen >= previous.lastSeen)
    };
  }
  function summary(runs) {
    const completed = runs.filter((r) => r.complete && !r.conflict);
    const total = runs.reduce((sum, r) => sum + r.tokens, 0);
    return {
      total: integer(total) ? total : null,
      count: runs.length,
      completed: completed.length,
      average: completed.length ? completed.reduce((sum, r) => sum + r.tokens, 0) / completed.length : null
    };
  }
  function preferences(plan) {
    return { pickerOpen: true, search: "", category: "all", expanded: [], historyOpen: false, ...plan.ui };
  }
  function forecast(plan, runs) {
    const selected = runs
      .filter((r) => r.complete && !r.conflict && (!plan.forecastStart || r.startedAt >= plan.forecastStart))
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    const stats = summary(selected);
    return {
      ...stats,
      latest: selected.at(-1)?.tokens ?? null,
      minimum: selected.length ? selected.reduce((value, r) => Math.min(value, r.tokens), Infinity) : null,
      maximum: selected.length ? selected.reduce((value, r) => Math.max(value, r.tokens), 0) : null
    };
  }
  function buildPlan(plan, catalog, liveBalance, runs) {
    const sample = forecast(plan, runs);
    const result = quote(plan, catalog, liveBalance, sample.average);
    let prefix = 0,
      count = 0,
      affordable = 0,
      cutoff = null;
    const groups = result.rows.map((row) => {
      const item = row.item,
        steps = [];
      const units =
        row.cost === null ? null : item.kind === "item" ? row.target : Math.max(0, row.target - item.current);
      let covered = 0;
      if (units !== null) {
        if (item.kind === "item") {
          covered =
            prefix !== null && result.projected !== null
              ? Math.min(units, Math.max(0, Math.floor((result.projected - prefix) / item.cost)))
              : null;
          steps.push({
            from: 0,
            to: units,
            quantity: units,
            cost: row.cost,
            cumulative: row.cumulative,
            fits: covered === null ? null : covered === units
          });
          if (!cutoff && covered !== null && covered < units)
            cutoff = {
              id: row.id,
              name: item.name,
              from: covered,
              to: covered + 1,
              shortfall: prefix + (covered + 1) * item.cost - result.projected
            };
        } else {
          for (let level = item.current; level < row.target; level++) {
            const cost = item.costs[level];
            prefix = prefix === null ? null : prefix + cost;
            const fits = prefix === null || result.projected === null ? null : prefix <= result.projected;
            steps.push({ from: level, to: level + 1, quantity: 1, cost, cumulative: prefix, fits });
            if (fits) covered++;
            if (!cutoff && fits === false)
              cutoff = {
                id: row.id,
                name: item.name,
                from: level,
                to: level + 1,
                shortfall: prefix - result.projected
              };
          }
          if (prefix === null || result.projected === null) covered = null;
        }
        count += units;
        if (covered !== null) affordable += covered;
      }
      prefix = row.cumulative;
      return {
        ...row,
        steps,
        units,
        covered,
        affordableTarget: item?.kind === "upgrade" && covered !== null ? item.current + covered : covered,
        budgetState:
          units === 0
            ? "complete"
            : units === null || covered === null
              ? "unknown"
              : covered === units
                ? "within"
                : covered > 0
                  ? "partial"
                  : "outside"
      };
    });
    const remaining = result.total === null || result.projected === null ? null : result.projected - result.total;
    const shortfall = result.rows.length ? result.rows.at(-1).shortage : result.available === null ? null : 0;
    return {
      ...result,
      groups,
      sample,
      count: groups.some((g) => g.units === null) ? null : count,
      affordable: result.projected === null || groups.some((g) => g.units === null) ? null : affordable,
      cutoff,
      remaining,
      eta: shortfall === 0 ? 0 : shortfall !== null && result.income > 0 ? Math.ceil(shortfall / result.income) : null
    };
  }
  const csv = (rows) =>
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            // Do not let item names become spreadsheet formulas.
            const text = String(value ?? "");
            return '"' + (/^[=+@-]/.test(text) ? "'" + text : text).replaceAll('"', '""') + '"';
          })
          .join(",")
      )
      .join("\r\n");
  function planText(result) {
    return [
      "迷宫代币使用计划",
      `规划预算：${result.projected ?? "未知"}；计划花费：${result.total ?? "未知"}`,
      ...result.groups.map(
        (g, i) =>
          `${i + 1}. ${g.item?.name || g.id} ${g.item?.kind === "upgrade" ? `${g.item.current ?? "未知"} → ${g.target} 级` : `${g.target} 次兑换`} · ${g.cost ?? "未知"} 代币`
      )
    ].join("\n");
  }
  function planCsv(result) {
    return csv([
      ["顺序", "项目", "类型", "起始", "目标", "次数", "花费", "累计", "预算状态"],
      ...result.groups.flatMap((g, i) =>
        g.steps.length
          ? g.steps.map((s) => [
              i + 1,
              g.item.name,
              g.item.kind === "upgrade" ? "升级" : "兑换",
              s.from,
              s.to,
              s.quantity,
              s.cost,
              s.cumulative,
              s.fits === null ? "待核对" : s.fits ? "预算内" : "超出预算"
            ])
          : [
              [
                i + 1,
                g.item?.name || g.id,
                "",
                g.item?.current,
                g.target,
                "",
                g.cost,
                g.cumulative,
                g.budgetState === "complete" ? "已完成" : "待核对"
              ]
            ]
      )
    ]);
  }
  function historyCsv(runs) {
    return csv([
      ["开始时间", "层数", "实际代币", "记录状态"],
      ...[...runs]
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
        .map((r) => [
          r.startedAt,
          r.floor,
          r.tokens,
          r.conflict ? "数据待核对" : r.complete ? "已确认结束" : "未收到结束数据"
        ])
    ]);
  }

  function emptyProfile() {
    return { schema: 1, plan: emptyPlan(), runs: [] };
  }
  function validateProfile(profile, owner) {
    if (!profile || profile.schema !== 1 || !Array.isArray(profile.runs))
      throw new Error("代币记录格式不兼容，原数据已保留");
    validatePlan(profile.plan);
    if (
      profile.runs.some(
        (r) =>
          r.owner !== owner ||
          !Number.isFinite(Date.parse(r.startedAt)) ||
          !integer(r.tokens) ||
          !integer(r.floor) ||
          !Number.isFinite(r.firstSeen) ||
          !Number.isFinite(r.lastSeen) ||
          typeof r.complete !== "boolean" ||
          typeof r.conflict !== "boolean"
      ) ||
      new Set(profile.runs.map((r) => r.startedAt)).size !== profile.runs.length
    )
      throw new Error("代币记录损坏，原数据已保留");
    return profile;
  }
  return {
    TOKEN,
    preferences,
    forecast,
    buildPlan,
    planText,
    planCsv,
    historyCsv,
    definitions,
    catalog,
    balance,
    emptyPlan,
    validatePlan,
    quote,
    observation,
    mergeRun,
    summary,
    emptyProfile,
    validateProfile
  };
});
