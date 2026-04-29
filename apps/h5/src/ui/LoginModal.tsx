import { type CSSProperties, type FormEvent, useEffect, useRef, useState } from 'react';
import { useAuthStore } from './authStore';
import { useUiStore } from '@ui/store';

/**
 * H5 登录 modal（HTML overlay）。
 *
 * 触发：MainMenuScene "开始游戏" 未登录时 / 账号按钮 / ReplayListScene "前往登录"。
 * 调用方走 `useUiStore.openLoginModal(afterAuth?)`，登录或注册成功后 modal 自动关闭并触发 afterAuth。
 *
 * wx 端不挂 React 壳（main.wx.ts 直接 new Phaser.Game），此组件只在 H5 渲染。
 *
 * 视觉：cyber HUD（cyan-on-dark）+ 4 角 L 装饰，与 Phaser 卡片一致；去 shadow / 去发光，
 * 对齐主菜单 V7 风格。
 */

const COLOR = {
  primary: '#5de0b5',
  accent: '#6ed4ee',
  dim: '#8a9e98',
  bgDeep: '#070a0c',
  bgCard: '#0d1518',
  danger: '#ff4050',
  text: '#c8d4e0',
};

type Mode = 'login' | 'register';

/** server 返回 `HTTP 4xx/5xx` 时按 status 转中文兜底；否则 server message 原文。 */
function humanizeError(raw: string): string {
  const m = /^HTTP\s+(\d+)$/.exec(raw);
  if (!m) return raw;
  const status = Number(m[1]);
  if (status === 401 || status === 403) return '用户名或密码错误';
  if (status === 409) return '用户名已被占用';
  if (status === 429) return '操作过于频繁，请稍后再试';
  if (status >= 500) return '服务暂时不可用，请稍后重试';
  return '请求失败，请检查网络';
}

export function LoginModal() {
  const open = useUiStore((s) => s.loginModalOpen);
  const afterAuth = useUiStore((s) => s.loginModalAfterAuth);
  const closeLoginModal = useUiStore((s) => s.closeLoginModal);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);

  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usernameFocus, setUsernameFocus] = useState(false);
  const [passwordFocus, setPasswordFocus] = useState(false);
  const [submitHover, setSubmitHover] = useState(false);
  const [closeHover, setCloseHover] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setSubmitting(false);
      // 延一帧聚焦，等 modal 渲染完成
      requestAnimationFrame(() => usernameRef.current?.focus());
    } else {
      // 关闭时清空敏感字段（密码留页面会被浏览器记忆，不希望泄漏到历史 DOM）
      setPassword('');
    }
  }, [open]);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeLoginModal();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closeLoginModal]);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (submitting) return;
    const u = username.trim();
    if (!u || !password) {
      setError('用户名和密码必填');
      return;
    }
    if (mode === 'register' && password.length < 8) {
      setError('密码至少 8 位');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // afterAuth 透传给 authStore：
      // - 已有 nickname / wx 端 → authStore.dispatchAfterAuth 直接调 afterAuth
      // - H5 + 无 nickname → 先弹 NicknameModal，提交成功后由 modal 触发 afterAuth
      // 不再手动 cb?.()，避免「登录后未填昵称就被放进游戏」的中间态
      const cb = afterAuth ?? undefined;
      if (mode === 'login') await login(u, password, cb);
      else await register(u, password, cb);
      closeLoginModal();
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setError(humanizeError(raw));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSwitchMode = (m: Mode): void => {
    if (m === mode) return;
    setMode(m);
    setError(null);
  };

  const submitLabel = submitting
    ? mode === 'login'
      ? '登录中…'
      : '注册中…'
    : mode === 'login'
      ? '登 录'
      : '注 册';

  return (
    <div
      style={overlayStyle}
      onMouseDown={(e) => {
        // 点击遮罩关闭（只关闭，不触发 afterAuth）
        if (e.target === e.currentTarget) closeLoginModal();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="login-modal"
    >
      <KeyframeStyles />
      <form
        style={cardStyle}
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
      >
        <CornerL position="tl" />
        <CornerL position="tr" />
        <CornerL position="bl" />
        <CornerL position="br" />

        <button
          type="button"
          aria-label="close"
          style={closeBtnStyle(closeHover)}
          onMouseEnter={() => setCloseHover(true)}
          onMouseLeave={() => setCloseHover(false)}
          onClick={() => closeLoginModal()}
        >
          ×
        </button>

        <div style={titleStyle}>{mode === 'login' ? '登 录' : '注 册'}</div>
        <div style={subtitleStyle}>云端同步进度</div>

        <div style={tabRowStyle}>
          <TabBtn active={mode === 'login'} onClick={() => handleSwitchMode('login')}>
            登录
          </TabBtn>
          <TabBtn active={mode === 'register'} onClick={() => handleSwitchMode('register')}>
            注册
          </TabBtn>
        </div>

        <div style={inputWrapStyle(usernameFocus)}>
          <span style={inputBarStyle(usernameFocus)} />
          <input
            ref={usernameRef}
            type="text"
            placeholder="用户名"
            autoComplete="username"
            aria-label="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onFocus={() => setUsernameFocus(true)}
            onBlur={() => setUsernameFocus(false)}
            className="ltm-input"
            style={inputStyle}
            disabled={submitting}
          />
        </div>

        <div style={inputWrapStyle(passwordFocus)}>
          <span style={inputBarStyle(passwordFocus)} />
          <input
            type="password"
            placeholder={mode === 'register' ? '密码（至少 8 位）' : '密码'}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            aria-label="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={() => setPasswordFocus(true)}
            onBlur={() => setPasswordFocus(false)}
            className="ltm-input"
            style={inputStyle}
            disabled={submitting}
          />
        </div>

        {mode === 'register' && (
          <div style={hintStyle}>密码至少 8 位，建议字母 + 数字组合</div>
        )}

        <div style={errorRowStyle} aria-live="polite">
          {error && <span style={errorTriangleStyle} aria-hidden="true" />}
          <span style={errorTextStyle}>{error ?? ''}</span>
        </div>

        <button
          type="submit"
          style={submitBtnStyle(submitting, submitHover)}
          onMouseEnter={() => setSubmitHover(true)}
          onMouseLeave={() => setSubmitHover(false)}
          disabled={submitting}
        >
          {submitting && <span style={spinnerStyle} aria-hidden="true" />}
          <span>{submitLabel}</span>
        </button>
      </form>
    </div>
  );
}

function TabBtn({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 'none',
        color: active ? COLOR.primary : COLOR.dim,
        fontFamily: 'inherit',
        fontSize: 12,
        fontWeight: active ? 700 : 400,
        letterSpacing: '0.25em',
        padding: '6px 18px 8px',
        cursor: 'pointer',
        position: 'relative',
        transition: 'color 160ms ease',
        borderBottom: active
          ? `2px solid ${COLOR.primary}`
          : '2px solid transparent',
        minWidth: 92,
      }}
    >
      {children}
    </button>
  );
}

function CornerL({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }): React.JSX.Element {
  const size = 14;
  const thick = 2;
  const offset = 0;
  const base: CSSProperties = {
    position: 'absolute',
    width: size,
    height: size,
    pointerEvents: 'none',
  };
  const borderColor = COLOR.primary;
  const styles: Record<typeof position, CSSProperties> = {
    tl: {
      top: offset,
      left: offset,
      borderTop: `${thick}px solid ${borderColor}`,
      borderLeft: `${thick}px solid ${borderColor}`,
    },
    tr: {
      top: offset,
      right: offset,
      borderTop: `${thick}px solid ${borderColor}`,
      borderRight: `${thick}px solid ${borderColor}`,
    },
    bl: {
      bottom: offset,
      left: offset,
      borderBottom: `${thick}px solid ${borderColor}`,
      borderLeft: `${thick}px solid ${borderColor}`,
    },
    br: {
      bottom: offset,
      right: offset,
      borderBottom: `${thick}px solid ${borderColor}`,
      borderRight: `${thick}px solid ${borderColor}`,
    },
  };
  return <span style={{ ...base, ...styles[position] }} />;
}

/** 注入 keyframes：进场动画 + spinner 旋转。组件内联避免污染全局 css。 */
function KeyframeStyles(): React.JSX.Element {
  return (
    <style>{`
@keyframes ltm-fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes ltm-popIn  { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
@keyframes ltm-spin   { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.ltm-input::placeholder { color: rgba(138, 158, 152, 0.5); }
`}</style>
  );
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(7, 10, 12, 0.88)',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
  fontFamily:
    '"PingFang SC", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  animation: 'ltm-fadeIn 160ms ease-out',
};

const cardStyle: CSSProperties = {
  position: 'relative',
  width: 'min(92vw, 360px)',
  background: 'rgba(13, 21, 24, 0.95)',
  border: '1px solid rgba(93, 224, 181, 0.35)',
  padding: '40px 28px 28px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  animation: 'ltm-popIn 180ms cubic-bezier(0.2, 0.8, 0.3, 1)',
};

const closeBtnStyle = (hover: boolean): CSSProperties => ({
  position: 'absolute',
  top: 4,
  right: 6,
  width: 36,
  height: 36,
  background: 'transparent',
  border: 'none',
  color: hover ? COLOR.primary : COLOR.dim,
  fontSize: 24,
  lineHeight: 1,
  cursor: 'pointer',
  padding: 0,
  transition: 'color 160ms ease',
});

const titleStyle: CSSProperties = {
  textAlign: 'center',
  color: COLOR.primary,
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: '0.25em',
};

const subtitleStyle: CSSProperties = {
  textAlign: 'center',
  color: COLOR.dim,
  fontSize: 11,
  letterSpacing: '0.2em',
  marginTop: -8,
};

const tabRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  gap: 8,
  marginTop: 4,
};

const inputWrapStyle = (focus: boolean): CSSProperties => ({
  position: 'relative',
  background: focus ? 'rgba(93, 224, 181, 0.06)' : 'rgba(93, 224, 181, 0.03)',
  border: focus ? '1px solid rgba(93, 224, 181, 1)' : '1px solid rgba(93, 224, 181, 0.5)',
  height: 38,
  display: 'flex',
  alignItems: 'center',
  transition: 'border-color 160ms ease, background 160ms ease',
});

const inputBarStyle = (focus: boolean): CSSProperties => ({
  position: 'absolute',
  left: 0,
  top: 6,
  bottom: 6,
  width: focus ? 3 : 2,
  background: COLOR.primary,
  boxShadow: focus ? `0 0 6px ${COLOR.primary}` : 'none',
  transition: 'width 160ms ease, box-shadow 160ms ease',
});

const inputStyle: CSSProperties = {
  flex: 1,
  height: '100%',
  padding: '0 12px',
  background: 'transparent',
  color: COLOR.text,
  border: 'none',
  outline: 'none',
  fontFamily: 'inherit',
  fontSize: 13,
  letterSpacing: '0.1em',
};

const hintStyle: CSSProperties = {
  color: COLOR.dim,
  fontSize: 10,
  letterSpacing: '0.1em',
  marginTop: -8,
  paddingLeft: 4,
};

const errorRowStyle: CSSProperties = {
  minHeight: 18,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
};

const errorTriangleStyle: CSSProperties = {
  width: 0,
  height: 0,
  borderLeft: '5px solid transparent',
  borderRight: '5px solid transparent',
  borderBottom: `7px solid ${COLOR.danger}`,
};

const errorTextStyle: CSSProperties = {
  color: COLOR.danger,
  fontSize: 11,
  letterSpacing: '0.1em',
};

const submitBtnStyle = (submitting: boolean, hover: boolean): CSSProperties => {
  const bg = submitting
    ? 'rgba(93, 224, 181, 0.18)'
    : hover
      ? 'rgba(93, 224, 181, 0.12)'
      : 'transparent';
  return {
    height: 42,
    background: bg,
    border: `1px solid ${hover ? 'rgba(93, 224, 181, 1)' : 'rgba(93, 224, 181, 0.7)'}`,
    color: COLOR.primary,
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.35em',
    cursor: submitting ? 'progress' : 'pointer',
    outline: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    transition: 'background 160ms ease, border-color 160ms ease',
  };
};

const spinnerStyle: CSSProperties = {
  display: 'inline-block',
  width: 8,
  height: 8,
  border: `2px solid ${COLOR.primary}`,
  borderTopColor: 'transparent',
  borderRadius: '50%',
  animation: 'ltm-spin 0.8s linear infinite',
};
