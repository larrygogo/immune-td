import { z } from 'zod';

export const UsernameSchema = z.string().regex(/^[a-zA-Z0-9_-]{3,32}$/, {
  message: 'username must be 3-32 chars of a-z A-Z 0-9 _ -',
});

export const PasswordSchema = z
  .string()
  .min(8, { message: 'password must be at least 8 chars' })
  .regex(/[a-zA-Z0-9]/, { message: 'password must contain letter or digit' });

export const RegisterBody = z.object({
  username: UsernameSchema,
  password: PasswordSchema,
});

export const LoginBody = z.object({
  username: UsernameSchema,
  // login 不校验复杂度（已注册的可能不符合新规）
  password: z.string().min(1),
});

/**
 * 微信小游戏登录入参：仅 wx.login() 返回的临时 code。
 * code 由 server 调 jscode2session 换 openid/unionid（不暴露给前端）。
 */
export const WechatLoginBody = z.object({
  code: z.string().min(1).max(200),
});

/**
 * 微信小游戏强登录扩展：用户授权 userInfo 后 PUT 昵称 + 头像 URL。
 * - nickname：wx 端 max 32（实际后端再放 64 容错；不允许空字符串）
 * - avatar：wx 头像签名 URL 长度可达 ~800，给 2048 留余量
 */
export const WechatBindUserInfoBody = z.object({
  nickname: z.string().min(1).max(64),
  avatar: z.string().min(1).max(2048),
});

export type RegisterBody = z.infer<typeof RegisterBody>;
export type LoginBody = z.infer<typeof LoginBody>;
export type WechatLoginBody = z.infer<typeof WechatLoginBody>;
export type WechatBindUserInfoBody = z.infer<typeof WechatBindUserInfoBody>;

/**
 * H5 玩家昵称（spec § 3.3）：4-8 字符，中英数字 + 下划线 + 汉字。
 * 汉字按 1 字符计 —— JS 引擎对 BMP 内 CJK Unified Ideographs 字符串 length 就是 1,
 * 直接用正则 + 长度限制即可。
 */
export const NicknameSchema = z.string().regex(
  /^[a-zA-Z0-9_一-龥]{4,8}$/,
  { message: 'nickname must be 4-8 chars of letters/digits/_/Chinese' },
);

export const SetNicknameBody = z.object({ nickname: NicknameSchema });
export type SetNicknameBody = z.infer<typeof SetNicknameBody>;

// Session 录制 body（session-recorder.ts 前端同形，必须严格约束防异常 payload 打爆 DB）
export const SessionRecordingSchema = z.object({
  version: z.literal(1),
  sessionId: z.string().min(1).max(200),
  levelId: z.number().int().min(0).max(1000),
  seed: z.number().int(),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  endTick: z.number().int().optional(),
  actions: z
    .array(
      z.object({
        tick: z.number().int(),
        type: z.enum(['placeTower', 'upgradeTower', 'sellTower', 'startWave', 'setSpeed']),
        args: z.record(z.unknown()),
        ok: z.boolean(),
        error: z.string().optional(),
      }),
    )
    .max(10000),
  summary: z
    .object({
      outcome: z.enum(['won', 'lost', 'aborted']),
      finalHp: z.number(),
      finalAtp: z.number(),
      waveReached: z.number(),
      stars: z.number().optional(),
    })
    .optional(),
});

export type SessionRecordingBody = z.infer<typeof SessionRecordingSchema>;

// BugReport 比 session 宽松，只校验基础字段 + 整 payload 透明存
export const BugReportSchema = z
  .object({
    ts: z.string().optional(),
    levelId: z.number().int().nullable().optional(),
    seed: z.number().int().nullable().optional(),
    phase: z.string().max(64).nullable().optional(),
  })
  .passthrough(); // 其他字段任意

// SyncableProgress / PutProgressSchema 的 single source of truth 在 @immune-td/shared 包。
// 前端 type-only import 同一份定义。
export {
  SyncableProgressSchema,
  PutProgressSchema,
  type SyncableProgress,
  type PutProgressBody,
} from '@immune-td/shared';

// ---------------------------------------------------------------------------
// 邮件系统（migration 006，spec 2026-04-28-mailbox-system-design.md § 2.3）
// ---------------------------------------------------------------------------

/**
 * 奖励 schema：三种字段都可选。
 * - credits / stars 数值非负
 * - unlockTower 在 server 端不强校验 TOWER_REGISTRY（registry 是 client 资产）；
 *   只校验非空字符串，client 领取时若 TowerType 未知则忽略该字段。
 *
 * 至少一个字段非 undefined（空 rewards 用 null / 不传，不能传 `{}`）。
 */
export const RewardSchema = z
  .object({
    credits: z.number().int().nonnegative().optional(),
    unlockTower: z.string().min(1).max(64).optional(),
    stars: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine(
    (v) => v.credits !== undefined || v.unlockTower !== undefined || v.stars !== undefined,
    { message: 'rewards must have at least one of credits / unlockTower / stars' },
  );

export type Reward = z.infer<typeof RewardSchema>;

/**
 * admin 发邮件的 body：
 * - broadcast=true 与 targetUserId 互斥；二者必须恰好一个生效
 * - rewards 可选；空 rewards 直接不传字段（undefined）
 * - expiresInDays 默认 30（spec § 2.4）；最长 365 防 admin 误填
 */
export const SendMailBody = z
  .object({
    subject: z.string().min(1).max(100),
    content: z.string().min(1).max(4000),
    rewards: RewardSchema.optional(),
    broadcast: z.boolean().optional(),
    targetUserId: z.number().int().positive().optional(),
    expiresInDays: z.number().int().positive().max(365).optional(),
  })
  .strict()
  .refine(
    (v) => Boolean(v.broadcast) !== (typeof v.targetUserId === 'number'),
    { message: 'must provide exactly one of broadcast=true or targetUserId' },
  );

export type SendMailBody = z.infer<typeof SendMailBody>;

// ---------------------------------------------------------------------------
// 公告系统（migration 007，spec 2026-04-28-announcement-system-design.md）
// ---------------------------------------------------------------------------

/** admin 发公告 body：title + content + 可选 priority + 可选 expiresInDays */
export const SendAnnouncementBody = z
  .object({
    title: z.string().min(1).max(100),
    content: z.string().min(1).max(4000),
    priority: z.number().int().min(0).max(1000).optional(),
    expiresInDays: z.number().int().positive().max(365).optional(),
  })
  .strict();

export type SendAnnouncementBody = z.infer<typeof SendAnnouncementBody>;
