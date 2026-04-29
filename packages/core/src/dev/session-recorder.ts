/**
 * 战斗 session 录制器。
 *
 * 核心不变量：engine 是纯函数 + 种子化 RNG → 录下 seed + 用户输入序列（按 tick 标注）
 * 就能 100% 精准重放战斗过程。
 *
 * 职责：
 * - start(levelId, seed)：开一个新 session
 * - record(type, args, tick, ok, error?)：追加一条动作
 * - finalize(outcome, summary)：封档并 POST 到 server 侧 /api/sessions
 * - abort()：中止当前 session（reset / scene 切换时调用）
 *
 * 上传目标：统一走 apiClient → POST /api/sessions。
 * - dev：Vite proxy 转 localhost:3000 的 debug server
 * - prod：VITE_API_BASE_URL 指向线上 server
 * POST 失败时 fallback 到 localStorage（下次重启尝试重发，见 flushPending）。
 */

import type { LevelMode } from '@engine/game/data/levels';
import { getShell } from '../shell';

const PENDING_KEY = '__pending_sessions';

/**
 * 当前 session payload 的 schema 版本。
 *
 * bump 规则：
 * - action.type 新增值：**不 bump**（type 是 union，新类型老版本回放时 switch default 跳过即可）
 * - action.args 现有字段语义变化 / 删除字段：**必须 bump**，在 migrateSessionIfNeeded 中处理兼容
 * - RecordedAction 顶层字段（tick/ok/error）增删：**必须 bump**
 * - SessionSummary 字段增删：**必须 bump**
 *
 * 回放端（ReplayListScene.openReplay）统一过 migrateSessionIfNeeded 再给 GameScene。
 */
export const CURRENT_RECORDING_VERSION = 2;

export interface RecordedAction {
  tick: number;
  type:
    | 'placeTower'
    | 'upgradeTower'
    | 'sellTower'
    | 'setTargetingPriority'
    | 'startWave'
    | 'setSpeed';
  args: Record<string, unknown>;
  ok: boolean;
  error?: string;
}

export interface SessionSummary {
  outcome: 'won' | 'lost' | 'aborted';
  finalHp: number;
  finalAtp: number;
  waveReached: number;
  stars?: 0 | 1 | 2 | 3;
}

export interface SessionRecording {
  /** schema 版本号——≤ CURRENT_RECORDING_VERSION。低版本走 migrateSessionIfNeeded */
  version: number;
  sessionId: string;
  levelId: number;
  /** 录制时关卡模式（v2 起加；v1 老 session migrate 时回填 'normal'） */
  mode: LevelMode;
  seed: number;
  startedAt: string; // ISO
  endedAt?: string;
  /** 原玩家结束时的 state.tickCount（回放到此 tick 后停止继续模拟） */
  endTick?: number;
  actions: RecordedAction[];
  summary?: SessionSummary;
}

/**
 * 回放前把旧版本 session 迁移到 CURRENT_RECORDING_VERSION 兼容 shape。
 * 目前只有 v1，直接返回；当未来 bump 到 v2 时在此加一个 `if (raw.version === 1)` 分支做字段映射。
 *
 * 非法数据抛错让调用方 try/catch（ReplayListScene.openReplay 已有）。
 */
export function migrateSessionIfNeeded(raw: unknown): SessionRecording {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('migrateSessionIfNeeded: raw 非对象');
  }
  const s = raw as Partial<SessionRecording>;
  if (typeof s.version !== 'number' || s.version < 1) {
    throw new Error(`migrateSessionIfNeeded: 未知 version=${String(s.version)}`);
  }
  if (s.version > CURRENT_RECORDING_VERSION) {
    // 高版本 session 是新客户端录的，老客户端读：尝试"向后兼容"当作 current 版本读
    // 若字段不兼容运行时 replay 会在 applyRecordedAction 里报错
    console.warn(
      `[sessionMigrate] session version ${s.version} > CURRENT ${CURRENT_RECORDING_VERSION}，尝试以当前版本 shape 读取`,
    );
  }
  // v1 → v2：补 mode='normal'（v1 时代尚无精英模式）
  if (s.version === 1 && (s as SessionRecording).mode === undefined) {
    (s as SessionRecording).mode = 'normal';
    s.version = 2;
  }
  return s as SessionRecording;
}

function newSessionId(levelId: number, seed: number): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return `L${levelId}_S${seed}_${ts}`;
}

class SessionRecorder {
  private current: SessionRecording | null = null;
  /** 当前 session 已完成的波次数（WAVE_ENDED 触发累加）。finalize 时 < 1 → 不保存不上传。 */
  private completedWaves = 0;

  start(levelId: number, seed: number, mode: LevelMode = 'normal'): void {
    this.current = {
      version: CURRENT_RECORDING_VERSION,
      sessionId: newSessionId(levelId, seed),
      levelId,
      mode,
      seed,
      startedAt: new Date().toISOString(),
      actions: [],
    };
    this.completedWaves = 0;
  }

  record(
    type: RecordedAction['type'],
    args: RecordedAction['args'],
    tick: number,
    ok: boolean,
    error?: string,
  ): void {
    if (!this.current) return;
    const entry: RecordedAction = { tick, type, args, ok };
    if (error !== undefined) entry.error = error;
    this.current.actions.push(entry);
  }

  /** WAVE_ENDED 时调用：一波结束（不论输赢）计数 +1。 */
  onWaveCompleted(): void {
    if (!this.current) return;
    this.completedWaves += 1;
  }

  finalize(summary: SessionSummary, endTick?: number): SessionRecording | null {
    if (!this.current) return null;
    // 至少完成一波才保存/上传：过滤掉放几个塔立马退出、或第一波早败等噪声 session
    if (this.completedWaves < 1) {
      this.current = null;
      this.completedWaves = 0;
      return null;
    }
    this.current.endedAt = new Date().toISOString();
    this.current.summary = summary;
    if (endTick !== undefined) this.current.endTick = endTick;
    const payload = this.current;
    this.current = null;
    this.completedWaves = 0;
    void uploadSession(payload);
    // 顺带把之前存的离线 session 重发
    void flushPending();
    return payload;
  }

  abort(endTick?: number): void {
    if (!this.current) return;
    this.finalize(
      {
        outcome: 'aborted',
        finalHp: 0,
        finalAtp: 0,
        waveReached: 0,
      },
      endTick,
    );
  }

  getCurrent(): SessionRecording | null {
    return this.current;
  }
}

// ---------- 上传实现 ----------

/** 把失败的 session 暂存 localStorage 队列，供下次 flushPending 重发。上限 20 条防膨胀。 */
function storePending(session: SessionRecording): void {
  try {
    const list = JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]') as SessionRecording[];
    list.push(session);
    while (list.length > 20) list.shift();
    localStorage.setItem(PENDING_KEY, JSON.stringify(list));
  } catch {
    // localStorage 满 / disabled，放弃
  }
}

async function uploadSession(session: SessionRecording): Promise<boolean> {
  const apiFetch = getShell().apiFetch;
  if (!apiFetch) {
    storePending(session);
    return false;
  }
  try {
    const res = await apiFetch('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(session),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  } catch {
    storePending(session);
    return false;
  }
}

async function flushPending(): Promise<void> {
  let list: SessionRecording[];
  try {
    list = JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]') as SessionRecording[];
  } catch {
    return;
  }
  if (list.length === 0) return;
  const apiFetch = getShell().apiFetch;
  if (!apiFetch) return; // shell 未注入：保留 pending，下次 flush
  const remaining: SessionRecording[] = [];
  for (const s of list) {
    try {
      const res = await apiFetch('/api/sessions', {
        method: 'POST',
        body: JSON.stringify(s),
      });
      if (!res.ok) remaining.push(s);
    } catch {
      remaining.push(s);
    }
  }
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(remaining));
  } catch {
    // ignore
  }
}

export const sessionRecorder: SessionRecorder = new SessionRecorder();
