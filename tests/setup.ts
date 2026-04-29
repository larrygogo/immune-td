// Global test setup. Extend as needed (e.g., mock Howler, canvas).
import { afterEach, beforeEach, vi } from 'vitest';
import { _resetAdaptersForTests, installAdapters } from '@/platform';
import { webAudio } from '@/platform/web/audio.web';
import { webDevice } from '@/platform/web/device.web';
import { webNetwork } from '@/platform/web/network.web';
import { webStorage } from '@/platform/web/storage.web';

// 测试默认装 web adapters，让 jsdom 下的 fetch / localStorage stub 仍能工作。
// 想要测专门的 mock network / storage 的用例可以先 _resetAdaptersForTests() 再 install 自定义的。
beforeEach(() => {
  localStorage.clear();
  _resetAdaptersForTests();
  installAdapters({
    storage: webStorage,
    network: webNetwork,
    audio: webAudio,
    device: webDevice,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});
