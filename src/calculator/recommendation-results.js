(function (root) {
  "use strict";
  root.MwiLabyrinthCalculatorModules["recommendation-results"] = function (ctx) {
    const storageKey = "mwi-labyrinth:calculator:recommendation-results:v1";
    const encode = (value) => JSON.stringify(value, (_key, v) => (v === Infinity ? { mwiLabInfinity: true } : v));
    const decode = (raw) =>
      JSON.parse(raw, (_key, v) => (v?.mwiLabInfinity === true && Object.keys(v).length === 1 ? Infinity : v));
    let owner = null,
      lastSaved = "",
      visible = true;
    ctx.recommendationStorageError = false;
    function valid(entry) {
      return (
        Array.isArray(entry) &&
        typeof entry[0] === "string" &&
        /^[a-zA-Z0-9_/-]{1,120}$/.test(entry[0]) &&
        entry[1] &&
        ["ready", "excluded", "error"].includes(entry[1].status) &&
        (entry[1].status !== "ready" ||
          (Number.isSafeInteger(entry[1].levelDelta) &&
            entry[1].levelDelta >= -1000 &&
            entry[1].levelDelta <= 998 &&
            Number.isFinite(entry[1].clearChance) &&
            entry[1].clearChance >= 0 &&
            entry[1].clearChance <= 1))
      );
    }
    ctx.syncRecommendationOwner = () => {
      const identity = ctx.storageIdentity();
      if (owner !== identity) {
        owner = identity;
        lastSaved = "";
        visible = true;
        ctx.automationRecommendByRoomTypeKey.clear();
        ctx.automationRecommendSignatureByRoomTypeKey.clear();
        ctx.automationRecommendColumnEnabled = false;
        ctx.recommendationStorageError = false;
        if (!identity) return false;
        try {
          const raw = ctx.storage.getItem(storageKey);
          if (raw && raw.length <= 1000000) {
            const saved = decode(raw);
            if (
              saved.schema === 1 &&
              saved.owner === identity &&
              Array.isArray(saved.entries) &&
              saved.entries.length <= 100
            ) {
              for (const entry of saved.entries)
                if (valid(entry)) ctx.automationRecommendByRoomTypeKey.set(entry[0], { ...entry[1], stale: false });
              if (["winRate", "seconds", "experience"].includes(saved.basis))
                ctx.automationRecommendBasis = saved.basis;
              visible = saved.visible !== false;
            }
          }
        } catch {
          /* Invalid storage never prevents a new calculation. */
        }
      }
      if (identity && visible && ctx.automationRecommendByRoomTypeKey.size && !ctx.automationEstimateColumnEnabled)
        ctx.automationRecommendColumnEnabled = true;
      return Boolean(identity);
    };
    ctx.persistRecommendations = () => {
      if (!owner || owner !== ctx.storageIdentity() || ctx.destroyed) return;
      try {
        const entries = [...ctx.automationRecommendByRoomTypeKey].filter(valid);
        const raw = encode({ schema: 1, owner, basis: ctx.automationRecommendBasis, visible, entries });
        if (raw === lastSaved) return;
        if (raw.length > 1000000) {
          ctx.recommendationStorageError = true;
          return;
        }
        ctx.storage.setItem(storageKey, raw);
        ctx.recommendationStorageError = ctx.storage.getItem(storageKey) !== raw;
        if (!ctx.recommendationStorageError) lastSaved = raw;
      } catch {
        ctx.recommendationStorageError = true;
      }
    };
    ctx.beginRecommendationSnapshot = () => {
      ctx.syncRecommendationOwner();
      visible = true;
      ctx.automationRecommendByRoomTypeKey.clear();
      ctx.persistRecommendations();
    };
    ctx.hideSavedRecommendations = () => {
      visible = false;
      ctx.persistRecommendations();
    };
    const refresh = ctx.refreshControlPanelPlacement;
    ctx.refreshControlPanelPlacement = () => {
      ctx.syncRecommendationOwner();
      return refresh();
    };
    const renderTable = ctx.renderAutomationEstimateTable;
    ctx.renderAutomationEstimateTable = (...args) => {
      renderTable(...args);
      ctx.persistRecommendations();
    };
    const status = ctx.setAutomationEstimateControlStatus;
    ctx.setAutomationEstimateControlStatus = (options) =>
      status(
        ctx.recommendationStorageError && !options.running
          ? {
              ...options,
              message: ctx.isChineseUi()
                ? "推荐值保留在本页，未能保存到浏览器。"
                : "Recommendations remain on this page; browser storage failed."
            }
          : options
      );
  };
})(globalThis);
