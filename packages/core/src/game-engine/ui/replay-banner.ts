import type { GameObjects, Scene } from 'phaser';
import { setRectInteractive } from '../interactive';
import { SAFE_BOTTOM } from '../layout/safe-area';
import { SPACING } from '../layout/spacing';
import { COLOR, FONT, HEX, px } from '../style';

/**
 * 回放模式顶部状态条：显示「▶ 回放中 · 动作 x/y」+ 「退出回放」按钮。
 * 样式区别于 BuildBanner —— 用紫色强调回放（非正常战斗）。
 */
export class ReplayBanner {
  private container: GameObjects.Container;
  private bg: GameObjects.Graphics;
  private label: GameObjects.Text;
  private progressText: GameObjects.Text;
  /** 总剩倒计时（基于 tickCount 距最后动作的剩余 tick，× 1/60 秒估算） */
  private countdownText: GameObjects.Text;
  private exitBtn: GameObjects.Container;
  private exitBtnBg: GameObjects.Graphics;
  private exitBtnLabel: GameObjects.Text;
  private viewportW = 0;
  private viewportH = 0;
  private visible = false;

  constructor(scene: Scene, onExit: () => void) {
    this.bg = scene.add.graphics();
    this.label = scene.add
      .text(0, 0, '▶ 回放中', {
        fontFamily: FONT,
        fontSize: `${px(13)}px`,
        color: COLOR.replay,
      })
      .setLetterSpacing(px(2))
      .setOrigin(0, 0);
    this.progressText = scene.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: `${px(12)}px`,
        color: COLOR.dim,
      })
      .setLetterSpacing(px(1))
      .setOrigin(0, 0);
    this.countdownText = scene.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: `${px(12)}px`,
        color: COLOR.replay,
      })
      .setLetterSpacing(px(1))
      .setOrigin(0, 0);

    this.exitBtnBg = scene.add.graphics();
    this.exitBtnLabel = scene.add
      .text(0, 0, '退出', {
        fontFamily: FONT,
        fontSize: `${px(11)}px`,
        color: COLOR.replay,
      })
      .setLetterSpacing(px(2))
      .setOrigin(0, 0);
    this.exitBtn = scene.add.container(0, 0, [this.exitBtnBg, this.exitBtnLabel]);
    // 与 layout() 内 btnW/btnH 同步
    this.exitBtn.setSize(px(SPACING.xl + SPACING.lg), px(SPACING.md + SPACING.sm - 2));
    setRectInteractive(this.exitBtn, px(SPACING.xl + SPACING.lg), px(SPACING.md + SPACING.sm - 2), {
      useHandCursor: true,
      bgAlign: 'topLeft',
    });
    this.exitBtn.on('pointerup', onExit);

    this.container = scene.add.container(0, 0, [
      this.bg,
      this.label,
      this.progressText,
      this.countdownText,
      this.exitBtn,
    ]);
    this.container.setDepth(210);
    this.container.setVisible(false);
  }

  layout(viewportW: number, viewportH: number): void {
    this.viewportW = viewportW;
    this.viewportH = viewportH;
    this.redraw();
  }

  show(): void {
    if (!this.visible) {
      this.visible = true;
      this.container.setVisible(true);
    }
  }

  hide(): void {
    this.visible = false;
    this.container.setVisible(false);
  }

  setProgress(current: number, total: number): void {
    this.progressText.setText(`动作 ${current} / ${total}`);
    this.redraw();
  }

  /**
   * 更新"总剩 MM:SS"倒计时（基于距最后一条 recorded action 的 tick 差，× 1/60 秒）。
   * 1× 速度下近似回放总剩时间；超过最后动作 tick 后显示 "等待结算"。
   */
  setCountdown(currentTick: number, lastActionTick: number): void {
    if (lastActionTick <= 0) {
      this.countdownText.setText('');
    } else if (currentTick >= lastActionTick) {
      this.countdownText.setText('结算中');
    } else {
      const remainingTicks = lastActionTick - currentTick;
      const sec = Math.max(0, Math.round(remainingTicks / 60));
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      this.countdownText.setText(`总剩 ${m}:${s.toString().padStart(2, '0')}`);
    }
    this.redraw();
  }

  private redraw(): void {
    if (this.viewportW <= 0 || this.viewportH <= 0) return;
    const h = px(SPACING.xl); // = px(32)
    // 放底部（TowerBar 在回放下已抑制，底部空出；避免与顶部 HUD 重叠）
    // wx 端 SAFE_BOTTOM 兜住 home indicator；H5 端 SAFE_BOTTOM=0，行为不变
    const y = this.viewportH - SAFE_BOTTOM - h - px(SPACING.sm); // 底部内边距 px(8)
    // 自适应宽度 + 居中
    const btnW = px(SPACING.xl + SPACING.lg); // = px(56)
    const btnH = px(SPACING.md + SPACING.sm - 2); // = px(22)
    const padX = px(SPACING.md);
    const gap = px(SPACING.sm + 2); // = px(10)
    const btnGap = px(SPACING.md - 2); // = px(14)
    const labelW = this.label.width;
    const progW = this.progressText.width;
    const cdW = this.countdownText.width;
    const cdGap = cdW > 0 ? gap : 0;
    const innerW = labelW + gap + progW + cdGap + cdW + btnGap + btnW;
    const totalW = innerW + padX * 2;
    const originX = Math.round((this.viewportW - totalW) / 2);

    // 背景：深紫半透明（窄条）
    this.bg.clear();
    this.bg.fillStyle(HEX.replayBg, 0.85).fillRect(originX, y, totalW, h);
    this.bg.lineStyle(px(1), HEX.replay, 0.5).strokeRect(originX, y, totalW, h);

    // 左至右：label → progress → countdown → exit
    this.label.setPosition(originX + padX, y + (h - px(13)) / 2);
    this.progressText.setPosition(originX + padX + labelW + gap, y + (h - px(12)) / 2);
    this.countdownText.setPosition(
      originX + padX + labelW + gap + progW + cdGap,
      y + (h - px(12)) / 2,
    );

    // 右侧退出按钮
    this.exitBtn.setPosition(originX + totalW - btnW - padX, y + (h - btnH) / 2);
    this.exitBtnBg.clear();
    this.exitBtnBg
      .fillStyle(HEX.bg, 0.9)
      .fillRoundedRect(0, 0, btnW, btnH, px(4))
      .lineStyle(px(1), HEX.replay, 0.7)
      .strokeRoundedRect(0, 0, btnW, btnH, px(4));
    const labelX = (btnW - this.exitBtnLabel.width) / 2;
    this.exitBtnLabel.setPosition(labelX, (btnH - px(11)) / 2);
  }

  destroy(): void {
    this.container.destroy();
  }
}
