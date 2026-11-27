// shared/physics/collision.js
// Colisión con el entorno: profundidad del agua y nado, colisión deslizante horizontal contra cajas/cilindros,
// separación entre entidades, física de personaje simple (bots) y sensor de obstáculos al frente.
// @ts-check

import {
  WORLD_HALF,
  WATER_LEVEL,
  SWIM_CONFIG,
  PLAYER_RADIUS,
  PLAYER_HEIGHT,
  PLAYER_STATE
} from '../config.js';

/**
 * Profundidad del río en (x, z): distancia de la superficie al lecho (0 fuera del agua).
 * @param {import('../mapGen.js').CocoraMap} map
 * @param {number} x
 * @param {number} z
 * @returns {number}
 */
export function getWaterDepthAt(map, x, z) {
  if (!map.isInWater(x, WATER_LEVEL, z)) return 0;
  const bed = map.getFloorBelowY(x, WATER_LEVEL, z);
  return Math.max(0, WATER_LEVEL - bed);
}

// ¿Está nadando una entidad con los pies en y? Se activa cuando la profundidad supera el pecho (> 1.25m)
// y el personaje está sumergido en la lámina de agua (no sobre un puente ni cayendo en el aire).
/**
 * ¿Nada una entidad con los pies en y? (agua más profunda que el pecho y cuerpo sumergido).
 * @param {import('../mapGen.js').CocoraMap} map
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {boolean}
 */
export function isSwimmingAt(map, x, y, z) {
  return y <= WATER_LEVEL - 0.35 && getWaterDepthAt(map, x, z) > SWIM_CONFIG.swimDepth;
}

// Altura de los pies al flotar nadando (nunca por debajo del lecho)
/**
 * Altura de los pies al flotar en (x, z): bajo la superficie, nunca por debajo del lecho.
 * @param {import('../mapGen.js').CocoraMap} map
 * @param {number} x
 * @param {number} z
 * @returns {number}
 */
export function getSwimFloatY(map, x, z) {
  const bed = map.getFloorBelowY(x, WATER_LEVEL, z);
  return Math.max(bed, WATER_LEVEL - SWIM_CONFIG.floatDepth);
}

// ==================== COLISIÓN DESLIZANTE Y RAYCAST ANALÍTICO 3D ====================

/**
 * Colisión deslizante horizontal: empuja la posición fuera de cajas y cilindros cercanos.
 * @param {{ colliders: import('../spatial.js').SpatialCollisionIndex }} map
 * @param {number} x
 * @param {number} y pies de la entidad
 * @param {number} z
 * @param {number} [radius]
 * @param {number} [height]
 * @returns {{ x: number, z: number }}
 */
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

/**
 * @typedef {{ x: number, y?: number, z: number, alive?: boolean, state?: string, spectating?: boolean, radius?: number }} SeparableEntity
 */

/**
 * Separa suavemente una entidad de las demás para que no se superpongan (muta entity.x/z).
 * @param {SeparableEntity} entity
 * @param {Array<SeparableEntity>} others
 * @param {number} [selfRadius]
 * @param {number} [dt]
 * @param {import('../mapGen.js').CocoraMap|null} [map] si se da, valida la nueva posición contra colisiones
 */
export function applyEntitySeparation(entity, others, selfRadius = PLAYER_RADIUS, dt = 0.04, map = null) {
  for (const other of others) {
    if (!other || other === entity || other.alive === false) continue;
    if (other.state === PLAYER_STATE.PLANE || other.state === PLAYER_STATE.LOBBY || other.spectating) continue;
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

/**
 * Física simple de personaje (bots y fauna): gravedad, colisión deslizante y apoyo en suelo/estructuras.
 * @param {import('../mapGen.js').CocoraMap} map
 * @param {object} entity estado mutable { x, y, z, vy, onGround, ... }
 * @param {number} moveX desplazamiento deseado en X este paso (m)
 * @param {number} moveZ desplazamiento deseado en Z este paso (m)
 * @param {number} dt segundos
 * @param {number} [gravity]
 * @param {number} [radius]
 * @param {number} [height]
 */
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

/**
 * Sensor de obstáculos al frente (bots): borde del mapa, pendiente excesiva o sólido.
 * @param {import('../mapGen.js').CocoraMap} map
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} angleRad dirección de avance (yaw)
 * @param {number} [distance]
 * @param {number} [radius]
 * @returns {{ blocked: boolean, dist: number, reason: string|null }}
 */
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
