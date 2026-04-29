/**
 * 微信小游戏登录：调 jscode2session 用 wx.login() 的临时 code 换 openid/unionid。
 *
 * 文档：
 * https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/login/auth.code2Session.html
 *
 * 设计要点：
 * - **fetch 依赖注入**：默认 globalThis.fetch；测试可传 mock fetch（不污染全局）
 * - errcode 分支映射到统一异常类，让 handler 层只处理 WechatApiError 一种东西
 * - **缺 AppID/AppSecret 直接 throw**（不返回假 response 让上层猜）；config 加载层不强制
 *   有这俩字段（让 server 在没配 wx 时能正常起 H5 链路）
 */

import type { Config } from '../config';

/** jscode2session 接口的成功 + 失败响应（合体，按 errcode 分支） */
interface JsCode2SessionRaw {
  openid?: string;
  unionid?: string;
  session_key?: string;
  errcode?: number;
  errmsg?: string;
}

export interface JsCode2SessionResult {
  openid: string;
  /** 用户没有关联到开放平台 / 同主体公众号时不返回 */
  unionid?: string;
  session_key: string;
}

/**
 * 自定义异常，handler 层根据 status 决定 HTTP 响应码。
 * - 401: code 无效 / 已用过（40029）
 * - 429: 频率限制（45011）
 * - 403: 高风险用户（40226）
 * - 500: server 配置缺失 / 微信侧系统繁忙 / 其他未知 errcode
 */
export class WechatApiError extends Error {
  constructor(
    public readonly errcode: number,
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'WechatApiError';
  }
}

/** 与 globalThis.fetch 兼容的最小签名（测试可传同形 mock） */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const ENDPOINT = 'https://api.weixin.qq.com/sns/jscode2session';

/**
 * 用 wx.login() code 调 jscode2session 换 openid/unionid。
 *
 * @param code wx.login() 返回的临时 code
 * @param config server config（读 wechatAppId / wechatAppSecret）
 * @param fetchImpl 可选 fetch 实现（默认 globalThis.fetch）；单测注入 mock
 */
export async function jscode2session(
  code: string,
  config: Pick<Config, 'wechatAppId' | 'wechatAppSecret'>,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<JsCode2SessionResult> {
  if (!config.wechatAppId || !config.wechatAppSecret) {
    throw new WechatApiError(
      0,
      500,
      'wechat_not_configured',
      'WECHAT_APPID/WECHAT_APPSECRET not configured on server',
    );
  }

  const url =
    `${ENDPOINT}?appid=${encodeURIComponent(config.wechatAppId)}` +
    `&secret=${encodeURIComponent(config.wechatAppSecret)}` +
    `&js_code=${encodeURIComponent(code)}` +
    `&grant_type=authorization_code`;

  let res: Response;
  try {
    res = await fetchImpl(url);
  } catch (err) {
    throw new WechatApiError(
      -1,
      502,
      'wechat_unreachable',
      `wechat api unreachable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok) {
    throw new WechatApiError(
      -1,
      502,
      'wechat_http_error',
      `wechat api http ${res.status}`,
    );
  }

  let body: JsCode2SessionRaw;
  try {
    body = (await res.json()) as JsCode2SessionRaw;
  } catch (err) {
    throw new WechatApiError(
      -1,
      502,
      'wechat_invalid_json',
      `wechat api returned non-json: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // errcode 0 / 缺省：成功；其他统统当失败
  if (body.errcode && body.errcode !== 0) {
    throw mapWechatError(body.errcode, body.errmsg ?? 'wechat error');
  }

  if (!body.openid || !body.session_key) {
    throw new WechatApiError(
      -1,
      502,
      'wechat_invalid_response',
      'wechat api returned no openid/session_key',
    );
  }

  const result: JsCode2SessionResult = {
    openid: body.openid,
    session_key: body.session_key,
  };
  if (body.unionid && body.unionid.length > 0) {
    result.unionid = body.unionid;
  }
  return result;
}

/** 把微信 errcode 映射到 WechatApiError */
function mapWechatError(errcode: number, errmsg: string): WechatApiError {
  switch (errcode) {
    case 40029:
      // code 无效 / 已被使用 / 已过期：客户端应重新 wx.login() 再试
      return new WechatApiError(
        errcode,
        401,
        'invalid_code',
        `wechat invalid code: ${errmsg}`,
      );
    case 45011:
      // API 调用频率限制（每个用户每分钟 100 次）：客户端可适当退避后 retry
      return new WechatApiError(
        errcode,
        429,
        'rate_limited',
        `wechat rate limited: ${errmsg}`,
      );
    case 40226:
      // 高风险用户：返回 403，让前端友好提示「账号风控」
      return new WechatApiError(
        errcode,
        403,
        'high_risk_user',
        `wechat high-risk user: ${errmsg}`,
      );
    case -1:
      // 系统繁忙，让客户端 retry
      return new WechatApiError(errcode, 503, 'wechat_busy', `wechat busy: ${errmsg}`);
    default:
      return new WechatApiError(
        errcode,
        500,
        'wechat_unknown_error',
        `wechat errcode=${errcode}: ${errmsg}`,
      );
  }
}
