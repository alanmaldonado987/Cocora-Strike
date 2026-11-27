// shared/map/buildings.js
// Estructuras del mapa: cuevas, puentes, edificios multinivel con puertas/ventanas/interiores, ruinas y POIs especiales.

import {
  CELL_SIZE,
  GRID_SIZE,
  SURFACE,
  WATER_LEVEL,
  WORLD_HALF
} from '../config.js';
import {
  getRiverCenterWorldX,
  smoothstep
} from '../math.js';

/**
 * Cuevas, puentes, arquitectura multinivel (pueblo de Salento, fincas, puestos), casas destruidas, ruinas,
 * monumento COCORA, helicóptero estrellado y cráter.
 * @param {object} ctx estado de buildTerrain
 * @returns {object} datos nuevos usados por las secciones siguientes
 */
export function buildStructures(ctx) {
  const {
    addLootSpawn,
    bodegaRio,
    bridges,
    bridgeZCoords,
    buildings,
    caserioEste,
    caves,
    colliders,
    doors,
    exclusion,
    fincaOcaso,
    fincaPalma,
    getTerrainHeightAt,
    heightGrid,
    interiorItems,
    levelRectPlatform,
    logPiles,
    lumberCamp,
    mirador,
    mountainRuins,
    puestoNorte,
    puestoSur,
    ruinedHouses,
    ruins,
    salento,
    surfaceGrid,
    surfaceHeights,
    V,
    windows
  } = ctx;

  // ==================== 2. CUEVAS ROCOSAS EXPLORABLES EN LAS MONTAÑAS ====================
  const caveDefs = [
    { name: 'Cueva del Cóndor', cx: 210, cz: 190, yaw: -2.35, width: 8.6, length: 16.5, loot: ['sniper', 'medkit', 'ammo'] },
    { name: 'Gruta de Morrogacho', cx: -98, cz: -218, yaw: 0.0, width: 8.6, length: 16.0, loot: ['rifle', 'shotgun', 'medkit'] },
    { name: 'Túnel del Farallón', cx: -224, cz: 52, yaw: Math.PI / 2, width: 8.4, length: 16.0, loot: ['sniper', 'smg', 'bandage'] }
  ];

  for (const cd of caveDefs) {
    const sinY = Math.sin(cd.yaw);
    const cosY = Math.cos(cd.yaw);
    const entX = cd.cx + sinY * (cd.length * 0.5 + 2.0);
    const entZ = cd.cz + cosY * (cd.length * 0.5 + 2.0);
    const floorY = Math.max(WATER_LEVEL + 4.5, getTerrainHeightAt(entX, entZ));
    const halfW = cd.width * 0.5;
    const halfL = cd.length * 0.5;
    const clearanceH = 4.1; // 4.1m de altura interior libre (jugador = 1.80m -> jamás choca con el techo)

    // Nivelar el piso interior de la cueva y su explanada de entrada sobre heightGrid
    const rad = halfL + 9;
    const vx0 = Math.max(0, Math.floor((cd.cx - rad + WORLD_HALF) / CELL_SIZE));
    const vx1 = Math.min(GRID_SIZE, Math.ceil((cd.cx + rad + WORLD_HALF) / CELL_SIZE));
    const vz0 = Math.max(0, Math.floor((cd.cz - rad + WORLD_HALF) / CELL_SIZE));
    const vz1 = Math.min(GRID_SIZE, Math.ceil((cd.cz + rad + WORLD_HALF) / CELL_SIZE));

    for (let vz = vz0; vz <= vz1; vz++) {
      const wz = (vz - GRID_SIZE / 2) * CELL_SIZE;
      for (let vx = vx0; vx <= vx1; vx++) {
        const wx = (vx - GRID_SIZE / 2) * CELL_SIZE;
        const dx = wx - cd.cx;
        const dz = wz - cd.cz;
        // Coordenadas locales: lz apunta hacia la entrada (+halfL), lx transversal
        const lz = dx * sinY + dz * cosY;
        const lx = dx * cosY - dz * sinY;

        const overX = Math.max(0, Math.abs(lx) - (halfW + 0.8));
        const overZ = lz < -halfL - 0.8 ? (-halfL - 0.8 - lz) : lz > halfL + 4.5 ? (lz - (halfL + 4.5)) : 0;
        const distOut = Math.hypot(overX, overZ);

        if (distOut <= 0.001) {
          heightGrid[vz * V + vx] = floorY;
          surfaceGrid[vz * V + vx] = SURFACE.CAVE_ROCK;
        } else if (distOut < 5.5 && lz > 0) {
          // Suavizar únicamente hacia la entrada exterior; mantener la ladera alta alrededor del fondo
          const w = smoothstep(1 - distOut / 5.5);
          heightGrid[vz * V + vx] = heightGrid[vz * V + vx] * (1 - w) + floorY * w;
        }
      }
    }

    exclusion.register(cd.cx, cd.cz, halfL + 7.5);
    exclusion.register(entX, entZ, 6.5);

    // Muros laterales y fondo rocoso mediante cilindros superpuestos (permiten orientación libre en cualquier ángulo)
    for (let s = -halfL; s <= halfL - 0.5; s += 1.6) {
      for (const side of [-1, 1]) {
        const wx = cd.cx + sinY * s + cosY * (side * (halfW + 0.85));
        const wz = cd.cz + cosY * s - sinY * (side * (halfW + 0.85));
        colliders.addCylinder(wx, wz, 1.15, floorY - 1.0, floorY + 11.5, 'cave_wall');
      }
    }
    for (let lx = -halfW; lx <= halfW; lx += 1.5) {
      const bx = cd.cx - sinY * (halfL + 0.85) + cosY * lx;
      const bz = cd.cz - cosY * (halfL + 0.85) - sinY * lx;
      colliders.addCylinder(bx, bz, 1.2, floorY - 1.0, floorY + 11.5, 'cave_back');
    }

    // Bóveda superior de roca sobre la cueva (minY = floorY + 4.1m para nunca empujar al jugador al techo)
    const vaultR = Math.max(halfW, halfL) * 0.88;
    const roofTopY = floorY + 12.2;
    colliders.addBox(
      cd.cx - vaultR,
      cd.cx + vaultR,
      floorY + clearanceH,
      roofTopY,
      cd.cz - vaultR,
      cd.cz + vaultR,
      true,
      'cave_roof'
    );

    // Loot de alto nivel dentro de la cueva
    addLootSpawn(cd.cx - sinY * 3.2, floorY + 0.04, cd.cz - cosY * 3.2, cd.loot[0], true);
    addLootSpawn(cd.cx + cosY * 1.8, floorY + 0.04, cd.cz - sinY * 1.8, cd.loot[1], true);
    addLootSpawn(cd.cx - cosY * 1.8 + sinY * 2.0, floorY + 0.04, cd.cz + sinY * 1.8 + cosY * 2.0, cd.loot[2], true);

    caves.push({
      name: cd.name,
      x: cd.cx,
      z: cd.cz,
      floorY,
      roofTopY,
      clearanceH,
      yaw: cd.yaw,
      width: cd.width,
      length: cd.length
    });
  }

  // ==================== 3. PUENTES ELEVADOS CON RAMPAS SUAVES SOBRE LAS ORILLAS REALES ====================
  for (const bz of bridgeZCoords) {
    const cx = getRiverCenterWorldX(bz);
    const spanFlatHalf = 17.5; // Tablero horizontal amplio sobre todo el cauce
    const rampLen = 7.5;       // Rampas suaves de 7.5m en cada extremo
    const totalHalf = spanFlatHalf + rampLen; // 25.0m (fuera del talud del río de 19.5m)
    const widthHalf = 3.1;

    // Medir altura real de ambas orillas y nivelar estribos de acceso para conexión 100% limpia sin escalones
    const rawLeft = Math.max(WATER_LEVEL + 1.2, getTerrainHeightAt(cx - totalHalf, bz));
    const rawRight = Math.max(WATER_LEVEL + 1.2, getTerrainHeightAt(cx + totalHalf, bz));
    levelRectPlatform(cx - totalHalf - 1.5, bz, 3.0, widthHalf + 1.2, rawLeft, 3.8, false, SURFACE.DIRT_TRAIL);
    levelRectPlatform(cx + totalHalf + 1.5, bz, 3.0, widthHalf + 1.2, rawRight, 3.8, false, SURFACE.DIRT_TRAIL);

    const leftGround = getTerrainHeightAt(cx - totalHalf, bz);
    const rightGround = getTerrainHeightAt(cx + totalHalf, bz);
    // Fórmula exacta: máximo entre ambas orillas + 1.2m (nunca debajo del terreno ni del agua)
    const deckY = Math.max(WATER_LEVEL + 2.4, Math.max(leftGround, rightGround) + 1.2);

    exclusion.register(cx, bz, totalHalf + 4.5);
    bridges.push({
      x: cx,
      z: bz,
      deckY,
      spanHalf: totalHalf,
      spanFlatHalf,
      rampLen,
      totalHalf,
      widthHalf,
      leftGround,
      rightGround
    });

    // Colisionadores alineados con el Puente de Piedra reparado: tablero, 8 tramos suaves de rampa, pretiles completos y pilares inferiores
    colliders.addBox(cx - spanFlatHalf, cx + spanFlatHalf, deckY - 0.36, deckY, bz - widthHalf, bz + widthHalf, true, 'bridge');
    for (let s = 0; s < 8; s++) {
      const t0 = s / 8;
      const t1 = (s + 1) / 8;
      const lyTop = leftGround + (deckY - leftGround) * t1;
      const ryTop = rightGround + (deckY - rightGround) * t1;
      colliders.addBox(cx - totalHalf + rampLen * t0, cx - totalHalf + rampLen * t1, lyTop - 0.45, lyTop, bz - widthHalf, bz + widthHalf, true, 'bridge_ramp');
      colliders.addBox(cx + totalHalf - rampLen * t1, cx + totalHalf - rampLen * t0, ryTop - 0.45, ryTop, bz - widthHalf, bz + widthHalf, true, 'bridge_ramp');
    }
    // Pretiles laterales de piedra sobre el tramo central y las rampas
    colliders.addBox(cx - totalHalf + 0.6, cx + totalHalf - 0.6, Math.min(leftGround, rightGround) - 0.2, deckY + 1.02, bz - widthHalf - 0.24, bz - widthHalf + 0.14, false, 'railing');
    colliders.addBox(cx - totalHalf + 0.6, cx + totalHalf - 0.6, Math.min(leftGround, rightGround) - 0.2, deckY + 1.02, bz + widthHalf - 0.14, bz + widthHalf + 0.24, false, 'railing');
    // Pilares y estribos macizos bajo los arcos del puente (evitan atravesar la mampostería desde el río)
    for (const pierOffX of [-16.8, -5.6, 5.6, 16.8]) {
      const bedH = getTerrainHeightAt(cx + pierOffX, bz) - 0.6;
      colliders.addBox(cx + pierOffX - 1.45, cx + pierOffX + 1.45, bedH, deckY - 0.34, bz - widthHalf, bz + widthHalf, false, 'bridge_pier');
    }

    addLootSpawn(cx, deckY + 0.02, bz, 'ammo', true);
    addLootSpawn(cx + 4.5, deckY + 0.02, bz - 1.0, 'bandage', true);
  }

  function evaluateBridgeHeight(wx, wz) {
    for (let i = 0; i < bridges.length; i++) {
      const br = bridges[i];
      if (Math.abs(wz - br.z) > br.widthHalf || Math.abs(wx - br.x) > br.totalHalf) continue;
      if (wx < br.x - br.spanFlatHalf) {
        const t = Math.max(0, Math.min(1, (wx - (br.x - br.totalHalf)) / br.rampLen));
        return br.leftGround + (br.deckY - br.leftGround) * t;
      }
      if (wx > br.x + br.spanFlatHalf) {
        const t = Math.max(0, Math.min(1, ((br.x + br.totalHalf) - wx) / br.rampLen));
        return br.rightGround + (br.deckY - br.rightGround) * t;
      }
      return br.deckY;
    }
    return null;
  }

  // ==================== 4. ARQUITECTURA MULTINIVEL (1, 2 Y 3 PISOS) CON TERRAZAS Y CIMIENTOS ====================
  // Nivelar la Plaza Central de Salento tomando la cota alta natural de su explanada (cero hundimiento)
  let salentoPlazaH = WATER_LEVEL + 4.5;
  for (let dz = -12; dz <= 12; dz += 4) {
    for (let dx = -12; dx <= 12; dx += 4) {
      salentoPlazaH = Math.max(salentoPlazaH, getTerrainHeightAt(salento.x + dx, salento.z + dz));
    }
  }
  levelRectPlatform(salento.x, salento.z, 14, 14, salentoPlazaH, 8.0, false, SURFACE.TOWN_COBBLESTONE);
  exclusion.register(salento.x, salento.z, 13.5);
  colliders.addCylinder(salento.x, salento.z, 2.5, salentoPlazaH, salentoPlazaH + 1.9, 'fountain');
  addLootSpawn(salento.x - 5.2, salentoPlazaH + 0.02, salento.z - 5.0, 'smg', true);
  addLootSpawn(salento.x + 5.2, salentoPlazaH + 0.02, salento.z + 5.0, 'medkit', true);

  function addMultilevelBuilding(cfg) {
    const {
      x,
      z,
      w,
      d,
      floors = 1,
      hasAzotea = false,
      wallColor = '#f8f5ee',
      zocaloColor = '#2563eb',
      doorSide = 'south',
      hasBalcony = true,
      hasTower = false,
      kind = 'house',
      lootHint = null
    } = cfg;

    // 1. Muestrear altura máxima y mínima natural en el área de cimentación (footprint)
    let maxFootprintH = WATER_LEVEL + 1.5;
    let minNaturalH = Infinity;
    for (let sz = z - d * 0.5 - 2.0; sz <= z + d * 0.5 + 2.0; sz += 1.8) {
      for (let sx = x - w * 0.5 - 2.0; sx <= x + w * 0.5 + 2.0; sx += 1.8) {
        const th = getTerrainHeightAt(sx, sz);
        if (Math.abs(sx - x) <= w * 0.5 + 1.0 && Math.abs(sz - z) <= d * 0.5 + 1.0) {
          if (th > maxFootprintH) maxFootprintH = th;
        }
        if (th < minNaturalH) minNaturalH = th;
      }
    }

    // 2. Nivelar plataforma plana (terrace) a maxFootprintH para que las puertas queden a ras del suelo exterior y jamás en un hueco
    const surfType = kind === 'lumber' ? SURFACE.LUMBER_EARTH : SURFACE.TOWN_COBBLESTONE;
    levelRectPlatform(x, z, w * 0.5 + 2.0, d * 0.5 + 2.0, maxFootprintH, 5.2, false, surfType);

    // Re-muestrear borde exterior para garantizar que el cimiento sólido de piedra baje hasta la ladera más inclinada
    for (let sz = z - d * 0.5 - 3.5; sz <= z + d * 0.5 + 3.5; sz += 2.5) {
      for (let sx = x - w * 0.5 - 3.5; sx <= x + w * 0.5 + 3.5; sx += 2.5) {
        minNaturalH = Math.min(minNaturalH, getTerrainHeightAt(sx, sz));
      }
    }

    const floorY = Number((maxFootprintH + 0.04).toFixed(3)); // Puertas exactamente a ras de la terraza exterior (+4cm)
    const minGroundY = Math.min(minNaturalH, maxFootprintH) - 1.8;
    const floorH = 3.60; // 3.60m por nivel
    const wallThick = 0.28;
    const doorHalfW = 0.88; // 1.76m de ancho libre
    const doorH = 2.44;     // Puertas amplias de ~2.4m

    exclusion.register(x, z, Math.hypot(w, d) * 0.62 + 3.2);

    // Cimiento / Zócalo sólido de piedra hasta el terreno inclinado
    colliders.addBox(x - w * 0.5 - 0.35, x + w * 0.5 + 0.35, minGroundY, floorY, z - d * 0.5 - 0.35, z + d * 0.5 + 0.35, true, 'foundation');

    if (kind === 'mirador') {
      for (const [px, pz] of [[-4.2, -4.2], [4.2, -4.2], [-4.2, 4.2], [4.2, 4.2]]) {
        colliders.addCylinder(x + px, z + pz, 0.28, floorY, floorY + floorH, 'pillar');
      }
      colliders.addBox(x - 5.4, x + 5.4, floorY + floorH, floorY + floorH + 1.2, z - 5.4, z + 5.4, true, 'roof');
      addLootSpawn(x, floorY + 0.03, z, lootHint || 'sniper', true);
      addLootSpawn(x + 2.2, floorY + 0.03, z - 2.0, 'bandage', true);
      buildings.push({
        x, z, w, d, floors: 1, hasAzotea: false, floorY, minGroundY, wallH: floorH, floorH,
        wallColor, zocaloColor, kind: 'mirador', walkableSlabs: [{ minX: x - w * 0.5, maxX: x + w * 0.5, minZ: z - d * 0.5, maxZ: z + d * 0.5, y: floorY }],
        stairs: [], balconies: []
      });
      return;
    }

    const walkableSlabs = [
      { minX: x - w * 0.5 - 0.35, maxX: x + w * 0.5 + 0.35, minZ: z - d * 0.5 - 0.35, maxZ: z + d * 0.5 + 0.35, y: floorY }
    ];
    const stairs = [];
    const balconies = [];

    // Helper para muros perimetrales de cada piso (con puertas interactivas/destructibles y ventanas de cristal rompibles)
    const addLevelWall = (axis, fixedCoord, spanMin, spanMax, yBase, hasDoorOpening, isExteriorGround = false) => {
      const mid = (spanMin + spanMax) * 0.5;
      if (!hasDoorOpening) {
        const winHalfW = Math.min(1.18, (spanMax - spanMin) * 0.22);
        const winH = 1.44;
        const winId = `win_${windows.length + 1}`;
        let winCol = null;
        if (axis === 'z') {
          colliders.addBox(spanMin, mid - winHalfW, yBase, yBase + floorH, fixedCoord - wallThick / 2, fixedCoord + wallThick / 2, false, 'wall');
          colliders.addBox(mid + winHalfW, spanMax, yBase, yBase + floorH, fixedCoord - wallThick / 2, fixedCoord + wallThick / 2, false, 'wall');
          colliders.addBox(mid - winHalfW, mid + winHalfW, yBase, yBase + 0.94, fixedCoord - wallThick / 2, fixedCoord + wallThick / 2, false, 'sill', { windowId: winId });
          colliders.addBox(mid - winHalfW, mid + winHalfW, yBase + 2.38, yBase + floorH, fixedCoord - wallThick / 2, fixedCoord + wallThick / 2, false, 'lintel');
          winCol = colliders.addBox(mid - winHalfW + 0.04, mid + winHalfW - 0.04, yBase + 0.94, yBase + 2.38, fixedCoord - 0.05, fixedCoord + 0.05, false, 'window', { windowId: winId });
          windows.push({
            id: winId,
            x: mid,
            y: yBase + 0.94,
            z: fixedCoord,
            axis: 'z',
            width: winHalfW * 2 - 0.08,
            height: winH,
            broken: false,
            collider: winCol
          });
        } else {
          colliders.addBox(fixedCoord - wallThick / 2, fixedCoord + wallThick / 2, yBase, yBase + floorH, spanMin, mid - winHalfW, false, 'wall');
          colliders.addBox(fixedCoord - wallThick / 2, fixedCoord + wallThick / 2, yBase, yBase + floorH, mid + winHalfW, spanMax, false, 'wall');
          colliders.addBox(fixedCoord - wallThick / 2, fixedCoord + wallThick / 2, yBase, yBase + 0.94, mid - winHalfW, mid + winHalfW, false, 'sill', { windowId: winId });
          colliders.addBox(fixedCoord - wallThick / 2, fixedCoord + wallThick / 2, yBase + 2.38, yBase + floorH, mid - winHalfW, mid + winHalfW, false, 'lintel');
          winCol = colliders.addBox(fixedCoord - 0.05, fixedCoord + 0.05, yBase + 0.94, yBase + 2.38, mid - winHalfW + 0.04, mid + winHalfW - 0.04, false, 'window', { windowId: winId });
          windows.push({
            id: winId,
            x: fixedCoord,
            y: yBase + 0.94,
            z: mid,
            axis: 'x',
            width: winHalfW * 2 - 0.08,
            height: winH,
            broken: false,
            collider: winCol
          });
        }
        return;
      }

      if (axis === 'z') {
        colliders.addBox(spanMin, mid - doorHalfW, yBase, yBase + floorH, fixedCoord - wallThick / 2, fixedCoord + wallThick / 2, false, 'wall');
        colliders.addBox(mid + doorHalfW, spanMax, yBase, yBase + floorH, fixedCoord - wallThick / 2, fixedCoord + wallThick / 2, false, 'wall');
        colliders.addBox(mid - doorHalfW, mid + doorHalfW, yBase + doorH, yBase + floorH, fixedCoord - wallThick / 2, fixedCoord + wallThick / 2, false, 'lintel');
        if (isExteriorGround) {
          const doorId = `door_${doors.length + 1}`;
          const doorCol = colliders.addBox(
            mid - doorHalfW + 0.04,
            mid + doorHalfW - 0.04,
            yBase,
            yBase + doorH - 0.04,
            fixedCoord - 0.09,
            fixedCoord + 0.09,
            false,
            'door',
            { doorId }
          );
          doors.push({
            id: doorId,
            x: mid,
            y: yBase,
            z: fixedCoord,
            axis: 'z',
            width: doorHalfW * 2 - 0.08,
            height: doorH - 0.04,
            swingSign: fixedCoord > z ? -1 : 1,
            isOpen: false,
            hp: 90,
            maxHp: 90,
            destroyed: false,
            collider: doorCol
          });
        }
      } else {
        colliders.addBox(fixedCoord - wallThick / 2, fixedCoord + wallThick / 2, yBase, yBase + floorH, spanMin, mid - doorHalfW, false, 'wall');
        colliders.addBox(fixedCoord - wallThick / 2, fixedCoord + wallThick / 2, yBase, yBase + floorH, mid + doorHalfW, spanMax, false, 'wall');
        colliders.addBox(fixedCoord - wallThick / 2, fixedCoord + wallThick / 2, yBase + doorH, yBase + floorH, mid - doorHalfW, mid + doorHalfW, false, 'lintel');
        if (isExteriorGround) {
          const doorId = `door_${doors.length + 1}`;
          const doorCol = colliders.addBox(
            fixedCoord - 0.09,
            fixedCoord + 0.09,
            yBase,
            yBase + doorH - 0.04,
            mid - doorHalfW + 0.04,
            mid + doorHalfW - 0.04,
            false,
            'door',
            { doorId }
          );
          doors.push({
            id: doorId,
            x: fixedCoord,
            y: yBase,
            z: mid,
            axis: 'x',
            width: doorHalfW * 2 - 0.08,
            height: doorH - 0.04,
            swingSign: fixedCoord > x ? -1 : 1,
            isOpen: false,
            hp: 90,
            maxHp: 90,
            destroyed: false,
            collider: doorCol
          });
        }
      }
    };

    // Helper para registrar una losa superior dividida alrededor del hueco de escalera (cero golpe de cabeza al subir)
    const addUpperSlabWithCutout = (slabY, hole) => {
      const slabThick = 0.22;
      const bx0 = x - w * 0.5;
      const bx1 = x + w * 0.5;
      const bz0 = z - d * 0.5;
      const bz1 = z + d * 0.5;

      const addSlabPiece = (x0, x1, z0, z1) => {
        if (x1 - x0 <= 0.08 || z1 - z0 <= 0.08) return;
        colliders.addBox(x0, x1, slabY - slabThick, slabY, z0, z1, true, 'upper_floor');
        walkableSlabs.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, y: slabY });
      };

      if (!hole) {
        addSlabPiece(bx0, bx1, bz0, bz1);
        return;
      }
      addSlabPiece(bx0, hole.minX, bz0, bz1);
      addSlabPiece(hole.maxX, bx1, bz0, bz1);
      addSlabPiece(hole.minX, hole.maxX, bz0, hole.minZ);
      addSlabPiece(hole.minX, hole.maxX, hole.maxZ, bz1);
    };

    const totalClimbLevels = floors - 1 + (hasAzotea ? 1 : 0);
    const stairRunHalf = Math.min(2.7, d * 0.5 - 2.05); // Deja >= 2.05m de descanso libre en ambos extremos
    const stairWidth = 1.86;

    // Construir escaleras interiores alternando Este / Oeste para edificios de 2 y 3 niveles + azoteas
    for (let lv = 0; lv < totalClimbLevels; lv++) {
      const y0 = Number((floorY + lv * floorH).toFixed(3));
      const y1 = Number((y0 + floorH).toFixed(3));
      const eastSide = lv % 2 === 0;
      const sMinX = eastSide ? x + w * 0.5 - 0.36 - stairWidth : x - w * 0.5 + 0.36;
      const sMaxX = sMinX + stairWidth;
      // Tramos pares suben de Norte (-Z) a Sur (+Z); impares suben de Sur (+Z) a Norte (-Z)
      const zStart = eastSide ? z - stairRunHalf : z + stairRunHalf;
      const zEnd = eastSide ? z + stairRunHalf : z - stairRunHalf;
      const holeMinZ = Math.min(zStart, zEnd) - 0.08;
      const holeMaxZ = Math.max(zStart, zEnd) + 0.08;

      const stairObj = {
        level: lv,
        eastSide,
        minX: sMinX,
        maxX: sMaxX,
        minZ: Math.min(zStart, zEnd),
        maxZ: Math.max(zStart, zEnd),
        zStart,
        zEnd,
        y0,
        y1,
        hole: { minX: sMinX - 0.05, maxX: sMaxX + 0.05, minZ: holeMinZ, maxZ: holeMaxZ }
      };
      stairs.push(stairObj);

      // Añadir losa del nivel superior con hueco limpio justo encima de esta escalera
      addUpperSlabWithCutout(y1, stairObj.hole);

      // Barandilla interior protectora junto al hueco de escalera en el piso superior y guía lateral al subir
      const railX = eastSide ? sMinX - 0.08 : sMaxX + 0.08;
      colliders.addBox(railX - 0.06, railX + 0.06, y1, y1 + 0.96, holeMinZ + 0.35, holeMaxZ - 0.35, false, 'stair_rail');
      colliders.addBox(railX - 0.05, railX + 0.05, y0 + 0.45, y1, holeMinZ + 0.75, holeMaxZ - 0.75, false, 'stair_guard');
    }

    // Construir muros y balcones por cada piso habitable (0 .. floors-1)
    const balconyFrontSouth = doorSide !== 'north';
    for (let f = 0; f < floors; f++) {
      const yBase = floorY + f * floorH;
      const isGround = f === 0;

      // En pisos superiores con balcón, abrir puerta hacia el balcón exterior estilo Salento
      const southHasDoor = isGround
        ? doorSide === 'south' || doorSide === 'both'
        : hasBalcony && balconyFrontSouth;
      const northHasDoor = isGround
        ? doorSide === 'north' || doorSide === 'both'
        : hasBalcony && !balconyFrontSouth;
      const westHasDoor = isGround && floors === 1 && doorSide === 'west';
      const eastHasDoor = isGround && floors === 1 && doorSide === 'east';

      addLevelWall('z', z + d * 0.5, x - w * 0.5, x + w * 0.5, yBase, southHasDoor, isGround && southHasDoor);
      addLevelWall('z', z - d * 0.5, x - w * 0.5, x + w * 0.5, yBase, northHasDoor, isGround && northHasDoor);
      addLevelWall('x', x - w * 0.5, z - d * 0.5, z + d * 0.5, yBase, westHasDoor, isGround && westHasDoor);
      addLevelWall('x', x + w * 0.5, z - d * 0.5, z + d * 0.5, yBase, eastHasDoor, isGround && eastHasDoor);

      // Balcón transitable de madera en pisos superiores (f >= 1)
      if (f >= 1 && hasBalcony) {
        const bDepth = 1.65;
        const bHalfW = w * 0.36;
        const bMinZ = balconyFrontSouth ? z + d * 0.5 : z - d * 0.5 - bDepth;
        const bMaxZ = balconyFrontSouth ? z + d * 0.5 + bDepth : z - d * 0.5;
        colliders.addBox(x - bHalfW, x + bHalfW, yBase - 0.18, yBase, bMinZ, bMaxZ, true, 'balcony');
        walkableSlabs.push({ minX: x - bHalfW, maxX: x + bHalfW, minZ: bMinZ, maxZ: bMaxZ, y: yBase });

        const outerZ = balconyFrontSouth ? bMaxZ : bMinZ;
        colliders.addBox(x - bHalfW, x + bHalfW, yBase, yBase + 0.98, outerZ - 0.08, outerZ + 0.08, false, 'balcony_rail');
        balconies.push({ minX: x - bHalfW, maxX: x + bHalfW, minZ: bMinZ, maxZ: bMaxZ, y: yBase, south: balconyFrontSouth });

        addLootSpawn(x + bHalfW * 0.45, yBase + 0.03, (bMinZ + bMaxZ) * 0.5, f >= 2 ? 'sniper' : 'rifle', true);
      }

      // Mobiliario interior variado Paisa (camas, mesas, sillas, alacenas, cuadros e iluminación cálida) + Loot
      if (f === 0) {
        const tableX = x - 1.25;
        const tableZ = z - 0.85;
        const tableTopY = floorY + 0.80;
        colliders.addBox(tableX - 0.72, tableX + 0.72, floorY, tableTopY, tableZ - 0.46, tableZ + 0.46, true, 'furniture');
        interiorItems.tables.push({ x: tableX, y: floorY, z: tableZ, rotY: 0, scale: 1.0 });
        interiorItems.chairs.push({ x: tableX - 0.95, y: floorY, z: tableZ, rotY: Math.PI * 0.5, scale: 1.0 });
        interiorItems.chairs.push({ x: tableX + 0.95, y: floorY, z: tableZ, rotY: -Math.PI * 0.5, scale: 1.0 });

        // Alacena / mueble de madera contra muro interior libre de escalera
        const cabX = x - w * 0.5 + 0.52;
        const cabZ = z + d * 0.22;
        if (floors === 1 || Math.abs(cabX - x) > 1.5) {
          colliders.addBox(cabX - 0.35, cabX + 0.35, floorY, floorY + 1.85, cabZ - 0.75, cabZ + 0.75, false, 'furniture');
          interiorItems.cabinets.push({ x: cabX, y: floorY, z: cabZ, rotY: Math.PI * 0.5, scale: 1.0 });
        }

        // Cuadros paisas en pared interior y lámpara cálida de techo
        interiorItems.paintings.push({ x: x - w * 0.5 + 0.18, y: floorY + 1.72, z: z - d * 0.22, rotY: Math.PI * 0.5, scale: 1.0 });
        interiorItems.lamps.push({ x, y: floorY + floorH - 0.22, z, isBright: buildings.length < 10 });

        addLootSpawn(tableX, tableTopY, tableZ, lootHint, true);
        addLootSpawn(x + 1.1, floorY + 0.03, z + 1.0, null, true);
      } else {
        // Dormitorio / sala en segundo o tercer piso con cama, silla y cuadro
        const bedX = f % 2 === 1 ? x + 0.25 : x - 0.25;
        const bedZ = z - d * 0.5 + 1.45;
        colliders.addBox(bedX - 0.68, bedX + 0.68, yBase, yBase + 0.62, bedZ - 1.02, bedZ + 1.02, true, 'furniture');
        interiorItems.beds.push({ x: bedX, y: yBase, z: bedZ, rotY: 0, scale: 1.0 });
        interiorItems.chairs.push({ x: bedX - 1.35, y: yBase, z: bedZ + 0.4, rotY: 0.4, scale: 1.0 });
        interiorItems.paintings.push({ x: bedX + 1.4, y: yBase + 1.68, z: z - d * 0.5 + 0.18, rotY: 0, scale: 1.0 });
        interiorItems.lamps.push({ x, y: yBase + floorH - 0.22, z, isBright: false });

        const upperTier = f === 2 ? 'sniper' : lootHint || 'rifle';
        addLootSpawn(x, yBase + 0.03, z + 1.0, upperTier, true);
        addLootSpawn(x - 1.2, yBase + 0.03, z + 1.6, f === 2 ? 'medkit' : 'ammo', true);
      }
    }

    const topWallY = floorY + floors * floorH;
    if (hasAzotea) {
      // Azotea táctica explorable con parapetos bajos de cobertura (1.02m) y aberturas para disparar
      const pH = 1.02;
      colliders.addBox(x - w * 0.5, x - 1.1, topWallY, topWallY + pH, z + d * 0.5 - 0.2, z + d * 0.5 + 0.1, false, 'parapet');
      colliders.addBox(x + 1.1, x + w * 0.5, topWallY, topWallY + pH, z + d * 0.5 - 0.2, z + d * 0.5 + 0.1, false, 'parapet');
      colliders.addBox(x - w * 0.5, x - 1.1, topWallY, topWallY + pH, z - d * 0.5 - 0.1, z - d * 0.5 + 0.2, false, 'parapet');
      colliders.addBox(x + 1.1, x + w * 0.5, topWallY, topWallY + pH, z - d * 0.5 - 0.1, z - d * 0.5 + 0.2, false, 'parapet');
      colliders.addBox(x - w * 0.5 - 0.1, x - w * 0.5 + 0.2, topWallY, topWallY + pH, z - d * 0.5, z + d * 0.5, false, 'parapet');
      colliders.addBox(x + w * 0.5 - 0.2, x + w * 0.5 + 0.1, topWallY, topWallY + pH, z - d * 0.5, z + d * 0.5, false, 'parapet');

      addLootSpawn(x, topWallY + 0.03, z - 1.2, 'sniper', true);
      addLootSpawn(x - 1.5, topWallY + 0.03, z + 1.5, 'medkit', true);
    } else {
      // Techo tradicional inclinado a dos aguas con aleros
      colliders.addBox(x - w * 0.5 - 0.7, x + w * 0.5 + 0.7, topWallY, topWallY + 1.45, z - d * 0.5 - 0.7, z + d * 0.5 + 0.7, true, 'roof');
    }

    buildings.push({
      x,
      z,
      w,
      d,
      floors,
      hasAzotea,
      floorY,
      minGroundY,
      wallH: floorH * floors,
      floorH,
      doorH,
      wallColor,
      zocaloColor,
      doorSide,
      hasBalcony,
      hasTower,
      kind,
      furniture: { tableX: x - 1.2, tableZ: z - 0.8, crateX: x + 1.4, crateZ: z + 1.1 },
      walkableSlabs,
      stairs,
      balconies
    });
  }

  // --- PUEBLO CENTRAL AMPLIADO DE SALENTO (13 Edificios incluyendo 2 y 3 niveles) ---
  // Gran Hotel / Alcaldía Colonial de 3 Pisos frente a la plaza
  addMultilevelBuilding({ x: salento.x, z: salento.z - 25, w: 14.5, d: 11.5, floors: 3, wallColor: '#f8f5ee', zocaloColor: '#dc2626', doorSide: 'both', hasBalcony: true, lootHint: 'rifle' });
  // Iglesia Nuestra Señora del Carmen (2 Niveles + Torre Campanario)
  addMultilevelBuilding({ x: salento.x + 25, z: salento.z, w: 13.0, d: 15.0, floors: 2, wallColor: '#f8f5ee', zocaloColor: '#eab308', doorSide: 'south', hasBalcony: true, hasTower: true, kind: 'church', lootHint: 'sniper' });
  // Casonas Comerciales de 2 Niveles alrededor de la plaza
  addMultilevelBuilding({ x: salento.x, z: salento.z + 25, w: 13.5, d: 11.0, floors: 2, wallColor: '#f8f5ee', zocaloColor: '#2563eb', doorSide: 'both', hasBalcony: true, lootHint: 'shotgun' });
  addMultilevelBuilding({ x: salento.x - 19, z: salento.z - 23, w: 12.0, d: 10.5, floors: 2, wallColor: '#fefce8', zocaloColor: '#16a34a', doorSide: 'south', hasBalcony: true, lootHint: 'smg' });
  addMultilevelBuilding({ x: salento.x + 19, z: salento.z - 23, w: 12.0, d: 10.5, floors: 2, wallColor: '#f8f5ee', zocaloColor: '#9333ea', doorSide: 'south', hasBalcony: true, lootHint: 'pistol' });
  addMultilevelBuilding({ x: salento.x - 19, z: salento.z + 23, w: 12.0, d: 10.5, floors: 2, wallColor: '#f8f5ee', zocaloColor: '#f59e0b', doorSide: 'north', hasBalcony: true, lootHint: 'shotgun' });
  // Casas Coloniales en las calles exteriores de Salento
  addMultilevelBuilding({ x: salento.x + 19, z: salento.z + 23, w: 10.5, d: 9.5, floors: 1, wallColor: '#f8f5ee', zocaloColor: '#dc2626', doorSide: 'north', hasBalcony: false, lootHint: 'smg' });
  addMultilevelBuilding({ x: salento.x - 25, z: salento.z, w: 11.5, d: 10.5, floors: 2, hasAzotea: true, wallColor: '#f1f5f9', zocaloColor: '#0284c7', doorSide: 'both', hasBalcony: true, lootHint: 'rifle' });
  addMultilevelBuilding({ x: salento.x - 38, z: salento.z - 18, w: 10.0, d: 9.0, floors: 1, wallColor: '#fefce8', zocaloColor: '#16a34a', doorSide: 'south', hasBalcony: false });
  addMultilevelBuilding({ x: salento.x - 38, z: salento.z + 18, w: 10.0, d: 9.0, floors: 1, wallColor: '#f8f5ee', zocaloColor: '#ea580c', doorSide: 'north', hasBalcony: false });
  addMultilevelBuilding({ x: salento.x + 42, z: salento.z - 18, w: 10.5, d: 9.2, floors: 1, wallColor: '#f8f5ee', zocaloColor: '#2563eb', doorSide: 'south', hasBalcony: false });
  addMultilevelBuilding({ x: salento.x + 42, z: salento.z + 18, w: 10.5, d: 9.2, floors: 1, wallColor: '#fefce8', zocaloColor: '#dc2626', doorSide: 'north', hasBalcony: false });
  addMultilevelBuilding({ x: salento.x, z: salento.z - 46, w: 12.0, d: 10.2, floors: 2, wallColor: '#f8f5ee', zocaloColor: '#059669', doorSide: 'both', hasBalcony: true, lootHint: 'smg' });

  // --- FINCAS CAFETERAS MULTINIVEL + BENEFICIADEROS ---
  addMultilevelBuilding({ x: fincaOcaso.x, z: fincaOcaso.z, w: 13.5, d: 11.0, floors: 2, wallColor: '#fefce8', zocaloColor: '#dc2626', doorSide: 'both', hasBalcony: true, kind: 'finca', lootHint: 'rifle' });
  addMultilevelBuilding({ x: fincaOcaso.x + 19, z: fincaOcaso.z - 6, w: 10.0, d: 8.8, floors: 1, wallColor: '#f8f5ee', zocaloColor: '#92400e', doorSide: 'south', hasBalcony: false, kind: 'finca', lootHint: 'shotgun' });

  addMultilevelBuilding({ x: fincaPalma.x, z: fincaPalma.z, w: 13.5, d: 11.0, floors: 2, wallColor: '#fefce8', zocaloColor: '#16a34a', doorSide: 'both', hasBalcony: true, kind: 'finca', lootHint: 'shotgun' });
  addMultilevelBuilding({ x: fincaPalma.x - 19, z: fincaPalma.z + 6, w: 10.2, d: 9.0, floors: 1, wallColor: '#f8f5ee', zocaloColor: '#2563eb', doorSide: 'north', hasBalcony: false, kind: 'finca', lootHint: 'smg' });

  // --- BODEGA DEL RÍO (2 Niveles + Azotea transitable con cobertura) ---
  addMultilevelBuilding({ x: bodegaRio.x, z: bodegaRio.z, w: 14.5, d: 11.5, floors: 2, hasAzotea: true, wallColor: '#e2e8f0', zocaloColor: '#475569', doorSide: 'both', hasBalcony: false, kind: 'warehouse', lootHint: 'shotgun' });
  addMultilevelBuilding({ x: bodegaRio.x - 18, z: bodegaRio.z - 10, w: 9.8, d: 8.6, floors: 1, wallColor: '#d6b38c', zocaloColor: '#784b26', doorSide: 'south', hasBalcony: false, kind: 'warehouse', lootHint: 'pistol' });

  // --- PUESTOS DE AVANZADA DE 2 Y 3 NIVELES CON AZOTEA ---
  addMultilevelBuilding({ x: puestoNorte.x, z: puestoNorte.z, w: 12.2, d: 11.0, floors: 3, hasAzotea: true, wallColor: '#cbd5e1', zocaloColor: '#334155', doorSide: 'south', hasBalcony: true, kind: 'outpost', lootHint: 'sniper' });
  addMultilevelBuilding({ x: puestoSur.x, z: puestoSur.z, w: 12.5, d: 11.0, floors: 2, hasAzotea: true, wallColor: '#cbd5e1', zocaloColor: '#475569', doorSide: 'north', hasBalcony: true, kind: 'outpost', lootHint: 'rifle' });

  // --- CASERÍO LA QUEBRADA (Este del mapa) ---
  addMultilevelBuilding({ x: caserioEste.x, z: caserioEste.z, w: 12.2, d: 10.5, floors: 2, wallColor: '#fefce8', zocaloColor: '#ea580c', doorSide: 'both', hasBalcony: true, lootHint: 'rifle' });
  addMultilevelBuilding({ x: caserioEste.x - 16, z: caserioEste.z - 15, w: 9.8, d: 8.8, floors: 1, wallColor: '#f8f5ee', zocaloColor: '#16a34a', doorSide: 'south', hasBalcony: false, lootHint: 'smg' });
  addMultilevelBuilding({ x: caserioEste.x + 15, z: caserioEste.z + 15, w: 9.8, d: 8.8, floors: 1, wallColor: '#f8f5ee', zocaloColor: '#2563eb', doorSide: 'north', hasBalcony: false, lootHint: 'pistol' });

  // --- CAMPAMENTO MADERERO + MIRADOR ---
  addMultilevelBuilding({ x: lumberCamp.x, z: lumberCamp.z, w: 12.5, d: 10.5, floors: 2, wallColor: '#d6b38c', zocaloColor: '#784b26', doorSide: 'both', hasBalcony: true, kind: 'lumber', lootHint: 'shotgun' });
  for (const [ox, oz, rot] of [[-15, 9, 0.2], [15, -8, -0.4], [-11, -14, 0.9]]) {
    const lx = lumberCamp.x + ox;
    const lz = lumberCamp.z + oz;
    const ly = getTerrainHeightAt(lx, lz);
    levelRectPlatform(lx, lz, 2.8, 1.8, ly, 3.0, false, SURFACE.LUMBER_EARTH);
    const flatLy = getTerrainHeightAt(lx, lz);
    exclusion.register(lx, lz, 4.8);
    colliders.addBox(lx - 2.4, lx + 2.4, flatLy - 0.8, flatLy + 1.55, lz - 1.3, lz + 1.3, true, 'logs');
    logPiles.push({ x: lx, y: flatLy, z: lz, rotY: rot });
    addLootSpawn(lx, flatLy + 1.56, lz, ox < 0 ? 'smg' : 'ammo', true);
  }

  addMultilevelBuilding({ x: mirador.x, z: mirador.z, w: 9.6, d: 9.6, floors: 1, wallColor: '#9c6639', zocaloColor: '#f59e0b', kind: 'mirador', lootHint: 'sniper' });

  // ==================== 5. CASAS DESTRUIDAS Y RUINAS EN CAMPO ABIERTO ====================
  const ruinedSpecs = [
    { x: -12, z: -118, w: 10.2, d: 8.8, loot: 'shotgun' },
    { x: 124, z: -78, w: 9.8, d: 8.6, loot: 'rifle' },
    { x: -118, z: -22, w: 10.4, d: 9.0, loot: 'smg' },
    { x: -95, z: 125, w: 9.6, d: 8.4, loot: 'medkit' },
    { x: 138, z: 72, w: 10.2, d: 8.8, loot: 'shotgun' },
    { x: -15, z: 138, w: 10.0, d: 8.6, loot: 'rifle' }
  ];

  for (const rs of ruinedSpecs) {
    let maxH = WATER_LEVEL + 1.8;
    let minH = Infinity;
    for (let sz = rs.z - rs.d * 0.5 - 1.5; sz <= rs.z + rs.d * 0.5 + 1.5; sz += 2.0) {
      for (let sx = rs.x - rs.w * 0.5 - 1.5; sx <= rs.x + rs.w * 0.5 + 1.5; sx += 2.0) {
        const th = getTerrainHeightAt(sx, sz);
        maxH = Math.max(maxH, th);
        minH = Math.min(minH, th);
      }
    }
    levelRectPlatform(rs.x, rs.z, rs.w * 0.5 + 1.5, rs.d * 0.5 + 1.5, maxH, 4.5, false, SURFACE.RUINS_STONE);
    const floorY = maxH + 0.04;
    const minGroundY = Math.min(minH, maxH) - 1.6;
    exclusion.register(rs.x, rs.z, Math.hypot(rs.w, rs.d) * 0.65 + 2.5);

    colliders.addBox(rs.x - rs.w * 0.5 - 0.3, rs.x + rs.w * 0.5 + 0.3, minGroundY, floorY, rs.z - rs.d * 0.5 - 0.3, rs.z + rs.d * 0.5 + 0.3, true, 'ruin_floor');
    // Muros derrumbados a media altura (cobertura táctica perfecta de 1.1m a 2.1m con brechas para entrar)
    colliders.addBox(rs.x - rs.w * 0.5, rs.x - 1.1, floorY, floorY + 1.85, rs.z + rs.d * 0.5 - 0.18, rs.z + rs.d * 0.5 + 0.18, false, 'ruin_wall');
    colliders.addBox(rs.x + 1.2, rs.x + rs.w * 0.5, floorY, floorY + 1.15, rs.z + rs.d * 0.5 - 0.18, rs.z + rs.d * 0.5 + 0.18, false, 'ruin_wall');
    colliders.addBox(rs.x - rs.w * 0.5, rs.x + 0.8, floorY, floorY + 1.35, rs.z - rs.d * 0.5 - 0.18, rs.z - rs.d * 0.5 + 0.18, false, 'ruin_wall');
    colliders.addBox(rs.x - rs.w * 0.5 - 0.18, rs.x - rs.w * 0.5 + 0.18, floorY, floorY + 2.15, rs.z - rs.d * 0.5, rs.z + 1.2, false, 'ruin_wall');
    colliders.addBox(rs.x + rs.w * 0.5 - 0.18, rs.x + rs.w * 0.5 + 0.18, floorY, floorY + 1.05, rs.z - 1.4, rs.z + rs.d * 0.5, false, 'ruin_wall');
    // Bloque de escombros interior
    colliders.addBox(rs.x + 1.4, rs.x + 2.8, floorY, floorY + 0.85, rs.z - 1.8, rs.z - 0.5, true, 'rubble');

    addLootSpawn(rs.x - 1.2, floorY + 0.03, rs.z + 0.5, rs.loot, true);
    addLootSpawn(rs.x + 2.1, floorY + 0.86, rs.z - 1.15, 'ammo', true);

    ruinedHouses.push({ x: rs.x, z: rs.z, w: rs.w, d: rs.d, floorY, minGroundY });
  }

  // Ruinas Andinas Precolombinas niveladas sobre terraza de piedra
  {
    const rx = mountainRuins.x;
    const rz = mountainRuins.z;
    let rMaxH = WATER_LEVEL + 4;
    for (let dz = -10; dz <= 10; dz += 4) {
      for (let dx = -10; dx <= 10; dx += 4) {
        rMaxH = Math.max(rMaxH, getTerrainHeightAt(rx + dx, rz + dz));
      }
    }
    levelRectPlatform(rx, rz, 11.5, 11.5, rMaxH, 5.5, false, SURFACE.RUINS_STONE);
    const ry = rMaxH + 0.08;
    exclusion.register(rx, rz, 16);
    colliders.addBox(rx - 10.5, rx + 10.5, ry - 3.0, ry, rz - 10.5, rz + 10.5, true, 'ruins_floor');
    colliders.addBox(rx - 1.6, rx + 1.6, ry, ry + 1.15, rz - 1.1, rz + 1.1, true, 'altar');
    addLootSpawn(rx, ry + 1.16, rz, 'sniper', true);
    addLootSpawn(rx - 3.5, ry + 0.04, rz + 2.5, 'rifle', true);
    addLootSpawn(rx + 3.5, ry + 0.04, rz - 2.5, 'medkit', true);

    const pillars = [];
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const px = rx + Math.cos(ang) * 8.2;
      const pz = rz + Math.sin(ang) * 8.2;
      const ph = i % 2 === 0 ? 4.2 : 2.3;
      colliders.addCylinder(px, pz, 0.55, ry, ry + ph, 'ruin_pillar');
      pillars.push({ x: px, y: ry, z: pz, h: ph });
    }
    ruins.push({ x: rx, y: ry, z: rz, pillars });
  }

  // ==================== 5B. MONUMENTO "COCORA" CON CÓNDOR EN LA COLINA, HELICÓPTERO ESTRELLADO Y CRÁTER ====================
  // 1. Monumento 3D "COCORA" sobre ladera prominente con sendero empedrado y Cóndor Andino posado en la letra "R"
  let cocoraPlazaH = WATER_LEVEL + 6.0;
  for (let dz = -5; dz <= 5; dz += 2.5) {
    for (let dx = -15; dx <= 15; dx += 3) {
      cocoraPlazaH = Math.max(cocoraPlazaH, getTerrainHeightAt(4 + dx, -88 + dz));
    }
  }
  levelRectPlatform(4, -88, 15.5, 5.2, cocoraPlazaH, 5.5, false, SURFACE.TOWN_COBBLESTONE);
  const cocoraMonument = {
    x: 4,
    y: Number((cocoraPlazaH + 0.04).toFixed(3)),
    z: -88,
    yaw: 0, // Mira hacia el Sur (+Z) dominando el valle, el helicóptero y Salento
    width: 26.0,
    letterHeight: 4.4
  };
  exclusion.register(cocoraMonument.x, cocoraMonument.z, 18.5);
  // Basamento escalonado de piedra transitable + colisionadores de letras monumentales C-O-C-O-R-A + cercha trasera
  colliders.addBox(cocoraMonument.x - 13.8, cocoraMonument.x + 13.8, cocoraMonument.y - 2.4, cocoraMonument.y + 0.68, cocoraMonument.z - 2.1, cocoraMonument.z + 2.1, true, 'monument_plinth');
  colliders.addBox(cocoraMonument.x - 11.6, cocoraMonument.x + 11.6, cocoraMonument.y + 0.68, cocoraMonument.y + 4.45, cocoraMonument.z - 0.88, cocoraMonument.z - 0.46, false, 'monument_truss');
  const letterCentersX = [-10.5, -6.3, -2.1, 2.1, 6.3, 10.5];
  for (let li = 0; li < letterCentersX.length; li++) {
    const lx = cocoraMonument.x + letterCentersX[li];
    const extraCondorH = li === 4 ? 2.6 : 0; // Letra "R" sostiene la escultura del Cóndor Andino
    colliders.addBox(lx - 1.55, lx + 1.55, cocoraMonument.y + 0.68, cocoraMonument.y + 0.68 + cocoraMonument.letterHeight + extraCondorH, cocoraMonument.z - 0.65, cocoraMonument.z + 0.65, true, 'monument_letter');
  }
  addLootSpawn(cocoraMonument.x, cocoraMonument.y + 0.70, cocoraMonument.z + 1.5, 'sniper', true);
  addLootSpawn(cocoraMonument.x - 5.2, cocoraMonument.y + 0.04, cocoraMonument.z + 3.4, 'medkit', true);
  addLootSpawn(cocoraMonument.x + 5.2, cocoraMonument.y + 0.04, cocoraMonument.z + 3.4, 'ammo', true);

  // 2. Helicóptero de Ataque AH-64D Apache Siniestrado en Llamas (fuselaje blindado + botalón partido + fragmentos)
  let heliGroundH = WATER_LEVEL + 2.5;
  for (let dz = -7; dz <= 7; dz += 3.5) {
    for (let dx = -10; dx <= 8; dx += 3.5) {
      heliGroundH = Math.max(heliGroundH, getTerrainHeightAt(5 + dx, -32 + dz));
    }
  }
  levelRectPlatform(5, -32, 11.5, 8.0, heliGroundH, 5.0, false, SURFACE.SCORCHED_EARTH);
  const helicopterWreck = {
    modelId: 'ah64d',
    x: 8.2,
    y: Number(heliGroundH.toFixed(3)),
    z: -33.5,
    yaw: 0.52,
    tailX: -1.4,
    tailY: Number(heliGroundH.toFixed(3)),
    tailZ: -29.2,
    tailYaw: 1.18,
    atmosphereRadius: 45.0
  };
  exclusion.register(helicopterWreck.x, helicopterWreck.z, 9.5);
  exclusion.register(helicopterWreck.tailX, helicopterWreck.tailZ, 6.5);
  // Colliders físicos suaves alineados con el AH-64D Apache (escala 2.15x): cobertura sólida en fuselaje, EFABs,
  // morro con M230/TADS, ala izquierda con Hydra/Hellfire, botalón de cola y resto de ala derecha sin atrapar al jugador
  const hSin = Math.sin(helicopterWreck.yaw);
  const hCos = Math.cos(helicopterWreck.yaw);
  const hRightX = hCos;
  const hRightZ = -hSin;
  for (const [lzOff, rad, topH] of [
    [5.10, 0.92, 1.75],
    [3.55, 1.24, 2.25],
    [1.80, 1.48, 2.75],
    [0.10, 1.56, 3.05],
    [-1.65, 1.32, 2.55]
  ]) {
    colliders.addCylinder(
      helicopterWreck.x + hSin * lzOff,
      helicopterWreck.z + hCos * lzOff,
      rad,
      helicopterWreck.y - 0.5,
      helicopterWreck.y + topH,
      'heli_hull'
    );
  }
  // Ala embrionaria izquierda (+X local) con lanzacohetes Hydra-70
  for (const [latOff, wRad, wTop] of [
    [1.85, 0.88, 1.95],
    [3.05, 0.82, 1.75]
  ]) {
    colliders.addCylinder(
      helicopterWreck.x + hRightX * latOff + hSin * 0.3,
      helicopterWreck.z + hRightZ * latOff + hCos * 0.3,
      wRad,
      helicopterWreck.y - 0.4,
      helicopterWreck.y + wTop,
      'heli_wing'
    );
  }
  // Botalón de cola partido + estabilizador vertical + fragmentos mayores en el borde del cráter
  const tSin = Math.sin(helicopterWreck.tailYaw);
  const tCos = Math.cos(helicopterWreck.tailYaw);
  for (const [tlOff, tRad, tTop] of [
    [-2.10, 0.78, 2.25],
    [-0.70, 0.72, 1.65],
    [0.75, 0.76, 1.55],
    [2.05, 0.82, 1.50]
  ]) {
    colliders.addCylinder(
      helicopterWreck.tailX + tSin * tlOff,
      helicopterWreck.tailZ + tCos * tlOff,
      tRad,
      helicopterWreck.tailY - 0.4,
      helicopterWreck.tailY + tTop,
      'heli_tail'
    );
  }
  // Fragmento de ala derecha arrancada (+4.35, +1.95) y capó de turbina (-3.55, -2.65) como cobertura baja
  colliders.addCylinder(
    helicopterWreck.x + 4.35,
    helicopterWreck.z + 1.95,
    1.15,
    helicopterWreck.y - 0.3,
    helicopterWreck.y + 1.15,
    'heli_debris'
  );
  colliders.addCylinder(
    helicopterWreck.x - 3.55,
    helicopterWreck.z - 2.65,
    0.95,
    helicopterWreck.y - 0.3,
    helicopterWreck.y + 0.95,
    'heli_debris'
  );
  addLootSpawn(helicopterWreck.x + 0.6, helicopterWreck.y + 0.05, helicopterWreck.z + 2.4, 'rifle', true);
  addLootSpawn(helicopterWreck.x - 2.4, helicopterWreck.y + 0.05, helicopterWreck.z - 2.2, 'medkit', true);
  addLootSpawn(helicopterWreck.tailX + 1.2, helicopterWreck.tailY + 0.05, helicopterWreck.tailZ + 1.5, 'ammo', true);

  // 3. Cráter Profundo de Explosión frente al pueblo de Salento (trinchera natural con borde quemado y rocas)
  const craterX = 2.0;
  const craterZ = 2.0;
  const craterBaseRimY = Math.max(WATER_LEVEL + 3.6, getTerrainHeightAt(craterX, craterZ));
  const craterOuterR = 11.2;
  const craterInnerR = 7.4;
  const craterDepth = 2.65;
  {
    const vx0 = Math.max(0, Math.floor((craterX - craterOuterR - 3 + WORLD_HALF) / CELL_SIZE));
    const vx1 = Math.min(GRID_SIZE, Math.ceil((craterX + craterOuterR + 3 + WORLD_HALF) / CELL_SIZE));
    const vz0 = Math.max(0, Math.floor((craterZ - craterOuterR - 3 + WORLD_HALF) / CELL_SIZE));
    const vz1 = Math.min(GRID_SIZE, Math.ceil((craterZ + craterOuterR + 3 + WORLD_HALF) / CELL_SIZE));
    for (let vz = vz0; vz <= vz1; vz++) {
      const wz = (vz - GRID_SIZE / 2) * CELL_SIZE;
      for (let vx = vx0; vx <= vx1; vx++) {
        const wx = (vx - GRID_SIZE / 2) * CELL_SIZE;
        const dc = Math.hypot(wx - craterX, wz - craterZ);
        if (dc > craterOuterR + 2.5) continue;
        const idx = vz * V + vx;
        if (dc <= craterInnerR) {
          const bowl = Math.cos((dc / craterInnerR) * Math.PI * 0.5);
          heightGrid[idx] = Math.max(WATER_LEVEL + 0.55, craterBaseRimY - bowl * craterDepth);
          surfaceGrid[idx] = SURFACE.SCORCHED_EARTH;
        } else if (dc <= craterOuterR) {
          const rimT = (dc - craterInnerR) / (craterOuterR - craterInnerR);
          const berm = Math.sin(rimT * Math.PI) * 0.92;
          heightGrid[idx] = craterBaseRimY * 0.65 + heightGrid[idx] * 0.35 + berm;
          surfaceGrid[idx] = SURFACE.SCORCHED_EARTH;
        }
      }
    }
  }
  exclusion.register(craterX, craterZ, craterOuterR + 2.0);
  const craterBottomY = getTerrainHeightAt(craterX, craterZ);
  const blastCrater = {
    x: craterX,
    y: Number(craterBottomY.toFixed(3)),
    rimY: Number(craterBaseRimY.toFixed(3)),
    z: craterZ,
    radius: craterOuterR
  };
  addLootSpawn(craterX - 0.8, craterBottomY + 0.05, craterZ + 0.6, 'shotgun', false);
  addLootSpawn(craterX + 1.2, craterBottomY + 0.05, craterZ - 0.8, 'bandage', false);

  // Actualizar acantilados rocosos por pendiente tras todas las nivelaciones de terrazas y cuevas
  for (let gz = 0; gz < GRID_SIZE; gz++) {
    for (let gx = 0; gx < GRID_SIZE; gx++) {
      const h00 = heightGrid[gz * V + gx];
      const h10 = heightGrid[gz * V + (gx + 1)];
      const h01 = heightGrid[(gz + 1) * V + gx];
      const slope = Math.hypot(h10 - h00, h01 - h00) / CELL_SIZE;

      if (slope > 0.68 && h00 > WATER_LEVEL + 1.0 && surfaceGrid[gz * V + gx] !== SURFACE.CAVE_ROCK) {
        surfaceGrid[gz * V + gx] = SURFACE.ROCK_CLIFF;
      }
      surfaceHeights[gz * GRID_SIZE + gx] = Math.max(1, Math.min(255, Math.round(h00)));
    }
  }


  return {
    evaluateBridgeHeight,
    cocoraMonument,
    helicopterWreck,
    craterX,
    craterZ,
    craterInnerR,
    blastCrater
  };
}
