import { type GameObjects, Scene } from 'phaser';
import { bgm } from '@audio/bgm';
import { sfx } from '@audio/sfx';
import {
  PATHOGEN_DEFS,
  type PathogenType,
  TOWER_DEFS,
  TOWER_LEVELS,
  type TowerType,
} from '../game/entities';
import { PATHOGEN_REGISTRY } from '../game/registry/pathogen-registry';
import { TOWER_REGISTRY } from '../game/registry/tower-registry';
import { setRectInteractive } from '../interactive';
import { SPACING } from '../layout/spacing';
import { getPathogenBattleColor, getTowerBattleColor } from '../render/entity-colors';
import { SAFE_BOTTOM, SAFE_TOP } from '../safe-area';
import { SceneBackground } from '../scene-bg';
import { fadeInOnEnter, transitionToScene } from '../scene-fx';
import { onSceneResize } from '../scene-resize';
import { COLOR, FONT, HEX, px } from '../style';
import { EntityIcon } from '../ui/atoms/entity-icon';
import { SceneHeader } from '../ui/scene-header';

/**
 * 在每个字符之间插入零宽空格 (\u200B)，让 Phaser advanced wordWrap 允许任意
 * 位置断行（中文段每字可断 + ASCII 单词也可被切如 "ATP" → "A|TP"）。
 * 零宽空格不可见，文本视觉不变；复制粘贴时含 \u200B 但通常显示无差。
 */
function addCharBreakpoints(s: string): string {
  return s.split('').join('\u200B');
}

interface EntryMeta {
  name: string;
  tagline: string;
  desc: string;
}

const TOWER_META: Record<TowerType, EntryMeta> = {
  macrophage: {
    name: '巨噬细胞',
    tagline: '范围 · 近战',
    desc: '吞噬型范围细胞。范围内所有病原体同时受伤，最擅长清理密集病原群；射程短，近战吞噬，无法打空中病原。',
  },
  neutrophil: {
    name: '中性粒细胞',
    tagline: '放射 · 全图',
    desc: '建造后持续自转，每次发射沿当前朝向均匀放射若干枚杀菌颗粒，全图范围无视距离。子弹单次命中即消失；建造与结算阶段停止发射，已发射的颗粒继续飞行至命中或出界。',
  },
  nkcell: {
    name: 'NK 细胞',
    tagline: '单体 · 远程狙击',
    desc: '中远射程、高单发伤害。擅长优先击杀高耐受或飞行病原，无目标时保留冷却蓄力一击必杀。',
  },
  dendritic: {
    name: '树突状细胞',
    tagline: '辅助 · 抗原呈递',
    desc: '哨兵细胞，自身不参与战斗。捕获并展示病原抗原，通过共刺激信号提升周围免疫细胞的伤害。增益在存活期间持续生效，无冷却；自身被啃死后立即消失。',
  },
  mitochondria: {
    name: '线粒体共生体',
    tagline: '经济 · ATP 工厂',
    desc: '细胞内能量工厂，自身不攻击不被增益。每波结算时为系统提供 ATP（Lv1/2/3 = 25/50/100），前期投资后期回本，搭配高产塔形成经济流打法。',
  },
};

const PATHOGEN_META: Record<PathogenType, EntryMeta> = {
  rhinovirus: {
    name: '鼻病毒',
    tagline: '常规 · 慢速',
    desc: '最基础的病原体，数量多但速度慢。范围细胞的经典目标。',
  },
  influenza: {
    name: '流感病毒',
    tagline: '快速 · 薄壁',
    desc: '速度是鼻病毒的两倍但低耐受。单体快攻细胞单发即毙。',
  },
  ecoli: {
    name: '大肠杆菌',
    tagline: '蜂群 · 数量',
    desc: '中速低血的细菌，以数量压制。后期波次会海量出现。',
  },
  saureus: {
    name: '金黄葡萄球菌',
    tagline: '高耐受 · 威胁',
    desc: '慢速但 HP 220，到达出口扣 2 HP。第一章与第二章母株核心威胁。',
  },
  aspergillus: {
    name: '曲霉孢子',
    tagline: '飞行 · 直线',
    desc: '无视地面迷宫，从入口直线飞向出口。只能被可打空的细胞（中性粒/NK）打到。',
  },
};

type Tab = 'towers' | 'pathogens';

const CARD_W = 260;
const CARD_GAP = 12;
const ICON_SIZE = 64;

interface CardSlot {
  container: GameObjects.Container;
  height: number;
  /** 重画 bg 到指定高度（用于让同行/同 tab 卡片视觉等高） */
  redrawBg: (h: number) => void;
}

export class EncyclopediaScene extends Scene {
  private bg!: SceneBackground;
  private tab: Tab = 'towers';
  private tabBtns: {
    id: Tab;
    container: GameObjects.Container;
    bg: GameObjects.Graphics;
    label: GameObjects.Text;
  }[] = [];
  private cardLayer!: GameObjects.Container;
  private mask!: Phaser.Display.Masks.GeometryMask;
  private maskShape!: GameObjects.Graphics;
  private scrollY = 0;
  private maxScrollY = 0;
  private contentTop = 0;
  private contentBottom = 0;

  constructor() {
    super('EncyclopediaScene');
  }

  create(): void {
    this.scrollY = 0;
    bgm.play('menu');
    this.bg = new SceneBackground(this);
    fadeInOnEnter(this);

    const { width, height } = this.scale;
    this.layout(width, height);

    onSceneResize(this, (w, h) => this.layout(w, h));

    // 滚轮
    this.input.on('wheel', (_p: unknown, _g: unknown, _dx: number, dy: number) => {
      this.setScroll(this.scrollY + dy);
    });

    // 拖拽
    let dragging = false;
    let startY = 0;
    let startScroll = 0;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.y < this.contentTop || p.y > this.contentBottom) return;
      dragging = true;
      startY = p.y;
      startScroll = this.scrollY;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!dragging) return;
      this.setScroll(startScroll - (p.y - startY));
    });
    this.input.on('pointerup', () => {
      dragging = false;
    });
  }

  override update(_t: number, dt: number): void {
    this.bg.tick(dt, this.scale.width, this.scale.height);
  }

  private setScroll(y: number): void {
    this.scrollY = Math.max(0, Math.min(this.maxScrollY, y));
    if (this.cardLayer) this.cardLayer.y = this.contentTop - this.scrollY;
  }

  private layout(W: number, H: number): void {
    this.bg.setViewport(W, H);
    this.children.removeAll(true);

    // 重新创建背景（被 removeAll 销毁）
    this.bg = new SceneBackground(this);
    this.bg.setViewport(W, H);

    // 顶栏：只要返回按钮，不要标题（tab 自身就是上下文）
    // wx 端 SAFE_TOP 兜住胶囊 + 状态栏；H5 端 SAFE_TOP=0
    const header = new SceneHeader(this, {
      backOnTap: () => transitionToScene(this, 'MainMenuScene'),
    });
    header.layout(W, SAFE_TOP);
    const topY = SAFE_TOP + px(SPACING.lg + SPACING.xs); // = px(28)

    // Tab 按钮：DEFENSES / THREATS
    const tabRowY = topY + px(SPACING.lg + SPACING.xs); // = px(28)
    const tabW = (W - px(SPACING.md) * 2 - px(SPACING.xs + 2)) / 2;
    const tabH = px(SPACING.xl);
    this.tabBtns = [
      { id: 'towers', label: '防御细胞', count: Object.keys(TOWER_META).length },
      { id: 'pathogens', label: '病原体', count: Object.keys(PATHOGEN_META).length },
    ].map((t) => {
      const bg = this.add.graphics();
      const labelText = this.add
        .text(0, 0, `${t.label} (${t.count})`, {
          fontFamily: FONT,
          fontSize: `${px(11)}px`,
          color: COLOR.primary,
        })
        .setLetterSpacing(px(11 * 0.15))
        .setOrigin(0.5);
      const container = this.add.container(0, 0, [bg, labelText]);
      container.setSize(tabW, tabH);
      setRectInteractive(container, tabW, tabH, { useHandCursor: true, bgAlign: 'topLeft' });
      container.on('pointerdown', () => {
        sfx.uiClick();
        this.tab = t.id as Tab;
        this.scrollY = 0;
        this.layoutTabsAndCards(W, H);
      });
      return { id: t.id as Tab, container, bg, label: labelText };
    });

    // 卡片层 + mask（底部留 SAFE_BOTTOM 给 home indicator）
    const contentTop = tabRowY + tabH + px(SPACING.sm + SPACING.xs + 2); // = px(14)
    this.contentTop = contentTop;
    this.contentBottom = H - SAFE_BOTTOM - px(SPACING.sm);
    this.cardLayer = this.add.container(0, contentTop);
    this.maskShape = this.add.graphics();
    this.maskShape
      .fillStyle(HEX.white, 1)
      .fillRect(0, contentTop, W, this.contentBottom - contentTop);
    this.maskShape.setVisible(false);
    this.mask = this.maskShape.createGeometryMask();
    this.cardLayer.setMask(this.mask);

    // 顶部遮挡矩形：盖在 cardLayer 之上、顶栏元素之下，
    // 物理遮住任何向上滚出 contentTop 的卡片像素（GeometryMask 在 Container 上偶尔失效的兜底）
    const topShield = this.add.graphics();
    topShield.fillStyle(HEX.bgDeep, 1).fillRect(0, 0, W, contentTop);
    topShield.setDepth(50);
    this.cardLayer.setDepth(10);
    // 顶栏元素提到 100，盖在 shield 之上
    header.backBtn.container.setDepth(100);
    for (const tab of this.tabBtns) tab.container.setDepth(100);

    this.layoutTabsAndCards(W, H);
  }

  private layoutTabsAndCards(W: number, _H: number): void {
    // 重画 tab 按钮位置 + 选中态（与 layout() 内的 topY 保持一致）
    const topY = SAFE_TOP + px(28);
    const tabRowY = topY + px(28);
    const tabW = (W - px(16) * 2 - px(6)) / 2;
    const tabH = px(32);
    for (let i = 0; i < this.tabBtns.length; i++) {
      const t = this.tabBtns[i];
      if (!t) continue;
      const x = px(SPACING.md) + i * (tabW + px(SPACING.xs + 2)); // tab 间距 = px(6)
      t.container.setPosition(x, tabRowY);
      const active = t.id === this.tab;
      t.bg.clear();
      if (active) {
        t.bg
          .fillStyle(HEX.primary, 1)
          .fillRect(0, 0, tabW, tabH)
          .lineStyle(px(1), HEX.primary, 0.5)
          .strokeRect(0, 0, tabW, tabH);
        t.label.setColor(COLOR.bg);
      } else {
        t.bg
          .fillStyle(HEX.primary, 0.06)
          .fillRect(0, 0, tabW, tabH)
          .lineStyle(px(1), HEX.primary, 0.5)
          .strokeRect(0, 0, tabW, tabH);
        t.label.setColor(COLOR.primary);
      }
      t.label.setPosition(tabW / 2, tabH / 2);
    }

    // 网格布局：根据可用宽度算列数 + 等宽 1fr 拉伸
    const padX = px(SPACING.md);
    const innerW = W - padX * 2;
    const cols = Math.max(1, Math.floor((innerW + px(CARD_GAP)) / (px(CARD_W) + px(CARD_GAP))));
    const cardW = (innerW - px(CARD_GAP) * (cols - 1)) / cols;

    // 卡片（按算出的 cardW 创建）
    this.cardLayer.removeAll(true);
    const cards: CardSlot[] = [];
    if (this.tab === 'towers') {
      for (const type of Object.keys(TOWER_META) as TowerType[]) {
        cards.push(this.makeTowerCard(type, cardW));
      }
    } else {
      for (const type of Object.keys(PATHOGEN_META) as PathogenType[]) {
        cards.push(this.makePathogenCard(type, cardW));
      }
    }

    // 整个 tab 内所有卡片用统一最大高度（避免高度参差不齐）
    const uniformH = cards.reduce((m, c) => Math.max(m, c.height), 0);
    for (const card of cards) {
      card.redrawBg(uniformH);
      card.height = uniformH;
    }

    let col = 0;
    let curY = 0;
    for (const card of cards) {
      const cx = padX + col * (cardW + px(CARD_GAP));
      card.container.setPosition(cx, curY);
      this.cardLayer.add(card.container);
      col++;
      if (col >= cols) {
        col = 0;
        curY += uniformH + px(CARD_GAP);
      }
    }
    if (col !== 0) curY += uniformH + px(CARD_GAP);

    // 滚动范围
    const visH = this.contentBottom - this.contentTop;
    this.maxScrollY = Math.max(0, curY - visH);
    this.setScroll(0);

    // 重画 mask
    this.maskShape.clear();
    this.maskShape
      .fillStyle(HEX.white, 1)
      .fillRect(0, this.contentTop, W, this.contentBottom - this.contentTop);
  }

  private makeTowerCard(type: TowerType, cardW: number): CardSlot {
    const meta = TOWER_META[type];
    const def = TOWER_DEFS[type];
    const role = TOWER_REGISTRY[type].role;
    const levels = TOWER_LEVELS[type];
    const [lv1, lv2, lv3] = [levels[0], levels[1], levels[2]];
    const stats: [string, string][] = [['初始成本', `${def.cost} ATP`]];
    if (role === 'helper') {
      stats.push(['激活', '持续 · 无冷却']);
      if (lv1 && lv2 && lv3 && lv1.helperBuff && lv2.helperBuff && lv3.helperBuff) {
        const pct = (b: { dmgMultiplier: number }): string =>
          `+${Math.round((b.dmgMultiplier - 1) * 100)}%`;
        stats.push([
          '伤害增益 Lv1/2/3',
          `${pct(lv1.helperBuff)} / ${pct(lv2.helperBuff)} / ${pct(lv3.helperBuff)}`,
        ]);
        stats.push(['增益范围 Lv1/2/3', `${lv1.range} / ${lv2.range} / ${lv3.range} 格`]);
        stats.push(['HP Lv1/2/3', `${lv1.hp} / ${lv2.hp} / ${lv3.hp}`]);
      }
    } else if (role === 'economy') {
      // 经济塔（mitochondria）：每波末产 ATP，不参与战斗，统计仅显产能 + HP
      stats.push(['激活', '每波末产 ATP']);
      if (lv1 && lv2 && lv3 && lv1.economyBuff && lv2.economyBuff && lv3.economyBuff) {
        stats.push([
          '每波产能 Lv1/2/3',
          `+${lv1.economyBuff.atpPerWave} / +${lv2.economyBuff.atpPerWave} / +${lv3.economyBuff.atpPerWave} ATP`,
        ]);
        stats.push(['HP Lv1/2/3', `${lv1.hp} / ${lv2.hp} / ${lv3.hp}`]);
      }
    } else if (def.radialProjectile && lv1 && lv2 && lv3) {
      // 放射发射塔（neutrophil）：不显"射程"，改显每级子弹数 + 旋转周期
      const rp = def.radialProjectile;
      const aps = (ms: number): string => (1000 / ms).toFixed(2);
      const [c1, c2, c3] = rp.bulletCountByLevel;
      // 旋转周期（秒/圈）= 2π / rotationSpeed
      const period = ((2 * Math.PI) / rp.rotationSpeed).toFixed(1);
      // label 短化：避免 label + value 超过卡片宽度导致值换行（单位已在 label 暗示）
      stats.push(['单发伤害 Lv1/2/3', `${lv1.damage} / ${lv2.damage} / ${lv3.damage}`]);
      stats.push(['子弹数 Lv1/2/3', `${c1} / ${c2} / ${c3} 枚`]);
      stats.push([
        '攻速 Lv1/2/3',
        `${aps(lv1.attackIntervalMs)} / ${aps(lv2.attackIntervalMs)} / ${aps(lv3.attackIntervalMs)} 次/秒`,
      ]);
      stats.push(['旋转周期', `${period} 秒/圈`]);
      stats.push(['子弹速度', `${rp.bulletSpeed} 格/秒`]);
      stats.push(['射程', '全图']);
      stats.push(['HP Lv1/2/3', `${lv1.hp} / ${lv2.hp} / ${lv3.hp}`]);
    } else {
      // 模式 / 目标范围作为 tag 放在名称下方，更直观更节省空间
      if (lv1 && lv2 && lv3) {
        const aps = (ms: number): string => (1000 / ms).toFixed(2);
        stats.push(['伤害 Lv1/2/3', `${lv1.damage} / ${lv2.damage} / ${lv3.damage}`]);
        stats.push(['射程 Lv1/2/3', `${lv1.range} / ${lv2.range} / ${lv3.range} 格`]);
        stats.push([
          '攻速 Lv1/2/3',
          `${aps(lv1.attackIntervalMs)} / ${aps(lv2.attackIntervalMs)} / ${aps(lv3.attackIntervalMs)} 次/秒`,
        ]);
        stats.push(['HP Lv1/2/3', `${lv1.hp} / ${lv2.hp} / ${lv3.hp}`]);
      }
    }
    const tags: string[] =
      role === 'helper' || role === 'economy'
        ? []
        : [
            def.radialProjectile ? '放射' : def.targetingMode === 'aoe' ? '范围' : '单体',
            (def.canTargetFlying ?? true) ? '可打空' : '仅地面',
          ];
    return this.buildCard(meta, getTowerBattleColor(type), stats, 'tower', type, cardW, tags);
  }

  private makePathogenCard(type: PathogenType, cardW: number): CardSlot {
    const meta = PATHOGEN_META[type];
    const def = PATHOGEN_DEFS[type];
    const dot = PATHOGEN_REGISTRY[type].dot;
    const stats: [string, string][] = [
      ['HP', String(def.maxHp)],
      ['速度', `${def.speed} 格/秒`],
      ['核心伤害', String(def.coreDamage)],
      // M1：侵蚀伤害基础值；关卡级 dotMultiplier 可削弱（教学关 0.2-0.4）
      ['侵蚀伤害', `${dot}/秒`],
      ...(def.flying ? ([['免疫逃逸', '空气悬浮 · 无视地面路径']] as [string, string][]) : []),
    ];
    return this.buildCard(meta, getPathogenBattleColor(type), stats, 'pathogen', type, cardW);
  }

  private buildCard(
    meta: EntryMeta,
    color: number,
    stats: [string, string][],
    kind: 'tower' | 'pathogen',
    type: TowerType | PathogenType,
    cardW: number,
    tags: readonly string[] = [],
  ): CardSlot {
    const w = cardW;
    const padX = px(SPACING.sm + SPACING.xs + 2); // = px(14)
    const padY = px(SPACING.sm + SPACING.xs + 2); // = px(14)
    const colorStr = `#${color.toString(16).padStart(6, '0')}`;

    const bg = this.add.graphics();
    // sprite 周围的发光圆（模拟 React 版的 drop-shadow filter）
    // alpha 系数 0.03 保守：3 层累加峰值 ≈ 0.18 → 0.09，让类型色不盖过 SVG 细节
    const glow = this.add.graphics();
    const cx = padX + px(ICON_SIZE) / 2;
    const cy = padY + px(ICON_SIZE) / 2;
    for (let i = 3; i >= 1; i--) {
      const r = px(ICON_SIZE) / 2 + px(i * 3);
      glow.fillStyle(color, 0.03 * (4 - i));
      glow.fillCircle(cx, cy, r);
    }

    // sprite + fallback shape 统一走 EntityIcon atom（按 type 自动适配 shape / color）。
    // 之前的"NO SPRITE"文字 fallback 删除——sprite 缺失时 EntityIcon 画对应的几何
    // shape（hexagon/star/circle 等），比"NO SPRITE"反馈更直观、保持图鉴视觉一致。
    const icon = new EntityIcon(this, {
      kind,
      type,
      size: px(ICON_SIZE),
      x: cx,
      y: cy,
    });

    // 右侧文字区可用宽（sprite + 14 间距之后到右 padding 之前）
    const textColX = padX + px(ICON_SIZE) + px(SPACING.sm + SPACING.xs + 2); // gap = px(14)
    const textColW = Math.max(px(SPACING.xl + SPACING.sm), w - textColX - padX); // min 宽 = px(40)
    const tagline = this.add
      .text(textColX, padY, meta.tagline, {
        fontFamily: FONT,
        fontSize: `${px(9)}px`,
        color: COLOR.dim,
        wordWrap: { width: textColW, useAdvancedWrap: true },
      })
      .setLetterSpacing(px(9 * 0.25))
      .setOrigin(0, 0);
    const name = this.add
      // 紧密堆叠 px(2)：tagline 之下，非 SPACING 阶梯
      .text(textColX, padY + tagline.height + px(2), meta.name, {
        fontFamily: FONT,
        fontSize: `${px(15)}px`,
        color: colorStr,
        wordWrap: { width: textColW, useAdvancedWrap: true },
      })
      .setLetterSpacing(px(15 * 0.2))
      .setOrigin(0, 0);
    name.setShadow(0, 0, colorStr, px(8), true, true);

    // name 下方 tag 小标签（如「范围」「可打空」）：轻度填充 + 细边框 + 类型色
    const tagObjs: GameObjects.GameObject[] = [];
    let rightColBottom = padY + tagline.height + px(2) + name.height;
    if (tags.length > 0) {
      const tagY = rightColBottom + px(SPACING.xs + 2); // gap = px(6)
      const tagPadX = px(SPACING.xs + 3); // = px(7) tag 内 padX
      const tagH = px(SPACING.md + 1); // = px(17) tag 高
      const tagGap = px(SPACING.xs + 2); // = px(6)
      let tagX = textColX;
      for (const label of tags) {
        const t = this.add
          .text(0, 0, label, {
            fontFamily: FONT,
            fontSize: `${px(9)}px`,
            color: colorStr,
          })
          .setLetterSpacing(px(9 * 0.15))
          .setOrigin(0, 0.5);
        const tagW = t.width + tagPadX * 2;
        const tagBg = this.add.graphics();
        tagBg
          .fillStyle(color, 0.12)
          .fillRect(tagX, tagY, tagW, tagH)
          .lineStyle(px(1), color, 0.5)
          .strokeRect(tagX, tagY, tagW, tagH);
        t.setPosition(tagX + tagPadX, tagY + tagH / 2);
        tagObjs.push(tagBg, t);
        tagX += tagW + tagGap;
      }
      rightColBottom = tagY + tagH;
    }

    const descY = padY + Math.max(px(ICON_SIZE), rightColBottom - padY) + px(SPACING.sm + SPACING.xs); // gap = px(12)
    // 中英混排换行修复：每字符间插零宽空格让任意位置可断（中文按字 + ASCII
    // 单词内部也可切）。零宽空格不可见，行尾对齐自然
    const desc = this.add
      .text(padX, descY, addCharBreakpoints(meta.desc), {
        fontFamily: FONT,
        fontSize: `${px(10)}px`,
        color: COLOR.textBright,
        wordWrap: { width: w - padX * 2, useAdvancedWrap: true },
      })
      .setLineSpacing(px(SPACING.xs))
      .setOrigin(0, 0);

    const dividerY = descY + desc.height + px(SPACING.sm + SPACING.xs); // gap = px(12)
    const divider = this.add.graphics();
    divider.lineStyle(px(1), HEX.primary, 0.2).lineBetween(padX, dividerY, w - padX, dividerY);

    const statTexts: GameObjects.Text[] = [];
    let sy = dividerY + px(SPACING.sm);
    for (const [label, value] of stats) {
      const lab = this.add
        .text(padX, sy, label, {
          fontFamily: FONT,
          fontSize: `${px(10)}px`,
          color: COLOR.dim,
        })
        .setLetterSpacing(px(10 * 0.1))
        .setOrigin(0, 0);
      const val = this.add
        .text(w - padX, sy, value, {
          fontFamily: FONT,
          fontSize: `${px(10)}px`,
          color: COLOR.primary,
        })
        .setLetterSpacing(px(10 * 0.1))
        .setOrigin(1, 0);
      statTexts.push(lab, val);
      sy += px(SPACING.sm + SPACING.xs + 2); // 行高 = px(14)
    }

    const cardH = sy + padY - px(SPACING.xs);
    const drawBg = (h: number): void => {
      bg.clear();
      bg.fillStyle(HEX.bg, 0.7)
        .fillRect(0, 0, w, h)
        .lineStyle(px(1), color, 0.34)
        .strokeRect(0, 0, w, h);
    };
    drawBg(cardH);

    const container = this.add.container(0, 0, [
      bg,
      glow,
      icon.container,
      tagline,
      name,
      ...tagObjs,
      desc,
      divider,
      ...statTexts,
    ]);
    return { container, height: cardH, redrawBg: drawBg };
  }
}
