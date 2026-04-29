import type { GameObjects, Scene } from 'phaser';
import { useMetaStore } from '@ui/store';
import { TEX } from '../asset-keys';
import type { TowerType } from '../game/entities';
import { COLOR, HEX, px } from '../style';
import { resolveTowerSprite } from './entity-colors';
import type { GridLayer } from './grid-layer';

/**
 * 放置预览 Ghost：选中塔种后跟随指针显示真实 sprite + 圆描边。
 * valid 时同色高亮，invalid 时红色描边警告；落在禁建格时显示醒目的红色 tint + "禁建" 文字。
 * 按 type 缓存 Image 对象避免每次重建。
 */
export class PlacementGhost {
  private scene: Scene;
  private container: GameObjects.Container;
  private ring: GameObjects.Graphics;
  private label: GameObjects.Text;
  private images = new Map<TowerType, GameObjects.Image>();
  private currentType: TowerType | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
    this.ring = scene.add.graphics();
    this.label = scene.add.text(0, 0, '禁建', {
      fontFamily: 'monospace',
      fontSize: `${px(11)}px`,
      color: COLOR.hpLow,
      fontStyle: 'bold',
    });
    this.label.setOrigin(0.5, 0.5);
    this.label.setVisible(false);
    this.container = scene.add.container(0, 0, [this.ring, this.label]);
    this.container.setVisible(false);
    this.container.setDepth(150);
  }

  /**
   * 显示 ghost。
   * @param valid 是否合法（其他塔已占 / ATP 不足等综合判断）
   * @param blocked 是否落在禁建格——优先级高于 valid，会触发醒目红色 tint + 文字
   */
  show(
    type: TowerType,
    x: number,
    y: number,
    valid: boolean,
    grid: GridLayer,
    blocked = false,
  ): void {
    this.container.setVisible(true);
    this.container.setPosition(x, y);

    // 隐藏其他塔种的 image
    if (this.currentType !== type) {
      // forEach 而非 for...of map：wx babel _createForOfIteratorHelper 对 Map iterator 报 non-iterable
      this.images.forEach((img, t) => {
        if (t !== type) img.setVisible(false);
      });
      this.currentType = type;
    }

    // 取/建当前 type 的 image；按当前装备 skin 决定 sprite key + 是否需要 tint
    let img = this.images.get(type);
    const spriteSize = grid.cellSize * 0.85;
    const equippedId = useMetaStore.getState().equippedSkins[type];
    const { key: skinKey, tint } = resolveTowerSprite(type, 1, equippedId);
    const fallbackKey = TEX.tower(type, 1);
    const finalKey = this.scene.textures.exists(skinKey) ? skinKey : fallbackKey;
    if (!img && this.scene.textures.exists(finalKey)) {
      img = this.scene.add.image(0, 0, finalKey);
      img.setDisplaySize(spriteSize, spriteSize);
      this.container.add(img);
      this.images.set(type, img);
    } else if (img && img.texture.key !== finalKey) {
      // 装备 skin 切换 → 切 sprite source
      img.setTexture(finalKey);
    }
    if (img) {
      img.setDisplaySize(spriteSize, spriteSize);
      img.setVisible(true);
      if (blocked) {
        img.setAlpha(0.5);
        // blocked 用 setTintFill 让红色覆盖（保留剪影 = "禁止"语义更醒目）
        img.setTintFill(HEX.hpLow);
      } else {
        img.setAlpha(valid ? 0.95 : 0.7);
        // 仅 fallback 到 default sprite 时才 tint（专属 SVG 自带颜色不需要）
        if (tint !== null && finalKey === fallbackKey) img.setTint(tint);
        else img.clearTint();
      }
    }

    // 外圈：valid 状态固定用主色 immune，不跟随塔种色，避免拖选时光环颜色乱跳。
    // blocked / invalid 仍走警示色（红）。
    const r = spriteSize / 2;
    this.ring.clear();
    const ringR = r + px(8);
    if (blocked) {
      this.ring.lineStyle(px(2), HEX.hpLow, 0.9).strokeCircle(0, 0, ringR);
    } else if (valid) {
      this.ring.lineStyle(px(2), HEX.immune, 0.85).strokeCircle(0, 0, ringR);
    } else {
      this.ring.lineStyle(px(1.5), HEX.danger, 0.7).strokeCircle(0, 0, ringR);
    }

    // "禁建" 文字提示：仅 blocked 时显示，定位在 ghost 上方
    if (blocked) {
      this.label.setPosition(0, -ringR - px(8));
      this.label.setVisible(true);
    } else {
      this.label.setVisible(false);
    }
  }

  hide(): void {
    this.container.setVisible(false);
    this.label.setVisible(false);
  }

  destroy(): void {
    this.container.destroy(true);
  }
}
