// ======================================================
// Audio Manager
// ======================================================

export let bgmEnabled = true;

// ------------------------------------------------------
// シーンごとのBGM(3曲)
// ------------------------------------------------------
export const openingBGM = new Audio("./assets/bgm/opening.mp3"); // ①UI用(桜の記憶)
export const mainBGM    = new Audio("./assets/bgm/main.mp3");    // ②裂け目/メイン空間用(淡い記憶)
export const space2BGM  = new Audio("./assets/bgm/space2.mp3");  // ③展示空間用(宇宙でうたたね)

[openingBGM, mainBGM, space2BGM].forEach(audio => {
  audio.preload = "auto";
  audio.loop = true; // ★追加：どのシーンも滞在中はループ再生
  audio.volume = 0;
});

// 現在再生中のBGMを覚えておく(クロスフェード時に使う)
let currentBGM = null;

export function toggleBGM() {

    bgmEnabled = !bgmEnabled;

    if (!bgmEnabled) {

        [openingBGM, mainBGM, space2BGM].forEach(a => a.pause());

    } else {

        if (currentBGM && currentBGM.currentTime > 0) {
            currentBGM.play().catch(()=>{});
        }

    }

    return bgmEnabled;

}

export function fadeIn(audio, target = 0.4, duration = 4000){

    if(!bgmEnabled) return;

    audio.volume = 0;
    audio.play().catch(()=>{});

    const start = performance.now();

    function update(now){

        const t = Math.min((now-start)/duration,1);

        audio.volume = target*t;

        if(t<1){
            requestAnimationFrame(update);
        }

    }

    requestAnimationFrame(update);

}

export function fadeOut(audio,duration=5000){

    const startVolume = audio.volume;
    const start = performance.now();

    function update(now){

        const t = Math.min((now-start)/duration,1);

        audio.volume = startVolume*(1-t);

        if(t<1){

            requestAnimationFrame(update);

        }else{

            audio.pause();
            audio.currentTime=0;

        }

    }

    requestAnimationFrame(update);

}

// ------------------------------------------------------
// ★追加：シーン切り替え用のクロスフェード関数
// ------------------------------------------------------
// name: 'opening' | 'main' | 'space2'
// 呼ぶだけで「今流れている曲をフェードアウトしつつ、
// 指定したシーンの曲をフェードインする」処理をまとめて行う。
// ------------------------------------------------------
const SCENE_TRACKS = {
  opening: openingBGM,
  main: mainBGM,
  space2: space2BGM,
};

export function playScene(name, { target = 0.4, fadeInDuration = 4000, fadeOutDuration = 3000 } = {}) {
  const nextBGM = SCENE_TRACKS[name];
  if (!nextBGM) {
    console.warn(`playScene: 不明なシーン名です: ${name}`);
    return;
  }

  if (currentBGM === nextBGM) return; // 既に同じ曲が流れていれば何もしない

  if (currentBGM) {
    fadeOut(currentBGM, fadeOutDuration);
  }

  currentBGM = nextBGM;

  if (bgmEnabled) {
    fadeIn(nextBGM, target, fadeInDuration);
  }
}