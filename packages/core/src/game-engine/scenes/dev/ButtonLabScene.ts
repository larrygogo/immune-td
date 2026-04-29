import { type GameObjects, Scene } from 'phaser';
import { sfx } from '@audio/sfx';
import { DPR } from '../../dpr';
import { setRectInteractive } from '../../interactive';
import { SPACING } from '../../layout/spacing';
import { transitionToScene } from '../../scene-fx';
import { COLOR, FONT, FONT_MONO, HEX, px } from '../../style';

/**
 * dev 专用「主按钮配方」实验场。一屏并排展示多种主按钮绘制方案，
 * 同一标签 / 同一尺寸下肉眼比较。挑中后再把方案抽到 atom + 替换实战。
 *
 * 进入方式：URL hash `#button-lab` 或 MainMenu DEV 角的入口（仅 import.meta.env.DEV）。
 */

const LABEL_MAIN = '开始游戏';
const LABEL_SUB = '第 11 关 · 胸腺训练';
const BTN_W_CSS = 240;
const BTN_H_CSS = 64;

/** 工具：八边形（角斜切）顶点 */
function octagonPoints(w: number, h: number, cut: number): { x: number; y: number }[] {
  return [
    { x: -w / 2 + cut, y: -h / 2 },
    { x: w / 2 - cut, y: -h / 2 },
    { x: w / 2, y: -h / 2 + cut },
    { x: w / 2, y: h / 2 - cut },
    { x: w / 2 - cut, y: h / 2 },
    { x: -w / 2 + cut, y: h / 2 },
    { x: -w / 2, y: h / 2 - cut },
    { x: -w / 2, y: -h / 2 + cut },
  ];
}

/** 工具：圆角矩形 fill */
function fillRoundedRect(
  g: GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  c: number,
  a: number,
): void {
  g.fillStyle(c, a).fillRoundedRect(x, y, w, h, r);
}

function strokeRoundedRect(
  g: GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  thick: number,
  c: number,
  a: number,
): void {
  g.lineStyle(thick, c, a).strokeRoundedRect(x, y, w, h, r);
}

/**
 * 字色配方（tone）：让 V1-V5 各试不同字色 / stroke / shadow 组合。
 * - color：fill 颜色
 * - strokeColor / strokeAlpha / strokeWidth：描边
 * - shadowColor / shadowOffset(X,Y) / shadowBlur：阴影（offset≠0 = drop shadow，blur≠0 = 柔光）
 *   注意 setShadow 一次只能传一组阴影，要分层效果用 stroke + shadow 组合。
 */
interface LabelTone {
  color: string;
  strokeColor: string;
  /** 主标 stroke 厚度（CSS px），副标自动用 60% */
  strokeWidthMain?: number;
  shadowColor: string;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowBlur?: number;
  /** 字重，默认 '900' Heavy；可降到 'bold'(700) 让视觉更轻 */
  fontStyle?: string;
  /** 配方简短描述（标题旁展示） */
  desc: string;
}

/**
 * 画文字（主标 + 副标）的统一方法：bold 字 + tone 配置的 stroke / shadow。
 */
function makeLabel(
  scene: Scene,
  size: number,
  text: string,
  tone: LabelTone,
  letterSpacingEm = 0.18,
): GameObjects.Text {
  const isMain = size >= 18;
  const strokeMain = tone.strokeWidthMain ?? 1;
  return scene.add
    .text(0, 0, text, {
      fontFamily: FONT,
      fontSize: `${px(size)}px`,
      fontStyle: tone.fontStyle ?? '900',
      color: tone.color,
    })
    .setOrigin(0.5)
    .setPadding(px(SPACING.sm + SPACING.xs), px(SPACING.sm))
    .setStroke(tone.strokeColor, px(isMain ? strokeMain : strokeMain * 0.6))
    .setShadow(
      px(tone.shadowOffsetX ?? 0),
      px(tone.shadowOffsetY ?? 0),
      tone.shadowColor,
      px(tone.shadowBlur ?? (isMain ? 2 : 1.5)),
      false,
      true,
    )
    .setLetterSpacing(px(size * letterSpacingEm))
    .setResolution(DPR);
}

// 各 V 的字色配方
const TONE_V1: LabelTone = {
  color: COLOR.immuneDeep, // 暗绿字
  strokeColor: COLOR.immuneBright, // 高光绿描边
  strokeWidthMain: 1,
  shadowColor: COLOR.bg,
  shadowOffsetY: 1,
  shadowBlur: 2,
  desc: '暗绿字 / 亮绿描边 / 黑 drop',
};

const TONE_V2: LabelTone = {
  color: COLOR.white, // 白字
  strokeColor: COLOR.bg, // 黑厚描边
  strokeWidthMain: 1.5,
  shadowColor: COLOR.bg,
  shadowOffsetY: 2,
  shadowBlur: 3,
  desc: '白字 / 黑厚描边 / 黑 drop blur',
};

const TONE_V3: LabelTone = {
  color: COLOR.bg, // 黑字
  strokeColor: COLOR.immuneBright, // 亮绿外发光感
  strokeWidthMain: 1,
  shadowColor: COLOR.immuneBright, // 同色 glow
  shadowBlur: 4,
  desc: '黑字 / 亮绿描边 / 同色光晕',
};

// V4 现在借用 V2 的字色配方（白字 / 黑厚描边 / 黑 drop blur），原 TONE_V4 已移除

const TONE_V5: LabelTone = {
  color: COLOR.bg,
  strokeColor: COLOR.immuneBright,
  strokeWidthMain: 1.2,
  shadowColor: COLOR.immuneDim,
  shadowOffsetY: 2,
  shadowBlur: 1,
  desc: '黑字 / 亮绿描边 / 暗绿 drop',
};

// V6 现在借用 V2 字配方（白字 / 黑厚描边 / 黑 drop blur），原 outline 款配方移除

// V7 三角洲行动「开始行动」配方：深绿字 bold，无强 stroke / shadow（颜色不那么深）
const TONE_V7: LabelTone = {
  color: COLOR.immuneDeep, // 深绿替代纯黑，跟 mint 底同色系更柔
  strokeColor: COLOR.immuneDeep,
  strokeWidthMain: 0.4,
  shadowColor: COLOR.immuneDeep,
  shadowOffsetY: 1,
  shadowBlur: 0,
  fontStyle: 'bold', // 700 而非 900
  desc: '深绿字 bold / 极淡自描边（仿三角洲）',
};

interface VariantBuild {
  /** bg Graphics + label Text 组装的 container */
  container: GameObjects.Container;
  /** redraw(hover) 让 hover 态切换 */
  redraw: (hover: boolean) => void;
  /** 当前实际 world w/h（已乘 DPR），方便 hit area 设置 */
  w: number;
  h: number;
}

type VariantFactory = (scene: Scene, w: number, h: number) => VariantBuild;

// =============================================================================
// V1：当前 StartGameButton 配方（基线对照）
//   octagon + 3 层外发光 + 实心 fill + 黑/白双 stroke + 底部反光线 + 顶部阴影线
// =============================================================================
const V1_octagonDualBevel: VariantFactory = (scene, w, h) => {
  const bg = scene.add.graphics();
  const title = makeLabel(scene, 20, LABEL_MAIN, TONE_V1);
  const sub = makeLabel(scene, 11, LABEL_SUB, TONE_V1).setAlpha(0.85);
  title.setPosition(0, Math.round(-px(8)));
  sub.setPosition(0, Math.round(px(16)));
  const container = scene.add.container(0, 0, [bg, title, sub]);
  const c = HEX.primary;
  const baseCut = px(14);
  const redraw = (hover: boolean) => {
    bg.clear();
    const glowBoost = hover ? 1.6 : 1;
    const layers = [
      { expand: px(10), alpha: 0.06 * glowBoost },
      { expand: px(6), alpha: 0.1 * glowBoost },
      { expand: px(3), alpha: 0.16 * glowBoost },
    ];
    for (const { expand, alpha } of layers) {
      bg.fillStyle(c, alpha).fillPoints(
        octagonPoints(w + expand * 2, h + expand * 2, baseCut + expand),
        true,
      );
    }
    bg.fillStyle(c, 1).fillPoints(octagonPoints(w, h, baseCut), true);
    bg.lineStyle(px(1), 0x000000, 0.45).strokePoints(octagonPoints(w, h, baseCut), true);
    const innerInset = px(3);
    bg.lineStyle(px(1), 0xffffff, 0.22).strokePoints(
      octagonPoints(w - innerInset * 2, h - innerInset * 2, baseCut - innerInset),
      true,
    );
    const hi = px(SPACING.md);
    bg.lineStyle(px(2), 0xffffff, hover ? 0.4 : 0.28);
    bg.lineBetween(-w / 2 + hi, h / 2 - px(3), w / 2 - hi, h / 2 - px(3));
    bg.lineStyle(px(1), 0x000000, 0.18);
    bg.lineBetween(-w / 2 + hi, -h / 2 + px(3), w / 2 - hi, -h / 2 + px(3));
  };
  redraw(false);
  return { container, redraw, w, h };
};

// =============================================================================
// V2：圆角矩形 + 立体 bevel + 顶部高光渐变
//   柔和精致路线：filled rounded rect + 顶部 1/3 加 1px highlight + 底部 1px shadow
// =============================================================================
const V2_roundedBevel: VariantFactory = (scene, w, h) => {
  const bg = scene.add.graphics();
  const title = makeLabel(scene, 20, LABEL_MAIN, TONE_V2);
  const sub = makeLabel(scene, 11, LABEL_SUB, TONE_V2).setAlpha(0.85);
  title.setPosition(0, Math.round(-px(8)));
  sub.setPosition(0, Math.round(px(16)));
  const container = scene.add.container(0, 0, [bg, title, sub]);
  const c = HEX.primary;
  const r = px(10);
  const redraw = (hover: boolean) => {
    bg.clear();
    // 多层圆角 glow
    const glowBoost = hover ? 1.5 : 1;
    for (let i = 4; i >= 1; i--) {
      const e = px(2 + i * 2);
      fillRoundedRect(
        bg,
        -w / 2 - e,
        -h / 2 - e,
        w + e * 2,
        h + e * 2,
        r + e,
        c,
        0.06 * glowBoost * (5 - i) * 0.25,
      );
    }
    // 主体 fill
    fillRoundedRect(bg, -w / 2, -h / 2, w, h, r, c, 1);
    // 顶部 1/3 高光叠层（更白）
    fillRoundedRect(
      bg,
      -w / 2 + px(2),
      -h / 2 + px(2),
      w - px(4),
      h * 0.45,
      r - px(2),
      0xffffff,
      0.12,
    );
    // 内描边亮（白）/ 外描边深（黑）
    strokeRoundedRect(bg, -w / 2, -h / 2, w, h, r, px(1), 0x000000, 0.45);
    strokeRoundedRect(
      bg,
      -w / 2 + px(2),
      -h / 2 + px(2),
      w - px(4),
      h - px(4),
      r - px(2),
      px(1),
      0xffffff,
      0.32,
    );
    // 底部反光线（弧线+一点 chevron 感）
    bg.lineStyle(px(1.5), 0xffffff, hover ? 0.35 : 0.22);
    bg.lineBetween(-w / 2 + px(SPACING.lg), h / 2 - px(4), w / 2 - px(SPACING.lg), h / 2 - px(4));
  };
  redraw(false);
  return { container, redraw, w, h };
};

// =============================================================================
// V3：切角矩形 + scanline 内纹理 + LED 状态点
//   高密度 cyber HUD 路线
// =============================================================================
const V3_chamferScanlineLed: VariantFactory = (scene, w, h) => {
  const bg = scene.add.graphics();
  const title = makeLabel(scene, 20, LABEL_MAIN, TONE_V3);
  const sub = makeLabel(scene, 11, LABEL_SUB, TONE_V3).setAlpha(0.85);
  title.setPosition(0, Math.round(-px(8)));
  sub.setPosition(0, Math.round(px(16)));
  const container = scene.add.container(0, 0, [bg, title, sub]);
  const c = HEX.primary;
  const cut = px(10);
  const redraw = (hover: boolean) => {
    bg.clear();
    // 外发光（八边形）
    const boost = hover ? 1.5 : 1;
    for (let i = 3; i >= 1; i--) {
      const e = px(3 + i * 3);
      bg.fillStyle(c, 0.05 * boost * (4 - i) * 0.33).fillPoints(
        octagonPoints(w + e * 2, h + e * 2, cut + e),
        true,
      );
    }
    // 主体
    bg.fillStyle(c, 1).fillPoints(octagonPoints(w, h, cut), true);
    // scanline：每 3 px 一条更亮 / 更暗交替
    const scanGap = px(3);
    for (let y = -h / 2 + cut; y < h / 2 - cut; y += scanGap) {
      bg.fillStyle(0xffffff, 0.06).fillRect(-w / 2 + cut, y, w - cut * 2, px(1));
    }
    // 内 stroke（白细）+ 外 stroke（黑细）
    bg.lineStyle(px(1), 0x000000, 0.55).strokePoints(octagonPoints(w, h, cut), true);
    bg.lineStyle(px(1), 0xffffff, 0.28).strokePoints(
      octagonPoints(w - px(6), h - px(6), cut - px(3)),
      true,
    );
    // 左右 LED 点（左绿亮 / 右琥珀小）
    const ledY = -h / 2 + px(SPACING.sm);
    bg.fillStyle(HEX.immuneBright, hover ? 1 : 0.85).fillCircle(
      -w / 2 + px(SPACING.sm + SPACING.xs),
      ledY,
      px(2),
    );
    bg.fillStyle(HEX.warn, 0.85).fillCircle(w / 2 - px(SPACING.sm + SPACING.xs), ledY, px(2));
    // 底部一对 chevron > >
    bg.lineStyle(px(1.5), 0xffffff, hover ? 0.6 : 0.35);
    const chY = h / 2 - px(SPACING.sm + SPACING.xs);
    const chX = w / 2 - px(SPACING.lg);
    bg.beginPath();
    bg.moveTo(chX - px(6), chY - px(3));
    bg.lineTo(chX, chY);
    bg.lineTo(chX - px(6), chY + px(3));
    bg.strokePath();
    bg.beginPath();
    bg.moveTo(chX - px(2), chY - px(3));
    bg.lineTo(chX + px(4), chY);
    bg.lineTo(chX - px(2), chY + px(3));
    bg.strokePath();
  };
  redraw(false);
  return { container, redraw, w, h };
};

// =============================================================================
// V4：双层（外厚框 + 内填充）
//   工业 / 重型路线：外深色厚边 + 内 mint 主色 + 顶部 1/3 高光叠层
// =============================================================================
const V4_doubleLayer: VariantFactory = (scene, w, h) => {
  const bg = scene.add.graphics();
  const title = makeLabel(scene, 20, LABEL_MAIN, TONE_V2);
  const sub = makeLabel(scene, 11, LABEL_SUB, TONE_V2).setAlpha(0.85);
  title.setPosition(0, Math.round(-px(8)));
  sub.setPosition(0, Math.round(px(16)));
  const container = scene.add.container(0, 0, [bg, title, sub]);
  const c = HEX.primary;
  const cut = px(8);
  const inset = px(4);
  const redraw = (hover: boolean) => {
    bg.clear();
    // 外发光
    const boost = hover ? 1.4 : 1;
    for (let i = 3; i >= 1; i--) {
      const e = px(2 + i * 3);
      bg.fillStyle(c, 0.06 * boost * (4 - i) * 0.33).fillPoints(
        octagonPoints(w + e * 2, h + e * 2, cut + e),
        true,
      );
    }
    // 外厚框：深色 immune
    bg.fillStyle(HEX.immuneDeep, 1).fillPoints(octagonPoints(w, h, cut), true);
    // 内主色 fill
    bg.fillStyle(c, 1).fillPoints(octagonPoints(w - inset * 2, h - inset * 2, cut - inset), true);
    // 内顶部高光叠层
    const innerW = w - inset * 2;
    const innerH = h - inset * 2;
    bg.fillStyle(0xffffff, 0.14).fillRect(
      -innerW / 2 + cut,
      -innerH / 2,
      innerW - cut * 2,
      innerH * 0.45,
    );
    // 内 stroke 白线（顶部高亮 hint）
    bg.lineStyle(px(1), 0xffffff, 0.3).strokePoints(
      octagonPoints(w - inset * 2, h - inset * 2, cut - inset),
      true,
    );
    // 外 stroke 极暗描边
    bg.lineStyle(px(1), 0x000000, 0.45).strokePoints(octagonPoints(w, h, cut), true);
    // 顶部 / 底部 1px metallic line
    const hiInset = px(SPACING.lg);
    bg.lineStyle(px(1), 0xffffff, hover ? 0.5 : 0.35);
    bg.lineBetween(
      -w / 2 + hiInset,
      -h / 2 + inset + px(1),
      w / 2 - hiInset,
      -h / 2 + inset + px(1),
    );
    bg.lineStyle(px(1), 0x000000, 0.3);
    bg.lineBetween(-w / 2 + hiInset, h / 2 - inset - px(1), w / 2 - hiInset, h / 2 - inset - px(1));
  };
  redraw(false);
  return { container, redraw, w, h };
};

// =============================================================================
// V5：chevron 指向（右切角 + 左竖线 highlight）
//   "前进/进入"方向感：右侧切大角，左侧 1px 亮色竖条
// =============================================================================
const V5_chevronDirected: VariantFactory = (scene, w, h) => {
  const bg = scene.add.graphics();
  const title = makeLabel(scene, 20, LABEL_MAIN, TONE_V5);
  const sub = makeLabel(scene, 11, LABEL_SUB, TONE_V5).setAlpha(0.85);
  // 右侧切角让左移文字 ~px(4) 视觉平衡
  title.setPosition(-px(4), Math.round(-px(8)));
  sub.setPosition(-px(4), Math.round(px(16)));
  const container = scene.add.container(0, 0, [bg, title, sub]);
  const c = HEX.primary;
  const rcut = px(20);
  const lcut = px(6);
  const points = (gw: number, gh: number, lc: number, rc: number): { x: number; y: number }[] => [
    { x: -gw / 2 + lc, y: -gh / 2 },
    { x: gw / 2 - rc, y: -gh / 2 },
    { x: gw / 2, y: 0 },
    { x: gw / 2 - rc, y: gh / 2 },
    { x: -gw / 2 + lc, y: gh / 2 },
    { x: -gw / 2, y: gh / 2 - lc },
    { x: -gw / 2, y: -gh / 2 + lc },
  ];
  const redraw = (hover: boolean) => {
    bg.clear();
    const boost = hover ? 1.5 : 1;
    for (let i = 3; i >= 1; i--) {
      const e = px(3 + i * 3);
      bg.fillStyle(c, 0.06 * boost * (4 - i) * 0.33).fillPoints(
        points(w + e * 2, h + e * 2, lcut + e, rcut + e),
        true,
      );
    }
    bg.fillStyle(c, 1).fillPoints(points(w, h, lcut, rcut), true);
    // 左侧亮竖条（"激活"指示）
    bg.fillStyle(0xffffff, hover ? 0.55 : 0.4).fillRect(
      -w / 2 + lcut + px(2),
      -h / 2 + px(SPACING.sm),
      px(2),
      h - px(SPACING.md),
    );
    // 描边
    bg.lineStyle(px(1), 0x000000, 0.5).strokePoints(points(w, h, lcut, rcut), true);
    bg.lineStyle(px(1), 0xffffff, 0.22).strokePoints(
      points(w - px(6), h - px(6), lcut - px(3), rcut - px(3)),
      true,
    );
    // 右侧 chevron 双箭头（hint 进入方向）
    bg.lineStyle(px(2), 0xffffff, hover ? 0.7 : 0.5);
    const cx = w / 2 - rcut + px(4);
    bg.beginPath();
    bg.moveTo(cx - px(8), -px(6));
    bg.lineTo(cx, 0);
    bg.lineTo(cx - px(8), px(6));
    bg.strokePath();
  };
  redraw(false);
  return { container, redraw, w, h };
};

// =============================================================================
// V6：描边款 + 4 角 cyber bracket
//   极简 outline 路线：透明 fill + outline + 4 角 L 装饰
// =============================================================================
const V6_outlineBracket: VariantFactory = (scene, w, h) => {
  const bg = scene.add.graphics();
  // V6 字配方跟 V4 同款（白字 / 黑厚描边 / 黑 drop blur）
  const title = makeLabel(scene, 20, LABEL_MAIN, TONE_V2);
  const sub = makeLabel(scene, 11, LABEL_SUB, TONE_V2).setAlpha(0.85);
  title.setPosition(0, Math.round(-px(8)));
  sub.setPosition(0, Math.round(px(16)));
  const container = scene.add.container(0, 0, [bg, title, sub]);
  const c = HEX.primary;
  const cornerLen = px(14);
  const redraw = (hover: boolean) => {
    bg.clear();
    // 内淡 fill + 外发光
    const boost = hover ? 1.5 : 1;
    // mint 底 + 亮 mint 叠层让整体偏白但保留色调（avoid 纯白导致的灰调）
    bg.fillStyle(c, hover ? 0.28 : 0.2).fillRect(-w / 2, -h / 2, w, h);
    bg.fillStyle(HEX.immuneBright, hover ? 0.45 : 0.34).fillRect(-w / 2, -h / 2, w, h);
    // 密集灰白网格纹理（半透明区内）：每 4 CSS px 一条横+竖（网格更浅）
    const gridStep = px(4);
    const gridAlpha = hover ? 0.1 : 0.07;
    bg.lineStyle(px(0.5), 0xffffff, gridAlpha);
    // 竖线
    for (let gx = -w / 2 + gridStep; gx < w / 2; gx += gridStep) {
      bg.lineBetween(gx, -h / 2, gx, h / 2);
    }
    // 横线
    for (let gy = -h / 2 + gridStep; gy < h / 2; gy += gridStep) {
      bg.lineBetween(-w / 2, gy, w / 2, gy);
    }
    for (let i = 3; i >= 1; i--) {
      const e = px(2 + i * 3);
      bg.lineStyle(px(1), c, 0.1 * boost * (4 - i) * 0.33).strokeRect(
        -w / 2 - e,
        -h / 2 - e,
        w + e * 2,
        h + e * 2,
      );
    }
    // 外 stroke
    bg.lineStyle(px(1.5), c, hover ? 1 : 0.7).strokeRect(-w / 2, -h / 2, w, h);
    // 4 角 L 装饰（粗）
    const lw = px(2.5);
    bg.lineStyle(lw, c, 1);
    const x = -w / 2;
    const y = -h / 2;
    bg.lineBetween(x, y, x + cornerLen, y);
    bg.lineBetween(x, y, x, y + cornerLen);
    bg.lineBetween(x + w - cornerLen, y, x + w, y);
    bg.lineBetween(x + w, y, x + w, y + cornerLen);
    bg.lineBetween(x, y + h - cornerLen, x, y + h);
    bg.lineBetween(x, y + h, x + cornerLen, y + h);
    bg.lineBetween(x + w - cornerLen, y + h, x + w, y + h);
    bg.lineBetween(x + w, y + h - cornerLen, x + w, y + h);
    // 中线水平细装饰
    bg.lineStyle(px(1), c, 0.18);
    bg.lineBetween(-w / 2 + px(SPACING.sm), 0, -w / 2 + cornerLen + px(SPACING.sm), 0);
    bg.lineBetween(w / 2 - cornerLen - px(SPACING.sm), 0, w / 2 - px(SPACING.sm), 0);
  };
  redraw(false);
  return { container, redraw, w, h };
};

// =============================================================================
// V7：三角洲行动「开始行动」配方
//   实心 mint fill + 4 内角 L bracket（黑）+ 顶部装饰 dash + 左上 tag + 右下 metric
// =============================================================================
const V7_deltaForce: VariantFactory = (scene, w, h) => {
  // bgUnder: mint fill + 外发光（在剪影下面）
  // bgOver: 顶白叠层 + L bracket + dash + 外描边（在剪影上面）
  const bgUnder = scene.add.graphics();
  const bgOver = scene.add.graphics();
  // 巨噬细胞 svg 剪影底纹（项目自带高质量资源 + tint 深绿 + 低 alpha）
  const silhouette = scene.textures.exists(SILHOUETTE_TEX)
    ? scene.add
        .image(0, px(2), SILHOUETTE_TEX)
        .setOrigin(0.5)
        .setDisplaySize(h * 0.92, h * 0.92)
        .setTint(HEX.immuneDeep)
    : null;
  const title = makeLabel(scene, 22, LABEL_MAIN, TONE_V7);
  // 左上小 tag（关卡名）
  const tag = scene.add
    .text(0, 0, '关 11 · 胸腺训练', {
      fontFamily: FONT,
      fontSize: `${px(9)}px`,
      fontStyle: 'bold',
      color: COLOR.immuneDeep,
    })
    .setOrigin(0, 0)
    .setAlpha(0.7)
    .setLetterSpacing(px(9 * 0.12))
    .setResolution(DPR);
  // 右下小 metric（cyber 数据感，等宽）
  const metric = scene.add
    .text(0, 0, 'OP-2026-0428', {
      fontFamily: FONT_MONO,
      fontSize: `${px(8)}px`,
      color: COLOR.immuneDeep,
    })
    .setOrigin(1, 1)
    .setAlpha(0.5)
    .setResolution(DPR);
  // 子节点顺序：bgUnder → silhouette → bgOver → 文字（保 L bracket 等装饰盖在剪影上）
  const children: GameObjects.GameObject[] = [bgUnder];
  if (silhouette) children.push(silhouette);
  children.push(bgOver, tag, title, metric);
  const container = scene.add.container(0, 0, children);
  title.setPosition(0, px(2));
  const c = HEX.primary;
  const inset = px(SPACING.sm); // 内 L 角 inset 距离
  const cornerLen = px(8);
  tag.setPosition(-w / 2 + inset + cornerLen + px(4), -h / 2 + inset + px(1));
  metric.setPosition(w / 2 - inset - px(4), h / 2 - inset);
  const redraw = (hover: boolean) => {
    bgUnder.clear();
    bgOver.clear();
    // 外发光（最底）
    const boost = hover ? 1.5 : 1;
    for (let i = 3; i >= 1; i--) {
      const e = px(2 + i * 3);
      bgUnder
        .fillStyle(c, 0.06 * boost * (4 - i) * 0.33)
        .fillRect(-w / 2 - e, -h / 2 - e, w + e * 2, h + e * 2);
    }
    // 主体：实心 mint
    bgUnder.fillStyle(c, 1).fillRect(-w / 2, -h / 2, w, h);
    // 剪影 alpha 跟 hover 切换
    if (silhouette) silhouette.setAlpha(hover ? 0.22 : 0.16);
    // 顶部 ~40% 白色叠层（盖在剪影上让顶部更亮，柔和高光）
    bgOver.fillStyle(0xffffff, 0.1).fillRect(-w / 2, -h / 2, w, h * 0.4);
    // 4 内 L 角 bracket（深绿 + 比字色更浅的 alpha）
    const x = -w / 2 + inset;
    const y = -h / 2 + inset;
    const ex = w / 2 - inset;
    const ey = h / 2 - inset;
    bgOver.lineStyle(px(1), HEX.immuneDeep, hover ? 0.45 : 0.3);
    bgOver.lineBetween(x, y, x + cornerLen, y);
    bgOver.lineBetween(x, y, x, y + cornerLen);
    bgOver.lineBetween(ex - cornerLen, y, ex, y);
    bgOver.lineBetween(ex, y, ex, y + cornerLen);
    bgOver.lineBetween(x, ey - cornerLen, x, ey);
    bgOver.lineBetween(x, ey, x + cornerLen, ey);
    bgOver.lineBetween(ex - cornerLen, ey, ex, ey);
    bgOver.lineBetween(ex, ey - cornerLen, ex, ey);
    // 顶部装饰 dash 线（更浅）
    bgOver.lineStyle(px(1), HEX.immuneDeep, 0.14);
    bgOver.lineBetween(x + cornerLen + px(2), y + px(2), x + (ex - x) * 0.55, y + px(2));
    // 底部右侧短 dash（chevron 暗示）
    bgOver.lineBetween(ex - cornerLen - px(20), ey - px(2), ex - cornerLen - px(2), ey - px(2));
    // 外描边（最浅）
    bgOver.lineStyle(px(1), HEX.immuneDeep, 0.1).strokeRect(-w / 2, -h / 2, w, h);
  };
  redraw(false);
  return { container, redraw, w, h };
};

const VARIANTS: {
  key: string;
  title: string;
  tone: LabelTone;
  /** 覆盖默认按钮高度（CSS px），不传则用 BTN_H_CSS */
  hCss?: number;
  build: VariantFactory;
}[] = [
  { key: 'v1', title: 'V1 octagon 双层 bevel', tone: TONE_V1, build: V1_octagonDualBevel },
  { key: 'v2', title: 'V2 圆角 顶部高光', tone: TONE_V2, build: V2_roundedBevel },
  { key: 'v3', title: 'V3 切角 scanline + LED', tone: TONE_V3, build: V3_chamferScanlineLed },
  {
    key: 'v4',
    title: 'V4 双层框 外深内亮（高 76）',
    tone: TONE_V2,
    hCss: 76,
    build: V4_doubleLayer,
  },
  { key: 'v5', title: 'V5 chevron 方向指示', tone: TONE_V5, build: V5_chevronDirected },
  { key: 'v6', title: 'V6 描边 cyber L 角', tone: TONE_V2, build: V6_outlineBracket },
  {
    key: 'v7',
    title: 'V7 三角洲风（高 76）',
    tone: TONE_V7,
    hCss: 76,
    build: V7_deltaForce,
  },
];

const SILHOUETTE_TEX = 'button-lab-silhouette-macrophage';

export class ButtonLabScene extends Scene {
  constructor() {
    super('ButtonLabScene');
  }

  preload(): void {
    // V7 底纹用项目自带的巨噬细胞 svg（256×256 raster）
    if (!this.textures.exists(SILHOUETTE_TEX)) {
      this.load.svg(SILHOUETTE_TEX, '/assets/towers/macrophage-1.svg', {
        width: 256,
        height: 256,
      });
    }
  }

  create(): void {
    const W = this.scale.width;

    // 顶栏 · 标题 + 返回
    this.add
      .text(W / 2, px(SPACING.lg), 'BUTTON LAB · 主按钮配方', {
        fontFamily: FONT,
        fontSize: `${px(14)}px`,
        fontStyle: '900',
        color: COLOR.primary,
      })
      .setOrigin(0.5, 0)
      .setLetterSpacing(px(14 * 0.18))
      .setResolution(DPR);

    const back = this.add
      .text(px(SPACING.md), px(SPACING.lg), '← 返回', {
        fontFamily: FONT,
        fontSize: `${px(12)}px`,
        color: COLOR.textDim,
      })
      .setOrigin(0, 0)
      .setResolution(DPR);
    back.setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => {
      sfx.uiClick();
      transitionToScene(this, 'MainMenuScene');
    });

    // variant stack：垂直排列，按钮宽统一，高可被 v.hCss 覆盖
    const w = px(BTN_W_CSS);
    // 每行起点累加：每个 variant 高度可能不同（V5 单独高），用 cursor 串起来
    let cursor = px(SPACING.xl + SPACING.md);
    const rowGap = px(SPACING.xl); // 行间留白（标题+副标+按钮 后到下一行 title）

    for (const v of VARIANTS) {
      const btnH = px(v.hCss ?? BTN_H_CSS);
      const y = cursor;
      // 行号 + 标题
      this.add
        .text(W / 2, y, v.title, {
          fontFamily: FONT,
          fontSize: `${px(10)}px`,
          color: COLOR.textDim,
        })
        .setOrigin(0.5, 0)
        .setLetterSpacing(px(10 * 0.18))
        .setResolution(DPR);
      // 字色配方副标
      this.add
        .text(W / 2, y + px(SPACING.sm + SPACING.xs), `字: ${v.tone.desc}`, {
          fontFamily: FONT,
          fontSize: `${px(9)}px`,
          color: COLOR.textXDim,
        })
        .setOrigin(0.5, 0)
        .setResolution(DPR);
      // 按钮
      const built = v.build(this, w, btnH);
      built.container.setPosition(W / 2, y + px(SPACING.lg + SPACING.sm) + btnH / 2);
      built.container.setSize(w, btnH);
      const hit = setRectInteractive(built.container, w, btnH, { useHandCursor: true });
      built.container.on('pointerover', () => built.redraw(true));
      built.container.on('pointerout', () => built.redraw(false));
      built.container.on('pointerdown', () => sfx.uiClick());
      void hit;
      cursor = y + px(SPACING.lg + SPACING.sm) + btnH + rowGap;
    }

    // 滚动支持（内容超出视口时用 wheel / 拖拽上下移动 camera scroll）
    const H = this.scale.height;
    const contentBottom = cursor + px(SPACING.xl);
    const maxScroll = Math.max(0, contentBottom - H);
    if (maxScroll > 0) {
      let scrollY = 0;
      this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
        scrollY = Math.max(0, Math.min(maxScroll, scrollY + dy));
        this.cameras.main.setScroll(0, scrollY);
      });
      // 拖拽滚动：pointerdown 记起点，pointermove 跟随
      let dragStartY = 0;
      let dragStartScroll = 0;
      let dragging = false;
      this.input.on('pointerdown', (p: { y: number }) => {
        dragStartY = p.y;
        dragStartScroll = scrollY;
        dragging = true;
      });
      this.input.on('pointermove', (p: { y: number }) => {
        if (!dragging) return;
        const dy = dragStartY - p.y;
        scrollY = Math.max(0, Math.min(maxScroll, dragStartScroll + dy));
        this.cameras.main.setScroll(0, scrollY);
      });
      this.input.on('pointerup', () => {
        dragging = false;
      });
      this.input.on('pointerupoutside', () => {
        dragging = false;
      });
      // 滚动提示
      this.add
        .text(W - px(SPACING.md), px(SPACING.lg), '↕ 滚动 / 拖拽', {
          fontFamily: FONT,
          fontSize: `${px(10)}px`,
          color: COLOR.textXDim,
        })
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setResolution(DPR);
    }
  }
}
