import type { GameObjects, Geom, Input, Scene } from 'phaser';
import { bgm } from '@audio/bgm';
import { sfx } from '@audio/sfx';
import { useMetaStore } from '@ui/store';
import { setRectInteractive } from '../interactive';
import { SPACING } from '../layout/spacing';
import { COLOR, FONT, HEX, px } from '../style';

/**
 * 战斗场景专用的音频设置 Modal（替代切 SettingsScene）。
 * 结构仿 PauseMenu：全屏 dim + 居中卡片 + 2 个滑条 + 静音按钮 + 关闭按钮。
 * 复用 metaStore.settings / bgm / sfx，与完整 SettingsScene 的数据源一致。
 */

interface Slider {
  container: GameObjects.Container;
  track: GameObjects.Graphics;
  fill: GameObjects.Graphics;
  thumb: GameObjects.Graphics;
  pctText: GameObjects.Text;
  hitRect: Geom.Rectangle;
  sliderHit: GameObjects.Container;
  width: number;
  value: number;
  onChange: (v: number) => void;
}

interface MuteBtn {
  container: GameObjects.Container;
  bg: GameObjects.Graphics;
  label: GameObjects.Text;
  w: number;
  h: number;
}

const CARD_W = 320;
const CARD_PADDING = 22;
const SLIDER_W = CARD_W - CARD_PADDING * 2;

export class SettingsModal {
  private scene: Scene;
  private container: GameObjects.Container;
  private dim: GameObjects.Graphics;
  private card: GameObjects.Graphics;
  private titleText: GameObjects.Text;
  private sfxRow: Slider;
  private bgmRow: Slider;
  private muteLabel: GameObjects.Text;
  private muteBtn: MuteBtn;
  private closeBtn: {
    container: GameObjects.Container;
    bg: GameObjects.Graphics;
    w: number;
    h: number;
  };
  private visible = false;
  private onClose: () => void;
  private dragActive: Slider | null = null;
  private unsubPointerMove: (() => void) | null = null;
  private unsubPointerUp: (() => void) | null = null;

  constructor(scene: Scene, onClose: () => void) {
    this.scene = scene;
    this.onClose = onClose;
    this.dim = scene.add.graphics();
    this.card = scene.add.graphics();

    this.titleText = scene.add
      .text(0, 0, '音 频 设 置', {
        fontFamily: FONT,
        fontSize: `${px(13)}px`,
        color: COLOR.primary,
      })
      .setLetterSpacing(px(13 * 0.35))
      .setOrigin(0.5);
    this.titleText.setShadow(0, 0, COLOR.primary, px(8), true, true);

    const settings = useMetaStore.getState().settings;
    this.sfxRow = this.makeSlider('音效', settings.sfxVolume, (v) => {
      useMetaStore.getState().updateSettings({ sfxVolume: v });
      sfx.setVolume(v);
    });
    this.bgmRow = this.makeSlider('背景音乐', settings.bgmVolume, (v) => {
      useMetaStore.getState().updateSettings({ bgmVolume: v });
      bgm.setVolume(v);
    });

    this.muteLabel = scene.add
      .text(0, 0, '静音', {
        fontFamily: FONT,
        fontSize: `${px(11)}px`,
        color: COLOR.primary,
      })
      .setLetterSpacing(px(11 * 0.2))
      .setOrigin(0, 0.5);
    this.muteBtn = this.makeMuteBtn(settings.muted);

    this.closeBtn = this.makeCloseBtn();

    this.container = scene.add.container(0, 0, [
      this.dim,
      this.card,
      this.titleText,
      this.sfxRow.container,
      this.bgmRow.container,
      this.muteLabel,
      this.muteBtn.container,
      this.closeBtn.container,
    ]);
    this.container.setDepth(460); // 高于 PauseMenu(450) —— 由它触发打开
    this.container.setVisible(false);
  }

  isVisible(): boolean {
    return this.visible;
  }

  show(): void {
    this.visible = true;
    this.container.setVisible(true);
    this.container.setAlpha(0);
    this.scene.tweens.add({ targets: this.container, alpha: 1, duration: 160, ease: 'Power2' });
    // 重新从 store 拉一次（外部可能已改过）
    const settings = useMetaStore.getState().settings;
    this.sfxRow.value = settings.sfxVolume;
    this.bgmRow.value = settings.bgmVolume;
    this.redrawSlider(this.sfxRow);
    this.redrawSlider(this.bgmRow);
    this.redrawMute(this.muteBtn, settings.muted);
    this.layout(this.scene.scale.width, this.scene.scale.height);

    // 订阅全局 pointermove/up 用于滑条拖拽（show 时挂，hide 时卸）
    const moveHandler = (p: Input.Pointer) => {
      if (!this.dragActive) return;
      const local = this.scene.input.activePointer;
      const localX =
        (local?.x ?? p.x) -
        this.dragActive.sliderHit.x -
        this.dragActive.container.x -
        this.container.x;
      this.setFromX(this.dragActive, localX);
    };
    const upHandler = () => {
      this.dragActive = null;
    };
    this.scene.input.on('pointermove', moveHandler);
    this.scene.input.on('pointerup', upHandler);
    this.unsubPointerMove = () => this.scene.input.off('pointermove', moveHandler);
    this.unsubPointerUp = () => this.scene.input.off('pointerup', upHandler);
  }

  hide(): void {
    this.visible = false;
    this.container.setVisible(false);
    this.dragActive = null;
    this.unsubPointerMove?.();
    this.unsubPointerUp?.();
    this.unsubPointerMove = null;
    this.unsubPointerUp = null;
  }

  layout(W: number, H: number): void {
    this.container.setPosition(0, 0);
    this.dim.clear();
    this.dim.fillStyle(HEX.bg, 0.78).fillRect(0, 0, W, H);

    const cardW = Math.min(px(CARD_W), W * 0.92);
    const padX = px(CARD_PADDING);
    const padY = px(CARD_PADDING);
    const titleH = this.titleText.height;
    const titleMargin = px(SPACING.md);
    const sliderH = px(SPACING.xl + SPACING.sm + SPACING.xs); // = px(44)
    const muteRowH = px(SPACING.xl + SPACING.sm); // = px(40)
    const btnH = px(SPACING.xl + SPACING.xs + 2); // = px(38)
    const rowGap = px(SPACING.sm + SPACING.xs + 2); // = px(14)
    const cardH = padY * 2 + titleH + titleMargin + sliderH * 2 + rowGap + muteRowH + rowGap + btnH;

    const cardX = Math.round((W - cardW) / 2);
    const cardY = Math.round((H - cardH) / 2);

    this.card.clear();
    this.card
      .fillStyle(HEX.bg, 0.98)
      .fillRect(cardX, cardY, cardW, cardH)
      .lineStyle(px(1), HEX.primary, 0.5)
      .strokeRect(cardX, cardY, cardW, cardH);

    this.titleText.setPosition(W / 2, cardY + padY + titleH / 2);

    // 滑条宽度按卡片实际宽度裁剪（移动端窄屏 < CARD_W 时也适应）
    const actualSliderW = cardW - padX * 2;
    this.sfxRow.width = actualSliderW;
    this.bgmRow.width = actualSliderW;

    let y = cardY + padY + titleH + titleMargin;
    this.sfxRow.container.setPosition(cardX + padX, y);
    this.redrawSlider(this.sfxRow);
    y += sliderH;
    this.bgmRow.container.setPosition(cardX + padX, y);
    this.redrawSlider(this.bgmRow);
    y += sliderH + rowGap;

    // 静音行：label 左，按钮右
    this.muteLabel.setPosition(cardX + padX, y + muteRowH / 2);
    const muteBtnW = this.muteBtn.w;
    this.muteBtn.container.setPosition(
      cardX + cardW - padX - muteBtnW,
      y + (muteRowH - this.muteBtn.h) / 2,
    );
    y += muteRowH + rowGap;

    // 关闭按钮（底部全宽）
    const closeW = cardW - padX * 2;
    this.closeBtn.w = closeW;
    this.closeBtn.container.setSize(closeW, btnH);
    this.closeBtn.container.setPosition(cardX + padX, y);
    this.redrawCloseBtn();
  }

  destroy(): void {
    this.unsubPointerMove?.();
    this.unsubPointerUp?.();
    this.container.destroy(true);
  }

  // ---------- 内部：滑条 ----------

  private makeSlider(label: string, initialValue: number, onChange: (v: number) => void): Slider {
    const labelText = this.scene.add
      .text(0, 0, label, {
        fontFamily: FONT,
        fontSize: `${px(11)}px`,
        color: COLOR.primary,
      })
      .setLetterSpacing(px(11 * 0.2))
      .setOrigin(0, 0);
    const pctText = this.scene.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: `${px(11)}px`,
        color: COLOR.primary,
      })
      .setOrigin(1, 0);

    const track = this.scene.add.graphics();
    const fill = this.scene.add.graphics();
    const thumb = this.scene.add.graphics();

    const sliderHit = this.scene.add.container(0, 0);
    sliderHit.setSize(px(SLIDER_W), px(SPACING.lg + SPACING.xs)); // hitH = px(28)
    const hitRect = setRectInteractive(sliderHit, px(SLIDER_W), px(SPACING.lg + SPACING.xs), {
      useHandCursor: true,
      bgAlign: 'topLeft',
    });

    const container = this.scene.add.container(0, 0, [
      labelText,
      pctText,
      track,
      fill,
      thumb,
      sliderHit,
    ]);

    const row: Slider = {
      container,
      track,
      fill,
      thumb,
      pctText,
      hitRect,
      sliderHit,
      width: px(SLIDER_W),
      value: initialValue,
      onChange,
    };

    sliderHit.on('pointerdown', (p: Input.Pointer) => {
      this.dragActive = row;
      const localX = p.x - sliderHit.x - container.x - this.container.x;
      this.setFromX(row, localX);
    });

    return row;
  }

  private setFromX(row: Slider, x: number): void {
    const v = Math.max(0, Math.min(1, x / row.width));
    row.value = v;
    row.onChange(v);
    this.redrawSlider(row);
  }

  private redrawSlider(row: Slider): void {
    const w = row.width;
    const labelAndPctY = 0;
    const trackY = px(SPACING.md + 2); // = px(18)
    const trackH = px(3); // 紧凑视觉

    row.sliderHit.setSize(w, px(SPACING.lg + SPACING.xs));
    row.hitRect.setSize(w, px(SPACING.lg + SPACING.xs));
    row.hitRect.setPosition(0, px(SPACING.sm + 2));
    row.sliderHit.setPosition(0, px(SPACING.sm + 2));

    // label + 百分比同一行
    const labelText = row.container.list[0] as GameObjects.Text;
    const pctText = row.pctText;
    labelText.setPosition(0, labelAndPctY);
    pctText.setPosition(w, labelAndPctY);
    pctText.text = `${Math.round(row.value * 100)}%`;

    row.track
      .clear()
      .fillStyle(HEX.primary, 0.18)
      .fillRect(0, trackY, w, trackH)
      .fillStyle(HEX.primary, 0.55)
      .fillRect(0, trackY - px(2), px(1), trackH + px(4))
      .fillRect(w - px(1), trackY - px(2), px(1), trackH + px(4));
    row.fill
      .clear()
      .fillStyle(HEX.primary, 1)
      .fillRect(0, trackY, w * row.value, trackH)
      .fillStyle(HEX.white, 0.35)
      .fillRect(0, trackY, w * row.value, px(1));
    const thumbX = w * row.value;
    const cy = trackY + trackH / 2;
    row.thumb
      .clear()
      .fillStyle(HEX.primary, 0.3)
      .fillCircle(thumbX, cy, px(10))
      .fillStyle(HEX.primary, 0.8)
      .fillCircle(thumbX, cy, px(6))
      .fillStyle(HEX.white, 1)
      .fillCircle(thumbX, cy, px(3));
  }

  // ---------- 内部：静音按钮 ----------

  private makeMuteBtn(muted: boolean): MuteBtn {
    const w = px(SPACING.xxl + SPACING.xl + SPACING.sm); // = px(88)
    const h = px(SPACING.lg + SPACING.xs);
    const bg = this.scene.add.graphics();
    const label = this.scene.add
      .text(w / 2, h / 2, muted ? '已静音' : '开启', {
        fontFamily: FONT,
        fontSize: `${px(11)}px`,
      })
      .setLetterSpacing(px(11 * 0.2))
      .setOrigin(0.5);
    const container = this.scene.add.container(0, 0, [bg, label]);
    container.setSize(w, h);
    setRectInteractive(container, w, h, { useHandCursor: true, bgAlign: 'topLeft' });
    const btn: MuteBtn = { container, bg, label, w, h };
    container.on('pointerdown', () => {
      sfx.uiClick();
      const cur = useMetaStore.getState().settings.muted;
      const next = !cur;
      useMetaStore.getState().updateSettings({ muted: next });
      bgm.setMuted(next);
      sfx.setMuted(next);
      this.redrawMute(btn, next);
    });
    this.redrawMute(btn, muted);
    return btn;
  }

  private redrawMute(btn: MuteBtn, muted: boolean): void {
    btn.bg.clear();
    if (muted) {
      btn.bg
        .fillStyle(HEX.danger, 0.14)
        .fillRect(0, 0, btn.w, btn.h)
        .lineStyle(px(1), HEX.danger, 0.9)
        .strokeRect(0, 0, btn.w, btn.h);
      btn.label.setColor(COLOR.danger).text = '已静音';
    } else {
      btn.bg
        .fillStyle(HEX.primary, 0.08)
        .fillRect(0, 0, btn.w, btn.h)
        .lineStyle(px(1), HEX.primary, 0.5)
        .strokeRect(0, 0, btn.w, btn.h);
      btn.label.setColor(COLOR.primary).text = '开启';
    }
    btn.label.setPosition(btn.w / 2, btn.h / 2);
  }

  // ---------- 内部：关闭按钮 ----------

  private makeCloseBtn(): {
    container: GameObjects.Container;
    bg: GameObjects.Graphics;
    w: number;
    h: number;
  } {
    const w = px(200); /* 非 SPACING：关闭按钮固定宽 200 视觉调校值 */
    const h = px(SPACING.xl + SPACING.xs + 2); // = px(38)
    const bg = this.scene.add.graphics();
    const label = this.scene.add
      .text(w / 2, h / 2, '完成', {
        fontFamily: FONT,
        fontSize: `${px(12)}px`,
        fontStyle: 'bold',
      })
      .setLetterSpacing(px(12 * 0.25))
      .setOrigin(0.5)
      .setColor(COLOR.bg);
    const container = this.scene.add.container(0, 0, [bg, label]);
    container.setSize(w, h);
    setRectInteractive(container, w, h, { useHandCursor: true, bgAlign: 'topLeft' });
    container.on('pointerdown', () => {
      sfx.uiClick();
      this.onClose();
    });
    return { container, bg, w, h };
  }

  private redrawCloseBtn(): void {
    const { bg, w, h, container } = this.closeBtn;
    bg.clear().fillStyle(HEX.primary, 1).fillRect(0, 0, w, h);
    const label = container.list[1] as GameObjects.Text;
    label.setPosition(w / 2, h / 2);
  }
}
