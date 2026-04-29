import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@/analytics': path.resolve(__dirname, 'packages/core/src/analytics'),
      '@/dev': path.resolve(__dirname, 'packages/core/src/dev'),
      '@/platform/web': path.resolve(__dirname, 'apps/h5/src/platform-web'),
      '@/platform/wx': path.resolve(__dirname, 'apps/wx/src/platform-wx'),
      '@/platform': path.resolve(__dirname, 'packages/core/src/platform'),
      '@engine': path.resolve(__dirname, 'packages/core/src/game-engine'),
      '@ui/store': path.resolve(__dirname, 'packages/core/src/state/store.ts'),
      '@ui': path.resolve(__dirname, 'apps/h5/src/ui'),
      '@audio': path.resolve(__dirname, 'packages/core/src/audio'),
      // 跨前后端共享 schema（与 vite.config.ts / tsconfig paths 对齐）
      '@immune-td/shared': path.resolve(__dirname, 'packages/shared/src/index.ts'),
      '@immune-td/core/shell': path.resolve(__dirname, 'packages/core/src/shell.ts'),
      '@immune-td/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['tests/e2e/**', 'node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/core/src/game-engine/**/*.ts'],
      exclude: ['packages/core/src/game-engine/game/data/**'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
});
