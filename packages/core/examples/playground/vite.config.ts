import { defineConfig } from 'vite';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../../..');
const coreSrc = path.resolve(__dirname, '../../src');

export default defineConfig({
  root: __dirname,
  publicDir: path.resolve(repoRoot, 'apps/h5/public'),
  resolve: {
    // 用 array form 严格按顺序匹配；最长精确路径放最前
    alias: [
      // playground 不依赖 H5 shell：以下指向 stubs（长前缀优先）
      {
        find: '@/platform/wx/wx-login',
        replacement: path.resolve(__dirname, 'stubs/wx-login.ts'),
      },
      {
        find: '@/platform/wx/wx-userinfo',
        replacement: path.resolve(__dirname, 'stubs/wx-userinfo.ts'),
      },
      { find: '@ui/progressSync', replacement: path.resolve(__dirname, 'stubs/progressSync.ts') },
      // ui store 在 core/state（@ui/store 精确）
      { find: '@ui/store', replacement: path.resolve(coreSrc, 'state/store.ts') },
      // core 内部 alias 映射到 packages/core/src
      { find: '@engine', replacement: path.resolve(coreSrc, 'game-engine') },
      { find: '@audio', replacement: path.resolve(coreSrc, 'audio') },
      { find: '@/dev', replacement: path.resolve(coreSrc, 'dev') },
      { find: '@/analytics', replacement: path.resolve(coreSrc, 'analytics') },
      { find: '@/platform', replacement: path.resolve(coreSrc, 'platform') },
      // shared 包
      { find: '@immune-td/shared', replacement: path.resolve(repoRoot, 'packages/shared/src/index.ts') },
      { find: '@immune-td/core/shell', replacement: path.resolve(coreSrc, 'shell.ts') },
      { find: '@immune-td/core', replacement: path.resolve(coreSrc, 'index.ts') },
    ],
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
