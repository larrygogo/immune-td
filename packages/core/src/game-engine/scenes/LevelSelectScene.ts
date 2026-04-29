import { type GameObjects, type Geom, type Input, Scene } from 'phaser';
import { trackSceneView } from '@/analytics/scene-view';
import { bgm } from '@audio/bgm';
import { sfx } from '@audio/sfx';
import { useMetaStore, useUiStore } from '@ui/store';
import { CHAPTERS, LEVELS, isLevelImplemented } from '../game/data/levels';
import { setRectInteractive } from '../interactive';
import { SPACING } from '../layout/spacing';
import { SAFE_BOTTOM, SAFE_TOP } from '../safe-area';
import { SceneBackground } from '../scene-bg';
import { fadeInOnEnter, transitionToScene } from '../scene-fx';
import { enterLevel } from './route';
import { onSceneResize } from '../scene-resize';
import { COLOR, FONT, FONT_SANS_CN, HEX, px } from '../style';
import { SceneHeader } from '../ui/scene-header';

const CARD_MIN_W = 140;
const CARD_H = 96;
const CARD_GAP = 10;

/** 章节信息条右侧 ★ icon 的 text 内部 padding，为 shadow blur(6) 留 canvas 空间。
 *  布局定位时要减掉/补偿，避免 ★ 与数字之间的视觉间距被 padding 撑开。 */
const HEADER_STAR_PAD_X = 8;
const HEADER_STAR_PAD_Y = 6;

interface ChapterTab {
  id: number;
  container: GameObjects.Container;
  bg: GameObjects.Graphics;
  topLabel: GameObjects.Text;
  titleText: GameObjects.Text;
  hitRect: Geom.Rectangle;
  w: number;
  h: number;
  unlocked: boolean;
}

interface LevelCard {
  container: GameObjects.Container;
  bg: GameObjects.Graphics;
  topLabel: GameObjects.Text;
  titleText: GameObjects.Text;
  bottomText: GameObjects.Text;
  hitRect: Geom.Rectangle;
}

/**
 * 关卡选择屏。复刻 React 版 LevelSelect：
 * 顶栏 + 章节 tab 横排 + 章节信息条 + 关卡卡片自适应网格。
 */
export class LevelSelectScene extends Scene {
  private bg!: SceneBackground;
  private header!: SceneHeader;
  private chapterTabs: ChapterTab[] = [];
  private chapterTabsLayer!: GameObjects.Container;
  private chapterMaskShape!: GameObjects.Graphics;
  private headerBg!: GameObjects.Graphics;
  private headerTitle!: GameObjects.Text;
  private headerSub!: GameObjects.Text;
  /** 章节信息条右侧「★ X / Y」：星号单独放大，数字保留小字 */
  private headerStarsIcon!: GameObjects.Text;
  private headerStarsCount!: GameObjects.Text;
  private cardLayer!: GameObjects.Container;
  private cardMaskShape!: GameObjects.Graphics;
  private selectedChapterId = 0;
  private chapterScrollX = 0;
  private cardScrollY = 0;
  private cardMaxScrollY = 0;
  private cardAreaTop = 0;
  private cardAreaBottom = 0;

  constructor() {
    super('LevelSelectScene');
  }

  /** wx 端胶囊 + 状态栏占用的顶部留白；H5 端 SAFE_TOP=0 */
  private get safeTop(): number {
    return SAFE_TOP;
  }

  create(): void {
    trackSceneView('LevelSelectScene');
    // scene 复用：每次 create 重置局部状态，避免上次的 GameObject 引用泄漏
    this.chapterTabs = [];
    this.cardScrollY = 0;
    this.cardMaxScrollY = 0;
    this.chapterScrollX = 0;

    bgm.play('menu');

    this.bg = new SceneBackground(this);
    fadeInOnEnter(this);
    // 不加 applySceneBloom：mobile 480 viewport 上 GPU box blur 把高频抹平 → 发灰
    // 不再 bg.setAlpha(0.55)：vessel/particles/links 已自带低 alpha（0.12-0.45），
    // 0.55 全局降透明只会让背景活力丧失 → 整个画面发灰

    // 章节 tab 恢复：优先用 uiStore.lastChapterId（用户上次点的），否则按进度挑
    // 第一个"含未通关关卡"的章节。保证玩家从游戏返回时仍停在原章节。
    const ui = useUiStore.getState();
    const meta = useMetaStore.getState();
    const validChapterIds = new Set<number>(CHAPTERS.map((c) => c.id));
    if (ui.lastChapterId >= 0 && validChapterIds.has(ui.lastChapterId)) {
      this.selectedChapterId = ui.lastChapterId as (typeof CHAPTERS)[number]['id'];
    } else {
      let defaultId = 0;
      outer: for (const ch of CHAPTERS) {
        for (const id of ch.levelIds) {
          if (meta.unlockedLevels.includes(id) && (meta.stars[id] ?? 0) === 0) {
            defaultId = ch.id;
            break outer;
          }
        }
      }
      this.selectedChapterId = defaultId;
    }

    const { width, height } = this.scale;
    this.buildUI();
    this.layout(width, height);
    onSceneResize(this, (w, h) => this.layout(w, h));

    // 卡片层滚轮 + 章节 tab 横向滚轮
    this.input.on('wheel', (p: Input.Pointer, _g: unknown, dx: number, dy: number) => {
      const tabsTop = this.safeTop + px(SPACING.xxl + SPACING.md); // = px(64)
      const tabsBottom = tabsTop + px(SPACING.xxl); // = px(48)
      if (p.y >= tabsTop && p.y <= tabsBottom) {
        // tab 区域：垂直滚轮（dy）也当横向滚（dx 优先）
        const delta = dx !== 0 ? dx : dy;
        this.setChapterScroll(this.chapterScrollX + delta);
        return;
      }
      if (p.y >= this.cardAreaTop && p.y <= this.cardAreaBottom) {
        this.cardScrollY = Math.max(0, Math.min(this.cardMaxScrollY, this.cardScrollY + dy));
        this.cardLayer.y = this.cardAreaTop - this.cardScrollY;
      }
    });

    // 章节 tab 横向拖拽
    let tabDrag = false;
    let tabStartX = 0;
    let tabStartScroll = 0;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const tabsTop = this.safeTop + px(SPACING.xxl + SPACING.md); // = px(64)
      const tabsBottom = tabsTop + px(SPACING.xxl); // = px(48)
      if (p.y >= tabsTop && p.y <= tabsBottom) {
        tabDrag = true;
        tabStartX = p.x;
        tabStartScroll = this.chapterScrollX;
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!tabDrag) return;
      this.setChapterScroll(tabStartScroll - (p.x - tabStartX));
    });
    this.input.on('pointerup', () => {
      tabDrag = false;
    });
  }

  private chapterMaxScrollX = 0;
  private setChapterScroll(x: number): void {
    this.chapterScrollX = Math.max(0, Math.min(this.chapterMaxScrollX, x));
    if (this.chapterTabsLayer) this.chapterTabsLayer.x = -this.chapterScrollX;
  }

  override update(_t: number, dt: number): void {
    this.bg.tick(dt, this.scale.width, this.scale.height);
  }

  private buildUI(): void {
    this.header = new SceneHeader(this, {
      title: '选择关卡',
      backOnTap: () => transitionToScene(this, 'MainMenuScene'),
      backAriaLabel: 'back-btn',
    });

    // 章节 tab：放在专门的容器里支持横向滚动
    this.chapterTabsLayer = this.add.container(0, 0);
    for (const ch of CHAPTERS) {
      this.chapterTabs.push(this.makeChapterTab(ch.id, ch.title));
    }
    for (const tab of this.chapterTabs) this.chapterTabsLayer.add(tab.container);
    this.chapterMaskShape = this.add.graphics();
    this.chapterMaskShape.setVisible(false);
    this.chapterTabsLayer.setMask(this.chapterMaskShape.createGeometryMask());

    // 章节信息条
    this.headerBg = this.add.graphics();
    this.headerTitle = this.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: `${px(13)}px`,
        color: COLOR.primary,
      })
      .setLetterSpacing(px(13 * 0.2))
      .setOrigin(0, 0);
    this.headerSub = this.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: `${px(10)}px`,
        color: COLOR.dim,
      })
      .setLetterSpacing(px(10 * 0.15))
      .setOrigin(0, 0);
    // 不同字号 Text 用 origin.y=0.5 垂直居中于同一 centerY，避免底部对齐视觉偏差
    // setPadding 为 shadow blur(6) 留 canvas 空间，否则 glow 被剪裁
    this.headerStarsIcon = this.add
      .text(0, 0, '★', {
        // ★ 固定 Noto Sans SC（打包 subset 必含），避免不同环境 mono fallback 错字体
        fontFamily: FONT_SANS_CN,
        fontSize: `${px(18)}px`,
        color: COLOR.primary,
      })
      .setOrigin(1, 0.5)
      .setPadding(px(HEADER_STAR_PAD_X), px(HEADER_STAR_PAD_Y))
      .setShadow(0, 0, COLOR.primary, px(6), false, true);
    this.headerStarsCount = this.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: `${px(11)}px`,
        color: COLOR.primary,
      })
      .setOrigin(1, 0.5)
      .setLetterSpacing(px(11 * 0.15));

    // 卡片层
    this.cardLayer = this.add.container(0, 0);
    this.cardMaskShape = this.add.graphics();
    this.cardMaskShape.setVisible(false);
    this.cardLayer.setMask(this.cardMaskShape.createGeometryMask());
  }

  private makeChapterTab(id: number, title: string): ChapterTab {
    const meta = useMetaStore.getState();
    const ch = CHAPTERS.find((c) => c.id === id);
    const unlocked = !!ch?.levelIds.some((lid) => meta.unlockedLevels.includes(lid));
    const w = px(SPACING.xxl + SPACING.lg + SPACING.sm + 2); // = px(82) tab 宽
    const h = px(SPACING.xl + SPACING.sm + SPACING.xs); // = px(44) tab 高

    const bg = this.add.graphics();
    const topLabel = this.add
      .text(0, 0, `第 ${id} 章`, {
        fontFamily: FONT,
        fontSize: `${px(8)}px`,
      })
      .setLetterSpacing(px(8 * 0.15))
      .setOrigin(0.5);
    const titleText = this.add
      .text(0, 0, title, {
        fontFamily: FONT,
        fontSize: `${px(10)}px`,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const container = this.add.container(0, 0, [bg, topLabel, titleText]);
    container.setSize(w, h);
    const hitRect = setRectInteractive(container, w, h, {
      useHandCursor: unlocked,
      bgAlign: 'topLeft',
    });
    // click vs drag：pointerdown 记录起点，pointerup 时若拖动距离 < 阈值才视为 click
    let downX = 0;
    let downY = 0;
    container.on('pointerdown', (p: Phaser.Input.Pointer) => {
      downX = p.x;
      downY = p.y;
    });
    container.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!unlocked) return;
      const dx = Math.abs(p.x - downX);
      const dy = Math.abs(p.y - downY);
      if (dx > 6 || dy > 6) return; // 视为拖动，不切换章节
      sfx.uiClick();
      this.selectedChapterId = id;
      useUiStore.getState().setLastChapterId(id);
      this.refreshTabsAndCards();
    });

    const tab: ChapterTab = {
      id,
      container,
      bg,
      topLabel,
      titleText,
      hitRect,
      w,
      h,
      unlocked,
    };
    return tab;
  }

  private redrawTab(tab: ChapterTab): void {
    const active = tab.id === this.selectedChapterId;
    const w = tab.w;
    const h = tab.h;
    tab.bg.clear();
    if (active) {
      tab.bg.fillStyle(HEX.primary, 1).fillRect(0, 0, w, h);
      tab.bg.lineStyle(px(1), HEX.primary, 0.4).strokeRect(0, 0, w, h);
      tab.topLabel.setColor(COLOR.bg).setAlpha(0.7);
      tab.titleText.setColor(COLOR.bg).setAlpha(1);
    } else if (tab.unlocked) {
      tab.bg.fillStyle(HEX.primary, 0.06).fillRect(0, 0, w, h);
      tab.bg.lineStyle(px(1), HEX.primary, 0.4).strokeRect(0, 0, w, h);
      tab.topLabel.setColor(COLOR.primary).setAlpha(0.7);
      tab.titleText.setColor(COLOR.primary).setAlpha(1);
    } else {
      tab.bg.fillStyle(HEX.white, 0.02).fillRect(0, 0, w, h);
      tab.bg.lineStyle(px(1), HEX.white, 0.1).strokeRect(0, 0, w, h);
      tab.topLabel.setColor('rgba(255,255,255,0.25)').setAlpha(1);
      tab.titleText.setColor('rgba(255,255,255,0.25)').setAlpha(1);
    }
    tab.topLabel.setPosition(w / 2, px(SPACING.sm + SPACING.xs)); // y = px(12)
    tab.titleText.setPosition(w / 2, px(SPACING.lg + SPACING.xs)); // y = px(28)
  }

  private layout(W: number, H: number): void {
    this.bg.setViewport(W, H);

    // 顶栏：header 自己定位 back btn + 标题（wx 端整体下移 SAFE_TOP 避开胶囊）
    this.header.layout(W, this.safeTop);

    // 章节 tab 行：从 padX=16 开始，y=safeTop+64
    const tabsTop = this.safeTop + px(SPACING.xxl + SPACING.md); // = px(64)
    const tabsBottom = tabsTop + px(SPACING.xxl); // = px(48)
    const padX = px(SPACING.md);
    let tx = padX;
    const tabGap = px(SPACING.xs + 2); // = px(6)
    for (const tab of this.chapterTabs) {
      tab.container.setPosition(tx, tabsTop);
      this.redrawTab(tab);
      tx += tab.w + tabGap;
    }
    // chapter mask 限制 tab 区域
    this.chapterMaskShape.clear();
    this.chapterMaskShape
      .fillStyle(HEX.white, 1)
      .fillRect(padX, tabsTop, W - padX * 2, tabsBottom - tabsTop);
    // 计算横向滚动范围
    const totalTabsW = tx - tabGap - padX;
    const innerW = W - padX * 2;
    this.chapterMaxScrollX = Math.max(0, totalTabsW - innerW);
    this.setChapterScroll(this.chapterScrollX);

    // 章节信息条
    const headerY = tabsBottom + px(SPACING.sm);
    const headerH = px(SPACING.xl + SPACING.md + SPACING.xs + 2); // = px(54)
    this.headerBg.clear();
    this.headerBg
      .fillStyle(HEX.primary, 0.08)
      .fillRect(padX, headerY, W - padX * 2, headerH)
      .lineStyle(px(1), HEX.primary, 0.35)
      .strokeRect(padX, headerY, W - padX * 2, headerH);

    const ch = CHAPTERS.find((c) => c.id === this.selectedChapterId) ?? CHAPTERS[0];
    if (ch) {
      this.headerTitle.text = ch.title;
      this.headerSub.text = ch.subtitle;
      // 内边距 14 = sm(8)+xs(4)+2；顶部 10 = sm(8)+2；行间 px(4) = xs
      this.headerTitle.setPosition(
        padX + px(SPACING.sm + SPACING.xs + 2),
        headerY + px(SPACING.sm + 2),
      );
      this.headerSub.setPosition(
        padX + px(SPACING.sm + SPACING.xs + 2),
        headerY + px(SPACING.sm + 2) + this.headerTitle.height + px(SPACING.xs),
      );

      const meta = useMetaStore.getState();
      // 教学关（isTutorial）通关不发星，不计入章节星数；纯教学章节隐藏 ★ 显示
      const scoredLevelIds = ch.levelIds.filter((id) => LEVELS[id]?.isTutorial !== true);
      const chapterStars = scoredLevelIds.reduce((s, id) => s + (meta.stars[id] ?? 0), 0);
      const maxStars = scoredLevelIds.length * 3;
      const showStars = maxStars > 0;
      this.headerStarsIcon.setVisible(showStars);
      this.headerStarsCount.setVisible(showStars);
      if (showStars) {
        // 右对齐 + 垂直居中：count 以 (1,0.5) 锚放最右，icon 以 (1,0.5) 锚贴在 count 左侧。
        // icon 有 shadow padding → position X 需要补偿 iconPadX 保持视觉间距 6px。
        this.headerStarsCount.text = `${chapterStars} / ${maxStars}`;
        const rightX = W - padX - px(SPACING.sm + SPACING.xs + 2); // = px(14)
        const centerY = headerY + headerH / 2;
        this.headerStarsCount.setPosition(rightX, centerY);
        const iconPadX = px(HEADER_STAR_PAD_X);
        this.headerStarsIcon.setPosition(
          rightX - this.headerStarsCount.width - px(SPACING.xs + 2) + iconPadX, // gap = px(6)
          centerY,
        );
      }
    }

    // 卡片区（底部留 SAFE_BOTTOM 给 home indicator）
    const cardsTop = headerY + headerH + px(SPACING.sm + SPACING.xs + 2); // = px(14)
    const cardsBottom = H - SAFE_BOTTOM - px(SPACING.sm);
    this.cardAreaTop = cardsTop;
    this.cardAreaBottom = cardsBottom;
    this.cardMaskShape.clear();
    this.cardMaskShape
      .fillStyle(HEX.white, 1)
      .fillRect(padX, cardsTop, W - padX * 2, cardsBottom - cardsTop);

    this.refreshCards(W, padX, cardsTop, cardsBottom);

    void this.chapterScrollX;
  }

  private refreshTabsAndCards(): void {
    for (const tab of this.chapterTabs) this.redrawTab(tab);
    this.layout(this.scale.width, this.scale.height);
  }

  private refreshCards(W: number, padX: number, cardsTop: number, cardsBottom: number): void {
    this.cardLayer.removeAll(true);
    const ch = CHAPTERS.find((c) => c.id === this.selectedChapterId) ?? CHAPTERS[0];
    if (!ch) return;
    const meta = useMetaStore.getState();
    const innerW = W - padX * 2;
    const cols = Math.max(1, Math.floor((innerW + px(CARD_GAP)) / (px(CARD_MIN_W) + px(CARD_GAP))));
    const cardW = (innerW - px(CARD_GAP) * (cols - 1)) / cols;
    let col = 0;
    let row = 0;
    for (const levelId of ch.levelIds) {
      const card = this.makeLevelCard(
        levelId,
        cardW,
        meta.unlockedLevels.includes(levelId),
        (meta.stars[levelId] ?? 0) as 0 | 1 | 2 | 3,
      );
      const x = padX + col * (cardW + px(CARD_GAP));
      const y = row * (px(CARD_H) + px(CARD_GAP));
      card.container.setPosition(x, y);
      this.cardLayer.add(card.container);
      col++;
      if (col >= cols) {
        col = 0;
        row++;
      }
    }
    const totalH = (row + (col === 0 ? 0 : 1)) * (px(CARD_H) + px(CARD_GAP));
    this.cardMaxScrollY = Math.max(0, totalH - (cardsBottom - cardsTop));
    this.cardScrollY = 0;
    this.cardLayer.setPosition(0, cardsTop);
  }

  private isEliteEligible(levelId: number, stars: 0 | 1 | 2 | 3): boolean {
    if (stars < 1) return false; // 未通关不解锁精英
    const cfg = LEVELS[levelId];
    if (!cfg) return false;
    if (cfg.isTutorial) return false; // 教学关无精英
    if (levelId === 11) return false; // modifier 演示关本身已 fortified，跳过
    return true;
  }

  private makeLevelCard(
    levelId: number,
    cardW: number,
    unlocked: boolean,
    stars: 0 | 1 | 2 | 3,
  ): LevelCard {
    const implemented = isLevelImplemented(levelId);
    const disabled = !unlocked || !implemented;
    const cfg = LEVELS[levelId];
    const titleStr = !unlocked ? '???' : !implemented ? '敬请期待' : (cfg?.title ?? '???');
    const stageLabel = levelId === 0 ? '序章' : `关卡 ${String(levelId).padStart(2, '0')}`;

    const w = cardW;
    const h = px(CARD_H);
    const bg = this.add.graphics();
    if (disabled) {
      bg.fillStyle(HEX.white, 0.02).fillRect(0, 0, w, h);
      bg.lineStyle(px(1), HEX.white, 0.1).strokeRect(0, 0, w, h);
    } else {
      // 复刻 React 渐变 linear-gradient(180deg, primary 0.1 → 0.02)
      // 用 4 段水平 fillRect 模拟从上到下渐变
      const segs = 12;
      for (let i = 0; i < segs; i++) {
        const t = i / (segs - 1);
        const alpha = 0.1 - 0.08 * t;
        const segH = h / segs;
        bg.fillStyle(HEX.primary, alpha).fillRect(0, i * segH, w, segH + 1);
      }
      bg.lineStyle(px(1), HEX.primary, 0.5).strokeRect(0, 0, w, h);
    }

    const topColor = disabled ? 'rgba(255,255,255,0.3)' : COLOR.primary;
    const topLabel = this.add
      // 卡片内边距 12 = sm(8) + xs(4)
      .text(px(SPACING.sm + SPACING.xs), px(SPACING.sm + SPACING.xs), stageLabel, {
        fontFamily: FONT,
        fontSize: `${px(9)}px`,
        color: topColor,
      })
      .setLetterSpacing(px(9 * 0.25))
      .setAlpha(disabled ? 1 : 0.65)
      .setOrigin(0, 0);
    const titleText = this.add
      .text(
        px(SPACING.sm + SPACING.xs),
        px(SPACING.sm + SPACING.xs) + topLabel.height + px(SPACING.xs),
        titleStr,
        {
          fontFamily: FONT,
          fontSize: `${px(13)}px`,
          color: topColor,
        },
      )
      .setLetterSpacing(px(13 * 0.12))
      .setOrigin(0, 0);

    // 教学关：不显示星星，只显示完成状态（读持久 tutorialCompleted，不读本会话 tutorialStep，
    // 因为每次 re-entry GameScene 会重置 tutorialStep=0，但 tutorialCompleted 永不回退）
    const isTutorial = cfg?.isTutorial === true;
    const tutorialDone = useMetaStore.getState().tutorialCompleted;
    let bottomStr: string;
    if (!implemented && unlocked) bottomStr = '敬请期待';
    else if (!unlocked) bottomStr = '未解锁';
    else if (isTutorial) bottomStr = tutorialDone ? '教学 · 已完成' : '教学';
    else bottomStr = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    // 星星单独放大显示；中文提示（敬请期待 / 未解锁 / 教学状态）保留小字号
    const isStarRow = implemented && unlocked && !isTutorial;
    const bottomFont = isStarRow ? 18 : 12;
    const bottomColor = isStarRow
      ? stars > 0
        ? COLOR.primary
        : COLOR.textPlaceholder
      : isTutorial && tutorialDone
        ? COLOR.primary
        : COLOR.textPlaceholder;

    const bottomText = this.add
      .text(px(SPACING.sm + SPACING.xs), h - px(SPACING.sm + SPACING.xs), bottomStr, {
        fontFamily: FONT,
        fontSize: `${px(bottomFont)}px`,
        color: bottomColor,
      })
      .setLetterSpacing(px(bottomFont * 0.1))
      .setOrigin(0, 1);
    if (!unlocked || (!implemented && unlocked)) {
      bottomText.setColor(disabled ? 'rgba(255,255,255,0.5)' : COLOR.dim).setAlpha(0.6);
    }

    const container = this.add.container(0, 0, [bg, topLabel, titleText, bottomText]);
    container.setSize(w, h);
    const hitRect = setRectInteractive(container, w, h, {
      useHandCursor: !disabled,
      bgAlign: 'topLeft',
    });
    if (!disabled) {
      container.on('pointerdown', () => {
        sfx.uiClick();
        sfx.ensure();
        useUiStore.getState().setCurrentMode('normal');
        useUiStore.getState().setCurrentLevelId(levelId);
        enterLevel(this, levelId);
      });
    }

    // 精英按钮：右下角紧凑 pill「★ N/3」。
    // 之前尝试三颗独立星横排，移动端两列卡片下挤糊（用户反馈"太挤"）。
    // 改为单 ★ icon + 数字进度，宽度从 94 降到 62，金色 pill 本身已承担"精英"语义。
    if (!disabled && this.isEliteEligible(levelId, stars)) {
      const eliteStars = (useMetaStore.getState().eliteStars[levelId] ?? 0) as 0 | 1 | 2 | 3;
      // 精英 pill 内在尺寸（保留原视觉调校值，加 SPACING 凑表达式）
      const ebW = px(SPACING.xl + SPACING.lg + SPACING.xs + 2); // = px(62)
      const ebH = px(SPACING.md + SPACING.xs + 2); // = px(22)
      const ebX = w - ebW - px(SPACING.sm + 2); // 右距 = px(10)
      const ebY = h - ebH - px(SPACING.sm + 2); // 下距 = px(10)
      const ebBg = this.add.graphics();
      ebBg.fillStyle(HEX.bg, 0.55).fillRect(ebX, ebY, ebW, ebH);
      // 边框 alpha 0.55 与卡片本体的 primary 0.5 视觉权重对齐，避免抢戏
      ebBg.lineStyle(px(1), HEX.rewardGold, 0.55).strokeRect(ebX, ebY, ebW, ebH);

      // 精英 icon（左）：金色菱形 + 中央 ★，与 LevelBriefingScene buff 卡视觉一致
      // 已得 ≥1 颗 → 实心金菱形 + 深色 ★（高对比）；0 颗 → 描边菱形 + 暗化金色 ★
      const earned = eliteStars > 0;
      const iconCx = ebX + px(SPACING.sm + SPACING.xs - 1); // = px(11)：icon 中心横偏
      const iconCy = ebY + ebH / 2;
      const iconR = px(SPACING.xs + 3); // = px(7)：icon 半径
      const iconG = this.add.graphics();
      iconG.fillStyle(HEX.rewardGold, earned ? 0.9 : 0);
      iconG.beginPath();
      iconG.moveTo(iconCx, iconCy - iconR);
      iconG.lineTo(iconCx + iconR, iconCy);
      iconG.lineTo(iconCx, iconCy + iconR);
      iconG.lineTo(iconCx - iconR, iconCy);
      iconG.closePath();
      iconG.fillPath();
      iconG.lineStyle(px(1), HEX.rewardGold, earned ? 1 : 0.65);
      iconG.strokePath();
      const starGlyph = this.add
        .text(iconCx, iconCy, '★', {
          fontFamily: FONT,
          fontSize: `${px(8)}px`,
          color: earned ? COLOR.bg : COLOR.rewardGold,
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      if (!earned) starGlyph.setAlpha(0.6);

      // 进度数字「N/3」靠右
      const progressText = this.add
        // 右内边距 = px(8) = SPACING.sm
        .text(ebX + ebW - px(SPACING.sm), ebY + ebH / 2, `${eliteStars}/3`, {
          fontFamily: FONT,
          fontSize: `${px(11)}px`,
          color: COLOR.rewardGold,
          fontStyle: 'bold',
        })
        .setLetterSpacing(px(11 * 0.1))
        .setOrigin(1, 0.5);
      container.add([ebBg, iconG, starGlyph, progressText]);

      // 用一个独立的小 zone 覆盖精英按钮区域，stopPropagation 防止触发卡片点击
      const ebZone = this.add.zone(ebX + ebW / 2, ebY + ebH / 2, ebW, ebH).setOrigin(0.5);
      ebZone.setInteractive({ useHandCursor: true });
      ebZone.on('pointerdown', (p: { event?: { stopPropagation?: () => void } }) => {
        p?.event?.stopPropagation?.();
        sfx.uiClick();
        sfx.ensure();
        useUiStore.getState().setCurrentMode('elite');
        useUiStore.getState().setCurrentLevelId(levelId);
        transitionToScene(this, 'LevelBriefingScene');
      });
      container.add(ebZone);
    }
    return { container, bg, topLabel, titleText, bottomText, hitRect };
  }
}
