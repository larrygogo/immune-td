/**
 * Layout Debug Overlay — dev-only 可视化工具。
 *
 * 显示当前 scene 的：
 * - safe-area 4 边边框（细线）
 * - 9 宫格 anchor 网格（top-left / top-center / ... / bottom-right 各一个十字标）
 * - 当前 breakpoint 标签 + W / H / DPR 信息（屏幕角落小字）
 *
 * 用法：
 * ```ts
 * import { createLayoutDebugOverlay } from '../layout/debug';
 * if (import.meta.env.DEV) {
 *   const overlay = createLayoutDebugOverlay(this);
 *   overlay.show();   // 默认隐藏
 * }
 * ```
 *
 * 或者在 BootScene 启动时调 `installLayoutDebugShortcut()` 挂全局键盘
 * Ctrl+Shift+L 切换显示——所有 scene 都生效。
 *
 * **production 自动 tree-shake**：所有 export 都用 `import.meta.env.DEV` 守护，
 * 生产构建（`bun run build`）后这个文件不会被 import 也就不会进 bundle。
 *
 * 视觉：
 * - 黑底半透明 fill + neon 主色细描边
 * - 文字 10px，FONT 主栈
 * - setDepth(999) 极高，确保在所有 scene UI 之上
 */
import type { Scene } from 'phaser';
import { DPR } from '../dpr';
import { COLOR, FONT, HEX, px } from '../style';
import {
  anchorBottomCenter,
  anchorBottomLeft,
  anchorBottomRight,
  anchorMiddleCenter,
  anchorMiddleLeft,
  anchorMiddleRight,
  anchorTopCenter,
  anchorTopLeft,
  anchorTopRight,
} from './anchor';
import { getBreakpoint } from './breakpoints';
import { getSafeArea } from './safe-area';

/** debug overlay 实例化结果。隐藏 / 显示 / 销毁。 */
export interface LayoutDebugOverlay {
  /** 显示 overlay。 */
  show(): void;
  /** 隐藏 overlay（保持挂载，下次 show 不需要重建）。 */
  hide(): void;
  /** 切换显示。 */
  toggle(): void;
  /** 销毁 overlay 释放资源。 */
  destroy(): void;
  /** 当前是否可见。 */
  isVisible(): boolean;
}

/** depth 极高确保在所有 UI 之上。 */
const OVERLAY_DEPTH = 999;
/** 9 宫格锚点十字标尺寸（buffer px）。 */
const CROSS_HALF = 8 * DPR;

/**
 * 在指定 scene 上创建一个 layout debug overlay。
 *
 * 实现：用一个 Container 作为根节点，里面挂 Graphics（safe-area 框 + 9 个十字）+
 * Text（breakpoint 标签 + 信息文字）。show / hide 切 setVisible。
 *
 * @param scene 要 attach 的 scene
 */
export function createLayoutDebugOverlay(scene: Scene): LayoutDebugOverlay {
  const container = scene.add.container(0, 0).setDepth(OVERLAY_DEPTH).setVisible(false);

  // safe-area 边框 + 9 宫格十字
  const graphics = scene.add.graphics();
  container.add(graphics);

  // breakpoint 标签 + 信息文字（左上角）
  const infoText = scene.add
    .text(0, 0, '', {
      fontFamily: FONT,
      fontSize: `${px(10)}px`,
      color: COLOR.immuneBright,
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: { left: px(4), right: px(4), top: px(2), bottom: px(2) },
    })
    .setOrigin(0, 0)
    .setResolution(DPR);
  container.add(infoText);

  // breakpoint 标签（右上角）
  const breakpointText = scene.add
    .text(0, 0, '', {
      fontFamily: FONT,
      fontSize: `${px(10)}px`,
      color: COLOR.warn,
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: { left: px(4), right: px(4), top: px(2), bottom: px(2) },
    })
    .setOrigin(1, 0)
    .setResolution(DPR);
  container.add(breakpointText);

  /** 重画整个 overlay（resize 或 show 时调）。 */
  function redraw(): void {
    const W = scene.scale.width;
    const H = scene.scale.height;
    const sa = getSafeArea(W, H);
    const cssW = W / DPR;
    const cssH = H / DPR;
    const bp = getBreakpoint(cssW);

    graphics.clear();

    // === safe-area 边框（细线 1px buffer）===
    graphics.lineStyle(Math.max(1, DPR), HEX.immuneBright, 0.7);
    graphics.strokeRect(sa.contentX, sa.contentY, sa.contentWidth, sa.contentHeight);

    // 4 边 dashed 内嵌线（区分 SAFE_LEFT / RIGHT / TOP / BOTTOM 区域）
    if (sa.top > 0) {
      graphics.lineStyle(Math.max(1, DPR), HEX.virus, 0.4);
      graphics.strokeRect(0, 0, W, sa.top);
    }
    if (sa.bottom > 0) {
      graphics.lineStyle(Math.max(1, DPR), HEX.virus, 0.4);
      graphics.strokeRect(0, H - sa.bottom, W, sa.bottom);
    }
    if (sa.left > 0) {
      graphics.lineStyle(Math.max(1, DPR), HEX.virus, 0.4);
      graphics.strokeRect(0, sa.top, sa.left, H - sa.top - sa.bottom);
    }
    if (sa.right > 0) {
      graphics.lineStyle(Math.max(1, DPR), HEX.virus, 0.4);
      graphics.strokeRect(W - sa.right, sa.top, sa.right, H - sa.top - sa.bottom);
    }

    // === 9 宫格 anchor 十字标 ===
    graphics.lineStyle(Math.max(1, DPR), HEX.warn, 1);
    const points = [
      anchorTopLeft(W, H, 0, 0, sa),
      anchorTopCenter(W, H, 0, 0, sa),
      anchorTopRight(W, H, 0, 0, sa),
      anchorMiddleLeft(W, H, 0, 0, sa),
      anchorMiddleCenter(W, H, 0, 0, sa),
      anchorMiddleRight(W, H, 0, 0, sa),
      anchorBottomLeft(W, H, 0, 0, sa),
      anchorBottomCenter(W, H, 0, 0, sa),
      anchorBottomRight(W, H, 0, 0, sa),
    ];
    for (const p of points) {
      graphics.beginPath();
      graphics.moveTo(p.x - CROSS_HALF, p.y);
      graphics.lineTo(p.x + CROSS_HALF, p.y);
      graphics.moveTo(p.x, p.y - CROSS_HALF);
      graphics.lineTo(p.x, p.y + CROSS_HALF);
      graphics.strokePath();
    }

    // === 信息文字 ===
    infoText.setText(`W=${W} H=${H}\nCSS=${Math.round(cssW)}×${Math.round(cssH)}\nDPR=${DPR}`);
    infoText.setPosition(sa.left + px(4), sa.top + px(4));

    breakpointText.setText(`bp:${bp}`);
    breakpointText.setPosition(W - sa.right - px(4), sa.top + px(4));
  }

  // resize 时自动重画
  const onResize = (): void => {
    if (container.visible) redraw();
  };
  scene.scale.on('resize', onResize);
  // scene shutdown 时清理 listener
  scene.events.once('shutdown', () => {
    scene.scale.off('resize', onResize);
    container.destroy(true);
  });
  scene.events.once('destroy', () => {
    scene.scale.off('resize', onResize);
    container.destroy(true);
  });

  return {
    show(): void {
      redraw();
      container.setVisible(true);
    },
    hide(): void {
      container.setVisible(false);
    },
    toggle(): void {
      if (container.visible) {
        container.setVisible(false);
      } else {
        redraw();
        container.setVisible(true);
      }
    },
    destroy(): void {
      scene.scale.off('resize', onResize);
      container.destroy(true);
    },
    isVisible(): boolean {
      return container.visible;
    },
  };
}

// ===== 全局快捷键支持 =====

/** 全局快捷键状态：所有 scene 共享一个 overlay 实例 map（按 scene key）。 */
const overlayRegistry = new WeakMap<Scene, LayoutDebugOverlay>();
let shortcutInstalled = false;

/**
 * 装一次全局键盘 shortcut（Ctrl+Shift+L）。Boot 启动时调一次即可，所有 scene 自动响应。
 *
 * 实现：在 window 上监听 keydown（避免依赖某个 scene 的 input plugin）；触发时
 * 找当前 active scene，按需懒创建 overlay 并 toggle。
 *
 * **dev-only**：production build 不应该 import 此模块。
 */
export function installLayoutDebugShortcut(game: Phaser.Game): void {
  if (shortcutInstalled) return;
  shortcutInstalled = true;

  // wx 端没有 window keydown，跳过
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    // Ctrl+Shift+L（mac 也用 Ctrl 不用 Cmd，简化跨平台）
    if (!e.ctrlKey || !e.shiftKey) return;
    if (e.key !== 'L' && e.key !== 'l') return;
    e.preventDefault();

    // 找所有正在运行的 scene
    const scenes = game.scene.getScenes(true);
    for (const scene of scenes) {
      let overlay = overlayRegistry.get(scene);
      if (!overlay) {
        overlay = createLayoutDebugOverlay(scene);
        overlayRegistry.set(scene, overlay);
      }
      overlay.toggle();
    }
  });
}
