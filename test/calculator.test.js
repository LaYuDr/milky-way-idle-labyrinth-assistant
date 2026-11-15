const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
async function fixture(options = { identity: "fixture" }) {
  const sources = (await import("../tools/runtime-sources.mjs")).default;
  const store = new Map();
  const window = {
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    location: { href: "https://www.milkywayidle.com/", hostname: "www.milkywayidle.com", pathname: "/" }
  };
  const sandbox = vm.createContext({
    window,
    console,
    AbortController,
    structuredClone,
    URL,
    Blob,
    Response,
    DecompressionStream,
    atob,
    localStorage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    }
  });
  for (const file of sources.filter((f) => f.startsWith("src/calculator/") || f.startsWith("src/vendor/")))
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), sandbox);
  window.localStorage = sandbox.localStorage;
  const api = sandbox.MwiLabyrinthCalculator.create({ start: false, ...options });
  return { ctx: api.context, api, sandbox, store };
}
function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
}
function enumerate({ attempts, p, d, goal, start = 0, enhancing = false }) {
  let win = 0,
    moment = 0;
  function visit(n, x, weight) {
    if (x >= goal) {
      win += weight;
      moment += (attempts - n) * weight;
      return;
    }
    if (!n) return;
    visit(n - 1, enhancing ? Math.max(0, x - 1) : x, weight * (1 - p));
    visit(n - 1, x + 1, weight * p * (1 - d));
    visit(n - 1, x + 2, weight * p * d);
  }
  visit(attempts, start, 1);
  return { win, mean: win ? moment / win : null };
}
test("普通生活和强化的概率、条件耗时与独立路径枚举一致", async () => {
  const { ctx } = await fixture();
  for (const enhancing of [false, true])
    for (const p of [0.15, 0.65, 1])
      for (const d of [0, 0.2, 1]) {
        const expected = enumerate({ attempts: 5, p, d, goal: 4, enhancing });
        const result = enhancing
          ? ctx.computeEnhancingClearStats({
              attempts: 5,
              successChance: p,
              doubleChance: d,
              targetLevel: 4,
              startLevel: 0
            })
          : ctx.computeNonEnhancingClearStats({
              attempts: 5,
              successChance: p,
              doubleChance: d,
              targetProgress: 40,
              progressPerSuccess: 10
            });
        close(result.clearChance, expected.win);
        close(result.expectedAttemptsOnClear, expected.mean);
      }
  assert.equal(ctx.computeEnhancingClearStats({ attempts: 0, targetLevel: 5, startLevel: 5 }).clearChance, 1);
  assert.equal(
    ctx.computeNonEnhancingClearStats({
      attempts: 3,
      successChance: 1,
      doubleChance: 1,
      progressPerSuccess: 10,
      targetProgress: 61
    }).clearChance,
    0
  );
});
test("重开动态规划与独立 Python 穷举/更新周期结果一致，低胜率并不总该重开", async () => {
  const { sandbox } = await fixture();
  const m = sandbox.MwiLabyrinthRestart.solve({
    kind: "skilling",
    goal: 10,
    success: 0.65,
    double: 0.1,
    interval: 10,
    restart: 5
  });
  close(m.fresh, 278.26883666998117);
  close(m.baseline, 365.78030379435774);
  assert.equal(m.evaluate(11, 0).decision, "restart");
  assert.equal(m.evaluate(1, 8).decision, "continue");
  close(m.evaluate(1, 8).chance, 0.065);
  assert.equal(m.evaluate(7, 3).decision, "continue");
  const enh = sandbox.MwiLabyrinthRestart.solve({
    kind: "enhancing",
    goal: 5,
    success: 0.55,
    double: 0.1,
    interval: 8,
    restart: 5
  });
  close(enh.fresh, 152.04889468347795);
  assert.equal(enh.evaluate(5, 0).decision, "restart");
  assert.equal(
    sandbox.MwiLabyrinthRestart.solve({ kind: "skilling", goal: 3, success: 0, double: 0, interval: 10 }),
    null
  );
  assert.equal(
    sandbox.MwiLabyrinthRestart.solve({ kind: "skilling", goal: 3, success: 0.7, double: 0, interval: 0 }),
    null
  );
});
test("实时估算读取当前进度；过期数据不给重开建议", async () => {
  const { ctx } = await fixture();
  ctx.gameTravelTiming = { restart: 3, retry: 1 };
  const progress = {
    timeoutAt: new Date(Date.now() + 110000).toISOString(),
    actionCounter: 1,
    actionTimeMs: 10000,
    successRate: 0.65,
    doubleProgressChance: 0.1,
    progressPerAction: 100,
    targetWorkValue: 1000,
    currentWorkValue: 0
  };
  let result = ctx.computeLabyrinthLiveSkillingEstimate(progress);
  close(result.clearChance, 0.19466615807025361);
  assert.equal(result.restart.decision, "restart");
  result = ctx.computeLabyrinthLiveSkillingEstimate({
    ...progress,
    timeoutAt: new Date(Date.now() - 20000).toISOString()
  });
  assert.equal(result.restart, null);
  result = ctx.computeLabyrinthLiveSkillingEstimate({
    ...progress,
    actionCounter: 11,
    currentWorkValue: 800,
    timeoutAt: new Date(Date.now() + 10000).toISOString()
  });
  assert.equal(result.restart.decision, "continue");
  assert.equal(ctx.computeLabyrinthLiveSkillingEstimate({ ...progress, actionTimeMs: 0 }), null);
});
test("推荐使用未取整胜率，返回达标样本；全部不达标时不伪装推荐", async () => {
  const { ctx } = await fixture();
  ctx.computeAutomationEntryClearChanceByRoomLevel = async (_params, level) => ({
    clearChance: level <= 100 ? 0.72 : 0.699,
    result: { expectedSecondsPerClear: 100 }
  });
  const params = { entry: { isCombat: false }, effectiveLevel: 100, targetChance: 0.7, targetSeconds: 0 };
  let result = await ctx.findAutomationRecommendedLevelDelta(params);
  assert.equal(result.roomLevel, 100);
  assert.equal(result.targetMet, true);
  ctx.computeAutomationEntryClearChanceByRoomLevel = async () => ({
    clearChance: 0.699,
    result: { expectedSecondsPerClear: 100 }
  });
  result = await ctx.findAutomationRecommendedLevelDelta(params);
  assert.equal(result, null);
});
test("推荐耗时不先四舍五入；战斗使用置信下限", async () => {
  const { ctx } = await fixture();
  ctx.computeAutomationEntryClearChanceByRoomLevel = async (_params, level) => ({
    clearChance: 1,
    result: { expectedSecondsPerClear: level <= 100 ? 299.9 : 300.1, combatMeta: { successes: 99, trials: 100 } }
  });
  const result = await ctx.findAutomationRecommendedLevelDelta({
    entry: { isCombat: false },
    effectiveLevel: 100,
    targetChance: 0,
    targetSeconds: 300
  });
  assert.equal(result.roomLevel, 100);
  assert.ok(ctx.wilsonLower(100, 100) < 1);
  assert.ok(ctx.wilsonLower(70, 100) < 0.7);
});
test("设置使用独立键，不迁移或重置参考插件数据；压缩和模拟器载荷可往返", async () => {
  const { ctx, sandbox, store } = await fixture();
  store.set("mwi_lab_clear_rate_combat_trials", "1234");
  ctx.saveCombatSimTrialsSetting(750);
  assert.equal(ctx.loadCombatSimTrialsSetting(), 750);
  assert.equal(store.get("mwi_lab_clear_rate_combat_trials"), "1234");
  assert.ok([...store.keys()].some((k) => k.startsWith("mwi-labyrinth:calculator:")));
  const payload = { source: "fixture", importSet: { equipment: { test: "中文装备" } } };
  assert.equal(
    JSON.stringify(ctx.decodeSimulatorBridgePayload(ctx.encodeSimulatorBridgePayload(payload))),
    JSON.stringify(payload)
  );
  const url = new URL(ctx.buildSimulatorBridgeLaunchUrl(payload));
  assert.equal(url.search, "");
  assert.ok(url.hash.includes("mwiLabBridge="));
  const raw = JSON.stringify({ itemDetailMap: { x: { name: "测试" } } });
  store.set("initClientData", sandbox.MwiLabyrinthCompression.compressToUTF16(raw));
  assert.equal(ctx.getInitClientData().itemDetailMap.x.name, "测试");
});
test("角色等级或方案变化会改变计算签名，经验增长不会触发无关重算", async () => {
  const { ctx } = await fixture();
  const state = {
    characterLabyrinth: { currentFloor: 1, startedAt: "fixture" },
    characterSkillMap: { x: { level: 10, experience: 0 } },
    characterLoadoutDict: { a: { name: "a" } }
  };
  const a = ctx.calculationSignature(state);
  state.characterSkillMap.x.experience = 10;
  assert.equal(ctx.calculationSignature(state), a);
  state.characterSkillMap.x.level = 11;
  assert.notEqual(ctx.calculationSignature(state), a);
  const b = ctx.calculationSignature(state);
  state.characterLoadoutDict.a.name = "b";
  assert.notEqual(ctx.calculationSignature(state), b);
});
test("保存跳过等级不改变推荐输入签名，装备方案变化会改变签名", async () => {
  const { ctx } = await fixture();
  const state = {
    characterLabyrinth: { currentFloor: 1, startedAt: "fixture" },
    characterSetting: { labyrinthSkipMilking: 20, labyrinthSkipEnhancing: 30, labyrinthLoadoutMilking: 1 }
  };
  const before = ctx.calculationSignature(state);
  state.characterSetting.labyrinthSkipMilking = 78;
  state.characterSetting.labyrinthSkipEnhancing = -5;
  assert.equal(ctx.calculationSignature(state), before);
  state.characterSetting.labyrinthLoadoutMilking = 2;
  assert.notEqual(ctx.calculationSignature(state), before);
});
test("同帧并发只创建一个战斗 Worker；销毁拒绝未完成请求并释放 URL", async () => {
  const { ctx, sandbox } = await fixture();
  let count = 0,
    terminated = 0,
    revoked = 0;
  sandbox.Worker = class extends EventTarget {
    constructor() {
      super();
      count++;
    }
    postMessage(message) {
      if (message.type === "init")
        queueMicrotask(() => {
          const event = new Event("message");
          event.data = { id: message.id, type: "ready" };
          this.dispatchEvent(event);
        });
    }
    terminate() {
      terminated++;
    }
  };
  sandbox.URL = { createObjectURL: () => "blob:fixture", revokeObjectURL: () => revoked++ };
  ctx.prepareMwisimWorkerAssets = async () => ({ workerBuffer: new ArrayBuffer(0), wasmBuffer: new ArrayBuffer(0) });
  ctx.getInitClientData = () => ({ combatMonsterDetailMap: {} });
  await Promise.all([ctx.ensureCombatSimulatorWorker(), ctx.ensureCombatSimulatorWorker()]);
  assert.equal(count, 1);
  const pending = ctx.simulateCombatRoomWithWorker({ trials: 10, playerDto: {} }, null);
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  ctx.resetCombatSimulatorWorker(new Error("cancelled"));
  await assert.rejects(pending, /cancelled/);
  assert.equal(terminated, 1);
  assert.equal(revoked, 1);
  assert.equal(ctx.combatWorkerPendingRequests.size, 0);
});

test("角色切换与未识别角色不会读写其他角色设置", async () => {
  const { ctx, store } = await fixture({});
  let id = 1001;
  ctx.getGameState = () => ({ character: { id } });
  ctx.saveCombatSimTrialsSetting(750);
  id = 1002;
  ctx.saveCombatSimTrialsSetting(250);
  assert.equal(ctx.loadCombatSimTrialsSetting(), 250);
  id = 1001;
  assert.equal(ctx.loadCombatSimTrialsSetting(), 750);
  id = null;
  const before = JSON.stringify([...store]);
  ctx.saveCombatSimTrialsSetting(1000);
  assert.equal(JSON.stringify([...store]), before);
  assert.equal(ctx.storage.getItem("mwi-labyrinth:calculator:clear_rate_combat_trials"), null);
});
test("计算销毁后不会重建面板或启动尚未准备好的 Worker", async () => {
  const { ctx, sandbox } = await fixture();
  let release;
  ctx.prepareMwisimWorkerAssets = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const pending = ctx.ensureCombatSimulatorWorker();
  ctx.destroyed = true;
  release({ workerBuffer: new ArrayBuffer(0), wasmBuffer: new ArrayBuffer(0) });
  await assert.rejects(pending, /计算已停止/);
  sandbox.document = new Proxy(
    {},
    {
      get() {
        throw new Error("销毁后不能触碰界面");
      }
    }
  );
  assert.equal(await ctx.updateRoomBadges(), false);
  ctx.renderRoomDistributionPanel();
  ctx.setAutomationEstimateControlStatus({ running: false });
  close(ctx.skillingSuccessChance(0), 0.05);
});

test("经验效率包含失败时间和每次入场，按期望经验/期望时间计算", async () => {
  const { sandbox } = await fixture();
  const { rate } = sandbox.MwiLabyrinthExperiencePolicy;
  close(rate({ chance: 0.5, successSeconds: 60, experience: 1000 }), 1800000 / 91);
  close(rate({ chance: 1, successSeconds: 60, experience: 1000 }), 3600000 / 61);
  close(rate({ chance: 0, successSeconds: null, experience: 1000 }), 0);
  close(rate({ chance: 1, successSeconds: 120 + 1e-12, experience: 1000 }), 3600000 / 121);
  assert.equal(rate({ chance: 0.5, successSeconds: NaN, experience: 1000 }), null);
  assert.equal(rate({ chance: 2, successSeconds: 60, experience: 1000 }), null);
});
test("经验推荐逐级扫描非单调曲线，严格高于目标并保留分离区间", async () => {
  const { sandbox } = await fixture();
  const rates = [100, 200, 80, 300, 90, 200];
  const evaluate = (level) => ({ experiencePerHour: rates[level - 1] });
  const scan = sandbox.MwiLabyrinthExperiencePolicy.scan;
  const result = await scan({ maxLevel: 6, target: 150, evaluate });
  assert.equal(result.best.roomLevel, 6);
  assert.equal(result.peak.roomLevel, 4);
  assert.equal(
    JSON.stringify(result.ranges),
    JSON.stringify([
      [2, 2],
      [4, 4],
      [6, 6]
    ])
  );
  assert.equal(result.atSearchLimit, true);
  const equality = await scan({ maxLevel: 6, target: 200, evaluate });
  assert.equal(JSON.stringify(equality.ranges), JSON.stringify([[4, 4]]));
  const impossible = await scan({ maxLevel: 6, target: 300, evaluate });
  assert.equal(impossible.best, null);
  assert.equal(impossible.peak.experiencePerHour, 300);
  await assert.rejects(scan({ maxLevel: 6, target: -1, evaluate }), /无效/);
  await assert.rejects(scan({ maxLevel: 6, target: 0, evaluate: () => null }), /缺少/);
});
test("经验目标以 K/h 输入，兼容原有经验/小时存储", async () => {
  const { ctx, sandbox } = await fixture();
  assert.equal(ctx.formatExperienceRate(91700), "91.7 K/h");
  assert.equal(ctx.formatExperienceRate(0), "0.0 K/h");
  assert.equal(ctx.formatExperienceRate(100000), ctx.formatPreviewExperiencePerHourK(100000));
  assert.equal(ctx.experienceInputToTarget("100"), 100000);
  assert.equal(ctx.experienceInputToTarget("91.7"), 91700);
  assert.equal(ctx.experienceInputToTarget("0"), 0);
  for (const value of ["", " ", null, undefined, -1, Infinity, "1e308", "abc"])
    assert.equal(ctx.experienceInputToTarget(value), null);
  assert.equal(ctx.experienceTargetToInput(undefined), "");
  assert.equal(ctx.experienceTargetToInput(0), "0");
  ctx.saveExperienceTarget("milking", 100000);
  assert.equal(ctx.experienceTargetToInput(ctx.getExperienceTargets().milking), "100");
  ctx.saveExperienceTarget("milking", ctx.experienceInputToTarget("91.7"));
  const reloaded = sandbox.MwiLabyrinthCalculator.create({ start: false, identity: "fixture" }).context;
  assert.equal(reloaded.getExperienceTargets().milking, 91700);
  assert.equal(reloaded.experienceTargetToInput(reloaded.getExperienceTargets().milking), "91.7");
});
test("升级耗时用实时剩余经验除以该技能目标，缺失或不一致的数据不估算", async () => {
  const { ctx, sandbox } = await fixture();
  const skill = { level: 10, experience: 750000 };
  let state = { characterSkillMap: { "/skills/milking": skill } };
  const table = { 10: 500000, 11: 1000000 };
  ctx.getGameState = () => state;
  ctx.getInitClientData = () => ({ levelExperienceTable: table });
  ctx.isChineseUi = () => true;
  ctx.saveExperienceTarget("milking", ctx.experienceInputToTarget("100"));
  close(ctx.getNextLevelTime("milking").hours, 2.5);
  assert.equal(ctx.getNextLevelTime("milking").remaining, 250000);
  assert.equal(ctx.formatNextLevelTime(2.5), "2.5 小时");
  assert.equal(ctx.formatNextLevelTime(0.5), "30 分钟");
  assert.equal(ctx.formatNextLevelTime(0.001), "<1 分钟");
  assert.equal(ctx.formatNextLevelTime(Infinity), "—");
  skill.experience = 900000;
  close(ctx.getNextLevelTime("/skills/milking").hours, 1);
  ctx.saveExperienceTarget("milking", 200000);
  close(ctx.getNextLevelTime("milking").hours, 0.5);
  state = {
    characterSkillMap: vm.runInContext('new Map([["/skills/milking", {level:10, experience:900000}]])', sandbox)
  };
  close(ctx.getNextLevelTime("milking").hours, 0.5);
  state = { characterSkillMap: { "/skills/milking": skill } };
  for (const target of [0, "", -1, Infinity]) {
    ctx.saveExperienceTarget("milking", target);
    assert.equal(ctx.getNextLevelTime("milking"), null);
  }
  ctx.saveExperienceTarget("milking", 100000);
  for (const xp of [undefined, NaN, -1, 499999, 1000000, 1000001]) {
    skill.experience = xp;
    assert.equal(ctx.getNextLevelTime("milking"), null);
  }
  skill.experience = 750000;
  delete table[11];
  assert.equal(ctx.getNextLevelTime("milking"), null);
  assert.equal(ctx.getNextLevelTime("enhancing"), null);
  assert.equal(ctx.getNextLevelTime("unknown"), null);
  ctx.isChineseUi = () => false;
  assert.equal(ctx.formatNextLevelTime(2.5), "2.5 h");
});
test("经验扫描可取消，设置覆盖全部十项且按角色隔离", async () => {
  const { ctx, sandbox } = await fixture({});
  let actor = 1001,
    cancelled = false,
    visited = 0;
  ctx.getGameState = () => ({ character: { id: actor } });
  for (const entry of ctx.LABYRINTH_AUTOMATION_SKILL_ROOM_TYPES) ctx.saveExperienceTarget(entry.key, 100000);
  assert.equal(Object.keys(ctx.getExperienceTargets()).length, 10);
  ctx.saveExperienceTarget("milking", "");
  ctx.saveExperienceTarget("enhancing", -2);
  assert.equal(ctx.getExperienceTargets().milking, undefined);
  assert.equal(ctx.getExperienceTargets().enhancing, undefined);
  ctx.saveExperienceTarget("milking", 0);
  assert.equal(ctx.getExperienceTargets().milking, 0);
  actor = 1002;
  assert.equal(Object.keys(ctx.getExperienceTargets()).length, 0);
  actor = 1001;
  assert.equal(ctx.getExperienceTargets().milking, 0);
  await assert.rejects(
    sandbox.MwiLabyrinthExperiencePolicy.scan({
      maxLevel: 30,
      target: 0,
      evaluate: () => {
        visited++;
        return { experiencePerHour: 100 };
      },
      cancelled: () => cancelled,
      yieldControl: async () => {
        cancelled = true;
      }
    }),
    /已变化/
  );
  assert.equal(visited, 8);
});

test("胜率条样式及五档颜色与参考插件原版一致", async () => {
  const { ctx } = await fixture();
  assert.deepEqual([1, 0.9, 0.7, 0.5, 0.1].map(ctx.getBadgeColor), [
    "#1fbf60",
    "#77b82a",
    "#d2ac19",
    "#d27a1f",
    "#d84b4b"
  ]);
  const reference = fs.readFileSync(
    path.join(__dirname, "../references/local-plugins/迷宫胜率计算器-1.6.0.txt"),
    "utf8"
  );
  const appearance = fs
    .readFileSync(path.join(__dirname, "../src/calculator/appearance.js"), "utf8")
    .replaceAll("ctx.", "");
  const badgeCss = (source) =>
    source
      .slice(source.indexOf(".${BADGE_CLASS} {"), source.indexOf(".${LIVE_ACTION_RATE_CLASS} {"))
      .replace(/\s+/g, " ");
  assert.equal(badgeCss(appearance), badgeCss(reference));
});

test("专业升级的下一档代币花费与预览使用同一等级快照", async () => {
  const { ctx } = await fixture();
  for (const [level, cost] of [
    [0, 40],
    [1, 80],
    [5, 240],
    [11, 480],
    [12, null],
    [13, null],
    [-1, null],
    [1.5, null],
    [undefined, null]
  ])
    assert.equal(ctx.getSkillingUpgradeTokenCost(level), cost);
  const state = { characterSkillMap: { "/skills/milking": { level: 100 }, "/skills/enhancing": { level: 100 } } };
  for (const skill of ["milking", "enhancing"]) {
    const room = { roomType: ctx.LABYRINTH_SKILLING_ROOM_TYPE, skillHrid: `/skills/${skill}`, recommendedLevel: 100 };
    const levels = {
      [ctx.LABYRINTH_UPGRADE_KEY_SKILLING_SUCCESS]: 5,
      [ctx.LABYRINTH_UPGRADE_KEY_SKILLING_DOUBLE_PROGRESS]: 11
    };
    const preview = ctx.computeRoomClearChance(state, {}, room, {}, { labyrinthUpgradeLevels: levels }).skillingPreview;
    assert.equal(preview.nextSkillingSuccessCost, 240);
    assert.equal(preview.nextSkillingDoubleProgressCost, 480);
    const capped = ctx.computeRoomClearChance(
      state,
      {},
      room,
      {},
      {
        labyrinthUpgradeLevels: {
          [ctx.LABYRINTH_UPGRADE_KEY_SKILLING_SUCCESS]: 12,
          [ctx.LABYRINTH_UPGRADE_KEY_SKILLING_DOUBLE_PROGRESS]: 12
        }
      }
    ).skillingPreview;
    assert.equal(capped.nextSkillingSuccessCost, null);
    assert.equal(capped.nextSkillingDoubleProgressCost, null);
    assert.equal(capped.nextSkillingSuccessClearChance, null);
    assert.equal(capped.nextSkillingDoubleProgressClearChance, null);
    assert.equal(preview.nextSkillingSuccessCost, 240);
  }
});

test("升级后经验效率与逐项升级后独立重算一致，速度升档使用新行动时长", async () => {
  const { ctx } = await fixture();
  for (const skill of ["milking", "enhancing"]) {
    const state = { characterSkillMap: { [`/skills/${skill}`]: { level: 100 } } };
    const room = { roomType: ctx.LABYRINTH_SKILLING_ROOM_TYPE, skillHrid: `/skills/${skill}`, recommendedLevel: 120 };
    const levels = {
      [ctx.LABYRINTH_UPGRADE_KEY_SKILLING_SUCCESS]: 3,
      [ctx.LABYRINTH_UPGRADE_KEY_SKILLING_DOUBLE_PROGRESS]: 1
    };
    const compute = (options = { labyrinthUpgradeLevels: levels }) =>
      ctx.computeRoomClearChance(state, {}, room, {}, options).skillingPreview;
    const base = compute();
    assert.equal(base.nextSkillingSuccessCost, 160);
    assert.equal(base.nextSkillingDoubleProgressCost, 80);
    state.characterSkillMap[`/skills/${skill}`].level++;
    close(base.nextLevelExperiencePerHour, compute().experiencePerHour);
    state.characterSkillMap[`/skills/${skill}`].level--;
    for (const [key, field] of [
      [ctx.LABYRINTH_UPGRADE_KEY_SKILLING_SUCCESS, "nextSkillingSuccessExperiencePerHour"],
      [ctx.LABYRINTH_UPGRADE_KEY_SKILLING_DOUBLE_PROGRESS, "nextSkillingDoubleProgressExperiencePerHour"]
    ]) {
      close(base[field], compute({ labyrinthUpgradeLevels: { ...levels, [key]: levels[key] + 1 } }).experiencePerHour);
    }
    const get = ctx.getSkillingGlobalMetrics;
    ctx.getSkillingGlobalMetrics = (...args) => {
      const metrics = get(...args);
      // Step just above the threshold to avoid a floating-point floor at 12.999999999999998.
      metrics.globalMetrics.actionSpeedBonus += base.speedDeltaForOneMoreAttempt + 1e-14;
      return metrics;
    };
    const speed = compute();
    close(base.speedTierExperiencePerHour, speed.experiencePerHour);
    ctx.getSkillingGlobalMetrics = get;
    if (skill === "milking") {
      ctx.getSkillingGlobalMetrics = (...args) => {
        const metrics = get(...args);
        metrics.globalMetrics.efficiencyBonus += base.efficiencyDeltaForOneLessProgressUnit + 1e-14;
        return metrics;
      };
      close(base.efficiencyTierExperiencePerHour, compute().experiencePerHour);
      ctx.getSkillingGlobalMetrics = get;
    }
  }
});
test("终点奖励只用当前层数，未揭示也可预览，不累计上一层奖励", async () => {
  const { ctx } = await fixture();
  for (const [floor, values] of [
    [1, ["5", "0", "0", "0"]],
    [4, ["20", "0.5", "0.5", "0"]],
    [6, ["30", "1.5", "1.5", "1"]],
    [8, ["40", "2.5", "2.5", "2"]]
  ]) {
    const preview = ctx.buildFloorExitPreview({ characterLabyrinth: { currentFloor: floor, roomData: [] } });
    assert.equal(preview.type, "reward-only");
    assert.deepEqual(
      Array.from(preview.rewardPreview.rows, (row) => row.value),
      values
    );
    assert.equal(preview.rewardPreview.floor, floor);
  }
  for (const floor of [undefined, null, 0, -1, 1.5, "6"])
    assert.equal(ctx.buildFloorExitPreview({ characterLabyrinth: { currentFloor: floor } }), null);
});

test("推荐结果持久化，重载按角色恢复且旧版待更新标记不限制使用", async () => {
  const { ctx, sandbox, store } = await fixture({ identity: "a" });
  ctx.syncRecommendationOwner();
  ctx.beginRecommendationSnapshot();
  const ready = {
    status: "ready",
    basis: "winRate",
    stale: true,
    levelDelta: 72,
    roomLevel: 100,
    clearChance: 0.8,
    detailPreview: { duration: Infinity }
  };
  ctx.automationRecommendBasis = "winRate";
  ctx.automationRecommendByRoomTypeKey.set("milking", ready);
  ctx.persistRecommendations();
  assert.equal(store.size, 1);
  const second = sandbox.MwiLabyrinthCalculator.create({ start: false, identity: "a" });
  second.context.syncRecommendationOwner();
  assert.equal(second.context.automationRecommendByRoomTypeKey.get("milking").levelDelta, 72);
  assert.equal(second.context.automationRecommendByRoomTypeKey.get("milking").detailPreview.duration, Infinity);
  assert.equal(second.context.automationRecommendColumnEnabled, true);
  assert.equal(second.context.automationRecommendByRoomTypeKey.get("milking").stale, false);
  second.context.storageIdentity = () => "b";
  second.context.syncRecommendationOwner();
  assert.equal(second.context.automationRecommendByRoomTypeKey.size, 0);
  second.context.storageIdentity = () => "";
  second.context.syncRecommendationOwner();
  second.context.persistRecommendations();
  assert.equal(store.size, 1);
  second.context.storageIdentity = () => "a";
  second.context.syncRecommendationOwner();
  assert.equal(second.context.automationRecommendByRoomTypeKey.get("milking").levelDelta, 72);
  second.context.beginRecommendationSnapshot();
  assert.equal(second.context.automationRecommendByRoomTypeKey.size, 0);
  second.context.automationRecommendByRoomTypeKey.set("milking", { ...ready, stale: false, levelDelta: 80 });
  second.context.persistRecommendations();
  assert.equal(second.context.automationRecommendByRoomTypeKey.get("milking").stale, false);
});

test("推荐存储损坏或写入失败不丢本页结果", async () => {
  const { ctx, store } = await fixture();
  const key = "mwi-labyrinth:calculator:recommendation-results:v1:character:fixture";
  store.set(key, "{broken");
  ctx.syncRecommendationOwner();
  assert.equal(ctx.automationRecommendByRoomTypeKey.size, 0);
  for (const name of ["milking", "foraging"])
    ctx.automationRecommendByRoomTypeKey.set(name, { status: "ready", levelDelta: 10, clearChance: 0.5 });
  ctx.storage.setItem = () => {};
  ctx.automationRecommendByRoomTypeKey.set("milking", { status: "ready", levelDelta: 20, clearChance: 0.5 });
  ctx.persistRecommendations();
  assert.equal(ctx.recommendationStorageError, true);
  assert.equal(ctx.automationRecommendByRoomTypeKey.get("milking").levelDelta, 20);
});

test("自动化结果由玩家手动更新，角色、目标和表格条目变化均保留快照", async () => {
  const { ctx } = await fixture();
  const estimate = { status: "ready", clearChance: 0.8, expectedSeconds: 100 };
  const recommendation = { status: "ready", basis: "experience", levelDelta: 72, clearChance: 0.8 };
  ctx.automationEstimateByRoomTypeKey.set("milking", estimate);
  ctx.automationRecommendByRoomTypeKey.set("milking", recommendation);
  ctx.automationRecommendBasis = "experience";
  ctx.automationEstimateSignatureByRoomTypeKey.set("milking", "old");
  ctx.automationRecommendSignatureByRoomTypeKey.set("milking", "old");
  ctx.getAutomationEstimateTable = () => ({});
  ctx.getLabyrinthPanelInstance = () => ({});
  let entries = [{ key: "milking", isCombat: false }];
  ctx.getAutomationRoomTypeEntries = () => entries;
  ctx.getAutomationEstimateSection = () => ({});
  ctx.applyAutomationWideLayout = () => {};
  ctx.ensureAutomationEstimateControl = () => {};
  ctx.setAutomationEstimateControlStatus = () => {};
  ctx.renderAutomationEstimateTable = () => {};
  ctx.inputRevision++;
  ctx.saveExperienceTarget("milking", 50000);
  ctx.refreshAutomationEstimatePanel({ characterLabyrinth: { currentFloor: 2 } });
  entries = [];
  ctx.refreshAutomationEstimatePanel({ characterLabyrinth: { currentFloor: 3 } });
  assert.equal(ctx.automationEstimateByRoomTypeKey.get("milking"), estimate);
  assert.equal(ctx.automationRecommendByRoomTypeKey.get("milking"), recommendation);
});

test("推荐差异使用实际保存阈值，包含正负等级；相等、未参与和异常结果不高亮", async () => {
  const { ctx } = await fixture();
  const ready = (setting) => ({ status: "ready", levelDelta: setting - 1 });
  assert.equal(ctx.getAutomationAdjustment(80, ready(73)).direction, "down");
  assert.equal(ctx.getAutomationAdjustment(-3, ready(-2)).difference, 1);
  assert.equal(ctx.getAutomationAdjustment(0, ready(0)), null);
  assert.equal(ctx.getAutomationAdjustment(72, ready(72)), null);
  assert.equal(ctx.getAutomationAdjustment(NaN, ready(73)), null);
  assert.equal(ctx.getAutomationAdjustment(80, { status: "excluded", levelDelta: 72 }), null);
  assert.equal(ctx.getAutomationAdjustment(80, { status: "error" }), null);
  assert.equal(ctx.getAutomationAdjustment(80, ready(1000)), null);
});

test("战斗经验目标按怪物保存，逐级异步扫描并复用达标样本，输入变化可取消", async () => {
  const { ctx, sandbox } = await fixture({ identity: "combat-xp" });
  ctx.saveExperienceTarget("shadow_archer", 123000);
  ctx.saveExperienceTarget("siren", 0);
  const restored = sandbox.MwiLabyrinthCalculator.create({ start: false, identity: "combat-xp" }).context;
  assert.equal(restored.getExperienceTargets().shadow_archer, 123000);
  assert.equal(restored.getExperienceTargets().siren, 0);
  ctx.AUTOMATION_RECOMMEND_MAX_DELTA = 3;
  ctx.nextFrame = async () => {};
  const visits = [];
  const hourly = [0, 100, 0, 200, 0, 100];
  ctx.computeCombatRoomClearChance = async (_state, _data, room, _gear, _progress, trials, _key, options) => {
    visits.push(room.recommendedLevel);
    assert.equal(trials, 77);
    assert.equal(options.seed, 173);
    assert.equal(options.reuseSimulation, true);
    return { clearChance: 0.8, experiencePerHour: hourly[room.recommendedLevel], marker: room.recommendedLevel };
  };
  const params = {
    state: {},
    initClientData: {},
    entry: { key: "shadow_archer", monsterHrid: "/monsters/shadow_archer", isCombat: true },
    effectiveLevel: 2,
    recommendCombatTrials: 77,
    targetExperience: 100
  };
  const result = await ctx.findExperienceRecommendation(params);
  assert.deepEqual(visits, [1, 2, 3, 4, 5]);
  assert.equal(result.best.roomLevel, 3);
  assert.equal(result.best.levelDelta, 1);
  assert.equal(result.best.result.marker, 3);
  ctx.computeCombatRoomClearChance = async () => {
    ctx.inputRevision++;
    return { experiencePerHour: 100 };
  };
  await assert.rejects(ctx.findExperienceRecommendation(params), /输入已变化/);
});

test("经验推荐快照隔离实时角色与升级变化，扫描使用固定升级参数", async () => {
  const { ctx } = await fixture();
  const live = {
    characterSkillMap: new Map([["/skills/milking", { level: 10 }]]),
    characterLoadoutDict: { 1: { name: "old" } }
  };
  ctx.resolveLabyrinthUpgradeLevels = (options) => options?.labyrinthUpgradeLevels || { experience: 2 };
  const snapshot = ctx.createAutomationRunSnapshot(live);
  live.characterSkillMap.get("/skills/milking").level = 11;
  live.characterLoadoutDict[1].name = "new";
  assert.equal(snapshot.state.characterSkillMap.get("/skills/milking").level, 10);
  assert.equal(snapshot.state.characterLoadoutDict[1].name, "old");
  for (const data of [
    { character: { combatLevel: 83.7 } },
    { combatUnit: { combatLevel: 84.1 } },
    { combatUnit: { combatDetails: { combatLevel: 85.2 } } }
  ]) {
    assert.equal(
      ctx.getAutomationCombatBaseLevel(ctx.createAutomationRunSnapshot(data).state),
      ctx.getAutomationCombatBaseLevel(data)
    );
  }
  ctx.AUTOMATION_RECOMMEND_MAX_DELTA = 2;
  ctx.computeCombatRoomClearChance = async (state, _data, _room, _gear, _progress, _trials, _key, options) => {
    assert.equal(state.characterSkillMap.get("/skills/milking").level, 10);
    assert.equal(options.labyrinthUpgradeLevels.experience, 2);
    return { experiencePerHour: 100 };
  };
  const result = await ctx.findExperienceRecommendation({
    state: snapshot.state,
    initClientData: {},
    effectiveLevel: 1,
    targetExperience: 1,
    entry: { key: "shadow_archer", isCombat: true },
    labyrinthUpgradeLevels: snapshot.labyrinthUpgradeLevels
  });
  assert.equal(result.best.roomLevel, 3);
});

test("经验扫描中同角色数据更新不重置内核，结束后生效，切换角色仍取消", async () => {
  const { ctx, sandbox } = await fixture();
  sandbox.document = { getElementById: () => null };
  let identity = "one",
    live = 1,
    resets = 0;
  ctx.storageIdentity = () => identity;
  ctx.refreshControlPanelPlacement = () => null;
  sandbox.MwiLabyrinthCalculatorModules.integration(ctx);
  ctx.calculationSignature = () => `${identity}:${live}`;
  ctx.getGameState = () => ({});
  ctx.resetCombatSimulatorWorker = () => resets++;
  ctx.clearRoomDistributionSnapshot = () => {};
  ctx.resetAutoRecalcState = () => {};
  ctx.initializeRoomLogState = () => {};
  ctx.setControlStatus = () => {};
  ctx.refreshControlPanelPlacement();
  ctx.automationRunSnapshot = { identity };
  live++;
  ctx.refreshControlPanelPlacement();
  assert.equal(resets, 0);
  assert.equal(ctx.inputRevision, 0);
  ctx.automationRunSnapshot = null;
  ctx.refreshControlPanelPlacement();
  assert.equal(resets, 1);
  assert.equal(ctx.inputRevision, 1);
  ctx.automationRunSnapshot = { identity };
  identity = "two";
  ctx.refreshControlPanelPlacement();
  assert.equal(resets, 2);
  assert.equal(ctx.inputRevision, 2);
});

test("从项目基础等级起算，未达标后追加五级；反弹重置观察窗口", async () => {
  const { ctx, sandbox } = await fixture();
  const scan = sandbox.MwiLabyrinthExperiencePolicy.scan;
  const values = { 10: 200, 11: 0, 12: 0, 13: 220, 14: 0, 15: 0, 16: 0, 17: 0, 18: 0, 19: 0, 20: 999 };
  for (const concurrency of [1, 2, 4]) {
    const visits = [];
    const result = await scan({
      minLevel: 10,
      maxLevel: 30,
      target: 100,
      tailLevels: 5,
      concurrency,
      evaluate: async (level) => {
        visits.push(level);
        await new Promise((r) => {
          setTimeout(r, (4 - (level % 4)) * 2);
        });
        return { experiencePerHour: values[level] || 0 };
      }
    });
    assert.deepEqual(visits, [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    assert.equal(result.best.roomLevel, 13);
    assert.equal(result.maxLevel, 19);
    assert.equal(result.stoppedEarly, true);
    assert.equal(result.searchMaxLevel, 30);
  }
  const misses = [];
  const result = await scan({
    minLevel: 50,
    maxLevel: 100,
    target: 100,
    tailLevels: 5,
    concurrency: 4,
    evaluate: (level) => {
      misses.push(level);
      return { experiencePerHour: 100 };
    }
  });
  assert.deepEqual(misses, [50, 51, 52, 53, 54, 55]);
  assert.equal(result.best, null);
  ctx.AUTOMATION_RECOMMEND_MAX_DELTA = 300;
  ctx.computeCombatRoomClearChance = async () => ({ experiencePerHour: 0 });
  ctx.computeRoomClearChance = () => ({ experiencePerHour: 0 });
  const state = { characterSkillMap: { "/skills/combat": { level: 83.99 }, "/skills/milking": { level: 82 } } };
  for (const [entry, effective, start] of [
    [{ key: "shadow_archer", isCombat: true }, 98.7, 83],
    [{ key: "milking", skillHrid: "/skills/milking" }, 97, 82]
  ]) {
    const r = await ctx.findExperienceRecommendation({
      state,
      initClientData: {},
      entry,
      effectiveLevel: effective,
      targetExperience: 100
    });
    assert.equal(r.minLevel, start);
    assert.equal(r.maxLevel, entry.isCombat ? start + 5 : start);
  }
});

test("并行扫描取消或失败会等当前批次结束，不再派发新等级", async () => {
  const { sandbox } = await fixture();
  const scan = sandbox.MwiLabyrinthExperiencePolicy.scan;
  for (const failing of [false, true]) {
    const visited = [],
      finished = [];
    let cancelled = false;
    await assert.rejects(
      scan({
        maxLevel: 50,
        target: 0,
        concurrency: 4,
        tailLevels: 5,
        cancelled: () => cancelled,
        evaluate: async (level) => {
          visited.push(level);
          await new Promise((r) => {
            setTimeout(r, level * 2);
          });
          finished.push(level);
          if (level === 1) {
            if (failing) throw Error("sample failed");
            cancelled = true;
          }
          return { experiencePerHour: 100 };
        }
      }),
      failing ? /sample failed/ : /已变化/
    );
    assert.deepEqual(visited, [1, 2, 3, 4]);
    assert.deepEqual(finished, [1, 2, 3, 4]);
  }
});

test("生活缓存按进度档位复用，成功率变化不串值", async () => {
  const { ctx } = await fixture();
  const cache = new Map();
  const base = { attempts: 27, successChance: 0.65, doubleChance: 0.3, progressPerSuccess: 136 };
  const a = ctx.computeNonEnhancingClearStats({ ...base, targetProgress: 670 }, cache);
  const b = ctx.computeNonEnhancingClearStats({ ...base, targetProgress: 680 }, cache);
  assert.deepEqual(a, b);
  assert.equal(cache.size, 1);
  for (const progress of [136, 151, 0])
    for (const p of [0.05, 0.65, 1])
      for (const target of [680, 690, 1760, 4000]) {
        const args = { ...base, progressPerSuccess: progress, successChance: p, targetProgress: target };
        assert.deepEqual(ctx.computeNonEnhancingClearStats(args, cache), ctx.computeNonEnhancingClearStats(args));
      }
  a.clearChance = -1;
  assert.notEqual(ctx.computeNonEnhancingClearStats({ ...base, targetProgress: 680 }, cache).clearChance, -1);
});

test("生活安全上限扫描与完整扫描一致，覆盖锯齿回升与临界目标", async () => {
  const { ctx, sandbox } = await fixture();
  const scan = sandbox.MwiLabyrinthExperiencePolicy.scan;
  for (const effective of [25, 97, 106]) {
    const minLevel = Math.max(1, effective - 15),
      maxLevel = effective + 300;
    const points = new Map();
    for (let level = minLevel; level <= maxLevel; level++) {
      const delta = effective - level;
      const stats = ctx.computeNonEnhancingClearStats({
        attempts: 27,
        successChance: Math.max(0.05, Math.min(1, 0.8 * (1 + (delta >= 0 ? delta * 0.005 : delta * 0.01) + 0.1))),
        doubleChance: 0.3,
        progressPerSuccess: Math.floor(effective * 1.4),
        targetProgress: level * 10
      });
      points.set(level, {
        clearChance: stats.clearChance,
        experiencePerHour: sandbox.MwiLabyrinthExperiencePolicy.rate({
          chance: stats.clearChance,
          successSeconds: stats.expectedAttemptsOnClear === null ? null : stats.expectedAttemptsOnClear * 4.4,
          experience: level * 50 * 1.5
        })
      });
    }
    const targets = [0, 1, 40000, 1000000, points.get(minLevel).experiencePerHour];
    for (const target of targets) {
      const options = { minLevel, maxLevel, target, evaluate: (level) => points.get(level) };
      const full = await scan(options);
      for (const concurrency of [1, 4]) {
        const fast = await scan({
          ...options,
          concurrency,
          futureUpperBound: (sample, level, max) => (sample.experiencePerHour * max) / level
        });
        assert.deepEqual(fast.best, full.best);
        assert.deepEqual(fast.peak, full.peak);
        assert.deepEqual(fast.ranges, full.ranges);
        assert.equal(fast.minLevel, minLevel);
        if (fast.stoppedEarly)
          for (let l = fast.maxLevel + 1; l <= maxLevel; l++) assert.ok(points.get(l).experiencePerHour <= target);
      }
    }
  }
});

test("生活推荐不因连续六级未达标漏掉后续回升，强化保持全范围检查", async () => {
  const { ctx } = await fixture();
  ctx.nextFrame = async () => {};
  ctx.AUTOMATION_RECOMMEND_MAX_DELTA = 30;
  ctx.computeRoomClearChance = (_s, _d, room) => ({
    experiencePerHour: room.recommendedLevel <= 16 ? 90 : room.recommendedLevel <= 20 ? 120 : 0
  });
  for (const skill of ["milking", "enhancing"]) {
    const result = await ctx.findExperienceRecommendation({
      state: { characterSkillMap: { [`/skills/${skill}`]: { level: 10 } } },
      initClientData: {},
      entry: { key: skill, skillHrid: `/skills/${skill}` },
      effectiveLevel: 10,
      targetExperience: 100
    });
    assert.equal(result.best.roomLevel, 20);
    assert.equal(result.minLevel, 10);
    assert.equal(result.maxLevel, skill === "milking" ? 21 : 40);
  }
});

test("胜率、耗时和估算均用冻结输入，升级时不中断，并发房型结果全部保留", async () => {
  for (const mode of ["estimate", "winRate", "seconds"]) {
    const { ctx, sandbox } = await fixture();
    sandbox.document = { getElementById: () => null };
    let version = 0,
      resets = 0,
      active = 0,
      peak = 0;
    const live = { characterLabyrinth: { currentFloor: 1 }, characterSkillMap: { "/skills/combat": { level: 50 } } };
    const entries = Array.from({ length: 7 }, (_, i) => ({ key: `room${i}`, isCombat: true }));
    ctx.window.navigator = { hardwareConcurrency: 8, deviceMemory: 8 };
    ctx.refreshControlPanelPlacement = () => null;
    sandbox.MwiLabyrinthCalculatorModules.integration(ctx);
    ctx.calculationSignature = () => String(version);
    ctx.getGameState = () => live;
    ctx.resetCombatSimulatorWorker = () => resets++;
    ctx.setControlStatus = () => {};
    ctx.clearRoomDistributionSnapshot = () => {};
    ctx.resetAutoRecalcState = () => {};
    ctx.refreshControlPanelPlacement();
    ctx.getLabyrinthPanelInstance = () => ({});
    ctx.getAutomationEstimateTable = () => ({});
    ctx.getAutomationRoomTypeEntries = () => entries;
    ctx.getInitClientData = () => ({});
    ctx.getAutomationRoomLabel = (entry) => entry.key;
    ctx.resolveLabyrinthUpgradeLevels = () => ({ experience: version });
    ctx.buildMaxEnhancementByItem = () => new Map();
    ctx.resolveAutomationEffectiveLevel = (_p, _e, state) => state.characterSkillMap["/skills/combat"].level;
    ctx.resolveAutomationSkipThreshold = () => 2;
    ctx.buildAutomationSkipThresholdOverrideMap = () => new Map();
    ctx.buildCombatPreview = () => null;
    ctx.getSelectedAutomationCombatTrials = () => 17;
    ctx.getSelectedAutomationTargetWinRate = () => 50;
    ctx.getSelectedAutomationTargetSeconds = () => 300;
    ctx.nextFrame = async () => {};
    for (const key of [
      "renderAutomationEstimateTable",
      "setAutomationEstimateControlStatus",
      "captureAutomationInputSignatures",
      "beginRecommendationSnapshot",
      "hideSavedRecommendations"
    ])
      ctx[key] = () => {};
    const calculate = async (state, options) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => {
        setTimeout(r, 2);
      });
      live.characterSkillMap["/skills/combat"].level++;
      version++;
      ctx.refreshControlPanelPlacement();
      assert.equal(state.characterSkillMap["/skills/combat"].level, 50);
      assert.equal(options.labyrinthUpgradeLevels.experience, 0);
      active--;
      return { clearChance: 0.8, expectedSecondsPerClear: 30 };
    };
    ctx.computeCombatRoomClearChance = async (state, _data, _room, _gear, _progress, _trials, _key, options) =>
      calculate(state, options);
    ctx.findAutomationRecommendedLevelDelta = async (params) => {
      assert.equal(params.effectiveLevel, 50);
      const result = await calculate(params.state, params);
      return { roomLevel: 51, levelDelta: 2, clearChance: 0.8, result };
    };
    if (mode === "estimate") await ctx.runAutomationEstimateCalculation();
    else await ctx.runAutomationRecommendCalculation(mode);
    assert.ok(peak > 1);
    assert.equal(resets, 0);
    const values = mode === "estimate" ? ctx.automationEstimateByRoomTypeKey : ctx.automationRecommendByRoomTypeKey;
    assert.equal(values.size, 7);
    assert.ok([...values.values()].every((x) => x.status === "ready"));
    assert.match(ctx.automationEstimateStatusText, /7\/7/);
    assert.equal(ctx.automationRunSnapshot, null);
    ctx.refreshControlPanelPlacement();
    assert.equal(resets, 1);
  }
});

test("并行项目取消停止派发，异常先收齐在途任务，状态区分停止与失败", async () => {
  const { ctx } = await fixture();
  ctx.window.navigator = { hardwareConcurrency: 4, deviceMemory: 8 };
  ctx.setAutomationEstimateControlStatus = () => {};
  ctx.nextFrame = async () => {};
  let stop = false,
    started = 0,
    settled = 0;
  const task = ctx.runAutomationEntries(
    Array.from({ length: 12 }),
    () => stop,
    async () => {
      started++;
      await new Promise((r) => {
        setTimeout(r, 3);
      });
      settled++;
      stop = true;
    }
  );
  await task;
  assert.equal(started, 3);
  assert.equal(settled, 3);
  stop = false;
  started = 0;
  settled = 0;
  await assert.rejects(
    ctx.runAutomationEntries(
      Array.from({ length: 12 }),
      () => false,
      async () => {
        const id = started++;
        await new Promise((r) => {
          setTimeout(r, 3);
        });
        settled++;
        if (id === 0) throw new Error("模拟异常");
      }
    ),
    /模拟异常/
  );
  assert.equal(started, 3);
  assert.equal(settled, 3);
  ctx.finishAutomationStatus("已手动停止", 2, 12, 0);
  assert.match(ctx.automationEstimateStatusText, /已手动停止.*2\/12/);
  ctx.finishAutomationStatus("", 12, 12, 2);
  assert.match(ctx.automationEstimateStatusText, /2 项失败/);
});

test("让出主线程不依赖后台标签暂停的动画帧", async () => {
  const { ctx } = await fixture();
  let yielded = false;
  const pending = ctx.nextFrame().then(() => {
    yielded = true;
  });
  assert.equal(yielded, false);
  await pending;
  assert.equal(yielded, true);
});

test("从当前游戏客户端读取移动耗时，缺失或冲突时不采用旧的五秒设置", async () => {
  const { ctx, sandbox, store } = await fixture();
  const parse = sandbox.MwiLabyrinthGameTiming.parse;
  const source = "x={LabyrinthInitialTravelTimeSeconds:3,LabyrinthTravelTimeSeconds:1}";
  assert.equal(parse(source).restart, 3);
  assert.equal(parse(source).retry, 1);
  assert.equal(parse(source.replace(":3", ":4.5")).restart, 4.5);
  for (const text of ["", source + source, source.replace(":3", ":-1"), source.replace(":3", ":Infinity")])
    assert.equal(parse(text), null);
  store.set("mwi-labyrinth:calculator:restart-seconds:v1", "59");
  assert.equal(ctx.gameTravelTiming, null);
  sandbox.document = {
    querySelectorAll: () => [{ src: "https://www.milkywayidle.com/static/js/main.fixture.chunk.js" }]
  };
  ctx.window.location.origin = "https://www.milkywayidle.com";
  let reads = 0;
  ctx.window.fetch = async (_url, options) => {
    reads++;
    assert.equal(options.credentials, "omit");
    return { ok: true, text: async () => source };
  };
  await Promise.all([ctx.loadGameTravelTiming(), ctx.loadGameTravelTiming()]);
  assert.equal(reads, 1);
  assert.equal(ctx.gameTravelTiming.restart, 3);
});

test("重开建议拒绝缺失、矛盾和已错过下一次动作的数据", async () => {
  const { ctx, sandbox } = await fixture();
  const now = 1700000000000;
  vm.runInContext(`Date.now = () => ${now}`, sandbox);
  ctx.gameTravelTiming = { restart: 3, retry: 1 };
  const progress = {
    actionCounter: 1,
    actionTimeMs: 10000,
    successRate: 0.65,
    doubleProgressChance: 0.1,
    progressPerAction: 100,
    targetWorkValue: 1000,
    currentWorkValue: 0,
    timeoutAt: new Date(now + 110000).toISOString()
  };
  const estimate = (patch) => ctx.computeLabyrinthLiveSkillingEstimate({ ...progress, ...patch });
  assert.equal(estimate({}).restart.decision, "restart");
  for (const patch of [
    { timeoutAt: undefined },
    { timeoutAt: "invalid" },
    { timeoutAt: new Date(now - 1).toISOString() },
    { timeoutAt: new Date(now + 100000).toISOString() },
    { timeoutAt: new Date(now + 111000).toISOString() },
    { actionCounter: undefined },
    { actionCounter: -1 },
    { actionCounter: 1.5 },
    { actionCounter: 13 },
    { currentWorkValue: undefined },
    { currentWorkValue: -100 },
    { currentWorkValue: 25 },
    { targetLevel: 5, currentEnhLevel: 1.5 }
  ])
    assert.equal(estimate(patch).restart, null, JSON.stringify(patch));
  for (const successRate of [null, undefined, "", Infinity]) assert.equal(estimate({ successRate }), null);
  const nearAction = estimate({ timeoutAt: new Date(now + 100500).toISOString() });
  assert.equal(nearAction.restart.decision, "continue");
  ctx.gameTravelTiming = null;
  assert.match(estimate({}).restartUnavailable, /移动耗时/);
});

test("实时提醒覆盖最后等待、完成及统一的两秒提示阈值", async () => {
  const { ctx, sandbox } = await fixture();
  const now = 1700000000000;
  vm.runInContext(`Date.now = () => ${now}`, sandbox);
  ctx.gameTravelTiming = { restart: 3, retry: 1 };
  const progress = {
    actionCounter: 10,
    actionTimeMs: 11000,
    successRate: 0.65,
    doubleProgressChance: 0.1,
    progressPerAction: 100,
    targetWorkValue: 500,
    currentWorkValue: 0,
    timeoutAt: new Date(now + 10000).toISOString()
  };
  const estimate = ctx.computeLabyrinthLiveSkillingEstimate(progress);
  assert.equal(estimate.attemptsLeft, 0);
  assert.equal(estimate.restart.saving, 8);
  assert.match(ctx.formatLabyrinthLiveEstimateText(estimate), /可考虑重开，预计省约 8 秒/);
  for (const [remaining, state, label] of [
    [4000, "continue", "等待本场结束"],
    [1000, "continue", "等待本场结束"]
  ]) {
    const e = ctx.computeLabyrinthLiveSkillingEstimate({
      ...progress,
      timeoutAt: new Date(now + remaining).toISOString()
    });
    assert.equal(ctx.getRestartAdviceState(e), state);
    assert.ok(ctx.formatLabyrinthLiveEstimateText(e).includes(label));
  }
  const done = ctx.computeLabyrinthLiveSkillingEstimate({ ...progress, currentWorkValue: 500 });
  assert.equal(ctx.getRestartAdviceState(done), "done");
  assert.match(ctx.formatLabyrinthLiveEstimateText(done), /已达目标/);
  assert.doesNotMatch(ctx.formatLabyrinthLiveEstimateTitle(done), /现在重开约/);
});

test("完整战斗扫描找到六次未达标之后的回升，模式按角色保存且仍可取消", async () => {
  const { ctx, sandbox } = await fixture({ identity: "scan-full" });
  ctx.AUTOMATION_RECOMMEND_MAX_DELTA = 20;
  ctx.nextFrame = async () => {};
  ctx.computeCombatRoomClearChance = async (_s, _i, room) => ({
    clearChance: 0.8,
    experiencePerHour: room.recommendedLevel === 1 || room.recommendedLevel === 15 ? 200 : 0
  });
  const params = {
    state: {},
    initClientData: {},
    entry: { key: "shadow_archer", isCombat: true },
    effectiveLevel: 1,
    targetExperience: 100
  };
  const quick = await ctx.findExperienceRecommendation(params);
  assert.equal(quick.best.roomLevel, 1);
  assert.equal(quick.maxLevel, 7);
  ctx.saveExperienceScanMode("full");
  const full = await ctx.findExperienceRecommendation(params);
  assert.equal(full.best.roomLevel, 15);
  assert.equal(full.maxLevel, 21);
  assert.equal(full.stoppedEarly, false);
  assert.equal(
    sandbox.MwiLabyrinthCalculator.create({ start: false, identity: "scan-full" }).context.getExperienceScanMode(),
    "full"
  );
  assert.equal(
    sandbox.MwiLabyrinthCalculator.create({ start: false, identity: "other" }).context.getExperienceScanMode(),
    "quick"
  );
  ctx.computeCombatRoomClearChance = async () => {
    ctx.automationStopRequested = true;
    return { experiencePerHour: 0 };
  };
  await assert.rejects(ctx.findExperienceRecommendation(params), /输入已变化/);
});

test("经验设置保存失败保留各角色草稿，读回校验并重试，零值与模式不丢失", async () => {
  const { ctx, sandbox } = await fixture({ identity: "goals-failure" });
  let owner = "A";
  ctx.storageIdentity = () => owner;
  const write = ctx.storage.setItem;
  ctx.storage.setItem = () => {};
  ctx.saveExperienceTarget("milking", 0);
  ctx.saveExperienceScanMode("full");
  assert.equal(ctx.experienceStorageError, true);
  owner = "B";
  assert.equal(ctx.getExperienceTargets().milking, undefined);
  assert.equal(ctx.experienceStorageError, false);
  ctx.saveExperienceTarget("milking", 123000);
  owner = "A";
  assert.equal(ctx.getExperienceTargets().milking, 0);
  assert.equal(ctx.getExperienceScanMode(), "full");
  assert.equal(ctx.experienceStorageError, true);
  ctx.storage.setItem = write;
  assert.equal(ctx.persistExperienceSettings(), true);
  const restored = sandbox.MwiLabyrinthCalculator.create({ start: false, identity: "A" }).context;
  assert.equal(restored.getExperienceTargets().milking, 0);
  assert.equal(restored.getExperienceScanMode(), "full");
  owner = "B";
  assert.equal(ctx.getExperienceTargets().milking, 123000);
  assert.equal(ctx.experienceStorageError, true);
  assert.equal(ctx.persistExperienceSettings(), true);
});

test("胜率分布开关按角色保存，恢复不启动计算，损坏值回退关闭", async () => {
  const { ctx } = await fixture();
  let identity = "one";
  ctx.storageIdentity = () => identity;
  ctx.syncRoomDistributionToggleState = () => {};
  ctx.renderRoomDistributionPanel = () => {};
  ctx.getRoomDistributionFloatingPanel = () => null;
  ctx.runManualUpdate = () => {};
  ctx.setRoomDistributionEnabled(true);
  assert.equal(ctx.storage.getItem("mwi-labyrinth:calculator:distribution-enabled:v1"), "true");
  identity = "two";
  ctx.restoreRoomDistributionSetting();
  assert.equal(ctx.roomDistributionEnabled, false);
  identity = "one";
  ctx.restoreRoomDistributionSetting();
  assert.equal(ctx.roomDistributionEnabled, true);
  ctx.setRoomDistributionEnabled(false);
  assert.equal(ctx.storage.getItem("mwi-labyrinth:calculator:distribution-enabled:v1"), "false");
  identity = "bad";
  ctx.storage.setItem("mwi-labyrinth:calculator:distribution-enabled:v1", "corrupt");
  ctx.restoreRoomDistributionSetting();
  assert.equal(ctx.roomDistributionEnabled, false);
});
