import { describe, expect, it } from 'vitest';
import { createPathogen } from '@engine/game/entities';
import type { Tower } from '@engine/game/entities';
import type { NextIdFn } from '@engine/game/phases';
import { beginWave, tick } from '@engine/game/phases';
import { createInitialState } from '@engine/game/state';

function makeNextId(): NextIdFn {
  let n = 0;
  return (prefix: string) => `${prefix}-${++n}`;
}

describe('engine - 塔 hp 归零销毁端到端', () => {
  it('塔 hp 已经很低 + 相邻 rhinovirus → 单次 tick 销毁 + 返还 ATP + 发 TOWER_DESTROYED 事件', () => {
    // 起始 state（关 1，初始 atp=100）
    let s = { ...createInitialState(1), running: true };
    const entryRow = s.entries[0]?.row ?? 4;
    // 注入一个濒死塔 (hp=1)，放在 (1, entryRow) - ENTRY 起点附近
    const dyingTower: Tower = {
      id: 't-dying',
      type: 'macrophage',
      col: 1,
      row: entryRow,
      cooldownMs: 0,
      level: 1,
      totalInvested: 30,
      hp: 1,
      maxHp: 100,
      targetingPriority: 'first',
    };
    // 注入一个相邻 rhinovirus：path 起点在 (0,entryRow)，pathIndex=0 progress=0
    // 与塔 (1,entryRow) Chebyshev 距离 = 1，命中 DoT
    const pathogen = { ...createPathogen('p-1', 'rhinovirus'), pathIndex: 0, progress: 0 };
    const startAtp = s.atp;
    s = {
      ...s,
      towers: [dyingTower],
      pathogens: [pathogen],
    };
    // 进入 wave phase（不需要 spawner 真生成，已注入了病原）
    s = beginWave(s, 0).state;
    s = { ...s, pathogens: [pathogen] }; // beginWave 不动 pathogens，再确认

    // 单次 tick 1000ms：DoT 5 dmg > 1 hp → 塔死
    const r = tick(s, 1000, makeNextId());

    // 1. 塔从 state 移除
    expect(r.state.towers.find((t) => t.id === 't-dying')).toBeUndefined();
    expect(r.state.towers).toHaveLength(0);

    // 2. ATP 增加 floor(30 * 0.25) = 7
    expect(r.state.atp).toBe(startAtp + 7);

    // 3. events 含 TOWER_DESTROYED
    const destroyedEvent = r.events.find((e) => e.type === 'TOWER_DESTROYED');
    expect(destroyedEvent).toBeDefined();
    if (destroyedEvent && destroyedEvent.type === 'TOWER_DESTROYED') {
      expect(destroyedEvent.towerId).toBe('t-dying');
      expect(destroyedEvent.col).toBe(1);
      expect(destroyedEvent.row).toBe(entryRow);
      expect(destroyedEvent.refund).toBe(7);
    }
    // A6.3 起 fixed-path 模式塔死亡不再重算 currentPath（path 预设不变）
  });

  it('phases 透传 level.dotMultiplier：关 1 (0.7) 单 tick 1000ms DoT = 5*0.7 = 3.5', () => {
    // 关 1 dotMultiplier=0.7，1 鼻病毒 dot=5，dt=1000ms → 塔受伤 3.5 hp
    let s = { ...createInitialState(1), running: true };
    const entryRow = s.entries[0]?.row ?? 4;
    const tower: Tower = {
      id: 't-bait',
      type: 'macrophage',
      col: 1,
      row: entryRow,
      cooldownMs: 0,
      level: 1,
      totalInvested: 30,
      hp: 100,
      maxHp: 100,
      targetingPriority: 'first',
    };
    const pathogen = { ...createPathogen('p-1', 'rhinovirus'), pathIndex: 0, progress: 0 };
    s = { ...s, towers: [tower], pathogens: [pathogen] };
    s = beginWave(s, 0).state;
    s = { ...s, pathogens: [pathogen] };

    const r = tick(s, 1000, makeNextId());
    const damaged = r.state.towers.find((t) => t.id === 't-bait');
    expect(damaged).toBeDefined();
    // 关 1 dotMultiplier=0.7：100 - (5 * 1 * 0.7) = 96.5
    expect(damaged?.hp).toBeCloseTo(96.5, 5);
  });

  it('塔 hp 充足时不死：events 无 TOWER_DESTROYED，towers 仍含该塔', () => {
    let s = { ...createInitialState(1), running: true };
    const entryRow = s.entries[0]?.row ?? 4;
    const healthyTower: Tower = {
      id: 't-healthy',
      type: 'macrophage',
      col: 1,
      row: entryRow,
      cooldownMs: 0,
      level: 1,
      totalInvested: 30,
      hp: 100,
      maxHp: 100,
      targetingPriority: 'first',
    };
    const pathogen = { ...createPathogen('p-1', 'rhinovirus'), pathIndex: 0, progress: 0 };
    s = { ...s, towers: [healthyTower], pathogens: [pathogen] };
    s = beginWave(s, 0).state;
    s = { ...s, pathogens: [pathogen] };
    const startAtp = s.atp;

    const r = tick(s, 1000, makeNextId());
    expect(r.state.towers).toHaveLength(1);
    expect(r.events.find((e) => e.type === 'TOWER_DESTROYED')).toBeUndefined();
    // ATP 不会因为塔死而增加（kill 病原会涨，但单次 dt=1000ms 鼻病毒不会死）
    expect(r.state.atp).toBe(startAtp);
  });
});
