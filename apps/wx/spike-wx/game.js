// STEP E：让 Phaser 复用主 canvas（wx 离屏 canvas 默认 webgl-only，getContext('2d') 返回 null）
var mainCanvas = null, dpr = 1, sysInfo = null;

try {
  mainCanvas = wx.createCanvas();
  sysInfo = wx.getSystemInfoSync();
  dpr = sysInfo.pixelRatio || 1;
  mainCanvas.width = sysInfo.screenWidth * dpr;
  mainCanvas.height = sysInfo.screenHeight * dpr;
} catch (e) { console.error('boot canvas:', e); }

console.log('==================== SPIKE STEP E ====================');

try { require('./js/libs/weapp-adapter/index.js'); console.log('weapp-adapter ok'); }
catch (e) { console.error('adapter:', e); }

try { require('./js/libs/phaser.min.js'); console.log('phaser v' + Phaser.VERSION); }
catch (e) { console.error('phaser:', e); }

if (typeof Phaser !== 'undefined') {
  console.log('Phaser config: canvas=mainCanvas, ' + mainCanvas.width + 'x' + mainCanvas.height);
  try {
    var game = new Phaser.Game({
      type: Phaser.CANVAS,
      canvas: mainCanvas,                       // 复用主 canvas（关键）
      context: mainCanvas.getContext('2d'),     // 复用 2d ctx
      width: mainCanvas.width,
      height: mainCanvas.height,
      backgroundColor: '#003344',
      scene: {
        create: function () {
          console.log('✓ scene.create() called');
          var cx = this.scale.width / 2;
          var cy = this.scale.height / 2;
          this.add.rectangle(cx, cy, 300 * dpr, 300 * dpr, 0xff3344);
          this.add.text(cx, cy, 'Phaser ' + Phaser.VERSION + ' OK', {
            color: '#fff',
            fontSize: (40 * dpr) + 'px',
          }).setOrigin(0.5);
          console.log('✓ rectangle + text drawn');
        },
      },
    });
    console.log('✓ new Phaser.Game returned');
  } catch (e) {
    console.error('Phaser.Game FAIL:', (e && e.message) || e);
    if (e && e.stack) console.error(e.stack.split('\n').slice(0, 6).join('\n'));
  }
}
console.log('==================== STEP E END ====================');
