/*!
 * 微信小游戏 boot 阶段 — 必须在 phaser / zustand 等 import 之前执行
 * 1. polyfill：wx 引擎缺 Symbol.for（zustand / 部分库用）
 * 2. wx.createCanvas() 抢主 canvas（必须最早，否则后续拿到 offscreen 不能 getContext 2d）
 * 3. require weapp-adapter 注入 Image/XMLHttpRequest/document/window 等浏览器 API
 */
declare const wx: any;

// === Symbol.for polyfill ===
// wx 小游戏引擎不提供 Symbol.for，zustand 等库依赖
if (typeof Symbol !== 'undefined' && typeof (Symbol as any).for !== 'function') {
  const _registry: Record<string, symbol> = {};
  (Symbol as any).for = function (key: string): symbol {
    let sym = _registry[key];
    if (sym === undefined) {
      sym = Symbol(key);
      _registry[key] = sym;
    }
    return sym;
  };
  (Symbol as any).keyFor = function (sym: symbol): string | undefined {
    for (const k in _registry) if (_registry[k] === sym) return k;
    return undefined;
  };
  console.log('[bootstrap] Symbol.for polyfilled');
}

const _canvas = wx.createCanvas();
const _sys = wx.getSystemInfoSync();
console.log('[bootstrap] wx sysInfo:', JSON.stringify({
  screenWidth: _sys.screenWidth,
  screenHeight: _sys.screenHeight,
  windowWidth: _sys.windowWidth,
  windowHeight: _sys.windowHeight,
  pixelRatio: _sys.pixelRatio,
  platform: _sys.platform,
}));
// 标准 retina 模式：buffer = CSS × DPR，让 ECG / 几何元素物理像素正确
const _dpr = _sys.pixelRatio || 1;
_canvas.width = _sys.windowWidth * _dpr;
_canvas.height = _sys.windowHeight * _dpr;
const _ctx = _canvas.getContext('2d');
console.log('[bootstrap] mainCanvas buffer:', _canvas.width, 'x', _canvas.height);

// 占位画面：在 phaser 接管前不黑屏
_ctx.fillStyle = '#0a0a14';
_ctx.fillRect(0, 0, _canvas.width, _canvas.height);
_ctx.fillStyle = '#7fffd4';
_ctx.font = `${40 * _dpr}px sans-serif`;
_ctx.fillText('Immune TD loading...', 40 * _dpr, 200 * _dpr);
console.log('[bootstrap] canvas', _canvas.width, 'x', _canvas.height, 'dpr=', _dpr);

require('./libs/weapp-adapter/index.js');
console.log('[bootstrap] weapp-adapter ok, Image=', typeof Image);

// 强制设 window/globalThis 的 DPR / 尺寸（weapp-adapter 默认值可能不对）
// 让 src/game-engine/dpr.ts 的 window.devicePixelRatio 拿到正确的 wx 屏幕 DPR
const _wnd = (globalThis as any).window || (globalThis as any);
try {
  // 跟 sysInfo 对齐（让 src/game-engine/dpr.ts 拿到正确的 wx pixelRatio）
  _wnd.devicePixelRatio = _dpr;
  _wnd.innerWidth = _sys.windowWidth;
  _wnd.innerHeight = _sys.windowHeight;
  (globalThis as any).devicePixelRatio = _dpr;
  console.log(
    '[bootstrap] window.devicePixelRatio=',
    _dpr,
    'innerWidth=',
    _sys.windowWidth,
    'innerHeight=',
    _sys.windowHeight,
  );
} catch (e) {
  console.warn('[bootstrap] failed to set window.devicePixelRatio:', (e as Error).message);
}

// patch URL.createObjectURL 兼容 Phaser 3/4 加载图片：
// weapp-adapter 的 xhr.response 是 ArrayBuffer，wx 的 URL.createObjectURL 不接受 ArrayBuffer
// 直接转 base64 data URL，Image.src 接受
const _g = globalThis as any;
const _origCreateURL = _g.URL && _g.URL.createObjectURL;
_g.URL = _g.URL || {};
_g.URL.createObjectURL = function (input: any): string {
  // 取 buffer。weapp-adapter 的 xhr 可能以 binary string / ArrayBuffer / Uint8Array 等形式给数据
  let buf: ArrayBuffer | null = null;
  let mime = 'image/png';
  if (typeof input === 'string') {
    // weapp-adapter 给的 binary string（每 char 一个字节，char code 0..255）
    const bytes = new Uint8Array(input.length);
    for (let i = 0; i < input.length; i++) bytes[i] = input.charCodeAt(i) & 0xff;
    buf = bytes.buffer as ArrayBuffer;
  } else if (input instanceof ArrayBuffer) {
    buf = input;
  } else if (input && typeof input.byteLength === 'number' && input.slice) {
    buf = input as ArrayBuffer;
  } else if (input && input._buffer instanceof ArrayBuffer) {
    buf = input._buffer;
    if (input.type) mime = input.type;
  } else if (input && input.buffer instanceof ArrayBuffer) {
    buf = input.buffer;
    if (input.type) mime = input.type;
  } else if (_origCreateURL) {
    try {
      const url = _origCreateURL.call(_g.URL, input);
      if (url) return url;
    } catch (_) {
      // fallthrough
    }
  }
  if (!buf) {
    console.warn('[bootstrap] createObjectURL: cannot extract buffer from', typeof input, input);
    return 'data:,';
  }
  // ArrayBuffer → base64（chunked 避免 String.fromCharCode 参数过长）
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  let str = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    str += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
  }
  return `data:${mime};base64,${btoa(str)}`;
};
_g.URL.revokeObjectURL = function (_url: string): void {
  // data URL 不需要 revoke
};
console.log('[bootstrap] URL.createObjectURL polyfilled (ArrayBuffer → base64 data URL)');

// === 顶部 / 底部安全区计算 ===
// 顶部安全 = 胶囊底 + 4px 间距（× DPR 转 buffer 像素），一个值兜住状态栏 +
//   iPhone 刘海/灵动岛 + 胶囊（iOS 87×32 / Android 96×32 CSS px，wx 强制存在不能隐藏）
// 底部安全 = screenHeight - safeArea.bottom（iPhone home indicator）
//
// 已知 wx getMenuButtonBoundingClientRect 异常：
// (1) iPhone 15 Pro Max 偶现两种值（灵动岛布局，cap.bottom=46 是合法的）
// (2) 华为鸿蒙首次启动可能返回 width=screenWidth（明显错）
// 校验：bottom > 30 且 width < screenWidth × 0.5；不通过用 fallback。
//
// fallback：statusBarHeight + 40（iOS 上 4 + 胶囊 32 + 下 4；Android 大致同）
let _safeTopCSS = (_sys.statusBarHeight || 20) + 40;
let _safeBottomCSS = 0;
try {
  const _cap = wx.getMenuButtonBoundingClientRect();
  const capValid =
    _cap &&
    typeof _cap.bottom === 'number' &&
    _cap.bottom > 30 &&
    typeof _cap.width === 'number' &&
    _cap.width < _sys.screenWidth * 0.5;
  if (capValid) {
    _safeTopCSS = _cap.bottom + 4;
  } else {
    console.warn(
      '[bootstrap] capsule rect 异常（鸿蒙首次启动 width 可能等于屏宽），fallback statusBar+40。raw:',
      JSON.stringify(_cap),
    );
  }
  if (_sys.safeArea && typeof _sys.safeArea.bottom === 'number') {
    _safeBottomCSS = Math.max(0, _sys.screenHeight - _sys.safeArea.bottom);
  }
} catch (e) {
  console.warn(
    '[bootstrap] getMenuButtonBoundingClientRect failed, using fallback safe area:',
    (e as Error).message,
  );
}
(globalThis as any).__safeArea = {
  top: _safeTopCSS * _dpr,
  bottom: _safeBottomCSS * _dpr,
  topCSS: _safeTopCSS,
  bottomCSS: _safeBottomCSS,
};
console.log(
  '[bootstrap] safeArea (buffer px): top=',
  _safeTopCSS * _dpr,
  'bottom=',
  _safeBottomCSS * _dpr,
  '(CSS top/bottom:',
  _safeTopCSS,
  '/',
  _safeBottomCSS,
  ')',
);

// === document.elementFromPoint polyfill ===
// weapp-adapter 的 document stub 没实现 elementFromPoint。Phaser InputManager 在
// onTouchMove 时调它判断 touch 是否在 game canvas 内（避免响应 canvas 外事件）。
// wx 小游戏整屏都是 game canvas，永远返回主 canvas 即可。
if (_g.document && typeof _g.document.elementFromPoint !== 'function') {
  const _impl = function (_x: number, _y: number): unknown {
    return _canvas;
  };
  let _ok = false;
  try {
    _g.document.elementFromPoint = _impl;
    _ok = _g.document.elementFromPoint === _impl;
  } catch (_) {
    /* read-only fallthrough */
  }
  if (!_ok) {
    try {
      Object.defineProperty(_g.document, 'elementFromPoint', {
        value: _impl,
        writable: true,
        configurable: true,
      });
      _ok = true;
    } catch (e) {
      console.error('[bootstrap] failed to polyfill elementFromPoint:', (e as Error).message);
    }
  }
  if (_ok) {
    console.log('[bootstrap] document.elementFromPoint polyfilled (returns main canvas)');
  }
}

// === canvas.getBoundingClientRect polyfill ===
// Phaser ScaleManager.updateScale → getParentBounds → canvas.getBoundingClientRect()
// wx canvas 没这方法。返回 buffer 像素的 bounding box（wx 整屏 = canvas）。
if (_canvas && typeof (_canvas as any).getBoundingClientRect !== 'function') {
  (_canvas as any).getBoundingClientRect = function (): {
    x: number; y: number; left: number; top: number;
    right: number; bottom: number; width: number; height: number;
  } {
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: this.width,
      bottom: this.height,
      width: this.width,
      height: this.height,
    };
  };
  console.log('[bootstrap] canvas.getBoundingClientRect polyfilled');
}

// === wx.createImage wrap：每个 image 实例直接挂 attribute 方法 ===
// Phaser TextureManager 加载图片后调 image.removeAttribute('crossOrigin')。
// 之前 patch wx native image prototype 没生效（可能 frozen 或 own property shadow）。
// 改 instance 级 patch：包一层 wx.createImage，每个新创建的 image instance 直接
// 挂 no-op removeAttribute/setAttribute/getAttribute，不依赖 prototype 链。
//
// 时机：必须先于 require weapp-adapter（它的 Image.js 工厂会调 wx.createImage）。
// 但 weapp-adapter 工厂是运行时调（每次 new Image() 才执行），不是 module load 时 cache，
// 所以在 require 之后 wrap 也来得及。
{
  const _origCreateImage = wx.createImage;
  wx.createImage = function (): unknown {
    const img = _origCreateImage.apply(wx) as Record<string, unknown>;
    if (img && typeof img.removeAttribute !== 'function') {
      img.removeAttribute = function (_name: string): void {};
      img.setAttribute = function (_name: string, _value: string): void {};
      img.getAttribute = function (_name: string): null {
        return null;
      };
    }
    return img;
  };
  console.log('[bootstrap] wx.createImage wrapped (instance-level attribute polyfill)');
}

// === FileReader.readAsDataURL polyfill ===
// weapp-adapter 的 FileReader 是空类（spike-wx/js/libs/weapp-adapter/FileReader.js
// 只有 construct() {} 都拼错了）。某些 Phaser 资源加载链调 reader.readAsDataURL(blob)
// 会 throw undefined is not a function。
// 复用 URL.createObjectURL 已实现的 ArrayBuffer/binary string → base64 转换。
{
  const _FR = (_g as any).FileReader;
  if (_FR && _FR.prototype && typeof _FR.prototype.readAsDataURL !== 'function') {
    _FR.prototype.readAsDataURL = function (blob: any): void {
      try {
        const url = _g.URL.createObjectURL(blob);
        (this as any).result = url;
        (this as any).readyState = 2; // DONE
        const onload = (this as any).onload;
        if (typeof onload === 'function') {
          // 异步触发 onload（模拟真 FileReader 行为）；wx 真机偶现 setTimeout 不可用，做兜底
          if (typeof setTimeout === 'function') {
            setTimeout(() => onload.call(this, { target: this }), 0);
          } else {
            onload.call(this, { target: this });
          }
        }
      } catch (err) {
        (this as any).error = err;
        const onerror = (this as any).onerror;
        if (typeof onerror === 'function') onerror.call(this, { target: this });
      }
    };
    console.log('[bootstrap] FileReader.readAsDataURL polyfilled');
  }
}

// === Response polyfill ===
// wx 引擎没 Fetch API 的 Response 类。apiClient 把 wx.request 结果包装成
// Response 让上层业务代码统一用 res.ok / res.json() / res.status。
// 实现 apiClient 实际用到的最小子集：构造 + status + ok + json() + text() + headers
if (typeof (globalThis as any).Response === 'undefined') {
  class ResponseShim {
    public readonly status: number;
    public readonly ok: boolean;
    public readonly headers: Map<string, string>;
    private readonly _body: string | null;

    constructor(
      body: string | null,
      init?: { status?: number; headers?: Record<string, string> },
    ) {
      this.status = init?.status ?? 200;
      this.ok = this.status >= 200 && this.status < 300;
      this._body = body;
      this.headers = new Map(Object.entries(init?.headers ?? {}));
    }

    async json(): Promise<unknown> {
      if (this._body == null || this._body === '') return null;
      return JSON.parse(this._body);
    }

    async text(): Promise<string> {
      return this._body ?? '';
    }
  }
  (globalThis as any).Response = ResponseShim;
  console.log('[bootstrap] Response polyfilled (minimal shim)');
}

// （document.dispatchEvent wrap 已移除——document 属性 frozen，redefine 失败；
// 改用 wx.onTouch* wrap，见 require 前那段）

export const mainCanvas = _canvas;
export const mainCtx = _ctx;
export const dpr = _dpr;
