import type { Scene } from 'phaser';
import { LEVELS } from '../game/data/levels';
import { transitionToScene } from '../scene-fx';

/**
 * 关卡入口路由：按 LEVELS[id].isTutorial 决定走 TutorialScene 还是
 * 走 LevelBriefingScene → GameScene 标准流程。
 *
 * 入口：MainMenuScene 「继续游戏」/ LevelSelectScene 卡片点击 / LevelBriefingScene
 * 「开始」按钮等所有"进关卡"动作。教学关跳过 LevelBriefingScene。
 */
export function enterLevel(scene: Scene, levelId: number): void {
  if (LEVELS[levelId]?.isTutorial) {
    // 教学关：跳过 LevelBriefingScene，直接 TutorialScene
    transitionToScene(scene, 'TutorialScene');
    return;
  }
  transitionToScene(scene, 'LevelBriefingScene');
}
