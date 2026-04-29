/**
 * NicknameModal 行为测试（spec § 6 + § 8.4）：
 *
 * 覆盖：
 * - 渲染时输入框 focus
 * - 提交合法 nickname → setNickname 调用 + modal 关闭 + afterAuth 触发
 * - 太短 → 不调 setNickname，errorRow 显示中文
 * - Esc / 点遮罩 → modal 不关
 * - DOM 中无 close 按钮（aria-label="close" 找不到节点）
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { NicknameModal } from '@ui/NicknameModal';
import { useAuthStore } from '@ui/authStore';
import { useUiStore } from '@ui/store';

beforeEach(() => {
  useAuthStore.setState({ token: 'tok', user: { id: 1, username: 'larry', role: 'player' } });
  useUiStore.setState({
    nicknameModalOpen: true,
    nicknameModalAfterAuth: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NicknameModal', () => {
  test('打开时输入框获得焦点', async () => {
    render(<NicknameModal />);
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText('nickname'));
    });
  });

  test('提交合法 nickname → setNickname + close + afterAuth', async () => {
    const setNicknameSpy = vi.fn(async () => {
      // 模拟 server 写入成功
      useAuthStore.setState({
        user: { id: 1, username: 'larry', role: 'player', nickname: '玩家001' },
      });
    });
    useAuthStore.setState({ ...useAuthStore.getState(), setNickname: setNicknameSpy });
    const cb = vi.fn();
    useUiStore.setState({ nicknameModalOpen: true, nicknameModalAfterAuth: cb });

    render(<NicknameModal />);
    fireEvent.change(screen.getByLabelText('nickname'), { target: { value: '玩家001' } });
    fireEvent.submit(screen.getByRole('form', { name: 'nickname-form' }));

    await waitFor(() => {
      expect(setNicknameSpy).toHaveBeenCalledWith('玩家001');
      expect(useUiStore.getState().nicknameModalOpen).toBe(false);
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  test('太短（3 字符）→ 不调 setNickname，错误显示', async () => {
    const setNicknameSpy = vi.fn();
    useAuthStore.setState({ ...useAuthStore.getState(), setNickname: setNicknameSpy });
    render(<NicknameModal />);
    fireEvent.change(screen.getByLabelText('nickname'), { target: { value: '玩家' } });
    fireEvent.submit(screen.getByRole('form', { name: 'nickname-form' }));
    await waitFor(() => {
      expect(setNicknameSpy).not.toHaveBeenCalled();
      expect(screen.getByText(/4-8/)).toBeTruthy();
    });
  });

  test('Esc 按键 → modal 不关', () => {
    render(<NicknameModal />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(useUiStore.getState().nicknameModalOpen).toBe(true);
  });

  test('点遮罩 → modal 不关', () => {
    render(<NicknameModal />);
    const overlay = screen.getByRole('dialog');
    fireEvent.mouseDown(overlay);
    expect(useUiStore.getState().nicknameModalOpen).toBe(true);
  });

  test('DOM 中无 close 按钮', () => {
    render(<NicknameModal />);
    expect(screen.queryByLabelText('close')).toBeNull();
  });

  test('DOM 中无任何 type=button 控件（关闭/取消按钮一律禁止）', () => {
    render(<NicknameModal />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.every((b) => b.getAttribute('type') === 'submit')).toBe(true);
  });
});
