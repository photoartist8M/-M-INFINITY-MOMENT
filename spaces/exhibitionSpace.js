import * as THREE from 'three';

// ======================================================================
// [SECTION: config] ここから設定・定数エリア
// 将来的に分割する場合 → config/constants.js
// ======================================================================

// ------------------------------------------------------
// 写真データ（旧 PHOTO_SOURCES から拡張）
// ------------------------------------------------------
// ★変更点①：単なるURL配列だったものを、id / type / depth / interaction を
//   持てるオブジェクト配列へ変更。まだ type は "normal" 固定、
//   depth / interaction は未使用（null）。
//   将来のデプスマップ写真・メッセージ機能追加時に、この配列へ
//   値を足していくだけで対応できるようにするための土台。
// ------------------------------------------------------
const PHOTO_DATA = [
  { id: 0,  src: '../assets/photo.jpg',   type: 'normal', depth: null, interaction: null },
  { id: 1,  src: '../assets/photo1.jpg',  type: 'normal', depth: null, interaction: null },
  { id: 2,  src: '../assets/photo2.jpg',  type: 'normal', depth: null, interaction: null },
  { id: 3,  src: '../assets/photo4.jpg',  type: 'normal', depth: null, interaction: null },
  { id: 4,  src: '../assets/photo5.jpg',  type: 'normal', depth: null, interaction: null },
  { id: 5,  src: '../assets/photo6.jpg',  type: 'normal', depth: null, interaction: null },
  { id: 6,  src: '../assets/photo7.jpg',  type: 'normal', depth: null, interaction: null },
  { id: 7,  src: '../assets/photo8.jpg',  type: 'normal', depth: null, interaction: null },
  { id: 8,  src: '../assets/photo9.jpg',  type: 'normal', depth: null, interaction: null },
  { id: 9,  src: '../assets/photo15.jpg', type: 'normal', depth: null, interaction: null },
  { id: 10, src: '../assets/photo12.jpg', type: 'normal', depth: null, interaction: null },
  { id: 11, src: '../assets/photo13.jpg', type: 'normal', depth: null, interaction: null },
  { id: 12, src: '../assets/photo15.jpg', type: 'normal', depth: null, interaction: null },
  { id: 13, src: '../assets/photo19.jpg', type: 'normal', depth: null, interaction: null },
  { id: 14, src: '../assets/photo20.jpg', type: 'normal', depth: null, interaction: null },
  { id: 15, src: '../assets/photo21.jpg', type: 'normal', depth: null, interaction: null },
];

const GALLERY_RADIUS = 21;

// ------------------------------------------------------
// モバイル判定・テクスチャサイズ上限
// ------------------------------------------------------
// スマホは画面幅だけでなくUAでも判定し、Androidタブレット等の
// 幅判定漏れも拾う。GPUメモリ不足によるWebGLコンテキストロスト
// （全画像が一度に表示されなくなる現象）を防ぐため、モバイルでは
// テクスチャの最大辺を大きく制限する。
// ------------------------------------------------------
const IS_MOBILE = window.innerWidth <= 768 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
const MAX_TEX_DIM = IS_MOBILE ? 900 : 2000;

const SPARKLE_COUNT = 260;

// ------------------------------------------------------
// ⑥ 品質設定オブジェクト（追加・未使用）
// ------------------------------------------------------
// 今後のスマホ最適化・品質切替のための置き場所。
// 現時点ではどこからも参照しない（挙動は変えない）。
// 実際にモバイル最適化を行う際、MAX_TEX_DIM や SPARKLE_COUNT の
// 計算をこちらの値に置き換えていく想定。
// ------------------------------------------------------
const QUALITY = {
  photoMaxTexture: 2000,
  particleCount: 260,
  bloom: true,
};

// ======================================================================
// [SECTION: config end]
// ======================================================================


// ======================================================================
// [SECTION: photoConfigBuilder] 写真の配置計算
// 将来的に分割する場合 → core/photoConfig.js
// ======================================================================

// ------------------------------------------------------
// ② buildPhotoConfig()
// ------------------------------------------------------
// PHOTO_DATA（写真のメタ情報）を受け取り、配置計算した
// angle / radius / height / scale を追加したオブジェクト配列を返す。
// 計算ロジック自体は元のコードと完全に同一（挙動を変えないため）。
// ------------------------------------------------------
function buildPhotoConfig(photoData) {
  const count = photoData.length;
  return photoData.map((photo, i) => {
    // 1. 角度のズレ（jitter）を完全にゼロにして、円周上の重なりを100%防ぐ
    const baseAngle = (360 / count) * i;
    const angle = baseAngle;

    // 2. 上下の配置を大きく散らす（偶数は上め、奇数は下めに配置。上段・下段の二段構成）
    const isEven = i % 2 === 0;
    const baseHeight = isEven ? 6.0 : -2.5;
    const height = baseHeight + (Math.random() - 0.5) * 2.5;

    // 3. サイズ（scale）の大小にメリハリをつける
    const scale = 0.85 + Math.random() * 0.75; // 0.85〜1.6倍の範囲でばらつかせる

    // 4. 前後の奥行き（半径）にも緩やかな変化をつける
    const radius = GALLERY_RADIUS + (Math.random() - 0.5) * 3;

    return { ...photo, angle, radius, height, scale };
  });
}

const PHOTO_CONFIG = buildPhotoConfig(PHOTO_DATA);

// ======================================================================
// [SECTION: photoConfigBuilder end]
// ======================================================================


// ======================================================================
// [SECTION: colorUtils] パステル色抽出ユーティリティ
// 将来的に分割する場合 → utils/color.js
// ======================================================================

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

function toPastel(h, s, l, hueShift = 0) {
  // 色相はほぼ元の写真通りに保ち、わずかな揺らぎだけを加える
  const hue = ((h + hueShift) % 1 + 1) % 1;
  // 彩度は底上げしつつ、明度は白飛びしない範囲に収めて発色を保つ
  const sat = THREE.MathUtils.clamp(s * 1.2 + 0.15, 0.35, 1.0);
  const light = THREE.MathUtils.clamp(l, 0.2, 0.55);
  return hslToColor(hue, sat, light);
}

function extractPastelColors(img) {
  const w = 60, h = 60;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0, w, h);
  const data = cx.getImageData(0, 0, w, h).data;

  // 単純な平均だと、夕焼けの白飛びした太陽・青空・オレンジの地平線が
  // 混ざり合って色味の薄い灰白色になってしまう。
  // そこで帯の中で最も彩度の高いピクセル（＝その帯を象徴する色）を採用する。
  function pickVividColor(yStart, yEnd) {
    let bestS = -1, bestH = 0, bestL = 0.5;
    for (let y = yStart; y < yEnd; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const [ph, ps, pl] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
        if (ps > bestS) {
          bestS = ps;
          bestH = ph;
          bestL = pl;
        }
      }
    }
    return [bestH, bestS, bestL];
  }

  // 5帯に分割して抽出する。完全に忠実にすると同系色に寄りすぎるため、
  // 帯ごとにごく緩やかな色相の広がりを持たせつつ、元の色味の骨格は保つ
  const bandCount = 5;
  const bandHeight = h / bandCount;
  const colors = [];
  for (let i = 0; i < bandCount; i++) {
    const [ph, ps, pl] = pickVividColor(Math.floor(i * bandHeight), Math.floor((i + 1) * bandHeight));
    const hueShift = (i / (bandCount - 1) - 0.5) * 0.12 + (Math.random() - 0.5) * 0.05;
    colors.push(toPastel(ph, ps, pl, hueShift));
  }
  return colors;
}

// ======================================================================
// [SECTION: colorUtils end]
// ======================================================================


// ======================================================================
// [SECTION: imageUtils] 画像読み込み・テクスチャ変換ユーティリティ
// 将来的に分割する場合 → utils/image.js
// ======================================================================

// ------------------------------------------------------
// 画像を安全に読み込むユーティリティ
// ------------------------------------------------------
// onerror・タイムアウトが一切なかったため、画像が1枚でも
// 読み込みに失敗すると静かに「読み込み中」のまま止まっていた。
// 失敗・タイムアウト時は必ずコールバックし、他の写真の処理を
// ブロックしないようにする。
// ------------------------------------------------------
function loadImageSafely(src, { onSuccess, onFail, timeoutMs = 10000 }) {
  const img = new Image();
  let settled = false;

  const failTimeoutId = setTimeout(() => {
    if (settled) return;
    settled = true;
    console.warn(`[exhibition] 画像の読み込みがタイムアウトしました: ${src}`);
    onFail && onFail();
  }, timeoutMs);

  img.onerror = () => {
    if (settled) return;
    settled = true;
    clearTimeout(failTimeoutId);
    console.error(`[exhibition] 画像の読み込みに失敗しました: ${src}`);
    onFail && onFail();
  };

  img.onload = () => {
    if (settled) return;

    if (!img.naturalWidth || !img.naturalHeight) {
      settled = true;
      clearTimeout(failTimeoutId);
      console.error(`[exhibition] 画像が壊れています: ${src}`);
      onFail && onFail();
      return;
    }

    settled = true;
    clearTimeout(failTimeoutId);
    onSuccess && onSuccess(img);
  };

  img.src = src;
  return img;
}

// ------------------------------------------------------
// テクスチャ用に必要であれば縮小したソースを返す
// ------------------------------------------------------
// モバイルでのGPUメモリ不足によるWebGLコンテキストロスト
// （全画像が突然表示されなくなる現象）を防ぐため、上限を超える
// 画像はCanvasで縮小してからテクスチャ化する。
// ------------------------------------------------------
function getTextureSource(img, maxDim) {
  const longSide = Math.max(img.width, img.height);
  if (longSide <= maxDim) return img;

  const scale = maxDim / longSide;
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  const cctx = c.getContext('2d');
  cctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

// ======================================================================
// [SECTION: imageUtils end]
// ======================================================================


// ======================================================================
// エントリーポイント：外部(test.html)から呼び出される
// ======================================================================
export function startExhibitionSpace(renderer, camera) {
  const scene = new THREE.Scene();

  camera.position.set(0, 0, 0);

  // ====================================================================
  // [SECTION: lights] 照明
  // 将来的に分割する場合 → core/scene.js
  // ====================================================================
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.15); // ── 照明の調整（修正版） ──
  // 0.28 → 0.15 に落として影の深みを出す
  scene.add(ambientLight);
  const keyLight = new THREE.DirectionalLight(0xffefe0, 0.3);
  keyLight.position.set(3, 8, 5);
  scene.add(keyLight);
  // ====================================================================
  // [SECTION: lights end]
  // ====================================================================


  // ====================================================================
  // [SECTION: background] 背景グラデーション
  // 将来的に分割する場合 → effects/background.js
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
  // 将来的に分割する場合 → effects/water.js
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
    color6: { value: new THREE.Color(0xff66cc) }, // ピンク
    color7: { value: new THREE.Color(0xcc66ff) }, // 紫
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
  // 将来的に分割する場合 → effects/flare.js
  // ====================================================================
  function createFlareTexture() {
    const w = 1024, h = 128;
    const cnv = document.createElement('canvas');
    cnv.width = w; cnv.height = h;
    const ctx = cnv.getContext('2d');

    // 横方向の帯：明るいゴールドベージュに戻して芯を作る
    const vGrad = ctx.createLinearGradient(0, 0, 0, h);
    vGrad.addColorStop(0, 'rgba(255,235,200,0)');
    vGrad.addColorStop(0.5, 'rgba(255,235,200,0.27)'); // 0.25にしたらもう少し暗くなる。太陽光
    vGrad.addColorStop(1, 'rgba(255,235,200,0)');
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, w, h);

    // 光の粒：白トビしない程度に明るさを引き上げる
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
  // 半径を大幅に小さくし、写真の内側（足元）に配置する。
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
  // 将来的に分割する場合 → effects/sparkles.js
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
  // 将来的に分割する場合 → core/photos.js
  // ====================================================================
  const photoItems = [];

  // ------------------------------------------------------
  // ③ createPhotoItem()
  // ------------------------------------------------------
  // PhotoItem に id / type / src / depth / interaction を保持させる。
  // さらに将来のLOD対応に備え、lowTexture / highTexture の
  // プレースホルダーも用意しておく（読み込み処理はまだ実装しない）。
  // ------------------------------------------------------
  function createPhotoItem(config) {
    const rad = THREE.MathUtils.degToRad(config.angle);
    const position = new THREE.Vector3(
      Math.sin(rad) * config.radius,
      config.height + 1.5, // 少し見上げる高さに
      -Math.cos(rad) * config.radius
    );

    const item = {
      // ── メタ情報（PHOTO_DATA由来） ──
      id: config.id,
      type: config.type,
      src: config.src,
      depth: config.depth,
      interaction: config.interaction,

      // ── 配置情報 ──
      config,
      position,

      // ── 3Dオブジェクト ──
      mesh: null,
      aura: null,

      // ── 将来のLOD対応用プレースホルダー（未使用） ──
      lowTexture: null,
      highTexture: null,

      // ── アニメーション・状態 ──
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

    // img.onload/onerrorを直書きせず、安全な共通関数を使う
    loadImageSafely(config.src, {
      timeoutMs: 10000,
      onFail: () => {
        // 読み込みに失敗しても他の写真の処理はブロックしない。
        // このアイテムは表示されないだけで、シーン全体は正常に進む。
        item.failed = true;
      },
      onSuccess: (img) => {
        const aspect = img.width / img.height;
        const frameHeight = 4.5 * config.scale;
        const baseWidth = frameHeight * aspect;
        const baseHeight = frameHeight;

        // モバイルではGPUメモリ節約のため、大きすぎる画像を縮小してからテクスチャ化する
        const texSource = getTextureSource(img, MAX_TEX_DIM);
        const tex = new THREE.Texture(texSource);
        tex.needsUpdate = true;
        tex.anisotropy = 1; // モバイルでの負荷軽減

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

        // 色抽出は元のimg（縮小前）から行う（色の精度に影響しないよう維持）
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
  // 将来的に分割する場合 → core/controls.js
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

  // ── クリックで写真に近づく ──
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  let viewingItem = null;
  let approachProgress = 0;
  let approachTarget = 0;
  const cameraHomePos = new THREE.Vector3(0, 0, 0);
  let cameraApproachPos = new THREE.Vector3();

  // ------------------------------------------------------
  // ⑤ 写真クリック時の処理（switch(type)対応）
  // ------------------------------------------------------
  // 将来的にデプスマップ写真・メッセージ機能（letter）・
  // シャボン玉演出（bubble）などタイプごとの挙動を追加する際、
  // ここに case を増やしていくだけで対応できるようにしておく。
  // 現時点ではどのタイプも「通常表示（近づく/離れる）」処理を行う。
  // ------------------------------------------------------
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
  // 将来的に分割する場合 → core/update.js
  // ------------------------------------------------------
  // ④ update()を機能ごとの関数へ分割。
  // 処理内容・実行順序は元のupdate()と完全に同一（挙動を変えないため）。
  // ====================================================================
  let bgUpdateTimer = 0;
  const warmFlareTint = new THREE.Color(0xe0b888);

  // カメラの追従・視点操作（yaw/pitch/ズームイン）
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

  // 写真・オーラの表示切替、浮遊アニメーション、水面/フレア/粒子の表示切替
  function updatePhotos(dt) {
    // 拡大中(十分近づいたら)は水面・太陽フレア・パーティクルを隠す
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

        // ふわふわ上下浮遊
        const floatY = Math.sin(t + item.floatPhase) * 0.25;
        item.mesh.position.y = item.position.y + floatY;
        if (item.aura) item.aura.position.y = item.position.y + floatY;
      });
    }
  }

  // 水面の波紋アニメーション・太陽フレアの回転
  function updateRipple(dt) {
    // ── 水面のアニメーション：常時ゆっくり、視点を動かすと少し強まる ──
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

    // 太陽フレアはゆっくり回転し、360°どの角度にも光が漂っているように見せる
    flareTexture.offset.x = (flareTexture.offset.x + dt * 0.004) % 1;
  }

  // キラキラ光の粒子：漂いながら明滅させる
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

  // 背景グラデーション：現在見ている写真 + 隣接写真の色を混ぜて更新
  function updateBackground(dt) {
    bgUpdateTimer++;
    if (bgUpdateTimer % 3 === 0) {
      const facing = viewingItem || getFacingItem();

      if (facing && facing.loaded) {
        // 完全に写真の色だけで埋めず、最初の綺麗な雰囲気をベース（固定枠）として残す
        const defaultPink = new THREE.Color(0xd68fa8);
        const defaultPurple = new THREE.Color(0xa88fd6);
        const defaultMidnight = new THREE.Color(0x8fa8d6); // 深みのある青

        // 写真から抽出された色
        const fCols = facing.pastelColors;

        // 抽出色とデフォルトの幻想的な色をブレンドしてターゲットを作る
        targetColors = [
          defaultPink.clone().lerp(fCols[0], 0.4),      // ピンク寄りに写真の1色目をブレンド
          fCols[0],
          defaultPurple.clone().lerp(fCols[2], 0.3),    // 中央付近に元の紫のニュアンスを残す
          fCols[2],
          fCols[4],
          defaultMidnight.clone().lerp(fCols[3], 0.4),  // 下層にミッドナイトブルーを混ぜて引き締める
          defaultPink.clone().lerp(fCols[1], 0.3)
        ];
      }

      // 色の遷移速度を少し遅く（0.09 → 0.04）して、急激な変化を抑え滑らかにする
      for (let i = 0; i < currentColors.length; i++) {
        if (!targetColors[i]) continue;
        currentColors[i].lerp(targetColors[i], 0.04);
      }
      drawBackgroundGradient();

      // 波紋と太陽フレアの色も同期
      rippleUniforms.color1.value.copy(currentColors[1]);
      rippleUniforms.color2.value.copy(currentColors[2]);
      rippleUniforms.color3.value.copy(currentColors[3]);
      rippleUniforms.color4.value.copy(currentColors[4]);
      rippleUniforms.color5.value.copy(currentColors[5]);

      const flareTint = currentColors[2].clone().lerp(warmFlareTint, 0.5);
      flareMaterial.color.lerp(flareTint, 0.08);
    }
  }

  // ── update(dt) 本体：各処理を順番に呼び出すだけ ──
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