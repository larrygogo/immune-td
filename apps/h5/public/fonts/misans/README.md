# MiSans 源 TTF（subset 输入）

本目录存放 MiSans（小米开源中文字体，Apache 2.0 商用免费）的固定字重 TTF，作为
`scripts/subset-font.ts` 子集化的输入源。

## 为什么不进 git

- 单个 TTF ~8 MB × 3 字重 = 24 MB，仓库膨胀
- `scripts/subset-font.ts` 会扫源码生成 `public/fonts/misans-subset-{400,700,900}.woff2`
  （也 gitignore，由 prebuild 钩子自动生成），运行时只用 subset，源 TTF 仅本地参与构建

## 首次本地准备

```bash
curl -sL -o /tmp/MiSans.zip "https://hyperos.mi.com/font-download/MiSans.zip"
unzip -j -o /tmp/MiSans.zip \
  "MiSans/ttf/MiSans-Regular.ttf" \
  "MiSans/ttf/MiSans-Bold.ttf" \
  "MiSans/ttf/MiSans-Heavy.ttf" \
  -d public/fonts/misans/
```

字重对应：

| 文件 | CSS font-weight |
|---|---|
| MiSans-Regular.ttf | 400 |
| MiSans-Bold.ttf | 700 |
| MiSans-Heavy.ttf | 900 |

## 许可

MiSans 字体本身遵循《MiSans 字体知识产权许可协议》（小米授予不可转让、非独占、免版税
的版权许可，允许商用，不得改编/二次开发字体本身、不得单独再分发字体文件，但用 MiSans
字体创作的作品可分发出售）。本项目只做 subset（不修改字形）+ 内嵌到产品，符合协议。

来源：<https://hyperos.mi.com/font/zh/>
