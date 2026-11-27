// shared/physics/vault.js
// Detección de obstáculos saltables (parkour W+Espacio): cercas, muros bajos, cajas y troncos etiquetados.
// @ts-check

import { WORLD_HALF, PLAYER_RADIUS, PLAYER_CROUCH_HEIGHT } from '../config.js';
import { resolveSlidingHorizontal } from './collision.js';

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

/**
 * Busca un obstáculo saltable justo delante (W+Espacio) y devuelve el punto de aterrizaje seguro.
 * @param {import('../mapGen.js').CocoraMap} map
 * @param {number} x
 * @param {number} y pies del jugador
 * @param {number} z
 * @param {number} yaw dirección de la vista
 * @returns {object|null} datos del salto (inicio, ápice, aterrizaje) o null si no hay obstáculo válido
 */
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
