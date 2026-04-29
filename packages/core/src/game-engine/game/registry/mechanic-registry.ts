import type { GameMechanic } from '../data/levels';

/** 关卡级机制元数据：BriefingScene 介绍卡片用 */
export interface MechanicMeta {
  id: GameMechanic;
  title: string;
  description: string; // 1-2 行通俗解释
  scientificNote: string; // 1 行科学注脚
  iconKey?: string; // 资源 key（无则用 fallback 形状）
  iconColor: number; // fallback 圆形颜色
}

/**
 * 关卡级玩法机制注册表：每个 GameMechanic 一条记录。
 * 新机制接入流程：在此加一条 + 在对应关卡 enabledMechanics 加 id 即可自动接入 BriefingScene。
 */
export const MECHANIC_REGISTRY: Record<GameMechanic, MechanicMeta> = {
  'tower-hp': {
    id: 'tower-hp',
    title: '细胞损伤',
    description: '病原体靠近免疫细胞时会持续侵蚀；HP 归零则细胞凋亡，返还 25% 投入。',
    scientificNote: '现实免疫细胞同样会在持续抗原刺激下凋亡。',
    iconColor: 0x44ff88,
  },
  'no-build-zone': {
    id: 'no-build-zone',
    title: '禁建区',
    description: '某些位置因组织异常无法驻扎细胞（红色斜线格）。',
    scientificNote: '皮脂斑、瘢痕、血管壁等阻碍免疫细胞驻扎。',
    iconColor: 0xff4466,
  },
  'multi-entry': {
    id: 'multi-entry',
    title: '多入口',
    description: '本关有多个病原入侵口，需要分散布防。',
    scientificNote: '皮肤多处擦伤 / 黏膜多入侵点。',
    iconColor: 0xffaa44,
  },
  'protected-cells': {
    id: 'protected-cells',
    title: '保护核心细胞',
    description: '地图上有特殊器官细胞，任一倒下即关卡失败。',
    scientificNote: '肺泡 / 神经元等关键细胞失守即器官失能。',
    iconColor: 0x66ddff,
  },
  'helper-tower': {
    id: 'helper-tower',
    title: '辅助细胞',
    description: '部分细胞不直接攻击，增益周围细胞。',
    scientificNote: '辅助 T 细胞、树突状细胞调控免疫反应。',
    iconColor: 0xffcc44,
  },
  'mobile-tower': {
    id: 'mobile-tower',
    title: '移动细胞',
    description: '部分细胞可以离开格子主动追击病原。',
    scientificNote: '巨噬细胞主动迁移到感染部位。',
    iconColor: 0x88ff88,
  },
  'carry-limit': {
    id: 'carry-limit',
    title: '携带上限',
    description: '只能从已解锁细胞中选 N 种带入战场，开战前选阵容。',
    scientificNote: '免疫系统反应受限于细胞类型动员能力。',
    iconColor: 0xcc88ff,
  },
  'complement-system': {
    id: 'complement-system',
    title: '补体系统',
    description: '抗体标记后病原受到的伤害 +50%。',
    scientificNote: '补体级联是抗体激活后的杀伤放大机制。',
    iconColor: 0xff66cc,
  },
  'immune-evasion': {
    id: 'immune-evasion',
    title: '免疫逃逸',
    description:
      '部分病原凭借特殊结构绕过细胞防御，常规细胞无法物理拦截，需要可打空的细胞主动追击。',
    scientificNote:
      '曲霉孢子的厚壁结构、疟原虫躲入红细胞、锥虫不断更换表面抗原——同一类逃逸能力的不同表现。',
    iconColor: 0x88ee66,
  },
};

export function getMechanicMeta(id: GameMechanic): MechanicMeta {
  return MECHANIC_REGISTRY[id];
}
