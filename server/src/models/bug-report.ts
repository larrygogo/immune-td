import type { Database } from 'bun:sqlite';

export interface BugReportRow {
  id: number;
  user_id: number | null;
  device_id: string | null;
  anon_ip: string | null;
  ts: string;
  level_id: number | null;
  seed: number | null;
  phase: string | null;
  payload: string;
  created_at: string;
}

export interface BugReportSummaryRow {
  id: number;
  ts: string;
  level_id: number | null;
  seed: number | null;
  phase: string | null;
  created_at: string;
}

export function insertBugReport(
  db: Database,
  body: {
    ts?: string;
    levelId?: number | null;
    seed?: number | null;
    phase?: string | null;
    [k: string]: unknown;
  },
  userId: number | null,
  deviceId: string | null,
  anonIp: string | null,
): number {
  const ts = body.ts ?? new Date().toISOString();
  const res = db
    .query(
      `INSERT INTO bug_reports (user_id, device_id, anon_ip, ts, level_id, seed, phase, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      userId,
      deviceId,
      anonIp,
      ts,
      body.levelId ?? null,
      body.seed ?? null,
      body.phase ?? null,
      JSON.stringify(body),
    );
  return Number(res.lastInsertRowid);
}

export function listBugReports(
  db: Database,
  opts: {
    scopeUserId: number | null;
    filterUserId?: number;
    filterAnon?: boolean;
    limit: number;
    before?: string;
  },
): BugReportSummaryRow[] {
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
  if (opts.before) {
    clauses.push('created_at < ?');
    params.push(opts.before);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(opts.limit);
  return db
    .query(
      `SELECT id, ts, level_id, seed, phase, created_at
       FROM bug_reports ${where}
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(...params) as BugReportSummaryRow[];
}

export function findBugReport(
  db: Database,
  id: number,
  scopeUserId: number | null,
): BugReportRow | null {
  if (scopeUserId === null) {
    return (
      (db.query('SELECT * FROM bug_reports WHERE id = ?').get(id) as BugReportRow | null) ?? null
    );
  }
  return (
    (db
      .query('SELECT * FROM bug_reports WHERE id = ? AND user_id = ?')
      .get(id, scopeUserId) as BugReportRow | null) ?? null
  );
}

export function deleteBugReport(db: Database, id: number, scopeUserId: number | null): number {
  const res =
    scopeUserId === null
      ? db.query('DELETE FROM bug_reports WHERE id = ?').run(id)
      : db.query('DELETE FROM bug_reports WHERE id = ? AND user_id = ?').run(id, scopeUserId);
  return Number(res.changes);
}
