import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.157.0/build/three.module.js';

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

const renderer = new THREE.WebGLRenderer({
  canvas: document.querySelector('#canvas'),
  antialias: true
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

// ======================================================
// 背景粒子（空間演出）
// ======================================================
function createBackgroundParticles() {
  const count = 800;
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

  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.2,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const bg = new THREE.Points(geo, mat);
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

      if (brightness > 150) {
        const px = (x - w / 2) * 0.07;
        const py = (h / 2 - y) * 0.07;
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

// ======================================================
// 写真粒子（生成演出）
// ======================================================
let photoParticles, photoGeo, photoCount;
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
    color: photoColor,
    size: 0.7,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false
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

  const geo = new THREE.PlaneGeometry(10, 14);
  photoMaterial = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0
  });

  photoMesh = new THREE.Mesh(geo, photoMaterial);
  photoMesh.position.set(0, 0, 3);
  scene.add(photoMesh);
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
  if (photoFullyFormed && photoMaterial.opacity < 1) {
    photoMaterial.opacity += 0.01;
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

// ======================================================
// アニメーション
// ======================================================
function animate() {
  requestAnimationFrame(animate);

  backgroundParticles.rotation.y += 0.0003;

  attractPhotoParticles();
  fadeInPhoto();

  renderer.render(scene, camera);
}

animate();

// ======================================================
// リサイズ
// ======================================================
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
