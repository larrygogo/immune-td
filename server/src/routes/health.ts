import { Hono } from 'hono';
import type { Database } from 'bun:sqlite';

export function healthRouter(db: Database, startTime: number): Hono {
  const r = new Hono();
  r.get('/', (c) => {
    let dbOk = 'ok';
    try {
      db.query('SELECT 1').get();
    } catch {
      dbOk = 'fail';
    }
    return c.json({
      status: 'ok',
      db: dbOk,
      uptime_sec: Math.floor((Date.now() - startTime) / 1000),
      version: '0.1.0',
    });
  });
  return r;
}
