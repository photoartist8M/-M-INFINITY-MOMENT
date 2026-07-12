import { PHOTO_DATA, GALLERY_RADIUS } from '../config/constants.js';

// ★変更：2段→可変段数(デフォルト4段)構成に。段ごとに高さと半径をずらして
// 奥行きと余白を作り、窮屈さを解消する。
const TIER_COUNT = 4; // ★ここを3〜5で調整
const TIER_HEIGHTS = [7.0, 2.3, -2.3, -6.5]; // 上から下へ。TIER_COUNTと同じ数だけ用意する

export function buildPhotoConfig(photoData) {
  const count = photoData.length;
  const perTier = Math.ceil(count / TIER_COUNT);

  return photoData.map((photo, i) => {
    const tier = Math.floor(i / perTier);
    const indexInTier = i % perTier;
    const countInThisTier = Math.min(perTier, count - tier * perTier);

    // 段ごとに角度を少しずらして、縦に写真が重ならないようにする(互い違い配置)
    const tierOffset = (tier % 2 === 0) ? 0 : (360 / countInThisTier) / 2;
    const angle = (360 / countInThisTier) * indexInTier + tierOffset;

    const baseHeight = TIER_HEIGHTS[tier] ?? TIER_HEIGHTS[TIER_HEIGHTS.length - 1];
    const height = baseHeight + (Math.random() - 0.5) * 1.6;

    const scale = 0.85 + Math.random() * 0.75;

    // 段ごとに半径も少し変えて奥行きを出す
    const radius = GALLERY_RADIUS + (tier - TIER_COUNT / 2) * 1.5 + (Math.random() - 0.5) * 2;

    return { ...photo, angle, radius, height, scale };
  });
}

export const PHOTO_CONFIG = buildPhotoConfig(PHOTO_DATA);