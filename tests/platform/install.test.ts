import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type PlatformAdapters,
  _resetAdaptersForTests,
  getAdapters,
  installAdapters,
} from '@/platform';

const stub: PlatformAdapters = {
  storage: { get: () => null, set: () => {}, remove: () => {} },
  network: {
    request: async <T = unknown>() => ({ status: 200, data: undefined as T }),
  },
  audio: {
    preload: async () => {},
    playSfx: () => {},
    playBgm: () => {},
    stopBgm: () => {},
    setMasterVolume: () => {},
  },
  device: { getDeviceId: () => 'test', getPlatform: () => 'web' },
};

describe('platform/install', () => {
  // 全局 setup 默认会装 web adapters；这组用例需要从干净状态出发
  beforeEach(() => {
    _resetAdaptersForTests();
  });
  afterEach(() => {
    _resetAdaptersForTests();
  });

  it('未 install 时 getAdapters 抛错', () => {
    expect(() => getAdapters()).toThrow(/not installed/);
  });

  it('install 后 getAdapters 返回同一实例', () => {
    installAdapters(stub);
    expect(getAdapters()).toBe(stub);
  });

  it('重复 install 抛错', () => {
    installAdapters(stub);
    expect(() => installAdapters(stub)).toThrow(/already installed/);
  });
});
