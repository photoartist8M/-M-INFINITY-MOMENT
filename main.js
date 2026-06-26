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
  1.3, 0.5, 0.93
);
composer.addPass(bloomPass);

// ======================================================
// 写真リスト
// ======================================================
const PHOTO_FILES = [
  'assets/photo1.jpg',
  'assets/photo2.jpg',
  'assets/photo3.jpg',
];

// ======================================================
// 写真配置
// ======================================================
const SPIRAL_CONFIG = {
  radius: 0,
  zStep: 14,
  yAmplitude: 0,
  photosPerLoop: 5,
};

function getSpiralPosition(index) {
  const { radius, zStep, yAmplitude, photosPerLoop } = SPIRAL_CONFIG;
  const angle = (index / photosPerLoop) * Math.PI * 2;
  return new THREE.Vector3(
    Math.cos(angle) * radius,
    Math.sin(angle) * yAmplitude,
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
  const count = 2000;
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
    color: 0xffd4a0,
    size: 0.4,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  });
  const bg = new THREE.Points(geo, mat);
  scene.add(bg);
  return bg;
}

function createAccentParticles() {
  const count = 200;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r     = 60 * Math.cbrt(Math.random());
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    map:             createSparkTexture(),
    color:           0xffd27a,
    size:            0.55,
    transparent:     true,
    opacity:         0.75,
    blending:        THREE.AdditiveBlending,
    depthWrite:      false,
    sizeAttenuation: true,
  });
  const mesh = new THREE.Points(geo, mat);
  scene.add(mesh);
  return mesh;
}

const backgroundParticles = createBackgroundParticles();
const accentParticles     = createAccentParticles();

// ======================================================
// 写真ロード & オブジェクト生成
// ======================================================
function loadPhotoItem(item) {
  const img = new Image();
  img.src = item.src;
  img.onload = () => {
    item._img = img;

  const isMobile = window.innerWidth <= 768;

const baseHeight = isMobile ? 11.5 : 11;  //11.5

const aspect = img.width / img.height;
const baseWidth = baseHeight * aspect;

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
    size: 0.55,
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
  const borderSize = 0.14; // 枠の太さ
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
// トリガー・吸引・フェード・固定
// ======================================================
const TRIGGER_DISTANCE = 25;

function checkTriggers() {
  const now = Date.now();
  photoItems.forEach(item => {
    if (!item.loaded || item.triggered) return;
    const dist = camera.position.distanceTo(item.position);
    const byDistance = dist < TRIGGER_DISTANCE;
    const byClick    = item._clickTriggered === true;
    const byTime     = item.index === 0 && item._loadedAt && (now - item._loadedAt) > 5000;
    if (byDistance || byClick || byTime) {
      item.triggered = true;
      item.attract   = true;
    }
  });
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
    if (item.aura.material.opacity < 0.6) {
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
  }
}

// ======================================================
// 粒子エフェクト更新
// ======================================================
function updateParticleEffects() {
  const t = Date.now() * 0.0015;

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
    const smooth       = 0.7  + Math.sin(t * 1.0 + mat._phase) * 0.15;
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
  targetRotY = (e.clientX / window.innerWidth  - 0.5) * 0.5;
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
    targetRotY = Math.max(-0.5, Math.min(0.5, targetRotY));
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
function animate() {
  requestAnimationFrame(animate);

  // performance.now() は Date.now() より高精度かつ低コスト
  // フレーム内で 1 回だけ取得して使い回す
  const now = performance.now();

  camera.position.z -= 0.0005;
  if (moveForward) {
    camera.position.z += (moveTargetZ - camera.position.z) * 0.15;
    if (Math.abs(moveTargetZ - camera.position.z) < 0.03) {
      camera.position.z = moveTargetZ;
      moveForward = false;
    }
  }

  camera.rotation.y += (targetRotY - camera.rotation.y) * 0.08;
  camera.rotation.x += (targetRotX - camera.rotation.x) * 0.08;

  backgroundParticles.rotation.y += 0.0003;
  accentParticles.rotation.y     += 0.0002;
  accentParticles.rotation.x     += 0.00005;

  // camera.position.z をローカル変数にキャッシュ（プロパティアクセスを削減）
  const camZ = camera.position.z;

  // forEach → for ループ（コールバック生成コストを削除）
  for (let i = 0; i < photoItems.length; i++) {
    const item = photoItems[i];
    if (!item.viewing) continue;
    if (
      now - item.viewStartTime > 10000 ||
      Math.abs(camZ - item.viewStartZ) > 12
    ) {
      item.dissolving = true;
      item.viewing    = false;
    }
  }

  checkTriggers();

  // sin/cos 用の時間を 1 回だけ計算
  const t = now * 0.0005;

  for (let i = 0; i < photoItems.length; i++) {
    const item = photoItems[i];

    // 消滅済みは全処理をスキップ（最大の節約）
    if (item.dissolved) continue;

    attractParticles(item);
    fadeInPhoto(item);
    checkFixed(item);
    dissolvePhoto(item);

    if (item.fixed && !item.dissolving && item.mesh) {
      const floatY = Math.sin(t + item.index * 1.5) * 0.8;
      const floatX = Math.cos(t * 0.7 + item.index * 1.2) * 0.4;

      // clone() + add() の代わりに事前確保ベクトルを再利用（GC ゼロ）
      _basePos.copy(item.position);
      _basePos.z += 3;

      const mx = _basePos.x + floatX;
      const my = _basePos.y + floatY;
      const mz = _basePos.z;

      item.mesh.position.set(mx, my, mz);
      if (item.aura) item.aura.position.set(mx, my, mz);
    }
  }

  updateParticleEffects();
  composer.render();
}

// ======================================================
// 光に溶けて消える
// ======================================================
function dissolvePhoto(item) {
  if (!item.dissolving || item.dissolved) return;

  if (!item._dissolvePhase) item._dissolvePhase = 1;

  if (item._dissolvePhase === 1) {
    if (item.aura) {
      // layers.enable / visible は状態変化時に 1 回だけ呼ぶ（毎フレーム不要）
      if (!item._auraActivated) {
        item.aura.visible = true;
        item.aura.layers.enable(BLOOM_LAYER);
        item._auraActivated = true;
      }
      item.aura.material.opacity += 0.008;
      if (item.aura.material.opacity >= 1.2) {
        item._dissolvePhase = 2;
      }
    } else {
      item._dissolvePhase = 2;
    }
  }

  if (item._dissolvePhase === 2) {
    // 変数で状態を保持し、不要なプロパティアクセスを削減
    const mat  = item.material;
    const aura = item.aura;

    if (mat  && mat.opacity  > 0) mat.opacity  -= 0.012;
    if (aura && aura.material.opacity > 0) aura.material.opacity -= 0.02;

    const meshDone = !mat  || mat.opacity  <= 0;
    const auraDone = !aura || aura.material.opacity <= 0;

    if (meshDone && auraDone) {
      item.dissolved = true;  // 次フレームからループ先頭でスキップされる

      if (item.mesh) {
        scene.remove(item.mesh);
        item.mesh.geometry.dispose();
        mat.dispose();
        item.mesh = null;
      }
      if (aura) {
        scene.remove(aura);
        aura.geometry.dispose();
        aura.material.dispose();
        item.aura = null;
      }
      if (item.particles) item.particles.visible = false;
    }
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
});