#!/bin/bash
# 微信小游戏预览：在终端打印 ASCII 二维码，手机扫码到真机预览
# 用法：
#   bash scripts/wx-preview.sh                      # 默认预览 spike-wx/
#   bash scripts/wx-preview.sh /path/to/wx-dist     # 指定项目目录
#
# 注意：终端需要足够宽（≥40 字符）才能完整显示二维码

set -euo pipefail

PROJECT="${1:-$(cd "$(dirname "$0")/.." && pwd)/spike-wx}"

if [ ! -f "$PROJECT/project.config.json" ]; then
  echo "❌ project.config.json not found in $PROJECT"
  exit 1
fi

echo "📦 项目目录：$PROJECT"
echo "⏳ 启动 IDE，~30 秒后二维码会画出来..."
echo ""

# echo y 自动确认 IDE service prompt
# xvfb-run 提供虚拟 X server，不需要真实显示器
echo y | xvfb-run -a -s "-screen 0 1920x1080x24" wechat-devtools-cli preview \
  --project "$PROJECT" \
  --qr-format terminal \
  --disable-gpu

# preview 完成后清理 IDE 进程，避免 port 冲突
pkill -9 -f 'wechat-devtools' 2>/dev/null || true
pkill -9 -f nwjs 2>/dev/null || true
pkill -9 -f Xvfb 2>/dev/null || true
