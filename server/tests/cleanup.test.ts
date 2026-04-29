import { describe, expect, test } from 'bun:test';
import { sweepOnce } from '../src/cleanup';
import { createTestApp } from './helpers';

describe('cleanup.sweepOnce', () => {
  test('删 31 天前的匿名 session；保留登录用户数据 + 新匿名', async () => {
    const { app, db } = createTestApp();
    // 插入 1 条 31 天前的匿名 session（直接 SQL 绕过 HTTP）
    db.query(
      `INSERT INTO sessions (id, user_id, device_id, anon_ip, level_id, seed, outcome, stars, actions_count, wave_reached, end_tick, started_at, payload, created_at)
       VALUES (?, NULL, ?, ?, 1, 42, 'won', 3, 2, 5, 1000, ?, '{}', datetime('now', '-31 days'))`,
    ).run(
      'old-anon',
      '11111111-1111-4111-8111-111111111111',
      '1.2.3.4',
      new Date().toISOString(),
    );
    db.query(
      `INSERT INTO sessions (id, user_id, device_id, anon_ip, level_id, seed, outcome, stars, actions_count, wave_reached, end_tick, started_at, payload, created_at)
       VALUES (?, NULL, ?, ?, 1, 42, 'won', 3, 2, 5, 1000, ?, '{}', datetime('now', '-1 day'))`,
    ).run(
      'new-anon',
      '22222222-2222-4222-8222-222222222222',
      '1.2.3.4',
      new Date().toISOString(),
    );

    // 再插一条登录用户的 31 天前 session（不应被删）
    db.query(
      `INSERT INTO users (username, password_hash, role) VALUES ('old-user', 'x', 'player')`,
    ).run();
    const user = db.query('SELECT id FROM users WHERE username = ?').get('old-user') as {
      id: number;
    };
    db.query(
      `INSERT INTO sessions (id, user_id, device_id, anon_ip, level_id, seed, outcome, stars, actions_count, wave_reached, end_tick, started_at, payload, created_at)
       VALUES (?, ?, ?, NULL, 1, 42, 'won', 3, 2, 5, 1000, ?, '{}', datetime('now', '-40 days'))`,
    ).run(
      'old-user-session',
      user.id,
      '33333333-3333-4333-8333-333333333333',
      new Date().toISOString(),
    );

    sweepOnce(db, 30);

    const remaining = db.query('SELECT id FROM sessions').all() as Array<{ id: string }>;
    const ids = remaining.map((r) => r.id).sort();
    expect(ids).toEqual(['new-anon', 'old-user-session']);
    // 用掉 app 变量避免 TS 警告
    expect(app).toBeDefined();
  });

  test('ISO 格式的 created_at（T 分隔）边界日不被误删（防 ASCII-比较 bug 复发）', async () => {
    const { app, db } = createTestApp();
    // 插入一条未到保留期但 created_at 用 toISOString() 写的匿名 session：
    // 原 bug 形式下 `created_at < cutoff` 的字符串比较里 'T' > 空格会误判成过期 → 删
    // 修复后 datetime() 归一化，应保留
    const nowIso = new Date().toISOString(); // '2026-...T...Z'
    db.query(
      `INSERT INTO sessions (id, user_id, device_id, anon_ip, level_id, seed, outcome, stars, actions_count, wave_reached, end_tick, started_at, payload, created_at)
       VALUES (?, NULL, ?, ?, 1, 42, 'won', 3, 0, 0, 0, ?, '{}', ?)`,
    ).run('iso-boundary', '44444444-4444-4444-8444-444444444444', '1.2.3.4', nowIso, nowIso);
    sweepOnce(db, 30);
    const row = db.query('SELECT id FROM sessions WHERE id = ?').get('iso-boundary');
    expect(row).not.toBeNull();
    expect(app).toBeDefined();
  });

  test('删过期 auth_token', async () => {
    const { app, db } = createTestApp();
    db.query(`INSERT INTO users (username, password_hash) VALUES ('u1', 'x')`).run();
    const u = db.query('SELECT id FROM users WHERE username=?').get('u1') as { id: number };
    // 过期 1 天 + 未过期 5 天各一条
    db.query('INSERT INTO auth_tokens (token, user_id, expires_at) VALUES (?, ?, ?)').run(
      'expired',
      u.id,
      new Date(Date.now() - 86400000).toISOString(),
    );
    db.query('INSERT INTO auth_tokens (token, user_id, expires_at) VALUES (?, ?, ?)').run(
      'valid',
      u.id,
      new Date(Date.now() + 86400000 * 5).toISOString(),
    );
    sweepOnce(db, 30);
    const remaining = db.query('SELECT token FROM auth_tokens').all() as Array<{ token: string }>;
    expect(remaining.map((r) => r.token)).toEqual(['valid']);
    expect(app).toBeDefined();
  });
});
