import { describe, expect, it } from 'vitest';
import { createPathogen } from '@engine/game/entities';
import type { NextIdFn } from '@engine/game/phases';
import { beginWave, tick } from '@engine/game/phases';
import { createInitialState } from '@engine/game/state';

function makeNextId(): NextIdFn {
  let n = 0;
  return (prefix: string) => `${prefix}-${++n}`;
}

describe('engine - 关 7 保护细胞端到端（双肺泡）', () => {
  it('1 个病原走到肺泡 → 该肺泡 hp 5→4，全局 hp 不变，发 PROTECTED_CELL_DAMAGED 事件', () => {
    let s = { ...createInitialState(7, 1), running: true };
    expect(s.protectedCells).toHaveLength(2);
    expect(s.protectedCells[0]?.hp).toBe(5);
    expect(s.protectedCells[1]?.hp).toBe(5);
    expect(s.exits).toEqual([]);
    const startGlobalHp = s.hp;

    // 注入一个病原到 currentPath 终点前一格；currentPath 指向某一肺泡（seed 确定）
    const path = s.currentPath;
    const lastCell = path[path.length - 1];
    // 终点必为其中一个肺泡坐标
    const hitCell = s.protectedCells.find(
      (pc) => pc.coord.col === lastCell?.col && pc.coord.row === lastCell?.row,
    );
    expect(hitCell).toBeDefined();

    const pathogen = {
      ...createPathogen('p-test', 'rhinovirus', 1, { path }),
      pathIndex: path.length - 2,
      progress: 0.99,
    };
    s = beginWave(s, 0).state;
    s = { ...s, pathogens: [pathogen] };

    const r = tick(s, 100, makeNextId());

    // 被击中的肺泡 HP 5→4，另一个保持 5
    const damagedCell = r.state.protectedCells.find(
      (pc) => pc.coord.col === hitCell?.coord.col && pc.coord.row === hitCell?.coord.row,
    );
    expect(damagedCell?.hp).toBe(4);
    expect(r.state.hp).toBe(startGlobalHp);
    const damagedEv = r.events.find((e) => e.type === 'PROTECTED_CELL_DAMAGED');
    expect(damagedEv).toBeDefined();
    if (damagedEv && damagedEv.type === 'PROTECTED_CELL_DAMAGED') {
      expect(damagedEv.cellId).toBe(`${hitCell?.coord.col}_${hitCell?.coord.row}`);
      expect(damagedEv.remainingHp).toBe(4);
      expect(damagedEv.sourceId).toBe('p-test');
    }
    expect(r.events.find((e) => e.type === 'PROTECTED_CELL_DESTROYED')).toBeUndefined();
    expect(r.events.find((e) => e.type === 'LEVEL_LOST')).toBeUndefined();
    expect(r.state.phase).toBe('wave');
  });

  it('对同一肺泡 5 次累计冲击 → 肺泡归零 → phase=failed + LEVEL_LOST + PROTECTED_CELL_DESTROYED', () => {
    let s = { ...createInitialState(7, 1), running: true };
    s = beginWave(s, 0).state;

    const path = s.currentPath;
    const lastCell = path[path.length - 1];
    const targetCellId = `${lastCell?.col}_${lastCell?.row}`;
    for (let i = 0; i < 5; i++) {
      const pathogen = {
        ...createPathogen(`p-${i}`, 'rhinovirus', 1, { path }),
        pathIndex: path.length - 2,
        progress: 0.99,
      };
      s = { ...s, pathogens: [pathogen] };
      const r = tick(s, 100, makeNextId());
      s = r.state;
      const pc = s.protectedCells.find((p) => `${p.coord.col}_${p.coord.row}` === targetCellId);

      if (i < 4) {
        expect(pc?.hp).toBe(5 - i - 1);
        expect(s.phase).toBe('wave');
      } else {
        expect(pc?.hp).toBe(0);
        expect(s.phase).toBe('failed');
        const destroyed = r.events.find((e) => e.type === 'PROTECTED_CELL_DESTROYED');
        expect(destroyed).toBeDefined();
        if (destroyed && destroyed.type === 'PROTECTED_CELL_DESTROYED') {
          expect(destroyed.cellId).toBe(targetCellId);
        }
        expect(r.events.find((e) => e.type === 'LEVEL_LOST')).toBeDefined();
      }
    }
  });
});
