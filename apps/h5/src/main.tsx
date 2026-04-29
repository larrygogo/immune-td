/*!
 * Immune TD
 * Copyright (c) 2026 Larry. All Rights Reserved.
 *
 * This software is proprietary and confidential. Unauthorized copying,
 * distribution, modification, reverse-engineering, or use of this code
 * or any derived work is strictly prohibited.
 *
 * Contact: 351220018@qq.com
 */
// H5 端 safe area polyfill —— **必须最先**：读 CSS env(safe-area-inset-*) 注入
// globalThis.__safeArea，让 src/game-engine/layout/safe-area.ts 在 module load 时
// 能拿到 iOS / 安卓刘海屏 / home indicator 实际尺寸（行业标准做法）。
import './h5-bootstrap';
// 拉丁字体内置（@fontsource）：字体文件由 Vite 打包到 dist/assets，运行时不依赖
// Google Fonts。只引 latin 子集，避免拉全 11 个子集（cyrillic / greek 等）。
// 中文走 public/fonts 的 noto-sans-sc subset。游戏内只用 JetBrains Mono，
// Inter 已移除（设计已统一到 Noto Sans SC + Mono，详见 docs/design-system.md §3.1）。
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-600.css';
import '@fontsource/jetbrains-mono/latin-700.css';
// 中文字体：scripts/subset-font.ts 扫源码生成精准 subset，由 global.css 里的
// @font-face 引用 public/fonts/noto-sans-sc-subset-*.woff2（不走 @fontsource 全量
// chinese-simplified，能从 2.3 MB 降到 ~380 KB）
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initAnalytics } from '@/analytics/init';
import { installAdapters } from '@/platform';
import { webAudio } from '@/platform/web/audio.web';
import { webDevice } from '@/platform/web/device.web';
import { webNetwork } from '@/platform/web/network.web';
import { webStorage } from '@/platform/web/storage.web';
import { installShell } from '@immune-td/core/shell';
import { apiFetch } from './ui/apiClient';
import { displayName, useAuthStore } from './ui/authStore';
import './styles/global.css';

// H5 平台入口。install web adapters → 启动 React 应用。
// 未来微信小游戏入口在 src/main.wx.ts：weapp-adapter 垫层 → install wx adapters →
// 直接 boot Phaser（不依赖 React）。切换平台只需新增入口 + vite.wx.config.ts，
// 不动 src/game-engine / src/ui / src/audio 业务代码。
installAdapters({
  storage: webStorage,
  network: webNetwork,
  audio: webAudio,
  device: webDevice,
});

// core shell 注入：H5 提供 apiFetch / authStore / displayName 给 core 内 scenes / dev / analytics 用
// （阶段 3 引入；replace 掉 @app-shell/* 临时 alias 桥接）
installShell({
  apiFetch,
  authStore: useAuthStore,
  displayName,
});

// app version 从 vite define 注入；缺省时退到 0.0.0（dev hot reload 不影响）
declare const __APP_VERSION__: string;
const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
initAnalytics({ appVersion });

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('#root element not found in index.html');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
