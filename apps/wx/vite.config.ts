import { defineConfig } from 'vite';
import path from 'node:path';
import pkg from './package.json' with { type: 'json' };

const repoRoot = path.resolve(__dirname, '../..');

// 微信小游戏构建配置（独立于 apps/h5/vite.config.ts）
// 输出 wx-dist/（仓库根，与原阶段一致）：
//   wx-dist/
//   ├── game.js                   ← 入口（CommonJS，require './js/main.js'）
//   ├── game.json                 ← wx 配置
//   ├── project.config.json       ← appid + 编译选项
//   ├── js/main.js                ← Vite 打包出的业务代码（含 phaser）
//   └── js/libs/weapp-adapter/    ← 浏览器 API polyfill（拷自 apps/wx/spike-wx）

export default defineConfig({
  root: __dirname,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    'import.meta.env.VITE_PLATFORM': JSON.stringify('wx'),
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(
      process.env.VITE_API_BASE_URL ?? 'http://localhost:3100',
    ),
  },
  publicDir: false,
  resolve: {
    alias: [
      { find: /^zustand$/, replacement: path.resolve(__dirname, 'src/wx-shims/zustand.ts') },
      { find: '@/analytics', replacement: path.resolve(repoRoot, 'packages/core/src/analytics') },
      { find: '@/dev', replacement: path.resolve(repoRoot, 'packages/core/src/dev') },
      {
        find: '@/platform/web',
        replacement: path.resolve(repoRoot, 'apps/h5/src/platform-web'),
      },
      { find: '@/platform/wx', replacement: path.resolve(__dirname, 'src/platform-wx') },
      { find: '@/platform', replacement: path.resolve(repoRoot, 'packages/core/src/platform') },
      { find: '@', replacement: path.resolve(__dirname, 'src') },
      { find: '@engine', replacement: path.resolve(repoRoot, 'packages/core/src/game-engine') },
      {
        find: '@ui/store',
        replacement: path.resolve(repoRoot, 'packages/core/src/state/store.ts'),
      },
      { find: '@ui', replacement: path.resolve(repoRoot, 'apps/h5/src/ui') },
      { find: '@audio', replacement: path.resolve(repoRoot, 'packages/core/src/audio') },
      {
        find: '@immune-td/shared',
        replacement: path.resolve(repoRoot, 'packages/shared/src/index.ts'),
      },
      {
        find: '@immune-td/core/shell',
        replacement: path.resolve(repoRoot, 'packages/core/src/shell.ts'),
      },
      {
        find: '@immune-td/core',
        replacement: path.resolve(repoRoot, 'packages/core/src/index.ts'),
      },
      // 微信小游戏音频 stub：把 web-only 的 bgm/sfx/unlock/bgm-loader 替换为 no-op 实现
      // *.wx.ts 已搬到 apps/wx/src/audio.wx/（阶段 5）
      { find: /^.*\/audio\/bgm$/, replacement: path.resolve(__dirname, 'src/audio.wx/bgm.wx.ts') },
      { find: /^.*\/audio\/sfx$/, replacement: path.resolve(__dirname, 'src/audio.wx/sfx.wx.ts') },
      {
        find: /^.*\/audio\/unlock$/,
        replacement: path.resolve(__dirname, 'src/audio.wx/unlock.wx.ts'),
      },
      {
        find: /^.*\/audio\/bgm-loader$/,
        replacement: path.resolve(__dirname, 'src/audio.wx/bgm-loader.wx.ts'),
      },
    ],
  },
  build: {
    outDir: path.resolve(repoRoot, 'wx-dist/js'),
    target: 'es2020',
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_debugger: true,
      },
      format: { comments: /^\!/ },
    },
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/main.ts'),
      output: {
        format: 'cjs',
        entryFileNames: 'main.js',
        chunkFileNames: '[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
      external: [/libs\/weapp-adapter/],
    },
  },
});
