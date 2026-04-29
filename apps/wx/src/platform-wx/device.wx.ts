import type { DeviceAdapter } from '@/platform/types';

declare const wx: any;

const DEVICE_ID_KEY = 'immune-td-device-id';

/**
 * wx 端 DeviceAdapter：deviceId 存 wx storage，首次启动生成 UUID v4。
 * wx.login 拿到的 openid 需要登录后才有，deviceId 是匿名期间的稳定标识。
 */
function uuidV4(): string {
  // wx 没有 crypto.randomUUID，手写 v4
  const r = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${r()}${r()}-${r()}-4${r().slice(0, 3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${r().slice(0, 3)}-${r()}${r()}${r()}`;
}

export const wxDevice: DeviceAdapter = {
  getDeviceId() {
    let id: string | undefined;
    try {
      id = wx.getStorageSync(DEVICE_ID_KEY) || undefined;
    } catch {}
    if (!id) {
      id = uuidV4();
      try {
        wx.setStorageSync(DEVICE_ID_KEY, id);
      } catch {}
    }
    return id;
  },
  getPlatform() {
    return 'wx';
  },
};
