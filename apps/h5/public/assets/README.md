# Sprite 资产

运行时通过 `/assets/<type>/<name>.png` 路径由 Pixi `Assets.load` 加载。缺失时 Renderer 自动回退到内置 Graphics 画法，不影响可玩性。

## 目录与命名

```
towers/
  macrophage-1.png    # 巨噬 Lv1
  macrophage-2.png    # Lv2
  macrophage-3.png    # Lv3
  neutrophil-1.png
  neutrophil-2.png
  neutrophil-3.png
  nkcell-1.png
  nkcell-2.png
  nkcell-3.png
pathogens/
  rhinovirus.png
  influenza.png
  ecoli.png
  saureus.png
  aspergillus.png
```

## 规格约定

- 方形 64×64 或 128×128 PNG（推荐 WebP 以减小体积）
- 透明背景
- 构图居中，留 4px 边距
- 色调贴近 `COLOR` 表里的各单位主色，但不强制
- 风格统一：赛博朋克医疗 HUD / 显微镜风 / 霓虹发光（自选其一，跨单位保持一致）

## AI 生成建议

- 用 `scripts/generate-sprites.ts`（如存在）一键调 DALL-E 3 批量生成
- 或把 `scripts/prompts.md` 里的 prompt 贴到 Midjourney / Leonardo / SD
- 生成后按上表命名放进本目录即可热加载

## 一键替换流程

1. 把文件放进 `public/assets/towers/` 或 `public/assets/pathogens/`
2. 刷新浏览器，Renderer 自动用 Sprite 替代 Graphics
3. 若想改尺寸：修改 `src/render/game-renderer.ts` 里 `sp.width/height`（塔 48，敌 26-28）
