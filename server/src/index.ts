import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';
import { type AuthRouterOptions, authRouter, serializeUser } from './auth/handlers';
import { hashPassword } from './auth/password';
import { startCleanupLoop } from './cleanup';
import { type Config, loadConfig } from './config';
import { initDb } from './db';
import { AppError } from './errors';
import { authExtract, requireAuth } from './middleware/auth';
import { countUsers, createUser, findByUsername } from './models/user';
import {
  adminAnnouncementRouter,
  announcementRouter,
} from './routes/announcement';
import { bugReportsRouter } from './routes/bug-reports';
import { eventsRouter } from './routes/events';
import { healthRouter } from './routes/health';
import { adminMailRouter, mailRouter } from './routes/mail';
import { progressRouter } from './routes/progress';
import { sessionsRouter } from './routes/sessions';

/** createApp 返回值的显式类型，便于测试 helper / Task 3+ 引用 */
export interface AppBundle {
  app: Hono;
  db: ReturnType<typeof initDb>;
  config: Config;
  startTime: number;
  /** 停止后台清理 task（测试 / 优雅关闭用） */
  stopCleanup: () => void;
}

/**
 * 工厂额外选项（测试用）：
 * - `authOptions.wechatFetch`：注入 mock fetch 给 wechat-login 链路，单测不调真微信 API
 */
export interface CreateAppOptions {
  authOptions?: AuthRouterOptions;
}

/**
 * 工厂：构造 app + 注入 db/config，不启动 HTTP server。
 * 测试里可以 `createApp(testConfig)` 拿到 app 后直接调 `app.request(...)` 发虚拟请求,
 * 不占端口、不跑 Bun.serve，跨测试 DB 隔离（用 `:memory:` 各自一份）。
 */
export function createApp(
  cfg: Config = loadConfig(),
  options: CreateAppOptions = {},
): AppBundle {
  const db = initDb(cfg.databaseUrl);
  const startTime = Date.now();

  // 初始 admin 种子（users 空 + env 两者都有 → 一次性创建）
  // fire-and-forget + catch：避免 unhandled rejection 炸进程；seed 失败只记 error
  seedInitialAdmin(db, cfg).catch((err) => {
    console.error('[server] seedInitialAdmin 失败:', err);
  });

  const stopCleanup = startCleanupLoop(db, cfg.anonRetentionDays);

  const app = new Hono();

  // CORS（必须在所有路由之前）
  app.use(
    '*',
    cors({
      origin: cfg.corsAllowedOrigins,
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-Device-Id'],
      credentials: true,
    }),
  );

  // 全局错误处理
  app.onError((err, c) => {
    // Hono 内部和第三方 middleware（如 hono-rate-limiter）惯用 HTTPException 表达状态码
    if (err instanceof HTTPException) {
      return err.getResponse();
    }
    if (err instanceof AppError) {
      return c.json(
        { error: err.code, message: err.message },
        err.status as ContentfulStatusCode,
      );
    }
    if (err instanceof ZodError) {
      return c.json({ error: 'validation', issues: err.issues }, 400);
    }
    console.error('[server] unhandled:', err);
    return c.json({ error: 'internal', message: 'internal server error' }, 500);
  });

  // 全局 body size limit（超限 413）
  app.use(
    '*',
    bodyLimit({
      maxSize: cfg.bodyLimitKb * 1024,
      onError: (c) =>
        c.json({ error: 'payload_too_large', message: `max ${cfg.bodyLimitKb}KB` }, 413),
    }),
  );

  // 全局 bearer 解析（不 require）
  app.use('*', authExtract(db));

  app.route('/health', healthRouter(db, startTime));
  app.route('/api/auth', authRouter(db, cfg, options.authOptions ?? {}));
  app.get('/api/me', requireAuth, (c) => {
    const u = c.var.user;
    if (!u) throw new AppError(401, 'unauthorized', 'authentication required');
    return c.json({ user: serializeUser(u) });
  });
  app.route('/api/sessions', sessionsRouter(db));
  app.route('/api/bug-reports', bugReportsRouter(db));
  app.route('/api/progress', progressRouter(db));
  app.route('/api/events', eventsRouter(db));
  app.route('/api/mail', mailRouter(db));
  app.route('/api/admin/mail', adminMailRouter(db));
  app.route('/api/announcement', announcementRouter(db));
  app.route('/api/admin/announcement', adminAnnouncementRouter(db));

  return { app, db, config: cfg, startTime, stopCleanup };
}

async function seedInitialAdmin(db: ReturnType<typeof initDb>, cfg: Config): Promise<void> {
  if (!cfg.initialAdminUsername || !cfg.initialAdminPassword) return;
  if (countUsers(db) > 0) return;
  if (findByUsername(db, cfg.initialAdminUsername)) return; // 幂等兜底
  const hash = await hashPassword(cfg.initialAdminPassword);
  createUser(db, cfg.initialAdminUsername, hash, 'admin');
  console.log(`[server] 初始 admin 已创建：${cfg.initialAdminUsername}`);
}

// main 守卫：只有 `bun src/index.ts` 直接运行时才 listen；被 import 不启动 server
if (import.meta.main) {
  const { app, config } = createApp();
  try {
    const server = Bun.serve({
      hostname: config.bindHost,
      port: config.bindPort,
      fetch: app.fetch,
    });
    console.log(`[immune-td-server] listening on http://${server.hostname}:${server.port}`);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'EADDRINUSE') {
      console.error(`\n[server] ❌ 端口 ${config.bindPort} 被占用。`);
      console.error('[server] 常见原因：上次 dev 退出后 node 僵尸进程没杀干净。');
      console.error('[server] Windows:  taskkill /IM node.exe /F');
      console.error(`[server] macOS/Linux:  lsof -ti :${config.bindPort} | xargs kill -9`);
      console.error(`[server] 或换端口启:  BIND_PORT=<port> bun run dev\n`);
      process.exit(1);
    }
    throw err;
  }
}
