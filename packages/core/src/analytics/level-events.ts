/**
 * 关卡核心事件埋点：level_start / level_complete / level_fail / level_quit。
 *
 * 状态机：
 *   start → (complete | fail | quit)
 *
 * - start：玩家进 GameScene，clear 上次状态
 * - complete：LEVEL_WON 事件
 * - fail：LEVEL_LOST 事件
 * - quit：scene shutdown 且未 complete/fail（用户主动退出）
 *
 * resolved 标志确保 quit 不与 complete/fail 冲突——一局只发一次结束事件。
 *
 * attempt_n：关卡级内存计数器。跨 GameScene 重启累计；浏览器关闭重置。
 * 想跨 session 持久化得 metaStore migration（推到 Task 7 一起做）。
 */

import { track } from './index';

type LevelMode = 'normal' | 'elite';
type Phase = 'build' | 'wave' | 'complete' | 'failed';

export interface LevelStartParams {
  levelId: number;
  mode: LevelMode;
  loadout: readonly string[];
  seed: number;
}

export interface TowerSnapshot {
  type: string;
  level: 1 | 2 | 3;
  col: number;
  row: number;
}

export interface LevelCompleteParams {
  stars: 1 | 2 | 3;
  hpLeft: number;
  atpRemaining: number;
  waveCount: number;
  towersAtEnd: readonly TowerSnapshot[];
}

export interface LevelFailParams {
  failWave: number;
  failReason: 'core_died' | 'protected_cell_died';
  hpAtFail: number;
}

export interface LevelQuitParams {
  currentWave: number;
  currentPhase: Phase;
}

export interface WaveStartParams {
  waveIdx: number;
  hp: number;
  atp: number;
  towersCount: number;
}

export interface WaveEndParams {
  waveIdx: number;
  hp: number;
  atp: number;
}

const attemptCounts = new Map<number, number>();

interface CurrentSession {
  startTs: number;
  levelId: number;
  mode: LevelMode;
}

let current: CurrentSession | null = null;
let resolved = false;
/** 当前 wave 开始时戳（WAVE_STARTED 时设置，WAVE_ENDED 时取差值） */
let currentWaveStartTs: number | null = null;

export function trackLevelStart(p: LevelStartParams): void {
  const prev = attemptCounts.get(p.levelId) ?? 0;
  const attemptN = prev + 1;
  attemptCounts.set(p.levelId, attemptN);

  current = { startTs: Date.now(), levelId: p.levelId, mode: p.mode };
  resolved = false;

  track('level_start', {
    level_id: p.levelId,
    mode: p.mode,
    loadout: [...p.loadout],
    seed: p.seed,
    attempt_n: attemptN,
  });
}

export function trackLevelComplete(p: LevelCompleteParams): void {
  if (current === null || resolved) return;
  resolved = true;
  const durationMs = Date.now() - current.startTs;
  track('level_complete', {
    level_id: current.levelId,
    mode: current.mode,
    stars: p.stars,
    hp_left: p.hpLeft,
    atp_remaining: p.atpRemaining,
    wave_count: p.waveCount,
    duration_ms: durationMs,
    towers_at_end: p.towersAtEnd.map((t) => ({
      type: t.type,
      level: t.level,
      col: t.col,
      row: t.row,
    })),
  });
}

export function trackLevelFail(p: LevelFailParams): void {
  if (current === null || resolved) return;
  resolved = true;
  track('level_fail', {
    level_id: current.levelId,
    mode: current.mode,
    fail_wave: p.failWave,
    fail_reason: p.failReason,
    hp_at_fail: p.hpAtFail,
  });
}

export function trackLevelQuit(p: LevelQuitParams): void {
  if (current === null || resolved) return;
  resolved = true;
  track('level_quit', {
    level_id: current.levelId,
    mode: current.mode,
    current_wave: p.currentWave,
    current_phase: p.currentPhase,
  });
}

export function trackWaveStart(p: WaveStartParams): void {
  if (current === null) return;
  currentWaveStartTs = Date.now();
  track('wave_start', {
    level_id: current.levelId,
    wave_idx: p.waveIdx,
    hp: p.hp,
    atp: p.atp,
    towers_count: p.towersCount,
  });
}

export function trackWaveEnd(p: WaveEndParams): void {
  if (current === null) return;
  const durationMs = currentWaveStartTs !== null ? Math.max(0, Date.now() - currentWaveStartTs) : 0;
  currentWaveStartTs = null;
  track('wave_end', {
    level_id: current.levelId,
    wave_idx: p.waveIdx,
    hp: p.hp,
    atp: p.atp,
    duration_ms: durationMs,
  });
}

/** 测试用：重置内部状态 */
export function _resetLevelEventsForTests(): void {
  attemptCounts.clear();
  current = null;
  resolved = false;
  currentWaveStartTs = null;
}

/** 测试 / 调试用：当前是否已 resolved（用于断言） */
export function _isResolvedForTests(): boolean {
  return resolved;
}
