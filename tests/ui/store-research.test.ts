import { beforeEach, describe, expect, it } from 'vitest';
import {
  RESEARCH_NODES,
  defaultUnlockedResearch,
  totalResearchCost,
} from '@engine/game/registry/research-registry';
import { useMetaStore } from '@ui/store';

/** 重置 metaStore 到一个干净起点（每个用例独立） */
function resetStore(researchPoints = 0): void {
  useMetaStore.setState({
    unlockedLevels: [0, 1],
    unlockedTowers: ['macrophage'],
    stars: {},
    researchPoints,
    unlockedResearch: defaultUnlockedResearch(),
    researchResetCount: 0,
    loadout: [],
    seenMechanics: [],
    tutorialStep: 0,
    tutorialCompleted: false,
    freshlyMigrated: false,
    ownerUserId: null,
  });
}

describe('metaStore.buyResearch', () => {
  beforeEach(() => resetStore(10));

  it('成功购买 lv2-unlock：扣 RP + 加 id（无前置直接购）', () => {
    const ok = useMetaStore.getState().buyResearch('mac-lv2');
    expect(ok).toBe(true);
    const s = useMetaStore.getState();
    expect(s.researchPoints).toBe(8); // mac-lv2 cost=2
    expect(s.unlockedResearch).toContain('mac-lv2');
  });

  it('成功购买 ability：先购 lv2 后才能购 ability', () => {
    const m = useMetaStore.getState();
    m.buyResearch('mac-lv2'); // -2 → 8
    const ok = m.buyResearch('mac-aoe');
    expect(ok).toBe(true);
    expect(useMetaStore.getState().researchPoints).toBe(6); // 8 - mac-aoe cost=2
    expect(useMetaStore.getState().unlockedResearch).toContain('mac-aoe');
  });

  it('RP 不够：拒绝（返回 false 不改 state）', () => {
    resetStore(1); // 不够 mac-lv2（cost=2）
    const ok = useMetaStore.getState().buyResearch('mac-lv2');
    expect(ok).toBe(false);
    expect(useMetaStore.getState().researchPoints).toBe(1);
    expect(useMetaStore.getState().unlockedResearch).not.toContain('mac-lv2');
  });

  it('前置未满足：拒绝（mac-aoe 需 mac-lv2 已解；mac-m1 需 mac-lv3 已解）', () => {
    expect(useMetaStore.getState().buyResearch('mac-aoe')).toBe(false);
    expect(useMetaStore.getState().buyResearch('mac-m1')).toBe(false);
    expect(useMetaStore.getState().unlockedResearch).toEqual([]);
  });

  it('已购：拒绝（不重复扣 RP）', () => {
    const m = useMetaStore.getState();
    expect(m.buyResearch('mac-lv2')).toBe(true);
    const rpAfterFirst = useMetaStore.getState().researchPoints;
    expect(m.buyResearch('mac-lv2')).toBe(false);
    expect(useMetaStore.getState().researchPoints).toBe(rpAfterFirst);
  });

  it('lv3-unlock OR 语义：mac-lv2 + mac-aoe 已购即可购 mac-lv3', () => {
    const m = useMetaStore.getState();
    m.buyResearch('mac-lv2'); // -2
    m.buyResearch('mac-aoe'); // -2
    const ok = m.buyResearch('mac-lv3');
    expect(ok).toBe(true);
    expect(useMetaStore.getState().unlockedResearch).toContain('mac-lv3');
  });
});

describe('metaStore.resetResearch', () => {
  beforeEach(() => resetStore(20));

  it('首次重置免费：退还所有已购节点 cost + 加 researchResetCount', () => {
    const m = useMetaStore.getState();
    m.buyResearch('mac-lv2'); // -2 → 18
    m.buyResearch('mac-aoe'); // -2 → 16
    m.buyResearch('mac-hp'); // -2 → 14
    expect(useMetaStore.getState().researchPoints).toBe(14);

    const result = useMetaStore.getState().resetResearch();
    expect(result.ok).toBe(true);
    expect(result.refund).toBe(6);
    expect(result.cost).toBe(0);
    const s = useMetaStore.getState();
    expect(s.researchPoints).toBe(20); // 14 + refund(2+2+2) - cost(0)
    expect(s.unlockedResearch).toEqual(defaultUnlockedResearch());
    expect(s.researchResetCount).toBe(1);
  });

  it('第二次重置扣 1 RP', () => {
    const m = useMetaStore.getState();
    m.resetResearch(); // 1st free
    expect(useMetaStore.getState().researchResetCount).toBe(1);
    expect(useMetaStore.getState().researchPoints).toBe(20);

    m.buyResearch('mac-lv2'); // -2 → 18
    const result = m.resetResearch();
    expect(result.ok).toBe(true);
    expect(result.refund).toBe(2);
    expect(result.cost).toBe(1);
    expect(useMetaStore.getState().researchPoints).toBe(19); // 18 + refund(2) - cost(1)
    expect(useMetaStore.getState().researchResetCount).toBe(2);
  });

  it('RP=0 + 无可退 + 第二次重置 → 拒绝', () => {
    resetStore(0);
    useMetaStore.setState({ researchResetCount: 1 });
    const result = useMetaStore.getState().resetResearch();
    expect(result.ok).toBe(false);
    expect(useMetaStore.getState().researchResetCount).toBe(1);
  });

  it('重置后 unlockedResearch 回到 default（空数组，统一规则下无默认解锁）', () => {
    useMetaStore.getState().buyResearch('mac-lv2');
    useMetaStore.getState().resetResearch();
    expect(useMetaStore.getState().unlockedResearch).toEqual([]);
  });
});

describe('完整 build → reset 经济正确性', () => {
  it('全购全树后 reset：RP 回到投入前总额', () => {
    resetStore(totalResearchCost()); // 51
    const m = useMetaStore.getState();
    // 按拓扑顺序购全树
    const order = [
      'mac-lv2',
      'neu-lv2',
      'nk-lv2',
      'den-lv2',
      'mit-lv2',
      'mac-aoe',
      'mac-hp',
      'mac-lv3',
      'mac-m1',
      'neu-rate',
      'neu-dmg',
      'neu-lv3',
      'neu-net',
      'nk-range',
      'nk-crit',
      'nk-lv3',
      'nk-adcc',
      'den-radius',
      'den-buff',
      'den-lv3',
      'den-th1',
      'mit-yield',
      'mit-hp',
      'mit-lv3',
      'mit-amp',
    ] as const;
    for (const id of order) {
      const ok = m.buyResearch(id);
      expect(ok, `购买 ${id} 失败`).toBe(true);
    }
    expect(useMetaStore.getState().researchPoints).toBe(0);
    expect(useMetaStore.getState().unlockedResearch).toHaveLength(RESEARCH_NODES.length);

    const result = m.resetResearch();
    expect(result.ok).toBe(true);
    // 加 mit 5 节点（13 RP）后总数 51 → 64
    expect(result.refund).toBe(64);
    expect(useMetaStore.getState().researchPoints).toBe(64);
    expect(useMetaStore.getState().unlockedResearch).toEqual([]);
  });
});
