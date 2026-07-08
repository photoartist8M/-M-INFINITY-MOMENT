// ======================================================
// タイトル背景演出：本格レンズフレア + 端末チルトによる視差ゆらぎ
// ------------------------------------------------------
// ・Three.js未読み込みのオープニング画面でも軽量に動作するよう、
//   Canvas2Dのみで複数の光の要素(コア・ハロー・ゴースト)を描画する。
// ・スマホの傾き(DeviceOrientation)をなめらかに追従させ、
//   奥行きのある視差(パララックス)ゆらぎを演出する。
// ======================================================

const canvas = document.getElementById("flareCanvas");
const ctx = canvas.getContext("2d");
const DPR = Math.min(window.devicePixelRatio || 1, 1.5); // 高DPR端末での過剰負荷を抑制

let w = 0, h = 0;

function resizeFlareCanvas(){
    const rect = canvas.getBoundingClientRect();
    w = rect.width;
    h = rect.height;
    canvas.width = w * DPR;
    canvas.height = h * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
resizeFlareCanvas();
window.addEventListener("resize", resizeFlareCanvas);

// ======================================================
// フレア要素定義
// ------------------------------------------------------
// dist: 光源(light)からの配置係数。0=光源位置、1=中心を挟んで対称の位置
// sizeRatio: 基準サイズに対する半径の割合
// parallax: 端末チルトに対する視差の強さ(値が大きいほど手前にあるように動く)
// ======================================================
const FLARE_ELEMENTS = [
    { color: "255,248,235", sizeRatio: 0.34,  dist: 0.00, baseAlpha: 0.95, parallax: 0.20 }, // 光源コア
    { color: "255,214,150", sizeRatio: 0.70,  dist: 0.00, baseAlpha: 0.35, parallax: 0.25 }, // 光源まわりのハロー
    { color: "255,224,179", sizeRatio: 0.09,  dist: 0.35, baseAlpha: 0.55, parallax: 0.50 }, // ゴースト1
    { color: "216,180,106", sizeRatio: 0.14,  dist: 0.62, baseAlpha: 0.40, parallax: 0.70 }, // ゴースト2
    { color: "255,255,255", sizeRatio: 0.05,  dist: 0.85, baseAlpha: 0.60, parallax: 0.85 }, // ゴースト3(小さく明るい)
    { color: "180,205,255", sizeRatio: 0.20,  dist: 1.15, baseAlpha: 0.22, parallax: 1.00 }, // ゴースト4(寒色・対比)
    { color: "255,230,190", sizeRatio: 0.045, dist: 1.40, baseAlpha: 0.40, parallax: 1.15 }, // ゴースト5(最遠・小)
];

// ======================================================
// 端末チルト(視差ゆらぎ)
// ======================================================
let tiltX = 0, tiltY = 0;             // なめらかに追従した現在の傾き
let targetTiltX = 0, targetTiltY = 0; // センサーから得た目標値

function onDeviceOrientation(e){
    if(e.gamma === null || e.beta === null) return;
    // gamma: 左右の傾き(-90〜90) / beta: 前後の傾き(-180〜180)
    targetTiltX = Math.max(-1, Math.min(1, e.gamma / 30));
    targetTiltY = Math.max(-1, Math.min(1, (e.beta - 45) / 30)); // 45°=手持ちの自然な角度を基準に
}

function requestTiltPermission(){
    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function") {
        // iOS 13+ はユーザー操作(タップ)を起点に許可を取る必要がある
        const grantOnce = () => {
            DeviceOrientationEvent.requestPermission()
                .then(state => {
                    if(state === "granted"){
                        window.addEventListener("deviceorientation", onDeviceOrientation);
                    }
                })
                .catch(() => {});
            document.removeEventListener("touchstart", grantOnce);
        };
        document.addEventListener("touchstart", grantOnce, { once:true, passive:true });
    } else if (window.DeviceOrientationEvent) {
        // Android等、許可不要な環境
        window.addEventListener("deviceorientation", onDeviceOrientation);
    }
}
requestTiltPermission();

// ======================================================
// 描画ループ
// ------------------------------------------------------
// 呼吸するような明滅(breathing)＋チルトによる視差を、
// 低頻度間引きでも滑らかに見えるようlerpで補間しながら描画する。
// ======================================================
let frameCount = 0;
let flareRAF = null;

function draw(timestamp){
    flareRAF = requestAnimationFrame(draw);

    frameCount++;
    if(frameCount % 2 !== 0) return; // 30fps相当に間引いて負荷を抑える

    tiltX += (targetTiltX - tiltX) * 0.06;
    tiltY += (targetTiltY - tiltY) * 0.06;

    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const light = { x: cx, y: h * 0.28 }; // 光源位置(タイトル上方やや中心寄り)
    const baseSize = Math.min(w, h) * 0.9;
    const t = timestamp * 0.001;

    FLARE_ELEMENTS.forEach((el, i) => {
        const breathe = 0.85 + Math.sin(t * 0.5 + i * 1.7) * 0.15;

        const parallaxRange = 26; // px、視差の最大振れ幅
        const px = light.x + (cx - light.x) * el.dist + tiltX * parallaxRange * el.parallax;
        const py = light.y + (cy - light.y) * el.dist + tiltY * parallaxRange * el.parallax;

        const r = baseSize * el.sizeRatio * breathe;
        const alpha = el.baseAlpha * breathe;

        const gradient = ctx.createRadialGradient(px, py, 0, px, py, r);
        gradient.addColorStop(0.0, `rgba(${el.color},${alpha})`);
        gradient.addColorStop(0.5, `rgba(${el.color},${alpha * 0.35})`);
        gradient.addColorStop(1.0, `rgba(${el.color},0)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(0, r), 0, Math.PI * 2);
        ctx.fill();
    });
}
flareRAF = requestAnimationFrame(draw);

// ======================================================
// 破棄用(オープニング演出の完全破棄時に呼び出す)
// ======================================================
export function disposeFlareBackground(){
    cancelAnimationFrame(flareRAF);
    window.removeEventListener("resize", resizeFlareCanvas);
    window.removeEventListener("deviceorientation", onDeviceOrientation);
}