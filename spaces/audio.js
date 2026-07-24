// ======================================================
// Audio Manager（スマホ安定版）
// ======================================================

export let bgmEnabled = true;
let fadeTimers = new Map();

// ======================================================
// BGM
// ======================================================

export const openingBGM = new Audio("./assets/bgm/opening.mp3");
export const mainBGM    = new Audio("./assets/bgm/main.mp3");
export const space2BGM  = new Audio("./assets/bgm/space2.mp3");

const ALL_BGMS = [openingBGM, mainBGM, space2BGM];

ALL_BGMS.forEach(audio => {
  audio.preload = "auto";
  audio.loop = true;
  audio.volume = 0;
});

export let currentBGM = openingBGM;

// ======================================================
// 効果音
// ======================================================

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

// ======================================================
// 効果音
// ======================================================

export function playSFX(audio) {
  audio.pause();
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

export function playSFXRobust(audio, targetVolume = 0.45) {

  audio.pause();
  audio.currentTime = 0;

  // 毎回必ず音量を戻す
  audio.volume = targetVolume;

  setTimeout(() => {
    audio.play().catch(err => {
      console.warn(err);
    });
  }, 50);
}

export function stopSFX(audio) {
  audio.pause();
  audio.currentTime = 0;
  audio.volume = 0;
}

// ======================================================
// フェード
// ======================================================

export function fadeVolume(audio, targetVolume, duration = 3000) {

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

    audio.volume =
      startVolume +
      (targetVolume - startVolume) * progress;

    audio.volume = Math.max(0, Math.min(1, audio.volume));

    if (progress < 1) {
      animationId = requestAnimationFrame(update);
    } else {
      fadeTimers.delete(audio);
    }
  }

  animationId = requestAnimationFrame(update);

  fadeTimers.set(audio, {
    id: animationId
  });
}

// ======================================================
// BGM再生
// ======================================================

export function playBGM(
  bgm,
  targetVolume = 0.4,
  fadeDuration = 2000
) {

  if (!bgmEnabled) {
    currentBGM = bgm;
    return;
  }

  const previousBGM = currentBGM;

  currentBGM = bgm;

  if (previousBGM && previousBGM !== bgm) {

    fadeVolume(previousBGM, 0, 600);

    setTimeout(() => {
      previousBGM.pause();
      previousBGM.currentTime = 0;
      previousBGM.volume = 0;
    }, 650);
  }

  bgm.pause();
  bgm.currentTime = 0;
  bgm.volume = 0;
  bgm.loop = true;

  bgm.play()
    .then(() => {
      fadeVolume(bgm, targetVolume, fadeDuration);
    })
    .catch(err => {
      console.warn("BGM再生失敗:", err);
    });
}

// ======================================================
// 現在のBGMを停止
// ======================================================

export function stopCurrentBGM(fadeDuration = 1500) {

  if (!currentBGM) return;

  const bgm = currentBGM;

  fadeVolume(bgm, 0, fadeDuration);

  setTimeout(() => {
    bgm.pause();
    bgm.currentTime = 0;
    bgm.volume = 0;
  }, fadeDuration);
}

// ======================================================
// ON/OFF
// ======================================================

export function toggleBGM() {

  bgmEnabled = !bgmEnabled;

  if (!bgmEnabled) {

    ALL_BGMS.forEach(audio => {
      audio.pause();
      audio.volume = 0;
    });

  } else {

    if (currentBGM) {

      currentBGM.play().catch(() => {});
      fadeVolume(currentBGM, 0.4, 500);

    }

  }

  return bgmEnabled;
}