/**
 * 保护细胞命名池：按 visualTheme 分组，map-gen 按主题随机抽取。
 * 命名与生物学对应（Ch.1 皮肤/Ch.2 呼吸道/Ch.3 肠道/Ch.4 血管/Ch.5 淋巴/Ch.6 中枢）。
 */

export interface CellPoolEntry {
  name: string;
  description?: string;
}

export type VisualTheme = 'skin' | 'respiratory' | 'gut' | 'blood' | 'lymph' | 'cns' | 'generic';

const POOLS: Record<VisualTheme, readonly CellPoolEntry[]> = {
  skin: [
    { name: '角质形成细胞', description: '皮肤表层屏障' },
    { name: '黑色素细胞', description: '真皮层关键细胞' },
    { name: '朗格汉斯细胞', description: '表皮抗原哨兵' },
    { name: '毛囊干细胞', description: '再生中心' },
  ],
  respiratory: [
    { name: '肺泡', description: '气体交换核心' },
    { name: '纤毛上皮', description: '黏液输送' },
    { name: '杯状细胞', description: '分泌保护性黏液' },
    { name: '支气管腺', description: '气道湿润' },
  ],
  gut: [
    { name: '绒毛上皮', description: '营养吸收前线' },
    { name: '潘氏细胞', description: '分泌抗菌肽' },
    { name: '肠隐窝干细胞', description: '上皮再生' },
    { name: '杯状细胞', description: '肠道黏液层' },
  ],
  blood: [
    { name: '血管内皮', description: '血管屏障' },
    { name: '心肌细胞', description: '循环泵' },
    { name: '红骨髓巢', description: '造血中心' },
  ],
  lymph: [
    { name: '淋巴滤泡', description: 'B 细胞聚集区' },
    { name: '胸腺上皮', description: 'T 细胞成熟场' },
    { name: '脾脏白髓', description: '血液过滤站' },
  ],
  cns: [
    { name: '神经元', description: '信号核心' },
    { name: '胶质细胞', description: '神经支持' },
    { name: '血脑屏障', description: '中枢门户' },
  ],
  generic: [
    { name: '关键细胞', description: '必须保护' },
    { name: '核心组织', description: '必须保护' },
  ],
};

export function getCellPool(theme: VisualTheme): readonly CellPoolEntry[] {
  return POOLS[theme] ?? POOLS.generic;
}
