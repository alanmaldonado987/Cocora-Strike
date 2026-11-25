// shared/config.js
// Constantes del juego: mundo, jugador, armas, botín, bots, tormenta, caída y paracaídas.

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
