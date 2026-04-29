import type * as Phaser from 'phaser';
import type { GameObjects, Scene } from 'phaser';
import { TEX } from '../asset-keys';
import type { Pathogen, PathogenType } from '../game/entities';
import { PATHOGEN_REGISTRY } from '../game/registry/pathogen-registry';
import { FONT_MONO, HEX, px } from '../style';
import { drawProgressBar } from '../ui/atoms/progress-bar';
import { getPathogenBattleColor } from './entity-colors';
import type { GridLayer } from './grid-layer';

type Coord = { col: number; row: number };

interface FxAddable {
  addGlow?: (
    color?: number,
    outerStrength?: number,
    innerStrength?: number,
    knockout?: boolean,
    quality?: number,
    distance?: number,
  ) => unknown;
}

interface Sprite {
  container: GameObjects.Container;
  image: GameObjects.Image | null;
  fallback: GameObjects.Graphics | null;
  hpBar: GameObjects.Graphics;
  /** modifier 静态视觉（fortified 金边 / encapsulated 硬壳）一次绘好；rebuildBody 时重画 */
  modifierGfx: GameObjects.Graphics | null;
  /** 上一帧 hp，监测 regrow 触发时浮起 +N 文字 */
  lastHp: number;
  type: string;
  cellSize: number;
  lowHpTween: Phaser.Tweens.Tween | null;
}

/**
 * 敌人精灵 diff 同步：用真实 PNG sprite + 同色发光光晕。
 * 位置用 pathogen.path 当前/下一格线性插值 + per-entity offsetX/offsetY 扰动。
 * 飞行敌（aspergillus）body 抬高 12 px；HP bar 在 sprite 上方。
 */
export class PathogenLayer {
  private sprites = new Map<string, Sprite>();

  /** 外部调用：让指定敌人闪一下白光（被击中反馈） */
  flashHit(id: string): void {
    const sp = this.sprites.get(id);
    if (!sp?.image) return;
    // Phaser 4：setTintFill 移除，改用 setTint + setTintMode(FILL)。
    // TintModes / setTintMode 在 Phaser 3.90 类型里不存在，用 any 绕开。
    // FILL 模式常量值 = 1（与 NORMAL=0 互斥）；运行时 Phaser 4 解析此值
    // 等同 setTintFill 行为。
    sp.image.setTint(HEX.white);
    const img = sp.image as Phaser.GameObjects.Image & {
      setTintMode?: (mode: number) => unknown;
    };
    img.setTintMode?.(1);
    this.scene.time.delayedCall(80, () => {
      if (sp.image?.active) sp.image.clearTint();
    });
  }

  private scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  sync(pathogens: readonly Pathogen[], grid: GridLayer, currentPath: readonly Coord[]): void {
    const liveIds = new Set<string>();
    for (const p of pathogens) {
      if (p.alive && !p.reachedExit) liveIds.add(p.id);
    }

    // forEach 而非 for...of map：wx babel _createForOfIteratorHelper 对 Map iterator 报 non-iterable
    const toDelete: string[] = [];
    this.sprites.forEach((sp, id) => {
      if (!liveIds.has(id)) {
        sp.container.destroy(true);
        toDelete.push(id);
      }
    });
    for (const id of toDelete) this.sprites.delete(id);

    for (const p of pathogens) {
      if (!p.alive || p.reachedExit) continue;
      let sp = this.sprites.get(p.id);
      if (!sp) {
        sp = this.createSprite(p, grid.cellSize);
        this.sprites.set(p.id, sp);
      }
      this.updateSprite(sp, p, grid, currentPath);
    }
  }

  private createSprite(p: Pathogen, cellSize: number): Sprite {
    const hpBar = this.scene.add.graphics();
    const container = this.scene.add.container(0, 0, [hpBar]);
    container.setDepth(28);
    const sp: Sprite = {
      container,
      image: null,
      fallback: null,
      hpBar,
      modifierGfx: null,
      lastHp: p.hp,
      type: p.type,
      cellSize: 0,
      lowHpTween: null,
    };
    this.rebuildBody(sp, p.type, cellSize);
    this.drawModifierOverlay(sp, p, cellSize);
    return sp;
  }

  /**
   * 画 modifier 静态视觉（fortified 金边 / encapsulated 硬壳）。
   * modifier 在 spawn 时确定不变，所以一次绘制即可；rebuildBody（cellSize 变化）时调用方重绘。
   * camouflaged 走 image.setAlpha 不在此画；regrow 是动态文字（hp 变化时浮起）不在此画。
   */
  private drawModifierOverlay(sp: Sprite, p: Pathogen, cellSize: number): void {
    if (sp.modifierGfx) {
      sp.modifierGfx.destroy();
      sp.modifierGfx = null;
    }
    const hasFortified = p.modifiers.includes('fortified');
    const hasEncapsulated = p.modifiers.includes('encapsulated');
    if (!hasFortified && !hasEncapsulated) return;

    const r = (cellSize * 0.55) / 2;
    const g = this.scene.add.graphics();
    if (hasEncapsulated) {
      // 灰白硬壳描边（介于 sprite 与 fortified 之间）
      g.lineStyle(px(2), HEX.textMuted, 0.85).strokeCircle(0, 0, r + px(1));
    }
    if (hasFortified) {
      // 金边粗描边（覆盖在硬壳外，更显眼）
      g.lineStyle(px(2.5), HEX.rewardGold, 1).strokeCircle(0, 0, r + px(2.5));
    }
    sp.container.add(g);
    sp.modifierGfx = g;
  }

  private rebuildBody(sp: Sprite, type: string, cellSize: number): void {
    if (sp.lowHpTween) {
      sp.lowHpTween.stop();
      sp.lowHpTween = null;
    }
    if (sp.image) {
      this.scene.tweens.killTweensOf(sp.image);
      sp.image.destroy();
      sp.image = null;
    }
    if (sp.fallback) {
      sp.fallback.destroy();
      sp.fallback = null;
    }
    sp.cellSize = cellSize;
    const color = getPathogenBattleColor(type);
    const spriteSize = cellSize * 0.55;

    const key = TEX.pathogen(type as 'rhinovirus');
    if (this.scene.textures.exists(key)) {
      const img = this.scene.add.image(0, 0, key);
      img.setDisplaySize(spriteSize, spriteSize);
      sp.container.add(img);
      sp.image = img;
      // GPU shader 辉光：同色微强度（不抢塔风头）
      const fx = (img as GameObjects.Image & { preFX?: FxAddable }).preFX;
      if (fx?.addGlow) fx.addGlow(color, 1.5, 0, false, 0.1, 6);
      // 飞行敌轻微旋转（+ 上下浮动），地面敌仅左右晃。
      // 用 defaultModifiers（aspergillus 是唯一含 flying 的 type）替代硬编 aspergillus 检查
      const defaults = PATHOGEN_REGISTRY[type as PathogenType].defaultModifiers ?? [];
      const flying = defaults.includes('flying');
      if (flying) {
        this.scene.tweens.add({
          targets: img,
          angle: { from: -8, to: 8 },
          y: { from: -2, to: 2 },
          duration: 700,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.inOut',
        });
      } else {
        this.scene.tweens.add({
          targets: img,
          angle: { from: -5, to: 5 },
          duration: 500,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.inOut',
        });
      }
    } else {
      const g = this.scene.add.graphics();
      g.fillStyle(color, 0.9).fillCircle(0, 0, spriteSize / 2);
      g.lineStyle(px(1), HEX.white, 0.35).strokeCircle(0, 0, spriteSize / 2);
      sp.container.add(g);
      sp.fallback = g;
    }
  }

  private updateSprite(
    sp: Sprite,
    p: Pathogen,
    grid: GridLayer,
    currentPath: readonly Coord[],
  ): void {
    // cellSize 变化（resize）时重建 sprite 大小 + modifier overlay
    if (sp.cellSize !== grid.cellSize) {
      this.rebuildBody(sp, p.type, grid.cellSize);
      this.drawModifierOverlay(sp, p, grid.cellSize);
    }

    const seg = p.path.length > 0 ? p.path : currentPath;
    if (seg.length === 0) return;
    const curIdx = Math.min(p.pathIndex, seg.length - 1);
    const nextIdx = Math.min(p.pathIndex + 1, seg.length - 1);
    const cur = seg[curIdx];
    const next = seg[nextIdx] ?? cur;
    if (!cur || !next) return;
    const lerpCol = cur.col + (next.col - cur.col) * p.progress;
    const lerpRow = cur.row + (next.row - cur.row) * p.progress;
    const { x, y } = grid.cellToWorld(lerpCol, lerpRow);

    // 飞行敌：sprite y 偏移 -12，下方画椭圆阴影
    const flying = p.modifiers.includes('flying');
    const yOffset = flying ? -px(12) : 0;
    sp.container.setPosition(x + p.offsetX, y + p.offsetY + yOffset);

    // camouflaged: sprite 半透明 0.4（玩家看出"看不见"状态——非 dendritic 范围内的塔不会打）
    if (sp.image && p.modifiers.includes('camouflaged') && !sp.lowHpTween) {
      sp.image.setAlpha(0.4);
    }

    // regrow: hp 比上一帧增加 ≥ 0.3 时浮起一个小 +N 绿字（500ms 上浮淡出）
    // 阈值避免 dt 抖动每帧浮一次（regrow 5 hp/秒 × 16ms tick ≈ 0.08，3.7 帧累积一次）
    if (p.modifiers.includes('regrow')) {
      const hpDelta = p.hp - sp.lastHp;
      if (hpDelta >= 0.3) {
        const r = (grid.cellSize * 0.55) / 2;
        const t = this.scene.add
          .text(0, -r - px(20), `+${Math.ceil(hpDelta)}`, {
            fontFamily: FONT_MONO,
            fontSize: `${px(9)}px`,
            fontStyle: 'bold',
            color: '#88ee66',
          })
          .setOrigin(0.5, 1);
        sp.container.add(t);
        this.scene.tweens.add({
          targets: t,
          y: t.y - px(8),
          alpha: 0,
          duration: 500,
          ease: 'Quad.out',
          onComplete: () => t.destroy(),
        });
        sp.lastHp = p.hp;
      } else if (p.hp < sp.lastHp) {
        // 被打掉血时同步 lastHp，否则 regrow 触发阈值会误判
        sp.lastHp = p.hp;
      }
    } else {
      sp.lastHp = p.hp;
    }

    // HP bar：灰底 + 红/橙前景按比例
    const r = (grid.cellSize * 0.55) / 2;
    const bw = grid.cellSize * 0.6;
    const bh = px(3);
    const by = -r - px(flying ? 14 : 8);
    const ratio = Math.max(0, Math.min(1, p.hp / p.maxHp));

    // 临死警示：HP < 30% 时 image alpha 起伏闪烁（仅启动一次）
    if (sp.image && ratio < 0.3 && !sp.lowHpTween) {
      sp.lowHpTween = this.scene.tweens.add({
        targets: sp.image,
        alpha: { from: 1, to: 0.4 },
        duration: 220,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    } else if (ratio >= 0.3 && sp.lowHpTween) {
      // HP 回到健康（虽然当前没回血机制，但保留防御性逻辑）
      sp.lowHpTween.stop();
      sp.lowHpTween = null;
      if (sp.image) sp.image.setAlpha(1);
    }
    sp.hpBar.clear();
    drawProgressBar(sp.hpBar, {
      ratio,
      x: -bw / 2,
      y: by,
      width: bw,
      height: bh,
      color: ratio > 0.5 ? HEX.danger : HEX.hpOrange,
      bgColor: HEX.black,
      bgAlpha: 0.85,
    });
  }

  destroy(): void {
    // biome-ignore lint/complexity/noForEach: wx babel _createForOfIteratorHelper 对 Map iterator 报 non-iterable
    this.sprites.forEach((sp) => sp.container.destroy(true));
    this.sprites.clear();
  }
}
