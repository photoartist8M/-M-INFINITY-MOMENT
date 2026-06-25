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
renderer.setPixelRatio(window.devicePixelRatio);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.0, 0.2, 0.95
);
composer.addPass(bloomPass);

// ======================================================
// 写真リスト
// ======================================================
const PHOTO_FILES = [
  'assets/photo1.jpg',
  'assets/photo2.jpg',
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
  };
}

const photoItems = PHOTO_FILES.map((src, i) => createPhotoItem(src, i));

// ======================================================
// 通常グロー テクスチャ（背景粒子・写真粒子用）
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

// ======================================================
// ★ 追加：星形スパークテクスチャ（アクセント粒子用）
// ======================================================
function createSparkTexture(size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const half = size / 1.8;

  // ソフトグロー（基底）
  const glow = ctx.createRadialGradient(half, half, 0, half, half, half);
  glow.addColorStop(0.00, 'rgba(255,255,255,1.0)');
  glow.addColorStop(0.08, 'rgba(255,255,255,1.0)');
  glow.addColorStop(0.22, 'rgba(210,228,255,0.80)');
  glow.addColorStop(0.50, 'rgba(160,200,255,0.20)');
  glow.addColorStop(1.00, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  // 4方向スパイク
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
// 背景粒子
// ======================================================
function createBackgroundParticles() {
  const count = 3000;
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

// ======================================================
// ★ 追加：アクセント粒子（星形・少数混在）
// ======================================================
function createAccentParticles() {
  const count = 320;
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
    item._loadedAt = Date.now();
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
    map: createSparkTexture(),
    color: item.particleColor,
    size: 0.8,
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
// トリガー判定
// ======================================================
const TRIGGER_DISTANCE = 22;

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
    const t = item.targetPositions[i];
    const dir = t.clone().sub(p).multiplyScalar(0.04);
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
  if (!item.formed || item.dissolving || item.dissolved) return;

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

    if (item.particles) item.particles.visible = false;

    const worldPos = item.position.clone().add(new THREE.Vector3(0, 0, 3));
    item.mesh.position.copy(worldPos);
    item.mesh.quaternion.set(0, 0, 0, 1);

    setTimeout(() => {
      if (!item.dissolving) item.dissolving = true;
    }, 3000);
  }
}

// ======================================================
// 粒子エフェクト更新
// ======================================================
function updateParticleEffects() {
  const t = Date.now() * 0.0015;

  const sparkle = Math.pow(Math.random(), 15) * 0.5;
  backgroundParticles.material.opacity = 0.25 + Math.sin(t * 0.3) * 0.05 + sparkle;
  backgroundParticles.material.size    = 0.12 + sparkle * 0.3;

  // ★ アクセント粒子のきらめき更新
  const accentSparkle = Math.pow(Math.random(), 12) * 0.4;
  accentParticles.material.opacity = 0.55 + Math.sin(t * 0.2) * 0.08 + accentSparkle;

  photoItems.forEach(item => {
    if (!item.particles) return;
    const mat = item.particles.material;

    if (!mat._phase) mat._phase = Math.random() * 10;
    if (!mat._speed)
  mat._speed = 0.2 + Math.random() * 0.4;

    const smooth  = 0.55 + Math.sin(t * 1.0 + mat._phase) * 0.10;
    const sparkle = Math.pow(Math.random(), 20) * 0.25;

    mat.opacity = smooth + sparkle;
    mat.size    = 0.35 + Math.sin(t * 1.3 + mat._phase) * 0.05 + sparkle * 0.15;

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

  // ★ アクセント粒子の回転（背景と少しずらして奥行き感）
  accentParticles.rotation.y += 0.0002;
  accentParticles.rotation.x += 0.00005;

  checkTriggers();

  photoItems.forEach(item => {
    attractParticles(item);
    fadeInPhoto(item);
    checkFixed(item);
    dissolvePhoto(item);

    if (item.fixed && !item.dissolving && item.mesh) {
      const t = Date.now() * 0.0005;
      const floatY = Math.sin(t + item.index * 1.5) * 0.8;
      const floatX = Math.cos(t * 0.7 + item.index * 1.2) * 0.4;
      const basePos = item.position.clone().add(new THREE.Vector3(0, 0, 3));
      item.mesh.position.set(basePos.x + floatX, basePos.y + floatY, basePos.z);
      if (item.aura) {
        item.aura.position.set(
          basePos.x + floatX,
          basePos.y + floatY,
          basePos.z - 0.1
        );
      }
    }
  });

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
      item.aura.visible = true;
      item.aura.layers.enable(BLOOM_LAYER);
      if (item.aura.material.opacity < 1.2) {
        item.aura.material.opacity += 0.008;
      } else {
        item._dissolvePhase = 2;
      }
    } else {
      item._dissolvePhase = 2;
    }
  }

  if (item._dissolvePhase === 2) {
    if (item.material.opacity > 0) {
      item.material.opacity -= 0.005;
    }
    if (item.aura && item.aura.material.opacity > 0) {
      item.aura.material.opacity -= 0.003;
    }
    if (item.material.opacity <= 0 && (!item.aura || item.aura.material.opacity <= 0)) {
      item.dissolved = true;
      if (item.aura) {
        item.aura.visible = false;
        item.aura.material.opacity = 0;
      }
      if (item.particles) item.particles.visible = false;
    }
  }

  const flicker = Math.pow(Math.random(), 3) * 0.3;

  if (item.material.opacity > 0) {
    item.material.opacity -= 0.006;
  }

  if (item.aura && item.aura.material.opacity > 0) {
    item.aura.material.opacity = Math.max(0,
      item.aura.material.opacity - 0.004 + flicker * 0.1
    );
    item.aura.material.color.setHSL(0.08, 0.8, 0.9 + flicker);
  }

  if (item.material.opacity <= 0) {
    if (item.aura) {
      item.aura.material.opacity -= 0.02;
      if (item.aura.material.opacity <= 0) {
        item.aura.visible = false;
        item.aura.material.opacity = 0;
        item.dissolved = true;
      }
    } else {
      item.dissolved = true;
    }
    if (item.particles) item.particles.visible = false;
  }
}

animate();

// ======================================================
// リサイズ
// ======================================================
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});