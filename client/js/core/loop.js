// client/js/core/loop.js
// Bucle de fotogramas del cliente (requestAnimationFrame) con dt acotado.
//
// Paso fijo: la simulación del jugador local NO depende del framerate. LocalPlayerController acumula el dt de
// cada fotograma y avanza la física compartida (shared/physics/playerController.js) en pasos de SIM_DT = 1/60 s,
// los mismos que re-simula el servidor; el render interpola/suaviza entre pasos. Este módulo solo marca el ritmo
// de fotogramas y entrega (dt, elapsed) a la función de fotograma.

import * as THREE from 'three';

/** dt máximo por fotograma: evita saltos enormes tras una pestaña en segundo plano o un congelón. */
export const MAX_FRAME_DT = 0.05;

/**
 * @param {(dt: number, elapsed: number) => void} onFrame función de fotograma (actualizar + dibujar)
 * @returns {{ start: () => void, step: () => void }} `step` avanza un fotograma a mano (modo ?debug)
 */
export function createFrameLoop(onFrame) {
  const clock = new THREE.Clock();

  function step() {
    const dt = Math.min(MAX_FRAME_DT, clock.getDelta());
    const elapsed = clock.elapsedTime;
    onFrame(dt, elapsed);
  }

  function animate() {
    requestAnimationFrame(animate);
    step();
  }

  return { start: animate, step };
}
