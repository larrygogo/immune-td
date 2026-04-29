import { Howl } from 'howler';

export type AudioCategory = 'ui' | 'tower' | 'pathogen' | 'wave' | 'ambient' | 'bgm';

interface SoundEntry {
  howl: Howl;
  category: AudioCategory;
}

/**
 * 统一音频管理。按分类控制音量，提供 play/stop/fade 接口。
 * P1 只提供骨架 —— 真实音频文件在 P5 资产阶段接入。
 */
export class AudioManager {
  private sounds = new Map<string, SoundEntry>();
  private categoryVolume: Record<AudioCategory, number> = {
    ui: 1,
    tower: 1,
    pathogen: 1,
    wave: 1,
    ambient: 0.6,
    bgm: 0.7,
  };
  private masterVolume = 0.8;

  /**
   * 注册音频。url 可为 undefined 用于占位（静音兜底）。
   */
  register(id: string, category: AudioCategory, url: string | undefined): void {
    if (!url) return; // P1 无资源时跳过，不抛错
    if (this.sounds.has(id)) return;
    const howl = new Howl({
      src: [url],
      volume: this.computeVolume(category),
      preload: true,
    });
    this.sounds.set(id, { howl, category });
  }

  play(id: string): number | undefined {
    const entry = this.sounds.get(id);
    if (!entry) return undefined; // 占位：资源未注册时静默
    return entry.howl.play();
  }

  stop(id: string): void {
    this.sounds.get(id)?.howl.stop();
  }

  setMasterVolume(v: number): void {
    this.masterVolume = clamp01(v);
    this.refreshAll();
  }

  setCategoryVolume(category: AudioCategory, v: number): void {
    this.categoryVolume[category] = clamp01(v);
    this.refreshCategory(category);
  }

  private computeVolume(category: AudioCategory): number {
    return this.masterVolume * this.categoryVolume[category];
  }

  private refreshCategory(category: AudioCategory): void {
    // biome-ignore lint/complexity/noForEach: wx babel _createForOfIteratorHelper 对 Map iterator 报 non-iterable
    this.sounds.forEach((entry) => {
      if (entry.category === category) {
        entry.howl.volume(this.computeVolume(category));
      }
    });
  }

  private refreshAll(): void {
    // biome-ignore lint/complexity/noForEach: wx babel _createForOfIteratorHelper 对 Map iterator 报 non-iterable
    this.sounds.forEach((entry) => {
      entry.howl.volume(this.computeVolume(entry.category));
    });
  }

  dispose(): void {
    // biome-ignore lint/complexity/noForEach: wx babel _createForOfIteratorHelper 对 Map iterator 报 non-iterable
    this.sounds.forEach(({ howl }) => howl.unload());
    this.sounds.clear();
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// 单例：游戏内只有一份音频管理器
export const audio = new AudioManager();
