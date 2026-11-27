// shared/physics/reconcile.js
// Reconciliación de la predicción del cliente con el snapshot autoritativo del servidor (módulo puro: se prueba
// en Node). El cliente re-simula los pasos aún no confirmados partiendo del estado del servidor en `lastSeq`.
//
// El snapshot solo trae lo observable (posición, velocidades, flags de postura...). Los temporizadores internos de
// la simulación (slide, enfriamiento, coyote time, vault, memoria de botones pulsados...) NO viajan por red, así
// que hay que reconstruirlos tal y como estaban en el paso `lastSeq`: para eso cada paso predicho guarda una copia
// de ellos (`step.carry`). Usar los valores ACTUALES del cliente (los de después de todos los pasos pendientes)
// rompía el deslizamiento: el enfriamiento ya estaba activo, la re-simulación no podía iniciar el slide, el
// resultado quedaba metros atrás y el cliente era devuelto al punto de inicio en cada snapshot ("se queda pegado").
// @ts-check

import { SIM_DT } from '../config.js';
import { stepPlayer } from './playerController.js';

/** Estado interno de la simulación que no viaja en el snapshot y debe arrastrarse entre pasos. */
export const PREDICTION_CARRY_FIELDS = Object.freeze([
  'isVaulting', 'coyoteTimer', 'jumpBufferTimer', 'prevJumpHeld', 'prevCrouchHeld', 'prevSlideHeld',
  'slideTimer', 'slideCooldownTimer', 'slideSpeed', 'slideDirX', 'slideDirZ',
  'vaultTimer', 'vaultDuration', 'vaultStartX', 'vaultStartY', 'vaultStartZ', 'vaultEndX', 'vaultEndY',
  'vaultEndZ', 'vaultApexY', 'currentDescentSpeed', 'airMomentumX', 'airMomentumZ', 'airPeakY',
  'currentGroundClearance'
]);

/**
 * Copia el estado interno de `src` (justo después de simular un paso) para poder retomarlo al reconciliar.
 * @param {Record<string, any>} src
 * @returns {Record<string, any>}
 */
export function capturePredictionCarry(src) {
  const out = {};
  for (const k of PREDICTION_CARRY_FIELDS) out[k] = src[k];
  return out;
}

/**
 * Re-simula `unackedSteps` desde el snapshot del servidor y deja el resultado en `probe`.
 * @param {Record<string, any>} probe objeto reutilizable (sin asignaciones por llamada)
 * @param {Record<string, any>} snap snapshot del jugador local (x, y, z, vx, vy, vz, flags, lastSeq...)
 * @param {Record<string, any> | null} carry estado interno en `lastSeq` (de `capturePredictionCarry`)
 * @param {Record<string, any>} fallback jugador local: valores de respaldo si falta algo
 * @param {Array<Record<string, any>>} unackedSteps pasos con seq > lastSeq, en orden
 * @param {any} map
 * @param {{ reloading?: boolean, eventsOut?: any }} [options]
 * @returns {Record<string, any>} probe
 */
export function resimulateFromServer(probe, snap, carry, fallback, unackedSteps, map, options = {}) {
  probe.x = snap.x;
  probe.y = snap.y;
  probe.z = snap.z;
  probe.vx = snap.vx ?? fallback.vx;
  probe.vz = snap.vz ?? fallback.vz;
  probe.vy = snap.vy ?? fallback.vy;
  probe.yaw = snap.yaw ?? fallback.yaw;
  probe.pitch = snap.pitch ?? fallback.pitch;
  probe.onGround = Boolean(snap.onGround);
  probe.state = snap.state || fallback.state;
  probe.moveMode = snap.moveMode || fallback.moveMode;
  probe.walkPhase = snap.animWalk ?? fallback.walkPhase;
  probe.isSliding = Boolean(snap.isSliding);
  probe.isCrouching = Boolean(snap.isCrouching);
  probe.isSwimming = Boolean(snap.isSwimming);
  probe.isHealing = Boolean(snap.isHealing);
  probe.equipped = snap.equipped || fallback.equipped;
  probe.jumpStartAltitude = snap.jumpAltitude || fallback.jumpStartAltitude;

  const src = carry || fallback;
  for (const k of PREDICTION_CARRY_FIELDS) probe[k] = src[k];
  // Valores por defecto coherentes con createPlayerKinematicState si el origen no los tiene
  probe.coyoteTimer ||= 0;
  probe.jumpBufferTimer ||= 0;
  probe.slideTimer ||= 0;
  probe.slideCooldownTimer ||= 0;
  probe.slideSpeed ||= 0;
  if (!probe.slideDirX && !probe.slideDirZ) probe.slideDirZ = 1;
  probe.vaultDuration ||= 0.42;
  probe.airPeakY ??= probe.y;
  probe.isVaulting = Boolean(probe.isVaulting);
  probe.prevJumpHeld = Boolean(probe.prevJumpHeld);
  probe.prevCrouchHeld = Boolean(probe.prevCrouchHeld);
  probe.prevSlideHeld = Boolean(probe.prevSlideHeld);

  for (let i = 0; i < unackedSteps.length; i++) {
    stepPlayer(probe, unackedSteps[i], SIM_DT, map, options);
  }
  return probe;
}
