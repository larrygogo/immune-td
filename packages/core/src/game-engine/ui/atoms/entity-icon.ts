import type { GameObjects, Scene } from 'phaser';
import { TEX } from '../../asset-keys';
import type { PathogenType, TowerType } from '../../game/entities';
import { PATHOGEN_REGISTRY } from '../../game/registry/pathogen-registry';
import { TOWER_REGISTRY } from '../../game/registry/tower-registry';
import { getPathogenBattleColor, getTowerBattleColor } from '../../render/entity-colors';
import { COLOR, FONT, FONT_MONO, HEX, px } from '../../style';
import { addSpriteOrFallback } from '../sprite-icon';

export type EntityKind = 'tower' | 'pathogen';

/** 装饰层（boss 金边 / 飞行 ↑ / 等级徽章 / 选中环 / pathogen modifier），按需打开 */
export interface EntityIconDecorations {
  /** boss 金边外圈（saureus / 大型 boss） */
  boss?: boolean;
  /** 飞行 ↑ 上标（aspergillus 等 flying 病原） */
  flying?: boolean;
  /**
   * 塔等级（tower 用），决定 sprite key 选哪一级图（macrophage-1/2/3）。
   * 不影响是否显示等级徽章——徽章由 `showLevelBadge` 单独控制（默认 false）。
   */
  level?: 1 | 2 | 3;
  /**
   * 是否显示等级徽章（右下角小 mono 数字），默认 `false`。
   * 即使传了 `level` 也不显示——如 TowerDetailPanel 传 level 仅用于选 sprite，
   * 自己的 levelBadge 在右上角显示，不希望此处重复。
   */
  showLevelBadge?: boolean;
  /** 选中高亮环（黄色 highlight 色） */
  selected?: boolean;
  /** modifier: fortified（金边粗描边，与 boss 互斥优先 fortified） */
  fortified?: boolean;
  /** modifier: encapsulated（灰白色硬壳描边） */
  encapsulated?: boolean;
  /** modifier: camouflaged（alpha 0.4 + 虚线轮廓） */
  camouflaged?: boolean;
}

export interface EntityIconOpts {
  kind: EntityKind;
  type: TowerType | PathogenType;
  /** 显示尺寸（世界单位 = CSS × DPR） */
  size: number;
  x: number;
  y: number;
  /** sprite 缺失时是否 fallback 到几何（默认 true） */
  fallbackEnabled?: boolean;
  /** 整体 alpha 0.35 表示禁用 / 未解锁态 */
  dimmed?: boolean;
  decorations?: EntityIconDecorations;
}

/**
 * 通用 entity icon atom（tower / pathogen 共用）。
 *
 * 取代分散在 BuildBanner / TowerDetailPanel / LoadoutScene / EncyclopediaScene /
 * ResearchScene / LevelBriefingScene 的 `addSpriteOrFallback + 闭包 fallback shape switch`
 * 重复样板。所有视觉变体（color / shape / sprite / boss / flying / level / selected）
 * 按 entity registry.meta 自动适配，callsite 只关心 `type / size / position`。
 *
 * 加新塔 / 新敌只需在 registry.meta 加一行（color/battleColor/shape/spriteKey），
 * 全游戏所有显示该 entity 的位置自动适配，零硬编。
 *
 * 用法：
 * ```ts
 * const icon = new EntityIcon(scene, {
 *   kind: 'pathogen', type: 'saureus', size: px(20), x: 100, y: 100,
 *   decorations: { boss: true },
 * });
 * // icon.container 已挂到 scene 显示树（addSpriteOrFallback 内部 scene.add）
 * ```
 *
 * 渲染顺序（从底到顶）：boss 金边 → selected 环 → sprite/fallback → flying ↑ → lv 徽章。
 */
export class EntityIcon {
  readonly container: GameObjects.Container;

  constructor(scene: Scene, opts: EntityIconOpts) {
    const { kind, type, size, x, y, fallbackEnabled = true, dimmed, decorations } = opts;
    const color = kind === 'tower' ? getTowerBattleColor(type) : getPathogenBattleColor(type);
    const shape = readShape(kind, type);

    this.container = scene.add.container(x, y);

    // 底层装饰：fortified / boss 金边（互斥，fortified 优先）+ encapsulated 灰壳 + selected 环
    if (decorations?.fortified) {
      // fortified: 加粗金边（覆盖 boss）
      const ring = scene.add.graphics();
      ring.lineStyle(px(2.5), HEX.rewardGold, 1).strokeCircle(0, 0, size / 2 + px(2));
      this.container.add(ring);
    } else if (decorations?.boss) {
      const ring = scene.add.graphics();
      ring.lineStyle(px(1.5), HEX.rewardGold, 1).strokeCircle(0, 0, size / 2 + px(1.5));
      this.container.add(ring);
    }
    if (decorations?.encapsulated) {
      // encapsulated: 灰白色硬壳描边（介于 fortified/boss 与 sprite 之间）
      const shell = scene.add.graphics();
      shell.lineStyle(px(2), HEX.textMuted, 0.85).strokeCircle(0, 0, size / 2 + px(0.5));
      this.container.add(shell);
    }
    if (decorations?.selected) {
      const sel = scene.add.graphics();
      sel.lineStyle(px(2), HEX.highlight, 0.9).strokeCircle(0, 0, size / 2 + px(3));
      this.container.add(sel);
    }

    // 主体：sprite 优先，缺失则 fallback 到几何
    const spriteKey =
      kind === 'tower'
        ? TEX.tower(type as TowerType, decorations?.level ?? 1)
        : TEX.pathogen(type as PathogenType);
    const main = fallbackEnabled
      ? addSpriteOrFallback(scene, spriteKey, 0, 0, size, () =>
          makeFallbackShape(scene, shape, color, size),
        )
      : scene.textures.exists(spriteKey)
        ? scene.add.image(0, 0, spriteKey).setDisplaySize(size, size)
        : makeFallbackShape(scene, shape, color, size);
    // addSpriteOrFallback 内部用 scene.add.* 创建后已挂到 scene root；
    // container.add() reparent 到 container 内（local 坐标 0,0）
    this.container.add(main);

    // camouflaged: sprite 主体半透明 + 虚线轮廓暗示"伪装"
    if (decorations?.camouflaged) {
      // 'setAlpha' 在 Image / Graphics 都有
      if ('setAlpha' in main) (main as Phaser.GameObjects.Image).setAlpha(0.4);
      // dash stroke 用 lineStyle 模拟（多段短线）
      const dashStroke = scene.add.graphics();
      dashStroke.lineStyle(px(1), HEX.textDim, 0.8);
      const r = size / 2 + px(0.5);
      const segments = 12;
      for (let i = 0; i < segments; i++) {
        if (i % 2 !== 0) continue;
        const a0 = (i / segments) * Math.PI * 2;
        const a1 = ((i + 1) / segments) * Math.PI * 2;
        dashStroke.beginPath();
        dashStroke.arc(0, 0, r, a0, a1, false);
        dashStroke.strokePath();
      }
      this.container.add(dashStroke);
    }

    // 顶层装饰：flying ↑ + lv 徽章
    if (decorations?.flying) {
      const flyMark = scene.add
        .text(size / 2 - px(2), -size / 2 - px(3), '↑', {
          fontFamily: FONT,
          fontSize: `${px(9)}px`,
          color: '#88ee66',
          fontStyle: 'bold',
        })
        .setOrigin(0.5, 0);
      this.container.add(flyMark);
    }
    // 等级徽章：必须显式 showLevelBadge=true 才显示（默认 false 避免与 callsite
    // 自有 levelBadge 重复，如 TowerDetailPanel 右上角）
    if (decorations?.showLevelBadge && decorations.level && decorations.level > 1) {
      const lv = scene.add
        .text(size / 2 - px(1), size / 2 - px(1), `${decorations.level}`, {
          fontFamily: FONT_MONO,
          fontSize: `${px(8)}px`,
          color: COLOR.text,
          fontStyle: 'bold',
        })
        .setOrigin(1, 1);
      this.container.add(lv);
    }

    if (dimmed) this.container.setAlpha(0.35);
  }

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }
  setAlpha(a: number): void {
    this.container.setAlpha(a);
  }
  setVisible(v: boolean): void {
    this.container.setVisible(v);
  }
  destroy(): void {
    this.container.destroy(true);
  }
}

/** 从 registry 读 entity 形状（向后兼容：未填 shape 时按 kind 默认） */
function readShape(kind: EntityKind, type: string): string {
  const entry =
    kind === 'tower'
      ? (TOWER_REGISTRY as Record<string, { meta?: { shape?: string } }>)[type]
      : (PATHOGEN_REGISTRY as Record<string, { meta?: { shape?: string } }>)[type];
  return entry?.meta?.shape ?? (kind === 'tower' ? 'hexagon' : 'circle');
}

/**
 * 几何 fallback 单一实现（之前散在 5+ 处，每加新塔/敌都要找齐）。
 * 当前支持：tower(hexagon/star/diamond) + pathogen(circle/triangle/rect)，
 * 加新形状只在此处加 case。
 */
export function makeFallbackShape(
  scene: Scene,
  shape: string,
  color: number,
  size: number,
): GameObjects.Graphics {
  const g = scene.add.graphics();
  const r = size / 2;
  g.fillStyle(color, 0.92).lineStyle(px(1.5), color, 1);
  switch (shape) {
    case 'hexagon': {
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath().fillPath().strokePath();
      break;
    }
    case 'star': {
      g.beginPath();
      const inner = r * 0.42;
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 === 0 ? r : inner;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath().fillPath().strokePath();
      break;
    }
    case 'diamond': {
      g.beginPath()
        .moveTo(0, -r)
        .lineTo(r, 0)
        .lineTo(0, r)
        .lineTo(-r, 0)
        .closePath()
        .fillPath()
        .strokePath();
      break;
    }
    case 'pentagon': {
      g.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 * i) / 5 - Math.PI / 2; // 顶点朝上
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath().fillPath().strokePath();
      break;
    }
    case 'triangle': {
      g.beginPath()
        .moveTo(0, -r)
        .lineTo(r * 0.866, r * 0.5)
        .lineTo(-r * 0.866, r * 0.5)
        .closePath()
        .fillPath()
        .strokePath();
      break;
    }
    case 'rect': {
      g.fillRect(-r, -r * 0.7, size, size * 0.7);
      g.strokeRect(-r, -r * 0.7, size, size * 0.7);
      break;
    }
    default: {
      g.fillCircle(0, 0, r);
      g.strokeCircle(0, 0, r);
    }
  }
  return g;
}
