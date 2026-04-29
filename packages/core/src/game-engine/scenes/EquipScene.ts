import { type GameObjects, Geom, Scene } from 'phaser';
import { bgm } from '@audio/bgm';
import { sfx } from '@audio/sfx';
import { useMetaStore } from '@ui/store';
import { TEX } from '../asset-keys';
import type { TowerType } from '../game/entities';
import { TOWER_REGISTRY } from '../game/registry/tower-registry';
import { setRectInteractive } from '../interactive';
import { SPACING } from '../layout/spacing';
import { resolveTowerSprite } from '../render/entity-colors';
import { SAFE_BOTTOM, SAFE_TOP } from '../safe-area';
import { SceneBackground } from '../scene-bg';
import { fadeInOnEnter, transitionToScene } from '../scene-fx';
import { onSceneResize } from '../scene-resize';
import { COLOR, FONT, HEX, px } from '../style';
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

interface TowerCard {
  type: TowerType;
  container: GameObjects.Container;
  bg: GameObjects.Graphics;
  iconShape: IconResult;
  nameText: GameObjects.Text;
  skinNameText: GameObjects.Text;
}

interface SkinOption {
  type: TowerType;
  skinId: string;
  container: GameObjects.Container;
  bg: GameObjects.Graphics;
  iconShape: IconResult;
  nameText: GameObjects.Text;
}

/**
 * 战备：5 塔紧凑 grid（2 列 × 3 行），点击塔卡弹 modal 切换皮肤。
 * 主页每卡显示该塔当前装备皮肤的 icon + 名；modal 显示已解锁皮肤列表横排。
 */
export class EquipScene extends Scene {
  private bg!: SceneBackground;
  private cards: TowerCard[] = [];
  private toast!: Toast;

  // modal
  private modalDim: GameObjects.Graphics | null = null;
  private modalCard: GameObjects.Graphics | null = null;
  private modalTitle: GameObjects.Text | null = null;
  private modalCloseBtn: GameObjects.Container | null = null;
  private modalOptions: SkinOption[] = [];
  private modalContainer: GameObjects.Container | null = null;
  private modalActiveType: TowerType | null = null;

  constructor() {
    super('EquipScene');
  }

  create(): void {
    this.cards = [];
    this.modalOptions = [];

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
      title: '战备',
    });
    // wx 端 SAFE_TOP 兜住胶囊 + 状态栏；H5 端 SAFE_TOP=0
    header.layout(this.scale.width, SAFE_TOP);

    for (const type of TOWER_ORDER) {
      this.cards.push(this.buildTowerCard(type));
    }

    this.toast = new Toast(this);
  }

  private buildTowerCard(type: TowerType): TowerCard {
    const entry = TOWER_REGISTRY[type];
    const container = this.add.container(0, 0);
    const bg = this.add.graphics();
    container.add(bg);

    // icon：按当前装备 skin 取 sprite key（专属 SVG 优先，否则 default + tint）
    const iconSize = px(SPACING.xxl); // = px(48)
    const equippedId = useMetaStore.getState().equippedSkins[type];
    const { key: skinKey, tint } = resolveTowerSprite(type, 1, equippedId);
    const fallbackKey = TEX.tower(type, 1);
    const finalKey = this.textures.exists(skinKey) ? skinKey : fallbackKey;
    const iconShape = addSpriteOrFallback(this, finalKey, 0, 0, iconSize, () =>
      makeFallbackShape(this, entry.meta.shape, this.getEquippedColor(type), iconSize),
    );
    // icon 中心：cardW=150 中心 px(75)；y 居中略偏上 px(48)
    iconShape.setPosition(px(SPACING.xxl + SPACING.lg + 3), px(SPACING.xxl));
    if ('setTint' in iconShape && tint !== null && finalKey === fallbackKey) {
      iconShape.setTint(tint);
    }
    container.add(iconShape);

    // 塔名（顶部）
    const nameText = this.add
      // 顶部 x = px(75), y = px(8)
      .text(px(SPACING.xxl + SPACING.lg + 3), px(SPACING.sm), entry.meta.displayName, {
        fontFamily: FONT,
        fontSize: `${px(12)}px`,
        color: COLOR.text,
        fontStyle: 'bold',
      })
      .setLetterSpacing(px(12 * 0.15))
      .setOrigin(0.5, 0);
    container.add(nameText);

    // 当前装备 skin 名（底部 dim/金色小字 + 上方分隔线）。base 设白，drawCard 用 setTint
    // 切色（避免 setColor 触发 updateText 重画 → GL texture race）
    const skinNameText = this.add
      // 底部 x = px(75), y = px(92), wrap = px(140)
      .text(
        px(SPACING.xxl + SPACING.lg + 3),
        px(SPACING.xxl + SPACING.xl + SPACING.sm + SPACING.xs),
        '',
        {
          fontFamily: FONT,
          fontSize: `${px(9)}px`,
          color: '#ffffff',
          align: 'center',
          wordWrap: {
            width: px(SPACING.xxl + SPACING.xxl + SPACING.xl + SPACING.sm + SPACING.xs),
            useAdvancedWrap: true,
          },
        },
      )
      .setOrigin(0.5, 0);
    container.add(skinNameText);

    // cardW = px(150), cardH = px(116)
    setRectInteractive(
      container,
      px(SPACING.xxl * 3 + SPACING.xs + 2),
      px(SPACING.xxl * 2 + SPACING.md + SPACING.xs),
      {
        useHandCursor: true,
        bgAlign: 'topLeft',
      },
    );
    container.on('pointerdown', () => this.openModal(type));

    return { type, container, bg, iconShape, nameText, skinNameText };
  }

  private getEquippedColor(type: TowerType): number {
    const entry = TOWER_REGISTRY[type];
    const equippedId = useMetaStore.getState().equippedSkins[type] ?? 'default';
    const skin = entry.skins.find((s) => s.id === equippedId);
    return skin?.battleColor ?? entry.meta.battleColor ?? entry.meta.color;
  }

  /**
   * 同步 icon 到当前装备 skin：
   * - skin 有专属 SVG → setTexture 切到该 sprite，clearTint
   * - skin 无专属 SVG → setTexture 切到 default sprite + setTint(battleColor)
   * - default skin → setTexture 切到 default sprite，clearTint
   *
   * 仅 Image 类型 icon 支持切 texture；fallback 几何 (Graphics) 跳过更新。
   */
  private syncIconToSkin(icon: IconResult, type: TowerType): void {
    if (!('setTexture' in icon)) return; // Graphics fallback：保持初始化时的色，不动
    const equippedId = useMetaStore.getState().equippedSkins[type];
    const { key: skinKey, tint } = resolveTowerSprite(type, 1, equippedId);
    const fallbackKey = TEX.tower(type, 1);
    const finalKey = this.textures.exists(skinKey) ? skinKey : fallbackKey;
    icon.setTexture(finalKey);
    if (tint !== null && finalKey === fallbackKey) icon.setTint(tint);
    else icon.clearTint();
  }

  private getEquippedName(type: TowerType): string {
    const entry = TOWER_REGISTRY[type];
    const equippedId = useMetaStore.getState().equippedSkins[type] ?? 'default';
    const skin = entry.skins.find((s) => s.id === equippedId);
    return skin?.displayName ?? '默认';
  }

  private refreshAllCards(): void {
    for (const card of this.cards) this.drawCard(card);
  }

  private drawCard(card: TowerCard): void {
    const w = px(SPACING.xxl * 3 + SPACING.xs + 2); // = px(150)
    const h = px(SPACING.xxl * 2 + SPACING.md + SPACING.xs); // = px(116)
    // 装备 alt 皮肤时边框金色高亮，让玩家一眼看到哪几格已换装
    const equippedId = useMetaStore.getState().equippedSkins[card.type] ?? 'default';
    const isAlt = equippedId !== 'default';
    const borderColor = isAlt ? HEX.rewardGold : HEX.primary;
    const borderAlpha = isAlt ? 0.75 : 0.4;
    const borderWidth = isAlt ? px(1.5) : px(1);
    card.bg
      .clear()
      .fillStyle(HEX.bg, 0.85)
      .fillRect(0, 0, w, h)
      .lineStyle(borderWidth, borderColor, borderAlpha)
      .strokeRect(0, 0, w, h);
    // 分隔线：name + icon 区域 与 skin 名区域
    card.bg
      .lineStyle(px(1), HEX.primary, 0.18)
      .beginPath()
      // 分隔线 x 内嵌 px(14), y = px(82)
      .moveTo(px(SPACING.sm + SPACING.xs + 2), px(SPACING.xl + SPACING.xl + SPACING.md + 2))
      .lineTo(w - px(SPACING.sm + SPACING.xs + 2), px(SPACING.xl + SPACING.xl + SPACING.md + 2))
      .strokePath();

    this.syncIconToSkin(card.iconShape, card.type);
    card.skinNameText.setText(this.getEquippedName(card.type));
    // skin 名色：alt 时金色凸显，default 灰
    card.skinNameText.setTint(isAlt ? HEX.rewardGold : HEX.dim);
  }

  // ---------- Modal ----------

  private openModal(type: TowerType): void {
    sfx.uiClick();
    this.closeModal();
    this.modalActiveType = type;
    const W = this.scale.width;
    const H = this.scale.height;

    // 全屏 dim
    this.modalDim = this.add.graphics().setDepth(800);
    this.modalDim.fillStyle(HEX.black, 0.7).fillRect(0, 0, W, H);
    this.modalDim.setInteractive(new Geom.Rectangle(0, 0, W, H), Geom.Rectangle.Contains);
    this.modalDim.on('pointerdown', () => this.closeModal());

    const cardW = Math.min(W - px(SPACING.xl + SPACING.sm), px(360)); /* px(360) 视觉调校值 */
    const cardH = px(220); /* px(220) 视觉调校值 */
    const cardX = (W - cardW) / 2;
    // wx 端在 [SAFE_TOP, H - SAFE_BOTTOM] 可见高度内居中，避开胶囊 + home indicator
    const cardY = SAFE_TOP + (H - SAFE_TOP - SAFE_BOTTOM - cardH) / 2;

    this.modalCard = this.add.graphics().setDepth(810);
    this.modalCard
      .fillStyle(HEX.bg, 0.96)
      .fillRect(cardX, cardY, cardW, cardH)
      .lineStyle(px(1), HEX.primary, 0.6)
      .strokeRect(cardX, cardY, cardW, cardH);

    // 阻断点击穿透到 dim
    this.modalCard.setInteractive(
      new Geom.Rectangle(cardX, cardY, cardW, cardH),
      Geom.Rectangle.Contains,
    );

    const entry = TOWER_REGISTRY[type];
    this.modalTitle = this.add
      // y = px(18) = md + 2
      .text(W / 2, cardY + px(SPACING.md + 2), `${entry.meta.displayName} · 切换皮肤`, {
        fontFamily: FONT,
        fontSize: `${px(13)}px`,
        color: COLOR.primary,
        fontStyle: 'bold',
      })
      .setLetterSpacing(px(13 * 0.15))
      .setOrigin(0.5, 0)
      .setDepth(820);

    // 关闭按钮（右上角 ✕）
    const closeBg = this.add.graphics();
    const closeText = this.add
      .text(0, 0, '✕', {
        fontFamily: FONT,
        fontSize: `${px(14)}px`,
        color: COLOR.dim,
      })
      .setOrigin(0.5);
    const closeContainer = this.add
      // 右上角内嵌 px(20)
      .container(cardX + cardW - px(SPACING.md + SPACING.xs), cardY + px(SPACING.md + SPACING.xs), [
        closeBg,
        closeText,
      ])
      .setDepth(820);
    // hit area 28×28
    setRectInteractive(closeContainer, px(SPACING.lg + SPACING.xs), px(SPACING.lg + SPACING.xs), {
      useHandCursor: true,
      bgAlign: 'topLeft',
    });
    closeContainer.on('pointerdown', () => this.closeModal());
    this.modalCloseBtn = closeContainer;

    // 已解锁皮肤选项（含 default）
    const meta = useMetaStore.getState();
    const unlockedList = meta.unlockedSkins[type] ?? [];
    const visibleSkins = entry.skins.filter(
      (s) => s.id === 'default' || unlockedList.includes(s.id),
    );

    const optionContainer = this.add.container(0, 0).setDepth(820);
    this.modalContainer = optionContainer;

    const slotW = px(SPACING.xxl * 2 + SPACING.sm + SPACING.xs); // = px(108)
    const slotH = px(SPACING.xxl * 2 + SPACING.lg); // = px(120)
    const gap = px(SPACING.sm + 2); // = px(10)
    const totalW = slotW * visibleSkins.length + gap * (visibleSkins.length - 1);
    const startX = (W - totalW) / 2;
    const startY = cardY + px(SPACING.xl + SPACING.lg + 2); // = px(58)

    this.modalOptions = [];
    for (let i = 0; i < visibleSkins.length; i++) {
      const skin = visibleSkins[i];
      if (!skin) continue;
      const opt = this.buildSkinOption(type, skin.id, slotW, slotH);
      opt.container.setPosition(startX + i * (slotW + gap), startY);
      optionContainer.add(opt.container);
      this.modalOptions.push(opt);
    }

    this.refreshModalOptions();
  }

  private buildSkinOption(type: TowerType, skinId: string, w: number, h: number): SkinOption {
    const skin = TOWER_REGISTRY[type].skins.find((s) => s.id === skinId);
    if (!skin) throw new Error(`找不到 skin: ${type}/${skinId}`);
    const shape = TOWER_REGISTRY[type].meta.shape;

    const container = this.add.container(0, 0);
    const bg = this.add.graphics();
    container.add(bg);

    // modal option：专属 SVG 优先，否则 default + tint
    const iconSize = px(SPACING.xl + SPACING.xs); // = px(36)
    const { key: skinKey, tint } = resolveTowerSprite(type, 1, skinId);
    const fallbackKey = TEX.tower(type, 1);
    const finalKey = this.textures.exists(skinKey) ? skinKey : fallbackKey;
    const iconShape = addSpriteOrFallback(this, finalKey, 0, 0, iconSize, () =>
      makeFallbackShape(this, shape, skin.battleColor, iconSize),
    );
    iconShape.setPosition(w / 2, px(SPACING.xxl)); // = px(48)
    if ('setTint' in iconShape && tint !== null && finalKey === fallbackKey) {
      iconShape.setTint(tint);
    }
    container.add(iconShape);

    const nameText = this.add
      // y = px(80) = xxl + xl
      .text(w / 2, px(SPACING.xxl + SPACING.xl), skin.displayName, {
        fontFamily: FONT,
        fontSize: `${px(10)}px`,
        color: COLOR.dim,
        align: 'center',
        wordWrap: { width: w - px(SPACING.sm), useAdvancedWrap: true },
      })
      .setOrigin(0.5, 0);
    container.add(nameText);

    setRectInteractive(container, w, h, { useHandCursor: true, bgAlign: 'topLeft' });
    container.on('pointerdown', () => this.handleEquip(type, skinId));
    void h;

    return { type, skinId, container, bg, iconShape, nameText };
  }

  private refreshModalOptions(): void {
    const meta = useMetaStore.getState();
    for (const opt of this.modalOptions) {
      const equipped = (meta.equippedSkins[opt.type] ?? 'default') === opt.skinId;
      const w = px(SPACING.xxl * 2 + SPACING.sm + SPACING.xs); // = px(108)
      const h = px(SPACING.xxl * 2 + SPACING.lg); // = px(120)
      opt.bg
        .clear()
        .fillStyle(HEX.bg, 0.85)
        .fillRect(0, 0, w, h)
        .lineStyle(
          equipped ? px(1.6) : px(1),
          equipped ? HEX.rewardGold : HEX.primary,
          equipped ? 0.85 : 0.3,
        )
        .strokeRect(0, 0, w, h);
      opt.nameText.setColor(equipped ? COLOR.rewardGold : COLOR.dim);
    }
  }

  private handleEquip(type: TowerType, skinId: string): void {
    sfx.uiClick();
    const meta = useMetaStore.getState();
    const equipped = (meta.equippedSkins[type] ?? 'default') === skinId;
    if (equipped) return;
    meta.equipSkin(type, skinId);
    this.toast?.show('已装备', COLOR.primary);
    this.refreshModalOptions();
    this.refreshAllCards();
  }

  private closeModal(): void {
    this.modalDim?.destroy();
    this.modalCard?.destroy();
    this.modalTitle?.destroy();
    this.modalCloseBtn?.destroy(true);
    this.modalContainer?.destroy(true);
    this.modalDim = null;
    this.modalCard = null;
    this.modalTitle = null;
    this.modalCloseBtn = null;
    this.modalContainer = null;
    this.modalOptions = [];
    this.modalActiveType = null;
  }

  private layout(W: number, H: number): void {
    this.bg.setViewport(W, H);

    // 5 塔 2 列 × 3 行紧凑 grid（最后一格空）
    const cardW = px(SPACING.xxl * 3 + SPACING.xs + 2); // = px(150)
    const cardH = px(SPACING.xxl * 2 + SPACING.md + SPACING.xs); // = px(116)
    const gapX = px(SPACING.sm + SPACING.xs); // = px(12)
    const gapY = px(SPACING.sm + SPACING.xs); // = px(12)
    const cols = 2;
    const totalW = cardW * cols + gapX * (cols - 1);
    const startX = Math.max(px(SPACING.sm + SPACING.xs), (W - totalW) / 2);
    const startY = SAFE_TOP + px(SPACING.xxl + SPACING.xl); // = px(80)

    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i];
      if (!card) continue;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardW + gapX);
      const y = startY + row * (cardH + gapY);
      card.container.setPosition(x, y);
    }

    this.refreshAllCards();
    void H;
    void this.modalActiveType; // 保留 ref（lint）
  }
}
