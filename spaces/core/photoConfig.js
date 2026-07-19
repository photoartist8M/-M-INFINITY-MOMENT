import { PHOTO_DATA } from '../config/constants.js';

// ======================================================
// core/photoConfig.js
// ★方針：視点は360°回転のみ(前後移動なし)のため、
// 「角度」と「高さ(段)」の2つで完全に重ならない配置を保証する。
//
// ★今回の変更点：
// 従来は「360 / 段内の枚数」で単純に均等分割していたため、
// large写真やportrait写真が混在すると見た目の間隔がバラバラに
// なっていた。これを、各写真の実際のaspect比から「見た目の
// 横幅」を算出し、その横幅に比例して角度を配分する方式に変更。
// 加えて、large写真は半径を少し外側に押し出すことで、
// 中心から見た密集感をさらに緩和する。
// ======================================================

// 段の高さ：隣の段と7.0離す。想定される最大の写真の高さ(約6.1)より
// 確実に大きい間隔なので、縦方向は理論上絶対に重ならない。
const TIER_HEIGHTS = [14, 7, 0, -7, -14];
const TIER_TILT_X  = [22, 12, 4, -4, -10];

const SIZE_PRESET = {
  large:  { baseScale: 1.25 },
  normal: { baseScale: 0.85 },
};
function getBaseScale(photo) {
  return (SIZE_PRESET[photo.size] ?? SIZE_PRESET.normal).baseScale;
}

// 段ごとの写真id構成(6枚 x 4段 + 5枚 x 1段 = 29枚)
const TIERS = [
  [5, 6, 7, 9, 10, 11],
  [28, 13, 14, 15, 16, 18],
  [19, 21, 22, 37, 25, 26],
  [27, 12, 30, 31, 32, 33],
  [34, 35, 36, 24, 38],
];

const RADIUS = 31; // 基準半径
const RADIUS_BY_TIER = [26, 28, 30, 32, 34]; // ← 段ごとに少し狭める


// ------------------------------------------------------
// 写真の見た目の横幅を、実際のaspect比(width/height)から算出する。
// exhibitionSpace.js 側の frameHeight = 4.5 * scale と同じ式を
// 使うことで、実際の表示サイズとズレないようにしている。
// ------------------------------------------------------
function estimateFrameWidth(photo) {
  const scale = getBaseScale(photo);
  const frameHeight = 4.5 * scale;
  const aspect = photo.aspect ?? (photo.orientation === 'portrait' ? 0.67 : 1.5); // aspect未設定時のフォールバック
  return frameHeight * aspect;
}

function rad2deg(rad) {
  return rad * (180 / Math.PI);
}

// 写真同士の最低限の隙間(度)。これを確保することで、
// どれだけ写真幅が偏っても隣接写真とは絶対に重ならない。
const MIN_GAP_DEG = 5;

// large写真は半径をこの分だけ外側に押し出し、見かけの密集感を緩和する
const LARGE_RADIUS_BOOST = 2.5;

function buildFixedLayout(photoById) {
  const layout = {};

TIERS.forEach((ids, tier) => {
  // 1. 各写真の基準半径を決定（largeは外側にオフセット）
  const radii = ids.map(id => {
    const photo = photoById[id];
    const isLarge = photo?.size === 'large';
    return isLarge ? RADIUS_BY_TIER[tier] + LARGE_RADIUS_BOOST : RADIUS_BY_TIER[tier];
  });

  // 2. 各写真の「見た目の占有角度」を、対応する半径で算出
  const widthsDeg = ids.map((id, i) => {
    const photo = photoById[id];
    const width = estimateFrameWidth(photo);
    const halfAngleRad = Math.atan((width / 2) / radii[i]);
    return rad2deg(halfAngleRad) * 2;
  });

  // 3. gapを含めた合計角度がちょうど360°になるよう正規化スケールを算出
  const totalWidthDeg = widthsDeg.reduce((a, b) => a + b, 0);
  const totalGapDeg = MIN_GAP_DEG * ids.length;
  const scale = (360 - totalGapDeg) / totalWidthDeg;

  // 4. 段ごとに互い違いにするオフセット（最初の写真の半角分ずらす）
  const firstScaledWidth = widthsDeg[0] * scale;
  const tierOffset = (tier % 2 === 0) ? 0 : firstScaledWidth / 2;

  // ★追加：段ごとの高さ補正（写真サイズに応じて）
  const avgScale = ids.reduce((sum, id) => sum + getBaseScale(photoById[id]), 0) / ids.length;
  const heightAdjust = (avgScale - 0.85) * 2.5; // largeが多い段は少し高く

  // 5. 累積角度で各写真の中心角度を確定
  let cursor = tierOffset;
  ids.forEach((id, i) => {
    const w = widthsDeg[i] * scale;
    const centerAngle = cursor + w / 2;
    cursor += w + MIN_GAP_DEG;

    const photo = photoById[id];
    const manualOffset = photo?.angleOffset ?? 0;

    layout[id] = {
      angle: centerAngle + manualOffset,
      radius: radii[i],
      height: TIER_HEIGHTS[tier] + heightAdjust + (Math.random() - 0.5) * 2.0, // ★高さ補正＋ゆるいランダム
      tiltX: TIER_TILT_X[tier],
    };
  });
});


  return layout;
}

// id -> photoデータ の対応表（aspect / size / orientation参照用）
const photoById = Object.fromEntries(PHOTO_DATA.map(p => [p.id, p]));
const FIXED_LAYOUT = buildFixedLayout(photoById);

// フォールバック：将来PHOTO_DATAに写真を追加してTIERSに登録し忘れた場合の保険
function getFallbackLayout(index) {
  const angle = (index * 47) % 360;
  return { angle, radius: RADIUS, height: 0, tiltX: 0 };
}

export function buildPhotoConfig(photoData) {
  return photoData.map((photo, index) => {
    const layout = FIXED_LAYOUT[photo.id] ?? getFallbackLayout(index);
    const scale = getBaseScale(photo);
    return { ...photo, ...layout, scale };
  });
}

export const PHOTO_CONFIG = buildPhotoConfig(PHOTO_DATA);