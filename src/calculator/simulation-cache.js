// Local, disposable simulation samples. Never stores credentials or uploads data.
(function (root) {
  "use strict";
  function create({ indexedDB = root.indexedDB, maxEntries = 8192, maxBytes = 32 * 1024 * 1024 } = {}) {
    let opening,
      disabled = false;
    function open() {
      if (disabled || !indexedDB) return Promise.resolve(null);
      return (opening ||= new Promise((resolve) => {
        let settled = false;
        const finish = (db) => {
          if (settled) {
            db?.close();
            return;
          }
          settled = true;
          clearTimeout(timer);
          if (!db) disabled = true;
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
              disabled = true;
            };
            finish(db);
          };
        } catch {
          finish(null);
        }
      }));
    }
    async function transaction(action) {
      const db = await open();
      if (!db || disabled) return null;
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
          disabled = true;
          try {
            tx?.abort();
          } catch {
            /* Already completed. */
          }
          finish(null);
        }, 1500);
        try {
          tx = db.transaction(["samples", "meta"], "readwrite");
          tx.oncomplete = () => finish(value);
          tx.onabort = tx.onerror = () => {
            disabled = true;
            finish(null);
          };
          action(
            tx.objectStore("samples"),
            tx.objectStore("meta"),
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
        } catch {
          disabled = true;
          finish(null);
        }
      });
    }
    return {
      close() {
        disabled = true;
        void opening?.then((db) => db?.close());
      },
      get(key) {
        return transaction((samples, _meta, set, guard) => {
          const request = samples.get(key);
          request.onsuccess = guard(() => {
            const row = request.result;
            if (!row || row.schema !== 1) return;
            samples.put({ ...row, used: Date.now() }, key);
            set(row.result);
          });
        });
      },
      put(key, result) {
        // JSON is only used for the size estimate. IndexedDB preserves Infinity.
        const bytes = 2 * (key.length + JSON.stringify(result).length);
        if (bytes > maxBytes) return Promise.resolve(null);
        return transaction((samples, meta, _set, guard) => {
          const prior = samples.get(key),
            totals = meta.get("totals");
          let ready = 0;
          const write = () => {
            if (++ready !== 2) return;
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
            samples.put({ schema: 1, bytes, used: Date.now(), result }, key);
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
          prior.onsuccess = totals.onsuccess = guard(write);
        });
      },
      clear() {
        return transaction((samples, meta, set) => {
          samples.clear();
          meta.clear();
          set(true);
        });
      }
    };
  }
  root.MwiLabyrinthSimulationCache = Object.freeze({ create });
})(globalThis);
