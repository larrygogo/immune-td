import { type GameObjects, Scene } from 'phaser';
import { bgm } from '@audio/bgm';
import { sfx } from '@audio/sfx';
import { useMetaStore } from '@ui/store';
import type { TowerType } from '../game/entities';
import {
  RESEARCH_NODES,
  type ResearchNode,
  type ResearchNodeId,
  canUnlockResearch,
} from '../game/registry/research-registry';
import { TOWER_REGISTRY } from '../game/registry/tower-registry';
import { setRectInteractive } from '../interactive';
import { SPACING } from '../layout/spacing';
import { getTowerBattleColor } from '../render/entity-colors';
import { SAFE_TOP } from '../safe-area';
import { SceneBackground } from '../scene-bg';
import { fadeInOnEnter, transitionToScene } from '../scene-fx';
import { onSceneResize } from '../scene-resize';
import { COLOR, FONT, FONT_MONO, HEX, px } from '../style';
import { drawCyberFrame } from '../ui/atoms/cyber-frame';
import { EntityIcon } from '../ui/atoms/entity-icon';
import { PhaserButton } from '../ui/phaser-button';
import { SceneHeader } from '../ui/scene-header';
import { Toast } from '../ui/toast';

const TREE_ORDER: readonly TowerType[] = [
  'macrophage',
  'neutrophil',
  'nkcell',
  'dendritic',
  'mitochondria',
];

const TREE_HEADER_LABEL: Record<TowerType, string> = {
  macrophage: '巨噬',
  neutrophil: '中性粒',
  nkcell: 'NK',
  dendritic: '树突状',
  mitochondria: '线粒体',
};

/** 节点在树内的排版槽位：row 0 顶（lv2 根）/ row 3 底（终末），从上往下推进 */
type SlotRow = 0 | 1 | 2 | 3;
type SlotCol = 0 | 1 | 'span';

interface NodeSlot {
  row: SlotRow;
  col: SlotCol;
}

/** 节点 UI 句柄：bg + name + desc + cost + 整体 container（处理 hit 用） */
interface NodeRender {
  node: ResearchNode;
  bg: GameObjects.Graphics;
  nameText: GameObjects.Text;
  descText: GameObjects.Text;
  costText: GameObjects.Text;
  container: GameObjects.Container;
}

interface TreeRender {
  type: TowerType;
  headerText: GameObjects.Text;
  edges: GameObjects.Graphics;
  nodes: Map<ResearchNodeId, NodeRender>;
}

interface TabBtn {
  type: TowerType;
  container: GameObjects.Container;
  bg: GameObjects.Graphics;
  icon: EntityIcon;
  label: GameObjects.Text;
}

/**
 * 研究 Scene v4（Phase 4 · BTD6 借鉴）：
 * 4 棵树横排，每棵 5 节点（终末 / lv3 / 能力A·B / lv2 根）+ 前置连线 + 顶栏 RP/重置/返回。
 *
 * 状态色：金=已购 / 黄=可购 / 灰=不可购。点节点直接 buyResearch（Task 4.2 加确认 modal）。
 */
export class ResearchScene extends Scene {
  private bg!: SceneBackground;
  /** RP 信息横条：bg + label + 数据 + invested 副标 */
  private rpBarBg!: GameObjects.Graphics;
  private rpLabelText!: GameObjects.Text;
  private rpValueText!: GameObjects.Text;
  private rpInvestedText!: GameObjects.Text;
  private resetBtn!: PhaserButton;
  private toast!: Toast;
  private trees: TreeRender[] = [];
  private tabBtns: TabBtn[] = [];
  private currentTab: TowerType = 'macrophage';
  /** Tab 滚动容器：宽度超过 viewport 时支持横向 swipe */
  private tabsScrollContainer!: GameObjects.Container;
  private tabsMask!: GameObjects.Graphics;
  private tabsScrollX = 0;
  private tabsContentWidth = 0;
  private tabsViewportWidth = 0;
  private tabsDragStartX = 0;
  private tabsDragStartScroll = 0;
  private tabsDragging = false;
  /** 重置确认 modal：avoid 误点引发不可逆 RP/解锁状态变更 */
  private resetModal: GameObjects.Container | null = null;

  constructor() {
    super('ResearchScene');
  }

  create(): void {
    this.trees = [];
    this.tabBtns = [];

    bgm.play('menu');
    this.bg = new SceneBackground(this);
    fadeInOnEnter(this);

    this.buildUI();

    const { width, height } = this.scale;
    this.layout(width, height);
    onSceneResize(this, (w, h) => this.layout(w, h));
  }

  override update(_t: number, dt: number): void {
    this.bg.tick(dt, this.scale.width, this.scale.height);
  }

  private buildUI(): void {
    const header = new SceneHeader(this, {
      backOnTap: () => transitionToScene(this, 'MainMenuScene'),
      title: '研究 · 免疫记忆库',
    });
    // wx 端 SAFE_TOP 兜住胶囊 + 状态栏；H5 端 SAFE_TOP=0
    header.layout(this.scale.width, SAFE_TOP);

    // RP 信息横条：design-system Pattern A 的简化版（深底 + 主色细描边 + L 角）
    this.rpBarBg = this.add.graphics();
    // "研究点" label - 9px dim 小标签
    this.rpLabelText = this.add
      .text(0, 0, '研究点', {
        fontFamily: FONT,
        fontSize: `${px(9)}px`,
        color: COLOR.textXDim,
      })
      .setLetterSpacing(px(9 * 0.2))
      .setOrigin(0, 0.5);
    // 主数值 - mono 14px bold（数据档），rewardGold 强调
    this.rpValueText = this.add
      .text(0, 0, '0 RP', {
        fontFamily: FONT_MONO,
        fontSize: `${px(14)}px`,
        fontStyle: 'bold',
        color: COLOR.rewardGold,
      })
      .setLetterSpacing(px(14 * 0.06))
      .setOrigin(0, 0.5);
    // 已投入副标 - 9px dim
    this.rpInvestedText = this.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: `${px(9)}px`,
        color: COLOR.textDim,
      })
      .setLetterSpacing(px(9 * 0.15))
      .setOrigin(0, 0.5);

    // 重置按钮：ghost 风格（次要操作不抢主视觉），用 textDim 而不是 danger
    this.resetBtn = new PhaserButton(this, 0, 0, {
      label: '重置',
      width: 72,
      height: 24,
      fontSize: 10,
      letterSpacingEm: 0.15,
      color: HEX.textDim,
      strokeColor: HEX.textDim,
      onTap: () => this.handleReset(),
      ariaLabel: 'reset-research',
    });

    this.toast = new Toast(this);

    for (const towerType of TREE_ORDER) {
      this.trees.push(this.makeTree(towerType));
    }

    // Tab 滚动容器（mask 裁剪 + 横向 swipe 拖动）—— 未来塔种增加超过宽度时自动可滑
    this.tabsScrollContainer = this.add.container(0, 0);
    this.tabsMask = this.add.graphics();
    this.tabsMask.setVisible(false);
    this.tabsScrollContainer.setMask(this.tabsMask.createGeometryMask());

    // tab 行：每个 tab = sprite icon + 全名 label，宽度自适应
    const tabIconSize = px(SPACING.md + SPACING.xs); // = px(20)
    for (const towerType of TREE_ORDER) {
      const color = getTowerBattleColor(towerType);
      const meta = TOWER_REGISTRY[towerType].meta;
      const bg = this.add.graphics();
      // sprite + fallback shape 统一走 EntityIcon atom（按 type 自动适配 shape / color）
      const icon = new EntityIcon(this, {
        kind: 'tower',
        type: towerType,
        size: tabIconSize,
        x: 0,
        y: 0,
      });
      const label = this.add
        .text(0, 0, meta.displayName, {
          fontFamily: FONT,
          fontSize: `${px(11)}px`,
          fontStyle: 'bold',
          color: `#${color.toString(16).padStart(6, '0')}`,
        })
        .setLetterSpacing(px(11 * 0.15))
        .setOrigin(0, 0.5);
      const container = this.add.container(0, 0, [bg, icon.container, label]);
      // size 在 layoutTabs 时按内容算
      setRectInteractive(container, px(SPACING.xl + SPACING.sm), px(SPACING.xl), {
        useHandCursor: true,
        bgAlign: 'topLeft',
      });
      // 选中改用 pointerup（区分 tap vs swipe）：pointerup 时算从 pointerdown 起的总位移，
      // < 阈值 = tap → 选中；>= 阈值 = swipe → 已处理滚动，不选中
      container.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        const dx = Math.abs(pointer.x - this.tabsDragStartX);
        if (dx > px(SPACING.xs)) return; // tap vs swipe 阈值 = px(4)
        sfx.uiClick();
        this.currentTab = towerType;
        this.refresh();
      });
      this.tabsScrollContainer.add(container);
      this.tabBtns.push({ type: towerType, container, bg, icon, label });
    }

    // 横向 swipe drag handlers
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.isPointerInTabRow(pointer)) return;
      this.tabsDragStartX = pointer.x;
      this.tabsDragStartScroll = this.tabsScrollX;
      this.tabsDragging = false;
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown) return;
      if (!this.isPointerInTabRow(pointer)) return;
      const dx = pointer.x - this.tabsDragStartX;
      if (Math.abs(dx) > px(SPACING.xs)) this.tabsDragging = true;
      if (this.tabsDragging) {
        this.tabsScrollX = this.clampTabScroll(this.tabsDragStartScroll + dx);
        this.applyTabScroll();
      }
    });
    this.input.on('pointerup', () => {
      // 短延迟重置，避免 pointerdown 触发了选中后立即误判 dragging
      this.time.delayedCall(50, () => {
        this.tabsDragging = false;
      });
    });

    this.refresh();
  }

  /** 判断 pointer 是否在 tab 行 hit 区域内（用于 drag 限制） */
  private isPointerInTabRow(pointer: Phaser.Input.Pointer): boolean {
    // 与 layout() 内 tabRowY 保持一致（wx 端整体下移 SAFE_TOP）
    // tabRowY = px(132) = xxl(48) + xxl(48) + lg(24) + sm(8) + xs(4)
    const tabRowY = SAFE_TOP + px(SPACING.xxl + SPACING.xxl + SPACING.lg + SPACING.sm + SPACING.xs);
    const tabH = px(SPACING.xl + SPACING.xs); // = px(36)
    return pointer.y >= tabRowY && pointer.y <= tabRowY + tabH;
  }

  private clampTabScroll(x: number): number {
    const max = 0;
    const min = Math.min(0, this.tabsViewportWidth - this.tabsContentWidth);
    return Math.max(min, Math.min(max, x));
  }

  private applyTabScroll(): void {
    this.tabsScrollContainer.x = this.tabsScrollX;
  }

  /** 构造一棵树的 UI 元素：header + 5 个节点 + edges graphics */
  private makeTree(towerType: TowerType): TreeRender {
    const color = getTowerBattleColor(towerType);
    const colorStr = `#${color.toString(16).padStart(6, '0')}`;

    // 简短 header（避免手机宽度下溢出）：仅塔分类名 + ✦ 装饰
    const headerText = this.add
      .text(0, 0, `✦ ${TREE_HEADER_LABEL[towerType]}`, {
        fontFamily: FONT,
        fontSize: `${px(11)}px`,
        color: colorStr,
        fontStyle: 'bold',
      })
      .setLetterSpacing(px(11 * 0.2))
      .setOrigin(0.5, 0)
      .setShadow(0, 0, colorStr, px(4), false, true);

    const edges = this.add.graphics();

    const nodes = new Map<ResearchNodeId, NodeRender>();
    const treeNodes = RESEARCH_NODES.filter((n) => n.towerType === towerType);
    for (const node of treeNodes) {
      nodes.set(node.id, this.makeNode(node));
    }

    return { type: towerType, headerText, edges, nodes };
  }

  private makeNode(node: ResearchNode): NodeRender {
    const bg = this.add.graphics();
    // 双行：name (13bold 卡片名档) + desc (10normal 小标签档)；wordWrap 防溢出
    const nameText = this.add
      .text(0, 0, node.name, {
        fontFamily: FONT,
        fontSize: `${px(13)}px`,
        color: COLOR.text,
        fontStyle: 'bold',
      })
      .setLetterSpacing(px(13 * 0.1))
      .setOrigin(0, 0);
    const descText = this.add
      .text(0, 0, node.description, {
        fontFamily: FONT,
        fontSize: `${px(10)}px`,
        color: COLOR.textDim,
      })
      .setLetterSpacing(px(10 * 0.06))
      .setOrigin(0, 0);
    const costText = this.add
      .text(0, 0, '', {
        fontFamily: FONT_MONO,
        fontSize: `${px(11)}px`,
        fontStyle: 'bold',
      })
      .setLetterSpacing(px(11 * 0.1))
      .setOrigin(1, 0.5);

    const container = this.add.container(0, 0, [bg, nameText, descText, costText]);
    container.setSize(px(10), px(10));
    setRectInteractive(container, px(10), px(10), { useHandCursor: true, bgAlign: 'topLeft' });
    container.on('pointerdown', () => this.handleNodePress(node.id));

    return { node, bg, nameText, descText, costText, container };
  }

  private handleNodePress(id: ResearchNodeId): void {
    const meta = useMetaStore.getState();
    if (meta.unlockedResearch.includes(id)) return; // 已购 noop（Task 4.2 改为 tooltip）
    const node = RESEARCH_NODES.find((n) => n.id === id);
    if (!node) return;
    if (!canUnlockResearch(node, meta.unlockedResearch)) {
      sfx.error();
      return;
    }
    if (meta.researchPoints < node.cost) {
      sfx.error();
      return;
    }
    sfx.uiClick();
    meta.buyResearch(id);
    this.refresh();
  }

  /**
   * 重置入口：先弹确认 modal（避免误点导致不可逆 RP / 解锁状态丢失），
   * 玩家确认后再执行 meta.resetResearch()。
   * 已无任何已购节点 + 首次免费时直接弹 toast，不需要确认（无可丢失内容）。
   */
  private handleReset(): void {
    const meta = useMetaStore.getState();
    const totalInvested = meta.unlockedResearch.reduce((sum, id) => {
      const node = RESEARCH_NODES.find((n) => n.id === id);
      return node && !node.defaultUnlocked ? sum + node.cost : sum;
    }, 0);
    const isFirstReset = meta.researchResetCount === 0;
    // 既无投入又是首次免费 → 等同 no-op，直接拒绝避免无意义的"确认成功"弹窗
    if (totalInvested === 0 && isFirstReset) {
      sfx.error();
      this.toast.show('暂无已投入的 RP，无需重置', COLOR.dim);
      return;
    }
    sfx.uiClick();
    this.showResetConfirmModal(totalInvested, isFirstReset);
  }

  private executeReset(): void {
    const meta = useMetaStore.getState();
    const result = meta.resetResearch();
    if (result.ok) {
      sfx.uiClick();
      const msg =
        result.cost > 0
          ? `重置成功 · 返还 ${result.refund} RP（扣 ${result.cost}）`
          : `重置成功 · 返还 ${result.refund} RP`;
      this.toast.show(msg, COLOR.rewardGold);
      this.refresh();
    } else {
      sfx.error();
      this.toast.show('RP 不够，无法重置', COLOR.danger);
    }
  }

  /**
   * 重置确认 modal。复刻 MainMenu 退出登录确认弹窗的 pattern：
   * dim 遮罩 + 直角矩形卡 + 取消（dim）/ 确认（danger 红）双按钮。
   * 点遮罩 = 取消；按钮触发 pointerdown（与登录 modal 一致，避免按钮抬起时
   * pointerup 落在遮罩上秒关）。
   */
  private showResetConfirmModal(refund: number, isFirstReset: boolean): void {
    if (this.resetModal) return;
    const W = this.scale.width;
    const H = this.scale.height;
    const cardW = px(360); /* 非 SPACING：modal 卡片宽 360 视觉调校值 */
    const cardH = px(220); /* 非 SPACING：modal 卡片高 220 视觉调校值 */
    const cardX = Math.round((W - cardW) / 2);
    const cardY = Math.round((H - cardH) / 2);

    const dim = this.add.graphics();
    dim.fillStyle(HEX.bg, 0.85).fillRect(0, 0, W, H);
    const dimZone = this.add
      .zone(0, 0, W, H)
      .setOrigin(0, 0)
      .setInteractive()
      .on('pointerdown', () => this.dismissResetModal());

    const card = this.add.graphics();
    card
      .fillStyle(HEX.bg, 0.98)
      .fillRect(cardX, cardY, cardW, cardH)
      .lineStyle(px(1), HEX.primary, 1)
      .strokeRect(cardX, cardY, cardW, cardH);
    drawCyberFrame(card, cardX, cardY, cardW, cardH, { variant: 'thick' });

    // y = px(28)：modal 标题距卡顶
    const title = this.add
      .text(W / 2, cardY + px(SPACING.lg + SPACING.xs), '确认重置研究', {
        fontFamily: FONT,
        fontSize: `${px(18)}px`,
        color: COLOR.danger,
      })
      .setOrigin(0.5)
      .setLetterSpacing(px(18 * 0.3))
      .setShadow(0, 0, COLOR.danger, px(10), false, true);

    const costLine = isFirstReset ? '本次免费' : '本次将扣 1 RP';
    const bodyText = `所有已购研究节点会清空\n返还 ${refund} RP · ${costLine}\n（默认解锁节点不影响）`;
    // y = px(72) = xxl(48) + lg(24)：modal 正文距卡顶
    const body = this.add
      .text(W / 2, cardY + px(SPACING.xxl + SPACING.lg), bodyText, {
        fontFamily: FONT,
        fontSize: `${px(12)}px`,
        color: COLOR.dim,
        align: 'center',
        lineSpacing: px(SPACING.xs + 2), // = px(6)
      })
      .setOrigin(0.5, 0)
      .setLetterSpacing(px(12 * 0.15));

    const btnY = cardY + cardH - px(SPACING.xl + SPACING.sm); // = px(40) modal 按钮距卡底
    const btnGap = px(SPACING.md);
    const btnW = 120;
    const cancelX = W / 2 - px(btnW / 2) - btnGap / 2;
    const confirmX = W / 2 + px(btnW / 2) + btnGap / 2;

    const cancelBtn = new PhaserButton(this, cancelX, btnY, {
      label: '取消',
      width: btnW,
      height: 32,
      fontSize: 12,
      letterSpacingEm: 0.25,
      color: HEX.dim,
      strokeColor: HEX.dim,
      onTap: () => this.dismissResetModal(),
      ariaLabel: 'cancel-reset-research',
    });
    const confirmBtn = new PhaserButton(this, confirmX, btnY, {
      label: '确认重置',
      width: btnW,
      height: 32,
      fontSize: 12,
      letterSpacingEm: 0.25,
      color: HEX.danger,
      strokeColor: HEX.danger,
      onTap: () => {
        this.dismissResetModal();
        this.executeReset();
      },
      ariaLabel: 'confirm-reset-research',
    });

    const container = this.add.container(0, 0, [
      dim,
      dimZone,
      card,
      title,
      body,
      cancelBtn.container,
      confirmBtn.container,
    ]);
    container.setDepth(1000);
    this.resetModal = container;
  }

  private dismissResetModal(): void {
    if (this.resetModal) {
      this.resetModal.destroy(true);
      this.resetModal = null;
    }
  }

  /** 刷新所有节点状态色 + RP 横条 + 重置按钮文案 */
  private refresh(): void {
    const meta = useMetaStore.getState();
    const totalInvested = meta.unlockedResearch.reduce((sum, id) => {
      const node = RESEARCH_NODES.find((n) => n.id === id);
      return node && !node.defaultUnlocked ? sum + node.cost : sum;
    }, 0);
    this.rpValueText.setText(`${meta.researchPoints} RP`);
    this.rpInvestedText.setText(totalInvested > 0 ? `已投入 ${totalInvested}` : '尚未投入');

    const isFirstReset = meta.researchResetCount === 0;
    this.resetBtn.setLabel(isFirstReset ? '重置·免费' : '重置·1 RP');
    this.resetBtn.setEnabled(isFirstReset || meta.researchPoints >= 1 || totalInvested > 0);

    for (const tree of this.trees) {
      // biome-ignore lint/complexity/noForEach: wx babel _createForOfIteratorHelper 对 Map iterator 报 non-iterable
      tree.nodes.forEach((render) => this.refreshNode(render, meta));
    }

    this.layout(this.scale.width, this.scale.height);
  }

  private refreshNode(
    render: NodeRender,
    meta: { unlockedResearch: string[]; researchPoints: number },
  ): void {
    const node = render.node;
    const isPurchased = meta.unlockedResearch.includes(node.id);
    const isUnlockable = !isPurchased && canUnlockResearch(node, meta.unlockedResearch);
    const canAfford = meta.researchPoints >= node.cost;

    // 状态色严格按 design-system.md 第 6 节
    if (isPurchased) {
      // 已购：类型色高亮（不用 rewardGold——那是瞬时奖励反馈）
      render.costText.setText('已解锁').setColor(COLOR.dim);
      render.nameText.setColor(COLOR.text);
      render.descText.setColor(COLOR.textBright).setAlpha(1);
    } else if (isUnlockable && canAfford) {
      render.costText.setText(`${node.cost} RP`).setColor(COLOR.rewardGold);
      render.nameText.setColor(COLOR.text);
      render.descText.setColor(COLOR.textDim).setAlpha(1);
    } else if (isUnlockable && !canAfford) {
      render.costText.setText(`${node.cost} RP`).setColor(COLOR.danger);
      render.nameText.setColor(COLOR.textDim);
      render.descText.setColor(COLOR.textDim).setAlpha(0.85);
    } else {
      // 不可购（前置未达）：cost text 隐藏；nameText / descText dim
      render.costText.setText('').setColor(COLOR.textDim);
      render.nameText.setColor(COLOR.textMuted);
      render.descText.setColor(COLOR.textMuted).setAlpha(0.6);
    }
  }

  private layout(W: number, H: number): void {
    this.bg.setViewport(W, this.scale.height);

    // 已投入副标 —— 横条上方右对齐 dim 小字（与横条本身分离，不再挤进重置按钮区）
    // wx 端 SAFE_TOP 兜住胶囊 + 状态栏；H5 端 SAFE_TOP=0
    const investedY = SAFE_TOP + px(SPACING.xl + SPACING.lg + SPACING.xs); // = px(60)
    this.rpInvestedText.setOrigin(1, 0.5);
    this.rpInvestedText.setPosition(W - px(SPACING.md), investedY);

    // RP 信息横条：紧贴副标下方（Pattern A 简化版：深底 + 主色细描边 + L 角）
    // 左：研究点 label + 主数值；右：重置按钮（ghost）
    // 边距 px(16) 与 Tab 行对齐
    const barX = px(SPACING.md);
    const barY = SAFE_TOP + px(SPACING.xxl + SPACING.lg + SPACING.xs); // = px(76)
    const barW = W - px(SPACING.xl); // 左右各 SPACING.md = px(32)
    const barH = px(SPACING.xl + SPACING.sm); // = px(40)
    this.rpBarBg.clear();
    this.rpBarBg
      .fillStyle(HEX.bgCard, 0.85)
      .fillRect(barX, barY, barW, barH)
      .lineStyle(px(1), HEX.rewardGold, 0.4)
      .strokeRect(barX, barY, barW, barH);
    // L 角细装饰：thin variant + 金色 alpha 0.7（强调 RP 是关键状态）
    drawCyberFrame(this.rpBarBg, barX, barY, barW, barH, {
      variant: 'thin',
      color: HEX.rewardGold,
      alpha: 0.7,
    });

    // 横条内：左对齐 label + 主数值；右对齐重置按钮（已投入已提取到横条上方）
    const barCy = barY + barH / 2;
    const barPadX = px(SPACING.md);
    this.rpLabelText.setPosition(barX + barPadX, barCy);
    this.rpValueText.setPosition(
      barX + barPadX + this.rpLabelText.width + px(SPACING.sm + 2),
      barCy,
    ); // gap = px(10)
    this.resetBtn.container.setPosition(barX + barW - barPadX - this.resetBtn.widthPx / 2, barCy);

    // Tab 行：每个 tab fit-content（icon + 全名）；总宽超 viewport 时支持横向 swipe
    // tabRowY = px(132)：与 isPointerInTabRow 同步
    const tabRowY = SAFE_TOP + px(SPACING.xxl + SPACING.xxl + SPACING.lg + SPACING.sm + SPACING.xs);
    const tabAreaX = px(SPACING.md);
    const tabAreaW = W - tabAreaX * 2;
    const tabGap = px(SPACING.xs + 2); // = px(6)
    const tabH = px(SPACING.xl + SPACING.xs); // = px(36)
    const tabPadX = px(SPACING.sm + SPACING.xs); // = px(12)
    const tabIconSize = px(SPACING.md + SPACING.xs); // = px(20)
    const tabIconLabelGap = px(SPACING.sm);

    // mask 区域：限制 scroll container 仅在此区域内可见
    this.tabsMask.clear();
    this.tabsMask.fillStyle(HEX.white, 1);
    this.tabsMask.fillRect(tabAreaX, tabRowY, tabAreaW, tabH);

    let cursorX = 0;
    for (const t of this.tabBtns) {
      const tabContentW = tabPadX + tabIconSize + tabIconLabelGap + t.label.width + tabPadX;
      const tabFinalW = Math.max(px(SPACING.xxl + SPACING.xl), tabContentW); // min 宽 = px(80)
      // tab container 位置（相对 scrollContainer 内部坐标）
      t.container.setPosition(tabAreaX + cursorX, tabRowY);
      t.container.setSize(tabFinalW, tabH);
      const hitRect = t.container.input?.hitArea as Phaser.Geom.Rectangle | undefined;
      if (hitRect) hitRect.setTo(tabFinalW / 2, tabH / 2, tabFinalW, tabH);

      const active = t.type === this.currentTab;
      const color = getTowerBattleColor(t.type);
      const colorStr = `#${color.toString(16).padStart(6, '0')}`;
      t.bg.clear();
      if (active) {
        t.bg
          .fillStyle(color, 1)
          .fillRect(0, 0, tabFinalW, tabH)
          .lineStyle(px(1), color, 0.5)
          .strokeRect(0, 0, tabFinalW, tabH);
        t.label.setColor(COLOR.bg);
      } else {
        t.bg
          .fillStyle(color, 0.06)
          .fillRect(0, 0, tabFinalW, tabH)
          .lineStyle(px(1), color, 0.5)
          .strokeRect(0, 0, tabFinalW, tabH);
        t.label.setColor(colorStr);
      }
      // tab 内：左 icon + label，垂直居中
      const iconCx = tabPadX + tabIconSize / 2;
      const cy = tabH / 2;
      t.icon.setPosition(iconCx, cy);
      // 选中态：sprite 跟塔色背景同色融合 → 半透明衬托，避免亮色叠亮色看不清
      // EntityIcon 是 Container（不支持 setTint），统一走 alpha 方案
      t.icon.setAlpha(active ? 0.4 : 1);
      t.label.setPosition(tabPadX + tabIconSize + tabIconLabelGap, cy);
      cursorX += tabFinalW + tabGap;
    }
    this.tabsContentWidth = Math.max(0, cursorX - tabGap);
    this.tabsViewportWidth = tabAreaW;
    this.tabsScrollX = this.clampTabScroll(this.tabsScrollX);
    this.applyTabScroll();

    // 节点区：仅渲染 currentTab，全屏宽 + 双行节点（name + desc）
    const nodeAreaY = tabRowY + tabH + px(SPACING.lg);
    const padX = px(SPACING.md);
    const innerNodeGap = px(SPACING.sm + 2); // = px(10)
    const treeW = W - padX * 2;
    const rowH = px(SPACING.xl + SPACING.lg + SPACING.xs); // = px(60)
    const rowGap = px(SPACING.sm + SPACING.xs); // = px(12)

    for (const tree of this.trees) {
      const isCurrent = tree.type === this.currentTab;
      tree.headerText.setVisible(false); // tab 已经显示分类名，header 冗余
      tree.edges.setVisible(isCurrent);
      // biome-ignore lint/complexity/noForEach: wx babel _createForOfIteratorHelper 对 Map iterator 报 non-iterable
      tree.nodes.forEach((render) => {
        render.container.setVisible(isCurrent);
      });
      if (!isCurrent) continue;

      // 节点矩阵布局：row 0 顶（终末）/ row 3 底（lv2 根）
      const slots = this.computeSlots(tree.type);
      const positions = new Map<ResearchNodeId, { x: number; y: number; w: number; h: number }>();
      // forEach 而非 for...of map：wx babel _createForOfIteratorHelper 对 Map iterator 报 non-iterable
      slots.forEach((slot, id) => {
        const render = tree.nodes.get(id);
        if (!render) return;
        const y = nodeAreaY + slot.row * (rowH + rowGap);
        let x: number;
        let w: number;
        if (slot.col === 'span') {
          x = padX;
          w = treeW;
        } else {
          w = (treeW - innerNodeGap) / 2;
          x = padX + (slot.col === 0 ? 0 : w + innerNodeGap);
        }
        positions.set(id, { x, y, w, h: rowH });
        this.drawNode(render, x, y, w, rowH);
      });

      // 前置连线（树从上往下：prereq 底部 → dependent 顶部）
      tree.edges.clear();
      const meta = useMetaStore.getState();
      const color = getTowerBattleColor(tree.type);
      // biome-ignore lint/complexity/noForEach: wx babel _createForOfIteratorHelper 对 Map iterator 报 non-iterable
      tree.nodes.forEach((node) => {
        for (const prereqId of node.node.prerequisites) {
          const from = positions.get(prereqId);
          const to = positions.get(node.node.id);
          if (!from || !to) continue;
          const fromCx = from.x + from.w / 2;
          const fromBottomY = from.y + from.h;
          const toCx = to.x + to.w / 2;
          const toTopY = to.y;
          const isLit = meta.unlockedResearch.includes(prereqId);
          tree.edges
            .lineStyle(px(1.5), color, isLit ? 0.65 : 0.2)
            .lineBetween(fromCx, fromBottomY, toCx, toTopY);
        }
      });
    }

    // 底部 action 已挪到顶部 RP 横条；layout 末尾不再做底部布局
    void H;
  }

  /** 按 tier 把树内节点排槽位（从上往下推进）：tier 1 顶 / tier 2 左右 / tier 3 / tier 4 底 */
  private computeSlots(towerType: TowerType): Map<ResearchNodeId, NodeSlot> {
    const treeNodes = RESEARCH_NODES.filter((n) => n.towerType === towerType);
    const slots = new Map<ResearchNodeId, NodeSlot>();
    let tier2Col: 0 | 1 = 0;
    for (const node of treeNodes) {
      switch (node.tier) {
        case 1:
          slots.set(node.id, { row: 0, col: 'span' });
          break;
        case 2: {
          slots.set(node.id, { row: 1, col: tier2Col });
          tier2Col = tier2Col === 0 ? 1 : 0;
          break;
        }
        case 3:
          slots.set(node.id, { row: 2, col: 'span' });
          break;
        case 4:
          slots.set(node.id, { row: 3, col: 'span' });
          break;
      }
    }
    return slots;
  }

  private drawNode(render: NodeRender, x: number, y: number, w: number, h: number): void {
    const meta = useMetaStore.getState();
    const node = render.node;
    const isPurchased = meta.unlockedResearch.includes(node.id);
    const isUnlockable = !isPurchased && canUnlockResearch(node, meta.unlockedResearch);
    const canAfford = meta.researchPoints >= node.cost;
    const towerColor = getTowerBattleColor(node.towerType);

    // 节点 = LoadoutCard pattern（design-system.md 第 4 节 Pattern E）
    // 直角矩形 + 类型色描边 + L 角装饰；不用圆角（design-system 反例：纯填充按钮做主操作卡）
    render.bg.clear();
    if (isPurchased) {
      // 已选态：alpha 0.35 类型色 + px(3) 描边 + px(1) 白色内框（LoadoutCard selected pattern）
      render.bg
        .fillStyle(towerColor, 0.35)
        .fillRect(x, y, w, h)
        .lineStyle(px(3), towerColor, 1)
        .strokeRect(x, y, w, h)
        .lineStyle(px(1), HEX.white, 0.5)
        .strokeRect(x + px(SPACING.xs), y + px(SPACING.xs), w - px(SPACING.sm), h - px(SPACING.sm));
    } else if (isUnlockable && canAfford) {
      // 可购：alpha 0.06 类型色填充 + px(1) 描边 alpha 0.4
      render.bg
        .fillStyle(towerColor, 0.08)
        .fillRect(x, y, w, h)
        .lineStyle(px(1), towerColor, 0.55)
        .strokeRect(x, y, w, h);
    } else if (isUnlockable && !canAfford) {
      // RP 不够：同可购但描边更弱
      render.bg
        .fillStyle(towerColor, 0.06)
        .fillRect(x, y, w, h)
        .lineStyle(px(1), towerColor, 0.3)
        .strokeRect(x, y, w, h);
    } else {
      // 前置未达：alpha 0.02 + px(1) alpha 0.2（design-system 禁用态）
      render.bg
        .fillStyle(towerColor, 0.02)
        .fillRect(x, y, w, h)
        .lineStyle(px(1), towerColor, 0.2)
        .strokeRect(x, y, w, h);
    }

    // L 角装饰：仅已购 / 可购 + RP 够 时画（不可购态保持极简）
    // 统一走 atom（design-system §5.1 thin variant），alpha 区分已购(0.85) / 可购(0.55)
    if (isPurchased || (isUnlockable && canAfford)) {
      drawCyberFrame(render.bg, x, y, w, h, {
        variant: 'thin',
        color: towerColor,
        alpha: isPurchased ? 0.85 : 0.55,
      });
    }

    // 双行布局：左侧 name (上) + desc (下)，右侧 cost 垂直居中
    const padX = px(SPACING.sm + SPACING.xs + 2); // = px(14)
    const padY = px(SPACING.sm + 2); // = px(10)
    const textX = x + padX;
    const costX = x + w - padX;
    const costReservedW = render.costText.width + px(SPACING.sm);
    const textColW = Math.max(px(SPACING.xl + SPACING.sm), w - padX * 2 - costReservedW); // min 宽 = px(40)
    render.nameText.setWordWrapWidth(textColW, true);
    render.descText.setWordWrapWidth(textColW, true);
    render.nameText.setPosition(textX, y + padY);
    // name → desc 紧密堆叠 px(3)，非 SPACING 阶梯
    render.descText.setPosition(textX, y + padY + render.nameText.height + px(3));
    render.costText.setPosition(costX, y + h / 2);

    // hit area 同步
    render.container.setSize(w, h);
    const hitRect = render.container.input?.hitArea as Phaser.Geom.Rectangle | undefined;
    if (hitRect) {
      hitRect.setTo(x + w / 2, y + h / 2, w, h);
    }
  }
}
