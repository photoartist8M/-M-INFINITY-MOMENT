import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import {
  initPortal,
  updatePortal,
  getPortalState,
  completePortalSwitch,
  getExhibition,
  resizePortal,
} from './portal.js';

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
// 裂け目（記憶の星雲）の広がり半径（追加）
// ------------------------------------------------------
// ★JS側のパーティクル雲の広がりと、GLSL側のfbm星雲テクスチャの
//   スケールを揃えるための共有定数。多角形の輪郭は使わず、
//   ここを基準にした「濃淡のある曖昧な雲」として裂け目を表現する。
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
// ------------------------------------------------------
// ★修正版：以前の実装には2つの致命的なバグがあった。
//   ① centerBoostが中心付近(半径1.4程度)のdensityを常に0.7〜1.0に
//     強制していたため、ノイズで揺らめく星雲ではなく「常時ベタ塗りの
//     白い円盤」が固定表示されていた（＝白飛びの正体）。
//   ② 次空間が完全に開いた(apertureMask=1)後も、finalColorを
//     もう一度finalGasColor（ほぼ白）で25%上書きしていたため、
//     開口自体は開いていても常に白いベールがかかって次空間が
//     見えなくなっていた。
//   → centerBoostはノイズに応じて緩やかに底上げする程度に弱め、
//     開口後の再上書き処理は完全に削除した。
// ======================================================
function createPortalPlane() {
  const PLANE_SIZE = 10;
  const geo = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE, 1, 1);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime:    { value: 0 },
      uWarp:    { value: 0 },
      uCrack:   { value: 0 },
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
      float fbm(vec2 p) {
        float v = 0.0;
        float amp = 0.5;
        for (int i = 0; i < 5; i++) {
          v += amp * vnoise(p);
          p *= 2.0; // ★修正(2.02→2.0): 木目っぽい高周波の重なりを少し抑える
          amp *= 0.5;
        }
        return v;
      }

      // ★修正：筋を細く鋭くしすぎず、ぼんやりした光の帯に近づける
      float streaks(vec2 p, float angle, float t) {
        float s = 0.0;
        for (int i = 0; i < 2; i++) { // ★修正(3→2): 筋の重なりを減らす
          float fi = float(i);
          float freq  = 5.0 + fi * 3.0; // ★修正：周波数を下げて筋を太く・少なく
          float phase = t * (0.2 + 0.06 * fi);
          float v = abs(sin(angle * freq + phase + fbm(p * 1.6 + fi * 3.1) * 2.2));
          s += pow(1.0 - v, 8.0) * (1.0 / (fi + 1.0)); // ★修正(16.0→8.0): エッジを柔らかく
        }
        return s;
      }

      void main() {
        vec2 wp = (vUv - 0.5) * PLANE_SIZE;
        float radius = length(wp);
        float angle  = atan(wp.y, wp.x);

        vec2 p = wp * 0.30 + vec2(0.0, uTime * 0.025); // ★修正(0.55→0.42): 模様のスケールを大きく＝柔らかく
        vec2 q = vec2(fbm(p), fbm(p + vec2(5.2, 1.3)));
        vec2 r = vec2(
          fbm(p + 3.0 * q + vec2(1.7, 9.2) + 0.10 * uTime), // ★修正(4.0→3.0): ワープを弱めて滑らかに
          fbm(p + 3.0 * q + vec2(8.3, 2.8) + 0.08 * uTime)
        );
        float cloud = fbm(p + 3.0 * r);

        float radialFalloff = pow(clamp(1.0 - radius / NEBULA_MAX_R, 0.0, 1.0), 1.6); // ★修正(1.4→1.6): 外側への滲みを穏やかに

        float centerBoost = smoothstep(NEBULA_MAX_R * 0.28, 0.0, radius);
       float density =
mix(
    radialFalloff*0.4,
    cloud*radialFalloff,
    0.65
);
        density = clamp(density, 0.0, 1.0);
        density *= radialFalloff;

        float streakFalloff = radialFalloff * radialFalloff;
        float streakVal = streaks(wp * 0.4, angle, uTime) * streakFalloff * 0.35; // ★修正：筋の強さ全体を0.35倍に大幅減衰

        // 展示空間の色が裂け目から漏れ出すイメージ

vec3 outerColor = vec3(0.10, 0.11, 0.18);   // 暗い空間

vec3 pastelBlue   = vec3(0.72, 0.84, 1.00);
vec3 pastelPink   = vec3(1.00, 0.82, 0.90);
vec3 pastelPurple = vec3(0.82, 0.76, 1.00);
vec3 pastelMint   = vec3(0.78, 0.96, 0.90);

float c1 = 0.5 + 0.5*sin(uTime*0.06);
float c2 = 0.5 + 0.5*sin(uTime*0.05 + 2.2);

vec3 midColor =
mix(
    mix(pastelBlue, pastelPink, c1),
    mix(pastelPurple, pastelMint, c2),
    cloud
);

vec3 coreColor =
vec3(0.99,0.99,0.98);
        float pastelNoise =
fbm(
    p*0.6 +
    vec2(
        uTime*0.02,
        uTime*0.015
    )
);

vec3 flowingColor =
mix(
    pastelBlue,
    pastelPink,
    pastelNoise
);

flowingColor =
mix(flowingColor,pastelPurple,cloud);

flowingColor =
mix(flowingColor,pastelMint,r.x);

vec3 color =mix(
    outerColor,
    flowingColor,
    smoothstep(0.12,0.60,density)
);
        color = mix(color, coreColor, smoothstep(0.58, 1.0, density) * smoothstep(NEBULA_MAX_R * 0.45, 0.0, radius));
        color += vec3(1.0,0.90,0.95)
       * streakVal
       * 0.18; // ★修正：筋の色も柔らかいピンク寄りに、強さも減衰

        float alpha = clamp(density * 0.7 + streakVal * 0.35, 0.0, 1.0); // ★修正：全体の濃さ上限をさらに少し抑える
        alpha *= uCrack * uOpacity;
        vec3 finalGasColor = color * uCrack;

        float noiseWarp = (cloud - 0.5) * 0.7; // ★修正(0.9→0.7): 開口の縁のガタつきを抑える
        float openR  = NEBULA_MAX_R * 0.5 * clamp(uPortalReveal, 0.0, 1.0);
        float feather = 1.1 + uWarp * 0.6; // ★修正(0.9→1.1): 開口の境界をより滑らかに
        float apertureMask = smoothstep(openR + noiseWarp, openR + noiseWarp - feather, radius);
        apertureMask *= step(radius, NEBULA_MAX_R * 0.58);

        vec3 portalColor = texture2D(uPortalTex, vUv).rgb;
        vec3 finalColor = mix(finalGasColor, portalColor, apertureMask);

        float finalAlpha = max(alpha, apertureMask);

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
// ----------------------------------------------------
// 画像の読み込みエラー・破損・タイムアウト対策
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
  item.dissolved  = true; // checkDissolvedAndAccumulate が検知し蓄積カウントへ加算する
}

// ======================================================
// 写真ロード & オブジェクト生成
// ======================================================
function loadPhotoItem(item) {
  const img = new Image();
  let settled = false;

  // ネットワーク遅延やハングで onload/onerror が発火しない場合の保険
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
      return; // 不正な画像は処理しない
    }

    settled = true;
    clearTimeout(failTimeoutId);

    item._img = img;
    const isMobile = window.innerWidth <= 768;

    const frameHeight = isMobile ? 9.5 : 10;

    const aspect = img.width / img.height;

    let baseWidth = frameHeight * aspect;
    let baseHeight = frameHeight;


    // 横長写真を制限
    if (baseWidth > 14) {
      baseWidth = 14;
      baseHeight = baseWidth / aspect;
    }

    // 縦写真を制限
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
  const borderSize = 0.04; // 枠の太さ
  const outerW = baseWidth  + borderSize * 2;
  const outerH = baseHeight + borderSize * 2;

  const shape = new THREE.Shape();
  shape.moveTo(-outerW / 2, -outerH / 2);
  shape.lineTo( outerW / 2, -outerH / 2);
  shape.lineTo( outerW / 2,  outerH / 2);
  shape.lineTo(-outerW / 2,  outerH / 2);
  shape.closePath();

  // 穴のサイズを写真メッシュと完全一致させる
  const hole = new THREE.Path();
  hole.moveTo(-baseWidth / 2, -baseHeight / 2);
  hole.lineTo( baseWidth / 2, -baseHeight / 2);
  hole.lineTo( baseWidth / 2,  baseHeight / 2);
  hole.lineTo(-baseWidth / 2,  baseHeight / 2);
  hole.closePath();
  shape.holes.push(hole);

  const geo = new THREE.ShapeGeometry(shape);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.6, 1.6, 1.6), // 光量
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  item.aura = new THREE.Mesh(geo, mat);
  // 写真メッシュと同じz位置にして隙間をなくす
  item.aura.position.copy(item.position).add(new THREE.Vector3(0, 0, 3.0));
  item.aura.visible = false;
  item.aura.layers.enable(BLOOM_LAYER);
  scene.add(item.aura);
}

photoItems.forEach(item => loadPhotoItem(item));

// ======================================================
// dissolvedになった瞬間を検知（追加）
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
// ------------------------------------------------------
// カメラを裂け目正面・適正距離へ補正してからロックする
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
const RIFT_VIEW_DISTANCE      = 5.5;    // Phase4のdistToDoor想定初期値(6.0)と一致させる
const CAMERA_ALIGN_DURATION   = 2500; // カメラ補正にかける時間(ms)　1秒
const RIFT_BASE_FOV           = 75;   // カメラ初期FOV（吸い込み演出の基準値）

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

function alignCameraToRiftAndLock() {
  cameraAligning = true; // 補正中は既存のカメラ操作・自動処理を無効化

  camera.up.set(0, 1, 0); // ロールのねじれを防ぐため基準を明示的にリセット

  const startPos  = camera.position.clone();
  const startQuat = camera.quaternion.clone();
  const startFov  = camera.fov;

  // 目標位置：ACCUM_POINTの真正面・Z軸上・適正距離
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
    }
  }

  requestAnimationFrame(animateAlign);
}

// ======================================================
// 記憶の星雲・裂け目 ターゲット座標
// ------------------------------------------------------
// ★多角形の輪郭ではなく、中心ほど密度が高い「立体的な星雲の雲」として
//   粒子を配置する。若干の奥行き(z jitter)も持たせ、平面的なリング
//   ではなく、ふわっと膨らんだガスの塊のように見えるようにしている。
// ======================================================
function getDoorTargetPositions(count) {
  const targets = [];
  const cx = ACCUM_POINT.x;
  const cy = ACCUM_POINT.y;
  const cz = ACCUM_POINT.z;

  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    // 中心ほど密度が高くなるように、べき乗分布で半径を決める
    const r = NEBULA_MAX_R * Math.pow(Math.random(), 2.0);

    const jitterZ = (Math.random() - 0.5) * 2.2; // 奥行きを持たせ立体的な雲に
    const jitterXY = (Math.random() - 0.5) * 0.3;

    const x = cx + r * Math.cos(theta) + jitterXY;
    const y = cy + r * Math.sin(theta) + jitterXY;
    const z = cz + jitterZ;

    targets.push(new THREE.Vector3(x, y, z));
  }

  return targets;
}
// ======================================================
// 裂け目パーティクルシステムの作成（軽量・高品質）
// ======================================================
// ★変更：黄色とオレンジの粒子をより「キラキラ」させるため、彩度を下げて白に近づけ、高明度に。
// 裂け目パーティクルの色パレット（記憶・次空間を思わせる複数色）
const DOOR_PARTICLE_PALETTE = [
  new THREE.Color(0xffe0b3), // ★変更(ffb066->ffe0b3): 淡い琥珀色（黄色寄り）
  new THREE.Color(0xfbf0db), // ★変更(f5d98c->fbf0db): 極めて淡いゴールド
  new THREE.Color(0xfff8f0), // ★変更(fff2df->fff8f0): ほぼ白に近い暖白
];

function createDoorParticles() {
  const count = 1400; // 軽量だが密度感を保つバランス値
  const pos    = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3); // ★追加：粒子ごとの色
  const sizes  = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const r     = Math.random() * 2.5;
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    pos[i * 3]     = ACCUM_POINT.x + r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = ACCUM_POINT.y + r * Math.sin(phi) * Math.sin(theta);
    pos[i * 3 + 2] = ACCUM_POINT.z + r * Math.cos(phi);
    // ★微調整: 粒子の大小バラつきを少し抑え、全体的にシャープに
    sizes[i] = 0.14 + Math.random() * 0.16;

    const c = DOOR_PARTICLE_PALETTE[Math.floor(Math.random() * DOOR_PARTICLE_PALETTE.length)];
    colors[i * 3]     = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3)); // ★追加

  const mat = new THREE.PointsMaterial({
    map: particleTexture,
    vertexColors: true, // ★追加：粒子ごとの色を有効化
    color: 0xffffff,    // ベースは白（vertexColorsと掛け合わされる）
    size: 0.06,         // ★小さく(0.09->0.06): 粒子を小さくしてシャープな煌めきに
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geo, mat);
  scene.add(points);

  // 对数螺旋（台風の目）用のパラメータ
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

  // ▼追加：Portal(RenderTarget)方式の初期化。ここから次空間のプリロードが始まる
  initPortal(renderer, portalPlane);
}
// ======================================================
// 蓄積光のアニメーション更新（追加）
// ======================================================
function updateAccumulationGlow() {
  if (!accumulationGlow || accumulatedCount === 0) return;
  if (doorPhase !== 'none') return; // ★追加：裂け目演出が始まったら蓄積光は不要。同じ場所での多重加算による白飛びを防ぐ
  const t     = Date.now() * 0.001;
  const ratio = accumulatedCount / PHOTO_FILES.length;

  accumulationGlow.children.forEach((mesh, i) => {
    // レイヤーごとに異なる呼吸リズム
    const breathe = Math.sin(t * 0.9 + i * 0.8) * 0.5
                  + Math.sin(t * 0.4 + i * 0.3) * 0.3
                  + Math.sin(t * 1.6 + i * 1.2) * 0.2;

    // 0〜1の範囲に正規化（0.5基準）
    const pulse = 0.5 + breathe * 0.5;

    mesh.material.opacity =
      mesh.userData.baseOpacity * ratio * pulse;

    // 外側レイヤーほどゆっくり大きくなる
    const scaleBreath = 1.0 + Math.sin(t * 0.7 + i * 0.6) * 0.12;
    mesh.scale.setScalar(scaleBreath);
  });
}

// ======================================================
// ドアアニメーションの更新
// ======================================================
function updateDoor() {
  if (doorPhase === 'none' || !doorSys) return;

  // ★高速化(0.004->0.006): アニメーション自体の進行速度を上げる
  doorTime += 0.006;
  const pos = doorSys.geo.attributes.position.array;
  const uni = portalPlane ? portalPlane.material.uniforms : null;
  if (uni) uni.uTime.value = doorTime;

  // ────────────────────────────────────────
  // Phase 1: 台風の目のような対数螺旋で渦が巻き始める
  // ────────────────────────────────────────
  if (doorPhase === 'spiraling') {
    const SPIRAL_DUR = 1.4; // 渦巻き時間
    const sp    = Math.min(1.0, doorTime / SPIRAL_DUR);
    const accel = Math.pow(sp, 2.2);

    // ★白飛び抑制: 最大透明度を抑える(0.38->0.25)
    doorSys.mesh.material.opacity = Math.min(0.25, doorTime * 0.4);

    if (uni) {
      uni.uOpacity.value = Math.min(0.55, sp * 0.75);
      uni.uWarp.value    = sp;
    }

    // 対数螺旋の巻き込み係数（中心に近いほど速く回る）
    const B = 1.6; // 螺旋のきつさ（大きいほど急に巻く）

    for (let i = 0; i < doorSys.count; i++) {
      const ix = i * 3, iy = i * 3 + 1, iz = i * 3 + 2;
      const noise  = doorSys.noises[i];
      const target = doorSys.targets[i];

      const dx       = target.x - ACCUM_POINT.x;
      const dy       = target.y - ACCUM_POINT.y;
      const finalR   = Math.sqrt(dx * dx + dy * dy);
      const finalAng = Math.atan2(dy, dx);

      // 現在の半径（外側→中心へ収束していく）
      const curR = Math.max(0.05, (finalR + noise.radiusMod * (1 - sp)) * sp);

      // 対数螺旋：半径が小さいほど角速度が指数的に増す
      const radiusFactor = 1.0 / (curR + 0.3); // 中心に近いほど大きくなる
      const rotSpeed = (0.5 + accel * 9.0) * (1.0 + radiusFactor * B);

      const curAng = finalAng
                   + noise.angleOffset * (1 - sp) * 0.4
                   + doorTime * noise.speedMod * rotSpeed;

      const tx = ACCUM_POINT.x + Math.cos(curAng) * curR;
      const ty = ACCUM_POINT.y + Math.sin(curAng) * curR;
      const followSpeed = 0.045 + accel * 0.07;

      pos[ix] += (tx - pos[ix]) * followSpeed;
      pos[iy] += (ty - pos[iy]) * followSpeed;
      pos[iz] += (ACCUM_POINT.z - pos[iz]) * 0.04;

      // ★粒子を小さく: 渦巻き中のサイズ増加を抑える
      doorSys.mesh.material.size = 0.10 + accel * 0.15 + noise.sizeScale * 0.10;
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
    const FORM_DUR      = 0.8; // ★高速化(1.2->0.8): 形状形成時間を短縮
    const fp            = Math.min(1.0, doorTime / FORM_DUR);
    const swirlStrength = 1.0 - fp;
    const B = 1.6;

    // ★白飛び抑制: 不透明度を維持しつつ少し下げる(0.25)
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

      // ★粒子を小さく: 収束時のサイズを小さく
      doorSys.mesh.material.size = 0.20 - fp * 0.12 + noise.sizeScale * 0.06;
    }

    if (doorTime > FORM_DUR) {
      doorPhase = 'complete';
    }
  }

  // ────────────────────────────────────────
  // Phase 3: 星雲が脈動 → カメラが吸い込まれる → ポータル拡大開始
  // ────────────────────────────────────────
  if (doorPhase === 'complete') {
    const t = doorTime;
    // ★高速化(2.2->3.0): 脈動のリズムを速く
    const pulse = 0.85 + Math.sin(t * 3.0) * 0.15;

    // ★白飛び抑制・中心可視化: 脈動時の透明度を大幅に下げる(0.16->0.10)
    // 加算合成による中心の白潰れを防ぎ、次空間が見えるようにする
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

    // カメラを裂け目へ吸い込む
    const distToDoor = ACCUM_POINT.z - camera.position.z;
    if (distToDoor < -1.5) {
      // ★高速化(0.15->0.20, 0.03->0.05): 基本速度と加速度を上げる
      const pull = Math.min(0.40, 0.2 + t * 0.2); 
      camera.position.z -= pull * Math.abs(distToDoor) * 0.3;
      
      // ★高速化(+0.4->+0.5): FOVの変化量を増やし、スピード感を強調
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

    // ★高速化(6.0->8.0): 次空間への切り替え判定距離を少し手前に
    if (Math.abs(distToDoor) < 8.0) {
      doorPhase = 'portal-open';
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
        item._attractStart = Date.now(); // 【追加】時間経過で加速させるためのタイマー
      }

      if (i >= 1) {
        const prevItem = photoItems[i - 1];
        if (prevItem && prevItem.dissolving) {
          item.triggered = true;
          item.attract   = true;
          item._attractStart = Date.now(); // 【追加】
        }
      }
    }

    if (i >= 1 && item.fixed && !item.dissolving && !item.dissolved) {
      const oldestItem = photoItems[i - 1];
      if (oldestItem && !oldestItem.dissolving && !oldestItem.dissolved) {
        oldestItem.dissolving = true;
        oldestItem._dissolveStart = Date.now(); // 【追加】消滅開始時刻を記録
        oldestItem.viewing = false;
      }
    }
  }
}

// ======================================================
// 【修正】写真形成中の粒子収束と白飛び抑制
// ------------------------------------------------------
// 元の実装は粒子が写真の形に収束していく最終局面で密集しすぎ、
// 加算合成(Additive Blending)の重なりにより白飛びしていた。
// ここでは収束度(_formProgress)を計算するだけに留め、
// 実際の見た目（不透明度・サイズ・色）の抑制は
// updateParticleEffects 側に一本化する（責務を分けて事故を防ぐ）。
// ======================================================
function attractParticles(item) {
  if (!item.attract || !item.particles || item.formed) return;
  const pos = item.particleGeo.attributes.position.array;
  let allClose = true;
  let totalDist = 0;

  const elapsed = (Date.now() - (item._attractStart || Date.now())) * 0.001;
  const speedFactor = 0.06 + elapsed * 0.05;

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

  // 収束度(0=散らばっている, 1=ほぼ写真の形)を保存しておく
  const avgDist = item.particleCount > 0 ? totalDist / item.particleCount : 0;
  const CONVERGE_REF_DIST = 6.0;
  item._formProgress = Math.min(1, Math.max(0, 1 - avgDist / CONVERGE_REF_DIST));

  if (allClose) item.formed = true;
}

function fadeInPhoto(item) {
  if (!item.formed || item.dissolving || item.dissolved) return;
  if (!item.mesh) return;
  if (item.material.opacity < 1) item.material.opacity += 0.01;

  // 【修正】これまでは item.particles.material.opacity を直接減算していたが、
  // 同じフレーム内で後から呼ばれる updateParticleEffects() がその値を
  // 毎回まるごと上書きしてしまい、実質フェードアウトが機能していなかった。
  // → 減衰は独立した係数 item._particleFadeMult (0〜1) として持たせ、
  //   updateParticleEffects 側でこれを最終的な不透明度に掛け合わせることで
  //   両者が衝突しないようにする。
  if (item._particleFadeMult === undefined) item._particleFadeMult = 1;
  const particleFadeBefore = item._particleFadeMult;

  if (item.particles) {
    item._particleFadeMult = Math.max(0, item._particleFadeMult - 0.02);
    if (item._particleFadeMult <= 0.02) item.particles.visible = false;
  }

  if (item.aura) {
    // 【修正】粒子(加算合成)がまだ明るく残っている間にオーラ(加算合成+Bloom)を
    // 同時に立ち上げると、重なった瞬間だけBloomが強く反応して白飛びする。
    // オーラの最終的な明るさ・色は一切変えず、粒子が十分減光してから
    // 立ち上がり始めるようタイミングだけをずらして重なりのピークを避ける。
    if (!item.aura.visible) item.aura.visible = true;
    const AURA_TARGET = 1.2;
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

  // 【修正】周りの雲が外に伸びすぎないよう、不規則なランダムパターンにして広がりを抑える
  const noise = Math.sin(t * 0.5) * Math.cos(t * 0.7) * 0.03;
  const sparkle = Math.pow(Math.random(), 15) * 0.4;
  backgroundParticles.material.opacity = 0.22 + noise + sparkle;
  backgroundParticles.material.size    = 0.10 + Math.random() * 0.05;

  const accentSparkle = Math.pow(Math.random(), 12) * 0.3;
  accentParticles.material.opacity = 0.50 + Math.sin(t * 0.4) * 0.05 + accentSparkle;

  // 写真粒子
  photoItems.forEach(item => {
    if (!item.particles) return;
    const mat = item.particles.material;
    if (!mat._phase) mat._phase = Math.random() * 10;

    // 【修正】グルグル渦巻くスピード：消滅開始からの時間経過で、最初は遅く、段々早くする
    let timeScale = 0.0035; 
    let dissolveFactor = 1.0;

    if (item.dissolving && item._dissolveStart) {
      const dElapsed = (now - item._dissolveStart) * 0.001; // 消滅してからの秒数
      
      // 最初は遅く(0.001)、段々早く(最高0.012以上)
      timeScale = 0.001 + dElapsed * 0.004; 
      
      // 【修正】中心の白飛びをさらにガッツリ低減（不透明度を大幅にカット）
      dissolveFactor = Math.max(0.0, 1.0 - dElapsed * 0.7); 
    }

    // 【修正】写真"形成中〜まだ固定されていない間"の白飛び抑制係数。
    // ★重要な修正: 以前は「!item.formed」（収束しきる前まで）でしか効いておらず、
    //   一番粒子が密集する「収束し終わった直後(formed=trueになった瞬間)」に
    //   ダンピングが切れてフル輝度に戻ってしまい、そこが実際のフラッシュの原因だった。
    //   → 「item.fixed になるまで」(=写真として完全固定されるまで)ずっと
    //     効かせ続けるようにし、最も密集するピークの瞬間もカバーする。
    //   item.fixed後は particles は非表示(checkFixedで visible=false)になるため、
    //   写真そのものや枠の光(aura)には一切影響しない。
    let convergeDamp = 1.0;
    if (item.attract && !item.fixed) {
      const fp = item.formed ? 1 : (item._formProgress || 0);
      const ramp = Math.min(1, Math.max(0, (fp - 0.35) / 0.65));
      convergeDamp = 1.0 - ramp * 0.7; // 最大70%まで抑制（0にはしない＝真っ黒防止）
    }

    const customT = now * timeScale;

    // 基本の不透明度とサイズ（完全維持ベース）
    const smooth       = 0.72  + Math.sin(customT * 0.15 + mat._phase) * 0.06;
    const photoSparkle = Math.pow(Math.random(), 100) * 0.12;
    
    // 消滅時は dissolveFactor、形成中は convergeDamp を掛けて白飛びを抑える
    let opacity = Math.min(1.0, smooth + photoSparkle);
    if (item.dissolving) {
      opacity *= dissolveFactor * 0.1;
    } else {
      opacity *= convergeDamp;
      // 【追加】fadeInPhoto が進めているフェードアウト係数を反映する。
      // formed後（写真に収束し終えた後）は必ずこれが1から徐々に0へ減るため、
      // 密集ピーク後にきちんと暗くなりながら消えていく。
      if (item.formed && !item.fixed && item._particleFadeMult !== undefined) {
        opacity *= item._particleFadeMult;
      }
    }
    mat.opacity = opacity;

    let size = 0.8 + Math.sin(customT * 1.3 + mat._phase) * 0.1 + photoSparkle * 0.8;
    if (item.dissolving) {
      size *= dissolveFactor;
    } else if (item.attract && !item.fixed) {
      size *= (0.6 + convergeDamp * 0.4); // 密集時はサイズも少し絞って重なりを軽減
      if (item.formed && item._particleFadeMult !== undefined) {
        size *= (0.5 + item._particleFadeMult * 0.5);
      }
    }
    mat.size = size;

    // 元の色味の計算（完全維持：色相・彩度・明度は一切変更しない）
    // ★白飛び対策はopacity/sizeの抑制のみで行い、色味には触れない
    //   （色を暗くすると黄色っぽく見えてしまうため）
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
let cameraLocked   = false; // 裂け目演出開始と同時に true になり、以後の手動カメラ操作を無効化する
let cameraAligning = false; // 裂け目正面へカメラを補正している間 true になる

window.addEventListener('mousemove', (e) => {
  if (cameraLocked || cameraAligning) return;
  let ty = (e.clientX / window.innerWidth  - 0.5) * 0.5;
  const _ml = getYawLimits();
  if (_ml) ty = Math.max(_ml.min, Math.min(_ml.max, ty));
  targetRotY = ty;
  targetRotX = (e.clientY / window.innerHeight - 0.5) * 0.3;
});

window.addEventListener('keydown', (e) => {
  if (cameraLocked || cameraAligning) return;
  if (e.key === 'ArrowUp')   camera.position.z -= 1.5;
  if (e.key === 'ArrowDown') camera.position.z += 1.5;
});

let lastTouchX = 0;
let lastTouchY = 0;
let lastPinchDist = 0;
let lastTapTime = 0;
let moveForward = false;
let moveTargetZ = 0;

window.addEventListener('touchstart', (e) => {

  const now = Date.now();

  if (!cameraLocked && !cameraAligning && now - lastTapTime < 300) {
    moveTargetZ = camera.position.z - 5; //カメラ自動前進 3から5へ
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
    lastPinchDist = Math.sqrt(dx*dx + dy*dy);
    lastTouchY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
  }
}, { passive: true });

window.addEventListener('touchmove', (e) => {
  if (cameraLocked || cameraAligning) return;
  e.preventDefault();

  if (e.touches.length === 1) {
    const dx = e.touches[0].clientX - lastTouchX;
    const dy = e.touches[0].clientY - lastTouchY;
    targetRotY -= dx * 0.0015; //スマホ感度
  camera.position.z -= dy * 0.03;
    const _yawLimits = getYawLimits();
if (_yawLimits) {
  targetRotY = Math.max(_yawLimits.min, Math.min(_yawLimits.max, targetRotY));
} else {
  targetRotY = Math.max(-0.5, Math.min(0.5, targetRotY)); // 写真表示外はそのまま
}
    lastTouchX = e.touches[0].clientX;
    lastTouchY = e.touches[0].clientY;
  }

  if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

    const pinchDelta = dist - lastPinchDist;
    if (Math.abs(pinchDelta) > 1) {
      camera.position.z -= pinchDelta * 0.05;
      lastPinchDist = dist;
    }

    const swipeDelta = lastTouchY - centerY;
    if (Math.abs(swipeDelta) > 1) {
      camera.position.z -= swipeDelta * 0.03;
      lastTouchY = centerY;
    }
  }
}, { passive: false });

// ======================================================
// 事前確保ベクトル（フレームごとの new/clone を排除）
// ======================================================
const _basePos = new THREE.Vector3();

// ======================================================
// mainScene 完全破棄（GPUメモリ解放）
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

  // シーン内の全メッシュ・ポイントを走査してGeometry/Material/Textureを破棄
  scene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) disposeMaterial(obj.material);
  });

  // シーンからすべてのオブジェクトを除去
  while (scene.children.length > 0) {
    scene.remove(scene.children[0]);
  }

  // 個別に保持しているテクスチャ類
  if (particleTexture) particleTexture.dispose();

  // 写真アイテムの参照を解放
  photoItems.forEach((item) => {
    item.mesh = null;
    item.material = null;
    item.aura = null;
    item.particles = null;
    item.particleGeo = null;
    item._img = null;
  });

  // ドアパーティクル・ポータル面の参照解放
  doorSys = null;
  portalPlane = null;
  accumulationGlow = null;

  // composer（EffectComposer）が内部に保持しているRenderTargetを解放
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

  // ★完全遷移後は、mainScene関連の処理を一切行わず
  //   exhibitionspace.js の描画だけを行う軽量ループに切り替える
  if (getPortalState() === 'switched') {
    const { scene: exScene, camera: exCamera, update: exUpdate } = getExhibition();
    const delta = mainClock.getDelta();
    exUpdate(delta);
    renderer.render(exScene, exCamera);
    return;
  }

  const now = performance.now();

if (!cameraLocked && !cameraAligning) {
  camera.position.z -= 0.006; //ドリフト速度
}

// 自動演出（裂け目へ向かう移動・吸い込み）はロック中でも動かす
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

  // 背景パーティクル個別移動
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

  // ★テレポートループ
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
      item._particleFadeMult = 1; // 【追加】粒子フェード係数もリセット
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
    return;
  }

  composer.render();
}

// ======================================================
// 粒子がランダムに渦巻き、再び光（中心）に戻って消える
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
      item.particles.material.opacity = Math.max(0, 1.0 - (progress - 0.4) * 1.6);
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