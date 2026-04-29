#!/usr/bin/env bun
/**
 * 用 MiniMax 音乐生成 API 批量生成关卡 BGM。
 *
 * 使用：
 *   MINIMAX_API_KEY=sk-xxx bun scripts/generate-bgm-minimax.ts              # 全部生成
 *   MINIMAX_API_KEY=sk-xxx bun scripts/generate-bgm-minimax.ts battle       # 只含 battle 的
 *
 * 输出：public/assets/bgm/*.mp3（44.1kHz / 256kbps 纯器乐）
 *
 * API 文档：https://platform.minimaxi.com/document/Music%20Generation
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const API_URL = 'https://api.minimaxi.com/v1/music_generation';

interface Spec {
  name: string;
  prompt: string;
}

const SPECS: readonly Spec[] = [
  {
    name: 'menu',
    prompt:
      'Ambient futuristic medical HUD background music, sparse ethereal synth pads, slow evolving atmospheric textures, ' +
      'subtle glitchy micro-details, contemplative and calm, no drums or minimal percussion, loopable, cyberpunk neon-on-dark vibe, pure instrumental.',
  },
  {
    name: 'battle',
    prompt:
      'Driving cyberpunk electronic battle music, tense dark synth bassline, medium tempo around 110 BPM, ' +
      'punchy percussive elements, urgent medical emergency feel, pulsing arpeggios, loopable, pure instrumental, no vocals.',
  },
];

interface MiniMaxMusicResp {
  data?: {
    audio?: string; // hex 编码
  };
  base_resp?: {
    status_code: number;
    status_msg: string;
  };
  trace_id?: string;
}

function hexToBuffer(hex: string): Buffer {
  // 去除可能的前缀 0x 与空白
  const clean = hex.replace(/^0x/, '').replace(/\s+/g, '');
  return Buffer.from(clean, 'hex');
}

async function generate(spec: Spec, apiKey: string): Promise<void> {
  console.log(`[${spec.name}] 生成中...`);
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'music-2.6',
      prompt: spec.prompt,
      is_instrumental: true,
      audio_setting: {
        sample_rate: 44100,
        bitrate: 256000,
        format: 'mp3',
      },
      output_format: 'hex',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const json = (await res.json()) as MiniMaxMusicResp;
  if (json.base_resp && json.base_resp.status_code !== 0) {
    throw new Error(`MiniMax ${json.base_resp.status_code}: ${json.base_resp.status_msg}`);
  }
  const hex = json.data?.audio;
  if (!hex) {
    throw new Error(`响应无音频数据: ${JSON.stringify(json).slice(0, 300)}`);
  }

  const buf = hexToBuffer(hex);
  const outDir = resolve('public', 'assets', 'bgm');
  await mkdir(outDir, { recursive: true });
  const path = resolve(outDir, `${spec.name}.mp3`);
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

  const filters = process.argv.slice(2);
  const selected = filters.length
    ? SPECS.filter((s) => filters.some((f) => s.name.includes(f)))
    : SPECS;
  if (selected.length === 0) {
    console.error(`没有匹配 ${filters.join(', ')} 的 BGM`);
    process.exit(1);
  }

  console.log(`开始生成 ${selected.length} 首 BGM...`);
  let ok = 0;
  let fail = 0;
  for (const spec of selected) {
    try {
      await generate(spec, apiKey);
      ok++;
      await new Promise((r) => setTimeout(r, 1500));
    } catch (err) {
      fail++;
      console.error(`[${spec.name}] 失败:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`\n完成：${ok} 成功，${fail} 失败`);
}

void main();
