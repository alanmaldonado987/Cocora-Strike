// shared/math.js
// Utilidades numéricas deterministas: RNG con semilla, ruido 2D y conversión rejilla/mundo.

import {
  CELL_SIZE,
  GRID_SIZE,
  WORLD_HALF,
  LAGOON_CONFIG
} from './config.js';

export function createRNG(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2D(ix, iz, seed) {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) | 0;
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function smoothstep(t) {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/**
 * Resorte armónico críticamente amortiguado (ζ = 1.0) exacto e incondicionalmente estable.
 * Muta `state` ({ value, vel }) hacia `target` con frecuencia angular natural `omega` (rad/s)
 * sin sobreoscilación e independiente de los FPS.
 */
export function stepCriticallyDampedSpring(state, target, omega, dt) {
  if (!(dt > 0) || !(omega > 0)) {
    state.value = target;
    state.vel = 0;
    return target;
  }
  const delta = state.value - target;
  const exp = Math.exp(-omega * dt);
  const c2 = state.vel + omega * delta;
  state.value = target + (delta + c2 * dt) * exp;
  state.vel = (state.vel - omega * c2 * dt) * exp;
  return state.value;
}

/**
 * Versión 3D sin asignaciones de memoria del resorte críticamente amortiguado.
 * Muta `pos` ({x,y,z}) y `vel` ({x,y,z}) hacia `target` ({x,y,z}).
 */
export function stepCriticallyDampedSpring3D(pos, vel, target, omega, dt) {
  if (!(dt > 0) || !(omega > 0)) {
    pos.x = target.x;
    pos.y = target.y;
    pos.z = target.z;
    vel.x = 0;
    vel.y = 0;
    vel.z = 0;
    return pos;
  }
  const exp = Math.exp(-omega * dt);

  const dx = pos.x - target.x;
  const cx = vel.x + omega * dx;
  pos.x = target.x + (dx + cx * dt) * exp;
  vel.x = (vel.x - omega * cx * dt) * exp;

  const dy = pos.y - target.y;
  const cy = vel.y + omega * dy;
  pos.y = target.y + (dy + cy * dt) * exp;
  vel.y = (vel.y - omega * cy * dt) * exp;

  const dz = pos.z - target.z;
  const cz = vel.z + omega * dz;
  pos.z = target.z + (dz + cz * dt) * exp;
  vel.z = (vel.z - omega * cz * dt) * exp;

  return pos;
}

export function valueNoise2D(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smoothstep(x - ix);
  const fz = smoothstep(z - iz);

  const v00 = hash2D(ix, iz, seed);
  const v10 = hash2D(ix + 1, iz, seed);
  const v01 = hash2D(ix, iz + 1, seed);
  const v11 = hash2D(ix + 1, iz + 1, seed);

  const vx0 = v00 + (v10 - v00) * fx;
  const vx1 = v01 + (v11 - v01) * fx;
  return vx0 + (vx1 - vx0) * fz;
}

export function fbm2D(x, z, seed, octaves = 4) {
  let value = 0;
  let amp = 0.52;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    value += valueNoise2D(x * freq, z * freq, seed + i * 131) * amp;
    norm += amp;
    freq *= 2.03;
    amp *= 0.49;
  }
  return value / norm;
}

export function gridToWorldX(gx) {
  return (gx - GRID_SIZE / 2) * CELL_SIZE;
}

export function gridToWorldZ(gz) {
  return (gz - GRID_SIZE / 2) * CELL_SIZE;
}

export function worldToGridX(wx) {
  return Math.max(0, Math.min(GRID_SIZE - 1, Math.floor((wx + WORLD_HALF) / CELL_SIZE)));
}

export function worldToGridZ(wz) {
  return Math.max(0, Math.min(GRID_SIZE - 1, Math.floor((wz + WORLD_HALF) / CELL_SIZE)));
}

export function getRiverCenterWorldX(wz) {
  return -48 + Math.sin(wz * 0.012) * 38 + Math.cos(wz * 0.006) * 18 + wz * 0.07;
}

/**
 * Perfil longitudinal continuo del Río Quindío y su Desembocadura / Laguna Andina en el sur.
 */
export function getWaterChannelAt(wz) {
  const centerX = getRiverCenterWorldX(wz);
  const baseHalfW = 10.4 + Math.sin(wz * 0.024) * 0.65;

  if (wz <= LAGOON_CONFIG.mouthStartZ) {
    return { centerX, halfWidth: baseHalfW, lagoonFactor: 0, active: true };
  }

  if (wz >= LAGOON_CONFIG.endZ + 6.0) {
    return { centerX, halfWidth: 0, lagoonFactor: 0, active: false };
  }

  const { mouthStartZ, centerZ, endZ, radiusX } = LAGOON_CONFIG;
  let openT = 0;
  if (wz <= centerZ) {
    openT = smoothstep((wz - mouthStartZ) / (centerZ - mouthStartZ));
  } else {
    const u = Math.max(0, Math.min(1, (wz - centerZ) / (endZ - centerZ)));
    openT = Math.sqrt(Math.max(0, 1 - u * u)) * smoothstep(1 - Math.max(0, (u - 0.82) / 0.18));
  }

  const organicShore = 1 + 0.065 * Math.sin(wz * 0.085 + 0.7) + 0.045 * Math.cos(wz * 0.15 - 0.4);
  const lagoonHalfW = radiusX * organicShore;

  let halfWidth;
  if (wz <= centerZ) {
    halfWidth = baseHalfW + (lagoonHalfW - baseHalfW) * openT;
  } else {
    const closeTail = smoothstep(1 - Math.max(0, (wz - (endZ - 8)) / 10));
    halfWidth = Math.max(baseHalfW * closeTail * 0.65, lagoonHalfW * openT);
    if (wz > endZ) {
      halfWidth *= smoothstep(1 - (wz - endZ) / 6.0);
    }
  }

  return {
    centerX,
    halfWidth,
    lagoonFactor: openT,
    active: halfWidth > 0.25
  };
}

/**
 * Perfil transversal completo del cuerpo de agua en (wx, wz): distancia al eje y a la orilla húmeda.
 */
export function getWaterProfileAt(wx, wz) {
  const ch = getWaterChannelAt(wz);
  const asymOffset = ch.lagoonFactor * (4.2 * Math.sin((wz - 210) * 0.045));
  const effCenterX = ch.centerX + asymOffset;
  const distCenter = Math.abs(wx - effCenterX);
  const distFromEdge = ch.active ? distCenter - ch.halfWidth : 999;
  return {
    centerX: effCenterX,
    halfWidth: ch.halfWidth,
    lagoonFactor: ch.lagoonFactor,
    active: ch.active,
    distCenter,
    distFromEdge
  };
}

export function distToSegment(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const lenSq = vx * vx + vz * vz;
  if (lenSq < 1e-6) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, (wx * vx + wz * vz) / lenSq));
  return Math.hypot(px - (ax + t * vx), pz - (az + t * vz));
}
