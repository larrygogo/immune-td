import type { Database } from 'bun:sqlite';
import type { MiddlewareHandler } from 'hono';
import { type AuthUserRow, findUserByToken } from '../auth/token';
import { AppError } from '../errors';

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUserRow | null;
  }
}

/**
 * 提取 Bearer token → 查 user → 注入 c.var.user；
 * 缺失或无效时 user=null（后续 requireAuth 再决定是否 401）
 */
export function authExtract(db: Database): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header('authorization');
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      c.set('user', null);
      await next();
      return;
    }
    const token = header.slice(7).trim();
    if (!token) {
      c.set('user', null);
      await next();
      return;
    }
    c.set('user', findUserByToken(db, token));
    await next();
  };
}

/** 登录强制守卫：c.var.user 为空返 401 */
export const requireAuth: MiddlewareHandler = async (c, next) => {
  if (!c.var.user) throw new AppError(401, 'unauthorized', 'authentication required');
  await next();
};

/**
 * admin 守卫：要求登录且 role='admin'，否则 401 / 403。
 * 用于 /api/admin/* 路由组。其他业务路由（sessions / bug-reports）保持
 * 「登录强制 + inline scopeUserId 切作用域」的旧模式不动。
 */
export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const user = c.var.user;
  if (!user) throw new AppError(401, 'unauthorized', 'authentication required');
  if (user.role !== 'admin') throw new AppError(403, 'forbidden', 'admin role required');
  await next();
};
