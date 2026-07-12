import { PHOTO_DATA, GALLERY_RADIUS } from '../config/constants.js';

// ======================================================================
// core/photoConfig.js
// ★変更点：
//  1. 段の高さ幅を拡大＋段数を増やして縦の密集を緩和
//  2. SLOT_MARGINを絞って写真同士の間隔を拡大（=重なり防止を強化）
//  3. 上段の写真はやや下向きに傾ける（tiltXを追加）→レンダー側で反映してもらう
//  4. 半径方向のジッターも上段ほど大きくして奥行きの余白を作る
// ======================================================================

const TIER_COUNT = 5; // ★段数を4→5に増やして1段あたりの写真数を減らす
const TIER_HEIGHTS = [9.5, 5.0, 0.5, -4.0, -8.5]; // 上から下へ。隣の段と4.5以上離す
const TIER_HEIGHT_JITTER = 0.3; // 縦のばらつき(さらに抑えて重なりにくく)
const RADIUS_JITTER = 1.2; // 半径方向のばらつき
const MAX_ASPECT_ASSUMED = 1.6; // 横長写真の最大想定アスペクト比(安全マージン用)
const SLOT_MARGIN = 0.68; // ★0.80→0.68に。スロット幅に対する余白を増やす(小さいほど余白大)

// 段ごとの下向き傾き(度)。上段は下を向かせて視認性を上げる、下段はほぼ水平
// レンダリング側でphoto.tiltXをX軸回転(下向き = 正の値など、実装に合わせて符号調整)として使ってください
const TIER_TILT_X = [22, 12, 4, -4, -10];

// サイズ指定ごとの「重み」と「基準スケール」
const SIZE_PRESET = {
  large:  { weight: 1.6, baseScale: 1.25, scaleJitter: 0.25 },
  normal: { weight: 1.0, baseScale: 0.85, scaleJitter: 0.35 },
};

function getSizePreset(photo) {
  return SIZE_PRESET[photo.size] ?? SIZE_PRESET.normal;
}

export function buildPhotoConfig(photoData) {
  const count = photoData.length;
  const perTier = Math.ceil(count / TIER_COUNT);

  // 段ごとにグループ化
  const tiers = [];
  for (let t = 0; t < TIER_COUNT; t++) {
    const start = t * perTier;
    const slice = photoData.slice(start, start + perTier);
    if (slice.length > 0) tiers.push(slice);
  }

  const result = [];

  tiers.forEach((tierPhotos, tier) => {
    const weights = tierPhotos.map(p => getSizePreset(p).weight);
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    // 段ごとに角度をずらして互い違いに配置(縦方向に重ならないように)
    const tierOffset = (tier % 2 === 0) ? 0 : (360 / tierPhotos.length) / 2;

    const baseTilt = TIER_TILT_X[tier] ?? TIER_TILT_X[TIER_TILT_X.length - 1];

    // ★重みに応じてスロット角度を配分(累積角度で各写真の中心角を決める)
    let cumulative = 0;
    tierPhotos.forEach((photo, indexInTier) => {
      const weight = weights[indexInTier];
      const slotAngleDeg = (weight / totalWeight) * 360;
      const angle = cumulative + slotAngleDeg / 2 + tierOffset;
      cumulative += slotAngleDeg;

      const baseHeight = TIER_HEIGHTS[tier] ?? TIER_HEIGHTS[TIER_HEIGHTS.length - 1];
      const height = baseHeight + (Math.random() - 0.5) * TIER_HEIGHT_JITTER;

      // 上段ほど半径のばらつきを大きくして奥行きの余白を作る
      const radiusJitterForTier = RADIUS_JITTER * (1 + (TIER_COUNT - 1 - tier) * 0.15);
      const radius = GALLERY_RADIUS + (Math.random() - 0.5) * radiusJitterForTier;

      // ★このスロット自身の弧の長さから、重ならない最大サイズを逆算
      const slotAngleRad = (slotAngleDeg * Math.PI) / 180;
      const slotArcLength = 2 * radius * Math.sin(slotAngleRad / 2);
      const maxAllowedWidth = slotArcLength * SLOT_MARGIN;
      const maxScaleForWidth = maxAllowedWidth / (4.5 * MAX_ASPECT_ASSUMED);

      const preset = getSizePreset(photo);
      const desiredScale = preset.baseScale + Math.random() * preset.scaleJitter;

      // ★フロア値で上限を上書きしない。必ずmaxScaleForWidthでキャップする
      const scale = Math.min(desiredScale, maxScaleForWidth);

      // 段ごとの基準傾きに軽いジッターを加える(全部同じ角度だと不自然なので)
      const tiltX = baseTilt + (Math.random() - 0.5) * 4;

      result.push({ ...photo, angle, radius, height, scale, tiltX });
    });
  });

  return result;
}

export const PHOTO_CONFIG = buildPhotoConfig(PHOTO_DATA);