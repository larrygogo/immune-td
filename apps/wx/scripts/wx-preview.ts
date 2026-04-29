// 用腾讯官方 miniprogram-ci 出小游戏预览二维码
//
// 用法：
//   WECHAT_APPID=wxxxxxxxx WECHAT_CI_KEY_PATH=/path/to/private.key bun apps/wx/scripts/wx-preview.ts
//
// 依赖：
//   - 微信小游戏 AppID（环境变量 WECHAT_APPID）
//   - miniprogram-ci 私钥文件（在微信公众平台 → 开发管理 → 开发设置 → 小程序代码上传 下载，
//     默认路径 ~/.config/immune-td/private.key，可用 WECHAT_CI_KEY_PATH 覆盖）

import * as ci from 'miniprogram-ci';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const APPID = process.env.WECHAT_APPID;
const KEY_PATH = process.env.WECHAT_CI_KEY_PATH ?? `${homedir()}/.config/immune-td/private.key`;
const PROJECT_PATH = resolve(process.argv[2] ?? './spike-wx');
const QR_OUT = '/tmp/wx-preview-qr.jpg';

if (!APPID) {
  console.error('❌ WECHAT_APPID env not set');
  process.exit(1);
}
if (!existsSync(KEY_PATH)) {
  console.error(`❌ Private key not found at ${KEY_PATH}`);
  console.error('   下载方式：微信公众平台 → 开发管理 → 开发设置 → 小程序代码上传 → 下载私钥');
  console.error(`   chmod 600 ${KEY_PATH}`);
  process.exit(1);
}

console.log(`📦 Project: ${PROJECT_PATH}`);
console.log(`🔑 AppID: ${APPID}`);
console.log('⏳ Calling miniprogram-ci preview...\n');

const project = new ci.Project({
  appid: APPID,
  type: 'miniGame',
  projectPath: PROJECT_PATH,
  privateKeyPath: KEY_PATH,
  ignores: ['node_modules/**/*'],
});

try {
  const result = await ci.preview({
    project,
    desc: 'Phaser 8 spike',
    setting: {
      es6: true,
      es7: true,
      minify: false,
      autoPrefixWXSS: false,
    },
    qrcodeFormat: 'image',
    qrcodeOutputDest: QR_OUT,
    onProgressUpdate: console.log,
  });
  console.log('\n✅ Preview generated');
  console.log('   Total package size:', result?.subPackageInfo);
  console.log(`   QR saved to ${QR_OUT}`);
  console.log('\n📱 To view QR:');
  console.log(`   1. Convert to data URL:`);
  console.log(`      echo "data:image/jpeg;base64,$(base64 -w0 ${QR_OUT})" | head -c 200`);
  console.log(`   2. Or copy whole data URL to browser address bar:`);
  console.log(`      echo "data:image/jpeg;base64,$(base64 -w0 ${QR_OUT})" > /tmp/wx-qr-dataurl.txt`);
  console.log(`      cat /tmp/wx-qr-dataurl.txt | xclip -selection clipboard  # 如果有 xclip`);
} catch (e) {
  console.error('\n❌ Preview failed:');
  console.error(e instanceof Error ? e.message : e);
  if (e instanceof Error && e.stack) {
    console.error(e.stack.split('\n').slice(0, 5).join('\n'));
  }
  process.exit(1);
}
