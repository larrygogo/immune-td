import type { PathogenType } from '../entities';

/**
 * Pathogen modifier 系统（Phase ·正交化 2026-04-26）：
 * 5 种 modifier 与基础 PathogenType 笛卡尔积，让同种敌人通过 modifier 组合产生不同战术。
 * - flying: 走直线无视寻路（已有，迁移到 modifier 系统）
 * - camouflaged: 大部分塔不可见，仅 dendritic 范围内的可被打到
 * - regrow: 每秒回 hp 5（cap maxHp）
 * - encapsulated: 单体伤害打 0.3，AoE 不打折
 * - fortified: maxHp ×2 + coreDamage ×2
 *
 * 互不互斥：所有组合合法，按字段独立运算。
 */
export type PathogenModifier = 'flying' | 'camouflaged' | 'regrow' | 'encapsulated' | 'fortified';

/** Spawn 队列项：spawn 时确定 type + 当前 wave 透过来的 modifiers（默认空数组） */
export interface SpawnQueueItem {
  type: PathogenType;
  modifiers: readonly PathogenModifier[];
}

export interface WaveSpawn {
  type: PathogenType;
  count: number;
  /** 该 spawn 段的 pathogen 显式 modifiers；最终生效 = registry.defaultModifiers ∪ 此处去重 */
  modifiers?: readonly PathogenModifier[];
}

export interface WaveConfig {
  composition: readonly WaveSpawn[];
  intervalMs: number;
  hpMultiplier: number;
  /** 总数量随机浮动范围：实际总数 = sum(composition) ± countVariance */
  countVariance?: number;
  /** 随机填充的敌人类型池（当 countVariance > 0 时用于增量填充） */
  typePool?: readonly PathogenType[];
}

export const INITIAL_BUILD_MS = 15000;
export const INTER_WAVE_BUILD_MS = 10000;

/**
 * 将 composition 按 round-robin 展开成生成队列：
 *   [{A:3}, {B:2}] → [A, B, A, B, A]
 * 优先次序按传入顺序；某类型用完后继续消费剩余类型。
 * 每个队列项带上 spawn 时的 modifiers（默认空数组），spawn 时透传给 createPathogen。
 */
export function expandComposition(composition: readonly WaveSpawn[]): SpawnQueueItem[] {
  const remaining: { type: PathogenType; count: number; modifiers: readonly PathogenModifier[] }[] =
    composition.map((s) => ({
      type: s.type,
      count: s.count,
      modifiers: s.modifiers ?? [],
    }));
  const queue: SpawnQueueItem[] = [];
  let hasMore = true;
  while (hasMore) {
    hasMore = false;
    for (const entry of remaining) {
      if (entry.count > 0) {
        queue.push({ type: entry.type, modifiers: entry.modifiers });
        entry.count -= 1;
        hasMore = true;
      }
    }
  }
  return queue;
}

/**
 * 带随机化的波次展开：在 expandComposition 基础上随机增减 countVariance 只，
 * 增量部分从 typePool 中随机选取；typePool 为空时不增加。
 * 增量项 modifiers = []（typePool 不带 modifier，简化）
 */
export function expandCompositionRandom(wave: WaveConfig, rng: () => number): SpawnQueueItem[] {
  const base = expandComposition(wave.composition);
  if (!wave.countVariance || wave.countVariance <= 0) return base;

  const variance = Math.floor(rng() * (wave.countVariance * 2 + 1)) - wave.countVariance;
  const target = Math.max(1, base.length + variance);

  if (target === base.length) return base;

  if (target < base.length) {
    // 随机删减：保留前 target 个（已是 round-robin 顺序，均匀删末尾）
    return base.slice(0, target);
  }

  // 随机增加：从 typePool 填充（增量不带 modifier）
  const pool = wave.typePool;
  if (!pool || pool.length === 0) return base;
  const extra: SpawnQueueItem[] = [];
  for (let i = base.length; i < target; i++) {
    const t = pool[Math.floor(rng() * pool.length)] as PathogenType;
    extra.push({ type: t, modifiers: [] });
  }
  // 将额外敌人均匀插入队列
  const merged: SpawnQueueItem[] = [...base];
  for (const t of extra) {
    const pos = Math.floor(rng() * (merged.length + 1));
    merged.splice(pos, 0, t);
  }
  return merged;
}
