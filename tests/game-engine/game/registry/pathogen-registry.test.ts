import { describe, expect, it } from 'vitest';
import type { PathogenType } from '@engine/game/entities';
import {
  PATHOGEN_DEFS,
  PATHOGEN_REGISTRY,
  PATHOGEN_REWARDS,
} from '@engine/game/registry/pathogen-registry';

const ALL_TYPES: readonly PathogenType[] = [
  'rhinovirus',
  'influenza',
  'ecoli',
  'saureus',
  'aspergillus',
];

describe('PATHOGEN_REGISTRY', () => {
  it('全部 5 种 PathogenType 都在注册表中', () => {
    for (const t of ALL_TYPES) {
      expect(PATHOGEN_REGISTRY[t]).toBeDefined();
      expect(PATHOGEN_REGISTRY[t].type).toBe(t);
    }
    // exhaustiveness：注册表的 keys 与 ALL_TYPES 数量一致
    expect(Object.keys(PATHOGEN_REGISTRY).sort()).toEqual([...ALL_TYPES].sort());
  });

  it('每种 entry 含 def / reward / dot / meta 四个字段', () => {
    for (const t of ALL_TYPES) {
      const e = PATHOGEN_REGISTRY[t];
      expect(e.def).toBeDefined();
      expect(typeof e.reward).toBe('number');
      expect(typeof e.dot).toBe('number');
      expect(e.meta).toBeDefined();
      expect(typeof e.meta.displayName).toBe('string');
      expect(typeof e.meta.scientificName).toBe('string');
      expect(typeof e.meta.description).toBe('string');
      expect(typeof e.meta.color).toBe('number');
      expect(['circle', 'triangle', 'rect']).toContain(e.meta.shape);
    }
  });

  it('def 数值（v4：所有病原 speed ×0.8 普遍减速）', () => {
    expect(PATHOGEN_REGISTRY.rhinovirus.def).toEqual({ maxHp: 65, speed: 1.2, coreDamage: 1 });
    expect(PATHOGEN_REGISTRY.influenza.def).toEqual({ maxHp: 30, speed: 2.4, coreDamage: 1 });
    expect(PATHOGEN_REGISTRY.ecoli.def).toEqual({ maxHp: 50, speed: 1.6, coreDamage: 1 });
    expect(PATHOGEN_REGISTRY.saureus.def).toEqual({ maxHp: 240, speed: 0.8, coreDamage: 2 });
    expect(PATHOGEN_REGISTRY.aspergillus.def).toEqual({
      maxHp: 50,
      speed: 1.4,
      coreDamage: 1,
      flying: true,
    });
  });

  it('reward 数值与原版完全一致（防回归）', () => {
    expect(PATHOGEN_REGISTRY.rhinovirus.reward).toBe(4);
    expect(PATHOGEN_REGISTRY.influenza.reward).toBe(5);
    expect(PATHOGEN_REGISTRY.ecoli.reward).toBe(7);
    expect(PATHOGEN_REGISTRY.saureus.reward).toBe(20);
    expect(PATHOGEN_REGISTRY.aspergillus.reward).toBe(10);
  });

  it('dot 数值与 spec 一致', () => {
    expect(PATHOGEN_REGISTRY.rhinovirus.dot).toBe(5);
    expect(PATHOGEN_REGISTRY.influenza.dot).toBe(8);
    expect(PATHOGEN_REGISTRY.ecoli.dot).toBe(7);
    expect(PATHOGEN_REGISTRY.saureus.dot).toBe(15);
    expect(PATHOGEN_REGISTRY.aspergillus.dot).toBe(6);
  });
});

describe('derived PATHOGEN_DEFS / PATHOGEN_REWARDS', () => {
  it('PATHOGEN_DEFS 与 PATHOGEN_REGISTRY[t].def 引用一致', () => {
    for (const t of ALL_TYPES) {
      expect(PATHOGEN_DEFS[t]).toBe(PATHOGEN_REGISTRY[t].def);
    }
  });

  it('PATHOGEN_DEFS 数值与原版一致', () => {
    expect(PATHOGEN_DEFS.rhinovirus.maxHp).toBe(65);
    expect(PATHOGEN_DEFS.influenza.maxHp).toBe(30);
    expect(PATHOGEN_DEFS.ecoli.maxHp).toBe(50);
    expect(PATHOGEN_DEFS.saureus.maxHp).toBe(240);
    expect(PATHOGEN_DEFS.aspergillus.maxHp).toBe(50);
    expect(PATHOGEN_DEFS.aspergillus.flying).toBe(true);
  });

  it('PATHOGEN_REWARDS（v4：rhinovirus 8→4 减半，配套中后期数量提升）', () => {
    expect(PATHOGEN_REWARDS).toEqual({
      rhinovirus: 4,
      influenza: 5,
      ecoli: 7,
      saureus: 20,
      aspergillus: 10,
    });
  });
});
