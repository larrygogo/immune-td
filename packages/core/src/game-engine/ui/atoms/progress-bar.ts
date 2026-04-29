import type { GameObjects } from 'phaser';

/**
 * 阈值色切换：按 ratio 落在哪个区间用 high / mid / low 色。
 * 默认阈值 mid=0.66 / low=0.33（HUD HP 风），可通过 thresholds 覆盖。
 */
export interface ThresholdColor {
  high: number;
  mid: number;
  low: number;
  /** 可选：自定义阈值（如 entity HP 用 0.6 / 0.3） */
  thresholds?: { mid: number; low: number };
}

export interface ProgressBarOpts {
  /** 进度比例 0-1，超出会被 clamp */
  ratio: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * 前景色：单色（任意 ratio 同色）或阈值色切换（按 ratio 自动选 high/mid/low）。
   * 阈值色用于 HP bar 等"剩余越少越警示"的场景。
   */
  color: number | ThresholdColor;
  /** 前景 alpha，默认 1 */
  fgAlpha?: number;
  /** 背景色，未传则不画 bg（前景直接画在 graphics 上） */
  bgColor?: number;
  /** 背景 alpha，默认 1 */
  bgAlpha?: number;
}

/**
 * 通用比例进度条：bg + fg ratio 填充 + 可选阈值色切换。
 * callsite 不 clear graphics，由调用方控制；本函数只做 fillStyle + fillRect。
 *
 * 用法（HUD HP 阈值色）：
 * ```ts
 * drawProgressBar(g, {
 *   ratio: hp / maxHp, x, y, width: 80, height: 6,
 *   color: { high: HEX.hpBarHigh, mid: HEX.hpMid, low: HEX.hpBarLow },
 *   bgColor: HEX.gridLine,
 * });
 * ```
 *
 * 用法（单色倒计时）：
 * ```ts
 * drawProgressBar(g, {
 *   ratio, x: 0, y: H - 1, width: W, height: 1,
 *   color: HEX.warn, fgAlpha: 0.7,
 * });
 * ```
 */
export function drawProgressBar(g: GameObjects.Graphics, opts: ProgressBarOpts): void {
  const { ratio, x, y, width, height, color, fgAlpha = 1, bgColor, bgAlpha = 1 } = opts;
  if (bgColor !== undefined) {
    g.fillStyle(bgColor, bgAlpha).fillRect(x, y, width, height);
  }
  const r = Math.max(0, Math.min(1, ratio));
  if (r <= 0) return;
  const fg = typeof color === 'number' ? color : pickThreshold(r, color);
  g.fillStyle(fg, fgAlpha).fillRect(x, y, width * r, height);
}

function pickThreshold(ratio: number, c: ThresholdColor): number {
  const midT = c.thresholds?.mid ?? 0.66;
  const lowT = c.thresholds?.low ?? 0.33;
  if (ratio > midT) return c.high;
  if (ratio > lowT) return c.mid;
  return c.low;
}
