import type { GameObjects, Scene } from 'phaser';
import { px } from '../style';
import type { GridLayer } from './grid-layer';

/**
 * 放置时 hover 的射程预览圆圈。淡色填充 + 描边 + alpha 呼吸。
 */
export class RangePreview {
  private scene: Scene;
  private gfx: GameObjects.Graphics;
  private visible = false;
  private breath: Phaser.Tweens.Tween | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
    this.gfx = scene.add.graphics();
  }

  show(col: number, row: number, range: number, color: number, grid: GridLayer): void {
    const { x, y } = grid.cellToWorld(col, row);
    const r = range * grid.cellSize;
    this.gfx.clear();
    this.gfx.fillStyle(color, 0.12).fillCircle(x, y, r);
    this.gfx.lineStyle(px(1), color, 0.35).strokeCircle(x, y, r);
    if (!this.visible) {
      this.visible = true;
      this.gfx.setAlpha(1);
      this.breath?.stop();
      this.breath = this.scene.tweens.add({
        targets: this.gfx,
        alpha: { from: 1, to: 0.55 },
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    }
  }

  hide(): void {
    if (!this.visible) return;
    this.gfx.clear();
    this.gfx.setAlpha(1);
    this.breath?.stop();
    this.breath = null;
    this.visible = false;
  }

  destroy(): void {
    this.breath?.stop();
    this.gfx.destroy();
  }
}
