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
// 写真リスト（ここに追加していくだけ）
// ======================================================
const PHOTO_FILES = [
  'assets/photo1.jpg',
  'assets/photo2.jpg',
];

// ======================================================
// 写真配置-正面
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
    fixed: false,        // ワールド固定になったか
    dissolving: false,   // 光に溶け始めたか
    dissolved: false,    // 完全に消えたか
    dissolveParticles: null, // dissolve用粒子
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
const TRIGGER_DISTANCE = 22;

function checkTriggers() {
  const now = Date.now();
  photoItems.forEach(item => {
    if (!item.loaded || item.triggered) return;

    // ① 距離で出現
    const dist = camera.position.distanceTo(item.position);
    const byDistance = dist < TRIGGER_DISTANCE;

    // ② クリックで出現（最寄りの未トリガー写真）
    const byClick = item._clickTriggered === true;

   // ③ 1枚目のみ5秒後に自動出現
    const byTime = item.index === 0 && item._loadedAt && (now - item._loadedAt) > 5000;

    if (byDistance || byClick || byTime) {
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

    // 粒子を完全に非表示
    if (item.particles) item.particles.visible = false;

    // ワールド座標に固定
    const worldPos = item.position.clone().add(new THREE.Vector3(0, 0, 3));
    item.mesh.position.copy(worldPos);
    item.mesh.quaternion.set(0, 0, 0, 1);

    // 3秒後に自分自身をdissolve開始
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
backgroundParticles.material.size = 0.12 + sparkle * 0.3;

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

    // 固定後にゆっくり漂う（dissolving中は止める）
    if (item.fixed && !item.dissolving && item.mesh) {
      const t = Date.now() * 0.0005;
      const floatY = Math.sin(t + item.index * 1.5) * 0.8;
      const floatX = Math.cos(t * 0.7 + item.index * 1.2) * 0.4;
      const basePos = item.position.clone().add(new THREE.Vector3(0, 0, 3));
      item.mesh.position.set(
        basePos.x + floatX,
        basePos.y + floatY,
        basePos.z
      );
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

  // フェーズ1：オーラが光り始め、端から粒子が散る
  if (item._dissolvePhase === 1) {
    // dissolve粒子をまだ作っていなければ生成
    if (!item.dissolveParticles) {
      const count = 80;
      const pos = new Float32Array(count * 3);
      const w = 10.80 / 2;
      const h = 14.80 / 2;

      for (let i = 0; i < count; i++) {
        // オーラの外周付近からランダムに配置
        const side = Math.floor(Math.random() * 4);
        let x, y;
        if (side === 0) { x = (Math.random() * 2 - 1) * w; y = h; }
        else if (side === 1) { x = (Math.random() * 2 - 1) * w; y = -h; }
        else if (side === 2) { x = w; y = (Math.random() * 2 - 1) * h; }
        else { x = -w; y = (Math.random() * 2 - 1) * h; }

        pos[i * 3]     = x;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = 0;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

      const mat = new THREE.PointsMaterial({
        map: particleTexture,
        color: new THREE.Color(1.0, 0.85, 0.5),
        size: 0.3,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true
      });

      item.dissolveParticles = new THREE.Points(geo, mat);
      item.dissolveParticles.position.copy(item.mesh.position);
      scene.add(item.dissolveParticles);
      item._dpGeo = geo;
    }

    // 粒子を外側に散らす
    const pos = item._dpGeo.attributes.position.array;
    for (let i = 0; i < 80; i++) {
      const ix = i * 3, iy = i * 3 + 1;
      const nx = pos[ix] === 0 ? (Math.random() - 0.5) : pos[ix];
      pos[ix] += (nx / Math.abs(nx || 1)) * 0.04;
      pos[iy] += (pos[iy] / Math.abs(pos[iy] || 1)) * 0.03;
    }
    item._dpGeo.attributes.position.needsUpdate = true;

    // オーラを光らせる
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

  // フェーズ2：写真が光に溶けていく
  if (item._dissolvePhase === 2) {
    if (item.material.opacity > 0) {
      item.material.opacity -= 0.005;
    }

    if (item.aura && item.aura.material.opacity > 0) {
      item.aura.material.opacity -= 0.003;
    }

    // dissolve粒子もフェードアウト
    if (item.dissolveParticles) {
      item.dissolveParticles.material.opacity -= 0.005;
      const pos = item._dpGeo.attributes.position.array;
      for (let i = 0; i < 80; i++) {
        const ix = i * 3, iy = i * 3 + 1;
        const nx = pos[ix];
        pos[ix] += (nx / Math.abs(nx || 1)) * 0.03;
        pos[iy] += 0.02;
      }
      item._dpGeo.attributes.position.needsUpdate = true;
    }

    if (item.material.opacity <= 0 && (!item.aura || item.aura.material.opacity <= 0)) {
      item.dissolved = true;
      if (item.aura) { item.aura.visible = false; item.aura.material.opacity = 0; }
      if (item.particles) item.particles.visible = false;
      if (item.dissolveParticles) {
        scene.remove(item.dissolveParticles);
        item._dpGeo.dispose();
        item.dissolveParticles.material.dispose();
        item.dissolveParticles = null;
      }
    }
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