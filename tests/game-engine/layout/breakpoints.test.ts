import { describe, expect, it } from 'vitest';
import { BREAKPOINTS, getBreakpoint, isAtLeast } from '@engine/layout/breakpoints';

describe('BREAKPOINTS 常量', () => {
  it('阈值与设计文档一致', () => {
    expect(BREAKPOINTS.PHONE_NARROW).toBe(0);
    expect(BREAKPOINTS.PHONE_WIDE).toBe(480);
    expect(BREAKPOINTS.TABLET).toBe(768);
    expect(BREAKPOINTS.DESKTOP).toBe(1024);
  });
});

describe('getBreakpoint', () => {
  it('0 → phone-narrow', () => {
    expect(getBreakpoint(0)).toBe('phone-narrow');
  });
  it('479 → phone-narrow（边界 - 1）', () => {
    expect(getBreakpoint(479)).toBe('phone-narrow');
  });
  it('480 → phone-wide（边界）', () => {
    expect(getBreakpoint(480)).toBe('phone-wide');
  });
  it('767 → phone-wide（边界 - 1）', () => {
    expect(getBreakpoint(767)).toBe('phone-wide');
  });
  it('768 → tablet（边界）', () => {
    expect(getBreakpoint(768)).toBe('tablet');
  });
  it('1023 → tablet（边界 - 1）', () => {
    expect(getBreakpoint(1023)).toBe('tablet');
  });
  it('1024 → desktop（边界）', () => {
    expect(getBreakpoint(1024)).toBe('desktop');
  });
  it('1920 → desktop（远端）', () => {
    expect(getBreakpoint(1920)).toBe('desktop');
  });
});

describe('isAtLeast', () => {
  it('phone-narrow 起步：所有正宽都 >= phone-narrow', () => {
    expect(isAtLeast(0, 'phone-narrow')).toBe(true);
    expect(isAtLeast(390, 'phone-narrow')).toBe(true);
    expect(isAtLeast(1024, 'phone-narrow')).toBe(true);
  });

  it('390 cssW：>= phone-narrow，< phone-wide', () => {
    expect(isAtLeast(390, 'phone-narrow')).toBe(true);
    expect(isAtLeast(390, 'phone-wide')).toBe(false);
    expect(isAtLeast(390, 'tablet')).toBe(false);
    expect(isAtLeast(390, 'desktop')).toBe(false);
  });

  it('480 cssW：>= phone-wide，< tablet', () => {
    expect(isAtLeast(480, 'phone-narrow')).toBe(true);
    expect(isAtLeast(480, 'phone-wide')).toBe(true);
    expect(isAtLeast(480, 'tablet')).toBe(false);
    expect(isAtLeast(480, 'desktop')).toBe(false);
  });

  it('768 cssW：>= tablet，< desktop', () => {
    expect(isAtLeast(768, 'phone-wide')).toBe(true);
    expect(isAtLeast(768, 'tablet')).toBe(true);
    expect(isAtLeast(768, 'desktop')).toBe(false);
  });

  it('1024 cssW：>= desktop', () => {
    expect(isAtLeast(1024, 'tablet')).toBe(true);
    expect(isAtLeast(1024, 'desktop')).toBe(true);
  });
});
