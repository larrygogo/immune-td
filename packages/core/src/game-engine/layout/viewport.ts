/**
 * Viewport 聚合：一次拿到 W / H / safeArea / breakpoint / scale。
 *
 * scene 的 layout(W, H) 函数推荐改用 `getViewport(this)` 入口，避免 4 个常量
 * 各自 import + 各自算。
 */
import type { Scene } from 'phaser';
import { DPR } from '../dpr';
import { type Breakpoint, getBreakpoint } from './breakpoints';
import { getScale } from './design-resolution';
import { type SafeAreaInsets, getSafeArea } from './safe-area';

export interface Viewport {
  /** 总宽 buffer px（= scene.scale.width）。 */
  W: number;
  /** 总高 buffer px。 */
  H: number;
  /** 4 边安全区 + 内容区。 */
  safeArea: SafeAreaInsets;
  /** 当前断点（基于 CSS 宽度判定）。 */
  breakpoint: Breakpoint;
  /** 相对设计分辨率的缩放比（CSS_W / DESIGN_W）。 */
  scale: number;
}

/**
 * 从 Scene 拿当前 viewport 描述。每次 layout 时调用一遍即可。
 *
 * 实现细节：
 * - W / H 直接读 scene.scale.width / height（buffer px）
 * - breakpoint / scale 按 CSS 宽度（W / DPR）判定
 * - safeArea 4 边来自 layout/safe-area.ts 模块常量 + 当前 W/H
 */
export function getViewport(scene: Scene): Viewport {
  const W = scene.scale.width;
  const H = scene.scale.height;
  const cssW = W / DPR;
  return {
    W,
    H,
    safeArea: getSafeArea(W, H),
    breakpoint: getBreakpoint(cssW),
    scale: getScale(cssW),
  };
}
