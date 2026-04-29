import type { GameObjects, Scene } from 'phaser';

/**
 * sprite / fallback 联合型：静态图标 UI 常见的"存在贴图用 Image，否则画几何"模式。
 * 共同 API：setAlpha / setVisible / setPosition，足以覆盖容器布局 + 状态切换。
 */
export type IconResult = GameObjects.Image | GameObjects.Graphics;

/**
 * 通用 sprite / fallback 工厂：贴图存在就返回 Image，否则调 makeFallback。
 *
 * 各 UI 卡片（TowerBar / LevelBriefing / Loadout / Encyclopedia / TowerDetailPanel）
 * 以前都各自写 `if (scene.textures.exists(key)) { ... image ... } else { ... graphics ... }`
 * 样板。现在统一到这一处，callsite 只关心自己的 fallback 画法。
 *
 * 动态 setTexture 的场景（render/tower-layer / pathogen-layer / placement-ghost
 * 带缓存池）不适用此函数，它们用 Image 直接管理。
 *
 * @param size 显示尺寸（world 单位，= CSS × DPR）
 * @param makeFallback 贴图缺失时创建 fallback Graphics 的闭包（多对象 fallback 请
 *   在外层自行组合，这个函数只负责单对象 switch）
 */
export function addSpriteOrFallback(
  scene: Scene,
  spriteKey: string,
  x: number,
  y: number,
  size: number,
  makeFallback: () => GameObjects.Graphics,
): IconResult {
  if (scene.textures.exists(spriteKey)) {
    const img = scene.add.image(x, y, spriteKey);
    img.setDisplaySize(size, size);
    return img;
  }
  return makeFallback();
}
