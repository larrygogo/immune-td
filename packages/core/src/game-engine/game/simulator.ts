/**
 * simulator.ts — 离线数值分析工具。
 *
 * 目标：给 map-gen 产出的关卡（或已有 LEVELS 条目）一个「数值真值函数」。
 * 输入 levelId + BotPolicy + 种子集，输出结构化的 balance report，供：
 *   - 离线脚本批量扫描难度曲线
 *   - CI 守护（关卡平均胜率偏离预期时报警）
 *   - 数值调参（二分/搜索 hpMultiplier 让 P50 玩家 70% 胜率）
 *
 * 实现思路：直接复用 phases.tick / actions.placeTower / upgradeTower，
 * 所有机制（DoT / 飞行 / helper buff / AoE / 保护细胞）自动覆盖。
 */

import { placeTower, startWave, upgradeTower } from './actions';
import { getLevel } from './data/levels';
import type { TowerType } from './entities';
import { PATHOGEN_DEFS, TOWER_DEFS, TOWER_LEVELS } from './entities';
import type { GameEvent } from './events';
import { GRID_SIZE } from './map';
import type { NextIdFn, TickResult } from './phases';
import { tick } from './phases';
import { PATHOGEN_REGISTRY } from './registry/pathogen-registry';
import { createRng } from './rng';
import { createInitialState } from './state';
import type { GameState } from './state';
import { bfsPathMulti } from './systems/pathfinding';

export type SimOutcome = 'won' | 'lost' | 'timeout';

export interface SimRunResult {
  outcome: SimOutcome;
  seed: number;
  stars: 0 | 1 | 2 | 3;
  hpRemaining: number;
  atpRemaining: number;
  leaked: number; // 到达 exit 的病原总数（CORE_DAMAGED 次数近似）
  waveReached: number;
  towerDeaths: number;
  towersPlaced: number;
  towersUpgraded: number;
  ticksElapsed: number;
  /** 每波结束时的快照（wave 完成前 tick） */
  waveSnapshots: readonly WaveSnapshot[];
}

export interface WaveSnapshot {
  waveIndex: number;
  hpAfter: number;
  atpAfter: number;
  leakedInWave: number;
  killsInWave: number;
}

export interface BalanceReport {
  levelId: number;
  runs: number;
  winRate: number;
  avgStars: number;
  avgHpRemaining: number;
  avgLeaked: number;
  avgTowerDeaths: number;
  /** 平均每波泄漏数（按 waveIndex 聚合） */
  perWaveAvgLeak: readonly number[];
  /** 分布明细 */
  outcomes: { won: number; lost: number; timeout: number };
  samples: readonly SimRunResult[];
}

// ---------- BotPolicy 接口 ----------

export interface BotAction {
  type: 'place' | 'upgrade';
  col?: number;
  row?: number;
  towerType?: TowerType;
  towerId?: string;
}

export interface BotPolicy {
  name: string;
  /** build 阶段开始时调用；返回该阶段要执行的动作队列（顺序执行，失败跳过） */
  onBuildPhase(state: GameState, availableTowers: readonly TowerType[]): readonly BotAction[];
}

// ---------- Bot 内部共享工具 ----------

function distToPath(
  col: number,
  row: number,
  path: readonly { col: number; row: number }[],
): number {
  let min = Number.POSITIVE_INFINITY;
  for (const p of path) {
    const d = Math.max(Math.abs(col - p.col), Math.abs(row - p.row));
    if (d < min) min = d;
  }
  return min;
}

function pathCoverageScore(
  col: number,
  row: number,
  range: number,
  path: readonly { col: number; row: number }[],
): number {
  let count = 0;
  for (const p of path) {
    const dx = col - p.col;
    const dy = row - p.row;
    if (Math.sqrt(dx * dx + dy * dy) <= range) count++;
  }
  return count;
}

/**
 * 已有塔 + 本次 build 阶段计划中的塔位，对 path 的总覆盖集合（边际覆盖用）。
 * helper 塔不贡献攻击覆盖。
 */
function computeCoveredPathCells(
  state: GameState,
  path: readonly { col: number; row: number }[],
  planned: readonly { col: number; row: number; range: number }[] = [],
): Set<string> {
  const covered = new Set<string>();
  const all: { col: number; row: number; range: number }[] = [...planned];
  for (const t of state.towers) {
    const lvl = TOWER_LEVELS[t.type][t.level - 1];
    if (!lvl || lvl.damage === 0) continue;
    all.push({ col: t.col, row: t.row, range: lvl.range });
  }
  for (const t of all) {
    for (const p of path) {
      const dx = t.col - p.col;
      const dy = t.row - p.row;
      if (Math.sqrt(dx * dx + dy * dy) <= t.range) {
        covered.add(`${p.col},${p.row}`);
      }
    }
  }
  return covered;
}

/**
 * 边际覆盖：只算这座塔能新增的、尚未被已有塔覆盖的 path 格数。
 * 多入口场景下，每格按"到最近入口的距离"加权，让 bot 优先守入口附近
 * （否则凸点堆塔天然得高分，入口前 3 格白嫖）：
 *   dist ≤ 1 → weight 5.0（入口本身 / 紧邻）
 *   dist ≤ 2 → weight 3.0
 *   dist ≤ 4 → weight 1.3
 *   其他     → weight 1.0
 */
function marginalCoverageScore(
  col: number,
  row: number,
  range: number,
  path: readonly { col: number; row: number }[],
  alreadyCovered: ReadonlySet<string>,
  entries: readonly { col: number; row: number }[] = [],
): number {
  const multiEntry = entries.length > 1;
  let count = 0;
  for (const p of path) {
    const dx = col - p.col;
    const dy = row - p.row;
    if (Math.sqrt(dx * dx + dy * dy) <= range) {
      if (!alreadyCovered.has(`${p.col},${p.row}`)) {
        if (multiEntry) {
          let minEntryDist = Number.POSITIVE_INFINITY;
          for (const e of entries) {
            const d = Math.max(Math.abs(p.col - e.col), Math.abs(p.row - e.row));
            if (d < minEntryDist) minEntryDist = d;
          }
          const w =
            minEntryDist <= 1 ? 5.0 : minEntryDist <= 2 ? 3.0 : minEntryDist <= 4 ? 1.3 : 1.0;
          count += w;
        } else {
          count += 1;
        }
      }
    }
  }
  return count;
}

/**
 * 塔性价比评分（A+C）：
 *   score = (DPS × survivalFactor) / cost
 *   其中 survivalFactor = max(1, HP / (dotBaseline × 4))
 * 越高 DoT 的波，HP 低的塔（如 neutrophil）越吃亏；让 mac 在 DoT 高时胜出。
 * dotBaseline 由当前波 composition 加权平均得出（见 avgDotOfWave）。
 */
function towerScore(type: TowerType, dotBaseline: number): number {
  const lv1 = TOWER_LEVELS[type][0];
  const def = TOWER_DEFS[type];
  if (!lv1 || !def || lv1.attackIntervalMs === 0) return 0;
  const dps = (lv1.damage / (lv1.attackIntervalMs / 1000)) * lv1.range;
  const survivalFactor = Math.max(1, lv1.hp / (dotBaseline * 4));
  return (dps * survivalFactor) / def.cost;
}

/** 过滤 helper 塔（damage=0） */
function isAttackTower(type: TowerType): boolean {
  const lv1 = TOWER_LEVELS[type][0];
  return lv1 !== undefined && lv1.damage > 0;
}

/** 下一波敌人加权平均 DoT（含关卡 dotMultiplier）。 */
function avgDotOfWave(state: GameState): number {
  const level = getLevel(state.levelId);
  const wave = level.waves[state.waveIndex];
  if (!wave) return 6;
  let totalDot = 0;
  let totalCount = 0;
  for (const s of wave.composition) {
    const entry = PATHOGEN_REGISTRY[s.type];
    if (!entry) continue;
    totalDot += s.count * entry.dot;
    totalCount += s.count;
  }
  const raw = totalCount === 0 ? 6 : totalDot / totalCount;
  return raw * (level.dotMultiplier ?? 1);
}

/**
 * 下一波 DPS 需求预测：敌总 HP / 预计波次持续时间。
 * 供需对比：如果现有塔总 DPS << 需求，bot 需要加塔而非存钱升级。
 * 返回 { demand, supply, gap }，gap > 0 表示产能不足。
 */
interface WaveDemandForecast {
  totalHp: number;
  waveDurationSec: number;
  demandDps: number; // 敌总 HP / 持续时间（简化模型）
  supplyDps: number; // 当前塔总 DPS（含升级后）
  gap: number; // demand - supply；>0 供不应求，<0 产能过剩
}

function forecastWaveDemand(state: GameState): WaveDemandForecast {
  const level = getLevel(state.levelId);
  const wave = level.waves[state.waveIndex];
  if (!wave) return { totalHp: 0, waveDurationSec: 1, demandDps: 0, supplyDps: 0, gap: 0 };

  // 需求：敌总 HP（含 hpMultiplier）
  let totalHp = 0;
  let totalCount = 0;
  for (const s of wave.composition) {
    const def = PATHOGEN_DEFS[s.type];
    if (!def) continue;
    totalHp += s.count * def.maxHp * wave.hpMultiplier;
    totalCount += s.count;
  }
  const waveDurationSec = Math.max(1, (totalCount * wave.intervalMs) / 1000);
  // 敌人穿过地图大约 5-8 秒（路径 10 格 / 速度 1.5），算进持续时间
  const engagementSec = waveDurationSec + 6;
  const demandDps = totalHp / engagementSec;

  // 供给：所有攻击塔 DPS（含等级）
  let supplyDps = 0;
  for (const t of state.towers) {
    const lvl = TOWER_LEVELS[t.type][t.level - 1];
    if (!lvl || lvl.damage === 0 || lvl.attackIntervalMs === 0) continue;
    supplyDps += lvl.damage / (lvl.attackIntervalMs / 1000);
  }
  // effectiveness 系数：塔不是 100% 有目标（有空窗期），且伤害会溢出 overkill
  const efficiency = 0.5;
  const effectiveSupply = supplyDps * efficiency;

  return {
    totalHp,
    waveDurationSec,
    demandDps,
    supplyDps,
    gap: demandDps - effectiveSupply,
  };
}

/**
 * 储蓄阈值（B）：已有可升级塔时返回最低升级成本；否则 0。
 * 但**至少有 2 座塔**时才启用，避免前期塔数不够时误省 ATP（导致防线崩溃）。
 * 这是关 9 strong/guard 崩的 fix：carryLimit=3 + ATP 紧的场景原本只放 1-2 座塔就存钱，直接败。
 */
function savingThreshold(state: GameState): number {
  if (state.towers.length < 2) return 0;
  let minCost = Number.POSITIVE_INFINITY;
  for (const t of state.towers) {
    const lvl = TOWER_LEVELS[t.type][t.level - 1];
    if (!lvl || lvl.upgradeCost === null) continue;
    if (lvl.upgradeCost < minCost) minCost = lvl.upgradeCost;
  }
  return minCost === Number.POSITIVE_INFINITY ? 0 : minCost;
}

/**
 * 统计塔型在 state + planned 中已出现次数（用于多样性惩罚）。
 * 包含当前已建 + bot 本轮规划。
 */
function countExistingType(
  state: GameState,
  planned: readonly { type?: TowerType }[],
  type: TowerType,
): number {
  const existing = state.towers.filter((t) => t.type === type).length;
  const plannedSame = planned.filter((p) => p.type === type).length;
  return existing + plannedSame;
}

/**
 * 从 availableTowers 中选能用得起的 attack 塔；score 排序，取第 N（index=0 最优）。
 * diversityPenalty：同类塔 N+1 座的 score 倍率 = 1/(1 + N*0.3)，鼓励 portfolio 多样性。
 */
function pickTowerByRank(
  atp: number,
  availableTowers: readonly TowerType[],
  rank: number,
  dotBaseline: number,
  filter: (t: TowerType) => boolean = () => true,
  existingCountOf?: (type: TowerType) => number,
): TowerType | null {
  const candidates = availableTowers
    .filter((t) => {
      const def = TOWER_DEFS[t];
      if (!def) return false;
      if (def.cost > atp) return false;
      if (!isAttackTower(t)) return false;
      return filter(t);
    })
    .map((t) => {
      const base = towerScore(t, dotBaseline);
      const same = existingCountOf?.(t) ?? 0;
      const diversityFactor = 1 / (1 + same * 0.3);
      return { type: t, score: base * diversityFactor };
    })
    .sort((a, b) => b.score - a.score);
  const pick = candidates[Math.min(rank, candidates.length - 1)];
  return pick?.type ?? null;
}

function pickBestTower(
  state: GameState,
  availableTowers: readonly TowerType[],
  dotBaseline?: number,
  planned?: readonly { type?: TowerType }[],
): TowerType | null {
  const dot = dotBaseline ?? avgDotOfWave(state);
  return pickTowerByRank(state.atp, availableTowers, 0, dot, undefined, (t) =>
    countExistingType(state, planned ?? [], t),
  );
}

/**
 * 多入口关卡：从每个 entry 分别计算到 goal 的最短路径，合并成 union path。
 * 让 bot 同时看到所有需要守的路径段（否则只看 state.currentPath 即最短一条）。
 */
function computeMultiEntryPath(state: GameState): readonly { col: number; row: number }[] {
  if (state.entries.length <= 1) return state.currentPath;
  const goals = [...state.exits, ...state.protectedCells.map((pc) => pc.coord)];
  const towerCoords = state.towers.map((t) => ({ col: t.col, row: t.row }));
  const seen = new Set<string>();
  const union: { col: number; row: number }[] = [];
  for (const entry of state.entries) {
    const p = bfsPathMulti(towerCoords, [entry], goals, GRID_SIZE);
    if (!p) continue;
    for (const c of p) {
      const k = `${c.col},${c.row}`;
      if (!seen.has(k)) {
        seen.add(k);
        union.push(c);
      }
    }
  }
  return union.length > 0 ? union : state.currentPath;
}

/**
 * 返回按 score 降序排的合法候选格（score > 0）。
 * 评分 = 边际路径覆盖（相对已有塔）- 距路径惩罚。
 * 多入口关卡用 union path，让 bot 同时守所有入口路径。
 */
function findPlacementCandidates(
  state: GameState,
  towerRange: number,
  occupied: ReadonlySet<string>,
  planned: readonly { col: number; row: number; range: number }[] = [],
): readonly { col: number; row: number; score: number }[] {
  const blockedSet = new Set<string>(state.blockedCells.map((c) => `${c.col},${c.row}`));
  const entrySet = new Set<string>(state.entries.map((c) => `${c.col},${c.row}`));
  const exitSet = new Set<string>(state.exits.map((c) => `${c.col},${c.row}`));
  const path = computeMultiEntryPath(state);
  const alreadyCovered = computeCoveredPathCells(state, path, planned);
  const out: { col: number; row: number; score: number }[] = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const key = `${c},${r}`;
      if (occupied.has(key) || blockedSet.has(key)) continue;
      if (entrySet.has(key) || exitSet.has(key)) continue;
      const d = distToPath(c, r, path);
      if (d === 0 || d > 2) continue;
      // 边际覆盖优先（多入口场景加权入口附近），fallback 到已覆盖区域 50% 分数
      const marginal = marginalCoverageScore(c, r, towerRange, path, alreadyCovered, state.entries);
      const absolute = pathCoverageScore(c, r, towerRange, path);
      const score = marginal > 0 ? marginal - d * 0.1 : absolute * 0.5 - d * 0.1;
      if (score <= 0) continue;
      out.push({ col: c, row: r, score });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

/**
 * 规划升级动作：循环直到 ATP 不够（允许同一座塔 Lv1→2→3 一次 build 阶段连升）。
 * strategy：
 *   - 'highest-first'（集火）：总是先升当前等级最高的塔
 *   - 'lowest-first'（均衡）：先升最低级的，让所有塔达到同一等级
 */
function planUpgrades(
  state: GameState,
  startAtp: number,
  strategy: 'highest-first' | 'lowest-first',
): { actions: BotAction[]; remainingAtp: number } {
  const simLevels = new Map<string, 1 | 2 | 3>(state.towers.map((t) => [t.id, t.level]));
  const actions: BotAction[] = [];
  let atp = startAtp;

  while (true) {
    const sorted = [...state.towers].sort((a, b) => {
      const al = simLevels.get(a.id) ?? a.level;
      const bl = simLevels.get(b.id) ?? b.level;
      return strategy === 'highest-first' ? bl - al : al - bl;
    });
    let upgraded = false;
    for (const t of sorted) {
      const simLevel = simLevels.get(t.id) ?? t.level;
      if (simLevel >= 3) continue;
      const lvl = TOWER_LEVELS[t.type][simLevel - 1];
      if (!lvl || lvl.upgradeCost === null) continue;
      if (atp < lvl.upgradeCost) continue;
      actions.push({ type: 'upgrade', towerId: t.id });
      atp -= lvl.upgradeCost;
      simLevels.set(t.id, (simLevel + 1) as 1 | 2 | 3);
      upgraded = true;
      break; // resort pick next best
    }
    if (!upgraded) break;
  }
  return { actions, remainingAtp: atp };
}

/** 扫下一波 composition 算飞行敌比例（0..1）；waveIndex 越界时返 0。 */
function flyingRatioOfWave(state: GameState): number {
  const level = getLevel(state.levelId);
  const wave = level.waves[state.waveIndex];
  if (!wave) return 0;
  let total = 0;
  let flying = 0;
  for (const spawn of wave.composition) {
    const def = PATHOGEN_DEFS[spawn.type];
    if (!def) continue;
    total += spawn.count;
    if (def.flying) flying += spawn.count;
  }
  return total === 0 ? 0 : flying / total;
}

/**
 * 贪心策略（medium baseline）：
 * 1. build 阶段尽量多放塔（能放就放），选 path-adjacency 覆盖最高的格子
 * 2. 剩余 ATP 足够时优先升级已有塔（从等级最低的塔开始）
 */
export const greedyBot: BotPolicy = {
  name: 'greedy',
  onBuildPhase(state, availableTowers) {
    const actions: BotAction[] = [];
    let simAtp = state.atp;
    const occupied = new Set<string>(state.towers.map((t) => `${t.col},${t.row}`));
    const planned: { col: number; row: number; range: number; type: TowerType }[] = [];
    const saveAtp = savingThreshold(state);
    const dotBaseline = avgDotOfWave(state);

    // 放塔：每轮重算候选（带 planned 让边际覆盖一路递减）+ 重选塔型
    for (let iter = 0; iter < 30; iter++) {
      const towerType = pickBestTower(
        { ...state, atp: simAtp },
        availableTowers,
        dotBaseline,
        planned,
      );
      if (!towerType) break;
      const def = TOWER_DEFS[towerType];
      if (!def) break;
      if (saveAtp > 0 && simAtp - def.cost < saveAtp) break; // 储蓄
      const lv1 = TOWER_LEVELS[towerType][0];
      if (!lv1) break;
      const candidates = findPlacementCandidates(state, lv1.range, occupied, planned);
      const best = candidates[0];
      if (!best) break;
      actions.push({ type: 'place', col: best.col, row: best.row, towerType });
      occupied.add(`${best.col},${best.row}`);
      planned.push({ col: best.col, row: best.row, range: lv1.range, type: towerType });
      simAtp -= def.cost;
    }

    // 升级：均衡策略（lowest-first），循环升到 ATP 不够
    const up = planUpgrades(state, simAtp, 'lowest-first');
    actions.push(...up.actions);
    simAtp = up.remainingAtp;
    return actions;
  },
};

/**
 * 弱鸡 Bot：模拟新手玩家。
 * - 仅花 60% ATP 放塔（剩下的不会花）
 * - 从不升级
 * - 从候选里取「次优」位置（rank=1），拉低命中效率
 */
export const weakBot: BotPolicy = {
  name: 'weak',
  onBuildPhase(state, availableTowers) {
    const actions: BotAction[] = [];
    const budget = Math.floor(state.atp * 0.6);
    let simAtp = state.atp;
    const atpFloor = state.atp - budget; // 保留不动
    const occupied = new Set<string>(state.towers.map((t) => `${t.col},${t.row}`));

    const plannedW: { col: number; row: number; range: number; type: TowerType }[] = [];
    for (let iter = 0; iter < 20; iter++) {
      const towerType = pickBestTower(
        { ...state, atp: simAtp },
        availableTowers,
        undefined,
        plannedW,
      );
      if (!towerType) break;
      const def = TOWER_DEFS[towerType];
      if (!def) break;
      if (simAtp - def.cost < atpFloor) break; // 预算耗尽
      const lv1 = TOWER_LEVELS[towerType][0];
      if (!lv1) break;
      const candidates = findPlacementCandidates(state, lv1.range, occupied, plannedW);
      // 次优（若只有 1 个候选则取它）
      const pick = candidates[1] ?? candidates[0];
      if (!pick) break;
      actions.push({ type: 'place', col: pick.col, row: pick.row, towerType });
      occupied.add(`${pick.col},${pick.row}`);
      plannedW.push({ col: pick.col, row: pick.row, range: lv1.range, type: towerType });
      simAtp -= def.cost;
    }
    return actions;
  },
};

/**
 * 进阶 Bot：感知下波 composition + 优先升级 + 会用 helper。
 * - 若下波飞行占比 >30%，优先选 canTargetFlying 塔
 * - 先把最高等级塔升满（集中火力）再放新塔
 * - 已有 ≥2 个 attack 塔时，若可用 dendritic 则放一个 helper 在塔群中心
 */
export const strongBot: BotPolicy = {
  name: 'strong',
  onBuildPhase(state, availableTowers) {
    const actions: BotAction[] = [];
    let simAtp = state.atp;
    const occupied = new Set<string>(state.towers.map((t) => `${t.col},${t.row}`));

    // 1. 升级决策：基础防御够了 + 下波 DPS 不缺时才升级
    // 供不应求时（gap > 0）优先铺塔扩 DPS；供过于求时升级强化现有塔
    const forecast = forecastWaveDemand(state);
    const shouldUpgrade = state.towers.length >= 3 && forecast.gap <= 0;
    if (shouldUpgrade) {
      const up = planUpgrades(state, simAtp, 'highest-first');
      actions.push(...up.actions);
      simAtp = up.remainingAtp;
    }

    // 2. 飞行占比感知：>30% 则偏好可打空塔
    const flyingRatio = flyingRatioOfWave(state);
    const towerFilter =
      flyingRatio > 0.3
        ? (t: TowerType) => (TOWER_DEFS[t]?.canTargetFlying ?? true) !== false
        : () => true;
    const dotBaseline = avgDotOfWave(state);
    const saveAtp = savingThreshold(state);

    // 3. 放塔：偏向飞行适配 + 储蓄 + 边际覆盖
    const plannedS: { col: number; row: number; range: number; type: TowerType }[] = [];
    for (let iter = 0; iter < 30; iter++) {
      const counter = (t: TowerType): number => countExistingType(state, plannedS, t);
      const towerType =
        pickTowerByRank(simAtp, availableTowers, 0, dotBaseline, towerFilter, counter) ??
        pickBestTower({ ...state, atp: simAtp }, availableTowers, dotBaseline, plannedS);
      if (!towerType) break;
      const def = TOWER_DEFS[towerType];
      if (!def) break;
      if (saveAtp > 0 && simAtp - def.cost < saveAtp) break;
      const lv1 = TOWER_LEVELS[towerType][0];
      if (!lv1) break;
      const candidates = findPlacementCandidates(state, lv1.range, occupied, plannedS);
      const best = candidates[0];
      if (!best) break;
      actions.push({ type: 'place', col: best.col, row: best.row, towerType });
      occupied.add(`${best.col},${best.row}`);
      plannedS.push({ col: best.col, row: best.row, range: lv1.range, type: towerType });
      simAtp -= def.cost;
    }

    // 4. helper 放置：attack 塔 ≥ 2 且可用 dendritic 且够 ATP
    const canUseDendritic = availableTowers.includes('dendritic');
    const attackCount =
      state.towers.filter((t) => isAttackTower(t.type)).length +
      actions.filter((a) => a.type === 'place' && a.towerType !== 'dendritic').length;
    const dendriticDef = TOWER_DEFS.dendritic;
    if (canUseDendritic && attackCount >= 2 && dendriticDef && simAtp >= dendriticDef.cost) {
      const dendriticLv1 = TOWER_LEVELS.dendritic[0];
      if (dendriticLv1) {
        const candidates = findPlacementCandidates(state, dendriticLv1.range, occupied);
        const best = candidates[0];
        if (best) {
          actions.push({ type: 'place', col: best.col, row: best.row, towerType: 'dendritic' });
        }
      }
    }
    return actions;
  },
};

/**
 * 守门 Bot：人类玩家最常用的朴素策略 —— 扎堆 exit / 保护细胞周围。
 * 核心思路：
 * 1. 所有 goal（exits + protectedCells coords）视为漏斗，围绕它们放塔
 * 2. 候选格按「到最近 goal 的距离」升序 → 越近越优；同距离按 path 覆盖度次优
 * 3. 优先把现有塔一路升到 Lv3（少而精，堆 DPS 在门口）
 */
export const exitGuardBot: BotPolicy = {
  name: 'guard',
  onBuildPhase(state, availableTowers) {
    const actions: BotAction[] = [];
    let simAtp = state.atp;
    const occupied = new Set<string>(state.towers.map((t) => `${t.col},${t.row}`));

    const goals: readonly { col: number; row: number }[] = [
      ...state.exits,
      ...state.protectedCells.map((pc) => pc.coord),
    ];
    const distToNearestGoal = (c: number, r: number): number => {
      let min = Number.POSITIVE_INFINITY;
      for (const g of goals) {
        const d = Math.max(Math.abs(c - g.col), Math.abs(r - g.row));
        if (d < min) min = d;
      }
      return min;
    };

    // 1. 先把现有塔升到 ATP 上限（highest-first 集火），连升 Lv1→Lv3 可行
    const up = planUpgrades(state, simAtp, 'highest-first');
    actions.push(...up.actions);
    simAtp = up.remainingAtp;

    const dotBaseline = avgDotOfWave(state);
    const saveAtp = savingThreshold(state);
    const plannedG: { col: number; row: number; range: number; type: TowerType }[] = [];

    // 2. 放新塔：候选按「距 goal 最近」+ 次优按 path 覆盖 + 边际递减
    for (let iter = 0; iter < 30; iter++) {
      const towerType = pickBestTower(
        { ...state, atp: simAtp },
        availableTowers,
        dotBaseline,
        plannedG,
      );
      if (!towerType) break;
      const def = TOWER_DEFS[towerType];
      if (!def) break;
      if (saveAtp > 0 && simAtp - def.cost < saveAtp) break; // 储蓄
      const lv1 = TOWER_LEVELS[towerType][0];
      if (!lv1) break;

      // 扫候选：合法 + 离 goal ≤ ceil(range) + 1
      const allCandidates = findPlacementCandidates(state, lv1.range, occupied, plannedG);
      if (allCandidates.length === 0) break;
      // 按 (distToGoal asc, pathScore desc) 排序
      const scored = allCandidates
        .map((c) => ({ ...c, goalDist: distToNearestGoal(c.col, c.row) }))
        .filter((c) => c.goalDist <= Math.ceil(lv1.range) + 1);
      const finalList =
        scored.length > 0
          ? scored
          : allCandidates.map((c) => ({ ...c, goalDist: distToNearestGoal(c.col, c.row) }));
      finalList.sort((a, b) => a.goalDist - b.goalDist || b.score - a.score);
      const pick = finalList[0];
      if (!pick) break;

      actions.push({ type: 'place', col: pick.col, row: pick.row, towerType });
      occupied.add(`${pick.col},${pick.row}`);
      plannedG.push({ col: pick.col, row: pick.row, range: lv1.range, type: towerType });
      simAtp -= def.cost;
    }
    return actions;
  },
};

/** 方便外部引用：所有内置 bot */
export const ALL_BOTS: readonly BotPolicy[] = [weakBot, greedyBot, strongBot, exitGuardBot];

// ---------- 核心 sim ----------

function makeNextId(): NextIdFn {
  let counter = 0;
  return (prefix) => `${prefix}${counter++}`;
}

function executeBotActions(
  state: GameState,
  actions: readonly BotAction[],
  nextId: NextIdFn,
): { state: GameState; placed: number; upgraded: number } {
  let cur = state;
  let placed = 0;
  let upgraded = 0;
  for (const a of actions) {
    if (a.type === 'place' && a.col !== undefined && a.row !== undefined && a.towerType) {
      const r = placeTower(cur, a.col, a.row, a.towerType, nextId);
      if (r.ok) {
        cur = r.state;
        placed++;
      }
    } else if (a.type === 'upgrade' && a.towerId) {
      const r = upgradeTower(cur, a.towerId);
      if (r.ok) {
        cur = r.state;
        upgraded++;
      }
    }
  }
  return { state: cur, placed, upgraded };
}

export interface SimulateOptions {
  maxTicks?: number;
  dtMs?: number;
  availableTowers?: readonly TowerType[];
  /**
   * dt 抖动：每 tick 在 [min, max] 内随机取 dt（模拟浏览器帧率波动）。
   * seed 独立于 engine rng，不影响 game state 随机性；缺省时从 run seed 派生。
   */
  dtJitter?: { min: number; max: number; seed?: number };
  /**
   * 研究 modifier（Phase 5）。simulator 默认走 ZERO（balance-baseline 用），
   * 可显式传入做"全 buff"sanity 测试，验证研究不让游戏崩坏。
   */
  modifiers?: import('./registry/research-modifiers').ResearchModifierState;
}

/**
 * 单次模拟：跑完整个关卡，返回 run result。
 */
export function simulateRun(
  levelId: number,
  policy: BotPolicy,
  seed: number,
  options: SimulateOptions = {},
): SimRunResult {
  const maxTicks = options.maxTicks ?? 60_000;
  const fixedDt = options.dtMs ?? 16;
  const jitter = options.dtJitter;
  const dtRng = jitter ? createRng((jitter.seed ?? seed + 0xbada55) >>> 0).next : null;
  const level = getLevel(levelId);
  const availableTowers = options.availableTowers ?? level.unlockTowers;

  const nextId = makeNextId();
  let state: GameState = createInitialState(levelId, seed, options.modifiers);
  state = { ...state, running: true };

  let placedTotal = 0;
  let upgradedTotal = 0;
  let towerDeaths = 0;
  let leakedTotal = 0;
  let ticksElapsed = 0;
  const waveSnapshots: WaveSnapshot[] = [];
  let waveLeakAccum = 0;
  let waveKillAccum = 0;
  let lastWaveEnded = -1;

  while (ticksElapsed < maxTicks) {
    if (state.phase === 'complete' || state.phase === 'failed') break;

    // build 阶段：让 bot 动作后立即 startWave（跳过倒计时）
    if (state.phase === 'build') {
      const actions = policy.onBuildPhase(state, availableTowers);
      const execResult = executeBotActions(state, actions, nextId);
      placedTotal += execResult.placed;
      upgradedTotal += execResult.upgraded;
      state = execResult.state;
      const startResult: TickResult = startWave(state);
      state = startResult.state;
    }

    const dt = dtRng && jitter ? jitter.min + dtRng() * (jitter.max - jitter.min) : fixedDt;
    const r = tick(state, dt, nextId);
    state = r.state;
    ticksElapsed++;

    for (const ev of r.events) {
      collectEventStats(ev);
    }
  }

  // 把最后一波快照补上（若没收到 WAVE_ENDED，比如 lost 中）
  if (lastWaveEnded !== state.waveIndex) {
    waveSnapshots.push({
      waveIndex: state.waveIndex,
      hpAfter: state.hp,
      atpAfter: state.atp,
      leakedInWave: waveLeakAccum,
      killsInWave: waveKillAccum,
    });
  }

  const outcome: SimOutcome =
    state.phase === 'complete' ? 'won' : state.phase === 'failed' ? 'lost' : 'timeout';

  return {
    outcome,
    seed,
    stars: state.stageResult?.stars ?? 0,
    hpRemaining: state.hp,
    atpRemaining: state.atp,
    leaked: leakedTotal,
    waveReached: state.waveIndex + 1,
    towerDeaths,
    towersPlaced: placedTotal,
    towersUpgraded: upgradedTotal,
    ticksElapsed,
    waveSnapshots,
  };

  function collectEventStats(ev: GameEvent): void {
    switch (ev.type) {
      case 'CORE_DAMAGED':
        leakedTotal++;
        waveLeakAccum++;
        break;
      case 'PATHOGEN_KILLED':
        waveKillAccum++;
        break;
      case 'TOWER_DESTROYED':
        towerDeaths++;
        break;
      case 'WAVE_ENDED':
        waveSnapshots.push({
          waveIndex: ev.waveIndex,
          hpAfter: state.hp,
          atpAfter: state.atp,
          leakedInWave: waveLeakAccum,
          killsInWave: waveKillAccum,
        });
        waveLeakAccum = 0;
        waveKillAccum = 0;
        lastWaveEnded = ev.waveIndex;
        break;
    }
  }
}

/**
 * 批量模拟：给定种子集（默认 20 个），输出 BalanceReport。
 */
export function estimateDifficulty(
  levelId: number,
  options: {
    policy?: BotPolicy;
    seeds?: readonly number[];
    runs?: number;
    maxTicks?: number;
    availableTowers?: readonly TowerType[];
    dtJitter?: SimulateOptions['dtJitter'];
    modifiers?: SimulateOptions['modifiers'];
  } = {},
): BalanceReport {
  const policy = options.policy ?? greedyBot;
  const seeds = options.seeds ?? Array.from({ length: options.runs ?? 20 }, (_, i) => i + 1);

  const samples: SimRunResult[] = [];
  const outcomes = { won: 0, lost: 0, timeout: 0 };
  for (const seed of seeds) {
    const runOpts: SimulateOptions = {};
    if (options.maxTicks !== undefined) runOpts.maxTicks = options.maxTicks;
    if (options.availableTowers !== undefined) runOpts.availableTowers = options.availableTowers;
    if (options.dtJitter !== undefined) runOpts.dtJitter = options.dtJitter;
    if (options.modifiers !== undefined) runOpts.modifiers = options.modifiers;
    const r = simulateRun(levelId, policy, seed, runOpts);
    samples.push(r);
    outcomes[r.outcome]++;
  }
  const n = samples.length || 1;
  const sum = (f: (s: SimRunResult) => number) => samples.reduce((acc, s) => acc + f(s), 0);

  // per-wave 聚合
  const maxWaves = samples.reduce((m, s) => Math.max(m, s.waveSnapshots.length), 0);
  const perWaveAvgLeak: number[] = Array.from({ length: maxWaves }, (_, i) => {
    let count = 0;
    let total = 0;
    for (const s of samples) {
      const snap = s.waveSnapshots[i];
      if (!snap) continue;
      total += snap.leakedInWave;
      count++;
    }
    return count === 0 ? 0 : total / count;
  });

  return {
    levelId,
    runs: n,
    winRate: outcomes.won / n,
    avgStars: sum((s) => s.stars) / n,
    avgHpRemaining: sum((s) => s.hpRemaining) / n,
    avgLeaked: sum((s) => s.leaked) / n,
    avgTowerDeaths: sum((s) => s.towerDeaths) / n,
    perWaveAvgLeak,
    outcomes,
    samples,
  };
}
