import { describe, expect, it } from 'vitest';
import type { WaveSpawn } from '@engine/game/data/waves';
import { summarizeComposition } from '@engine/ui/hud-panel';

describe('summarizeComposition', () => {
  it('空 composition：返回空数组', () => {
    expect(summarizeComposition([])).toEqual([]);
  });

  it('单 type：返回 1 项（modifier 字段全 false）', () => {
    const comp: WaveSpawn[] = [{ type: 'rhinovirus', count: 10 }];
    const r = summarizeComposition(comp);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      type: 'rhinovirus',
      count: 10,
      flying: false,
      boss: false,
      fortified: false,
      encapsulated: false,
      camouflaged: false,
    });
  });

  it('modifier 透出：camouflaged + encapsulated 标记为 true', () => {
    const comp: WaveSpawn[] = [
      { type: 'rhinovirus', count: 5, modifiers: ['camouflaged'] },
      { type: 'ecoli', count: 3, modifiers: ['encapsulated'] },
    ];
    const r = summarizeComposition(comp);
    const rhino = r.find((i) => i.type === 'rhinovirus');
    const ecoli = r.find((i) => i.type === 'ecoli');
    expect(rhino?.camouflaged).toBe(true);
    expect(ecoli?.encapsulated).toBe(true);
  });

  it('fortified 自动让 boss=true（即使 maxHp < 200）', () => {
    const comp: WaveSpawn[] = [{ type: 'rhinovirus', count: 1, modifiers: ['fortified'] }];
    const r = summarizeComposition(comp);
    expect(r[0]?.boss).toBe(true);
    expect(r[0]?.fortified).toBe(true);
  });

  it('同 type 出现多次：count 累加成一项（防止 wave config 写两次同 type 时 UI 漏数）', () => {
    const comp: WaveSpawn[] = [
      { type: 'rhinovirus', count: 5 },
      { type: 'rhinovirus', count: 3 },
    ];
    const r = summarizeComposition(comp);
    expect(r).toHaveLength(1);
    expect(r[0]?.count).toBe(8);
  });

  it('aspergillus 标 flying:true（飞行机制），其它仍 false', () => {
    const comp: WaveSpawn[] = [
      { type: 'rhinovirus', count: 5 },
      { type: 'aspergillus', count: 3 },
    ];
    const r = summarizeComposition(comp);
    const rhino = r.find((i) => i.type === 'rhinovirus');
    const asp = r.find((i) => i.type === 'aspergillus');
    expect(rhino?.flying).toBe(false);
    expect(asp?.flying).toBe(true);
  });

  it('saureus（HP=240）标 boss:true；HP<200 的 type 标 false', () => {
    const comp: WaveSpawn[] = [
      { type: 'rhinovirus', count: 5 }, // HP 65
      { type: 'saureus', count: 1 }, // HP 240 → boss
    ];
    const r = summarizeComposition(comp);
    const rhino = r.find((i) => i.type === 'rhinovirus');
    const sau = r.find((i) => i.type === 'saureus');
    expect(rhino?.boss).toBe(false);
    expect(sau?.boss).toBe(true);
  });

  it('混合：3 type 各自标记正确（关 10 风格 boss + 飞行 + 普通组合）', () => {
    const comp: WaveSpawn[] = [
      { type: 'saureus', count: 1 },
      { type: 'aspergillus', count: 8 },
      { type: 'influenza', count: 12 },
    ];
    const r = summarizeComposition(comp);
    expect(r).toHaveLength(3);
    expect(r.find((i) => i.type === 'saureus')?.boss).toBe(true);
    expect(r.find((i) => i.type === 'aspergillus')?.flying).toBe(true);
    expect(r.find((i) => i.type === 'influenza')?.boss).toBe(false);
    expect(r.find((i) => i.type === 'influenza')?.flying).toBe(false);
  });
});
