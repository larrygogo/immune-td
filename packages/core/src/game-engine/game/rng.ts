/**
 * Mulberry32 PRNG（32-bit seeded）。
 * 状态可序列化：存入 GameState.rngState，每次 tick 后回写。
 */
export function createRng(initialState: number): { next: () => number; getState: () => number } {
  let s = initialState >>> 0;
  return {
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    getState: () => s,
  };
}

/** 生成一个随机种子（用于新游戏） */
export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

/** 从 [min, max] 闭区间均匀随机取整数 */
export function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}
