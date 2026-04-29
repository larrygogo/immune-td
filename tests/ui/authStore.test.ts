import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useAuthStore } from '@ui/authStore';
import { useMetaStore } from '@ui/store';

describe('authStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ token: null, user: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('register 成功 → token 存 localStorage + state 设 user', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              token: 'tok-abc',
              user: { id: 1, username: 'alice', role: 'player' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );
    await useAuthStore.getState().register('alice', 'passw0rd');
    const st = useAuthStore.getState();
    expect(st.token).toBe('tok-abc');
    expect(st.user?.username).toBe('alice');
    expect(localStorage.getItem('auth_token')).toBe('tok-abc');
  });

  test('login 失败 → throw + state 不变', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: 'invalid_credentials', message: 'wrong password' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );
    await expect(useAuthStore.getState().login('bob', 'wrong')).rejects.toThrow(/wrong password/);
    expect(useAuthStore.getState().token).toBeNull();
  });

  test('logout 清空 token + state 即便后端失败', async () => {
    // 先伪造一个登录态
    localStorage.setItem('auth_token', 'tok');
    useAuthStore.setState({ token: 'tok', user: { id: 1, username: 'x', role: 'player' } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 500 })),
    );
    await useAuthStore.getState().logout();
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  test('loadFromStorage：有 token 且 /api/me 成功 → 填 user', async () => {
    localStorage.setItem('auth_token', 'tok-xyz');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ user: { id: 2, username: 'carol', role: 'admin' } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    await useAuthStore.getState().loadFromStorage();
    expect(useAuthStore.getState().user?.role).toBe('admin');
  });

  test('loadFromStorage：token 无效 → 清空', async () => {
    localStorage.setItem('auth_token', 'expired');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 401 })),
    );
    await useAuthStore.getState().loadFromStorage();
    expect(useAuthStore.getState().token).toBeNull();
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  test('login 成功 → 触发 progressSync（metaStore.ownerUserId 被设为 user.id）', async () => {
    // metaStore 初始匿名态
    useMetaStore.setState({ ownerUserId: null });

    // 两次响应：login → /api/progress GET 空
    const responses = [
      new Response(
        JSON.stringify({
          token: 'tok-sync',
          user: { id: 42, username: 'sync-user', role: 'player' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
      new Response(JSON.stringify({ progress: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
      // 匿名迁移 PUT 响应
      new Response(JSON.stringify({ updatedAt: 't' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => responses.shift() ?? new Response(null, { status: 500 })),
    );

    await useAuthStore.getState().login('sync-user', 'passw0rd');

    expect(useMetaStore.getState().ownerUserId).toBe(42);
  });

  test('logout → metaStore.ownerUserId 被清空', async () => {
    useMetaStore.setState({ ownerUserId: 99, unlockedLevels: [0, 1, 2, 3] });
    useAuthStore.setState({ token: 'tok', user: { id: 99, username: 'x', role: 'player' } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 })),
    );

    await useAuthStore.getState().logout();

    expect(useMetaStore.getState().ownerUserId).toBeNull();
    expect(useMetaStore.getState().unlockedLevels).toEqual([0, 1]); // 被重置
  });
});
