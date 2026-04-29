import type { AnalyticsEventInput, AnalyticsProvider, QueueOptions } from './types';

/**
 * 内存事件队列。
 *
 * 调度规则：
 * - 满 batchSize 立即 flush（默认 20）
 * - 否则 flushIntervalMs 后定时 flush（默认 5s）
 * - 显式调 flush() 立即清空（lifecycle 钩子用）
 *
 * flush 失败：每个 provider 独立 try/catch，失败的 provider 不影响其它，
 * 错误用 console.warn 记录。Task 8 加 storage 兜底（失败事件落本地，下次重试）。
 *
 * 可重入：flush 期间新 enqueue 会进新一批，不阻塞。
 */
export class AnalyticsQueue {
  private buffer: AnalyticsEventInput[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly providers: readonly AnalyticsProvider[];

  constructor(providers: readonly AnalyticsProvider[], opts: QueueOptions = {}) {
    this.providers = providers;
    this.batchSize = opts.batchSize ?? 20;
    this.flushIntervalMs = opts.flushIntervalMs ?? 5000;
  }

  enqueue(ev: AnalyticsEventInput): void {
    this.buffer.push(ev);
    if (this.buffer.length >= this.batchSize) {
      // 满批立即 flush（不再等定时）
      void this.flush();
      return;
    }
    if (this.timer === null) {
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.flush();
      }, this.flushIntervalMs);
    }
  }

  /**
   * 复制并清空 buffer，并发调用所有 provider。
   * 不抛错——provider 内部失败仅 console.warn，不影响后续 enqueue。
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.slice();
    this.buffer.length = 0;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await Promise.all(
      this.providers.map(async (p) => {
        try {
          await p.send(batch);
        } catch (err) {
          console.warn(`[analytics] provider ${p.name} send 失败:`, err);
        }
      }),
    );
  }

  /** 当前队列长度（测试 / debug） */
  size(): number {
    return this.buffer.length;
  }

  /** 测试用：清空队列 + 取消定时器 */
  __resetForTest(): void {
    this.buffer.length = 0;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
