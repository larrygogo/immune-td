/**
 * 战斗回放列表（dev 专用）。
 * 从 server 侧 GET /api/sessions 拉取已登录玩家的 session 摘要列表；
 * 点击一行进 GameScene replay 模式。
 *
 * 未登录时仅展示"登录后查看回放"提示和跳转登录按钮 —— server 侧 GET /api/sessions
 * 需 Bearer token。POST /api/sessions 允许匿名，所以录制依然可用；但列表/回放必须登录。
 *
 * 不注册在 prod build（init.ts 里用 import.meta.env.DEV 控制）。
 */

import { type GameObjects, type Geom, type Input, Scene } from 'phaser';
import { migrateSessionIfNeeded } from '@/dev/session-recorder';
import { getShell, shellIsAuthenticated } from '../../shell';
import { useUiStore } from '@ui/store';
import { setRectInteractive } from '../interactive';
import { SPACING } from '../layout/spacing';
import { SAFE_BOTTOM, SAFE_TOP } from '../safe-area';
import { SceneBackground } from '../scene-bg';
import { fadeInOnEnter, transitionToScene } from '../scene-fx';
import { onSceneResize } from '../scene-resize';
import { COLOR, FONT, HEX, px } from '../style';
import { PhaserButton } from '../ui/phaser-button';
import { SceneHeader } from '../ui/scene-header';

/** 列表 item（server 侧 summary row） */
interface SessionItem {
  id: string;
  level_id: number;
  seed: number;
  outcome: 'won' | 'lost' | 'aborted';
  stars: number | null;
  actions_count: number;
  wave_reached: number;
  started_at: string;
  created_at: string;
}

interface Row {
  container: GameObjects.Container;
  bg: GameObjects.Graphics;
  hitRect: Geom.Rectangle;
  sessionId: string;
  deleteBtn: GameObjects.Container;
  deleteHitRect: Geom.Rectangle;
}

/** 行宽上限（CSS px）；窄屏按视口自适应收窄 */
const ROW_MAX_W = 540;
const ROW_H = 54;
const ROW_PADDING_X = 16;

export class ReplayListScene extends Scene {
  private bg!: SceneBackground;
  private header!: SceneHeader;
  private refreshBtn!: PhaserButton;
  private loginBtn: PhaserButton | null = null;
  private hintText!: GameObjects.Text;
  private rowsContainer!: GameObjects.Container;
  private rows: Row[] = [];
  private items: SessionItem[] = [];
  private maskShape: GameObjects.Graphics | null = null;
  private scrollY = 0;
  private maxScrollY = 0;
  private contentTop = 0;
  private contentBottom = 0;

  constructor() {
    super('ReplayListScene');
  }

  create(): void {
    this.scrollY = 0;
    this.bg = new SceneBackground(this);
    fadeInOnEnter(this);

    const { width, height } = this.scale;
    this.buildUI(width, height);
    onSceneResize(this, (w, h) => this.layout(w, h));
    this.layout(width, height);
    void this.refreshList();

    // 滚轮（仅在内容区生效，避开顶栏 / 刷新按钮的 wheel）
    this.input.on('wheel', (p: Input.Pointer, _g: unknown, _dx: number, dy: number) => {
      if (p.y < this.contentTop || p.y > this.contentBottom) return;
      this.setScroll(this.scrollY + dy);
    });

    // 触摸 / 鼠标拖动
    let dragging = false;
    let startY = 0;
    let startScroll = 0;
    this.input.on('pointerdown', (p: Input.Pointer) => {
      if (p.y < this.contentTop || p.y > this.contentBottom) return;
      dragging = true;
      startY = p.y;
      startScroll = this.scrollY;
    });
    this.input.on('pointermove', (p: Input.Pointer) => {
      if (!dragging) return;
      this.setScroll(startScroll - (p.y - startY));
    });
    this.input.on('pointerup', () => {
      dragging = false;
    });
  }

  private setScroll(y: number): void {
    this.scrollY = Math.max(0, Math.min(this.maxScrollY, y));
    if (this.rowsContainer) this.rowsContainer.y = this.contentTop - this.scrollY;
  }

  override update(_t: number, dt: number): void {
    this.bg.tick(dt, this.scale.width, this.scale.height);
  }

  private buildUI(W: number, _H: number): void {
    // 顶栏：走 SceneHeader 默认款（12px 无 glow），跟 LevelSelect 统一
    this.header = new SceneHeader(this, {
      title: '战斗回放',
      backOnTap: () => transitionToScene(this, 'MainMenuScene'),
    });

    // 刷新按钮：顶栏右侧，SceneHeader 不管副按钮，scene 自己放
    this.refreshBtn = new PhaserButton(this, 0, 0, {
      label: '刷新',
      width: 72,
      height: 32,
      fontSize: 11,
      color: HEX.primary,
      letterSpacingEm: 0.18,
      origin: 'topLeft',
      onTap: () => void this.refreshList(),
      ariaLabel: 'refresh',
    });
    void W;

    // 空列表 / 未登录提示
    this.hintText = this.add
      .text(W / 2, 0, '暂无录制', {
        fontFamily: FONT,
        fontSize: `${px(13)}px`,
        color: COLOR.dim,
      })
      .setOrigin(0.5, 0)
      .setLetterSpacing(px(13 * 0.15));
    this.hintText.setVisible(false);

    // 列表容器
    this.rowsContainer = this.add.container(0, 0);
  }

  private layout(W: number, H: number): void {
    // SceneHeader 统一管返回 + 标题；返回顶栏底部 y 供下方内容定位
    // wx 端 SAFE_TOP 兜住胶囊 + 状态栏；H5 端 SAFE_TOP=0
    const headerBottomY = this.header.layout(W, SAFE_TOP);

    // 刷新按钮放右上角对应位置，跟 SceneHeader back btn 对称
    this.refreshBtn.container.setPosition(
      W - px(SPACING.md) - this.refreshBtn.widthPx,
      SAFE_TOP + px(SPACING.sm + SPACING.xs),
    );

    this.hintText.setPosition(W / 2, H / 2 - px(SPACING.lg + SPACING.xs + 2)); // = px(30)
    if (this.loginBtn) {
      this.loginBtn.container.setPosition(W / 2, H / 2 + px(SPACING.md + SPACING.xs)); // = px(20)
    }
    // 列表内容区：顶栏下方 px(20) 起，到底部 SAFE_BOTTOM 上方 px(8) 止
    this.contentTop = headerBottomY + px(SPACING.md + SPACING.xs);
    this.contentBottom = H - SAFE_BOTTOM - px(SPACING.sm);
    this.rowsContainer.setPosition(W / 2, this.contentTop);

    // mask：裁掉滚出可视区的行（首次创建后一直复用）
    if (!this.maskShape) {
      this.maskShape = this.add.graphics();
      this.maskShape.setVisible(false);
      this.rowsContainer.setMask(this.maskShape.createGeometryMask());
    }
    this.maskShape.clear();
    this.maskShape
      .fillStyle(HEX.white, 1)
      .fillRect(0, this.contentTop, W, this.contentBottom - this.contentTop);

    // 视口变化时行宽自适应 → 重绘每行 bg + text 位置
    for (const r of this.rows) this.redrawRow(r);
    this.layoutRows();
  }

  /** 当前响应式行宽（不超过屏宽减左右 padding，不超过 ROW_MAX_W 上限） */
  private computeRowW(): number {
    const W = this.scale.width;
    return Math.min(px(ROW_MAX_W), W - px(2 * ROW_PADDING_X));
  }

  private clearLoginBtn(): void {
    if (this.loginBtn) {
      this.loginBtn.container.destroy();
      this.loginBtn = null;
    }
  }

  private async refreshList(): Promise<void> {
    // 未登录：不 fetch，直接显示登录提示
    if (!shellIsAuthenticated()) {
      this.items = [];
      // 清空列表
      for (const r of this.rows) r.container.destroy();
      this.rows = [];
      this.hintText.setText('登录后可查看自己的战斗回放');
      this.hintText.setVisible(true);
      this.clearLoginBtn();
      this.loginBtn = new PhaserButton(this, 0, 0, {
        label: '前往登录',
        width: 120,
        height: 36,
        fontSize: 11,
        color: HEX.dim,
        strokeColor: HEX.accent,
        letterSpacingEm: 0.2,
        onTap: () => useUiStore.getState().openLoginModal(() => void this.refreshList()),
        ariaLabel: 'go-login',
      });
      this.layout(this.scale.width, this.scale.height);
      return;
    }
    // 已登录：清除 login 按钮
    this.clearLoginBtn();
    const apiFetch = getShell().apiFetch;
    if (!apiFetch) {
      this.items = [];
    } else {
      try {
        const res = await apiFetch('/api/sessions?limit=100');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { items: SessionItem[] };
        this.items = data.items;
      } catch {
        this.items = [];
      }
    }
    this.renderRows();
    // layout 重算（可能之前显示过 login 按钮）
    this.layout(this.scale.width, this.scale.height);
  }

  private renderRows(): void {
    // 清空
    for (const r of this.rows) r.container.destroy();
    this.rows = [];

    if (this.items.length === 0) {
      this.hintText.setText('暂无录制');
      this.hintText.setVisible(true);
      return;
    }
    this.hintText.setVisible(false);

    for (const item of this.items) {
      const row = this.createRow(item);
      this.rows.push(row);
      this.rowsContainer.add(row.container);
    }
    this.layoutRows();
  }

  private createRow(item: SessionItem): Row {
    const container = this.add.container(0, 0);
    const rowW = this.computeRowW();
    const rowH = px(ROW_H);

    const borderColor =
      item.outcome === 'won' ? HEX.primary : item.outcome === 'lost' ? HEX.danger : HEX.accent;
    const bg = this.add.graphics();
    // 行：极简底 + 左侧 outcome 色光带 + 底部细线分隔（无完整描边框）
    bg.fillStyle(HEX.bg, 0.35).fillRect(-rowW / 2, -rowH / 2, rowW, rowH);
    // 左侧 outcome 色光带：上下内嵌 px(6)、宽 px(2)、上下 padding px(12)
    bg.fillStyle(borderColor, 0.6).fillRect(
      -rowW / 2,
      -rowH / 2 + px(SPACING.xs + 2),
      px(2),
      rowH - px(SPACING.sm + SPACING.xs),
    );
    // 底部细线分隔
    // 底部分隔线：左右内嵌 px(12)
    bg.lineStyle(px(1), HEX.dim, 0.12).lineBetween(
      -rowW / 2 + px(SPACING.sm + SPACING.xs),
      rowH / 2,
      rowW / 2 - px(SPACING.sm + SPACING.xs),
      rowH / 2,
    );

    const stars = item.stars ?? 0;
    const starStr = ['☆☆☆', '★☆☆', '★★☆', '★★★'][stars] ?? '☆☆☆';
    const outcomeZh = item.outcome === 'won' ? '胜' : item.outcome === 'lost' ? '败' : '断';

    // 主标签：关号 + 结果
    const colorStr = `#${borderColor.toString(16).padStart(6, '0')}`;
    const mainText = this.add.text(
      -rowW / 2 + px(SPACING.md),
      -px(SPACING.xs),
      `关${item.level_id}  ${outcomeZh}  ${starStr}`,
      {
        fontFamily: FONT,
        fontSize: `${px(12)}px`,
        color: colorStr,
      },
    );
    mainText.setOrigin(0, 0.5);

    // 副标签：时间 + 动作数 + 波次
    const dateStr = new Date(item.created_at).toLocaleDateString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const subText = this.add.text(
      -rowW / 2 + px(SPACING.md),
      px(SPACING.sm + 2), // = px(10)
      `${dateStr}  ·  ${item.actions_count}步  ·  ${item.wave_reached}波`,
      {
        fontFamily: FONT,
        fontSize: `${px(9)}px`,
        color: COLOR.dim,
      },
    );
    subText.setOrigin(0, 0.5);

    // 删除按钮：纯文字 ✕，hover 变 danger
    const delIcon = this.add
      .text(0, 0, '✕', {
        fontFamily: FONT,
        fontSize: `${px(12)}px`,
        color: COLOR.dim,
      })
      .setOrigin(0.5, 0.5);
    // 删除按钮：右内嵌 px(20)，hit area 32×32
    const deleteBtn = this.add.container(rowW / 2 - px(SPACING.md + SPACING.xs), 0, [delIcon]);
    deleteBtn.setSize(px(SPACING.xl), px(SPACING.xl));
    const deleteHitRect = setRectInteractive(deleteBtn, px(SPACING.xl), px(SPACING.xl), {
      useHandCursor: true,
    });
    const sessionId = item.id;
    // click vs drag：拖动滚动列表时 pointerup 不应误触发"打开/删除"
    let delDownX = 0;
    let delDownY = 0;
    deleteBtn.on('pointerdown', (p: Input.Pointer) => {
      delDownX = p.x;
      delDownY = p.y;
    });
    deleteBtn.on('pointerup', (p: Input.Pointer & { event?: { stopPropagation?: () => void } }) => {
      if (Math.abs(p.x - delDownX) > 6 || Math.abs(p.y - delDownY) > 6) return;
      p?.event?.stopPropagation?.();
      void this.deleteSession(sessionId);
    });
    deleteBtn.on('pointerover', () => delIcon.setColor(COLOR.danger));
    deleteBtn.on('pointerout', () => delIcon.setColor(COLOR.dim));

    container.add([bg, mainText, subText, deleteBtn]);
    container.setSize(rowW, rowH);
    const hitRect = setRectInteractive(container, rowW, rowH, { useHandCursor: true });
    let downX = 0;
    let downY = 0;
    container.on('pointerdown', (p: Input.Pointer) => {
      downX = p.x;
      downY = p.y;
    });
    container.on('pointerup', (p: Input.Pointer) => {
      if (Math.abs(p.x - downX) > 6 || Math.abs(p.y - downY) > 6) return;
      void this.openReplay(sessionId);
    });
    return { container, bg, hitRect, sessionId, deleteBtn, deleteHitRect };
  }

  /** 视口变化时按新 rowW 重画背景 + 修正文字和删除按钮位置 */
  private redrawRow(row: Row): void {
    const rowW = this.computeRowW();
    const rowH = px(ROW_H);
    const item = this.items.find((it) => it.id === row.sessionId);
    const borderColor =
      item?.outcome === 'won' ? HEX.primary : item?.outcome === 'lost' ? HEX.danger : HEX.accent;
    row.bg.clear();
    row.bg.fillStyle(HEX.bg, 0.35).fillRect(-rowW / 2, -rowH / 2, rowW, rowH);
    row.bg.fillStyle(borderColor, 0.6).fillRect(-rowW / 2, -rowH / 2 + px(6), px(2), rowH - px(12));
    row.bg
      .lineStyle(px(1), HEX.dim, 0.12)
      .lineBetween(-rowW / 2 + px(12), rowH / 2, rowW / 2 - px(12), rowH / 2);
    row.container.setSize(rowW, rowH);
    row.hitRect.setSize(rowW, rowH);
    row.hitRect.setPosition(-rowW / 2, -rowH / 2);
    const mainText = row.container.list[1] as GameObjects.Text | undefined;
    if (mainText) mainText.setX(-rowW / 2 + px(SPACING.md));
    const subText = row.container.list[2] as GameObjects.Text | undefined;
    if (subText) subText.setX(-rowW / 2 + px(SPACING.md));
    row.deleteBtn.setX(rowW / 2 - px(SPACING.md + SPACING.xs));
  }

  private layoutRows(): void {
    const gap = px(SPACING.sm);
    const rowH = px(ROW_H);
    let y = rowH / 2;
    for (const r of this.rows) {
      r.container.setPosition(0, y);
      y += rowH + gap;
    }
    // 总高度 = 末行底部 - 首行顶部 = (y - rowH - gap + rowH/2) + rowH/2 - 0 = y - gap
    const totalH = Math.max(0, y - gap);
    const visH = this.contentBottom - this.contentTop;
    this.maxScrollY = Math.max(0, totalH - visH);
    this.setScroll(this.scrollY); // clamp
  }

  private async openReplay(sessionId: string): Promise<void> {
    const apiFetch = getShell().apiFetch;
    if (!apiFetch) return;
    try {
      const res = await apiFetch(`/api/sessions/${sessionId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      // 过 schema migration——老版本 session 在此处被补齐到 CURRENT_RECORDING_VERSION shape
      const session = migrateSessionIfNeeded(raw);
      if (typeof session.levelId !== 'number') {
        throw new Error('session 缺 levelId');
      }
      useUiStore.getState().setReplaySession(session as unknown);
      useUiStore.getState().setCurrentLevelId(session.levelId);
      transitionToScene(this, 'GameScene');
    } catch (err) {
      console.error('[ReplayListScene] 无法打开 session:', err);
    }
  }

  private async deleteSession(sessionId: string): Promise<void> {
    const apiFetch = getShell().apiFetch;
    if (!apiFetch) return;
    try {
      const res = await apiFetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) {
        console.warn(`[ReplayListScene] 删除失败 HTTP ${res.status}`);
        return;
      }
    } catch (err) {
      console.error('[ReplayListScene] 删除 session 失败:', err);
      return;
    }
    // 本地同步移除 —— 找到该行销毁
    const idx = this.rows.findIndex((r) => r.sessionId === sessionId);
    if (idx >= 0) {
      const row = this.rows[idx];
      row?.container.destroy();
      this.rows.splice(idx, 1);
    }
    this.items = this.items.filter((it) => it.id !== sessionId);
    if (this.rows.length === 0) {
      this.hintText.setText('（无录制）');
      this.hintText.setVisible(true);
    }
    this.layoutRows();
  }
}
