import type { Database } from 'bun:sqlite';

// ---------------------------------------------------------------------------
// 行类型（贴 SQL schema）
// ---------------------------------------------------------------------------

export interface AnnouncementRow {
  id: number;
  title: string;
  content: string;
  priority: number;
  published_at: string;
  expires_at: string;
}

// ---------------------------------------------------------------------------
// admin 写
// ---------------------------------------------------------------------------

/** 发布公告 */
export function insertAnnouncement(
  db: Database,
  params: {
    title: string;
    content: string;
    priority: number;
    expiresAt: string;
  },
): number {
  const res = db
    .query(
      `INSERT INTO announcement (title, content, priority, expires_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(params.title, params.content, params.priority, params.expiresAt);
  return Number(res.lastInsertRowid);
}

/** 撤回（物理删） */
export function deleteAnnouncement(db: Database, id: number): number {
  const res = db.query('DELETE FROM announcement WHERE id = ?').run(id);
  return Number(res.changes);
}

// ---------------------------------------------------------------------------
// 列表
// ---------------------------------------------------------------------------

/**
 * 用户接口：仅未过期，按 priority desc + published_at desc，硬上限 20。
 * datetime() 归一化（同 mail.ts 注释）。
 */
export function listActiveAnnouncements(db: Database): AnnouncementRow[] {
  return db
    .query(
      `SELECT * FROM announcement
       WHERE datetime(expires_at) > datetime('now')
       ORDER BY priority DESC, published_at DESC
       LIMIT 20`,
    )
    .all() as AnnouncementRow[];
}

/** admin：含过期的全部，按 published_at DESC，limit 可调 */
export function listAllAnnouncements(db: Database, limit: number): AnnouncementRow[] {
  return db
    .query('SELECT * FROM announcement ORDER BY published_at DESC LIMIT ?')
    .all(limit) as AnnouncementRow[];
}

// ---------------------------------------------------------------------------
// cleanup（M4）
// ---------------------------------------------------------------------------

/** 物理删过期 N 天以上的公告 */
export function deleteExpiredAnnouncements(
  db: Database,
  retentionDaysAfterExpiry: number,
): number {
  const res = db
    .query(
      `DELETE FROM announcement
       WHERE datetime(expires_at) < datetime('now', ?)`,
    )
    .run(`-${retentionDaysAfterExpiry} days`);
  return Number(res.changes);
}
