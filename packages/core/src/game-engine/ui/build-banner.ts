import type { GameObjects, Geom, Scene } from 'phaser';
import { sfx } from '@audio/sfx';
import type { LevelConfig } from '../game/data/levels/types';
import type { GameState } from '../game/state';
import { setRectInteractive } from '../interactive';
import { SAFE_TOP } from '../layout/safe-area';
import { SPACING } from '../layout/spacing';
import { COLOR, FONT, FONT_MONO, HEX, px } from '../style';
import { EntityIcon } from './atoms/entity-icon';
import { drawProgressBar } from './atoms/progress-bar';
import { summarizeComposition } from './hud-panel';

/**
 * 顶部中央建造阶段 pill：[● 下一波 09s]  [立即开始 ▶]
 *
 * 对齐 DESIGN_SYSTEM battle-grid mockup 的 .next-wave 样式：
 * - nw-countdown：深底 + 琥珀 dot（1s blink）+ "下一波 Ns"，warn 色
 * - nw-btn：绿色 "立即开始 ▶"
 * 底部的倒计时进度条保留（原版功能），改薄到 1px。
 */
export class BuildBanner {
  private scene: Scene;
  private container: GameObjects.Container;
  private countdownPill: GameObjects.Container;
  private countdownBg: GameObjects.Graphics;
  private dotGfx: GameObjects.Graphics;
  private dotTween: Phaser.Tweens.Tween | null = null;
  private countdownLabel: GameObjects.Text;
  private countdownValue: GameObjects.Text;
  private progressBar: GameObjects.Graphics;
  private startBtn: GameObjects.Container;
  private startBtnBg: GameObjects.Graphics;
  private startBtnLabel: GameObjects.Text;
  /** 立即开始按钮 hitArea；layoutChildren 改 size 时同步 setTo（否则按钮变高后命中区不变） */
  private startBtnHitRect!: Geom.Rectangle;
  private viewportW = 0;
  private visible = false;
  private totalMs = 0;
  private remainingMs = 0;
  private suppressed = false;
  private startBtnVisible = true;
  /** 下波预览容器：作为 countdownPill 第 2 行，仅 build 阶段显示 */
  private previewSection: GameObjects.Container;
  /** preview 行像素宽（重绘时算）+ 高（固定 iconSize） */
  private previewWidth = 0;
  private previewHeight = 0;
  /** e2e 探测：BuildBanner 可见且非最后一波时为 true */
  public wavePreviewVisible = false;

  constructor(scene: Scene, onStartWave: () => void) {
    this.scene = scene;

    this.countdownBg = scene.add.graphics();
    this.dotGfx = scene.add.graphics();
    this.countdownLabel = scene.add
      .text(0, 0, '下一波', {
        fontFamily: FONT,
        fontSize: `${px(11)}px`,
        color: COLOR.textWarm,
      })
      .setLetterSpacing(px(11 * 0.15))
      .setOrigin(0, 0);
    this.countdownValue = scene.add
      .text(0, 0, '', {
        fontFamily: FONT_MONO,
        fontSize: `${px(11)}px`,
        color: COLOR.warn,
        fontStyle: 'bold',
      })
      .setLetterSpacing(px(11 * 0.1))
      .setOrigin(0, 0);
    this.progressBar = scene.add.graphics();
    this.previewSection = scene.add.container(0, 0);
    this.previewSection.setVisible(false);
    this.countdownPill = scene.add.container(0, 0, [
      this.countdownBg,
      this.progressBar,
      this.dotGfx,
      this.countdownLabel,
      this.countdownValue,
      this.previewSection,
    ]);

    this.startBtnBg = scene.add.graphics();
    this.startBtnLabel = scene.add
      .text(0, 0, '立即开始 →', {
        fontFamily: FONT,
        fontSize: `${px(11)}px`,
        color: COLOR.immune,
      })
      .setLetterSpacing(px(11 * 0.25))
      .setOrigin(0, 0);
    this.startBtn = scene.add.container(0, 0, [this.startBtnBg, this.startBtnLabel]);
    this.startBtn.setSize(px(100), px(26));
    this.startBtnHitRect = setRectInteractive(this.startBtn, px(100), px(26), {
      useHandCursor: true,
      bgAlign: 'topLeft',
    });
    this.startBtn.on('pointerdown', () => {
      sfx.uiClick();
      onStartWave();
    });

    this.container = scene.add.container(0, 0, [this.countdownPill, this.startBtn]);
    this.container.setDepth(200);
    this.container.setVisible(false);
  }

  setSuppressed(v: boolean): void {
    this.suppressed = v;
    if (v) {
      this.visible = false;
      this.container.setVisible(false);
    }
  }

  setStartButtonVisible(v: boolean): void {
    this.startBtnVisible = v;
    this.startBtn.setVisible(v);
  }

  sync(state: GameState, level?: LevelConfig): void {
    if (this.suppressed) return;
    const show = state.phase === 'build';
    if (!show) {
      if (this.visible) {
        this.visible = false;
        this.container.setVisible(false);
        this.stopDotBlink();
      }
      this.wavePreviewVisible = false;
      return;
    }
    if (!this.visible) {
      this.visible = true;
      this.container.setVisible(true);
      this.startDotBlink();
    }
    const sec = Math.ceil(state.buildPhaseRemainingMs / 1000);
    this.countdownValue.text = `${sec}s`;
    if (state.buildPhaseRemainingMs > this.totalMs) this.totalMs = state.buildPhaseRemainingMs;
    this.remainingMs = state.buildPhaseRemainingMs;
    if (level) this.renderWavePreview(level, state.waveIndex);
    else this.wavePreviewVisible = false;
    this.layoutChildren();
  }

  /**
   * 重绘 preview 行（pill 第 2 行）。仅 build 阶段调，currentWave 即将开始的波次索引；
   * 最后一波时 preview 隐藏（避免显示空内容）。
   */
  private renderWavePreview(level: LevelConfig, currentWave: number): void {
    this.previewSection.removeAll(true);
    const hasTargetWave = currentWave < level.waves.length;
    this.wavePreviewVisible = hasTargetWave;
    if (!hasTargetWave) {
      this.previewSection.setVisible(false);
      this.previewWidth = 0;
      this.previewHeight = 0;
      return;
    }
    const targetWaveData = level.waves[currentWave];
    if (!targetWaveData) {
      this.previewSection.setVisible(false);
      this.previewWidth = 0;
      this.previewHeight = 0;
      this.wavePreviewVisible = false;
      return;
    }
    this.previewSection.setVisible(true);

    const items = summarizeComposition(targetWaveData.composition);
    const iconSize = px(SPACING.md + 2); // = px(18)
    const iconGap = px(SPACING.sm + 2); // = px(10)
    const rowGap = px(SPACING.xs); // = px(4)
    // 每行最多 4 个 type，超过自动换行；这是为多 type 关（Ch.3+）做的稳健保护
    const ITEMS_PER_ROW = 4;
    let cursorX = 0;
    let cursorY = 0;
    let maxRowWidth = 0;
    let columnInRow = 0;

    for (const item of items) {
      // 满 ITEMS_PER_ROW 换行
      if (columnInRow >= ITEMS_PER_ROW) {
        maxRowWidth = Math.max(maxRowWidth, cursorX - iconGap);
        cursorX = 0;
        cursorY += iconSize + rowGap;
        columnInRow = 0;
      }

      const cy = cursorY + iconSize / 2;
      const cx = cursorX + iconSize / 2;

      // sprite + boss 金边 + flying ↑ + 4 modifier 装饰统一走 EntityIcon atom
      const decorations: {
        boss?: boolean;
        flying?: boolean;
        fortified?: boolean;
        encapsulated?: boolean;
        camouflaged?: boolean;
      } = {};
      if (item.boss) decorations.boss = true;
      if (item.flying) decorations.flying = true;
      if (item.fortified) decorations.fortified = true;
      if (item.encapsulated) decorations.encapsulated = true;
      if (item.camouflaged) decorations.camouflaged = true;
      const icon = new EntityIcon(this.scene, {
        kind: 'pathogen',
        type: item.type,
        size: iconSize,
        x: cx,
        y: cy,
        decorations,
      });
      this.previewSection.add(icon.container);

      const advanceX = iconSize + px(2);
      // count 数字（垂直居中到 icon 中线）
      const countText = this.scene.add.text(cursorX + advanceX, 0, `×${item.count}`, {
        fontFamily: FONT_MONO,
        fontSize: `${px(10)}px`,
        color: COLOR.dim,
      });
      countText.setPosition(cursorX + advanceX, cy - countText.height / 2);
      this.previewSection.add(countText);
      cursorX += advanceX + countText.width + iconGap;
      columnInRow++;
    }

    // 收尾最后一行
    maxRowWidth = Math.max(maxRowWidth, cursorX - iconGap);
    const totalRows = Math.ceil(items.length / ITEMS_PER_ROW);
    this.previewWidth = Math.max(0, maxRowWidth);
    this.previewHeight = totalRows * iconSize + Math.max(0, totalRows - 1) * rowGap;
  }

  layout(W: number, _H: number): void {
    this.viewportW = W;
    this.layoutChildren();
  }

  private layoutChildren(): void {
    if (!this.viewportW) return;

    // ---------- 倒计时 pill ----------
    const pillPadX = px(SPACING.sm + SPACING.xs); // = px(12)
    const pillPadY = px(SPACING.sm - 2); // = px(6)
    const pillGap = px(SPACING.sm - 2); // = px(6)
    const dotR = px(2.5);
    const dotCol = dotR * 2;
    const row1H = Math.max(this.countdownLabel.height, this.countdownValue.height);
    const row1W =
      dotCol + pillGap + this.countdownLabel.width + pillGap + this.countdownValue.width;
    // pill 宽 = max(row1W, previewW) + padding；高 = row1 + 可选 row2 + padding
    const previewRowGap = this.wavePreviewVisible && this.previewWidth > 0 ? px(4) : 0;
    const previewH = this.wavePreviewVisible ? this.previewHeight : 0;
    const contentW = Math.max(row1W, this.wavePreviewVisible ? this.previewWidth : 0);
    const pillW = contentW + pillPadX * 2;
    const pillH = row1H + previewRowGap + previewH + pillPadY * 2;

    this.countdownBg
      .clear()
      .fillStyle(HEX.bgDeep, 0.75)
      .fillRect(0, 0, pillW, pillH)
      .lineStyle(px(1), HEX.warn, 0.35)
      .strokeRect(0, 0, pillW, pillH);

    // row1 中线（pill 顶部至 row1 底部之间）
    const row1CenterY = pillPadY + row1H / 2;
    const dotX = pillPadX + dotR;
    this.dotGfx
      .clear()
      .fillStyle(HEX.warn, 0.4)
      .fillCircle(dotX, row1CenterY, dotR * 2)
      .fillStyle(HEX.warn, 1)
      .fillCircle(dotX, row1CenterY, dotR);
    const labelX = pillPadX + dotCol + pillGap;
    this.countdownLabel.setPosition(labelX, row1CenterY - this.countdownLabel.height / 2);
    const valueX = labelX + this.countdownLabel.width + pillGap;
    this.countdownValue.setPosition(valueX, row1CenterY - this.countdownValue.height / 2);

    // 底部 1px 倒计时进度条（warn 同色）
    const ratio = this.totalMs > 0 ? Math.max(0, this.remainingMs) / this.totalMs : 0;
    this.progressBar.clear();
    drawProgressBar(this.progressBar, {
      ratio,
      x: 0,
      y: pillH - px(1),
      width: pillW,
      height: px(1),
      color: HEX.warn,
      fgAlpha: 0.7,
    });

    // preview 行：pill 内 row1 之下，左对齐（与 row1 内容左边缘对齐到 dot 同列）
    if (this.wavePreviewVisible && this.previewWidth > 0) {
      this.previewSection.setPosition(pillPadX, pillPadY + row1H + previewRowGap);
    }

    // ---------- 立即开始按钮 ----------
    const btnPadX = px(SPACING.sm + SPACING.xs); // = px(12)
    // 按钮高度跟 pillH 对齐（pill 加了 preview 第 2 行后变高，按钮也要拉伸）
    const btnW = this.startBtnLabel.width + btnPadX * 2;
    const btnH = pillH;
    this.startBtn.setSize(btnW, btnH);
    // setRectInteractive 用 bgAlign='topLeft'，hit area 起点 (w/2, h/2)，size (w, h)
    this.startBtnHitRect.setTo(btnW / 2, btnH / 2, btnW, btnH);
    this.startBtnBg
      .clear()
      .fillStyle(HEX.immune, 0.1)
      .fillRect(0, 0, btnW, btnH)
      .lineStyle(px(1), HEX.immune, 1)
      .strokeRect(0, 0, btnW, btnH);
    // label 垂直居中到按钮
    this.startBtnLabel.setPosition(btnPadX, (btnH - this.startBtnLabel.height) / 2);

    // ---------- 水平排布 pill + 按钮 ----------
    const rowGap = px(SPACING.sm);
    const rowW = this.startBtnVisible ? pillW + rowGap + btnW : pillW;
    const rowH = Math.max(pillH, btnH);
    this.countdownPill.setPosition(0, (rowH - pillH) / 2);
    this.startBtn.setPosition(pillW + rowGap, (rowH - btnH) / 2);

    // 整行居中，y 固定在 top = SPACING.xxl + lg + sm-2 = px(78)（speedControls+waveBar 下方）
    // wx 端 SAFE_TOP 兜住胶囊+刘海/灵动岛；H5 端 SAFE_TOP=0，行为不变
    this.container.setPosition(
      Math.round((this.viewportW - rowW) / 2),
      SAFE_TOP + px(SPACING.xxl + SPACING.lg + SPACING.sm - 2),
    );
  }

  private startDotBlink(): void {
    if (this.dotTween) return;
    this.dotTween = this.scene.tweens.add({
      targets: this.dotGfx,
      alpha: { from: 1, to: 0.3 },
      duration: 450,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  private stopDotBlink(): void {
    if (!this.dotTween) return;
    this.dotTween.stop();
    this.dotTween = null;
    this.dotGfx.setAlpha(1);
  }

  destroy(): void {
    this.stopDotBlink();
    this.previewSection.destroy(true);
    this.container.destroy(true);
  }
}
