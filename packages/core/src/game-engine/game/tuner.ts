/**
 * tuner.ts — 数值求解器：二分法反推某参数使关卡胜率达标。
 *
 * 用法：
 *   solveForWinRate(1, {
 *     target: 0.7,
 *     param: { type: 'waveHpMultiplier', waveIndex: 4 },
 *     range: [0.5, 2.0],
 *   })
 * 返回：达到 70% 胜率（±tolerance）所需的 hpMultiplier scale。
 *
 * 假设：参数与胜率在 range 内单调。实际仿真含 rng 噪声，建议 seeds ≥ 20。
 */

import type { LevelConfig } from './data/levels';
import { LEVELS, getLevel } from './data/levels';
import type { BalanceReport, BotPolicy } from './simulator';
import { estimateDifficulty, greedyBot } from './simulator';

export type TunableParam =
  | { type: 'waveHpMultiplier'; waveIndex: number } // 乘数
  | { type: 'waveHpMultiplierAll' } // 所有波 hpMultiplier × scale
  | { type: 'waveIntervalMs'; waveIndex: number } // 乘数
  | { type: 'initialAtp' } // 绝对值
  | { type: 'initialHp' }; // 绝对值

export interface TuneOptions {
  target: number;
  param: TunableParam;
  range: [number, number];
  tolerance?: number; // winRate 与 target 的绝对差容差，默认 0.05
  bot?: BotPolicy;
  seeds?: readonly number[];
  maxIterations?: number; // 默认 15
}

export interface TuneHistoryEntry {
  value: number;
  winRate: number;
}

export interface TuneResult {
  value: number;
  winRate: number;
  iterations: number;
  converged: boolean;
  history: readonly TuneHistoryEntry[];
}

/** 参数方向：true = 正相关（↑param → ↑winRate），false = 负相关。 */
function isParamPositiveOnWinRate(param: TunableParam): boolean {
  switch (param.type) {
    case 'initialAtp':
    case 'initialHp':
    case 'waveIntervalMs': // 间隔越大 → spawn 越稀 → 越容易
      return true;
    case 'waveHpMultiplier':
    case 'waveHpMultiplierAll':
      return false;
  }
}

/** 深克隆 level config 的关键字段（只克隆会被修改的部分） */
function cloneLevel(level: LevelConfig): LevelConfig {
  return {
    ...level,
    waves: level.waves.map((w) => ({ ...w, composition: [...w.composition] })),
  };
}

function applyParam(level: LevelConfig, param: TunableParam, value: number): LevelConfig {
  const cloned = cloneLevel(level);
  const mutableWaves = cloned.waves as unknown as { hpMultiplier: number; intervalMs: number }[];
  switch (param.type) {
    case 'waveHpMultiplier': {
      const w = mutableWaves[param.waveIndex];
      if (w) w.hpMultiplier = w.hpMultiplier * value;
      break;
    }
    case 'waveHpMultiplierAll': {
      for (const w of mutableWaves) w.hpMultiplier = w.hpMultiplier * value;
      break;
    }
    case 'waveIntervalMs': {
      const w = mutableWaves[param.waveIndex];
      if (w) w.intervalMs = w.intervalMs * value;
      break;
    }
    case 'initialAtp':
      (cloned as { initialAtp: number }).initialAtp = Math.round(value);
      break;
    case 'initialHp':
      (cloned as { initialHp: number }).initialHp = Math.round(value);
      break;
  }
  return cloned;
}

/** 在临时 level 上跑仿真。用保留 ID 区段 99000 + baseId 避免冲突。 */
function evaluateAt(
  levelId: number,
  param: TunableParam,
  value: number,
  bot: BotPolicy,
  seeds: readonly number[],
): BalanceReport {
  const base = getLevel(levelId);
  const tmpId = 99000 + levelId;
  const tmpLevel = applyParam(base, param, value);
  // 用新的 id 覆盖 tmpLevel.id，避免 getLevel 内部自检
  (tmpLevel as { id: number }).id = tmpId;
  LEVELS[tmpId] = tmpLevel;
  try {
    return estimateDifficulty(tmpId, { policy: bot, seeds });
  } finally {
    delete LEVELS[tmpId];
  }
}

export function solveForWinRate(levelId: number, options: TuneOptions): TuneResult {
  const tolerance = options.tolerance ?? 0.05;
  const bot = options.bot ?? greedyBot;
  const seeds = options.seeds ?? Array.from({ length: 20 }, (_, i) => i + 1);
  const maxIter = options.maxIterations ?? 15;
  const [initialLo, initialHi] = options.range;
  if (initialLo >= initialHi) {
    throw new Error(`tuner range 非法：[${initialLo}, ${initialHi}]`);
  }

  const positive = isParamPositiveOnWinRate(options.param);
  const history: TuneHistoryEntry[] = [];
  let lo = initialLo;
  let hi = initialHi;
  let best: TuneHistoryEntry | null = null;

  for (let iter = 0; iter < maxIter; iter++) {
    const mid = (lo + hi) / 2;
    const report = evaluateAt(levelId, options.param, mid, bot, seeds);
    const wr = report.winRate;
    history.push({ value: mid, winRate: wr });
    if (!best || Math.abs(wr - options.target) < Math.abs(best.winRate - options.target)) {
      best = { value: mid, winRate: wr };
    }
    if (Math.abs(wr - options.target) <= tolerance) {
      return { value: mid, winRate: wr, iterations: iter + 1, converged: true, history };
    }
    // positive: 胜率低 → 需要增大参数；负相关：胜率低 → 需要减小参数
    const belowTarget = wr < options.target;
    if (positive === belowTarget) {
      lo = mid; // 往上走
    } else {
      hi = mid; // 往下走
    }
  }

  // 未收敛：返回历史中最接近 target 的点
  return {
    value: best?.value ?? (initialLo + initialHi) / 2,
    winRate: best?.winRate ?? 0,
    iterations: maxIter,
    converged: false,
    history,
  };
}
