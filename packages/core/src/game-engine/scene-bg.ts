import type { GameObjects, Scene } from 'phaser';
import { HEX, px } from './style';

const VIGNETTE_TEX_KEY = 'scene-bg-vignette';
const VIGNETTE_TEX_SIZE = 512; // 生成一张大 radial gradient，setDisplaySize 拉到 viewport
const VIGNETTE_MAX_ALPHA = 0.55; // 四角最暗处 alpha
const VIGNETTE_INNER_STOP = 0.35; // 中心 0% 透明区占半径 35%（里面完全不 darken）

/**
 * 程序生成径向 vignette：中心透明，四角深色渐暗。
 * 效果：画面像"透过显微镜物镜"的聚焦感，纯数学 gradient 无复古味、不走 CRT 路线。
 *
 * 所有 SceneBackground 共享同一张 texture（一次生成后 scene.textures 复用）。
 */
function ensureVignetteTexture(scene: Scene): void {
  if (scene.textures.exists(VIGNETTE_TEX_KEY)) return;
  const tex = scene.textures.createCanvas(VIGNETTE_TEX_KEY, VIGNETTE_TEX_SIZE, VIGNETTE_TEX_SIZE);
  if (!tex) return;
  const ctx = tex.getContext();
  const cx = VIGNETTE_TEX_SIZE / 2;
  const cy = VIGNETTE_TEX_SIZE / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);
  const gradient = ctx.createRadialGradient(cx, cy, maxR * VIGNETTE_INNER_STOP, cx, cy, maxR);
  // HEX.bg 偏近 0x070a0c（深海蓝），用它做 vignette 色保持色温一致
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, `rgba(2, 6, 14, ${VIGNETTE_MAX_ALPHA})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, VIGNETTE_TEX_SIZE, VIGNETTE_TEX_SIZE);
  tex.refresh();
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  baseAlpha: number;
  /** 呼吸相位偏移，让每个粒子节奏不同 */
  phase: number;
  /** 当前显示 alpha 和 r（每帧根据 phase 计算） */
  alpha: number;
  color: number;
}

const LINK_DIST = 110; // 粒子连线最大距离（CSS px）

interface QuadPt {
  x: number;
  y: number;
}

/**
 * 共享背景：血管贝塞尔曲线 + 悬浮粒子。所有静态 Scene（Splash/MainMenu/...）
 * 都可挂一个，画"显微镜下血流"基底，统一视觉语言。
 */
export class SceneBackground {
  private vesselGfx: GameObjects.Graphics;
  private particlesGfx: GameObjects.Graphics;
  private linksGfx: GameObjects.Graphics;
  /** vignette：中心透明四角渐暗，画面像"显微镜物镜"的聚焦视野 */
  private vignette: GameObjects.Image;
  private particles: Particle[] = [];
  private elapsed = 0;

  constructor(scene: Scene) {
    this.vesselGfx = scene.add.graphics();
    this.linksGfx = scene.add.graphics();
    this.particlesGfx = scene.add.graphics();
    ensureVignetteTexture(scene);
    this.vignette = scene.add.image(0, 0, VIGNETTE_TEX_KEY);
    this.vignette.setOrigin(0, 0);
  }

  setViewport(W: number, H: number): void {
    this.drawVessels(W, H);
    this.spawnParticles(W, H);
    // 拉伸 vignette 到 viewport：16:9 拉伸后径向变椭圆，正好四角更暗，自然
    this.vignette.setDisplaySize(W, H);
  }

  /** 每帧 update 调一次，推动粒子漂浮 + 呼吸 + 连线 + grain 漂移 */
  tick(dt: number, W: number, H: number): void {
    this.elapsed += dt;
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < -px(10)) p.x = W + px(10);
      if (p.x > W + px(10)) p.x = -px(10);
      if (p.y < -px(10)) p.y = H + px(10);
      if (p.y > H + px(10)) p.y = -px(10);
      // 呼吸：alpha 按 phase 在 baseAlpha 周围 ±0.3 振荡
      const breathe = Math.sin(this.elapsed * 0.0008 + p.phase);
      p.alpha = Math.max(0.05, p.baseAlpha + breathe * 0.25);
    }
    this.renderLinks();
    this.renderParticles();
  }

  private spawnParticles(W: number, H: number): void {
    this.particles = [];
    const palette = [HEX.primary, HEX.primary, HEX.primary, HEX.accent];
    for (let i = 0; i < 60; i++) {
      const baseAlpha = 0.25 + Math.random() * 0.45;
      this.particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * px(0.1),
        vy: (Math.random() - 0.5) * px(0.1),
        r: px(0.8 + Math.random() * 2.2),
        baseAlpha,
        alpha: baseAlpha,
        phase: Math.random() * Math.PI * 2,
        color: palette[Math.floor(Math.random() * palette.length)] ?? HEX.primary,
      });
    }
  }

  /** 邻近粒子连透明线，距离越近 alpha 越强（细胞通信网络感） */
  private renderLinks(): void {
    this.linksGfx.clear();
    const maxDistSq = px(LINK_DIST) * px(LINK_DIST);
    for (let i = 0; i < this.particles.length; i++) {
      const a = this.particles[i];
      if (!a) continue;
      for (let j = i + 1; j < this.particles.length; j++) {
        const b = this.particles[j];
        if (!b) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > maxDistSq) continue;
        const t = 1 - distSq / maxDistSq; // 1=最近 0=最远
        const alpha = t * 0.18 * Math.min(a.alpha, b.alpha);
        if (alpha < 0.01) continue;
        // 颜色取两端均值（绿/蓝 mix 看起来一致）
        this.linksGfx.lineStyle(px(0.6), a.color, alpha);
        this.linksGfx.beginPath().moveTo(a.x, a.y).lineTo(b.x, b.y).strokePath();
      }
    }
  }

  private renderParticles(): void {
    this.particlesGfx.clear();
    for (const p of this.particles) {
      // 实心核
      this.particlesGfx.fillStyle(p.color, p.alpha).fillCircle(p.x, p.y, p.r);
      // 一层稍大的柔光
      this.particlesGfx.fillStyle(p.color, p.alpha * 0.4).fillCircle(p.x, p.y, p.r * 2);
      // 最外圈非常淡的散光
      this.particlesGfx.fillStyle(p.color, p.alpha * 0.12).fillCircle(p.x, p.y, p.r * 4);
    }
  }

  private drawVessels(W: number, H: number): void {
    this.vesselGfx.clear();
    const trunks: { from: QuadPt; to: QuadPt; ctrl: QuadPt; thick: number }[] = [
      {
        from: { x: 0, y: H * 0.85 },
        to: { x: W, y: H * 0.15 },
        ctrl: { x: W * 0.4, y: H * 0.3 },
        thick: px(2.2),
      },
      {
        from: { x: W, y: H * 0.95 },
        to: { x: 0, y: H * 0.4 },
        ctrl: { x: W * 0.3, y: H * 0.95 },
        thick: px(1.8),
      },
      {
        from: { x: -px(20), y: H * 0.55 },
        to: { x: W + px(20), y: H * 0.6 },
        ctrl: { x: W * 0.6, y: H * 0.45 },
        thick: px(1.5),
      },
      {
        from: { x: 0, y: H * 0.2 },
        to: { x: W, y: H * 0.05 },
        ctrl: { x: W * 0.55, y: H * 0.25 },
        thick: px(1.2),
      },
    ];
    for (const trunk of trunks) {
      this.vesselGfx.lineStyle(trunk.thick, HEX.accent, 0.18);
      this.drawQuad(trunk.from, trunk.ctrl, trunk.to);
      const branches = 2 + Math.floor(Math.random() * 2);
      for (let b = 0; b < branches; b++) {
        const t = 0.2 + Math.random() * 0.6;
        const start = this.quadPoint(trunk.from, trunk.ctrl, trunk.to, t);
        const angle = Math.random() * Math.PI * 2;
        const len = px(60 + Math.random() * 120);
        const end = { x: start.x + Math.cos(angle) * len, y: start.y + Math.sin(angle) * len };
        const ctrl = {
          x: (start.x + end.x) / 2 + (Math.random() - 0.5) * px(40),
          y: (start.y + end.y) / 2 + (Math.random() - 0.5) * px(40),
        };
        this.vesselGfx.lineStyle(px(0.8), HEX.accent, 0.12);
        this.drawQuad(start, ctrl, end);
      }
    }
  }

  private drawQuad(p0: QuadPt, c: QuadPt, p1: QuadPt): void {
    const segs = 24;
    this.vesselGfx.beginPath().moveTo(p0.x, p0.y);
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const pt = this.quadPoint(p0, c, p1, t);
      this.vesselGfx.lineTo(pt.x, pt.y);
    }
    this.vesselGfx.strokePath();
  }

  private quadPoint(p0: QuadPt, c: QuadPt, p1: QuadPt, t: number): QuadPt {
    const u = 1 - t;
    return {
      x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
      y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
    };
  }

  /** 整体透明度调节（游戏场景希望 bg 略降避免干扰棋盘） */
  setAlpha(alpha: number): void {
    this.vesselGfx.setAlpha(alpha);
    this.linksGfx.setAlpha(alpha);
    this.particlesGfx.setAlpha(alpha);
    this.vignette.setAlpha(alpha);
  }

  destroy(): void {
    this.vesselGfx.destroy();
    this.linksGfx.destroy();
    this.particlesGfx.destroy();
    this.vignette.destroy();
  }
}
