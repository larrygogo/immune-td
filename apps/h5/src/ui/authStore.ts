import { create } from 'zustand';
import { apiFetch } from './apiClient';

/**
 * 认证状态 store。与 gameStore / uiStore / metaStore 同一栈，但不用 persist
 * middleware —— token 手动写 localStorage（auth_token），user 启动时 GET /api/me 拉。
 * 这样做的好处：server 侧 token 失效时页面刷新能自动感知并清空 user 视图。
 */

/** 当前是否运行在微信小游戏端（vite.wx.config.ts 注入 VITE_PLATFORM=wx） */
const IS_WX = import.meta.env.VITE_PLATFORM === 'wx';

export interface AuthUser {
  id: number;
  username: string;
  role: 'player' | 'admin';
  /** H5 玩家昵称（仅 H5 流程使用，wx 用户恒 null） */
  nickname?: string | null;
  /** H5 昵称首次 / 改名 SQLite datetime（用于客户端展示冷却倒计时；本次仅落地） */
  nickname_set_at?: string | null;
  /** wx 授权 userInfo 后回填（H5 / 未授权时 server 返回 null） */
  wechat_nickname?: string | null;
  /** wx 头像 URL（同上） */
  wechat_avatar?: string | null;
}

export interface AuthState {
  token: string | null;
  user: AuthUser | null;
  /** derived：true 仅当 token + user 两者都有 */
  isAuthenticated: () => boolean;
  /** 启动时调一次：从 localStorage 恢复 token，如有则 GET /api/me 校验并填 user；失败清空 */
  loadFromStorage: () => Promise<void>;
  /** POST /api/auth/register → { token, user }；失败抛错（message 供 UI toast） */
  register: (username: string, password: string, afterAuth?: () => void) => Promise<void>;
  /** POST /api/auth/login → { token, user } */
  login: (username: string, password: string, afterAuth?: () => void) => Promise<void>;
  /**
   * POST /api/auth/wechat-login → { token, user }
   * 微信小游戏自动登录用：BootScene 调 wx.login() 拿到 code 后传入。
   * 失败抛错（含 server message），由调用方决定是否 retry。
   */
  wechatLogin: (code: string) => Promise<void>;
  /**
   * POST /api/auth/wechat-bind-userinfo → 更新 user 的 wechat_nickname / wechat_avatar。
   * BootScene 通过 wx.createUserInfoButton 拿到 userInfo 后调用。
   * 失败抛错（含 server message），由调用方决定是否 retry。
   */
  bindWechatUserInfo: (nickname: string, avatar: string) => Promise<void>;
  /**
   * POST /api/auth/nickname → 更新 user.nickname / nickname_set_at。
   * 失败抛错（401 / 400 / 409 nickname_taken / 429 nickname_change_cooldown）。
   */
  setNickname: (nickname: string) => Promise<void>;
  /** POST /api/auth/logout；本地 state 无论后端是否成功都清空 */
  logout: () => Promise<void>;
}

const TOKEN_KEY = 'auth_token';

function extractErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const b = body as { message?: unknown; error?: unknown };
    if (typeof b.message === 'string') return b.message;
    if (typeof b.error === 'string') return b.error;
  }
  return `HTTP ${status}`;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  token: null,
  user: null,

  isAuthenticated: () => get().token !== null && get().user !== null,

  loadFromStorage: async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    set({ token });
    try {
      const res = await apiFetch('/api/me');
      if (!res.ok) throw new Error(`me failed ${res.status}`);
      const body = (await res.json()) as { user: AuthUser };
      set({ user: body.user });
      await syncAfterAuth(body.user.id);
      dispatchAfterAuth(body.user);
    } catch {
      // token 无效 / 网络错：清空
      localStorage.removeItem(TOKEN_KEY);
      set({ token: null, user: null });
    }
  },

  register: async (username, password, afterAuth) => {
    const res = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(extractErrorMessage(err, res.status));
    }
    const { token, user } = (await res.json()) as { token: string; user: AuthUser };
    localStorage.setItem(TOKEN_KEY, token);
    set({ token, user });
    await syncAfterAuth(user.id);
    dispatchAfterAuth(user, afterAuth);
  },

  login: async (username, password, afterAuth) => {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(extractErrorMessage(err, res.status));
    }
    const { token, user } = (await res.json()) as { token: string; user: AuthUser };
    localStorage.setItem(TOKEN_KEY, token);
    set({ token, user });
    await syncAfterAuth(user.id);
    dispatchAfterAuth(user, afterAuth);
  },

  wechatLogin: async (code) => {
    const res = await apiFetch('/api/auth/wechat-login', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(extractErrorMessage(err, res.status));
    }
    const { token, user } = (await res.json()) as { token: string; user: AuthUser };
    localStorage.setItem(TOKEN_KEY, token);
    set({ token, user });
    await syncAfterAuth(user.id);
  },

  bindWechatUserInfo: async (nickname, avatar) => {
    const res = await apiFetch('/api/auth/wechat-bind-userinfo', {
      method: 'POST',
      body: JSON.stringify({ nickname, avatar }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(extractErrorMessage(err, res.status));
    }
    const { user } = (await res.json()) as { user: AuthUser };
    // 不重发 progressSync（user.id 不变），只更新本地 user 对象
    set({ user });
  },

  setNickname: async (nickname) => {
    const res = await apiFetch('/api/auth/nickname', {
      method: 'POST',
      body: JSON.stringify({ nickname }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(extractErrorMessage(err, res.status));
    }
    const { user } = (await res.json()) as { user: AuthUser };
    set({ user });
  },

  logout: async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // 即便后端失败本地也要清
    }
    localStorage.removeItem(TOKEN_KEY);
    set({ token: null, user: null });
    await clearProgressAfterLogout();
  },
}));

/**
 * 登录 / 注册 / loadFromStorage 成功后触发进度同步。
 * 用懒 import 规避 authStore ↔ progressSync 循环依赖（progressSync 反过来 import useAuthStore）。
 * onLoginSyncProgress 内部对网络错已做 try/catch，此处再套一层保险不让登录流程被同步异常打断。
 */
async function syncAfterAuth(userId: number): Promise<void> {
  try {
    const { onLoginSyncProgress } = await import('./progressSync');
    await onLoginSyncProgress(userId);
  } catch (err) {
    console.warn('[authStore] progressSync 异常，登录流程继续:', err);
  }
}

async function clearProgressAfterLogout(): Promise<void> {
  try {
    const { onLogoutClearProgress } = await import('./progressSync');
    onLogoutClearProgress();
  } catch (err) {
    console.warn('[authStore] logout clear 异常:', err);
  }
}

/**
 * H5 登录后 nickname 编排（spec § 5.4）：
 * - wx 端 / 已有 nickname → 直接调 afterAuth
 * - H5 + nickname 为空 → 打开 NicknameModal，afterAuth 串到 modal 提交成功后
 */
function dispatchAfterAuth(user: AuthUser, afterAuth?: () => void): void {
  // wx 端永远跳过 nickname modal —— 提前 return 让 esbuild minify 时整段消除
  if (IS_WX) {
    afterAuth?.();
    return;
  }
  const hasNickname = user.nickname && user.nickname.length > 0;
  if (hasNickname) {
    afterAuth?.();
    return;
  }
  // 懒 import 避 store ↔ authStore 循环；失败时 console.warn 兜底放行避免登录后卡死
  void import('@ui/store').then(
    ({ useUiStore }) => {
      useUiStore.getState().openNicknameModal(() => afterAuth?.());
    },
    (err) => {
      console.warn('[authStore] open nickname modal failed:', err);
      afterAuth?.();
    },
  );
}

/**
 * 取用户「最佳展示名」（spec § 5.3 + § 7）：
 * 优先级：nickname > wechat_nickname > username。
 */
export function displayName(user: AuthUser): string {
  if (user.nickname && user.nickname.length > 0) return user.nickname;
  if (user.wechat_nickname && user.wechat_nickname.length > 0) return user.wechat_nickname;
  return user.username;
}
