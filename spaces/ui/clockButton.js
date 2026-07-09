// ======================================================
// Touchボタン：円の中でゆっくり動くネビュラ + 外周の細い二重リング
//              + XII/III/VI/IXの極薄数字 + 60秒で1周する光の粒
// ======================================================

const nebulaCanvas = document.getElementById("nebulaCanvas");
const ringCanvas = document.getElementById("ringCanvas");
const gl = nebulaCanvas.getContext("webgl");
const rctx = ringCanvas.getContext("2d");

const DPR = Math.min(window.devicePixelRatio || 1, 1.5);

let nw = 0, nh = 0;
let rw = 0, rh = 0;

function resizeCanvases(){
    const nRect = nebulaCanvas.getBoundingClientRect();
    nw = nRect.width; nh = nRect.height;
    nebulaCanvas.width = nw * DPR;
    nebulaCanvas.height = nh * DPR;
    if(gl) gl.viewport(0, 0, nebulaCanvas.width, nebulaCanvas.height);

    const rRect = ringCanvas.getBoundingClientRect();
    rw = rRect.width; rh = rRect.height;
    ringCanvas.width = rw * DPR;
    ringCanvas.height = rh * DPR;
    rctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    buildRingCache();
}
window.addEventListener("resize", resizeCanvases);

// ======================================================
// ① ネビュラ（生WebGLシェーダー）
// ======================================================
const vertSrc = `
attribute vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const fragSrc = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  float a = hash(i), b = hash(i+vec2(1.,0.));
  float c = hash(i+vec2(0.,1.)), d = hash(i+vec2(1.,1.));
  vec2 u = f*f*(3.-2.*f);
  return mix(a,b,u.x) + (c-a)*u.y*(1.-u.x) + (d-b)*u.x*u.y;
}
float fbm(vec2 p){
  float v=0., amp=.5;
  for(int i=0;i<5;i++){ v += amp*vnoise(p); p *= 2.02; amp *= 0.5; }
  return v;
}

vec3 pastelPalette(float density, float angle, float t){
  vec3 rose = vec3(1.00,0.78,0.85);
  vec3 lav  = vec3(0.80,0.78,1.00);
  vec3 mint = vec3(0.75,1.00,0.90);
  vec3 gold = vec3(1.00,0.90,0.72);
  vec3 sky  = vec3(0.78,0.90,1.00);
  vec3 core = vec3(1.00,0.97,0.94);

  float mixA = sin(angle*1.3 + t*0.15)*0.5+0.5;
  float mixB = sin(angle*2.1 - t*0.11 + 2.0)*0.5+0.5;
  float mixC = sin(angle*0.7 + t*0.08 + 4.0)*0.5+0.5;

  vec3 blend = mix(rose, lav, mixA);
  blend = mix(blend, mint, mixB*0.6);
  blend = mix(blend, gold, mixC*0.5);
  blend = mix(blend, sky, (1.0-mixA)*0.4);

  vec3 color = mix(blend*0.7, blend, smoothstep(0.0,0.5,density));
  color = mix(color, core, smoothstep(0.55,0.95,density));
  return color;
}

void main(){
  vec2 rawUV = (gl_FragCoord.xy - 0.5*uResolution) / min(uResolution.x, uResolution.y);
  float rawRadius = length(rawUV);
  float hardEdgeFade = smoothstep(0.95, 0.5, rawRadius);

  vec2 uv = rawUV / 0.58;

  float radius = length(uv);
  float angle = atan(uv.y, uv.x);
  float t = uTime * 0.05;

  vec2 p = uv * 1.4 + vec2(0.0, t);
  vec2 q = vec2(fbm(p), fbm(p + vec2(5.2,1.3)));
  float cloud = fbm(p + 0.0*q);

  float density = smoothstep(0.15, 0.85, cloud);

  float colorFalloff = pow(clamp(1.0 - radius/1.3, 0.0, 1.0), 1.0);
  vec3 color = pastelPalette(density, angle, uTime);

  float haze = colorFalloff * 0.55;
  float coreGlow = colorFalloff * density * 1.4;
  float coreAlpha = clamp(haze + coreGlow, 0.0, 1.0);

  float auraFalloff = pow(clamp(1.0 - radius/2.3, 0.0, 1.0), 2.0);
  float auraAlpha = auraFalloff * cloud * 0.35;

  float alpha = clamp(coreAlpha + auraAlpha, 0.0, 1.0);

  float sparkleDensity = 22.0;
  vec2 sparkleCoord = uv * sparkleDensity;
  vec2 sCell = floor(sparkleCoord);
  vec2 localUV = fract(sparkleCoord) - 0.5;
  float sHash = hash(sCell);
  float active = step(0.96, sHash);
  vec2 pointOffset = vec2(hash(sCell+1.1), hash(sCell+2.7)) - 0.5;
  float d = length(localUV - pointOffset*0.55);
  float roundDot = smoothstep(0.16, 0.0, d);
  float phase = hash(sCell+7.0) * 6.2831;
  float twinkle = pow(sin(uTime*(1.2+sHash*2.0)+phase)*0.5+0.5, 4.0);
  float sparkle = active * roundDot * twinkle * pow(clamp(1.0 - radius/1.5,0.0,1.0), 1.5);

  color += vec3(1.0,0.98,0.95) * sparkle;
  alpha = clamp(alpha + sparkle, 0.0, 1.0);

  alpha *= hardEdgeFade;

  gl_FragColor = vec4(color * alpha, alpha);
}
`;

function compileShader(type, src){
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
        console.error(gl.getShaderInfoLog(s));
    }
    return s;
}

const prog = gl.createProgram();
gl.attachShader(prog, compileShader(gl.VERTEX_SHADER, vertSrc));
gl.attachShader(prog, compileShader(gl.FRAGMENT_SHADER, fragSrc));
gl.linkProgram(prog);
gl.useProgram(prog);

const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
const aPos = gl.getAttribLocation(prog, "aPos");
gl.enableVertexAttribArray(aPos);
gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

const uResolution = gl.getUniformLocation(prog, "uResolution");
const uTime = gl.getUniformLocation(prog, "uTime");

gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

// ======================================================
// ② リング・数字・目盛り（静的、1回だけオフスクリーンにキャッシュ）
// ======================================================
let ringCache = null;

function buildRingCache(){
    const size = Math.max(rw, 1); // 実際のキャンバスサイズ(CSSで112%に拡大済み)
    const refSize = size / 1.12;  // リングや数字の"見た目上の大きさ"の基準(拡大前のサイズ)

    const off = document.createElement("canvas");
    off.width = size * DPR;
    off.height = size * DPR;
    const octx = off.getContext("2d");
    octx.setTransform(DPR, 0, 0, DPR, 0, 0);

    const cx = size / 2, cy = size / 2;
    const outerR = refSize * 0.48;
    const innerR = outerR - refSize * 0.028;
    const buttonR = refSize * 0.34;

    const drawGlowRing = (radius, color, coreWidth) => {
        const glowLayers = [
            { blur: refSize * 0.09, width: coreWidth * 3.2, alpha: 0.22 },
            { blur: refSize * 0.055, width: coreWidth * 2.0, alpha: 0.4 },
            { blur: refSize * 0.03,  width: coreWidth * 1.3, alpha: 0.65 },
            { blur: refSize * 0.01,  width: coreWidth,       alpha: 1.0  },
        ];
        glowLayers.forEach(layer => {
            octx.save();
            octx.shadowColor = color;
            octx.shadowBlur = layer.blur;
            octx.strokeStyle = color;
            octx.globalAlpha = layer.alpha;
            octx.lineWidth = layer.width;
            octx.beginPath();
            octx.arc(cx, cy, radius, 0, Math.PI * 2);
            octx.stroke();
            octx.restore();
        });
    };

    drawGlowRing(outerR, "rgba(255,210,150,1)", refSize * 0.0055);
    drawGlowRing(innerR, "rgba(255,224,179,0.9)", refSize * 0.003);

    // ── 時計の分目盛りのような、ごく薄い60個のティック ──
    octx.save();
    octx.strokeStyle = "rgba(216,180,106,0.22)";
    octx.lineCap = "round";
    for(let i = 0; i < 60; i++){
        const tickAngle = (i / 60) * Math.PI * 2 - Math.PI / 2;
        const isMajor = i % 5 === 0;
        const tickLen = isMajor ? refSize * 0.022 : refSize * 0.012;
        const r1 = outerR + refSize * 0.012;
        const r2 = r1 + tickLen;

        octx.globalAlpha = isMajor ? 0.32 : 0.16;
        octx.lineWidth = isMajor ? refSize * 0.0025 : refSize * 0.0015;

        octx.beginPath();
        octx.moveTo(cx + Math.cos(tickAngle) * r1, cy + Math.sin(tickAngle) * r1);
        octx.lineTo(cx + Math.cos(tickAngle) * r2, cy + Math.sin(tickAngle) * r2);
        octx.stroke();
    }
    octx.restore();

    // ── XII / III / VI / IX：リングの外側に配置 ──
    const midR = outerR + refSize * 0.075;
    const numerals = [
        { label: "XII", angle: -Math.PI / 2 },
        { label: "III", angle: 0 },
        { label: "VI",  angle: Math.PI / 2 },
        { label: "IX",  angle: Math.PI },
    ];
    octx.save();
    octx.font = `400 ${refSize * 0.052}px "Cormorant Garamond", serif`;
    octx.textAlign = "center";
    octx.textBaseline = "middle";
    octx.fillStyle = "rgba(230,195,140,0.68)";
    numerals.forEach(({label, angle}) => {
        const x = cx + Math.cos(angle) * midR;
        const y = cy + Math.sin(angle) * midR;
        octx.fillText(label, x, y);
    });
    octx.restore();

    ringCache = off;
}
// ======================================================
// ③ 周回する光の粒（60秒で1周）
// ======================================================
const ORBIT_SPRITE_SIZE = 64;
const orbitSprite = document.createElement("canvas");
orbitSprite.width = ORBIT_SPRITE_SIZE;
orbitSprite.height = ORBIT_SPRITE_SIZE;
(function buildOrbitSprite(){
    const sctx = orbitSprite.getContext("2d");
    const half = ORBIT_SPRITE_SIZE / 2;

    const halo = sctx.createRadialGradient(half, half, 0, half, half, half);
    halo.addColorStop(0.0, "rgba(255,235,200,0.9)");
    halo.addColorStop(0.35, "rgba(255,215,160,0.45)");
    halo.addColorStop(1.0, "rgba(255,200,140,0)");
    sctx.fillStyle = halo;
    sctx.fillRect(0, 0, ORBIT_SPRITE_SIZE, ORBIT_SPRITE_SIZE);

    const core = sctx.createRadialGradient(half, half, 0, half, half, half * 0.35);
    core.addColorStop(0.0, "rgba(255,255,250,1)");
    core.addColorStop(0.6, "rgba(255,240,215,0.9)");
    core.addColorStop(1.0, "rgba(255,220,170,0)");
    sctx.fillStyle = core;
    sctx.fillRect(0, 0, ORBIT_SPRITE_SIZE, ORBIT_SPRITE_SIZE);
})();

function drawOrbitLight(now){
    const size = rw;
    const cx = size / 2, cy = size / 2;
    const outerR = size * 0.48;

    const progress = (now % 60000) / 60000;
    const angle = progress * Math.PI * 2 - Math.PI / 2;

    const x = cx + Math.cos(angle) * outerR;
    const y = cy + Math.sin(angle) * outerR;

    const spriteSize = size * 0.16;
    rctx.save();
    rctx.globalCompositeOperation = "lighter";
    rctx.drawImage(
        orbitSprite,
        x - spriteSize / 2,
        y - spriteSize / 2,
        spriteSize,
        spriteSize
    );
    rctx.restore();
}

// ======================================================
// 描画ループ
// ======================================================
let rafId = null;

function frame(t){
    rafId = requestAnimationFrame(frame);

    if(gl){
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(uResolution, nebulaCanvas.width, nebulaCanvas.height);
        gl.uniform1f(uTime, t * 0.001);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    rctx.clearRect(0, 0, rw, rh);
    if(ringCache){
        rctx.drawImage(ringCache, 0, 0, rw, rh);
    }
    drawOrbitLight(Date.now());
}

requestAnimationFrame(() => {
    resizeCanvases();
    rafId = requestAnimationFrame(frame);
});

export function disposeClockButton(){
    cancelAnimationFrame(rafId);
    window.removeEventListener("resize", resizeCanvases);
}