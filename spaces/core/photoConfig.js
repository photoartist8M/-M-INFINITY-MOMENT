import { PHOTO_DATA } from '../config/constants.js';

// ======================================================
// core/photoConfig.js
// 均等配置＋portrait補正＋中央寄せ（photo26,37）
// ======================================================

const TIER_HEIGHTS = [14, 7, 0, -7, -14];
const TIER_TILT_X  = [22, 12, 4, -4, -10];

const SIZE_PRESET = {
  large:  { baseScale: 1.35 },
  normal: { baseScale: 0.9 },
};

// ------------------------------------------------------
// スケール計算：portrait補正＋特定写真強調
// ------------------------------------------------------
function getBaseScale(photo) {
  let scale = (SIZE_PRESET[photo.size] ?? SIZE_PRESET.normal).baseScale;
  if (photo.orientation === 'portrait') scale *= 1.25;
  if ([26, 37].includes(photo.id)) scale *= 1.4;
  if (photo.scaleBoost) scale *= photo.scaleBoost;
  return scale;
}

// ------------------------------------------------------
// 写真の見た目の横幅をaspect比から算出
// ------------------------------------------------------
function estimateFrameWidth(photo) {
  const scale = getBaseScale(photo);
  const frameHeight = 4.5 * scale;
  const aspect = photo.aspect ?? (photo.orientation === 'portrait' ? 0.67 : 1.5);
  return frameHeight * aspect;
}

// ------------------------------------------------------
// 段構成
// ------------------------------------------------------
const TIERS = [
  [5, 6, 7, 9, 10, 11],
  [28, 13, 14, 15, 16, 18],
  [19, 21, 22, 37, 25, 26], // ← photo37,26を中央寄せ
  [27, 12, 30, 31, 32, 33],
  [34, 35, 36, 24, 38],
];

const RADIUS_BY_TIER = [26, 28, 30, 32, 34];
const MIN_GAP_DEG = 6;
const LARGE_RADIUS_BOOST = 3.0;

// ------------------------------------------------------
// 均等配置＋portrait補正＋中央寄せ
// ------------------------------------------------------
function buildFixedLayout(photoById) {
  const layout = {};

  TIERS.forEach((ids, tier) => {
    const count = ids.length;
    const baseAngleStep = 360 / count;
    const tierOffset = (tier % 2 === 0) ? 0 : baseAngleStep / 2;

    ids.forEach((id, i) => {
      const photo = photoById[id];
      const scale = getBaseScale(photo);
      const radius = (photo.size === 'large')
        ? RADIUS_BY_TIER[tier] + LARGE_RADIUS_BOOST
        : RADIUS_BY_TIER[tier];

      // 均等配置を基本に、portraitやlargeはわずかに角度補正
      let angle = tierOffset + i * baseAngleStep;
      if (photo.orientation === 'portrait') angle += (Math.random() - 0.5) * 3.0;
      if (photo.size === 'large') angle += (Math.random() - 0.5) * 2.0;

      // ★中央寄せ：photo26とphoto37を中央（180°付近）に固定
      if (id === 26) angle = 180;
      if (id === 37) angle = 160;

if (id === 35) angle += 10;  // 右へ少し移動
if (id === 36) angle -= 10;  // 左へ少し移動

      layout[id] = {
        angle,
        radius,
        height: TIER_HEIGHTS[tier] + (Math.random() - 0.5) * 1.5,
        tiltX: TIER_TILT_X[tier],
        scale,
      };
    });
  });

  return layout;
}

// ------------------------------------------------------
// 出力構成
// ------------------------------------------------------
export function buildPhotoConfig(photoData) {
  const photoById = Object.fromEntries(photoData.map(p => [p.id, p]));
  const FIXED_LAYOUT = buildFixedLayout(photoById);
  return photoData.map(photo => ({
    ...photo,
    ...FIXED_LAYOUT[photo.id],
  }));
}

// id -> photoデータ の対応表（aspect / size / orientation参照用）
const photoById = Object.fromEntries(PHOTO_DATA.map(p => [p.id, p]));
const FIXED_LAYOUT = buildFixedLayout(photoById);

// フォールバック：将来PHOTO_DATAに写真を追加してTIERSに登録し忘れた場合の保険
function getFallbackLayout(index) {
  const angle = (index * 47) % 360;
  return { angle, radius: RADIUS, height: 0, tiltX: 0 };
}

export const PHOTO_CONFIG = buildPhotoConfig(PHOTO_DATA);