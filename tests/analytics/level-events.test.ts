import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { _resetAnalyticsForTests, _setupAnalytics, flush } from '@/analytics/index';
import {
  _resetLevelEventsForTests,
  trackLevelComplete,
  trackLevelFail,
  trackLevelQuit,
  trackLevelStart,
} from '@/analytics/level-events';
import type { AnalyticsEventInput, AnalyticsProvider } from '@/analytics/types';

function setup(provider: AnalyticsProvider) {
  _setupAnalytics({
    providers: [provider],
    sessionId: 'sess-1',
    appVersion: '1.0.0',
    injectors: { getDeviceId: () => 'd-1', getPlatform: () => 'web' },
    queueOptions: { batchSize: 100, flushIntervalMs: 99_999 },
  });
}

describe('level-events · 状态机', () => {
  let sent: AnalyticsEventInput[];
  let provider: AnalyticsProvider;

  beforeEach(() => {
    _resetAnalyticsForTests();
    _resetLevelEventsForTests();
    sent = [];
    provider = {
      name: 't',
      send: async (events) => {
        sent.push(...events);
      },
    };
    setup(provider);
  });

  afterEach(() => {
    _resetAnalyticsForTests();
    _resetLevelEventsForTests();
  });

  test('start → complete：两条事件、duration_ms ≥ 0、attempt_n=1', async () => {
    trackLevelStart({ levelId: 2, mode: 'normal', loadout: ['macrophage'], seed: 99 });
    trackLevelComplete({
      stars: 3,
      hpLeft: 10,
      atpRemaining: 50,
      waveCount: 5,
      towersAtEnd: [{ type: 'macrophage', level: 2, col: 1, row: 1 }],
    });
    await flush();

    expect(sent).toHaveLength(2);
    expect(sent[0]?.event_name).toBe('level_start');
    if (sent[0]?.event_name === 'level_start') {
      expect(sent[0].props.attempt_n).toBe(1);
      expect(sent[0].props.mode).toBe('normal');
      expect(sent[0].props.loadout).toEqual(['macrophage']);
    }
    expect(sent[1]?.event_name).toBe('level_complete');
    if (sent[1]?.event_name === 'level_complete') {
      expect(sent[1].props.stars).toBe(3);
      expect(sent[1].props.duration_ms).toBeGreaterThanOrEqual(0);
      expect(sent[1].props.towers_at_end).toEqual([
        { type: 'macrophage', level: 2, col: 1, row: 1 },
      ]);
    }
  });

  test('start → fail：fail_reason / hp_at_fail 正确传递', async () => {
    trackLevelStart({ levelId: 5, mode: 'elite', loadout: ['nkcell'], seed: 7 });
    trackLevelFail({ failWave: 3, failReason: 'protected_cell_died', hpAtFail: 0 });
    await flush();

    expect(sent).toHaveLength(2);
    if (sent[1]?.event_name === 'level_fail') {
      expect(sent[1].props.fail_reason).toBe('protected_cell_died');
      expect(sent[1].props.fail_wave).toBe(3);
      expect(sent[1].props.hp_at_fail).toBe(0);
      expect(sent[1].props.mode).toBe('elite');
    }
  });

  test('start → quit：发 quit；当前阶段透传', async () => {
    trackLevelStart({ levelId: 1, mode: 'normal', loadout: [], seed: 0 });
    trackLevelQuit({ currentWave: 2, currentPhase: 'wave' });
    await flush();

    expect(sent).toHaveLength(2);
    expect(sent[1]?.event_name).toBe('level_quit');
    if (sent[1]?.event_name === 'level_quit') {
      expect(sent[1].props.current_wave).toBe(2);
      expect(sent[1].props.current_phase).toBe('wave');
    }
  });

  test('complete 后再 quit 不重复发（resolved 互斥）', async () => {
    trackLevelStart({ levelId: 1, mode: 'normal', loadout: [], seed: 0 });
    trackLevelComplete({
      stars: 2,
      hpLeft: 5,
      atpRemaining: 0,
      waveCount: 5,
      towersAtEnd: [],
    });
    trackLevelQuit({ currentWave: 5, currentPhase: 'complete' });
    await flush();

    const quitEvents = sent.filter((e) => e.event_name === 'level_quit');
    expect(quitEvents).toHaveLength(0);
    const completeEvents = sent.filter((e) => e.event_name === 'level_complete');
    expect(completeEvents).toHaveLength(1);
  });

  test('fail 后再 quit 不重复发', async () => {
    trackLevelStart({ levelId: 1, mode: 'normal', loadout: [], seed: 0 });
    trackLevelFail({ failWave: 1, failReason: 'core_died', hpAtFail: 0 });
    trackLevelQuit({ currentWave: 1, currentPhase: 'failed' });
    await flush();

    const quitEvents = sent.filter((e) => e.event_name === 'level_quit');
    expect(quitEvents).toHaveLength(0);
  });

  test('未 start 直接 complete/fail/quit 静默丢弃', async () => {
    trackLevelComplete({
      stars: 1,
      hpLeft: 1,
      atpRemaining: 0,
      waveCount: 1,
      towersAtEnd: [],
    });
    trackLevelFail({ failWave: 1, failReason: 'core_died', hpAtFail: 0 });
    trackLevelQuit({ currentWave: 1, currentPhase: 'build' });
    await flush();

    expect(sent).toHaveLength(0);
  });

  test('attempt_n 同关递增，跨关独立', async () => {
    trackLevelStart({ levelId: 1, mode: 'normal', loadout: [], seed: 0 });
    trackLevelFail({ failWave: 1, failReason: 'core_died', hpAtFail: 0 });
    trackLevelStart({ levelId: 1, mode: 'normal', loadout: [], seed: 0 });
    trackLevelStart({ levelId: 2, mode: 'normal', loadout: [], seed: 0 });
    await flush();

    const startEvents = sent.filter((e) => e.event_name === 'level_start');
    expect(startEvents).toHaveLength(3);
    if (
      startEvents[0]?.event_name === 'level_start' &&
      startEvents[1]?.event_name === 'level_start' &&
      startEvents[2]?.event_name === 'level_start'
    ) {
      expect(startEvents[0].props.attempt_n).toBe(1); // 关 1 第 1 次
      expect(startEvents[1].props.attempt_n).toBe(2); // 关 1 第 2 次
      expect(startEvents[2].props.attempt_n).toBe(1); // 关 2 第 1 次（独立计数）
    }
  });
});
