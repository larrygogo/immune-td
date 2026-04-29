import type { GameObjects, Scene } from 'phaser';
import { useGameStore, useMetaStore, useUiStore } from '@ui/store';
import {
  type SpotlightSlot,
  TUTORIAL_STEPS,
  type TutorialAdvanceTrigger,
} from '../../game/data/tutorial-steps';
import type { PathogenType } from '../../game/entities';
import type { GameEvent } from '../../game/events';
import { SPACING } from '../../layout/spacing';
import type { GridLayer } from '../../render/grid-layer';
import { HEX, px } from '../../style';
import type { TowerBar } from '../../ui/tower-bar';
import { TutorialOverlay } from '../../ui/tutorial-overlay';

/**
 * GameScene 为 TutorialController 暴露的最小接口：scene 本身 + 教学需要读的布局层。
 *
 * 保持"单向依赖"：controller 只依赖 ctx，不回 import GameScene 类，避免循环引用。
 * 需要 scene 副作用的（spawn / 读关卡 id）走回调传入。
 */
export interface TutorialSceneContext {
  scene: Scene;
  grid: GridLayer;
  towerBar: TowerBar;
  /** 是否 isTutorial 关卡（runStepPacing 只在教学关执行 spawn） */
  isTutorialLevel: () => boolean;
  /** 教学步骤按节奏 spawn 病原（scene 里有手写 spawn 接口） */
  spawnPathogenForTutorial: (type: PathogenType) => void;
}

/**
 * MX-2 / MX-3 教学编排：管步骤推进、overlay / 目标格高亮 / step pacing / advance 订阅。
 *
 * 历史上这些逻辑（~200 LOC、9 方法、4 字段）直接写在 GameScene 里，使 GameScene 超过
 * 1300 行。抽到 controller 后 GameScene 只需持有 `tutorial: TutorialController | null`，
 * 相关 call site 收敛到 controller 的少数 public 方法。
 */
export class TutorialController {
  private stepIndex = 0;
  private overlay: TutorialOverlay | null = null;
  private unsubs: Array<() => void> = [];
  private targetCellGfx: GameObjects.Graphics | null = null;

  constructor(private ctx: TutorialSceneContext) {}

  get isActive(): boolean {
    return this.overlay !== null;
  }

  get currentStep(): number {
    return this.stepIndex;
  }

  start(startIdx: number): void {
    this.stepIndex = Math.max(0, Math.min(startIdx, TUTORIAL_STEPS.length - 1));
    this.overlay = new TutorialOverlay(this.ctx.scene, {
      onAdvance: () => this.advance(),
      onSkip: () => this.end(),
    });
    this.showStep(this.stepIndex);
  }

  /** GameScene.handleEvent 调用：当前步骤是 event 触发且类型匹配时推进 */
  maybeAdvanceOnEvent(eventType: GameEvent['type']): void {
    if (!this.overlay || this.stepIndex >= TUTORIAL_STEPS.length) return;
    const step = TUTORIAL_STEPS[this.stepIndex];
    if (step?.advance.type === 'event' && step.advance.eventType === eventType) {
      this.advance();
    }
  }

  /** layout() 调用：viewport / grid offset 变化后重算 spotlight + 卡片位置 */
  relayout(): void {
    if (this.overlay && this.stepIndex < TUTORIAL_STEPS.length) {
      this.showStep(this.stepIndex);
    }
  }

  /**
   * 暂停 / 恢复时切换 overlay 可见性。暂停期间隐藏让 PauseMenu 可见，
   * 恢复时不重置 stepIndex（继续当前步骤）。
   */
  setHiddenForPause(hidden: boolean): void {
    if (!this.overlay) return;
    if (hidden) {
      this.overlay.hide();
    } else if (this.stepIndex < TUTORIAL_STEPS.length) {
      this.showStep(this.stepIndex);
    }
  }

  /** shutdown / LEVEL_WON / LEVEL_LOST 调用：清 overlay + 订阅 + 目标格 + 塔栏 hint */
  end(): void {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    const meta = useMetaStore.getState();
    meta.setTutorialStep(-1);
    // 持久标记"历史上完成过教学"，关卡选择页据此显示"已完成"。re-entry 时 GameScene
    // 会把 tutorialStep 重置回 0，但 tutorialCompleted 永不回退（除非 resetProgress）
    meta.markTutorialCompleted();
    this.overlay?.destroy();
    this.overlay = null;
    this.ctx.towerBar?.stopTutorialHint();
    this.clearTargetCell();
    // MX-3：教学关 end 不再自动跳菜单——让玩家自由探索 / 按暂停选返回。
  }

  // ---- 内部 ----

  private showStep(idx: number): void {
    const step = TUTORIAL_STEPS[idx];
    if (!step || !this.overlay) return;
    for (const u of this.unsubs) u();
    this.unsubs = [];
    const sp = this.computeSpotlight(step.spotlight);
    const base = { id: step.id, title: step.title, body: step.body, spotlight: sp };
    const withPos = step.cardPosition ? { ...base, cardPosition: step.cardPosition } : base;
    if (step.advance.type === 'auto') {
      this.overlay.showStep({ ...withPos, autoAdvanceMs: step.advance.ms });
    } else if (step.advance.type === 'manual') {
      this.overlay.showStep({ ...withPos, manualAdvance: true });
    } else {
      this.overlay.showStep(withPos);
    }
    this.subscribeAdvance(step.advance);
    this.runStepPacing(idx);
  }

  private advance(): void {
    this.stepIndex++;
    useMetaStore.getState().setTutorialStep(this.stepIndex);
    if (this.stepIndex >= TUTORIAL_STEPS.length) {
      this.end();
    } else {
      this.showStep(this.stepIndex);
    }
  }

  private subscribeAdvance(trigger: TutorialAdvanceTrigger): void {
    if (trigger.type === 'auto') return; // overlay 自带 timer
    if (trigger.type === 'manual') return; // overlay 自带"下一步"按钮触发 onAdvance
    // 兜底超时：event / storeChange 类 step 60s 后强制推进，防玩家卡死
    const snapshotIdx = this.stepIndex;
    const timeoutTimer = this.ctx.scene.time.delayedCall(60_000, () => {
      if (this.stepIndex === snapshotIdx && this.overlay !== null) {
        this.advance();
      }
    });
    this.unsubs.push(() => timeoutTimer.remove(false));
    if (trigger.type === 'storeChange') {
      const field = trigger.field;
      if (field === 'selectedTowerType') {
        const initial = useUiStore.getState().selectedTowerType;
        const unsub = useUiStore.subscribe((s) => {
          if (s.selectedTowerType !== initial) {
            unsub();
            this.advance();
          }
        });
        this.unsubs.push(unsub);
      } else if (field === 'selectedTowerId') {
        const initial = useGameStore.getState().selectedTowerId;
        const unsub = useGameStore.subscribe((s) => {
          if (s.selectedTowerId !== initial) {
            unsub();
            this.advance();
          }
        });
        this.unsubs.push(unsub);
      } else if (field === 'speedMultiplier') {
        const initial = useGameStore.getState().speedMultiplier;
        const unsub = useGameStore.subscribe((s) => {
          if (s.speedMultiplier !== initial) {
            unsub();
            this.advance();
          }
        });
        this.unsubs.push(unsub);
      }
    }
    // event 类型由 maybeAdvanceOnEvent 处理
  }

  private runStepPacing(stepIdx: number): void {
    if (!this.ctx.isTutorialLevel()) return;
    this.ctx.towerBar.stopTutorialHint();
    this.clearTargetCell();
    const { scene } = this.ctx;
    const spawn = (type: PathogenType) => this.ctx.spawnPathogenForTutorial(type);
    switch (stepIdx) {
      case 0: // STEP 1 看 HUD
        break;
      case 1: // STEP 2 路径介绍：暂停 spawn 让玩家看清亮路径
        break;
      case 2: // STEP 3 拖塔：塔栏 macrophage 按钮脉动 + 目标格 (2,3) 黄色脉动
        // (2,3) 紧贴 row=4 path 上方一格，距离 1 在 mac range=1.5 内能打到怪
        this.ctx.towerBar.startTutorialHint('macrophage');
        this.showTargetCell(2, 3);
        break;
      case 3: // STEP 4 发动波次：立即 spawn 第 1 只
        scene.time.delayedCall(500, () => spawn('rhinovirus'));
        break;
      case 4: // STEP 5 击杀获 ATP：间隔 1.5s spawn 2 只
        for (let i = 0; i < 2; i++) {
          scene.time.delayedCall(800 + i * 1500, () => spawn('rhinovirus'));
        }
        break;
      case 5: // STEP 6 升级塔：在已放置塔 (2,3) 加光环引导玩家点击
        // 教学关玩家在 STEP 3 拖塔到 (2,3)，位置固定，直接复用 showTargetCell
        // 画黄色脉动环框住塔；玩家点击后 GameScene 会自动 deselect/select 流程
        this.showTargetCell(2, 3);
        break;
      case 6: // STEP 7 观察升级效果：spawn 6 只让玩家看强化塔击杀
        for (let i = 0; i < 6; i++) {
          scene.time.delayedCall(300 + i * 800, () => spawn('rhinovirus'));
        }
        break;
      case 7: // STEP 8 速度切换：spawn 5 只让 speed 差异明显
        for (let i = 0; i < 5; i++) {
          scene.time.delayedCall(300 + i * 600, () => spawn('rhinovirus'));
        }
        break;
      case 8: // STEP 9 拆除塔：暂停 spawn
        break;
      case 9: // STEP 10 完成
        break;
    }
  }

  private showTargetCell(col: number, row: number): void {
    this.clearTargetCell();
    const { scene, grid } = this.ctx;
    const size = grid.cellSize;
    const x = grid.offsetX + col * size;
    const y = grid.offsetY + row * size;
    const g = scene.add.graphics();
    g.setDepth(35);
    g.lineStyle(px(3), HEX.highlight, 0.9).strokeRect(x + 2, y + 2, size - 4, size - 4);
    g.fillStyle(HEX.highlight, 0.18).fillRect(x + 2, y + 2, size - 4, size - 4);
    scene.tweens.add({
      targets: g,
      alpha: { from: 1, to: 0.35 },
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
    this.targetCellGfx = g;
  }

  private clearTargetCell(): void {
    if (this.targetCellGfx) {
      this.ctx.scene.tweens.killTweensOf(this.targetCellGfx);
      this.targetCellGfx.destroy();
      this.targetCellGfx = null;
    }
  }

  /**
   * 把 SpotlightSlot 映射到当前 viewport 下的 (x, y, w, h) 矩形。
   * 坐标来源：HudPanel.layout / TowerBar.layoutButtons / GridLayer.layout /
   * SpeedControls 右上布局等，详见各 UI 组件 layout 方法。
   */
  private computeSpotlight(
    slot: SpotlightSlot,
  ): { x: number; y: number; w: number; h: number } | null {
    if (!slot) return null;
    const W = this.ctx.scene.scale.width;
    const H = this.ctx.scene.scale.height;
    switch (slot) {
      case 'hud':
        // HUD 在宽屏下铺满视口宽度（HudPanel 是顶部全宽栏），spotlight 跟着伸展
        return { x: 0, y: 0, w: W, h: px(SPACING.xl + SPACING.lg + SPACING.xs) }; // h = px(60)
      case 'atp':
        return {
          x: px(SPACING.xxl + SPACING.md + SPACING.xs + 2), // x = px(70)
          y: px(SPACING.xs),
          w: px(SPACING.xxl + SPACING.xl), // w = px(80)
          h: px(SPACING.xl + SPACING.sm), // h = px(40)
        };
      case 'tower-bar':
        return { x: 0, y: H - px(SPACING.xxl + SPACING.xl), w: W, h: px(SPACING.xxl + SPACING.xl) }; // h = px(80)
      case 'board': {
        const off = this.ctx.grid.cellSize * 10;
        return {
          x: this.ctx.grid.offsetX,
          y: this.ctx.grid.offsetY,
          w: off,
          h: off,
        };
      }
      case 'play-area': {
        const top = Math.max(
          px(SPACING.xl + SPACING.lg + SPACING.xs),
          this.ctx.grid.offsetY - px(SPACING.sm),
        );
        return { x: 0, y: top, w: W, h: H - top };
      }
      case 'wave-btn':
        // BuildBanner 实际 y=78，含倒计时 pill + 立即开始按钮 + 可选 wave preview
        // （让 banner 高度变大）。放宽到全宽 + 高 130 px 兜底动态高度。
        return {
          x: 0,
          y: px(SPACING.xxl + SPACING.md + SPACING.xs + 2), // y = px(70)
          w: W,
          h: px(SPACING.xxl * 2 + SPACING.xl + 2), // h = px(130)
        };
      case 'speed-btn':
        // 右上角 speed 按钮命中区：x = W - 12 - 34 - 4，y = 6，w = 42，h = 34
        return {
          x: W - px(SPACING.sm + SPACING.xs) - px(SPACING.xl + 2) - px(SPACING.xs),
          y: px(SPACING.xs + 2),
          w: px(SPACING.xl + SPACING.sm + 2),
          h: px(SPACING.xl + 2),
        };
      case 'pause-btn':
        // 右上角 pause 按钮：在 speed 按钮左侧再退一个按钮宽 + 间距 px(6)
        return {
          x:
            W -
            px(SPACING.sm + SPACING.xs) -
            px(SPACING.xl + 2) -
            px(SPACING.xs + 2) -
            px(SPACING.xl + 2) -
            px(SPACING.xs),
          y: px(SPACING.xs + 2),
          w: px(SPACING.xl + SPACING.sm + 2),
          h: px(SPACING.xl + 2),
        };
      default:
        return null;
    }
  }
}
