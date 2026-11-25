// server/room/storm.js
// Tormenta: creación, fases de cierre y daño.
// Métodos mezclados en GameRoom.prototype (usan `this` como la sala).

import {
  STORM_PHASES,
  STORM_CLOSED_DPS
} from '../../shared/mapData.js';

export const stormMethods = {
  createInitialStorm(rng = Math.random) {
    return {
      centerX: (rng() - 0.45) * 70,
      centerZ: (rng() - 0.5) * 70,
      radius: 365,
      startRadius: 365,
      targetRadius: STORM_PHASES[0].targetRadius,
      phaseIndex: 0,
      state: 'waiting',
      timer: STORM_PHASES[0].waitSec,
      dps: STORM_PHASES[0].dps
    };
  },

  updateStorm(dt) {
    const phaseCfg = STORM_PHASES[this.storm.phaseIndex];

    if (phaseCfg) {
      if (this.storm.state === 'waiting') {
        this.storm.dps = phaseCfg.dps;
        this.storm.timer -= dt;
        if (this.storm.timer <= 0) {
          this.storm.state = 'shrinking';
          this.storm.startRadius = this.storm.radius;
          this.storm.targetRadius = phaseCfg.targetRadius;
          this.storm.timer = phaseCfg.shrinkSec;
        }
      } else if (this.storm.state === 'shrinking') {
        this.storm.dps = phaseCfg.dps;
        this.storm.timer -= dt;
        const progress = Math.min(1, Math.max(0, 1 - this.storm.timer / phaseCfg.shrinkSec));
        this.storm.radius =
          this.storm.startRadius + (this.storm.targetRadius - this.storm.startRadius) * progress;

        if (this.storm.timer <= 0) {
          this.storm.radius = this.storm.targetRadius;
          this.storm.phaseIndex += 1;
          const nextCfg = STORM_PHASES[this.storm.phaseIndex];
          if (nextCfg) {
            this.storm.state = 'waiting';
            this.storm.timer = nextCfg.waitSec;
            this.storm.dps = nextCfg.dps;
            this.storm.targetRadius = nextCfg.targetRadius;
          } else {
            this.storm.state = 'closed';
            this.storm.timer = 0;
            this.storm.dps = STORM_CLOSED_DPS;
          }
        }
      }
    } else {
      this.storm.state = 'closed';
      this.storm.radius = 0;
      this.storm.dps = STORM_CLOSED_DPS;
    }

    this.stormDamageAccum += dt;
    while (this.stormDamageAccum >= 1.0) {
      this.stormDamageAccum -= 1.0;
      const dmgPerSec = Math.max(1, Math.round(this.storm.dps));

      for (const p of this.players.values()) {
        if (!p.alive || p.spectating || p.state === 'plane') continue;
        const distFromSafeCenter = Math.hypot(p.x - this.storm.centerX, p.z - this.storm.centerZ);
        if (distFromSafeCenter > this.storm.radius) {
          this.damagePlayer(p, dmgPerSec, null, 'storm', false);
        }
      }
    }
  }
};
