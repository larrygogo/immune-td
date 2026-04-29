import type { MiddlewareHandler } from 'hono';
import { AppError } from '../errors';

// UUID v4 严格：8-4-4-4-12 hex；同时接受 fallback-xxx 形式（客户端 secure context 不可用时降级）
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FALLBACK_RE = /^fallback-[a-z0-9-]{10,128}$/i;

declare module 'hono' {
  interface ContextVariableMap {
    deviceId?: string;
  }
}

/** 从 header 提 deviceId 注入 c.var；缺失/非法 → 400 */
export const requireDeviceId: MiddlewareHandler = async (c, next) => {
  const id = c.req.header('x-device-id');
  if (!id) throw new AppError(400, 'missing_device_id', 'X-Device-Id header required');
  if (!UUID_RE.test(id) && !FALLBACK_RE.test(id)) {
    throw new AppError(400, 'invalid_device_id', 'X-Device-Id must be UUID v4 or fallback-*');
  }
  c.set('deviceId', id);
  await next();
};

/** 从反代头提客户端 IP；回落到 remote addr（Hono 4 的 c.req.raw.headers 不含 remote，只能靠反代） */
export function clientIp(headers: Headers): string | null {
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip') ?? null;
}
