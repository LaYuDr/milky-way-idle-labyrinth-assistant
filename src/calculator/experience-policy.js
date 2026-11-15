(function (root) {
  "use strict";
  function rate({ chance, successSeconds, experience, duration = 120, entry = 1 }) {
    if (
      ![chance, experience, duration, entry].every(Number.isFinite) ||
      chance < 0 ||
      chance > 1 ||
      experience < 0 ||
      duration <= 0 ||
      entry < 0
    )
      return null;
    if (chance === 0) return 0;
    if (!Number.isFinite(successSeconds) || successSeconds < 0 || successSeconds > duration + 1e-8) return null;
    const seconds = chance * Math.min(successSeconds, duration) + (1 - chance) * duration + entry;
    return seconds > 0 ? (3600 * chance * experience) / seconds : null;
  }
  // Resolve a bounded batch, then merge in level order so scheduling never changes ties or ranges.
  async function scan({
    minLevel = 1,
    maxLevel,
    target,
    evaluate,
    concurrency = 1,
    tailLevels = null,
    futureUpperBound = null,
    onProgress = () => {},
    cancelled = () => false,
    yieldControl = async () => {}
  }) {
    if (
      !Number.isInteger(minLevel) ||
      !Number.isInteger(maxLevel) ||
      minLevel < 1 ||
      maxLevel < minLevel ||
      !Number.isFinite(target) ||
      target < 0 ||
      !Number.isInteger(concurrency) ||
      concurrency < 1 ||
      concurrency > 16 ||
      (tailLevels !== null && (!Number.isInteger(tailLevels) || tailLevels < 0))
    )
      throw new Error("经验目标或等级范围无效");
    const ranges = [];
    let best = null,
      peak = null,
      firstMiss = null,
      stopReason = null,
      scannedTo = minLevel - 1;
    for (let next = minLevel; next <= maxLevel;) {
      if (cancelled()) throw new Error("计算输入已变化");
      const end = Math.min(
        maxLevel,
        next + Math.min(concurrency, tailLevels === null ? concurrency : tailLevels + 1) - 1,
        firstMiss !== null && tailLevels !== null ? firstMiss + tailLevels : Infinity
      );
      const levels = Array.from({ length: end - next + 1 }, (_, i) => next + i);
      // Drain every active task before cancellation/failure escapes to the next room.
      const batch = await Promise.allSettled(levels.map((level) => Promise.resolve().then(() => evaluate(level))));
      if (cancelled()) throw new Error("计算输入已变化");
      const failure = batch.find((item) => item.status === "rejected");
      if (failure) throw failure.reason;
      for (let i = 0; i < levels.length; i++) {
        const level = levels[i],
          sample = batch[i].value,
          hourly = sample?.experiencePerHour;
        if (!Number.isFinite(hourly) || hourly < 0) throw new Error("缺少有效的经验效率数据");
        const current = { ...sample, roomLevel: level };
        scannedTo = level;
        if (!peak || hourly > peak.experiencePerHour) peak = current;
        if (hourly > target) {
          firstMiss = null;
          best = current;
          const last = ranges.at(-1);
          if (last && last[1] === level - 1) last[1] = level;
          else ranges.push([level, level]);
        } else if (firstMiss === null) firstMiss = level;
      }
      onProgress({ completed: scannedTo - minLevel + 1, level: scannedTo });
      if (futureUpperBound && scannedTo < maxLevel) {
        const bound = futureUpperBound(batch.at(-1).value, scannedTo, maxLevel);
        // Also preserve the full-range peak, including runs with no qualifying level.
        const ceiling = Math.min(target, peak.experiencePerHour);
        if (Number.isFinite(bound) && bound >= 0 && (bound === 0 || bound + Math.max(1, bound) * 1e-10 < ceiling)) {
          stopReason = "certified-upper-bound";
          break;
        }
      }
      if (tailLevels !== null && firstMiss !== null && scannedTo >= firstMiss + tailLevels) {
        stopReason = "miss-window";
        break;
      }
      next = end + 1;
      if (concurrency > 1 || (scannedTo - minLevel + 1) % 8 === 0) await yieldControl();
    }
    if (cancelled()) throw new Error("计算输入已变化");
    return {
      best,
      peak,
      ranges,
      minLevel,
      maxLevel: scannedTo,
      searchMaxLevel: maxLevel,
      stoppedEarly: scannedTo < maxLevel,
      stopReason,
      tailLevels,
      target,
      atSearchLimit: best?.roomLevel === maxLevel
    };
  }
  root.MwiLabyrinthExperiencePolicy = Object.freeze({ rate, scan });
})(globalThis);
