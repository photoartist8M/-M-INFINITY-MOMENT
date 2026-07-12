import { PHOTO_DATA, GALLERY_RADIUS } from '../config/constants.js';

// ======================================================================
// core/photoConfig.js
// ★変更：4段構成＋「スロットの弧の長さ」からサイズ上限を逆算することで、
// 同じ段の隣同士が絶対に重ならないよう保証する。
// ======================================================================

const TIER_COUNT = 4; // ★段数。3〜5で調整可能(TIER_HEIGHTSも同じ数に合わせること)
const TIER_HEIGHTS = [7.5, 3.0, -1.5, -6.0]; // 上から下へ。隣の段と4.5以上離す
const TIER_HEIGHT_JITTER = 0.6; // 縦のばらつき(重ならない範囲に抑える控えめな値)
const MAX_ASPECT_ASSUMED = 1.6; // 横長写真の最大想定アスペクト比(安全マージン用)
const SLOT_MARGIN = 0.80; // スロット幅に対してどれだけ余白を持たせるか(小さいほど余白大)

export function buildPhotoConfig(photoData) {
  const count = photoData.length;
  const perTier = Math.ceil(count / TIER_COUNT);

  return photoData.map((photo, i) => {
    const tier = Math.floor(i / perTier);
    const indexInTier = i % perTier;
    const tierStartIdx = tier * perTier;
    const countInThisTier = Math.min(perTier, count - tierStartIdx);

    // 段ごとに角度をずらして互い違いに配置(縦方向に重ならないように)
    const tierOffset = (tier % 2 === 0) ? 0 : (360 / countInThisTier) / 2;
    const slotAngleDeg = 360 / countInThisTier;
    const angle = slotAngleDeg * indexInTier + tierOffset;

    const baseHeight = TIER_HEIGHTS[tier] ?? TIER_HEIGHTS[TIER_HEIGHTS.length - 1];
    const height = baseHeight + (Math.random() - 0.5) * TIER_HEIGHT_JITTER;

    const radius = GALLERY_RADIUS + (Math.random() - 0.5) * 1.5;

    // ★同じ段の隣同士が絶対に重ならないよう、スロットの弧の長さから
    // 許容される最大サイズを逆算する
    const slotAngleRad = (slotAngleDeg * Math.PI) / 180;
    const slotArcLength = 2 * radius * Math.sin(slotAngleRad / 2);
    const maxAllowedWidth = slotArcLength * SLOT_MARGIN;
    const maxScaleForWidth = maxAllowedWidth / (4.5 * MAX_ASPECT_ASSUMED);

    const scale = Math.min(0.85 + Math.random() * 0.55, Math.max(0.55, maxScaleForWidth));

    return { ...photo, angle, radius, height, scale };
  });
}

export const PHOTO_CONFIG = buildPhotoConfig(PHOTO_DATA);