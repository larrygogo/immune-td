# Share Tech Mono 源 TTF（subset 输入）

本目录存放 Share Tech Mono（Google Fonts，OFL 1.1 商用免费）的 Regular 字重 TTF，作为
`scripts/subset-font.ts` 子集化的输入源。HUD 数字 / 单位 / 标签的等宽字体，cyber 显示
器风、锐利方正、跟 MiSans 视觉协调。

## 为什么不进 git

- 单个 TTF ~42 KB（比 MiSans 小很多，但仍按统一约定走 .gitignore）
- `scripts/subset-font.ts` 会扫源码生成 `public/fonts/share-tech-mono-subset-400.woff2`
  （也 gitignore，由 prebuild 钩子自动生成），运行时只用 subset

## 首次本地准备

```bash
curl -sL -o public/fonts/share-tech-mono/ShareTechMono-Regular.ttf \
  "https://github.com/google/fonts/raw/main/ofl/sharetechmono/ShareTechMono-Regular.ttf"
```

字重对应：

| 文件 | CSS font-weight |
|---|---|
| ShareTechMono-Regular.ttf | 400（仅有此字重） |

## 许可

Share Tech Mono 由 Carrois Apostrophe（Ralph du Carrois）设计，遵循 SIL Open Font
License 1.1（OFL），允许商用、修改、再分发，唯一限制是衍生字体不能以原字体名命名。
本项目只做 subset（不修改字形）+ 内嵌到产品，符合协议。

来源：<https://fonts.google.com/specimen/Share+Tech+Mono>
