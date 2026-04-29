/**
 * 游戏运行时派发的所有领域事件。
 * 由纯函数 tick / actions 以返回值形式吐出，不再走 EventBus。
 * 新增事件时只需在此联合类型里加分支。
 */
export type GameEvent =
  | { type: 'TOWER_PLACED'; towerId: string; towerType: string; x: number; y: number }
  | { type: 'TOWER_UPGRADED'; towerId: string; newLevel: number }
  | { type: 'TOWER_SOLD'; towerId: string; refund: number }
  | {
      type: 'TOWER_PRIORITY_CHANGED';
      towerId: string;
      priority: 'first' | 'last' | 'strong' | 'close';
    }
  | {
      type: 'TOWER_FIRED';
      towerId: string;
      towerType: string;
      targetIds: string[];
      originX: number;
      originY: number;
    }
  | { type: 'PATHOGEN_SPAWNED'; pathogenId: string; pathogenType: string; x: number; y: number }
  | { type: 'PATHOGEN_KILLED'; pathogenId: string; atpDropped: number }
  | { type: 'PATHOGEN_REACHED_CORE'; pathogenId: string; damage: number }
  | { type: 'WAVE_STARTED'; waveIndex: number }
  | { type: 'WAVE_ENDED'; waveIndex: number; perfect: boolean }
  | {
      type: 'WAVE_BONUS';
      waveIndex: number;
      base: number; // 50 + waveIndex * 10
      perfect: number; // 0 或 30（HP 满则 30）
      economy: number; // 所有 mitochondria 当级 atpPerWave 累加
      total: number; // base + perfect + economy
    }
  | { type: 'CORE_DAMAGED'; amount: number; remainingHp: number }
  | {
      type: 'TOWER_DAMAGED';
      towerId: string;
      damage: number;
      remainingHp: number;
      sourceIds: string[];
    }
  | { type: 'TOWER_DESTROYED'; towerId: string; col: number; row: number; refund: number }
  | {
      type: 'PROTECTED_CELL_DAMAGED';
      cellId: string;
      remainingHp: number;
      sourceId: string;
    }
  | {
      type: 'PROTECTED_CELL_DESTROYED';
      cellId: string;
      col: number;
      row: number;
      name: string;
    }
  | { type: 'LEVEL_WON'; stars: 1 | 2 | 3 }
  | { type: 'LEVEL_LOST' }
  | { type: 'ERROR_NOT_ENOUGH_ATP' }
  | { type: 'ERROR_INVALID_PLACEMENT' }
  | { type: 'ERROR_BLOCKED_CELL' }
  | { type: 'ERROR_ON_PATH' }
  | { type: 'ERROR_TOWER_NOT_FOUND' };

export type GameEventType = GameEvent['type'];
export type EventOfType<T extends GameEventType> = Extract<GameEvent, { type: T }>;
