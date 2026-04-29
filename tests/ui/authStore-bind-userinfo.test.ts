import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useAuthStore } from '@ui/authStore';

/**
 * authStore.bindWechatUserInfo 单测：
 *
 * 形式与 wechatLogin 测试一致，stub 全局 fetch（apiClient → web NetworkAdapter → fetch）。
 * 关注点：本地 user 对象是否被更新；token 不变；失败不动 state。
 */
describe('authStore.bindWechatUserInfo', () => {
  beforeEach(() => {
    localStorage.clear();
    // 模拟已登录态：token + user 都有，但 wechat_nickname 还没回填
    useAuthStore.setState({
      token: 'pre-existing-token',
      user: {
        id: 42,
        username: 'wx_abcd_xx_xx',
        role: 'player',
        wechat_nickname: null,
        wechat_avatar: null,
      },
    });
    localStorage.setItem('auth_token', 'pre-existing-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('成功 → user.wechat_nickname / avatar 被更新；token 不变', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              user: {
                id: 42,
                username: 'wx_abcd_xx_xx',
                role: 'player',
                wechat_nickname: '小蓝',
                wechat_avatar: 'https://wx.qlogo.cn/avatar.png',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );
    await useAuthStore.getState().bindWechatUserInfo('小蓝', 'https://wx.qlogo.cn/avatar.png');

    const st = useAuthStore.getState();
    expect(st.user?.wechat_nickname).toBe('小蓝');
    expect(st.user?.wechat_avatar).toBe('https://wx.qlogo.cn/avatar.png');
    expect(st.token).toBe('pre-existing-token');
    expect(localStorage.getItem('auth_token')).toBe('pre-existing-token');
  });

  test('401 unauthorized → throw + state 不变', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: 'unauthorized', message: 'authentication required' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );
    await expect(
      useAuthStore.getState().bindWechatUserInfo('小蓝', 'https://x/a.png'),
    ).rejects.toThrow(/authentication required/);
    const st = useAuthStore.getState();
    expect(st.user?.wechat_nickname).toBeNull();
  });

  test('400 validation → throw + state 不变', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'validation', message: 'nickname required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    await expect(useAuthStore.getState().bindWechatUserInfo('', 'https://x/a.png')).rejects.toThrow(
      /nickname required/,
    );
    const st = useAuthStore.getState();
    expect(st.user?.wechat_nickname).toBeNull();
  });

  test('网络异常 → throw + state 不变', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    await expect(
      useAuthStore.getState().bindWechatUserInfo('小蓝', 'https://x/a.png'),
    ).rejects.toThrow(/network down/);
    const st = useAuthStore.getState();
    expect(st.user?.wechat_nickname).toBeNull();
  });
});
