(function (root) {
  "use strict";
  function create({ onPlan, onRetry, onExport, onCopy, onOpen }) {
    let data = null,
      open = false,
      owner = "";
    const section = document.createElement("section");
    section.id = "mwi-labyrinth-calc-tokens";
    section.setAttribute("role", "tabpanel");
    section.setAttribute("aria-labelledby", "mwi-labyrinth-token-tab");
    section.hidden = true;
    const tabButton = document.createElement("button");
    tabButton.type = "button";
    tabButton.id = "mwi-labyrinth-token-tab";
    tabButton.textContent = "代币规划";
    tabButton.setAttribute("role", "tab");
    tabButton.setAttribute("aria-controls", section.id);
    tabButton.setAttribute("aria-selected", "false");
    let host = null,
      tabList = null;
    const nativeAttributes = new Map();
    function restoreNativeTabs() {
      for (const [button, attrs] of nativeAttributes) {
        for (const [name, value] of Object.entries(attrs)) {
          if (value === null) button.removeAttribute(name);
          else button.setAttribute(name, value);
        }
      }
      nativeAttributes.clear();
    }
    function revealTab(button) {
      if (!tabList || !button) return;
      const viewport = tabList.getBoundingClientRect(),
        bounds = button.getBoundingClientRect();
      if (bounds.left < viewport.left) tabList.scrollLeft -= viewport.left - bounds.left;
      else if (bounds.right > viewport.right) tabList.scrollLeft += bounds.right - viewport.right;
    }
    function syncTab() {
      section.hidden = !open;
      host?.classList.toggle("mwi-labyrinth-token-active", open);
      tabButton.setAttribute("aria-selected", String(open));
      tabButton.tabIndex = open ? 0 : -1;
      tabButton.classList.toggle("Mui-selected", open);
      if (open && tabList) {
        for (const button of tabList.querySelectorAll('[role="tab"]')) {
          if (button === tabButton) continue;
          if (!nativeAttributes.has(button))
            nativeAttributes.set(button, {
              "aria-selected": button.getAttribute("aria-selected"),
              tabindex: button.getAttribute("tabindex")
            });
          button.setAttribute("aria-selected", "false");
          button.tabIndex = -1;
        }
      } else restoreNativeTabs();
    }
    function activate(event) {
      event.stopPropagation();
      open = true;
      syncTab();
      revealTab(tabButton);
      onOpen?.();
      render();
    }
    function nativeClick(event) {
      const target = event.target.closest('[role="tab"]');
      if (target && target !== tabButton) {
        open = false;
        syncTab();
      }
    }
    function tabKeys(event) {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const current = event.target.closest('[role="tab"]');
      if (!current || !tabList) return;
      const buttons = [...tabList.querySelectorAll('[role="tab"]')].filter((b) => !b.disabled);
      const index = buttons.indexOf(current);
      let next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? buttons.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
      event.preventDefault();
      event.stopPropagation();
      // Restore native selection before its existing focus/click handlers run.
      if (buttons[next] !== tabButton) {
        open = false;
        syncTab();
      }
      buttons[next].focus();
      buttons[next].click();
      revealTab(buttons[next]);
    }
    function detach() {
      host?.classList.remove("mwi-labyrinth-token-active");
      restoreNativeTabs();
      tabList?.classList.remove("mwi-labyrinth-token-tab-list");
      tabList?.removeEventListener("click", nativeClick, true);
      tabList?.removeEventListener("keydown", tabKeys, true);
      tabButton.remove();
      section.remove();
      host = tabList = null;
    }
    tabButton.addEventListener("click", activate);
    section.innerHTML = `<style>
.mwi-labyrinth-token-tab-list{max-width:100%;overflow-x:auto!important;overscroll-behavior-x:contain}
.mwi-labyrinth-token-active > [class*="TabsComponent_tabPanelsContainer"]{display:none!important}
.mwi-labyrinth-token-active [role="tablist"] [role="tab"][aria-selected="false"]{background:var(--ml-hover,#2c2e45)!important;color:var(--ml-text,#e4e5ef)!important}
.mwi-labyrinth-token-active [class*="MuiTabs-indicator"]{display:none!important}
#mwi-labyrinth-token-tab{font:inherit;flex-shrink:0;min-height:40px;padding:6px 18px;border:0;border-radius:5px 5px 0 0;background:#2c2e45;color:#e4e5ef;cursor:pointer;white-space:nowrap}
#mwi-labyrinth-token-tab[aria-selected="true"]{background:#4558ad;color:#fff}
#mwi-labyrinth-token-tab:focus-visible{outline:2px solid #7ce4d8;outline-offset:-3px}
</style>`;
    const workspace = root.MwiLabyrinthTokenWorkspace.create({ section, onPlan, onRetry, onExport, onCopy });
    function render() {
      if (data) workspace.update(data);
    }
    return {
      isVisible: () => open && section.isConnected && section.getClientRects().length > 0,
      setOwner(next) {
        if (owner === next) return;
        owner = next;
        data = null;
        open = false;
        syncTab();
      },
      mount(panel) {
        const wrapper = panel?.querySelector('[class*="LabyrinthPanel_tabsComponentContainer"]');
        const nextHost = wrapper?.querySelector('[class*="TabsComponent_tabsComponent__"]');
        const nextList = nextHost?.querySelector('[role="tablist"]');
        const panels = nextHost?.querySelector('[class*="TabsComponent_tabPanelsContainer"]');
        if (!nextHost || !nextList || !panels) {
          detach();
          return;
        }
        if (host !== nextHost || tabList !== nextList) {
          detach();
          host = nextHost;
          tabList = nextList;
          tabList.classList.add("mwi-labyrinth-token-tab-list");
          const shop = [...tabList.querySelectorAll('[role="tab"]')].at(-1);
          tabButton.className = [...(shop?.classList || [])].filter((c) => c !== "Mui-selected").join(" ");
          tabList.addEventListener("click", nativeClick, true);
          tabList.addEventListener("keydown", tabKeys, true);
        }
        if (tabButton.parentElement !== tabList) tabList.append(tabButton);
        if (section.parentElement !== host) panels.after(section);
        syncTab();
      },
      update(next) {
        if (owner !== next.owner) {
          owner = next.owner;
          open = false;
          syncTab();
        }
        data = next;
        if (open) render();
      },
      destroy() {
        workspace.destroy();
        detach();
      }
    };
  }
  root.MwiLabyrinthTokenNativeView = { create };
})(globalThis);
