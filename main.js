import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ======================================================
// 基本セットアップ
// ======================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f0f0f);
scene.fog = new THREE.Fog(0x0f0f0f, 5, 35);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 0, 25);

const BLOOM_LAYER = 1;

const renderer = new THREE.WebGLRenderer({
  canvas: document.querySelector('#canvas'),
  antialias: true
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.0, 0.2, 0.95
);
composer.addPass(bloomPass);


// ======================================================
// 写真リスト（ここに追加していくだけ）
// ======================================================
const PHOTO_FILES = [
  'assets/photo1.jpg',
  'assets/photo2.jpg',
];

// ======================================================
// らせん配置の座標計算
// ======================================================
const SPIRAL_CONFIG = {
  radius: 12,        // らせんの半径
  zStep: 14,         // 写真間のZ間隔
  yAmplitude: 2,     // 上下のゆらぎ幅
  photosPerLoop: 5,  // 1周に何枚
};

function getSpiralPosition(index) {
  const { radius, zStep, yAmplitude, photosPerLoop } = SPIRAL_CONFIG;
  const angle = (index / photosPerLoop) * Math.PI * 2;

  return new THREE.Vector3(
    Math.cos(angle) * radius,
    Math.sin(angle) * yAmplitude,
    -(index * zStep)   // カメラが前進する方向（-Z）
  );
}


// ======================================================
// 写真アイテムの状態管理
// ======================================================
// 各写真はこのオブジェクトで状態を持つ
function createPhotoItem(src, index) {
  return {
    src,
    index,
    position: getSpiralPosition(index),

    // Three.jsオブジェクト（ロード後に入る）
    mesh: null,
    material: null,
    aura: null,
    particles: null,
    particleGeo: null,
    particleCount: 0,
    targetPositions: [],
    particleColor: new THREE.Color(1, 1, 1),

    // 状態フラグ
    loaded: false,       // 画像ロード済みか
    triggered: false,    // カメラが近づいたか
    attract: false,      // 粒子が集まり始めたか
    formed: false,       // 粒子が揃ったか
    formed: false,       // 粒子が揃ったか
    fixed: false,        // ワールド固定になったか
    dissolving: false,   // 光に溶け始めたか
    dissolved: false,    // 完全に消えたか
  };
}

const photoItems = PHOTO_FILES.map((src, i) => createPhotoItem(src, i));


// ======================================================
// 粒子テクスチャ（共通）
// ======================================================
function createGlowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  gradient.addColorStop(0.0,  'rgba(255,255,255,1)');
  gradient.addColorStop(0.1,  'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.15, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4,  'rgba(255,255,255,0.8)');
  gradient.addColorStop(0.7,  'rgba(255,255,255,0.25)');
  gradient.addColorStop(1.0,  'rgba(255,255,255,0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

const particleTexture = createGlowTexture();


// ======================================================
// 背景粒子
// ======================================================
function createBackgroundParticles() {
  const count = 1500;
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const r = 80 * Math.cbrt(Math.random());
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    map: particleTexture,
    color: 0xfff6e8,
    size: 0.15,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  });

  const bg = new THREE.Points(geo, mat);
  scene.add(bg);
  return bg;
}

const backgroundParticles = createBackgroundParticles();


// ======================================================
// 写真1枚のロードと3Dオブジェクト生成
// ======================================================
function loadPhotoItem(item) {
  const img = new Image();
  img.src = item.src;

  img.onload = () => {
    const w = 150;
    const h = 200;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cx = c.getContext('2d');
    cx.drawImage(img, 0, 0, w, h);

    const data = cx.getImageData(0, 0, w, h).data;
    let rSum = 0, gSum = 0, bSum = 0, count = 0;

    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const i = (y * w + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const brightness = r + g + b;

        if (brightness > 450 && x > 2 && x < w - 2 && y > 2 && y < h - 2) {
          const px = (x - w / 2) * (10 / w);
          const py = (h / 2 - y) * (14 / h);
          item.targetPositions.push(new THREE.Vector3(px, py, 3));
          rSum += r; gSum += g; bSum += b; count++;
        }
      }
    }

    if (count > 0) {
      item.particleColor = new THREE.Color(
        rSum / count / 255,
        gSum / count / 255,
        bSum / count / 255
      );
    }

    buildParticles(item);
    buildPhotoMesh(item);
    buildAura(item);

    item.loaded = true;
  };
}

// 粒子オブジェクト生成
function buildParticles(item) {
  const photoCount = item.targetPositions.length;
  item.particleCount = photoCount;

  const pos = new Float32Array(photoCount * 3);
  for (let i = 0; i < photoCount; i++) {
    const r = 50 * Math.cbrt(Math.random());
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i * 3 + 2] = r * Math.cos(phi);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

  const mat = new THREE.PointsMaterial({
    map: particleTexture,
    color: item.particleColor,
    size: 0.60,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  });

  item.particles = new THREE.Points(geo, mat);
  item.particles.position.copy(item.position);
  item.particleGeo = geo;
  scene.add(item.particles);
}

// 写真メッシュ生成
function buildPhotoMesh(item) {
  const tex = new THREE.TextureLoader().load(item.src);
  const geo = new THREE.PlaneGeometry(10.80, 14.80);
  item.material = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0
  });

  item.mesh = new THREE.Mesh(geo, item.material);
  item.mesh.position.copy(item.position).add(new THREE.Vector3(0, 0, 3));
  scene.add(item.mesh);
}

// オーラ生成
function buildAura(item) {
  const geo = new THREE.PlaneGeometry(11, 15);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.5, 2.5, 2.5),
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  item.aura = new THREE.Mesh(geo, mat);
  item.aura.position.copy(item.position).add(new THREE.Vector3(0, 0, 2.9));
  item.aura.visible = false;
  item.aura.layers.disable(BLOOM_LAYER);
  scene.add(item.aura);
}


// ======================================================
// 全写真をロード
// ======================================================
photoItems.forEach(item => loadPhotoItem(item));


// ======================================================
// トリガー判定（カメラとの距離）
// ======================================================
const TRIGGER_DISTANCE = 30;

function checkTriggers() {
  photoItems.forEach(item => {
    if (!item.loaded || item.triggered) return;

    const dist = camera.position.distanceTo(item.position);
    if (dist < TRIGGER_DISTANCE) {
      item.triggered = true;
      item.attract = true;
    }
  });
}


// ======================================================
// 粒子吸引
// ======================================================
function attractParticles(item) {
  if (!item.attract || !item.particles || item.formed) return;

  const pos = item.particleGeo.attributes.position.array;
  let allClose = true;

  for (let i = 0; i < item.particleCount; i++) {
    const ix = i * 3, iy = i * 3 + 1, iz = i * 3 + 2;
    const p = new THREE.Vector3(pos[ix], pos[iy], pos[iz]);

    // targetPositionsはローカル座標なのでワールド変換不要（粒子もローカル）
    const t = item.targetPositions[i];
    const dir = t.clone().sub(p).multiplyScalar(0.05);
    p.add(dir);

    pos[ix] = p.x; pos[iy] = p.y; pos[iz] = p.z;
    if (dir.length() > 0.01) allClose = false;
  }

  item.particleGeo.attributes.position.needsUpdate = true;
  if (allClose) item.formed = true;
}


// ======================================================
// 写真フェードイン
// ======================================================
function fadeInPhoto(item) {
  if (!item.formed) return;

  if (item.material.opacity < 1) {
    item.material.opacity += 0.01;
  }

  if (item.particles && item.particles.material.opacity > 0) {
    item.particles.material.opacity -= 0.02;
  }
  if (item.particles && item.particles.material.opacity <= 0.02) {
    item.particles.visible = false;
  }

  if (item.aura) {
    if (item.material.opacity >= 1 && !item.aura.visible) {
      item.aura.visible = true;
      item.aura.layers.enable(BLOOM_LAYER);
    }
    if (item.aura.material.opacity < 0.25) {
      item.aura.material.opacity += 0.01;
    }
  }
}
// ======================================================
// フェードイン完了でワールド固定
// ======================================================
function checkFixed(item) {
  if (!item.formed || item.fixed || !item.mesh) return;

  if (item.material.opacity >= 1) {
    item.fixed = true;

    // ワールド座標に固定
    const worldPos = item.position.clone().add(new THREE.Vector3(0, 0, 3));
    item.mesh.position.copy(worldPos);
    item.mesh.quaternion.set(0, 0, 0, 1);

    if (item.aura) {
      item.aura.position.copy(item.position).add(new THREE.Vector3(0, 0, 2.9));
      item.aura.quaternion.set(0, 0, 0, 1);
    }
  }
}

// ======================================================
// 粒子エフェクト更新
// ======================================================
function updateParticleEffects() {
  const t = Date.now() * 0.0015;

  backgroundParticles.material.opacity = 0.28 + Math.sin(t * 0.3) * 0.06;

  photoItems.forEach(item => {
    if (!item.particles) return;
    const mat = item.particles.material;

    if (!mat._phase) mat._phase = Math.random() * 10;

    const smooth  = 0.55 + Math.sin(t * 1.0 + mat._phase) * 0.10;
    const sparkle = Math.pow(Math.random(), 20) * 0.25;

    mat.opacity = smooth + sparkle;
    mat.size    = 0.20 + Math.sin(t * 1.3 + mat._phase) * 0.04 + sparkle * 0.3;

    const hueShift = (Math.sin(t * 0.5 + mat._phase) + 1) / 2;
    const color = new THREE.Color();
    color.setHSL(
      0.08 + hueShift * 0.08,
      0.55 + hueShift * 0.25,
      0.60 + hueShift * 0.30 + sparkle * 0.4
    );
    mat.color = color;
  });
}


// ======================================================
// 視点操作
// ======================================================
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp')   camera.position.z -= 1.2;
  if (e.key === 'ArrowDown') camera.position.z += 1.2;
});

window.addEventListener('mousemove', (e) => {
  camera.rotation.y = (e.clientX / window.innerWidth  - 0.5) * 0.6;
  camera.rotation.x = (e.clientY / window.innerHeight - 0.5) * 0.4;
});

let lastTouchX = 0, lastTouchY = 0;

window.addEventListener('touchstart', (e) => {
  lastTouchX = e.touches[0].clientX;
  lastTouchY = e.touches[0].clientY;
});

window.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  const dx = touch.clientX - lastTouchX;
  const dy = touch.clientY - lastTouchY;

  camera.rotation.y -= dx * 0.005;
  camera.position.z  += dy * 0.05;

  lastTouchX = touch.clientX;
  lastTouchY = touch.clientY;
}, { passive: false });


// ======================================================
// アニメーションループ
// ======================================================
function animate() {
  requestAnimationFrame(animate);

  backgroundParticles.rotation.y += 0.0003;

  checkTriggers();

  photoItems.forEach(item => {
    attractParticles(item);
    fadeInPhoto(item);
    checkFixed(item);
    dissolvePhoto(item);
    // 常にカメラの方を向く
    if (item.mesh) item.mesh.lookAt(camera.position);
    if (item.aura) item.aura.lookAt(camera.position);
  });

  updateParticleEffects();

  composer.render();
}

animate();
// ======================================================
// 光に溶けて消える
// ======================================================
function dissolvePhoto(item) {
  if (!item.dissolving || item.dissolved) return;

  // オーラを先に白く膨らませる
  if (item.aura && item.aura.material.opacity < 1.0) {
    item.aura.material.opacity += 0.02;
  }

  // 写真をゆっくりフェードアウト
  if (item.material.opacity > 0) {
    item.material.opacity -= 0.005;
  }

  // オーラも最終的に消える
  if (item.material.opacity <= 0 && item.aura) {
    item.aura.material.opacity -= 0.01;
  }

  // 完全に消えたら終了
  if (item.material.opacity <= 0 && (!item.aura || item.aura.material.opacity <= 0)) {
    item.dissolved = true;
  }
}

// ======================================================
// リサイズ
// ======================================================
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});