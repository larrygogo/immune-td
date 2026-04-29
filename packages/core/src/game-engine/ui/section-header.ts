import type { GameObjects, Scene } from 'phaser';
import { SPACING } from '../layout/spacing';
import { COLOR, FONT, HEX, px } from '../style';

export interface SectionHeaderOptions {
  /** 小号 dim kicker 标（如 'AUDIO' / 'TUTORIAL'），origin bottom-left */
  kicker: string;
  /** 大号主色 title（如 '音 频' / '教 学'），origin bottom-left，跟 kicker baseline 对齐 */
  title: string;
  /** 是否 kicker + title 水平拼接成一行（'inline'，Settings 卡片风格）
   *  还是上下两行堆叠（'stack'）。默认 'inline' */
  layout?: 'inline' | 'stack';
  /** 下方是否画 hairline 分隔线（淡色虚线），默认 true */
  showHairline?: boolean;
  kickerFontSize?: number; // 默认 10
  titleFontSize?: number; // 默认 16
}

/**
 * 卡片 / 区域的小 header：kicker 英文小字 + 中文大字 + 可选 hairline。
 *
 * Settings 的「AUDIO · 音 频」「TUTORIAL · 教 学」两个 section 用的就是这个
 * 模板。组件自管位置（相对容器 0,0），callsite 只 setPosition(x, y)。
 */
export class SectionHeader {
  readonly container: GameObjects.Container;
  private kickerText: GameObjects.Text;
  private titleText: GameObjects.Text;
  private hairline: GameObjects.Graphics | null;
  private opts: Required<Omit<SectionHeaderOptions, 'showHairline'>> & { showHairline: boolean };

  constructor(scene: Scene, opts: SectionHeaderOptions) {
    this.opts = {
      kicker: opts.kicker,
      title: opts.title,
      layout: opts.layout ?? 'inline',
      showHairline: opts.showHairline ?? true,
      kickerFontSize: opts.kickerFontSize ?? 10,
      titleFontSize: opts.titleFontSize ?? 16,
    };

    this.kickerText = scene.add
      .text(0, 0, this.opts.kicker, {
        fontFamily: FONT,
        fontSize: `${px(this.opts.kickerFontSize)}px`,
        color: COLOR.dim,
      })
      .setLetterSpacing(px(this.opts.kickerFontSize * 0.4))
      .setOrigin(0, 1);

    this.titleText = scene.add
      .text(0, 0, this.opts.title, {
        fontFamily: FONT,
        fontSize: `${px(this.opts.titleFontSize)}px`,
        fontStyle: 'bold',
        color: COLOR.primary,
      })
      .setLetterSpacing(px(this.opts.titleFontSize * 0.22))
      .setOrigin(0, 1);
    this.titleText.setShadow(0, 0, COLOR.primary, px(10), true, true);

    this.hairline = this.opts.showHairline ? scene.add.graphics() : null;

    this.container = scene.add.container(0, 0, [
      this.kickerText,
      this.titleText,
      ...(this.hairline ? [this.hairline] : []),
    ]);
  }

  /**
   * 根据容器宽度布局：inline 模式下 kicker 和 title baseline 对齐水平排开；
   * stack 模式下 kicker 在上、title 在下。hairline 画到 width 宽度。
   * 返回整块 header 高度（含 hairline 若启用），给容器算下一块 y 用。
   */
  setWidth(width: number): number {
    if (this.opts.layout === 'inline') {
      // baseline 对齐：两者 y 相同（都用 origin 0,1）
      const baselineY = this.opts.titleFontSize + px(SPACING.xs);
      this.kickerText.setPosition(0, baselineY);
      this.titleText.setPosition(this.kickerText.width + px(SPACING.sm + 2), baselineY); // gap = px(10)
    } else {
      const kickerY = this.opts.kickerFontSize + px(2); // 紧密堆叠 px(2)
      this.kickerText.setPosition(0, kickerY);
      this.titleText.setPosition(0, kickerY + px(SPACING.sm) + this.opts.titleFontSize);
    }

    const bottomY = this.titleText.y + px(SPACING.sm);
    if (this.hairline) {
      this.hairline
        .clear()
        .lineStyle(px(1), HEX.primary, 0.2)
        .lineBetween(0, bottomY, width, bottomY);
      return bottomY + px(SPACING.sm);
    }
    return bottomY + px(SPACING.xs);
  }

  destroy(): void {
    this.container.destroy(true);
  }
}
