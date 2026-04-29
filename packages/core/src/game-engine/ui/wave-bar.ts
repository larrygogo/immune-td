import type { GameObjects, Scene } from 'phaser';
import { DPR } from '../dpr';
import type { GameState } from '../game/state';
import { SPACING } from '../layout/spacing';
import { COLOR, FONT, FONT_MONO, HEX, px } from '../style';

const SEG_W = 10;
const SEG_H = 4;
const SEG_GAP = 2;

/**
 * 左上 HUD 一员：与 HP/ATP 卡片同行，展示波次 seg 条（上）+ 下一波/剩余数量（下）。
 *
 * 上行：`WAVE` 8px 小 label + N 段 seg（10×4, 2gap）+ `i / N` 计数
 * 下行：`下一波` / `剩余` label + 数字
 *   - build 阶段：显 "下一波 · N"（N = 下一波总数）
 *   - wave 阶段：显 "剩余 · N"（N = 队列剩 + 场上活跃）
 *   - complete / failed 阶段：下行整体隐藏
 *
 * 位置由外部（HudPanel）在 relayoutRow 时 setPosition，本组件不关心视口坐标。
 */
export class WaveBar {
  readonly container: GameObjects.Container;
  private waveLabel: GameObjects.Text;
  private segsGfx: GameObjects.Graphics;
  private count: GameObjects.Text;
  private pendingLabel: GameObjects.Text;
  private pendingValue: GameObjects.Text;
  private totalWaves = 5;
  private activeIndex = 0;
  private doneCount = 0;
  private pendingVisible = true;
  private lastPendingValue = '';

  constructor(scene: Scene) {
    this.waveLabel = scene.add
      .text(0, 0, 'WAVE', {
        fontFamily: FONT_MONO,
        fontSize: `${px(8)}px`,
        color: COLOR.textXDim,
      })
      .setLetterSpacing(px(8 * 0.25))
      .setOrigin(0, 0)
      .setResolution(DPR);
    this.segsGfx = scene.add.graphics();
    this.count = scene.add
      .text(0, 0, '0 / 0', {
        fontFamily: FONT_MONO,
        fontSize: `${px(10)}px`,
        color: COLOR.immune,
      })
      .setOrigin(0, 0)
      .setResolution(DPR);

    this.pendingLabel = scene.add
      .text(0, 0, '下一波', {
        fontFamily: FONT,
        fontSize: `${px(9)}px`,
        color: COLOR.textDim,
      })
      .setLetterSpacing(px(9 * 0.2))
      .setOrigin(0, 0)
      .setResolution(DPR);
    this.pendingValue = scene.add
      .text(0, 0, '0', {
        fontFamily: FONT_MONO,
        fontSize: `${px(11)}px`,
        color: COLOR.textWarm,
        fontStyle: 'bold',
      })
      .setOrigin(0, 0)
      .setResolution(DPR);

    this.container = scene.add.container(0, 0, [
      this.waveLabel,
      this.segsGfx,
      this.count,
      this.pendingLabel,
      this.pendingValue,
    ]);
    this.container.setDepth(100);
  }

  sync(state: GameState, pendingCount: number): void {
    this.totalWaves = state.totalWaves;
    if (state.phase === 'build') {
      this.doneCount = state.waveIndex;
      this.activeIndex = state.waveIndex;
      // build 阶段已由 BuildBanner 显示下波倒计时 + 组成 icons，避免双显冗余
      this.pendingVisible = false;
    } else if (state.phase === 'wave') {
      this.doneCount = state.waveIndex;
      this.activeIndex = state.waveIndex;
      this.pendingVisible = true;
      this.pendingLabel.text = '剩余';
    } else {
      this.doneCount = state.waveIndex + 1;
      this.activeIndex = -1;
      this.pendingVisible = false;
    }
    this.count.text = `${Math.min(state.waveIndex + 1, state.totalWaves)} / ${state.totalWaves}`;
    const pv = String(pendingCount);
    if (pv !== this.lastPendingValue) {
      this.lastPendingValue = pv;
      this.pendingValue.text = pv;
    }
    this.pendingLabel.setVisible(this.pendingVisible);
    this.pendingValue.setVisible(this.pendingVisible);
    this.redraw();
  }

  /** 让 HudPanel 按行布局时调用：把本组件放到 (x, y) */
  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  /** 返回本组件整体宽度（供 HudPanel 在横排时计算下一元素位置） */
  getWidth(): number {
    const segsW = this.totalWaves * px(SEG_W) + (this.totalWaves - 1) * px(SEG_GAP);
    const gap = px(SPACING.xs + 2); // = px(6)
    return this.waveLabel.width + gap + segsW + gap + this.count.width;
  }

  /** 返回上下两行的总高 */
  getHeight(): number {
    const rowGap = px(SPACING.xs + 2); // = px(6)
    const topH = Math.max(this.waveLabel.height, px(SEG_H), this.count.height);
    if (!this.pendingVisible) return topH;
    const botH = Math.max(this.pendingLabel.height, this.pendingValue.height);
    return topH + rowGap + botH;
  }

  private redraw(): void {
    const gap = px(SPACING.xs + 2); // = px(6)
    const segsW = this.totalWaves * px(SEG_W) + (this.totalWaves - 1) * px(SEG_GAP);
    const topH = Math.max(this.waveLabel.height, px(SEG_H), this.count.height);

    // 上行：WAVE | segs | count，垂直中心对齐
    const cyTop = topH / 2;
    this.waveLabel.setPosition(0, cyTop - this.waveLabel.height / 2);
    const segsX = this.waveLabel.width + gap;
    const segsY = cyTop - px(SEG_H) / 2;
    this.count.setPosition(segsX + segsW + gap, cyTop - this.count.height / 2);

    // 重画 segs
    this.segsGfx.clear();
    for (let i = 0; i < this.totalWaves; i++) {
      const x = segsX + i * (px(SEG_W) + px(SEG_GAP));
      if (i < this.doneCount) {
        this.segsGfx
          .fillStyle(HEX.immuneDim, 1)
          .fillRect(x, segsY, px(SEG_W), px(SEG_H))
          .lineStyle(px(0.5), HEX.immuneDim, 1)
          .strokeRect(x, segsY, px(SEG_W), px(SEG_H));
      } else if (i === this.activeIndex) {
        this.segsGfx
          .fillStyle(HEX.immune, 0.35)
          .fillRect(x - px(1.5), segsY - px(1.5), px(SEG_W) + px(3), px(SEG_H) + px(3))
          .fillStyle(HEX.immune, 1)
          .fillRect(x, segsY, px(SEG_W), px(SEG_H))
          .lineStyle(px(0.5), HEX.immune, 1)
          .strokeRect(x, segsY, px(SEG_W), px(SEG_H));
      } else {
        this.segsGfx
          .fillStyle(HEX.immune, 0.12)
          .fillRect(x, segsY, px(SEG_W), px(SEG_H))
          .lineStyle(px(0.5), HEX.immune, 0.3)
          .strokeRect(x, segsY, px(SEG_W), px(SEG_H));
      }
    }

    // 下行：pending label + value（左对齐到 segsX，和上行 seg 条左端对齐）
    if (this.pendingVisible) {
      const rowGap = px(SPACING.xs + 2); // = px(6)
      const botY = topH + rowGap;
      this.pendingLabel.setPosition(segsX, botY);
      // value 左侧保留 fixed width，让 label 右侧对齐 value 右端的布局更规整
      const pLabelRight = segsX + this.pendingLabel.width + px(SPACING.xs + 2); // gap = px(6)
      this.pendingValue.setPosition(pLabelRight, botY);
    }
  }

  setVisible(v: boolean): void {
    this.container.setVisible(v);
  }

  destroy(): void {
    this.container.destroy(true);
  }
}
