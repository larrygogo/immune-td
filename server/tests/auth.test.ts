import { describe, expect, test } from 'bun:test';
import { createApp } from '../src/index';
import { createTestApp, testConfig } from './helpers';

const headers = { 'Content-Type': 'application/json' };

async function register(
  app: ReturnType<typeof createTestApp>['app'],
  username: string,
  password: string,
) {
  return app.request('/api/auth/register', {
    method: 'POST',
    headers,
    body: JSON.stringify({ username, password }),
  });
}

async function login(
  app: ReturnType<typeof createTestApp>['app'],
  username: string,
  password: string,
) {
  return app.request('/api/auth/login', {
    method: 'POST',
    headers,
    body: JSON.stringify({ username, password }),
  });
}

describe('auth', () => {
  test('register → login → me 链路', async () => {
    const { app } = createTestApp();
    let res = await register(app, 'alice', 'passw0rd');
    expect(res.status).toBe(200);
    const regBody = (await res.json()) as {
      token: string;
      user: { id: number; username: string; role: string };
    };
    expect(regBody.user.username).toBe('alice');
    expect(regBody.user.role).toBe('player');
    expect(regBody.token.length).toBeGreaterThan(20);

    res = await login(app, 'alice', 'passw0rd');
    expect(res.status).toBe(200);
    const loginBody = (await res.json()) as { token: string };

    res = await app.request('/api/me', {
      headers: { Authorization: `Bearer ${loginBody.token}` },
    });
    expect(res.status).toBe(200);
    const me = (await res.json()) as { user: { username: string } };
    expect(me.user.username).toBe('alice');
  });

  test('重复 username（大小写不敏感）→ 409', async () => {
    const { app } = createTestApp();
    await register(app, 'bob', 'passw0rd');
    const res = await register(app, 'BOB', 'passw0rd');
    expect(res.status).toBe(409);
  });

  test('密码错 → 401', async () => {
    const { app } = createTestApp();
    await register(app, 'carol', 'passw0rd');
    const res = await login(app, 'carol', 'wrong-pw');
    expect(res.status).toBe(401);
  });

  test('非法密码格式 → 400', async () => {
    const { app } = createTestApp();
    const res = await register(app, 'dave', 'short');
    expect(res.status).toBe(400);
  });

  test('非法 username 格式 → 400', async () => {
    const { app } = createTestApp();
    const res = await register(app, 'a', 'passw0rd');
    expect(res.status).toBe(400);
  });

  test('过期 token → 401', async () => {
    const { app, db } = createTestApp();
    const r1 = await register(app, 'erin', 'passw0rd');
    const { token } = (await r1.json()) as { token: string };
    // 把这个 token 的 expires_at 改到过去
    db.query('UPDATE auth_tokens SET expires_at = ? WHERE token = ?').run(
      '2000-01-01T00:00:00Z',
      token,
    );
    const res = await app.request('/api/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  // 回归测试：之前用字符串直接比较 expires_at，toISOString() 的 'T' (0x54) 按 ASCII
  // 排大于 SQLite datetime('now') 的空格 (0x20)，导致刚过期的 token 在同一天内仍被判
  // 为有效（直到日期翻篇）。token.ts 改用 `datetime(expires_at) > datetime('now')` 归一化。
  test('刚过期（1 秒前） token → 401（防 T-vs-空格 ASCII bug 复发）', async () => {
    const { app, db } = createTestApp();
    const r1 = await register(app, 'gina', 'passw0rd');
    const { token } = (await r1.json()) as { token: string };
    // 1 秒前过期：用 toISOString 存（跟 createToken 保持同格式），触发 bug 模式
    const oneSecAgo = new Date(Date.now() - 1000).toISOString();
    db.query('UPDATE auth_tokens SET expires_at = ? WHERE token = ?').run(oneSecAgo, token);
    const res = await app.request('/api/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  test('logout 后 token 失效', async () => {
    const { app } = createTestApp();
    const r1 = await register(app, 'frank', 'passw0rd');
    const { token } = (await r1.json()) as { token: string };

    let res = await app.request('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(204);

    res = await app.request('/api/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  test('未登录 GET /api/me → 401', async () => {
    const { app } = createTestApp();
    const res = await app.request('/api/me');
    expect(res.status).toBe(401);
  });

  test('初始 admin seed：空 users + env 两者有 → 创建 admin（一次）', async () => {
    const { app, db } = createApp(
      testConfig({
        initialAdminUsername: 'larry',
        initialAdminPassword: 'admin-pw-123',
      }),
    );
    // 等异步种子完成（createApp 里 void 异步）
    await new Promise((resolve) => setTimeout(resolve, 200));

    const res = await login(app, 'larry', 'admin-pw-123');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { role: string } };
    expect(body.user.role).toBe('admin');

    // 再次确认 users 仍是 1（seed 幂等）
    const row = db.query('SELECT COUNT(*) as c FROM users').get() as { c: number };
    expect(row.c).toBe(1);
  });
});
