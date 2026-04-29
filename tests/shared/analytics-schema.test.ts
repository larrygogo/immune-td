import { describe, expect, it } from 'vitest';
import {
  ALL_EVENT_NAMES,
  AnalyticsEventInputSchema,
  PostEventsBodySchema,
} from '@immune-td/shared';

function makeEnvelope() {
  return {
    device_id: 'dev-uuid-x',
    user_id: null,
    session_id: 'L2_S99_2026-04-26T13-00-00',
    client_ts: 1_750_000_000_000,
    app_version: '0.4.0',
    platform: 'web' as const,
  };
}

describe('analytics schema · envelope', () => {
  it('合法 envelope + level_start props 通过', () => {
    const r = AnalyticsEventInputSchema.safeParse({
      ...makeEnvelope(),
      event_name: 'level_start',
      props: {
        level_id: 2,
        mode: 'normal',
        attempt_n: 1,
        loadout: ['macrophage', 'neutrophil'],
        seed: 12345,
      },
    });
    expect(r.success).toBe(true);
  });

  it('缺 device_id 失败', () => {
    const { device_id: _drop, ...noDevice } = makeEnvelope();
    const r = AnalyticsEventInputSchema.safeParse({
      ...noDevice,
      event_name: 'session_start',
      props: { is_returning: false },
    });
    expect(r.success).toBe(false);
  });

  it('缺 session_id 失败', () => {
    const { session_id: _drop, ...noSession } = makeEnvelope();
    const r = AnalyticsEventInputSchema.safeParse({
      ...noSession,
      event_name: 'session_start',
      props: { is_returning: false },
    });
    expect(r.success).toBe(false);
  });

  it('user_id 可为 null（匿名）', () => {
    const r = AnalyticsEventInputSchema.safeParse({
      ...makeEnvelope(),
      user_id: null,
      event_name: 'session_start',
      props: { is_returning: true },
    });
    expect(r.success).toBe(true);
  });

  it('user_id 字符串合法（已登录）', () => {
    const r = AnalyticsEventInputSchema.safeParse({
      ...makeEnvelope(),
      user_id: '42',
      event_name: 'session_start',
      props: { is_returning: false },
    });
    expect(r.success).toBe(true);
  });

  it('sample_rate optional 缺省合法', () => {
    const r = AnalyticsEventInputSchema.safeParse({
      ...makeEnvelope(),
      event_name: 'session_start',
      props: { is_returning: false },
    });
    expect(r.success).toBe(true);
  });

  it('sample_rate 0.2 合法', () => {
    const r = AnalyticsEventInputSchema.safeParse({
      ...makeEnvelope(),
      sample_rate: 0.2,
      event_name: 'session_start',
      props: { is_returning: false },
    });
    expect(r.success).toBe(true);
  });

  it('sample_rate 越界（> 1）失败', () => {
    const r = AnalyticsEventInputSchema.safeParse({
      ...makeEnvelope(),
      sample_rate: 1.5,
      event_name: 'session_start',
      props: { is_returning: false },
    });
    expect(r.success).toBe(false);
  });
});

describe('analytics schema · discriminatedUnion 分发正确性', () => {
  it('event_name 与 props 不匹配（level_start 配 tower_place props）失败', () => {
    const r = AnalyticsEventInputSchema.safeParse({
      ...makeEnvelope(),
      event_name: 'level_start',
      props: {
        // 这是 tower_place 的 props，level_start 不接受
        tower_type: 'macrophage',
        level_id: 2,
        wave_idx: 0,
        col: 1,
        row: 1,
        atp_at_place: 70,
      },
    });
    expect(r.success).toBe(false);
  });

  it('成功 parse 后类型 narrow 正确（level_complete props 含 stars）', () => {
    const r = AnalyticsEventInputSchema.safeParse({
      ...makeEnvelope(),
      event_name: 'level_complete',
      props: {
        level_id: 2,
        mode: 'elite',
        stars: 3,
        hp_left: 8,
        atp_remaining: 50,
        wave_count: 5,
        duration_ms: 180_000,
        towers_at_end: [{ type: 'macrophage', level: 2, col: 1, row: 1 }],
      },
    });
    expect(r.success).toBe(true);
    if (r.success && r.data.event_name === 'level_complete') {
      expect(r.data.props.stars).toBe(3);
      expect(r.data.props.mode).toBe('elite');
    }
  });

  it('未知 event_name 失败', () => {
    const r = AnalyticsEventInputSchema.safeParse({
      ...makeEnvelope(),
      event_name: 'totally_unknown_event',
      props: {},
    });
    expect(r.success).toBe(false);
  });
});

describe('analytics schema · 事件清单完整性', () => {
  it('ALL_EVENT_NAMES 含 v1 全部业务节点事件 + 进度溯源扩展（research/stars）', () => {
    expect(ALL_EVENT_NAMES.length).toBe(22);
    const expected = [
      // 会话
      'session_start',
      'session_end',
      'app_visibility',
      // Scene
      'scene_enter',
      'scene_leave',
      // 关卡
      'level_start',
      'level_complete',
      'level_fail',
      'level_quit',
      'wave_start',
      'wave_end',
      // 经济
      'tower_place',
      'tower_upgrade',
      'tower_sold',
      // 进度
      'meta_unlock',
      'loadout_change',
      'research_purchase',
      'research_reset',
      'stars_update',
      // 设置
      'setting_change',
      // 教学
      'tutorial_step',
      // 错误
      'client_error',
    ];
    for (const name of expected) {
      expect(ALL_EVENT_NAMES).toContain(name);
    }
  });
});

describe('analytics schema · 关卡事件 mode 维度', () => {
  it('level_start mode=normal 合法', () => {
    const r = AnalyticsEventInputSchema.safeParse({
      ...makeEnvelope(),
      event_name: 'level_start',
      props: {
        level_id: 2,
        mode: 'normal',
        attempt_n: 1,
        loadout: ['macrophage'],
        seed: 0,
      },
    });
    expect(r.success).toBe(true);
  });

  it('level_start mode=invalid 失败', () => {
    const r = AnalyticsEventInputSchema.safeParse({
      ...makeEnvelope(),
      event_name: 'level_start',
      props: {
        level_id: 2,
        mode: 'hardcore', // 不是 'normal' | 'elite'
        attempt_n: 1,
        loadout: [],
        seed: 0,
      },
    });
    expect(r.success).toBe(false);
  });
});

describe('analytics schema · wave 事件', () => {
  it('wave_start 合法', () => {
    const r = AnalyticsEventInputSchema.safeParse({
      ...makeEnvelope(),
      event_name: 'wave_start',
      props: {
        level_id: 2,
        wave_idx: 0,
        hp: 10,
        atp: 100,
        towers_count: 3,
      },
    });
    expect(r.success).toBe(true);
  });

  it('wave_end 合法', () => {
    const r = AnalyticsEventInputSchema.safeParse({
      ...makeEnvelope(),
      event_name: 'wave_end',
      props: {
        level_id: 2,
        wave_idx: 0,
        hp: 9,
        atp: 120,
        duration_ms: 30_000,
      },
    });
    expect(r.success).toBe(true);
  });
});

describe('analytics schema · scene 事件', () => {
  it('scene_enter 合法 + prev_scene 可 null（首次）', () => {
    const r = AnalyticsEventInputSchema.safeParse({
      ...makeEnvelope(),
      event_name: 'scene_enter',
      props: {
        scene_name: 'MainMenuScene',
        prev_scene: null,
      },
    });
    expect(r.success).toBe(true);
  });

  it('scene_leave 含 dwell_ms', () => {
    const r = AnalyticsEventInputSchema.safeParse({
      ...makeEnvelope(),
      event_name: 'scene_leave',
      props: {
        scene_name: 'MainMenuScene',
        next_scene: 'LevelSelectScene',
        dwell_ms: 5_000,
      },
    });
    expect(r.success).toBe(true);
  });
});

describe('PostEventsBody · 批量限制', () => {
  function batch(n: number) {
    return Array.from({ length: n }, () => ({
      ...makeEnvelope(),
      event_name: 'session_start' as const,
      props: { is_returning: false },
    }));
  }

  it('1 条合法', () => {
    const r = PostEventsBodySchema.safeParse({ events: batch(1) });
    expect(r.success).toBe(true);
  });

  it('100 条上限合法', () => {
    const r = PostEventsBodySchema.safeParse({ events: batch(100) });
    expect(r.success).toBe(true);
  });

  it('101 条失败（超过批量上限）', () => {
    const r = PostEventsBodySchema.safeParse({ events: batch(101) });
    expect(r.success).toBe(false);
  });

  it('0 条失败（min 1）', () => {
    const r = PostEventsBodySchema.safeParse({ events: [] });
    expect(r.success).toBe(false);
  });
});
