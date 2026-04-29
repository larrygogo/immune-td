/**
 * wechat-login 路由单测：mock fetch 注入到 jscode2session，不调真微信 API。
 *
 * 覆盖场景（spec § 12.1 强登录无匿名）：
 * 1. 新用户首次登录 → 创建 wx user + 占位 password_hash + 返回 token
 * 2. 已存在用户（按 openid 命中）→ 不重复创建
 * 3. 已存在用户（按 unionid 命中）→ 即使 openid 不同也不重复（unionid 优先）
 * 4. errcode 40029 → 401 invalid_code
 * 5. errcode 45011 → 429 rate_limited
 * 6. errcode 40226 → 403 high_risk_user
 * 7. 缺 AppID/AppSecret → 500 wechat_not_configured
 * 8. 占位 password_hash 不允许通过 username/password 登录
 */

import { describe, expect, test } from 'bun:test';
import type { FetchLike } from '../../src/auth/wechat';
import { findByWechatOpenid } from '../../src/models/user';
import { createTestApp } from '../helpers';

const headers = { 'Content-Type': 'application/json' };

/**
 * 构造 mock fetch：返回固定的 jscode2session 响应。
 * `body` 是要被序列化为 json 的对象（含 openid/unionid/session_key 或 errcode）。
 */
function mockFetch(body: Record<string, unknown>): FetchLike {
  return async () => {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

/** 标准 wx 配置 + 注入 mock fetch */
function appWithMockFetch(body: Record<string, unknown>) {
  return createTestApp(
    { wechatAppId: 'wx_test_appid', wechatAppSecret: 'test-secret' },
    { wechatFetch: mockFetch(body) },
  );
}

describe('wechat-login', () => {
  test('新用户首次登录 → 创建 user + 返回 token', async () => {
    const { app, db } = appWithMockFetch({
      openid: 'oABCDEFG_NEW_USER_001',
      session_key: 'sess-key-1',
    });

    const res = await app.request('/api/auth/wechat-login', {
      method: 'POST',
      headers,
      body: JSON.stringify({ code: 'wx-code-001' }),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      token: string;
      user: { id: number; username: string; role: string };
    };
    expect(body.token.length).toBeGreaterThan(20);
    expect(body.user.role).toBe('player');
    expect(body.user.username.startsWith('wx_')).toBe(true);

    // 数据库里应该有这条 wx 用户
    const row = findByWechatOpenid(db, 'oABCDEFG_NEW_USER_001');
    expect(row).not.toBeNull();
    expect(row?.id).toBe(body.user.id);
    expect(row?.wechat_openid).toBe('oABCDEFG_NEW_USER_001');
    // 占位 password_hash 必须存在（NOT NULL 约束 + 永不命中 username/password 登录）
    expect(row?.password_hash.length).toBeGreaterThan(0);
  });

  test('同 openid 二次登录 → 不重复创建', async () => {
    const { app, db } = appWithMockFetch({
      openid: 'oREPEAT_OPENID_002',
      session_key: 'sess-key-2',
    });

    const r1 = await app.request('/api/auth/wechat-login', {
      method: 'POST',
      headers,
      body: JSON.stringify({ code: 'code-A' }),
    });
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()) as { user: { id: number } };

    const r2 = await app.request('/api/auth/wechat-login', {
      method: 'POST',
      headers,
      body: JSON.stringify({ code: 'code-B' }),
    });
    expect(r2.status).toBe(200);
    const b2 = (await r2.json()) as { user: { id: number } };

    // 复用同一个 user
    expect(b2.user.id).toBe(b1.user.id);
    const count = db.query('SELECT COUNT(*) as c FROM users').get() as { c: number };
    expect(count.c).toBe(1);
  });

  test('unionid 命中优先于 openid（同 unionid 不同 openid 复用 user）', async () => {
    // 用一个可切换的 fetch 闭包：每次调返回 currentResponse
    let currentResponse: Record<string, unknown> = {
      openid: 'oOPENID_A',
      unionid: 'uUNIONID_SHARED',
      session_key: 's1',
    };
    const switchableFetch: FetchLike = async () =>
      new Response(JSON.stringify(currentResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const { app, db } = createTestApp(
      { wechatAppId: 'wx', wechatAppSecret: 'sec' },
      { wechatFetch: switchableFetch },
    );

    // 第一次：openid=A + unionid=U → 创建 user
    const r1 = await app.request('/api/auth/wechat-login', {
      method: 'POST',
      headers,
      body: JSON.stringify({ code: 'code-1' }),
    });
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()) as { user: { id: number } };

    // 切换 fetch 响应：模拟用户从公众号迁移过来，openid 变了但 unionid 不变
    currentResponse = {
      openid: 'oOPENID_B_DIFFERENT',
      unionid: 'uUNIONID_SHARED',
      session_key: 's2',
    };

    const r2 = await app.request('/api/auth/wechat-login', {
      method: 'POST',
      headers,
      body: JSON.stringify({ code: 'code-2' }),
    });
    expect(r2.status).toBe(200);
    const b2 = (await r2.json()) as { user: { id: number } };

    // 同 unionid → 复用同一 user（unionid 优先于 openid 命中）
    expect(b2.user.id).toBe(b1.user.id);
    const count = db.query('SELECT COUNT(*) as c FROM users').get() as { c: number };
    expect(count.c).toBe(1);

    // 不该写入新 openid（user 的 openid 仍是首次创建时的 A）
    const row = findByWechatOpenid(db, 'oOPENID_A');
    expect(row?.id).toBe(b1.user.id);
    expect(findByWechatOpenid(db, 'oOPENID_B_DIFFERENT')).toBeNull();
  });

  test('errcode 40029 (invalid code) → 401', async () => {
    const { app } = appWithMockFetch({ errcode: 40029, errmsg: 'invalid code' });

    const res = await app.request('/api/auth/wechat-login', {
      method: 'POST',
      headers,
      body: JSON.stringify({ code: 'expired-code' }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_code');
  });

  test('errcode 45011 (rate limited) → 429', async () => {
    const { app } = appWithMockFetch({ errcode: 45011, errmsg: 'too many requests' });
    const res = await app.request('/api/auth/wechat-login', {
      method: 'POST',
      headers,
      body: JSON.stringify({ code: 'any-code' }),
    });
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('rate_limited');
  });

  test('errcode 40226 (high-risk user) → 403', async () => {
    const { app } = appWithMockFetch({ errcode: 40226, errmsg: 'high-risk user' });
    const res = await app.request('/api/auth/wechat-login', {
      method: 'POST',
      headers,
      body: JSON.stringify({ code: 'any-code' }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('high_risk_user');
  });

  test('缺 AppID/AppSecret → 500 wechat_not_configured', async () => {
    // 不传 wechatAppId/Secret，沿用默认 null
    const { app } = createTestApp();
    const res = await app.request('/api/auth/wechat-login', {
      method: 'POST',
      headers,
      body: JSON.stringify({ code: 'whatever' }),
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('wechat_not_configured');
  });

  test('非法 body（缺 code）→ 400', async () => {
    const { app } = appWithMockFetch({
      openid: 'oWHATEVER',
      session_key: 'sk',
    });
    const res = await app.request('/api/auth/wechat-login', {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test('占位 password_hash 不允许通过 username/password 登录', async () => {
    const { app, db } = appWithMockFetch({
      openid: 'oPLACEHOLDER_TEST',
      session_key: 'sk',
    });
    // 创建一个 wx 用户
    const r1 = await app.request('/api/auth/wechat-login', {
      method: 'POST',
      headers,
      body: JSON.stringify({ code: 'code-x' }),
    });
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()) as { user: { username: string } };

    // 直接读出 password_hash
    const row = db
      .query('SELECT password_hash FROM users WHERE username = ?')
      .get(b1.user.username) as { password_hash: string } | null;
    expect(row?.password_hash.length).toBeGreaterThan(0);

    // 试图用任意密码登录该 wx 用户：应该 401（占位 hash 永不匹配真实密码）
    // 注意：UsernameSchema 限制 3-32 字符 a-zA-Z0-9_-，wx_xxx_xxx_xxx 长度 ≤ 32 应该过 schema
    const r2 = await app.request('/api/auth/login', {
      method: 'POST',
      headers,
      body: JSON.stringify({ username: b1.user.username, password: 'password123' }),
    });
    expect(r2.status).toBe(401);

    const r3 = await app.request('/api/auth/login', {
      method: 'POST',
      headers,
      body: JSON.stringify({ username: b1.user.username, password: 'anything-else-9' }),
    });
    expect(r3.status).toBe(401);
  });

  test('返回的 user 形态与 /login 同形（id / username / role）', async () => {
    const { app } = appWithMockFetch({
      openid: 'oSHAPE_TEST',
      session_key: 'sk',
    });
    const res = await app.request('/api/auth/wechat-login', {
      method: 'POST',
      headers,
      body: JSON.stringify({ code: 'code-shape' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      token: string;
      user: { id: number; username: string; role: string };
    };
    expect(typeof body.token).toBe('string');
    expect(typeof body.user.id).toBe('number');
    expect(typeof body.user.username).toBe('string');
    expect(['player', 'admin']).toContain(body.user.role);
  });

  test('登录后 token 可用于 /api/me（与 username/password 登录链路打通）', async () => {
    const { app } = appWithMockFetch({
      openid: 'oME_TEST',
      session_key: 'sk',
    });
    const r1 = await app.request('/api/auth/wechat-login', {
      method: 'POST',
      headers,
      body: JSON.stringify({ code: 'code-me' }),
    });
    expect(r1.status).toBe(200);
    const { token } = (await r1.json()) as { token: string };

    const r2 = await app.request('/api/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(r2.status).toBe(200);
    const me = (await r2.json()) as { user: { username: string; role: string } };
    expect(me.user.username.startsWith('wx_')).toBe(true);
    expect(me.user.role).toBe('player');
  });
});
