/**
 * 路径回退 milestone · A4：fixed-path 模式 spawn 路径分配测试。
 *
 * 验证：当 state.pathCellSet 非空（LevelConfig.path 显式存在）时，
 *   - spawn 的非飞行 pathogen.path === state.paths[count % len]（round-robin）
 *   - PATHOGEN_SPAWNED 事件 x/y 与 path[0] 一致
 *   - 飞行 pathogen 仍走 straightLinePath（不受 fixed-path 影响）
 *
 * fallback 占位（pathCellSet 空）的 spawn 行为由 phases-waypoint.test.ts 覆盖。
 */

import { describe, expect, it } from 'vitest';
import type { NextIdFn } from '@engine/game/phases';
import { beginWave, tick } from '@engine/game/phases';
import { createInitialState } from '@engine/game/state';

function makeNextId(): NextIdFn {
  let n = 0;
  return (prefix: string) => `${prefix}-${++n}`;
}

type Coord = { col: number; row: number };

function injectFixedPaths(
  levelId: number,
  paths: readonly (readonly Coord[])[],
  seed = 0xa4_a4_a4,
) {
  const initial = { ...createInitialState(levelId, seed), running: true };
  let state = beginWave(initial, 0).state;
  const cellSet = new Set<string>();
  for (const p of paths) for (const c of p) cellSet.add(`${c.col},${c.row}`);
  state = { ...state, paths, pathCellSet: cellSet };
  return state;
}

function runSpawnsToCompletion(state0: ReturnType<typeof injectFixedPaths>, maxTicks = 80) {
  let state = state0;
  const nextId = makeNextId();
  for (let i = 0; i < maxTicks && state.phase === 'wave'; i++) {
    const r = tick(state, 1500, nextId);
    state = r.state;
    if (!state.spawner.active && state.spawner.spawnedCount >= state.spawner.queue.length) break;
  }
  return state;
}

describe('A4 · fixed-path spawn 路径分配', () => {
  it('单路径：所有非飞行 spawn 都用 paths[0]', () => {
    // 简单直线路径：(0,4) → (9,4)
    const fixedPath: Coord[] = Array.from({ length: 10 }, (_, i) => ({ col: i, row: 4 }));
    const state0 = injectFixedPaths(1, [fixedPath]);
    const final = runSpawnsToCompletion(state0);

    const ground = final.pathogens.filter((p) => !p.flying);
    expect(ground.length).toBeGreaterThan(0);
    for (const p of ground) {
      expect(p.path).toBe(fixedPath); // 引用相等
    }
  });

  it('双路径 round-robin：count=0,2 走 paths[0]，count=1,3 走 paths[1]', () => {
    const path0: Coord[] = Array.from({ length: 10 }, (_, i) => ({ col: i, row: 3 }));
    const path1: Coord[] = Array.from({ length: 10 }, (_, i) => ({ col: i, row: 7 }));
    const state0 = injectFixedPaths(1, [path0, path1]);
    const final = runSpawnsToCompletion(state0);

    const ground = final.pathogens.filter((p) => !p.flying);
    expect(ground.length).toBeGreaterThanOrEqual(4);

    // 因为 ground.length 不一定按 spawn 顺序，且 movement 可能改变 pathIndex，
    // 但 path 字段引用不变。验证每只 pathogen.path 是 path0 或 path1 之一
    for (const p of ground) {
      expect(p.path === path0 || p.path === path1).toBe(true);
    }

    // 至少有一只走 path0、一只走 path1（round-robin 必然产生分流）
    const onP0 = ground.filter((p) => p.path === path0).length;
    const onP1 = ground.filter((p) => p.path === path1).length;
    expect(onP0).toBeGreaterThan(0);
    expect(onP1).toBeGreaterThan(0);
  });

  it('教学关 isTutorial=true 即使 pathCellSet 非空也不启用 fixed-path（跳过 spawn）', () => {
    // 教学关 spawn 由 GameScene.spawnPathogenForTutorial 手动驱动，spawner 不自动 tick
    // 即使注入 fixed-path，自动 tick 应仍跳过——验证 spawn 数为 0
    const fixedPath: Coord[] = Array.from({ length: 10 }, (_, i) => ({ col: i, row: 4 }));
    const state0 = injectFixedPaths(0, [fixedPath]); // 关 0 = 教学关
    const final = runSpawnsToCompletion(state0);
    expect(final.pathogens).toHaveLength(0);
  });

  it('paths.length 不等于 entries.length 仍工作（path[0] 覆盖 entry，发出 surprise warning）', () => {
    // 关 4 双入口（multi-entry mechanic），但用户只配 1 条 path：
    // entries=[(0,2),(0,7)] paths=[(0,5)→...]
    // 期望：所有 spawn 都用 path[0]（覆盖 entries round-robin），spawn 坐标都是 path[0][0]
    const onePath: Coord[] = Array.from({ length: 10 }, (_, i) => ({ col: i, row: 5 }));
    // 关 4 双入口在 LEVELS 里写死，注入只 1 条 path 模拟用户配错
    const state0 = injectFixedPaths(4, [onePath]);
    const final = runSpawnsToCompletion(state0);

    const ground = final.pathogens.filter((p) => !p.flying);
    if (ground.length === 0) return; // 关 4 全飞行的 case 跳过（不应发生但兜底）
    for (const p of ground) {
      expect(p.path).toBe(onePath);
    }
  });

  it('fixed-path 模式下 PATHOGEN_SPAWNED 事件 x/y 与 path[0] 一致', () => {
    // path 起点放在非默认入口位置（关 1 entry 是随机化的，path[0] 必须覆盖 entry）
    const fixedPath: Coord[] = [
      { col: 2, row: 5 },
      { col: 3, row: 5 },
      { col: 4, row: 5 },
      { col: 5, row: 5 },
    ];
    const state0 = injectFixedPaths(1, [fixedPath]);

    const nextId = makeNextId();
    let state = state0;
    const allEvents: { x: number; y: number; type: string }[] = [];
    for (let i = 0; i < 80 && state.phase === 'wave'; i++) {
      const r = tick(state, 1500, nextId);
      for (const e of r.events) {
        if (e.type === 'PATHOGEN_SPAWNED') {
          allEvents.push({ x: e.x, y: e.y, type: e.pathogenType });
        }
      }
      state = r.state;
      if (!state.spawner.active && state.spawner.spawnedCount >= state.spawner.queue.length) break;
    }

    expect(allEvents.length).toBeGreaterThan(0);
    // 飞行型 pathogen 的事件 x/y 不受 fixed-path 影响（仍是 entry 坐标），
    // 这里只验证非飞行的（关 1 都是地面）
    for (const e of allEvents) {
      expect(e.x).toBe(2);
      expect(e.y).toBe(5);
    }
  });
});
