/**
 * 微信小游戏 UserInfo 强授权封装。
 *
 * 微信硬约束：`wx.getUserInfo` / `wx.getUserProfile` 已下线，**唯一**合法链路是
 * `wx.createUserInfoButton`：创建一个原生透明覆盖按钮（独立于 canvas 渲染层），
 * 用户必须真实点这个按钮 SDK 才会弹授权框，无法从 JS 同步触发。
 *
 * 用法（BootScene 强登录扩展）：
 *   1. Phaser 画一个视觉占位按钮（PhaserButton 描边款），算它的 buffer px 包围盒
 *   2. 把 buffer px 除以 DPR 转 CSS px（wx button 单位是 CSS px）
 *   3. `createUserInfoButton({ left, top, width, height })` 在该位置生成透明 wx button
 *   4. 拿到的实例上调 `onTap(cb)` 注册回调
 *   5. 用户拒绝（`res.userInfo == null`）→ destroy 后调 `createUserInfoButton` 重建
 *      （wx 单按钮一次性用完即销毁更稳，避免 button 节点句柄状态错乱）
 *
 * 注意 wx button 一旦创建就**置顶 canvas 之上**，必须在用户授权完毕 / 离开此 scene 前
 * 主动 `destroy()`，否则会盖在后续场景按钮上。
 */
declare const wx: any;

/** wx 原生 button 的位置（CSS px） */
export interface WxUserInfoButtonRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** wx button onTap 回调入参（仅取我们关心的子集） */
export interface WxUserInfoTapResult {
  /** 用户拒绝授权时为 null（res.errMsg = "getUserInfo:fail auth deny"）；同意时为 nickName + avatarUrl 等 */
  userInfo: { nickName: string; avatarUrl: string } | null;
  errMsg?: string;
}

/** 包装实例：提供 onTap / destroy，不暴露 wx 原生 API */
export interface WxUserInfoButton {
  onTap: (cb: (res: WxUserInfoTapResult) => void) => void;
  destroy: () => void;
}

/**
 * 创建透明的 wx 原生 UserInfo 按钮，盖在 Phaser 占位按钮之上。
 * @param rect CSS px 位置（buffer px / DPR 后的值）
 */
export function createUserInfoButton(rect: WxUserInfoButtonRect): WxUserInfoButton {
  if (typeof wx === 'undefined' || typeof wx.createUserInfoButton !== 'function') {
    throw new Error('wx.createUserInfoButton unavailable');
  }
  const btn = wx.createUserInfoButton({
    type: 'text',
    text: '',
    style: {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      lineHeight: Math.round(rect.height),
      backgroundColor: '#00000000',
      color: '#00000000',
      textAlign: 'center',
      fontSize: 12,
      borderRadius: 4,
    },
    withCredentials: false,
    lang: 'zh_CN',
  });

  let destroyed = false;
  return {
    onTap(cb): void {
      if (destroyed) return;
      btn.onTap((res: WxUserInfoTapResult) => {
        cb(res);
      });
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      try {
        if (typeof btn.destroy === 'function') btn.destroy();
      } catch (e) {
        console.warn('[wx-userinfo] btn.destroy throw:', (e as Error).message);
      }
    },
  };
}
