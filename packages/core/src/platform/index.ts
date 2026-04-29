/**
 * 平台适配层注入入口。entry（main.web.ts / 未来的 main.wx.ts）必须在 boot() 之前
 * 调一次 installAdapters()；业务层通过 getAdapters() 拿到实现。
 *
 * 显式注入（而非 auto-detect）的好处：测试可以注入 mock；切换平台不需要在业务里 if/else。
 */

import type { PlatformAdapters } from './types';

let installed: PlatformAdapters | null = null;

export function installAdapters(impl: PlatformAdapters): void {
  if (installed) {
    throw new Error('Platform adapters already installed');
  }
  installed = impl;
}

export function getAdapters(): PlatformAdapters {
  if (!installed) {
    throw new Error(
      'Platform adapters not installed; entry must call installAdapters() before boot',
    );
  }
  return installed;
}

/** 仅测试用：清空注入态以便重复 install */
export function _resetAdaptersForTests(): void {
  installed = null;
}

export type {
  AudioAdapter,
  DeviceAdapter,
  NetworkAdapter,
  NetworkRequestOpts,
  NetworkResponse,
  PlatformAdapters,
  StorageAdapter,
} from './types';
