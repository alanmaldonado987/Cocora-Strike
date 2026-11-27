// shared/physics/raycast.js
// Raycasts deterministas contra el mapa (terreno por rejilla + cajas y cilindros de colisión) y línea de visión.
// Usados por disparos (servidor y predicción del cliente), visión de bots y cámara.
// @ts-check

import { WORLD_HALF } from '../config.js';

/**
 * Intersección rayo-caja alineada a ejes (método de las losas).
 * @returns {number} distancia al impacto o -1
 */
function intersectRayBox3D(ox, oy, oz, dx, dy, dz, box, maxDist) {
  let tMin = 0.001;
  let tMax = maxDist;

  if (Math.abs(dx) < 1e-8) {
    if (ox < box.minX || ox > box.maxX) return -1;
  } else {
    const inv = 1 / dx;
    let t1 = (box.minX - ox) * inv;
    let t2 = (box.maxX - ox) * inv;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return -1;
  }

  if (Math.abs(dy) < 1e-8) {
    if (oy < box.minY || oy > box.maxY) return -1;
  } else {
    const inv = 1 / dy;
    let t1 = (box.minY - oy) * inv;
    let t2 = (box.maxY - oy) * inv;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return -1;
  }

  if (Math.abs(dz) < 1e-8) {
    if (oz < box.minZ || oz > box.maxZ) return -1;
  } else {
    const inv = 1 / dz;
    let t1 = (box.minZ - oz) * inv;
    let t2 = (box.maxZ - oz) * inv;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return -1;
  }

  return tMin >= 0.001 && tMin <= maxDist ? tMin : -1;
}

/**
 * Intersección rayo-cilindro vertical con tapas.
 * @returns {number} distancia al impacto o -1
 */
function intersectRayCylinder3D(ox, oy, oz, dx, dy, dz, cyl, maxDist) {
  const rx = ox - cyl.x;
  const rz = oz - cyl.z;
  const a = dx * dx + dz * dz;

  if (a < 1e-8) {
    if (rx * rx + rz * rz > cyl.r * cyl.r) return -1;
    if (Math.abs(dy) < 1e-8) return oy >= cyl.minY && oy <= cyl.maxY ? 0.001 : -1;
    const t1 = (cyl.minY - oy) / dy;
    const t2 = (cyl.maxY - oy) / dy;
    const tEnter = Math.max(0.001, Math.min(t1, t2));
    const tExit = Math.min(maxDist, Math.max(t1, t2));
    return tEnter <= tExit ? tEnter : -1;
  }

  const b = 2 * (rx * dx + rz * dz);
  const c = rx * rx + rz * rz - cyl.r * cyl.r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;

  const sqrtDisc = Math.sqrt(disc);
  let tEnter = (-b - sqrtDisc) / (2 * a);
  let tExit = (-b + sqrtDisc) / (2 * a);
  if (tExit < 0.001 || tEnter > maxDist) return -1;

  if (Math.abs(dy) < 1e-8) {
    if (oy < cyl.minY || oy > cyl.maxY) return -1;
  } else {
    let ty1 = (cyl.minY - oy) / dy;
    let ty2 = (cyl.maxY - oy) / dy;
    if (ty1 > ty2) { const tmp = ty1; ty1 = ty2; ty2 = tmp; }
    if (ty1 > tEnter) tEnter = ty1;
    if (ty2 < tExit) tExit = ty2;
    if (tEnter > tExit) return -1;
  }

  const hitT = Math.max(0.001, tEnter);
  return hitT <= maxDist ? hitT : -1;
}

/**
 * Raycast contra el terreno (marcha por la rejilla de alturas) y los colisionadores del mapa.
 * @param {import('../mapGen.js').CocoraMap} map
 * @param {{ x: number, y: number, z: number }} origin
 * @param {{ x: number, y: number, z: number }} dir dirección normalizada
 * @param {number} [maxDist]
 */
export function raycastVoxels(map, origin, dir, maxDist = 540) {
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const dx = dir.x / len;
  const dy = dir.y / len;
  const dz = dir.z / len;

  let bestT = maxDist;
  let hitFound = false;
  let bestCol = null;

  const endX = origin.x + dx * maxDist;
  const endZ = origin.z + dz * maxDist;
  const candidates = map.colliders.querySegmentXZ(origin.x, origin.z, endX, endZ);

  for (let i = 0; i < candidates.length; i++) {
    const col = candidates[i];
    if (col.enabled === false) continue;
    const t =
      col.type === 'box'
        ? intersectRayBox3D(origin.x, origin.y, origin.z, dx, dy, dz, col, bestT)
        : intersectRayCylinder3D(origin.x, origin.y, origin.z, dx, dy, dz, col, bestT);
    if (t > 0 && t < bestT) {
      bestT = t;
      hitFound = true;
      bestCol = col;
    }
  }

  const terrainFn = map.getTerrainHeightAt || map.getGroundHeightAt;
  const step = 0.45;
  let prevD = 0;
  for (let d = step; d <= bestT; d += step) {
    const px = origin.x + dx * d;
    const py = origin.y + dy * d;
    const pz = origin.z + dz * d;

    if (Math.abs(px) >= WORLD_HALF || Math.abs(pz) >= WORLD_HALF) {
      bestT = d;
      hitFound = true;
      bestCol = null;
      break;
    }

    const gY = terrainFn(px, pz);
    if (py <= gY) {
      let lo = prevD;
      let hi = d;
      for (let k = 0; k < 5; k++) {
        const mid = (lo + hi) * 0.5;
        const my = origin.y + dy * mid;
        const mg = terrainFn(origin.x + dx * mid, origin.z + dz * mid);
        if (my <= mg) hi = mid;
        else lo = mid;
      }
      bestT = lo;
      hitFound = true;
      bestCol = null;
      break;
    }
    prevD = d;
  }

  const safeBackoff = hitFound ? Math.max(0, bestT - 0.03) : maxDist;
  return {
    hit: hitFound,
    dist: bestT,
    collider: bestCol,
    point: {
      x: origin.x + dx * safeBackoff,
      y: origin.y + dy * safeBackoff,
      z: origin.z + dz * safeBackoff
    }
  };
}

/**
 * ¿Hay línea de visión libre entre dos puntos? (tolerancia en metros al final del rayo).
 * @param {import('../mapGen.js').CocoraMap} map
 * @param {{ x: number, y: number, z: number }} fromPt
 * @param {{ x: number, y: number, z: number }} toPt
 * @param {number} [tolerance]
 * @returns {boolean}
 */
export function hasLineOfSight(map, fromPt, toPt, tolerance = 0.12) {
  const dx = toPt.x - fromPt.x;
  const dy = toPt.y - fromPt.y;
  const dz = toPt.z - fromPt.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist <= 0.05) return true;

  const hit = raycastVoxels(map, fromPt, { x: dx / dist, y: dy / dist, z: dz / dist }, dist);
  return !hit.hit || hit.dist >= dist - tolerance;
}
