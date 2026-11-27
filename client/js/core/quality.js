// client/js/core/quality.js
// Calidad de render del cliente: configuración del WebGLRenderer (pixelRatio acotado, sRGB, sombras suaves) y
// precalentamiento progresivo de la GPU (shaders + subida de geometrías) para evitar congelones.

import * as THREE from 'three';

/** Tope de pixelRatio: por encima de 1.5 el coste de fill-rate no compensa la nitidez. */
export const MAX_PIXEL_RATIO = 1.5;

/**
 * Crea el renderer principal y lo inserta en el contenedor.
 * @param {HTMLElement} container
 * @returns {THREE.WebGLRenderer}
 */
export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  return renderer;
}

/**
 * @param {object} deps
 * @param {THREE.WebGLRenderer} deps.renderer
 * @param {THREE.Scene} deps.scene
 * @param {THREE.Camera} deps.camera
 * @param {object} deps.localPlayer LocalPlayerController (escena/cámara del arma en primera persona)
 * @param {object} deps.world VoxelWorld (grupos de terreno, estructuras, vegetación, botín y fauna)
 */
export function createGpuWarmUp({ renderer, scene, camera, localPlayer, world }) {
  // Prepara la GPU antes de que algo se vea, para que no se congele el juego la primera vez que se
  // dibuja algo (al saltar del avión se congelaba ~0.8-1 s y al abrir el paracaídas ~0.2 s):
  //  1) warmUpGpu(): compila los shaders de todos los objetos, también de los ocultos (paracaídas,
  //     armas en primera persona). renderer.compile no sube geometría y tarda ~0.1-0.3 s.
  //  2) queueMapWarmUp(): las geometrías del mapa (terreno, estructuras, vegetación), el botín y la
  //     fauna, que desde la cabina del avión no se ven (o están ocultos por distancia), se suben a la
  //     GPU de a pocas por fotograma: en cada fotograma unas cuantas piezas se dibujan aunque estén
  //     fuera de cámara o lejos (quedan recortadas, no se ven). El ritmo se adapta al tiempo de cada
  //     fotograma; en el avión suele terminar en ~1-2 s, en vez de un congelón al saltar.
  // Ritmo adaptativo: si el fotograma va holgado se suben más piezas, si va justo menos
  const WARM_MIN_PER_FRAME = 6;
  const WARM_MAX_PER_FRAME = 48;
  const WARM_TARGET_FRAME_MS = 14;
  let warmPerFrame = 12;
  let warmQueue = [];
  const warmBatch = [];
  const warmForcedVisible = [];

  function warmUpGpu() {
    for (const [s, cam] of [[scene, camera], [localPlayer.fpRig?.scene, localPlayer.fpRig?.camera]]) {
      if (s && cam) renderer.compile(s, cam);
    }
  }

  const isDrawable = (o) => o.isMesh || o.isLine || o.isPoints || o.isSprite;

  function queueMapWarmUp() {
    warmQueue = [];
    // Primero (al final de la cola) botín y fauna: son lo que aparece de golpe cerca del aterrizaje
    for (const group of [world.lootGroup, world.wildlifeGroup]) {
      group.traverse((o) => {
        if (isDrawable(o) && o.visible) warmQueue.push(o);
      });
    }
    for (const group of [world.terrainGroup, world.structuresGroup, world.foliageGroup]) {
      group.traverseVisible((o) => {
        if (isDrawable(o) && o.frustumCulled) warmQueue.push(o);
      });
    }
  }

  function beginWarmBatch() {
    warmBatch.length = 0;
    warmForcedVisible.length = 0;
    // warmBatch guarda pares [objeto, frustumCulled previo]
    while (warmBatch.length < warmPerFrame * 2 && warmQueue.length > 0) {
      const o = warmQueue.pop();
      if (!o.parent) continue; // ya no está en la escena
      // Dibujarlo este fotograma aunque esté oculto por distancia (p. ej. botín lejano)
      for (let a = o.parent; a && !a.isScene; a = a.parent) {
        if (!a.visible) {
          a.visible = true;
          warmForcedVisible.push(a);
        }
      }
      warmBatch.push(o, o.frustumCulled);
      o.frustumCulled = false;
    }
  }

  function adaptWarmRate(frameMs) {
    if (frameMs < WARM_TARGET_FRAME_MS * 0.75) warmPerFrame = Math.min(WARM_MAX_PER_FRAME, Math.ceil(warmPerFrame * 1.4));
    else if (frameMs > WARM_TARGET_FRAME_MS) warmPerFrame = Math.max(WARM_MIN_PER_FRAME, Math.floor(warmPerFrame * 0.7));
  }

  function endWarmBatch() {
    for (let i = 0; i < warmBatch.length; i += 2) warmBatch[i].frustumCulled = warmBatch[i + 1];
    for (let i = 0; i < warmForcedVisible.length; i++) warmForcedVisible[i].visible = false;
    warmBatch.length = 0;
    warmForcedVisible.length = 0;
  }

  return {
    warmUpGpu,
    queueMapWarmUp,
    beginWarmBatch,
    adaptWarmRate,
    endWarmBatch,
    /** true mientras quedan piezas del mapa por subir a la GPU */
    isPending: () => warmQueue.length > 0
  };
}
