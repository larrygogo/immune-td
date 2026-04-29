import type { Database } from 'bun:sqlite';
import { Hono } from 'hono';
import { AppError } from '../errors';
import { requireAuth } from '../middleware/auth';
import { limitRead } from '../middleware/rateLimit';
import { getProgress, upsertProgress } from '../models/user-progress';
import { PutProgressSchema } from '../schemas';

export function progressRouter(db: Database): Hono {
  const r = new Hono();

  r.get('/', limitRead, requireAuth, (c) => {
    const user = c.var.user;
    if (!user) throw new AppError(401, 'unauthorized', 'login required');
    const row = getProgress(db, user.id);
    if (!row) return c.json({ progress: null });
    return c.json({
      progress: JSON.parse(row.payload),
      payloadVersion: row.payload_version,
      updatedAt: row.updated_at,
    });
  });

  r.put('/', limitRead, requireAuth, async (c) => {
    const user = c.var.user;
    if (!user) throw new AppError(401, 'unauthorized', 'login required');
    const body = PutProgressSchema.parse(await c.req.json());
    const updatedAt = upsertProgress(
      db,
      user.id,
      JSON.stringify(body.progress),
      body.payloadVersion,
    );
    return c.json({ updatedAt });
  });

  return r;
}
