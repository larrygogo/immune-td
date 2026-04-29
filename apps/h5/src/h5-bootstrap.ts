/**
 * H5 端启动 polyfill —— 必须在 src/main.web.tsx 顶部最先 import，让
 * src/game-engine/layout/safe-area.ts 在 module load 时能从 globalThis.__safeArea
 * 读到 iOS / 安卓刘海屏 / home indicator 的实际安全区。
 *
 * 行业标准做法（PWA / 小游戏 / 移动 H5 都这么干）：
 *   1. index.html viewport meta 带 `viewport-fit=cover`（已配置）
 *   2. CSS env(safe-area-inset-top/bottom) 在 iOS Safari 上反映物理刘海/小白条尺寸
 *   3. 启动阶段读出来注入全局，避免 layout 写死 0 在 iPhone X+ 系列贴边
 *
 * 实现：在 documentElement 上加 4 个 CSS 自定义属性指向 env()，再用 getComputedStyle
 * 读出 px 值。比插入临时 DOM probe 更省事且无副作用。读不到时（老浏览器 / 桌面）
 * 默认 0，跟现有 H5 行为一致。
 */
import { DPR } from '@engine/dpr';

interface SafeAreaGlobal {
  top: number;
  bottom: number;
  topCSS: number;
  bottomCSS: number;
}

function readSafeAreaCss(): { topCSS: number; bottomCSS: number } {
  if (typeof document === 'undefined') return { topCSS: 0, bottomCSS: 0 };
  const root = document.documentElement;
  // 把 env() 写到 CSS 自定义属性上，再用 getComputedStyle 读出 px 数值
  root.style.setProperty('--probe-safe-top', 'env(safe-area-inset-top, 0px)');
  root.style.setProperty('--probe-safe-bottom', 'env(safe-area-inset-bottom, 0px)');
  const cs = getComputedStyle(root);
  const topCSS = parseFloat(cs.getPropertyValue('--probe-safe-top')) || 0;
  const bottomCSS = parseFloat(cs.getPropertyValue('--probe-safe-bottom')) || 0;
  return { topCSS, bottomCSS };
}

const { topCSS, bottomCSS } = readSafeAreaCss();

(globalThis as unknown as { __safeArea: SafeAreaGlobal }).__safeArea = {
  top: topCSS * DPR,
  bottom: bottomCSS * DPR,
  topCSS,
  bottomCSS,
};
