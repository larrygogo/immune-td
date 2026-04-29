import type { Pathogen } from '../entities';
import { PATHOGEN_DEFS } from '../entities';
import type { ProtectedCellInstance } from '../state';

interface PathCoord {
  col: number;
  row: number;
}

interface MovementResult {
  pathogens: Pathogen[];
  coreHits: Array<{ id: string; damage: number }>;
  protectedHits: Array<{ id: string; cellId: string; damage: number }>;
}

export function tickMovement(
  pathogens: readonly Pathogen[],
  fallbackPath: readonly PathCoord[],
  dt: number,
  protectedCells: readonly ProtectedCellInstance[] = [],
  exits: readonly PathCoord[] = [],
): MovementResult {
  const coreHits: Array<{ id: string; damage: number }> = [];
  const protectedHits: Array<{ id: string; cellId: string; damage: number }> = [];

  // 预构建 goal 查询集合。waypoint 路径拼接 entry→waypoint→goal 时，第一段 bfsPath
  // 不避 goal 格，当 waypoint 选在 goal 另一边时最短路径会穿过 exit 格——如果只在
  // 路径最后一格判"到达"，敌人会"路过终点"继续绕到 waypoint 再回来，看起来像没进终点。
  // 改为每推进一格都检查当前格是否 exit/protected，穿过即判定到达。
  const exitKeys = new Set<string>();
  for (const e of exits) exitKeys.add(`${e.col},${e.row}`);
  const protectedByKey = new Map<string, ProtectedCellInstance>();
  for (const pc of protectedCells) protectedByKey.set(`${pc.coord.col},${pc.coord.row}`, pc);

  const updated = pathogens.map((p) => {
    if (!p.alive || p.reachedExit) return p;

    const usePath = p.path.length > 0 ? p.path : fallbackPath;
    const def = PATHOGEN_DEFS[p.type];
    // mac-m1 减速：slowMs > 0 时 speed × 0.5；slowMs 每 tick 减 dt
    const slowFactor = p.slowMs > 0 ? 0.5 : 1;
    const newSlowMs = Math.max(0, p.slowMs - dt);
    const speed = def.speed * p.speedMultiplier * slowFactor;
    const delta = (speed * dt) / 1000; // tiles per tick
    let { pathIndex, progress } = p;
    progress += delta;

    while (progress >= 1) {
      progress -= 1;
      pathIndex += 1;
      const isLast = pathIndex >= usePath.length - 1;
      const cur = usePath[Math.min(pathIndex, usePath.length - 1)];
      const curKey = cur ? `${cur.col},${cur.row}` : '';
      const protectedCell = cur ? protectedByKey.get(curKey) : undefined;
      const isExit = exitKeys.has(curKey);
      // 到达判定：路径末尾 OR 中途穿过 exit/protected 格
      if (isLast || isExit || protectedCell) {
        // fortified modifier：coreDamage ×2（生物膜抗药增强威胁）
        const coreDamage = def.coreDamage * (p.modifiers.includes('fortified') ? 2 : 1);
        if (protectedCell) {
          protectedHits.push({
            id: p.id,
            cellId: `${protectedCell.coord.col}_${protectedCell.coord.row}`,
            damage: coreDamage,
          });
        } else {
          coreHits.push({ id: p.id, damage: coreDamage });
        }
        return {
          ...p,
          pathIndex: Math.min(pathIndex, usePath.length - 1),
          progress: 0,
          reachedExit: true,
        };
      }
    }

    return { ...p, pathIndex, progress, slowMs: newSlowMs };
  });

  return { pathogens: updated, coreHits, protectedHits };
}

export function pathogenPixelPos(
  p: Pathogen,
  fallbackPath: readonly PathCoord[],
  cellSize: number,
): { x: number; y: number } {
  const usePath = p.path.length > 0 ? p.path : fallbackPath;
  const from = usePath[p.pathIndex];
  const to = usePath[Math.min(p.pathIndex + 1, usePath.length - 1)];
  if (!from || !to) return { x: 0, y: 0 };
  const x = (from.col + (to.col - from.col) * p.progress) * cellSize + cellSize / 2 + p.offsetX;
  const y = (from.row + (to.row - from.row) * p.progress) * cellSize + cellSize / 2 + p.offsetY;
  return { x, y };
}

/**
 * 逻辑坐标（不含视觉 offsetX/offsetY）：专供 combat 射程判定使用。
 *
 * 背景：pathogenPixelPos 返回的坐标含 ±14px 视觉抖动，让渲染时多只敌人不重叠。
 * 但若 combat.ts 拿含 offset 的坐标判距离，短射程塔（如粒细胞 range 1.2 格=72px）
 * 边界敌人会因 offset 随机偏远而被误判越界，玩家看到"后侧的怪识别不到"。
 * 用纯 path 中心坐标做逻辑判定，视觉 offset 只归渲染层。
 */
export function pathogenLogicalPos(
  p: Pathogen,
  fallbackPath: readonly PathCoord[],
  cellSize: number,
): { x: number; y: number } {
  const usePath = p.path.length > 0 ? p.path : fallbackPath;
  const from = usePath[p.pathIndex];
  const to = usePath[Math.min(p.pathIndex + 1, usePath.length - 1)];
  if (!from || !to) return { x: 0, y: 0 };
  const x = (from.col + (to.col - from.col) * p.progress) * cellSize + cellSize / 2;
  const y = (from.row + (to.row - from.row) * p.progress) * cellSize + cellSize / 2;
  return { x, y };
}
