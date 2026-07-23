// ======================================================
// Audio Manager
// 全BGMを最初から再生開始、音量制御のみでシーン切り替え
// ======================================================

export let bgmEnabled = true;

// BGM
export const openingBGM = new Audio("./assets/bgm/opening.mp3");
export const mainBGM    = new Audio("./assets/bgm/main.mp3");
export const starBGM    = new Audio("./assets/bgm/star.mp3");
export const space2BGM  = new Audio("./assets/bgm/space2.mp3");

const ALL_BGMS = [openingBGM, mainBGM, starBGM, space2BGM];

ALL_BGMS.forEach(audio => {
  audio.preload = "auto";
  audio.loop = true;
  audio.volume = 0;
});

// 効果音（変更なし）
export const sakemeSFX   = new Audio("./assets/bgm/sakeme.mp3");
export const kirakiraSFX = new Audio("./assets/bgm/kirakira.mp3");
sakemeSFX.preload = "auto";
kirakiraSFX.preload = "auto";
sakemeSFX.volume = 0.85;
kirakiraSFX.volume = 0.7;

// 効果音再生（変更なし）
export function playSFX(audio) {
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

// ★音量フェード（新規・修正版）
export function fadeVolume(audio, targetVolume, duration = 3000) {
  const startVolume = audio.volume;
  const start = performance.now();

  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // ★修正：音量を0〜1の範囲にクランプ
    audio.volume = Math.max(0, Math.min(1, startVolume + (targetVolume - startVolume) * progress));

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

// ★全BGM再生開始（修正版）
export function startAllBGMs() {
  ALL_BGMS.forEach(audio => {
    audio.currentTime = 0;
    audio.loop = true;
    audio.volume = 0;
    audio.play().catch(() => {});
    // play() 直後に再度設定（二重保険）
    setTimeout(() => {
      audio.volume = 0;
    }, 1);  // ← 10ms後に確実にセット
  });
}

// ON/OFF切り替え
export function toggleBGM() {
  bgmEnabled = !bgmEnabled;

  if (!bgmEnabled) {
    ALL_BGMS.forEach(a => a.volume = 0);
  }

  return bgmEnabled;
}