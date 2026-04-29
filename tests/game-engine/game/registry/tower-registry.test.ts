import { describe, expect, it } from 'vitest';
import type { TowerType } from '@engine/game/entities';
import {
  DENDRITIC_LEVELS,
  TOWER_DEFS,
  TOWER_LEVELS,
  TOWER_REGISTRY,
} from '@engine/game/registry/tower-registry';

const ALL_TYPES: readonly TowerType[] = [
  'macrophage',
  'neutrophil',
  'nkcell',
  'dendritic',
  'mitochondria',
];
const ATTACK_TYPES: readonly TowerType[] = ['macrophage', 'neutrophil', 'nkcell'];

describe('TOWER_REGISTRY', () => {
  it('全部 TowerType 都在注册表中', () => {
    for (const t of ALL_TYPES) {
      expect(TOWER_REGISTRY[t]).toBeDefined();
      expect(TOWER_REGISTRY[t].type).toBe(t);
    }
    // exhaustiveness：注册表的 keys 与 ALL_TYPES 数量一致
    expect(Object.keys(TOWER_REGISTRY).sort()).toEqual([...ALL_TYPES].sort());
  });

  it('每种 entry 含 def / levels / role / meta 四个字段', () => {
    for (const t of ALL_TYPES) {
      const e = TOWER_REGISTRY[t];
      expect(e.def).toBeDefined();
      expect(Array.isArray(e.levels)).toBe(true);
      expect(e.levels.length).toBe(3);
      expect(e.role).toBeDefined();
      expect(e.meta).toBeDefined();
      expect(typeof e.meta.displayName).toBe('string');
      expect(typeof e.meta.scientificName).toBe('string');
      expect(typeof e.meta.description).toBe('string');
      expect(typeof e.meta.color).toBe('number');
      expect(['hexagon', 'star', 'diamond', 'pentagon']).toContain(e.meta.shape);
    }
  });

  it('attack 塔 role 均为 attack；dendritic role 为 helper（M5）', () => {
    for (const t of ATTACK_TYPES) {
      expect(TOWER_REGISTRY[t].role).toBe('attack');
    }
    expect(TOWER_REGISTRY.dendritic.role).toBe('helper');
  });

  it('macrophage def 数值（平衡 v4：高血肉盾范围 + 慢节奏）', () => {
    expect(TOWER_REGISTRY.macrophage.def).toEqual({
      cost: 30,
      range: 1.5,
      damage: 22, // v4：原 25 削 ~12%
      attackIntervalMs: 1300, // v4：原 1000 +30%（再降攻速）
      targetingMode: 'aoe',
      canTargetFlying: false,
    });
  });

  it('neutrophil 改为放射发射塔：range=Infinity + radialProjectile 配置', () => {
    const def = TOWER_REGISTRY.neutrophil.def;
    expect(def.cost).toBe(55);
    expect(def.damage).toBe(30);
    expect(def.attackIntervalMs).toBe(500);
    expect(def.targetingMode).toBe('single'); // 字段保留但 radial 塔走独立分支
    expect(def.range).toBe(Number.POSITIVE_INFINITY);
    expect(def.radialProjectile).toEqual({
      bulletCountByLevel: [2, 3, 5],
      rotationSpeed: 0.8,
      bulletSpeed: 10,
    });
  });

  it('nkcell def 数值（damage -25% 后保留 50/70/100 阶梯）', () => {
    expect(TOWER_REGISTRY.nkcell.def).toEqual({
      cost: 60,
      range: 2.5,
      damage: 50,
      attackIntervalMs: 1000,
      targetingMode: 'single',
    });
  });

  it('macrophage levels 关键数值核对（平衡 v4：dmg ~×0.87 / HP ×1.4 / interval +30%）', () => {
    const lv = TOWER_REGISTRY.macrophage.levels;
    expect(lv[0]).toEqual({
      damage: 22,
      range: 1.5,
      attackIntervalMs: 1300,
      upgradeCost: 55,
      hp: 140,
    });
    expect(lv[1]).toEqual({
      damage: 30,
      range: 1.7,
      attackIntervalMs: 1250,
      upgradeCost: 90,
      hp: 200,
    });
    expect(lv[2]).toEqual({
      damage: 38,
      range: 2.0,
      attackIntervalMs: 1200,
      upgradeCost: null,
      hp: 280,
    });
  });

  it('neutrophil levels 关键数值核对（平衡 v3）', () => {
    const lv = TOWER_REGISTRY.neutrophil.levels;
    expect(lv[0]?.damage).toBe(30);
    expect(lv[1]?.damage).toBe(45);
    expect(lv[2]?.damage).toBe(55);
    expect(lv[2]?.upgradeCost).toBeNull();
    expect(lv[0]?.hp).toBe(60);
    expect(lv[1]?.hp).toBe(90);
    expect(lv[2]?.hp).toBe(130);
  });

  it('nkcell levels 关键数值核对（damage -25%：50/70/100）', () => {
    const lv = TOWER_REGISTRY.nkcell.levels;
    expect(lv[0]?.damage).toBe(50);
    expect(lv[0]?.attackIntervalMs).toBe(1000);
    expect(lv[1]?.damage).toBe(70);
    expect(lv[2]?.damage).toBe(100);
    expect(lv[2]?.range).toBe(3.2);
    expect(lv[2]?.attackIntervalMs).toBe(900);
    expect(lv[2]?.upgradeCost).toBeNull();
    expect(lv[0]?.hp).toBe(80);
    expect(lv[1]?.hp).toBe(120);
    expect(lv[2]?.hp).toBe(160);
  });

  it('meta 显示名核对', () => {
    expect(TOWER_REGISTRY.macrophage.meta.displayName).toBe('巨噬细胞');
    expect(TOWER_REGISTRY.neutrophil.meta.displayName).toBe('中性粒细胞');
    expect(TOWER_REGISTRY.nkcell.meta.displayName).toBe('NK 细胞');
    expect(TOWER_REGISTRY.dendritic.meta.displayName).toBe('树突状细胞');
  });

  it('M5：dendritic def 数值（cost=70 / range=1.5 / damage=0 / interval=0）', () => {
    expect(TOWER_REGISTRY.dendritic.def).toEqual({
      cost: 70,
      range: 1.5,
      damage: 0,
      attackIntervalMs: 0,
      targetingMode: 'aoe',
    });
  });

  it('M5：DENDRITIC_LEVELS Lv1/2/3 helperBuff.dmgMultiplier = 1.3 / 1.4 / 1.5', () => {
    expect(DENDRITIC_LEVELS[0]?.helperBuff?.dmgMultiplier).toBe(1.3);
    expect(DENDRITIC_LEVELS[1]?.helperBuff?.dmgMultiplier).toBe(1.4);
    expect(DENDRITIC_LEVELS[2]?.helperBuff?.dmgMultiplier).toBe(1.5);
  });

  it('M5：DENDRITIC_LEVELS Lv1/2/3 hp = 50 / 90 / 140；upgradeCost = 90 / 130 / null', () => {
    expect(DENDRITIC_LEVELS[0]?.hp).toBe(50);
    expect(DENDRITIC_LEVELS[1]?.hp).toBe(90);
    expect(DENDRITIC_LEVELS[2]?.hp).toBe(140);
    expect(DENDRITIC_LEVELS[0]?.upgradeCost).toBe(90);
    expect(DENDRITIC_LEVELS[1]?.upgradeCost).toBe(130);
    expect(DENDRITIC_LEVELS[2]?.upgradeCost).toBeNull();
  });

  it('M5：攻击塔 levels 不含 helperBuff 字段', () => {
    for (const t of ATTACK_TYPES) {
      for (const lv of TOWER_REGISTRY[t].levels) {
        expect(lv.helperBuff).toBeUndefined();
      }
    }
  });
});

describe('derived TOWER_DEFS / TOWER_LEVELS', () => {
  it('TOWER_DEFS 与 TOWER_REGISTRY[t].def 引用一致', () => {
    for (const t of ALL_TYPES) {
      expect(TOWER_DEFS[t]).toBe(TOWER_REGISTRY[t].def);
    }
  });

  it('TOWER_LEVELS 与 TOWER_REGISTRY[t].levels 引用一致', () => {
    for (const t of ALL_TYPES) {
      expect(TOWER_LEVELS[t]).toBe(TOWER_REGISTRY[t].levels);
    }
  });

  it('TOWER_DEFS 数值与原版一致', () => {
    expect(TOWER_DEFS.macrophage.cost).toBe(30);
    expect(TOWER_DEFS.macrophage.canTargetFlying).toBe(false);
    expect(TOWER_DEFS.neutrophil.cost).toBe(55);
    expect(TOWER_DEFS.nkcell.range).toBe(2.5);
  });
});
