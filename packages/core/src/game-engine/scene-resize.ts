import type { Scene } from 'phaser';

/**
 * 安全的 scale.resize 监听器：shutdown 时自动注销，避免场景销毁后 resize
 * 事件仍触发 layout 访问已释放的 Text/Graphics，抛
 * `Cannot read properties of null (reading 'drawImage')`。
 *
 * 用法（替代 `this.scale.on('resize', ...)`）：
 *   onSceneResize(this, (w, h) => this.layout(w, h));
 */
export function onSceneResize(
  scene: Scene,
  handler: (width: number, height: number) => void,
): void {
  const wrapped = (size: Phaser.Structs.Size): void => {
    handler(size.width, size.height);
  };
  scene.scale.on('resize', wrapped);
  scene.events.once('shutdown', () => scene.scale.off('resize', wrapped));
  scene.events.once('destroy', () => scene.scale.off('resize', wrapped));
}
