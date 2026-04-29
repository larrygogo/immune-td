import type { LevelConfig, LevelMode } from './data/levels';
import { getLevelByMode } from './data/levels';
import { INITIAL_BUILD_MS } from './data/waves';
import type { Bullet, Pathogen, SpawnerState, Tower } from './entities';
import { createSpawner } from './entities';
import type { MapGrid } from './map';
import { ENTRY, EXIT, GRID_SIZE, createMapFromLayout } from './map';
import type { BlockedSpec, EdgeSpec, MapGenConfig } from './map-gen';
import { generateLayout } from './map-gen';
import { type ResearchModifierState, ZERO_MODIFIERS } from './registry/research-modifiers';
import { createRng, randomSeed } from './rng';
import { bfsPathMulti, generateDefaultPath } from './systems/pathfinding';

type Coord = { col: number; row: number };

export type GamePhase = 'build' | 'wave' | 'complete' | 'failed';

export interface StageResult {
  outcome: 'won' | 'lost';
  stars: 0 | 1 | 2 | 3;
  score: number;
  remainingHp: number;
  remainingAtp: number;
  waveReached: number;
}

export interface ProtectedCellInstance {
  coord: { col: number; row: number };
  hp: number;
  maxHp: number;
  name: string;
}

export interface GameState {
  tickCount: number;
  running: boolean;
  paused: boolean;
  speedMultiplier: 1 | 2 | 3;
  levelId: number;
  /** 关卡模式：'normal' = 普通通关，'elite' = 精英版（spawn 全 fortified） */
  mode: LevelMode;
  /** 本局种子（调试用：window.__testHelpers.getSeed()）*/
  seed: number;
  /** RNG 当前状态，每次消耗随机数后回写 */
  rngState: number;
  hp: number;
  atp: number;
  waveIndex: number;
  phase: GamePhase;
  buildPhaseRemainingMs: number;
  totalWaves: number;
  stageResult: StageResult | null;
  towers: Tower[];
  pathogens: Pathogen[];
  /** 放射发射塔（neutrophil）产生的飞行子弹，每 tick 推进位置 + 碰撞检测 */
  bullets: Bullet[];
  spawner: SpawnerState;
  map: MapGrid;
  currentPath: readonly Coord[];
  /**
   * 固定路径模式（路径回退 milestone）：本关所有预设路径列表。
   * - 单入口单出口 → 1 条
   * - 多入口或多出口 → 多条（spawner 按 round-robin 分配）
   * - LevelConfig.path 缺失时 fallback 到 generateDefaultPath
   *
   * A2 阶段 currentPath 仍保留（迁移期间双轨并存），A6 调用方迁完后统一删。
   */
  paths: readonly (readonly Coord[])[];
  /** 路径格快速查询集（"col,row" 字符串）：placement 校验"路径不可建"用 */
  pathCellSet: ReadonlySet<string>;
  blockedCells: readonly Coord[];
  entries: readonly Coord[];
  exits: readonly Coord[];
  protectedCells: ProtectedCellInstance[];
  /**
   * 研究修饰符快照（Phase 5 · BTD6 借鉴）：进局时由调用方（GameScene）从
   * metaStore.unlockedResearch 算出 ZERO_MODIFIERS 之外的差异，传给 createInitialState。
   * 进局后此字段不变（避免局内动态变更引入复杂度），simulator 默认走 ZERO。
   */
  researchModifiers: ResearchModifierState;
}

function computeInitialPath(entries: readonly Coord[], exits: readonly Coord[]): readonly Coord[] {
  const path = bfsPathMulti([], entries, exits, GRID_SIZE);
  if (!path) throw new Error('初始空地图必然可达，BFS 返回 null 说明实现有 bug');
  return path;
}

/**
 * 解析 LevelConfig.path 到统一的 Coord[][] 列表。
 * - 显式单条 Coord[] → [path]
 * - 显式多条 Coord[][] → 原样
 * - 缺失 → 对所有 entry × exit 笛卡尔积调用 generateDefaultPath 生成占位
 *
 * 笛卡尔积上限实践上很小（30 关大多 1×1，少数 2×1 / 1×2），不做去重优化。
 */
function resolvePaths(
  level: LevelConfig,
  entries: readonly Coord[],
  exits: readonly Coord[],
): readonly (readonly Coord[])[] {
  if (level.path && level.path.length > 0) {
    const first = level.path[0];
    if (first !== undefined) {
      if (Array.isArray(first)) {
        return level.path as readonly (readonly Coord[])[];
      }
      return [level.path as readonly Coord[]];
    }
  }
  const paths: (readonly Coord[])[] = [];
  let variantIndex = 0;
  for (const entry of entries) {
    for (const exit of exits) {
      // variantIndex 按 path 顺序递增，让多 path 关 row 段错开（A6.2 视觉去重）
      paths.push(generateDefaultPath(entry, exit, GRID_SIZE, GRID_SIZE, variantIndex));
      variantIndex++;
    }
  }
  return paths;
}

/**
 * pathCellSet 的 key 格式化函数：col,row 字符串。
 * Set<string> 跨进程序列化稳定 + JS Set 的 lookup 比 tuple/object Map 快。
 * actions.placeTower 的命中查询必须用相同格式，否则 false negative。
 */
export function formatCellKey(col: number, row: number): string {
  return `${col},${row}`;
}

function buildPathCellSet(paths: readonly (readonly Coord[])[]): ReadonlySet<string> {
  const set = new Set<string>();
  for (const path of paths) {
    for (const cell of path) {
      set.add(formatCellKey(cell.col, cell.row));
    }
  }
  return set;
}

/**
 * 把 LevelConfig 翻译成 MapGenConfig：
 * - entry / exit 显式配置 → EdgeSpec.explicit（A6 起 fixed-path 模式必填）
 * - blockedCells → BlockedSpec（explicit 列表，不再随机追加）
 * - protectedCells → placement:'explicit'
 *
 * A6 移除了 entryRowRange / exitRowRange / extraBlockedCount / waypointChance
 * 字段，关卡完全确定性，每把同一种子结果一致。
 */
export function levelToMapGenConfig(level: LevelConfig, gridSize: number): MapGenConfig {
  let entriesSpec: EdgeSpec;
  if (level.entry !== undefined) {
    const coords = Array.isArray(level.entry) ? level.entry : [level.entry];
    entriesSpec = { count: coords.length, explicit: coords };
  } else {
    entriesSpec = { count: 1, explicit: [ENTRY] };
  }

  let exitsSpec: EdgeSpec;
  if (level.exit !== undefined) {
    const coords = Array.isArray(level.exit) ? level.exit : [level.exit];
    exitsSpec = { count: coords.length, explicit: coords };
  } else {
    exitsSpec = { count: 1, explicit: [EXIT] };
  }

  const blockedSpec: BlockedSpec = {
    count: 0,
    explicit: level.blockedCells ?? [],
  };

  const config: MapGenConfig = {
    gridSize,
    entries: entriesSpec,
    exits: exitsSpec,
    blocked: blockedSpec,
  };
  if (level.protectedCells && level.protectedCells.length > 0) {
    config.protectedCells = {
      count: level.protectedCells.length,
      hpRange: [1, 1], // 未用（placement=explicit 直接取 hp）
      placement: 'explicit',
      explicit: level.protectedCells.map((pc) => {
        const out: { coord: Coord; hp: number; name: string; description?: string } = {
          coord: pc.coord,
          hp: pc.hp,
          name: pc.name,
        };
        if (pc.description !== undefined) out.description = pc.description;
        return out;
      }),
    };
  }
  return config;
}

export function createInitialState(
  levelId: number,
  overrideSeed?: number,
  modifiers: ResearchModifierState = ZERO_MODIFIERS,
  mode: LevelMode = 'normal',
): GameState {
  const level = getLevelByMode(levelId, mode);
  const seed = overrideSeed ?? randomSeed();
  const rng = createRng(seed);

  const config = levelToMapGenConfig(level, GRID_SIZE);
  const result = generateLayout(config, rng.next);
  if (!result.ok) {
    throw new Error(`关卡 ${levelId} 地图生成失败：${result.reason}`);
  }
  const { entries, exits, blockedCells, protectedCells: genProtected } = result.layout;

  const protectedCells: ProtectedCellInstance[] = genProtected.map((pc) => ({
    coord: pc.coord,
    hp: pc.hp,
    maxHp: pc.hp,
    name: pc.name,
  }));

  const pathGoals: readonly Coord[] = [...exits, ...protectedCells.map((pc) => pc.coord)];
  const paths = resolvePaths(level, entries, exits);
  // A6：取消 opt-in，pathCellSet 始终从 paths 构建。fallback 占位路径也参与
  // placement 校验，让 PathLayer / spawn / placement 在所有关一致启用 fixed-path
  // 模式。
  const pathCellSet = buildPathCellSet(paths);
  return {
    tickCount: 0,
    running: false,
    paused: false,
    speedMultiplier: 1,
    levelId,
    mode,
    seed,
    rngState: rng.getState(),
    hp: level.initialHp,
    atp: level.initialAtp,
    waveIndex: 0,
    phase: 'build',
    buildPhaseRemainingMs: level.initialBuildMs ?? INITIAL_BUILD_MS,
    totalWaves: level.waves.length,
    stageResult: null,
    towers: [],
    pathogens: [],
    bullets: [],
    spawner: createSpawner([], 1000),
    map: createMapFromLayout(entries, exits),
    currentPath: computeInitialPath(entries, pathGoals),
    paths,
    pathCellSet,
    blockedCells,
    entries,
    exits,
    protectedCells,
    researchModifiers: modifiers,
  };
}

export function computeStars(hp: number): 0 | 1 | 2 | 3 {
  if (hp >= 8) return 3;
  if (hp >= 5) return 2;
  if (hp >= 1) return 1;
  return 0;
}

export function computeScore(hp: number, atp: number): number {
  return Math.max(0, hp) * 100 + Math.max(0, atp);
}
