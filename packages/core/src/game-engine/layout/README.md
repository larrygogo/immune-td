# Layout Framework

Cocos 风视觉 layout 工具集：设计分辨率 + 4 边安全区 + 9 宫格 anchor + spacing + 响应式断点。
跟项目现有 `src/game-engine/dpr.ts`（`px()` × DPR）协同工作。

新加 scene / UI 优先用本 framework。旧 scene 渐进迁移（不强制重写）。

---

## 模块速查

```ts
import {
  SPACING,        // 4-pt grid 常量（xs..xxl）
  BREAKPOINTS, getBreakpoint, isAtLeast,
  SAFE_TOP, SAFE_BOTTOM, SAFE_LEFT, SAFE_RIGHT, getSafeArea,
  resolveAnchor, anchorTopLeft, anchorTopCenter, anchorTopRight,
  anchorMiddleLeft, anchorMiddleCenter, anchorMiddleRight,
  anchorBottomLeft, anchorBottomCenter, anchorBottomRight,
  DESIGN_W, DESIGN_H, getScale,
  getViewport,
} from '@engine/layout';

// 容器（业务侧）：
import { Row, Column, Grid } from '@engine/layout/phaser-containers';

// dev 调试 overlay（按 Ctrl+Shift+L 切换显示）：
import { createLayoutDebugOverlay, installLayoutDebugShortcut } from '@engine/layout/debug';
```

---

## SPACING 常量

CSS px 单位的 4-pt grid（命名严格按倍数关系）：

| key | CSS px | 用途 |
|---|---|---|
| `xs` | 4 | 紧凑 padding / icon 内边距 |
| `sm` | 8 | 按钮内 padding / 同区块小元素间 |
| `md` | 16 | 按钮间 / 区块内主元素间 / **屏边默认 padding** |
| `lg` | 24 | 区块间（顶部条 → hub / hub → grid） |
| `xl` | 32 | 主区块间（视觉重心切割） |
| `xxl` | 48 | 极强分隔 |

用法：

```ts
const padX = px(SPACING.md);  // 16 CSS px → buffer px
const rowGap = px(SPACING.sm + SPACING.xs);  // 12 CSS px
```

阶梯不能干净拼出某些视觉调校值（例 11 / 14 / 22）时，**保留显式数字 +
注释**，不用强行拼凑出晦涩的 `SPACING.x + 2 - 1` 表达式。

---

## SAFE area

4 边安全区。**已乘 DPR**（buffer px）。

| 常量 | 含义 | 双端值 |
|---|---|---|
| `SAFE_TOP` | 顶部（胶囊 / 状态栏） | wx 端 wx-bootstrap 算；H5 端 0 |
| `SAFE_BOTTOM` | 底部（home indicator） | wx 端 wx-bootstrap 算；H5 端 0 |
| `SAFE_LEFT` | 左屏 padding | `SPACING.md × DPR` 双端统一 |
| `SAFE_RIGHT` | 右屏 padding | `SPACING.md × DPR` 双端统一 |

`getSafeArea(W, H)` 返回综合对象：

```ts
const sa = getSafeArea(W, H);
// sa.top / bottom / left / right
// sa.contentX / contentY / contentWidth / contentHeight
```

content 区域 = 屏幕减掉 4 边后的可见矩形。

---

## Anchor 9 宫格

声明式锚点 + 偏移：

```ts
// before（手写算法）
this.btn.container.setPosition(W - rightPad - btnW / 2, topRowCenterY);

// after（声明 anchor）
const pos = anchorTopRight(W, H, px(SPACING.md) + btnW / 2, topRowCenterY);
this.btn.container.setPosition(pos.x, pos.y);
```

9 宫格位置：

```
top-left      top-center      top-right
middle-left   middle-center   middle-right
bottom-left   bottom-center   bottom-right
```

参数顺序：`(W, H, offsetX, offsetY, safeArea?)`。所有 offset 是 **buffer px**（`px(SPACING.md)`）。

**重要：节点 origin**

helper 假设节点 origin 在中心 `(0.5, 0.5)`。Phaser 默认 origin `(0, 0)`（左上）。两种使用方式：

1. 给节点 `setOrigin(0.5)` 后直接用返回的 (x, y)
2. 保持 (0, 0) origin，自己减节点宽高一半（适合 Text 这类已有 width/height 的）

**带 safeArea**：传 `getSafeArea(W, H)` 让锚点限制到 contentX/Y/Width/Height 区域内（自动避开胶囊 / home indicator）：

```ts
const sa = getSafeArea(W, H);
const pos = anchorTopRight(W, H, px(SPACING.md) + btnW / 2, 0, sa);
// pos.x / y 已经避开了 SAFE_TOP / SAFE_RIGHT
```

---

## Breakpoints

```ts
const cssW = scene.scale.width / DPR;
if (isAtLeast(cssW, 'tablet')) {
  // tablet+ 多列布局
}
```

| breakpoint | css px 范围 |
|---|---|
| `phone-narrow` | 0-479 |
| `phone-wide` | 480-767 |
| `tablet` | 768-1023 |
| `desktop` | 1024+ |

项目当前 `VIEWPORT_MAX_CSS_W = 480`，所有桌面 / 平板都按窄屏走。
**断点系统先建好作为 future-proof，桌面 / 平板分支等真要做大屏适配时再实装。**

---

## 设计分辨率

`DESIGN_W = 390`, `DESIGN_H = 844`（iPhone 14 标准）。设计稿、视觉规格按这个尺寸量。

`getScale(currentCssW)` 返当前宽度相对设计基准的比例。**多数情况不需要这个 scale**——
项目主 layout 用 `px()` × DPR 已经能跨 DPR。仅供"按设计稿比例缩放"的 visual element 用。

---

## Viewport 聚合

scene 的 `layout(W, H)` 推荐改用 `getViewport(this)` 入口：

```ts
private layout(W: number, H: number): void {
  const vp = getViewport(this);
  // vp.W / vp.H / vp.safeArea / vp.breakpoint / vp.scale 都可用
}
```

---

## PhaserButton anchor 参数

PhaserButton 直接接受 `anchor` 字段，构造时按 viewport 自动 setPosition：

```ts
new PhaserButton(this, 0, 0, {
  label: '账号',
  anchor: {
    point: 'top-right',
    offsetX: px(SPACING.md) + btnW / 2,
    offsetY: SAFE_TOP + px(SPACING.sm),
    useSafeArea: false,  // 默认 false
  },
  onTap: ...,
});
```

不传 `anchor` 时行为完全不变（向后兼容）。

---

## Row / Column / Grid 容器（轻量 flex）

适合**已声明尺寸的子节点**做声明式排版，省去手写 `currentX += w + gap` 这套累加逻辑。

import：
```ts
import { Row, Column, Grid } from '@engine/layout/phaser-containers';
import { SPACING } from '@engine/layout';
```

> **注意**：业务侧 import 的是 `phaser-containers.ts`（含 Phaser 类）；
> `containers.ts` 是纯 layout 数学层（jsdom 单测用，不带 Phaser 依赖）。

### Row：水平排版

```ts
const row = new Row(this, {
  children: [
    { container: btnA.container, cssWidth: 64, cssHeight: 56 },
    { container: btnB.container, cssWidth: 64, cssHeight: 56 },
    { container: btnC.container, cssWidth: 64, cssHeight: 56 },
  ],
  spacing: SPACING.md,    // CSS px，相邻 child 间距，默认 SPACING.sm
  justify: 'center',      // start | center | end | space-between | space-around
  align: 'center',        // start | center | end，默认 center
  padding: { x: 8 },      // CSS px，可选
});
this.add.existing(row);
row.setSize(stackWidth, 56);
row.setPosition(W / 2 - row.widthPx / 2, row2Y);
```

### Column：垂直排版

跟 Row 同接口，主轴垂直：

```ts
const col = new Column(this, {
  children: [...],
  spacing: SPACING.lg,
  justify: 'space-between',
  align: 'start',
});
col.setSize(panelW, panelH);
col.setPosition(panelX, panelY);
```

### Grid：固定列数

按 row-major 填充，行高取该行 max cssHeight：

```ts
const grid = new Grid(this, {
  children: items,        // 7 items
  columns: 3,             // 自动分 3 行（[0,1,2] / [3,4,5] / [6]）
  spacing: { x: SPACING.md, y: SPACING.lg },
  align: 'center',
});
grid.setSize(stackWidth, totalHeight);
grid.setPosition(originX, originY);
```

### 关键约定

- 子节点宽高用调用方传的 `cssWidth` / `cssHeight`（CSS px），容器内部 × DPR 转 buffer
- 子节点 `setPosition(left, top)` 假设子 origin (0, 0)。如果子用了 `setOrigin(0.5)`，
  需要自己处理偏移（多数业务 container 都是 origin (0,0) 内部画好的，正好兼容）
- 容器自身的位置由调用方 `container.setPosition(x, y)` 控制；容器只管内部排版
- 改 setSize 后会立即重排所有子节点（每次 layout 都重算，不依赖前一次状态）

### 不要用容器的场景

- **位置已经按 anchor 算好的**（保留 `anchorTopRight(...)` 直接 setPosition 写法，更清晰）
- **HUD / 状态条** 这类内部自己已写好相对位置的（容器只能搬运不能编辑子内部）
- **碰撞热区有特殊逻辑** 的（容器的子位置是声明 size 不会动 hit area；不匹配的 hit
  area 要自己 resize）

---

## debug.ts — dev-only 可视化 overlay

按 **Ctrl+Shift+L** 切换显示 layout 辅助线，所有 active scene 同时显示：

- safe-area content 区青绿描边 + 4 边非零 SAFE_TOP/BOTTOM/LEFT/RIGHT 紫红描边
- 9 宫格 anchor 各画黄色十字（top-left ... bottom-right）
- 左上角白文字：`W=780 H=1688 / CSS=390×844 / DPR=2`
- 右上角橙文字：`bp:phone-narrow`

### API

单 scene 实例化（手动控制）：

```ts
import { createLayoutDebugOverlay } from '@engine/layout/debug';
if (import.meta.env.DEV) {
  const overlay = createLayoutDebugOverlay(this);
  overlay.show();
  // overlay.hide() / overlay.toggle() / overlay.destroy()
}
```

全局 keyboard shortcut（推荐）—— 在 BootScene 启动时调一次：

```ts
import { installLayoutDebugShortcut } from '@engine/layout/debug';
if (import.meta.env.DEV) {
  installLayoutDebugShortcut(this.game);
}
```

之后任何 scene 都可以按 Ctrl+Shift+L 切换显示。

### tree-shake / 平台

- production build：不 import `debug` 模块即不进 bundle（dev-only export）
- wx 端：`window.addEventListener` 不存在自动 no-op，安全
- 视觉 setDepth(999) 极高，覆盖所有 scene UI

---

## 迁移其他 scene 的 step-by-step

把一个手写 layout 的旧 scene 迁到新 framework，按这个顺序：

1. **改 import**：
   ```ts
   - import { SAFE_TOP, SAFE_BOTTOM } from '../safe-area';
   + import { SAFE_TOP, SAFE_BOTTOM } from '../layout/safe-area';
   + import { SPACING } from '../layout/spacing';
   + import { anchorTopRight } from '../layout/anchor';
   ```
   旧路径 `../safe-area` 仍 re-export 兼容，但建议跟着改一致。

2. **grep 硬编 px 值**：
   ```bash
   rg "px\(\d+\)" src/game-engine/scenes/<your-scene>.ts
   ```
   按对照表替换：
   - `px(4)` → `px(SPACING.xs)`
   - `px(8)` → `px(SPACING.sm)`
   - `px(16)` → `px(SPACING.md)`
   - `px(24)` → `px(SPACING.lg)`
   - `px(32)` → `px(SPACING.xl)`
   - `px(48)` → `px(SPACING.xxl)`
   - 其他值（如 `px(10) / px(12) / px(14) / px(20)`）：用阶梯组合 + `// = px(N)` 注释，
     或保留显式值（视觉调校值）

3. **替换手写 anchor**：
   - `W - rightPad - btnW / 2` → `anchorTopRight(W, H, px(rightPad) + btnW / 2, ...).x`
   - `(W - x) / 2` 用于居中文本 → 保持原写法（便捷 helper 是节点中心 origin，文字 origin (0,0)
     时反而要再减半）

4. **跑测试**：
   ```bash
   bun run lint && bun run typecheck && bun run test
   ```

5. **视觉走查**：DevTools 模拟 iPhone 14 / Pixel 5，跟迁移前对比，buffer px 偏差应 ≤ 1-2 px。

6. **e2e baseline**：如果有 visual regression test，跑 `bun run test:e2e -- --update-snapshots`
   重生 baseline，review 截图变化是预期的就 commit。

### 进阶：用容器替代手写 layout 算法

scene 里有连续 N 个手写 `setPosition(currentX, ...)` + `currentX += w + gap` 的，
可以替换成 `Row` / `Column` / `Grid` 容器（参考上面的「Row / Column / Grid 容器」节）。

迁移示例（伪代码）：

```ts
// before：手写累加
let cursorX = startX;
mailBtn.container.setPosition(cursorX, row2Y);
cursorX += px(64) + px(SPACING.md);
announceBtn.container.setPosition(cursorX, row2Y);
cursorX += px(64) + px(SPACING.md);
replayBtn.container.setPosition(cursorX, row2Y);

// after：声明式 Row
const infoRow = new Row(this, {
  children: [
    { container: mailBtn.container, cssWidth: 64, cssHeight: 56 },
    { container: announceBtn.container, cssWidth: 64, cssHeight: 56 },
    { container: replayBtn.container, cssWidth: 64, cssHeight: 56 },
  ],
  spacing: SPACING.md,
  justify: 'center',
});
this.add.existing(infoRow);
infoRow.setSize(stackWidth, 56);
infoRow.setPosition(W / 2 - infoRow.widthPx / 2, row2Y);
```

迁移**前后视觉应完全一致**（同样的 cssWidth + 同样的 spacing）；如果要改间距 / 对齐，
只动 `spacing / justify` 一处而不是改累加表达式。

---

## 不做的事（参考 spec § 8）

- 不引入 Phaser ScaleManager 自动缩放（`Scale.NONE` 已稳）
- 不做 Cocos 节点树 layout 自动重排
- 不做可视化 layout 编辑器（开源 Phaser 没工具）
- 不引入 Flexbox / Grid 系统（yoga-layout 太重）
- 桌面 / 平板大屏适配 layout 实装暂缓，断点系统先建好
