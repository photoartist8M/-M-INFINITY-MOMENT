import * as THREE from 'three';
import { GALLERY_RADIUS, MAX_TEX_DIM, SPARKLE_COUNT, IS_MOBILE } from './config/constants.js';
import { PHOTO_CONFIG } from './core/photoConfig.js';
import { extractPastelColors } from './utils/color.js';
import { loadImageSafely, getTextureSource } from './utils/image.js';
import { hasSubmitted, submitMessage, fetchLetterMessages, fetchBubbleMessages } from './core/messaging.js';

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
  // ★追加：スマホでは正確なタップの代わりに「正面を向いた写真の前で
  // 一定時間留まる→下部にボタンが出現→タップで確定」という方式にする。
  // 高齢者や3D操作に不慣れな方でも、狙いを定めず視点を向けるだけで
  // 操作できるようにするための仕組み。
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
      padding: '10px 48px',
      fontSize: '25px',
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
  // ★追加：写真を拡大表示している状態で、その写真が letter/bubble タイプ
  // かつ未投稿の場合に「記入する」ボタンを表示。押すとフォームが開く。
  // ------------------------------------------------------

  // --- 記入ボタン ---
  const writeButtonEl = document.createElement('button');
  writeButtonEl.textContent = 'メッセージ';
  Object.assign(writeButtonEl.style, {
    position: 'fixed',
    left: '50%',
    bottom: '9%',
    transform: 'translateX(-50%) translateY(20px)',
    padding: '18px 52px',
    fontSize: '20px',
    fontFamily: 'sans-serif',
    color: '#3a2c20',
    background: 'rgba(255, 240, 220, 0.55)',
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

  // --- 入力フォーム(オーバーレイ) ---
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
    width: 'min(90vw, 420px)',
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
    fontSize: '14px',
    outline: 'none',
  });

  const messageInputEl = document.createElement('textarea');
  messageInputEl.placeholder = 'メッセージ';
  messageInputEl.maxLength = 200;
  messageInputEl.rows = 4;
  Object.assign(messageInputEl.style, {
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 14px',
    marginBottom: '16px',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(255,255,255,0.08)',
    color: '#fff',
    fontSize: '14px',
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

  let formTargetItem = null; // 今フォームを開いている対象のphotoItem
  let formSubmitting = false;

  // ★追加：letter(手紙風)/bubble(ガラス風)でフォームの見た目を切り替える
  function applyLetterStyle() {
    Object.assign(formPanelEl.style, {
      background: 'repeating-linear-gradient(#fbf3e0 0px, #fbf3e0 27px, #e8dcc0 28px)',
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
      formTitleEl.textContent = '紙飛行機にメッセージをのせて送りましょう';
      applyLetterStyle();
    } else {
      formTitleEl.textContent = 'シャボン玉にメッセージをのせて送りましょう';
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

      // ★実装：送信した写真の位置から紙飛行機/シャボン玉を生成して漂わせる
      const spawnData = {
        name: nameInputEl.value && nameInputEl.value.trim() ? nameInputEl.value.trim() : null,
        message,
      };
      if (submittedItem.type === 'letter') {
        spawnLetterPlane(spawnData, submittedItem.position.clone());
      } else if (submittedItem.type === 'bubble') {
        spawnBubble(spawnData, submittedItem.position.clone());
      }

      // ★追加：送信直後にズームを解除して、飛んでいく/漂う様子を見えるようにする
      viewingItem = null;
      approachTarget = 0;
    } catch (err) {
      formErrorEl.textContent = '送信に失敗しました。時間をおいて試してください。';
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

  // ★追加：写真を拡大表示しきった状態で、letter/bubble かつ未投稿なら記入ボタンを出す
  function updateWriteButton() {
    if (formOverlayEl.style.display === 'flex') return; // フォーム表示中は何もしない

    const zoomedFully = viewingItem && approachProgress > 0.85;
    const eligible =
      zoomedFully &&
      (viewingItem.type === 'letter' || viewingItem.type === 'bubble') &&
      !hasSubmitted(viewingItem.type);

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
  // ★追加：投稿された/読み込んだメッセージを、紙飛行機orシャボン玉として
  // 空間に生成し、ゆっくり漂わせる。タップすると内容が読める。
  // ------------------------------------------------------

  function createPaperPlaneTexture() {
    const size = 160;
    const cnv = document.createElement('canvas');
    cnv.width = size; cnv.height = size;
    const ctx = cnv.getContext('2d');
    ctx.translate(size / 2, size / 2);
    ctx.rotate(-Math.PI / 5); // 少し傾けて飛んでいる感を出す

    // 胴体（左側の大きい面）
    ctx.fillStyle = '#fdf8ee';
    ctx.beginPath();
    ctx.moveTo(-46, 6);
    ctx.lineTo(46, 0);
    ctx.lineTo(-30, 30);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,100,70,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 翼（右上の面、少し暗めで折り目の陰を表現）
    ctx.fillStyle = '#e9dfc8';
    ctx.beginPath();
    ctx.moveTo(-46, 6);
    ctx.lineTo(46, 0);
    ctx.lineTo(-30, -22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 中央の折り目の線
    ctx.strokeStyle = 'rgba(120,100,70,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-46, 6);
    ctx.lineTo(46, 0);
    ctx.stroke();

    // 尾翼の小さな折り返し
    ctx.fillStyle = '#f4ecd8';
    ctx.beginPath();
    ctx.moveTo(-30, 30);
    ctx.lineTo(-30, -22);
    ctx.lineTo(-14, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    return new THREE.CanvasTexture(cnv);
  }

  function createBubbleTexture() {
    const size = 128;
    const cnv = document.createElement('canvas');
    cnv.width = size; cnv.height = size;
    const ctx = cnv.getContext('2d');
    const g = ctx.createRadialGradient(size * 0.35, size * 0.32, 2, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.25, 'rgba(200,230,255,0.35)');
    g.addColorStop(0.55, 'rgba(255,200,240,0.28)');
    g.addColorStop(0.8, 'rgba(210,255,225,0.2)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
    ctx.stroke();
    return new THREE.CanvasTexture(cnv);
  }

  const paperPlaneTexture = createPaperPlaneTexture();
  const bubbleTexture = createBubbleTexture();

  const letterPlanes = []; // { sprite, data, angle, radius, height, targetHeight, phase, driftSpeed, rising }
  const bubbles = [];      // { sprite, data, angle, radius, baseY, phase, driftSpeed }
  const MAX_BUBBLES = 30;

  function spawnLetterPlane(data, fromPosition) {
    const mat = new THREE.SpriteMaterial({ map: paperPlaneTexture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.3, 1.3, 1);

    const startHeight = fromPosition ? fromPosition.y : (8 + Math.random() * 6);
    const startPos = fromPosition
      ? fromPosition.clone()
      : new THREE.Vector3(
          (Math.random() - 0.5) * GALLERY_RADIUS * 1.4,
          startHeight,
          (Math.random() - 0.5) * GALLERY_RADIUS * 1.4
        );
    sprite.position.copy(startPos);
    sprite.userData.messageData = data;
    scene.add(sprite);

    letterPlanes.push({
      sprite,
      data,
      angle: Math.random() * Math.PI * 2,
      radius: 6 + Math.random() * (GALLERY_RADIUS * 0.85),
      height: startHeight,
      targetHeight: 8 + Math.random() * 6,
      phase: Math.random() * Math.PI * 2,
      driftSpeed: 0.08 + Math.random() * 0.12,
      rising: !!fromPosition, // 新規投稿時だけ天井へ上昇する演出をつける
    });
  }

  function spawnBubble(data, fromPosition) {
    const mat = new THREE.SpriteMaterial({
      map: bubbleTexture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(mat);
    const s = 0.8 + Math.random() * 0.6;
    sprite.scale.set(s, s, 1);

    const baseY = fromPosition ? fromPosition.y : (-2 + Math.random() * 10);
    const startPos = fromPosition
      ? fromPosition.clone()
      : new THREE.Vector3(
          (Math.random() - 0.5) * GALLERY_RADIUS * 1.3,
          baseY,
          (Math.random() - 0.5) * GALLERY_RADIUS * 1.3
        );
    sprite.position.copy(startPos);
    sprite.userData.messageData = data;
    scene.add(sprite);

    bubbles.push({
      sprite,
      data,
      angle: Math.random() * Math.PI * 2,
      radius: 4 + Math.random() * (GALLERY_RADIUS * 0.7),
      baseY,
      phase: Math.random() * Math.PI * 2,
      driftSpeed: 0.05 + Math.random() * 0.1,
    });

    // ★シャボン玉は直近30個のみ表示：超えたら一番古いものを消す
    if (bubbles.length > MAX_BUBBLES) {
      const removed = bubbles.shift();
      scene.remove(removed.sprite);
      removed.sprite.material.dispose();
    }
  }

  function updateFlyingMessages(dt) {
    const t = performance.now() * 0.0004;

    letterPlanes.forEach(e => {
      if (e.rising && e.height < e.targetHeight) {
        e.height += dt * 1.4;
        if (e.height >= e.targetHeight) {
          e.height = e.targetHeight;
          e.rising = false;
        }
      }
      e.angle += e.driftSpeed * dt * 0.3;
      e.sprite.position.set(
        Math.cos(e.angle) * e.radius,
        e.height + Math.sin(t * 1.6 + e.phase) * 0.4,
        Math.sin(e.angle) * e.radius
      );
    });

const bt = performance.now() * 0.0003;
    bubbles.forEach(e => {
      // ★追加：生成直後、極小から本来の大きさへ膨らむ演出
      if (e.popProgress < 1) {
        e.popProgress = Math.min(1, e.popProgress + dt * 2.2);
        const eased = 1 - Math.pow(1 - e.popProgress, 3); // ease-out
        const s = e.targetScale * eased;
        e.sprite.scale.set(s, s, 1);
      }

      e.angle += e.driftSpeed * dt * 0.2;
      e.sprite.position.set(
        Math.cos(e.angle) * e.radius,
        e.baseY + Math.sin(bt * 1.3 + e.phase) * 0.6,
        Math.sin(e.angle) * e.radius
      );
    });
  }

  // --- メッセージ内容を表示するツールチップ ---
  const messageTooltipEl = document.createElement('div');
  Object.assign(messageTooltipEl.style, {
    position: 'fixed',
    left: '50%',
    bottom: '14%',
    transform: 'translateX(-50%) translateY(10px)',
    maxWidth: '80vw',
    width: 'min(90vw, 380px)',
    padding: '16px 20px',
    borderRadius: '16px',
    background: 'rgba(30, 24, 38, 0.85)',
    border: '1px solid rgba(255,255,255,0.15)',
    boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
    color: '#fff',
    fontFamily: 'sans-serif',
    fontSize: '14px',
    lineHeight: '1.6',
    opacity: '0',
    pointerEvents: 'none',
    transition: 'opacity 0.35s ease, transform 0.35s ease',
    zIndex: '18',
  });
  document.body.appendChild(messageTooltipEl);

  let tooltipHideTimer = null;
  function showMessageTooltip(data) {
    const who = data.name && data.name.trim() ? data.name.trim() : '匿名';
    messageTooltipEl.innerHTML = `<div style="opacity:0.6;font-size:12px;margin-bottom:6px;">${who}</div><div>${data.message.replace(/</g, '&lt;')}</div>`;
    messageTooltipEl.style.opacity = '1';
    messageTooltipEl.style.transform = 'translateX(-50%) translateY(0)';

    if (tooltipHideTimer) clearTimeout(tooltipHideTimer);
    tooltipHideTimer = setTimeout(() => {
      messageTooltipEl.style.opacity = '0';
      messageTooltipEl.style.transform = 'translateX(-50%) translateY(10px)';
    }, 4000);
  }

  // --- 過去の投稿を読み込んで空間に配置(初回のみ) ---
  (async () => {
    try {
      const letters = await fetchLetterMessages();
      letters.forEach(m => spawnLetterPlane(m, null));

      const bubbleMessages = await fetchBubbleMessages(MAX_BUBBLES);
      // 新しい順で来るので、逆順(古い→新しい)に積み直してから表示する
      bubbleMessages.reverse().forEach(m => spawnBubble(m, null));
    } catch (err) {
      console.error('[flyingMessages] 過去の投稿の読み込みに失敗しました:', err);
    }
  })();
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

        // ★追加：スマホでのズーム時見切れ対策のため、写真の実サイズをitemに保存
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
          opacity: 0, // ★変更(1→0)：最初は非表示。update内の時間差フェードインで見せる
        });

        item.mesh = new THREE.Mesh(geo, mat);
        item.mesh.position.copy(position);
        item.mesh.lookAt(0, position.y, 0);
        item.mesh.userData.photoItem = item;
        scene.add(item.mesh);

        // ★追加：タップ判定だけを広げるための見えない当たり判定用メッシュ
        // 見た目のサイズは変えず、タップの許容範囲だけ広げる
        const hitPadding = 1.5;
        const hitGeo = new THREE.PlaneGeometry(baseWidth * hitPadding, baseHeight * hitPadding);
        const hitMat = new THREE.MeshBasicMaterial({ visible: false }); // 描画はしない
        item.hitMesh = new THREE.Mesh(hitGeo, hitMat);
        item.hitMesh.position.copy(position);
        item.hitMesh.lookAt(0, position.y, 0);
        item.hitMesh.userData.photoItem = item;
        scene.add(item.hitMesh);

        const auraGeo = new THREE.PlaneGeometry(baseWidth + 0.15, baseHeight + 0.15);
        const auraMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0, // ★変更(0.5→0)：最初は非表示
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

  // ★変更：時間差フェードインの順序に使う revealIndex を各itemに付与
  PHOTO_CONFIG.forEach((cfg, idx) => {
    const item = createPhotoItem(cfg);
    item.revealIndex = idx;
    photoItems.push(item);
  });
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

  // ★追加：ドラッグとタップを区別するための変数
  let touchStartX = 0, touchStartY = 0, touchMoved = false;
  const TAP_MOVE_THRESHOLD = 10; // これ以上動いたら「タップ」ではなく「ドラッグ」とみなす(px)

  canvasEl.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
      touchStartX = lastX;      // ★追加
      touchStartY = lastY;      // ★追加
      touchMoved = false;       // ★追加
    }
  }, { passive: true });

  canvasEl.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) {
      const dx = e.touches[0].clientX - lastX;
      const dy = e.touches[0].clientY - lastY;
      onDragMove(dx, dy);
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;

      // ★追加：タップ開始位置からの総移動距離をチェック
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

  // ★追加：写真全体が画面（カメラのFOV・aspect）にちょうど収まる距離を計算
  // スマホ（縦長・aspectが小さい）でも横長写真がはみ出ないようにするための関数
  function calcFitDistance(item) {
    const w = item.frameWidth || 4;
    const h = item.frameHeight || 4;

    const vFov = THREE.MathUtils.degToRad(camera.fov); // 縦方向の視野角
    const aspect = camera.aspect;

    // 縦方向に収めるために必要な距離
    const distForHeight = (h / 2) / Math.tan(vFov / 2);

    // 横方向に収めるために必要な距離
    // 横方向の視野角は aspect を掛けて求める
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const distForWidth = (w / 2) / Math.tan(hFov / 2);

    // 縦・横どちらも収まる方（大きい方）を採用し、少し余白を持たせる
    const margin = 1.35; // 余白係数。1.2〜1.5くらいで調整
    return Math.max(distForHeight, distForWidth) * margin;
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

          // ★修正：Y成分を無視した水平方向のみのdirを使う
          // → カメラの高さを写真と揃えて、正面から見たときの台形歪みを防ぐ
          const dir = item.position.clone();
          dir.y = 0;
          dir.normalize();

          const fitDistance = calcFitDistance(item);
          cameraApproachPos = item.position.clone().sub(dir.multiplyScalar(fitDistance));
          cameraApproachPos.y = item.position.y; // 念のため高さを完全に一致させる
        }
        break;
      }
    }
  }

  function onPointerClick(clientX, clientY) {
    // ★追加：イントロ演出中（2.5秒経過前）はクリック操作を無効化
    const elapsed = (performance.now() - spaceStartTime) / 1000;
    if (elapsed < REVEAL_PHOTO_END) return;

    pointer.x = (clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    // ★追加：浮遊する紙飛行機・シャボン玉へのタップ判定(PC/スマホ共通)
    // 写真拡大中は判定しない(誤タップ防止)
    if (!viewingItem) {
      const flyingSprites = [
        ...letterPlanes.map(e => e.sprite),
        ...bubbles.map(e => e.sprite),
      ];
      const flyingHits = raycaster.intersectObjects(flyingSprites);
      if (flyingHits.length > 0) {
        showMessageTooltip(flyingHits[0].object.userData.messageData);
        return;
      }
    }

    // ★変更：mesh → hitMesh に変更（当たり判定を広げた透明な板を使う）
    // ★追加：スマホでは写真への直接タップ選択を無効化（留まってボタン確定方式に統一）
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
    if (touchMoved) return; // ★追加：ドラッグだった場合はクリック扱いしない
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

  // ★追加：フェードイン演出のタイミング定数
  const REVEAL_BG_END    = 0.8;  // 0.0〜0.8秒: 背景・床・光のみ
  const REVEAL_PHOTO_END = 2.5;  // 0.8〜2.5秒: 写真が時間差フェードイン。以降は通常モード
  const PHOTO_FADE_DUR   = 0.5;  // 1枚あたりのフェード所要時間(秒)

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

    const elapsed = (performance.now() - spaceStartTime) / 1000; // ★追加
    const introDone = elapsed >= REVEAL_PHOTO_END; // ★追加：2.5秒経過後は通常モード

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

        // ★追加：イントロ中は時間差フェードイン、完了後は通常通り1.0を目指す
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

  // ★追加：スマホ用、正面の写真に一定時間留まっているかを判定してボタンを出す
  function updateFocusButton(dt) {
    if (!IS_MOBILE) return;

    // ズーム中や視点移動が終わっていない間はボタンを出さない
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
      // 向いている写真が変わった → タイマーをリセットしてボタンを隠す
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
    updateFlyingMessages(dt); // ★追加
  }
  // ====================================================================
  // [SECTION: update end]
  // ====================================================================

  return { scene, update };
}