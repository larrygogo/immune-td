/**
 * Shell 扩展点：宿主壳（H5 / wx / playground）注入给 core 的桥接接口。
 *
 * 设计目的：让 core 不直接 import 账号/同步/网络代码，而是通过宿主注入的能力使用。
 * 不传时 core 内对应功能优雅降级（如 playground 离线模式：apiFetch 不存在 → 不发请求）。
 *
 * 注入时机：宿主在 `installAdapters()` 之后、`bootGame()` 之前调一次 `installShell()`。
 */

export interface AuthUser {
  id: number;
  username: string;
  role: 'player' | 'admin';
  nickname?: string | null;
  nickname_set_at?: string | null;
  wechat_nickname?: string | null;
  wechat_avatar?: string | null;
}

/** core 内消费的 authStore 子集（H5 端实际是 zustand store 的 getState/subscribe 子集） */
export interface AuthStoreShell {
  getState(): {
    user: AuthUser | null;
    token: string | null;
    isAuthenticated(): boolean;
    loadFromStorage(): Promise<void>;
    wechatLogin(code: string): Promise<void>;
    bindWechatUserInfo(nickname: string, avatar: string): Promise<void>;
    logout(): Promise<void>;
  };
  subscribe(listener: () => void): () => void;
}

export interface ShellExtensions {
  /** 带认证的 server 请求；不传则 core 内相关 UI / 功能降级（playground 离线） */
  apiFetch?: (path: string, init?: RequestInit) => Promise<Response>;

  /** 账号 store 注入；不传则 isAuthenticated 视为 false */
  authStore?: AuthStoreShell;

  /** 把账号对象转成展示名；不传则 fallback 到 user.username */
  displayName?: (user: AuthUser) => string;
}

let shell: ShellExtensions = {};

export function installShell(ext: ShellExtensions): void {
  shell = ext;
}

export function getShell(): ShellExtensions {
  return shell;
}

/** core 内通用 helper：取展示名，无注入则回 username */
export function shellDisplayName(user: AuthUser | null | undefined): string {
  if (!user) return '';
  return shell.displayName ? shell.displayName(user) : user.username;
}

/** core 内通用 helper：是否登录态，无 authStore 注入则 false（playground 默认） */
export function shellIsAuthenticated(): boolean {
  const a = shell.authStore?.getState();
  return a?.isAuthenticated() ?? false;
}
