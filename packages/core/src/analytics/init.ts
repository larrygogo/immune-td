import { getAdapters } from '@/platform';
import { _setupAnalytics, flush, track } from './index';
import { consoleProvider } from './providers/console';
import { httpProvider } from './providers/http';
import { getCurrentSceneName } from './scene-view';

/**
 * H5 入口启动。在 `installAdapters()` 之后、boot 之前调用一次。
 *
 * 职责：
 * 1. 生成全局 sessionId（脱离 GameScene 的 recordingSessionId，让非战斗 scene 也能埋）
 * 2. 注入 provider 列表（dev: console + http；prod: 仅 http）
 * 3. 挂 lifecycle 钩子（visibilitychange / pagehide → flush）
 * 4. 立即埋一条 session_start
 */
export function initAnalytics(opts: { appVersion?: string } = {}): void {
  const platform = getAdapters().device.getPlatform();
  const deviceId = getAdapters().device.getDeviceId();
  const sessionId = `${platform}_${deviceId}_${Date.now()}`;
  const isReturning = readReturningFlag();

  _setupAnalytics({
    providers: [consoleProvider(), httpProvider()],
    sessionId,
    appVersion: opts.appVersion ?? '0.0.0',
    injectors: {
      getDeviceId: () => getAdapters().device.getDeviceId(),
      getPlatform: () => getAdapters().device.getPlatform(),
    },
  });

  // lifecycle：页面可见性切换时埋一条 app_visibility，hidden 时顺带 flush 避免丢事件
  if (typeof window !== 'undefined') {
    window.addEventListener('visibilitychange', () => {
      const state = document.visibilityState === 'hidden' ? 'hidden' : 'visible';
      track('app_visibility', {
        state,
        scene_at_change: getCurrentSceneName() ?? 'unknown',
      });
      if (state === 'hidden') void flush();
    });
    // pagehide 比 beforeunload 在移动端 / bfcache 更可靠
    window.addEventListener('pagehide', () => {
      void flush();
    });
  }

  track('session_start', { is_returning: isReturning });
  // 标记下次为 returning（不影响本次 is_returning）
  writeReturningFlag();
}

const RETURNING_KEY = 'analytics:returning';

function readReturningFlag(): boolean {
  try {
    return getAdapters().storage.get(RETURNING_KEY) === '1';
  } catch {
    return false;
  }
}

function writeReturningFlag(): void {
  try {
    getAdapters().storage.set(RETURNING_KEY, '1');
  } catch {
    // 静默：storage 失败不阻塞游戏
  }
}
