import { type GameObjects, type Geom, Scene } from 'phaser';
import { sfx } from '@audio/sfx';
import { useMetaStore, useUiStore } from '@ui/store';
import {
  type GameMechanic,
  type LevelConfig,
  getLevel,
  getLevelByMode,
  isLevelImplemented,
} from '../game/data/levels';
import type { PathogenType, TowerType } from '../game/entities';
import { type MechanicMeta, getMechanicMeta } from '../game/registry/mechanic-registry';
import { PATHOGEN_REGISTRY } from '../game/registry/pathogen-registry';
import { setRectInteractive } from '../interactive';
import { SPACING } from '../layout/spacing';
import { getPathogenBattleColor } from '../render/entity-colors';
import { SAFE_BOTTOM, SAFE_TOP } from '../safe-area';
import { SceneBackground } from '../scene-bg';
import { fadeInOnEnter, transitionToScene } from '../scene-fx';
import { onSceneResize } from '../scene-resize';
import { COLOR, FONT, HEX, px } from '../style';
import { EntityIcon } from '../ui/atoms/entity-icon';
import { PhaserButton } from '../ui/phaser-button';

// Briefing 卡片专属的短 tag（与 registry.meta 解耦：registry 面向图鉴，tag 面向关卡介绍）
const PATHOGEN_TAG: Partial<Record<PathogenType, string>> = {
  saureus: '高耐受',
  aspergillus: '飞行',
};

interface PathogenCard {
  name: string;
  color: number;
  tag?: string;
}
function pathogenCard(type: PathogenType): PathogenCard {
  const meta = PATHOGEN_REGISTRY[type].meta;
  const tag = PATHOGEN_TAG[type];
  const card: PathogenCard = { name: meta.displayName, color: getPathogenBattleColor(type) };
  if (tag !== undefined) card.tag = tag;
  return card;
}

const CARD_W = 440;

interface BtnDef {
  container: GameObjects.Container;
  bg: GameObjects.Graphics;
  label: GameObjects.Text;
  hitRect: Geom.Rectangle;
  w: number;
  h: number;
}

/**
 * 关卡介绍 Scene：LevelSelectScene → LevelBriefingScene → GameScene 流程的中间场景。
 * 内容：STAGE 编号/副标题/标题，HP/ATP/WAVES 三列，敌人列表，可用塔列表，
 * RESTRICTIONS（如有），返回 / 开始 按钮。
 *
 * 不再使用半透明 dim 遮罩（独立 scene 用纯背景）。
 *
 * Task 3 会在此基础上追加"NEW · 本关新增"机制卡片，目前预留 displayedMechanics 字段。
 */
export class LevelBriefingScene extends Scene {
  private bg!: SceneBackground;
  private card!: GameObjects.Graphics;
  private inner!: GameObjects.Container;
  private backBtn!: PhaserButton;
  private startBtn!: PhaserButton;
  private levelId = 1;

  /** Task 3 用：本次 briefing 新展示了哪些机制，点击"开始/跳过"时写入 metaStore.seenMechanics */
  protected displayedMechanics: GameMechanic[] = [];
  /** "跳过介绍"按钮，仅当本关有新机制时创建 */
  private skipBtn: BtnDef | null = null;

  constructor() {
    super('LevelBriefingScene');
  }

  init(data: { levelId?: number }): void {
    const fromData = typeof data?.levelId === 'number' ? data.levelId : undefined;
    const fromStore = useUiStore.getState().currentLevelId;
    const candidate = fromData ?? fromStore;
    this.levelId = isLevelImplemented(candidate) ? candidate : 1;
    // 同步回 ui store，让后续 GameScene 读到正确 levelId
    useUiStore.getState().setCurrentLevelId(this.levelId);
    this.displayedMechanics = [];
    this.skipBtn = null;
  }

  create(): void {
    this.bg = new SceneBackground(this);
    fadeInOnEnter(this);

    this.card = this.add.graphics();
    this.inner = this.add.container(0, 0);
    this.backBtn = new PhaserButton(this, 0, 0, {
      label: '返回',
      width: 180,
      height: 38,
      fontSize: 11,
      letterSpacingEm: 0.25,
      origin: 'topLeft',
      filled: false,
      onTap: () => this.handleBack(),
    });
    this.startBtn = new PhaserButton(this, 0, 0, {
      label: '开始',
      width: 180,
      height: 38,
      fontSize: 11,
      letterSpacingEm: 0.25,
      origin: 'topLeft',
      filled: false,
      onTap: () => this.handleStart(),
    });

    this.buildContent(this.levelId);
    const { width, height } = this.scale;
    this.layout(width, height);
    onSceneResize(this, (w, h) => this.layout(w, h));
  }

  override update(_t: number, dt: number): void {
    if (this.bg) this.bg.tick(dt, this.scale.width, this.scale.height);
  }

  private handleStart(): void {
    if (this.displayedMechanics.length > 0) {
      useMetaStore.getState().markMechanicsSeen(this.displayedMechanics);
    }
    const level = getLevel(this.levelId); // carryLimit 不随精英变化，用 base 即可
    const limit = level.carryLimit;
    const unlocked = useMetaStore.getState().unlockedTowers;
    // carryLimit 存在且 < 解锁数才有意义 → LoadoutScene
    const shouldChoose = limit !== undefined && limit < unlocked.length;
    transitionToScene(this, shouldChoose ? 'LoadoutScene' : 'GameScene', 220, {
      levelId: this.levelId,
    });
  }

  private handleBack(): void {
    transitionToScene(this, 'LevelSelectScene');
  }

  private buildContent(levelId: number): void {
    this.inner.removeAll(true);
    const mode = useUiStore.getState().currentMode;
    const level: LevelConfig = getLevelByMode(levelId, mode);
    const padX = px(SPACING.lg + SPACING.xs); // = px(28)
    const sw = this.scale.width;
    const cardW = Math.min(px(CARD_W), sw * 0.94);
    const innerW = cardW - padX * 2;
    let y = px(SPACING.lg + SPACING.xs); // = px(28)

    // 顶部 STAGE 标
    const stageTag = this.add
      .text(padX, y, `关卡 · ${String(levelId).padStart(2, '0')} / ${level.subtitle}`, {
        fontFamily: FONT,
        fontSize: `${px(10)}px`,
        color: COLOR.dim,
      })
      .setLetterSpacing(px(10 * 0.3))
      .setOrigin(0, 0);
    this.inner.add(stageTag);
    y += stageTag.height + px(SPACING.xs + 2); // = px(6)

    // 大标题（fontStyle '900' 命中 MiSans Heavy 字重，章节标题对齐 cyber 美学）
    // setStroke 1px 深色描边让 glyph 边缘锐利；letterSpacing 0.2→0.28 em 增加呼吸感
    const titleText = this.add
      .text(padX, y, level.title, {
        fontFamily: FONT,
        fontSize: `${px(20)}px`,
        fontStyle: '900',
        color: COLOR.primary,
      })
      .setLetterSpacing(px(20 * 0.28))
      .setOrigin(0, 0);
    titleText.setStroke(COLOR.bgDeep, px(1));
    this.inner.add(titleText);
    y += titleText.height + px(SPACING.sm);

    // 精英模式 buff 卡：照搬 mechanic-card 模板让风格统一（图标 + 标题 + 描述 + 副注）
    // 视觉：金色 ⚠ icon + 金色 cyber pill 标签 + 警示线 + L 形角装饰
    if (mode === 'elite') {
      const ec = this.addEliteBuffCard(padX, y, innerW);
      y += ec + px(SPACING.sm + 2); // = px(10)
    } else {
      y += px(SPACING.sm + SPACING.xs); // = px(12)
    }

    // 3 列数据条（顶虚线 + 底虚线）
    const sepTop = this.add.graphics();
    sepTop.lineStyle(px(1), HEX.primary, 0.3).lineBetween(padX, y, padX + innerW, y);
    this.inner.add(sepTop);
    y += px(SPACING.sm + 2); // = px(10)
    const colW = innerW / 3;
    const stats: [string, number][] = [
      ['HP', level.initialHp],
      ['ATP', level.initialAtp],
      ['波次', level.waves.length],
    ];
    let maxStatH = 0;
    for (let i = 0; i < stats.length; i++) {
      const stat = stats[i];
      if (!stat) continue;
      const [labelStr, val] = stat;
      const colX = padX + i * colW;
      const lab = this.add
        .text(colX, y, labelStr, {
          fontFamily: FONT,
          fontSize: `${px(9)}px`,
          color: COLOR.dim,
        })
        .setLetterSpacing(px(9 * 0.15))
        .setOrigin(0, 0);
      const valText = this.add
        // 行内 label → value 间距 px(2)，紧密堆叠保留显式值
        .text(colX, y + lab.height + px(2), String(val), {
          fontFamily: FONT,
          fontSize: `${px(14)}px`,
          color: COLOR.primary,
        })
        .setLetterSpacing(px(14 * 0.15))
        .setOrigin(0, 0);
      this.inner.add([lab, valText]);
      maxStatH = Math.max(maxStatH, lab.height + px(2) + valText.height);
    }
    y += maxStatH + px(SPACING.sm + 2); // = px(10)
    const sepBot = this.add.graphics();
    sepBot.lineStyle(px(1), HEX.primary, 0.3).lineBetween(padX, y, padX + innerW, y);
    this.inner.add(sepBot);
    y += px(SPACING.md);

    // THREATS 列表
    const threats = Array.from(
      new Set(level.waves.flatMap((w) => w.composition.map((c) => c.type))),
    ) as PathogenType[];
    const threatsLabel = this.add
      .text(padX, y, '病原', {
        fontFamily: FONT,
        fontSize: `${px(9)}px`,
        color: COLOR.dim,
      })
      .setLetterSpacing(px(9 * 0.25))
      .setOrigin(0, 0);
    this.inner.add(threatsLabel);
    y += threatsLabel.height + px(SPACING.sm);
    for (const t of threats) {
      const card = pathogenCard(t);
      const rowH = this.addEntityRow(padX, y, card.color, card.name, 'pathogen', t, card.tag);
      y += rowH + px(SPACING.xs);
    }
    y += px(SPACING.sm + SPACING.xs); // = px(12)

    // 「防御」section 已移除：本关可用塔由玩家在 LoadoutScene 自由搭配，
    // briefing 列出 level.unlockTowers 既不准确（≠ 玩家携带集）也无价值（重复信息）。

    // RESTRICTIONS：仅在本关启用 M2 禁建区时展示，告知玩家有 N 格不可放塔
    const blockedCount = level.blockedCells?.length ?? 0;
    if (blockedCount > 0) {
      const restrictLabel = this.add
        .text(padX, y, '限制', {
          fontFamily: FONT,
          fontSize: `${px(9)}px`,
          color: COLOR.dim,
        })
        .setLetterSpacing(px(9 * 0.25))
        .setOrigin(0, 0);
      this.inner.add(restrictLabel);
      y += restrictLabel.height + px(SPACING.sm);
      const dangerStr = `#${HEX.danger.toString(16).padStart(6, '0')}`;
      const msg = this.add
        .text(padX, y, `禁建格 · ${blockedCount}  （红色斜线格无法驻扎细胞）`, {
          fontFamily: FONT,
          fontSize: `${px(11)}px`,
          color: dangerStr,
        })
        .setLetterSpacing(px(11 * 0.15))
        .setOrigin(0, 0);
      this.inner.add(msg);
      y += msg.height + px(SPACING.xs);
    }
    y += px(SPACING.md);

    // NEW · 本关新增机制卡片（仅展示玩家未见过的）
    const enabled = level.enabledMechanics ?? [];
    const seen = useMetaStore.getState().seenMechanics;
    const newMechanics = enabled.filter((m) => !seen.includes(m));
    this.displayedMechanics = [...newMechanics];
    // 销毁上一帧（如有）的 skipBtn，buildContent 可能在 resize 时被调用
    if (this.skipBtn) {
      this.skipBtn.container.destroy();
      this.skipBtn = null;
    }
    if (newMechanics.length > 0) {
      const newLabel = this.add
        .text(padX, y, '本关新增', {
          fontFamily: FONT,
          fontSize: `${px(11)}px`,
          color: COLOR.highlightSoft,
        })
        .setLetterSpacing(px(11 * 0.3))
        .setOrigin(0, 0);
      this.inner.add(newLabel);
      y += newLabel.height + px(SPACING.sm + SPACING.xs); // = px(12)
      for (const id of newMechanics) {
        const meta = getMechanicMeta(id);
        const cardH = this.addMechanicCard(padX, y, innerW, meta);
        y += cardH + px(SPACING.sm);
      }
      y += px(SPACING.sm + SPACING.xs); // = px(12)
      this.skipBtn = this.makeSkipBtn(() => this.handleStart());
    }

    // 内容总高（用于 layout 时算 cardH）
    (this.inner as GameObjects.Container & { _bottom?: number })._bottom = y;
  }

  /**
   * 精英模式 buff 卡：与 mechanic-card 同尺寸/同节奏，但用金色警示语意。
   * 左 icon 是金色菱形 + ★（精英标识），右侧标题/描述/副注。
   * 顶部加 cyber pill「ELITE / 精英」+ L 形角装饰，立刻拉开警示感。
   * 返回卡片高度。
   */
  private addEliteBuffCard(x: number, y: number, w: number): number {
    const padInner = px(SPACING.sm + SPACING.xs); // = px(12)
    const iconBoxW = px(SPACING.xl + SPACING.sm); // = px(40)
    const textX = x + iconBoxW + padInner;
    const textW = w - iconBoxW - padInner * 2;

    // pill 标签：标题上方一行 ELITE 指示
    const pill = this.add
      // pill 微提 px(2)：贴近卡片顶 padInner，不属于 SPACING 阶梯
      .text(textX, y + padInner - px(2), '精英变异 · ELITE', {
        fontFamily: FONT,
        fontSize: `${px(9)}px`,
        color: COLOR.rewardGold,
        fontStyle: 'bold',
      })
      .setLetterSpacing(px(9 * 0.3))
      .setOrigin(0, 0);

    const title = this.add
      // pill → title 紧密堆叠 px(3)，非 SPACING 阶梯（紧贴 pill 强化警示节奏）
      .text(textX, pill.y + pill.height + px(3), '敌人全员强化护甲', {
        fontFamily: FONT,
        fontSize: `${px(13)}px`,
        color: COLOR.white,
      })
      .setLetterSpacing(px(13 * 0.15))
      .setOrigin(0, 0);

    const desc = this.add
      .text(textX, title.y + title.height + px(SPACING.xs), 'HP ×2、核心伤害 ×2', {
        fontFamily: FONT,
        fontSize: `${px(10)}px`,
        color: COLOR.dim,
        wordWrap: { width: textW, useAdvancedWrap: true },
      })
      .setOrigin(0, 0);

    const note = this.add
      .text(textX, desc.y + desc.height + px(SPACING.xs), '建议：集中升级核心塔位，避免分散输出', {
        fontFamily: FONT,
        fontSize: `${px(9)}px`,
        color: COLOR.dim,
        fontStyle: 'italic',
        wordWrap: { width: textW, useAdvancedWrap: true },
      })
      .setOrigin(0, 0);

    const contentBottom = note.y + note.height + padInner;
    const h = Math.max(px(SPACING.xxl + SPACING.lg + SPACING.xs), contentBottom - y); // min 高 = px(76)

    // 背景：深底 + 金边（与 mechanic-card 一致的层级感，但配色金色提示警示）
    const bg = this.add.graphics();
    bg.fillStyle(HEX.rewardGold, 0.06).fillRect(x, y, w, h);
    bg.lineStyle(px(1), HEX.rewardGold, 0.55).strokeRect(x, y, w, h);
    // L 形角装饰（4 角）：cyber 风格，与 LevelSelect 精英按钮呼应
    const corner = px(SPACING.xs + 3); // = px(7)：L 角长度
    bg.lineStyle(px(1.5), HEX.rewardGold, 1)
      .lineBetween(x, y, x + corner, y)
      .lineBetween(x, y, x, y + corner)
      .lineBetween(x + w - corner, y, x + w, y)
      .lineBetween(x + w, y, x + w, y + corner)
      .lineBetween(x, y + h - corner, x, y + h)
      .lineBetween(x, y + h, x + corner, y + h)
      .lineBetween(x + w - corner, y + h, x + w, y + h)
      .lineBetween(x + w, y + h - corner, x + w, y + h);

    // icon：菱形金块 + 中央 ★，跟 mechanic-card 圆形 icon 区分（精英是事件性强化，不是机制）
    const icon = this.add.graphics();
    const cx = x + iconBoxW / 2;
    const cy = y + h / 2;
    const r = px(SPACING.md - 1); // = px(15)：icon 半径
    icon.fillStyle(HEX.rewardGold, 0.9);
    icon.beginPath();
    icon.moveTo(cx, cy - r);
    icon.lineTo(cx + r, cy);
    icon.lineTo(cx, cy + r);
    icon.lineTo(cx - r, cy);
    icon.closePath();
    icon.fillPath();
    icon.lineStyle(px(1), HEX.rewardGold, 1);
    icon.strokePath();
    const star = this.add
      .text(cx, cy, '★', {
        fontFamily: FONT,
        fontSize: `${px(14)}px`,
        color: COLOR.bg,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.inner.add([bg, icon, star, pill, title, desc, note]);
    return h;
  }

  private addMechanicCard(x: number, y: number, w: number, meta: MechanicMeta): number {
    const padInner = px(SPACING.sm + SPACING.xs); // = px(12)
    const iconBoxW = px(SPACING.xl + SPACING.sm); // = px(40)
    const textX = x + iconBoxW + padInner;
    const textW = w - iconBoxW - padInner * 2;

    const title = this.add
      .text(textX, y + padInner, meta.title, {
        fontFamily: FONT,
        fontSize: `${px(13)}px`,
        color: COLOR.white,
      })
      .setLetterSpacing(px(13 * 0.15))
      .setOrigin(0, 0);

    const desc = this.add
      .text(textX, title.y + title.height + px(SPACING.xs), meta.description, {
        fontFamily: FONT,
        fontSize: `${px(10)}px`,
        color: COLOR.dim,
        wordWrap: { width: textW, useAdvancedWrap: true },
      })
      .setOrigin(0, 0);

    const note = this.add
      .text(textX, desc.y + desc.height + px(SPACING.xs), meta.scientificNote, {
        fontFamily: FONT,
        fontSize: `${px(9)}px`,
        color: COLOR.dim,
        fontStyle: 'italic',
        wordWrap: { width: textW, useAdvancedWrap: true },
      })
      .setOrigin(0, 0);

    const contentBottom = note.y + note.height + padInner;
    const h = Math.max(px(SPACING.xxl + SPACING.md + SPACING.xs + 2), contentBottom - y); // min 高 = px(70)

    const bg = this.add.graphics();
    bg.fillStyle(HEX.highlightSoft, 0.08)
      .fillRect(x, y, w, h)
      .lineStyle(px(1), HEX.highlightSoft, 0.5)
      .strokeRect(x, y, w, h);

    const icon = this.add.graphics();
    icon
      .fillStyle(meta.iconColor, 1)
      .fillCircle(x + iconBoxW / 2, y + h / 2, px(SPACING.sm + SPACING.xs + 2)); // r = px(14)

    // 顺序：bg → icon → 文本（让文本在最上）
    this.inner.add([bg, icon, title, desc, note]);
    return h;
  }

  private makeSkipBtn(onTap: () => void): BtnDef {
    const w = px(SPACING.xxl + SPACING.xl); // = px(80)
    const h = px(SPACING.md + SPACING.xs + 2); // = px(22)
    const bg = this.add.graphics();
    const label = this.add
      .text(0, 0, '跳过介绍', {
        fontFamily: FONT,
        fontSize: `${px(9)}px`,
        color: COLOR.highlightSoft,
      })
      .setLetterSpacing(px(9 * 0.2))
      .setOrigin(0.5);
    const container = this.add.container(0, 0, [bg, label]);
    container.setSize(w, h);
    const hitRect = setRectInteractive(container, w, h, {
      useHandCursor: true,
      bgAlign: 'topLeft',
    });
    container.on('pointerdown', () => {
      sfx.uiClick();
      onTap();
    });
    bg.lineStyle(px(1), HEX.highlightSoft, 0.4).strokeRect(0, 0, w, h);
    label.setPosition(w / 2, h / 2);
    return { container, bg, label, hitRect, w, h };
  }

  private addEntityRow(
    x: number,
    y: number,
    color: number,
    name: string,
    kind: 'tower' | 'pathogen',
    type: TowerType | PathogenType,
    tag?: string,
  ): number {
    const iconSize = px(SPACING.lg + SPACING.xs); // = px(28)
    // sprite + fallback shape 统一走 EntityIcon atom（按 type 自动适配 shape / color）
    const iconObj = new EntityIcon(this, {
      kind,
      type,
      size: iconSize,
      x: x + iconSize / 2,
      y: y + iconSize / 2,
    });
    const colorStr = `#${color.toString(16).padStart(6, '0')}`;
    const nameText = this.add
      .text(x + iconSize + px(SPACING.sm), y + iconSize / 2, name, {
        fontFamily: FONT,
        fontSize: `${px(12)}px`,
        color: colorStr,
      })
      .setLetterSpacing(px(12 * 0.15))
      .setOrigin(0, 0.5);
    this.inner.add([iconObj.container, nameText]);
    if (tag) {
      const tagX = nameText.x + nameText.width + px(SPACING.sm);
      const tagText = this.add
        // tag 内左 padding px(5)：紧凑 inline，非 SPACING 阶梯
        .text(tagX + px(5), y + iconSize / 2, tag, {
          fontFamily: FONT,
          fontSize: `${px(9)}px`,
          color: colorStr,
        })
        .setLetterSpacing(px(9 * 0.15))
        .setOrigin(0, 0.5);
      const tagBg = this.add.graphics();
      tagBg
        .lineStyle(px(1), color, 1)
        // tag 框上下 padding px(1)/px(2)：紧凑 inline，非 SPACING 阶梯
        .strokeRect(
          tagX,
          y + iconSize / 2 - tagText.height / 2 - px(1),
          tagText.width + px(SPACING.sm + 2),
          tagText.height + px(2),
        );
      this.inner.add([tagBg, tagText]);
    }
    return iconSize;
  }

  private layout(W: number, H: number): void {
    if (this.bg) this.bg.setViewport(W, H);

    const cardW = Math.min(px(CARD_W), W * 0.94);
    // fallback 内容高 px(380)：cardW 之外 layout 暂未量到内容时的占位估值
    const innerBottom =
      (this.inner as GameObjects.Container & { _bottom?: number })._bottom ?? px(380);
    const btnH = px(SPACING.xl + SPACING.xs + 2); // = px(38)
    // 卡内底部留白：内容 → button 间距 px(24)、button 下沉 px(22)
    const cardH = innerBottom + px(SPACING.lg) + btnH + px(SPACING.md + SPACING.xs + 2);
    const cardX = Math.round((W - cardW) / 2);
    // 在 [SAFE_TOP, H - SAFE_BOTTOM] 可见高度内居中卡片，避开 wx 端胶囊 + home indicator
    const visibleH = H - SAFE_TOP - SAFE_BOTTOM;
    const cardY = Math.round(SAFE_TOP + (visibleH - cardH) / 2);
    this.card.clear();
    this.card
      .fillStyle(HEX.bg, 0.98)
      .fillRect(cardX, cardY, cardW, cardH)
      .lineStyle(px(1), HEX.primary, 0.5)
      .strokeRect(cardX, cardY, cardW, cardH);

    this.inner.setPosition(cardX, cardY);

    // 按钮：返回（左）+ 开始（右），各占 1fr
    const padX = px(SPACING.lg + SPACING.xs); // = px(28)
    const gap = px(SPACING.sm);
    const btnW = (cardW - padX * 2 - gap) / 2;
    const btnBottomGap = px(SPACING.md + SPACING.xs + 2); // = px(22)
    this.backBtn.setSizeWorld(btnW, btnH);
    this.backBtn.container.setPosition(cardX + padX, cardY + cardH - btnH - btnBottomGap);
    this.startBtn.setSizeWorld(btnW, btnH);
    this.startBtn.container.setPosition(
      cardX + padX + btnW + gap,
      cardY + cardH - btnH - btnBottomGap,
    );

    if (this.skipBtn) {
      const sb = this.skipBtn;
      const skipPad = px(SPACING.sm + 2); // = px(10) skip 按钮距卡片右上角
      sb.container.setPosition(cardX + cardW - sb.w - skipPad, cardY + skipPad);
    }
  }
}
