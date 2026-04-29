/**
 * Layout Framework 统一入口。
 *
 * 推荐用法：`import { SPACING, anchorTopRight, getViewport } from '@engine/layout';`
 *
 * 完整模块：
 * - spacing：4-pt grid 常量（xs..xxl）
 * - breakpoints：响应式断点（phone-narrow / phone-wide / tablet / desktop）
 * - safe-area：4 边安全区 + 内容区聚合
 * - anchor：9 宫格锚点 + 便捷 helper（top-left ... bottom-right）
 * - design-resolution：基准 390 × 844 + 缩放 helper
 * - viewport：聚合 W / H / safeArea / breakpoint / scale
 */

export {
  type AnchorPoint,
  anchorBottomCenter,
  anchorBottomLeft,
  anchorBottomRight,
  anchorMiddleCenter,
  anchorMiddleLeft,
  anchorMiddleRight,
  anchorTopCenter,
  anchorTopLeft,
  anchorTopRight,
  resolveAnchor,
} from './anchor';
export { type Breakpoint, BREAKPOINTS, getBreakpoint, isAtLeast } from './breakpoints';
export { DESIGN_H, DESIGN_W, getScale } from './design-resolution';
export {
  type SafeAreaInsets,
  SAFE_BOTTOM,
  SAFE_LEFT,
  SAFE_RIGHT,
  SAFE_TOP,
  getSafeArea,
} from './safe-area';
export { type SpacingKey, SPACING } from './spacing';
export { type Viewport, getViewport } from './viewport';
