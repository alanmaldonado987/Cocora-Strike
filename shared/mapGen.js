// shared/mapGen.js
// Mundo Low-Poly Orgánico de Colombia en Escala Métrica Real (1 unidad = 1.00 metro, Jugador = 1.80m)
// Mapa de 640 x 640 metros con:
// - Nivelación exacta de terrazas para casas (cero huecos, puertas a ras de suelo + cimientos de piedra hasta la pendiente)
// - 4 Puentes elevados sobre las orillas reales (Math.max(izq, der) + 1.2m) con rampas continuas en getGroundHeightAt
// - Arquitectura expandida con edificios de 1, 2 y 3 niveles + azoteas, escaleras interiores transitables, casas destruidas y ruinas
// - 3 Montañas escarpadas con senderos y 3 Cuevas rocosas explorables (techo alto sin colisión forzada + loot de alto nivel)
// - Distribución 100% orgánica y aleatoria de vegetación (sin cuadrículas), avión a ~198m (~10s de caída libre) y Oso de Anteojos letal
//
// Orquestador: el orden de las secciones (y por tanto la secuencia del RNG) es exactamente el original.
//   shared/map/terrain.js    buildTerrain + createGroundQueries
//   shared/map/buildings.js  buildStructures
//   shared/map/props.js      buildProps
//   shared/map/pois.data.js  coordenadas de POIs (datos fuera del código)
// @ts-check

import {
  BLOCK,
  DEFAULT_MAP_SEED,
  WATER_LEVEL
} from './config.js';
import {
  getWaterProfileAt,
  gridToWorldX,
  gridToWorldZ
} from './math.js';
import {
  resolveSlidingHorizontal
} from './physics/collision.js';
import { buildTerrain, createGroundQueries } from './map/terrain.js';
import { buildStructures } from './map/buildings.js';
import { buildProps } from './map/props.js';

/**
 * Genera de forma determinista el Valle del Cocora completo (misma semilla => mismo mapa en cliente y servidor).
 * @param {number} [seed] semilla del mapa
 */
export function generateCocoraMap(seed = DEFAULT_MAP_SEED) {
  const ctx = { seed, ...buildTerrain(seed) };
  Object.assign(ctx, buildStructures(ctx));
  Object.assign(ctx, createGroundQueries(ctx));
  Object.assign(ctx, buildProps(ctx));
  const {
    blastCrater,
    bridges,
    buildings,
    caves,
    cocoraMonument,
    colliders,
    doors,
    exclusion,
    getGroundHeightAt,
    getSlopeAt,
    getSurfaceAt,
    getTerrainHeightAt,
    getTerrainNormalAt,
    heightGrid,
    helicopterWreck,
    interiorItems,
    landmarks,
    logPiles,
    lootSpawns,
    mountainPeaks,
    props,
    riverCrossings,
    ruinedHouses,
    ruins,
    stealthBushGrid,
    surfaceGrid,
    surfaceHeights,
    trailSegments,
    wildlifeSpawns,
    windows
  } = ctx;

  function getFloorBelowY(wx, wy, wz) {
    let bestY = getGroundHeightAt(wx, wz, wy);
    const near = colliders.queryNear(wx, wz, 0.9);
    for (let i = 0; i < near.length; i++) {
      const c = near[i];
      if (c.enabled === false || !c.walkableTop) continue;
      if (wx >= c.minX - 0.12 && wx <= c.maxX + 0.12 && wz >= c.minZ - 0.12 && wz <= c.maxZ + 0.12) {
        if (c.maxY <= wy + 1.05 && c.maxY > bestY) {
          bestY = c.maxY;
        }
      }
    }
    return bestY;
  }

  function getTopSolidY(wx, wz) {
    return getFloorBelowY(wx, 260, wz);
  }

  function isInWater(wx, wy, wz) {
    if (wy > WATER_LEVEL + 0.3) return false;
    const wp = getWaterProfileAt(wx, wz);
    return wp.active && wp.distFromEdge < -0.12;
  }

  function isConcealedInBush(wx, wz) {
    return !stealthBushGrid.canPlace(wx, wz, 0.15);
  }

  function findSafeLootPlacement(wx, wyHint, wz) {
    const pushed = resolveSlidingHorizontal({ colliders }, wx, wyHint, wz, 0.55, 1.0);
    const surfY = getFloorBelowY(pushed.x, wyHint + 0.9, pushed.z);
    return {
      x: pushed.x,
      y: surfY,
      z: pushed.z,
      onFlatStructure: surfY > getTerrainHeightAt(pushed.x, pushed.z) + 0.03
    };
  }

  return {
    seed,
    heightGrid,
    surfaceGrid,
    surfaceHeights,
    landmarks,
    mountainPeaks,
    trailSegments,
    riverCrossings,
    buildings,
    ruinedHouses,
    caves,
    bridges,
    ruins,
    logPiles,
    doors,
    windows,
    interiorItems,
    cocoraMonument,
    helicopterWreck,
    blastCrater,
    props,
    lootSpawns,
    wildlifeSpawns,
    colliders,
    exclusion,
    getTerrainHeightAt,
    getGroundHeightAt,
    getTerrainNormalAt,
    getSlopeAt,
    getSurfaceAt,
    getFloorBelowY,
    getTopSolidY,
    isInWater,
    isConcealedInBush,
    findSafeLootPlacement,
    getBlock(gx, gy, gz) {
      const wx = gridToWorldX(gx);
      const wz = gridToWorldZ(gz);
      const wp = getWaterProfileAt(wx, wz);
      if (gy === 2 && wp.active && wp.distFromEdge < 0) return BLOCK.WATER;
      return BLOCK.AIR;
    }
  };
}

/** Mapa generado por generateCocoraMap (datos + consultas de suelo/agua/colisión). */
/** @typedef {ReturnType<typeof generateCocoraMap>} CocoraMap */
