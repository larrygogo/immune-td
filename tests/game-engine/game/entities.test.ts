import { describe, expect, it } from 'vitest';
import {
  PATHOGEN_DEFS,
  TOWER_DEFS,
  createPathogen,
  createSpawner,
  createTower,
} from '@engine/game/entities';

describe('entities', () => {
  describe('TOWER_DEFS', () => {
    it('macrophage 配置正确（v4 平衡：dmg=22, interval=1300）', () => {
      expect(TOWER_DEFS.macrophage.cost).toBe(30);
      expect(TOWER_DEFS.macrophage.range).toBe(1.5);
      expect(TOWER_DEFS.macrophage.damage).toBe(22);
      expect(TOWER_DEFS.macrophage.attackIntervalMs).toBe(1300);
    });
  });

  describe('PATHOGEN_DEFS', () => {
    it('rhinovirus 配置正确', () => {
      expect(PATHOGEN_DEFS.rhinovirus.maxHp).toBe(65);
      expect(PATHOGEN_DEFS.rhinovirus.speed).toBe(1.2);
      expect(PATHOGEN_DEFS.rhinovirus.coreDamage).toBe(1);
    });
  });

  describe('createTower', () => {
    it('生成正确初始状态', () => {
      const t = createTower('t1', 'macrophage', 2, 3);
      expect(t.id).toBe('t1');
      expect(t.type).toBe('macrophage');
      expect(t.col).toBe(2);
      expect(t.row).toBe(3);
      expect(t.cooldownMs).toBe(0);
    });
    it("targetingPriority 默认 'first'（与当前优先靠近出口的行为等价）", () => {
      const t = createTower('t1', 'neutrophil', 2, 3);
      expect(t.targetingPriority).toBe('first');
    });
    it('初始 hp 与 maxHp 等于 lv1 hp（macrophage v4=140）', () => {
      const t = createTower('t1', 'macrophage', 2, 3);
      expect(t.hp).toBe(140);
      expect(t.maxHp).toBe(140);
    });
    it('neutrophil 初始 hp=60，nkcell 初始 hp=80', () => {
      const n = createTower('t2', 'neutrophil', 0, 0);
      expect(n.hp).toBe(60);
      expect(n.maxHp).toBe(60);
      const k = createTower('t3', 'nkcell', 0, 0);
      expect(k.hp).toBe(80);
      expect(k.maxHp).toBe(80);
    });
  });

  describe('createPathogen', () => {
    it('生成正确初始状态', () => {
      const p = createPathogen('p1', 'rhinovirus');
      expect(p.id).toBe('p1');
      expect(p.type).toBe('rhinovirus');
      expect(p.hp).toBe(65);
      expect(p.pathIndex).toBe(0);
      expect(p.progress).toBe(0);
      expect(p.alive).toBe(true);
      expect(p.reachedExit).toBe(false);
    });
  });

  describe('createSpawner', () => {
    it('非空 queue 时 active 为 true', () => {
      const item = { type: 'rhinovirus' as const, modifiers: [] as const };
      const s = createSpawner([item, item], 1000);
      expect(s.queue).toHaveLength(2);
      expect(s.queue[0]?.type).toBe('rhinovirus');
      expect(s.spawnedCount).toBe(0);
      expect(s.timerMs).toBe(0);
      expect(s.active).toBe(true);
    });
    it('空 queue 时 active 为 false', () => {
      const s = createSpawner([], 1000);
      expect(s.active).toBe(false);
    });
  });
});
