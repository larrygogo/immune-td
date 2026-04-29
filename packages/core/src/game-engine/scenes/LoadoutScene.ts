import { type GameObjects, Geom, Scene } from 'phaser';
import { track } from '@/analytics';
import { sfx } from '@audio/sfx';
import { useMetaStore, useUiStore } from '@ui/store';
import { getLevel } from '../game/data/levels';
import type { TowerType } from '../game/entities';
import { TOWER_REGISTRY } from '../game/registry/tower-registry';
import { SPACING } from '../layout/spacing';
import { SAFE_TOP } from '../safe-area';
import { SceneBackground } from '../scene-bg';
import { fadeInOnEnter, transitionToScene } from '../scene-fx';
import { onSceneResize } from '../scene-resize';
import { COLOR, FONT, HEX, px } from '../style';
import { EntityIcon } from '../ui/atoms/entity-icon';
import { PhaserButton } from '../ui/phaser-button';

interface CardWidget {
  redraw: () => void;
}

/**
 * M7 LoadoutScene：进 GameScene 前选 N 种塔（关卡 carryLimit 限制）。
 * 流程：LevelBriefingScene → LoadoutScene → GameScene
 *
 * - init() 拿 levelId
 * - create() 计算 selected（用上次保存的 loadout 兜底，否则取前 N 个）
 * - layout() 画卡片网格
 * - 点击切换勾选；选满才能"开战"
 * - 开战 → setLoadout 写入 metaStore + transitionToScene('GameScene')
 */
export class LoadoutScene extends Scene {
  private levelId = 1;
  private carryLimit = 0;
  private unlocked: TowerType[] = [];
  private selected = new Set<TowerType>();

  private bg: SceneBackground | null = null;
  private cardWidgets = new Map<TowerType, CardWidget>();
  private counterText: GameObjects.Text | null = null;
  private startBtn: PhaserButton | null = null;

  constructor() {
    super('LoadoutScene');
  }

  init(data: { levelId?: number }): void {
    // 优先从 data 拿，其次从 uiStore.currentLevelId 兜底（防其他地方调 scene.start 没传 data）
    this.levelId = data?.levelId ?? useUiStore.getState().currentLevelId ?? 1;
  }

  create(): void {
    const level = getLevel(this.levelId);
    this.carryLimit = level.carryLimit ?? 0;
    this.unlocked = [...useMetaStore.getState().unlockedTowers];

    // 默认选择：上次保存的 loadout 如长度匹配则用；否则取前 N 个
    const saved = useMetaStore.getState().loadout.filter((t) => this.unlocked.includes(t));
    const initial =
      saved.length === this.carryLimit ? saved : this.unlocked.slice(0, this.carryLimit);
    this.selected = new Set(initial);

    fadeInOnEnter(this);
    this.layout(this.scale.width, this.scale.height);
    onSceneResize(this, (w, h) => this.layout(w, h));
  }

  override update(_t: number, dt: number): void {
    if (this.bg) this.bg.tick(dt, this.scale.width, this.scale.height);
  }

  private layout(W: number, H: number): void {
    // 销毁所有上次的对象（resize 时重建）
    this.children.removeAll(true);
    this.cardWidgets.clear();
    this.counterText = null;
    this.startBtn = null;

    this.bg = new SceneBackground(this);
    this.bg.setViewport(W, H);

    const level = getLevel(this.levelId);

    // 顶部标题（wx 端 SAFE_TOP 兜住胶囊+刘海/灵动岛；H5 端 SAFE_TOP=0）
    const titleText = this.add
      .text(W / 2, SAFE_TOP + px(SPACING.xl + SPACING.sm), '选择阵容', {
        fontFamily: FONT,
        fontSize: `${px(20)}px`,
        color: COLOR.primary,
      })
      .setLetterSpacing(px(20 * 0.2))
      .setOrigin(0.5);
    titleText.setShadow(0, 0, COLOR.primary, px(8), true, true);

    this.add
      .text(
        W / 2,
        SAFE_TOP + px(SPACING.xxl + SPACING.md + SPACING.xs + 2), // = px(70)
        `关卡 · ${String(this.levelId).padStart(2, '0')} · ${level.title}`,
        {
          fontFamily: FONT,
          fontSize: `${px(10)}px`,
          color: COLOR.dim,
        },
      )
      .setLetterSpacing(px(10 * 0.3))
      .setOrigin(0.5);

    // 卡片网格（居中）
    const cardW = px(220); /* 非 SPACING：卡片固定宽 220 视觉调校值 */
    const cardH = px(SPACING.xxl + SPACING.xxl + SPACING.md - 2); // = px(110)
    const gap = px(SPACING.md);
    const horizontalAvailable = W - px(SPACING.xl); // 左右各留 md，相加 = px(32)
    const cols = Math.max(
      1,
      Math.min(this.unlocked.length, Math.floor((horizontalAvailable + gap) / (cardW + gap))),
    );
    const rows = Math.max(1, Math.ceil(this.unlocked.length / cols));
    const gridW = cols * cardW + (cols - 1) * gap;
    const gridH = rows * cardH + (rows - 1) * gap;
    const startX = (W - gridW) / 2;
    const startY = SAFE_TOP + px(SPACING.xxl + SPACING.xxl + SPACING.md - 2); // = px(110)

    for (let i = 0; i < this.unlocked.length; i++) {
      const type = this.unlocked[i];
      if (!type) continue;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardW + gap);
      const y = startY + row * (cardH + gap);
      const widget = this.makeCard(type, x, y, cardW, cardH);
      this.cardWidgets.set(type, widget);
    }

    // 底部计数器
    const bottomY = startY + gridH + px(SPACING.lg + SPACING.xs); // = px(28)
    this.counterText = this.add
      .text(W / 2, bottomY, '', {
        fontFamily: FONT,
        fontSize: `${px(13)}px`,
        color: COLOR.primary,
      })
      .setOrigin(0.5);

    // 底部按钮：左返回 / 右开战，居中
    const btnW = px(180); /* 非 SPACING：按钮固定宽 180 视觉调校值 */
    const btnGap = px(SPACING.md);
    const btnY = bottomY + px(SPACING.lg + SPACING.xs); // = px(28)
    const totalBtnW = btnW * 2 + btnGap;
    const btnStartX = (W - totalBtnW) / 2;

    new PhaserButton(this, btnStartX, btnY, {
      label: '返回',
      width: 180,
      height: 38,
      fontSize: 11,
      letterSpacingEm: 0.25,
      origin: 'topLeft',
      onTap: () => transitionToScene(this, 'LevelBriefingScene'),
    });

    this.startBtn = new PhaserButton(this, btnStartX + btnW + btnGap, btnY, {
      label: '开战',
      width: 180,
      height: 38,
      fontSize: 11,
      letterSpacingEm: 0.25,
      origin: 'topLeft',
      onTap: () => {
        const before = useMetaStore.getState().loadout;
        const after = [...this.selected];
        const changed = before.length !== after.length || before.some((t, i) => t !== after[i]);
        useMetaStore.getState().setLoadout(after);
        if (changed) {
          track('loadout_change', {
            level_id: this.levelId,
            loadout_before: [...before],
            loadout_after: after,
          });
        }
        transitionToScene(this, 'GameScene');
      },
    });

    this.refreshAll();
  }

  private makeCard(type: TowerType, x: number, y: number, w: number, h: number): CardWidget {
    const entry = TOWER_REGISTRY[type];
    const colorStr = `#${entry.meta.color.toString(16).padStart(6, '0')}`;
    const bg = this.add.graphics();

    const padX = px(SPACING.sm + SPACING.xs + 2); // = px(14)

    // 左侧 sprite + fallback shape 统一走 EntityIcon atom（自动按 type → shape 适配）
    const iconSize = px(SPACING.xl + SPACING.lg); // = px(56)
    const iconX = x + padX + iconSize / 2;
    const iconY = y + h / 2;
    const icon = new EntityIcon(this, {
      kind: 'tower',
      type,
      size: iconSize,
      x: iconX,
      y: iconY,
    });

    // 右侧文本
    const textX = x + padX + iconSize + px(SPACING.sm + SPACING.xs); // = px(12)
    // y 偏移 = px(18) = md + 2，让 name 在卡顶上方
    const name = this.add
      .text(textX, y + px(SPACING.md + 2), entry.meta.displayName, {
        fontFamily: FONT,
        fontSize: `${px(13)}px`,
        color: colorStr,
      })
      .setLetterSpacing(px(13 * 0.15))
      .setOrigin(0, 0);
    name.setShadow(0, 0, colorStr, px(6), true, true);

    const tagline =
      entry.role === 'helper'
        ? '辅助 · 抗原呈递'
        : entry.def.targetingMode === 'aoe'
          ? '范围攻击'
          : '单体攻击';
    const tag = this.add
      // y = px(40) = xl + sm，name 之下
      .text(textX, y + px(SPACING.xl + SPACING.sm), tagline, {
        fontFamily: FONT,
        fontSize: `${px(9)}px`,
        color: COLOR.dim,
      })
      .setLetterSpacing(px(9 * 0.2))
      .setOrigin(0, 0);

    const cost = this.add
      // y = px(60) = xl + lg + xs，tag 之下
      .text(textX, y + px(SPACING.xl + SPACING.lg + SPACING.xs), `成本 ${entry.def.cost} ATP`, {
        fontFamily: FONT,
        fontSize: `${px(10)}px`,
        color: COLOR.textBright,
      })
      .setOrigin(0, 0);

    // 勾选指示（右上角）
    const checkX = x + w - px(SPACING.sm + SPACING.xs + 2); // = px(14)
    const checkY = y + px(SPACING.sm + 2); // = px(10)
    const check = this.add
      .text(checkX, checkY, '', {
        fontFamily: FONT,
        fontSize: `${px(18)}px`,
        color: colorStr,
      })
      .setOrigin(1, 0);

    // 整卡命中：bg graphics 自己接收 input。hitArea 用 graphics 局部坐标 (= 全局，
    // 因 graphics 无 transform)，跟 fillRect(x,y,w,h) 区域对齐。
    bg.setInteractive(new Geom.Rectangle(x, y, w, h), Geom.Rectangle.Contains);
    if (bg.input) bg.input.cursor = 'pointer';
    bg.on('pointerdown', () => {
      sfx.uiClick();
      if (this.selected.has(type)) {
        this.selected.delete(type);
      } else if (this.selected.size < this.carryLimit) {
        this.selected.add(type);
      }
      this.refreshAll();
    });

    const redraw = () => {
      const isSelected = this.selected.has(type);
      const canAddMore = this.selected.size < this.carryLimit;
      const dimmed = !isSelected && !canAddMore;

      bg.clear();
      // 强对比：选中 = 实色背景 + 粗边；未选 = 几乎透明 + 细边
      const fillAlpha = isSelected ? 0.35 : dimmed ? 0.02 : 0.06;
      const strokeAlpha = isSelected ? 1 : dimmed ? 0.2 : 0.4;
      const lineW = isSelected ? px(3) : px(1);
      bg.fillStyle(entry.meta.color, fillAlpha)
        .fillRect(x, y, w, h)
        .lineStyle(lineW, entry.meta.color, strokeAlpha)
        .strokeRect(x, y, w, h);
      // 选中加内圈高光让差异更明显
      if (isSelected) {
        // 内圈高光：内嵌 px(4) 留白
        bg.lineStyle(px(1), HEX.white, 0.5).strokeRect(
          x + px(SPACING.xs),
          y + px(SPACING.xs),
          w - px(SPACING.sm),
          h - px(SPACING.sm),
        );
      }

      check.setText(isSelected ? '✓ 已选' : '');

      const a = dimmed ? 0.35 : 1;
      icon.setAlpha(a);
      name.setAlpha(a);
      tag.setAlpha(a);
      cost.setAlpha(a);
    };
    redraw();

    return { redraw };
  }

  private refreshAll(): void {
    // biome-ignore lint/complexity/noForEach: wx babel _createForOfIteratorHelper 对 Map iterator 报 non-iterable
    this.cardWidgets.forEach((w) => w.redraw());
    if (this.counterText) {
      this.counterText.setText(`已选 ${this.selected.size} / ${this.carryLimit}`);
    }
    if (this.startBtn) {
      this.startBtn.setEnabled(this.selected.size === this.carryLimit);
    }
  }
}
