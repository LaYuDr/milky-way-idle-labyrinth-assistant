const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const beaconsSource = fs.readFileSync(path.join(__dirname, "../src/runtime/beacons.js"), "utf8");
const viewSource = fs.readFileSync(path.join(__dirname, "../src/ui/beacon-view.js"), "utf8");

function createMockDom() {
  const storage = new Map();
  const winListeners = new Map();
  class MockElement {
    constructor(tagName) {
      this.tagName = tagName.toUpperCase();
      this.id = "";
      this.parentElement = null;
      this.children = [];
      this.attributes = new Map();
      this.dataset = {};
      this.style = { zoom: "" };
      this._textContent = "";
      this._className = "";
      this.hidden = false;
      this.disabled = false;
      this.value = "";
      this.max = "";
      this.min = "";
      this.step = "";
      this.type = "";
      this.title = "";
      this.htmlFor = "";
      this.offsetWidth = 60;
      this.offsetHeight = 60;
      this.clientWidth = 60;
      this.clientHeight = 60;
      this.clientLeft = 0;
      this.clientTop = 0;
      this.rectReads = 0;
      this.listeners = new Map();
      this.classList = {
        contains: (name) => this._className.split(/\s+/).includes(name)
      };
    }
    get className() {
      return this._className;
    }
    set className(value) {
      this._className = String(value || "");
    }
    get textContent() {
      return this._textContent;
    }
    set textContent(value) {
      this._textContent = String(value ?? "");
    }
    get childElementCount() {
      return this.children.length;
    }
    get isConnected() {
      let cur = this;
      while (cur) {
        if (cur === doc.body || cur === doc.head) return true;
        cur = cur.parentElement;
      }
      return false;
    }
    append(...nodes) {
      for (const node of nodes) {
        if (!node) continue;
        if (node.parentElement) node.remove();
        node.parentElement = this;
        this.children.push(node);
      }
    }
    remove() {
      if (!this.parentElement) return;
      const list = this.parentElement.children;
      const idx = list.indexOf(this);
      if (idx >= 0) list.splice(idx, 1);
      this.parentElement = null;
    }
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    }
    getAttribute(name) {
      return this.attributes.has(name) ? this.attributes.get(name) : null;
    }
    hasAttribute(name) {
      return this.attributes.has(name);
    }
    removeAttribute(name) {
      this.attributes.delete(name);
    }
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(fn);
    }
    dispatch(type, event = {}) {
      for (const fn of this.listeners.get(type) || []) fn(event);
    }
    matches(selector) {
      return selector
        .split(",")
        .map((s) => s.trim())
        .some((part) => part.toUpperCase() === this.tagName);
    }
    querySelectorAll(selector) {
      const out = [];
      const visit = (node) => {
        for (const child of node.children) {
          if (selector === "*" || child.matches(selector)) out.push(child);
          visit(child);
        }
      };
      visit(this);
      return out;
    }
    getBoundingClientRect() {
      this.rectReads++;
      if (this.tagName === "SPAN" && this.id === "mwi-labyrinth-beacon-hover") {
        return { left: 0, top: 0, right: 32, bottom: 20, width: 32, height: 20 };
      }
      return {
        left: 0,
        top: 0,
        right: this.offsetWidth,
        bottom: this.offsetHeight,
        width: this.offsetWidth,
        height: this.offsetHeight
      };
    }
  }

  const doc = {
    head: new MockElement("head"),
    body: new MockElement("body"),
    activeElement: null,
    createElement(tag) {
      const node = new MockElement(tag);
      if (tag === "span") {
        node.offsetWidth = 32;
        node.offsetHeight = 20;
      }
      return node;
    },
    createTreeWalker() {
      return {
        currentNode: null,
        nextNode() {
          return false;
        }
      };
    },
    createRange() {
      return {
        selectNodeContents() {},
        getClientRects() {
          return [];
        }
      };
    },
    defaultView: {
      localStorage: {
        getItem: (k) => (storage.has(k) ? storage.get(k) : null),
        setItem: (k, v) => storage.set(k, String(v))
      },
      addEventListener(type, fn) {
        if (!winListeners.has(type)) winListeners.set(type, new Set());
        winListeners.get(type).add(fn);
      },
      removeEventListener(type, fn) {
        winListeners.get(type)?.delete(fn);
      },
      emit(type) {
        for (const fn of winListeners.get(type) || []) fn();
      }
    }
  };
  return { doc, MockElement };
}

function createFixture() {
  const { doc } = createMockDom();
  const root = {};
  vm.runInNewContext(beaconsSource, root);
  vm.runInNewContext(viewSource, root);
  const grid = doc.createElement("div");
  doc.body.append(grid);
  const nodes = Array.from({ length: 64 }, () => {
    const cell = doc.createElement("div");
    grid.append(cell);
    return cell;
  });
  const map = {
    size: 8,
    grid,
    nodes,
    cells: nodes.map((_, i) => ({ revealed: i === 0, visited: i === 0 })),
    floorKey: "f1",
    beaconMode: false,
    beaconHover: null,
    beaconPreviewCount: null
  };
  root.MwiLabyrinthBeacons.apply(map, {
    characterLabyrinth: {
      beaconItemHrid: "/items/expert_beacon",
      beaconCount: 3,
      roomData: Array.from({ length: 8 }, () => Array(8).fill(null))
    }
  });
  const view = root.MwiLabyrinthBeaconView.create(doc, () => {});
  doc.body.append(view.element);
  return { doc, grid, nodes, map, view };
}

test("探照灯重复刷新与鼠标移动保留已有标记，仅测量和更新变化格子", () => {
  const { doc, nodes, map, view } = createFixture();
  try {
    view.update(map);
    const initialPins = nodes.flatMap((n) => n.children.filter((c) => c.classList.contains("mwi-lab-beacon-pin")));
    const initialRanges = nodes.flatMap((n) => n.children.filter((c) => c.classList.contains("mwi-lab-beacon-range")));
    assert.equal(initialPins.length, 1);
    assert.equal(initialRanges.length, 13);
    const totalReads = () => nodes.reduce((sum, n) => sum + n.rectReads, 0);
    const readsAfterInitial = totalReads();
    assert.equal(readsAfterInitial, 1, "only the 1 pinned cell was measured");

    // Periodic idle refresh with no state change performs zero measurements and reuses exact DOM nodes.
    view.update(map);
    assert.equal(totalReads(), readsAfterInitial);
    assert.equal(
      nodes.flatMap((n) => n.children.filter((c) => c.classList.contains("mwi-lab-beacon-pin")))[0],
      initialPins[0]
    );
    assert.equal(
      nodes.flatMap((n) => n.children.filter((c) => c.classList.contains("mwi-lab-beacon-range")))[0],
      initialRanges[0]
    );

    // Entering beacon mode removes range fills but keeps the existing pin DOM node without re-measuring.
    map.beaconMode = true;
    map.beaconHover = 22;
    map.beaconPreviewCount = 12;
    view.update(map);
    assert.equal(nodes.filter((n) => n.hasAttribute("data-mwi-lab-beacon-fill")).length, 0);
    assert.equal(
      nodes.flatMap((n) => n.children.filter((c) => c.classList.contains("mwi-lab-beacon-pin")))[0],
      initialPins[0],
      "existing pin node preserved when entering beacon mode"
    );
    assert.equal(totalReads(), readsAfterInitial + 1, "only the newly hovered cell 22 was measured");

    // Repeated hover on same cell does zero layout measurements.
    view.update(map);
    assert.equal(totalReads(), readsAfterInitial + 1);
    const hoverNode = nodes[22].children.find((c) => c.id === "mwi-labyrinth-beacon-hover");
    assert.equal(hoverNode.textContent, "+12");

    // Moving hover to cell 23 (native expert count = 9) measures only cell 23 and preserves pins untouched.
    map.beaconHover = 23;
    map.beaconPreviewCount = 9;
    view.update(map);
    assert.equal(totalReads(), readsAfterInitial + 2);
    assert.equal(nodes[23].children.find((c) => c.id === "mwi-labyrinth-beacon-hover").textContent, "+9");
    assert.equal(
      nodes.flatMap((n) => n.children.filter((c) => c.classList.contains("mwi-lab-beacon-pin")))[0],
      initialPins[0]
    );

    // Explicit layout() and window resize force re-measurement for pins + hover.
    const readsBeforeLayout = totalReads();
    view.layout();
    assert.equal(totalReads(), readsBeforeLayout + 2, "layout() re-measures active pin and hovered cell");
    const readsBeforeResize = totalReads();
    doc.defaultView.emit("resize");
    assert.equal(totalReads(), readsBeforeResize + 2, "resize re-measures active pin and hovered cell");

    // Updating only hover count on the same cell updates text in place without re-measuring.
    const readsBeforeCountUpdate = totalReads();
    map.beaconPreviewCount = 8;
    view.update(map);
    assert.equal(totalReads(), readsBeforeCountUpdate);
    assert.equal(nodes[23].children.find((c) => c.id === "mwi-labyrinth-beacon-hover").textContent, "+8");
  } finally {
    view.destroy();
  }
});

test("增减探照灯数量只更新新增或移除的标点与范围，已有节点不被重建", () => {
  const { nodes, map, view } = createFixture();
  try {
    view.update(map);
    const plusButton = view.element.querySelectorAll("button").find((b) => b.getAttribute("aria-label") === "增加一盏");
    assert.ok(plusButton);
    const pinBefore = nodes.flatMap((n) => n.children.filter((c) => c.classList.contains("mwi-lab-beacon-pin")))[0];
    const fillCellsBefore = new Map(
      nodes
        .map((n, id) => [id, n.children.find((c) => c.classList.contains("mwi-lab-beacon-range"))])
        .filter(([, r]) => Boolean(r))
    );
    const readsBefore = nodes.reduce((sum, n) => sum + n.rectReads, 0);

    plusButton.dispatch("click");
    const pinsAfter = nodes.flatMap((n) => n.children.filter((c) => c.classList.contains("mwi-lab-beacon-pin")));
    assert.equal(pinsAfter.length, 2);
    const preservedPin = pinsAfter.includes(pinBefore);
    const readsDelta = nodes.reduce((sum, n) => sum + n.rectReads, 0) - readsBefore;
    if (preservedPin) {
      assert.equal(readsDelta, 1, "only newly added pin cell measured");
    }
    let reusedRangeCount = 0;
    for (const [id, oldRange] of fillCellsBefore.entries()) {
      const currentRange = nodes[id].children.find((c) => c.classList.contains("mwi-lab-beacon-range"));
      if (currentRange === oldRange) reusedRangeCount++;
    }
    assert.ok(reusedRangeCount > 0, "overlapping range cells reused their existing range node");
  } finally {
    view.destroy();
  }
});
