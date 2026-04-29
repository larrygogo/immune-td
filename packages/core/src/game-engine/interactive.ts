import { type GameObjects, Geom } from 'phaser';

export type BgAlign = 'center' | 'topLeft';

/**
 * 给 Container 显式设置矩形命中区，对齐 bg 的视觉范围。
 *
 * 关键点：Phaser hit test 内部对 Container 会做 `localX += displayOriginX` 再交给
 * hitAreaCallback，displayOriginX 是 getter = `width * 0.5`：
 * - 调用方先 `container.setSize(w, h)` → displayOrigin = (w/2, h/2)
 * - 没调 setSize → width=0 → displayOrigin = (0, 0)
 *
 * helper 不主动 setSize（会触发 Phaser 渲染管线副作用，例如 Container 内 Text
 * 渲染异常），改成 **读取当前 displayOrigin 反推 hitArea 偏移**，让两种调用方
 * 都得到对齐 visual bg 的命中区：
 * - bgAlign='topLeft'：bg fillRect(0, 0, w, h)，期望命中 local (0, 0, w, h)
 *   → hitArea = (displayOriginX, displayOriginY, w, h)
 * - bgAlign='center'：bg fillRect(-w/2, -h/2, w, h)，期望命中 local (-w/2, -h/2, w, h)
 *   → hitArea = (displayOriginX - w/2, displayOriginY - h/2, w, h)
 */
export function setRectInteractive(
  container: GameObjects.Container,
  w: number,
  h: number,
  opts: { useHandCursor?: boolean; bgAlign?: BgAlign } = {},
): Geom.Rectangle {
  const ox = container.displayOriginX; // 0（未 setSize）或 w/2（已 setSize）
  const oy = container.displayOriginY;
  const align = opts.bgAlign ?? 'center';
  const rect =
    align === 'topLeft'
      ? new Geom.Rectangle(ox, oy, w, h)
      : new Geom.Rectangle(ox - w / 2, oy - h / 2, w, h);
  container.setInteractive({
    hitArea: rect,
    hitAreaCallback: Geom.Rectangle.Contains,
    useHandCursor: opts.useHandCursor ?? false,
  });
  return rect;
}
