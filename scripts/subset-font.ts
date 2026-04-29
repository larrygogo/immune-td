/**
 * 中文字体子集化：扫 src/ 源码中的汉字 + 标点 + 英数 ASCII，从源字体里切出 subset。
 *
 * 设计：
 *   - 输入 1：@fontsource/noto-sans-sc 的 chinese-simplified-*.woff2（fallback 链）
 *   - 输入 2：public/fonts/misans/MiSans-{Regular,Bold,Heavy}.ttf（中文主，方正锐利）
 *   - 输入 3：public/fonts/share-tech-mono/ShareTechMono-Regular.ttf
 *     （HUD 数字 mono 主字体，cyber 显示器风、OFL 1.1，仅 Regular 单字重）
 *   - 扫描范围：src/**\/*.{ts,tsx} + public/**\/*.json + index.html + docs/superpowers
 *   - 输出：
 *     - public/fonts/noto-sans-sc-subset-{400,700}.woff2  (中文 fallback)
 *     - public/fonts/misans-subset-{400,700,900}.woff2    (中文主)
 *     - public/fonts/share-tech-mono-subset-400.woff2     (mono 主)
 *   - 缓存：.font-cache.json 存字符集的 sha256 + 已生成的 family/weight 列表
 *     （字符 + family/weight 集合都未变时跳过）
 *
 * 运行：bun scripts/subset-font.ts
 * 接入：package.json "build" 脚本前置 prebuild = 本脚本
 *
 * 漏字兜底（非本脚本负责）：global.css 的 @font-face unicode-range 覆盖常用
 * CJK 范围，缺字 fallback 到 Noto Sans SC 子集 → 系统 "PingFang SC" / "YaHei" / "Noto CJK"。
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import subsetFont from 'subset-font';

const ROOT = resolve(import.meta.dir, '..');
// public/ 已搬到 apps/h5/public/（阶段 4 monorepo 重构）；脚本仍由根目录调用，路径补 apps/h5
const H5_ROOT = join(ROOT, 'apps/h5');
const NOTO_SOURCE_DIR = join(ROOT, 'node_modules/@fontsource/noto-sans-sc/files');
const MISANS_SOURCE_DIR = join(H5_ROOT, 'public/fonts/misans');
const SHARE_TECH_MONO_SOURCE_DIR = join(H5_ROOT, 'public/fonts/share-tech-mono');
const SHARE_TECH_MONO_FILE = 'ShareTechMono-Regular.ttf';
const OUT_DIR = join(H5_ROOT, 'public/fonts');
const CACHE_FILE = join(ROOT, '.font-cache.json');

/** Noto Sans SC 字重（fallback，体积小、保留兼容） */
const NOTO_WEIGHTS = [400, 700] as const;

/** MiSans 字重（主字体）→ 源 TTF 文件名映射。Heavy 对应 CSS 900，让标题加重时
 *  不会落到 synthetic bold（合成粗体糊）。 */
const MISANS_WEIGHTS = {
  400: 'MiSans-Regular.ttf',
  700: 'MiSans-Bold.ttf',
  900: 'MiSans-Heavy.ttf',
} as const;
type MiSansWeight = keyof typeof MISANS_WEIGHTS;
const MISANS_WEIGHT_LIST = Object.keys(MISANS_WEIGHTS).map(Number) as MiSansWeight[];

// 必须包含的基础字符集（ASCII 可打印 + 常用中文标点 + UI 几何 / 符号 / 箭头）。
// 子集化必须保留这些，否则数字/英文/UI 符号会 fallback 到系统字体（iOS/Android 把
// ▶ ✓ ♥ ★ 等 Unicode 符号渲染为彩色 emoji），造成风格不统一。
const BASE_CHARS =
  '!"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~ ' +
  // 常用中文标点
  '，。！？；：、（）「」『』【】《》“”‘’—…·' +
  // 全角空格 + 不间断空格
  '\u3000\u00A0' +
  // UI 几何 / 形状（▶ ◀ ▲ ▼ ● ○ ■ □ ◆ ◇）— 控制按钮 / 状态 dot / 提示用
  '▶◀▲▼●○■□◆◇' +
  // 箭头（← → ↑ ↓ ↔ ↕ ↻ ↺）— 选择关卡 / 旋转 / 上下选项用
  '←→↑↓↔↕↻↺' +
  // 符号（★ ☆ ♥ ♦ ✓ ✕ ✦）— 星级 / HP / 选中 / 关闭 用
  '★☆♥♦✓✕✦' +
  // 暂停 ❙（speed-controls 用 \u2759\u2759 = 双粗竖线）
  '\u2759';

// 扫源码得到的字符集 → hash；若与缓存一致，跳过子集化（秒过）
async function collectChars(): Promise<Set<string>> {
  const globs = [
    { dir: join(ROOT, 'src'), exts: ['.ts', '.tsx', '.css'] },
    { dir: join(H5_ROOT, 'src'), exts: ['.ts', '.tsx', '.css'] },
    { dir: join(ROOT, 'packages/core/src'), exts: ['.ts', '.tsx', '.css'] },
    { dir: join(H5_ROOT, 'public'), exts: ['.json'] },
    { dir: join(ROOT, 'docs/superpowers'), exts: ['.md'] },
  ];
  const files: string[] = [];
  for (const g of globs) {
    if (!existsSync(g.dir)) continue;
    await walk(g.dir, g.exts, files);
  }
  // 加上 index.html（单文件）
  const indexHtml = join(H5_ROOT, 'index.html');
  if (existsSync(indexHtml)) files.push(indexHtml);

  const chars = new Set<string>();
  for (const c of BASE_CHARS) chars.add(c);

  // 只提取 CJK + 基础拉丁 —— 不加 emoji、不加奇异符号，避免子集膨胀
  for (const file of files) {
    const txt = readFileSync(file, 'utf8');
    for (const ch of txt) {
      const code = ch.codePointAt(0);
      if (code === undefined) continue;
      // CJK 统一汉字
      if (code >= 0x4e00 && code <= 0x9fff) chars.add(ch);
      // CJK 扩展 A
      else if (code >= 0x3400 && code <= 0x4dbf) chars.add(ch);
      // 常用中文标点
      else if (code >= 0x3000 && code <= 0x303f) chars.add(ch);
      // 全角 ASCII
      else if (code >= 0xff00 && code <= 0xffef) chars.add(ch);
    }
  }
  return chars;
}

async function walk(dir: string, exts: string[], out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      await walk(full, exts, out);
    } else if (exts.some((ext) => e.name.endsWith(ext))) {
      out.push(full);
    }
  }
}

function hashChars(chars: Set<string>): string {
  const sorted = [...chars].sort().join('');
  return createHash('sha256').update(sorted).digest('hex').slice(0, 16);
}

interface Cache {
  charHash: string;
  charCount: number;
  /** 旧字段（仅 noto），保留兼容；新字段用 outputs */
  weights?: number[];
  /** 已生成的输出文件名列表（family-subset-W.woff2），缓存命中条件之一 */
  outputs?: string[];
}

function readCache(): Cache | null {
  if (!existsSync(CACHE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CACHE_FILE, 'utf8')) as Cache;
  } catch {
    return null;
  }
}

function writeCache(c: Cache): void {
  writeFileSync(CACHE_FILE, JSON.stringify(c, null, 2) + '\n', 'utf8');
}

/** 期望的输出文件名清单（family-subset-W.woff2）— Noto fallback + MiSans 主 + Share Tech Mono */
function expectedOutputs(): string[] {
  const out: string[] = [];
  for (const w of NOTO_WEIGHTS) out.push(`noto-sans-sc-subset-${w}.woff2`);
  for (const w of MISANS_WEIGHT_LIST) out.push(`misans-subset-${w}.woff2`);
  out.push('share-tech-mono-subset-400.woff2');
  return out;
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const chars = await collectChars();
  const hash = hashChars(chars);
  const sorted = [...chars].sort().join('');

  const expected = expectedOutputs();
  const cache = readCache();
  const allOutExist = expected.every((name) => existsSync(join(OUT_DIR, name)));
  const cachedOutputs = cache?.outputs ?? [];
  const outputsMatch =
    cachedOutputs.length === expected.length && expected.every((n) => cachedOutputs.includes(n));

  if (cache && cache.charHash === hash && outputsMatch && allOutExist) {
    console.log(`[subset-font] 字符集未变 (${chars.size} 字)，跳过 (${Date.now() - t0} ms)`);
    return;
  }

  console.log(`[subset-font] 字符集 ${chars.size} 字，开始子集化 ${expected.length} 个字重...`);
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  // 1. Noto Sans SC（fallback 链，必须存在）
  for (const w of NOTO_WEIGHTS) {
    const src = join(NOTO_SOURCE_DIR, `noto-sans-sc-chinese-simplified-${w}-normal.woff2`);
    if (!existsSync(src)) {
      console.error(`[subset-font] Noto 源文件缺失: ${src}`);
      process.exit(1);
    }
    const srcBuf = readFileSync(src);
    const out = await subsetFont(srcBuf, sorted, { targetFormat: 'woff2' });
    const outPath = join(OUT_DIR, `noto-sans-sc-subset-${w}.woff2`);
    writeFileSync(outPath, out);
    const sizeKb = (out.length / 1024).toFixed(1);
    console.log(`[subset-font]   noto ${w}: ${sizeKb} KB`);
  }

  // 2. MiSans（主字体）— 源 TTF 缺失就 warn 跳过，不阻断构建（CSS @font-face fallback 到 Noto）
  let misansMissingWarned = false;
  for (const w of MISANS_WEIGHT_LIST) {
    const filename = MISANS_WEIGHTS[w];
    const src = join(MISANS_SOURCE_DIR, filename);
    if (!existsSync(src)) {
      if (!misansMissingWarned) {
        console.warn(
          `[subset-font] ⚠ MiSans 源 TTF 缺失（${src}），跳过 MiSans subset，运行时 fallback 到 Noto。\n  首次构建请按 public/fonts/misans/README.md 下载 MiSans.zip 并解压 ttf/。`,
        );
        misansMissingWarned = true;
      }
      continue;
    }
    const srcBuf = readFileSync(src);
    const out = await subsetFont(srcBuf, sorted, { targetFormat: 'woff2' });
    const outPath = join(OUT_DIR, `misans-subset-${w}.woff2`);
    writeFileSync(outPath, out);
    const sizeKb = (out.length / 1024).toFixed(1);
    console.log(`[subset-font]   misans ${w}: ${sizeKb} KB`);
  }

  // 3. Share Tech Mono（HUD 数字 mono 主字体，仅 Regular 400）— 源 TTF 缺失就 warn 跳过，
  //   不阻断构建（CSS @font-face fallback 到 JetBrains Mono / 系统 mono）
  {
    const src = join(SHARE_TECH_MONO_SOURCE_DIR, SHARE_TECH_MONO_FILE);
    if (!existsSync(src)) {
      console.warn(
        `[subset-font] ⚠ Share Tech Mono 源 TTF 缺失（${src}），跳过 mono subset，运行时 fallback 到 JetBrains Mono。\n  首次构建请按 public/fonts/share-tech-mono/README.md 从 google/fonts GitHub 下载。`,
      );
    } else {
      const srcBuf = readFileSync(src);
      const out = await subsetFont(srcBuf, sorted, { targetFormat: 'woff2' });
      const outPath = join(OUT_DIR, 'share-tech-mono-subset-400.woff2');
      writeFileSync(outPath, out);
      const sizeKb = (out.length / 1024).toFixed(1);
      console.log(`[subset-font]   share-tech-mono 400: ${sizeKb} KB`);
    }
  }

  // 缓存写实际产出的文件名（misans 缺失时 outputs 会变短，下次 cache 不命中重试）
  const actualOutputs = expected.filter((name) => existsSync(join(OUT_DIR, name)));
  writeCache({ charHash: hash, charCount: chars.size, outputs: actualOutputs });
  console.log(`[subset-font] 完成 (${Date.now() - t0} ms)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
