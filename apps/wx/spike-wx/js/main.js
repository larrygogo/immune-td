// Phaser 8 + weapp-adapter 诊断版（Windows 微信开发者工具）
// 屏幕画 STAGE 字 + 启动 Phaser，看哪一步崩

(function () {
  var canvas = wx.createCanvas();
  var sys = wx.getSystemInfoSync();
  var dpr = sys.pixelRatio || 1;
  canvas.width = sys.screenWidth * dpr;
  canvas.height = sys.screenHeight * dpr;
  var ctx = canvas.getContext('2d');

  var lines = [];
  function paint() {
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#7fffd4';
    ctx.font = Math.round(22 * dpr) + 'px sans-serif';
    ctx.fillText('PHASER 8 SPIKE', 20 * dpr, 50 * dpr);
    ctx.fillStyle = '#ffffff';
    ctx.font = Math.round(14 * dpr) + 'px sans-serif';
    for (var i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 20 * dpr, (90 + i * 22) * dpr);
    }
  }
  function log(msg) {
    lines.push(msg);
    if (lines.length > 28) lines.shift();
    paint();
    console.log(msg);
  }

  if (wx.onError) wx.onError(function (e) { log('onError: ' + (e.message || e)); });

  log('STAGE 0: canvas ' + sys.screenWidth + 'x' + sys.screenHeight + ' dpr=' + dpr);

  // 检查 weapp-adapter 注入了什么
  log('STAGE 1: globals after weapp-adapter');
  log('  typeof window: ' + typeof window);
  log('  typeof document: ' + typeof document);
  log('  typeof Image: ' + typeof Image);
  log('  typeof XMLHttpRequest: ' + typeof XMLHttpRequest);
  log('  typeof Blob: ' + typeof Blob);
  log('  typeof URL: ' + typeof URL);

  log('STAGE 2: detect Phaser');
  var P = (typeof Phaser !== 'undefined') ? Phaser :
          (typeof GameGlobal !== 'undefined' && GameGlobal.Phaser) ? GameGlobal.Phaser : null;
  if (!P) { log('  ✗ Phaser not on global'); return; }
  log('  Phaser.VERSION: ' + P.VERSION);

  log('STAGE 3: new Phaser.Game (CANVAS, 强制不用 WebGL 简化)');
  try {
    var game = new P.Game({
      type: P.CANVAS,
      width: 480,
      height: 480,
      backgroundColor: '#003344',
      scene: {
        create: function () {
          log('STAGE 4: scene.create() ✓');
          var cx = this.scale.width / 2;
          var cy = this.scale.height / 2;
          this.add.rectangle(cx, cy, 200, 200, 0xff3344);
          this.add.text(cx, cy, 'OK', { color: '#fff', fontSize: '40px' }).setOrigin(0.5);
          log('STAGE 5: rect+text drawn ✓ (Phaser scene canvas 在另一画布，不在 STAGE 屏)');
        },
      },
    });
    log('  ✓ new Phaser.Game returned');
  } catch (e) {
    log('  ✗ Phaser.Game: ' + (e.message || e).slice(0, 100));
    log('  stack[0..120]: ' + ((e.stack || '') + '').slice(0, 120));
  }
})();
