import type { Database } from 'bun:sqlite';

export interface AuthUserRow {
  id: number;
  username: string;
  role: 'player' | 'admin';
  /** migration 005：wx 用户授权回填（H5 / 未授权恒 NULL）。前端检查是否要走授权流程 */
  wechat_nickname: string | null;
  /** migration 005：wx avatarUrl（同上） */
  wechat_avatar: string | null;
  /** migration 008：H5 玩家昵称（wx 用户恒 NULL） */
  nickname: string | null;
  nickname_set_at: string | null;
}

/** 32B 随机 → base64url（无填充） */
export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url');
}

/** 插入 auth_tokens；返回 token 明文（只此一次暴露） */
export function createToken(
  db: Database,
  userId: number,
  ttlDays: number,
  userAgent: string | null,
  ip: string | null,
): string {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + ttlDays * 86_400_000).toISOString();
  db.query(
    'INSERT INTO auth_tokens (token, user_id, expires_at, user_agent, ip) VALUES (?, ?, ?, ?, ?)',
  ).run(token, userId, expiresAt, userAgent, ip);
  return token;
}

/**
 * 查 token 对应 user（校验未过期）；找不到 / 过期返回 null。
 *
 * ⚠️ `datetime(t.expires_at)` 是**必要的**：我们存的 `expires_at` 是 `toISOString()`
 * 格式（`2026-04-23T06:52:00.271Z`，带 T 分隔 + 毫秒 + Z），而 SQLite `datetime('now')`
 * 返回的是 `2026-04-23 06:52:00`（空格分隔、无毫秒、无 Z）。直接字符串比较会按 ASCII
 * 顺序：`T` (0x54) > ` ` (0x20) → 同一秒内的 token 被判为仍有效，甚至 token 过期后
 * 当天仍可用。`datetime(expires_at)` 会把两种格式都归一化到 SQLite canonical 后再比较。
 */
export function findUserByToken(db: Database, token: string): AuthUserRow | null {
  const row = db
    .query(
      `SELECT u.id, u.username, u.role, u.wechat_nickname, u.wechat_avatar,
              u.nickname, u.nickname_set_at FROM auth_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE t.token = ? AND datetime(t.expires_at) > datetime('now')`,
    )
    .get(token) as AuthUserRow | null;
  return row ?? null;
}

export function revokeToken(db: Database, token: string): void {
  db.query('DELETE FROM auth_tokens WHERE token = ?').run(token);
}
