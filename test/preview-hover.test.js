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

test("生活与战斗详情悬停满 500ms 才显示，移动不提前弹出、不重置计时", () => {
  for (const combat of [false, true]) {
    const f = fixture(),
      tile = f.cell({ value: 1 }, combat);
    f.emit(tile, "mouseenter");
    f.advance(250);
    f.emit(tile, "mousemove", 40, 50);
    f.advance(249);
    assert.equal(f.tip.style.display, "none");
    assert.equal(f.draws.length, 0);
    f.advance(1);
    assert.equal(f.tip.style.display, "block");
    assert.deepEqual(f.tip.position, [40, 50]);
    assert.equal(f.draws.length, 1);
    f.emit(tile, "mouseleave");
    assert.equal(f.tip.style.display, "none");
    assert.equal(f.timers.size, 0);
  }
});

test("快速划过和切换房间取消旧计时，新房间独立等待 500ms", () => {
  const f = fixture(),
    a = f.cell({ value: "a" }),
    b = f.cell({ value: "b" }, true);
  f.emit(a, "mouseenter");
  f.advance(400);
  f.emit(a, "mouseleave");
  f.emit(b, "mouseenter");
  f.advance(499);
  assert.equal(f.draws.length, 0);
  f.advance(1);
  assert.equal(f.draws[0].value, "b");
  f.emit(b, "mousemove");
  f.emit(b, "mouseleave");
  f.advance(1000);
  assert.equal(f.tip.style.display, "none");
  assert.equal(f.frames.size, 0);
});

test("等待时读到最新详情；隐藏、销毁和删除地块都不会延迟弹回", () => {
  const f = fixture(),
    tile = f.cell({ value: "old" });
  f.emit(tile, "mouseenter");
  f.advance(250);
  f.ctx.setCellSkillingPreview(tile, { value: "new" });
  f.advance(250);
  assert.equal(f.draws[0].value, "new");
  f.ctx.hidePreviewTooltip();
  for (const action of [
    () => f.ctx.hidePreviewTooltip(),
    () => (f.ctx.destroyed = true),
    () => (tile.isConnected = false)
  ]) {
    f.ctx.destroyed = false;
    tile.isConnected = true;
    f.emit(tile, "mouseenter");
    action();
    f.advance(1000);
    assert.equal(f.tip.style.display, "none");
    assert.equal(f.draws.length, 1);
  }
});
