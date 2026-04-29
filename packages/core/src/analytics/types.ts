/**
 * 客户端 analytics 类型定义。
 * 事件 schema 是前后端 single source（@immune-td/shared 包），这里 type-only re-export。
 */

import type { AnalyticsEventInput, EventName } from '@immune-td/shared';

export type { AnalyticsEventInput, EventName };

/**
 * 业务方调 track() 时只传 event_name + props（envelope 由模块自动注入）。
 * 类型上从 AnalyticsEventInput 反推每个事件名对应的 props 形状，编译期保证传错失败。
 */
export type EventPropsByName<N extends EventName> = Extract<
  AnalyticsEventInput,
  { event_name: N }
>['props'];

/**
 * Provider：实际把事件发出去的实现。flush 时并发调用所有 provider。
 * 失败要抛错（让 queue 触发 storage 兜底——Task 8 接入；当前 Task 3 仅 console.warn）。
 */
export interface AnalyticsProvider {
  /** 调试日志用名（'console' / 'http' / 'wx'） */
  name: string;
  send(events: readonly AnalyticsEventInput[]): Promise<void>;
}

/** queue 调度参数（默认值见 queue.ts） */
export interface QueueOptions {
  /** 队列满 N 条立即 flush */
  batchSize?: number;
  /** 距上次 flush N ms 后定时 flush */
  flushIntervalMs?: number;
}
