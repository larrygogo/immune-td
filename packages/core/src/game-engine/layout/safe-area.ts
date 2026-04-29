/**
 * 4 边视觉安全区（buffer 像素，已乘 DPR）。
 *
 * - **wx 端**：`SAFE_TOP` / `SAFE_BOTTOM` 由 `wx-bootstrap.ts` 启动时根据
 *   `wx.getSystemInfoSync()` 算好写到 `globalThis.__safeArea`（兜状态栏 + 刘海/灵动岛 + 胶囊
 *   + home indicator）；本模块不重算，直接读全局值
 * - **H5 端**：`SAFE_TOP` / `SAFE_BOTTOM` 默认 0（浏览器没强制状态栏）；未来 PWA standalone
 *   可改读 CSS `env(safe-area-inset-*)` 注入到 globalThis
 * - **左右**：`SAFE_LEFT` / `SAFE_RIGHT` 双端统一为 `px(SPACING.md) = 16 CSS px × DPR`，
 *   作为屏幕边缘默认 padding
 *
 * 模块加载顺序：`main.wx.ts` 顶部先 import `wx-bootstrap`（写 globalThis），之后
 * scene/UI 加载时本模块才被 import，此时全局已就绪。
 *
 * 兼容性：旧 `src/game-engine/safe-area.ts` re-export 本模块的 SAFE_TOP / SAFE_BOTTOM，
 * 旧 import 路径不破坏。
 */
import { DPR } from '../dpr';
import { SPACING } from './spacing';

interface SafeAreaGlobal {
  top: number;
  bottom: number;
  topCSS: number;
  bottomCSS: number;
}

const __safe = (globalThis as unknown as { __safeArea?: SafeAreaGlobal }).__safeArea;

/** 顶部安全区（buffer px，已 × DPR）。wx 端兜胶囊 + 状态栏，H5 端 0。 */
export const SAFE_TOP: number = __safe?.top ?? 0;

/** 底部安全区（buffer px，已 × DPR）。wx 端兜 home indicator，H5 端 0。 */
export const SAFE_BOTTOM: number = __safe?.bottom ?? 0;

/** 左屏 padding（buffer px）。双端统一 SPACING.md = 16 CSS px × DPR。 */
export const SAFE_LEFT: number = SPACING.md * DPR;

/** 右屏 padding（buffer px）。双端统一 SPACING.md = 16 CSS px × DPR。 */
export const SAFE_RIGHT: number = SPACING.md * DPR;

/** 4 边安全区聚合 + 内容区计算（屏幕减掉 4 边后的可见区域）。 */
export interface SafeAreaInsets {
  /** 顶部安全区（buffer px）。 */
  top: number;
  /** 底部安全区（buffer px）。 */
  bottom: number;
  /** 左侧 padding（buffer px）。 */
  left: number;
  /** 右侧 padding（buffer px）。 */
  right: number;
  /** 内容区起点 X（= left）。 */
  contentX: number;
  /** 内容区起点 Y（= top）。 */
  contentY: number;
  /** 内容区宽度（= W - left - right）。 */
  contentWidth: number;
  /** 内容区高度（= H - top - bottom）。 */
  contentHeight: number;
}

/**
 * 计算给定屏幕尺寸下的 4 边安全区 + 内容区。
 *
 * @param W 总宽 buffer px（scene.scale.width）
 * @param H 总高 buffer px（scene.scale.height）
 *
 * 注意：
 * - top / bottom 是模块加载时的常量值（wx 端来自 wx-bootstrap），不随 W/H 变化
 * - left / right 是 SPACING.md × DPR 常量值，不随 W/H 变化
 * - contentWidth / contentHeight 才依赖 W/H，每次 layout 时新算
 */
export function getSafeArea(W: number, H: number): SafeAreaInsets {
  return {
    top: SAFE_TOP,
    bottom: SAFE_BOTTOM,
    left: SAFE_LEFT,
    right: SAFE_RIGHT,
    contentX: SAFE_LEFT,
    contentY: SAFE_TOP,
    contentWidth: W - SAFE_LEFT - SAFE_RIGHT,
    contentHeight: H - SAFE_TOP - SAFE_BOTTOM,
  };
}
