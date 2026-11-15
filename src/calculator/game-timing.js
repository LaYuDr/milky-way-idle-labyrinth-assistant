(function (root) {
  "use strict";
  // Read named constants only; never execute downloaded client code.
  function parse(source) {
    const read = (key) => {
      const hits = [
        ...String(source).matchAll(new RegExp(`\\b${key}\\s*:\\s*(\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?)\\s*[,}]`, "g"))
      ];
      if (hits.length !== 1) return null;
      const value = Number(hits[0][1]);
      return Number.isFinite(value) && value > 0 && value <= 60 ? value : null;
    };
    const restart = read("LabyrinthInitialTravelTimeSeconds"),
      retry = read("LabyrinthTravelTimeSeconds");
    return restart !== null && retry !== null ? Object.freeze({ restart, retry }) : null;
  }
  root.MwiLabyrinthGameTiming = Object.freeze({ parse });
  root.MwiLabyrinthCalculatorModules["game-timing"] = (ctx) => {
    let loading = null;
    ctx.gameTravelTiming = null;
    ctx.loadGameTravelTiming = () => {
      if (loading) return loading;
      const script = [...document.querySelectorAll("script[src]")].find((node) => {
        try {
          const url = new URL(node.src, ctx.window.location.href);
          return (
            url.origin === ctx.window.location.origin && /^\/static\/js\/main\.[\w-]+\.chunk\.js$/.test(url.pathname)
          );
        } catch {
          return false;
        }
      });
      if (!script) return Promise.resolve(null);
      loading = (async () => {
        const controller = new AbortController();
        const timer = ctx.setTimeout(() => controller.abort(), 10000);
        try {
          const response = await ctx.window.fetch(script.src, {
            credentials: "omit",
            cache: "force-cache",
            signal: controller.signal
          });
          if (!response.ok) return null;
          const timing = parse(await response.text());
          if (!ctx.destroyed) {
            ctx.gameTravelTiming = timing;
            ctx.lastLiveActionRateToken = "";
          }
          return timing;
        } catch {
          return null;
        } finally {
          ctx.clearTimeout(timer);
        }
      })();
      return loading;
    };
  };
})(globalThis);
