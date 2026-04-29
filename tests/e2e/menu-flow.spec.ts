import { type Page, expect, test } from '@playwright/test';

/**
 * 菜单 / 关卡选择 / 解锁链 白盒 e2e。
 *
 * 不点 Phaser canvas（坐标脆弱）；全部通过 window.__testHelpers 操作 + store 读状态。
 * Smoke test 已覆盖首屏渲染，这里专注流程正确性。
 */

async function gotoAndWaitReady(page: Page) {
  await page.goto('/');
  await page.waitForFunction(
    () => !!(window as unknown as { __testHelpers?: unknown }).__testHelpers,
    null,
    { timeout: 10_000 },
  );
  // 清掉可能残留的 localStorage / 重置 meta 到默认
  await page.evaluate(() => {
    const h = (window as unknown as { __testHelpers: { resetProgress: () => void } }).__testHelpers;
    h.resetProgress();
  });
}

test.describe('Menu flow - 白盒导航/解锁链', () => {
  test('unlockAll 后进入关卡 1：__engine 挂载且 levelId=1', async ({ page }) => {
    await gotoAndWaitReady(page);
    await page.evaluate(() => {
      const h = (
        window as unknown as {
          __testHelpers: { unlockAll: () => void; enterLevel: (n: number) => void };
        }
      ).__testHelpers;
      h.unlockAll();
      h.enterLevel(1);
    });
    await page.waitForFunction(
      () => !!(window as unknown as { __engine?: unknown }).__engine,
      null,
      { timeout: 5_000 },
    );
    const levelId = await page.evaluate(() => {
      const s = (
        window as unknown as {
          __testHelpers: { getEngineState: () => { levelId: number } | null };
        }
      ).__testHelpers.getEngineState();
      return s?.levelId;
    });
    expect(levelId).toBe(1);
  });

  test('resetProgress：关 0 / 关 1 解锁，关 2+ 锁', async ({ page }) => {
    await gotoAndWaitReady(page);
    const meta = await page.evaluate(() => {
      const s = (
        window as unknown as {
          __testHelpers: {
            getMetaState: () => { unlockedLevels: number[]; unlockedTowers: string[] };
          };
        }
      ).__testHelpers.getMetaState();
      return { levels: s.unlockedLevels, towers: s.unlockedTowers };
    });
    expect(meta.levels).toEqual([0, 1]);
    expect(meta.levels).not.toContain(2);
    expect(meta.towers).toEqual(['macrophage']);
  });

  test('通关关 1（forceWin）：解锁关 2 + neutrophil', async ({ page }) => {
    await gotoAndWaitReady(page);
    await page.evaluate(() => {
      const h = (
        window as unknown as {
          __testHelpers: {
            unlockAll: () => void;
            resetProgress: () => void;
            enterLevel: (n: number) => void;
            skipBriefing: () => void;
            forceWin: (stars?: 1 | 2 | 3) => unknown;
          };
        }
      ).__testHelpers;
      h.resetProgress();
      h.enterLevel(1);
    });
    await page.waitForFunction(
      () => !!(window as unknown as { __engine?: unknown }).__engine,
      null,
      { timeout: 5_000 },
    );
    await page.evaluate(() => {
      const h = (
        window as unknown as {
          __testHelpers: { skipBriefing: () => void; forceWin: (stars?: 1 | 2 | 3) => unknown };
        }
      ).__testHelpers;
      h.skipBriefing();
      h.forceWin(3);
    });
    const meta = await page.evaluate(() => {
      const s = (
        window as unknown as {
          __testHelpers: {
            getMetaState: () => {
              unlockedLevels: number[];
              unlockedTowers: string[];
              stars: Record<number, number>;
            };
          };
        }
      ).__testHelpers.getMetaState();
      return { levels: s.unlockedLevels, towers: s.unlockedTowers, stars: s.stars };
    });
    expect(meta.levels).toContain(2);
    expect(meta.towers).toContain('neutrophil');
    expect(meta.stars[1]).toBe(3);
  });

  test('goToScene：MainMenuScene / LevelSelectScene / EncyclopediaScene 可切换', async ({
    page,
  }) => {
    await gotoAndWaitReady(page);
    for (const key of ['MainMenuScene', 'LevelSelectScene', 'EncyclopediaScene']) {
      await page.evaluate((k: string) => {
        (
          window as unknown as { __testHelpers: { goToScene: (k: string) => void } }
        ).__testHelpers.goToScene(k);
      }, key);
      await page.waitForFunction(
        (k: string) =>
          (
            window as unknown as { __testHelpers: { isSceneActive: (k: string) => boolean } }
          ).__testHelpers.isSceneActive(k),
        key,
        { timeout: 3_000 },
      );
    }
  });

  test('进入 GameScene 后回 MainMenuScene：__engine 释放', async ({ page }) => {
    await gotoAndWaitReady(page);
    await page.evaluate(() => {
      const h = (
        window as unknown as {
          __testHelpers: { unlockAll: () => void; enterLevel: (n: number) => void };
        }
      ).__testHelpers;
      h.unlockAll();
      h.enterLevel(1);
    });
    await page.waitForFunction(
      () => !!(window as unknown as { __engine?: unknown }).__engine,
      null,
      { timeout: 5_000 },
    );
    await page.evaluate(() => {
      (
        window as unknown as { __testHelpers: { goToScene: (k: string) => void } }
      ).__testHelpers.goToScene('MainMenuScene');
    });
    await page.waitForFunction(
      () => !(window as unknown as { __engine?: unknown }).__engine,
      null,
      { timeout: 5_000 },
    );
    const active = await page.evaluate(() =>
      (
        window as unknown as {
          __testHelpers: { activeSceneKeys: () => string[] };
        }
      ).__testHelpers.activeSceneKeys(),
    );
    expect(active).toContain('MainMenuScene');
    expect(active).not.toContain('GameScene');
  });
});

test.describe('NicknameModal · H5 强制设置（mock /api）', () => {
  /**
   * 注册新账号 → server 返回 user.nickname=null → 应弹 NicknameModal。
   * 用 page.route 拦截 /api/auth/register 与 /api/auth/nickname，避免依赖 server 在线。
   */

  /** 拦截 /api/* 让测试不依赖 server 在线，模拟新用户注册返回 nickname=null。 */
  async function setupNoNicknameMock(page: Page) {
    // /api/auth/register → 200 { token, user: { nickname: null, ... } }
    await page.route('**/api/auth/register', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as {
        username?: string;
        password?: string;
      };
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'e2e-mock-token',
          user: {
            id: 1,
            username: body.username ?? 'e2eu',
            role: 'player',
            nickname: null,
            nickname_set_at: null,
            wechat_nickname: null,
            wechat_avatar: null,
          },
        }),
      });
    });

    // /api/auth/nickname → 200 { user: { nickname: <提交值>, ... } }
    await page.route('**/api/auth/nickname', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as { nickname?: string };
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: {
            id: 1,
            username: 'e2eu',
            role: 'player',
            nickname: body.nickname ?? '',
            nickname_set_at: '2026-04-29 10:00:00',
            wechat_nickname: null,
            wechat_avatar: null,
          },
        }),
      });
    });

    // /api/progress（progressSync 拉取/上传）—— 让其成功返回空 progress 即可
    await page.route('**/api/progress', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress: null, payloadVersion: null }),
      });
    });
  }

  test('新用户注册 → NicknameModal 必现 → 填合法 nickname → modal 关闭', async ({ page }) => {
    await gotoAndWaitReady(page);
    await setupNoNicknameMock(page);

    // 直接通过 __testHelpers.register 触发完整 H5 登录链：
    // register → user.nickname=null → dispatchAfterAuth → openNicknameModal
    await page.evaluate(async () => {
      const h = (
        window as unknown as {
          __testHelpers: { register: (u: string, p: string) => Promise<void> };
        }
      ).__testHelpers;
      await h.register(`e2eu_${Date.now().toString(36)}`, 'password123');
    });

    // 等 NicknameModal 出现（aria-label="nickname-modal"）
    await expect(page.getByLabel('nickname-modal')).toBeVisible({ timeout: 5_000 });

    // 填合法 nickname → 提交（按钮文案是「确 认」，含全角空格）
    // 用 textbox role 避免和 modal/form 容器的 aria-label='nickname-*' 冲突
    await page.getByRole('textbox', { name: 'nickname' }).fill('玩家001');
    await page.getByRole('button', { name: '确 认' }).click();

    // NicknameModal 关闭
    await expect(page.getByLabel('nickname-modal')).not.toBeVisible({ timeout: 5_000 });
  });

  test('NicknameModal 不可手动关闭（Esc / 点遮罩 / 找 ×）', async ({ page }) => {
    await gotoAndWaitReady(page);
    await setupNoNicknameMock(page);

    await page.evaluate(async () => {
      const h = (
        window as unknown as {
          __testHelpers: { register: (u: string, p: string) => Promise<void> };
        }
      ).__testHelpers;
      await h.register(`e2eu_${Date.now().toString(36)}`, 'password123');
    });

    await expect(page.getByLabel('nickname-modal')).toBeVisible({ timeout: 5_000 });

    // 1. Esc 不关
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('nickname-modal')).toBeVisible();

    // 2. 点遮罩不关（modal overlay 容器 corner，远离 form card）
    await page.getByLabel('nickname-modal').click({ position: { x: 5, y: 5 }, force: true });
    await expect(page.getByLabel('nickname-modal')).toBeVisible();

    // 3. 找 close × 按钮 —— 不应该有
    expect(await page.getByLabel('close').count()).toBe(0);
  });
});
