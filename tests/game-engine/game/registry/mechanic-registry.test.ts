import { describe, expect, it } from 'vitest';
import type { GameMechanic } from '@engine/game/data/levels';
import {
  MECHANIC_REGISTRY,
  getMechanicMeta,
} from '@engine/game/registry/mechanic-registry';

const ALL_MECHANICS: readonly GameMechanic[] = [
  'tower-hp',
  'no-build-zone',
  'multi-entry',
  'protected-cells',
  'helper-tower',
  'mobile-tower',
  'carry-limit',
  'complement-system',
  'immune-evasion',
];

describe('MECHANIC_REGISTRY', () => {
  it('全部 9 种 GameMechanic 都在注册表中（exhaustiveness）', () => {
    for (const m of ALL_MECHANICS) {
      expect(MECHANIC_REGISTRY[m]).toBeDefined();
      expect(MECHANIC_REGISTRY[m].id).toBe(m);
    }
    expect(Object.keys(MECHANIC_REGISTRY).sort()).toEqual([...ALL_MECHANICS].sort());
  });

  it('每条 entry 含 title / description / scientificNote 非空字符串 + iconColor', () => {
    for (const m of ALL_MECHANICS) {
      const meta = MECHANIC_REGISTRY[m];
      expect(typeof meta.title).toBe('string');
      expect(meta.title.length).toBeGreaterThan(0);
      expect(typeof meta.description).toBe('string');
      expect(meta.description.length).toBeGreaterThan(0);
      expect(typeof meta.scientificNote).toBe('string');
      expect(meta.scientificNote.length).toBeGreaterThan(0);
      expect(typeof meta.iconColor).toBe('number');
    }
  });

  it("getMechanicMeta('tower-hp') 返回正确 entry", () => {
    const meta = getMechanicMeta('tower-hp');
    expect(meta.id).toBe('tower-hp');
    expect(meta.title).toBe('细胞损伤');
    expect(meta.iconColor).toBe(0x44ff88);
  });

  it("getMechanicMeta('immune-evasion') 返回正确 entry", () => {
    const meta = getMechanicMeta('immune-evasion');
    expect(meta.id).toBe('immune-evasion');
    expect(meta.title).toBe('免疫逃逸');
  });
});
