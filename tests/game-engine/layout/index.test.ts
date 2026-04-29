import { describe, expect, it } from 'vitest';
import * as layout from '@engine/layout';

describe('layout/index 统一导出', () => {
  it('暴露 SPACING / BREAKPOINTS', () => {
    expect(layout.SPACING.md).toBe(16);
    expect(layout.BREAKPOINTS.PHONE_WIDE).toBe(480);
  });

  it('暴露 SAFE_TOP / SAFE_LEFT / getSafeArea', () => {
    expect(typeof layout.SAFE_LEFT).toBe('number');
    expect(typeof layout.getSafeArea).toBe('function');
  });

  it('暴露 anchor helper', () => {
    expect(typeof layout.anchorTopRight).toBe('function');
    expect(typeof layout.resolveAnchor).toBe('function');
  });

  it('暴露 DESIGN / getScale / getViewport', () => {
    expect(layout.DESIGN_W).toBe(390);
    expect(typeof layout.getScale).toBe('function');
    expect(typeof layout.getViewport).toBe('function');
  });
});
