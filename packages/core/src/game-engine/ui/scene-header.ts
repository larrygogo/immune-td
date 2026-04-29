import type { GameObjects, Scene } from 'phaser';
import { DPR } from '../dpr';
import { SPACING } from '../layout/spacing';
import { COLOR, FONT, HEX, px } from '../style';
import { PhaserButton } from './phaser-button';

export interface SceneHeaderOptions {
  /** 标题（可选）。不传则只渲染返回按钮，适合图鉴那种 tab 本身就是上下文的页面 */
  title?: string;
  /** 次标（小字 dim）。title 不传时忽略 */
  subtitle?: string;
  /**
   * 'simple'（默认）: 小标题居中于 back btn 右侧占位，全站统一极简款
   * 'hero': 大标题 + 次标垂直堆叠 + hairline 装饰，预留给未来"扉页"式页面
   */
  variant?: 'simple' | 'hero';
  /** 标题字号 CSS px；simple 默认 12（跟 LevelSelect 一致），hero 默认 26 */
  titleFontSize?: number;
  /** 是否给标题加主色 glow；simple 默认 false，hero 默认 true */
  titleGlow?: boolean;
  /** hero variant 专用：是否画下方 hairline 装饰，默认 true */
  showHairline?: boolean;
  /** 点击返回触发的回调 */
  backOnTap: () => void;
  /** 返回按钮 label，默认 '← 返回' */
  backLabel?: string;
  /** 返回按钮 aria（暂存供未来 a11y 桥用） */
  backAriaLabel?: string;
}

/**
 * 通用场景顶栏：左侧返回按钮 + 居中标题（+ 可选次标 + 可选 hairline）。
 *
 * 统一 Settings / Loadout / Encyclopedia / LevelSelect 原本各自写的
 * "back btn 放左上 + 大标题放中间" 样板。视觉风格走 variant 切换。
 */
export class SceneHeader {
  readonly backBtn: PhaserButton;
  private titleText: GameObjects.Text | null = null;
  private subtitleText: GameObjects.Text | null = null;
  private hairline: GameObjects.Graphics | null = null;
  private variant: 'simple' | 'hero';

  constructor(scene: Scene, opts: SceneHeaderOptions) {
    this.variant = opts.variant ?? 'simple';

    this.backBtn = new PhaserButton(scene, 0, 0, {
      label: opts.backLabel ?? '← 返回',
      width: 88,
      height: 32,
      fontSize: 11,
      letterSpacingEm: 0.25,
      origin: 'topLeft',
      onTap: opts.backOnTap,
      ariaLabel: opts.backAriaLabel ?? 'back',
    });

    if (opts.title) {
      const titleSize = opts.titleFontSize ?? (this.variant === 'hero' ? 26 : 12);
      this.titleText = scene.add
        .text(0, 0, opts.title, {
          fontFamily: FONT,
          fontSize: `${px(titleSize)}px`,
          fontStyle: this.variant === 'hero' ? 'bold' : '',
          color: COLOR.primary,
        })
        .setLetterSpacing(px(titleSize * (this.variant === 'hero' ? 0.28 : 0.3)))
        .setOrigin(0.5)
        .setResolution(DPR);
      const wantsGlow = opts.titleGlow ?? this.variant === 'hero';
      if (wantsGlow) {
        const glowSize = this.variant === 'hero' ? 12 : 8;
        this.titleText.setShadow(0, 0, COLOR.primary, px(glowSize), true, true);
      }

      if (opts.subtitle) {
        const subSize = this.variant === 'hero' ? 9 : 10;
        const subSpacing = this.variant === 'hero' ? 0.5 : 0.3;
        this.subtitleText = scene.add
          .text(0, 0, opts.subtitle, {
            fontFamily: FONT,
            fontSize: `${px(subSize)}px`,
            color: COLOR.dim,
          })
          .setLetterSpacing(px(subSize * subSpacing))
          .setOrigin(0.5)
          .setResolution(DPR);
      }
    }

    if (this.variant === 'hero' && (opts.showHairline ?? true)) {
      this.hairline = scene.add.graphics();
    }
  }

  /**
   * 根据视口宽度 layout。返回顶栏底部 y（world 单位），给下方内容算 top 偏移用。
   *
   * `topOffset`：wx 端胶囊 / 状态栏 safe area，从 SAFE_TOP 传入；H5 端为 0。
   * 顶部所有元素整体下移 topOffset，避免 back btn / 标题被胶囊遮挡。
   */
  layout(W: number, topOffset = 0): number {
    if (this.variant === 'hero') {
      return this.layoutHero(W, topOffset);
    }
    return this.layoutSimple(W, topOffset);
  }

  private layoutSimple(W: number, topOffset: number): number {
    const topPad = topOffset + px(SPACING.sm + SPACING.xs); // = px(12)
    this.backBtn.container.setPosition(px(SPACING.md), topPad);
    const backBottom = topPad + this.backBtn.heightPx;
    if (!this.titleText) {
      // 无标题模式（图鉴等 tab 页）：顶栏只占 backBtn 高度 + padTop
      return backBottom + px(SPACING.sm);
    }
    // back btn 占位 = px(16)+ px(88)（btn 宽）+ px(8) padding；左右各预留同宽给标题居中
    const leftBound = px(SPACING.md + (SPACING.xxl + SPACING.xl + SPACING.sm) + SPACING.sm);
    const rightBound = W - px(SPACING.md + (SPACING.xxl + SPACING.xl + SPACING.sm) + SPACING.sm);
    const cx = (leftBound + rightBound) / 2;
    // 标题 origin 0.5，y 给中线；跟 back btn 的垂直中点对齐，视觉水平对齐
    const backCenterY = topPad + this.backBtn.heightPx / 2;
    this.titleText.setPosition(cx, backCenterY);
    if (this.subtitleText) {
      this.subtitleText.setPosition(cx, backCenterY + this.titleText.height / 2 + px(SPACING.xs));
      return this.subtitleText.y + this.subtitleText.height / 2 + px(SPACING.sm);
    }
    return backBottom + px(SPACING.sm);
  }

  private layoutHero(W: number, topOffset: number): number {
    this.backBtn.container.setPosition(px(SPACING.md), topOffset + px(SPACING.md + SPACING.xs)); // y = px(20)
    if (!this.titleText) {
      return topOffset + px(SPACING.md + SPACING.xs) + this.backBtn.heightPx + px(SPACING.sm);
    }
    const titleY = topOffset + px(SPACING.xl + SPACING.xs); // = px(36)
    this.titleText.setPosition(W / 2, titleY);
    let bottomY = titleY + this.titleText.height / 2;
    if (this.subtitleText) {
      this.subtitleText.setPosition(W / 2, titleY + this.titleText.height / 2 + px(SPACING.sm + 2)); // gap = px(10)
      bottomY = this.subtitleText.y + this.subtitleText.height;
    }
    if (this.hairline) {
      const hlY = bottomY + px(SPACING.sm + SPACING.xs + 2); // gap = px(14)
      this.hairline.clear();
      // 双虚线 + 中央菱形（医疗仪表风，源自 Settings 原设计）
      const gapHalf = px(SPACING.lg + SPACING.xs + 2); // = px(30)
      const leftStart = W * 0.22;
      const leftEnd = W / 2 - gapHalf;
      const rightStart = W / 2 + gapHalf;
      const rightEnd = W * 0.78;
      drawDashedLine(this.hairline, leftStart, hlY, leftEnd);
      drawDashedLine(this.hairline, rightStart, hlY, rightEnd);
      this.hairline
        .fillStyle(HEX.primary, 0.65)
        // 中央菱形：边长 px(3) 紧凑视觉
        .fillTriangle(W / 2 - px(3), hlY, W / 2, hlY - px(3), W / 2 + px(3), hlY)
        .fillTriangle(W / 2 - px(3), hlY, W / 2, hlY + px(3), W / 2 + px(3), hlY);
      bottomY = hlY + px(SPACING.xs);
    }
    return bottomY + px(SPACING.sm);
  }

  destroy(): void {
    this.backBtn.destroy();
    this.titleText?.destroy();
    this.subtitleText?.destroy();
    this.hairline?.destroy();
  }
}

function drawDashedLine(g: GameObjects.Graphics, x1: number, y: number, x2: number): void {
  const dash = px(SPACING.xs);
  const gap = px(3); // 紧凑虚线间隔（非 SPACING）
  g.lineStyle(px(1), HEX.primary, 0.35);
  let x = x1;
  while (x < x2) {
    const end = Math.min(x + dash, x2);
    g.beginPath().moveTo(x, y).lineTo(end, y).strokePath();
    x = end + gap;
  }
}
