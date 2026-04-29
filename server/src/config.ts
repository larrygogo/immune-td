export interface Config {
  databaseUrl: string;
  bindHost: string;
  bindPort: number;
  corsAllowedOrigins: string[];
  tokenTtlDays: number;
  anonRetentionDays: number;
  bodyLimitKb: number;
  initialAdminUsername: string | null;
  initialAdminPassword: string | null;
  logLevel: string;
  /** 微信小游戏 AppID；未配置时 wechat-login 会返回 500 + 明确错误 */
  wechatAppId: string | null;
  /** 微信小游戏 AppSecret；只在 server 端用（调 jscode2session） */
  wechatAppSecret: string | null;
}

/**
 * 解析数字 env：不设 → fallback；设为非法值 → 抛错（防 BIND_PORT=abc 这种静默 NaN
 * 被 Bun.serve 接收产生难排的 bug）。
 */
function parseNum(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid env ${name}: "${value}" is not a valid number`);
  }
  return n;
}

export function loadConfig(): Config {
  const env = process.env;
  return {
    databaseUrl: env.DATABASE_URL ?? './immune-td.db',
    bindHost: env.BIND_HOST ?? '0.0.0.0',
    bindPort: parseNum(env.BIND_PORT, 3100, 'BIND_PORT'),
    corsAllowedOrigins: (env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim()),
    tokenTtlDays: parseNum(env.TOKEN_TTL_DAYS, 30, 'TOKEN_TTL_DAYS'),
    anonRetentionDays: parseNum(env.ANON_RETENTION_DAYS, 30, 'ANON_RETENTION_DAYS'),
    bodyLimitKb: parseNum(env.BODY_LIMIT_KB, 500, 'BODY_LIMIT_KB'),
    initialAdminUsername: env.INITIAL_ADMIN_USERNAME ?? null,
    initialAdminPassword: env.INITIAL_ADMIN_PASSWORD ?? null,
    logLevel: env.LOG_LEVEL ?? 'info',
    // 空串视为未配置（.env.example 默认占位 `WECHAT_APPID=` 不会误激活 wx 登录链路）
    wechatAppId: env.WECHAT_APPID && env.WECHAT_APPID.length > 0 ? env.WECHAT_APPID : null,
    wechatAppSecret:
      env.WECHAT_APPSECRET && env.WECHAT_APPSECRET.length > 0 ? env.WECHAT_APPSECRET : null,
  };
}
