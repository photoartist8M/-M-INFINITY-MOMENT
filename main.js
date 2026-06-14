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

// ----------------------------
// 光粒子テクスチャ
// ----------------------------

const canvas = document.createElement('canvas');
canvas.width = 128;
canvas.height = 128;

const ctx = canvas.getContext('2d');

const gradient = ctx.createRadialGradient(
  64,
  64,
  0,
  64,
  64,
  64
);

gradient.addColorStop(
  0,
  'rgba(255,255,255,1)'
);

gradient.addColorStop(
  0.2,
  'rgba(255,245,220,0.8)'
);

gradient.addColorStop(
  0.5,
  'rgba(255,230,180,0.3)'
);

gradient.addColorStop(
  1,
  'rgba(255,255,255,0)'
);

ctx.fillStyle = gradient;
ctx.fillRect(
  0,
  0,
  128,
  128
);

const particleTexture =
  new THREE.CanvasTexture(canvas);

// ----------------------------
// 背景粒子
// ----------------------------

const particleCount = 1000;

const positions =
  new Float32Array(
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
    map: particleTexture,
    color: 0xffffff,
    size: 0.4,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

const particles =
  new THREE.Points(
    geometry,
    material
  );

scene.add(particles);

// ----------------------------
// 記憶の核
// ----------------------------

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
    map: particleTexture,
    color: 0xffe8c8,
    size: 0.8,
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
const textureLoader =
  new THREE.TextureLoader();

const photoTexture =
  textureLoader.load(
    './assets/photo1.jpg'
  );

photoTexture.generateMipmaps = true;

photoTexture.minFilter =
  THREE.LinearMipmapLinearFilter;

photoTexture.magFilter =
  THREE.LinearFilter;

photoTexture.anisotropy =
  renderer.capabilities.getMaxAnisotropy();

const photoGeometry =
  new THREE.PlaneGeometry(
    10,
    14
  );

const photoMaterial =
  new THREE.MeshBasicMaterial({
    map: photoTexture,
    transparent: true,
    opacity: 1
  });

const photo =
  new THREE.Mesh(
    photoGeometry,
    photoMaterial
  );

photo.position.set(
  0,
  0,
  3
);

scene.add(photo);

// ----------------------------
// リサイズ対応
// ----------------------------

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

// ----------------------------
// アニメーション
// ----------------------------

function animate() {

  requestAnimationFrame(
    animate
  );

  particles.rotation.y +=
    0.0005;

  particles.rotation.x +=
    0.0002;

  memoryCore.rotation.y +=
    0.002;

  memoryCore.scale.setScalar(
    1 +
    Math.sin(
      Date.now() * 0.001
    ) * 0.2
  );

  memoryCore.position.y =
    Math.sin(
      Date.now() * 0.0005
    ) * 0.5;

    photo.position.y =
  Math.sin(Date.now() * 0.001) * 0.4;

  
    photo.lookAt(
  camera.position
);

  renderer.render(
    scene,
    camera
  );

}

animate();