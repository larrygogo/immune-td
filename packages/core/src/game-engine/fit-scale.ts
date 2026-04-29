/**
 * 全局 FIT 缩放系数（参考 Cocos design resolution）。
 *
 * 用途：让 Phaser internal buffer 的物理像素跟设备 CSS × DPR 对齐，避免桌面 / 大屏上
 * 设计图被浏览器上采样导致字糊。`px(n)` 在 style.ts 里被改写成 `n * DPR * getFitScale()`,
 * scene 输出的最大坐标 = px(DESIGN_W) = DESIGN_W * DPR * fitScale = bufferW，正好填满。
 *
 * 由 init.ts 的 createPhaserGame() 在 Phaser game 实例化前调用 setFitScale(...) 写入，
 * window resize 时同步更新 + 触发 scene re-layout。读取走函数避免被 inline 死值。
 *
 * 抽到独立模块避免 init.ts ↔ style.ts 循环依赖（style.ts 被 scene 文件大量 import,
 * scene 文件被 init.ts 聚合 import 进 game config）。
 */

let _fitScale = 1;

/** 当前 FIT 缩放系数。在 init.ts 计算后写入；scene 不应直接调用，由 px() 间接读。 */
export const getFitScale = (): number => _fitScale;

/** init.ts 在创建 game 前调用 + window resize 时调用。 */
export const setFitScale = (s: number): void => {
  _fitScale = s;
};
