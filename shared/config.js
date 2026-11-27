// shared/config.js
// Constantes del juego: mundo, jugador, armas, botín, bots, tormenta, caída y paracaídas.
// @ts-check

// ==================== ESTADOS (constantes congeladas) ====================
// Valores en cable idénticos a los strings históricos: cliente, servidor y snapshots siguen siendo compatibles.
// Usar siempre estas constantes en lugar de strings sueltos ('ground', 'skydiving', ...).

/** Estado de alto nivel de un jugador (humano o bot). */
export const PLAYER_STATE = Object.freeze({
  LOBBY: 'lobby',
  PLANE: 'plane',
  SKYDIVING: 'skydiving',
  PARACHUTING: 'parachuting',
  GROUND: 'ground',
  SWIMMING: 'swimming',
  DEAD: 'dead',
  SPECTATING: 'spectating'
});

/** Modo de movimiento (anima el avatar y ajusta ruido/velocidad). */
export const MOVE_MODE = Object.freeze({
  IDLE: 'idle',
  STAND: 'stand',
  WALK: 'walk',
  CROUCH_IDLE: 'crouch_idle',
  CROUCH_WALK: 'crouch_walk',
  SPRINT: 'sprint',
  SLIDE: 'slide',
  VAULT: 'vault',
  JUMP: 'jump',
  FALL: 'fall',
  SWIM: 'swim',
  SWIM_FAST: 'swim_fast',
  SWIM_IDLE: 'swim_idle',
  SWIMMING: 'swimming', // legado: lo compara la animación del avatar; la simulación no lo asigna
  SEATED: 'seated',
  WALK_CABIN: 'walk_cabin',
  RAMP_JUMP: 'ramp_jump'
});

/** Fase de la sala de juego en el servidor. */
export const GAME_PHASE = Object.freeze({
  LOBBY: 'lobby',
  PLAYING: 'playing',
  ENDED: 'ended'
});

/** Estado del cierre de la tormenta. */
export const STORM_STATE = Object.freeze({
  WAITING: 'waiting',
  SHRINKING: 'shrinking',
  CLOSED: 'closed'
});

/** Estado de IA de la fauna. */
export const WILDLIFE_STATE = Object.freeze({
  PEACEFUL: 'peaceful',
  HOSTILE: 'hostile',
  FLEEING: 'fleeing'
});

export const CELL_SIZE = 2.0;
export const BLOCK_SIZE = CELL_SIZE;
export const GRID_SIZE = 320; // 320 x 2m = 640 x 640 metros reales (-320m a +320m)
export const WORLD_SIZE = GRID_SIZE * CELL_SIZE;
export const WORLD_HALF = WORLD_SIZE / 2; // 320m
// Superficie elevada del Río Quindío y su Desembocadura Andina, integrada a nivel natural del valle
// (apenas ~1.0m - 1.6m por debajo de las praderas ribereñas, eliminando el efecto de cañón profundo).
export const WATER_LEVEL = 12.4;
export const RIVER_CENTER_DEPTH = 2.55; // profundidad en el centro del cauce
export const RIVER_EDGE_DEPTH = 0.85; // transición gradual junto a la orilla húmeda
export const RIVER_FORD_DEPTH = 0.72; // vados: se cruzan caminando

// Laguna / Desembocadura Andina Nadable en el tramo sur del valle (lejos de casas y puentes)
export const LAGOON_CONFIG = {
  mouthStartZ: 194.0, // ensanchamiento progresivo al sur del último puente de piedra (bSouth en z = 186)
  centerZ: 252.0,     // centro de la cuenca abierta del sur
  endZ: 296.0,        // ribera sur natural antes del anfiteatro montañoso
  radiusX: 43.0,      // semieje transversal (~86m de espejo de agua)
  radiusZ: 39.0,      // semieje longitudinal (~78m)
  maxDepth: 3.45      // profundidad máxima continua en el corazón de la laguna (> 1.25m)
};

// Nado y ahogamiento
export const SWIM_CONFIG = {
  swimDepth: 1.25, // umbral exacto de pecho (waterLevel - groundHeight > 1.25m activa swimming)
  wadeSpeedMult: 0.68, // velocidad al vadear en orillas someras
  floatDepth: 1.36, // al nadar, los pies quedan a esta profundidad (cabeza y hombros fuera)
  swimSpeed: 3.4,
  swimSprintSpeed: 4.8,
  maxBreath: 100,
  drainPerSec: 4.0, // ~25 s nadando normal
  sprintDrainPerSec: 7.0, // ~14 s nadando rápido (Shift)
  regenPerSec: 25, // fuera del agua se recupera en ~4 s
  drownDps: 10 // daño por segundo con el aliento agotado
};
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

// Arsenal táctico completo de "Armas v1" (7 armas de fuego 3D diferenciadas + machete ligero de respaldo inicial)
export const WEAPON_SLOTS = ['pistol', 'revolver', 'shotgun', 'smg', 'assault_rifle', 'rifle', 'sniper'];

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
    name: 'Pistola Semiautomática 9mm',
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
  revolver: {
    id: 'revolver',
    slot: 2,
    name: 'Revólver Clásico .357',
    magSize: 6,
    startAmmo: 18,
    fireRateMs: 430,
    damage: 44,
    headshotMult: 1.85,
    reloadMs: 1680,
    range: 145,
    spread: 0.006,
    pellets: 1,
    recoil: 0.038,
    adsFov: 54,
    moveSpeedMult: 1.01,
    auto: false
  },
  shotgun: {
    id: 'shotgun',
    slot: 3,
    name: 'Escopeta de Corredera 12G',
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
    slot: 4,
    name: 'Subfusil Compacto MP-9',
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
  assault_rifle: {
    id: 'assault_rifle',
    slot: 5,
    name: 'Rifle de Asalto M4-T',
    magSize: 30,
    startAmmo: 60,
    fireRateMs: 96,
    damage: 19,
    headshotMult: 1.6,
    reloadMs: 1560,
    range: 265,
    spread: 0.0095,
    pellets: 1,
    recoil: 0.014,
    adsFov: 46,
    moveSpeedMult: 0.98,
    auto: true
  },
  rifle: {
    id: 'rifle',
    slot: 6,
    name: 'Fusil Clásico AK-M',
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
    slot: 7,
    name: 'Rifle de Francotirador .338',
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
  pistol: { id: 'pistol', label: 'Pistola Semiautomática 9mm', color: '#38bdf8', pickupRadius: 1.65, autoPickup: false },
  revolver: { id: 'revolver', label: 'Revólver Clásico .357', color: '#e2e8f0', pickupRadius: 1.68, autoPickup: false },
  shotgun: { id: 'shotgun', label: 'Escopeta de Corredera 12G', color: '#fb923c', pickupRadius: 1.75, autoPickup: false },
  smg: { id: 'smg', label: 'Subfusil Compacto MP-9', color: '#a855f7', pickupRadius: 1.7, autoPickup: false },
  assault_rifle: { id: 'assault_rifle', label: 'Rifle de Asalto M4-T', color: '#10b981', pickupRadius: 1.75, autoPickup: false },
  rifle: { id: 'rifle', label: 'Fusil Clásico AK-M', color: '#f59e0b', pickupRadius: 1.75, autoPickup: false },
  sniper: { id: 'sniper', label: 'Rifle de Francotirador .338', color: '#ef4444', pickupRadius: 1.8, autoPickup: false },
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

/**
 * Daño por caída según la distancia caída: 0 bajo la altura segura, progresivo hasta la severa y letal por encima.
 * @param {number} fallDistance metros caídos desde el punto más alto
 * @param {typeof FALL_DAMAGE_CONFIG} [cfg]
 * @returns {number} puntos de vida a restar (entero)
 */
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

// Paso fijo compartido (60 Hz) y bitmask de botones para simulación determinista cliente/servidor
export const SIM_TICK_RATE = 60;
export const SIM_DT = 1 / SIM_TICK_RATE;

export const PLAYER_INPUT_BUTTONS = {
  JUMP: 1 << 0,
  SPRINT: 1 << 1,
  CROUCH: 1 << 2,
  SLIDE: 1 << 3,
  ADS: 1 << 4,
  PARACHUTE: 1 << 5
};

// ==================== FASE 2: CINEMÁTICA Y SENSACIÓN DE MOVIMIENTO (GAME FEEL) ====================

export const MOVEMENT_CONFIG = {
  // Velocidades objetivo base en suelo (m/s) — idénticas al balance original
  walkSpeed: 5.5,
  sprintSpeed: 8.2,
  crouchSpeed: 3.4,
  jumpVelocity: 7.6,
  gravity: 22.0,

  // Aceleración y fricción progresivas (suelo y aire)
  groundAccel: 76.0,          // m/s²: respuesta ágil alcanzando tope exacto sin tirón instantáneo
  groundFriction: 8.5,        // 1/s: desaceleración limpia al soltar teclas o cambiar dirección
  stopSpeed: 1.4,             // m/s: umbral bajo el cual la fricción detiene por completo
  airAccel: 18.0,             // m/s²: control aéreo limitado conservando el impulso horizontal
  airFriction: 0.35,          // 1/s: arrastre horizontal mínimo en el aire
  maxAirWishSpeed: 6.2,       // m/s: tope de velocidad alcanzable solo por redirección aérea

  // Asistencias de salto deterministas
  coyoteTimeSec: 0.10,        // 100 ms de margen para saltar tras abandonar un borde
  jumpBufferTimeSec: 0.12,    // 120 ms de memoria de salto si se pulsa antes de aterrizar

  // Escalones y adhesión a pendientes / escaleras
  maxStepHeight: 0.45,        // m: altura máxima de escalón que se sube automáticamente
  stepMinHorizSpeed: 0.15,    // m/s: velocidad horizontal mínima para evaluar subida de escalón
  groundSnapDist: 0.50,       // m: distancia vertical máxima de adhesión al bajar pendientes/escaleras
  maxWalkableSlope: 1.75      // pendiente máxima caminable antes de bloquear subida
};

export const SLIDE_FEEL_CONFIG = {
  minEntrySpeed: 6.5,         // m/s mínimos en carrera para iniciar deslizamiento
  impulseBonus: 4.4,          // m/s de impulso adicional sobre la carrera (hasta initialSpeed)
  maxDownhillSpeed: 16.5,     // m/s máximos deslizándose cuesta abajo
  flatFriction: 7.5,          // m/s² de desaceleración en terreno plano
  uphillBrakeFactor: 13.0,    // frenado adicional proporcional a pendiente en subida
  downhillAccelFactor: 12.5,  // aceleración adicional proporcional a pendiente en bajada
  exitToCrouchSpeed: 4.2      // m/s: al caer bajo este umbral pasa suavemente a estado agachado
};

export const CAMERA_FEEL_CONFIG = {
  // Resorte críticamente amortiguado (frecuencia angular natural ω en rad/s)
  followSpringOmega: 20.0,    // seguimiento de posición de cámara en 3ra persona
  pivotSpringOmega: 18.0,     // transición de altura de ojos/pivote (de pie <-> agachado <-> slide)
  distPullInOmega: 32.0,      // acercamiento rápido ante oclusión de geometría
  distRecoverOmega: 12.0,     // retorno suave de distancia al despejarse el obstáculo
  fovSpringOmega: 14.0,       // suavizado de apertura/cierre de FOV

  // Sensación de impacto, sprint y head bob
  baseThirdFov: 70.0,
  baseFirstFov: 78.0,
  sprintFovBoostDeg: 4.5,     // apertura progresiva (+4.5°, rango +3°..+5°) al esprintar
  landingDipPerMps: 0.022,    // m de compresión de cámara por cada m/s de velocidad vertical de impacto
  landingMaxDip: 0.28,        // m máximos de compresión al aterrizar
  landingSpringOmega: 16.0,   // resorte de recuperación tras impacto contra el suelo

  headBobEnabled: true,       // flag configurable para activar/desactivar balanceo de cabeza
  headBobFirstAmpY: 0.024,
  headBobFirstAmpX: 0.012,
  headBobThirdAmpY: 0.014,
  headBobSprintMult: 1.45
};

export const WEAPON_FEEL_CONFIG = {
  recoilKickOmega: 34.0,      // rapidez del golpe inicial del retroceso visual
  recoilReturnOmega: 13.5,    // resorte de retorno suave hacia el centro tras disparar
  recoilVisualMult: 1.15,     // escala visual del recoil respecto a WEAPONS[id].recoil
  recoilHorizontalJitter: 0.28 // fracción lateral sutil respecto al retroceso vertical
};

export const ANIMATION_FEEL_CONFIG = {
  poseBlendRate: 12.0,        // velocidad de mezcla de pesos entre idle/walk/sprint/crouch/slide/air
  remoteAnimLeadSec: 0.045,   // 45 ms de adelanto de fase de animación en remotos según velocidad
  minMoveSpeedForWalk: 0.25,  // m/s para activar peso de caminata
  sprintWeightThreshold: 6.6  // m/s a partir de los cuales pondera hacia pose de sprint
};

// Aeronaves de desembarco ("Aviones v1") y duración de secuencia animada en bodega (sit -> stand -> walk_cabin -> ramp_jump)
export const TRANSPORT_AIRCRAFT_TYPES = ['auto', 'ac130', 'ch47'];
export const CABIN_DISEMBARK_MS = 1400;

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

/**
 * Factor 0..1 de la altura de salto respecto al rango de referencia del paracaídas.
 * @param {number} [jumpAltitude] altura sobre el suelo al saltar (m)
 * @param {typeof PARACHUTE_CONFIG} [cfg]
 * @returns {number}
 */
export function getJumpHeightFactor(jumpAltitude = 198, cfg = PARACHUTE_CONFIG) {
  const span = Math.max(1, cfg.maxJumpHeightRef - cfg.minJumpHeightRef);
  const raw = Math.max(0, Math.min(1, (jumpAltitude - cfg.minJumpHeightRef) / span));
  return cfg.heightSpeedMode === 'slower_from_high' ? 1 - raw : raw;
}

/**
 * Velocidad de descenso objetivo (m/s, positiva hacia abajo) en caída libre o con el paracaídas abierto.
 * La inclinación hacia abajo (pitch negativo) acelera la caída; mirar al frente planea.
 * @param {number} jumpAltitude altura de salto (m)
 * @param {string} state PLAYER_STATE.SKYDIVING o PLAYER_STATE.PARACHUTING
 * @param {number} [pitch] inclinación de la vista (rad)
 * @param {typeof PARACHUTE_CONFIG} [cfg]
 * @returns {number}
 */
export function computeTargetDescentSpeed(jumpAltitude, state, pitch = 0, cfg = PARACHUTE_CONFIG) {
  const factor = getJumpHeightFactor(jumpAltitude, cfg);
  if (state === PLAYER_STATE.PARACHUTING) {
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

// ==================== FASE 4: CPU, MEMORIA, SERVIDOR Y AUDIO ====================

export const SPATIAL_GRID_CONFIG = {
  coordOffset: 512,           // Desplazamiento entero para soportar celdas negativas [-512, +511] sin colisión
  coordShift: 10,             // Desplazamiento bit a bit (equivalente a * 1024 en entero Smi sin HeapNumber)
  coordStride: 1024,          // Multiplicador entero por fila (2^10)
  maxStamp: 0x7fffffff        // Tope entero Smi de 31 bits antes de reiniciar queryStamp en colisionadores
};

export const CLIENT_PERF_CONFIG = {
  hudSensorHz: 10,            // Frecuencia máxima (10 Hz) para findBestInteractable e isConcealedInBush
  hudSensorIntervalSec: 0.10, // Intervalo mínimo entre escaneos contextuales del HUD (1 / 10 Hz)
  damageFlashDurationMs: 190  // Duración en ms del destello de daño antes de atenuarse
};

export const BOT_AI_CONFIG = {
  visionHz: 8,                // Frecuencia de evaluación de visión/LOS de bots (8 Hz, dentro de 5–10 Hz)
  visionIntervalMs: 125,      // Intervalo en ms entre escaneos completos de objetivos por bot (1000 / 8)
  staggerStepMs: 16,          // Desfase inicial por bot (ms) para repartir raycasts entre distintos ticks
  doorSenseRadius: 2.1,       // Radio horizontal (m) para abrir puertas cercanas usando la grilla espacial
  doorSenseVertical: 1.6      // Diferencia máxima de cota (m) para interactuar con una puerta
};

export const AUDIO_CONFIG = {
  maxVoices: 24,              // Límite estricto de voces simultáneas (roba la más lejana/antigua)
  musicStepDurationSec: 0.26, // Duración exacta de cada paso musical ambiental (s)
  lookaheadIntervalMs: 40,    // Frecuencia del reloj supervisor JS del planificador lookahead (ms)
  scheduleAheadTimeSec: 0.12, // Ventana de pre-programación sobre AudioContext.currentTime (s)
  noiseBufferDurationSec: 1.6,// Duración del buffer compartido de ruido blanco (s)
  spatialNearRefDist: 1.8,    // Distancia de referencia cercana para suavizar el paneo lateral (m)
  maxPanAbs: 0.94             // Amplitud máxima de paneo estéreo [-0.94, +0.94]
};

