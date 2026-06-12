import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.157.0/build/three.module.js';

// シーン
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// カメラ
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

camera.position.z = 15;

// レンダラー
const renderer = new THREE.WebGLRenderer({
  canvas: document.querySelector('#canvas'),
  antialias: true
});

renderer.setSize(
  window.innerWidth,
  window.innerHeight
);

renderer.setPixelRatio(
  window.devicePixelRatio
);

// 粒子生成
const particleCount = 1000;

const positions = new Float32Array(
  particleCount * 3
);

for (let i = 0; i < particleCount * 3; i++) {
  positions[i] =
    (Math.random() - 0.5) * 100;
}

const geometry =
  new THREE.BufferGeometry();

geometry.setAttribute(
  'position',
  new THREE.BufferAttribute(
    positions,
    3
  )
);

const material =
  new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.12,
    transparent: true,
    opacity: 0.8
  });

const particles =
  new THREE.Points(
    geometry,
    material
  );

scene.add(particles);
// 記憶の核

const coreCount = 500;

const corePositions =
  new Float32Array(
    coreCount * 3
  );

for (let i = 0; i < coreCount * 3; i++) {

  corePositions[i] =
    (Math.random() - 0.5) * 3;

}

const coreGeometry =
  new THREE.BufferGeometry();

coreGeometry.setAttribute(
  'position',
  new THREE.BufferAttribute(
    corePositions,
    3
  )
);

const coreMaterial =
  new THREE.PointsMaterial({
    color: 0xffe8c8,
    size: 0.35,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

const memoryCore =
  new THREE.Points(
    coreGeometry,
    coreMaterial
  );

scene.add(memoryCore);


// リサイズ対応
window.addEventListener(
  'resize',
  () => {
    camera.aspect =
      window.innerWidth /
      window.innerHeight;

    camera.updateProjectionMatrix();

    renderer.setSize(
      window.innerWidth,
      window.innerHeight
    );
  }
);

// アニメーション
function animate() {
  requestAnimationFrame(animate);

  particles.rotation.y += 0.0005;
  particles.rotation.x += 0.0002;

  memoryCore.rotation.y += 0.002;

  memoryCore.scale.setScalar(
    1 + Math.sin(Date.now() * 0.001) * 0.2
  );

  memoryCore.position.y =
    Math.sin(Date.now() * 0.0005) * 0.5;

  renderer.render(scene, camera);
}
animate();