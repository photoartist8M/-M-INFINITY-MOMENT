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
  const HEIGHT_OFFSET = {
  19: -4,
  26: -2,
  35: -1,
  16: 3,
  31: 4,
  28: 3,
  30: 2,    // ← 少し上
  33: 2,    // ← 少し上
};

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

// 基本配置
let angle = tierOffset + i * baseAngleStep;

// --------------------------------------------------
// 固定レイアウト（展示デザイン優先）
// --------------------------------------------------
const FIXED_ANGLES = {

  // ---------- 最上段 ----------
   5:   0,
   6:  60,
   7: 120,
   9: 180,
  10: 240,
  11: 300,

  // ---------- 上段 ----------
  28:  30,
  13:  90,
  14: 150,
  15: 210,
  16: 270,
  18: 330,

  // ---------- メイン段 ----------
  19:   0,      // 主役
  21:  55,
  22: 100,
  37: 165,      // 大写真
  25: 235,
  26: 300,      // 手紙（photo35と対角）

  // ---------- 下段 ----------
27:  25,   // 21(55°)より少し左
12:  85,   // 21と22の中間
30: 145,   // 22(110°)と37(165°)の中間
31: 205,   // 37と25の中間
32: 265,   // 25と26の中間
33: 325,   // 26(300°)より少し右

// ---------- 最下段 ----------
34:  55,   // 21 と同じライン
35: 115,   // 22 と同じライン（シャボン玉）
36: 185,   // 37(165°)の少し右
24: 255,   // 25(235°)の少し右
38: 325,   // 26(300°)の少し右
};

if (FIXED_ANGLES[id] !== undefined) {
    angle = FIXED_ANGLES[id];
}

      layout[id] = {
        angle,
        radius,
        height: TIER_HEIGHTS[tier] + (HEIGHT_OFFSET[id] ?? 0),
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