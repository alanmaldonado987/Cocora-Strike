// client/js/net/prediction.js
// Predicción del lado del cliente y reconciliación con el estado autoritativo del servidor.
// Métodos mezclados en LocalPlayerController.prototype (usan `this` como el jugador local):
// - flushPendingNetworkSteps: entrega al NetworkManager los pasos de simulación pendientes de envío.
// - resetPredictionBuffers: limpia acumuladores y colas de pasos sin confirmar.
// - reconcileWithServer: re-simula los pasos no confirmados desde el snapshot del servidor y suaviza el error.

import { SIM_DT, stepPlayer, PLAYER_STATE } from '/shared/mapData.js';

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
      this.unackedSteps.shift();
    }

    const probe = this._reconcileProbe;
    probe.x = meSnapshot.x;
    probe.y = meSnapshot.y;
    probe.z = meSnapshot.z;
    probe.vx = meSnapshot.vx ?? this.vx;
    probe.vz = meSnapshot.vz ?? this.vz;
    probe.vy = meSnapshot.vy ?? this.vy;
    probe.yaw = meSnapshot.yaw ?? this.yaw;
    probe.pitch = meSnapshot.pitch ?? this.pitch;
    probe.onGround = Boolean(meSnapshot.onGround);
    probe.state = meSnapshot.state || this.state;
    probe.moveMode = meSnapshot.moveMode || this.moveMode;
    probe.walkPhase = meSnapshot.animWalk ?? this.walkPhase;
    probe.isSliding = Boolean(meSnapshot.isSliding);
    probe.isCrouching = Boolean(meSnapshot.isCrouching);
    probe.isSwimming = Boolean(meSnapshot.isSwimming);
    probe.isVaulting = this.isVaulting;
    probe.isHealing = Boolean(meSnapshot.isHealing);
    probe.equipped = meSnapshot.equipped || this.equipped;
    probe.coyoteTimer = this.coyoteTimer || 0;
    probe.jumpBufferTimer = this.jumpBufferTimer || 0;
    probe.prevJumpHeld = false;
    probe.prevCrouchHeld = false;
    probe.prevSlideHeld = false;
    probe.slideTimer = this.slideTimer || 0;
    probe.slideCooldownTimer = this.slideCooldownTimer || 0;
    probe.slideSpeed = this.slideSpeed || 0;
    probe.slideDirX = this.slideDirX || 0;
    probe.slideDirZ = this.slideDirZ || 1;
    probe.vaultTimer = this.vaultTimer || 0;
    probe.vaultDuration = this.vaultDuration || 0.42;
    probe.vaultStartX = this.vaultStartX || 0;
    probe.vaultStartY = this.vaultStartY || 0;
    probe.vaultStartZ = this.vaultStartZ || 0;
    probe.vaultEndX = this.vaultEndX || 0;
    probe.vaultEndY = this.vaultEndY || 0;
    probe.vaultEndZ = this.vaultEndZ || 0;
    probe.vaultApexY = this.vaultApexY || 0;
    probe.jumpStartAltitude = meSnapshot.jumpAltitude || this.jumpStartAltitude;
    probe.currentDescentSpeed = this.currentDescentSpeed || 0;
    probe.airMomentumX = this.airMomentumX || 0;
    probe.airMomentumZ = this.airMomentumZ || 0;
    probe.airPeakY = this.airPeakY || probe.y;
    probe.currentGroundClearance = this.currentGroundClearance || 0;

    for (let i = 0; i < this.unackedSteps.length; i++) {
      stepPlayer(probe, this.unackedSteps[i], SIM_DT, mapData, {
        reloading: this.reloading,
        eventsOut: this._reconcileEvents
      });
    }

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
