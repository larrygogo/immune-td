import type { GameObjects, Scene } from 'phaser';
import { DPR } from '../../dpr';
import { px } from '../../style';

/**
 * 标题斜光带 atom：复用 Phaser title 内部 canvas 做字形 mask + source-in 斜白渐变带。
 *
 * 关键设计（避免 mask 自画 vs Phaser 内部 fillText 参数对不上的偏移问题）：
 * 1. shine canvas 直接 drawImage(title.canvas) 拿字形像素 → 位置 / 形态 1:1 一致
 * 2. setResolution(DPR) 后 title.canvas 是 DPR× 倍物理 → shine canvas 同尺寸，
 *    Image 必须 setDisplaySize(title.width, title.height) 缩回 displaySize 才不偏
 * 3. alpha threshold 60：cut setShadow 外发光（blur=px(3) 时 alpha 都 < 50），
 *    保留字本体 + 抗锯齿（alpha 60-255）作为 mask，不在 shadow 区溢出
 * 4. bandW 0.65× titleSize × DPR + alpha 0.95 中央峰：跟 09d56e2 老版视觉一致
 *
 * 用法：
 * ```ts
 * const shine = new TitleShine(scene, this.title, 'main-menu-title-shine');
 * // 每次 layout（含 fonts.ready 后重排）调一次：
 * shine.update(titleSize);
 * // fonts 加载完清 cache 让真字体宽度重新生成 texture：
 * shine.invalidateCache([32, 36, 44]);
 * ```
 *
 * cacheKeyPrefix 用于防止多 scene 共用 cache 串号（如 splash 和 main-menu 字号同 32 但
 * 字位置不同 → texture 必须独立）。
 */
export class TitleShine {
  private image: GameObjects.Image | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly title: GameObjects.Text,
    private readonly cacheKeyPrefix: string,
  ) {}

  /** layout 后调用：按 title 当前位置 / 字号生成或更新 shine Image */
  update(titleSize: number): void {
    const key = this.buildTexture(titleSize);
    const cx = this.title.x + this.title.width / 2;
    const cy = this.title.y + this.title.height / 2;
    if (!this.image) {
      this.image = this.scene.add
        .image(cx, cy, key)
        .setDisplaySize(this.title.width, this.title.height);
    } else {
      this.image.setTexture(key);
      this.image.setPosition(cx, cy);
      this.image.setDisplaySize(this.title.width, this.title.height);
    }
  }

  /** fonts.ready 后清 cache（fallback 字体的字宽算错的 texture 要重新生成） */
  invalidateCache(sizes: readonly number[]): void {
    for (const size of sizes) {
      const k = `${this.cacheKeyPrefix}-${size}`;
      if (this.scene.textures.exists(k)) this.scene.textures.remove(k);
    }
  }

  destroy(): void {
    this.image?.destroy();
    this.image = null;
  }

  private buildTexture(titleSize: number): string {
    const key = `${this.cacheKeyPrefix}-${titleSize}`;
    if (this.scene.textures.exists(key)) return key;

    const titleCanvas = (this.title as unknown as { canvas?: HTMLCanvasElement }).canvas;
    if (!titleCanvas) return key;
    const cw = titleCanvas.width;
    const ch = titleCanvas.height;

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) return key;

    // 1. 复制 Phaser title 内部 canvas 拿字形 alpha mask（位置 1:1 对齐）
    ctx.drawImage(titleCanvas, 0, 0);

    // 2. alpha threshold 60：cut shadow 外发光，保留字本体 + 抗锯齿边缘
    try {
      const imgData = ctx.getImageData(0, 0, cw, ch);
      const data = imgData.data;
      for (let i = 3; i < data.length; i += 4) {
        if ((data[i] ?? 0) < 60) data[i] = 0;
      }
      ctx.putImageData(imgData, 0, 0);
    } catch {
      // CORS / tainted canvas：跳过 threshold，shine 在 shadow 区可见但不致命
    }

    // 3. source-in：之后绘制只在已有 pixel（即字形）内可见
    ctx.globalCompositeOperation = 'source-in';

    // 4. 画斜向白色渐变带
    // bandW 乘以实际 resolution（browser=DPR，wx=1），保证带宽与 canvas 坐标系比例一致
    const resolution =
      (this.title as unknown as { style?: { resolution?: number } }).style?.resolution ?? DPR;
    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.rotate((-2.5 * Math.PI) / 180);
    const bandW = px(titleSize * 0.65) * resolution;
    const bandL = Math.hypot(cw, ch) * 1.2;
    const grad = ctx.createLinearGradient(0, -bandW / 2, 0, bandW / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.95)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(-bandL / 2, -bandW / 2, bandL, bandW);
    ctx.restore();

    this.scene.textures.addCanvas(key, canvas);
    return key;
  }
}
