import type { StorageAdapter } from '@/platform/types';

/**
 * H5 Storage 实现：直接包 localStorage 三方法。
 * 浏览器在 disabled-storage / quota 异常时会抛错；这里不吞，让业务层决定。
 */
export const webStorage: StorageAdapter = {
  get(key) {
    return localStorage.getItem(key);
  },
  set(key, value) {
    localStorage.setItem(key, value);
  },
  remove(key) {
    localStorage.removeItem(key);
  },
};
