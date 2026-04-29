import { describe, expect, it, vi } from 'vitest';
import type { PathogenType } from '@engine/game/entities';
import { createSpawner } from '@engine/game/entities';
import { tickSpawner } from '@engine/game/systems/spawner';

const rhino = { type: 'rhinovirus' as const, modifiers: [] as const };
const flu = { type: 'influenza' as const, modifiers: [] as const };

describe('tickSpawner', () => {
  it('未到间隔时不生成', () => {
    const spawner = createSpawner([rhino, rhino, rhino], 1000);
    const onSpawn = vi.fn();
    const next = tickSpawner(spawner, 500, onSpawn);
    expect(onSpawn).not.toHaveBeenCalled();
    expect(next.spawnedCount).toBe(0);
  });

  it('到达间隔后生成一个并传回 item', () => {
    const spawner = createSpawner([rhino, flu], 1000);
    const onSpawn = vi.fn();
    const next = tickSpawner(spawner, 1000, onSpawn);
    expect(onSpawn).toHaveBeenCalledTimes(1);
    expect(onSpawn).toHaveBeenCalledWith(0, rhino);
    expect(next.spawnedCount).toBe(1);
  });

  it('空 queue 不生成', () => {
    const spawner = createSpawner([], 1000);
    const onSpawn = vi.fn();
    tickSpawner(spawner, 1000, onSpawn);
    expect(onSpawn).not.toHaveBeenCalled();
  });

  it('queue 最后一个生成后 active 变为 false', () => {
    const spawner = createSpawner([rhino], 1000);
    const onSpawn = vi.fn();
    const next = tickSpawner(spawner, 1000, onSpawn);
    expect(next.spawnedCount).toBe(1);
    expect(next.active).toBe(false);
  });

  it('计时器在未触发时正确累加', () => {
    const spawner = createSpawner([rhino, rhino], 1000);
    const onSpawn = vi.fn();
    const next = tickSpawner(spawner, 400, onSpawn);
    expect(next.timerMs).toBeCloseTo(400);
    expect(onSpawn).not.toHaveBeenCalled();
  });

  it('按 queue 顺序依次生成不同 type', () => {
    let spawner = createSpawner([rhino, flu, rhino], 1000);
    const spawned: PathogenType[] = [];
    const onSpawn = (_c: number, item: { type: PathogenType }): void => {
      spawned.push(item.type);
    };
    for (let i = 0; i < 3; i++) {
      spawner = tickSpawner(spawner, 1000, onSpawn);
    }
    expect(spawned).toEqual(['rhinovirus', 'influenza', 'rhinovirus']);
    expect(spawner.active).toBe(false);
  });

  it('携带 modifiers 的 item 透传到 callback', () => {
    const camo = {
      type: 'rhinovirus' as const,
      modifiers: ['camouflaged'] as const,
    };
    const spawner = createSpawner([camo], 1000);
    const onSpawn = vi.fn();
    tickSpawner(spawner, 1000, onSpawn);
    expect(onSpawn).toHaveBeenCalledWith(0, camo);
  });
});
