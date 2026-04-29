import { useGameStore, useMetaStore, useUiStore } from '@ui/store';
import { beforeEach, describe, expect, it } from 'vitest';

describe('Zustand stores', () => {
  beforeEach(() => {
    useGameStore.setState({ hp: 20, atp: 0, waveIndex: 0, selectedTowerId: null });
    useUiStore.setState({ currentScreen: 'splash', selectedTowerType: null });
    useMetaStore.setState({
      unlockedLevels: [1],
      stars: {},
      researchPoints: 0,
      unlockedResearch: [],
      tutorialStep: 0,
      settings: {
        masterVolume: 0.8,
        sfxVolume: 1,
        bgmVolume: 0.6,
        graphics: 'high',
        muted: false,
      },
    });
  });

  it('gameStore 默认值正确', () => {
    const s = useGameStore.getState();
    expect(s.hp).toBe(20);
    expect(s.atp).toBe(0);
  });

  it('uiStore 能切换屏幕', () => {
    useUiStore.getState().setScreen('mainMenu');
    expect(useUiStore.getState().currentScreen).toBe('mainMenu');
  });

  it('metaStore 能解锁关卡', () => {
    useMetaStore.getState().unlockLevel(2);
    expect(useMetaStore.getState().unlockedLevels).toContain(2);
  });

  it('metaStore 同一关卡不会重复解锁', () => {
    useMetaStore.getState().unlockLevel(1);
    expect(useMetaStore.getState().unlockedLevels.filter((x) => x === 1).length).toBe(1);
  });

  it('metaStore setStars 正确写入', () => {
    useMetaStore.getState().setStars(2, 3);
    expect(useMetaStore.getState().stars[2]).toBe(3);
  });

  it('metaStore addResearchPoints 累加', () => {
    useMetaStore.getState().addResearchPoints(5);
    useMetaStore.getState().addResearchPoints(3);
    expect(useMetaStore.getState().researchPoints).toBe(8);
  });

  it('metaStore unlockResearch 不重复添加', () => {
    useMetaStore.getState().unlockResearch('atp-boost');
    useMetaStore.getState().unlockResearch('atp-boost');
    const unlocked = useMetaStore.getState().unlockedResearch.filter((x) => x === 'atp-boost');
    expect(unlocked.length).toBe(1);
  });

  it('metaStore updateSettings 浅合并', () => {
    useMetaStore.getState().updateSettings({ masterVolume: 0.5 });
    const s = useMetaStore.getState().settings;
    expect(s.masterVolume).toBe(0.5);
    expect(s.sfxVolume).toBe(1); // 其他字段保留
    expect(s.graphics).toBe('high');
  });
});
