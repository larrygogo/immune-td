import { expect, test } from '@playwright/test';

/**
 * Smoke 测试：Phaser canvas 正常启动，无致命 console error。
 *
 * 这里刻意不点击任何 UI（Phaser canvas 坐标易碎），深入的交互验证在
 * menu-flow.spec.ts / combat.spec.ts 里通过 dev-only window.__testHelpers 白盒完成。
 */

test.describe('Smoke - 首屏不炸', () => {
  test('页面起得来：canvas 渲染 + 无 console error', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

    await page.goto('/');
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 10_000 });
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width ?? 0).toBeGreaterThan(100);
    expect(box?.height ?? 0).toBeGreaterThan(100);

    // 等 Phaser boot + splash 资源加载
    await page.waitForTimeout(5_000);

    // 过滤已知白噪：Phaser 在 noAudio 模式下可能打印 SoundManager 相关警告
    const hard = errors.filter((e) => !/SoundManager|autoplay/i.test(e));
    expect(hard, `控制台错误:\n${hard.join('\n')}`).toEqual([]);
  });

  test('Phaser game 实例 5s 后仍 alive', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(5_000);
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
    const alive = await page.evaluate(() => {
      const w = window as unknown as { __phaser?: { isRunning?: boolean } };
      return Boolean(w.__phaser?.isRunning);
    });
    expect(alive).toBe(true);
  });

  /**
   * MainMenu 视觉 baseline。Splash 有连续动画不宜做基线；MainMenu 相对静态。
   * 跨机器渲染差异由 maxDiffPixels + threshold 吸收。基线用
   * `bun run test:e2e -- --update-snapshots` 更新。
   */
  test('MainMenu 视觉 baseline', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => !!(window as unknown as { __testHelpers?: unknown }).__testHelpers,
      null,
      { timeout: 10_000 },
    );
    await page.evaluate(() => {
      (
        window as unknown as {
          __testHelpers: { goToScene: (k: string) => void };
        }
      ).__testHelpers.goToScene('MainMenuScene');
    });
    await page.waitForFunction(
      () =>
        (
          window as unknown as {
            __testHelpers: { isSceneActive: (k: string) => boolean };
          }
        ).__testHelpers.isSceneActive('MainMenuScene'),
      null,
      { timeout: 5_000 },
    );
    // 场景 fade + 背景粒子再给一点时间稳定
    await page.waitForTimeout(1_500);
    // Phaser 背景有持续粒子动画，用 maxDiffPixelRatio 而非固定像素数更鲁棒。
    // 5% 容差 = 可检出整体布局错位 / 主色调变化，又不被粒子抖动误判。
    await expect(page).toHaveScreenshot('main-menu.png', {
      maxDiffPixelRatio: 0.05,
      threshold: 0.3,
      fullPage: false,
    });
  });
});
