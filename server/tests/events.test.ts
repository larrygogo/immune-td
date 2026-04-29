import { describe, expect, test } from 'bun:test';
import { countEvents, findEvents } from '../src/models/analytics-event';
import type { AnalyticsEventInput } from '../src/shared/analytics-schema';
import { createTestApp } from './helpers';

const UUID = '12345678-1234-4567-8901-123456789abc';

async function register(
  app: ReturnType<typeof createTestApp>['app'],
  username: string,
): Promise<{ token: string; userId: number }> {
  const res = await app.request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'passw0rd' }),
  });
  const data = (await res.json()) as { token: string; user: { id: number } };
  return { token: data.token, userId: data.user.id };
}

function makeEvent(overrides: Partial<AnalyticsEventInput> = {}): AnalyticsEventInput {
  return {
    device_id: UUID,
    user_id: null,
    session_id: 'L2_S99_2026-04-26T13-00-00',
    client_ts: 1_750_000_000_000,
    app_version: '0.4.0',
    platform: 'web',
    event_name: 'session_start',
    props: { is_returning: false },
    ...overrides,
  } as AnalyticsEventInput;
}

describe('POST /api/events · 入库', () => {
  test('匿名 POST 1 条 → 200 accepted=1，DB 真实写入', async () => {
    const { app, db } = createTestApp();
    const res = await app.request('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': UUID },
      body: JSON.stringify({ events: [makeEvent()] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accepted: number };
    expect(body.accepted).toBe(1);
    expect(countEvents(db)).toBe(1);
  });

  test('匿名 POST 100 条上限 → 200 accepted=100', async () => {
    const { app, db } = createTestApp();
    const events = Array.from({ length: 100 }, (_, i) =>
      makeEvent({
        event_name: 'level_start',
        props: {
          level_id: i % 11,
          attempt_n: 1,
          loadout: ['macrophage'],
          seed: i,
          mode: 'normal',
        },
      } as Partial<AnalyticsEventInput>),
    );
    const res = await app.request('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': UUID },
      body: JSON.stringify({ events }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accepted: number };
    expect(body.accepted).toBe(100);
    expect(countEvents(db)).toBe(100);
  });

  test('101 条超批量上限 → 400', async () => {
    const { app } = createTestApp();
    const events = Array.from({ length: 101 }, () => makeEvent());
    const res = await app.request('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': UUID },
      body: JSON.stringify({ events }),
    });
    expect(res.status).toBe(400);
  });

  test('0 条空数组 → 400', async () => {
    const { app } = createTestApp();
    const res = await app.request('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': UUID },
      body: JSON.stringify({ events: [] }),
    });
    expect(res.status).toBe(400);
  });

  test('schema 不合法（event_name 与 props 不匹配） → 400', async () => {
    const { app } = createTestApp();
    const res = await app.request('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': UUID },
      body: JSON.stringify({
        events: [
          makeEvent({
            event_name: 'level_start',
            // 这是 tower_place 的 props，level_start 不接受
            props: {
              tower_type: 'macrophage',
              tower_level: 1,
              level_id: 2,
              wave_idx: 0,
              col: 1,
              row: 1,
              atp_at_place: 70,
            },
          } as Partial<AnalyticsEventInput>),
        ],
      }),
    });
    expect(res.status).toBe(400);
  });

  test('缺 X-Device-Id → 400', async () => {
    const { app } = createTestApp();
    const res = await app.request('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [makeEvent()] }),
    });
    expect(res.status).toBe(400);
  });

  test('已登录玩家 → user_id 写入 DB；匿名 → user_id NULL', async () => {
    const { app, db } = createTestApp();
    const { token, userId } = await register(app, 'alice');

    // 匿名一条
    await app.request('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': UUID },
      body: JSON.stringify({ events: [makeEvent()] }),
    });
    // 登录一条
    await app.request('/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': UUID,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ events: [makeEvent()] }),
    });

    const userRows = findEvents(db, { user_id: userId, limit: 10 });
    expect(userRows).toHaveLength(1);
    expect(userRows[0]?.user_id).toBe(userId);

    const anonRows = findEvents(db, { user_id: null, limit: 10 });
    expect(anonRows).toHaveLength(1);
    expect(anonRows[0]?.user_id).toBeNull();
  });
});

describe('analytics findEvents · index 查询', () => {
  test('按 event_name 过滤 + 按 server_ts 排序', async () => {
    const { app, db } = createTestApp();
    await app.request('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': UUID },
      body: JSON.stringify({
        events: [
          makeEvent({
            event_name: 'level_start',
            props: {
              level_id: 1,
              attempt_n: 1,
              loadout: [],
              seed: 0,
              mode: 'normal',
            },
          } as Partial<AnalyticsEventInput>),
          makeEvent(),
          makeEvent({
            event_name: 'level_complete',
            props: {
              level_id: 1,
              mode: 'normal',
              stars: 3,
              hp_left: 10,
              atp_remaining: 50,
              wave_count: 5,
              duration_ms: 60000,
              towers_at_end: [],
            },
          } as Partial<AnalyticsEventInput>),
        ],
      }),
    });

    const startRows = findEvents(db, { event_name: 'level_start', limit: 10 });
    expect(startRows).toHaveLength(1);
    expect(startRows[0]?.event_name).toBe('level_start');

    const allRows = findEvents(db, { limit: 10 });
    expect(allRows).toHaveLength(3);
  });

  test('按 session_id 过滤（一局完整事件流）', async () => {
    const { app, db } = createTestApp();
    await app.request('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': UUID },
      body: JSON.stringify({
        events: [
          makeEvent({ session_id: 'S1' }),
          makeEvent({ session_id: 'S2' }),
          makeEvent({ session_id: 'S1' }),
        ],
      }),
    });

    const s1 = findEvents(db, { session_id: 'S1', limit: 10 });
    expect(s1).toHaveLength(2);
    const s2 = findEvents(db, { session_id: 'S2', limit: 10 });
    expect(s2).toHaveLength(1);
  });

  test('按 server_ts 时间窗过滤', async () => {
    const { app, db } = createTestApp();
    const before = Date.now();
    await app.request('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': UUID },
      body: JSON.stringify({ events: [makeEvent()] }),
    });
    const after = Date.now() + 1000;

    const inWindow = findEvents(db, { from: before, to: after, limit: 10 });
    expect(inWindow.length).toBe(1);

    const future = findEvents(db, { from: after, limit: 10 });
    expect(future.length).toBe(0);
  });
});
