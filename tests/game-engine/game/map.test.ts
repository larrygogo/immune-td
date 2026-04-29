import { describe, expect, it } from 'vitest';
import {
  CELL_SIZE,
  ENTRY,
  EXIT,
  GRID_SIZE,
  cellToPixel,
  createLevel1Map,
  isEmptyCell,
} from '@engine/game/map';

describe('map', () => {
  it('网格尺寸为 10×10', () => {
    const map = createLevel1Map();
    expect(map.length).toBe(10);
    expect(map[0]?.length).toBe(10);
  });

  it('常量正确', () => {
    expect(GRID_SIZE).toBe(10);
    expect(CELL_SIZE).toBe(60);
  });

  it('入口/出口常量正确', () => {
    expect(ENTRY).toEqual({ col: 0, row: 4 });
    expect(EXIT).toEqual({ col: 9, row: 2 });
  });

  it('createLevel1Map: 入口格 type 为 entry', () => {
    const map = createLevel1Map();
    expect(map[ENTRY.row]?.[ENTRY.col]?.type).toBe('entry');
  });

  it('createLevel1Map: 出口格 type 为 exit', () => {
    const map = createLevel1Map();
    expect(map[EXIT.row]?.[EXIT.col]?.type).toBe('exit');
  });

  it('createLevel1Map: 除入口/出口外其他格全为 empty', () => {
    const map = createLevel1Map();
    let nonEmpty = 0;
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = map[r]?.[c];
        if (cell && cell.type !== 'empty') nonEmpty++;
      }
    }
    expect(nonEmpty).toBe(2);
  });

  it('isEmptyCell 对空格返回 true，入口/出口返回 false', () => {
    const map = createLevel1Map();
    expect(isEmptyCell(map, 1, 1)).toBe(true);
    expect(isEmptyCell(map, ENTRY.col, ENTRY.row)).toBe(false);
    expect(isEmptyCell(map, EXIT.col, EXIT.row)).toBe(false);
  });

  it('cellToPixel 返回格子中心像素坐标', () => {
    expect(cellToPixel(0, 0)).toEqual({ x: 30, y: 30 });
    expect(cellToPixel(1, 2)).toEqual({ x: 90, y: 150 });
  });
});
