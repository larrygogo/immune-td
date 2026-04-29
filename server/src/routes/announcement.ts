import type { Database } from 'bun:sqlite';
import { Hono } from 'hono';
import { AppError } from '../errors';
import { requireAdmin } from '../middleware/auth';
import { limitRead } from '../middleware/rateLimit';
import {
  type AnnouncementRow,
  deleteAnnouncement,
  insertAnnouncement,
  listActiveAnnouncements,
  listAllAnnouncements,
} from '../models/announcement';
import { SendAnnouncementBody } from '../schemas';

/** 默认公告存活 30 天（spec § 2.4） */
const DEFAULT_EXPIRES_DAYS = 30;

interface AnnouncementDto {
  id: number;
  title: string;
  content: string;
  priority: number;
  publishedAt: string;
  expiresAt: string;
}

function toDto(row: AnnouncementRow): AnnouncementDto {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    priority: row.priority,
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
  };
}

/**
 * 用户接口：
 * - GET /api/announcement —— 列未过期公告，最多 20 条，priority desc + published_at desc
 *   不需要 auth（spec § 2.1：含匿名）
 */
export function announcementRouter(db: Database): Hono {
  const r = new Hono();

  r.get('/', limitRead, (c) => {
    const items = listActiveAnnouncements(db).map(toDto);
    return c.json({ items });
  });

  return r;
}

/**
 * Admin 3 endpoints：
 * - GET /api/admin/announcement     列所有（含过期）
 * - POST /api/admin/announcement    发布
 * - DELETE /api/admin/announcement/:id  撤回
 */
export function adminAnnouncementRouter(db: Database): Hono {
  const r = new Hono();

  r.get('/', limitRead, requireAdmin, (c) => {
    const q = c.req.query();
    const limit = Math.min(Number(q.limit) || 50, 200);
    const items = listAllAnnouncements(db, limit).map(toDto);
    return c.json({ items });
  });

  r.post('/', limitRead, requireAdmin, async (c) => {
    const body = SendAnnouncementBody.parse(await c.req.json());
    const expiresInDays = body.expiresInDays ?? DEFAULT_EXPIRES_DAYS;
    const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000).toISOString();
    const id = insertAnnouncement(db, {
      title: body.title,
      content: body.content,
      priority: body.priority ?? 0,
      expiresAt,
    });
    return c.json({ id }, 201);
  });

  r.delete('/:id', limitRead, requireAdmin, (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isFinite(id)) throw new AppError(400, 'bad_id', 'id must be integer');
    const changes = deleteAnnouncement(db, id);
    if (changes === 0) throw new AppError(404, 'not_found', 'announcement not found');
    return c.body(null, 204);
  });

  return r;
}
