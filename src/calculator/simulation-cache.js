// Local, disposable simulation samples. Never stores credentials or uploads data.
(function (root) {
  "use strict";
  function create({
    indexedDB = root.indexedDB,
    maxEntries = 8192,
    maxBytes = 32 * 1024 * 1024,
    touchFlushDelayMs = 500,
    touchBatchLimit = 32,
    retryCooldownMs = 5000,
    maxCooldownMs = 60000,
    now = () => Date.now()
  } = {}) {
    let opening = null,
      closed = false,
      cooldownUntil = 0,
      failureStreak = 0,
      touchTimer = null,
      touchFlush = null;
    const touched = new Map();
    function isUnavailable() {
      return closed || !indexedDB || now() < cooldownUntil;
    }
    function recordSuccess() {
      failureStreak = 0;
      cooldownUntil = 0;
    }
    function recordFailure(resetConnection = false) {
      failureStreak = Math.min(failureStreak + 1, 6);
      cooldownUntil = now() + Math.min(maxCooldownMs, retryCooldownMs * 2 ** (failureStreak - 1));
      if (resetConnection) {
        const pending = opening;
        opening = null;
        void pending?.then((db) => db?.close?.());
      }
    }
    function clearTouchTimer() {
      if (touchTimer !== null) {
        clearTimeout(touchTimer);
        touchTimer = null;
      }
    }
    function takeTouched(excludeKey = null) {
      if (excludeKey !== null) touched.delete(excludeKey);
      if (!touched.size) return [];
      const batch = [...touched.entries()];
      touched.clear();
      clearTouchTimer();
      return batch;
    }
    function markTouched(key) {
      if (closed) return;
      touched.set(key, now());
      if (touched.size >= touchBatchLimit) {
        void flushTouches();
        return;
      }
      if (touchTimer === null) {
        touchTimer = setTimeout(() => {
          touchTimer = null;
          void flushTouches();
        }, touchFlushDelayMs);
      }
    }
    function open() {
      if (isUnavailable()) return Promise.resolve(null);
      if (opening) return opening;
      let failed = false;
      let attempt = null;
      attempt = new Promise((resolve) => {
        let settled = false;
        const finish = (db) => {
          if (settled) {
            db?.close?.();
            return;
          }
          settled = true;
          clearTimeout(timer);
          if (!db) {
            failed = true;
            if (attempt && opening === attempt) opening = null;
            recordFailure();
          }
          resolve(db);
        };
        const timer = setTimeout(() => finish(null), 1500);
        try {
          const request = indexedDB.open("mwi-labyrinth:simulation-cache:v1", 1);
          request.onupgradeneeded = () => {
            request.result.createObjectStore("samples").createIndex("used", "used");
            request.result.createObjectStore("meta");
          };
          request.onerror = request.onblocked = () => finish(null);
          request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => {
              db.close();
              if (attempt && opening === attempt) opening = null;
              recordFailure();
            };
            db.onclose = () => {
              if (attempt && opening === attempt) opening = null;
            };
            finish(db);
          };
        } catch {
          finish(null);
        }
      });
      if (!failed) opening = attempt;
      return attempt;
    }
    async function transaction(stores, mode, action) {
      const db = await open();
      if (!db || isUnavailable()) return null;
      return new Promise((resolve) => {
        let tx,
          value = null,
          done = false;
        const finish = (result) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(result);
        };
        const timer = setTimeout(() => {
          recordFailure();
          try {
            tx?.abort();
          } catch {
            /* Already completed. */
          }
          finish(null);
        }, 1500);
        try {
          tx = db.transaction(stores, mode);
          tx.oncomplete = () => {
            recordSuccess();
            finish(value);
          };
          tx.onabort = tx.onerror = () => {
            recordFailure();
            finish(null);
          };
          action(
            tx,
            (result) => {
              value = result;
            },
            (callback) => () => {
              try {
                callback();
              } catch {
                tx.abort();
              }
            }
          );
        } catch (error) {
          recordFailure(error?.name === "InvalidStateError");
          finish(null);
        }
      });
    }
    function flushTouches() {
      clearTouchTimer();
      if (!touched.size || isUnavailable()) return touchFlush || Promise.resolve(null);
      const batch = takeTouched();
      const pending = transaction(["samples"], "readwrite", (tx, set, guard) => {
        const samples = tx.objectStore("samples");
        for (const [key, used] of batch) {
          const request = samples.get(key);
          request.onsuccess = guard(() => {
            const row = request.result;
            if (!row || row.schema !== 1 || row.used >= used) return;
            samples.put({ ...row, used }, key);
          });
        }
        set(true);
      }).finally(() => {
        if (touchFlush === pending) touchFlush = null;
      });
      touchFlush = pending;
      return pending;
    }
    return {
      close() {
        closed = true;
        clearTouchTimer();
        touched.clear();
        const pending = opening;
        opening = null;
        void pending?.then((db) => db?.close?.());
      },
      flush() {
        return flushTouches();
      },
      get(key) {
        return transaction(["samples"], "readonly", (tx, set, guard) => {
          const request = tx.objectStore("samples").get(key);
          request.onsuccess = guard(() => {
            const row = request.result;
            if (!row || row.schema !== 1) return;
            markTouched(key);
            set(row.result);
          });
        });
      },
      put(key, result) {
        // JSON is only used for the size estimate. IndexedDB preserves Infinity.
        const bytes = 2 * (key.length + JSON.stringify(result).length);
        if (bytes > maxBytes) return Promise.resolve(null);
        return transaction(["samples", "meta"], "readwrite", (tx, _set, guard) => {
          const samples = tx.objectStore("samples"),
            meta = tx.objectStore("meta"),
            touchBatch = takeTouched(key);
          const prior = samples.get(key),
            totals = meta.get("totals");
          let ready = 0;
          const needed = 2 + touchBatch.length;
          const write = () => {
            if (++ready !== needed) return;
            const count = { entries: 0, bytes: 0, ...totals.result };
            const valid =
              [count.entries, count.bytes].every((n) => Number.isSafeInteger(n) && n >= 0) &&
              (!prior.result || (Number.isSafeInteger(prior.result.bytes) && prior.result.bytes > 0));
            if (!valid) {
              samples.clear();
              count.entries = 1;
              count.bytes = bytes;
            } else {
              count.entries += prior.result ? 0 : 1;
              count.bytes += bytes - (prior.result?.bytes || 0);
            }
            samples.put({ schema: 1, bytes, used: now(), result }, key);
            const save = () => meta.put(count, "totals");
            if (count.entries <= maxEntries && count.bytes <= maxBytes) {
              save();
              return;
            }
            const cursor = samples.index("used").openCursor();
            cursor.onsuccess = guard(() => {
              const item = cursor.result;
              if (!item || (count.entries <= maxEntries && count.bytes <= maxBytes)) {
                save();
                return;
              }
              count.entries--;
              count.bytes -= item.value.bytes;
              item.delete();
              item.continue();
            });
          };
          for (const [touchKey, used] of touchBatch) {
            const touchRequest = samples.get(touchKey);
            touchRequest.onsuccess = guard(() => {
              const row = touchRequest.result;
              if (row && row.schema === 1 && !(row.used >= used)) samples.put({ ...row, used }, touchKey);
              write();
            });
          }
          prior.onsuccess = totals.onsuccess = guard(write);
        });
      },
      clear() {
        clearTouchTimer();
        touched.clear();
        return transaction(["samples", "meta"], "readwrite", (tx, set) => {
          tx.objectStore("samples").clear();
          tx.objectStore("meta").clear();
          set(true);
        });
      }
    };
  }
  root.MwiLabyrinthSimulationCache = Object.freeze({ create });
})(globalThis);
