(function (root) {
  "use strict";
  function create({ indexedDB = root.indexedDB } = {}) {
    let opening,
      connection,
      closed = false;
    function open() {
      if (closed) return Promise.reject(new Error("代币记录已关闭"));
      if (connection) return Promise.resolve(connection);
      if (opening) return opening;
      opening = new Promise((resolve, reject) => {
        if (!indexedDB) {
          reject(new Error("浏览器数据库不可用"));
          return;
        }
        const request = indexedDB.open("mwi-labyrinth:tokens:v1", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("characters");
        request.onerror = () => reject(request.error || new Error("无法打开代币记录"));
        request.onblocked = () => reject(new Error("数据库被其他页面占用，请关闭旧页面后重试"));
        request.onsuccess = () => {
          if (closed) {
            request.result.close();
            reject(new Error("代币记录已关闭"));
            return;
          }
          connection = request.result;
          connection.onversionchange = () => {
            connection.close();
            connection = null;
          };
          resolve(connection);
        };
      }).finally(() => {
        opening = null;
      });
      return opening;
    }
    async function transact(owner, update) {
      if (!owner) throw new Error("尚未识别角色");
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("characters", update ? "readwrite" : "readonly");
        const store = tx.objectStore("characters");
        const request = store.get(owner);
        let result, failure;
        request.onsuccess = () => {
          try {
            result = root.MwiLabyrinthTokens.validateProfile(
              request.result ?? root.MwiLabyrinthTokens.emptyProfile(),
              owner
            );
            if (update) {
              update(result);
              root.MwiLabyrinthTokens.validateProfile(result, owner);
              store.put(result, owner);
            }
          } catch (error) {
            failure = error;
            tx.abort();
          }
        };
        tx.oncomplete = () => resolve(result);
        tx.onabort = tx.onerror = () => reject(failure || tx.error || new Error("未能保存代币记录"));
      });
    }
    return {
      load: (owner) => transact(owner),
      savePlan: (owner, plan) =>
        transact(owner, (profile) => {
          profile.plan = structuredClone(root.MwiLabyrinthTokens.validatePlan(plan));
        }),
      observe: (record) =>
        transact(record.owner, (profile) => {
          const index = profile.runs.findIndex((r) => r.startedAt === record.startedAt);
          const merged = root.MwiLabyrinthTokens.mergeRun(profile.runs[index], record);
          if (index < 0) profile.runs.push(merged);
          else profile.runs[index] = merged;
        }),
      close() {
        closed = true;
        connection?.close();
      }
    };
  }
  root.MwiLabyrinthTokenStore = { create };
})(globalThis);
