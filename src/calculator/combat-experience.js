(function (root) {
  "use strict";
  const skills = ["stamina", "intelligence", "attack", "melee", "defense", "ranged", "magic"];
  function summarize(result, entrySeconds = 1) {
    const { trials, successes, totalSpentSeconds, experienceGained } = result || {};
    if (
      !Number.isSafeInteger(trials) ||
      trials < 1 ||
      !Number.isSafeInteger(successes) ||
      successes < 0 ||
      successes > trials ||
      !Number.isFinite(totalSpentSeconds) ||
      totalSpentSeconds < 0 ||
      !Number.isFinite(entrySeconds) ||
      entrySeconds < 0
    )
      throw new Error("战斗经验统计无效");
    if (!experienceGained || typeof experienceGained !== "object") throw new Error("缺少战斗经验数据，请重新计算");
    const players = Object.values(experienceGained);
    if (players.length > 1 || (successes > 0 && players.length !== 1)) throw new Error("战斗经验角色数据不一致");
    const values = players[0] || Object.fromEntries(skills.map((key) => [key, 0]));
    if (!skills.every((key) => Number.isFinite(values[key]) && values[key] >= 0)) throw new Error("战斗技能经验无效");
    const totalExperience = skills.reduce((sum, key) => sum + values[key], 0);
    const elapsed = totalSpentSeconds + trials * entrySeconds;
    if (!Number.isFinite(totalExperience) || elapsed <= 0 || (!successes && totalExperience > 0))
      throw new Error("战斗经验与对局统计不一致");
    return {
      version: 1,
      totalExperience,
      experiencePerRoom: successes ? totalExperience / successes : null,
      experiencePerAttempt: totalExperience / trials,
      experiencePerHour: (totalExperience / elapsed) * 3600,
      elapsedSeconds: elapsed,
      bySkill: Object.fromEntries(
        skills.map((key) => [
          key,
          {
            experiencePerRoom: successes ? values[key] / successes : null,
            experiencePerHour: (values[key] / elapsed) * 3600
          }
        ])
      )
    };
  }
  root.MwiLabyrinthCombatExperience = Object.freeze({ summarize, skills: Object.freeze(skills) });
})(globalThis);
