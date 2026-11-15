/* global window, indexedDB, IDBObjectStore, MwiLabyrinthArchiveModel, MwiLabyrinthArchiveStore, MwiLabyrinthCalculatorModules */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { ROOT } from "./project.mjs";
// Isolated synthetic protocol + real IndexedDB. No game server or account access.
const files = [
  "vendor/compression",
  "calculator/archive-model",
  "calculator/archive-store",
  "calculator/archive",
  "calculator/live-progress"
];
const code =
  "globalThis.MwiLabyrinthCalculatorModules={};\n" +
  files.map((f) => fs.readFileSync(path.join(ROOT, `src/${f}.js`), "utf8")).join("\n");
const html = `<!doctype html><meta charset="utf-8"><div id="mwi-labyrinth-calculation-slot"></div><script src="/archive.js"></script>`;
const directory = path.join(ROOT, ".workbench/archive");
fs.mkdirSync(directory, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.MWI_TEST_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
const reports = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== "archive-fixture.invalid") return route.abort();
      return route.fulfill({
        contentType: url.pathname === "/archive.js" ? "text/javascript" : "text/html",
        body: url.pathname === "/archive.js" ? code : html
      });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    async function setup(target = page) {
      await target.evaluate(() => {
        const initial = {
          character: { id: "A" },
          characterActions: [{ id: 17, actionHrid: "/actions/labyrinth/explore" }],
          characterLabyrinth: {
            startedAt: "run-A",
            currentFloor: 1,
            isActive: true,
            pathData: [{ x: 1, y: 0 }],
            torchCount: 100,
            roomData: [
              [
                { roomType: "/labyrinth_room_types/start", isCleared: true },
                { roomType: "/labyrinth_room_types/skilling", recommendedLevel: 173, entryCount: 0, failCount: 0 }
              ],
              [{}, { roomType: "/labyrinth_room_types/descend" }]
            ]
          }
        };
        window.state = JSON.parse(sessionStorage.getItem("fixture-state") || "null") || initial;
        window.sent = [];
        class FixtureSocket extends EventTarget {
          send(data) {
            window.sent.push(data);
          }
        }
        window.WebSocket = FixtureSocket;
        window.originalSend = FixtureSocket.prototype.send;
        window.originalData = Object.getOwnPropertyDescriptor(MessageEvent.prototype, "data").get;
        const controller = new AbortController(),
          timers = [];
        window.ctx = {
          destroyed: false,
          getGameState: () => window.state,
          setInterval(fn, ms) {
            const id = setInterval(fn, ms);
            timers.push(id);
            return id;
          },
          listen(target, name, fn) {
            target.addEventListener(name, fn, { signal: controller.signal });
          }
        };
        MwiLabyrinthCalculatorModules["live-progress"](window.ctx);
        window.ctx.refreshLiveActionRateDisplay = window.ctx.handleRoomLogProgressMessage = () => {};
        MwiLabyrinthCalculatorModules.archive(window.ctx);
        window.ctx.installLiveActionRateWsHook();
        window.ctx.startChallengeArchive();
        window.socket = new FixtureSocket();
        window.socket.addEventListener("message", (event) => {
          const msg = JSON.parse(event.data);
          void event.data; // The same native MessageEvent getter is often read more than once.
          if (msg.type === "labyrinth_updated") window.state.characterLabyrinth = msg.labyrinth;
          sessionStorage.setItem("fixture-state", JSON.stringify(window.state));
        });
        window.emit = (msg) => window.socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(msg) }));
        window.stop = async () => {
          window.ctx.destroyed = true;
          controller.abort();
          timers.forEach(clearInterval);
          window.ctx.restoreProgressHook();
          return window.ctx.stopChallengeArchive();
        };
        window.readArchive = () =>
          new Promise((resolve, reject) => {
            const req = indexedDB.open(MwiLabyrinthArchiveStore.DB_NAME, 1);
            req.onerror = () => reject(req.error);
            req.onsuccess = () => {
              const db = req.result,
                tx = db.transaction(["runs", "floors"]),
                floors = tx.objectStore("floors").getAll(),
                keys = tx.objectStore("floors").getAllKeys(),
                runs = tx.objectStore("runs").getAll();
              tx.oncomplete = () => {
                db.close();
                resolve({
                  floors: floors.result.map(MwiLabyrinthArchiveModel.decode),
                  records: floors.result,
                  keys: keys.result,
                  runs: runs.result
                });
              };
              tx.onabort = () => reject(tx.error);
            };
          });
      });
      assert.equal(await target.evaluate(() => window.ctx.challengeArchive.flush()), true);
    }
    await page.goto("https://archive-fixture.invalid/");
    await setup();
    await page.evaluate(async () => {
      const lab = structuredClone(window.state.characterLabyrinth);
      window.socket.send(
        JSON.stringify({
          type: "update_labyrinth_path",
          updateLabyrinthPathData: { coords: [{ x: 1, y: 0 }], isUnqueue: false },
          credentials: "never-store"
        })
      );
      lab.roomData[0][1].entryCount = 1;
      window.emit({ type: "labyrinth_updated", labyrinth: lab });
      window.emit({ type: "labyrinth_room_progress", actionCounter: 1, currentWorkValue: 0 });
      window.emit({ type: "labyrinth_room_progress", actionCounter: 1, currentWorkValue: 0 });
      lab.roomData[0][1].failCount = 1;
      window.emit({ type: "labyrinth_updated", labyrinth: lab });
      window.socket.send(
        JSON.stringify({ type: "cancel_character_action", cancelCharacterActionData: { characterActionId: 17 } })
      );
      lab.roomData[0][1].entryCount = 2;
      lab.roomData[0][1].isCleared = true;
      window.emit({ type: "labyrinth_updated", labyrinth: lab });
      lab.roomData[1][0] = { roomType: "/labyrinth_room_types/combat", recommendedLevel: 201, isCleared: true };
      window.emit({ type: "labyrinth_updated", labyrinth: lab });
      await window.ctx.challengeArchive.flush();
    });
    let archive = await page.evaluate(() => window.readArchive());
    assert.equal(archive.floors[0].events.filter((e) => e.type === "room_progress").length, 1);
    assert.deepEqual(
      archive.floors[0].events.filter((e) => e.type === "clears_observed").map((e) => e.rooms),
      [[[1, 0]], [[0, 1]]]
    );
    assert.equal(JSON.stringify(archive).includes("never-store"), false);
    // Explicit foreign identities must never change the current archive, even for removal.
    await page.evaluate(async () => {
      for (const message of [
        {
          type: "labyrinth_updated",
          characterId: "foreign",
          labyrinth: { ...window.state.characterLabyrinth, startedAt: "foreign-run" }
        },
        { type: "labyrinth_updated", labyrinth: { ...window.state.characterLabyrinth, characterId: "foreign" } },
        { type: "labyrinth_updated", characterId: "foreign", labyrinth: null },
        { type: "labyrinth_room_progress", characterId: "foreign", actionCounter: 500 }
      ])
        window.ctx.observeArchiveMessage(JSON.stringify(message), {});
      await window.ctx.challengeArchive.flush();
    });
    assert.deepEqual(await page.evaluate(() => window.readArchive()), archive);
    const count = archive.floors[0].events.length;
    await page.evaluate(() => window.stop());
    assert.equal(
      await page.evaluate(
        () =>
          window.WebSocket.prototype.send === window.originalSend &&
          Object.getOwnPropertyDescriptor(MessageEvent.prototype, "data").get === window.originalData
      ),
      true
    );
    await page.reload();
    await setup();
    archive = await page.evaluate(() => window.readArchive());
    assert.equal(archive.floors[0].events.length, count);
    // Two connections merge transactions; neither duplicate state nor overwrite the other's commands.
    await page.evaluate(async () => {
      const second = MwiLabyrinthArchiveStore.create();
      const base = MwiLabyrinthArchiveModel.snapshot(window.state.characterLabyrinth, "A");
      second.append(base);
      for (let i = 0; i < 10; i++) {
        const item = {
          ...base,
          at: Date.now(),
          kind: "command",
          data: { type: "advance_labyrinth_floor" },
          room: [1, 1]
        };
        window.ctx.challengeArchive.append({ ...item, id: `one:${i}` });
        second.append({ ...item, id: `two:${i}` });
      }
      await Promise.all([window.ctx.challengeArchive.flush(), second.flush()]);
      await second.close();
    });
    archive = await page.evaluate(() => window.readArchive());
    assert.equal(archive.floors[0].events.length, count + 20);
    assert.equal(new Set(archive.floors[0].events.map((e) => e.seq)).size, count + 20);
    // Database write failure keeps prior data and pending observations, then recovers.
    await page.evaluate(async () => {
      window.savedPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = () => {
        throw new DOMException("fixture quota", "QuotaExceededError");
      };
      const lab = structuredClone(window.state.characterLabyrinth);
      lab.roomData[1][1].isCleared = true;
      window.emit({ type: "labyrinth_updated", labyrinth: lab });
      await window.ctx.challengeArchive.flush();
    });
    assert.ok(await page.evaluate(() => window.ctx.archiveStatus.pending > 0 && !!window.ctx.archiveStatus.error));
    assert.match(await page.locator("#mwi-labyrinth-calc-archive-status").innerText(), /未保存/);
    assert.equal((await page.evaluate(() => window.readArchive())).floors[0].events.length, count + 20);
    assert.equal(
      await page.evaluate(async () => {
        IDBObjectStore.prototype.put = window.savedPut;
        return window.ctx.challengeArchive.flush();
      }),
      true
    );
    assert.equal(await page.locator("#mwi-labyrinth-calc-archive-status").count(), 0);
    await page.evaluate(async () => {
      let lab = structuredClone(window.state.characterLabyrinth);
      lab.currentFloor = 2;
      lab.roomData = [
        [{ roomType: "/labyrinth_room_types/start", isCleared: true }, {}],
        [{}, { roomType: "/labyrinth_room_types/descend" }]
      ];
      window.emit({ type: "labyrinth_updated", labyrinth: lab });
      lab.startedAt = "run-B";
      lab.currentFloor = 1;
      window.emit({ type: "labyrinth_updated", labyrinth: lab });
      window.state.character.id = "B";
      window.emit({ type: "labyrinth_updated", labyrinth: lab });
      window.emit({ type: "labyrinth_updated", labyrinth: null });
      await window.ctx.challengeArchive.flush();
    });
    archive = await page.evaluate(() => window.readArchive());
    assert.equal(archive.runs.length, 3);
    assert.equal(archive.floors.length, 4);
    assert.deepEqual(archive.runs.find((r) => r.identity === "A" && r.startedAt === "run-A").floors, [1, 2]);
    assert.ok(archive.runs.find((r) => r.identity === "B").removedObservedAt);
    // Migrate a legacy floor on append; batches and rollback preserve every event.
    const chunked = await page.evaluate(async () => {
      const m = MwiLabyrinthArchiveModel,
        store = MwiLabyrinthArchiveStore.create();
      const lab = {
        startedAt: "legacy",
        currentFloor: 1,
        roomData: [[{ roomType: "start", isCleared: true }]],
        pathData: []
      };
      const base = m.snapshot(lab, "legacy-owner", 1);
      let expected = m.reduce(null, null, base);
      for (let i = 0; i < 300; i++)
        expected = m.reduce(expected.run, expected.floor, {
          ...base,
          kind: "progress",
          at: i + 2,
          data: { actionCounter: i },
          room: [0, 0]
        });
      await new Promise((resolve, reject) => {
        const req = indexedDB.open(MwiLabyrinthArchiveStore.DB_NAME, 1);
        req.onsuccess = () => {
          const db = req.result,
            tx = db.transaction(["runs", "floors"], "readwrite");
          tx.objectStore("runs").put(expected.run, ["legacy-owner", "legacy"]);
          tx.objectStore("floors").put(m.encode(expected.floor), ["legacy-owner", "legacy", 1]);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      });
      for (let i = 300; i < 500; i++) {
        const event = { ...base, kind: "progress", at: i + 2, data: { actionCounter: i }, room: [0, 0] };
        expected = m.reduce(expected.run, expected.floor, event);
        store.append(event);
      }
      await store.flush();
      const saved = await window.readArchive();
      const floor = saved.floors.find((f) => f.events[0].at === 1);
      const index = saved.keys.findIndex((key) => key[0] === "legacy-owner");
      const before = JSON.stringify(saved.records[index]);
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === "runs") throw new DOMException("fixture late failure", "QuotaExceededError");
        return original.apply(this, args);
      };
      store.append({ ...base, kind: "progress", at: 999, data: { actionCounter: 999 }, room: [0, 0] });
      const failed = await store.flush();
      IDBObjectStore.prototype.put = original;
      const after = await window.readArchive();
      const unchanged = before === JSON.stringify(after.records[index]);
      await store.flush();
      await store.close();
      return {
        matches: JSON.stringify(floor) === JSON.stringify(expected.floor),
        chunks: saved.records[index].chunks.length,
        failed,
        unchanged
      };
    });
    assert.equal(chunked.matches, true);
    assert.ok(chunked.chunks >= 3);
    assert.equal(chunked.failed, false);
    assert.equal(chunked.unchanged, true);
    assert.deepEqual(errors, []);
    reports.push({
      width,
      chunked,
      checks: [
        "server-hook",
        "command-whitelist",
        "read-dedup",
        "ordered-clears",
        "reload",
        "concurrent-transactions",
        "quota-recovery",
        "floor-run-character-isolation",
        "teardown"
      ],
      errors,
      rawCharacters: archive.records.reduce(
        (n, r) => n + r.head.length + r.chunks.reduce((sum, c) => sum + c.length, 0),
        0
      ),
      compressedCharacters: archive.records.reduce(
        (n, r) => n + r.head.data.length + r.chunks.reduce((sum, c) => sum + c.data.length, 0),
        0
      )
    });
    await page.evaluate(() => window.stop());
    await context.close();
  }
} finally {
  await browser.close();
}
fs.writeFileSync(path.join(directory, "browser-results.json"), JSON.stringify(reports, null, 2));
console.log(JSON.stringify(reports));
