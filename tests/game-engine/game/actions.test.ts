import { describe, expect, it } from 'vitest';
import {
  placeTower,
  reset,
  sellTower,
  setSpeed,
  setTargetingPriority,
  startWave,
  upgradeTower,
} from '@engine/game/actions';
import type { NextIdFn } from '@engine/game/phases';
import { beginWave } from '@engine/game/phases';
import { createInitialState } from '@engine/game/state';

function makeNextId(): NextIdFn {
  let n = 0;
  return (prefix: string) => `${prefix}-${++n}`;
}

describe('placeTower', () => {
  it('成功：扣 30 ATP，towers+1，currentPath 更新，发 TOWER_PLACED', () => {
    const s = createInitialState(1);
    const r = placeTower(s, 1, 1, 'macrophage', makeNextId());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.atp).toBe(70);
    expect(r.state.towers).toHaveLength(1);
    expect(r.state.towers[0]?.col).toBe(1);
    expect(r.state.towers[0]?.row).toBe(1);
    expect(r.state.towers[0]?.level).toBe(1);
    expect(r.state.towers[0]?.totalInvested).toBe(30);
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toEqual({
      type: 'TOWER_PLACED',
      towerId: 't-1',
      towerType: 'macrophage',
      x: 1,
      y: 1,
    });
  });

  it('ATP 不足 → ok=false + error=ERROR_NOT_ENOUGH_ATP + state 不变', () => {
    const s = { ...createInitialState(1), atp: 10 };
    const r = placeTower(s, 1, 1, 'macrophage', makeNextId());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('ERROR_NOT_ENOUGH_ATP');
    expect(r.state).toBe(s);
    expect(r.events).toEqual([{ type: 'ERROR_NOT_ENOUGH_ATP' }]);
  });

  it('入口格（entry）上不能放 → ERROR_INVALID_PLACEMENT', () => {
    const s = createInitialState(1);
    const entry = s.entries[0];
    if (!entry) throw new Error('no entry');
    const r = placeTower(s, entry.col, entry.row, 'macrophage', makeNextId());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('ERROR_INVALID_PLACEMENT');
  });

  it('同一位置重复放 → ERROR_INVALID_PLACEMENT', () => {
    const s0 = createInitialState(1);
    const r1 = placeTower(s0, 1, 1, 'macrophage', makeNextId());
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const r2 = placeTower(r1.state, 1, 1, 'macrophage', makeNextId());
    expect(r2.ok).toBe(false);
    if (r2.ok) return;
    expect(r2.error).toBe('ERROR_INVALID_PLACEMENT');
  });

  it('wave 阶段也允许放塔（v4：build/wave 都开放）', () => {
    const initial = beginWave({ ...createInitialState(1), running: true }, 0).state;
    expect(initial.phase).toBe('wave');
    // A6：fallback 占位路径覆盖 (5,5)，注入空 pathCellSet 让本用例专测 phase 校验
    const s = { ...initial, pathCellSet: new Set<string>() };
    const r = placeTower(s, 5, 5, 'macrophage', makeNextId());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.towers).toHaveLength(1);
  });

  it('complete 阶段不可放塔 → ERROR_INVALID_PLACEMENT', () => {
    const s: ReturnType<typeof createInitialState> = {
      ...createInitialState(1),
      phase: 'complete',
    };
    const r = placeTower(s, 5, 5, 'macrophage', makeNextId());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('ERROR_INVALID_PLACEMENT');
    expect(r.state.towers).toHaveLength(0);
  });

  // A6.3 删除：fixed-path 模式下 path 预设、塔不影响 path，无"断路"概念。
  // 原"断路 ERROR_BLOCKS_PATH" / "放塔后 currentPath 绕过塔" 测试随之废弃。

  it('禁建格被拒 → ERROR_BLOCKED_CELL，state 不变', () => {
    const s0 = createInitialState(1);
    const s = { ...s0, blockedCells: [{ col: 2, row: 3 }] as const };
    const r = placeTower(s, 2, 3, 'macrophage', makeNextId());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('ERROR_BLOCKED_CELL');
    expect(r.state.atp).toBe(s.atp);
    expect(r.state.towers).toHaveLength(0);
    expect(r.events).toEqual([{ type: 'ERROR_BLOCKED_CELL' }]);
  });

  it('其他格不受禁建影响：blockedCells 含 (2,3) 时 (1,1) 仍可放', () => {
    const s0 = createInitialState(1);
    const s = { ...s0, blockedCells: [{ col: 2, row: 3 }] as const };
    const r = placeTower(s, 1, 1, 'macrophage', makeNextId());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.towers).toHaveLength(1);
    expect(r.state.towers[0]?.col).toBe(1);
    expect(r.state.towers[0]?.row).toBe(1);
  });

  it('路径回退 · A3：放塔到 pathCellSet 中的格子被拒 → ERROR_ON_PATH', () => {
    const s0 = createInitialState(1);
    const s = { ...s0, pathCellSet: new Set(['1,1']) };
    const r = placeTower(s, 1, 1, 'macrophage', makeNextId());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('ERROR_ON_PATH');
    expect(r.state.atp).toBe(s.atp);
    expect(r.state.towers).toHaveLength(0);
    expect(r.events).toEqual([{ type: 'ERROR_ON_PATH' }]);
  });

  it('路径回退 · A3：路径外的格子仍可放（pathCellSet 仅含 (1,1) 时 (2,2) 可放）', () => {
    const s0 = createInitialState(1);
    const s = { ...s0, pathCellSet: new Set(['1,1']) };
    const r = placeTower(s, 2, 2, 'macrophage', makeNextId());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.towers).toHaveLength(1);
  });

  it('路径回退 · A3：错误优先级 blocked > ERROR_ON_PATH（同一格既 blocked 又 on-path → 返回 ERROR_BLOCKED_CELL）', () => {
    const s0 = createInitialState(1);
    const s = {
      ...s0,
      blockedCells: [{ col: 1, row: 1 }] as const,
      pathCellSet: new Set(['1,1']),
    };
    const r = placeTower(s, 1, 1, 'macrophage', makeNextId());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('ERROR_BLOCKED_CELL');
  });
});

describe('upgradeTower', () => {
  it('Lv1 → Lv2：扣 55 ATP, level=2, totalInvested=85, 发 TOWER_UPGRADED', () => {
    const s0 = createInitialState(1);
    const p = placeTower(s0, 1, 1, 'macrophage', makeNextId());
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const towerId = p.state.towers[0]?.id;
    if (!towerId) throw new Error('no tower');
    const r = upgradeTower(p.state, towerId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.atp).toBe(15); // 100 - 30 (place) - 55 (upgrade)
    expect(r.state.towers[0]?.level).toBe(2);
    expect(r.state.towers[0]?.totalInvested).toBe(85);
    expect(r.events).toEqual([{ type: 'TOWER_UPGRADED', towerId, newLevel: 2 }]);
  });

  it('塔不存在：ok=false，空事件，state 不变', () => {
    const s = createInitialState(1);
    const r = upgradeTower(s, 'does-not-exist');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.events).toEqual([]);
    expect(r.state).toBe(s);
  });

  it('ATP 不足 → ERROR_NOT_ENOUGH_ATP, 塔不升级', () => {
    const s0 = createInitialState(1);
    const p = placeTower(s0, 1, 1, 'macrophage', makeNextId());
    if (!p.ok) throw new Error('place failed');
    const towerId = p.state.towers[0]?.id;
    if (!towerId) throw new Error('no tower');
    const r = upgradeTower({ ...p.state, atp: 10 }, towerId);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('ERROR_NOT_ENOUGH_ATP');
  });

  it('满级不能再升：upgradeCost=null 的 Lv3 塔 → ERROR_INVALID_PLACEMENT', () => {
    const s0 = createInitialState(1);
    const p = placeTower(s0, 1, 1, 'macrophage', makeNextId());
    if (!p.ok) throw new Error('place failed');
    const towerId = p.state.towers[0]?.id;
    if (!towerId) throw new Error('no tower');
    // 直接把塔改成 Lv3
    const state3 = {
      ...p.state,
      atp: 999,
      towers: p.state.towers.map((t) => ({ ...t, level: 3 as const })),
    };
    const r = upgradeTower(state3, towerId);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('ERROR_INVALID_PLACEMENT');
  });

  it('wave 阶段也允许升级（v4：build/wave 都开放）', () => {
    const s0 = createInitialState(1);
    const p = placeTower(s0, 1, 1, 'macrophage', makeNextId());
    if (!p.ok) throw new Error('place failed');
    const towerId = p.state.towers[0]?.id;
    if (!towerId) throw new Error('no tower');
    const waveState = beginWave({ ...p.state, running: true }, 0).state;
    const r = upgradeTower(waveState, towerId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.towers[0]?.level).toBe(2);
  });

  it('升级回满 HP - 残血升级：Lv1 hp=70 升 Lv2 后 hp=200 / maxHp=200（v4）', () => {
    const s0 = createInitialState(1);
    const p = placeTower(s0, 1, 1, 'macrophage', makeNextId());
    if (!p.ok) throw new Error('place failed');
    const towerId = p.state.towers[0]?.id;
    if (!towerId) throw new Error('no tower');
    // 手动把塔打成残血（v4: Lv1 maxHp=140，hp=70 算半血）
    const stateDamaged: typeof p.state = {
      ...p.state,
      towers: p.state.towers.map((t) => (t.id === towerId ? { ...t, hp: 70 } : t)),
    };
    const r = upgradeTower(stateDamaged, towerId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.towers[0]?.hp).toBe(200);
    expect(r.state.towers[0]?.maxHp).toBe(200);
  });

  it('升级回满 HP - 满血升级：Lv1 hp=140 升 Lv2 后 hp=200 / maxHp=200（v4）', () => {
    const s0 = createInitialState(1);
    const p = placeTower(s0, 1, 1, 'macrophage', makeNextId());
    if (!p.ok) throw new Error('place failed');
    const towerId = p.state.towers[0]?.id;
    if (!towerId) throw new Error('no tower');
    // v4: Lv1 默认 hp=140=maxHp，升级 Lv2 后刷到 200
    expect(p.state.towers[0]?.hp).toBe(140);
    expect(p.state.towers[0]?.maxHp).toBe(140);
    const r = upgradeTower(p.state, towerId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.towers[0]?.hp).toBe(200);
    expect(r.state.towers[0]?.maxHp).toBe(200);
  });
});

describe('sellTower', () => {
  it('Lv1 拆除：返还 15 ATP (floor(30 * 0.5))，塔移除，发 TOWER_SOLD', () => {
    const s0 = createInitialState(1);
    const p = placeTower(s0, 1, 1, 'macrophage', makeNextId());
    if (!p.ok) throw new Error('place failed');
    const towerId = p.state.towers[0]?.id;
    if (!towerId) throw new Error('no tower');
    const r = sellTower(p.state, towerId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.atp).toBe(85); // 70 + 15
    expect(r.state.towers).toHaveLength(0);
    expect(r.events).toEqual([{ type: 'TOWER_SOLD', towerId, refund: 15 }]);
  });

  it('Lv2 拆除：返还 42 ATP (floor(85 * 0.5))', () => {
    const s0 = createInitialState(1);
    const p = placeTower(s0, 1, 1, 'macrophage', makeNextId());
    if (!p.ok) throw new Error('place failed');
    const towerId = p.state.towers[0]?.id;
    if (!towerId) throw new Error('no tower');
    const u = upgradeTower(p.state, towerId);
    if (!u.ok) throw new Error('upgrade failed');
    const r = sellTower(u.state, towerId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.atp).toBe(57); // 15 (剩余) + 42 (返还)
  });

  // A6.3 删除：fixed-path 模式下拆塔不重算 currentPath（path 预设不变）

  it('wave 阶段也允许拆塔（v4：build/wave 都开放）', () => {
    const s0 = createInitialState(1);
    const p = placeTower(s0, 1, 1, 'macrophage', makeNextId());
    if (!p.ok) throw new Error('place failed');
    const towerId = p.state.towers[0]?.id;
    if (!towerId) throw new Error('no tower');
    const waveState = beginWave({ ...p.state, running: true }, 0).state;
    const r = sellTower(waveState, towerId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.towers).toHaveLength(0);
  });

  it('塔不存在：ok=false，空事件', () => {
    const s = createInitialState(1);
    const r = sellTower(s, 'nope');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.events).toEqual([]);
  });
});

describe('startWave', () => {
  it('build 阶段立即切到 wave，发 WAVE_STARTED', () => {
    const s = { ...createInitialState(1), running: true };
    const r = startWave(s);
    expect(r.state.phase).toBe('wave');
    // 关 1 第一波基础数量 12，countVariance=2 → [10,14]
    expect(r.state.spawner.queue.length).toBeGreaterThanOrEqual(10);
    expect(r.state.spawner.queue.length).toBeLessThanOrEqual(14);
    expect(r.events).toEqual([{ type: 'WAVE_STARTED', waveIndex: 0 }]);
  });

  it('非 build 阶段：state 不变，空事件', () => {
    const s = beginWave({ ...createInitialState(1), running: true }, 0).state;
    const r = startWave(s);
    expect(r.state).toBe(s);
    expect(r.events).toEqual([]);
  });
});

describe('setTargetingPriority', () => {
  it('build 阶段切换 priority：state.towers[0].targetingPriority 更新 + 发 TOWER_PRIORITY_CHANGED', () => {
    const s0 = createInitialState(1);
    const place = placeTower(s0, 1, 1, 'neutrophil', makeNextId());
    if (!place.ok) throw new Error('place failed');
    const towerId = place.state.towers[0]?.id;
    if (!towerId) throw new Error('no towerId');
    expect(place.state.towers[0]?.targetingPriority).toBe('first');

    const r = setTargetingPriority(place.state, towerId, 'last');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.towers[0]?.targetingPriority).toBe('last');
    expect(r.events).toEqual([{ type: 'TOWER_PRIORITY_CHANGED', towerId, priority: 'last' }]);
  });

  it('wave 阶段也允许切换（与 placeTower / upgradeTower 同 phase 校验）', () => {
    const s0 = createInitialState(1);
    const place = placeTower(s0, 1, 1, 'neutrophil', makeNextId());
    if (!place.ok) throw new Error('place failed');
    const towerId = place.state.towers[0]?.id;
    if (!towerId) throw new Error('no towerId');
    const waveState = beginWave({ ...place.state, running: true }, 0).state;
    const r = setTargetingPriority(waveState, towerId, 'strong');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.towers[0]?.targetingPriority).toBe('strong');
  });

  it('towerId 不存在：返回 ERROR_TOWER_NOT_FOUND', () => {
    const s = { ...createInitialState(1), running: true };
    const r = setTargetingPriority(s, 'nonexistent-id', 'last');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('ERROR_TOWER_NOT_FOUND');
    expect(r.state).toBe(s);
  });
});

describe('setSpeed', () => {
  it('设置 speedMultiplier', () => {
    const s = createInitialState(1);
    const s2 = setSpeed(s, 2);
    expect(s2.speedMultiplier).toBe(2);
    const s3 = setSpeed(s2, 3);
    expect(s3.speedMultiplier).toBe(3);
  });
});

describe('reset', () => {
  it('重置到初始状态（同 levelId）', () => {
    const s0 = createInitialState(1);
    const p = placeTower(s0, 1, 1, 'macrophage', makeNextId());
    if (!p.ok) throw new Error('place failed');
    const r = reset(p.state);
    expect(r.towers).toHaveLength(0);
    expect(r.atp).toBe(100);
    expect(r.hp).toBe(10);
    expect(r.levelId).toBe(1);
    expect(r.currentPath[0]?.col).toBe(0);
    expect(r.currentPath[r.currentPath.length - 1]?.col).toBe(9);
  });
});
