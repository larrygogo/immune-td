import { describe, expect, it, vi } from 'vitest';
import { DPR } from '@engine/dpr';
import {
  type ContainerChild,
  computeColumnLayout,
  computeCrossAxisOffset,
  computeGridLayout,
  computeMainAxisOffsets,
  computeRowLayout,
} from '@engine/layout/containers';

/**
 * 单元测试不实例化 Phaser 容器类（jsdom 下 Phaser 加载困难），
 * 直接测纯排版函数 + 用 spy 验证假想 child.container.setPosition 调用参数。
 */

// ===== computeMainAxisOffsets =====

describe('computeMainAxisOffsets', () => {
  // 容器主轴 200，4 个 30-px 子节点，spacing 10，无 padding
  const childMains = [30, 30, 30, 30];
  const containerMain = 200;
  const spacing = 10;

  it('justify=start：从 padding 起累加 spacing', () => {
    expect(computeMainAxisOffsets(childMains, containerMain, spacing, 0, 0, 'start')).toEqual([
      0, 40, 80, 120,
    ]);
  });

  it('justify=center：整体居中（剩余空间 200 - 4×30 - 3×10 = 50，左偏 25）', () => {
    expect(computeMainAxisOffsets(childMains, containerMain, spacing, 0, 0, 'center')).toEqual([
      25, 65, 105, 145,
    ]);
  });

  it('justify=end：尾部贴右（最后一个右沿在 inner 末尾）', () => {
    // 4 children + 3 gaps = 150；inner=200；起点 = 200 - 150 = 50
    expect(computeMainAxisOffsets(childMains, containerMain, spacing, 0, 0, 'end')).toEqual([
      50, 90, 130, 170,
    ]);
  });

  it('justify=space-between：首尾贴边，中间均分（free=80, gap=80/3）', () => {
    // free = 200 - 120 = 80; gap = 80 / 3 = 26.666..
    const r = computeMainAxisOffsets(childMains, containerMain, spacing, 0, 0, 'space-between');
    expect(r[0]).toBe(0);
    expect(r[3]).toBeCloseTo(170, 5);
    expect(r[1]).toBeCloseTo(56.6667, 3);
    expect(r[2]).toBeCloseTo(113.3333, 3);
  });

  it('justify=space-around：每个 child 两侧均分（free=80, slot=20，子两侧各 10）', () => {
    // free=80, slotGap=20; 起点 = slotGap/2 = 10
    expect(
      computeMainAxisOffsets(childMains, containerMain, spacing, 0, 0, 'space-around'),
    ).toEqual([10, 60, 110, 160]);
  });

  it('padding 缩小 inner 区域：start + padding 20', () => {
    // inner = 200-40 = 160; 起点 = padding 20
    expect(computeMainAxisOffsets(childMains, containerMain, spacing, 20, 20, 'start')).toEqual([
      20, 60, 100, 140,
    ]);
  });

  it('空 children：返回空数组', () => {
    expect(computeMainAxisOffsets([], 200, 10, 0, 0, 'start')).toEqual([]);
  });

  it('单 child + space-between：退化为 start（不除以 0）', () => {
    expect(computeMainAxisOffsets([30], 200, 10, 0, 0, 'space-between')).toEqual([0]);
  });
});

// ===== computeCrossAxisOffset =====

describe('computeCrossAxisOffset', () => {
  it('align=start：返回 paddingStart', () => {
    expect(computeCrossAxisOffset(40, 100, 8, 8, 'start')).toBe(8);
  });
  it('align=center：(inner - child) / 2 + padding', () => {
    // inner = 100 - 16 = 84; (84 - 40) / 2 = 22; + 8 = 30
    expect(computeCrossAxisOffset(40, 100, 8, 8, 'center')).toBe(30);
  });
  it('align=end：底部贴边', () => {
    // padding + inner - child = 8 + 84 - 40 = 52
    expect(computeCrossAxisOffset(40, 100, 8, 8, 'end')).toBe(52);
  });
  it('无 padding align=center：经典公式 (container - child) / 2', () => {
    expect(computeCrossAxisOffset(40, 100, 0, 0, 'center')).toBe(30);
  });
});

// ===== computeRowLayout =====

describe('computeRowLayout', () => {
  // 3 个 50×40 子节点，容器 300×60（CSS px 概念，但函数接 buffer px）
  const children = [
    { cssWidth: 50, cssHeight: 40 },
    { cssWidth: 50, cssHeight: 40 },
    { cssWidth: 50, cssHeight: 40 },
  ];
  const widthPx = 300 * DPR;
  const heightPx = 60 * DPR;

  it('justify=start + align=center 默认行为', () => {
    const r = computeRowLayout(children, widthPx, heightPx, {
      spacing: 10,
      justify: 'start',
      align: 'center',
      padding: {},
    });
    expect(r).toHaveLength(3);
    // x: start = 0, 60×DPR, 120×DPR
    expect(r[0]?.x).toBe(0);
    expect(r[1]?.x).toBe(60 * DPR);
    expect(r[2]?.x).toBe(120 * DPR);
    // y: align=center 在 60 高里放 40 高 → (60-40)/2 = 10 CSS px = 10×DPR buffer
    expect(r[0]?.y).toBe(10 * DPR);
  });

  it('justify=center：整行居中', () => {
    // 3×50 + 2×10 = 170 CSS px；容器 300；左偏 65
    const r = computeRowLayout(children, widthPx, heightPx, {
      spacing: 10,
      justify: 'center',
      align: 'center',
      padding: {},
    });
    expect(r[0]?.x).toBe(65 * DPR);
  });

  it('align=start：子节点贴顶（y=0）', () => {
    const r = computeRowLayout(children, widthPx, heightPx, {
      spacing: 10,
      justify: 'start',
      align: 'start',
      padding: {},
    });
    expect(r[0]?.y).toBe(0);
  });

  it('align=end：子节点贴底（y = (60-40) × DPR）', () => {
    const r = computeRowLayout(children, widthPx, heightPx, {
      spacing: 10,
      justify: 'start',
      align: 'end',
      padding: {},
    });
    expect(r[0]?.y).toBe(20 * DPR);
  });

  it('padding 缩小 inner 区', () => {
    const r = computeRowLayout(children, widthPx, heightPx, {
      spacing: 10,
      justify: 'start',
      align: 'start',
      padding: { x: 8, y: 4 },
    });
    expect(r[0]?.x).toBe(8 * DPR);
    expect(r[0]?.y).toBe(4 * DPR);
  });
});

// ===== computeColumnLayout =====

describe('computeColumnLayout', () => {
  const children = [
    { cssWidth: 80, cssHeight: 40 },
    { cssWidth: 80, cssHeight: 40 },
    { cssWidth: 80, cssHeight: 40 },
  ];
  const widthPx = 100 * DPR;
  const heightPx = 200 * DPR;

  it('justify=start + align=center 默认：3 个 40-高 + 间距 10 从顶累加', () => {
    const r = computeColumnLayout(children, widthPx, heightPx, {
      spacing: 10,
      justify: 'start',
      align: 'center',
      padding: {},
    });
    expect(r[0]?.y).toBe(0);
    expect(r[1]?.y).toBe(50 * DPR);
    expect(r[2]?.y).toBe(100 * DPR);
    // x: align=center: (100 - 80) / 2 = 10
    expect(r[0]?.x).toBe(10 * DPR);
  });

  it('justify=center：整列居中（free = 200 - 3×40 - 2×10 = 60，顶部 30）', () => {
    const r = computeColumnLayout(children, widthPx, heightPx, {
      spacing: 10,
      justify: 'center',
      align: 'center',
      padding: {},
    });
    expect(r[0]?.y).toBe(30 * DPR);
  });

  it('justify=space-between：首尾贴边', () => {
    const r = computeColumnLayout(children, widthPx, heightPx, {
      spacing: 10,
      justify: 'space-between',
      align: 'center',
      padding: {},
    });
    expect(r[0]?.y).toBe(0);
    expect(r[2]?.y).toBe(160 * DPR);
  });

  it('align=start：左贴', () => {
    const r = computeColumnLayout(children, widthPx, heightPx, {
      spacing: 10,
      justify: 'start',
      align: 'start',
      padding: {},
    });
    expect(r[0]?.x).toBe(0);
  });

  it('padding x/y 同时生效', () => {
    const r = computeColumnLayout(children, widthPx, heightPx, {
      spacing: 10,
      justify: 'start',
      align: 'start',
      padding: { x: 5, y: 7 },
    });
    expect(r[0]?.x).toBe(5 * DPR);
    expect(r[0]?.y).toBe(7 * DPR);
  });
});

// ===== computeGridLayout =====

describe('computeGridLayout · 3 列 + 7 children', () => {
  const seven = [
    { cssWidth: 60, cssHeight: 40 },
    { cssWidth: 60, cssHeight: 40 },
    { cssWidth: 60, cssHeight: 40 },
    { cssWidth: 60, cssHeight: 40 },
    { cssWidth: 60, cssHeight: 40 },
    { cssWidth: 60, cssHeight: 40 },
    { cssWidth: 60, cssHeight: 40 },
  ];
  // 容器宽 300 CSS px → 列宽 = (300 - 2×10) / 3 = 280/3
  const widthPx = 300 * DPR;
  const heightPx = 200 * DPR;
  const opts = {
    columns: 3,
    spacingX: 10,
    spacingY: 8,
    align: 'center' as const,
    padding: {},
  };

  it('返回 7 个 position（按 children 原索引排）', () => {
    const r = computeGridLayout(seven, widthPx, heightPx, opts);
    expect(r).toHaveLength(7);
  });

  it('row 0 三个 child y 一致；row 1 / row 2 各递增 rowHeight + spacingY', () => {
    const r = computeGridLayout(seven, widthPx, heightPx, opts);
    const y0 = r[0]?.y ?? -1;
    const y1 = r[3]?.y ?? -1;
    const y2 = r[6]?.y ?? -1;
    expect(r[1]?.y).toBe(y0);
    expect(r[2]?.y).toBe(y0);
    expect(r[4]?.y).toBe(y1);
    expect(r[5]?.y).toBe(y1);
    // rowHeight = 40 CSS px × DPR; spacingY = 8 × DPR
    expect(y1 - y0).toBe((40 + 8) * DPR);
    expect(y2 - y1).toBe((40 + 8) * DPR);
  });

  it('row 0 三 child x 等差递增（columns 等宽 + spacingX）', () => {
    const r = computeGridLayout(seven, widthPx, heightPx, opts);
    const x0 = r[0]?.x ?? -1;
    const x1 = r[1]?.x ?? -1;
    const x2 = r[2]?.x ?? -1;
    expect(x1 - x0).toBeCloseTo((280 / 3 + 10) * DPR, 3);
    expect(x2 - x1).toBeCloseTo((280 / 3 + 10) * DPR, 3);
  });

  it('最后一行只有 1 个 child：x 在第 0 列起点', () => {
    const r = computeGridLayout(seven, widthPx, heightPx, opts);
    expect(r[6]?.x).toBe(r[0]?.x);
  });

  it('columns=1 退化为单列纵列（每个 child 占一行）', () => {
    const r = computeGridLayout(seven, widthPx, heightPx, { ...opts, columns: 1 });
    // 7 行高 = 7×40 CSS px + 6×8 spacingY；y 等差递增 48 CSS px
    expect((r[1]?.y ?? 0) - (r[0]?.y ?? 0)).toBe(48 * DPR);
    expect((r[6]?.y ?? 0) - (r[0]?.y ?? 0)).toBe(48 * 6 * DPR);
  });

  it('混合不同高度 child：行高取该行 max', () => {
    const mixed = [
      { cssWidth: 40, cssHeight: 30 },
      { cssWidth: 40, cssHeight: 50 }, // 这一行最高
      { cssWidth: 40, cssHeight: 20 },
      { cssWidth: 40, cssHeight: 40 }, // 第 2 行
    ];
    const r = computeGridLayout(mixed, widthPx, heightPx, { ...opts, columns: 3 });
    // 第 0 行最高 50；第 1 行起点 = padding 0 + 50×DPR + 8×DPR = 58×DPR
    expect(r[3]?.y).toBe(58 * DPR);
  });

  it('padding 同时生效', () => {
    const r = computeGridLayout(seven, widthPx, heightPx, {
      ...opts,
      padding: { x: 5, y: 6 },
    });
    expect(r[0]?.y).toBe(6 * DPR);
    // x 第一列：padding 5 + colWidth/2 - childW/2；先验 colWidth 重新算
    // innerW = (300 - 10) × DPR = 290 × DPR; colWidth = (290-2*10)/3 × DPR = 90×DPR
    // x = 5×DPR + (90 - 60) / 2 × DPR = 20×DPR
    expect(r[0]?.x).toBeCloseTo(20 * DPR, 3);
  });
});

// ===== ContainerChild mock：验证 setPosition 调用 =====

describe('ContainerChild setPosition 调用（用 spy mock）', () => {
  it('mock children 经过 computeRowLayout + 手动 forEach setPosition 后参数符合预期', () => {
    const spies = [vi.fn(), vi.fn(), vi.fn()];
    const children: ContainerChild[] = spies.map((s) => ({
      container: { setPosition: s },
      cssWidth: 50,
      cssHeight: 40,
    }));
    const widthPx = 300 * DPR;
    const heightPx = 60 * DPR;
    const positions = computeRowLayout(children, widthPx, heightPx, {
      spacing: 10,
      justify: 'start',
      align: 'center',
      padding: {},
    });
    for (let i = 0; i < children.length; i++) {
      const c = children[i];
      const p = positions[i];
      if (!c || !p) continue;
      c.container.setPosition(p.x, p.y);
    }
    expect(spies[0]).toHaveBeenCalledWith(0, 10 * DPR);
    expect(spies[1]).toHaveBeenCalledWith(60 * DPR, 10 * DPR);
    expect(spies[2]).toHaveBeenCalledWith(120 * DPR, 10 * DPR);
  });
});
