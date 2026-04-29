import { describe, expect, test } from 'bun:test';
import { getProgress, upsertProgress } from '../src/models/user-progress';
import { createTestApp } from './helpers';

function createUser(db: ReturnType<typeof createTestApp>['db'], username: string): number {
  db.query(`INSERT INTO users (username, password_hash, role) VALUES (?, 'x', 'player')`).run(
    username,
  );
  return (db.query('SELECT id FROM users WHERE username = ?').get(username) as { id: number }).id;
}

const SAMPLE_PAYLOAD = JSON.stringify({
  unlockedLevels: [0, 1, 2],
  unlockedTowers: ['macrophage'],
  stars: { 1: 3 },
  loadout: [],
  seenMechanics: [],
  researchPoints: 0,
  unlockedResearch: [],
  tutorialStep: -1,
});

describe('user-progress model', () => {
  test('getProgress 空返 null', () => {
    const { db } = createTestApp();
    const userId = createUser(db, 'alice');
    expect(getProgress(db, userId)).toBeNull();
  });

  test('upsertProgress 插入后 getProgress 回读一致', () => {
    const { db } = createTestApp();
    const userId = createUser(db, 'bob');
    const updatedAt = upsertProgress(db, userId, SAMPLE_PAYLOAD, 1);
    expect(typeof updatedAt).toBe('string');
    const row = getProgress(db, userId);
    expect(row).not.toBeNull();
    expect(row?.payload).toBe(SAMPLE_PAYLOAD);
    expect(row?.payload_version).toBe(1);
    expect(row?.user_id).toBe(userId);
    expect(row?.updated_at).toBe(updatedAt);
  });

  test('第二次 upsert 覆盖 payload，保留 created_at', async () => {
    const { db } = createTestApp();
    const userId = createUser(db, 'carol');
    upsertProgress(db, userId, SAMPLE_PAYLOAD, 1);
    const first = getProgress(db, userId);
    expect(first).not.toBeNull();
    // 等一秒保证 datetime('now') 推进（SQLite 秒级精度）
    await new Promise((r) => setTimeout(r, 1100));
    const newPayload = JSON.stringify({ ...JSON.parse(SAMPLE_PAYLOAD), tutorialStep: 5 });
    upsertProgress(db, userId, newPayload, 2);
    const second = getProgress(db, userId);
    expect(second?.payload).toBe(newPayload);
    expect(second?.payload_version).toBe(2);
    expect(second?.created_at).toBe(first?.created_at); // created_at 不变
    expect(second?.updated_at).not.toBe(first?.updated_at); // updated_at 推进
  });

  test('删除 user 级联删除 progress', () => {
    const { db } = createTestApp();
    const userId = createUser(db, 'dave');
    upsertProgress(db, userId, SAMPLE_PAYLOAD, 1);
    expect(getProgress(db, userId)).not.toBeNull();
    db.query('DELETE FROM users WHERE id = ?').run(userId);
    expect(getProgress(db, userId)).toBeNull();
  });

  test('两个用户互不影响', () => {
    const { db } = createTestApp();
    const a = createUser(db, 'eve');
    const b = createUser(db, 'frank');
    const payloadA = JSON.stringify({ ...JSON.parse(SAMPLE_PAYLOAD), researchPoints: 100 });
    const payloadB = JSON.stringify({ ...JSON.parse(SAMPLE_PAYLOAD), researchPoints: 200 });
    upsertProgress(db, a, payloadA, 1);
    upsertProgress(db, b, payloadB, 1);
    expect(getProgress(db, a)?.payload).toBe(payloadA);
    expect(getProgress(db, b)?.payload).toBe(payloadB);
  });
});
