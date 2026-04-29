/**
 * 背景音乐管理器（**H5 web-only 实现**，基于 Phaser SoundManager）。
 *
 * 平台策略：本文件依赖 Phaser Web Audio backend；微信小游戏 Phaser
 * 运行时由 weapp-adapter 垫层支持，但 BGM 资源加载方式不同（不能直接 fetch mp3）。
 * 整文件需要在 wx build 中通过 vite.wx.config.ts 的 resolve.alias 替换为
 * `bgm.wx.ts`（届时新写）。业务调用方无需改动。
 *
 * 之前用 Howler 走 WebAudio 模式时 autoUnlock 监听 document 冒泡，
 * 被 Phaser canvas 拦截导致 BGM 永远播不出。改用 Phaser 自己的
 * SoundManager：autoUnlock 跟 canvas 事件深度集成，不依赖冒泡。
 *
 * 使用：BootScene preload 后调 bgm.init(game)，之后任意 scene 调
 * bgm.play('menu' | 'battle')。
 */

import type Phaser from 'phaser';

export type BgmName = 'menu' | 'battle';

const BGM_NAMES: readonly BgmName[] = ['menu', 'battle'];

class BgmManager {
  private game: Phaser.Game | null = null;
  private sounds = new Map<BgmName, Phaser.Sound.BaseSound>();
  private current: BgmName | null = null;
  private muted = false;
  private volume = 0.6;

  /**
   * 在 Phaser game 创建 + 任意 BGM 已进 cache 后调；重复调用幂等（同 game 下只
   * 补登记 cache 里已有但 sounds 里还没有的曲目，支持"menu 先就绪 → init →
   * battle 后就绪 → 再次 init"的渐进流程）。
   */
  init(game: Phaser.Game): void {
    this.game = game;
    for (const name of BGM_NAMES) {
      if (this.sounds.has(name)) continue;
      if (!game.cache.audio.exists(name)) continue;
      const sound = game.sound.add(name, {
        loop: true,
        volume: this.effectiveVolume(),
      });
      this.sounds.set(name, sound);
    }
    // race condition 修复：若 init 之前已有 play() 调用被挂起（sounds 为空时
    // 只记了 current），现在 sounds 就绪，立刻补播。
    if (this.current && this.sounds.has(this.current)) {
      const pending = this.current;
      this.current = null; // 清掉，让 play 走全量逻辑
      this.play(pending);
    }
  }

  /**
   * 单曲增量注册：BGM 文件后到时（battle.mp3 在 splash 之后才下完）调一次，
   * 相当于 init 的"追加一曲"版本。
   */
  registerSound(name: BgmName): void {
    if (!this.game) return;
    if (this.sounds.has(name)) return;
    if (!this.game.cache.audio.exists(name)) return;
    const sound = this.game.sound.add(name, {
      loop: true,
      volume: this.effectiveVolume(),
    });
    this.sounds.set(name, sound);
    if (this.current === name) {
      this.current = null;
      this.play(name);
    }
  }

  /**
   * 解锁 Phaser 自己的 AudioContext（它与 sfx.ts 的 AudioContext 是**两套**）。
   * Chrome autoplay policy 下，首次 user gesture 调一次即可。
   */
  private unlockPhaserAudio(): void {
    const sm = this.game?.sound as unknown as {
      locked?: boolean;
      unlock?: () => void;
      context?: AudioContext;
    };
    if (!sm) return;
    // WebAudioSoundManager 的 context 若 suspended，显式 resume（必须在 user gesture 内）
    if (sm.context && sm.context.state === 'suspended') {
      void sm.context.resume();
    }
    // locked 状态下 Phaser 自己 unlock 也会注册监听，双保险
    if (sm.locked && typeof sm.unlock === 'function') {
      sm.unlock();
    }
  }

  private effectiveVolume(): number {
    return this.muted ? 0 : this.volume;
  }

  play(name: BgmName): void {
    // 每次 play 都尝试解锁（Chrome autoplay policy：必须在 user gesture 内 resume）
    this.unlockPhaserAudio();
    const sound = this.sounds.get(name);
    if (!sound) {
      // 未 init 或音频未 preload，记 current；init 完成后会补播
      this.current = name;
      return;
    }
    if (this.current === name && sound.isPlaying) return;
    this.stopAll();
    (sound as Phaser.Sound.BaseSound & { setVolume?: (v: number) => void }).setVolume?.(
      this.effectiveVolume(),
    );
    sound.play();
    this.current = name;
  }

  stop(): void {
    this.stopAll();
    this.current = null;
  }

  /**
   * 解锁监听触发时调：如果存在挂起的 current（play 时 sounds 未 ready 或
   * ctx suspended 未播出），立即补播。
   */
  retryPending(): void {
    if (!this.current) return;
    const sound = this.sounds.get(this.current);
    if (!sound) return; // 还没 init 完，等 init 末尾补播
    if (sound.isPlaying) return;
    (sound as Phaser.Sound.BaseSound & { setVolume?: (v: number) => void }).setVolume?.(
      this.effectiveVolume(),
    );
    sound.play();
  }

  private stopAll(): void {
    // biome-ignore lint/complexity/noForEach: wx babel _createForOfIteratorHelper 对 Map iterator 报 non-iterable
    this.sounds.forEach((s) => {
      if (s.isPlaying) s.stop();
    });
  }

  setMuted(m: boolean): void {
    this.muted = m;
    const v = this.effectiveVolume();
    // biome-ignore lint/complexity/noForEach: wx babel _createForOfIteratorHelper 对 Map iterator 报 non-iterable
    this.sounds.forEach((s) => {
      (s as Phaser.Sound.BaseSound & { setVolume?: (v: number) => void }).setVolume?.(v);
    });
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    const eff = this.effectiveVolume();
    // biome-ignore lint/complexity/noForEach: wx babel _createForOfIteratorHelper 对 Map iterator 报 non-iterable
    this.sounds.forEach((s) => {
      (s as Phaser.Sound.BaseSound & { setVolume?: (v: number) => void }).setVolume?.(eff);
    });
  }
}

export const bgm = new BgmManager();

if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  (window as unknown as Record<string, unknown>).__bgm = bgm;
}
