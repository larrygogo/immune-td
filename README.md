# Immune TD · 微观防线

微观免疫系统主题的 Web 塔防游戏。免疫细胞布阵、构建迷宫拦截病原入侵；诊疗界面赛博派视觉风格。

> **版权所有 © 2026 Larry. 保留所有权利（All Rights Reserved）。**
>
> 本仓库**源码公开浏览供学习参考**；**未获书面授权，禁止复制、分发、修改、商业/非商业使用**。详见 [LICENSE](./LICENSE)。
>
> 授权合作 / 商务咨询：**351220018@qq.com**

---

## 技术栈

| 类别 | 选型 |
|---|---|
| 运行时 | [Bun](https://bun.sh/) |
| 语言 | TypeScript 5（strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`） |
| 渲染 + 交互 | [Phaser 3.90](https://phaser.io/) |
| 状态 | [Zustand](https://github.com/pmndrs/zustand)（`metaStore` 持久化） |
| 构建 | [Vite](https://vitejs.dev/) + bun workspaces |
| 测试 | [Vitest](https://vitest.dev/)（单元 + balance baseline）+ [Playwright](https://playwright.dev/)（E2E） |
| Lint / Format | [Biome](https://biomejs.dev/) |
| 后端 | Bun + [Hono](https://hono.dev/) + `bun:sqlite` + [Zod](https://zod.dev/) + `@node-rs/argon2` |

---

## 仓库结构（monorepo）

```
.
├── apps/
│   ├── h5/                # H5 React 壳（@immune-td/app-h5）
│   └── wx/                # 微信小游戏入口（@immune-td/app-wx）
├── packages/
│   ├── core/              # 游戏核心（@immune-td/core，平台无关，可独立运行）
│   │   └── examples/playground/   # 离线裸跑 demo（无账号 / 无网络）
│   └── shared/            # 前后端共享 Zod schema（@immune-td/shared）
├── server/                # Hono + sqlite 后端（auth / sessions / progress / events）
├── tests/                 # Vitest 单元 + Playwright e2e
└── scripts/               # 字体子集化 / balance 模拟器等跨包脚本
```

`packages/core` 不依赖 server / 网络 / 账号代码 —— `packages/core/examples/playground` 验证可离线跑。

---

## 快速开始

```bash
# 安装依赖
bun install

# H5 dev（http://localhost:5173）
bun run dev

# 离线 playground（http://localhost:5174，无账号/无同步，断网可玩）
bun run play

# 单元测试（605 cases）
bun run test

# E2E（Playwright，跨 H5 启动）
bun run test:e2e

# 类型检查
bun run typecheck

# H5 生产构建（输出 apps/h5/dist/）
bun run build

# 微信小游戏构建（输出 wx-dist/）
bun run build:wx

# Lint
bun run lint
```

后端单独跑：

```bash
cd server
bun run dev          # http://localhost:3100
bun run test         # bun test
```

---

## 架构原则

- **核心可独立运行**：`packages/core` 含完整 Phaser scene + 渲染 + UI 组件 + 游戏逻辑，不依赖账号 / 网络 / H5 React 壳；`bun run play` 启动 playground 可离线打通关
- **平台扩展不污染核心**：H5 React 壳、微信小游戏入口、未来桌面版各自走 `apps/*/`，通过 `installShell()` 扩展点注入账号 / 网络 / 显示名等宿主能力到 core
- **平台 IO 走 adapter**：`StorageAdapter` / `NetworkAdapter` / `AudioAdapter` / `DeviceAdapter` 4 类接口由 core 定义，apps/h5 与 apps/wx 各自实现并 `installAdapters()` 注入
- **前后端 schema 共享**：`packages/shared` 用 Zod 定义跨端 schema；server 用于运行时校验，前端 type-only import 不引 runtime 体积

---

## 配置项目

- `tsconfig.base.json` 收敛跨包共享的 strict 选项；各 package / app 的 `tsconfig.json` extends 它再加平台相关字段
- `bunfig.toml` 锁 npm 官方源（避免本地 `~/.npmrc` 镜像配置干扰）
- `vitest.config.ts` 与 `playwright.config.ts` 在仓库根，覆盖跨包的单元 / e2e
- `apps/h5/vite.config.ts` 与 `apps/wx/vite.config.ts` 各自独立

---

## 联系

- GitHub: [@larrygogo](https://github.com/larrygogo)
- Email: 351220018@qq.com（授权合作 / 侵权举报）
