import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import pkg from './package.json' with { type: 'json' };

const repoRoot = path.resolve(__dirname, '../..');

export default defineConfig({
  // 从仓库根 `bun run dev` 调用时显式指定 root，避免 vite 把 cwd 当成 root
  root: __dirname,
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      // 精确 alias 在前（路径相对 apps/h5/，packages/core 在 ../..）
      '@/analytics': path.resolve(repoRoot, 'packages/core/src/analytics'),
      '@/dev': path.resolve(repoRoot, 'packages/core/src/dev'),
      '@/platform/web': path.resolve(__dirname, 'src/platform-web'),
      // BootScene.ts 静态 import wx-login（运行期通过 IS_WX 跳过），仍需 vite 能解析模块
      '@/platform/wx': path.resolve(repoRoot, 'apps/wx/src/platform-wx'),
      '@/platform': path.resolve(repoRoot, 'packages/core/src/platform'),
      '@': path.resolve(__dirname, 'src'),
      '@engine': path.resolve(repoRoot, 'packages/core/src/game-engine'),
      '@ui/store': path.resolve(repoRoot, 'packages/core/src/state/store.ts'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@audio': path.resolve(repoRoot, 'packages/core/src/audio'),
      '@immune-td/shared': path.resolve(repoRoot, 'packages/shared/src/index.ts'),
      '@immune-td/core/shell': path.resolve(repoRoot, 'packages/core/src/shell.ts'),
      '@immune-td/core': path.resolve(repoRoot, 'packages/core/src/index.ts'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [/(^|[\\/])\.debug([\\/]|$)/, /(^|[\\/])\.playwright-mcp([\\/]|$)/],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3100',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        pure_funcs: ['console.log', 'console.debug'],
        drop_debugger: true,
      },
      format: {
        comments: /^\!/,
      },
    },
    rollupOptions: {
      output: {
        banner:
          '/*! Immune TD | Copyright (c) 2026 Larry. All Rights Reserved. | Proprietary - Unauthorized copying prohibited | 351220018@qq.com */',
        manualChunks: {
          phaser: ['phaser'],
          react: ['react', 'react-dom'],
          vendor: ['zustand', 'zod', 'howler'],
        },
      },
    },
  },
});
