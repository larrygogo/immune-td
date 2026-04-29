import { type Page, expect, test } from '@playwright/test';

/**
 * 战斗内核 白盒 e2e：放塔 / 升级 / 拆除 / 速度 / 暂停 / 胜负。
 *
 * 所有交互通过 window.__testHelpers 调 engine action。断言直接读 __engine.getState()。
 * 不等动画、不点 canvas — 全程 <30s。
 */

interface Helpers {
  resetProgress: () => void;
  unlockAll: () => void;
  enterLevel: (n: number) => void;
  setMode: (mode: 'normal' | 'elite') => void;
  skipBriefing: () => void;
  placeTower: (t: string, c: number, r: number) => { ok: boolean; error?: string };
  upgradeTower: (id: string) => { ok: boolean; error?: string };
  sellTower: (id: string) => { ok: boolean; error?: string };
  setTargetingPriority: (
    id: string,
    priority: 'first' | 'last' | 'strong' | 'close',
  ) => { ok: boolean; error?: string };
  isWavePreviewVisible: () => boolean;
  startWave: () => void;
  setSpeed: (s: 1 | 2 | 3) => void;
  togglePause: () => void;
  forceWin: (stars?: 1 | 2 | 3) => unknown;
  forceLose: () => unknown;
  getEngineState: () => EngineState | null;
  getMetaState: () => {
    stars: Record<number, number>;
    eliteStars: Record<number, number>;
    unlockedLevels: number[];
    researchPoints: number;
  };
}

interface EngineState {
  phase: 'build' | 'wave' | 'complete' | 'failed';
  hp: number;
  atp: number;
  paused: boolean;
  speedMultiplier: 1 | 2 | 3;
  waveIndex: number;
  totalWaves: number;
  towers: {
    id: string;
    type: string;
    col: number;
    row: number;
    level: number;
    targetingPriority: 'first' | 'last' | 'strong' | 'close';
  }[];
  spawner: { active: boolean };
  stageResult: { outcome: 'won' | 'lost'; stars: 0 | 1 | 2 | 3 } | null;
}

async function bootIntoLevel(page: Page, levelId: number) {
  await page.goto('/');
  await page.waitForFunction(
    () => !!(window as unknown as { __testHelpers?: unknown }).__testHelpers,
    null,
    {
      timeout: 10_000,
    },
  );
  await page.evaluate((lid: number) => {
    const helpers = (window as unknown as { __testHelpers: Helpers }).__testHelpers;
    helpers.resetProgress();
    helpers.unlockAll();
    helpers.enterLevel(lid);
  }, levelId);
  await page.waitForFunction(() => !!(window as unknown as { __engine?: unknown }).__engine, null, {
    timeout: 5_000,
  });
  await page.evaluate(() => {
    (window as unknown as { __testHelpers: Helpers }).__testHelpers.skipBriefing();
  });
}

async function getState(page: Page): Promise<EngineState> {
  const s = await page.evaluate(() =>
    (window as unknown as { __testHelpers: Helpers }).__testHelpers.getEngineState(),
  );
  if (!s) throw new Error('__engine.getState() 返回 null');
  return s;
}

test.describe('Combat - 战斗内核白盒', () => {
  test('放塔扣 30 ATP 且 towers 增加 1', async ({ page }) => {
    await bootIntoLevel(page, 1);
    const before = await getState(page);
    const r = await page.evaluate(() =>
      (window as unknown as { __testHelpers: Helpers }).__testHelpers.placeTower(
        'macrophage',
        1,
        1,
      ),
    );
    expect(r.ok).toBe(true);
    const after = await getState(page);
    expect(after.atp).toBe(before.atp - 30);
    expect(after.towers.length).toBe(before.towers.length + 1);
  });

  test('路径上放塔被拒绝：entry 格 (0,4) ATP/towers 不变', async ({ page }) => {
    await bootIntoLevel(page, 1);
    const before = await getState(page);
    const r = await page.evaluate(() =>
      (window as unknown as { __testHelpers: Helpers }).__testHelpers.placeTower(
        'macrophage',
        0,
        4,
      ),
    );
    expect(r.ok).toBe(false);
    const after = await getState(page);
    expect(after.atp).toBe(before.atp);
    expect(after.towers.length).toBe(before.towers.length);
  });

  test('升级塔：level 升至 2 且 ATP 减少', async ({ page }) => {
    await bootIntoLevel(page, 1);
    const put = await page.evaluate(() =>
      (window as unknown as { __testHelpers: Helpers }).__testHelpers.placeTower(
        'macrophage',
        1,
        1,
      ),
    );
    expect(put.ok).toBe(true);
    const mid = await getState(page);
    const tid = mid.towers[0]?.id;
    if (!tid) throw new Error('放塔后未拿到 tower id');
    const r = await page.evaluate(
      (id: string) =>
        (window as unknown as { __testHelpers: Helpers }).__testHelpers.upgradeTower(id),
      tid,
    );
    expect(r.ok).toBe(true);
    const after = await getState(page);
    expect(after.atp).toBeLessThan(mid.atp);
    expect(after.towers[0]?.level).toBe(2);
  });

  test('下波预览：build 阶段可见 / wave 阶段隐藏', async ({ page }) => {
    await bootIntoLevel(page, 1);
    // build 阶段：preview 应可见
    const buildVisible = await page.evaluate(() =>
      (window as unknown as { __testHelpers: Helpers }).__testHelpers.isWavePreviewVisible(),
    );
    expect(buildVisible).toBe(true);

    // 启动波次进入 wave 阶段
    await page.evaluate(() =>
      (window as unknown as { __testHelpers: Helpers }).__testHelpers.startWave(),
    );
    // 等 1 帧让 syncAll 触发
    await page.waitForFunction(() => {
      const helpers = (window as unknown as { __testHelpers: Helpers }).__testHelpers;
      return helpers.getEngineState()?.phase === 'wave';
    });
    const waveVisible = await page.evaluate(() =>
      (window as unknown as { __testHelpers: Helpers }).__testHelpers.isWavePreviewVisible(),
    );
    expect(waveVisible).toBe(false);
  });

  test("setTargetingPriority：粒细胞默认 'first' / 切 'last' 后 state 持久化", async ({ page }) => {
    await bootIntoLevel(page, 2); // 关 2 已解锁粒细胞
    await page.evaluate(() =>
      (window as unknown as { __testHelpers: Helpers }).__testHelpers.placeTower(
        'neutrophil',
        1,
        1,
      ),
    );
    const mid = await getState(page);
    const tid = mid.towers[0]?.id;
    if (!tid) throw new Error('放粒细胞后未拿到 tower id');
    expect(mid.towers[0]?.targetingPriority).toBe('first');

    const r = await page.evaluate(
      (id: string) =>
        (window as unknown as { __testHelpers: Helpers }).__testHelpers.setTargetingPriority(
          id,
          'last',
        ),
      tid,
    );
    expect(r.ok).toBe(true);
    const after = await getState(page);
    expect(after.towers[0]?.targetingPriority).toBe('last');
  });

  test('Boss 关首通 +1 RP（5 的倍数关，叠加首通 +1 = 共 +2）', async ({ page }) => {
    await bootIntoLevel(page, 5); // boss 关
    const before = await page.evaluate(
      () =>
        (window as unknown as { __testHelpers: Helpers }).__testHelpers.getMetaState()
          .researchPoints,
    );
    await page.evaluate(() =>
      (window as unknown as { __testHelpers: Helpers }).__testHelpers.forceWin(2),
    );
    const after = await page.evaluate(
      () =>
        (window as unknown as { __testHelpers: Helpers }).__testHelpers.getMetaState()
          .researchPoints,
    );
    expect(after - before).toBe(2); // 首通 +1 + Boss +1（非 3 星不加 +1）
  });

  test('普通关首通 +1 RP（非 5 的倍数）', async ({ page }) => {
    await bootIntoLevel(page, 1);
    const before = await page.evaluate(
      () =>
        (window as unknown as { __testHelpers: Helpers }).__testHelpers.getMetaState()
          .researchPoints,
    );
    await page.evaluate(() =>
      (window as unknown as { __testHelpers: Helpers }).__testHelpers.forceWin(2),
    );
    const after = await page.evaluate(
      () =>
        (window as unknown as { __testHelpers: Helpers }).__testHelpers.getMetaState()
          .researchPoints,
    );
    expect(after - before).toBe(1); // 仅首通 +1
  });

  test('拆塔：Lv1 返还 floor(30×0.5)=15 ATP 且塔移除', async ({ page }) => {
    await bootIntoLevel(page, 1);
    await page.evaluate(() =>
      (window as unknown as { __testHelpers: Helpers }).__testHelpers.placeTower(
        'macrophage',
        1,
        1,
      ),
    );
    const mid = await getState(page);
    const tid = mid.towers[0]?.id;
    if (!tid) throw new Error('放塔后未拿到 tower id');
    const r = await page.evaluate(
      (id: string) => (window as unknown as { __testHelpers: Helpers }).__testHelpers.sellTower(id),
      tid,
    );
    expect(r.ok).toBe(true);
    const after = await getState(page);
    expect(after.atp).toBe(mid.atp + 15);
    expect(after.towers.length).toBe(0);
  });

  test('setSpeed(3) 写入 speedMultiplier', async ({ page }) => {
    await bootIntoLevel(page, 1);
    await page.evaluate(() =>
      (window as unknown as { __testHelpers: Helpers }).__testHelpers.setSpeed(3),
    );
    const s = await getState(page);
    expect(s.speedMultiplier).toBe(3);
  });

  test('启动波次：phase build → wave 且 spawner active', async ({ page }) => {
    await bootIntoLevel(page, 1);
    await page.evaluate(() =>
      (window as unknown as { __testHelpers: Helpers }).__testHelpers.startWave(),
    );
    const s = await getState(page);
    expect(s.phase).toBe('wave');
    expect(s.spawner.active).toBe(true);
  });

  test('forceLose：phase=failed + stageResult.outcome=lost', async ({ page }) => {
    await bootIntoLevel(page, 1);
    await page.evaluate(() =>
      (window as unknown as { __testHelpers: Helpers }).__testHelpers.forceLose(),
    );
    const s = await getState(page);
    expect(s.phase).toBe('failed');
    expect(s.stageResult).not.toBeNull();
    expect(s.stageResult?.outcome).toBe('lost');
  });

  test('forceWin(3)：phase=complete + stars=3 + metaStore.stars[1]=3', async ({ page }) => {
    await bootIntoLevel(page, 1);
    await page.evaluate(() =>
      (window as unknown as { __testHelpers: Helpers }).__testHelpers.forceWin(3),
    );
    const s = await getState(page);
    expect(s.phase).toBe('complete');
    expect(s.stageResult?.outcome).toBe('won');
    expect(s.stageResult?.stars).toBe(3);
    const meta = await page.evaluate(() =>
      (window as unknown as { __testHelpers: Helpers }).__testHelpers.getMetaState(),
    );
    expect(meta.stars[1]).toBe(3);
  });

  test('togglePause：paused true ↔ false', async ({ page }) => {
    await bootIntoLevel(page, 1);
    await page.evaluate(() =>
      (window as unknown as { __testHelpers: Helpers }).__testHelpers.togglePause(),
    );
    expect((await getState(page)).paused).toBe(true);
    await page.evaluate(() =>
      (window as unknown as { __testHelpers: Helpers }).__testHelpers.togglePause(),
    );
    expect((await getState(page)).paused).toBe(false);
  });

  test('ATP 不足放塔被拒：放 3 座后（剩 10）第 4 座失败', async ({ page }) => {
    await bootIntoLevel(page, 1);
    // 初始 ATP 100，三座各 30 → 剩 10
    for (const [c, r] of [
      [1, 1],
      [2, 2],
      [3, 3],
    ] as const) {
      const ok = await page.evaluate(
        ([col, row]: [number, number]) =>
          (window as unknown as { __testHelpers: Helpers }).__testHelpers.placeTower(
            'macrophage',
            col,
            row,
          ),
        [c, r] as [number, number],
      );
      expect(ok.ok).toBe(true);
    }
    const mid = await getState(page);
    expect(mid.atp).toBe(10);
    const r = await page.evaluate(() =>
      (window as unknown as { __testHelpers: Helpers }).__testHelpers.placeTower(
        'macrophage',
        4,
        4,
      ),
    );
    expect(r.ok).toBe(false);
    expect(r.error).toBe('ERROR_NOT_ENOUGH_ATP');
  });

  test('精英模式：forceWin(3) 写 eliteStars[2]=3 + RP 增量 3，重玩不再发', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => !!(window as unknown as { __testHelpers?: unknown }).__testHelpers,
      null,
      { timeout: 10_000 },
    );
    await page.evaluate(() => {
      const h = (window as unknown as { __testHelpers: Helpers }).__testHelpers;
      h.resetProgress();
      h.unlockAll();
      h.setMode('elite');
      h.enterLevel(2);
    });
    await page.waitForFunction(
      () => !!(window as unknown as { __engine?: unknown }).__engine,
      null,
      { timeout: 5_000 },
    );
    await page.evaluate(() => {
      (window as unknown as { __testHelpers: Helpers }).__testHelpers.skipBriefing();
    });

    const before = await page.evaluate(
      () =>
        (window as unknown as { __testHelpers: Helpers }).__testHelpers.getMetaState()
          .researchPoints,
    );
    await page.evaluate(() =>
      (window as unknown as { __testHelpers: Helpers }).__testHelpers.forceWin(3),
    );
    const after = await page.evaluate(() =>
      (window as unknown as { __testHelpers: Helpers }).__testHelpers.getMetaState(),
    );
    expect(after.eliteStars[2]).toBe(3);
    expect(after.researchPoints - before).toBe(3); // elite 3★ → +3 RP
    // 普通 stars 不被精英覆盖
    expect(after.stars[2]).toBeUndefined();

    // 重玩同关 forceWin(2)：eliteStars[2] 仍 3（max 语义），RP 不增
    await page.evaluate(() => {
      const h = (window as unknown as { __testHelpers: Helpers }).__testHelpers;
      h.setMode('elite');
      h.enterLevel(2);
    });
    await page.waitForFunction(
      () => !!(window as unknown as { __engine?: unknown }).__engine,
      null,
      { timeout: 5_000 },
    );
    await page.evaluate(() => {
      (window as unknown as { __testHelpers: Helpers }).__testHelpers.skipBriefing();
    });
    const beforeReplay = after.researchPoints;
    await page.evaluate(() =>
      (window as unknown as { __testHelpers: Helpers }).__testHelpers.forceWin(2),
    );
    const final = await page.evaluate(() =>
      (window as unknown as { __testHelpers: Helpers }).__testHelpers.getMetaState(),
    );
    expect(final.eliteStars[2]).toBe(3);
    expect(final.researchPoints).toBe(beforeReplay);
  });
});
