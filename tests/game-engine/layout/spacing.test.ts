import { describe, expect, it } from 'vitest';
import { SPACING } from '@engine/layout/spacing';

describe('SPACING 常量', () => {
  it('保持 4-pt grid 阶梯', () => {
    expect(SPACING.xs).toBe(4);
    expect(SPACING.sm).toBe(8);
    expect(SPACING.md).toBe(16);
    expect(SPACING.lg).toBe(24);
    expect(SPACING.xl).toBe(32);
    expect(SPACING.xxl).toBe(48);
  });

  it('每个阶梯严格递增', () => {
    const values = [SPACING.xs, SPACING.sm, SPACING.md, SPACING.lg, SPACING.xl, SPACING.xxl];
    for (let i = 1; i < values.length; i++) {
      // biome-ignore lint/style/noNonNullAssertion: bounds-checked loop
      expect(values[i]!).toBeGreaterThan(values[i - 1]!);
    }
  });
});
