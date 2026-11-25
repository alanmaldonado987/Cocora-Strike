// shared/math.js
// Utilidades numéricas deterministas: RNG con semilla, ruido 2D y conversión rejilla/mundo.

import {
  CELL_SIZE,
  GRID_SIZE,
  WORLD_HALF
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
