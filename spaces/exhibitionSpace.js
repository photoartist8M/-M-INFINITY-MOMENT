import * as THREE from 'three';
import { GALLERY_RADIUS, MAX_TEX_DIM, SPARKLE_COUNT, IS_MOBILE } from './config/constants.js';
import { PHOTO_CONFIG } from './core/photoConfig.js';
import { extractPastelColors } from './utils/color.js';
import { loadImageSafely, getTextureSource } from './utils/image.js';
import { hasSubmitted, submitMessage, fetchLetterMessages, fetchBubbleMessages } from './core/messaging.js';
import { BookReveal } from './effects/BookReveal.js';
import { fadeVolume, space2BGM, playSFX, kirakiraSFX } from './audio.js';

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
  const spaceStartTime = performance.now(); // ★追加：次空間の演出開始時刻（フェードインの基準）

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
  // [SECTION: mobileFocusButton] スマホ用：正面の写真に留まると出現する決定ボタン
  // ====================================================================
  let focusButtonEl = null;
  if (IS_MOBILE) {
    focusButtonEl = document.createElement('button');
    focusButtonEl.textContent = 'view';
    Object.assign(focusButtonEl.style, {
      position: 'fixed',
      left: '50%',
      top: '85%',
      bottom: 'auto',
      transform: 'translateX(-50%) translateY(-20px)',
      padding: '8px 32px',
      fontSize: '18px',
      fontWeight: '400',
      fontFamily: 'sans-serif',
      color: '#d8b46a',
      background: 'rgba(210, 165, 106, 0.04)',
      border: '1px solid rgba(255, 230, 190, 0.7)',
      borderRadius: '999px',
      boxShadow: '0 0 20px rgba(255, 210, 160, 0.35), 0 4px 16px rgba(0,0,0,0.2)',
      backdropFilter: 'blur(6px)',
      opacity: '0',
      pointerEvents: 'none',
      transition: 'opacity 0.5s ease, transform 0.5s ease',
      zIndex: '10',
      letterSpacing: '0.08em',
      whiteSpace: 'nowrap',
    });
    document.body.appendChild(focusButtonEl);
  }

  let focusedItem = null;      // 現在正面に留まっている写真
  let focusTimer = 0;          // 留まっている時間(秒)
  let focusButtonVisible = false;
  const FOCUS_DWELL_TIME = 1.0; // 何秒留まったらボタンを出すか

  function showFocusButton() {
    if (!focusButtonEl || focusButtonVisible) return;
    focusButtonVisible = true;
    focusButtonEl.style.opacity = '1';
    focusButtonEl.style.transform = 'translateX(-50%) translateY(0)';
    focusButtonEl.style.pointerEvents = 'auto';
  }

  function hideFocusButton() {
    if (!focusButtonEl || !focusButtonVisible) return;
    focusButtonVisible = false;
    focusButtonEl.style.opacity = '0';
    focusButtonEl.style.transform = 'translateX(-50%) translateY(-20px)';
    focusButtonEl.style.pointerEvents = 'none';
  }

  if (focusButtonEl) {
    focusButtonEl.addEventListener('click', () => {
      if (focusedItem) {
        handlePhotoSelect(focusedItem);
        hideFocusButton();
        focusTimer = 0;
      }
    });
  }
  // ====================================================================
  // [SECTION: mobileFocusButton end]
  // ====================================================================


  // ====================================================================
  // [SECTION: messageUI] 飛行機・シャボン玉：記入ボタン＆入力フォーム
  // ====================================================================
  const writeButtonEl = document.createElement('button');
  writeButtonEl.textContent = 'message';
  Object.assign(writeButtonEl.style, {
    position: 'fixed',
    left: '50%',
    bottom: '9%',
    transform: 'translateX(-50%) translateY(20px)',
    padding: '6px 20px',
    fontSize: '10px',
    fontFamily: 'sans-serif',
    color: '#3a2c20',
    background: 'rgba(255, 240, 220, 0.3)',
    border: '1px solid rgba(255, 230, 190, 0.7)',
    borderRadius: '999px',
    boxShadow: '0 0 20px rgba(255, 210, 160, 0.35), 0 4px 16px rgba(0,0,0,0.2)',
    backdropFilter: 'blur(6px)',
    opacity: '0',
    pointerEvents: 'none',
    transition: 'opacity 0.5s ease, transform 0.5s ease',
    zIndex: '15',
    letterSpacing: '0.08em',
    whiteSpace: 'nowrap',
  });
  document.body.appendChild(writeButtonEl);

  let writeButtonVisible = false;
  function showWriteButton() {
    if (writeButtonVisible) return;
    writeButtonVisible = true;
    writeButtonEl.style.opacity = '1';
    writeButtonEl.style.transform = 'translateX(-50%) translateY(0)';
    writeButtonEl.style.pointerEvents = 'auto';
  }
  function hideWriteButton() {
    if (!writeButtonVisible) return;
    writeButtonVisible = false;
    writeButtonEl.style.opacity = '0';
    writeButtonEl.style.transform = 'translateX(-50%) translateY(20px)';
    writeButtonEl.style.pointerEvents = 'none';
  }

  const formOverlayEl = document.createElement('div');
  Object.assign(formOverlayEl.style, {
    position: 'fixed',
    inset: '0',
    background: 'rgba(10, 8, 15, 0.55)',
    backdropFilter: 'blur(4px)',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '20',
  });

  const formPanelEl = document.createElement('div');
  Object.assign(formPanelEl.style, {
    width: 'min(92vw, 560px)',
    background: 'rgba(30, 24, 38, 0.9)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '20px',
    padding: '28px 24px',
    boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
    fontFamily: 'sans-serif',
    color: '#fff',
  });

  const formTitleEl = document.createElement('div');
  Object.assign(formTitleEl.style, {
    fontSize: '15px',
    marginBottom: '16px',
    opacity: '0.85',
    letterSpacing: '0.05em',
  });

  const nameInputEl = document.createElement('input');
  nameInputEl.type = 'text';
  nameInputEl.placeholder = 'お名前（任意）';
  nameInputEl.maxLength = 30;
  Object.assign(nameInputEl.style, {
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 14px',
    marginBottom: '12px',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(255,255,255,0.08)',
    color: '#fff',
    fontSize: '17px',
    outline: 'none',
  });

  const messageInputEl = document.createElement('textarea');
  messageInputEl.placeholder = 'メッセージ';
  messageInputEl.maxLength = 200;
  messageInputEl.rows = 5;
  Object.assign(messageInputEl.style, {
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 14px',
    marginBottom: '16px',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(255,255,255,0.08)',
    color: '#fff',
    fontSize: '17px',
    outline: 'none',
    resize: 'none',
    fontFamily: 'sans-serif',
  });

  const formErrorEl = document.createElement('div');
  Object.assign(formErrorEl.style, {
    color: '#ffb4b4',
    fontSize: '13px',
    marginBottom: '10px',
    minHeight: '18px',
  });

  const formButtonRowEl = document.createElement('div');
  Object.assign(formButtonRowEl.style, {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end',
  });

  const cancelButtonEl = document.createElement('button');
  cancelButtonEl.textContent = 'やめる';
  Object.assign(cancelButtonEl.style, {
    padding: '10px 20px',
    borderRadius: '999px',
    border: '1px solid rgba(255,255,255,0.25)',
    background: 'transparent',
    color: 'rgba(255,255,255,0.7)',
    fontSize: '14px',
    cursor: 'pointer',
  });

  const submitButtonEl = document.createElement('button');
  submitButtonEl.textContent = '送信する';
  Object.assign(submitButtonEl.style, {
    padding: '10px 24px',
    borderRadius: '999px',
    border: 'none',
    background: 'rgba(255, 210, 160, 0.9)',
    color: '#3a2c20',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
  });

  formButtonRowEl.appendChild(cancelButtonEl);
  formButtonRowEl.appendChild(submitButtonEl);
  formPanelEl.appendChild(formTitleEl);
  formPanelEl.appendChild(nameInputEl);
  formPanelEl.appendChild(messageInputEl);
  formPanelEl.appendChild(formErrorEl);
  formPanelEl.appendChild(formButtonRowEl);
  formOverlayEl.appendChild(formPanelEl);
  document.body.appendChild(formOverlayEl);

  let formTargetItem = null;
  let formSubmitting = false;

  function applyLetterStyle() {
    Object.assign(formPanelEl.style, {
      background: 'repeating-linear-gradient(#ffffff 0px, #ffffff 27px, #ececec 28px)', // ★変更：黄色みのあるクリーム色→白に
      border: '1px solid rgba(120,100,70,0.35)',
      borderRadius: '4px',
      boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
      color: '#4a3c28',
      fontFamily: `'Georgia', 'Hiragino Mincho ProN', serif`,
    });
    formTitleEl.style.color = '#4a3c28';
    formTitleEl.style.opacity = '0.75';
    [nameInputEl, messageInputEl].forEach(el => {
      Object.assign(el.style, {
        background: 'rgba(255,255,255,0.35)',
        border: '1px solid rgba(120,100,70,0.3)',
        color: '#4a3c28',
        fontFamily: `'Georgia', 'Hiragino Mincho ProN', serif`,
      });
    });
    submitButtonEl.style.background = 'rgba(210, 175, 120, 0.9)';
    submitButtonEl.style.color = '#3a2c18';
    cancelButtonEl.style.color = 'rgba(74,60,40,0.6)';
    cancelButtonEl.style.border = '1px solid rgba(120,100,70,0.3)';
  }

  function applyBubbleStyle() {
    Object.assign(formPanelEl.style, {
      background: 'rgba(30, 24, 38, 0.9)',
      border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: '20px',
      boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
      color: '#fff',
      fontFamily: 'sans-serif',
    });
    formTitleEl.style.color = '#fff';
    formTitleEl.style.opacity = '0.85';
    [nameInputEl, messageInputEl].forEach(el => {
      Object.assign(el.style, {
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.25)',
        color: '#fff',
        fontFamily: 'sans-serif',
      });
    });
    submitButtonEl.style.background = 'rgba(255, 210, 160, 0.9)';
    submitButtonEl.style.color = '#3a2c20';
    cancelButtonEl.style.color = 'rgba(255,255,255,0.7)';
    cancelButtonEl.style.border = '1px solid rgba(255,255,255,0.25)';
  }

  function openMessageForm(item) {
    formTargetItem = item;
    formErrorEl.textContent = '';
    nameInputEl.value = '';
    messageInputEl.value = '';

    if (item.type === 'letter') {
      formTitleEl.textContent = 'この空間で感じた想いを紙飛行機にのせて';
      applyLetterStyle();
    } else {
      formTitleEl.textContent = 'ふっと生まれた想いをシャボン玉にそっと浮かべて';
      applyBubbleStyle();
    }

    formOverlayEl.style.display = 'flex';
    hideWriteButton();
  }

  function closeMessageForm() {
    formOverlayEl.style.display = 'none';
    formTargetItem = null;
  }

  cancelButtonEl.addEventListener('click', closeMessageForm);

  submitButtonEl.addEventListener('click', async () => {
    if (formSubmitting || !formTargetItem) return;

    const message = messageInputEl.value.trim();
    if (!message) {
      formErrorEl.textContent = 'メッセージを入力してください';
      return;
    }

    formSubmitting = true;
    submitButtonEl.textContent = '送信中...';
    submitButtonEl.disabled = true;

    try {
      const submittedItem = formTargetItem;
      await submitMessage({
        photoId: submittedItem.id,
        type: submittedItem.type,
        name: nameInputEl.value,
        message,
      });
      closeMessageForm();

      const spawnData = {
        name: nameInputEl.value && nameInputEl.value.trim() ? nameInputEl.value.trim() : null,
        message,
      };
      let trackedPosition = null;
      if (submittedItem.type === 'letter') {
        spawnLetterPlane(spawnData, submittedItem.position.clone());
        trackedPosition = letterPlanes[letterPlanes.length - 1].sprite.position;
      } else if (submittedItem.type === 'bubble') {
        spawnBubble(spawnData, submittedItem.position.clone());
        trackedPosition = bubbles[bubbles.length - 1].sprite.position;
      }

      if (trackedPosition) {
        // ★修正：写真のフレームサイズ(calcFitDistance)を基準にすると、
        // 写真ごとの大きさに引きずられて距離が安定しなかった。
        // 紙飛行機/シャボン玉自体のスケールを基準にした、程よく近い距離に変更する。
        const dir = submittedItem.position.clone();
        dir.y = 0;
        dir.normalize();

        const spawnedScale = (submittedItem.type === 'letter')
          ? letterPlanes[letterPlanes.length - 1].sprite.scale.x
          : bubbles[bubbles.length - 1].sprite.scale.x || 2.0;
        const seeOffDistance = Math.max(6, spawnedScale * 2.6); // ★変更：紙飛行機自体のサイズ基準の距離(写真に寄りすぎない下限も設定)

        cameraApproachPos = submittedItem.position.clone().sub(dir.multiplyScalar(seeOffDistance));
        cameraApproachPos.y = submittedItem.position.y - 1; // 少し低い位置から見上げる構図

        viewingItem = { position: trackedPosition };
        approachProgress = Math.min(approachProgress, 0.6);
        approachTarget = 0.55; // ★変更(0.35→0.55)：もう少し寄って紙飛行機をはっきり見せる
        setTimeout(() => {
          viewingItem = null;
          approachTarget = 0;
        }, 5000);
      }
    } catch (err) {
      if (err && err.message === 'NG_WORD_DETECTED') {
        formErrorEl.textContent = '不適切な言葉が含まれている可能性があります。内容を見直してください。';
      } else {
        formErrorEl.textContent = '送信に失敗しました。時間をおいて試してください。';
      }
    } finally {
      formSubmitting = false;
      submitButtonEl.textContent = '送信する';
      submitButtonEl.disabled = false;
    }
  });

  writeButtonEl.addEventListener('click', () => {
    if (viewingItem && (viewingItem.type === 'letter' || viewingItem.type === 'bubble')) {
      openMessageForm(viewingItem);
    }
  });

  // ★追加：紙飛行機・シャボン玉をタップした時に、そこに書かれたメッセージを
  // 読める吹き出し（ツールチップ）。これが無いためタップしても無反応だった。
  const messageTooltipEl = document.createElement('div');
  Object.assign(messageTooltipEl.style, {
    position: 'fixed',
    left: '50%',
    top: '20%', // ★変更(50%→20%)：表示位置を30%ほど上に
    transform: 'translate(-50%, -50%) scale(0.96)',
    maxWidth: 'min(86vw, 380px)',
    padding: '22px 26px',
    borderRadius: '14px',
    background: 'rgba(20, 16, 26, 0.35)',
    border: '1px solid rgba(255,255,255,0.12)',
    boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
    backdropFilter: 'blur(6px)',
    color: '#fff',
    fontFamily: `'Hiragino Mincho ProN', 'Georgia', serif`,
    textAlign: 'center',
    opacity: '0',
    pointerEvents: 'none',
    transition: 'opacity 0.35s ease, transform 0.35s ease',
    zIndex: '22',
  });
  const messageTooltipNameEl = document.createElement('div');
  Object.assign(messageTooltipNameEl.style, {
    fontSize: '12px',
    opacity: '0.6',
    marginBottom: '10px',
    letterSpacing: '0.08em',
  });
  const messageTooltipBodyEl = document.createElement('div');
  Object.assign(messageTooltipBodyEl.style, {
    fontSize: '15px',
    lineHeight: '1.8',
    whiteSpace: 'pre-line',
    wordBreak: 'break-word',
  });
  messageTooltipEl.appendChild(messageTooltipNameEl);
  messageTooltipEl.appendChild(messageTooltipBodyEl);
  document.body.appendChild(messageTooltipEl);

  let messageTooltipTimer = null;
  function showMessageTooltip(data, planeColor) {
    if (!data) return;
    const message = (data.message || '').trim();
    if (!message) return; // メッセージが無いものはタップしても何も出さない

    messageTooltipNameEl.textContent = data.name ? data.name : '匿名';
    messageTooltipBodyEl.textContent = message;

    // ★追加：紙飛行機の色があれば、枠と淡い発光をその色に合わせる
    if (planeColor) {
      messageTooltipEl.style.border = `1px solid ${hexToRgba(planeColor, 0.5)}`;
      messageTooltipEl.style.boxShadow = `0 12px 40px rgba(0,0,0,0.3), 0 0 24px ${hexToRgba(planeColor, 0.25)}`;
    } else {
      messageTooltipEl.style.border = '1px solid rgba(255,255,255,0.12)';
      messageTooltipEl.style.boxShadow = '0 12px 40px rgba(0,0,0,0.3)';
    }

    messageTooltipEl.style.opacity = '1';
    messageTooltipEl.style.transform = 'translate(-50%, -50%) scale(1)';
    messageTooltipEl.style.pointerEvents = 'auto';

    clearTimeout(messageTooltipTimer);
    messageTooltipTimer = setTimeout(hideMessageTooltip, 4000);
  }
  function hideMessageTooltip() {
    clearTimeout(messageTooltipTimer);
    messageTooltipEl.style.opacity = '0';
    messageTooltipEl.style.transform = 'translate(-50%, -50%) scale(0.96)';
    messageTooltipEl.style.pointerEvents = 'none';
  }
  messageTooltipEl.addEventListener('click', hideMessageTooltip);

function updateWriteButton() {
    if (formOverlayEl.style.display === 'flex') return;
    if (introCinematicActive) { hideWriteButton(); return; }

    const zoomedFully = viewingItem && approachProgress > 0.85;
    const eligible =
      zoomedFully &&
      (viewingItem.type === 'letter' || viewingItem.type === 'bubble');
      // ★変更：!hasSubmitted(viewingItem.type) の条件を削除。何度でも投稿できるようにする

    if (eligible) {
      showWriteButton();
    } else {
      hideWriteButton();
    }
  }
  // ====================================================================
  // [SECTION: messageUI end]
  // ====================================================================


  // ====================================================================
  // [SECTION: flyingMessages] 紙飛行機・シャボン玉の生成と浮遊演出
  // ====================================================================
  const PLANE_COLORS = ['#3d8fd6', '#4fa84f', '#e8822a', '#e8508f', '#8a4fd6', '#e8b800'];
  const BUBBLE_GLOW_COLORS = ['#ffb4dc', '#b4d0ff', '#b4ffd8', '#fff0b0', '#d8b4ff', '#ffffff']; // ★追加：シャボン玉のハロー色バリエーション

  function createPaperPlaneTexture(baseColor) {
    const size = 180;
    const cnv = document.createElement('canvas');
    cnv.width = size; cnv.height = size;
    const ctx = cnv.getContext('2d');

    function shade(hex, amt) {
      const n = parseInt(hex.slice(1), 16);
      const r = Math.min(255, Math.max(0, (n >> 16) + amt));
      const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amt));
      const b = Math.min(255, Math.max(0, (n & 0xff) + amt));
      return `rgb(${r},${g},${b})`;
    }

    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(-Math.PI / 9);

    ctx.fillStyle = shade(baseColor, 35);
    ctx.beginPath();
    ctx.moveTo(58, 0);
    ctx.lineTo(-46, 16);
    ctx.lineTo(-24, 3);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.moveTo(58, 0);
    ctx.lineTo(-46, -27);
    ctx.lineTo(-18, -3);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = shade(baseColor, -20);
    ctx.beginPath();
    ctx.moveTo(58, 0);
    ctx.lineTo(-24, 3);
    ctx.lineTo(-18, -3);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(60,40,20,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(58, 0);
    ctx.lineTo(-24, 3);
    ctx.moveTo(58, 0);
    ctx.lineTo(-18, -3);
    ctx.stroke();
    ctx.restore();
    return new THREE.CanvasTexture(cnv);
  }

  function createSkyDomeTexture() {
    const w = 512, h = 256;
    const cnv = document.createElement('canvas');
    cnv.width = w; cnv.height = h;
    const ctx = cnv.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#232f52');
    g.addColorStop(0.45, '#455470');
    g.addColorStop(0.8, '#6f6f88');
    g.addColorStop(1, 'rgba(120,115,140,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 35; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h * 0.6;
      const r = Math.random() * 0.9 + 0.2;
      ctx.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.35})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    return new THREE.CanvasTexture(cnv);
  }

  const skyDomeGeo = new THREE.SphereGeometry(90, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const skyDomeMat = new THREE.MeshBasicMaterial({
    map: createSkyDomeTexture(),
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const skyDome = new THREE.Mesh(skyDomeGeo, skyDomeMat);
  scene.add(skyDome);

  function createBubbleTexture() {
    const size = 200;
    const cnv = document.createElement('canvas');
    cnv.width = size; cnv.height = size;
    const ctx = cnv.getContext('2d');
    const cx = size / 2, cy = size / 2, r = size / 2 - 6;

    const fill = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    fill.addColorStop(0, 'rgba(255,255,255,0.40)');
    fill.addColorStop(0.55, 'rgba(220,230,255,0.26)');
    fill.addColorStop(1, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    const rim = ctx.createConicGradient(0, cx, cy);
    rim.addColorStop(0.0, 'rgba(255,180,220,0.85)');
    rim.addColorStop(0.2, 'rgba(180,210,255,0.85)');
    rim.addColorStop(0.4, 'rgba(190,255,220,0.85)');
    rim.addColorStop(0.6, 'rgba(255,240,180,0.85)');
    rim.addColorStop(0.8, 'rgba(230,180,255,0.85)');
    rim.addColorStop(1.0, 'rgba(255,180,220,0.85)');
    ctx.strokeStyle = rim;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.38, cy - r * 0.4, r * 0.22, r * 0.13, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.3, cy + r * 0.32, r * 0.1, r * 0.06, -0.5, 0, Math.PI * 2);
    ctx.fill();

    return new THREE.CanvasTexture(cnv);
  }

  const bubbleTexture = createBubbleTexture();

  const letterPlanes = [];
  const bubbles = [];
  const MAX_BUBBLES = 30;

  function spawnLetterPlane(data, fromPosition) {
    const color = PLANE_COLORS[Math.floor(Math.random() * PLANE_COLORS.length)];
    const mat = new THREE.SpriteMaterial({
      map: createPaperPlaneTexture(color),
      transparent: true,
      depthWrite: false,
      depthTest: false, // ★追加：写真フレームの裏に隠れて見えなくなっていたため、常に手前に描画する
      opacity: 0.95,
      fog: false, // ★追加：霧で色が白く薄まり見えなくなっていたため除外
    });
    const sprite = new THREE.Sprite(mat);
    sprite.renderOrder = 10; // ★追加：確実に他オブジェクトより後(手前)に描画されるように
    const scaleV = 7 + Math.random() * 2;
    sprite.scale.set(scaleV, scaleV, 1);

    // ★追加：機体色で光る加算合成のハロー。単体だと空に溶け込みがちなため、
    // 背後にほのかな発光を添えて視認性を上げる。
    const glowMat = new THREE.SpriteMaterial({
      map: sparkleTexture,
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0.2, // ★変更(0.55→0.2)：強すぎたため弱める
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false, // ★追加：同上
      fog: false, // ★追加：霧の影響を除外
    });
    const glowSprite = new THREE.Sprite(glowMat);
    glowSprite.renderOrder = 9; // ★追加：本体(10)より奥、他より手前
    glowSprite.scale.set(scaleV * 1.05, scaleV * 1.05, 1); // ★変更(1.12→1.05)：さらに本体サイズに近づける

const startHeight = fromPosition ? fromPosition.y : (15 + Math.random() * 6);
    const startPos = fromPosition
        ? camera.position.clone()
        .add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(0.05)) 
        .add(new THREE.Vector3(0, -0.20, -0.3)) 
      : new THREE.Vector3(
          (Math.random() - 0.5) * GALLERY_RADIUS * 1.6,
          startHeight,
          (Math.random() - 0.5) * GALLERY_RADIUS * 1.6
        );
    sprite.position.copy(startPos);
    glowSprite.position.copy(startPos);
    sprite.material.rotation = Math.random() * Math.PI * 2;
    sprite.userData.messageData = data;
    sprite.userData.planeColor = color; // ★追加：ツールチップの色合わせに使用
    scene.add(sprite);
    scene.add(glowSprite);

const heading = Math.random() * Math.PI * 2;

    // ★変更：ふわふわ上下に漂いながら上昇するのではなく、投げた瞬間に
    // スーッと勢いよく斜め上へ飛んでいく「swoosh」な動きにする。
    // 速度を積み上げるのではなく、開始地点→目標地点を時間で直接補間する。
    const riseDuration = 2000 + Math.random() * 300; // 1.1〜1.3秒でスッと上がりきる
    const riseDistance = 12 + Math.random() * 4;
    const riseTargetPos = new THREE.Vector3(
      startPos.x + Math.cos(heading) * riseDistance,
      45 + Math.random() * 8,
      startPos.z + Math.sin(heading) * riseDistance
    );

    letterPlanes.push({
      sprite,
      glowSprite, // ★追加
      data,
      color, // ★追加
      velocity: new THREE.Vector3(
        Math.cos(heading) * 4.0,
        0,
        Math.sin(heading) * 4.0
      ),
      height: startHeight,
      targetHeight: riseTargetPos.y,
      rising: !!fromPosition,
      riseStart: performance.now(),
      riseDuration,
      riseStartPos: startPos.clone(),
      riseTargetPos,
      riseInitialScale: scaleV,
      phase: Math.random() * Math.PI * 2,
    });
  }

  function spawnBubble(data, fromPosition) {
    const mat = new THREE.SpriteMaterial({
      map: bubbleTexture,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const sprite = new THREE.Sprite(mat);
    const s = 2 + Math.random() * 1;
    sprite.scale.set(0.01, 0.01, 1);

    const restingY = 27 + Math.random() * 8; // ★変更：シャボン玉はもう少し低い位置を漂う
    const startY = fromPosition ? fromPosition.y : restingY;

    const startPos = fromPosition
        ? camera.position.clone()
        .add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(3.5))
        .add(new THREE.Vector3(0, -0.8, 0))
      : new THREE.Vector3(
          (Math.random() - 0.5) * GALLERY_RADIUS * 1.5,
          startY,
          (Math.random() - 0.5) * GALLERY_RADIUS * 1.5
        );
    sprite.position.copy(startPos);
    sprite.userData.messageData = data;
    scene.add(sprite);

    // ★追加：シャボン玉本体とほぼ同サイズの、薄い加算合成ハロー(色はランダム)
    const bubbleGlowColor = BUBBLE_GLOW_COLORS[Math.floor(Math.random() * BUBBLE_GLOW_COLORS.length)];
    const glowMat = new THREE.SpriteMaterial({
      map: sparkleTexture,
      color: new THREE.Color(bubbleGlowColor),
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false, // ★追加：霧の影響を除外
    });
    const glowSprite = new THREE.Sprite(glowMat);
    glowSprite.scale.set(0.01, 0.01, 1);
    glowSprite.position.copy(startPos);
    scene.add(glowSprite);

    bubbles.push({
      sprite,
      glowSprite, // ★追加
      data,
      angle: Math.random() * Math.PI * 2,
      radius: 4 + Math.random() * (GALLERY_RADIUS * 0.7),
      baseY: restingY,
      currentY: startY,
      phase: Math.random() * Math.PI * 2,
      driftSpeed: 0.05 + Math.random() * 0.1,
      targetScale: s,
      popProgress: 0,
    });

    if (bubbles.length > MAX_BUBBLES) {
      const removed = bubbles.shift();
      scene.remove(removed.sprite);
      removed.sprite.material.dispose();
      if (removed.glowSprite) {
        scene.remove(removed.glowSprite);
        removed.glowSprite.material.dispose();
      }
    }
  }

  // ★変更：紙飛行機は「過去に送信された本物のメッセージ」のみ復元する。
  // 環境演出用の空メッセージ紙飛行機は、目の前にないと視認しづらく紛らわしいため廃止。
  // シャボン玉は従来通り、不足分を環境演出で補う。
  const TARGET_BUBBLE_COUNT = 14;

  function fillAmbientBubbles(existingCount) {
    for (let i = existingCount; i < TARGET_BUBBLE_COUNT; i++) {
      spawnBubble({ name: null, message: '' });
    }
  }

(async () => {
    try {
      const pastLetters = await fetchLetterMessages();
      const MAX_LETTER_PLANES = 15; // ★ここで表示する紙飛行機の最大数を調整
      const fullList = Array.isArray(pastLetters) ? pastLetters : [];
      // 配列の末尾＝一番新しいメッセージという前提。もし逆順で返ってくる場合は
      // list.slice(0, MAX_LETTER_PLANES) に変えてください。
      const list = fullList.slice(-MAX_LETTER_PLANES);
      list.forEach((msg) => {
        spawnLetterPlane({ name: msg.name ?? null, message: msg.message ?? '' });
      });
    } catch (err) {
      console.warn('紙飛行機メッセージの復元に失敗しました:', err);
    }
  })();

  (async () => {
    try {
      const pastBubbles = await fetchBubbleMessages();
      const list = Array.isArray(pastBubbles) ? pastBubbles : [];
      list.forEach((msg) => {
        spawnBubble({ name: msg.name ?? null, message: msg.message ?? '' });
      });
      //fillAmbientBubbles(list.length);  環境用シャボン
    } catch (err) {
      console.warn('シャボン玉メッセージの復元に失敗しました:', err);
      //fillAmbientBubbles(0); 環境用シャボン
    }
  })();

 function updateFlyingMessages(dt) {
    const maxR = GALLERY_RADIUS * 1.8;
    const t = performance.now() * 0.0004;

    letterPlanes.forEach(e => {
      if (e.absorbing) return;
if (e.rising) {

// ★変更：スーッと勢いよく、まっすぐ目標地点まで飛ぶ（イーズアウト）
        const t = Math.min(1, (performance.now() - e.riseStart) / e.riseDuration);
        const eased = 1 - Math.pow(1 - t, 3);
        e.sprite.position.lerpVectors(e.riseStartPos, e.riseTargetPos, eased);

        const s = Math.max(e.riseInitialScale * 0.4, e.riseInitialScale * (1 - eased * 0.6));
        e.sprite.scale.set(s, s, 1);
        if (e.glowSprite) {
          e.glowSprite.position.copy(e.sprite.position);
          e.glowSprite.scale.set(s * 1.05, s * 1.05, 1);
        }

        // 飛んでいく方向へ機体を傾ける（swoosh感）
        e.sprite.material.rotation = Math.atan2(
          e.riseTargetPos.y - e.riseStartPos.y,
          Math.hypot(e.riseTargetPos.x - e.riseStartPos.x, e.riseTargetPos.z - e.riseStartPos.z)
        ) * -0.6;

        if (t >= 1) {
          e.rising = false;
        }

      } else {

  e.sprite.position.x += e.velocity.x * dt;
e.sprite.position.z += e.velocity.z * dt;

}

      const distXZ = Math.hypot(e.sprite.position.x, e.sprite.position.z);
      if (distXZ > maxR) {
        e.velocity.x *= -1;
        e.velocity.z *= -1;
      }
      if (e.sprite.position.y < 40) { e.sprite.position.y = 40; e.velocity.y = Math.abs(e.velocity.y); }
      if (e.sprite.position.y > 50) {
    e.sprite.position.y = 50;
    e.velocity.y = -Math.abs(e.velocity.y);
}

      e.sprite.material.rotation += Math.sin(t + e.phase) * 0.004;

      if (e.glowSprite) {
        e.glowSprite.position.copy(e.sprite.position); // ★追加：ハローを本体に追従
      }

    });

    const bt = performance.now() * 0.0003;
    bubbles.forEach(e => {
      if (e.popProgress < 1) {
        e.popProgress = Math.min(1, e.popProgress + dt * 2.2);
        const eased = 1 - Math.pow(1 - e.popProgress, 3);
        const s = e.targetScale * eased;
        e.sprite.scale.set(s, s, 1);
        if (e.glowSprite) e.glowSprite.scale.set(s * 1.1, s * 1.1, 1); // ★追加：ハローも本体と同じ勢いで拡大
      }

      if (e.currentY < e.baseY) {
        e.currentY = Math.min(e.baseY, e.currentY + dt * 7.0); // ★変更(1.2→2.4)：上昇速度を速く
      }

      e.angle += e.driftSpeed * dt * 0.4; // ★変更(0.2→0.4)：横方向の漂いも少し速く
      e.sprite.position.set(
        Math.cos(e.angle) * e.radius,
        e.currentY + Math.sin(bt * 1.3 + e.phase) * 0.6,
        Math.sin(e.angle) * e.radius
      );
      if (e.glowSprite) e.glowSprite.position.copy(e.sprite.position); // ★追加：ハローを本体に追従

    });
  }
  // ====================================================================
  // [SECTION: flyingMessages end]
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

        item.frameWidth = baseWidth;
        item.frameHeight = baseHeight;

        const texSource = getTextureSource(img, MAX_TEX_DIM);
        const tex = new THREE.Texture(texSource);
        tex.needsUpdate = true;
        tex.anisotropy = 1;

        const geo = new THREE.PlaneGeometry(baseWidth, baseHeight);
        const mat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          side: THREE.DoubleSide,
          opacity: 0,
        });

        item.mesh = new THREE.Mesh(geo, mat);
        item.mesh.position.copy(position);
        item.mesh.lookAt(0, position.y, 0);
        item.mesh.userData.photoItem = item;
        scene.add(item.mesh);

        const hitPadding = 1.5;
        const hitGeo = new THREE.PlaneGeometry(baseWidth * hitPadding, baseHeight * hitPadding);
        const hitMat = new THREE.MeshBasicMaterial({ visible: false });
        item.hitMesh = new THREE.Mesh(hitGeo, hitMat);
        item.hitMesh.position.copy(position);
        item.hitMesh.lookAt(0, position.y, 0);
        item.hitMesh.userData.photoItem = item;
        scene.add(item.hitMesh);

        const auraGeo = new THREE.PlaneGeometry(baseWidth + 0.15, baseHeight + 0.15);
        const auraMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
        });
        item.aura = new THREE.Mesh(auraGeo, auraMat);
        item.aura.position.copy(position).multiplyScalar(1.002);
        item.aura.lookAt(0, position.y, 0);
        scene.add(item.aura);

        item.pastelColors = extractPastelColors(img);
        if (config.interaction === 'glow') {
        item.isGlowing = true;
          if (item.aura) {
    item.aura.material.blending = THREE.AdditiveBlending;
    item.aura.material.needsUpdate = true;
      }
        }
        item.loaded = true;
        registerPhotoColorsToSparkles(item.pastelColors);
        notifyPhotoLoadedForCeilingStar(); // ★追加：展示写真が読み込まれるたび、天井オブジェのフィルム絵を実際の写真で更新する
      },
    });

    return item;
  }

  PHOTO_CONFIG.forEach((cfg, idx) => {
    const item = createPhotoItem(cfg);
    item.revealIndex = idx;
    photoItems.push(item);
  });
  // ====================================================================
  // [SECTION: photos end]
  // ====================================================================


  // ====================================================================
  // [SECTION: ceilingFilmStar] 天井の35mmフィルム星型オブジェ
  // タップ → 浮遊中の紙飛行機を吸収 → 写真集（購入導線）を表示
  // ====================================================================

  // ★デモで調整した値をそのまま反映（本数・大きさ・星の尖り・ねじれ・フィルム断面・
  // フィルムの質感・光と透明感・回転速度・発光の脈動）
  const FILM_PARAMS = {
    count: 4,
    tiltDeg: 35,      // 星の尖り
    twistDeg: 86,     // ねじれ
    sizeRatioWidth: 0.220 / 0.60,   // デモでのフィルム幅/大きさ の比率をそのまま維持
    sizeRatioThickness: 0.030 / 0.60, // デモでの厚み/大きさ の比率をそのまま維持
    frames: 3,        // くり返し
    warmth: 5,        // 色温度
    leak: 100,        // 光漏れ
    grain: 100,        // 粒子/傷
    density: 1.00,    // コマの濃さ
    opacity: 0.49,    // 透明感
    fresnelPower: 3.15, // フレネル光
    glow: 1.6,        // ふちの発光（★強化）
    pulse: 0.6,       // 発光の脈動
    speed: 0.2,       // 回転速度（★ゆっくりに）
  };

  const CEILING_STAR = {
    // ★変更：ワールド固定座標ではなく、毎フレーム「現在のカメラの向き(yaw)」に
    // 追従させることで、どの方向を向いていても見上げれば必ず中心に見えるようにする。
    elevation: 1.4, // 見上げ角(rad)。画面のより上のほうに来るよう引き上げ
    distance: 35,
    ringCount: FILM_PARAMS.count,
    size: 5,
    tilt: THREE.MathUtils.degToRad(FILM_PARAMS.tiltDeg),
    twist: THREE.MathUtils.degToRad(FILM_PARAMS.twistDeg),
    segments: 140,
    hitRadius: 5.5, // タップ判定用の当たり半径（見た目より少し大きめ）
  };
  CEILING_STAR.filmWidth = CEILING_STAR.size * FILM_PARAMS.sizeRatioWidth;
  CEILING_STAR.filmThickness = CEILING_STAR.size * FILM_PARAMS.sizeRatioThickness;

  // 断面が一定のまま円軌道を描く曲線（Frenetフレームで押し出す土台）
  class CircleCurve3 extends THREE.Curve {
    constructor(radius) { super(); this.radius = radius; }
    getPoint(t, target) {
      const angle = t * Math.PI * 2;
      target = target || new THREE.Vector3();
      return target.set(Math.cos(angle) * this.radius, Math.sin(angle) * this.radius, 0);
    }
  }

  // カーブに沿って「幅・厚みが常に一定の帯」の片面を生成する
  function buildFilmStripFace(curve, segments, frenet, edgeAFn, edgeBFn, uLen, flip) {
    const positions = [], uvs = [], normalsArr = [], indices = [];
    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      const p = curve.getPointAt(u);
      const N = frenet.normals[i];
      const B = frenet.binormals[i];
      const T = frenet.tangents[i];
      const a = p.clone().add(edgeAFn(N, B));
      const b = p.clone().add(edgeBFn(N, B));
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      uvs.push(u * uLen, 0, u * uLen, 1);
      let norm = new THREE.Vector3().crossVectors(b.clone().sub(a).normalize(), T).normalize();
      if (flip) norm.negate();
      normalsArr.push(norm.x, norm.y, norm.z, norm.x, norm.y, norm.z);
    }
    for (let i = 0; i < segments; i++) {
      const i0 = i * 2, i1 = i * 2 + 1, i2 = (i + 1) * 2, i3 = (i + 1) * 2 + 1;
      if (!flip) indices.push(i0, i2, i1, i1, i2, i3);
      else indices.push(i0, i1, i2, i1, i3, i2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normalsArr, 3));
    geo.setIndex(indices);
    return geo;
  }

  function mergeTwoGeometries(geos) {
    let posLen = 0, uvLen = 0, idxLen = 0;
    geos.forEach(g => { posLen += g.attributes.position.count * 3; uvLen += g.attributes.uv.count * 2; idxLen += g.index.count; });
    const positions = new Float32Array(posLen);
    const normalsArr = new Float32Array(posLen);
    const uvs = new Float32Array(uvLen);
    const indices = new Uint32Array(idxLen);
    let pOff = 0, uOff = 0, iOff = 0, vOff = 0;
    geos.forEach(g => {
      positions.set(g.attributes.position.array, pOff);
      normalsArr.set(g.attributes.normal.array, pOff);
      uvs.set(g.attributes.uv.array, uOff);
      const idxArr = g.index.array;
      for (let k = 0; k < idxArr.length; k++) indices[iOff + k] = idxArr[k] + vOff;
      pOff += g.attributes.position.array.length;
      uOff += g.attributes.uv.array.length;
      iOff += idxArr.length;
      vOff += g.attributes.position.count;
    });
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(normalsArr, 3));
    merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    merged.setIndex(new THREE.Uint32BufferAttribute(indices, 1));
    return merged;
  }

  const FILM_VERTEX_SHADER = `
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec2 vUv;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vNormal = normalize(mat3(modelMatrix) * normal);
      vViewDir = normalize(cameraPosition - wp.xyz);
      vUv = uv;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `;
  const FILM_FRAGMENT_SHADER = `
    uniform sampler2D uTex;
    uniform float uOpacity;
    uniform float uFresnelPower;
    uniform float uGlow;
    uniform vec3 uGlowColor;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec2 vUv;
    void main() {
      vec3 N = normalize(vNormal);
      vec3 V = normalize(vViewDir);
      float fres = pow(1.0 - abs(dot(N, V)), uFresnelPower);
      vec4 tex = texture2D(uTex, vUv);
      vec3 col = tex.rgb + fres * uGlow * uGlowColor;
      float alpha = clamp(tex.a * uOpacity + fres * uGlow * 0.5, 0.0, 1.0);
      gl_FragColor = vec4(col, alpha);
    }
  `;

  function warmthTint(warmth) {
    const t = warmth / 100;
    let r, g, b;
    if (t >= 0) { r = 255; g = Math.round(210 - t * 20); b = Math.round(150 - t * 90); }
    else { r = Math.round(170 + t * 40); g = Math.round(200 + t * 10); b = 255; }
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return `rgba(${r},${g},${b},`;
  }

  // フィルムのコマ絵：既にロード済みの展示写真があればそれを使い、無ければ簡易パターンで代用
  function makeCeilingFilmTexture() {
    const framesPerTile = 4;
    const tileW = 320 * framesPerTile, tileH = 220;
    const cnv = document.createElement('canvas');
    cnv.width = tileW; cnv.height = tileH;
    const ctx = cnv.getContext('2d');

    ctx.fillStyle = 'rgba(10,10,11,0.95)';
    ctx.fillRect(0, 0, tileW, tileH);

    const frameW = tileW / framesPerTile;
    const margin = frameW * 0.09;
    const winW = frameW - margin * 2;
    const winY = tileH * 0.19;
    const winH = tileH * 0.62;
    const tint = warmthTint(FILM_PARAMS.warmth);

    const loadedPhotos = photoItems.filter(it => it.loaded && it.mesh && it.mesh.material.map && it.mesh.material.map.image);

    for (let i = 0; i < framesPerTile; i++) {
      const x = i * frameW + margin;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, winY, winW, winH);
      ctx.clip();

      const src = loadedPhotos.length ? loadedPhotos[i % loadedPhotos.length].mesh.material.map.image : null;
      if (src) {
        const ir = src.width / src.height;
        const wr = winW / winH;
        let dw, dh, dx, dy;
        if (ir > wr) { dh = winH; dw = winH * ir; dx = x - (dw - winW) / 2; dy = winY; }
        else { dw = winW; dh = winW / ir; dx = x; dy = winY - (dh - winH) / 2; }
        ctx.globalAlpha = FILM_PARAMS.density;
        ctx.drawImage(src, dx, dy, dw, dh);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = '#3a3230';
        ctx.fillRect(x, winY, winW, winH);
      }

      // 色温度のティント
      ctx.globalAlpha = 0.30;
      ctx.fillStyle = tint + '1)';
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillRect(x, winY, winW, winH);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      // ハレーション（光の滲み）
      const gx = x + winW * (0.3 + 0.4 * Math.sin(i * 1.7));
      const gy = winY + winH * 0.3;
      const sun = ctx.createRadialGradient(gx, gy, 0, gx, gy, winW * 0.35);
      sun.addColorStop(0, 'rgba(255,250,235,0.35)');
      sun.addColorStop(1, 'rgba(255,250,235,0)');
      ctx.fillStyle = sun;
      ctx.fillRect(x, winY, winW, winH);

      // ビネット
      const vig = ctx.createRadialGradient(x + winW / 2, winY + winH / 2, winH * 0.3, x + winW / 2, winY + winH / 2, winH * 0.8);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = vig;
      ctx.fillRect(x, winY, winW, winH);

      ctx.restore();
      ctx.strokeStyle = 'rgba(240,240,232,0.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, winY, winW, winH);
    }

    // ネガの縁のオレンジ帯
    ctx.fillStyle = 'rgba(120,70,20,0.35)';
    ctx.fillRect(0, tileH * 0.115, tileW, tileH * 0.03);
    ctx.fillRect(0, tileH * 0.855, tileW, tileH * 0.03);

    // 光漏れ（オレンジ〜ピンクのにじみ）
    const leakStrength = FILM_PARAMS.leak / 100;
    if (leakStrength > 0) {
      const leakColors = ['rgba(255,140,80,ALPHA)', 'rgba(255,90,140,ALPHA)', 'rgba(255,210,90,ALPHA)'];
      for (let i = 0; i < 3; i++) {
        const cx = Math.random() * tileW;
        const cy = tileH * (0.2 + Math.random() * 0.6);
        const r = tileW * (0.12 + Math.random() * 0.15);
        const a = (0.18 + Math.random() * 0.22) * leakStrength;
        const col = leakColors[i % leakColors.length].replace('ALPHA', a.toFixed(3));
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, col);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, tileW, tileH);
      }
    }

    // 粒子・傷
    const grainAmt = FILM_PARAMS.grain / 100;
    if (grainAmt > 0) {
      const dots = Math.floor(tileW * tileH * 0.02 * grainAmt);
      for (let i = 0; i < dots; i++) {
        const gx = Math.random() * tileW, gy = Math.random() * tileH;
        const b = Math.random() > 0.5 ? 255 : 0;
        ctx.fillStyle = `rgba(${b},${b},${b},${(0.08 + Math.random() * 0.14).toFixed(3)})`;
        ctx.fillRect(gx, gy, 1, 1);
      }
      const dust = Math.floor(14 * grainAmt);
      for (let i = 0; i < dust; i++) {
        const gx = Math.random() * tileW, gy = Math.random() * tileH;
        const s = 1 + Math.random() * 1.5;
        ctx.fillStyle = `rgba(255,255,255,${(0.15 + Math.random() * 0.2).toFixed(3)})`;
        ctx.fillRect(gx, gy, s, s);
      }
      const scratches = Math.floor(5 * grainAmt) + 1;
      ctx.lineWidth = 1;
      for (let i = 0; i < scratches; i++) {
        const sx = Math.random() * tileW;
        ctx.strokeStyle = `rgba(255,255,255,${(0.1 + Math.random() * 0.14).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx + (Math.random() * 14 - 7), tileH);
        ctx.stroke();
      }
    }

    // パーフォレーション（穴は本当に透明にくり抜く）
    ctx.globalCompositeOperation = 'destination-out';
    const holeCols = framesPerTile * 8;
    const holeW = (tileW / holeCols) * 0.5;
    const holeH = tileH * 0.075;
    for (let i = 0; i < holeCols; i++) {
      const cx = i * (tileW / holeCols) + (tileW / holeCols - holeW) / 2;
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(cx, tileH * 0.03, holeW, holeH, 3) : ctx.rect(cx, tileH * 0.03, holeW, holeH);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(cx, tileH * 0.895, holeW, holeH, 3) : ctx.rect(cx, tileH * 0.895, holeW, holeH);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    const tex = new THREE.CanvasTexture(cnv);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  let ceilingStarGroup = null;
  let ceilingRingMeshes = [];
  let ceilingRingPivots = []; // ★追加：解ける演出でリングを動かすため、pivotも保持
  let ceilingHitMesh = null;
  let ceilingFilmTexture = null;
  let ceilingStarCore = null; // ★追加：中心の光のフレア核
  let ceilingStarHalo = null; // ★追加：核の外側のふんわりした光暈
  let starFinaleActive = false; // ★追加：吸収後の「解けて本になる」演出中フラグ
  let finaleCameraLock = false; // ★追加：演出中はカメラ操作を固定する

  function buildCeilingFilmStar() {
    ceilingFilmTexture = makeCeilingFilmTexture();
    ceilingStarGroup = new THREE.Group();
    ceilingStarGroup.position.set(0, CEILING_STAR.distance * Math.sin(CEILING_STAR.elevation), -CEILING_STAR.distance * Math.cos(CEILING_STAR.elevation));
    ceilingStarGroup.renderOrder = 5; // ★追加：他の半透明オブジェクトより手前に描画されやすくする

    const curve = new CircleCurve3(CEILING_STAR.size);
    const frenet = curve.computeFrenetFrames(CEILING_STAR.segments, true);
    const hw = CEILING_STAR.filmWidth / 2, ht = CEILING_STAR.filmThickness / 2;

    for (let i = 0; i < CEILING_STAR.ringCount; i++) {
      const pivot = new THREE.Object3D();
      const angleY = (i / CEILING_STAR.ringCount) * Math.PI * 2 + CEILING_STAR.twist;
      pivot.rotation.order = 'YXZ';
      pivot.rotation.y = angleY;
      pivot.rotation.x = CEILING_STAR.tilt;

      const topGeo = buildFilmStripFace(curve, CEILING_STAR.segments, frenet,
        (N, B) => N.clone().multiplyScalar(-hw).add(B.clone().multiplyScalar(ht)),
        (N, B) => N.clone().multiplyScalar(hw).add(B.clone().multiplyScalar(ht)), FILM_PARAMS.frames, false);
      const botGeo = buildFilmStripFace(curve, CEILING_STAR.segments, frenet,
        (N, B) => N.clone().multiplyScalar(-hw).add(B.clone().multiplyScalar(-ht)),
        (N, B) => N.clone().multiplyScalar(hw).add(B.clone().multiplyScalar(-ht)), FILM_PARAMS.frames, true);
      const imageGeo = mergeTwoGeometries([topGeo, botGeo]);

      const imageMat = new THREE.ShaderMaterial({
        uniforms: {
          uTex: { value: ceilingFilmTexture },
          uOpacity: { value: FILM_PARAMS.opacity },
          uFresnelPower: { value: FILM_PARAMS.fresnelPower },
          uGlow: { value: FILM_PARAMS.glow },
          uGlowColor: { value: new THREE.Color(0xfff2d8) },
        },
        vertexShader: FILM_VERTEX_SHADER,
        fragmentShader: FILM_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const ringMesh = new THREE.Mesh(imageGeo, imageMat);
      ringMesh.renderOrder = 5;
      pivot.add(ringMesh);
      ceilingRingMeshes.push(ringMesh);
      ceilingRingPivots.push(pivot); // ★追加
      ceilingStarGroup.add(pivot);
    }

    // ★追加：中心の光のフレア核。太陽やダイヤモンドのようなエネルギーの塊のイメージ
    const coreMat = new THREE.SpriteMaterial({
      map: sparkleTexture,
      color: new THREE.Color(2.5, 2.2, 1.5), 
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    ceilingStarCore = new THREE.Sprite(coreMat);
    ceilingStarCore.scale.set(CEILING_STAR.size * 0.9, CEILING_STAR.size * 0.9, 1);
    ceilingStarCore.renderOrder = 999;        // ← 追加
coreMat.depthTest = false;                // ← 追加
    ceilingStarGroup.add(ceilingStarCore);

    const haloMat = new THREE.SpriteMaterial({
      map: sparkleTexture,
      color: new THREE.Color(1.8, 1.4, 0.8),
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    ceilingStarHalo = new THREE.Sprite(haloMat);
    ceilingStarHalo.scale.set(CEILING_STAR.size * 1.8, CEILING_STAR.size * 1.8, 1);
    ceilingStarHalo.renderOrder = 998;        // ← 追加
haloMat.depthTest = false;                // ← 追加
    ceilingStarGroup.add(ceilingStarHalo);

    // 見た目より少し大きい、見えない当たり判定用の球
    const hitGeo = new THREE.SphereGeometry(CEILING_STAR.hitRadius, 12, 12);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    ceilingHitMesh = new THREE.Mesh(hitGeo, hitMat);
    ceilingStarGroup.add(ceilingHitMesh);

    ceilingStarGroup.visible = false; // ★追加：導入カメラワーク中は非表示（①）。自由閲覧開始で出現させる
    scene.add(ceilingStarGroup);
  }
  buildCeilingFilmStar();

  // ★追加：BookRevealのインスタンス生成（写真は展示写真を使い回す）
  let bookReveal = null;
  function initBookReveal() {
    const textures = photoItems
      .filter(it => it.loaded && it.mesh && it.mesh.material.map)
      .slice(0, 3)
      .map(it => it.mesh.material.map);
    if (textures.length === 0) return; // まだ読み込まれていなければ後回し
    if (bookReveal) return; // 二重生成防止
    bookReveal = new BookReveal(scene, camera, {
      photoTextures: textures,
      tintColors: [0x9fd0ff, 0xffb27a, 0xffe2a6],
    });
  }
  
  // ★変更：4秒待つだけの決め打ちではなく、実際に展示写真が読み込まれるたびに
  // （notifyPhotoLoadedForCeilingStarから呼ばれる）差し替える。連続で何枚も
  // 読み込まれる場合に備えて少しデバウンスする。
  let ceilingTextureRefreshTimer = null;
  let ceilingTextureRefreshCount = 0;
  const CEILING_TEXTURE_MAX_REFRESH = 8; // 十分な枚数が揃ったら以降は再生成しない
  function notifyPhotoLoadedForCeilingStar() {
    initBookReveal();
    if (!ceilingFilmTexture) return;
    if (ceilingTextureRefreshCount >= CEILING_TEXTURE_MAX_REFRESH) return;
    clearTimeout(ceilingTextureRefreshTimer);
    ceilingTextureRefreshTimer = setTimeout(() => {
      ceilingFilmTexture.dispose();
      ceilingFilmTexture = makeCeilingFilmTexture();
      ceilingRingMeshes.forEach(m => { m.material.uniforms.uTex.value = ceilingFilmTexture; });
      ceilingTextureRefreshCount++;
    }, 400);
  }

  let starAbsorbing = false;
  let albumUnlocked = false;

  function triggerCeilingStarTap() {
    if (starFinaleActive) return;
    if (albumUnlocked) { showPhotoAlbumOverlay(); return; }
    if (starAbsorbing) return;
    starAbsorbing = true;
    playSFX(kirakiraSFX);
    absorbFlyingPlanesIntoStar();
  }

  function pulseCeilingStarGlow(intensity) {
    ceilingRingMeshes.forEach(m => { m.material.uniforms.uGlow.value = intensity; });
  }

  function absorbFlyingPlanesIntoStar() {
    pulseCeilingStarGlow(1.4);

    const targets = letterPlanes.slice();
    targets.forEach(e => { e.absorbing = true; });
    if (targets.length === 0) {
      setTimeout(finishAbsorption, 500);
      return;
    }

    let remaining = targets.length;
    targets.forEach((e, idx) => {
      const startPos = e.sprite.position.clone();
      const duration = 900 + idx * 70;
      const startTime = performance.now() + idx * 40; // 少しずつ時間差で吸い込まれる

      function step(now) {
        const t = THREE.MathUtils.clamp((now - startTime) / duration, 0, 1);
        if (t <= 0) { requestAnimationFrame(step); return; }
        const eased = 1 - Math.pow(1 - t, 3);
        const pos = startPos.clone().lerp(ceilingStarGroup.position, eased);
        e.sprite.position.copy(pos);
        if (e.glowSprite) e.glowSprite.position.copy(pos);
        const s = Math.max(0.02, e.sprite.scale.x * (1 - eased * 0.08));
        e.sprite.scale.set(s, s, 1);
        if (e.glowSprite) e.glowSprite.scale.set(s * 1.05, s * 1.05, 1);

        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          scene.remove(e.sprite);
          e.sprite.material.dispose();
          if (e.glowSprite) { scene.remove(e.glowSprite); e.glowSprite.material.dispose(); }
          const li = letterPlanes.indexOf(e);
          if (li >= 0) letterPlanes.splice(li, 1);
          remaining--;
          if (remaining <= 0) finishAbsorption();
        }
      }
      requestAnimationFrame(step);
    });
  }

  function finishAbsorption() {
    starAbsorbing = false;
    albumUnlocked = true;
    pulseCeilingStarGlow(FILM_PARAMS.glow * 1.6); // 一瞬強く光らせてから演出開始
    startStarFinale();
  }

  // ★追加：カメラ操作を一時的に固定する（演出中のブレを防ぐ）
  function lockCameraForFinale() {
    finaleCameraLock = true;
    targetYaw = yaw;
    targetPitch = pitch;
  }
  function unlockCameraForFinale() {
    finaleCameraLock = false;
  }

  // ★追加：紙飛行機吸収後の「発光が強まる→星がほどける→本が現れる→
  // カメラ固定のまま『この物語を手元へ』がフェードイン」という一連の演出
  function startStarFinale() {
    starFinaleActive = true;
    lockCameraForFinale();

    const finalePos = ceilingStarGroup.position.clone(); // この場に固定する
    const unravelDuration = 1500;
    const startTime = performance.now();

    const dirs = ceilingRingPivots.map(() => new THREE.Vector3(
      (Math.random() - 0.5),
      (Math.random() - 0.5) * 0.6 + 0.4,
      (Math.random() - 0.5)
    ).normalize());

function unravelStep(now) {
  const t = Math.min(1, (now - startTime) / unravelDuration);
  const eased = 1 - Math.pow(1 - t, 2);

ceilingRingPivots.forEach((pivot, i) => {
  const dist = eased * (5 + i * 1.2);
  pivot.position.copy(dirs[i]).multiplyScalar(dist);
  pivot.rotation.y += 0.06;
  const mesh = ceilingRingMeshes[i];
  if (mesh) {
    mesh.material.uniforms.uOpacity.value = FILM_PARAMS.opacity * (1 - eased);
    mesh.material.uniforms.uGlow.value    = FILM_PARAMS.glow    * (1 - eased); // ← 追加
  }
});

  // ── 変更：core/haloも一緒にフェードアウト ──────────────
  if (ceilingStarCore) {
    const flash = t < 0.35
      ? (t / 0.35)
      : (1 - (t - 0.35) / 0.65);
    const s = CEILING_STAR.size * 1.4 * (1 + flash * 1.8);
    ceilingStarCore.scale.set(s, s, 1);
    ceilingStarCore.material.opacity = (0.8 + flash * 0.5) * (1 - eased); // フェードアウト追加
  }
  if (ceilingStarHalo) {
    const s = CEILING_STAR.size * 2.8 * (1 + eased * 0.5);
    ceilingStarHalo.scale.set(s, s, 1);
    ceilingStarHalo.material.opacity = 0.6 * (1 - eased);  // フェードアウト追加
  }
  // ──────────────────────────────────────────────────────

  if (t < 1) {
    requestAnimationFrame(unravelStep);
  } else {
    spawnBookFromStar(finalePos);
  }
}
    requestAnimationFrame(unravelStep);
  }

  // ★追加：本のシルエット＋淡い後光を描いたテクスチャ
  function makeBookTexture() {
    const w = 256, h = 256;
    const cnv = document.createElement('canvas');
    cnv.width = w; cnv.height = h;
    const ctx = cnv.getContext('2d');

    const glow = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    glow.addColorStop(0, 'rgba(255,240,210,0.9)');
    glow.addColorStop(0.5, 'rgba(255,220,170,0.35)');
    glow.addColorStop(1, 'rgba(255,220,170,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2, h / 2 + 10);
    ctx.fillStyle = 'rgba(255,248,232,0.95)';
    ctx.beginPath();
    ctx.moveTo(0, -46);
    ctx.quadraticCurveTo(-70, -60, -78, -30);
    ctx.lineTo(-78, 46);
    ctx.quadraticCurveTo(-70, 20, 0, 34);
    ctx.quadraticCurveTo(70, 20, 78, 46);
    ctx.lineTo(78, -30);
    ctx.quadraticCurveTo(70, -60, 0, -46);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(180,140,80,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -46);
    ctx.quadraticCurveTo(0, 0, 0, 34);
    ctx.stroke();
    ctx.restore();

    return new THREE.CanvasTexture(cnv);
  }

let ceilingBookSprite = null;
  function spawnBookFromStar(position) {
    initBookReveal(); // まだなければここで試みる
    if (!bookReveal) {
      // BookRevealが作れない場合は従来のオーバーレイを直接表示
      revealAlbumOverlayFromBook();
      return;
    }
const bookPos = camera.position.clone();
bookPos.add(
  camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(6)
);
bookPos.y += 0.25;

bookReveal.open(bookPos, () => {
    revealAlbumOverlayFromBook();
});
  }

  // ★追加：本が現れきったあと、パネルを本からふわっとフェードインさせる
  function revealAlbumOverlayFromBook() {
    albumPanelEl.style.transition = 'none';
    albumPanelEl.style.opacity = '0';
    albumPanelEl.style.transform = 'translateY(10px)';
    albumOverlayEl.style.display = 'flex';
    requestAnimationFrame(() => {
      albumPanelEl.style.transition = 'opacity 0.9s ease, transform 0.9s ease';
      albumPanelEl.style.opacity = '1';
      albumPanelEl.style.transform = 'translateY(0)';
    });
  }

  // ★追加：写真集を閉じたら、星・カメラ操作・本を元の状態に戻す
function resetStarAfterFinale() {
    if (bookReveal) {
      bookReveal.close(() => {
        // 本が消えたあとに星を復元する
        ceilingRingPivots.forEach((pivot, i) => {
          pivot.position.set(0, 0, 0);
          const mesh = ceilingRingMeshes[i];
          if (mesh) mesh.material.uniforms.uOpacity.value = FILM_PARAMS.opacity;
        });
        if (ceilingStarCore) ceilingStarCore.material.opacity = 0.6;
        if (ceilingStarHalo) ceilingStarHalo.material.opacity = 0.3;
        starFinaleActive = false;
        unlockCameraForFinale();
      });
    } else {
      // BookReveal未使用の場合は従来通り
      ceilingRingPivots.forEach((pivot, i) => {
        pivot.position.set(0, 0, 0);
        const mesh = ceilingRingMeshes[i];
        if (mesh) mesh.material.uniforms.uOpacity.value = FILM_PARAMS.opacity;
      });
      if (ceilingStarCore) ceilingStarCore.material.opacity = 0.6;
      if (ceilingStarHalo) ceilingStarHalo.material.opacity = 0.3;
      starFinaleActive = false;
      unlockCameraForFinale();
    }
    if (ceilingBookSprite) ceilingBookSprite.visible = false;
  }

  // --- 写真集（購入導線）オーバーレイ ---
  const albumOverlayEl = document.createElement('div');
  Object.assign(albumOverlayEl.style, {
    position: 'fixed', inset: '0',
    background: 'rgba(10, 8, 15, 0.6)',
    backdropFilter: 'blur(6px)',
    display: 'none', alignItems: 'center', justifyContent: 'center',
    zIndex: '24',
  });
  const albumPanelEl = document.createElement('div');
  Object.assign(albumPanelEl.style, {
    width: 'min(88vw, 420px)',
    padding: '32px 28px',
    borderRadius: '16px',
    background: 'linear-gradient(160deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
    border: '1px solid rgba(255,240,220,0.2)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.55)',
    color: '#f0e8d8',
    fontFamily: `'Klee One', 'Hiragino Mincho ProN', serif`,
    textAlign: 'center',
  });
  albumPanelEl.innerHTML = `
    <div style="font-size:13px; letter-spacing:0.2em; opacity:0.7; margin-bottom:10px;">MEMORIES COLLECTED</div>
    <div style="font-size:17px; line-height:1.8; margin-bottom:22px;">空を飛んでいた想いが<br>一冊の写真集になりました</div>
  `;
  const albumBuyButtonEl = document.createElement('button');
  albumBuyButtonEl.textContent = 'この物語を手元へ';
  Object.assign(albumBuyButtonEl.style, {
    display: 'block', width: '100%', padding: '14px 0', marginBottom: '10px',
    borderRadius: '999px', border: 'none',
    background: 'rgba(255, 210, 160, 0.9)', color: '#3a2c20',
    fontSize: '14px', fontWeight: 'bold', cursor: 'pointer',
    fontFamily: `'Klee One', 'Hiragino Mincho ProN', serif`,
  });
  albumBuyButtonEl.addEventListener('click', () => {
    window.open('https://photoartistm.stores.jp', '_blank');
  });
  const albumCloseButtonEl = document.createElement('button');
  albumCloseButtonEl.textContent = 'とじる';
  Object.assign(albumCloseButtonEl.style, {
    display: 'block', width: '100%', padding: '10px 0',
    borderRadius: '999px', border: '1px solid rgba(255,255,255,0.25)',
    background: 'transparent', color: 'rgba(255,255,255,0.7)',
    fontSize: '13px', cursor: 'pointer',
    fontFamily: `'Klee One', 'Hiragino Mincho ProN', serif`,
  });
  albumCloseButtonEl.addEventListener('click', () => {
    albumOverlayEl.style.display = 'none';
    resetStarAfterFinale();
  });

  albumPanelEl.appendChild(albumBuyButtonEl);
  albumPanelEl.appendChild(albumCloseButtonEl);
  albumOverlayEl.appendChild(albumPanelEl);
  document.body.appendChild(albumOverlayEl);

  function showPhotoAlbumOverlay() {
    albumPanelEl.style.transition = 'none';
    albumPanelEl.style.opacity = '1';
    albumPanelEl.style.transform = 'translateY(0)';
    albumOverlayEl.style.display = 'flex';
  }

  const ceilingStarLocalOffset = new THREE.Vector3(
    0,
    CEILING_STAR.distance * Math.sin(CEILING_STAR.elevation),
    -CEILING_STAR.distance * Math.cos(CEILING_STAR.elevation)
  );
  const ceilingStarWorldOffset = new THREE.Vector3();
  const ceilingStarYawQuat = new THREE.Quaternion();
  const ceilingStarUpAxis = new THREE.Vector3(0, 1, 0);

  function updateCeilingStar(dt) {
    if (!ceilingStarGroup) return;

    // ★追加：導入カメラワーク中は非表示。自由閲覧が始まったら出現させる（①）
    if (introCinematicActive) {
      ceilingStarGroup.visible = false;
      return;
    }
    ceilingStarGroup.visible = true;

    // ★追加：吸収後の「解けて本になる」演出中は、通常の追従・回転・脈動を止める
    if (starFinaleActive) return;

    // ★重要な修正：camera.quaternion をそのまま使うと「上下(pitch)」も含めて
    // 追従してしまい、常に画面の同じ位置に貼り付いたようになってしまっていた。
    // 「左右(yaw)だけ」に追従させ、高さはワールド空間で固定することで、
    // 正面を向くと見えず、天井を見上げると中央に来るようにする。
    ceilingStarYawQuat.setFromAxisAngle(ceilingStarUpAxis, yaw);
    ceilingStarWorldOffset.copy(ceilingStarLocalOffset).applyQuaternion(ceilingStarYawQuat);
    ceilingStarGroup.position.copy(camera.position).add(ceilingStarWorldOffset);

    ceilingStarGroup.rotation.y += dt * FILM_PARAMS.speed;
    ceilingStarGroup.rotation.x = Math.sin(performance.now() * 0.0002) * 0.08;

    // 発光の脈動：フレネル光が下限〜上限を呼吸するように繰り返す
    if (!starAbsorbing) {
      const pulseSpeed = 0.0007 + FILM_PARAMS.pulse * 0.0015;
      const wave = (Math.sin(performance.now() * pulseSpeed) + 1) / 2;
      ceilingStarPulseWave = wave; // ★追加：写真の照らし演出でも同じ脈動を使う
      const glowBase = albumUnlocked ? FILM_PARAMS.glow * 0.85 : FILM_PARAMS.glow;
      const low = glowBase * (1 - FILM_PARAMS.pulse * 0.95);
      const high = glowBase * (1 + FILM_PARAMS.pulse * 1.1);
      pulseCeilingStarGlow(low + (high - low) * wave);

      // ★追加：中心の光核も同じリズムで呼吸させる（②）
      if (ceilingStarCore) {
        const coreScale = CEILING_STAR.size * (0.75 + 0.35 * wave);
        ceilingStarCore.scale.set(coreScale, coreScale, 1);
        ceilingStarCore.material.opacity = 0.6 + 0.4 * wave;
      }
      if (ceilingStarHalo) {
        const haloScale = CEILING_STAR.size * (1.6 + 0.5 * wave);
        ceilingStarHalo.scale.set(haloScale, haloScale, 1);
        ceilingStarHalo.material.opacity = 0.2 + 0.25 * wave;
      }
    }

    updateStarLightOnPhotos();
  }

  // ★追加：星から届く光が近くの写真を照らして浮かび上がらせる演出。
  // 写真本体はMeshBasicMaterialで実際の光源には反応しないため、
  // 既存の「aura」（選択時などに白く光らせるオーバーレイ）の不透明度を
  // 星との距離と発光の脈動に応じてかさ上げすることで疑似的に表現する。
  let ceilingStarPulseWave = 0.5;
  const STAR_LIGHT_RADIUS = 26;
  const STAR_LIGHT_STRENGTH = 0.65;
  function updateStarLightOnPhotos() {
    if (!ceilingStarGroup) return;
    const starPos = ceilingStarGroup.position;
    const pulseFactor = 0.4 + 0.6 * ceilingStarPulseWave; // 脈動の谷でも完全には消えないように下駄を履かせる
    photoItems.forEach(item => {
      if (!item.mesh || !item.aura) return;
      const d = item.position.distanceTo(starPos);
      if (d > STAR_LIGHT_RADIUS) return;
      const falloff = 1 - d / STAR_LIGHT_RADIUS;
      const boost = falloff * falloff * STAR_LIGHT_STRENGTH * pulseFactor;
      if (boost > item.aura.material.opacity) {
        item.aura.material.opacity = boost;
      }
    });
  }
  // ====================================================================
  // [SECTION: ceilingFilmStar end]
  // ====================================================================


  // ====================================================================
  // [SECTION: controls] 視点操作・クリック処理
  // ====================================================================
  let yaw = 0, pitch = 0, targetYaw = 0, targetPitch = 0;
  let isDragging = false;
  let lastX = 0, lastY = 0;

  function onDragMove(dx, dy) {
    if (introCinematicActive || finaleCameraLock) return; // ★追加：導入演出中・星の演出中は操作を無効化
    targetYaw -= dx * 0.003;
    targetPitch -= dy * 0.003;
    targetPitch = Math.max(-0.6, Math.min(1.0, targetPitch));
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

  let touchStartX = 0, touchStartY = 0, touchMoved = false;
  const TAP_MOVE_THRESHOLD = 10;
  // ★追加：スマホのover-scroll（上に引っ張る動作）を防ぐ
  canvasEl.style.touchAction = 'none';
  document.body.style.overscrollBehavior = 'none'; // ページ全体のプルトゥリフレッシュも防ぐ
  canvasEl.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
      touchStartX = lastX;
      touchStartY = lastY;
      touchMoved = false;
    }
  }, { passive: true });

  canvasEl.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) {
      const dx = e.touches[0].clientX - lastX;
      const dy = e.touches[0].clientY - lastY;
      onDragMove(dx, dy);
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;

      const totalDx = e.touches[0].clientX - touchStartX;
      const totalDy = e.touches[0].clientY - touchStartY;
      if (Math.sqrt(totalDx * totalDx + totalDy * totalDy) > TAP_MOVE_THRESHOLD) {
        touchMoved = true;
      }
    }
  }, { passive: true });

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  let viewingItem = null;
  let approachProgress = 0;
  let approachTarget = 0;
  const cameraHomePos = new THREE.Vector3(0, 0, 0);
  let cameraApproachPos = new THREE.Vector3();

  function calcFitDistance(item) {
    const w = item.frameWidth || 4;
    const h = item.frameHeight || 4;

    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const aspect = camera.aspect;

    const distForHeight = (h / 2) / Math.tan(vFov / 2);

    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const distForWidth = (w / 2) / Math.tan(hFov / 2);

    const margin = 1.20; //小さくするほど余白なくなる
    return Math.max(distForHeight, distForWidth) * margin;
    const minDistance = Math.max(distForHeight, distForWidth) * 1.12; // 常に最小値を確保
  return Math.max(distance, minDistance);
  }

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

        // ★変更：写真メッシュの回転を考慮して、確実に正対するカメラ位置を計算
        // 写真メッシュは lookAt(0, y, 0) で中心を向いているので、
        // その「背後」にカメラを配置することで、常に正面から見える

        // 1. 写真の位置ベクトル（中心からの方向）
        const posVec = item.position.clone();
        posVec.y = 0;
        const posDir = posVec.normalize();

        // 2. カメラまでの距離を計算
        const fitDistance = calcFitDistance(item);

        // 3. 写真の背後（写真が向いている中心の反対側）にカメラを配置
        cameraApproachPos = item.position.clone().sub(posDir.multiplyScalar(fitDistance));
        cameraApproachPos.y = item.position.y - 0.5; // 少し下から見上げる角度で柔らかく

        break;
      }
    }
  }
}

  function onPointerClick(clientX, clientY) {
    const elapsed = (performance.now() - spaceStartTime) / 1000;
    if (elapsed < REVEAL_PHOTO_END) return;
    if (introCinematicActive || starFinaleActive) return; // ★変更：導入カメラワーク中・星の演出中は無効化

    pointer.x = (clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    if (ceilingHitMesh) {
      const starHits = raycaster.intersectObject(ceilingHitMesh);
      if (starHits.length > 0) {
        triggerCeilingStarTap();
        return;
      }
    }

    if (!viewingItem) {
      const flyingSprites = [
        ...letterPlanes.map(e => e.sprite),
        ...bubbles.map(e => e.sprite),
      ];
      const flyingHits = raycaster.intersectObjects(flyingSprites);
      if (flyingHits.length > 0) {
        const hitSprite = flyingHits[0].object;
        showMessageTooltip(hitSprite.userData.messageData, hitSprite.userData.planeColor);
        return;
      }
    }

    if (IS_MOBILE) {
      if (viewingItem) {
        viewingItem = null;
        approachTarget = 0;
      }
      return;
    }

    const meshes = photoItems.filter(it => it.hitMesh).map(it => it.hitMesh);
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
    if (touchMoved) return;
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
  // [SECTION: conceptIntro] 導入カメラワーク＋コンセプト文（手紙エピローグ版）
  // ====================================================================
  // ★変更：自動タイマーではなく、外部(Portalなど)から activateIntro() を
  // 呼んでもらって初めて演出を開始する方式に変更。裂け目からのチラ見え
  // 段階では一切動かず、実際に空間へ入ってきた瞬間から始まる。
  // ------------------------------------------------------

  // --- デザイン確定値（承認済み：A案 / グロー100% / アイボリーゴールド / 署名ピンクゴールド） ---
  const CONCEPT_ACCENT = '#e8dcc4';     // Remember./グロー/閉じるボタンの色（アイボリーゴールド）
  const CONCEPT_SIG_COLOR = '#e0a8ac';  // 署名だけの色（ピンクゴールド）
  const CONCEPT_GLOW = 1.0;             // 枠の光の強さ（0〜1、承認値=100%）

  const CONCEPT_REMEMBER = 'Remember.';
  const CONCEPT_PARAGRAPHS = [
    'あの日 見上げた雲は \n手を伸ばせば 届きそうだった',
    '時は流れても \n心に残る景色は \n静かに 瞬き続けている',
    'どうかこの空間が \nあなたの記憶と未来を \nそっと 繋ぎますように',
  ];
  const CONCEPT_SIGNATURE = 'photoartist.M';

  // --- 承認デザインで使用するフォントを読み込む（Klee One / Cormorant Garamond） ---
  // 既にページ側で読み込み済みの場合は重複読み込みを避ける
  if (!document.getElementById('concept-fonts-link')) {
    const fontLink = document.createElement('link');
    fontLink.id = 'concept-fonts-link';
    fontLink.rel = 'stylesheet';
    fontLink.href =
      'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital@1&family=Klee+One:wght@400;600&display=swap';
    document.head.appendChild(fontLink);
  }

  let introCinematicActive = true; // ★変更：起動直後(裂け目演出中含む)はロック。activateIntro()が呼ばれて初めて解除
  let introPhase = 'idle';          // idle -> up -> holdUp -> down -> showingConcept -> done
  let introElapsedInPhase = 0;
  let introStartedAt = null;        // ★追加：activateIntro()が呼ばれた時刻
  const INTRO_LOOKUP_DUR = 3.0;
  const INTRO_HOLD_DUR = 0.7;
  const INTRO_LOOKDOWN_DUR = 3.2;
  const INTRO_PITCH_UP = 1.0;
  const INTRO_PITCH_DOWN = 0; // ★変更：見下ろす代わりに正面(0)で静止してからコンセプトを表示

  // ★追加：外部から呼び出す起動関数。Portalの演出が完全に終わり、
  // プレイヤーがこの空間の主導権を得たタイミングで呼んでもらう。
  function activateIntro() {
    if (introPhase !== 'idle') return; // 二重起動防止
    introCinematicActive = true;
    introPhase = 'up';
    introElapsedInPhase = 0;
    introStartedAt = performance.now();
  }

  // --- コンセプト文オーバーレイ（"一枚の手紙が浮かぶ"デザイン） ---
  const conceptOverlayEl = document.createElement('div');
  Object.assign(conceptOverlayEl.style, {
    position: 'fixed',
    inset: '0',
    background: 'rgba(8, 6, 12, 0.7)',
    backdropFilter: 'blur(10px)',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '25',
  });

  // カード本体：半透明ガラス、角丸、柔らかい影（紙の質感・ノイズは持たせない）
  const conceptPanelEl = document.createElement('div');
  Object.assign(conceptPanelEl.style, {
    position: 'relative',
    width: 'min(78vw, 380px)',
    padding: '52px 36px 36px',
    borderRadius: '10px',
    background: 'linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.015))',
    boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
    color: '#f0e8d8',
    fontFamily: `'Klee One', 'Hiragino Mincho ProN', serif`,
    textAlign: 'left',
    opacity: '0',
    transform: 'translateY(14px)',
    transition: 'opacity 1.1s ease, transform 1.1s ease',
  });

  // 縁の淡いグロー（紙の質感の代わりに、ふんわり光る枠で"手紙"の存在感を出す）
  const conceptGlowRingEl = document.createElement('div');
  Object.assign(conceptGlowRingEl.style, {
    position: 'absolute',
    inset: '-1px',
    borderRadius: 'inherit',
    pointerEvents: 'none',
    boxShadow: [
      `0 0 0 1px ${hexToRgba(CONCEPT_ACCENT, CONCEPT_GLOW * 0.55)}`,
      `0 0 18px ${hexToRgba(CONCEPT_ACCENT, CONCEPT_GLOW * 0.35)}`,
      `0 0 46px ${hexToRgba(CONCEPT_ACCENT, CONCEPT_GLOW * 0.22)}`,
    ].join(', '),
  });

  // ガラスのハイライト（斜めの淡い光沢）
  const conceptGlassSheenEl = document.createElement('div');
  Object.assign(conceptGlassSheenEl.style, {
    position: 'absolute',
    inset: '0',
    borderRadius: 'inherit',
    background:
      'linear-gradient(155deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 30%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.03) 100%)',
    pointerEvents: 'none',
  });

  // "Remember." ―― 小さなセリフ程度の存在感
  const conceptRememberEl = document.createElement('div');
  conceptRememberEl.textContent = CONCEPT_REMEMBER;
  Object.assign(conceptRememberEl.style, {
    fontFamily: `'Cormorant Garamond', serif`,
    fontStyle: 'italic',
    fontWeight: '500',
    fontSize: '20px',
    color: CONCEPT_ACCENT,
    letterSpacing: '0.04em',
    marginBottom: '28px',
    opacity: '0',
    transform: 'translateY(6px)',
    transition: 'opacity 1s ease, transform 1s ease',
  });

  // 本文：段落ごとに要素を分け、順番にフェードインさせる
  const conceptParagraphEls = CONCEPT_PARAGRAPHS.map((text) => {
    const el = document.createElement('div');
    el.textContent = text;
    Object.assign(el.style, {
      whiteSpace: 'pre-line',
      fontSize: '15.5px',
      lineHeight: '2.15',
      textAlign: 'left',
      letterSpacing: '0.03em',
      marginBottom: '22px',
      fontWeight: '400',
      opacity: '0',
      transform: 'translateY(8px)',
      transition: 'opacity 1s ease, transform 1s ease',
    });
    return el;
  });

  // 署名：ピンクゴールド・細線のイタリック。下にごく細いラインを添える
  const conceptSignatureEl = document.createElement('div');
  conceptSignatureEl.textContent = CONCEPT_SIGNATURE;
  Object.assign(conceptSignatureEl.style, {
    position: 'relative',
    textAlign: 'right',
    fontFamily: `'Cormorant Garamond', serif`,
    fontStyle: 'italic',
    fontSize: '17px',
    letterSpacing: '0.08em',
    color: CONCEPT_SIG_COLOR,
    marginTop: '30px',
    opacity: '0',
    transition: 'opacity 1.2s ease',
  });
  const conceptSignatureLineEl = document.createElement('div');
  Object.assign(conceptSignatureLineEl.style, {
    width: '64px',
    height: '1px',
    margin: '6px 0 0 auto',
    background: `linear-gradient(90deg, transparent, ${CONCEPT_SIG_COLOR})`,
    opacity: '0.55',
  });
  conceptSignatureEl.appendChild(conceptSignatureLineEl);

  const conceptCloseButtonEl = document.createElement('button');
  conceptCloseButtonEl.textContent = '閉じる';
  Object.assign(conceptCloseButtonEl.style, {
    display: 'block',
    margin: '34px auto 0',
    padding: '10px 0 0',
    width: '120px',
    border: 'none',
    borderTop: `1px solid ${hexToRgba(CONCEPT_ACCENT, 0.55)}`,
    background: 'transparent',
    color: 'rgba(240,232,216,0.7)',
    fontFamily: `'Klee One', 'Hiragino Mincho ProN', serif`,
    fontSize: '12px',
    letterSpacing: '0.4em',
    cursor: 'pointer',
    opacity: '0',
    transition: 'opacity 1s ease, color 0.3s ease, border-color 0.3s ease',
  });
  conceptCloseButtonEl.addEventListener('mouseenter', () => {
    conceptCloseButtonEl.style.color = CONCEPT_ACCENT;
    conceptCloseButtonEl.style.borderTopColor = CONCEPT_ACCENT;
  });
  conceptCloseButtonEl.addEventListener('mouseleave', () => {
    conceptCloseButtonEl.style.color = 'rgba(240,232,216,0.7)';
    conceptCloseButtonEl.style.borderTopColor = hexToRgba(CONCEPT_ACCENT, 0.55);
  });

  conceptPanelEl.appendChild(conceptGlowRingEl);
  conceptPanelEl.appendChild(conceptGlassSheenEl);
  conceptPanelEl.appendChild(conceptRememberEl);
  conceptParagraphEls.forEach((el) => conceptPanelEl.appendChild(el));
  conceptPanelEl.appendChild(conceptSignatureEl);
  conceptPanelEl.appendChild(conceptCloseButtonEl);
  conceptOverlayEl.appendChild(conceptPanelEl);
  document.body.appendChild(conceptOverlayEl);

  // 16進カラー+アルファ変換ユーティリティ（グローや細線の色に使用）
  function hexToRgba(hex, alpha) {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // --- 映画のエンドロールのような、静かな順次フェードイン ---
  let conceptRevealTimers = [];
  function clearConceptRevealTimers() {
    conceptRevealTimers.forEach((id) => clearTimeout(id));
    conceptRevealTimers = [];
  }

  function resetConceptReveal() {
    conceptPanelEl.style.opacity = '0';
    conceptPanelEl.style.transform = 'translateY(14px)';
    conceptRememberEl.style.opacity = '0';
    conceptRememberEl.style.transform = 'translateY(6px)';
    conceptParagraphEls.forEach((el) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
    });
    conceptSignatureEl.style.opacity = '0';
    conceptCloseButtonEl.style.opacity = '0';
  }

  function playConceptReveal() {
    clearConceptRevealTimers();
    resetConceptReveal();

    const show = (el, withTransform) => {
      el.style.opacity = withTransform ? '0.92' : '1';
      if (withTransform) el.style.transform = 'translateY(0)';
    };

    conceptRevealTimers.push(
      setTimeout(() => {
        conceptPanelEl.style.opacity = '1';
        conceptPanelEl.style.transform = 'translateY(0)';
      }, 50),
      setTimeout(() => show(conceptRememberEl, true), 600),
      setTimeout(() => show(conceptParagraphEls[0], true), 1400),
      setTimeout(() => show(conceptParagraphEls[1], true), 2800),
      setTimeout(() => show(conceptParagraphEls[2], true), 4200),
      setTimeout(() => { conceptSignatureEl.style.opacity = '0.85'; }, 5200),
      setTimeout(() => { conceptCloseButtonEl.style.opacity = '1'; }, 5800),
    );
  }

  function showConceptOverlay() {
    conceptOverlayEl.style.display = 'flex';
    playConceptReveal();
  }

function closeConceptOverlay() {
    clearConceptRevealTimers();
    conceptOverlayEl.style.display = 'none';
    if (introPhase !== 'done') {
      introPhase = 'done';
      introCinematicActive = false;
    }
    // space2はここで音量が既に設定されているので、特に追加不要
    showGuideCard();
}

  conceptCloseButtonEl.addEventListener('click', closeConceptOverlay);

  // ====================================================================
  // 閉じた後のガイドカード（操作説明）＋「？」再表示アイコン
  // ------------------------------------------------------
  // コンセプト画面には操作説明を出さない代わりに、閉じた直後だけ
  // 右上にそっと表示し、数秒後に「？」アイコンへ収納する。
  // ====================================================================
  const guideCardEl = document.createElement('div');
  Object.assign(guideCardEl.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    width: 'min(78vw, 260px)',
    padding: '18px 20px',
    borderRadius: '4px',
    background: 'rgba(20, 16, 26, 0.5)',
    border: `1px solid ${hexToRgba(CONCEPT_ACCENT, 0.25)}`,
    boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
    color: '#f0e8d8',
    fontFamily: `'Klee One', 'Hiragino Mincho ProN', serif`,
    fontSize: '12px',
    lineHeight: '1.9',
    letterSpacing: '0.03em',
    opacity: '0',
    pointerEvents: 'none',
    transition: 'opacity 0.8s ease',
    zIndex: '18',
  });
  guideCardEl.innerHTML = `
    <div style="opacity:0.85; margin-bottom:8px; letter-spacing:0.15em; font-size:11px;">展示の楽しみ方</div>
    <div style="opacity:0.7;">
      ・スワイプで視点移動<br>
      ・写真をタップして拡大<br>
      ・空の紙飛行機と<br>
      　シャボン玉にも触れます
    </div>
  `;
  document.body.appendChild(guideCardEl);

  const guideHintButtonEl = document.createElement('button');
  guideHintButtonEl.textContent = '？';
  Object.assign(guideHintButtonEl.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: `1px solid ${hexToRgba(CONCEPT_ACCENT, 0.4)}`,
    background: 'rgba(20, 16, 26, 0.4)',
    color: 'rgba(240,232,216,0.7)',
    fontFamily: `'Cormorant Garamond', serif`,
    fontSize: '14px',
    cursor: 'pointer',
    opacity: '0',
    pointerEvents: 'none',
    transition: 'opacity 0.4s ease',
    zIndex: '18',
  });
  document.body.appendChild(guideHintButtonEl);

  let guideCardTimer = null;
  function showGuideCard() {
    guideCardEl.style.opacity = '1';
    guideCardEl.style.pointerEvents = 'auto';
    guideHintButtonEl.style.opacity = '0';
    guideHintButtonEl.style.pointerEvents = 'none';

    clearTimeout(guideCardTimer);
    guideCardTimer = setTimeout(() => {
      guideCardEl.style.opacity = '0';
      guideCardEl.style.pointerEvents = 'none';
      guideHintButtonEl.style.opacity = '1';
      guideHintButtonEl.style.pointerEvents = 'auto';
    }, 5000); // 数秒後に半透明化（5秒。調整可）
  }
  guideHintButtonEl.addEventListener('click', showGuideCard);

  function updateConceptIntro(dt) {
    if (introPhase === 'idle') return; // ★変更：activateIntro()が呼ばれるまで何もしない

    if (introPhase === 'done') return; // ★変更：もう一度読むボタンは廃止したので何もしない

    introElapsedInPhase += dt;

    if (introPhase === 'up') {
      const p = Math.min(1, introElapsedInPhase / INTRO_LOOKUP_DUR);
      const eased = 1 - Math.pow(1 - p, 2);
      targetPitch = eased * INTRO_PITCH_UP;
      pitch = targetPitch;
      if (p >= 1) { introPhase = 'holdUp'; introElapsedInPhase = 0; }
    } else if (introPhase === 'holdUp') {
      if (introElapsedInPhase >= INTRO_HOLD_DUR) { introPhase = 'down'; introElapsedInPhase = 0; }
    } else if (introPhase === 'down') {
      const p = Math.min(1, introElapsedInPhase / INTRO_LOOKDOWN_DUR);
      const eased = 1 - Math.pow(1 - p, 2);
      targetPitch = INTRO_PITCH_UP + (INTRO_PITCH_DOWN - INTRO_PITCH_UP) * eased;
      pitch = targetPitch;
      if (p >= 1) {
        introPhase = 'showingConcept';
        introElapsedInPhase = 0;
        showConceptOverlay();
      }
    }
  }
  // ====================================================================
  // [SECTION: conceptIntro end]
  // ====================================================================


  // ====================================================================
  // [SECTION: update] 毎フレーム更新処理
  // ====================================================================
  let bgUpdateTimer = 0;
  const warmFlareTint = new THREE.Color(0xe0b888);

  const REVEAL_BG_END    = 0.8;
  const REVEAL_PHOTO_END = 2.5;
  const PHOTO_FADE_DUR   = 0.5;

  function getStaggerStartTime(index, total) {
    if (total <= 1) return REVEAL_BG_END;
    const span = REVEAL_PHOTO_END - REVEAL_BG_END - PHOTO_FADE_DUR;
    return REVEAL_BG_END + (index / (total - 1)) * Math.max(0, span);
  }

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

    const elapsed = (performance.now() - spaceStartTime) / 1000;
    const introDone = elapsed >= REVEAL_PHOTO_END;

    if (viewingItem && approachProgress > 0.01) {
      photoItems.forEach(item => {
        if (!item.mesh) return;
        const targetOpacity = item === viewingItem ? 1.0 : 0.25;
        item.mesh.material.opacity += (targetOpacity - item.mesh.material.opacity) * 0.05;
        if (item.aura) {
          item.aura.material.opacity += ((item === viewingItem ? 0.7 : 0.1) - item.aura.material.opacity) * 0.05;
         if (item.isGlowing && item !== viewingItem) return;
        }
      });
    } else {
      const t = performance.now() * 0.0006;
      photoItems.forEach(item => {
        if (!item.mesh) return;

        let targetOpacity = 1.0;
        let targetAuraOpacity = 0.5;

        if (!introDone) {
          const startT = getStaggerStartTime(item.revealIndex ?? 0, photoItems.length);
          const progress = THREE.MathUtils.clamp((elapsed - startT) / PHOTO_FADE_DUR, 0, 1);
          targetOpacity = progress;
          targetAuraOpacity = progress * 0.5;
        }

        item.mesh.material.opacity += (targetOpacity - item.mesh.material.opacity) * 0.08;
        if (item.aura) {
          item.aura.material.opacity += (targetAuraOpacity - item.aura.material.opacity) * 0.08;
        }

        const floatY = Math.sin(t + item.floatPhase) * 0.25;
        item.mesh.position.y = item.position.y + floatY;
        if (item.aura) item.aura.position.y = item.position.y + floatY;
        if (item.isGlowing && item.aura) {
          const glowT = performance.now() * 0.0015;
          const pulse = 0.5 + Math.sin(glowT + item.floatPhase) * 0.3;
          item.aura.material.opacity = pulse;
          item.aura.material.color.setHSL(
            0.08 + Math.sin(glowT * 0.3) * 0.05,
            0.8,
            0.7
          );
        }
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

  function updateFocusButton(dt) {
    if (!IS_MOBILE) return;
    if (introCinematicActive) { hideFocusButton(); return; } // ★追加：導入演出中は出さない

    if (viewingItem || approachProgress > 0.01) {
      hideFocusButton();
      focusedItem = null;
      focusTimer = 0;
      return;
    }

    const facing = getFacingItem();

    if (facing && facing === focusedItem) {
      focusTimer += dt;
      if (focusTimer >= FOCUS_DWELL_TIME) {
        showFocusButton();
      }
    } else {
      focusedItem = facing;
      focusTimer = 0;
      hideFocusButton();
    }
  }

  function update(dt) {
    updateCamera(dt);
    updatePhotos(dt);
    updateRipple(dt);
    updateSparkles(dt);
    updateBackground(dt);
    updateFocusButton(dt);
    updateWriteButton();
    updateFlyingMessages(dt);
    updateConceptIntro(dt); 
    updateCeilingStar(dt); 
    if (bookReveal) bookReveal.update(dt);
  }
  // ====================================================================
  // [SECTION: update end]
  // ====================================================================

  function hideUI() {
    hideFocusButton();
    hideWriteButton();
    formOverlayEl.style.display = 'none';
    hideMessageTooltip();
    conceptOverlayEl.style.display = 'none'; // ★追加
    guideCardEl.style.opacity = '0';
    guideCardEl.style.pointerEvents = 'none';
    guideHintButtonEl.style.opacity = '0';
    guideHintButtonEl.style.pointerEvents = 'none';
    clearTimeout(guideCardTimer);
    albumOverlayEl.style.display = 'none'; // ★追加
  }

  return { scene, update, hideUI, activateIntro };
}