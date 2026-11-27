// shared/map/terrain.js
// Generación del terreno del Valle del Cocora y consultas de altura del suelo (deterministas, cliente y servidor).

import {
  CELL_SIZE,
  GRID_SIZE,
  LAGOON_CONFIG,
  RIVER_CENTER_DEPTH,
  RIVER_FORD_DEPTH,
  SURFACE,
  WATER_LEVEL,
  WORLD_HALF
} from '../config.js';
import {
  createRNG,
  distToSegment,
  fbm2D,
  getRiverCenterWorldX,
  getWaterProfileAt,
  smoothstep,
  valueNoise2D,
  worldToGridX,
  worldToGridZ
} from '../math.js';
import {
  SpatialCollisionIndex,
  SpatialExclusionGrid
} from '../spatial.js';
import {
  POIS,
  MOUNTAIN_PEAKS,
  COFFEE_TERRACE_ZONES,
  BRIDGE_Z_COORDS,
  FORD_Z_COORDS
} from './pois.data.js';

/**
 * Terreno base: POIs, montañas, senderos, malla de alturas 321x321 con río y laguna, nivelación de mesetas y
 * contenedores vacíos (colisionadores, edificios, puertas...) que llenan las secciones siguientes.
 * @param {number} seed semilla del mapa
 * @returns {object} estado compartido de la generación (se pasa a buildStructures/createGroundQueries/buildProps)
 */
export function buildTerrain(seed) {
  const rng = createRNG(seed);
  const V = GRID_SIZE + 1;
  const heightGrid = new Float32Array(V * V);
  const surfaceGrid = new Uint8Array(V * V);
  const surfaceHeights = new Uint8Array(GRID_SIZE * GRID_SIZE);

  // Puntos de Interés (POIs) expandidos en todo el mapa de 640x640 metros (elevados sobre mesetas naturales, nunca en huecos)
  const salento = { ...POIS.salento };
  const fincaOcaso = { ...POIS.fincaOcaso };
  const fincaPalma = { ...POIS.fincaPalma };
  const lumberCamp = { ...POIS.lumberCamp };
  const bodegaRio = { ...POIS.bodegaRio };
  const puestoNorte = { ...POIS.puestoNorte };
  const puestoSur = { ...POIS.puestoSur };
  const caserioEste = { ...POIS.caserioEste };
  const mountainRuins = { ...POIS.mountainRuins };
  const mirador = { ...POIS.mirador };

  const landmarks = [
    salento,
    fincaOcaso,
    fincaPalma,
    lumberCamp,
    bodegaRio,
    puestoNorte,
    puestoSur,
    caserioEste,
    mountainRuins,
    mirador
  ];

  // 3 Montañas Escarpadas Imponentes con laderas transitables y cuevas en su base
  const mountainPeaks = MOUNTAIN_PEAKS.map((p) => ({ ...p }));

  const coffeeTerraceZones = COFFEE_TERRACE_ZONES.map((z) => ({ ...z }));

  // 4 Puentes sobre el Río Quindío y 2 vados amplios
  const bridgeZCoords = [...BRIDGE_Z_COORDS];
  const fordZCoords = [...FORD_Z_COORDS];
  const riverCrossings = [];

  for (const bz of bridgeZCoords) {
    riverCrossings.push({ type: 'bridge', x: getRiverCenterWorldX(bz), z: bz });
  }
  for (const fz of fordZCoords) {
    riverCrossings.push({ type: 'ford', x: getRiverCenterWorldX(fz), z: fz });
  }

  const bFarNorth = { x: getRiverCenterWorldX(-192), z: -192 };
  const bNorth = { x: getRiverCenterWorldX(-64), z: -64 };
  const bCenter = { x: getRiverCenterWorldX(56), z: 56 };
  const bSouth = { x: getRiverCenterWorldX(186), z: 186 };

  // Red de caminos y senderos de montaña conectando pueblos, caseríos, puentes y cuevas
  const trailSegments = [
    [salento.x - 24, salento.z + 10, bCenter.x + 25, bCenter.z],
    [bCenter.x - 25, bCenter.z, bodegaRio.x + 12, bodegaRio.z],
    [bodegaRio.x - 12, bodegaRio.z, -210, 46], // Sendero hacia Cueva del Farallón
    [salento.x - 22, salento.z - 16, bNorth.x + 25, bNorth.z],
    [bNorth.x - 25, bNorth.z, mirador.x + 12, mirador.z],
    [mirador.x - 10, mirador.z - 12, lumberCamp.x + 14, lumberCamp.z],
    [salento.x - 8, salento.z - 38, puestoNorte.x, puestoNorte.z + 14],
    [puestoNorte.x - 14, puestoNorte.z, bFarNorth.x + 25, bFarNorth.z],
    [bFarNorth.x - 25, bFarNorth.z, -98, -202], // Sendero hacia Cueva Morrogacho
    [salento.x + 26, salento.z - 20, fincaPalma.x - 10, fincaPalma.z + 12],
    [salento.x + 34, salento.z + 8, caserioEste.x - 14, caserioEste.z],
    [salento.x + 14, salento.z + 36, mountainRuins.x - 12, mountainRuins.z - 10],
    [mountainRuins.x + 12, mountainRuins.z + 12, 198, 178], // Sendero hacia Cueva del Cóndor
    [198, 178, 232, 212],                                   // Sendero de cumbre al Peñón del Cóndor
    [-98, -202, -96, -244],                                 // Sendero de cumbre al Cerro Morrogacho
    [-210, 46, -246, 56],                                   // Sendero de cumbre al Farallón Cafetero
    [salento.x - 8, salento.z - 38, 8, -36],                // Sendero a Explanada del Helicóptero
    [8, -36, 4, -84],                                       // Sendero empedrado al Monumento COCORA
    [salento.x + 2, salento.z + 40, puestoSur.x, puestoSur.z - 16],
    [puestoSur.x - 14, puestoSur.z - 6, bSouth.x + 25, bSouth.z],
    [bSouth.x - 25, bSouth.z, fincaOcaso.x + 14, fincaOcaso.z]
  ];

  // 1. Generación base de malla orgánica continua (321x321 vértices) con río elevado y laguna nadable
  for (let vz = 0; vz < V; vz++) {
    const wz = (vz - GRID_SIZE / 2) * CELL_SIZE;

    let fordFactor = 0;
    for (const fz of fordZCoords) {
      const df = Math.abs(wz - fz);
      if (df < 13) fordFactor = Math.max(fordFactor, smoothstep(1 - df / 13));
    }

    for (let vx = 0; vx < V; vx++) {
      const wx = (vx - GRID_SIZE / 2) * CELL_SIZE;

      const macro = fbm2D((wx + 520) / 175, (wz + 520) / 175, seed, 4);
      const ridge = 1 - Math.abs(fbm2D((wx - 310) / 125, (wz + 240) / 125, seed + 503, 3) * 2 - 1);
      const micro = valueNoise2D((wx + 950) / 30, (wz + 950) / 30, seed + 991);

      let h = 6.2 + macro * 18.5 + ridge * ridge * 9.5 + (micro - 0.5) * 1.25;

      // Montañas escarpadas imponentes con crestas rocosas
      for (const pk of mountainPeaks) {
        const dp = Math.hypot(wx - pk.x, wz - pk.z);
        if (dp < pk.radius) {
          const pf = smoothstep(1 - dp / pk.radius);
          const crag = valueNoise2D((wx + 200) / 16, (wz - 200) / 16, seed + 733) * 4.5;
          h += (pf * pf * pk.addHeight) + pf * crag;
        }
      }

      // Colina prominente del Monumento "COCORA" dominando el valle central
      const dCocoraHill = Math.hypot(wx - 4, wz - (-88));
      if (dCocoraHill < 36) {
        const chf = smoothstep(1 - dCocoraHill / 36);
        h += chf * chf * 11.8;
      }

      const edgeDist = WORLD_HALF - Math.max(Math.abs(wx), Math.abs(wz));
      if (edgeDist < 54) {
        const ef = smoothstep(1 - edgeDist / 54);
        h += ef * ef * 28.0;
      }

      let inCoffeeTerrace = false;
      for (const cz of coffeeTerraceZones) {
        const dc = Math.hypot(wx - cz.x, wz - cz.z);
        if (dc < cz.r) {
          const tf = smoothstep(1 - dc / cz.r);
          const terraced = Math.floor(h / 1.65) * 1.65 + smoothstep((h % 1.65) / 1.65) * 0.45;
          h = h * (1 - tf * 0.68) + terraced * (tf * 0.68);
          if (tf > 0.35) inCoffeeTerrace = true;
        }
      }

      let poiSurf = null;
      const dSal = Math.hypot(wx - salento.x, wz - salento.z);
      if (dSal < salento.radius * 0.68) poiSurf = SURFACE.TOWN_COBBLESTONE;
      else if (Math.hypot(wx - lumberCamp.x, wz - lumberCamp.z) < 22) poiSurf = SURFACE.LUMBER_EARTH;
      else if (Math.hypot(wx - mountainRuins.x, wz - mountainRuins.z) < 20) poiSurf = SURFACE.RUINS_STONE;

      let minTrailDist = 999;
      for (const [ax, az, bx, bz] of trailSegments) {
        const td = distToSegment(wx, wz, ax, az, bx, bz);
        if (td < minTrailDist) minTrailDist = td;
      }
      const onTrail = minTrailDist < 3.8;

      const wp = getWaterProfileAt(wx, wz);
      let surf = SURFACE.GRASS_VALLEY;

      // Corredor aluvial amplio (36m desde la orilla): integra suavemente el valle al nivel del agua sin cañones
      if (wp.active && wp.distFromEdge < 36.0) {
        if (wp.distFromEdge > 0) {
          const valleyT = smoothstep(wp.distFromEdge / 36.0);
          const meadowTarget = WATER_LEVEL + 1.12 + (micro - 0.5) * 0.42;
          h = meadowTarget + (h - meadowTarget) * (0.18 + 0.82 * valleyT);
        }

        if (wp.distFromEdge <= 0) {
          // Lecho continuo C1 desde 0m en la orilla exacta hasta RIVER_CENTER_DEPTH / LAGOON_CONFIG.maxDepth
          const inward = Math.max(0, Math.min(1, -wp.distFromEdge / Math.max(1.0, wp.halfWidth)));
          const bedCurve = smoothstep(Math.min(1, inward / 0.72));
          const channelMaxDepth =
            RIVER_CENTER_DEPTH + (LAGOON_CONFIG.maxDepth - RIVER_CENTER_DEPTH) * wp.lagoonFactor;
          const effMaxDepth =
            fordFactor > 0.05 && wp.lagoonFactor < 0.05
              ? channelMaxDepth * (1 - fordFactor) + RIVER_FORD_DEPTH * fordFactor
              : channelMaxDepth;
          const depth = effMaxDepth * bedCurve;
          h = WATER_LEVEL + 0.04 * (1 - smoothstep(inward / 0.16)) - depth;
          surf = inward < 0.14 ? SURFACE.RIVER_SAND : SURFACE.RIVER_BED;
        } else if (wp.distFromEdge < 14.5) {
          // Transición gradual sin cortes verticales: orilla húmeda de arena/grava -> pradera verde del valle
          const bankT = smoothstep(wp.distFromEdge / 14.5);
          const shoreEdgeY = WATER_LEVEL + 0.04;
          h = shoreEdgeY + (h - shoreEdgeY) * bankT;
          const sandWidth = 4.6 + wp.lagoonFactor * 2.4 + micro * 1.3;
          surf = wp.distFromEdge < sandWidth ? SURFACE.RIVER_SAND : (poiSurf ?? SURFACE.GRASS_VALLEY);
        } else if (poiSurf !== null) {
          surf = poiSurf;
        } else if (onTrail && h > WATER_LEVEL + 0.45) {
          surf = SURFACE.DIRT_TRAIL;
        } else if (inCoffeeTerrace && h > WATER_LEVEL + 1.0) {
          surf = SURFACE.COFFEE_TERRACE;
        } else if (h >= 24) {
          surf = SURFACE.GRASS_MOUNTAIN;
        }
      } else if (poiSurf !== null) {
        surf = poiSurf;
      } else if (onTrail && h > WATER_LEVEL + 0.5) {
        surf = SURFACE.DIRT_TRAIL;
      } else if (inCoffeeTerrace && h > WATER_LEVEL + 1.2) {
        surf = SURFACE.COFFEE_TERRACE;
      } else if (h >= 24) {
        surf = SURFACE.GRASS_MOUNTAIN;
      }

      heightGrid[vz * V + vx] = h;
      surfaceGrid[vz * V + vx] = surf;
    }
  }

  // Pasada de suavizado laplaciano ponderado exclusivamente en la franja ribereña y de desembocadura
  // para eliminar cualquier arista triangular diagonal entre orilla verde, grava húmeda y lecho.
  const smoothedHeights = new Float32Array(heightGrid);
  for (let vz = 1; vz < V - 1; vz++) {
    const wz = (vz - GRID_SIZE / 2) * CELL_SIZE;
    for (let vx = 1; vx < V - 1; vx++) {
      const wx = (vx - GRID_SIZE / 2) * CELL_SIZE;
      const wp = getWaterProfileAt(wx, wz);
      if (!wp.active || wp.distFromEdge < -2.8 || wp.distFromEdge > 15.5) continue;
      const idx = vz * V + vx;
      const avgNeighbors =
        (heightGrid[idx - 1] +
          heightGrid[idx + 1] +
          heightGrid[idx - V] +
          heightGrid[idx + V]) * 0.25;
      smoothedHeights[idx] = heightGrid[idx] * 0.58 + avgNeighbors * 0.42;
    }
  }
  heightGrid.set(smoothedHeights);

  // Helper de lectura cruda del terreno (malla continua de triángulos)
  function getTerrainHeightAt(wx, wz) {
    const fx = Math.max(0, Math.min(GRID_SIZE - 0.001, (wx + WORLD_HALF) / CELL_SIZE));
    const fz = Math.max(0, Math.min(GRID_SIZE - 0.001, (wz + WORLD_HALF) / CELL_SIZE));
    const gx = Math.floor(fx);
    const gz = Math.floor(fz);
    const tx = fx - gx;
    const tz = fz - gz;

    const h00 = heightGrid[gz * V + gx];
    const h10 = heightGrid[gz * V + (gx + 1)];
    const h01 = heightGrid[(gz + 1) * V + gx];
    const h11 = heightGrid[(gz + 1) * V + (gx + 1)];

    if (tx + tz <= 1) {
      return h00 + tx * (h10 - h00) + tz * (h01 - h00);
    }
    return h11 + (1 - tx) * (h01 - h11) + (1 - tz) * (h10 - h11);
  }

  // Helper para nivelar una plataforma rectangular u orientada sobre heightGrid sin crear jamás un hueco
  function levelRectPlatform(cx, cz, halfW, halfD, targetY, blendMargin = 5.0, raiseOnly = false, surfOverride = null) {
    const vx0 = Math.max(0, Math.floor((cx - halfW - blendMargin + WORLD_HALF) / CELL_SIZE));
    const vx1 = Math.min(GRID_SIZE, Math.ceil((cx + halfW + blendMargin + WORLD_HALF) / CELL_SIZE));
    const vz0 = Math.max(0, Math.floor((cz - halfD - blendMargin + WORLD_HALF) / CELL_SIZE));
    const vz1 = Math.min(GRID_SIZE, Math.ceil((cz + halfD + blendMargin + WORLD_HALF) / CELL_SIZE));

    for (let vz = vz0; vz <= vz1; vz++) {
      const wz = (vz - GRID_SIZE / 2) * CELL_SIZE;
      if (Math.abs(wz - cz) > halfD + blendMargin) continue;
      for (let vx = vx0; vx <= vx1; vx++) {
        const wx = (vx - GRID_SIZE / 2) * CELL_SIZE;
        if (getWaterProfileAt(wx, wz).distFromEdge < 5.2) continue;

        const dx = Math.max(0, Math.abs(wx - cx) - halfW);
        const dz = Math.max(0, Math.abs(wz - cz) - halfD);
        const outDist = Math.hypot(dx, dz);
        if (outDist > blendMargin) continue;

        const idx = vz * V + vx;
        const curH = heightGrid[idx];
        if (outDist <= 0.001) {
          heightGrid[idx] = raiseOnly ? Math.max(curH, targetY) : targetY;
          if (surfOverride !== null) surfaceGrid[idx] = surfOverride;
        } else {
          const w = smoothstep(1 - outDist / blendMargin);
          // Si el terreno exterior es más alto que la plataforma, bajarlo suavemente para eliminar el efecto "hueco"
          if (!raiseOnly || curH < targetY) {
            heightGrid[idx] = curH * (1 - w) + targetY * w;
          } else if (curH > targetY) {
            heightGrid[idx] = curH * (1 - w * 0.92) + targetY * (w * 0.92);
          }
        }
      }
    }
  }

  const exclusion = new SpatialExclusionGrid(8);
  const stealthBushGrid = new SpatialExclusionGrid(6);
  const colliders = new SpatialCollisionIndex(10);
  const buildings = [];
  const ruinedHouses = [];
  const caves = [];
  const bridges = [];
  const ruins = [];
  const logPiles = [];
  const doors = [];
  const windows = [];
  const interiorItems = {
    beds: [],
    tables: [],
    chairs: [],
    cabinets: [],
    paintings: [],
    lamps: []
  };
  const lootSpawns = [];
  const wildlifeSpawns = [];

  for (const [ax, az, bx, bz] of trailSegments) {
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 3.2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      exclusion.register(ax + (bx - ax) * t, az + (bz - az) * t, 3.2);
    }
  }

  const addLootSpawn = (x, exactSurfaceY, z, preferredType = null, onFlatStructure = false) => {
    lootSpawns.push({ x, y: exactSurfaceY, z, preferredType, onFlatStructure });
  };


  return {
    rng,
    V,
    heightGrid,
    surfaceGrid,
    surfaceHeights,
    salento,
    fincaOcaso,
    fincaPalma,
    lumberCamp,
    bodegaRio,
    puestoNorte,
    puestoSur,
    caserioEste,
    mountainRuins,
    mirador,
    landmarks,
    mountainPeaks,
    coffeeTerraceZones,
    bridgeZCoords,
    riverCrossings,
    trailSegments,
    getTerrainHeightAt,
    levelRectPlatform,
    exclusion,
    stealthBushGrid,
    colliders,
    buildings,
    ruinedHouses,
    caves,
    bridges,
    ruins,
    logPiles,
    doors,
    windows,
    interiorItems,
    lootSpawns,
    wildlifeSpawns,
    addLootSpawn
  };
}

/**
 * Consultas de altura física exacta (terreno + puentes + plataformas), normal, pendiente y superficie.
 * @param {object} ctx estado de buildTerrain + buildStructures
 * @returns {object} funciones de consulta del suelo
 */
export function createGroundQueries(ctx) {
  const {
    buildings,
    evaluateBridgeHeight,
    getTerrainHeightAt,
    surfaceGrid,
    V
  } = ctx;

  // ==================== FUNCIÓN UNIFICADA DE ALTURA FÍSICA EXACTA ====================
  // Devuelve la cota exacta en terreno, puentes (tablero + rampas), cuevas y pisos superiores / escaleras de edificios multinivel.
  function getGroundHeightAt(wx, wz, refY) {
    let bestY = getTerrainHeightAt(wx, wz);

    // 1. Puentes sobre el Río Quindío (tablero y rampas suaves)
    const bridgeH = evaluateBridgeHeight(wx, wz);
    if (bridgeH !== null) {
      if (refY === undefined || refY >= bridgeH - 2.1) {
        bestY = Math.max(bestY, bridgeH);
      }
    }

    // 2. Pisos, terrazas, balcones, escaleras interiores y azoteas de edificios multinivel
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (Math.abs(wx - b.x) > b.w * 0.5 + 2.2 || Math.abs(wz - b.z) > b.d * 0.5 + 2.2) continue;

      if (refY === undefined) {
        // Sin cota de referencia de entidad, devolver la cota nivelada de planta baja del edificio
        if (Math.abs(wx - b.x) <= b.w * 0.5 + 0.35 && Math.abs(wz - b.z) <= b.d * 0.5 + 0.35) {
          bestY = Math.max(bestY, b.floorY);
        }
        continue;
      }

      const maxReachY = refY + 1.15;

      // Evaluar losas transitables (planta baja, piso 2, piso 3, balcones, azoteas)
      for (let s = 0; s < b.walkableSlabs.length; s++) {
        const sl = b.walkableSlabs[s];
        if (wx >= sl.minX - 0.08 && wx <= sl.maxX + 0.08 && wz >= sl.minZ - 0.08 && wz <= sl.maxZ + 0.08) {
          if (sl.y <= maxReachY && sl.y > bestY) {
            bestY = sl.y;
          }
        }
      }

      // Evaluar tramos continuos de escaleras interiores
      for (let stIdx = 0; stIdx < b.stairs.length; stIdx++) {
        const st = b.stairs[stIdx];
        if (wx >= st.minX - 0.06 && wx <= st.maxX + 0.06 && wz >= st.minZ - 0.12 && wz <= st.maxZ + 0.12) {
          const t = Math.max(0, Math.min(1, (wz - st.zStart) / (st.zEnd - st.zStart)));
          const stairY = st.y0 + (st.y1 - st.y0) * t;
          if (stairY <= maxReachY && stairY > bestY) {
            bestY = stairY;
          }
        }
      }
    }

    return bestY;
  }

  function getTerrainNormalAt(wx, wz) {
    const eps = 0.6;
    const hL = getTerrainHeightAt(wx - eps, wz);
    const hR = getTerrainHeightAt(wx + eps, wz);
    const hD = getTerrainHeightAt(wx, wz - eps);
    const hU = getTerrainHeightAt(wx, wz + eps);
    const nx = hL - hR;
    const ny = 2 * eps;
    const nz = hD - hU;
    const len = Math.hypot(nx, ny, nz) || 1;
    return { x: nx / len, y: ny / len, z: nz / len };
  }

  function getSlopeAt(wx, wz) {
    const d = 1.2;
    const hx = getTerrainHeightAt(wx + d, wz) - getTerrainHeightAt(wx - d, wz);
    const hz = getTerrainHeightAt(wx, wz + d) - getTerrainHeightAt(wx, wz - d);
    return Math.hypot(hx, hz) / (2 * d);
  }

  function getSurfaceAt(wx, wz) {
    const gx = worldToGridX(wx);
    const gz = worldToGridZ(wz);
    return surfaceGrid[gz * V + gx];
  }


  return {
    getGroundHeightAt,
    getTerrainNormalAt,
    getSlopeAt,
    getSurfaceAt
  };
}
