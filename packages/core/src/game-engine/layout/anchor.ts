/**
 * Widget Anchor 系统：声明式锚点 + 偏移 → buffer px 坐标。
 *
 * 解决痛点：scene 里到处手写 `setPosition(W - rightPad - btnW / 2, topRowCenterY)`，
 * 易错且不自解释。改成 `anchorTopRight(W, H, ...)` 后语义清晰。
 *
 * **重要**：本模块的所有 helper **假设节点 origin 在中心 (0.5, 0.5)**。
 * Phaser GameObject 默认 origin (0, 0)（左上）。调用方有两种选择：
 *  1. 给节点 `setOrigin(0.5)` 后直接用 helper 返回的 (x, y)
 *  2. 保持 (0, 0) origin，用返回的 (x, y) 减去节点宽高一半
 *
 * 单位约定：所有 offset 参数都是 **buffer px**（已乘 DPR）。调用方在传入前
 * 用 `px(SPACING.md)` 之类把 CSS px 乘 DPR。
 */
import type { SafeAreaInsets } from './safe-area';

/** 9 宫格锚点位置。 */
export type AnchorPoint =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

/**
 * 计算锚点位置。
 *
 * @param anchor 9 宫格位置
 * @param containerW 容器宽度（buffer px）
 * @param containerH 容器高度（buffer px）
 * @param offsetX 锚点向"内"的水平偏移（buffer px）。例：top-right 时正值往左推
 * @param offsetY 锚点向"内"的垂直偏移（buffer px）。例：bottom-center 时正值往上抬
 * @param safeArea 可选；传入则把锚点限制到 contentX/Y/Width/Height 区域内
 * @returns 节点中心目标坐标（buffer px）。假设节点 origin (0.5, 0.5)
 */
export function resolveAnchor(
  anchor: AnchorPoint,
  containerW: number,
  containerH: number,
  offsetX = 0,
  offsetY = 0,
  safeArea?: SafeAreaInsets,
): { x: number; y: number } {
  // 决定边界：传 safeArea 用 content 区域，否则用整个容器
  const left = safeArea ? safeArea.contentX : 0;
  const top = safeArea ? safeArea.contentY : 0;
  const w = safeArea ? safeArea.contentWidth : containerW;
  const h = safeArea ? safeArea.contentHeight : containerH;
  const right = left + w;
  const bottom = top + h;
  const cx = left + w / 2;
  const cy = top + h / 2;

  // 注意：offsetX / offsetY 始终是"向内偏移"
  // - left 锚点 +offsetX 往右
  // - right 锚点 +offsetX 往左
  // - top 锚点 +offsetY 往下
  // - bottom 锚点 +offsetY 往上
  // - center 行/列：offsetX/Y 直接累加（按右/下为正方向）
  switch (anchor) {
    case 'top-left':
      return { x: left + offsetX, y: top + offsetY };
    case 'top-center':
      return { x: cx + offsetX, y: top + offsetY };
    case 'top-right':
      return { x: right - offsetX, y: top + offsetY };
    case 'middle-left':
      return { x: left + offsetX, y: cy + offsetY };
    case 'middle-center':
      return { x: cx + offsetX, y: cy + offsetY };
    case 'middle-right':
      return { x: right - offsetX, y: cy + offsetY };
    case 'bottom-left':
      return { x: left + offsetX, y: bottom - offsetY };
    case 'bottom-center':
      return { x: cx + offsetX, y: bottom - offsetY };
    case 'bottom-right':
      return { x: right - offsetX, y: bottom - offsetY };
  }
}

// ===== 9 个便捷 helper =====
// 命名约定：anchor<AnchorPoint>，参数顺序 (W, H, offsetX, offsetY, safeArea)。
// 所有 offset 默认 0。调用方用 px(SPACING.md) 之类传入。

export function anchorTopLeft(
  W: number,
  H: number,
  offsetX = 0,
  offsetY = 0,
  safeArea?: SafeAreaInsets,
): { x: number; y: number } {
  return resolveAnchor('top-left', W, H, offsetX, offsetY, safeArea);
}

export function anchorTopCenter(
  W: number,
  H: number,
  offsetX = 0,
  offsetY = 0,
  safeArea?: SafeAreaInsets,
): { x: number; y: number } {
  return resolveAnchor('top-center', W, H, offsetX, offsetY, safeArea);
}

export function anchorTopRight(
  W: number,
  H: number,
  offsetX = 0,
  offsetY = 0,
  safeArea?: SafeAreaInsets,
): { x: number; y: number } {
  return resolveAnchor('top-right', W, H, offsetX, offsetY, safeArea);
}

export function anchorMiddleLeft(
  W: number,
  H: number,
  offsetX = 0,
  offsetY = 0,
  safeArea?: SafeAreaInsets,
): { x: number; y: number } {
  return resolveAnchor('middle-left', W, H, offsetX, offsetY, safeArea);
}

export function anchorMiddleCenter(
  W: number,
  H: number,
  offsetX = 0,
  offsetY = 0,
  safeArea?: SafeAreaInsets,
): { x: number; y: number } {
  return resolveAnchor('middle-center', W, H, offsetX, offsetY, safeArea);
}

export function anchorMiddleRight(
  W: number,
  H: number,
  offsetX = 0,
  offsetY = 0,
  safeArea?: SafeAreaInsets,
): { x: number; y: number } {
  return resolveAnchor('middle-right', W, H, offsetX, offsetY, safeArea);
}

export function anchorBottomLeft(
  W: number,
  H: number,
  offsetX = 0,
  offsetY = 0,
  safeArea?: SafeAreaInsets,
): { x: number; y: number } {
  return resolveAnchor('bottom-left', W, H, offsetX, offsetY, safeArea);
}

export function anchorBottomCenter(
  W: number,
  H: number,
  offsetX = 0,
  offsetY = 0,
  safeArea?: SafeAreaInsets,
): { x: number; y: number } {
  return resolveAnchor('bottom-center', W, H, offsetX, offsetY, safeArea);
}

export function anchorBottomRight(
  W: number,
  H: number,
  offsetX = 0,
  offsetY = 0,
  safeArea?: SafeAreaInsets,
): { x: number; y: number } {
  return resolveAnchor('bottom-right', W, H, offsetX, offsetY, safeArea);
}
