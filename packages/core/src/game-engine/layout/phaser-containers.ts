/**
 * Phaser-bound Row / Column / Grid 容器（业务侧入口）。
 *
 * 跟 `./containers.ts` 的关系：
 * - 纯 layout 数学（computeRowLayout / computeColumnLayout / computeGridLayout 等）放 `containers.ts`
 *   ——不依赖 Phaser，可在 jsdom 单测里直接 import 验证排版。
 * - 本文件只做 Phaser GameObjects.Container 的薄包装：构造时 add children、setSize 时调
 *   纯函数算位置 + 写回 child.container.setPosition。
 *
 * 业务代码只需 import 这个文件：
 * ```ts
 * import { Row } from '@engine/layout/phaser-containers';
 * ```
 */
import { GameObjects, type Scene } from 'phaser';
import { DPR } from '../dpr';
import {
  type ContainerChild,
  type GridLayoutOptions,
  type LineLayoutOptions,
  type Padding,
  type Align as _Align,
  type Justify as _Justify,
  computeColumnLayout,
  computeGridLayout,
  computeRowLayout,
} from './containers';
import { SPACING } from './spacing';

/**
 * Row 容器：水平主轴（→），交叉轴垂直。
 *
 * 子节点 `setPosition(left, top)` 表示子节点在 Row 内部坐标系的位置（buffer px）。
 * Row 自身的位置由调用方 `row.setPosition(x, y)` 控制。
 */
export class Row extends GameObjects.Container {
  private readonly opts: Required<LineLayoutOptions>;
  /** 当前容器宽度（buffer px）。setSize 后写。 */
  widthPx = 0;
  /** 当前容器高度（buffer px）。setSize 后写。 */
  heightPx = 0;

  constructor(scene: Scene, opts: LineLayoutOptions) {
    super(scene, 0, 0);
    this.opts = {
      children: opts.children,
      spacing: opts.spacing ?? SPACING.sm,
      justify: opts.justify ?? 'start',
      align: opts.align ?? 'center',
      padding: opts.padding ?? {},
    };
    for (const c of this.opts.children) {
      this.add(c.container as unknown as GameObjects.GameObject);
    }
  }

  /** 设容器目标尺寸（CSS px），自动 layout 子元素。 */
  override setSize(cssW: number, cssH: number): this {
    this.widthPx = cssW * DPR;
    this.heightPx = cssH * DPR;
    super.setSize(this.widthPx, this.heightPx);

    const positions = computeRowLayout(this.opts.children, this.widthPx, this.heightPx, {
      spacing: this.opts.spacing,
      justify: this.opts.justify,
      align: this.opts.align,
      padding: this.opts.padding,
    });
    for (let i = 0; i < this.opts.children.length; i++) {
      const child = this.opts.children[i];
      const pos = positions[i];
      if (!child || !pos) continue;
      child.container.setPosition(pos.x, pos.y);
    }

    return this;
  }
}

/** Column 容器：垂直主轴（↓），交叉轴水平。接口跟 Row 一致，方向旋转 90°。 */
export class Column extends GameObjects.Container {
  private readonly opts: Required<LineLayoutOptions>;
  widthPx = 0;
  heightPx = 0;

  constructor(scene: Scene, opts: LineLayoutOptions) {
    super(scene, 0, 0);
    this.opts = {
      children: opts.children,
      spacing: opts.spacing ?? SPACING.sm,
      justify: opts.justify ?? 'start',
      align: opts.align ?? 'center',
      padding: opts.padding ?? {},
    };
    for (const c of this.opts.children) {
      this.add(c.container as unknown as GameObjects.GameObject);
    }
  }

  override setSize(cssW: number, cssH: number): this {
    this.widthPx = cssW * DPR;
    this.heightPx = cssH * DPR;
    super.setSize(this.widthPx, this.heightPx);

    const positions = computeColumnLayout(this.opts.children, this.widthPx, this.heightPx, {
      spacing: this.opts.spacing,
      justify: this.opts.justify,
      align: this.opts.align,
      padding: this.opts.padding,
    });
    for (let i = 0; i < this.opts.children.length; i++) {
      const child = this.opts.children[i];
      const pos = positions[i];
      if (!child || !pos) continue;
      child.container.setPosition(pos.x, pos.y);
    }

    return this;
  }
}

/**
 * Grid 容器：固定列数，按 row-major 顺序填充。
 *
 * 7 children + columns=3 → 3 行：[0,1,2] / [3,4,5] / [6]（最后一行只有 1 个，按列起点放）。
 */
export class Grid extends GameObjects.Container {
  private readonly children_: ContainerChild[];
  private readonly columns: number;
  private readonly spacingX: number;
  private readonly spacingY: number;
  private readonly padding: Padding;
  private readonly align: _Align;
  widthPx = 0;
  heightPx = 0;

  constructor(scene: Scene, opts: GridLayoutOptions) {
    super(scene, 0, 0);
    this.children_ = opts.children;
    this.columns = Math.max(1, opts.columns);
    this.spacingX = opts.spacing?.x ?? SPACING.sm;
    this.spacingY = opts.spacing?.y ?? SPACING.sm;
    this.padding = opts.padding ?? {};
    this.align = opts.align ?? 'center';
    for (const c of this.children_) {
      this.add(c.container as unknown as GameObjects.GameObject);
    }
  }

  override setSize(cssW: number, cssH: number): this {
    this.widthPx = cssW * DPR;
    this.heightPx = cssH * DPR;
    super.setSize(this.widthPx, this.heightPx);

    const positions = computeGridLayout(this.children_, this.widthPx, this.heightPx, {
      columns: this.columns,
      spacingX: this.spacingX,
      spacingY: this.spacingY,
      align: this.align,
      padding: this.padding,
    });
    for (let i = 0; i < this.children_.length; i++) {
      const child = this.children_[i];
      const pos = positions[i];
      if (!child || !pos) continue;
      child.container.setPosition(pos.x, pos.y);
    }

    return this;
  }
}

// 暴露 _Align / _Justify 别名以便业务侧 import（避免重复 export type）
export type { _Align as Align, _Justify as Justify };
