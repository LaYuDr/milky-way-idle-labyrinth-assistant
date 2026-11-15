"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { readRecommendation } = require("../src/ui/recommendation-prefill.js");
function row(text, token = "ready:62:100:65", count = 1, rich = false) {
  const cell = {
    textContent: rich ? `${text} 91.7 K/h 已检查 Lv.1–400` : text,
    querySelector: () => (rich ? { textContent: text } : null),
    getAttribute: (name) =>
      name.endsWith("token")
        ? token
        : name.endsWith("setting")
          ? token.startsWith("ready:") || token.startsWith("[")
            ? text
            : null
          : "milking"
  };
  return { querySelectorAll: () => Array(count).fill(cell) };
}
test("直接使用显示设置等级，不对推荐值再次加一，支持零和负数", () => {
  for (const [text, value] of [
    ["+63", "63"],
    ["0", "0"],
    ["-12", "-12"],
    ["999", "999"],
    ["-999", "-999"]
  ])
    assert.equal(readRecommendation(row(text)).value, value);
});
test("缺失、计算中、非整数、越界或重复推荐列不预填", () => {
  for (const text of ["", "--", "计算中", "63.5", "1e2", "+1000", "-1000", "63级", "Infinity"])
    assert.equal(readRecommendation(row(text)), null);
  assert.equal(readRecommendation(row("+63", "status:pending")), null);
  assert.equal(readRecommendation(row("+63", "ready:62", 0)), null);
  assert.equal(readRecommendation(row("+63", "ready:62", 2)), null);
});

test("经验推荐只取等级，不将 K/h 或扫描范围误作等级", () => {
  assert.equal(readRecommendation(row("+63", '["experience","ready"]', 1, true)).value, "63");
  assert.equal(readRecommendation(row("未达标", '["experience","error"]', 1, true)), null);
  assert.equal(readRecommendation(row("+63", "")), null);
});
