import type { PathogenType, TowerType } from './game/entities';
import { TOWER_REGISTRY } from './game/registry/tower-registry';

/** Phaser Loader 用的资源 key 命名 + 文件路径 manifest。集中维护，Scene 用 `texKey('tower-macrophage', 1)` 等取 key。 */

export const TEX = {
  tower: (type: TowerType, level: 1 | 2 | 3) => `tower-${type}-${level}`,
  /** alt skin 专属 sprite key（仅 skin.hasCustomSprite=true 时有对应文件） */
  towerSkin: (type: TowerType, level: 1 | 2 | 3, skinId: string) =>
    `tower-${type}-${level}-${skinId}`,
  pathogen: (type: PathogenType) => `pathogen-${type}`,
};

export interface AssetEntry {
  key: string;
  url: string;
  /** 资源格式——SVG 走 Phaser `load.svg(key, url, {width,height})`，PNG 走 `load.image` */
  format: 'svg' | 'image';
  /** SVG 需要的 rasterize 基准尺寸（与 viewBox 一致即可，运行时 setDisplaySize 缩放） */
  width?: number;
  height?: number;
}

const TOWER_LEVELS: readonly (1 | 2 | 3)[] = [1, 2, 3];
const TOWER_TYPES: readonly TowerType[] = [
  'macrophage',
  'neutrophil',
  'nkcell',
  'dendritic',
  'mitochondria',
];
const PATHOGEN_TYPES: readonly PathogenType[] = [
  'rhinovirus',
  'influenza',
  'ecoli',
  'saureus',
  'aspergillus',
];

/** 已切到 SVG 的塔类型（手写 SVG 替代 PNG，可无损缩放 + 保证 SCSS 色一致） */
const TOWER_USES_SVG: ReadonlySet<TowerType> = new Set<TowerType>([
  'macrophage',
  'neutrophil',
  'nkcell',
  'dendritic',
  'mitochondria',
]);

const IS_WX = import.meta.env.VITE_PLATFORM === 'wx';

export function listSpriteAssets(): AssetEntry[] {
  const out: AssetEntry[] = [];
  for (const type of TOWER_TYPES) {
    // wx 端统一用 PNG（wx 不支持 SVG/Blob，scripts/svg-to-png.ts 已批量生成 256×256 PNG）
    const useSvg = !IS_WX && TOWER_USES_SVG.has(type);
    const ext = useSvg ? 'svg' : 'png';
    for (const lv of TOWER_LEVELS) {
      const entry: AssetEntry = {
        key: TEX.tower(type, lv),
        // wx 路径不能有 leading slash（相对 wx-dist 根）
        url: `${IS_WX ? '' : '/'}assets/towers/${type}-${lv}.${ext}`,
        format: useSvg ? 'svg' : 'image',
      };
      if (useSvg) {
        entry.width = 128;
        entry.height = 128;
      }
      out.push(entry);
    }
    // alt skin 专属 sprite（仅 skin.hasCustomSprite=true 才注册资源）
    for (const skin of TOWER_REGISTRY[type].skins) {
      if (skin.id === 'default' || !skin.hasCustomSprite) continue;
      for (const lv of TOWER_LEVELS) {
        const entry: AssetEntry = {
          key: TEX.towerSkin(type, lv, skin.id),
          url: `${IS_WX ? '' : '/'}assets/towers/${type}-${lv}-${skin.id}.${ext}`,
          format: useSvg ? 'svg' : 'image',
        };
        if (useSvg) {
          entry.width = 128;
          entry.height = 128;
        }
        out.push(entry);
      }
    }
  }
  for (const type of PATHOGEN_TYPES) {
    const ext = IS_WX ? 'png' : 'svg';
    const entry: AssetEntry = {
      key: TEX.pathogen(type),
      url: `${IS_WX ? '' : '/'}assets/pathogens/${type}.${ext}`,
      format: IS_WX ? 'image' : 'svg',
    };
    if (!IS_WX) {
      entry.width = 128;
      entry.height = 128;
    }
    out.push(entry);
  }
  return out;
}
