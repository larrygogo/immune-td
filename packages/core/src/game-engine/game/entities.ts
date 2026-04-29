export type TowerType = 'macrophage' | 'neutrophil' | 'nkcell' | 'dendritic' | 'mitochondria';
export type PathogenType = 'rhinovirus' | 'influenza' | 'ecoli' | 'saureus' | 'aspergillus';

import type { PathogenModifier, SpawnQueueItem } from './data/waves';
export type { PathogenModifier, SpawnQueueItem } from './data/waves';

export type TargetingMode = 'aoe' | 'single';

/**
 * 单体塔目标优先级（Phase 1 · A）。仅 single-target 塔（neutrophil / nkcell）使用，
 * AoE / helper 塔忽略此字段。
 *  - first  : 最靠近出口（默认，等同当前行为）
 *  - last   : 最远离出口
 *  - strong : 当前 HP 最高
 *  - close  : 距塔最近
 */
export type TargetingPriority = 'first' | 'last' | 'strong' | 'close';

export interface TowerDef {
  cost: number;
  range: number; // 单位：格；radialProjectile 塔 range 可设 Infinity 表示全图
  damage: number;
  attackIntervalMs: number;
  targetingMode: TargetingMode;
  canTargetFlying?: boolean; // 默认 true；近战塔（巨噬）设 false
  /**
   * 放射发射配置：存在则塔以"塔中心 360° 均分 N 枚子弹"方式攻击，
   * 不走普通 single/aoe 伤害循环。塔持续旋转，发射时读当前 rotation 作基准角。
   */
  radialProjectile?: RadialProjectileDef;
}

/**
 * 放射发射参数：每级子弹数 + 塔旋转速度 + 子弹飞行速度。
 * - bulletCountByLevel[i] = 塔 level=(i+1) 时每次发射几枚（均匀 360°/N 分布）
 * - rotationSpeed：弧度/秒，塔持续自转
 * - bulletSpeed：格/秒，子弹匀速直线飞行
 */
export interface RadialProjectileDef {
  readonly bulletCountByLevel: readonly [number, number, number];
  readonly rotationSpeed: number;
  readonly bulletSpeed: number;
}

/**
 * 子弹实体（放射发射塔专用）：发射瞬间算好方向速度，之后纯线性运动，
 * 命中第一只病原扣 HP 后消失，出界消失。owner 仅用作调试标识。
 */
export interface Bullet {
  id: string;
  ownerId: string; // 发射塔 id
  col: number; // 当前位置（格坐标）
  row: number;
  vCol: number; // 速度分量（格/秒），初始化为 cos(angle) * bulletSpeed
  vRow: number; // sin(angle) * bulletSpeed
  damage: number; // 单次命中伤害
}

export interface PathogenDef {
  maxHp: number;
  speed: number; // 单位：格/秒
  coreDamage: number;
  flying?: boolean; // true = 走直线无视地面路径，只能被可打空塔攻击
}

export interface Tower {
  id: string;
  type: TowerType;
  col: number;
  row: number;
  cooldownMs: number; // 距上次攻击已过 ms
  level: 1 | 2 | 3;
  totalInvested: number; // 累计投入 ATP（用于拆除返还计算）
  hp: number; // 当前 HP，受 DoT 衰减
  maxHp: number; // 最大 HP，由当前 level 决定
  /** 弧度；radialProjectile 塔持续推进，发射子弹时读当前值作基准角。非放射塔此字段无用（默认 0） */
  rotation?: number;
  /** 该塔从放下到现在累计造成的伤害（cap 到目标剩余 HP 的实际伤害），用于详情面板展示 */
  damageDealt?: number;
  /** 单体塔的目标优先级；AoE / helper 塔忽略。默认 'first'（等同当前行为） */
  targetingPriority: TargetingPriority;
  /**
   * neu-net 计时器（ms）：仅 Lv3 neutrophil + netActive 时使用。
   * 累到 5000 触发一次范围减速网，重置为 0。其他塔此字段一直为 0。
   */
  netCooldownMs?: number;
}

/** 辅助塔（M5）对周围攻击塔提供的增益数值；helper 塔的 TowerLevelDef.helperBuff 字段使用。 */
export interface HelperBuff {
  dmgMultiplier: number; // 攻击塔 damage 乘数（如 1.3 = +30%）
  intervalMultiplier?: number; // 攻击间隔乘数（< 1 = 加快），可选
}

/** 经济塔（Phase B）每波末产 ATP；economy 塔的 TowerLevelDef.economyBuff 字段使用。 */
export interface EconomyBuff {
  atpPerWave: number; // 每波末产 ATP 量
}

export interface TowerLevelDef {
  damage: number;
  range: number; // 单位：格
  attackIntervalMs: number;
  upgradeCost: number | null; // null = 已满级
  hp: number; // 该级的最大 HP
  helperBuff?: HelperBuff; // M5：仅 helper 塔填写（攻击塔 undefined）
  economyBuff?: EconomyBuff; // Phase B：仅 economy 塔填写
}

export function getTowerLevelDef(tower: Tower): TowerLevelDef {
  const idx = tower.level - 1;
  const levels = TOWER_LEVELS[tower.type];
  const def = levels[idx];
  if (!def) throw new Error(`无效塔等级: type=${tower.type}, level=${tower.level}`);
  return def;
}

export interface Pathogen {
  id: string;
  type: PathogenType;
  pathIndex: number; // 当前在路径第几段（0 = 第一格）
  progress: number; // 0..1，当前段内进度
  hp: number;
  maxHp: number;
  alive: boolean;
  reachedExit: boolean;
  flying: boolean; // 从 def 拷贝，便于 combat / render 快速判断
  offsetX: number; // 像素级横向偏移，让视觉上散开
  offsetY: number; // 像素级纵向偏移
  speedMultiplier: number; // 速度扰动系数，默认 1（小幅拉开距离）
  path: readonly { col: number; row: number }[]; // 该病原体自己的行走路径；空数组时回退到调用方传入的 fallbackPath
  /**
   * 减速剩余时长（ms）。movement 每 tick 减 dt；> 0 时 speed × 0.5。
   * 当前来源：mac-m1 极化（Lv3 巨噬攻击命中时设 500ms）。
   */
  slowMs: number;
  /**
   * Pathogen modifier 实例列表（spawn 时确定，运行时不变）。
   * 来源 = registry.defaultModifiers ∪ wave config 显式 modifiers，去重。
   * combat / movement / render 按字段分支处理；flying 字段是 modifiers.includes('flying') 的 derived。
   */
  modifiers: readonly PathogenModifier[];
}

export interface SpawnerState {
  queue: readonly SpawnQueueItem[];
  spawnedCount: number;
  intervalMs: number;
  timerMs: number;
  active: boolean;
}

// TOWER_DEFS / TOWER_LEVELS 与 *_LEVELS 数组现已全部迁移到 registry/tower-registry.ts，
// 此处 import + re-export 保持原命名导出兼容（避免下游大改 import）。
// 注：*_LEVELS 一并搬走，避免 entities ↔ registry 循环依赖（registry 模块加载时
// entities 顶层副作用尚未完成，曾导致 TOWER_LEVELS[t] 为 undefined）。
import {
  MACROPHAGE_LEVELS,
  MITOCHONDRIA_LEVELS,
  NEUTROPHIL_LEVELS,
  NKCELL_LEVELS,
  TOWER_DEFS,
  TOWER_LEVELS,
} from './registry/tower-registry';
export {
  MACROPHAGE_LEVELS,
  MITOCHONDRIA_LEVELS,
  NEUTROPHIL_LEVELS,
  NKCELL_LEVELS,
  TOWER_DEFS,
  TOWER_LEVELS,
};

// PATHOGEN_DEFS / PATHOGEN_REWARDS 现已迁移到 registry/pathogen-registry.ts，
// 此处 import + re-export 既保持原命名导出兼容（约 18 处 import 不变），
// 又让本文件内的 createPathogen 可继续按原方式引用 PATHOGEN_DEFS。
import { PATHOGEN_DEFS, PATHOGEN_REGISTRY, PATHOGEN_REWARDS } from './registry/pathogen-registry';
import { type ResearchModifierState, ZERO_MODIFIERS } from './registry/research-modifiers';
export { PATHOGEN_DEFS, PATHOGEN_REGISTRY, PATHOGEN_REWARDS };

export function createTower(
  id: string,
  type: TowerType,
  col: number,
  row: number,
  modifiers: ResearchModifierState = ZERO_MODIFIERS,
): Tower {
  const lv1 = TOWER_LEVELS[type][0];
  if (!lv1) throw new Error(`无效塔类型: ${type}`);
  // mac-hp: 巨噬塔 HP × 1.3（其他塔 HP 类 modifier 待 Phase 5+ 实装）
  const hpMul =
    type === 'macrophage'
      ? modifiers.macrophage.hpMultiplier
      : type === 'mitochondria'
        ? modifiers.mitochondria.hpMultiplier
        : 1;
  const maxHp = Math.round(lv1.hp * hpMul);
  return {
    id,
    type,
    col,
    row,
    cooldownMs: 0,
    level: 1,
    totalInvested: TOWER_DEFS[type].cost,
    hp: maxHp,
    maxHp,
    rotation: 0,
    damageDealt: 0,
    targetingPriority: 'first',
  };
}

export interface PathogenVariance {
  offsetX?: number;
  offsetY?: number;
  speedMultiplier?: number;
  path?: readonly { col: number; row: number }[];
}

export function createPathogen(
  id: string,
  type: PathogenType,
  hpMultiplier = 1,
  variance: PathogenVariance = {},
  spawnModifiers: readonly PathogenModifier[] = [],
): Pathogen {
  const def = PATHOGEN_DEFS[type];
  const entry = PATHOGEN_REGISTRY[type];
  // 合并 default + spawn 显式 modifiers，去重保持顺序（default 在前）
  const merged = Array.from(
    new Set([...(entry.defaultModifiers ?? []), ...spawnModifiers]),
  ) as readonly PathogenModifier[];
  // fortified: maxHp ×2
  const fortifiedMul = merged.includes('fortified') ? 2 : 1;
  const maxHp = Math.round(def.maxHp * hpMultiplier * fortifiedMul);
  return {
    id,
    type,
    pathIndex: 0,
    progress: 0,
    hp: maxHp,
    maxHp,
    alive: true,
    reachedExit: false,
    // flying 是 derived：从 modifiers 算（移除 def.flying 直接读，统一走 modifier 系统）
    flying: merged.includes('flying'),
    offsetX: variance.offsetX ?? 0,
    offsetY: variance.offsetY ?? 0,
    speedMultiplier: variance.speedMultiplier ?? 1,
    path: variance.path ?? [],
    slowMs: 0,
    modifiers: merged,
  };
}

export function createSpawner(queue: readonly SpawnQueueItem[], intervalMs: number): SpawnerState {
  return {
    queue,
    spawnedCount: 0,
    intervalMs,
    timerMs: 0,
    active: queue.length > 0,
  };
}
