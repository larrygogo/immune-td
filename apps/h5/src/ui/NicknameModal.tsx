import { type CSSProperties, type FormEvent, useEffect, useRef, useState } from 'react';
import { useAuthStore } from './authStore';
import { useUiStore } from '@ui/store';

/**
 * H5 玩家昵称强制设置 modal（HTML overlay，spec § 6）。
 *
 * 触发：authStore.dispatchAfterAuth 检测到 user.nickname 为空时 openNicknameModal。
 * 不可关：无 × / Esc 不响应 / 点遮罩无效 —— 用户唯一出路是填合法值提交成功。
 *
 * 视觉与 LoginModal 一致（cyber HUD + 4 角 L 装饰 + 同款 input bar / 提交按钮）。
 * wx 端不挂 React，自然不渲染。
 */

const COLOR = {
  primary: '#5de0b5',
  dim: '#8a9e98',
  bgCard: '#0d1518',
  danger: '#ff4050',
  text: '#c8d4e0',
};

const NICKNAME_RE = /^[a-zA-Z0-9_一-龥]+$/;

/** server 返回 `HTTP 4xx/5xx` 时按 status 转中文兜底；否则 server message 原文。 */
function humanizeError(raw: string): string {
  if (/HTTP\s+401/.test(raw)) return '请重新登录';
  if (/HTTP\s+5\d{2}/.test(raw)) return '服务暂时不可用，请稍后重试';
  if (/HTTP\s+\d{3}/.test(raw)) return '请求失败，请检查网络';
  return raw || '请求失败，请检查网络';
}

/** 客户端校验：长度 4-8（按 code points 计，中文算 1）+ 字符集白名单。 */
function clientValidate(s: string): string | null {
  const len = Array.from(s).length;
  if (len < 4 || len > 8) return '昵称需 4-8 位';
  if (!NICKNAME_RE.test(s)) return '仅限中英数字与下划线';
  return null;
}

export function NicknameModal() {
  const open = useUiStore((s) => s.nicknameModalOpen);
  const afterAuth = useUiStore((s) => s.nicknameModalAfterAuth);
  const closeNicknameModal = useUiStore((s) => s.closeNicknameModal);
  const setNickname = useAuthStore((s) => s.setNickname);

  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState(false);
  const [submitHover, setSubmitHover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setSubmitting(false);
      setValue('');
      // 延一帧聚焦，等 modal 渲染完成
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (submitting) return;
    const v = value.trim();
    const localErr = clientValidate(v);
    if (localErr) {
      setError(localErr);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await setNickname(v);
      const cb = afterAuth;
      closeNicknameModal();
      cb?.();
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setError(humanizeError(raw));
    } finally {
      setSubmitting(false);
    }
  };

  // spec § 6.4 不可关：禁止加 onClose / Esc 监听 / overlay onMouseDown 关闭判断
  return (
    // biome-ignore lint/a11y/useSemanticElements: 与 LoginModal 一致用 div+role="dialog"，便于自定义遮罩样式与测试 getByRole
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-label="nickname-modal">
      <KeyframeStyles />
      <form
        aria-label="nickname-form"
        style={cardStyle}
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
      >
        <CornerL position="tl" />
        <CornerL position="tr" />
        <CornerL position="bl" />
        <CornerL position="br" />

        <div style={titleStyle}>设 置 昵 称</div>
        <div style={subtitleStyle}>成为玩家档案的一部分 · 7 天后可修改</div>

        <div style={inputWrapStyle(focus)}>
          <span style={inputBarStyle(focus)} />
          <input
            ref={inputRef}
            type="text"
            placeholder="4-8 位，中英数字 / 下划线"
            aria-label="nickname"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            className="nm-input"
            style={inputStyle}
            disabled={submitting}
            // 大于 spec 上限 8 是有意：超长输入触发 client 校验给"需 4-8 位"提示，比硬截断更友好
            maxLength={16}
          />
        </div>

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
          <span>{submitting ? '提交中…' : '确 认'}</span>
        </button>
      </form>
    </div>
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
@keyframes nm-fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes nm-popIn  { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
@keyframes nm-spin   { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.nm-input::placeholder { color: rgba(138, 158, 152, 0.5); }
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
  zIndex: 110,
  fontFamily:
    '"PingFang SC", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  animation: 'nm-fadeIn 160ms ease-out',
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
  animation: 'nm-popIn 180ms cubic-bezier(0.2, 0.8, 0.3, 1)',
};

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
  animation: 'nm-spin 0.8s linear infinite',
};
