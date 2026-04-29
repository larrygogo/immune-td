import type { SpawnQueueItem, SpawnerState } from '../entities';

export function tickSpawner(
  spawner: SpawnerState,
  dt: number,
  onSpawn: (spawnedCount: number, item: SpawnQueueItem) => void,
): SpawnerState {
  if (!spawner.active || spawner.spawnedCount >= spawner.queue.length) return spawner;

  const newTimer = spawner.timerMs + dt;
  if (newTimer < spawner.intervalMs) {
    return { ...spawner, timerMs: newTimer };
  }

  const nextItem = spawner.queue[spawner.spawnedCount];
  if (!nextItem) return spawner;

  onSpawn(spawner.spawnedCount, nextItem);
  const newSpawnedCount = spawner.spawnedCount + 1;
  return {
    ...spawner,
    timerMs: newTimer - spawner.intervalMs,
    spawnedCount: newSpawnedCount,
    active: newSpawnedCount < spawner.queue.length,
  };
}
