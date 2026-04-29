import { describe, expect, it } from 'vitest';
import { greedyBot } from '@engine/game/simulator';
import { solveForWinRate } from '@engine/game/tuner';

describe('tuner · solveForWinRate', () => {
  it('range 非法时抛错', () => {
    expect(() =>
      solveForWinRate(1, {
        target: 0.5,
        param: { type: 'initialAtp' },
        range: [100, 100],
      }),
    ).toThrow();
  });

  it('返回 history 长度 ≤ maxIterations', () => {
    const r = solveForWinRate(1, {
      target: 0.5,
      param: { type: 'waveHpMultiplierAll' },
      range: [0.5, 2.0],
      bot: greedyBot,
      seeds: [1, 2, 3],
      maxIterations: 4,
      tolerance: 0.01,
    });
    expect(r.history.length).toBeLessThanOrEqual(4);
    expect(r.iterations).toBeGreaterThan(0);
    expect(r.value).toBeGreaterThanOrEqual(0.5);
    expect(r.value).toBeLessThanOrEqual(2.0);
  });

  it('waveHpMultiplierAll 搜索方向正确：target=0.8 应找到 scale < 1（让关卡更易）', () => {
    const r = solveForWinRate(3, {
      target: 0.8,
      param: { type: 'waveHpMultiplierAll' },
      range: [0.3, 1.5],
      bot: greedyBot,
      seeds: [1, 2, 3, 4, 5],
      maxIterations: 6,
      tolerance: 0.15,
    });
    // 关 3 原版 greedy 胜率约 30%，要达到 80% 必须降低 HP → scale < 1.0
    expect(r.value).toBeLessThan(1.0);
    expect(r.history.length).toBeGreaterThan(0);
  });

  it('initialAtp 搜索方向正确：target 很高时会增大 ATP', () => {
    const r = solveForWinRate(1, {
      target: 0.9,
      param: { type: 'initialAtp' },
      range: [50, 500],
      bot: greedyBot,
      seeds: [1, 2, 3],
      maxIterations: 5,
      tolerance: 0.15,
    });
    // 目标高，final value 应比起点中位数大（说明在朝 ATP 增加方向搜）
    expect(r.value).toBeGreaterThan(100);
  });
});
