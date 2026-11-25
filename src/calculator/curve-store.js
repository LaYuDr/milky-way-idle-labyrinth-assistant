// Local IndexedDB storage for precomputed combat level curves (1..300+).
// Stores compact ArrayBuffer curve tables per character + monster + profile fingerprint.
// Never stores credentials or uploads data.
(function (root) {
  "use strict";

  const DB_NAME = "mwi-labyrinth:curve-store:v1";
  const DB_VERSION = 1;
  const SCHEMA_VERSION = 1;
  const STRIDE_BYTES = 16 * Float64Array.BYTES_PER_ELEMENT;

  function isArrayBuffer(value) {
    return Boolean(
      value && (value instanceof ArrayBuffer || Object.prototype.toString.call(value) === "[object ArrayBuffer]")
    );
  }

  function toArrayBuffer(value) {
    if (isArrayBuffer(value)) return value.slice(0);
    if (ArrayBuffer.isView(value)) {
      return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    }
    return null;
  }

  function isValidRecord(row) {
    if (!row || typeof row !== "object" || row.schema !== SCHEMA_VERSION) return false;
    if (
      typeof row.key !== "string" ||
      !row.key ||
      typeof row.characterId !== "string" ||
      !row.characterId ||
      typeof row.monsterHrid !== "string" ||
      !row.monsterHrid ||
      typeof row.profileHash !== "string" ||
      !row.profileHash
    ) {
      return false;
    }
    if (!Number.isSafeInteger(row.maxLevel) || row.maxLevel < 1 || row.maxLevel > 10000) return false;
    const buffer = isArrayBuffer(row.buffer) ? row.buffer : null;
    if (!buffer || buffer.byteLength !== row.maxLevel * STRIDE_BYTES) return false;
    return true;
  }

  function estimateBytes(row) {
    const bufferBytes = row?.buffer?.byteLength || 0;
    const metaBytes = 256 + 2 * String(row?.key || "").length;
    return bufferBytes + metaBytes;
  }

  function create({
    indexedDB = root.indexedDB,
    maxEntries = 128,
    maxBytes = 24 * 1024 * 1024,
    flushDelayMs = 1500,
    retryCooldownMs = 5000,
    maxCooldownMs = 60000,
    now = () => Date.now()
  } = {}) {
    let opening = null;
    let closed = false;
    let cooldownUntil = 0;
    let failureStreak = 0;
    let flushTimer = null;
    let activeFlush = null;
    const dirtyWrites = new Map();
    const touchedKeys = new Map();

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

    function clearFlushTimer() {
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
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
          const request = indexedDB.open(DB_NAME, DB_VERSION);
          request.onupgradeneeded = () => {
            const db = request.result;
            const curves = db.createObjectStore("curves", { keyPath: "key" });
            curves.createIndex("usedAt", "usedAt");
            curves.createIndex("characterId", "characterId");
            db.createObjectStore("meta");
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
        let tx;
        let value = null;
        let done = false;
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
        }, 2500);
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

    function sanitizeInputRecord(key, raw) {
      if (!key || typeof key !== "string" || !raw || typeof raw !== "object") return null;
      const buffer = toArrayBuffer(raw.buffer);
      if (!buffer) return null;
      const maxLevel = Math.floor(Number(raw.maxLevel) || 0);
      if (!Number.isSafeInteger(maxLevel) || maxLevel < 1 || buffer.byteLength !== maxLevel * STRIDE_BYTES) {
        return null;
      }
      const record = {
        schema: SCHEMA_VERSION,
        key,
        characterId: String(raw.characterId || ""),
        monsterHrid: String(raw.monsterHrid || ""),
        profileHash: String(raw.profileHash || ""),
        engineSignature: String(raw.engineSignature || ""),
        gameDataHash: String(raw.gameDataHash || ""),
        maxLevel,
        baseTrials: Math.max(0, Math.floor(Number(raw.baseTrials) || 0)),
        targetTrials: Math.max(0, Math.floor(Number(raw.targetTrials) || 0)),
        completedLevels: Math.max(0, Math.floor(Number(raw.completedLevels) || 0)),
        refinedComplete: Boolean(raw.refinedComplete),
        fullPrecision: Boolean(raw.fullPrecision),
        updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : now(),
        usedAt: now(),
        buffer
      };
      if (!isValidRecord(record)) return null;
      record.bytes = estimateBytes(record);
      return record;
    }

    function scheduleFlush() {
      if (closed || flushTimer !== null) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        void flush();
      }, flushDelayMs);
    }

    function putBatch(records, touches) {
      if (!records.length && !touches.length) return Promise.resolve(true);
      return transaction(["curves", "meta"], "readwrite", (tx, set, guard) => {
        const curves = tx.objectStore("curves");
        const meta = tx.objectStore("meta");
        const totalsReq = meta.get("totals");
        const priorReqs = records.map((rec) => ({ rec, req: curves.get(rec.key) }));
        const touchReqs = touches.map(([touchKey, usedAt]) => ({ touchKey, usedAt, req: curves.get(touchKey) }));
        let ready = 0;
        const needed = 1 + priorReqs.length + touchReqs.length;

        const commit = () => {
          if (++ready !== needed) return;
          const count = { entries: 0, bytes: 0, ...totalsReq.result };
          let valid = [count.entries, count.bytes].every((n) => Number.isSafeInteger(n) && n >= 0);

          for (const { rec, req } of priorReqs) {
            const prior = req.result;
            if (prior && (!Number.isSafeInteger(prior.bytes) || prior.bytes <= 0)) {
              valid = false;
              break;
            }
            if (!valid) break;
            count.entries += prior ? 0 : 1;
            count.bytes += rec.bytes - (prior?.bytes || 0);
          }

          if (!valid) {
            curves.clear();
            count.entries = 0;
            count.bytes = 0;
            for (const { rec } of priorReqs) {
              curves.put(rec);
              count.entries += 1;
              count.bytes += rec.bytes;
            }
          } else {
            for (const { rec } of priorReqs) {
              curves.put(rec);
            }
            for (const { usedAt, req } of touchReqs) {
              const row = req.result;
              if (row && row.schema === SCHEMA_VERSION && !(row.usedAt >= usedAt)) {
                curves.put({ ...row, usedAt });
              }
            }
          }

          const finishMeta = () => {
            meta.put(count, "totals");
            set(true);
          };

          if (count.entries <= maxEntries && count.bytes <= maxBytes) {
            finishMeta();
            return;
          }

          const cursor = curves.index("usedAt").openCursor();
          cursor.onsuccess = guard(() => {
            const item = cursor.result;
            if (!item || (count.entries <= maxEntries && count.bytes <= maxBytes)) {
              finishMeta();
              return;
            }
            count.entries = Math.max(0, count.entries - 1);
            count.bytes = Math.max(0, count.bytes - (Number(item.value?.bytes) || 0));
            item.delete();
            item.continue();
          });
        };

        totalsReq.onsuccess = guard(commit);
        for (const item of priorReqs) item.req.onsuccess = guard(commit);
        for (const item of touchReqs) item.req.onsuccess = guard(commit);
      });
    }

    function flush() {
      clearFlushTimer();
      if (isUnavailable()) return activeFlush || Promise.resolve(null);
      if (!dirtyWrites.size && !touchedKeys.size) return activeFlush || Promise.resolve(true);

      const records = [...dirtyWrites.values()];
      for (const rec of records) touchedKeys.delete(rec.key);
      const touches = [...touchedKeys.entries()];
      dirtyWrites.clear();
      touchedKeys.clear();

      const pending = putBatch(records, touches).finally(() => {
        if (activeFlush === pending) activeFlush = null;
      });
      activeFlush = pending;
      return pending;
    }

    return {
      close() {
        closed = true;
        clearFlushTimer();
        dirtyWrites.clear();
        touchedKeys.clear();
        const pending = opening;
        opening = null;
        void pending?.then((db) => db?.close?.());
      },
      flush,
      get(key) {
        if (!key || typeof key !== "string") return Promise.resolve(null);
        const queued = dirtyWrites.get(key);
        if (queued) {
          return Promise.resolve({ ...queued, buffer: queued.buffer.slice(0) });
        }
        return transaction(["curves"], "readonly", (tx, set, guard) => {
          const req = tx.objectStore("curves").get(key);
          req.onsuccess = guard(() => {
            const row = req.result;
            if (!isValidRecord(row)) return;
            touchedKeys.set(key, now());
            scheduleFlush();
            set({ ...row, buffer: row.buffer.slice(0) });
          });
        });
      },
      put(key, raw) {
        const record = sanitizeInputRecord(key, raw);
        if (!record || record.bytes > maxBytes) return Promise.resolve(null);
        dirtyWrites.delete(key);
        touchedKeys.delete(key);
        return putBatch([record], []);
      },
      schedulePut(key, raw) {
        if (closed) return false;
        const record = sanitizeInputRecord(key, raw);
        if (!record || record.bytes > maxBytes) return false;
        dirtyWrites.set(key, record);
        touchedKeys.delete(key);
        scheduleFlush();
        return true;
      },
      clear() {
        clearFlushTimer();
        dirtyWrites.clear();
        touchedKeys.clear();
        return transaction(["curves", "meta"], "readwrite", (tx, set) => {
          tx.objectStore("curves").clear();
          tx.objectStore("meta").clear();
          set(true);
        });
      }
    };
  }

  root.MwiLabyrinthCurveStore = Object.freeze({
    DB_NAME,
    SCHEMA_VERSION,
    STRIDE_BYTES,
    create
  });
})(globalThis);
