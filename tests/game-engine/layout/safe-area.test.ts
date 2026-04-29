import { describe, expect, it } from 'vitest';
import { DPR } from '@engine/dpr';
import {
  SAFE_BOTTOM,
  SAFE_LEFT,
  SAFE_RIGHT,
  SAFE_TOP,
  getSafeArea,
} from '@engine/layout/safe-area';
import { SPACING } from '@engine/layout/spacing';

describe('SAFE 常量', () => {
  it('左右默认值 = SPACING.md × DPR', () => {
    expect(SAFE_LEFT).toBe(SPACING.md * DPR);
    expect(SAFE_RIGHT).toBe(SPACING.md * DPR);
  });

  it('jsdom 环境下 top / bottom 都是 0（无 wx 全局）', () => {
    expect(SAFE_TOP).toBe(0);
    expect(SAFE_BOTTOM).toBe(0);
  });
});

describe('getSafeArea', () => {
  it('返回 4 边 + 内容区聚合对象', () => {
    const W = 780;
    const H = 1688;
    const sa = getSafeArea(W, H);
    expect(sa.top).toBe(SAFE_TOP);
    expect(sa.bottom).toBe(SAFE_BOTTOM);
    expect(sa.left).toBe(SAFE_LEFT);
    expect(sa.right).toBe(SAFE_RIGHT);
    expect(sa.contentX).toBe(SAFE_LEFT);
    expect(sa.contentY).toBe(SAFE_TOP);
    expect(sa.contentWidth).toBe(W - SAFE_LEFT - SAFE_RIGHT);
    expect(sa.contentHeight).toBe(H - SAFE_TOP - SAFE_BOTTOM);
  });

  it('contentWidth / contentHeight 跟 W/H 联动，4 边不变', () => {
    const a = getSafeArea(390, 844);
    const b = getSafeArea(780, 1688);
    expect(a.left).toBe(b.left);
    expect(a.right).toBe(b.right);
    expect(b.contentWidth - a.contentWidth).toBe(390);
    expect(b.contentHeight - a.contentHeight).toBe(844);
  });
});

describe('旧 safe-area 路径兼容', () => {
  it('从旧路径 import 还能拿到同样的常量', async () => {
    const old = await import('@engine/safe-area');
    expect(old.SAFE_TOP).toBe(SAFE_TOP);
    expect(old.SAFE_BOTTOM).toBe(SAFE_BOTTOM);
  });
});
