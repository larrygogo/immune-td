import { describe, expect, test } from 'vitest';
import { isSyncableEqual, mergeRemoteIntoLocal } from '@ui/progressSync/merge';
import type { SyncableProgress } from '@ui/progressSync/types';

function base(overrides: Partial<SyncableProgress> = {}): SyncableProgress {
  return {
    unlockedLevels: [0, 1],
    unlockedTowers: ['macrophage'],
    stars: {},
    eliteStars: {},
    loadout: [],
    seenMechanics: [],
    researchPoints: 0,
    unlockedResearch: [],
    researchResetCount: 0,
    tutorialStep: 0,
    credits: 0,
    unlockedSkins: {},
    equippedSkins: {},
    ...overrides,
  };
}

describe('progressSync merge rules', () => {
  test('unlockedLevels 取并集并排序', () => {
    const remote = base({ unlockedLevels: [0, 1, 2, 5] });
    const local = base({ unlockedLevels: [0, 1, 3, 4] });
    const merged = mergeRemoteIntoLocal(remote, local);
    expect(merged.unlockedLevels).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test('unlockedTowers 取并集（保留插入顺序）', () => {
    const remote = base({ unlockedTowers: ['macrophage', 'nkcell'] });
    const local = base({ unlockedTowers: ['macrophage', 'neutrophil'] });
    const merged = mergeRemoteIntoLocal(remote, local);
    expect(merged.unlockedTowers).toEqual(['macrophage', 'nkcell', 'neutrophil']);
  });

  test('stars 每关 key 取 max', () => {
    const remote = base({ stars: { 1: 2, 2: 3 } });
    const local = base({ stars: { 1: 3, 3: 1 } });
    const merged = mergeRemoteIntoLocal(remote, local);
    expect(merged.stars).toEqual({ 1: 3, 2: 3, 3: 1 });
  });

  test('eliteStars 每关 key 取 max（与 stars 同语义）', () => {
    const remote = base({ eliteStars: { 1: 1, 5: 3 } });
    const local = base({ eliteStars: { 1: 2, 2: 1 } });
    const merged = mergeRemoteIntoLocal(remote, local);
    expect(merged.eliteStars).toEqual({ 1: 2, 2: 1, 5: 3 });
  });

  test('loadout 本地覆盖远端', () => {
    const remote = base({ loadout: ['nkcell'] });
    const local = base({ loadout: ['macrophage', 'neutrophil'] });
    const merged = mergeRemoteIntoLocal(remote, local);
    expect(merged.loadout).toEqual(['macrophage', 'neutrophil']);
  });

  test('loadout 本地为空也覆盖（远端不泄漏）', () => {
    const remote = base({ loadout: ['nkcell'] });
    const local = base({ loadout: [] });
    const merged = mergeRemoteIntoLocal(remote, local);
    expect(merged.loadout).toEqual([]);
  });

  test('seenMechanics 并集', () => {
    const remote = base({ seenMechanics: ['tower-hp', 'no-build-zone'] });
    const local = base({ seenMechanics: ['tower-hp', 'multi-entry'] });
    const merged = mergeRemoteIntoLocal(remote, local);
    expect(new Set(merged.seenMechanics)).toEqual(
      new Set(['tower-hp', 'no-build-zone', 'multi-entry']),
    );
  });

  test('researchPoints 取 max', () => {
    const merged = mergeRemoteIntoLocal(
      base({ researchPoints: 50 }),
      base({ researchPoints: 120 }),
    );
    expect(merged.researchPoints).toBe(120);
  });

  test('unlockedResearch 并集', () => {
    const remote = base({ unlockedResearch: ['r1', 'r2'] });
    const local = base({ unlockedResearch: ['r2', 'r3'] });
    const merged = mergeRemoteIntoLocal(remote, local);
    expect(new Set(merged.unlockedResearch)).toEqual(new Set(['r1', 'r2', 'r3']));
  });

  test('tutorialStep：-1 优先', () => {
    expect(
      mergeRemoteIntoLocal(base({ tutorialStep: -1 }), base({ tutorialStep: 3 })).tutorialStep,
    ).toBe(-1);
    expect(
      mergeRemoteIntoLocal(base({ tutorialStep: 3 }), base({ tutorialStep: -1 })).tutorialStep,
    ).toBe(-1);
  });

  test('tutorialStep：都非 -1 取 max', () => {
    expect(
      mergeRemoteIntoLocal(base({ tutorialStep: 2 }), base({ tutorialStep: 5 })).tutorialStep,
    ).toBe(5);
    expect(
      mergeRemoteIntoLocal(base({ tutorialStep: 0 }), base({ tutorialStep: 0 })).tutorialStep,
    ).toBe(0);
  });

  test('组合：多字段同时合并', () => {
    const remote = base({
      unlockedLevels: [0, 1, 2, 3, 4, 5],
      stars: { 1: 3, 2: 2, 3: 2 },
      unlockedTowers: ['macrophage', 'neutrophil'],
      tutorialStep: -1,
    });
    const local = base({
      unlockedLevels: [0, 1, 3, 6, 7, 8],
      stars: { 3: 3, 6: 1 },
      unlockedTowers: ['macrophage', 'nkcell'],
      loadout: ['macrophage', 'nkcell'],
      tutorialStep: 4,
    });
    const merged = mergeRemoteIntoLocal(remote, local);
    expect(merged.unlockedLevels).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(merged.stars).toEqual({ 1: 3, 2: 2, 3: 3, 6: 1 });
    expect(new Set(merged.unlockedTowers)).toEqual(new Set(['macrophage', 'neutrophil', 'nkcell']));
    expect(merged.loadout).toEqual(['macrophage', 'nkcell']);
    expect(merged.tutorialStep).toBe(-1);
  });

  test('不变性：remote / local 输入未被修改', () => {
    const remote = base({ unlockedLevels: [0, 1, 2], stars: { 1: 2 } });
    const local = base({ unlockedLevels: [0, 3], stars: { 1: 3 } });
    const remoteSnapshot = JSON.stringify(remote);
    const localSnapshot = JSON.stringify(local);
    mergeRemoteIntoLocal(remote, local);
    expect(JSON.stringify(remote)).toBe(remoteSnapshot);
    expect(JSON.stringify(local)).toBe(localSnapshot);
  });
});

describe('isSyncableEqual', () => {
  test('结构相同 → true', () => {
    expect(isSyncableEqual(base(), base())).toBe(true);
  });

  test('任一字段不同 → false', () => {
    expect(isSyncableEqual(base(), base({ researchPoints: 1 }))).toBe(false);
    expect(
      isSyncableEqual(base({ unlockedLevels: [0, 1] }), base({ unlockedLevels: [0, 2] })),
    ).toBe(false);
  });
});
