import type { GameObjects, Geom, Scene } from 'phaser';
import { sfx } from '@audio/sfx';
import { DPR } from '../dpr';
import { setRectInteractive } from '../interactive';
import { type AnchorPoint, resolveAnchor } from '../layout/anchor';
import { getSafeArea } from '../layout/safe-area';
import { COLOR, FONT, HEX, px } from '../style';

export interface PhaserButtonOptions {
  label: string;
  /** 按钮宽度（CSS px）；不传则按 label 自适应 */
  width?: number;
  /** 按钮高度（CSS px），默认 40 */
  height?: number;
  /** 字号 CSS px，默认 12 */
  fontSize?: number;
  /** 主调色（hex 数值），默认 PRIMARY 绿。同时作为字色与描边色（除非 strokeColor 覆盖） */
  color?: number;
  /** 单独覆盖描边色，不传则用 color */
  strokeColor?: number;
  /** 是否填充主调色（false = 描边款），默认 false */
  filled?: boolean;
  /** 字间距（em 单位，相对 fontSize），例：0.25 */
  letterSpacingEm?: number;
  /** 是否用虚线描边（仅 filled=false 有效），默认 false */
  dashed?: boolean;
  /**
   * 原点（bg 绘制对齐方式）：
   * - 'center'（默认，兼容旧 MainMenu 调用）：bg 以 container 为中心，setPosition(cx, cy) 定位
   * - 'topLeft'：bg 从 (0,0) 到 (w,h)，setPosition(x, y) 定位左上角。scene 里常用这个
   */
  origin?: 'center' | 'topLeft';
  /** 是否播点击音效（默认 true）。pause/speed 等高频按钮可关掉避免叠音 */
  playClickSfx?: boolean;
  /** 点击回调 */
  onTap: () => void;
  /** aria 标签（暂存，后续 a11y 桥用） */
  ariaLabel?: string;
  /**
   * 可选锚点：构造时按 viewport 锚点 + offset 自动 setPosition，省手算 `setPosition(W - ...)`。
   *
   * - point：9 宫格位置（top-right / bottom-center / ...）
   * - offsetX / offsetY：buffer px 单位（已 × DPR）；anchor helper 偏移规则朝内
   * - useSafeArea：true 时锚点限制到 safeArea.contentX/Y/Width/Height 区域内（避开胶囊 / home indicator）
   *
   * 不传时行为完全不变（构造函数 x / y 直接生效），向后兼容。
   *
   * 注意：内部按节点中心 origin (0.5, 0.5) 计算（PhaserButton 的 container 默认 origin (0,0) 但
   * setRectInteractive 已按 bgAlign 处理；center 模式下 setPosition 直接落到中心）。
   * topLeft 模式下传 anchor 时建议自己用 anchor helper 算坐标传 x / y，
   * 避免半 size 偏移要算两遍。
   */
  anchor?: {
    point: AnchorPoint;
    offsetX?: number;
    offsetY?: number;
    useSafeArea?: boolean;
  };
}

/**
 * 通用 Phaser 按钮：Container 包 Graphics bg + Text label。
 * 描边款（filled=false）：透明底 + 描边 + 文字主色，hover 加 glow
 * 填充款（filled=true）：纯主色填充 + 黑字
 * 自动:
 * - hover 重绘高亮
 * - pointerdown 播 uiClick + 触发 onTap
 */
export class PhaserButton {
  readonly container: GameObjects.Container;
  private bg: GameObjects.Graphics;
  private labelText: GameObjects.Text;
  private opts: Required<
    Omit<
      PhaserButtonOptions,
      'width' | 'ariaLabel' | 'strokeColor' | 'origin' | 'playClickSfx' | 'anchor'
    >
  > & {
    width: number;
    ariaLabel: string | undefined;
    strokeColor: number;
    origin: 'center' | 'topLeft';
    playClickSfx: boolean;
  };
  private hover = false;
  private pressed = false;
  private hitRect!: Geom.Rectangle;

  constructor(scene: Scene, x: number, y: number, opts: PhaserButtonOptions) {
    this.opts = {
      label: opts.label,
      height: opts.height ?? 40,
      fontSize: opts.fontSize ?? 12,
      color: opts.color ?? HEX.primary,
      strokeColor: opts.strokeColor ?? opts.color ?? HEX.primary,
      filled: opts.filled ?? false,
      letterSpacingEm: opts.letterSpacingEm ?? 0,
      dashed: opts.dashed ?? false,
      origin: opts.origin ?? 'center',
      playClickSfx: opts.playClickSfx ?? true,
      onTap: opts.onTap,
      width: opts.width ?? 0,
      ariaLabel: opts.ariaLabel,
    };

    this.bg = scene.add.graphics();
    this.labelText = scene.add
      .text(0, 0, opts.label, {
        fontFamily: FONT,
        fontSize: `${px(this.opts.fontSize)}px`,
        fontStyle: 'bold',
        color: this.opts.filled ? COLOR.bg : `#${this.opts.color.toString(16).padStart(6, '0')}`,
      })
      .setOrigin(0.5)
      .setResolution(DPR);
    if (this.opts.letterSpacingEm > 0) {
      this.labelText.setLetterSpacing(px(this.opts.fontSize * this.opts.letterSpacingEm));
    }

    if (!this.opts.width) {
      this.opts.width = Math.ceil(this.labelText.width / px(1)) + 32;
    }
    this.redraw();

    // 锚点优先：传 opts.anchor 时按 viewport + 锚点算 (x, y)，覆盖构造参数；
    // 不传时保持原行为（构造参数直接落点）
    let actualX = x;
    let actualY = y;
    if (opts.anchor) {
      const W = scene.scale.width;
      const H = scene.scale.height;
      const sa = opts.anchor.useSafeArea ? getSafeArea(W, H) : undefined;
      const pos = resolveAnchor(
        opts.anchor.point,
        W,
        H,
        opts.anchor.offsetX ?? 0,
        opts.anchor.offsetY ?? 0,
        sa,
      );
      actualX = pos.x;
      actualY = pos.y;
    }
    this.container = scene.add.container(actualX, actualY, [this.bg, this.labelText]);
    const w = px(this.opts.width);
    const h = px(this.opts.height);
    this.container.setSize(w, h);
    this.hitRect = setRectInteractive(this.container, w, h, {
      useHandCursor: true,
      bgAlign: this.opts.origin,
    });
    this.positionLabel();
    this.container.on('pointerover', () => {
      this.hover = true;
      this.redraw();
    });
    this.container.on('pointerout', () => {
      this.hover = false;
      this.redraw();
    });
    this.container.on('pointerdown', () => {
      if (this.opts.playClickSfx) sfx.uiClick();
      this.opts.onTap();
    });
  }

  /** topLeft 原点时 label 居中于 (w/2, h/2)；center 原点时 label 在 (0,0) */
  private positionLabel(): void {
    const w = px(this.opts.width);
    const h = px(this.opts.height);
    if (this.opts.origin === 'topLeft') this.labelText.setPosition(w / 2, h / 2);
    else this.labelText.setPosition(0, 0);
  }

  /** icon 按钮（如暂停/速度）切换"按下"视觉态：背景填色更深 + 描边加粗 */
  setPressed(pressed: boolean): void {
    this.pressed = pressed;
    this.redraw();
  }

  /** 当前 world 单位宽度（= CSS × DPR）。布局算相邻按钮间距时用。 */
  get widthPx(): number {
    return px(this.opts.width);
  }
  /** 当前 world 单位高度。 */
  get heightPx(): number {
    return px(this.opts.height);
  }

  /** 外部控制尺寸（响应式布局用）：CSS 单位，会乘 DPR 到 world 单位。 */
  setSize(cssW: number, cssH: number): void {
    this.opts.width = cssW;
    this.opts.height = cssH;
    this.applySize(px(cssW), px(cssH));
  }

  /** 直接传 world 单位尺寸（跟 scene layout 的 px(...) 已乘结果一致）。 */
  setSizeWorld(worldW: number, worldH: number): void {
    this.opts.width = worldW / px(1);
    this.opts.height = worldH / px(1);
    this.applySize(worldW, worldH);
  }

  private applySize(w: number, h: number): void {
    this.container.setSize(w, h);
    if (this.opts.origin === 'topLeft') this.hitRect.setTo(w / 2, h / 2, w, h);
    else this.hitRect.setTo(0, 0, w, h);
    this.positionLabel();
    this.redraw();
  }

  setLabel(text: string): void {
    this.labelText.text = text;
    this.opts.width = Math.ceil(this.labelText.width / px(1)) + 32;
    this.redraw();
    const w = px(this.opts.width);
    const h = px(this.opts.height);
    this.container.setSize(w, h);
    // hitRect 位置跟 origin 对齐：topLeft 起点 (w/2, h/2)（setRectInteractive 的算法）
    if (this.opts.origin === 'topLeft') this.hitRect.setTo(w / 2, h / 2, w, h);
    else this.hitRect.setTo(0, 0, w, h);
    this.positionLabel();
  }

  /** 启用/禁用按钮：切换 input.enabled 并改透明度，不破坏 hitArea。 */
  setEnabled(enabled: boolean): void {
    const input = this.container.input;
    if (input) input.enabled = enabled;
    this.container.setAlpha(enabled ? 1 : 0.45);
  }

  /** 动态改主调色（默认同步改描边色）。给按状态着色的按钮用（如 tower 详情随 type 换色）。 */
  setColor(color: number, strokeColor?: number): void {
    this.opts.color = color;
    this.opts.strokeColor = strokeColor ?? color;
    if (!this.opts.filled) {
      this.labelText.setColor(`#${color.toString(16).padStart(6, '0')}`);
    }
    this.redraw();
  }

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  destroy(): void {
    this.container.destroy(true);
  }

  private redraw(): void {
    const w = px(this.opts.width);
    const h = px(this.opts.height);
    const c = this.opts.color;
    const sc = this.opts.strokeColor;
    // 原点偏移：center 时 bg 画在 -w/2 起，topLeft 时从 0 起
    const bx = this.opts.origin === 'center' ? -w / 2 : 0;
    const by = this.opts.origin === 'center' ? -h / 2 : 0;
    this.bg.clear();
    if (this.opts.filled) {
      // 多层光晕
      const glowBoost = this.hover ? 1.5 : 1;
      const layers = 5;
      for (let i = layers; i >= 1; i--) {
        const expand = px(2 + i * 2);
        const alpha = (0.06 * glowBoost * (layers - i + 1)) / layers;
        this.bg
          .fillStyle(c, alpha)
          .fillRect(bx - expand, by - expand, w + expand * 2, h + expand * 2);
      }
      this.bg.fillStyle(c, 1).fillRect(bx, by, w, h);
    } else {
      // 描边款：底色淡 + 描边；pressed 态加深底色 + 加粗描边
      const baseBgAlpha = this.hover ? 0.18 : 0.08;
      const baseStrokeAlpha = this.hover ? 1 : 0.55;
      const bgAlpha = this.pressed ? 0.22 : baseBgAlpha;
      const strokeAlpha = this.pressed ? 1 : baseStrokeAlpha;
      this.bg.fillStyle(sc, bgAlpha).fillRect(bx, by, w, h);
      if (this.opts.dashed) {
        this.drawDashedRect(bx, by, w, h, sc, strokeAlpha);
      } else {
        this.bg.lineStyle(px(1), sc, strokeAlpha).strokeRect(bx, by, w, h);
      }
      if (this.hover) {
        // 外发光
        this.bg.lineStyle(px(2), sc, 0.25).strokeRect(bx - px(3), by - px(3), w + px(6), h + px(6));
      }
    }
  }

  private drawDashedRect(x: number, y: number, w: number, h: number, c: number, a: number): void {
    const dash = px(3);
    const gap = px(3);
    this.bg.lineStyle(px(1), c, a);
    const drawDashedLine = (x1: number, y1: number, x2: number, y2: number) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      const ux = dx / len;
      const uy = dy / len;
      let pos = 0;
      while (pos < len) {
        const end = Math.min(pos + dash, len);
        this.bg
          .beginPath()
          .moveTo(x1 + ux * pos, y1 + uy * pos)
          .lineTo(x1 + ux * end, y1 + uy * end)
          .strokePath();
        pos = end + gap;
      }
    };
    drawDashedLine(x, y, x + w, y);
    drawDashedLine(x + w, y, x + w, y + h);
    drawDashedLine(x + w, y + h, x, y + h);
    drawDashedLine(x, y + h, x, y);
  }
}
