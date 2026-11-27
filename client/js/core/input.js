// client/js/core/input.js
// Entrada de teclado y ratón del jugador local: teclas, rueda, clics, Pointer Lock en bruto y vista con el ratón.
// Los métodos se mezclan en LocalPlayerController.prototype (usan `this` como el jugador local).
// Los botones discretos (salto, agacharse, deslizarse, paracaídas) se encolan en `queuedButtonsMask` y se consumen
// en el siguiente paso fijo de simulación (SIM_DT) para que cliente y servidor vean la misma secuencia.

import { PLAYER_INPUT_BUTTONS, PLAYER_STATE } from '/shared/mapData.js';

// Solicita Pointer Lock sin aceleración del sistema operativo (unadjustedMovement) con fallback seguro
export function requestRawPointerLock(element) {
  if (!element?.requestPointerLock) return;
  try {
    const maybePromise = element.requestPointerLock({ unadjustedMovement: true });
    if (maybePromise && typeof maybePromise.catch === 'function') {
      maybePromise.catch(() => {
        try {
          element.requestPointerLock();
        } catch {}
      });
    }
  } catch {
    try {
      element.requestPointerLock();
    } catch {}
  }
}

export const inputMethods = {
  bindInputs() {
    window.addEventListener('keydown', (e) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT') return;
      this.keys[e.code] = true;

      if (!this.active) return;

      if (e.code === 'KeyV') this.toggleCameraMode();
      if (!this.alive) return;

      if (e.code === 'KeyC' || e.code === 'ControlLeft' || e.code === 'ControlRight') {
        if (e.code === 'KeyC') {
          this.queuedButtonsMask |= PLAYER_INPUT_BUTTONS.CROUCH;
        } else {
          this.queuedButtonsMask |= PLAYER_INPUT_BUTTONS.SLIDE | PLAYER_INPUT_BUTTONS.CROUCH;
        }
      }

      if (e.code === 'Space' || e.code === 'KeyF') {
        if (this.state === PLAYER_STATE.PLANE) {
          this.startCabinDisembarkSequence();
        } else if (e.code === 'KeyF') {
          this.queuedButtonsMask |= PLAYER_INPUT_BUTTONS.PARACHUTE;
        } else {
          this.queuedButtonsMask |= PLAYER_INPUT_BUTTONS.JUMP;
        }
      }

      if (e.code === 'KeyR') this.tryReload();
      if (e.code === 'Digit1') this.trySwitchWeapon('pistol');
      if (e.code === 'Digit2') this.trySwitchWeapon('revolver');
      if (e.code === 'Digit3') this.trySwitchWeapon('shotgun');
      if (e.code === 'Digit4') this.trySwitchWeapon('smg');
      if (e.code === 'Digit5') this.trySwitchWeapon('assault_rifle');
      if (e.code === 'Digit6') this.trySwitchWeapon('rifle');
      if (e.code === 'Digit7') this.trySwitchWeapon('sniper');
      if (e.code === 'Backquote' || e.code === 'Digit0') this.trySwitchWeapon('fists');

      if (e.code === 'KeyE') this.onInteractRequest?.();
      if (e.code === 'KeyH') this.tryRequestHeal('medkit');
      if (e.code === 'KeyG' || e.code === 'KeyQ') this.tryRequestHeal('bandage');
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.active || !this.alive || this.state !== PLAYER_STATE.GROUND) return;
        this.cycleWeapon(e.deltaY > 0 ? 1 : -1);
      },
      { passive: true }
    );

    this.domElement.addEventListener('mousedown', (e) => {
      this.audio.init();
      if (!this.active) return;

      if (!this.pointerLocked) {
        requestRawPointerLock(this.domElement);
        return;
      }

      if (e.button === 0) {
        this.mouseDownLeft = true;
        this.pendingShotPress = true;
      } else if (e.button === 2) {
        this.aimingZoom = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDownLeft = false;
      if (e.button === 2) this.aimingZoom = false;
    });

    window.addEventListener('blur', () => {
      this.clearActiveInputs();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.clearActiveInputs();
      }
    });

    window.addEventListener('contextmenu', (e) => {
      if (this.active) e.preventDefault();
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.domElement;
      if (!this.pointerLocked) {
        this.clearActiveInputs();
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked || !this.active) return;
      const isSniperAds = this.aimingZoom && this.equipped === 'sniper';
      const sens = isSniperAds ? 0.00075 : this.aimingZoom ? 0.0014 : 0.0022;
      const deltaYaw = -e.movementX * sens;
      const deltaPitch = -e.movementY * sens;
      this.yaw += deltaYaw;
      // Si el jugador compensa el retroceso bajando el ratón, absorber primero el remanente del resorte
      if (deltaPitch < 0 && this.recoilState.targetPitch > 0) {
        const absorbed = Math.min(this.recoilState.targetPitch, -deltaPitch);
        this.recoilState.targetPitch -= absorbed;
        this.pitch = Math.max(-1.35, Math.min(1.25, this.pitch + (deltaPitch + absorbed)));
      } else {
        this.pitch = Math.max(-1.35, Math.min(1.25, this.pitch + deltaPitch));
      }
      this.fpRig.addMouseSway(e.movementX, e.movementY);
    });
  },

  clearActiveInputs() {
    for (const key in this.keys) {
      this.keys[key] = false;
    }
    this.mouseDownLeft = false;
    this.pendingShotPress = false;
    this.aimingZoom = false;
    this.queuedButtonsMask = 0;
    this.fireCadenceState.burstActive = false;
  }
};
