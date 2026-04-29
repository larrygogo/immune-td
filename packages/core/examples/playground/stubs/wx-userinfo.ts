// playground 不会触发 wx userInfo 授权流程；BootScene 静态 import 仍要解析模块
export interface WxUserInfoButton {
  onTap(cb: (res: unknown) => void): void;
  destroy(): void;
}

export function createUserInfoButton(_opts: {
  left: number;
  top: number;
  width: number;
  height: number;
}): WxUserInfoButton {
  throw new Error('[playground] createUserInfoButton not available');
}
