/*!
 * wx 端 zustand shim：替代 zustand 主入口（避免拉 React 触发 wx Symbol.for bug）
 * vite.wx.config.ts 通过 alias 把 'zustand' 导入指向这里。
 *
 * zustand 5.x 主入口的 `create` 内部用 React useSyncExternalStore，wx 不需要这层。
 * 这里直接 export vanilla createStore，store API 完全等价（getState/setState/subscribe）。
 *
 * 已知不兼容：当 useStore 被当 React hook 调用时（`useStore((s) => s.x)`），shim 不工作。
 * wx 端没 React 不需要这种用法。H5 端不走这个 shim（vite.config.ts 不 alias）。
 */
import { createStore as vanillaCreateStore } from 'zustand/vanilla';

// biome-ignore lint/suspicious/noExplicitAny: shim 类型简化
function createImpl(initializer: any): any {
  return vanillaCreateStore(initializer);
}

// zustand 5.x: 支持 create()(initializer) 和 create(initializer) 两种调用
// biome-ignore lint/suspicious/noExplicitAny: shim 类型简化
export const create: any = (initializer?: any) => {
  if (initializer === undefined) return createImpl;
  return createImpl(initializer);
};

// re-export vanilla 的 createStore 以防有人直接用
export { createStore } from 'zustand/vanilla';
