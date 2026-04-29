/**
 * 设备 ID 管理：转发到 platform.device。
 *
 * H5 实现（platform/web/device.web.ts）：UUID v4 + localStorage 持久化，insecure
 * context 下 fallback 到 Math.random 生成的 fallback-* 形式（server schema 接受）。
 * 未来 wx 实现：openid / unionid。
 *
 * 入口（main.web.tsx）已经 install 了 web adapters，所以模块加载顺序对外不可见，
 * 业务侧继续 `import { getDeviceId } from './deviceIdStore'` 不变。
 */

import { getAdapters } from '@/platform';

export function getDeviceId(): string {
  return getAdapters().device.getDeviceId();
}
