import { useMetaStore } from '@ui/store';
import { beforeEach, describe, expect, it } from 'vitest';

describe('metaStore.markMechanicsSeen', () => {
  beforeEach(() => {
    // 重置到初始状态（resetProgress 也会清空 seenMechanics）
    useMetaStore.getState().resetProgress();
  });

  it('首次标记单个机制：seenMechanics=[id]', () => {
    useMetaStore.getState().markMechanicsSeen(['tower-hp']);
    expect(useMetaStore.getState().seenMechanics).toEqual(['tower-hp']);
  });

  it('再次标记包含已存在 + 新机制：去重后追加新的', () => {
    useMetaStore.getState().markMechanicsSeen(['tower-hp']);
    useMetaStore.getState().markMechanicsSeen(['tower-hp', 'no-build-zone']);
    const seen = useMetaStore.getState().seenMechanics;
    expect(seen).toContain('tower-hp');
    expect(seen).toContain('no-build-zone');
    expect(seen.length).toBe(2);
  });

  it('空数组调用：状态不变', () => {
    useMetaStore.getState().markMechanicsSeen(['tower-hp']);
    const before = useMetaStore.getState().seenMechanics;
    useMetaStore.getState().markMechanicsSeen([]);
    expect(useMetaStore.getState().seenMechanics).toBe(before);
  });

  it('resetProgress 后 seenMechanics 清空', () => {
    useMetaStore.getState().markMechanicsSeen(['tower-hp', 'multi-entry']);
    expect(useMetaStore.getState().seenMechanics.length).toBe(2);
    useMetaStore.getState().resetProgress();
    expect(useMetaStore.getState().seenMechanics).toEqual([]);
  });
});

describe('metaStore.setLoadout', () => {
  beforeEach(() => {
    useMetaStore.getState().resetProgress();
  });

  it('setLoadout 设置玩家携带阵容', () => {
    useMetaStore.getState().setLoadout(['macrophage', 'neutrophil']);
    expect(useMetaStore.getState().loadout).toEqual(['macrophage', 'neutrophil']);
  });

  it('resetProgress 后 loadout 清空', () => {
    useMetaStore.getState().setLoadout(['macrophage', 'neutrophil', 'dendritic']);
    expect(useMetaStore.getState().loadout.length).toBe(3);
    useMetaStore.getState().resetProgress();
    expect(useMetaStore.getState().loadout).toEqual([]);
  });
});
