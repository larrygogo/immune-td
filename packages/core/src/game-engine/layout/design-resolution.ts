/**
 * 设计分辨率（基准 viewport）。
 *
 * 选 iPhone 14 标准（390 × 844 CSS px）。设计稿、视觉规格、Figma 等都按这个尺寸量。
 *
 * 项目主 layout 用 `px()` × DPR 已经能跨 DPR，多数情况下 **不需要** 这个 scale。
 * 仅供"按设计稿比例缩放"的 visual element 用（例：logo 在窄屏要按比例缩小）。
 */

/** 设计基准 CSS 宽度（iPhone 14）。 */
export const DESIGN_W = 390;

/** 设计基准 CSS 高度（iPhone 14）。 */
export const DESIGN_H = 844;

/**
 * 当前 CSS 宽度相对设计分辨率的比例。
 *
 * @param currentCssW 当前实际 CSS 宽度（即 buffer px / DPR）
 * @returns 比例。currentCssW = DESIGN_W 时返回 1，更窄返回 < 1，更宽返回 > 1
 *
 * @example
 * ```ts
 * import { DPR } from '../dpr';
 * const logoSize = px(72) * getScale(scene.scale.width / DPR);
 * ```
 */
export function getScale(currentCssW: number): number {
  return currentCssW / DESIGN_W;
}
