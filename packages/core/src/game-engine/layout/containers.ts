/**
 * 轻量 Row / Column / Grid 容器（类 flexbox）— **纯 layout 数学层**。
 *
 * 解决痛点：scene layout 函数里手写「累加 currentX / 算 spacing / 中心居中」算法，
 * 跨 scene 重复且易错。容器把这套排版抽到声明式：传子节点 + spacing + justify/align，
 * setSize 后子节点位置自动算好。
 *
 * **本模块只做 layout 数学计算 + 类型声明**，不依赖 Phaser，可在 jsdom 单测里直接 import。
 * Phaser 容器类（Row / Column / Grid 实例化版本）在 `./phaser-containers.ts` 里定义，
 * 那个文件 import 了 phaser 因此 **不能** 在 unit test 里直接 import（jsdom 无 canvas）。
 *
 * **重要约定**：
 * - 子节点宽 / 高用调用方声明的 `cssWidth` / `cssHeight`（CSS px），容器内部乘 DPR 算 buffer px。
 *   原因：Phaser Container 没有可读 width/height（要 setSize 才有；多数业务 container 也不调），
 *   所以让调用方显式传声明尺寸，避免容器猜尺寸。
 * - 容器对每个子的 `setPosition(left, top)` 表示「子节点的当前 origin 应落在容器内部的 (left, top)」。
 *   多数业务组件（PhaserButton / SectionHeader 等）默认 origin (0, 0) 已自行做内部居中，
 *   这里按子节点 origin (0, 0) 语义工作；如果子用 origin (0.5, 0.5)，调用方需自己处理偏移。
 * - 所有 spacing / padding 参数是 **CSS px**，容器内部统一 `* DPR` 转 buffer px 再 setPosition。
 * - 调用方拿到容器后自己 setPosition 摆到屏幕上（容器自身没有锚点处理，专注内部排版）。
 */
import { DPR } from '../dpr';

/** 主轴对齐（5 种）。 */
export type Justify = 'start' | 'center' | 'end' | 'space-between' | 'space-around';

/** 交叉轴对齐（3 种）。 */
export type Align = 'start' | 'center' | 'end';

/**
 * 容器子节点声明：要排版的「带 setPosition 的对象」 + 它的 CSS 尺寸（声明值）。
 *
 * 故意定义为 minimal interface（只要 setPosition），方便单测用纯对象 mock。
 * 业务里传 Phaser.GameObjects.Container 自然兼容（它有 setPosition）。
 */
export interface ContainerChild {
  container: { setPosition: (x: number, y: number) => unknown };
  /** 子节点声明宽度（CSS px）。 */
  cssWidth: number;
  /** 子节点声明高度（CSS px）。 */
  cssHeight: number;
}

/** 内部 padding 设置（CSS px）。x / y 二者可独立。 */
export interface Padding {
  x?: number;
  y?: number;
}

/** Row / Column 通用构造选项。 */
export interface LineLayoutOptions {
  children: ContainerChild[];
  /** 相邻子节点间距（CSS px），默认 SPACING.sm。 */
  spacing?: number;
  /** 主轴对齐，默认 'start'。 */
  justify?: Justify;
  /** 交叉轴对齐，默认 'center'。 */
  align?: Align;
  /** 容器内 padding（CSS px）。 */
  padding?: Padding;
}

/** Grid 构造选项。 */
export interface GridLayoutOptions {
  children: ContainerChild[];
  /** 列数（>=1）。 */
  columns: number;
  /** 行 / 列间距（CSS px）。x 是列间距，y 是行间距。两者默认 SPACING.sm。 */
  spacing?: { x?: number; y?: number };
  /** 交叉轴（每行内）对齐，默认 'center'。 */
  align?: Align;
  /** 容器内 padding（CSS px）。 */
  padding?: Padding;
}

/** 单个子节点最终在容器内部坐标系的左上角位置（buffer px）。 */
export interface ChildPosition {
  x: number;
  y: number;
}

// ===== 主轴 / 交叉轴排版数学（纯函数，方便单测） =====

/** 主轴排版：返回每个子节点在主轴上的左上角偏移（buffer px）。 */
export function computeMainAxisOffsets(
  childMains: number[],
  containerMain: number,
  spacingPx: number,
  paddingStart: number,
  paddingEnd: number,
  justify: Justify,
): number[] {
  const n = childMains.length;
  if (n === 0) return [];

  const inner = containerMain - paddingStart - paddingEnd;
  const totalChildren = childMains.reduce((s, v) => s + v, 0);

  switch (justify) {
    case 'start': {
      const result: number[] = [];
      let cursor = paddingStart;
      for (let i = 0; i < n; i++) {
        const w = childMains[i] ?? 0;
        result.push(cursor);
        cursor += w + spacingPx;
      }
      return result;
    }
    case 'end': {
      const result: number[] = [];
      const totalGap = (n - 1) * spacingPx;
      let cursor = paddingStart + inner - totalChildren - totalGap;
      for (let i = 0; i < n; i++) {
        const w = childMains[i] ?? 0;
        result.push(cursor);
        cursor += w + spacingPx;
      }
      return result;
    }
    case 'center': {
      const result: number[] = [];
      const totalGap = (n - 1) * spacingPx;
      const totalWidth = totalChildren + totalGap;
      let cursor = paddingStart + (inner - totalWidth) / 2;
      for (let i = 0; i < n; i++) {
        const w = childMains[i] ?? 0;
        result.push(cursor);
        cursor += w + spacingPx;
      }
      return result;
    }
    case 'space-between': {
      // n=1 退化为 start
      if (n === 1) {
        return [paddingStart];
      }
      const free = inner - totalChildren;
      const gap = free / (n - 1);
      const result: number[] = [];
      let cursor = paddingStart;
      for (let i = 0; i < n; i++) {
        const w = childMains[i] ?? 0;
        result.push(cursor);
        cursor += w + gap;
      }
      return result;
    }
    case 'space-around': {
      const free = inner - totalChildren;
      const slotGap = free / n; // 每个子节点两侧各分到 slotGap/2
      const result: number[] = [];
      let cursor = paddingStart + slotGap / 2;
      for (let i = 0; i < n; i++) {
        const w = childMains[i] ?? 0;
        result.push(cursor);
        cursor += w + slotGap;
      }
      return result;
    }
  }
}

/** 交叉轴对齐：单个子节点在交叉轴上的左上角偏移（buffer px）。 */
export function computeCrossAxisOffset(
  childCross: number,
  containerCross: number,
  paddingStart: number,
  paddingEnd: number,
  align: Align,
): number {
  const inner = containerCross - paddingStart - paddingEnd;
  switch (align) {
    case 'start':
      return paddingStart;
    case 'center':
      return paddingStart + (inner - childCross) / 2;
    case 'end':
      return paddingStart + inner - childCross;
  }
}

/**
 * Row 的纯排版：根据声明返回每个子节点在容器内部的左上角位置（buffer px）。
 *
 * @param widthPx 容器宽（buffer px）
 * @param heightPx 容器高（buffer px）
 */
export function computeRowLayout(
  children: ReadonlyArray<{ cssWidth: number; cssHeight: number }>,
  widthPx: number,
  heightPx: number,
  opts: { spacing: number; justify: Justify; align: Align; padding: Padding },
): ChildPosition[] {
  const padX = (opts.padding.x ?? 0) * DPR;
  const padY = (opts.padding.y ?? 0) * DPR;
  const spacingPx = opts.spacing * DPR;

  const childMains = children.map((c) => c.cssWidth * DPR);
  const mainOffsets = computeMainAxisOffsets(
    childMains,
    widthPx,
    spacingPx,
    padX,
    padX,
    opts.justify,
  );

  const result: ChildPosition[] = [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!child) continue;
    const left = mainOffsets[i] ?? 0;
    const top = computeCrossAxisOffset(child.cssHeight * DPR, heightPx, padY, padY, opts.align);
    result.push({ x: left, y: top });
  }
  return result;
}

/** Column 的纯排版：主轴 = Y。 */
export function computeColumnLayout(
  children: ReadonlyArray<{ cssWidth: number; cssHeight: number }>,
  widthPx: number,
  heightPx: number,
  opts: { spacing: number; justify: Justify; align: Align; padding: Padding },
): ChildPosition[] {
  const padX = (opts.padding.x ?? 0) * DPR;
  const padY = (opts.padding.y ?? 0) * DPR;
  const spacingPx = opts.spacing * DPR;

  const childMains = children.map((c) => c.cssHeight * DPR);
  const mainOffsets = computeMainAxisOffsets(
    childMains,
    heightPx,
    spacingPx,
    padY,
    padY,
    opts.justify,
  );

  const result: ChildPosition[] = [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!child) continue;
    const top = mainOffsets[i] ?? 0;
    const left = computeCrossAxisOffset(child.cssWidth * DPR, widthPx, padX, padX, opts.align);
    result.push({ x: left, y: top });
  }
  return result;
}

/**
 * Grid 的纯排版：固定列数，row-major 填充。
 *
 * - 列均分：colWidth = (innerW - (cols-1) * spacingX) / cols
 * - 行高 = 该行子节点 max cssHeight × DPR
 * - 每个 cell 内子节点水平居中（按 colWidth 算偏移）+ 垂直按 align 对齐
 * - 余位（最后一行不满）：按 row-major 直接放置在前几列，不重新分布
 */
export function computeGridLayout(
  children: ReadonlyArray<{ cssWidth: number; cssHeight: number }>,
  widthPx: number,
  heightPx: number,
  opts: {
    columns: number;
    spacingX: number;
    spacingY: number;
    align: Align;
    padding: Padding;
  },
): ChildPosition[] {
  const padX = (opts.padding.x ?? 0) * DPR;
  const padY = (opts.padding.y ?? 0) * DPR;
  const sx = opts.spacingX * DPR;
  const sy = opts.spacingY * DPR;
  const cols = Math.max(1, opts.columns);
  // heightPx 当前未参与定位（rows 顺序累加），保留作为 future align/justify 主轴算式用
  void heightPx;

  const innerW = widthPx - padX * 2;
  const colWidth = (innerW - (cols - 1) * sx) / cols;

  // 按行分组
  const rows: Array<Array<{ cssWidth: number; cssHeight: number; idx: number }>> = [];
  for (let i = 0; i < children.length; i += cols) {
    const slice = children.slice(i, i + cols).map((c, j) => ({
      cssWidth: c.cssWidth,
      cssHeight: c.cssHeight,
      idx: i + j,
    }));
    rows.push(slice);
  }
  const rowHeights = rows.map((r) => r.reduce((max, c) => Math.max(max, c.cssHeight * DPR), 0));

  // 把结果按原 children index 顺序回填
  const result: ChildPosition[] = new Array(children.length);
  let cursorY = padY;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const rowH = rowHeights[r] ?? 0;
    for (let c = 0; c < row.length; c++) {
      const child = row[c];
      if (!child) continue;
      const colLeft = padX + c * (colWidth + sx);
      const childW = child.cssWidth * DPR;
      const left = colLeft + (colWidth - childW) / 2;
      const top = cursorY + alignWithin(child.cssHeight * DPR, rowH, opts.align);
      result[child.idx] = { x: left, y: top };
    }
    cursorY += rowH + sy;
  }
  return result;
}

/** 在 cell 内按 align 对齐子节点（计算 cross 轴偏移）。 */
function alignWithin(childSize: number, cellSize: number, align: Align): number {
  switch (align) {
    case 'start':
      return 0;
    case 'center':
      return (cellSize - childSize) / 2;
    case 'end':
      return cellSize - childSize;
  }
}
