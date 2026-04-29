import type { GameMechanic } from '@engine/game/data/levels';
import { apiFetch } from '../apiClient';
import { useAuthStore } from '../authStore';
import { useMetaStore } from '@ui/store';
import { extractSyncable, syncableChanged } from './extract';
import { isSyncableEqual, mergeRemoteIntoLocal } from './merge';
import { CURRENT_PAYLOAD_VERSION, type SyncableProgress } from './types';

interface RemoteProgressResponse {
  progress: SyncableProgress | null;
  payloadVersion?: number;
  updatedAt?: string;
}

/** 与 metaStore.resetProgress / 初始值对齐的干净进度（切账号、新账号兜底） */
const INITIAL_PROGRESS: SyncableProgress = {
  unlockedLevels: [0, 1],
  unlockedTowers: ['macrophage'],
  stars: {},
  eliteStars: {},
  loadout: [],
  seenMechanics: [],
  researchPoints: 0,
  unlockedResearch: [],
  researchResetCount: 0,
  tutorialStep: 0,
  credits: 0,
  unlockedSkins: {},
  equippedSkins: {},
};

async function getRemote(): Promise<RemoteProgressResponse> {
  const res = await apiFetch('/api/progress');
  if (!res.ok) throw new Error(`GET /api/progress ${res.status}`);
  return (await res.json()) as RemoteProgressResponse;
}

async function putRemote(progress: SyncableProgress): Promise<void> {
  const res = await apiFetch('/api/progress', {
    method: 'PUT',
    body: JSON.stringify({ progress, payloadVersion: CURRENT_PAYLOAD_VERSION }),
  });
  if (!res.ok) throw new Error(`PUT /api/progress ${res.status}`);
}

function writeToMetaStore(p: SyncableProgress, ownerUserId: number): void {
  useMetaStore.setState({
    unlockedLevels: [...p.unlockedLevels],
    unlockedTowers: [...p.unlockedTowers],
    stars: { ...p.stars },
    eliteStars: { ...p.eliteStars },
    loadout: [...p.loadout],
    // server 侧 seenMechanics 是宽松 string（不维护前端 GameMechanic 枚举），这里类型收窄回
    seenMechanics: [...p.seenMechanics] as GameMechanic[],
    researchPoints: p.researchPoints,
    unlockedResearch: [...p.unlockedResearch],
    researchResetCount: p.researchResetCount,
    tutorialStep: p.tutorialStep,
    ownerUserId,
  });
}

/**
 * login / register / loadFromStorage 成功后调用。按 spec §3.3 三分支：
 * A. 切账号：丢弃本地，用远端覆盖；远端空则重置到初始默认
 * B. 匿名迁移（prevOwner === null）：远端空推 local；远端有则合并 + 条件 PUT
 * C. 同账号重新登录：合并 + 条件 PUT
 *
 * 网络异常不抛：登录流程不应被进度同步阻断。
 */
export async function onLoginSyncProgress(userId: number): Promise<void> {
  const localState = useMetaStore.getState();
  const local = extractSyncable(localState);
  const prevOwner = localState.ownerUserId;

  let remote: RemoteProgressResponse;
  try {
    remote = await getRemote();
  } catch (err) {
    console.warn('[progressSync] GET 失败，跳过本次同步:', err);
    return;
  }

  // 分支 A：切账号
  if (prevOwner !== null && prevOwner !== userId) {
    if (remote.progress) {
      writeToMetaStore(remote.progress, userId);
    } else {
      writeToMetaStore(INITIAL_PROGRESS, userId);
    }
    return;
  }

  // 分支 B：匿名迁移
  if (prevOwner === null) {
    if (!remote.progress) {
      useMetaStore.setState({ ownerUserId: userId });
      try {
        await putRemote(local);
      } catch (err) {
        console.warn('[progressSync] 匿名迁移 PUT 失败:', err);
      }
      return;
    }
    const merged = mergeRemoteIntoLocal(remote.progress, local);
    writeToMetaStore(merged, userId);
    if (!isSyncableEqual(merged, remote.progress)) {
      try {
        await putRemote(merged);
      } catch (err) {
        console.warn('[progressSync] 匿名合并 PUT 失败:', err);
      }
    }
    return;
  }

  // 分支 C：同账号重新登录（prevOwner === userId）
  if (!remote.progress) {
    useMetaStore.setState({ ownerUserId: userId });
    try {
      await putRemote(local);
    } catch (err) {
      console.warn('[progressSync] 同账号兜底 PUT 失败:', err);
    }
    return;
  }
  const merged = mergeRemoteIntoLocal(remote.progress, local);
  writeToMetaStore(merged, userId);
  if (!isSyncableEqual(merged, remote.progress)) {
    try {
      await putRemote(merged);
    } catch (err) {
      console.warn('[progressSync] 同账号合并 PUT 失败:', err);
    }
  }
}

/** logout 调用。保留 settings，其他同步字段归位 + ownerUserId 清空。 */
export function onLogoutClearProgress(): void {
  useMetaStore.setState({
    unlockedLevels: [...INITIAL_PROGRESS.unlockedLevels],
    unlockedTowers: [...INITIAL_PROGRESS.unlockedTowers],
    stars: {},
    eliteStars: {},
    loadout: [],
    seenMechanics: [],
    researchPoints: 0,
    unlockedResearch: [],
    researchResetCount: 0,
    tutorialStep: 0,
    ownerUserId: null,
    freshlyMigrated: false,
  });
}

// ---- 自动上传 ----
let uploadTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 2000;

export function scheduleUpload(): void {
  if (uploadTimer) clearTimeout(uploadTimer);
  uploadTimer = setTimeout(() => {
    uploadTimer = null;
    if (!useAuthStore.getState().isAuthenticated()) return;
    const snapshot = extractSyncable(useMetaStore.getState());
    putRemote(snapshot).catch((err) => console.warn('[progressSync] 自动 PUT 失败:', err));
  }, DEBOUNCE_MS);
}

/** 挂 metaStore 订阅；只需调一次（init 时）。 */
export function installProgressSyncSubscriber(): () => void {
  return useMetaStore.subscribe((state, prev) => {
    if (!useAuthStore.getState().isAuthenticated()) return;
    if (!syncableChanged(state, prev)) return;
    scheduleUpload();
  });
}

/** 测试用：清除 debounce 定时器 */
export function __resetUploadTimerForTest(): void {
  if (uploadTimer) clearTimeout(uploadTimer);
  uploadTimer = null;
}
