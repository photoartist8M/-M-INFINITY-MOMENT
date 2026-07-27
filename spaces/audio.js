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
// 効果音（HTMLAudioElement）
// ======================================================

export const sakemeSFX   = new Audio("./assets/bgm/sakeme.mp3");
export const kirakiraSFX = new Audio("./assets/bgm/kirakira.mp3");

[sakemeSFX, kirakiraSFX].forEach(audio => {
  audio.preload = "auto";
  audio.loop = false;
});

sakemeSFX.volume = 0.85;
kirakiraSFX.volume = 0.7;

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
  audio.volume = targetVolume;
  setTimeout(() => {
audio.play().catch(() => {});
  }, 50);
}

export function stopSFX(audio) {
  audio.pause();
  audio.currentTime = 0;
  audio.volume = 0;
}

// ======================================================
// ユーティリティ
// ======================================================

export function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export async function stopSFXAsync(audio) {
  audio.pause();
  audio.currentTime = 0;
  audio.volume = 0;
  return delay(50);
}

// ======================================================
// Web Audio API（starSFX専用・iOS Safari対応）
// ======================================================

let _audioCtx = null;

function getAudioContext() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _audioCtx;
}

export async function loadSFXBuffer(url) {
  const ctx = getAudioContext();
  const res = await fetch(url);
  const arrayBuffer = await res.arrayBuffer();
  return ctx.decodeAudioData(arrayBuffer);
}

export function playSFXBuffer(buffer, volume = 1.0) {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  const source = ctx.createBufferSource();
  const gainNode = ctx.createGain();
  gainNode.gain.value = volume;
  source.buffer = buffer;
  source.connect(gainNode);
  gainNode.connect(ctx.destination);
  source.start(0);
  return source;
}

export function unlockAudioContext() {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') ctx.resume();
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

// ======================================================
// BGM再生
// ======================================================

export function playBGM(bgm, targetVolume = 0.4, fadeDuration = 2000) {
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