declare const wx: any;

/**
 * wx.login 调用结果。
 * 成功时 code 为非空字符串（5min 内有效，server 用它换 openid + session_key）。
 * 失败时 reject Error，message 含 errMsg 便于上层 toast / log。
 */
export interface WxLoginResult {
  code: string;
  errMsg?: string;
}

/**
 * 包装 wx.login() 为 Promise。
 * 失败 reject 而不是 resolve 空 code，让上层 await 直接走 catch 分支重试。
 *
 * 注意：wx.login() 频率限制（同一用户 1s 内最多 1 次）。BootScene 的 retry
 * 间隔（500/1500/4500ms）已避开第一次重试的 1s 窗口冲突。
 */
export function wxLogin(): Promise<WxLoginResult> {
  return new Promise((resolve, reject) => {
    if (typeof wx === 'undefined' || typeof wx.login !== 'function') {
      reject(new Error('wx.login unavailable'));
      return;
    }
    wx.login({
      success: (res: { code?: string; errMsg?: string }) => {
        if (typeof res.code === 'string' && res.code.length > 0) {
          const result: WxLoginResult = { code: res.code };
          if (res.errMsg !== undefined) result.errMsg = res.errMsg;
          resolve(result);
        } else {
          reject(new Error(`wx.login no code: ${res.errMsg ?? 'unknown'}`));
        }
      },
      fail: (e: { errMsg?: string }) => {
        reject(new Error(`wx.login fail: ${e.errMsg ?? 'unknown'}`));
      },
    });
  });
}
