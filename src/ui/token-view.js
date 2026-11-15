(function (root) {
  "use strict";
  function create(options) {
    if (!root.MwiLabyrinthSidebar.enabled) {
      const native = root.MwiLabyrinthTokenNativeView.create(options);
      return {
        ...native,
        mount(available) {
          native.mount(available ? document.querySelector('[class*="LabyrinthPanel_labyrinthPanel"]') : null);
        }
      };
    }
    const section = document.createElement("section");
    section.id = "mwi-labyrinth-calc-tokens";
    const workspace = root.MwiLabyrinthTokenWorkspace.create({ section, ...options });
    const opened = () => {
      if (section.getClientRects().length) options.onOpen?.();
    };
    document.addEventListener("mwi-labyrinth-sidebar-change", opened);
    return {
      isVisible: () => section.isConnected && section.getClientRects().length > 0,
      mount(available) {
        if (!available) {
          section.remove();
          return;
        }
        const sidebar = root.MwiLabyrinthSidebar.ensure(document);
        sidebar.mount();
        if (section.parentElement !== sidebar.slots.tokens) sidebar.slots.tokens.append(section);
      },
      update(data) {
        workspace.update(data);
      },
      destroy() {
        document.removeEventListener("mwi-labyrinth-sidebar-change", opened);
        workspace.destroy();
        section.remove();
      }
    };
  }
  root.MwiLabyrinthTokenView = { create };
})(globalThis);
