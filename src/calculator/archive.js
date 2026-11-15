(function (root) {
  "use strict";
  root.MwiLabyrinthCalculatorModules.archive = function (ctx) {
    const model = root.MwiLabyrinthArchiveModel;
    let store = null,
      active = null,
      lastSnapshot = "",
      commandCounter = 0,
      warning = "";
    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const seenMessages = new WeakSet();
    let restoreSend = null;
    function showStatus(status) {
      ctx.archiveStatus = status;
      if (status.error && status.error !== warning) console.warn("[迷宫助手] 迷宫记录未保存：", status.error);
      warning = status.error;
      if (ctx.destroyed || typeof document === "undefined") return;
      let node = document.getElementById("mwi-labyrinth-calc-archive-status");
      if (!status.error) {
        node?.remove();
        return;
      }
      const host = document.getElementById("mwi-labyrinth-calculation-slot");
      if (host && !node) {
        node = document.createElement("p");
        node.id = "mwi-labyrinth-calc-archive-status";
        node.setAttribute("role", "status");
        node.className = "mwi-lab-muted";
        host.append(node);
      }
      if (node) node.textContent = "迷宫记录未保存，将自动重试。请暂勿关闭页面。";
    }
    function identity(state) {
      return String(state?.character?.id || state?.characterId || "");
    }
    ctx.observeArchiveState = (state, source = "state", override) => {
      if (!store || ctx.destroyed) return;
      const owner = identity(state);
      if (!owner) {
        active = null;
        lastSnapshot = "";
        return;
      }
      if (active && active.identity !== owner) {
        active = null;
        lastSnapshot = "";
      }
      const labyrinth = override === undefined ? state?.characterLabyrinth : override;
      if (!labyrinth) {
        active = null;
        lastSnapshot = "";
        return;
      }
      const observation = model.snapshot(labyrinth, owner, Date.now(), source);
      if (!observation) return;
      active = observation;
      const signature = JSON.stringify({ ...observation, at: 0, source: "" });
      if (signature === lastSnapshot) return;
      lastSnapshot = signature;
      store.append(observation);
    };
    function append(kind, data, source, id) {
      if (!active || !store || ctx.destroyed) return;
      store.append({
        identity: active.identity,
        startedAt: active.startedAt,
        floor: active.floor,
        at: Date.now(),
        source,
        kind,
        data,
        room: active.path[0] || null,
        id
      });
    }
    ctx.observeArchiveMessage = (raw, event) => {
      if (!store || typeof raw !== "string" || (event && seenMessages.has(event))) return;
      if (!/^\s*\{/.test(raw) || !/"(?:labyrinth_updated|labyrinth_room_progress)"/.test(raw)) return;
      if (event) seenMessages.add(event);
      try {
        const msg = JSON.parse(raw);
        const state = ctx.getGameState();
        const owner = identity(state);
        if (!owner) return;
        // A delayed packet may belong to the character we just left. Check every
        // available identity, including removal packets without a labyrinth body.
        if ([msg.characterId, msg.labyrinth?.characterId].some((id) => id != null && String(id) !== owner)) return;
        if (msg.type === "labyrinth_updated") {
          // This message carries a complete labyrinth object; read it before React batches updates.
          if (msg.labyrinth === null) {
            if (active?.identity === owner) append("removed", null, "server");
            active = null;
            lastSnapshot = "";
          } else ctx.observeArchiveState(state, "server", msg.labyrinth);
        } else if (msg.type === "labyrinth_room_progress") {
          if (!active || active.identity !== owner) ctx.observeArchiveState(state);
          const data = model.progress(msg);
          if (data) append("progress", data, "server");
        }
      } catch (error) {
        console.warn("[迷宫助手] 无法记录迷宫更新：", error.message);
      }
    };
    ctx.startChallengeArchive = () => {
      if (store) return;
      store = root.MwiLabyrinthArchiveStore.create({ onStatus: showStatus });
      ctx.challengeArchive = store;
      ctx.observeArchiveState(ctx.getGameState());
      // Observe only allowed commands, after the original send succeeds. Never send or alter data.
      const original = WebSocket.prototype.send;
      const send = function (data) {
        const result = original.apply(this, arguments);
        try {
          if (
            !ctx.destroyed &&
            typeof data === "string" &&
            /"(?:update_labyrinth_path|use_labyrinth_beacon|use_labyrinth_shroud|advance_labyrinth_floor|escape_labyrinth|cancel_character_action|new_character_action)"/.test(
              data
            )
          ) {
            const state = ctx.getGameState();
            ctx.observeArchiveState(state);
            const command = model.command(JSON.parse(data), state);
            if (command && active?.identity === identity(state))
              append("command", command, "client", `${clientId}:${++commandCounter}`);
          }
        } catch (error) {
          console.warn("[迷宫助手] 无法记录迷宫操作：", error.message);
        }
        return result;
      };
      try {
        WebSocket.prototype.send = send;
        restoreSend = () => {
          if (WebSocket.prototype.send === send) WebSocket.prototype.send = original;
        };
      } catch (error) {
        console.warn("[迷宫助手] 无法记录发出的迷宫操作，仍记录房间状态：", error.message);
      }
      ctx.setInterval(() => {
        // Recording continues in background tabs and on other game pages.
        ctx.observeArchiveState(ctx.getGameState());
        if (store.status().error) {
          showStatus(store.status());
          void store.flush();
        }
      }, 1000);
      ctx.listen(window, "pagehide", () => {
        void store.flush();
      });
    };
    ctx.stopChallengeArchive = () => {
      restoreSend?.();
      return store?.close();
    };
  };
})(globalThis);
