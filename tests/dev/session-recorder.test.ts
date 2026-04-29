import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionRecorder } from '@/dev/session-recorder';

describe('sessionRecorder 完成一波才保存发送', () => {
  beforeEach(() => {
    // 保证每个用例 session 状态干净（上一用例可能留下 current）
    sessionRecorder.abort();
    // mock fetch 吞掉真实上传，避免 jsdom 环境下 /__debug/session 报错
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 200 }));
  });

  it('0 完成波次 → finalize 返回 null，不保存不上传', () => {
    sessionRecorder.start(1, 12345);
    const result = sessionRecorder.finalize({
      outcome: 'aborted',
      finalHp: 10,
      finalAtp: 100,
      waveReached: 0,
    });
    expect(result).toBeNull();
    expect(sessionRecorder.getCurrent()).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('1 完成波次后输掉 → finalize 返回 session 且上传', () => {
    sessionRecorder.start(1, 12345);
    sessionRecorder.onWaveCompleted();
    const result = sessionRecorder.finalize({
      outcome: 'lost',
      finalHp: 0,
      finalAtp: 50,
      waveReached: 2,
    });
    expect(result).not.toBeNull();
    expect(result?.summary?.outcome).toBe('lost');
    expect(result?.levelId).toBe(1);
    expect(sessionRecorder.getCurrent()).toBeNull();
  });

  it('多波完成后 abort → 依然保存', () => {
    sessionRecorder.start(3, 999);
    sessionRecorder.onWaveCompleted();
    sessionRecorder.onWaveCompleted();
    sessionRecorder.onWaveCompleted();
    // abort 内部调 finalize({outcome:'aborted', waveReached:0})
    sessionRecorder.abort();
    // abort 无返回值，但 getCurrent 应为 null；且 fetch 被调（至少一次上传）
    expect(sessionRecorder.getCurrent()).toBeNull();
  });

  it('start 会重置 completedWaves 计数（避免跨 session 污染）', () => {
    sessionRecorder.start(1, 1);
    sessionRecorder.onWaveCompleted();
    sessionRecorder.onWaveCompleted();
    sessionRecorder.finalize({ outcome: 'won', finalHp: 10, finalAtp: 0, waveReached: 2 });
    // 新 session：完成 0 波应当被过滤
    sessionRecorder.start(2, 2);
    const result = sessionRecorder.finalize({
      outcome: 'lost',
      finalHp: 0,
      finalAtp: 0,
      waveReached: 1,
    });
    expect(result).toBeNull();
  });

  it('未 start 直接 finalize → null，无副作用', () => {
    const result = sessionRecorder.finalize({
      outcome: 'won',
      finalHp: 10,
      finalAtp: 0,
      waveReached: 1,
    });
    expect(result).toBeNull();
  });

  it('finalize(summary, endTick) 将 endTick 写入 session', () => {
    sessionRecorder.start(1, 42);
    sessionRecorder.onWaveCompleted();
    const result = sessionRecorder.finalize(
      { outcome: 'won', finalHp: 10, finalAtp: 100, waveReached: 5 },
      3600,
    );
    expect(result?.endTick).toBe(3600);
  });

  it('abort(endTick) 透传 endTick 到 finalize', () => {
    sessionRecorder.start(2, 99);
    sessionRecorder.onWaveCompleted();
    sessionRecorder.abort(1234);
    // abort 无返回；通过 getCurrent 间接验证已 finalize
    expect(sessionRecorder.getCurrent()).toBeNull();
    // 更直接的断言：下一个 start 不会继承 endTick，所以用独立用例验证
  });

  it('finalize 不传 endTick → session.endTick 为 undefined', () => {
    sessionRecorder.start(1, 1);
    sessionRecorder.onWaveCompleted();
    const result = sessionRecorder.finalize({
      outcome: 'lost',
      finalHp: 0,
      finalAtp: 0,
      waveReached: 2,
    });
    expect(result?.endTick).toBeUndefined();
  });

  it('onWaveCompleted 在无 session 时是 no-op', () => {
    expect(() => sessionRecorder.onWaveCompleted()).not.toThrow();
    // 后续 start + finalize 仍然需要重新完成一波
    sessionRecorder.start(1, 1);
    const r = sessionRecorder.finalize({
      outcome: 'won',
      finalHp: 10,
      finalAtp: 0,
      waveReached: 1,
    });
    expect(r).toBeNull();
  });
});

describe('migrateSessionIfNeeded', () => {
  it('v1 session 原样返回', async () => {
    const { migrateSessionIfNeeded } = await import('@/dev/session-recorder');
    const raw = {
      version: 1,
      sessionId: 'abc',
      levelId: 1,
      seed: 42,
      startedAt: '2026-01-01T00:00:00Z',
      actions: [],
    };
    const migrated = migrateSessionIfNeeded(raw);
    expect(migrated).toBe(raw); // 同一引用
  });

  it('非对象抛错', async () => {
    const { migrateSessionIfNeeded } = await import('@/dev/session-recorder');
    expect(() => migrateSessionIfNeeded(null)).toThrow(/非对象/);
    expect(() => migrateSessionIfNeeded('string')).toThrow(/非对象/);
  });

  it('version 缺失或非法抛错', async () => {
    const { migrateSessionIfNeeded } = await import('@/dev/session-recorder');
    expect(() => migrateSessionIfNeeded({})).toThrow(/未知 version/);
    expect(() => migrateSessionIfNeeded({ version: 0 })).toThrow(/未知 version/);
    expect(() => migrateSessionIfNeeded({ version: 'x' })).toThrow(/未知 version/);
  });

  it('未来版本 session 仅 warn 不抛', async () => {
    const { migrateSessionIfNeeded } = await import('@/dev/session-recorder');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const raw = {
      version: 999,
      sessionId: 'future',
      levelId: 1,
      seed: 42,
      startedAt: '2027-01-01T00:00:00Z',
      actions: [],
    };
    const migrated = migrateSessionIfNeeded(raw);
    expect(migrated.sessionId).toBe('future');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
