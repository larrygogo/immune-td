import { useMetaStore } from '@ui/store';
import type { TowerType } from '../game/entities';
import { GameScene } from './GameScene';
import { TutorialController } from './game/tutorial-controller';

/**
 * 教学场景：继承 GameScene 复用 layer / tick / placement / select 等 80% 通用逻辑，
 * 通过 Phaser scene key 'TutorialScene' 独立注册让路由按 levelId 启不同场景。
 *
 * 教学差异通过 protected hook 覆盖：
 * - createTutorialController：启 controller（base 返 null）
 * - shouldTrackLevelEvents：返 false（教学不进 BI / 不录回放）
 * - getTowersForBar：强制 ['macrophage']（base 读 metaStore）
 * - configurePauseMenuForTutorial：setReplayMode(true) 隐藏「重玩本关」
 * - onTutorialFinished：跳 LevelSelect 章节 0
 */
export class TutorialScene extends GameScene {
  constructor() {
    super('TutorialScene');
  }

  protected override createTutorialController(): TutorialController | null {
    return new TutorialController({
      scene: this,
      grid: this.grid,
      towerBar: this.towerBar,
      isTutorialLevel: () => true,
      spawnPathogenForTutorial: (type) => this.spawnPathogenForTutorial(type),
    });
  }

  protected override shouldTrackLevelEvents(): boolean {
    return false;
  }

  protected override getTowersForBar(): readonly TowerType[] {
    return ['macrophage'];
  }

  protected override configurePauseMenuForTutorial(): void {
    // PauseMenu.setReplayMode(true) 隐藏「重玩本关」按钮（教学流程固定不需重玩）
    this.pauseMenu.setReplayMode(true);
    this.pauseMenu.layout(this.scale.width, this.scale.height);
  }

  protected override onTutorialFinished(_outcome: 'won' | 'lost'): void {
    // 教学走完即标记完成，回 LevelSelectScene 章节 0
    useMetaStore.getState().markTutorialCompleted();
    this.scene.start('LevelSelectScene');
  }

  /** 教学关 TowerBar 永远显默认皮肤（避免给新手 visual noise） */
  protected override shouldApplySkinToTowerBar(): boolean {
    return false;
  }
}
