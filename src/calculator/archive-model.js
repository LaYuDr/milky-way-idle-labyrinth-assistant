(function (root) {
  "use strict";
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const number = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);
  const point = (value) =>
    value && Number.isInteger(value.x) && Number.isInteger(value.y) && value.x >= 0 && value.y >= 0
      ? [value.x, value.y]
      : null;
  function path(value) {
    try {
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      return Array.isArray(parsed) ? parsed.map(point).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  function room(value) {
    if (!value || typeof value !== "object" || !Object.keys(value).length) return null;
    const result = {};
    for (const key of ["roomType", "skillHrid", "monsterHrid"])
      if (typeof value[key] === "string" && value[key]) result[key] = value[key];
    for (const key of ["recommendedLevel", "entryCount", "failCount"])
      if (number(value[key]) !== null) result[key] = value[key];
    if (typeof value.isCleared === "boolean") result.isCleared = value.isCleared;
    return Object.keys(result).length ? result : null;
  }
  function snapshot(labyrinth, identity, at = Date.now(), source = "state") {
    if (!identity || !labyrinth?.startedAt || !Number.isInteger(labyrinth.currentFloor)) return null;
    const rows = labyrinth.roomData;
    if (!Array.isArray(rows) || !rows.length || rows.length > 64) return null;
    const width = rows[0]?.length;
    if (!width || width > 64 || rows.some((row) => !Array.isArray(row) || row.length !== width)) return null;
    const resources = {};
    for (const key of ["torchCount", "shroudCount", "beaconCount"])
      if (number(labyrinth[key]) !== null) resources[key] = labyrinth[key];
    return {
      identity: String(identity),
      startedAt: String(labyrinth.startedAt),
      floor: labyrinth.currentFloor,
      at,
      source,
      kind: "snapshot",
      width,
      height: rows.length,
      rooms: rows.flat().map(room),
      path: path(labyrinth.pathData),
      resources,
      isActive: typeof labyrinth.isActive === "boolean" ? labyrinth.isActive : null
    };
  }
  function command(msg, state) {
    switch (msg?.type) {
      case "new_character_action":
        return msg.newCharacterActionData?.actionHrid === "/actions/labyrinth/explore"
          ? { type: "start_labyrinth_action", isStartNow: msg.newCharacterActionData.isStartNow === true }
          : null;
      case "update_labyrinth_path":
        return {
          type: msg.type,
          coords: path(msg.updateLabyrinthPathData?.coords),
          isUnqueue: msg.updateLabyrinthPathData?.isUnqueue === true
        };
      case "use_labyrinth_beacon":
      case "use_labyrinth_shroud": {
        const coords = point(msg.type.endsWith("beacon") ? msg.useLabyrinthBeaconData : msg.useLabyrinthShroudData);
        return coords ? { type: msg.type, coords } : null;
      }
      case "advance_labyrinth_floor":
      case "escape_labyrinth":
        return { type: msg.type };
      case "cancel_character_action": {
        const id = msg.cancelCharacterActionData?.characterActionId;
        const action = state?.characterActions?.find((entry) => entry.id === id);
        return action?.actionHrid === "/actions/labyrinth/explore"
          ? { type: "stop_labyrinth_action", actionId: id }
          : null;
      }
      default:
        return null;
    }
  }
  function progress(msg) {
    const result = {};
    for (const key of [
      "actionCounter",
      "currentProgress",
      "currentWorkValue",
      "targetWorkValue",
      "currentEnhLevel",
      "targetLevel",
      "actionTimeMs"
    ])
      if (number(msg?.[key]) !== null) result[key] = msg[key];
    if (typeof msg?.timeoutAt === "string") result.timeoutAt = msg.timeoutAt;
    return Number.isInteger(result.actionCounter) ? result : null;
  }
  // Called inside one read/write transaction. No actor intent or missing order is inferred.
  function reduce(run, floor, observation, mutable = false) {
    const o = observation;
    if (!run)
      run = {
        schemaVersion: 1,
        identity: o.identity,
        startedAt: o.startedAt,
        firstObservedAt: o.at,
        lastObservedAt: o.at,
        nextSeq: 1,
        floors: []
      };
    else if (!mutable) run = copy(run);
    if (!floor && o.kind !== "snapshot") return null;
    if (floor && o.kind !== "command" && o.at < floor.lastObservedAt) return null;
    const events = [];
    const add = (type, data) => events.push({ seq: run.nextSeq++, at: o.at, source: o.source, type, ...data });
    if (!floor) {
      floor = {
        schemaVersion: 1,
        floor: o.floor,
        width: o.width,
        height: o.height,
        firstObservedAt: o.at,
        lastObservedAt: o.at,
        baseline: copy(o.rooms),
        rooms: copy(o.rooms),
        path: copy(o.path),
        resources: copy(o.resources),
        isActive: o.isActive,
        events: [],
        lastProgress: null,
        lastCommandId: null
      };
      run.floors.push(o.floor);
      add("floor_observed", { baselineOnly: true });
    } else {
      if (!mutable) floor = copy(floor);
      if (o.kind === "snapshot") {
        if (o.width !== floor.width || o.height !== floor.height)
          throw new Error("同一楼层的地图尺寸发生变化，未覆盖原记录");
        const changes = [],
          entered = [],
          failed = [],
          cleared = [];
        o.rooms.forEach((incoming, index) => {
          if (!incoming) return; // Concealed or omitted fields never erase previously observed levels.
          const previous = floor.rooms[index];
          const next = { ...previous, ...incoming };
          // Room completion and cumulative counters cannot move backwards within a floor.
          if (previous?.isCleared) next.isCleared = true;
          for (const key of ["entryCount", "failCount"])
            if (number(previous?.[key]) !== null) next[key] = Math.max(previous[key], next[key] ?? 0);
          if (same(previous, next)) return;
          changes.push([index, next]);
          const coords = [index % floor.width, Math.floor(index / floor.width)];
          if ((next.entryCount ?? 0) > (previous?.entryCount ?? 0))
            entered.push({ coords, from: previous?.entryCount ?? null, to: next.entryCount });
          if ((next.failCount ?? 0) > (previous?.failCount ?? 0))
            failed.push({ coords, from: previous?.failCount ?? null, to: next.failCount });
          if (next.isCleared && !previous?.isCleared) cleared.push(coords);
          floor.rooms[index] = next;
        });
        if (changes.length) add("rooms_updated", { changes });
        if (entered.length)
          add("entries_observed", {
            rooms: entered,
            orderKnown: entered.length === 1 && entered[0].from !== null && entered[0].to - entered[0].from === 1
          });
        if (failed.length) add("failures_observed", { rooms: failed });
        if (cleared.length) add("clears_observed", { rooms: cleared, orderKnown: cleared.length === 1 });
        if (!same(floor.path, o.path)) {
          add("path_observed", { path: o.path });
          floor.path = copy(o.path);
          floor.lastProgress = null;
        }
        if (!same(floor.resources, o.resources)) {
          add("resources_observed", { resources: o.resources });
          floor.resources = copy(o.resources);
        }
        if (floor.isActive !== o.isActive) {
          add("activity_observed", { isActive: o.isActive });
          floor.isActive = o.isActive;
        }
      } else if (o.kind === "command" && floor.lastCommandId !== o.id) {
        add("command_sent", { command: o.data, room: o.room });
        floor.lastCommandId = o.id;
      } else if (o.kind === "progress" && !same(floor.lastProgress, o.data)) {
        add("room_progress", { room: o.room, progress: o.data });
        floor.lastProgress = copy(o.data);
      } else if (o.kind === "removed" && !run.removedObservedAt) {
        add("run_removed", {});
        run.removedObservedAt = o.at;
      }
    }
    if (!events.length) return null;
    floor.events.push(...events);
    floor.lastObservedAt = Math.max(floor.lastObservedAt, o.at);
    run.lastObservedAt = Math.max(run.lastObservedAt, o.at);
    return { run, floor };
  }
  function checksum(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return (hash >>> 0).toString(16);
  }
  function encode(value) {
    const text = JSON.stringify(value);
    return {
      codec: "lz-string-utf16",
      version: 1,
      length: text.length,
      checksum: checksum(text),
      data: root.MwiLabyrinthCompression.compressToUTF16(text)
    };
  }
  function decodePart(record) {
    if (record?.codec !== "lz-string-utf16" || record.version !== 1) throw new Error("不支持的迷宫档案格式");
    const text = root.MwiLabyrinthCompression.decompressFromUTF16(record.data);
    if (typeof text !== "string" || text.length !== record.length || checksum(text) !== record.checksum)
      throw new Error("迷宫档案校验失败，原记录已保留");
    return JSON.parse(text);
  }
  const CHUNK_SIZE = 128;
  const packedChecksum = (block) =>
    checksum(JSON.stringify([block.codec, block.version, block.length, block.checksum, block.data]));
  // Sealed event blocks are immutable. Validate their compressed bytes without
  // repeatedly decompressing the history during append; full reads check both.
  function readAppend(record) {
    if (!record) return { floor: null, chunks: [] };
    if (record.codec !== "lz-string-chunks") return { floor: decode(record), chunks: [] };
    if (record.version !== 1 || !Array.isArray(record.chunks)) throw new Error("不支持的迷宫档案格式");
    if (checksum(JSON.stringify(record.chunks.map((block) => block?.packedChecksum))) !== record.manifest)
      throw new Error("迷宫档案校验失败，原记录已保留");
    for (const block of record.chunks) {
      if (typeof block?.data !== "string" || packedChecksum(block) !== block.packedChecksum)
        throw new Error("迷宫档案校验失败，原记录已保留");
    }
    return { floor: decode(record.head), chunks: record.chunks };
  }
  function encodeAppend(floor, priorChunks = []) {
    const chunks = [...priorChunks];
    let offset = 0;
    while (floor.events.length - offset >= CHUNK_SIZE) {
      const block = encode(floor.events.slice(offset, offset + CHUNK_SIZE));
      chunks.push({ ...block, packedChecksum: packedChecksum(block) });
      offset += CHUNK_SIZE;
    }
    return {
      codec: "lz-string-chunks",
      version: 1,
      chunks,
      manifest: checksum(JSON.stringify(chunks.map((block) => block.packedChecksum))),
      head: encode({ ...floor, events: floor.events.slice(offset) })
    };
  }
  function decode(record) {
    if (record?.codec === "lz-string-chunks") {
      const { floor, chunks } = readAppend(record);
      floor.events = chunks
        .flatMap((block) => {
          const events = decodePart(block);
          if (!Array.isArray(events) || events.length !== CHUNK_SIZE) throw new Error("迷宫档案结构无效");
          return events;
        })
        .concat(floor.events);
      return floor;
    }
    const value = decodePart(record);
    if (value.schemaVersion !== 1 || !Array.isArray(value.events) || !Array.isArray(value.rooms))
      throw new Error("迷宫档案结构无效");
    return value;
  }
  root.MwiLabyrinthArchiveModel = Object.freeze({
    snapshot,
    command,
    progress,
    reduce,
    encode,
    decode,
    readAppend,
    encodeAppend
  });
})(globalThis);
