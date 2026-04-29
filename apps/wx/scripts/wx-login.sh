#!/bin/bash
# 微信小游戏登录：终端打印 ASCII 二维码，扫码登录开发者工具
# 用法：bash scripts/wx-login.sh
# 通常只需跑一次（登录态会持久化到 ~/.config/wechat-devtools）

set -euo pipefail

echo "⏳ 启动 IDE，~30 秒后二维码会画出来..."
echo ""

echo y | xvfb-run -a -s "-screen 0 1920x1080x24" wechat-devtools-cli login \
  --qr-format terminal \
  --disable-gpu

pkill -9 -f 'wechat-devtools' 2>/dev/null || true
pkill -9 -f nwjs 2>/dev/null || true
pkill -9 -f Xvfb 2>/dev/null || true
