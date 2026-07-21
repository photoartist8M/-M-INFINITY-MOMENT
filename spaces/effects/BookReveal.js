import * as THREE from 'three';

// ======================================================
// BookReveal.js — 高級ハードカバー写真集
// ======================================================
export class BookReveal {
  constructor(scene, camera, options = {}) {
    this.scene   = scene;
    this.camera  = camera;
    this.options = options;

    // サイズ定数
    this.W  = 2.6;    // 表紙の幅
    this.H  = 3.4;    // 高さ
    this.D  = 0.30;   // 本の厚み
    this.CT = 0.055;  // 表紙板厚

    this.bookGroup  = null;
    this.coverPivot = null;
    this._phase     = 'idle';
    this._phaseT    = 0;
    this._visible   = false;
    this._lastFY    = 0;

    this._build();
  }

  // ============================================================
  // ジオメトリ構築
  // ============================================================
  _build() {
    const { W, H, D, CT } = this;
    this.bookGroup = new THREE.Group();
    this.bookGroup.visible = false;
    this.scene.add(this.bookGroup);

    // ── 背表紙 ─────────────────────────────────────────────
    const backMat = new THREE.MeshStandardMaterial({ color: 0x0d0b09, roughness: 0.7 });
    const back    = new THREE.Mesh(new THREE.BoxGeometry(W, H, CT), backMat);
    back.position.set(0, 0, -D / 2 + CT / 2);
    this.bookGroup.add(back);

    // ── 背表紙（スパイン）──────────────────────────────────
    const spineMat = new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.6 });
    const spine    = new THREE.Mesh(new THREE.BoxGeometry(CT, H, D), spineMat);
    spine.position.set(-W / 2, 0, 0); // 本の左端に配置
    this.bookGroup.add(spine);

    // ── ページ束 ────────────────────────────────────────────
    const pageMats = [
      new THREE.MeshStandardMaterial({ color: 0xf5f0e8, roughness: 0.9 }), // 右（小口）
      new THREE.MeshStandardMaterial({ color: 0xe0dbd0, roughness: 0.9 }), // 左
      new THREE.MeshStandardMaterial({ color: 0xf0ebe0, roughness: 0.88 }), // 上
      new THREE.MeshStandardMaterial({ color: 0xeae5da, roughness: 0.88 }), // 下
      new THREE.MeshStandardMaterial({ color: 0xf8f4ec, roughness: 0.85 }), // 前
      new THREE.MeshStandardMaterial({ color: 0xe0dbd0, roughness: 0.9 }),  // 後
    ];
    const pages = new THREE.Mesh(
      new THREE.BoxGeometry(W - 0.08, H - 0.07, D - CT * 2.2),
      pageMats
    );
    pages.position.set(0, 0, 0);
    this.bookGroup.add(pages);

    // ページ小口ライン
    const lineCount = 22;
    for (let i = 0; i < lineCount; i++) {
      const y   = -H / 2 + (H / lineCount) * (i + 0.5);
      const geo = new THREE.BoxGeometry(W - 0.12, 0.005, D - CT * 2.4);
      const mat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0xc8c0b0 : 0xd8d0c0,
        transparent: true,
        opacity: 0.28,
      });
      const line = new THREE.Mesh(geo, mat);
      line.position.set(0, y, 0);
      this.bookGroup.add(line);
    }

    // ── 表紙（coverPivot = 背表紙軸で回転）─────────────────
    this.coverPivot = new THREE.Group();
    this.coverPivot.position.set(-W / 2, 0, 0); // 背表紙軸
    this.bookGroup.add(this.coverPivot);

    // 表紙板（pivotローカル座標：右にW/2、前に出す）
    const frontMat = new THREE.MeshStandardMaterial({
      color: 0x100d0b,
      roughness: 0.62,
      side: THREE.DoubleSide,
    });
    this._frontMesh = new THREE.Mesh(new THREE.BoxGeometry(W, H, CT), frontMat);
    this._frontMesh.position.set(W / 2, 0, D / 2 - CT / 2);
    this.coverPivot.add(this._frontMesh);

    // ゴールドエッジ発光
    this._edgeMat = new THREE.MeshBasicMaterial({
      color: 0xd4aa55,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const edgeMesh = new THREE.Mesh(
      new THREE.BoxGeometry(W + 0.02, H + 0.02, CT + 0.01),
      this._edgeMat
    );
    edgeMesh.position.copy(this._frontMesh.position);
    this.coverPivot.add(edgeMesh);

    // 表紙コンテンツ（写真＋タイトル）
    this._applyFrontCover();

    this.coverPivot.rotation.y = 0;
  }

  // ============================================================
  // 表紙コンテンツ
  // ============================================================
  _applyFrontCover() {
    const { W, H, CT } = this;
    const z = CT / 2 + 0.006; // 表面より少し前

    // ① photo1.jpg を専用ロード（cover用）─────────────────
    const coverSrc = this.options.coverSrc || 'assets/photo1.jpg';
    const img = new Image();
    img.onload = () => {
      const tex = new THREE.Texture(img);
      tex.needsUpdate = true;
      const geo = new THREE.PlaneGeometry(W * 0.80, H * 0.68);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.90 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, H * 0.06, z);
      this._frontMesh.add(mesh);
    };
    img.src = coverSrc;

    // ② タイトル「emotional」──────────────────────────────
    const titleTex = this._makeTitleTex();
    const titleMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 0.70, H * 0.11),
      new THREE.MeshBasicMaterial({ map: titleTex, transparent: true, opacity: 0.95 })
    );
    titleMesh.position.set(0, -H * 0.41, z);
    this._frontMesh.add(titleMesh);

    // ③ 装飾ライン（ゴールド）────────────────────────────
    const lineMat = new THREE.MeshBasicMaterial({
      color: 0xc8a050, transparent: true, opacity: 0.60,
    });
    [-0.36, 0.36].forEach(yFrac => {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.68, 0.011), lineMat);
      line.position.set(0, H * yFrac, z);
      this._frontMesh.add(line);
    });
  }

  _makeTitleTex() {
    const w = 512, h = 100;
    const cnv = document.createElement('canvas');
    cnv.width = w; cnv.height = h;
    const ctx = cnv.getContext('2d');

    // ゴールドグラデーション文字
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0,   '#f0dfa0');
    grad.addColorStop(0.5, '#faf0c8');
    grad.addColorStop(1,   '#c8a050');
    ctx.fillStyle = grad;
    ctx.font = `italic 54px 'Cormorant Garamond', 'Georgia', serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('emotional', w / 2, h / 2);

    const tex = new THREE.CanvasTexture(cnv);
    tex.needsUpdate = true;
    return tex;
  }

  // ============================================================
  // ライト
  // ============================================================
  _addLights() {
    this._keyL = new THREE.PointLight(0xfff5e0, 3.5, 14);
    this._keyL.position.set(4, 5, 7);
    this.bookGroup.add(this._keyL);

    this._fillL = new THREE.PointLight(0xc8d8ff, 1.0, 10);
    this._fillL.position.set(-3, -2, 4);
    this.bookGroup.add(this._fillL);
  }

  _removeLights() {
    [this._keyL, this._fillL].forEach(l => {
      if (l) this.bookGroup.remove(l);
    });
    this._keyL = this._fillL = null;
  }

  // ============================================================
  // 公開 API
  // ============================================================
  open(position, onComplete) {
    if (this._visible) return;
    this._visible    = true;
    this._onComplete = onComplete;
    this._phase      = 'appearing';
    this._phaseT     = 0;
    this._lastFY     = 0;

    this.coverPivot.rotation.y = 0;
    this.bookGroup.scale.setScalar(0.01);
    this.bookGroup.position.copy(position);
    this.bookGroup.visible = true;
    this._addLights();
  }

  close(onDone) {
    if (!this._visible) { onDone?.(); return; }
    this._phase   = 'closing';
    this._phaseT  = 0;
    this._onClose = onDone;
  }

  // ============================================================
  // 毎フレーム更新
  // ============================================================
  update(dt) {
    if (!this._visible || !this.bookGroup) return;

// 表紙をカメラ方向へ向ける
const cam  = this.camera.position;
const bPos = this.bookGroup.position;

// 左右
this.bookGroup.rotation.y =
    Math.atan2(cam.x - bPos.x, cam.z - bPos.z);

// ★追加：少しだけカメラ側へ傾ける
this.bookGroup.rotation.x = THREE.MathUtils.degToRad(30);

    this._phaseT += dt;

    switch (this._phase) {

      // ── 出現：スケールアップ（バネ感）───────────────────
      case 'appearing': {
        const p = Math.min(1, this._phaseT / 1.2);
        this.bookGroup.scale.setScalar(this._easeOutBack(p));
        if (this._edgeMat) this._edgeMat.opacity = p * 0.10;
        if (p >= 1) { this._phase = 'hold'; this._phaseT = 0; }
        break;
      }

      // ── 静止：余韻 ──────────────────────────────────────
      case 'hold': {
        if (this._phaseT >= 0.7) { this._phase = 'opening'; this._phaseT = 0; }
        break;
      }

      // ── 開く：表紙を手前（カメラ側）に22°だけ開く ──────
      case 'opening': {
        const maxAngle = THREE.MathUtils.degToRad(22);
        const p        = Math.min(1, this._phaseT / 2.8);
        const eased    = this._easeInOutCubic(p);

        // 正のY回転 = 背表紙軸を中心に表紙がカメラ方向に開く
        this.coverPivot.rotation.y = -maxAngle * eased;

        if (this._edgeMat) this._edgeMat.opacity = 0.10 + eased * 0.22;

        if (p >= 1) {
          this._phase  = 'done';
          this._phaseT = 0;
          setTimeout(() => this._onComplete?.(), 700);
        }
        break;
      }

      // ── 完了：静かに浮遊 ─────────────────────────────────
      case 'done': {
        const fy = Math.sin(this._phaseT * 0.55) * 0.05;
        this.bookGroup.position.y += fy - this._lastFY;
        this._lastFY = fy;
        if (this._edgeMat) {
          this._edgeMat.opacity = 0.18 + Math.sin(this._phaseT * 1.1) * 0.07;
        }
        break;
      }

      // ── 閉じる：スケールダウン ────────────────────────────
      case 'closing': {
        const p = Math.min(1, this._phaseT / 0.9);
        this.bookGroup.scale.setScalar(Math.max(0.001, 1 - this._easeInCubic(p)));
        if (p >= 1) {
          this.bookGroup.visible = false;
          this.bookGroup.scale.setScalar(0.001);
          this.coverPivot.rotation.y = 0;
          this._visible = false;
          this._phase   = 'idle';
          this._removeLights();
          this._onClose?.();
        }
        break;
      }
    }
  }

  // ============================================================
  // イージング
  // ============================================================
  _easeOutBack(t) {
    const c = 1.70158 + 1;
    return 1 + c * Math.pow(t - 1, 3) + (c - 1) * Math.pow(t - 1, 2);
  }
  _easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  _easeInCubic(t) { return t * t * t; }

  // ============================================================
  // 破棄
  // ============================================================
  dispose() {
    this._removeBookLights();
    if (this.bookGroup) {
      this.scene.remove(this.bookGroup);
      this.bookGroup.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      this.bookGroup = null;
    }
  }
}