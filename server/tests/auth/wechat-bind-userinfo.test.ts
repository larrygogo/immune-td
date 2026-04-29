/**
 * /api/auth/wechat-bind-userinfo 路由单测：
 *
 * spec § 12.1 强登录约束的延伸 —— wx 端登录后还要授权 userInfo（昵称 + 头像）才能进游戏。
 * 链路：BootScene wx.createUserInfoButton → 拿 nickname + avatarUrl → POST 此端点。
 *
 * 覆盖：
 * 1. 已登录用户 bind 成功 → 200 + 返回更新后的 user
 * 2. 未登录（无 Bearer）→ 401 unauthorized
 * 3. body 缺 nickname → 400 validation
 * 4. body 缺 avatar → 400 validation
 * 5. nickname 空字符串 → 400
 * 6. bind 后 GET /api/me 也带 wechat_nickname / wechat_avatar
 * 7. 重复 bind 覆盖（用户重新授权可能换头像）
 */

import { describe, expect, test } from 'bun:test';
import type { FetchLike } from '../../src/auth/wechat';
import { createTestApp } from '../helpers';

const headers = { 'Content-Type': 'application/json' };

function mockFetch(body: Record<string, unknown>): FetchLike {
  return async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
}

/** 创建 app + 用 wechat-login 拿 token，方便后续 bind */
async function setupWxUser(openid = 'oBIND_TEST_USER') {
  const app = createTestApp(
    { wechatAppId: 'wx', wechatAppSecret: 'sec' },
    { wechatFetch: mockFetch({ openid, session_key: 'sk' }) },
  ).app;
  const r = await app.request('/api/auth/wechat-login', {
    method: 'POST',
    headers,
    body: JSON.stringify({ code: 'wx-code-bind' }),
  });
  expect(r.status).toBe(200);
  const { token } = (await r.json()) as { token: string };
  return { app, token };
}

describe('POST /api/auth/wechat-bind-userinfo', () => {
  test('已登录用户 bind 成功 → 200 + 返回新 user', async () => {
    const { app, token } = await setupWxUser('oOK1');
    const res = await app.request('/api/auth/wechat-bind-userinfo', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        nickname: '小明',
        avatar: 'https://thirdwx.qlogo.cn/mmopen/abc.png',
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      user: {
        id: number;
        username: string;
        role: string;
        wechat_nickname: string;
        wechat_avatar: string;
      };
    };
    expect(body.user.wechat_nickname).toBe('小明');
    expect(body.user.wechat_avatar).toBe('https://thirdwx.qlogo.cn/mmopen/abc.png');
  });

  test('未登录（无 Bearer）→ 401', async () => {
    const { app } = await setupWxUser('oOK2');
    const res = await app.request('/api/auth/wechat-bind-userinfo', {
      method: 'POST',
      headers,
      body: JSON.stringify({ nickname: '小红', avatar: 'https://x/a.png' }),
    });
    expect(res.status).toBe(401);
  });

  test('body 缺 nickname → 400', async () => {
    const { app, token } = await setupWxUser('oOK3');
    const res = await app.request('/api/auth/wechat-bind-userinfo', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ avatar: 'https://x/a.png' }),
    });
    expect(res.status).toBe(400);
  });

  test('body 缺 avatar → 400', async () => {
    const { app, token } = await setupWxUser('oOK4');
    const res = await app.request('/api/auth/wechat-bind-userinfo', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nickname: '小明' }),
    });
    expect(res.status).toBe(400);
  });

  test('nickname 空字符串 → 400', async () => {
    const { app, token } = await setupWxUser('oOK5');
    const res = await app.request('/api/auth/wechat-bind-userinfo', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nickname: '', avatar: 'https://x/a.png' }),
    });
    expect(res.status).toBe(400);
  });

  test('bind 后 GET /api/me 也带 wechat_nickname / wechat_avatar', async () => {
    const { app, token } = await setupWxUser('oME1');

    // bind 之前 /api/me 返回 wechat_nickname=null
    const meBefore = await app.request('/api/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meBefore.status).toBe(200);
    const beforeBody = (await meBefore.json()) as {
      user: { wechat_nickname: string | null; wechat_avatar: string | null };
    };
    expect(beforeBody.user.wechat_nickname).toBeNull();
    expect(beforeBody.user.wechat_avatar).toBeNull();

    // bind
    const bindRes = await app.request('/api/auth/wechat-bind-userinfo', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nickname: '海蓝', avatar: 'https://wx.qlogo.cn/avatar.png' }),
    });
    expect(bindRes.status).toBe(200);

    // bind 之后 /api/me 字段已回填
    const meAfter = await app.request('/api/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const afterBody = (await meAfter.json()) as {
      user: { wechat_nickname: string | null; wechat_avatar: string | null };
    };
    expect(afterBody.user.wechat_nickname).toBe('海蓝');
    expect(afterBody.user.wechat_avatar).toBe('https://wx.qlogo.cn/avatar.png');
  });

  test('重复 bind 覆盖（重新授权换头像）', async () => {
    const { app, token } = await setupWxUser('oREBIND');

    await app.request('/api/auth/wechat-bind-userinfo', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nickname: '老昵称', avatar: 'https://x/old.png' }),
    });

    const r2 = await app.request('/api/auth/wechat-bind-userinfo', {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nickname: '新昵称', avatar: 'https://x/new.png' }),
    });
    expect(r2.status).toBe(200);
    const body = (await r2.json()) as {
      user: { wechat_nickname: string; wechat_avatar: string };
    };
    expect(body.user.wechat_nickname).toBe('新昵称');
    expect(body.user.wechat_avatar).toBe('https://x/new.png');
  });
});
