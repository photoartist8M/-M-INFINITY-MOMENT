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
scene.fog = new THREE.Fog(0x0a0805, 5, 35);
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

buildProceduralEnv(); // ← renderer 初期化後・写真ロード前に呼ぶ

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
  'assets/photo8.jpg',
  'assets/photo9.jpg',
  'assets/photo4.jpg',
  'assets/photo5.jpg',
];
// ======================================================
// 写真配置
// ======================================================
const SPIRAL_CONFIG = {
  radius: 6,         // 左右に振る幅（0から6に変更）
  zStep: 10,         // 写真と写真Z軸の間隔（14から16に少し広げて見やすく）
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
let accumulatedCount = 0;
let accumulationGlow = null;
let doorSys          = null;
let doorPhase        = 'none';
let doorTime         = 0;
let loopDisabled     = false;
let _dissolvedFlags  = new Array(PHOTO_FILES.length).fill(false);
let portalPlane = null;

// ======================================================
// 亀裂（裂け目）の形状関数（追加）
// ------------------------------------------------------
// ★ JS側のパーティクル座標とGLSL側の亀裂境界線を完全一致させるため、
//   同一の閉曲線の数式をここで定義する（シェーダー側にも同じ係数で埋め込む）。
//   angle(0〜2π)を与えると、ACCUM_POINT中心からの境界半径を返す。
//   縦長の裂け目になるよう楕円的な伸縮＋複数周波数のゆらぎを重ねている。
// ======================================================
const CRACK_BASE_R      = 2.3;  // 基本半径（ワールド単位）
const CRACK_ELONGATION  = 0.28; // 縦方向への伸び具合（0〜1、大きいほど縦長）

function crackRadius(angle) {
  let r = CRACK_BASE_R * (1 - CRACK_ELONGATION * Math.cos(2 * angle));
  r *= 1
    + 0.22 * Math.sin(2 * angle + 0.6)
    + 0.10 * Math.sin(5 * angle + 2.3)
    + 0.05 * Math.sin(9 * angle + 4.1);
  return r;
}

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
  const count = 3000; // 数

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
// 時空の歪み・裂け目（ポータル面）
// ------------------------------------------------------
// ★修正：円形のワームホールではなく、閉じた不規則な「亀裂穴」形状に変更。
//   境界線は crackRadius(angle) という関数で定義し、JS側のパーティクル
//   目標座標（getDoorTargetPositions）と完全に同じ数式・同じ係数を使うことで、
//   粒子の輪郭とシェーダーの輪郭が常に一致するようにしている。
//   次空間のPortalテクスチャは、この境界線の"内側"にしか表示されないよう
//   数式的にクランプしているため、枠からのはみ出しが原理的に起こらない。
// ======================================================
function createPortalPlane() {
  const PLANE_SIZE = 10; // JS側のワールド座標とUVを対応づけるための基準サイズ
  const geo = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE, 1, 1);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime:    { value: 0 },
      uWarp:    { value: 0 },
      uCrack:   { value: 0 }, // 亀裂の"開き具合"
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

      // ── JS側 crackRadius() と完全に同じ数式・同じ係数 ──
      const float PLANE_SIZE = ${PLANE_SIZE.toFixed(1)};
      const float CRACK_BASE_R = 2.3;
      const float CRACK_ELONGATION = 0.28;

      float crackRadius(float angle) {
        float r = CRACK_BASE_R * (1.0 - CRACK_ELONGATION * cos(2.0 * angle));
        r *= 1.0
          + 0.22 * sin(2.0 * angle + 0.6)
          + 0.10 * sin(5.0 * angle + 2.3)
          + 0.05 * sin(9.0 * angle + 4.1);
        return r;
      }

      void main() {
        // uvをワールド座標スケール（ACCUM_POINT中心からのオフセット）に変換
        // → JS側のパーティクル座標系と単位を一致させる
        vec2 wp = (vUv - 0.5) * PLANE_SIZE;
        float radius = length(wp);
        float angle  = atan(wp.y, wp.x);
        float boundaryR = crackRadius(angle);

        // 境界線までの符号付き距離（負=内側、正=外側）
        float edgeDist = abs(radius - boundaryR);

        // 亀裂の縁の光る帯
        float bandWidth = mix(0.10, 0.40, uCrack);
        float glowMask = smoothstep(bandWidth * 2.2, 0.0, edgeDist);
        float coreMask = smoothstep(bandWidth * 0.5, 0.0, edgeDist);

        float flow = sin(angle * 10.0 - uTime * 2.4 + radius * 3.0) * 0.5 + 0.5;
        flow = pow(flow, 2.2);

        float crackGlow = glowMask * uCrack;
        float crackCore = coreMask * uCrack;

        // 白飛びしにくい寒色〜淡い色に抑制
        vec3 tunnelColor = vec3(0.40, 0.50, 0.92) * crackGlow * flow * 0.40;
        vec3 coreColor   = vec3(0.78, 0.76, 0.90) * crackCore * 0.40;

        vec3 color = tunnelColor + coreColor;
        float alpha = clamp(crackGlow * 0.30 + crackCore * 0.50, 0.0, 1.0) * uOpacity;

        // ── Portal合成：必ず亀裂の内側(radius < boundaryR)に収める ──
        float revealR  = boundaryR * clamp(uPortalReveal, 0.0, 1.0);
        float featherW = mix(0.35, 0.9, uWarp) + bandWidth * 0.6; // 縁をぼかして誤差を隠す
        float apertureMask = smoothstep(revealR, revealR - featherW, radius);
        // 亀裂の外側には絶対に出さない二重クランプ
        apertureMask *= step(radius, boundaryR);

        vec3 portalColor = texture2D(uPortalTex, vUv).rgb;
        vec3 finalColor = mix(color, portalColor, apertureMask);
        float finalAlpha = max(alpha, apertureMask);

        // 亀裂の外側は帯の外からなだらかにフェードして完全カット
        float outerCutoff = smoothstep(boundaryR + bandWidth * 2.2 + 0.3, boundaryR + bandWidth * 2.2, radius);
        finalAlpha *= outerCutoff;

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
const RIFT_VIEW_DISTANCE      = 6;    // Phase4のdistToDoor想定初期値(6.0)と一致させる
const CAMERA_ALIGN_DURATION   = 1200; // カメラ補正にかける時間(ms)
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
// 記憶の裂け目（Organic Crack）ターゲット座標
// ------------------------------------------------------
// ★修正：crackRadius(angle) による「閉じた1周のループ」として生成する。
//   角度0〜2πを均等に一周するため、以前あった「上端・下端で途切れる」
//   問題が構造的に発生しなくなる。またシェーダー側と全く同じ数式・
//   同じ係数を使っているため、粒子の位置とシェーダーの輪郭線が
//   常にぴったり重なる。
// ======================================================
function getDoorTargetPositions(count) {
  const targets = [];
  const cx = ACCUM_POINT.x;
  const cy = ACCUM_POINT.y;
  const cz = ACCUM_POINT.z;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;

    // 輪郭の帯に厚みを持たせるための小さな揺らぎ（シェーダーのbandWidthと同程度）
    const jitter = (Math.random() - 0.5) * 0.5;
    const r = crackRadius(angle) + jitter;

    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);

    targets.push(new THREE.Vector3(x, y, cz));
  }

  return targets;
}
// ======================================================
// 裂け目パーティクルシステムの作成（軽量・高品質）
// ======================================================
function createDoorParticles() {
  const count = 1400; // 軽量だが密度感を保つバランス値
  const pos    = new Float32Array(count * 3);
  const sizes  = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const r     = Math.random() * 2.5;
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    pos[i * 3]     = ACCUM_POINT.x + r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = ACCUM_POINT.y + r * Math.sin(phi) * Math.sin(theta);
    pos[i * 3 + 2] = ACCUM_POINT.z + r * Math.cos(phi);
    sizes[i] = 0.16 + Math.random() * 0.18; // 大小バラつきで密度感UP（控えめ）
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

  const mat = new THREE.PointsMaterial({
    map: particleTexture,
    color: 0xcf9f70,   // 白飛び軽減：彩度を落とした控えめな暖色
    size: 0.09,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geo, mat);
  points.layers.enable(BLOOM_LAYER);
  scene.add(points);

  // 対数螺旋（台風の目）用のパラメータ
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

  if (!portalPlane) createPortalPlane();

  // ▼追加：Portal(RenderTarget)方式の初期化。ここから次空間のプリロードが始まる
  initPortal(renderer, portalPlane);
}
// ======================================================
// 蓄積光のアニメーション更新（追加）
// ======================================================
function updateAccumulationGlow() {
  if (!accumulationGlow || accumulatedCount === 0) return;

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

  doorTime += 0.004;
  const pos = doorSys.geo.attributes.position.array;
  const uni = portalPlane ? portalPlane.material.uniforms : null;
  if (uni) uni.uTime.value = doorTime;

  // ────────────────────────────────────────
  // Phase 1: 台風の目のような対数螺旋で渦が巻き始める
  // ────────────────────────────────────────
  if (doorPhase === 'spiraling') {
    const SPIRAL_DUR = 2.4;
    const sp    = Math.min(1.0, doorTime / SPIRAL_DUR);
    const accel = Math.pow(sp, 2.2);

    doorSys.mesh.material.opacity = Math.min(0.38, doorTime * 0.32);

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

      doorSys.mesh.material.size = 0.13 + accel * 0.20 + noise.sizeScale * 0.12;
    }

    if (doorTime > SPIRAL_DUR) {
      doorPhase = 'forming';
      doorTime  = 0;
    }
  }

  // ────────────────────────────────────────
  // Phase 2: 渦が緩みながら裂け目の輪郭に収束
  // ────────────────────────────────────────
  if (doorPhase === 'forming') {
    const FORM_DUR      = 1.8;
    const fp            = Math.min(1.0, doorTime / FORM_DUR);
    const swirlStrength = 1.0 - fp;
    const B = 1.6;

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

      doorSys.mesh.material.size = 0.28 - fp * 0.14 + noise.sizeScale * 0.08;
    }

    if (doorTime > FORM_DUR) {
      doorPhase = 'complete';
    }
  }

  // ────────────────────────────────────────
  // Phase 3: 裂け目が脈動 → カメラが吸い込まれる → ポータル拡大開始
  // ────────────────────────────────────────
  if (doorPhase === 'complete') {
    const t = doorTime;
    const pulse = 0.85 + Math.sin(t * 2.2) * 0.15;

    doorSys.mesh.material.opacity = 0.16 * pulse;

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

    // カメラを裂け目へ吸い込む（演出専用の移動なので cameraLocked とは独立して動かす）
    const distToDoor = ACCUM_POINT.z - camera.position.z;
    if (distToDoor < -1.5) {
      const pull = Math.min(0.06, 0.012 + t * 0.01);
      camera.position.z -= pull * Math.abs(distToDoor) * 0.3;
      camera.fov = Math.min(95, camera.fov + 0.15);
      camera.updateProjectionMatrix();
    }

    if (Math.abs(distToDoor) < 6.0) {
      doorPhase = 'portal-open';
    }
  }

  // ────────────────────────────────────────
  // Phase 4: 裂け目(Portal)が画面いっぱいに拡大していく
  // ────────────────────────────────────────
if (doorPhase === 'portal-open') {
    const distToDoor = Math.abs(ACCUM_POINT.z - camera.position.z);
    const pull = 0.02;
    camera.position.z -= pull * distToDoor * 0.3;
    camera.fov = Math.min(100, camera.fov + 0.2);
    camera.updateProjectionMatrix();

    if (uni) {
      // 距離 6.0 → 0.5 の間で uPortalReveal を 0 → 1.0 まで拡大
      // ★新シェーダーではrevealは常に亀裂境界(boundaryR)の内側にクランプされるため、
      //   上限を設けず最後まで亀裂の枠いっぱいに拡大してよい
      const t2 = THREE.MathUtils.clamp(1 - (distToDoor - 0.5) / (6.0 - 0.5), 0, 1);
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
const DISSOLVE_CAMERA_PUSH = 18; // 粒子化開始時にカメラから遠ざける距離（近距離での白トビ防止）

function checkTriggers() {
  const now = Date.now();

  for (let i = 0; i < photoItems.length; i++) {
    const item = photoItems[i];
    if (!item.loaded) continue;

    // まだトリガーされていない場合の出現判定
    if (!item.triggered) {
      const dist = camera.position.distanceTo(item.position);
      const byDistance = dist < TRIGGER_DISTANCE;
      const byClick    = item._clickTriggered === true;
      const byTime     = item.index === 0 && item._loadedAt && (now - item._loadedAt) > 5000;

      if (byDistance || byClick || byTime) {
        item.triggered = true;
        item.attract   = true;
      }

      // 【数珠つなぎ】前の写真（i-1）が消え始めたら、この写真（i）を出現させる
      if (i >= 1) {
        const prevItem = photoItems[i - 1];
        if (prevItem && prevItem.dissolving) {
          item.triggered = true;
          item.attract   = true;
        }
      }
    }

    // 「1つ前の写真が完全に固定（表示中）になったら、自分（i-1）を消滅させる」
    if (i >= 1 && item.fixed && !item.dissolving && !item.dissolved) {
      const oldestItem = photoItems[i - 1];
      if (oldestItem && !oldestItem.dissolving && !oldestItem.dissolved) {
        oldestItem.dissolving = true;
        oldestItem.viewing = false;
      }
    }
  }
}

function attractParticles(item) {
  if (!item.attract || !item.particles || item.formed) return;
  const pos = item.particleGeo.attributes.position.array;
  let allClose = true;
  for (let i = 0; i < item.particleCount; i++) {
    const ix = i*3, iy = i*3+1, iz = i*3+2;
    const p = new THREE.Vector3(pos[ix], pos[iy], pos[iz]);
    const t = item.targetPositions[i];
    const dir = t.clone().sub(p).multiplyScalar(0.04);
    p.add(dir);
    pos[ix] = p.x; pos[iy] = p.y; pos[iz] = p.z;
    if (dir.length() > 0.01) allClose = false;
  }
  item.particleGeo.attributes.position.needsUpdate = true;
  if (allClose) item.formed = true;
}

function fadeInPhoto(item) {
  if (!item.formed || item.dissolving || item.dissolved) return;
  if (!item.mesh) return;
  if (item.material.opacity < 1) item.material.opacity += 0.01;
  if (item.particles && item.particles.material.opacity > 0) item.particles.material.opacity -= 0.02;
  if (item.particles && item.particles.material.opacity <= 0.02) item.particles.visible = false;
  if (item.aura) {
    // 写真が出始めたらすぐ枠も表示・フェードイン
    if (!item.aura.visible) item.aura.visible = true;
    if (item.aura.material.opacity < 1.2) { //枠の透明度
      item.aura.material.opacity += 0.01; // 写真と同じ速度でフェードイン
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
item._fixedAt = Date.now(); // 固定された時刻を記録
  }
}

// ======================================================
// 粒子エフェクト更新
// ======================================================
function updateParticleEffects() {
  const t = Date.now() * 0.0035;

  // 背景粒子（変更なし）
  const sparkle = Math.pow(Math.random(), 15) * 0.5;
  backgroundParticles.material.opacity = 0.25 + Math.sin(t * 0.3) * 0.05 + sparkle;
  backgroundParticles.material.size    = 0.12 + sparkle * 0.3;

  // アクセント粒子（変更なし）
  const accentSparkle = Math.pow(Math.random(), 12) * 0.4;
  accentParticles.material.opacity = 0.55 + Math.sin(t * 0.2) * 0.08 + accentSparkle;

  // 写真粒子だけキラキラ強化
  photoItems.forEach(item => {
    if (!item.particles) return;
    const mat = item.particles.material;
    if (!mat._phase) mat._phase = Math.random() * 10;
    const smooth       = 0.72  + Math.sin(t * 0.15 + mat._phase) * 0.06;
    const photoSparkle = Math.pow(Math.random(), 100) * 0.12;
    mat.opacity = Math.min(1.0, smooth + photoSparkle);
    mat.size    = 0.8 + Math.sin(t * 1.3 + mat._phase) * 0.1 + photoSparkle * 0.8;
    const hueShift = (Math.sin(t * 0.5 + mat._phase) + 1) / 2;
    const color = new THREE.Color();
    color.setHSL(0.08 + hueShift*0.08, 0.55 + hueShift*0.25, 0.60 + hueShift*0.30 + photoSparkle*0.4);
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
    moveTargetZ = camera.position.z - 3;
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
  camera.position.z -= 0.0005;
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