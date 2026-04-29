import { describe, expect, it } from 'vitest';
import { createPathogen, createTower } from '@engine/game/entities';
import { tickCombat } from '@engine/game/systems/combat';

// 等价于 P2A 原固定路径的测试桩，避免单测依赖 map.ts 的路径常量
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

describe('tickCombat', () => {
  it('冷却未到时不攻击', () => {
    // macrophage attackIntervalMs=1000，createTower 初始 cooldownMs=0
    // 500ms 不够触发攻击
    const tower = createTower('t1', 'macrophage', 3, 4);
    // 病原体在 PATH_COORDS[3]=(3,4)，在塔的射程内
    const pathogen = { ...createPathogen('p1', 'rhinovirus'), pathIndex: 3, progress: 0 };
    const result = tickCombat([tower], [pathogen], PATH_COORDS, 500);
    expect(result.kills).toHaveLength(0);
    expect(result.pathogens[0]?.hp).toBe(65);
  });

  it('冷却满后对范围内病原体造成伤害', () => {
    const tower = { ...createTower('t1', 'macrophage', 3, 4), cooldownMs: 1300 };
    const pathogen = { ...createPathogen('p1', 'rhinovirus'), pathIndex: 3, progress: 0 };
    const result = tickCombat([tower], [pathogen], PATH_COORDS, 0);
    expect(result.pathogens[0]?.hp).toBe(43); // 65 - 22（v4 平衡）
    expect(result.towers[0]?.cooldownMs).toBe(0);
  });

  it('HP 归零时记入 kills 并 alive=false', () => {
    const tower = { ...createTower('t1', 'macrophage', 3, 4), cooldownMs: 1300 };
    // v4 macrophage damage=19，需让 pathogen.hp <= 19 才会被打死
    const pathogen = { ...createPathogen('p1', 'rhinovirus'), pathIndex: 3, progress: 0, hp: 15 };
    const result = tickCombat([tower], [pathogen], PATH_COORDS, 0);
    expect(result.kills).toContain('p1');
    expect(result.pathogens[0]?.alive).toBe(false);
  });

  it('范围外的病原体不受伤害', () => {
    const tower = { ...createTower('t1', 'macrophage', 0, 0), cooldownMs: 1300 };
    // 病原体在路径末段附近，远离塔 (0,0)
    const pathogen = { ...createPathogen('p1', 'rhinovirus'), pathIndex: 15, progress: 0 };
    const result = tickCombat([tower], [pathogen], PATH_COORDS, 0);
    expect(result.pathogens[0]?.hp).toBe(65);
    expect(result.kills).toHaveLength(0);
  });

  it('已死亡的病原体不会被再次攻击', () => {
    const tower = { ...createTower('t1', 'macrophage', 3, 4), cooldownMs: 1300 };
    const pathogen = {
      ...createPathogen('p1', 'rhinovirus'),
      pathIndex: 3,
      progress: 0,
      alive: false,
    };
    const result = tickCombat([tower], [pathogen], PATH_COORDS, 0);
    expect(result.kills).toHaveLength(0);
  });
});
