import type { GameObjects, Scene } from 'phaser';
import { sfx } from '@audio/sfx';
import type { GameState } from '../game/state';
import { setRectInteractive } from '../interactive';
import { SAFE_TOP } from '../layout/safe-area';
import { SPACING } from '../layout/spacing';
import { COLOR, FONT, HEX, px } from '../style';

export interface SpeedControlsCallbacks {
  onPauseToggle: () => void;
  onSpeedCycle: () => void;
}

interface IconBtn {
  container: GameObjects.Container;
  bg: GameObjects.Graphics;
  label: GameObjects.Text;
  pressed: boolean;
  w: number;
  h: number;
}

/**
 * 右上角：暂停 / 速度 两件套，复刻 React 版 PixiSpeedControls。
 * 暂停按钮 34×26，速度按钮 34×26。下一波(剩余) 文本已移至 HudPanel 左侧作为
 * 第 4 单元显示。
 */
export class SpeedControls {
  private scene: Scene;
  private container: GameObjects.Container;
  private pauseBtn: IconBtn;
  private speedBtn: IconBtn;
  private viewportW = 0;

  constructor(scene: Scene, cb: SpeedControlsCallbacks) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(100);

    // 方形按钮（对齐 DESIGN_SYSTEM battle-grid mockup 的 ctrl-btn 32×32）
    const btnSize = px(SPACING.xl); // = px(32)
    this.pauseBtn = this.makeBtn('\u2759\u2759', btnSize, btnSize, () => {
      sfx.uiClick();
      cb.onPauseToggle();
    });
    this.speedBtn = this.makeBtn('\u00d71', btnSize, btnSize, () => {
      sfx.uiClick();
      cb.onSpeedCycle();
    });

    this.container.add([this.pauseBtn.container, this.speedBtn.container]);
  }

  private makeBtn(text: string, w: number, h: number, onTap: () => void): IconBtn {
    const bg = this.scene.add.graphics();
    const label = this.scene.add
      .text(0, 0, text, {
        fontFamily: FONT,
        fontSize: `${px(12)}px`,
        color: COLOR.immune,
        fontStyle: 'bold',
      })
      .setLetterSpacing(px(0.5));
    const container = this.scene.add.container(0, 0, [bg, label]);
    container.setSize(w, h);
    setRectInteractive(container, w, h, { useHandCursor: true, bgAlign: 'topLeft' });
    container.on('pointerdown', onTap);
    const btn: IconBtn = { container, bg, label, pressed: false, w, h };
    this.redrawBtn(btn);
    return btn;
  }

  private redrawBtn(btn: IconBtn): void {
    btn.bg.clear();
    // DESIGN_SYSTEM §ctrl-btn：bg-hud 深底 + 青边；active 态淡青填充
    btn.bg
      .fillStyle(HEX.bgDeep, 0.85)
      .fillRect(0, 0, btn.w, btn.h)
      .lineStyle(px(1), HEX.immune, btn.pressed ? 1 : 0.45)
      .strokeRect(0, 0, btn.w, btn.h);
    if (btn.pressed) {
      btn.bg.fillStyle(HEX.immune, 0.15).fillRect(0, 0, btn.w, btn.h);
    }
    // 居中文字（hitArea 是 (0,0,w,h)，子元素也按左上角排）
    btn.label.setPosition(
      Math.round((btn.w - btn.label.width) / 2),
      Math.round((btn.h - btn.label.height) / 2),
    );
  }

  sync(state: GameState): void {
    // 暂停按钮：暂停时显 ▶，运行时显 ❚❚（双粗竖线）
    this.pauseBtn.label.text = state.paused ? '\u25B6' : '\u2759\u2759';
    this.pauseBtn.pressed = state.paused;
    this.redrawBtn(this.pauseBtn);

    this.speedBtn.label.text = `\u00d7${state.speedMultiplier}`;
    this.speedBtn.pressed = state.speedMultiplier > 1;
    this.redrawBtn(this.speedBtn);

    this.layoutChildren();
  }

  layout(W: number, _H: number): void {
    this.viewportW = W;
    this.layoutChildren();
  }

  private layoutChildren(): void {
    if (!this.viewportW) return;
    const padRight = px(SPACING.sm + SPACING.xs); // = px(12)
    // wx 端 SAFE_TOP 兜住胶囊+刘海/灵动岛；H5 端 SAFE_TOP=0，行为不变
    const padTop = SAFE_TOP + px(SPACING.sm + SPACING.xs); // = px(12)
    const gap = px(SPACING.sm - 2); // = px(6)
    const btns = [this.pauseBtn, this.speedBtn];
    let totalW = 0;
    for (const b of btns) totalW += b.w + gap;
    totalW -= gap;
    let x = this.viewportW - padRight - totalW;
    for (const b of btns) {
      b.container.setPosition(Math.round(x), padTop);
      x += b.w + gap;
    }
  }

  destroy(): void {
    this.container.destroy(true);
  }
}
