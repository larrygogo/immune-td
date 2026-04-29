import type { GameEventType } from '../events';

/**
 * 关 0 教学 spotlight 槽位标识。GameScene.computeSpotlight 把它映射到当前 viewport
 * 下的 (x, y, w, h) 矩形坐标。
 */
export type SpotlightSlot =
  | 'hud' // 顶部 HP/ATP/WAVE 区
  | 'tower-bar' // 底部塔栏
  | 'board' // 棋盘格子区域
  | 'play-area' // 棋盘 + 塔栏整个游戏交互区（用于拖拽放塔需同时可见）
  | 'wave-btn' // 「立即开始」按钮 / build banner
  | 'atp' // HUD 中 ATP 数字
  | 'speed-btn' // 右上速度切换按钮
  | 'pause-btn' // 右上暂停按钮
  | null;

/**
 * 推进触发条件：
 * - event：等指定 GameEvent 派发
 * - storeChange：等 zustand store 字段从初始值变化
 * - auto：固定毫秒后自动推进（overlay 自带 timer）
 * - manual：玩家点 overlay 的"下一步"按钮才推进（介绍类步骤用，避免被 timer 强行带过）
 */
export type TutorialAdvanceTrigger =
  | { type: 'event'; eventType: GameEventType }
  | { type: 'storeChange'; field: 'selectedTowerType' | 'selectedTowerId' | 'speedMultiplier' }
  | { type: 'auto'; ms: number }
  | { type: 'manual' };

export interface TutorialStepDef {
  id: number;
  title: string;
  body: string;
  spotlight: SpotlightSlot;
  advance: TutorialAdvanceTrigger;
  /** 卡片位置：'top' 强制顶部（避开详情面板）；'bottom' 强制底部；不设 = auto */
  cardPosition?: 'top' | 'center' | 'bottom' | 'auto';
}

export const TUTORIAL_STEPS: readonly TutorialStepDef[] = [
  {
    id: 0,
    title: 'STEP 1',
    body: '顶部状态：HP（剩余生命）· ATP（建造资源）· 波次进度',
    spotlight: 'hud',
    advance: { type: 'manual' },
    cardPosition: 'center', // 卡片放屏幕中央（棋盘区域）让玩家清晰看 HUD spotlight
  },
  {
    // fixed-path 介绍（A6 路径回退后新加）：教玩家"塔放在路径外"的核心规则
    id: 1,
    title: 'STEP 2',
    body: '亮线条是病原行进路径。塔只能放在路径外的格子，不能放在亮线上',
    spotlight: 'board',
    advance: { type: 'manual' },
  },
  {
    // 合并：原 STEP 2「选塔」+ STEP 3「放塔」。理由：拖拽是连贯一动作，
    // 拆两步会因 selectedTowerType 在 pointerup cleanup 时被清回 null 导致
    // STEP 2 提前推进 + STEP 3 卡住没东西可放
    id: 2,
    title: 'STEP 3',
    body: '按住底部塔图标，拖到棋盘上闪烁的格子放下（消耗 ATP）',
    spotlight: 'play-area',
    advance: { type: 'event', eventType: 'TOWER_PLACED' },
  },
  {
    id: 3,
    title: 'STEP 4',
    body: '点击发动波次开始战斗',
    spotlight: 'wave-btn',
    advance: { type: 'event', eventType: 'WAVE_STARTED' },
  },
  {
    id: 4,
    title: 'STEP 5',
    body: '击杀病原会奖励 ATP（注意 ATP 数字跳动）',
    spotlight: null,
    advance: { type: 'event', eventType: 'PATHOGEN_KILLED' },
  },
  {
    id: 5,
    title: 'STEP 6',
    body: '1. 点击已放置的细胞 → 2. 在右侧详情面板点「升级」让它变强',
    spotlight: 'board',
    advance: { type: 'event', eventType: 'TOWER_UPGRADED' },
    cardPosition: 'top',
  },
  {
    // 观察升级效果：spawn 几只让玩家看强化塔伤害/射程提升
    id: 6,
    title: 'STEP 7',
    body: '观察升级后的细胞：伤害更高、射程更大、HP 更厚',
    spotlight: null,
    advance: { type: 'manual' },
  },
  {
    id: 7,
    title: 'STEP 8',
    body: '右上速度按钮：按一下加速到 ×2，再按到 ×3，再按回 ×1',
    spotlight: 'speed-btn',
    advance: { type: 'storeChange', field: 'speedMultiplier' },
  },
  {
    id: 8,
    title: 'STEP 9',
    body: '点击塔后选「拆除」回收 ATP（细胞会消失）',
    spotlight: 'board',
    advance: { type: 'event', eventType: 'TOWER_SOLD' },
    cardPosition: 'top',
  },
  {
    id: 9,
    title: 'STEP 10',
    body: '教学完成！按右上「暂停」按钮可呼出菜单选「返回主菜单」',
    spotlight: 'pause-btn',
    advance: { type: 'manual' },
  },
];
