import type { Database } from 'bun:sqlite';
import type { Reward } from '../schemas';

// ---------------------------------------------------------------------------
// 行类型（贴 SQL schema，蛇形）
// ---------------------------------------------------------------------------

export interface MailRow {
  id: number;
  target_user_id: number | null;
  subject: string;
  content: string;
  /** JSON 字符串；NULL 表示无奖励 */
  rewards: string | null;
  created_at: string;
  expires_at: string;
}

export interface UserMailStateRow {
  mail_id: number;
  user_id: number;
  read_at: string | null;
  claimed_at: string | null;
  deleted_at: string | null;
}

/** 收件箱查询：左联当前 user 的 state（可能不存在） */
export interface InboxRow extends MailRow {
  read_at: string | null;
  claimed_at: string | null;
}

// ---------------------------------------------------------------------------
// admin 写
// ---------------------------------------------------------------------------

/**
 * 插入邮件（admin 用）：
 * - targetUserId=null → 广播
 * - rewards 传 null（无奖励）或 Reward 对象（自动 JSON.stringify）
 * - expires_at 直接接 ISO 字符串（路由层算好 published_at + N days）
 */
export function insertMail(
  db: Database,
  params: {
    targetUserId: number | null;
    subject: string;
    content: string;
    rewards: Reward | null;
    expiresAt: string;
  },
): number {
  const rewardsJson = params.rewards === null ? null : JSON.stringify(params.rewards);
  const res = db
    .query(
      `INSERT INTO mail (target_user_id, subject, content, rewards, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(params.targetUserId, params.subject, params.content, rewardsJson, params.expiresAt);
  return Number(res.lastInsertRowid);
}

/** admin 物理撤回（cascade 删 user_mail_state） */
export function deleteMail(db: Database, mailId: number): number {
  const res = db.query('DELETE FROM mail WHERE id = ?').run(mailId);
  return Number(res.changes);
}

/** admin list（含过期），支持按 target_user_id 过滤 */
export function listAllMail(
  db: Database,
  opts: { targetUserId?: number | null; limit: number },
): MailRow[] {
  if (opts.targetUserId === undefined) {
    return db
      .query('SELECT * FROM mail ORDER BY created_at DESC LIMIT ?')
      .all(opts.limit) as MailRow[];
  }
  if (opts.targetUserId === null) {
    return db
      .query('SELECT * FROM mail WHERE target_user_id IS NULL ORDER BY created_at DESC LIMIT ?')
      .all(opts.limit) as MailRow[];
  }
  return db
    .query(
      'SELECT * FROM mail WHERE target_user_id = ? ORDER BY created_at DESC LIMIT ?',
    )
    .all(opts.targetUserId, opts.limit) as MailRow[];
}

// ---------------------------------------------------------------------------
// 用户读 / 状态变更
// ---------------------------------------------------------------------------

/**
 * 收件箱：union(广播, 定向给我的) - 我软删的 - 已过期。
 * 用 LEFT JOIN user_mail_state（首次未交互的邮件没有 state 行）。
 *
 * 排序：created_at DESC；硬上限 50（spec § 2.5）。
 *
 * datetime() 归一化：mail.expires_at 是 ISO 串（toISOString()），
 * SQLite datetime('now') 是空格格式，必须 datetime() 后再比，避免 ASCII 顺序 bug
 * （见 cleanup.ts 头注释 / token.ts findUserByToken 同源问题）。
 */
export function listInbox(db: Database, userId: number): InboxRow[] {
  return db
    .query(
      `SELECT m.id, m.target_user_id, m.subject, m.content, m.rewards,
              m.created_at, m.expires_at,
              ums.read_at, ums.claimed_at
       FROM mail m
       LEFT JOIN user_mail_state ums
         ON ums.mail_id = m.id AND ums.user_id = ?
       WHERE (m.target_user_id = ? OR m.target_user_id IS NULL)
         AND datetime(m.expires_at) > datetime('now')
         AND (ums.deleted_at IS NULL)
       ORDER BY m.created_at DESC
       LIMIT 50`,
    )
    .all(userId, userId) as InboxRow[];
}

/**
 * 未读数：收件箱里 read_at IS NULL 的条目数。
 * 跟 listInbox 同 WHERE 条件，只是聚合 + 多一条 read_at IS NULL。
 */
export function countUnread(db: Database, userId: number): number {
  const row = db
    .query(
      `SELECT COUNT(*) as c
       FROM mail m
       LEFT JOIN user_mail_state ums
         ON ums.mail_id = m.id AND ums.user_id = ?
       WHERE (m.target_user_id = ? OR m.target_user_id IS NULL)
         AND datetime(m.expires_at) > datetime('now')
         AND (ums.deleted_at IS NULL)
         AND (ums.read_at IS NULL)`,
    )
    .get(userId, userId) as { c: number };
  return row.c;
}

/**
 * 找邮件给指定 user：必须是「广播 OR 定向给该 user」+ 未过期 + 该 user 未软删。
 * 用于 read / claim / delete 路由的可见性校验。
 * 找不到（包括过期 / 已软删 / 越权）返 null。
 */
export function findVisibleMail(
  db: Database,
  mailId: number,
  userId: number,
): InboxRow | null {
  const row = db
    .query(
      `SELECT m.id, m.target_user_id, m.subject, m.content, m.rewards,
              m.created_at, m.expires_at,
              ums.read_at, ums.claimed_at
       FROM mail m
       LEFT JOIN user_mail_state ums
         ON ums.mail_id = m.id AND ums.user_id = ?
       WHERE m.id = ?
         AND (m.target_user_id = ? OR m.target_user_id IS NULL)
         AND datetime(m.expires_at) > datetime('now')
         AND (ums.deleted_at IS NULL)`,
    )
    .get(userId, mailId, userId) as InboxRow | null;
  return row ?? null;
}

/**
 * 标记已读（idempotent）：
 * - 没 state 行 → INSERT (read_at=now)
 * - 有但 read_at IS NULL → UPDATE 写入 now
 * - 已有 read_at → 不动
 *
 * 返回最终的 state row（路由可选用，目前不需要）。
 */
export function markMailRead(db: Database, mailId: number, userId: number): void {
  // INSERT ... ON CONFLICT 一行搞定（CONFLICT 时只在 read_at IS NULL 时更新）
  db.query(
    `INSERT INTO user_mail_state (mail_id, user_id, read_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(mail_id, user_id) DO UPDATE SET
       read_at = COALESCE(user_mail_state.read_at, datetime('now'))`,
  ).run(mailId, userId);
}

/**
 * 领取奖励的并发安全写入（spec § 8 风险表）：
 * 用 INSERT ON CONFLICT DO NOTHING + RETURNING；首次写入返 row 算成功，
 * 重复点击的第二次只能拿到「已存在」的 row（claimed_at 已非空），
 * 路由层据此判 409 Conflict。
 *
 * 注意：第一次进来时 user_mail_state 可能根本不存在（用户还没标已读），
 * 第二次进来时已有但 claimed_at IS NULL（先点 read 再点 claim）也是合法。
 *
 * 实现策略：
 * 1. 先 INSERT 一行带 claimed_at（如果是从未交互过的邮件），ON CONFLICT 忽略
 * 2. 然后 UPDATE SET claimed_at = now WHERE claimed_at IS NULL（用 changes 判定首次）
 * 这样原子性靠 SQLite 单语句保证；第一次 changes=1，第二次 changes=0。
 *
 * 返回是否首次成功领取（true 应用奖励 / false 路由 409）。
 */
export function tryClaimMail(db: Database, mailId: number, userId: number): boolean {
  // 注意：之前曾有「事务前先 INSERT 一条占位行」的实现，但那条 INSERT
  // 在事务外把 claimed_at 写成 now，导致事务内 SELECT 看到非空 → 误判已领。
  // 当前实现仅靠事务内 SELECT + UPSERT 串行化，不在事务外写任何状态。

  // 仅在 claimed_at IS NULL 时写。
  // 路径 A：刚 INSERT 进去的行（claimed_at 已非空）→ changes=0，但首次成功的事实由 INSERT 路径承担
  // 路径 B：行原本就存在（read 时 INSERT 过）→ 这次 UPDATE 可能写入或不写
  // 难点：INSERT 成功 vs CONFLICT 都返回 changes=1（INSERT）/ 0（DO NOTHING），
  // 我们没有可靠的 RETURNING 跨路径区分。换思路：
  //
  // 最简方案 —— 用单一原子 UPSERT，让 conflict 分支 SET claimed_at = COALESCE(...)
  // 但这样无法判定「是不是首次」。
  //
  // 更稳的方案：
  //   先 SELECT claimed_at（事务内）→ 看是否已领 → 否则 UPSERT 一次。
  //   SQLite Bun 单线程进程内不会有真并发；仅是跨请求并发，靠 transaction() 串行化即可。
  let firstClaim = false;
  db.transaction(() => {
    const cur = db
      .query('SELECT claimed_at FROM user_mail_state WHERE mail_id = ? AND user_id = ?')
      .get(mailId, userId) as { claimed_at: string | null } | null;
    if (cur && cur.claimed_at !== null) {
      firstClaim = false;
      return;
    }
    db.query(
      `INSERT INTO user_mail_state (mail_id, user_id, claimed_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(mail_id, user_id) DO UPDATE SET claimed_at = datetime('now')
       WHERE user_mail_state.claimed_at IS NULL`,
    ).run(mailId, userId);
    firstClaim = true;
  })();
  return firstClaim;
}

/**
 * 软删（用户 DELETE /api/mail/:id）：
 * - 没 state 行 → INSERT (deleted_at=now)
 * - 有 state 行 → UPDATE deleted_at=now（即使已删除也幂等）
 * 路由层在调本函数前需先校验「不含未领奖励」。
 */
export function softDeleteMail(db: Database, mailId: number, userId: number): void {
  db.query(
    `INSERT INTO user_mail_state (mail_id, user_id, deleted_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(mail_id, user_id) DO UPDATE SET deleted_at = datetime('now')`,
  ).run(mailId, userId);
}

// ---------------------------------------------------------------------------
// cleanup（M4）
// ---------------------------------------------------------------------------

/**
 * 物理删 expires_at 早于 N 天前的邮件。cascade 自动删 user_mail_state。
 * datetime() 归一化（同 cleanup.ts 头注释提到的 ASCII 顺序问题）。
 */
export function deleteExpiredMail(db: Database, retentionDaysAfterExpiry: number): number {
  const res = db
    .query(
      `DELETE FROM mail
       WHERE datetime(expires_at) < datetime('now', ?)`,
    )
    .run(`-${retentionDaysAfterExpiry} days`);
  return Number(res.changes);
}
