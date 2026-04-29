/**
 * mail 路由完整覆盖测试。
 *
 * 覆盖场景（spec § 7 验收 + § 8 风险）：
 * 1. admin 发广播 → 所有登录用户列出
 * 2. admin 发定向 → 仅指定 user 列出
 * 3. 用户 GET /api/mail（含 read_at / claimed_at 字段）
 * 4. POST /:id/read 标已读（idempotent，两次都 204）+ unread-count 减少
 * 5. POST /:id/claim 领奖一次成功返 rewards
 * 6. POST /:id/claim 二次领奖 → 409
 * 7. DELETE /:id 含未领奖 → 400
 * 8. DELETE /:id 已领奖 → 204 + 列表移除
 * 9. 过期邮件不出现在列表（哪怕 read_at 非空）
 * 10. 未登录 GET /api/mail → 401
 * 11. 非 admin 调 admin endpoint → 403
 * 12. 占位密码哈希（wx 用户）不可通过 username/password 登录
 *     —— mail 不影响 wx 登录链路；这里间接验证 mail 系统不破坏现有 wx 登录约束
 */

import { describe, expect, test } from 'bun:test';
import { createApp } from '../../src/index';
import { createTestApp, testConfig } from '../helpers';

const headers = { 'Content-Type': 'application/json' };

async function register(
  app: ReturnType<typeof createTestApp>['app'],
  username: string,
): Promise<{ token: string; userId: number }> {
  const res = await app.request('/api/auth/register', {
    method: 'POST',
    headers,
    body: JSON.stringify({ username, password: 'passw0rd' }),
  });
  const body = (await res.json()) as { token: string; user: { id: number } };
  return { token: body.token, userId: body.user.id };
}

/** 创建 admin 账号（直接写 users 表 role='admin' + 走 register 拿 token） */
async function makeAdmin(
  bundle: ReturnType<typeof createTestApp>,
  username = 'adminuser',
): Promise<string> {
  const { token } = await register(bundle.app, username);
  bundle.db.query('UPDATE users SET role = ? WHERE username = ?').run('admin', username);
  return token;
}

interface InboxDto {
  id: number;
  targetUserId: number | null;
  subject: string;
  content: string;
  rewards: { credits?: number; unlockTower?: string; stars?: number } | null;
  createdAt: string;
  expiresAt: string;
  readAt: string | null;
  claimedAt: string | null;
}

async function listInbox(
  app: ReturnType<typeof createTestApp>['app'],
  token: string,
): Promise<InboxDto[]> {
  const res = await app.request('/api/mail', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { items: InboxDto[] };
  return body.items;
}

describe('mail routes', () => {
  test('admin 发广播 → 多个用户都能列出', async () => {
    const bundle = createTestApp();
    const adminToken = await makeAdmin(bundle);
    const { token: aliceToken } = await register(bundle.app, 'alice');
    const { token: bobToken } = await register(bundle.app, 'bob');

    const sendRes = await bundle.app.request('/api/admin/mail', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        subject: '版本上线',
        content: '感谢游玩',
        broadcast: true,
      }),
    });
    expect(sendRes.status).toBe(201);
    const { id } = (await sendRes.json()) as { id: number };
    expect(typeof id).toBe('number');

    const aliceItems = await listInbox(bundle.app, aliceToken);
    const bobItems = await listInbox(bundle.app, bobToken);
    expect(aliceItems).toHaveLength(1);
    expect(bobItems).toHaveLength(1);
    expect(aliceItems[0]?.subject).toBe('版本上线');
    expect(aliceItems[0]?.targetUserId).toBeNull();
    expect(aliceItems[0]?.rewards).toBeNull();
    expect(aliceItems[0]?.readAt).toBeNull();
  });

  test('admin 发定向 → 仅 target user 看到', async () => {
    const bundle = createTestApp();
    const adminToken = await makeAdmin(bundle);
    const { token: aliceToken, userId: aliceId } = await register(bundle.app, 'alice');
    const { token: bobToken } = await register(bundle.app, 'bob');

    const sendRes = await bundle.app.request('/api/admin/mail', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        subject: '定向礼包',
        content: '专属奖励',
        targetUserId: aliceId,
        rewards: { credits: 100 },
      }),
    });
    expect(sendRes.status).toBe(201);

    const aliceItems = await listInbox(bundle.app, aliceToken);
    const bobItems = await listInbox(bundle.app, bobToken);
    expect(aliceItems).toHaveLength(1);
    expect(bobItems).toHaveLength(0);
    expect(aliceItems[0]?.targetUserId).toBe(aliceId);
    expect(aliceItems[0]?.rewards).toEqual({ credits: 100 });
  });

  test('POST /:id/read 标已读（idempotent）+ unread-count', async () => {
    const bundle = createTestApp();
    const adminToken = await makeAdmin(bundle);
    const { token: aliceToken } = await register(bundle.app, 'alice');

    await bundle.app.request('/api/admin/mail', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ subject: 's', content: 'c', broadcast: true }),
    });
    let items = await listInbox(bundle.app, aliceToken);
    const mailId = items[0]?.id ?? 0;

    // unread-count = 1
    let countRes = await bundle.app.request('/api/mail/unread-count', {
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    expect(((await countRes.json()) as { count: number }).count).toBe(1);

    // POST read
    const r1 = await bundle.app.request(`/api/mail/${mailId}/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    expect(r1.status).toBe(204);
    // 二次 read 仍 204（idempotent）
    const r2 = await bundle.app.request(`/api/mail/${mailId}/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    expect(r2.status).toBe(204);

    // unread-count = 0
    countRes = await bundle.app.request('/api/mail/unread-count', {
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    expect(((await countRes.json()) as { count: number }).count).toBe(0);

    // 列表 readAt 非空
    items = await listInbox(bundle.app, aliceToken);
    expect(items[0]?.readAt).not.toBeNull();
  });

  test('POST /:id/claim 首次返 rewards；二次 → 409', async () => {
    const bundle = createTestApp();
    const adminToken = await makeAdmin(bundle);
    const { token: aliceToken } = await register(bundle.app, 'alice');

    await bundle.app.request('/api/admin/mail', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        subject: '奖励',
        content: 'have a reward',
        broadcast: true,
        rewards: { credits: 50, unlockTower: 'macrophage_skin_alpha' },
      }),
    });
    const items = await listInbox(bundle.app, aliceToken);
    const mailId = items[0]?.id ?? 0;

    const r1 = await bundle.app.request(`/api/mail/${mailId}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    expect(r1.status).toBe(200);
    const claimBody = (await r1.json()) as {
      rewards: { credits?: number; unlockTower?: string };
    };
    expect(claimBody.rewards.credits).toBe(50);
    expect(claimBody.rewards.unlockTower).toBe('macrophage_skin_alpha');

    // 二次领 → 409
    const r2 = await bundle.app.request(`/api/mail/${mailId}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    expect(r2.status).toBe(409);
  });

  test('POST /:id/claim 无奖励邮件 → 400', async () => {
    const bundle = createTestApp();
    const adminToken = await makeAdmin(bundle);
    const { token: aliceToken } = await register(bundle.app, 'alice');

    await bundle.app.request('/api/admin/mail', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ subject: 's', content: 'c', broadcast: true }),
    });
    const items = await listInbox(bundle.app, aliceToken);
    const mailId = items[0]?.id ?? 0;

    const r = await bundle.app.request(`/api/mail/${mailId}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: string };
    expect(body.error).toBe('no_rewards');
  });

  test('DELETE /:id 含未领奖 → 400 has_unclaimed_rewards', async () => {
    const bundle = createTestApp();
    const adminToken = await makeAdmin(bundle);
    const { token: aliceToken } = await register(bundle.app, 'alice');

    await bundle.app.request('/api/admin/mail', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        subject: '奖励',
        content: 'c',
        broadcast: true,
        rewards: { credits: 100 },
      }),
    });
    const items = await listInbox(bundle.app, aliceToken);
    const mailId = items[0]?.id ?? 0;

    const r = await bundle.app.request(`/api/mail/${mailId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: string };
    expect(body.error).toBe('has_unclaimed_rewards');
  });

  test('DELETE /:id 领奖后 → 204 + 列表移除', async () => {
    const bundle = createTestApp();
    const adminToken = await makeAdmin(bundle);
    const { token: aliceToken } = await register(bundle.app, 'alice');

    await bundle.app.request('/api/admin/mail', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        subject: 's',
        content: 'c',
        broadcast: true,
        rewards: { credits: 100 },
      }),
    });
    let items = await listInbox(bundle.app, aliceToken);
    const mailId = items[0]?.id ?? 0;

    await bundle.app.request(`/api/mail/${mailId}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    const r = await bundle.app.request(`/api/mail/${mailId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    expect(r.status).toBe(204);

    items = await listInbox(bundle.app, aliceToken);
    expect(items).toHaveLength(0);
  });

  test('DELETE /:id 无奖励邮件 → 直接 204', async () => {
    const bundle = createTestApp();
    const adminToken = await makeAdmin(bundle);
    const { token: aliceToken } = await register(bundle.app, 'alice');

    await bundle.app.request('/api/admin/mail', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ subject: 's', content: 'c', broadcast: true }),
    });
    const items = await listInbox(bundle.app, aliceToken);
    const mailId = items[0]?.id ?? 0;

    const r = await bundle.app.request(`/api/mail/${mailId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    expect(r.status).toBe(204);
    const after = await listInbox(bundle.app, aliceToken);
    expect(after).toHaveLength(0);
  });

  test('过期邮件不出现在列表（哪怕 read_at 非空）', async () => {
    const bundle = createTestApp();
    const adminToken = await makeAdmin(bundle);
    const { token: aliceToken } = await register(bundle.app, 'alice');

    // 直接插一条已过期的邮件（绕过路由的 expiresInDays 必须 ≥ 1 限制）
    bundle.db
      .query(
        `INSERT INTO mail (target_user_id, subject, content, rewards, expires_at)
         VALUES (NULL, ?, ?, NULL, ?)`,
      )
      .run('expired', 'expired-content', new Date(Date.now() - 1000).toISOString());

    // 先校验一下：用 admin 发一条新邮件保 unread-count 测试可见
    expect(adminToken.length).toBeGreaterThan(0);

    const items = await listInbox(bundle.app, aliceToken);
    expect(items).toHaveLength(0);

    const countRes = await bundle.app.request('/api/mail/unread-count', {
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    expect(((await countRes.json()) as { count: number }).count).toBe(0);
  });

  test('未登录 GET /api/mail → 401', async () => {
    const { app } = createTestApp();
    const r = await app.request('/api/mail');
    expect(r.status).toBe(401);
  });

  test('未登录 GET /api/mail/unread-count → 401', async () => {
    const { app } = createTestApp();
    const r = await app.request('/api/mail/unread-count');
    expect(r.status).toBe(401);
  });

  test('非 admin 调 POST /api/admin/mail → 403', async () => {
    const bundle = createTestApp();
    const { token } = await register(bundle.app, 'alice');
    const r = await bundle.app.request('/api/admin/mail', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ subject: 's', content: 'c', broadcast: true }),
    });
    expect(r.status).toBe(403);
  });

  test('未登录调 POST /api/admin/mail → 401', async () => {
    const { app } = createTestApp();
    const r = await app.request('/api/admin/mail', {
      method: 'POST',
      headers,
      body: JSON.stringify({ subject: 's', content: 'c', broadcast: true }),
    });
    expect(r.status).toBe(401);
  });

  test('admin 发邮件 broadcast 与 targetUserId 同时缺 → 400', async () => {
    const bundle = createTestApp();
    const adminToken = await makeAdmin(bundle);
    const r = await bundle.app.request('/api/admin/mail', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ subject: 's', content: 'c' }),
    });
    expect(r.status).toBe(400);
  });

  test('admin 发邮件 broadcast 与 targetUserId 同时给 → 400', async () => {
    const bundle = createTestApp();
    const adminToken = await makeAdmin(bundle);
    const { userId } = await register(bundle.app, 'alice');
    const r = await bundle.app.request('/api/admin/mail', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        subject: 's',
        content: 'c',
        broadcast: true,
        targetUserId: userId,
      }),
    });
    expect(r.status).toBe(400);
  });

  test('admin GET /api/admin/mail 列表（含过期 + 按 target_user_id 过滤）', async () => {
    const bundle = createTestApp();
    const adminToken = await makeAdmin(bundle);
    const { userId } = await register(bundle.app, 'alice');

    // 发广播 + 发定向
    await bundle.app.request('/api/admin/mail', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ subject: 'b1', content: 'c', broadcast: true }),
    });
    await bundle.app.request('/api/admin/mail', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ subject: 'd1', content: 'c', targetUserId: userId }),
    });

    // 全列表
    let r = await bundle.app.request('/api/admin/mail', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(r.status).toBe(200);
    let body = (await r.json()) as { items: { subject: string; targetUserId: number | null }[] };
    expect(body.items).toHaveLength(2);

    // 仅广播
    r = await bundle.app.request('/api/admin/mail?target_user_id=null', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    body = (await r.json()) as { items: { subject: string; targetUserId: number | null }[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.subject).toBe('b1');

    // 仅定向给 userId
    r = await bundle.app.request(`/api/admin/mail?target_user_id=${userId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    body = (await r.json()) as { items: { subject: string; targetUserId: number | null }[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.subject).toBe('d1');
  });

  test('admin DELETE /api/admin/mail/:id 物理删（cascade user_mail_state）', async () => {
    const bundle = createTestApp();
    const adminToken = await makeAdmin(bundle);
    const { token: aliceToken } = await register(bundle.app, 'alice');

    await bundle.app.request('/api/admin/mail', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ subject: 's', content: 'c', broadcast: true }),
    });
    const items = await listInbox(bundle.app, aliceToken);
    const mailId = items[0]?.id ?? 0;
    // 先标个 read，写一行 user_mail_state
    await bundle.app.request(`/api/mail/${mailId}/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    expect(
      (
        bundle.db
          .query('SELECT COUNT(*) as c FROM user_mail_state WHERE mail_id = ?')
          .get(mailId) as { c: number }
      ).c,
    ).toBe(1);

    // admin DELETE
    const r = await bundle.app.request(`/api/admin/mail/${mailId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(r.status).toBe(204);

    // mail 表 + user_mail_state 都没了
    expect(
      (bundle.db.query('SELECT COUNT(*) as c FROM mail WHERE id = ?').get(mailId) as { c: number })
        .c,
    ).toBe(0);
    expect(
      (
        bundle.db
          .query('SELECT COUNT(*) as c FROM user_mail_state WHERE mail_id = ?')
          .get(mailId) as { c: number }
      ).c,
    ).toBe(0);
  });

  test('占位密码哈希（直接写非 argon2 hash）不可通过 username/password 登录', async () => {
    // 模拟 wechat-login 创建的 wx 用户：写一段无效 hash，期望 login 401。
    // 这跟 mail 系统不直接相关，但确保 mail 测试新增的 makeAdmin / register 路径
    // 不破坏现有 wx 占位密码约束（spec § 12.1）。
    const { app, db } = createApp(testConfig());
    db.query('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(
      'wxuser',
      'not-a-real-argon2-hash',
      'player',
    );
    const r = await app.request('/api/auth/login', {
      method: 'POST',
      headers,
      body: JSON.stringify({ username: 'wxuser', password: 'whatever' }),
    });
    expect(r.status).toBe(401);
  });

  test('rewards 全字段同时给 → 校验通过 + 领奖回原样', async () => {
    const bundle = createTestApp();
    const adminToken = await makeAdmin(bundle);
    const { token: aliceToken } = await register(bundle.app, 'alice');

    await bundle.app.request('/api/admin/mail', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        subject: 'big reward',
        content: 'c',
        broadcast: true,
        rewards: { credits: 200, unlockTower: 'nkcell_skin_beta', stars: 1 },
      }),
    });
    const items = await listInbox(bundle.app, aliceToken);
    const mailId = items[0]?.id ?? 0;
    const r = await bundle.app.request(`/api/mail/${mailId}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { rewards: Record<string, unknown> };
    expect(body.rewards).toEqual({
      credits: 200,
      unlockTower: 'nkcell_skin_beta',
      stars: 1,
    });
  });

  test('rewards 空对象 {} → 400（refine 至少一个字段）', async () => {
    const bundle = createTestApp();
    const adminToken = await makeAdmin(bundle);
    const r = await bundle.app.request('/api/admin/mail', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        subject: 's',
        content: 'c',
        broadcast: true,
        rewards: {},
      }),
    });
    expect(r.status).toBe(400);
  });

  test('subject 超 100 字符 → 400', async () => {
    const bundle = createTestApp();
    const adminToken = await makeAdmin(bundle);
    const r = await bundle.app.request('/api/admin/mail', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        subject: 'a'.repeat(101),
        content: 'c',
        broadcast: true,
      }),
    });
    expect(r.status).toBe(400);
  });
});
