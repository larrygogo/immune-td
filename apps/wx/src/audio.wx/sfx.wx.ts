/*!
 * 音效管理器 —— 微信小游戏 stub（无音频播放）。
 *
 * 业务场景：微信小游戏不支持 Web Audio / fetch MP3，先以 no-op stub 保证
 * 所有调用 sfx.uiClick() / sfx.towerPlace() 的 scene 不 crash。后续可用 wx
 * InnerAudioContext 替换为真实现。
 */

class SfxManager {
  ensure(): void {}
  preload(_onProgress?: (loaded: number, total: number) => void): Promise<void> {
    return Promise.resolve();
  }
  setVolume(_v: number): void {}
  setMuted(_m: boolean): void {}

  towerPlace(): void {}
  towerUpgrade(): void {}
  towerSell(): void {}
  towerFire(_towerType: 'macrophage' | 'neutrophil' | 'nkcell'): void {}
  pathogenKilled(): void {}
  waveStart(): void {}
  waveEnd(): void {}
  levelWon(): void {}
  levelLost(): void {}
  error(): void {}
  uiClick(): void {}
}

export const sfx = new SfxManager();
