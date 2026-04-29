/**
 * 全局 audio 解锁。
 *
 * 问题：Chrome autoplay policy 里 `touchstart` / `pointerdown` 不算
 * "user activation triggering" 事件，在这些事件内 `AudioContext.resume()`
 * 会被拒。合法触发器包括：`pointerup` / `touchend` / `click` / `keydown`
 * / `keyup`。
 *
 * 方案：在 document 上注册一次性监听这几个事件，任一首次触发时：
 *   1. resume 自建 sfx AudioContext
 *   2. resume Phaser SoundManager 的 AudioContext 并调 unlock()
 *   3. 补播挂起的 BGM（current）
 * 解锁成功后自己移除所有监听。
 */

import type Phaser from 'phaser';
import { bgm } from './bgm';
import { sfx } from './sfx';

const TRIGGER_EVENTS: readonly (keyof DocumentEventMap)[] = [
  'pointerup',
  'touchend',
  'click',
  'keydown',
  'keyup',
];

let installed = false;

export function installAudioUnlock(game: Phaser.Game): void {
  if (installed) return;
  installed = true;

  const handler = () => {
    // 自建 SFX ctx
    sfx.ensure();

    // Phaser 的 SoundManager ctx（WebAudio 模式下有 context）
    const sm = game.sound as unknown as {
      locked?: boolean;
      unlock?: () => void;
      context?: AudioContext;
    };
    if (sm.context && sm.context.state === 'suspended') {
      void sm.context.resume();
    }
    if (sm.locked && typeof sm.unlock === 'function') {
      sm.unlock();
    }

    // 补播挂起的 BGM（bgm.play 内部会幂等处理）
    bgm.retryPending();

    // 一次性：任一事件触发即移除全部监听
    for (const ev of TRIGGER_EVENTS) {
      document.removeEventListener(ev, handler, true);
    }
  };

  // capture 阶段监听，避免被 Phaser canvas stopPropagation 吞掉
  for (const ev of TRIGGER_EVENTS) {
    document.addEventListener(ev, handler, { capture: true, passive: true });
  }
}
