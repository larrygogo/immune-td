/**
 * 把 public/assets/towers + pathogens 下所有 SVG 转 256×256 PNG
 * 用途：wx 端不支持 Blob，SVG 加载走 createObjectURL 路径有兼容问题，
 * 项目内统一用 PNG 资源（H5 也跟随用 PNG，简化双端资源链）。
 *
 * 用法：bun scripts/svg-to-png.ts
 * 输出：覆盖同名 .png（每个 .svg 生成对应 .png）
 */
import { readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const ROOT = resolve(import.meta.dir, '..');
const TARGETS = ['public/assets/towers', 'public/assets/pathogens'];
const SIZE = 256;

let total = 0;
for (const sub of TARGETS) {
  const dir = resolve(ROOT, sub);
  let count = 0;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.svg')) continue;
    const src = `${dir}/${name}`;
    const dst = `${dir}/${name.replace(/\.svg$/, '.png')}`;
    await sharp(src, { density: 600 })
      .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(dst);
    const sz = statSync(dst).size;
    console.log(`✓ ${sub}/${name.replace(/\.svg$/, '.png')} (${(sz / 1024).toFixed(1)} KB)`);
    count++;
    total++;
  }
  console.log(`  ${sub}: ${count} converted`);
}
console.log(`\n✅ ${total} SVG → ${SIZE}×${SIZE} PNG done`);
