import { describe, expect, it } from 'vitest';
import { generateLayout } from '@engine/game/map-gen';
import { createRng } from '@engine/game/rng';

function makeRng(seed: number): () => number {
  return createRng(seed).next;
}

describe('map-gen · generateLayout', () => {
  it('显式 entries/exits 被原样输出，不随机化', () => {
    const r = generateLayout(
      {
        gridSize: 10,
        entries: {
          count: 2,
          explicit: [
            { col: 0, row: 2 },
            { col: 0, row: 7 },
          ],
        },
        exits: { count: 1, explicit: [{ col: 9, row: 4 }] },
      },
      makeRng(1),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.layout.entries).toEqual([
        { col: 0, row: 2 },
        { col: 0, row: 7 },
      ]);
      expect(r.layout.exits).toEqual([{ col: 9, row: 4 }]);
    }
  });

  it('rowRange 在范围内随机选入口，count=1 且 rowRange=[3,5] 生成 row∈{3,4,5}', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = generateLayout(
        {
          gridSize: 10,
          entries: { count: 1, edge: 'left', rowRange: [3, 5] },
          exits: { count: 1, explicit: [{ col: 9, row: 0 }] },
        },
        makeRng(seed),
      );
      expect(r.ok).toBe(true);
      if (r.ok) {
        const e = r.layout.entries[0];
        expect(e).toBeDefined();
        expect(e?.col).toBe(0);
        expect(e?.row).toBeGreaterThanOrEqual(3);
        expect(e?.row).toBeLessThanOrEqual(5);
      }
    }
  });

  it('count=2 with minGap=2：两个入口行距 ≥ 2', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = generateLayout(
        {
          gridSize: 10,
          entries: { count: 2, edge: 'left', rowRange: [0, 9], minGap: 2 },
          exits: { count: 1, explicit: [{ col: 9, row: 5 }] },
        },
        makeRng(seed),
      );
      expect(r.ok).toBe(true);
      if (r.ok && r.layout.entries.length === 2) {
        const [a, b] = r.layout.entries;
        if (a && b) expect(Math.abs(a.row - b.row)).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('blocked count=3：输出包含 3 个随机禁建 + BFS 保证通路', () => {
    const r = generateLayout(
      {
        gridSize: 10,
        entries: { count: 1, explicit: [{ col: 0, row: 4 }] },
        exits: { count: 1, explicit: [{ col: 9, row: 4 }] },
        blocked: { count: 3, minDistanceFromEntry: 2, minDistanceFromExit: 2 },
      },
      makeRng(7),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.layout.blockedCells).toHaveLength(3);
    }
  });

  it('protectedCells explicit：坐标 / HP / 名字完全复用', () => {
    const r = generateLayout(
      {
        gridSize: 10,
        entries: { count: 1, explicit: [{ col: 0, row: 5 }] },
        exits: { count: 1, explicit: [] }, // 无 exit，走保护细胞
        protectedCells: {
          count: 1,
          hpRange: [1, 1],
          placement: 'explicit',
          explicit: [{ coord: { col: 8, row: 4 }, hp: 5, name: '肺泡' }],
        },
      },
      makeRng(3),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.layout.protectedCells).toHaveLength(1);
      expect(r.layout.protectedCells[0]).toEqual({
        coord: { col: 8, row: 4 },
        hp: 5,
        name: '肺泡',
      });
      // 保护细胞坐标自动加入 blockedCells
      expect(r.layout.blockedCells.some((c) => c.col === 8 && c.row === 4)).toBe(true);
    }
  });

  it('protectedCells random + theme：从池中抽名 + count 条', () => {
    const r = generateLayout(
      {
        gridSize: 10,
        entries: { count: 1, edge: 'left', rowRange: [4, 4] },
        exits: { count: 1, edge: 'right', rowRange: [4, 4] },
        protectedCells: {
          count: 2,
          hpRange: [3, 6],
          theme: 'respiratory',
          placement: 'random',
        },
      },
      makeRng(11),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.layout.protectedCells).toHaveLength(2);
      for (const pc of r.layout.protectedCells) {
        expect(pc.hp).toBeGreaterThanOrEqual(3);
        expect(pc.hp).toBeLessThanOrEqual(6);
        expect(pc.name).toBeTypeOf('string');
      }
    }
  });

  it('同一 rng seed 生成结果一致（确定性）', () => {
    const cfg = {
      gridSize: 10 as number,
      entries: { count: 1, edge: 'left' as const, rowRange: [2, 6] as const },
      exits: { count: 1, edge: 'right' as const, rowRange: [2, 6] as const },
      blocked: { count: 3 },
    };
    const a = generateLayout(cfg, makeRng(999));
    const b = generateLayout(cfg, makeRng(999));
    expect(a).toEqual(b);
  });

  it('无任何 goals 时返回 no-goals', () => {
    const r = generateLayout(
      {
        gridSize: 10,
        entries: { count: 1, explicit: [{ col: 0, row: 4 }] },
        exits: { count: 0, explicit: [] },
      },
      makeRng(1),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('no-goals');
  });
});
