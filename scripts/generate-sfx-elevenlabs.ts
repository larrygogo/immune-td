#!/usr/bin/env bun
/**
 * 用 ElevenLabs Sound Effects API 批量生成游戏音效。
 *
 * 使用：
 *   ELEVENLABS_API_KEY=sk-xxx bun scripts/generate-sfx-elevenlabs.ts              # 全部生成
 *   ELEVENLABS_API_KEY=sk-xxx bun scripts/generate-sfx-elevenlabs.ts towerFire    # 只含 towerFire 的
 *
 * 输出：public/assets/sfx/*.mp3（默认 44.1kHz / 128kbps）
 *
 * 文档：https://elevenlabs.io/docs（"Sound Effects" / "Sound Generation" 节）
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const API_URL = 'https://api.elevenlabs.io/v1/sound-generation';

interface Spec {
  name: string;
  prompt: string;
  durationSeconds: number;
  promptInfluence?: number;
}

const SPECS: readonly Spec[] = [
  {
    name: 'towerPlace',
    durationSeconds: 0.6,
    prompt:
      'Sci-fi clean mechanical click with a soft biological membrane snapping into place, short, UI-confirm feel, no background music.',
  },
  {
    name: 'towerUpgrade',
    durationSeconds: 0.7,
    prompt:
      'Ascending energy charge-up with a bright synth chime arpeggio going up, triumphant upgrade feedback, clean, no music.',
  },
  {
    name: 'towerSell',
    durationSeconds: 0.5,
    prompt:
      'Short descending mechanical disassembly with a soft synth down-sweep, whoosh fading out, no music.',
  },
  {
    name: 'towerFire-macrophage',
    durationSeconds: 0.5,
    promptInfluence: 0.7,
    prompt:
      'A LOUD heavy bass drum kick combined with a wet meaty slap on top. Single powerful impact at maximum loudness, peak near 0 dBFS. Thick low-end punch, short decay. This must be very audible and full volume, NOT subtle.',
  },
  {
    name: 'towerFire-neutrophil',
    durationSeconds: 0.5,
    promptInfluence: 0.5,
    prompt:
      'A subdued pneumatic puff with a brief mid-frequency organic click, soft granule release burst, warm and muted. Short single shot. No high-pitched laser, no piercing tone, no sharp metallic zap.',
  },
  {
    name: 'towerFire-nkcell',
    durationSeconds: 0.7,
    prompt:
      'Crisp sniper pulse shot with a clean high frequency tail and brief reverb, precise and powerful, single shot.',
  },
  {
    name: 'pathogenKilled',
    durationSeconds: 0.5,
    promptInfluence: 0.5,
    prompt:
      'A wet squishy biological cell membrane rupturing, soft goo bubble bursting with slimy mucus splatter, juicy organic pop. No metal, no mechanical clang, no explosion. Purely wet and squishy.',
  },
  {
    name: 'waveStart',
    durationSeconds: 1.2,
    prompt:
      'Medical alarm alert, low-frequency horn buildup with a slight ascending pitch and sci-fi warning pulse, tense.',
  },
  {
    name: 'waveEnd',
    durationSeconds: 1.0,
    prompt:
      'Soothing metallic chime bell with soft reverb, completion/clear notification, positive but subtle.',
  },
  {
    name: 'levelWon',
    durationSeconds: 1.8,
    prompt:
      'Cyberpunk victory fanfare, bright ascending triumphant arpeggio of four notes going up, short and snappy, clean synth.',
  },
  {
    name: 'levelLost',
    durationSeconds: 1.5,
    prompt:
      'System shutdown failure, dark descending synth crash with power-off whine, ominous and heavy.',
  },
  {
    name: 'error',
    durationSeconds: 0.5,
    prompt:
      'Short negative UI buzz, harsh low denial tone, typical game "cannot do" feedback.',
  },
  {
    name: 'uiClick',
    durationSeconds: 0.5,
    promptInfluence: 0.75,
    prompt:
      'A single soft warm UI tap, like pressing a premium mobile app button. Clean rounded low-mid frequency blip, very brief and satisfying. No reverb, no metallic ring, no sharp high-frequency edges, no zap, no digital shimmer. Just one gentle tick.',
  },
];

async function generate(spec: Spec, apiKey: string): Promise<void> {
  console.log(`[${spec.name}] 生成中 (${spec.durationSeconds}s)...`);
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: spec.prompt,
      duration_seconds: spec.durationSeconds,
      prompt_influence: spec.promptInfluence ?? 0.3,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const outDir = resolve('public', 'assets', 'sfx');
  await mkdir(outDir, { recursive: true });
  const path = resolve(outDir, `${spec.name}.mp3`);
  await writeFile(path, buf);
  console.log(`[${spec.name}] ✓ ${path} (${Math.round(buf.length / 1024)}KB)`);
}

async function main(): Promise<void> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error('缺少 ELEVENLABS_API_KEY 环境变量');
    console.error('去 https://elevenlabs.io 领取 API key');
    process.exit(1);
  }

  const filters = process.argv.slice(2);
  const selected = filters.length
    ? SPECS.filter((s) => filters.some((f) => s.name.includes(f)))
    : SPECS;

  if (selected.length === 0) {
    console.error(`没有匹配 ${filters.join(', ')} 的音效`);
    process.exit(1);
  }

  console.log(`开始生成 ${selected.length} 个音效...`);
  let ok = 0;
  let fail = 0;
  for (const spec of selected) {
    try {
      await generate(spec, apiKey);
      ok++;
      // 间隔稍长，避免限流
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      fail++;
      console.error(`[${spec.name}] 失败:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`\n完成：${ok} 成功，${fail} 失败`);
}

void main();
