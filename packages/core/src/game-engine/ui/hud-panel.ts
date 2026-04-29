import type { GameObjects, Scene } from 'phaser';
import type { WaveSpawn } from '../game/data/waves';
import type { PathogenType } from '../game/entities';
import { PATHOGEN_REGISTRY } from '../game/registry/pathogen-registry';
import type { GameState, ProtectedCellInstance } from '../game/state';
import { SAFE_TOP } from '../layout/safe-area';
import { SPACING } from '../layout/spacing';
import { COLOR, FONT, FONT_MONO, HEX, px } from '../style';
import { drawProgressBar } from './atoms/progress-bar';
import { WaveBar } from './wave-bar';

/**
 * 下波预览 summarize 纯函数（导出供单测）。把 composition 按 type 累加成 dict 数组，
 * 同时附带 flying / boss 标记供 UI 渲染。
 *
 * boss 判定：maxHp ≥ 200（覆盖 saureus 240 / 未来更高 HP boss）。
 */
export interface WavePreviewSummaryItem {
  type: PathogenType;
  count: number;
  flying: boolean;
  boss: boolean;
  /** 该 spawn 段是否含 fortified modifier（任一段含 → true） */
  fortified?: boolean;
  /** 该 spawn 段是否含 encapsulated modifier */
  encapsulated?: boolean;
  /** 该 spawn 段是否含 camouflaged modifier */
  camouflaged?: boolean;
}

export function summarizeComposition(composition: readonly WaveSpawn[]): WavePreviewSummaryItem[] {
  // 同 type 不同 modifier 视作同 item 合并 count；modifier 取并集（玩家 preview 看综合）
  const agg = new Map<PathogenType, { count: number; modifiers: Set<string> }>();
  for (const spawn of composition) {
    const cur = agg.get(spawn.type) ?? { count: 0, modifiers: new Set<string>() };
    cur.count += spawn.count;
    for (const m of spawn.modifiers ?? []) cur.modifiers.add(m);
    agg.set(spawn.type, cur);
  }
  const result: WavePreviewSummaryItem[] = [];
  // 用 forEach 而不是 for...of map.entries()：wx 工具 babel _createForOfIteratorHelper
  // 对 Map iterator 协议处理不对，会 throw 'Invalid attempt to iterate non-iterable instance'
  agg.forEach((info, type) => {
    const def = PATHOGEN_REGISTRY[type].def;
    const defaults = PATHOGEN_REGISTRY[type].defaultModifiers ?? [];
    const allMods = new Set<string>([...defaults, ...info.modifiers]);
    result.push({
      type,
      count: info.count,
      flying: allMods.has('flying'),
      boss: def.maxHp >= 200 || allMods.has('fortified'),
      fortified: allMods.has('fortified'),
      encapsulated: allMods.has('encapsulated'),
      camouflaged: allMods.has('camouflaged'),
    });
  });
  return result;
}

const HP_BAR_WIDTH = 80;
const HP_BAR_HEIGHT = 6;

/**
 * 战斗 HUD 左上：HP hero 卡片 | ATP pill | WaveBar（波次 seg + 下一波/剩余）
 * 同行横排；下方展示保护细胞 HP 列表。
 *
 * 对齐 DESIGN_SYSTEM：HP 与 ATP 同规格 hero 卡片，WaveBar 作为第三列，
 * 上行 WAVE seg 进度 + 计数，下行 pending label + 数字（数量 pendingCount 由
 * GameScene 计算后传入）。
 */
export class HudPanel {
  private scene: Scene;
  private container: GameObjects.Container;
  private hpCard: HeroCard;
  private atpPill: Pill;
  private waveBar: WaveBar;
  private hpDangerTween: Phaser.Tweens.Tween | null = null;
  private protectedSection: GameObjects.Container;

  constructor(scene: Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.hpCard = this.makeHpCard();
    this.atpPill = this.makeAtpPill();
    this.waveBar = new WaveBar(scene);
    this.container.add([this.hpCard.container, this.atpPill.container, this.waveBar.container]);
    this.container.setDepth(100);
    this.protectedSection = scene.add.container(0, 0);
    this.protectedSection.setDepth(100);
    this.protectedSection.setVisible(false);
  }

  sync(state: GameState, pendingCount: number): void {
    this.setHpValue(String(state.hp));
    this.setAtpValue(String(state.atp));
    this.waveBar.sync(state, pendingCount);

    // HP<3 进入脉动危险态；≥3 或 0 停止脉动
    if (state.hp < 3 && state.hp > 0 && !this.hpDangerTween) {
      this.hpDangerTween = this.scene.tweens.add({
        targets: this.hpCard.value,
        alpha: { from: 1, to: 0.45 },
        duration: 280,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    } else if ((state.hp >= 3 || state.hp <= 0) && this.hpDangerTween) {
      this.hpDangerTween.stop();
      this.hpDangerTween = null;
      this.hpCard.value.setAlpha(1);
    }

    this.refreshProtectedCells(state.protectedCells);
    this.relayoutRow();
  }

  layout(_W: number, _H: number): void {
    // wx 端 SAFE_TOP 兜住胶囊+刘海/灵动岛；H5 端 SAFE_TOP=0，行为不变
    this.container.setPosition(px(SPACING.sm + SPACING.xs), SAFE_TOP + px(SPACING.sm + 2));
    this.protectedSection.setPosition(
      px(SPACING.sm + SPACING.xs),
      SAFE_TOP + px(SPACING.xl + SPACING.lg + 2),
    );
    this.relayoutRow();
  }

  refreshProtectedCells(cells: readonly ProtectedCellInstance[]): void {
    this.protectedSection.removeAll(true);
    if (cells.length === 0) {
      this.protectedSection.setVisible(false);
      return;
    }
    this.protectedSection.setVisible(true);
    const rowH = px(SPACING.md);
    cells.forEach((pc, i) => {
      const y = i * rowH;
      const name = this.scene.add.text(0, y, pc.name, {
        fontFamily: FONT,
        fontSize: `${px(11)}px`,
        color: COLOR.protected,
        fontStyle: 'bold',
      });
      const barX = px(SPACING.xl + SPACING.md);
      const barY = y + px(SPACING.xs);
      const ratio = pc.maxHp > 0 ? Math.max(0, pc.hp / pc.maxHp) : 0;
      const bg = this.scene.add.graphics();
      // bg + 阈值色 fg 统一走 ProgressBar atom（HUD HP 风：默认 0.66/0.33 阈值切色）
      drawProgressBar(bg, {
        ratio,
        x: barX,
        y: barY,
        width: px(HP_BAR_WIDTH),
        height: px(HP_BAR_HEIGHT),
        color: { high: HEX.hpBarHigh, mid: HEX.hpMid, low: HEX.hpBarLow },
        bgColor: HEX.gridLine,
      });
      bg.lineStyle(px(0.5), HEX.protected, 0.5).strokeRect(
        barX,
        barY,
        px(HP_BAR_WIDTH),
        px(HP_BAR_HEIGHT),
      );
      const fg = this.scene.add.graphics();
      const num = this.scene.add.text(
        barX + px(HP_BAR_WIDTH) + px(SPACING.sm - 2),
        y,
        `${pc.hp}/${pc.maxHp}`,
        {
          fontFamily: FONT,
          fontSize: `${px(11)}px`,
          color: pc.hp === 0 ? COLOR.danger : COLOR.dim,
          fontStyle: pc.hp === 0 ? 'bold' : 'normal',
        },
      );
      this.protectedSection.add([name, bg, fg, num]);
    });
  }

  destroy(): void {
    this.container.destroy(true);
    this.protectedSection.destroy(true);
  }

  // ---------- 内部 ----------

  /**
   * 测量给定样式下指定文本的渲染宽度（scale=1 基线）。
   * 用来预留 HP/ATP 数字的固定宽度，避免数字位数变化时卡片宽度抖动。
   */
  private measureMonoWidth(sample: string, sizePx: number): number {
    const t = this.scene.add.text(0, 0, sample, {
      fontFamily: FONT_MONO,
      fontSize: `${sizePx}px`,
      fontStyle: 'bold',
    });
    const w = t.width;
    t.destroy();
    return w;
  }

  private makeHpCard(): HeroCard {
    const bg = this.scene.add.graphics();
    const leftBar = this.scene.add.graphics();
    const heart = this.scene.add
      .text(0, 0, '\u2665', {
        fontFamily: FONT_MONO,
        fontSize: `${px(16)}px`,
        color: COLOR.danger,
      })
      .setOrigin(0, 0.5);
    // 心跳呼吸：scale 1 → 1.18，1.2s yoyo（DESIGN_SYSTEM §7）
    this.scene.tweens.add({
      targets: heart,
      scaleX: 1.18,
      scaleY: 1.18,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
    const label = this.scene.add
      .text(0, 0, 'HP', {
        fontFamily: FONT_MONO,
        fontSize: `${px(8)}px`,
        color: COLOR.danger,
      })
      .setLetterSpacing(px(8 * 0.25))
      .setAlpha(0.7)
      .setOrigin(0, 0);
    const value = this.scene.add
      .text(0, 0, '0', {
        fontFamily: FONT_MONO,
        fontSize: `${px(20)}px`,
        color: COLOR.danger,
        fontStyle: 'bold',
      })
      .setOrigin(0, 0);
    value.setShadow(0, 0, COLOR.danger, px(6), true, true);
    const container = this.scene.add.container(0, 0, [bg, leftBar, heart, label, value]);
    // HP 预留 2 位数字宽度（00~99 都够用，不会抖动）
    const fixedValueW = this.measureMonoWidth('00', px(20));
    return { container, bg, leftBar, heart, label, value, fixedValueW, lastValue: '' };
  }

  private makeAtpPill(): Pill {
    const bg = this.scene.add.graphics();
    const leftBar = this.scene.add.graphics();
    const icon = this.scene.add.graphics();
    const label = this.scene.add
      .text(0, 0, 'ATP', {
        fontFamily: FONT_MONO,
        fontSize: `${px(8)}px`,
        color: COLOR.immuneDim,
      })
      .setLetterSpacing(px(8 * 0.25))
      .setOrigin(0, 0);
    const value = this.scene.add
      .text(0, 0, '0', {
        fontFamily: FONT_MONO,
        fontSize: `${px(20)}px`,
        color: COLOR.immune,
        fontStyle: 'bold',
      })
      .setOrigin(0, 0);
    const container = this.scene.add.container(0, 0, [bg, leftBar, icon, label, value]);
    // ATP 预留 3 位数字宽度（0~999 够用）
    const fixedValueW = this.measureMonoWidth('000', px(20));
    return { container, bg, leftBar, icon, label, value, fixedValueW, lastValue: '' };
  }

  private setHpValue(s: string): void {
    if (this.hpCard.lastValue === s) return;
    this.hpCard.lastValue = s;
    this.hpCard.value.text = s;
    this.bump(this.hpCard.value);
  }

  private setAtpValue(s: string): void {
    if (this.atpPill.lastValue === s) return;
    this.atpPill.lastValue = s;
    this.atpPill.value.text = s;
    this.bump(this.atpPill.value);
  }

  private bump(t: GameObjects.Text): void {
    if (!t.active) return;
    this.scene.tweens.killTweensOf(t);
    const baseScale = 1;
    t.setScale(baseScale);
    this.scene.tweens.add({
      targets: t,
      scaleX: baseScale * 1.2,
      scaleY: baseScale * 1.2,
      duration: 90,
      yoyo: true,
      ease: 'Quad.out',
    });
  }

  private relayoutRow(): void {
    // 布局对齐 mockup .stat-hp：padding 6px 12px 6px 8px；左 3px 红条绝对定位
    // 在 left=0 处覆盖在 padding 上方（与 padL=8 的 padding 视觉重叠）
    const padL = px(SPACING.sm);
    const padR = px(SPACING.sm + 2); // = px(10)
    const padY = px(SPACING.sm - 2); // = px(6)
    const leftBarW = px(3);
    const gapAfterIcon = px(SPACING.sm);
    const textColGap = px(2); // label 与 value 之间

    // 测量 HP 卡片（value 列用预留的"00"固定宽度，保证 hp 1→10→100 不抖）
    const hpTextColW = Math.max(this.hpCard.label.width, this.hpCard.fixedValueW);
    const hpIconH = this.hpCard.heart.height;
    const hpTextColH = this.hpCard.label.height + textColGap + this.hpCard.value.height;
    const hpCardH = Math.max(hpIconH, hpTextColH) + padY * 2;
    const hpCardW = padL + this.hpCard.heart.width + gapAfterIcon + hpTextColW + padR;

    // HP 卡片重绘：淡红渐变（2 段 alpha 模拟）+ 红边框 + 左 3px 红发光竖条
    this.hpCard.bg.clear();
    this.hpCard.bg
      .fillStyle(HEX.danger, 0.12)
      .fillRect(0, 0, hpCardW, hpCardH)
      .fillStyle(HEX.danger, 0.04)
      .fillRect(hpCardW / 2, 0, hpCardW / 2, hpCardH)
      .lineStyle(px(1), HEX.danger, 0.5)
      .strokeRect(0, 0, hpCardW, hpCardH);
    // 左 3px 红色发光竖条（60% 高）
    this.hpCard.leftBar.clear();
    const leftBarH = hpCardH * 0.6;
    const leftBarY = (hpCardH - leftBarH) / 2;
    this.hpCard.leftBar.fillStyle(HEX.danger, 1).fillRect(0, leftBarY, leftBarW, leftBarH);

    // 内部元素排列：leftBar 绝对定位在 x=0..3 覆盖 padding 左缘，内容从 padL=8 起
    this.hpCard.heart.setPosition(padL, hpCardH / 2);
    const textColX = padL + this.hpCard.heart.width + gapAfterIcon;
    const textColY = (hpCardH - hpTextColH) / 2;
    this.hpCard.label.setPosition(textColX, textColY);
    this.hpCard.value.setPosition(textColX, textColY + this.hpCard.label.height + textColGap);

    // ATP pill 布局（与 HP 卡片完全相同的 padding / leftBar / icon 尺寸 → 高度自然一致）
    const atpIconSize = this.hpCard.heart.width; // 对齐心跳字宽，视觉对称
    const atpTextColW = Math.max(this.atpPill.label.width, this.atpPill.fixedValueW);
    const atpTextColH = this.atpPill.label.height + textColGap + this.atpPill.value.height;
    // height 强制对齐 HP card：rowH
    const atpPillH = hpCardH;
    const atpPillW = padL + atpIconSize + gapAfterIcon + atpTextColW + padR;

    // ATP 卡片重绘：immune 淡绿渐变 + 绿边 + 左 3px 绿发光竖条（与 HP hero 对称）
    this.atpPill.bg.clear();
    this.atpPill.bg
      .fillStyle(HEX.immune, 0.12)
      .fillRect(0, 0, atpPillW, atpPillH)
      .fillStyle(HEX.immune, 0.04)
      .fillRect(atpPillW / 2, 0, atpPillW / 2, atpPillH)
      .lineStyle(px(1), HEX.immune, 0.5)
      .strokeRect(0, 0, atpPillW, atpPillH);
    this.atpPill.leftBar.clear();
    const atpBarH = atpPillH * 0.6;
    const atpBarY = (atpPillH - atpBarH) / 2;
    this.atpPill.leftBar.fillStyle(HEX.immune, 1).fillRect(0, atpBarY, leftBarW, atpBarH);

    // ATP 图标：硬币双圈 + 中心 P-P-P 三磷酸链（货币感 + 生化标识）
    this.atpPill.icon.clear();
    const cx = padL + atpIconSize / 2;
    const cy = atpPillH / 2;
    const rOuter = atpIconSize / 2 - px(0.5);
    const rInner = rOuter - px(2);
    // 硬币外圈（粗）+ 内圈（细，模拟金属边缘）
    this.atpPill.icon
      .lineStyle(px(1.5), HEX.immune, 1)
      .strokeCircle(cx, cy, rOuter)
      .lineStyle(px(0.8), HEX.immune, 0.55)
      .strokeCircle(cx, cy, rInner);
    // 三磷酸链：3 个 P 圆水平排列，细线相连，模拟 ATP 的 α-β-γ 磷酸键
    const pR = px(1.7);
    const pGap = px(2.4);
    const startX = cx - pGap;
    this.atpPill.icon
      .lineStyle(px(1), HEX.immune, 0.85)
      .lineBetween(startX, cy, startX + pGap * 2, cy);
    this.atpPill.icon.fillStyle(HEX.immune, 1);
    for (let i = 0; i < 3; i++) {
      this.atpPill.icon.fillCircle(startX + i * pGap, cy, pR);
    }

    const atpTextColX = padL + atpIconSize + gapAfterIcon;
    const atpTextColY = (atpPillH - atpTextColH) / 2;
    this.atpPill.label.setPosition(atpTextColX, atpTextColY);
    this.atpPill.value.setPosition(
      atpTextColX,
      atpTextColY + this.atpPill.label.height + textColGap,
    );

    // 横排：HP 卡片 | gap | ATP pill | gap | WaveBar（已等高，垂直居中）
    const gap = px(SPACING.sm + 2); // = px(10)
    this.hpCard.container.setPosition(0, 0);
    this.atpPill.container.setPosition(hpCardW + gap, 0);
    const waveBarX = hpCardW + gap + atpPillW + px(SPACING.md);
    const waveBarY = (atpPillH - this.waveBar.getHeight()) / 2;
    this.waveBar.setPosition(waveBarX, waveBarY);
  }
}

interface HeroCard {
  container: GameObjects.Container;
  bg: GameObjects.Graphics;
  leftBar: GameObjects.Graphics;
  heart: GameObjects.Text;
  label: GameObjects.Text;
  value: GameObjects.Text;
  /** value 列预留的固定宽度（按"00" 2 位数字测量），避免数字变化时卡片抖动 */
  fixedValueW: number;
  lastValue: string;
}

interface Pill {
  container: GameObjects.Container;
  bg: GameObjects.Graphics;
  leftBar: GameObjects.Graphics;
  icon: GameObjects.Graphics;
  label: GameObjects.Text;
  value: GameObjects.Text;
  /** value 列预留的固定宽度（按"000" 3 位数字测量） */
  fixedValueW: number;
  lastValue: string;
}
