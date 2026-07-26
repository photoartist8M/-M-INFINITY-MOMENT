import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import {initPortal,updatePortal,getPortalState,completePortalSwitch,getExhibition,resizePortal,} from './portal.js';
import { 
  fadeVolume, 
  openingBGM, 
  mainBGM, 
  space2BGM, 
  playBGM, 
  playSFX, 
  playSFXRobust, 
  stopSFX,
  stopSFXAsync,
  sakemeSFX,
  stopCurrentBGM,
  delay,
  loadSFXBuffer,
  playSFXBuffer,
  unlockAudioContext,
} from "./spaces/audio.js";

// ★修正：starSFX, sakemeSFX は除外（自分自身のplay()でアンロックされるため）
function unlockAudioForPortal() {
  const allAudio = [openingBGM, mainBGM, space2BGM]; // ← BGMのみ

  allAudio.forEach(audio => {
    audio.volume = 0;
    audio.play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 1;
      })
      .catch(() => {
        console.warn('Audio unlock failed');
      });
  });
}
// ======================================================
// 基本セットアップ
// ======================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0805);
scene.fog = new THREE.Fog(0x0a0805, 10, 55);
const ambientLight = new THREE.AmbientLight(0xfff5e0, 0.25); // 暖色の環境光
scene.add(ambientLight);
const keyLight = new THREE.DirectionalLight(0xfff0d0, 0.9);  // キーライト（正面上方）
keyLight.position.set(3, 8, 12);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xd0e8ff, 0.25); // フィルライト（逆側）
fillLight.position.set(-5, -3, 5);
scene.add(fillLight);
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 0, 30);

const BLOOM_LAYER = 1;
const renderer = new THREE.WebGLRenderer({
  canvas: document.querySelector('#canvas'),
  antialias: true
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(
 Math.min(window.devicePixelRatio,1.5)
);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.3, 2.0, 0.93
);
composer.addPass(bloomPass);
// 手続き型環境テクスチャ生成 
function buildProceduralEnv() {
  const pmrem = new THREE.PMREMGenerator(renderer);

  // 小さなシーンを環境マップのソースとして使う
  const envScene = new THREE.Scene();

  // 暖色の光源（上方・前方）
  const warm = new THREE.Mesh(
    new THREE.SphereGeometry(6),
    new THREE.MeshBasicMaterial({ color: 0xffd080 })
  );
  warm.position.set(10, 20, -10);
  envScene.add(warm);

  // 冷色の光源（下方・後方）
  const cool = new THREE.Mesh(
    new THREE.SphereGeometry(4),
    new THREE.MeshBasicMaterial({ color: 0x1a2a50 })
  );
  cool.position.set(-15, -20, 5);
  envScene.add(cool);

  // 背景の暗闇
  envScene.background = new THREE.Color(0x05040a);

  const envRT = pmrem.fromScene(envScene, 0.04); // 0.04 = blur強度
  pmrem.dispose();

  scene.environment = envRT.texture;
}

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    buildProceduralEnv();
  });
});

// ======================================================
// 視点クランプ（写真の端に合わせて水平回転を制限）
// ======================================================
function getYawLimits() {
  const viewingItem = photoItems.find(it => it.viewing && it.fixed && it.mesh);
  if (!viewingItem) return null;

  const mesh = viewingItem.mesh;
  const hw     = mesh.geometry.parameters.width / 2;
  const margin = 0.5; // 外側の余白

  const px = mesh.position.x;
  const pz = mesh.position.z;
  const cx = camera.position.x;
  const cz = camera.position.z;
  const dz = cz - pz;

  const side = viewingItem.index % 2 === 0 ? 1 : -1; // 偶数=右, 奇数=左

  let innerX, outerX;
  if (side === 1) {
    // 右側の写真：内側=中央(0)、外側=写真右端
    innerX = 0;
    outerX = px + hw + margin;
  } else {
    // 左側の写真：内側=中央(0)、外側=写真左端
    innerX = px - hw - margin;
    outerX = 0;
  }

  const angleA = -Math.atan2(innerX - cx, dz);
  const angleB = -Math.atan2(outerX - cx, dz);

  return {
    min: Math.min(angleA, angleB),
    max: Math.max(angleA, angleB),
  };
}
// ======================================================
// 写真リスト
// ======================================================
const PHOTO_FILES = [
  'assets/photo1.jpg',
  'assets/photo2.jpg',
  'assets/photo3.jpg',
  'assets/photo4.jpg',
  'assets/photo5.jpg',
];
// ======================================================
// 写真配置
// ======================================================
const SPIRAL_CONFIG = {
  radius: 7.5,         // 左右に振る幅（0から6に変更）
  zStep: 14,         // 写真と写真Z軸の間隔（14から16に少し広げて見やすく）
  yAmplitude: 1.2,   // 上下の緩やかな高低差
};

function getSpiralPosition(index) {
  const { radius, zStep, yAmplitude } = SPIRAL_CONFIG;
  // 偶数なら右(1)、奇数なら左(-1)に配置して一本道のジグザグを作る
  const side = index % 2 === 0 ? 1 : -1; 
  
  return new THREE.Vector3(
    side * radius,
    Math.sin(index) * yAmplitude, // 規則的な上下動を付与
    -(index * zStep)
  );
}

// ======================================================
// 写真アイテムの状態管理
// ======================================================
function createPhotoItem(src, index) {
  return {
    src,
    index,
    position: getSpiralPosition(index),
    mesh: null,
    material: null,
    aura: null,
    particles: null,
    particleGeo: null,
    particleCount: 0,
    targetPositions: [],
    particleColor: new THREE.Color(1, 1, 1),
    loaded: false,
    triggered: false,
    attract: false,
    formed: false,
    fixed: false,
    dissolving: false,
    dissolved: false,
    dissolveParticles: null,
    viewing: false,
    viewStartZ: null,
    _img: null,
    failed: false, // 画像の読み込みに失敗したかどうか
  };
}

const photoItems = PHOTO_FILES.map((src, i) => createPhotoItem(src, i));
// ======================================================
// 光蓄積・ドア形成システム（追加）
// ======================================================
const ACCUM_POINT = new THREE.Vector3(0, 0, -((PHOTO_FILES.length - 1) * SPIRAL_CONFIG.zStep + 8));
const PORTAL_REVEAL_START_DIST = 11.0;
const PORTAL_REVEAL_FULL_DIST  = 0.5;
let accumulatedCount = 0;
let accumulationGlow = null;
let doorSys          = null;
let doorPhase        = 'none';
let doorTime         = 0;
let loopDisabled     = false;
let _dissolvedFlags  = new Array(PHOTO_FILES.length).fill(false);
let portalPlane = null;

// ======================================================
// 裂け目（記憶の星雲）の広がり半径
// ======================================================
const NEBULA_MAX_R = 3.4; // 星雲パーティクル雲・シェーダー共通の広がり半径

// ======================================================
// テクスチャ
// ======================================================
function createGlowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  gradient.addColorStop(0.0,  'rgba(255,255,255,1)');
  gradient.addColorStop(0.05, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.15, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.3,  'rgba(255,255,255,0.7)');
  gradient.addColorStop(0.6,  'rgba(255,255,255,0.15)');
  gradient.addColorStop(1.0,  'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

const particleTexture = createGlowTexture();

function createSparkTexture(size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const half = size / 2;

  const glow = ctx.createRadialGradient(half, half, 0, half, half, half);
  glow.addColorStop(0.00, 'rgba(255,255,255,1.0)');
  glow.addColorStop(0.08, 'rgba(255,255,255,1.0)');
  glow.addColorStop(0.22, 'rgba(210,228,255,0.80)');
  glow.addColorStop(0.50, 'rgba(160,200,255,0.20)');
  glow.addColorStop(1.00, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  ctx.globalCompositeOperation = 'lighter';
  const spikes = [
    { angle: 0,   w: 2.2, len: 0.90, op: 0.85 },
    { angle: 90,  w: 2.2, len: 0.90, op: 0.85 },
    { angle: 45,  w: 1.0, len: 0.65, op: 0.35 },
    { angle: 135, w: 1.0, len: 0.65, op: 0.35 },
  ];
  spikes.forEach(({ angle, w, len, op }) => {
    const rad = angle * Math.PI / 180;
    const L = half * len;
    const g = ctx.createLinearGradient(-L, 0, L, 0);
    g.addColorStop(0.00, `rgba(180,215,255,0)`);
    g.addColorStop(0.42, `rgba(220,238,255,${op * 0.35})`);
    g.addColorStop(0.50, `rgba(255,255,255,${op})`);
    g.addColorStop(0.58, `rgba(220,238,255,${op * 0.35})`);
    g.addColorStop(1.00, `rgba(180,215,255,0)`);
    ctx.save();
    ctx.translate(half, half);
    ctx.rotate(rad);
    ctx.fillStyle = g;
    ctx.fillRect(-L, -w / 2, L * 2, w);
    ctx.restore();
  });
  ctx.globalCompositeOperation = 'source-over';
  return new THREE.CanvasTexture(canvas);
}

// ======================================================
// 背景粒子 & アクセント粒子
// ======================================================
function createBackgroundParticles() {
  const count = 2500; // 数

  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const scales = new Float32Array(count);

  for (let i = 0; i < count; i++) {

    positions[i * 3] = (Math.random() - 0.5) * 40;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 24;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 180;
    scales[i] = 0.6 + Math.random() * 1.4;

    // 粒子ごとの速度
    speeds[i] = 0.003 + Math.random() * 0.008;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3)
  );
  geo.setAttribute(
  'aScale',
  new THREE.BufferAttribute(scales,1)
);

  const mat = new THREE.ShaderMaterial({

  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,

  uniforms: {
    uTime: { value: 0 },
    uTexture: { value: particleTexture }
  },

  vertexShader: `

    attribute float aScale;

    varying float vScale;

    uniform float uTime;

    void main(){

      vScale = aScale;

      vec3 p = position;

      float breathe =
          sin(uTime * 0.35 + aScale * 15.0) * 0.15;

      p.xy += normalize(p.xy) * breathe;

      vec4 mvPosition =
          modelViewMatrix *
          vec4(p,1.0);

      gl_PointSize =
          aScale *
          (22.0 / -mvPosition.z);

      gl_Position =
          projectionMatrix *
          mvPosition;

    }

  `,

  fragmentShader: `

    uniform sampler2D uTexture;
uniform float uTime;

    varying float vScale;

    void main(){

      vec4 tex =
          texture2D(
            uTexture,
            gl_PointCoord
          );

      float pulse =
    0.75 +
    sin(
        uTime * 1.2 +
        vScale * 8.0
    ) * 0.25;

      vec3 color =
    vec3(
      1.0,
      0.92,
      0.78
    ) * 6.5;

gl_FragColor =
    vec4(
      color,
      tex.a * pulse
    );

    }

  `
});

  const bg = new THREE.Points(geo, mat);

  bg.userData.speeds = speeds;

  scene.add(bg);

  return bg;
}

function createAccentParticles() {

  const count = 200;
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {

    const r = 25 * Math.cbrt(Math.random());
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3)
  );

  const mat = new THREE.PointsMaterial({
    map: createSparkTexture(),
    color: 0xffd27a,
    size: 0.30,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const mesh = new THREE.Points(geo, mat);
  scene.add(mesh);
  return mesh;
}

const backgroundParticles = createBackgroundParticles();
const accentParticles = createAccentParticles();

createAccumulationGlow();
createPortalPlane();

// ======================================================
// 蓄積光メッシュの作成
// ======================================================
function createAccumulationGlow() {

  accumulationGlow = new THREE.Group();
  accumulationGlow.position.copy(ACCUM_POINT);
  scene.add(accumulationGlow);

  const layers = [
    { size: 0.8,  opacity: 0.60 },
    { size: 2.0,  opacity: 0.25 },
    { size: 4.0,  opacity: 0.12 },
    { size: 7.0,  opacity: 0.06 },
    { size: 12.0, opacity: 0.03 },
  ];

  layers.forEach(({ size, opacity }) => {

    const geo = new THREE.PlaneGeometry(size, size);
    const mat = new THREE.MeshBasicMaterial({

      map: particleTexture,
      color: new THREE.Color(1.8,1.4,0.9),

      transparent:true,
      opacity:0,

      blending:THREE.AdditiveBlending,

      depthWrite:false,

      side:THREE.DoubleSide

    });

    const mesh = new THREE.Mesh(geo,mat);

    mesh.userData.baseOpacity = opacity;

    mesh.layers.enable(BLOOM_LAYER);

    accumulationGlow.add(mesh);

  });
}
// ======================================================
// 記憶の星雲・裂け目（ポータル面）
// ======================================================
function createPortalPlane() {
  const PLANE_SIZE = 10; // JS側のワールド座標とUVを対応づけるための基準サイズ
  const geo = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE, 1, 1);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending, // 加算合成だと次空間の映像が背景と足し算されて白飛びするため通常合成
    side: THREE.DoubleSide,
    uniforms: {
      uTime:    { value: 0 },
      uWarp:    { value: 0 },
      uCrack:   { value: 0 }, // 星雲の"濃さ・出現度合い"として流用
      uOpacity: { value: 0 },
      uPortalTex:    { value: null },
      uPortalReveal: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uWarp;
      uniform float uCrack;
      uniform float uOpacity;
      uniform sampler2D uPortalTex;
      uniform float uPortalReveal;
      varying vec2 vUv;

      const float PLANE_SIZE  = ${PLANE_SIZE.toFixed(1)};
      const float NEBULA_MAX_R = ${NEBULA_MAX_R.toFixed(2)};

      // ── 疑似乱数・value noise ──
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }

      // ★修正：オクターブ5→4、persistence(amp減衰)0.5→0.42、
      //   lacunarity 2.02→1.8にして高周波成分を大きく削り、
      //   低周波主体の滑らかなボリューム感だけを残す。
      //   オフセットも非対称値にして軸沿いの縞を防ぐ。
      float fbm(vec2 p) {
        float v = 0.0;
        float amp = 0.55;
        for (int i = 0; i < 4; i++) {
          v += amp * vnoise(p);
          p = p * 1.8 + vec2(37.1, 17.3);
          amp *= 0.42;
        }
        return v;
      }

      // 中心から放射状に伸びる、稲妻・繊維状の筋
      float streaks(vec2 p, float angle, float t) {
        float s = 0.0;
        for (int i = 0; i < 3; i++) {
          float fi = float(i);
          float freq  = 8.0 + fi * 6.0;
          float phase = t * (0.2 + 0.06 * fi);
          float v = abs(sin(angle * freq + phase + fbm(p * 2.0 + fi * 3.1) * 3.0));
          s += pow(1.0 - v, 16.0) * (1.0 / (fi + 1.0));
        }
        return s;
      }

      void main() {
        vec2 wp = (vUv - 0.5) * PLANE_SIZE;
        float radius = length(wp);
        float angle  = atan(wp.y, wp.x);

        // ── ドメインワーピングfbm：雲がゆっくり渦を巻きながら揺らめく ──
        vec2 p = wp * 2.2 + vec2(0.0, uTime * 0.02);
        vec2 q = vec2(
          fbm(p + vec2(1.7, 92.3)),
          fbm(p + vec2(58.1, 3.4))
        );
        // ★修正③：ワープの強さ 4.0→2.6、オフセットを非対称値に変更
        vec2 r = vec2(
          fbm(p + 2.6 * q + vec2(21.7, 63.2) + 0.04 * uTime),
          fbm(p + 2.6 * q + vec2(44.3, 12.8) + 0.03 * uTime)
        );
        float cloud = fbm(p + 2.6 * r);

        // ★修正⑤：全体がゆっくり呼吸するような緩やかな明滅
        float breathe = 0.92 + 0.08 * sin(uTime * 0.15);
        cloud *= breathe;

        // ★修正④：べき指数を上げて外周のフェードをより滑らかに
        float radialFalloff = pow(clamp(1.0 - radius / NEBULA_MAX_R, 0.0, 1.0), 2.2);

        // 中心をノイズに応じて緩やかに底上げ（固定の白い円盤にはしない）
        float centerBoost = smoothstep(NEBULA_MAX_R * 0.28, 0.0, radius);
        float density = cloud * radialFalloff + centerBoost * cloud * 0.35;
        density = clamp(density, 0.0, 1.0);
        density *= radialFalloff;

        float streakFalloff = radialFalloff * radialFalloff;
        float streakVal = streaks(wp * 0.4, angle, uTime) * streakFalloff;

        // ── 色：中心=暖白 → 中間=山吹色/琥珀色 → 外側=深い赤茶色にフェード ──
        vec3 outerColor = vec3(0.42, 0.16, 0.06);
        vec3 midColor   = vec3(1.00, 0.55, 0.16);
        // ★修正⑥：純白(1,1,1)ではなく暖白寄りに。白飛びを避ける
        vec3 coreColor  = vec3(0.95, 0.85, 0.70);

vec3 color = mix(outerColor, midColor, smoothstep(0.15, 0.62, density));
        float revealFade = 1.0 - clamp(uPortalReveal * 1.3, 0.0, 1.0); // ★追加：開口が進むほどコアを消す
        float coreMix = smoothstep(0.58, 1.0, density) * smoothstep(NEBULA_MAX_R * 0.30, 0.0, radius);
        coreMix = min(coreMix, 0.75) * revealFade; // ★revealFadeを掛ける
        color = mix(color, coreColor, coreMix);
        color += vec3(1.0, 0.75, 0.35) * streakVal * 0.9;

        float alpha = clamp(density * 0.75 + streakVal * 0.5, 0.0, 1.0);
        alpha *= uCrack * uOpacity;
        vec3 finalGasColor = color * uCrack;

        // ── 次空間の開口：中心の一番明るい場所がノイズで滲みながら開く ──
        float noiseWarp = (cloud - 0.5) * 0.9;
        float openR  = NEBULA_MAX_R * 0.63 * clamp(uPortalReveal, 0.0, 1.0);
        // ★修正⑦：featherを広げて輪郭のはっきりした円にせず、じわっと滲ませる
        float feather = 1.4 + uWarp * 0.8;
        float apertureMask = smoothstep(openR + noiseWarp, openR + noiseWarp - feather, radius);
        apertureMask *= step(radius, NEBULA_MAX_R * 0.58);

        vec3 portalColor = texture2D(uPortalTex, vUv).rgb;
        vec3 finalColor = mix(finalGasColor, portalColor, apertureMask);

        float finalAlpha = max(alpha, apertureMask);

        // 外周は緩やかにフェードアウトして完全に消える（ハードな縁を作らない）
        float outerFade = smoothstep(NEBULA_MAX_R * 1.15, NEBULA_MAX_R * 0.75, radius);
        finalAlpha *= outerFade;

        gl_FragColor = vec4(finalColor, finalAlpha);
      }
    `,
  });

  portalPlane = new THREE.Mesh(geo, mat);
  portalPlane.position.copy(ACCUM_POINT);
  portalPlane.layers.enable(BLOOM_LAYER);
  scene.add(portalPlane);
}
// ======================================================
// 写真ロードに失敗した場合のフォールバック処理
// ======================================================
function markPhotoFailed(item) {
  if (item.failed || item.dissolved) return; // 二重処理防止
  console.warn(`写真の表示をスキップします（読み込み失敗）: ${item.src}`);

  item.failed     = true;
  item.loaded     = true;
  item.triggered  = true;
  item.attract    = true;
  item.formed     = true;
  item.fixed      = true;
  item.dissolving = true;
  item._photoFadedOut = true;
  item.dissolved  = true;
}

// ======================================================
// 写真ロード & オブジェクト生成
// ======================================================
function loadPhotoItem(item) {
  const img = new Image();
  let settled = false;

  const failTimeoutId = setTimeout(() => {
    if (settled) return;
    settled = true;
    console.warn(`画像の読み込みがタイムアウトしました: ${item.src}`);
    markPhotoFailed(item);
  }, 8000);

  img.onerror = () => {
    if (settled) return;
    settled = true;
    clearTimeout(failTimeoutId);
    console.error(`画像の読み込みに失敗しました: ${item.src}`);
    markPhotoFailed(item);
  };

  img.onload = () => {
    if (settled) return;

    if (!img.naturalWidth || !img.naturalHeight) {
      settled = true;
      clearTimeout(failTimeoutId);
      console.error(`画像が壊れています: ${item.src}`);
      markPhotoFailed(item);
      return;
    }

    settled = true;
    clearTimeout(failTimeoutId);

    item._img = img;
    const isMobile = window.innerWidth <= 768;

    const frameHeight = isMobile ? 9.5 : 10;

    const aspect = img.width / img.height;

    let baseWidth = frameHeight * aspect;
    let baseHeight = frameHeight;

    if (baseWidth > 14) {
      baseWidth = 14;
      baseHeight = baseWidth / aspect;
    }

    const maxHeight = isMobile ? 13 : 14;

    if (baseHeight > maxHeight) {
      baseHeight = maxHeight;
      baseWidth = baseHeight * aspect;
    }

    const w = 150;
    const h = Math.round(150 / aspect);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cx = c.getContext('2d');
    cx.drawImage(img, 0, 0, w, h);
    const data = cx.getImageData(0, 0, w, h).data;
    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const i = (y * w + x) * 4;
        const r = data[i], g = data[i+1], b = data[i+2];
        if ((r+g+b) > 450 && x > 2 && x < w-2 && y > 2 && y < h-2) {
          item.targetPositions.push(new THREE.Vector3(
            (x - w/2) * (baseWidth/w),
            (h/2 - y) * (baseHeight/h),
            3
          ));
          rSum += r; gSum += g; bSum += b; count++;
        }
      }
    }
    if (count > 0) {
      item.particleColor = new THREE.Color(rSum/count/255, gSum/count/255, bSum/count/255);
    }

    buildParticles(item);
    buildPhotoMesh(item, baseWidth, baseHeight);
    buildAura(item, baseWidth, baseHeight);
    item.loaded = true;
    item._loadedAt = Date.now();
  };

  img.src = item.src;
}

function buildParticles(item) {
  const photoCount = item.targetPositions.length;
  item.particleCount = photoCount;
  const pos = new Float32Array(photoCount * 3);
  for (let i = 0; i < photoCount; i++) {
    const r = 50 * Math.cbrt(Math.random());
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    pos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i*3+2] = r * Math.cos(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    map: createSparkTexture(),
    color: 0xffd27a,
    size: 0.30,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  });
  item.particles = new THREE.Points(geo, mat);
  item.particles.position.copy(item.position);
  item.particleGeo = geo;
  scene.add(item.particles);
}

function buildPhotoMesh(item, baseWidth, baseHeight) {
  const tex = new THREE.Texture(item._img);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  const geo = new THREE.PlaneGeometry(baseWidth, baseHeight);

item.material = new THREE.MeshBasicMaterial({
  map: tex,
  transparent: true,
  opacity: 0,
  depthWrite: false
});

  item.mesh = new THREE.Mesh(geo, item.material);
  item.mesh.position.copy(item.position).add(new THREE.Vector3(0, 0, 3));
  scene.add(item.mesh);
}

function buildAura(item, baseWidth, baseHeight) {
  const borderSize = 0.04;
  const outerW = baseWidth  + borderSize * 2;
  const outerH = baseHeight + borderSize * 2;

  const shape = new THREE.Shape();
  shape.moveTo(-outerW / 2, -outerH / 2);
  shape.lineTo( outerW / 2, -outerH / 2);
  shape.lineTo( outerW / 2,  outerH / 2);
  shape.lineTo(-outerW / 2,  outerH / 2);
  shape.closePath();

  const hole = new THREE.Path();
  hole.moveTo(-baseWidth / 2, -baseHeight / 2);
  hole.lineTo( baseWidth / 2, -baseHeight / 2);
  hole.lineTo( baseWidth / 2,  baseHeight / 2);
  hole.lineTo(-baseWidth / 2,  baseHeight / 2);
  hole.closePath();
  shape.holes.push(hole);

  const geo = new THREE.ShapeGeometry(shape);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.6, 1.6, 1.6),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  item.aura = new THREE.Mesh(geo, mat);
  item.aura.position.copy(item.position).add(new THREE.Vector3(0, 0, 3.0));
  item.aura.visible = false;
  item.aura.layers.enable(BLOOM_LAYER);
  scene.add(item.aura);
}

photoItems.forEach(item => loadPhotoItem(item));

// ======================================================
// dissolvedになった瞬間を検知
// ======================================================
function checkDissolvedAndAccumulate() {
  for (let i = 0; i < photoItems.length; i++) {
    const item = photoItems[i];
    if (item.dissolved && !_dissolvedFlags[i]) {
      _dissolvedFlags[i] = true;
      onPhotoArrivedAtLight(i);
    }
  }
}
// ======================================================
// 写真粒子が蓄積ポイントに到達したときの処理
// ======================================================
function onPhotoArrivedAtLight(index) {
  accumulatedCount++;
  console.log(`蓄積: ${accumulatedCount} / ${PHOTO_FILES.length}`);

  if (accumulatedCount >= PHOTO_FILES.length) {
    loopDisabled = true;

    moveTargetZ = ACCUM_POINT.z + 4.5;
    moveForward = true;

    setTimeout(() => {
      alignCameraToRiftAndLock();
    }, 1500);
  }
}
// ======================================================
// カメラを裂け目正面・適正距離へ補正してからロックする
// ======================================================
const RIFT_VIEW_DISTANCE      = 5.5;
const CAMERA_ALIGN_DURATION   = 2500;
const RIFT_BASE_FOV           = 75;

function computeLookAtQuaternion(fromPos, targetPos) {
  const m = new THREE.Matrix4();
  m.lookAt(fromPos, targetPos, camera.up);
  const q = new THREE.Quaternion();
  q.setFromRotationMatrix(m);
  return q;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// star.mp3 を Web Audio API 用バッファとして事前ロード
let starSFXBuffer = null;
let starSFXSource = null;
let sakemeSFXBuffer = null;

loadSFXBuffer('./assets/bgm/star.mp3')
  .then(buffer => {
    starSFXBuffer = buffer;
    console.log('star.mp3 バッファロード完了');
  })
  .catch(err => console.warn('star.mp3 ロード失敗:', err));
loadSFXBuffer('./assets/bgm/sakeme.mp3')
  .then(buffer => { sakemeSFXBuffer = buffer; })
  .catch(err => console.warn('sakeme.mp3 ロード失敗:', err));
// 最初のタップで AudioContext をアンロック
document.addEventListener('click', () => {
  unlockAudioContext();
}, { once: true });

function alignCameraToRiftAndLock() {
  cameraAligning = true;
  camera.up.set(0, 1, 0);

  const startPos  = camera.position.clone();
  const startQuat = camera.quaternion.clone();
  const startFov  = camera.fov;

  const targetPos = new THREE.Vector3(
    ACCUM_POINT.x,
    ACCUM_POINT.y,
    ACCUM_POINT.z + RIFT_VIEW_DISTANCE
  );
  const targetQuat = computeLookAtQuaternion(targetPos, ACCUM_POINT);
  const targetFov  = RIFT_BASE_FOV;

  const startTime = performance.now();

  function animateAlign(now) {
    const t = Math.min((now - startTime) / CAMERA_ALIGN_DURATION, 1);
    const easeT = easeInOutCubic(t);

    camera.position.lerpVectors(startPos, targetPos, easeT);

    if (camera.quaternion.slerpQuaternions) {
      camera.quaternion.slerpQuaternions(startQuat, targetQuat, easeT);
    } else {
      THREE.Quaternion.slerp(startQuat, targetQuat, camera.quaternion, easeT);
    }

    camera.fov = THREE.MathUtils.lerp(startFov, targetFov, easeT);
    camera.updateProjectionMatrix();

    if (t < 1) {
      requestAnimationFrame(animateAlign);
    } else {
      cameraAligning = false;
      cameraLocked = true;
      doorPhase = 'spiraling';
      doorTime = 0;
      createDoorParticles();

      stopCurrentBGM(3000);

      // ★ Web Audio API で starSFX を再生（iOS Safari 対応）
      if (starSFXBuffer) {
        starSFXSource = playSFXBuffer(starSFXBuffer, 0.45);
      } else {
        console.warn('starSFXBuffer がまだロードされていません');
      }
    }
  }

  requestAnimationFrame(animateAlign);
}
// ======================================================
// 記憶の星雲・裂け目 ターゲット座標
// ======================================================
function getDoorTargetPositions(count) {
  const targets = [];
  const cx = ACCUM_POINT.x;
  const cy = ACCUM_POINT.y;
  const cz = ACCUM_POINT.z;

  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const r = NEBULA_MAX_R * Math.pow(Math.random(), 2.0);

    const jitterZ = (Math.random() - 0.5) * 2.2;
    const jitterXY = (Math.random() - 0.5) * 0.3;

    const x = cx + r * Math.cos(theta) + jitterXY;
    const y = cy + r * Math.sin(theta) + jitterXY;
    const z = cz + jitterZ;

    targets.push(new THREE.Vector3(x, y, z));
  }
  return targets;
}
// ======================================================
// 裂け目パーティクルシステムの作成
// ======================================================
const DOOR_PARTICLE_PALETTE = [
  new THREE.Color(0xffe0b3),
  new THREE.Color(0xfbf0db),
  new THREE.Color(0xfff8f0),
];

function createDoorParticles() {
  const count = 1400;
  const pos    = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes  = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const r     = Math.random() * 2.5;
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    pos[i * 3]     = ACCUM_POINT.x + r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = ACCUM_POINT.y + r * Math.sin(phi) * Math.sin(theta);
    pos[i * 3 + 2] = ACCUM_POINT.z + r * Math.cos(phi);
    sizes[i] = 0.14 + Math.random() * 0.16;

    const c = DOOR_PARTICLE_PALETTE[Math.floor(Math.random() * DOOR_PARTICLE_PALETTE.length)];
    colors[i * 3]     = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    map: particleTexture,
    vertexColors: true,
    color: 0xffffff,
    size: 0.06,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geo, mat);
  scene.add(points);

  const noises = [];
  for (let i = 0; i < count; i++) {
    noises.push({
      angleOffset: Math.random() * Math.PI * 2,
      radiusMod:   (Math.random() - 0.5) * 6,
      speedMod:    0.5 + Math.random() * 1.0,
      sizeScale:   sizes[i],
    });
  }

  doorSys = {
    mesh:    points,
    geo:     geo,
    count:   count,
    targets: getDoorTargetPositions(count),
    noises:  noises,
  };

  if (accumulationGlow) {
    accumulationGlow.visible = false;
  }

  if (!portalPlane) createPortalPlane();

  initPortal(renderer, portalPlane);
}
// ======================================================
// 蓄積光のアニメーション更新
// ======================================================
function updateAccumulationGlow() {
  if (!accumulationGlow || accumulatedCount === 0) return;
  if (doorPhase !== 'none') return;
  const t     = Date.now() * 0.001;
  const ratio = accumulatedCount / PHOTO_FILES.length;

  accumulationGlow.children.forEach((mesh, i) => {
    const breathe = Math.sin(t * 0.9 + i * 0.8) * 0.5
                  + Math.sin(t * 0.4 + i * 0.3) * 0.3
                  + Math.sin(t * 1.6 + i * 1.2) * 0.2;

    const pulse = 0.5 + breathe * 0.5;

    mesh.material.opacity =
      mesh.userData.baseOpacity * ratio * pulse;

    const scaleBreath = 1.0 + Math.sin(t * 0.7 + i * 0.6) * 0.12;
    mesh.scale.setScalar(scaleBreath);
  });
}

// ======================================================
// ドアアニメーションの更新（安定版）
// ======================================================
function updateDoor() {
  if (doorPhase === 'none' || !doorSys) return;

  doorTime += 0.006;
  const pos = doorSys.geo.attributes.position.array;
  const uni = portalPlane ? portalPlane.material.uniforms : null;
  if (uni) uni.uTime.value = doorTime;

  // ────────────────────────────────────────
  // Phase 1: 台風の目のような対数螺旋で渦が巻き始める
  // ────────────────────────────────────────
  if (doorPhase === 'spiraling') {
    const SPIRAL_DUR = 1.4;
    const sp    = Math.min(1.0, doorTime / SPIRAL_DUR);
    const accel = Math.pow(sp, 2.2);

    // ★sakemeSFX は spiraling フェーズの最初だけ
    if (!doorSys._sakemePlayed) {
      doorSys._sakemePlayed = true;
     // playSFXRobust(sakemeSFX, 0.85);
    }

    doorSys.mesh.material.opacity = Math.min(0.25, doorTime * 0.4);

    if (uni) {
      uni.uOpacity.value = Math.min(0.55, sp * 0.75);
      uni.uWarp.value    = sp;
    }

    const B = 1.6;

    for (let i = 0; i < doorSys.count; i++) {
      const ix = i * 3, iy = i * 3 + 1, iz = i * 3 + 2;
      const noise = doorSys.noises[i];
      const target = doorSys.targets[i];

      const angle = noise.angleOffset + doorTime * noise.speedMod * 8.0;
      const r = 3.0 * Math.pow(1.0 - accel, 1.5) + noise.radiusMod * 0.1;

      pos[ix] = ACCUM_POINT.x + Math.cos(angle) * r;
      pos[iy] = ACCUM_POINT.y + Math.sin(angle) * r;
      pos[iz] = ACCUM_POINT.z + (Math.random() - 0.5) * 2.0;
    }

    if (doorTime > SPIRAL_DUR) {
      doorPhase = 'forming';
      doorTime  = 0;
    }
  }
  // ────────────────────────────────────────
  // Phase 2: 渦が緩みながら裂け目（星雲）の形に収束
  // ────────────────────────────────────────
  if (doorPhase === 'forming') {
    const FORM_DUR      = 0.8;
    const fp            = Math.min(1.0, doorTime / FORM_DUR);
    const swirlStrength = 1.0 - fp;
    const B = 1.6;

    doorSys.mesh.material.opacity = 0.25;

    if (uni) {
      uni.uWarp.value     = 1.0 - fp;
      uni.uCrack.value    = fp;
      uni.uOpacity.value  = 0.4;
    }

    for (let i = 0; i < doorSys.count; i++) {
      const ix = i * 3, iy = i * 3 + 1, iz = i * 3 + 2;
      const noise  = doorSys.noises[i];
      const target = doorSys.targets[i];

      const dx       = target.x - ACCUM_POINT.x;
      const dy       = target.y - ACCUM_POINT.y;
      const finalR   = Math.sqrt(dx * dx + dy * dy);
      const finalAng = Math.atan2(dy, dx);

      const curR = Math.max(0.05, finalR + noise.radiusMod * swirlStrength * 0.3);
      const radiusFactor = 1.0 / (curR + 0.3);
      const rotSpeed = 6.0 * swirlStrength * (1.0 + radiusFactor * B * 0.5);

      const curAng = finalAng
                   + noise.angleOffset * swirlStrength * 0.2
                   + doorTime * noise.speedMod * rotSpeed;

      const vx = ACCUM_POINT.x + Math.cos(curAng) * curR;
      const vy = ACCUM_POINT.y + Math.sin(curAng) * curR;
      const tx = target.x + (vx - target.x) * swirlStrength;
      const ty = target.y + (vy - target.y) * swirlStrength;

      pos[ix] += (tx - pos[ix]) * 0.06;
      pos[iy] += (ty - pos[iy]) * 0.06;
      pos[iz] += (target.z - pos[iz]) * 0.05;

      doorSys.mesh.material.size = 0.20 - fp * 0.12 + noise.sizeScale * 0.06;
    }

    if (doorTime > FORM_DUR) {
      doorPhase = 'complete';
    }
  }
  // ────────────────────────────────────────
  // Phase 3: 星雲が脈動 → カメラが吸い込まれる
  // ────────────────────────────────────────
  if (doorPhase === 'complete') {
    const t = doorTime;
    const pulse = 0.85 + Math.sin(t * 3.0) * 0.15;

    doorSys.mesh.material.opacity = 0.10 * pulse;

    if (uni) {
      uni.uCrack.value   = pulse;
      uni.uOpacity.value = 0.42;
    }

    for (let i = 0; i < doorSys.count; i++) {
      const ix = i * 3, iy = i * 3 + 1;
      const target = doorSys.targets[i];
      pos[ix] += (target.x - pos[ix]) * 0.08;
      pos[iy] += (target.y - pos[iy]) * 0.08;
    }

    const distToDoor = ACCUM_POINT.z - camera.position.z;
    if (distToDoor < -1.5) {
      const pull = Math.min(0.40, 0.2 + t * 0.2);
      camera.position.z -= pull * Math.abs(distToDoor) * 0.3;
      
      camera.fov = Math.min(110, camera.fov + 3.0);
      camera.updateProjectionMatrix();
    }

    if (uni) {
      const distAbs = Math.abs(distToDoor);
      const t2 = THREE.MathUtils.clamp(
        1 - (distAbs - PORTAL_REVEAL_FULL_DIST) / (PORTAL_REVEAL_START_DIST - PORTAL_REVEAL_FULL_DIST),
        0, 1
      );
      uni.uPortalReveal.value = t2;
    }

    if (Math.abs(distToDoor) < 8.0) {
      doorPhase = 'portal-open';
            if (sakemeSFXBuffer) {
        playSFXBuffer(sakemeSFXBuffer, 0.85);
      }
    }
  }

  // ────────────────────────────────────────
  // Phase 4: ポータルが画面いっぱいに拡大していく
  // ────────────────────────────────────────
if (doorPhase === 'portal-open') {
    const distToDoor = Math.abs(ACCUM_POINT.z - camera.position.z);
    const pull = 0.02;
    camera.position.z -= pull * distToDoor * 0.3;
    camera.fov = Math.min(100, camera.fov + 0.2);
    camera.updateProjectionMatrix();

    if (uni) {
      const t2 = THREE.MathUtils.clamp(
        1 - (distToDoor - PORTAL_REVEAL_FULL_DIST) / (PORTAL_REVEAL_START_DIST - PORTAL_REVEAL_FULL_DIST),
        0, 1
      );
      uni.uPortalReveal.value = t2;
    }

    // ★修正：Web Audio API の source を停止 + space2BGM 開始
    if (distToDoor < 0.5 && !doorSys._switchedToSpace2) {
      doorSys._switchedToSpace2 = true;

      if (starSFXSource) {
        try { starSFXSource.stop(); } catch(e) {}
        starSFXSource = null;
      }

    }

    if (distToDoor < 0.5) {
      doorPhase = 'switched';
    }
  }
  doorSys.geo.attributes.position.needsUpdate = true;
}

// ======================================================
// トリガー・吸引・フェード・固定
// ======================================================
const TRIGGER_DISTANCE = 25;
const DISSOLVE_CAMERA_PUSH = 18;

function checkTriggers() {
  const now = Date.now();

  for (let i = 0; i < photoItems.length; i++) {
    const item = photoItems[i];
    if (!item.loaded) continue;

    if (!item.triggered) {
      const dist = camera.position.distanceTo(item.position);
      const byDistance = dist < TRIGGER_DISTANCE;
      const byClick    = item._clickTriggered === true;
      const byTime     = item.index === 0 && item._loadedAt && (now - item._loadedAt) > 5000;

      if (byDistance || byClick || byTime) {
        item.triggered = true;
        item.attract   = true;
        item._attractStart = Date.now();
      }

      if (i >= 1) {
        const prevItem = photoItems[i - 1];
        if (prevItem && prevItem.dissolving) {
          item.triggered = true;
          item.attract   = true;
          item._attractStart = Date.now();
        }
      }
    }

    if (i >= 1 && item.fixed && !item.dissolving && !item.dissolved) {
      const oldestItem = photoItems[i - 1];
      if (oldestItem && !oldestItem.dissolving && !oldestItem.dissolved) {
        oldestItem.dissolving = true;
        oldestItem._dissolveStart = Date.now();
        oldestItem.viewing = false;
      }
    }
  }
}

// ======================================================
// 写真形成中の粒子収束
// ======================================================
function attractParticles(item) {
  if (!item.attract || !item.particles || item.formed) return;
  const pos = item.particleGeo.attributes.position.array;
  let allClose = true;
  let totalDist = 0;

  const elapsed = (Date.now() - (item._attractStart || Date.now())) * 0.001;
  const speedFactor = 0.03 + elapsed * 0.05;

  for (let i = 0; i < item.particleCount; i++) {
    const ix = i * 3, iy = i * 3 + 1, iz = i * 3 + 2;
    const px = pos[ix], py = pos[iy], pz = pos[iz];
    const t = item.targetPositions[i];

    const dx = (t.x - px) * speedFactor;
    const dy = (t.y - py) * speedFactor;
    const dz = (t.z - pz) * speedFactor;

    pos[ix] = px + dx;
    pos[iy] = py + dy;
    pos[iz] = pz + dz;

    const rdx = t.x - pos[ix];
    const rdy = t.y - pos[iy];
    const rdz = t.z - pos[iz];
    const remain = Math.sqrt(rdx * rdx + rdy * rdy + rdz * rdz);
    totalDist += remain;

    if (Math.sqrt(dx * dx + dy * dy + dz * dz) > 0.01) allClose = false;
  }
  item.particleGeo.attributes.position.needsUpdate = true;

  const avgDist = item.particleCount > 0 ? totalDist / item.particleCount : 0;
  const CONVERGE_REF_DIST = 6.0;
  item._formProgress = Math.min(1, Math.max(0, 1 - avgDist / CONVERGE_REF_DIST));

  if (allClose) item.formed = true;
}

function fadeInPhoto(item) {
  if (!item.formed || item.dissolving || item.dissolved) return;
  if (!item.mesh) return;
  if (item.material.opacity < 1) item.material.opacity += 0.01;

  if (item._particleFadeMult === undefined) item._particleFadeMult = 1;
  const particleFadeBefore = item._particleFadeMult;

  if (item.particles) {
    item._particleFadeMult = Math.max(0, item._particleFadeMult - 0.02);
    if (item._particleFadeMult <= 0.02) item.particles.visible = false;
  }

  if (item.aura) {
    if (!item.aura.visible) item.aura.visible = true;
    const AURA_TARGET = 1.8;
    const gate = 1.0 - Math.min(1, particleFadeBefore);
    const step = 0.01 * (0.12 + gate * 0.88);
    if (item.aura.material.opacity < AURA_TARGET) {
      item.aura.material.opacity = Math.min(AURA_TARGET, item.aura.material.opacity + step);
    }
  }
}

function checkFixed(item) {
  if (!item.formed || item.fixed || !item.mesh) return;
  if (item.material.opacity >= 1) {
    item.fixed = true;
    if (item.particles) item.particles.visible = false;
    const worldPos = item.position.clone().add(new THREE.Vector3(0, 0, 3));
    item.mesh.position.copy(worldPos);
    item.mesh.quaternion.set(0, 0, 0, 1);
    item.viewing = true;
    item.viewStartTime = Date.now();
    item.viewStartZ = camera.position.z;
    item._fixedAt = Date.now();
  }
}

// ======================================================
// 粒子エフェクト更新
// ======================================================
function updateParticleEffects() {
  const now = Date.now();
  const t = now * 0.0035;

  const noise = Math.sin(t * 0.5) * Math.cos(t * 0.7) * 0.03;
  const sparkle = Math.pow(Math.random(), 15) * 0.4;
  backgroundParticles.material.opacity = 0.22 + noise + sparkle;
  backgroundParticles.material.size    = 0.10 + Math.random() * 0.05;

  const accentSparkle = Math.pow(Math.random(), 12) * 0.3;
  accentParticles.material.opacity = 0.50 + Math.sin(t * 0.4) * 0.05 + accentSparkle;

  photoItems.forEach(item => {
    if (!item.particles) return;
    const mat = item.particles.material;
    if (!mat._phase) mat._phase = Math.random() * 10;

    let timeScale = 0.0035;
    let dissolveFactor = 1.0;

    if (item.dissolving && item._dissolveStart) {
      const dElapsed = (now - item._dissolveStart) * 0.001;
      timeScale = 0.001 + dElapsed * 0.004;
      dissolveFactor = Math.max(0.0, 1.0 - dElapsed * 0.7);
    }

    let convergeDamp = 1.0;
    if (item.attract && !item.fixed) {
      const fp = item.formed ? 1 : (item._formProgress || 0);
      const ramp = Math.min(1, Math.max(0, (fp - 0.35) / 0.65));
      convergeDamp = 1.0 - ramp * 0.7;
    }

    const customT = now * timeScale;

    const smooth       = 0.72 + Math.sin(customT * 0.15 + mat._phase) * 0.06;
    const photoSparkle = Math.pow(Math.random(), 100) * 0.12;

    let opacity = Math.min(1.0, smooth + photoSparkle);
    if (item.dissolving) {
      opacity *= dissolveFactor * 0.1;
    } else {
      opacity *= convergeDamp;
      if (item.formed && !item.fixed && item._particleFadeMult !== undefined) {
        opacity *= item._particleFadeMult;
      }
    }
    mat.opacity = opacity;

    let size = 0.8 + Math.sin(customT * 1.3 + mat._phase) * 0.1 + photoSparkle * 0.8;
    if (item.dissolving) {
      size *= dissolveFactor;
    } else if (item.attract && !item.fixed) {
      size *= (0.6 + convergeDamp * 0.4);
      if (item.formed && item._particleFadeMult !== undefined) {
        size *= (0.5 + item._particleFadeMult * 0.5);
      }
    }
    mat.size = size;

    const hueShift = (Math.sin(customT * 0.5 + mat._phase) + 1) / 2;
    const color = new THREE.Color();
    color.setHSL(
      0.08 + hueShift * 0.08,
      0.55 + hueShift * 0.25,
      0.60 + hueShift * 0.30 + photoSparkle * 0.4
    );
    mat.color = color;
  });
}

// ======================================================
// 入力管理（PC・スマホ）
// ======================================================

let targetRotX = 0;
let targetRotY = 0;

let cameraLocked = false;
let cameraAligning = false;

//------------------------------------------------------
// PC
//------------------------------------------------------

window.addEventListener("mousemove", (e) => {

  if (cameraLocked || cameraAligning) return;

  let ty = (e.clientX / window.innerWidth - 0.5) * 0.5;

  const limits = getYawLimits();
  if (limits) {
    ty = Math.max(limits.min, Math.min(limits.max, ty));
  }

  targetRotY = ty;
  targetRotX = (e.clientY / window.innerHeight - 0.5) * 0.3;

});

window.addEventListener("keydown", (e) => {

  if (cameraLocked || cameraAligning) return;

  if (e.key === "ArrowUp") {
    camera.position.z -= 1.5;
  }

  if (e.key === "ArrowDown") {
    camera.position.z += 1.5;
  }

});

// マウスホイール（PC）
window.addEventListener("wheel", (e) => {

  if (cameraLocked || cameraAligning) return;

  camera.position.z += e.deltaY * 0.01;

}, { passive: true });


//------------------------------------------------------
// スマホ
//------------------------------------------------------

let lastTouchX = 0;
let lastTouchY = 0;
let lastPinchDist = 0;

let lastTapTime = 0;
let moveForward = false;
let moveTargetZ = 0;

window.addEventListener("touchstart", (e) => {

  const now = Date.now();

  if (!cameraLocked &&
      !cameraAligning &&
      now - lastTapTime < 300) {

    moveTargetZ = camera.position.z - 5;
    moveForward = true;
  }

  lastTapTime = now;

  if (e.touches.length === 1) {

    lastTouchX = e.touches[0].clientX;
    lastTouchY = e.touches[0].clientY;

  }

  if (e.touches.length === 2) {

    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;

    lastPinchDist = Math.sqrt(dx * dx + dy * dy);

  }

}, { passive: true });


window.addEventListener("touchmove", (e) => {

  if (cameraLocked || cameraAligning) return;

  e.preventDefault();

  if (e.touches.length === 1) {

    const dx = e.touches[0].clientX - lastTouchX;
    const dy = e.touches[0].clientY - lastTouchY;

    targetRotY -= dx * 0.0015;

    camera.position.z -= dy * 0.035;

    const limits = getYawLimits();

    if (limits) {

      targetRotY = Math.max(
        limits.min,
        Math.min(limits.max, targetRotY)
      );

    } else {

      targetRotY = Math.max(
        -0.5,
        Math.min(0.5, targetRotY)
      );

    }

    lastTouchX = e.touches[0].clientX;
    lastTouchY = e.touches[0].clientY;

  }

  if (e.touches.length === 2) {

    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;

    lastPinchDist = Math.sqrt(dx * dx + dy * dy);

  }

}, { passive: false });

// ======================================================
// 事前確保ベクトル
// ======================================================
const _basePos = new THREE.Vector3();

// ======================================================
// mainScene 完全破棄
// ======================================================
let mainSceneDisposed = false;

function disposeMainScene() {
  if (mainSceneDisposed) return;
  mainSceneDisposed = true;

  console.log('mainScene を破棄しています（GPUメモリ解放）...');

  function disposeMaterial(mat) {
    if (!mat) return;
    if (Array.isArray(mat)) { mat.forEach(disposeMaterial); return; }
    Object.keys(mat).forEach((key) => {
      const value = mat[key];
      if (value && value.isTexture) value.dispose();
    });
    mat.dispose();
  }

  scene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) disposeMaterial(obj.material);
  });

  while (scene.children.length > 0) {
    scene.remove(scene.children[0]);
  }

  if (particleTexture) particleTexture.dispose();

  photoItems.forEach((item) => {
    item.mesh = null;
    item.material = null;
    item.aura = null;
    item.particles = null;
    item.particleGeo = null;
    item._img = null;
  });

  doorSys = null;
  portalPlane = null;
  accumulationGlow = null;

  composer.passes.forEach((pass) => {
    if (pass.renderTarget) pass.renderTarget.dispose?.();
    if (pass.renderTargetsHorizontal) {
      pass.renderTargetsHorizontal.forEach((rt) => rt.dispose?.());
    }
    if (pass.renderTargetsVertical) {
      pass.renderTargetsVertical.forEach((rt) => rt.dispose?.());
    }
    if (pass.renderTargetBright) pass.renderTargetBright.dispose?.();
  });
  if (composer.renderTarget1) composer.renderTarget1.dispose();
  if (composer.renderTarget2) composer.renderTarget2.dispose();

  console.log('mainScene の破棄が完了しました。');
}

// ======================================================
// アニメーションループ
// ======================================================
const LOOP_LENGTH = PHOTO_FILES.length * SPIRAL_CONFIG.zStep;
const mainClock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  if (getPortalState() === 'switched') {
    const { scene: exScene, camera: exCamera, update: exUpdate } = getExhibition();
    const delta = mainClock.getDelta();
    exUpdate(delta);
    renderer.render(exScene, exCamera);
    return;
  }

  const now = performance.now();

  if (!cameraLocked && !cameraAligning) {
    camera.position.z -= 0.006;
  }

  if (moveForward) {
    camera.position.z += (moveTargetZ - camera.position.z) * 0.15;
    if (Math.abs(moveTargetZ - camera.position.z) < 0.03) {
      camera.position.z = moveTargetZ;
      moveForward = false;
    }
  }

  if (!cameraLocked && !cameraAligning) {
    camera.rotation.y += (targetRotY - camera.rotation.y) * 0.08;
    camera.rotation.x += (targetRotX - camera.rotation.x) * 0.08;
  }

  backgroundParticles.rotation.y += 0.00008;
  backgroundParticles.rotation.x += 0.00002;
  accentParticles.rotation.y     += 0.0002;
  accentParticles.rotation.x     += 0.00005;

  const positions = backgroundParticles.geometry.attributes.position.array;
  const speeds = backgroundParticles.userData.speeds;
  for (let i = 0; i < speeds.length; i++) {
    positions[i * 3]     += Math.sin(now * 0.00015 + i) * 0.002;
    positions[i * 3 + 1] += Math.cos(now * 0.00012 + i) * 0.0015;
    positions[i * 3 + 2] += speeds[i];
    if (positions[i * 3 + 2] > camera.position.z + 20) {
      positions[i * 3 + 2] = camera.position.z - 40 - Math.random() * 260;
      const spreadAngle = Math.random() * Math.PI * 2;
      const spreadR = 15 + Math.pow(Math.random(), 0.5) * 70;
      positions[i * 3]     = Math.cos(spreadAngle) * spreadR;
      positions[i * 3 + 1] = Math.sin(spreadAngle) * spreadR * 0.5;
    }
  }
  backgroundParticles.geometry.attributes.position.needsUpdate = true;

  backgroundParticles.position.copy(camera.position);
  accentParticles.position.copy(camera.position);

  if (!loopDisabled && camera.position.z < -LOOP_LENGTH) {
    camera.position.z += LOOP_LENGTH;
    photoItems.forEach(item => {
      item.triggered       = false;
      item.attract         = false;
      item.formed          = false;
      item.fixed           = false;
      item.dissolving      = false;
      item.dissolved        = false;
      item.viewing         = false;
      item._dissolvePhase  = null;
      item._auraActivated  = false;
      item._clickTriggered = false;
      item._particleFadeMult = 1;
      if (item.material) item.material.opacity = 0;
      if (item.aura) {
        item.aura.material.opacity = 0;
        item.aura.visible = false;
      }
      if (item.particles) {
        item.particles.visible = true;
        item.particles.material.opacity = 0.75;
      }
      if (item.particleGeo) {
        const pos = item.particleGeo.attributes.position.array;
        for (let i = 0; i < item.particleCount; i++) {
          const r     = 50 * Math.cbrt(Math.random());
          const theta = Math.random() * Math.PI * 2;
          const phi   = Math.acos(2 * Math.random() - 1);
          pos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
          pos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
          pos[i*3+2] = r * Math.cos(phi);
        }
        item.particleGeo.attributes.position.needsUpdate = true;
      }
    });
  }

  checkTriggers();

  if (!cameraLocked && !cameraAligning) {
    const AVOID_RADIUS_Z = 12;
    const AVOID_RADIUS_X = 6;
    for (let i = 0; i < photoItems.length; i++) {
      const item = photoItems[i];
      if (!item.triggered || item.dissolved || !item.mesh) continue;
      const dx = camera.position.x - item.mesh.position.x;
      const dz = camera.position.z - item.mesh.position.z;
      const distZ = Math.abs(dz);
      if (distZ < AVOID_RADIUS_Z) {
        const ease = 1.0 - (distZ / AVOID_RADIUS_Z);
        const avoidStrength = Math.pow(ease, 2);
        const pushDir = dx >= 0 ? 1 : -1;
        const targetX = item.mesh.position.x + pushDir * AVOID_RADIUS_X;
        camera.position.x += (targetX - camera.position.x) * avoidStrength * 0.1;
      }
    }
  }

  const t = now * 0.0005;
  for (let i = 0; i < photoItems.length; i++) {
    const item = photoItems[i];
    if (item.dissolved) continue;
    attractParticles(item);
    fadeInPhoto(item);
    checkFixed(item);
    dissolvePhoto(item);
    if (item.fixed && !item.dissolving && item.mesh) {
      const floatY = Math.sin(t + item.index * 1.5) * 0.8;
      const floatX = Math.cos(t * 0.7 + item.index * 1.2) * 0.4;
      _basePos.copy(item.position);
      _basePos.z += 3;

      const pdx = item.mesh.position.x - camera.position.x;
      const pdz = item.mesh.position.z - camera.position.z;
      const distXZ = Math.sqrt(pdx * pdx + pdz * pdz);
      
      const hitDist = 10.0;
      const pushPower = 0.10;

      if (item._vx === undefined) { item._vx = 0; item._vz = 0; }

      if (distXZ < hitDist && distXZ > 0.01) {
        const dirX = pdx / distXZ;
        const dirZ = pdz / distXZ;

        const pushDirX = dirX >= 0 ? 1 : -1;
        item._vx += pushDirX * pushPower * 0.5;
        item._vz += (dirZ >= 0 ? 1 : -1) * pushPower;
      }

      item._vx *= 0.98;
      item._vz *= 0.98;

      if (item._repelX === undefined) { item._repelX = 0; item._repelZ = 0; }
      item._repelX += item._vx;
      item._repelZ += item._vz;

      item._repelX *= 0.995;
      item._repelZ *= 0.995;

      const mx = _basePos.x + floatX + item._repelX;
      const my = _basePos.y + floatY;
      const mz = _basePos.z + item._repelZ;
      item.mesh.position.set(mx, my, mz);

      _basePos.copy(camera.position);
      _basePos.y = item.mesh.position.y;
      
      const currentRotation = item.mesh.quaternion.clone();
      item.mesh.lookAt(_basePos);
      const targetRotation = item.mesh.quaternion.clone();
      
      item.mesh.quaternion.copy(currentRotation);
      item.mesh.quaternion.slerp(targetRotation, 0.005);

      if (item.aura) {
        item.aura.position.copy(item.mesh.position);
        item.aura.quaternion.copy(item.mesh.quaternion);
      }
    }
  }

  backgroundParticles.material.uniforms.uTime.value = now * 0.001;
  updateParticleEffects();

  const bgMat = backgroundParticles.material;
  bgMat.opacity = 0.38 + Math.sin(now * 0.0006) * 0.015;
  bgMat.size    = 0.20 + Math.sin(now * 0.00012) * 0.035;

  checkDissolvedAndAccumulate();
  updateAccumulationGlow();
  updateDoor();
  updatePortal();

  if (doorPhase === 'switched') {
    completePortalSwitch();
    disposeMainScene();
    getExhibition().activateIntro?.();
    return;
  }

  composer.render();
}

// ======================================================
// 粒子がランダムに渦巻き消える
// ======================================================
function dissolvePhoto(item) {
  if (!item.loaded || item.dissolved) return;

  if (item.viewing && item._fixedAt && !item.dissolving) {
    const timeElapsed = (Date.now() - item._fixedAt) > 5000;

    let cameraApproached = false;
    if (item.mesh) {
      const pdx = item.mesh.position.x - camera.position.x;
      const pdz = item.mesh.position.z - camera.position.z;
      const distXZ = Math.sqrt(pdx * pdx + pdz * pdz);
      
      if (distXZ < 6.0) {
        cameraApproached = true;
      }
    }

    if (timeElapsed || cameraApproached) {
      item.dissolving = true;
      item.viewing = false;
    }
  }

  if (!item.dissolving) return;

  if (!item._photoFadedOut) {
    if (item.particles) {
      item.particles.visible = true;
      if (item.particles.material.opacity < 1.0) {
        item.particles.material.opacity += 0.005;
      }
    }

    if (item.mesh && item.material.opacity > 0) item.material.opacity -= 0.005;
    if (item.aura && item.aura.material.opacity > 0) item.aura.material.opacity -= 0.005;

    if (item.material.opacity <= 0) {
      item._photoFadedOut = true;
      
      if (item.mesh) { scene.remove(item.mesh); item.mesh = null; }
      if (item.aura) { scene.remove(item.aura); item.aura = null; }

      item._vortexTime = 0;

      item._particleNoises = [];
      for (let i = 0; i < item.particleCount; i++) {
        item._particleNoises.push({
          angleOffset: Math.random() * Math.PI * 2,
          radiusOffset: Math.random() * 200 - 50,
          speedMod: 0.3 + Math.random() * 1.2
        });
      }
    }
    return;
  }

  if (item.particles && item.particleGeo && item._particleNoises) {
    const pos = item.particleGeo.attributes.position.array;
    
    item._vortexTime += 0.004;
    const progress = Math.min(1.0, item._vortexTime);

    for (let i = 0; i < item.particleCount; i++) {
      const ix = i * 3, iy = i * 3 + 1, iz = i * 3 + 2;
      
      const baseTarget = item.targetPositions[i];
      const noise = item._particleNoises[i];
      
      const initialAngle = Math.atan2(baseTarget.y, baseTarget.x);
      const initialRadius = Math.sqrt(baseTarget.x * baseTarget.x + baseTarget.y * baseTarget.y);
      
      const angle = initialAngle + noise.angleOffset + (item._vortexTime * 3.0 * noise.speedMod);
      
      const currentRadius = Math.max(0, (initialRadius + noise.radiusOffset) * (1.0 - progress));
      
      const targetZ = baseTarget.z - (progress * 60);

      const vortexX = Math.cos(angle) * currentRadius;
      const vortexY = Math.sin(angle) * currentRadius;
      const vortexZ = targetZ;

      pos[ix] += (vortexX - pos[ix]) * 0.04;
      pos[iy] += (vortexY - pos[iy]) * 0.04;
      pos[iz] += (vortexZ - pos[iz]) * 0.04;
    }
    item.particleGeo.attributes.position.needsUpdate = true;

    if (progress > 0.4) {
      item.particles.material.opacity = Math.max(0, 1.0 - (progress - 0.6) * 1.2);
    }
  }

  if (item._vortexTime >= 1.0 || (item.particles && item.particles.material.opacity <= 0)) {
    item.dissolved = true;
    if (item.particles) { scene.remove(item.particles); item.particles = null; }
  }
}

animate();

// ======================================================
// フルスクリーン（スマホ）
// ======================================================
window.addEventListener('touchstart', () => {

  if (!document.fullscreenElement) {

    document.documentElement.requestFullscreen?.();

  }

}, { once: true });

// ======================================================
// リサイズ
// ======================================================
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.resolution.set(window.innerWidth, window.innerHeight);
  resizePortal();
});