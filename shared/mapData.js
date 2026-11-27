// shared/mapData.js
// Punto de entrada del módulo compartido (cliente y servidor). Re-exporta:
// - config.js   constantes del juego
// - math.js     RNG determinista, ruido y conversión rejilla/mundo
// - spatial.js  índices espaciales
// - mapGen.js   generación procedural del Valle del Cocora
// - physics.js  colisiones, física de personaje y raycasts
// - physics/playerController.js  controlador cinemático determinista compartido
export * from './config.js';
export * from './math.js';
export * from './spatial.js';
export * from './mapGen.js';
export * from './physics.js';
export * from './physics/playerController.js';
