/**
 * 响应式断点（CSS px 阈值）。
 *
 * 项目当前 `VIEWPORT_MAX_CSS_W = 480`，桌面 / 平板都按窄屏走。断点系统
 * 先建好作为 future-proof，桌面 / 平板分支等真要做大屏适配时再实装。
 *
 * 阈值参考主流移动 / 平板设备宽度分布：
 * - 0-479：iPhone SE / 老 mini（最窄机型）
 * - 480-767：标准手机（项目当前 max width 限制）
 * - 768-1023：平板（iPad mini / 入门 Android tablet）
 * - 1024+：桌面 / 大平板
 */
export const BREAKPOINTS = {
  PHONE_NARROW: 0,
  PHONE_WIDE: 480,
  TABLET: 768,
  DESKTOP: 1024,
} as const;

export type Breakpoint = 'phone-narrow' | 'phone-wide' | 'tablet' | 'desktop';

/** 顺序数组，便于 isAtLeast 比较索引。 */
const ORDER: readonly Breakpoint[] = ['phone-narrow', 'phone-wide', 'tablet', 'desktop'] as const;

/**
 * 根据 CSS 宽度判定当前断点。
 *
 * 边界规则：左闭右开。例：cssW=480 命中 'phone-wide'，cssW=479 命中 'phone-narrow'。
 */
export function getBreakpoint(cssW: number): Breakpoint {
  if (cssW >= BREAKPOINTS.DESKTOP) return 'desktop';
  if (cssW >= BREAKPOINTS.TABLET) return 'tablet';
  if (cssW >= BREAKPOINTS.PHONE_WIDE) return 'phone-wide';
  return 'phone-narrow';
}

/**
 * 当前 CSS 宽度是否 >= 给定断点。
 *
 * 用于条件分支 layout（如 tablet 起切多列）：
 * ```ts
 * if (isAtLeast(W / DPR, 'tablet')) { cols = 2; } else { cols = 1; }
 * ```
 */
export function isAtLeast(cssW: number, bp: Breakpoint): boolean {
  const currentIdx = ORDER.indexOf(getBreakpoint(cssW));
  const targetIdx = ORDER.indexOf(bp);
  return currentIdx >= targetIdx;
}
