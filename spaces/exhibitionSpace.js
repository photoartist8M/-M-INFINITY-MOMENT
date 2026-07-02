import * as THREE from 'three';

let exhibitionScene;
let exhibitionGroup;

let ambientLight;
let mainLight;
let fillLight;

let colorTime = 0;

export function startExhibitionSpace(renderer, camera) {

    exhibitionScene = new THREE.Scene();

    exhibitionScene.background = new THREE.Color(0xfaf9f5);

    exhibitionScene.fog = new THREE.FogExp2(
        0xfaf9f5,
        0.012
    );

    camera.position.set(
        0,
        1.6,
        0
    );

    camera.rotation.set(0, 0, 0);

    exhibitionGroup = new THREE.Group();

    exhibitionScene.add(exhibitionGroup);

    createLights();

    return {

        scene: exhibitionScene,

        update(dt) {

            updateEnvironment(dt);

        },

        // 次の空間へシームレスに切り替える際、この空間が保持している
        // GPUリソース（ジオメトリ・マテリアル・テクスチャ）を明示的に解放する。
        // window.location.href によるページ遷移をやめてリロードなしで
        // 繋ぐ場合は、切り替え時に必ずこれを呼ぶこと。
        dispose() {

            exhibitionScene.traverse((obj) => {

                if (obj.geometry) {
                    obj.geometry.dispose();
                }

                if (obj.material) {
                    const materials = Array.isArray(obj.material)
                        ? obj.material
                        : [obj.material];

                    materials.forEach((mat) => {
                        // マテリアルが保持しているテクスチャ類も個別に破棄
                        Object.keys(mat).forEach((key) => {
                            const value = mat[key];
                            if (value && value.isTexture) {
                                value.dispose();
                            }
                        });
                        mat.dispose();
                    });
                }

            });

            // ライト自体はGPUリソースを持たないが、シーン参照を明示的に切っておく
            exhibitionScene.remove(ambientLight);
            exhibitionScene.remove(mainLight);
            exhibitionScene.remove(fillLight);

            exhibitionScene.clear();

            ambientLight   = null;
            mainLight      = null;
            fillLight      = null;
            exhibitionGroup = null;
            exhibitionScene = null;
        }

    };

}

function createLights() {

    ambientLight =
        new THREE.AmbientLight(
            0xffffff,
            2.8
        );

    exhibitionScene.add(ambientLight);

    mainLight =
        new THREE.PointLight(
            0xfff6e5,
            6,
            60
        );

    mainLight.position.set(
        0,
        8,
        0
    );

    exhibitionScene.add(mainLight);

    fillLight =
        new THREE.PointLight(
            0xddeeff,
            2,
            80
        );

    fillLight.position.set(
        0,
        -5,
        0
    );

    exhibitionScene.add(fillLight);

}

function updateEnvironment(dt) {

    colorTime += dt * 0.05;

    const hue =
        0.03 +
        Math.sin(colorTime) * 0.04;

    const color =
        new THREE.Color();

    color.setHSL(

        hue,

        0.18,

        0.95

    );

    exhibitionScene.background.copy(color);

    exhibitionScene.fog.color.copy(color);

}