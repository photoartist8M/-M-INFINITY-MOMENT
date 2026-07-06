// ======================================================================
// config/constants.js
// 元ファイルの [SECTION: config] 〜 [SECTION: config end] をそのまま移動
// ======================================================================

// ------------------------------------------------------
// 写真データ（旧 PHOTO_SOURCES から拡張）
// ------------------------------------------------------
// ★変更点①：単なるURL配列だったものを、id / type / depth / interaction を
//   持てるオブジェクト配列へ変更。まだ type は "normal" 固定、
//   depth / interaction は未使用（null）。
//   将来のデプスマップ写真・メッセージ機能追加時に、この配列へ
//   値を足していくだけで対応できるようにするための土台。
// ------------------------------------------------------
export const PHOTO_DATA = [
  { id: 0,  src: '../assets/photo.jpg',   type: 'normal', depth: null, interaction: null },
  { id: 1,  src: '../assets/photo1.jpg',  type: 'normal', depth: null, interaction: null },
  { id: 2,  src: '../assets/photo2.jpg',  type: 'normal', depth: null, interaction: null },
  { id: 3,  src: '../assets/photo4.jpg',  type: 'normal', depth: null, interaction: null },
  { id: 4,  src: '../assets/photo5.jpg',  type: 'normal', depth: null, interaction: null },
  { id: 5,  src: '../assets/photo6.jpg',  type: 'normal', depth: null, interaction: null },
  { id: 6,  src: '../assets/photo7.jpg',  type: 'normal', depth: null, interaction: null },
  { id: 7,  src: '../assets/photo8.jpg',  type: 'normal', depth: null, interaction: null },
  { id: 8,  src: '../assets/photo9.jpg',  type: 'normal', depth: null, interaction: null },
  { id: 9,  src: '../assets/photo15.jpg', type: 'normal', depth: null, interaction: null },
  { id: 10, src: '../assets/photo12.jpg', type: 'normal', depth: null, interaction: null },
  { id: 11, src: '../assets/photo13.jpg', type: 'normal', depth: null, interaction: null },
  { id: 12, src: '../assets/photo15.jpg', type: 'normal', depth: null, interaction: null },
  { id: 13, src: '../assets/photo19.jpg', type: 'normal', depth: null, interaction: null },
  { id: 14, src: '../assets/photo20.jpg', type: 'normal', depth: null, interaction: null },
  { id: 15, src: '../assets/photo21.jpg', type: 'normal', depth: null, interaction: null },
];

export const GALLERY_RADIUS = 21;

// ------------------------------------------------------
// モバイル判定・テクスチャサイズ上限
// ------------------------------------------------------
export const IS_MOBILE = window.innerWidth <= 768 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
export const MAX_TEX_DIM = IS_MOBILE ? 900 : 2000;

export const SPARKLE_COUNT = 260;

// ------------------------------------------------------
// ⑥ 品質設定オブジェクト（追加・未使用）
// ------------------------------------------------------
export const QUALITY = {
  photoMaxTexture: 2000,
  particleCount: 260,
  bloom: true,
};