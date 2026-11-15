(function (root) {
  "use strict";
  const DB_NAME = "mwi-labyrinth:challenge-archive:v1";
  function create({ indexedDB = root.indexedDB, onStatus = () => {} } = {}) {
    let connection = null,
      opening = null,
      draining = null,
      closed = false;
    const queue = [];
    const status = { pending: 0, lastSavedAt: null, error: "" };
    function report(error = "") {
      status.pending = queue.length;
      status.error = error;
      onStatus({ ...status });
    }
    function open() {
      if (connection) return Promise.resolve(connection);
      if (opening) return opening;
      opening = new Promise((resolve, reject) => {
        if (!indexedDB) {
          reject(new Error("浏览器数据库不可用"));
          return;
        }
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          db.createObjectStore("runs");
          db.createObjectStore("floors");
        };
        request.onblocked = () => report("档案数据库被其他页面占用");
        request.onerror = () => reject(request.error || new Error("无法打开档案数据库"));
        request.onsuccess = () => {
          connection = request.result;
          const opened = connection;
          opened.onversionchange = () => {
            opened.close();
            if (connection === opened) connection = null;
          };
          resolve(connection);
        };
      }).finally(() => {
        opening = null;
      });
      return opening;
    }
    async function write(batch) {
      const observation = batch[0];
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(["runs", "floors"], "readwrite");
        const runs = tx.objectStore("runs"),
          floors = tx.objectStore("floors");
        const runKey = [observation.identity, observation.startedAt];
        const floorKey = [...runKey, observation.floor];
        const runRequest = runs.get(runKey),
          floorRequest = floors.get(floorKey);
        let ready = 0,
          failure = null;
        const received = () => {
          if (++ready !== 2) return;
          try {
            const model = root.MwiLabyrinthArchiveModel;
            const prior = model.readAppend(floorRequest.result);
            let run = runRequest.result || null,
              floor = prior.floor,
              changed = false;
            for (const item of batch) {
              const next = model.reduce(run, floor, item, true);
              if (next) {
                ({ run, floor } = next);
                changed = true;
              }
            }
            if (changed) {
              floors.put(model.encodeAppend(floor, prior.chunks), floorKey);
              runs.put(run, runKey);
            }
          } catch (error) {
            failure = error;
            tx.abort();
          }
        };
        runRequest.onsuccess = floorRequest.onsuccess = received;
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(failure || tx.error || new Error("档案写入已取消"));
        tx.onerror = () => {}; // The abort handler reports failure, never request success.
      });
    }
    function flush() {
      if (draining) return draining;
      if (closed) return Promise.resolve(false);
      draining = (async () => {
        while (queue.length) {
          const first = queue[0];
          // Only combine consecutive observations of the same floor: crossing a
          // floor/run/character boundary must retain the original global order.
          let count = 1;
          while (count < Math.min(queue.length, 64)) {
            const item = queue[count];
            if (item.identity !== first.identity || item.startedAt !== first.startedAt || item.floor !== first.floor)
              break;
            count++;
          }
          try {
            await write(queue.slice(0, count));
          } catch (error) {
            report(error.message);
            return false;
          }
          queue.splice(0, count);
          status.lastSavedAt = Date.now();
          report();
        }
        return true;
      })().finally(() => {
        draining = null;
      });
      return draining;
    }
    return Object.freeze({
      append(observation) {
        if (closed) return false;
        queue.push(observation);
        report(status.error);
        if (!status.error) void flush();
        return true;
      },
      flush,
      status: () => ({ ...status, pending: queue.length }),
      async close() {
        const saved = await flush();
        closed = true;
        connection?.close();
        connection = null;
        return saved;
      }
    });
  }
  root.MwiLabyrinthArchiveStore = Object.freeze({ create, DB_NAME });
})(globalThis);
