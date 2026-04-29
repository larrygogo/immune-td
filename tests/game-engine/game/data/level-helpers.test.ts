import { describe, expect, it } from 'vitest';
import {
  type Coord,
  type GameMechanic,
  type LevelConfig,
  getEntries,
  getExits,
  getNextLevels,
  isMechanicEnabled,
} from '@engine/game/data/levels';

const FALLBACK_ENTRY: Coord = { col: 0, row: 4 };
const FALLBACK_EXIT: Coord = { col: 9, row: 2 };

/** 构造满足 LevelConfig 必填字段的最小 mock，可用 overrides 注入 optional 字段。 */
function makeLevel(overrides: Partial<LevelConfig> = {}): LevelConfig {
  return {
    id: 99,
    chapter: 1,
    title: 'mock',
    subtitle: 'mock',
    unlockTowers: ['macrophage'],
    rewardsTowers: [],
    waves: [],
    initialHp: 10,
    initialAtp: 100,
    ...overrides,
  };
}

describe('getEntries', () => {
  it('entry 未定义时返回 [fallback]', () => {
    const lv = makeLevel();
    expect(getEntries(lv, FALLBACK_ENTRY)).toEqual([FALLBACK_ENTRY]);
  });

  it('entry 为单 Coord 时包成数组', () => {
    const custom: Coord = { col: 5, row: 0 };
    const lv = makeLevel({ entry: custom });
    expect(getEntries(lv, FALLBACK_ENTRY)).toEqual([custom]);
  });

  it('entry 为数组时原样返回', () => {
    const arr: readonly Coord[] = [
      { col: 0, row: 0 },
      { col: 0, row: 9 },
    ];
    const lv = makeLevel({ entry: arr });
    expect(getEntries(lv, FALLBACK_ENTRY)).toEqual(arr);
  });
});

describe('getExits', () => {
  it('exit 未定义时返回 [fallback]', () => {
    const lv = makeLevel();
    expect(getExits(lv, FALLBACK_EXIT)).toEqual([FALLBACK_EXIT]);
  });

  it('exit 为单 Coord 时包成数组', () => {
    const custom: Coord = { col: 9, row: 9 };
    const lv = makeLevel({ exit: custom });
    expect(getExits(lv, FALLBACK_EXIT)).toEqual([custom]);
  });

  it('exit 为数组时原样返回', () => {
    const arr: readonly Coord[] = [
      { col: 9, row: 0 },
      { col: 9, row: 9 },
    ];
    const lv = makeLevel({ exit: arr });
    expect(getExits(lv, FALLBACK_EXIT)).toEqual(arr);
  });

  it('exit 为显式空数组时返回 []（与 undefined 不同：不回退 fallback）', () => {
    const lv = makeLevel({ exit: [] });
    expect(getExits(lv, FALLBACK_EXIT)).toEqual([]);
  });
});

describe('isMechanicEnabled', () => {
  it('enabledMechanics 不存在时一律 false', () => {
    const lv = makeLevel();
    expect(isMechanicEnabled(lv, 'tower-hp')).toBe(false);
    expect(isMechanicEnabled(lv, 'multi-entry')).toBe(false);
  });

  it('enabledMechanics 存在但不含查询机制时返回 false', () => {
    const lv = makeLevel({ enabledMechanics: ['tower-hp'] });
    expect(isMechanicEnabled(lv, 'multi-entry')).toBe(false);
  });

  it('enabledMechanics 包含查询机制时返回 true', () => {
    const mechanics: readonly GameMechanic[] = ['tower-hp', 'multi-entry', 'protected-cells'];
    const lv = makeLevel({ enabledMechanics: mechanics });
    expect(isMechanicEnabled(lv, 'tower-hp')).toBe(true);
    expect(isMechanicEnabled(lv, 'multi-entry')).toBe(true);
    expect(isMechanicEnabled(lv, 'protected-cells')).toBe(true);
  });
});

describe('getNextLevels', () => {
  it('unlocksLevels 不存在时回退到 [id + 1]', () => {
    const lv = makeLevel({ id: 5 });
    expect(getNextLevels(lv)).toEqual([6]);
  });

  it('unlocksLevels 存在时原样返回（支持分支解锁）', () => {
    const next: readonly number[] = [11, 16];
    const lv = makeLevel({ id: 10, unlocksLevels: next });
    expect(getNextLevels(lv)).toEqual(next);
  });

  it('unlocksLevels 为空数组时表示终点关（不解锁任何关）', () => {
    const lv = makeLevel({ id: 30, unlocksLevels: [] });
    expect(getNextLevels(lv)).toEqual([]);
  });
});
