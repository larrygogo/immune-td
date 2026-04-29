import type { GameObjects } from 'phaser';
import { HEX, px } from '../../style';

/**
 * 4 角 L 型装饰风格。详见 `docs/design-system.md §5.1`。
 * - `thick`：粗版 cyber（cornerLen=12, lineWidth=2, default alpha=0.95）
 *   出现位置：Settings / Login 主面板（强焦点 modal）
 * - `thin`：细版 HUD（cornerLen=6, lineWidth=1, default alpha=0.55）
 *   出现位置：MainMenu 关卡卡片、Research 节点（列表项装饰）
 */
export type CyberFrameVariant = 'thick' | 'thin';

export interface CyberFrameOpts {
  variant: CyberFrameVariant;
  /** 装饰色，默认 `HEX.primary`（immune 绿） */
  color?: number;
  /** 覆盖 variant 默认 alpha（如 Research 节点用 0.85 表示已购态） */
  alpha?: number;
}

/**
 * 在 Graphics 上画 4 个 L 型角装饰。不调 `g.clear()`，由 caller 控制时机；
 * `lineStyle` 会被覆盖，调用前的 stroke 设置丢失（caller 通常在 fillRect+strokeRect
 * 之后调本函数）。
 *
 * 起点 (x, y) 是 frame 的左上角（不是 graphics origin），方便给 strokeRect 同样的
 * (x, y, w, h) 直接复用。
 */
export function drawCyberFrame(
  g: GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: CyberFrameOpts,
): void {
  const cornerLen = opts.variant === 'thick' ? px(12) : px(6);
  const lineWidth = opts.variant === 'thick' ? px(2) : px(1);
  const alpha = opts.alpha ?? (opts.variant === 'thick' ? 0.95 : 0.55);
  const color = opts.color ?? HEX.primary;
  g.lineStyle(lineWidth, color, alpha);
  // 左上 / 右上 / 左下 / 右下 各 2 段（横 + 竖），共 8 段 lineBetween
  g.lineBetween(x, y, x + cornerLen, y);
  g.lineBetween(x, y, x, y + cornerLen);
  g.lineBetween(x + w - cornerLen, y, x + w, y);
  g.lineBetween(x + w, y, x + w, y + cornerLen);
  g.lineBetween(x, y + h - cornerLen, x, y + h);
  g.lineBetween(x, y + h, x + cornerLen, y + h);
  g.lineBetween(x + w - cornerLen, y + h, x + w, y + h);
  g.lineBetween(x + w, y + h - cornerLen, x + w, y + h);
}
