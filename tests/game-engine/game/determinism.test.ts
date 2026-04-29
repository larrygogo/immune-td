import { describe, expect, it } from 'vitest';
import { placeTower, start, startWave } from '@engine/game/actions';
import { tick } from '@engine/game/phases';
import { createInitialState } from '@engine/game/state';
import type { GameState } from '@engine/game/state';

const TICK_MS = 1000 / 60;

interface ScheduledAction {
  tick: number;
  apply: (state: GameState) => GameState;
}

/**
 * 模拟 Phaser fixed-step tick loop：从 initialState 起，按固定 dt=TICK_MS 调 engine.tick
 * 共 `totalTicks` 次。到指定 tick 前 apply scheduled actions（模拟回放）。
 */
function runFixedSteps(
  initialState: GameState,
  totalTicks: number,
  actions: readonly ScheduledAction[],
): GameState {
  let state = start(initialState);
  let nextId = 1;
  const mkId = (prefix: string) => `${prefix}${nextId++}`;
  let cursor = 0;
  for (let i = 0; i < totalTicks; i++) {
    // apply 到当前 tick 为止的 actions
    while (cursor < actions.length) {
      const a = actions[cursor];
      if (!a || a.tick > state.tickCount) break;
      state = a.apply(state);
      cursor++;
    }
    const r = tick(state, TICK_MS, mkId);
    state = r.state;
    if (!state.running) break;
  }
  return state;
}

/** engine 状态的决定性摘要：覆盖参与 rng/战斗/移动的所有关键字段 */
function digest(state: GameState): string {
  return JSON.stringify({
    tickCount: state.tickCount,
    rngState: state.rngState,
    hp: state.hp,
    atp: state.atp,
    phase: state.phase,
    waveIndex: state.waveIndex,
    towers: state.towers.map((t) => ({
      id: t.id,
      type: t.type,
      col: t.col,
      row: t.row,
      level: t.level,
      hp: t.hp,
      cooldownMs: t.cooldownMs,
    })),
    pathogens: state.pathogens.map((p) => ({
      id: p.id,
      type: p.type,
      pathIndex: p.pathIndex,
      progress: p.progress,
      hp: p.hp,
      alive: p.alive,
      pathLen: p.path.length,
      pathHead: p.path[0],
      pathTail: p.path[p.path.length - 1],
      offsetX: p.offsetX,
      offsetY: p.offsetY,
      speedMultiplier: p.speedMultiplier,
    })),
  });
}

describe('engine 决定性（fixed-step 回放前提）', () => {
  it('相同 seed + 相同 actions + 相同 tick 数 → 两次运行状态字节级一致', () => {
    const SEED = 12345;
    const TOTAL_TICKS = 600; // 10 秒 @ 60Hz

    // 在 tick=30 放两座塔 + tick=60 发波
    const actions: ScheduledAction[] = [
      {
        tick: 30,
        apply: (s) => {
          const r = placeTower(s, 2, 3, 'macrophage', (p) => `${p}_a`);
          return r.ok ? r.state : s;
        },
      },
      {
        tick: 30,
        apply: (s) => {
          const r = placeTower(s, 4, 5, 'macrophage', (p) => `${p}_b`);
          return r.ok ? r.state : s;
        },
      },
      {
        tick: 60,
        apply: (s) => startWave(s).state,
      },
    ];

    const run1 = runFixedSteps(createInitialState(1, SEED), TOTAL_TICKS, actions);
    const run2 = runFixedSteps(createInitialState(1, SEED), TOTAL_TICKS, actions);

    expect(digest(run1)).toBe(digest(run2));
    // 有战斗推进的健全性检查：tickCount 应到上限或 state 已结束
    expect(run1.tickCount).toBeGreaterThan(60);
    expect(run1.pathogens.length + run1.towers.length).toBeGreaterThan(0);
  });

  it('不同 seed → 路径 / rng / 战斗细节不同（证明状态真受 seed 控）', () => {
    const TOTAL_TICKS = 600;
    const actions: ScheduledAction[] = [
      {
        tick: 60,
        apply: (s) => startWave(s).state,
      },
    ];

    const runA = runFixedSteps(createInitialState(1, 111), TOTAL_TICKS, actions);
    const runB = runFixedSteps(createInitialState(1, 222), TOTAL_TICKS, actions);

    // rngState 必然不同；pathogen path 或位置有差异
    expect(runA.rngState).not.toBe(runB.rngState);
  });

  it('反例：相同 seed 但 dt 抖动（非 fixed-step）→ 状态漂移（证明 fixed-step 必要）', () => {
    const SEED = 777;
    let sA = start(createInitialState(1, SEED));
    let sB = start(createInitialState(1, SEED));
    const mkA = (p: string) => `${p}_a`;
    const mkB = (p: string) => `${p}_b`;

    // Run A：固定 TICK_MS 调 100 次 → build 倒计时正好走 100 帧
    for (let i = 0; i < 100; i++) sA = tick(sA, TICK_MS, mkA).state;

    // Run B：模拟帧率不稳，100 次 tick 但 dt 抖动（总和略多于 A）
    const dts = [18.2, 15.1, 16.7, 20.5, 14.3];
    for (let i = 0; i < 100; i++) {
      const d = dts[i % dts.length] ?? TICK_MS;
      sB = tick(sB, d, mkB).state;
    }

    // 核心：两次 run 的 buildPhaseRemainingMs 一定不同（A 扣 100×16.67，B 扣 100×均值17.0）
    expect(sA.buildPhaseRemainingMs).not.toBe(sB.buildPhaseRemainingMs);
  });
});
