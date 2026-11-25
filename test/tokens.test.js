const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../src/tokens/model.js");
function state(tokens = 0, extra = {}) {
  return {
    character: { id: 42 },
    characterInfo: Object.fromEntries(M.definitions.map((d) => [d[2], d[5]])),
    characterItemMap: new Map([
      ["token", { itemHrid: M.TOKEN, itemLocationHrid: "/item_locations/inventory", count: 500 }]
    ]),
    characterLabyrinth: {
      startedAt: "2026-11-01T00:00:00Z",
      currentFloor: 8,
      isActive: true,
      lootedItemsData: JSON.stringify({ [M.TOKEN]: tokens }),
      ...extra
    }
  };
}
const plan = (entries, extras = {}) => ({ ...M.emptyPlan(), entries, ...extras });
test("14项升级：逐级成本、容量换算、满级与未知等级", () => {
  const s = state(),
    catalog = M.catalog(s);
  assert.equal(catalog.length, 14);
  for (const item of catalog) assert.equal(item.current, 0);
  assert.deepEqual(catalog[0].costs, [800, 1200, 1800, 2600, 3600, 4800]);
  assert.equal(catalog[1].costs.at(-1), 1500);
  assert.equal(catalog[2].costs.at(-1), 640);
  assert.equal(catalog[3].costs.at(-1), 600);
  assert.equal(catalog[4].costs.at(-1), 450);
  assert.equal(catalog[13].costs.at(-1), 960);
  s.characterInfo.labyrinthTorchCap = 140;
  assert.equal(M.catalog(s)[1].current, 2);
  s.characterInfo.labyrinthCooldownHours = 48;
  assert.equal(M.catalog(s)[0].current, 6);
  delete s.characterInfo.labyrinthSkillingSuccessLevel;
  assert.equal(M.catalog(s)[7].current, null);
  s.characterInfo.labyrinthTorchCap = null;
  assert.equal(M.catalog(s)[1].current, null);
});
test("顺序共用预算，手动预算、保留金额、完整均值和估算次数分开", () => {
  const catalog = M.catalog(state());
  const entries = [
    { id: catalog[5].id, target: 2 },
    { id: catalog[4].id, target: 3 }
  ];
  const q = M.quote(plan(entries), catalog, 200, 50);
  assert.deepEqual(
    q.rows.map((r) => [r.cost, r.cumulative, r.shortage, r.runs]),
    [
      [120, 120, 0, 0],
      [180, 300, 100, 2]
    ]
  );
  assert.equal(q.rows[1].status, "待积攒");
  const projected = M.quote(plan(entries, { reserve: 50, futureRuns: 3 }), catalog, 200, 50);
  assert.equal(projected.projected, 300);
  assert.equal(projected.shortage, 0);
  assert.equal(projected.rows[1].status, "预计可付");
  assert.equal(M.quote(plan(entries, { budget: 0 }), catalog, 500, null).available, 0);
  assert.equal(M.quote(plan(entries, { reserve: 1000 }), catalog, 200, null).available, 0);
  assert.equal(M.quote(plan(entries, { futureRuns: 1 }), catalog, 200, null).projected, null);
  assert.equal(M.quote(plan(entries), catalog, null, 100).shortage, null);
  assert.equal(M.quote(plan(entries, { perRun: 0 }), catalog, 200, 100).rows[1].runs, null);
});
test("真实升级同步剩余成本，未知项阻止累计报价而不静默跳过", () => {
  const s = state();
  s.characterInfo.labyrinthSkillActionSpeedLevel = 1;
  const catalog = M.catalog(s),
    id = catalog[5].id;
  assert.equal(M.quote(plan([{ id, target: 3 }]), catalog, 100, 50).total, 200);
  assert.equal(M.quote(plan([{ id, target: 1 }]), catalog, 100, 50).rows[0].status, "已完成");
  assert.equal(M.quote(plan([{ id, target: 13 }]), catalog, 100, 50).total, null);
  const unknown = M.quote(
    plan([
      { id: "/shop_items/missing", target: 1 },
      { id, target: 2 }
    ]),
    catalog,
    100,
    50
  );
  assert.equal(unknown.total, null);
  assert.equal(unknown.rows[1].status, "前项待核对");
});
test("兑换使用实时目录价格和产出，拒绝非代币价格与损坏条目", () => {
  const item = {
    hrid: "/labyrinth_shop_items/test",
    itemHrid: "/items/test",
    cost: { itemHrid: M.TOKEN, count: 25 },
    outputCount: 5
  };
  const catalog = M.catalog(
    state(),
    { labyrinthShopItemDetailMap: { a: item, b: { ...item, cost: { itemHrid: "/items/coin", count: 1 } } } },
    () => "测试碎片"
  );
  assert.equal(catalog.length, 15);
  assert.equal(catalog.at(-1).output, 5);
  assert.equal(catalog.at(-1).name, "测试碎片");
  assert.equal(M.quote(plan([{ id: item.hrid, target: 3 }]), catalog, 100, null).total, 75);
});
test("背包余额不混入其他存放位置，未知数据不当零", () => {
  const s = state();
  s.characterItemMap.set("other", { itemHrid: M.TOKEN, itemLocationHrid: "/item_locations/market", count: 999 });
  assert.equal(M.balance(s), 500);
  assert.equal(M.balance({}), null);
  assert.equal(M.balance({ characterItemMap: new Map() }), 0);
  s.characterItemMap.get("token").count = -1;
  assert.equal(M.balance(s), null);
});
test("累计掉落独立于余额，刷新、重复、乱序和角色隔离", () => {
  const a = M.observation(state(20), 100),
    b = M.observation(state(50), 200);
  let merged = M.mergeRun(a, b);
  merged = M.mergeRun(merged, a);
  merged = M.mergeRun(merged, b);
  assert.equal(merged.tokens, 50);
  assert.equal(merged.firstSeen, 100);
  assert.equal(merged.lastSeen, 200);
  const s = state(50);
  s.characterItemMap.get("token").count = 0;
  assert.equal(M.observation(s).tokens, 50);
  assert.throws(() => M.mergeRun(a, { ...b, owner: "99" }), /不匹配/);
  for (const lootedItemsData of [
    undefined,
    "",
    "[]",
    "null",
    "oops",
    '{"/items/labyrinth_token":-1}',
    '{"/items/labyrinth_token":"1"}'
  ])
    assert.equal(M.observation(state(0, { lootedItemsData })), null);
  assert.equal(M.observation(state(0, { lootedItemsData: "{}" })).tokens, 0);
});
test("只用确认结束且无冲突的收入计算均值，中断和当前收入保留", () => {
  const active = M.observation(state(100), 100);
  const ended = M.observation(state(200, { isActive: false, startedAt: "2026-11-02T00:00:00Z" }), 200);
  const zero = M.observation(state(0, { isActive: false, startedAt: "2026-11-03T00:00:00Z" }), 300);
  assert.deepEqual(M.summary([active, ended, zero]), { total: 300, count: 3, completed: 2, average: 100 });
  const conflict = M.mergeRun(active, { ...active, tokens: 90, complete: true, lastSeen: 400 });
  assert.equal(conflict.conflict, true);
  assert.equal(M.summary([conflict]).average, null);
  assert.equal(M.summary([]).average, null);
});
test("无效方案与损坏存档明确拒绝，保留原数据", () => {
  for (const p of [
    plan([], { budget: -1 }),
    plan([], { futureRuns: 1.5 }),
    plan([], { futureRuns: 10001 }),
    plan([{ id: "__proto__", target: 1 }])
  ])
    assert.throws(() => M.validatePlan(p));
  assert.throws(() =>
    M.validatePlan(
      plan([
        { id: "/items/a", target: 1 },
        { id: "/items/a", target: 2 }
      ])
    )
  );
  assert.throws(() => M.validateProfile({ schema: 2 }, "42"), /保留/);
  const profile = { ...M.emptyProfile(), runs: [M.observation(state())] };
  assert.equal(M.validateProfile(profile, "42"), profile);
  assert.throws(() => M.validateProfile(profile, "other"), /保留/);
});
test("规划细化到每级，部分预算截止只扣一次，未来收入不重复计算", () => {
  const catalog = M.catalog(state());
  const p = plan([
    { id: catalog[5].id, target: 5 },
    { id: catalog[0].id, target: 1 }
  ]);
  const q = M.buildPlan(p, catalog, 250, []);
  assert.equal(q.total, 1400);
  assert.equal(q.count, 6);
  assert.equal(q.affordable, 3);
  assert.equal(q.groups[0].affordableTarget, 3);
  assert.equal(q.groups[0].budgetState, "partial");
  assert.equal(q.cutoff.shortfall, 150);
  assert.deepEqual(
    q.groups[0].steps.map((s) => s.cumulative),
    [40, 120, 240, 400, 600]
  );
  const projected = M.buildPlan({ ...p, perRun: 100, futureRuns: 2 }, catalog, 250, []);
  assert.equal(projected.affordable, 4);
  assert.equal(projected.eta, 12);
  assert.equal(projected.remaining, -950);
});
test("大量兑换按数量汇总，未知前项不会让后项免费通过", () => {
  const item = {
    id: "/labyrinth_shop_items/test",
    kind: "item",
    current: 0,
    max: 1000000,
    cost: 25,
    output: 5,
    name: "碎片"
  };
  const q = M.buildPlan(plan([{ id: item.id, target: 1000000 }]), [item], 112, []);
  assert.equal(q.groups[0].steps.length, 1);
  assert.equal(q.groups[0].covered, 4);
  assert.equal(q.cutoff.shortfall, 13);
  assert.equal(q.total, 25000000);
  const unknown = M.buildPlan(
    plan([
      { id: "/labyrinth_upgrades/missing", target: 1 },
      { id: item.id, target: 1 }
    ]),
    [item],
    1000,
    []
  );
  assert.equal(unknown.groups[1].budgetState, "unknown");
  assert.equal(unknown.total, null);
});
test("预测起始挑战固定，筛选完整样本但不改累计统计", () => {
  const runs = [100, 200, 400].map((v, i) =>
    M.observation(state(v, { startedAt: `2026-11-0${i + 1}T00:00:00Z`, isActive: i === 2 }), i + 1)
  );
  const p = { ...M.emptyPlan(), forecastStart: runs[1].startedAt };
  assert.equal(M.forecast(p, runs).average, 200);
  assert.equal(M.forecast(p, runs).completed, 1);
  assert.equal(M.summary(runs).total, 700);
  assert.equal(
    M.forecast(p, [...runs, M.observation(state(300, { startedAt: "2026-11-04T00:00:00Z", isActive: false }))]).average,
    250
  );
  assert.equal(M.forecast({ ...p, forecastStart: "2027-01-01T00:00:00Z" }, runs).average, null);
});
test("旧版方案保持兼容，界面设置校验和导出转义", () => {
  assert.deepEqual(M.preferences(M.emptyPlan()), {
    pickerOpen: true,
    search: "",
    category: "all",
    expanded: [],
    historyOpen: false
  });
  const p = { ...M.emptyPlan(), ui: { ...M.preferences(M.emptyPlan()), search: "冷却", pickerOpen: false } };
  assert.equal(M.validatePlan(p), p);
  assert.throws(() => M.validatePlan({ ...p, ui: { ...p.ui, category: "invalid" } }));
  assert.throws(() => M.validatePlan({ ...p, forecastStart: "not-date" }));
  const item = {
    id: "/labyrinth_shop_items/test",
    kind: "item",
    current: 0,
    max: 100,
    cost: 25,
    output: 1,
    name: '=SUM(1,2),"test"'
  };
  const q = M.buildPlan(plan([{ id: item.id, target: 2 }]), [item], 100, []);
  assert.match(M.planCsv(q), /'=SUM\(1,2\),""test""/);
  assert.match(M.planText(q), /2 次兑换/);
  assert.match(M.historyCsv([M.observation(state(30))]), /未收到结束数据/);
});

test("保留金额尚未攒够时，预测收入先补保留金额", () => {
  const catalog = M.catalog(state());
  const p = plan([{ id: catalog[5].id, target: 1 }], { reserve: 200, perRun: 100, futureRuns: 1 });
  const q = M.buildPlan(p, catalog, 100, []);
  assert.equal(q.available, 0);
  assert.equal(q.projected, 0);
  assert.equal(q.affordable, 0);
  assert.equal(q.eta, 2);
  assert.equal(q.groups[0].runs, 2);
  assert.equal(q.groups[0].shortage, 140);
  assert.equal(M.buildPlan({ ...p, futureRuns: 2 }, catalog, 100, []).projected, 100);
});

test("原生商店卡片识别：React key、图标、同物品消歧与未知拒绝", () => {
  require("../src/ui/token-view.js");
  const { identifyCard } = globalThis.MwiLabyrinthTokenView;
  const init = {
    labyrinthShopItemDetailMap: {
      a: {
        hrid: "/labyrinth_shop_items/shard_1",
        itemHrid: "/items/labyrinth_shard",
        outputCount: 1,
        cost: { itemHrid: M.TOKEN, count: 10 }
      },
      b: {
        hrid: "/labyrinth_shop_items/shard_5",
        itemHrid: "/items/labyrinth_shard",
        outputCount: 5,
        cost: { itemHrid: M.TOKEN, count: 45 }
      },
      c: {
        hrid: "/labyrinth_shop_items/scroll",
        itemHrid: "/items/processing_scroll",
        outputCount: 1,
        cost: { itemHrid: M.TOKEN, count: 30 }
      }
    }
  };
  const catalog = M.catalog(state(), init, (hrid) => (hrid.includes("shard") ? "精炼碎片" : "加工卷轴"));
  const fakeCard = ({ className, reactKey, href, name, price }) => {
    const iconNode = href
      ? {
          closest: () => null,
          getAttribute: (attr) => (attr === "href" ? href : null)
        }
      : null;
    const node = {
      className,
      querySelector(selector) {
        if (selector.includes("LabyrinthPanel_iconContainer")) {
          return { querySelectorAll: () => (iconNode ? [iconNode] : []) };
        }
        if (selector.includes("LabyrinthPanel_name")) return name ? { textContent: name } : null;
        if (selector.includes("LabyrinthPanel_price")) return price ? { textContent: price } : null;
        return null;
      },
      querySelectorAll: () => (iconNode ? [iconNode] : [])
    };
    if (reactKey) node.__reactFiber$test = { key: reactKey };
    return node;
  };
  assert.equal(
    identifyCard(
      fakeCard({ className: "LabyrinthPanel_upgrade__x", reactKey: "/labyrinth_upgrades/cooldown" }),
      catalog
    ),
    "/labyrinth_upgrades/cooldown"
  );
  assert.equal(
    identifyCard(
      fakeCard({ className: "LabyrinthPanel_upgrade__x", href: "/static/misc.svg#labyrinth_skilling_success" }),
      catalog
    ),
    "/labyrinth_upgrades/skilling_success"
  );
  assert.equal(
    identifyCard(
      fakeCard({
        className: "LabyrinthPanel_item__x",
        href: "/static/items.svg#labyrinth_shard",
        name: "5 精炼碎片",
        price: "45"
      }),
      catalog
    ),
    "/labyrinth_shop_items/shard_5"
  );
  assert.equal(
    identifyCard(
      fakeCard({ className: "LabyrinthPanel_item__x", href: "/static/items.svg#processing_scroll" }),
      catalog
    ),
    "/labyrinth_shop_items/scroll"
  );
  assert.equal(
    identifyCard(
      fakeCard({ className: "LabyrinthPanel_item__x", href: "/static/items.svg#unknown_item", name: "未知商品" }),
      catalog
    ),
    null
  );
});
