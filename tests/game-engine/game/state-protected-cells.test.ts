import { afterAll, describe, expect, it } from 'vitest';
import { LEVELS } from '@engine/game/data/levels';
import { createInitialState } from '@engine/game/state';

describe('createInitialState · protectedCells', () => {
  it('关 7：双肺泡 (8,2)+(8,7)，各 hp 5', () => {
    const s = createInitialState(7);
    expect(s.protectedCells).toHaveLength(2);
    const upper = s.protectedCells.find((pc) => pc.coord.row === 2);
    const lower = s.protectedCells.find((pc) => pc.coord.row === 7);
    expect(upper?.coord).toEqual({ col: 8, row: 2 });
    expect(upper?.hp).toBe(5);
    expect(upper?.name).toBe('上肺泡');
    expect(lower?.coord).toEqual({ col: 8, row: 7 });
    expect(lower?.hp).toBe(5);
    expect(lower?.name).toBe('下肺泡');
  });

  it('关 7：blockedCells 自动包含两个肺泡坐标', () => {
    const s = createInitialState(7);
    expect(s.blockedCells.some((c) => c.col === 8 && c.row === 2)).toBe(true);
    expect(s.blockedCells.some((c) => c.col === 8 && c.row === 7)).toBe(true);
  });

  it('关 7：state.exits 是空数组（所有病原 round-robin 分配到两个肺泡）', () => {
    const s = createInitialState(7);
    expect(s.exits).toEqual([]);
  });

  it('关 7：currentPath 不为空，终点是其中一个肺泡', () => {
    const s = createInitialState(7);
    expect(s.currentPath.length).toBeGreaterThan(0);
    const last = s.currentPath[s.currentPath.length - 1];
    const isProtectedCell = s.protectedCells.some(
      (pc) => pc.coord.col === last?.col && pc.coord.row === last?.row,
    );
    expect(isProtectedCell).toBe(true);
  });

  it('关 1：protectedCells 长度 0，blockedCells 为空（关 1 不引入禁建机制）', () => {
    const s = createInitialState(1);
    expect(s.protectedCells).toHaveLength(0);
    expect(s.blockedCells).toHaveLength(0);
  });

  describe('blockedCells 自动合并去重', () => {
    const TMP_ID = 9001;

    afterAll(() => {
      delete LEVELS[TMP_ID];
    });

    it('blockedCells 与保护细胞坐标重复时只保留一份', () => {
      LEVELS[TMP_ID] = {
        id: TMP_ID,
        chapter: 1,
        title: 'mock-dedupe',
        subtitle: 'mock',
        unlockTowers: ['macrophage'],
        rewardsTowers: [],
        initialHp: 10,
        initialAtp: 100,
        waves: [
          {
            composition: [{ type: 'rhinovirus', count: 1 }],
            intervalMs: 1000,
            hpMultiplier: 1.0,
          },
        ],
        blockedCells: [{ col: 1, row: 1 }],
        protectedCells: [{ coord: { col: 1, row: 1 }, hp: 1, name: 'x' }],
      };
      const s = createInitialState(TMP_ID);
      expect(s.blockedCells).toHaveLength(1);
      expect(s.blockedCells[0]).toEqual({ col: 1, row: 1 });
      expect(s.protectedCells).toHaveLength(1);
    });
  });
});
