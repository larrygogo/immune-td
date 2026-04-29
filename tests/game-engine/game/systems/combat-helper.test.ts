import { describe, expect, it } from 'vitest';
import { createPathogen, createTower } from '@engine/game/entities';
import { tickCombat } from '@engine/game/systems/combat';

// 路径桩（与其他 combat 测试一致），保证 pathogenPixelPos 可用
const PATH_COORDS: readonly { col: number; row: number }[] = [
  { col: 0, row: 4 },
  { col: 1, row: 4 },
  { col: 2, row: 4 },
  { col: 3, row: 4 },
  { col: 4, row: 4 },
  { col: 5, row: 4 },
];

describe('tickCombat - M5 helper 塔 buff', () => {
  it('macrophage 周围有 1 个 dendritic Lv1：damage 乘 1.3', () => {
    // v4 macrophage Lv1 damage=22 → 22 * 1.3 = 28.6；rhinovirus hp=65 → 65-28.6=36.4
    const macrophage = { ...createTower('m1', 'macrophage', 3, 4), cooldownMs: 1300 };
    const dendritic = createTower('d1', 'dendritic', 3, 5);
    const pathogen = { ...createPathogen('p1', 'rhinovirus'), pathIndex: 3, progress: 0 };
    const result = tickCombat([macrophage, dendritic], [pathogen], PATH_COORDS, 0);
    expect(result.pathogens.find((p) => p.id === 'p1')?.hp).toBeCloseTo(65 - 22 * 1.3, 5);
  });

  it('无 helper：damage 保持 levelDef.damage（v4=22）', () => {
    const macrophage = { ...createTower('m1', 'macrophage', 3, 4), cooldownMs: 1300 };
    const pathogen = { ...createPathogen('p1', 'rhinovirus'), pathIndex: 3, progress: 0 };
    const result = tickCombat([macrophage], [pathogen], PATH_COORDS, 0);
    expect(result.pathogens[0]?.hp).toBe(43); // 65 - 22
  });

  it('2 个 dendritic Lv1 同时在范围内：乘法叠加 22*1.3*1.3', () => {
    const macrophage = { ...createTower('m1', 'macrophage', 3, 4), cooldownMs: 1300 };
    const d1 = createTower('d1', 'dendritic', 3, 5);
    const d2 = createTower('d2', 'dendritic', 3, 3);
    const pathogen = { ...createPathogen('p1', 'rhinovirus'), pathIndex: 3, progress: 0 };
    const result = tickCombat([macrophage, d1, d2], [pathogen], PATH_COORDS, 0);
    expect(result.pathogens.find((p) => p.id === 'p1')?.hp).toBeCloseTo(65 - 22 * 1.3 * 1.3, 5);
  });

  it('dendritic 自己不开火：fires.length=0', () => {
    // 只有 dendritic，没有攻击塔
    const dendritic = { ...createTower('d1', 'dendritic', 3, 4), cooldownMs: 5000 };
    const pathogen = { ...createPathogen('p1', 'rhinovirus'), pathIndex: 3, progress: 0 };
    const result = tickCombat([dendritic], [pathogen], PATH_COORDS, 0);
    expect(result.fires).toHaveLength(0);
    expect(result.pathogens[0]?.hp).toBe(65); // 未受伤
    // helper 塔 cooldown 始终归零
    expect(result.towers.find((t) => t.id === 'd1')?.cooldownMs).toBe(0);
  });

  it('helper hp=0：不再 buff', () => {
    const macrophage = { ...createTower('m1', 'macrophage', 3, 4), cooldownMs: 1300 };
    const deadHelper = { ...createTower('d1', 'dendritic', 3, 5), hp: 0 };
    const pathogen = { ...createPathogen('p1', 'rhinovirus'), pathIndex: 3, progress: 0 };
    const result = tickCombat([macrophage, deadHelper], [pathogen], PATH_COORDS, 0);
    expect(result.pathogens.find((p) => p.id === 'p1')?.hp).toBe(43); // 65 - 22（v4），无 buff
  });

  it('helper 超出 range：不 buff', () => {
    // dendritic Lv1 range=1.5；放在 (8,8) 距 macrophage(3,4) 远超 1.5
    const macrophage = { ...createTower('m1', 'macrophage', 3, 4), cooldownMs: 1300 };
    const farHelper = createTower('d1', 'dendritic', 8, 8);
    const pathogen = { ...createPathogen('p1', 'rhinovirus'), pathIndex: 3, progress: 0 };
    const result = tickCombat([macrophage, farHelper], [pathogen], PATH_COORDS, 0);
    expect(result.pathogens.find((p) => p.id === 'p1')?.hp).toBe(43); // 65 - 22
  });

  it('helper Lv2：buff=1.4，damage=22*1.4=30.8（v4）', () => {
    const macrophage = { ...createTower('m1', 'macrophage', 3, 4), cooldownMs: 1300 };
    // 手动构造 Lv2 dendritic：level=2，hp/maxHp 用 Lv2 的 90
    const helperLv2 = {
      ...createTower('d1', 'dendritic', 3, 5),
      level: 2 as const,
      hp: 90,
      maxHp: 90,
    };
    const pathogen = { ...createPathogen('p1', 'rhinovirus'), pathIndex: 3, progress: 0 };
    const result = tickCombat([macrophage, helperLv2], [pathogen], PATH_COORDS, 0);
    expect(result.pathogens.find((p) => p.id === 'p1')?.hp).toBeCloseTo(65 - 22 * 1.4, 5);
  });

  it('helper 仍受 DoT 伤害（不豁免）：相邻 rhinovirus dot=5，dt=1000ms → hp 减 5', () => {
    // dendritic 单独放在 (4,4)，与 path[3]=(3,4) 的 rhinovirus 相邻（Chebyshev=1）
    const dendritic = createTower('d1', 'dendritic', 4, 4); // hp=50
    const pathogen = { ...createPathogen('p1', 'rhinovirus'), pathIndex: 3, progress: 0 };
    const result = tickCombat([dendritic], [pathogen], PATH_COORDS, 1000);
    const updated = result.towers.find((t) => t.id === 'd1');
    expect(updated?.hp).toBeCloseTo(45, 5);
    expect(result.towerDamageEvents).toHaveLength(1);
    expect(result.towerDamageEvents[0]?.towerId).toBe('d1');
    expect(result.towerDamageEvents[0]?.damage).toBeCloseTo(5, 5);
  });
});
