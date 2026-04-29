import { describe, expect, test } from 'bun:test';
import { createTestApp } from './helpers';

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

const SAMPLE_PROGRESS = {
  unlockedLevels: [0, 1, 2, 3],
  unlockedTowers: ['macrophage', 'neutrophil'],
  stars: { '1': 3, '2': 2 },
  loadout: ['macrophage'],
  seenMechanics: ['tower-hp'],
  researchPoints: 0,
  unlockedResearch: [],
  tutorialStep: -1,
} as const;

describe('progress route', () => {
  test('GET 无 token → 401', async () => {
    const { app } = createTestApp();
    const res = await app.request('/api/progress');
    expect(res.status).toBe(401);
  });

  test('PUT 无 token → 401', async () => {
    const { app } = createTestApp();
    const res = await app.request('/api/progress', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ progress: SAMPLE_PROGRESS, payloadVersion: 1 }),
    });
    expect(res.status).toBe(401);
  });

  test('登录 GET 空 → { progress: null }', async () => {
    const { app } = createTestApp();
    const token = await register(app, 'alice');
    const res = await app.request('/api/progress', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { progress: unknown };
    expect(body.progress).toBeNull();
  });

  test('PUT + GET 回读一致', async () => {
    const { app } = createTestApp();
    const token = await register(app, 'bob');

    const putRes = await app.request('/api/progress', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ progress: SAMPLE_PROGRESS, payloadVersion: 1 }),
    });
    expect(putRes.status).toBe(200);
    const putBody = (await putRes.json()) as { updatedAt: string };
    expect(typeof putBody.updatedAt).toBe('string');

    const getRes = await app.request('/api/progress', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as {
      progress: typeof SAMPLE_PROGRESS;
      payloadVersion: number;
      updatedAt: string;
    };
    expect(getBody.progress).toEqual(SAMPLE_PROGRESS);
    expect(getBody.payloadVersion).toBe(1);
    expect(getBody.updatedAt).toBe(putBody.updatedAt);
  });

  test('PUT 缺字段 → 400', async () => {
    const { app } = createTestApp();
    const token = await register(app, 'carol');
    const { tutorialStep: _omit, ...badProgress } = SAMPLE_PROGRESS;
    const res = await app.request('/api/progress', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ progress: badProgress, payloadVersion: 1 }),
    });
    expect(res.status).toBe(400);
  });

  test('PUT 星数为 4（越界）→ 400', async () => {
    const { app } = createTestApp();
    const token = await register(app, 'dave');
    const res = await app.request('/api/progress', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        progress: { ...SAMPLE_PROGRESS, stars: { '1': 4 } },
        payloadVersion: 1,
      }),
    });
    expect(res.status).toBe(400);
  });

  test('PUT 未知塔类型 → 400', async () => {
    const { app } = createTestApp();
    const token = await register(app, 'eve');
    const res = await app.request('/api/progress', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        progress: { ...SAMPLE_PROGRESS, unlockedTowers: ['bogus'] },
        payloadVersion: 1,
      }),
    });
    expect(res.status).toBe(400);
  });

  test('PUT payloadVersion 非正 → 400', async () => {
    const { app } = createTestApp();
    const token = await register(app, 'frank');
    const res = await app.request('/api/progress', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ progress: SAMPLE_PROGRESS, payloadVersion: 0 }),
    });
    expect(res.status).toBe(400);
  });

  test('A PUT，B GET → 拿不到 A 的进度', async () => {
    const { app } = createTestApp();
    const tokenA = await register(app, 'grace');
    const tokenB = await register(app, 'henry');
    await app.request('/api/progress', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ progress: SAMPLE_PROGRESS, payloadVersion: 1 }),
    });
    const res = await app.request('/api/progress', {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { progress: unknown };
    expect(body.progress).toBeNull();
  });

  test('PUT 两次覆盖 payload + payloadVersion', async () => {
    const { app } = createTestApp();
    const token = await register(app, 'ivy');
    await app.request('/api/progress', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ progress: SAMPLE_PROGRESS, payloadVersion: 1 }),
    });
    const updated = { ...SAMPLE_PROGRESS, tutorialStep: 5, researchPoints: 123 };
    await app.request('/api/progress', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ progress: updated, payloadVersion: 2 }),
    });
    const res = await app.request('/api/progress', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await res.json()) as {
      progress: typeof updated;
      payloadVersion: number;
    };
    expect(body.progress).toEqual(updated);
    expect(body.payloadVersion).toBe(2);
  });
});
