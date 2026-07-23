// ======================================================
// Audio Manager（改善版）
// fadeVolume に中断機能を追加＆BGM切り替え完全管理
// ======================================================

export let bgmEnabled = true;
export let currentBGM = null;
let fadeTimers = new Map(); // フェード中のアニメーションを追跡

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
});
sakemeSFX.volume = 0.85;
kirakiraSFX.volume = 0.7;
starSFX.volume = 0.45;

// 効果音再生
export function playSFX(audio) {
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

// ★改善：フェード中断機能付き
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

// ★改善：BGM切り替え完全管理版
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
      if (currentBGM && currentBGM !== bgm) { // ★ダブルチェック
        currentBGM.pause();
        currentBGM.currentTime = 0;
      }
    }, 600); // フェード時間 + 少し余裕
  }

  // 新しいBGMを再生
  currentBGM = bgm;
  bgm.currentTime = 0;
  bgm.loop = true;
  bgm.play()
    .then(() => {
      // 再生成功後にフェードイン
      fadeVolume(bgm, targetVolume, fadeDuration);
    })
    .catch((err) => {
      console.warn("BGM再生失敗:", err);
    });
}

// ★改善：ON/OFF時に実行中のアニメーションをキャンセル
export function toggleBGM() {
  bgmEnabled = !bgmEnabled;

  if (!bgmEnabled) {
    // OFF：全BGMをフェードアウト＆停止
    ALL_BGMS.forEach(audio => {
      fadeVolume(audio, 0, 300);
    });
    setTimeout(() => {
      ALL_BGMS.forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
      });
    }, 400);
  } else {
    // ON：現在のアクティブなBGMを復元
    if (currentBGM) {
      // まず再生確保
      currentBGM.play().catch(() => {});
      fadeVolume(currentBGM, 0.4, 500);
    }
  }

  return bgmEnabled;
}

// ★新機能：BGM停止（フェードアウト付き）
export function stopBGM(duration = 1000) {
  if (currentBGM) {
    fadeVolume(currentBGM, 0, duration);
    setTimeout(() => {
      if (currentBGM) {
        currentBGM.pause();
        currentBGM.currentTime = 0;
      }
    }, duration + 100);
  }
}