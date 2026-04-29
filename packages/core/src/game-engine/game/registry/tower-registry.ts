import type { TowerDef, TowerLevelDef, TowerType } from '../entities';

// 平衡 v3：塔升级曲线扁平化。
// 原 Lv1→Lv3 damage ×2.6、HP ×3.2、interval -20% → DPS 3.2×、综合战力 ~4×，
// 导致「1 座 Lv3 秒杀一切 + 打不掉」。扁平化后：
//   damage ×1.8、HP ×2、interval 仅 -10% → DPS 2×，综合 2.5×
// Lv3 仍强但不离谱，给铺塔策略留生存空间；range 不动保留升级"扩大覆盖"感。
// 平衡 v4：巨噬定位调整为"高血肉盾范围 / 慢节奏"，与粒细胞放射高 DPS 错位。
// damage 削 ~12%（25→22/35→30/45→38）+ hp 升 40%（100→140/140→200/200→280）
// + attackInterval 整体 +30% 慢化，升级仅 -50ms/级（之前 -100ms 升级提速过陡）：
// 1300 / 1250 / 1200，让升级强化集中在 dmg/hp/range，攻速基本不变
export const MACROPHAGE_LEVELS: readonly TowerLevelDef[] = [
  { damage: 22, range: 1.5, attackIntervalMs: 1300, upgradeCost: 55, hp: 140 },
  { damage: 30, range: 1.7, attackIntervalMs: 1250, upgradeCost: 90, hp: 200 },
  { damage: 38, range: 2.0, attackIntervalMs: 1200, upgradeCost: null, hp: 280 },
];

export const NEUTROPHIL_LEVELS: readonly TowerLevelDef[] = [
  { damage: 30, range: 1.2, attackIntervalMs: 500, upgradeCost: 80, hp: 60 },
  { damage: 45, range: 1.3, attackIntervalMs: 475, upgradeCost: 130, hp: 90 },
  { damage: 55, range: 1.5, attackIntervalMs: 450, upgradeCost: null, hp: 130 },
];

export const NKCELL_LEVELS: readonly TowerLevelDef[] = [
  // damage 较前版 -25%（65/95/135 → 50/70/100）。range/interval/hp 保持。
  // 历史教训：上次只削 damage 让 Ch.2 saureus 爆发关全崩 → 这次同步看 baseline，
  // 失败关用 scripts/tune-outliers.ts 评估「调档 vs 调关卡 ATP/波次」。
  { damage: 50, range: 2.5, attackIntervalMs: 1000, upgradeCost: 110, hp: 80 },
  { damage: 70, range: 2.8, attackIntervalMs: 950, upgradeCost: 175, hp: 120 },
  { damage: 100, range: 3.2, attackIntervalMs: 900, upgradeCost: null, hp: 160 },
];

// Phase B：线粒体共生体（经济塔）。damage / range / attackIntervalMs 为 0（不
// 参与攻击循环、不被 dendritic buff），通过 economyBuff.atpPerWave 在每波末产 ATP。
// 数值参考 BTD6 Banana Farm 早期：cost 100 / 每波 25→50→100，4 波回本（5 波关
// 早期投不赚 → 关卡 ≥10 波后期才成立 farm 流，曲线与 BTD6 一致）。
export const MITOCHONDRIA_LEVELS: readonly TowerLevelDef[] = [
  {
    damage: 0,
    range: 0,
    attackIntervalMs: 0,
    upgradeCost: 100,
    hp: 80,
    economyBuff: { atpPerWave: 25 },
  },
  {
    damage: 0,
    range: 0,
    attackIntervalMs: 0,
    upgradeCost: 180,
    hp: 130,
    economyBuff: { atpPerWave: 50 },
  },
  {
    damage: 0,
    range: 0,
    attackIntervalMs: 0,
    upgradeCost: null,
    hp: 200,
    economyBuff: { atpPerWave: 100 },
  },
];

// M5：树突状细胞（辅助塔）。damage / attackIntervalMs 为 0（不参与攻击循环），
// 通过 helperBuff.dmgMultiplier 为周围攻击塔的 damage 提供乘数。
export const DENDRITIC_LEVELS: readonly TowerLevelDef[] = [
  {
    damage: 0,
    range: 1.5,
    attackIntervalMs: 0,
    upgradeCost: 90,
    hp: 50,
    helperBuff: { dmgMultiplier: 1.3 },
  },
  {
    damage: 0,
    range: 1.8,
    attackIntervalMs: 0,
    upgradeCost: 130,
    hp: 90,
    helperBuff: { dmgMultiplier: 1.4 },
  },
  {
    damage: 0,
    range: 2.0,
    attackIntervalMs: 0,
    upgradeCost: null,
    hp: 140,
    helperBuff: { dmgMultiplier: 1.5 },
  },
];

/** 塔角色：M5 引入 helper（增益），Phase B 引入 economy（每波末产 ATP）。 */
export type TowerRole = 'attack' | 'helper' | 'economy';

/** 塔科学元数据：图鉴 / UI 显示 / 资源映射用，不参与战斗数值 */
export interface TowerMeta {
  displayName: string;
  scientificName: string;
  description: string;
  spriteKey?: string; // 资源 key（无则用 fallback geometry）
  /** 图鉴 / encyclopedia 显示色（偏柔和科学配色） */
  color: number;
  /**
   * 战斗视觉色（tower-layer / placement-ghost / effects-layer 共用）。
   * 历史上 render 层各文件复制了三份 TOWER_COLOR 常量，现收敛到此处作 single source。
   * 留 optional 以防新塔只填 color；未填则 fallback 到 color。
   */
  battleColor?: number;
  shape: 'hexagon' | 'star' | 'diamond' | 'pentagon';
}

/**
 * 塔皮肤数据（商城 / 装饰）：每塔至少含 id='default'（永远默认拥有）+ 可选 alt
 * 套装。alt MVP 通过 runtime setTint 调色，sprite 共用默认 SVG；后续可扩 spriteKey
 * 字段切真贴图。
 */
export interface TowerSkin {
  id: string;
  displayName: string;
  cost: number; // 信用点；'default' = 0
  battleColor: number; // 战斗渲染色：有自定义 sprite 则不用，靠 sprite 自身颜色；无则 setTint fallback
  description?: string; // 商店卡片文案
  tag?: string; // 商店卡顶角小标签："推荐" / "新品" / "限时" 等
  /**
   * 是否有专属 SVG 资产（路径 `assets/towers/{type}-{lv}-{skinId}.svg`）。
   * - true：渲染层用 `TEX.towerSkin(type, lv, skinId)` 加载该 SVG，保留独立美术
   * - false / 未填：渲染层 fallback 到 default sprite + setTint(battleColor)，仅换色
   */
  hasCustomSprite?: boolean;
}

export interface TowerRegistryEntry {
  type: TowerType;
  def: TowerDef;
  levels: readonly TowerLevelDef[];
  role: TowerRole;
  meta: TowerMeta;
  skins: readonly TowerSkin[];
}

/**
 * 塔注册表：def + levels + role + 科学元数据四合一。
 * 数值与原 TOWER_DEFS / *_LEVELS 完全一致，禁止在此调整平衡。
 */
export const TOWER_REGISTRY: Record<TowerType, TowerRegistryEntry> = {
  macrophage: {
    type: 'macrophage',
    def: {
      cost: 30,
      range: 1.5,
      damage: 22, // v4：与 levels[0] 同步
      attackIntervalMs: 1300,
      targetingMode: 'aoe',
      canTargetFlying: false,
    },
    levels: MACROPHAGE_LEVELS,
    role: 'attack',
    meta: {
      displayName: '巨噬细胞',
      scientificName: 'Macrophage',
      description: '先天免疫核心，吞噬病原体形成囊泡降解。',
      color: 0x44ff88,
      battleColor: 0x5de0b5,
      shape: 'hexagon',
    },
    skins: [
      { id: 'default', displayName: '巨噬 · 原型', cost: 0, battleColor: 0x5de0b5 },
      {
        id: 'amber',
        displayName: '巨噬 · 琥珀变体',
        cost: 30,
        battleColor: 0xffaa44,
        description: '热带菌株诱导的色素变异',
        tag: '推荐',
      },
    ],
  },
  neutrophil: {
    type: 'neutrophil',
    def: {
      cost: 55,
      range: Number.POSITIVE_INFINITY, // 放射发射塔：全图，实际方向由塔当前 rotation + 360°/N 均分决定
      damage: 30,
      attackIntervalMs: 500,
      targetingMode: 'single',
      radialProjectile: {
        bulletCountByLevel: [2, 3, 5],
        rotationSpeed: 0.8, // rad/s ≈ 4.5 秒/圈
        bulletSpeed: 10, // 格/s
      },
    },
    levels: NEUTROPHIL_LEVELS,
    role: 'attack',
    meta: {
      displayName: '中性粒细胞',
      scientificName: 'Neutrophil',
      description: '数量最多的白细胞，持续旋转 360° 放射杀菌颗粒。',
      color: 0x4488ff,
      battleColor: 0x44aaff,
      shape: 'star',
    },
    skins: [
      { id: 'default', displayName: '中性粒 · 原型', cost: 0, battleColor: 0x44aaff },
      {
        id: 'crimson',
        displayName: '中性粒 · 赤红',
        cost: 30,
        battleColor: 0xe63946,
        description: '炎症因子激活的高活性形态',
        tag: '新品',
        hasCustomSprite: true,
      },
    ],
  },
  nkcell: {
    type: 'nkcell',
    def: {
      cost: 60,
      range: 2.5,
      damage: 50,
      attackIntervalMs: 1000,
      targetingMode: 'single',
    },
    levels: NKCELL_LEVELS,
    role: 'attack',
    meta: {
      displayName: 'NK 细胞',
      scientificName: 'Natural Killer cell',
      description: '天然杀伤细胞，识别异常或感染细胞。',
      color: 0xff66cc,
      battleColor: 0xff88dd,
      shape: 'diamond',
    },
    skins: [
      { id: 'default', displayName: 'NK · 原型', cost: 0, battleColor: 0xff88dd },
      {
        id: 'violet',
        displayName: 'NK · 紫罗兰',
        cost: 30,
        battleColor: 0x9966ff,
        description: '高度分化的细胞毒性形态',
      },
    ],
  },
  dendritic: {
    type: 'dendritic',
    def: {
      cost: 70,
      range: 1.5,
      damage: 0,
      attackIntervalMs: 0,
      targetingMode: 'aoe', // helper 不参与战斗，targetingMode 字段无实际作用
    },
    levels: DENDRITIC_LEVELS,
    role: 'helper',
    meta: {
      displayName: '树突状细胞',
      scientificName: 'Dendritic Cell',
      description: '抗原呈递专家，识别病原并训练周围免疫细胞增强攻击。',
      color: 0xffcc44,
      battleColor: 0xffcc44,
      shape: 'star',
    },
    skins: [
      { id: 'default', displayName: '树突 · 原型', cost: 0, battleColor: 0xffcc44 },
      {
        id: 'azure',
        displayName: '树突 · 蔚蓝',
        cost: 30,
        battleColor: 0x44aaff,
        description: '淋巴结成熟态，呈递效率提升',
      },
    ],
  },
  mitochondria: {
    type: 'mitochondria',
    def: {
      cost: 100,
      range: 0,
      damage: 0,
      attackIntervalMs: 0,
      targetingMode: 'aoe', // economy 不参与战斗，targetingMode 字段无实际作用
    },
    levels: MITOCHONDRIA_LEVELS,
    role: 'economy',
    meta: {
      displayName: '线粒体共生体',
      scientificName: 'Mitochondrion',
      description: '细胞能量工厂，每波结算时为系统提供 ATP。',
      color: 0x6688ff,
      battleColor: 0x88aaff,
      shape: 'pentagon',
    },
    skins: [
      { id: 'default', displayName: '线粒体 · 原型', cost: 0, battleColor: 0x88aaff },
      {
        id: 'verdant',
        displayName: '线粒体 · 翠绿',
        cost: 30,
        battleColor: 0x66dd88,
        description: '高效产能的进化型变体',
      },
    ],
  },
};

/** 派生导出：保持原 TOWER_DEFS 命名兼容（避免现有 import 大改） */
export const TOWER_DEFS = Object.fromEntries(
  Object.entries(TOWER_REGISTRY).map(([t, e]) => [t, e.def]),
) as Record<TowerType, TowerDef>;

/** 派生导出：保持原 TOWER_LEVELS 命名兼容 */
export const TOWER_LEVELS = Object.fromEntries(
  Object.entries(TOWER_REGISTRY).map(([t, e]) => [t, e.levels]),
) as Record<TowerType, readonly TowerLevelDef[]>;
