import { describe, expect, it } from 'vitest';
import {
  anchorBottomCenter,
  anchorBottomLeft,
  anchorBottomRight,
  anchorMiddleCenter,
  anchorMiddleLeft,
  anchorMiddleRight,
  anchorTopCenter,
  anchorTopLeft,
  anchorTopRight,
  resolveAnchor,
} from '@engine/layout/anchor';
import type { SafeAreaInsets } from '@engine/layout/safe-area';

const W = 400;
const H = 800;

const SAFE: SafeAreaInsets = {
  top: 50,
  bottom: 30,
  left: 16,
  right: 16,
  contentX: 16,
  contentY: 50,
  contentWidth: 400 - 32,
  contentHeight: 800 - 80,
};

describe('resolveAnchor · 无 safeArea / 无 offset', () => {
  it('top-left → (0, 0)', () => {
    expect(resolveAnchor('top-left', W, H)).toEqual({ x: 0, y: 0 });
  });
  it('top-center → (W/2, 0)', () => {
    expect(resolveAnchor('top-center', W, H)).toEqual({ x: 200, y: 0 });
  });
  it('top-right → (W, 0)', () => {
    expect(resolveAnchor('top-right', W, H)).toEqual({ x: 400, y: 0 });
  });
  it('middle-left → (0, H/2)', () => {
    expect(resolveAnchor('middle-left', W, H)).toEqual({ x: 0, y: 400 });
  });
  it('middle-center → (W/2, H/2)', () => {
    expect(resolveAnchor('middle-center', W, H)).toEqual({ x: 200, y: 400 });
  });
  it('middle-right → (W, H/2)', () => {
    expect(resolveAnchor('middle-right', W, H)).toEqual({ x: 400, y: 400 });
  });
  it('bottom-left → (0, H)', () => {
    expect(resolveAnchor('bottom-left', W, H)).toEqual({ x: 0, y: 800 });
  });
  it('bottom-center → (W/2, H)', () => {
    expect(resolveAnchor('bottom-center', W, H)).toEqual({ x: 200, y: 800 });
  });
  it('bottom-right → (W, H)', () => {
    expect(resolveAnchor('bottom-right', W, H)).toEqual({ x: 400, y: 800 });
  });
});

describe('resolveAnchor · 有 offset 朝内偏移（无 safeArea）', () => {
  it('top-left + (10, 20) → (10, 20)', () => {
    expect(resolveAnchor('top-left', W, H, 10, 20)).toEqual({ x: 10, y: 20 });
  });
  it('top-right + (10, 20) → (W-10, 20)，offsetX 朝左', () => {
    expect(resolveAnchor('top-right', W, H, 10, 20)).toEqual({ x: 390, y: 20 });
  });
  it('bottom-left + (10, 20) → (10, H-20)，offsetY 朝上', () => {
    expect(resolveAnchor('bottom-left', W, H, 10, 20)).toEqual({ x: 10, y: 780 });
  });
  it('bottom-right + (10, 20) → (W-10, H-20)，两轴都朝内', () => {
    expect(resolveAnchor('bottom-right', W, H, 10, 20)).toEqual({ x: 390, y: 780 });
  });
  it('middle-center + (10, 20) → (W/2+10, H/2+20)，center 行/列直接累加', () => {
    expect(resolveAnchor('middle-center', W, H, 10, 20)).toEqual({ x: 210, y: 420 });
  });
  it('top-center + (10, 0) → (W/2+10, 0)，center 列 offsetX 直接累加', () => {
    expect(resolveAnchor('top-center', W, H, 10, 0)).toEqual({ x: 210, y: 0 });
  });
});

describe('resolveAnchor · 有 safeArea', () => {
  it('top-left → (left, top)', () => {
    expect(resolveAnchor('top-left', W, H, 0, 0, SAFE)).toEqual({ x: 16, y: 50 });
  });
  it('top-right → (left+contentWidth, top) = (W-right, top)', () => {
    expect(resolveAnchor('top-right', W, H, 0, 0, SAFE)).toEqual({ x: 16 + 368, y: 50 });
  });
  it('bottom-left → (left, top+contentHeight)', () => {
    expect(resolveAnchor('bottom-left', W, H, 0, 0, SAFE)).toEqual({ x: 16, y: 50 + 720 });
  });
  it('bottom-right → 内容区右下角', () => {
    expect(resolveAnchor('bottom-right', W, H, 0, 0, SAFE)).toEqual({ x: 384, y: 770 });
  });
  it('middle-center → 内容区几何中心', () => {
    // contentX=16 + contentWidth/2 = 16 + 184 = 200
    // contentY=50 + contentHeight/2 = 50 + 360 = 410
    expect(resolveAnchor('middle-center', W, H, 0, 0, SAFE)).toEqual({ x: 200, y: 410 });
  });
  it('top-right + offset(8, 4) safeArea：在内容区右上往内推', () => {
    expect(resolveAnchor('top-right', W, H, 8, 4, SAFE)).toEqual({ x: 376, y: 54 });
  });
  it('bottom-center + offset(0, 12) safeArea：内容区底部中点往上 12', () => {
    // bottom = top + contentHeight = 770; cx = 200
    expect(resolveAnchor('bottom-center', W, H, 0, 12, SAFE)).toEqual({ x: 200, y: 758 });
  });
});

describe('便捷 helper · 委托 resolveAnchor', () => {
  it('anchorTopLeft', () => {
    expect(anchorTopLeft(W, H, 5, 7, SAFE)).toEqual(resolveAnchor('top-left', W, H, 5, 7, SAFE));
  });
  it('anchorTopCenter', () => {
    expect(anchorTopCenter(W, H, 5, 7, SAFE)).toEqual(
      resolveAnchor('top-center', W, H, 5, 7, SAFE),
    );
  });
  it('anchorTopRight', () => {
    expect(anchorTopRight(W, H, 5, 7, SAFE)).toEqual(resolveAnchor('top-right', W, H, 5, 7, SAFE));
  });
  it('anchorMiddleLeft', () => {
    expect(anchorMiddleLeft(W, H, 5, 7, SAFE)).toEqual(
      resolveAnchor('middle-left', W, H, 5, 7, SAFE),
    );
  });
  it('anchorMiddleCenter', () => {
    expect(anchorMiddleCenter(W, H, 5, 7, SAFE)).toEqual(
      resolveAnchor('middle-center', W, H, 5, 7, SAFE),
    );
  });
  it('anchorMiddleRight', () => {
    expect(anchorMiddleRight(W, H, 5, 7, SAFE)).toEqual(
      resolveAnchor('middle-right', W, H, 5, 7, SAFE),
    );
  });
  it('anchorBottomLeft', () => {
    expect(anchorBottomLeft(W, H, 5, 7, SAFE)).toEqual(
      resolveAnchor('bottom-left', W, H, 5, 7, SAFE),
    );
  });
  it('anchorBottomCenter', () => {
    expect(anchorBottomCenter(W, H, 5, 7, SAFE)).toEqual(
      resolveAnchor('bottom-center', W, H, 5, 7, SAFE),
    );
  });
  it('anchorBottomRight', () => {
    expect(anchorBottomRight(W, H, 5, 7, SAFE)).toEqual(
      resolveAnchor('bottom-right', W, H, 5, 7, SAFE),
    );
  });
  it('helper 不传 safeArea 等价于 resolveAnchor 不传', () => {
    expect(anchorTopRight(W, H, 10)).toEqual(resolveAnchor('top-right', W, H, 10, 0));
  });
});
