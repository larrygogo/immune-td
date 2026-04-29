import type { AudioAdapter } from '@/platform/types';

/**
 * H5 Audio 实现（**当前为占位骨架，业务未接入**）。
 *
 * 决策（见 spec § Step 4）：现有 SFX（src/audio/sfx.ts，Web Audio API + 13 种合成
 * fallback）和 BGM（src/audio/bgm.ts，Phaser SoundManager）整体走 build-time
 * substitution，未来 wx 端用 vite.wx.config.ts 的 resolve.alias 替换为 sfx.wx.ts /
 * bgm.wx.ts。细粒度类型化的 SFX 接口跑去 runtime adapter 字符串 API 反而失类型安全。
 *
 * AudioAdapter 接口本身保留，给未来"通用音频需求"用，例如：
 * - 广告 SDK 触发的提示音（解锁奖励 / 复活提示）
 * - 从 server 动态加载的活动音效
 * 这种"无需类型化的可变音频"才适合走 runtime adapter。
 *
 * 此实现：HTMLAudioElement preload + play。preload 用 canplaythrough 等就绪；playSfx
 * clone 节点支持叠加播放；playBgm 取代上一个 BGM。autoplay 政策失败静默吞掉。
 */
class HtmlAudioBackend implements AudioAdapter {
  private cache = new Map<string, HTMLAudioElement>();
  private bgm: HTMLAudioElement | null = null;
  private master = 1;

  async preload(key: string, src: string): Promise<void> {
    if (this.cache.has(key)) return;
    const a = new Audio(src);
    a.preload = 'auto';
    this.cache.set(key, a);
    await new Promise<void>((resolve) => {
      const done = (): void => {
        a.removeEventListener('canplaythrough', done);
        a.removeEventListener('error', done);
        resolve();
      };
      a.addEventListener('canplaythrough', done, { once: true });
      a.addEventListener('error', done, { once: true });
    });
  }

  playSfx(key: string, opts?: { volume?: number }): void {
    const ref = this.cache.get(key);
    if (!ref) return;
    // clone 让同一 sfx 可叠加多次播放
    const clip = ref.cloneNode() as HTMLAudioElement;
    clip.volume = (opts?.volume ?? 1) * this.master;
    void clip.play().catch(() => {
      // autoplay policy 失败：忽略，等下次用户交互后再试
    });
  }

  playBgm(key: string, opts?: { volume?: number; loop?: boolean }): void {
    this.stopBgm();
    const ref = this.cache.get(key);
    if (!ref) return;
    const clip = ref.cloneNode() as HTMLAudioElement;
    clip.volume = (opts?.volume ?? 1) * this.master;
    clip.loop = opts?.loop ?? true;
    void clip.play().catch(() => {
      /* autoplay 限制；忽略 */
    });
    this.bgm = clip;
  }

  stopBgm(): void {
    if (!this.bgm) return;
    this.bgm.pause();
    this.bgm.currentTime = 0;
    this.bgm = null;
  }

  setMasterVolume(v: number): void {
    this.master = Math.max(0, Math.min(1, v));
    if (this.bgm) this.bgm.volume = this.master;
  }
}

export const webAudio: AudioAdapter = new HtmlAudioBackend();
