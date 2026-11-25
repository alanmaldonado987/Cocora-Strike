// server/room/swimming.js
// Nado y ahogamiento (autoritativo en el servidor).
// Nadar gasta aliento; fuera del agua se recupera. Con el aliento agotado el participante se ahoga
// y pierde vida cada segundo hasta salir del río.
// Métodos mezclados en GameRoom.prototype (usan `this` como la sala).

import { SWIM_CONFIG, isSwimmingAt, getSwimFloatY } from '../../shared/mapData.js';

export const swimmingMethods = {
  // Llamar una vez por tick para cada participante vivo
  updateSwimmingAndBreath(p, dt) {
    if (p.state !== 'ground') {
      p.isSwimming = false;
    } else if (p.isBot) {
      // Los humanos informan su posición y el servidor la valida en handlePlayerInput;
      // los bots se mueven aquí, así que se los hace flotar al entrar en agua profunda.
      p.isSwimming = isSwimmingAt(this.map, p.x, p.y, p.z);
      if (p.isSwimming) {
        p.y = getSwimFloatY(this.map, p.x, p.z);
        p.vy = 0;
        p.onGround = true;
        p.fallPeakY = p.y;
        p.isCrouching = false;
        p.isSliding = false;
        const moving = p.moveMode === 'walk' || p.moveMode === 'sprint' || p.moveMode === 'swim' || p.moveMode === 'swim_fast';
        p.moveMode = moving ? (p.moveMode === 'sprint' ? 'swim_fast' : 'swim') : 'swim_idle';
      }
    }

    if (p.isSwimming) {
      const drain = p.moveMode === 'swim_fast' ? SWIM_CONFIG.sprintDrainPerSec : SWIM_CONFIG.drainPerSec;
      p.breath = Math.max(0, p.breath - drain * dt);
    } else {
      p.breath = Math.min(SWIM_CONFIG.maxBreath, p.breath + SWIM_CONFIG.regenPerSec * dt);
      p.drownDamageAccum = 0;
    }

    if (p.isSwimming && p.breath <= 0) {
      p.drownDamageAccum += SWIM_CONFIG.drownDps * dt;
      const dmg = Math.floor(p.drownDamageAccum);
      if (dmg >= 1) {
        p.drownDamageAccum -= dmg;
        this.damagePlayer(p, dmg, null, 'drown', false);
      }
    }
  }
};
