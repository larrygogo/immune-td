import type { NetworkAdapter, NetworkRequestOpts, NetworkResponse } from '@/platform/types';

/**
 * H5 Network 实现：fetch + AbortController 实现 timeoutMs。
 * - body 是 object 时自动 JSON.stringify 并加 Content-Type: application/json（headers 已有则不覆盖）
 * - 返回 status + data；data 优先按 JSON 解析，失败则按 text 返回；空 body 返回 undefined
 * - HTTP 4xx/5xx 不 throw，由业务层判断 status 决定如何处理
 */
export const webNetwork: NetworkAdapter = {
  async request<T>(opts: NetworkRequestOpts): Promise<NetworkResponse<T>> {
    const { method, url, headers = {}, body, timeoutMs } = opts;
    const controller = new AbortController();
    const timer = timeoutMs
      ? setTimeout(() => {
          controller.abort();
        }, timeoutMs)
      : null;

    const finalHeaders: Record<string, string> = { ...headers };
    let payload: BodyInit | undefined;
    if (body !== undefined && method !== 'GET') {
      if (typeof body === 'string' || body instanceof FormData || body instanceof Blob) {
        payload = body;
      } else {
        payload = JSON.stringify(body);
        if (!Object.keys(finalHeaders).some((k) => k.toLowerCase() === 'content-type')) {
          finalHeaders['Content-Type'] = 'application/json';
        }
      }
    }

    try {
      const init: RequestInit = {
        method,
        headers: finalHeaders,
        signal: controller.signal,
      };
      if (payload !== undefined) init.body = payload;
      const res = await fetch(url, init);
      const text = await res.text();
      let data: unknown;
      if (text.length === 0) {
        data = undefined;
      } else {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      return { status: res.status, data: data as T };
    } finally {
      if (timer) clearTimeout(timer);
    }
  },
};
