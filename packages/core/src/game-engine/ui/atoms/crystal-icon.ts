import type { GameObjects, Scene } from 'phaser';
import { HEX, px } from '../../style';

/**
 * 「能量结晶」图标：金黄菱形宝石，三段式切割明暗对比，替代 emoji 💎。
 *
 * 形状：
 *   ▲ 顶部高光三角（浅金）
 *   ◆ 中部主菱形（金黄主色）
 *   ▼ 底部暗面三角（深金）
 *
 * 调用方决定容器位置；返回的 Graphics 局部坐标以中心 (0,0) 对齐，
 * 方便和 text 同 baseline 排版（baseline 用 origin 0.5 + setPosition(x, midY)）。
 */
export function makeCrystalIcon(
  scene: Scene,
  size: number,
  color: number = HEX.rewardGold,
): GameObjects.Graphics {
  const g = scene.add.graphics();
  const r = size / 2;
  const top = -r;
  const bot = r;
  const left = -r * 0.6;
  const right = r * 0.6;

  // 主菱形 fill（钝角左右尖锐上下，宝石切面感）
  g.fillStyle(color, 1);
  g.beginPath();
  g.moveTo(0, top);
  g.lineTo(right, 0);
  g.lineTo(0, bot);
  g.lineTo(left, 0);
  g.closePath();
  g.fillPath();

  // 顶部高光面（浅色三角，左上半）
  const lightShade = blendColor(color, 0xffffff, 0.55);
  g.fillStyle(lightShade, 1);
  g.beginPath();
  g.moveTo(0, top);
  g.lineTo(0, 0);
  g.lineTo(left, 0);
  g.closePath();
  g.fillPath();

  // 底部暗面（深色三角，右下半）
  const darkShade = blendColor(color, 0x000000, 0.45);
  g.fillStyle(darkShade, 1);
  g.beginPath();
  g.moveTo(0, bot);
  g.lineTo(right, 0);
  g.lineTo(0, 0);
  g.closePath();
  g.fillPath();

  // 描边（菱形外轮廓）
  g.lineStyle(px(1), darkShade, 0.9);
  g.beginPath();
  g.moveTo(0, top);
  g.lineTo(right, 0);
  g.lineTo(0, bot);
  g.lineTo(left, 0);
  g.closePath();
  g.strokePath();

  // 中央十字高光点（细节）
  g.fillStyle(0xffffff, 0.85);
  g.fillCircle(0, 0, Math.max(1, r * 0.08));

  return g;
}

/** RGB 线性插值（t=0 全 a，t=1 全 b） */
function blendColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const gn = Math.round(ag + (bg - ag) * t);
  const bn = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (gn << 8) | bn;
}
