import type { StorageAdapter } from '@/platform/types';

declare const wx: any;

/**
 * wx 端 StorageAdapter：用 wx.{set,get,remove}StorageSync。
 * weapp-adapter 已经把 localStorage 垫成 wx storage（zustand 直接走 localStorage 也 OK），
 * 这层显式接口给非 zustand 的 platform.storage 用户（progressSync 缓存等）。
 */
export const wxStorage: StorageAdapter = {
  get(key) {
    try {
      const v = wx.getStorageSync(key);
      return v === '' || v == null ? null : String(v);
    } catch {
      return null;
    }
  },
  set(key, value) {
    wx.setStorageSync(key, value);
  },
  remove(key) {
    wx.removeStorageSync(key);
  },
};
