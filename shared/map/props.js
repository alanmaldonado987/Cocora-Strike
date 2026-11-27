// shared/map/props.js
// Props del mapa: vegetación orgánica sin cuadrículas, cobertura táctica con colisión deslizante y spawns de fauna.
// @ts-check

import {
  fbm2D,
  getRiverCenterWorldX,
  getWaterProfileAt
} from '../math.js';
import {
  LAGOON_CONFIG,
  SURFACE,
  WATER_LEVEL,
  WORLD_HALF,
  WORLD_SIZE
} from '../config.js';

/**
 * Naturaleza orgánica (palmas, cafetos, arbustos, rocas), obstáculos tácticos de cobertura y fauna.
 * @param {object} ctx estado de las secciones anteriores
 * @returns {object} props generados
 */
export function buildProps(ctx) {
  const {
    bodegaRio,
    bridges,
    caserioEste,
    coffeeTerraceZones,
    colliders,
    craterInnerR,
    craterX,
    craterZ,
    exclusion,
    fincaOcaso,
    fincaPalma,
    getSlopeAt,
    getSurfaceAt,
    getTerrainHeightAt,
    lumberCamp,
    puestoNorte,
    puestoSur,
    rng,
    salento,
    stealthBushGrid,
    trailSegments,
    wildlifeSpawns,
    seed
  } = ctx;

  // ==================== 6. NATURALEZA 100% ORGÁNICA Y ALEATORIA (CERO PATRONES EN CUADRÍCULA) ====================
  const props = {
    waxPalms: [],
    cloudTrees: [],
    stealthBushes: [],
    coffeeBushes: [],
    ferns: [],
    tallGrass: [],
    boulders: [],
    riverCobbles: [],
    riverFoam: [],
    stoneWalls: [],
    coffeeSacks: [],
    barrels: [],
    woodenCarts: [],
    fences: [],
    fallenLogs: []
  };

  // Rocas alrededor del cráter de explosión (trinchera natural) y cantos rodados / peñascos erosionados en río y laguna
  const craterColors = ['#57534e', '#65605b', '#4d5359'];
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2 + (rng() - 0.5) * 0.28;
    const rr = craterInnerR + 1.4 + rng() * 1.6;
    const rx = craterX + Math.cos(ang) * rr;
    const rz = craterZ + Math.sin(ang) * rr;
    const ry = getTerrainHeightAt(rx, rz);
    const sz = 1.05 + rng() * 0.85;
    colliders.addCylinder(rx, rz, sz * 0.43, ry - 0.5, ry + sz * 0.72, 'boulder');
    props.boulders.push({
      x: rx,
      y: ry,
      z: rz,
      scale: sz,
      sx: sz * (0.9 + rng() * 0.22),
      sy: sz * (0.82 + rng() * 0.28),
      sz: sz * (0.9 + rng() * 0.22),
      rotX: (rng() - 0.5) * 0.45,
      rotY: rng() * Math.PI * 2,
      rotZ: (rng() - 0.5) * 0.45,
      colorHex: craterColors[i % craterColors.length]
    });
  }

  const wetRiverRockColors = ['#46525e', '#3e4a56', '#505e6b', '#4b6154'];
  for (let wz = -WORLD_HALF + 18; wz <= LAGOON_CONFIG.mouthStartZ - 8; wz += 13.5) {
    const nearBridge = bridges.some((br) => Math.abs(wz - br.z) < 12);
    if (nearBridge || Math.abs(wz + 250) < 4.5) continue;
    const cx = getRiverCenterWorldX(wz) + (rng() - 0.5) * 9.2;
    const bedY = getTerrainHeightAt(cx, wz);
    const rockScale = 1.35 + rng() * 1.15;
    const emergenceY = Math.max(bedY + 0.15, WATER_LEVEL - 0.18);
    colliders.addCylinder(cx, wz, rockScale * 0.42, bedY - 0.4, emergenceY + rockScale * 0.62, 'boulder');
    props.riverCobbles.push({
      x: cx,
      y: emergenceY,
      z: wz,
      scale: rockScale,
      sx: rockScale * (0.95 + rng() * 0.22),
      sy: rockScale * (0.78 + rng() * 0.22),
      sz: rockScale * (0.95 + rng() * 0.22),
      rotX: (rng() - 0.5) * 0.55,
      rotY: rng() * Math.PI * 2,
      rotZ: (rng() - 0.5) * 0.55,
      colorHex: wetRiverRockColors[Math.floor(rng() * wetRiverRockColors.length)]
    });
    props.riverFoam.push({ x: cx, y: WATER_LEVEL + 0.05, z: wz, scale: rockScale * 0.95, rotY: rng() * Math.PI * 2 });
  }

  // Cantos rodados húmedos y rocas erosionadas bordeando las orillas del río y la desembocadura de la laguna
  for (let i = 0; i < 950 && props.riverCobbles.length < 110; i++) {
    const inLagoonZone = i % 3 === 0;
    const wz = inLagoonZone
      ? LAGOON_CONFIG.mouthStartZ + rng() * (LAGOON_CONFIG.endZ - LAGOON_CONFIG.mouthStartZ)
      : (rng() - 0.5) * (WORLD_SIZE - 44);
    if (Math.abs(wz + 250) < 4.5 || bridges.some((br) => Math.abs(wz - br.z) < 9.5)) continue;
    const side = rng() < 0.5 ? -1 : 1;
    const wpCenter = getWaterProfileAt(getRiverCenterWorldX(wz), wz);
    if (!wpCenter.active) continue;
    const shoreOffset = wpCenter.halfWidth + 0.6 + rng() * 6.8;
    const rx = wpCenter.centerX + side * shoreOffset;
    if (Math.abs(rx) > WORLD_HALF - 16) continue;
    const ry = getTerrainHeightAt(rx, rzSafe(wz));
    if (ry < WATER_LEVEL - 0.15 || getSlopeAt(rx, wz) > 0.72) continue;
    const sz = 0.68 + Math.pow(rng(), 1.3) * 1.65;
    if (!exclusion.canPlace(rx, wz, sz * 0.5 + 0.55)) continue;
    exclusion.register(rx, wz, sz * 0.45 + 0.35);
    if (sz >= 1.1) {
      colliders.addCylinder(rx, wz, sz * 0.42, ry - 0.6, ry + sz * 0.58, 'boulder');
    }
    props.riverCobbles.push({
      x: rx,
      y: ry,
      z: wz,
      scale: sz,
      sx: sz * (0.92 + rng() * 0.28),
      sy: sz * (0.72 + rng() * 0.28),
      sz: sz * (0.92 + rng() * 0.28),
      rotX: (rng() - 0.5) * 0.85,
      rotY: rng() * Math.PI * 2,
      rotZ: (rng() - 0.5) * 0.85,
      colorHex: wetRiverRockColors[Math.floor(rng() * wetRiverRockColors.length)]
    });
  }

  function rzSafe(val) {
    return val;
  }

  // Cercas de madera con postes de piedra bordeando los senderos principales
  for (let segIdx = 0; segIdx < Math.min(8, trailSegments.length); segIdx++) {
    const [ax, az, bx, bz] = trailSegments[segIdx];
    const segLen = Math.hypot(bx - ax, bz - az);
    if (segLen < 18) continue;
    const dirX = (bx - ax) / segLen;
    const dirZ = (bz - az) / segLen;
    const perpX = -dirZ;
    const perpZ = dirX;
    const fenceRotY = Math.atan2(dirX, dirZ) + Math.PI * 0.5;
    for (let d = 10; d < segLen - 10; d += 14.5) {
      const side = (Math.floor(d / 14) % 2 === 0) ? 1 : -1;
      const fx = ax + dirX * d + perpX * (side * 4.7);
      const fz = az + dirZ * d + perpZ * (side * 4.7);
      if (getWaterProfileAt(fx, fz).distFromEdge < 8.5) continue;
      const fy = getTerrainHeightAt(fx, fz);
      const surf = getSurfaceAt(fx, fz);
      if (fy <= WATER_LEVEL + 0.9 || surf === SURFACE.TOWN_COBBLESTONE || surf === SURFACE.SCORCHED_EARTH) continue;
      if (getSlopeAt(fx, fz) > 0.45 || !exclusion.canPlace(fx, fz, 1.8)) continue;
      const hx = Math.abs(dirX) * 1.76 + 0.24;
      const hz = Math.abs(dirZ) * 1.76 + 0.24;
      exclusion.register(fx, fz, 1.8);
      colliders.addBox(fx - hx, fx + hx, fy - 0.4, fy + 1.14, fz - hz, fz + hz, false, 'fence');
      props.fences.push({ x: fx, y: fy, z: fz, scale: 1.0, rotY: fenceRotY });
    }
  }

  // ==================== 6A. OBSTÁCULOS TÁCTICOS SÓLIDOS DE COBERTURA (INSTANCEDMESH + COLISIÓN DESLIZANTE) ====================
  // Muros bajos de piedra/adobe, sacos de café apilados, barriles, carretas, cercas y troncos caídos
  const tacticalHubs = [
    { x: salento.x, z: salento.z, r: 58 },
    { x: fincaOcaso.x, z: fincaOcaso.z, r: 34 },
    { x: fincaPalma.x, z: fincaPalma.z, r: 34 },
    { x: bodegaRio.x, z: bodegaRio.z, r: 32 },
    { x: puestoNorte.x, z: puestoNorte.z, r: 28 },
    { x: puestoSur.x, z: puestoSur.z, r: 28 },
    { x: caserioEste.x, z: caserioEste.z, r: 32 },
    { x: lumberCamp.x, z: lumberCamp.z, r: 32 }
  ];

  // 1. Muros bajos de piedra/adobe (3.4m x 1.18m x 0.50m) ideales para cubrirse agachado
  for (let i = 0; i < 1400 && props.stoneWalls.length < 48; i++) {
    const hub = i < 900 ? tacticalHubs[i % tacticalHubs.length] : null;
    const ang = rng() * Math.PI * 2;
    const dist = hub ? 14 + rng() * hub.r : 0;
    const wx = hub ? hub.x + Math.cos(ang) * dist : (rng() - 0.5) * (WORLD_SIZE - 60);
    const wz = hub ? hub.z + Math.sin(ang) * dist : (rng() - 0.5) * (WORLD_SIZE - 60);
    if (getWaterProfileAt(wx, wz).distFromEdge < 7.0) continue;

    const gy = getTerrainHeightAt(wx, wz);
    const surf = getSurfaceAt(wx, wz);
    if (gy <= WATER_LEVEL + 0.8 || surf === SURFACE.CAVE_ROCK || surf === SURFACE.DIRT_TRAIL || getSlopeAt(wx, wz) > 0.42) continue;
    if (!exclusion.canPlace(wx, wz, 2.3)) continue;

    const ewOrient = rng() < 0.5;
    const rotY = (ewOrient ? 0 : Math.PI * 0.5) + (rng() - 0.5) * 0.14;
    const hx = ewOrient ? 1.7 : 0.28;
    const hz = ewOrient ? 0.28 : 1.7;
    exclusion.register(wx, wz, 2.0);
    colliders.addBox(wx - hx, wx + hx, gy - 0.6, gy + 1.18, wz - hz, wz + hz, false, 'stone_wall');
    props.stoneWalls.push({ x: wx, y: gy, z: wz, scale: 1.0, rotY });
  }

  // 2. Sacos de café apilados (~54 instancias alrededor de fincas, bodegas y Salento)
  for (let i = 0; i < 1400 && props.coffeeSacks.length < 54; i++) {
    const hub = tacticalHubs[i % tacticalHubs.length];
    const ang = rng() * Math.PI * 2;
    const dist = 8 + rng() * (hub.r * 0.85);
    const wx = hub.x + Math.cos(ang) * dist;
    const wz = hub.z + Math.sin(ang) * dist;
    if (getWaterProfileAt(wx, wz).distFromEdge < 6.5) continue;

    const gy = getTerrainHeightAt(wx, wz);
    if (gy <= WATER_LEVEL + 0.8 || getSurfaceAt(wx, wz) === SURFACE.CAVE_ROCK || getSlopeAt(wx, wz) > 0.45) continue;
    if (!exclusion.canPlace(wx, wz, 1.35)) continue;

    const scale = 0.9 + rng() * 0.28;
    exclusion.register(wx, wz, 1.2);
    colliders.addBox(wx - 0.72 * scale, wx + 0.72 * scale, gy - 0.4, gy + 0.96 * scale, wz - 0.58 * scale, wz + 0.58 * scale, true, 'sacks');
    props.coffeeSacks.push({ x: wx, y: gy, z: wz, scale, rotY: rng() * Math.PI * 2 });
  }

  // 3. Barriles de madera y metal (~52 instancias)
  for (let i = 0; i < 1400 && props.barrels.length < 52; i++) {
    const hub = tacticalHubs[i % tacticalHubs.length];
    const ang = rng() * Math.PI * 2;
    const dist = 9 + rng() * (hub.r * 0.9);
    const wx = hub.x + Math.cos(ang) * dist;
    const wz = hub.z + Math.sin(ang) * dist;
    if (getWaterProfileAt(wx, wz).distFromEdge < 6.5) continue;

    const gy = getTerrainHeightAt(wx, wz);
    if (gy <= WATER_LEVEL + 0.8 || getSurfaceAt(wx, wz) === SURFACE.CAVE_ROCK || getSlopeAt(wx, wz) > 0.48) continue;
    if (!exclusion.canPlace(wx, wz, 1.1)) continue;

    const scale = 0.92 + rng() * 0.22;
    exclusion.register(wx, wz, 0.95);
    colliders.addCylinder(wx, wz, 0.44 * scale, gy - 0.4, gy + 1.12 * scale, 'barrel');
    props.barrels.push({ x: wx, y: gy, z: wz, scale, rotY: rng() * Math.PI * 2 });
  }

  // 4. Carretas tradicionales cafeteras (~22 instancias junto a fincas, caseríos y calles)
  for (let i = 0; i < 1000 && props.woodenCarts.length < 22; i++) {
    const hub = tacticalHubs[i % tacticalHubs.length];
    const ang = rng() * Math.PI * 2;
    const dist = 12 + rng() * hub.r;
    const wx = hub.x + Math.cos(ang) * dist;
    const wz = hub.z + Math.sin(ang) * dist;
    if (getWaterProfileAt(wx, wz).distFromEdge < 7.0) continue;

    const gy = getTerrainHeightAt(wx, wz);
    if (gy <= WATER_LEVEL + 0.9 || getSurfaceAt(wx, wz) === SURFACE.CAVE_ROCK || getSlopeAt(wx, wz) > 0.35) continue;
    if (!exclusion.canPlace(wx, wz, 2.2)) continue;

    const ewOrient = rng() < 0.5;
    const rotY = (ewOrient ? 0 : Math.PI * 0.5) + (rng() - 0.5) * 0.14;
    const hx = ewOrient ? 1.3 : 0.78;
    const hz = ewOrient ? 0.78 : 1.3;
    exclusion.register(wx, wz, 2.0);
    colliders.addBox(wx - hx, wx + hx, gy - 0.4, gy + 1.22, wz - hz, wz + hz, true, 'cart');
    props.woodenCarts.push({ x: wx, y: gy, z: wz, scale: 1.0, rotY });
  }

  // 5. Cercas rurales de madera (~72 instancias bordeando fincas y praderas)
  for (let i = 0; i < 1800 && props.fences.length < 72; i++) {
    const wx = (rng() - 0.5) * (WORLD_SIZE - 56);
    const wz = (rng() - 0.5) * (WORLD_SIZE - 56);
    if (getWaterProfileAt(wx, wz).distFromEdge < 7.0) continue;

    const gy = getTerrainHeightAt(wx, wz);
    const surf = getSurfaceAt(wx, wz);
    if (gy <= WATER_LEVEL + 0.8 || surf === SURFACE.CAVE_ROCK || surf === SURFACE.DIRT_TRAIL || surf === SURFACE.TOWN_COBBLESTONE) continue;
    if (getSlopeAt(wx, wz) > 0.48 || !exclusion.canPlace(wx, wz, 2.2)) continue;

    const ewOrient = rng() < 0.5;
    const rotY = (ewOrient ? 0 : Math.PI * 0.5) + (rng() - 0.5) * 0.12;
    const hx = ewOrient ? 1.82 : 0.22;
    const hz = ewOrient ? 0.22 : 1.82;
    exclusion.register(wx, wz, 1.95);
    colliders.addBox(wx - hx, wx + hx, gy - 0.4, gy + 1.14, wz - hz, wz + hz, false, 'fence');
    props.fences.push({ x: wx, y: gy, z: wz, scale: 1.0, rotY });
  }

  // 6. Troncos caídos musgosos en bosques y claros (~46 instancias)
  for (let i = 0; i < 1600 && props.fallenLogs.length < 46; i++) {
    const wx = (rng() - 0.5) * (WORLD_SIZE - 48);
    const wz = (rng() - 0.5) * (WORLD_SIZE - 48);
    if (getWaterProfileAt(wx, wz).distFromEdge < 6.5) continue;

    const gy = getTerrainHeightAt(wx, wz);
    const surf = getSurfaceAt(wx, wz);
    if (gy <= WATER_LEVEL + 0.8 || surf === SURFACE.CAVE_ROCK || surf === SURFACE.TOWN_COBBLESTONE || surf === SURFACE.DIRT_TRAIL) continue;
    if (getSlopeAt(wx, wz) > 0.48 || !exclusion.canPlace(wx, wz, 2.3)) continue;

    const ewOrient = rng() < 0.5;
    const rotY = (ewOrient ? 0 : Math.PI * 0.5) + (rng() - 0.5) * 0.18;
    const hx = ewOrient ? 1.95 : 0.34;
    const hz = ewOrient ? 0.34 : 1.95;
    exclusion.register(wx, wz, 2.1);
    colliders.addBox(wx - hx, wx + hx, gy - 0.4, gy + 0.58, wz - hz, wz + hz, true, 'fallen_log');
    props.fallenLogs.push({ x: wx, y: gy, z: wz, scale: 0.92 + rng() * 0.25, rotY });
  }

  // Máscara orgánica de bosques densos mezclados con claros abiertos
  const getForestDensity = (wx, wz) => fbm2D((wx + 810) / 92, (wz - 430) / 92, seed + 1777, 3);

  // Cafetales distribuidos de forma orgánica con jitter irregular (cero filas rígidas)
  for (const cz of coffeeTerraceZones) {
    let placed = 0;
    for (let attempt = 0; attempt < 950 && placed < 85; attempt++) {
      const ang = rng() * Math.PI * 2;
      const rad = Math.sqrt(rng()) * (cz.r - 4);
      const wx = cz.x + Math.cos(ang) * rad + (rng() - 0.5) * 2.8;
      const wz = cz.z + Math.sin(ang) * rad + (rng() - 0.5) * 2.8;
      if (getWaterProfileAt(wx, wz).distFromEdge < 7.0) continue;
      const gy = getTerrainHeightAt(wx, wz);
      const surf = getSurfaceAt(wx, wz);
      if (gy <= WATER_LEVEL + 1.0 || surf === SURFACE.DIRT_TRAIL || getSlopeAt(wx, wz) > 0.78) continue;
      if (!exclusion.canPlace(wx, wz, 1.3)) continue;

      exclusion.register(wx, wz, 1.25);
      props.coffeeBushes.push({ x: wx, y: gy, z: wz, scale: 0.75 + rng() * 0.65, rotY: rng() * Math.PI * 2 });
      placed++;
    }
  }

  // Peñascos irregulares andinos con rotación en 3 ejes, escalas orgánicas y variación cromática (gris andino, húmedo, musgoso)
  const andeanGreyTints = ['#8a929d', '#7c8591', '#959da8', '#7e848a'];
  const mossyForestTints = ['#627d59', '#6e8664', '#587252'];
  const wetBankTints = ['#4b5663', '#535f6d', '#495e54'];
  for (let i = 0; i < 2000 && props.boulders.length < 165; i++) {
    const nearWater = i < 340;
    const wz = (rng() - 0.5) * (WORLD_SIZE - 36);
    if (Math.abs(wz + 250) < 4.5) continue;
    let wx;
    if (nearWater) {
      const wpC = getWaterProfileAt(getRiverCenterWorldX(wz), wz);
      if (!wpC.active) continue;
      wx = wpC.centerX + (rng() < 0.5 ? -1 : 1) * (wpC.halfWidth + 3.2 + rng() * 11.5);
    } else {
      wx = (rng() - 0.5) * (WORLD_SIZE - 36);
    }
    if (Math.abs(wx) > WORLD_HALF - 16) continue;

    const wpHere = getWaterProfileAt(wx, wz);
    if (wpHere.active && wpHere.distFromEdge < 1.2) continue;

    const gy = getTerrainHeightAt(wx, wz);
    const surf = getSurfaceAt(wx, wz);
    if (gy < WATER_LEVEL + 0.1 || surf === SURFACE.CAVE_ROCK || surf === SURFACE.TOWN_COBBLESTONE || getSlopeAt(wx, wz) > 0.95) continue;
    const sizeMeters = 0.8 + Math.pow(rng(), 1.35) * 3.7;
    const radius = sizeMeters * 0.5;
    if (!exclusion.canPlace(wx, wz, radius + 0.85)) continue;

    exclusion.register(wx, wz, radius + 0.55);
    if (sizeMeters >= 1.1) {
      colliders.addCylinder(wx, wz, radius * 0.86, gy - 0.8, gy + sizeMeters * 0.72, 'boulder');
    }

    let colorHex;
    if (wpHere.active && wpHere.distFromEdge < 12.0) {
      colorHex = wetBankTints[Math.floor(rng() * wetBankTints.length)];
    } else if (getForestDensity(wx, wz) > 0.42 && gy < 30) {
      colorHex = mossyForestTints[Math.floor(rng() * mossyForestTints.length)];
    } else {
      colorHex = andeanGreyTints[Math.floor(rng() * andeanGreyTints.length)];
    }

    props.boulders.push({
      x: wx,
      y: gy,
      z: wz,
      scale: sizeMeters,
      sx: sizeMeters * (0.88 + rng() * 0.26),
      sy: sizeMeters * (0.80 + rng() * 0.32),
      sz: sizeMeters * (0.88 + rng() * 0.26),
      rotX: (rng() - 0.5) * 0.62,
      rotY: rng() * Math.PI * 2,
      rotZ: (rng() - 0.5) * 0.62,
      colorHex
    });
  }

  // Palmas de Cera frondosas agrupadas orgánicamente con claros (escala 0.75x a 1.45x, rotación 0..2π)
  for (let i = 0; i < 4200 && props.waxPalms.length < 195; i++) {
    const wx = (rng() - 0.5) * (WORLD_SIZE - 42) + (rng() - 0.5) * 6;
    const wz = (rng() - 0.5) * (WORLD_SIZE - 42) + (rng() - 0.5) * 6;
    if (getWaterProfileAt(wx, wz).distFromEdge < 6.5) continue;

    // Agrupación orgánica: favorece bosquecillos densos y deja claros soleados
    const density = getForestDensity(wx, wz);
    if (density < 0.34 && rng() > 0.18) continue;

    const gy = getTerrainHeightAt(wx, wz);
    const surf = getSurfaceAt(wx, wz);
    if (gy < WATER_LEVEL + 1.0 || gy > 44 || surf === SURFACE.CAVE_ROCK || surf === SURFACE.TOWN_COBBLESTONE) continue;
    if (getSlopeAt(wx, wz) > 0.68 || !exclusion.canPlace(wx, wz, 2.8)) continue;

    const scale = 0.75 + rng() * 0.70; // 0.75x a 1.45x
    exclusion.register(wx, wz, 2.55);
    colliders.addCylinder(wx, wz, 0.35 * scale, gy - 0.25, gy + 16.4 * scale, 'palm_trunk');
    props.waxPalms.push({ x: wx, y: gy, z: wz, scale, rotY: rng() * Math.PI * 2 });
  }

  // Árboles de Bosque de Niebla con agrupación orgánica (escala 0.75x a 1.45x, rotación 0..2π)
  for (let i = 0; i < 4600 && props.cloudTrees.length < 225; i++) {
    const wx = (rng() - 0.5) * (WORLD_SIZE - 38) + (rng() - 0.5) * 5;
    const wz = (rng() - 0.5) * (WORLD_SIZE - 38) + (rng() - 0.5) * 5;
    if (getWaterProfileAt(wx, wz).distFromEdge < 5.5) continue;

    const density = getForestDensity(wx + 120, wz - 90);
    if (density < 0.36 && rng() > 0.20) continue;

    const gy = getTerrainHeightAt(wx, wz);
    const surf = getSurfaceAt(wx, wz);
    if (gy < WATER_LEVEL + 0.9 || surf === SURFACE.CAVE_ROCK || surf === SURFACE.TOWN_COBBLESTONE) continue;
    if (getSlopeAt(wx, wz) > 0.72 || !exclusion.canPlace(wx, wz, 3.6)) continue;

    const scale = 0.75 + rng() * 0.70; // 0.75x a 1.45x
    exclusion.register(wx, wz, 3.2);
    colliders.addCylinder(wx, wz, 0.43 * scale, gy, gy + 6.5 * scale, 'tree_trunk');
    props.cloudTrees.push({ x: wx, y: gy, z: wz, scale, rotY: rng() * Math.PI * 2 });
  }

  // Arbustos Altos de Sigilo (escala 0.75x a 1.45x)
  for (let i = 0; i < 4600 && props.stealthBushes.length < 290; i++) {
    const wx = (rng() - 0.5) * (WORLD_SIZE - 32);
    const wz = (rng() - 0.5) * (WORLD_SIZE - 32);
    const gy = getTerrainHeightAt(wx, wz);
    const surf = getSurfaceAt(wx, wz);
    if (gy < WATER_LEVEL + 0.6 || surf === SURFACE.TOWN_COBBLESTONE || surf === SURFACE.DIRT_TRAIL || surf === SURFACE.CAVE_ROCK) continue;
    if (getSlopeAt(wx, wz) > 0.72 || !exclusion.canPlace(wx, wz, 1.35)) continue;

    const scale = 0.82 + rng() * 0.52;
    exclusion.register(wx, wz, 1.25);
    stealthBushGrid.register(wx, wz, 1.38);
    props.stealthBushes.push({ x: wx, y: gy, z: wz, scale, rotY: rng() * Math.PI * 2 });
  }

  // Helechos gigantes (~230 instancias)
  for (let i = 0; i < 3400 && props.ferns.length < 230; i++) {
    const wx = (rng() - 0.5) * (WORLD_SIZE - 30);
    const wz = (rng() - 0.5) * (WORLD_SIZE - 30);
    const gy = getTerrainHeightAt(wx, wz);
    const surf = getSurfaceAt(wx, wz);
    if (gy < WATER_LEVEL + 0.35 || surf === SURFACE.TOWN_COBBLESTONE || surf === SURFACE.DIRT_TRAIL || surf === SURFACE.CAVE_ROCK) continue;
    if (getSlopeAt(wx, wz) > 0.8 || !exclusion.canPlace(wx, wz, 1.05)) continue;

    exclusion.register(wx, wz, 0.95);
    props.ferns.push({ x: wx, y: gy, z: wz, scale: 0.75 + rng() * 0.70, rotY: rng() * Math.PI * 2 });
  }

  // Hierba alta y flores silvestres (~310 instancias)
  for (let i = 0; i < 4000 && props.tallGrass.length < 310; i++) {
    const wx = (rng() - 0.5) * (WORLD_SIZE - 28);
    const wz = (rng() - 0.5) * (WORLD_SIZE - 28);
    const gy = getTerrainHeightAt(wx, wz);
    const surf = getSurfaceAt(wx, wz);
    if (gy < WATER_LEVEL + 0.45 || surf === SURFACE.TOWN_COBBLESTONE || surf === SURFACE.DIRT_TRAIL || surf === SURFACE.CAVE_ROCK) continue;
    if (getSlopeAt(wx, wz) > 0.75 || !exclusion.canPlace(wx, wz, 0.8)) continue;

    exclusion.register(wx, wz, 0.75);
    props.tallGrass.push({ x: wx, y: gy, z: wz, scale: 0.75 + rng() * 0.70, rotY: rng() * Math.PI * 2 });
  }

  // 7. Fauna Silvestre Colombiana (con rotación y posiciones orgánicas)
  const placeGroundAnimal = (species, count, riverNear = false) => {
    let placed = 0;
    for (let attempt = 0; attempt < 1300 && placed < count; attempt++) {
      const wz = (rng() - 0.5) * (WORLD_SIZE - 90);
      let wx;
      if (riverNear) {
        const wpC = getWaterProfileAt(getRiverCenterWorldX(wz), wz);
        if (!wpC.active) continue;
        wx = wpC.centerX + (rng() < 0.5 ? -1 : 1) * (wpC.halfWidth + 2.5 + rng() * 11.0);
      } else {
        wx = (rng() - 0.5) * (WORLD_SIZE - 90);
      }
      if (Math.abs(wx) > WORLD_HALF - 20) continue;

      if (!riverNear && Math.hypot(wx - salento.x, wz - salento.z) < 62) continue;
      const gy = getTerrainHeightAt(wx, wz);
      const surf = getSurfaceAt(wx, wz);
      if (gy <= WATER_LEVEL + 0.4 || surf === SURFACE.CAVE_ROCK || getSlopeAt(wx, wz) > 0.58) continue;
      if (!exclusion.canPlace(wx, wz, 2.2)) continue;

      exclusion.register(wx, wz, 1.9);
      wildlifeSpawns.push({ species, x: wx, y: gy, z: wz });
      placed++;
    }
  };

  placeGroundAnimal('bear', 8, false);
  placeGroundAnimal('jaguar', 7, false);
  placeGroundAnimal('capybara', 12, true);

  for (let i = 0; i < 6; i++) {
    const angle = rng() * Math.PI * 2;
    const rad = 85 + rng() * 115;
    const cx = Math.cos(angle) * rad;
    const cz = Math.sin(angle) * rad;
    wildlifeSpawns.push({
      species: 'condor',
      x: cx,
      y: Math.max(58, getTerrainHeightAt(cx, cz) + 36 + rng() * 16),
      z: cz
    });
  }


  return {
    props
  };
}
