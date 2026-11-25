// server/room/constants.js
// Constantes y utilidades compartidas por los módulos de la sala.

export const BOT_NAMES = [
  'Don Juancho',
  'Arriero_Quindio',
  'ChapoleraPro',
  'CaciqueCalarca',
  'Yipao_Turbo',
  'SalentoSniper',
  'PalmaDeCera',
  'CafeteroRex'
];

export const TICK_RATE = 20; // Servidor autoritativo a 20 Hz desacoplado del renderizado a 60+ FPS
export const TICK_DT = 1 / TICK_RATE;

export function normalizeAngle(angle) {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
