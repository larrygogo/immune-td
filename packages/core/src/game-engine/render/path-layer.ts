import type { GameObjects, Scene } from 'phaser';
import { HEX, px } from '../style';
import type { GridLayer } from './grid-layer';

type Coord = { col: number; row: number };

/** 完整一波流光走完一条 path 的时间（ms）。短 path 看起来快、长 path 慢，节奏统一 */
const FLOW_PERIOD_MS = 2400;

interface PathCell {
  col: number;
  row: number;
  /** 该格在 path 中的相对位置 ∈ [0,1)，决定 sin wave 相位偏移 */
  cellPhase: number;
}

/**
 * Fixed-path 模式路径渲染。
 *
 * 设计：
 *  - 路径格 alpha 由 sin wave 沿 path 流动控制，不画任何方向元素（无箭头/线/圆点）。
 *  - 玩家通过"格子依次亮起"的视觉时序自然感知 path 走向。
 *  - 多 path 重叠格取多个 wave 的 max alpha，避免黑洞或叠加过亮。
 *
 * sync 通过 key diff 跳过重建；动态 alpha 每帧 onUpdate 重画。
 */
export class PathLayer {
  private graphics: GameObjects.Graphics;
  private flowAnim: Phaser.Tweens.Tween | null = null;
  /** 全局相位 t ∈ [0,1]，所有格子共享 */
  private phaseState = { t: 0 };
  private scene: Scene;
  private lastKey = '';
  /** path 格列表（多 path 同格按 max alpha 合并，存最小 cellPhase 让最早出现的相位主导） */
  private cells: PathCell[] = [];
  private currentGrid: GridLayer | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
    this.graphics = scene.add.graphics();
    // grid=0, path=1, tower=30：塔在 path 之上
    this.graphics.setDepth(1);
  }

  sync(paths: readonly (readonly Coord[])[], grid: GridLayer): void {
    const key = this.computeKey(paths, grid.cellSize);
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.currentGrid = grid;
    this.rebuildCells(paths);
    this.restartFlow();
  }

  private computeKey(paths: readonly (readonly Coord[])[], cellSize: number): string {
    return `${cellSize}@${paths.map((p) => p.map((c) => `${c.col},${c.row}`).join('|')).join('#')}`;
  }

  private rebuildCells(paths: readonly (readonly Coord[])[]): void {
    // 多 path 重叠格按"最早出现"的 cellPhase 收敛为单条记录，避免双重 wave。
    // 跳过 path 的首/末格（entry/exit）— 它们由 GridLayer 渲染入口/出口高亮，
    // path 流光不应覆盖这两个端点（视觉冲突）。
    const map = new Map<string, PathCell>();
    for (const path of paths) {
      const len = path.length;
      if (len <= 2) continue; // 长度 ≤ 2 时全是端点
      for (let i = 1; i < len - 1; i++) {
        const cell = path[i];
        if (!cell) continue;
        const key = `${cell.col},${cell.row}`;
        // cellPhase 仍按全 path 长度算，让 wave 在端点位置"虚拟存在"，
        // 视觉上波从 entry 流向 exit 但端点不被点亮
        const cellPhase = i / len;
        const existing = map.get(key);
        if (!existing || cellPhase < existing.cellPhase) {
          map.set(key, { col: cell.col, row: cell.row, cellPhase });
        }
      }
    }
    this.cells = Array.from(map.values());
  }

  private restartFlow(): void {
    if (this.flowAnim) {
      this.flowAnim.stop();
      this.flowAnim = null;
    }
    this.phaseState.t = 0;
    this.graphics.clear();
    if (this.cells.length === 0) return;

    this.flowAnim = this.scene.tweens.add({
      targets: this.phaseState,
      t: 1,
      duration: FLOW_PERIOD_MS,
      repeat: -1,
      ease: 'Linear',
      onUpdate: () => this.draw(),
    });
  }

  private draw(): void {
    const g = this.graphics;
    const grid = this.currentGrid;
    g.clear();
    if (!grid || grid.cellSize <= 0) return;

    const size = grid.cellSize;
    const inset = px(2);

    for (const cell of this.cells) {
      // sin wave：以 (cellPhase - t) 为相位，cos 让峰值（亮）沿 path 顺序流动
      const phase = (cell.cellPhase - this.phaseState.t + 1) % 1;
      const wave = (Math.cos(phase * 2 * Math.PI) + 1) / 2; // 0..1
      // 流式效果再弱一档（用户反馈累计）：fill 0.02..0.08，stroke 0.08..0.2
      const fillAlpha = 0.02 + wave * 0.06;
      const strokeAlpha = 0.08 + wave * 0.12;

      const x = grid.offsetX + cell.col * size;
      const y = grid.offsetY + cell.row * size;
      g.fillStyle(HEX.immune, fillAlpha).fillRect(x, y, size, size);
      g.lineStyle(px(1), HEX.immune, strokeAlpha).strokeRect(
        x + inset,
        y + inset,
        size - inset * 2,
        size - inset * 2,
      );
    }
  }

  destroy(): void {
    if (this.flowAnim) this.flowAnim.stop();
    this.flowAnim = null;
    this.graphics.destroy();
  }
}
