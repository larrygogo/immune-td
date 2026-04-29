import { type GameObjects, Geom, type Scene } from 'phaser';
import type Phaser from 'phaser';
import { sfx } from '@audio/sfx';
import { setRectInteractive } from '../interactive';
import { SPACING } from '../layout/spacing';
import { COLOR, FONT, HEX, px } from '../style';

export interface TutorialStep {
  id: number;
  /** "STEP 1" */
  title: string;
  /** "顶部状态：HP（核心血量）..." */
  body: string;
  /** 高亮区域：(x, y, w, h) 视口像素坐标。null = 全屏暗，无聚光灯 */
  spotlight: { x: number; y: number; w: number; h: number } | null;
  /** 自动推进 ms（用于"看一眼就过"的步骤） */
  autoAdvanceMs?: number;
  /** 显示「下一步」按钮（介绍类步骤用，需要玩家点击才推进） */
  manualAdvance?: boolean;
  /** 卡片位置：'top'|'center'|'bottom'|'auto'（默认）。某些 step 需避开详情面板 / 塔栏 */
  cardPosition?: 'top' | 'center' | 'bottom' | 'auto';
}

export interface TutorialCallbacks {
  onAdvance: () => void;
  onSkip: () => void;
}

const CARD_W = 360;
const CARD_PAD = 14;
const SKIP_BTN_W = 90;
const SKIP_BTN_H = 24;
const NEXT_BTN_W = 90;
const NEXT_BTN_H = 28;
const DEPTH = 850;

// Phaser v4 alpha 的 preFX typings 不全，结构性接口兜底
interface FxAddable {
  addGlow?: (
    color?: number,
    outerStrength?: number,
    innerStrength?: number,
    knockout?: boolean,
    quality?: number,
    distance?: number,
  ) => unknown;
}

interface SkipBtn {
  container: GameObjects.Container;
  bg: GameObjects.Graphics;
  label: GameObjects.Text;
}

/**
 * 教学引导 overlay：4 矩形遮罩 + spotlight 挖洞 + 步骤卡片 + 跳过按钮。
 * 用于关 0 序章 8 步引导。
 *
 * 实现要点：
 * - 4 个 dim 矩形（top/bottom/left/right）围绕 spotlight 区域，"挖洞"露出底层游戏画面
 * - spotlight=null 时只用 dimTop 一个矩形覆盖全屏
 * - dim 矩形 setInteractive 拦截点击，spotlight 区域不被任何 dim 覆盖 → 可点穿
 * - 卡片自适应位置：spotlight 在底部 → 卡片顶部，否则卡片底部
 */
export class TutorialOverlay {
  private scene: Scene;
  private cb: TutorialCallbacks;
  private container: GameObjects.Container;
  private dimTop: GameObjects.Graphics;
  private dimRight: GameObjects.Graphics;
  private dimBottom: GameObjects.Graphics;
  private dimLeft: GameObjects.Graphics;
  /** spotlight 边框装饰（cyber HUD 风） */
  private spotlightBorder: GameObjects.Graphics;
  private cardBg: GameObjects.Graphics;
  private cardTitle: GameObjects.Text;
  private cardBody: GameObjects.Text;
  private skipBtn: SkipBtn;
  private nextBtn: SkipBtn;
  private currentStep: TutorialStep | null = null;
  private autoTimer: Phaser.Time.TimerEvent | null = null;

  constructor(scene: Scene, cb: TutorialCallbacks) {
    this.scene = scene;
    this.cb = cb;

    this.dimTop = scene.add.graphics();
    this.dimRight = scene.add.graphics();
    this.dimBottom = scene.add.graphics();
    this.dimLeft = scene.add.graphics();
    this.spotlightBorder = scene.add.graphics();
    // 4 角 L 装饰 + 柔和发光（cyber HUD 风），增强"聚光灯"质感
    // Phaser v4 alpha 的 preFX typings 不全，结构性接口兜底
    const fx = (this.spotlightBorder as GameObjects.Graphics & { preFX?: FxAddable }).preFX;
    fx?.addGlow?.(HEX.highlight, 2, 0, false, 0.1, 8);
    this.cardBg = scene.add.graphics();
    this.cardTitle = scene.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: `${px(11)}px`,
        color: COLOR.highlight,
      })
      .setLetterSpacing(px(11 * 0.3))
      .setOrigin(0, 0);
    this.cardBody = scene.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: `${px(12)}px`,
        color: COLOR.primary,
        wordWrap: { width: px(CARD_W - CARD_PAD * 2), useAdvancedWrap: true },
      })
      .setLetterSpacing(px(12 * 0.15))
      .setLineSpacing(px(4))
      .setOrigin(0, 0);

    this.skipBtn = this.makeSkipBtn();
    this.nextBtn = this.makeNextBtn();

    this.container = scene.add.container(0, 0, [
      this.dimTop,
      this.dimRight,
      this.dimBottom,
      this.dimLeft,
      this.spotlightBorder,
      this.cardBg,
      this.cardTitle,
      this.cardBody,
      this.skipBtn.container,
      this.nextBtn.container,
    ]);
    this.container.setDepth(DEPTH);
    this.container.setVisible(false);

    // 4 个 dim 矩形拦截事件，让"教学暗区"不能被点击穿透。
    // 初始 hitArea 为 1×1 占位，layout 时按 spotlight 实际尺寸 setTo 更新。
    for (const g of [this.dimTop, this.dimRight, this.dimBottom, this.dimLeft]) {
      g.setInteractive(new Geom.Rectangle(0, 0, 1, 1), Geom.Rectangle.Contains);
    }
  }

  showStep(step: TutorialStep): void {
    this.currentStep = step;
    this.container.setVisible(true);
    this.container.setAlpha(0);
    this.scene.tweens.add({
      targets: this.container,
      alpha: 1,
      duration: 200,
      ease: 'Power2',
    });

    this.cardTitle.setText(step.title);
    this.cardBody.setText(step.body);

    this.cancelAutoTimer();
    if (step.autoAdvanceMs !== undefined && step.autoAdvanceMs > 0) {
      this.autoTimer = this.scene.time.delayedCall(step.autoAdvanceMs, () => {
        this.cb.onAdvance();
      });
    }
    // 「下一步」按钮仅在 manual 推进步骤显示
    this.nextBtn.container.setVisible(step.manualAdvance === true);

    this.layout(this.scene.scale.width, this.scene.scale.height);
  }

  hide(): void {
    this.container.setVisible(false);
    this.currentStep = null;
    this.cancelAutoTimer();
  }

  layout(W: number, H: number): void {
    if (!this.currentStep) return;
    const sp = this.currentStep.spotlight;

    // 清空所有 dim + spotlight border
    for (const g of [this.dimTop, this.dimRight, this.dimBottom, this.dimLeft]) {
      g.clear();
    }
    this.spotlightBorder.clear();

    if (sp) {
      // 4 个矩形围绕 spotlight 挖洞：top / bottom / left / right
      this.dimTop.fillStyle(HEX.black, 0.7).fillRect(0, 0, W, sp.y);
      this.dimBottom.fillStyle(HEX.black, 0.7).fillRect(0, sp.y + sp.h, W, H - (sp.y + sp.h));
      this.dimLeft.fillStyle(HEX.black, 0.7).fillRect(0, sp.y, sp.x, sp.h);
      this.dimRight.fillStyle(HEX.black, 0.7).fillRect(sp.x + sp.w, sp.y, W - (sp.x + sp.w), sp.h);

      // 同步更新 4 个 dim 的 hitArea，让它们仍能拦截点击
      this.setDimHit(this.dimTop, 0, 0, W, sp.y);
      this.setDimHit(this.dimBottom, 0, sp.y + sp.h, W, H - (sp.y + sp.h));
      this.setDimHit(this.dimLeft, 0, sp.y, sp.x, sp.h);
      this.setDimHit(this.dimRight, sp.x + sp.w, sp.y, W - (sp.x + sp.w), sp.h);

      // spotlight 4 角 L 装饰（cyber HUD 风）
      const cl = px(SPACING.sm + 2); // L 角长度 = px(10)
      const lw = px(2); // L 角线宽（紧凑视觉，非 SPACING）
      this.spotlightBorder.lineStyle(lw, HEX.highlight, 0.85);
      // 左上
      this.spotlightBorder.lineBetween(sp.x, sp.y, sp.x + cl, sp.y);
      this.spotlightBorder.lineBetween(sp.x, sp.y, sp.x, sp.y + cl);
      // 右上
      this.spotlightBorder.lineBetween(sp.x + sp.w - cl, sp.y, sp.x + sp.w, sp.y);
      this.spotlightBorder.lineBetween(sp.x + sp.w, sp.y, sp.x + sp.w, sp.y + cl);
      // 左下
      this.spotlightBorder.lineBetween(sp.x, sp.y + sp.h - cl, sp.x, sp.y + sp.h);
      this.spotlightBorder.lineBetween(sp.x, sp.y + sp.h, sp.x + cl, sp.y + sp.h);
      // 右下
      this.spotlightBorder.lineBetween(sp.x + sp.w, sp.y + sp.h - cl, sp.x + sp.w, sp.y + sp.h);
      this.spotlightBorder.lineBetween(sp.x + sp.w - cl, sp.y + sp.h, sp.x + sp.w, sp.y + sp.h);
    } else {
      // spotlight=null 表示无遮罩（仅显示卡片提示，不挡住游戏画面）
      // 4 个 dim 全部清空 + 命中区收成 0×0 让点击穿透
      this.setDimHit(this.dimTop, 0, 0, 0, 0);
      this.setDimHit(this.dimRight, 0, 0, 0, 0);
      this.setDimHit(this.dimBottom, 0, 0, 0, 0);
      this.setDimHit(this.dimLeft, 0, 0, 0, 0);
    }

    // 卡片高度自适应（标题 + body + 双向 padding + 底部 footer 容纳跳过/下一步按钮）
    const cardW = px(CARD_W);
    const footerH = Math.max(px(SKIP_BTN_H), px(NEXT_BTN_H)) + px(SPACING.sm + SPACING.xs + 2); // gap = px(14)
    const cardH = Math.max(
      this.cardTitle.height + this.cardBody.height + px(CARD_PAD * 2 + 4) + footerH,
      px(SPACING.xxl + SPACING.xl), // min cardH = px(80)
    );
    const cardX = Math.round((W - cardW) / 2);
    let cardY: number;
    const pos = this.currentStep.cardPosition ?? 'auto';
    if (pos === 'top') {
      // 强制顶部（避开右侧详情面板等）
      cardY = px(SPACING.xxl + SPACING.xl); // = px(80)
    } else if (pos === 'center') {
      // 强制屏幕中央（如 HUD 介绍步骤，让卡片落在棋盘区域显示）
      cardY = Math.round((H - cardH) / 2);
    } else if (pos === 'bottom') {
      cardY = H - cardH - px(SPACING.xl + SPACING.sm); // = px(40)
    } else if (sp && sp.y + sp.h > H * 0.6) {
      // auto: spotlight 在底部 1/3 → 卡片放顶部避免遮挡
      cardY = Math.max(px(SPACING.md + SPACING.xs), sp.y - cardH - px(SPACING.md + SPACING.xs));
    } else {
      cardY = H - cardH - px(SPACING.xl + SPACING.sm); // = px(40)
    }

    // 卡片 bg：HUD 风深底 + 主色描边
    this.cardBg.clear();
    this.cardBg
      .fillStyle(HEX.bg, 0.95)
      .fillRect(cardX, cardY, cardW, cardH)
      .lineStyle(px(1), HEX.primary, 0.6)
      .strokeRect(cardX, cardY, cardW, cardH);

    this.cardTitle.setPosition(cardX + px(CARD_PAD), cardY + px(CARD_PAD));
    this.cardBody.setPosition(
      cardX + px(CARD_PAD),
      cardY + px(CARD_PAD) + this.cardTitle.height + px(SPACING.xs + 2), // title→body gap = px(6)
    );

    // 跳过按钮：卡片左下角
    const skipX = cardX + px(SPACING.sm);
    const skipY = cardY + cardH - px(SKIP_BTN_H) - px(SPACING.sm);
    this.skipBtn.container.setPosition(skipX, skipY);
    this.redrawSkipBtn();

    // 「下一步」按钮：卡片右下角，仅 manual 步骤显示
    const nextX = cardX + cardW - px(NEXT_BTN_W) - px(SPACING.sm);
    const nextY = cardY + cardH - px(NEXT_BTN_H) - px(SPACING.sm);
    this.nextBtn.container.setPosition(nextX, nextY);
    this.redrawNextBtn();
  }

  destroy(): void {
    this.cancelAutoTimer();
    this.container.destroy(true);
  }

  private cancelAutoTimer(): void {
    if (this.autoTimer) {
      this.autoTimer.remove(false);
      this.autoTimer = null;
    }
  }

  /** 更新 dim Graphics 的 hitArea 矩形，保证拦截区域跟视觉同步 */
  private setDimHit(g: GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
    const hit = g.input?.hitArea as Geom.Rectangle | undefined;
    if (hit) hit.setTo(x, y, w, h);
  }

  private makeSkipBtn(): SkipBtn {
    const w = px(SKIP_BTN_W);
    const h = px(SKIP_BTN_H);
    const bg = this.scene.add.graphics();
    const label = this.scene.add
      .text(w / 2, h / 2, '跳过教学', {
        fontFamily: FONT,
        fontSize: `${px(10)}px`,
        color: COLOR.dim,
      })
      .setLetterSpacing(px(10 * 0.2))
      .setOrigin(0.5);
    const container = this.scene.add.container(0, 0, [bg, label]);
    container.setSize(w, h);
    setRectInteractive(container, w, h, { useHandCursor: true, bgAlign: 'topLeft' });
    container.on('pointerdown', () => {
      sfx.uiClick();
      this.cb.onSkip();
    });
    return { container, bg, label };
  }

  private makeNextBtn(): SkipBtn {
    const w = px(NEXT_BTN_W);
    const h = px(NEXT_BTN_H);
    const bg = this.scene.add.graphics();
    const label = this.scene.add
      .text(w / 2, h / 2, '下一步 →', {
        fontFamily: FONT,
        fontSize: `${px(11)}px`,
        color: COLOR.highlight,
        fontStyle: 'bold',
      })
      .setLetterSpacing(px(11 * 0.2))
      .setOrigin(0.5);
    const container = this.scene.add.container(0, 0, [bg, label]);
    container.setSize(w, h);
    setRectInteractive(container, w, h, { useHandCursor: true, bgAlign: 'topLeft' });
    container.on('pointerdown', () => {
      sfx.uiClick();
      this.cb.onAdvance();
    });
    container.setVisible(false);
    return { container, bg, label };
  }

  private redrawSkipBtn(): void {
    const w = px(SKIP_BTN_W);
    const h = px(SKIP_BTN_H);
    this.skipBtn.bg
      .clear()
      .fillStyle(HEX.bg, 0.7)
      .fillRect(0, 0, w, h)
      .lineStyle(px(1), HEX.primary, 0.4)
      .strokeRect(0, 0, w, h);
  }

  private redrawNextBtn(): void {
    const w = px(NEXT_BTN_W);
    const h = px(NEXT_BTN_H);
    this.nextBtn.bg
      .clear()
      .fillStyle(HEX.highlight, 0.18)
      .fillRect(0, 0, w, h)
      .lineStyle(px(1.5), HEX.highlight, 0.85)
      .strokeRect(0, 0, w, h);
  }
}
