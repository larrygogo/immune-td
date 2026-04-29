import type { TowerType } from '@engine/game/entities';
import type { SyncableProgress } from './types';

function uniqueArray<T>(a: readonly T[], b: readonly T[]): T[] {
  return Array.from(new Set<T>([...a, ...b]));
}

/** 每塔皮肤 id 列表合并（并集，保留两端解锁记录）。Partial Record 支持。 */
function mergeUnlockedSkins(
  a: Partial<Record<TowerType, string[]>>,
  b: Partial<Record<TowerType, string[]>>,
): Partial<Record<TowerType, string[]>> {
  const out: Partial<Record<TowerType, string[]>> = {};
  const allTypes = new Set([
    ...Object.keys(a ?? {}),
    ...Object.keys(b ?? {}),
  ]) as Set<TowerType>;
  // biome-ignore lint/complexity/noForEach: wx babel _createForOfIteratorHelper 对 Set iterator 报 non-iterable
  allTypes.forEach((t) => {
    const av = a[t] ?? [];
    const bv = b[t] ?? [];
    out[t] = uniqueArray(av, bv);
  });
  return out;
}

function mergeStars(
  a: Record<number, 1 | 2 | 3>,
  b: Record<number, 1 | 2 | 3>,
): Record<number, 1 | 2 | 3> {
  const out: Record<number, 1 | 2 | 3> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const lvl = Number(k);
    const prev = out[lvl] ?? 0;
    if (v > prev) out[lvl] = v;
  }
  return out;
}

function mergeTutorialStep(a: number, b: number): number {
  if (a === -1 || b === -1) return -1;
  return Math.max(a, b);
}

/**
 * 合并远端 + 本地进度。规则：
 * - 数组类（unlockedLevels / unlockedTowers / seenMechanics / unlockedResearch）取并集
 * - stars：每关 key 取 max
 * - researchPoints：max
 * - researchResetCount：max（重置次数累加保留较多者）
 * - tutorialStep：-1（已完成）优先，否则 max
 * - loadout：本地覆盖（玩家当前偏好比历史偏好更准）
 */
export function mergeRemoteIntoLocal(
  remote: SyncableProgress,
  local: SyncableProgress,
): SyncableProgress {
  return {
    unlockedLevels: uniqueArray(remote.unlockedLevels, local.unlockedLevels).sort((a, b) => a - b),
    unlockedTowers: uniqueArray(remote.unlockedTowers, local.unlockedTowers),
    stars: mergeStars(remote.stars, local.stars),
    eliteStars: mergeStars(remote.eliteStars, local.eliteStars),
    loadout: [...local.loadout],
    seenMechanics: uniqueArray(remote.seenMechanics, local.seenMechanics),
    researchPoints: Math.max(remote.researchPoints, local.researchPoints),
    unlockedResearch: uniqueArray(remote.unlockedResearch, local.unlockedResearch),
    researchResetCount: Math.max(remote.researchResetCount, local.researchResetCount),
    tutorialStep: mergeTutorialStep(remote.tutorialStep, local.tutorialStep),
    // 商城：credits max（防本地误清零）；unlockedSkins 数组并集；equippedSkins 本地优先
    credits: Math.max(remote.credits, local.credits),
    unlockedSkins: mergeUnlockedSkins(remote.unlockedSkins, local.unlockedSkins),
    equippedSkins: { ...local.equippedSkins },
  };
}

/** 比较两个 progress 是否等价（决定合并后是否需要 PUT）。字段顺序在 type 里固定，stringify 够用。 */
export function isSyncableEqual(a: SyncableProgress, b: SyncableProgress): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
