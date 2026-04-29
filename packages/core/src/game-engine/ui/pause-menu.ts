import type { GameObjects, Scene } from 'phaser';
import { SPACING } from '../layout/spacing';
import { COLOR, FONT, HEX, px } from '../style';
import { PhaserButton } from './phaser-button';

export interface PauseMenuCallbacks {
  onResume: () => void;
  onReplay: () => void;
  onOpenSettings: () => void;
  onBackToMenu: () => void;
}

const CARD_W = 280;

/**
 * 暂停 Modal：全屏 dim + 中央窄卡片 + 4 行按钮（继续/重玩/设置/返回菜单）。
 * 像素级复刻 React 版 PauseMenu：卡片 280×自适应，padding 22，按钮间距 8。
 */
export class PauseMenu {
  private scene: Scene;
  private container: GameObjects.Container;
  private dim: GameObjects.Graphics;
  private card: GameObjects.Graphics;
  private titleText: GameObjects.Text;
  private resumeBtn: PhaserButton;
  private replayBtn: PhaserButton;
  private settingsBtn: PhaserButton;
  private menuBtn: PhaserButton;
  private visible = false;
  /** 回放模式下隐藏"重玩本关"（重玩无意义；只保留继续/设置/返回菜单） */
  private replayMode = false;

  constructor(scene: Scene, cb: PauseMenuCallbacks) {
    this.scene = scene;
    this.dim = scene.add.graphics();
    this.card = scene.add.graphics();

    this.titleText = scene.add
      .text(0, 0, '已暂停', {
        fontFamily: FONT,
        fontSize: `${px(13)}px`,
        color: COLOR.primary,
      })
      .setLetterSpacing(px(13 * 0.35))
      .setOrigin(0.5);
    this.titleText.setShadow(0, 0, COLOR.primary, px(8), true, true);

    // 变体映射到 PhaserButton 选项：
    // primary → 填充款（最强 CTA）；secondary → 描边 + primary 色；danger → 描边 + danger 色
    const mkBtn = (
      label: string,
      variant: 'primary' | 'secondary' | 'danger',
      onTap: () => void,
    ): PhaserButton =>
      new PhaserButton(scene, 0, 0, {
        label,
        width: CARD_W - 22 * 2,
        height: 40,
        fontSize: variant === 'primary' ? 12 : 11,
        letterSpacingEm: 0.25,
        filled: variant === 'primary',
        color: variant === 'danger' ? HEX.danger : HEX.primary,
        origin: 'topLeft',
        onTap,
      });
    this.resumeBtn = mkBtn('继续', 'primary', cb.onResume);
    this.replayBtn = mkBtn('重玩本关', 'secondary', cb.onReplay);
    this.settingsBtn = mkBtn('设置', 'secondary', cb.onOpenSettings);
    this.menuBtn = mkBtn('返回菜单', 'danger', cb.onBackToMenu);

    this.container = scene.add.container(0, 0, [
      this.dim,
      this.card,
      this.titleText,
      this.resumeBtn.container,
      this.replayBtn.container,
      this.settingsBtn.container,
      this.menuBtn.container,
    ]);
    this.container.setDepth(450);
    this.container.setVisible(false);
  }

  isVisible(): boolean {
    return this.visible;
  }

  /**
   * 回放模式：隐藏"重玩本关"按钮（对回放没意义），保留继续/设置/返回菜单。
   * 需在首次 show() 前调用；show 里会触发 layout 按最新按钮列表重排。
   */
  setReplayMode(v: boolean): void {
    this.replayMode = v;
    this.replayBtn.container.setVisible(!v);
  }

  show(): void {
    this.visible = true;
    this.container.setVisible(true);
    this.container.setAlpha(0);
    this.scene.tweens.add({ targets: this.container, alpha: 1, duration: 180, ease: 'Power2' });
    const W = this.scene.scale.width;
    const H = this.scene.scale.height;
    this.layout(W, H);
  }

  hide(): void {
    this.visible = false;
    this.container.setVisible(false);
  }

  layout(W: number, H: number): void {
    this.container.setPosition(0, 0);
    this.dim.clear();
    this.dim.fillStyle(HEX.bg, 0.78).fillRect(0, 0, W, H);
    this.layoutChildren(W, H);
  }

  private layoutChildren(W: number, H: number): void {
    const cardW = Math.min(px(CARD_W), W * 0.88);
    const padX = px(SPACING.md + SPACING.xs + 2); // = px(22)
    const padY = px(SPACING.md + SPACING.xs + 2); // = px(22)
    const titleMarginBottom = px(SPACING.md + 2); // = px(18)
    const btnGap = px(SPACING.sm);
    const btnH = px(SPACING.xl + SPACING.sm); // = px(40)

    // 计算卡片高度（回放模式下 replayBtn 被跳过，不占位）
    const titleH = this.titleText.height;
    const btns = this.replayMode
      ? [this.resumeBtn, this.settingsBtn, this.menuBtn]
      : [this.resumeBtn, this.replayBtn, this.settingsBtn, this.menuBtn];
    const btnsH = btns.length * btnH + (btns.length - 1) * btnGap;
    const cardH = padY * 2 + titleH + titleMarginBottom + btnsH;

    const cardX = Math.round((W - cardW) / 2);
    const cardY = Math.round((H - cardH) / 2);

    // 重画卡片
    this.card.clear();
    this.card
      .fillStyle(HEX.bg, 0.98)
      .fillRect(cardX, cardY, cardW, cardH)
      .lineStyle(px(1), HEX.primary, 0.5)
      .strokeRect(cardX, cardY, cardW, cardH);

    // 标题
    this.titleText.setPosition(W / 2, cardY + padY + titleH / 2);

    // 按钮宽度等于卡片内宽；PhaserButton 自己管重绘，这里只 setSizeWorld + setPosition
    const btnW = cardW - padX * 2;
    let by = cardY + padY + titleH + titleMarginBottom;
    for (const btn of btns) {
      btn.setSizeWorld(btnW, btnH);
      btn.container.setPosition(cardX + padX, by);
      by += btnH + btnGap;
    }
  }

  destroy(): void {
    this.container.destroy(true);
  }
}
