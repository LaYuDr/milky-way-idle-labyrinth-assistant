(function (root) {
  "use strict";
  function read(document, state) {
    const grid = document.querySelector('[class*="LabyrinthPanel_roomGrid"]');
    if (!grid) return null;
    const elements = [...grid.querySelectorAll("[data-room-x][data-room-y]")];
    const size = Math.sqrt(elements.length);
    if (!Number.isInteger(size) || size < 2 || size > 20) throw new Error("迷宫网格结构不完整");
    const cells = Array(size * size),
      nodes = Array(size * size);
    for (const element of elements) {
      const x = Number(element.dataset.roomX),
        y = Number(element.dataset.roomY),
        id = y * size + x;
      if (![x, y].every((n) => Number.isInteger(n) && n >= 0 && n < size) || cells[id])
        throw new Error("迷宫格子坐标无效");
      const visited = element.className.includes("LabyrinthPanel_clearedRoom");
      const icon = element.querySelector('[class*="LabyrinthPanel_roomIcon"]');
      const resource = icon
        ? [...icon.querySelectorAll("use,image,img")]
            .map((e) => e.getAttribute("href") || e.getAttribute("xlink:href") || e.getAttribute("src") || "")
            .join(" ")
        : "";
      const levelNode = element.querySelector('[class*="LabyrinthPanel_roomLevel"]');
      const level = levelNode?.textContent || "";
      const blocked = levelNode?.className.includes("LabyrinthPanel_roomLevelWarning");
      const revealed = visited || id === 0 || Boolean(level) || Boolean(icon && id !== size * size - 1);
      const type =
        id === 0
          ? "start"
          : id === size * size - 1
            ? "exit"
            : /(?:#|\/)loot(?:\.|$|\s)/i.test(resource)
              ? "treasure"
              : level || icon
                ? "challenge"
                : "unknown";
      cells[id] = {
        type,
        visited,
        revealed,
        entered:
          visited ||
          Boolean(
            element.querySelector('[class*="LabyrinthPanel_roomEntered"], [class*="LabyrinthPanel_roomFailCount"]')
          ),
        passable: visited || ["start", "exit", "treasure"].includes(type) ? true : level.trim() ? !blocked : null,
        label: level.trim(),
        resource
      };
      nodes[id] = element;
    }
    if (cells.some((c) => !c) || !cells[0]?.visited) throw new Error("尚未读取到完整迷宫");
    // Only numbered native selections count; visibleRoom also includes unselected neighbors.
    // Keep native ordering so disconnected or reordered selections cannot become free origins.
    const selections = nodes.flatMap((node, id) => {
      const number = node.querySelector('[class*="LabyrinthPanel_queueNumber"]')?.textContent.trim() || "";
      return /^[1-9]\d*$/.test(number) && Number.isSafeInteger(Number(number)) ? [{ id, order: Number(number) }] : [];
    });
    const queue = selections
      .filter((entry) => selections.filter((other) => other.order === entry.order).length === 1)
      .sort((a, b) => a.order - b.order)
      .map((entry) => entry.id);
    const previewNodes = nodes.filter((node) => node.className.includes("LabyrinthPanel_beaconPreview"));
    const hoverId = nodes.findIndex((node) => node.className.includes("LabyrinthPanel_supplyHover"));
    const hovering = hoverId >= 0;
    // Native supplies are in bottomArea, a sibling of activeRun, not inside the map wrapper.
    const scope = grid.closest?.('[class*="LabyrinthPanel_activeRun"]')?.parentElement || document;
    const beaconMode = [...(scope.querySelectorAll?.('[class*="LabyrinthPanel_supplyWithButton"]') || [])].some(
      (supply) =>
        [...supply.querySelectorAll("use,image,img")].some((icon) =>
          /(?:#|\/)[a-z_]+_beacon(?:\.|$)/.test(
            icon.getAttribute("href") || icon.getAttribute("xlink:href") || icon.getAttribute("src") || ""
          )
        ) && [...supply.querySelectorAll("button")].some((button) => button.textContent.trim() === "X")
    );
    // The native cancel button identifies beacon mode even before hovering a room.
    // Native preview already excludes revealed rooms and the exit. Filter again defensively.
    let beaconPreviewCount = null;
    if (beaconMode && previewNodes.length) {
      beaconPreviewCount = nodes.filter(
        (node, id) =>
          node.className.includes("LabyrinthPanel_beaconPreview") && !cells[id].revealed && id !== cells.length - 1
      ).length;
    } else if (beaconMode && hovering) beaconPreviewCount = 0;
    const labyrinth = state?.characterLabyrinth;
    const matched =
      Array.isArray(labyrinth?.roomData) &&
      labyrinth.roomData.length === size &&
      labyrinth.roomData.every((row) => Array.isArray(row) && row.length === size);
    const floor =
      matched && Number.isSafeInteger(labyrinth.currentFloor) && labyrinth.currentFloor > 0
        ? labyrinth.currentFloor
        : null;
    const floorKey =
      floor === null
        ? null
        : JSON.stringify([state?.character?.id ?? state?.characterId ?? "", labyrinth.startedAt ?? "", floor]);
    return {
      grid,
      nodes,
      size,
      cells,
      queue,
      floor,
      floorKey,
      beaconPreviewCount,
      beaconMode,
      beaconHover: beaconMode && hovering ? hoverId : null
    };
  }
  root.MwiLabyrinthMapReader = { read };
})(globalThis);
