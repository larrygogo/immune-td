/**
 * 平台适配层接口集合。游戏核心 / 业务层只通过 PlatformAdapters 访问平台 IO，
 * 具体实现由入口（main.web.ts / 未来的 main.wx.ts）注入。
 *
 * 接口故意保持小而同形，避免为某一端引入冗余参数：
 * - StorageAdapter 不暴露 keys() / clear()（wx.storage 没有同步迭代 API）
 * - NetworkAdapter 返回 { status, data } 而不是 Response（Response 只 web 有）
 * - AudioAdapter 用资源 key 而不是 URL（wx 加载方式不同）
 * - DeviceAdapter 不暴露 setDeviceId（设备 id 由各端自己生成 / 缓存）
 */

export interface StorageAdapter {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface NetworkRequestOpts {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  /** 非 undefined 时若 method !== 'GET' 会被序列化成 JSON；adapter 内部决定。 */
  body?: unknown;
  timeoutMs?: number;
}

export interface NetworkResponse<T> {
  status: number;
  data: T;
}

export interface NetworkAdapter {
  request<T = unknown>(opts: NetworkRequestOpts): Promise<NetworkResponse<T>>;
}

export interface AudioAdapter {
  /** 把音频资源加载到内存 / 解码缓存；同 key 重复调用 no-op */
  preload(key: string, src: string): Promise<void>;
  playSfx(key: string, opts?: { volume?: number }): void;
  playBgm(key: string, opts?: { volume?: number; loop?: boolean }): void;
  stopBgm(): void;
  setMasterVolume(v: number): void;
}

export interface DeviceAdapter {
  /** 平台特定的稳定设备 / 用户标识：web=UUID，wx=openid */
  getDeviceId(): string;
  getPlatform(): 'web' | 'wx';
}

export interface PlatformAdapters {
  storage: StorageAdapter;
  network: NetworkAdapter;
  audio: AudioAdapter;
  device: DeviceAdapter;
}
