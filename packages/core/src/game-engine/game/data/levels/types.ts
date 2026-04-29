import type { TowerType } from '../../entities';
import type { WaveConfig } from '../waves';

export type ChapterId = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// 网格坐标（M0 schema 扩展）
export type Coord = { col: number; row: number };

// 受保护格子（M4：保卫绒毛上皮等机制使用）
export interface ProtectedCell {
  coord: Coord;
  hp: number;
  name: string; // 显示名（"绒毛上皮"）
  description?: string;
}

// 关卡级玩法机制开关（按里程碑分批引入）
export type GameMechanic =
  | 'tower-hp' // M1
  | 'no-build-zone' // M2
  | 'multi-entry' // M3
  | 'protected-cells' // M4
  | 'helper-tower' // M5
  | 'mobile-tower' // M6
  | 'carry-limit' // M7
  | 'complement-system' // 关 13
  | 'immune-evasion'; // Ch.2 飞行/逃逸机制

export interface LevelConfig {
  id: number; // 1..30
  chapter: ChapterId;
  title: string;
  subtitle: string;
  unlockTowers: readonly TowerType[]; // 本关可用的塔种（累计显示）
  rewardsTowers: readonly TowerType[]; // 通关后解锁的新塔种
  waves: readonly WaveConfig[];
  initialHp: number;
  initialAtp: number;
  initialBuildMs?: number; // 覆盖默认首次建造时长（默认 15000）
  interWaveBuildMs?: number; // 覆盖默认波间建造时长（默认 10000）
  // ---- M0 schema 扩展（全部 optional，向后兼容）----
  entry?: Coord | readonly Coord[]; // 自定义入口（覆盖默认 ENTRY）
  exit?: Coord | readonly Coord[]; // 自定义出口（覆盖默认 EXIT）
  /**
   * 预设固定路径（fixed-path 模式 · 路径回退 milestone）。
   * - 单条：readonly Coord[]，从 entry 到 exit 的折线点列表（必相邻）
   * - 多条：readonly Coord[][]，多入口/多出口对应多条独立路径
   * - 缺失时 engine 调用 generateDefaultPath 自动生成 S 形占位（迁移期间不崩）
   * - 路径上的格子在 placement 阶段视为禁建（pathCellSet 校验）
   */
  path?: readonly Coord[] | readonly (readonly Coord[])[];
  blockedCells?: readonly Coord[]; // 不可建造/不可走格
  protectedCells?: readonly ProtectedCell[]; // 需保卫的关键细胞
  carryLimit?: number; // 携带塔种数限制（默认 unlimited）
  unlocksLevels?: readonly number[]; // 声明式解锁链，覆盖 +1 默认
  enabledMechanics?: readonly GameMechanic[]; // 关卡级玩法开关
  visualTheme?: string; // 'skin' | 'respiratory' | ...（覆盖章节默认）
  dotMultiplier?: number; // M1：病原侵蚀伤害乘数（默认 1.0；关 0-4 教学衰减）
  rewardMultiplier?: number; // 击杀 ATP 奖励乘数（默认 1.0）；降低强迫玩家精打细算，不在图鉴里可见
  isTutorial?: boolean; // 教学关：节奏由 GameScene + Tutorial 主导，spawner 不自动 tick
}

// 章节元数据（30 关蓝图）
export interface ChapterMeta {
  id: ChapterId;
  title: string;
  subtitle: string;
  levelIds: readonly number[];
}

export const CHAPTERS: readonly ChapterMeta[] = [
  { id: 0, title: '序章', subtitle: '新手教学', levelIds: [0] },
  { id: 1, title: '皮肤前线', subtitle: '第一道防线', levelIds: [1, 2, 3, 4, 5] },
  { id: 2, title: '呼吸道深入', subtitle: '空气传播', levelIds: [6, 7, 8, 9, 10] },
  { id: 3, title: '肠道迷宫', subtitle: '菌群失衡', levelIds: [11, 12, 13, 14, 15] },
  { id: 4, title: '血流追击', subtitle: '循环污染', levelIds: [16, 17, 18, 19, 20] },
  { id: 5, title: '淋巴迷宫', subtitle: '情报战', levelIds: [21, 22, 23, 24, 25] },
  { id: 6, title: '中枢决战', subtitle: '最终防线', levelIds: [26, 27, 28, 29, 30] },
];
