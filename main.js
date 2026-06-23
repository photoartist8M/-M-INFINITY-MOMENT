import * as THREE from 'three';
import { EffectComposer }
from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }
from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass }
from 'three/addons/postprocessing/UnrealBloomPass.js';

// ======================================================
// 基本セットアップ
// ======================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.z = 40;
const BLOOM_LAYER = 1;
const renderer = new THREE.WebGLRenderer({
  canvas: document.querySelector('#canvas'),
  antialias: true
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

//Bloom 光らす
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(
    window.innerWidth,
    window.innerHeight
  ),
  1.0,
  0.2,
  0.95
);

composer.addPass(bloomPass);

const PHOTO_TRIGGER_DISTANCE = 18; // カメラがこの距離まで来たら出現
let photoTriggered = false;


// ======================================================
// 超キラキラ粒子テクスチャ（強い光）
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

  gradient.addColorStop(0.0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.1, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.15, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.8)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.25)');
  gradient.addColorStop(1.0, 'rgba(255,255,255,0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  return new THREE.CanvasTexture(canvas);
}

const particleTexture = createGlowTexture();

// ======================================================
// 背景粒子（空間演出）
// ======================================================
function createBackgroundParticles() {
  const count = 1500;
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const r = 80 * Math.cbrt(Math.random());
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

const bgMat = new THREE.PointsMaterial({
  map: particleTexture,

  color: 0xfff6e8, // 暖かいアイボリー

  size: 0.15,

  transparent: true,
  opacity: 0.25,

  blending: THREE.AdditiveBlending,
  depthWrite: false,
  sizeAttenuation: true
});

  const bg = new THREE.Points(geo, bgMat);
  scene.add(bg);

  return bg;
}

const backgroundParticles = createBackgroundParticles();

// ======================================================
// 写真 → 粒子ターゲット座標に変換
// ======================================================
let photoColor = new THREE.Color(1, 1, 1);
let targetPositions = [];

const img = new Image();
img.src = 'assets/photo1.jpg';

img.onload = () => {
  const w = 150;
  const h = 200;

  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0, w, h);

  const data = cx.getImageData(0, 0, w, h).data;

  let rSum = 0, gSum = 0, bSum = 0, count = 0;

  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const brightness = r + g + b;

      if (brightness > 450 && x > 2 && x < w - 2 && y > 2 && y < h - 2) {     //写真横の点々削除
const px = (x - w / 2) * (10 / w);
const py = (h / 2 - y) * (14 / h);

        const pz = 3;

        targetPositions.push(new THREE.Vector3(px, py, pz));

        rSum += r;
        gSum += g;
        bSum += b;
        count++;
      }
    }
  }

  if (count > 0) {
    photoColor = new THREE.Color(rSum / count / 255, gSum / count / 255, bSum / count / 255);
  }

  createPhotoParticles();
  createPhotoMesh();
};

//写真枠（オーラ）
let photoAura;

function createPhotoAura() {
  const geo = new THREE.PlaneGeometry(11, 15);
  const auraMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.5, 2.5, 2.5),
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  photoAura = new THREE.Mesh(geo, auraMat);
  photoAura.position.set(0, 0, 2.9);

  // ★ 最初は完全に OFF（光らせない）
  photoAura.visible = false;
  photoAura.layers.disable(BLOOM_LAYER);

  scene.add(photoAura);
}

// ======================================================
// 写真粒子（生成演出）
// ======================================================
let photoParticles, photoGeo, photoCount;
let auraParticles;

let attract = false;
let photoFullyFormed = false;

function createPhotoParticles() {
  photoCount = targetPositions.length;
  const pos = new Float32Array(photoCount * 3);

  for (let i = 0; i < photoCount; i++) {
    const r = 50 * Math.cbrt(Math.random());
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i * 3 + 2] = r * Math.cos(phi);
  }

  photoGeo = new THREE.BufferGeometry();
  photoGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

  const mat = new THREE.PointsMaterial({
    map: particleTexture,
    color: photoColor,
    size: 0.60,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  });

  photoParticles = new THREE.Points(photoGeo, mat);
  scene.add(photoParticles);
}

// ======================================================
// 写真テクスチャ（鮮明表示）
// ======================================================
let photoMesh, photoMaterial;

function createPhotoMesh() {
  const tex = new THREE.TextureLoader().load('assets/photo1.jpg');

  const geo = new THREE.PlaneGeometry(10.80, 14.80);
  photoMaterial = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0
  });

  photoMesh = new THREE.Mesh(geo, photoMaterial);
  photoMesh.position.set(0, 0, 3);
  scene.add(photoMesh);

  // ★ オーラ生成
  createPhotoAura();
}

// ======================================================
// 写真粒子吸引
// ======================================================
function attractPhotoParticles() {
  if (!attract || !photoParticles) return;

  const pos = photoGeo.attributes.position.array;
  let allClose = true;

  for (let i = 0; i < photoCount; i++) {
    const ix = i * 3;
    const iy = i * 3 + 1;
    const iz = i * 3 + 2;

    const p = new THREE.Vector3(pos[ix], pos[iy], pos[iz]);
    const t = targetPositions[i];

    const dir = t.clone().sub(p).multiplyScalar(0.05);
    p.add(dir);

    pos[ix] = p.x;
    pos[iy] = p.y;
    pos[iz] = p.z;

    if (dir.length() > 0.01) allClose = false;
  }

  photoGeo.attributes.position.needsUpdate = true;

  if (allClose && !photoFullyFormed) {
    photoFullyFormed = true;
  }
}

// ======================================================
// 写真フェードイン（C1）
// ======================================================
function fadeInPhoto() {
  if (photoFullyFormed) {

    // 写真フェードイン
    if (photoMaterial.opacity < 1) {
      photoMaterial.opacity += 0.01;
    }

    // 粒子フェードアウト
    if (photoParticles.material.opacity > 0) {
      photoParticles.material.opacity -= 0.02;
    }

    // 粒子が消えたら非表示
    if (photoParticles.material.opacity <= 0.02) {
      photoParticles.visible = false;
    }

    // ★ オーラをフェードイン
    if (photoAura.material.opacity < 0.35) {
      photoAura.material.opacity += 0.01;
    }
    // 写真が完全に表示された瞬間に aura を ON
if (photoMesh.material.opacity >= 1 && !photoAura.visible) {
  photoAura.visible = true;
  photoAura.layers.enable(BLOOM_LAYER);
}

  }
}


// ======================================================
// 粒子の瞬き & 色揺らぎ（なめらか＋キラッ）
// ======================================================
function updateParticleEffects() {
  const t = Date.now() * 0.0015; // ゆっくり

  // 背景粒子の儚い揺らぎ
  backgroundParticles.material.opacity =
    0.28 + Math.sin(t * 0.3) * 0.06;

  // 写真粒子のキラキラ
  if (photoParticles) {
    const mat = photoParticles.material;
    

    // 粒子ごとの固定位相
    if (!mat._phase) mat._phase = Math.random() * 10;

    // ★ ① なめらかなベース揺らぎ
    const smooth = 0.55 + Math.sin(t * 1.0 + mat._phase) * 0.10;

    // ★ ② 弱いランダム輝き（キラッ）
    const sparkle = Math.pow(Math.random(), 20) * 0.25; 
    // ↑ ほとんど0、たまに強く光る（宝石の反射）

    // 合成（なめらか＋キラッ）
    mat.opacity = smooth + sparkle;

    // ★ サイズ揺らぎ（呼吸する光）
    mat.size = 0.20 + Math.sin(t * 1.3 + mat._phase) * 0.04 + sparkle * 0.3;

    // ★ 色揺らぎ（オレンジ〜金色〜白〜銀色）
    const hueShift = (Math.sin(t * 0.5 + mat._phase) + 1) / 2;
    const color = new THREE.Color();

    color.setHSL(
      0.08 + hueShift * 0.08,
      0.55 + hueShift * 0.25,
      0.60 + hueShift * 0.30 + sparkle * 0.4 // キラッ時に白く輝く
    );

    mat.color = color;
  }
}


// ======================================================
// 視点操作
// ======================================================
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp') camera.position.z -= 1.2;
  if (e.key === 'ArrowDown') camera.position.z += 1.2;
});

window.addEventListener('mousemove', (e) => {
  camera.rotation.y = (e.clientX / window.innerWidth - 0.5) * 0.6;
  camera.rotation.x = (e.clientY / window.innerHeight - 0.5) * 0.4;
});

window.addEventListener('click', () => {
  attract = true;
});

let lastTouchX = 0;
let lastTouchY = 0;

window.addEventListener('touchstart', (e) => {
  lastTouchX = e.touches[0].clientX;
  lastTouchY = e.touches[0].clientY;
});

window.addEventListener('touchmove', (e) => {
  e.preventDefault();

  const touch = e.touches[0];

  const dx = touch.clientX - lastTouchX;
  const dy = touch.clientY - lastTouchY;

  // 左右を見る
  camera.rotation.y -= dx * 0.005;

  // 前進後退
  camera.position.z += dy * 0.05;

  lastTouchX = touch.clientX;
  lastTouchY = touch.clientY;
}, { passive: false });

// ======================================================
// アニメーション
// ======================================================
function animate() {
  requestAnimationFrame(animate);

  backgroundParticles.rotation.y += 0.0003;

  // ★ カメラと写真の距離を測る
  const dist = camera.position.distanceTo(photoMesh.position);

  // ★ 一定距離まで来たら自動で出現
  if (!photoTriggered && dist < PHOTO_TRIGGER_DISTANCE) {
    photoTriggered = true;
    photoFullyFormed = true; // ← あなたの既存ロジックに合わせて発火
  }

  attractPhotoParticles();
  fadeInPhoto();
  updateParticleEffects(); // 儚い光・宝石の輝き

  composer.render();
}

animate();

// ======================================================
// リサイズ
// ======================================================
window.addEventListener('resize', () => {

  camera.aspect =
    window.innerWidth / window.innerHeight;

  camera.updateProjectionMatrix();

  renderer.setSize(
    window.innerWidth,
    window.innerHeight
  );

  composer.setSize(
    window.innerWidth,
    window.innerHeight
  );

});