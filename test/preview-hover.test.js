const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
function fixture() {
  const timers = new Map(),
    frames = new Map();
  let clock = 0,
    nextId = 0;
  const tip = { style: { display: "none" }, childElementCount: 1, scrollTop: 0 };
  const root = { document: { getElementById: () => tip } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/calculator/previews.js"), "utf8"), root);
  const draws = [];
  const ctx = {
    window: {
      setTimeout(fn, delay) {
        const id = ++nextId;
        timers.set(id, { fn, at: clock + delay });
        return id;
      },
      clearTimeout: (id) => timers.delete(id),
      requestAnimationFrame(fn) {
        const id = ++nextId;
        frames.set(id, fn);
        return id;
      },
      cancelAnimationFrame: (id) => frames.delete(id)
    },
    PREVIEW_CELL_BOUND_FLAG: "bound",
    listen: (cell, name, handler) => cell.listeners.set(name, handler),
    skillingPreviewByCell: new Map(),
    combatPreviewByCell: new Map()
  };
  root.MwiLabyrinthCalculatorModules.previews(ctx);
  ctx.getCellPreview = (cell) => ctx.combatPreviewByCell.get(cell) || ctx.skillingPreviewByCell.get(cell);
  ctx.renderCellPreviewTooltip = (data) => {
    draws.push(data);
    return tip;
  };
  ctx.positionPreviewTooltip = (_tip, x, y) => {
    tip.style.display = "block";
    tip.position = [x, y];
  };
  function cell(data, combat = false) {
    const cell = { listeners: new Map(), isConnected: true };
    ctx[combat ? "setCellCombatPreview" : "setCellSkillingPreview"](cell, data);
    return cell;
  }
  function advance(ms) {
    clock += ms;
    for (const [id, timer] of [...timers])
      if (timer.at <= clock) {
        timers.delete(id);
        timer.fn();
      }
    for (const [id, fn] of [...frames]) {
      frames.delete(id);
      fn();
    }
  }
  const emit = (cell, name, x = 10, y = 20) => cell.listeners.get(name)({ clientX: x, clientY: y });
  return { ctx, cell, advance, emit, tip, draws, timers, frames };
}

test("生活与战斗详情移入立即显示、移开立即隐藏", () => {
  for (const combat of [false, true]) {
    const f = fixture(),
      tile = f.cell({ value: 1 }, combat);
    f.emit(tile, "mouseenter");
    assert.equal(f.tip.style.display, "block");
    assert.deepEqual(f.tip.position, [10, 20]);
    assert.equal(f.draws.length, 1);
    assert.equal(f.timers.size, 0);
    f.emit(tile, "mousemove", 40, 50);
    f.advance(16);
    assert.deepEqual(f.tip.position, [40, 50]);
    assert.equal(f.draws.length, 1);
    f.emit(tile, "mouseleave");
    assert.equal(f.tip.style.display, "none");
  }
});

test("快速切换房间立即显示新详情，离开取消旧定位更新", () => {
  const f = fixture(),
    a = f.cell({ value: "a" }),
    b = f.cell({ value: "b" }, true);
  f.emit(a, "mouseenter");
  f.emit(a, "mousemove", 30, 40);
  f.emit(a, "mouseleave");
  assert.equal(f.frames.size, 0);
  f.emit(b, "mouseenter", 70, 80);
  assert.equal(f.tip.style.display, "block");
  assert.equal(f.draws.at(-1).value, "b");
  assert.deepEqual(f.tip.position, [70, 80]);
  f.emit(b, "mousemove");
  f.emit(b, "mouseleave");
  f.advance(1000);
  assert.equal(f.tip.style.display, "none");
  assert.equal(f.frames.size, 0);
  assert.equal(f.draws.length, 2);
});

test("显示中的详情随数据更新，隐藏后不弹回，已销毁或移除的地块不显示", () => {
  const f = fixture(),
    tile = f.cell({ value: "old" });
  f.emit(tile, "mouseenter");
  f.ctx.setCellSkillingPreview(tile, { value: "new" });
  f.advance(16);
  assert.equal(f.draws.at(-1).value, "new");
  f.ctx.setCellSkillingPreview(tile, { value: "hidden" });
  f.ctx.hidePreviewTooltip();
  f.advance(1000);
  assert.equal(f.tip.style.display, "none");
  assert.equal(f.draws.length, 2);
  f.ctx.destroyed = true;
  f.emit(tile, "mouseenter");
  assert.equal(f.tip.style.display, "none");
  f.ctx.destroyed = false;
  tile.isConnected = false;
  f.emit(tile, "mouseenter");
  assert.equal(f.tip.style.display, "none");
  assert.equal(f.draws.length, 2);
});
