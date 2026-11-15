const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
function fixture() {
  const sandbox = vm.createContext({});
  for (const name of ["vendor/compression", "calculator/archive-model"])
    vm.runInContext(fs.readFileSync(`${__dirname}/../src/${name}.js`, "utf8"), sandbox);
  return sandbox.MwiLabyrinthArchiveModel;
}
const plain = (v) => JSON.parse(JSON.stringify(v));
function labyrinth() {
  return {
    startedAt: "run-1",
    currentFloor: 1,
    isActive: true,
    torchCount: 100,
    pathData: '[{"x":1,"y":0}]',
    roomData: [
      [
        { roomType: "/labyrinth_room_types/start", isCleared: true },
        {
          roomType: "/labyrinth_room_types/skilling",
          skillHrid: "/skills/milking",
          recommendedLevel: 173,
          entryCount: 0,
          failCount: 0
        }
      ],
      [{}, { roomType: "/labyrinth_room_types/descend", recommendedLevel: 0 }]
    ]
  };
}
test("档案只选取迷宫字段，未知等级留空，零等级保留，身份不明不记", () => {
  const m = fixture(),
    source = labyrinth();
  source.credentials = "never-store";
  source.roomData[0][1].secret = "never-store";
  const s = m.snapshot(source, "A", 10);
  assert.equal(s.rooms[2], null);
  assert.equal(s.rooms[3].recommendedLevel, 0);
  assert.equal(JSON.stringify(s).includes("never-store"), false);
  assert.equal(m.snapshot(source, "", 10), null);
  delete source.startedAt;
  assert.equal(m.snapshot(source, "A", 10), null);
});
test("基线不伪造历史通关；按实际更新保存进入失败和通关顺序", () => {
  const m = fixture(),
    source = labyrinth();
  let state = m.reduce(null, null, m.snapshot(source, "A", 10));
  assert.deepEqual(plain(state.floor.events.map((e) => e.type)), ["floor_observed"]);
  assert.equal(m.reduce(state.run, state.floor, m.snapshot(source, "A", 11)), null);
  source.roomData[0][1].entryCount = 1;
  state = m.reduce(state.run, state.floor, m.snapshot(source, "A", 12));
  assert.equal(state.floor.events.at(-1).type, "entries_observed");
  source.roomData[0][1].failCount = 1;
  state = m.reduce(state.run, state.floor, m.snapshot(source, "A", 13));
  assert.equal(state.floor.events.at(-1).type, "failures_observed");
  source.roomData[0][1].isCleared = true;
  state = m.reduce(state.run, state.floor, m.snapshot(source, "A", 14));
  source.roomData[1][1].isCleared = true;
  state = m.reduce(state.run, state.floor, m.snapshot(source, "A", 15));
  const clears = state.floor.events.filter((e) => e.type === "clears_observed");
  assert.deepEqual(plain(clears.map((e) => e.rooms)), [[[1, 0]], [[1, 1]]]);
  assert.ok(clears[1].seq > clears[0].seq);
  assert.equal(m.reduce(state.run, state.floor, m.snapshot(source, "A", 15)), null);
  assert.equal(state.floor.rooms[1].recommendedLevel, 173);
});
test("离线补回多个通关不猜内部顺序；清空字段和旧计数不抹掉已知信息", () => {
  const m = fixture(),
    source = labyrinth();
  let state = m.reduce(null, null, m.snapshot(source, "A", 10));
  source.roomData[0][1].isCleared = true;
  source.roomData[0][1].entryCount = 3;
  source.roomData[1][1].isCleared = true;
  state = m.reduce(state.run, state.floor, m.snapshot(source, "A", 20));
  assert.equal(state.floor.events.find((e) => e.type === "clears_observed").orderKnown, false);
  assert.equal(state.floor.events.find((e) => e.type === "entries_observed").orderKnown, false);
  source.roomData[0][1] = { entryCount: 0, isCleared: false };
  assert.equal(m.reduce(state.run, state.floor, m.snapshot(source, "A", 21)), null);
  assert.equal(m.reduce(state.run, state.floor, m.snapshot(labyrinth(), "A", 19)), null);
});
test("跨层沿用挑战序号；压缩还原后可继续写，进度消息去重", () => {
  const m = fixture(),
    source = labyrinth();
  let state = m.reduce(null, null, m.snapshot(source, "A", 10));
  const event = {
    identity: "A",
    startedAt: "run-1",
    floor: 1,
    at: 11,
    source: "server",
    kind: "progress",
    room: [1, 0],
    data: { actionCounter: 1, currentWorkValue: 0 }
  };
  state = m.reduce(state.run, m.decode(m.encode(state.floor)), event);
  assert.equal(m.reduce(state.run, state.floor, event), null);
  source.currentFloor = 2;
  const next = m.reduce(state.run, null, m.snapshot(source, "A", 12));
  assert.deepEqual(plain(next.run.floors), [1, 2]);
  assert.equal(next.floor.events[0].seq, 3);
  assert.equal(state.run.nextSeq, 3);
});
test("压缩可无损恢复，中文及长档案有效，损坏不能覆盖原档案", () => {
  const m = fixture(),
    source = labyrinth();
  const { floor } = m.reduce(null, null, m.snapshot(source, "A", 10));
  for (let i = 0; i < 1000; i++)
    floor.events.push({
      type: "room_progress",
      seq: i + 2,
      at: 11 + i,
      room: [1, 0],
      progress: { actionCounter: i, currentWorkValue: i % 10 },
      label: "测试中文"
    });
  const packed = m.encode(floor);
  assert.deepEqual(plain(m.decode(packed)), plain(floor));
  assert.ok(packed.data.length < packed.length / 2);
  assert.throws(() => m.decode({ ...packed, checksum: "bad" }), /校验失败/);
  assert.throws(() => m.decode({ ...packed, version: 9 }), /格式/);
});
test("只记录迷宫操作白名单，发送请求不等同通关", () => {
  const m = fixture();
  assert.equal(m.command({ type: "send_chat_message", text: "secret" }), null);
  assert.equal(
    m.command({ type: "new_character_action", newCharacterActionData: { actionHrid: "/actions/milking/cow" } }),
    null
  );
  assert.deepEqual(
    plain(
      m.command({
        type: "new_character_action",
        newCharacterActionData: { actionHrid: "/actions/labyrinth/explore", isStartNow: true }
      })
    ),
    { type: "start_labyrinth_action", isStartNow: true }
  );
  assert.equal(
    m.command(
      { type: "cancel_character_action", cancelCharacterActionData: { characterActionId: 1 } },
      { characterActions: [{ id: 1, actionHrid: "/actions/other" }] }
    ),
    null
  );
  const s = m.snapshot(labyrinth(), "A", 10);
  let state = m.reduce(null, null, s);
  const command = { ...s, at: 11, kind: "command", id: "tab:1", data: { type: "advance_labyrinth_floor" } };
  state = m.reduce(state.run, state.floor, command);
  assert.equal(state.floor.events.at(-1).type, "command_sent");
  assert.equal(m.reduce(state.run, state.floor, command), null);
  assert.equal(state.floor.rooms[1].isCleared, undefined);
  // Another tab's slower queue may commit a sent command after a newer state update.
  const delayed = m.reduce(state.run, state.floor, { ...command, at: 9, id: "tab:2" });
  assert.equal(delayed.floor.events.at(-1).type, "command_sent");
  assert.equal(delayed.floor.events.at(-1).at, 9);
  assert.equal(delayed.floor.lastObservedAt, 11);
});

test("分块追加与旧版逐事件合并完全一致，历史块复用且损坏不能覆盖", () => {
  const m = fixture();
  const baseline = m.snapshot(labyrinth(), "A", 1);
  let expected = m.reduce(null, null, baseline);
  let record = m.encode(expected.floor),
    run = expected.run;
  for (let i = 0; i < 400; i++) {
    const event = {
      identity: "A",
      startedAt: "run-1",
      floor: 1,
      at: i + 2,
      source: "server",
      kind: "progress",
      room: [1, 0],
      data: { actionCounter: i, currentWorkValue: i % 20 }
    };
    expected = m.reduce(expected.run, expected.floor, event);
    const prior = m.readAppend(record);
    const next = m.reduce(run, prior.floor, event, true);
    const packed = m.encodeAppend(next.floor, prior.chunks);
    if (prior.chunks.length) assert.equal(packed.chunks[0], prior.chunks[0]);
    run = next.run;
    record = packed;
  }
  assert.deepEqual(plain(m.decode(record)), plain(expected.floor));
  assert.deepEqual(plain(run), plain(expected.run));
  assert.ok(m.readAppend(record).floor.events.length < 128);
  assert.equal(record.chunks.length, 3);
  const broken = plain(record);
  broken.chunks[0].data += "broken";
  assert.throws(() => m.readAppend(broken), /校验失败/);
  const head = plain(record);
  head.head.checksum = "wrong";
  assert.throws(() => m.decode(head), /校验失败/);
});

test("档案拒绝异角色更新、删除和进度，当前角色与无身份旧协议仍可记录", () => {
  const entries = [];
  const sandbox = vm.createContext({
    console,
    window: {},
    WebSocket: class {
      send() {}
    },
    MwiLabyrinthCalculatorModules: {},
    MwiLabyrinthArchiveStore: {
      create: () => ({ append: (o) => entries.push(o), status: () => ({}), flush: async () => true })
    }
  });
  for (const name of ["calculator/archive-model", "calculator/archive"])
    vm.runInContext(fs.readFileSync(`${__dirname}/../src/${name}.js`, "utf8"), sandbox);
  const state = { character: { id: "B" }, characterLabyrinth: labyrinth() };
  const ctx = { getGameState: () => state, setInterval() {}, listen() {} };
  sandbox.MwiLabyrinthCalculatorModules.archive(ctx);
  ctx.startChallengeArchive();
  const initial = entries.length;
  for (const msg of [
    { type: "labyrinth_updated", characterId: "A", labyrinth: { ...labyrinth(), startedAt: "foreign" } },
    { type: "labyrinth_updated", labyrinth: { ...labyrinth(), characterId: "A" } },
    { type: "labyrinth_updated", characterId: "A", labyrinth: null },
    { type: "labyrinth_room_progress", characterId: "A", actionCounter: 9 }
  ])
    ctx.observeArchiveMessage(JSON.stringify(msg), {});
  assert.equal(entries.length, initial);
  ctx.observeArchiveMessage(
    JSON.stringify({ type: "labyrinth_room_progress", characterId: "B", actionCounter: 10 }),
    {}
  );
  assert.equal(entries.at(-1).identity, "B");
  assert.equal(entries.at(-1).data.actionCounter, 10);
  ctx.observeArchiveMessage(JSON.stringify({ type: "labyrinth_room_progress", actionCounter: 11 }), {});
  assert.equal(entries.at(-1).data.actionCounter, 11);
  ctx.observeArchiveMessage(JSON.stringify({ type: "labyrinth_updated", characterId: "B", labyrinth: null }), {});
  assert.equal(entries.at(-1).kind, "removed");
});
