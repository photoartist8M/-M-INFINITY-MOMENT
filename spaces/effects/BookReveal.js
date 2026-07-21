import * as THREE from 'three';

// ============================================================================
// BookReveal.js
// ----------------------------------------------------------------------------
// 星オブジェクト吸収後の「本が出現し、ページがめくれ、メッセージが浮かぶ」演出。
//
// パフォーマンス方針（すべて厳守）：
//  - ページは全枚数を生成しない。左右の「ページ束」はブロック(BoxGeometry)2個のみ。
//  - 頂点変形するのは「今めくっている1枚」だけ。それ以外は静的。
//  - PlaneGeometryの分割は32×24。
//  - MeshPhysicalMaterialは不使用。表紙/ページ束はMeshLambertMaterial
//    （＝既存シーンのAmbientLight/DirectionalLightにだけ反応。新規ライト無し）。
//    めくり中の1枚だけ、頂点変形が必要なためカスタムShaderMaterial。
//  - 光漏れはSprite（共有の1テクスチャを使い回す）。PointLightは使わない。
//  - EffectComposer/BloomPassはこのクラスの中では一切生成しない。
//    既存のBloomがあれば、明るい色（ほぼ白に近いパステル）が自然に拾われる想定。
//  - パーティクルはTHREE.Points 1個・最大10点の使い回し（生成/破棄をしない）。
//  - 本体（表紙・ページ束・アクティブページ）はopen()時に一度だけ生成し、
//    以降はscale/visibleの切り替えのみで使い回す（GC・再生成コストを避ける）。
// ============================================================================

const DEFAULTS = {
  pageWidth: 1.2,
  pageHeight: 0.85,
  pageThickness: 0.012,     // 1ページあたりの厚み(ワールド単位)。左右ページ束の伸縮に使う
  curl: 0.6,                // 0〜1: S字の強さ
  flipSeconds: 1.2,         // 1ページをめくるのにかかる秒数
  flipGapSeconds: 0.55,     // 次のページがめくれ始めるまでの間隔（パラパラ感）
  segmentsX: 32,
  segmentsY: 24,
  tintColors: [0x9fd0ff, 0xffb27a, 0xffe2a6], // 光漏れ・パーティクルの色（写真ごと）
  coverColor: 0x14322c,
  coverAccentColor: 0xe8b96a,
  paperColor: 0xf3e6c8,
  maxParticles: 10,
};

// -------------------- 使い回すヘルパー：軽量な共有テクスチャ生成 --------------------
function makeRadialGlowTexture() {
  const size = 64;
  const cnv = document.createElement('canvas');
  cnv.width = size; cnv.height = size;
  const ctx = cnv.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cnv);
  tex.needsUpdate = true;
  return tex;
}

// 表紙の金箔グリフ（"Ⅰ・Ⅱ・Ⅲ"風）を1枚だけ焼いたテクスチャ
function makeCoverGlyphTexture() {
  const w = 256, h = 96;
  const cnv = document.createElement('canvas');
  cnv.width = w; cnv.height = h;
  const ctx = cnv.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(232,185,106,0.95)';
  ctx.font = '32px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Ⅰ ・ Ⅱ ・ Ⅲ', w / 2, h / 2);
  return new THREE.CanvasTexture(cnv);
}

// ページ束の小口（切り口）を表現する縞テクスチャ
function makePageEdgeTexture() {
  const w = 8, h = 64;
  const cnv = document.createElement('canvas');
  cnv.width = w; cnv.height = h;
  const ctx = cnv.getContext('2d');
  for (let y = 0; y < h; y++) {
    ctx.fillStyle = (y % 2 === 0) ? '#efe1c2' : '#d8c69c';
    ctx.fillRect(0, y, w, 1);
  }
  const tex = new THREE.CanvasTexture(cnv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// -------------------- ページ用シェーダー（頂点変形はこの1枚だけに使う） --------------------
const PAGE_VERTEX_SHADER = `
  uniform float uProgress;   // 0〜1: このページのめくれ進捗
  uniform float uCurl;       // 0〜1: S字の強さ
  uniform float uPageWidth;

  varying vec2 vUv;
  varying vec3 vNormalW;

  void main() {
    vUv = uv;

    // f: スパイン(綴じ目, x=0)を0、自由端(x=1)を1とする位置パラメータ
    float f = uv.x;

    // 基本の回転角（f・進捗に比例）＋ S字の波（sin(2πf)）
    float theta = f * uProgress * 3.14159265 +
                  uCurl * sin(uProgress * 3.14159265) * 0.9 * sin(6.2831853 * f);

    // 半径r: このrで円弧を描くように曲げる（rが小さいほどきつく巻く）
    float r = uPageWidth / 3.14159265;

    vec3 pos = position;
    float localX = pos.x; // -halfWidth(spine側) 〜 +halfWidth(自由端側) の元のローカルX
    // ローカルXの大きさ自体はUVから導いたfで代替し、実座標は円弧に沿って再構築する
    float bentX = r * sin(theta);
    float bentZ = r * (1.0 - cos(theta));

    // 元のX方向の伸びをbentX/bentZに置き換え、Y(ページの高さ方向)はそのまま
    pos.x = bentX;
    pos.z = bentZ;

    // 法線もざっくり回転させる（曲げた分だけ面が傾く）
    vec3 n = normal;
    float c = cos(theta), s = sin(theta);
    vNormalW = normalize((modelMatrix * vec4(n.x * c - n.z * s, n.y, n.x * s + n.z * c, 0.0)).xyz);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const PAGE_FRAGMENT_SHADER = `
  uniform sampler2D uPhoto;
  uniform vec3 uPaperColor;
  uniform float uSheenPos;   // -1〜2程度: ハイライトの帯の位置
  uniform vec3 uLightDir;    // 固定の簡易ライト方向（新規Lightは使わずコスト0で陰影を付ける）

  varying vec2 vUv;
  varying vec3 vNormalW;

  void main() {
    // ⑪ 余白付きレイアウト：写真は中央だけに配置し、外周は紙の色
    vec2 inset = vec2(0.08, 0.10);
    vec2 photoUv = (vUv - inset) / (1.0 - inset * 2.0);
    bool insidePhoto = all(greaterThanEqual(photoUv, vec2(0.0))) && all(lessThanEqual(photoUv, vec2(1.0)));

    vec3 base = uPaperColor;

    // ⑤ 紙目（安価な手続きノイズ。テクスチャ追加なし）
    float grain = fract(sin(dot(vUv * vec2(400.0, 900.0), vec2(12.9898, 78.233))) * 43758.5453);
    base *= 1.0 - grain * 0.03;

    if (insidePhoto) {
      vec4 photo = texture2D(uPhoto, photoUv);
      base = mix(base, photo.rgb, photo.a);
    }

    // 簡易ライティング（既存シーンのライトには依存しない固定方向）
    float diff = clamp(dot(normalize(vNormalW), normalize(uLightDir)), 0.35, 1.0);
    base *= diff;

    // ④ ハイライトが中央をスーッと流れる
    float sheen = smoothstep(0.12, 0.0, abs(vUv.x - uSheenPos));
    base += sheen * 0.5;

    gl_FragColor = vec4(base, 1.0);
  }
`;

export class BookReveal {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera  (直接は動かさない。将来の拡張用に保持)
   * @param {Object} options
   * @param {THREE.Texture[]} options.photoTextures  ページに使う写真（既にロード済みのテクスチャ）
   * @param {number[]} [options.tintColors] 写真ごとの光漏れ色（16進数）
   */
  constructor(scene, camera, options = {}) {
    this.scene = scene;
    this.camera = camera;
    this.opts = { ...DEFAULTS, ...options };

    this.photoTextures = options.photoTextures || [];
    this.pageCount = Math.max(1, this.photoTextures.length);
    this.tintColors = options.tintColors || this.opts.tintColors;

    this.group = new THREE.Group();
    this.group.visible = false;
    this.scene.add(this.group);

    this._sharedGlowTex = makeRadialGlowTexture();

    this._buildCover();
    this._buildStacks();
    this._buildActivePage();
    this._buildLightLeak();
    this._buildParticles();

    // ---- 状態 ----
    this.state = 'idle';       // idle | opening | closing
    this.turnedCount = 0;      // めくり終わったページ数（左束の厚みに反映）
    this._dir = 1;             // 1=開く方向, -1=閉じる方向
    this._flipIndex = 0;
    this._flipStartTime = 0;
    this._nextFlipTime = 0;
    this._onComplete = null;
    this._clock = 0;
  }

  // ==========================================================================
  // 生成（open()より前、コンストラクタで1回だけ）
  // ==========================================================================
  _buildCover() {
    const w = this.opts.pageWidth * 1.08, h = this.opts.pageHeight * 1.08, d = this.opts.pageThickness * (this.pageCount + 2);
    const geo = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: this.opts.coverColor });
    this.coverMesh = new THREE.Mesh(geo, mat);
    this.coverMesh.position.z = -d / 2;
    this.group.add(this.coverMesh);

    // 金箔グリフ（表紙前面に薄いPlaneとして重ねるだけ。ジオメトリ追加コスト極小）
    const glyphTex = makeCoverGlyphTexture();
    const glyphMat = new THREE.MeshBasicMaterial({ map: glyphTex, transparent: true, depthWrite: false });
    const glyphGeo = new THREE.PlaneGeometry(w * 0.6, h * 0.22);
    this.coverGlyph = new THREE.Mesh(glyphGeo, glyphMat);
    this.coverGlyph.position.set(0, 0, 0.002);
    this.coverMesh.add(this.coverGlyph);
  }

  _buildStacks() {
    const edgeTex = makePageEdgeTexture();
    const h = this.opts.pageHeight * 0.94;
    const matL = new THREE.MeshLambertMaterial({ map: edgeTex });
    const matR = matL; // 同一マテリアルを使い回す（ドローコール削減）

    // 左束（めくり終わったページ）・右束（残りのページ）
    this.stackLeft = new THREE.Mesh(new THREE.BoxGeometry(0.001, h, this.opts.pageThickness), matL);
    this.stackRight = new THREE.Mesh(new THREE.BoxGeometry(0.001, h, this.opts.pageThickness), matR);
    this.group.add(this.stackLeft, this.stackRight);
    this._updateStacks(0);
  }

  _buildActivePage() {
    const geo = new THREE.PlaneGeometry(
      this.opts.pageWidth, this.opts.pageHeight,
      this.opts.segmentsX, this.opts.segmentsY
    );
    // UV.x=0をスパイン(綴じ目)側にしておく（シェーダー側のfと一致させる）
    geo.translate(this.opts.pageWidth / 2, 0, 0); // ローカル原点をスパインに合わせる

    this._pageUniforms = {
      uProgress: { value: 0 },
      uCurl: { value: this.opts.curl },
      uPageWidth: { value: this.opts.pageWidth },
      uPhoto: { value: this.photoTextures[0] || null },
      uPaperColor: { value: new THREE.Color(this.opts.paperColor) },
      uSheenPos: { value: -1 },
      uLightDir: { value: new THREE.Vector3(0.4, 0.6, 0.7) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this._pageUniforms,
      vertexShader: PAGE_VERTEX_SHADER,
      fragmentShader: PAGE_FRAGMENT_SHADER,
      side: THREE.DoubleSide,
    });
    this.activePage = new THREE.Mesh(geo, mat);
    this.activePage.visible = false;
    this.group.add(this.activePage);
  }

  _buildLightLeak() {
    const mat = new THREE.SpriteMaterial({
      map: this._sharedGlowTex,
      color: new THREE.Color(this.tintColors[0] || 0xffffff),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.lightLeak = new THREE.Sprite(mat);
    this.lightLeak.scale.set(0.35, 0.35, 1);
    this.group.add(this.lightLeak);
  }

  // パーティクル：THREE.Points 1個、最大10点。生成/破棄はopen/close中も一切行わない
  _buildParticles() {
    const N = this.opts.maxParticles;
    const positions = new Float32Array(N * 3);
    const colors = new Float32Array(N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.035,
      map: this._sharedGlowTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.particles = new THREE.Points(geo, mat);
    this.group.add(this.particles);

    // CPU側の状態（プールを使い回す。配列の再確保はしない）
    this._particlePool = new Array(N).fill(null).map(() => ({
      active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1,
    }));
  }

  _spawnParticle(pos, tint) {
    const slot = this._particlePool.find(p => !p.active);
    if (!slot) return; // プールが満杯なら諦める（上限を超えて増やさない）
    slot.active = true;
    slot.x = pos.x; slot.y = pos.y; slot.z = pos.z;
    const ang = Math.random() * Math.PI * 2;
    const spd = 0.15 + Math.random() * 0.2;
    slot.vx = Math.cos(ang) * spd;
    slot.vy = 0.2 + Math.random() * 0.3;
    slot.vz = Math.sin(ang) * spd;
    slot.life = 0;
    slot.maxLife = 0.6 + Math.random() * 0.6;
    slot.tint = tint;
  }

  _updateParticles(dt) {
    const posAttr = this.particles.geometry.attributes.position;
    const colAttr = this.particles.geometry.attributes.color;
    const tmpColor = new THREE.Color();
    for (let i = 0; i < this._particlePool.length; i++) {
      const p = this._particlePool[i];
      if (!p.active) { posAttr.setXYZ(i, 0, -999, 0); continue; }
      p.life += dt;
      if (p.life >= p.maxLife) { p.active = false; posAttr.setXYZ(i, 0, -999, 0); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vy -= dt * 0.15;
      posAttr.setXYZ(i, p.x, p.y, p.z);
      const t = p.life / p.maxLife;
      const alpha = Math.sin(Math.PI * t);
      tmpColor.set(p.tint || 0xffffff).multiplyScalar(alpha);
      colAttr.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  // ==========================================================================
  // 束の厚み更新（③）：ジオメトリを作り直さず、scale.xだけを変える
  // ==========================================================================
  _updateStacks(partial) {
    const unit = this.opts.pageThickness * 1.4;
    const leftW = Math.max(0.001, unit * (this.turnedCount + partial));
    const rightW = Math.max(0.001, unit * (this.pageCount - this.turnedCount - partial));

    this.stackLeft.scale.x = leftW / 0.001;
    this.stackRight.scale.x = rightW / 0.001;

    const halfCover = this.opts.pageWidth / 2;
    this.stackLeft.position.set(-halfCover * 0.02 - leftW / 2, 0, 0);
    this.stackRight.position.set(halfCover * 0.02 + rightW / 2, 0, 0);
  }

  // ==========================================================================
  // 公開API
  // ==========================================================================

  /**
   * 本を出現させ、全ページをめくって最後にonCompleteを呼ぶ。
   * @param {THREE.Vector3} position 出現させる位置（星がほどけた場所など）
   * @param {Function} [onComplete]
   */
  open(position, onComplete) {
    if (this.state !== 'idle') return;
    this.group.position.copy(position);
    this.group.visible = true;
    this.group.lookAt(this.camera.position);
    this.group.scale.setScalar(0.001);
    this.turnedCount = 0;
    this._updateStacks(0);
    this.activePage.visible = false;

    this.state = 'opening';
    this._dir = 1;
    this._flipIndex = 0;
    this._nextFlipTime = this._clock + 0.35; // 少し間を置いてページめくり開始
    this._growStart = this._clock;
    this._onComplete = onComplete || null;
  }

  /**
   * 出現時と逆再生で本を閉じ、最後に星の位置へ戻す合図としてonCompleteを呼ぶ。
   */
  close(onComplete) {
    if (this.state !== 'idle' && this.state !== 'done') return;
    this.state = 'closing';
    this._dir = -1;
    this._flipIndex = this.pageCount - 1;
    this._nextFlipTime = this._clock;
    this._onComplete = onComplete || null;
  }

  /** 毎フレーム呼び出す（exhibitionSpace.jsのupdate(dt)から呼ぶ想定） */
  update(dt) {
    this._clock += dt;
    if (this.state === 'idle') return;
    this.group.lookAt(this.camera.position);
    // 出現/収納スケールアニメーション
    if (this.state === 'opening') {
      const t = Math.min(1, (this._clock - this._growStart) / 0.7);
      this.group.scale.setScalar(THREE.MathUtils.lerp(0.001, 1, this._easeOutBack(t)));
    } else if (this.state === 'closing' && this.turnedCount === 0 && !this._activeFlip) {
      const t = Math.min(1, (this._clock - (this._shrinkStart || this._clock)) / 0.5);
      if (!this._shrinkStart) this._shrinkStart = this._clock;
      this.group.scale.setScalar(THREE.MathUtils.lerp(1, 0.001, t));
      if (t >= 1) {
        this.group.visible = false;
        this.state = 'idle';
        this._shrinkStart = null;
        const cb = this._onComplete; this._onComplete = null;
        cb && cb();
        return;
      }
    }

    this._updateFlipLogic();
    this._updateParticles(dt);

    // 光漏れの自然な減衰
    if (this.lightLeak.material.opacity > 0 && !this._activeFlip) {
      this.lightLeak.material.opacity = Math.max(0, this.lightLeak.material.opacity - dt * 1.5);
    }
  }

  dispose() {
    this.scene.remove(this.group);
    [this.coverMesh, this.coverGlyph, this.stackLeft, this.stackRight, this.activePage, this.lightLeak, this.particles]
      .forEach(obj => {
        if (!obj) return;
        obj.geometry && obj.geometry.dispose();
        if (obj.material) {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
      });
    this._sharedGlowTex.dispose();
  }

  // ==========================================================================
  // 内部：ページめくりの状態遷移
  // ==========================================================================
  _easeOutBack(t) {
    const c1 = 1.4, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  // ② 重みのあるイージング
  _bookEase(t) {
    return t < 0.5 ? 0.5 * Math.pow(2 * t, 2.4) : 1 - 0.5 * Math.pow(2 * (1 - t), 1.6);
  }

  _updateFlipLogic() {
    const opts = this.opts;

    if (!this._activeFlip && this._clock >= this._nextFlipTime) {
      const hasMorePages = this._dir === 1
        ? this._flipIndex < this.pageCount
        : this._flipIndex >= 0;
      if (hasMorePages) {
        this._startFlip(this._flipIndex);
      } else if (this.state === 'opening') {
        this.state = 'done';
        const cb = this._onComplete; this._onComplete = null;
        cb && cb();
      }
      // closing側で全部戻り終わったら、update()内のshrink処理へ自然に移行する
    }

    if (this._activeFlip) {
      const t = Math.min(1, (this._clock - this._flipStartTime) / opts.flipSeconds);
      const dirEased = this._dir === 1 ? t : 1 - t;
      const eased = this._bookEase(dirEased);
      this._pageUniforms.uProgress.value = eased;
      this._pageUniforms.uSheenPos.value = 1.2 - eased * 2.4;

      this._updateStacks(this._dir === 1 ? eased : 1 - eased);

      // 光漏れ：めくれの中間で最も明るく
      const glow = Math.sin(Math.PI * eased);
      this.lightLeak.material.opacity = glow * 0.8;
      const halfW = opts.pageWidth * 0.5;
      this.lightLeak.position.set(halfW * eased * (this._dir === 1 ? 1 : 1), opts.pageHeight * 0.1, 0.05);

      if (!this._puffed && glow > 0.4) {
        this._puffed = true;
        this._spawnParticle(this.lightLeak.position, this._currentTint);
        this._spawnParticle(this.lightLeak.position, this._currentTint);
      }

      if (t >= 1) {
        this._finishFlip();
      }
    }
  }

  _startFlip(pageIndex) {
    this._activeFlip = true;
    this._puffed = false;
    this._flipStartTime = this._clock;
    this._currentTint = this.tintColors[pageIndex % this.tintColors.length];

    this._pageUniforms.uPhoto.value = this.photoTextures[pageIndex] || null;
    this._pageUniforms.uCurl.value = this.opts.curl;
    this.lightLeak.material.color.set(this._currentTint);
    this.activePage.visible = true;
  }

  _finishFlip() {
    this._activeFlip = false;
    this.activePage.visible = false;

    if (this._dir === 1) {
      this.turnedCount = Math.min(this.pageCount, this.turnedCount + 1);
      this._flipIndex++;
    } else {
      this.turnedCount = Math.max(0, this.turnedCount - 1);
      this._flipIndex--;
    }
    this._updateStacks(0);
    this._nextFlipTime = this._clock + this.opts.flipGapSeconds;

    if (this._dir === -1 && this.turnedCount === 0) {
      // 最後のページも閉じ終わった → update()側のshrinkアニメーションへ
    }
  }
}