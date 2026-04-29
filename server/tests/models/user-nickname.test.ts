/**
 * users.nickname 模型层单测（spec § 3.2 + § 8.2）
 */
import { describe, expect, test } from 'bun:test';
import { hashPassword } from '../../src/auth/password';
import { initDb } from '../../src/db';
import { NicknameTakenError, createUser, findByNickname, setNickname } from '../../src/models/user';

async function newUserId(db: ReturnType<typeof initDb>, username: string): Promise<number> {
  const hash = await hashPassword('password123');
  return createUser(db, username, hash, 'player');
}

describe('users.nickname model helpers', () => {
  test('findByNickname COLLATE NOCASE 命中大小写变体', async () => {
    const db = initDb(':memory:');
    const id = await newUserId(db, 'alice_acct');
    setNickname(db, id, '小明');
    expect(findByNickname(db, '小明')?.id).toBe(id);
    // 用拉丁名再测大小写
    setNickname(db, id, 'Larry');
    expect(findByNickname(db, 'larry')?.id).toBe(id);
    expect(findByNickname(db, 'LARRY')?.id).toBe(id);
  });

  test('多个 nickname=NULL 用户共存（partial UNIQUE 索引验证）', async () => {
    const db = initDb(':memory:');
    await newUserId(db, 'a_user');
    await newUserId(db, 'b_user');
    await newUserId(db, 'c_user');
    // 三个 user 的 nickname 都是 NULL，不应该撞 UNIQUE
    const rows = db.query('SELECT id FROM users WHERE nickname IS NULL').all();
    expect(rows.length).toBe(3);
  });

  test('setNickname 撞已存在的 nickname → 抛 NicknameTakenError', async () => {
    const db = initDb(':memory:');
    const id1 = await newUserId(db, 'u1');
    const id2 = await newUserId(db, 'u2');
    setNickname(db, id1, '玩家_001');
    expect(() => setNickname(db, id2, '玩家_001')).toThrow(NicknameTakenError);
    // 大小写不同也撞
    const id3 = await newUserId(db, 'u3');
    setNickname(db, id1, 'Larry');
    expect(() => setNickname(db, id3, 'larry')).toThrow(NicknameTakenError);
  });

  test('setNickname 写入后 nickname_set_at 非空', async () => {
    const db = initDb(':memory:');
    const id = await newUserId(db, 'u1');
    const before = Date.now();
    setNickname(db, id, '玩家');
    const row = db.query('SELECT nickname, nickname_set_at FROM users WHERE id = ?').get(id) as {
      nickname: string;
      nickname_set_at: string;
    };
    expect(row.nickname).toBe('玩家');
    expect(row.nickname_set_at).toBeTruthy();
    // SQLite datetime('now') 返回 'YYYY-MM-DD HH:MM:SS' 格式
    expect(row.nickname_set_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    const ts = new Date(`${row.nickname_set_at.replace(' ', 'T')}Z`).getTime();
    expect(ts).toBeGreaterThanOrEqual(before - 1000);
  });

  test('setNickname 同一 user 二次调用 → 刷新 nickname_set_at', async () => {
    const db = initDb(':memory:');
    const id = await newUserId(db, 'u1');
    setNickname(db, id, 'Old');
    // 显式让 DB 时间往后 5 秒（mock now 困难，直接覆写字段验证逻辑）
    db.query("UPDATE users SET nickname_set_at = datetime('now', '-5 seconds') WHERE id = ?").run(
      id,
    );
    const t1Adjusted = (
      db.query('SELECT nickname_set_at FROM users WHERE id = ?').get(id) as {
        nickname_set_at: string;
      }
    ).nickname_set_at;
    setNickname(db, id, 'New');
    const t2 = (
      db.query('SELECT nickname_set_at FROM users WHERE id = ?').get(id) as {
        nickname_set_at: string;
      }
    ).nickname_set_at;
    expect(t2 > t1Adjusted).toBe(true);
    expect(
      (db.query('SELECT nickname FROM users WHERE id = ?').get(id) as { nickname: string })
        .nickname,
    ).toBe('New');
  });

  test('setNickname 同一 user 写同 nickname / 大小写变体不撞自己', async () => {
    const db = initDb(':memory:');
    const id = await newUserId(db, 'u1');
    setNickname(db, id, 'Larry');
    // 同 user 重写同 nickname 不应撞 UNIQUE（partial index 自身行 update 不会撞）
    expect(() => setNickname(db, id, 'Larry')).not.toThrow();
    // 大小写变体（属于同一 NOCASE 索引项）也不撞自己
    expect(() => setNickname(db, id, 'larry')).not.toThrow();
  });
});
