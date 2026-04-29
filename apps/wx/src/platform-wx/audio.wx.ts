import type { AudioAdapter } from '@/platform/types';

declare const wx: any;

/**
 * wx 端 AudioAdapter：用 wx.createInnerAudioContext。
 * spike 阶段 stub —— sfx/bgm 完整实装见 Task T1.6（spec §4.2 / §4.4）。
 * 当前只满足接口，不实际播放，避免 boot 时 audio 资源加载阻塞 spike 验证。
 */
export const wxAudio: AudioAdapter = {
  preload(key, src) {
    console.log('[wxAudio] preload (stub)', key, src);
    return Promise.resolve();
  },
  playSfx(key, _opts) {
    console.log('[wxAudio] playSfx (stub)', key);
  },
  playBgm(key, _opts) {
    console.log('[wxAudio] playBgm (stub)', key);
  },
  stopBgm() {
    console.log('[wxAudio] stopBgm (stub)');
  },
  setMasterVolume(v) {
    console.log('[wxAudio] setMasterVolume (stub)', v);
  },
};
