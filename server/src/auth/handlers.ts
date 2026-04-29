import type { Database } from 'bun:sqlite';
import { type Context, Hono } from 'hono';
import type { Config } from '../config';
import { AppError } from '../errors';
import { requireAuth } from '../middleware/auth';
import {
  NicknameTakenError,
  type UserRow,
  bindWechatUserInfo,
  createUser,
  createWechatUser,
  findById,
  findByUsername,
  findByWechatOpenid,
  findByWechatUnionid,
  setNickname,
  touchLastLogin,
} from '../models/user';
import {
  LoginBody,
  RegisterBody,
  SetNicknameBody,
  WechatBindUserInfoBody,
  WechatLoginBody,
} from '../schemas';
import { hashPassword, verifyPassword } from './password';
import { createToken, revokeToken } from './token';
import { type FetchLike, WechatApiError, jscode2session } from './wechat';

/** 玩家昵称改名冷却（spec § 4：首次设置后 7 天才能再次修改） */
const NICKNAME_COOLDOWN_SEC = 7 * 86_400;

/**
 * authRouter 选项：测试可注入 mock fetch 给 wechat-login 链路用，避免真调真微信 API。
 */
export interface AuthRouterOptions {
  wechatFetch?: FetchLike;
}

/**
 * 统一序列化 user 给响应体用：所有登录 / me / 改名端点都用这个 helper，
 * 保证前端 AuthUser shape 一致（含 nickname / nickname_set_at / wechat_*）。
 */
export function serializeUser(row: {
  id: number;
  username: string;
  role: 'player' | 'admin';
  nickname?: string | null;
  nickname_set_at?: string | null;
  wechat_nickname?: string | null;
  wechat_avatar?: string | null;
}) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    nickname: row.nickname ?? null,
    nickname_set_at: row.nickname_set_at ?? null,
    wechat_nickname: row.wechat_nickname ?? null,
    wechat_avatar: row.wechat_avatar ?? null,
  };
}

export function authRouter(db: Database, cfg: Config, options: AuthRouterOptions = {}): Hono {
  const r = new Hono();

  r.post('/register', async (c) => {
    const body = RegisterBody.parse(await c.req.json());
    if (findByUsername(db, body.username)) {
      throw new AppError(409, 'username_taken', 'username already taken');
    }
    const hash = await hashPassword(body.password);
    const id = createUser(db, body.username, hash, 'player');
    const ua = c.req.header('user-agent') ?? null;
    const ip = clientIp(c);
    const token = createToken(db, id, cfg.tokenTtlDays, ua, ip);
    return c.json({
      token,
      user: serializeUser({
        id,
        username: body.username,
        role: 'player',
        nickname: null,
        nickname_set_at: null,
        wechat_nickname: null,
        wechat_avatar: null,
      }),
    });
  });

  r.post('/login', async (c) => {
    const body = LoginBody.parse(await c.req.json());
    const row = findByUsername(db, body.username);
    if (!row || !(await verifyPassword(row.password_hash, body.password))) {
      throw new AppError(401, 'invalid_credentials', 'invalid username or password');
    }
    touchLastLogin(db, row.id);
    const ua = c.req.header('user-agent') ?? null;
    const ip = clientIp(c);
    const token = createToken(db, row.id, cfg.tokenTtlDays, ua, ip);
    return c.json({ token, user: serializeUser(row) });
  });

  /**
   * 微信小游戏登录：
   * 1. parse `code`（来自 wx.login()）
   * 2. 调 jscode2session 拿 openid/unionid
   * 3. findOrCreate 顺序：unionid → openid → create
   *    （unionid 跨小程序/公众号稳定，命中优先级高于 openid）
   * 4. 签 token，返回与 /login 同形 `{ token, user: { id, username, role } }`
   */
  r.post('/wechat-login', async (c) => {
    const body = WechatLoginBody.parse(await c.req.json());

    let session: Awaited<ReturnType<typeof jscode2session>>;
    try {
      session = await jscode2session(body.code, cfg, options.wechatFetch);
    } catch (err) {
      if (err instanceof WechatApiError) {
        throw new AppError(err.status, err.code, err.message);
      }
      throw err;
    }

    // findOrCreate：unionid 优先（跨小程序/公众号稳定），fallback openid，再 fallback 创建
    let user: UserRow | null = null;
    if (session.unionid) {
      user = findByWechatUnionid(db, session.unionid);
    }
    if (!user) {
      user = findByWechatOpenid(db, session.openid);
    }
    if (!user) {
      const createParams: { openid: string; unionid?: string } = { openid: session.openid };
      if (session.unionid) createParams.unionid = session.unionid;
      user = await createWechatUser(db, createParams);
    }

    touchLastLogin(db, user.id);
    const ua = c.req.header('user-agent') ?? null;
    const ip = clientIp(c);
    const token = createToken(db, user.id, cfg.tokenTtlDays, ua, ip);
    return c.json({ token, user: serializeUser(user) });
  });

  /**
   * 微信小游戏强登录扩展：用户在 BootScene 通过 `wx.createUserInfoButton`
   * user gesture 拿到 userInfo 后 POST 上来回填。spec § 12.1 要求：
   *   - 必须已登录（requireAuth）
   *   - body: { nickname, avatar } 都非空
   *   - 幂等：每次直接 update（重新授权可能换头像）
   * 返回更新后的 user（含 wechat_nickname / wechat_avatar）让前端立刻刷新本地态。
   */
  r.post('/wechat-bind-userinfo', requireAuth, async (c) => {
    const body = WechatBindUserInfoBody.parse(await c.req.json());
    // requireAuth 已保证非 null
    const authUser = c.var.user;
    if (!authUser) throw new AppError(401, 'unauthorized', 'authentication required');
    const updated = bindWechatUserInfo(db, authUser.id, body.nickname, body.avatar);
    return c.json({ user: serializeUser(updated) });
  });

  /**
   * H5 玩家昵称设置（spec § 4）：首次设置 / 改名共用此端点。
   *
   * 业务规则：
   * - 已登录（requireAuth）+ Zod 校验 nickname 格式（4-8 字符 / 中英数下划线）
   * - 当前 nickname 不为空 + nickname_set_at 距今 < 7 天 → 429 cooldown，body 含 retryAfterSec
   * - 写入撞 UNIQUE → 409 nickname_taken
   * - 成功返回 serialize 后的完整 user
   */
  r.post('/nickname', requireAuth, async (c) => {
    const body = SetNicknameBody.parse(await c.req.json());
    const authUser = c.var.user;
    if (!authUser) throw new AppError(401, 'unauthorized', 'authentication required');

    // authUser 是 token middleware 缓存的 AuthUserRow，nickname / nickname_set_at 字段已在 Task 1 加进 SELECT
    if (authUser.nickname && authUser.nickname.length > 0) {
      const setAtStr = authUser.nickname_set_at;
      if (setAtStr) {
        // SQLite datetime('now') 返回 'YYYY-MM-DD HH:MM:SS'，按 UTC 解析
        const setAtMs = new Date(`${setAtStr.replace(' ', 'T')}Z`).getTime();
        const elapsedSec = Math.floor((Date.now() - setAtMs) / 1000);
        if (elapsedSec < NICKNAME_COOLDOWN_SEC) {
          const retryAfterSec = NICKNAME_COOLDOWN_SEC - elapsedSec;
          c.header('Retry-After', String(retryAfterSec));
          return c.json(
            {
              error: 'nickname_change_cooldown',
              message: '昵称冷却中',
              retryAfterSec,
            },
            429,
          );
        }
      }
    }

    try {
      setNickname(db, authUser.id, body.nickname);
    } catch (e) {
      if (e instanceof NicknameTakenError) {
        throw new AppError(409, 'nickname_taken', '昵称已被占用');
      }
      throw e;
    }

    // 重新查一遍拿最新 nickname / nickname_set_at（避免再 round-trip 拼装）
    const updated = findById(db, authUser.id);
    if (!updated) throw new AppError(500, 'internal', 'user vanished after update');
    return c.json({ user: serializeUser(updated) });
  });

  r.post('/logout', async (c) => {
    // 只能通过 token 注销自己那一条（不知道当前 token 的话连 logout 都没意义）
    const header = c.req.header('authorization');
    if (header?.toLowerCase().startsWith('bearer ')) {
      const token = header.slice(7).trim();
      if (token) revokeToken(db, token);
    }
    return c.body(null, 204);
  });

  return r;
}

/** 反代场景：优先 X-Forwarded-For 首段，次选 X-Real-IP */
function clientIp(c: Context): string | null {
  const xff = c.req.header('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return c.req.header('x-real-ip') ?? null;
}
