import type { Bullet, Pathogen, TargetingPriority, Tower } from '../entities';
import { TOWER_DEFS, getTowerLevelDef } from '../entities';
import { CELL_SIZE } from '../map';
import { PATHOGEN_REGISTRY } from '../registry/pathogen-registry';
import { type ResearchModifierState, ZERO_MODIFIERS } from '../registry/research-modifiers';
import { TOWER_REGISTRY } from '../registry/tower-registry';
import { pathogenLogicalPos } from './movement';

/** 算 tower 的 effective range（按 modifier）。range 单位 = 格 */
function effectiveRange(tower: Tower, mods: ResearchModifierState): number {
  const base = getTowerLevelDef(tower).range;
  if (tower.type === 'macrophage') return base + mods.macrophage.aoeBonus;
  if (tower.type === 'nkcell') return base + mods.nkcell.rangeBonus;
  if (tower.type === 'dendritic') return base + mods.dendritic.radiusBonus;
  return base;
}

/** 算 tower 的 effective attack interval（ms） */
function effectiveCooldown(tower: Tower, mods: ResearchModifierState): number {
  const base = getTowerLevelDef(tower).attackIntervalMs;
  if (tower.type === 'neutrophil') return base * mods.neutrophil.rateMultiplier;
  return base;
}

/**
 * 算 tower 单发 damage（含 crit）。rng 仅 nkcell + critChance > 0 时**才消耗**——
 * critChance=0（默认）短路不调 rng，保持 simulator/replay 的 RNG 序列稳定（不引回归）。
 */
function effectiveDamage(tower: Tower, mods: ResearchModifierState, rng: () => number): number {
  let dmg = getTowerLevelDef(tower).damage;
  if (tower.type === 'neutrophil') dmg *= mods.neutrophil.dmgMultiplier;
  if (tower.type === 'nkcell' && mods.nkcell.critChance > 0 && rng() < mods.nkcell.critChance) {
    dmg *= 2;
  }
  return dmg;
}

/** dendritic helper buff dmgMultiplier 加上研究 buff */
function effectiveBuffMultiplier(tower: Tower, mods: ResearchModifierState): number {
  const base = getTowerLevelDef(tower).helperBuff?.dmgMultiplier ?? 1;
  if (tower.type === 'dendritic') return base * mods.dendritic.buffMultiplier;
  return base;
}

interface PathCoord {
  col: number;
  row: number;
}

export interface TowerFireRecord {
  towerId: string;
  towerType: string;
  targetIds: string[];
  originX: number;
  originY: number;
}

export interface TowerDamageRecord {
  towerId: string;
  damage: number;
  remainingHp: number;
  sourceIds: string[];
}

/**
 * 单体塔候选目标项：combat 在范围扫描时构造，selectTargetByPriority 用于排序选定。
 * key 为 pathIndex + progress（沿路径推进度，越大越靠近 exit）；dist 为塔到病原像素距离。
 * inAdccZone 为 nk-adcc 用：Lv3 NK 优先打 dendritic helper 范围内的目标 + 1.5 倍伤害。
 */
export interface SingleTargetCandidate {
  pathogen: Pathogen;
  index: number;
  key: number;
  dist: number;
  inAdccZone?: boolean;
}

/**
 * 按 4 种 TargetingPriority 选目标。空数组返回 null。
 * 同优先级有多个目标时，二级排序回退到 first（key desc）保持确定性。
 *
 * adccActive=true 时：先看 inAdccZone 候选——若有则只在该子集里选，无则走全集（原 priority）。
 */
export function selectTargetByPriority(
  inRange: readonly SingleTargetCandidate[],
  priority: TargetingPriority,
  adccActive = false,
): SingleTargetCandidate | null {
  if (inRange.length === 0) return null;
  // nk-adcc: 优先在 dendritic 范围内选目标；若该子集为空，回退全集
  const adccZoneCandidates = inRange.filter((c) => c.inAdccZone);
  const pool = adccActive && adccZoneCandidates.length > 0 ? adccZoneCandidates : inRange;
  const sorted = [...pool];
  switch (priority) {
    case 'first':
      sorted.sort((a, b) => b.key - a.key);
      break;
    case 'last':
      sorted.sort((a, b) => a.key - b.key);
      break;
    case 'strong':
      sorted.sort((a, b) => b.pathogen.hp - a.pathogen.hp || b.key - a.key);
      break;
    case 'close':
      sorted.sort((a, b) => a.dist - b.dist || b.key - a.key);
      break;
  }
  return sorted[0] ?? null;
}

interface CombatResult {
  towers: Tower[];
  pathogens: Pathogen[];
  kills: string[];
  fires: TowerFireRecord[];
  /** 放射塔本 tick spawn 的子弹（id 暂为空串，由上层 phases.ts 统一赋 id） */
  bulletsToSpawn: Omit<Bullet, 'id'>[];
  towerDamageEvents: TowerDamageRecord[];
  destroyedTowers: Tower[];
}

export function tickCombat(
  towers: readonly Tower[],
  pathogens: readonly Pathogen[],
  path: readonly PathCoord[],
  dt: number,
  dotMultiplier = 1,
  modifiers: ResearchModifierState = ZERO_MODIFIERS,
  rng: () => number = Math.random,
): CombatResult {
  let currentPathogens = pathogens.map((p) => ({ ...p }));
  const kills: string[] = [];
  const fires: TowerFireRecord[] = [];
  const bulletsToSpawn: Omit<Bullet, 'id'>[] = [];

  const updatedTowers = towers.map((tower) => {
    // M5/Phase B：helper / economy 塔不参与攻击循环，永远保持 cooldown=0
    const role = TOWER_REGISTRY[tower.type].role;
    if (role !== 'attack') {
      return { ...tower, cooldownMs: 0 };
    }

    const typeDef = TOWER_DEFS[tower.type];
    const mode = typeDef.targetingMode;
    const canTargetFlying = typeDef.canTargetFlying ?? true;
    const newCooldown = tower.cooldownMs + dt;

    // 应用研究 modifier：cooldown / range / damage / helper buff（可能含暴击随机）
    const effCooldown = effectiveCooldown(tower, modifiers);
    if (newCooldown < effCooldown) {
      return { ...tower, cooldownMs: newCooldown };
    }
    const effRange = effectiveRange(tower, modifiers);
    const rangePixels = effRange * CELL_SIZE;
    const tx = tower.col * CELL_SIZE + CELL_SIZE / 2;
    const ty = tower.row * CELL_SIZE + CELL_SIZE / 2;

    // 单发基础伤害（含 nk-crit 暴击 + neu-dmg）
    const baseDamage = effectiveDamage(tower, modifiers, rng);

    // M5：范围内 helper 塔提供 dmgMultiplier 乘法叠加（den-buff 在 effectiveBuffMultiplier 加 modifier）
    let damageWithHelper = baseDamage;
    for (const helper of towers) {
      if (helper.id === tower.id) continue;
      if (TOWER_REGISTRY[helper.type].role !== 'helper') continue;
      if (helper.hp <= 0) continue;
      const helperLevelDef = getTowerLevelDef(helper);
      const helperRangeBonus = helper.type === 'dendritic' ? modifiers.dendritic.radiusBonus : 0;
      const helperRange = helperLevelDef.range + helperRangeBonus;
      const dist = Math.hypot(helper.col - tower.col, helper.row - tower.row);
      if (dist > helperRange) continue;
      const buffMul = effectiveBuffMultiplier(helper, modifiers);
      damageWithHelper *= buffMul;
    }
    void baseDamage;
    // 下方使用的最终伤害（基础 + 暴击 + helper buff 叠加）
    const finalDamage = damageWithHelper;

    // 放射发射塔（neutrophil 类）：不走 single/aoe 命中循环，cooldown 到了就
    // 按塔当前 rotation 作基准角 + 360°/N 均分方向 spawn N 枚子弹，子弹之后
    // 在 phases.ts 里 tick 飞行 + 命中检测。目标扫描全免（range=Infinity）。
    const radial = typeDef.radialProjectile;
    if (radial) {
      const count = radial.bulletCountByLevel[tower.level - 1] ?? 0;
      if (count > 0) {
        const baseAngle = tower.rotation ?? 0;
        const startCol = tower.col + 0.5; // 塔中心（格坐标）
        const startRow = tower.row + 0.5;
        for (let i = 0; i < count; i++) {
          const a = baseAngle + (i * 2 * Math.PI) / count;
          bulletsToSpawn.push({
            ownerId: tower.id,
            col: startCol,
            row: startRow,
            vCol: Math.cos(a) * radial.bulletSpeed,
            vRow: Math.sin(a) * radial.bulletSpeed,
            damage: finalDamage,
          });
        }
      }
      // neu-net: Lv3 中性粒每 5s 释放捕获网，3 格范围内 pathogen 减速 1s
      let nextNetCd = tower.netCooldownMs ?? 0;
      const netActive =
        tower.type === 'neutrophil' && tower.level === 3 && modifiers.neutrophil.netActive;
      if (netActive) {
        nextNetCd += dt;
        if (nextNetCd >= 5000) {
          nextNetCd -= 5000;
          const netRangePixels = 3 * CELL_SIZE;
          currentPathogens = currentPathogens.map((p) => {
            if (!p.alive || p.reachedExit) return p;
            const { x, y } = pathogenLogicalPos(p, path, CELL_SIZE);
            const dist = Math.hypot(x - tx, y - ty);
            if (dist > netRangePixels) return p;
            return { ...p, slowMs: Math.max(p.slowMs, 1000) };
          });
        }
      }
      return { ...tower, cooldownMs: 0, netCooldownMs: nextNetCd };
    }

    // nk-adcc: Lv3 NK 优先打 dendritic helper 范围内的敌人，命中 ×1.5 伤害
    const adccActive = tower.type === 'nkcell' && tower.level === 3 && modifiers.nkcell.adccActive;
    // 计算 dendritic helper 范围（用于标记 inAdccZone）。仅 adccActive 时才计算
    let dendriticZones: Array<{ cx: number; cy: number; r: number }> = [];
    if (adccActive) {
      dendriticZones = towers
        .filter((h) => h.type === 'dendritic' && h.hp > 0)
        .map((h) => {
          const helperLevelDef = getTowerLevelDef(h);
          const r = helperLevelDef.range + modifiers.dendritic.radiusBonus;
          return {
            cx: h.col * CELL_SIZE + CELL_SIZE / 2,
            cy: h.row * CELL_SIZE + CELL_SIZE / 2,
            r: r * CELL_SIZE,
          };
        });
    }

    // camouflaged: 仅在任一 dendritic 范围内可被任何塔看到
    // 复用 nk-adcc 已经算过的 dendriticZones（如果未算则现算 - 共享一份零成本数据）
    const camouflagedZones =
      dendriticZones.length > 0
        ? dendriticZones
        : towers
            .filter((h) => h.type === 'dendritic' && h.hp > 0)
            .map((h) => {
              const helperLevelDef = getTowerLevelDef(h);
              const r = helperLevelDef.range + modifiers.dendritic.radiusBonus;
              return {
                cx: h.col * CELL_SIZE + CELL_SIZE / 2,
                cy: h.row * CELL_SIZE + CELL_SIZE / 2,
                r: r * CELL_SIZE,
              };
            });

    const inRange: SingleTargetCandidate[] = [];
    currentPathogens.forEach((p, index) => {
      if (!p.alive || p.reachedExit) return;
      // 飞行过滤：不能打空的塔忽略飞行目标
      if (p.flying && !canTargetFlying) return;
      const { x, y } = pathogenLogicalPos(p, path, CELL_SIZE);
      const dist = Math.hypot(x - tx, y - ty);
      if (dist > rangePixels) return;
      // camouflaged: 仅在任一 dendritic 范围内可被打到（不在则跳过）
      if (p.modifiers.includes('camouflaged')) {
        const seen = camouflagedZones.some((z) => Math.hypot(x - z.cx, y - z.cy) <= z.r);
        if (!seen) return;
      }
      // 标记是否在任一 dendritic 范围内（nk-adcc 用）
      let inAdccZone = false;
      if (adccActive) {
        for (const z of dendriticZones) {
          if (Math.hypot(x - z.cx, y - z.cy) <= z.r) {
            inAdccZone = true;
            break;
          }
        }
      }
      inRange.push({ pathogen: p, index, key: p.pathIndex + p.progress, dist, inAdccZone });
    });

    if (mode === 'single') {
      // 无目标：保留冷却（蓄力），有目标立即射；按 tower.targetingPriority 选目标
      const target = selectTargetByPriority(inRange, tower.targetingPriority, adccActive);
      if (!target) {
        return { ...tower, cooldownMs: newCooldown };
      }
      // adcc: 目标在 dendritic 范围内 ×1.5 伤害
      // encapsulated: 单体伤害 ×0.3（与 adcc 同时叠加 → 0.45）
      const adccBonus = adccActive && target.inAdccZone ? 1.5 : 1;
      const encapsulatedFactor = target.pathogen.modifiers.includes('encapsulated') ? 0.3 : 1;
      const adccFinalDamage = finalDamage * adccBonus * encapsulatedFactor;
      const actualDamage = Math.min(adccFinalDamage, target.pathogen.hp);
      const newHp = target.pathogen.hp - adccFinalDamage;
      const updated: Pathogen =
        newHp <= 0
          ? { ...target.pathogen, hp: 0, alive: false }
          : { ...target.pathogen, hp: newHp };
      currentPathogens = currentPathogens.map((p, i) => (i === target.index ? updated : p));
      if (newHp <= 0) kills.push(target.pathogen.id);
      fires.push({
        towerId: tower.id,
        towerType: tower.type,
        targetIds: [target.pathogen.id],
        originX: tx,
        originY: ty,
      });
      return {
        ...tower,
        cooldownMs: 0,
        damageDealt: (tower.damageDealt ?? 0) + actualDamage,
      };
    }

    // aoe：范围内无目标也不开火，保留冷却蓄力
    if (inRange.length === 0) {
      return { ...tower, cooldownMs: newCooldown };
    }
    // mac-m1: Lv3 巨噬攻击附带 0.5s 减速（仅 macrophage Lv3 + modifier 激活）
    const applySlowToAoe =
      tower.type === 'macrophage' && tower.level === 3 && modifiers.macrophage.m1Polarized;
    const hitIndexSet = new Set(inRange.map((r) => r.index));
    const hitIds: string[] = [];
    let aoeActualSum = 0;
    currentPathogens = currentPathogens.map((p, i) => {
      if (!hitIndexSet.has(i)) return p;
      aoeActualSum += Math.min(finalDamage, p.hp);
      const newHp = p.hp - finalDamage;
      hitIds.push(p.id);
      if (newHp <= 0) {
        kills.push(p.id);
        return { ...p, hp: 0, alive: false };
      }
      return { ...p, hp: newHp, slowMs: applySlowToAoe ? 500 : p.slowMs };
    });
    fires.push({
      towerId: tower.id,
      towerType: tower.type,
      targetIds: hitIds,
      originX: tx,
      originY: ty,
    });
    return {
      ...tower,
      cooldownMs: 0,
      damageDealt: (tower.damageDealt ?? 0) + aoeActualSum,
    };
  });

  // DoT 计算：病原体相邻 8 格内（Chebyshev ≤ 1）的塔被持续伤害
  const damagePerTower = new Map<string, { dmg: number; sources: Set<string> }>();
  for (const p of currentPathogens) {
    if (!p.alive || p.reachedExit) continue;
    const dot = PATHOGEN_REGISTRY[p.type].dot;
    if (dot <= 0) continue;
    const { x, y } = pathogenLogicalPos(p, path, CELL_SIZE);
    const pCol = Math.floor(x / CELL_SIZE);
    const pRow = Math.floor(y / CELL_SIZE);
    for (const t of updatedTowers) {
      if (t.hp <= 0) continue;
      if (Math.abs(t.col - pCol) > 1 || Math.abs(t.row - pRow) > 1) continue;
      const dmg = dot * (dt / 1000) * dotMultiplier;
      const entry = damagePerTower.get(t.id) ?? { dmg: 0, sources: new Set<string>() };
      entry.dmg += dmg;
      entry.sources.add(p.id);
      damagePerTower.set(t.id, entry);
    }
  }

  const towerDamageEvents: TowerDamageRecord[] = [];
  const finalTowers = updatedTowers.map((t) => {
    const dmgEntry = damagePerTower.get(t.id);
    if (!dmgEntry) return t;
    const newHp = Math.max(0, t.hp - dmgEntry.dmg);
    towerDamageEvents.push({
      towerId: t.id,
      damage: dmgEntry.dmg,
      remainingHp: newHp,
      sourceIds: Array.from(dmgEntry.sources),
    });
    return { ...t, hp: newHp };
  });

  const aliveTowers = finalTowers.filter((t) => t.hp > 0);
  const destroyedTowers = finalTowers.filter((t) => t.hp <= 0);

  // den-th1: Lv3 dendritic + th1Active 时，范围内攻击塔 maxHp × 1.5
  // 每 tick 重算（dendritic 销毁 / 移出范围时立刻还原）；hp 不动，仅扩 cap
  const th1Towers = modifiers.dendritic.th1Active
    ? aliveTowers.filter(
        (t) =>
          t.type === 'dendritic' && t.level === 3 && TOWER_REGISTRY.dendritic.role === 'helper',
      )
    : [];
  const th1FinalTowers =
    th1Towers.length === 0
      ? aliveTowers
      : aliveTowers.map((t) => {
          if (t.type === 'dendritic') return t; // helper 自身不享受
          const baseMaxHp = Math.round(
            getTowerLevelDef(t).hp *
              (t.type === 'macrophage' ? modifiers.macrophage.hpMultiplier : 1),
          );
          // 检查是否在任一 Lv3 dendritic 的 (range + radiusBonus) 内
          const inTh1 = th1Towers.some((h) => {
            const helperLevelDef = getTowerLevelDef(h);
            const helperRange = helperLevelDef.range + modifiers.dendritic.radiusBonus;
            return Math.hypot(h.col - t.col, h.row - t.row) <= helperRange;
          });
          const newMaxHp = inTh1 ? Math.round(baseMaxHp * 1.5) : baseMaxHp;
          if (newMaxHp === t.maxHp) return t;
          return { ...t, maxHp: newMaxHp };
        });

  return {
    towers: th1FinalTowers,
    pathogens: currentPathogens,
    kills,
    fires,
    bulletsToSpawn,
    towerDamageEvents,
    destroyedTowers,
  };
}
