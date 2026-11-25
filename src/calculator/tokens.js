(function (root) {
  "use strict";
  root.MwiLabyrinthCalculatorModules.tokens = function (ctx) {
    const M = root.MwiLabyrinthTokens;
    const ownedSelector = '[id^="mwi-labyrinth-"], [class^="mwi-labyrinth-"]';
    const shopSelector = '[class*="LabyrinthPanel_labyrinthShopTab"]';
    const sessions = new Map();
    let store = null,
      view = null,
      currentOwner = "",
      currentState = null,
      lastRender = "";
    let catalogCache = null,
      catalogKey = "",
      catalogRevision = 0,
      domRevision = 0,
      catalogHost = null,
      catalogObserver = null,
      renderScheduled = false;

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

    function readNativeItemNames(init) {
      const outputByItem = new Map();
      const rawShop = init?.labyrinthShopItemDetailMap;
      const entries =
        rawShop && typeof rawShop.values === "function"
          ? [...rawShop.values()]
          : rawShop && typeof rawShop === "object"
            ? Object.values(rawShop)
            : [];
      for (const entry of entries) {
        if (entry?.itemHrid && Number.isSafeInteger(entry.outputCount) && entry.outputCount > 1) {
          outputByItem.set(entry.itemHrid, entry.outputCount);
        }
      }
      const native = new Map();
      for (const item of document.querySelectorAll(`${shopSelector} [class*="LabyrinthPanel_item"]`)) {
        let name = item.querySelector('[class*="LabyrinthPanel_name"]')?.textContent.trim();
        if (!name) continue;
        const scope = item.querySelector('[class*="LabyrinthPanel_iconContainer"]') || item;
        for (const icon of scope.querySelectorAll("use, image, img")) {
          if (icon.closest('[class*="LabyrinthPanel_price"], .mwi-labyrinth-calc-token-ctrl')) continue;
          const url = icon.getAttribute("href") || icon.getAttribute("xlink:href") || icon.getAttribute("src") || "";
          const match = url.match(/(?:#|\/)([a-z0-9_]+)(?:\.[a-z]+)?$/i);
          if (match) {
            const itemHrid = `/items/${match[1]}`;
            const output = outputByItem.get(itemHrid);
            if (output && name.startsWith(`${output} `)) name = name.slice(String(output).length + 1).trim();
            native.set(itemHrid, name);
            break;
          }
        }
      }
      return native;
    }

    function scheduleRender() {
      if (renderScheduled || ctx.destroyed) return;
      renderScheduled = true;
      Promise.resolve().then(() => {
        renderScheduled = false;
        if (!ctx.destroyed && !document.hidden) render();
      });
    }

    const handleHostMutations = (records) => {
      let shopChanged = false;
      for (const record of records) {
        const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        if (!target || target.closest(ownedSelector)) continue;
        if (record.type === "childList") {
          const nodes = [...record.addedNodes, ...record.removedNodes].filter(
            (node) => node.nodeType !== 1 || !node.matches(ownedSelector)
          );
          if (!nodes.length) continue;
          if (
            target.closest(shopSelector) ||
            nodes.some(
              (node) => node.nodeType === 1 && (node.matches(shopSelector) || Boolean(node.querySelector(shopSelector)))
            )
          ) {
            shopChanged = true;
            break;
          }
        } else if (record.type === "characterData") {
          if (target.closest(shopSelector)) {
            shopChanged = true;
            break;
          }
        } else if (record.type === "attributes") {
          if (target.matches(shopSelector) || target.closest(shopSelector) || target.querySelector(shopSelector)) {
            shopChanged = true;
            break;
          }
        }
      }
      if (shopChanged) {
        domRevision++;
        scheduleRender();
      }
    };

    function syncHostObserver() {
      if (!catalogObserver) return;
      const host = document.querySelector('[class*="LabyrinthPanel_labyrinthPanel"]');
      if (catalogHost !== host) {
        catalogObserver.disconnect();
        catalogHost = host;
        if (host) {
          catalogObserver.observe(host, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ["href", "xlink:href", "src", "hidden", "style", "class"]
          });
        }
      }
    }

    function render() {
      if (!view || ctx.destroyed || document.hidden) return;
      syncHostObserver();
      view.mount(Boolean(currentOwner));
      view.setOwner?.(currentOwner);
      if (!currentOwner || !view.isVisible()) return;
      const s = session(currentOwner);
      const init = ctx.getInitClientData?.();
      const nativeNames = readNativeItemNames(init);
      const shop = init?.labyrinthShopItemDetailMap;
      const nextCatalogKey = JSON.stringify([
        currentOwner,
        document.documentElement.lang,
        [...nativeNames.entries()],
        M.definitions.map((entry) => currentState?.characterInfo?.[entry[2]]),
        typeof shop?.values === "function" ? [...shop.values()] : shop
      ]);
      if (nextCatalogKey !== catalogKey) {
        catalogKey = nextCatalogKey;
        const nameOf = (id) =>
          nativeNames.get(id) ||
          ctx.getItemDetailByHrid?.(currentState, init, id)?.name ||
          id.split("/").at(-1).replaceAll("_", " ");
        catalogCache = M.catalog(currentState, init, nameOf);
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
        domRevision,
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
      catalogObserver = new MutationObserver(handleHostMutations);
      store = root.MwiLabyrinthTokenStore.create();
      root.MwiLabyrinthTheme.install(document);
      view = root.MwiLabyrinthTokenView.create({
        onOpen() {
          lastRender = "";
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
      catalogHost = null;
      view?.destroy();
      store?.close();
    };
  };
})(globalThis);
