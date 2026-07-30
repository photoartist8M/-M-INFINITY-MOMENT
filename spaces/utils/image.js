// ======================================================================
// utils/image.js
// 元ファイルの [SECTION: imageUtils] 〜 [SECTION: imageUtils end] をそのまま移動
// ======================================================================

// ------------------------------------------------------
// 画像を安全に読み込むユーティリティ
// ------------------------------------------------------
// onerror・タイムアウトが一切なかったため、画像が1枚でも
// 読み込みに失敗すると静かに「読み込み中」のまま止まっていた。
// 失敗・タイムアウト時は必ずコールバックし、他の写真の処理を
// ブロックしないようにする。
// ------------------------------------------------------
export function loadImageSafely(src, { onSuccess, onFail, timeoutMs = 10000 }) {
  const img = new Image();
  let settled = false;

  const failTimeoutId = setTimeout(() => {
    if (settled) return;
    settled = true;
    console.warn(`[exhibition] 画像の読み込みがタイムアウトしました: ${src}`);
    onFail && onFail();
  }, timeoutMs);

  img.onerror = () => {
    if (settled) return;
    settled = true;
    clearTimeout(failTimeoutId);
    console.error(`[exhibition] 画像の読み込みに失敗しました: ${src}`);
    onFail && onFail();
  };

  img.onload = () => {
    if (settled) return;

    if (!img.naturalWidth || !img.naturalHeight) {
      settled = true;
      clearTimeout(failTimeoutId);
      console.error(`[exhibition] 画像が壊れています: ${src}`);
      onFail && onFail();
      return;
    }

    settled = true;
    clearTimeout(failTimeoutId);
    onSuccess && onSuccess(img);
  };

  img.src = src;
  return img;
}

// ------------------------------------------------------
// テクスチャ用に必要であれば縮小したソースを返す
// ------------------------------------------------------
// モバイルでのGPUメモリ不足によるWebGLコンテキストロスト
// （全画像が突然表示されなくなる現象）を防ぐため、上限を超える
// 画像はCanvasで縮小してからテクスチャ化する。
// ------------------------------------------------------
export function getTextureSource(img, maxDim) {
  const longSide = Math.max(img.width, img.height);
  if (longSide <= maxDim) return img;

  const scale = maxDim / longSide;
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  const cctx = c.getContext('2d');
  cctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

// ------------------------------------------------------
// 失敗時に自動リトライしてから読み込む（追加・既存の
// loadImageSafely自体の挙動は一切変更しない）
// ------------------------------------------------------
// スマホ回線・低速環境での「タイムアウト＝即失敗」を防ぐため、
// 一定回数までは間隔を空けて再取得を試みてから onFail を呼ぶ。
// 呼び出し側から見た挙動（onSuccess / onFail が最終的に一度だけ
// 呼ばれる）は loadImageSafely と同じなので、既存の見た目・
// 演出には影響しない。
// ------------------------------------------------------
export function loadImageWithRetry(src, { onSuccess, onFail, timeoutMs = 10000, maxRetries = 0, retryDelayMs = 800 } = {}) {
  let attempt = 0;

  function attemptLoad() {
    loadImageSafely(src, {
      timeoutMs,
      onSuccess,
      onFail: () => {
        if (attempt < maxRetries) {
          attempt++;
          console.warn(`[exhibition] 再試行します (${attempt}/${maxRetries}): ${src}`);
          setTimeout(attemptLoad, retryDelayMs * attempt);
        } else {
          onFail && onFail();
        }
      },
    });
  }

  attemptLoad();
}