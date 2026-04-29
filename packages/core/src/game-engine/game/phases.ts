import { getLevelByMode } from './data/levels';
import { INTER_WAVE_BUILD_MS, expandCompositionRandom } from './data/waves';
import type { Bullet, Pathogen, SpawnerState, Tower } from './entities';
import {
  PATHOGEN_REWARDS,
  TOWER_DEFS,
  createPathogen,
  createSpawner,
  getTowerLevelDef,
} from './entities';
import type { GameEvent } from './events';
import { CELL_SIZE, GRID_SIZE } from './map';
import { PATHOGEN_REGISTRY } from './registry/pathogen-registry';
import { createRng } from './rng';
import type { GamePhase, GameState, StageResult } from './state';
import { computeScore, computeStars } from './state';
import { tickCombat } from './systems/combat';
import { pathogenLogicalPos, tickMovement } from './systems/movement';
import { straightLinePath } from './systems/pathfinding';
import { tickSpawner } from './systems/spawner';

export type NextIdFn = (prefix: string) => string;

export interface TickResult {
  state: GameState;
  events: GameEvent[];
}

/**
 * 主 tick 入口。按 phase 分派到 tickBuildPhase / tickWavePhase。
 * running=false / paused / phase='complete'|'failed' → 原 state 返回。
 */
export function tick(state: GameState, dt: number, nextId: NextIdFn): TickResult {
  if (!state.running || state.paused) return { state, events: [] };
  if (state.phase === 'complete' || state.phase === 'failed') return { state, events: [] };

  if (state.phase === 'build') {
    return tickBuildPhase(state, dt);
  }
  return tickWavePhase(state, dt, nextId);
}

/**
 * 推进所有 radialProjectile 塔的 rotation（弧度累加 = rotationSpeed × dt）。
 * 非 radial 塔保持不变。build / wave 两阶段都要调，保证"放塔后持续旋转"。
 */
function advanceTowerRotation(towers: readonly Tower[], dt: number): Tower[] {
  const dtSec = dt / 1000;
  return towers.map((t) => {
    const rp = TOWER_DEFS[t.type].radialProjectile;
    if (!rp) return { ...t };
    return { ...t, rotation: (t.rotation ?? 0) + rp.rotationSpeed * dtSec };
  });
}

/**
 * 推进所有子弹位置 + 命中检测 + 出界消失。
 * - 位置：col += vCol × dt, row += vRow × dt（dt 秒）
 * - 出界：超出 grid（含 0.2 格 buffer）的 bullet 直接移除
 * - 命中：步进后离最近存活病原 < 0.35 格 → 扣 HP、bullet 消失；死则加 kills
 */
function advanceBullets(
  bullets: readonly Bullet[],
  pathogens: readonly Pathogen[],
  path: readonly { col: number; row: number }[],
  dt: number,
  gridSize: number,
): {
  bullets: Bullet[];
  pathogens: Pathogen[];
  kills: string[];
  damageByOwner: Map<string, number>;
} {
  const dtSec = dt / 1000;
  const currentPathogens = pathogens.map((p) => ({ ...p }));
  const kills: string[] = [];
  const survivors: Bullet[] = [];
  const damageByOwner = new Map<string, number>();

  // 预计算存活病原格坐标（中心）
  const positions: Array<{ col: number; row: number } | null> = currentPathogens.map((p) => {
    if (!p.alive || p.reachedExit) return null;
    const { x, y } = pathogenLogicalPos(p, path, CELL_SIZE);
    return { col: x / CELL_SIZE, row: y / CELL_SIZE };
  });

  for (const b of bullets) {
    const nc = b.col + b.vCol * dtSec;
    const nr = b.row + b.vRow * dtSec;
    if (nc < -0.2 || nc > gridSize + 0.2 || nr < -0.2 || nr > gridSize + 0.2) continue;

    let hitIndex = -1;
    let hitDist = 0.35;
    for (let i = 0; i < currentPathogens.length; i++) {
      const pos = positions[i];
      if (!pos) continue;
      const d = Math.hypot(nc - pos.col, nr - pos.row);
      if (d < hitDist) {
        hitIndex = i;
        hitDist = d;
      }
    }
    if (hitIndex >= 0) {
      const target = currentPathogens[hitIndex];
      if (target) {
        // encapsulated: 单体子弹伤害 ×0.3（macrophage AoE 不打折，已在 combat.ts 单独处理）
        const factor = target.modifiers.includes('encapsulated') ? 0.3 : 1;
        const dmg = b.damage * factor;
        const actualDamage = Math.min(dmg, target.hp);
        damageByOwner.set(b.ownerId, (damageByOwner.get(b.ownerId) ?? 0) + actualDamage);
        const newHp = target.hp - dmg;
        if (newHp <= 0) {
          currentPathogens[hitIndex] = { ...target, hp: 0, alive: false };
          kills.push(target.id);
          positions[hitIndex] = null;
        } else {
          currentPathogens[hitIndex] = { ...target, hp: newHp };
        }
      }
      continue;
    }
    survivors.push({ ...b, col: nc, row: nr });
  }
  return { bullets: survivors, pathogens: currentPathogens, kills, damageByOwner };
}

/**
 * build 阶段 tick：倒计时递减；归零后 beginWave 进入波次。
 * 塔 rotation 持续推进；残留 bullets 也推进飞行/出界（波间自然消散，不产新子弹）。
 */
export function tickBuildPhase(state: GameState, dt: number): TickResult {
  const remaining = state.buildPhaseRemainingMs - dt;
  let rotatedTowers = advanceTowerRotation(state.towers, dt);
  // build 阶段 pathogens 通常已清空，bullets 纯飞行 + 出界消失
  const bulletsTick = advanceBullets(
    state.bullets,
    state.pathogens,
    state.currentPath,
    dt,
    GRID_SIZE,
  );
  if (bulletsTick.damageByOwner.size > 0) {
    rotatedTowers = rotatedTowers.map((t) => {
      const add = bulletsTick.damageByOwner.get(t.id);
      if (!add) return t;
      return { ...t, damageDealt: (t.damageDealt ?? 0) + add };
    });
  }

  if (remaining > 0) {
    return {
      state: {
        ...state,
        tickCount: state.tickCount + 1,
        buildPhaseRemainingMs: remaining,
        towers: rotatedTowers,
        pathogens: bulletsTick.pathogens,
        bullets: bulletsTick.bullets,
      },
      events: [],
    };
  }
  // 倒计时归零：先切 wave 再把 rotatedTowers / 清空 bullets 写回
  const entered = beginWave(state, state.waveIndex);
  return {
    state: {
      ...entered.state,
      towers: rotatedTowers,
      bullets: [],
    },
    events: entered.events,
  };
}

/**
 * 立即切到指定波次：phase='wave'、spawner 重置、发 WAVE_STARTED。
 */
export function beginWave(state: GameState, waveIndex: number): TickResult {
  const level = getLevelByMode(state.levelId, state.mode);
  const wave = level.waves[waveIndex];
  if (!wave) throw new Error(`关卡 ${level.id} 无效波次索引: ${waveIndex}`);
  const rng = createRng(state.rngState);
  const queue = expandCompositionRandom(wave, rng.next);
  return {
    state: {
      ...state,
      tickCount: state.tickCount + 1,
      phase: 'wave',
      waveIndex,
      buildPhaseRemainingMs: 0,
      rngState: rng.getState(),
      spawner: createSpawner(queue, wave.intervalMs),
    },
    events: [{ type: 'WAVE_STARTED', waveIndex }],
  };
}

/**
 * wave 阶段 tick：生成 → 移动 → 战斗 → HP 判定 → 波末判定。
 * 所有副作用（事件）累积到 events 数组返回。
 */
export function tickWavePhase(state: GameState, dt: number, nextId: NextIdFn): TickResult {
  const level = getLevelByMode(state.levelId, state.mode);
  const wave = level.waves[state.waveIndex];
  if (!wave) throw new Error(`关卡 ${level.id} 无效波次索引: ${state.waveIndex}`);

  const events: GameEvent[] = [];
  let pathogens: Pathogen[] = [...state.pathogens];
  // 先推进塔旋转，让本 tick 内 combat 读到的 tower.rotation 是最新值
  let towers: Tower[] = advanceTowerRotation(state.towers, dt);
  let spawner: SpawnerState = state.spawner;
  let { hp, atp } = state;
  const path = state.currentPath;

  // 1. 生成（教学关 isTutorial=true 跳过自动 spawn，由 GameScene.spawnPathogenForTutorial 手动驱动）
  let rngState = state.rngState;
  if (!level.isTutorial && spawner.active) {
    const entries = state.entries;
    // 寻路 goals = exits ∪ protectedCells coords（关 7 等无普通 exit 的关卡必须靠保护细胞作目标）
    const goals = [...state.exits, ...state.protectedCells.map((pc) => pc.coord)];
    const rng = createRng(rngState);
    spawner = tickSpawner(spawner, dt, (count, item) => {
      const id = nextId('p');
      const { type, modifiers: waveModifiers } = item;
      // round-robin 入口分配：第 N 个 spawn 走 entries[N % len]
      let entry = entries[count % entries.length] ?? entries[0];
      if (!entry) throw new Error('GameState.entries 为空，应至少有 1 个入口');
      // round-robin 目标分配：不再全部走最近 goal，多 goal 场景强制分流
      // 比如双 exit、双肺泡时，每 k 只病原去一个 goal，破除"全冲最近目标"漏洞
      const goal = goals[count % goals.length] ?? goals[0];
      if (!goal) throw new Error('GameState.exits 与 protectedCells 都为空，无 spawn goal');
      // 飞行判定从合并 modifiers 取（registry default ∪ wave config 显式 modifier），
      // 不再单读 def.flying（modifier 迁移后 def.flying 仅作 default 来源）
      const isFlying =
        (PATHOGEN_REGISTRY[type].defaultModifiers ?? []).includes('flying') ||
        waveModifiers.includes('flying');
      // A6：取消 opt-in，pathCellSet 始终非空（state.ts 无条件构建）。
      // 非飞行 + 非教学关 → 走 fixed-path 分支（state.paths round-robin）。
      // 飞行仍走 straightLinePath，教学关 spawner 不自动 tick（顶层守护跳过）。
      // 多入口/多路径对齐：path 数量应 ≥ entries × exits 笛卡尔积，否则
      // entries round-robin 选项会被 path[0] 覆盖；fallback 占位严格等于
      // entries × exits，显式 path 用户需自行保证。

      let ownPath: readonly { col: number; row: number }[];
      if (isFlying) {
        ownPath = straightLinePath(entry, goal);
      } else if (state.paths.length > 0) {
        const pathId = count % state.paths.length;
        const fixedPath = state.paths[pathId] ?? [];
        ownPath = fixedPath;
        // 用 path 首格覆盖 entry，保证 PATHOGEN_SPAWNED 事件 x/y 与 path 一致
        const first = fixedPath[0];
        if (first) entry = first;
      } else {
        // 兜底：理论上不会触发（state.ts 总会生成 fallback path）
        ownPath = straightLinePath(entry, goal);
      }
      const variance = {
        offsetX: (rng.next() - 0.5) * 28, // ±14 像素
        offsetY: (rng.next() - 0.5) * 28,
        speedMultiplier: 0.85 + rng.next() * 0.3, // 0.85 ~ 1.15
        path: ownPath,
      };
      const p = createPathogen(id, type, wave.hpMultiplier, variance, waveModifiers);
      pathogens = [...pathogens, p];
      events.push({
        type: 'PATHOGEN_SPAWNED',
        pathogenId: id,
        pathogenType: type,
        x: entry.col,
        y: entry.row,
      });
    });
    rngState = rng.getState();
  }

  // 2. 移动
  const moveResult = tickMovement(pathogens, path, dt, state.protectedCells, state.exits);
  pathogens = moveResult.pathogens;
  for (const hit of moveResult.coreHits) {
    hp = Math.max(0, hp - hit.damage);
    events.push({ type: 'PATHOGEN_REACHED_CORE', pathogenId: hit.id, damage: hit.damage });
    events.push({ type: 'CORE_DAMAGED', amount: hit.damage, remainingHp: hp });
  }
  // 处理保护细胞被攻击：扣 cell hp，发 PROTECTED_CELL_DAMAGED / DESTROYED 事件
  const updatedProtectedCells = state.protectedCells.map((pc) => ({ ...pc }));
  for (const hit of moveResult.protectedHits) {
    const pc = updatedProtectedCells.find((p) => `${p.coord.col}_${p.coord.row}` === hit.cellId);
    if (!pc) continue;
    pc.hp = Math.max(0, pc.hp - hit.damage);
    events.push({
      type: 'PROTECTED_CELL_DAMAGED',
      cellId: hit.cellId,
      remainingHp: pc.hp,
      sourceId: hit.id,
    });
    if (pc.hp === 0) {
      events.push({
        type: 'PROTECTED_CELL_DESTROYED',
        cellId: hit.cellId,
        col: pc.coord.col,
        row: pc.coord.row,
        name: pc.name,
      });
    }
  }

  // 2.5 regrow modifier tick：每秒回 5 hp（cap maxHp）
  const REGROW_RATE = 5; // hp/秒
  pathogens = pathogens.map((p) => {
    if (!p.alive || p.reachedExit) return p;
    if (!p.modifiers.includes('regrow')) return p;
    const newHp = Math.min(p.maxHp, p.hp + REGROW_RATE * (dt / 1000));
    return newHp === p.hp ? p : { ...p, hp: newHp };
  });

  // 3. 战斗（含研究 modifier；rng 用于 nk-crit 暴击随机）
  const combatRng = createRng(rngState);
  const combatResult = tickCombat(
    towers,
    pathogens,
    path,
    dt,
    level.dotMultiplier ?? 1,
    state.researchModifiers,
    combatRng.next,
  );
  rngState = combatRng.getState();
  towers = combatResult.towers;
  pathogens = combatResult.pathogens;
  const rewardMult = level.rewardMultiplier ?? 1;
  for (const id of combatResult.kills) {
    const killed = combatResult.pathogens.find((p) => p.id === id);
    const base = killed ? (PATHOGEN_REWARDS[killed.type] ?? 10) : 10;
    const reward = Math.max(1, Math.round(base * rewardMult));
    atp += reward;
    events.push({ type: 'PATHOGEN_KILLED', pathogenId: id, atpDropped: reward });
  }

  // 3b. 放射塔新发射的子弹：分配 id 融合 state.bullets；然后整体推进 + 碰撞
  let currentBullets: Bullet[] = [...state.bullets];
  for (const spec of combatResult.bulletsToSpawn) {
    currentBullets.push({ ...spec, id: nextId('b') });
    events.push({
      type: 'TOWER_FIRED',
      towerId: spec.ownerId,
      towerType:
        towers.find((t) => t.id === spec.ownerId)?.type ??
        state.towers.find((t) => t.id === spec.ownerId)?.type ??
        'neutrophil',
      targetIds: [], // 放射无指定目标
      originX: spec.col * CELL_SIZE,
      originY: spec.row * CELL_SIZE,
    });
  }
  const bulletsTick = advanceBullets(currentBullets, pathogens, path, dt, GRID_SIZE);
  pathogens = bulletsTick.pathogens;
  currentBullets = bulletsTick.bullets;
  if (bulletsTick.damageByOwner.size > 0) {
    towers = towers.map((t) => {
      const add = bulletsTick.damageByOwner.get(t.id);
      if (!add) return t;
      return { ...t, damageDealt: (t.damageDealt ?? 0) + add };
    });
  }
  for (const id of bulletsTick.kills) {
    const killed = pathogens.find((p) => p.id === id);
    const base = killed ? (PATHOGEN_REWARDS[killed.type] ?? 10) : 10;
    const reward = Math.max(1, Math.round(base * rewardMult));
    atp += reward;
    events.push({ type: 'PATHOGEN_KILLED', pathogenId: id, atpDropped: reward });
  }
  for (const fire of combatResult.fires) {
    events.push({
      type: 'TOWER_FIRED',
      towerId: fire.towerId,
      towerType: fire.towerType,
      targetIds: fire.targetIds,
      originX: fire.originX,
      originY: fire.originY,
    });
  }
  // DoT 伤害事件
  for (const dmg of combatResult.towerDamageEvents) {
    events.push({
      type: 'TOWER_DAMAGED',
      towerId: dmg.towerId,
      damage: dmg.damage,
      remainingHp: dmg.remainingHp,
      sourceIds: dmg.sourceIds,
    });
  }
  // 塔死亡：返还 25% + emit TOWER_DESTROYED
  for (const dead of combatResult.destroyedTowers) {
    const refund = Math.floor(dead.totalInvested * 0.25);
    atp += refund;
    events.push({
      type: 'TOWER_DESTROYED',
      towerId: dead.id,
      col: dead.col,
      row: dead.row,
      refund,
    });
  }
  // A6.3：fixed-path 模式 path 预设不变，塔死亡不重算 currentPath / reroute pathogens

  // 4. 先写回中间状态（避免判定时读到旧值）
  let nextState: GameState = {
    ...state,
    tickCount: state.tickCount + 1,
    hp,
    atp,
    towers,
    pathogens,
    bullets: currentBullets,
    spawner,
    rngState,
    protectedCells: updatedProtectedCells,
  };

  // 5. HP 归零 或 任一保护细胞 HP=0 → 失败
  const lostByProtection = updatedProtectedCells.some((pc) => pc.hp === 0);
  if (hp <= 0 || lostByProtection) {
    const ended = endStage(nextState, 'lost', hp, atp, nextState.waveIndex + 1);
    return { state: ended.state, events: [...events, ...ended.events] };
  }

  // 6. 波次完成判定：所有病原体已生成 + 全部不活跃
  const allSpawned = !spawner.active && spawner.spawnedCount >= spawner.queue.length;
  const allGone = pathogens.length > 0 && pathogens.every((p) => !p.alive || p.reachedExit);
  if (!allSpawned || !allGone) {
    return { state: nextState, events };
  }

  events.push({
    type: 'WAVE_ENDED',
    waveIndex: nextState.waveIndex,
    perfect: hp === 10,
  });

  // Phase B · B3：波末奖励 = 基础 + 完美波 + 线粒体产能
  // - base: 50 + waveIndex * 10（BTD6 公式对齐）
  // - perfect: 波末 HP === 关卡初始 HP（即全程未漏）→ +30
  // - economy: 所有 mitochondria 塔当级 atpPerWave 累加
  const base = 50 + nextState.waveIndex * 10;
  const perfectBonus = hp === level.initialHp ? 30 : 0;
  // 经济产能 = Σ atpPerWave × yieldMultiplier；Lv3 + ampActive 时额外 ×1.5
  const econMod = state.researchModifiers.mitochondria;
  let economyBonus = 0;
  for (const tower of nextState.towers) {
    if (tower.type !== 'mitochondria') continue;
    const lv = getTowerLevelDef(tower);
    let perWave = lv.economyBuff?.atpPerWave ?? 0;
    perWave *= econMod.yieldMultiplier;
    if (econMod.ampActive && tower.level === 3) perWave *= 1.5;
    economyBonus += Math.round(perWave);
  }
  const totalBonus = base + perfectBonus + economyBonus;
  atp += totalBonus;
  events.push({
    type: 'WAVE_BONUS',
    waveIndex: nextState.waveIndex,
    base,
    perfect: perfectBonus,
    economy: economyBonus,
    total: totalBonus,
  });
  nextState = { ...nextState, atp };

  // 最后一波 → 结算
  if (nextState.waveIndex >= nextState.totalWaves - 1) {
    const ended = endStage(nextState, 'won', hp, atp, nextState.totalWaves);
    return { state: ended.state, events: [...events, ...ended.events] };
  }

  // 否则进入下一个建造阶段
  nextState = {
    ...nextState,
    phase: 'build',
    waveIndex: nextState.waveIndex + 1,
    buildPhaseRemainingMs: level.interWaveBuildMs ?? INTER_WAVE_BUILD_MS,
    pathogens: [], // 清理已打完的病原体
  };
  return { state: nextState, events };
}

/**
 * 结算阶段：设置 phase='complete'|'failed' 并生成 stageResult，吐出 LEVEL_WON/LOST 事件。
 * 同时将 running 置为 false（对应旧 engine 的 this.stop()）。
 */
export function endStage(
  state: GameState,
  outcome: 'won' | 'lost',
  hp: number,
  atp: number,
  waveReached: number,
): TickResult {
  const stars = outcome === 'won' ? computeStars(hp) : 0;
  const score = computeScore(hp, atp);
  const result: StageResult = {
    outcome,
    stars,
    score,
    remainingHp: hp,
    remainingAtp: atp,
    waveReached,
  };
  const nextPhase: GamePhase = outcome === 'won' ? 'complete' : 'failed';
  const events: GameEvent[] = [];
  if (outcome === 'won') {
    events.push({ type: 'LEVEL_WON', stars: stars === 0 ? 1 : stars });
  } else {
    events.push({ type: 'LEVEL_LOST' });
  }
  return {
    state: {
      ...state,
      phase: nextPhase,
      stageResult: result,
      running: false,
      paused: false,
    },
    events,
  };
}
