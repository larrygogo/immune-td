/**
 * 一次性调优脚本：对 balance-baseline 的 KNOWN_OUTLIERS 关跑 tuner 建议值。
 * 运行：bun scripts/tune-outliers.ts
 * 结果仅供参考，最终数值由设计师判断（比如 initialAtp 要凑整数倍塔价）。
 */

import { estimateDifficulty, greedyBot } from '../src/game-engine/game/simulator';
import { type TunableParam, solveForWinRate } from '../src/game-engine/game/tuner';

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);

interface OutlierPlan {
  levelId: number;
  label: string;
  target: number; // 目标胜率
  param: TunableParam;
  range: [number, number];
}

const plans: OutlierPlan[] = [
  // 关 1：新手首关应较容易；主要加 ATP 让 bot 多铺塔
  {
    levelId: 1,
    label: '关 1「初次感染」— 调 initialAtp（新手关目标胜率 60%）',
    target: 0.6,
    param: { type: 'initialAtp' },
    range: [100, 260],
  },
  // 关 4：tuner 试过 initialAtp 100-280 全 0% → 不是 ATP 问题，改调 waveHpMultiplierAll
  {
    levelId: 4,
    label: '关 4「真皮网格」— 调 waveHpMultiplierAll（bot 双入口分兵差，目标胜率 40%）',
    target: 0.4,
    param: { type: 'waveHpMultiplierAll' },
    range: [0.5, 1.2],
  },
  // 关 8：helper-tower 过强，降 initialAtp 或提高 HP 倍率；选后者避免让玩家觉得抠门
  {
    levelId: 8,
    label: '关 8「抗原呈递」— 调 waveHpMultiplierAll（helper 过强，目标胜率 55%）',
    target: 0.55,
    param: { type: 'waveHpMultiplierAll' },
    range: [0.8, 2.0],
  },
  // 关 9：carryLimit=3 + 混编太难，提高 ATP；如仍不够降 HP 倍率
  {
    levelId: 9,
    label: '关 9「肺间质纤维化」— 调 initialAtp（carryLimit 压力，目标胜率 40%）',
    target: 0.4,
    param: { type: 'initialAtp' },
    range: [130, 320],
  },
];

console.log('='.repeat(70));
for (const plan of plans) {
  console.log(`\n${plan.label}`);
  const before = estimateDifficulty(plan.levelId, { policy: greedyBot, seeds: SEEDS });
  console.log(
    `  调前 greedy 胜率：${(before.winRate * 100).toFixed(0)}% (wins=${before.outcomes.won}/${SEEDS.length})`,
  );

  const result = solveForWinRate(plan.levelId, {
    target: plan.target,
    param: plan.param,
    range: plan.range,
    tolerance: 0.08,
    seeds: SEEDS,
    maxIterations: 8,
  });

  const paramName =
    plan.param.type === 'initialAtp'
      ? 'initialAtp'
      : plan.param.type === 'initialHp'
        ? 'initialHp'
        : plan.param.type === 'waveHpMultiplierAll'
          ? 'waveHpMultiplier ALL × scale'
          : plan.param.type;
  const valueStr =
    plan.param.type === 'initialAtp' || plan.param.type === 'initialHp'
      ? Math.round(result.value).toString()
      : result.value.toFixed(2);

  console.log(
    `  建议 ${paramName} = ${valueStr}（调后胜率 ${(result.winRate * 100).toFixed(0)}%，迭代 ${result.iterations} 次，${result.converged ? '已收敛' : '未收敛'}）`,
  );
  console.log(
    `  历史：${result.history.map((h) => `${h.value.toFixed(plan.param.type.startsWith('initial') ? 0 : 2)}→${(h.winRate * 100).toFixed(0)}%`).join(' | ')}`,
  );
}
console.log(`\n${'='.repeat(70)}`);
