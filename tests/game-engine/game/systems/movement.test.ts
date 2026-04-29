import { describe, expect, it } from 'vitest';
import { createPathogen } from '@engine/game/entities';
import { tickMovement } from '@engine/game/systems/movement';

// 等价于 P2A 原固定路径的测试桩，避免单测依赖 map.ts 的路径常量
const PATH_COORDS: readonly { col: number; row: number }[] = [
  { col: 0, row: 4 },
  { col: 1, row: 4 },
  { col: 2, row: 4 },
  { col: 3, row: 4 },
  { col: 3, row: 5 },
  { col: 3, row: 6 },
  { col: 3, row: 7 },
  { col: 4, row: 7 },
  { col: 5, row: 7 },
  { col: 6, row: 7 },
  { col: 6, row: 6 },
  { col: 6, row: 5 },
  { col: 6, row: 4 },
  { col: 6, row: 3 },
  { col: 6, row: 2 },
  { col: 7, row: 2 },
  { col: 8, row: 2 },
  { col: 9, row: 2 },
];

describe('tickMovement', () => {
  it('病原体在一段内向前推进', () => {
    const p = createPathogen('p1', 'rhinovirus'); // v4 speed=1.2 tiles/s
    const { pathogens } = tickMovement([p], PATH_COORDS, 500); // 0.5s × 1.2 = 0.6 tiles
    expect(pathogens[0]?.pathIndex).toBe(0);
    expect(pathogens[0]?.progress).toBeCloseTo(0.6);
  });

  it('progress >= 1 时推进到下一段', () => {
    const p = createPathogen('p1', 'rhinovirus');
    const { pathogens } = tickMovement([p], PATH_COORDS, 1000); // 1.0s × 1.2 = 1.2 tiles
    expect(pathogens[0]?.pathIndex).toBe(1);
    expect(pathogens[0]?.progress).toBeCloseTo(0.2);
  });

  it('到达路径终点时记录 coreHit 并标记 reachedExit', () => {
    const p: ReturnType<typeof createPathogen> = {
      ...createPathogen('p1', 'rhinovirus'),
      pathIndex: PATH_COORDS.length - 2,
      progress: 0.99,
    };
    const { pathogens, coreHits } = tickMovement([p], PATH_COORDS, 100);
    expect(pathogens[0]?.reachedExit).toBe(true);
    expect(coreHits).toHaveLength(1);
    expect(coreHits[0]?.id).toBe('p1');
    expect(coreHits[0]?.damage).toBe(1);
  });

  it('已死亡的病原体不移动', () => {
    const p = { ...createPathogen('p1', 'rhinovirus'), alive: false };
    const { pathogens } = tickMovement([p], PATH_COORDS, 1000);
    expect(pathogens[0]?.progress).toBe(0);
  });

  it('已到达出口的病原体不再移动', () => {
    const p = { ...createPathogen('p1', 'rhinovirus'), reachedExit: true };
    const { pathogens, coreHits } = tickMovement([p], PATH_COORDS, 1000);
    expect(pathogens[0]?.progress).toBe(0);
    expect(coreHits).toHaveLength(0);
  });
});
