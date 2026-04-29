import { type GameObjects, Scene } from 'phaser';
import { bgm } from '@audio/bgm';
import { loadBgmWithProgress } from '@audio/bgm-loader';
import { sfx } from '@audio/sfx';
import { shellIsAuthenticated } from '../../shell';
import { useUiStore } from '@ui/store';
import { TEX, listSpriteAssets } from '../asset-keys';
import { DPR } from '../dpr';
import { setRectInteractive } from '../interactive';
import { SPACING } from '../layout/spacing';
import { aggregateProgress, isAllReady, useLoadStore } from '../load-store';
import { SAFE_BOTTOM, SAFE_TOP } from '../safe-area';
import { SceneBackground } from '../scene-bg';
import { transitionToScene } from '../scene-fx';
import { onSceneResize } from '../scene-resize';
import { COLOR, HEX, FONT as STYLE_FONT } from '../style';
import { TitleShine } from '../ui/atoms/title-shine';

// 预估（用于 Content-Length 缺失时的 total 兜底，避免分母为 0）
const DEFAULT_AUDIO_BYTES = 1_800_000;

// 中文 glyph 优先 fallback 到无衬线（雅黑/苹方/思源），避免落到 monospace 时被映射成宋体
const FONT = STYLE_FONT;
// 读 style token（DESIGN_SYSTEM 生物医学色板：immune / neutro / text-dim）
const PRIMARY = COLOR.primary;
const DIM = COLOR.dim;
const PRIMARY_HEX = HEX.primary;
const ACCENT_HEX = HEX.accent;

const MIN_DURATION_MS = 1200;

/** game world 内部坐标 = CSS px × DPR；px(n) 把 CSS 像素转 game world */
const px = (n: number) => n * DPR;

/** Splash 屏：标题 + 装饰 + 加载进度 + "进入游戏"按钮（DOM 解锁 autoplay）。 */
export class SplashScene extends Scene {
  // 背景由共享 SceneBackground 负责（血管 + 呼吸粒子 + 邻近连线）
  private bg!: SceneBackground;
  // 标题：底层 Text（字 + 外 glow）+ 顶层叠 TitleShine atom（斜白光带，赛博"反光感"装饰）
  private title!: GameObjects.Text;
  private titleShine: TitleShine | null = null;
  private subtitle!: GameObjects.Text;
  private cellSprite!: GameObjects.Image;
  private cellGlow!: GameObjects.Graphics;
  private ecgGfx!: GameObjects.Graphics;
  private ecgPhase = 0;
  private statusText!: GameObjects.Text;
  private progressBg!: GameObjects.Graphics;
  private progressFill!: GameObjects.Graphics;
  private progressLabel!: GameObjects.Text;
  private enterBtn: GameObjects.Container | null = null;
  private enterBtnBgUnder: GameObjects.Graphics | null = null;
  private enterBtnBgOver: GameObjects.Graphics | null = null;
  private enterBtnSilhouette: GameObjects.Image | null = null;
  private enterBtnH = 0;
  private cellRotation = 0;
  private displayedProgress = 0;
  private startedAt = 0;

  constructor() {
    super('SplashScene');
  }

  /** 创建 Text：fontSize 用 game world 像素（CSS × DPR）。
   * 关键：必须 `setResolution(DPR)`，否则 Phaser Text 内部 canvas 默认 resolution=1
   * 直接按 fontSize px 渲染，再贴到 game buffer 上屏 = 物理像素密度 1/DPR → 糊。
   * 设 resolution=DPR 让 Text canvas 用 DPR× 倍密度渲染，物理像素密度对齐屏幕，字才锐。 */
  private mkText(
    x: number,
    y: number,
    text: string,
    cssFontSize: number,
    color: string,
    bold = false,
  ): GameObjects.Text {
    return this.add
      .text(x, y, text, {
        fontFamily: FONT,
        fontSize: `${px(cssFontSize)}px`,
        fontStyle: bold ? 'bold' : '',
        color,
      })
      .setResolution(DPR);
  }

  /** 主标题专用：fontStyle '900' 命中 MiSans Heavy 字重，比 'bold' (700) 更方正锐利 */
  private mkTitleText(
    x: number,
    y: number,
    text: string,
    cssFontSize: number,
    color: string,
  ): GameObjects.Text {
    return this.add
      .text(x, y, text, {
        fontFamily: FONT,
        fontSize: `${px(cssFontSize)}px`,
        fontStyle: '900',
        color,
      })
      .setResolution(DPR);
  }

  create(): void {
    this.startedAt = performance.now();
    const { width, height } = this.scale;

    // 背景层（血管 + 粒子 + 连线）。窄屏 letterbox 下不再加 applySceneBloom：
    // bloom kernel 在小 buffer 上扩散显糊，字 + cellGlow 已自带发光（setShadow + fillCircle）。
    this.bg = new SceneBackground(this);

    // 中央细胞底下的发光环（呼吸感更强）
    this.cellGlow = this.add.graphics();
    this.cellSprite = this.add.image(0, 0, 'tower-macrophage-1');
    this.cellSprite.setDisplaySize(px(110), px(110));

    // 心电图（保留 — 心跳是生物叙事核心）
    this.ecgGfx = this.add.graphics();

    // 文字层：标题 / 副标题 / 状态 / 进度
    // 窄屏（letterbox 480）下：shadow blur px(8)→px(3) 收紧外光晕（之前占字号 30% 显糊），
    // titleShine 整段删（白色光带 alpha 0.95 叠在字上让字"毛"，赛博发光感由 shadow 承担）
    // 主标题加 1px stroke（深色描边）让 glyph 边缘锐利，补强 cyber 美学锐感
    this.title = this.mkTitleText(0, 0, '微 观 防 线', 44, PRIMARY)
      .setPadding(px(24), px(20))
      .setStroke(COLOR.bgDeep, px(1))
      .setShadow(0, 0, PRIMARY, px(3), false, true);

    this.subtitle = this.mkText(0, 0, 'IMMUNE · TD', 12, DIM)
      .setPadding(px(12), px(10))
      .setShadow(0, 0, DIM, px(2), false, true)
      .setLetterSpacing(px(12 * 0.4));

    this.statusText = this.mkText(0, 0, '生 命 体 征 · 校 准 中', 11, DIM);

    this.progressBg = this.add.graphics();
    this.progressFill = this.add.graphics();
    this.progressLabel = this.mkText(0, 0, '0%', 10, PRIMARY, true);

    this.layout(width, height);

    onSceneResize(this, (w, h) => this.layout(w, h));

    // 字体异步加载完成后重排一次，消除 FOUT（fallback 字体宽高与真实字体不同导致位置跳变）
    // wx 端 document.fonts 不存在，跳过（BootScene 已 set fontsReady=true 假设字体就绪）
    if (typeof document !== 'undefined' && (document as Document).fonts) {
      void (document as Document).fonts.ready.then(() => {
        this.titleShine?.invalidateCache([32, 36, 44]); // wx 端 titleShine 为 null，安全
        this.layout(this.scale.width, this.scale.height);
      });
    }

    // UI 绘制完成 —— 立即启动主资源加载（BootScene 已预加载中心细胞图）
    this.startMainLoad();
  }

  /**
   * 主资源加载：sprites + 两轨 BGM + sfx。两类走不同路径但**都是真实字节**驱动：
   *   - sprite: Phaser loader 的 fileprogress（bytesLoaded / bytesTotal）
   *   - audio:  手动 fetch + ReadableStream chunk 累加（见 bgm-loader.ts）
   *             —— 绕开 Phaser audio loader 不发进度事件的问题，decode 后注入
   *             game.cache.audio
   *
   * BGM 分级阻塞：
   *   - menu.mp3 **阻塞**"进入游戏"按钮（进 MainMenu 就要放，不能静音）
   *   - battle.mp3 **后台**下载（只在开战时用，下完调 bgm.registerSound('battle')
   *     追加，玩家在 MainMenu / LevelBriefing 期间 battle 基本能下完）
   */
  private startMainLoad(): void {
    const set = useLoadStore.setState;

    // 进度聚合：sprite + menu.mp3 两路影响 spriteProgress；battle.mp3 独立不入
    type FileBytes = { loaded: number; total: number };
    const blockingFiles = new Map<string, FileBytes>();
    const DEFAULT_IMG_BYTES = 60_000;

    const phaserKey = TEX.tower('macrophage', 1); // BootScene 已加载，跳过
    for (const asset of listSpriteAssets()) {
      if (asset.key === phaserKey) continue;
      blockingFiles.set(asset.key, { loaded: 0, total: DEFAULT_IMG_BYTES });
      if (asset.format === 'svg') {
        // Phaser load.svg 走 Image.onload，rasterize 到声明尺寸；width/height 可选
        this.load.svg(asset.key, asset.url, {
          width: asset.width ?? 128,
          height: asset.height ?? 128,
        });
      } else {
        this.load.image(asset.key, asset.url);
      }
    }
    // menu.mp3 算阻塞；battle.mp3 后台加载
    blockingFiles.set('menu', { loaded: 0, total: DEFAULT_AUDIO_BYTES });

    const recompute = () => {
      let l = 0;
      let t = 0;
      // 用 forEach 而不是 for...of map.values()：wx 工具对 Map iterator 转译有 bug
      blockingFiles.forEach((f) => {
        l += f.loaded;
        t += f.total;
      });
      set({ spriteProgress: t > 0 ? Math.min(1, l / t) : 0 });
    };

    // --- sprite: Phaser loader ---
    this.load.on(
      'fileprogress',
      (file: Phaser.Loader.File & { bytesLoaded?: number; bytesTotal?: number }) => {
        const f = blockingFiles.get(file.key);
        if (!f) return;
        if (file.bytesTotal && file.bytesTotal > 0) f.total = file.bytesTotal;
        if (typeof file.bytesLoaded === 'number') f.loaded = file.bytesLoaded;
        recompute();
      },
    );
    this.load.on('filecomplete', (key: string) => {
      const f = blockingFiles.get(key);
      if (!f) return;
      f.loaded = f.total; // 小文件可能没 fileprogress
      recompute();
    });

    const spriteDone = new Promise<void>((resolve) => {
      this.load.once('complete', () => resolve());
    });

    const IS_WX = import.meta.env.VITE_PLATFORM === 'wx';

    // --- menu.mp3: 阻塞加载 ---
    // wx 端跳过：bgm-loader 用 fetch + ReadableStream，wx 没 fetch 全局
    // 等 audio.wx.ts 实装（spec T1.6）后改用 wx.downloadFile + InnerAudioContext
    const menuBgmPromise: Promise<unknown> = IS_WX
      ? Promise.resolve().then(() => {
          const rec = blockingFiles.get('menu');
          if (rec) {
            rec.loaded = rec.total;
            recompute();
          }
        })
      : loadBgmWithProgress(
          this.game,
          'menu',
          '/assets/bgm/menu.mp3',
          ({ loaded, total }) => {
            const rec = blockingFiles.get('menu');
            if (!rec) return;
            if (total > 0) rec.total = total;
            rec.loaded = loaded;
            recompute();
          },
        ).catch((err) => {
          console.error('[bgm-loader] menu', err);
          const rec = blockingFiles.get('menu');
          if (rec) {
            rec.loaded = rec.total;
            recompute();
          }
        });

    // sprite + menu.mp3 就绪 → bgm.init（注册 menu）+ menuBgmReady=true
    void Promise.all([spriteDone, menuBgmPromise]).then(() => {
      blockingFiles.forEach((f) => {
        f.loaded = f.total;
      });
      recompute();
      bgm.init(this.game); // 此时 cache 里只有 menu；battle 后到时再 registerSound
      set({ menuBgmReady: true });
    });

    // --- battle.mp3: 后台加载，不阻塞进入游戏 ---
    // wx 端同样跳过（fetch 不支持），等 audio.wx.ts 实装
    if (IS_WX) {
      set({ battleBgmReady: true });
    } else {
      loadBgmWithProgress(this.game, 'battle', '/assets/bgm/battle.mp3', () => {
        // 不影响 splash 进度条，静默下
      })
        .then(() => {
          // cache 里新 push 了 battle，注册成 Phaser Sound 供 GameScene 播
          bgm.registerSound('battle');
          set({ battleBgmReady: true });
        })
        .catch((err) => {
          console.error('[bgm-loader] battle', err);
          set({ battleBgmReady: true }); // 失败也标位，避免外部观察者死等
        });
    }

    // SFX 独立走自建 AudioContext（与上面两条并行）
    const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | null> =>
      Promise.race([p, new Promise<null>((res) => setTimeout(() => res(null), ms))]);
    void sfx
      .preload((loaded, total) => {
        set({ sfxProgress: total > 0 ? loaded / total : 1 });
      })
      .finally(() => set({ sfxProgress: 1 }));
    void withTimeout(sfx.preload(), 5000).then(() => set({ sfxProgress: 1 }));

    // 8s 兜底：menu.mp3 若真卡死，splash 也不永远卡住
    setTimeout(() => set({ menuBgmReady: true }), 8000);

    // 启动 Phaser sprite loader（preload 阶段已过，必须手动 start）
    this.load.start();
  }

  private layout(W: number, H: number): void {
    // 背景层 viewport
    this.bg.setViewport(W, H);

    // 标题字号自适应（letterbox 480 后 cssW 永远 < 500，调大基础档让主标题足够 hero）
    const cssW = W / DPR;
    const titleSize = cssW < 500 ? 32 : cssW < 800 ? 36 : 44;
    this.title.setFontSize(`${px(titleSize)}px`);

    // 中心叙事垂直堆叠：title → cell → subtitle → ECG → status → progress → enter btn
    // 整体居中，底部留按钮空间
    // wx 端 SAFE_TOP/BOTTOM 兜住胶囊+灵动岛+home indicator；H5 端为 0，行为不变
    const titleCellGap = px(SPACING.xxl);
    const cellRadius = px(SPACING.xl + SPACING.md + SPACING.xs + 2); // = px(54)：细胞 sprite 半径，非 SPACING 整倍
    const cellSubtitleGap = px(SPACING.sm); // = px(8)：副标紧贴细胞底部，让顶部群组更紧凑
    const groupH =
      this.title.height + titleCellGap + cellRadius * 2 + cellSubtitleGap + this.subtitle.height;
    this.title.x = (W - this.title.width) / 2;
    // 可见高度去掉顶部 / 底部 safe area，再在其内居中并保留原本 -60 的视觉偏置
    const visibleH = H - SAFE_TOP - SAFE_BOTTOM;
    // 视觉偏置 px(60) = xl(32) + lg(24) + xs(4)，让标题群组上移避免太居中
    this.title.y = Math.round(SAFE_TOP + (visibleH - groupH) / 2 - px(SPACING.xl + SPACING.lg + SPACING.xs));

    // 生成 / 更新斜光带（叠在 title 上方，atom 内部走 cache）
    if (!this.titleShine)
      this.titleShine = new TitleShine(this, this.title, 'splash-title-shine');
    this.titleShine.update(titleSize);

    const cellCx = W / 2;
    const cellCy = this.title.y + this.title.height + titleCellGap + cellRadius;
    this.cellSprite.setPosition(cellCx, cellCy);
    this.cellSprite.setDisplaySize(cellRadius * 2, cellRadius * 2);

    this.subtitle.x = (W - this.subtitle.width) / 2;
    this.subtitle.y = cellCy + cellRadius + cellSubtitleGap;

    // ECG 紧贴副标题下方
    this.drawEcg(W, this.subtitle.y + this.subtitle.height + px(SPACING.lg + SPACING.xs)); // gap = px(28)

    // 状态文字：ECG 下方
    this.statusText.x = (W - this.statusText.width) / 2;
    // gap = px(58) = xl(32) + lg(24) + 2，状态字距副标 58 CSS px
    this.statusText.y = this.subtitle.y + this.subtitle.height + px(SPACING.xl + SPACING.lg + 2);

    // 进度条：状态字下方（细圆角条 + glow）
    const barW = Math.min(px(220), W * 0.55); /* 非 SPACING：进度条 max 宽度 220 是视觉调校值 */
    const barX = (W - barW) / 2;
    const barY = this.statusText.y + this.statusText.height + px(SPACING.sm + SPACING.xs + 2); // gap = px(14)
    this.redrawProgressBar(barW, barX, barY);
    this.progressLabel.x = (W - this.progressLabel.width) / 2;
    this.progressLabel.y = barY + px(SPACING.sm + 2); // gap = px(10)

    // 按钮顶部贴在 barY（进度条所在的 y），让 statusText 与按钮间留 px(14) gap
    if (this.enterBtn) this.enterBtn.setPosition(W / 2, barY + this.enterBtnH / 2);
  }

  private redrawProgressBar(barW: number, barX: number, barY: number): void {
    const h = px(2);
    this.progressBg
      .clear()
      .fillStyle(PRIMARY_HEX, 0.12)
      .fillRoundedRect(barX, barY, barW, h, h / 2);
    this.redrawProgressFill(barW, barX, barY);
  }

  /** 心电图波形线 — 横向铺开，正常 sin 波 + 几个 QRS 尖峰，每帧 update 推动相位 */
  private drawEcg(W: number, y: number): void {
    this.ecgGfx.clear();
    this.ecgGfx.lineStyle(px(1.2), PRIMARY_HEX, 0.55);
    // ECG 横向左右留白 = px(60)
    const left = px(SPACING.xl + SPACING.lg + SPACING.xs);
    const right = W - px(SPACING.xl + SPACING.lg + SPACING.xs);
    const span = right - left;
    const samples = 200;
    let started = false;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const x = left + t * span;
      // 在每个周期 (0.25 step) 内插一个 QRS 尖峰
      const cycle = (t * 4 + this.ecgPhase) % 1;
      let dy = 0;
      if (cycle < 0.05)
        dy = -px(2); // P 波
      else if (cycle < 0.07)
        dy = -px(8); // Q
      else if (cycle < 0.09)
        dy = px(20); // R 尖峰
      else if (cycle < 0.11)
        dy = -px(10); // S
      else if (cycle < 0.18)
        dy = px(2); // T 波
      else dy = Math.sin(cycle * Math.PI * 6) * px(1); // 平基线 + 极小波动
      const py = y + dy;
      if (!started) {
        this.ecgGfx.beginPath();
        this.ecgGfx.moveTo(x, py);
        started = true;
      } else {
        this.ecgGfx.lineTo(x, py);
      }
    }
    this.ecgGfx.strokePath();
    // unused warning 兜底
    void ACCENT_HEX;
  }

  private redrawProgressFill(barW: number, barX: number, barY: number): void {
    const h = px(2);
    this.progressFill.clear();
    if (this.displayedProgress <= 0) return;
    this.progressFill
      .fillStyle(PRIMARY_HEX, 1)
      .fillRoundedRect(barX, barY, barW * this.displayedProgress, h, h / 2);
  }

  override update(_t: number, dt: number): void {
    const W = this.scale.width;
    const H = this.scale.height;

    // 细胞旋转 + 呼吸 + 外发光环跟着脉动
    this.cellRotation += 0.0006 * dt;
    this.cellSprite.rotation = this.cellRotation;
    const breathe = 1 + Math.sin(this.cellRotation * 4) * 0.05;
    const cellRadius = px(SPACING.xl + SPACING.md + SPACING.xs + 2); // = px(54)：与 layout() 同步
    this.cellSprite.setDisplaySize(cellRadius * 2 * breathe, cellRadius * 2 * breathe);
    this.drawCellGlow(this.cellSprite.x, this.cellSprite.y, cellRadius * breathe);

    // 心电图推进
    this.ecgPhase = (this.ecgPhase + 0.0015 * dt) % 1;
    this.drawEcg(W, this.subtitle.y + this.subtitle.height + px(SPACING.lg + SPACING.xs)); // gap = px(28)

    // 粒子漂浮
    this.bg.tick(dt, W, H);

    // 进度
    const target = aggregateProgress(useLoadStore.getState());
    this.displayedProgress += (target - this.displayedProgress) * Math.min(1, dt / 200);
    if (Math.abs(target - this.displayedProgress) < 0.005) this.displayedProgress = target;

    const pct = Math.round(this.displayedProgress * 100);
    this.progressLabel.text = `${pct}%`;
    const barW = Math.min(px(220), W * 0.55); /* 非 SPACING：进度条 max 宽度 220 是视觉调校值 */
    const barX = (W - barW) / 2;
    const barY = this.statusText.y + this.statusText.height + px(SPACING.sm + SPACING.xs + 2); // gap = px(14)
    this.redrawProgressFill(barW, barX, barY);
    this.progressLabel.x = (W - this.progressLabel.width) / 2;

    const ready =
      isAllReady(useLoadStore.getState()) && performance.now() - this.startedAt >= MIN_DURATION_MS;
    if (ready && !this.enterBtn) {
      this.statusText.text = '生 命 体 征 · 稳 定';
      this.statusText.setColor(PRIMARY);
      this.showEnterBtn();
      this.progressBg.setVisible(false);
      this.progressFill.setVisible(false);
      this.progressLabel.setVisible(false);
    }
  }

  /** 中央细胞外的呼吸光晕（多层 fillCircle 由外向内 alpha 递增）。
   * layers 5→3、外扩 0.35→0.25：窄 buffer 下细胞占比大，5 层叠加显糊。 */
  private drawCellGlow(cx: number, cy: number, r: number): void {
    this.cellGlow.clear();
    const layers = 3;
    for (let i = layers; i >= 1; i--) {
      const radius = r * (1 + i * 0.25);
      const alpha = (0.035 * (layers - i + 1)) / layers;
      this.cellGlow.fillStyle(PRIMARY_HEX, alpha).fillCircle(cx, cy, radius);
    }
  }

  private showEnterBtn(): void {
    const W = this.scale.width;
    // 缩小版 V7 配方：180×52 CSS px（splash 入口比 hub 更紧凑）
    const w = px(180);
    const h = px(52);
    this.enterBtnH = h;
    // 主标「进入游戏」深绿 bold，字号缩到 16 跟按钮高度匹配
    const label = this.add
      .text(0, 0, '进 入 游 戏', {
        fontFamily: FONT,
        fontSize: `${px(16)}px`,
        fontStyle: 'bold',
        color: COLOR.immuneDeep,
      })
      .setOrigin(0.5)
      .setPadding(px(SPACING.sm + SPACING.xs), px(SPACING.sm))
      .setStroke(COLOR.immuneDeep, px(0.4))
      .setShadow(0, px(1), COLOR.immuneDeep, 0, false, true)
      .setLetterSpacing(px(16 * 0.18))
      .setResolution(DPR);
    label.setPosition(0, Math.round(px(1)));
    // bgUnder + bgOver 双 graphics + macrophage svg 剪影底纹
    const bgUnder = this.add.graphics();
    const bgOver = this.add.graphics();
    const silhouetteKey = TEX.tower('macrophage', 1);
    const silhouette = this.textures.exists(silhouetteKey)
      ? this.add
          .image(0, px(2), silhouetteKey)
          .setOrigin(0.5)
          .setDisplaySize(h * 0.92, h * 0.92)
          .setTint(HEX.immuneDeep)
          .setAlpha(0.16)
      : null;
    this.enterBtnBgUnder = bgUnder;
    this.enterBtnBgOver = bgOver;
    this.enterBtnSilhouette = silhouette;
    this.redrawEnterBtnBg(w, h, false);
    // 子节点顺序：bgUnder → silhouette → bgOver → label（保 L 角等装饰盖在剪影上）
    const children: GameObjects.GameObject[] = [bgUnder];
    if (silhouette) children.push(silhouette);
    children.push(bgOver, label);
    // 按钮顶部贴在进度条所在的 y（barY），statusText 底距按钮顶 = px(14) 留白
    const barY = this.statusText.y + this.statusText.height + px(SPACING.sm + SPACING.xs + 2);
    const container = this.add.container(W / 2, barY + h / 2, children);
    container.setSize(w, h);
    setRectInteractive(container, w, h, { useHandCursor: true });
    // user gesture 内同步触发 sfx 解锁 + Phaser sound BGM 播放
    container.on('pointerdown', () => {
      // 音频解锁/播放在某些 mobile 浏览器可能抛错（autoplay 限制 / WebAudio context 失败），
      // 用 try/catch 隔离不阻塞主流程
      try {
        sfx.ensure();
      } catch (err) {
        console.warn('[SplashScene] sfx.ensure failed', err);
      }
      try {
        bgm.play('menu');
      } catch (err) {
        console.warn('[SplashScene] bgm.play failed', err);
      }
      // H5 强制登录：未登录时弹 modal，登录成功后再进 MainMenu；wx 端 BootScene 已自动登录
      const isWx = import.meta.env.VITE_PLATFORM === 'wx';
      if (!isWx && !shellIsAuthenticated()) {
        useUiStore
          .getState()
          .openLoginModal(() => transitionToScene(this, 'MainMenuScene'));
        return;
      }
      transitionToScene(this, 'MainMenuScene');
    });
    container.on('pointerover', () => this.redrawEnterBtnBg(w, h, true));
    container.on('pointerout', () => this.redrawEnterBtnBg(w, h, false));
    this.enterBtn = container;
  }

  /** V7 三角洲风配方：mint fill + glow + 剪影 + 顶白叠层 + L 角 + dash + 外描边 */
  private redrawEnterBtnBg(w: number, h: number, hover: boolean): void {
    const bgUnder = this.enterBtnBgUnder;
    const bgOver = this.enterBtnBgOver;
    if (!bgUnder || !bgOver) return;
    bgUnder.clear();
    bgOver.clear();
    const c = PRIMARY_HEX;
    // 外发光（最底）
    const boost = hover ? 1.5 : 1;
    for (let i = 3; i >= 1; i--) {
      const e = px(2 + i * 3);
      bgUnder
        .fillStyle(c, 0.06 * boost * (4 - i) * 0.33)
        .fillRect(-w / 2 - e, -h / 2 - e, w + e * 2, h + e * 2);
    }
    // 主体：实心 mint
    bgUnder.fillStyle(c, 1).fillRect(-w / 2, -h / 2, w, h);
    // 剪影 alpha 跟 hover 切换
    if (this.enterBtnSilhouette) this.enterBtnSilhouette.setAlpha(hover ? 0.22 : 0.16);
    // 顶部 ~40% 白色叠层（柔和高光）
    bgOver.fillStyle(0xffffff, 0.1).fillRect(-w / 2, -h / 2, w, h * 0.4);
    // 4 内 L 角 bracket（深绿，比字色更浅）
    const inset = px(SPACING.sm);
    const cornerLen = px(8);
    const x = -w / 2 + inset;
    const y = -h / 2 + inset;
    const ex = w / 2 - inset;
    const ey = h / 2 - inset;
    bgOver.lineStyle(px(1), HEX.immuneDeep, hover ? 0.45 : 0.3);
    bgOver.lineBetween(x, y, x + cornerLen, y);
    bgOver.lineBetween(x, y, x, y + cornerLen);
    bgOver.lineBetween(ex - cornerLen, y, ex, y);
    bgOver.lineBetween(ex, y, ex, y + cornerLen);
    bgOver.lineBetween(x, ey - cornerLen, x, ey);
    bgOver.lineBetween(x, ey, x + cornerLen, ey);
    bgOver.lineBetween(ex - cornerLen, ey, ex, ey);
    bgOver.lineBetween(ex, ey - cornerLen, ex, ey);
    // 顶部装饰 dash 线
    bgOver.lineStyle(px(1), HEX.immuneDeep, 0.14);
    bgOver.lineBetween(x + cornerLen + px(2), y + px(2), x + (ex - x) * 0.55, y + px(2));
    // 底部右侧短 dash
    bgOver.lineBetween(ex - cornerLen - px(20), ey - px(2), ex - cornerLen - px(2), ey - px(2));
    // 外描边（最浅）
    bgOver.lineStyle(px(1), HEX.immuneDeep, 0.1).strokeRect(-w / 2, -h / 2, w, h);
  }
}
