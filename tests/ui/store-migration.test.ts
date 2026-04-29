import { migrateMetaState } from '@ui/store';
import { describe, expect, it } from 'vitest';

describe('metaStore migrateMetaState v3 → v4', () => {
  it('v3 持久化状态升级后：解锁 / 塔 / tutorial 重置；schemaVersion=4；freshlyMigrated=true；stars 保留', () => {
    const persistedV3 = {
      unlockedLevels: [0, 1, 2, 3, 4, 5],
      unlockedTowers: ['macrophage', 'neutrophil', 'nkcell'],
      tutorialStep: -1,
      stars: { 1: 3, 2: 2 },
      researchPoints: 12,
      unlockedResearch: ['atp-boost'],
      freshlyMigrated: false,
    };

    const migrated = migrateMetaState(persistedV3, 3);

    expect(migrated.unlockedLevels).toEqual([0, 1]);
    expect(migrated.unlockedTowers).toEqual(['macrophage']);
    expect(migrated.tutorialStep).toBe(0);
    expect(migrated.freshlyMigrated).toBe(true);
    expect(migrated.schemaVersion).toBe(13);
    expect(migrated.stars).toEqual({ 1: 3, 2: 2 });
  });

  it('v3 → v4：stars 字段原样保留', () => {
    const persistedV3 = {
      unlockedLevels: [0, 1, 2],
      unlockedTowers: ['macrophage', 'neutrophil'],
      tutorialStep: -1,
      stars: { 1: 3, 2: 2 },
    };

    const migrated = migrateMetaState(persistedV3, 3);

    expect(migrated.stars).toEqual({ 1: 3, 2: 2 });
  });

  it('v3 → v4：settings 字段原样保留', () => {
    const settings = {
      masterVolume: 0.5,
      sfxVolume: 0.3,
      bgmVolume: 0.4,
      graphics: 'medium' as const,
      muted: true,
    };
    const persistedV3 = {
      unlockedLevels: [0, 1, 2],
      unlockedTowers: ['macrophage'],
      tutorialStep: 0,
      stars: {},
      settings,
      researchPoints: 7,
    };

    const migrated = migrateMetaState(persistedV3, 3);

    expect(migrated.settings).toEqual(settings);
    expect(migrated.researchPoints).toBe(7);
  });

  it('version=4 已是当前版本：不再触发 v3→v4 重置；freshlyMigrated 保留传入值', () => {
    const persistedV4 = {
      schemaVersion: 4 as const,
      unlockedLevels: [0, 1, 2, 3],
      unlockedTowers: ['macrophage', 'neutrophil'] as const,
      tutorialStep: -1,
      stars: { 1: 3, 2: 1 },
      researchPoints: 4,
      freshlyMigrated: false,
    };

    const migrated = migrateMetaState(persistedV4, 4);

    expect(migrated.unlockedLevels).toEqual([0, 1, 2, 3]);
    expect(migrated.unlockedTowers).toEqual(['macrophage', 'neutrophil']);
    expect(migrated.tutorialStep).toBe(-1);
    expect(migrated.freshlyMigrated).toBe(false);
    expect(migrated.schemaVersion).toBe(13);
    expect(migrated.stars).toEqual({ 1: 3, 2: 1 });
  });
});

describe('metaStore migrateMetaState v4 → v5', () => {
  it('v4 持久化状态升级后：seenMechanics 默认空数组；其它字段保留；schemaVersion=7（链式 migrate 到当前）', () => {
    const persistedV4 = {
      schemaVersion: 4 as const,
      unlockedLevels: [0, 1, 2, 3, 4, 5],
      unlockedTowers: ['macrophage', 'neutrophil', 'nkcell'],
      tutorialStep: -1,
      stars: { 1: 3, 2: 2, 3: 1 },
      researchPoints: 9,
      unlockedResearch: ['atp-boost'],
      settings: {
        masterVolume: 0.7,
        sfxVolume: 0.9,
        bgmVolume: 0.5,
        graphics: 'high' as const,
        muted: false,
      },
      freshlyMigrated: false,
    };

    const migrated = migrateMetaState(persistedV4, 4);

    expect(migrated.seenMechanics).toEqual([]);
    expect(migrated.schemaVersion).toBe(13);
    // 其它字段不被 v4→v5 改动
    expect(migrated.unlockedLevels).toEqual([0, 1, 2, 3, 4, 5]);
    expect(migrated.unlockedTowers).toEqual(['macrophage', 'neutrophil', 'nkcell']);
    expect(migrated.tutorialStep).toBe(-1);
    expect(migrated.stars).toEqual({ 1: 3, 2: 2, 3: 1 });
    expect(migrated.researchPoints).toBe(9);
    // 链式 migrate 经过后续 step 会 backfill defaultUnlockedResearch（mac-lv2 默认解锁）
    expect(migrated.unlockedResearch).toEqual(expect.arrayContaining(['atp-boost']));
    expect(migrated.freshlyMigrated).toBe(false);
  });

  it('version=5：已有 seenMechanics 不被覆盖；链式补 loadout=[] + ownerUserId=null 升到 v7', () => {
    const persistedV5 = {
      schemaVersion: 5 as const,
      unlockedLevels: [0, 1, 2],
      unlockedTowers: ['macrophage', 'neutrophil'],
      tutorialStep: -1,
      stars: { 1: 3 },
      researchPoints: 0,
      freshlyMigrated: false,
      seenMechanics: ['tower-hp', 'no-build-zone'] as const,
    };

    const migrated = migrateMetaState(persistedV5, 5);

    expect(migrated.seenMechanics).toEqual(['tower-hp', 'no-build-zone']);
    expect(migrated.schemaVersion).toBe(13);
    expect(migrated.loadout).toEqual([]);
  });
});

describe('metaStore migrateMetaState v5 → v6', () => {
  it('v5 持久化状态升级后：loadout 默认空数组；其它字段保留；schemaVersion=7', () => {
    const persistedV5 = {
      schemaVersion: 5 as const,
      unlockedLevels: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      unlockedTowers: ['macrophage', 'neutrophil', 'nkcell', 'dendritic'],
      tutorialStep: -1,
      stars: { 1: 3, 2: 2 },
      researchPoints: 5,
      unlockedResearch: [],
      seenMechanics: ['tower-hp', 'no-build-zone'],
      freshlyMigrated: false,
    };

    const migrated = migrateMetaState(persistedV5, 5);

    expect(migrated.loadout).toEqual([]);
    expect(migrated.schemaVersion).toBe(13);
    // 其它字段不被 v5→v6 改动
    expect(migrated.unlockedLevels).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(migrated.unlockedTowers).toEqual(['macrophage', 'neutrophil', 'nkcell', 'dendritic']);
    expect(migrated.seenMechanics).toEqual(['tower-hp', 'no-build-zone']);
    expect(migrated.stars).toEqual({ 1: 3, 2: 2 });
  });

  it('version=6：已有 loadout 不被覆盖；链式补 ownerUserId=null 升到 v7', () => {
    const persistedV6 = {
      schemaVersion: 6 as const,
      unlockedLevels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      unlockedTowers: ['macrophage', 'neutrophil', 'nkcell', 'dendritic'],
      tutorialStep: -1,
      stars: {},
      researchPoints: 0,
      freshlyMigrated: false,
      seenMechanics: [],
      loadout: ['macrophage', 'neutrophil', 'dendritic'] as const,
    };

    const migrated = migrateMetaState(persistedV6, 6);

    expect(migrated.loadout).toEqual(['macrophage', 'neutrophil', 'dendritic']);
    expect(migrated.ownerUserId).toBeNull();
    expect(migrated.schemaVersion).toBe(13);
  });
});

describe('metaStore migrateMetaState v6 → v7', () => {
  it('v6 持久化状态升级后：ownerUserId 默认 null；其它字段保留；schemaVersion=7', () => {
    const persistedV6 = {
      schemaVersion: 6 as const,
      unlockedLevels: [0, 1, 2, 3, 4, 5, 6],
      unlockedTowers: ['macrophage', 'neutrophil', 'nkcell'],
      tutorialStep: -1,
      stars: { 1: 3, 2: 2 },
      researchPoints: 0,
      unlockedResearch: [],
      freshlyMigrated: false,
      seenMechanics: ['tower-hp'],
      loadout: ['macrophage'],
    };

    const migrated = migrateMetaState(persistedV6, 6);

    expect(migrated.ownerUserId).toBeNull();
    expect(migrated.schemaVersion).toBe(13);
    // 其它字段不被 v6→v7 改动
    expect(migrated.unlockedLevels).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(migrated.loadout).toEqual(['macrophage']);
    expect(migrated.seenMechanics).toEqual(['tower-hp']);
    expect(migrated.stars).toEqual({ 1: 3, 2: 2 });
  });

  it('version=7：已有 ownerUserId 数值不被覆盖', () => {
    const persistedV7 = {
      schemaVersion: 7 as const,
      unlockedLevels: [0, 1],
      unlockedTowers: ['macrophage'],
      tutorialStep: 0,
      stars: {},
      researchPoints: 0,
      unlockedResearch: [],
      freshlyMigrated: false,
      seenMechanics: [],
      loadout: [],
      ownerUserId: 42,
    };

    const migrated = migrateMetaState(persistedV7, 7);

    expect(migrated.ownerUserId).toBe(42);
    expect(migrated.schemaVersion).toBe(13);
  });
});

describe('metaStore migrateMetaState v10 → v11（Phase 3 研究树重做）', () => {
  it('旧 id upgrade-{type}-lv{N} 映射到新 id {prefix}-lv{N}', () => {
    const persistedV10 = {
      schemaVersion: 10 as const,
      unlockedLevels: [0, 1, 2, 3, 4, 5],
      unlockedTowers: ['macrophage', 'neutrophil', 'nkcell'],
      tutorialStep: -1,
      stars: { 1: 3, 2: 2 },
      researchPoints: 5,
      unlockedResearch: [
        'upgrade-macrophage-lv2',
        'upgrade-macrophage-lv3',
        'upgrade-neutrophil-lv2',
        'upgrade-nkcell-lv2',
      ],
      freshlyMigrated: false,
      seenMechanics: [],
      loadout: [],
      ownerUserId: null,
      tutorialCompleted: true,
    };

    const migrated = migrateMetaState(persistedV10, 10);

    expect(migrated.schemaVersion).toBe(13);
    expect(migrated.unlockedResearch).toEqual(
      expect.arrayContaining(['mac-lv2', 'mac-lv3', 'neu-lv2', 'nk-lv2']),
    );
    // 没出现旧 id 残留
    for (const id of migrated.unlockedResearch) {
      expect(id.startsWith('upgrade-')).toBe(false);
    }
    // RP 数量不退也不补
    expect(migrated.researchPoints).toBe(5);
    expect(migrated.researchResetCount).toBe(0);
  });

  it('researchResetCount 老存档默认 0', () => {
    const persistedV10 = {
      schemaVersion: 10 as const,
      unlockedLevels: [0, 1],
      unlockedTowers: ['macrophage'],
      tutorialStep: 0,
      stars: {},
      researchPoints: 0,
      unlockedResearch: ['upgrade-macrophage-lv2'],
      freshlyMigrated: false,
      seenMechanics: [],
      loadout: [],
      ownerUserId: null,
      tutorialCompleted: false,
    };

    const migrated = migrateMetaState(persistedV10, 10);

    expect(migrated.researchResetCount).toBe(0);
    expect(migrated.unlockedResearch).toEqual(['mac-lv2']);
  });
});

describe('metaStore migrateMetaState v11 → v12（精英模式 eliteStars）', () => {
  it('v11 升级后：eliteStars 默认空 dict；schemaVersion=13；其它字段保留', () => {
    const persistedV11 = {
      schemaVersion: 11 as const,
      unlockedLevels: [0, 1, 2, 3, 4, 5],
      unlockedTowers: ['macrophage', 'neutrophil', 'nkcell'],
      tutorialStep: -1,
      stars: { 1: 3, 2: 2 },
      researchPoints: 5,
      unlockedResearch: ['mac-lv2'],
      researchResetCount: 0,
      freshlyMigrated: false,
      seenMechanics: ['tower-hp'],
      loadout: [],
      ownerUserId: null,
      tutorialCompleted: false,
    };

    const migrated = migrateMetaState(persistedV11, 11);

    expect(migrated.eliteStars).toEqual({});
    expect(migrated.schemaVersion).toBe(13);
    expect(migrated.stars).toEqual({ 1: 3, 2: 2 });
    expect(migrated.unlockedResearch).toEqual(['mac-lv2']);
  });

  it('version=12：已有 eliteStars 不被覆盖', () => {
    const persistedV12 = {
      schemaVersion: 12 as const,
      unlockedLevels: [0, 1, 2],
      unlockedTowers: ['macrophage'],
      tutorialStep: -1,
      stars: { 1: 3 },
      researchPoints: 0,
      unlockedResearch: [],
      researchResetCount: 0,
      freshlyMigrated: false,
      seenMechanics: [],
      loadout: [],
      ownerUserId: null,
      tutorialCompleted: false,
      eliteStars: { 1: 2, 2: 1 },
    };

    const migrated = migrateMetaState(persistedV12, 12);

    expect(migrated.eliteStars).toEqual({ 1: 2, 2: 1 });
    expect(migrated.schemaVersion).toBe(13);
  });
});
