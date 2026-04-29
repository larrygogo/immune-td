import { track } from './index';

/**
 * scene_enter / scene_leave 配对埋点。每个 Phaser Scene 在 create() 末调
 * trackSceneView(this.scene.key)。模块内记录前一个 scene 名 + 进入时间，
 * 下次切换时自动 emit:
 *   - scene_leave（旧 scene，含 dwell_ms + next_scene）
 *   - scene_enter（新 scene，含 prev_scene）
 *
 * 简化假设（v1）：用户同一时刻只在一个 scene。Phaser 多 scene 并存（pause + game）
 * 可能漏报，但 v1 我们只关心"主流程切换"，准确度足够指导 retention 分析。
 */

let prevScene: string | null = null;
let prevEnteredAt: number | null = null;

export function trackSceneView(sceneName: string): void {
  const now = Date.now();
  if (prevScene !== null && prevEnteredAt !== null) {
    track('scene_leave', {
      scene_name: prevScene,
      next_scene: sceneName,
      dwell_ms: Math.max(0, now - prevEnteredAt),
    });
  }
  track('scene_enter', {
    scene_name: sceneName,
    prev_scene: prevScene,
  });
  prevScene = sceneName;
  prevEnteredAt = now;
}

/** 当前所处 scene 名（外部模块需要"当前 scene"上下文时用，例如 app_visibility）。 */
export function getCurrentSceneName(): string | null {
  return prevScene;
}

/** 测试用：重置内部状态 */
export function _resetSceneViewForTests(): void {
  prevScene = null;
  prevEnteredAt = null;
}
