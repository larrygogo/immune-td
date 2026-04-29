/**
 * /api/auth/nickname 路由单测（spec § 4 + § 8.1）
 *
 * 覆盖：
 * 1. 未登录 → 401
 * 2. 首次合法 set → 200 + user.nickname / nickname_set_at 都填上
 * 3-5. 长度 / 字符 / emoji 校验 → 400
 * 6. 撞名（大小写换 case） → 409 nickname_taken
 * 7. cooldown 内 → 429 + retryAfterSec
 * 8. cooldown 过期 → 200，nickname_set_at 刷新
 */

import { describe, expect, test } from 'bun:test';
import { createTestApp } from '../helpers';

const headers = { 'Content-Type': 'application/json' };

async function setupH5User(username = 'h5_user_x') {
  const bundle = createTestApp();
  const r = await bundle.app.request('/api/auth/register', {
    method: 'POST',
    headers,
    body: JSON.stringify({ username, password: 'password123' }),
  });
  expect(r.status).toBe(200);
  const { token, user } = (await r.json()) as { token: string; user: { id: number } };
  return { ...bundle, token, userId: user.id };
}

describe('POST /api/auth/nickname', () => {
  test('未登录 → 401', async () => {
    const { app } = await setupH5User('h5_no_auth');
    const res = await app.request('/api/auth/nickname', {
      method: 'POST',
      headers,
      body: JSON.stringify({ nickname: '玩家001' }),
    });
    expect(res.status).toBe(401);
  });

  test('首次合法 set → 200 + nickname / nickname_set_at 都填上', async () => {
    const { app, token } = await setupH5User('h5_ok1');
    const res = await app.request('/api/auth/nickname', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nickname: '玩家001' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { nickname: string; nickname_set_at: string } };
    expect(body.user.nickname).toBe('玩家001');
    expect(body.user.nickname_set_at).toBeTruthy();
  });

  test.each([
    ['abc', 'too short'],
    ['abcdefghi', 'too long'],
    ['玩家!', 'invalid char'],
    ['玩家 名', 'space'],
    ['玩家😀', 'emoji'],
  ])('校验失败 %p (%p) → 400', async (nickname, _label) => {
    const { app, token } = await setupH5User(`h5_inv_${Math.random().toString(36).slice(2, 8)}`);
    const res = await app.request('/api/auth/nickname', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nickname }),
    });
    expect(res.status).toBe(400);
  });

  test('撞名（大小写换 case）→ 409 nickname_taken', async () => {
    const { app, token: t1 } = await setupH5User('h5_cl1');
    const r1 = await app.request('/api/auth/nickname', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${t1}` },
      body: JSON.stringify({ nickname: 'Larry01' }),
    });
    expect(r1.status).toBe(200);

    // 第二个用户用大小写换 case 提交
    const r2reg = await app.request('/api/auth/register', {
      method: 'POST',
      headers,
      body: JSON.stringify({ username: 'h5_cl2', password: 'password123' }),
    });
    const { token: t2 } = (await r2reg.json()) as { token: string };

    const r2 = await app.request('/api/auth/nickname', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${t2}` },
      body: JSON.stringify({ nickname: 'larry01' }),
    });
    expect(r2.status).toBe(409);
    const body = (await r2.json()) as { error: string };
    expect(body.error).toBe('nickname_taken');
  });

  test('已设置 nickname → cooldown 内（DB 时间倒拨 1 天）→ 429 + retryAfterSec', async () => {
    const { app, db, token, userId } = await setupH5User('h5_cd1');
    // 第一次 set 成功
    const r1 = await app.request('/api/auth/nickname', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nickname: 'NameOne' }),
    });
    expect(r1.status).toBe(200);
    // 直接在 DB 把 nickname_set_at 倒拨到「1 天前」（仍在 7 天 cooldown 内）
    db.query("UPDATE users SET nickname_set_at = datetime('now', '-1 days') WHERE id = ?").run(
      userId,
    );
    const r2 = await app.request('/api/auth/nickname', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nickname: 'NameTwo' }),
    });
    expect(r2.status).toBe(429);
    expect(r2.headers.get('Retry-After')).toBeTruthy();
    const body = (await r2.json()) as { error: string; retryAfterSec: number };
    expect(body.error).toBe('nickname_change_cooldown');
    // 还剩约 6 天 = 6 * 86400
    expect(body.retryAfterSec).toBeGreaterThan(5 * 86400);
    expect(body.retryAfterSec).toBeLessThanOrEqual(6 * 86400 + 5);
  });

  test('已设置 nickname → cooldown 过期（DB 时间倒拨 8 天）→ 200 + nickname_set_at 刷新', async () => {
    const { app, db, token, userId } = await setupH5User('h5_cd2');
    const r1 = await app.request('/api/auth/nickname', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nickname: 'NameOld' }),
    });
    expect(r1.status).toBe(200);
    db.query("UPDATE users SET nickname_set_at = datetime('now', '-8 days') WHERE id = ?").run(
      userId,
    );
    const r2 = await app.request('/api/auth/nickname', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nickname: 'NameNew' }),
    });
    expect(r2.status).toBe(200);
    const body = (await r2.json()) as { user: { nickname: string; nickname_set_at: string } };
    expect(body.user.nickname).toBe('NameNew');
    // nickname_set_at 应被 datetime('now') 刷新到当前（不再是 8 天前）
    const tsStr = `${body.user.nickname_set_at.replace(' ', 'T')}Z`;
    const ts = new Date(tsStr).getTime();
    expect(Date.now() - ts).toBeLessThan(60_000);
  });
});
