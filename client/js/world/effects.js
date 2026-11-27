// client/js/world/effects.js
// Efectos por Object Pooling (cero new THREE.* por evento): partículas, trazadoras, astillas de puerta, cristales,
// polvo de derrape, ondas en el agua, curación y disparos.

import { WATER_LEVEL } from '/shared/mapData.js';

export const effectMethods = {
  _acquireParticle(x, y, z, vx, vy, vz, mat, ttl, gravity = 14, scale = 1.0, growRate = 0.0) {
    const slot = this.particlePool[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % this.particlePool.length;
    slot.active = true;
    slot.vx = vx;
    slot.vy = vy;
    slot.vz = vz;
    slot.gravity = gravity;
    slot.growRate = growRate;
    slot.scale = scale;
    slot.ttl = ttl;
    slot.maxTtl = ttl;
    slot.mesh.material = mat;
    slot.mesh.position.set(x, y, z);
    slot.mesh.scale.setScalar(scale);
    slot.mesh.visible = true;
  },

  _acquireTracer(ox, oy, oz, ex, ey, ez, hitPlayer) {
    const slot = this.tracerPool[this.tracerCursor];
    this.tracerCursor = (this.tracerCursor + 1) % this.tracerPool.length;
    slot.active = true;
    slot.ttl = 0.08;
    slot.maxTtl = 0.08;
    slot.posAttr.setXYZ(0, ox, oy, oz);
    slot.posAttr.setXYZ(1, ex, ey, ez);
    slot.posAttr.needsUpdate = true;
    slot.mat.color.setHex(hitPlayer ? 0xfde047 : 0xbae6fd);
    slot.mat.opacity = 0.88;
    slot.line.visible = true;
  },

  spawnDoorBreakFX(x, y, z) {
    for (let i = 0; i < 12; i++) {
      this._acquireParticle(
        x + (Math.random() - 0.5) * 1.1,
        y + (Math.random() - 0.5) * 1.4,
        z + (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 6.5,
        1.5 + Math.random() * 4.0,
        (Math.random() - 0.5) * 6.5,
        this.poolMats.woodSplinter,
        0.55,
        15,
        1.45,
        0
      );
    }
  },

  spawnWindowShatterFX(x, y, z) {
    for (let i = 0; i < 14; i++) {
      this._acquireParticle(
        x + (Math.random() - 0.5) * 1.2,
        y + (Math.random() - 0.5) * 0.9,
        z + (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 5.8,
        0.8 + Math.random() * 3.2,
        (Math.random() - 0.5) * 5.8,
        this.poolMats.glassShard,
        0.48,
        16,
        1.1,
        0
      );
    }
  },

  spawnSlideDust(x, y, z, yaw) {
    const backX = -Math.sin(yaw);
    const backZ = -Math.cos(yaw);
    for (let i = 0; i < 2; i++) {
      this._acquireParticle(
        x + (Math.random() - 0.5) * 0.35,
        y + 0.10,
        z + (Math.random() - 0.5) * 0.35,
        backX * (1.8 + Math.random() * 1.5) + (Math.random() - 0.5) * 1.4,
        0.9 + Math.random() * 1.4,
        backZ * (1.8 + Math.random() * 1.5) + (Math.random() - 0.5) * 1.4,
        this.poolMats.dust,
        0.34,
        12,
        1.15
      );
    }
  },

  spawnWaterRipples(x, z, isMoving = false, intensity = 1.0) {
    const count = isMoving ? 3 : 2;
    const surfY = WATER_LEVEL + 0.05;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = 0.22 + Math.random() * 0.38;
      const outSpeed = (isMoving ? 1.45 : 0.75) * intensity;
      this._acquireParticle(
        x + Math.cos(ang) * rad,
        surfY,
        z + Math.sin(ang) * rad,
        Math.cos(ang) * outSpeed,
        isMoving ? (0.45 + Math.random() * 0.85) * intensity : 0.12,
        Math.sin(ang) * outSpeed,
        i === 0 ? this.poolMats.waterFoam : this.poolMats.waterRipple,
        0.42,
        isMoving ? 4.8 : 0.5,
        0.75 * intensity,
        1.65
      );
    }
  },

  spawnHealParticles(x, y, z) {
    for (let i = 0; i < 2; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = 0.25 + Math.random() * 0.32;
      this._acquireParticle(
        x + Math.cos(ang) * rad,
        y + 0.75 + Math.random() * 0.45,
        z + Math.sin(ang) * rad,
        (Math.random() - 0.5) * 0.4,
        1.5 + Math.random() * 0.9,
        (Math.random() - 0.5) * 0.4,
        this.poolMats.healGreen,
        0.58,
        -0.4,
        0.95
      );
    }
  },

  spawnShotFX(origin, endPoint, hitPlayer = false, extraEnds = null) {
    if (endPoint) {
      this._acquireTracer(origin.x, origin.y, origin.z, endPoint.x, endPoint.y, endPoint.z, hitPlayer);
    }
    if (extraEnds && extraEnds.length > 0) {
      for (let i = 0; i < extraEnds.length; i++) {
        const ep = extraEnds[i];
        if (ep) this._acquireTracer(origin.x, origin.y, origin.z, ep.x, ep.y, ep.z, hitPlayer);
      }
    }

    if (endPoint) {
      const pCount = hitPlayer ? 6 : 4;
      const mat = hitPlayer ? this.poolMats.hitRed : this.poolMats.sparkGold;
      for (let i = 0; i < pCount; i++) {
        this._acquireParticle(
          endPoint.x,
          endPoint.y,
          endPoint.z,
          (Math.random() - 0.5) * 6,
          Math.random() * 4 + 0.8,
          (Math.random() - 0.5) * 6,
          mat,
          0.28,
          14,
          0.9
        );
      }
    }
  }
};
