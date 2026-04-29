import { DPR } from './dpr';
import { getFitScale } from './fit-scale';

/**
 * 共享设计令牌（颜色 + 字体 + px helper），保证所有 Scene 风格统一。
 *
 * 对齐 DESIGN_SYSTEM.md (生物医学图谱风) 的完整色板。旧的短名
 * `primary / accent / dim / danger / bg` 保留作 alias，callsites 不用改；
 * 新代码优先用语义 token（immune / neutro / virus / text / bg-deep 等）。
 */

// ------- 字体栈（DESIGN_SYSTEM §3.1） -------

/**
 * 中文 UI 常规 —— MiSans 主（小米开源 / 方正锐利 / cyber-on-dark 美学），
 * 加载失败 fallback 到 Noto Sans SC subset → 系统中文字体。
 * 字重档：400 (Regular) / 700 (Bold) / 900 (Heavy)。重要标题 fontStyle:'bold' 命中 700,
 * 显式 fontStyle:'900' 命中 Heavy（subset-font.ts 同步 subset 这三个字重）。
 */
export const FONT_SANS_CN =
  '"MiSans", "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

/** 中文衬线标题 / 学术段 —— 标题 + 描述引用感 */
export const FONT_SERIF_CN = '"Noto Serif SC", "Source Han Serif SC", serif';

/** 标题 / 拉丁学名（italic） */
export const FONT_DISPLAY = '"Fraunces", "Noto Serif SC", serif';

/**
 * 数据 / 数字 / 单位 / 标签（等宽）。
 * Share Tech Mono 仅 Regular 400 字重（OFL 1.1，~8 KB subset 由 scripts/subset-font.ts
 * 生成，global.css @font-face 引用），cyber 显示器风、锐利方正，跟 MiSans 视觉协调。
 * JetBrains Mono 400/600/700 仍通过 @fontsource 打包（main.web.tsx），作粗体 fallback
 * 链：fontStyle:'bold' 在 Share Tech Mono 上是 synthetic bold（无 700 字形），但视觉上
 * 仍偏锐利；如需真 700 字重粗体，加载顺序会落到 JetBrains Mono 700。
 */
export const FONT_MONO =
  '"Share Tech Mono", "JetBrains Mono", "IBM Plex Mono", "SF Mono", Consolas, monospace';

/**
 * 通用字体栈（与 FONT_SANS_CN 等价别名）。
 *
 * 历史包袱：之前是 mono + sans-cn 混栈（'JetBrains Mono' 排首位 → 拉丁字符走 mono、
 * 中文 fallback 到 sans-cn），导致 UI 中英文度量不一 + 字体感不统一。
 *
 * 现统一收敛到 FONT_SANS_CN（Noto Sans SC 主栈），中英文都用同一种字体度量。
 * 数据 / 数字（HP/ATP/wave 等）仍走 FONT_MONO（等宽避免数字位数变化时宽度抖动）。
 *
 * `global.css` 的 Noto Sans SC @font-face unicode-range 已加 `U+0020-007F`，
 * woff2 同时覆盖 ASCII + CJK，无需 fallback 到系统拉丁字体。
 */
export const FONT = FONT_SANS_CN;

// ------- 颜色（字符串，用于 Text style.color） -------

export const COLOR = {
  // ===== 免疫主色（防御阵营） =====
  immune: '#5de0b5', // 主青绿
  immuneBright: '#8ff5d2', // 高光
  immuneDim: '#2a8a72', // 暗青
  immuneDeep: '#0d3d33', // 深底青

  // ===== 防御细胞亚色 =====
  macro: '#5de0b5', // 巨噬（= immune）
  neutro: '#6ed4ee', // 中性粒（冰蓝）
  nk: '#ff8fc4', // NK（柔粉）
  tcell: '#ffc870', // T 细胞（琥珀）

  // ===== 病原色系 =====
  virus: '#ff5ba8', // 病毒（荧光洋红）
  virusDim: '#8a2e5c',
  bacteria: '#b84de0', // 细菌（紫）
  bacteriaDim: '#5c267a',
  fungus: '#ff8050', // 真菌（橙）

  // ===== 文本层级 =====
  text: '#e8f0ec', // 主文本
  textWarm: '#e0d8d0', // 暖偏（引述）
  textBright: '#cbd5e1', // 二级白（卡片副标）
  textDim: '#8a9e98', // 次级
  textMuted: '#aaaaaa', // 灰（diff 值、非选中标签）
  textXDim: '#4a6058', // 最灰
  textPlaceholder: '#444444', // 极灰（未解锁关卡）

  // ===== 状态色 =====
  danger: '#ff4050',
  warn: '#ffb84a',
  success: '#5de0b5', // = immune

  // ===== HP 档位（entity HP bar / 爆破警示） =====
  hpHigh: '#44ff88',
  hpMid: '#ffcc44',
  hpLow: '#ff4466',

  // ===== UI 高亮 / 奖励 =====
  highlight: '#ffcc44', // 教学 spotlight / 选中塔环 / HP 半残黄
  highlightSoft: '#ffaa44', // LevelBriefing 暖黄框
  rewardGold: '#ffee88', // 通关解锁奖励金
  starDim: '#555555', // 失败三星灰

  // ===== 功能色 =====
  protected: '#66ddff', // 保护细胞蓝 / helper 塔辅助环
  replay: '#c770ff', // 回放紫
  disabled: '#555e68', // 禁用前景
  disabledBg: '#222a33', // 禁用 knob 底

  // ===== 基础色 =====
  white: '#ffffff',
  black: '#000000',

  // ===== 背景层 =====
  bgDeep: '#070a0c', // 最深背景
  bgCard: '#0d1518', // 卡片底
  bgCardAlt: '#0a1114', // 次级容器
  gridLine: '#0a1a2a', // 棋盘网格线
  cellEntry: '#0d2b20', // 入口格底
  cellExit: '#2b0d1a', // 出口格底
  replayBg: '#220a2a', // 回放 banner 暗紫底

  // ===== 旧名 alias（保留 backward-compat） =====
  primary: '#5de0b5', // 原 #22ffaa → immune
  accent: '#6ed4ee', // 原 #80c0ff → neutro
  dim: '#8a9e98', // 原 #7090b0 → text-dim
  bg: '#070a0c', // 原 #050a12 → bg-deep
} as const;

// ------- 颜色（hex 数值，用于 Graphics fillStyle/lineStyle） -------

export const HEX = {
  immune: 0x5de0b5,
  immuneBright: 0x8ff5d2,
  immuneDim: 0x2a8a72,
  immuneDeep: 0x0d3d33,

  macro: 0x5de0b5,
  neutro: 0x6ed4ee,
  nk: 0xff8fc4,
  tcell: 0xffc870,

  virus: 0xff5ba8,
  virusDim: 0x8a2e5c,
  bacteria: 0xb84de0,
  bacteriaDim: 0x5c267a,
  fungus: 0xff8050,

  text: 0xe8f0ec,
  textWarm: 0xe0d8d0,
  textBright: 0xcbd5e1,
  textDim: 0x8a9e98,
  textMuted: 0xaaaaaa,
  textXDim: 0x4a6058,
  textPlaceholder: 0x444444,

  danger: 0xff4050,
  warn: 0xffb84a,
  success: 0x5de0b5,

  // UI 高亮 / 奖励
  highlight: 0xffcc44,
  highlightSoft: 0xffaa44,
  buffRing: 0xffd860, // M5 受 buff 攻击塔的金色光晕
  rewardGold: 0xffee88,
  starDim: 0x555555,

  // 功能色
  protected: 0x66ddff,
  replay: 0xc770ff,
  disabled: 0x555e68,
  disabledBg: 0x222a33,

  // HP 档位（entity HP bar 专用，颜色略深于 warn/danger 以和 UI 状态色区分）
  hpHigh: 0x44ff88, // tower HP ≥60%
  hpMid: 0xffcc44, // 30~60%（= highlight）
  hpLow: 0xff4466, // <30%
  hpBarHigh: 0x44dd88, // 保护细胞 / HUD HP ≥66%
  hpBarLow: 0xff6666, // 保护细胞 / HUD HP <33%
  hpOrange: 0xff9933, // pathogen HP bar 半残橙

  // Pathogen fallback
  pathogenFallback: 0xff3366,

  // 基础色
  white: 0xffffff,
  black: 0x000000,

  bgDeep: 0x070a0c,
  bgCard: 0x0d1518,
  bgCardAlt: 0x0a1114,
  gridLine: 0x0a1a2a,
  cellEntry: 0x0d2b20,
  cellExit: 0x2b0d1a,
  arrowEntry: 0x4ade80, // 入口箭头亮绿
  arrowExit: 0xff6b88, // 出口箭头粉红
  replayBg: 0x220a2a,

  // 旧名 alias
  primary: 0x5de0b5,
  accent: 0x6ed4ee,
  dim: 0x8a9e98,
  bg: 0x070a0c,
} as const;

/**
 * 设计 CSS 像素 → Phaser 内部 buffer 像素。
 *
 * `n × DPR × fitScale`：DPR 解决 Retina 物理像素密度，fitScale 让 buffer 永远跟设备
 * 实际 CSS 尺寸对齐（参考 Cocos design resolution + FIXED_WIDTH 策略）。这样 scene
 * 用 px(DESIGN_W)=DESIGN_W*DPR*fitScale = buffer.width 正好充满，画面在 PC / 平板
 * 上不会被浏览器上采样模糊。
 *
 * fitScale 在 init.ts createPhaserGame() 前 setFitScale(...) 写入，window resize 时
 * 同步更新（resize → 重 setSize buffer + 重 fire scene resize 让所有 layout 重算）。
 */
export const px = (n: number) => n * DPR * getFitScale();
