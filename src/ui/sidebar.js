(function (root) {
  "use strict";
  // Development reloads replace module globals before the old userscript is disposed.
  root.MwiLabyrinthSidebar?.destroy();
  let instance;
  function create(document) {
    const panel = document.createElement("section");
    panel.id = "mwi-labyrinth-sidebar";
    panel.hidden = true;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", "mwi-labyrinth-sidebar-tab");
    panel.innerHTML = `<style>
#mwi-labyrinth-sidebar{min-width:0;width:100%;box-sizing:border-box;color:#edf0fa;background:#24273b;font:13px/1.5 system-ui,sans-serif;text-align:left}
#mwi-labyrinth-sidebar[hidden],#mwi-labyrinth-sidebar [hidden]{display:none!important}
#mwi-labyrinth-sidebar h2{margin:0;padding:14px;text-align:center;font-size:20px}
#mwi-labyrinth-sidebar nav{display:flex;gap:8px;padding:0 12px;background:#202139;border-bottom:1px solid #41465f}
#mwi-labyrinth-sidebar nav button{font:inherit;color:#b7bfd4;background:transparent;border:0;border-bottom:3px solid transparent;padding:12px 8px;cursor:pointer}
#mwi-labyrinth-sidebar nav button[aria-selected="true"]{color:#91dfcb;border-bottom-color:#91dfcb}
#mwi-labyrinth-sidebar :focus-visible{outline:2px solid #91dfcb;outline-offset:-2px}
#mwi-labyrinth-sidebar-tab{flex-shrink:0;white-space:nowrap;cursor:pointer;font:inherit;border:0;border-radius:5px 5px 0 0;padding:6px 14px;min-height:40px;background:#2c2e45;color:#edf0fa}
#mwi-labyrinth-sidebar-tab[aria-selected="true"]{background:#4558ad;color:white}
#mwi-labyrinth-sidebar #mwi-labyrinth-planner{position:static;width:100%;max-width:none;border:0;border-radius:0;padding:0}
#mwi-labyrinth-sidebar #mwi-labyrinth-planner .mwi-lab-launcher{display:flex;justify-content:flex-end;padding:6px 12px;border:0}
#mwi-labyrinth-sidebar #mwi-labyrinth-planner .mwi-lab-launcher strong{display:none}
#mwi-labyrinth-sidebar #mwi-labyrinth-planner .mwi-lab-content{max-height:none;overflow:visible;padding:8px 12px}
#mwi-labyrinth-sidebar-recommendation{padding:14px 12px;box-sizing:border-box;border-top:1px solid #41465f}
#mwi-labyrinth-sidebar .mwi-lab-sidebar-empty{padding:12px;color:#b7bfd4}
.mwi-labyrinth-sidebar-active > :not(#mwi-labyrinth-sidebar){display:none!important}
.mwi-labyrinth-sidebar-tabs{overflow-x:auto!important;max-width:100%;scrollbar-width:thin}
</style><h2>迷宫助手</h2><nav role="tablist" aria-label="迷宫助手功能"></nav>`;
    const tab = document.createElement("button");
    tab.id = "mwi-labyrinth-sidebar-tab";
    tab.type = "button";
    tab.textContent = "迷宫助手";
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", panel.id);
    const slots = {};
    const buttons = {};
    const pages = {};
    const nav = panel.querySelector("nav");
    function select(name) {
      for (const key of Object.keys(pages)) {
        pages[key].hidden = key !== name;
        buttons[key].setAttribute("aria-selected", String(key === name));
        buttons[key].tabIndex = key === name ? 0 : -1;
      }
      document.dispatchEvent(new Event("mwi-labyrinth-sidebar-change"));
    }
    for (const [name, label] of [["planner", "路线与计算"]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.id = `mwi-labyrinth-sidebar-${name}-tab`;
      button.textContent = label;
      button.setAttribute("role", "tab");
      const slot = document.createElement("div");
      slot.id = `mwi-labyrinth-sidebar-${name}`;
      const page = document.createElement("div");
      page.id = `${slot.id}-page`;
      page.setAttribute("role", "tabpanel");
      page.setAttribute("aria-labelledby", button.id);
      button.setAttribute("aria-controls", page.id);
      page.append(slot);
      pages[name] = page;
      button.addEventListener("click", () => select(name));
      buttons[name] = button;
      slots[name] = slot;
      nav.append(button);
      panel.append(page);
    }
    const recommendation = document.createElement("section");
    recommendation.id = "mwi-labyrinth-sidebar-recommendation";
    recommendation.setAttribute("aria-label", "房间推荐");
    const hint = document.createElement("p");
    hint.className = "mwi-lab-sidebar-empty";
    hint.textContent = "打开迷宫后，可设置目标并计算房间推荐。";
    recommendation.append(hint);
    slots.recommendation = recommendation;
    pages.planner.append(recommendation);
    nav.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const names = Object.keys(buttons);
      const index = names.findIndex((key) => buttons[key] === event.target);
      const name =
        names[
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? names.length - 1
              : (index + (event.key === "ArrowRight" ? 1 : -1) + names.length) % names.length
        ];
      select(name);
      buttons[name].focus();
    });
    select("planner");
    let bar,
      host,
      active = false;
    const selections = new Map();
    function close() {
      active = false;
      panel.hidden = true;
      tab.classList.remove("Mui-selected");
      tab.setAttribute("aria-selected", "false");
      tab.tabIndex = -1;
      host?.classList.remove("mwi-labyrinth-sidebar-active");
      const another = [...(bar?.children || [])].some(
        (node) => node !== tab && node.getAttribute("aria-selected") === "true"
      );
      if (!another)
        for (const [node, old] of selections) {
          for (const [key, value] of Object.entries(old.attrs)) {
            if (value === null) node.removeAttribute(key);
            else node.setAttribute(key, value);
          }
          node.classList.toggle("Mui-selected", old.selected);
        }
      selections.clear();
    }
    function sync() {
      if (!active) return;
      host.classList.add("mwi-labyrinth-sidebar-active");
      panel.hidden = false;
    }
    function clicked(event) {
      const target = event.target.closest('[role="tab"]');
      if (target && target !== tab && bar.contains(target)) close();
    }
    function mount() {
      if (!bar?.isConnected || !host?.isConnected) {
        close();
        bar?.removeEventListener("click", clicked, true);
        bar?.classList.remove("mwi-labyrinth-sidebar-tabs");
        tab.remove();
        panel.remove();
        bar = host = null;
        const labels = new Set([
          "库存",
          "装备",
          "技能",
          "房屋",
          "配装",
          "Inventory",
          "Equipment",
          "Skills",
          "House",
          "Loadout",
          "Loadouts"
        ]);
        for (const candidate of document.querySelectorAll('[role="tablist"]')) {
          if (
            [...candidate.children].filter((node) => labels.has(node.textContent.trim())).length < 4 ||
            !candidate.getClientRects().length
          )
            continue;
          let branch = candidate;
          for (let depth = 0; depth < 12 && branch?.parentElement && !host; depth++, branch = branch.parentElement) {
            if (["BODY", "HTML", "MAIN"].includes(branch.parentElement.tagName)) break;
            const matches = [...branch.parentElement.children].filter(
              (node) => node !== branch && String(node.className).includes("tabPanelsContainer")
            );
            if (matches.length === 1) host = matches[0];
          }
          if (host) {
            bar = candidate;
            break;
          }
        }
        if (!host) return;
        host.classList.remove("mwi-labyrinth-sidebar-active");
        tab.className = [...bar.children[0].classList].filter((name) => name !== "Mui-selected").join(" ");
        bar.classList.add("mwi-labyrinth-sidebar-tabs");
        bar.addEventListener("click", clicked, true);
      }
      if (tab.parentElement !== bar) bar.append(tab);
      if (panel.parentElement !== host) host.append(panel);
      if (
        active &&
        (tab.getAttribute("aria-selected") !== "true" ||
          [...bar.children].some((node) => node !== tab && node.getAttribute("aria-selected") === "true"))
      )
        close();
      sync();
    }
    tab.addEventListener("click", () => {
      close();
      document.dispatchEvent(new CustomEvent("mwi:sidebar-plugin-activated", { detail: "mwi-labyrinth" }));
      for (const node of bar.children)
        if (node !== tab) {
          selections.set(node, {
            attrs: { "aria-selected": node.getAttribute("aria-selected"), tabindex: node.getAttribute("tabindex") },
            selected: node.classList.contains("Mui-selected")
          });
          node.setAttribute("aria-selected", "false");
          node.tabIndex = -1;
          node.classList.remove("Mui-selected");
        }
      active = true;
      tab.classList.add("Mui-selected");
      tab.setAttribute("aria-selected", "true");
      tab.tabIndex = 0;
      sync();
      document.dispatchEvent(new Event("mwi-labyrinth-sidebar-change"));
    });
    const activated = (event) => {
      if (event.detail && event.detail !== "mwi-labyrinth") close();
    };
    document.addEventListener("mwi:sidebar-plugin-activated", activated);
    close();
    mount();
    return {
      slots,
      mount,
      destroy() {
        close();
        bar?.removeEventListener("click", clicked, true);
        bar?.classList.remove("mwi-labyrinth-sidebar-tabs");
        document.removeEventListener("mwi:sidebar-plugin-activated", activated);
        tab.remove();
        panel.remove();
        instance = null;
      }
    };
  }
  root.MwiLabyrinthSidebar = {
    enabled: false,
    ensure(document) {
      return (instance ||= create(document));
    },
    destroy() {
      instance?.destroy();
    }
  };
})(globalThis);
