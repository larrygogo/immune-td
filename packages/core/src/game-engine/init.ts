import * as Phaser from 'phaser';
import { installAudioUnlock } from '@audio/unlock';
import { getShell } from '../shell';
import { DPR } from './dpr';
import { setFitScale } from './fit-scale';
import { DESIGN_H, DESIGN_W } from './layout/design-resolution';
import { BootScene } from './scenes/BootScene';
import { EncyclopediaScene } from './scenes/EncyclopediaScene';
import { EquipScene } from './scenes/EquipScene';
import { GameScene } from './scenes/GameScene';
import { HealthAdvisoryScene } from './scenes/HealthAdvisoryScene';
import { LevelBriefingScene } from './scenes/LevelBriefingScene';
import { LevelSelectScene } from './scenes/LevelSelectScene';
import { LoadoutScene } from './scenes/LoadoutScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { ReplayListScene } from './scenes/ReplayListScene';
import { ResearchScene } from './scenes/ResearchScene';
import { SettingsScene } from './scenes/SettingsScene';
import { ShopScene } from './scenes/ShopScene';
import { SplashScene } from './scenes/SplashScene';
import { TutorialScene } from './scenes/TutorialScene';
import { ButtonLabScene } from './scenes/dev/ButtonLabScene';
import { HEX } from './style';

/**
 * 固定设计图 + 双策略适配（参考 Cocos design resolution）。
 * DESIGN_W × DESIGN_H = 390 × 844（iPhone 13/14 / Pixel 5 竖屏，9:19.5）。
 *
 * 路由原则：竖屏（设备 aspect ≥ 1.0，含 iOS Safari 地址栏吃掉一截后变扁的状态）
 * 全部走 FIXED_WIDTH 充满，scene 用 anchor pattern 自适应变化的 cssH；只有真正的
 * 横屏 / 桌面（aspect < 1.0）才走 letterbox 兜底。
 *
 * 之前用 `deviceAspect ≥ designAspect × 0.9 = 1.95` 阈值偏严：iOS Safari 底部地址栏
 * 占 ~150 px 导致 visual viewport 变 393×695 (aspect=1.77 < 1.95) 误判为短屏走
 * letterbox，产生左右黑边。竖屏永远 FIXED_WIDTH 才符合直觉。
 *
 * FIXED_WIDTH：
 *   - 锁定 design 宽 = 390，scene 看到 cssW = 390 永远固定
 *   - scene 看到 cssH 按设备实际可用高度算（iPhone 14 全屏=844, 带地址栏=695,
 *     iPhone Pro Max=~845, Galaxy S20=~867）
 *   - canvas CSS 充满 winW × winH，没有上下左右黑边
 *   - scene 必须用 anchor pattern 排版（顶/底 anchor + 中心），cover [600, 950]
 *     范围的 cssH 不挤死不浪费
 *
 * letterbox：
 *   - canvas 等比缩放居中，四周露出黑色 letterbox
 *   - scene 看到 cssW=390 / cssH=844 完全固定
 *
 * Phaser internal buffer = canvas CSS × DPR（设备物理像素），保证 PC / Retina 不模糊。
 * 这要求 px(n) = n × DPR × fitScale（见 style.ts），fitScale = canvas CSS w / DESIGN_W。
 * scene 用 px(DESIGN_W) 输出 = bufferW，恰好充满，浏览器无需上采样。
 */
export const VIEWPORT_MAX_CSS_W = DESIGN_W;
export const VIEWPORT_MAX_CSS_H = DESIGN_H;

/**
 * 全局 patch Phaser.GameObjectFactory.text：所有 `scene.add.text(...)` 自动带
 * setResolution(DPR)，让 Text 在 Retina 屏按高 DPI 渲染（避免 buffer 1× 上采样
 * 导致的字糊）。一处 patch 让全游戏 120+ callsite 自动清晰，无需逐 scene 改。
 *
 * 时机：模块 import 时（在 createPhaserGame 之前）就 patch，所有 scene 启动后
 * add.text 都生效。`if (!__patched)` 守护防 HMR 重 patch 让 setResolution 套娃。
 */
const factoryProto = Phaser.GameObjects.GameObjectFactory.prototype as unknown as {
  text: (
    x: number,
    y: number,
    text: string | string[],
    style?: Phaser.Types.GameObjects.Text.TextStyle,
  ) => Phaser.GameObjects.Text;
  __crispTextPatched?: boolean;
};
if (!factoryProto.__crispTextPatched) {
  const origText = factoryProto.text;
  factoryProto.text = function (
    x: number,
    y: number,
    text: string | string[],
    style?: Phaser.Types.GameObjects.Text.TextStyle,
  ): Phaser.GameObjects.Text {
    const t = origText.call(this, x, y, text, style);
    t.setResolution(DPR);
    return t;
  };
  factoryProto.__crispTextPatched = true;
}

/**
 * 视口尺寸读取（iOS Safari 黑边修法）：
 *
 * 反直觉关键事实：iOS Safari WebKit 实现里，JS 拿到的 `window.innerHeight` 和
 * `document.documentElement.clientHeight` **都等于 visual viewport**（不含动态地址栏
 * / toolbar），但 **CSS 的 100vh = layout viewport**（全屏）。这是众所周知的 100vh
 * bug 反向版 — 想从 JS 拿到 layout viewport 必须经 CSS。
 *
 * 解法：global.css 让 html/body 用 `height: 100vh; height: 100dvh;` 撑到 layout
 * viewport，再从 `body.getBoundingClientRect().height` 读出 CSS 渲染后的真实像素
 * （= 100vh 实际值 = 全屏高）。canvas 跟着 body 一样高，上下不出黑边。
 *
 * dvh 现代浏览器（iOS 15.4+ / Chrome 108+）会按 toolbar 实时联动；老浏览器降级
 * 到 100vh = layout viewport，仍能全屏（只是 toolbar 不联动）。Math.max 保险位是
 * 极少数容器（dev tools 自定义 frame 等）body 报 0 时回退 innerHeight。
 */
function viewportPx(): { winW: number; winH: number } {
  const body = typeof document !== 'undefined' ? document.body : null;
  const bodyRect = body?.getBoundingClientRect();
  const winW = Math.max(window.innerWidth, bodyRect?.width ?? 0);
  const winH = Math.max(window.innerHeight, bodyRect?.height ?? 0);
  return { winW, winH };
}

/**
 * 综合视口：算出 fitScale + canvas CSS 尺寸 + Phaser buffer 物理尺寸。
 * - FIXED_WIDTH（手机正常竖屏）：canvas 充满 winW×winH 无黑边，cssH 随设备延伸
 * - SHOW_ALL（桌面 / 平板 / 横屏短屏）：canvas 等比缩放居中，四周 letterbox
 *
 * fitScale 写入 fit-scale 模块给 px() 用；buffer 永远 = canvas CSS × DPR 保证清晰。
 */
function computeViewport(): {
  fitScale: number;
  canvasCssW: number;
  canvasCssH: number;
  bufferW: number;
  bufferH: number;
} {
  const { winW, winH } = viewportPx();
  const deviceAspect = winH / winW;

  let fitScale: number;
  let canvasCssW: number;
  let canvasCssH: number;

  if (deviceAspect >= 1.0) {
    // 竖屏：FIXED_WIDTH 充满整屏（含地址栏吃掉高度后的"扁竖屏"也走这条）
    fitScale = winW / DESIGN_W;
    canvasCssW = winW;
    canvasCssH = winH;
  } else {
    // 横屏 / 桌面：SHOW_ALL letterbox，scene cssH 固定 = DESIGN_H
    fitScale = Math.min(winW / DESIGN_W, winH / DESIGN_H);
    canvasCssW = DESIGN_W * fitScale;
    canvasCssH = DESIGN_H * fitScale;
  }

  return {
    fitScale,
    canvasCssW,
    canvasCssH,
    bufferW: Math.round(canvasCssW * DPR),
    bufferH: Math.round(canvasCssH * DPR),
  };
}

export function createPhaserGame(parent: HTMLElement): Phaser.Game {
  // 必须在 new Phaser.Game 之前 setFitScale，否则首批 scene 的 class field
  // initializer 调 px() 会用旧 fitScale=1，layout 算错位置。
  const initial = computeViewport();
  setFitScale(initial.fitScale);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    // buffer = canvas CSS × DPR，跟设备物理像素 1:1，避免浏览器上采样模糊。
    // scene 看到的 cssW = bufferW / px(1) = DESIGN_W 永远固定（FIXED_WIDTH 等价于
    // 设计图被等比放大到设备宽度，scene 完全无感）。
    width: initial.bufferW,
    height: initial.bufferH,
    backgroundColor: HEX.bgDeep,
    scale: {
      mode: Phaser.Scale.NONE,
      autoCenter: Phaser.Scale.NO_CENTER,
    },
    render: {
      antialias: true,
      antialiasGL: true,
      pixelArt: false,
      roundPixels: false,
    },
    // BGM 走 Phaser SoundManager，必须启用 audio 子系统（noAudio 会降级为
    // NoAudioSoundManager：sound.add/play 全 no-op，cache.audio 不收东西）。
    // SFX 仍独立走自建 AudioContext，与这里无关。
    audio: { disableWebAudio: false } as Phaser.Types.Core.AudioConfig,
    dom: { createContainer: true },
    scene: [
      BootScene,
      HealthAdvisoryScene,
      SplashScene,
      MainMenuScene,
      LevelSelectScene,
      LevelBriefingScene,
      LoadoutScene,
      EncyclopediaScene,
      ResearchScene,
      SettingsScene,
      GameScene,
      TutorialScene,
      ReplayListScene,
      ShopScene,
      EquipScene,
      ButtonLabScene,
    ],
  });

  // 重新计算视口 + 同步 fitScale + canvas CSS + Phaser buffer。window resize
  // 时调用：手机端通常因浏览器地址栏出现/隐藏触发（winH 变），桌面拖窗口触发。
  const applyViewport = (vp: ReturnType<typeof computeViewport>) => {
    const canvas = game.canvas;
    if (!canvas || !canvas.isConnected) return;
    if (vp.bufferW <= 0 || vp.bufferH <= 0) return;
    setFitScale(vp.fitScale);
    canvas.style.width = `${vp.canvasCssW}px`;
    canvas.style.height = `${vp.canvasCssH}px`;
    // 触发 ScaleManager resize → 所有 scene 的 'resize' 回调跑一遍重 layout。
    // FIXED_WIDTH 模式下 cssH 会随设备变化，scene 必须用 anchor 排版才正确响应。
    try {
      game.scale.resize(vp.bufferW, vp.bufferH);
      game.scale.refresh();
    } catch (err) {
      console.warn('[applyViewport] scale.resize 失败（scene 半销毁竞态，可忽略）:', err);
    }
  };
  game.events.once('ready', () => {
    applyViewport(initial);
    // dev hash 路由：`#button-lab` 跳过启动链直奔 ButtonLabScene
    if (
      typeof window !== 'undefined' &&
      import.meta.env?.DEV &&
      window.location.hash === '#button-lab'
    ) {
      game.scene.stop('BootScene');
      game.scene.start('ButtonLabScene');
    }
  });
  // 全局首次合法 user gesture 解锁两套 AudioContext（触屏下 touchstart/pointerdown
  // 不算 user activation trigger，必须监听 pointerup/touchend/keyup 等）
  installAudioUnlock(game);

  let rafId = 0;
  const scheduleResize = () => {
    if (rafId !== 0) return;
    rafId = window.requestAnimationFrame(applyResize);
  };
  const applyResize = () => {
    rafId = 0;
    if (!game.isBooted || !game.canvas) return;
    if (!game.canvas.isConnected) return;
    if (!game.scale) return;
    applyViewport(computeViewport());
  };
  window.addEventListener('resize', scheduleResize);
  // visualViewport API：iOS Safari toolbar 出现/隐藏时 window.resize 不一定 fire,
  // 但 visualViewport.resize 会 fire（可见区域真实变化）。订阅它兜底动态地址栏。
  window.visualViewport?.addEventListener('resize', scheduleResize);
  // ResizeObserver on body：CSS 100dvh 在 toolbar 状态变化时让 body 高度自动变,
  // 但既不 fire window.resize 也不 fire visualViewport（dvh 是 CSS 层变化）。
  // 用 RO 兜住，保 canvas buffer 跟 body 同步缩放，避免局部模糊或黑边。
  if (typeof ResizeObserver !== 'undefined' && document.body) {
    new ResizeObserver(scheduleResize).observe(document.body);
  }

  if (typeof window !== 'undefined' && import.meta.env?.DEV) {
    const w = window as unknown as Record<string, unknown>;
    w.__phaser = game;
    w.__game = game;
    // side-effect import：挂载 window.__testHelpers（见 src/dev/test-helpers.ts）
    void import('@/dev/test-helpers');
    // 视口诊断 overlay：屏幕右上角 fixed div，实时显示 viewport / canvas 尺寸
    // 关键字段，定位黑边 / 模糊问题。dev only，build 产物零泄露。
    // 默认隐藏；调试时 URL 加 ?vp=1 或 localStorage.setItem('vp','1') 启用。
    const enableVp =
      (typeof location !== 'undefined' && new URLSearchParams(location.search).get('vp') === '1') ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('vp') === '1');
    if (enableVp) {
      void import('@/dev/viewport-overlay').then(({ mountViewportOverlay }) => {
        mountViewportOverlay();
      });
    }
  }

  // 启动后异步 load auth state：有 token 就 GET /api/me 校验并填 user（无 shell 注入则 no-op）
  // 失败（server 不可达 / token 过期）时内部自动清空，不抛错影响启动
  // 同时挂上 progressSync：metaStore 变更 → debounce 2s 自动 PUT（仅登录态）
  void getShell().authStore?.getState().loadFromStorage();
  void import('@ui/progressSync').then(({ installProgressSyncSubscriber }) => {
    installProgressSyncSubscriber();
  });

  return game;
}
