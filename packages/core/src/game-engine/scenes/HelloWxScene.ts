import { Scene } from 'phaser';

/**
 * wx 端 spike：验证 Phaser Scene + 资源加载（PNG）+ input 完整链路
 */
export class HelloWxScene extends Scene {
  private clickCount = 0;
  private clickText?: Phaser.GameObjects.Text;
  private macrophage?: Phaser.GameObjects.Image;

  constructor() {
    super('HelloWxScene');
  }

  preload(): void {
    console.log('[HelloWx] preload start');
    // 验证图片加载：相对路径相对 wx-dist 根
    this.load.image('macrophage', 'assets/towers/macrophage-1.png');
    this.load.on('complete', () => console.log('[HelloWx] preload complete'));
    this.load.on('loaderror', (file: Phaser.Loader.File) =>
      console.error('[HelloWx] load error:', file.key, file.url),
    );
  }

  create(): void {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    // 标题
    this.add.rectangle(cx, cy - 280, 400, 100, 0x7fffd4);
    this.add
      .text(cx, cy - 280, '微观防线', {
        color: '#000',
        fontSize: '52px',
        fontFamily: 'sans-serif',
      })
      .setOrigin(0.5);

    // 副标题
    this.add
      .text(cx, cy - 180, 'Phaser + wx · 资源加载验证', {
        color: '#7fffd4',
        fontSize: '22px',
      })
      .setOrigin(0.5);

    // 加载的 PNG 贴图（macrophage 巨噬细胞）
    if (this.textures.exists('macrophage')) {
      this.macrophage = this.add.image(cx, cy - 30, 'macrophage').setDisplaySize(180, 180);
      this.add
        .text(cx, cy + 80, '✓ PNG 贴图加载成功', {
          color: '#7fffd4',
          fontSize: '24px',
        })
        .setOrigin(0.5);
    } else {
      this.add
        .text(cx, cy, '✗ macrophage 贴图加载失败', {
          color: '#ff3344',
          fontSize: '28px',
        })
        .setOrigin(0.5);
    }

    // 点击计数
    this.clickText = this.add
      .text(cx, cy + 150, '点击屏幕（0 次）→ 5 次切场景', {
        color: '#fff',
        fontSize: '24px',
      })
      .setOrigin(0.5);

    // tween：贴图脉动
    if (this.macrophage) {
      this.tweens.add({
        targets: this.macrophage,
        scale: { from: 1, to: 1.1 },
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // input
    this.input.on('pointerdown', () => {
      this.clickCount++;
      this.clickText?.setText(`点击屏幕（${this.clickCount} 次）→ 5 次切场景`);
      if (this.clickCount === 5) this.scene.start('GoodbyeWxScene');
    });

    console.log('[HelloWx] create done');
  }
}

export class GoodbyeWxScene extends Scene {
  constructor() {
    super('GoodbyeWxScene');
  }
  create(): void {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    this.cameras.main.setBackgroundColor('#0a3a14');
    this.add.text(cx, cy, 'Scene 切换 ✓', { color: '#7fffd4', fontSize: '64px' }).setOrigin(0.5);
    this.add.text(cx, cy + 80, '点击返回', { color: '#fff', fontSize: '28px' }).setOrigin(0.5);
    this.input.on('pointerdown', () => this.scene.start('HelloWxScene'));
  }
}
