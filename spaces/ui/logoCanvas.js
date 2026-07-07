const canvas = document.getElementById("logoCanvas");
const ctx = canvas.getContext("2d");
const DPR = window.devicePixelRatio || 1;

function drawLogo(w, h){
    ctx.clearRect(0, 0, w, h);

    const fontSize = h * 0.55;
    ctx.font = `500 ${fontSize}px 'Cinzel'`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const text = "emotional";
    const letterSpacing = fontSize * 0.12;

    const charWidths = [...text].map(ch => ctx.measureText(ch).width);
    const totalWidth = charWidths.reduce((a, b) => a + b, 0) + letterSpacing * (text.length - 1);
    let x = w / 2 - totalWidth / 2;
    const y = h / 2 + h * 0.02;

    [...text].forEach((ch, i) => {
        const cx = x + charWidths[i] / 2;

        // ── 影(奥行き) ──
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.7)";
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 3;
        ctx.fillStyle = "#000000";
        ctx.globalAlpha = 0.35; // 影だけ薄く見せるため、本体の黒を薄く重ねる
        ctx.fillText(ch, cx, y);
        ctx.restore();

        // ── 本体:メタリックグラデーション ──
        const gradient = ctx.createLinearGradient(0, y - fontSize/2, 0, y + fontSize/2);
        gradient.addColorStop(0.0, "#f6f6f6");
        gradient.addColorStop(0.35, "#ffffff");
        gradient.addColorStop(0.55, "#bdbdbd");
        gradient.addColorStop(0.75, "#e8e8e8");
        gradient.addColorStop(1.0, "#a8a8a8");

        ctx.save();
        ctx.shadowColor = "rgba(255,255,255,0.4)";
        ctx.shadowBlur = 2;
        ctx.shadowOffsetY = -1;
        ctx.fillStyle = gradient;
        ctx.fillText(ch, cx, y);
        ctx.restore();

        x += charWidths[i] + letterSpacing;
    });

    // ── 輪郭を締める ──
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 0.7;
    let x2 = w / 2 - totalWidth / 2;
    [...text].forEach((ch, i) => {
        const cx = x2 + charWidths[i] / 2;
        ctx.strokeText(ch, cx, y);
        x2 += charWidths[i] + letterSpacing;
    });
    ctx.restore();
}

function resizeCanvas(){
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * DPR;
    canvas.height = rect.height * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawLogo(rect.width, rect.height);
}

document.fonts.load("500 108px 'Cinzel'").then(resizeCanvas);
window.addEventListener("resize", resizeCanvas);
resizeCanvas();
export { canvas, ctx, drawLogo };