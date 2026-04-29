import { type GameObjects, Scene } from 'phaser';
import { trackSceneView } from '@/analytics/scene-view';
import { bgm } from '@audio/bgm';
import { sfx } from '@audio/sfx';
import { getShell, shellDisplayName, shellIsAuthenticated } from '../../shell';
import { useMetaStore, useUiStore } from '@ui/store';
import { TEX } from '../asset-keys';
import { DPR } from '../dpr';
import { CHAPTERS, LEVELS, isLevelImplemented } from '../game/data/levels';
import { setRectInteractive } from '../interactive';
import { anchorBottomCenter, anchorTopLeft, anchorTopRight } from '../layout/anchor';
import { SAFE_BOTTOM, SAFE_TOP } from '../layout/safe-area';
import { SPACING } from '../layout/spacing';
import { SceneBackground } from '../scene-bg';
import { fadeInOnEnter, transitionToScene } from '../scene-fx';
import { onSceneResize } from '../scene-resize';
import { COLOR, FONT, FONT_MONO, FONT_SANS_CN, HEX, px } from '../style';
import { makeCrystalIcon } from '../ui/atoms/crystal-icon';
import { TitleShine } from '../ui/atoms/title-shine';
import { PhaserButton } from '../ui/phaser-button';
import { Toast } from '../ui/toast';

/**
 * 微信小游戏端不允许匿名（spec § 12.1 强登录），所以 wx 端账号区不挂退出 hit zone。
 * H5 端登录由「开始游戏」按钮强制拦截；账号区只做被动信息展示，点击仅触发退出确认。
 */
const IS_WX = import.meta.env.VITE_PLATFORM === 'wx';

/** 找下一个可玩关卡：优先未通关的最小已解锁；否则最大已解锁。MX-3：跳过教学关 */
function findNextLevelId(unlocked: readonly number[], stars: Record<number, number>): number {
  const sorted = [...unlocked].sort((a, b) => a - b);
  for (const id of sorted) {
    if (!isLevelImplemented(id)) continue;
    if (LEVELS[id]?.isTutorial) continue;
    if ((stars[id] ?? 0) === 0) return id;
  }
  for (let i = sorted.length - 1; i >= 0; i--) {
    const id = sorted[i];
    if (id === undefined) continue;
    if (!isLevelImplemented(id)) continue;
    if (LEVELS[id]?.isTutorial) continue;
    return id;
  }
  return 1;
}

/** 是否所有非教学关都已通关（每关 stars>=1）→ 全通关副标。 */
function isAllCleared(stars: Record<number, number>): boolean {
  for (const ch of CHAPTERS) {
    for (const id of ch.levelIds) {
      if (LEVELS[id]?.isTutorial) continue;
      if (!isLevelImplemented(id)) continue;
      if ((stars[id] ?? 0) < 1) return false;
    }
  }
  return true;
}

/**
 * 中央主线 hub「开始游戏」大按钮：三角洲风（V7 配方）。
 * 实心 mint fill + 巨噬细胞 svg 剪影底纹（深绿 tint）+ 4 内角 L bracket（深绿）+
 * 顶部装饰 dash + 中央 deep-green 字 + 左上关卡 tag + 右下 cyber 数据 metric。
 */
class StartGameButton {
  readonly container: GameObjects.Container;
  private bgUnder: GameObjects.Graphics;
  private bgOver: GameObjects.Graphics;
  private silhouette: GameObjects.Image | null;
  private titleText: GameObjects.Text;
  private tagText: GameObjects.Text;
  private metricText: GameObjects.Text;
  private w = 0;
  private h = 0;
  private hover = false;
  private hitRect!: import('phaser').Geom.Rectangle;

  constructor(
    scene: Scene,
    private onTap: () => void,
  ) {
    this.bgUnder = scene.add.graphics();
    this.bgOver = scene.add.graphics();
    // 巨噬细胞 svg 剪影底纹（BootScene 已 preload TEX.tower('macrophage', 1)）
    const silhouetteKey = TEX.tower('macrophage', 1);
    this.silhouette = scene.textures.exists(silhouetteKey)
      ? scene.add
          .image(0, px(2), silhouetteKey)
          .setOrigin(0.5)
          .setTint(HEX.immuneDeep)
          .setAlpha(0.16)
      : null;
    // 主标「开始游戏」深绿 bold（颜色不那么深）
    this.titleText = scene.add
      .text(0, 0, '开始游戏', {
        fontFamily: FONT,
        fontSize: `${px(20)}px`,
        fontStyle: 'bold',
        color: COLOR.immuneDeep,
      })
      .setOrigin(0.5)
      .setPadding(px(SPACING.md), px(SPACING.sm + SPACING.xs))
      .setStroke(COLOR.immuneDeep, px(0.4))
      .setShadow(0, px(1), COLOR.immuneDeep, 0, false, true)
      .setLetterSpacing(px(20 * 0.18))
      .setResolution(DPR);
    // 左上 tag（关卡名，原 setSubtitle 接口塞这里）
    this.tagText = scene.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: `${px(10)}px`,
        fontStyle: 'bold',
        color: COLOR.immuneDeep,
      })
      .setOrigin(0, 0)
      .setAlpha(0.7)
      .setLetterSpacing(px(10 * 0.12))
      .setResolution(DPR);
    // 右下 metric（cyber 数据装饰，今天日期）
    this.metricText = scene.add
      .text(0, 0, 'OP-2026-0428', {
        fontFamily: FONT_MONO,
        fontSize: `${px(8)}px`,
        color: COLOR.immuneDeep,
      })
      .setOrigin(1, 1)
      .setAlpha(0.5)
      .setResolution(DPR);
    const children: GameObjects.GameObject[] = [this.bgUnder];
    if (this.silhouette) children.push(this.silhouette);
    children.push(this.bgOver, this.tagText, this.titleText, this.metricText);
    this.container = scene.add.container(0, 0, children);
    this.container.setSize(px(240), px(72));
    this.hitRect = setRectInteractive(this.container, px(240), px(72), {
      useHandCursor: true,
    });
    this.container.on('pointerover', () => {
      this.hover = true;
      this.redraw();
    });
    this.container.on('pointerout', () => {
      this.hover = false;
      this.redraw();
    });
    this.container.on('pointerdown', () => {
      sfx.uiClick();
      this.onTap();
    });
  }

  setSubtitle(sub: string): void {
    this.tagText.text = sub;
  }

  /** layout 调用：设宽度/高度后重绘所有子节点位置 */
  resize(cssWidth: number, cssHeight: number): void {
    this.w = px(cssWidth);
    this.h = px(cssHeight);
    this.container.setSize(this.w, this.h);
    this.hitRect.setTo(0, 0, this.w, this.h);
    // 主标居中略下沉
    this.titleText.setPosition(0, Math.round(px(2)));
    // tag 在左上角 inset 后
    const inset = px(SPACING.sm);
    const cornerLen = px(8);
    this.tagText.setPosition(
      Math.round(-this.w / 2 + inset + cornerLen + px(4)),
      Math.round(-this.h / 2 + inset + px(1)),
    );
    // metric 在右下角 inset 后
    this.metricText.setPosition(
      Math.round(this.w / 2 - inset - px(4)),
      Math.round(this.h / 2 - inset),
    );
    // silhouette 高 92%，居中
    if (this.silhouette) {
      this.silhouette.setDisplaySize(this.h * 0.92, this.h * 0.92);
      this.silhouette.setPosition(0, Math.round(px(2)));
    }
    this.redraw();
  }

  setPosition(x: number, y: number): void {
    // round 到整数像素，避免 container sub-pixel 位置让文字 sampling 锯齿
    this.container.setPosition(Math.round(x), Math.round(y));
  }

  private redraw(): void {
    const w = this.w;
    const h = this.h;
    const c = HEX.primary;
    this.bgUnder.clear();
    this.bgOver.clear();
    // 外发光（最底）
    const boost = this.hover ? 1.5 : 1;
    for (let i = 3; i >= 1; i--) {
      const e = px(2 + i * 3);
      this.bgUnder
        .fillStyle(c, 0.06 * boost * (4 - i) * 0.33)
        .fillRect(-w / 2 - e, -h / 2 - e, w + e * 2, h + e * 2);
    }
    // 主体：实心 mint
    this.bgUnder.fillStyle(c, 1).fillRect(-w / 2, -h / 2, w, h);
    // 剪影 alpha 跟 hover 切换
    if (this.silhouette) this.silhouette.setAlpha(this.hover ? 0.22 : 0.16);
    // 顶部 ~40% 白色叠层（柔和高光）
    this.bgOver.fillStyle(0xffffff, 0.1).fillRect(-w / 2, -h / 2, w, h * 0.4);
    // 4 内 L 角 bracket（深绿，比字色更浅 alpha）
    const inset = px(SPACING.sm);
    const cornerLen = px(8);
    const x = -w / 2 + inset;
    const y = -h / 2 + inset;
    const ex = w / 2 - inset;
    const ey = h / 2 - inset;
    this.bgOver.lineStyle(px(1), HEX.immuneDeep, this.hover ? 0.45 : 0.3);
    this.bgOver.lineBetween(x, y, x + cornerLen, y);
    this.bgOver.lineBetween(x, y, x, y + cornerLen);
    this.bgOver.lineBetween(ex - cornerLen, y, ex, y);
    this.bgOver.lineBetween(ex, y, ex, y + cornerLen);
    this.bgOver.lineBetween(x, ey - cornerLen, x, ey);
    this.bgOver.lineBetween(x, ey, x + cornerLen, ey);
    this.bgOver.lineBetween(ex - cornerLen, ey, ex, ey);
    this.bgOver.lineBetween(ex, ey - cornerLen, ex, ey);
    // 顶部装饰 dash 线（更浅）
    this.bgOver.lineStyle(px(1), HEX.immuneDeep, 0.14);
    this.bgOver.lineBetween(x + cornerLen + px(2), y + px(2), x + (ex - x) * 0.55, y + px(2));
    // 底部右侧短 dash（chevron 暗示）
    this.bgOver.lineBetween(
      ex - cornerLen - px(20),
      ey - px(2),
      ex - cornerLen - px(2),
      ey - px(2),
    );
    // 外描边（最浅）
    this.bgOver.lineStyle(px(1), HEX.immuneDeep, 0.1).strokeRect(-w / 2, -h / 2, w, h);
  }

  destroy(): void {
    this.container.destroy(true);
  }
}

/**
 * 下方功能 grid 的（可选 icon）+ label 按钮（窄列）。
 * 容器中央上半放可选 icon glyph、下半放中文 label；icon 省略时 label 单独居中。
 * disabled 态用 alpha=0.4 灰色降级表达，不再加锁角标 / 角标 text 节点（避免 emoji
 * 在不同系统字体渲染不稳，wx 端尤其糊）。
 */
/**
 * wireframe 几何 icon 绘制函数：在 (0,0) 中心画一个 sizeBuf × sizeBuf 的描边图形。
 * sizeBuf 已经是 buffer px（× DPR 后），lineWidth 用 1.5 px 给视觉清晰但不粗。
 */
type IconDrawFn = (g: GameObjects.Graphics, color: number, sizeBuf: number) => void;

/** 信封（邮箱）：外框矩形 + V 形信封盖 */
const drawMailIcon: IconDrawFn = (g, color, size) => {
  const w = size * 0.85;
  const h = size * 0.6;
  g.lineStyle(1.5, color, 1);
  g.strokeRect(-w / 2, -h / 2, w, h);
  g.beginPath();
  g.moveTo(-w / 2, -h / 2);
  g.lineTo(0, h * 0.1);
  g.lineTo(w / 2, -h / 2);
  g.strokePath();
};

/** 公告（喇叭）：扩音器轮廓 + 2 道声波弧 */
const drawAnnounceIcon: IconDrawFn = (g, color, size) => {
  g.lineStyle(1.5, color, 1);
  // 喇叭主体（左侧矩形 + 右侧三角扩散）
  g.beginPath();
  g.moveTo(-size * 0.45, -size * 0.18);
  g.lineTo(-size * 0.2, -size * 0.18);
  g.lineTo(size * 0.15, -size * 0.4);
  g.lineTo(size * 0.15, size * 0.4);
  g.lineTo(-size * 0.2, size * 0.18);
  g.lineTo(-size * 0.45, size * 0.18);
  g.closePath();
  g.strokePath();
  // 声波弧（右外侧）
  g.beginPath();
  g.arc(size * 0.25, 0, size * 0.12, -Math.PI / 3, Math.PI / 3);
  g.strokePath();
  g.beginPath();
  g.arc(size * 0.3, 0, size * 0.22, -Math.PI / 4, Math.PI / 4);
  g.strokePath();
};

/** 回放（播放符号）：圆 + 内三角形 */
const drawReplayIcon: IconDrawFn = (g, color, size) => {
  const r = size * 0.42;
  g.lineStyle(1.5, color, 1);
  g.strokeCircle(0, 0, r);
  g.beginPath();
  g.moveTo(-r * 0.4, -r * 0.5);
  g.lineTo(r * 0.55, 0);
  g.lineTo(-r * 0.4, r * 0.5);
  g.closePath();
  g.strokePath();
};

class IconLabelButton {
  readonly container: GameObjects.Container;
  private bg: GameObjects.Graphics;
  /** icon 可选：可以是字符串 text 或 wireframe graphics（iconDraw） */
  private icon: GameObjects.Text | null;
  private iconGraphics: GameObjects.Graphics | null = null;
  private iconDraw: IconDrawFn | null = null;
  private label: GameObjects.Text;
  private cssW = 0;
  private cssH = 0;
  private hover = false;
  private disabled = false;
  private color: number;
  private onTap: () => void;
  private hitRect!: import('phaser').Geom.Rectangle;

  constructor(
    scene: Scene,
    cfg: {
      /** 可选：单字 / 字母 icon */
      icon?: string;
      /** 可选：wireframe 几何 icon 绘制函数（优先级高于 icon string） */
      iconDraw?: IconDrawFn;
      label: string;
      color: number;
      disabled?: boolean;
      onTap: () => void;
    },
  ) {
    this.color = cfg.color;
    this.disabled = cfg.disabled ?? false;
    this.onTap = cfg.onTap;
    this.bg = scene.add.graphics();
    if (cfg.iconDraw) {
      // wireframe 几何 icon：用 graphics 自绘，跟塔 sprite 风格一致
      this.iconDraw = cfg.iconDraw;
      this.iconGraphics = scene.add.graphics();
      this.icon = null;
    } else if (cfg.icon !== undefined && cfg.icon !== '') {
      this.icon = scene.add
        .text(0, 0, cfg.icon, {
          fontFamily: FONT_SANS_CN,
          fontSize: `${px(20)}px`,
          color: `#${cfg.color.toString(16).padStart(6, '0')}`,
        })
        .setOrigin(0.5)
        .setResolution(DPR);
    } else {
      this.icon = null;
    }
    this.label = scene.add
      .text(0, 0, cfg.label, {
        fontFamily: FONT,
        fontSize: `${px(10)}px`,
        color: `#${cfg.color.toString(16).padStart(6, '0')}`,
      })
      .setOrigin(0.5)
      .setLetterSpacing(px(10 * 0.18))
      .setResolution(DPR);
    const children: GameObjects.GameObject[] = [this.bg];
    if (this.icon) children.push(this.icon);
    if (this.iconGraphics) children.push(this.iconGraphics);
    children.push(this.label);
    this.container = scene.add.container(0, 0, children);
    this.container.setSize(px(60), px(60));
    this.hitRect = setRectInteractive(this.container, px(60), px(60), {
      useHandCursor: !this.disabled,
    });
    this.container.on('pointerover', () => {
      this.hover = true;
      this.redraw();
    });
    this.container.on('pointerout', () => {
      this.hover = false;
      this.redraw();
    });
    this.container.on('pointerdown', () => {
      sfx.uiClick();
      this.onTap();
    });
    this.applyDisabledAlpha();
  }

  setSize(cssW: number, cssH: number): void {
    this.cssW = cssW;
    this.cssH = cssH;
    const w = px(cssW);
    const h = px(cssH);
    this.container.setSize(w, h);
    this.hitRect.setTo(0, 0, w, h);
    if (this.icon) {
      // 字符 icon 偏上 / label 偏下
      this.icon.setPosition(0, -px(cssH / 2 - 18));
      this.label.setPosition(0, px(cssH / 2 - 12));
    } else if (this.iconGraphics && this.iconDraw) {
      // wireframe 几何 icon：清空重绘 + 偏上 / label 偏下
      const iconSize = px(20);
      this.iconGraphics.clear();
      this.iconDraw(this.iconGraphics, this.color, iconSize);
      this.iconGraphics.setPosition(0, -px(cssH / 2 - 16));
      this.label.setPosition(0, px(cssH / 2 - 12));
    } else {
      // label-only：单独居中
      this.label.setPosition(0, 0);
    }
    this.redraw();
  }

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  private applyDisabledAlpha(): void {
    // disabled 态：alpha 0.4 灰色降级（不再加锁角标）
    this.container.setAlpha(this.disabled ? 0.4 : 1);
  }

  private redraw(): void {
    if (!this.cssW || !this.cssH) return;
    const w = px(this.cssW);
    const h = px(this.cssH);
    const c = this.color;
    this.bg.clear();
    const fillAlpha = this.hover && !this.disabled ? 0.18 : 0.08;
    const strokeAlpha = this.hover && !this.disabled ? 1 : 0.55;
    this.bg.fillStyle(c, fillAlpha).fillRect(-w / 2, -h / 2, w, h);
    this.bg.lineStyle(px(1), c, strokeAlpha).strokeRect(-w / 2, -h / 2, w, h);
    if (this.hover && !this.disabled) {
      this.bg
        .lineStyle(px(2), c, 0.22)
        .strokeRect(-w / 2 - px(3), -h / 2 - px(3), w + px(6), h + px(6));
    }
  }

  destroy(): void {
    this.container.destroy(true);
  }
}

export class MainMenuScene extends Scene {
  private bg!: SceneBackground;
  private logo!: GameObjects.Image;
  private title!: GameObjects.Text;
  /** 标题斜光带 atom（赛博"反光感"装饰，跟 splash 同款） */
  private titleShine: TitleShine | null = null;
  private subtitle!: GameObjects.Text;

  // 顶部工具栏
  private creditsIcon!: GameObjects.Graphics;
  private creditsText!: GameObjects.Text;
  private settingsBtn: PhaserButton | null = null;
  private accountText: GameObjects.Text | null = null;
  private accountHit: GameObjects.Container | null = null;
  private accountHitRect: import('phaser').Geom.Rectangle | null = null;
  private accountUnsub: (() => void) | null = null;

  // 中央主线 hub
  private startBtn: StartGameButton | null = null;

  // 下方功能 grid
  private equipBtn: PhaserButton | null = null;
  private shopBtn: PhaserButton | null = null;
  private researchBtn: PhaserButton | null = null;
  private encyclopediaBtn: PhaserButton | null = null;
  private mailBtn: IconLabelButton | null = null;
  private announceBtn: IconLabelButton | null = null;
  private replayBtn: IconLabelButton | null = null;

  private versionText!: GameObjects.Text;
  private migrationModal: GameObjects.Container | null = null;
  private logoutModal: GameObjects.Container | null = null;
  private toast!: Toast;

  constructor() {
    super('MainMenuScene');
  }

  create(): void {
    trackSceneView('MainMenuScene');
    this.bg = new SceneBackground(this);
    // 不加 applySceneBloom：mobile 480 viewport 上 bloom GPU box blur 把高频细节抹平，
    // 视觉上整体发灰、失锐度（Splash 同款理由不加）。发光感由 title.setShadow +
    // starsIcon shadow + startBtn glow 层承担，已足够。
    fadeInOnEnter(this);
    const { width, height } = this.scale;

    // 应用 settings 音量 + 切到 menu BGM
    const meta = useMetaStore.getState();
    let s = meta.settings;
    // 自动修复：之前 SettingsScene 不同步 store + bgm 实例，可能残留无效值
    // 没 mute 但音量 ≤ 0.01 视为"被旧版本 bug 卡死"，强制恢复默认
    if (!s.muted && (s.bgmVolume <= 0.01 || s.sfxVolume <= 0.01)) {
      const fixed = {
        ...s,
        bgmVolume: s.bgmVolume <= 0.01 ? 0.6 : s.bgmVolume,
        sfxVolume: s.sfxVolume <= 0.01 ? 1 : s.sfxVolume,
      };
      meta.updateSettings(fixed);
      s = fixed;
    }
    bgm.setMuted(s.muted);
    bgm.setVolume(s.bgmVolume);
    sfx.setVolume(s.sfxVolume);
    sfx.ensure();
    bgm.play('menu');
    this.input.once('pointerdown', () => {
      sfx.ensure();
      bgm.play('menu');
    });

    this.toast = new Toast(this);

    // ===== 顶部工具栏 =====
    // 能量结晶（菱形 atom + 数字），与 ShopScene 视觉一致
    this.creditsIcon = makeCrystalIcon(this, px(14));
    this.creditsText = this.add
      .text(0, 0, '0', {
        fontFamily: FONT,
        fontSize: `${px(12)}px`,
        color: COLOR.rewardGold,
        fontStyle: 'bold',
      })
      .setLetterSpacing(px(12 * 0.15))
      // 顶栏新布局：能量结晶移到右侧，文字以右边界对齐 → origin (1, 0.5)
      .setOrigin(1, 0.5)
      .setResolution(DPR);

    // 设置按钮：跟账号按钮同款 PhaserButton 矩形，风格统一
    this.settingsBtn = new PhaserButton(this, 0, 0, {
      label: '设置',
      width: 60,
      height: 28,
      fontSize: 10,
      color: HEX.dim,
      letterSpacingEm: 0.18,
      onTap: () => {
        sfx.ensure();
        transitionToScene(this, 'SettingsScene');
      },
      ariaLabel: 'open-settings',
    });

    // 账号区：纯文字展示。未登录 → "未登录"；已登录 → "Hi, <username>"。
    // 不再承担「点击登录」入口（登录由「开始游戏」按钮强制拦截）。H5 端已登录时
    // 文字下方挂一个 hit zone 触发退出确认 modal；wx 端不挂 zone（强登录）。
    this.accountText = this.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: `${px(12)}px`,
        color: COLOR.primary,
        fontStyle: 'bold',
      })
      .setLetterSpacing(px(12 * 0.15))
      .setOrigin(0, 0.5)
      .setResolution(DPR);
    this.accountUnsub = getShell().authStore?.subscribe(() => this.syncAccountDisplay()) ?? null;
    this.syncAccountDisplay();

    // ===== 中央主线 hub =====
    // Logo：使用 Lv1 巨噬细胞塔素材（与 Splash / 游戏内战斗塔视觉一致）
    this.logo = this.add.image(0, 0, TEX.tower('macrophage', 1));
    this.logo.setDisplaySize(px(72), px(72));

    // 标题 / 副标完全对齐 SplashScene（同字号档 / 同 padding / 同 shadow）
    this.title = this.add
      .text(0, 0, '微 观 防 线', {
        fontFamily: FONT,
        fontSize: `${px(32)}px`,
        fontStyle: '900',
        color: COLOR.primary,
      })
      .setPadding(px(SPACING.lg), px(SPACING.md + SPACING.xs))
      .setStroke(COLOR.bgDeep, px(1))
      .setShadow(0, 0, COLOR.primary, px(3), false, true)
      .setResolution(DPR);

    this.subtitle = this.add
      .text(0, 0, 'IMMUNE · TD', {
        fontFamily: FONT,
        fontSize: `${px(12)}px`,
        color: COLOR.dim,
      })
      .setPadding(px(SPACING.sm + SPACING.xs), px(SPACING.sm + 2))
      .setShadow(0, 0, COLOR.dim, px(2), false, true)
      .setLetterSpacing(px(12 * 0.4))
      .setResolution(DPR);

    // 中央主按钮「开始游戏」
    this.startBtn = new StartGameButton(this, () => this.startCurrentLevel());

    // ===== 下方功能 grid · 第一行（高频 4 按钮） =====
    // 4 高频按钮 label 改 primary 色（原 dim 灰色拉灰整个画面下半部分）。
    // 视觉权重靠主按钮的「填充亮绿」vs 这 4 个的「描边 + primary 字」自然区分，
    // 不再需要灰色降级。
    this.equipBtn = new PhaserButton(this, 0, 0, {
      label: '战备',
      width: 70,
      height: 38,
      fontSize: 11,
      color: HEX.primary,
      letterSpacingEm: 0.25,
      onTap: () => {
        sfx.ensure();
        transitionToScene(this, 'EquipScene');
      },
      ariaLabel: 'open-equip',
    });
    this.shopBtn = new PhaserButton(this, 0, 0, {
      label: '商店',
      width: 70,
      height: 38,
      fontSize: 11,
      color: HEX.primary,
      letterSpacingEm: 0.25,
      onTap: () => {
        sfx.ensure();
        transitionToScene(this, 'ShopScene');
      },
      ariaLabel: 'open-shop',
    });
    this.researchBtn = new PhaserButton(this, 0, 0, {
      label: '研究',
      width: 70,
      height: 38,
      fontSize: 11,
      color: HEX.primary,
      letterSpacingEm: 0.25,
      onTap: () => {
        sfx.ensure();
        transitionToScene(this, 'ResearchScene');
      },
      ariaLabel: 'open-research',
    });
    this.encyclopediaBtn = new PhaserButton(this, 0, 0, {
      label: '百科',
      width: 70,
      height: 38,
      fontSize: 11,
      color: HEX.primary,
      letterSpacingEm: 0.25,
      onTap: () => {
        sfx.ensure();
        transitionToScene(this, 'EncyclopediaScene');
      },
      ariaLabel: 'open-encyclopedia',
    });

    // ===== 下方功能 grid · 第二行（中频 3 个按钮 · wireframe 几何 icon + label） =====
    this.mailBtn = new IconLabelButton(this, {
      iconDraw: drawMailIcon,
      label: '邮箱',
      color: HEX.dim,
      disabled: true,
      onTap: () => this.toast.show('即将上线', COLOR.dim),
    });
    this.announceBtn = new IconLabelButton(this, {
      iconDraw: drawAnnounceIcon,
      label: '公告',
      color: HEX.dim,
      disabled: true,
      onTap: () => this.toast.show('即将上线', COLOR.dim),
    });
    this.replayBtn = new IconLabelButton(this, {
      iconDraw: drawReplayIcon,
      label: '回放',
      color: HEX.replay,
      disabled: !shellIsAuthenticated(),
      onTap: () => this.handleReplayTap(),
    });

    // 底部版本号
    this.versionText = this.add
      .text(0, 0, 'v0.5 · 第二章 呼吸道', {
        fontFamily: FONT,
        fontSize: `${px(9)}px`,
        color: COLOR.dim,
      })
      .setAlpha(0.5)
      .setLetterSpacing(px(9 * 0.2))
      .setResolution(DPR);

    this.refreshContent();
    this.layout(width, height);
    onSceneResize(this, (w, h) => {
      if (!this.title?.active) return; // scene 销毁后 resize 仍可能触发
      this.layout(w, h);
    });

    // 一次性升级提示：v3 → v4 迁移后的首次进入主菜单时弹出
    if (useMetaStore.getState().freshlyMigrated) {
      this.showMigrationModal();
    }

    // shutdown 清理：Phaser 重启 scene 时复用同一个 class 实例，但 children 都被销毁。
    // 不主动 null 的字段 = 下次 create 里仍持有「已死的引用」。
    // 触发 bug 的链路：syncAccountButton() 在 create 入口被同步调一次，里面 `if (this.startBtn)`
    // 见到旧 truthy 引用 → 提前 layout()。此时新 title 还没建，shine image 加进 displayList
    // 的位置在新 title 之前 → 之后 title 被加在 shine 上面把 shine 盖死。
    this.events.once('shutdown', () => {
      this.accountUnsub?.();
      this.accountUnsub = null;
      this.titleShine?.destroy();
      this.titleShine = null;
      this.startBtn = null;
      this.replayBtn = null;
      this.equipBtn = null;
      this.shopBtn = null;
      this.researchBtn = null;
      this.encyclopediaBtn = null;
      this.mailBtn = null;
      this.announceBtn = null;
      this.settingsBtn = null;
      this.accountText = null;
      this.accountHit = null;
      this.migrationModal = null;
      this.logoutModal = null;
    });
  }

  /** 根据当前 auth 状态更新账号文字 + 重建 hit zone（已登录的 H5 才有）。 */
  private syncAccountDisplay(): void {
    if (!this.accountText) return;
    const auth = getShell().authStore?.getState();

    // hit zone 每次重建：text 宽度随用户名变化，size 通过 layout() 重设
    if (this.accountHit) {
      this.accountHit.destroy(true);
      this.accountHit = null;
      this.accountHitRect = null;
    }

    if (auth?.isAuthenticated() && auth.user) {
      const raw = shellDisplayName(auth.user);
      const name = raw.length > 10 ? `${raw.slice(0, 8)}..` : raw;
      this.accountText.text = `Hi, ${name}`;
      this.accountText.setColor(COLOR.primary);
      // wx 端不允许退出登录（spec § 12.1 强登录），不挂 hit container
      if (!IS_WX) {
        const hit = this.add.container(0, 0);
        hit.setSize(1, 1);
        this.accountHitRect = setRectInteractive(hit, 1, 1, {
          useHandCursor: true,
          bgAlign: 'topLeft',
        });
        hit.on('pointerdown', () => {
          sfx.uiClick();
          this.showLogoutConfirmModal();
        });
        this.accountHit = hit;
      }
    } else {
      this.accountText.text = '未登录';
      this.accountText.setColor(COLOR.dim);
    }

    // 回放按钮的 disabled 态跟随登录态
    if (this.replayBtn?.container.scene) {
      const wasAuth = auth?.isAuthenticated() ?? false;
      this.replayBtn.destroy();
      this.replayBtn = new IconLabelButton(this, {
        iconDraw: drawReplayIcon,
        label: '回放',
        color: HEX.replay,
        disabled: !wasAuth,
        onTap: () => this.handleReplayTap(),
      });
    }
    // create 期间 startBtn 等尚未创建时跳过 layout；subscribe 回调时已就绪
    if (this.startBtn) {
      this.layout(this.scale.width, this.scale.height);
    }
  }

  private handleReplayTap(): void {
    if (shellIsAuthenticated()) {
      sfx.ensure();
      transitionToScene(this, 'ReplayListScene');
    } else {
      this.toast.show('登录后可用', COLOR.dim);
    }
  }

  /** 退出登录确认 modal：取消 / 退出登录 两按钮，点遮罩视作取消 */
  private showLogoutConfirmModal(): void {
    if (this.logoutModal) return;
    const username = getShell().authStore?.getState().user?.username ?? '';

    const W = this.scale.width;
    const H = this.scale.height;
    const cardW = px(360);
    const cardH = px(220);
    const cardX = Math.round((W - cardW) / 2);
    const cardY = Math.round((H - cardH) / 2);

    const dim = this.add.graphics();
    dim.fillStyle(HEX.bg, 0.85).fillRect(0, 0, W, H);
    // 用 pointerdown 而不是 pointerup：打开 modal 的账号按钮 pointerdown 触发 onTap
    // 创建 dimZone 后，同次的 pointerup 会落到 dimZone 上，用 pointerup 会秒关弹窗。
    const dimZone = this.add
      .zone(0, 0, W, H)
      .setOrigin(0, 0)
      .setInteractive()
      .on('pointerdown', () => this.dismissLogoutModal());

    const card = this.add.graphics();
    card
      .fillStyle(HEX.bg, 0.98)
      .fillRect(cardX, cardY, cardW, cardH)
      .lineStyle(px(1), HEX.primary, 1)
      .strokeRect(cardX, cardY, cardW, cardH);

    const title = this.add
      .text(W / 2, cardY + px(28), '确认退出登录', {
        fontFamily: FONT,
        fontSize: `${px(18)}px`,
        color: COLOR.primary,
      })
      .setOrigin(0.5)
      .setLetterSpacing(px(18 * 0.3))
      .setShadow(0, 0, COLOR.primary, px(10), false, true);

    const bodyText = username
      ? `当前账号：${username}\n退出后本设备进度回到初始状态\n（音量 / 画质设置保留）`
      : '退出后本设备进度回到初始状态\n（音量 / 画质设置保留）';
    const body = this.add
      .text(W / 2, cardY + px(72), bodyText, {
        fontFamily: FONT,
        fontSize: `${px(12)}px`,
        color: COLOR.dim,
        align: 'center',
        lineSpacing: px(6),
      })
      .setOrigin(0.5, 0)
      .setLetterSpacing(px(12 * 0.15));

    const btnY = cardY + cardH - px(40);
    const btnGap = px(16);
    const btnW = 120;
    const cancelX = W / 2 - px(btnW / 2) - btnGap / 2;
    const confirmX = W / 2 + px(btnW / 2) + btnGap / 2;

    const cancelBtn = new PhaserButton(this, cancelX, btnY, {
      label: '取消',
      width: btnW,
      height: 32,
      fontSize: 12,
      letterSpacingEm: 0.25,
      color: HEX.dim,
      strokeColor: HEX.dim,
      onTap: () => this.dismissLogoutModal(),
      ariaLabel: 'cancel-logout',
    });
    const confirmBtn = new PhaserButton(this, confirmX, btnY, {
      label: '退出登录',
      width: btnW,
      height: 32,
      fontSize: 12,
      letterSpacingEm: 0.25,
      color: HEX.danger,
      strokeColor: HEX.danger,
      onTap: () => this.confirmLogout(),
      ariaLabel: 'confirm-logout',
    });

    const container = this.add.container(0, 0, [
      dim,
      dimZone,
      card,
      title,
      body,
      cancelBtn.container,
      confirmBtn.container,
    ]);
    container.setDepth(1000);
    this.logoutModal = container;
  }

  private dismissLogoutModal(): void {
    if (this.logoutModal) {
      this.logoutModal.destroy(true);
      this.logoutModal = null;
    }
  }

  private confirmLogout(): void {
    this.dismissLogoutModal();
    void getShell().authStore?.getState().logout();
  }

  /** 一次性升级提示 modal：半透明遮罩 + 居中卡片 + cyan-on-dark 医疗风 */
  private showMigrationModal(): void {
    if (this.migrationModal) return;
    const W = this.scale.width;
    const H = this.scale.height;
    const cardW = px(360);
    const cardH = px(200);
    const cardX = Math.round((W - cardW) / 2);
    const cardY = Math.round((H - cardH) / 2);

    const dim = this.add.graphics();
    dim.fillStyle(HEX.bg, 0.85).fillRect(0, 0, W, H);
    // 拦截背景点击：包一层 zone 而非给 Graphics 直接 setInteractive
    const dimZone = this.add.zone(0, 0, W, H).setOrigin(0, 0).setInteractive();

    const card = this.add.graphics();
    card
      .fillStyle(HEX.bg, 0.98)
      .fillRect(cardX, cardY, cardW, cardH)
      .lineStyle(px(1), HEX.primary, 1)
      .strokeRect(cardX, cardY, cardW, cardH);

    const title = this.add
      .text(W / 2, cardY + px(28), '游戏架构升级', {
        fontFamily: FONT,
        fontSize: `${px(18)}px`,
        color: COLOR.primary,
      })
      .setOrigin(0.5)
      .setLetterSpacing(px(18 * 0.3))
      .setShadow(0, 0, COLOR.primary, px(10), false, true);

    const body = this.add
      .text(W / 2, cardY + px(80), '关卡进度需重新解锁\n星级和设置已保留', {
        fontFamily: FONT,
        fontSize: `${px(12)}px`,
        color: COLOR.dim,
        align: 'center',
        lineSpacing: px(8),
      })
      .setOrigin(0.5, 0)
      .setLetterSpacing(px(12 * 0.15));

    const okBtn = new PhaserButton(this, W / 2, cardY + cardH - px(36), {
      label: '确认',
      width: 120,
      height: 32,
      fontSize: 12,
      letterSpacingEm: 0.25,
      onTap: () => this.dismissMigrationModal(),
      ariaLabel: 'acknowledge-migration',
    });

    const container = this.add.container(0, 0, [dim, dimZone, card, title, body, okBtn.container]);
    container.setDepth(1000);
    this.migrationModal = container;
  }

  private dismissMigrationModal(): void {
    useMetaStore.getState().acknowledgeMigration();
    if (this.migrationModal) {
      this.migrationModal.destroy(true);
      this.migrationModal = null;
    }
  }

  private refreshContent(): void {
    const meta = useMetaStore.getState();

    // 顶部条 credits 数字
    if (this.creditsText) this.creditsText.setText(`${meta.credits}`);

    // 中央主按钮副标：「关 N · 章节标题」 / 全通关用替代文案
    if (this.startBtn) {
      if (isAllCleared(meta.stars)) {
        this.startBtn.setSubtitle('全部已通关 · 重玩任意关卡');
      } else {
        const nextId = findNextLevelId(meta.unlockedLevels, meta.stars);
        const next = LEVELS[nextId];
        const chapter = CHAPTERS.find((c) => c.levelIds.includes(nextId));
        const idLabel = nextId === 0 ? '序章' : `关 ${nextId}`;
        const sub = `${idLabel} · ${chapter?.title ?? ''} · ${next?.title ?? ''}`;
        this.startBtn.setSubtitle(sub);
      }
    }
  }

  private startCurrentLevel(): void {
    sfx.ensure();
    // H5 强制登录：未登录先弹 modal，登录成功后再继续 enterLevel；wx 端 BootScene 已强登录无匿名态
    if (!IS_WX && !shellIsAuthenticated()) {
      useUiStore.getState().openLoginModal(() => this.enterSelectedLevel());
      return;
    }
    this.enterSelectedLevel();
  }

  private enterSelectedLevel(): void {
    // 跳 LevelSelectScene 让用户选关（自动滚到当前可玩的下一关）；
    // 而不是 enterLevel 直接进战斗——避免关掉用户挑别的关的能力
    const meta = useMetaStore.getState();
    const nextId = findNextLevelId(meta.unlockedLevels, meta.stars);
    useUiStore.getState().setCurrentLevelId(nextId);
    transitionToScene(this, 'LevelSelectScene');
  }

  private layout(W: number, H: number): void {
    this.bg.setViewport(W, H);
    const cssW = W / DPR;

    // ===== 顶部工具栏（高度约 36 CSS px，wx 端 SAFE_TOP 兜住胶囊 / 灵动岛） =====
    // 顶部条 padding（CSS px）：visually equivalent SPACING.md + xs，跟原值 20 对齐
    const topPadX = SPACING.md + SPACING.xs; // = 20
    // topRowCenterY = SAFE_TOP + 30：按钮高 28，顶距 SAFE_TOP = 30-14 = 16 = SPACING.md
    // 比 DESIGN_GUIDE 最小值（SAFE_TOP + SPACING.sm = 8）多 8 px 缓冲，H5 端不再贴屏顶
    const topRowCenterY = SAFE_TOP + px(SPACING.lg + SPACING.xs + 2); // = px(30)
    // 顶栏左→右：账号（用户信息）→ 设置 → 能量结晶
    // 左侧：accountText 锚屏左；hit zone（已登录 H5）覆盖文字 + padding
    const leftAnchor = anchorTopLeft(W, H, px(topPadX), topRowCenterY);
    if (this.accountText) {
      this.accountText.setPosition(leftAnchor.x, topRowCenterY);
      if (this.accountHit && this.accountHitRect) {
        const tw = this.accountText.width;
        const th = this.accountText.height;
        const padHitX = px(SPACING.sm); // hit area 比文字略宽
        const padHitY = px(SPACING.xs);
        const zw = tw + padHitX * 2;
        const zh = th + padHitY * 2;
        this.accountHit.setSize(zw, zh);
        // bgAlign='topLeft'：setSize 后 displayOrigin = (zw/2, zh/2)，hit rect 偏移同步
        this.accountHitRect.setTo(zw / 2, zh / 2, zw, zh);
        this.accountHit.setPosition(leftAnchor.x - padHitX, topRowCenterY - zh / 2);
      }
    }
    // 右侧：creditsText 右对齐到屏右 → icon 左侧 → settingsBtn 再左
    const rightAnchor = anchorTopRight(W, H, px(topPadX), topRowCenterY);
    if (this.creditsIcon && this.creditsText) {
      // creditsText origin (1, 0.5)：x 即文字右边界
      this.creditsText.setPosition(rightAnchor.x, topRowCenterY);
      const iconHalfW = px(7); // icon size px(14)，半宽 7
      const iconTextGap = px(SPACING.sm - 2); // = px(6)，跟原视觉一致
      const textLeftEdge = rightAnchor.x - this.creditsText.width;
      this.creditsIcon.setPosition(textLeftEdge - iconTextGap - iconHalfW, topRowCenterY);
    }
    if (this.settingsBtn && this.creditsIcon) {
      const setW = this.settingsBtn.widthPx;
      const gap = px(SPACING.sm + 2); // = px(10)
      const iconLeftEdge = this.creditsIcon.x - px(7); // icon 半宽 = 7
      this.settingsBtn.container.setPosition(iconLeftEdge - gap - setW / 2, topRowCenterY);
    }

    // ===== 中央主线 hub =====
    // 居中算法基于"可见高度"，避免被 wx 端胶囊 / home indicator 偏到边缘
    const centerY = (H - SAFE_TOP - SAFE_BOTTOM) / 2 + SAFE_TOP;
    const stackWidth = Math.min(320, cssW * 0.86);

    // 标题字号对齐 SplashScene（32 / 36 / 44）
    const titleSize = cssW < 500 ? 32 : cssW < 800 ? 36 : 44;
    this.title.setFontSize(`${px(titleSize)}px`);

    // logo + 标题 + 副标 stack：放在 hub 顶部，往下依次是主按钮
    const logoSize = px(SPACING.xxl + SPACING.md); // = px(64)
    const logoGap = px(SPACING.sm - 2); // = px(6)
    // hub 顶部锚点：从 centerY 往上 110 CSS px（视觉调校值，SPACING 阶梯拼不出，保留显式）
    const titleY = centerY - px(110);
    this.logo.setDisplaySize(logoSize, logoSize);
    this.logo.setPosition(W / 2, titleY - logoSize / 2 - logoGap);
    this.title.setPosition((W - this.title.width) / 2, titleY);
    this.subtitle.setPosition((W - this.subtitle.width) / 2, titleY + this.title.height - px(8));

    // 标题斜光带（跟 splash 同款 TitleShine atom）
    if (!this.titleShine) {
      this.titleShine = new TitleShine(this, this.title, 'main-menu-title-shine');
    }
    this.titleShine.update(titleSize);

    // 主按钮「开始游戏」：宽度跟随 stackWidth，置中。h=72。
    // 副标底 → startBtn 顶留 ≥ SPACING.xl 缓冲（startBtn 已无 cyber L 外扩）
    if (this.startBtn) {
      this.startBtn.resize(stackWidth, 72);
      this.startBtn.setPosition(W / 2, centerY + px(SPACING.xl + SPACING.lg)); // = px(56)
    }

    // ===== 下方功能 grid =====
    // 第一行：4 等宽按钮（战备 / 商店 / 研究 / 百科）
    // startBtn (y=centerY+56) 视觉底（cyber 装饰外扩 8）= centerY + 100
    // hub→grid SPACING.lg(24) → row1 顶 ≥ centerY + 124 → row1 中心 ≥ centerY + 143
    const gridGap = SPACING.sm; // CSS px
    const gridW = stackWidth;
    const colW = (gridW - gridGap * 3) / 4;
    const row1Y = centerY + px(SPACING.xxl + SPACING.xxl + SPACING.xl + SPACING.md); // = px(144)
    const startX = W / 2 - px(gridW / 2) + px(colW / 2);
    if (this.equipBtn) {
      this.equipBtn.setSize(colW, 38);
      this.equipBtn.container.setPosition(startX + px((colW + gridGap) * 0), row1Y);
    }
    if (this.shopBtn) {
      this.shopBtn.setSize(colW, 38);
      this.shopBtn.container.setPosition(startX + px((colW + gridGap) * 1), row1Y);
    }
    if (this.researchBtn) {
      this.researchBtn.setSize(colW, 38);
      this.researchBtn.container.setPosition(startX + px((colW + gridGap) * 2), row1Y);
    }
    if (this.encyclopediaBtn) {
      this.encyclopediaBtn.setSize(colW, 38);
      this.encyclopediaBtn.container.setPosition(startX + px((colW + gridGap) * 3), row1Y);
    }

    // 第二行：3 个 icon + label，居中
    const iconBtnW = SPACING.xxl + SPACING.md; // = 64 CSS px
    const iconBtnH = SPACING.xl + SPACING.lg; // = 56 CSS px
    const iconGap2 = SPACING.md; // = 16 CSS px
    const totalW = iconBtnW * 3 + iconGap2 * 2;
    const row2StartX = W / 2 - px(totalW / 2) + px(iconBtnW / 2);
    // row1 高 38 / row2 高 56，要 row1 底 + SPACING.md ≤ row2 顶
    // → row2Y - row1Y ≥ 19 + 16 + 28 = 63 → 用 SPACING.xxl + SPACING.md = 64
    const row2Y = row1Y + px(SPACING.xxl + SPACING.md); // = px(64)
    if (this.mailBtn) {
      this.mailBtn.setSize(iconBtnW, iconBtnH);
      this.mailBtn.setPosition(row2StartX + px((iconBtnW + iconGap2) * 0), row2Y);
    }
    if (this.announceBtn) {
      this.announceBtn.setSize(iconBtnW, iconBtnH);
      this.announceBtn.setPosition(row2StartX + px((iconBtnW + iconGap2) * 1), row2Y);
    }
    if (this.replayBtn) {
      this.replayBtn.setSize(iconBtnW, iconBtnH);
      this.replayBtn.setPosition(row2StartX + px((iconBtnW + iconGap2) * 2), row2Y);
    }

    // 底部版本号：锚屏底中心向上 SAFE_BOTTOM + SPACING.md（兜 home indicator 后的内边距）。
    // anchorBottomCenter offsetY 朝上，等价于 H - (SAFE_BOTTOM + px(SPACING.md))
    const verAnchor = anchorBottomCenter(W, H, 0, SAFE_BOTTOM + px(SPACING.md));
    // versionText origin (0,0)，setPosition.y 给文字顶部；保持原行为（y = H - SAFE_BOTTOM - px(16)）
    this.versionText.setPosition(verAnchor.x - this.versionText.width / 2, verAnchor.y);
  }

  override update(_t: number, dt: number): void {
    this.bg.tick(dt, this.scale.width, this.scale.height);
  }
}
