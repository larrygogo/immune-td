import { useMetaStore } from '@ui/store';
import type { PathogenType, TowerType } from '../game/entities';
import { PATHOGEN_REGISTRY } from '../game/registry/pathogen-registry';
import { TOWER_REGISTRY } from '../game/registry/tower-registry';
import { HEX } from '../style';

/**
 * 战斗层颜色的 single source：renderer / effects / placement-ghost 统一从 registry.meta 取色。
 *
 * 历史背景：
 * - tower-layer / placement-ghost / effects-layer 各持一份 TOWER_COLOR 常量
 * - pathogen-layer / effects-layer 各持一份 PATHOGEN_COLOR
 * - LevelBriefingScene 另有一份 PATHOGEN_META（name + color）
 * 全部并存且拷贝时手改不同步 → 加新塔/新敌要找齐所有拷贝点，漏掉就运行时 fallback 成兜底色。
 *
 * 现在：
 * - 颜色全部在 registry 的 meta.battleColor（未填 fallback 到 meta.color）
 * - 加新敌 / 新塔只需改 registry 一处
 */
const TOWER_FALLBACK_BATTLE_COLOR = HEX.immune;
const PATHOGEN_FALLBACK_BATTLE_COLOR = HEX.pathogenFallback;

/**
 * 塔的「基础」战斗色，**不读** equippedSkins —— 让科研 / 百科 / 关卡介绍等
 * 元 UI 永远显示原型色，不被皮肤影响。
 *
 * 战斗渲染（tower-layer / placement-ghost）需要按装备皮肤改色，调
 * `getEquippedSkinColor` 拿 alt skin 色另作 tint。
 */
export function getTowerBattleColor(type: TowerType | string): number {
  const entry = (
    TOWER_REGISTRY as Record<string, { meta: { color: number; battleColor?: number } }>
  )[type];
  if (!entry) return TOWER_FALLBACK_BATTLE_COLOR;
  return entry.meta.battleColor ?? entry.meta.color ?? TOWER_FALLBACK_BATTLE_COLOR;
}

/**
 * 解析 skin 对应的 sprite 渲染参数：有专属 SVG 用其 key，否则 fallback 到 default
 * sprite + multiplicative tint。
 *
 * 对于 default skin 或不存在的 skin 返回 default sprite + 无 tint。
 */
export function resolveTowerSprite(
  type: TowerType | string,
  level: 1 | 2 | 3,
  skinId: string | undefined,
): { key: string; tint: number | null } {
  const entry = (
    TOWER_REGISTRY as Record<
      string,
      {
        skins?: readonly {
          id: string;
          battleColor: number;
          hasCustomSprite?: boolean;
        }[];
      }
    >
  )[type];
  // 默认 sprite key 始终用 default 路径（手拼 key 避免 TEX.tower 的 TowerType 严格类型）
  const defaultKey = `tower-${type}-${level}`;
  if (!skinId || skinId === 'default' || !entry?.skins) {
    return { key: defaultKey, tint: null };
  }
  const skin = entry.skins.find((s) => s.id === skinId);
  if (!skin) return { key: defaultKey, tint: null };
  if (skin.hasCustomSprite) {
    return { key: `tower-${type}-${level}-${skinId}`, tint: null };
  }
  // 没自定义 SVG → fallback 到 default sprite + tint 表达皮肤色
  return { key: defaultKey, tint: skin.battleColor };
}

/**
 * 已装备皮肤的 battleColor。仅在装备非 default 皮肤时返回该色，否则返回 null。
 * 战斗渲染层据此判断"要不要给 sprite setTint"。
 */
export function getEquippedSkinColor(type: TowerType | string): number | null {
  const entry = (
    TOWER_REGISTRY as Record<string, { skins?: readonly { id: string; battleColor: number }[] }>
  )[type];
  if (!entry?.skins) return null;
  const equippedId = useMetaStore.getState().equippedSkins[type as TowerType];
  if (!equippedId || equippedId === 'default') return null;
  const skin = entry.skins.find((s) => s.id === equippedId);
  return skin?.battleColor ?? null;
}

export function getPathogenBattleColor(type: PathogenType | string): number {
  const entry = (
    PATHOGEN_REGISTRY as Record<string, { meta: { color: number; battleColor?: number } }>
  )[type];
  if (!entry) return PATHOGEN_FALLBACK_BATTLE_COLOR;
  return entry.meta.battleColor ?? entry.meta.color ?? PATHOGEN_FALLBACK_BATTLE_COLOR;
}
