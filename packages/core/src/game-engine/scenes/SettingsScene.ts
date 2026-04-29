import { type GameObjects, type Geom, type Input, Scene } from 'phaser';
import { bgm } from '@audio/bgm';
import { sfx } from '@audio/sfx';
import { useMetaStore } from '@ui/store';
import { setRectInteractive } from '../interactive';
import { SPACING } from '../layout/spacing';
import { SAFE_TOP } from '../safe-area';
import { SceneBackground } from '../scene-bg';
import { fadeInOnEnter, transitionToScene } from '../scene-fx';
import { onSceneResize } from '../scene-resize';
import { COLOR, FONT, HEX, px } from '../style';
import { drawCyberFrame } from '../ui/atoms/cyber-frame';
import { SceneHeader } from '../ui/scene-header';

const CARD_W = 420;

interface SliderRow {
  container: GameObjects.Container;
  track: GameObjects.Graphics;
  fill: GameObjects.Graphics;
  thumb: GameObjects.Graphics;
  pctText: GameObjects.Text;
  hitRect: Geom.Rectangle;
  width: number;
  value: number;
  disabled: boolean;
}

/**
 * 设置屏幕。复刻 React 版 Settings：顶栏（返回 + 标题）+ 中央卡片（AUDIO 模块）。
 * 卡片内：SFX 滑动条 + BGM 滑动条 + MUTE 开关，全部读写 metaStore.settings。
 */
export interface SettingsSceneData {
  /** 返回来源 scene key。非空时返回按钮 resume 该 scene 并 stop 自己；否则走 MainMenu */
  returnTo?: string;
}

export class SettingsScene extends Scene {
  private bg!: SceneBackground;
  private header!: SceneHeader;
  private cardBg!: GameObjects.Graphics; // 音频卡片
  private cardContainer!: GameObjects.Container;
  private returnTo: string | null = null;
  private sfxRow!: SliderRow;
  private bgmRow!: SliderRow;
  private muteBtn!: {
    container: GameObjects.Container;
    bg: GameObjects.Graphics;
    label: GameObjects.Text;
    w: number;
    h: number;
    hitRect: Geom.Rectangle;
  };
  private divider!: GameObjects.Graphics;
  private audioHeaderHairline!: GameObjects.Graphics;
  private audioLabel!: GameObjects.Text;
  private audioTitle!: GameObjects.Text;
  private muteLabel!: GameObjects.Text;
  private muteSub!: GameObjects.Text;

  constructor() {
    super('SettingsScene');
  }

  init(data?: SettingsSceneData): void {
    this.returnTo = data?.returnTo ?? null;
  }

  create(): void {
    // 叠在游戏上（returnTo 非空）时不切菜单 BGM，避免打断战斗音乐
    if (!this.returnTo) bgm.play('menu');
    this.bg = new SceneBackground(this);
    fadeInOnEnter(this);

    const { width, height } = this.scale;
    this.buildUI(width, height);
    this.layout(width, height);
    onSceneResize(this, (w, h) => this.layout(w, h));
  }

  override update(_t: number, dt: number): void {
    this.bg.tick(dt, this.scale.width, this.scale.height);
  }

  private buildUI(_W: number, H: number): void {
    // 顶栏：走 SceneHeader 默认款（12px 无 glow），跟 LevelSelect / Encyclopedia 统一
    this.header = new SceneHeader(this, {
      title: '设置',
      backOnTap: () => {
        if (this.returnTo) {
          this.scene.stop();
          this.scene.resume(this.returnTo);
        } else {
          transitionToScene(this, 'MainMenuScene');
        }
      },
    });

    // 卡片
    this.cardBg = this.add.graphics();
    // Section header：AUDIO kicker + 音 频 主标题（水平拼接）
    this.audioLabel = this.add
      .text(0, 0, 'AUDIO', {
        fontFamily: FONT,
        fontSize: `${px(10)}px`,
        color: COLOR.dim,
      })
      .setLetterSpacing(px(10 * 0.4))
      .setOrigin(0, 1)
      .setName('audio-tag');
    this.audioTitle = this.add
      .text(0, 0, '音 频', {
        fontFamily: FONT,
        fontSize: `${px(16)}px`,
        fontStyle: 'bold',
        color: COLOR.primary,
      })
      .setLetterSpacing(px(16 * 0.22))
      .setOrigin(0, 1)
      .setName('audio-title');
    // Section header 下方的 hairline（和大 header 同款虚线 + 中央小菱形）
    this.audioHeaderHairline = this.add.graphics();

    const settings = useMetaStore.getState().settings;

    this.sfxRow = this.makeSlider(
      '音效',
      '操作 / 战斗反馈',
      settings.sfxVolume,
      settings.muted,
      (v) => {
        useMetaStore.getState().updateSettings({ sfxVolume: v });
        sfx.setVolume(v);
      },
    );
    this.bgmRow = this.makeSlider(
      '背景音乐',
      '关卡氛围',
      settings.bgmVolume,
      settings.muted,
      (v) => {
        useMetaStore.getState().updateSettings({ bgmVolume: v });
        bgm.setVolume(v);
      },
    );

    // 分割线
    this.divider = this.add.graphics();

    // 静音行
    this.muteLabel = this.add
      .text(0, 0, '静音', {
        fontFamily: FONT,
        fontSize: `${px(11)}px`,
        color: COLOR.primary,
      })
      .setLetterSpacing(px(11 * 0.2))
      .setOrigin(0, 0);
    this.muteSub = this.add
      .text(0, 0, '全局关闭音频', {
        fontFamily: FONT,
        fontSize: `${px(9)}px`,
        color: COLOR.dim,
      })
      .setLetterSpacing(px(9 * 0.2))
      .setOrigin(0, 0);
    this.muteBtn = this.makeMuteBtn(settings.muted);

    this.cardContainer = this.add.container(0, 0, [
      this.cardBg,
      this.audioLabel,
      this.audioTitle,
      this.audioHeaderHairline,
      this.sfxRow.container,
      this.bgmRow.container,
      this.divider,
      this.muteLabel,
      this.muteSub,
      this.muteBtn.container,
    ]);

    // 顶部返回按钮 setName 后取出再放容器外
    void H;
  }

  private makeSlider(
    label: string,
    sublabel: string,
    initialValue: number,
    disabled: boolean,
    onChange: (v: number) => void,
  ): SliderRow {
    const labelText = this.add
      .text(0, 0, label, {
        fontFamily: FONT,
        fontSize: `${px(11)}px`,
        color: COLOR.primary,
      })
      .setLetterSpacing(px(11 * 0.2))
      .setOrigin(0, 0);
    const subText = this.add
      .text(0, 0, sublabel, {
        fontFamily: FONT,
        fontSize: `${px(9)}px`,
        color: COLOR.dim,
      })
      .setLetterSpacing(px(9 * 0.2))
      .setOrigin(0, 0);
    const pctText = this.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: `${px(11)}px`,
        color: disabled ? COLOR.dim : COLOR.primary,
      })
      .setLetterSpacing(px(11 * 0.1))
      .setOrigin(1, 0);

    const track = this.add.graphics();
    const fill = this.add.graphics();
    const thumb = this.add.graphics();

    // 用一个 rect container 接收拖拽
    const sliderHit = this.add.container(0, 0);
    /* 非 SPACING：slider 默认宽 360 视觉调校值 */
    sliderHit.setSize(px(360), px(SPACING.md + SPACING.xs));
    const hitRect = setRectInteractive(sliderHit, px(360), px(SPACING.md + SPACING.xs), {
      useHandCursor: !disabled,
      bgAlign: 'topLeft',
    });

    const row: SliderRow = {
      container: this.add.container(0, 0, [
        labelText,
        subText,
        pctText,
        track,
        fill,
        thumb,
        sliderHit,
      ]),
      track,
      fill,
      thumb,
      pctText,
      hitRect,
      width: px(360) /* 非 SPACING：slider 默认宽 360 视觉调校值 */,
      value: initialValue,
      disabled,
    };

    const setFromX = (x: number) => {
      if (row.disabled) return;
      const v = Math.max(0, Math.min(1, x / row.width));
      row.value = v;
      onChange(v);
      this.redrawSlider(row);
    };

    sliderHit.on('pointerdown', (p: Input.Pointer) => {
      const localX = p.x - sliderHit.x - row.container.x;
      setFromX(localX);
    });
    let dragging = false;
    sliderHit.on('pointerdown', () => {
      dragging = true;
    });
    this.input.on('pointermove', (p: Input.Pointer) => {
      if (!dragging) return;
      const localX = p.x - sliderHit.x - row.container.x;
      setFromX(localX);
    });
    this.input.on('pointerup', () => {
      dragging = false;
    });

    return row;
  }

  private redrawSlider(row: SliderRow): void {
    row.track.clear();
    row.fill.clear();
    row.thumb.clear();
    const w = row.width;
    const h = px(3);
    const trackY = px(9);
    const cy = trackY + h / 2;
    const disabled = row.disabled;
    const color = disabled ? HEX.disabled : HEX.primary;
    // 轨道：primary 低透明 + 两端小端盖（像仪表进度条端点）
    row.track
      .fillStyle(HEX.primary, disabled ? 0.08 : 0.18)
      .fillRect(0, trackY, w, h)
      // 端盖
      .fillStyle(HEX.primary, disabled ? 0.2 : 0.55)
      .fillRect(0, trackY - px(2), px(1), h + px(4))
      .fillRect(w - px(1), trackY - px(2), px(1), h + px(4));
    // 填充部分：主色实心
    if (!disabled) {
      row.fill
        .fillStyle(HEX.primary, 1)
        .fillRect(0, trackY, w * row.value, h)
        // 填充顶部加一条极亮 hairline（"电流"感）
        .fillStyle(HEX.white, 0.35)
        .fillRect(0, trackY, w * row.value, px(1));
    }
    // Thumb：outer ring glow + core
    const thumbX = w * row.value;
    row.thumb
      // 外层 glow（2 倍半径，低 alpha）
      .fillStyle(color, disabled ? 0.15 : 0.3)
      .fillCircle(thumbX, cy, px(11))
      // 中层环
      .fillStyle(color, disabled ? 0.4 : 0.8)
      .fillCircle(thumbX, cy, px(7))
      // 核心
      .fillStyle(disabled ? HEX.disabledBg : HEX.white, 1)
      .fillCircle(thumbX, cy, px(3));
    const pct = Math.round(row.value * 100);
    row.pctText.text = disabled ? '--' : `${pct}%`;
    row.pctText.setColor(disabled ? COLOR.dim : COLOR.primary);
  }

  private makeMuteBtn(muted: boolean): {
    container: GameObjects.Container;
    bg: GameObjects.Graphics;
    label: GameObjects.Text;
    w: number;
    h: number;
    hitRect: Geom.Rectangle;
  } {
    // 与返回按钮 / 重看按钮统一尺寸 88×32
    const w = px(SPACING.xxl + SPACING.xl + SPACING.sm); // = px(88)
    const h = px(SPACING.xl);
    const bg = this.add.graphics();
    const label = this.add
      .text(w / 2, h / 2, muted ? '已静音' : '开启', {
        fontFamily: FONT,
        fontSize: `${px(11)}px`,
      })
      .setLetterSpacing(px(11 * 0.25))
      .setOrigin(0.5);
    const container = this.add.container(0, 0, [bg, label]);
    container.setSize(w, h);
    const hitRect = setRectInteractive(container, w, h, {
      useHandCursor: true,
      bgAlign: 'topLeft',
    });
    const btn = { container, bg, label, w, h, hitRect };
    container.on('pointerdown', () => {
      sfx.uiClick();
      const cur = useMetaStore.getState().settings.muted;
      const next = !cur;
      useMetaStore.getState().updateSettings({ muted: next });
      bgm.setMuted(next);
      sfx.setMuted(next);
      this.refreshFromStore();
    });
    this.redrawMute(btn, muted);
    return btn;
  }

  private redrawMute(
    btn: {
      bg: GameObjects.Graphics;
      label: GameObjects.Text;
      w: number;
      h: number;
    },
    muted: boolean,
  ): void {
    btn.bg.clear();
    if (muted) {
      btn.bg
        .fillStyle(HEX.danger, 0.12)
        .fillRect(0, 0, btn.w, btn.h)
        .lineStyle(px(1), HEX.danger, 1)
        .strokeRect(0, 0, btn.w, btn.h);
      btn.label.setColor(COLOR.danger).text = '已静音';
    } else {
      btn.bg
        .fillStyle(HEX.primary, 0.08)
        .fillRect(0, 0, btn.w, btn.h)
        .lineStyle(px(1), HEX.primary, 0.5)
        .strokeRect(0, 0, btn.w, btn.h);
      btn.label.setColor(COLOR.primary).text = '开启';
    }
  }

  /**
   * Cyber HUD 风格卡片：半透明 bg + 细边框 + 4 个 L 型角装饰。
   * 与登录 modal 卡片统一：粗 L 角（2px / alpha 0.95）+ 细四边描边（alpha 0.35），
   * 不加左侧光带，避免两处视觉风格分裂。
   */
  private drawCyberCard(g: GameObjects.Graphics, w: number, h: number): void {
    g.clear()
      .fillStyle(HEX.bg, 0.7)
      .fillRect(0, 0, w, h)
      .lineStyle(px(1), HEX.primary, 0.35)
      .strokeRect(0, 0, w, h);
    // L 角装饰统一走 atom（design-system §5.1 thick variant）
    drawCyberFrame(g, 0, 0, w, h, { variant: 'thick' });
  }

  /** 虚线分隔：若干短线段沿直线铺开 */
  private drawDashedLine(
    g: GameObjects.Graphics,
    x1: number,
    y: number,
    x2: number,
    dashLen = 6,
    gapLen = 4,
    color: number = HEX.primary,
    alpha = 0.35,
  ): void {
    g.lineStyle(px(1), color, alpha);
    const dx = px(dashLen);
    const gx = px(gapLen);
    let cx = x1;
    while (cx < x2) {
      const end = Math.min(cx + dx, x2);
      g.lineBetween(cx, y, end, y);
      cx = end + gx;
    }
  }

  private refreshFromStore(): void {
    const s = useMetaStore.getState().settings;
    this.sfxRow.value = s.sfxVolume;
    this.sfxRow.disabled = s.muted;
    this.bgmRow.value = s.bgmVolume;
    this.bgmRow.disabled = s.muted;
    this.redrawSlider(this.sfxRow);
    this.redrawSlider(this.bgmRow);
    this.redrawMute(this.muteBtn, s.muted);
  }

  private layout(W: number, H: number): void {
    this.bg.setViewport(W, H);
    // 顶栏：SceneHeader 自己定位 back btn + 大标题 + 次标 + hairline
    // wx 端 SAFE_TOP 兜住胶囊 + 状态栏；H5 端 SAFE_TOP=0
    this.header.layout(W, SAFE_TOP);

    // 卡片：min(420, 94vw) × 自适应，居中
    const cardW = Math.min(px(CARD_W), W * 0.94);
    const padX = px(SPACING.lg + SPACING.xs); // = px(28)
    const padTop = px(SPACING.lg + 2); // = px(26)
    const padBottom = px(SPACING.lg);

    // ==== 卡片 1：音频 ====
    // Header: AUDIO kicker + 音 频 大字 baseline 对齐（origin 0,1）
    const headerBaselineY = padTop + this.audioTitle.height;
    const headerHairlineY = headerBaselineY + px(SPACING.sm + SPACING.xs + 2); // = px(14)
    // 每行的组合高度（主 label + sub + slider）
    const rowLabelH = px(SPACING.sm + SPACING.xs); // label 大概高 = px(12)
    const subGap = px(2); /* 紧密堆叠 px(2)：label 与 sub 间距 */
    const rowSubH = px(SPACING.sm + SPACING.xs - 1); // sub 大概高 = px(11)
    const sliderGap = px(SPACING.sm + SPACING.xs + 2); // = px(14)
    const sliderH = px(SPACING.md + SPACING.xs); // = px(20)
    const rowH = rowLabelH + subGap + rowSubH + sliderGap + sliderH;

    const sfxRowY = headerHairlineY + px(SPACING.md + SPACING.xs + 2); // = px(22)
    const bgmRowY = sfxRowY + rowH + px(SPACING.sm + SPACING.xs + 2); // = px(14)
    const dividerY = bgmRowY + rowH + px(SPACING.sm + SPACING.xs + 2); // = px(14)
    // MUTE 行：label 主 + sub 下（比 slider 行矮）
    const muteLabelH = px(SPACING.sm + SPACING.xs + 1); // = px(13)
    const muteSubH = px(SPACING.sm + SPACING.xs - 1); // = px(11)
    const muteRowContentH = muteLabelH + subGap + muteSubH;
    const muteRowY = dividerY + px(SPACING.md + 2); // = px(18)
    const cardH = muteRowY + muteRowContentH + padBottom;

    const cardX = Math.round((W - cardW) / 2);
    const cardY = SAFE_TOP + px(SPACING.xxl + SPACING.xxl + SPACING.lg + SPACING.xs); // = px(124) 留出 header 空间

    // 重画卡片
    this.drawCyberCard(this.cardBg, cardW, cardH);
    this.cardContainer.setPosition(cardX, cardY);

    // ---- 音频 Section header ----
    this.audioTitle.setPosition(padX, headerBaselineY);
    this.audioLabel.setPosition(
      padX + this.audioTitle.width + px(SPACING.sm + 2), // gap = px(10)
      headerBaselineY - px(2), // kicker 稍向上吊（紧密堆叠 px(2)）
    );
    // Section hairline：短款（左起 padX，延伸到 80% cardW）+ 终点加装饰小块
    this.audioHeaderHairline.clear();
    this.drawDashedLine(
      this.audioHeaderHairline,
      padX,
      headerHairlineY,
      cardW * 0.78,
      5,
      3,
      HEX.primary,
      0.5,
    );
    this.audioHeaderHairline
      .fillStyle(HEX.primary, 0.65)
      // hairline 末端装饰小块：5×5 紧凑视觉，非 SPACING 阶梯
      .fillRect(cardW * 0.78 + px(SPACING.xs), headerHairlineY - px(2), px(5), px(5));

    // ---- Slider 行 ----
    const sliderW = cardW - padX * 2;
    this.sfxRow.width = sliderW;
    this.bgmRow.width = sliderW;
    this.sfxRow.hitRect.setTo(
      sliderW / 2,
      px(SPACING.sm + 2),
      sliderW,
      px(SPACING.md + SPACING.xs),
    ); // px(10), px(20)
    this.bgmRow.hitRect.setTo(
      sliderW / 2,
      px(SPACING.sm + 2),
      sliderW,
      px(SPACING.md + SPACING.xs),
    );
    const sfxHit = this.sfxRow.container.getAt(6) as GameObjects.Container;
    const bgmHit = this.bgmRow.container.getAt(6) as GameObjects.Container;
    if (sfxHit) sfxHit.setSize(sliderW, px(SPACING.md + SPACING.xs));
    if (bgmHit) bgmHit.setSize(sliderW, px(SPACING.md + SPACING.xs));

    const layoutSliderRow = (row: SliderRow, rowY: number, hit: GameObjects.Container | null) => {
      row.container.setPosition(padX, rowY);
      const labelObj = row.container.getAt(0) as GameObjects.Text;
      const subObj = row.container.getAt(1) as GameObjects.Text;
      // label 主：左上
      labelObj.setPosition(0, 0);
      // sub：label 下一行
      subObj.setPosition(0, labelObj.height + subGap);
      // 百分比：右上，和主 label baseline 对齐
      row.pctText.setFontSize(`${px(14)}px`);
      row.pctText.setFontStyle('bold');
      row.pctText.setPosition(sliderW, -px(2)); // 紧密堆叠 px(2)
      // slider 在文字下方
      const trackY = labelObj.height + subGap + subObj.height + sliderGap;
      if (hit) hit.setPosition(0, trackY);
      row.track.setPosition(0, trackY);
      row.fill.setPosition(0, trackY);
      row.thumb.setPosition(0, trackY);
    };
    layoutSliderRow(this.sfxRow, sfxRowY, sfxHit);
    layoutSliderRow(this.bgmRow, bgmRowY, bgmHit);
    this.redrawSlider(this.sfxRow);
    this.redrawSlider(this.bgmRow);

    // ---- 分割线 ----
    this.divider.clear();
    this.drawDashedLine(this.divider, padX, dividerY, cardW - padX);

    // ---- MUTE 行：label + sub 左竖排，按钮右中对齐 ----
    this.muteLabel.setPosition(padX, muteRowY);
    this.muteSub.setPosition(padX, muteRowY + this.muteLabel.height + subGap);
    const muteBtnY = muteRowY + (muteRowContentH - this.muteBtn.h) / 2;
    this.muteBtn.container.setPosition(cardW - padX - this.muteBtn.w, muteBtnY);

    void H;
    void cardY;
    void cardH;
  }

  destroy(): void {
    // Phaser scene cleanup is automatic
  }
}
