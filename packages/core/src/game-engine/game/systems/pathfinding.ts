interface Coord {
  col: number;
  row: number;
}

/**
 * 生成一条 entry → exit 的折线路径（fixed-path 模式占位用）。
 *
 * 三种 variant 走截然不同的"走廊"，让 multi-path 关卡（entries × exits 笛卡尔积）
 * 中段几乎不重叠（仅 entry/exit 附近 ≤ 2 格不可避免共享）：
 *  - variant 0「中走廊」：S 形（横到对岸 → 折回中行 → 横到 exit）
 *  - variant 1「顶走廊」：纵到顶部 → 横到对岸 → 纵到 exit
 *  - variant 2「底走廊」：纵到底部 → 横到对岸 → 纵到 exit
 *
 * - 相邻两点严格四方向相邻（dx + dy === 1）
 * - 首点 = entry，末点 = exit
 * - 不考虑 blockedCells / protectedCells；占位关随便撞，章节打磨时手写 path 回避
 *
 * 当 LevelConfig.path 缺失时 resolvePaths 调用，按 path 顺序传 variantIndex 0/1/2。
 */
export function generateDefaultPath(
  entry: Coord,
  exit: Coord,
  _gridCols: number,
  gridRows: number,
  variantIndex = 0,
): readonly Coord[] {
  if (entry.col === exit.col && entry.row === exit.row) return [entry];

  const path: Coord[] = [{ col: entry.col, row: entry.row }];
  let col = entry.col;
  let row = entry.row;

  const pushUntil = (targetCol: number, targetRow: number) => {
    while (col !== targetCol) {
      col += targetCol > col ? 1 : -1;
      path.push({ col, row });
    }
    while (row !== targetRow) {
      row += targetRow > row ? 1 : -1;
      path.push({ col, row });
    }
  };

  const variant = variantIndex % 3;

  // L 形折线（保证单 path 不自交）：3 个 variant 走不同折法，让 multi-path
  // 关卡笛卡尔积下中段不重叠（仅 entry/exit 端点共享 1 格不可避免）。
  if (variant === 0) {
    // 先横后折：沿 entry.row 横到 exit.col，再折到 exit.row
    pushUntil(exit.col, entry.row);
    pushUntil(exit.col, exit.row);
  } else if (variant === 1) {
    // 先折后横：沿 entry.col 折到 exit.row，再横到 exit.col
    pushUntil(entry.col, exit.row);
    pushUntil(exit.col, exit.row);
  } else {
    // 绕远侧：折到 turnRow（entry/exit row 远侧）→ 横到 exit.col → 折到 exit.row
    const avgRow = (entry.row + exit.row) / 2;
    const turnRow = avgRow < gridRows / 2 ? gridRows - 1 : 0;
    pushUntil(entry.col, turnRow);
    pushUntil(exit.col, turnRow);
    pushUntil(exit.col, exit.row);
  }

  return path;
}

/**
 * 从 entry 到 exit 的格子级直线路径（类 Bresenham），不考虑任何塔/障碍。
 * 飞行病原体使用此路径——直接穿过迷宫。
 */
export function straightLinePath(entry: Coord, exit: Coord): readonly Coord[] {
  if (entry.col === exit.col && entry.row === exit.row) return [entry];
  const path: Coord[] = [];
  let x = entry.col;
  let y = entry.row;
  const dx = Math.abs(exit.col - x);
  const dy = Math.abs(exit.row - y);
  const sx = x < exit.col ? 1 : -1;
  const sy = y < exit.row ? 1 : -1;
  let err = dx - dy;
  path.push({ col: x, row: y });
  while (x !== exit.col || y !== exit.row) {
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
    path.push({ col: x, row: y });
  }
  return path;
}

const DIRS: readonly [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export function bfsPath(
  towers: readonly Coord[],
  entry: Coord,
  exit: Coord,
  gridSize: number,
): readonly Coord[] | null {
  const blocked = new Set(towers.map((t) => `${t.col},${t.row}`));
  if (blocked.has(`${entry.col},${entry.row}`)) return null;
  if (blocked.has(`${exit.col},${exit.row}`)) return null;

  if (entry.col === exit.col && entry.row === exit.row) return [entry];

  const visited = new Set<string>([`${entry.col},${entry.row}`]);
  const parent = new Map<string, string>();
  const queue: Coord[] = [entry];

  while (queue.length > 0) {
    const cur = queue.shift();
    if (!cur) break;
    for (const [dc, dr] of DIRS) {
      const nc = cur.col + dc;
      const nr = cur.row + dr;
      if (nc < 0 || nc >= gridSize || nr < 0 || nr >= gridSize) continue;
      const key = `${nc},${nr}`;
      if (visited.has(key) || blocked.has(key)) continue;
      visited.add(key);
      parent.set(key, `${cur.col},${cur.row}`);
      if (nc === exit.col && nr === exit.row) {
        return reconstruct(parent, entry, exit);
      }
      queue.push({ col: nc, row: nr });
    }
  }
  return null;
}

/**
 * 多入口 × 多出口寻路（确定性 BFS）。
 * 遍历所有 entry × exit 组合，调用 bfsPath；返回最短路径。
 * 全部不可达返回 null。
 */
export function bfsPathMulti(
  towers: readonly Coord[],
  entries: readonly Coord[],
  exits: readonly Coord[],
  gridSize: number,
): readonly Coord[] | null {
  let best: readonly Coord[] | null = null;
  for (const entry of entries) {
    for (const exit of exits) {
      const path = bfsPath(towers, entry, exit, gridSize);
      if (!path) continue;
      if (!best || path.length < best.length) best = path;
    }
  }
  return best;
}

function reconstruct(parent: Map<string, string>, entry: Coord, exit: Coord): readonly Coord[] {
  const path: Coord[] = [exit];
  let cur = `${exit.col},${exit.row}`;
  const entryKey = `${entry.col},${entry.row}`;
  while (cur !== entryKey) {
    const prev = parent.get(cur);
    if (!prev) break;
    const [cStr, rStr] = prev.split(',');
    if (cStr === undefined || rStr === undefined) break;
    path.push({ col: Number(cStr), row: Number(rStr) });
    cur = prev;
  }
  path.reverse();
  return path;
}
