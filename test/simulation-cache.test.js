const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../src/calculator/simulation-cache.js"), "utf8");

function createMockIndexedDB() {
  const stores = {
    samples: new Map(),
    meta: new Map()
  };
  const log = {
    opens: 0,
    transactions: [],
    puts: 0,
    gets: 0,
    failNextOpen: false,
    failNextTx: false,
    throwInvalidStateNextTx: false
  };
  const db = {
    closed: false,
    onversionchange: null,
    onclose: null,
    close() {
      this.closed = true;
    },
    createObjectStore(name) {
      stores[name] ||= new Map();
      return {
        createIndex() {}
      };
    },
    transaction(storeNames, mode = "readonly") {
      const names = Array.isArray(storeNames) ? storeNames : [storeNames];
      if (log.throwInvalidStateNextTx) {
        log.throwInvalidStateNextTx = false;
        const err = new Error("connection closing");
        err.name = "InvalidStateError";
        throw err;
      }
      log.transactions.push({ stores: names, mode });
      const tx = {
        aborted: false,
        oncomplete: null,
        onabort: null,
        onerror: null,
        pending: 0,
        finished: false,
        schedule(fn) {
          tx.pending++;
          queueMicrotask(() => {
            if (tx.aborted || tx.finished) return;
            try {
              fn();
            } finally {
              tx.pending--;
              if (tx.pending === 0 && !tx.aborted && !tx.finished) {
                tx.finished = true;
                if (log.failNextTx) {
                  log.failNextTx = false;
                  tx.onerror?.();
                } else {
                  tx.oncomplete?.();
                }
              }
            }
          });
        },
        abort() {
          if (tx.aborted || tx.finished) return;
          tx.aborted = true;
          tx.finished = true;
          queueMicrotask(() => tx.onabort?.());
        },
        objectStore(name) {
          if (!names.includes(name)) throw new Error(`Store ${name} not in transaction`);
          const map = stores[name];
          return {
            get(key) {
              log.gets++;
              const req = { result: undefined, onsuccess: null };
              tx.schedule(() => {
                req.result = map.has(key) ? structuredClone(map.get(key)) : undefined;
                req.onsuccess?.();
              });
              return req;
            },
            put(value, key) {
              if (mode !== "readwrite") throw new Error("readonly transaction cannot put");
              log.puts++;
              const req = { onsuccess: null };
              tx.schedule(() => {
                map.set(key, structuredClone(value));
                req.onsuccess?.();
              });
              return req;
            },
            clear() {
              if (mode !== "readwrite") throw new Error("readonly transaction cannot clear");
              const req = { onsuccess: null };
              tx.schedule(() => {
                map.clear();
                req.onsuccess?.();
              });
              return req;
            },
            index(indexName) {
              assert.equal(indexName, "used");
              return {
                openCursor() {
                  const req = { result: null, onsuccess: null };
                  let entries = null;
                  let cursorIndex = 0;
                  const emit = () => {
                    tx.schedule(() => {
                      if (entries === null) {
                        entries = [...map.entries()].sort((a, b) => a[1].used - b[1].used);
                      }
                      if (cursorIndex >= entries.length) {
                        req.result = null;
                        req.onsuccess?.();
                        return;
                      }
                      const [key, value] = entries[cursorIndex++];
                      req.result = {
                        key,
                        value: structuredClone(value),
                        delete() {
                          map.delete(key);
                        },
                        continue() {
                          emit();
                        }
                      };
                      req.onsuccess?.();
                    });
                  };
                  emit();
                  return req;
                }
              };
            }
          };
        }
      };
      return tx;
    }
  };
  const indexedDB = {
    open() {
      log.opens++;
      const req = { result: db, onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null };
      queueMicrotask(() => {
        if (log.failNextOpen) {
          log.failNextOpen = false;
          req.onerror?.();
          return;
        }
        db.closed = false;
        req.onsuccess?.();
      });
      return req;
    }
  };
  return { indexedDB, stores, log, db };
}

function loadCacheFactory() {
  const root = { setTimeout, clearTimeout };
  vm.runInNewContext(source, root);
  return root.MwiLabyrinthSimulationCache;
}

test("缓存读取走只读事务且不触发写入，使用时间合批刷新并在淘汰前生效", async () => {
  const factory = loadCacheFactory();
  const mock = createMockIndexedDB();
  let clock = 1000;
  const cache = factory.create({
    indexedDB: mock.indexedDB,
    maxEntries: 2,
    maxBytes: 4096,
    touchFlushDelayMs: 5000,
    now: () => clock
  });
  try {
    await cache.put("a", { score: 1 });
    clock += 10;
    await cache.put("b", { score: 2 });
    const putsBeforeReads = mock.log.puts;
    const txBeforeReads = mock.log.transactions.length;

    clock += 20;
    assert.deepEqual(await cache.get("a"), { score: 1 });
    clock += 5;
    assert.deepEqual(await cache.get("a"), { score: 1 });
    assert.equal(mock.log.puts, putsBeforeReads, "cache hits must not write to IndexedDB during get()");
    const readTxs = mock.log.transactions.slice(txBeforeReads);
    assert.equal(readTxs.length, 2);
    assert.ok(readTxs.every((tx) => tx.mode === "readonly" && tx.stores.length === 1 && tx.stores[0] === "samples"));

    // Writing a third entry applies pending touch on "a" before LRU eviction, so "b" is evicted instead of "a".
    clock += 10;
    await cache.put("c", { score: 3 });
    assert.deepEqual(await cache.get("a"), { score: 1 });
    assert.equal(await cache.get("b"), null);
    assert.deepEqual(await cache.get("c"), { score: 3 });

    // Explicit flush batches all touched keys into a single readwrite transaction.
    const txBeforeFlush = mock.log.transactions.length;
    clock += 100;
    assert.deepEqual(await cache.get("a"), { score: 1 });
    assert.deepEqual(await cache.get("c"), { score: 3 });
    await cache.flush();
    const flushTxs = mock.log.transactions.slice(txBeforeFlush).filter((tx) => tx.mode === "readwrite");
    assert.equal(flushTxs.length, 1);
    assert.equal(mock.stores.samples.get("a").used, clock);
    assert.equal(mock.stores.samples.get("c").used, clock);
  } finally {
    cache.close();
  }
});

test("存储偶发失败进入冷却后自动恢复，显式关闭后不再重连", async () => {
  const factory = loadCacheFactory();
  const mock = createMockIndexedDB();
  let clock = 10000;
  const cache = factory.create({
    indexedDB: mock.indexedDB,
    retryCooldownMs: 100,
    maxCooldownMs: 400,
    now: () => clock
  });
  try {
    await cache.put("k", { ok: true });
    assert.deepEqual(await cache.get("k"), { ok: true });

    // Transient transaction error triggers cooldown, then recovers once cooldown elapses.
    mock.log.failNextTx = true;
    assert.equal(await cache.get("k"), null);
    assert.equal(await cache.get("k"), null, "still cooling down immediately after failure");

    clock += 100;
    assert.deepEqual(await cache.get("k"), { ok: true }, "recovers after cooldown");

    // Closed connection / InvalidStateError resets opening handle and reconnects after cooldown.
    const opensBefore = mock.log.opens;
    mock.log.throwInvalidStateNextTx = true;
    assert.equal(await cache.get("k"), null);
    clock += 100;
    assert.deepEqual(await cache.get("k"), { ok: true });
    assert.equal(mock.log.opens, opensBefore + 1);

    // Synchronous open() throw does not leave a stuck opening promise and recovers after cooldown.
    let throwOpen = true;
    const syncOpenMock = createMockIndexedDB();
    const origOpen = syncOpenMock.indexedDB.open;
    syncOpenMock.indexedDB.open = () => {
      if (throwOpen) throw new Error("sync blocked");
      return origOpen();
    };
    let syncClock = 1000;
    const syncCache = factory.create({
      indexedDB: syncOpenMock.indexedDB,
      retryCooldownMs: 100,
      maxCooldownMs: 200,
      now: () => syncClock
    });
    try {
      assert.equal(await syncCache.get("x"), null);
      throwOpen = false;
      assert.equal(await syncCache.get("x"), null, "respects cooldown after sync open error");
      syncClock += 100;
      await syncCache.put("x", { v: 7 });
      assert.deepEqual(await syncCache.get("x"), { v: 7 });
    } finally {
      syncCache.close();
    }

    // Explicit close permanently stops further database access.
    cache.close();
    clock += 1000;
    assert.equal(await cache.get("k"), null);
    assert.equal(mock.log.opens, opensBefore + 1);
  } finally {
    cache.close();
  }
});
