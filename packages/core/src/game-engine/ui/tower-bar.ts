import type { GameObjects, Scene } from 'phaser';
import { sfx } from '@audio/sfx';
import { useMetaStore } from '@ui/store';
import { TEX } from '../asset-keys';
import { TOWER_DEFS, type TowerType } from '../game/entities';
import { TOWER_REGISTRY } from '../game/registry/tower-registry';
import { setRectInteractive } from '../interactive';
import { SAFE_BOTTOM } from '../layout/safe-area';
import { SPACING } from '../layout/spacing';
import { getTowerBattleColor, resolveTowerSprite } from '../render/entity-colors';
import { COLOR, FONT, FONT_MONO, HEX, px } from '../style';

// CSS px 单位的 layout 常量（注释 SPACING 关系，仍保留显式数值以严格对齐原视觉）
// CARD_W = 78 ≈ SPACING.xxl + xl - xs; CARD_H = 74 ≈ SPACING.xxl + lg + xs - xs
// CARD_GAP / BOTTOM_PADDING = SPACING.md - 2; ICON_SIZE = SPACING.xl
const CARD_W = 78;
const CARD_H = 74;
const CARD_GAP = SPACING.md - 2; // = 14
const ICON_SIZE = SPACING.xl; // = 32
const BOTTOM_PADDING = SPACING.md - 2; // = 14
/**
 * 固定槽位数：4（UI 设计约束）。Phase B 加 mitochondria 后总塔数 5 > 4，
 * 玩家需要在 LoadoutScene 主动选择 4 个装备槽位。loadout=[] 时自动取
 * unlocked 前 4 个（顺序按 unlockedTowers 累加序）。
 */
const SLOT_COUNT = 4;

interface SlotState {
  tower: TowerType | null;
  canAfford: boolean;
  enabled: boolean;
  selected: boolean;
  cost: number;
}

interface SlotEntry {
  index: number;
  container: GameObjects.Container;
  bg: GameObjects.Graphics;
  selGlow: GameObjects.Graphics;
  indexText: GameObjects.Text;
  icon: GameObjects.Image | null;
  iconFallback: GameObjects.Graphics | null;
  /** 空槽中央的 "+" 占位（装备态隐藏） */
  placeholderIcon: GameObjects.Text;
  /** 塔名（装备态显示） */
  nameText: GameObjects.Text;
  /** 装备态 cost 数字 */
  costNum: GameObjects.Text;
  /** 装备态 cost 单位 "ATP" */
  costUnit: GameObjects.Text;
  /** 空槽说明文本 "空 槽" */
  emptyHint: GameObjects.Text;
  selectPulseTween: Phaser.Tweens.Tween | null;
  /** 当前装备的塔对应的 iconKey，缓存以避免重复 setTexture */
  currentTextureKey: string | null;
  state: SlotState;
}

/**
 * 底部塔栏：4 个固定槽位（SLOT 1..4），每个槽位可装备一种塔。
 *
 * - 装备态：显示塔 icon + 中文名 + "N ATP"，支持 canAfford / selected / disabled 三态
 * - 空槽态：虚线边 + 中心 "+" + "空 槽" 小字，alpha 0.4，不可交互
 * - 槽左上角始终贴索引 "1" "2" "3" "4"（FONT_MONO 小字，键盘快捷键暗示）
 *
 * 当前：按 metaStore.loadout 顺序装前 N 个塔；若 loadout 空则按 unlocked 顺序。
 * 超过 SLOT_COUNT 的塔不显示（提示玩家需要装备筛选）；不足 SLOT_COUNT 的槽位为空。
 */
export class TowerBar {
  private scene: Scene;
  private slots: SlotEntry[] = [];
  private selected: TowerType | null = null;
  private onSelectCb: (t: TowerType | null) => void;
  private viewportW = 0;
  private viewportH = 0;
  private suppressed = false;
  /** 是否按当前装备的皮肤渲染 sprite（教学关传 false → 始终 default） */
  private applySkin: boolean;

  constructor(scene: Scene, onSelect: (t: TowerType | null) => void, applySkin = true) {
    this.scene = scene;
    this.onSelectCb = onSelect;
    this.applySkin = applySkin;
    for (let i = 0; i < SLOT_COUNT; i++) this.slots.push(this.makeSlot(i));
  }

  private makeSlot(index: number): SlotEntry {
    const w = px(CARD_W);
    const h = px(CARD_H);
    const bg = this.scene.add.graphics();
    const selGlow = this.scene.add.graphics();

    // 左上角槽位索引（1..4）
    const indexText = this.scene.add
      .text(px(4), px(3), String(index + 1), {
        fontFamily: FONT_MONO,
        fontSize: `${px(8)}px`,
        color: COLOR.textXDim,
      })
      .setOrigin(0, 0);

    // 装备态图标：初始无 texture，装备时 setTexture
    const icon = this.scene.add.image(w / 2, px(6) + px(ICON_SIZE) / 2, '__DEFAULT');
    icon.setDisplaySize(px(ICON_SIZE), px(ICON_SIZE));
    icon.setVisible(false);
    // 几何 fallback 圆（sprite 不存在时显示）
    const iconFallback = this.scene.add.graphics();
    iconFallback.setVisible(false);

    // 空槽中央 "+" 占位（textDim 比 XDim 稍亮，避免被背景压住）
    const placeholderIcon = this.scene.add
      .text(w / 2, px(6) + px(ICON_SIZE) / 2, '+', {
        fontFamily: FONT_MONO,
        fontSize: `${px(22)}px`,
        color: COLOR.textDim,
      })
      .setOrigin(0.5, 0.5);

    // 装备态塔名
    const nameText = this.scene.add
      .text(w / 2, px(6) + px(ICON_SIZE) + px(4), '', {
        fontFamily: FONT,
        fontSize: `${px(10)}px`,
        color: COLOR.textWarm,
      })
      .setLetterSpacing(px(10 * 0.05))
      .setOrigin(0.5, 0);

    // 装备态 cost：数字字号加大加粗，"ATP" 单位从灰色改到 immuneDim 同色系
    const costNum = this.scene.add
      .text(0, 0, '', {
        fontFamily: FONT_MONO,
        fontSize: `${px(14)}px`,
        color: COLOR.immune,
        fontStyle: 'bold',
      })
      .setOrigin(1, 1);
    const costUnit = this.scene.add
      .text(0, 0, 'ATP', {
        fontFamily: FONT_MONO,
        fontSize: `${px(9)}px`,
        color: COLOR.immuneDim,
        fontStyle: 'bold',
      })
      .setLetterSpacing(px(9 * 0.15))
      .setOrigin(0, 1);

    // 空槽"空 槽"小字
    const emptyHint = this.scene.add
      .text(w / 2, h - px(10), '空 槽', {
        fontFamily: FONT,
        fontSize: `${px(9)}px`,
        color: COLOR.textDim,
      })
      .setLetterSpacing(px(9 * 0.2))
      .setOrigin(0.5, 1);

    const container = this.scene.add.container(0, 0, [
      bg,
      selGlow,
      indexText,
      icon,
      iconFallback,
      placeholderIcon,
      nameText,
      costNum,
      costUnit,
      emptyHint,
    ]);
    container.setSize(w, h);
    setRectInteractive(container, w, h, { useHandCursor: true, bgAlign: 'topLeft' });
    container.on('pointerdown', () => {
      const slot = this.slots[index];
      if (!slot || slot.state.tower === null) return; // 空槽不响应
      sfx.uiClick();
      const next = this.selected === slot.state.tower ? null : slot.state.tower;
      this.setSelected(next);
    });
    container.on('pointerover', () => {
      const slot = this.slots[index];
      if (!slot || slot.state.tower === null) return;
      this.scene.tweens.killTweensOf(container);
      this.scene.tweens.add({
        targets: container,
        scaleX: 1.02,
        scaleY: 1.02,
        duration: 120,
        ease: 'Quad.out',
      });
    });
    container.on('pointerout', () => {
      this.scene.tweens.killTweensOf(container);
      this.scene.tweens.add({
        targets: container,
        scaleX: 1,
        scaleY: 1,
        duration: 120,
        ease: 'Quad.out',
      });
    });

    return {
      index,
      container,
      bg,
      selGlow,
      indexText,
      icon,
      iconFallback,
      placeholderIcon,
      nameText,
      costNum,
      costUnit,
      emptyHint,
      selectPulseTween: null,
      currentTextureKey: null,
      state: {
        tower: null,
        canAfford: false,
        enabled: false,
        selected: false,
        cost: 0,
      },
    };
  }

  /** 装备指定塔到此槽位（sync 调用时更新 sprite 纹理） */
  private equipSlot(slot: SlotEntry, type: TowerType): void {
    // 解析装备 skin 对应的 texture：教学关 applySkin=false 走 default
    const fallbackKey = TEX.tower(type, 1);
    let targetKey = fallbackKey;
    let tint: number | null = null;
    if (this.applySkin) {
      const equippedId = useMetaStore.getState().equippedSkins[type];
      const r = resolveTowerSprite(type, 1, equippedId);
      targetKey = r.key;
      tint = r.tint;
    }
    const finalKey = this.scene.textures.exists(targetKey) ? targetKey : fallbackKey;
    if (slot.currentTextureKey !== finalKey) {
      slot.currentTextureKey = finalKey;
      if (this.scene.textures.exists(finalKey)) {
        slot.icon?.setTexture(finalKey);
        slot.icon?.setDisplaySize(px(ICON_SIZE), px(ICON_SIZE));
        // 仅 fallback 到 default sprite + 装备 alt 皮肤时才 tint
        if (slot.icon && tint !== null && finalKey === fallbackKey) slot.icon.setTint(tint);
        else slot.icon?.clearTint();
        slot.icon?.setVisible(true);
        slot.iconFallback?.setVisible(false);
      } else if (slot.iconFallback) {
        // fallback 几何圆
        const w = px(CARD_W);
        const color = getTowerBattleColor(type);
        const iconSize = px(ICON_SIZE);
        const cx = w / 2;
        const cy = px(6) + iconSize / 2;
        slot.iconFallback.clear();
        slot.iconFallback
          .fillStyle(color, 0.78)
          .fillCircle(cx, cy, iconSize / 2)
          .lineStyle(px(1.5), color, 1)
          .strokeCircle(cx, cy, iconSize / 2);
        slot.iconFallback.setVisible(true);
        slot.icon?.setVisible(false);
      }
    }
    slot.nameText.text = TOWER_REGISTRY[type].meta.displayName;
  }

  private unequipSlot(slot: SlotEntry): void {
    slot.currentTextureKey = null;
    slot.icon?.setVisible(false);
    slot.iconFallback?.setVisible(false);
  }

  private redraw(slot: SlotEntry): void {
    const w = px(CARD_W);
    const h = px(CARD_H);
    const { tower, canAfford, enabled, selected, cost } = slot.state;

    // ---------- bg ----------
    slot.bg.clear();
    // 外发光半径控制在 CARD_GAP/2 以内，避免叠到相邻槽位
    const MAX_GLOW = px(6);
    if (tower === null) {
      // 空槽：bg-deep 不透明底 + textDim 虚线边（加深到和装备槽 bg 一致
      // 的 0.85，避免被背景血管/粒子透出来干扰）
      slot.bg.fillStyle(HEX.bgDeep, 0.85).fillRect(0, 0, w, h);
      this.drawDashedRect(slot.bg, 0, 0, w, h, HEX.textDim, 0.65, px(3), px(3));
    } else if (selected) {
      // 选中：外发光 + 极淡 immune 底（alpha 0.05 避免压塔 icon 颜色）
      // + 实 immune 边 + 脉动边（selGlow 层）
      for (let i = 3; i >= 1; i--) {
        const r = MAX_GLOW * (i / 3);
        slot.bg.fillStyle(HEX.immune, 0.08 * i).fillRect(-r, -r, w + r * 2, h + r * 2);
      }
      slot.bg
        .fillStyle(HEX.bgDeep, 0.85)
        .fillRect(0, 0, w, h)
        .fillStyle(HEX.immune, 0.05)
        .fillRect(0, 0, w, h)
        .lineStyle(px(1), HEX.immune, 1)
        .strokeRect(0, 0, w, h);
    } else if (!canAfford) {
      slot.bg
        .fillStyle(HEX.bgDeep, 0.85)
        .fillRect(0, 0, w, h)
        .lineStyle(px(1), HEX.danger, 0.3)
        .strokeRect(0, 0, w, h);
    } else if (enabled) {
      // 可购买：微弱外发光（gap 放宽到 14 后可稍放大）
      for (let i = 3; i >= 1; i--) {
        const r = MAX_GLOW * (i / 3);
        slot.bg.fillStyle(HEX.immune, 0.035 * i).fillRect(-r, -r, w + r * 2, h + r * 2);
      }
      slot.bg
        .fillStyle(HEX.bgDeep, 0.85)
        .fillRect(0, 0, w, h)
        .lineStyle(px(1), HEX.immune, 1)
        .strokeRect(0, 0, w, h);
    } else {
      slot.bg
        .fillStyle(HEX.bgDeep, 0.85)
        .fillRect(0, 0, w, h)
        .lineStyle(px(1), HEX.immune, 0.3)
        .strokeRect(0, 0, w, h);
    }

    // ---------- selected 脉动边 ----------
    slot.selGlow.clear();
    if (selected) {
      const c = tower !== null ? getTowerBattleColor(tower) : HEX.immune;
      slot.selGlow.lineStyle(px(1), c, 1).strokeRect(-px(1), -px(1), w + px(2), h + px(2));
      if (!slot.selectPulseTween) {
        slot.selectPulseTween = this.scene.tweens.add({
          targets: slot.selGlow,
          alpha: { from: 1, to: 0.3 },
          duration: 500,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.inOut',
        });
      }
    } else if (slot.selectPulseTween) {
      slot.selectPulseTween.stop();
      slot.selectPulseTween = null;
      slot.selGlow.setAlpha(1);
    }

    // ---------- 空槽 vs 装备态内容切换 ----------
    const equipped = tower !== null;
    slot.placeholderIcon.setVisible(!equipped);
    slot.emptyHint.setVisible(!equipped);
    slot.nameText.setVisible(equipped);
    slot.costNum.setVisible(equipped);
    slot.costUnit.setVisible(equipped);

    if (equipped) {
      const iconAlpha = enabled || selected ? 1 : 0.45;
      if (slot.icon?.visible) slot.icon.setAlpha(iconAlpha);
      if (slot.iconFallback?.visible) slot.iconFallback.setAlpha(iconAlpha);

      slot.nameText.setColor(canAfford ? COLOR.textWarm : COLOR.textDim);
      slot.costNum.text = String(cost);
      const costColor = canAfford ? COLOR.immune : COLOR.danger;
      slot.costNum.setColor(costColor);
      // 同色发光阴影：强化 cost 的存在感（和 HP/ATP 数字一致的视觉语言）
      slot.costNum.setShadow(0, 0, costColor, px(6), true, true);
      slot.costUnit.setColor(canAfford ? COLOR.immuneDim : COLOR.danger);
      const costTotalW = slot.costNum.width + px(2) + slot.costUnit.width;
      const costBottomY = h - px(6);
      slot.costNum.setPosition(w / 2 - costTotalW / 2 + slot.costNum.width, costBottomY);
      slot.costUnit.setPosition(w / 2 - costTotalW / 2 + slot.costNum.width + px(2), costBottomY);

      slot.container.setAlpha(enabled || selected ? 1 : 0.55);
    } else {
      // 空槽整体比装备槽稍淡，但保持可读（0.75 而非 0.45）
      slot.container.setAlpha(0.75);
    }
  }

  /** 在 g 上画一圈虚线矩形边框（graphics 不支持原生 dashed，手画 dash 段） */
  private drawDashedRect(
    g: GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    color: number,
    alpha: number,
    dash: number,
    gap: number,
  ): void {
    g.lineStyle(px(1), color, alpha);
    const perimeterSegs: Array<[number, number, number, number]> = [
      [x, y, x + w, y],
      [x + w, y, x + w, y + h],
      [x + w, y + h, x, y + h],
      [x, y + h, x, y],
    ];
    for (const [x1, y1, x2, y2] of perimeterSegs) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      const ux = dx / len;
      const uy = dy / len;
      let traveled = 0;
      while (traveled < len) {
        const segEnd = Math.min(traveled + dash, len);
        const sx = x1 + ux * traveled;
        const sy = y1 + uy * traveled;
        const ex = x1 + ux * segEnd;
        const ey = y1 + uy * segEnd;
        g.lineBetween(sx, sy, ex, ey);
        traveled = segEnd + gap;
      }
    }
  }

  setSuppressed(v: boolean): void {
    this.suppressed = v;
    if (v) {
      for (const s of this.slots) s.container.setVisible(false);
    } else {
      for (const s of this.slots) s.container.setVisible(true);
    }
  }

  /** 根据 loadout / unlocked 给每个槽位装备塔，多余的塔不显示 */
  sync(atp: number, phase: string, unlocked: readonly TowerType[]): void {
    if (this.suppressed) return;
    const loadout = useMetaStore.getState().loadout;
    const source: readonly TowerType[] =
      loadout.length === 0 ? unlocked : unlocked.filter((t) => loadout.includes(t));
    for (let i = 0; i < SLOT_COUNT; i++) {
      const slot = this.slots[i];
      if (!slot) continue;
      const tower = source[i] ?? null;
      if (tower !== null) {
        this.equipSlot(slot, tower);
        const def = TOWER_DEFS[tower];
        const canAfford = atp >= def.cost;
        // v4：build/wave 阶段都可建造，仅 complete/failed 阶段禁用
        const enabled = canAfford && phase !== 'complete' && phase !== 'failed';
        slot.state = {
          tower,
          canAfford,
          enabled,
          selected: this.selected === tower,
          cost: def.cost,
        };
      } else {
        this.unequipSlot(slot);
        slot.state = {
          tower: null,
          canAfford: false,
          enabled: false,
          selected: false,
          cost: 0,
        };
      }
      slot.container.setVisible(true);
      this.redraw(slot);
    }
    this.layoutAll();
  }

  pulseAll(): void {
    for (const slot of this.slots) {
      if (slot.state.tower === null) continue;
      this.scene.tweens.killTweensOf(slot.container);
      this.scene.tweens.add({
        targets: slot.container,
        scaleX: 1.15,
        scaleY: 1.15,
        duration: 140,
        yoyo: true,
        ease: 'Back.out',
      });
    }
  }

  pulseBossWarning(): void {
    for (const slot of this.slots) {
      if (slot.state.tower === null) continue;
      this.scene.tweens.killTweensOf(slot.container);
      this.scene.tweens.add({
        targets: slot.container,
        scaleX: 1.2,
        scaleY: 1.2,
        alpha: 0.5,
        duration: 180,
        yoyo: true,
        repeat: 2,
        ease: 'Sine.inOut',
        onComplete: () => {
          slot.container.setScale(1).setAlpha(1);
        },
      });
    }
  }

  startTutorialHint(type: TowerType): void {
    for (const slot of this.slots) {
      if (slot.state.tower !== type) continue;
      this.scene.tweens.killTweensOf(slot.container);
      this.scene.tweens.add({
        targets: slot.container,
        scaleX: 1.12,
        scaleY: 1.12,
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    }
  }

  stopTutorialHint(): void {
    for (const slot of this.slots) {
      this.scene.tweens.killTweensOf(slot.container);
      slot.container.setScale(1);
    }
  }

  setSelected(type: TowerType | null): void {
    this.selected = type;
    for (const slot of this.slots) {
      slot.state.selected = slot.state.tower !== null && slot.state.tower === type;
      this.redraw(slot);
    }
    this.onSelectCb(type);
  }

  layout(W: number, H: number): void {
    this.viewportW = W;
    this.viewportH = H;
    this.layoutAll();
  }

  private layoutAll(): void {
    if (!this.viewportW) return;
    const w = px(CARD_W);
    const h = px(CARD_H);
    const totalW = this.slots.length * w + (this.slots.length - 1) * px(CARD_GAP);
    const cardsX = Math.round((this.viewportW - totalW) / 2);
    // wx 端 SAFE_BOTTOM 兜住 home indicator；H5 端 SAFE_BOTTOM=0，行为不变
    const cardsY = this.viewportH - SAFE_BOTTOM - h - px(BOTTOM_PADDING);
    let x = cardsX;
    for (const slot of this.slots) {
      slot.container.setPosition(x, cardsY);
      x += w + px(CARD_GAP);
    }
  }

  destroy(): void {
    for (const slot of this.slots) {
      if (slot.selectPulseTween) slot.selectPulseTween.stop();
      slot.container.destroy(true);
    }
    this.slots = [];
  }
}
