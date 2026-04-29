/*!
 * Immune TD - 微信小游戏入口
 * Copyright (c) 2026 Larry. All Rights Reserved.
 */
// 加载顺序至关重要（ES module spec：import 按声明顺序执行 side effects）：
//   1. wx-bootstrap：抢主 canvas + 注入 weapp-adapter（Image/XMLHttpRequest 等）
//   2. phaser：此时浏览器 API 已就绪，Phaser 设备探测不会拿到 undefined
//   3. main.wx.ts 主体：new Phaser.Game 复用主 canvas
import { mainCanvas, mainCtx } from './wx-bootstrap';
import * as Phaser from 'phaser';

declare const wx: any;

// wx 端 Phaser Text 高分辨率适配
//
// 问题：微信 Canvas 2D 的 ctx.fillText / strokeText 不响应 ctx.scale()，导致 Phaser 的
// setResolution(DPR) 机制失效（文字只占 1/3 canvas，周围留白，最终显示缩小 3×）。
// 修复：对简单文本（无 wordWrap / letterSpacing / rtl）在 updateText 后手动放大绘制参数，
// 创建真正的高分辨率内部 canvas，恢复 Retina 清晰度。
const _DPR = (globalThis as any).devicePixelRatio || 1;
if (_DPR > 1) {
  const TextProto = (Phaser.GameObjects.Text as any).prototype;
  const origUpdateText = TextProto.updateText;

  TextProto.updateText = function () {
    const style = this.style;
    const res = style.resolution;
    if (res <= 1) return origUpdateText.call(this);

    // wordWrap / rtl / maxLines 暂不支持高分辨率重绘（回退 1x，避免错乱）
    // letterSpacing 通过逐字符渲染支持（见下方渲染循环），不再回退
    const hasUnsupported =
      (style.wordWrapWidth > 0) ||
      (style.wordWrapCallback != null) ||
      (style.rtl) ||
      (style.maxLines > 0);

    if (hasUnsupported) {
      style.resolution = 1;
      origUpdateText.call(this);
      style.resolution = res;
      return this;
    }

    // 先以 resolution=1 计算尺寸，获得正确的 width / height 和 1x canvas
    style.resolution = 1;
    origUpdateText.call(this);
    style.resolution = res;

    const w = this.canvas.width;
    const h = this.canvas.height;

    // 直接放大原 canvas buffer（改变尺寸会清空内容，但保留对象引用，
    // 这样 frame.source.image 无需手动同步）
    this.canvas.width = w * res;
    this.canvas.height = h * res;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return this;
    this.context = ctx;

    // --- 样式同步（放大 DPR 倍）---
    const origFont = (style as any)._font as string;
    const fontSizeMatch = origFont.match(/(\d+(\.\d+)?)px/);
    if (!fontSizeMatch || !fontSizeMatch[1]) return this;
    const origFontSize = parseFloat(fontSizeMatch[1]);
    ctx.font = origFont.replace(`${origFontSize}px`, `${origFontSize * res}px`);
    ctx.fillStyle = style.color;
    ctx.textBaseline = 'alphabetic';

    // stroke
    const strokeThickness = style.strokeThickness * res;

    // metrics & layout：用 Phaser 已计算的 style.metrics（基于 testString，比测 'M' 更能覆盖中文高度）
    const metrics = style.metrics;
    const ascent = (metrics.ascent || origFontSize * 0.8) * res;
    const lineSpacing = this.lineSpacing * res;
    const lineHeight = (metrics.fontSize + style.strokeThickness) * res + lineSpacing;

    const padding = this.padding;
    const padLeft = padding.left * res;
    const padTop = padding.top * res;
    const padRight = padding.right * res;

    // letterSpacing 像素值（按 res 放大）。> 0 时走逐字符渲染路径
    const ls = (this.letterSpacing || 0) * res;
    const lines = ((this as any)._text as string).split(/\r\n|\r|\n/);

    const setShadow = (apply: boolean): void => {
      if (apply) {
        ctx.shadowColor = style.shadowColor;
        // shadowBlur 不受 ctx.scale 影响（始终按设备像素），故不乘 res
        ctx.shadowBlur = style.shadowBlur;
        ctx.shadowOffsetX = style.shadowOffsetX * res;
        ctx.shadowOffsetY = style.shadowOffsetY * res;
      } else {
        ctx.shadowColor = 'rgba(0,0,0,0)';
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      let x = padLeft + strokeThickness / 2;

      // 整行宽度（含 letterSpacing：n 字符之间 n-1 个 spacing）
      const chars = Array.from(line);
      const charWidths = chars.map((ch) => ctx.measureText(ch).width);
      let lineW = charWidths.reduce((a, b) => a + b, 0);
      if (ls !== 0 && chars.length > 1) lineW += (chars.length - 1) * ls;

      if (style.align === 'center') {
        x = (this.canvas.width - lineW) / 2;
      } else if (style.align === 'right') {
        x = this.canvas.width - padRight - lineW - strokeThickness / 2;
      }

      const y = padTop + strokeThickness / 2 + i * lineHeight + ascent;

      // 逐字符画 helper（letterSpacing > 0 用；spacing == 0 也兼容，少一次 measureText 走整行快路径）
      const drawChars = (op: 'fill' | 'stroke'): void => {
        let cx = x;
        for (let ci = 0; ci < chars.length; ci++) {
          const ch = chars[ci];
          const cw = charWidths[ci] ?? 0;
          if (ch == null) continue;
          if (op === 'stroke') ctx.strokeText(ch, cx, y);
          else ctx.fillText(ch, cx, y);
          cx += cw + ls;
        }
      };

      if (strokeThickness > 0) {
        setShadow(style.shadowStroke);
        ctx.lineWidth = strokeThickness;
        ctx.strokeStyle = style.stroke;
        if (ls === 0) ctx.strokeText(line, x, y);
        else drawChars('stroke');
      }

      setShadow(style.shadowFill);
      ctx.fillStyle = style.color;
      if (ls === 0) ctx.fillText(line, x, y);
      else drawChars('fill');
    }

    // 同步 frame 尺寸与 resolution
    // Phaser 3.x TextureSource 没有 updateSize(...)（v4 才加），直接赋值 width/height
    this.frame.setSize(this.canvas.width, this.canvas.height);
    const source = this.frame.source as any;
    source.width = this.canvas.width;
    source.height = this.canvas.height;
    source.resolution = res;
    this.frame.updateUVs();

    return this;
  };

  console.log('[main.wx] patched Phaser Text updateText for WX high-DPI, DPR=', _DPR);
}
import { BootScene } from '@engine/scenes/BootScene';
import { EncyclopediaScene } from '@engine/scenes/EncyclopediaScene';
import { EquipScene } from '@engine/scenes/EquipScene';
import { GameScene } from '@engine/scenes/GameScene';
import { HealthAdvisoryScene } from '@engine/scenes/HealthAdvisoryScene';
import { LevelBriefingScene } from '@engine/scenes/LevelBriefingScene';
import { LevelSelectScene } from '@engine/scenes/LevelSelectScene';
import { LoadoutScene } from '@engine/scenes/LoadoutScene';
import { MainMenuScene } from '@engine/scenes/MainMenuScene';
import { ReplayListScene } from '@engine/scenes/ReplayListScene';
import { ResearchScene } from '@engine/scenes/ResearchScene';
import { SettingsScene } from '@engine/scenes/SettingsScene';
import { ShopScene } from '@engine/scenes/ShopScene';
import { SplashScene } from '@engine/scenes/SplashScene';
import { HEX } from '@engine/style';
import { useMetaStore } from '@ui/store';
import { installAdapters } from '@/platform';
import { wxAudio, wxDevice, wxNetwork, wxStorage } from '@/platform/wx';
import { installShell } from '@immune-td/core/shell';
import { apiFetch } from '@ui/apiClient';
import { displayName, useAuthStore } from '@ui/authStore';

// 安装 wx 平台 adapter，让 apiClient / metaStore / sfx 业务层有 wx 实现可用
installAdapters({
  storage: wxStorage,
  network: wxNetwork,
  audio: wxAudio,
  device: wxDevice,
});
console.log('[main.wx] platform adapters installed (wx)');

// core shell 注入（与 H5 同；wx 端 BootScene 强登录依赖 shell.authStore）
installShell({
  apiFetch,
  authStore: useAuthStore,
  displayName,
});

console.log('[main.wx] Phaser v', Phaser.VERSION);

try {
  const s = useMetaStore.getState();
  console.log(
    '[main.wx] metaStore ok, unlockedLevels=',
    s.unlockedLevels?.length,
    'stars=',
    Object.keys(s.stars || {}).length,
    'deviceId=',
    wxDevice.getDeviceId().slice(0, 8) + '...',
  );
} catch (e) {
  console.error('[main.wx] metaStore FAIL:', e);
}

const _wxGame = new Phaser.Game({
  type: Phaser.CANVAS,
  canvas: mainCanvas as unknown as HTMLCanvasElement,
  context: mainCtx as unknown as CanvasRenderingContext2D,
  width: mainCanvas.width,
  height: mainCanvas.height,
  backgroundColor: HEX.bgDeep,
  scale: {
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.NO_CENTER,
  },
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: false,
  },
  input: {
    mouse: { target: globalThis.document as unknown as HTMLElement },
    touch: { target: globalThis.document as unknown as HTMLElement },
    keyboard: false,
    gamepad: false,
  } as Phaser.Types.Core.InputConfig,
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
    ReplayListScene,
    ShopScene,
    EquipScene,
  ],
});

// wx canvas 不实现 addEventListener；Phaser 配置 input.touch.target=document 实测没生效。
// 同步装 manual bridge（不等 ready event，wx 引擎下 ready event 可能不触发）：
// 直接 wx.onTouch → game.input.{onTouchStart,...} 把 wx 原生 event 喂给 Phaser InputManager。
{
  const inputMgr: any = (_wxGame as any).input;
  if (inputMgr) {
    // 把 wx event 转成 DOM TouchEvent-like 对象（Phaser 期待 pageX/pageY/target/
    // preventDefault 等字段；wx 原生 event 缺这些，silent fail）
    const toDomEvent = (wxEvent: any, type: string): any => {
      const wxTouches = wxEvent.changedTouches || [];
      const changedTouches = [];
      for (let i = 0; i < wxTouches.length; i++) {
        const t = wxTouches[i];
        if (!t) continue;
        changedTouches.push({
          identifier: t.identifier ?? 0,
          clientX: t.clientX ?? 0,
          clientY: t.clientY ?? 0,
          pageX: t.clientX ?? 0,
          pageY: t.clientY ?? 0,
          screenX: t.clientX ?? 0,
          screenY: t.clientY ?? 0,
          radiusX: t.radiusX ?? 1,
          radiusY: t.radiusY ?? 1,
          force: t.force ?? 0.5,
          target: mainCanvas,
        });
      }
      return {
        type,
        target: mainCanvas,
        currentTarget: mainCanvas,
        changedTouches,
        touches: wxEvent.touches ?? [],
        targetTouches: wxEvent.targetTouches ?? [],
        timeStamp: wxEvent.timeStamp ?? Date.now(),
        preventDefault: () => {},
        stopPropagation: () => {},
        isPrimary: true,
      };
    };
    if (typeof inputMgr.onTouchStart === 'function') {
      wx.onTouchStart((e: any) => {
        try {
          inputMgr.onTouchStart(toDomEvent(e, 'touchstart'));
        } catch (err) {
          console.error('[bridge] onTouchStart throw:', (err as Error).message);
        }
      });
    }
    if (typeof inputMgr.onTouchMove === 'function') {
      wx.onTouchMove((e: any) => {
        try {
          inputMgr.onTouchMove(toDomEvent(e, 'touchmove'));
        } catch (err) {
          console.error('[bridge] onTouchMove throw:', (err as Error).message);
        }
      });
    }
    if (typeof inputMgr.onTouchEnd === 'function') {
      wx.onTouchEnd((e: any) => {
        try {
          inputMgr.onTouchEnd(toDomEvent(e, 'touchend'));
          // Phaser InputManager 处理了 pointer state 但 InputPlugin 没把 event 派发到
          // scene level（wx 端 InputPlugin queue 转发可能链断）。手动 emit 到所有
          // active scene 的 input plugin。
          const p = inputMgr.activePointer;
          if (p) {
            _wxGame.scene.scenes.forEach((scene: any) => {
              if (scene?.scene?.isActive?.() && scene.input?.emit) {
                scene.input.emit('pointerup', p, []);
              }
            });
          }
        } catch (err) {
          console.error('[bridge] onTouchEnd throw:', (err as Error).message);
        }
      });
    }
    // pointerdown / pointermove 同样手动 emit，确保 GameScene 拖塔流程闭环
    const emitToActiveScenes = (eventName: string): void => {
      const p = inputMgr.activePointer;
      if (!p) return;
      _wxGame.scene.scenes.forEach((scene: any) => {
        if (scene?.scene?.isActive?.() && scene.input?.emit) {
          scene.input.emit(eventName, p, []);
        }
      });
    };
    if (typeof inputMgr.onTouchStart === 'function') {
      const _origStart = wx.onTouchStart;
      // 已经在前面注册过 wx.onTouchStart 一次（toDomEvent + inputMgr.onTouchStart）；
      // 再注册一次只 emit scene event。多个 wx.onTouchStart 是叠加注册不覆盖。
      _origStart.call(wx, () => emitToActiveScenes('pointerdown'));
    }
    if (typeof inputMgr.onTouchMove === 'function') {
      const _origMove = wx.onTouchMove;
      _origMove.call(wx, () => emitToActiveScenes('pointermove'));
    }
    if (typeof inputMgr.onTouchCancel === 'function') {
      wx.onTouchCancel((e: any) => {
        try {
          inputMgr.onTouchCancel(toDomEvent(e, 'touchcancel'));
        } catch (err) {
          console.error('[bridge] onTouchCancel throw:', (err as Error).message);
        }
      });
    }
    console.log('[main.wx] manual bridge installed (sync, no ready wait)');
  } else {
    console.error('[main.wx] inputMgr is undefined — bridge install failed');
  }
}
