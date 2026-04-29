import type Phaser from 'phaser';
import { HEX } from './style';

interface PixelateFx {
  amount: number;
}
interface PostFxAdd {
  addBloom?: (
    color?: number,
    ox?: number,
    oy?: number,
    str?: number,
    blur?: number,
    steps?: number,
  ) => unknown;
  addVignette?: (x?: number, y?: number, radius?: number, strength?: number) => unknown;
  addPixelate?: (amount?: number) => PixelateFx;
}

/**
 * 给 scene 主相机加 postFX Bloom（GPU 全画面辉光）。
 * Phaser v4 alpha 的 postFX typings 不全，用结构性接口兜底。
 */
export function applySceneBloom(
  scene: Phaser.Scene,
  opts: { color?: number; strength?: number; blur?: number; steps?: number } = {},
): void {
  const cam = scene.cameras.main as Phaser.Cameras.Scene2D.Camera & { postFX?: PostFxAdd };
  if (!cam.postFX?.addBloom) return;
  cam.postFX.addBloom(
    opts.color ?? HEX.white,
    1,
    1,
    opts.strength ?? 0.6,
    opts.blur ?? 0.7,
    opts.steps ?? 4,
  );
}

/** 给 scene 加 vignette 暗角，增沉浸感 */
export function applySceneVignette(
  scene: Phaser.Scene,
  opts: { radius?: number; strength?: number } = {},
): void {
  const cam = scene.cameras.main as Phaser.Cameras.Scene2D.Camera & { postFX?: PostFxAdd };
  if (!cam.postFX?.addVignette) return;
  cam.postFX.addVignette(0.5, 0.5, opts.radius ?? 0.85, opts.strength ?? 0.4);
}

/**
 * Scene 切换：当前 scene fadeOut → 切到 target scene → 新 scene 自己
 * fadeIn (在 sceneEnter 调 fadeInIfNeeded)。durationMs 默认 220。
 */
export function transitionToScene(
  scene: Phaser.Scene,
  key: string,
  durationMs = 220,
  data?: object,
): void {
  // 双保险：fadeOut 完成事件 + 超时兜底。Phaser v4 alpha 在某些 mobile 浏览器
  // 上 camerafadeoutcomplete 偶尔不触发 → 表现为"按钮点了无反应"。超时强切。
  let started = false;
  const safeStart = (): void => {
    if (started) return;
    started = true;
    scene.scene.start(key, data);
  };
  try {
    scene.cameras.main.fadeOut(durationMs, 0, 0, 0);
    scene.cameras.main.once('camerafadeoutcomplete', safeStart);
  } catch (err) {
    console.warn('[transitionToScene] camera fade failed', err);
  }
  // 超时兜底：fadeOut 时长 + 80ms buffer
  scene.time.delayedCall(durationMs + 80, safeStart);
}

/** 在 scene create 末尾调用：相机 fade 黑→透，配合 transitionToScene */
export function fadeInOnEnter(scene: Phaser.Scene, durationMs = 220): void {
  scene.cameras.main.fadeIn(durationMs, 0, 0, 0);
}

/** 短暂 Pixelate 冲击：amount 0 → peak → 0，持续 durationMs */
export function pulsePixelate(scene: Phaser.Scene, peak = 8, durationMs = 320): void {
  const cam = scene.cameras.main as Phaser.Cameras.Scene2D.Camera & { postFX?: PostFxAdd };
  if (!cam.postFX?.addPixelate) return;
  const fx = cam.postFX.addPixelate(0);
  scene.tweens.add({
    targets: fx,
    amount: peak,
    duration: durationMs / 2,
    yoyo: true,
    ease: 'Quad.out',
    onComplete: () => {
      // 用 typing 安全地移除 effect
      const remover = (cam.postFX as unknown as { remove?: (fx: unknown) => void }).remove;
      remover?.call(cam.postFX, fx);
    },
  });
}
