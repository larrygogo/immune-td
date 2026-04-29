import type { LevelConfig } from './types';

/** 序章 · 新手教学：GameScene + Tutorial 主导节奏，spawner 不自动 tick */
export const CHAPTER_0_LEVELS: Record<number, LevelConfig> = {
  0: {
    id: 0,
    chapter: 0,
    title: '序章',
    subtitle: '防御系统启动',
    unlockTowers: ['macrophage'],
    rewardsTowers: [],
    initialHp: 99,
    initialAtp: 200,
    initialBuildMs: 999_999, // 教学锁会进一步管控，这里给个超大兜底
    dotMultiplier: 0.2, // 序章超柔教学，让玩家几乎感受不到塔被啃
    isTutorial: true,
    // entry/exit 用默认 (0,4)/(9,4)，path 走 row=4 横穿。教学引导格 (2,3)
    // 紧贴 path 上方一格（距离 1，在 macrophage range=1.5 内），让塔放下后
    // 能打到沿 row=4 行进的病原。
    waves: [
      {
        // count=50 兜底（spawner 不 tick 时此值无意义；Task 2 会跳过自动 spawn）
        // 玩家手动 spawn 接口（GameScene.spawnPathogenForTutorial）实际控制节奏
        // hpMultiplier 0.3：rhinovirus HP=65×0.3=19.5 < mac Lv1 dmg=22 一发即死，
        // 让 STEP 4「击杀获 ATP」必然推进（mac 攻速 1300ms + 怪 1.5 格/秒过塔
        // range 1.5 仅 2 秒，原 0.4 倍率 26 HP 一发剩 4 不死，等 PATHOGEN_KILLED 卡死）
        composition: [{ type: 'rhinovirus', count: 50 }],
        intervalMs: 99_999,
        hpMultiplier: 0.3,
      },
    ],
  },
};
