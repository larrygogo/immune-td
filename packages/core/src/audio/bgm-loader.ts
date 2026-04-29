/**
 * 手动 fetch BGM mp3，按 stream chunk 读真实字节进度，decodeAudioData 后注入
 * Phaser audio cache。
 *
 * 为什么不用 Phaser 自己的 this.load.audio：Phaser 的 audio loader 在多数浏览器
 * 下不发 `fileprogress` 事件（或 bytesTotal=0），无法拿到真实下载进度，会出现
 * 进度条"闷下载、complete 时跳 25%+"的阶梯感。手动 fetch + ReadableStream 能
 * 逐 chunk 累加 bytes，进度条按真实字节线性涨。
 */

import type Phaser from 'phaser';

export interface BgmLoadProgress {
  loaded: number;
  total: number; // Content-Length；缺失时 = 0
}

export async function loadBgmWithProgress(
  game: Phaser.Game,
  key: string,
  url: string,
  onProgress: (p: BgmLoadProgress) => void,
): Promise<void> {
  // Phaser WebAudioSoundManager 的 AudioContext；必须用同一个 ctx decode，
  // 否则生成的 AudioBuffer 和 SoundManager 的 ctx 不通，播不出。
  const ctx = (game.sound as unknown as { context?: AudioContext }).context;
  if (!ctx) {
    // NoAudio / HTML5Audio 模式不支持此路径，静默跳过（BGM 不可用，但不 crash）
    onProgress({ loaded: 1, total: 1 });
    return;
  }

  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`BGM load failed: ${url} (${res.status})`);
  }
  const contentLength = Number(res.headers.get('Content-Length') ?? '0');
  const total = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : 0;

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress({ loaded, total });
  }

  // 拼接所有 chunk
  const buffer = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    buffer.set(c, offset);
    offset += c.length;
  }

  // decodeAudioData 在 Safari 要 callback API；现代浏览器都支持 Promise 形式
  const audioBuffer = await ctx.decodeAudioData(buffer.buffer);

  // 注入 Phaser audio cache：之后 game.cache.audio.exists(key) = true，
  // game.sound.add(key) 可以正常用
  game.cache.audio.add(key, audioBuffer);

  // decode 完成 = 资源真正可用，总进度补满
  onProgress({ loaded: total || loaded, total: total || loaded });
}
