/**
 * 顶部 / 底部安全区（buffer 像素，已乘 DPR）。
 *
 * **历史兼容**：本模块只 re-export `layout/safe-area.ts` 的 SAFE_TOP / SAFE_BOTTOM，
 * 旧 import 路径（如 `from '../safe-area'`）不破坏。新代码请直接 import
 * `from './layout/safe-area'` 或 `from './layout'`，那里有完整 4 边 + getSafeArea()。
 */
export { SAFE_BOTTOM, SAFE_TOP } from './layout/safe-area';
