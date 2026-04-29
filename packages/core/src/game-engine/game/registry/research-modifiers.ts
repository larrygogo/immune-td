/**
 * 研究节点对战斗的运行时影响（Phase 5 · BTD6 借鉴改进）。
 *
 * 用法（关键约束）：
 * - 玩家在主菜单 ResearchScene 解锁研究节点后，下次开始关卡时由 GameScene/init.ts
 *   调用 computeResearchModifiers(metaStore.unlockedResearch) 算出 ResearchModifierState，
 *   作为参数传入 GameEngine 构造（state.researchModifiers）
 * - 进局后 modifier 不变（即使玩家最小化窗口去主菜单买了新节点，本局仍用旧 snapshot）
 * - simulator / balance-baseline 默认传 ZERO_MODIFIERS（不读 zustand），保持 bot 测试纯净
 *
 * 第一版（Phase 5）只做 8 个数值类 modifier。4 个行为类 modifier 留 TODO 下一轮：
 * - mac-m1（M1 极化：Lv3 巨噬攻击 0.5s 减速）
 * - neu-net（中性粒胞外网：Lv3 每 5s 释放捕获网减速）
 * - nk-adcc（ADCC：Lv3 NK 优先打 dendritic 范围内的敌人 + 50% 伤害）
 * - den-th1（Th1 极化：Lv3 dendritic 范围内攻击塔 HP +50%——部分 HP 类已在 createTower 注入 mac-hp）
 */

export interface ResearchModifierState {
  macrophage: {
    /** mac-aoe: AoE / range 半径 +0.5 格 */
    aoeBonus: number;
    /** mac-hp: HP +30% (×1.3) */
    hpMultiplier: number;
    /** mac-m1: 行为类（Lv3 攻击附带减速）—— 第一版未实装 */
    m1Polarized: boolean;
  };
  neutrophil: {
    /** neu-rate: attackIntervalMs * 0.85（间隔 -15%） */
    rateMultiplier: number;
    /** neu-dmg: damage * 1.25（伤害 +25%） */
    dmgMultiplier: number;
    /** neu-net: 行为类（Lv3 释放网）—— 第一版未实装 */
    netActive: boolean;
  };
  nkcell: {
    /** nk-range: range +0.5 格 */
    rangeBonus: number;
    /** nk-crit: 20% 概率暴击（×2 伤害） */
    critChance: number;
    /** nk-adcc: 行为类（Lv3 优先打 helper 范围内）—— 第一版未实装 */
    adccActive: boolean;
  };
  dendritic: {
    /** den-radius: helperBuff 半径 +0.5 格 */
    radiusBonus: number;
    /** den-buff: helperBuff dmgMultiplier × 1.2 (例 1.2 → 1.44) */
    buffMultiplier: number;
    /** den-th1: 行为类（Lv3 范围内塔 HP +50%）—— 第一版未实装 */
    th1Active: boolean;
  };
  mitochondria: {
    /** mit-yield: economyBuff atpPerWave * 1.25 */
    yieldMultiplier: number;
    /** mit-hp: HP * 1.3 */
    hpMultiplier: number;
    /** mit-amp: 行为类（Lv3 时产能再 +50%） */
    ampActive: boolean;
  };
}

/** 零 modifier 状态——simulator / 默认 GameEngine 用 */
export const ZERO_MODIFIERS: ResearchModifierState = {
  macrophage: { aoeBonus: 0, hpMultiplier: 1, m1Polarized: false },
  neutrophil: { rateMultiplier: 1, dmgMultiplier: 1, netActive: false },
  nkcell: { rangeBonus: 0, critChance: 0, adccActive: false },
  dendritic: { radiusBonus: 0, buffMultiplier: 1, th1Active: false },
  mitochondria: { yieldMultiplier: 1, hpMultiplier: 1, ampActive: false },
};

/**
 * 从已解锁研究 id 列表算出运行时 modifier 状态。
 * 纯函数，无副作用（不读 zustand），可在测试 / simulator 调用。
 */
export function computeResearchModifiers(unlocked: readonly string[]): ResearchModifierState {
  const m: ResearchModifierState = {
    macrophage: { aoeBonus: 0, hpMultiplier: 1, m1Polarized: false },
    neutrophil: { rateMultiplier: 1, dmgMultiplier: 1, netActive: false },
    nkcell: { rangeBonus: 0, critChance: 0, adccActive: false },
    dendritic: { radiusBonus: 0, buffMultiplier: 1, th1Active: false },
    mitochondria: { yieldMultiplier: 1, hpMultiplier: 1, ampActive: false },
  };
  // macrophage
  if (unlocked.includes('mac-aoe')) m.macrophage.aoeBonus = 0.5;
  if (unlocked.includes('mac-hp')) m.macrophage.hpMultiplier = 1.3;
  if (unlocked.includes('mac-m1')) m.macrophage.m1Polarized = true;
  // neutrophil
  if (unlocked.includes('neu-rate')) m.neutrophil.rateMultiplier = 0.85;
  if (unlocked.includes('neu-dmg')) m.neutrophil.dmgMultiplier = 1.25;
  if (unlocked.includes('neu-net')) m.neutrophil.netActive = true;
  // nkcell
  if (unlocked.includes('nk-range')) m.nkcell.rangeBonus = 0.5;
  if (unlocked.includes('nk-crit')) m.nkcell.critChance = 0.2;
  if (unlocked.includes('nk-adcc')) m.nkcell.adccActive = true;
  // dendritic
  if (unlocked.includes('den-radius')) m.dendritic.radiusBonus = 0.5;
  if (unlocked.includes('den-buff')) m.dendritic.buffMultiplier = 1.2;
  if (unlocked.includes('den-th1')) m.dendritic.th1Active = true;
  // mitochondria
  if (unlocked.includes('mit-yield')) m.mitochondria.yieldMultiplier = 1.25;
  if (unlocked.includes('mit-hp')) m.mitochondria.hpMultiplier = 1.3;
  if (unlocked.includes('mit-amp')) m.mitochondria.ampActive = true;
  return m;
}
