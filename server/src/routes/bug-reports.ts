import type { Database } from 'bun:sqlite';
import { Hono } from 'hono';
import { AppError } from '../errors';
import { requireAuth } from '../middleware/auth';
import { clientIp, requireDeviceId } from '../middleware/device';
import { limitBugReportUpload, limitRead } from '../middleware/rateLimit';
import {
  deleteBugReport,
  findBugReport,
  insertBugReport,
  listBugReports,
} from '../models/bug-report';
import { BugReportSchema } from '../schemas';

export function bugReportsRouter(db: Database): Hono {
  const r = new Hono();

  r.post('/', limitBugReportUpload, requireDeviceId, async (c) => {
    const body = BugReportSchema.parse(await c.req.json());
    const user = c.var.user;
    const userId = user?.id ?? null;
    const deviceId = c.var.deviceId ?? null;
    const anonIp = user ? null : clientIp(c.req.raw.headers);
    const id = insertBugReport(db, body, userId, deviceId, anonIp);
    return c.json({ id }, 201);
  });

  r.get('/', limitRead, requireAuth, (c) => {
    const user = c.var.user;
    if (!user) throw new AppError(401, 'unauthorized', 'login required');
    const q = c.req.query();
    const scopeUserId = user.role === 'admin' ? null : user.id;
    const limit = Math.min(Number(q.limit) || 50, 200);
    const opts: Parameters<typeof listBugReports>[1] = { scopeUserId, limit };
    if (scopeUserId === null) {
      if (q.user_id) opts.filterUserId = Number(q.user_id);
      if (q.anon === 'true') opts.filterAnon = true;
    }
    if (q.before) opts.before = q.before;
    return c.json({ items: listBugReports(db, opts) });
  });

  r.get('/:id', limitRead, requireAuth, (c) => {
    const user = c.var.user;
    if (!user) throw new AppError(401, 'unauthorized', 'login required');
    const scopeUserId = user.role === 'admin' ? null : user.id;
    const id = Number(c.req.param('id'));
    if (!Number.isFinite(id)) throw new AppError(400, 'bad_id', 'id must be integer');
    const row = findBugReport(db, id, scopeUserId);
    if (!row) throw new AppError(404, 'not_found', 'bug report not found');
    return c.json(JSON.parse(row.payload));
  });

  r.delete('/:id', limitRead, requireAuth, (c) => {
    const user = c.var.user;
    if (!user) throw new AppError(401, 'unauthorized', 'login required');
    const scopeUserId = user.role === 'admin' ? null : user.id;
    const id = Number(c.req.param('id'));
    if (!Number.isFinite(id)) throw new AppError(400, 'bad_id', 'id must be integer');
    const changes = deleteBugReport(db, id, scopeUserId);
    if (changes === 0) throw new AppError(404, 'not_found', 'bug report not found');
    return c.body(null, 204);
  });

  return r;
}
