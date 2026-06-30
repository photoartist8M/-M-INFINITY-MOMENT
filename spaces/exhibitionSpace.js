import * as THREE from 'three';

let exhibitionScene;
let exhibitionGroup;

let ambientLight;
let mainLight;

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

    camera.rotation.set(0,0,0);

    exhibitionGroup = new THREE.Group();

    exhibitionScene.add(exhibitionGroup);

    createLights();

    return {

        scene: exhibitionScene,

        update(dt){

            updateEnvironment(dt);

        }

    };

}

function createLights(){

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

    const fill =
        new THREE.PointLight(
            0xddeeff,
            2,
            80
        );

    fill.position.set(
        0,
        -5,
        0
    );

    exhibitionScene.add(fill);

}
function updateEnvironment(dt){

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