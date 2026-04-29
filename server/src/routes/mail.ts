import type { Database } from 'bun:sqlite';
import { Hono } from 'hono';
import { AppError } from '../errors';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { limitRead } from '../middleware/rateLimit';
import {
  countUnread,
  deleteMail,
  findVisibleMail,
  insertMail,
  listAllMail,
  listInbox,
  markMailRead,
  softDeleteMail,
  tryClaimMail,
} from '../models/mail';
import { type Reward, SendMailBody } from '../schemas';

/**
 * 默认邮件存活 30 天（spec § 2.4）。admin 可通过 expiresInDays 覆盖。
 */
const DEFAULT_EXPIRES_DAYS = 30;

/**
 * 解析 mail.rewards JSON：
 * - 入库时一定是 RewardSchema 校验过的合法 JSON 或 NULL
 * - 解析失败（人为污染）容错返回 null（前端拿到无奖励视图，不崩）
 */
function parseRewards(rewardsJson: string | null): Reward | null {
  if (rewardsJson === null) return null;
  try {
    return JSON.parse(rewardsJson) as Reward;
  } catch {
    return null;
  }
}

interface InboxRowDto {
  id: number;
  targetUserId: number | null;
  subject: string;
  content: string;
  rewards: Reward | null;
  createdAt: string;
  expiresAt: string;
  readAt: string | null;
  claimedAt: string | null;
}

/** server inbox row → 前端 DTO（蛇形 → 驼峰；rewards JSON → 对象） */
function toInboxDto(row: ReturnType<typeof listInbox>[number]): InboxRowDto {
  return {
    id: row.id,
    targetUserId: row.target_user_id,
    subject: row.subject,
    content: row.content,
    rewards: parseRewards(row.rewards),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    readAt: row.read_at,
    claimedAt: row.claimed_at,
  };
}

interface AdminMailRowDto {
  id: number;
  targetUserId: number | null;
  subject: string;
  content: string;
  rewards: Reward | null;
  createdAt: string;
  expiresAt: string;
}

function toAdminDto(row: ReturnType<typeof listAllMail>[number]): AdminMailRowDto {
  return {
    id: row.id,
    targetUserId: row.target_user_id,
    subject: row.subject,
    content: row.content,
    rewards: parseRewards(row.rewards),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

/**
 * 用户 5 endpoints：
 * - GET /api/mail               收件箱
 * - GET /api/mail/unread-count  红点用
 * - POST /api/mail/:id/read     标已读
 * - POST /api/mail/:id/claim    领奖（含 rewards 才有意义）
 * - DELETE /api/mail/:id        软删（未领奖 → 400）
 */
export function mailRouter(db: Database): Hono {
  const r = new Hono();

  r.get('/', limitRead, requireAuth, (c) => {
    const user = c.var.user;
    if (!user) throw new AppError(401, 'unauthorized', 'login required');
    const items = listInbox(db, user.id).map(toInboxDto);
    return c.json({ items });
  });

  r.get('/unread-count', limitRead, requireAuth, (c) => {
    const user = c.var.user;
    if (!user) throw new AppError(401, 'unauthorized', 'login required');
    return c.json({ count: countUnread(db, user.id) });
  });

  r.post('/:id/read', limitRead, requireAuth, (c) => {
    const user = c.var.user;
    if (!user) throw new AppError(401, 'unauthorized', 'login required');
    const id = Number(c.req.param('id'));
    if (!Number.isFinite(id)) throw new AppError(400, 'bad_id', 'id must be integer');
    // 必须可见（含定向校验 + 未过期 + 未软删）
    const row = findVisibleMail(db, id, user.id);
    if (!row) throw new AppError(404, 'not_found', 'mail not found');
    markMailRead(db, id, user.id);
    return c.body(null, 204);
  });

  r.post('/:id/claim', limitRead, requireAuth, (c) => {
    const user = c.var.user;
    if (!user) throw new AppError(401, 'unauthorized', 'login required');
    const id = Number(c.req.param('id'));
    if (!Number.isFinite(id)) throw new AppError(400, 'bad_id', 'id must be integer');
    const row = findVisibleMail(db, id, user.id);
    if (!row) throw new AppError(404, 'not_found', 'mail not found');
    const rewards = parseRewards(row.rewards);
    if (!rewards) throw new AppError(400, 'no_rewards', 'mail has no rewards to claim');
    // 已领过 → 409（必须先看 row.claimed_at 而不是只 tryClaim 否则会写一行新 state）
    if (row.claimed_at !== null) {
      throw new AppError(409, 'already_claimed', 'mail rewards already claimed');
    }
    const ok = tryClaimMail(db, id, user.id);
    if (!ok) {
      // 并发场景：刚刚另一个请求抢先领走
      throw new AppError(409, 'already_claimed', 'mail rewards already claimed');
    }
    return c.json({ rewards });
  });

  r.delete('/:id', limitRead, requireAuth, (c) => {
    const user = c.var.user;
    if (!user) throw new AppError(401, 'unauthorized', 'login required');
    const id = Number(c.req.param('id'));
    if (!Number.isFinite(id)) throw new AppError(400, 'bad_id', 'id must be integer');
    const row = findVisibleMail(db, id, user.id);
    if (!row) throw new AppError(404, 'not_found', 'mail not found');
    // 含未领奖 → 拒绝（spec § 2.3）
    const rewards = parseRewards(row.rewards);
    if (rewards && row.claimed_at === null) {
      throw new AppError(400, 'has_unclaimed_rewards', '请先领取奖励再删除');
    }
    softDeleteMail(db, id, user.id);
    return c.body(null, 204);
  });

  return r;
}

/**
 * Admin 3 endpoints：
 * - GET /api/admin/mail            列出（含过期）
 * - POST /api/admin/mail           发邮件（broadcast 或定向）
 * - DELETE /api/admin/mail/:id     物理撤回
 */
export function adminMailRouter(db: Database): Hono {
  const r = new Hono();

  r.get('/', limitRead, requireAdmin, (c) => {
    const q = c.req.query();
    const limit = Math.min(Number(q.limit) || 50, 200);
    let targetUserId: number | null | undefined;
    if (q.target_user_id !== undefined) {
      if (q.target_user_id === 'null') {
        targetUserId = null;
      } else {
        const n = Number(q.target_user_id);
        if (!Number.isFinite(n)) {
          throw new AppError(400, 'bad_target', 'target_user_id must be integer or "null"');
        }
        targetUserId = n;
      }
    }
    const opts: Parameters<typeof listAllMail>[1] = { limit };
    if (targetUserId !== undefined) opts.targetUserId = targetUserId;
    const items = listAllMail(db, opts).map(toAdminDto);
    return c.json({ items });
  });

  r.post('/', limitRead, requireAdmin, async (c) => {
    const body = SendMailBody.parse(await c.req.json());
    const expiresInDays = body.expiresInDays ?? DEFAULT_EXPIRES_DAYS;
    const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000).toISOString();
    const targetUserId = body.broadcast ? null : (body.targetUserId ?? null);
    const params: Parameters<typeof insertMail>[1] = {
      targetUserId,
      subject: body.subject,
      content: body.content,
      rewards: body.rewards ?? null,
      expiresAt,
    };
    const id = insertMail(db, params);
    return c.json({ id }, 201);
  });

  r.delete('/:id', limitRead, requireAdmin, (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isFinite(id)) throw new AppError(400, 'bad_id', 'id must be integer');
    const changes = deleteMail(db, id);
    if (changes === 0) throw new AppError(404, 'not_found', 'mail not found');
    return c.body(null, 204);
  });

  return r;
}
