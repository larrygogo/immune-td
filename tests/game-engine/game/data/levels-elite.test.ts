import { describe, expect, it } from 'vitest';
import { getEliteLevel, getLevel } from '@engine/game/data/levels';

describe('getEliteLevel', () => {
  it('title 加「（精英）」后缀', () => {
    const base = getLevel(2);
    const elite = getEliteLevel(2);
    expect(elite.title).toBe(`${base.title}（精英）`);
  });

  it('id / chapter / initialHp / initialAtp 与 base 一致', () => {
    const base = getLevel(2);
    const elite = getEliteLevel(2);
    expect(elite.id).toBe(base.id);
    expect(elite.chapter).toBe(base.chapter);
    expect(elite.initialHp).toBe(base.initialHp);
    expect(elite.initialAtp).toBe(base.initialAtp);
  });

  it('所有 wave 的所有 spawn 段都加上 fortified modifier', () => {
    const elite = getEliteLevel(2);
    for (const wave of elite.waves) {
      for (const spawn of wave.composition) {
        expect(spawn.modifiers).toContain('fortified');
      }
    }
  });

  it('已有 modifier 保留且不重复（去重）', () => {
    const elite = getEliteLevel(11);
    for (const wave of elite.waves) {
      for (const spawn of wave.composition) {
        const fortifiedCount = spawn.modifiers?.filter((m) => m === 'fortified').length ?? 0;
        expect(fortifiedCount).toBe(1);
      }
    }
  });

  it('关 11（已有 fortified spawn）：不会因为派生重复出现 fortified', () => {
    const base = getLevel(11);
    const elite = getEliteLevel(11);
    expect(elite.waves.length).toBe(base.waves.length);
    // 关 11 base 已有 fortified spawn 段；elite 派生后 fortified 仍仅出现一次
    for (let i = 0; i < base.waves.length; i++) {
      expect(elite.waves[i]?.composition.length).toBe(base.waves[i]?.composition.length);
    }
  });

  it('id 未配置时抛错（透传 getLevel 行为）', () => {
    expect(() => getEliteLevel(999)).toThrow();
  });

  it('base level 不被 mutate（派生纯函数）', () => {
    const before = getLevel(2);
    const beforeFirstSpawn = before.waves[0]?.composition[0];
    const beforeModifiers = beforeFirstSpawn?.modifiers;
    getEliteLevel(2);
    const after = getLevel(2);
    expect(after.waves[0]?.composition[0]?.modifiers).toBe(beforeModifiers);
  });
});
