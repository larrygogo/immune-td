import { describe, expect, it } from 'vitest';
import {
  bfsPath,
  generateDefaultPath,
  straightLinePath,
} from '@engine/game/systems/pathfinding';

const ENTRY = { col: 0, row: 4 };
const EXIT = { col: 9, row: 2 };
const GRID = 10;

describe('bfsPath', () => {
  it('空地图：返回从入口到出口的路径', () => {
    const path = bfsPath([], ENTRY, EXIT, GRID);
    expect(path).not.toBeNull();
    expect(path?.[0]).toEqual(ENTRY);
    expect(path?.[path.length - 1]).toEqual(EXIT);
  });

  it('空地图：路径是最短曼哈顿距离 + 1（格子数）', () => {
    const path = bfsPath([], ENTRY, EXIT, GRID);
    // 曼哈顿距离 = |9-0| + |2-4| = 11 步 → 12 个格子
    expect(path?.length).toBe(12);
  });

  it('路径只走四方向（相邻格子步长 1）', () => {
    const path = bfsPath([], ENTRY, EXIT, GRID);
    expect(path).not.toBeNull();
    if (!path) return;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      if (!a || !b) throw new Error('path index out of range');
      const dist = Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
      expect(dist).toBe(1);
    }
  });

  it('单塔障碍：BFS 会绕行', () => {
    const path = bfsPath([{ col: 1, row: 4 }], ENTRY, EXIT, GRID);
    expect(path).not.toBeNull();
    expect(path?.some((c) => c.col === 1 && c.row === 4)).toBe(false);
  });

  it('多塔迷宫：找到可行路径且不经过任何塔', () => {
    const towers = [
      { col: 2, row: 4 },
      { col: 3, row: 4 },
      { col: 4, row: 4 },
    ];
    const path = bfsPath(towers, ENTRY, EXIT, GRID);
    expect(path).not.toBeNull();
    for (const t of towers) {
      expect(path?.some((c) => c.col === t.col && c.row === t.row)).toBe(false);
    }
  });

  it('完全封堵入口：返回 null', () => {
    const towers = [
      { col: 0, row: 3 },
      { col: 1, row: 4 },
      { col: 0, row: 5 },
    ];
    const path = bfsPath(towers, ENTRY, EXIT, GRID);
    expect(path).toBeNull();
  });

  it('入口即出口：返回单点路径', () => {
    const path = bfsPath([], ENTRY, ENTRY, GRID);
    expect(path).toEqual([ENTRY]);
  });

  it('塔占据入口格：返回 null（算法鲁棒性）', () => {
    const path = bfsPath([{ col: 0, row: 4 }], ENTRY, EXIT, GRID);
    expect(path).toBeNull();
  });

  it('塔占据出口格：返回 null（算法鲁棒性）', () => {
    const path = bfsPath([{ col: 9, row: 2 }], ENTRY, EXIT, GRID);
    expect(path).toBeNull();
  });
});

// A6.3c: bfsRandomPath / DETOUR_BUDGET / pickWaypoint / waypointPath 测试随
// pathfinding.ts 老 maze 函数一并删除。

describe('straightLinePath', () => {
  it('entry=exit 返回单点', () => {
    expect(straightLinePath(ENTRY, ENTRY)).toEqual([ENTRY]);
  });

  it('从 (0,4) 到 (9,2) 生成直线格子路径', () => {
    const path = straightLinePath(ENTRY, EXIT);
    expect(path[0]).toEqual(ENTRY);
    expect(path[path.length - 1]).toEqual(EXIT);
  });

  it('不考虑塔/障碍：即使塔在中点也穿过', () => {
    // 直线会经过 (4-5, 3) 附近，我们手动 assert 起止而非每格
    const path = straightLinePath(ENTRY, EXIT);
    // 长度应接近 max(dx, dy) + 1 = 10
    expect(path.length).toBeGreaterThanOrEqual(10);
    expect(path.length).toBeLessThanOrEqual(12);
  });

  it('每步只移动 1 格（col 或 row 或两者 ±1）', () => {
    const path = straightLinePath(ENTRY, EXIT);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      if (!a || !b) throw new Error('idx');
      expect(Math.abs(a.col - b.col)).toBeLessThanOrEqual(1);
      expect(Math.abs(a.row - b.row)).toBeLessThanOrEqual(1);
    }
  });
});

describe('generateDefaultPath', () => {
  it('首尾点对齐 entry/exit', () => {
    const path = generateDefaultPath({ col: 0, row: 4 }, { col: 9, row: 5 }, 10, 10);
    expect(path[0]).toEqual({ col: 0, row: 4 });
    expect(path[path.length - 1]).toEqual({ col: 9, row: 5 });
  });

  it('相邻两点严格四方向相邻（dx+dy===1）', () => {
    const path = generateDefaultPath({ col: 0, row: 4 }, { col: 9, row: 5 }, 10, 10);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      if (!a || !b) throw new Error('idx');
      const dx = Math.abs(a.col - b.col);
      const dy = Math.abs(a.row - b.row);
      expect(dx + dy).toBe(1);
    }
  });

  it('entry === exit 返回单点路径', () => {
    expect(generateDefaultPath({ col: 3, row: 3 }, { col: 3, row: 3 }, 10, 10)).toEqual([
      { col: 3, row: 3 },
    ]);
  });

  it('从右边入口（col=9）也能正确反向 S', () => {
    const path = generateDefaultPath({ col: 9, row: 0 }, { col: 0, row: 9 }, 10, 10);
    expect(path[0]).toEqual({ col: 9, row: 0 });
    expect(path[path.length - 1]).toEqual({ col: 0, row: 9 });
    // 仍保持四方向相邻
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      if (!a || !b) throw new Error('idx');
      expect(Math.abs(a.col - b.col) + Math.abs(a.row - b.row)).toBe(1);
    }
  });

  it('L 形路径长度 = 曼哈顿距离 + 1（不绕路也不自交）', () => {
    // 10x10 (0,0) → (9,9)：曼哈顿 18 → 19 格
    const path = generateDefaultPath({ col: 0, row: 0 }, { col: 9, row: 9 }, 10, 10);
    expect(path.length).toBe(19);
  });

  it('L 形路径不自交（每个格子在 path 中最多出现一次）', () => {
    const path = generateDefaultPath({ col: 0, row: 4 }, { col: 9, row: 2 }, 10, 10);
    const seen = new Set<string>();
    for (const c of path) {
      const k = `${c.col},${c.row}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });

  it('小网格（3x3）正常工作', () => {
    const path = generateDefaultPath({ col: 0, row: 0 }, { col: 2, row: 2 }, 3, 3);
    expect(path[0]).toEqual({ col: 0, row: 0 });
    expect(path[path.length - 1]).toEqual({ col: 2, row: 2 });
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      if (!a || !b) throw new Error('idx');
      expect(Math.abs(a.col - b.col) + Math.abs(a.row - b.row)).toBe(1);
    }
  });

  it('中间列入口（col=4，非边界）仍生成连续四方向路径', () => {
    const path = generateDefaultPath({ col: 4, row: 0 }, { col: 6, row: 9 }, 10, 10);
    expect(path[0]).toEqual({ col: 4, row: 0 });
    expect(path[path.length - 1]).toEqual({ col: 6, row: 9 });
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      if (!a || !b) throw new Error('idx');
      expect(Math.abs(a.col - b.col) + Math.abs(a.row - b.row)).toBe(1);
    }
  });
});

