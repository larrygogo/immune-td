import type { Database } from 'bun:sqlite';
import type {
  AnalyticsEventInput,
  AnalyticsEventRecord,
  EventName,
} from '@immune-td/shared';

export interface AnalyticsEventRow {
  id: string;
  user_id: number | null;
  device_id: string;
  session_id: string;
  event_name: string;
  props: string; // JSON
  client_ts: number;
  server_ts: number;
  app_version: string;
  platform: string;
}

/**
 * 批量入库（单事务）：N 条事件一次写完，避免逐条 commit 带来的 fsync。
 * 调用方负责生成 id（UUID v4）+ server_ts；user_id 由调用方按鉴权状态决定（c.var.user）。
 *
 * 返回写入数量（成功事务下 = events.length）。
 */
export function insertEventBatch(db: Database, events: readonly AnalyticsEventRecord[]): number {
  if (events.length === 0) return 0;
  const stmt = db.query(
    `INSERT INTO analytics_events
     (id, user_id, device_id, session_id, event_name, props, client_ts, server_ts, app_version, platform)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const tx = db.transaction((batch: readonly AnalyticsEventRecord[]) => {
    for (const ev of batch) {
      stmt.run(
        ev.id,
        ev.user_id !== null ? Number(ev.user_id) : null,
        ev.device_id,
        ev.session_id,
        ev.event_name,
        JSON.stringify(ev.props),
        ev.client_ts,
        ev.server_ts,
        ev.app_version,
        ev.platform,
      );
    }
  });
  tx(events);
  return events.length;
}

/**
 * 把客户端发来的 input + 服务端补齐字段（id / server_ts / user_id）合成入库 record。
 * id 用 crypto.randomUUID（v4，36 字符）。事件按 server_ts column 排序，不依赖 id 字典序。
 */
export function buildRecordFromInput(
  input: AnalyticsEventInput,
  userId: number | null,
  serverTs: number,
): AnalyticsEventRecord {
  return {
    ...input,
    id: crypto.randomUUID(),
    server_ts: serverTs,
    user_id: userId !== null ? String(userId) : null,
  };
}

export interface FindEventsOpts {
  event_name?: EventName;
  user_id?: number | null;
  device_id?: string;
  session_id?: string;
  /** server_ts >= */
  from?: number;
  /** server_ts < */
  to?: number;
  limit: number;
}

/**
 * admin 查询接口（Task 9 路由用）。本 Task 提供以验证 index 工作 + 测试可读取。
 */
export function findEvents(db: Database, opts: FindEventsOpts): AnalyticsEventRow[] {
  const clauses: string[] = [];
  const params: (string | number | null)[] = [];
  if (opts.event_name !== undefined) {
    clauses.push('event_name = ?');
    params.push(opts.event_name);
  }
  if (opts.user_id !== undefined) {
    if (opts.user_id === null) {
      clauses.push('user_id IS NULL');
    } else {
      clauses.push('user_id = ?');
      params.push(opts.user_id);
    }
  }
  if (opts.device_id !== undefined) {
    clauses.push('device_id = ?');
    params.push(opts.device_id);
  }
  if (opts.session_id !== undefined) {
    clauses.push('session_id = ?');
    params.push(opts.session_id);
  }
  if (typeof opts.from === 'number') {
    clauses.push('server_ts >= ?');
    params.push(opts.from);
  }
  if (typeof opts.to === 'number') {
    clauses.push('server_ts < ?');
    params.push(opts.to);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(opts.limit);
  return db
    .query(
      `SELECT id, user_id, device_id, session_id, event_name, props,
              client_ts, server_ts, app_version, platform
       FROM analytics_events ${where}
       ORDER BY server_ts DESC, id DESC
       LIMIT ?`,
    )
    .all(...params) as AnalyticsEventRow[];
}

export function countEvents(db: Database): number {
  const row = db.query('SELECT COUNT(*) as n FROM analytics_events').get() as { n: number };
  return Number(row.n);
}
