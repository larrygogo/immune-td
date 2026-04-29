import { create } from 'zustand';

/**
 * 首屏加载进度。BootScene 写、SplashScene 订阅显示。
 *
 * BGM 分两轨：menuBgmReady 是"进入游戏"按钮放行的必要条件（进 MainMenu 就放），
 * battleBgmReady 不阻塞按钮（只在进战斗时要），后台继续下载即可。
 */
export interface LoadState {
  spriteProgress: number; // 0..1
  sfxProgress: number;
  menuBgmReady: boolean; // 进 MainMenu 需要
  battleBgmReady: boolean; // 进 GameScene 需要，不阻塞 splash
  fontsReady: boolean;
  setSprite(p: number): void;
  setSfx(p: number): void;
  setMenuBgmReady(b: boolean): void;
  setBattleBgmReady(b: boolean): void;
  setFontsReady(b: boolean): void;
}

export const useLoadStore = create<LoadState>((set) => ({
  spriteProgress: 0,
  sfxProgress: 0,
  menuBgmReady: false,
  battleBgmReady: false,
  fontsReady: false,
  setSprite: (p) => set({ spriteProgress: p }),
  setSfx: (p) => set({ sfxProgress: p }),
  setMenuBgmReady: (b) => set({ menuBgmReady: b }),
  setBattleBgmReady: (b) => set({ battleBgmReady: b }),
  setFontsReady: (b) => set({ fontsReady: b }),
}));

/**
 * 进度条用（4 路均权）：sprite / sfx / menuBgm / fonts。battle.mp3 后台下载
 * 不出现在进度里，避免还没到战场时就让玩家看到"等待 battle 音乐下载"的困惑。
 */
export function aggregateProgress(s: LoadState): number {
  return (s.spriteProgress + s.sfxProgress + (s.menuBgmReady ? 1 : 0) + (s.fontsReady ? 1 : 0)) / 4;
}

/**
 * "进入游戏"按钮放行条件：sprites + menu BGM + sfx + fonts 就绪即可。
 * battle.mp3 在后台继续下载；极端慢网下开战可能有 1-2 秒静音，体感比
 * "splash 卡十秒"好得多。
 */
export function isAllReady(s: LoadState): boolean {
  return s.spriteProgress >= 1 && s.sfxProgress >= 1 && s.menuBgmReady && s.fontsReady;
}
