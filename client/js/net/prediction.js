// client/js/net/prediction.js
// Predicción del lado del cliente y reconciliación con el estado autoritativo del servidor.
// Métodos mezclados en LocalPlayerController.prototype (usan `this` como el jugador local):
// - flushPendingNetworkSteps: entrega al NetworkManager los pasos de simulación pendientes de envío.
// - resetPredictionBuffers: limpia acumuladores y colas de pasos sin confirmar.
// - reconcileWithServer: re-simula los pasos no confirmados desde el snapshot del servidor y suaviza el error.

import { PLAYER_STATE } from '/shared/mapData.js';
import { PREDICTION_CARRY_FIELDS, resimulateFromServer } from '/shared/physics/reconcile.js';

export const predictionMethods = {
  flushPendingNetworkSteps() {
    if (this.pendingNetSteps.length === 0) return null;
    const n = Math.min(12, this.pendingNetSteps.length);
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const s = this.pendingNetSteps[i];
      // Solo lo que el servidor valida (server/validation.js): `equipped` no viaja en cada paso
      out[i] = { seq: s.seq, moveX: s.moveX, moveZ: s.moveZ, yaw: s.yaw, pitch: s.pitch, buttons: s.buttons };
    }
    this.pendingNetSteps.splice(0, n);
    return out;
  },

  resetPredictionBuffers() {
    this.simAccum = 0;
    this.queuedButtonsMask = 0;
    this.pendingNetSteps.length = 0;
    this.unackedSteps.length = 0;
    this._lastAckCarry = null;
    this.reconcileOffsetX = 0;
    this.reconcileOffsetY = 0;
    this.reconcileOffsetZ = 0;
    this.prevJumpHeld = false;
    this.prevCrouchHeld = false;
    this.prevSlideHeld = false;
  },

  reconcileWithServer(meSnapshot, mapData) {
    if (!meSnapshot || !mapData || this.state === PLAYER_STATE.PLANE || !this.alive) return;
    const ackSeq = meSnapshot.lastSeq || 0;
    if (ackSeq <= 0) return;

    while (this.unackedSteps.length > 0 && this.unackedSteps[0].seq <= ackSeq) {
      const acked = this.unackedSteps.shift();
      if (acked.carry) this._lastAckCarry = acked.carry;
    }

    const probe = this._reconcileProbe;
    // Se retoma el estado interno (temporizadores de slide, coyote, vault, botones previos...) tal y como
    // estaba en lastSeq, no el actual: ver shared/physics/reconcile.js
    resimulateFromServer(probe, meSnapshot, this._lastAckCarry, this, this.unackedSteps, mapData, {
      reloading: this.reloading,
      eventsOut: this._reconcileEvents
    });

    const errX = this.x - probe.x;
    const errY = this.y - probe.y;
    const errZ = this.z - probe.z;
    const errDist = Math.hypot(errX, errY, errZ);
    if (errDist < 0.015) return;

    const prevRenderX = this.x + this.reconcileOffsetX;
    const prevRenderY = this.y + this.reconcileOffsetY;
    const prevRenderZ = this.z + this.reconcileOffsetZ;

    this.x = probe.x;
    this.y = probe.y;
    this.z = probe.z;
    this.vx = probe.vx;
    this.vz = probe.vz;
    this.vy = probe.vy;
    this.onGround = probe.onGround;
    this.state = probe.state;
    // La postura y los temporizadores deben seguir a la trayectoria corregida: si no, el cliente seguía
    // "deslizándose" localmente desde una posición que ya no le corresponde
    this.isSliding = probe.isSliding;
    this.isCrouching = probe.isCrouching;
    for (const k of PREDICTION_CARRY_FIELDS) this[k] = probe[k];

    if (errDist >= 2.0) {
      this.reconcileOffsetX = 0;
      this.reconcileOffsetY = 0;
      this.reconcileOffsetZ = 0;
    } else {
      this.reconcileOffsetX = prevRenderX - this.x;
      this.reconcileOffsetY = prevRenderY - this.y;
      this.reconcileOffsetZ = prevRenderZ - this.z;
    }
  }
};
