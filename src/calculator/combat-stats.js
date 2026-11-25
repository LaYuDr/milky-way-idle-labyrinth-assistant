// Pure compact combat curve statistics, deterministic chunking, and Chan parallel moment merging.
(function (root) {
  "use strict";

  const SKILLS = Object.freeze(["stamina", "intelligence", "attack", "melee", "defense", "ranged", "magic"]);
  const STRIDE = 16;
  const DEFAULT_MAX_LEVEL = 300;
  const DEFAULT_BASE_TRIALS = 250;
  const DEFAULT_CHUNK_TRIALS = 250;
  const DEFAULT_REFINEMENT_BUFFER = 15;
  const DEFAULT_ANOMALY_BUFFER = 5;

  const IDX_TRIALS = 0;
  const IDX_SUCCESSES = 1;
  const IDX_FAILED_DEATH = 2;
  const IDX_FAILED_TIMEOUT = 3;
  const IDX_TOTAL_SPENT = 4;
  const IDX_MIN_ELAPSED = 5;
  const IDX_MAX_ELAPSED = 6;
  const IDX_DURATION_M2 = 7;
  const IDX_DURATION_COMOMENT = 8;
  const IDX_XP_BASE = 9;

  function finite(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function nonNegativeInt(value) {
    const n = Math.floor(finite(value, 0));
    return n > 0 ? n : 0;
  }

  function clamp01(value) {
    const n = finite(value, 0);
    return n < 0 ? 0 : n > 1 ? 1 : n;
  }

  // Deterministic 32-bit SplitMix/Murmur finalizer for independent i.i.d. chunk seeds.
  // Chunk 0 preserves baseSeed so small single-chunk probes align with legacy baseSeed.
  function chunkSeed(baseSeed, chunkIndex) {
    const base = Number(baseSeed) >>> 0 || 173;
    const index = Math.max(0, Math.floor(finite(chunkIndex, 0))) >>> 0;
    if (index === 0) return base;
    let h = (base ^ Math.imul(index, 0x9e3779b1)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }

  // Split delta trials into deterministic chunks starting from existingTrials.
  function buildChunkPlan(existingTrials, targetTrials, { baseSeed = 173, chunkSize = DEFAULT_CHUNK_TRIALS } = {}) {
    const current = nonNegativeInt(existingTrials);
    const target = nonNegativeInt(targetTrials);
    if (target <= current) return [];
    const quantum = Math.max(1, Math.min(3000, nonNegativeInt(chunkSize) || DEFAULT_CHUNK_TRIALS));
    const plan = [];
    let covered = current;
    let chunkIndex = Math.floor(current / quantum);
    // If existingTrials is not aligned on a chunk boundary, advance to the next unused chunk index.
    if (current > 0 && current % quantum !== 0) chunkIndex += 1;
    while (covered < target) {
      const remaining = target - covered;
      const trials = Math.min(quantum, remaining);
      plan.push({
        chunkIndex,
        trials,
        seed: chunkSeed(baseSeed, chunkIndex)
      });
      covered += trials;
      chunkIndex += 1;
    }
    return plan;
  }

  function isArrayBuffer(value) {
    return Boolean(
      value && (value instanceof ArrayBuffer || Object.prototype.toString.call(value) === "[object ArrayBuffer]")
    );
  }

  function extractXpArray(raw) {
    const xp = new Float64Array(SKILLS.length);
    if (!raw) return xp;
    if (Array.isArray(raw) || ArrayBuffer.isView(raw)) {
      for (let i = 0; i < SKILLS.length; i++) xp[i] = Math.max(0, finite(raw[i], 0));
      return xp;
    }
    let source = raw;
    if (raw.experienceGained && typeof raw.experienceGained === "object") {
      const players = Object.values(raw.experienceGained);
      source = players[0] || null;
    }
    if (source && typeof source === "object") {
      for (let i = 0; i < SKILLS.length; i++) xp[i] = Math.max(0, finite(source[SKILLS[i]], 0));
    }
    return xp;
  }

  function normalizeStats(raw) {
    if (!raw || typeof raw !== "object") return null;
    const trials = nonNegativeInt(raw.trials ?? raw.completedTrials);
    if (trials <= 0) return null;
    const successes = Math.min(trials, nonNegativeInt(raw.successes));
    let failedByDeath = nonNegativeInt(raw.failedByDeath);
    let failedByTimeout = nonNegativeInt(raw.failedByTimeout);
    const failures = trials - successes;
    if (failedByDeath + failedByTimeout !== failures) {
      failedByDeath = Math.min(failures, failedByDeath);
      failedByTimeout = failures - failedByDeath;
    }
    const totalSpentSeconds = Math.max(0, finite(raw.totalSpentSeconds, 0));
    const minElapsedSeconds = Math.max(0, finite(raw.minElapsedSeconds, 0));
    const maxElapsedSeconds = Math.max(minElapsedSeconds, finite(raw.maxElapsedSeconds, minElapsedSeconds));
    let durationM2SecondsSquared = finite(raw.durationM2SecondsSquared, NaN);
    let durationSuccessComomentSeconds = finite(raw.durationSuccessComomentSeconds, NaN);
    if (!Number.isFinite(durationM2SecondsSquared) && Number.isFinite(raw.durationSquaredSeconds)) {
      const mean = totalSpentSeconds / trials;
      durationM2SecondsSquared = Math.max(0, raw.durationSquaredSeconds - totalSpentSeconds * mean);
    }
    if (!Number.isFinite(durationSuccessComomentSeconds) && Number.isFinite(raw.successSpentSeconds)) {
      durationSuccessComomentSeconds = raw.successSpentSeconds - totalSpentSeconds * (successes / trials);
    }
    const xp = extractXpArray(raw.xp || raw);
    return {
      trials,
      successes,
      failedByDeath,
      failedByTimeout,
      totalSpentSeconds,
      minElapsedSeconds,
      maxElapsedSeconds,
      durationM2SecondsSquared: Number.isFinite(durationM2SecondsSquared) ? Math.max(0, durationM2SecondsSquared) : 0,
      durationSuccessComomentSeconds: Number.isFinite(durationSuccessComomentSeconds)
        ? durationSuccessComomentSeconds
        : 0,
      xp
    };
  }

  // Exact Chan (1979) parallel central moment merger for two independent trial batches.
  function mergeStats(leftRaw, rightRaw) {
    const a = normalizeStats(leftRaw);
    const b = normalizeStats(rightRaw);
    if (!a) return b;
    if (!b) return a;
    const nA = a.trials;
    const nB = b.trials;
    const n = nA + nB;
    const meanTA = a.totalSpentSeconds / nA;
    const meanTB = b.totalSpentSeconds / nB;
    const meanYA = a.successes / nA;
    const meanYB = b.successes / nB;
    const deltaT = meanTB - meanTA;
    const deltaY = meanYB - meanYA;
    const factor = (nA * nB) / n;
    const durationM2SecondsSquared = Math.max(
      0,
      a.durationM2SecondsSquared + b.durationM2SecondsSquared + deltaT * deltaT * factor
    );
    const durationSuccessComomentSeconds =
      a.durationSuccessComomentSeconds + b.durationSuccessComomentSeconds + deltaT * deltaY * factor;
    const xp = new Float64Array(SKILLS.length);
    for (let i = 0; i < SKILLS.length; i++) xp[i] = a.xp[i] + b.xp[i];
    return {
      trials: n,
      successes: a.successes + b.successes,
      failedByDeath: a.failedByDeath + b.failedByDeath,
      failedByTimeout: a.failedByTimeout + b.failedByTimeout,
      totalSpentSeconds: a.totalSpentSeconds + b.totalSpentSeconds,
      minElapsedSeconds: Math.min(a.minElapsedSeconds, b.minElapsedSeconds),
      maxElapsedSeconds: Math.max(a.maxElapsedSeconds, b.maxElapsedSeconds),
      durationM2SecondsSquared,
      durationSuccessComomentSeconds,
      xp
    };
  }

  function createCurveBuffer(maxLevel = DEFAULT_MAX_LEVEL) {
    const levels = Math.max(1, nonNegativeInt(maxLevel) || DEFAULT_MAX_LEVEL);
    return new ArrayBuffer(levels * STRIDE * Float64Array.BYTES_PER_ELEMENT);
  }

  function expandCurveBuffer(buffer, nextMaxLevel) {
    const currentView = ArrayBuffer.isView(buffer)
      ? new Float64Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.byteLength / 8))
      : new Float64Array(buffer);
    const currentLevels = Math.floor(currentView.length / STRIDE);
    const targetLevels = Math.max(currentLevels, nonNegativeInt(nextMaxLevel));
    if (targetLevels <= currentLevels) return currentView.buffer;
    const nextBuffer = createCurveBuffer(targetLevels);
    new Float64Array(nextBuffer).set(currentView);
    return nextBuffer;
  }

  function writeLevel(view, level, rawStats) {
    const idx = Math.floor(Number(level)) - 1;
    const offset = idx * STRIDE;
    if (idx < 0 || offset + STRIDE > view.length) return false;
    const stats = normalizeStats(rawStats);
    if (!stats) {
      view.fill(0, offset, offset + STRIDE);
      return false;
    }
    view[offset + IDX_TRIALS] = stats.trials;
    view[offset + IDX_SUCCESSES] = stats.successes;
    view[offset + IDX_FAILED_DEATH] = stats.failedByDeath;
    view[offset + IDX_FAILED_TIMEOUT] = stats.failedByTimeout;
    view[offset + IDX_TOTAL_SPENT] = stats.totalSpentSeconds;
    view[offset + IDX_MIN_ELAPSED] = stats.minElapsedSeconds;
    view[offset + IDX_MAX_ELAPSED] = stats.maxElapsedSeconds;
    view[offset + IDX_DURATION_M2] = stats.durationM2SecondsSquared;
    view[offset + IDX_DURATION_COMOMENT] = stats.durationSuccessComomentSeconds;
    for (let i = 0; i < SKILLS.length; i++) view[offset + IDX_XP_BASE + i] = stats.xp[i];
    return true;
  }

  function readLevel(view, level) {
    const idx = Math.floor(Number(level)) - 1;
    const offset = idx * STRIDE;
    if (idx < 0 || offset + STRIDE > view.length) return null;
    const trials = view[offset + IDX_TRIALS];
    if (!(trials > 0) || !Number.isFinite(trials)) return null;
    const xp = new Float64Array(SKILLS.length);
    for (let i = 0; i < SKILLS.length; i++) xp[i] = Math.max(0, view[offset + IDX_XP_BASE + i]);
    return {
      trials: Math.round(trials),
      successes: Math.round(view[offset + IDX_SUCCESSES]),
      failedByDeath: Math.round(view[offset + IDX_FAILED_DEATH]),
      failedByTimeout: Math.round(view[offset + IDX_FAILED_TIMEOUT]),
      totalSpentSeconds: view[offset + IDX_TOTAL_SPENT],
      minElapsedSeconds: view[offset + IDX_MIN_ELAPSED],
      maxElapsedSeconds: view[offset + IDX_MAX_ELAPSED],
      durationM2SecondsSquared: view[offset + IDX_DURATION_M2],
      durationSuccessComomentSeconds: view[offset + IDX_DURATION_COMOMENT],
      xp
    };
  }

  function mergeIntoLevel(view, level, deltaStats) {
    const existing = readLevel(view, level);
    const merged = existing ? mergeStats(existing, deltaStats) : normalizeStats(deltaStats);
    if (!merged) return null;
    writeLevel(view, level, merged);
    return merged;
  }

  function readTrialsAt(view, level) {
    const idx = Math.floor(Number(level)) - 1;
    const offset = idx * STRIDE;
    if (idx < 0 || offset + STRIDE > view.length) return 0;
    const t = view[offset + IDX_TRIALS];
    return Number.isFinite(t) && t > 0 ? Math.round(t) : 0;
  }

  function toExperienceGained(xp) {
    const map = {};
    for (let i = 0; i < SKILLS.length; i++) map[SKILLS[i]] = Math.max(0, finite(xp?.[i], 0));
    return { player1: map };
  }

  function toWorkerResult(rawStats, extra = {}) {
    const stats = normalizeStats(rawStats);
    if (!stats) return null;
    const clearChance = clamp01(stats.successes / stats.trials);
    const expectedSecondsPerClear = stats.successes > 0 ? stats.totalSpentSeconds / stats.successes : Infinity;
    return {
      trials: stats.trials,
      completedTrials: stats.trials,
      statisticalTrials: stats.trials,
      successes: stats.successes,
      failures: stats.trials - stats.successes,
      failedByDeath: stats.failedByDeath,
      failedByTimeout: stats.failedByTimeout,
      clearChance,
      expectedSecondsPerClear,
      totalSpentSeconds: stats.totalSpentSeconds,
      minElapsedSeconds: stats.minElapsedSeconds,
      maxElapsedSeconds: stats.maxElapsedSeconds,
      durationM2SecondsSquared: stats.durationM2SecondsSquared,
      durationSuccessComomentSeconds: stats.durationSuccessComomentSeconds,
      experienceGained: toExperienceGained(stats.xp),
      ...extra
    };
  }

  function wilsonLower(wins, trials) {
    if (!(trials > 0) || !Number.isFinite(wins)) return 0;
    const p = clamp01(wins / trials);
    const z = 1.96;
    const z2 = z * z;
    return (
      (p + z2 / (2 * trials) - z * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials))) / (1 + z2 / trials)
    );
  }

  // Identify levels requiring refinement up to targetTrials:
  // 1) All transition levels (0 < wins < trials) plus +/- bufferRadius boundary guard
  //    so 99% Wilson confidence thresholds and transition edges always have high precision.
  // 2) Any level adjacent to a sharp jump in clear chance, death ratio, or mean time (+/- anomalyBuffer).
  // 3) If forceFull is true, refine every level in [minLevel, maxLevel].
  function selectRefinementLevels(
    view,
    maxLevel,
    targetTrials,
    {
      minLevel = 1,
      bufferRadius = DEFAULT_REFINEMENT_BUFFER,
      anomalyBuffer = DEFAULT_ANOMALY_BUFFER,
      forceFull = false
    } = {}
  ) {
    const lo = Math.max(1, Math.floor(finite(minLevel, 1)));
    const hi = Math.min(
      Math.floor(view.length / STRIDE),
      Math.max(lo, Math.floor(finite(maxLevel, DEFAULT_MAX_LEVEL)))
    );
    const target = nonNegativeInt(targetTrials);
    if (target <= 0 || hi < lo) return [];

    if (forceFull) {
      const all = [];
      for (let lv = lo; lv <= hi; lv++) {
        if (readTrialsAt(view, lv) < target) all.push(lv);
      }
      return all;
    }

    const marked = new Uint8Array(hi + 1);
    const markRange = (center, radius) => {
      const start = Math.max(lo, center - radius);
      const end = Math.min(hi, center + radius);
      for (let k = start; k <= end; k++) marked[k] = 1;
    };

    let prevP = null;
    let prevDeath = null;
    let prevAvgT = null;
    let sawMixed = false;

    for (let lv = lo; lv <= hi; lv++) {
      const offset = (lv - 1) * STRIDE;
      const t = view[offset + IDX_TRIALS];
      if (!(t > 0)) continue;
      const s = view[offset + IDX_SUCCESSES];
      const d = view[offset + IDX_FAILED_DEATH];
      const spent = view[offset + IDX_TOTAL_SPENT];
      const p = s / t;
      const deathRatio = d / t;
      const avgT = spent / t;

      if (s > 0 && s < t) {
        sawMixed = true;
        markRange(lv, bufferRadius);
      }
      if (prevP !== null) {
        // Transition from 100% directly to 0% or vice versa without an intermediate mixed level.
        if (Math.abs(p - prevP) >= 0.05) {
          sawMixed = true;
          markRange(lv, bufferRadius);
          markRange(lv - 1, bufferRadius);
        } else if (Math.abs(deathRatio - prevDeath) >= 0.2 || (prevAvgT > 0 && Math.abs(avgT - prevAvgT) > 15)) {
          markRange(lv, anomalyBuffer);
        }
      }
      prevP = p;
      prevDeath = deathRatio;
      prevAvgT = avgT;
    }

    // If the entire scanned curve is 100% wins (very strong player), refine the upper tail so
    // Wilson 99% bounds at the search ceiling remain accurate.
    if (!sawMixed && prevP === 1) {
      markRange(hi, bufferRadius);
    }

    const levels = [];
    for (let lv = lo; lv <= hi; lv++) {
      if (marked[lv] && readTrialsAt(view, lv) < target) levels.push(lv);
    }
    return levels;
  }

  root.MwiLabyrinthCombatStats = Object.freeze({
    SKILLS,
    STRIDE,
    DEFAULT_MAX_LEVEL,
    DEFAULT_BASE_TRIALS,
    DEFAULT_CHUNK_TRIALS,
    DEFAULT_REFINEMENT_BUFFER,
    DEFAULT_ANOMALY_BUFFER,
    IDX_TRIALS,
    IDX_SUCCESSES,
    IDX_FAILED_DEATH,
    IDX_FAILED_TIMEOUT,
    IDX_TOTAL_SPENT,
    IDX_MIN_ELAPSED,
    IDX_MAX_ELAPSED,
    IDX_DURATION_M2,
    IDX_DURATION_COMOMENT,
    IDX_XP_BASE,
    isArrayBuffer,
    chunkSeed,
    buildChunkPlan,
    normalizeStats,
    mergeStats,
    createCurveBuffer,
    expandCurveBuffer,
    writeLevel,
    readLevel,
    readTrialsAt,
    mergeIntoLevel,
    toExperienceGained,
    toWorkerResult,
    wilsonLower,
    selectRefinementLevels
  });
})(globalThis);
