import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';

// ======================================================
// 写真リスト（自動配置版）
// ======================================================
const PHOTO_SOURCES = [
  '../assets/photo1.jpg',
  '../assets/photo12.jpg',
  '../assets/photo13.jpg',
  '../assets/photo4.jpg',
  '../assets/photo5.jpg',
  '../assets/photo6.jpg',
  '../assets/photo7.jpg',
  '../assets/photo8.jpg',
  '../assets/photo9.jpg',
  '../assets/photo.jpg',
];

const GALLERY_RADIUS = 20;

function buildPhotoConfig(sources) {
  const count = sources.length;
  return sources.map((src, i) => {
    const baseAngle = (360 / count) * i;
    const jitter = (Math.random() - 0.5) * (360 / count) * 0.3;
    const angle = baseAngle + jitter;

    const height = (Math.random() - 0.5) * 4;
    const scale = 0.6 + Math.random() * 0.7;
    const radius = GALLERY_RADIUS + (Math.random() - 0.5) * 3;

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
  const s = 0.55 + Math.random() * 0.15;
  const l = 0.40 + Math.random() * 0.10;
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
// ======================================================
export function startExhibitionSpace(renderer, camera) {
  const scene = new THREE.Scene();

  camera.position.set(0, 0, 0);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(ambientLight);
  const keyLight = new THREE.DirectionalLight(0xfff5e8, 0.6);
  keyLight.position.set(3, 8, 5);
  scene.add(keyLight);

  // ── 背景グラデーション（5色: 隣接写真も混ぜる） ──
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = 64;
  bgCanvas.height = 256;
  const bgCtx = bgCanvas.getContext('2d');
  const bgTexture = new THREE.CanvasTexture(bgCanvas);

  let currentColors = [
    new THREE.Color(0xf6d9c9),
    new THREE.Color(0xf3c9d9),
    new THREE.Color(0xd9c9f3),
    new THREE.Color(0xc9e0f3),
    new THREE.Color(0xc9f3d9),
  ];
  let targetColors = currentColors.map(c => c.clone());

  function drawBackgroundGradient() {
    bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
    bgCtx.fillStyle = `#${currentColors[2].getHexString()}`;
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

    currentColors.forEach((c, i) => {
      const cx = (Math.sin(i * 137.5) * 0.5 + 0.5) * bgCanvas.width;
      const cy = ((i + 0.5) / currentColors.length) * bgCanvas.height;
      const radius = bgCanvas.height * 0.6;

      const grad = bgCtx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, `#${c.getHexString()}`);
      grad.addColorStop(1, `#${c.getHexString()}00`);

      bgCtx.fillStyle = grad;
      bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
    });

    bgTexture.needsUpdate = true;
  }
  drawBackgroundGradient();
  scene.background = bgTexture;
  scene.fog = new THREE.Fog(0xffffff, 60, 140);

  // ======================================================
  // 水面（静かでキラキラした反射床、面積は控えめ）
  // ======================================================
  const waterGeo = new THREE.CircleGeometry(18, 64); // 面積を縮小
  const water = new Water(waterGeo, {
    textureWidth: 1024,
    textureHeight: 1024,
    waterNormals: new THREE.TextureLoader().load(
      'https://threejs.org/examples/textures/waternormals.jpg',
      (tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(3, 3); // 細かい反射でキラキラ感アップ
      }
    ),
    sunDirection: new THREE.Vector3(0, 0.6, -1).normalize(),
    sunColor: 0xfff6dd,
    waterColor: 0xdfe9ea,
    distortionScale: 1.0,
    alpha: 0.9,
    fog: !!scene.fog,
  });
  water.rotation.x = -Math.PI / 2;
  water.position.y = -8; // 写真から距離を取る
  scene.add(water);

  // 奥の水平線に、ほんのり光る球状のグロー
  const horizonGlowGeo = new THREE.SphereGeometry(150, 32, 32);
  const horizonGlowMat = new THREE.MeshBasicMaterial({
    color: 0xfff3da,
    transparent: true,
    opacity: 0.15,
    side: THREE.BackSide,
  });
  const horizonGlow = new THREE.Mesh(horizonGlowGeo, horizonGlowMat);
  scene.add(horizonGlow);

  // 水平線の光のライン（太陽のような一筋の光）
  const sunLineGeo = new THREE.PlaneGeometry(400, 1.2);
  const sunLineMat = new THREE.MeshBasicMaterial({
    color: 0xfff6da,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const sunLine = new THREE.Mesh(sunLineGeo, sunLineMat);
  sunLine.position.set(0, -0.5, -80);
  scene.add(sunLine);

  // 光のラインの上にもう少し柔らかいグロー
  const sunGlowGeo = new THREE.PlaneGeometry(400, 8);
  const sunGlowMat = new THREE.MeshBasicMaterial({
    color: 0xfff6da,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const sunGlow = new THREE.Mesh(sunGlowGeo, sunGlowMat);
  sunGlow.position.set(0, -0.5, -80);
  scene.add(sunGlow);

  // ── 写真アイテム ──
  const photoItems = [];

  function createPhotoItem(config) {
    const rad = THREE.MathUtils.degToRad(config.angle);
    const position = new THREE.Vector3(
      Math.sin(rad) * config.radius,
      config.height + 1.0, // 少し見上げる高さに
      -Math.cos(rad) * config.radius
    );

    const item = {
      src: config.src,
      config,
      position,
      mesh: null,
      aura: null,
      floatPhase: Math.random() * Math.PI * 2,
      pastelColors: [
        new THREE.Color(0xf6d9c9),
        new THREE.Color(0xf3c9d9),
        new THREE.Color(0xd9c9f3),
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
      const frameHeight = 4.5 * config.scale;
      const baseWidth = frameHeight * aspect;
      const baseHeight = frameHeight;

      const tex = new THREE.Texture(img);
      tex.needsUpdate = true;

      const geo = new THREE.PlaneGeometry(baseWidth, baseHeight);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        side: THREE.DoubleSide,
        opacity: 1,
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
      item.aura.position.copy(position).multiplyScalar(1.002);
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
  // update(dt)
  // ======================================================
  function update(dt) {
    yaw += (targetYaw - yaw) * 0.08;
    pitch += (targetPitch - pitch) * 0.08;

    approachProgress += (approachTarget - approachProgress) * 0.06;

    // 拡大中(十分近づいたら)は水面・水平線の光を隠す
    const zoomedIn = viewingItem && approachProgress > 0.3;
    water.visible = !zoomedIn;
    horizonGlow.visible = !zoomedIn;
    sunLine.visible = !zoomedIn;
    sunGlow.visible = !zoomedIn;

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

      const t = performance.now() * 0.0006;
      photoItems.forEach(item => {
        if (!item.mesh) return;
        item.mesh.material.opacity += (1.0 - item.mesh.material.opacity) * 0.05;
        if (item.aura) {
          item.aura.material.opacity += (0.5 - item.aura.material.opacity) * 0.05;
        }

        // ふわふわ上下浮遊
        const floatY = Math.sin(t + item.floatPhase) * 0.25;
        item.mesh.position.y = item.position.y + floatY;
        if (item.aura) item.aura.position.y = item.position.y + floatY;
      });
    }

    // ── 水面のアニメーション：常時ゆっくり、視点を動かすと少し強まる ──
    water.material.uniforms['time'].value += dt * 0.06;

    if (water.userData.lastYaw === undefined) {
      water.userData.lastYaw = yaw;
      water.userData.lastPitch = pitch;
      water.userData.rippleBoost = 0;
    }
    const viewMoveDist = Math.abs(yaw - water.userData.lastYaw) + Math.abs(pitch - water.userData.lastPitch);
    water.userData.lastYaw = yaw;
    water.userData.lastPitch = pitch;

    water.userData.rippleBoost += viewMoveDist * 3;
    water.userData.rippleBoost *= 0.92;

    water.material.uniforms['distortionScale'].value = 0.4 + water.userData.rippleBoost;

    // 背景グラデーション：現在見ている写真 + 隣接写真の色を混ぜて5色に
    bgUpdateTimer++;
    if (bgUpdateTimer % 3 === 0) {
      const facing = viewingItem || getFacingItem();

      if (facing && facing.loaded) {
        const idx = photoItems.indexOf(facing);
        const prevItem = photoItems[(idx - 1 + photoItems.length) % photoItems.length];
        const nextItem = photoItems[(idx + 1) % photoItems.length];

        targetColors = [
          (prevItem && prevItem.loaded) ? prevItem.pastelColors[2] : facing.pastelColors[0],
          facing.pastelColors[0],
          facing.pastelColors[1],
          facing.pastelColors[2],
          (nextItem && nextItem.loaded) ? nextItem.pastelColors[0] : facing.pastelColors[2],
        ];
      }

      for (let i = 0; i < currentColors.length; i++) {
        if (!targetColors[i]) continue;
        currentColors[i].lerp(targetColors[i], 0.06);
      }
      drawBackgroundGradient();
    }
  }

  return { scene, update };
}