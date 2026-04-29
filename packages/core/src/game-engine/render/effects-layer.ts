import type { GameObjects, Scene } from 'phaser';
import type { Pathogen, Tower } from '../game/entities';
import { HEX } from '../style';
import { getPathogenBattleColor, getTowerBattleColor } from './entity-colors';
import type { GridLayer } from './grid-layer';

interface ParticleBurst {
  kind: 'burst';
  x: number;
  y: number;
  color: number;
  ageMs: number;
  lifetimeMs: number;
  bits: { dx: number; dy: number; r: number }[];
}

interface ParticleRipple {
  kind: 'ripple';
  x: number;
  y: number;
  color: number;
  ageMs: number;
  lifetimeMs: number;
  maxR: number;
}

interface ParticleFlash {
  kind: 'flash';
  x: number;
  y: number;
  color: number;
  ageMs: number;
  lifetimeMs: number;
  maxR: number;
}

type Particle = ParticleBurst | ParticleRipple | ParticleFlash;

interface ActiveFire {
  towerType: string;
  targetIds: readonly string[];
  originX: number;
  originY: number;
  rangePixels: number;
  ageMs: number;
  lifetimeMs: number;
}

// 颜色常量已收敛到 registry.meta.battleColor，统一通过 entity-colors helper 获取

/**
 * 战斗特效统一层：死亡 burst / 放置 ripple / 升级 flash / 攻击射线 + 波纹。
 * 复刻 React 版 GameRenderer 的 effects + particles 逻辑。
 * 每帧 tick 老化，自动销毁过期，全部粒子用一个 Graphics 绘制。
 */
export class EffectsLayer {
  private scene: Scene;
  private particles: Particle[] = [];
  private fires: ActiveFire[] = [];
  private particleGfx: GameObjects.Graphics;
  private fireGfx: GameObjects.Graphics;

  constructor(scene: Scene) {
    this.scene = scene;
    this.fireGfx = scene.add.graphics();
    this.particleGfx = scene.add.graphics();
    this.fireGfx.setDepth(80);
    this.particleGfx.setDepth(81);

    // 运行时生成 spark texture（白色软圆点，给 ParticleEmitter 用）
    if (!scene.textures.exists('spark')) {
      const g = scene.add.graphics();
      g.fillStyle(HEX.white, 1).fillCircle(8, 8, 7);
      g.fillStyle(HEX.white, 0.5).fillCircle(8, 8, 4);
      g.generateTexture('spark', 16, 16);
      g.destroy();
    }
  }

  spawnPathogenDeath(x: number, y: number, type: string): void {
    const color = getPathogenBattleColor(type);
    const isBoss = type === 'saureus';
    const quantity = isBoss ? 32 : 12;
    const speed = isBoss ? { min: 120, max: 260 } : { min: 60, max: 130 };
    const lifespan = isBoss ? { min: 500, max: 800 } : { min: 350, max: 500 };
    const scale = isBoss ? { start: 1.0, end: 0 } : { start: 0.6, end: 0 };
    const emitter = this.scene.add.particles(x, y, 'spark', {
      speed,
      angle: { min: 0, max: 360 },
      lifespan,
      scale,
      tint: color,
      alpha: { start: 1, end: 0 },
      emitting: false,
      blendMode: 'ADD',
    });
    emitter.setDepth(82);
    emitter.explode(quantity);
    // boss 加一圈白色冲击波（小 emitter）
    if (isBoss) {
      const shock = this.scene.add.particles(x, y, 'spark', {
        speed: { min: 200, max: 280 },
        angle: { min: 0, max: 360 },
        lifespan: 400,
        scale: { start: 0.4, end: 0 },
        tint: HEX.white,
        alpha: { start: 0.9, end: 0 },
        emitting: false,
        blendMode: 'ADD',
      });
      shock.setDepth(83);
      shock.explode(20);
      this.scene.time.delayedCall(600, () => shock.destroy());
    }
    this.scene.time.delayedCall(isBoss ? 900 : 600, () => emitter.destroy());
  }

  /**
   * 塔死亡爆炸：红色破碎粒子 + 红色冲击波环。
   * 与 spawnTowerSell 的区别——固定红色而非塔色，强调"被击毁"的负反馈。
   */
  spawnTowerDestroy(x: number, y: number, cellSize: number): void {
    const emitter = this.scene.add.particles(x, y, 'spark', {
      speed: { min: 80, max: 160 },
      angle: { min: 0, max: 360 },
      lifespan: 600,
      scale: { start: 0.6, end: 0 },
      tint: HEX.hpLow,
      alpha: { start: 1, end: 0 },
      emitting: false,
      blendMode: 'ADD',
    });
    emitter.setDepth(82);
    emitter.explode(16);
    this.scene.time.delayedCall(700, () => emitter.destroy());

    // 红色冲击波环：半径 0 → cellSize, alpha 0.8 → 0
    const ring = this.scene.add.graphics();
    ring.setDepth(82);
    const state = { r: 0, alpha: 0.8 };
    this.scene.tweens.add({
      targets: state,
      r: cellSize,
      alpha: 0,
      duration: 380,
      ease: 'Quad.out',
      onUpdate: () => {
        ring.clear();
        ring.lineStyle(2, HEX.hpLow, state.alpha).strokeCircle(x, y, state.r);
      },
      onComplete: () => ring.destroy(),
    });
  }

  /** 拆除塔粒子爆散：用塔色 + 大爆炸 */
  spawnTowerSell(x: number, y: number, type: string): void {
    const color = getTowerBattleColor(type);
    const emitter = this.scene.add.particles(x, y, 'spark', {
      speed: { min: 100, max: 220 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 400, max: 650 },
      scale: { start: 0.8, end: 0 },
      tint: color,
      alpha: { start: 1, end: 0 },
      emitting: false,
      blendMode: 'ADD',
    });
    emitter.setDepth(82);
    emitter.explode(20);
    this.scene.time.delayedCall(750, () => emitter.destroy());
  }

  spawnTowerPlace(x: number, y: number, type: string, cellSize: number): void {
    const color = getTowerBattleColor(type);
    this.particles.push({
      kind: 'ripple',
      x,
      y,
      color,
      ageMs: 0,
      lifetimeMs: 420,
      maxR: cellSize * 0.9,
    });
  }

  spawnTowerUpgrade(x: number, y: number, type: string, cellSize: number): void {
    const color = getTowerBattleColor(type);
    this.particles.push({
      kind: 'flash',
      x,
      y,
      color,
      ageMs: 0,
      lifetimeMs: 280,
      maxR: cellSize * 0.55,
    });
  }

  pushFire(opts: {
    towerType: string;
    targetIds: readonly string[];
    originX: number;
    originY: number;
    rangePixels: number;
  }): void {
    const single = opts.towerType === 'neutrophil' || opts.towerType === 'nkcell';
    this.fires.push({
      towerType: opts.towerType,
      targetIds: opts.targetIds,
      originX: opts.originX,
      originY: opts.originY,
      rangePixels: opts.rangePixels,
      ageMs: 0,
      lifetimeMs: single ? 140 : 220,
    });
    // AoE 塔（macrophage）开火时叠加一圈环形粒子（半径 = rangePixels）
    if (!single) {
      const color = getTowerBattleColor(opts.towerType);
      const ringEmitter = this.scene.add.particles(opts.originX, opts.originY, 'spark', {
        speed: opts.rangePixels * 5, // 在 lifespan 内冲到 range 边
        angle: { min: 0, max: 360 },
        lifespan: 200,
        scale: { start: 0.4, end: 0 },
        tint: color,
        alpha: { start: 0.9, end: 0 },
        emitting: false,
        blendMode: 'ADD',
      });
      ringEmitter.setDepth(82);
      ringEmitter.explode(16);
      this.scene.time.delayedCall(300, () => ringEmitter.destroy());
    }
  }

  tick(
    dtMs: number,
    pathogens: readonly Pathogen[],
    grid: GridLayer,
    currentPath: readonly { col: number; row: number }[],
  ): void {
    // 推进生命周期
    for (const p of this.particles) p.ageMs += dtMs;
    this.particles = this.particles.filter((p) => p.ageMs < p.lifetimeMs);
    for (const f of this.fires) f.ageMs += dtMs;
    this.fires = this.fires.filter((f) => f.ageMs < f.lifetimeMs);

    // 重画粒子
    this.particleGfx.clear();
    for (const p of this.particles) {
      const t = Math.min(1, p.ageMs / p.lifetimeMs);
      if (p.kind === 'burst') {
        const alpha = 1 - t;
        this.particleGfx.fillStyle(p.color, alpha);
        for (const b of p.bits) {
          const px = p.x + (b.dx * p.ageMs) / 1000;
          const py = p.y + (b.dy * p.ageMs) / 1000;
          this.particleGfx.fillCircle(px, py, b.r * (1 - t * 0.6));
        }
      } else if (p.kind === 'ripple') {
        const alpha = 0.7 * (1 - t);
        const r = p.maxR * t;
        this.particleGfx.lineStyle(2, p.color, alpha).strokeCircle(p.x, p.y, r);
      } else {
        const peak = 0.4;
        const scale = t < peak ? t / peak : 1;
        const alpha = 0.8 * (1 - t) * scale;
        this.particleGfx.fillStyle(p.color, alpha).fillCircle(p.x, p.y, p.maxR * scale);
      }
    }

    // 重画 fire（攻击射线 / 波纹环）
    this.fireGfx.clear();
    if (this.fires.length === 0) return;
    for (const f of this.fires) {
      const t = Math.min(1, f.ageMs / f.lifetimeMs);
      if (f.towerType === 'neutrophil' || f.towerType === 'nkcell') {
        // 单体射线
        const color = getTowerBattleColor(f.towerType);
        const alpha = 0.95 * (1 - t);
        for (const tid of f.targetIds) {
          const p = pathogens.find((x) => x.id === tid);
          if (!p) continue;
          const pos = pathogenWorldPos(p, currentPath, grid);
          this.fireGfx.lineStyle(2, color, alpha).lineBetween(f.originX, f.originY, pos.x, pos.y);
        }
      } else {
        // AoE 波纹环
        const alpha = 0.5 * (1 - t);
        const radius = f.rangePixels * t;
        this.fireGfx
          .lineStyle(2, getTowerBattleColor('macrophage'), alpha)
          .strokeCircle(f.originX, f.originY, radius);
      }
    }
  }

  destroy(): void {
    this.fireGfx.destroy();
    this.particleGfx.destroy();
  }
}

function pathogenWorldPos(
  p: Pathogen,
  currentPath: readonly { col: number; row: number }[],
  grid: GridLayer,
): { x: number; y: number } {
  const seg = p.path.length > 0 ? p.path : currentPath;
  if (seg.length === 0) return grid.cellToWorld(0, 0);
  const curIdx = Math.min(p.pathIndex, seg.length - 1);
  const nextIdx = Math.min(p.pathIndex + 1, seg.length - 1);
  const cur = seg[curIdx] ?? seg[0];
  const next = seg[nextIdx] ?? cur;
  if (!cur || !next) return grid.cellToWorld(0, 0);
  const lerpCol = cur.col + (next.col - cur.col) * p.progress;
  const lerpRow = cur.row + (next.row - cur.row) * p.progress;
  const w = grid.cellToWorld(lerpCol, lerpRow);
  return { x: w.x + p.offsetX, y: w.y + p.offsetY };
}

export function towerWorldPos(t: Tower, grid: GridLayer): { x: number; y: number } {
  return grid.cellToWorld(t.col, t.row);
}
