/**
 * Spacing 常量（CSS px 单位）。使用时通过 `px()` helper 乘 DPR 转 buffer px。
 *
 * 命名跟 4-pt grid 对齐：xs=4 / sm=8 / md=16 / lg=24 / xl=32 / xxl=48。
 *
 * 用法语义：
 * - xs：行内文字 padding / icon 内边距 / 紧密堆叠
 * - sm：按钮内 padding / 同区块小元素间
 * - md：按钮间 / 区块内主元素间 / 屏边 padding（默认 SAFE_LEFT/RIGHT）
 * - lg：区块间（顶部条 → hub / hub → grid）
 * - xl：主区块间（视觉重心切割）
 * - xxl：极强分隔（极少用）
 *
 * 调全局 spacing 一处改全局生效。新代码优先用 SPACING 常量而不是裸 `px(28)` 之类。
 */
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export type SpacingKey = keyof typeof SPACING;
