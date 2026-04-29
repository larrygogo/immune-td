/**
 * 自动下载源字体 TTF（subset-font.ts 的输入）
 *
 * 设计：
 *   - MiSans: hyperos.mi.com/font-download/MiSans.zip → 解 3 个字重 TTF 到 public/fonts/misans/
 *   - Share Tech Mono: github raw → 单 TTF 到 public/fonts/share-tech-mono/
 *   - 幂等：已存在则跳过；下载失败不挂全局（caller 自行兜）
 *   - 跨平台 unzip：win32 走 PowerShell Expand-Archive，其它走 unzip
 *   - CI / SKIP_FONT_INSTALL=1 自动跳过（CI 走 subset-font 的 fallback 链路即可）
 *
 * 运行：bun scripts/install-fonts.ts
 * 接入：package.json postinstall（失败不挂依赖安装）
 *
 * 协议：MiSans 不允许"再分发字体文件"，所以源 TTF 走 .gitignore + 本地下载，
 * 不进 git 仓库（哪怕 private repo 也避免协作者越线）。
 */

import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const MISANS_DIR = join(ROOT, 'public/fonts/misans');
const SHARE_TECH_DIR = join(ROOT, 'public/fonts/share-tech-mono');

const MISANS_ZIP_URL = 'https://hyperos.mi.com/font-download/MiSans.zip';
const MISANS_FILES = [
  { src: 'MiSans/ttf/MiSans-Regular.ttf', dst: 'MiSans-Regular.ttf' },
  { src: 'MiSans/ttf/MiSans-Bold.ttf', dst: 'MiSans-Bold.ttf' },
  { src: 'MiSans/ttf/MiSans-Heavy.ttf', dst: 'MiSans-Heavy.ttf' },
] as const;

const SHARE_TECH_URL =
  'https://github.com/google/fonts/raw/main/ofl/sharetechmono/ShareTechMono-Regular.ttf';
const SHARE_TECH_FILE = 'ShareTechMono-Regular.ttf';

const isWin = process.platform === 'win32';

function log(msg: string) {
  console.log(`[install-fonts] ${msg}`);
}

function warn(msg: string) {
  console.warn(`[install-fonts] ${msg}`);
}

async function downloadWithProgress(url: string, dst: string, label: string) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  const total = Number(res.headers.get('content-length') ?? 0);
  if (!res.body) throw new Error(`无响应体: ${url}`);

  const chunks: Uint8Array[] = [];
  const reader = res.body.getReader();
  let downloaded = 0;
  let lastTick = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      downloaded += value.byteLength;
      const now = Date.now();
      if (now - lastTick > 200 && total > 0) {
        const mb = (downloaded / 1e6).toFixed(1);
        const totalMb = (total / 1e6).toFixed(1);
        process.stdout.write(`\r[install-fonts] ⬇ ${label} ${mb} / ${totalMb} MB`);
        lastTick = now;
      }
    }
  }
  if (total > 0) process.stdout.write('\n');
  writeFileSync(dst, Buffer.concat(chunks));
}

function unzip(zipPath: string, destDir: string) {
  if (isWin) {
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`,
      ],
      { stdio: 'inherit' },
    );
  } else {
    execFileSync('unzip', ['-o', '-q', zipPath, '-d', destDir], { stdio: 'inherit' });
  }
}

async function installMiSans() {
  const allExist = MISANS_FILES.every((f) => existsSync(join(MISANS_DIR, f.dst)));
  if (allExist) {
    log('✓ MiSans 已存在，跳过');
    return;
  }
  if (!existsSync(MISANS_DIR)) mkdirSync(MISANS_DIR, { recursive: true });

  const tmp = mkdtempSync(join(tmpdir(), 'misans-'));
  const zipPath = join(tmp, 'MiSans.zip');
  try {
    log('⬇ 下载 MiSans.zip（~ 230 MB，初次较慢）...');
    await downloadWithProgress(MISANS_ZIP_URL, zipPath, 'MiSans.zip');

    log('📦 解压 MiSans...');
    unzip(zipPath, tmp);

    for (const f of MISANS_FILES) {
      const src = join(tmp, ...f.src.split('/'));
      const dst = join(MISANS_DIR, f.dst);
      if (!existsSync(src)) throw new Error(`zip 中找不到 ${f.src}`);
      copyFileSync(src, dst);
    }
    log('✓ MiSans 安装完成');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function installShareTechMono() {
  const dst = join(SHARE_TECH_DIR, SHARE_TECH_FILE);
  if (existsSync(dst)) {
    log('✓ Share Tech Mono 已存在，跳过');
    return;
  }
  if (!existsSync(SHARE_TECH_DIR)) mkdirSync(SHARE_TECH_DIR, { recursive: true });

  log('⬇ 下载 Share Tech Mono（~ 42 KB）...');
  await downloadWithProgress(SHARE_TECH_URL, dst, 'ShareTechMono-Regular.ttf');
  log('✓ Share Tech Mono 安装完成');
}

async function main() {
  if (process.env.CI === 'true' || process.env.SKIP_FONT_INSTALL === '1') {
    log('CI / SKIP_FONT_INSTALL=1，跳过字体下载（subset-font 会 fallback）');
    return;
  }

  // 两个独立任务并行；任一失败抛出由外层 try 兜
  await Promise.all([installMiSans(), installShareTechMono()]);
}

main().catch((e) => {
  warn(`⚠ 字体下载失败: ${e instanceof Error ? e.message : String(e)}`);
  warn('⚠ 不影响依赖安装。可手动运行 `bun run setup:fonts` 重试，');
  warn('⚠ 或参考 public/fonts/misans/README.md / public/fonts/share-tech-mono/README.md 手动放置 TTF。');
  process.exit(0);
});
