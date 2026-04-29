import type { Database } from 'bun:sqlite';
import { Hono } from 'hono';
import { AppError } from '../errors';
import { requireAuth } from '../middleware/auth';
import { clientIp, requireDeviceId } from '../middleware/device';
import { limitRead, limitSessionUpload } from '../middleware/rateLimit';
import {
  type SessionSummaryRow,
  deleteSession,
  findSession,
  insertSession,
  listSessions,
} from '../models/session';
import { SessionRecordingSchema } from '../schemas';

export function sessionsRouter(db: Database): Hono {
  const r = new Hono();

  // POST /api/sessions：允许匿名，但必带 X-Device-Id
  // limitSessionUpload 内部按 c.var.user 存在切 quota：匿名 5 / 登录 30
  r.post('/', limitSessionUpload, requireDeviceId, async (c) => {
    const body = SessionRecordingSchema.parse(await c.req.json());
    const user = c.var.user;
    const userId = user?.id ?? null;
    const deviceId = c.var.deviceId ?? null;
    const anonIp = user ? null : clientIp(c.req.raw.headers);
    try {
      insertSession(db, body, userId, deviceId, anonIp);
    } catch (err) {
      // sessionId 冲突 → 409（idempotent upload 可改成忽略，MVP 先严格）
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE')) {
        throw new AppError(409, 'session_exists', 'sessionId already uploaded');
      }
      throw err;
    }
    return c.json({ id: body.sessionId }, 201);
  });

  // GET /api/sessions 列表 - 仅登录
  r.get('/', limitRead, requireAuth, (c) => {
    const user = c.var.user;
    if (!user) throw new AppError(401, 'unauthorized', 'login required');
    const q = c.req.query();
    const scopeUserId = user.role === 'admin' ? null : user.id;
    const limit = Math.min(Number(q.limit) || 50, 200);

    const opts: Parameters<typeof listSessions>[1] = {
      scopeUserId,
      limit,
    };
    if (scopeUserId === null) {
      // admin 额外过滤
      if (q.user_id) opts.filterUserId = Number(q.user_id);
      if (q.anon === 'true') opts.filterAnon = true;
    }
    if (q.level_id) opts.levelId = Number(q.level_id);
    if (q.outcome === 'won' || q.outcome === 'lost' || q.outcome === 'aborted') {
      opts.outcome = q.outcome;
    }
    if (q.before) opts.before = q.before;

    const items: SessionSummaryRow[] = listSessions(db, opts);
    return c.json({ items });
  });

  // GET /api/sessions/:id 单个
  r.get('/:id', limitRead, requireAuth, (c) => {
    const user = c.var.user;
    if (!user) throw new AppError(401, 'unauthorized', 'login required');
    const scopeUserId = user.role === 'admin' ? null : user.id;
    const row = findSession(db, c.req.param('id'), scopeUserId);
    if (!row) throw new AppError(404, 'not_found', 'session not found');
    // payload 存的是完整 JSON，直接返回解析后的对象
    return c.json(JSON.parse(row.payload));
  });

  // DELETE /api/sessions/:id
  r.delete('/:id', limitRead, requireAuth, (c) => {
    const user = c.var.user;
    if (!user) throw new AppError(401, 'unauthorized', 'login required');
    const scopeUserId = user.role === 'admin' ? null : user.id;
    const changes = deleteSession(db, c.req.param('id'), scopeUserId);
    if (changes === 0) throw new AppError(404, 'not_found', 'session not found');
    return c.body(null, 204);
  });

  return r;
}
