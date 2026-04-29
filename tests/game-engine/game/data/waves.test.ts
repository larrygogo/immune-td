import { describe, expect, it } from 'vitest';
import {
  INITIAL_BUILD_MS,
  INTER_WAVE_BUILD_MS,
  expandComposition,
} from '@engine/game/data/waves';

describe('waves', () => {
  it('首次建造阶段 15s，波间 10s', () => {
    expect(INITIAL_BUILD_MS).toBe(15000);
    expect(INTER_WAVE_BUILD_MS).toBe(10000);
  });
});

describe('expandComposition', () => {
  it('单 type：展开为同 type 重复（item.type 比对）', () => {
    const queue = expandComposition([{ type: 'rhinovirus', count: 3 }]);
    expect(queue.map((q) => q.type)).toEqual(['rhinovirus', 'rhinovirus', 'rhinovirus']);
    expect(queue.every((q) => q.modifiers.length === 0)).toBe(true);
  });

  it('两 type round-robin', () => {
    const queue = expandComposition([
      { type: 'rhinovirus', count: 3 },
      { type: 'influenza', count: 2 },
    ]);
    expect(queue.map((q) => q.type)).toEqual([
      'rhinovirus',
      'influenza',
      'rhinovirus',
      'influenza',
      'rhinovirus',
    ]);
  });

  it('某 type 先用完后继续另一 type', () => {
    const queue = expandComposition([
      { type: 'rhinovirus', count: 1 },
      { type: 'influenza', count: 3 },
    ]);
    expect(queue.map((q) => q.type)).toEqual(['rhinovirus', 'influenza', 'influenza', 'influenza']);
  });

  it('空 composition 返回空数组', () => {
    expect(expandComposition([])).toEqual([]);
  });

  it('count=0 的条目被忽略', () => {
    const queue = expandComposition([
      { type: 'rhinovirus', count: 2 },
      { type: 'influenza', count: 0 },
    ]);
    expect(queue.map((q) => q.type)).toEqual(['rhinovirus', 'rhinovirus']);
  });

  it('modifiers 透传到 queue 每一项', () => {
    const queue = expandComposition([
      { type: 'rhinovirus', count: 2, modifiers: ['camouflaged'] },
      { type: 'influenza', count: 1, modifiers: ['fortified', 'regrow'] },
    ]);
    expect(queue).toHaveLength(3);
    // round-robin 顺序：rhino, flu, rhino
    expect(queue[0]).toEqual({ type: 'rhinovirus', modifiers: ['camouflaged'] });
    expect(queue[1]).toEqual({ type: 'influenza', modifiers: ['fortified', 'regrow'] });
    expect(queue[2]).toEqual({ type: 'rhinovirus', modifiers: ['camouflaged'] });
  });
});
