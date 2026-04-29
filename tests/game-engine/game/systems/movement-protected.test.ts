import { describe, expect, it } from 'vitest';
import { createPathogen } from '@engine/game/entities';
import type { ProtectedCellInstance } from '@engine/game/state';
import { tickMovement } from '@engine/game/systems/movement';

const SHORT_PATH: readonly { col: number; row: number }[] = [
  { col: 0, row: 4 },
  { col: 1, row: 4 },
  { col: 2, row: 4 },
];

const PROTECTED_AT_END: readonly ProtectedCellInstance[] = [
  { coord: { col: 2, row: 4 }, hp: 5, maxHp: 5, name: '肺泡' },
];

describe('tickMovement · protectedCells', () => {
  it('病原走到保护细胞坐标 → protectedHits 含该 hit + coreHits 不含', () => {
    const p = {
      ...createPathogen('p1', 'rhinovirus'),
      pathIndex: SHORT_PATH.length - 2,
      progress: 0.99,
    };
    const r = tickMovement([p], SHORT_PATH, 100, PROTECTED_AT_END);
    expect(r.coreHits).toHaveLength(0);
    expect(r.protectedHits).toHaveLength(1);
    expect(r.protectedHits[0]?.id).toBe('p1');
    expect(r.protectedHits[0]?.cellId).toBe('2_4');
    expect(r.protectedHits[0]?.damage).toBe(1); // rhinovirus.coreDamage=1
    expect(r.pathogens[0]?.reachedExit).toBe(true);
  });

  it('保护细胞列表为空时 → 走到终点全部进 coreHits（旧行为）', () => {
    const p = {
      ...createPathogen('p1', 'rhinovirus'),
      pathIndex: SHORT_PATH.length - 2,
      progress: 0.99,
    };
    const r = tickMovement([p], SHORT_PATH, 100); // 不传 protectedCells
    expect(r.coreHits).toHaveLength(1);
    expect(r.coreHits[0]?.id).toBe('p1');
    expect(r.protectedHits).toHaveLength(0);
  });

  it('cellId 格式为 `${col}_${row}`', () => {
    const cells: readonly ProtectedCellInstance[] = [
      { coord: { col: 8, row: 4 }, hp: 5, maxHp: 5, name: '肺泡' },
    ];
    const path: readonly { col: number; row: number }[] = [
      { col: 7, row: 4 },
      { col: 8, row: 4 },
    ];
    const p = {
      ...createPathogen('p99', 'rhinovirus'),
      pathIndex: 0,
      progress: 0.99,
    };
    const r = tickMovement([p], path, 100, cells);
    expect(r.protectedHits[0]?.cellId).toBe('8_4');
  });

  it('飞行病原（自带直线 path）到达保护细胞坐标 → 也算 protectedHits', () => {
    const cells: readonly ProtectedCellInstance[] = [
      { coord: { col: 5, row: 5 }, hp: 5, maxHp: 5, name: '肺泡' },
    ];
    // pathogen 自带 path（模拟飞行 straightLine 结果）
    const flyPath = [
      { col: 4, row: 5 },
      { col: 5, row: 5 },
    ];
    const p = {
      ...createPathogen('pf', 'rhinovirus', 1, { path: flyPath }),
      pathIndex: 0,
      progress: 0.99,
    };
    // fallbackPath 给一个不同的，确保读 p.path
    const r = tickMovement([p], SHORT_PATH, 100, cells);
    expect(r.protectedHits).toHaveLength(1);
    expect(r.protectedHits[0]?.cellId).toBe('5_5');
    expect(r.coreHits).toHaveLength(0);
  });
});
