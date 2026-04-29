import { AnalyticsEventInputSchema } from '@immune-td/shared';
import { AnalyticsQueue } from './queue';
import type { AnalyticsProvider, EventName, EventPropsByName } from './types';

/**
 * 客户端 analytics 公共 API。
 *
 * 模块职责：
 * - 注入 envelope（device_id / user_id / session_id / app_version / platform / client_ts）
 * - 校验事件 schema（运行时挡住坏事件，避免前后端不一致）
 * - 推入 queue（实际发送由 init.ts 注入的 provider 列表完成）
 *
 * **不在 SSR / 测试环境执行的副作用都放在 init.ts**（lifecycle 钩子 / 初始 session_start）。
 * 本文件只关注 enqueue 流，方便单测。
 */

let queue: AnalyticsQueue | null = null;
let enabled = true;

/** 全局 sessionId（initAnalytics 时生成；非战斗 scene 也用同一 id） */
let sessionId: string | null = null;
/** 当前登录 user id（identify() 时设置；null = 匿名） */
let userId: number | null = null;
/** app version（initAnalytics 时注入；通常来自 package.json or build env） */
let appVersion = '0.0.0';

interface InjectorDeps {
  /** 取设备 id（lazy 注入，避免 platform 未 install 时本模块加载报错） */
  getDeviceId: () => string;
  /** 取平台名（'web' / 'wx'） */
  getPlatform: () => 'web' | 'wx';
}

let injectors: InjectorDeps | null = null;

/**
 * 由 init.ts 注入运行期依赖。本模块不直接 import platform / store，避免循环依赖。
 */
export function _setupAnalytics(opts: {
  providers: readonly AnalyticsProvider[];
  sessionId: string;
  appVersion: string;
  injectors: InjectorDeps;
  queueOptions?: ConstructorParameters<typeof AnalyticsQueue>[1];
}): void {
  queue = new AnalyticsQueue(opts.providers, opts.queueOptions);
  sessionId = opts.sessionId;
  appVersion = opts.appVersion;
  injectors = opts.injectors;
  enabled = true;
}

/** 业务方调用入口。编译期保证 props 形状与 event_name 匹配。 */
export function track<N extends EventName>(eventName: N, props: EventPropsByName<N>): void {
  if (!enabled || queue === null || sessionId === null || injectors === null) return;
  const candidate = {
    device_id: injectors.getDeviceId(),
    user_id: userId !== null ? String(userId) : null,
    session_id: sessionId,
    client_ts: Date.now(),
    app_version: appVersion,
    platform: injectors.getPlatform(),
    event_name: eventName,
    props,
  };
  // 运行期 schema 校验：挡住手写错的字段；通过后 type assert 给 enqueue
  const parsed = AnalyticsEventInputSchema.safeParse(candidate);
  if (!parsed.success) {
    console.warn(`[analytics] invalid event ${eventName}:`, parsed.error.issues);
    return;
  }
  queue.enqueue(parsed.data);
}

/** 关闭采集（用户在 Settings 关闭"数据采集"时调用）。后续 track 静默丢弃。 */
export function setEnabled(v: boolean): void {
  enabled = v;
}

/** 立即 flush（lifecycle 钩子 / 测试用） */
export function flush(): Promise<void> {
  return queue?.flush() ?? Promise.resolve();
}

/** 设置当前用户 id（login 后调用） */
export function identify(uid: number | null): void {
  userId = uid;
}

/** 测试用：重置全部状态 */
export function _resetAnalyticsForTests(): void {
  queue?.__resetForTest();
  queue = null;
  sessionId = null;
  userId = null;
  enabled = true;
  appVersion = '0.0.0';
  injectors = null;
}
