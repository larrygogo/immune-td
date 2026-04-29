import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useAuthStore } from '@ui/authStore';
import {
  __resetUploadTimerForTest,
  installProgressSyncSubscriber,
  onLoginSyncProgress,
  onLogoutClearProgress,
  scheduleUpload,
} from '@ui/progressSync';
import type { SyncableProgress } from '@ui/progressSync/types';
import { useMetaStore } from '@ui/store';

// -- fetch mock helpers ---------------------------------------------------

type FetchCall = { url: string; init?: RequestInit };
interface FetchMockState {
  calls: FetchCall[];
  nextResponses: Array<{ ok: boolean; status: number; body: unknown }>;
}

function installFetchMock(): FetchMockState {
  const state: FetchMockState = { calls: [], nextResponses: [] };
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const entry: FetchCall = init ? { url, init } : { url };
    state.calls.push(entry);
    const next = state.nextResponses.shift();
    if (!next) throw new Error(`no mock response queued for ${url}`);
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fn);
  return state;
}

function queueOk(state: FetchMockState, body: unknown): void {
  state.nextResponses.push({ ok: true, status: 200, body });
}

/** 从 PUT 调用提取解析后的 body；若记录不合法抛断言错。 */
function putBodyOf(calls: FetchCall[]): { progress: SyncableProgress; payloadVersion: number } {
  const putCall = calls.find((c) => c.init?.method === 'PUT');
  if (!putCall || typeof putCall.init?.body !== 'string') {
    throw new Error('expected PUT call with string body');
  }
  return JSON.parse(putCall.init.body) as {
    progress: SyncableProgress;
    payloadVersion: number;
  };
}

const REMOTE: SyncableProgress = {
  unlockedLevels: [0, 1, 2, 3, 4],
  unlockedTowers: ['macrophage', 'neutrophil'],
  stars: { 1: 3, 2: 2 },
  eliteStars: {},
  loadout: [],
  seenMechanics: ['tower-hp'],
  researchPoints: 0,
  unlockedResearch: [],
  researchResetCount: 0,
  tutorialStep: -1,
  credits: 0,
  unlockedSkins: {},
  equippedSkins: {},
};

function resetStores(): void {
  useAuthStore.setState({ token: 'tok-x', user: { id: 7, username: 'u', role: 'player' } });
  useMetaStore.setState({
    unlockedLevels: [0, 1],
    unlockedTowers: ['macrophage'],
    stars: {},
    eliteStars: {},
    loadout: [],
    seenMechanics: [],
    researchPoints: 0,
    unlockedResearch: [],
    researchResetCount: 0,
    tutorialStep: 0,
    ownerUserId: null,
    freshlyMigrated: false,
  });
}

describe('onLoginSyncProgress: 分支 A 切账号', () => {
  beforeEach(resetStores);
  afterEach(() => {
    vi.restoreAllMocks();
    __resetUploadTimerForTest();
  });

  test('prevOwner=5 登录 userId=7，远端有进度 → 覆盖本地', async () => {
    useMetaStore.setState({ ownerUserId: 5, unlockedLevels: [0, 1, 2, 3] });
    const mock = installFetchMock();
    queueOk(mock, { progress: REMOTE, payloadVersion: 1, updatedAt: 't' });

    await onLoginSyncProgress(7);

    const st = useMetaStore.getState();
    expect(st.ownerUserId).toBe(7);
    expect(st.unlockedLevels).toEqual([0, 1, 2, 3, 4]);
    expect(st.stars).toEqual({ 1: 3, 2: 2 });
    // 不应再发 PUT
    expect(mock.calls.filter((c) => c.init?.method === 'PUT').length).toBe(0);
  });

  test('prevOwner=5 登录 userId=7，远端为空 → 重置到初始默认', async () => {
    useMetaStore.setState({
      ownerUserId: 5,
      unlockedLevels: [0, 1, 2, 3, 4, 5, 6],
      stars: { 1: 3 },
    });
    const mock = installFetchMock();
    queueOk(mock, { progress: null });

    await onLoginSyncProgress(7);

    const st = useMetaStore.getState();
    expect(st.ownerUserId).toBe(7);
    expect(st.unlockedLevels).toEqual([0, 1]);
    expect(st.unlockedTowers).toEqual(['macrophage']);
    expect(st.stars).toEqual({});
    expect(mock.calls.filter((c) => c.init?.method === 'PUT').length).toBe(0);
  });
});

describe('onLoginSyncProgress: 分支 B 匿名迁移', () => {
  beforeEach(resetStores);
  afterEach(() => {
    vi.restoreAllMocks();
    __resetUploadTimerForTest();
  });

  test('anon + 远端空 → PUT 本地', async () => {
    useMetaStore.setState({
      unlockedLevels: [0, 1, 2, 3],
      stars: { 1: 3, 2: 2, 3: 1 },
      ownerUserId: null,
    });
    const mock = installFetchMock();
    queueOk(mock, { progress: null });
    queueOk(mock, { updatedAt: 't' });

    await onLoginSyncProgress(7);

    const st = useMetaStore.getState();
    expect(st.ownerUserId).toBe(7);
    expect(st.unlockedLevels).toEqual([0, 1, 2, 3]); // 本地保留
    const body = putBodyOf(mock.calls);
    expect(body.progress.unlockedLevels).toEqual([0, 1, 2, 3]);
    expect(body.progress.stars).toEqual({ 1: 3, 2: 2, 3: 1 });
  });

  test('anon + 远端有 + 合并后等于远端 → 不 PUT', async () => {
    useMetaStore.setState({
      unlockedLevels: [0, 1],
      unlockedTowers: ['macrophage'],
      stars: {},
      ownerUserId: null,
      loadout: [],
      seenMechanics: [],
      tutorialStep: 0,
    });
    const mock = installFetchMock();
    queueOk(mock, { progress: REMOTE, payloadVersion: 1, updatedAt: 't' });

    await onLoginSyncProgress(7);

    const st = useMetaStore.getState();
    expect(st.ownerUserId).toBe(7);
    expect(st.unlockedLevels).toEqual([0, 1, 2, 3, 4]);
    // local 的 loadout/seenMechanics 为空、tutorialStep=0（远端 -1 赢）→ merged === remote
    expect(mock.calls.filter((c) => c.init?.method === 'PUT').length).toBe(0);
  });

  test('anon + 远端有 + 合并后 ≠ 远端 → 立刻 PUT', async () => {
    useMetaStore.setState({
      unlockedLevels: [0, 1, 5, 6], // 本地多解锁了 5/6
      unlockedTowers: ['macrophage'],
      stars: {},
      ownerUserId: null,
      loadout: [],
      seenMechanics: [],
      tutorialStep: -1,
    });
    const mock = installFetchMock();
    queueOk(mock, { progress: REMOTE, payloadVersion: 1, updatedAt: 't' });
    queueOk(mock, { updatedAt: 't2' });

    await onLoginSyncProgress(7);

    const st = useMetaStore.getState();
    expect(st.ownerUserId).toBe(7);
    expect(st.unlockedLevels).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const body = putBodyOf(mock.calls);
    expect(body.progress.unlockedLevels).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe('onLoginSyncProgress: 分支 C 同账号重新登录', () => {
  beforeEach(resetStores);
  afterEach(() => {
    vi.restoreAllMocks();
    __resetUploadTimerForTest();
  });

  test('prevOwner === userId + 远端空 → PUT 本地', async () => {
    useMetaStore.setState({
      ownerUserId: 7,
      unlockedLevels: [0, 1, 2],
      stars: { 1: 2 },
    });
    const mock = installFetchMock();
    queueOk(mock, { progress: null });
    queueOk(mock, { updatedAt: 't' });

    await onLoginSyncProgress(7);

    expect(mock.calls.some((c) => c.init?.method === 'PUT')).toBe(true);
    expect(useMetaStore.getState().ownerUserId).toBe(7);
  });

  test('prevOwner === userId + 远端有 + 合并后 ≠ 远端 → PUT', async () => {
    useMetaStore.setState({
      ownerUserId: 7,
      unlockedLevels: [0, 1, 9], // 本地多 9
      unlockedTowers: ['macrophage'],
      stars: { 1: 3 }, // 本地关 1 是 3★，远端也 3★
      loadout: [],
      seenMechanics: [],
      tutorialStep: -1,
    });
    const mock = installFetchMock();
    queueOk(mock, { progress: REMOTE, payloadVersion: 1, updatedAt: 't' });
    queueOk(mock, { updatedAt: 't2' });

    await onLoginSyncProgress(7);

    expect(useMetaStore.getState().unlockedLevels).toEqual([0, 1, 2, 3, 4, 9]);
    expect(mock.calls.filter((c) => c.init?.method === 'PUT').length).toBe(1);
  });
});

describe('onLoginSyncProgress: 网络异常容错', () => {
  beforeEach(resetStores);
  afterEach(() => {
    vi.restoreAllMocks();
    __resetUploadTimerForTest();
  });

  test('GET 失败 → 静默跳过，本地不变', async () => {
    useMetaStore.setState({
      unlockedLevels: [0, 1, 2],
      ownerUserId: null,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('err', { status: 500 })),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(onLoginSyncProgress(7)).resolves.toBeUndefined();
    expect(useMetaStore.getState().unlockedLevels).toEqual([0, 1, 2]);
    expect(useMetaStore.getState().ownerUserId).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});

describe('onLogoutClearProgress', () => {
  beforeEach(resetStores);
  afterEach(() => vi.restoreAllMocks());

  test('清同步字段 + ownerUserId，保留 settings', () => {
    useMetaStore.setState({
      unlockedLevels: [0, 1, 2, 3],
      stars: { 1: 3 },
      ownerUserId: 7,
      settings: {
        masterVolume: 0.3,
        sfxVolume: 0.4,
        bgmVolume: 0.5,
        graphics: 'low',
        muted: true,
      },
    });

    onLogoutClearProgress();

    const st = useMetaStore.getState();
    expect(st.unlockedLevels).toEqual([0, 1]);
    expect(st.stars).toEqual({});
    expect(st.ownerUserId).toBeNull();
    expect(st.settings.masterVolume).toBe(0.3); // settings 保留
    expect(st.settings.muted).toBe(true);
  });
});

describe('scheduleUpload debounce', () => {
  beforeEach(() => {
    resetStores();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    __resetUploadTimerForTest();
  });

  test('连续 3 次 schedule 只发 1 次 PUT', async () => {
    const mock = installFetchMock();
    queueOk(mock, { updatedAt: 't' });

    scheduleUpload();
    scheduleUpload();
    scheduleUpload();

    expect(mock.calls.length).toBe(0);

    await vi.advanceTimersByTimeAsync(2100);
    expect(mock.calls.filter((c) => c.init?.method === 'PUT').length).toBe(1);
  });

  test('未登录不 PUT', async () => {
    useAuthStore.setState({ token: null, user: null });
    const mock = installFetchMock();

    scheduleUpload();
    await vi.advanceTimersByTimeAsync(2100);

    expect(mock.calls.length).toBe(0);
  });
});

describe('installProgressSyncSubscriber', () => {
  beforeEach(() => {
    resetStores();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    __resetUploadTimerForTest();
  });

  test('metaStore 同步字段变更 → 触发 PUT；settings 变更不触发', async () => {
    const mock = installFetchMock();
    queueOk(mock, { updatedAt: 't' });
    const unsub = installProgressSyncSubscriber();

    // 改 settings：不应触发
    useMetaStore.setState((st) => ({ settings: { ...st.settings, muted: true } }));
    await vi.advanceTimersByTimeAsync(2100);
    expect(mock.calls.length).toBe(0);

    // 改 unlockedLevels：应触发
    useMetaStore.setState((st) => ({ unlockedLevels: [...st.unlockedLevels, 2] }));
    await vi.advanceTimersByTimeAsync(2100);
    expect(mock.calls.filter((c) => c.init?.method === 'PUT').length).toBe(1);

    unsub();
  });
});
