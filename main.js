import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

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
// ── 手続き型環境テクスチャ生成 ───────────────────────────────
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
  'assets/photo2.jpg',
  'assets/photo3.jpg',
  'assets/photo4.jpg',
  'assets/photo5.jpg',
];

// ======================================================
// 写真配置
// ======================================================
const SPIRAL_CONFIG = {
  radius: 6,         // 左右に振る幅（0から6に変更）
  zStep: 12,         // 写真と写真Z軸の間隔（14から16に少し広げて見やすく）
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
// 星団風テクスチャ（中心白熱→金色のグラデーション）
// ======================================================
function createClusterGlowTexture(size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const half = size / 2;

  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0.00, 'rgba(255,255,250,1.0)');
  grad.addColorStop(0.15, 'rgba(255,240,205,0.95)');
  grad.addColorStop(0.40, 'rgba(255,210,150,0.55)');
  grad.addColorStop(0.75, 'rgba(220,165,95,0.15)');
  grad.addColorStop(1.00, 'rgba(180,120,60,0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

const clusterGlowTexture = createClusterGlowTexture();

// ======================================================
// 背景粒子 & アクセント粒子
// ======================================================
function createBackgroundParticles() {
  const count = 4500;

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
    uTexture: { value: clusterGlowTexture }
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

      // 粒子ごとに白〜金のばらつき（vScaleを利用）
      float warmth = fract(vScale * 12.9898);
      vec3 whiteHot = vec3(1.0, 0.98, 0.92);
      vec3 gold     = vec3(1.0, 0.78, 0.45);
      vec3 color = mix(whiteHot, gold, warmth) * 2.5;

gl_FragColor =
    vec4(
      color,
      tex.a * pulse
    );

    }

  `

});

  const bg = new THREE.Points(geo, mat);

  // ←速度を保存
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
// ======================================================
function createPortalPlane() {
  const geo = new THREE.PlaneGeometry(18, 18, 1, 1);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime:    { value: 0 },
      uWarp:    { value: 0 }, // 0=歪みなし 1=最大歪み
      uCrack:   { value: 0 }, // 0=裂け目なし 1=裂け目完成
      uOpacity: { value: 0 },
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
      varying vec2 vUv;

      void main() {
        vec2 uv = vUv - 0.5;
        float dist = length(uv);
        float ang  = atan(uv.y, uv.x);

        // ── 渦巻く歪み（台風の目のように同心円が回転）──
        float swirlAng = ang + (1.0 - dist) * 2.5 - uTime * 0.8;
        float ripple = sin(dist * 16.0 - uTime * 3.0 + swirlAng) * 0.5 + 0.5;
        float warpGlow = ripple * uWarp * smoothstep(1.0, 0.0, dist * 1.3);

        // 中心の渦の眼（明るい核）
        float eye = smoothstep(0.35, 0.0, dist) * uWarp * 0.5;

        // ── 縦長の裂け目 ──
        float crackLine = uv.x
          + sin(uv.y * 6.0 + uTime * 0.6) * 0.06
          + sin(uv.y * 14.0) * 0.025;
        float crackWidth = 0.022 + uCrack * 0.05;
        float crack = smoothstep(crackWidth, 0.0, abs(crackLine));
        crack *= smoothstep(0.55, 0.0, abs(uv.y));
        crack *= uCrack;

        // 外側のにじむ光輪（グロー強化でクオリティ向上）
        float halo = smoothstep(0.9, 0.3, dist) * smoothstep(0.0, 0.5, dist);
        halo *= (uWarp * 0.5 + uCrack * 0.5);

        vec3 warpColor  = vec3(0.62, 0.76, 1.0)  * (warpGlow + eye * 1.4);
        vec3 crackColor = vec3(1.0, 0.92, 0.75)  * crack * 1.2;  
        vec3 haloColor  = vec3(0.85, 0.88, 1.0)  * halo * 0.5;

        vec3 color = warpColor + crackColor + haloColor;
        float alpha = clamp(warpGlow * 0.6 + crack + halo * 0.4 + eye * 0.3, 0.0, 1.0) * uOpacity;

        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  portalPlane = new THREE.Mesh(geo, mat);
  portalPlane.position.copy(ACCUM_POINT);
  portalPlane.layers.enable(BLOOM_LAYER);
  scene.add(portalPlane);
}
// ======================================================
// 写真ロード & オブジェクト生成
// ======================================================
function loadPhotoItem(item) {
  const img = new Image();
  img.src = item.src;
  img.onload = () => {
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
createAccumulationGlow();

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
// 写真粒子が蓄積ポイントに到達したときの処理（追加）
// ======================================================
function onPhotoArrivedAtLight(index) {
  accumulatedCount++;
  console.log(`蓄積: ${accumulatedCount} / ${PHOTO_FILES.length}`);

  if (accumulatedCount >= PHOTO_FILES.length) {
    loopDisabled = true;
    // ↓ これを追加：カメラをドア手前まで自動前進
    moveTargetZ = ACCUM_POINT.z + 6;
    moveForward = true;
    setTimeout(() => {
      doorPhase = 'spiraling';
      doorTime  = 0;
      createDoorParticles();
    }, 1500);
  }
}
// ======================================================
// 記憶の裂け目（Organic Crack）ターゲット座標
// ======================================================
function getDoorTargetPositions(count) {
  const targets = [];
  const cx = ACCUM_POINT.x;
  const cy = ACCUM_POINT.y;
  const cz = ACCUM_POINT.z;
  const height = 12;

  for (let i = 0; i < count; i++) {
    const t = i / count;
    const y = cy - height * 0.5 + t * height;

    const center =
          Math.sin(t * 3.8) * 0.8
        + Math.sin(t * 8.5) * 0.45
        + Math.sin(t * 18.0) * 0.18;

    const width = 0.3 + Math.sin(t * Math.PI) * 2.0;
    const side = Math.random() < 0.5 ? -1 : 1;

    const x = center + side * width + (Math.random() - 0.5) * 0.18;

    let yy = y;
    if (Math.random() < 0.18) {
      yy += (Math.random() - 0.5) * 0.8;
    }

    targets.push(new THREE.Vector3(cx + x, yy, cz));
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
    sizes[i] = 0.18 + Math.random() * 0.22; // 大小バラつきで密度感UP
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

  const mat = new THREE.PointsMaterial({
    map: particleTexture,
    color: 0xffe8a0,
    size: 0.26,
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
// ドアアニメーションの更新（対数螺旋＝台風の目）
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

    doorSys.mesh.material.opacity = Math.min(0.55, doorTime * 0.45);

    if (uni) {
      uni.uOpacity.value = Math.min(0.85, sp * 1.1);
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

      // サイズも個体差を保つ（密度感を出す）
      doorSys.mesh.material.size = 0.16 + accel * 0.30 + noise.sizeScale * 0.15;
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
      uni.uOpacity.value  = 0.85;
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

      doorSys.mesh.material.size = 0.40 - fp * 0.20 + noise.sizeScale * 0.1;
    }

    if (doorTime > FORM_DUR) {
      doorPhase = 'complete';
    }
  }

  // ────────────────────────────────────────
  // Phase 3: 裂け目が脈動 → カメラが吸い込まれる
  // ────────────────────────────────────────
  if (doorPhase === 'complete') {
    const t = doorTime;
    const pulse = 0.85 + Math.sin(t * 2.2) * 0.15;

    doorSys.mesh.material.opacity = 0.22 * pulse;

    if (uni) {
      uni.uCrack.value   = pulse;
      uni.uOpacity.value = 0.9;
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
      const pull = Math.min(0.06, 0.012 + t * 0.01);
      camera.position.z -= pull * Math.abs(distToDoor) * 0.3;
      camera.fov = Math.min(95, camera.fov + 0.15);
      camera.updateProjectionMatrix();
    }

    if (Math.abs(distToDoor) < 1.2) {
      window.location.href = '../final/index.html';
    }
  }

  doorSys.geo.attributes.position.needsUpdate = true;
}

// ======================================================
// トリガー・吸引・フェード・固定
// ======================================================
const TRIGGER_DISTANCE = 25;

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

      // 【数珠つなぎ】前の写真（i-2）が消え始めたら、この写真（i）を出現させる
if (i >= 1) {
  const prevItem = photoItems[i - 1];
  if (prevItem && prevItem.dissolving) {
    item.triggered = true;
    item.attract   = true;
  }
}
    }

    // 「2つ前の写真が完全に固定（表示中）になったら、自分（i-2）を消滅させる」
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

window.addEventListener('mousemove', (e) => {
  let ty = (e.clientX / window.innerWidth  - 0.5) * 0.5;
  const _ml = getYawLimits();
  if (_ml) ty = Math.max(_ml.min, Math.min(_ml.max, ty));
  targetRotY = ty;
  targetRotX = (e.clientY / window.innerHeight - 0.5) * 0.3;
});

window.addEventListener('keydown', (e) => {
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

 if (now - lastTapTime < 300) {
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
// アニメーションループ
// ======================================================
const LOOP_LENGTH = PHOTO_FILES.length * SPIRAL_CONFIG.zStep;

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();

  camera.position.z -= 0.0005;
  if (moveForward) {
    camera.position.z += (moveTargetZ - camera.position.z) * 0.15; //カメラ吸引速度
    if (Math.abs(moveTargetZ - camera.position.z) < 0.03) {
      camera.position.z = moveTargetZ;
      moveForward = false;
    }
  }

  camera.rotation.y += (targetRotY - camera.rotation.y) * 0.08;
  camera.rotation.x += (targetRotX - camera.rotation.x) * 0.08;

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
      positions[i * 3 + 2] = camera.position.z160 - Math.random() * 180;
      positions[i * 3]     = (Math.random() - 0.5) * 40;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 24;
    }
  }
  backgroundParticles.geometry.attributes.position.needsUpdate = true;

  // ★パーティクルをカメラに追従
backgroundParticles.position.copy(camera.position);
accentParticles.position.copy(camera.position);

  // ★テレポートループ
  if (!loopDisabled && camera.position.z < -LOOP_LENGTH) {   //とりあえず無効
    camera.position.z += LOOP_LENGTH;
    photoItems.forEach(item => {
      item.triggered       = false;
      item.attract         = false;
      item.formed          = false;
      item.fixed           = false;
      item.dissolving      = false;
      item.dissolved       = false;
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

  // 写真への自動回避ロジック
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

 // カメラが近づいたら、斜め後ろへ「超ふんわり」と後退
  const pdx = item.mesh.position.x - camera.position.x;
  const pdz = item.mesh.position.z - camera.position.z;
  const distXZ = Math.sqrt(pdx * pdx + pdz * pdz);
  
  const hitDist = 10.0; //衝突距離   
  const pushPower = 0.15; // 【調整】さらに数値を小さくして極限まで遅く

  if (item._vx === undefined) { item._vx = 0; item._vz = 0; }

  if (distXZ < hitDist && distXZ > 0.01) {
    const dirX = pdx / distXZ;
    const dirZ = pdz / distXZ;

    const pushDirX = dirX >= 0 ? 1 : -1;
    item._vx += pushDirX * pushPower * 0.5; 
    item._vz += (dirZ >= 0 ? 1 : -1) * pushPower; 
  }

  // 慣性移動（抵抗を少し強めて、さらにゆっくりな挙動に）
  item._vx *= 0.95;
  item._vz *= 0.95;

  if (item._repelX === undefined) { item._repelX = 0; item._repelZ = 0; }
  item._repelX += item._vx;
  item._repelZ += item._vz;

  item._repelX *= 0.995;
  item._repelZ *= 0.995;

  // 最終座標の計算
  const mx = _basePos.x + floatX + item._repelX;
  const my = _basePos.y + floatY;
  const mz = _basePos.z + item._repelZ;
  item.mesh.position.set(mx, my, mz);

  // 【修正】カメラの方を「ゆっくり」振り向かせるロジック
  // 一時的にターゲットの方向（カメラ位置）を向かせたクォータニオンを計算
  _basePos.copy(camera.position);
  _basePos.y = item.mesh.position.y; // Y軸の傾きは固定
  
  const currentRotation = item.mesh.quaternion.clone(); // 現在の回転保持
  item.mesh.lookAt(_basePos);                           // 一瞬カメラを向かせる
  const targetRotation = item.mesh.quaternion.clone();  // 目標の回転を保持
  
  // 元の回転に戻してから、目標へ向かってゆっくり補間（0.05 でじわっと動く）
  item.mesh.quaternion.copy(currentRotation);
  item.mesh.quaternion.slerp(targetRotation, 0.005);

  // auraを完全にmeshに同期
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
  composer.render();
}

// ======================================================
// 粒子がランダムに渦巻き、再び光（中心）に戻って消える
// ======================================================
function dissolvePhoto(item) {
  if (!item.loaded || item.dissolved) return;

  // --------------------------------------------------
  // 【修正】消滅トリガー（5秒経過 OR カメラが一定距離まで前進・接近）
  // --------------------------------------------------
  if (item.viewing && item._fixedAt && !item.dissolving) {
    // パターン1: 時間経過（5秒）
    const timeElapsed = (Date.now() - item._fixedAt) > 5000;

    // パターン2: 前進による接近（カメラとのXZ平面上の距離が 6.0 未満）
    let cameraApproached = false;
    if (item.mesh) {
      const pdx = item.mesh.position.x - camera.position.x;
      const pdz = item.mesh.position.z - camera.position.z;
      const distXZ = Math.sqrt(pdx * pdx + pdz * pdz);
      
      if (distXZ < 6.0) { // ★この数字を大きくすると、より手前で消えて次が出ます
        cameraApproached = true;
      }
    }

    // どちらかの条件を満たしたら粒子化（消滅）を開始
    if (timeElapsed || cameraApproached) {
      item.dissolving = true;
      item.viewing = false;
    }
  }

  if (!item.dissolving) return;

  // --------------------------------------------------
  // ステップ1: 写真が消えて、粒子が浮かび上がる（これ以降は元のコードのまま）
  // --------------------------------------------------
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

  // 粒子ごとのランダムなノイズ（バラバラ感を大きく強化）
      item._particleNoises = [];
      for (let i = 0; i < item.particleCount; i++) {
        item._particleNoises.push({
          angleOffset: Math.random() * Math.PI * 2,
          radiusOffset: Math.random() * 200 - 50,    // ★ 拡大: ばらつき範囲を広く (30->100)
          speedMod: 0.3 + Math.random() * 1.2        // 回転速度のバラつきにメリハリをつける
        });
      }
    }
    return;
  }

  // --------------------------------------------------
  // ステップ2: 粒子がバラバラに渦を巻き、中心（光）に戻りながら消える
  // --------------------------------------------------
  if (item.particles && item.particleGeo && item._particleNoises) {
    const pos = item.particleGeo.attributes.position.array;
    
    // 全体の進捗
    item._vortexTime += 0.004; // ★ 渦巻くスピード（さらに少し遅く変更）
    const progress = Math.min(1.0, item._vortexTime);

    for (let i = 0; i < item.particleCount; i++) {
      const ix = i * 3, iy = i * 3 + 1, iz = i * 3 + 2;
      
      const baseTarget = item.targetPositions[i];
      const noise = item._particleNoises[i];
      
      // 元の位置から計算した基本の角度と半径
      const initialAngle = Math.atan2(baseTarget.y, baseTarget.x);
      const initialRadius = Math.sqrt(baseTarget.x * baseTarget.x + baseTarget.y * baseTarget.y);
      
      // ★ 修正: ノイズを混ぜて粒子をバラバラに渦巻かせる
      // 各粒子が異なる速度・角度オフセットで回転する
      const angle = initialAngle + noise.angleOffset + (item._vortexTime * 3.0 * noise.speedMod);
      
      // 半径もバラつかせつつ、最終的に 0（中心）に収束させる
      const currentRadius = Math.max(0, (initialRadius + noise.radiusOffset) * (1.0 - progress));
      
      // Z軸（奥へ消えていく動きはそのまま維持）
      const targetZ = baseTarget.z - (progress * 60);

      // ターゲット座標
      const vortexX = Math.cos(angle) * currentRadius;
      const vortexY = Math.sin(angle) * currentRadius;
      const vortexZ = targetZ;

      // 線形補間（追従をさらに滑らかに）
      pos[ix] += (vortexX - pos[ix]) * 0.04;
      pos[iy] += (vortexY - pos[iy]) * 0.04;
      pos[iz] += (vortexZ - pos[iz]) * 0.04;
    }
    item.particleGeo.attributes.position.needsUpdate = true;

    // 光（中心）に集まる後半からフェードアウト
    if (progress > 0.4) {
      item.particles.material.opacity = Math.max(0, 1.0 - (progress - 0.4) * 1.6);
    }
  }

  // --------------------------------------------------
  // 最終ステージ: 完全に消滅
  // --------------------------------------------------
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
});
