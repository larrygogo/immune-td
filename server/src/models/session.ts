import type { Database } from 'bun:sqlite';

export type Outcome = 'won' | 'lost' | 'aborted';

export interface SessionSummary {
  outcome: Outcome;
  finalHp: number;
  finalAtp: number;
  waveReached: number;
  stars?: number;
}

export interface SessionRecording {
  version: 1;
  sessionId: string;
  levelId: number;
  seed: number;
  startedAt: string;
  endedAt?: string;
  endTick?: number;
  actions: Array<{
    tick: number;
    type: string;
    args: Record<string, unknown>;
    ok: boolean;
    error?: string;
  }>;
  summary?: SessionSummary;
}

export interface SessionRow {
  id: string;
  user_id: number | null;
  device_id: string | null;
  anon_ip: string | null;
  level_id: number;
  seed: number;
  outcome: Outcome;
  stars: number | null;
  actions_count: number;
  wave_reached: number;
  end_tick: number | null;
  started_at: string;
  ended_at: string | null;
  payload: string;
  created_at: string;
}

export interface SessionSummaryRow {
  id: string;
  level_id: number;
  seed: number;
  outcome: Outcome;
  stars: number | null;
  actions_count: number;
  wave_reached: number;
  started_at: string;
  created_at: string;
}

export function insertSession(
  db: Database,
  rec: SessionRecording,
  userId: number | null,
  deviceId: string | null,
  anonIp: string | null,
): void {
  db.query(
    `INSERT INTO sessions (
       id, user_id, device_id, anon_ip, level_id, seed, outcome, stars,
       actions_count, wave_reached, end_tick, started_at, ended_at, payload
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    rec.sessionId,
    userId,
    deviceId,
    anonIp,
    rec.levelId,
    rec.seed,
    rec.summary?.outcome ?? 'aborted',
    rec.summary?.stars ?? null,
    rec.actions.length,
    rec.summary?.waveReached ?? 0,
    rec.endTick ?? null,
    rec.startedAt,
    rec.endedAt ?? null,
    JSON.stringify(rec),
  );
}

/** 按权限过滤列表（player 只看自己 / admin 可自由过滤）；summary 字段只返前端需要的 */
export function listSessions(
  db: Database,
  opts: {
    scopeUserId: number | null; // null = admin 查全部 / 非 null = player 查自己
    filterUserId?: number; // admin 传 ?user_id=
    filterAnon?: boolean; // admin 传 ?anon=true
    levelId?: number;
    outcome?: Outcome;
    limit: number;
    before?: string; // created_at < ?
  },
): SessionSummaryRow[] {
  const clauses: string[] = [];
  const params: (string | number | null)[] = [];
  if (opts.scopeUserId !== null) {
    clauses.push('user_id = ?');
    params.push(opts.scopeUserId);
  } else if (opts.filterAnon) {
    clauses.push('user_id IS NULL');
  } else if (typeof opts.filterUserId === 'number') {
    clauses.push('user_id = ?');
    params.push(opts.filterUserId);
  }
  if (typeof opts.levelId === 'number') {
    clauses.push('level_id = ?');
    params.push(opts.levelId);
  }
  if (opts.outcome) {
    clauses.push('outcome = ?');
    params.push(opts.outcome);
  }
  if (opts.before) {
    clauses.push('created_at < ?');
    params.push(opts.before);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(opts.limit);
  const rows = db
    .query(
      `SELECT id, level_id, seed, outcome, stars, actions_count, wave_reached, started_at, created_at
       FROM sessions ${where}
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(...params) as SessionSummaryRow[];
  return rows;
}

/** 按权限 find；player 拿不到别人的 → 返 null，route 转 404 */
export function findSession(
  db: Database,
  id: string,
  scopeUserId: number | null,
): SessionRow | null {
  if (scopeUserId === null) {
    return (db.query('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | null) ?? null;
  }
  return (
    (db
      .query('SELECT * FROM sessions WHERE id = ? AND user_id = ?')
      .get(id, scopeUserId) as SessionRow | null) ?? null
  );
}

/** 返回被删除行数（用于 404 判定） */
export function deleteSession(db: Database, id: string, scopeUserId: number | null): number {
  const res =
    scopeUserId === null
      ? db.query('DELETE FROM sessions WHERE id = ?').run(id)
      : db.query('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(id, scopeUserId);
  return Number(res.changes);
}
