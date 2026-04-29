import type Phaser from 'phaser';
import { useEffect, useRef } from 'react';
import { bgm } from '@audio/bgm';
import { sfx } from '@audio/sfx';
import { LoginModal } from './ui/LoginModal';
import { NicknameModal } from './ui/NicknameModal';
import { useMetaStore } from '@ui/store';

/**
 * 极简 App：只挂载 Phaser canvas 容器。所有视觉/交互/Modal 都在 Phaser Scenes 里。
 * React 仅做生命周期 + Zustand→Howler 音量同步桥。
 *
 * Phaser 走 dynamic import：1.3MB 的 phaser chunk 不再阻塞 React 首帧渲染，
 * index.html 的 boot-loader 动画能在 HTML 解析完立即显示（省 0.5-2s FCP），
 * 之后后台下载 Phaser → 实例化 → BootScene/Splash 接管。
 */
export function App() {
  const ref = useRef<HTMLDivElement>(null);
  const settings = useMetaStore((s) => s.settings);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let game: Phaser.Game | null = null;
    let cancelled = false;
    void import('@engine/init').then(({ createPhaserGame }) => {
      // 卸载 race：如果 effect cleanup 先跑（rare，StrictMode double-invoke 会触发），
      // 别再创建 game；否则 leak 一个永不销毁的 Phaser 实例
      if (cancelled) return;
      game = createPhaserGame(el);
    });
    return () => {
      cancelled = true;
      game?.destroy(true);
    };
  }, []);

  // settings 变化同步音量
  useEffect(() => {
    sfx.setVolume(settings.sfxVolume);
    sfx.setMuted(settings.muted);
    bgm.setVolume(settings.bgmVolume);
    bgm.setMuted(settings.muted);
  }, [settings.sfxVolume, settings.bgmVolume, settings.muted]);

  return (
    <>
      <div
        ref={ref}
        aria-label="game-canvas"
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      />
      <LoginModal />
      <NicknameModal />
    </>
  );
}
