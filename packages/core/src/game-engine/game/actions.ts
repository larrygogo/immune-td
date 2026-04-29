import { getLevel } from './data/levels';
import type { TargetingPriority, Tower, TowerType } from './entities';
import { TOWER_DEFS, TOWER_LEVELS, createTower } from './entities';
import type { GameEvent } from './events';
import { isEmptyCell } from './map';
import type { NextIdFn, TickResult } from './phases';
import { beginWave } from './phases';
import { createInitialState, formatCellKey } from './state';
import type { GameState } from './state';

/**
 * v4：建造 / 升级 / 拆除在任何活跃阶段（build / wave）都允许，
 * 只在 complete / failed 阶段拒绝。getLevel 仅用于早期教学关分支兼容。
 */
function isEditPhaseAllowed(state: GameState): boolean {
  if (state.phase === 'complete' || state.phase === 'failed') return false;
  return (
    state.phase === 'build' || state.phase === 'wave' || getLevel(state.levelId).isTutorial === true
  );
}

/**
 * 动作执行结果：成功返回新 state + 事件列表；失败返回错误事件类型 + 一个对应事件。
 * 失败时 state 保持不变（调用方不必自己回滚）。
 */
export type ActionError =
  | 'ERROR_NOT_ENOUGH_ATP'
  | 'ERROR_INVALID_PLACEMENT'
  | 'ERROR_BLOCKED_CELL'
  | 'ERROR_ON_PATH'
  | 'ERROR_TOWER_NOT_FOUND';

export type ActionResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: ActionError; state: GameState; events: GameEvent[] };

function fail(state: GameState, error: ActionError): ActionResult {
  return { ok: false, error, state, events: [{ type: error } as GameEvent] };
}

/**
 * 放塔：v4 起任何活跃阶段（build / wave）均允许；其余三层校验
 * （空格 + 未占位 / ATP 够 / BFS 不断路）保持。已 spawn 的病原走 ownPath
 * 不受 currentPath 变更影响；新 spawn 的会用最新路径。
 */
export function placeTower(
  state: GameState,
  col: number,
  row: number,
  towerType: TowerType,
  nextId: NextIdFn,
): ActionResult {
  if (!isEditPhaseAllowed(state)) {
    return fail(state, 'ERROR_INVALID_PLACEMENT');
  }

  const alreadyOccupied = state.towers.some((t) => t.col === col && t.row === row);
  if (!isEmptyCell(state.map, col, row) || alreadyOccupied) {
    return fail(state, 'ERROR_INVALID_PLACEMENT');
  }

  const blocked = state.blockedCells.some((c) => c.col === col && c.row === row);
  if (blocked) {
    return fail(state, 'ERROR_BLOCKED_CELL');
  }

  // 路径回退 milestone：fixed-path 模式硬规则——路径上的格子禁建。
  // 错误优先级：blockedCells > ERROR_ON_PATH > ATP。
  // A6.3 起，path 由 LevelConfig.path 或 generateDefaultPath 预设，塔放置不影响
  // path（pathCellSet 已保护）；不再做 BFS 通路校验，也不再 reroute pathogens。
  if (state.pathCellSet.has(formatCellKey(col, row))) {
    return fail(state, 'ERROR_ON_PATH');
  }

  const def = TOWER_DEFS[towerType];
  if (!def || state.atp < def.cost) {
    return fail(state, 'ERROR_NOT_ENOUGH_ATP');
  }

  const id = nextId('t');
  const tower = createTower(id, towerType, col, row, state.researchModifiers);
  const newTowers = [...state.towers, tower];
  const nextState: GameState = {
    ...state,
    atp: state.atp - def.cost,
    towers: newTowers,
  };
  return {
    ok: true,
    state: nextState,
    events: [{ type: 'TOWER_PLACED', towerId: id, towerType, x: col, y: row }],
  };
}

/**
 * 升级塔：phase='build' / 塔存在 / 未满级 / ATP 够。
 * 扣 ATP + level+1 + totalInvested += cost + TOWER_UPGRADED。
 */
export function upgradeTower(state: GameState, towerId: string): ActionResult {
  if (!isEditPhaseAllowed(state)) {
    return fail(state, 'ERROR_INVALID_PLACEMENT');
  }
  const tower = state.towers.find((t) => t.id === towerId);
  if (!tower) {
    // 旧 engine 直接 return 不发事件；保持同样语义（空事件）
    return { ok: false, error: 'ERROR_INVALID_PLACEMENT', state, events: [] };
  }
  const currentDef = TOWER_LEVELS[tower.type][tower.level - 1];
  if (!currentDef || currentDef.upgradeCost === null) {
    return fail(state, 'ERROR_INVALID_PLACEMENT');
  }
  const cost = currentDef.upgradeCost;
  if (state.atp < cost) {
    return fail(state, 'ERROR_NOT_ENOUGH_ATP');
  }
  const newLevel = (tower.level + 1) as 1 | 2 | 3;
  const nextDef = TOWER_LEVELS[tower.type][newLevel - 1];
  if (!nextDef) {
    return fail(state, 'ERROR_INVALID_PLACEMENT');
  }
  const upgraded: Tower = {
    ...tower,
    level: newLevel,
    totalInvested: tower.totalInvested + cost,
    hp: nextDef.hp,
    maxHp: nextDef.hp,
  };
  const nextState: GameState = {
    ...state,
    atp: state.atp - cost,
    towers: state.towers.map((t) => (t.id === tower.id ? upgraded : t)),
  };
  return {
    ok: true,
    state: nextState,
    events: [{ type: 'TOWER_UPGRADED', towerId: tower.id, newLevel: upgraded.level }],
  };
}

/**
 * 拆塔：build/wave 阶段允许。返还 floor(totalInvested × 0.5) ATP。
 * A6.3 起 fixed-path 模式不再重算 currentPath / reroute pathogens。
 */
export function sellTower(state: GameState, towerId: string): ActionResult {
  if (!isEditPhaseAllowed(state)) {
    return fail(state, 'ERROR_INVALID_PLACEMENT');
  }
  const tower = state.towers.find((t) => t.id === towerId);
  if (!tower) {
    return { ok: false, error: 'ERROR_INVALID_PLACEMENT', state, events: [] };
  }
  const refund = Math.floor(tower.totalInvested * 0.5);
  const remainingTowers = state.towers.filter((t) => t.id !== tower.id);
  const nextState: GameState = {
    ...state,
    atp: state.atp + refund,
    towers: remainingTowers,
  };
  return {
    ok: true,
    state: nextState,
    events: [{ type: 'TOWER_SOLD', towerId: tower.id, refund }],
  };
}

/**
 * 设置单体塔目标优先级（Phase 1 · A）。AoE / helper 塔也允许设但运行时无效果。
 * 与 placeTower / upgradeTower / sellTower 同 phase 校验：build / wave 阶段允许。
 */
export function setTargetingPriority(
  state: GameState,
  towerId: string,
  priority: TargetingPriority,
): ActionResult {
  if (!isEditPhaseAllowed(state)) {
    return fail(state, 'ERROR_INVALID_PLACEMENT');
  }
  const tower = state.towers.find((t) => t.id === towerId);
  if (!tower) {
    return fail(state, 'ERROR_TOWER_NOT_FOUND');
  }
  const next: GameState = {
    ...state,
    towers: state.towers.map((t) => (t.id === towerId ? { ...t, targetingPriority: priority } : t)),
  };
  return {
    ok: true,
    state: next,
    events: [{ type: 'TOWER_PRIORITY_CHANGED', towerId, priority }],
  };
}

/**
 * 开始波次：仅在 phase='build' 时触发 beginWave，跳过倒计时。
 * 其他阶段不改 state 不发事件（与旧 engine 一致）。
 */
export function startWave(state: GameState): TickResult {
  if (state.phase !== 'build') {
    return { state, events: [] };
  }
  return beginWave(state, state.waveIndex);
}

// ---------- 无校验的简单 setter ----------

export function setSpeed(state: GameState, multiplier: 1 | 2 | 3): GameState {
  return { ...state, speedMultiplier: multiplier };
}

export function reset(state: GameState): GameState {
  return createInitialState(state.levelId);
}

export function pause(state: GameState): GameState {
  return { ...state, paused: true };
}

export function resume(state: GameState): GameState {
  return { ...state, paused: false };
}

export function start(state: GameState): GameState {
  return { ...state, running: true, paused: false };
}

export function stop(state: GameState): GameState {
  return { ...state, running: false, paused: false };
}
