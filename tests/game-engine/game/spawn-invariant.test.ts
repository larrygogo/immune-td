/**
 * 病原体 spawn 不变量：每个病原体的 path[0] 必须等于分配给它的 entry。
 * 违反意味着视觉 spawn 位置和逻辑 entry 不一致（玩家看到怪物从非入口格出现）。
 */

import { describe, expect, it } from 'vitest';
import { placeTower, startWave } from '@engine/game/actions';
import { IMPLEMENTED_LEVEL_IDS, getLevel } from '@engine/game/data/levels';
import { tick } from '@engine/game/phases';
import { greedyBot } from '@engine/game/simulator';
import { createInitialState } from '@engine/game/state';

interface SpawnInfo {
  id: string;
  spawnXY: { col: number; row: number };
  pathStart: { col: number; row: number } | null;
  pathLen: number;
  flying: boolean;
}

/** 只跑 1 波，收集该波所有 spawn 事件及对应 pathogen 的 path[0]。 */
function captureFirstWaveSpawns(
  levelId: number,
  seed: number,
): {
  spawns: SpawnInfo[];
  entries: readonly { col: number; row: number }[];
} {
  let state = { ...createInitialState(levelId, seed), running: true };
  let counter = 0;
  const nextId = (p: string) => `${p}${counter++}`;

  // bot 放塔（前 6 个动作），进入波次
  const actions = greedyBot.onBuildPhase(state, getLevel(levelId).unlockTowers);
  for (const a of actions.slice(0, 6)) {
    if (a.type === 'place' && a.col !== undefined && a.row !== undefined && a.towerType) {
      const r = placeTower(state, a.col, a.row, a.towerType, nextId);
      if (r.ok) state = r.state;
    }
  }
  state = startWave(state).state;

  const spawns: SpawnInfo[] = [];
  for (let i = 0; i < 3000 && state.phase === 'wave'; i++) {
    const r = tick(state, 16, nextId);
    for (const ev of r.events) {
      if (ev.type === 'PATHOGEN_SPAWNED') {
        const p = r.state.pathogens.find((pp) => pp.id === ev.pathogenId);
        if (!p) continue;
        spawns.push({
          id: p.id,
          spawnXY: { col: ev.x, row: ev.y },
          pathStart: p.path[0] ?? null,
          pathLen: p.path.length,
          flying: p.flying,
        });
      }
    }
    state = r.state;
  }

  return { spawns, entries: state.entries };
}

describe('spawn 不变量：path[0] 必须等于分配到的 entry', () => {
  const testLevels = IMPLEMENTED_LEVEL_IDS.filter((id) => {
    try {
      return !getLevel(id).isTutorial;
    } catch {
      return false;
    }
  });

  for (const levelId of testLevels) {
    it(`关 ${levelId}：多 seed 下第一波所有 spawn 的 x/y 与 path[0] 一致`, () => {
      for (const seed of [1, 17, 42, 99, 256]) {
        const { spawns, entries } = captureFirstWaveSpawns(levelId, seed);
        expect(spawns.length, `关 ${levelId} seed ${seed} 无 spawn`).toBeGreaterThan(0);
        for (const s of spawns) {
          // spawn 事件 x/y 必须在 entries 里
          expect(
            entries.some((e) => e.col === s.spawnXY.col && e.row === s.spawnXY.row),
            `关 ${levelId} seed ${seed} ${s.id}：spawn (${s.spawnXY.col},${s.spawnXY.row}) 不在 entries=${JSON.stringify(entries)} 中`,
          ).toBe(true);
          // path[0] 必须等于 spawn 坐标
          expect(
            s.pathStart,
            `关 ${levelId} seed ${seed} ${s.id}：path 为空（BFS 可能返回 null）spawn=(${s.spawnXY.col},${s.spawnXY.row})`,
          ).toBeTruthy();
          if (s.pathStart) {
            expect(
              { col: s.pathStart.col, row: s.pathStart.row },
              `关 ${levelId} seed ${seed} ${s.id}：spawn=(${s.spawnXY.col},${s.spawnXY.row}) 但 path[0]=(${s.pathStart.col},${s.pathStart.row})`,
            ).toEqual(s.spawnXY);
          }
        }
      }
    });
  }
});
