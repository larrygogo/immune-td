import { type GameObjects, Scene } from 'phaser';
import { bgm } from '@audio/bgm';
import { sfx } from '@audio/sfx';
import { useMetaStore } from '@ui/store';
import { TEX } from '../asset-keys';
import type { TowerType } from '../game/entities';
import { TOWER_REGISTRY } from '../game/registry/tower-registry';
import { setRectInteractive } from '../interactive';
import { SPACING } from '../layout/spacing';
import { resolveTowerSprite } from '../render/entity-colors';
import { SAFE_TOP } from '../safe-area';
import { SceneBackground } from '../scene-bg';
import { fadeInOnEnter, transitionToScene } from '../scene-fx';
import { onSceneResize } from '../scene-resize';
import { COLOR, FONT, HEX, px } from '../style';
import { makeCrystalIcon } from '../ui/atoms/crystal-icon';
import { makeFallbackShape } from '../ui/atoms/entity-icon';
import { SceneHeader } from '../ui/scene-header';
import { type IconResult, addSpriteOrFallback } from '../ui/sprite-icon';
import { Toast } from '../ui/toast';

const TOWER_ORDER: readonly TowerType[] = [
  'macrophage',
  'neutrophil',
  'nkcell',
  'dendritic',
  'mitochondria',
];

interface CardRender {
  type: TowerType;
  skinId: string;
  container: GameObjects.Container;
  bg: GameObjects.Graphics;
  iconShape: IconResult;
  nameText: GameObjects.Text;
  descText: GameObjects.Text | null;
  actionIcon: GameObjects.Graphics;
  actionLabel: GameObjects.Text;
  actionBg: GameObjects.Graphics;
  actionContainer: GameObjects.Container;
}

type ShopCategory = 'skins' | 'scenes';

interface TabBtn {
  key: ShopCategory;
  label: string;
  container: GameObjects.Container;
  bg: GameObjects.Graphics;
  text: GameObjects.Text;
}

/**
 * 装饰商店：按商品类型 tab 分类（皮肤 / 场景）。
 * - 皮肤：5 塔 × 2 套 = 10 张卡片
 * - 场景：占位"筹备中"（后续加棋盘背景 / 战斗主题等装饰）
 *
 * 卡片仅负责解锁（购买）；装备职责在「战备」scene。
 */
export class ShopScene extends Scene {
  private bg!: SceneBackground;
  private creditsText!: GameObjects.Text;
  private creditsIcon!: GameObjects.Graphics;
  private cards: CardRender[] = [];
  private toast!: Toast;
  private tabBtns: TabBtn[] = [];
  private currentTab: ShopCategory = 'skins';
  private placeholderText: GameObjects.Text | null = null;
  private devAddCreditsContainer: GameObjects.Container | null = null;
  private firstLayout = true;

  constructor() {
    super('ShopScene');
  }

  create(): void {
    this.cards = [];
    this.tabBtns = [];
    this.firstLayout = true;

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
      title: '商店',
    });
    // wx 端 SAFE_TOP 兜住胶囊 + 状态栏；H5 端 SAFE_TOP=0
    header.layout(this.scale.width, SAFE_TOP);

    // 能量结晶余额：自绘菱形图标 + 文字
    this.creditsIcon = makeCrystalIcon(this, px(SPACING.md));
    this.creditsText = this.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: `${px(13)}px`,
        color: COLOR.rewardGold,
        fontStyle: 'bold',
      })
      .setLetterSpacing(px(13 * 0.15))
      .setOrigin(0, 0.5);

    // Dev-only：调试加 100 EC 按钮，方便手测解锁链路
    if (import.meta.env.DEV) this.buildDevAddCreditsBtn();

    // 商品类型 tab：皮肤 + 场景
    this.buildTabs();

    // 皮肤卡片网格：商店仅展示可购买的 alt 皮肤，原皮（default）每塔自带不显示。
    // 排序：未解锁优先（玩家进商店看到的是「能买的在前」），同状态保持 TOWER_ORDER 顺序
    const meta = useMetaStore.getState();
    const entries: { type: TowerType; skinId: string; unlocked: boolean }[] = [];
    for (const type of TOWER_ORDER) {
      for (const skin of TOWER_REGISTRY[type].skins) {
        if (skin.id === 'default') continue;
        const unlocked = (meta.unlockedSkins[type] ?? []).includes(skin.id);
        entries.push({ type, skinId: skin.id, unlocked });
      }
    }
    entries.sort((a, b) => Number(a.unlocked) - Number(b.unlocked));
    for (const e of entries) this.cards.push(this.buildCard(e.type, e.skinId));

    // 场景 tab 占位文本（默认隐藏）
    this.placeholderText = this.add
      .text(0, 0, '场景商品筹备中\n敬请期待', {
        fontFamily: FONT,
        fontSize: `${px(13)}px`,
        color: COLOR.dim,
        align: 'center',
      })
      .setLetterSpacing(px(13 * 0.15))
      .setOrigin(0.5)
      .setVisible(false);

    this.toast = new Toast(this);
  }

  /** Dev-only：商店顶部加「+100 EC」按钮快速给玩家加能量结晶（仅 import.meta.env.DEV 编译进 prod 会被 DCE）。 */
  private buildDevAddCreditsBtn(): void {
    const w = px(SPACING.xxl + SPACING.xl + SPACING.xs + 2); // = px(86)
    const h = px(SPACING.lg);
    const bg = this.add.graphics();
    const text = this.add
      .text(w / 2, h / 2, 'DEV +100 EC', {
        fontFamily: FONT,
        fontSize: `${px(9)}px`,
        color: COLOR.danger,
        fontStyle: 'bold',
      })
      .setLetterSpacing(px(9 * 0.15))
      .setOrigin(0.5);
    bg.fillStyle(HEX.danger, 0.18)
      .fillRect(0, 0, w, h)
      .lineStyle(px(1), HEX.danger, 0.6)
      .strokeRect(0, 0, w, h);
    const c = this.add.container(0, 0, [bg, text]);
    setRectInteractive(c, w, h, { useHandCursor: true, bgAlign: 'topLeft' });
    c.on('pointerdown', () => {
      sfx.uiClick();
      useMetaStore.getState().addCredits(100);
      this.toast?.show('DEV · 能量结晶 +100', COLOR.danger);
      this.refreshAllCards();
    });
    // 位置在 layout() 阶段定（依赖 viewport 宽）
    c.setData('isDevAddCredits', true);
    this.devAddCreditsContainer = c;
  }

  private buildTabs(): void {
    const tabs: { key: ShopCategory; label: string }[] = [
      { key: 'skins', label: '皮肤' },
      { key: 'scenes', label: '场景' },
    ];
    for (const t of tabs) {
      const bg = this.add.graphics();
      // text color 固定为白，通过 setTint 切 active/inactive，避免 setColor 触发
      // updateText → 同步上传 GL texture（首次 create 时 GL 上下文未稳定会崩）
      const text = this.add
        .text(0, 0, t.label, {
          fontFamily: FONT,
          fontSize: `${px(11)}px`,
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setLetterSpacing(px(11 * 0.2))
        .setOrigin(0.5);
      const container = this.add.container(0, 0, [bg, text]);
      const w = px(SPACING.xxl + SPACING.xxl); // = px(96)
      const h = px(SPACING.lg + SPACING.xs + 2); // = px(30)
      setRectInteractive(container, w, h, { useHandCursor: true, bgAlign: 'topLeft' });
      container.on('pointerdown', () => {
        sfx.uiClick();
        this.setTab(t.key);
      });
      this.tabBtns.push({ key: t.key, label: t.label, container, bg, text });
    }
  }

  private setTab(key: ShopCategory): void {
    this.currentTab = key;
    this.refreshTabs();
    // 显示/隐藏 tab 内容
    for (const card of this.cards) card.container.setVisible(key === 'skins');
    this.placeholderText?.setVisible(key === 'scenes');
  }

  private refreshTabs(): void {
    const w = px(SPACING.xxl + SPACING.xxl); // = px(96)
    const h = px(SPACING.lg + SPACING.xs + 2); // = px(30)
    for (const tab of this.tabBtns) {
      const active = tab.key === this.currentTab;
      tab.bg
        .clear()
        .fillStyle(active ? HEX.primary : HEX.bg, active ? 0.22 : 0.55)
        .fillRect(0, 0, w, h)
        .lineStyle(px(1), active ? HEX.primary : HEX.dim, active ? 0.85 : 0.4)
        .strokeRect(0, 0, w, h);
      // setTint 是 GPU 乘色，不触发 text canvas 重画 → 不会引发 GL texture 时机问题
      tab.text.setTint(active ? HEX.primary : HEX.dim);
    }
  }

  private buildCard(type: TowerType, skinId: string): CardRender {
    const skin = TOWER_REGISTRY[type].skins.find((s) => s.id === skinId);
    if (!skin) throw new Error(`找不到 skin: ${type}/${skinId}`);
    const shape = TOWER_REGISTRY[type].meta.shape;

    const container = this.add.container(0, 0);
    const bg = this.add.graphics();
    container.add(bg);

    // 卡片纵向居中布局：icon 顶 → 名称 → 描述 → 按钮，全部水平居中
    const centerX = px(SPACING.xxl + SPACING.xl + SPACING.xs + 1); // = px(85) cardW=170 的中心
    // icon：有专属 SVG 用其原色，否则 fallback default sprite + tint
    const iconSize = px(SPACING.xxl); // = px(48)
    const { key: skinKey, tint } = resolveTowerSprite(type, 1, skinId);
    const fallbackKey = TEX.tower(type, 1);
    const finalKey = this.textures.exists(skinKey) ? skinKey : fallbackKey;
    const iconShape = addSpriteOrFallback(this, finalKey, 0, 0, iconSize, () =>
      makeFallbackShape(this, shape, skin.battleColor, iconSize),
    );
    iconShape.setPosition(centerX, px(SPACING.lg + SPACING.xs + 2)); // y = px(30)
    if ('setTint' in iconShape && tint !== null && finalKey === fallbackKey) {
      iconShape.setTint(tint);
    }
    container.add(iconShape);

    // 名称 / 描述居中显示，wrap 宽度 156（cardW - 14 双边 padding）
    const textWrap = px(SPACING.xxl * 3 + SPACING.sm + SPACING.xs); // = px(156)
    // y = px(60) = xl + lg + xs
    const nameText = this.add
      .text(centerX, px(SPACING.xl + SPACING.lg + SPACING.xs), skin.displayName, {
        fontFamily: FONT,
        fontSize: `${px(12)}px`,
        color: COLOR.text,
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: textWrap, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 0)
      .setLetterSpacing(px(12 * 0.1));

    let descText: GameObjects.Text | null = null;
    if (skin.description) {
      descText = this.add
        // y = px(80) = xxl + xl
        .text(centerX, px(SPACING.xxl + SPACING.xl), skin.description, {
          fontFamily: FONT,
          fontSize: `${px(9)}px`,
          color: COLOR.dim,
          align: 'center',
          wordWrap: { width: textWrap, useAdvancedWrap: true },
        })
        .setOrigin(0.5, 0)
        .setLetterSpacing(px(9 * 0.1));
      container.add(descText);
    }
    container.add(nameText);

    // tag 标签（右上角醒目小色块），仅 skin.tag 存在时绘制
    if (skin.tag) {
      const tagBg = this.add.graphics();
      const tagText = this.add
        .text(0, 0, skin.tag, {
          fontFamily: FONT,
          fontSize: `${px(9)}px`,
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setLetterSpacing(px(9 * 0.15))
        .setOrigin(0.5, 0.5);
      const padX = px(SPACING.xs + 2); // = px(6)
      const tagH = px(SPACING.md);
      const tagW = tagText.width + padX * 2;
      tagBg
        .fillStyle(HEX.danger, 0.9)
        .fillRect(0, 0, tagW, tagH)
        .lineStyle(px(1), 0xffffff, 0.6)
        .strokeRect(0, 0, tagW, tagH);
      tagText.setPosition(tagW / 2, tagH / 2);
      // tag 容器位置：右上角内嵌 px(6)，距右 cardW(170) - tagW - 6
      const tagContainer = this.add.container(
        px(SPACING.xxl * 3 + SPACING.md + SPACING.sm + 2) - tagW - px(SPACING.xs + 2),
        px(SPACING.xs + 2),
        [tagBg, tagText],
      );
      container.add(tagContainer);
    }

    // 按钮：横跨卡片底部一整行；未解锁 button 内显 crystal icon + 数字，已拥有显灰字
    const actionBg = this.add.graphics();
    const actionIcon = makeCrystalIcon(this, px(SPACING.sm + SPACING.xs));
    const actionLabel = this.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: `${px(11)}px`,
        color: COLOR.text,
        fontStyle: 'bold',
      })
      .setLetterSpacing(px(11 * 0.15))
      .setOrigin(0.5);
    const actionContainer = this.add.container(0, 0, [actionBg, actionIcon, actionLabel]);
    // btnW = px(154), btnH = px(28)
    setRectInteractive(
      actionContainer,
      px(SPACING.xxl * 3 + SPACING.sm + 2),
      px(SPACING.lg + SPACING.xs),
      {
        useHandCursor: true,
        bgAlign: 'topLeft',
      },
    );
    actionContainer.on('pointerdown', () => this.handleCardAction(type, skinId));
    container.add(actionContainer);

    return {
      type,
      skinId,
      container,
      bg,
      iconShape,
      nameText,
      descText,
      actionIcon,
      actionLabel,
      actionBg,
      actionContainer,
    };
  }

  private handleCardAction(type: TowerType, skinId: string): void {
    sfx.uiClick();
    const meta = useMetaStore.getState();
    const unlocked = skinId === 'default' || (meta.unlockedSkins[type] ?? []).includes(skinId);

    // 商店职责：仅解锁。已解锁项无可点（不在此处装备，玩家去战备装备）
    if (unlocked) return;

    const skin = TOWER_REGISTRY[type].skins.find((s) => s.id === skinId);
    if (!skin) return;
    if (meta.credits < skin.cost) {
      this.toast?.show('能量结晶不足', COLOR.danger);
      return;
    }
    const ok = meta.unlockSkin(type, skinId, skin.cost);
    if (ok) {
      this.toast?.show(`已解锁 · -${skin.cost} EC · 去「战备」装备`, COLOR.rewardGold);
      this.refreshAllCards();
    }
  }

  private refreshAllCards(): void {
    for (const card of this.cards) this.drawCard(card);
    this.creditsText.setText(`能量结晶 ${useMetaStore.getState().credits}`);
  }

  private drawCard(card: CardRender): void {
    const meta = useMetaStore.getState();
    const skin = TOWER_REGISTRY[card.type].skins.find((s) => s.id === card.skinId);
    if (!skin) return;

    const isDefault = card.skinId === 'default';
    const unlocked = isDefault || (meta.unlockedSkins[card.type] ?? []).includes(card.skinId);

    const w = px(SPACING.xxl * 3 + SPACING.md + SPACING.sm + 2); // = px(170) cardW
    const h = px(SPACING.xxl * 2 + SPACING.xl + SPACING.sm + 2); // = px(138) cardH
    card.bg
      .clear()
      .fillStyle(HEX.bg, 0.85)
      .fillRect(0, 0, w, h)
      .lineStyle(px(1), HEX.primary, 0.35)
      .strokeRect(0, 0, w, h);

    // 按钮：横跨卡底一行；未解锁 → crystal 图标 + 数字，已拥有 → 灰字
    let label: string;
    let actionColor: number = HEX.primary;
    let actionAlpha = 1;
    let interactive = true;
    let showIcon = false;
    if (unlocked) {
      label = '已拥有';
      actionColor = HEX.textMuted;
      actionAlpha = 0.4;
      interactive = false;
    } else {
      label = `解锁 · ${skin.cost}`;
      showIcon = true;
      const enough = meta.credits >= skin.cost;
      if (!enough) {
        actionColor = HEX.textMuted;
        actionAlpha = 0.4;
        interactive = false;
      }
    }
    const btnW = px(SPACING.xxl * 3 + SPACING.sm + 2); // = px(154)
    const btnH = px(SPACING.lg + SPACING.xs); // = px(28)
    card.actionBg
      .clear()
      .fillStyle(actionColor, 0.18 * actionAlpha)
      .fillRect(0, 0, btnW, btnH)
      .lineStyle(px(1), actionColor, 0.85 * actionAlpha)
      .strokeRect(0, 0, btnW, btnH);
    card.actionLabel.setText(label).setColor(`#${actionColor.toString(16).padStart(6, '0')}`);

    // icon + label 整体居中：先用 label.width 计算总宽，再分配位置
    const iconW = px(SPACING.sm + SPACING.xs - 1); // = px(11)
    const iconGap = px(SPACING.xs + 1); // = px(5) 紧密堆叠 inline icon-text 间距
    const labelW = card.actionLabel.width;
    if (showIcon) {
      const totalW = iconW + iconGap + labelW;
      const startX = (btnW - totalW) / 2;
      card.actionIcon.setVisible(true);
      card.actionIcon.setPosition(startX + iconW / 2, btnH / 2);
      card.actionLabel.setPosition(startX + iconW + iconGap + labelW / 2, btnH / 2);
    } else {
      card.actionIcon.setVisible(false);
      card.actionLabel.setPosition(btnW / 2, btnH / 2);
    }
    if (interactive) card.actionContainer.setInteractive();
    else card.actionContainer.disableInteractive();
  }

  private layout(W: number, H: number): void {
    this.bg.setViewport(W, this.scale.height);

    // header 已自己 layout

    // 能量结晶余额：顶部下方 60px，crystal 图标在文字左侧（vertical center 对齐 text）
    // wx 端 SAFE_TOP 兜住胶囊 + 状态栏；H5 端 SAFE_TOP=0
    // 顶部余额行：x = px(20)/px(34), y = SAFE_TOP + px(74)
    this.creditsIcon.setPosition(
      px(SPACING.md + SPACING.xs),
      SAFE_TOP + px(SPACING.xxl + SPACING.lg + 2),
    );
    this.creditsText.setPosition(
      px(SPACING.lg + SPACING.sm + 2),
      SAFE_TOP + px(SPACING.xxl + SPACING.lg + 2),
    );

    // dev 按钮：右上角紧贴余额行；右距 = px(100)；y = SAFE_TOP + px(64)
    if (this.devAddCreditsContainer) {
      this.devAddCreditsContainer.setPosition(
        W - px(SPACING.xxl + SPACING.xl + SPACING.md + SPACING.xs),
        SAFE_TOP + px(SPACING.xxl + SPACING.md),
      );
    }

    // tab 行：能量结晶下方 38px，居中排
    const tabW = px(SPACING.xxl + SPACING.xxl); // = px(96)
    const tabGap = px(SPACING.sm);
    const totalTabW = tabW * this.tabBtns.length + tabGap * (this.tabBtns.length - 1);
    const tabStartX = Math.max(px(SPACING.sm + SPACING.xs), (W - totalTabW) / 2); // 最小左 padding = px(12)
    const tabY = SAFE_TOP + px(SPACING.xxl + SPACING.xxl + SPACING.sm + SPACING.xs + 2); // = px(110)
    for (let i = 0; i < this.tabBtns.length; i++) {
      const tab = this.tabBtns[i];
      if (!tab) continue;
      tab.container.setPosition(tabStartX + i * (tabW + tabGap), tabY);
      // text 居中（hit area 内）
      tab.text.setPosition(tabW / 2, px(SPACING.lg + SPACING.xs + 2) / 2); // tabH = px(30)
    }

    // 卡片网格：tab 下方
    const cardW = px(SPACING.xxl * 3 + SPACING.md + SPACING.sm + 2); // = px(170)
    const cardH = px(SPACING.xxl * 2 + SPACING.xl + SPACING.sm + 2); // = px(138)
    const gapX = px(SPACING.sm + SPACING.xs); // = px(12)
    const gapY = px(SPACING.sm + 2); // = px(10)
    const cols = 2;
    const gridStartX = Math.max(
      px(SPACING.sm + SPACING.xs),
      (W - (cardW * cols + gapX * (cols - 1))) / 2,
    );
    const gridStartY = SAFE_TOP + px(SPACING.xxl * 3 + SPACING.sm + 2); // = px(154)

    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i];
      if (!card) continue;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gridStartX + col * (cardW + gapX);
      const y = gridStartY + row * (cardH + gapY);
      card.container.setPosition(x, y);
      // action button：横跨卡底（btnW=154, btnH=28），左右各 px(8) padding
      card.actionContainer.setPosition(px(SPACING.sm), cardH - px(SPACING.xl + SPACING.xs));
    }

    // 场景 tab 占位：viewport 中央
    if (this.placeholderText) {
      this.placeholderText.setPosition(W / 2, H / 2);
    }

    // refresh* 链含 setText/setColor，触发 Text 同步上传 GL texture；
    // 首次 create 阶段 GL renderer 的 spectorMetadata 路径会拿到 null，崩。
    // 推迟一帧让 GL ready，subsequent resize 同步 OK
    if (this.firstLayout) {
      this.firstLayout = false;
      this.time.delayedCall(0, () => {
        this.refreshTabs();
        this.refreshAllCards();
      });
    } else {
      this.refreshTabs();
      this.refreshAllCards();
    }
  }
}
