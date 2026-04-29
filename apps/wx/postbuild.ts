// vite build 后置处理：把 game.json / project.config.json / weapp-adapter 拷进 wx-dist/
// vite 输出 wx-dist/js/main.js，这个脚本补全微信小游戏需要的 wrapper 文件

import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 阶段 5 后：本脚本搬到 apps/wx/postbuild.ts；从仓库根 `bun apps/wx/postbuild.ts` 调用，
// 用 process.cwd() 取仓库根（命令固定从根跑）；APP_WX 由 cwd 拼出
const ROOT = process.cwd();
const APP_WX = resolve(ROOT, 'apps/wx');
const WX_DIST = resolve(ROOT, 'wx-dist');
const SPIKE = resolve(APP_WX, 'spike-wx');

if (!existsSync(WX_DIST)) {
  console.error(`❌ ${WX_DIST} not found, run 'bun run build:wx' first`);
  process.exit(1);
}

mkdirSync(`${WX_DIST}/js/libs`, { recursive: true });

// 1. weapp-adapter（拷整个目录，wx 开发者工具会 ES6 转译）
const adapterSrc = `${SPIKE}/js/libs/weapp-adapter`;
const adapterDst = `${WX_DIST}/js/libs/weapp-adapter`;
cpSync(adapterSrc, adapterDst, { recursive: true });
console.log('✓ copied weapp-adapter');

// 2. game.js 入口（CommonJS）
// 必须在 main.js 加载前 polyfill wx 引擎缺失的全局（Symbol.for 等），
// 因为 Vite 把 zustand 等模块代码 hoist 到 main.js 顶部，比 wx-bootstrap 还早执行
const gameJs = `// 微信小游戏入口
// ====== ES2015+ polyfill（必须最早，main.js 顶部 zustand 等会立即调用） ======
if (typeof Symbol !== 'undefined' && typeof Symbol.for !== 'function') {
  var _symRegistry = {};
  Symbol.for = function (k) {
    if (!_symRegistry[k]) _symRegistry[k] = Symbol(k);
    return _symRegistry[k];
  };
  Symbol.keyFor = function (s) {
    for (var k in _symRegistry) if (_symRegistry[k] === s) return k;
    return undefined;
  };
  console.log('[game.js] Symbol.for polyfilled');
}

// ====== load main bundle ======
require('./js/main.js');
`;
writeFileSync(`${WX_DIST}/game.js`, gameJs);
console.log('✓ wrote game.js');

// 3. game.json
const gameJson = {
  deviceOrientation: 'portrait',
  showStatusBar: false,
  networkTimeout: { request: 15000, downloadFile: 30000 },
};
writeFileSync(`${WX_DIST}/game.json`, JSON.stringify(gameJson, null, 2) + '\n');
console.log('✓ wrote game.json');

// 4. project.config.json（拷 spike-wx 的，appid 已填）
copyFileSync(`${SPIKE}/project.config.json`, `${WX_DIST}/project.config.json`);
// 改 projectname
const cfgRaw = await Bun.file(`${WX_DIST}/project.config.json`).text();
const cfg = JSON.parse(cfgRaw);
cfg.projectname = 'immune-td';
writeFileSync(`${WX_DIST}/project.config.json`, JSON.stringify(cfg, null, 2) + '\n');
console.log('✓ wrote project.config.json');

// 5. 复制 towers / pathogens PNG 资源（wx 端用 PNG 不用 SVG，避开 Blob 触发）
// BGM 11MB 和大 splash 不复制（spec §4 走 CDN）
const PUBLIC = resolve(ROOT, 'apps/h5/public/assets');
let pngCount = 0;
for (const sub of ['towers', 'pathogens']) {
  const src = `${PUBLIC}/${sub}`;
  if (!existsSync(src)) continue;
  const dst = `${WX_DIST}/assets/${sub}`;
  mkdirSync(dst, { recursive: true });
  for (const name of readdirSync(src)) {
    if (!name.endsWith('.png')) continue;
    copyFileSync(`${src}/${name}`, `${dst}/${name}`);
    pngCount++;
  }
}
console.log(`✓ copied ${pngCount} PNG assets to wx-dist/assets/`);

// 5b. 拷贝 MiSans / Noto / Share Tech Mono subset woff2 到 wx-dist/fonts/
// 注：wx 小游戏端目前不支持运行时加载 web @font-face（wx Canvas 2D fillText 走系统字体），
// 这些 woff2 拷过去主要是为后续走 wx.loadFont 接入做铺垫。当前 wx 端实际渲染走系统字体
// 链（PingFang SC / 微软雅黑 / Courier 等），fontFamily 字符串里的 "MiSans" / "Noto Sans SC"
// / "Share Tech Mono" 会跳过直到命中系统字体——风格降级但不会糊。
const FONTS_SRC = resolve(ROOT, 'apps/h5/public/fonts');
const FONTS_DST = `${WX_DIST}/fonts`;
let fontCount = 0;
if (existsSync(FONTS_SRC)) {
  mkdirSync(FONTS_DST, { recursive: true });
  for (const name of readdirSync(FONTS_SRC)) {
    if (!name.endsWith('.woff2')) continue;
    copyFileSync(`${FONTS_SRC}/${name}`, `${FONTS_DST}/${name}`);
    fontCount++;
  }
}
console.log(`✓ copied ${fontCount} font subset woff2 to wx-dist/fonts/`);

// 6. prepend ES2015+ polyfill 到 main.js 第一行（最早执行，比 zustand 还早）
// 强制覆盖 Symbol.for（不检查 typeof，wx 的可能是 broken lazy proxy）
const POLYFILL = `// === wx polyfill prepended by wx-postbuild ===
(function(){
  if (typeof Symbol === 'undefined') {
    console.log('[polyfill] Symbol missing, creating fake');
    var _r0 = {};
    var _fake = function(k) { return { _isSymbol: true, _key: k, toString: function(){return 'Symbol(' + k + ')'}}; };
    _fake.for = function(k) { if (!_r0[k]) _r0[k] = _fake(k); return _r0[k]; };
    _fake.keyFor = function(s) { for (var k in _r0) if (_r0[k] === s) return k; return undefined; };
    try { (typeof globalThis !== 'undefined' ? globalThis : this).Symbol = _fake; } catch(e) {}
    return;
  }
  // 强制覆盖 Symbol.for（不信任原版 — wx 上 typeof 是 function 但调用 throw）
  var _r = {};
  var _impl = function(k) { if (!_r[k]) _r[k] = Symbol(k); return _r[k]; };
  var _ok = false;
  try { Symbol.for = _impl; _ok = (Symbol.for === _impl); } catch(_) {}
  if (!_ok) {
    try { Object.defineProperty(Symbol, 'for', { value: _impl, writable: true, configurable: true }); _ok = (Symbol.for === _impl); } catch(_) {}
  }
  if (_ok) console.log('[polyfill] Symbol.for force-replaced');
  else console.error('[polyfill] FAILED to override Symbol.for');
})();
`;
const mainJsPath = `${WX_DIST}/js/main.js`;
if (existsSync(mainJsPath)) {
  const mainContent = await Bun.file(mainJsPath).text();
  if (!mainContent.startsWith('// === wx polyfill prepended')) {
    writeFileSync(mainJsPath, POLYFILL + mainContent);
    console.log('✓ prepended Symbol.for polyfill to main.js');
  }
}

console.log('\n✅ wx-dist/ ready');
console.log(`   import in 微信开发者工具 → 「小游戏」tab → 选 ${WX_DIST}`);
