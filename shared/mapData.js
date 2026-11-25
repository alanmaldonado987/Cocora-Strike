// shared/mapData.js
// Mundo Low-Poly Orgánico de Colombia en Escala Métrica Real (1 unidad = 1.00 metro, Jugador = 1.80m)
// Mapa de 640 x 640 metros con:
// - Nivelación exacta de terrazas para casas (cero huecos, puertas a ras de suelo + cimientos de piedra hasta la pendiente)
// - 4 Puentes elevados sobre las orillas reales (Math.max(izq, der) + 1.2m) con rampas continuas en getGroundHeightAt
// - Arquitectura expandida con edificios de 1, 2 y 3 niveles + azoteas, escaleras interiores transitables, casas destruidas y ruinas
// - 3 Montañas escarpadas con senderos y 3 Cuevas rocosas explorables (techo alto sin colisión forzada + loot de alto nivel)
// - Distribución 100% orgánica y aleatoria de vegetación (sin cuadrículas), avión a ~198m (~10s de caída libre) y Oso de Anteojos letal

export const CELL_SIZE = 2.0;
export const BLOCK_SIZE = CELL_SIZE;
export const GRID_SIZE = 320; // 320 x 2m = 640 x 640 metros reales (-320m a +320m)
export const WORLD_SIZE = GRID_SIZE * CELL_SIZE;
export const WORLD_HALF = WORLD_SIZE / 2; // 320m
export const WATER_LEVEL = 3.2;
export const DEFAULT_MAP_SEED = 202699;

// Proporciones humanas reales (Personaje = 1.80 metros)
export const PLAYER_RADIUS = 0.38;
export const PLAYER_HEIGHT = 1.80;
export const PLAYER_CROUCH_HEIGHT = 1.15;
export const PLAYER_SLIDE_HEIGHT = 0.95;
export const PLAYER_EYE_HEIGHT = 1.64;
export const PLAYER_CROUCH_EYE_HEIGHT = 1.02;
export const PLAYER_SLIDE_EYE_HEIGHT = 0.85;

export const SURFACE = {
  GRASS_VALLEY: 0,
  GRASS_MOUNTAIN: 1,
  COFFEE_TERRACE: 2,
  DIRT_TRAIL: 3,
  ROCK_CLIFF: 4,
  RIVER_SAND: 5,
  RIVER_BED: 6,
   TOWN_COBBLESTONE: 7,
  LUMBER_EARTH: 8,
  RUINS_STONE: 9,
  CAVE_ROCK: 10,
  SCORCHED_EARTH: 11
};

export const BLOCK = {
  AIR: 0,
  GRASS_VALLEY: 1,
  WATER: 5
};

// Arsenal táctico completo de 5 armas diferenciadas + machete ligero de respaldo inicial
export const WEAPON_SLOTS = ['pistol', 'shotgun', 'smg', 'rifle', 'sniper'];

export const WEAPONS = {
  fists: {
    id: 'fists',
    slot: 0,
    name: 'Machete Cafetero',
    magSize: 0,
    fireRateMs: 420,
    damage: 28,
    headshotMult: 1.3,
    reloadMs: 0,
    range: 2.7,
    spread: 0.02,
    pellets: 1,
    recoil: 0.015,
    adsFov: 68,
    moveSpeedMult: 1.04,
    auto: false
  },
  pistol: {
    id: 'pistol',
    slot: 1,
    name: 'Pistola Táctica 9mm',
    magSize: 15,
    startAmmo: 30,
    fireRateMs: 210,
    damage: 24,
    headshotMult: 1.6,
    reloadMs: 1050,
    range: 115,
    spread: 0.010,
    pellets: 1,
    recoil: 0.015,
    adsFov: 58,
    moveSpeedMult: 1.02,
    auto: false
  },
  shotgun: {
    id: 'shotgun',
    slot: 2,
    name: 'Escopeta Paisa 12G',
    magSize: 6,
    startAmmo: 18,
    fireRateMs: 780,
    damage: 13, // 8 perdigones x 13 = hasta 104 de daño a corta distancia
    headshotMult: 1.35,
    reloadMs: 1950,
    range: 42,
    spread: 0.076,
    pellets: 8,
    recoil: 0.046,
    adsFov: 60,
    moveSpeedMult: 0.98,
    auto: false
  },
  smg: {
    id: 'smg',
    slot: 3,
    name: 'Subfusil Táctico SMG',
    magSize: 32,
    startAmmo: 64,
    fireRateMs: 75,
    damage: 13,
    headshotMult: 1.45,
    reloadMs: 1320,
    range: 95,
    spread: 0.026,
    pellets: 1,
    recoil: 0.010,
    adsFov: 58,
    moveSpeedMult: 1.06,
    auto: true
  },
  rifle: {
    id: 'rifle',
    slot: 4,
    name: 'Fusil Andino AK-47',
    magSize: 30,
    startAmmo: 60,
    fireRateMs: 112,
    damage: 21,
    headshotMult: 1.55,
    reloadMs: 1720,
    range: 250,
    spread: 0.013,
    pellets: 1,
    recoil: 0.018,
    adsFov: 48,
    moveSpeedMult: 0.97,
    auto: true
  },
  sniper: {
    id: 'sniper',
    slot: 5,
    name: 'Francotirador Cóndor .50',
    magSize: 5,
    startAmmo: 15,
    fireRateMs: 1150,
    damage: 76,
    headshotMult: 2.0, // 152 daño crítico en la cabeza
    reloadMs: 2250,
    range: 540,
    spread: 0.0015,
    pellets: 1,
    recoil: 0.065,
    adsFov: 22, // Zoom óptico exclusivo de mira telescópica
    moveSpeedMult: 0.93,
    auto: false
  }
};

export const LOOT_TYPES = {
  pistol: { id: 'pistol', label: 'Pistola Táctica 9mm', color: '#38bdf8', pickupRadius: 1.65, autoPickup: false },
  shotgun: { id: 'shotgun', label: 'Escopeta Paisa 12G', color: '#fb923c', pickupRadius: 1.75, autoPickup: false },
  smg: { id: 'smg', label: 'Subfusil Táctico SMG', color: '#a855f7', pickupRadius: 1.7, autoPickup: false },
  rifle: { id: 'rifle', label: 'Fusil Andino AK-47', color: '#f59e0b', pickupRadius: 1.75, autoPickup: false },
  sniper: { id: 'sniper', label: 'Francotirador Cóndor .50', color: '#ef4444', pickupRadius: 1.8, autoPickup: false },
  ammo: { id: 'ammo', label: 'Caja de Munición (+36)', color: '#84cc16', amount: 36, pickupRadius: 1.75, autoPickup: true },
  medkit: { id: 'medkit', label: 'Botiquín (+50 HP)', color: '#f43f5e', heal: 50, pickupRadius: 1.75, autoPickup: true },
  bandage: { id: 'bandage', label: 'Vendas Rápidas (+20 HP)', color: '#2dd4bf', heal: 20, pickupRadius: 1.7, autoPickup: true }
};

export const BOT_DIFFICULTIES = {
  easy: {
    id: 'easy',
    label: 'Fácil',
    reactionMs: 1500,
    spreadMult: 3.4,
    damageMult: 0.55,
    fireChance: 0.09,
    burstPauseMs: 1150,
    visionRange: 72
  },
  normal: {
    id: 'normal',
    label: 'Normal',
    reactionMs: 720,
    spreadMult: 1.75,
    damageMult: 0.82,
    fireChance: 0.21,
    burstPauseMs: 520,
    visionRange: 105
  },
  hard: {
    id: 'hard',
    label: 'Difícil',
    reactionMs: 260,
    spreadMult: 0.92,
    damageMult: 1.0,
    fireChance: 0.36,
    burstPauseMs: 180,
    visionRange: 145
  }
};

export const STORM_PHASES = [
  { waitSec: 28, shrinkSec: 32, targetRadius: 245, dps: 1 },
  { waitSec: 18, shrinkSec: 26, targetRadius: 160, dps: 2 },
  { waitSec: 15, shrinkSec: 22, targetRadius: 92, dps: 5 },
  { waitSec: 12, shrinkSec: 18, targetRadius: 38, dps: 8 },
  { waitSec: 10, shrinkSec: 16, targetRadius: 0, dps: 10 }
];
export const STORM_CLOSED_DPS = 12;

export const FALL_DAMAGE_CONFIG = {
  safeFallHeight: 3.2,    // <= 3.2m sin daño; saltar desde 2dos pisos (3.6m+), puentes altos o barrancos aplica daño real
  severeFallHeight: 14.0, // Entre 3.2m y 14.0m daño progresivo de 12 a 68 HP; > 14.0m es 100 HP letal
  minFallDamage: 12,
  maxProgressiveDamage: 68,
  lethalDamage: 100
};

export function computeFallDamage(fallDistance, cfg = FALL_DAMAGE_CONFIG) {
  if (!Number.isFinite(fallDistance) || fallDistance <= cfg.safeFallHeight) return 0;
  if (fallDistance > cfg.severeFallHeight) return cfg.lethalDamage;
  const span = Math.max(0.1, cfg.severeFallHeight - cfg.safeFallHeight);
  const t = Math.max(0, Math.min(1, (fallDistance - cfg.safeFallHeight) / span));
  const raw = cfg.minFallDamage + (cfg.maxProgressiveDamage - cfg.minFallDamage) * t;
  return Math.min(cfg.maxProgressiveDamage, Math.max(cfg.minFallDamage, Math.round(raw)));
}

export const HEAL_CONFIG = {
  durationMs: 2000,    // 2.0 segundos canalizados aplicando botiquín o venda
  moveSpeedMult: 0.45  // Velocidad reducida durante el vendaje
};

export const SLIDE_CONFIG = {
  durationSec: 0.9,
  cooldownSec: 1.5,
  initialSpeed: 12.6,
  minEndSpeed: 4.8,
  frictionDecay: 7.5,
  downhillBoostFactor: 12.0
};

// Física calibrada de Caída Libre de 10 Segundos:
// Avión a 198m sobre el valle -> 173m de caída libre a ~16.8 m/s (~10.0s en skydiving) -> apertura automática a 25m del suelo
export const PARACHUTE_CONFIG = {
  planeHeightAboveValley: 196.0, // ~195 metros sobre el valle central (~10s de caída libre)
  autoDeployHeight: 25.0,        // Apertura automática a 25 metros del suelo
  manualOpenOnly: false,
  minClearanceToOpen: 6.0,
  minJumpHeightRef: 15,
  maxJumpHeightRef: 205,
  heightSpeedMode: 'faster_from_high',
  freefallInitialSpeed: 4.5,
  freefallMinSpeed: 15.0,
  freefallMaxSpeed: 17.5,        // ~16-17.5 m/s en caída libre => ~10 segundos completos antes de los 25m
  freefallDiveBonus: 3.4,
  freefallGlideReduction: 2.0,
  freefallHorizontalSpeed: 23.5,
  freefallGravityAccel: 28.0,
  canopyMinSpeed: 7.6,
  canopyMaxSpeed: 8.6,
  canopyHorizontalSpeed: 18.5,
  canopyOpenDecel: 38.0
};

// Fauna Silvestre Colombiana con Oso de Anteojos más letal (42 de daño, persecución veloz y triple loot de alto valor)
export const WILDLIFE_TYPES = {
  bear: {
    id: 'bear',
    name: 'Oso de Anteojos',
    behavior: 'predator',
    maxHp: 185,
    radius: 0.80,
    height: 1.48,
    walkSpeed: 2.8,
    runSpeed: 9.6,            // Más veloz al perseguir en estado hostil
    attackRange: 1.85,
    attackDamage: 42,         // 38 - 45 de daño letal por zarpazo
    attackCooldownMs: 1000,
    lootDrop: ['sniper', 'medkit', 'ammo']
  },
  jaguar: {
    id: 'jaguar',
    name: 'Jaguar Colombiano',
    behavior: 'predator',
    maxHp: 95,
    radius: 0.65,
    height: 1.05,
    walkSpeed: 3.4,
    runSpeed: 9.2,
    attackRange: 1.55,
    attackDamage: 19,
    attackCooldownMs: 880,
    lootDrop: ['rifle', 'bandage']
  },
  capybara: {
    id: 'capybara',
    name: 'Chigüiro',
    behavior: 'timid',
    maxHp: 50,
    radius: 0.48,
    height: 0.75,
    walkSpeed: 2.0,
    runSpeed: 7.8,
    attackRange: 0,
    attackDamage: 0,
    attackCooldownMs: 0,
    lootDrop: ['bandage']
  },
  condor: {
    id: 'condor',
    name: 'Cóndor de los Andes',
    behavior: 'aerial',
    maxHp: 70,
    radius: 0.95,
    height: 0.9,
    walkSpeed: 12.5,
    runSpeed: 15.0,
    attackRange: 0,
    attackDamage: 0,
    attackCooldownMs: 0,
    lootDrop: ['sniper', 'medkit']
  }
};

export function getJumpHeightFactor(jumpAltitude = 198, cfg = PARACHUTE_CONFIG) {
  const span = Math.max(1, cfg.maxJumpHeightRef - cfg.minJumpHeightRef);
  const raw = Math.max(0, Math.min(1, (jumpAltitude - cfg.minJumpHeightRef) / span));
  return cfg.heightSpeedMode === 'slower_from_high' ? 1 - raw : raw;
}

export function computeTargetDescentSpeed(jumpAltitude, state, pitch = 0, cfg = PARACHUTE_CONFIG) {
  const factor = getJumpHeightFactor(jumpAltitude, cfg);
  if (state === 'parachuting') {
    const baseCanopy = cfg.canopyMinSpeed + (cfg.canopyMaxSpeed - cfg.canopyMinSpeed) * factor;
    const pitchMod = pitch < -0.25 ? Math.min(1.4, (-pitch - 0.25) * 1.8) : 0;
    return Math.max(5.5, baseCanopy + pitchMod);
  }
  const baseFreefall = cfg.freefallMinSpeed + (cfg.freefallMaxSpeed - cfg.freefallMinSpeed) * factor;
  let pitchAdjust = 0;
  if (pitch < -0.2) {
    pitchAdjust = Math.min(cfg.freefallDiveBonus, (-pitch - 0.2) * (cfg.freefallDiveBonus / 0.85));
  } else if (pitch > -0.05) {
    pitchAdjust = -cfg.freefallGlideReduction * Math.min(1, (pitch + 0.05) / 0.5);
  }
  return Math.max(13.5, baseFreefall + pitchAdjust);
}

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

function hash2D(ix, iz, seed) {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) | 0;
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(t) {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function valueNoise2D(x, z, seed) {
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

function distToSegment(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const lenSq = vx * vx + vz * vz;
  if (lenSq < 1e-6) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, (wx * vx + wz * vz) / lenSq));
  return Math.hypot(px - (ax + t * vx), pz - (az + t * vz));
}

class SpatialExclusionGrid {
  constructor(cellSize = 8) {
    this.cellSize = cellSize;
    this.buckets = new Map();
  }

  _key(cx, cz) {
    return `${cx},${cz}`;
  }

  canPlace(x, z, radius) {
    const rPad = radius + 7;
    const cx0 = Math.floor((x - rPad) / this.cellSize);
    const cx1 = Math.floor((x + rPad) / this.cellSize);
    const cz0 = Math.floor((z - rPad) / this.cellSize);
    const cz1 = Math.floor((z + rPad) / this.cellSize);

    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const arr = this.buckets.get(this._key(cx, cz));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const item = arr[i];
          const minSep = radius + item.r;
          const dx = x - item.x;
          const dz = z - item.z;
          if (dx * dx + dz * dz < minSep * minSep) return false;
        }
      }
    }
    return true;
  }

  register(x, z, radius) {
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    const key = this._key(cx, cz);
    let arr = this.buckets.get(key);
    if (!arr) {
      arr = [];
      this.buckets.set(key, arr);
    }
    arr.push({ x, z, r: radius });
  }
}

class SpatialCollisionIndex {
  constructor(cellSize = 10) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.allColliders = [];
  }

  addBox(minX, maxX, minY, maxY, minZ, maxZ, walkableTop = false, tag = 'wall', meta = null) {
    const col = { type: 'box', minX, maxX, minY, maxY, minZ, maxZ, walkableTop, tag, enabled: true, meta };
    this.allColliders.push(col);
    const cx0 = Math.floor(minX / this.cellSize);
    const cx1 = Math.floor(maxX / this.cellSize);
    const cz0 = Math.floor(minZ / this.cellSize);
    const cz1 = Math.floor(maxZ / this.cellSize);
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const k = `${cx},${cz}`;
        let list = this.cells.get(k);
        if (!list) {
          list = [];
          this.cells.set(k, list);
        }
        list.push(col);
      }
    }
    return col;
  }

  addCylinder(x, z, radius, minY, maxY, tag = 'trunk', meta = null) {
    const col = { type: 'cylinder', x, z, r: radius, minY, maxY, walkableTop: false, tag, enabled: true, meta };
    this.allColliders.push(col);
    const cx0 = Math.floor((x - radius) / this.cellSize);
    const cx1 = Math.floor((x + radius) / this.cellSize);
    const cz0 = Math.floor((z - radius) / this.cellSize);
    const cz1 = Math.floor((z + radius) / this.cellSize);
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const k = `${cx},${cz}`;
        let list = this.cells.get(k);
        if (!list) {
          list = [];
          this.cells.set(k, list);
        }
        list.push(col);
      }
    }
    return col;
  }

  queryNear(x, z, radius) {
    const cx0 = Math.floor((x - radius) / this.cellSize);
    const cx1 = Math.floor((x + radius) / this.cellSize);
    const cz0 = Math.floor((z - radius) / this.cellSize);
    const cz1 = Math.floor((z + radius) / this.cellSize);
    const out = [];
    const seen = new Set();
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const list = this.cells.get(`${cx},${cz}`);
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const c = list[i];
          if (!seen.has(c)) {
            seen.add(c);
            out.push(c);
          }
        }
      }
    }
    return out;
  }

  querySegmentXZ(x0, z0, x1, z1) {
    const minX = Math.min(x0, x1) - 1;
    const maxX = Math.max(x0, x1) + 1;
    const minZ = Math.min(z0, z1) - 1;
    const maxZ = Math.max(z0, z1) + 1;
    const cx0 = Math.floor(minX / this.cellSize);
    const cx1 = Math.floor(maxX / this.cellSize);
    const cz0 = Math.floor(minZ / this.cellSize);
    const cz1 = Math.floor(maxZ / this.cellSize);
    const out = [];
    const seen = new Set();
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const list = this.cells.get(`${cx},${cz}`);
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const c = list[i];
          if (!seen.has(c)) {
            seen.add(c);
            out.push(c);
          }
        }
      }
    }
    return out;
  }
}

export function generateCocoraMap(seed = DEFAULT_MAP_SEED) {
  const rng = createRNG(seed);
  const V = GRID_SIZE + 1;
  const heightGrid = new Float32Array(V * V);
  const surfaceGrid = new Uint8Array(V * V);
  const surfaceHeights = new Uint8Array(GRID_SIZE * GRID_SIZE);

  // Puntos de Interés (POIs) expandidos en todo el mapa de 640x640 metros (elevados sobre mesetas naturales, nunca en huecos)
  const salento = { name: 'Salento', x: 56, z: 4, radius: 72 };
  const fincaOcaso = { name: 'Finca El Ocaso', x: -162, z: 148, radius: 42 };
  const fincaPalma = { name: 'Finca La Palma', x: 178, z: -148, radius: 42 };
  const lumberCamp = { name: 'Campamento Maderero', x: -175, z: -148, radius: 40 };
  const bodegaRio = { name: 'Bodega del Río', x: -102, z: 48, radius: 34 };
  const puestoNorte = { name: 'Puesto Vigía Norte', x: 35, z: -205, radius: 30 };
  const puestoSur = { name: 'Fortín del Sur', x: 58, z: 205, radius: 30 };
  const caserioEste = { name: 'Caserío La Quebrada', x: 215, z: 28, radius: 36 };
  const mountainRuins = { name: 'Ruinas Andinas', x: 162, z: 132, radius: 30 };
  const mirador = { name: 'Mirador del Cocora', x: -148, z: -18, radius: 26 };

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
  const mountainPeaks = [
    { name: 'Cerro Morrogacho', x: -98, z: -252, radius: 82, addHeight: 33.0 },
    { name: 'Peñón del Cóndor', x: 238, z: 218, radius: 88, addHeight: 35.0 },
    { name: 'Farallón Cafetero', x: -252, z: 58, radius: 78, addHeight: 31.0 }
  ];

  const coffeeTerraceZones = [
    { x: -135, z: 112, r: 48 },
    { x: 145, z: -115, r: 48 },
    { x: 128, z: 68, r: 40 }
  ];

  // 4 Puentes sobre el Río Quindío y 2 vados amplios
  const bridgeZCoords = [-192, -64, 56, 186];
  const fordZCoords = [-128, 122];
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

  // 1. Generación base de malla orgánica continua (321x321 vértices)
  for (let vz = 0; vz < V; vz++) {
    const wz = (vz - GRID_SIZE / 2) * CELL_SIZE;
    const riverX = getRiverCenterWorldX(wz);

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

      const distRiver = Math.abs(wx - riverX);
      let surf = SURFACE.GRASS_VALLEY;

      if (distRiver < 19.5) {
        if (distRiver < 8.8) {
          const centerProfile = smoothstep(1 - distRiver / 8.8);
          const bedDepth = fordFactor > 0.2 ? 2.45 : 0.65 + (1 - centerProfile) * 1.35;
          h = bedDepth;
          surf = SURFACE.RIVER_BED;
        } else {
          const bankT = smoothstep((distRiver - 8.8) / 10.7);
          const bankBase = WATER_LEVEL + 0.35;
          h = bankBase + (h - bankBase) * bankT;
          surf = distRiver < 12.6 ? SURFACE.RIVER_SAND : SURFACE.GRASS_VALLEY;
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
        if (Math.abs(wx - getRiverCenterWorldX(wz)) < 16.5) continue;

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

    // Colisionadores de tablero central, rampas suaves (para raycasts/cámara) y barandillas laterales completas
    colliders.addBox(cx - spanFlatHalf, cx + spanFlatHalf, deckY - 0.34, deckY, bz - widthHalf, bz + widthHalf, true, 'bridge');
    for (let s = 0; s < 6; s++) {
      const t0 = s / 6;
      const t1 = (s + 1) / 6;
      const lyTop = leftGround + (deckY - leftGround) * t1;
      const ryTop = rightGround + (deckY - rightGround) * t1;
      colliders.addBox(cx - totalHalf + rampLen * t0, cx - totalHalf + rampLen * t1, lyTop - 0.45, lyTop, bz - widthHalf, bz + widthHalf, true, 'bridge_ramp');
      colliders.addBox(cx + totalHalf - rampLen * t1, cx + totalHalf - rampLen * t0, ryTop - 0.45, ryTop, bz - widthHalf, bz + widthHalf, true, 'bridge_ramp');
    }
    colliders.addBox(cx - totalHalf + 1.0, cx + totalHalf - 1.0, deckY - 0.4, deckY + 1.08, bz - widthHalf - 0.24, bz - widthHalf + 0.12, false, 'railing');
    colliders.addBox(cx - totalHalf + 1.0, cx + totalHalf - 1.0, deckY - 0.4, deckY + 1.08, bz + widthHalf - 0.12, bz + widthHalf + 0.24, false, 'railing');

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
  // Basamento escalonado de piedra transitable + colisionadores de letras monumentales C-O-C-O-R-A
  colliders.addBox(cocoraMonument.x - 13.8, cocoraMonument.x + 13.8, cocoraMonument.y - 2.4, cocoraMonument.y + 0.68, cocoraMonument.z - 2.1, cocoraMonument.z + 2.1, true, 'monument_plinth');
  const letterCentersX = [-10.5, -6.3, -2.1, 2.1, 6.3, 10.5];
  for (let li = 0; li < letterCentersX.length; li++) {
    const lx = cocoraMonument.x + letterCentersX[li];
    const extraCondorH = li === 4 ? 2.6 : 0; // Letra "R" sostiene la escultura del Cóndor Andino
    colliders.addBox(lx - 1.55, lx + 1.55, cocoraMonument.y + 0.68, cocoraMonument.y + 0.68 + cocoraMonument.letterHeight + extraCondorH, cocoraMonument.z - 0.65, cocoraMonument.z + 0.65, true, 'monument_letter');
  }
  addLootSpawn(cocoraMonument.x, cocoraMonument.y + 0.70, cocoraMonument.z + 1.5, 'sniper', true);
  addLootSpawn(cocoraMonument.x - 5.2, cocoraMonument.y + 0.04, cocoraMonument.z + 3.4, 'medkit', true);
  addLootSpawn(cocoraMonument.x + 5.2, cocoraMonument.y + 0.04, cocoraMonument.z + 3.4, 'ammo', true);

  // 2. Helicóptero Militar Estrellado en Llamas (partido en dos secciones en la explanada central)
  let heliGroundH = WATER_LEVEL + 2.5;
  for (let dz = -7; dz <= 7; dz += 3.5) {
    for (let dx = -10; dx <= 8; dx += 3.5) {
      heliGroundH = Math.max(heliGroundH, getTerrainHeightAt(5 + dx, -32 + dz));
    }
  }
  levelRectPlatform(5, -32, 11.5, 8.0, heliGroundH, 5.0, false, SURFACE.SCORCHED_EARTH);
  const helicopterWreck = {
    x: 8.2,
    y: Number(heliGroundH.toFixed(3)),
    z: -33.5,
    yaw: 0.52,
    tailX: -1.4,
    tailY: Number(heliGroundH.toFixed(3)),
    tailZ: -29.2,
    tailYaw: 1.18
  };
  exclusion.register(helicopterWreck.x, helicopterWreck.z, 9.5);
  exclusion.register(helicopterWreck.tailX, helicopterWreck.tailZ, 6.5);
  // Colisionadores tácticos de cabina inclinada y cola separada
  colliders.addBox(helicopterWreck.x - 3.6, helicopterWreck.x + 3.6, helicopterWreck.y - 0.5, helicopterWreck.y + 2.55, helicopterWreck.z - 1.65, helicopterWreck.z + 1.65, true, 'heli_hull');
  colliders.addBox(helicopterWreck.tailX - 2.6, helicopterWreck.tailX + 2.6, helicopterWreck.tailY - 0.4, helicopterWreck.tailY + 1.18, helicopterWreck.tailZ - 0.85, helicopterWreck.tailZ + 0.85, true, 'heli_low');
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

  // ==================== 6. NATURALEZA 100% ORGÁNICA Y ALEATORIA (CERO PATRONES EN CUADRÍCULA) ====================
  const props = {
    waxPalms: [],
    cloudTrees: [],
    stealthBushes: [],
    coffeeBushes: [],
    ferns: [],
    tallGrass: [],
    boulders: [],
    riverFoam: [],
    stoneWalls: [],
    coffeeSacks: [],
    barrels: [],
    woodenCarts: [],
    fences: [],
    fallenLogs: []
  };

  // Rocas alrededor del cráter de explosión (trinchera natural) y rocas con espuma blanca en el cauce del río
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2 + (rng() - 0.5) * 0.28;
    const rr = craterInnerR + 1.4 + rng() * 1.6;
    const rx = craterX + Math.cos(ang) * rr;
    const rz = craterZ + Math.sin(ang) * rr;
    const ry = getTerrainHeightAt(rx, rz);
    const sz = 1.05 + rng() * 0.85;
    colliders.addCylinder(rx, rz, sz * 0.44, ry - 0.5, ry + sz * 0.75, 'boulder');
    props.boulders.push({ x: rx, y: ry, z: rz, scale: sz, rotY: rng() * Math.PI * 2 });
  }

  for (let wz = -WORLD_HALF + 18; wz <= WORLD_HALF - 18; wz += 13.5) {
    const nearBridge = bridges.some((br) => Math.abs(wz - br.z) < 12);
    if (nearBridge) continue;
    const cx = getRiverCenterWorldX(wz) + (rng() - 0.5) * 9.2;
    const bedY = getTerrainHeightAt(cx, wz);
    const rockScale = 1.35 + rng() * 1.15;
    colliders.addCylinder(cx, wz, rockScale * 0.42, bedY - 0.4, WATER_LEVEL + 0.65, 'boulder');
    props.boulders.push({ x: cx, y: WATER_LEVEL - 0.28, z: wz, scale: rockScale, rotY: rng() * Math.PI * 2 });
    props.riverFoam.push({ x: cx, y: WATER_LEVEL + 0.05, z: wz, scale: rockScale * 0.95, rotY: rng() * Math.PI * 2 });
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
      if (Math.abs(fx - getRiverCenterWorldX(fz)) < 19) continue;
      const fy = getTerrainHeightAt(fx, fz);
      const surf = getSurfaceAt(fx, fz);
      if (fy <= WATER_LEVEL + 0.9 || surf === SURFACE.TOWN_COBBLESTONE || surf === SURFACE.SCORCHED_EARTH) continue;
      if (getSlopeAt(fx, fz) > 0.45 || !exclusion.canPlace(fx, fz, 1.8)) continue;
      const hx = Math.abs(dirX) * 1.7 + 0.22;
      const hz = Math.abs(dirZ) * 1.7 + 0.22;
      exclusion.register(fx, fz, 1.8);
      colliders.addBox(fx - hx, fx + hx, fy - 0.4, fy + 1.05, fz - hz, fz + hz, false, 'fence');
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
    if (Math.abs(wx - getRiverCenterWorldX(wz)) < 17) continue;

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
    if (Math.abs(wx - getRiverCenterWorldX(wz)) < 16) continue;

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
    if (Math.abs(wx - getRiverCenterWorldX(wz)) < 16) continue;

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
    if (Math.abs(wx - getRiverCenterWorldX(wz)) < 17) continue;

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
    if (Math.abs(wx - getRiverCenterWorldX(wz)) < 17) continue;

    const gy = getTerrainHeightAt(wx, wz);
    const surf = getSurfaceAt(wx, wz);
    if (gy <= WATER_LEVEL + 0.8 || surf === SURFACE.CAVE_ROCK || surf === SURFACE.DIRT_TRAIL || surf === SURFACE.TOWN_COBBLESTONE) continue;
    if (getSlopeAt(wx, wz) > 0.48 || !exclusion.canPlace(wx, wz, 2.2)) continue;

    const ewOrient = rng() < 0.5;
    const rotY = (ewOrient ? 0 : Math.PI * 0.5) + (rng() - 0.5) * 0.12;
    const hx = ewOrient ? 1.8 : 0.18;
    const hz = ewOrient ? 0.18 : 1.8;
    exclusion.register(wx, wz, 1.95);
    colliders.addBox(wx - hx, wx + hx, gy - 0.4, gy + 1.05, wz - hz, wz + hz, false, 'fence');
    props.fences.push({ x: wx, y: gy, z: wz, scale: 1.0, rotY });
  }

  // 6. Troncos caídos musgosos en bosques y claros (~46 instancias)
  for (let i = 0; i < 1600 && props.fallenLogs.length < 46; i++) {
    const wx = (rng() - 0.5) * (WORLD_SIZE - 48);
    const wz = (rng() - 0.5) * (WORLD_SIZE - 48);
    if (Math.abs(wx - getRiverCenterWorldX(wz)) < 16) continue;

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
      if (Math.abs(wx - getRiverCenterWorldX(wz)) < 17) continue;
      const gy = getTerrainHeightAt(wx, wz);
      const surf = getSurfaceAt(wx, wz);
      if (gy <= WATER_LEVEL + 1.0 || surf === SURFACE.DIRT_TRAIL || getSlopeAt(wx, wz) > 0.78) continue;
      if (!exclusion.canPlace(wx, wz, 1.3)) continue;

      exclusion.register(wx, wz, 1.25);
      props.coffeeBushes.push({ x: wx, y: gy, z: wz, scale: 0.75 + rng() * 0.65, rotY: rng() * Math.PI * 2 });
      placed++;
    }
  }

  // Peñascos irregulares Low-Poly (0.8m a 4.5m)
  for (let i = 0; i < 2000 && props.boulders.length < 175; i++) {
    const nearRiver = i < 420;
    const wz = (rng() - 0.5) * (WORLD_SIZE - 36);
    const wx = nearRiver
      ? getRiverCenterWorldX(wz) + (rng() < 0.5 ? -1 : 1) * (10.0 + rng() * 9.5)
      : (rng() - 0.5) * (WORLD_SIZE - 36);

    const gy = getTerrainHeightAt(wx, wz);
    const surf = getSurfaceAt(wx, wz);
    if (gy < WATER_LEVEL - 0.2 || surf === SURFACE.CAVE_ROCK || surf === SURFACE.TOWN_COBBLESTONE || getSlopeAt(wx, wz) > 0.95) continue;
    const sizeMeters = 0.8 + Math.pow(rng(), 1.35) * 3.7;
    const radius = sizeMeters * 0.5;
    if (!exclusion.canPlace(wx, wz, radius + 0.85)) continue;

    exclusion.register(wx, wz, radius + 0.55);
    if (sizeMeters >= 1.1) {
      colliders.addCylinder(wx, wz, radius * 0.86, gy - 0.8, gy + sizeMeters * 0.72, 'boulder');
    }
    props.boulders.push({ x: wx, y: gy, z: wz, scale: sizeMeters, rotY: rng() * Math.PI * 2 });
  }

  // Palmas de Cera frondosas agrupadas orgánicamente con claros (escala 0.75x a 1.45x, rotación 0..2π)
  for (let i = 0; i < 4200 && props.waxPalms.length < 195; i++) {
    const wx = (rng() - 0.5) * (WORLD_SIZE - 42) + (rng() - 0.5) * 6;
    const wz = (rng() - 0.5) * (WORLD_SIZE - 42) + (rng() - 0.5) * 6;
    if (Math.abs(wx - getRiverCenterWorldX(wz)) < 16) continue;

    // Agrupación orgánica: favorece bosquecillos densos y deja claros soleados
    const density = getForestDensity(wx, wz);
    if (density < 0.34 && rng() > 0.18) continue;

    const gy = getTerrainHeightAt(wx, wz);
    const surf = getSurfaceAt(wx, wz);
    if (gy < WATER_LEVEL + 1.2 || gy > 44 || surf === SURFACE.CAVE_ROCK || surf === SURFACE.TOWN_COBBLESTONE) continue;
    if (getSlopeAt(wx, wz) > 0.68 || !exclusion.canPlace(wx, wz, 2.8)) continue;

    const scale = 0.75 + rng() * 0.70; // 0.75x a 1.45x
    exclusion.register(wx, wz, 2.55);
    colliders.addCylinder(wx, wz, 0.33 * scale, gy, gy + 17.5 * scale, 'palm_trunk');
    props.waxPalms.push({ x: wx, y: gy, z: wz, scale, rotY: rng() * Math.PI * 2 });
  }

  // Árboles de Bosque de Niebla con agrupación orgánica (escala 0.75x a 1.45x, rotación 0..2π)
  for (let i = 0; i < 4600 && props.cloudTrees.length < 225; i++) {
    const wx = (rng() - 0.5) * (WORLD_SIZE - 38) + (rng() - 0.5) * 5;
    const wz = (rng() - 0.5) * (WORLD_SIZE - 38) + (rng() - 0.5) * 5;
    if (Math.abs(wx - getRiverCenterWorldX(wz)) < 15) continue;

    const density = getForestDensity(wx + 120, wz - 90);
    if (density < 0.36 && rng() > 0.20) continue;

    const gy = getTerrainHeightAt(wx, wz);
    const surf = getSurfaceAt(wx, wz);
    if (gy < WATER_LEVEL + 1.0 || surf === SURFACE.CAVE_ROCK || surf === SURFACE.TOWN_COBBLESTONE) continue;
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
      const wx = riverNear
        ? getRiverCenterWorldX(wz) + (rng() < 0.5 ? -1 : 1) * (11.5 + rng() * 12)
        : (rng() - 0.5) * (WORLD_SIZE - 90);

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
    return Math.abs(wx - getRiverCenterWorldX(wz)) < 9.5 && wy <= WATER_LEVEL + 0.3;
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
      if (gy === 2 && Math.abs(wx - getRiverCenterWorldX(wz)) < 9.0) return BLOCK.WATER;
      return BLOCK.AIR;
    }
  };
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
