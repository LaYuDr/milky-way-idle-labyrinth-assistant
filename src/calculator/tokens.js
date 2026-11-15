(function (root) {
  "use strict";
  root.MwiLabyrinthCalculatorModules.tokens = function (ctx) {
    const M = root.MwiLabyrinthTokens;
    const sessions = new Map();
    let store = null,
      view = null,
      currentOwner = "",
      currentState = null,
      lastRender = "";
    let catalogCache = null,
      catalogKey = "",
      catalogRevision = 0,
      nativeRevision = 0,
      catalogHost = null;
    let catalogObserver = null;
    const invalidateCatalog = (records) => {
      if (
        records.some((record) => {
          const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
          if (!target || target.closest('[id^="mwi-labyrinth-"], [class^="mwi-labyrinth-"]')) return false;
          const relevant = '[class*="LabyrinthPanel_labyrinthShopTab"], svg, use, image, img';
          return Boolean(
            target.closest('[class*="LabyrinthPanel_labyrinthShopTab"]') ||
            target.matches(relevant) ||
            [...record.addedNodes, ...record.removedNodes].some(
              (node) =>
                node.nodeType === 1 &&
                !node.matches('[id^="mwi-labyrinth-"], [class^="mwi-labyrinth-"]') &&
                (node.matches(relevant) || node.querySelector(relevant))
            )
          );
        })
      )
        nativeRevision++;
    };
    const identity = (state) => String(state?.character?.id ?? state?.characterId ?? "");
    function session(owner) {
      if (!sessions.has(owner))
        sessions.set(owner, {
          owner,
          profile: M.emptyProfile(),
          loaded: false,
          loading: false,
          saving: false,
          error: "",
          pending: new Map(),
          fingerprints: new Map(),
          revision: 0,
          savedRevision: 0,
          viewRevision: 0,
          retryAt: 0
        });
      return sessions.get(owner);
    }
    function names(state, init) {
      const native = new Map();
      for (const item of document.querySelectorAll(
        '[class*="LabyrinthPanel_labyrinthShopTab"] [class*="LabyrinthPanel_item"]'
      )) {
        const name = item.querySelector('[class*="LabyrinthPanel_name"]')?.textContent.trim();
        for (const icon of item.querySelectorAll("use,image,img")) {
          const url = icon.getAttribute("href") || icon.getAttribute("xlink:href") || icon.getAttribute("src") || "";
          const match = url.match(/(?:#|\/)([a-z0-9_]+)(?:\.[a-z]+)?$/i);
          if (name && match) native.set(`/items/${match[1]}`, name);
        }
      }
      return (id) =>
        native.get(id) || ctx.getItemDetailByHrid?.(state, init, id)?.name || id.split("/").at(-1).replaceAll("_", " ");
    }
    function decorateCatalog(catalog) {
      const symbols = [
        "labyrinth_cooldown",
        "torch_capacity",
        "shroud_capacity",
        "beacon_capacity",
        "floor_automation",
        "labyrinth_skilling_speed",
        "labyrinth_skilling_efficiency",
        "labyrinth_skilling_success",
        "labyrinth_double_progress",
        "labyrinth_combat_damage",
        "labyrinth_attack_speed",
        "labyrinth_cast_speed",
        "labyrinth_critical_rate",
        "labyrinth_experience"
      ];
      const seenIcons = new Map();
      for (const use of document.querySelectorAll("svg use")) {
        if (use.closest("#mwi-labyrinth-calc-tokens")) continue;
        const href = use.getAttribute("href") || use.getAttribute("xlink:href");
        if (href && href.includes("#") && !/^\s*(javascript|data):/i.test(href))
          seenIcons.set(href.split("#").at(-1), href);
      }
      return catalog.map((item, index) => ({
        ...item,
        iconHref: seenIcons.get(item.kind === "item" ? item.itemHrid?.split("/").at(-1) : symbols[index]) || null
      }));
    }
    function render() {
      if (!view || ctx.destroyed || document.hidden) return;
      view.mount(Boolean(currentOwner));
      view.setOwner?.(currentOwner);
      if (!currentOwner || !view.isVisible()) return;
      const s = session(currentOwner);
      const init = ctx.getInitClientData?.();
      const host = document.querySelector('[class*="LabyrinthPanel_labyrinthPanel"]');
      if (catalogHost !== host) {
        catalogObserver.disconnect();
        catalogHost = host;
        nativeRevision++;
        if (host)
          catalogObserver.observe(host, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ["href", "xlink:href", "src"]
          });
      }
      const shop = init?.labyrinthShopItemDetailMap;
      const nextCatalogKey = JSON.stringify([
        currentOwner,
        nativeRevision,
        document.documentElement.lang,
        M.definitions.map((entry) => currentState?.characterInfo?.[entry[2]]),
        typeof shop?.values === "function" ? [...shop.values()] : shop
      ]);
      if (nextCatalogKey !== catalogKey) {
        catalogKey = nextCatalogKey;
        catalogCache = decorateCatalog(M.catalog(currentState, init, names(currentState, init)));
        catalogRevision++;
      }
      const snapshot = M.observation(currentState);
      const data = {
        owner: currentOwner,
        profile: s.profile,
        loaded: s.loaded,
        saving: s.saving || s.revision !== s.savedRevision,
        saveError: s.error,
        balance: M.balance(currentState),
        catalog: catalogCache,
        activeRun: currentState?.characterLabyrinth?.isActive === true ? snapshot?.startedAt : null
      };
      const signature = JSON.stringify([
        currentOwner,
        s.viewRevision,
        data.loaded,
        data.saving,
        data.saveError,
        data.balance,
        catalogRevision,
        data.activeRun
      ]);
      if (signature !== lastRender) {
        lastRender = signature;
        view.update(data);
      }
    }
    function overlay(s, profile) {
      if (s.revision !== s.savedRevision) profile.plan = s.profile.plan;
      for (const record of s.pending.values()) {
        const index = profile.runs.findIndex((r) => r.startedAt === record.startedAt);
        const merged = M.mergeRun(profile.runs[index], record);
        if (index < 0) profile.runs.push(merged);
        else profile.runs[index] = merged;
      }
      s.profile = profile;
      s.viewRevision++;
    }
    async function load(s) {
      if (!store || s.loaded || s.loading || Date.now() < s.retryAt) return;
      s.loading = true;
      try {
        const profile = await store.load(s.owner);
        if (ctx.destroyed) return;
        overlay(s, profile);
        s.loaded = true;
        s.error = "";
      } catch (e) {
        s.error = `未能读取代币记录：${e.message}。原数据不会被覆盖。`;
        s.retryAt = Date.now() + 5000;
      } finally {
        s.loading = false;
        render();
      }
      if (s.loaded) void flush(s);
    }
    async function flush(s) {
      if (!store || !s.loaded || s.saving || ctx.destroyed || Date.now() < s.retryAt) return;
      s.saving = true;
      try {
        while (!ctx.destroyed && (s.revision !== s.savedRevision || s.pending.size)) {
          if (s.revision !== s.savedRevision) {
            const revision = s.revision,
              plan = structuredClone(s.profile.plan);
            const profile = await store.savePlan(s.owner, plan);
            s.savedRevision = revision;
            overlay(s, profile);
          } else {
            const [key, record] = s.pending.entries().next().value;
            const profile = await store.observe(record);
            if (s.pending.get(key) === record) s.pending.delete(key);
            overlay(s, profile);
          }
        }
        s.error = "";
      } catch (e) {
        s.error = `未能保存：${e.message}。本次修改仍在，请重试并暂勿关闭页面。`;
        s.retryAt = Date.now() + 5000;
      } finally {
        s.saving = false;
        render();
      }
    }
    ctx.observeTokenState = (state) => {
      if (!store || ctx.destroyed) return;
      const record = M.observation(state);
      if (!record) return;
      const s = session(record.owner),
        key = record.startedAt;
      const signature = JSON.stringify([record.tokens, record.floor, record.complete]);
      if (s.fingerprints.get(key) === signature) return;
      s.fingerprints.set(key, signature);
      const known = s.pending.get(key) || s.profile.runs.find((r) => r.startedAt === key);
      const merged = M.mergeRun(known, record);
      s.pending.set(key, merged);
      const index = s.profile.runs.findIndex((r) => r.startedAt === key);
      if (index < 0) s.profile.runs.push(merged);
      else s.profile.runs[index] = merged;
      s.viewRevision++;
      if (!s.loaded) void load(s);
      else void flush(s);
    };
    const seen = new WeakSet();
    ctx.observeTokenMessage = (raw, event) => {
      if (!store || typeof raw !== "string" || !raw.includes('"labyrinth_updated"') || (event && seen.has(event)))
        return;
      try {
        const message = JSON.parse(raw),
          state = ctx.getGameState();
        if (message.type !== "labyrinth_updated" || !message.labyrinth || !identity(state)) return;
        const owner = message.characterId ?? message.labyrinth.characterId;
        if (owner != null && String(owner) !== identity(state)) return;
        if (event) seen.add(event);
        ctx.observeTokenState({ ...state, characterLabyrinth: message.labyrinth });
      } catch {
        /* Ignore unrelated or malformed packets. */
      }
    };
    ctx.refreshTokens = () => {
      if (!store || ctx.destroyed) return;
      currentState = ctx.getGameState();
      currentOwner = identity(currentState);
      if (currentOwner) {
        const s = session(currentOwner);
        ctx.observeTokenState(currentState);
        if (!s.loaded) void load(s);
        else if (s.pending.size || s.revision !== s.savedRevision) void flush(s);
      }
      if (!document.hidden) render();
    };
    ctx.startTokens = () => {
      if (store) return;
      catalogObserver = new MutationObserver(invalidateCatalog);
      store = root.MwiLabyrinthTokenStore.create();
      root.MwiLabyrinthTheme.install(document);
      view = root.MwiLabyrinthTokenView.create({
        onOpen() {
          // Native labels may have changed while this tab was closed.
          nativeRevision++;
          ctx.refreshTokens();
        },
        onPlan(plan) {
          const s = session(currentOwner);
          if (!s.loaded) return;
          s.profile.plan = structuredClone(M.validatePlan(plan));
          s.revision++;
          s.viewRevision++;
          s.retryAt = 0;
          void flush(s);
          render();
        },
        onRetry() {
          if (!currentOwner) return;
          const s = session(currentOwner);
          s.retryAt = 0;
          s.error = "";
          if (!s.loaded) void load(s);
          else void flush(s);
        },
        onCopy(text) {
          if (!root.navigator?.clipboard?.writeText) return Promise.reject(new Error("剪贴板不可用"));
          return root.navigator.clipboard.writeText(text);
        },
        onExport(csv) {
          if (!currentOwner || !session(currentOwner).loaded) return;
          const blob = new Blob(
            [
              csv?.text ??
                JSON.stringify(
                  { exportedAt: new Date().toISOString(), owner: currentOwner, ...session(currentOwner).profile },
                  null,
                  2
                )
            ],
            { type: csv ? "text/csv;charset=utf-8" : "application/json" }
          );
          const url = URL.createObjectURL(blob),
            anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = `${csv?.name || "迷宫代币"}-${currentOwner}-${new Date().toISOString().slice(0, 10)}.${csv ? "csv" : "json"}`;
          anchor.click();
          ctx.setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      });
      ctx.refreshTokens();
      ctx.setInterval(ctx.refreshTokens, 1000);
      ctx.listen(window, "focus", () => {
        if (currentOwner) {
          const s = session(currentOwner);
          s.loaded = false;
          s.retryAt = 0;
          void load(s);
        }
      });
      ctx.listen(window, "pagehide", () => {
        for (const s of sessions.values()) void flush(s);
      });
    };
    ctx.stopTokens = () => {
      catalogObserver?.disconnect();
      view?.destroy();
      store?.close();
    };
  };
})(globalThis);
