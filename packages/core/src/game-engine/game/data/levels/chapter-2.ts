import type { LevelConfig } from './types';

/** 章 2 · 呼吸道深入：关 6-10，末关 Boss「流感变异株」 */
export const CHAPTER_2_LEVELS: Record<number, LevelConfig> = {
  6: {
    id: 6,
    chapter: 2,
    title: '鼻黏膜屏障',
    subtitle: '呼吸道深入',
    unlockTowers: ['macrophage', 'neutrophil', 'nkcell'],
    rewardsTowers: ['mitochondria'], // Phase B：通关解锁线粒体共生体经济塔
    initialHp: 10,
    initialAtp: 110, // ATP -10（原 120）；双出口 + round-robin goals 自然破 guard
    enabledMechanics: ['immune-evasion'],
    entry: { col: 0, row: 4 },
    // Ch.2 第 1 关：双出口上下拉开让铺塔收益 > 扎堆
    exit: [
      { col: 9, row: 1 },
      { col: 9, row: 8 },
    ],
    waves: [
      {
        composition: [
          { type: 'rhinovirus', count: 10 },
          { type: 'influenza', count: 4 },
        ],
        intervalMs: 1100,
        hpMultiplier: 1.0,
      },
      {
        composition: [
          { type: 'rhinovirus', count: 12 },
          { type: 'influenza', count: 6 },
        ],
        intervalMs: 1000,
        hpMultiplier: 1.0,
      },
      {
        composition: [
          { type: 'rhinovirus', count: 10 },
          { type: 'influenza', count: 10 },
        ],
        intervalMs: 900,
        hpMultiplier: 1.1,
      },
      {
        composition: [
          { type: 'rhinovirus', count: 23 }, // v4：中后期 ×1.5（原 15）
          { type: 'influenza', count: 12 },
        ],
        intervalMs: 800,
        hpMultiplier: 1.2,
      },
      {
        composition: [
          { type: 'rhinovirus', count: 30 }, // v4：末波 ×1.5（原 20）
          { type: 'influenza', count: 15 },
        ],
        intervalMs: 700,
        hpMultiplier: 1.3,
      },
    ],
  },
  7: {
    id: 7,
    chapter: 2,
    title: '肺泡保卫战',
    subtitle: '呼吸道深处',
    unlockTowers: ['macrophage', 'neutrophil', 'nkcell'],
    rewardsTowers: ['dendritic'], // M5：通关关 7 解锁 dendritic 树突状细胞
    initialHp: 10,
    initialAtp: 100, // 双肺泡 + round-robin 让分兵压力足够；ATP -10 强迫选择
    entry: { col: 0, row: 4 },
    waves: [
      // 关 7 单一保护核心：所有病原冲肺泡（无普通 exit）
      {
        composition: [{ type: 'rhinovirus', count: 10 }],
        intervalMs: 1100,
        hpMultiplier: 1.0,
      },
      {
        composition: [
          { type: 'rhinovirus', count: 8 },
          { type: 'influenza', count: 4 },
        ],
        intervalMs: 1000,
        hpMultiplier: 1.05,
      },
      {
        composition: [
          { type: 'rhinovirus', count: 8 },
          { type: 'influenza', count: 6 },
          { type: 'aspergillus', count: 2 },
        ],
        intervalMs: 950,
        hpMultiplier: 1.1,
      },
      {
        composition: [
          { type: 'rhinovirus', count: 9 }, // v4：中后期 ×1.5（原 6）
          { type: 'influenza', count: 8 },
          { type: 'aspergillus', count: 4 },
        ],
        intervalMs: 900,
        hpMultiplier: 1.2,
      },
      {
        composition: [
          { type: 'rhinovirus', count: 12 }, // v4：末波 ×1.5（原 8）
          { type: 'influenza', count: 10 },
          { type: 'aspergillus', count: 6 },
        ],
        intervalMs: 850,
        hpMultiplier: 1.3,
      },
    ],
    protectedCells: [
      { coord: { col: 8, row: 2 }, hp: 5, name: '上肺泡' },
      { coord: { col: 8, row: 7 }, hp: 5, name: '下肺泡' },
    ],
    exit: [], // 关 7 没普通 exit，所有病原 round-robin 分配到两个肺泡
    enabledMechanics: ['protected-cells'],
  },
  8: {
    id: 8,
    chapter: 2,
    title: '抗原呈递',
    subtitle: '免疫识别启动',
    unlockTowers: ['macrophage', 'neutrophil', 'nkcell', 'dendritic'],
    rewardsTowers: [],
    initialHp: 10,
    initialAtp: 130,
    entry: { col: 0, row: 4 },
    // 双出口（上下拉开）：破 guard 扎堆支配，强制 helper tower 合理布置
    exit: [
      { col: 9, row: 1 },
      { col: 9, row: 8 },
    ],
    waves: [
      {
        composition: [{ type: 'rhinovirus', count: 12 }],
        intervalMs: 1100,
        hpMultiplier: 1.0,
      },
      {
        composition: [
          { type: 'rhinovirus', count: 10 },
          { type: 'influenza', count: 6 },
        ],
        intervalMs: 1000,
        hpMultiplier: 1.05,
      },
      {
        composition: [
          { type: 'rhinovirus', count: 8 },
          { type: 'influenza', count: 8 },
          { type: 'aspergillus', count: 3 },
        ],
        intervalMs: 950,
        hpMultiplier: 1.15,
      },
      {
        composition: [
          { type: 'rhinovirus', count: 9 }, // v4：中后期 ×1.5（原 6）
          { type: 'influenza', count: 10 },
          { type: 'aspergillus', count: 5 },
        ],
        intervalMs: 900,
        hpMultiplier: 1.25,
      },
      {
        composition: [
          { type: 'rhinovirus', count: 12 }, // v4：末波 ×1.5（原 8）
          { type: 'influenza', count: 12 },
          { type: 'aspergillus', count: 8 },
        ],
        intervalMs: 850,
        hpMultiplier: 1.35,
      },
    ],
    enabledMechanics: ['helper-tower'],
  },
  9: {
    id: 9,
    chapter: 2,
    title: '肺间质纤维化',
    subtitle: '呼吸道深入',
    unlockTowers: ['macrophage', 'neutrophil', 'nkcell', 'dendritic'],
    rewardsTowers: [],
    initialHp: 10,
    initialAtp: 130, // carryLimit 3 + 混合敌 + DoT 1.0，ATP 100 对 bot 压力过大（全员 <15%）
    carryLimit: 3,
    enabledMechanics: ['carry-limit'],
    entry: { col: 0, row: 4 },
    exit: { col: 9, row: 2 },
    waves: [
      {
        composition: [
          { type: 'rhinovirus', count: 10 },
          { type: 'ecoli', count: 5 },
          { type: 'aspergillus', count: 3 },
        ],
        intervalMs: 900,
        hpMultiplier: 1.0,
      },
      {
        composition: [
          { type: 'influenza', count: 10 },
          { type: 'ecoli', count: 6 },
          { type: 'saureus', count: 2 },
          { type: 'aspergillus', count: 5 },
        ],
        intervalMs: 850,
        hpMultiplier: 1.1,
      },
      {
        composition: [
          { type: 'ecoli', count: 12 },
          { type: 'saureus', count: 3 },
          { type: 'aspergillus', count: 8 },
        ],
        intervalMs: 800,
        hpMultiplier: 1.15,
      },
      {
        composition: [
          { type: 'influenza', count: 15 },
          { type: 'ecoli', count: 8 },
          { type: 'saureus', count: 4 },
          { type: 'aspergillus', count: 10 },
        ],
        intervalMs: 750,
        hpMultiplier: 1.2,
      },
      {
        composition: [
          { type: 'rhinovirus', count: 15 }, // v4：末波 ×1.5（原 10）
          { type: 'ecoli', count: 15 },
          { type: 'saureus', count: 6 },
          { type: 'aspergillus', count: 12 },
        ],
        intervalMs: 700,
        hpMultiplier: 1.3,
      },
    ],
  },
  10: {
    id: 10,
    chapter: 2,
    title: '流感变异株',
    subtitle: 'Ch.2 终战',
    unlockTowers: ['macrophage', 'neutrophil', 'nkcell', 'dendritic'],
    rewardsTowers: [],
    initialHp: 12,
    initialAtp: 140,
    carryLimit: 3,
    entry: { col: 0, row: 4 },
    // Ch.2 终战：双出口强制分兵，+ carryLimit 3 考验塔种选择
    exit: [
      { col: 9, row: 1 },
      { col: 9, row: 8 },
    ],
    waves: [
      {
        composition: [
          { type: 'rhinovirus', count: 12 },
          { type: 'aspergillus', count: 4 },
        ],
        intervalMs: 1000,
        hpMultiplier: 1.0,
      },
      {
        composition: [
          { type: 'influenza', count: 12 },
          { type: 'aspergillus', count: 6 },
        ],
        intervalMs: 950,
        hpMultiplier: 1.1,
      },
      {
        composition: [
          { type: 'rhinovirus', count: 10 },
          { type: 'influenza', count: 10 },
          { type: 'aspergillus', count: 8 },
        ],
        intervalMs: 900,
        hpMultiplier: 1.2,
      },
      {
        composition: [
          { type: 'influenza', count: 15 },
          { type: 'aspergillus', count: 10 },
          { type: 'saureus', count: 1 },
        ],
        intervalMs: 850,
        hpMultiplier: 1.3,
      },
      {
        composition: [
          { type: 'rhinovirus', count: 18 }, // v4：末波 ×1.5（原 12）
          { type: 'influenza', count: 18 },
          { type: 'aspergillus', count: 12 },
          { type: 'saureus', count: 2 },
        ],
        intervalMs: 800,
        hpMultiplier: 1.4,
      },
    ],
  },
};
