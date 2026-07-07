import { canvas, ctx, drawLogo } from "./logoCanvas.js";

// ======================================================
// 画面全体を覆う爆発用オーバーレイcanvasを作成
// ======================================================
const overlay = document.createElement("canvas");
overlay.style.position = "fixed";
overlay.style.top = "0";
overlay.style.left = "0";
overlay.style.width = "100vw";
overlay.style.height = "100vh";
overlay.style.pointerEvents = "none";
overlay.style.zIndex = "50"; // ボタンより手前、infoPanelより奥
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

// canvas(logoCanvas)内のローカル座標→ビューポート座標に変換して取得
function getLogoParticlesInViewportSpace(sampleGap){
    const rect = canvas.getBoundingClientRect();
    const DPR = window.devicePixelRatio || 1;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pts = [];

    for(let y = 0; y < canvas.height; y += sampleGap * DPR){
        for(let x = 0; x < canvas.width; x += sampleGap * DPR){
            const idx = (Math.floor(y) * canvas.width + Math.floor(x)) * 4;
            if(imgData.data[idx + 3] > 128){
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
    const points = getLogoParticlesInViewportSpace(4);

    // 元のロゴを即座に消す(オーバーレイ側で描くため)
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles = points.map(p => {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.0 + Math.random() * 4.5; // 画面いっぱいに飛ぶよう速度UP

        return {
            x: p.x,
            y: p.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 0.6,
            life: 1.0,
            decay: 0.004 + Math.random() * 0.008,
            size: 1.2 + Math.random() * 1.8
        };
    });

    cancelAnimationFrame(logoRAF);
    animateParticles();
}

function animateParticles(){
    octx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    let alive = false;

    for(const p of particles){
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.life -= p.decay;

        if(p.life > 0){
            alive = true;
            octx.globalAlpha = p.life;
            octx.fillStyle = "#ffd27a";
            octx.beginPath();
            octx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            octx.fill();
        }
    }
    octx.globalAlpha = 1;

    if(alive){
        logoRAF = requestAnimationFrame(animateParticles);
    } else {
        onLogoDissolveComplete();
    }
}

function onLogoDissolveComplete(){
    const openingEl = document.getElementById("opening");

    openingEl.style.transition = "opacity 0.5s ease";
    openingEl.style.opacity = 0;

    octx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    setTimeout(() => {
        openingEl.style.display = "none";
        overlay.style.display = "none";
        // ここでmain.js側への画面遷移を行う（後日連携）
        // 例: location.href = "index.html";
    }, 500);
}

// ======================================================
// Start ボタン
// ======================================================
document.getElementById("startButton").addEventListener("click", () => {
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

infoButton.addEventListener("click", () => {
    infoPanel.classList.add("show");
});

closeInfo.addEventListener("click", () => {
    infoPanel.classList.remove("show");
});

// ======================================================
// 初期フェードイン開始
// ======================================================
document.body.classList.add("loaded");