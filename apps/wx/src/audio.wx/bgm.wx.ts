/*!
 * BGM 管理器 —— 微信小游戏 stub（无音频播放）。
 *
 * 业务场景：微信小游戏不支持 Web Audio / fetch MP3，先以 no-op stub 保证
 * 所有调用 bgm.play() / bgm.init() 的 scene 不 crash。后续可用 wx
 * InnerAudioContext 替换为真实现。
 */

export type BgmName = 'menu' | 'battle';

class BgmManager {
  init(_game: unknown): void {}
  registerSound(_name: BgmName): void {}
  play(_name: BgmName): void {}
  stop(): void {}
  retryPending(): void {}
  setMuted(_m: boolean): void {}
  setVolume(_v: number): void {}
}

export const bgm = new BgmManager();
