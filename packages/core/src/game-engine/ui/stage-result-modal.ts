import type { GameObjects, Scene } from 'phaser';
import type { LevelMode } from '../game/data/levels';
import type { TowerType } from '../game/entities';
import type { StageResult } from '../game/state';
import { SPACING } from '../layout/spacing';
import { getTowerBattleColor } from '../render/entity-colors';
import { COLOR, FONT, HEX, px } from '../style';
import { PhaserButton } from './phaser-button';

export interface StageResultCallbacks {
  onReplay: () => void;
  onMenu: () => void;
  onNextLevel?: () => void;
}

const TOWER_META: Record<TowerType, { name: string; desc: string }> = {
  macrophage: { name: '巨噬细胞', desc: '范围近战，擅长清病原群' },
  neutrophil: { name: '粒细胞', desc: '单体短射程高频攻击' },
  nkcell: { name: 'NK 细胞', desc: '中远射程单体高伤，可打空' },
  dendritic: { name: '树突状细胞', desc: '辅助塔，为周围攻击塔提供伤害增益' },
  mitochondria: { name: '线粒体共生体', desc: '经济塔，每波结算时产生 ATP' },
};

const CARD_W = 380;

/**
 * 关卡结算 Modal：全屏 dim + 中央卡片，复刻 React 版 StageResult。
 * 胜利"防线守住"绿框 + 三星 + 4 行统计 + 解锁奖励金框 + 重玩/返回/下一关。
 * 失败"防线崩溃"红框 + 灰星 + 重玩/返回/下一关(灰)。
 */
export class StageResultModal {
  private scene: Scene;
  private container: GameObjects.Container;
  private dim: GameObjects.Graphics;
  private card: GameObjects.Graphics;
  private titleText: GameObjects.Text;
  private starText: GameObjects.Text;
  private statsText: GameObjects.Text;
  private rewardCard: GameObjects.Graphics;
  private rewardTitle: GameObjects.Text;
  private rewardLines: GameObjects.Container;
  private replayBtn: PhaserButton;
  private menuBtn: PhaserButton;
  private nextBtn: PhaserButton;
  private visible = false;

  constructor(scene: Scene, cb: StageResultCallbacks) {
    this.scene = scene;
    this.dim = scene.add.graphics();
    this.card = scene.add.graphics();
    this.rewardCard = scene.add.graphics();

    // fontStyle '900' 命中 MiSans Heavy（结算大标题，方正锐利对齐 cyber 美学）
    // setStroke 1px 深色描边强化边缘（多种颜色场景都通用 bgDeep）
    this.titleText = scene.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: `${px(22)}px`,
        fontStyle: '900',
      })
      .setLetterSpacing(px(22 * 0.4))
      .setStroke(COLOR.bgDeep, px(1))
      .setOrigin(0.5);

    this.starText = scene.add
      .text(0, 0, '☆☆☆', {
        fontFamily: FONT,
        fontSize: `${px(48)}px`,
      })
      .setLetterSpacing(px(48 * 0.2))
      .setOrigin(0.5);

    this.statsText = scene.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: `${px(12)}px`,
        color: COLOR.primary,
        align: 'center',
        lineSpacing: px(8),
      })
      .setLetterSpacing(px(12 * 0.15))
      .setOrigin(0.5, 0);

    this.rewardTitle = scene.add
      .text(0, 0, '解锁奖励', {
        fontFamily: FONT,
        fontSize: `${px(10)}px`,
        color: COLOR.rewardGold,
      })
      .setLetterSpacing(px(10 * 0.3))
      .setOrigin(0, 0);

    this.rewardLines = scene.add.container(0, 0);

    const mkBtn = (w: number, label: string, onTap: () => void): PhaserButton =>
      new PhaserButton(scene, 0, 0, {
        label,
        width: w,
        height: 32,
        fontSize: 11,
        letterSpacingEm: 0.2,
        origin: 'topLeft',
        onTap,
      });
    this.replayBtn = mkBtn(110, '重玩', cb.onReplay);
    this.menuBtn = mkBtn(110, '返回菜单', cb.onMenu);
    this.nextBtn = mkBtn(228, '下一关', () => cb.onNextLevel?.());

    this.container = scene.add.container(0, 0, [
      this.dim,
      this.card,
      this.titleText,
      this.starText,
      this.statsText,
      this.rewardCard,
      this.rewardTitle,
      this.rewardLines,
      this.replayBtn.container,
      this.menuBtn.container,
      this.nextBtn.container,
    ]);
    this.container.setDepth(500);
    this.container.setVisible(false);
  }

  isVisible(): boolean {
    return this.visible;
  }

  show(
    result: StageResult,
    nextLevelTitle: string | null,
    rewards: readonly TowerType[],
    mode: LevelMode = 'normal',
  ): void {
    this.visible = true;
    this.container.setVisible(true);
    this.container.setAlpha(0);
    this.scene.tweens.add({ targets: this.container, alpha: 1, duration: 220, ease: 'Power2' });

    const won = result.outcome === 'won';
    const isElite = mode === 'elite';
    // 胜利标题：普通=青色 primary，精英=金色 rewardGold；失败永远红色
    const titleColor = won ? (isElite ? HEX.rewardGold : HEX.primary) : HEX.danger;
    const titleColorStr = `#${titleColor.toString(16).padStart(6, '0')}`;

    const baseTitle = won ? '防线守住' : '防线崩溃';
    this.titleText.text = isElite ? `精英 · ${baseTitle}` : baseTitle;
    this.titleText.setColor(titleColorStr).setShadow(0, 0, titleColorStr, px(12), true, true);

    if (won) {
      const filled = '★'.repeat(result.stars);
      const empty = '☆'.repeat(3 - result.stars);
      this.starText.text = filled + empty;
      // 精英星金色，普通星青色，与按钮 + buff 卡的精英金色统一
      const starColor = isElite ? HEX.rewardGold : HEX.primary;
      this.starText.setColor(`#${starColor.toString(16).padStart(6, '0')}`);
    } else {
      this.starText.text = '☆☆☆';
      this.starText.setColor(COLOR.starDim);
    }

    this.statsText.text = [
      `得分 · ${result.score}`,
      `剩余 HP · ${result.remainingHp} / 10`,
      `打到波次 · ${result.waveReached} / 5`,
      `剩余 ATP · ${result.remainingAtp}`,
    ].join('\n');

    // 解锁奖励：精英模式不发塔奖励（GameScene 跳过 unlockTower），不显示奖励卡
    this.rewardLines.removeAll(true);
    const showRewards = won && !isElite && rewards.length > 0;
    this.rewardCard.setVisible(showRewards);
    this.rewardTitle.setVisible(showRewards);
    this.rewardLines.setVisible(showRewards);
    if (showRewards) {
      this.buildRewardLines(rewards);
    }

    // 按钮可用性：replay / menu 永远可点；next 在无下关时灰显
    const hasNext = nextLevelTitle !== null;
    this.nextBtn.setLabel(hasNext ? `下一关 · ${nextLevelTitle}` : '下一关（敬请期待）');
    this.nextBtn.setEnabled(hasNext);

    const W = this.scene.scale.width;
    const H = this.scene.scale.height;
    this.redrawDim(W, H);
    this.layoutChildren(titleColor);
  }

  private buildRewardLines(rewards: readonly TowerType[]): void {
    const innerW = px(CARD_W) - px(SPACING.xxl + SPACING.lg); // 内宽减 xxl + lg
    let y = 0;
    const lineH = px(SPACING.md + 2); // = px(18)
    for (const t of rewards) {
      const meta = TOWER_META[t];
      const color = getTowerBattleColor(t);
      const colorStr = `#${color.toString(16).padStart(6, '0')}`;
      const dot = this.scene.add.graphics();
      // dot 中心 x = px(5)、半径 px(5)；shadow 半径 px(8) 紧凑视觉
      dot.fillStyle(color, 1).fillCircle(px(SPACING.xs + 1), y + lineH / 2, px(SPACING.xs + 1));
      const dotShadow = this.scene.add.graphics();
      dotShadow.fillStyle(color, 0.4).fillCircle(px(SPACING.xs + 1), y + lineH / 2, px(SPACING.sm));
      const name = this.scene.add
        // x = px(16) 给 dot 留位
        .text(px(SPACING.md), y, meta.name, {
          fontFamily: FONT,
          fontSize: `${px(12)}px`,
          color: colorStr,
        })
        .setLetterSpacing(px(12 * 0.15))
        .setOrigin(0, 0);
      const desc = this.scene.add
        .text(innerW, y, meta.desc, {
          fontFamily: FONT,
          fontSize: `${px(9)}px`,
          color: COLOR.dim,
        })
        .setLetterSpacing(px(9 * 0.1))
        .setOrigin(1, 0);
      this.rewardLines.add([dotShadow, dot, name, desc]);
      y += lineH + px(2); // 紧密堆叠 px(2)
    }
  }

  hide(): void {
    this.visible = false;
    this.container.setVisible(false);
  }

  layout(W: number, H: number): void {
    this.container.setPosition(0, 0);
    this.redrawDim(W, H);
  }

  private redrawDim(W: number, H: number): void {
    this.dim.clear();
    this.dim.fillStyle(HEX.bg, 0.85).fillRect(0, 0, W, H);
  }

  private layoutChildren(borderColor: number): void {
    const W = this.scene.scale.width;
    const H = this.scene.scale.height;
    const cardW = px(CARD_W);
    const padTop = px(SPACING.lg + SPACING.xs); // = px(28)
    const padX = px(SPACING.lg);
    const padBottom = px(SPACING.md + SPACING.xs); // = px(20)

    // 先按内容算 cardH（动态）
    let y = padTop;
    // 标题
    const titleY = y;
    y += this.titleText.height;
    // 星级
    y += px(SPACING.md);
    const starY = y + this.starText.height / 2;
    y += this.starText.height;
    // stats
    y += px(SPACING.md + SPACING.xs); // = px(20)
    const statsY = y;
    y += this.statsText.height;
    // rewards
    let rewardCardY = 0;
    let rewardCardH = 0;
    if (this.rewardCard.visible) {
      y += px(SPACING.md + 2); // = px(18)
      rewardCardY = y;
      const innerPadY = px(SPACING.sm + 2); // = px(10)
      const linesH = this.rewardLines.getBounds().height;
      const titleH = this.rewardTitle.height + px(SPACING.sm);
      rewardCardH = innerPadY * 2 + titleH + linesH;
      y += rewardCardH;
    }
    // 按钮
    y += px(SPACING.lg);
    const btnRowY = y;
    y += this.replayBtn.heightPx;
    y += px(SPACING.sm);
    const nextBtnY = y;
    y += this.nextBtn.heightPx;
    y += padBottom;
    const cardH = y - padTop + padTop;

    // 计算卡片位置（屏幕居中）
    const cardX = Math.round((W - cardW) / 2);
    const cardYOff = Math.round((H - cardH) / 2);

    // 重画 card
    this.card.clear();
    this.card
      .fillStyle(HEX.bg, 0.98)
      .fillRect(cardX, cardYOff, cardW, cardH)
      .lineStyle(px(1), borderColor, 1)
      .strokeRect(cardX, cardYOff, cardW, cardH);

    // 标题居中
    this.titleText.setPosition(W / 2, cardYOff + titleY + this.titleText.height / 2);
    this.starText.setPosition(W / 2, cardYOff + starY);
    this.statsText.setPosition(W / 2, cardYOff + statsY);

    // 奖励卡
    if (this.rewardCard.visible) {
      const rcX = cardX + padX;
      const rcW = cardW - padX * 2;
      const rcY = cardYOff + rewardCardY;
      this.rewardCard.clear();
      this.rewardCard
        .fillStyle(HEX.rewardGold, 0.08)
        .fillRect(rcX, rcY, rcW, rewardCardH)
        .lineStyle(px(1), HEX.rewardGold, 0.55)
        .strokeRect(rcX, rcY, rcW, rewardCardH);
      // 内边距 12 = sm + xs；上 10 = sm + 2；title→lines 间距 = sm
      this.rewardTitle.setPosition(rcX + px(SPACING.sm + SPACING.xs), rcY + px(SPACING.sm + 2));
      this.rewardLines.setPosition(
        rcX + px(SPACING.sm + SPACING.xs),
        rcY + px(SPACING.sm + 2) + this.rewardTitle.height + px(SPACING.sm),
      );
    }

    // 按钮：重玩+返回横排，下一关单独一行
    const btnGap = px(SPACING.sm);
    const btnsTotalW = this.replayBtn.widthPx + btnGap + this.menuBtn.widthPx;
    const btnsX = cardX + (cardW - btnsTotalW) / 2;
    this.replayBtn.container.setPosition(btnsX, cardYOff + btnRowY);
    this.menuBtn.container.setPosition(btnsX + this.replayBtn.widthPx + btnGap, cardYOff + btnRowY);
    const nextX = cardX + (cardW - this.nextBtn.widthPx) / 2;
    this.nextBtn.container.setPosition(nextX, cardYOff + nextBtnY);
  }

  destroy(): void {
    this.container.destroy(true);
  }
}
