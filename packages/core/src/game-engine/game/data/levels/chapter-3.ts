import type { LevelConfig } from './types';

/**
 * 章 3 · 肠道迷宫：关 11-15。
 *
 * 当前仅含关 11 「肠道菌群入侵」作为 modifier 系统演示关——4 wave 各教一种 modifier
 * 应对（regrow / camouflaged / encapsulated / fortified）。
 *
 * 关 12-15 暂未实装（unlocksLevels=[] 不解锁任何下一关，避免 MainMenu 解锁链爆）；
 * 待 Ch.3 完整 spec 出来后再补全。
 */
export const CHAPTER_3_LEVELS: Record<number, LevelConfig> = {
  11: {
    id: 11,
    chapter: 3,
    title: '肠道菌群入侵',
    subtitle: '初见 modifier',
    unlockTowers: ['macrophage', 'neutrophil', 'nkcell', 'dendritic'],
    rewardsTowers: [],
    initialHp: 10,
    initialAtp: 130,
    carryLimit: 3, // 4 modifier × 4 塔，但 3 塔位强迫玩家选学
    enabledMechanics: ['tower-hp'],
    unlocksLevels: [], // 关 12 未实装，留空避免 MainMenu 解锁链爆
    waves: [
      // wave 1: regrow 教学 —— 数量少但回血，必须高瞬时输出
      {
        composition: [{ type: 'ecoli', count: 8, modifiers: ['regrow'] }],
        intervalMs: 1500,
        hpMultiplier: 1.0,
      },
      // wave 2: camouflaged 教学 —— 必须放 dendritic 才能被任何塔打到
      {
        composition: [{ type: 'rhinovirus', count: 12, modifiers: ['camouflaged'] }],
        intervalMs: 800,
        hpMultiplier: 1.0,
      },
      // wave 3: encapsulated 教学 —— 单体伤害打 0.3，必须用 macrophage AoE
      {
        composition: [{ type: 'rhinovirus', count: 10, modifiers: ['encapsulated'] }],
        intervalMs: 700,
        hpMultiplier: 1.0,
      },
      // wave 4: 综合考核 —— fortified boss + regrow + camo
      {
        composition: [
          { type: 'saureus', count: 1, modifiers: ['fortified'] },
          { type: 'ecoli', count: 6, modifiers: ['regrow'] },
          { type: 'rhinovirus', count: 8, modifiers: ['camouflaged'] },
        ],
        intervalMs: 600,
        hpMultiplier: 1.0,
      },
    ],
  },
};
