const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const sandbox = vm.createContext({});
vm.runInContext(
  fs.readFileSync(require("node:path").join(__dirname, "../src/calculator/combat-experience.js"), "utf8"),
  sandbox
);
const { summarize, skills } = sandbox.MwiLabyrinthCombatExperience;
const values = Object.fromEntries(skills.map((key, i) => [key, i + 1]));
test("战斗经验按七技能合计，失败耗时与每次入场计入 K/h", () => {
  const result = summarize({
    trials: 10,
    successes: 2,
    totalSpentSeconds: 1000,
    experienceGained: { player1: values }
  });
  assert.equal(result.totalExperience, 28);
  assert.equal(result.experiencePerRoom, 14);
  assert.equal(result.experiencePerAttempt, 2.8);
  assert.equal(result.experiencePerHour, (28 / 1010) * 3600);
  assert.equal(result.bySkill.magic.experiencePerRoom, 3.5);
  assert.equal(result.bySkill.magic.experiencePerHour, (7 / 1010) * 3600);
  assert.equal(
    summarize({ trials: 10, successes: 2, totalSpentSeconds: 1000, experienceGained: { player1: values } }, 0)
      .experiencePerHour,
    (28 / 1000) * 3600
  );
});
test("零成功的经验效率为零，每场成功经验未知；缺失或不一致数据不伪造", () => {
  const base = { trials: 10, successes: 0, totalSpentSeconds: 1200, experienceGained: {} };
  assert.equal(summarize(base).experiencePerHour, 0);
  assert.equal(summarize(base).experiencePerRoom, null);
  for (const change of [
    { experienceGained: undefined },
    { successes: 1 },
    { trials: 0 },
    { totalSpentSeconds: NaN },
    { experienceGained: { player1: values } }
  ])
    assert.throws(() => summarize({ ...base, ...change }));
  assert.throws(() => summarize({ ...base, successes: 1, experienceGained: { player1: { ...values, magic: -1 } } }));
});
