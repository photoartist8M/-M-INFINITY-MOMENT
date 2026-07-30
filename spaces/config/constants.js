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
// ★変更点②：各写真に aspect（width / height の実測値）を追加。
//   photoConfig.js の角度配置計算で、写真の見た目の横幅を正確に
//   算出するために使用する。値が不明な場合は下記のように
//   orientationごとの一般的な目安値を仮置きしている。
//   正確な値が分かり次第、該当行の aspect だけ書き換えればよい。
// ------------------------------------------------------
export const PHOTO_DATA = [
  { id: 5,  src: 'assets/photo5.jpg', type: 'normal', depth: null, interaction: null, orientation: 'landscape', aspect: 1.50, angleOffset: -3 },
  { id: 6,  src: 'assets/photo6.JPG', type: 'normal', depth: null, interaction: null, size: 'large', orientation: 'landscape', aspect: 1.50, angleOffset: -2 },
  { id: 7,  src: 'assets/photo7.JPG', type: 'normal', depth: null, interaction: null, orientation: 'landscape', aspect: 1.50, angleOffset: 20 },
  //{ id: 8, src: 'assets/photo8.jpg', type: 'normal', depth: null, interaction: null, orientation: 'landscape', aspect: 1.50 , angleOffset: 0},
  { id: 9,  src: 'assets/photo9.jpg', type: 'normal', depth: null, interaction: null, orientation: 'landscape', aspect: 1.50 , angleOffset: 0},
  { id: 10, src: 'assets/photo10.jpg', type: 'normal', depth: null, interaction: null, orientation: 'landscape', aspect: 1.50 , angleOffset: 0},
  { id: 11, src: 'assets/photo11.JPG', type: 'normal', depth: null, interaction: null, orientation: 'landscape', aspect: 1.50 , angleOffset: 0},
  { id: 12, src: 'assets/photo12.jpg', type: 'normal', depth: 0.4, interaction: null, orientation: 'landscape', aspect: 1.50 , angleOffset: -2},
  { id: 13, src: 'assets/photo13.jpg', type: 'normal', depth: null, interaction: null, orientation: 'portrait', aspect: 0.67 , angleOffset: 0},
  { id: 14, src: 'assets/photo14.JPEG', type: 'normal', depth: null, interaction: null, orientation: 'landscape', aspect: 1.50 , angleOffset: 0},
  { id: 15, src: 'assets/photo15.jpg', type: 'normal', depth: null, interaction: null, orientation: 'landscape', aspect: 1.50 , angleOffset: 0},
  { id: 16, src: 'assets/photo16.jpg', type: 'normal', depth: null, interaction: null, size: 'large',scaleBoost: 1.5, orientation: 'landscape', aspect: 1.5 , angleOffset: -18,heightOffset: +3},
  { id: 18, src: 'assets/photo18.jpg', type: 'normal', depth: null, interaction: null, orientation: 'portrait', aspect: 0.67 , angleOffset: 0},
  { id: 19, src: 'assets/photo19.jpg', type: 'normal', depth: null, interaction: null, orientation: 'landscape', aspect: 1.5 , angleOffset: 15,heightOffset: -5},
  { id: 21, src: 'assets/photo21.jpg', type: 'normal', depth: null, interaction: null, orientation: 'landscape', aspect: 1.50 , angleOffset: 0},
  { id: 22, src: 'assets/photo22.jpg', type: 'normal', depth: null, interaction: null, orientation: 'landscape', aspect: 1.50 , angleOffset: +15},
  //{ id: 23, src: 'assets/photo23.jpg', type: 'normal', depth: null, interaction: null, orientation: 'landscape', aspect: 1.50 , angleOffset: 0},
  { id: 24, src: 'assets/photo24.JPG', type: 'normal', depth: null, interaction: null, orientation: 'landscape', aspect: 1.50 , angleOffset: -18},
  { id: 25, src: 'assets/photo25.jpg', type: 'normal', depth: null, interaction: null, orientation: 'landscape', aspect: 1.50 , angleOffset: 0},
  { id: 26, src: 'assets/photo26.jpg', type: 'letter', depth: null, interaction: 'glow', size: 'large', orientation: 'landscape', aspect: 1.50, angleOffset: 0 },
  { id: 27, src: 'assets/photo27.jpg', type: 'normal', depth: null, interaction: null, size: 'large',orientation: 'landscape', aspect: 1.50 , angleOffset: 0},
  { id: 28, src: 'assets/photo28.JPG', type: 'normal', depth: 0.3, interaction: null, orientation: 'portrait', aspect: 0.67 , angleOffset: 0,heightOffset: +10},
  { id: 30, src: 'assets/photo30.JPG', type: 'normal', depth: null, interaction: null, size: 'large', orientation: 'landscape', aspect: 1.50 , angleOffset: 0},
  { id: 31, src: 'assets/photo31.JPG', type: 'normal', depth: null, interaction: null, orientation: 'portrait', aspect: 0.67 , angleOffset: -5,heightOffset: +20},
  { id: 32, src: 'assets/photo32.jpg', type: 'normal', depth: null, interaction: null, orientation: 'landscape', aspect: 1.50 , angleOffset: 0},
  { id: 33, src: 'assets/photo33.jpeg', type: 'normal', depth: null, interaction: null, size: 'large', orientation: 'landscape', aspect: 1.50 , angleOffset: +18},
  { id: 34, src: 'assets/photo34.JPG', type: 'normal', depth: 0.7, interaction: null, orientation: 'portrait', aspect: 0.67 , angleOffset: 0},
  { id: 35, src: 'assets/photo35.jpg', type: 'normal', depth: null, interaction: null, size: 'large', orientation: 'landscape', aspect: 1.50 , angleOffset: +3},
  { id: 36, src: 'assets/photo36.jpg', type: 'normal', depth: null, interaction: null, orientation: 'portrait', aspect: 0.67 , angleOffset: -15},
  { id: 37, src: 'assets/photo37.JPG', type: 'bubble', depth: null, interaction: 'glow', size: 'large', orientation: 'landscape', aspect: 1.50 , angleOffset: +18},
  { id: 38, src: 'assets/photo38.JPG', type: 'normal', depth: null, interaction: null, orientation: 'landscape', aspect: 1.50 , angleOffset: +10},
];

export const GALLERY_RADIUS = 28;

// ------------------------------------------------------
// モバイル判定・テクスチャサイズ上限
// ------------------------------------------------------
export const IS_MOBILE = window.innerWidth <= 768 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
export const MAX_TEX_DIM = IS_MOBILE ? 900 : 2000;

export const SPARKLE_COUNT = 260;

// ------------------------------------------------------
// 写真読み込みの安定性調整（追加）
// ------------------------------------------------------
// スマホの低速回線・低スペック端末では、全30枚近くを一斉に
// 読み込むとタイムアウトが発生しやすく、写真が欠けて表示される
// 原因になっていた。以下は「演出・見た目」ではなく「読み込みの
// 粘り強さ」だけを調整するための設定値。
// ------------------------------------------------------
export const PHOTO_LOAD_TIMEOUT_MS = IS_MOBILE ? 18000 : 10000;
export const PHOTO_LOAD_MAX_RETRIES = IS_MOBILE ? 2 : 1;
export const PHOTO_LOAD_RETRY_DELAY_MS = 900;
export const PHOTO_LOAD_CONCURRENCY = IS_MOBILE ? 4 : Infinity;
// 全体のうちこの割合以上が最終的に読み込み失敗した場合のみ、
// 「お使いの機種では対応しておりません」的な注意書きを表示する
// 例: 30枚中 10枚前後しか表示されない（≒65%以上が失敗）ような
// 深刻なケースだけ表示したいので、やや高めに設定している。
export const PHOTO_LOAD_FAILURE_NOTICE_RATIO = 0.6;

// ------------------------------------------------------
// ⑥ 品質設定オブジェクト（追加・未使用）
// ------------------------------------------------------
export const QUALITY = {
  photoMaxTexture: 2000,
  particleCount: 260,
  bloom: true,
};