import type { Database } from 'bun:sqlite';
import { hash as argonHash } from '@node-rs/argon2';

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: 'player' | 'admin';
  created_at: string;
  last_login_at: string | null;
  wechat_openid: string | null;
  wechat_unionid: string | null;
  /** migration 005：wx 用户授权 userInfo 后回填（H5 / 未授权一直 NULL） */
  wechat_nickname: string | null;
  /** migration 005：wx avatarUrl（不下载到 server，原样存） */
  wechat_avatar: string | null;
  /** migration 008：H5 玩家昵称（仅 H5 流程使用，wx 端永远 NULL） */
  nickname: string | null;
  /** migration 008：nickname 首次设置 + 每次改名都刷新（ISO datetime） */
  nickname_set_at: string | null;
}

export function findByUsername(db: Database, username: string): UserRow | null {
  const row = db
    .query('SELECT * FROM users WHERE username = ? COLLATE NOCASE')
    .get(username) as UserRow | null;
  return row ?? null;
}

/** 按主键查 user；找不到返回 null。 */
export function findById(db: Database, id: number): UserRow | null {
  const row = db.query('SELECT * FROM users WHERE id = ?').get(id) as UserRow | null;
  return row ?? null;
}

export function createUser(
  db: Database,
  username: string,
  passwordHash: string,
  role: 'player' | 'admin' = 'player',
): number {
  const res = db
    .query('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
    .run(username, passwordHash, role);
  return Number(res.lastInsertRowid);
}

export function touchLastLogin(db: Database, userId: number): void {
  db.query(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).run(userId);
}

export function countUsers(db: Database): number {
  const row = db.query('SELECT COUNT(*) as c FROM users').get() as { c: number };
  return row.c;
}

// ---------------------------------------------------------------------------
// 微信小游戏登录支持（migration 004）
// ---------------------------------------------------------------------------

export function findByWechatOpenid(db: Database, openid: string): UserRow | null {
  const row = db.query('SELECT * FROM users WHERE wechat_openid = ?').get(openid) as UserRow | null;
  return row ?? null;
}

export function findByWechatUnionid(db: Database, unionid: string): UserRow | null {
  const row = db
    .query('SELECT * FROM users WHERE wechat_unionid = ?')
    .get(unionid) as UserRow | null;
  return row ?? null;
}

/**
 * 创建微信用户。
 *
 * 设计要点：
 * - username 自动派生，**不暴露 openid 全文**（只取前 8 位 + 时间戳后 6 位 + 32B 随机
 *   后缀）。这样能保证：
 *   1. 满足现有 username UNIQUE COLLATE NOCASE 约束（前 8 位冲突也被尾部随机化解）
 *   2. 满足 UsernameSchema 正则（^[a-zA-Z0-9_-]{3,32}$，长度上限 32）
 *   3. 不让 openid 被前端 / 其他 user 在 username 字段里看到
 * - password_hash 写一段随机 32B 的 argon2 哈希，永不会通过 username/password 登录命中。
 *   这样不动现有 NOT NULL 约束、对历史 schema 友好；语义上也符合「wx 用户没有密码」。
 */
export async function createWechatUser(
  db: Database,
  params: { openid: string; unionid?: string | null },
): Promise<UserRow> {
  const { openid, unionid } = params;
  const username = generateWechatUsername(openid);
  const placeholderHash = await argonHash(generateRandomToken(32));

  // exactOptionalPropertyTypes 兼容（虽然 server tsconfig 没开，但写法保持一致）
  const unionidValue = unionid && unionid.length > 0 ? unionid : null;

  const res = db
    .query(
      `INSERT INTO users (username, password_hash, role, wechat_openid, wechat_unionid)
       VALUES (?, ?, 'player', ?, ?)`,
    )
    .run(username, placeholderHash, openid, unionidValue);

  const id = Number(res.lastInsertRowid);
  const row = db.query('SELECT * FROM users WHERE id = ?').get(id) as UserRow | null;
  if (!row) throw new Error('createWechatUser: row not found after insert');
  return row;
}

/**
 * 回填 wx 用户的昵称 + 头像 URL（spec § 12.1 强登录无匿名 → 必授权）。
 *
 * 调用方：`/api/auth/wechat-bind-userinfo` 路由（已登录用户在 BootScene 通过
 * `wx.createUserInfoButton` user gesture 拿到 userInfo 后 PUT 上来）。
 *
 * 幂等：每次 update 直接覆盖（用户重新授权可能换头像）。
 * 返回更新后的 row（与 findBy* 同形）；找不到 user 抛错（路由层不该出现）。
 */
export function bindWechatUserInfo(
  db: Database,
  userId: number,
  nickname: string,
  avatar: string,
): UserRow {
  db.query('UPDATE users SET wechat_nickname = ?, wechat_avatar = ? WHERE id = ?').run(
    nickname,
    avatar,
    userId,
  );
  const row = db.query('SELECT * FROM users WHERE id = ?').get(userId) as UserRow | null;
  if (!row) throw new Error(`bindWechatUserInfo: user ${userId} not found after update`);
  return row;
}

/** 生成 wx_ 开头、保证唯一的 username（详见 createWechatUser 注释） */
function generateWechatUsername(openid: string): string {
  // openid 通常 28 字符；取前 8 位作为可视前缀（仅用于运维区分，不暴露完整 openid）
  const prefix = openid.slice(0, 8).replace(/[^a-zA-Z0-9_-]/g, '');
  // 时间戳后 6 位（毫秒）作为时序前缀
  const ts = Date.now().toString(36).slice(-6);
  // 4 字节随机后缀（base36，最长 7 字符）防同毫秒并发碰撞
  const rand = Math.random().toString(36).slice(2, 8);
  // 形如 wx_aBcDeF12_l9k0xy_a8b3 → 22-30 字符，符合 UsernameSchema 上限 32
  return `wx_${prefix}_${ts}_${rand}`.slice(0, 32);
}

/** 生成 N 字节的 base64url 随机串（仅供 argon2 占位 hash 用） */
function generateRandomToken(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Buffer.from(buf).toString('base64url');
}

// ---------------------------------------------------------------------------
// migration 008：H5 玩家昵称（spec § 3.2）
// ---------------------------------------------------------------------------

/** setNickname 撞 UNIQUE 时抛此错；handlers 层捕获后转 409 nickname_taken */
export class NicknameTakenError extends Error {
  constructor() {
    super('nickname already taken');
    this.name = 'NicknameTakenError';
  }
}

/**
 * 仅供测试 / admin 排查 —— 业务路径**不要**先 findByNickname 再 setNickname，
 * 直接 setNickname 让 SQLite UNIQUE 撞错避免 TOCTOU race（详见 setNickname 注释）。
 */
export function findByNickname(db: Database, nickname: string): UserRow | null {
  const row = db
    .query('SELECT * FROM users WHERE nickname = ? COLLATE NOCASE')
    .get(nickname) as UserRow | null;
  return row ?? null;
}

/**
 * 写入 nickname + 刷新 nickname_set_at 为 datetime('now')。
 *
 * 撞 UNIQUE（同 nickname 大小写不敏感命中）抛 `NicknameTakenError`；
 * 路由层捕获后转 `AppError(409, 'nickname_taken')`。
 *
 * 不预查 findByNickname —— 直接 UPDATE 让 SQLite 报 SQLITE_CONSTRAINT_UNIQUE，
 * 避免 TOCTOU race（两个并发提交都 select 不到再都 insert 的窗口）。
 */
export function setNickname(db: Database, userId: number, nickname: string): void {
  try {
    db.query("UPDATE users SET nickname = ?, nickname_set_at = datetime('now') WHERE id = ?").run(
      nickname,
      userId,
    );
  } catch (e) {
    if (isUniqueConstraintError(e)) throw new NicknameTakenError();
    throw e;
  }
}

function isUniqueConstraintError(e: unknown): boolean {
  // bun:sqlite SqliteError 形如 { errno, code: 'SQLITE_CONSTRAINT_UNIQUE', ... }
  // 兼容性：fallback 用 message 包含 'UNIQUE constraint' 判断
  if (!e || typeof e !== 'object') return false;
  const err = e as { code?: string; message?: string };
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return true;
  if (typeof err.message === 'string' && err.message.includes('UNIQUE constraint')) return true;
  return false;
}
