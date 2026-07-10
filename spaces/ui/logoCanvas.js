const canvas = document.getElementById("logoCanvas");
const ctx = canvas.getContext("2d");
const DPR = window.devicePixelRatio || 1;

let animStartTime = null;
let animFrameId = null;
let animStopped = false;

function drawLogo(w, h, timestamp){
    if(animStopped) return;

    ctx.clearRect(0, 0, w, h);

    if(animStartTime === null) animStartTime = timestamp || 0;
    const elapsed = ((timestamp || 0) - animStartTime) / 1000;
    const CYCLE = 11;
    const t = (elapsed % CYCLE) / CYCLE;

    const fontSize = h * 0.60;
    ctx.font = `500 ${fontSize}px 'Cormorant Garamond'`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const text = "emotional";
    const letterSpacing = fontSize * 0.12;

    const charWidths = [...text].map(ch => ctx.measureText(ch).width);
    const totalWidth = charWidths.reduce((a, b) => a + b, 0) + letterSpacing * (text.length - 1);
    const startX = w / 2 - totalWidth / 2;
    const y = h / 2 + h * 0.02;

    const FLOW_START = 0.10;
    const FLOW_END   = 0.55;
    const FLICKER_START = 0.62;

    let x = startX;
    [...text].forEach((ch, i) => {
        const cx = x + charWidths[i] / 2;
        ctx.strokeStyle = "rgba(230,240,255,0.5)";
        ctx.lineWidth = 0.9;
        ctx.strokeText(ch, cx, y);
        x += charWidths[i] + letterSpacing;
    });

    if(t >= FLOW_START && t < FLOW_END){
        const p = (t - FLOW_START) / (FLOW_END - FLOW_START);
        const bandWidth = totalWidth * 0.32;
        const bandCenter = startX + totalWidth * p * 1.15 - bandWidth * 0.1;

        const diag = fontSize * 0.5;
        const gradient = ctx.createLinearGradient(
            bandCenter - bandWidth - diag, y - fontSize * 0.5,
            bandCenter + bandWidth + diag, y + fontSize * 0.5
        );
        gradient.addColorStop(0.0, "rgba(255,248,238,0)");
        gradient.addColorStop(0.40, "rgba(255,248,238,0)");
        gradient.addColorStop(0.5, "rgba(255,252,248,1)");
        gradient.addColorStop(0.60, "rgba(255,248,238,0)");
        gradient.addColorStop(1.0, "rgba(255,248,238,0)");

        ctx.save();
        ctx.shadowColor = "rgba(255,200,140,0.75)";
        ctx.shadowBlur = 20;
        ctx.fillStyle = gradient;

        let gx = startX;
        [...text].forEach((ch, i) => {
            const cx = gx + charWidths[i] / 2;
            ctx.fillText(ch, cx, y);
            gx += charWidths[i] + letterSpacing;
        });
        ctx.restore();

    } else if(t >= FLICKER_START){
        const fp = (t - FLICKER_START) / (1 - FLICKER_START);
        const fadeEnvelope = Math.sin(fp * Math.PI);

const emotionFlicker =
    0.5 +
    Math.sin(fp * Math.PI * 2.6) * 0.3 +
    Math.sin(fp * Math.PI * 5.5 + 1.3) * 0.18;

        const emotionAlpha = Math.max(0, Math.min(1, emotionFlicker)) * fadeEnvelope;

const alFlicker =
    0.5 +
    Math.sin(fp * Math.PI * 4.0 + 2.1) * 0.35 +
    Math.sin(fp * Math.PI * 1.7) * 0.15;
        const alAlpha = Math.max(0, Math.min(1, alFlicker)) * fadeEnvelope;

        let fx = startX;
        [...text].forEach((ch, i) => {
            const cx = fx + charWidths[i] / 2;
            const isAl = i >= 7;

            if(isAl){
                if(alAlpha > 0.02){
                    ctx.save();
                    ctx.shadowColor = `rgba(210,225,255,${0.7 * alAlpha})`;
                    ctx.shadowBlur = 16;
                    ctx.fillStyle = `rgba(235,242,255,${alAlpha})`;
                    ctx.fillText(ch, cx, y);
                    ctx.restore();
                }
            } else {
                if(emotionAlpha > 0.02){
                    ctx.save();
                    ctx.shadowColor = `rgba(255,200,140,${0.75 * emotionAlpha})`;
                    ctx.shadowBlur = 18;
                    ctx.fillStyle = `rgba(255,250,240,${emotionAlpha})`;
                    ctx.fillText(ch, cx, y);
                    ctx.restore();
                }
            }
            fx += charWidths[i] + letterSpacing;
        });
    }

    animFrameId = requestAnimationFrame((ts) => drawLogo(w, h, ts));
}

function stopLogoAnimation(){
    animStopped = true;
    if(animFrameId) cancelAnimationFrame(animFrameId);
}

function resizeCanvas(){
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * DPR;
    canvas.height = rect.height * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    animStartTime = null;
}

document.fonts.load("500 108px 'Cormorant Garamond'").then(() => {
    const rect = canvas.getBoundingClientRect();
    animFrameId = requestAnimationFrame((ts) => drawLogo(rect.width, rect.height, ts));
});
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

export { canvas, ctx, drawLogo, stopLogoAnimation };