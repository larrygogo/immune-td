import type { DeviceAdapter } from '@/platform/types';
import { webStorage } from './storage.web';

const KEY = 'immune_device_id';

/**
 * H5 Device 实现：UUID v4 + localStorage 持久化。
 * insecure context（非 HTTPS 且非 localhost）下 crypto.randomUUID 不可用，
 * 退化到 fallback-{ts}-{rand}-{rand}（server schema 仅校验长度，允许该形式）。
 *
 * 与现有 deviceIdStore 共享同一个 KEY，确保跨版本不丢设备身份。
 */
function generate(): string {
  const cryptoRef = typeof crypto !== 'undefined' ? crypto : undefined;
  if (typeof cryptoRef?.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }
  return `fallback-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export const webDevice: DeviceAdapter = {
  getDeviceId(): string {
    let id = webStorage.get(KEY);
    if (id) return id;
    id = generate();
    webStorage.set(KEY, id);
    return id;
  },
  getPlatform() {
    return 'web';
  },
};
