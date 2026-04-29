import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  _resetAnalyticsForTests,
  _setupAnalytics,
  flush,
  identify,
  setEnabled,
  track,
} from '@/analytics/index';
import type { AnalyticsEventInput, AnalyticsProvider } from '@/analytics/types';

function setupWith(provider: AnalyticsProvider) {
  _setupAnalytics({
    providers: [provider],
    sessionId: 'sess-1',
    appVersion: '1.0.0',
    injectors: {
      getDeviceId: () => 'dev-1',
      getPlatform: () => 'web',
    },
    queueOptions: { batchSize: 1, flushIntervalMs: 5000 },
  });
}

describe('analytics · track + envelope 注入', () => {
  beforeEach(() => {
    _resetAnalyticsForTests();
  });
  afterEach(() => {
    _resetAnalyticsForTests();
  });

  test('track 自动注入 device_id / session_id / app_version / platform / client_ts', async () => {
    const sent: AnalyticsEventInput[] = [];
    setupWith({
      name: 't',
      send: async (events) => {
        sent.push(...events);
      },
    });

    const before = Date.now();
    track('session_start', { is_returning: true });
    await flush();
    expect(sent).toHaveLength(1);
    const ev = sent[0];
    if (!ev) throw new Error('no event');
    expect(ev.device_id).toBe('dev-1');
    expect(ev.session_id).toBe('sess-1');
    expect(ev.app_version).toBe('1.0.0');
    expect(ev.platform).toBe('web');
    expect(ev.event_name).toBe('session_start');
    expect(ev.client_ts).toBeGreaterThanOrEqual(before);
    expect(ev.user_id).toBeNull();
  });

  test('identify(uid) 后 user_id 写为字符串', async () => {
    const sent: AnalyticsEventInput[] = [];
    setupWith({
      name: 't',
      send: async (events) => {
        sent.push(...events);
      },
    });
    identify(42);
    track('session_start', { is_returning: false });
    await flush();
    expect(sent[0]?.user_id).toBe('42');
  });

  test('未 _setupAnalytics 时 track 静默丢弃（不抛错）', () => {
    expect(() => {
      track('session_start', { is_returning: false });
    }).not.toThrow();
  });

  test('schema 校验失败 → console.warn 不入队', async () => {
    const sent: AnalyticsEventInput[] = [];
    setupWith({
      name: 't',
      send: async (events) => {
        sent.push(...events);
      },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // 故意传错 props 形状（level_start 配 session_start props）
    // ts-expect-error 测试运行期校验，编译期已经会拦截
    track('level_start', { is_returning: true } as never);
    await flush();
    expect(sent.length).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test('setEnabled(false) 后 track 静默丢弃', async () => {
    const sent: AnalyticsEventInput[] = [];
    setupWith({
      name: 't',
      send: async (events) => {
        sent.push(...events);
      },
    });
    setEnabled(false);
    track('session_start', { is_returning: true });
    await flush();
    expect(sent.length).toBe(0);
  });

  test('setEnabled(true) 后恢复 track', async () => {
    const sent: AnalyticsEventInput[] = [];
    setupWith({
      name: 't',
      send: async (events) => {
        sent.push(...events);
      },
    });
    setEnabled(false);
    track('session_start', { is_returning: false });
    setEnabled(true);
    track('session_start', { is_returning: true });
    await flush();
    expect(sent.length).toBe(1);
    expect(sent[0]?.props).toEqual({ is_returning: true });
  });
});

describe('analytics · 事件类型推断（编译期 + 运行期）', () => {
  beforeEach(() => {
    _resetAnalyticsForTests();
  });
  afterEach(() => {
    _resetAnalyticsForTests();
  });

  test('level_start props 必填 mode 字段', async () => {
    const sent: AnalyticsEventInput[] = [];
    setupWith({
      name: 't',
      send: async (events) => {
        sent.push(...events);
      },
    });
    track('level_start', {
      level_id: 2,
      attempt_n: 1,
      loadout: ['macrophage'],
      seed: 99,
      mode: 'elite',
    });
    await flush();
    expect(sent.length).toBe(1);
    if (sent[0]?.event_name === 'level_start') {
      expect(sent[0]?.props.mode).toBe('elite');
    }
  });
});
