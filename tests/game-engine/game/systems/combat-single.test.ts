import { describe, expect, it } from 'vitest';
import { createPathogen, createTower } from '@engine/game/entities';
import { tickCombat } from '@engine/game/systems/combat';

const PATH_COORDS: readonly { col: number; row: number }[] = [
  { col: 0, row: 4 },
  { col: 1, row: 4 },
  { col: 2, row: 4 },
  { col: 3, row: 4 },
  { col: 4, row: 4 },
  { col: 5, row: 4 },
];

// 单体塔测试改用 nkcell（neutrophil 已改放射发射走独立分支，不再 single target）
// NK Lv1: damage=50, range=2.5, attackIntervalMs=1000（NK damage -25%）
describe('tickCombat - 单体（single）塔', () => {
  it('范围内多目标：只攻击最靠近出口的一只', () => {
    const tower = { ...createTower('t1', 'nkcell', 3, 4), cooldownMs: 1000 };
    // 用 saureus（HP=240）避免 50 伤害一发打死
    const near = { ...createPathogen('p1', 'saureus'), pathIndex: 2, progress: 0 };
    const far = { ...createPathogen('p2', 'saureus'), pathIndex: 4, progress: 0 };
    const result = tickCombat([tower], [near, far], PATH_COORDS, 0);
    expect(result.pathogens.find((p) => p.id === 'p1')?.hp).toBe(240); // 未受伤
    expect(result.pathogens.find((p) => p.id === 'p2')?.hp).toBe(190); // 240-50
    expect(result.fires).toHaveLength(1);
    expect(result.fires[0]?.targetIds).toEqual(['p2']);
  });

  it('无目标时保留冷却（蓄力）', () => {
    const tower = { ...createTower('t1', 'nkcell', 9, 9), cooldownMs: 900 };
    // 病原体在 (0,4)，距 (9,9) ≈ 10.3，远超射程 2.5
    const p = { ...createPathogen('p1', 'rhinovirus'), pathIndex: 0, progress: 0 };
    const result = tickCombat([tower], [p], PATH_COORDS, 100);
    // 加 100ms 累计到 1000 刚好到 interval，但无目标保留不重置
    expect(result.towers[0]?.cooldownMs).toBe(1000);
    expect(result.fires).toHaveLength(0);
  });

  it('单体塔杀死目标：kills 含目标 id', () => {
    const tower = { ...createTower('t1', 'nkcell', 3, 4), cooldownMs: 1000 };
    // rhinovirus HP=65 → 注入 hp=40 让 NK 50 一发打死
    const weak = {
      ...createPathogen('p1', 'rhinovirus'),
      pathIndex: 3,
      progress: 0,
      hp: 40,
    };
    const result = tickCombat([tower], [weak], PATH_COORDS, 0);
    expect(result.kills).toContain('p1');
    expect(result.pathogens[0]?.alive).toBe(false);
  });

  it('冷却未满不射击', () => {
    const tower = { ...createTower('t1', 'nkcell', 3, 4), cooldownMs: 0 };
    const p = { ...createPathogen('p1', 'rhinovirus'), pathIndex: 3, progress: 0 };
    const result = tickCombat([tower], [p], PATH_COORDS, 100);
    expect(result.fires).toHaveLength(0);
    expect(result.pathogens[0]?.hp).toBe(65);
  });
});

describe('tickCombat - AoE 塔保持原有行为', () => {
  it('范围内多目标：全部受伤', () => {
    const tower = { ...createTower('t1', 'macrophage', 3, 4), cooldownMs: 1300 };
    const a = { ...createPathogen('p1', 'rhinovirus'), pathIndex: 2, progress: 0 };
    const b = { ...createPathogen('p2', 'rhinovirus'), pathIndex: 3, progress: 0 };
    const result = tickCombat([tower], [a, b], PATH_COORDS, 0);
    // v4 Lv1 macrophage damage=22, rhinovirus HP 65 → 43
    expect(result.pathogens[0]?.hp).toBe(43);
    expect(result.pathogens[1]?.hp).toBe(43);
    expect(result.fires[0]?.targetIds.sort()).toEqual(['p1', 'p2']);
  });

  it('AoE 无目标时保留冷却蓄力，不发 fire 事件', () => {
    const tower = { ...createTower('t1', 'macrophage', 9, 9), cooldownMs: 1300 };
    const p = { ...createPathogen('p1', 'rhinovirus'), pathIndex: 0, progress: 0 };
    const result = tickCombat([tower], [p], PATH_COORDS, 50);
    // v4: 1300 + 50 = 1350，超过 1300 的 attackIntervalMs，但无目标所以保留 1350
    expect(result.towers[0]?.cooldownMs).toBe(1350);
    expect(result.fires).toHaveLength(0);
  });
});

describe('tickCombat - 飞行过滤', () => {
  it('巨噬（canTargetFlying=false）忽略范围内的飞行目标', () => {
    const tower = { ...createTower('t1', 'macrophage', 3, 4), cooldownMs: 1300 };
    const flying = {
      ...createPathogen('p-fly', 'rhinovirus'),
      pathIndex: 3,
      progress: 0,
      flying: true,
    };
    const result = tickCombat([tower], [flying], PATH_COORDS, 0);
    expect(result.pathogens[0]?.hp).toBe(65); // 未受伤
    expect(result.fires).toHaveLength(0);
  });

  it('NK 塔（默认 canTargetFlying）能打飞行目标', () => {
    const tower = { ...createTower('t1', 'nkcell', 3, 4), cooldownMs: 1000 };
    const flying = {
      ...createPathogen('p-fly', 'rhinovirus'),
      pathIndex: 3,
      progress: 0,
      flying: true,
      hp: 40, // 注入低 hp 让 NK 50 一发即死
    };
    const result = tickCombat([tower], [flying], PATH_COORDS, 0);
    expect(result.pathogens[0]?.alive).toBe(false);
    expect(result.fires).toHaveLength(1);
    expect(result.fires[0]?.targetIds).toEqual(['p-fly']);
  });

  it('巨噬遇到混合目标（1 飞行 + 1 地面）：只打地面', () => {
    const tower = { ...createTower('t1', 'macrophage', 3, 4), cooldownMs: 1300 };
    const flying = {
      ...createPathogen('p-fly', 'rhinovirus'),
      pathIndex: 3,
      progress: 0,
      flying: true,
    };
    const ground = { ...createPathogen('p-grd', 'rhinovirus'), pathIndex: 3, progress: 0 };
    const result = tickCombat([tower], [flying, ground], PATH_COORDS, 0);
    expect(result.pathogens.find((p) => p.id === 'p-fly')?.hp).toBe(65); // 飞行未受伤
    expect(result.pathogens.find((p) => p.id === 'p-grd')?.hp).toBe(43); // 地面 65-22（v4）
  });
});
