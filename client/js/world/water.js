// client/js/world/water.js
// Agua: textura procedural de corriente del río y material de espuma animada por el viento.
// La malla del cauce se construye junto al terreno (terrain.js) porque comparte la misma rejilla de alturas.

import * as THREE from 'three';

export function createRiverFlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, '#0e94b4');
  grad.addColorStop(0.2, '#1cb5d0');
  grad.addColorStop(0.5, '#26cbe3');
  grad.addColorStop(0.8, '#1cb5d0');
  grad.addColorStop(1, '#0e94b4');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Espuma blanca en orillas y vetas dinámicas en el cauce
  ctx.fillStyle = 'rgba(240, 249, 255, 0.55)';
  ctx.fillRect(0, 0, 10, 256);
  ctx.fillRect(246, 0, 10, 256);

  let s = 7719;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < 310; i++) {
    ctx.fillStyle = rand() > 0.30 ? 'rgba(240, 253, 255, 0.38)' : 'rgba(8, 51, 68, 0.20)';
    ctx.fillRect(rand() * 256, rand() * 256, 2 + rand() * 4, 18 + rand() * 56);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 28);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createFoamShaderMaterial(windUniform) {
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.86,
    depthWrite: false
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windUniform;
    shader.vertexShader =
      `uniform float uWindTime;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          float fPhase = instanceMatrix[3][0] * 0.15 + instanceMatrix[3][2] * 0.17;
        #else
          float fPhase = 0.0;
        #endif
        float pulse = 1.0 + sin(uWindTime * 4.2 + fPhase) * 0.14;
        transformed.x *= pulse;
        transformed.z *= pulse;
        `
      );
  };
  return mat;
}
