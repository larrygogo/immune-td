#!/usr/bin/env python3
"""
批量 crop public/assets/**/*.png 到主体内容区域（透明像素之外），
然后居中 padding 回 256×256 方形。

这样主体约占 sprite 的 85%，显示到小尺寸时不会"看起来缩水"。
"""
from PIL import Image
import glob
import sys

TARGET = 256
# alpha 高于此视为实心主体。10 太低会把发光光晕算进 bbox，导致 Lv2/Lv3
# 等本身发光范围大的 sprite 主体显得小；用 80 只 crop 明确可见的实心部分。
ALPHA_THRESHOLD = 80
PADDING = 6


def process(path: str) -> None:
    im = Image.open(path).convert('RGBA')
    # 找出 alpha > threshold 的像素的 bounding box
    bbox = im.split()[3].point(lambda a: 255 if a > ALPHA_THRESHOLD else 0).getbbox()
    if not bbox:
        print(f'{path}: 全透明，跳过')
        return
    cropped = im.crop(bbox)
    cw, ch = cropped.size
    # 按长边等比缩到 TARGET - 2*PADDING
    max_side = TARGET - 2 * PADDING
    scale = max_side / max(cw, ch)
    nw, nh = int(cw * scale), int(ch * scale)
    cropped = cropped.resize((nw, nh), Image.LANCZOS)
    # 居中贴到透明画布
    canvas = Image.new('RGBA', (TARGET, TARGET), (0, 0, 0, 0))
    ox = (TARGET - nw) // 2
    oy = (TARGET - nh) // 2
    canvas.paste(cropped, (ox, oy), cropped)
    canvas.save(path, optimize=True)
    print(f'{path}: bbox={bbox} → {nw}×{nh} 居中')


def main() -> None:
    patterns = sys.argv[1:] or ['public/assets/**/*.png']
    files = []
    for pat in patterns:
        files.extend(glob.glob(pat, recursive=True))
    if not files:
        print('没有匹配文件')
        return
    for p in files:
        process(p)
    print(f'\n完成：处理 {len(files)} 张')


if __name__ == '__main__':
    main()
