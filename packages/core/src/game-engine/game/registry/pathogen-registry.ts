import type { PathogenModifier } from '../data/waves';
import type { PathogenDef, PathogenType } from '../entities';

/** 病原体科学元数据：图鉴 / UI 显示 / 资源映射用，不参与战斗数值 */
export interface PathogenMeta {
  displayName: string;
  scientificName: string; // 拉丁学名（图鉴用）
  description: string; // 一句话科学背景
  spriteKey?: string; // 资源 key（无则用 fallback geometry）
  /** 图鉴 / encyclopedia 显示色（偏柔和科学配色） */
  color: number;
  /**
   * 战斗视觉色（pathogen-layer / effects-layer / LevelBriefingScene 共用）。
   * 历史上这些处各自复制了 PATHOGEN_COLOR 常量，现收敛到此处作 single source。
   * 留 optional；未填则 fallback 到 color。
   */
  battleColor?: number;
  shape: 'circle' | 'triangle' | 'rect';
}

export interface PathogenRegistryEntry {
  type: PathogenType;
  def: PathogenDef;
  reward: number; // 击杀奖励 ATP
  dot: number; // 对接触塔的每秒持续伤害（基础值，不含 multiplier）
  meta: PathogenMeta;
  /**
   * 默认 modifier 列表（spawn 时自动带）。flying 在 2026-04-26 从 def.flying 迁过来：
   * aspergillus.defaultModifiers = ['flying']，其他默认空。
   * Wave config 的 modifiers 会与 default 合并去重。
   */
  defaultModifiers?: readonly PathogenModifier[];
}

/**
 * 病原体注册表：def + reward + 科学元数据三合一。
 * 数值与原 PATHOGEN_DEFS / PATHOGEN_REWARDS 完全一致，禁止在此调整平衡。
 */
export const PATHOGEN_REGISTRY: Record<PathogenType, PathogenRegistryEntry> = {
  rhinovirus: {
    type: 'rhinovirus',
    def: { maxHp: 65, speed: 1.2, coreDamage: 1 },
    reward: 4, // v4：原 8 减半（鼻病毒数量在中后期增加，单只价值降低保持总收益不爆）
    dot: 5,
    meta: {
      displayName: '鼻病毒',
      scientificName: 'Rhinovirus',
      description: '普通感冒最常见的病原，传染性强但致病性弱。',
      color: 0xff5566,
      battleColor: 0xff3366,
      shape: 'circle',
    },
  },
  influenza: {
    type: 'influenza',
    def: { maxHp: 30, speed: 2.4, coreDamage: 1 },
    reward: 5,
    dot: 8,
    meta: {
      displayName: '流感病毒',
      scientificName: 'Influenza virus',
      description: 'RNA 病毒，高速变异，每年流行株不同。',
      color: 0xffcc44,
      battleColor: 0xffcc22,
      shape: 'triangle',
    },
  },
  ecoli: {
    type: 'ecoli',
    def: { maxHp: 50, speed: 1.6, coreDamage: 1 },
    reward: 7,
    dot: 7,
    meta: {
      displayName: '大肠杆菌',
      scientificName: 'Escherichia coli',
      description: '肠道菌群成员，部分致病株引起感染。',
      color: 0xaa55ff,
      battleColor: 0xcc66ff,
      shape: 'rect',
    },
  },
  saureus: {
    type: 'saureus',
    def: { maxHp: 240, speed: 0.8, coreDamage: 2 },
    reward: 20,
    dot: 15,
    meta: {
      displayName: '金黄色葡萄球菌',
      scientificName: 'Staphylococcus aureus',
      description: '革兰氏阳性球菌，生物膜抗药顽强。',
      color: 0xffaa00,
      battleColor: 0xffaa33,
      shape: 'circle',
    },
  },
  aspergillus: {
    type: 'aspergillus',
    def: { maxHp: 50, speed: 1.4, coreDamage: 1, flying: true },
    reward: 10,
    dot: 6,
    meta: {
      displayName: '曲霉孢子',
      scientificName: 'Aspergillus',
      description: '空气传播真菌孢子，免疫低下时侵肺。',
      color: 0x66ff66,
      battleColor: 0x88ee66,
      shape: 'circle',
    },
    // flying 迁移到 modifier 系统：spawn 时 createPathogen 从这里读 default
    defaultModifiers: ['flying'],
  },
};

/** 派生导出：保持原 PATHOGEN_DEFS 命名兼容（避免 18 处 import 大改） */
export const PATHOGEN_DEFS = Object.fromEntries(
  Object.entries(PATHOGEN_REGISTRY).map(([t, e]) => [t, e.def]),
) as Record<PathogenType, PathogenDef>;

/** 派生导出：保持原 PATHOGEN_REWARDS 命名兼容 */
export const PATHOGEN_REWARDS = Object.fromEntries(
  Object.entries(PATHOGEN_REGISTRY).map(([t, e]) => [t, e.reward]),
) as Record<PathogenType, number>;
