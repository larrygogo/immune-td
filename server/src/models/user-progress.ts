import type { Database } from 'bun:sqlite';

export interface UserProgressRow {
  user_id: number;
  payload: string;
  payload_version: number;
  updated_at: string;
  created_at: string;
}

export function getProgress(db: Database, userId: number): UserProgressRow | null {
  return (
    (db
      .query(
        'SELECT user_id, payload, payload_version, updated_at, created_at FROM user_progress WHERE user_id = ?',
      )
      .get(userId) as UserProgressRow | null) ?? null
  );
}

/**
 * 插入或更新。冲突时仅更新 payload / payload_version / updated_at，保留 created_at。
 * 返回最新的 updated_at 字符串。
 */
export function upsertProgress(
  db: Database,
  userId: number,
  payloadJson: string,
  payloadVersion: number,
): string {
  const row = db
    .query(
      `INSERT INTO user_progress (user_id, payload, payload_version)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         payload = excluded.payload,
         payload_version = excluded.payload_version,
         updated_at = datetime('now')
       RETURNING updated_at`,
    )
    .get(userId, payloadJson, payloadVersion) as { updated_at: string } | null;
  if (!row) throw new Error('upsertProgress: no row returned');
  return row.updated_at;
}
