import { describe, expect, it } from 'vitest';
import { DESIGN_H, DESIGN_W, getScale } from '@engine/layout/design-resolution';

describe('DESIGN 常量', () => {
  it('iPhone 14：390 × 844', () => {
    expect(DESIGN_W).toBe(390);
    expect(DESIGN_H).toBe(844);
  });
});

describe('getScale', () => {
  it('cssW = DESIGN_W → 1', () => {
    expect(getScale(DESIGN_W)).toBe(1);
  });
  it('窄屏（375）< 1', () => {
    expect(getScale(375)).toBeLessThan(1);
  });
  it('宽屏（480）> 1', () => {
    expect(getScale(480)).toBeGreaterThan(1);
  });
});
