import { describe, expect, it } from 'vitest';
import {
  computeScore,
  computeStars,
  createInitialState,
} from '@engine/game/state';

describe('createInitialState', () => {
  it('关 1：hp=10, atp=100, phase=build, totalWaves=5, buildPhaseRemainingMs=15000', () => {
    const s = createInitialState(1);
    expect(s.levelId).toBe(1);
    expect(s.hp).toBe(10);
    expect(s.atp).toBe(100);
    expect(s.phase).toBe('build');
    expect(s.totalWaves).toBe(5);
    expect(s.buildPhaseRemainingMs).toBe(15000);
    expect(s.waveIndex).toBe(0);
    expect(s.running).toBe(false);
    expect(s.paused).toBe(false);
    expect(s.speedMultiplier).toBe(1);
    expect(s.stageResult).toBeNull();
    expect(s.towers).toHaveLength(0);
    expect(s.pathogens).toHaveLength(0);
    expect(s.spawner.queue).toEqual([]);
    expect(s.spawner.active).toBe(false);
  });

  it('序章（关 0）：buildPhaseRemainingMs=999999（教学锁兜底，覆盖默认 15s）', () => {
    const s = createInitialState(0);
    expect(s.levelId).toBe(0);
    expect(s.buildPhaseRemainingMs).toBe(999_999);
    expect(s.hp).toBe(99);
    expect(s.atp).toBe(200);
  });

  it('currentPath 起点在左列(col=0)，终点在右列(col=9)', () => {
    const s = createInitialState(1);
    expect(s.currentPath.length).toBeGreaterThan(0);
    expect(s.currentPath[0]?.col).toBe(0);
    expect(s.currentPath[s.currentPath.length - 1]?.col).toBe(9);
  });
});

describe('createInitialState · paths/pathCellSet（路径回退 milestone · A2）', () => {
  it('paths 至少含 1 条非空路径（缺 LevelConfig.path 时 fallback 占位）', () => {
    const s = createInitialState(1);
    expect(s.paths.length).toBeGreaterThan(0);
    expect(s.paths[0]?.length).toBeGreaterThan(0);
  });

  it('占位路径首格 = entry 之一，末格 = exit 之一', () => {
    const s = createInitialState(1);
    const path = s.paths[0];
    if (!path) throw new Error('paths[0] should exist');
    const first = path[0];
    const last = path[path.length - 1];
    if (!first || !last) throw new Error('path endpoints');
    expect(s.entries.some((e) => e.col === first.col && e.row === first.row)).toBe(true);
    expect(s.exits.some((x) => x.col === last.col && x.row === last.row)).toBe(true);
  });

  it('A6：取消 opt-in，pathCellSet 始终从 paths 构建（fallback 也启用 path 校验）', () => {
    const s = createInitialState(1);
    expect(s.pathCellSet.size).toBeGreaterThan(0);
    // pathCellSet 应等于 paths 所有格子的集合
    let cellCount = 0;
    for (const p of s.paths) cellCount += p.length;
    // 多 path 间可能有重复格子，但 size ≤ cellCount
    expect(s.pathCellSet.size).toBeLessThanOrEqual(cellCount);
  });
});

describe('createInitialState · 精英模式', () => {
  it('默认 mode=normal', () => {
    const s = createInitialState(1);
    expect(s.mode).toBe('normal');
  });

  it('mode=elite：state.mode=elite 且 spawner queue 全部含 fortified modifier', () => {
    const s = createInitialState(2, 12345, undefined, 'elite');
    expect(s.mode).toBe('elite');
    // spawner queue 由 phases.beginWave 时按 wave 0 展开，初始 build phase queue=[]
    // 但 totalWaves 从 elite level.waves.length 算（elite 不变 wave 数）
    expect(s.totalWaves).toBe(5);
  });

  it('mode=elite：beginWave 后 spawner queue 全部 SpawnQueueItem 带 fortified', async () => {
    const { beginWave } = await import('@engine/game/phases');
    const initial = createInitialState(2, 99999, undefined, 'elite');
    const result = beginWave(initial, 0);
    expect(result.state.spawner.queue.length).toBeGreaterThan(0);
    for (const item of result.state.spawner.queue) {
      expect(item.modifiers).toContain('fortified');
    }
  });

  it('mode=normal：beginWave queue 不含 fortified（关 1 base 无 fortified）', async () => {
    const { beginWave } = await import('@engine/game/phases');
    const initial = createInitialState(1, 99999);
    const result = beginWave(initial, 0);
    expect(result.state.spawner.queue.length).toBeGreaterThan(0);
    for (const item of result.state.spawner.queue) {
      expect(item.modifiers).not.toContain('fortified');
    }
  });
});

describe('computeStars', () => {
  it('HP=10 → 3 星', () => {
    expect(computeStars(10)).toBe(3);
  });
  it('HP=8 → 3 星（门槛 ≥8）', () => {
    expect(computeStars(8)).toBe(3);
  });
  it('HP=7 → 2 星', () => {
    expect(computeStars(7)).toBe(2);
  });
  it('HP=5 → 2 星（门槛 ≥5）', () => {
    expect(computeStars(5)).toBe(2);
  });
  it('HP=4 → 1 星', () => {
    expect(computeStars(4)).toBe(1);
  });
  it('HP=1 → 1 星', () => {
    expect(computeStars(1)).toBe(1);
  });
  it('HP=0 → 0 星', () => {
    expect(computeStars(0)).toBe(0);
  });
});

describe('computeScore', () => {
  it('HP=10, ATP=100 → 1100', () => {
    expect(computeScore(10, 100)).toBe(1100);
  });
  it('HP=0, ATP=0 → 0', () => {
    expect(computeScore(0, 0)).toBe(0);
  });
  it('负数视为 0', () => {
    expect(computeScore(-5, -10)).toBe(0);
  });
  it('HP=5, ATP=30 → 530', () => {
    expect(computeScore(5, 30)).toBe(530);
  });
});
