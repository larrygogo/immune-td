import { describe, expect, test } from 'bun:test';
import { createTestApp } from './helpers';

const UUID = '12345678-1234-4567-8901-123456789abc';

async function register(
  app: ReturnType<typeof createTestApp>['app'],
  username: string,
  password = 'passw0rd',
): Promise<string> {
  const res = await app.request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`register failed ${res.status}`);
  const body = (await res.json()) as { token: string };
  return body.token;
}

function sessionPayload(
  sessionId: string,
  levelId = 1,
  outcome: 'won' | 'lost' | 'aborted' = 'won',
) {
  return {
    version: 1,
    sessionId,
    levelId,
    seed: 42,
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    endTick: 1000,
    actions: [
      { tick: 60, type: 'placeTower', args: { col: 1, row: 1, type: 'macrophage' }, ok: true },
      { tick: 120, type: 'startWave', args: {}, ok: true },
    ],
    summary: {
      outcome,
      finalHp: 10,
      finalAtp: 100,
      waveReached: 5,
      stars: 3,
    },
  };
}

describe('sessions', () => {
  test('匿名 POST 成功，anon_ip + device_id 写入', async () => {
    const { app, db } = createTestApp();
    const res = await app.request('/api/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': UUID,
        'X-Forwarded-For': '1.2.3.4, 5.6.7.8',
      },
      body: JSON.stringify(sessionPayload('anon-session-1')),
    });
    expect(res.status).toBe(201);
    const row = db
      .query('SELECT user_id, device_id, anon_ip FROM sessions WHERE id = ?')
      .get('anon-session-1') as {
      user_id: number | null;
      device_id: string | null;
      anon_ip: string | null;
    };
    expect(row.user_id).toBeNull();
    expect(row.device_id).toBe(UUID);
    expect(row.anon_ip).toBe('1.2.3.4');
  });

  test('缺 X-Device-Id → 400', async () => {
    const { app } = createTestApp();
    const res = await app.request('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionPayload('no-device')),
    });
    expect(res.status).toBe(400);
  });

  test('非 UUID 格式 device_id → 400', async () => {
    const { app } = createTestApp();
    const res = await app.request('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': 'not-a-uuid' },
      body: JSON.stringify(sessionPayload('bad-device')),
    });
    expect(res.status).toBe(400);
  });

  test('登录 POST → user_id 写入，anon_ip 为空', async () => {
    const { app, db } = createTestApp();
    const token = await register(app, 'alice');
    const res = await app.request('/api/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': UUID,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(sessionPayload('alice-session-1')),
    });
    expect(res.status).toBe(201);
    const row = db
      .query('SELECT user_id, anon_ip FROM sessions WHERE id = ?')
      .get('alice-session-1') as {
      user_id: number | null;
      anon_ip: string | null;
    };
    expect(row.user_id).not.toBeNull();
    expect(row.anon_ip).toBeNull();
  });

  test('player A 只看得到自己的 list', async () => {
    const { app } = createTestApp();
    const tokenA = await register(app, 'alice');
    const tokenB = await register(app, 'bob');
    // A 上传 2 条，B 上传 1 条
    for (const id of ['a1', 'a2']) {
      await app.request('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Id': UUID,
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify(sessionPayload(id)),
      });
    }
    await app.request('/api/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': UUID,
        Authorization: `Bearer ${tokenB}`,
      },
      body: JSON.stringify(sessionPayload('b1')),
    });
    const resA = await app.request('/api/sessions', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const bodyA = (await resA.json()) as { items: Array<{ id: string }> };
    expect(bodyA.items.map((i) => i.id).sort()).toEqual(['a1', 'a2']);
  });

  test('player A GET B 的 session → 404（ownership）', async () => {
    const { app } = createTestApp();
    const tokenA = await register(app, 'alice');
    const tokenB = await register(app, 'bob');
    await app.request('/api/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': UUID,
        Authorization: `Bearer ${tokenB}`,
      },
      body: JSON.stringify(sessionPayload('b-only')),
    });
    const res = await app.request('/api/sessions/b-only', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(404);
  });

  test('player A DELETE B 的 session → 404', async () => {
    const { app } = createTestApp();
    const tokenA = await register(app, 'alice');
    const tokenB = await register(app, 'bob');
    await app.request('/api/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': UUID,
        Authorization: `Bearer ${tokenB}`,
      },
      body: JSON.stringify(sessionPayload('b-keep')),
    });
    const res = await app.request('/api/sessions/b-keep', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(404);
  });

  test('admin 可 GET 任意用户 session', async () => {
    const { app, db } = createTestApp();
    const tokenPlayer = await register(app, 'bob');
    await app.request('/api/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': UUID,
        Authorization: `Bearer ${tokenPlayer}`,
      },
      body: JSON.stringify(sessionPayload('bob-s1')),
    });
    // 手动提升 admin 用户（绕过 seed 逻辑，测试用）
    const adminToken = await register(app, 'admin');
    db.query("UPDATE users SET role = 'admin' WHERE username = 'admin'").run();
    const res = await app.request('/api/sessions/bob-s1', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
  });

  test('非法 payload → 400 validation', async () => {
    const { app } = createTestApp();
    const res = await app.request('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': UUID },
      body: JSON.stringify({ not: 'a valid session' }),
    });
    expect(res.status).toBe(400);
  });

  test('重复 sessionId 第二次上传 → 409', async () => {
    const { app } = createTestApp();
    const p = sessionPayload('dup-1');
    const headers = { 'Content-Type': 'application/json', 'X-Device-Id': UUID };
    const r1 = await app.request('/api/sessions', {
      method: 'POST',
      headers,
      body: JSON.stringify(p),
    });
    expect(r1.status).toBe(201);
    const r2 = await app.request('/api/sessions', {
      method: 'POST',
      headers,
      body: JSON.stringify(p),
    });
    expect(r2.status).toBe(409);
  });

  test('未登录 GET list → 401', async () => {
    const { app } = createTestApp();
    const res = await app.request('/api/sessions');
    expect(res.status).toBe(401);
  });
});
