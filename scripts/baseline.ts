#!/usr/bin/env bun
/**
 * baseline.ts — 塔 / 敌基础数值基准表。
 *
 * 用来判断 PATHOGEN_REGISTRY / TOWER_LEVELS 里的数字是否合理：
 * - 每种塔的 DPS / 性价比 / 升级收益
 * - 每种敌的威胁度 / 经济价值
 * - 塔 × 敌 TTK 矩阵
 * - 塔 × 敌 "单挑存活" 仿真（塔能否在被 DoT 啃死前击杀敌）
 *
 * 用法：bun run baseline  或直接  bun scripts/baseline.ts
 */

import type { PathogenType, TowerType } from '../src/game-engine/game/entities';
import {
  PATHOGEN_DEFS,
  PATHOGEN_REWARDS,
  TOWER_DEFS,
  TOWER_LEVELS,
} from '../src/game-engine/game/entities';
import { PATHOGEN_REGISTRY } from '../src/game-engine/game/registry/pathogen-registry';

const TOWER_TYPES: readonly TowerType[] = ['macrophage', 'neutrophil', 'nkcell', 'dendritic'];
const PATHOGEN_TYPES: readonly PathogenType[] = [
  'rhinovirus',
  'influenza',
  'ecoli',
  'saureus',
  'aspergillus',
];

function pad(s: string | number, w: number): string {
  const str = String(s);
  // 简单等宽，不算中文宽度
  if (str.length >= w) return str;
  return str + ' '.repeat(w - str.length);
}
function padR(s: string | number, w: number): string {
  const str = String(s);
  if (str.length >= w) return str;
  return ' '.repeat(w - str.length) + str;
}

function dpsOf(type: TowerType, level: 1 | 2 | 3): number {
  const lv = TOWER_LEVELS[type][level - 1];
  if (!lv || lv.attackIntervalMs === 0) return 0;
  return lv.damage / (lv.attackIntervalMs / 1000);
}

function canHit(tower: TowerType, pathogen: PathogenType): boolean {
  const pdef = PATHOGEN_DEFS[pathogen];
  const tdef = TOWER_DEFS[tower];
  if (pdef.flying && tdef.canTargetFlying === false) return false;
  return true;
}

/** 单塔 solo 击杀 1 敌的理论 TTK（忽略 DoT 塔损耗）。damage=0 返回 Infinity。 */
function ttkSec(tower: TowerType, level: 1 | 2 | 3, pathogen: PathogenType): number {
  if (!canHit(tower, pathogen)) return Number.POSITIVE_INFINITY;
  const dps = dpsOf(tower, level);
  if (dps <= 0) return Number.POSITIVE_INFINITY;
  const hp = PATHOGEN_DEFS[pathogen].maxHp;
  return hp / dps;
}

// ---------- 报表 ----------

function tableTowerStats(): void {
  console.log('\n=== 塔基础数值 ===');
  const rows: string[][] = [['塔', '成本', 'DPS(L1)', 'DPS(L3)', 'HP(L1)', 'HP(L3)', '射程', '模式', '打空?', 'L1→L2', 'L2→L3']];
  for (const t of TOWER_TYPES) {
    const def = TOWER_DEFS[t];
    const lv1 = TOWER_LEVELS[t][0]!;
    const lv2 = TOWER_LEVELS[t][1]!;
    const lv3 = TOWER_LEVELS[t][2]!;
    rows.push([
      t,
      String(def.cost),
      dpsOf(t, 1).toFixed(1),
      dpsOf(t, 3).toFixed(1),
      String(lv1.hp),
      String(lv3.hp),
      lv1.range.toFixed(1),
      def.targetingMode,
      def.canTargetFlying === false ? 'no' : 'yes',
      String(lv1.upgradeCost ?? '-'),
      String(lv2.upgradeCost ?? '-'),
    ]);
  }
  printTable(rows);
}

function tablePathogenStats(): void {
  console.log('\n=== 敌基础数值 ===');
  const rows: string[][] = [
    ['敌', 'HP', '速度', '核心伤害', 'DoT', 'Reward', 'HP/Reward', '飞行?'],
  ];
  for (const p of PATHOGEN_TYPES) {
    const def = PATHOGEN_DEFS[p];
    const reward = PATHOGEN_REWARDS[p] ?? 10;
    const dot = PATHOGEN_REGISTRY[p].dot;
    rows.push([
      p,
      String(def.maxHp),
      def.speed.toFixed(1),
      String(def.coreDamage),
      String(dot),
      String(reward),
      (def.maxHp / reward).toFixed(2),
      def.flying ? 'yes' : 'no',
    ]);
  }
  printTable(rows);
}

function tableCostEfficiency(): void {
  console.log('\n=== 性价比（Lv1） ===');
  console.log('DPS/ATP = 每单位成本每秒输出伤害');
  console.log('HP/ATP  = 每单位成本获得 HP（DoT 耐受力）');
  console.log('score   = DPS/ATP × sqrt(HP/cost) 综合打击面指标\n');
  const rows: string[][] = [['塔', 'DPS', 'Cost', 'DPS/ATP', 'HP/ATP', 'Range×DPS/ATP']];
  for (const t of TOWER_TYPES) {
    const def = TOWER_DEFS[t];
    const lv1 = TOWER_LEVELS[t][0]!;
    const dps = dpsOf(t, 1);
    rows.push([
      t,
      dps.toFixed(1),
      String(def.cost),
      (dps / def.cost).toFixed(2),
      (lv1.hp / def.cost).toFixed(2),
      ((lv1.range * dps) / def.cost).toFixed(2),
    ]);
  }
  printTable(rows);
}

function tableTtkMatrix(level: 1 | 2 | 3): void {
  console.log(`\n=== TTK 矩阵（Lv${level}，秒）===`);
  console.log('单塔 solo 击杀 1 敌所需时间；"-" 表示无法命中\n');
  const header = ['塔 \\ 敌', ...PATHOGEN_TYPES];
  const rows: string[][] = [header];
  for (const t of TOWER_TYPES) {
    if (dpsOf(t, level) === 0) continue;
    const row: string[] = [t];
    for (const p of PATHOGEN_TYPES) {
      const t_ttk = ttkSec(t, level, p);
      row.push(t_ttk === Number.POSITIVE_INFINITY ? '-' : `${t_ttk.toFixed(2)}s`);
    }
    rows.push(row);
  }
  printTable(rows);
}

function tableKillEconomy(level: 1 | 2 | 3): void {
  console.log(`\n=== 经济效率（Lv${level}） ===`);
  console.log('单塔击杀 1 敌的 ATP 净收益（忽略塔损耗）= reward - 塔成本 / 击杀数\n');
  const header = ['塔 \\ 敌', ...PATHOGEN_TYPES];
  const rows: string[][] = [header];
  for (const t of TOWER_TYPES) {
    const def = TOWER_DEFS[t];
    const dps = dpsOf(t, level);
    if (dps === 0) continue;
    const row: string[] = [t];
    for (const p of PATHOGEN_TYPES) {
      if (!canHit(t, p)) {
        row.push('-');
        continue;
      }
      const reward = PATHOGEN_REWARDS[p] ?? 10;
      const breakEvenKills = Math.ceil(def.cost / reward);
      row.push(`${reward}/只·回本${breakEvenKills}只`);
    }
    rows.push(row);
  }
  printTable(rows);
}

/** 暴露面：一座塔 vs 敌流 solo 抗几只（塔受 DoT 损耗，忽略其他塔支援）。 */
function tableSoloSurvival(level: 1 | 2 | 3, dotMult = 1.0): void {
  console.log(`\n=== 单塔存活（Lv${level}，dotMultiplier=${dotMult}） ===`);
  console.log('敌人连续贴脸（DoT 每秒扣塔 HP），塔能杀几只后死亡？\n');
  const header = ['塔 \\ 敌', ...PATHOGEN_TYPES];
  const rows: string[][] = [header];
  for (const t of TOWER_TYPES) {
    const lv = TOWER_LEVELS[t][level - 1]!;
    const dps = dpsOf(t, level);
    if (dps === 0) {
      rows.push([t, ...PATHOGEN_TYPES.map(() => '-')]);
      continue;
    }
    const row: string[] = [t];
    for (const p of PATHOGEN_TYPES) {
      if (!canHit(t, p)) {
        row.push('-');
        continue;
      }
      // 近似：每只敌在塔范围内 TTK 秒，DoT = pathogen.dot × dotMult
      // 塔 HP / DoT = 存活秒数；能杀的敌数 = 存活秒数 / TTK
      const ttk = ttkSec(t, level, p);
      const dot = PATHOGEN_REGISTRY[p].dot * dotMult;
      if (dot === 0) {
        row.push('∞');
        continue;
      }
      // 简化：同一只敌 TTK 秒内对塔造成 dot × TTK 伤害
      // 塔从满 HP 到 0 能杀：HP / (dot × TTK) 只
      const killsBeforeDeath = lv.hp / (dot * ttk);
      row.push(killsBeforeDeath.toFixed(1));
    }
    rows.push(row);
  }
  printTable(rows);
}

function printTable(rows: readonly (readonly string[])[]): void {
  if (rows.length === 0) return;
  const widths = rows[0]!.map((_, col) => Math.max(...rows.map((r) => (r[col] ?? '').length)));
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const line = r.map((c, col) => (col === 0 ? pad(c, widths[col]!) : padR(c, widths[col]!))).join('  ');
    console.log(line);
    if (i === 0) console.log('-'.repeat(line.length));
  }
}

// ---------- main ----------

console.log('═══ 塔 / 敌基础数值基准 ═══');
tableTowerStats();
tablePathogenStats();
tableCostEfficiency();
tableTtkMatrix(1);
tableTtkMatrix(3);
tableKillEconomy(1);
tableSoloSurvival(1, 0.8); // Ch.1 dotMultiplier 0.8
tableSoloSurvival(1, 1.0); // Ch.2+ 默认
tableSoloSurvival(3, 1.0); // Lv3 塔默认
