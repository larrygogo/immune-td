import { getShell } from '../../shell';
import type { AnalyticsEventInput, AnalyticsProvider } from '../types';

/**
 * 把事件批量 POST 到 server `/api/events`。
 * 失败抛错让 queue 知道哪批没发出去（Task 8 接入 storage 兜底）。
 *
 * shell.apiFetch 未注入（playground 离线）→ provider 直接抛错让 queue 留事件不丢。
 */
export function httpProvider(): AnalyticsProvider {
  return {
    name: 'http',
    send: async (events: readonly AnalyticsEventInput[]) => {
      const apiFetch = getShell().apiFetch;
      if (!apiFetch) {
        throw new Error('[analytics/http] shell.apiFetch 未注入');
      }
      const res = await apiFetch('/api/events', {
        method: 'POST',
        body: JSON.stringify({ events }),
      });
      if (!res.ok) {
        throw new Error(`POST /api/events failed: ${res.status}`);
      }
    },
  };
}
