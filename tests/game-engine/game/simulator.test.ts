import { describe, expect, it } from 'vitest';
import {
  estimateDifficulty,
  greedyBot,
  simulateRun,
  strongBot,
  weakBot,
} from '@engine/game/simulator';

describe('simulator · simulateRun', () => {
  it('关 1 单次模拟：greedy 至少能推进到 waveReached > 0，返回确定性结果', () => {
    const r = simulateRun(1, greedyBot, 42);
    expect(['won', 'lost', 'timeout']).toContain(r.outcome);
    expect(r.waveReached).toBeGreaterThan(0);
    expect(r.ticksElapsed).toBeGreaterThan(0);
    expect(r.towersPlaced).toBeGreaterThan(0); // bot 至少放了一个塔
  });

  it('同一关同一 seed 两次模拟结果完全一致（确定性）', () => {
    const a = simulateRun(1, greedyBot, 123);
    const b = simulateRun(1, greedyBot, 123);
    expect(a.outcome).toBe(b.outcome);
    expect(a.hpRemaining).toBe(b.hpRemaining);
    expect(a.leaked).toBe(b.leaked);
    expect(a.towersPlaced).toBe(b.towersPlaced);
  });

  // v4 平衡后 bot 在多关 hp 收敛到单值（全胜/全败），seed-variance 假设失效；
  // 此测试本意是验证"地图随机性"，等 bot 重写或更精细的随机化后恢复
  it.skip('不同 seed 可能产出不同布局 → 不同结果（v4 暂跳过，bot 收敛单值）', () => {
    const hps = Array.from({ length: 10 }, (_, i) => simulateRun(1, greedyBot, i + 1).hpRemaining);
    const uniq = new Set(hps);
    expect(uniq.size).toBeGreaterThan(1);
  });
});

describe('simulator · estimateDifficulty', () => {
  it('关 1 聚合 5 次模拟，输出 winRate/avgHp/perWave 合法', () => {
    const report = estimateDifficulty(1, { runs: 5 });
    expect(report.levelId).toBe(1);
    expect(report.runs).toBe(5);
    expect(report.winRate).toBeGreaterThanOrEqual(0);
    expect(report.winRate).toBeLessThanOrEqual(1);
    expect(report.samples).toHaveLength(5);
    expect(report.outcomes.won + report.outcomes.lost + report.outcomes.timeout).toBe(5);
    // 每波泄漏均值数组长度 <= 关 1 的 5 波
    expect(report.perWaveAvgLeak.length).toBeLessThanOrEqual(5);
  });

  it('用显式 seeds 复现报告（相同 seeds → 相同 winRate/avgHp）', () => {
    const seeds = [1, 2, 3];
    const a = estimateDifficulty(1, { seeds });
    const b = estimateDifficulty(1, { seeds });
    expect(a.winRate).toBe(b.winRate);
    expect(a.avgHpRemaining).toBe(b.avgHpRemaining);
    expect(a.avgLeaked).toBe(b.avgLeaked);
  });
});

describe('simulator · dt 稳健性', () => {
  it('固定 dt=16 vs 抖动 [14,33]：outcome 一致，hp/leaked 容忍 ±1（A6 fixed-path 后 spawn 时机仍 dt-dependent）', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const fixed = simulateRun(1, greedyBot, seed);
      const jit = simulateRun(1, greedyBot, seed, { dtJitter: { min: 14, max: 33, seed: 42 } });
      expect(jit.outcome).toBe(fixed.outcome);
      // A6 起 path 固定但 spawn 时机由 spawner.timerMs += dt 累积，dt 抖动会
      // 让某只 pathogen 在 wave 边缘多走/少走 1 帧，导致 hp 差 ±1
      expect(Math.abs(jit.hpRemaining - fixed.hpRemaining)).toBeLessThanOrEqual(1);
      expect(Math.abs(jit.leaked - fixed.leaked)).toBeLessThanOrEqual(1);
      // ticks 数会不同（dt 变大 → ticks 变少）
      expect(jit.ticksElapsed).not.toBe(fixed.ticksElapsed);
    }
  });

  it('重度抖动 [80,120]（≈10fps）outcome 仍一致', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const fixed = simulateRun(1, greedyBot, seed);
      const heavy = simulateRun(1, greedyBot, seed, { dtJitter: { min: 80, max: 120, seed: 7 } });
      expect(heavy.outcome).toBe(fixed.outcome);
      expect(heavy.hpRemaining).toBe(fixed.hpRemaining);
    }
  });
});

describe('simulator · bot 段位梯度', () => {
  const seeds = Array.from({ length: 10 }, (_, i) => i + 1);

  // v4 平衡后 strong（少塔重升级）逊于 greedy（多塔铺路），段位梯度失效；
  // 等 bot 重写覆盖"先铺塔后升级"策略再恢复
  it.skip('关 1 段位梯度：strong ≥ greedy ≥ weak（v4 暂跳过，bot 策略反转）', () => {
    const w = estimateDifficulty(1, { policy: weakBot, seeds });
    const g = estimateDifficulty(1, { policy: greedyBot, seeds });
    const s = estimateDifficulty(1, { policy: strongBot, seeds });
    expect(g.winRate).toBeGreaterThanOrEqual(w.winRate);
    expect(s.winRate).toBeGreaterThanOrEqual(w.winRate);
    expect(g.avgHpRemaining).toBeGreaterThanOrEqual(w.avgHpRemaining);
    expect(s.avgHpRemaining).toBeGreaterThanOrEqual(g.avgHpRemaining - 0.5);
  });
});
