import type { GameObjects, Scene } from 'phaser';
import { DPR } from '../dpr';
import { ENTRY, EXIT, GRID_SIZE } from '../game/map';
import type { ProtectedCellInstance } from '../game/state';
import { COLOR, FONT, FONT_MONO, HEX, px } from '../style';

const CELL_BG = HEX.bgDeep;
// 格线改为 immune 极淡（对齐 DESIGN_SYSTEM §6.1：rgba(93,224,181,0.1)），
// 原 gridLine=#0a1a2a 偏蓝暗沉、且缺少"组织"质感
const GRID_LINE = HEX.immune;
const GRID_LINE_ALPHA = 0.08;
const CELL_TERRITORY = HEX.immune; // 每格中心极淡 radial 光晕（cellular territory）
const ENTRY_CELL = HEX.immune; // entry 用 immune 代替暗绿
const EXIT_CELL = HEX.virus; // exit 用 virus（荧光洋红，病原穿出）
const ENTRY_ARROW = HEX.arrowEntry;
const EXIT_ARROW = HEX.arrowExit;
const BLOCKED_COLOR = HEX.hpLow; // 禁建格：HP 危险红（0xff4466）
const PROTECTED_COLOR = HEX.protected; // 保护细胞：浅蓝

type Coord = { col: number; row: number };

/**
 * 10×10 网格底层：画薄线 + 高亮 entry/exit（多入口/多出口循环），并提供格↔世界坐标互转。
 * 世界坐标统一按 world px（= CSS px × DPR）。
 */
export class GridLayer {
  readonly graphics: GameObjects.Graphics;
  private entryGfx: GameObjects.Graphics;
  private exitGfx: GameObjects.Graphics;
  private blockedGfx: GameObjects.Graphics;
  private protectedGfx: GameObjects.Graphics;
  private protectedLabels: GameObjects.Text[] = [];
  /** entry/exit 棋盘外 gate marker 文本（每次 layout 重建） */
  private gateLabels: GameObjects.Text[] = [];
  private gateMarkerGfx: GameObjects.Graphics;
  private scene: Scene;
  private blockedCells: readonly Coord[] = [];
  private entries: readonly Coord[] = [ENTRY];
  private exits: readonly Coord[] = [EXIT];
  private protectedCells: readonly ProtectedCellInstance[] = [];
  /** 每格边长（world px） */
  cellSize = 0;
  /** 网格左上角偏移（world px），用于居中 */
  offsetX = 0;
  offsetY = 0;

  constructor(
    scene: Scene,
    blockedCells: readonly Coord[] = [],
    entries: readonly Coord[] = [ENTRY],
    exits: readonly Coord[] = [EXIT],
    protectedCells: readonly ProtectedCellInstance[] = [],
  ) {
    this.scene = scene;
    this.blockedCells = blockedCells;
    this.entries = entries.length > 0 ? entries : [ENTRY];
    this.exits = exits.length > 0 ? exits : [EXIT];
    this.protectedCells = protectedCells;
    this.graphics = scene.add.graphics();
    // entry/exit 单独 graphics 用于脉动 alpha tween
    this.entryGfx = scene.add.graphics();
    this.exitGfx = scene.add.graphics();
    // 禁建格独立 graphics（静态，跟随 layout 重画）
    this.blockedGfx = scene.add.graphics();
    // 保护细胞独立 graphics + 名字标签数组
    this.protectedGfx = scene.add.graphics();
    // 棋盘外 gate marker：箭头 + INLET/OUTLET 标签，指示入/出口方向
    this.gateMarkerGfx = scene.add.graphics();
    // 出入口慢呼吸（出口比入口更急，象征危险）
    scene.tweens.add({
      targets: this.entryGfx,
      alpha: { from: 0.6, to: 1 },
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
    scene.tweens.add({
      targets: this.exitGfx,
      alpha: { from: 0.55, to: 1 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  /**
   * 按场景尺寸自适应：高度预留 30% 给顶部 HUD / 底部塔栏。
   * CSS px 下取 min(cssW, cssH × 0.7) / 10 得单元边长，再换算回 world px。
   */
  layout(W: number, H: number): void {
    const cssW = W / DPR;
    const cssH = H / DPR;
    const cssCell = Math.floor(Math.min(cssW, cssH * 0.7) / GRID_SIZE);
    this.cellSize = cssCell * DPR;
    const totalW = this.cellSize * GRID_SIZE;
    const totalH = this.cellSize * GRID_SIZE;
    this.offsetX = (W - totalW) / 2;
    this.offsetY = (H - totalH) / 2;
    this.draw();
  }

  /**
   * 重玩 / restart 时用：state.entries/exits/blockedCells/protectedCells 会重新生成，
   * 必须同步到 GridLayer 否则渲染的入口高亮格、禁建格仍是旧的。
   * 调用后需手动触发一次 layout() 重绘（或靠下一次 scene resize）。
   */
  setMapData(
    entries: readonly Coord[],
    exits: readonly Coord[],
    blockedCells: readonly Coord[],
    protectedCells: readonly ProtectedCellInstance[],
  ): void {
    this.entries = entries.length > 0 ? entries : [ENTRY];
    this.exits = exits.length > 0 ? exits : [EXIT];
    this.blockedCells = blockedCells;
    this.protectedCells = protectedCells;
  }

  /** 格子中心 → world px */
  cellToWorld(col: number, row: number): { x: number; y: number } {
    return {
      x: this.offsetX + (col + 0.5) * this.cellSize,
      y: this.offsetY + (row + 0.5) * this.cellSize,
    };
  }

  /** world px → 格子索引；超出返回 null */
  worldToCell(x: number, y: number): { col: number; row: number } | null {
    if (this.cellSize <= 0) return null;
    const col = Math.floor((x - this.offsetX) / this.cellSize);
    const row = Math.floor((y - this.offsetY) / this.cellSize);
    if (col < 0 || col >= GRID_SIZE || row < 0 || row >= GRID_SIZE) return null;
    return { col, row };
  }

  private draw(): void {
    const g = this.graphics;
    g.clear();
    const size = this.cellSize;
    // 每格：深底 + immune 极淡描边 + 中心 radial 光晕（cellular territory）
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const x = this.offsetX + col * size;
        const y = this.offsetY + row * size;
        g.fillStyle(CELL_BG, 1).fillRect(x, y, size, size);
        // cellular territory：3 层同心圆由外到内递增 alpha，近似 CSS 的
        // radial-gradient(immune 0.02 → transparent 70%)
        const cx = x + size / 2;
        const cy = y + size / 2;
        for (let i = 3; i >= 1; i--) {
          const r = (size / 2) * (i / 3) * 0.9;
          g.fillStyle(CELL_TERRITORY, 0.008 * (4 - i)).fillCircle(cx, cy, r);
        }
        g.lineStyle(px(0.5), GRID_LINE, GRID_LINE_ALPHA).strokeRect(
          x + px(0.5),
          y + px(0.5),
          size - px(1),
          size - px(1),
        );
      }
    }

    // entry / exit 染色画在独立 graphics 上以支持 alpha tween 脉动
    const inset = px(1);
    const half = size / 2;

    this.entryGfx.clear();
    for (const e of this.entries) {
      const ep = this.cellToWorld(e.col, e.row);
      // radial：外圈 alpha 0.08 打底 + 3 层同心递增模拟 inner glow
      for (let i = 3; i >= 1; i--) {
        const r = half * (i / 3) * 0.95;
        this.entryGfx.fillStyle(ENTRY_CELL, 0.08 * (4 - i)).fillCircle(ep.x, ep.y, r);
      }
      // cell 边框（immune）
      this.entryGfx
        .lineStyle(px(1), ENTRY_CELL, 0.6)
        .strokeRect(ep.x - half + inset, ep.y - half + inset, size - inset * 2, size - inset * 2);
      // 朝右箭头：cell 中心右半部分画三角形（指向出口方向）
      this.drawRightArrow(this.entryGfx, ep.x, ep.y, ENTRY_ARROW);
    }

    this.exitGfx.clear();
    for (const x of this.exits) {
      const xp = this.cellToWorld(x.col, x.row);
      // exit：radial 红 + inset 红发光（叠 3 层由外到内的 strokeRect alpha）
      for (let i = 3; i >= 1; i--) {
        const r = half * (i / 3) * 0.95;
        this.exitGfx.fillStyle(EXIT_CELL, 0.09 * (4 - i)).fillCircle(xp.x, xp.y, r);
      }
      // inset 多层边框模拟 box-shadow inset 红发光
      for (let i = 0; i < 3; i++) {
        const off = inset + px(i * 0.8);
        this.exitGfx
          .lineStyle(px(1), EXIT_CELL, (3 - i) * 0.15)
          .strokeRect(xp.x - half + off, xp.y - half + off, size - off * 2, size - off * 2);
      }
      // 出口朝右箭头（粉红），表示"病原从此处穿出"
      this.drawRightArrow(this.exitGfx, xp.x, xp.y, EXIT_ARROW);
    }

    // 禁建格视觉：半透明红填充 + 红描边 + 3 条 45° 平行斜线
    this.drawBlockedCells();

    // 保护细胞视觉：浅蓝填充 + 蓝边框 + 中心小圆 + 名字标签
    this.drawProtectedCells();

    // 棋盘外 gate markers：入/出口外侧 ▶ 箭头 + INLET/OUTLET 小字
    this.drawGateMarkers();
  }

  /**
   * 入/出口外侧（棋盘外边缘）画箭头 + 标签，贴近 DESIGN_SYSTEM mockup 的
   * gate-marker 概念。
   * - Entry 在棋盘外侧对应边 12px 处，immune 色
   * - Exit 同位置，virus 色 + 1s 脉动
   * - 根据 entry/exit 所在格边界推断应画在哪一侧（左/右/上/下）
   */
  private drawGateMarkers(): void {
    const g = this.gateMarkerGfx;
    g.clear();
    for (const t of this.gateLabels) t.destroy();
    this.gateLabels = [];

    const offset = px(14); // 箭头尖端离棋盘边缘的距离
    const labelGap = px(3);

    const drawGate = (coord: Coord, color: number, label: string, alpha: number): void => {
      const { x: cx, y: cy } = this.cellToWorld(coord.col, coord.row);
      const half = this.cellSize / 2;
      // 推断 gate 在哪一侧（优先匹配贴边的那一侧）
      let side: 'left' | 'right' | 'top' | 'bottom';
      if (coord.col === 0) side = 'left';
      else if (coord.col === GRID_SIZE - 1) side = 'right';
      else if (coord.row === 0) side = 'top';
      else if (coord.row === GRID_SIZE - 1) side = 'bottom';
      else return; // 非边界格不画

      let arrowCx: number;
      let arrowCy: number;
      let labelX: number;
      let labelY: number;
      let labelOrigin: [number, number];
      // 箭头总是指向棋盘内（从外向内），label 放在箭头外侧
      switch (side) {
        case 'left':
          arrowCx = cx - half - offset;
          arrowCy = cy;
          labelX = arrowCx - labelGap - px(6);
          labelY = arrowCy;
          labelOrigin = [1, 0.5];
          this.drawArrow(g, arrowCx, arrowCy, 'right', color, alpha);
          break;
        case 'right':
          arrowCx = cx + half + offset;
          arrowCy = cy;
          labelX = arrowCx + labelGap + px(6);
          labelY = arrowCy;
          labelOrigin = [0, 0.5];
          this.drawArrow(g, arrowCx, arrowCy, 'right', color, alpha);
          break;
        case 'top':
          arrowCx = cx;
          arrowCy = cy - half - offset;
          labelX = arrowCx;
          labelY = arrowCy - labelGap - px(6);
          labelOrigin = [0.5, 1];
          this.drawArrow(g, arrowCx, arrowCy, 'down', color, alpha);
          break;
        default: // bottom
          arrowCx = cx;
          arrowCy = cy + half + offset;
          labelX = arrowCx;
          labelY = arrowCy + labelGap + px(6);
          labelOrigin = [0.5, 0];
          this.drawArrow(g, arrowCx, arrowCy, 'down', color, alpha);
          break;
      }

      const colorStr = `#${color.toString(16).padStart(6, '0')}`;
      const t = this.scene.add
        .text(labelX, labelY, label, {
          fontFamily: FONT_MONO,
          fontSize: `${px(7)}px`,
          color: colorStr,
          fontStyle: 'bold',
        })
        .setLetterSpacing(px(7 * 0.25))
        .setOrigin(...labelOrigin)
        .setAlpha(alpha);
      this.gateLabels.push(t);
    };

    for (const e of this.entries) drawGate(e, ENTRY_CELL, 'INLET', 0.75);
    for (const x of this.exits) drawGate(x, EXIT_CELL, 'OUTLET', 0.85);
  }

  /**
   * 在 (cx,cy) 画一个粗壮 ▶ 箭头，支持 4 方向。
   * size 按 cellSize 缩放，适配各种分辨率。
   */
  private drawArrow(
    g: GameObjects.Graphics,
    cx: number,
    cy: number,
    dir: 'left' | 'right' | 'up' | 'down',
    color: number,
    alpha: number,
  ): void {
    const size = this.cellSize * 0.24;
    const w = size;
    const h = size * 1.2;
    let p1x: number;
    let p1y: number;
    let p2x: number;
    let p2y: number;
    let p3x: number;
    let p3y: number;
    switch (dir) {
      case 'right':
        p1x = cx + w / 2;
        p1y = cy;
        p2x = cx - w / 2;
        p2y = cy - h / 2;
        p3x = cx - w / 2;
        p3y = cy + h / 2;
        break;
      case 'left':
        p1x = cx - w / 2;
        p1y = cy;
        p2x = cx + w / 2;
        p2y = cy - h / 2;
        p3x = cx + w / 2;
        p3y = cy + h / 2;
        break;
      case 'up':
        p1x = cx;
        p1y = cy - h / 2;
        p2x = cx - w / 2;
        p2y = cy + h / 2;
        p3x = cx + w / 2;
        p3y = cy + h / 2;
        break;
      default: // down
        p1x = cx;
        p1y = cy + h / 2;
        p2x = cx - w / 2;
        p2y = cy - h / 2;
        p3x = cx + w / 2;
        p3y = cy - h / 2;
        break;
    }
    // 发光背板（半透扩大）+ 实心
    g.fillStyle(color, alpha * 0.4).fillTriangle(
      p1x + (p1x - cx) * 0.15,
      p1y + (p1y - cy) * 0.15,
      p2x + (p2x - cx) * 0.15,
      p2y + (p2y - cy) * 0.15,
      p3x + (p3x - cx) * 0.15,
      p3y + (p3y - cy) * 0.15,
    );
    g.fillStyle(color, alpha).fillTriangle(p1x, p1y, p2x, p2y, p3x, p3y);
  }

  /**
   * 以 (cx,cy) 为中心画一个朝右的箭头三角形。
   * 三角形宽度约为 cellSize * 0.4，alpha 0.6 与 cell 染色融合。
   */
  private drawRightArrow(g: GameObjects.Graphics, cx: number, cy: number, color: number): void {
    const size = this.cellSize * 0.28;
    // 顶点：右尖 (cx+size, cy)，左上 (cx-size*0.6, cy-size*0.7)，左下 (cx-size*0.6, cy+size*0.7)
    const tipX = cx + size;
    const tipY = cy;
    const baseX = cx - size * 0.6;
    const baseTopY = cy - size * 0.7;
    const baseBotY = cy + size * 0.7;
    g.fillStyle(color, 0.7).fillTriangle(tipX, tipY, baseX, baseTopY, baseX, baseBotY);
  }

  private drawBlockedCells(): void {
    const g = this.blockedGfx;
    g.clear();
    if (this.blockedCells.length === 0) return;
    const size = this.cellSize;
    const stepCount = 3;
    const step = size / (stepCount + 1);
    for (const { col, row } of this.blockedCells) {
      const x = this.offsetX + col * size;
      const y = this.offsetY + row * size;
      // 半透明红填充
      g.fillStyle(BLOCKED_COLOR, 0.18).fillRect(x, y, size, size);
      // 红色边框
      g.lineStyle(px(2), BLOCKED_COLOR, 0.6).strokeRect(
        x + px(1),
        y + px(1),
        size - px(2),
        size - px(2),
      );
      // 45° 平行斜线（左上→右下方向）：在格子上裁切
      g.lineStyle(px(1), BLOCKED_COLOR, 0.4);
      for (let i = 1; i <= stepCount; i++) {
        const off = step * i;
        // 线段 (x, y+off) → (x+size-off, y+size)
        g.beginPath();
        g.moveTo(x, y + off);
        g.lineTo(x + size - off, y + size);
        g.strokePath();
        // 对称线段 (x+off, y) → (x+size, y+size-off)
        g.beginPath();
        g.moveTo(x + off, y);
        g.lineTo(x + size, y + size - off);
        g.strokePath();
      }
    }
  }

  private drawProtectedCells(): void {
    const g = this.protectedGfx;
    g.clear();
    // 清掉旧标签（cellSize 变化时全部重建）
    for (const t of this.protectedLabels) t.destroy();
    this.protectedLabels = [];
    if (this.protectedCells.length === 0) return;
    const size = this.cellSize;
    for (const pc of this.protectedCells) {
      const { col, row } = pc.coord;
      const x = this.offsetX + col * size;
      const y = this.offsetY + row * size;
      // 半透明蓝填充
      g.fillStyle(PROTECTED_COLOR, 0.18).fillRect(x, y, size, size);
      // 蓝色边框
      g.lineStyle(px(2), PROTECTED_COLOR, 0.7).strokeRect(
        x + px(1),
        y + px(1),
        size - px(2),
        size - px(2),
      );
      // 中心 icon：实心圆
      const cx = x + size / 2;
      const cy = y + size / 2;
      g.fillStyle(PROTECTED_COLOR, 0.85).fillCircle(cx, cy, size * 0.18);
      // 名字标签：cell 下方居中
      const label = this.scene.add
        .text(cx, y + size - px(4), pc.name, {
          fontFamily: FONT,
          fontSize: `${px(9)}px`,
          color: COLOR.dim,
        })
        .setOrigin(0.5, 1);
      this.protectedLabels.push(label);
    }
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.entryGfx);
    this.scene.tweens.killTweensOf(this.exitGfx);
    for (const t of this.protectedLabels) t.destroy();
    this.protectedLabels = [];
    this.graphics.destroy();
    this.entryGfx.destroy();
    this.exitGfx.destroy();
    this.blockedGfx.destroy();
    this.protectedGfx.destroy();
    this.gateMarkerGfx.destroy();
    for (const t of this.gateLabels) t.destroy();
    this.gateLabels = [];
  }
}
