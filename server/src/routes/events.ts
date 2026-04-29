import type { Database } from 'bun:sqlite';
import { Hono } from 'hono';
import { requireDeviceId } from '../middleware/device';
import { limitEventsUpload } from '../middleware/rateLimit';
import { buildRecordFromInput, insertEventBatch } from '../models/analytics-event';
import { PostEventsBodySchema } from '@immune-td/shared';

/**
 * 通用埋点上报。匿名也允许，但配额更紧（dualQuotaLimiter）。
 *
 * - body: `{ events: AnalyticsEventInput[] }`，最多 50 条/批（schema 校验）
 * - server 补齐 `id` (UUID v4) / `server_ts` (Date.now()) / `user_id` (从 c.var.user)
 * - 单事务批量 insert，避免逐条 fsync
 *
 * 返回 `{ accepted: number }`，前端据此清理已上报的本地队列。
 */
export function eventsRouter(db: Database): Hono {
  const r = new Hono();

  r.post('/', limitEventsUpload, requireDeviceId, async (c) => {
    const body = PostEventsBodySchema.parse(await c.req.json());
    const user = c.var.user;
    const userId = user?.id ?? null;
    const serverTs = Date.now();
    const records = body.events.map((ev) => buildRecordFromInput(ev, userId, serverTs));
    const accepted = insertEventBatch(db, records);
    return c.json({ accepted });
  });

  return r;
}
