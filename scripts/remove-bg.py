#!/usr/bin/env python3
"""
批量把 public/assets/**/*.png 的黑色背景抠透明。

规则：
- 亮度（R+G+B）< DARK_THRESHOLD 的像素：alpha 设 0
- 亮度在 [DARK_THRESHOLD, FADE_THRESHOLD]：alpha 按线性渐变（避免硬边）
- 更亮：保留原 alpha（主体/发光边缘）

默认阈值适合 MiniMax image-01 生成的 "pure black background" 图片。
"""
from PIL import Image
import glob
import sys

DARK_THRESHOLD = 60  # 之下完全透明
FADE_THRESHOLD = 150  # 之上保留不变


def process(path: str) -> None:
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    px = im.load()
    changed = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            lum = r + g + b  # 0..765
            if lum < DARK_THRESHOLD:
                px[x, y] = (0, 0, 0, 0)
                changed += 1
            elif lum < FADE_THRESHOLD:
                # 线性淡出 alpha
                t = (lum - DARK_THRESHOLD) / (FADE_THRESHOLD - DARK_THRESHOLD)
                px[x, y] = (r, g, b, int(a * t))
                changed += 1
    im.save(path, optimize=True)
    print(f'{path}: 修改 {changed}/{w*h} 像素')


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
