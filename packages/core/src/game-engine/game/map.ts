export type CellType = 'empty' | 'entry' | 'exit';

export interface MapCell {
  col: number;
  row: number;
  type: CellType;
}

// 固定 10 元素元组，配合 noUncheckedIndexedAccess 让索引访问类型安全
type Row10<T> = [T, T, T, T, T, T, T, T, T, T];
export type MapGrid = Row10<Row10<MapCell>>;

export const GRID_SIZE = 10;
export const CELL_SIZE = 60;

export const ENTRY: { readonly col: number; readonly row: number } = { col: 0, row: 4 };
export const EXIT: { readonly col: number; readonly row: number } = { col: 9, row: 2 };

export function createLevel1Map(): MapGrid {
  return createMapFromLayout([ENTRY], [EXIT]);
}

/**
 * 按实际布局构造 MapGrid：将 entries 坐标标 'entry'、exits 标 'exit'、其余 'empty'。
 * 配合 map-gen 的随机布局；placement 校验（isEmptyCell）据此判定格子可用性。
 */
export function createMapFromLayout(
  entries: readonly { col: number; row: number }[],
  exits: readonly { col: number; row: number }[],
): MapGrid {
  const grid = Array.from({ length: GRID_SIZE }, (_, row) =>
    Array.from({ length: GRID_SIZE }, (_, col) => ({
      col,
      row,
      type: 'empty' as CellType,
    })),
  ) as MapGrid;
  for (const e of entries) {
    const cell = grid[e.row]?.[e.col];
    if (cell) cell.type = 'entry';
  }
  for (const x of exits) {
    const cell = grid[x.row]?.[x.col];
    if (cell) cell.type = 'exit';
  }
  return grid;
}

export function isEmptyCell(map: MapGrid, col: number, row: number): boolean {
  if (col < 0 || col >= GRID_SIZE || row < 0 || row >= GRID_SIZE) return false;
  return map[row]?.[col]?.type === 'empty';
}

export function cellToPixel(col: number, row: number): { x: number; y: number } {
  return {
    x: col * CELL_SIZE + CELL_SIZE / 2,
    y: row * CELL_SIZE + CELL_SIZE / 2,
  };
}
