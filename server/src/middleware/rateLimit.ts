import type { Context, MiddlewareHandler } from 'hono';
import { rateLimiter } from 'hono-rate-limiter';
import { clientIp } from './device';

/**
 * 匿名请求 key = "anon:<ip>:<device_id>"；登录请求 key = "user:<id>"。
 * 单实例内存存储（MVP）；未来多实例要切 Redis store。
 */
function keyFromContext(c: Context): string {
  const user = c.var.user;
  if (user) return `user:${user.id}`;
  const ip = clientIp(c.req.raw.headers) ?? 'unknown';
  const did = c.req.header('x-device-id') ?? 'no-device';
  return `anon:${ip}:${did}`;
}

/**
 * 固定配额限流（register / login / read）—— quota 不随登录态变化。
 */
export function postLimiter(quota: number, windowMs: number): MiddlewareHandler {
  return rateLimiter({
    windowMs,
    limit: quota,
    standardHeaders: 'draft-6',
    keyGenerator: keyFromContext,
  });
}

/**
 * 可变配额：匿名和登录走不同 quota，但共用同一 windowMs 和同一 keyGenerator。
 * 因 key 按 user/anon 前缀切分，登录和匿名的计数器本来就独立，这里再按 c.var.user
 * 动态返不同上限，实现 spec §6.1 中"匿名严格 / 登录宽松"的分层限制。
 */
export function dualQuotaLimiter(
  windowMs: number,
  anonQuota: number,
  userQuota: number,
): MiddlewareHandler {
  return rateLimiter({
    windowMs,
    limit: (c: Context) => (c.var.user ? userQuota : anonQuota),
    standardHeaders: 'draft-6',
    keyGenerator: keyFromContext,
  });
}

// spec §6.1 配置
export const limitRegister = postLimiter(5, 10 * 60 * 1000); // 5 / 10min (IP)
export const limitLogin = postLimiter(10, 5 * 60 * 1000); // 10 / 5min (IP)
// POST sessions：匿名 5 / 5min，登录 30 / 5min
export const limitSessionUpload = dualQuotaLimiter(5 * 60 * 1000, 5, 30);
// POST bug-reports：匿名 5 / 5min，登录 60 / 5min
export const limitBugReportUpload = dualQuotaLimiter(5 * 60 * 1000, 5, 60);
// POST events：批量埋点上报（每批最多 50 条），匿名 10 / min，登录 60 / min
export const limitEventsUpload = dualQuotaLimiter(60 * 1000, 10, 60);
// GET / DELETE：120 / min（登录态才会到这里，因为路由前置 requireAuth）
export const limitRead = postLimiter(120, 60 * 1000);
