// portal.js
// ======================================================
// Portal(RenderTarget)方式：main.js の裂け目から
// exhibitionspace.js の空間を覗かせ、最終的に完全移行する
// ======================================================
import * as THREE from 'three';
import { fadeVolume, openingBGM, mainBGM, space2BGM, playSFX, sakemeSFX, starSFX } from "./spaces/audio.js";
import { startExhibitionSpace } from './spaces/exhibitionSpace.js';
let renderTarget = null;
let exhibitionCamera = null;
let exhibitionScene = null;
let exhibitionUpdate = null;
let exhibitionInstance = null;
let portalPlaneRef = null;
let renderer = null;
let state = 'idle'; // idle -> loading -> ready -> switched
const clock = new THREE.Clock();
let started = false;

// ------------------------------------------------------
// スマホ軽量化：RenderTargetは画面解像度そのものではなく縮小して確保
// ------------------------------------------------------
function calcRTSize() {
  const scale = window.innerWidth < 900 ? 0.5 : 0.7;
  const w = Math.max(2, Math.floor(window.innerWidth * scale));
  const h = Math.max(2, Math.floor(window.innerHeight * scale));
  return { w, h };
}

function makeRenderTarget() {
  const { w, h } = calcRTSize();
  return new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    generateMipmaps: false,
    depthBuffer: true,
    stencilBuffer: false,
  });
}

/**
 * main.js の裂け目(Door)生成直後に1回だけ呼ぶ初期化関数。
 * exhibitionspace.js はここで1回だけ startExhibitionSpace() される
 * （内部でDOMイベントを登録する設計のため、二重初期化は絶対禁止）。
 */
export function initPortal(threeRenderer, portalPlane) {
  if (started) return; // 二重初期化ガード
  started = true;

  renderer = threeRenderer;
  portalPlaneRef = portalPlane;

  exhibitionCamera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );

  renderTarget = makeRenderTarget();

  const result = startExhibitionSpace(renderer, exhibitionCamera);
  exhibitionInstance = result; // ★追加：hideUIやactivateIntroも含めてまるごと保持
  exhibitionScene = result.scene;
  exhibitionUpdate = result.update;

  if (portalPlaneRef && portalPlaneRef.material && portalPlaneRef.material.uniforms.uPortalTex) {
    portalPlaneRef.material.uniforms.uPortalTex.value = renderTarget.texture;
  }

  state = 'loading';
}

/**
 * main.js の animate() ループ内で毎フレーム呼ぶ。
 * exhibitionScene を RenderTarget へ描画し、裂け目メッシュへ供給する。
 */
export function updatePortal() {
  if (!started || state === 'switched' || !renderTarget) return;

  const delta = clock.getDelta();
  exhibitionUpdate(delta);

  renderer.setRenderTarget(renderTarget);
  renderer.clear();
  renderer.render(exhibitionScene, exhibitionCamera);
  renderer.setRenderTarget(null);

  state = 'ready';
}

/**
 * ポータルが画面いっぱいに拡大しきった時に main.js から呼ぶ。
 * RenderTarget(中間バッファ)を破棄してGPUメモリを解放する。
 * exhibitionScene 自体はこの後 main.js が直接描画するため保持したまま返す。
 */
export function completePortalSwitch() {
  if (state === 'switched') return;
  state = 'switched';

  if (renderTarget) {
    renderTarget.dispose();
    renderTarget = null;
  }

  // portalPlane側の参照も外す（portalPlane自体はmain.js側で破棄される）
  if (portalPlaneRef && portalPlaneRef.material && portalPlaneRef.material.uniforms.uPortalTex) {
    portalPlaneRef.material.uniforms.uPortalTex.value = null;
  }
  portalPlaneRef = null;
}

export function getPortalState() {
  return state;
}

/**
 * 完全遷移後、main.js の animate() が exhibitionScene を
 * 直接描画するために使う。
 */
export function getExhibition() {
  return {
    scene: exhibitionScene,
    camera: exhibitionCamera,
    update: exhibitionUpdate,
    activateIntro: exhibitionInstance ? exhibitionInstance.activateIntro : undefined, // ★追加
    hideUI: exhibitionInstance ? exhibitionInstance.hideUI : undefined, // ★追加(将来Portal切替時に使う用)
  };
}

/**
 * main.js のリサイズハンドラから呼ぶ。
 */
export function resizePortal() {
  if (exhibitionCamera) {
    exhibitionCamera.aspect = window.innerWidth / window.innerHeight;
    exhibitionCamera.updateProjectionMatrix();
  }
  if (!renderTarget) return;
  const { w, h } = calcRTSize();
  renderTarget.setSize(w, h);
}