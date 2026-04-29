import { type NetworkRequestOpts, getAdapters } from '@/platform';
import { getDeviceId } from './deviceIdStore';

/**
 * 所有前端 → server 请求的统一入口。
 * - 自动带 X-Device-Id（server 端 POST 必需）
 * - 有 token 时带 Authorization: Bearer
 * - body 非空自动加 Content-Type: application/json
 *
 * 内部走 platform.network 适配层（H5 = fetch；未来 wx = wx.request）。
 * 对外仍返回 Response，业务调用 res.ok / res.json() / res.status 不受影响。
 *
 * 注意：循环依赖规避 —— authStore 依赖 apiClient（调 me / login / register），
 * apiClient 要读 authStore.token。为避免 circular import 卡 module init，这里
 * **懒引用** store，每次请求现取（开销忽略）。
 */
function getApiBase(): string {
  const env = import.meta.env.VITE_API_BASE_URL;
  if (env) return env;

  const port = import.meta.env.VITE_API_PORT;
  if (port) {
    // 同域名不同端口：自动拼 http(s)://当前域名:port
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    return `${protocol}//${hostname}:${port}`;
  }

  // dev 走 Vite proxy；prod 同源部署时走相对路径
  return '';
}

function flattenHeaders(input: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input) return out;
  const h = new Headers(input);
  h.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

function hasHeaderCI(headers: Record<string, string>, name: string): boolean {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((k) => k.toLowerCase() === lower);
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = getApiBase();
  const headers = flattenHeaders(init.headers);

  headers['X-Device-Id'] = getDeviceId();
  if (init.body != null && !hasHeaderCI(headers, 'Content-Type')) {
    headers['Content-Type'] = 'application/json';
  }
  // 懒引用 authStore 避免 circular import（authStore 同样 import 本文件）
  const { useAuthStore } = await import('./authStore');
  const token = useAuthStore.getState().token;
  if (token && !hasHeaderCI(headers, 'Authorization')) {
    headers.Authorization = `Bearer ${token}`;
  }

  const method = (init.method ?? 'GET').toUpperCase() as NetworkRequestOpts['method'];
  const opts: NetworkRequestOpts = {
    method,
    url: `${base}${path}`,
    headers,
  };
  if (init.body !== undefined && init.body !== null) {
    opts.body = init.body;
  }

  const { network } = getAdapters();
  const { status, data } = await network.request(opts);

  // 1xx / 204 / 205 / 304 不允许带 body：new Response(text, {status: 204}) 在浏览器和
  // node 都会抛 TypeError（jsdom 宽松不抛因此原测试没暴露）；server 端 logout / DELETE
  // session / DELETE bug-report 都返回 204。无 body 状态码必须传 null。
  const isNoBodyStatus =
    status === 204 || status === 205 || status === 304 || (status >= 100 && status < 200);
  if (isNoBodyStatus) {
    return new Response(null, { status });
  }

  // 包成 Response：data 已被 NetworkAdapter 解析；这里 stringify 回去，
  // 让调用方 res.json() 仍能拿到原对象。
  let text = '';
  if (typeof data === 'string') {
    text = data;
  } else if (data !== undefined && data !== null) {
    text = JSON.stringify(data);
  }
  return new Response(text, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
