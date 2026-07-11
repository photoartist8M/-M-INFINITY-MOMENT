// ======================================================
// Audio Manager
// ======================================================

export let bgmEnabled = true;

export const space2BGM = new Audio("./assets/bgm/space2.mp3");

space2BGM.preload = "auto";
space2BGM.loop = false;
space2BGM.volume = 0;

export function toggleBGM() {

    bgmEnabled = !bgmEnabled;

    if (!bgmEnabled) {

        space2BGM.pause();

    } else {

        if (space2BGM.currentTime > 0) {
            space2BGM.play().catch(()=>{});
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