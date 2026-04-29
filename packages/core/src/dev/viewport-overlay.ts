/**
 * 视口诊断 overlay（dev only）。挂个 fixed div 在右上角，rAF 持续刷新，把所有
 * 跟 canvas 尺寸 / FIT 缩放相关的关键变量平铺出来，方便定位真机黑边/模糊原因。
 *
 * 字段含义：
 *   window.innerW/H   — JS 拿到的可见区域（iOS Safari 上 = visual viewport，会变）
 *   docEl.clientH     — documentElement 高（iOS Safari 上跟 innerH 一样小）
 *   body.rect.h       — body 渲染后实际高度（CSS 100dvh 撑到 layout viewport 全屏）
 *   vv.height         — visualViewport API 报的可见高（iOS toolbar 收起时 = layout）
 *   vv.offsetTop      — visualViewport 在 layout viewport 内的 Y 偏移
 *   canvas style.w/h  — fitCanvas 设的 CSS 尺寸
 *   canvas.width      — buffer 物理宽（= canvasCssW × DPR）
 *   canvas rect.w/h   — canvas 实际渲染尺寸（应 = style.w/h，不一致说明 CSS layout 异常）
 *   DPR / fitScale    — px(n) 缩放系数
 *
 * 黑边定位规则：
 *   - body.rect.h > canvas style.h → 上下黑边（canvas 没充满 body）
 *   - canvas style.h > vv.height → toolbar 遮住 canvas 一部分（正常，滑动后消失）
 *   - canvas rect.h ≠ canvas style.h → CSS 计算异常，检查 #root flex 或 box-sizing
 */
import { DPR } from '@engine/dpr';
import { getFitScale } from '@engine/fit-scale';

let mounted = false;

export function mountViewportOverlay(): void {
  if (mounted) return;
  if (typeof document === 'undefined') return;
  mounted = true;

  const div = document.createElement('div');
  div.id = '__viewport-overlay';
  div.style.cssText = [
    'position:fixed',
    'top:8px',
    'right:8px',
    'padding:6px 8px',
    'background:rgba(0,0,0,0.78)',
    'color:#0f8',
    'font:11px/1.35 ui-monospace,"SF Mono","Consolas",monospace',
    'border:1px solid rgba(0,255,128,0.4)',
    'border-radius:4px',
    'z-index:2147483647',
    'pointer-events:none',
    'white-space:pre',
    'max-width:62vw',
    'overflow:hidden',
  ].join(';');
  document.body.appendChild(div);

  const tick = () => {
    const root = document.documentElement;
    const body = document.body;
    const bodyRect = body.getBoundingClientRect();
    const vv = window.visualViewport;
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
    const cRect = canvas?.getBoundingClientRect();

    const lines: string[] = [];
    lines.push('[viewport]');
    lines.push(`win.innerW/H : ${window.innerWidth} × ${window.innerHeight}`);
    lines.push(`docEl.client : ${root.clientWidth} × ${root.clientHeight}`);
    lines.push(`body.rect    : ${bodyRect.width.toFixed(0)} × ${bodyRect.height.toFixed(0)}`);
    if (vv) {
      lines.push(
        `vv.size      : ${vv.width.toFixed(0)} × ${vv.height.toFixed(0)} (off ${vv.offsetTop.toFixed(0)})`,
      );
    }
    lines.push(`DPR / fit    : ${DPR} / ${getFitScale().toFixed(3)}`);

    if (canvas && cRect) {
      lines.push('[canvas]');
      lines.push(`style.w/h    : ${canvas.style.width} × ${canvas.style.height}`);
      lines.push(`buffer       : ${canvas.width} × ${canvas.height}`);
      lines.push(`rect.w/h     : ${cRect.width.toFixed(0)} × ${cRect.height.toFixed(0)}`);
      lines.push(`rect.top/lft : ${cRect.top.toFixed(0)} / ${cRect.left.toFixed(0)}`);

      const styleH = parseFloat(canvas.style.height || '0');
      const gapTop = cRect.top;
      const gapBot = bodyRect.height - cRect.bottom;
      const gapLeft = cRect.left;
      const gapRight = bodyRect.width - cRect.right;
      lines.push(
        `gaps T/B/L/R : ${gapTop.toFixed(0)} / ${gapBot.toFixed(0)} / ${gapLeft.toFixed(0)} / ${gapRight.toFixed(0)}`,
      );
      if (gapTop > 1 || gapBot > 1 || gapLeft > 1 || gapRight > 1) {
        lines.push('!! 黑边检测：canvas 未充满 body');
      }
      if (Math.abs(cRect.height - styleH) > 1) {
        lines.push(`!! style/rect 不一致：${styleH} vs ${cRect.height.toFixed(0)}`);
      }
    } else {
      lines.push('[canvas] (not yet mounted)');
    }

    div.textContent = lines.join('\n');
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
