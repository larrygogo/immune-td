/**
 * Dev-only 白盒测试接口：仅在 `import.meta.env.DEV` 下挂载到 window。
 * Vite 生产 build 会 dead-code-eliminate 这整个分支，`bun run build` 后 dist/
 * 应 grep 不到 `__testHelpers`。
 *
 * 职责划分：
 * - `window.__phaser` / `__game`：Phaser.Game 实例（由 init.ts 注入）
 * - `window.__engine`：GameScene 运行期挂载的 hook 对象（placeTower / startWave 等）
 * - `window.__stores`：zustand store refs（由 store.ts 注入）
 * - `window.__testHelpers`：稳定的 e2e 接口，聚合上述入口并做 scene 导航 + 状态读取
 */

import type * as Phaser from 'phaser';
import { LEVELS } from '@engine/game/data/levels';
import type { TargetingPriority, TowerType } from '@engine/game/entities';
import type { GameState, StageResult } from '@engine/game/state';
import { getShell } from '../shell';
import { useGameStore, useMetaStore, useUiStore } from '@ui/store';

export interface EngineHooks {
  getState: () => GameState;
  placeTower: (type: TowerType, col: number, row: number) => { ok: boolean; error?: string };
  upgradeTower: (towerId: string) => { ok: boolean; error?: string };
  sellTower: (towerId: string) => { ok: boolean; error?: string };
  setTargetingPriority: (
    towerId: string,
    priority: TargetingPriority,
  ) => { ok: boolean; error?: string };
  startWave: () => void;
  setSpeed: (s: 1 | 2 | 3) => void;
  togglePause: () => void;
  skipBriefing: () => void;
  forceWin: (stars?: 1 | 2 | 3) => StageResult | null;
  forceLose: () => StageResult | null;
  /** 用指定种子重新初始化当前关卡（调试用） */
  resetWithSeed: (seed: number) => void;
  /** 返回 HUD 下波预览当前是否可见（仅 e2e 用，封装 hud private 字段访问） */
  isWavePreviewVisible: () => boolean;
}

export interface TestHelpers {
  // 导航
  goToScene: (key: string) => void;
  enterLevel: (levelId: number) => void;
  /** 设置关卡模式 'normal' | 'elite'（必须在 enterLevel 之前调用，否则进入的是上次的 mode） */
  setMode: (mode: 'normal' | 'elite') => void;
  isSceneActive: (key: string) => boolean;
  activeSceneKeys: () => string[];

  // RNG 调试
  getSeed: () => number | null;
  setSeed: (seed: number) => void;

  // 解锁 / 重置
  unlockAll: () => void;
  resetProgress: () => void;
  /** 调试加能量结晶（商店货币）。e2e + 浏览器 console 测试解锁链路用 */
  addCredits: (amount: number) => void;

  // 游戏控制（要求 GameScene 已启动）
  placeTower: EngineHooks['placeTower'];
  upgradeTower: EngineHooks['upgradeTower'];
  sellTower: EngineHooks['sellTower'];
  setTargetingPriority: EngineHooks['setTargetingPriority'];
  startWave: EngineHooks['startWave'];
  setSpeed: EngineHooks['setSpeed'];
  togglePause: EngineHooks['togglePause'];
  skipBriefing: EngineHooks['skipBriefing'];
  forceWin: EngineHooks['forceWin'];
  forceLose: EngineHooks['forceLose'];
  isWavePreviewVisible: EngineHooks['isWavePreviewVisible'];

  // 状态读
  getEngineState: () => GameState | null;
  getGameState: () => ReturnType<typeof useGameStore.getState>;
  getMetaState: () => ReturnType<typeof useMetaStore.getState>;
  getUiState: () => ReturnType<typeof useUiStore.getState>;

  /**
   * 一键打包当前 bug 现场：种子 + 布局 + 塔 + 病原快照 → JSON 字符串。
   * 自动复制到剪贴板，控制台也打印。用法：`__testHelpers.bugReport()` 然后粘给我。
   */
  bugReport: () => BugReport | null;

  /** 列出 server 侧该账号的 session id 数组（登录后才有，匿名或未登录返 []） */
  listSessions: () => Promise<string[]>;

  /**
   * 回放指定 session id：自动 fetch → 设 replaySession → 进入 GameScene。
   * 例：await __testHelpers.replaySession('L2_S42_2026-04-22T23-30-00-000Z')
   */
  replaySession: (sessionId: string) => Promise<void>;

  /**
   * e2e 用：触发 authStore.register（POST /api/auth/register）。
   * 测试中通常配合 page.route mock 拦截 server 返回，验证 dispatchAfterAuth 编排
   * （nickname 为空 → 弹 NicknameModal）等链路。
   */
  register: (username: string, password: string) => Promise<void>;
}

export interface BugReport {
  timestamp: string;
  levelId: number;
  seed: number;
  rngState: number;
  phase: string;
  waveIndex: number;
  hp: number;
  atp: number;
  entries: readonly { col: number; row: number }[];
  exits: readonly { col: number; row: number }[];
  blockedCells: readonly { col: number; row: number }[];
  protectedCells: readonly { coord: { col: number; row: number }; hp: number; name: string }[];
  towers: readonly {
    id: string;
    type: string;
    col: number;
    row: number;
    level: number;
    hp: number;
    maxHp: number;
  }[];
  pathogens: readonly {
    id: string;
    type: string;
    curCoord: { col: number; row: number } | null;
    pathStart: { col: number; row: number } | null;
    pathEnd: { col: number; row: number } | null;
    pathLength: number;
    pathIndex: number;
    progress: number;
    hp: number;
    maxHp: number;
    flying: boolean;
  }[];
  currentPath: string;
}

declare global {
  interface Window {
    __phaser?: Phaser.Game;
    __game?: Phaser.Game;
    __engine?: EngineHooks;
    __stores?: {
      game: typeof useGameStore;
      ui: typeof useUiStore;
      meta: typeof useMetaStore;
    };
    __testHelpers?: TestHelpers;
  }
}

function requireGame(): Phaser.Game {
  const g = window.__phaser ?? window.__game;
  if (!g) throw new Error('[test-helpers] Phaser game 未初始化');
  return g;
}

function requireEngine(): EngineHooks {
  if (!window.__engine) throw new Error('[test-helpers] GameScene 未启动，__engine 不可用');
  return window.__engine;
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  const helpers: TestHelpers = {
    goToScene: (key) => {
      const game = requireGame();
      for (const sc of [...game.scene.scenes]) {
        const k = sc.scene.key;
        if (k === 'BootScene' || k === key) continue;
        if (sc.scene.isActive() || sc.scene.isSleeping() || sc.scene.isPaused()) {
          sc.scene.stop();
        }
      }
      if (!game.scene.isActive(key)) game.scene.start(key);
    },
    enterLevel: (levelId) => {
      useUiStore.getState().setCurrentLevelId(levelId);
      // 教学关走 TutorialScene，其他关走 GameScene（与 route.ts enterLevel 一致）
      const isTutorial = LEVELS[levelId]?.isTutorial === true;
      helpers.goToScene(isTutorial ? 'TutorialScene' : 'GameScene');
    },
    setMode: (mode) => useUiStore.getState().setCurrentMode(mode),
    isSceneActive: (key) => requireGame().scene.isActive(key),
    activeSceneKeys: () =>
      [...requireGame().scene.scenes].filter((s) => s.scene.isActive()).map((s) => s.scene.key),

    unlockAll: () => useMetaStore.getState().unlockAll(),
    resetProgress: () => useMetaStore.getState().resetProgress(),
    addCredits: (amount) => useMetaStore.getState().addCredits(amount),

    getSeed: () => window.__engine?.getState().seed ?? null,
    setSeed: (seed) => requireEngine().resetWithSeed(seed),

    placeTower: (t, c, r) => requireEngine().placeTower(t, c, r),
    upgradeTower: (id) => requireEngine().upgradeTower(id),
    sellTower: (id) => requireEngine().sellTower(id),
    setTargetingPriority: (id, priority) => requireEngine().setTargetingPriority(id, priority),
    startWave: () => requireEngine().startWave(),
    setSpeed: (s) => requireEngine().setSpeed(s),
    togglePause: () => requireEngine().togglePause(),
    skipBriefing: () => requireEngine().skipBriefing(),
    forceWin: (stars) => requireEngine().forceWin(stars),
    forceLose: () => requireEngine().forceLose(),
    isWavePreviewVisible: () => requireEngine().isWavePreviewVisible(),

    getEngineState: () => window.__engine?.getState() ?? null,
    getGameState: () => useGameStore.getState(),
    getMetaState: () => useMetaStore.getState(),
    getUiState: () => useUiStore.getState(),

    register: async (username, password) => {
      // shell 注入的 authStore 类型只暴露 core 用到的子集；register 是 H5 私有方法。
      // dev/e2e 用例仅在 H5 端跑（wx 端不允许 dev tools），强转访问 register 即可。
      const auth = getShell().authStore?.getState() as
        | { register?: (u: string, p: string) => Promise<void> }
        | undefined;
      if (!auth?.register) {
        throw new Error('[test-helpers] shell.authStore.register 未注入（仅 H5 dev）');
      }
      await auth.register(username, password);
    },

    listSessions: async () => {
      const apiFetch = getShell().apiFetch;
      if (!apiFetch) return [];
      try {
        const res = await apiFetch('/api/sessions?limit=200');
        if (!res.ok) return [];
        const data = (await res.json()) as { items: Array<{ id: string }> };
        return data.items.map((it) => it.id);
      } catch {
        return [];
      }
    },

    replaySession: async (sessionId: string) => {
      const apiFetch = getShell().apiFetch;
      if (!apiFetch) throw new Error('[test-helpers] shell.apiFetch 未注入');
      const res = await apiFetch(`/api/sessions/${sessionId}`);
      if (!res.ok) throw new Error(`session 读取失败: ${sessionId}`);
      const session = await res.json();
      if (typeof session.levelId !== 'number') {
        throw new Error('session 格式非法：缺 levelId');
      }
      useUiStore.getState().setReplaySession(session);
      useUiStore.getState().setCurrentLevelId(session.levelId);
      helpers.goToScene('GameScene');
      console.log(
        `▶ 回放 session ${sessionId}（关 ${session.levelId}, ${session.actions?.length ?? 0} actions）`,
      );
    },

    bugReport: () => {
      const state = window.__engine?.getState();
      if (!state) {
        // 静默返回：未进入 GameScene 时自动心跳会反复踩这里，不刷 console
        return null;
      }
      const report: BugReport = {
        timestamp: new Date().toISOString(),
        levelId: state.levelId,
        seed: state.seed,
        rngState: state.rngState,
        phase: state.phase,
        waveIndex: state.waveIndex,
        hp: state.hp,
        atp: state.atp,
        entries: state.entries,
        exits: state.exits,
        blockedCells: state.blockedCells,
        protectedCells: state.protectedCells.map((pc) => ({
          coord: pc.coord,
          hp: pc.hp,
          name: pc.name,
        })),
        towers: state.towers.map((t) => ({
          id: t.id,
          type: t.type,
          col: t.col,
          row: t.row,
          level: t.level,
          hp: t.hp,
          maxHp: t.maxHp,
        })),
        pathogens: state.pathogens.map((p) => ({
          id: p.id,
          type: p.type,
          curCoord: p.path[p.pathIndex] ?? null,
          pathStart: p.path[0] ?? null,
          pathEnd: p.path[p.path.length - 1] ?? null,
          pathLength: p.path.length,
          pathIndex: p.pathIndex,
          progress: p.progress,
          hp: p.hp,
          maxHp: p.maxHp,
          flying: p.flying,
        })),
        currentPath: state.currentPath.map((c) => `(${c.col},${c.row})`).join(' → '),
      };
      const json = JSON.stringify(report, null, 2);
      // 静默 POST 到 Vite dev 中间件 → .debug/current.json
      // 带 _manual 标记时（手动调用）才打 console + 复制剪贴板
      const isManual = (globalThis as { __bugReportManualFlag?: boolean }).__bugReportManualFlag;
      if (isManual) {
        console.log('🐛 BugReport:', report);
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          navigator.clipboard
            .writeText(json)
            .then(() => console.log('✓ BugReport 已复制到剪贴板，可直接粘贴'))
            .catch((err) => console.warn('剪贴板写入失败:', err));
        }
      }
      const apiFetch = getShell().apiFetch;
      apiFetch?.('/api/bug-reports', {
        method: 'POST',
        body: json,
      }).catch(() => {
        // server 未启动或网络错，静默失败（同原 dev 中间件行为）
      });
      return report;
    },
  };
  window.__testHelpers = helpers;

  // 自动心跳已移除（原 3s POST /__debug/snapshot 会被 Vite 文件 watcher 触发
  // reload 循环刷新；未来用独立后台服务接收上报时再恢复）。
  // 手动触发 bugReport 入口保留：console 里调 `bugReport()` 仍可用。

  // 手动触发：打印 + 复制剪贴板
  (window as typeof window & { bugReport?: () => void }).bugReport = () => {
    (globalThis as { __bugReportManualFlag?: boolean }).__bugReportManualFlag = true;
    helpers.bugReport();
    (globalThis as { __bugReportManualFlag?: boolean }).__bugReportManualFlag = false;
  };
}
