import { describe, expect, it } from 'vitest';
import type { Pathogen } from '@engine/game/entities';
import {
  type SingleTargetCandidate,
  selectTargetByPriority,
} from '@engine/game/systems/combat';

/** 简化构造一只 pathogen，只填 selectTargetByPriority 关心的字段。 */
function mockPathogen(id: string, hp: number): Pathogen {
  return {
    id,
    type: 'rhinovirus',
    pathIndex: 0,
    progress: 0,
    hp,
    maxHp: hp,
    alive: true,
    reachedExit: false,
    flying: false,
    offsetX: 0,
    offsetY: 0,
    speedMultiplier: 1,
    path: [],
    slowMs: 0,
    modifiers: [],
  };
}

function candidate(
  id: string,
  hp: number,
  key: number,
  dist: number,
  index: number,
): SingleTargetCandidate {
  return { pathogen: mockPathogen(id, hp), index, key, dist };
}

describe('selectTargetByPriority', () => {
  it('空数组：返回 null', () => {
    expect(selectTargetByPriority([], 'first')).toBeNull();
    expect(selectTargetByPriority([], 'last')).toBeNull();
    expect(selectTargetByPriority([], 'strong')).toBeNull();
    expect(selectTargetByPriority([], 'close')).toBeNull();
  });

  it("'first'：选 key 最大者（最靠近出口）", () => {
    const inRange: SingleTargetCandidate[] = [
      candidate('p-a', 50, 1.5, 100, 0),
      candidate('p-b', 30, 3.2, 200, 1), // 路径推进度最高
      candidate('p-c', 80, 2.0, 50, 2),
    ];
    const r = selectTargetByPriority(inRange, 'first');
    expect(r?.pathogen.id).toBe('p-b');
  });

  it("'last'：选 key 最小者（最远离出口）", () => {
    const inRange: SingleTargetCandidate[] = [
      candidate('p-a', 50, 1.5, 100, 0),
      candidate('p-b', 30, 3.2, 200, 1),
      candidate('p-c', 80, 0.3, 50, 2), // 路径推进度最低
    ];
    const r = selectTargetByPriority(inRange, 'last');
    expect(r?.pathogen.id).toBe('p-c');
  });

  it("'strong'：选 hp 最高者（金葡 boss 优先）", () => {
    const inRange: SingleTargetCandidate[] = [
      candidate('p-rhino', 50, 1.5, 100, 0),
      candidate('p-saureus', 240, 0.5, 200, 1), // hp 最高
      candidate('p-flu', 30, 3.2, 50, 2),
    ];
    const r = selectTargetByPriority(inRange, 'strong');
    expect(r?.pathogen.id).toBe('p-saureus');
  });

  it("'strong' 二级排序：hp 相同时回退 'first'（key 最大）", () => {
    const inRange: SingleTargetCandidate[] = [
      candidate('p-a', 100, 1.0, 100, 0),
      candidate('p-b', 100, 2.5, 200, 1), // hp 相同 → key 大者赢
      candidate('p-c', 100, 0.5, 50, 2),
    ];
    const r = selectTargetByPriority(inRange, 'strong');
    expect(r?.pathogen.id).toBe('p-b');
  });

  it("'close'：选 dist 最小者（距塔最近）", () => {
    const inRange: SingleTargetCandidate[] = [
      candidate('p-a', 50, 1.5, 100, 0),
      candidate('p-b', 30, 3.2, 200, 1),
      candidate('p-c', 80, 2.0, 25, 2), // dist 最小
    ];
    const r = selectTargetByPriority(inRange, 'close');
    expect(r?.pathogen.id).toBe('p-c');
  });

  it("'close' 二级排序：dist 相同时回退 'first'（key 最大）", () => {
    const inRange: SingleTargetCandidate[] = [
      candidate('p-a', 50, 1.0, 100, 0),
      candidate('p-b', 50, 3.2, 100, 1), // dist 相同 → key 大者赢
      candidate('p-c', 50, 0.5, 100, 2),
    ];
    const r = selectTargetByPriority(inRange, 'close');
    expect(r?.pathogen.id).toBe('p-b');
  });

  it("'first' 与现有'优先靠近出口'行为完全等价（默认行为兼容）", () => {
    // 这是 Plan Task 1.2 的关键回归保护：默认 'first' 选择结果应等同 v4 之前
    const inRange: SingleTargetCandidate[] = [
      candidate('p-far', 50, 4.5, 200, 0), // 最靠近出口
      candidate('p-mid', 50, 2.0, 100, 1),
      candidate('p-near', 50, 0.3, 50, 2), // 刚出生
    ];
    const r = selectTargetByPriority(inRange, 'first');
    expect(r?.pathogen.id).toBe('p-far');
    expect(r?.index).toBe(0);
  });

  it('nk-adcc：adccActive=true 时优先选 inAdccZone 候选，无则回退全集', () => {
    // 最靠近出口的不在 zone 里，zone 内只有较弱的目标 → adcc 选 zone 内
    const inRange: SingleTargetCandidate[] = [
      { ...candidate('p-far-out', 50, 4.5, 200, 0), inAdccZone: false },
      { ...candidate('p-mid-in', 50, 2.0, 100, 1), inAdccZone: true },
      { ...candidate('p-near-out', 50, 0.3, 50, 2), inAdccZone: false },
    ];
    const r = selectTargetByPriority(inRange, 'first', true);
    expect(r?.pathogen.id).toBe('p-mid-in');
  });

  it('nk-adcc：zone 内无目标时回退全集（不强制只在 zone 选）', () => {
    const inRange: SingleTargetCandidate[] = [
      { ...candidate('p-a', 50, 3.0, 100, 0), inAdccZone: false },
      { ...candidate('p-b', 50, 1.0, 50, 1), inAdccZone: false },
    ];
    const r = selectTargetByPriority(inRange, 'first', true);
    expect(r?.pathogen.id).toBe('p-a'); // first 选 key 最大
  });

  it('adccActive=false：忽略 inAdccZone 标记，等同正常 priority', () => {
    const inRange: SingleTargetCandidate[] = [
      { ...candidate('p-far-out', 50, 4.5, 200, 0), inAdccZone: false },
      { ...candidate('p-mid-in', 50, 2.0, 100, 1), inAdccZone: true },
    ];
    const r = selectTargetByPriority(inRange, 'first', false);
    expect(r?.pathogen.id).toBe('p-far-out'); // 不看 zone，纯按 first
  });
});
