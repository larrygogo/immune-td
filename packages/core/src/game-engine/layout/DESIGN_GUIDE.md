# Immune TD · Layout 设计指南

**视觉安全距离规范**——所有 UI 设计应遵循的间距 / 留白原则。
跟 `README.md`（开发用法）配套：本文档讲**设计原则**，README 讲**怎么调 API**。

> 单一目标：所有 scene 视觉一致，用 `SPACING` 常量替代经验性硬编 `px()` 值。

---

## 1. 核心理念

### 1.1 一切间距走 SPACING

**永远不写**：`px(28)` / `px(110)` / `px(8)` / `px(40)` 这种裸数字。

**永远写**：`px(SPACING.lg)` / `px(SPACING.lg + SPACING.xs)` / `px(SPACING.sm)` / 等。

调全局间距一处改全局生效。新增 layout 代码 review 时硬编 `px(整数)` 默认拒绝。

### 1.2 SPACING 阶梯（4-pt grid）

| 级 | 值 (CSS px) | 用途 |
|---|---|---|
| **xs** | 4 | 行内文字 padding / icon 内边距 / 紧密堆叠 |
| **sm** | 8 | 按钮内 padding / 同区块小元素间 |
| **md** | 16 | 按钮间 / 区块内主元素间 / **屏边 padding 默认** |
| **lg** | 24 | 区块间（顶部条 → hub / hub → grid） |
| **xl** | 32 | 主区块间（视觉重心切割） |
| **xxl** | 48 | 极强分隔（极少用，慎用） |

不够用的话**可以加和**（如 `SPACING.lg + SPACING.xs = 28`），但**不要凭空写**别的数字。

---

## 2. 视觉安全距离规范

### 2.1 屏幕边缘

任何元素到屏幕物理边缘的最短距离：

| 边 | 最小距离 | 实现 |
|---|---|---|
| 顶部 | `SAFE_TOP + SPACING.sm` | wx 端 SAFE_TOP 自动算（胶囊 / 灵动岛），H5=0 + SPACING.sm 视觉缓冲 |
| 底部 | `SAFE_BOTTOM + SPACING.sm` | 同理（home indicator） |
| 左 | `SAFE_LEFT = SPACING.md` | 已自动注入 |
| 右 | `SAFE_RIGHT = SPACING.md` | 同 |

**反例**：`setPosition(0, 0)`（0 padding 顶住屏幕边）—— ❌ 拒绝

**正例**：`anchorTopLeft(W, H)` 自动用 SAFE_LEFT/TOP+ SPACING.sm

### 2.2 区块之间

- **顶部工具栏 / 中央 hub / 下方 grid** 三个区块之间：≥ `SPACING.lg`（24）
- **同区块内的子区块**（如 hub 里的星数行 + 主按钮 + 副标）：≥ `SPACING.sm`（8）

### 2.3 元素之间（同区块内）

| 场景 | 最小间距 |
|---|---|
| 按钮组横排（战备 / 商店 / 研究 / 百科） | `SPACING.sm` |
| 按钮组纵排（pause menu 选项） | `SPACING.sm` |
| 图标 + 文字（crystal-icon + credits） | `SPACING.xs` |
| 主按钮 vs 副按钮 | `SPACING.md` |
| 列表项之间 | `SPACING.sm` |
| 表单字段之间 | `SPACING.md` |

### 2.4 容器内 padding

| 容器类型 | 内 padding |
|---|---|
| 按钮 | `SPACING.sm`（左右）/ `SPACING.xs`（上下，按钮高度紧） |
| 卡片（hero card / pill） | `SPACING.sm` x / `SPACING.xs` y |
| modal | `SPACING.lg` |
| toast | `SPACING.sm` |

### 2.5 文字到容器边

`Text.setPadding()` 至少留 `SPACING.xs`（4px）—— 让字不顶到边框。

特殊情况：带 shadow blur 的 Text 要 setPadding 给 blur 留空间（项目用 `setPadding(px(20), px(16))` 之类，看 shadow blur 决定）。

---

## 3. Anchor 默认值

`anchorTopRight(W, H)` 等 helper 默认 `offsetX = SPACING.md`、`offsetY = SPACING.md`——直接用即可避免对屏边过近。

如果需要更紧（如顶部条想紧贴 SAFE_TOP），显式传 `offsetY = SPACING.sm` 或 `SPACING.xs`。

---

## 4. 检查清单（每个 scene 提交前自查）

- [ ] 没有裸 `px(整数)` —— 全部走 `SPACING.xx` 或 `SPACING.xx + SPACING.yy`
- [ ] 顶部 / 底部元素离 SAFE_TOP / SAFE_BOTTOM 至少 `SPACING.sm`
- [ ] 屏左 / 右元素到屏边至少 `SPACING.md`
- [ ] 区块之间垂直距离 ≥ `SPACING.lg`
- [ ] 没有元素相互重叠（cyber-frame 切角延伸 ≥ 4 px，需要预留 `SPACING.sm`）
- [ ] dev 期 Ctrl+Shift+L 打开 layout debug overlay 视觉走查
- [ ] mobile 480px 视口实测 + iPhone 14 / Pixel 5 模拟

---

## 5. 已踩过的坑（反面案例）

### 5.1 starsBox 重叠 IMMUNE TD 副标（commit `719b70e` 修）

**原因**：`starsY = centerY - px(28)` 经验值，`subtitle.y` 自然计算后两者间距只有 6 buffer px ≈ 3 CSS px，cyber-frame 切角伸出 3-5 px → 视觉相交。

**教训**：cyber-frame 切角元素之间至少 `SPACING.sm`（8 CSS px）缓冲。靠经验拍 `px(28)` 不行。

**正解**：

```ts
// before: const starsY = centerY - px(28);  // 凭感觉
// after:
const subtitleBottom = this.subtitle.y + this.subtitle.height;
const starsY = subtitleBottom + px(SPACING.sm) + boxH / 2;  // 显式留 SPACING.sm
```

### 5.2 4 高频按钮颜色花哨（commit `719b70e` 修）

每个按钮单独写 strokeColor 不同色：战备绿 / 商店金 / 研究紫 / 百科蓝—— 视觉乱。

**教训**：同级元素**视觉权重一致**，颜色统一（除非有明确语义区分）。

**正解**：4 高频按钮全用 `HEX.primary`，留中央"开始游戏"主按钮做唯一焦点色。

### 5.3 顶部 [设] 圆按钮 vs [登录/注册] 矩形按钮风格不一（commit `719b70e` 修）

同顶部条不同形状按钮 → 视觉不协调。

**教训**：同区块按钮**形状统一**。一组 icon button 全圆 / 全矩形 / 全切角；不混搭。

---

## 6. 工具

### 6.1 Layout debug overlay

dev 期按 **Ctrl+Shift+L** 打开 → 显示：
- safe-area 4 边描边
- 9 宫格 anchor 十字
- W/H/CSS/DPR 信息
- 当前 breakpoint 标签

用来看元素是否真在 SAFE_AREA 内、anchor 是否对齐。

### 6.2 Container helper

用 `Row` / `Column` / `Grid` 替代手写 layout 算法，spacing 自动应用：

```ts
const grid = new Grid(scene, {
  children: [equipBtn, shopBtn, researchBtn, encyclopediaBtn].map(btn => ({
    container: btn.container, cssWidth: 70, cssHeight: 38
  })),
  columns: 4,
  spacing: { x: SPACING.sm, y: SPACING.sm },
});
grid.setSize(stackWidth, 38);
```

详见 `README.md` § containers。

---

## 7. 不在范围（future / out-of-scope）

- 黑暗 / 高对比 / 色弱无障碍模式（accessibility）—— 后续单立 spec
- 横屏 / iPad layout 分支（断点系统已建好但分支未实装，留 TODO）
- 自适应字号 / 流式 layout —— 当前 mobile-first 480 上限够用
