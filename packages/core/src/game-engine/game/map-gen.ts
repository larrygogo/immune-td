/**
 * map-gen：统一随机关卡布局生成器。
 * 接收 MapGenConfig（入口/出口/禁建/保护细胞/预置塔/连通性约束），返回确定性 MapLayout。
 * 纯函数：所有随机性经 rng 注入，便于测试与 seed 回放。
 */

import { type CellPoolEntry, type VisualTheme, getCellPool } from './data/cell-pool';
import type { Coord } from './data/levels';
import type { TowerType } from './entities';
import { bfsPathMulti } from './systems/pathfinding';

export type Edge = 'left' | 'right' | 'top' | 'bottom';

export interface EdgeSpec {
  /** 期望点数（与 explicit.length 取最大）*/
  count: number;
  edge?: Edge; // 默认 left（入口）/ right（出口）由调用方传
  rowRange?: readonly [number, number]; // left/right 边用
  colRange?: readonly [number, number]; // top/bottom 边用
  minGap?: number; // 多个点彼此在同一边上的最小间距（默认 2）
  /** 显式坐标：存在时跳过随机，直接使用这些坐标（可为空数组，表示无入口/出口） */
  explicit?: readonly Coord[];
}

export interface BlockedSpec {
  /** 随机追加的禁建格数量（不含 explicit） */
  count: number;
  avoidBorder?: boolean; // 默认 true（不靠边，避开 entry/exit 列/行）
  minDistanceFromEntry?: number; // Chebyshev 距离，默认 2
  minDistanceFromExit?: number; // Chebyshev 距离，默认 2
  explicit?: readonly Coord[]; // 固定加入，不参与随机
}

export interface ProtectedExplicit {
  coord: Coord;
  hp: number;
  name: string;
  description?: string;
}

export interface ProtectedSpec {
  count: number;
  hpRange: [number, number];
  theme?: VisualTheme; // 决定命名池
  placement?: 'near-exit' | 'random' | 'explicit';
  explicit?: readonly ProtectedExplicit[];
}

export interface PreplacedTowerSpec {
  type: TowerType;
  level: 1 | 2 | 3;
  coord: Coord;
  owner: 'system' | 'player';
}

export interface ConnectivitySpec {
  /** 每个 entry 至少能到达一个 path goal（exits + protected），默认 true */
  requireAllEntriesReachSomeExit?: boolean;
  /** 生成结果的最短路长度下限，<=0 表示不约束 */
  minPathLength?: number;
}

export interface MapGenConfig {
  gridSize: number;
  entries: EdgeSpec;
  exits: EdgeSpec;
  blocked?: BlockedSpec;
  protectedCells?: ProtectedSpec;
  /** 预置塔：schema 已开放，第一版不消费；保留给研究树 */
  preplacedTowers?: readonly PreplacedTowerSpec[];
  connectivity?: ConnectivitySpec;
}

export interface GeneratedProtected {
  coord: Coord;
  hp: number;
  name: string;
  description?: string;
}

export interface MapLayout {
  gridSize: number;
  entries: readonly Coord[];
  exits: readonly Coord[];
  blockedCells: readonly Coord[];
  protectedCells: readonly GeneratedProtected[];
  preplacedTowers: readonly PreplacedTowerSpec[];
}

export type MapGenFailReason =
  | 'no-goals'
  | 'no-valid-path'
  | 'entry-unreachable'
  | 'path-too-short';

export type MapGenResult =
  | { ok: true; layout: MapLayout }
  | { ok: false; reason: MapGenFailReason };

const DEFAULT_MIN_GAP = 2;
const DEFAULT_BLOCKED_MIN_DIST = 2;

function randIntInternal(rng: () => number, min: number, max: number): number {
  if (max < min) return min;
  return min + Math.floor(rng() * (max - min + 1));
}

function keyOf(c: Coord): string {
  return `${c.col},${c.row}`;
}

function chebyshev(a: Coord, b: Coord): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

function edgeToCoord(edge: Edge, gridSize: number, perp: number): Coord {
  switch (edge) {
    case 'left':
      return { col: 0, row: perp };
    case 'right':
      return { col: gridSize - 1, row: perp };
    case 'top':
      return { col: perp, row: 0 };
    case 'bottom':
      return { col: perp, row: gridSize - 1 };
  }
}

function placeOnEdge(
  spec: EdgeSpec,
  defaultEdge: Edge,
  gridSize: number,
  rng: () => number,
): readonly Coord[] {
  if (spec.explicit !== undefined) return spec.explicit;
  const edge = spec.edge ?? defaultEdge;
  const minGap = spec.minGap ?? DEFAULT_MIN_GAP;
  const perpMax = gridSize - 1;

  const horizontalEdge = edge === 'left' || edge === 'right';
  const [rawMin, rawMax] = horizontalEdge
    ? (spec.rowRange ?? [0, perpMax])
    : (spec.colRange ?? [0, perpMax]);
  const min = Math.max(0, Math.min(rawMin, rawMax));
  const max = Math.min(perpMax, Math.max(rawMin, rawMax));

  const picked: number[] = [];
  // 先用 minGap 约束随机挑
  let attempts = 0;
  while (picked.length < spec.count && attempts < 500) {
    attempts++;
    const p = randIntInternal(rng, min, max);
    if (picked.some((q) => Math.abs(q - p) < minGap)) continue;
    picked.push(p);
  }
  // 退化：range 太窄凑不齐 → 放宽到任何未选点（仅保证唯一）
  if (picked.length < spec.count) {
    for (let p = min; p <= max && picked.length < spec.count; p++) {
      if (!picked.includes(p)) picked.push(p);
    }
  }
  return picked.slice(0, spec.count).map((p) => edgeToCoord(edge, gridSize, p));
}

function placeBlocked(
  spec: BlockedSpec,
  gridSize: number,
  entries: readonly Coord[],
  exits: readonly Coord[],
  pathGoals: readonly Coord[],
  terrainBase: readonly Coord[],
  rng: () => number,
): readonly Coord[] {
  // terrainBase：已纳入地形阻挡的 explicit 禁建（不含保护细胞坐标）
  const result: Coord[] = [...terrainBase];
  const seen = new Set<string>(result.map(keyOf));
  const goalKeys = new Set<string>(pathGoals.map(keyOf));

  const minDistEntry = spec.minDistanceFromEntry ?? DEFAULT_BLOCKED_MIN_DIST;
  const minDistExit = spec.minDistanceFromExit ?? DEFAULT_BLOCKED_MIN_DIST;
  const avoidBorder = spec.avoidBorder ?? true;
  const lo = avoidBorder ? 1 : 0;
  const hi = avoidBorder ? gridSize - 2 : gridSize - 1;

  let added = 0;
  let attempts = 0;
  while (added < spec.count && attempts < 400) {
    attempts++;
    const col = randIntInternal(rng, lo, hi);
    const row = randIntInternal(rng, lo, hi);
    const candidate: Coord = { col, row };
    const ck = keyOf(candidate);
    if (seen.has(ck)) continue;
    if (goalKeys.has(ck)) continue; // 不能堵路径终点
    if (entries.some((e) => chebyshev(candidate, e) < minDistEntry)) continue;
    if (exits.some((e) => chebyshev(candidate, e) < minDistExit)) continue;
    const testBlocked = [...result, candidate];
    const pathOk = entries.every(
      (entry) => bfsPathMulti(testBlocked, [entry], pathGoals, gridSize) !== null,
    );
    if (!pathOk) continue;
    result.push(candidate);
    seen.add(ck);
    added++;
  }
  return result;
}

function shuffle<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }
}

function placeProtected(
  spec: ProtectedSpec,
  gridSize: number,
  entries: readonly Coord[],
  exits: readonly Coord[],
  baseBlocked: readonly Coord[],
  rng: () => number,
): readonly GeneratedProtected[] {
  if (spec.placement === 'explicit' && spec.explicit) {
    return spec.explicit.map((e) => {
      const out: GeneratedProtected = { coord: e.coord, hp: e.hp, name: e.name };
      if (e.description !== undefined) out.description = e.description;
      return out;
    });
  }
  const pool = getCellPool(spec.theme ?? 'generic');
  if (pool.length === 0) return [];

  const seen = new Set<string>([
    ...entries.map(keyOf),
    ...exits.map(keyOf),
    ...baseBlocked.map(keyOf),
  ]);

  const candidates: Coord[] = [];
  if (spec.placement === 'near-exit' && exits.length > 0) {
    for (const ex of exits) {
      for (let dc = -2; dc <= 2; dc++) {
        for (let dr = -2; dr <= 2; dr++) {
          const col = ex.col + dc;
          const row = ex.row + dr;
          if (col <= 0 || col >= gridSize - 1) continue;
          if (row < 0 || row >= gridSize) continue;
          candidates.push({ col, row });
        }
      }
    }
  } else {
    for (let row = 1; row < gridSize - 1; row++) {
      for (let col = 1; col < gridSize - 1; col++) {
        candidates.push({ col, row });
      }
    }
  }
  shuffle(candidates, rng);

  const [hpMin, hpMax] = spec.hpRange;
  const result: GeneratedProtected[] = [];
  let poolIdx = Math.floor(rng() * pool.length);
  for (const c of candidates) {
    if (result.length >= spec.count) break;
    if (seen.has(keyOf(c))) continue;
    const entry = pool[poolIdx % pool.length] as CellPoolEntry;
    poolIdx++;
    const hp = randIntInternal(rng, hpMin, hpMax);
    const gen: GeneratedProtected = { coord: c, hp, name: entry.name };
    if (entry.description !== undefined) gen.description = entry.description;
    result.push(gen);
    seen.add(keyOf(c));
  }
  return result;
}

export function generateLayout(config: MapGenConfig, rng: () => number): MapGenResult {
  const { gridSize } = config;

  const entries = placeOnEdge(config.entries, 'left', gridSize, rng);
  const exits = placeOnEdge(config.exits, 'right', gridSize, rng);

  const explicitBlocked = config.blocked?.explicit ?? [];

  const protectedCells = config.protectedCells
    ? placeProtected(config.protectedCells, gridSize, entries, exits, explicitBlocked, rng)
    : [];

  const protectedKeys = new Set<string>(protectedCells.map((pc) => keyOf(pc.coord)));

  // 地形阻挡：不含保护细胞坐标（保护细胞是路径目的地，BFS 必须能到）
  // 若 explicit 误把保护细胞坐标当禁建传入，这里过滤掉，保证通路
  const terrainBase: Coord[] = explicitBlocked.filter((c) => !protectedKeys.has(keyOf(c)));

  const pathGoals: readonly Coord[] = [...exits, ...protectedCells.map((pc) => pc.coord)];
  if (pathGoals.length === 0) {
    return { ok: false, reason: 'no-goals' };
  }

  // 初始通路验证（只用地形阻挡，保护细胞不视为障碍）
  const baseline = bfsPathMulti(terrainBase, entries, pathGoals, gridSize);
  if (!baseline) {
    return { ok: false, reason: 'no-valid-path' };
  }

  let terrainBlocked: readonly Coord[] = terrainBase;
  if (config.blocked && config.blocked.count > 0) {
    terrainBlocked = placeBlocked(
      config.blocked,
      gridSize,
      entries,
      exits,
      pathGoals,
      terrainBase,
      rng,
    );
  }

  const connectivity = config.connectivity ?? {};
  const requireAllEntries = connectivity.requireAllEntriesReachSomeExit ?? true;
  if (requireAllEntries) {
    for (const entry of entries) {
      const p = bfsPathMulti(terrainBlocked, [entry], pathGoals, gridSize);
      if (!p) return { ok: false, reason: 'entry-unreachable' };
    }
  }
  const minPath = connectivity.minPathLength ?? 0;
  if (minPath > 0) {
    const p = bfsPathMulti(terrainBlocked, entries, pathGoals, gridSize);
    if (!p || p.length < minPath) return { ok: false, reason: 'path-too-short' };
  }

  // 输出 blockedCells：地形 + 保护细胞（保护细胞不可建造）
  const outputBlocked: Coord[] = [...terrainBlocked];
  for (const pc of protectedCells) {
    if (!outputBlocked.some((b) => b.col === pc.coord.col && b.row === pc.coord.row)) {
      outputBlocked.push(pc.coord);
    }
  }

  return {
    ok: true,
    layout: {
      gridSize,
      entries,
      exits,
      blockedCells: outputBlocked,
      protectedCells,
      preplacedTowers: config.preplacedTowers ?? [],
    },
  };
}
