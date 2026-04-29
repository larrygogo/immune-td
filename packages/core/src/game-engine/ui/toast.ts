import type { GameObjects, Scene } from 'phaser';
import { DPR } from '../dpr';
import { SPACING } from '../layout/spacing';
import { COLOR, FONT, HEX, px } from '../style';

/**
 * 短暂错误 / 提示 Toast。调用 show() 显示 1.2s 后淡出。
 * 再次 show 会打断上次 tween。
 */
export class Toast {
  private scene: Scene;
  private text: GameObjects.Text;
  private bg: GameObjects.Graphics;
  private container: GameObjects.Container;
  private currentTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
    this.bg = scene.add.graphics();
    this.text = scene.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: `${px(13)}px`,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setLetterSpacing(px(13 * 0.2))
      .setResolution(DPR);
    this.container = scene.add.container(0, 0, [this.bg, this.text]);
    this.container.setDepth(9999);
    this.container.setVisible(false);
  }

  show(message: string, color: string = COLOR.primary): void {
    this.text.text = message;
    this.text.setColor(color);
    const colorHex = Number.parseInt(color.replace('#', ''), 16);
    // toast 内 padding：横 px(28) = lg + xs，纵 px(16) = md
    const tw = this.text.width + px(SPACING.lg + SPACING.xs);
    const th = this.text.height + px(SPACING.md);
    this.bg.clear();
    this.bg.fillStyle(HEX.black, 0.75).fillRect(-tw / 2, -th / 2, tw, th);
    this.bg.lineStyle(px(1), colorHex, 0.8).strokeRect(-tw / 2, -th / 2, tw, th);

    this.container.setVisible(true);
    this.container.setAlpha(1);
    const W = this.scene.scale.width;
    const H = this.scene.scale.height;
    this.container.setPosition(W / 2, H * 0.18);

    this.currentTween?.stop();
    this.currentTween = this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      delay: 1600,
      duration: 500,
      ease: 'Power2',
      onComplete: () => {
        this.container.setVisible(false);
      },
    });
  }

  destroy(): void {
    this.currentTween?.stop();
    this.container.destroy(true);
  }
}
