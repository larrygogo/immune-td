/**
 * Playground demo · core 离线裸跑入口
 *
 * 验证 spec § 阶段 6：core 不依赖 server / 账号 / H5 shell 也能完整运行游戏。
 * 注入"零依赖默认 adapter"：memory storage / 拒 network / no-op audio adapter / randomUUID device。
 * 不调 installShell —— core 内 getShell().authStore? 全为 undefined → MainMenu 自动按未登录态降级。
 */

import { installAdapters } from '../../src/platform';
import type {
  AudioAdapter,
  DeviceAdapter,
  NetworkAdapter,
  StorageAdapter,
} from '../../src/platform/types';
import { createPhaserGame } from '../../src/game-engine/init';

// ===== 极简 storage：内存 Map =====
const memStore = new Map<string, string>();
const storage: StorageAdapter = {
  get: (k) => memStore.get(k) ?? null,
  set: (k, v) => {
    memStore.set(k, v);
  },
  remove: (k) => {
    memStore.delete(k);
  },
};

// ===== 极简 network：全拒绝（playground 离线） =====
const network: NetworkAdapter = {
  request: async () => {
    throw new Error('[playground] network disabled');
  },
};

// ===== 极简 audio：no-op（core 调用安全） =====
const audio: AudioAdapter = {
  play: () => {},
  stop: () => {},
  setVolume: () => {},
  setMuted: () => {},
};

// ===== 极简 device：randomUUID + 'web' =====
const device: DeviceAdapter = {
  getDeviceId: () =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `play-${Math.random().toString(36).slice(2, 10)}`,
  getPlatform: () => 'web',
};

installAdapters({ storage, network, audio, device });

// 不调 installShell —— core 自动按未登录态运行（MainMenu 不显示账号区，回放按钮置灰）

const root = document.getElementById('root');
if (!root) {
  throw new Error('#root not found');
}
createPhaserGame(root);
