import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useAuthStore } from '@ui/authStore';

/**
 * authStore.wechatLogin 单测：覆盖 T2.2 微信小游戏自动登录链路。
 * 形式与现有 register/login 测试一致：直接 stub 全局 fetch（apiClient 在 H5/jsdom
 * 下走 platform.network adapter，默认 H5 adapter 内部就是 fetch）。
 */
describe('authStore.wechatLogin', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ token: null, user: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('成功 → token 写 localStorage + state 设 user', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              token: 'tok-wx',
              user: { id: 7, username: 'wx_abc', role: 'player' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );
    await useAuthStore.getState().wechatLogin('wx-code-001');
    const st = useAuthStore.getState();
    expect(st.token).toBe('tok-wx');
    expect(st.user?.id).toBe(7);
    expect(st.user?.username).toBe('wx_abc');
    expect(localStorage.getItem('auth_token')).toBe('tok-wx');
  });

  test('401 invalid_code → throw 带 message + state/localStorage 不变', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'invalid_code', message: 'wx code expired' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    await expect(useAuthStore.getState().wechatLogin('bad')).rejects.toThrow(/wx code expired/);
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  test('429 rate_limited → throw（让上层 retry）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: 'rate_limited', message: 'too many login attempts' }),
            {
              status: 429,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
      ),
    );
    await expect(useAuthStore.getState().wechatLogin('c')).rejects.toThrow(/too many/);
    expect(useAuthStore.getState().token).toBeNull();
  });

  test('网络异常 → throw + state 不变', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    await expect(useAuthStore.getState().wechatLogin('c')).rejects.toThrow(/network down/);
    expect(useAuthStore.getState().token).toBeNull();
    expect(localStorage.getItem('auth_token')).toBeNull();
  });
});
