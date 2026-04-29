import { describe, expect, it } from 'vitest';
import {
  bfsPath,
  bfsPathMulti,
} from '@engine/game/systems/pathfinding';

const GRID = 10;

describe('bfsPathMulti', () => {
  it('单 entry / 单 exit：等价于 bfsPath（路径长度一致）', () => {
    const entry = { col: 0, row: 4 };
    const exit = { col: 9, row: 2 };
    const multi = bfsPathMulti([], [entry], [exit], GRID);
    const single = bfsPath([], entry, exit, GRID);
    expect(multi).not.toBeNull();
    expect(single).not.toBeNull();
    expect(multi?.length).toBe(single?.length);
    expect(multi?.[0]).toEqual(entry);
    expect(multi?.[multi.length - 1]).toEqual(exit);
  });

  it('多 entries 选最短：A 距 8 步 / B 距 1 步 → 返回从 B 起的短路径', () => {
    const entryA = { col: 0, row: 9 };
    const entryB = { col: 0, row: 0 };
    const exit = { col: 0, row: 1 };
    const path = bfsPathMulti([], [entryA, entryB], [exit], GRID);
    expect(path).not.toBeNull();
    // 短路径 entry B → exit：长度 2
    expect(path?.length).toBe(2);
    expect(path?.[0]).toEqual(entryB);
    expect(path?.[path.length - 1]).toEqual(exit);
  });

  it('多 exits 选最近：entry → 远 exit 8 步 / 近 exit 1 步 → 短路径', () => {
    const entry = { col: 0, row: 0 };
    const farExit = { col: 0, row: 9 };
    const nearExit = { col: 0, row: 1 };
    const path = bfsPathMulti([], [entry], [farExit, nearExit], GRID);
    expect(path).not.toBeNull();
    expect(path?.length).toBe(2);
    expect(path?.[path.length - 1]).toEqual(nearExit);
  });

  it('多 entries × 多 exits 全组合遍历：取整体最短', () => {
    // entries A=(0,0) B=(0,9)；exits X=(0,5) Y=(9,9)
    // A→X 距 5、A→Y 距 18、B→X 距 4、B→Y 距 9 → 最短 B→X 长度 5
    const entries = [
      { col: 0, row: 0 },
      { col: 0, row: 9 },
    ];
    const exits = [
      { col: 0, row: 5 },
      { col: 9, row: 9 },
    ];
    const path = bfsPathMulti([], entries, exits, GRID);
    expect(path).not.toBeNull();
    expect(path?.length).toBe(5);
    expect(path?.[0]).toEqual({ col: 0, row: 9 });
    expect(path?.[path.length - 1]).toEqual({ col: 0, row: 5 });
  });

  it('所有 entry 都被堵 → 返回 null', () => {
    const entries = [
      { col: 0, row: 0 },
      { col: 0, row: 9 },
    ];
    const exits = [{ col: 9, row: 9 }];
    // 把两个 entry 都堵上
    const towers = entries.map((e) => ({ col: e.col, row: e.row }));
    const path = bfsPathMulti(towers, entries, exits, GRID);
    expect(path).toBeNull();
  });
});

// A6.3c: bfsRandomPathFromEntry 测试随老 maze 函数一并删除
