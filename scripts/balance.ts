#!/usr/bin/env bun
/**
 * balance.ts — 批量胜率扫描 CLI。
 *
 * 用法：
 *   bun scripts/balance.ts                  # 扫全关 × 3 档 bot
 *   bun scripts/balance.ts --level 5        # 单关
 *   bun scripts/balance.ts --level 1,2,3    # 逗号分隔多关
 *   bun scripts/balance.ts --runs 30        # 调样本数（默认 20）
 *   bun scripts/balance.ts --csv out.csv    # 同时导 CSV
 */

import { writeFileSync } from 'node:fs';
import { IMPLEMENTED_LEVEL_IDS, getLevel } from '../src/game-engine/game/data/levels';
import {
  ALL_BOTS,
  type BalanceReport,
  type BotPolicy,
  estimateDifficulty,
} from '../src/game-engine/game/simulator';

interface CliArgs {
  levels: readonly number[];
  runs: number;
  csvPath: string | null;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args = { levels: null as number[] | null, runs: 20, csvPath: null as string | null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--level' || a === '-l') {
      const v = argv[++i];
      if (!v) throw new Error('--level 缺少值');
      args.levels = v.split(',').map((s) => Number.parseInt(s.trim(), 10));
    } else if (a === '--runs' || a === '-r') {
      const v = argv[++i];
      if (!v) throw new Error('--runs 缺少值');
      args.runs = Number.parseInt(v, 10);
    } else if (a === '--csv') {
      const v = argv[++i];
      if (!v) throw new Error('--csv 缺少文件名');
      args.csvPath = v;
    } else if (a === '--help' || a === '-h') {
      console.log(HELP);
      process.exit(0);
    }
  }
  // 默认扫所有已实现非教学关
  const levels =
    args.levels ??
    IMPLEMENTED_LEVEL_IDS.filter((id) => {
      try {
        return getLevel(id).isTutorial !== true;
      } catch {
        return false;
      }
    });
  return { levels, runs: args.runs, csvPath: args.csvPath };
}

const HELP = `balance.ts — 批量胜率扫描

选项:
  --level <ids>   逗号分隔的关卡 id（默认全部非教学关）
  --runs <N>      每档 bot 采样数（默认 20）
  --csv <path>    导出 CSV
  --help          显示此帮助
`;

function pct(v: number): string {
  return `${(v * 100).toFixed(0).padStart(3)}%`;
}

function padEnd(s: string | number, n: number): string {
  return String(s).padEnd(n);
}
function padStart(s: string | number, n: number): string {
  return String(s).padStart(n);
}

function printHeader(bots: readonly BotPolicy[]): void {
  const cols = ['Lv', 'Title'];
  for (const b of bots) {
    cols.push(`${b.name}.win`, `${b.name}.hp`, `${b.name}.★`);
  }
  const header = [
    padEnd(cols[0] as string, 3),
    padEnd(cols[1] as string, 22),
    ...bots.flatMap((_, i) => {
      const o = 2 + i * 3;
      return [
        padStart(cols[o] as string, 9),
        padStart(cols[o + 1] as string, 7),
        padStart(cols[o + 2] as string, 5),
      ];
    }),
  ].join(' ');
  console.log(header);
  console.log('-'.repeat(header.length));
}

function printRow(
  levelId: number,
  title: string,
  reports: readonly BalanceReport[],
): void {
  const cells = [padEnd(levelId, 3), padEnd(title.slice(0, 20), 22)];
  for (const r of reports) {
    cells.push(
      padStart(pct(r.winRate), 9),
      padStart(r.avgHpRemaining.toFixed(1), 7),
      padStart(r.avgStars.toFixed(1), 5),
    );
  }
  console.log(cells.join(' '));
}

function toCsv(rows: readonly CsvRow[], bots: readonly BotPolicy[]): string {
  const headers = ['level_id', 'title'];
  for (const b of bots) {
    headers.push(
      `${b.name}_win_rate`,
      `${b.name}_avg_hp`,
      `${b.name}_avg_stars`,
      `${b.name}_avg_leaked`,
      `${b.name}_avg_tower_deaths`,
    );
  }
  const lines = [headers.join(',')];
  for (const row of rows) {
    const cells: (string | number)[] = [row.levelId, `"${row.title}"`];
    for (const r of row.reports) {
      cells.push(
        r.winRate.toFixed(4),
        r.avgHpRemaining.toFixed(2),
        r.avgStars.toFixed(2),
        r.avgLeaked.toFixed(2),
        r.avgTowerDeaths.toFixed(2),
      );
    }
    lines.push(cells.join(','));
  }
  return lines.join('\n');
}

interface CsvRow {
  levelId: number;
  title: string;
  reports: readonly BalanceReport[];
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const bots = ALL_BOTS;
  const seeds = Array.from({ length: args.runs }, (_, i) => i + 1);

  console.log(
    `Balance scan · levels=[${args.levels.join(',')}] × bots=[${bots.map((b) => b.name).join(',')}] × seeds=${args.runs}`,
  );
  console.log('');
  printHeader(bots);

  const rows: CsvRow[] = [];
  const t0 = Date.now();
  for (const levelId of args.levels) {
    let title = `(lv ${levelId})`;
    try {
      title = getLevel(levelId).title;
    } catch {
      console.log(`Lv ${levelId} 未配置，跳过`);
      continue;
    }
    const reports: BalanceReport[] = [];
    for (const bot of bots) {
      reports.push(estimateDifficulty(levelId, { policy: bot, seeds }));
    }
    printRow(levelId, title, reports);
    rows.push({ levelId, title, reports });
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('');
  console.log(`耗时 ${elapsed}s · ${args.levels.length} 关 × ${bots.length} bot × ${args.runs} seed`);

  if (args.csvPath) {
    writeFileSync(args.csvPath, toCsv(rows, bots));
    console.log(`CSV → ${args.csvPath}`);
  }
}

main();
