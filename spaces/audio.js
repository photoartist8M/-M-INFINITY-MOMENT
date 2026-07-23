// ======================================================
// Audio Manager（スマホ安定版）
// ======================================================

export let bgmEnabled = true;
export let currentBGM = null;
let fadeTimers = new Map();

// BGM
export const openingBGM = new Audio("./assets/bgm/opening.mp3");
export const mainBGM    = new Audio("./assets/bgm/main.mp3");
export const space2BGM  = new Audio("./assets/bgm/space2.mp3");

const ALL_BGMS = [openingBGM, mainBGM, space2BGM];

ALL_BGMS.forEach(audio => {
  audio.preload = "auto";
  audio.loop = true;
  audio.volume = 0;
});

// 効果音
export const sakemeSFX   = new Audio("./assets/bgm/sakeme.mp3");
export const kirakiraSFX = new Audio("./assets/bgm/kirakira.mp3");
export const starSFX     = new Audio("./assets/bgm/star.mp3");

[sakemeSFX, kirakiraSFX, starSFX].forEach(audio => {
  audio.preload = "auto";
  audio.loop = false;
});

sakemeSFX.volume = 0.85;
kirakiraSFX.volume = 0.7;
starSFX.volume = 0.45;

// 効果音再生（基本版）
export function playSFX(audio) {
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

// ★新機能：効果音再生（スマホ安定版・遅延付き）
export function playSFXRobust(audio, targetVolume = 0.45) {
  // 必ず停止してからリセット
  audio.pause();
  audio.currentTime = 0;
  audio.volume = targetVolume;
  
  // 少し待ってから再生（スマホの初期化待ち）
  setTimeout(() => {
    audio.play().catch(err => {
      console.warn("SFX再生失敗:", err);
    });
  }, 50);
}

// ★新機能：効果音停止（安定版）
export function stopSFX(audio) {
  audio.pause();
  audio.currentTime = 0;
  audio.volume = 0;
}

// 音量フェード
export function fadeVolume(audio, targetVolume, duration = 3000) {
  // 既存のフェードがあればキャンセル
  if (fadeTimers.has(audio)) {
    cancelAnimationFrame(fadeTimers.get(audio).id);
    fadeTimers.delete(audio);
  }

  const startVolume = audio.volume;
  const start = performance.now();
  let animationId;

  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    audio.volume = Math.max(0, Math.min(1, 
      startVolume + (targetVolume - startVolume) * progress
    ));

    if (progress < 1) {
      animationId = requestAnimationFrame(update);
    } else {
      fadeTimers.delete(audio);
    }
  }

  animationId = requestAnimationFrame(update);
  fadeTimers.set(audio, { id: animationId });
}

// BGM再生
export function playBGM(bgm, targetVolume = 0.4, fadeDuration = 2000) {
  // BGMが無効なら何もしない
  if (!bgmEnabled) {
    if (currentBGM && currentBGM !== bgm) {
      currentBGM.pause();
      currentBGM.currentTime = 0;
    }
    currentBGM = bgm;
    return;
  }

  // 前のBGMをフェードアウト＆完全停止
  if (currentBGM && currentBGM !== bgm) {
    fadeVolume(currentBGM, 0, 500);
    setTimeout(() => {
      if (currentBGM && currentBGM !== bgm) {
        currentBGM.pause();
        currentBGM.currentTime = 0;
      }
    }, 600);
  }

  // 新しいBGMを再生
  currentBGM = bgm;
  bgm.currentTime = 0;
  bgm.loop = true;
  bgm.play()
    .then(() => {
      fadeVolume(bgm, targetVolume, fadeDuration);
    })
    .catch((err) => {
      console.warn("BGM再生失敗:", err);
    });
}

// ON/OFF切り替え
export function toggleBGM() {
  bgmEnabled = !bgmEnabled;

  if (!bgmEnabled) {
    ALL_BGMS.forEach(a => a.volume = 0);
  } else {
    if (currentBGM) {
      currentBGM.play().catch(() => {});
      fadeVolume(currentBGM, 0.4, 500);
    }
  }

  return bgmEnabled;
}