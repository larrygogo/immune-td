import type { GameObjects, Scene } from 'phaser';
import { sfx } from '@audio/sfx';
import { useMetaStore } from '@ui/store';
import { getLevel } from '../game/data/levels';
import {
  type HelperBuff,
  TOWER_DEFS,
  TOWER_LEVELS,
  type TargetingPriority,
  type TowerType,
} from '../game/entities';
import { isUpgradeUnlocked } from '../game/registry/research-registry';
import { TOWER_REGISTRY } from '../game/registry/tower-registry';
import type { GameState } from '../game/state';
import { setRectInteractive } from '../interactive';
import { SPACING } from '../layout/spacing';
import { getTowerBattleColor } from '../render/entity-colors';
import { COLOR, FONT, HEX, px } from '../style';
import { EntityIcon } from './atoms/entity-icon';
import { PhaserButton } from './phaser-button';

export interface TowerDetailCallbacks {
  onUpgrade: (towerId: string) => void;
  onSell: (towerId: string) => void;
  onClose: () => void;
  /** 单体塔目标优先级切换；AoE / helper 塔此回调不会被调（按钮根本不显示） */
  onSetPriority?: (towerId: string, priority: TargetingPriority) => void;
}

/** 优先级按钮渲染顺序与对应 label */
const PRIORITY_ORDER: readonly TargetingPriority[] = ['first', 'last', 'strong', 'close'];
const PRIORITY_LABEL: Record<TargetingPriority, string> = {
  first: '最前',
  last: '最后',
  strong: '最强',
  close: '最近',
};

interface TypeMeta {
  name: string;
  modeLabel: string;
}

const TYPE_META: Record<TowerType, TypeMeta> = {
  macrophage: { name: '巨噬细胞', modeLabel: '范围' },
  neutrophil: { name: '粒细胞', modeLabel: '单体' },
  nkcell: { name: 'NK 细胞', modeLabel: '单体' },
  dendritic: { name: '树突状细胞', modeLabel: '辅助' },
  mitochondria: { name: '线粒体共生体', modeLabel: '经济' },
};

const PANEL_W = 240;
const ICON_SIZE = 40;

/**
 * 选中已放置塔时显示：左上 mini 图标 + 塔名（带发光）+ Lv 徽章 + 关闭 ✕
 * 主体：当前属性 4 行（攻击塔=伤害/射程/攻速/HP；辅助塔=伤害增益/范围/攻速增益/HP）；
 * 未满级时下方独立"升级预览 box" 仅列出会变化的属性 cur → next；
 * footer 累计伤害/投入/拆返；升级 + 拆除按钮。固定右上角。
 */
export class TowerDetailPanel {
  private scene: Scene;
  private container: GameObjects.Container;
  private bg: GameObjects.Graphics;
  /** 塔图标 atom：sprite + fallback shape 统一走 EntityIcon（按 type/level 自动选 sprite key） */
  private iconEntity: EntityIcon | null = null;
  /** type+level cache key，避免 sync 时同 key 重建 */
  private currentIconKey: string | null = null;
  private nameText: GameObjects.Text;
  private modeText: GameObjects.Text;
  private levelBadge: GameObjects.Graphics;
  private levelText: GameObjects.Text;
  private closeBtn: GameObjects.Container;
  private closeText: GameObjects.Text;
  private statLabels: GameObjects.Text[] = [];
  private statCur: GameObjects.Text[] = [];
  /** 升级预览 box：标题 + 4 行（label + cur + arrow + next），未满级时显示 */
  private upBoxBg: GameObjects.Graphics;
  private upBoxTitle: GameObjects.Text;
  private upRowLabels: GameObjects.Text[] = [];
  private upRowCur: GameObjects.Text[] = [];
  private upRowArrow: GameObjects.Text[] = [];
  private upRowNext: GameObjects.Text[] = [];
  /** 当前 sync 算出的本次升级预览有几行可见，layout 用以决定 box 高度 */
  private upBoxVisibleRows = 0;
  /** 满级 / 无下一级时整 box 不渲染，layout 用 */
  private upBoxVisible = false;
  private footerText: GameObjects.Text;
  private upgradeBtn: PhaserButton;
  private sellBtn: PhaserButton;
  /** 4 个优先级按钮：first / last / strong / close；仅 single 塔显示 */
  private priorityBtns: PhaserButton[] = [];
  /** 优先级行整体可见性：layout 用于条件性占位 */
  private priorityRowVisible = false;
  private currentTowerId: string | null = null;
  private currentColor: number = HEX.primary;
  private viewportW = 0;

  constructor(scene: Scene, cb: TowerDetailCallbacks) {
    this.scene = scene;
    this.bg = scene.add.graphics();
    this.nameText = scene.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: `${px(13)}px`,
      })
      .setLetterSpacing(px(2))
      .setOrigin(0, 0);
    this.modeText = scene.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: `${px(9)}px`,
        color: COLOR.dim,
      })
      .setLetterSpacing(px(2))
      .setOrigin(0, 0);
    this.levelBadge = scene.add.graphics();
    this.levelText = scene.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: `${px(10)}px`,
        fontStyle: 'bold',
      })
      .setOrigin(0, 0);
    this.closeText = scene.add
      .text(0, 0, '✕', {
        fontFamily: FONT,
        fontSize: `${px(14)}px`,
        color: COLOR.dim,
      })
      .setOrigin(0, 0);
    this.closeBtn = scene.add.container(0, 0, [this.closeText]);
    this.closeBtn.setSize(px(SPACING.md + SPACING.xs), px(SPACING.md + SPACING.xs));
    setRectInteractive(this.closeBtn, px(SPACING.md + SPACING.xs), px(SPACING.md + SPACING.xs), {
      useHandCursor: true,
      bgAlign: 'topLeft',
    });
    this.closeBtn.on('pointerdown', () => {
      sfx.uiClick();
      cb.onClose();
    });

    for (const lab of ['伤害', '射程', '攻速', 'HP']) {
      this.statLabels.push(
        scene.add
          .text(0, 0, lab, {
            fontFamily: FONT,
            fontSize: `${px(10)}px`,
            color: COLOR.dim,
          })
          .setLetterSpacing(px(1))
          .setOrigin(0, 0),
      );
      this.statCur.push(
        scene.add
          .text(0, 0, '', {
            fontFamily: FONT,
            fontSize: `${px(11)}px`,
            color: COLOR.white,
          })
          .setLetterSpacing(px(1))
          .setOrigin(0, 0),
      );
    }

    // 升级预览 box（背景 + 标题 + 4 行 label/cur/arrow/next）
    this.upBoxBg = scene.add.graphics();
    this.upBoxTitle = scene.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: `${px(10)}px`,
        fontStyle: 'bold',
      })
      .setLetterSpacing(px(1.5))
      .setOrigin(0, 0)
      .setVisible(false);
    for (let i = 0; i < 4; i++) {
      this.upRowLabels.push(
        scene.add
          .text(0, 0, '', {
            fontFamily: FONT,
            fontSize: `${px(9)}px`,
            color: COLOR.dim,
          })
          .setLetterSpacing(px(1))
          .setOrigin(0, 0)
          .setVisible(false),
      );
      this.upRowCur.push(
        scene.add
          .text(0, 0, '', {
            fontFamily: FONT,
            fontSize: `${px(10)}px`,
            color: COLOR.textMuted,
          })
          .setLetterSpacing(px(1))
          .setOrigin(0, 0)
          .setVisible(false),
      );
      this.upRowArrow.push(
        scene.add
          .text(0, 0, '→', {
            fontFamily: FONT,
            fontSize: `${px(10)}px`,
            color: COLOR.dim,
          })
          .setOrigin(0, 0)
          .setVisible(false),
      );
      this.upRowNext.push(
        scene.add
          .text(0, 0, '', {
            fontFamily: FONT,
            fontSize: `${px(10)}px`,
            fontStyle: 'bold',
          })
          .setLetterSpacing(px(1))
          .setOrigin(0, 0)
          .setVisible(false),
      );
    }

    this.footerText = scene.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: `${px(9)}px`,
        color: COLOR.dim,
      })
      .setLetterSpacing(px(1))
      .setOrigin(0, 0);

    // 升级/拆除按钮颜色在 sync() 里随当前 tower 种类 setColor 更新
    this.upgradeBtn = new PhaserButton(scene, 0, 0, {
      label: '升级',
      width: 110,
      height: 28,
      fontSize: 11,
      letterSpacingEm: 0.09,
      origin: 'topLeft',
      onTap: () => {
        if (this.currentTowerId) cb.onUpgrade(this.currentTowerId);
      },
    });
    this.sellBtn = new PhaserButton(scene, 0, 0, {
      label: '拆除',
      width: 88,
      height: 28,
      fontSize: 11,
      letterSpacingEm: 0.09,
      color: HEX.danger,
      origin: 'topLeft',
      onTap: () => {
        if (this.currentTowerId) cb.onSell(this.currentTowerId);
      },
    });

    // 4 个目标优先级按钮（first / last / strong / close）。
    // 仅 single 塔（neutrophil / nkcell）的 sync() 里 setVisible(true)。
    for (const priority of PRIORITY_ORDER) {
      const btn = new PhaserButton(scene, 0, 0, {
        label: PRIORITY_LABEL[priority],
        width: 50,
        height: 22,
        fontSize: 9,
        letterSpacingEm: 0.06,
        origin: 'topLeft',
        onTap: () => {
          if (this.currentTowerId && cb.onSetPriority) {
            cb.onSetPriority(this.currentTowerId, priority);
          }
        },
      });
      btn.container.setVisible(false);
      this.priorityBtns.push(btn);
    }

    const children: GameObjects.GameObject[] = [
      this.bg,
      // iconEntity.container 在 syncIcon 时 addAt(1) 插入到 bg 之后、nameText 之前
      this.nameText,
      this.modeText,
      this.levelBadge,
      this.levelText,
      this.closeBtn,
      ...this.statLabels,
      ...this.statCur,
      this.upBoxBg,
      this.upBoxTitle,
      ...this.upRowLabels,
      ...this.upRowCur,
      ...this.upRowArrow,
      ...this.upRowNext,
      this.footerText,
      this.upgradeBtn.container,
      this.sellBtn.container,
      ...this.priorityBtns.map((b) => b.container),
    ];
    this.container = scene.add.container(0, 0, children);
    this.container.setDepth(300);
    this.container.setVisible(false);
  }

  /**
   * 同步塔头像：sprite + fallback 全走 EntityIcon atom。
   * 同 type+level 时跳过重建，否则销毁旧的、新建并插入到 container 顶部 bg 之后。
   *
   * 不传 `showLevelBadge`：本面板已自有 levelBadge 在右上角显示 Lv，避免重复。
   */
  private syncIcon(type: TowerType, level: 1 | 2 | 3, _color: number): void {
    const key = `${type}-${level}`;
    if (this.currentIconKey === key && this.iconEntity) return;
    this.currentIconKey = key;

    this.iconEntity?.destroy();
    // sprite 中心 = padX + iconSize/2，padX = px(14)，padY = px(12)
    const cx = px(SPACING.sm + SPACING.xs + 2) + px(ICON_SIZE) / 2;
    const cy = px(SPACING.sm + SPACING.xs) + px(ICON_SIZE) / 2;
    const iconSize = px(ICON_SIZE) - px(SPACING.xs); // 内嵌 px(4) 留 sprite 边缘
    this.iconEntity = new EntityIcon(this.scene, {
      kind: 'tower',
      type,
      size: iconSize,
      x: cx,
      y: cy,
      decorations: { level },
    });
    // bg(0) → iconEntity(1) → nameText(2)... 维持原 Z 顺序
    this.container.addAt(this.iconEntity.container, 1);
  }

  show(towerId: string, state: GameState): void {
    this.currentTowerId = towerId;
    this.container.setVisible(true);
    this.sync(state);
  }

  hide(): void {
    this.currentTowerId = null;
    this.container.setVisible(false);
  }

  getSelectedId(): string | null {
    return this.currentTowerId;
  }

  sync(state: GameState): void {
    if (!this.currentTowerId) return;
    const tower = state.towers.find((t) => t.id === this.currentTowerId);
    if (!tower) {
      this.hide();
      return;
    }
    const levels = TOWER_LEVELS[tower.type];
    const def = levels[tower.level - 1];
    if (!def) {
      this.hide();
      return;
    }
    const nextDef = levels[tower.level];
    const meta = TYPE_META[tower.type];
    const metaColor = getTowerBattleColor(tower.type);
    this.currentColor = metaColor;
    const colorStr = `#${metaColor.toString(16).padStart(6, '0')}`;

    this.syncIcon(tower.type, tower.level, metaColor);

    this.nameText.text = meta.name;
    this.nameText.setColor(colorStr).setShadow(0, 0, colorStr, px(6), true, true);

    const typeDef = TOWER_DEFS[tower.type];
    const role = TOWER_REGISTRY[tower.type].role;
    this.modeText.text =
      role === 'helper'
        ? '辅助'
        : role === 'economy'
          ? '经济'
          : typeDef.targetingMode === 'aoe'
            ? '范围'
            : '单体';

    this.levelText.text = `Lv${tower.level}`;
    this.levelText.setColor(colorStr);

    // stats（第 4 行 HP：活 HP / 该级上限 → 升级后上限；DoT 扣血时活 HP 会低于 maxHp）
    // 活 HP 是浮点（DoT 累加），显示用 Math.ceil 向上取整避免假死（hp=0.3 显示 1）
    const hpInt = Math.ceil(tower.hp);
    const hpCur = hpInt < def.hp ? `${hpInt}/${def.hp}` : String(def.hp);

    // 辅助塔的伤害增益 / 攻速增益 用 helperBuff 字段格式化
    const fmtDmgBuff = (b?: HelperBuff): string =>
      b ? `+${Math.round((b.dmgMultiplier - 1) * 100)}%` : '—';
    const fmtIntervalBuff = (b?: HelperBuff): string => {
      if (!b || b.intervalMultiplier == null || b.intervalMultiplier === 1) return '—';
      // intervalMultiplier < 1 = 攻击间隔缩短，显示加速百分比
      return `+${Math.round((1 / b.intervalMultiplier - 1) * 100)}%`;
    };

    type Row = { label: string; cur: string; next: string | null };
    const fmtAtpPerWave = (b?: { atpPerWave: number }): string => (b ? `+${b.atpPerWave}/波` : '—');
    let rows: Row[];
    if (role === 'helper') {
      rows = [
        {
          label: '伤害增益',
          cur: fmtDmgBuff(def.helperBuff),
          next: nextDef ? fmtDmgBuff(nextDef.helperBuff) : null,
        },
        {
          label: '范围',
          cur: `${def.range.toFixed(1)}格`,
          next: nextDef ? `${nextDef.range.toFixed(1)}格` : null,
        },
        {
          label: '攻速增益',
          cur: fmtIntervalBuff(def.helperBuff),
          next: nextDef ? fmtIntervalBuff(nextDef.helperBuff) : null,
        },
        { label: 'HP', cur: hpCur, next: nextDef ? String(nextDef.hp) : null },
      ];
    } else if (role === 'economy') {
      // 经济塔（mitochondria）：显产能 + HP，无伤害/射程/攻速
      rows = [
        {
          label: '每波产能',
          cur: fmtAtpPerWave(def.economyBuff),
          next: nextDef ? fmtAtpPerWave(nextDef.economyBuff) : null,
        },
        { label: 'HP', cur: hpCur, next: nextDef ? String(nextDef.hp) : null },
      ];
    } else {
      rows = [
        {
          label: '伤害',
          cur: String(def.damage),
          next: nextDef ? String(nextDef.damage) : null,
        },
        {
          label: '射程',
          cur: `${def.range.toFixed(1)}格`,
          next: nextDef ? `${nextDef.range.toFixed(1)}格` : null,
        },
        {
          label: '攻速',
          cur: `${(1000 / def.attackIntervalMs).toFixed(2)}/s`,
          next: nextDef ? `${(1000 / nextDef.attackIntervalMs).toFixed(2)}/s` : null,
        },
        { label: 'HP', cur: hpCur, next: nextDef ? String(nextDef.hp) : null },
      ];
    }

    // 属性区：每行只显示 label + 当前值（主色高亮，无升级对比）
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const lbl = this.statLabels[i];
      const cur = this.statCur[i];
      if (!r || !lbl || !cur) continue;
      lbl.setText(r.label);
      cur.setText(r.cur);
      cur.setColor(colorStr);
    }

    // 升级预览 box：仅未满级时可见，仅列出 cur ≠ next 的属性
    const isMaxLevel = def.upgradeCost === null;
    if (isMaxLevel || !nextDef) {
      this.upBoxVisible = false;
      this.upBoxVisibleRows = 0;
      this.upBoxTitle.setVisible(false);
      for (let i = 0; i < 4; i++) {
        this.upRowLabels[i]?.setVisible(false);
        this.upRowCur[i]?.setVisible(false);
        this.upRowArrow[i]?.setVisible(false);
        this.upRowNext[i]?.setVisible(false);
      }
    } else {
      this.upBoxVisible = true;
      this.upBoxTitle.setText(`▸ 升级 Lv${tower.level} → Lv${tower.level + 1}`);
      this.upBoxTitle.setColor(colorStr).setVisible(true);
      let visibleIdx = 0;
      for (const r of rows) {
        if (r.next === null || r.next === r.cur) continue;
        const lbl = this.upRowLabels[visibleIdx];
        const cur = this.upRowCur[visibleIdx];
        const arr = this.upRowArrow[visibleIdx];
        const nxt = this.upRowNext[visibleIdx];
        if (!lbl || !cur || !arr || !nxt) break;
        lbl.setText(r.label).setVisible(true);
        cur.setText(r.cur).setVisible(true);
        arr.setVisible(true);
        nxt.setText(r.next).setColor(colorStr).setVisible(true);
        visibleIdx++;
      }
      this.upBoxVisibleRows = visibleIdx;
      for (let i = visibleIdx; i < 4; i++) {
        this.upRowLabels[i]?.setVisible(false);
        this.upRowCur[i]?.setVisible(false);
        this.upRowArrow[i]?.setVisible(false);
        this.upRowNext[i]?.setVisible(false);
      }
    }

    const refund = Math.floor(tower.totalInvested * 0.5);
    const dmgStr = role !== 'attack' ? '—' : String(Math.round(tower.damageDealt ?? 0));
    this.footerText.text = [
      `累计伤害 · ${dmgStr}`,
      `投入 · ${tower.totalInvested} ATP     拆除返还 · ${refund}`,
    ].join('\n');

    // v4：build/wave 阶段均可升级/拆除，仅 complete/failed 阶段禁用
    const canEdit = state.phase !== 'complete' && state.phase !== 'failed';
    // 每级单独锁：按 tower.level + 1 查对应级别的研究 id
    const targetLv = (tower.level + 1) as 2 | 3;
    // 教学关 isTutorial=true 跳过 research 锁，让玩家能演示升级（教学独立逻辑）
    const isTutorialLevel = getLevel(state.levelId).isTutorial === true;
    const researchUnlocked =
      !isMaxLevel &&
      (isTutorialLevel ||
        isUpgradeUnlocked(useMetaStore.getState().unlockedResearch, tower.type, targetLv));
    const canUpgrade =
      canEdit && !isMaxLevel && researchUnlocked && state.atp >= (def.upgradeCost ?? 0);
    this.upgradeBtn.setColor(metaColor);
    if (isMaxLevel) this.upgradeBtn.setLabel('已满级');
    else if (!researchUnlocked) this.upgradeBtn.setLabel(`Lv${targetLv} 研究未解锁`);
    else this.upgradeBtn.setLabel(`升级 · ${def.upgradeCost} ATP`);
    this.upgradeBtn.setEnabled(canUpgrade);
    // 拆除按钮：颜色固定 danger，只改 label + enabled
    this.sellBtn.setLabel(`拆除 +${refund}`);
    this.sellBtn.setEnabled(canEdit);

    // 优先级按钮：仅 attack role 的 single 塔显示；helper / economy 跳过
    const isSingle = role === 'attack' && typeDef.targetingMode === 'single';
    this.priorityRowVisible = isSingle;
    for (let i = 0; i < this.priorityBtns.length; i++) {
      const btn = this.priorityBtns[i];
      const priority = PRIORITY_ORDER[i];
      if (!btn || !priority) continue;
      btn.container.setVisible(isSingle);
      if (!isSingle) continue;
      const isActive = tower.targetingPriority === priority;
      btn.setColor(isActive ? metaColor : HEX.dim);
      btn.setEnabled(canEdit);
    }

    this.layoutChildren();
  }

  layout(W: number, _H: number): void {
    this.viewportW = W;
    this.layoutChildren();
  }

  private layoutChildren(): void {
    const padX = px(SPACING.sm + SPACING.xs + 2); // = px(14)
    const padY = px(SPACING.sm + SPACING.xs); // = px(12)
    const spriteSize = px(ICON_SIZE);

    // 标题/模式 在 sprite 右侧
    const textX = padX + spriteSize + px(SPACING.sm + 2); // gap = px(10)
    this.nameText.setPosition(textX, padY);
    this.modeText.setPosition(textX, padY + this.nameText.height + px(2)); // 紧密堆叠 px(2)

    // 关闭按钮右上角
    const closeX = px(PANEL_W) - padX - this.closeText.width;
    this.closeBtn.setPosition(closeX, padY);

    // 等级徽章在关闭左侧
    const badgePadX = px(SPACING.xs + 2); // = px(6)
    const badgePadY = px(2); // 紧凑视觉
    const badgeW = this.levelText.width + badgePadX * 2;
    const badgeH = this.levelText.height + badgePadY * 2;
    const badgeX = closeX - px(SPACING.xs + 2) - badgeW;
    const badgeY = padY;
    this.levelBadge.clear();
    this.levelBadge
      .fillStyle(this.currentColor, 0.08)
      .fillRect(badgeX, badgeY, badgeW, badgeH)
      .lineStyle(px(1), this.currentColor, 0.5)
      .strokeRect(badgeX, badgeY, badgeW, badgeH);
    this.levelText.setPosition(badgeX + badgePadX, badgeY + badgePadY);

    // 属性区：每行 label 在左、当前值在右
    const statsStartY = padY + spriteSize + px(SPACING.sm + SPACING.xs + 2); // gap = px(14)
    const rowGap = px(SPACING.md + 2); // = px(18)
    const rightX = px(PANEL_W) - padX;
    for (let i = 0; i < this.statLabels.length; i++) {
      const label = this.statLabels[i];
      const cur = this.statCur[i];
      if (!label || !cur) continue;
      const rowY = statsStartY + i * rowGap;
      label.setPosition(padX, rowY);
      cur.setPosition(rightX - cur.width, rowY);
    }
    const statsEndY = statsStartY + this.statLabels.length * rowGap;

    // 升级预览 box（独立框）：未满级时显示。结构：标题 + N 行（label + cur → next）
    let footerY: number;
    if (this.upBoxVisible) {
      const boxPadX = px(SPACING.sm + 2); // = px(10)
      const boxPadY = px(SPACING.sm);
      const boxRowGap = px(SPACING.md - 1); // = px(15)
      const titleH = this.upBoxTitle.height;
      const rowsH = this.upBoxVisibleRows * boxRowGap;
      const boxX = padX;
      const boxY = statsEndY + px(SPACING.sm);
      // box 高度：标题 + 间距 + N 行；至少 titleH + boxPadY*2
      const innerH = titleH + (this.upBoxVisibleRows > 0 ? px(SPACING.xs) + rowsH : 0);
      const boxH = boxPadY * 2 + innerH;
      const boxW = px(PANEL_W) - padX * 2;

      this.upBoxBg.clear();
      this.upBoxBg
        .fillStyle(this.currentColor, 0.06)
        .fillRect(boxX, boxY, boxW, boxH)
        .lineStyle(px(1), this.currentColor, 0.4)
        .strokeRect(boxX, boxY, boxW, boxH);
      this.upBoxTitle.setPosition(boxX + boxPadX, boxY + boxPadY);

      const rowStartY = boxY + boxPadY + titleH + px(SPACING.xs);
      const rowRightX = boxX + boxW - boxPadX;
      for (let i = 0; i < this.upBoxVisibleRows; i++) {
        const lbl = this.upRowLabels[i];
        const cur = this.upRowCur[i];
        const arr = this.upRowArrow[i];
        const nxt = this.upRowNext[i];
        if (!lbl || !cur || !arr || !nxt) continue;
        const rowY = rowStartY + i * boxRowGap;
        lbl.setPosition(boxX + boxPadX, rowY);
        nxt.setPosition(rowRightX - nxt.width, rowY);
        arr.setPosition(nxt.x - px(SPACING.xs) - arr.width, rowY);
        cur.setPosition(arr.x - px(SPACING.xs) - cur.width, rowY);
      }
      footerY = boxY + boxH + px(SPACING.sm);
    } else {
      this.upBoxBg.clear();
      footerY = statsEndY + px(SPACING.xs + 2); // = px(6)
    }
    this.footerText.setPosition(padX, footerY);

    // 优先级按钮行（仅 single 塔显示）：在 footer 上方一排 4 个，紧凑等宽
    let footerYWithPriority = footerY;
    if (this.priorityRowVisible) {
      const priY = footerY;
      // CSS 单位计算：PANEL_W=240, padX=14 CSS, gap=4 CSS → 每按钮 (240-28-12)/4 = 50 CSS
      const cssGap = 4;
      const cssBtnW = (PANEL_W - 14 * 2 - cssGap * 3) / 4;
      for (let i = 0; i < this.priorityBtns.length; i++) {
        const btn = this.priorityBtns[i];
        if (!btn) continue;
        btn.setSize(cssBtnW, 22);
        btn.container.setPosition(padX + i * (px(cssBtnW) + px(cssGap)), priY);
      }
      footerYWithPriority = priY + px(SPACING.md + SPACING.xs + 2) + px(SPACING.sm); // priBtnH = px(22)
      this.footerText.setPosition(padX, footerYWithPriority);
    }

    // 按钮：升级在左、拆除紧邻其右；升级 setLabel 后 width 会变（按文本自动重算），
    // 这里读 widthPx 实时定位避免和升级按钮重叠
    const btnY = footerYWithPriority + this.footerText.height + px(SPACING.sm + 2); // gap = px(10)
    this.upgradeBtn.container.setPosition(padX, btnY);
    this.sellBtn.container.setPosition(padX + this.upgradeBtn.widthPx + px(SPACING.sm), btnY);

    // bg 高度自适应；按钮高 px(28) = lg + xs
    const panelH = btnY + px(SPACING.lg + SPACING.xs) + padY;
    this.bg.clear();
    this.bg
      .fillStyle(HEX.bg, 0.96)
      .fillRect(0, 0, px(PANEL_W), panelH)
      .lineStyle(px(1), this.currentColor, 0.55)
      .strokeRect(0, 0, px(PANEL_W), panelH);

    // 容器右上角定位
    if (this.viewportW > 0) {
      // 右内嵌 = px(8) = sm；顶 y = px(56) = xl + lg
      this.container.setPosition(
        this.viewportW - px(PANEL_W) - px(SPACING.sm),
        px(SPACING.xl + SPACING.lg),
      );
    }
  }

  destroy(): void {
    this.iconEntity?.destroy();
    this.container.destroy(true);
  }
}
