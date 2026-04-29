import { type GameObjects, type Input, Scene } from 'phaser';
import { track } from '@/analytics';
import {
  trackLevelComplete,
  trackLevelFail,
  trackLevelQuit,
  trackLevelStart,
  trackWaveEnd,
  trackWaveStart,
} from '@/analytics/level-events';
import { bgm } from '@audio/bgm';
import { sfx } from '@audio/sfx';
import type { RecordedAction, SessionRecording } from '@/dev/session-recorder';
import { sessionRecorder } from '@/dev/session-recorder';
import { useGameStore, useMetaStore, useUiStore } from '@ui/store';
import {
  pause,
  placeTower,
  resume,
  sellTower,
  setSpeed,
  setTargetingPriority,
  start,
  startWave,
  upgradeTower,
} from '../game/actions';
import { getLevel, getLevelByMode, isLevelImplemented } from '../game/data/levels';
import {
  PATHOGEN_DEFS,
  type PathogenType,
  TOWER_DEFS,
  TOWER_LEVELS,
  type TargetingPriority,
  type TowerType,
  createPathogen,
} from '../game/entities';
import type { GameEvent } from '../game/events';
import { EXIT } from '../game/map';
import { type NextIdFn, endStage, tick } from '../game/phases';
import { computeResearchModifiers } from '../game/registry/research-modifiers';
import { TOWER_REGISTRY } from '../game/registry/tower-registry';
import { type GameState, createInitialState } from '../game/state';
import { straightLinePath } from '../game/systems/pathfinding';
import { SPACING } from '../layout/spacing';
import { BulletLayer } from '../render/bullet-layer';
import { EffectsLayer, towerWorldPos } from '../render/effects-layer';
import { GridLayer } from '../render/grid-layer';
import { PathLayer } from '../render/path-layer';
import { PathogenLayer } from '../render/pathogen-layer';
import { PlacementGhost } from '../render/placement-ghost';
import { RangePreview } from '../render/range-preview';
import { SelectionRing } from '../render/selection-ring';
import { TowerLayer } from '../render/tower-layer';
import { SceneBackground } from '../scene-bg';
import {
  applySceneVignette,
  fadeInOnEnter,
  pulsePixelate,
  transitionToScene,
} from '../scene-fx';
import { onSceneResize } from '../scene-resize';
import { COLOR, FONT, HEX, px } from '../style';
import { BuildBanner } from '../ui/build-banner';
import { HudPanel } from '../ui/hud-panel';
import { PauseMenu } from '../ui/pause-menu';
import { ReplayBanner } from '../ui/replay-banner';
import { SettingsModal } from '../ui/settings-modal';
import { SpeedControls } from '../ui/speed-controls';
import { StageResultModal } from '../ui/stage-result-modal';
import { Toast } from '../ui/toast';
import { TowerBar } from '../ui/tower-bar';
import { TowerDetailPanel } from '../ui/tower-detail-panel';
import { TutorialController } from './game/tutorial-controller';

/**
 * Fixed-step engine tick 周期（ms）。
 * engine.tick 永远用此 dt，不跟 Phaser 帧率走 —— 保证回放 100% 决定性：
 * 不同设备 / 不同帧率 / 不同 CPU 负载下，给定相同 seed + 相同 action 序列，
 * engine 状态（含 rng 调用顺序、pathogen 路径、combat 抽签等）逐 tick 完全一致。
 */
const TICK_MS = 1000 / 60;
/** 防御：tab 切回来时 dt 可能 >1000ms，限制单帧最多模拟步数避免卡死 */
const MAX_STEPS_PER_FRAME = 10;

/**
 * 塔防主场景：完整 tick 循环 + 放置模式 + 选塔详情 + 升级/拆除 + 结算 Modal。
 * Task 5+6：升级 / 拆除 / 建造横幅 / 塔详情 / 结算 Modal / 解锁链。
 */
export class GameScene extends Scene {
  // 字段改 protected 让 subclass（TutorialScene）能访问 layer / UI；保持
  // package-private 语义（不暴露 public setter）
  protected bg!: SceneBackground;
  protected grid!: GridLayer;
  protected pathLayer!: PathLayer;
  protected rangePreview!: RangePreview;
  protected placementGhost!: PlacementGhost;
  protected towerLayer!: TowerLayer;
  protected bulletLayer!: BulletLayer;
  protected pathogenLayer!: PathogenLayer;
  protected effectsLayer!: EffectsLayer;
  protected selectionRing!: SelectionRing;
  protected hud!: HudPanel;
  protected speedControls!: SpeedControls;
  protected towerBar!: TowerBar;
  protected toast!: Toast;
  protected buildBanner!: BuildBanner;
  protected detailPanel!: TowerDetailPanel;
  protected stageModal!: StageResultModal;
  protected settingsModal!: SettingsModal;
  protected pauseMenu!: PauseMenu;
  protected selectionDim!: GameObjects.Graphics;

  protected state!: GameState;
  private selectedType: TowerType | null = null;
  private selectedTowerId: string | null = null;
  private _nextId = 1;
  private stageEnded = false;
  /** Fixed-step 累积器：Phaser 帧时间按倍速累积，累到 TICK_MS 就触发一次 engine tick */
  private accumulatedMs = 0;

  // 回放模式：非 null 时按 session 自动执行 recorded actions，禁用用户输入
  private replaySession: SessionRecording | null = null;
  private replayCursor = 0;
  private replayDone = false;
  private replayBanner: ReplayBanner | null = null;

  // 教学控制器引用：base GameScene 不启教学（createTutorialController 返 null）；
  // TutorialScene subclass 覆盖 createTutorialController 后此字段为 controller 实例。
  // 全场景生命周期内通过 this.tutorial 判定是否教学态。
  protected tutorial: TutorialController | null = null;

  /**
   * sceneKey 默认 'GameScene'；subclass（TutorialScene 等）可传自己的 key
   * 让 Phaser 注册不同 Scene 同时复用本类全部逻辑。
   */
  constructor(sceneKey = 'GameScene') {
    super(sceneKey);
  }

  create(): void {
    // 每次进入场景重置局部状态
    this._nextId = 1;
    this.stageEnded = false;
    this.selectedType = null;
    this.selectedTowerId = null;

    bgm.play('battle');

    // 战斗场景：vignette 暗角聚焦战场。原 bloom 0.9 + blur 0.8 在 mobile 480
    // viewport 上 GPU box blur 把画面整体糊化发灰 → 删掉。粒子辉光由各 layer 自带
    // setShadow / fillCircle 多层 alpha 承担。bg.setAlpha 保留——战斗场景有意压暗
    // 背景避免干扰棋盘可读性。
    applySceneVignette(this, { radius: 0.95, strength: 0.35 });
    fadeInOnEnter(this);

    const ui = useUiStore.getState();
    const requested = ui.currentLevelId;
    const levelId = typeof requested === 'number' && isLevelImplemented(requested) ? requested : 1;

    // 回放模式：读 uiStore.replaySession（由 Replay 入口点设置）
    const replay = ui.replaySession as SessionRecording | null;
    this.replaySession = replay;
    this.replayCursor = 0;
    this.replayDone = false;

    // BriefingScene 已在外部展示介绍，进入 GameScene 直接 start 进入战斗
    // 回放：用 session 记录的 seed 初始化，保证 RNG 一致
    // 研究 modifier：从 metaStore 读快照传入；回放时也用当前 metaStore（不存在历史快照，可接受）
    const modifiersSnapshot = computeResearchModifiers(useMetaStore.getState().unlockedResearch);
    // 回放模式优先用录制时的 mode（v2 起带 mode 字段；v1 老回放迁移为 'normal'）
    const mode = replay?.mode ?? ui.currentMode;
    this.state = start(createInitialState(levelId, replay?.seed, modifiersSnapshot, mode));

    // 埋点 level_start + sessionRecorder：仅正常进关（回放 / 教学不打）
    if (this.shouldTrackLevelEvents()) {
      const meta = useMetaStore.getState();
      const loadout = meta.loadout.length > 0 ? meta.loadout : meta.unlockedTowers;
      trackLevelStart({
        levelId,
        mode,
        loadout: [...loadout],
        seed: this.state.seed,
      });
      sessionRecorder.start(levelId, this.state.seed, mode);
    }

    // 背景（略降透明度，避免干扰棋盘）
    this.bg = new SceneBackground(this);
    this.bg.setAlpha(0.6);

    // 渲染层：grid → rangePreview → selectionRing → tower → pathogen
    // （路径不画线，跟 React 版一致——仅 entry/exit 染色提示方向）
    this.grid = new GridLayer(
      this,
      this.state.blockedCells,
      this.state.entries,
      this.state.exits,
      this.state.protectedCells,
    );
    // 路径层（A5）：fixed-path 模式时画粗线 + 流光，maze 时 paths 仍 fallback 占位
    // 但 pathCellSet 为空（A3 opt-in）→ 这里也以 pathCellSet 非空判断是否绘制，
    // 避免 maze 关被 fallback 占位路径"误渲染"出与玩家无关的视觉提示
    this.pathLayer = new PathLayer(this);
    this.rangePreview = new RangePreview(this);
    this.placementGhost = new PlacementGhost(this);
    this.selectionRing = new SelectionRing(this);
    this.towerLayer = new TowerLayer(this);
    this.pathogenLayer = new PathogenLayer(this);
    this.bulletLayer = new BulletLayer(this);
    this.effectsLayer = new EffectsLayer(this);

    // 选塔时全屏暗化层（在 effects 之下、塔之下，保持塔本身不被盖）
    this.selectionDim = this.add.graphics();
    this.selectionDim.setDepth(20);
    this.selectionDim.setAlpha(0);

    // UI 层
    this.hud = new HudPanel(this);
    this.speedControls = new SpeedControls(this, {
      onPauseToggle: () => {
        if (this.state.paused) {
          this.state = resume(this.state);
          this.pauseMenu.hide();
          // 教学激活时恢复 overlay
          this.tutorial?.setHiddenForPause(false);
        } else {
          this.state = pause(this.state);
          this.pauseMenu.show();
          // 教学激活时隐藏 overlay 让 PauseMenu 可见
          this.tutorial?.setHiddenForPause(true);
        }
      },
      onSpeedCycle: () => {
        const cur = this.state.speedMultiplier;
        const next: 1 | 2 | 3 = cur === 1 ? 2 : cur === 2 ? 3 : 1;
        const tickAt = this.state.tickCount;
        this.state = setSpeed(this.state, next);
        // 回放模式不录制（观看期的 speed 调整是观看控制，不应写入 session）
        if (!this.replaySession) {
          sessionRecorder.record('setSpeed', { speed: next }, tickAt, true);
        }
        // MX-2：同步到 store 让教学 storeChange 推进 / 外部读取一致
        useGameStore.setState({ speedMultiplier: next });
      },
    });
    this.towerBar = new TowerBar(
      this,
      (t) => {
        this.selectedType = t;
        // MX-2：同步选中塔类型到 uiStore（教学 Step 2 / 拖拽预览读取）
        useUiStore.getState().setSelectedTowerType(t);
        if (t) this.deselectTower();
        if (!t) {
          this.rangePreview.hide();
          this.placementGhost.hide();
        }
      },
      this.shouldApplySkinToTowerBar(),
    );
    this.toast = new Toast(this);

    this.buildBanner = new BuildBanner(this, () => this.handleStartWave());

    this.detailPanel = new TowerDetailPanel(this, {
      onUpgrade: (id) => this.handleUpgrade(id),
      onSell: (id) => this.handleSell(id),
      onClose: () => this.deselectTower(),
      onSetPriority: (id, priority) => this.handleSetTargetingPriority(id, priority),
    });
    this.stageModal = new StageResultModal(this, {
      onReplay: () => this.handleReplay(),
      onMenu: () => transitionToScene(this, 'MainMenuScene'),
      onNextLevel: () => this.handleNextLevel(),
    });
    this.pauseMenu = new PauseMenu(this, {
      onResume: () => {
        this.state = resume(this.state);
        this.pauseMenu.hide();
      },
      onReplay: () => {
        this.pauseMenu.hide();
        this.handleReplay();
      },
      onOpenSettings: () => {
        // 战斗内设置：用本地 SettingsModal 叠在 PauseMenu 上（不切场景、不丢状态）
        this.settingsModal.show();
      },
      onBackToMenu: () => transitionToScene(this, 'MainMenuScene'),
    });

    this.settingsModal = new SettingsModal(this, () => this.settingsModal.hide());

    // 回放模式的 UI 配置必须放在所有 UI 构造完成后（涉及 pauseMenu / towerBar / buildBanner）
    if (this.replaySession) {
      this.replayBanner = new ReplayBanner(this, () => {
        useUiStore.getState().setReplaySession(null);
        transitionToScene(this, 'MainMenuScene');
      });
      this.replayBanner.show();
      this.replayBanner.setProgress(0, this.replaySession.actions.length);
      // 禁用玩家操作类 UI：塔栏全隐藏 + 建造横幅仅隐藏"立即开始"按钮
      // （倒计时保留让玩家看到 build 阶段剩余秒数）
      this.towerBar.setSuppressed(true);
      this.buildBanner.setStartButtonVisible(false);
      // 回放模式的暂停菜单去掉"重玩本关"（回放里重玩没意义）
      this.pauseMenu.setReplayMode(true);
    }

    const { width, height } = this.scale;
    this.layout(width, height);
    onSceneResize(this, (w, h) => this.layout(w, h));

    this.input.on('pointermove', (pointer: Input.Pointer) => this.handlePointerMove(pointer));
    this.input.on('pointerdown', (pointer: Input.Pointer, gameObjects: GameObjects.GameObject[]) =>
      this.handlePointerDown(pointer, gameObjects),
    );
    this.input.on('pointerup', (pointer: Input.Pointer) => this.handlePointerUp(pointer));

    this.syncAll();

    // 教学激活由 subclass（TutorialScene）覆盖 createTutorialController 启用；
    // base GameScene 不启教学（即便 levelId===0 走 base 也不启，保证类语义独立）
    this.tutorial = this.createTutorialController();
    if (this.tutorial) {
      useMetaStore.getState().setTutorialStep(0);
      this.tutorial.start(0);
      this.configurePauseMenuForTutorial();
    }

    // 场景销毁时清理订阅 + overlay
    this.events.once('shutdown', () => {
      this.tutorial?.end();
      this.tutorial = null;
      // 若 session 仍在（玩家中途离开），封为 aborted + 埋 level_quit
      if (this.shouldTrackLevelEvents()) {
        sessionRecorder.abort(this.state.tickCount);
        trackLevelQuit({
          currentWave: this.state.waveIndex + 1,
          currentPhase: this.state.phase,
        });
      }
      // 清理 replay 状态，避免下次进关时仍处于回放模式
      useUiStore.getState().setReplaySession(null);
    });

    // Dev-only：暴露 window.__engine 给 e2e 白盒测试（见 src/dev/test-helpers.ts）。
    // 整个块被 Vite 的 DCE 在 prod build 中消除（import.meta.env.DEV 常量折叠）。
    // 不能提成 class 方法：class 方法体即便从未调用也会保留在产物里。
    if (import.meta.env.DEV) {
      const hooks = {
        getState: () => this.state,
        placeTower: (type: TowerType, col: number, row: number) => {
          const r = placeTower(this.state, col, row, type, this.nextId);
          if (r.ok) {
            this.state = r.state;
            for (const ev of r.events) this.handleEvent(ev);
            this.syncAll();
            return { ok: true };
          }
          return { ok: false, error: r.error };
        },
        upgradeTower: (towerId: string) => {
          const r = upgradeTower(this.state, towerId);
          if (r.ok) {
            this.state = r.state;
            for (const ev of r.events) this.handleEvent(ev);
            this.syncAll();
            return { ok: true };
          }
          return { ok: false, error: r.error };
        },
        sellTower: (towerId: string) => {
          const r = sellTower(this.state, towerId);
          if (r.ok) {
            this.state = r.state;
            for (const ev of r.events) this.handleEvent(ev);
            this.syncAll();
            return { ok: true };
          }
          return { ok: false, error: r.error };
        },
        setTargetingPriority: (towerId: string, priority: TargetingPriority) => {
          const r = setTargetingPriority(this.state, towerId, priority);
          if (r.ok) {
            this.state = r.state;
            for (const ev of r.events) this.handleEvent(ev);
            this.syncAll();
            return { ok: true };
          }
          return { ok: false, error: r.error };
        },
        isWavePreviewVisible: () => this.buildBanner.wavePreviewVisible,
        startWave: () => this.handleStartWave(),
        setSpeed: (s: 1 | 2 | 3) => {
          this.state = setSpeed(this.state, s);
          this.syncAll();
        },
        togglePause: () => {
          this.state = this.state.paused ? resume(this.state) : pause(this.state);
          this.syncAll();
        },
        skipBriefing: () => {
          // briefing 已抽成独立 scene；GameScene create 时已自动 start。
          // 保留 hook 以兼容旧 e2e 调用：如未 start 则补 start。
          if (!this.state.running) this.state = start(this.state);
        },
        forceWin: (stars: 1 | 2 | 3 = 3) => {
          const targetHp = stars === 3 ? 10 : stars === 2 ? 6 : 2;
          const faked: GameState = {
            ...this.state,
            hp: targetHp,
            waveIndex: this.state.totalWaves,
          };
          const r = endStage(faked, 'won', targetHp, this.state.atp, this.state.totalWaves);
          this.state = r.state;
          for (const ev of r.events) this.handleEvent(ev);
          this.syncAll();
          return this.state.stageResult;
        },
        forceLose: () => {
          const r = endStage(this.state, 'lost', 0, this.state.atp, this.state.waveIndex + 1);
          this.state = r.state;
          for (const ev of r.events) this.handleEvent(ev);
          this.syncAll();
          return this.state.stageResult;
        },
        resetWithSeed: (seed: number) => {
          const mods = computeResearchModifiers(useMetaStore.getState().unlockedResearch);
          this.state = start(createInitialState(this.state.levelId, seed, mods, this.state.mode));
          // 新 seed → 新 entries/exits/blockedCells/protectedCells，同步 GridLayer
          this.grid.setMapData(
            this.state.entries,
            this.state.exits,
            this.state.blockedCells,
            this.state.protectedCells,
          );
          this.grid.layout(this.scale.width, this.scale.height);
          this.syncAll();
        },
      };
      const w = window as unknown as { __engine?: typeof hooks | undefined };
      w.__engine = hooks;
      this.events.once('shutdown', () => {
        if (w.__engine === hooks) w.__engine = undefined;
      });
    }
  }

  override update(_t: number, dt: number): void {
    this.bg.tick(dt, this.scale.width, this.scale.height);

    if (!this.state.running || this.state.paused) {
      this.syncAll();
      return;
    }

    // 本帧"虚拟 dt"按倍速缩放（回放下 build 阶段也 × speed；否则 build 阶段 × 1）
    const buildRealtime = this.state.phase === 'build' && !this.replaySession;
    let frameDt = buildRealtime ? dt : dt * this.state.speedMultiplier;
    // 教学锁：关 0 教学进行中且尚未到 STEP 4（发动波次）时，build 倒计时不递减
    if (this.tutorial?.isActive && this.state.phase === 'build' && this.tutorial.currentStep < 2) {
      frameDt = 0;
    }
    this.accumulatedMs += frameDt;

    // Fixed-step tick loop：每次固定 TICK_MS 推进 engine，直到累积器 < TICK_MS
    // 录制 / 回放时 engine 行为与 Phaser 帧率 / wall-clock dt 完全解耦 → 100% 决定性
    let steps = 0;
    while (this.accumulatedMs >= TICK_MS && steps < MAX_STEPS_PER_FRAME) {
      // 回放：当前 tick 及之前还未播的 recorded actions（每 tick 前检查一次）
      if (this.replaySession && !this.replayDone) {
        const actions = this.replaySession.actions;
        while (this.replayCursor < actions.length) {
          const next = actions[this.replayCursor];
          if (!next || next.tick > this.state.tickCount) break;
          if (next.ok) this.applyRecordedAction(next);
          this.replayCursor++;
        }
        if (this.replayCursor >= actions.length) this.replayDone = true;
      }

      // 原玩家 endTick 停止：不再继续 engine tick（对中断 session 关键）
      const endTick = this.replaySession?.endTick;
      if (
        endTick !== undefined &&
        this.state.tickCount >= endTick &&
        this.state.phase !== 'complete' &&
        this.state.phase !== 'failed'
      ) {
        this.state = { ...this.state, running: false };
        this.toast?.show('回放已结束（原玩家退出）', COLOR.primary);
        this.accumulatedMs = 0;
        break;
      }

      const result = tick(this.state, TICK_MS, this.nextId);
      this.state = result.state;
      for (const ev of result.events) this.handleEvent(ev);
      this.accumulatedMs -= TICK_MS;
      steps++;

      // 中途 state 进入终态：停止后续累积 step，下个 frame 的 update 开头 guard 会短路
      if (!this.state.running || this.state.phase === 'complete' || this.state.phase === 'failed') {
        this.accumulatedMs = 0;
        break;
      }
    }
    // 防御：tab 切回来后若 MAX_STEPS_PER_FRAME 用完还没追上，丢余数避免持续积压
    if (this.accumulatedMs > TICK_MS * MAX_STEPS_PER_FRAME) {
      this.accumulatedMs = 0;
    }

    // 回放 banner 更新：每帧一次即可（不进内循环）
    if (this.replaySession) {
      const actions = this.replaySession.actions;
      this.replayBanner?.setProgress(this.replayCursor, actions.length);
      const anchorTick = this.replaySession.endTick ?? actions[actions.length - 1]?.tick ?? 0;
      this.replayBanner?.setCountdown(this.state.tickCount, anchorTick);
    }

    // 视觉层：effects 用真实 dt（不参与 game state / rng）
    this.effectsLayer.tick(dt, this.state.pathogens, this.grid, this.state.currentPath);
    this.syncAll();
  }

  private nextId: NextIdFn = (prefix) => `${prefix}${this._nextId++}`;

  /** 回放模式：把一条 recorded action 应用到 state，不触发录制、不播音效。 */
  private applyRecordedAction(a: RecordedAction): void {
    switch (a.type) {
      case 'placeTower': {
        const col = a.args.col as number;
        const row = a.args.row as number;
        const type = a.args.type as TowerType;
        const r = placeTower(this.state, col, row, type, this.nextId);
        if (r.ok) {
          this.state = r.state;
          for (const ev of r.events) this.handleEvent(ev);
        }
        break;
      }
      case 'upgradeTower': {
        const r = upgradeTower(this.state, a.args.towerId as string);
        if (r.ok) {
          this.state = r.state;
          for (const ev of r.events) this.handleEvent(ev);
        }
        break;
      }
      case 'sellTower': {
        const r = sellTower(this.state, a.args.towerId as string);
        if (r.ok) {
          this.state = r.state;
          for (const ev of r.events) this.handleEvent(ev);
        }
        break;
      }
      case 'setTargetingPriority': {
        const towerId = a.args.towerId as string;
        const priority = a.args.priority as TargetingPriority;
        const r = setTargetingPriority(this.state, towerId, priority);
        if (r.ok) {
          this.state = r.state;
          for (const ev of r.events) this.handleEvent(ev);
        }
        break;
      }
      case 'startWave': {
        if (this.state.phase !== 'build') break;
        const r = startWave(this.state);
        this.state = r.state;
        for (const ev of r.events) this.handleEvent(ev);
        break;
      }
      case 'setSpeed': {
        const speed = a.args.speed as 1 | 2 | 3;
        this.state = setSpeed(this.state, speed);
        useGameStore.setState({ speedMultiplier: speed });
        break;
      }
    }
  }

  private handlePointerMove(pointer: Input.Pointer): void {
    if (this.stageModal.isVisible()) {
      this.rangePreview.hide();
      this.placementGhost.hide();
      return;
    }
    // v4：build/wave 都允许放塔，但 complete/failed 阶段不显 ghost
    if (!this.selectedType || this.state.phase === 'complete' || this.state.phase === 'failed') {
      if (!this.selectedTowerId) this.rangePreview.hide();
      this.placementGhost.hide();
      return;
    }
    const cell = this.grid.worldToCell(pointer.worldX, pointer.worldY);
    const def = TOWER_LEVELS[this.selectedType][0];
    if (!def) return;
    const def0 = TOWER_DEFS[this.selectedType];

    if (!cell) {
      // 指针在棋盘外：range 圈隐藏，但 ghost 仍跟随指针标 invalid（红边）
      this.rangePreview.hide();
      this.placementGhost.show(this.selectedType, pointer.worldX, pointer.worldY, false, this.grid);
      return;
    }

    const cellWorld = this.grid.cellToWorld(cell.col, cell.row);
    const occupied = this.state.towers.some((t) => t.col === cell.col && t.row === cell.row);
    const blocked = this.state.blockedCells.some((c) => c.col === cell.col && c.row === cell.row);
    const valid = !occupied && !blocked && this.state.atp >= def0.cost;
    // M5：辅助塔（dendritic 等）hover 时 range 圈用蓝色，区分 buff 范围
    const isHelper = TOWER_REGISTRY[this.selectedType].role === 'helper';
    const rangeColor = isHelper ? HEX.protected : HEX.primary;
    this.rangePreview.show(cell.col, cell.row, def.range, rangeColor, this.grid);
    this.placementGhost.show(
      this.selectedType,
      cellWorld.x,
      cellWorld.y,
      valid,
      this.grid,
      blocked,
    );
  }

  private handlePointerDown(pointer: Input.Pointer, gameObjects: GameObjects.GameObject[]): void {
    // 结算 Modal 打开时：任何场景点击都走 Modal 内部按钮
    if (this.stageModal.isVisible()) return;
    // 点中 UI 对象（塔栏 / HUD / 面板按钮），不走选塔
    // 拖拽模式：塔栏按钮 pointerdown 已经设了 selectedType，本回调直接 return
    if (gameObjects.length > 0) return;

    // 拖拽模式（selectedType 不空）：等 pointerup 决定是否放置，pointerdown 不操作
    if (this.selectedType) return;

    const cell = this.grid.worldToCell(pointer.worldX, pointer.worldY);
    if (!cell) {
      this.deselectTower();
      return;
    }

    // 普通模式：选中格子上的已建塔，否则取消
    const hit = this.state.towers.find((t) => t.col === cell.col && t.row === cell.row);
    if (hit) {
      this.selectTower(hit.id);
    } else {
      this.deselectTower();
    }
  }

  /**
   * 拖拽放置：塔栏按钮 pointerdown 设 selectedType，pointerup 时如果指针
   * 落在棋盘有效格则放塔；落在棋盘外或无效格则取消选中。
   */
  private handlePointerUp(pointer: Input.Pointer): void {
    if (this.stageModal.isVisible()) return;
    if (!this.selectedType) return;

    const cell = this.grid.worldToCell(pointer.worldX, pointer.worldY);
    const cleanup = () => {
      this.selectedType = null;
      // MX-2：拖拽结束清掉 uiStore 标记，保持与私有字段同步
      useUiStore.getState().setSelectedTowerType(null);
      this.towerBar.setSelected(null);
      this.placementGhost.hide();
      this.rangePreview.hide();
    };

    if (!cell) {
      cleanup();
      return;
    }
    // v4：build/wave 都可放塔，仅 complete/failed 拒绝
    if (this.state.phase === 'complete' || this.state.phase === 'failed') {
      this.toast.show('关卡已结束，无法放置', COLOR.danger);
      cleanup();
      return;
    }
    if (this.replaySession) {
      cleanup();
      return;
    }
    const tickAt = this.state.tickCount;
    const atpBefore = this.state.atp;
    const result = placeTower(this.state, cell.col, cell.row, this.selectedType, this.nextId);
    sessionRecorder.record(
      'placeTower',
      { col: cell.col, row: cell.row, type: this.selectedType },
      tickAt,
      result.ok,
      result.ok ? undefined : result.error,
    );
    if (result.ok) {
      this.state = result.state;
      sfx.towerPlace();
      track('tower_place', {
        tower_type: this.selectedType,
        level_id: this.state.levelId,
        wave_idx: this.state.waveIndex,
        col: cell.col,
        row: cell.row,
        atp_at_place: atpBefore,
      });
      for (const ev of result.events) this.handleEvent(ev);
    } else {
      if (result.error === 'ERROR_NOT_ENOUGH_ATP') this.toast.show('ATP 不足', COLOR.danger);
      else if (result.error === 'ERROR_ON_PATH') this.toast.show('路径上不可建', COLOR.danger);
      else if (result.error === 'ERROR_BLOCKED_CELL') this.toast.show('该格禁建', COLOR.danger);
      else this.toast.show('无法放置此位置', COLOR.danger);
      sfx.error();
    }
    cleanup();
  }

  private selectTower(id: string): void {
    // 回放模式：禁用塔选中（避免弹出 detail panel 的升级/拆除按钮，
    // 按钮本身已有 guard 但视觉上会误导玩家以为可点）
    if (this.replaySession) return;
    this.selectedTowerId = id;
    // MX-2：同步到 gameStore 让教学 Step 6 storeChange 推进
    useGameStore.getState().setSelectedTowerId(id);
    this.towerBar.setSelected(null); // 互斥：清掉放置模式
    this.detailPanel.show(id, this.state);
    const t = this.state.towers.find((tw) => tw.id === id);
    if (t) {
      // M5：辅助塔选中时蓝色 ring + range，区分功能
      const isHelper = TOWER_REGISTRY[t.type].role === 'helper';
      const ringColor = isHelper ? HEX.protected : HEX.highlight;
      this.selectionRing.show(t.col, t.row, this.grid, ringColor);
      const def = TOWER_LEVELS[t.type][t.level - 1];
      if (def) this.rangePreview.show(t.col, t.row, def.range, ringColor, this.grid);
    }
    this.towerLayer.setSelected(id);
    this.dimBackground(true);
  }

  private deselectTower(): void {
    if (!this.selectedTowerId) return;
    this.selectedTowerId = null;
    // MX-2：同步到 gameStore 保持一致
    useGameStore.getState().setSelectedTowerId(null);
    this.detailPanel.hide();
    this.selectionRing.hide();
    this.rangePreview.hide();
    this.towerLayer.setSelected(null);
    this.dimBackground(false);
  }

  private dimBackground(on: boolean): void {
    this.tweens.killTweensOf(this.selectionDim);
    if (on) {
      const W = this.scale.width;
      const H = this.scale.height;
      this.selectionDim.clear();
      this.selectionDim.fillStyle(HEX.black, 1).fillRect(0, 0, W, H);
      this.tweens.add({ targets: this.selectionDim, alpha: 0.4, duration: 200, ease: 'Quad.out' });
    } else {
      this.tweens.add({
        targets: this.selectionDim,
        alpha: 0,
        duration: 180,
        ease: 'Quad.out',
      });
    }
  }

  private handleUpgrade(id: string): void {
    if (this.replaySession) return;
    const tickAt = this.state.tickCount;
    const towerBefore = this.state.towers.find((t) => t.id === id);
    const fromLevel = (towerBefore?.level ?? 1) as 1 | 2;
    const towerType = towerBefore?.type;
    const atpBefore = this.state.atp;
    const result = upgradeTower(this.state, id);
    sessionRecorder.record(
      'upgradeTower',
      { towerId: id },
      tickAt,
      result.ok,
      result.ok ? undefined : result.error,
    );
    if (result.ok) {
      this.state = result.state;
      if (towerType !== undefined && fromLevel < 3) {
        track('tower_upgrade', {
          tower_id: id,
          tower_type: towerType,
          from_level: fromLevel,
          to_level: (fromLevel + 1) as 2 | 3,
          atp_at_upgrade: atpBefore,
        });
      }
      this.detailPanel.sync(this.state);
      const t = this.state.towers.find((tw) => tw.id === id);
      if (t) {
        // M5：辅助塔升级后 ring + range 仍用蓝色
        const isHelper = TOWER_REGISTRY[t.type].role === 'helper';
        const ringColor = isHelper ? HEX.protected : HEX.highlight;
        this.selectionRing.show(t.col, t.row, this.grid, ringColor);
        const def = TOWER_LEVELS[t.type][t.level - 1];
        if (def) this.rangePreview.show(t.col, t.row, def.range, ringColor, this.grid);
      }
      for (const ev of result.events) this.handleEvent(ev);
    } else {
      if (result.error === 'ERROR_NOT_ENOUGH_ATP') this.toast.show('ATP 不足', COLOR.danger);
      else this.toast.show('无法升级', COLOR.danger);
      sfx.error();
    }
  }

  private handleSetTargetingPriority(towerId: string, priority: TargetingPriority): void {
    if (this.replaySession) return;
    const tickAt = this.state.tickCount;
    const result = setTargetingPriority(this.state, towerId, priority);
    sessionRecorder.record(
      'setTargetingPriority',
      { towerId, priority },
      tickAt,
      result.ok,
      result.ok ? undefined : result.error,
    );
    if (result.ok) {
      this.state = result.state;
      this.detailPanel.sync(this.state);
      sfx.uiClick();
    } else {
      sfx.error();
    }
  }

  private handleSell(id: string): void {
    if (this.replaySession) return;
    const tickAt = this.state.tickCount;
    const tower = this.state.towers.find((t) => t.id === id);
    const result = sellTower(this.state, id);
    sessionRecorder.record(
      'sellTower',
      { towerId: id },
      tickAt,
      result.ok,
      result.ok ? undefined : result.error,
    );
    if (result.ok) {
      this.state = result.state;
      sfx.uiClick();
      // 粒子爆散在原塔位置（state 已更新但 tower local var 还有数据）
      if (tower) {
        const w = towerWorldPos(tower, this.grid);
        this.effectsLayer.spawnTowerSell(w.x, w.y, tower.type);
      }
      const refundEv = result.events.find((e) => e.type === 'TOWER_SOLD');
      if (refundEv && refundEv.type === 'TOWER_SOLD') {
        this.toast.show(`已拆除 · 返还 ${refundEv.refund} ATP`, COLOR.accent);
      }
      if (tower) {
        const refund = refundEv?.type === 'TOWER_SOLD' ? refundEv.refund : 0;
        track('tower_sold', {
          tower_id: id,
          tower_type: tower.type,
          total_invested: tower.totalInvested,
          refund,
          reason: 'manual',
        });
      }
      this.deselectTower();
      // 派发事件让教学推进（STEP 7 监听 TOWER_SOLD）
      for (const ev of result.events) this.handleEvent(ev);
    } else {
      this.toast.show('无法拆除', COLOR.danger);
      sfx.error();
    }
  }

  private handleStartWave(): void {
    if (this.replaySession) return;
    if (this.state.phase !== 'build') return;
    const tickAt = this.state.tickCount;
    const result = startWave(this.state);
    sessionRecorder.record('startWave', {}, tickAt, true);
    this.state = result.state;
    for (const ev of result.events) this.handleEvent(ev);
  }

  /**
   * 教学专用：手动 spawn 一只病原（绕过 spawner 自动逻辑）。
   * 仅 TutorialScene 通过 ctx 回调调；base GameScene 不会触发（no tutorial controller）。
   * 保留在 base 为了让 subclass 通过 protected/public 方法访问 layer + state。
   */
  public spawnPathogenForTutorial(type: PathogenType): void {
    if (!this.state.running) return;
    const id = this.nextId('p');
    const entry = this.state.entries[0];
    if (!entry) return;
    const exits = this.state.exits;
    const isFlying = PATHOGEN_DEFS[type].flying ?? false;
    // A6.3：fixed-path 模式下教学 spawn 直接用预设 paths[0]
    const ownPath = isFlying
      ? straightLinePath(entry, exits[0] ?? EXIT)
      : (this.state.paths[0] ?? []);
    const variance = {
      offsetX: (Math.random() - 0.5) * 28,
      offsetY: (Math.random() - 0.5) * 28,
      speedMultiplier: 0.85 + Math.random() * 0.3,
      path: ownPath,
    };
    const wave = getLevelByMode(this.state.levelId, this.state.mode).waves[0];
    const hpMul = wave?.hpMultiplier ?? 1;
    const p = createPathogen(id, type, hpMul, variance);
    this.state = {
      ...this.state,
      pathogens: [...this.state.pathogens, p],
    };
    this.handleEvent({
      type: 'PATHOGEN_SPAWNED',
      pathogenId: id,
      pathogenType: type,
      x: entry.col,
      y: entry.row,
    });
  }

  private handleReplay(): void {
    this.stageModal.hide();
    this.stageEnded = false;
    this._nextId = 1;
    this.selectedType = null;
    this.selectedTowerId = null;
    this.deselectTower();
    this.towerBar.setSelected(null);
    const replayMods = computeResearchModifiers(useMetaStore.getState().unlockedResearch);
    this.state = start(
      createInitialState(this.state.levelId, undefined, replayMods, this.state.mode),
    );
    // 新 seed 会生成新 entries/exits/blockedCells/protectedCells，同步到 GridLayer 并重绘
    this.grid.setMapData(
      this.state.entries,
      this.state.exits,
      this.state.blockedCells,
      this.state.protectedCells,
    );
    this.grid.layout(this.scale.width, this.scale.height);
    this.syncAll();
  }

  private handleNextLevel(): void {
    const nextId = this.state.levelId + 1;
    if (!isLevelImplemented(nextId)) {
      this.toast.show('下一关敬请期待', COLOR.dim);
      return;
    }
    useUiStore.getState().setCurrentLevelId(nextId);
    transitionToScene(this, 'GameScene');
  }

  private handleEvent(ev: GameEvent): void {
    switch (ev.type) {
      case 'PATHOGEN_KILLED': {
        sfx.pathogenKilled();
        const p = this.state.pathogens.find((x) => x.id === ev.pathogenId);
        if (p) {
          const seg = p.path.length > 0 ? p.path : this.state.currentPath;
          const idx = Math.min(p.pathIndex, seg.length - 1);
          const nx = Math.min(p.pathIndex + 1, seg.length - 1);
          const cur = seg[idx];
          const next = seg[nx] ?? cur;
          if (cur && next) {
            const lc = cur.col + (next.col - cur.col) * p.progress;
            const lr = cur.row + (next.row - cur.row) * p.progress;
            const w = this.grid.cellToWorld(lc, lr);
            this.effectsLayer.spawnPathogenDeath(w.x + p.offsetX, w.y + p.offsetY, p.type);
            // 飘字「+N ATP」：从死亡点向上飘 + 淡出（700ms），金色突显奖励感
            this.spawnAtpFloat(w.x + p.offsetX, w.y + p.offsetY - px(SPACING.sm), ev.atpDropped);
            // boss 死亡：屏幕轻震 + 金黄闪光 + Pixelate 复古冲击
            if (p.type === 'saureus') {
              this.cameras.main.shake(220, 0.012);
              this.cameras.main.flash(180, 255, 200, 100, false);
              pulsePixelate(this, 8, 380);
            }
          }
        }
        break;
      }
      case 'TOWER_PLACED': {
        const w = this.grid.cellToWorld(ev.x, ev.y);
        this.effectsLayer.spawnTowerPlace(w.x, w.y, ev.towerType, this.grid.cellSize);
        break;
      }
      case 'TOWER_UPGRADED': {
        sfx.towerUpgrade();
        const t = this.state.towers.find((tw) => tw.id === ev.towerId);
        if (t) {
          const w = towerWorldPos(t, this.grid);
          this.effectsLayer.spawnTowerUpgrade(w.x, w.y, t.type, this.grid.cellSize);
          // 升级 glow 强闪 + 屏幕轻闪同色
          this.towerLayer.flashUpgrade(t.id);
        }
        break;
      }
      case 'WAVE_STARTED': {
        sfx.waveStart();
        const level = getLevelByMode(this.state.levelId, this.state.mode);
        const wave = level.waves[ev.waveIndex];
        const hasBoss = wave?.composition.some((c) => c.type === 'saureus') ?? false;
        if (hasBoss) {
          this.towerBar.pulseBossWarning();
          this.cameras.main.shake(180, 0.006);
          pulsePixelate(this, 6, 360);
          this.toast.show('⚠ 母株来袭', COLOR.danger);
        } else {
          this.towerBar.pulseAll();
        }
        if (!this.replaySession) {
          trackWaveStart({
            waveIdx: ev.waveIndex,
            hp: this.state.hp,
            atp: this.state.atp,
            towersCount: this.state.towers.length,
          });
        }
        break;
      }
      case 'WAVE_ENDED':
        sfx.waveEnd();
        if (!this.replaySession) {
          sessionRecorder.onWaveCompleted();
          trackWaveEnd({
            waveIdx: ev.waveIndex,
            hp: this.state.hp,
            atp: this.state.atp,
          });
        }
        break;
      case 'WAVE_BONUS': {
        // Phase B / B4：分类飘字 base + perfect + economy（屏幕中部偏右）
        const W = this.scale.width;
        const H = this.scale.height;
        const x = W * 0.7;
        let y = H * 0.4;
        const yStep = px(SPACING.md + SPACING.xs + 2); // = px(22)
        this.spawnBonusFloat(x, y, `+${ev.base} 波末奖励`, COLOR.primary);
        if (ev.perfect > 0) {
          y += yStep;
          this.spawnBonusFloat(x, y, `+${ev.perfect} 完美波！`, COLOR.rewardGold);
        }
        if (ev.economy > 0) {
          y += yStep;
          this.spawnBonusFloat(x, y, `+${ev.economy} 线粒体产能`, COLOR.accent);
        }
        break;
      }
      case 'TOWER_FIRED': {
        if (
          ev.towerType === 'macrophage' ||
          ev.towerType === 'neutrophil' ||
          ev.towerType === 'nkcell'
        ) {
          sfx.towerFire(ev.towerType);
        }
        const t = this.state.towers.find((tw) => tw.id === ev.towerId);
        if (t) {
          const w = towerWorldPos(t, this.grid);
          const def = TOWER_LEVELS[t.type][t.level - 1];
          const rangePx = def ? def.range * this.grid.cellSize : this.grid.cellSize;
          this.effectsLayer.pushFire({
            towerType: ev.towerType,
            targetIds: ev.targetIds,
            originX: w.x,
            originY: w.y,
            rangePixels: rangePx,
          });
          // 塔本体闪光（preFX glow 短暂放大）
          this.towerLayer.flashFire(t.id);
          // NK 专属：sprite 朝向当前命中目标（取第一只）
          if (t.type === 'nkcell' && ev.targetIds.length > 0) {
            const targetId = ev.targetIds[0];
            const target = this.state.pathogens.find((p) => p.id === targetId);
            if (target) {
              const seg = target.path.length > 0 ? target.path : this.state.currentPath;
              const idx = Math.min(target.pathIndex, seg.length - 1);
              const nx = Math.min(target.pathIndex + 1, seg.length - 1);
              const cur = seg[idx];
              const next = seg[nx] ?? cur;
              if (cur && next) {
                const lc = cur.col + (next.col - cur.col) * target.progress;
                const lr = cur.row + (next.row - cur.row) * target.progress;
                const tp = this.grid.cellToWorld(lc, lr);
                this.towerLayer.aimAt(t.id, tp.x - w.x, tp.y - w.y);
              }
            }
          }
          // 命中敌人闪白
          for (const tid of ev.targetIds) this.pathogenLayer.flashHit(tid);
        }
        break;
      }
      case 'CORE_DAMAGED': {
        // 核心受伤：仅轻微抖动（不闪光，每敌都闪太刺眼）
        this.cameras.main.shake(120, 0.004);
        break;
      }
      case 'TOWER_DESTROYED': {
        // 塔被啃死：红色粒子爆炸 + 冲击波环 + 屏幕轻震 + 塔淡出
        const w = this.grid.cellToWorld(ev.col, ev.row);
        this.towerLayer.destroyTower(ev.towerId);
        this.effectsLayer.spawnTowerDestroy(w.x, w.y, this.grid.cellSize);
        this.cameras.main.shake(180, 0.005);
        // 选中塔被销毁则关闭详情面板
        if (this.selectedTowerId === ev.towerId) this.deselectTower();
        break;
      }
      case 'PROTECTED_CELL_DAMAGED': {
        // HUD 主动刷新一行 hp，配轻微震动
        this.hud.refreshProtectedCells(this.state.protectedCells);
        this.cameras.main.shake(120, 0.004);
        break;
      }
      case 'PROTECTED_CELL_DESTROYED': {
        // 关键细胞倒下：重震 + 红色闪光，HUD 重画后该行 hp=0 显示红字
        this.cameras.main.shake(280, 0.012);
        this.cameras.main.flash(220, 255, 80, 80);
        this.hud.refreshProtectedCells(this.state.protectedCells);
        break;
      }
      case 'LEVEL_WON':
        this.handleLevelWon(ev.stars);
        break;
      case 'LEVEL_LOST':
        this.handleLevelLost();
        break;
      default:
        break;
    }
    // MX-2 教学事件推进：当前步骤如果是 event 触发且类型匹配，立即推进
    this.tutorial?.maybeAdvanceOnEvent(ev.type);
  }

  private handleLevelWon(stars: 1 | 2 | 3): void {
    if (this.stageEnded) return;
    const level = getLevel(this.state.levelId);
    if (!this.replaySession) {
      sessionRecorder.finalize(
        {
          outcome: 'won',
          finalHp: this.state.hp,
          finalAtp: this.state.atp,
          waveReached: this.state.waveIndex + 1,
          stars,
        },
        this.state.tickCount,
      );
    }
    // 回放模式：不弹 StageResultModal（没有"下一关/重玩"意义），不更新 meta
    // 只做轻量反馈（音效 + 闪光 + toast）让玩家感知结束
    if (this.replaySession) {
      this.stageEnded = true;
      sfx.levelWon();
      this.cameras.main.flash(350, 80, 200, 140, false);
      const txt = stars === 3 ? '回放结束：3★ 完美' : `回放结束：${stars}★ 通关`;
      this.toast?.show(txt, COLOR.primary);
      return;
    }
    // 教学场景由 subclass 走教学完成流程（TutorialScene.onTutorialFinished），不弹 stage modal
    if (this.tutorial) {
      this.stageEnded = true;
      this.onTutorialFinished('won');
      return;
    }
    this.stageEnded = true;
    sfx.levelWon();
    // 胜利：温和绿色闪光（不震动，避免破坏胜利感）
    this.cameras.main.flash(350, 80, 200, 140, false);
    const meta = useMetaStore.getState();
    if (this.state.mode === 'elite') {
      // 精英模式：仅按 stars 增量发 RP（1★→1 / 2★→2 / 3★→3），不解锁下关 / 不送塔奖励
      // 重玩仅当 newStars > prevEliteStars 时发增量
      const prevElite = meta.eliteStars[this.state.levelId] ?? 0;
      const rpGain = stars > prevElite ? stars - prevElite : 0;
      meta.setEliteStars(this.state.levelId, stars);
      if (rpGain > 0) {
        meta.addResearchPoints(rpGain);
        this.toast?.show(`研究点 +${rpGain}（精英）`, COLOR.rewardGold);
      }
    } else {
      // 元升级 RP 发放：首通 +1，本次 3 星首通额外 +1，Boss 关（5/10/15...）首通额外 +1
      // （重玩不发；2/3 星升级也不再发）。Phase 3 经济包：让二章玩家就能点 ~10 节点
      const prevStars = meta.stars[this.state.levelId] ?? 0;
      const isFirstClear = prevStars === 0;
      const isBossLevel = this.state.levelId > 0 && this.state.levelId % 5 === 0;
      let rpGain = 0;
      if (isFirstClear) {
        rpGain += 1;
        if (stars === 3) rpGain += 1;
        if (isBossLevel) rpGain += 1;
      }
      meta.setStars(this.state.levelId, stars);
      meta.unlockLevel(this.state.levelId + 1);
      for (const t of level.rewardsTowers) meta.unlockTower(t);
      if (rpGain > 0) {
        meta.addResearchPoints(rpGain);
        this.toast?.show(`研究点 +${rpGain}`, COLOR.rewardGold);
      }
    }
    // 埋点 level_complete：仅正常通关（回放 / 教学场景已 early-return）
    if (this.shouldTrackLevelEvents()) {
      trackLevelComplete({
        stars,
        hpLeft: Math.max(0, this.state.hp),
        atpRemaining: Math.max(0, this.state.atp),
        waveCount: this.state.waveIndex + 1,
        towersAtEnd: this.state.towers.map((t) => ({
          type: t.type,
          level: t.level,
          col: t.col,
          row: t.row,
        })),
      });
    }
    this.showStageModal();
  }

  private handleLevelLost(): void {
    if (this.stageEnded) return;
    if (!this.replaySession) {
      sessionRecorder.finalize(
        {
          outcome: 'lost',
          finalHp: this.state.hp,
          finalAtp: this.state.atp,
          waveReached: this.state.waveIndex + 1,
          stars: 0,
        },
        this.state.tickCount,
      );
    }
    // 回放模式：不弹 StageResultModal，只 toast + 轻量反馈
    if (this.replaySession) {
      this.stageEnded = true;
      sfx.levelLost();
      this.cameras.main.shake(280, 0.012);
      this.cameras.main.flash(220, 140, 30, 50, false);
      this.toast?.show('回放结束：失败', COLOR.danger);
      return;
    }
    // 教学场景失败由 subclass 走教学流程
    if (this.tutorial) {
      this.stageEnded = true;
      this.onTutorialFinished('lost');
      return;
    }
    this.stageEnded = true;
    sfx.levelLost();
    // 失败：屏幕震动为主，闪光改弱（深红短促）+ 塔群淡出（死亡感）
    this.cameras.main.shake(450, 0.018);
    this.cameras.main.flash(220, 140, 30, 50, false);
    this.towerLayer.fadeOutAll();
    // 埋点 level_fail：判断 fail_reason —— 任一保护细胞 hp=0 优先于 core hp 归零
    const protectedDead = this.state.protectedCells.some((pc) => pc.hp === 0);
    trackLevelFail({
      failWave: this.state.waveIndex + 1,
      failReason: protectedDead ? 'protected_cell_died' : 'core_died',
      hpAtFail: this.state.hp,
    });
    this.showStageModal();
  }

  private showStageModal(): void {
    if (!this.state.stageResult) return;
    const nextId = this.state.levelId + 1;
    const nextLevelTitle = isLevelImplemented(nextId) ? getLevel(nextId).title : null;
    const level = getLevel(this.state.levelId);
    this.deselectTower();
    this.towerBar.setSelected(null);
    this.stageModal.show(
      this.state.stageResult,
      nextLevelTitle,
      level.rewardsTowers,
      this.state.mode,
    );
  }

  /**
   * HudPanel / WaveBar 下行显示用：
   * - build 阶段：下一波总数（读 level.waves[waveIndex].composition 累计）
   * - wave 阶段：spawner 队列剩余 + 场上活跃（alive && !reachedExit）
   * - complete/failed：WaveBar 自己会隐藏 pending 行，这里返回 0 即可
   */
  private computePendingCount(): number {
    const s = this.state;
    if (s.phase === 'build') {
      const level = getLevelByMode(s.levelId, s.mode);
      const wave = level.waves[s.waveIndex];
      if (!wave) return 0;
      let total = 0;
      for (const c of wave.composition) total += c.count;
      return total;
    }
    if (s.phase === 'wave') {
      const remaining = s.spawner.queue.length - s.spawner.spawnedCount;
      let active = 0;
      for (const p of s.pathogens) if (p.alive && !p.reachedExit) active++;
      return Math.max(0, remaining) + active;
    }
    return 0;
  }

  /**
   * 病原死亡时在尸体处飘出 "+N ATP" 文字：金色 + 向上飘 30px + 700ms 淡出。
   * 用一次性 Phaser Text，tween 完成后自动 destroy。
   */
  private spawnAtpFloat(x: number, y: number, atp: number): void {
    const txt = this.add
      .text(x, y, `+${atp} ATP`, {
        fontFamily: FONT,
        fontSize: `${px(11)}px`,
        color: COLOR.rewardGold,
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 1)
      .setLetterSpacing(px(11 * 0.1))
      .setShadow(0, 0, COLOR.rewardGold, px(6), false, true)
      .setDepth(90);
    this.tweens.add({
      targets: txt,
      y: y - px(SPACING.lg + SPACING.xs + 2), // 上飘 = px(30)
      alpha: { from: 1, to: 0 },
      duration: 700,
      ease: 'Cubic.out',
      onComplete: () => {
        if (txt.active) txt.destroy();
      },
    });
  }

  /** Phase B / B4：波末分类奖励飘字（base / perfect / economy）；上飘 + 淡出 1.5s */
  private spawnBonusFloat(x: number, y: number, text: string, color: string): void {
    const txt = this.add
      .text(x, y, text, {
        fontFamily: FONT,
        fontSize: `${px(13)}px`,
        color,
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0.5)
      .setLetterSpacing(px(13 * 0.1))
      .setShadow(0, 0, color, px(8), false, true)
      .setDepth(95)
      .setAlpha(0);
    this.tweens.add({
      targets: txt,
      y: y - px(SPACING.xl + SPACING.xs), // 上飘 = px(36)
      alpha: { from: 1, to: 0 },
      duration: 1500,
      ease: 'Sine.out',
      onComplete: () => {
        if (txt.active) txt.destroy();
      },
    });
  }

  private syncAll(): void {
    // A5：fixed-path 模式下渲染粗线 + 流光（pathCellSet 非空才画，maze 关 noop）
    this.pathLayer.sync(this.state.pathCellSet.size > 0 ? this.state.paths : [], this.grid);
    this.towerLayer.sync(this.state.towers, this.grid);
    this.pathogenLayer.sync(this.state.pathogens, this.grid, this.state.currentPath);
    this.bulletLayer.sync(this.state.bullets, this.state.towers, this.grid);
    this.hud.sync(this.state, this.computePendingCount());
    this.speedControls.sync(this.state);
    this.buildBanner.sync(this.state, getLevelByMode(this.state.levelId, this.state.mode));
    this.towerBar.sync(this.state.atp, this.state.phase, this.getTowersForBar());

    if (this.selectedTowerId) {
      const exists = this.state.towers.some((t) => t.id === this.selectedTowerId);
      if (!exists) {
        this.deselectTower();
      } else {
        this.detailPanel.sync(this.state);
      }
    }
  }

  private layout(W: number, H: number): void {
    this.bg.setViewport(W, H);
    this.grid.layout(W, H);
    this.hud.layout(W, H);
    this.speedControls.layout(W, H);
    this.towerBar.layout(W, H);
    this.buildBanner.layout(W, H);
    this.replayBanner?.layout(W, H);
    this.detailPanel.layout(W, H);
    this.stageModal.layout(W, H);
    this.pauseMenu.layout(W, H);
    if (this.settingsModal?.isVisible()) this.settingsModal.layout(W, H);
    // 教学激活：重算 spotlight（依赖 grid offset / viewport 尺寸）+ 卡片位置
    this.tutorial?.relayout();
    // cellSize 变化需要重画
    this.syncAll();
  }

  // ---------- protected hooks（subclass 覆盖教学差异）----------

  /**
   * 创建教学控制器。base 返回 null（不启教学），TutorialScene 覆盖返回实例。
   * 当 levelId !== 0 时即便 subclass 也应返回 null（教学只在序章关有意义）。
   */
  protected createTutorialController(): TutorialController | null {
    return null;
  }

  /**
   * 是否应跟踪 level_start / level_complete / level_quit / level_fail 埋点 +
   * sessionRecorder 录制。base 排除回放模式；TutorialScene 覆盖返回 false（教学
   * 不进 BI 漏斗 / 不录回放）。
   */
  protected shouldTrackLevelEvents(): boolean {
    return !this.replaySession;
  }

  /**
   * TowerBar 显示哪些塔。base 读 metaStore.unlockedTowers；TutorialScene 覆盖
   * 返回 ['macrophage'] 单塔，避免新手被多塔选项干扰。
   */
  protected getTowersForBar(): readonly TowerType[] {
    return useMetaStore.getState().unlockedTowers;
  }

  /**
   * 教学激活时配置 PauseMenu。base 不动；TutorialScene 覆盖调
   * setReplayMode(true) 隐藏「重玩本关」按钮。
   */
  protected configurePauseMenuForTutorial(): void {
    // base no-op
  }

  /**
   * 教学完成（won/lost）。base 走 markTutorialCompleted + 跳 LevelSelect 章节 0。
   * 仅 tutorial 字段非 null 时被调用。
   */
  protected onTutorialFinished(_outcome: 'won' | 'lost'): void {
    useMetaStore.getState().markTutorialCompleted();
    transitionToScene(this, 'LevelSelectScene');
  }

  /**
   * TowerBar 是否按当前装备 skin 渲染 sprite。base 返 true（正常关卡）；
   * TutorialScene 覆盖返 false（教学关永远显默认皮肤，避免给新手额外干扰）。
   */
  protected shouldApplySkinToTowerBar(): boolean {
    return true;
  }
}
