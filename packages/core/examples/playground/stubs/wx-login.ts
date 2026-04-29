// playground 不会触发 wx 路径（IS_WX=false），但 BootScene 静态 import 仍要解析模块
export function wxLogin(): Promise<{ code: string }> {
  throw new Error('[playground] wxLogin not available');
}
