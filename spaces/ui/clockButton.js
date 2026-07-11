// ======================================================
// emotional - 時の瞬き / clockButton.js (完全版)
// ======================================================

const nebulaCanvas = document.getElementById("nebulaCanvas");
const ringCanvas = document.getElementById("ringCanvas");
const gl = nebulaCanvas.getContext("webgl");
const rctx = ringCanvas.getContext("2d");

const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
let nw = 0, nh = 0;
let rw = 0, rh = 0;

let BASE_SIZE = 0;
let CLOCK_RADIUS = 0;

let isTouched = false;
let touchStartTime = 0;
let touchProgress = 0;
let orbitAngle = -Math.PI / 2;
let lastFrameTime = 0;

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

    BASE_SIZE = Math.min(rw, rh);
    CLOCK_RADIUS = BASE_SIZE * 0.40;

    buildRingCache();
}
window.addEventListener("resize", resizeCanvases);

// ======================================================
// ネビュラ（生WebGLシェーダー）
// ======================================================
const vertSrc = `
attribute vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const fragSrc = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uClockRadius;
uniform float uTouchProgress;

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

  float maxEdge = uClockRadius / min(uResolution.x, uResolution.y) * 2.5; 
  float hardEdgeFade = smoothstep(maxEdge, maxEdge * 0.7, rawRadius);

  vec2 uv = rawUV / (maxEdge * 0.45);
  float radius = length(uv);
  float angle = atan(uv.y, uv.x);
  
  float t = uTime * 0.03;
  vec2 p = uv * 1.2 + vec2(sin(t*0.5)*0.2, t);
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(3.2, 1.5)));
  float cloud = fbm(p + 0.8*q);

  float density = smoothstep(0.1, 0.9, cloud);
  float colorFalloff = pow(clamp(1.0 - radius/1.4, 0.0, 1.0), 1.5);
  vec3 color = pastelPalette(density, angle, uTime);
  
  float haze = colorFalloff * 0.50;
  float coreGlow = colorFalloff * density * 1.5;
  float coreAlpha = clamp(haze + coreGlow, 0.0, 1.0);

  float auraFalloff = pow(clamp(1.0 - rawRadius/(maxEdge*0.9), 0.0, 1.0), 3.0);
  float auraAlpha = auraFalloff * cloud * 0.25;

  float alpha = clamp(coreAlpha + auraAlpha, 0.0, 1.0);

  float sparkleDensity = 26.0;
  vec2 sparkleCoord = uv * sparkleDensity;
  vec2 sCell = floor(sparkleCoord);
  vec2 localUV = fract(sparkleCoord) - 0.5;
  float sHash = hash(sCell);
  float active = step(0.95, sHash);
  vec2 pointOffset = vec2(hash(sCell+1.1), hash(sCell+2.7)) - 0.5;
  float d = length(localUV - pointOffset*0.55);
  float roundDot = smoothstep(0.15, 0.0, d);
  float phase = hash(sCell+7.0) * 6.2831;
  float twinkle = pow(sin(uTime*(1.0+sHash*1.5)+phase)*0.5+0.5, 4.0);
  float sparkle = active * roundDot * twinkle * pow(clamp(1.0 - radius/1.6, 0.0, 1.0), 1.5);

  color += vec3(1.0, 0.98, 0.95) * sparkle;
  alpha = clamp(alpha + sparkle, 0.0, 1.0);
  
  alpha *= hardEdgeFade;
  alpha *= (1.0 - uTouchProgress);

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
const uClockRadius = gl.getUniformLocation(prog, "uClockRadius");
const uTouchProgress = gl.getUniformLocation(prog, "uTouchProgress");

gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

// ======================================================
// リング・目盛り・ローマ数字（静的キャッシュ）
// ======================================================
let ringCache = null;

function buildRingCache(){
    if (BASE_SIZE <= 0) return;

    const off = document.createElement("canvas");
    off.width = rw * DPR;
    off.height = rh * DPR;
    const octx = off.getContext("2d");
    octx.setTransform(DPR, 0, 0, DPR, 0, 0);

    const cx = rw / 2;
    const cy = rh / 2;

    const outerR = CLOCK_RADIUS;
    const innerR = outerR - BASE_SIZE * 0.014;

    const drawGlowRing = (radius, color, coreWidth) => {
        const glowLayers = [
            { blur: BASE_SIZE * 0.06, width: coreWidth * 2.5, alpha: 0.15 },
            { blur: BASE_SIZE * 0.03, width: coreWidth * 1.5, alpha: 0.40 },
            { blur: BASE_SIZE * 0.005, width: coreWidth,       alpha: 0.90 }
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

    drawGlowRing(outerR, "rgba(255,215,145,0.9)", BASE_SIZE * 0.0045);
    drawGlowRing(innerR, "rgba(255,230,185,0.7)", BASE_SIZE * 0.0025);

    // ── アンティーク時計仕様の極細ドット目盛り ──
    octx.save();
    const tickR = outerR + BASE_SIZE * 0.016;
    for(let i = 0; i < 60; i++){
        const tickAngle = (i / 60) * Math.PI * 2 - Math.PI / 2;
        const isMajor = i % 5 === 0;
        
        octx.beginPath();
        const tx = cx + Math.cos(tickAngle) * tickR;
        const ty = cy + Math.sin(tickAngle) * tickR;

        if (isMajor) {
            octx.fillStyle = "rgba(255,225,170,0.75)";
            octx.arc(tx, ty, BASE_SIZE * 0.004, 0, Math.PI * 2);
        } else {
            octx.fillStyle = "rgba(240,205,150,0.35)";
            octx.arc(tx, ty, BASE_SIZE * 0.002, 0, Math.PI * 2);
        }
        octx.fill();
    }
    octx.restore();

    // ── ローマ数字 ──
    const numR = outerR + BASE_SIZE * 0.070;
    const numerals = [
        { label: "XII", angle: -Math.PI / 2 },
        { label: "III", angle: 0 },
        { label: "VI",  angle: Math.PI / 2 },
        { label: "IX",  angle: Math.PI },
    ];
    octx.save();
    octx.font = `400 ${BASE_SIZE * 0.052}px "Cormorant Garamond", serif`;
    octx.textAlign = "center";
    octx.textBaseline = "middle";
    octx.letterSpacing = "1px";
    octx.shadowColor = "rgba(0, 0, 0, 0.5)";
    octx.shadowBlur = BASE_SIZE * 0.01;

    numerals.forEach(({label, angle}) => {
        const x = cx + Math.cos(angle) * numR;
        const y = cy + Math.sin(angle) * numR;
        octx.fillStyle = "rgba(255,230,190,0.85)";
        octx.fillText(label, x, y);
    });
    octx.restore();

    // ── 数字のさらに外側に、細く薄い円のライン ──
    const outerLineR = numR + BASE_SIZE * 0.002;
    octx.save();
    octx.strokeStyle = "rgba(255,225,170,0.5)";
    octx.lineWidth = BASE_SIZE * 0.0012;
    octx.beginPath();
    octx.arc(cx, cy, outerLineR, 0, Math.PI * 2);
    octx.stroke();
    octx.restore();
    // ── さらにもう一本外側のライン ──
const outerLineR2 = numR + BASE_SIZE * 0.020; // ← 半径をもう少し外側へ
octx.save();
octx.strokeStyle = "rgba(255,225,170,0.35)"; // ← 少し薄めにすると綺麗
octx.lineWidth = BASE_SIZE * 0.0010; // ← ほんの少し細くして差をつける
octx.beginPath();
octx.arc(cx, cy, outerLineR2, 0, Math.PI * 2);
octx.stroke();
octx.restore();

    ringCache = off;
}

// ======================================================
// 周回する光の粒
// ======================================================
const ORBIT_SPRITE_SIZE = 128;
const orbitSprite = document.createElement("canvas");
orbitSprite.width = ORBIT_SPRITE_SIZE;
orbitSprite.height = ORBIT_SPRITE_SIZE;

(function buildOrbitSprite(){
    const sctx = orbitSprite.getContext("2d");
    const center = ORBIT_SPRITE_SIZE / 2;

    const halo = sctx.createRadialGradient(center, center, 0, center, center, center * 0.85);
    halo.addColorStop(0.0, "rgba(255,220,160,0.35)");
    halo.addColorStop(0.3, "rgba(255,200,130,0.12)");
    halo.addColorStop(1.0, "rgba(255,180,110,0)");
    sctx.fillStyle = halo;
    sctx.fillRect(0, 0, ORBIT_SPRITE_SIZE, ORBIT_SPRITE_SIZE);

    const glow = sctx.createRadialGradient(center, center, 0, center, center, center * 0.4);
    glow.addColorStop(0.0, "rgba(255,240,200,0.85)");
    glow.addColorStop(0.5, "rgba(255,210,140,0.40)");
    glow.addColorStop(1.0, "rgba(255,190,120,0)");
    sctx.fillStyle = glow;
    sctx.fillRect(0, 0, ORBIT_SPRITE_SIZE, ORBIT_SPRITE_SIZE);

    const core = sctx.createRadialGradient(center, center, 0, center, center, center * 0.15);
    core.addColorStop(0.0, "rgba(255,255,255,1.0)");
    core.addColorStop(0.7, "rgba(255,245,220,0.9)");
    core.addColorStop(1.0, "rgba(255,230,170,0)");
    sctx.fillStyle = core;
    sctx.fillRect(0, 0, ORBIT_SPRITE_SIZE, ORBIT_SPRITE_SIZE);
})();

function updateAndDrawOrbitLight(deltaTime){
    if (CLOCK_RADIUS <= 0) return;

    let speedMultiplier = 1.0;
    if (isTouched) {
        const elapsed = Date.now() - touchStartTime;
        speedMultiplier = 1.0 + Math.pow(elapsed * 0.015, 2.5);
    }

    const baseVelocity = (Math.PI * 2) / 60000;
    orbitAngle += baseVelocity * deltaTime * speedMultiplier;

    const cx = rw / 2;
    const cy = rh / 2;
    
    const targetRadius = CLOCK_RADIUS; 
    const x = cx + Math.cos(orbitAngle) * targetRadius;
    const y = cy + Math.sin(orbitAngle) * targetRadius;

    const currentAlpha = 1.0 - touchProgress;
    if (currentAlpha <= 0) return;

    const spriteSize = BASE_SIZE * 0.18;
    rctx.save();
    rctx.globalAlpha = currentAlpha;
    rctx.globalCompositeOperation = "lighter";
    
    if (isTouched) {
        for (let i = 1; i <= 3; i++) {
            const trailAngle = orbitAngle - (0.04 * i * (speedMultiplier * 0.05));
            const tx = cx + Math.cos(trailAngle) * targetRadius;
            const ty = cy + Math.sin(trailAngle) * targetRadius;
            rctx.globalAlpha = currentAlpha * (1.0 - i * 0.25);
            rctx.drawImage(orbitSprite, tx - spriteSize/2, ty - spriteSize/2, spriteSize, spriteSize);
        }
    }

    rctx.globalAlpha = currentAlpha;
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

function frame(timestamp){
    rafId = requestAnimationFrame(frame);
    
    if (!lastFrameTime) lastFrameTime = timestamp;
    const deltaTime = timestamp - lastFrameTime;
    lastFrameTime = timestamp;

    if (isTouched) {
        const elapsed = Date.now() - touchStartTime;
        const duration = 500; 
        touchProgress = Math.min(elapsed / duration, 1.0);
    }

    if(gl){
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        gl.uniform2f(uResolution, nebulaCanvas.width, nebulaCanvas.height);
        gl.uniform1f(uTime, timestamp * 0.001);
        gl.uniform1f(uClockRadius, CLOCK_RADIUS * DPR);
        gl.uniform1f(uTouchProgress, touchProgress);
        
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    rctx.clearRect(0, 0, rw, rh);
    
    if(ringCache && touchProgress < 1.0){
        rctx.save();
        rctx.globalAlpha = 1.0 - touchProgress;
        rctx.drawImage(ringCache, 0, 0, rw, rh);
        rctx.restore();
    }

    updateAndDrawOrbitLight(deltaTime);
}
export function triggerTouchAnimation(){
    if (!isTouched) {
        isTouched = true;
        touchStartTime = Date.now();
    }
}

requestAnimationFrame((timestamp) => {
    resizeCanvases();
    lastFrameTime = timestamp;
    rafId = requestAnimationFrame(frame);
});

export function disposeClockButton(){
    cancelAnimationFrame(rafId);
    window.removeEventListener("resize", resizeCanvases);
}