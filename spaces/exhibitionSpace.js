import * as THREE from 'three';
import { GALLERY_RADIUS, MAX_TEX_DIM, SPARKLE_COUNT } from './config/constants.js';
import { PHOTO_CONFIG } from './core/photoConfig.js';
import { extractPastelColors } from './utils/color.js';
import { loadImageSafely, getTextureSource } from './utils/image.js';

// ======================================================================
// exhibitionSpace.js
// 元ファイルの [SECTION: lights] 〜 [SECTION: update end] をそのまま移動
// （このブロックは全部が同じ関数のローカル変数を共有しているため、
//   これ以上ファイルを分けるには設計変更が必要）
// ======================================================================

// ======================================================================
// エントリーポイント：外部(test.html)から呼び出される
// ======================================================================
export function startExhibitionSpace(renderer, camera) {
  const scene = new THREE.Scene();

  camera.position.set(0, 0, 0);

  // ====================================================================
  // [SECTION: lights] 照明
  // ====================================================================
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.15);
  scene.add(ambientLight);
  const keyLight = new THREE.DirectionalLight(0xffefe0, 0.3);
  keyLight.position.set(3, 8, 5);
  scene.add(keyLight);
  // ====================================================================
  // [SECTION: lights end]
  // ====================================================================


  // ====================================================================
  // [SECTION: background] 背景グラデーション
  // ====================================================================
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = 64;
  bgCanvas.height = 256;
  const bgCtx = bgCanvas.getContext('2d');
  const bgTexture = new THREE.CanvasTexture(bgCanvas);

  let currentColors = [
    new THREE.Color(0xd9a888),
    new THREE.Color(0xd68fa8),
    new THREE.Color(0xa88fd6),
    new THREE.Color(0x8fa8d6),
    new THREE.Color(0x8fd6a8),
    new THREE.Color(0xd68fc8),
    new THREE.Color(0xe0a0b8),
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
  // ====================================================================
  // [SECTION: background end]
  // ====================================================================


  // ====================================================================
  // [SECTION: water] 水面（波紋）
  // ====================================================================
  const waterGeo = new THREE.CircleGeometry(18, 96);
  const rippleUniforms = {
    time: { value: 0 },
    rippleBoost: { value: 0 },
    color1: { value: currentColors[1].clone() },
    color2: { value: currentColors[2].clone() },
    color3: { value: currentColors[3].clone() },
    color4: { value: currentColors[4].clone() },
    color5: { value: currentColors[5].clone() },
    color6: { value: new THREE.Color(0xff66cc) },
    color7: { value: new THREE.Color(0xcc66ff) },
  };
  const rippleMaterial = new THREE.ShaderMaterial({
    uniforms: rippleUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform float rippleBoost;
      uniform vec3 color1;
      uniform vec3 color2;
      uniform vec3 color3;
      uniform vec3 color4;
      uniform vec3 color5;
      uniform vec3 color6;
      uniform vec3 color7;
      varying vec2 vUv;

      void main() {
        vec2 centered = (vUv - 0.5) * 2.0;
        float dist = length(centered);
        float angle = atan(centered.y, centered.x);

        float amp = 0.5 + rippleBoost;

        float ripple = sin(dist * 16.0 - time * 1.3) * 0.5 + 0.5;
        float waveFade = exp(-dist * 0.8);
        ripple *= mix(0.4, 1.0, waveFade);
        ripple += sin(dist * 26.0 - time * 2.1 + 1.7) * 0.3;
        ripple += sin(angle * 6.0 + time * 0.9) * 0.2;
        ripple += sin(dist * 40.0 + sin(angle * 3.0) * 2.0 - time * 1.6) * 0.15;
        ripple *= amp;

        float edgeFade = smoothstep(0.95, 0.05, dist);

        float colorPhase = fract(dist * 0.6 - time * 0.06 + sin(angle) * 0.1 + ripple * 0.08);

        vec3 baseColor;

        if (colorPhase < 0.166) {
          baseColor = mix(color1, color2, colorPhase / 0.166);
        } else if (colorPhase < 0.333) {
          baseColor = mix(color2, color3, (colorPhase - 0.166) / 0.167);
        } else if (colorPhase < 0.5) {
          baseColor = mix(color3, color4, (colorPhase - 0.333) / 0.167);
        } else if (colorPhase < 0.666) {
          baseColor = mix(color4, color5, (colorPhase - 0.5) / 0.166);
        } else if (colorPhase < 0.833) {
          baseColor = mix(color5, color6, (colorPhase - 0.666) / 0.167);
        } else {
          baseColor = mix(color6, color7, (colorPhase - 0.833) / 0.167);
        }
        vec3 finalColor = baseColor + ripple * 0.16;

        float alpha = (0.18 + ripple * 0.32) * edgeFade;
        gl_FragColor = vec4(finalColor, alpha);
      }
    `,
  });
  const rippleWater = new THREE.Mesh(waterGeo, rippleMaterial);
  rippleWater.rotation.x = -Math.PI / 2;
  rippleWater.position.y = -8;
  scene.add(rippleWater);
  // ====================================================================
  // [SECTION: water end]
  // ====================================================================


  // ====================================================================
  // [SECTION: flare] 太陽フレア
  // ====================================================================
  function createFlareTexture() {
    const w = 1024, h = 128;
    const cnv = document.createElement('canvas');
    cnv.width = w; cnv.height = h;
    const ctx = cnv.getContext('2d');

    const vGrad = ctx.createLinearGradient(0, 0, 0, h);
    vGrad.addColorStop(0, 'rgba(255,235,200,0)');
    vGrad.addColorStop(0.5, 'rgba(255,235,200,0.27)');
    vGrad.addColorStop(1, 'rgba(255,235,200,0)');
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = 'lighter';
    const spotCount = 6;
    for (let i = 0; i < spotCount; i++) {
      const x = (w / spotCount) * (i + 0.5) + (Math.random() - 0.5) * 40;
      const radiusX = 60 + Math.random() * 80;
      const radiusY = radiusX * 0.3;

      const g = ctx.createRadialGradient(x, h / 2, 0, x, h / 2, radiusX);
      g.addColorStop(0, 'rgba(255,230,170,0.3)');
      g.addColorStop(1, 'rgba(255,230,170,0)');

      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, h / 2, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(cnv);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  const flareTexture = createFlareTexture();
  const FLARE_RADIUS = 15;
  const flareGeo = new THREE.CylinderGeometry(FLARE_RADIUS, FLARE_RADIUS, 8, 96, 1, true);
  const flareMaterial = new THREE.MeshBasicMaterial({
    map: flareTexture,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
    color: 0xe8c8a0,
    fog: false,
  });
  const flareRing = new THREE.Mesh(flareGeo, flareMaterial);
  flareRing.position.y = -7.8;
  scene.add(flareRing);
  // ====================================================================
  // [SECTION: flare end]
  // ====================================================================


  // ====================================================================
  // [SECTION: sparkles] キラキラ光の粒子
  // ====================================================================
  function createSparkleTexture() {
    const size = 64;
    const cnv = document.createElement('canvas');
    cnv.width = size; cnv.height = size;
    const ctx = cnv.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(cnv);
  }

  const sparkleTexture = createSparkleTexture();
  const sparklePositions = new Float32Array(SPARKLE_COUNT * 3);
  const sparkleColorsArr = new Float32Array(SPARKLE_COUNT * 3);
  const sparkleData = [];
  const globalColorPool = [];

  function randomPoolColor() {
    if (globalColorPool.length === 0) {
      return new THREE.Color().setHSL(Math.random(), 0.6, 0.55);
    }
    return globalColorPool[Math.floor(Math.random() * globalColorPool.length)];
  }

  for (let i = 0; i < SPARKLE_COUNT; i++) {
    const orbitRadius = 4 + Math.random() * (GALLERY_RADIUS + 18);
    const angle = Math.random() * Math.PI * 2;
    const baseY = -6 + Math.random() * 15;

    sparklePositions[i * 3 + 0] = Math.cos(angle) * orbitRadius;
    sparklePositions[i * 3 + 1] = baseY;
    sparklePositions[i * 3 + 2] = Math.sin(angle) * orbitRadius;

    const col = randomPoolColor();
    sparkleColorsArr[i * 3 + 0] = col.r;
    sparkleColorsArr[i * 3 + 1] = col.g;
    sparkleColorsArr[i * 3 + 2] = col.b;

    sparkleData.push({
      baseY,
      baseAngle: angle,
      orbitRadius,
      orbitSpeed: (Math.random() - 0.5) * 0.025,
      driftRadius: 0.4 + Math.random() * 1.0,
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.6,
    });
  }

  const sparkleGeo = new THREE.BufferGeometry();
  sparkleGeo.setAttribute('position', new THREE.BufferAttribute(sparklePositions, 3));
  sparkleGeo.setAttribute('color', new THREE.BufferAttribute(sparkleColorsArr, 3));

  const sparkleMaterial = new THREE.PointsMaterial({
    size: 0.4,
    map: sparkleTexture,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const sparkles = new THREE.Points(sparkleGeo, sparkleMaterial);
  scene.add(sparkles);

  function registerPhotoColorsToSparkles(pastelColors) {
    pastelColors.forEach(c => globalColorPool.push(c));
    const colorAttr = sparkleGeo.attributes.color;
    const updateCount = Math.min(24, SPARKLE_COUNT);
    for (let k = 0; k < updateCount; k++) {
      const idx = Math.floor(Math.random() * SPARKLE_COUNT);
      const c = pastelColors[Math.floor(Math.random() * pastelColors.length)];
      colorAttr.array[idx * 3 + 0] = c.r;
      colorAttr.array[idx * 3 + 1] = c.g;
      colorAttr.array[idx * 3 + 2] = c.b;
    }
    colorAttr.needsUpdate = true;
  }
  // ====================================================================
  // [SECTION: sparkles end]
  // ====================================================================


  // ====================================================================
  // [SECTION: photos] 写真アイテムの生成
  // ====================================================================
  const photoItems = [];

  function createPhotoItem(config) {
    const rad = THREE.MathUtils.degToRad(config.angle);
    const position = new THREE.Vector3(
      Math.sin(rad) * config.radius,
      config.height + 1.5,
      -Math.cos(rad) * config.radius
    );

    const item = {
      id: config.id,
      type: config.type,
      src: config.src,
      depth: config.depth,
      interaction: config.interaction,

      config,
      position,

      mesh: null,
      aura: null,

      lowTexture: null,
      highTexture: null,

      floatPhase: Math.random() * Math.PI * 2,
      pastelColors: [
        new THREE.Color(0xd9a888),
        new THREE.Color(0xd68fa8),
        new THREE.Color(0xa88fd6),
        new THREE.Color(0x8fa8d6),
        new THREE.Color(0xd68fc8),
      ],
      loaded: false,
      failed: false,
    };

    loadImageSafely(config.src, {
      timeoutMs: 10000,
      onFail: () => {
        item.failed = true;
      },
      onSuccess: (img) => {
        const aspect = img.width / img.height;
        const frameHeight = 4.5 * config.scale;
        const baseWidth = frameHeight * aspect;
        const baseHeight = frameHeight;

        const texSource = getTextureSource(img, MAX_TEX_DIM);
        const tex = new THREE.Texture(texSource);
        tex.needsUpdate = true;
        tex.anisotropy = 1;

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
        registerPhotoColorsToSparkles(item.pastelColors);
      },
    });

    return item;
  }

  PHOTO_CONFIG.forEach(cfg => photoItems.push(createPhotoItem(cfg)));
  // ====================================================================
  // [SECTION: photos end]
  // ====================================================================


  // ====================================================================
  // [SECTION: controls] 視点操作・クリック処理
  // ====================================================================
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

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  let viewingItem = null;
  let approachProgress = 0;
  let approachTarget = 0;
  const cameraHomePos = new THREE.Vector3(0, 0, 0);
  let cameraApproachPos = new THREE.Vector3();

  function handlePhotoSelect(item) {
    switch (item.type) {
      case 'normal':
      case 'depth':
      case 'letter':
      case 'bubble':
      default: {
        if (viewingItem === item) {
          viewingItem = null;
          approachTarget = 0;
        } else {
          viewingItem = item;
          approachTarget = 1;
          const dir = item.position.clone().normalize();
          cameraApproachPos = item.position.clone().sub(dir.multiplyScalar(5));
        }
        break;
      }
    }
  }

  function onPointerClick(clientX, clientY) {
    pointer.x = (clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const meshes = photoItems.filter(it => it.mesh).map(it => it.mesh);
    const hits = raycaster.intersectObjects(meshes);

    if (hits.length > 0) {
      const item = hits[0].object.userData.photoItem;
      handlePhotoSelect(item);
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
  // ====================================================================
  // [SECTION: controls end]
  // ====================================================================


  // ====================================================================
  // [SECTION: update] 毎フレーム更新処理
  // ====================================================================
  let bgUpdateTimer = 0;
  const warmFlareTint = new THREE.Color(0xe0b888);

  function updateCamera(dt) {
    yaw += (targetYaw - yaw) * 0.08;
    pitch += (targetPitch - pitch) * 0.08;

    approachProgress += (approachTarget - approachProgress) * 0.06;

    if (viewingItem && approachProgress > 0.01) {
      camera.position.lerpVectors(cameraHomePos, cameraApproachPos, approachProgress);
      camera.lookAt(viewingItem.position);
    } else {
      camera.position.lerp(cameraHomePos, 0.1);
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
    }
  }

  function updatePhotos(dt) {
    const zoomedIn = viewingItem && approachProgress > 0.3;
    rippleWater.visible = !zoomedIn;
    flareRing.visible = !zoomedIn;
    sparkles.visible = !zoomedIn;

    if (viewingItem && approachProgress > 0.01) {
      photoItems.forEach(item => {
        if (!item.mesh) return;
        const targetOpacity = item === viewingItem ? 1.0 : 0.25;
        item.mesh.material.opacity += (targetOpacity - item.mesh.material.opacity) * 0.05;
        if (item.aura) {
          item.aura.material.opacity += ((item === viewingItem ? 0.7 : 0.1) - item.aura.material.opacity) * 0.05;
        }
      });
    } else {
      const t = performance.now() * 0.0006;
      photoItems.forEach(item => {
        if (!item.mesh) return;
        item.mesh.material.opacity += (1.0 - item.mesh.material.opacity) * 0.05;
        if (item.aura) {
          item.aura.material.opacity += (0.5 - item.aura.material.opacity) * 0.05;
        }

        const floatY = Math.sin(t + item.floatPhase) * 0.25;
        item.mesh.position.y = item.position.y + floatY;
        if (item.aura) item.aura.position.y = item.position.y + floatY;
      });
    }
  }

  function updateRipple(dt) {
    rippleUniforms.time.value += dt * 0.5;

    if (rippleWater.userData.lastYaw === undefined) {
      rippleWater.userData.lastYaw = yaw;
      rippleWater.userData.lastPitch = pitch;
      rippleWater.userData.rippleBoost = 0;
    }
    const viewMoveDist = Math.abs(yaw - rippleWater.userData.lastYaw) + Math.abs(pitch - rippleWater.userData.lastPitch);
    rippleWater.userData.lastYaw = yaw;
    rippleWater.userData.lastPitch = pitch;

    rippleWater.userData.rippleBoost += viewMoveDist * 2;
    rippleWater.userData.rippleBoost *= 0.92;

    rippleUniforms.rippleBoost.value = rippleWater.userData.rippleBoost;

    flareTexture.offset.x = (flareTexture.offset.x + dt * 0.004) % 1;
  }

  function updateSparkles(dt) {
    const sparkleT = performance.now() * 0.0006;
    const posAttr = sparkleGeo.attributes.position;
    for (let i = 0; i < SPARKLE_COUNT; i++) {
      const d = sparkleData[i];
      d.baseAngle += d.orbitSpeed * dt;
      const radius = d.orbitRadius + Math.sin(sparkleT * 0.5 + d.phase) * d.driftRadius;
      posAttr.array[i * 3 + 0] = Math.cos(d.baseAngle) * radius;
      posAttr.array[i * 3 + 2] = Math.sin(d.baseAngle) * radius;
      posAttr.array[i * 3 + 1] = d.baseY + Math.sin(sparkleT * d.speed + d.phase) * 0.7;
    }
    posAttr.needsUpdate = true;
    sparkleMaterial.opacity = THREE.MathUtils.clamp(0.55 + Math.sin(sparkleT * 2.2) * 0.25, 0.25, 0.95);
    sparkleMaterial.size = 0.2 + Math.sin(sparkleT * 3.1) * 0.06;
  }

  function updateBackground(dt) {
    bgUpdateTimer++;
    if (bgUpdateTimer % 3 === 0) {
      const facing = viewingItem || getFacingItem();

      if (facing && facing.loaded) {
        const defaultPink = new THREE.Color(0xd68fa8);
        const defaultPurple = new THREE.Color(0xa88fd6);
        const defaultMidnight = new THREE.Color(0x8fa8d6);

        const fCols = facing.pastelColors;

        targetColors = [
          defaultPink.clone().lerp(fCols[0], 0.4),
          fCols[0],
          defaultPurple.clone().lerp(fCols[2], 0.3),
          fCols[2],
          fCols[4],
          defaultMidnight.clone().lerp(fCols[3], 0.4),
          defaultPink.clone().lerp(fCols[1], 0.3)
        ];
      }

      for (let i = 0; i < currentColors.length; i++) {
        if (!targetColors[i]) continue;
        currentColors[i].lerp(targetColors[i], 0.04);
      }
      drawBackgroundGradient();

      rippleUniforms.color1.value.copy(currentColors[1]);
      rippleUniforms.color2.value.copy(currentColors[2]);
      rippleUniforms.color3.value.copy(currentColors[3]);
      rippleUniforms.color4.value.copy(currentColors[4]);
      rippleUniforms.color5.value.copy(currentColors[5]);

      const flareTint = currentColors[2].clone().lerp(warmFlareTint, 0.5);
      flareMaterial.color.lerp(flareTint, 0.08);
    }
  }

  function update(dt) {
    updateCamera(dt);
    updatePhotos(dt);
    updateRipple(dt);
    updateSparkles(dt);
    updateBackground(dt);
  }
  // ====================================================================
  // [SECTION: update end]
  // ====================================================================

  return { scene, update };
}