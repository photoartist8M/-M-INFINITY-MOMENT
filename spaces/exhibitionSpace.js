import * as THREE from 'three';

// ======================================================
// 写真リスト（自動配置版）
// ======================================================
const PHOTO_SOURCES = [
  '../assets/photo1.jpg',
  '../assets/photo2.jpg',
  '../assets/photo3.jpg',
  '../assets/photo4.jpg',
  '../assets/photo5.jpg',
  '../assets/photo6.jpg',
  '../assets/photo7.jpg',
  '../assets/photo8.jpg',
  '../assets/photo9.jpg',
  '../assets/photo0.jpg',
  // 今後ここに追加していくだけでOK
];

const GALLERY_RADIUS = 20; // 円の半径（イメージのような広がりにはこのくらい）

function buildPhotoConfig(sources) {
  const count = sources.length;
  return sources.map((src, i) => {
    // 均等配置 + わずかなランダム性で有機的に
    const baseAngle = (360 / count) * i;
    const jitter = (Math.random() - 0.5) * (360 / count) * 0.3; // 隙間の30%以内でランダムにずらす
    const angle = baseAngle + jitter;

    const height = (Math.random() - 0.5) * 4;       // 上下のばらつき
    const scale = 0.6 + Math.random() * 0.7;          // 大小のばらつき（0.6〜1.3倍）
    const radius = GALLERY_RADIUS + (Math.random() - 0.5) * 3; // 前後にも少しばらつき

    return { src, angle, radius, height, scale };
  });
}

const PHOTO_CONFIG = buildPhotoConfig(PHOTO_SOURCES);

// ======================================================
// パステル色抽出ユーティリティ
// ======================================================
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToColor(h, s, l) {
  const c = new THREE.Color();
  c.setHSL(h, s, l);
  return c;
}

function toPastel(r, g, b) {
  const [h] = rgbToHsl(r, g, b);
  const s = 0.45 + Math.random() * 0.15; // 彩度: 45〜60%（もう少ししっかり）
  const l = 0.78 + Math.random() * 0.08; // 明度: 78〜86%（淡いけど分かる濃さ）
  return hslToColor(h, s, l);
}

function extractPastelColors(img) {
  const w = 60, h = 60;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0, w, h);
  const data = cx.getImageData(0, 0, w, h).data;

  function averageRegion(yStart, yEnd) {
    let r = 0, g = 0, b = 0, count = 0;
    for (let y = yStart; y < yEnd; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2];
        count++;
      }
    }
    if (count === 0) return [200, 200, 200];
    return [r / count, g / count, b / count];
  }

  const top = averageRegion(0, Math.floor(h / 3));
  const mid = averageRegion(Math.floor(h / 3), Math.floor(h * 2 / 3));
  const bottom = averageRegion(Math.floor(h * 2 / 3), h);

  return [toPastel(...top), toPastel(...mid), toPastel(...bottom)];
}

// ======================================================
// エントリーポイント：外部(test.html)から呼び出される
// renderer, camera は外部から渡される
// ======================================================
export function startExhibitionSpace(renderer, camera) {
  const scene = new THREE.Scene();

  camera.position.set(0, 0, 0);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
  scene.add(ambientLight);
  const keyLight = new THREE.DirectionalLight(0xfff5e8, 0.6);
  keyLight.position.set(3, 8, 5);
  scene.add(keyLight);

  // ── 背景グラデーション ──
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = 4;
  bgCanvas.height = 256;
  const bgCtx = bgCanvas.getContext('2d');
  const bgTexture = new THREE.CanvasTexture(bgCanvas);

  let currentColors = [
    new THREE.Color(0xfaf3ec),
    new THREE.Color(0xf7ece9),
    new THREE.Color(0xf3eef7),
  ];
  let targetColors = currentColors.map(c => c.clone());

  function drawBackgroundGradient() {
    const grad = bgCtx.createLinearGradient(0, 0, 0, bgCanvas.height);
    grad.addColorStop(0.0, `#${currentColors[0].getHexString()}`);
    grad.addColorStop(0.5, `#${currentColors[1].getHexString()}`);
    grad.addColorStop(1.0, `#${currentColors[2].getHexString()}`);
    bgCtx.fillStyle = grad;
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
    bgTexture.needsUpdate = true;
  }
  drawBackgroundGradient();
  scene.background = bgTexture;
  scene.fog = new THREE.Fog(0xffffff, 20, 60);

  // ── 写真アイテム ──
  const photoItems = [];

  function createPhotoItem(config) {
    const rad = THREE.MathUtils.degToRad(config.angle);
    const position = new THREE.Vector3(
      Math.sin(rad) * config.radius,
      config.height,
      -Math.cos(rad) * config.radius
    );

    const item = {
      src: config.src,
      config,
      position,
      mesh: null,
      aura: null,
      pastelColors: [
        new THREE.Color(0xfaf3ec),
        new THREE.Color(0xf7ece9),
        new THREE.Color(0xf3eef7),
      ],
      loaded: false,
    };

    const img = new Image();
    img.src = config.src;
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) {
        console.error(`画像が壊れています: ${config.src}`);
        return;
      }

      const aspect = img.width / img.height;
      const frameHeight = 3.2 * config.scale;
      const baseWidth = frameHeight * aspect;
      const baseHeight = frameHeight;

      const tex = new THREE.Texture(img);
      tex.needsUpdate = true;

      const geo = new THREE.PlaneGeometry(baseWidth, baseHeight);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        side: THREE.DoubleSide,
      });

      item.mesh = new THREE.Mesh(geo, mat);
      item.mesh.position.copy(position);
      item.mesh.lookAt(0, position.y, 0);
      item.mesh.userData.photoItem = item;
      scene.add(item.mesh);

      const auraGeo = new THREE.PlaneGeometry(baseWidth + 0.15, baseHeight + 0.15);
      const auraMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
      });
      item.aura = new THREE.Mesh(auraGeo, auraMat);
      item.aura.position.copy(position).multiplyScalar(0.998);
      item.aura.lookAt(0, position.y, 0);
      scene.add(item.aura);

      item.pastelColors = extractPastelColors(img);
      item.loaded = true;
    };

    return item;
  }

  PHOTO_CONFIG.forEach(cfg => photoItems.push(createPhotoItem(cfg)));

  // ── 視点操作 ──
  let yaw = 0, pitch = 0, targetYaw = 0, targetPitch = 0;
  let isDragging = false;
  let lastX = 0, lastY = 0;

  function onDragMove(dx, dy) {
    targetYaw -= dx * 0.003;
    targetPitch -= dy * 0.003;
    targetPitch = Math.max(-0.6, Math.min(0.6, targetPitch));
  }

  const canvasEl = renderer.domElement;

  canvasEl.addEventListener('mousedown', (e) => {
    isDragging = true;
    lastX = e.clientX; lastY = e.clientY;
  });
  window.addEventListener('mouseup', () => { isDragging = false; });
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    onDragMove(e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX; lastY = e.clientY;
  });

  canvasEl.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
    }
  }, { passive: true });

  canvasEl.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) {
      const dx = e.touches[0].clientX - lastX;
      const dy = e.touches[0].clientY - lastY;
      onDragMove(dx, dy);
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
    }
  }, { passive: true });

  // ── クリックで写真に近づく ──
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  let viewingItem = null;
  let approachProgress = 0;
  let approachTarget = 0;
  const cameraHomePos = new THREE.Vector3(0, 0, 0);
  let cameraApproachPos = new THREE.Vector3();

  function onPointerClick(clientX, clientY) {
    pointer.x = (clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const meshes = photoItems.filter(it => it.mesh).map(it => it.mesh);
    const hits = raycaster.intersectObjects(meshes);

    if (hits.length > 0) {
      const item = hits[0].object.userData.photoItem;
      if (viewingItem === item) {
        viewingItem = null;
        approachTarget = 0;
      } else {
        viewingItem = item;
        approachTarget = 1;
        const dir = item.position.clone().normalize();
        cameraApproachPos = item.position.clone().sub(dir.multiplyScalar(5));
      }
    } else if (viewingItem) {
      viewingItem = null;
      approachTarget = 0;
    }
  }

  canvasEl.addEventListener('click', (e) => onPointerClick(e.clientX, e.clientY));
  canvasEl.addEventListener('touchend', (e) => {
    if (e.changedTouches.length > 0) {
      onPointerClick(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }
  });

  function getFacingItem() {
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
    let best = null, bestDot = -Infinity;
    photoItems.forEach(item => {
      if (!item.loaded) return;
      const toItem = item.position.clone().normalize();
      const dot = toItem.dot(dir);
      if (dot > bestDot) { bestDot = dot; best = item; }
    });
    return best;
  }

  let bgUpdateTimer = 0;

  // ======================================================
  // update(dt) : test.html の animate() から毎フレーム呼ばれる
  // ======================================================
  function update(dt) {
    yaw += (targetYaw - yaw) * 0.08;
    pitch += (targetPitch - pitch) * 0.08;

    approachProgress += (approachTarget - approachProgress) * 0.06;

    if (viewingItem && approachProgress > 0.01) {
      camera.position.lerpVectors(cameraHomePos, cameraApproachPos, approachProgress);
      camera.lookAt(viewingItem.position);

      photoItems.forEach(item => {
        if (!item.mesh) return;
        const targetOpacity = item === viewingItem ? 1.0 : 0.25;
        item.mesh.material.opacity += (targetOpacity - item.mesh.material.opacity) * 0.05;
        if (item.aura) {
          item.aura.material.opacity += ((item === viewingItem ? 0.7 : 0.1) - item.aura.material.opacity) * 0.05;
        }
      });
    } else {
      camera.position.lerp(cameraHomePos, 0.1);
      camera.rotation.set(pitch, yaw, 0, 'YXZ');

      photoItems.forEach(item => {
        if (!item.mesh) return;
        item.mesh.material.opacity += (1.0 - item.mesh.material.opacity) * 0.05;
        if (item.aura) {
          item.aura.material.opacity += (0.5 - item.aura.material.opacity) * 0.05;
        }
      });
    }

    bgUpdateTimer++;
    if (bgUpdateTimer % 3 === 0) {
      const facing = viewingItem || getFacingItem();
      if (facing && facing.loaded) {
        targetColors = facing.pastelColors;
      }
      let changed = false;
      for (let i = 0; i < 3; i++) {
        const before = currentColors[i].clone();
        currentColors[i].lerp(targetColors[i], 0.02);
        if (!currentColors[i].equals(before)) changed = true;
      }
      if (changed) drawBackgroundGradient();
    }
  }

  return { scene, update };
}