import { describe, expect, it } from 'vitest';
import { createPathogen, createTower } from '@engine/game/entities';
import { tickCombat } from '@engine/game/systems/combat';

// 路径桩：与 combat.test.ts 一致，保证 pathogenPixelPos 可用
const PATH_COORDS: readonly { col: number; row: number }[] = [
  { col: 0, row: 4 },
  { col: 1, row: 4 },
  { col: 2, row: 4 },
  { col: 3, row: 4 },
  { col: 3, row: 5 },
  { col: 3, row: 6 },
  { col: 3, row: 7 },
  { col: 4, row: 7 },
  { col: 5, row: 7 },
  { col: 6, row: 7 },
  { col: 6, row: 6 },
  { col: 6, row: 5 },
  { col: 6, row: 4 },
  { col: 6, row: 3 },
  { col: 6, row: 2 },
  { col: 7, row: 2 },
  { col: 8, row: 2 },
  { col: 9, row: 2 },
];

describe('tickCombat - DoT 持续伤害', () => {
  it('rhinovirus(dot=5) 同格塔 dt=1000ms：塔 hp 减 5', () => {
    // v4: macrophage Lv1 maxHp=140
    const tower = createTower('t1', 'macrophage', 3, 4);
    const pathogen = { ...createPathogen('p1', 'rhinovirus'), pathIndex: 3, progress: 0 };
    const result = tickCombat([tower], [pathogen], PATH_COORDS, 1000);
    const updated = result.towers.find((t) => t.id === 't1');
    expect(updated?.hp).toBeCloseTo(135, 5);
    expect(result.towerDamageEvents).toHaveLength(1);
    expect(result.towerDamageEvents[0]?.towerId).toBe('t1');
    expect(result.towerDamageEvents[0]?.damage).toBeCloseTo(5, 5);
    expect(result.towerDamageEvents[0]?.remainingHp).toBeCloseTo(135, 5);
    expect(result.towerDamageEvents[0]?.sourceIds).toEqual(['p1']);
  });

  it('rhinovirus(dot=5) dt=500ms：塔 hp 减 2.5', () => {
    const tower = createTower('t1', 'macrophage', 3, 4);
    const pathogen = { ...createPathogen('p1', 'rhinovirus'), pathIndex: 3, progress: 0 };
    const result = tickCombat([tower], [pathogen], PATH_COORDS, 500);
    expect(result.towers[0]?.hp).toBeCloseTo(137.5, 5);
  });

  it('dotMultiplier=0.4 缩放伤害：塔 hp 减 2', () => {
    const tower = createTower('t1', 'macrophage', 3, 4);
    const pathogen = { ...createPathogen('p1', 'rhinovirus'), pathIndex: 3, progress: 0 };
    const result = tickCombat([tower], [pathogen], PATH_COORDS, 1000, 0.4);
    expect(result.towers[0]?.hp).toBeCloseTo(138, 5);
  });

  it('Chebyshev > 1：病原距离 2 格的塔不受伤', () => {
    // 病原在 (3,4)，塔放在 (5,4)，col 差 2，超出范围
    const tower = createTower('t1', 'macrophage', 5, 4);
    const pathogen = { ...createPathogen('p1', 'rhinovirus'), pathIndex: 3, progress: 0 };
    const result = tickCombat([tower], [pathogen], PATH_COORDS, 1000);
    expect(result.towers[0]?.hp).toBe(140);
    expect(result.towerDamageEvents).toHaveLength(0);
  });

  it('对角相邻（col±1, row±1）：触发 DoT', () => {
    // 病原在 (3,4)，塔在 (4,5) 对角邻接
    const tower = createTower('t1', 'macrophage', 4, 5);
    const pathogen = { ...createPathogen('p1', 'rhinovirus'), pathIndex: 3, progress: 0 };
    const result = tickCombat([tower], [pathogen], PATH_COORDS, 1000);
    expect(result.towers[0]?.hp).toBeCloseTo(135, 5); // v4: 140-5
    expect(result.towerDamageEvents).toHaveLength(1);
  });

  it('多病原围塔：damage 累加，sourceIds 含所有病原 id', () => {
    const tower = createTower('t1', 'macrophage', 3, 4);
    const p1 = { ...createPathogen('p1', 'rhinovirus'), pathIndex: 3, progress: 0 };
    const p2 = { ...createPathogen('p2', 'rhinovirus'), pathIndex: 3, progress: 0 };
    const result = tickCombat([tower], [p1, p2], PATH_COORDS, 1000);
    expect(result.towerDamageEvents).toHaveLength(1);
    expect(result.towerDamageEvents[0]?.damage).toBeCloseTo(10, 5);
    expect(result.towerDamageEvents[0]?.sourceIds).toHaveLength(2);
    expect(result.towerDamageEvents[0]?.sourceIds).toContain('p1');
    expect(result.towerDamageEvents[0]?.sourceIds).toContain('p2');
  });

  it('alive=false 的病原不造成 DoT', () => {
    const tower = createTower('t1', 'macrophage', 3, 4);
    const pathogen = {
      ...createPathogen('p1', 'rhinovirus'),
      pathIndex: 3,
      progress: 0,
      alive: false,
    };
    const result = tickCombat([tower], [pathogen], PATH_COORDS, 1000);
    expect(result.towers[0]?.hp).toBe(140);
    expect(result.towerDamageEvents).toHaveLength(0);
  });

  it('reachedExit 的病原不造成 DoT', () => {
    const tower = createTower('t1', 'macrophage', 3, 4);
    const pathogen = {
      ...createPathogen('p1', 'rhinovirus'),
      pathIndex: 3,
      progress: 0,
      reachedExit: true,
    };
    const result = tickCombat([tower], [pathogen], PATH_COORDS, 1000);
    expect(result.towers[0]?.hp).toBe(140);
    expect(result.towerDamageEvents).toHaveLength(0);
  });

  it('塔无相邻病原：towerDamageEvents 长度 0', () => {
    // 病原在 (3,4)，塔在 (9,9) 远端
    const tower = createTower('t1', 'macrophage', 9, 9);
    const pathogen = { ...createPathogen('p1', 'rhinovirus'), pathIndex: 3, progress: 0 };
    const result = tickCombat([tower], [pathogen], PATH_COORDS, 1000);
    expect(result.towerDamageEvents).toHaveLength(0);
    expect(result.towers[0]?.hp).toBe(140);
  });

  it('飞行病原 aspergillus(dot=6) 相邻 macrophage：仍触发 DoT', () => {
    // macrophage 不能打空（canTargetFlying=false），但 DoT 不区分飞行
    const tower = createTower('t1', 'macrophage', 3, 4);
    const pathogen = { ...createPathogen('p1', 'aspergillus'), pathIndex: 3, progress: 0 };
    const result = tickCombat([tower], [pathogen], PATH_COORDS, 1000);
    expect(result.towers[0]?.hp).toBeCloseTo(134, 5); // v4: 140-6
    expect(result.towerDamageEvents).toHaveLength(1);
    expect(result.towerDamageEvents[0]?.damage).toBeCloseTo(6, 5);
  });

  it('长时间 DoT 致塔死：dt=30s rhinovirus(dot=5) → 塔 hp 归零，destroyedTowers 含该塔', () => {
    // v4: 140 hp / (5 dot * 30s) = 150 dmg → 死（之前 100hp / 20s）
    const tower = createTower('t1', 'macrophage', 3, 4);
    const pathogen = { ...createPathogen('p1', 'rhinovirus'), pathIndex: 3, progress: 0 };
    const result = tickCombat([tower], [pathogen], PATH_COORDS, 30000);
    expect(result.towers).toHaveLength(0);
    expect(result.destroyedTowers).toHaveLength(1);
    expect(result.destroyedTowers[0]?.id).toBe('t1');
    expect(result.destroyedTowers[0]?.hp).toBe(0);
  });

  it('dt 不够死塔时 destroyedTowers 为空', () => {
    const tower = createTower('t1', 'macrophage', 3, 4);
    const pathogen = { ...createPathogen('p1', 'rhinovirus'), pathIndex: 3, progress: 0 };
    const result = tickCombat([tower], [pathogen], PATH_COORDS, 1000);
    expect(result.destroyedTowers).toHaveLength(0);
    expect(result.towers).toHaveLength(1);
  });
});
