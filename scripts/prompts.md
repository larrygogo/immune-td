# Sprite AI 生成提示词（中英双语）

**统一风格头（所有 prompt 前缀）**：

> Stylized cyberpunk medical HUD icon, neon-on-dark aesthetic, glowing outline,
> minimal iconic silhouette on transparent background, centered composition,
> 128x128 sprite, clean symmetrical design, high contrast, game asset.
> 赛博朋克医疗 HUD 图标，霓虹描边，简约剪影，透明背景，居中构图。

复制上面风格头后，粘贴下面每个单位的描述，生成一致风格的 sprite。

---

## 塔（防御方，绿/蓝/粉主色调）

### macrophage · 巨噬细胞 Lv1
`A stylized macrophage cell with amoeboid pseudopodia, teal/mint neon glow, soft hexagonal core membrane, simple iconic silhouette.`

### macrophage Lv2
`Same macrophage cell, more developed, additional lysosome granules visible, thicker neon outline, slightly brighter glow.`

### macrophage Lv3
`Elite macrophage, prominent multiple pseudopodia reaching outward, bright teal neon aura, inner core glowing intensely.`

### neutrophil · 中性粒细胞 Lv1
`Stylized neutrophil cell with characteristic multi-lobed nucleus (3-4 lobes visible), cobalt-blue neon glow, round membrane with granular texture.`

### neutrophil Lv2
`Neutrophil with more defined lobes, brighter blue neon granules around the perimeter, pulsing energy aura.`

### neutrophil Lv3
`Elite neutrophil, intense blue glow, dense granule pattern, faint secondary halo ring.`

### nkcell · NK 细胞 Lv1
`Stylized Natural Killer cell as a sniper-scope icon, magenta/hot-pink neon crosshair, diamond silhouette with crosshair reticle.`

### nkcell Lv2
`NK cell with double scope rings, sharper magenta neon crosshairs, corner tick marks.`

### nkcell Lv3
`Elite NK cell, concentric targeting rings, brightest magenta glow, central core pulsing.`

---

## 病原体（攻击方，各自不同主色）

### rhinovirus · 鼻病毒
`Stylized rhinovirus icosahedral capsid, hot-red/pink neon glow, 10-12 visible surface spikes (VP capsid proteins), spherical silhouette.`

### influenza · 流感病毒
`Stylized influenza virion, amber/yellow neon glow, surrounded by H-shaped glycoprotein spikes (hemagglutinin/neuraminidase), spherical body.`

### ecoli · 大肠杆菌 E.coli
`Stylized E.coli bacterium, violet/purple neon glow, rod-shaped body with rounded caps, single whip-like flagellum tail.`

### saureus · 金黄色葡萄球菌
`Stylized Staphylococcus aureus cluster, golden-orange neon glow, grape-like arrangement of 4 spherical cocci tightly bunched, each with a highlight dot.`

### aspergillus · 曲霉孢子（飞行单位）
`Stylized Aspergillus fungal spore, lime-green neon glow, spherical body with radial spikes and small particle dots around the perimeter, airborne ethereal feel.`

---

## 使用建议

1. 先用风格头 + 一个单位的描述生成，确认风格
2. 风格定调后，批量生成其余单位保持一致性
3. Midjourney：`--ar 1:1 --s 250 --style raw` 或 `--niji 6` 视觉更一致
4. DALL-E 3：直接粘贴，size=1024x1024
5. Stable Diffusion：负向加 "blurry, text, watermark, border, frame"

生成后下载 PNG，裁剪到 128×128，保持透明背景，放入 `public/assets/` 对应目录。
