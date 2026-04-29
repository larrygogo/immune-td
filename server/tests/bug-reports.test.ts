import { describe, expect, test } from 'bun:test';
import { createTestApp } from './helpers';

const UUID = '12345678-1234-4567-8901-123456789abc';

async function register(
  app: ReturnType<typeof createTestApp>['app'],
  username: string,
): Promise<string> {
  const res = await app.request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'passw0rd' }),
  });
  const { token } = (await res.json()) as { token: string };
  return token;
}

describe('bug-reports', () => {
  test('匿名 POST 成功 → 201 + id (number)', async () => {
    const { app } = createTestApp();
    const res = await app.request('/api/bug-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': UUID },
      body: JSON.stringify({
        ts: new Date().toISOString(),
        levelId: 1,
        seed: 42,
        phase: 'build',
        foo: 'bar',
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: number };
    expect(typeof body.id).toBe('number');
  });

  test('缺 X-Device-Id → 400', async () => {
    const { app } = createTestApp();
    const res = await app.request('/api/bug-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ts: new Date().toISOString() }),
    });
    expect(res.status).toBe(400);
  });

  test('登录 → 只能看自己', async () => {
    const { app } = createTestApp();
    const tokenA = await register(app, 'alice');
    const tokenB = await register(app, 'bob');
    await app.request('/api/bug-reports', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': UUID,
        Authorization: `Bearer ${tokenB}`,
      },
      body: JSON.stringify({ phase: 'wave' }),
    });
    const resA = await app.request('/api/bug-reports', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const bodyA = (await resA.json()) as { items: unknown[] };
    expect(bodyA.items).toHaveLength(0);
    const resB = await app.request('/api/bug-reports', {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const bodyB = (await resB.json()) as { items: unknown[] };
    expect(bodyB.items).toHaveLength(1);
  });

  test('非数字 id → 400', async () => {
    const { app } = createTestApp();
    const tokenA = await register(app, 'alice');
    const res = await app.request('/api/bug-reports/not-a-number', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(400);
  });
});
