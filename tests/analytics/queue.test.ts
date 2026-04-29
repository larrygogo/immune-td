import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AnalyticsQueue } from '@/analytics/queue';
import type { AnalyticsEventInput, AnalyticsProvider } from '@/analytics/types';

function makeEvent(): AnalyticsEventInput {
  return {
    device_id: 'd-1',
    user_id: null,
    session_id: 's-1',
    client_ts: 0,
    app_version: '0.0.0',
    platform: 'web',
    event_name: 'session_start',
    props: { is_returning: false },
  };
}

describe('AnalyticsQueue · 调度', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('满 batchSize 立即 flush', async () => {
    const sent: AnalyticsEventInput[] = [];
    const provider: AnalyticsProvider = {
      name: 'test',
      send: async (events) => {
        sent.push(...events);
      },
    };
    const q = new AnalyticsQueue([provider], { batchSize: 3, flushIntervalMs: 5000 });
    q.enqueue(makeEvent());
    q.enqueue(makeEvent());
    expect(sent.length).toBe(0);
    q.enqueue(makeEvent()); // 满 3 条触发立即 flush
    // flush 是异步的，等 microtask 完成
    await Promise.resolve();
    await Promise.resolve();
    expect(sent.length).toBe(3);
    expect(q.size()).toBe(0);
  });

  test('未满批 → flushIntervalMs 后定时 flush', async () => {
    const sent: AnalyticsEventInput[] = [];
    const provider: AnalyticsProvider = {
      name: 'test',
      send: async (events) => {
        sent.push(...events);
      },
    };
    const q = new AnalyticsQueue([provider], { batchSize: 20, flushIntervalMs: 5000 });
    q.enqueue(makeEvent());
    q.enqueue(makeEvent());
    expect(sent.length).toBe(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent.length).toBe(2);
  });

  test('显式 flush() 立即清空', async () => {
    const sent: AnalyticsEventInput[] = [];
    const provider: AnalyticsProvider = {
      name: 'test',
      send: async (events) => {
        sent.push(...events);
      },
    };
    const q = new AnalyticsQueue([provider]);
    q.enqueue(makeEvent());
    await q.flush();
    expect(sent.length).toBe(1);
    expect(q.size()).toBe(0);
  });

  test('空队列 flush 不调 provider', async () => {
    const send = vi.fn();
    const provider: AnalyticsProvider = { name: 'test', send };
    const q = new AnalyticsQueue([provider]);
    await q.flush();
    expect(send).not.toHaveBeenCalled();
  });

  test('多 provider 并发调用，且各自 try/catch 隔离', async () => {
    const okSent: AnalyticsEventInput[] = [];
    const okProvider: AnalyticsProvider = {
      name: 'ok',
      send: async (events) => {
        okSent.push(...events);
      },
    };
    const failProvider: AnalyticsProvider = {
      name: 'fail',
      send: async () => {
        throw new Error('boom');
      },
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const q = new AnalyticsQueue([failProvider, okProvider]);
    q.enqueue(makeEvent());
    await q.flush();
    // ok provider 仍收到事件，不被 fail 拖累
    expect(okSent.length).toBe(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
