import type { GameObjects, Scene } from 'phaser';
import { HEX, px } from '../style';
import type { GridLayer } from './grid-layer';

const DEFAULT_RING_COLOR = HEX.highlight;

/**
 * 选中塔的呼吸环：tween 循环改 alpha 1 ↔ 0.45，yoyo 800ms。
 * 外层再描一圈淡色，强化"被聚焦"感。
 * 颜色可选（默认 highlight 黄）：M5 辅助塔传 HEX.protected 蓝色以区分功能。
 */
export class SelectionRing {
  private scene: Scene;
  private gfx: GameObjects.Graphics;
  private tween: Phaser.Tweens.Tween | null = null;
  private visible = false;

  constructor(scene: Scene) {
    this.scene = scene;
    this.gfx = scene.add.graphics();
    this.gfx.setVisible(false);
    this.gfx.setAlpha(1);
  }

  show(col: number, row: number, grid: GridLayer, color: number = DEFAULT_RING_COLOR): void {
    const { x, y } = grid.cellToWorld(col, row);
    const r = grid.cellSize * 0.5;
    this.gfx.clear();
    this.gfx.lineStyle(px(2), color, 1).strokeCircle(x, y, r);
    this.gfx.lineStyle(px(1), color, 0.35).strokeCircle(x, y, r + px(4));
    this.gfx.setVisible(true);
    if (!this.visible) {
      this.visible = true;
      this.tween?.stop();
      this.gfx.setAlpha(1);
      this.tween = this.scene.tweens.add({
        targets: this.gfx,
        alpha: 0.45,
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    }
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.tween?.stop();
    this.tween = null;
    this.gfx.setVisible(false);
    this.gfx.setAlpha(1);
  }

  destroy(): void {
    this.tween?.stop();
    this.gfx.destroy();
  }
}
