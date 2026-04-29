import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { track } from '@/analytics';
import { type GameMechanic, getAllLevelIds } from '@engine/game/data/levels';
import type { TowerType } from '@engine/game/entities';
import {
  RESEARCH_NODES,
  type ResearchNodeId,
  canUnlockResearch,
  defaultUnlockedResearch,
  getResearchNode,
} from '@engine/game/registry/research-registry';
import type { GamePhase, StageResult } from '@engine/game/state';

// ---- gameStore · 运行时游戏状态（不持久化）----
export interface GameUiState {
  hp: number;
  atp: number;
  waveIndex: number;
  totalWaves: number;
  phase: GamePhase;
  buildPhaseRemainingMs: number;
  stageResult: StageResult | null;
  selectedTowerId: string | null;
  paused: boolean;
  speedMultiplier: 1 | 2 | 3;
  pendingCount: number; // 当前/下一波还剩多少威胁（未 spawn + 活跃）
  setSelectedTowerId: (id: string | null) => void;
}

export const useGameStore = create<GameUiState>((set) => ({
  hp: 10,
  atp: 100,
  waveIndex: 0,
  totalWaves: 5,
  phase: 'build',
  buildPhaseRemainingMs: 15000,
  stageResult: null,
  selectedTowerId: null,
  paused: false,
  speedMultiplier: 1,
  pendingCount: 0,
  setSelectedTowerId: (id) => set({ selectedTowerId: id }),
}));

// ---- uiStore · UI 纯状态（不持久化）----
export type ScreenName =
  | 'splash'
  | 'mainMenu'
  | 'levelSelect'
  | 'encyclopedia'
  | 'game'
  | 'pause'
  | 'research'
  | 'settings';

export type LevelMode = 'normal' | 'elite';

export interface UiState {
  currentScreen: ScreenName;
  currentLevelId: number;
  /** 当前关卡模式：normal=普通通关，elite=精英版（敌人全 fortified） */
  currentMode: LevelMode;
  /** LevelSelectScene 上次选中的章节 tab；-1 表示未设置，scene 进入时按进度自动算 */
  lastChapterId: number;
  selectedTowerType: string | null;
  hoveredCell: { col: number; row: number } | null;
  /** 非 null 表示正在从 TowerPanel 拖拽该类型塔 */
  draggingTowerType: string | null;
  /** 非 null 时 GameScene 进入 replay 模式，按录制动作自动回放 */
  replaySession: unknown | null;
  /** H5 登录 modal 开关（仅 web 端使用；wx 端走 BootScene 自动登录链路） */
  loginModalOpen: boolean;
  /** 登录成功后回调（用例：开始游戏前拦截，登录后继续 enterLevel） */
  loginModalAfterAuth: (() => void) | null;
  /** H5 nickname 强制设置 modal 开关（仅 web 端使用；wx 端不参与） */
  nicknameModalOpen: boolean;
  /** nickname 设置成功后回调（一般用于继续 login afterAuth 链路） */
  nicknameModalAfterAuth: (() => void) | null;
  setScreen: (s: ScreenName) => void;
  setCurrentLevelId: (id: number) => void;
  setCurrentMode: (m: LevelMode) => void;
  setLastChapterId: (id: number) => void;
  setSelectedTowerType: (t: string | null) => void;
  setHoveredCell: (cell: { col: number; row: number } | null) => void;
  setDraggingTowerType: (t: string | null) => void;
  setReplaySession: (s: unknown | null) => void;
  /** 打开登录 modal；afterAuth 在登录/注册成功后触发（modal 自行关闭） */
  openLoginModal: (afterAuth?: () => void) => void;
  /** 关闭登录 modal 并清空 afterAuth 回调 */
  closeLoginModal: () => void;
  /** 打开 nickname 强制 modal；afterAuth 在 setNickname 成功后触发 */
  openNicknameModal: (afterAuth?: () => void) => void;
  /** 内部用：modal 提交成功后调，不暴露给用户操作（modal 不可手动关闭） */
  closeNicknameModal: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  currentScreen: 'splash',
  currentLevelId: 1,
  currentMode: 'normal',
  lastChapterId: -1,
  selectedTowerType: null,
  hoveredCell: null,
  draggingTowerType: null,
  replaySession: null,
  loginModalOpen: false,
  loginModalAfterAuth: null,
  nicknameModalOpen: false,
  nicknameModalAfterAuth: null,
  setScreen: (s) => set({ currentScreen: s }),
  setCurrentLevelId: (id) => set({ currentLevelId: id }),
  setCurrentMode: (m) => set({ currentMode: m }),
  setLastChapterId: (id) => set({ lastChapterId: id }),
  setSelectedTowerType: (t) => set({ selectedTowerType: t }),
  setHoveredCell: (cell) => set({ hoveredCell: cell }),
  setDraggingTowerType: (t) => set({ draggingTowerType: t }),
  setReplaySession: (s) => set({ replaySession: s }),
  openLoginModal: (afterAuth) =>
    set({ loginModalOpen: true, loginModalAfterAuth: afterAuth ?? null }),
  closeLoginModal: () => set({ loginModalOpen: false, loginModalAfterAuth: null }),
  openNicknameModal: (afterAuth) =>
    set({ nicknameModalOpen: true, nicknameModalAfterAuth: afterAuth ?? null }),
  closeNicknameModal: () => set({ nicknameModalOpen: false, nicknameModalAfterAuth: null }),
}));

// ---- metaStore · 跨局持久化状态（localStorage）----
export interface Settings {
  masterVolume: number;
  sfxVolume: number;
  bgmVolume: number;
  graphics: 'low' | 'medium' | 'high';
  muted: boolean;
}

export interface MetaState {
  schemaVersion: 13; // 当前持久化 schema 版本（与 persist version 对齐）
  freshlyMigrated: boolean; // 一次性 UI 提示标志：true 表示刚从老版本升级，需要弹通知
  unlockedLevels: number[];
  unlockedTowers: TowerType[];
  stars: Record<number, 1 | 2 | 3>;
  /** 精英版关卡星数（v12 加）。与 stars 同 shape；不影响 totalStars 但单独显示 */
  eliteStars: Record<number, 1 | 2 | 3>;
  researchPoints: number;
  unlockedResearch: string[];
  /** 研究重置次数（v11 加）。首次重置免费，之后每次扣 1 RP */
  researchResetCount: number;
  settings: Settings;
  tutorialStep: number; // -1 = 当前会话已完成；0..N = 当前会话步骤索引（re-entry 会重置）
  tutorialCompleted: boolean; // 持久"历史上是否完成过教学"——reset 前不消除，关卡选择页读这个标"已完成"
  seenMechanics: GameMechanic[]; // MX-1：玩家已见过介绍卡的关卡级机制，避免重复展示
  loadout: TowerType[]; // M7：玩家携带阵容（最多 carryLimit 长，空数组表示未设置）
  ownerUserId: number | null; // 进度归属用户 id；null 表示匿名态。用于 progressSync 切账号检测
  // 商城 / 皮肤系统（v13 加）
  /** 信用点余额（购买皮肤等装饰）；关卡通关 / 完美波 / 三星 / Boss 关投放 */
  credits: number;
  /** 每塔已解锁皮肤 id 列表（不含 'default'，default 永远默认有） */
  unlockedSkins: Partial<Record<TowerType, string[]>>;
  /** 每塔当前装备的皮肤 id；缺失视为 'default' */
  equippedSkins: Partial<Record<TowerType, string>>;
  unlockLevel: (level: number) => void;
  unlockTower: (type: TowerType) => void;
  setStars: (level: number, stars: 1 | 2 | 3) => void;
  /** 精英星数（v12 加）。仅当 newStars > prevEliteStars 时写入，与 setStars 同 max 语义 */
  setEliteStars: (level: number, stars: 1 | 2 | 3) => void;
  addResearchPoints: (amount: number) => void;
  /** 老式 setter：不校验 RP / 前置，仅追加 id（v3 ResearchScene 在外面手动扣 RP 后调用）。
   *  Phase 4 之后倾向用 buyResearch atomic 一步到位。 */
  unlockResearch: (id: string) => void;
  /**
   * 原子购买研究节点：检查 RP 是否够 + 前置是否满足 + 未已购，扣 RP + 加 id。
   * 任一条件不满足返回原 state（无副作用）。Phase 4 v4 ResearchScene 用此方法。
   * 返回 true = 成功；false = 失败（前置/RP/已购）。
   */
  buyResearch: (id: ResearchNodeId) => boolean;
  /**
   * 重置研究：所有非默认已购节点的 cost 退还，researchUnlock 重置为 default。
   * 首次免费，之后每次扣 1 RP；RP 不够时拒绝。
   * 返回 `{ ok, refund, cost }`：ok=false 时未做任何修改；ok=true 时 RP 已 +refund -cost。
   */
  resetResearch: () => { ok: boolean; refund: number; cost: number };
  updateSettings: (partial: Partial<Settings>) => void;
  setTutorialStep: (step: number) => void;
  markTutorialCompleted: () => void;
  acknowledgeMigration: () => void;
  markMechanicsSeen: (ids: readonly GameMechanic[]) => void;
  setLoadout: (l: readonly TowerType[]) => void;
  setOwnerUserId: (id: number | null) => void;
  // 商城（v13 加）
  /** 累加信用点（永远不会减少，扣 credits 走 unlockSkin 内部逻辑） */
  addCredits: (amount: number) => void;
  /** 解锁某塔的某皮肤；信用点不足返回 false 不动 state，成功扣费返回 true */
  unlockSkin: (type: TowerType, skinId: string, cost: number) => boolean;
  /** 装备某塔的某皮肤（已解锁的或 'default'） */
  equipSkin: (type: TowerType, skinId: string) => void;
  // 调试辅助
  unlockAll: () => void;
  resetProgress: () => void;
}

const META_STORAGE_KEY = 'immune-td:meta:v2';
const ALL_TOWERS: TowerType[] = [
  'macrophage',
  'neutrophil',
  'nkcell',
  'dendritic',
  'mitochondria',
];
const ALL_LEVEL_IDS = getAllLevelIds();
const DEFAULT_LEVELS_V4: number[] = [0, 1];
const ALLOWED_TOWERS_BY_SCHEMA_V4: TowerType[] = ['macrophage'];

/**
 * Migrate persisted metaStore state across schema versions.
 *
 * - v2 → v3: 补齐 level 0（序章）默认解锁，加 tutorialStep 字段
 * - v3 → v4: M0 schema 重整，关卡 / 塔解锁 + tutorial 重置；stars / settings / researchPoints 保留；
 *   并打上 freshlyMigrated 标志供首屏一次性提示
 * - v4 → v5: MX-1 加 seenMechanics 字段（默认空数组，老用户进新关时正常看到介绍卡）
 * - v5 → v6: M7 加 loadout 字段（默认空数组，进 LoadoutScene 时按解锁塔种自动初始化）
 * - v6 → v7: progressSync 加 ownerUserId 字段（默认 null；匿名态/未登录）
 * - v7 → v8: 加 tutorialCompleted 字段，持久记录"历史上是否完成过教学"。已有
 *   tutorialStep === -1 的老用户视作已完成，直接回填 true；其他用户默认 false
 * - v8 → v9: 升级研究 meta progression（每塔升级权限单独锁）；老存档默认含
 *   'upgrade-macrophage'（避免老玩家进游戏发现升级按钮全锁）
 * - v9 → v10: 升级研究改为按级别拆分（'upgrade-{type}-lv2' / 'lv3'）；老 v9
 *   id 'upgrade-{type}' 视作"两级都解锁"展开，避免老玩家解锁丢失
 * - v10 → v11: Phase 3 研究树重做（4 棵树 × 5 节点）。旧 id 'upgrade-{type}-lv2/3'
 *   映射到新 id '{prefix}-lv2/3'（mac/neu/nk/den）；老玩家已购的旧节点等价于
 *   新对应节点已购，可作为下游能力节点的前置条件。新增 researchResetCount 字段
 *   记录重置次数（首次免费，后续每次扣 1 RP）
 *
 * 顶级 export 便于单元测试直接验证迁移行为，不必走 zustand persist 完整生命周期。
 */
export function migrateMetaState(persistedState: unknown, version: number): MetaState {
  const s = (persistedState ?? {}) as Partial<MetaState>;
  if (version < 3) {
    const existing = Array.isArray(s.unlockedLevels) ? s.unlockedLevels : [1];
    if (!existing.includes(0)) s.unlockedLevels = [0, ...existing].sort((a, b) => a - b);
    if (typeof s.tutorialStep !== 'number') s.tutorialStep = 0;
  }
  if (version < 4) {
    s.unlockedLevels = [...DEFAULT_LEVELS_V4];
    s.unlockedTowers = [...ALLOWED_TOWERS_BY_SCHEMA_V4];
    s.tutorialStep = 0;
    s.freshlyMigrated = true;
  }
  if (version < 5) {
    if (!Array.isArray(s.seenMechanics)) s.seenMechanics = [];
  }
  if (version < 6) {
    if (!Array.isArray(s.loadout)) s.loadout = [];
  }
  if (version < 7) {
    if (typeof s.ownerUserId !== 'number' && s.ownerUserId !== null) s.ownerUserId = null;
  }
  if (version < 8) {
    // 从 tutorialStep === -1 推断老用户是否已完成过
    s.tutorialCompleted = s.tutorialStep === -1;
  }
  if (version < 9) {
    // v9 引入旧 id 'upgrade-{type}'；这里只保证至少有 macrophage 旧 id（v10 会再次扩展）
    const cur = Array.isArray(s.unlockedResearch) ? s.unlockedResearch : [];
    if (!cur.includes('upgrade-macrophage')) cur.push('upgrade-macrophage');
    s.unlockedResearch = cur;
  }
  if (version < 10) {
    // v9 旧 id 'upgrade-{type}' 视作"两级都解锁"展开（老玩家不丢付费）；
    // 然后用 defaultUnlockedResearch() 补默认（巨噬 Lv2）
    const cur = Array.isArray(s.unlockedResearch) ? s.unlockedResearch : [];
    const expanded: string[] = [];
    for (const id of cur) {
      if (id.startsWith('upgrade-') && !id.endsWith('-lv2') && !id.endsWith('-lv3')) {
        // 旧 'upgrade-{type}' → 同时解锁 Lv2 + Lv3
        expanded.push(`${id}-lv2`, `${id}-lv3`);
      } else {
        expanded.push(id);
      }
    }
    for (const id of defaultUnlockedResearch()) {
      if (!expanded.includes(id)) expanded.push(id);
    }
    s.unlockedResearch = Array.from(new Set(expanded));
  }
  if (version < 11) {
    // v10 旧 id 'upgrade-{type}-lv{N}' → 新 id '{prefix}-lv{N}'（mac/neu/nk/den）
    // 老玩家已付过 RP 的等价新节点直接保留，不退点也不补点
    const ID_MIGRATION_V11: Record<string, string> = {
      'upgrade-macrophage-lv2': 'mac-lv2',
      'upgrade-macrophage-lv3': 'mac-lv3',
      'upgrade-neutrophil-lv2': 'neu-lv2',
      'upgrade-neutrophil-lv3': 'neu-lv3',
      'upgrade-nkcell-lv2': 'nk-lv2',
      'upgrade-nkcell-lv3': 'nk-lv3',
      'upgrade-dendritic-lv2': 'den-lv2',
      'upgrade-dendritic-lv3': 'den-lv3',
    };
    const cur = Array.isArray(s.unlockedResearch) ? s.unlockedResearch : [];
    s.unlockedResearch = Array.from(new Set(cur.map((id: string) => ID_MIGRATION_V11[id] ?? id)));
    if (typeof s.researchResetCount !== 'number') s.researchResetCount = 0;
  }
  if (version < 12) {
    // v12 加精英模式 eliteStars 字段（默认空 dict）
    if (!s.eliteStars || typeof s.eliteStars !== 'object') s.eliteStars = {};
  }
  // v12 → v13: 加商城 / 皮肤字段
  if (s.credits === undefined) s.credits = 0;
  if (s.unlockedSkins === undefined) s.unlockedSkins = {};
  if (s.equippedSkins === undefined) s.equippedSkins = {};
  s.schemaVersion = 13;
  return s as MetaState;
}

export const useMetaStore = create<MetaState>()(
  persist(
    (set) => ({
      schemaVersion: 13,
      freshlyMigrated: false,
      unlockedLevels: [0, 1],
      unlockedTowers: ['macrophage'],
      stars: {},
      eliteStars: {},
      researchPoints: 0,
      unlockedResearch: defaultUnlockedResearch(),
      researchResetCount: 0,
      settings: {
        masterVolume: 0.8,
        sfxVolume: 1,
        bgmVolume: 0.6,
        graphics: 'high',
        muted: false,
      },
      tutorialStep: 0,
      tutorialCompleted: false,
      seenMechanics: [],
      loadout: [],
      ownerUserId: null,
      credits: 0,
      unlockedSkins: {},
      equippedSkins: {},
      unlockLevel: (level) => {
        let unlocked = false;
        set((st) => {
          if (st.unlockedLevels.includes(level)) return st;
          unlocked = true;
          return {
            ...st,
            unlockedLevels: [...st.unlockedLevels, level].sort((a, b) => a - b),
          };
        });
        if (unlocked) track('meta_unlock', { type: 'level', id: String(level) });
      },
      unlockTower: (type) => {
        let unlocked = false;
        set((st) => {
          if (st.unlockedTowers.includes(type)) return st;
          unlocked = true;
          return { ...st, unlockedTowers: [...st.unlockedTowers, type] };
        });
        if (unlocked) track('meta_unlock', { type: 'tower', id: type });
      },
      setStars: (level, stars) => {
        let prevStars: 0 | 1 | 2 | 3 = 0;
        let updated = false;
        set((st) => {
          const prev = (st.stars[level] ?? 0) as 0 | 1 | 2 | 3;
          if (stars > prev) {
            prevStars = prev;
            updated = true;
            return { ...st, stars: { ...st.stars, [level]: stars } };
          }
          return st;
        });
        if (updated) {
          track('stars_update', {
            level_id: level,
            mode: 'normal',
            stars_before: prevStars,
            stars_after: stars,
          });
        }
      },
      setEliteStars: (level, stars) => {
        let prevStars: 0 | 1 | 2 | 3 = 0;
        let updated = false;
        set((st) => {
          const prev = (st.eliteStars[level] ?? 0) as 0 | 1 | 2 | 3;
          if (stars > prev) {
            prevStars = prev;
            updated = true;
            return { ...st, eliteStars: { ...st.eliteStars, [level]: stars } };
          }
          return st;
        });
        if (updated) {
          track('stars_update', {
            level_id: level,
            mode: 'elite',
            stars_before: prevStars,
            stars_after: stars,
          });
        }
      },
      addResearchPoints: (amount) =>
        set((st) => ({ ...st, researchPoints: st.researchPoints + amount })),
      unlockResearch: (id) =>
        set((st) =>
          st.unlockedResearch.includes(id)
            ? st
            : { ...st, unlockedResearch: [...st.unlockedResearch, id] },
        ),
      buyResearch: (id) => {
        let success = false;
        let cost = 0;
        let rpBefore = 0;
        let rpAfter = 0;
        set((st) => {
          if (st.unlockedResearch.includes(id)) return st;
          const node = getResearchNode(id);
          if (st.researchPoints < node.cost) return st;
          if (!canUnlockResearch(node, st.unlockedResearch)) return st;
          success = true;
          cost = node.cost;
          rpBefore = st.researchPoints;
          rpAfter = st.researchPoints - node.cost;
          return {
            ...st,
            researchPoints: rpAfter,
            unlockedResearch: [...st.unlockedResearch, id],
          };
        });
        if (success) {
          track('research_purchase', { id, cost, rp_before: rpBefore, rp_after: rpAfter });
          track('meta_unlock', { type: 'research', id });
        }
        return success;
      },
      resetResearch: () => {
        let success = false;
        let actualRefund = 0;
        let actualCost = 0;
        let rpBefore = 0;
        let rpAfter = 0;
        let removedIds: string[] = [];
        set((st) => {
          const isFirstReset = st.researchResetCount === 0;
          const cost = isFirstReset ? 0 : 1;
          // 退还所有非 default 已购节点的 cost
          const refund = st.unlockedResearch.reduce((sum, id) => {
            const node = RESEARCH_NODES.find((n) => n.id === id);
            if (!node || node.defaultUnlocked) return sum;
            return sum + node.cost;
          }, 0);
          // 检查 cost 能否从 (现 RP + refund) 中扣出
          if (st.researchPoints + refund < cost) return st;
          success = true;
          actualRefund = refund;
          actualCost = cost;
          rpBefore = st.researchPoints;
          rpAfter = st.researchPoints + refund - cost;
          removedIds = st.unlockedResearch.filter((rid) => {
            const node = RESEARCH_NODES.find((n) => n.id === rid);
            return node !== undefined && !node.defaultUnlocked;
          });
          return {
            ...st,
            researchPoints: rpAfter,
            unlockedResearch: defaultUnlockedResearch(),
            researchResetCount: st.researchResetCount + 1,
          };
        });
        if (success) {
          track('research_reset', {
            cost: actualCost,
            refund: actualRefund,
            removed_ids: removedIds,
            rp_before: rpBefore,
            rp_after: rpAfter,
          });
        }
        return { ok: success, refund: actualRefund, cost: actualCost };
      },
      updateSettings: (partial) => {
        // 抓 before 用于 setting_change 埋点；只发真改了值的 key
        let before: Settings | null = null;
        set((st) => {
          before = st.settings;
          return { ...st, settings: { ...st.settings, ...partial } };
        });
        if (before) {
          const beforeSnap: Settings = before;
          for (const k of Object.keys(partial) as (keyof Settings)[]) {
            const valueAfter = partial[k];
            if (valueAfter === undefined) continue;
            const valueBefore = beforeSnap[k];
            if (valueBefore === valueAfter) continue;
            track('setting_change', {
              key: k,
              value_before: valueBefore as string | number | boolean | null,
              value_after: valueAfter as string | number | boolean | null,
            });
          }
        }
      },
      setTutorialStep: (step) => set((st) => ({ ...st, tutorialStep: step })),
      markTutorialCompleted: () =>
        set((st) => (st.tutorialCompleted ? st : { ...st, tutorialCompleted: true })),
      acknowledgeMigration: () => set((st) => ({ ...st, freshlyMigrated: false })),
      markMechanicsSeen: (ids) =>
        set((st) => {
          if (ids.length === 0) return st;
          const merged = new Set<GameMechanic>(st.seenMechanics);
          for (const id of ids) merged.add(id);
          if (merged.size === st.seenMechanics.length) return st;
          return { ...st, seenMechanics: Array.from(merged) };
        }),
      setLoadout: (l) => set((st) => ({ ...st, loadout: [...l] })),
      setOwnerUserId: (id) => set((st) => ({ ...st, ownerUserId: id })),
      addCredits: (amount) =>
        set((st) => (amount > 0 ? { ...st, credits: st.credits + amount } : st)),
      unlockSkin: (type, skinId, cost) => {
        let ok = false;
        set((st) => {
          if (st.credits < cost) return st;
          const list = st.unlockedSkins[type] ?? [];
          if (list.includes(skinId)) return st;
          ok = true;
          return {
            ...st,
            credits: st.credits - cost,
            unlockedSkins: { ...st.unlockedSkins, [type]: [...list, skinId] },
          };
        });
        return ok;
      },
      equipSkin: (type, skinId) =>
        set((st) => ({
          ...st,
          equippedSkins: { ...st.equippedSkins, [type]: skinId },
        })),
      unlockAll: () =>
        set((st) => ({
          ...st,
          unlockedLevels: [...ALL_LEVEL_IDS],
          unlockedTowers: [...ALL_TOWERS],
        })),
      resetProgress: () =>
        set((st) => ({
          ...st,
          unlockedLevels: [0, 1],
          unlockedTowers: ['macrophage'],
          stars: {},
          eliteStars: {},
          researchPoints: 0,
          unlockedResearch: defaultUnlockedResearch(),
          researchResetCount: 0,
          tutorialStep: 0,
          tutorialCompleted: false,
          freshlyMigrated: false,
          seenMechanics: [],
          loadout: [],
          ownerUserId: null,
          credits: 0,
          unlockedSkins: {},
          equippedSkins: {},
        })),
    }),
    {
      name: META_STORAGE_KEY,
      version: 13,
      migrate: (persistedState, version) => migrateMetaState(persistedState, version),
      // 不显式注入 storage：走 zustand 默认 localStorage。
      //
      // 决策：曾尝试走 platform.storage（StorageAdapter）实现"未来 wx 端切 wx.setStorageSync"，
      // 但 zustand 的 hydration 在模块顶层 create() 时同步触发，调用 storage factory →
      // getAdapters() 抛错（install 还没跑）→ zustand 退化到 noop storage 静默丢首次读档。
      // 微信小游戏的标准 polyfill（weapp-adapter）已经把 wx.setStorageSync 垫成 localStorage，
      // 所以 zustand 默认行为在 wx 端也能 work，这层抽象多余。
      // StorageAdapter 接口仍保留给非 zustand 持久化场景（如手写的 progressSync 缓存）。
    },
  ),
);

if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  (window as unknown as Record<string, unknown>).__stores = {
    game: useGameStore,
    ui: useUiStore,
    meta: useMetaStore,
  };
}
