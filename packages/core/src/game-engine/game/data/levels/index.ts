import { CHAPTER_0_LEVELS } from './chapter-0';
import { CHAPTER_1_LEVELS } from './chapter-1';
import { CHAPTER_2_LEVELS } from './chapter-2';
import { CHAPTER_3_LEVELS } from './chapter-3';
import { CHAPTERS, type Coord, type GameMechanic, type LevelConfig } from './types';

// 类型与元数据统一从 types.ts 对外透出，使用方的 import 路径不变（./data/levels 指向本 index.ts）
export {
  type ChapterId,
  type Coord,
  type ProtectedCell,
  type GameMechanic,
  type LevelConfig,
  type ChapterMeta,
  CHAPTERS,
} from './types';

/**
 * 所有已实现关卡的聚合字典。新章节按 `CHAPTER_N_LEVELS` 约定再合并一行即可，
 * 章节内容不需要改 index 文件本身（除非加新章节）。
 */
export const LEVELS: Record<number, LevelConfig> = {
  ...CHAPTER_0_LEVELS,
  ...CHAPTER_1_LEVELS,
  ...CHAPTER_2_LEVELS,
  ...CHAPTER_3_LEVELS,
};

export const IMPLEMENTED_LEVEL_IDS: readonly number[] = Object.keys(LEVELS).map(Number);

export function getLevel(id: number): LevelConfig {
  const level = LEVELS[id];
  if (!level) throw new Error(`关卡 ${id} 未配置`);
  return level;
}

/**
 * 精英模式派生：在 base level 基础上给所有 spawn 注入 'fortified' modifier。
 * 不为每关写独立精英 wave config，运行时派生即可。
 * - title 加「（精英）」后缀
 * - waves[*].composition[*].modifiers 合并 'fortified'（去重保留原 modifier）
 * 教学关 / 演示关由 UI 层（LevelSelectScene）过滤，本函数不做拦截。
 */
export function getEliteLevel(id: number): LevelConfig {
  const base = getLevel(id);
  return {
    ...base,
    title: `${base.title}（精英）`,
    waves: base.waves.map((w) => ({
      ...w,
      composition: w.composition.map((s) => ({
        ...s,
        modifiers: Array.from(new Set([...(s.modifiers ?? []), 'fortified' as const])),
      })),
    })),
  };
}

export type LevelMode = 'normal' | 'elite';

/** 按 mode 解析关卡：normal → getLevel，elite → getEliteLevel。GameScene/phases 用此入口。 */
export function getLevelByMode(id: number, mode: LevelMode): LevelConfig {
  return mode === 'elite' ? getEliteLevel(id) : getLevel(id);
}

export function isLevelImplemented(id: number): boolean {
  return id in LEVELS;
}

// ---- M0 helpers：从 LevelConfig 解析多入口/出口/机制开关/解锁链 ----

/** 返回入口坐标列表；level.entry 未配置则回退到 fallback。 */
export function getEntries(level: LevelConfig, fallback: Coord): readonly Coord[] {
  if (!level.entry) return [fallback];
  return Array.isArray(level.entry) ? (level.entry as readonly Coord[]) : [level.entry as Coord];
}

/** 返回出口坐标列表；level.exit 未配置则回退到 fallback。 */
export function getExits(level: LevelConfig, fallback: Coord): readonly Coord[] {
  if (!level.exit) return [fallback];
  return Array.isArray(level.exit) ? (level.exit as readonly Coord[]) : [level.exit as Coord];
}

/** 关卡是否启用某玩法机制。enabledMechanics 缺省/不含时一律 false。 */
export function isMechanicEnabled(level: LevelConfig, m: GameMechanic): boolean {
  return level.enabledMechanics?.includes(m) ?? false;
}

/** 返回通关后应解锁的下一组关卡 id。unlocksLevels 缺省时回退到 [id + 1]。 */
export function getNextLevels(level: LevelConfig): readonly number[] {
  return level.unlocksLevels ?? [level.id + 1];
}

export function getAllLevelIds(): readonly number[] {
  return CHAPTERS.flatMap((c) => c.levelIds)
    .slice()
    .sort((a, b) => a - b);
}

/**
 * 全局星数上限：教学关（isTutorial）通关不发星，不计入分母。
 * 未实现关卡按 non-tutorial 对待（保留占位 3 星，将来实现后就能凑齐）。
 */
export function getTotalStars(): number {
  return getAllLevelIds().filter((id) => LEVELS[id]?.isTutorial !== true).length * 3;
}

export function getTotalChapters(): number {
  return CHAPTERS.length;
}
