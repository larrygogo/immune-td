import { describe, expect, it } from 'vitest';
import {
  RESEARCH_NODES,
  type ResearchNode,
  canUnlockResearch,
  defaultUnlockedResearch,
  getResearchNode,
  getUpgradeResearch,
  isUpgradeUnlocked,
  totalResearchCost,
} from '@engine/game/registry/research-registry';

describe('research-registry', () => {
  describe('RESEARCH_NODES 数据完整性', () => {
    it('25 个节点（5 塔 × 5 节点）', () => {
      expect(RESEARCH_NODES).toHaveLength(25);
    });

    it('每塔 5 节点：1 lv2 + 2 ability(tier 2) + 1 lv3 + 1 ability(tier 4)', () => {
      const byTower = new Map<string, ResearchNode[]>();
      for (const n of RESEARCH_NODES) {
        const arr = byTower.get(n.towerType) ?? [];
        arr.push(n);
        byTower.set(n.towerType, arr);
      }
      for (const towerType of [
        'macrophage',
        'neutrophil',
        'nkcell',
        'dendritic',
        'mitochondria',
      ]) {
        const nodes = byTower.get(towerType);
        expect(nodes, `${towerType} 缺失节点`).toBeDefined();
        if (!nodes) continue;
        expect(nodes).toHaveLength(5);
        const tiers = nodes.map((n) => n.tier).sort();
        expect(tiers).toEqual([1, 2, 2, 3, 4]);
        expect(nodes.filter((n) => n.kind === 'lv2-unlock')).toHaveLength(1);
        expect(nodes.filter((n) => n.kind === 'lv3-unlock')).toHaveLength(1);
        expect(nodes.filter((n) => n.kind === 'ability')).toHaveLength(3);
      }
    });

    it('totalResearchCost === 64（5 塔，mit 加 13 RP）', () => {
      // 加 mit 5 节点（2+2+2+3+4=13）后：原 51 + 13 = 64
      expect(totalResearchCost()).toBe(64);
    });

    it('id 全局唯一', () => {
      const ids = RESEARCH_NODES.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('canUnlockResearch 前置规则', () => {
    it('lv2-unlock：无前置，总是 true', () => {
      expect(canUnlockResearch(getResearchNode('mac-lv2'), [])).toBe(true);
      expect(canUnlockResearch(getResearchNode('neu-lv2'), [])).toBe(true);
    });

    it('tier-2 ability：要求 lv2-unlock 已解（AND）', () => {
      expect(canUnlockResearch(getResearchNode('mac-aoe'), [])).toBe(false);
      expect(canUnlockResearch(getResearchNode('mac-aoe'), ['mac-lv2'])).toBe(true);
    });

    it('lv3-unlock：要求**任一** tier-2 ability（OR 语义）', () => {
      const lv3 = getResearchNode('mac-lv3');
      expect(canUnlockResearch(lv3, [])).toBe(false);
      expect(canUnlockResearch(lv3, ['mac-lv2'])).toBe(false); // 只有根没用
      expect(canUnlockResearch(lv3, ['mac-lv2', 'mac-aoe'])).toBe(true);
      expect(canUnlockResearch(lv3, ['mac-lv2', 'mac-hp'])).toBe(true);
      expect(canUnlockResearch(lv3, ['mac-lv2', 'mac-aoe', 'mac-hp'])).toBe(true);
    });

    it('tier-4 ability：要求 lv3-unlock 已解（AND）', () => {
      expect(canUnlockResearch(getResearchNode('mac-m1'), ['mac-lv2', 'mac-aoe'])).toBe(false);
      expect(canUnlockResearch(getResearchNode('mac-m1'), ['mac-lv2', 'mac-aoe', 'mac-lv3'])).toBe(
        true,
      );
    });
  });

  describe('defaultUnlockedResearch', () => {
    it('空数组（教学走 isTutorial 跳过 RP 检查，所有塔统一付费解锁）', () => {
      expect(defaultUnlockedResearch()).toEqual([]);
    });
  });

  describe('isUpgradeUnlocked 兼容签名（v3 ResearchScene + actions.upgradeTower）', () => {
    it('mac-lv2 已购：upgradeTower(macrophage, 2) 通过', () => {
      expect(isUpgradeUnlocked(['mac-lv2'], 'macrophage', 2)).toBe(true);
      expect(isUpgradeUnlocked(['mac-lv2'], 'macrophage', 3)).toBe(false);
    });

    it('每塔 Lv2/Lv3 各自 isUpgradeUnlocked 检查', () => {
      const all = RESEARCH_NODES.map((n) => n.id);
      for (const towerType of ['macrophage', 'neutrophil', 'nkcell', 'dendritic'] as const) {
        expect(isUpgradeUnlocked(all, towerType, 2)).toBe(true);
        expect(isUpgradeUnlocked(all, towerType, 3)).toBe(true);
      }
    });

    it('未购：返回 false', () => {
      expect(isUpgradeUnlocked([], 'neutrophil', 2)).toBe(false);
    });
  });

  describe('getUpgradeResearch 兼容签名', () => {
    it('macrophage Lv2 → mac-lv2 cost=2（统一规则，与其他塔一致）', () => {
      expect(getUpgradeResearch('macrophage', 2)).toEqual({ id: 'mac-lv2', cost: 2 });
    });

    it('nkcell Lv3 → nk-lv3 cost=3', () => {
      expect(getUpgradeResearch('nkcell', 3)).toEqual({ id: 'nk-lv3', cost: 3 });
    });
  });
});
