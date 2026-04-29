import type { LevelConfig } from './types';

/** 章 1 · 皮肤前线：关 1-5，最后一关 Boss「金葡菌母株」 */
export const CHAPTER_1_LEVELS: Record<number, LevelConfig> = {
  1: {
    id: 1,
    chapter: 1,
    title: '初次感染',
    subtitle: '皮肤前线',
    unlockTowers: ['macrophage'],
    rewardsTowers: ['neutrophil'],
    initialHp: 10,
    initialAtp: 100,
    dotMultiplier: 0.7, // 关 1：最入门关，DoT 稍弱（关 2-4 用 0.8，关 3 有禁建机制另作补偿）
    enabledMechanics: ['tower-hp'],
    entry: { col: 0, row: 4 },
    exit: { col: 9, row: 2 },
    waves: [
      // 平衡 v2：提高难度——数量 + spawn 节奏 + 末波倍率
      {
        composition: [{ type: 'rhinovirus', count: 12 }],
        intervalMs: 1100,
        hpMultiplier: 1.0,
        countVariance: 2,
        typePool: ['rhinovirus', 'influenza'],
      },
      {
        composition: [
          { type: 'rhinovirus', count: 10 },
          { type: 'influenza', count: 5 },
        ],
        intervalMs: 1000,
        hpMultiplier: 1.05,
        countVariance: 3,
        typePool: ['rhinovirus', 'influenza'],
      },
      {
        composition: [
          { type: 'rhinovirus', count: 12 },
          { type: 'influenza', count: 6 },
        ],
        intervalMs: 900,
        hpMultiplier: 1.15,
        countVariance: 3,
        typePool: ['rhinovirus', 'influenza'],
      },
      {
        composition: [
          { type: 'rhinovirus', count: 18 }, // v4：中后期 ×1.5（原 12）
          { type: 'influenza', count: 8 },
        ],
        intervalMs: 850,
        hpMultiplier: 1.3,
        countVariance: 3,
        typePool: ['rhinovirus', 'influenza', 'ecoli'],
      },
      {
        composition: [
          { type: 'rhinovirus', count: 21 }, // v4：末波 ×1.5（原 14）
          { type: 'influenza', count: 10 },
        ],
        intervalMs: 800,
        hpMultiplier: 1.5,
        countVariance: 4,
        typePool: ['influenza', 'ecoli'],
      },
    ],
  },
  2: {
    id: 2,
    chapter: 1,
    title: '毛细血管突破',
    subtitle: '皮肤前线',
    unlockTowers: ['macrophage', 'neutrophil'],
    rewardsTowers: [],
    initialHp: 10,
    // ATP 100→120：双出口需分兵守两条路（4 座塔 × 30 = 120 ATP），原 100 让
    // weak/strong 塔数不足（尤其 strong 先升级），只有 greedy 铺塔独活（53%）。
    // +20 让多策略都有生存空间，不伤"铺塔教学"初衷
    initialAtp: 120,
    dotMultiplier: 0.8, // 关 1-4 轻度教学衰减（0.4 会让 guard 扎堆不被 DoT 啃死，支配策略）
    entry: { col: 0, row: 4 },
    // 双出口（上下拉开）：让玩家第一次体验「铺塔链也能赢」，破除守门支配
    exit: [
      { col: 9, row: 3 },
      { col: 9, row: 6 },
    ],
    waves: [
      {
        composition: [
          { type: 'rhinovirus', count: 8 },
          { type: 'ecoli', count: 4 },
        ],
        intervalMs: 1100,
        hpMultiplier: 1.0,
      },
      {
        composition: [
          { type: 'rhinovirus', count: 10 },
          { type: 'ecoli', count: 6 },
        ],
        intervalMs: 1000,
        hpMultiplier: 1.0,
      },
      {
        composition: [
          { type: 'rhinovirus', count: 12 },
          { type: 'ecoli', count: 8 },
        ],
        intervalMs: 900,
        hpMultiplier: 1.1,
      },
      {
        composition: [
          { type: 'rhinovirus', count: 15 }, // v4：中后期 ×1.5（原 10）
          { type: 'ecoli', count: 12 },
        ],
        intervalMs: 800,
        hpMultiplier: 1.2,
      },
      {
        composition: [
          { type: 'rhinovirus', count: 12 }, // v4：末波 ×1.5（原 8）
          { type: 'ecoli', count: 18 },
        ],
        intervalMs: 700,
        hpMultiplier: 1.3,
      },
    ],
  },
  3: {
    id: 3,
    chapter: 1,
    title: '皮脂腺深入',
    subtitle: '皮肤前线',
    unlockTowers: ['macrophage', 'neutrophil'],
    rewardsTowers: [],
    initialHp: 10,
    initialAtp: 110,
    // 关 3 dotMult 0.8 → 0.6：新机制（no-build-zone）+ 0.8 DoT 双重压力让新手
    // weak 0%，调回 0.6 让 weak 有 25% 希望；其他 bot 基本不变（25-35%）
    dotMultiplier: 0.6,
    entry: { col: 0, row: 4 },
    exit: { col: 9, row: 2 },
    blockedCells: [
      { col: 2, row: 3 },
      { col: 3, row: 5 },
      { col: 5, row: 4 },
    ],
    enabledMechanics: ['no-build-zone'],
    waves: [
      {
        composition: [
          { type: 'rhinovirus', count: 12 },
          { type: 'ecoli', count: 6 },
        ],
        intervalMs: 1000,
        hpMultiplier: 1.0,
      },
      {
        composition: [
          { type: 'rhinovirus', count: 10 },
          { type: 'influenza', count: 4 },
          { type: 'ecoli', count: 6 },
        ],
        intervalMs: 950,
        hpMultiplier: 1.0,
      },
      {
        composition: [
          { type: 'rhinovirus', count: 12 },
          { type: 'influenza', count: 6 },
          { type: 'ecoli', count: 8 },
        ],
        intervalMs: 900,
        hpMultiplier: 1.1,
      },
      {
        composition: [
          { type: 'rhinovirus', count: 15 }, // v4：中后期 ×1.5（原 10）
          { type: 'influenza', count: 8 },
          { type: 'ecoli', count: 10 },
        ],
        intervalMs: 850,
        hpMultiplier: 1.2,
      },
      {
        composition: [
          { type: 'rhinovirus', count: 23 }, // v4：末波 ×1.5（原 15）
          { type: 'influenza', count: 10 },
          { type: 'ecoli', count: 12 },
        ],
        intervalMs: 800,
        hpMultiplier: 1.2,
      },
    ],
  },
  4: {
    id: 4,
    chapter: 1,
    title: '真皮网格',
    subtitle: '皮肤前线',
    unlockTowers: ['macrophage', 'neutrophil'],
    rewardsTowers: ['nkcell'], // 通关解锁 NK 细胞，用于关 5 Boss（扁平化后 mac+neu 打不穿 saureus）
    initialHp: 10,
    initialAtp: 100,
    dotMultiplier: 0.8, // 关 1-4 轻度教学衰减（0.4 会让 guard 扎堆不被 DoT 啃死，支配策略）
    entry: [
      { col: 0, row: 2 },
      { col: 0, row: 7 },
    ],
    exit: { col: 9, row: 4 },
    enabledMechanics: ['multi-entry'],
    waves: [
      {
        composition: [
          { type: 'rhinovirus', count: 10 },
          { type: 'influenza', count: 5 },
          { type: 'ecoli', count: 5 },
        ],
        intervalMs: 900,
        hpMultiplier: 1.0,
      },
      {
        composition: [
          { type: 'rhinovirus', count: 12 },
          { type: 'influenza', count: 6 },
          { type: 'ecoli', count: 8 },
        ],
        intervalMs: 800,
        hpMultiplier: 1.1,
      },
      {
        composition: [
          { type: 'rhinovirus', count: 10 },
          { type: 'influenza', count: 10 },
          { type: 'ecoli', count: 10 },
        ],
        intervalMs: 750,
        hpMultiplier: 1.2,
      },
      {
        composition: [
          { type: 'rhinovirus', count: 23 }, // v4：中后期 ×1.5（原 15）
          { type: 'influenza', count: 12 },
          { type: 'ecoli', count: 12 },
        ],
        intervalMs: 700,
        hpMultiplier: 1.25,
      },
      {
        composition: [
          { type: 'rhinovirus', count: 30 }, // v4：末波 ×1.5（原 20）
          { type: 'influenza', count: 15 },
          { type: 'ecoli', count: 15 },
        ],
        intervalMs: 650,
        hpMultiplier: 1.3,
      },
    ],
  },
  5: {
    id: 5,
    chapter: 1,
    title: '金葡菌母株',
    subtitle: '皮肤前线 · 母株战',
    unlockTowers: ['macrophage', 'neutrophil', 'nkcell'], // 关 4 已解锁 nk，Boss 战需要它集火
    rewardsTowers: [], // Ch.1 收官，Ch.2 首关开新章
    initialHp: 12,
    initialAtp: 120,
    entry: { col: 0, row: 4 },
    exit: { col: 9, row: 2 },
    waves: [
      {
        composition: [
          { type: 'rhinovirus', count: 10 },
          { type: 'ecoli', count: 5 },
        ],
        intervalMs: 900,
        hpMultiplier: 1.0,
      },
      {
        composition: [
          { type: 'rhinovirus', count: 10 },
          { type: 'ecoli', count: 6 },
          { type: 'saureus', count: 1 }, // 首次金葡，试水
        ],
        intervalMs: 850,
        hpMultiplier: 1.0,
      },
      {
        composition: [
          { type: 'rhinovirus', count: 10 },
          { type: 'influenza', count: 8 },
          { type: 'ecoli', count: 8 },
          { type: 'saureus', count: 2 },
        ],
        intervalMs: 800,
        hpMultiplier: 1.1,
      },
      {
        composition: [
          { type: 'rhinovirus', count: 18 }, // v4：中后期 ×1.5（原 12）
          { type: 'influenza', count: 10 },
          { type: 'ecoli', count: 10 },
          { type: 'saureus', count: 3 },
        ],
        intervalMs: 750,
        hpMultiplier: 1.2,
      },
      {
        // Boss 波：金葡菌母株（更高 HP 倍率）+ 大量围攻
        composition: [
          { type: 'saureus', count: 1 }, // "母株" - hpMultiplier 加成下 HP ~330
          { type: 'rhinovirus', count: 23 }, // v4：末波 ×1.5（原 15）
          { type: 'ecoli', count: 15 },
          { type: 'saureus', count: 3 },
        ],
        intervalMs: 700,
        hpMultiplier: 1.5,
      },
    ],
  },
};
