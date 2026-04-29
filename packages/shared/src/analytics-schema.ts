import { z } from 'zod';

/**
 * 通用埋点事件 schema（前后端共享）。
 *
 * single source of truth：
 * - server 侧用 Zod 校验 POST /api/events 的 body
 * - 前端 type-only import：`import type { AnalyticsEventInput, EventName } from '@immune-td/shared'`，
 *   零 runtime Zod 体积开销
 *
 * 加事件流程：
 * 1. 在下方 props 区加 `XxxProps` schema
 * 2. 在 `EVENT_VARIANTS` 加 `{ event_name: 'xxx', props: XxxProps }` 一行
 * 3. discriminatedUnion 自动收纳，前端 `track('xxx', {...})` 编译期就能校验 props 形状
 *
 * 设计原则（详见 docs/superpowers/specs/2026-04-26-analytics-design.md §四）：
 * - 事件 props 自包含足够上下文，避免分析时要 join 多张表
 * - 强类型，前后端共享同一 source
 * - props 大小 < 4KB（schema 不做硬限，由 server 入库时 byteLength 检查）
 * - schema 中立：props 在 server 用 TEXT JSON 字符串存，不依赖 SQLite JSON1 函数
 *
 * 本文件 v1 仅含 A 类「业务节点」19 个事件；B 类「UI 交互」事件在 plan Task 8 扩展时加入。
 */

// ---- Envelope 共享字段 ----

const PlatformSchema = z.enum(['web', 'wx']);

/**
 * 客户端发送时不带 id / server_ts；server 入库时补齐。
 * sample_rate optional：业务节点默认 1.0；高频事件由客户端 sampler 注入实际生效率。
 */
const EnvelopeBaseInput = z.object({
  device_id: z.string().min(1).max(128),
  user_id: z.string().min(1).max(64).nullable(),
  session_id: z.string().min(1).max(128),
  client_ts: z.number().int().nonnegative(),
  app_version: z.string().min(1).max(32),
  platform: PlatformSchema,
  sample_rate: z.number().min(0).max(1).optional(),
});

const EnvelopeBaseRecord = EnvelopeBaseInput.extend({
  id: z.string().min(1).max(64), // ULID
  server_ts: z.number().int().nonnegative(),
  // record 中 sample_rate 必填（server 入库时补默认 1.0）
  sample_rate: z.number().min(0).max(1),
});

// ---- 共享小 schema ----

const ModeSchema = z.enum(['normal', 'elite']);
const PhaseSchema = z.enum(['build', 'wave', 'complete', 'failed']);
const VisibilitySchema = z.enum(['visible', 'hidden']);
const StarSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const LoadoutEntry = z.string().min(1).max(32);
const TowerSnapshot = z.object({
  type: z.string().min(1).max(32),
  level: z.number().int().min(1).max(3),
  col: z.number().int().nonnegative(),
  row: z.number().int().nonnegative(),
});

// ---- A 类：业务节点 props（spec §4.2-A，19 事件）----

// 会话 (3)
const SessionStartProps = z.object({
  is_returning: z.boolean(),
});

const SessionEndProps = z.object({
  duration_ms: z.number().int().nonnegative(),
  scene_at_end: z.string().min(1).max(64),
});

const AppVisibilityProps = z.object({
  state: VisibilitySchema,
  scene_at_change: z.string().min(1).max(64),
});

// Scene (2)
const SceneEnterProps = z.object({
  scene_name: z.string().min(1).max(64),
  prev_scene: z.string().max(64).nullable(),
});

const SceneLeaveProps = z.object({
  scene_name: z.string().min(1).max(64),
  next_scene: z.string().max(64).nullable(),
  dwell_ms: z.number().int().nonnegative(),
});

// 关卡 (6)
const LevelStartProps = z.object({
  level_id: z.number().int().nonnegative(),
  mode: ModeSchema,
  attempt_n: z.number().int().min(1),
  loadout: z.array(LoadoutEntry).max(8),
  seed: z.number(),
});

const LevelCompleteProps = z.object({
  level_id: z.number().int().nonnegative(),
  mode: ModeSchema,
  stars: StarSchema,
  hp_left: z.number().int().nonnegative(),
  atp_remaining: z.number().int().nonnegative(),
  wave_count: z.number().int().nonnegative(),
  duration_ms: z.number().int().nonnegative(),
  towers_at_end: z.array(TowerSnapshot).max(64),
});

const LevelFailProps = z.object({
  level_id: z.number().int().nonnegative(),
  mode: ModeSchema,
  fail_wave: z.number().int().nonnegative(),
  fail_reason: z.enum(['core_died', 'protected_cell_died']),
  hp_at_fail: z.number().int(),
});

const LevelQuitProps = z.object({
  level_id: z.number().int().nonnegative(),
  mode: ModeSchema,
  current_wave: z.number().int().nonnegative(),
  current_phase: PhaseSchema,
});

const WaveStartProps = z.object({
  level_id: z.number().int().nonnegative(),
  wave_idx: z.number().int().nonnegative(),
  hp: z.number().int().nonnegative(),
  atp: z.number().int().nonnegative(),
  towers_count: z.number().int().nonnegative(),
});

const WaveEndProps = z.object({
  level_id: z.number().int().nonnegative(),
  wave_idx: z.number().int().nonnegative(),
  hp: z.number().int().nonnegative(),
  atp: z.number().int().nonnegative(),
  duration_ms: z.number().int().nonnegative(),
});

// 经济 (3)
const TowerPlaceProps = z.object({
  tower_type: z.string().min(1).max(32),
  level_id: z.number().int().nonnegative(),
  wave_idx: z.number().int().nonnegative(),
  col: z.number().int().nonnegative(),
  row: z.number().int().nonnegative(),
  atp_at_place: z.number().int().nonnegative(),
});

const TowerUpgradeProps = z.object({
  tower_id: z.string().min(1).max(64),
  tower_type: z.string().min(1).max(32),
  from_level: z.union([z.literal(1), z.literal(2)]),
  to_level: z.union([z.literal(2), z.literal(3)]),
  atp_at_upgrade: z.number().int().nonnegative(),
});

const TowerSoldProps = z.object({
  tower_id: z.string().min(1).max(64),
  tower_type: z.string().min(1).max(32),
  total_invested: z.number().int().nonnegative(),
  refund: z.number().int().nonnegative(),
  reason: z.enum(['manual', 'destroyed']),
});

// 进度 (2)
const MetaUnlockProps = z.object({
  type: z.enum(['level', 'tower', 'research']),
  id: z.string().min(1).max(64),
});

const LoadoutChangeProps = z.object({
  level_id: z.number().int().nonnegative(),
  loadout_before: z.array(LoadoutEntry).max(8),
  loadout_after: z.array(LoadoutEntry).max(8),
});

// 进度溯源扩展 (3)：研究花费 / 重置 / 星数更新
// 单独事件而非复用 meta_unlock，是因为审计要求 before/after 数值（花了多少 RP / 退多少）
const ResearchPurchaseProps = z.object({
  id: z.string().min(1).max(64),
  cost: z.number().int().nonnegative(),
  rp_before: z.number().int().nonnegative(),
  rp_after: z.number().int().nonnegative(),
});

const ResearchResetProps = z.object({
  // 第一次重置免费 cost=0，之后 cost=1
  cost: z.number().int().nonnegative(),
  refund: z.number().int().nonnegative(),
  removed_ids: z.array(z.string().min(1).max(64)).max(64),
  rp_before: z.number().int().nonnegative(),
  rp_after: z.number().int().nonnegative(),
});

const StarsUpdateProps = z.object({
  level_id: z.number().int().nonnegative(),
  mode: ModeSchema,
  stars_before: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  stars_after: StarSchema,
});

// 设置 (1)
const SettingChangeProps = z.object({
  key: z.string().min(1).max(64),
  value_before: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  value_after: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

// 教学 (1)
const TutorialStepProps = z.object({
  step_index: z.number().int().nonnegative(),
  step_name: z.string().min(1).max(64),
  action: z.enum(['shown', 'completed', 'skipped']),
});

// 错误 (1)
const ClientErrorProps = z.object({
  message: z.string().min(1).max(512),
  stack_top: z.string().max(4096).optional(),
  scene_name: z.string().max(64).optional(),
});

// ---- discriminatedUnion ----

const EVENT_VARIANTS = [
  // 会话
  z.object({ event_name: z.literal('session_start'), props: SessionStartProps }),
  z.object({ event_name: z.literal('session_end'), props: SessionEndProps }),
  z.object({ event_name: z.literal('app_visibility'), props: AppVisibilityProps }),
  // Scene
  z.object({ event_name: z.literal('scene_enter'), props: SceneEnterProps }),
  z.object({ event_name: z.literal('scene_leave'), props: SceneLeaveProps }),
  // 关卡
  z.object({ event_name: z.literal('level_start'), props: LevelStartProps }),
  z.object({ event_name: z.literal('level_complete'), props: LevelCompleteProps }),
  z.object({ event_name: z.literal('level_fail'), props: LevelFailProps }),
  z.object({ event_name: z.literal('level_quit'), props: LevelQuitProps }),
  z.object({ event_name: z.literal('wave_start'), props: WaveStartProps }),
  z.object({ event_name: z.literal('wave_end'), props: WaveEndProps }),
  // 经济
  z.object({ event_name: z.literal('tower_place'), props: TowerPlaceProps }),
  z.object({ event_name: z.literal('tower_upgrade'), props: TowerUpgradeProps }),
  z.object({ event_name: z.literal('tower_sold'), props: TowerSoldProps }),
  // 进度
  z.object({ event_name: z.literal('meta_unlock'), props: MetaUnlockProps }),
  z.object({ event_name: z.literal('loadout_change'), props: LoadoutChangeProps }),
  z.object({ event_name: z.literal('research_purchase'), props: ResearchPurchaseProps }),
  z.object({ event_name: z.literal('research_reset'), props: ResearchResetProps }),
  z.object({ event_name: z.literal('stars_update'), props: StarsUpdateProps }),
  // 设置
  z.object({ event_name: z.literal('setting_change'), props: SettingChangeProps }),
  // 教学
  z.object({ event_name: z.literal('tutorial_step'), props: TutorialStepProps }),
  // 错误
  z.object({ event_name: z.literal('client_error'), props: ClientErrorProps }),
] as const;

const EventDiscriminatedUnion = z.discriminatedUnion('event_name', [
  EVENT_VARIANTS[0],
  EVENT_VARIANTS[1],
  ...EVENT_VARIANTS.slice(2),
]);

/** 客户端 track() 调用产生的事件（envelope + 强类型 props，无 server-side 字段） */
export const AnalyticsEventInputSchema = z.intersection(EnvelopeBaseInput, EventDiscriminatedUnion);
export type AnalyticsEventInput = z.infer<typeof AnalyticsEventInputSchema>;

/** server 入库后的完整事件（补齐 id + server_ts + sample_rate 默认值） */
export const AnalyticsEventRecordSchema = z.intersection(
  EnvelopeBaseRecord,
  EventDiscriminatedUnion,
);
export type AnalyticsEventRecord = z.infer<typeof AnalyticsEventRecordSchema>;

/** 所有事件名联合（编译期类型安全） */
export type EventName = z.infer<typeof EventDiscriminatedUnion>['event_name'];

/** v1 事件名清单（运行时枚举，给 server 路由 / dev 工具用） */
export const ALL_EVENT_NAMES: readonly EventName[] = EVENT_VARIANTS.map(
  (v) => v.shape.event_name.value,
);

/** POST /api/events 的 body schema（最多 100 条/批，对应 spec §6.2） */
export const PostEventsBodySchema = z.object({
  events: z.array(AnalyticsEventInputSchema).min(1).max(100),
});
export type PostEventsBody = z.infer<typeof PostEventsBodySchema>;
