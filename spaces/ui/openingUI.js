import { canvas, ctx, drawLogo, stopLogoAnimation } from "./logoCanvas.js";
import { disposeFlareBackground } from "./flareBackground.js";
import { disposeClockButton } from "./clockButton.js";

// ======================================================
// 画面全体を覆う爆発用オーバーレイcanvas
// ======================================================
const overlay = document.createElement("canvas");
overlay.style.position = "fixed";
overlay.style.top = "0";
overlay.style.left = "0";
overlay.style.width = "100vw";
overlay.style.height = "100vh";
overlay.style.pointerEvents = "none";
overlay.style.zIndex = "50";
document.body.appendChild(overlay);

const octx = overlay.getContext("2d");
const ODPR = window.devicePixelRatio || 1;

function resizeOverlay(){
    overlay.width = window.innerWidth * ODPR;
    overlay.height = window.innerHeight * ODPR;
    overlay.style.width = window.innerWidth + "px";
    overlay.style.height = window.innerHeight + "px";
    octx.setTransform(ODPR, 0, 0, ODPR, 0, 0);
}
resizeOverlay();
window.addEventListener("resize", resizeOverlay);

// ======================================================
// ロゴ崩壊用パーティクル
// ======================================================
let particles = [];
let logoRAF;

const TITLE_PARTICLE_PALETTE = [
    "255,224,179",
    "251,240,219",
    "255,248,240",
];

const GLOW_SPRITE_SIZE = 32;
const glowSprites = {};

TITLE_PARTICLE_PALETTE.forEach(color => {
    const spriteCanvas = document.createElement("canvas");
    spriteCanvas.width = GLOW_SPRITE_SIZE;
    spriteCanvas.height = GLOW_SPRITE_SIZE;
    const sctx = spriteCanvas.getContext("2d");

    const half = GLOW_SPRITE_SIZE / 2;
    const gradient = sctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0.0, `rgba(${color},1)`);
    gradient.addColorStop(0.4, `rgba(${color},0.5)`);
    gradient.addColorStop(1.0, `rgba(${color},0)`);

    sctx.fillStyle = gradient;
    sctx.fillRect(0, 0, GLOW_SPRITE_SIZE, GLOW_SPRITE_SIZE);

    glowSprites[color] = spriteCanvas;
});

function getLogoParticlesInViewportSpace(sampleGap){
    const rect = canvas.getBoundingClientRect();
    const DPR = window.devicePixelRatio || 1;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pts = [];

    for(let y = 0; y < canvas.height; y += sampleGap * DPR){
        for(let x = 0; x < canvas.width; x += sampleGap * DPR){
            const idx = (Math.floor(y) * canvas.width + Math.floor(x)) * 4;
            if(imgData.data[idx + 3] > 40){
                pts.push({
                    x: rect.left + x / DPR,
                    y: rect.top + y / DPR
                });
            }
        }
    }
    return pts;
}

function explodeLogo(){
    stopLogoAnimation();

    const points = getLogoParticlesInViewportSpace(2);
    console.log(points.length);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const titleJapanese = document.querySelector(".titleJapanese");
    const clockButtonWrap = document.getElementById("clockButtonWrap");
    const bottomBar = document.querySelector(".bottomBar");

    [titleJapanese, clockButtonWrap, bottomBar].forEach(el => {
        if(el){
            el.style.transition = "opacity 0.4s ease";
            el.style.opacity = "0";
        }
    });
    particles = points.map(p => {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 6.5;
        const color = TITLE_PARTICLE_PALETTE[Math.floor(Math.random() * TITLE_PARTICLE_PALETTE.length)];

        return {
            x: p.x,
            y: p.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 0.8,
            life: 1.0,
            decay: 0.008 + Math.random() * 0.0012,
            size: 1.3 + Math.random() * 2.0,
            color: color
        };
    });

    cancelAnimationFrame(logoRAF);
    animateParticles();
}

let mainSceneStarted = false;

function animateParticles(){
    octx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    let alive = false;
    let maxLife = 0;

    octx.globalCompositeOperation = "lighter";

    for(const p of particles){
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.life -= p.decay;

        if(p.life > 0){
            alive = true;
            if(p.life > maxLife) maxLife = p.life;

            octx.globalAlpha = p.life;

            const glowSize = p.size * 3;
            const sprite = glowSprites[p.color];

            octx.drawImage(
                sprite,
                p.x - glowSize,
                p.y - glowSize,
                glowSize * 2,
                glowSize * 2
            );
        }
    }
    octx.globalAlpha = 1;
    octx.globalCompositeOperation = "source-over";

    if(maxLife < 0.6 && !mainSceneStarted){
        mainSceneStarted = true;
        preloadMainScene();
    }

    if(alive){
        logoRAF = requestAnimationFrame(animateParticles);
    } else {
        onLogoDissolveComplete();
    }
}

function onLogoDissolveComplete(){
    if(!mainSceneStarted){
        mainSceneStarted = true;
        preloadMainScene();
    }

    const openingEl = document.getElementById("opening");
    openingEl.style.transition = "opacity 0.3s ease";
    openingEl.style.opacity = 0;

    setTimeout(() => {
        disposeOpeningScene();
    }, 300);
}

async function preloadMainScene(){
    const mainCanvas = document.getElementById("canvas");
    mainCanvas.style.opacity = "0";
    mainCanvas.style.transition = "opacity 1.6s ease";
    mainCanvas.style.display = "block";

    await import("../../main.js");

    requestAnimationFrame(() => {
        mainCanvas.style.opacity = "1";
    });
}

function disposeOpeningScene(){
    cancelAnimationFrame(logoRAF);
    stopLogoAnimation();
    disposeFlareBackground();
    disposeClockButton();
    particles = [];
    window.removeEventListener("resize", resizeOverlay);

    const openingEl = document.getElementById("opening");
    if(openingEl) openingEl.remove();

    if(overlay) overlay.remove();

    const infoPanel = document.getElementById("infoPanel");
    if(infoPanel) infoPanel.remove();

    console.log("オープニング演出を破棄しました(メモリ解放完了)");
}

// ======================================================
// Start ボタン
// ======================================================
document.getElementById("startButton").addEventListener("click", () => {
    if (navigator.vibrate) {
        navigator.vibrate(12);
    }
    explodeLogo();
});

// ======================================================
// BGM ボタン(トグル)
// ======================================================
const bgmButton = document.getElementById("bgmButton");
let bgmOn = true;
bgmButton.addEventListener("click", () => {
    bgmOn = !bgmOn;
    bgmButton.textContent = bgmOn ? "♪ BGM ON" : "♪ BGM OFF";
});

// ======================================================
// Information パネル 開閉
// ======================================================
const infoButton = document.getElementById("infoButton");
const infoPanel = document.getElementById("infoPanel");
const closeInfo = document.getElementById("closeInfo");
infoButton.addEventListener("click", () => infoPanel.classList.add("show"));
closeInfo.addEventListener("click", () => infoPanel.classList.remove("show"));

// ======================================================
// 初期フェードイン開始
// ======================================================
document.body.classList.add("loaded");