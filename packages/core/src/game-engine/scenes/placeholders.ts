import { Scene } from 'phaser';
import { COLOR } from '../style';

const FONT = 'JetBrains Mono, SF Mono, Consolas, monospace';
const PRIMARY = COLOR.primary;
const DIM = COLOR.dim;

/** 临时占位 Scene 工厂，后续阶段逐个替换为真正实现。 */
function makePlaceholder(name: string, sceneKey: string, backTo?: string): typeof Scene {
  return class PlaceholderScene extends Scene {
    constructor() {
      super(sceneKey);
    }
    create(): void {
      const { width, height } = this.scale;
      this.add
        .text(width / 2, height / 2, `TODO: ${name}`, {
          fontFamily: FONT,
          fontSize: '24px',
          color: PRIMARY,
        })
        .setOrigin(0.5);
      if (backTo) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('aria-label', 'back-to-menu');
        btn.textContent = '← 返回';
        btn.style.cssText = `
          padding: 8px 16px;
          font-family: ${FONT};
          font-size: 11px;
          color: ${PRIMARY};
          background: rgba(34,255,170,0.08);
          border: 1px solid rgba(34,255,170,0.5);
          cursor: pointer;
          letter-spacing: 0.25em;
        `;
        btn.onclick = () => this.scene.start(backTo);
        this.add.dom(60, 30, btn);
      }
      // 临时：MainMenu 加几个跳转按钮
      if (sceneKey === 'MainMenuScene') {
        this.add
          .text(width / 2, height / 2 + 60, '点击下方按钮进入子屏', {
            fontFamily: FONT,
            fontSize: '11px',
            color: DIM,
          })
          .setOrigin(0.5);
        this.makeMenuBtn(width / 2, height / 2 + 100, '关卡选择', 'LevelSelectScene');
        this.makeMenuBtn(width / 2, height / 2 + 140, '图鉴', 'EncyclopediaScene');
        this.makeMenuBtn(width / 2, height / 2 + 180, '设置', 'SettingsScene');
        this.makeMenuBtn(width / 2, height / 2 + 220, '游戏 (关 1)', 'GameScene');
      }
    }
    private makeMenuBtn(x: number, y: number, label: string, target: string): void {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.style.cssText = `
        padding: 8px 24px;
        font-family: ${FONT};
        font-size: 11px;
        color: ${PRIMARY};
        background: rgba(34,255,170,0.08);
        border: 1px solid rgba(34,255,170,0.5);
        cursor: pointer;
        letter-spacing: 0.2em;
      `;
      btn.onclick = () => this.scene.start(target);
      this.add.dom(x, y, btn);
    }
  } as unknown as typeof Scene;
}

export const EncyclopediaScene = makePlaceholder(
  'Encyclopedia',
  'EncyclopediaScene',
  'MainMenuScene',
);
export const SettingsScene = makePlaceholder('Settings', 'SettingsScene', 'MainMenuScene');
