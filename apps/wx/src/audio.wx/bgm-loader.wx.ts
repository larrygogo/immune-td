/*!
 * BGM 加载 —— 微信小游戏 stub。
 */

import type Phaser from 'phaser';

export interface BgmLoadProgress {
  loaded: number;
  total: number;
}

export async function loadBgmWithProgress(
  _game: Phaser.Game,
  _key: string,
  _url: string,
  onProgress: (p: BgmLoadProgress) => void,
): Promise<void> {
  onProgress({ loaded: 1, total: 1 });
}
