import { describe, expect, it } from 'vitest';
import {
  ZERO_MODIFIERS,
  computeResearchModifiers,
} from '@engine/game/registry/research-modifiers';

describe('computeResearchModifiers', () => {
  it('空 unlock 列表：返回 ZERO_MODIFIERS（无任何加成）', () => {
    const m = computeResearchModifiers([]);
    expect(m).toEqual(ZERO_MODIFIERS);
  });

  it('mac-aoe → macrophage.aoeBonus = 0.5', () => {
    const m = computeResearchModifiers(['mac-aoe']);
    expect(m.macrophage.aoeBonus).toBe(0.5);
    expect(m.macrophage.hpMultiplier).toBe(1); // 其他不动
  });

  it('mac-hp → macrophage.hpMultiplier = 1.3', () => {
    const m = computeResearchModifiers(['mac-hp']);
    expect(m.macrophage.hpMultiplier).toBe(1.3);
  });

  it('mac-m1 → macrophage.m1Polarized = true（行为类，第一版未实装）', () => {
    const m = computeResearchModifiers(['mac-m1']);
    expect(m.macrophage.m1Polarized).toBe(true);
  });

  it('neu-rate → neutrophil.rateMultiplier = 0.85（间隔 -15%）', () => {
    const m = computeResearchModifiers(['neu-rate']);
    expect(m.neutrophil.rateMultiplier).toBe(0.85);
  });

  it('neu-dmg → neutrophil.dmgMultiplier = 1.25（伤害 +25%）', () => {
    const m = computeResearchModifiers(['neu-dmg']);
    expect(m.neutrophil.dmgMultiplier).toBe(1.25);
  });

  it('neu-net → neutrophil.netActive = true（行为类）', () => {
    const m = computeResearchModifiers(['neu-net']);
    expect(m.neutrophil.netActive).toBe(true);
  });

  it('nk-range → nkcell.rangeBonus = 0.5', () => {
    const m = computeResearchModifiers(['nk-range']);
    expect(m.nkcell.rangeBonus).toBe(0.5);
  });

  it('nk-crit → nkcell.critChance = 0.2（20% 概率暴击）', () => {
    const m = computeResearchModifiers(['nk-crit']);
    expect(m.nkcell.critChance).toBe(0.2);
  });

  it('nk-adcc → nkcell.adccActive = true（行为类）', () => {
    const m = computeResearchModifiers(['nk-adcc']);
    expect(m.nkcell.adccActive).toBe(true);
  });

  it('den-radius → dendritic.radiusBonus = 0.5', () => {
    const m = computeResearchModifiers(['den-radius']);
    expect(m.dendritic.radiusBonus).toBe(0.5);
  });

  it('den-buff → dendritic.buffMultiplier = 1.2（buff ×1.2 → 例 1.2 → 1.44）', () => {
    const m = computeResearchModifiers(['den-buff']);
    expect(m.dendritic.buffMultiplier).toBe(1.2);
  });

  it('den-th1 → dendritic.th1Active = true（行为类）', () => {
    const m = computeResearchModifiers(['den-th1']);
    expect(m.dendritic.th1Active).toBe(true);
  });

  it('全购 15 个 modifier（含 mit）：每塔字段都生效', () => {
    const all = [
      'mac-aoe',
      'mac-hp',
      'mac-m1',
      'neu-rate',
      'neu-dmg',
      'neu-net',
      'nk-range',
      'nk-crit',
      'nk-adcc',
      'den-radius',
      'den-buff',
      'den-th1',
      'mit-yield',
      'mit-hp',
      'mit-amp',
    ];
    const m = computeResearchModifiers(all);
    expect(m).toEqual({
      macrophage: { aoeBonus: 0.5, hpMultiplier: 1.3, m1Polarized: true },
      neutrophil: { rateMultiplier: 0.85, dmgMultiplier: 1.25, netActive: true },
      nkcell: { rangeBonus: 0.5, critChance: 0.2, adccActive: true },
      dendritic: { radiusBonus: 0.5, buffMultiplier: 1.2, th1Active: true },
      mitochondria: { yieldMultiplier: 1.25, hpMultiplier: 1.3, ampActive: true },
    });
  });

  it('未知 id（mac-lv2 / mac-lv3 等）不影响 modifier（仅 unlock 不带 buff）', () => {
    const m = computeResearchModifiers(['mac-lv2', 'mac-lv3', 'unknown-id']);
    expect(m).toEqual(ZERO_MODIFIERS);
  });
});
