import { type GameObjects, Scene } from 'phaser';
import { DPR } from '../dpr';
import { SAFE_BOTTOM, SAFE_TOP } from '../layout/safe-area';
import { SPACING } from '../layout/spacing';
import { onSceneResize } from '../scene-resize';
import { COLOR, FONT, HEX, px } from '../style';

/**
 * 健康游戏忠告（国内游戏行业标准合规）。
 * BootScene → HealthAdvisoryScene → SplashScene 流程中插一屏，停留 3 秒
 * 让用户看完忠告再进入主资源加载。
 *
 * 文本 = 国家新闻出版总署推荐的标准 5 行版（标题 + 4 排比句）。
 *
 * 视觉：项目 cyber-on-dark 美学（黑底 + neon 描边 + dim 灰字）。
 * 不依赖美术资源 / 不用 emoji。
 */
const ADVISORY_DURATION_MS = 3000;

const ADVISORY_LINES = [
  '抵制不良游戏，拒绝盗版游戏',
  '注意自我保护，谨防受骗上当',
  '适度游戏益脑，沉迷游戏伤身',
  '合理安排时间，享受健康生活',
];

export class HealthAdvisoryScene extends Scene {
  private title!: GameObjects.Text;
  private line!: GameObjects.Graphics;
  private advisoryTexts: GameObjects.Text[] = [];

  constructor() {
    super('HealthAdvisoryScene');
  }

  create(): void {
    // 标题（neon 主色，不加粗、不发光，对齐项目去 shadow 风格）
    this.title = this.add
      .text(0, 0, '健康游戏忠告', {
        fontFamily: FONT,
        fontSize: `${px(20)}px`,
        color: COLOR.primary,
      })
      .setOrigin(0.5)
      .setLetterSpacing(px(20 * 0.3))
      .setResolution(DPR);

    // 标题下方分隔线（layout 时按当前宽度重画）
    this.line = this.add.graphics();

    // 4 行忠告（dim 灰字）
    this.advisoryTexts = ADVISORY_LINES.map((text) =>
      this.add
        .text(0, 0, text, {
          fontFamily: FONT,
          fontSize: `${px(13)}px`,
          color: COLOR.dim,
        })
        .setOrigin(0.5)
        .setLetterSpacing(px(13 * 0.18))
        .setResolution(DPR),
    );

    const { width, height } = this.scale;
    this.layout(width, height);
    onSceneResize(this, (w, h) => this.layout(w, h));

    // fade-in 标题（视觉 polish）
    this.title.setAlpha(0);
    this.tweens.add({
      targets: this.title,
      alpha: 1,
      duration: 400,
      ease: 'Quad.out',
    });

    // ADVISORY_DURATION_MS 后跳 SplashScene
    this.time.delayedCall(ADVISORY_DURATION_MS, () => {
      // fade out 整个场景再 next
      this.cameras.main.fadeOut(220, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('SplashScene');
      });
    });
  }

  private layout(W: number, H: number): void {
    const visibleH = H - SAFE_TOP - SAFE_BOTTOM;
    const centerY = SAFE_TOP + visibleH / 2;

    // 标题：中心上方约 60 CSS px = xl(32) + lg(24) + xs(4)
    this.title.setPosition(W / 2, centerY - px(SPACING.xl + SPACING.lg + SPACING.xs));

    // 分隔线：端点 X 偏移 = px(80)，但窄屏要收紧避免顶到边
    // y 偏移 = px(40) = xl(32) + sm(8)
    const halfLine = Math.min(px(SPACING.xl * 2 + SPACING.md), W / 2 - px(SPACING.lg));
    const lineY = centerY - px(SPACING.xl + SPACING.sm);
    this.line.clear();
    this.line.lineStyle(px(1), HEX.primary, 0.4);
    this.line.beginPath();
    this.line.moveTo(W / 2 - halfLine, lineY);
    this.line.lineTo(W / 2 + halfLine, lineY);
    this.line.strokePath();

    // 4 行忠告
    const lineHeight = px(SPACING.lg);
    const startY = centerY - px(SPACING.md);
    for (let i = 0; i < this.advisoryTexts.length; i++) {
      this.advisoryTexts[i]?.setPosition(W / 2, startY + i * lineHeight);
    }
  }
}
