// shared/physics.js
// Colisión deslizante, separación de entidades, física de personaje, vaulting y raycasts.

import {
  WORLD_HALF,
  WATER_LEVEL,
  SWIM_CONFIG,
  PLAYER_RADIUS,
  PLAYER_HEIGHT,
  PLAYER_CROUCH_HEIGHT
} from './config.js';

// ==================== AGUA: PROFUNDIDAD Y NADO ====================

// Profundidad del río en (x, z): distancia de la superficie al lecho (0 fuera del agua).
// Se mide bajo la superficie, así que un puente encima no cuenta como fondo.
export function getWaterDepthAt(map, x, z) {
  if (!map.isInWater(x, WATER_LEVEL, z)) return 0;
  const bed = map.getFloorBelowY(x, WATER_LEVEL, z);
  return Math.max(0, WATER_LEVEL - bed);
}

// ¿Está nadando una entidad con los pies en y? Se activa cuando la profundidad supera el pecho (> 1.25m)
// y el personaje está sumergido en la lámina de agua (no sobre un puente ni cayendo en el aire).
export function isSwimmingAt(map, x, y, z) {
  return y <= WATER_LEVEL - 0.35 && getWaterDepthAt(map, x, z) > SWIM_CONFIG.swimDepth;
}

// Altura de los pies al flotar nadando (nunca por debajo del lecho)
export function getSwimFloatY(map, x, z) {
  const bed = map.getFloorBelowY(x, WATER_LEVEL, z);
  return Math.max(bed, WATER_LEVEL - SWIM_CONFIG.floatDepth);
}

// ==================== COLISIÓN DESLIZANTE Y RAYCAST ANALÍTICO 3D ====================

export function resolveSlidingHorizontal(map, x, y, z, radius = PLAYER_RADIUS, height = PLAYER_HEIGHT) {
  const limit = WORLD_HALF - 2.2;
  let rx = Math.max(-limit, Math.min(limit, x));
  let rz = Math.max(-limit, Math.min(limit, z));

  const yBottom = y + 0.38;
  const yTop = y + height - 0.04;

  const nearby = map.colliders.queryNear(rx, rz, radius + 2.2);

  for (let iter = 0; iter < 3; iter++) {
    for (let i = 0; i < nearby.length; i++) {
      const c = nearby[i];
      if (c.enabled === false) continue;
      if (yTop <= c.minY || yBottom >= c.maxY) continue;
      if (c.walkableTop && c.maxY <= y + 0.85) continue;

      if (c.type === 'cylinder') {
        const dx = rx - c.x;
        const dz = rz - c.z;
        const distSq = dx * dx + dz * dz;
        const minDist = radius + c.r;
        if (distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq) || 0.0001;
          const overlap = minDist - dist;
          rx += (dx / dist) * overlap;
          rz += (dz / dist) * overlap;
        }
      } else if (c.type === 'box') {
        const closestX = Math.max(c.minX, Math.min(c.maxX, rx));
        const closestZ = Math.max(c.minZ, Math.min(c.maxZ, rz));
        const dx = rx - closestX;
        const dz = rz - closestZ;
        const distSq = dx * dx + dz * dz;

        if (distSq < radius * radius) {
          if (distSq > 1e-6) {
            const dist = Math.sqrt(distSq);
            const overlap = radius - dist;
            rx += (dx / dist) * overlap;
            rz += (dz / dist) * overlap;
          } else {
            const dLeft = Math.abs(rx - c.minX);
            const dRight = Math.abs(c.maxX - rx);
            const dBack = Math.abs(rz - c.minZ);
            const dFront = Math.abs(c.maxZ - rz);
            const m = Math.min(dLeft, dRight, dBack, dFront);
            if (m === dLeft) rx = c.minX - radius;
            else if (m === dRight) rx = c.maxX + radius;
            else if (m === dBack) rz = c.minZ - radius;
            else rz = c.maxZ + radius;
          }
        }
      }
    }
  }

  return { x: rx, z: rz };
}

export function applyEntitySeparation(entity, others, selfRadius = PLAYER_RADIUS, dt = 0.04, map = null) {
  for (const other of others) {
    if (!other || other === entity || other.alive === false) continue;
    if (other.state === 'plane' || other.state === 'lobby' || other.spectating) continue;
    if (Math.abs((entity.y || 0) - (other.y || 0)) > 1.8) continue;

    const otherR = other.radius || PLAYER_RADIUS;
    const minSep = selfRadius + otherR;
    const dx = entity.x - other.x;
    const dz = entity.z - other.z;
    const dSq = dx * dx + dz * dz;
    if (dSq > 0.0001 && dSq < minSep * minSep) {
      const d = Math.sqrt(dSq);
      const push = Math.min(0.32, (minSep - d) * Math.min(1, dt * 14));
      entity.x += (dx / d) * push;
      entity.z += (dz / d) * push;
    }
  }

  if (map) {
    const slid = resolveSlidingHorizontal(map, entity.x, entity.y, entity.z, selfRadius, PLAYER_HEIGHT);
    entity.x = slid.x;
    entity.z = slid.z;
    const minGround = map.getGroundHeightAt(entity.x, entity.z, entity.y);
    if (entity.y < minGround) entity.y = minGround;
  }
}

export function stepCharacterPhysics(
  map,
  entity,
  moveX,
  moveZ,
  dt,
  gravity = 22,
  radius = PLAYER_RADIUS,
  height = PLAYER_HEIGHT
) {
  const desiredX = entity.x + moveX * dt;
  const desiredZ = entity.z + moveZ * dt;

  const curGround = map.getGroundHeightAt(entity.x, entity.z, entity.y);
  const nextGround = map.getGroundHeightAt(desiredX, desiredZ, entity.y);
  let targetX = desiredX;
  let targetZ = desiredZ;

  const stepDist = Math.hypot(desiredX - entity.x, desiredZ - entity.z);
  if (entity.onGround && stepDist > 0.001 && (nextGround - curGround) / stepDist > 1.75) {
    const gxOnly = map.getGroundHeightAt(desiredX, entity.z, entity.y);
    const gzOnly = map.getGroundHeightAt(entity.x, desiredZ, entity.y);
    if (gxOnly - curGround < gzOnly - curGround && (gxOnly - curGround) / (Math.abs(desiredX - entity.x) || 1) <= 1.75) {
      targetZ = entity.z;
    } else if ((gzOnly - curGround) / (Math.abs(desiredZ - entity.z) || 1) <= 1.75) {
      targetX = entity.x;
    } else {
      targetX = entity.x;
      targetZ = entity.z;
    }
  }

  const slid = resolveSlidingHorizontal(map, targetX, entity.y, targetZ, radius, height);
  entity.x = slid.x;
  entity.z = slid.z;

  const minTerrainY = map.getTerrainHeightAt ? map.getTerrainHeightAt(entity.x, entity.z) : map.getGroundHeightAt(entity.x, entity.z, entity.y);
  if (gravity === 0) {
    const minSurface = map.getGroundHeightAt(entity.x, entity.z, entity.y);
    if (entity.y < minSurface) entity.y = minSurface;
    return;
  }

  const supportY = map.getFloorBelowY(entity.x, entity.y, entity.z);
  entity.vy = (entity.vy || 0) - gravity * dt;
  let nextY = entity.y + entity.vy * dt;

  if (entity.vy > 0) {
    const near = map.colliders.queryNear(entity.x, entity.z, radius);
    const headTop = nextY + height;
    for (let i = 0; i < near.length; i++) {
      const c = near[i];
      if (c.type === 'box' && entity.x >= c.minX && entity.x <= c.maxX && entity.z >= c.minZ && entity.z <= c.maxZ) {
        if (entity.y + height <= c.minY + 0.2 && headTop >= c.minY) {
          entity.vy = 0;
          nextY = c.minY - height - 0.02;
          break;
        }
      }
    }
  }

  if (entity.vy <= 0 && nextY <= supportY + 0.09) {
    entity.y = supportY;
    entity.vy = 0;
    entity.onGround = true;
  } else if (entity.onGround && entity.vy <= 0 && Math.abs(entity.y - supportY) <= 0.62) {
    // Seguir suavemente rampas de puentes y escaleras interiores cuesta arriba y cuesta abajo
    entity.y = supportY;
    entity.vy = 0;
    entity.onGround = true;
  } else {
    entity.y = Math.max(minTerrainY, nextY);
    if (entity.y <= minTerrainY + 0.001 && entity.vy < 0) {
      entity.vy = 0;
      entity.onGround = true;
    } else {
      entity.onGround = false;
    }
  }
}

export function senseObstacleAhead(map, x, y, z, angleRad, distance = 3.2, radius = PLAYER_RADIUS) {
  const sinA = Math.sin(angleRad);
  const cosA = Math.cos(angleRad);
  const steps = Math.max(3, Math.ceil(distance / 0.7));
  const startGround = map.getGroundHeightAt(x, z, y);

  for (let s = 1; s <= steps; s++) {
    const d = (s / steps) * distance;
    const px = x + sinA * d;
    const pz = z + cosA * d;

    if (Math.abs(px) > WORLD_HALF - 4 || Math.abs(pz) > WORLD_HALF - 4) {
      return { blocked: true, dist: d, reason: 'border' };
    }

    const gY = map.getFloorBelowY(px, y + 1.0, pz);
    if (gY - startGround > 1.85) {
      return { blocked: true, dist: d, reason: 'steep' };
    }

    const slid = resolveSlidingHorizontal(map, px, gY, pz, radius, PLAYER_HEIGHT);
    if (Math.hypot(slid.x - px, slid.z - pz) > 0.05) {
      return { blocked: true, dist: d, reason: 'solid' };
    }
  }
  return { blocked: false, dist: distance, reason: null };
}

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

const VAULTABLE_TAGS = new Set([
  'fence',
  'stone_wall',
  'boulder',
  'fallen_log',
  'logs',
  'sacks',
  'cart',
  'barrel',
  'ruin_wall',
  'rubble',
  'sill',
  'parapet',
  'balcony_rail',
  'heli_low'
]);

export function findVaultableObstacle(map, x, y, z, yaw) {
  if (!map || !map.colliders) return null;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const nearby = map.colliders.queryNear(x + fx * 0.95, z + fz * 0.95, 1.6);

  let bestObstacle = null;
  let bestDist = Infinity;

  for (const probeD of [0.58, 0.88, 1.18]) {
    const px = x + fx * probeD;
    const pz = z + fz * probeD;
    for (let i = 0; i < nearby.length; i++) {
      const c = nearby[i];
      if (c.enabled === false || !VAULTABLE_TAGS.has(c.tag)) continue;
      const obsH = c.maxY - y;
      if (obsH < 0.42 || obsH > 1.38) continue;

      let hit = false;
      if (c.type === 'cylinder') {
        hit = Math.hypot(px - c.x, pz - c.z) <= c.r + PLAYER_RADIUS * 0.85;
      } else {
        const cx = Math.max(c.minX, Math.min(c.maxX, px));
        const cz = Math.max(c.minZ, Math.min(c.maxZ, pz));
        hit = Math.hypot(px - cx, pz - cz) <= PLAYER_RADIUS * 0.85;
      }
      if (hit && probeD < bestDist) {
        bestDist = probeD;
        bestObstacle = c;
      }
    }
  }

  if (!bestObstacle) return null;

  // Si es un alféizar de ventana ('sill'), permitir romper/saltar la ventana asociada
  const breakWindowId = bestObstacle.tag === 'sill' ? bestObstacle.meta?.windowId || null : null;
  let tempWindowCol = null;
  if (breakWindowId && map.windows) {
    const winObj = map.windows.find((w) => w.id === breakWindowId);
    if (winObj && winObj.collider && winObj.collider.enabled !== false) {
      tempWindowCol = winObj.collider;
      tempWindowCol.enabled = false;
    }
  }

  let landing = null;
  for (const landD of [1.65, 2.05, 2.35]) {
    const lx = x + fx * landD;
    const lz = z + fz * landD;
    if (Math.abs(lx) > WORLD_HALF - 2.5 || Math.abs(lz) > WORLD_HALF - 2.5) continue;
    const clearanceCheckY = bestObstacle.maxY + 0.08;
    const slid = resolveSlidingHorizontal(map, lx, clearanceCheckY, lz, PLAYER_RADIUS * 0.88, PLAYER_CROUCH_HEIGHT);
    if (Math.hypot(slid.x - lx, slid.z - lz) < 0.24) {
      const landY = map.getFloorBelowY(slid.x, bestObstacle.maxY + 0.45, slid.z);
      if (bestObstacle.maxY - landY <= 4.4 && landY - y <= 1.35) {
        landing = {
          endX: slid.x,
          endY: landY,
          endZ: slid.z,
          apexY: Math.max(y, landY) + Math.max(0.75, bestObstacle.maxY - Math.max(y, landY) + 0.24),
          obstacleTag: bestObstacle.tag,
          breakWindowId
        };
        break;
      }
    }
  }

  if (tempWindowCol) {
    tempWindowCol.enabled = true;
  }

  return landing;
}

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

export function hasLineOfSight(map, fromPt, toPt, tolerance = 0.12) {
  const dx = toPt.x - fromPt.x;
  const dy = toPt.y - fromPt.y;
  const dz = toPt.z - fromPt.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist <= 0.05) return true;

  const hit = raycastVoxels(map, fromPt, { x: dx / dist, y: dy / dist, z: dz / dist }, dist);
  return !hit.hit || hit.dist >= dist - tolerance;
}
