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
  { id: 5,  src: 'assets/photo5.jpg', type: 'normal', depth: null, interaction: null },
  { id: 6,  src: 'assets/photo6.JPG', type: 'normal', depth: null, interaction: null, size: 'large' },
  { id: 7,  src: 'assets/photo7.JPG', type: 'normal', depth: null, interaction: null },
  { id: 8,  src: 'assets/photo8.jpg', type: 'normal', depth: 0.6, interaction: null },
  { id: 9,  src: 'assets/photo9.jpg', type: 'normal', depth: null, interaction: null },
  { id: 10, src: 'assets/photo10.jpg', type: 'normal', depth: null, interaction: null },
  { id: 11, src: 'assets/photo11.JPG', type: 'normal', depth: null, interaction: null },
  { id: 12, src: 'assets/photo12.jpg', type: 'normal', depth: 0.4, interaction: null },
  { id: 13, src: 'assets/photo13.jpg', type: 'normal', depth: null, interaction: null },
  { id: 14, src: 'assets/photo14.JPEG', type: 'normal', depth: null, interaction: null },
  { id: 15, src: 'assets/photo15.jpg', type: 'normal', depth: null, interaction: null },
  { id: 16, src: 'assets/photo16.jpg', type: 'normal', depth: null, interaction: null, size: 'large' },
  { id: 17, src: 'assets/photo17.jpg', type: 'normal', depth: null, interaction: null },
  { id: 18, src: 'assets/photo18.jpg', type: 'normal', depth: null, interaction: null },
  { id: 19, src: 'assets/photo19.jpg', type: 'normal', depth: null, interaction: null },
  { id: 20, src: 'assets/photo20.jpg', type: 'normal', depth: 0.5, interaction: null },
  { id: 21, src: 'assets/photo21.jpg', type: 'normal', depth: null, interaction: null },
  { id: 22, src: 'assets/photo22.jpg', type: 'normal', depth: null, interaction: null },

  { id: 24, src: 'assets/photo24.JPG', type: 'normal', depth: null, interaction: null },
  { id: 25, src: 'assets/photo25.jpg', type: 'normal', depth: null, interaction: null },
  { id: 26, src: 'assets/photo26.jpg', type: 'letter', depth: null, interaction: 'glow', size: 'large' },
  { id: 27, src: 'assets/photo27.jpg', type: 'normal', depth: null, interaction: null },
  { id: 28, src: 'assets/photo28.JPG', type: 'normal', depth: 0.3, interaction: null },
  { id: 29, src: 'assets/photo29.JPG', type: 'normal', depth: null, interaction: null },
  { id: 30, src: 'assets/photo30.JPG', type: 'normal', depth: null, interaction: null, size: 'large' },
  { id: 31, src: 'assets/photo31.JPG', type: 'normal', depth: null, interaction: null },
  { id: 32, src: 'assets/photo32.jpg', type: 'normal', depth: null, interaction: null },
  { id: 33, src: 'assets/photo33.jpeg', type: 'normal', depth: null, interaction: null, size: 'large' },
  { id: 34, src: 'assets/photo34.JPG', type: 'normal', depth: 0.7, interaction: null },
  { id: 35, src: 'assets/photo35.jpg', type: 'normal', depth: null, interaction: null, size: 'large' },
  { id: 36, src: 'assets/photo36.jpg', type: 'normal', depth: null, interaction: null },
  { id: 37, src: 'assets/photo37.JPG', type: 'bubble', depth: null, interaction: 'glow', size: 'large' },
  { id: 38, src: 'assets/photo38.JPG', type: 'normal', depth: null, interaction: null },
];

export const GALLERY_RADIUS = 31;

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