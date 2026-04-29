/**
 * announcement 路由测试。
 *
 * 覆盖场景（spec § 7 验收 + § 8 风险）：
 * 1. admin 发公告 → 用户（含匿名）GET /api/announcement 列出
 * 2. priority desc + published_at desc 排序
 * 3. 过期公告不出现在用户列表
 * 4. 匿名 GET /api/announcement 也能拿到（不需 auth）
 * 5. 未登录 / 非 admin 调 admin endpoint → 401 / 403
 * 6. admin GET /api/admin/announcement 含过期
 * 7. admin DELETE /:id 物理删
 * 8. Zod 校验：title 超长 400 / content 超长 400
 */

import { describe, expect, test } from 'bun:test';
import { createTestApp } from '../helpers';

const headers = { 'Content-Type': 'application/json' };

async function register(
  app: ReturnType<typeof createTestApp>['app'],
  username: string,
): Promise<string> {
  const res = await app.request('/api/auth/register', {
    method: 'POST',
    headers,
    body: JSON.stringify({ username, password: 'passw0rd' }),
  });
  const body = (await res.json()) as { token: string };
  return body.token;
}

async function makeAdmin(
  bundle: ReturnType<typeof createTestApp>,
  username = 'adminuser',
): Promise<string> {
  const token = await register(bundle.app, username);
  bundle.db.query('UPDATE users SET role = ? WHERE username = ?').run('admin', username);
  return token;
}

interface AnnouncementDto {
  id: number;
  title: string;
  content: string;
  priority: number;
  publishedAt: string;
  expiresAt: string;
}

describe('announcement routes', () => {
  test('admin 发公告 → 匿名 GET /api/announcement 列出（不需 auth）', async () => {
    const bundle = createTestApp();
    const adminToken = await makeAdmin(bundle);

    const sendRes = await bundle.app.request('/api/admin/announcement', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        title: '维护通知',
        content: '5/1 凌晨 3-5 点',
      }),
    });
    expect(sendRes.status).toBe(201);

    // 匿名拉
    const r = await bundle.app.request('/api/announcement');
    expect(r.status).toBe(200);
    const body = (await r.json()) as { items: AnnouncementDto[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.title).toBe('维护通知');
    expect(body.items[0]?.priority).toBe(0);
  });

  test('priority desc + published_at desc 排序', async () => {
    const bundle = createTestApp();
    const adminToken = await makeAdmin(bundle);

    // 发 3 条不同 priority 的（priority 5, 0, 10）
    for (const [title, priority] of [
      ['low', 0],
      ['high', 10],
      ['mid', 5],
    ] as const) {
      const r = await bundle.app.request('/api/admin/announcement', {
        method: 'POST',
        headers: { ...headers, Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ title, content: 'c', priority }),
      });
      expect(r.status).toBe(201);
    }

    const r = await bundle.app.request('/api/announcement');
    const body = (await r.json()) as { items: AnnouncementDto[] };
    expect(body.items.map((x) => x.title)).toEqual(['high', 'mid', 'low']);
  });

  test('过期公告不出现在用户列表（但 admin 列表可见）', async () => {
    const bundle = createTestApp();
    const adminToken = await makeAdmin(bundle);

    // 直接 SQL 插过期公告
    bundle.db
      .query(
        `INSERT INTO announcement (title, content, priority, expires_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run('expired', 'old', 0, new Date(Date.now() - 1000).toISOString());

    // 未过期一条
    await bundle.app.request('/api/admin/announcement', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ title: 'active', content: 'c' }),
    });

    // 用户列表只有 active
    const userRes = await bundle.app.request('/api/announcement');
    const userBody = (await userRes.json()) as { items: AnnouncementDto[] };
    expect(userBody.items).toHaveLength(1);
    expect(userBody.items[0]?.title).toBe('active');

    // admin 列表两条都有
    const adminRes = await bundle.app.request('/api/admin/announcement', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminBody = (await adminRes.json()) as { items: AnnouncementDto[] };
    expect(adminBody.items).toHaveLength(2);
  });

  test('未登录调 POST /api/admin/announcement → 401', async () => {
    const { app } = createTestApp();
    const r = await app.request('/api/admin/announcement', {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: 't', content: 'c' }),
    });
    expect(r.status).toBe(401);
  });

  test('非 admin 调 POST /api/admin/announcement → 403', async () => {
    const bundle = createTestApp();
    const token = await register(bundle.app, 'alice');
    const r = await bundle.app.request('/api/admin/announcement', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 't', content: 'c' }),
    });
    expect(r.status).toBe(403);
  });

  test('admin DELETE /:id → 204 + 列表移除', async () => {
    const bundle = createTestApp();
    const adminToken = await makeAdmin(bundle);
    const sendRes = await bundle.app.request('/api/admin/announcement', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ title: 't', content: 'c' }),
    });
    const { id } = (await sendRes.json()) as { id: number };

    const delRes = await bundle.app.request(`/api/admin/announcement/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(delRes.status).toBe(204);

    const userRes = await bundle.app.request('/api/announcement');
    const userBody = (await userRes.json()) as { items: AnnouncementDto[] };
    expect(userBody.items).toHaveLength(0);
  });

  test('admin DELETE 不存在 id → 404', async () => {
    const bundle = createTestApp();
    const adminToken = await makeAdmin(bundle);
    const r = await bundle.app.request('/api/admin/announcement/9999', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(r.status).toBe(404);
  });

  test('admin DELETE 非数字 id → 400', async () => {
    const bundle = createTestApp();
    const adminToken = await makeAdmin(bundle);
    const r = await bundle.app.request('/api/admin/announcement/notanumber', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(r.status).toBe(400);
  });

  test('title 超 100 字符 → 400', async () => {
    const bundle = createTestApp();
    const adminToken = await makeAdmin(bundle);
    const r = await bundle.app.request('/api/admin/announcement', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ title: 'a'.repeat(101), content: 'c' }),
    });
    expect(r.status).toBe(400);
  });

  test('content 超 4000 字符 → 400', async () => {
    const bundle = createTestApp();
    const adminToken = await makeAdmin(bundle);
    const r = await bundle.app.request('/api/admin/announcement', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ title: 't', content: 'a'.repeat(4001) }),
    });
    expect(r.status).toBe(400);
  });

  test('expiresInDays 自定义生效（未到期）', async () => {
    const bundle = createTestApp();
    const adminToken = await makeAdmin(bundle);
    await bundle.app.request('/api/admin/announcement', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ title: 'short-lived', content: 'c', expiresInDays: 1 }),
    });
    const r = await bundle.app.request('/api/announcement');
    const body = (await r.json()) as { items: AnnouncementDto[] };
    expect(body.items).toHaveLength(1);
    // expires_at 应该在 1 天前后
    const expiresAt = new Date(body.items[0]?.expiresAt ?? '');
    const expected = Date.now() + 86_400_000;
    expect(Math.abs(expiresAt.getTime() - expected)).toBeLessThan(60_000);
  });
});
