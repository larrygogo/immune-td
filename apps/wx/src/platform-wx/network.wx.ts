import type { NetworkAdapter, NetworkRequestOpts, NetworkResponse } from '@/platform/types';

declare const wx: any;

/**
 * wx 端 NetworkAdapter：用 wx.request。
 * 注意：
 * - URL 必须是绝对 URL（http/https），相对路径 wx 不接受
 * - body 自动 JSON 序列化（非 string）
 * - 超时默认 15s
 * - wx.request 的合法域名必须在微信公众平台白名单内（开发期模拟器可关「不校验」）
 */
export const wxNetwork: NetworkAdapter = {
  request<T = unknown>(opts: NetworkRequestOpts): Promise<NetworkResponse<T>> {
    return new Promise((resolve, reject) => {
      const { method, url, headers, body, timeoutMs } = opts;
      let data: unknown = body;
      // 非 string body 让 wx 自动 JSON encode（wx.request 接受 object）
      if (typeof data === 'string') {
        // wx.request data: string 会原样发送
      }
      wx.request({
        url,
        method,
        header: headers ?? {},
        data,
        timeout: timeoutMs ?? 15000,
        success: (r: { statusCode: number; data: unknown }) => {
          resolve({ status: r.statusCode, data: r.data as T });
        },
        fail: (e: { errMsg: string }) => {
          reject(new Error(`wx.request fail: ${e.errMsg}`));
        },
      });
    });
  },
};
