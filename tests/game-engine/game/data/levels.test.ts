import { describe, expect, it } from 'vitest';
import {
  CHAPTERS,
  IMPLEMENTED_LEVEL_IDS,
  LEVELS,
  getAllLevelIds,
  getLevel,
  getTotalChapters,
  getTotalStars,
  isLevelImplemented,
} from '@engine/game/data/levels';

describe('LEVELS', () => {
  it('getAllLevelIds 长度等于 CHAPTERS 全部 levelIds 拼接长度', () => {
    const fromChapters = CHAPTERS.flatMap((c) => c.levelIds);
    expect(getAllLevelIds().length).toBe(fromChapters.length);
  });

  it('getTotalStars 排除教学关：30 非教学关 × 3 = 90', () => {
    const nonTutorialCount = getAllLevelIds().filter(
      (id) => LEVELS[id]?.isTutorial !== true,
    ).length;
    expect(getTotalStars()).toBe(nonTutorialCount * 3);
    expect(getTotalStars()).toBe(90);
  });

  it('getTotalChapters = CHAPTERS.length', () => {
    expect(getTotalChapters()).toBe(CHAPTERS.length);
  });

  it('CHAPTERS：Ch.0 序章 1 关 + Ch.1-6 每章 5 关', () => {
    expect(CHAPTERS).toHaveLength(7);
    expect(CHAPTERS[0]?.id).toBe(0);
    expect(CHAPTERS[0]?.levelIds).toHaveLength(1);
    for (const ch of CHAPTERS.slice(1)) {
      expect(ch.levelIds.length).toBe(5);
    }
  });

  it('CHAPTERS level ids 连续 0..30 无重复无缺失', () => {
    const all = CHAPTERS.flatMap((c) => c.levelIds);
    expect(all).toEqual([0, ...Array.from({ length: 30 }, (_, i) => i + 1)]);
  });

  it('当前已实现关卡：Ch.0 序章 + Ch.1 + Ch.2 + Ch.3 关 11 共 12 关', () => {
    expect([...IMPLEMENTED_LEVEL_IDS].sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
  });

  it('getLevel(1) 基础字段正确', () => {
    const lv = getLevel(1);
    expect(lv.id).toBe(1);
    expect(lv.chapter).toBe(1);
    expect(lv.unlockTowers).toEqual(['macrophage']);
    expect(lv.rewardsTowers).toContain('neutrophil');
    expect(lv.initialHp).toBe(10);
    expect(lv.initialAtp).toBe(100);
    expect(lv.waves.length).toBe(5);
  });

  it('getLevel(2) 引入 neutrophil 和 ecoli', () => {
    const lv = getLevel(2);
    expect(lv.unlockTowers).toContain('neutrophil');
    const pathogenTypes = new Set(lv.waves.flatMap((w) => w.composition.map((c) => c.type)));
    expect(pathogenTypes.has('ecoli')).toBe(true);
  });

  it('getLevel 抛错当 id 未配置', () => {
    expect(() => getLevel(999)).toThrow();
  });

  it('isLevelImplemented：关 1-11 实现（Ch.3 关 11 演示关），关 12-30 未实现', () => {
    for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      expect(isLevelImplemented(id)).toBe(true);
    }
    expect(isLevelImplemented(12)).toBe(false);
    expect(isLevelImplemented(30)).toBe(false);
  });

  it('关 5（母株战）引入 E6 saureus，NK 细胞已由关 4 奖励', () => {
    const lv5 = getLevel(5);
    const types = new Set(lv5.waves.flatMap((w) => w.composition.map((c) => c.type)));
    expect(types.has('saureus')).toBe(true);
    expect(lv5.subtitle).toContain('母株战');
    // 关 4 解锁 nk → 关 5 可使用（Ch.1 Boss 需要集火能力）
    expect(lv5.unlockTowers).toContain('nkcell');
    expect(getLevel(4).rewardsTowers).toContain('nkcell');
  });

  it('关 7 起引入飞行敌 aspergillus', () => {
    const lv = getLevel(7);
    const types = new Set(lv.waves.flatMap((w) => w.composition.map((c) => c.type)));
    expect(types.has('aspergillus')).toBe(true);
  });

  it('Phase B：关 6 通关 rewardsTowers 含 mitochondria（经济塔解锁链入口）', () => {
    const lv6 = getLevel(6);
    expect(lv6.rewardsTowers).toContain('mitochondria');
  });

  it('关 10（Ch.2 终战）title=流感变异株', () => {
    const lv = getLevel(10);
    expect(lv.title).toBe('流感变异株');
  });

  it('M7 关 9：carryLimit=3 + enabledMechanics 含 carry-limit + unlockTowers 含 dendritic', () => {
    const lv = getLevel(9);
    expect(lv.carryLimit).toBe(3);
    expect(lv.enabledMechanics).toContain('carry-limit');
    expect(lv.unlockTowers).toContain('dendritic');
  });

  it('M7 关 10：carryLimit=3 + 4 塔种全部 unlock', () => {
    const lv = getLevel(10);
    expect(lv.carryLimit).toBe(3);
    expect(lv.unlockTowers).toEqual(['macrophage', 'neutrophil', 'nkcell', 'dendritic']);
  });

  it('每关每波 intervalMs/count 为正', () => {
    for (const id of IMPLEMENTED_LEVEL_IDS) {
      const lv = LEVELS[id];
      if (!lv) continue;
      for (const w of lv.waves) {
        expect(w.intervalMs).toBeGreaterThan(0);
        expect(w.composition.every((c) => c.count > 0)).toBe(true);
      }
    }
  });

  it('关 3：blockedCells 配置 3 格 + enabledMechanics 含 no-build-zone', () => {
    const lv = getLevel(3);
    expect(lv.blockedCells).toEqual([
      { col: 2, row: 3 },
      { col: 3, row: 5 },
      { col: 5, row: 4 },
    ]);
    expect(lv.enabledMechanics).toContain('no-build-zone');
  });

  it('其他关 blockedCells 仍为 undefined（M2 仅关 3 启用）', () => {
    expect(getLevel(1).blockedCells).toBeUndefined();
    expect(getLevel(2).blockedCells).toBeUndefined();
    expect(getLevel(4).blockedCells).toBeUndefined();
    expect(getLevel(5).blockedCells).toBeUndefined();
  });

  it('关 1：enabledMechanics 含 tower-hp（MX-1 介绍卡片自动展示）', () => {
    expect(getLevel(1).enabledMechanics).toEqual(['tower-hp']);
  });

  it('关 2 / 关 5 不重复声明 enabledMechanics（避免介绍卡片重复展示）', () => {
    expect(getLevel(2).enabledMechanics).toBeUndefined();
    expect(getLevel(5).enabledMechanics).toBeUndefined();
  });

  it('关 4（M3 多入口）：双入口 (0,2)(0,7) + 单出口 (9,4) + multi-entry 机制', () => {
    const lv = getLevel(4);
    expect(lv.entry).toEqual([
      { col: 0, row: 2 },
      { col: 0, row: 7 },
    ]);
    expect(lv.exit).toEqual({ col: 9, row: 4 });
    expect(lv.enabledMechanics).toContain('multi-entry');
  });

  it('A6：所有关 entry/exit 都显式配置（不再随机化），关 4 仍多入口', () => {
    expect(getLevel(1).entry).toEqual({ col: 0, row: 4 });
    expect(getLevel(1).exit).toEqual({ col: 9, row: 2 });
    expect(getLevel(2).entry).toEqual({ col: 0, row: 4 });
    expect(getLevel(3).entry).toEqual({ col: 0, row: 4 });
    expect(getLevel(5).entry).toEqual({ col: 0, row: 4 });
    // 关 4 仍是 multi-entry 机制示范关
    expect(Array.isArray(getLevel(4).entry)).toBe(true);
  });

  it('关 6（Ch.2 第一关）：enabledMechanics 含 immune-evasion', () => {
    expect(getLevel(6).enabledMechanics).toEqual(['immune-evasion']);
  });

  it('关 7：enabledMechanics 含 protected-cells', () => {
    expect(getLevel(7).enabledMechanics).toEqual(['protected-cells']);
  });

  it('M5：关 7 通关奖励 dendritic（解锁辅助塔）', () => {
    expect(getLevel(7).rewardsTowers).toEqual(['dendritic']);
  });

  it('M5：关 8 unlockTowers 含 dendritic + enabledMechanics 仅 helper-tower', () => {
    const lv = getLevel(8);
    expect(lv.unlockTowers).toContain('dendritic');
    expect(lv.unlockTowers).toEqual(['macrophage', 'neutrophil', 'nkcell', 'dendritic']);
    expect(lv.enabledMechanics).toEqual(['helper-tower']);
  });

  it('M5：关 8 标题 / 副标题 + initialAtp 130（鼓励试 dendritic）', () => {
    const lv = getLevel(8);
    expect(lv.title).toBe('抗原呈递');
    expect(lv.subtitle).toBe('免疫识别启动');
    expect(lv.initialAtp).toBe(130);
  });

  it('isTutorial：关 0 标记为教学关', () => {
    expect(LEVELS[0]?.isTutorial).toBe(true);
  });

  it('isTutorial：其他关默认 undefined（非教学关）', () => {
    expect(LEVELS[1]?.isTutorial).toBeUndefined();
    expect(LEVELS[5]?.isTutorial).toBeUndefined();
    expect(LEVELS[10]?.isTutorial).toBeUndefined();
  });

  it('dotMultiplier：序章 0.2 / 关 1 0.7（入门）/ 关 2 0.8 / 关 3 0.6（禁建压力补偿）/ 关 4 0.8', () => {
    expect(getLevel(0).dotMultiplier).toBe(0.2);
    expect(getLevel(1).dotMultiplier).toBe(0.7);
    expect(getLevel(2).dotMultiplier).toBe(0.8);
    expect(getLevel(3).dotMultiplier).toBe(0.6);
    expect(getLevel(4).dotMultiplier).toBe(0.8);
    expect(getLevel(5).dotMultiplier).toBeUndefined();
    expect(getLevel(6).dotMultiplier).toBeUndefined();
    expect(getLevel(10).dotMultiplier).toBeUndefined();
  });

  // A6 起：waypointChance 字段已删除，整个 waypoint 系统转入 fixed-path 分流。
  // 原 waypointChance 0/0.2/0.35/0.4 测试整体移除。
});
