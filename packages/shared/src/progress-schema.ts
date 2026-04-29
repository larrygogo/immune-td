import { z } from 'zod';

/**
 * SyncableProgress 是跨前后端共享的"metaStore 子集"——跨设备同步的进度字段。
 *
 * 这里是 single source of truth：
 * - server 侧用 Zod 做运行时 validation（/api/progress PUT）
 * - 前端从 @immune-td/shared type-only import SyncableProgress type，无 runtime Zod 体积开销
 *
 * 加字段时只改这里：
 * 1. 更新 schema
 * 2. 对应 metaStore 里同步字段的 extractSyncable / INITIAL_PROGRESS / mergeRemoteIntoLocal 要同步更新
 * 3. 若语义变化，客户端 bump CURRENT_PAYLOAD_VERSION（见 src/ui/progressSync/types.ts）
 */
const TowerTypeSchema = z.enum([
  'macrophage',
  'neutrophil',
  'nkcell',
  'dendritic',
  'mitochondria',
]);
const StarSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const SyncableProgressSchema = z.object({
  unlockedLevels: z.array(z.number().int().nonnegative()).max(256),
  unlockedTowers: z.array(TowerTypeSchema).max(16),
  stars: z.record(z.string().regex(/^\d+$/), StarSchema),
  /** 精英模式星数（v12 加）。与 stars 同 shape，per-level 独立 max 语义合并。
   *  default({}) 让老客户端 PUT 不带此字段时也通过验证（向后兼容）。 */
  eliteStars: z.record(z.string().regex(/^\d+$/), StarSchema).default({}),
  loadout: z.array(TowerTypeSchema).max(8),
  seenMechanics: z.array(z.string().min(1).max(64)).max(64),
  researchPoints: z.number().int().nonnegative().max(1_000_000),
  unlockedResearch: z.array(z.string().min(1).max(64)).max(256),
  /** 研究重置次数（v11 加）。规则：首次免费，后续每次扣 1 RP */
  researchResetCount: z.number().int().nonnegative().max(10_000),
  tutorialStep: z.number().int().gte(-1).lte(32),
  /** 商城信用点余额（v13 加）。default 让老客户端 PUT 不带也兼容 */
  credits: z.number().int().nonnegative().max(1_000_000).default(0),
  /** 每塔已解锁皮肤 id 列表（不含 default）。default {} 让老客户端兼容 */
  unlockedSkins: z.record(TowerTypeSchema, z.array(z.string().min(1).max(64)).max(32)).default({}),
  /** 每塔装备的皮肤 id；缺失视为 'default' */
  equippedSkins: z.record(TowerTypeSchema, z.string().min(1).max(64)).default({}),
});
export type SyncableProgress = z.infer<typeof SyncableProgressSchema>;

export const PutProgressSchema = z.object({
  progress: SyncableProgressSchema,
  payloadVersion: z.number().int().positive(),
});
export type PutProgressBody = z.infer<typeof PutProgressSchema>;
