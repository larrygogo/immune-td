import type { MetaState } from '@ui/store';
import type { SyncableProgress } from './types';

/** 从 metaStore 当前 state 提取同步字段子集（settings 等被排除） */
export function extractSyncable(state: MetaState): SyncableProgress {
  return {
    unlockedLevels: [...state.unlockedLevels],
    unlockedTowers: [...state.unlockedTowers],
    stars: { ...state.stars },
    eliteStars: { ...state.eliteStars },
    loadout: [...state.loadout],
    seenMechanics: [...state.seenMechanics],
    researchPoints: state.researchPoints,
    unlockedResearch: [...state.unlockedResearch],
    researchResetCount: state.researchResetCount,
    tutorialStep: state.tutorialStep,
    credits: state.credits,
    unlockedSkins: { ...state.unlockedSkins },
    equippedSkins: { ...state.equippedSkins },
  };
}

/**
 * 判断两个 metaStore state 在同步字段上是否变化。
 * zustand 的 set 产生新引用，浅比较足够识别真实变更；settings 变更不触发。
 */
export function syncableChanged(a: MetaState, b: MetaState): boolean {
  return (
    a.unlockedLevels !== b.unlockedLevels ||
    a.unlockedTowers !== b.unlockedTowers ||
    a.stars !== b.stars ||
    a.eliteStars !== b.eliteStars ||
    a.loadout !== b.loadout ||
    a.seenMechanics !== b.seenMechanics ||
    a.researchPoints !== b.researchPoints ||
    a.unlockedResearch !== b.unlockedResearch ||
    a.researchResetCount !== b.researchResetCount ||
    a.tutorialStep !== b.tutorialStep ||
    a.credits !== b.credits ||
    a.unlockedSkins !== b.unlockedSkins ||
    a.equippedSkins !== b.equippedSkins
  );
}
