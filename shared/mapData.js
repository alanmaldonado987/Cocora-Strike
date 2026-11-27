// shared/mapData.js
// Punto de entrada del módulo compartido (cliente y servidor). Re-exporta:
// - config.js   constantes del juego
// - math.js     RNG determinista, ruido y conversión rejilla/mundo
// - spatial.js  índices espaciales
// - mapGen.js   generación procedural del Valle del Cocora
// - protocol.js nombres de mensajes de red y cuantización
// - physics/collision.js  agua/nado, colisión deslizante, separación y física simple
// - physics/raycast.js    raycasts y línea de visión
// - physics/vault.js      obstáculos saltables (parkour)
// - physics/playerController.js  controlador cinemático determinista compartido
export * from './config.js';
export * from './math.js';
export * from './spatial.js';
export * from './mapGen.js';
export * from './protocol.js';
export * from './physics/collision.js';
export * from './physics/raycast.js';
export * from './physics/vault.js';
export * from './physics/playerController.js';
