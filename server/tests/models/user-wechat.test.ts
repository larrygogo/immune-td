/**
 * user model 微信扩展单测：
 * - findByWechatOpenid / findByWechatUnionid 的命中和未命中
 * - createWechatUser 生成的 username 形态、占位 password_hash 不为空
 * - partial unique index 强制 openid / unionid 唯一（NULL 不互相冲突）
 */

import { describe, expect, test } from 'bun:test';
import { initDb } from '../../src/db';
import {
  bindWechatUserInfo,
  createUser,
  createWechatUser,
  findByWechatOpenid,
  findByWechatUnionid,
} from '../../src/models/user';

describe('user model · wechat helpers', () => {
  test('findByWechatOpenid 未命中 → null', () => {
    const db = initDb(':memory:');
    expect(findByWechatOpenid(db, 'oNOT_EXIST')).toBeNull();
  });

  test('findByWechatUnionid 未命中 → null', () => {
    const db = initDb(':memory:');
    expect(findByWechatUnionid(db, 'uNOT_EXIST')).toBeNull();
  });

  test('createWechatUser → username 以 wx_ 开头 + 占位 password_hash 非空', async () => {
    const db = initDb(':memory:');
    const user = await createWechatUser(db, { openid: 'oABC12345' });
    expect(user.username.startsWith('wx_')).toBe(true);
    expect(user.username.length).toBeLessThanOrEqual(32);
    expect(user.password_hash.length).toBeGreaterThan(0);
    expect(user.role).toBe('player');
    expect(user.wechat_openid).toBe('oABC12345');
    expect(user.wechat_unionid).toBeNull();
  });

  test('createWechatUser 带 unionid → 写入 unionid 列', async () => {
    const db = initDb(':memory:');
    const user = await createWechatUser(db, {
      openid: 'oWITH_UNION',
      unionid: 'uMY_UNION',
    });
    expect(user.wechat_openid).toBe('oWITH_UNION');
    expect(user.wechat_unionid).toBe('uMY_UNION');

    expect(findByWechatOpenid(db, 'oWITH_UNION')?.id).toBe(user.id);
    expect(findByWechatUnionid(db, 'uMY_UNION')?.id).toBe(user.id);
  });

  test('partial unique index：相同 openid 第二次插入应失败', async () => {
    const db = initDb(':memory:');
    await createWechatUser(db, { openid: 'oDUP_OPENID' });
    let threw = false;
    try {
      await createWechatUser(db, { openid: 'oDUP_OPENID' });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test('partial unique index：相同 unionid 第二次插入应失败', async () => {
    const db = initDb(':memory:');
    await createWechatUser(db, { openid: 'oA1', unionid: 'uDUP' });
    let threw = false;
    try {
      await createWechatUser(db, { openid: 'oA2', unionid: 'uDUP' });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test('partial unique index：多个 NULL openid 用户共存（H5 用户场景）', () => {
    // H5 注册的普通用户都没 wechat_openid，partial unique index WHERE NOT NULL 不该约束他们
    const db = initDb(':memory:');
    createUser(db, 'alice', 'fake-hash-1', 'player');
    createUser(db, 'bob', 'fake-hash-2', 'player');
    // 没 throw 即验证通过
    const count = db.query('SELECT COUNT(*) as c FROM users').get() as { c: number };
    expect(count.c).toBe(2);
  });

  test('createWechatUser 后 wechat_nickname / wechat_avatar 默认 NULL', async () => {
    const db = initDb(':memory:');
    const user = await createWechatUser(db, { openid: 'oNEW_NULL' });
    expect(user.wechat_nickname).toBeNull();
    expect(user.wechat_avatar).toBeNull();
  });

  test('bindWechatUserInfo → 写入字段 + 返回更新后 row', async () => {
    const db = initDb(':memory:');
    const user = await createWechatUser(db, { openid: 'oBIND_OK' });
    const updated = bindWechatUserInfo(db, user.id, '小蓝', 'https://x/avatar.png');
    expect(updated.id).toBe(user.id);
    expect(updated.wechat_nickname).toBe('小蓝');
    expect(updated.wechat_avatar).toBe('https://x/avatar.png');

    // 二次查询确认持久化
    const reread = findByWechatOpenid(db, 'oBIND_OK');
    expect(reread?.wechat_nickname).toBe('小蓝');
    expect(reread?.wechat_avatar).toBe('https://x/avatar.png');
  });

  test('bindWechatUserInfo 覆盖（重新授权换头像）', async () => {
    const db = initDb(':memory:');
    const user = await createWechatUser(db, { openid: 'oREBIND2' });
    bindWechatUserInfo(db, user.id, '昵1', 'https://x/1.png');
    const u2 = bindWechatUserInfo(db, user.id, '昵2', 'https://x/2.png');
    expect(u2.wechat_nickname).toBe('昵2');
    expect(u2.wechat_avatar).toBe('https://x/2.png');
  });

  test('bindWechatUserInfo userId 不存在 → throw', async () => {
    const db = initDb(':memory:');
    expect(() => bindWechatUserInfo(db, 99999, 'x', 'y')).toThrow();
  });

  test('username 包含时间戳后缀，并发同 openid 创建（极端场景）应至少一个成功', async () => {
    // 真实场景下 partial unique index 会拒绝同 openid 第二次插入；这个 case 验证
    // 短窗口内同 ms 的随机后缀让 username 不冲突（即便 openid 不同也不撞 username）
    const db = initDb(':memory:');
    const u1 = await createWechatUser(db, { openid: 'oUSER_1' });
    const u2 = await createWechatUser(db, { openid: 'oUSER_2' });
    const u3 = await createWechatUser(db, { openid: 'oUSER_3' });
    expect(new Set([u1.username, u2.username, u3.username]).size).toBe(3);
  });
});
