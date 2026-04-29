#!/usr/bin/env bun
/**
 * 一键并行启动前端 Vite dev + 后端 server dev。
 * 用法：`bun run dev:all`
 *
 * - 前端：subset-font + vite → localhost:5173
 * - 后端：server/bun --hot → localhost:3000
 * - Ctrl+C 统一杀两个子进程
 * - 任一进程提前退出 → 另一个也停 + 整体 exit 非零
 *
 * 零依赖（Bun 原生 spawn + signal handling）。
 */

import { spawn } from 'bun';

interface NamedProc {
  name: string;
  color: string;
  proc: ReturnType<typeof spawn>;
}

const COLORS = {
  web: '\x1b[36m', // cyan
  api: '\x1b[35m', // magenta
  reset: '\x1b[0m',
};

function launch(name: keyof typeof COLORS, cmd: string[], cwd?: string): NamedProc {
  const color = COLORS[name];
  const opts: Parameters<typeof spawn>[0] = {
    cmd,
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'inherit',
  };
  if (cwd) opts.cwd = cwd;
  const proc = spawn(opts);

  // 为每行 stdout/stderr 打上彩色前缀
  const pipe = async (stream: ReadableStream<Uint8Array> | null, prefix: string) => {
    if (!stream) return;
    const decoder = new TextDecoder();
    const reader = stream.getReader();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        process.stdout.write(`${prefix}${line}\n`);
      }
    }
    if (buf.length > 0) process.stdout.write(`${prefix}${buf}\n`);
  };
  const prefix = `${color}[${name}]${COLORS.reset} `;
  void pipe(proc.stdout as unknown as ReadableStream<Uint8Array>, prefix);
  void pipe(proc.stderr as unknown as ReadableStream<Uint8Array>, prefix);

  return { name, color, proc };
}

const procs: NamedProc[] = [];
let shuttingDown = false;

function killAll(signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM'): void {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const p of procs) {
    try {
      p.proc.kill(signal);
    } catch {
      // 进程已退出
    }
  }
}

process.on('SIGINT', () => {
  console.log('\n[dev-all] Ctrl+C 收到，关闭两个子进程...');
  killAll('SIGTERM');
  // 5s 后强杀还活着的
  setTimeout(() => killAll('SIGKILL'), 5000).unref?.();
});

// Windows bash 环境：npm script 通过 node_modules/.bin/vite 和 cd server 分开更稳
const web = launch('web', ['bun', 'run', 'dev']);
const api = launch('api', ['bun', 'run', 'dev'], 'server');
procs.push(web, api);

// 任一子进程退出 → 带 exit code 关另一个 + 退出
const winner = await Promise.race([
  web.proc.exited.then((code) => ({ name: 'web', code })),
  api.proc.exited.then((code) => ({ name: 'api', code })),
]);

console.log(`\n[dev-all] ${winner.name} 退出 (code=${winner.code})，正在停止另一个...`);
killAll('SIGTERM');

// 等另一个也停
await Promise.all(procs.map((p) => p.proc.exited));

process.exit(winner.code ?? 0);
