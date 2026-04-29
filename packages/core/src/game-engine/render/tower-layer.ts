import type { GameObjects, Scene } from 'phaser';
import { useMetaStore } from '@ui/store';
import { TEX } from '../asset-keys';
import type { Tower } from '../game/entities';
import { TOWER_DEFS, TOWER_LEVELS } from '../game/entities';
import { TOWER_REGISTRY } from '../game/registry/tower-registry';
import { HEX, px } from '../style';
import { drawProgressBar } from '../ui/atoms/progress-bar';
import { getEquippedSkinColor, getTowerBattleColor, resolveTowerSprite } from './entity-colors';
import type { GridLayer } from './grid-layer';

/** M5 受 buff 攻击塔的金色光晕颜色 */
const BUFF_RING_COLOR = HEX.buffRing;

// Phaser v4 alpha 的 preFX/postFX typings 不完整，用结构性接口兜底
// （flashFire / flashUpgrade / setSelected 仍接受 entry.glow tween，但放置时不再
// 主动 addGlow 创建辉光 → entry.glow 永远为 null，所有相关 tween 自动跳过）
interface GlowFx {
  outerStrength: number;
}

interface SpriteEntry {
  container: GameObjects.Container;
  image: GameObjects.Image | null;
  fallback: GameObjects.Graphics | null;
  glow: GlowFx | null;
  sig: string;
  hpBar: GameObjects.Graphics | null;
  hpBarBg: GameObjects.Graphics | null;
  hpBarGroup: GameObjects.Container | null;
  isPulsingDanger: boolean;
  dangerTween: Phaser.Tweens.Tween | null;
  // M5：受 helper buff 的攻击塔顶部金色光晕环（dendritic 自身不会有）
  buffRing: GameObjects.Graphics | null;
  buffRingTween: Phaser.Tweens.Tween | null;
}

/**
 * 塔精灵 diff 同步：用真实 PNG sprite + 同色发光光晕。
 * sig 缓存（cellSize/level/坐标/类型），变化时重画。
 * sprite 缺失时降级用几何图形（fallback）。
 */
export class TowerLayer {
  private sprites = new Map<string, SpriteEntry>();
  private scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  sync(towers: readonly Tower[], grid: GridLayer): void {
    const liveIds = new Set(towers.map((t) => t.id));
    // forEach 而非 for...of map：wx babel _createForOfIteratorHelper 对 Map iterator 报 non-iterable
    const toDelete: string[] = [];
    this.sprites.forEach((entry, id) => {
      if (!liveIds.has(id)) {
        // 跳过：destroyTower 已发起淡出动画的塔由动画 onComplete 自行清理
        if (entry.container.active && entry.container.alpha < 0.01) return;
        if (entry.dangerTween) entry.dangerTween.stop();
        if (entry.buffRingTween) entry.buffRingTween.stop();
        entry.container.destroy(true);
        toDelete.push(id);
      }
    });
    for (const id of toDelete) this.sprites.delete(id);
    for (const tower of towers) {
      const sig = `${grid.cellSize}@${tower.level}@${tower.col},${tower.row}@${tower.type}`;
      let entry = this.sprites.get(tower.id);
      if (!entry) {
        const container = this.scene.add.container(0, 0);
        container.setDepth(30);
        entry = {
          container,
          image: null,
          fallback: null,
          glow: null,
          sig: '',
          hpBar: null,
          hpBarBg: null,
          hpBarGroup: null,
          isPulsingDanger: false,
          dangerTween: null,
          buffRing: null,
          buffRingTween: null,
        };
        this.sprites.set(tower.id, entry);
      }
      if (entry.sig !== sig) {
        entry.sig = sig;
        this.drawTower(entry, tower, grid);
        this.createHpBar(entry, tower, grid);
      }
      this.updateHpBar(tower.id, tower.hp, tower.maxHp);
      // 放射发射塔（neutrophil）按 engine 层的 tower.rotation 实时旋转 sprite；
      // 非 radialProjectile 塔 rotation 字段无意义，跳过
      if (TOWER_DEFS[tower.type].radialProjectile && entry.image) {
        entry.image.setRotation(tower.rotation ?? 0);
      }
    }
    // M5：每帧重算每个攻击塔是否被相邻 alive helper buff，更新金色光晕
    this.syncBuffRings(towers, grid);
  }

  /**
   * 检查每个攻击塔是否被任一 alive helper 塔（dendritic 等）的 buff 范围覆盖。
   * 计算逻辑须与 combat.ts 保持一致：格距 ≤ helper.range 即生效。
   * 被 buff 的攻击塔加金色 ring overlay；不再被 buff 的移除 ring。
   * dendritic 自身不画 buff ring（it IS the buffer）。
   */
  private syncBuffRings(towers: readonly Tower[], grid: GridLayer): void {
    // 先收集所有 alive helper（按等级取 range）
    const helpers: { col: number; row: number; range: number }[] = [];
    for (const t of towers) {
      if (TOWER_REGISTRY[t.type].role !== 'helper') continue;
      if (t.hp <= 0) continue;
      const lv = TOWER_LEVELS[t.type][t.level - 1];
      if (!lv) continue;
      helpers.push({ col: t.col, row: t.row, range: lv.range });
    }
    for (const t of towers) {
      const entry = this.sprites.get(t.id);
      if (!entry) continue;
      // helper 自身不画 ring
      if (TOWER_REGISTRY[t.type].role === 'helper') {
        this.removeBuffRing(entry);
        continue;
      }
      const buffed = helpers.some((h) => Math.hypot(h.col - t.col, h.row - t.row) <= h.range);
      if (buffed) this.addBuffRing(entry, t, grid);
      else this.removeBuffRing(entry);
    }
  }

  private addBuffRing(entry: SpriteEntry, tower: Tower, grid: GridLayer): void {
    if (entry.buffRing) return;
    const { x, y } = grid.cellToWorld(tower.col, tower.row);
    const r = grid.cellSize * 0.55;
    const g = this.scene.add.graphics();
    g.lineStyle(px(2), BUFF_RING_COLOR, 0.9).strokeCircle(x, y, r);
    g.lineStyle(px(1), BUFF_RING_COLOR, 0.45).strokeCircle(x, y, r + px(3));
    g.setAlpha(0.4);
    entry.container.add(g);
    entry.buffRing = g;
    entry.buffRingTween = this.scene.tweens.add({
      targets: g,
      alpha: { from: 0.25, to: 0.55 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  private removeBuffRing(entry: SpriteEntry): void {
    if (!entry.buffRing) return;
    if (entry.buffRingTween) {
      entry.buffRingTween.stop();
      entry.buffRingTween = null;
    }
    entry.buffRing.destroy();
    entry.buffRing = null;
  }

  /**
   * 让指定塔的 sprite "头朝目标"：根据 (dx, dy) 算 atan2，加 π/2 校正
   * （sprite 原图默认朝上）。tween 120ms 走最短弧，breathe tween 只动 scale/alpha 不冲突。
   */
  aimAt(towerId: string, dx: number, dy: number): void {
    const entry = this.sprites.get(towerId);
    if (!entry?.image) return;
    const img = entry.image;
    const targetAngle = Math.atan2(dy, dx) + Math.PI / 2;
    // 最短弧差值（[-π, π]），避免跨 ±π 边界长弧旋转
    let diff = (targetAngle - img.rotation) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    this.scene.tweens.add({
      targets: img,
      rotation: img.rotation + diff,
      duration: 120,
      ease: 'Cubic.out',
    });
  }

  /** 外部调用：让指定塔做"开火闪光"——glow.outerStrength 短暂放大再回弹 */
  flashFire(towerId: string): void {
    const entry = this.sprites.get(towerId);
    if (!entry?.glow) return;
    const baseStrength = entry.glow.outerStrength;
    this.scene.tweens.add({
      targets: entry.glow,
      outerStrength: baseStrength * 3,
      duration: 80,
      yoyo: true,
      ease: 'Quad.out',
    });
  }

  /** 升级闪光：glow strength 短暂飙高（比 flashFire 强 + 持续更久） */
  flashUpgrade(towerId: string): void {
    const entry = this.sprites.get(towerId);
    if (!entry?.glow) return;
    const baseStrength = entry.glow.outerStrength;
    this.scene.tweens.killTweensOf(entry.glow);
    this.scene.tweens.add({
      targets: entry.glow,
      outerStrength: 12,
      duration: 200,
      yoyo: true,
      ease: 'Quad.out',
      onComplete: () => {
        if (entry.glow) entry.glow.outerStrength = baseStrength;
      },
    });
  }

  /** 失败时所有塔淡出 + scale 缩小（死亡感） */
  fadeOutAll(): void {
    // biome-ignore lint/complexity/noForEach: wx babel _createForOfIteratorHelper 对 Map iterator 报 non-iterable
    this.sprites.forEach((entry) => {
      if (!entry.image) return;
      this.scene.tweens.killTweensOf(entry.image);
      this.scene.tweens.add({
        targets: entry.image,
        alpha: 0.15,
        scaleX: entry.image.scaleX * 0.7,
        scaleY: entry.image.scaleY * 0.7,
        duration: 600,
        ease: 'Quad.in',
      });
    });
  }

  /** 选中态：glow strength 持续提升（取消 hover 还原） */
  setSelected(towerId: string | null): void {
    // forEach 而非 for...of map：wx babel _createForOfIteratorHelper 对 Map iterator 报 non-iterable
    this.sprites.forEach((entry, id) => {
      if (!entry.glow) return;
      this.scene.tweens.killTweensOf(entry.glow);
      const isActive = id === towerId;
      const baseStrength = isActive ? 6 : entry.glow.outerStrength > 4 ? 3 : 2;
      this.scene.tweens.add({
        targets: entry.glow,
        outerStrength: baseStrength,
        duration: 200,
        ease: 'Quad.out',
      });
    });
  }

  private drawTower(entry: SpriteEntry, tower: Tower, grid: GridLayer): void {
    const { x, y } = grid.cellToWorld(tower.col, tower.row);
    const cellSize = grid.cellSize;
    const spriteSize = cellSize * 0.85;
    // 基础色用于辉光 / fallback 形状；装备 alt 皮肤时优先用 skin 色
    const baseColor = getTowerBattleColor(tower.type);
    const skinColor = getEquippedSkinColor(tower.type);
    const color = skinColor ?? baseColor;

    // 清掉旧 image / fallback（连带 tween / glow）
    if (entry.image) {
      this.scene.tweens.killTweensOf(entry.image);
      if (entry.glow) {
        this.scene.tweens.killTweensOf(entry.glow);
        entry.glow = null;
      }
      entry.image.destroy();
      entry.image = null;
    }
    if (entry.fallback) {
      entry.fallback.destroy();
      entry.fallback = null;
    }
    // 升级 / 移动 / cellSize 变化时一并清掉 buffRing，下一次 syncBuffRings 重建
    this.removeBuffRing(entry);

    // 真实 sprite（按 level 取对应图）；alt 皮肤有专属 SVG 直接用，否则 fallback
    // default sprite + tint 表达皮肤色
    const lv = tower.level === 1 ? 1 : tower.level === 2 ? 2 : 3;
    const equippedId = useMetaStore.getState().equippedSkins[tower.type];
    const { key, tint } = resolveTowerSprite(tower.type, lv, equippedId);
    const fallbackKey = TEX.tower(tower.type, lv);
    const finalKey = this.scene.textures.exists(key) ? key : fallbackKey;
    if (this.scene.textures.exists(finalKey)) {
      const img = this.scene.add.image(x, y, finalKey);
      img.setDisplaySize(spriteSize, spriteSize);
      // 仅在用 default sprite + 装备 alt 皮肤时才 tint（专属 SVG 自带颜色）
      if (tint !== null && finalKey === fallbackKey) img.setTint(tint);
      entry.container.add(img);
      entry.image = img;
      // 出生 / 升级 spawn 弹动：从 0 → baseScale * 1.2 → baseScale (Back.out)
      const baseScaleX = img.scaleX;
      const baseScaleY = img.scaleY;
      img.setScale(0);
      this.scene.tweens.add({
        targets: img,
        scaleX: baseScaleX,
        scaleY: baseScaleY,
        duration: 320,
        ease: 'Back.out',
        onComplete: () => {
          // 弹动完成后启动呼吸循环
          if (!img.active) return;
          this.scene.tweens.add({
            targets: img,
            scaleX: { from: baseScaleX, to: baseScaleX * 1.06 },
            scaleY: { from: baseScaleY, to: baseScaleY * 1.06 },
            alpha: { from: 1, to: 0.85 },
            duration: 1200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.inOut',
          });
        },
      });
    } else {
      const g = this.scene.add.graphics();
      const r = spriteSize / 2;
      // 按 type 选 fallback 形状：dendritic 六芒星 / mitochondria 5 边形 / 其他圆形
      if (tower.type === 'dendritic') {
        this.drawStarFallback(g, x, y, r, color);
      } else if (tower.type === 'mitochondria') {
        this.drawMitochondriaFallback(g, x, y, r, color);
      } else {
        g.fillStyle(color, 0.78).fillCircle(x, y, r);
        g.lineStyle(px(1.5), color, 1).strokeCircle(x, y, r);
      }
      entry.container.add(g);
      entry.fallback = g;
    }
  }

  /**
   * dendritic 专属 fallback：金色 6 角星 + 内圈 + 中心点，模拟"抗原呈递"辐射感。
   * 6 个三角辐射点 + 中心填充圆，表达 dendrite "树突状" 突触。
   */
  private drawStarFallback(
    g: GameObjects.Graphics,
    cx: number,
    cy: number,
    r: number,
    color: number,
  ): void {
    // 内圈实心
    g.fillStyle(color, 0.85).fillCircle(cx, cy, r * 0.45);
    // 6 个辐射三角（六芒星感）
    const innerR = r * 0.4;
    const outerR = r * 0.95;
    g.fillStyle(color, 0.7);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 - Math.PI / 2;
      const aL = a - Math.PI / 12;
      const aR = a + Math.PI / 12;
      g.fillTriangle(
        cx + Math.cos(a) * outerR,
        cy + Math.sin(a) * outerR,
        cx + Math.cos(aL) * innerR,
        cy + Math.sin(aL) * innerR,
        cx + Math.cos(aR) * innerR,
        cy + Math.sin(aR) * innerR,
      );
    }
    // 外描边
    g.lineStyle(px(1.5), color, 1).strokeCircle(cx, cy, r * 0.45);
  }

  /**
   * mitochondria 专属 fallback：5 边形（顶点朝上） + 内核小圆，模拟"线粒体
   * 嵴层结构 + 内基质"的视觉印象。registry.meta.shape='pentagon' 与之对应。
   */
  private drawMitochondriaFallback(
    g: GameObjects.Graphics,
    cx: number,
    cy: number,
    r: number,
    color: number,
  ): void {
    // 主体：实心 5 边形 + 描边
    g.fillStyle(color, 0.78);
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 * i) / 5 - Math.PI / 2; // 顶点朝上
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath().fillPath();
    g.lineStyle(px(1.5), color, 1);
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath().strokePath();
    // 内核：小亮圆模拟基质能量核心
    g.fillStyle(0xffffff, 0.6).fillCircle(cx, cy, r * 0.28);
  }

  /**
   * 更新指定塔的 HP bar 显示。
   * 满血时 alpha=0；低血量时切红色 + 启动脉动 tween。
   */
  updateHpBar(towerId: string, hp: number, maxHp: number): void {
    const entry = this.sprites.get(towerId);
    if (!entry || !entry.hpBar || !entry.hpBarBg || !entry.hpBarGroup) return;
    const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;

    // 重画 fg：阈值色 0.6/0.3（entity HP 默认阈值与 HUD HP 0.66/0.33 不同）
    const w = (entry.hpBar.getData('width') as number) ?? 0;
    const h = (entry.hpBar.getData('height') as number) ?? 4;
    entry.hpBar.clear();
    drawProgressBar(entry.hpBar, {
      ratio,
      x: -w / 2,
      y: -h / 2,
      width: w,
      height: h,
      color: {
        high: HEX.hpHigh,
        mid: HEX.hpMid,
        low: HEX.hpLow,
        thresholds: { mid: 0.6, low: 0.3 },
      },
    });

    // 满血隐藏整组（避免 UI 噪音）
    entry.hpBarGroup.setAlpha(ratio >= 1 ? 0 : 1);

    // 低血量脉动控制
    if (ratio < 0.3 && ratio > 0) this.startDangerPulse(entry);
    else this.stopDangerPulse(entry);
  }

  /**
   * 塔死亡视觉：scale 0.8→0 + alpha 1→0 (300ms)，完成后销毁 container。
   * sync() 不会重建 entry，因为 state.towers 已不含该塔。
   */
  destroyTower(towerId: string): void {
    const entry = this.sprites.get(towerId);
    if (!entry) return;
    if (entry.dangerTween) {
      entry.dangerTween.stop();
      entry.dangerTween = null;
      entry.isPulsingDanger = false;
    }
    if (entry.buffRingTween) {
      entry.buffRingTween.stop();
      entry.buffRingTween = null;
    }
    if (entry.image) this.scene.tweens.killTweensOf(entry.image);
    if (entry.glow) {
      this.scene.tweens.killTweensOf(entry.glow);
      entry.glow.outerStrength = 0;
    }
    this.scene.tweens.killTweensOf(entry.container);
    this.scene.tweens.add({
      targets: entry.container,
      scaleX: 0,
      scaleY: 0,
      alpha: 0,
      duration: 300,
      ease: 'Power2.easeIn',
      onComplete: () => {
        entry.container.destroy(true);
        this.sprites.delete(towerId);
      },
    });
  }

  destroy(): void {
    // biome-ignore lint/complexity/noForEach: wx babel _createForOfIteratorHelper 对 Map iterator 报 non-iterable
    this.sprites.forEach((entry) => {
      if (entry.dangerTween) entry.dangerTween.stop();
      if (entry.buffRingTween) entry.buffRingTween.stop();
      entry.container.destroy(true);
    });
    this.sprites.clear();
  }

  /**
   * 在 container 内创建 HP bar（背景灰条 + 前景动态色条），位置在塔正下方。
   * sig 变化（cellSize/位置）时会被 drawTower 之后重建。
   */
  private createHpBar(entry: SpriteEntry, tower: Tower, grid: GridLayer): void {
    // 清掉旧的 hpBar group
    if (entry.hpBarGroup) {
      if (entry.dangerTween) {
        entry.dangerTween.stop();
        entry.dangerTween = null;
        entry.isPulsingDanger = false;
      }
      entry.hpBarGroup.destroy(true);
      entry.hpBarGroup = null;
      entry.hpBar = null;
      entry.hpBarBg = null;
    }

    const { x, y } = grid.cellToWorld(tower.col, tower.row);
    const cellSize = grid.cellSize;
    const w = cellSize * 0.8;
    const h = 4;

    const group = this.scene.add.container(x, y + cellSize / 2 + 4);
    const bg = this.scene.add.graphics();
    bg.fillStyle(HEX.black, 0.6).fillRect(-w / 2, -h / 2, w, h);
    const fg = this.scene.add.graphics();
    fg.setData('width', w);
    fg.setData('height', h);
    group.add([bg, fg]);
    group.setAlpha(0);
    entry.container.add(group);
    entry.hpBarGroup = group;
    entry.hpBarBg = bg;
    entry.hpBar = fg;
  }

  private startDangerPulse(entry: SpriteEntry): void {
    if (entry.isPulsingDanger || !entry.hpBarGroup) return;
    entry.isPulsingDanger = true;
    entry.dangerTween = this.scene.tweens.add({
      targets: entry.hpBarGroup,
      alpha: { from: 1, to: 0.5 },
      duration: 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  private stopDangerPulse(entry: SpriteEntry): void {
    if (!entry.isPulsingDanger) return;
    entry.isPulsingDanger = false;
    if (entry.dangerTween) {
      entry.dangerTween.stop();
      entry.dangerTween = null;
    }
    if (entry.hpBarGroup) entry.hpBarGroup.setAlpha(entry.hpBarGroup.alpha < 0.01 ? 0 : 1);
  }
}
