#!/usr/bin/env bun
/**
 * 用 MiniMax image-01 批量生成 sprite。
 *
 * 使用：
 *   MINIMAX_API_KEY=sk-xxx bun scripts/generate-sprites-minimax.ts               # 全部生成
 *   MINIMAX_API_KEY=sk-xxx bun scripts/generate-sprites-minimax.ts macrophage    # 只名字含 macrophage 的
 *   MINIMAX_API_KEY=sk-xxx bun scripts/generate-sprites-minimax.ts --model image-01-live
 *
 * 输出：public/assets/{towers,pathogens}/*.png  1024×1024（1:1）
 *
 * API 文档：https://platform.minimaxi.com/document/Image%20Generation%20API
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const API_URL = 'https://api.minimaxi.com/v1/image_generation';

const STYLE_HEADER =
  'Stylized cyberpunk medical HUD icon, neon-on-dark aesthetic, glowing outline, ' +
  'minimal iconic silhouette on pure black background, centered composition, ' +
  'symmetrical design, high contrast, clean vector-like game asset, no text, no border.';

interface Spec {
  name: string;
  dir: 'towers' | 'pathogens';
  prompt: string;
}

const SPECS: readonly Spec[] = [
  {
    name: 'macrophage-1',
    dir: 'towers',
    prompt:
      'A stylized macrophage cell with amoeboid pseudopodia, teal neon glow, soft hexagonal core membrane, simple iconic silhouette.',
  },
  {
    name: 'macrophage-2',
    dir: 'towers',
    prompt:
      'A more developed macrophage cell with additional lysosome granules inside, thicker teal neon outline, slightly brighter glow.',
  },
  {
    name: 'macrophage-3',
    dir: 'towers',
    prompt:
      'Elite macrophage with prominent multiple pseudopodia reaching outward, bright teal neon aura, inner nucleus glowing intensely.',
  },
  {
    name: 'neutrophil-1',
    dir: 'towers',
    prompt:
      'Stylized neutrophil white blood cell with characteristic multi-lobed nucleus (3-4 visible lobes), cobalt-blue neon glow, round membrane with granular texture.',
  },
  {
    name: 'neutrophil-2',
    dir: 'towers',
    prompt:
      'Neutrophil with more defined lobed nucleus, brighter blue neon granules around perimeter, pulsing energy aura.',
  },
  {
    name: 'neutrophil-3',
    dir: 'towers',
    prompt:
      'Elite neutrophil, intense blue glow, dense granule pattern inside, faint secondary halo ring outside.',
  },
  {
    name: 'nkcell-1',
    dir: 'towers',
    prompt:
      'Stylized Natural Killer immune cell as a sniper-scope icon, magenta neon crosshair, diamond silhouette with crosshair reticle inside.',
  },
  {
    name: 'nkcell-2',
    dir: 'towers',
    prompt:
      'NK cell with double concentric scope rings, sharper magenta neon crosshairs, corner tick marks.',
  },
  {
    name: 'nkcell-3',
    dir: 'towers',
    prompt:
      'Elite NK cell, three concentric targeting rings, brightest magenta glow, central core pulsing energy.',
  },
  {
    name: 'dendritic-1',
    dir: 'towers',
    prompt:
      'Stylized dendritic immune cell with multiple branching dendrite extensions radiating outward from a central round cell body, warm golden-amber neon glow, simple iconic silhouette, antigen presenting feel.',
  },
  {
    name: 'dendritic-2',
    dir: 'towers',
    prompt:
      'Dendritic cell with more numerous and longer dendrite branches, brighter golden glow, small bright antigen particles visible at dendrite tips, slight inner glow in cell body.',
  },
  {
    name: 'dendritic-3',
    dir: 'towers',
    prompt:
      'Elite dendritic cell with dense radial dendrite network forming starburst pattern, intense golden-amber aura, central core pulsing with bright energy, halo of antigen particles around perimeter.',
  },
  {
    name: 'rhinovirus',
    dir: 'pathogens',
    prompt:
      'Stylized rhinovirus icosahedral capsid, hot-red/pink neon glow, 10-12 visible surface spike proteins, spherical silhouette.',
  },
  {
    name: 'influenza',
    dir: 'pathogens',
    prompt:
      'Stylized influenza virion, amber/yellow neon glow, surrounded by H-shaped glycoprotein spikes (hemagglutinin/neuraminidase), spherical body.',
  },
  {
    name: 'ecoli',
    dir: 'pathogens',
    prompt:
      'Stylized E.coli bacterium, violet/purple neon glow, rod-shaped body with rounded caps and a single whip-like flagellum tail.',
  },
  {
    name: 'saureus',
    dir: 'pathogens',
    prompt:
      'Stylized Staphylococcus aureus cluster, golden-orange neon glow, grape-like arrangement of 4 spherical cocci tightly bunched together.',
  },
  {
    name: 'aspergillus',
    dir: 'pathogens',
    prompt:
      'Stylized Aspergillus fungal spore, lime-green neon glow, spherical body with radial spikes and small particle dots around the perimeter, airborne ethereal feel.',
  },
];

interface MiniMaxResp {
  id?: string;
  data?: {
    image_urls?: string[];
    image_base64?: string[];
  };
  base_resp?: {
    status_code: number;
    status_msg: string;
  };
}

async function generate(spec: Spec, apiKey: string, model: string): Promise<void> {
  const prompt = `${STYLE_HEADER} ${spec.prompt}`;
  console.log(`[${spec.name}] 生成中...`);

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      aspect_ratio: '1:1',
      response_format: 'base64',
      n: 1,
      prompt_optimizer: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const json = (await res.json()) as MiniMaxResp;
  if (json.base_resp && json.base_resp.status_code !== 0) {
    throw new Error(`MiniMax ${json.base_resp.status_code}: ${json.base_resp.status_msg}`);
  }
  const b64 = json.data?.image_base64?.[0];
  if (!b64) {
    // 若接口返回 url，fallback 下载
    const url = json.data?.image_urls?.[0];
    if (url) {
      const imgRes = await fetch(url);
      if (!imgRes.ok) throw new Error(`下载 URL 失败 ${imgRes.status}`);
      const buf = Buffer.from(await imgRes.arrayBuffer());
      await saveToFile(spec, buf);
      return;
    }
    throw new Error(`响应无图片数据: ${JSON.stringify(json)}`);
  }
  await saveToFile(spec, Buffer.from(b64, 'base64'));
}

async function saveToFile(spec: Spec, buf: Buffer): Promise<void> {
  const outDir = resolve('public', 'assets', spec.dir);
  await mkdir(outDir, { recursive: true });
  const path = resolve(outDir, `${spec.name}.png`);
  await writeFile(path, buf);
  console.log(`[${spec.name}] ✓ ${path} (${Math.round(buf.length / 1024)}KB)`);
}

async function main(): Promise<void> {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    console.error('缺少 MINIMAX_API_KEY 环境变量');
    console.error('去 https://platform.minimaxi.com/user-center/basic-information/interface-key 领');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  let model = 'image-01';
  const filters: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model') {
      model = args[i + 1] ?? 'image-01';
      i++;
    } else if (args[i]) {
      filters.push(args[i] as string);
    }
  }

  const selected = filters.length
    ? SPECS.filter((s) => filters.some((f) => s.name.includes(f)))
    : SPECS;
  if (selected.length === 0) {
    console.error(`没有匹配 ${filters.join(', ')} 的 sprite`);
    process.exit(1);
  }

  console.log(`开始生成 ${selected.length} 张 sprite（model=${model}）...`);
  let ok = 0;
  let fail = 0;
  for (const spec of selected) {
    try {
      await generate(spec, apiKey, model);
      ok++;
      // 间隔稍长，避免限流（1002 错误码）
      await new Promise((r) => setTimeout(r, 800));
    } catch (err) {
      fail++;
      console.error(`[${spec.name}] 失败:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`\n完成：${ok} 成功，${fail} 失败`);
  console.log('生成的 PNG 是 1024×1024，建议再用 sharp/ImageMagick 缩到 256×256 或 128×128 减小体积：');
  console.log(
    '  for f in public/assets/**/*.png; do magick "$f" -resize 256x256 "$f"; done',
  );
}

void main();
