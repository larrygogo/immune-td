import type { AnalyticsEventInput, AnalyticsProvider } from '../types';

/**
 * dev 模式下把事件打印到 console，方便埋点开发期调试。
 * prod build 通过 import.meta.env.DEV 死代码消除（仅留空 send）。
 */
export function consoleProvider(): AnalyticsProvider {
  return {
    name: 'console',
    send: async (events: readonly AnalyticsEventInput[]) => {
      if (!import.meta.env.DEV) return;
      for (const ev of events) {
        console.log(`[analytics] ${ev.event_name}`, ev.props);
      }
    },
  };
}
