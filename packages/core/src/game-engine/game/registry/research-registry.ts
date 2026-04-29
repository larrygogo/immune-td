import type { TowerType } from '../entities';

/**
 * 跨局研究系统（Phase 3 · BTD6 借鉴）：每塔一棵小树 × 5 节点，跨局 RP 留存，支持重置。
 *
 * 树形（每塔同模板）：
 *
 *           [Tier 4 终末·质变]
 *                  ↑
 *           [Tier 3 Lv3 解锁]
 *           ↗               ↖
 *  [Tier 2 能力 A]    [Tier 2 能力 B]
 *           ↖               ↗
 *           [Tier 1 Lv2 解锁]
 *
 * 前置规则（按 kind 分支判断）：
 * - lv2-unlock：无前置（根节点）
 * - tier-2 ability：要求该塔 lv2-unlock 已解
 * - lv3-unlock：要求**任一** tier-2 ability 已解（OR 语义，二选一即可）
 * - tier-4 ability：要求该塔 lv3-unlock 已解
 *
 * RP 总成本（spec 修订后）：mac=11 + neu=13 + nk=14 + den=11 = **49 RP**
 *
 * 经济：首通 +1 / 3 星首通额外 +1 / Boss 关（5/10/...）首通额外 +1（GameScene LEVEL_WON 发放）
 *
 * 兼容性（让现有 v3 ResearchScene 不爆）：
 * - 保留 `isUpgradeUnlocked(unlocked, type, toLevel)` 签名
 * - 保留 `getUpgradeResearch(type, toLevel)` 签名（返回 lv2/lv3-unlock 节点）
 * - 保留 `defaultUnlockedResearch()` 返回 `['mac-lv2']`
 *
 * Phase 4 重构 ResearchScene v3 → v4 后，旧兼容签名可能继续保留供 actions/upgradeTower 用。
 */

export type ResearchNodeId =
  | 'mac-lv2'
  | 'mac-aoe'
  | 'mac-hp'
  | 'mac-lv3'
  | 'mac-m1'
  | 'neu-lv2'
  | 'neu-rate'
  | 'neu-dmg'
  | 'neu-lv3'
  | 'neu-net'
  | 'nk-lv2'
  | 'nk-range'
  | 'nk-crit'
  | 'nk-lv3'
  | 'nk-adcc'
  | 'den-lv2'
  | 'den-radius'
  | 'den-buff'
  | 'den-lv3'
  | 'den-th1'
  | 'mit-lv2'
  | 'mit-yield'
  | 'mit-hp'
  | 'mit-lv3'
  | 'mit-amp';

export type ResearchNodeKind = 'lv2-unlock' | 'lv3-unlock' | 'ability';

export interface ResearchNode {
  id: ResearchNodeId;
  towerType: TowerType;
  tier: 1 | 2 | 3 | 4;
  kind: ResearchNodeKind;
  name: string;
  description: string;
  cost: number;
  /**
   * 全部前置节点 id（UI tooltip 显示「需先解锁 X」）；
   * canUnlockResearch 按 kind 分支判断 OR/AND 语义。
   */
  prerequisites: readonly ResearchNodeId[];
  defaultUnlocked: boolean;
}

export const RESEARCH_NODES: readonly ResearchNode[] = [
  // ───── 巨噬细胞 macrophage（近战 AoE） ─────
  // 教学关 0 走 isTutorial 分支跳过 RP 检查，所有塔的 lv2 都要付 RP 解锁（统一规则）
  {
    id: 'mac-lv2',
    towerType: 'macrophage',
    tier: 1,
    kind: 'lv2-unlock',
    name: '巨噬·成熟',
    description: '解锁 Lv2 升级',
    cost: 2,
    prerequisites: [],
    defaultUnlocked: false,
  },
  {
    id: 'mac-aoe',
    towerType: 'macrophage',
    tier: 2,
    kind: 'ability',
    name: '趋化因子',
    description: '所有巨噬 AoE 半径 +0.5 格',
    cost: 2,
    prerequisites: ['mac-lv2'],
    defaultUnlocked: false,
  },
  {
    id: 'mac-hp',
    towerType: 'macrophage',
    tier: 2,
    kind: 'ability',
    name: '活化',
    description: '所有巨噬 HP +30%',
    cost: 2,
    prerequisites: ['mac-lv2'],
    defaultUnlocked: false,
  },
  {
    id: 'mac-lv3',
    towerType: 'macrophage',
    tier: 3,
    kind: 'lv3-unlock',
    name: '泡沫化',
    description: '解锁 Lv3 升级',
    cost: 3,
    prerequisites: ['mac-aoe', 'mac-hp'],
    defaultUnlocked: false,
  },
  {
    id: 'mac-m1',
    towerType: 'macrophage',
    tier: 4,
    kind: 'ability',
    name: 'M1 极化',
    description: 'Lv3 巨噬攻击附带 0.5s 减速',
    cost: 4,
    prerequisites: ['mac-lv3'],
    defaultUnlocked: false,
  },

  // ───── 中性粒细胞 neutrophil（单体高攻速） ─────
  {
    id: 'neu-lv2',
    towerType: 'neutrophil',
    tier: 1,
    kind: 'lv2-unlock',
    name: '颗粒成熟',
    description: '解锁 Lv2 升级',
    cost: 2,
    prerequisites: [],
    defaultUnlocked: false,
  },
  {
    id: 'neu-rate',
    towerType: 'neutrophil',
    tier: 2,
    kind: 'ability',
    name: '脱颗粒',
    description: '所有中性粒攻击间隔 -15%',
    cost: 2,
    prerequisites: ['neu-lv2'],
    defaultUnlocked: false,
  },
  {
    id: 'neu-dmg',
    towerType: 'neutrophil',
    tier: 2,
    kind: 'ability',
    name: '弹性蛋白酶',
    description: '所有中性粒单发伤害 +25%',
    cost: 2,
    prerequisites: ['neu-lv2'],
    defaultUnlocked: false,
  },
  {
    id: 'neu-lv3',
    towerType: 'neutrophil',
    tier: 3,
    kind: 'lv3-unlock',
    name: 'NETosis',
    description: '解锁 Lv3 升级',
    cost: 3,
    prerequisites: ['neu-rate', 'neu-dmg'],
    defaultUnlocked: false,
  },
  {
    id: 'neu-net',
    towerType: 'neutrophil',
    tier: 4,
    kind: 'ability',
    name: '中性粒胞外网',
    description: 'Lv3 中性粒每 5 秒释放捕获网，被打中的敌减速 50% 持续 1s',
    cost: 4,
    prerequisites: ['neu-lv3'],
    defaultUnlocked: false,
  },

  // ───── NK 细胞 nkcell（中远程单体） ─────
  {
    id: 'nk-lv2',
    towerType: 'nkcell',
    tier: 1,
    kind: 'lv2-unlock',
    name: '杀伤准备',
    description: '解锁 Lv2 升级',
    cost: 2,
    prerequisites: [],
    defaultUnlocked: false,
  },
  {
    id: 'nk-range',
    towerType: 'nkcell',
    tier: 2,
    kind: 'ability',
    name: '视野扩展',
    description: '所有 NK 射程 +0.5 格',
    cost: 2,
    prerequisites: ['nk-lv2'],
    defaultUnlocked: false,
  },
  {
    id: 'nk-crit',
    towerType: 'nkcell',
    tier: 2,
    kind: 'ability',
    name: '穿孔素强化',
    description: '所有 NK 有 20% 概率暴击（×2 伤害）',
    cost: 3,
    prerequisites: ['nk-lv2'],
    defaultUnlocked: false,
  },
  {
    id: 'nk-lv3',
    towerType: 'nkcell',
    tier: 3,
    kind: 'lv3-unlock',
    name: '适应性增强',
    description: '解锁 Lv3 升级',
    cost: 3,
    prerequisites: ['nk-range', 'nk-crit'],
    defaultUnlocked: false,
  },
  {
    id: 'nk-adcc',
    towerType: 'nkcell',
    tier: 4,
    kind: 'ability',
    name: 'ADCC',
    description: 'Lv3 NK 优先打 dendritic 范围内的敌人，伤害 +50%',
    cost: 4,
    prerequisites: ['nk-lv3'],
    defaultUnlocked: false,
  },

  // ───── 树突状细胞 dendritic（helper） ─────
  {
    id: 'den-lv2',
    towerType: 'dendritic',
    tier: 1,
    kind: 'lv2-unlock',
    name: '抗原成熟',
    description: '解锁 Lv2 升级',
    cost: 2,
    prerequisites: [],
    defaultUnlocked: false,
  },
  {
    id: 'den-radius',
    towerType: 'dendritic',
    tier: 2,
    kind: 'ability',
    name: '淋巴趋化',
    description: '所有 dendritic buff 半径 +0.5 格',
    cost: 2,
    prerequisites: ['den-lv2'],
    defaultUnlocked: false,
  },
  {
    id: 'den-buff',
    towerType: 'dendritic',
    tier: 2,
    kind: 'ability',
    name: '共刺激分子',
    description: 'dendritic buff 数值 +20%（×1.2 → ×1.44）',
    cost: 2,
    prerequisites: ['den-lv2'],
    defaultUnlocked: false,
  },
  {
    id: 'den-lv3',
    towerType: 'dendritic',
    tier: 3,
    kind: 'lv3-unlock',
    name: '抗原呈递成熟',
    description: '解锁 Lv3 升级',
    cost: 2,
    prerequisites: ['den-radius', 'den-buff'],
    defaultUnlocked: false,
  },
  {
    id: 'den-th1',
    towerType: 'dendritic',
    tier: 4,
    kind: 'ability',
    name: 'Th1 极化',
    description: 'Lv3 dendritic 范围内的攻击塔 HP +50%',
    cost: 3,
    prerequisites: ['den-lv3'],
    defaultUnlocked: false,
  },

  // ───── 线粒体共生体 mitochondria（经济） ─────
  {
    id: 'mit-lv2',
    towerType: 'mitochondria',
    tier: 1,
    kind: 'lv2-unlock',
    name: '呼吸链成熟',
    description: '解锁 Lv2 升级',
    cost: 2,
    prerequisites: [],
    defaultUnlocked: false,
  },
  {
    id: 'mit-yield',
    towerType: 'mitochondria',
    tier: 2,
    kind: 'ability',
    name: 'ATP 合酶强化',
    description: '所有线粒体每波产能 +25%',
    cost: 2,
    prerequisites: ['mit-lv2'],
    defaultUnlocked: false,
  },
  {
    id: 'mit-hp',
    towerType: 'mitochondria',
    tier: 2,
    kind: 'ability',
    name: '外膜韧化',
    description: '所有线粒体 HP +30%',
    cost: 2,
    prerequisites: ['mit-lv2'],
    defaultUnlocked: false,
  },
  {
    id: 'mit-lv3',
    towerType: 'mitochondria',
    tier: 3,
    kind: 'lv3-unlock',
    name: '氧化磷酸化',
    description: '解锁 Lv3 升级',
    cost: 3,
    prerequisites: ['mit-yield', 'mit-hp'],
    defaultUnlocked: false,
  },
  {
    id: 'mit-amp',
    towerType: 'mitochondria',
    tier: 4,
    kind: 'ability',
    name: '应激爆发',
    description: 'Lv3 线粒体每波产能再 +50%',
    cost: 4,
    prerequisites: ['mit-lv3'],
    defaultUnlocked: false,
  },
];

/** 按 id 取节点，找不到抛错（id 是 union 类型，正确调用时不会触发） */
export function getResearchNode(id: ResearchNodeId): ResearchNode {
  const node = RESEARCH_NODES.find((n) => n.id === id);
  if (!node) throw new Error(`无效研究节点 id: ${id}`);
  return node;
}

/**
 * 检查节点是否满足前置条件可以购买。已购的节点本函数仍返回 true（即「能否到达此节点」）。
 * 调用方需自行检查节点未购 + RP 够。
 *
 * 语义按 kind 分支：
 * - lv2-unlock：根节点无前置 → 总是 true
 * - ability（tier 2/4）：prerequisites 全部满足（AND）
 * - lv3-unlock：prerequisites 任一满足（OR，二选一即可）
 */
export function canUnlockResearch(node: ResearchNode, unlocked: readonly string[]): boolean {
  switch (node.kind) {
    case 'lv2-unlock':
      return true;
    case 'ability':
      return node.prerequisites.every((p) => unlocked.includes(p));
    case 'lv3-unlock':
      return node.prerequisites.some((p) => unlocked.includes(p));
  }
}

/** 默认解锁的研究 id 列表（新存档初值 + migration 兜底） */
export function defaultUnlockedResearch(): string[] {
  return RESEARCH_NODES.filter((n) => n.defaultUnlocked).map((n) => n.id);
}

/** 已知 TowerType → 新 id 前缀映射（mitochondria 暂无研究节点，前缀仅为兼容 Record） */
const TOWER_PREFIX: Record<TowerType, string> = {
  macrophage: 'mac',
  neutrophil: 'neu',
  nkcell: 'nk',
  dendritic: 'den',
  mitochondria: 'mit',
};

/**
 * 兼容签名：v3 ResearchScene + actions.upgradeTower 都用 isUpgradeUnlocked
 * 检查 Lv2/Lv3 升级是否解锁。
 */
export function isUpgradeUnlocked(
  unlocked: readonly string[],
  type: TowerType,
  toLevel: 2 | 3,
): boolean {
  const id = `${TOWER_PREFIX[type]}-lv${toLevel}` as ResearchNodeId;
  return unlocked.includes(id);
}

/**
 * 兼容签名：v3 ResearchScene 用此函数拿 lv2/lv3 解锁节点的 {id, cost} 用于 RP 扣费。
 * Phase 4 重构 ResearchScene v4 后可能不再调，但保留以免破坏现有 import。
 */
export interface UpgradeResearch {
  id: ResearchNodeId;
  cost: number;
}

export function getUpgradeResearch(type: TowerType, toLevel: 2 | 3): UpgradeResearch {
  const id = `${TOWER_PREFIX[type]}-lv${toLevel}` as ResearchNodeId;
  const node = getResearchNode(id);
  return { id: node.id, cost: node.cost };
}

/** Phase 3 测试用：所有节点总 RP 成本，防数值漂移。 */
export function totalResearchCost(): number {
  return RESEARCH_NODES.reduce((sum, n) => sum + n.cost, 0);
}
