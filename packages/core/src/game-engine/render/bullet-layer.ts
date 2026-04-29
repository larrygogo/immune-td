import type { GameObjects, Scene } from 'phaser';
import type { Bullet, Tower, TowerType } from '../game/entities';
import { HEX } from '../style';
import { getTowerBattleColor } from './entity-colors';
import type { GridLayer } from './grid-layer';

/**
 * 子弹层：放射塔（neutrophil）发射的子弹飞行视觉。
 * 每帧 clear + redraw，靠 state.bullets 数组驱动。
 * 单颗子弹 = 白色核心 + 塔色外光晕两层（简洁、性能好）。
 */
export class BulletLayer {
  private gfx: GameObjects.Graphics;

  constructor(scene: Scene) {
    this.gfx = scene.add.graphics();
    // 塔 depth=30，pathogen depth=28，子弹放在中间略高，但低于 effects(80) 避免被粒子覆盖
    this.gfx.setDepth(35);
  }

  sync(bullets: readonly Bullet[], towers: readonly Tower[], grid: GridLayer): void {
    this.gfx.clear();
    if (bullets.length === 0) return;

    // owner 塔类型 → 取对应 battleColor；owner 被击毁时兜底 neutrophil
    const typeById = new Map<string, TowerType>();
    for (const t of towers) typeById.set(t.id, t.type);

    const r = grid.cellSize * 0.08;
    for (const b of bullets) {
      const type = typeById.get(b.ownerId) ?? 'neutrophil';
      const color = getTowerBattleColor(type);
      const wx = grid.offsetX + b.col * grid.cellSize;
      const wy = grid.offsetY + b.row * grid.cellSize;
      this.gfx.fillStyle(color, 0.25).fillCircle(wx, wy, r * 2.5);
      this.gfx.fillStyle(color, 0.65).fillCircle(wx, wy, r * 1.6);
      this.gfx.fillStyle(HEX.white, 0.95).fillCircle(wx, wy, r);
    }
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
