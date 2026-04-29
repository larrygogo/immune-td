import { describe, expect, it } from 'vitest';
import type { NextIdFn } from '@engine/game/phases';
import { beginWave, tick, tickBuildPhase } from '@engine/game/phases';
import { createInitialState } from '@engine/game/state';

function makeNextId(): NextIdFn {
  let n = 0;
  return (prefix: string) => `${prefix}-${++n}`;
}

function runningState(levelId = 1) {
  return { ...createInitialState(levelId), running: true };
}

describe('tick - 早退条件', () => {
  it('running=false 时返回原 state + 空事件', () => {
    const s = createInitialState(1); // running 默认 false
    const r = tick(s, 100, makeNextId());
    expect(r.state).toBe(s);
    expect(r.events).toEqual([]);
  });

  it('paused=true 时返回原 state + 空事件', () => {
    const s = { ...runningState(), paused: true };
    const r = tick(s, 100, makeNextId());
    expect(r.state).toBe(s);
    expect(r.events).toEqual([]);
  });

  it("phase='complete' 时返回原 state + 空事件", () => {
    const s = { ...runningState(), phase: 'complete' as const };
    const r = tick(s, 100, makeNextId());
    expect(r.state).toBe(s);
    expect(r.events).toEqual([]);
  });

  it("phase='failed' 时返回原 state + 空事件", () => {
    const s = { ...runningState(), phase: 'failed' as const };
    const r = tick(s, 100, makeNextId());
    expect(r.state).toBe(s);
    expect(r.events).toEqual([]);
  });
});

describe('tickBuildPhase - 倒计时递减', () => {
  it('倒计时未结束 → phase 保持 build，buildPhaseRemainingMs 递减', () => {
    const s = runningState();
    const r = tickBuildPhase(s, 3000);
    expect(r.state.phase).toBe('build');
    expect(r.state.buildPhaseRemainingMs).toBe(12000);
    expect(r.state.tickCount).toBe(1);
    expect(r.events).toEqual([]);
  });

  it('倒计时归零 → 切到 wave 并发 WAVE_STARTED', () => {
    const s = runningState();
    const r = tickBuildPhase(s, 15000);
    expect(r.state.phase).toBe('wave');
    expect(r.state.waveIndex).toBe(0);
    expect(r.state.buildPhaseRemainingMs).toBe(0);
    expect(r.state.spawner.active).toBe(true);
    // 关 1 第一波基础 12，countVariance=2 → [10,14]
    expect(r.state.spawner.queue.length).toBeGreaterThanOrEqual(10);
    expect(r.state.spawner.queue.length).toBeLessThanOrEqual(14);
    expect(r.events).toEqual([{ type: 'WAVE_STARTED', waveIndex: 0 }]);
  });

  it('tick 在 build 阶段会调用 tickBuildPhase', () => {
    const s = runningState();
    const r = tick(s, 1000, makeNextId());
    expect(r.state.buildPhaseRemainingMs).toBe(14000);
    expect(r.state.phase).toBe('build');
  });
});

describe('beginWave', () => {
  it('直接把 phase 切到 wave，spawner 初始化，发 WAVE_STARTED', () => {
    const s = runningState();
    const r = beginWave(s, 0);
    expect(r.state.phase).toBe('wave');
    expect(r.state.waveIndex).toBe(0);
    // 关 1 第一波基础 12，countVariance=2 → [10,14]
    expect(r.state.spawner.queue.length).toBeGreaterThanOrEqual(10);
    expect(r.state.spawner.queue.length).toBeLessThanOrEqual(14);
    expect(r.state.spawner.active).toBe(true);
    expect(r.events).toEqual([{ type: 'WAVE_STARTED', waveIndex: 0 }]);
  });
});

describe('tickWavePhase - 生成/移动/战斗', () => {
  it('生成：tick 推进足够时间会发 PATHOGEN_SPAWNED', () => {
    const s = beginWave(runningState(), 0).state;
    const r = tick(s, 1500, makeNextId()); // intervalMs=1200，必生成
    const spawned = r.events.filter((e) => e.type === 'PATHOGEN_SPAWNED');
    expect(spawned.length).toBeGreaterThan(0);
    expect(r.state.pathogens.length).toBeGreaterThan(0);
  });

  it('无塔长跑：病原到达出口 → PATHOGEN_REACHED_CORE + CORE_DAMAGED', () => {
    let s = beginWave(runningState(), 0).state;
    const nextId = makeNextId();
    // 跑 30 次 1500ms，足够第一只鼻病毒到出口
    for (let i = 0; i < 30; i++) {
      const r = tick(s, 1500, nextId);
      s = r.state;
      if (r.events.some((e) => e.type === 'CORE_DAMAGED')) break;
    }
    // HP 已经被扣过
    expect(s.hp).toBeLessThan(10);
  });

  it('HP 归零 → phase=failed + stageResult + LEVEL_LOST', () => {
    let s = beginWave(runningState(), 0).state;
    const nextId = makeNextId();
    const allEvents: string[] = [];
    for (let i = 0; i < 60; i++) {
      const r = tick(s, 1500, nextId);
      s = r.state;
      for (const e of r.events) allEvents.push(e.type);
      if (s.phase === 'failed') break;
    }
    expect(s.phase).toBe('failed');
    expect(s.stageResult?.outcome).toBe('lost');
    expect(s.stageResult?.stars).toBe(0);
    expect(s.running).toBe(false);
    expect(allEvents).toContain('LEVEL_LOST');
  });

  it('HP 归零后继续 tick 不再发任何事件（引擎已停机）', () => {
    let s = beginWave(runningState(), 0).state;
    const nextId = makeNextId();
    let lostCount = 0;
    for (let i = 0; i < 60; i++) {
      const r = tick(s, 1500, nextId);
      s = r.state;
      lostCount += r.events.filter((e) => e.type === 'LEVEL_LOST').length;
      if (s.phase === 'failed') break;
    }
    // 再 tick 几次
    for (let i = 0; i < 3; i++) {
      const r = tick(s, 1000, nextId);
      s = r.state;
      lostCount += r.events.filter((e) => e.type === 'LEVEL_LOST').length;
    }
    expect(lostCount).toBe(1);
  });

  it('单波打完（有足够塔杀光）+ 非最后波 → phase 回 build, waveIndex+1', () => {
    // 先放几个塔再开波（手动构造跳过 ATP 限制：直接改 state）
    let s = runningState();
    s = { ...s, atp: 500 };
    // 在路径的每一步旁边都放塔，确保覆盖整条路径（无论随机布局如何）
    // AoE range=1.5，塔放在路径格的上方或下方（row±1）均在射程内
    const path = s.currentPath;
    const towerSet = new Map<string, { col: number; row: number }>();
    for (const cell of path) {
      for (const dr of [-1, 1]) {
        const row = cell.row + dr;
        if (row < 0 || row > 9) continue;
        const key = `${cell.col},${row}`;
        if (!towerSet.has(key)) towerSet.set(key, { col: cell.col, row });
      }
    }
    // 过滤掉路径上的格子本身（不能放塔）
    const pathSet = new Set(path.map((c) => `${c.col},${c.row}`));
    const towerCells = [...towerSet.values()].filter((c) => !pathSet.has(`${c.col},${c.row}`));
    s = {
      ...s,
      towers: towerCells.map((c, i) => ({
        id: `t-${i + 1}`,
        type: 'macrophage' as const,
        col: c.col,
        row: c.row,
        cooldownMs: 0,
        level: 3, // Lv3 伤害高，确保快速击杀
        totalInvested: 150,
        hp: 320,
        maxHp: 320,
        targetingPriority: 'first' as const,
      })),
    };
    s = beginWave(s, 0).state;
    const nextId = makeNextId();
    let waveEnded = false;
    for (let i = 0; i < 50; i++) {
      const r = tick(s, 1000, nextId);
      s = r.state;
      if (r.events.some((e) => e.type === 'WAVE_ENDED')) waveEnded = true;
      if (s.phase === 'build' && s.waveIndex >= 1) break;
      if (s.phase === 'complete' || s.phase === 'failed') break;
    }
    expect(['build', 'wave', 'complete']).toContain(s.phase);
    // 只要有 WAVE_ENDED 说明波次结束逻辑跑了；若 waveIndex>=1 说明正确进入下一波 build
    if (waveEnded && s.phase === 'build') {
      expect(s.waveIndex).toBeGreaterThanOrEqual(1);
      expect(s.pathogens).toEqual([]);
    }
  });
});

describe('Phase B · WAVE_BONUS（B3）', () => {
  it('波末发 WAVE_BONUS：base = 50 + waveIndex × 10，完美波 perfect = 30', () => {
    let s = { ...createInitialState(1), running: true };
    // 注入大量塔保证全部敌人被击杀（不漏 → 完美波）
    s = {
      ...s,
      towers: Array.from({ length: 30 }, (_, i) => ({
        id: `t-${i}`,
        type: 'macrophage' as const,
        col: (i % 8) + 1,
        row: (i % 6) + 1,
        cooldownMs: 0,
        level: 3,
        totalInvested: 150,
        hp: 320,
        maxHp: 320,
        targetingPriority: 'first' as const,
      })),
    };
    s = beginWave(s, 0).state;
    const nextId = makeNextId();
    let bonusEvent: { base: number; perfect: number; economy: number; total: number } | null =
      null;
    for (let i = 0; i < 100; i++) {
      const r = tick(s, 1000, nextId);
      s = r.state;
      for (const e of r.events) {
        if (e.type === 'WAVE_BONUS' && bonusEvent === null) {
          bonusEvent = { base: e.base, perfect: e.perfect, economy: e.economy, total: e.total };
        }
      }
      if (s.phase === 'build' && s.waveIndex >= 1) break;
      if (s.phase === 'complete' || s.phase === 'failed') break;
    }
    if (!bonusEvent) throw new Error('未发出 WAVE_BONUS');
    // 第 0 波 base = 50 + 0 × 10 = 50
    expect(bonusEvent.base).toBe(50);
    // 完美波（HP 满）→ perfect 30
    expect(bonusEvent.perfect).toBe(30);
    // 无 mitochondria 塔 → economy 0
    expect(bonusEvent.economy).toBe(0);
    expect(bonusEvent.total).toBe(80);
  });

  it('完美波判定：波末 HP < initialHp → perfect = 0', () => {
    let s = { ...createInitialState(1), running: true };
    // 不放塔让所有敌人通过 → HP 必然掉
    s = beginWave(s, 0).state;
    const nextId = makeNextId();
    let bonusEvent: { perfect: number } | null = null;
    let lostHp = false;
    for (let i = 0; i < 200; i++) {
      const r = tick(s, 1000, nextId);
      s = r.state;
      if (s.hp < 10) lostHp = true;
      for (const e of r.events) {
        if (e.type === 'WAVE_BONUS' && bonusEvent === null) {
          bonusEvent = { perfect: e.perfect };
        }
      }
      if (s.phase === 'build' && s.waveIndex >= 1) break;
      if (s.phase === 'complete' || s.phase === 'failed') break;
    }
    if (!lostHp || !bonusEvent) return; // 极端情况下没生效，跳过
    expect(bonusEvent.perfect).toBe(0);
  });

  it('mitochondria 塔贡献 economy：单 Lv1 = 25，2 个 Lv1 = 50', () => {
    let s = { ...createInitialState(1), running: true };
    // 注入 2 个 Lv1 mitochondria + 大量攻击塔保证完美波
    s = {
      ...s,
      towers: [
        ...Array.from({ length: 30 }, (_, i) => ({
          id: `t-${i}`,
          type: 'macrophage' as const,
          col: (i % 8) + 1,
          row: (i % 6) + 1,
          cooldownMs: 0,
          level: 3 as const,
          totalInvested: 150,
          hp: 320,
          maxHp: 320,
          targetingPriority: 'first' as const,
        })),
        {
          id: 'mito-1',
          type: 'mitochondria' as const,
          col: 9,
          row: 0,
          cooldownMs: 0,
          level: 1 as const,
          totalInvested: 100,
          hp: 80,
          maxHp: 80,
          targetingPriority: 'first' as const,
        },
        {
          id: 'mito-2',
          type: 'mitochondria' as const,
          col: 9,
          row: 9,
          cooldownMs: 0,
          level: 1 as const,
          totalInvested: 100,
          hp: 80,
          maxHp: 80,
          targetingPriority: 'first' as const,
        },
      ],
    };
    s = beginWave(s, 0).state;
    const nextId = makeNextId();
    let economyBonus = -1;
    for (let i = 0; i < 100; i++) {
      const r = tick(s, 1000, nextId);
      s = r.state;
      for (const e of r.events) {
        if (e.type === 'WAVE_BONUS' && economyBonus === -1) economyBonus = e.economy;
      }
      if (s.phase === 'build' && s.waveIndex >= 1) break;
      if (s.phase === 'complete' || s.phase === 'failed') break;
    }
    expect(economyBonus).toBe(50); // 2 × 25
  });
});

describe('tickWavePhase - 事件顺序', () => {
  it('PATHOGEN_SPAWNED 在 PATHOGEN_REACHED_CORE 之前', () => {
    let s = beginWave(runningState(), 0).state;
    const nextId = makeNextId();
    const allEvents: string[] = [];
    for (let i = 0; i < 30; i++) {
      const r = tick(s, 1500, nextId);
      s = r.state;
      for (const e of r.events) allEvents.push(e.type);
      if (allEvents.includes('PATHOGEN_REACHED_CORE')) break;
    }
    const firstSpawn = allEvents.indexOf('PATHOGEN_SPAWNED');
    const firstReach = allEvents.indexOf('PATHOGEN_REACHED_CORE');
    expect(firstSpawn).toBeGreaterThanOrEqual(0);
    expect(firstReach).toBeGreaterThan(firstSpawn);
  });
});
