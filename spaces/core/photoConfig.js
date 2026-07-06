import { PHOTO_DATA, GALLERY_RADIUS } from '../config/constants.js';

// ======================================================================
// core/photoConfig.js
// 元ファイルの [SECTION: photoConfigBuilder] 〜 [SECTION: photoConfigBuilder end] をそのまま移動
// ======================================================================

// ------------------------------------------------------
// ② buildPhotoConfig()
// ------------------------------------------------------
// PHOTO_DATA（写真のメタ情報）を受け取り、配置計算した
// angle / radius / height / scale を追加したオブジェクト配列を返す。
// 計算ロジック自体は元のコードと完全に同一（挙動を変えないため）。
// ------------------------------------------------------
export function buildPhotoConfig(photoData) {
  const count = photoData.length;
  return photoData.map((photo, i) => {
    // 1. 角度のズレ（jitter）を完全にゼロにして、円周上の重なりを100%防ぐ
    const baseAngle = (360 / count) * i;
    const angle = baseAngle;

    // 2. 上下の配置を大きく散らす（偶数は上め、奇数は下めに配置。上段・下段の二段構成）
    const isEven = i % 2 === 0;
    const baseHeight = isEven ? 6.0 : -2.5;
    const height = baseHeight + (Math.random() - 0.5) * 2.5;

    // 3. サイズ（scale）の大小にメリハリをつける
    const scale = 0.85 + Math.random() * 0.75; // 0.85〜1.6倍の範囲でばらつかせる

    // 4. 前後の奥行き（半径）にも緩やかな変化をつける
    const radius = GALLERY_RADIUS + (Math.random() - 0.5) * 3;

    return { ...photo, angle, radius, height, scale };
  });
}

export const PHOTO_CONFIG = buildPhotoConfig(PHOTO_DATA);