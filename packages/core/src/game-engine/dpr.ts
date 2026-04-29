/** HiDPI 倍率，限制 1~3 避免某些设备 dpr=4 时渲染过量。
 * 抽到独立模块避免 init.ts ↔ Scene 之间循环依赖导致 undefined。 */
export const DPR =
  typeof window !== 'undefined' ? Math.max(1, Math.min(3, window.devicePixelRatio || 1)) : 1;
