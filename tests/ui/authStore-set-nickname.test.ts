/**
 * authStore.setNickname + displayName + dispatchAfterAuth 单测（spec § 8.3）
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { type AuthUser, displayName, useAuthStore } from '@ui/authStore';
import { useUiStore } from '@ui/store';

const ORIGINAL_FETCH = globalThis.fetch;

beforeEach(() => {
  // 重置 store
  useAuthStore.setState({ token: null, user: null });
  useUiStore.setState({
    nicknameModalOpen: false,
    nicknameModalAfterAuth: null,
    loginModalOpen: false,
    loginModalAfterAuth: null,
  });
  localStorage.clear();
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe('displayName', () => {
  test('优先 nickname → wechat_nickname → username', () => {
    const base = { id: 1, username: 'larry', role: 'player' as const };
    expect(displayName({ ...base, nickname: '玩家1' })).toBe('玩家1');
    expect(displayName({ ...base, wechat_nickname: '小明' })).toBe('小明');
    expect(displayName(base)).toBe('larry');
    // 同时存在时取 nickname
    expect(displayName({ ...base, nickname: '玩家1', wechat_nickname: '小明' })).toBe('玩家1');
  });

  test('空字符串当不存在', () => {
    const base = { id: 1, username: 'larry', role: 'player' as const };
    expect(displayName({ ...base, nickname: '' })).toBe('larry');
    expect(displayName({ ...base, nickname: '', wechat_nickname: '小明' })).toBe('小明');
  });
});

describe('setNickname', () => {
  test('成功 → user.nickname 更新', async () => {
    useAuthStore.setState({
      token: 'tok',
      user: { id: 1, username: 'larry', role: 'player', nickname: null },
    });
    const updated: AuthUser = {
      id: 1,
      username: 'larry',
      role: 'player',
      nickname: '玩家1',
      nickname_set_at: '2026-04-29 10:00:00',
    };
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ user: updated }), { status: 200 }),
    ) as typeof fetch;
    await useAuthStore.getState().setNickname('玩家1');
    expect(useAuthStore.getState().user?.nickname).toBe('玩家1');
  });

  test('409 → 抛错且 message 含 nickname_taken', async () => {
    useAuthStore.setState({ token: 'tok', user: { id: 1, username: 'larry', role: 'player' } });
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'nickname_taken', message: '昵称已被占用' }), {
          status: 409,
        }),
    ) as typeof fetch;
    await expect(useAuthStore.getState().setNickname('larry')).rejects.toThrow(
      /已被占用|nickname_taken/,
    );
  });
});

describe('dispatchAfterAuth (private behavior via login)', () => {
  test('H5 + nickname=null → 打开 nickname modal，afterAuth 闭包入栈', async () => {
    const userBody: AuthUser = {
      id: 1,
      username: 'larry',
      role: 'player',
      nickname: null,
    };
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ token: 'tok', user: userBody }), { status: 200 }),
    ) as typeof fetch;
    const cb = vi.fn();
    await useAuthStore.getState().login('larry', 'password123', cb);
    // dispatchAfterAuth 用了懒 import('./store')，需要等微任务（含 vitest 模块解析）flush。
    // 用 vi.waitFor 轮询，比 setTimeout(0) 宏任务语义精确，比固定次数 await Promise.resolve()
    // 抗 vitest/node 模块解析微任务层数的实现差异
    await vi.waitFor(() => {
      expect(useUiStore.getState().nicknameModalOpen).toBe(true);
    });
    // 此时 cb 还不应被调
    expect(cb).not.toHaveBeenCalled();
    // 模拟 modal 提交成功后 dispatch afterAuth
    const after = useUiStore.getState().nicknameModalAfterAuth;
    after?.();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('H5 + nickname 已填 → 直接调 afterAuth，不开 modal', async () => {
    const userBody: AuthUser = {
      id: 1,
      username: 'larry',
      role: 'player',
      nickname: '玩家1',
    };
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ token: 'tok', user: userBody }), { status: 200 }),
    ) as typeof fetch;
    const cb = vi.fn();
    await useAuthStore.getState().login('larry', 'password123', cb);
    expect(useUiStore.getState().nicknameModalOpen).toBe(false);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('wx 端 + nickname=null → 直接调 afterAuth，不开 modal', async () => {
    // 关键：IS_WX 是 authStore.ts 模块顶层 const，需要 stubEnv + resetModules 后重 import。
    // resetModules 后 platform 也是新实例，要重新 install adapters（jsdom 下用 web 套件即可）
    vi.stubEnv('VITE_PLATFORM', 'wx');
    vi.resetModules();
    const { installAdapters: installAdaptersWx } = await import('@/platform');
    const { webStorage: webStorageWx } = await import('@/platform/web/storage.web');
    const { webNetwork: webNetworkWx } = await import('@/platform/web/network.web');
    const { webAudio: webAudioWx } = await import('@/platform/web/audio.web');
    const { webDevice: webDeviceWx } = await import('@/platform/web/device.web');
    installAdaptersWx({
      storage: webStorageWx,
      network: webNetworkWx,
      audio: webAudioWx,
      device: webDeviceWx,
    });
    const { useAuthStore: useAuthStoreWx } = await import('@ui/authStore');
    const { useUiStore: useUiStoreWx } = await import('@ui/store');
    const userBody = {
      id: 1,
      username: 'larry',
      role: 'player' as const,
      nickname: null,
    };
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ token: 'tok', user: userBody }), { status: 200 }),
    ) as typeof fetch;
    const cb = vi.fn();
    await useAuthStoreWx.getState().login('larry', 'password123', cb);
    // wx 短路：cb 立即调，modal 不开
    expect(cb).toHaveBeenCalledTimes(1);
    expect(useUiStoreWx.getState().nicknameModalOpen).toBe(false);
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
