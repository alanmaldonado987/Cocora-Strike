// client/js/ui/fpsMeter.js
// Contador de FPS del HUD. Mide con tiempo real (el dt del bucle está acotado a MAX_FRAME_DT y falsearía la
// cifra en equipos lentos) y solo toca el DOM cada FPS_REFRESH_MS para no costar nada por fotograma.
// Lógica pura (sin DOM): se prueba en Node; main.js conecta onUpdate con el texto del HUD.

export const FPS_REFRESH_MS = 500;
/** Umbrales de color: >= GOOD verde, >= OK ámbar, por debajo rojo. */
export const FPS_GOOD = 55;
export const FPS_OK = 30;

/** @param {number} fps */
export function fpsLevel(fps) {
  if (fps >= FPS_GOOD) return 'good';
  if (fps >= FPS_OK) return 'ok';
  return 'bad';
}

/**
 * @param {{ onUpdate: (fps: number, level: string, worstMs: number) => void, refreshMs?: number }} options
 */
export function createFpsMeter({ onUpdate, refreshMs = FPS_REFRESH_MS }) {
  let windowStart = null;
  let last = null;
  let frames = 0;
  let worstMs = 0;

  return {
    /** Llamar una vez por fotograma con performance.now(). */
    tick(now) {
      if (windowStart === null) {
        windowStart = now;
        last = now;
        return;
      }
      frames++;
      const frameMs = now - last;
      if (frameMs > worstMs) worstMs = frameMs;
      last = now;
      const span = now - windowStart;
      if (span >= refreshMs) {
        const fps = Math.round((frames * 1000) / span);
        onUpdate(fps, fpsLevel(fps), Math.round(worstMs));
        windowStart = now;
        frames = 0;
        worstMs = 0;
      }
    }
  };
}
