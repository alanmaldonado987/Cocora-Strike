// server/gameRoom.js
// Servidor autoritativo (20 Hz) en escala métrica (1.80m):
// - Avión a ~198m sobre el valle con caída libre de ~10s (apertura automática a 25m)
// - Soporte multinivel completo (getGroundHeightAt con cota de referencia para pisos 2/3, puentes y cuevas)
// - Oso de Anteojos letal (42 dmg, persecución veloz y triple drop de alto nivel) + Arsenal de 5 armas + Bots configurables

import {
  WORLD_HALF,
  WATER_LEVEL,
  DEFAULT_MAP_SEED,
  PLAYER_RADIUS,
  PLAYER_HEIGHT,
  PLAYER_CROUCH_HEIGHT,
  PLAYER_SLIDE_HEIGHT,
  PLAYER_EYE_HEIGHT,
  PLAYER_CROUCH_EYE_HEIGHT,
  PLAYER_SLIDE_EYE_HEIGHT,
  WEAPONS,
  LOOT_TYPES,
  BOT_DIFFICULTIES,
  STORM_PHASES,
  STORM_CLOSED_DPS,
  PARACHUTE_CONFIG,
  HEAL_CONFIG,
  WILDLIFE_TYPES,
  computeFallDamage,
  computeTargetDescentSpeed,
  getRiverCenterWorldX,
  generateCocoraMap,
  resolveSlidingHorizontal,
  applyEntitySeparation,
  stepCharacterPhysics,
  senseObstacleAhead,
  raycastVoxels,
  hasLineOfSight,
  createRNG
} from '../shared/mapData.js';

const BOT_NAMES = [
  'Don Juancho',
  'Arriero_Quindio',
  'ChapoleraPro',
  'CaciqueCalarca',
  'Yipao_Turbo',
  'SalentoSniper',
  'PalmaDeCera',
  'CafeteroRex'
];

const TICK_RATE = 20; // Servidor autoritativo a 20 Hz desacoplado del renderizado a 60+ FPS
const TICK_DT = 1 / TICK_RATE;

function normalizeAngle(angle) {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class GameRoom {
  constructor(io) {
    this.io = io;
    this.phase = 'lobby';
    this.seed = DEFAULT_MAP_SEED;
    this.map = generateCocoraMap(this.seed);

    this.botDifficulty = 'easy';
    this.desiredBotCount = 6;

    this.players = new Map();
    this.loot = new Map();
    this.wildlife = new Map();
    this.doorsById = new Map();
    this.windowsById = new Map();
    this.syncMapInteractiveIndex();
    this.nextLootId = 1;
    this.nextAnimalId = 1;
    this.nextColorIdx = 0;

    this.plane = null;
    this.storm = this.createInitialStorm();
    this.lobbyCountdown = null;
    this.matchStartTime = 0;
    this.stormDamageAccum = 0;

    this.tickInterval = setInterval(() => this.tick(), 1000 / TICK_RATE);
  }

  createInitialStorm(rng = Math.random) {
    return {
      centerX: (rng() - 0.45) * 70,
      centerZ: (rng() - 0.5) * 70,
      radius: 365,
      startRadius: 365,
      targetRadius: STORM_PHASES[0].targetRadius,
      phaseIndex: 0,
      state: 'waiting',
      timer: STORM_PHASES[0].waitSec,
      dps: STORM_PHASES[0].dps
    };
  }

  createFreshWeaponsMap() {
    return {
      fists: { unlocked: true, mag: 0 },
      pistol: { unlocked: false, mag: 0 },
      shotgun: { unlocked: false, mag: 0 },
      smg: { unlocked: false, mag: 0 },
      rifle: { unlocked: false, mag: 0 },
      sniper: { unlocked: false, mag: 0 }
    };
  }

  createFreshParticipant(id, name, isBot = false) {
    const cleanName = String(name || 'Jugador').trim().slice(0, 16) || 'Cafetero';
    const colorIdx = this.nextColorIdx++ % 8;
    return {
      id,
      name: cleanName,
      isBot,
      colorIdx,
      seatIndex: 0,
      alive: true,
      spectating: false,
      hp: 100,
      maxHp: 100,
      kills: 0,
      placement: 0,
      state: 'lobby',
      x: 0,
      y: 20,
      z: 0,
      vy: 0,
      yaw: 0,
      pitch: 0,
      onGround: false,
      isSliding: false,
      isCrouching: false,
      animWalk: 0,
      moveMode: 'idle',
      jumpAltitude: PARACHUTE_CONFIG.planeHeightAboveValley,
      fallPeakY: 20,
      lastAlertedById: null,
      alertedUntil: 0,
      equipped: 'fists',
      weapons: this.createFreshWeaponsMap(),
      reserveAmmo: 24,
      medkits: 0,
      bandages: 0,
      healingUntil: 0,
      healingItem: null,
      reloadingUntil: 0,
      reloadWeapon: null,
      lastShotAt: 0,
      ai: isBot
        ? {
            jumpDelay: 1.5 + Math.random() * 9.5,
            wanderAngle: Math.random() * Math.PI * 2,
            nextDecisionAt: 0,
            strafeDir: Math.random() < 0.5 ? -1 : 1,
            targetPoint: null,
            spottedTargetId: null,
            spottedSince: 0,
            nextBurstAllowedAt: 0,
            stuckRefX: 0,
            stuckRefZ: 0,
            stuckTimer: 0,
            evadeUntil: 0,
            evadeYaw: 0,
            slideUntil: 0,
            nextSlideAllowedAt: 0
          }
        : null
    };
  }

  addHumanPlayer(socket, nickname) {
    const p = this.createFreshParticipant(socket.id, nickname, false);
    if (this.phase === 'playing') {
      p.alive = false;
      p.spectating = true;
      p.state = 'spectating';
      p.x = 56;
      p.y = 58;
      p.z = 4;
      this.players.set(socket.id, p);
      socket.emit('joined_midgame', {
        selfId: socket.id,
        seed: this.seed,
        loot: Array.from(this.loot.values()),
        doors: this.serializeDoors(),
        brokenWindows: this.serializeBrokenWindows(),
        wildlife: this.serializeWildlife(),
        storm: this.storm,
        plane: this.plane,
        botDifficulty: this.botDifficulty
      });
    } else {
      this.players.set(socket.id, p);
      this.syncLobbyBotsCount(this.desiredBotCount);
      this.checkAutoLobbyStart();
    }
    this.broadcastLobbyState();
    return p;
  }

  removePlayer(socketId) {
    const p = this.players.get(socketId);
    if (!p) return;
    const wasPlayingAlive = this.phase === 'playing' && p.alive && !p.spectating;
    this.players.delete(socketId);

    if (wasPlayingAlive) {
      this.io.emit('player_eliminated', {
        victimId: p.id,
        victimName: p.name,
        killerName: 'Desconexión',
        reason: 'disconnect'
      });
      this.checkWinCondition();
    }

    const humansLeft = Array.from(this.players.values()).filter((pl) => !pl.isBot).length;
    if (humansLeft === 0) {
      this.resetToLobby(true);
    } else {
      this.checkAutoLobbyStart();
      this.broadcastLobbyState();
    }
  }

  configureBots({ botDifficulty, botCount } = {}) {
    if (this.phase !== 'lobby') return;
    if (botDifficulty && BOT_DIFFICULTIES[botDifficulty]) {
      this.botDifficulty = botDifficulty;
    }
    if (typeof botCount === 'number' && Number.isFinite(botCount)) {
      this.desiredBotCount = Math.max(0, Math.min(8, Math.round(botCount)));
      this.syncLobbyBotsCount(this.desiredBotCount);
    }
    this.broadcastLobbyState();
  }

  syncLobbyBotsCount(targetBots) {
    if (this.phase !== 'lobby') return;
    const clamped = Math.max(0, Math.min(8, targetBots));
    const currentBots = Array.from(this.players.values()).filter((p) => p.isBot);

    if (currentBots.length < clamped) {
      const toAdd = clamped - currentBots.length;
      for (let i = 0; i < toAdd; i++) this._spawnOneBot();
    } else if (currentBots.length > clamped) {
      const toRemove = currentBots.length - clamped;
      for (let i = 0; i < toRemove; i++) {
        this.players.delete(currentBots[currentBots.length - 1 - i].id);
      }
    }
  }

  _spawnOneBot() {
    const currentBots = Array.from(this.players.values()).filter((p) => p.isBot);
    if (currentBots.length >= 8) return;

    const usedNames = new Set(Array.from(this.players.values()).map((p) => p.name));
    const available = BOT_NAMES.filter((n) => !usedNames.has(n));
    const botName =
      available.length > 0
        ? available[Math.floor(Math.random() * available.length)]
        : `Bot_${Math.floor(10 + Math.random() * 89)}`;

    const botId = `bot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const bot = this.createFreshParticipant(botId, botName, true);
    this.players.set(botId, bot);
  }

  addBot() {
    if (this.phase !== 'lobby') return;
    this._spawnOneBot();
    this.desiredBotCount = Array.from(this.players.values()).filter((p) => p.isBot).length;
    this.broadcastLobbyState();
  }

  clearBots() {
    if (this.phase !== 'lobby') return;
    for (const [id, p] of this.players.entries()) {
      if (p.isBot) this.players.delete(id);
    }
    this.desiredBotCount = 0;
    this.broadcastLobbyState();
  }

  checkAutoLobbyStart() {
    if (this.phase !== 'lobby') return;
    const humans = Array.from(this.players.values()).filter((p) => !p.isBot);
    if (humans.length >= 2 && this.lobbyCountdown === null) {
      this.lobbyCountdown = 10;
    } else if (humans.length < 2 && this.lobbyCountdown !== null) {
      this.lobbyCountdown = null;
    }
  }

  broadcastLobbyState() {
    const list = Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      colorIdx: p.colorIdx,
      spectating: p.spectating
    }));
    const botCount = list.filter((p) => p.isBot).length;
    this.io.emit('lobby_state', {
      phase: this.phase,
      players: list,
      botCount,
      botDifficulty: this.botDifficulty,
      countdown: this.lobbyCountdown !== null ? Math.ceil(this.lobbyCountdown) : null
    });
  }

  startGame({ autoFillBots = false, botCount, botDifficulty } = {}) {
    if (this.phase === 'playing') return;

    if (botDifficulty && BOT_DIFFICULTIES[botDifficulty]) {
      this.botDifficulty = botDifficulty;
    }
    if (typeof botCount === 'number' && Number.isFinite(botCount)) {
      this.desiredBotCount = Math.max(0, Math.min(8, Math.round(botCount)));
      this.syncLobbyBotsCount(this.desiredBotCount);
    } else if (autoFillBots) {
      const targetBots = Math.max(1, this.desiredBotCount || 6);
      this.syncLobbyBotsCount(targetBots);
    }

    if (this.players.size < 2) {
      this._spawnOneBot();
    }

    this.phase = 'playing';
    this.lobbyCountdown = null;
    this.matchStartTime = Date.now();
    this.stormDamageAccum = 0;
    this.seed = DEFAULT_MAP_SEED + Math.floor(Math.random() * 900);
    this.map = generateCocoraMap(this.seed);
    this.syncMapInteractiveIndex();
    const rng = createRNG(this.seed + 77);

    // Avión a ~198 metros reales sobre el valle central (~10 segundos completos de caída libre)
    const valleyRefY = this.map.getTerrainHeightAt
      ? this.map.getTerrainHeightAt(0, 0)
      : this.map.getGroundHeightAt(0, 0);
    const planeY = Number((valleyRefY + PARACHUTE_CONFIG.planeHeightAboveValley).toFixed(1));

    const angle = rng() * Math.PI * 2;
    const startDist = 295;
    const startX = Math.cos(angle) * startDist;
    const startZ = Math.sin(angle) * startDist;
    const endX = -startX + (rng() - 0.5) * 48;
    const endZ = -startZ + (rng() - 0.5) * 48;

    const dx = endX - startX;
    const dz = endZ - startZ;
    const len = Math.hypot(dx, dz) || 1;
    const planeSpeed = 38;

    this.plane = {
      active: true,
      x: startX,
      y: planeY,
      z: startZ,
      vx: (dx / len) * planeSpeed,
      vz: (dz / len) * planeSpeed,
      yaw: Math.atan2(dx, dz),
      speed: planeSpeed,
      elapsed: 0,
      maxDuration: len / planeSpeed
    };

    this.storm = this.createInitialStorm(rng);
    this.spawnInitialLoot(rng);
    this.spawnInitialWildlife(rng);

    let seatCounter = 0;
    for (const p of this.players.values()) {
      p.seatIndex = seatCounter++;
      p.alive = true;
      p.spectating = false;
      p.hp = 100;
      p.maxHp = 100;
      p.kills = 0;
      p.placement = 0;
      p.state = 'plane';
      p.x = this.plane.x;
      p.y = this.plane.y;
      p.z = this.plane.z;
      p.vy = 0;
      p.yaw = this.plane.yaw;
      p.pitch = 0;
      p.onGround = false;
      p.isSliding = false;
      p.isCrouching = false;
      p.moveMode = 'idle';
      p.jumpAltitude = PARACHUTE_CONFIG.planeHeightAboveValley;
      p.fallPeakY = this.plane.y;
      p.lastAlertedById = null;
      p.alertedUntil = 0;
      p.equipped = 'fists';
      p.weapons = this.createFreshWeaponsMap();
      p.reserveAmmo = 24;
      p.medkits = 0;
      p.bandages = 1;
      p.healingUntil = 0;
      p.healingItem = null;
      p.reloadingUntil = 0;
      p.reloadWeapon = null;

      if (p.isBot && p.ai) {
        p.ai.jumpDelay = 1.6 + rng() * (this.plane.maxDuration * 0.75);
        p.ai.targetPoint = null;
        p.ai.spottedTargetId = null;
        p.ai.spottedSince = 0;
        p.ai.stuckTimer = 0;
        p.ai.evadeUntil = 0;
        p.ai.slideUntil = 0;
      }
    }

    this.io.emit('game_started', {
      seed: this.seed,
      plane: this.plane,
      storm: this.storm,
      loot: Array.from(this.loot.values()),
      doors: this.serializeDoors(),
      brokenWindows: this.serializeBrokenWindows(),
      wildlife: this.serializeWildlife(),
      players: this.serializePlayers(),
      botDifficulty: this.botDifficulty
    });
  }

  syncMapInteractiveIndex() {
    this.doorsById.clear();
    this.windowsById.clear();
    for (const d of this.map.doors || []) {
      this.doorsById.set(d.id, d);
    }
    for (const w of this.map.windows || []) {
      this.windowsById.set(w.id, w);
    }
  }

  serializeDoors() {
    return (this.map.doors || []).map((d) => ({
      id: d.id,
      isOpen: Boolean(d.isOpen),
      hp: d.hp,
      destroyed: Boolean(d.destroyed)
    }));
  }

  serializeBrokenWindows() {
    return (this.map.windows || []).filter((w) => w.broken).map((w) => w.id);
  }

  spawnInitialLoot(rng) {
    this.loot.clear();
    this.nextLootId = 1;

    const randomLootType = () => {
      const r = rng();
      if (r < 0.16) return 'pistol';
      if (r < 0.31) return 'shotgun';
      if (r < 0.47) return 'smg';
      if (r < 0.62) return 'rifle';
      if (r < 0.70) return 'sniper';
      if (r < 0.83) return 'ammo';
      if (r < 0.92) return 'bandage';
      return 'medkit';
    };

    for (const sp of this.map.lootSpawns) {
      const type = sp.preferredType || randomLootType();
      this.createLootItem(type, sp.x, sp.y, sp.z, Boolean(sp.onFlatStructure));
    }

    for (let i = 0; i < 65; i++) {
      const wx = (rng() - 0.5) * 520;
      const wz = (rng() - 0.5) * 520;
      if (Math.abs(wx - getRiverCenterWorldX(wz)) < 16) continue;
      const gy = this.map.getTerrainHeightAt ? this.map.getTerrainHeightAt(wx, wz) : this.map.getGroundHeightAt(wx, wz);
      if (gy <= WATER_LEVEL + 0.8 || gy >= 40 || this.map.getSlopeAt(wx, wz) > 0.55) continue;
      if (!this.map.exclusion.canPlace(wx, wz, 0.95)) continue;

      this.map.exclusion.register(wx, wz, 0.9);
      const safe = this.map.findSafeLootPlacement(wx, gy, wz);
      this.createLootItem(randomLootType(), safe.x, safe.y, safe.z, safe.onFlatStructure);
    }
  }

  createLootItem(type, x, y, z, onFlatStructure = false) {
    const id = `loot_${this.nextLootId++}`;
    const item = {
      id,
      type,
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      z: Number(z.toFixed(2)),
      onFlatStructure: Boolean(onFlatStructure)
    };
    this.loot.set(id, item);
    return item;
  }

  spawnDroppedLootList(types, cx, cy, cz) {
    const offsets = [
      [0.6, 0.0],
      [-0.6, 0.35],
      [0.0, -0.65],
      [0.55, 0.55]
    ];
    const items = [];
    types.forEach((t, idx) => {
      if (!t) return;
      const [ox, oz] = offsets[idx % offsets.length];
      const safe = this.map.findSafeLootPlacement(cx + ox, cy, cz + oz);
      items.push(this.createLootItem(t, safe.x, safe.y, safe.z, safe.onFlatStructure));
    });
    if (items.length > 0) this.io.emit('loot_spawned', { items });
  }

  spawnDroppedLootPair(type1, type2, cx, cy, cz) {
    this.spawnDroppedLootList([type1, type2], cx, cy, cz);
  }

  spawnInitialWildlife(rng) {
    this.wildlife.clear();
    this.nextAnimalId = 1;

    for (const sp of this.map.wildlifeSpawns) {
      const spec = WILDLIFE_TYPES[sp.species];
      if (!spec) continue;
      const id = `animal_${this.nextAnimalId++}`;
      this.wildlife.set(id, {
        id,
        species: sp.species,
        alive: true,
        hp: spec.maxHp,
        maxHp: spec.maxHp,
        radius: spec.radius,
        height: spec.height,
        x: sp.x,
        y: sp.y,
        z: sp.z,
        vy: 0,
        onGround: sp.species !== 'condor',
        yaw: rng() * Math.PI * 2,
        aiState: 'peaceful',
        pose: sp.species === 'condor' ? 'soar' : 'wander',
        animPhase: rng() * 6.28,
        homeX: sp.x,
        homeZ: sp.z,
        orbitAngle: rng() * Math.PI * 2,
        orbitRadius: 55 + rng() * 45,
        baseAlt: sp.y,
        nextStateAt: Date.now() + 1500 + rng() * 3000,
        targetId: null,
        hostileUntil: 0,
        fleeFromX: 0,
        fleeFromZ: 0,
        fleeUntil: 0,
        lastAttackAt: 0,
        stuckRefX: sp.x,
        stuckRefZ: sp.z,
        stuckTimer: 0
      });
    }
  }

  resetToLobby(removeBots = false) {
    this.phase = 'lobby';
    this.plane = null;
    this.loot.clear();
    this.wildlife.clear();
    this.lobbyCountdown = null;

    for (const [id, p] of this.players.entries()) {
      if (removeBots && p.isBot) {
        this.players.delete(id);
        continue;
      }
      p.alive = true;
      p.spectating = false;
      p.hp = 100;
      p.kills = 0;
      p.isSliding = false;
      p.isCrouching = false;
      p.state = 'lobby';
    }

    if (!removeBots) {
      this.syncLobbyBotsCount(this.desiredBotCount);
    }

    this.checkAutoLobbyStart();
    this.broadcastLobbyState();
    this.io.emit('returned_to_lobby');
  }

  handlePlayerJump(socketId) {
    if (this.phase !== 'playing') return;
    const p = this.players.get(socketId);
    if (!p || !p.alive) return;

    const floorY = this.map.getFloorBelowY(p.x, p.y, p.z);
    const clearance = Math.max(0, p.y - floorY);

    if (p.state === 'plane' && this.plane) {
      const backX = -Math.sin(this.plane.yaw) * 7.8;
      const backZ = -Math.cos(this.plane.yaw) * 7.8;
      p.state = 'skydiving';
      p.isSliding = false;
      p.isCrouching = false;
      p.onGround = false;
      p.x = this.plane.x + backX + (Math.random() - 0.5) * 1.0;
      p.y = this.plane.y - 1.4;
      p.z = this.plane.z + backZ + (Math.random() - 0.5) * 1.0;
      const groundAtDrop = this.map.getFloorBelowY(p.x, p.y, p.z);
      p.jumpAltitude = Math.max(15, p.y - groundAtDrop);
      p.fallPeakY = p.y;
      p.vy = -PARACHUTE_CONFIG.freefallInitialSpeed;
      this.io.emit('player_jumped', {
        playerId: p.id,
        state: 'skydiving',
        jumpAltitude: p.jumpAltitude
      });
    } else if (p.state === 'skydiving' && clearance >= PARACHUTE_CONFIG.minClearanceToOpen) {
      p.state = 'parachuting';
      p.fallPeakY = p.y;
      p.vy = -computeTargetDescentSpeed(p.jumpAltitude, 'parachuting', p.pitch);
      this.io.emit('player_jumped', { playerId: p.id, state: 'parachuting' });
    } else if (p.state === 'ground' && clearance >= PARACHUTE_CONFIG.minClearanceToOpen) {
      p.jumpAltitude = Math.max(PARACHUTE_CONFIG.minJumpHeightRef, clearance);
      p.state = 'parachuting';
      p.isSliding = false;
      p.isCrouching = false;
      p.onGround = false;
      p.fallPeakY = p.y;
      p.vy = -computeTargetDescentSpeed(p.jumpAltitude, 'parachuting', p.pitch);
      this.io.emit('player_jumped', { playerId: p.id, state: 'parachuting' });
    }
  }

  handlePlayerSlide(socketId, payload = {}) {
    if (this.phase !== 'playing') return;
    const p = this.players.get(socketId);
    if (!p || !p.alive || p.state !== 'ground') return;
    p.isSliding = Boolean(payload.active);
    if (p.isSliding) {
      p.isCrouching = false;
      this.io.emit('player_slid', { playerId: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw });
    }
  }

  getParticipantHeight(p) {
    if (p.isSliding) return PLAYER_SLIDE_HEIGHT;
    if (p.isCrouching) return PLAYER_CROUCH_HEIGHT;
    return PLAYER_HEIGHT;
  }

  getParticipantEyeHeight(p) {
    if (p.isSliding) return PLAYER_SLIDE_EYE_HEIGHT;
    if (p.isCrouching) return PLAYER_CROUCH_EYE_HEIGHT;
    return PLAYER_EYE_HEIGHT;
  }

  handlePlayerInput(socketId, data) {
    if (this.phase !== 'playing') return;
    const p = this.players.get(socketId);
    if (!p || !p.alive || p.isBot) return;

    if (typeof data.yaw === 'number' && Number.isFinite(data.yaw)) p.yaw = data.yaw;
    if (typeof data.pitch === 'number' && Number.isFinite(data.pitch)) {
      p.pitch = Math.max(-1.45, Math.min(1.45, data.pitch));
    }
    if (p.state === 'plane') return;

    if (typeof data.animWalk === 'number' && Number.isFinite(data.animWalk)) p.animWalk = data.animWalk;
    if (typeof data.moveMode === 'string') p.moveMode = data.moveMode;
    if (typeof data.isSliding === 'boolean') p.isSliding = p.state === 'ground' ? data.isSliding : false;
    if (typeof data.isCrouching === 'boolean') p.isCrouching = p.state === 'ground' && !p.isSliding ? data.isCrouching : false;

    // Si corre rápido (sprint), derrapa o salta, cancelar curación canalizada de 2.0s
    if (p.healingUntil > 0 && (p.moveMode === 'sprint' || p.isSliding || data.onGround === false)) {
      this.cancelHealForPlayer(p);
    }

    if ((p.state === 'skydiving' || p.state === 'ground') && data.state === 'parachuting') {
      p.state = 'parachuting';
      p.isSliding = false;
      p.isCrouching = false;
      p.fallPeakY = p.y;
    }

    if (typeof data.x === 'number' && typeof data.y === 'number' && typeof data.z === 'number') {
      if (!Number.isFinite(data.x) || !Number.isFinite(data.y) || !Number.isFinite(data.z)) return;

      const limit = WORLD_HALF - 2.2;
      const clampedX = Math.max(-limit, Math.min(limit, data.x));
      const clampedZ = Math.max(-limit, Math.min(limit, data.z));
      const clampedY = Math.max(0.4, Math.min(280, data.y));

      const horizDist = Math.hypot(clampedX - p.x, clampedZ - p.z);
      const isVaulting = p.moveMode === 'vault' || Boolean(data.isVaulting);
      if (horizDist < 16.0) {
        const effHeight = this.getParticipantHeight(p);
        if (isVaulting && horizDist < 4.5) {
          p.x = clampedX;
          p.z = clampedZ;
        } else {
          const slid = resolveSlidingHorizontal(this.map, clampedX, clampedY, clampedZ, PLAYER_RADIUS, effHeight);
          p.x = slid.x;
          p.z = slid.z;
        }
        const minTerrainY = this.map.getTerrainHeightAt
          ? this.map.getTerrainHeightAt(p.x, p.z)
          : this.map.getGroundHeightAt(p.x, p.z, clampedY);
        p.y = Math.max(minTerrainY, clampedY);
      }

      const floorY = this.map.getFloorBelowY(p.x, p.y + 0.5, p.z);
      const nearFloor = p.y - floorY <= 0.25;

      if (p.state === 'skydiving' || p.state === 'parachuting') {
        if (p.state === 'skydiving' && p.y - floorY <= PARACHUTE_CONFIG.autoDeployHeight) {
          p.state = 'parachuting';
          p.fallPeakY = p.y;
        }

        const wasUnprotectedSkydive = p.state === 'skydiving';
        if (wasUnprotectedSkydive) p.fallPeakY = Math.max(p.fallPeakY, p.y);
        else p.fallPeakY = p.y;

        if (nearFloor || (data.state === 'ground' && p.y - floorY <= 2.8)) {
          const landingY = floorY;
          const fallDist = p.fallPeakY - landingY;
          p.y = landingY;
          p.state = 'ground';
          p.onGround = true;
          p.vy = 0;
          p.fallPeakY = landingY;

          if (wasUnprotectedSkydive) {
            const fallDmg = computeFallDamage(fallDist);
            if (fallDmg > 0) this.damagePlayer(p, fallDmg, null, 'fall', false);
          }
        }
      } else if (p.state === 'ground') {
        const clientAirborne = data.onGround === false || !nearFloor;
        if (clientAirborne && !nearFloor) {
          p.fallPeakY = p.onGround ? p.y : Math.max(p.fallPeakY, p.y);
          p.onGround = false;
        } else {
          if (!p.onGround) {
            const fallDist = p.fallPeakY - floorY;
            const inDeepWater = this.map.isInWater(p.x, floorY, p.z) && WATER_LEVEL - floorY > 1.0;
            const fallDmg = computeFallDamage(inDeepWater ? fallDist * 0.4 : fallDist);
            if (fallDmg > 0) this.damagePlayer(p, fallDmg, null, 'fall', false);
          }
          p.onGround = true;
          p.fallPeakY = p.y;
        }
      }
    }
  }

  handleSwitchWeapon(socketId, weaponId) {
    const p = this.players.get(socketId);
    if (!p || !p.alive) return;
    if (p.weapons[weaponId] && p.weapons[weaponId].unlocked) {
      p.equipped = weaponId;
      p.reloadingUntil = 0;
      p.reloadWeapon = null;
    }
  }

  handleReload(socketId) {
    const p = this.players.get(socketId);
    if (!p || !p.alive || p.state !== 'ground') return;
    this.startReloadForPlayer(p);
  }

  startReloadForPlayer(p) {
    const wSpec = WEAPONS[p.equipped];
    const wState = p.weapons[p.equipped];
    if (!wSpec || !wState || wSpec.magSize === 0) return false;
    if (p.reloadingUntil > Date.now()) return false;
    if (wState.mag >= wSpec.magSize || p.reserveAmmo <= 0) return false;

    p.reloadingUntil = Date.now() + wSpec.reloadMs;
    p.reloadWeapon = p.equipped;
    return true;
  }

  cancelHealForPlayer(p) {
    if (!p || p.healingUntil <= 0) return;
    p.healingUntil = 0;
    p.healingItem = null;
    if (!p.isBot) {
      this.io.to(p.id).emit('heal_cancelled', { playerId: p.id });
    }
  }

  handleCancelHeal(socketId) {
    const p = this.players.get(socketId);
    if (p) this.cancelHealForPlayer(p);
  }

  handleHeal(socketId, preferredItem = 'medkit') {
    const p = this.players.get(socketId);
    if (!p || !p.alive || p.state !== 'ground' || p.hp >= p.maxHp) return;
    const now = Date.now();
    if (p.healingUntil > now) return;

    let chosen = null;
    if (preferredItem === 'bandage') {
      if (p.bandages > 0) chosen = 'bandage';
      else if (p.medkits > 0) chosen = 'medkit';
    } else {
      if (p.medkits > 0) chosen = 'medkit';
      else if (p.bandages > 0) chosen = 'bandage';
    }
    if (!chosen) return;

    p.isSliding = false;
    p.reloadingUntil = 0;
    p.reloadWeapon = null;
    p.healingItem = chosen;
    p.healingUntil = now + (HEAL_CONFIG.durationMs || 2000);

    this.io.to(socketId).emit('heal_started', {
      playerId: p.id,
      itemType: chosen,
      durationMs: HEAL_CONFIG.durationMs || 2000
    });
  }

  canPlayerReachLoot(p, item, manual = false) {
    const spec = LOOT_TYPES[item.type] || LOOT_TYPES.ammo;
    const pickupR = manual ? 3.6 : (spec.pickupRadius || 1.7);
    const horiz = Math.hypot(item.x - p.x, item.z - p.z);
    if (horiz > pickupR) return false;

    const effH = this.getParticipantHeight(p);
    if (item.y < p.y - 0.85 || item.y > p.y + effH + 0.55) return false;

    if (manual) return true;
    const chest = { x: p.x, y: p.y + 0.95, z: p.z };
    const lootPt = { x: item.x, y: item.y + 0.16, z: item.z };
    return hasLineOfSight(this.map, chest, lootPt, 0.22);
  }

  handlePickup(socketId, lootId) {
    const p = this.players.get(socketId);
    if (!p || !p.alive || p.state !== 'ground') return;
    const item = this.loot.get(lootId);
    if (!item) return;

    if (this.canPlayerReachLoot(p, item, true)) {
      this.applyLootToPlayer(p, item);
    }
  }

  handleInteractDoor(socketId, doorId) {
    if (this.phase !== 'playing') return;
    const p = this.players.get(socketId);
    if (!p || !p.alive || p.state !== 'ground') return;
    const door = this.doorsById.get(doorId);
    if (!door || door.destroyed) return;
    if (Math.hypot(door.x - p.x, door.z - p.z) > 3.8 || Math.abs(door.y - p.y) > 2.4) return;

    door.isOpen = !door.isOpen;
    if (door.collider) door.collider.enabled = !door.isOpen;
    this.io.emit('door_state_changed', {
      doorId: door.id,
      isOpen: door.isOpen,
      hp: door.hp,
      destroyed: false,
      x: door.x,
      y: door.y,
      z: door.z
    });
  }

  handleBreakWindow(socketId, windowId) {
    if (this.phase !== 'playing') return;
    const p = this.players.get(socketId);
    if (!p || !p.alive) return;
    const win = this.windowsById.get(windowId);
    if (!win || win.broken) return;
    if (Math.hypot(win.x - p.x, win.z - p.z) > 4.2) return;
    this.shatterWindow(win);
  }

  shatterWindow(win) {
    if (!win || win.broken) return;
    win.broken = true;
    if (win.collider) win.collider.enabled = false;
    this.io.emit('window_broken', {
      windowId: win.id,
      x: win.x,
      y: win.y + win.height * 0.5,
      z: win.z
    });
  }

  damageDoor(door, amount) {
    if (!door || door.destroyed) return;
    door.hp = Math.max(0, door.hp - amount);
    if (door.hp <= 0) {
      door.destroyed = true;
      door.isOpen = true;
      if (door.collider) door.collider.enabled = false;
    }
    this.io.emit('door_state_changed', {
      doorId: door.id,
      isOpen: door.isOpen,
      hp: door.hp,
      destroyed: door.destroyed,
      x: door.x,
      y: door.y + door.height * 0.5,
      z: door.z
    });
  }

  applyLootToPlayer(p, item) {
    const wSpec = WEAPONS[item.type];
    if (wSpec && item.type !== 'fists') {
      const slotState = p.weapons[item.type];
      const wasUnlocked = slotState.unlocked;
      slotState.unlocked = true;
      if (!wasUnlocked) {
        slotState.mag = wSpec.magSize;
        p.reserveAmmo += wSpec.startAmmo || 30;
      } else {
        p.reserveAmmo += Math.round((wSpec.startAmmo || 24) * 0.75);
      }
      if (p.equipped === 'fists' || (p.isBot && wSpec.slot > (WEAPONS[p.equipped]?.slot || 0))) {
        p.equipped = item.type;
      }
    } else if (item.type === 'ammo') {
      p.reserveAmmo += LOOT_TYPES.ammo.amount;
    } else if (item.type === 'medkit') {
      if (p.medkits < 3) {
        p.medkits += 1;
      } else {
        return false;
      }
    } else if (item.type === 'bandage') {
      if (p.bandages < 5) {
        p.bandages += 1;
      } else {
        return false;
      }
    }

    this.loot.delete(item.id);
    this.io.emit('loot_picked', {
      lootId: item.id,
      type: item.type,
      playerId: p.id,
      hp: p.hp,
      medkits: p.medkits,
      bandages: p.bandages,
      equipped: p.equipped,
      weapons: p.weapons,
      reserveAmmo: p.reserveAmmo
    });
    return true;
  }

  handleShoot(socketId, payload) {
    if (this.phase !== 'playing') return;
    const shooter = this.players.get(socketId);
    if (!shooter || !shooter.alive || shooter.state !== 'ground') return;
    if (!payload || !payload.origin || !payload.dir) return;

    if (shooter.healingUntil > 0) {
      this.cancelHealForPlayer(shooter);
    }
    this.executeAuthoritativeShot(shooter, payload.origin, payload.dir, shooter.equipped, 1.0);
  }

  executeAuthoritativeShot(shooter, rawOrigin, rawDir, weaponId, damageMult = 1.0) {
    const now = Date.now();
    const wSpec = WEAPONS[weaponId];
    const wState = shooter.weapons[weaponId];
    if (!wSpec || !wState || !wState.unlocked) return;
    if (shooter.reloadingUntil > now) return;
    if (now - shooter.lastShotAt < wSpec.fireRateMs * 0.82) return;

    if (wSpec.magSize > 0) {
      if (wState.mag <= 0) {
        this.startReloadForPlayer(shooter);
        return;
      }
      wState.mag -= 1;
    }
    shooter.lastShotAt = now;

    const eyeH = this.getParticipantEyeHeight(shooter);
    const expectedOrigin = { x: shooter.x, y: shooter.y + eyeH, z: shooter.z };
    const originDist = Math.hypot(
      (rawOrigin.x ?? expectedOrigin.x) - expectedOrigin.x,
      (rawOrigin.y ?? expectedOrigin.y) - expectedOrigin.y,
      (rawOrigin.z ?? expectedOrigin.z) - expectedOrigin.z
    );

    let origin = expectedOrigin;
    if (originDist <= 2.1 && hasLineOfSight(this.map, expectedOrigin, rawOrigin, 0.04)) {
      origin = rawOrigin;
    }

    const baseLen = Math.hypot(rawDir.x || 0, rawDir.y || 0, rawDir.z || 0) || 1;
    const baseDir = {
      x: (rawDir.x || 0) / baseLen,
      y: (rawDir.y || 0) / baseLen,
      z: (rawDir.z || 0) / baseLen
    };

    if (weaponId !== 'fists') {
      for (const animal of this.wildlife.values()) {
        if (!animal.alive || animal.species !== 'capybara') continue;
        if (Math.hypot(animal.x - shooter.x, animal.z - shooter.z) < 16) {
          animal.aiState = 'fleeing';
          animal.pose = 'run';
          animal.fleeFromX = shooter.x;
          animal.fleeFromZ = shooter.z;
          animal.fleeUntil = now + 7000;
        }
      }
      for (const other of this.players.values()) {
        if (other.isBot && other.alive && other.id !== shooter.id && other.state === 'ground') {
          if (Math.hypot(other.x - shooter.x, other.z - shooter.z) < 42) {
            other.lastAlertedById = shooter.id;
            other.alertedUntil = now + 4500;
          }
        }
      }
    }

    const pelletCount = wSpec.pellets || 1;
    const playerDamageMap = new Map();
    const animalDamageMap = new Map();
    const tracerEnds = [];
    let anyEntityHit = false;

    for (let pIdx = 0; pIdx < pelletCount; pIdx++) {
      let dir = baseDir;
      if (pelletCount > 1) {
        const cone = wSpec.spread;
        const px = baseDir.x + (Math.random() - 0.5) * cone * 1.8;
        const py = baseDir.y + (Math.random() - 0.5) * cone * 1.4;
        const pz = baseDir.z + (Math.random() - 0.5) * cone * 1.8;
        const plen = Math.hypot(px, py, pz) || 1;
        dir = { x: px / plen, y: py / plen, z: pz / plen };
      }

      const worldHit = raycastVoxels(this.map, origin, dir, wSpec.range);
      let bestDist = worldHit.dist;
      let endPoint = worldHit.point;
      let hitTarget = null;
      let hitAnimal = null;
      let isHeadshot = false;

      for (const target of this.players.values()) {
        if (target.id === shooter.id || !target.alive || target.state === 'plane' || target.spectating) continue;
        const hit = this.intersectRayPlayer(origin, dir, target, bestDist);
        if (hit && hit.dist < bestDist) {
          bestDist = hit.dist;
          endPoint = hit.point;
          hitTarget = target;
          hitAnimal = null;
          isHeadshot = hit.isHeadshot;
        }
      }

      for (const animal of this.wildlife.values()) {
        if (!animal.alive) continue;
        const hit = this.intersectRayCylinder(
          origin,
          dir,
          animal.x,
          animal.y,
          animal.z,
          animal.radius + 0.14,
          animal.height + 0.12,
          bestDist
        );
        if (hit && hit.dist < bestDist) {
          bestDist = hit.dist;
          endPoint = hit.point;
          hitAnimal = animal;
          hitTarget = null;
          isHeadshot = false;
        }
      }

      if (pIdx < 5) tracerEnds.push(endPoint);

      if (hitTarget) {
        anyEntityHit = true;
        const pelletDmg = wSpec.damage * (isHeadshot ? wSpec.headshotMult : 1) * damageMult;
        const prev = playerDamageMap.get(hitTarget) || { dmg: 0, isHeadshot: false, hitPoint: endPoint };
        prev.dmg += pelletDmg;
        prev.isHeadshot = prev.isHeadshot || isHeadshot;
        prev.hitPoint = endPoint;
        playerDamageMap.set(hitTarget, prev);
      } else if (hitAnimal) {
        anyEntityHit = true;
        const pelletDmg = wSpec.damage * damageMult;
        const prev = animalDamageMap.get(hitAnimal) || { dmg: 0, hitPoint: endPoint };
        prev.dmg += pelletDmg;
        prev.hitPoint = endPoint;
        animalDamageMap.set(hitAnimal, prev);
      } else if (worldHit.hit && worldHit.collider) {
        if (worldHit.collider.tag === 'door' && worldHit.collider.meta?.doorId) {
          const door = this.doorsById.get(worldHit.collider.meta.doorId);
          if (door && !door.destroyed) {
            this.damageDoor(door, Math.max(8, Math.round(wSpec.damage * damageMult)));
          }
        } else if (worldHit.collider.tag === 'window' && worldHit.collider.meta?.windowId) {
          const win = this.windowsById.get(worldHit.collider.meta.windowId);
          if (win && !win.broken) {
            this.shatterWindow(win);
          }
        }
      }
    }

    this.io.emit('shot_fired', {
      shooterId: shooter.id,
      weapon: weaponId,
      origin,
      endPoint: tracerEnds[0] || origin,
      extraEnds: tracerEnds.slice(1),
      hitPlayer: anyEntityHit,
      mag: wState.mag,
      reserveAmmo: shooter.reserveAmmo
    });

    for (const [target, info] of playerDamageMap.entries()) {
      if (target.isBot) {
        target.lastAlertedById = shooter.id;
        target.alertedUntil = now + 6000;
      }
      this.damagePlayer(target, Math.max(1, Math.round(info.dmg)), shooter, weaponId, info.isHeadshot, info.hitPoint);
    }

    for (const [animal, info] of animalDamageMap.entries()) {
      this.damageWildlife(animal, Math.max(1, Math.round(info.dmg)), shooter, info.hitPoint);
    }

    if (wSpec.magSize > 0 && wState.mag === 0 && shooter.reserveAmmo > 0) {
      this.startReloadForPlayer(shooter);
    }
  }

  intersectRayCylinder(origin, dir, cx, cy, cz, hitRadius, height, maxDist) {
    const ox = origin.x - cx;
    const oz = origin.z - cz;
    const a = dir.x * dir.x + dir.z * dir.z;

    let tEnter = 0.1;
    let tExit = maxDist;

    if (a < 1e-8) {
      if (ox * ox + oz * oz > hitRadius * hitRadius) return null;
    } else {
      const b = 2 * (ox * dir.x + oz * dir.z);
      const c = ox * ox + oz * oz - hitRadius * hitRadius;
      const disc = b * b - 4 * a * c;
      if (disc < 0) return null;

      const sqrtDisc = Math.sqrt(disc);
      const t1 = (-b - sqrtDisc) / (2 * a);
      const t2 = (-b + sqrtDisc) / (2 * a);
      if (t2 < 0.1 || t1 > maxDist) return null;
      tEnter = Math.max(0.1, t1);
      tExit = Math.min(maxDist, t2);
    }

    if (Math.abs(dir.y) < 1e-8) {
      if (origin.y < cy - 0.08 || origin.y > cy + height + 0.08) return null;
    } else {
      let ty1 = (cy - 0.08 - origin.y) / dir.y;
      let ty2 = (cy + height + 0.08 - origin.y) / dir.y;
      if (ty1 > ty2) { const tmp = ty1; ty1 = ty2; ty2 = tmp; }
      tEnter = Math.max(tEnter, ty1);
      tExit = Math.min(tExit, ty2);
      if (tEnter > tExit) return null;
    }

    if (tEnter < 0.1 || tEnter > maxDist) return null;

    return {
      dist: tEnter,
      point: {
        x: origin.x + dir.x * tEnter,
        y: origin.y + dir.y * tEnter,
        z: origin.z + dir.z * tEnter
      }
    };
  }

  intersectRayPlayer(origin, dir, target, maxDist) {
    const effHeight = this.getParticipantHeight(target);
    const hit = this.intersectRayCylinder(
      origin,
      dir,
      target.x,
      target.y,
      target.z,
      PLAYER_RADIUS + 0.15,
      effHeight,
      maxDist
    );
    if (!hit) return null;
    const headThreshold = target.y + effHeight * 0.74;
    return {
      ...hit,
      isHeadshot: hit.point.y >= headThreshold
    };
  }

  damageWildlife(animal, amount, attacker, hitPoint) {
    if (!animal.alive || this.phase !== 'playing') return;
    const now = Date.now();
    const spec = WILDLIFE_TYPES[animal.species];
    animal.hp = Math.max(0, animal.hp - amount);

    this.io.emit('wildlife_hit', {
      animalId: animal.id,
      species: animal.species,
      speciesName: spec?.name || animal.species,
      attackerId: attacker ? attacker.id : null,
      damage: amount,
      hp: animal.hp,
      maxHp: animal.maxHp,
      hitPoint
    });

    if (animal.hp <= 0) {
      animal.alive = false;
      const drops = spec?.lootDrop || ['medkit', 'ammo'];
      this.spawnDroppedLootList(drops, animal.x, animal.y, animal.z);
      this.io.emit('wildlife_killed', {
        animalId: animal.id,
        species: animal.species,
        speciesName: spec?.name || animal.species,
        killerId: attacker ? attacker.id : null,
        killerName: attacker ? attacker.name : 'Desconocido'
      });
      return;
    }

    if (spec?.behavior === 'predator' && attacker) {
      const wasHostile = animal.aiState === 'hostile';
      animal.aiState = 'hostile';
      animal.pose = 'run';
      animal.targetId = attacker.id;
      animal.hostileUntil = now + 18000;
      if (!wasHostile) {
        this.io.emit('wildlife_aggro', {
          animalId: animal.id,
          species: animal.species,
          speciesName: spec.name,
          targetId: attacker.id,
          x: animal.x,
          y: animal.y,
          z: animal.z
        });
      }
    } else if (spec?.behavior === 'timid' && attacker) {
      animal.aiState = 'fleeing';
      animal.pose = 'run';
      animal.fleeFromX = attacker.x;
      animal.fleeFromZ = attacker.z;
      animal.fleeUntil = now + 8000;
    } else if (spec?.behavior === 'aerial') {
      animal.orbitRadius = Math.min(165, animal.orbitRadius + 20);
    }
  }

  damagePlayer(victim, amount, attacker, sourceName, isHeadshot = false, hitPoint = null) {
    if (!victim.alive || this.phase !== 'playing' || amount <= 0) return;

    victim.hp = Math.max(0, victim.hp - amount);

    this.io.emit('player_damaged', {
      targetId: victim.id,
      targetName: victim.name,
      attackerId: attacker ? attacker.id : null,
      damage: amount,
      hp: victim.hp,
      maxHp: victim.maxHp,
      isHeadshot,
      source: sourceName,
      hitPoint: hitPoint || { x: victim.x, y: victim.y + 1.1, z: victim.z }
    });

    if (victim.hp <= 0) {
      const aliveBefore = this.getAliveCount();
      victim.alive = false;
      victim.isSliding = false;
      victim.isCrouching = false;
      victim.healingUntil = 0;
      victim.healingItem = null;
      victim.state = 'dead';
      victim.placement = aliveBefore;

      if (attacker && attacker.id && attacker.id !== victim.id && this.players.has(attacker.id)) {
        attacker.kills += 1;
      }

      const bestDrop =
        ['sniper', 'rifle', 'shotgun', 'smg', 'pistol'].find((w) => victim.weapons[w]?.unlocked) || 'ammo';
      this.spawnDroppedLootPair(bestDrop, 'medkit', victim.x, victim.y, victim.z);

      let killerLabel = attacker ? attacker.name : 'La Tormenta';
      if (sourceName === 'bear') killerLabel = 'Oso de Anteojos';
      else if (sourceName === 'jaguar') killerLabel = 'Jaguar Colombiano';
      else if (sourceName === 'fall') killerLabel = 'Caída de Altura';

      this.io.emit('player_eliminated', {
        victimId: victim.id,
        victimName: victim.name,
        killerId: attacker ? attacker.id : null,
        killerName: killerLabel,
        reason: sourceName
      });

      this.checkWinCondition();
    }
  }

  getAliveCount() {
    let count = 0;
    for (const p of this.players.values()) {
      if (p.alive && !p.spectating) count++;
    }
    return count;
  }

  checkWinCondition() {
    if (this.phase !== 'playing') return;

    const aliveList = Array.from(this.players.values()).filter((p) => p.alive && !p.spectating);
    if (aliveList.length <= 1) {
      this.phase = 'ended';
      const winner = aliveList[0] || null;
      if (winner) winner.placement = 1;

      const ranking = Array.from(this.players.values())
        .filter((p) => !p.spectating)
        .map((p) => ({
          id: p.id,
          name: p.name,
          isBot: p.isBot,
          kills: p.kills,
          placement: p.alive ? 1 : p.placement || 99
        }))
        .sort((a, b) => a.placement - b.placement || b.kills - a.kills);

      this.io.emit('game_over', {
        winnerId: winner ? winner.id : null,
        winnerName: winner ? winner.name : 'Nadie',
        winnerKills: winner ? winner.kills : 0,
        ranking
      });
    }
  }

  tick() {
    const now = Date.now();

    if (this.phase === 'lobby') {
      if (this.lobbyCountdown !== null) {
        const prevCeil = Math.ceil(this.lobbyCountdown);
        this.lobbyCountdown -= TICK_DT;
        if (this.lobbyCountdown <= 0) {
          this.startGame({ autoFillBots: false });
          return;
        } else if (Math.ceil(this.lobbyCountdown) !== prevCeil) {
          this.broadcastLobbyState();
        }
      }
      return;
    }

    if (this.phase !== 'playing') return;

    if (this.plane && this.plane.active) {
      this.plane.elapsed += TICK_DT;
      this.plane.x += this.plane.vx * TICK_DT;
      this.plane.z += this.plane.vz * TICK_DT;

      for (const p of this.players.values()) {
        if (p.alive && p.state === 'plane') {
          p.x = this.plane.x;
          p.y = this.plane.y;
          p.z = this.plane.z;
          p.fallPeakY = this.plane.y;
        }
      }

      if (this.plane.elapsed >= this.plane.maxDuration) {
        for (const p of this.players.values()) {
          if (p.alive && p.state === 'plane') {
            this.handlePlayerJump(p.id);
          }
        }
        this.plane.active = false;
      }
    }

    const allParticipants = Array.from(this.players.values());

    for (const p of allParticipants) {
      if (!p.alive || p.spectating) continue;

      if (p.healingUntil > 0 && now >= p.healingUntil) {
        const itemType = p.healingItem;
        p.healingUntil = 0;
        p.healingItem = null;
        if (itemType === 'bandage' && p.bandages > 0 && p.hp < p.maxHp) {
          p.bandages -= 1;
          p.hp = Math.min(p.maxHp, p.hp + LOOT_TYPES.bandage.heal);
          if (!p.isBot) {
            this.io.to(p.id).emit('player_healed', { hp: p.hp, medkits: p.medkits, bandages: p.bandages, itemType: 'bandage' });
          }
        } else if (itemType === 'medkit' && p.medkits > 0 && p.hp < p.maxHp) {
          p.medkits -= 1;
          p.hp = Math.min(p.maxHp, p.hp + LOOT_TYPES.medkit.heal);
          if (!p.isBot) {
            this.io.to(p.id).emit('player_healed', { hp: p.hp, medkits: p.medkits, bandages: p.bandages, itemType: 'medkit' });
          }
        }
      }

      if (p.reloadingUntil > 0 && now >= p.reloadingUntil) {
        const wSpec = WEAPONS[p.reloadWeapon];
        const wState = p.weapons[p.reloadWeapon];
        if (wSpec && wState && p.reserveAmmo > 0) {
          const needed = wSpec.magSize - wState.mag;
          const take = Math.min(needed, p.reserveAmmo);
          wState.mag += take;
          p.reserveAmmo -= take;
        }
        p.reloadingUntil = 0;
        p.reloadWeapon = null;
        if (!p.isBot) {
          this.io.to(p.id).emit('reload_complete', {
            weapon: p.equipped,
            weapons: p.weapons,
            reserveAmmo: p.reserveAmmo
          });
        }
      }

      if (p.state === 'ground') {
        for (const item of this.loot.values()) {
          const spec = LOOT_TYPES[item.type] || LOOT_TYPES.ammo;
          // Auto-recolección de munición y consumibles al pasar cerca (y armas para Bots o si el jugador solo lleva machete)
          const shouldAuto = Boolean(spec.autoPickup) || p.isBot || p.equipped === 'fists';
          if (shouldAuto && this.canPlayerReachLoot(p, item, false)) {
            this.applyLootToPlayer(p, item);
          }
        }
      }

    if (p.isBot) {
      this.updateBot(p, TICK_DT, now, allParticipants);
    } else if (p.state === 'ground') {
        applyEntitySeparation(p, allParticipants, PLAYER_RADIUS, TICK_DT, this.map);
      }

      if (p.state !== 'plane') {
        const minGround = this.map.getTerrainHeightAt
          ? this.map.getTerrainHeightAt(p.x, p.z)
          : this.map.getGroundHeightAt(p.x, p.z, p.y);
        if (p.y < minGround) {
          p.y = minGround;
          if (p.vy < 0) p.vy = 0;
          p.onGround = true;
        }
      }
    }

    this.updateWildlife(TICK_DT, now);
    this.updateStorm(TICK_DT);

    this.io.emit('world_tick', {
      players: this.serializePlayers(),
      wildlife: this.serializeWildlife(),
      plane: this.plane,
      storm: {
        centerX: Number(this.storm.centerX.toFixed(1)),
        centerZ: Number(this.storm.centerZ.toFixed(1)),
        radius: Number(this.storm.radius.toFixed(2)),
        targetRadius: this.storm.targetRadius,
        state: this.storm.state,
        timer: Math.ceil(this.storm.timer),
        phaseIndex: Math.min(STORM_PHASES.length, this.storm.phaseIndex + 1),
        dps: this.storm.dps
      },
      aliveCount: this.getAliveCount()
    });
  }

  steerWithWhiskers(entity, desiredYaw, lookDist = 3.4, radius = PLAYER_RADIUS) {
    const front = senseObstacleAhead(this.map, entity.x, entity.y, entity.z, desiredYaw, lookDist, radius);
    if (!front.blocked) return { yaw: desiredYaw, shouldJump: false };

    const leftAngle = desiredYaw + 0.7;
    const rightAngle = desiredYaw - 0.7;
    const left = senseObstacleAhead(this.map, entity.x, entity.y, entity.z, leftAngle, lookDist, radius);
    const right = senseObstacleAhead(this.map, entity.x, entity.y, entity.z, rightAngle, lookDist, radius);

    const shouldJump = front.reason === 'steep' && front.dist < 1.8;

    if (!left.blocked && right.blocked) return { yaw: leftAngle, shouldJump };
    if (!right.blocked && left.blocked) return { yaw: rightAngle, shouldJump };
    if (!left.blocked && !right.blocked) {
      return { yaw: left.dist >= right.dist ? leftAngle : rightAngle, shouldJump };
    }
    return { yaw: left.dist >= right.dist ? desiredYaw + 1.45 : desiredYaw - 1.45, shouldJump };
  }

  resolveRiverCrossingWaypoint(x, z, goalX, goalZ) {
    const curRiverX = getRiverCenterWorldX(z);
    const goalRiverX = getRiverCenterWorldX(goalZ);
    const botSide = x - curRiverX;
    const goalSide = goalX - goalRiverX;

    for (const c of this.map.riverCrossings) {
      if (Math.hypot(x - c.x, z - c.z) < 27 && Math.abs(z - c.z) < 4.5) {
        return { x: goalX, z: goalZ };
      }
    }

    if (botSide * goalSide < 0 && Math.abs(botSide) > 6) {
      let bestCross = null;
      let bestScore = Infinity;
      for (const c of this.map.riverCrossings) {
        const score = Math.hypot(c.x - x, c.z - z) + Math.hypot(goalX - c.x, goalZ - c.z) * 0.6;
        if (score < bestScore) {
          bestScore = score;
          bestCross = c;
        }
      }
      if (bestCross) {
        const targetSideOffset = botSide < 0 ? 26 : -26;
        return { x: bestCross.x + targetSideOffset, z: bestCross.z };
      }
    }
    return { x: goalX, z: goalZ };
  }

  canBotSeeTarget(bot, other, maxRange, now) {
    const dx = other.x - bot.x;
    const dz = other.z - bot.z;
    const horizDist = Math.hypot(dx, dz);

    let effectiveRange = maxRange;
    if ((other.isCrouching || other.isSliding) && this.map.isConcealedInBush(other.x, other.z)) {
      effectiveRange = Math.min(maxRange, 14);
    }
    if (horizDist > effectiveRange) return false;

    const isAlertedByTarget = bot.lastAlertedById === other.id && now < bot.alertedUntil;
    if (!isAlertedByTarget && horizDist > 6.5) {
      const fwdX = Math.sin(bot.yaw);
      const fwdZ = Math.cos(bot.yaw);
      const cosAng = (dx * fwdX + dz * fwdZ) / (horizDist || 1);
      if (cosAng < -0.3) return false;
    }

    const botEye = { x: bot.x, y: bot.y + PLAYER_EYE_HEIGHT, z: bot.z };
    const targetChestY = other.y + this.getParticipantHeight(other) * 0.62;
    const targetHeadY = other.y + this.getParticipantHeight(other) * 0.88;

    return (
      hasLineOfSight(this.map, botEye, { x: other.x, y: targetChestY, z: other.z }, 0.1) ||
      hasLineOfSight(this.map, botEye, { x: other.x, y: targetHeadY, z: other.z }, 0.1)
    );
  }

  updateBot(bot, dt, now, allParticipants) {
    const ai = bot.ai;
    if (!ai) return;
    const diffCfg = BOT_DIFFICULTIES[this.botDifficulty] || BOT_DIFFICULTIES.easy;

    if (bot.state === 'plane') {
      if (this.plane && this.plane.elapsed >= ai.jumpDelay) {
        this.handlePlayerJump(bot.id);
        const poi = this.map.landmarks[Math.floor(Math.random() * this.map.landmarks.length)];
        ai.targetPoint = {
          x: poi.x + (Math.random() - 0.5) * 60,
          z: poi.z + (Math.random() - 0.5) * 60
        };
      }
      return;
    }

    if (bot.state === 'skydiving' || bot.state === 'parachuting') {
      const tx = ai.targetPoint ? ai.targetPoint.x : 56;
      const tz = ai.targetPoint ? ai.targetPoint.z : 4;
      const dx = tx - bot.x;
      const dz = tz - bot.z;
      const d = Math.hypot(dx, dz) || 1;
      const hSpeed =
        bot.state === 'skydiving'
          ? PARACHUTE_CONFIG.freefallHorizontalSpeed * 0.85
          : PARACHUTE_CONFIG.canopyHorizontalSpeed * 0.85;

      bot.yaw = Math.atan2(dx, dz);
      stepCharacterPhysics(this.map, bot, (dx / d) * hSpeed, (dz / d) * hSpeed, dt, 0);

      const targetDescent = computeTargetDescentSpeed(bot.jumpAltitude || PARACHUTE_CONFIG.planeHeightAboveValley, bot.state, 0);
      const currentDesc = Math.max(0, -bot.vy);
      const accel =
        bot.state === 'parachuting'
          ? PARACHUTE_CONFIG.canopyOpenDecel
          : PARACHUTE_CONFIG.freefallGravityAccel;
      const nextDesc =
        currentDesc < targetDescent
          ? Math.min(targetDescent, currentDesc + accel * dt)
          : Math.max(targetDescent, currentDesc - accel * dt);

      bot.vy = -nextDesc;
      bot.y += bot.vy * dt;
      bot.moveMode = 'fall';

      const supportY = this.map.getFloorBelowY(bot.x, bot.y + 1.2, bot.z);
      if (bot.state === 'skydiving' && bot.y - supportY <= PARACHUTE_CONFIG.autoDeployHeight) {
        bot.state = 'parachuting';
        bot.fallPeakY = bot.y;
      }
      if (bot.y <= supportY + 0.16) {
        bot.y = supportY;
        bot.vy = 0;
        bot.onGround = true;
        bot.state = 'ground';
        bot.fallPeakY = supportY;
        bot.moveMode = 'idle';
        ai.stuckRefX = bot.x;
        ai.stuckRefZ = bot.z;
        ai.stuckTimer = 0;
      }
      return;
    }

    if (bot.healingUntil <= 0 && bot.onGround) {
      // Permitir a los bots abrir puertas cerradas cercanas para entrar o salir de casas
      for (const door of this.doorsById.values()) {
        if (!door.destroyed && !door.isOpen && Math.hypot(door.x - bot.x, door.z - bot.z) < 2.1 && Math.abs(door.y - bot.y) < 1.6) {
          door.isOpen = true;
          if (door.collider) door.collider.enabled = false;
          this.io.emit('door_state_changed', {
            doorId: door.id,
            isOpen: true,
            hp: door.hp,
            destroyed: false,
            x: door.x,
            y: door.y,
            z: door.z
          });
        }
      }
      if (bot.hp < 60 && bot.medkits > 0) {
        bot.healingItem = 'medkit';
        bot.healingUntil = now + (HEAL_CONFIG.durationMs || 2000);
      } else if (bot.hp < 75 && bot.bandages > 0) {
        bot.healingItem = 'bandage';
        bot.healingUntil = now + (HEAL_CONFIG.durationMs || 2000);
      }
    }

    let nearestEnemy = null;
    let nearestEnemyDist = diffCfg.visionRange;
    for (const other of allParticipants) {
      if (other.id === bot.id || !other.alive || other.state === 'plane' || other.spectating) continue;
      const d = Math.hypot(other.x - bot.x, other.z - bot.z);
      if (d < nearestEnemyDist && this.canBotSeeTarget(bot, other, nearestEnemyDist, now)) {
        nearestEnemy = other;
        nearestEnemyDist = d;
      }
    }

    if (nearestEnemy) {
      if (ai.spottedTargetId !== nearestEnemy.id) {
        ai.spottedTargetId = nearestEnemy.id;
        ai.spottedSince = now;
      }
    } else {
      ai.spottedTargetId = null;
    }

    const distToStormCenter = Math.hypot(bot.x - this.storm.centerX, bot.z - this.storm.centerZ);
    const outsideSafe = distToStormCenter > Math.max(14, this.storm.radius * 0.84);

    let desiredGoal = null;
    let moveSpeed = 5.6;

    if (now < ai.evadeUntil) {
      desiredGoal = {
        x: bot.x + Math.sin(ai.evadeYaw) * 12,
        z: bot.z + Math.cos(ai.evadeYaw) * 12
      };
      moveSpeed = 7.8;
    } else if (outsideSafe) {
      desiredGoal = this.resolveRiverCrossingWaypoint(bot.x, bot.z, this.storm.centerX, this.storm.centerZ);
      moveSpeed = 8.0;
    } else if (bot.equipped === 'fists' || bot.hp < 55 || bot.reserveAmmo < 12) {
      let bestLoot = null;
      let bestDist = 85;
      for (const item of this.loot.values()) {
        if (Math.abs(item.y - bot.y) > 4.0) continue; // Priorizar suministros accesibles en su nivel actual
        const isGun = ['pistol', 'shotgun', 'smg', 'rifle', 'sniper'].includes(item.type);
        const wantsWeapon = bot.equipped === 'fists' && isGun;
        const wantsHeal =
          bot.hp < 65 &&
          ((item.type === 'medkit' && bot.medkits < 3) || (item.type === 'bandage' && bot.bandages < 5));
        const wantsAmmo = bot.reserveAmmo < 15 && item.type === 'ammo';
        if (!wantsWeapon && !wantsHeal && !wantsAmmo && nearestEnemy) continue;

        const d = Math.hypot(item.x - bot.x, item.z - bot.z);
        if (d < bestDist) {
          bestDist = d;
          bestLoot = item;
        }
      }
      if (bestLoot) {
        desiredGoal = this.resolveRiverCrossingWaypoint(bot.x, bot.z, bestLoot.x, bestLoot.z);
        moveSpeed = 7.4;
      }
    }

    if (!desiredGoal && nearestEnemy) {
      const desiredRange =
        bot.equipped === 'fists'
          ? 1.8
          : bot.equipped === 'shotgun'
          ? 11
          : bot.equipped === 'sniper'
          ? 48
          : 24;
      if (nearestEnemyDist > desiredRange + 5) {
        desiredGoal = this.resolveRiverCrossingWaypoint(bot.x, bot.z, nearestEnemy.x, nearestEnemy.z);
        moveSpeed = 7.2;
      } else {
        if (now > ai.nextDecisionAt) {
          ai.strafeDir = Math.random() < 0.5 ? -1 : 1;
          ai.nextDecisionAt = now + 950 + Math.random() * 900;
        }
        const dx = nearestEnemy.x - bot.x;
        const dz = nearestEnemy.z - bot.z;
        const len = Math.hypot(dx, dz) || 1;
        desiredGoal = {
          x: bot.x + (-dz / len) * ai.strafeDir * 8,
          z: bot.z + (dx / len) * ai.strafeDir * 8
        };
        moveSpeed = 5.2;
      }
    }

    if (!desiredGoal) {
      if (now > ai.nextDecisionAt) {
        const toCenter = Math.atan2(this.storm.centerX - bot.x, this.storm.centerZ - bot.z);
        ai.wanderAngle = toCenter + (Math.random() - 0.5) * 1.9;
        ai.nextDecisionAt = now + 2200 + Math.random() * 2000;
      }
      desiredGoal = this.resolveRiverCrossingWaypoint(
        bot.x,
        bot.z,
        bot.x + Math.sin(ai.wanderAngle) * 24,
        bot.z + Math.cos(ai.wanderAngle) * 24
      );
      moveSpeed = 5.4;
    }

    const desiredYaw = Math.atan2(desiredGoal.x - bot.x, desiredGoal.z - bot.z);
    const steered = this.steerWithWhiskers(bot, desiredYaw, 3.4, PLAYER_RADIUS);
    const moveYaw = steered.yaw;

    if (steered.shouldJump && bot.onGround) {
      bot.vy = 7.6;
      bot.onGround = false;
      bot.fallPeakY = bot.y;
    }

    if (
      this.botDifficulty === 'hard' &&
      bot.onGround &&
      moveSpeed > 7.0 &&
      now > ai.nextSlideAllowedAt &&
      nearestEnemy &&
      Math.random() < 0.02
    ) {
      ai.slideUntil = now + 850;
      ai.nextSlideAllowedAt = now + 4500;
    }
    bot.isSliding = bot.healingUntil <= now && now < ai.slideUntil && bot.onGround;
    if (bot.isSliding) moveSpeed = 10.5;
    if (bot.healingUntil > now) moveSpeed *= HEAL_CONFIG.moveSpeedMult || 0.45;

    const prevX = bot.x;
    const prevZ = bot.z;
    const wasOnGround = bot.onGround;
    const effH = this.getParticipantHeight(bot);

    stepCharacterPhysics(
      this.map,
      bot,
      Math.sin(moveYaw) * moveSpeed,
      Math.cos(moveYaw) * moveSpeed,
      dt,
      22,
      PLAYER_RADIUS,
      effH
    );
    applyEntitySeparation(bot, allParticipants, PLAYER_RADIUS, dt, this.map);

    if (!bot.onGround) {
      bot.fallPeakY = wasOnGround ? bot.y : Math.max(bot.fallPeakY, bot.y);
    } else if (!wasOnGround) {
      const fallDmg = computeFallDamage(bot.fallPeakY - bot.y);
      bot.fallPeakY = bot.y;
      if (fallDmg > 0) this.damagePlayer(bot, fallDmg, null, 'fall', false);
    } else {
      bot.fallPeakY = bot.y;
    }

    if (nearestEnemy && bot.alive && bot.healingUntil <= now) {
      bot.yaw = Math.atan2(nearestEnemy.x - bot.x, nearestEnemy.z - bot.z);
      const reacted = now - ai.spottedSince >= diffCfg.reactionMs;
      const pauseOver = now >= ai.nextBurstAllowedAt;

      if (reacted && pauseOver && Math.random() < diffCfg.fireChance) {
        const wSpec = WEAPONS[bot.equipped];
        const aimTargetY = nearestEnemy.y + this.getParticipantHeight(nearestEnemy) * 0.62;
        const origin = { x: bot.x, y: bot.y + PLAYER_EYE_HEIGHT, z: bot.z };
        const clearShot = hasLineOfSight(
          this.map,
          origin,
          { x: nearestEnemy.x, y: aimTargetY, z: nearestEnemy.z },
          0.1
        );

        if (wSpec && clearShot && nearestEnemyDist <= wSpec.range * 0.85) {
          const baseJitter = 0.055 * diffCfg.spreadMult;
          const aimDir = {
            x: nearestEnemy.x - origin.x + (Math.random() - 0.5) * baseJitter * nearestEnemyDist,
            y: aimTargetY - origin.y + (Math.random() - 0.5) * baseJitter * nearestEnemyDist,
            z: nearestEnemy.z - origin.z + (Math.random() - 0.5) * baseJitter * nearestEnemyDist
          };
          this.executeAuthoritativeShot(bot, origin, aimDir, bot.equipped, diffCfg.damageMult);

          if (Math.random() < 0.35) {
            ai.nextBurstAllowedAt = now + diffCfg.burstPauseMs;
          }
        }
      }
    } else {
      bot.yaw = normalizeAngle(bot.yaw + normalizeAngle(moveYaw - bot.yaw) * Math.min(1, dt * 10));
    }

    ai.stuckTimer += dt;
    if (ai.stuckTimer >= 1.2) {
      const netAdvance = Math.hypot(bot.x - ai.stuckRefX, bot.z - ai.stuckRefZ);
      if (netAdvance < 0.45) {
        if (bot.onGround) {
          bot.vy = 7.8;
          bot.onGround = false;
          bot.fallPeakY = bot.y;
        }
        const sign = Math.random() < 0.5 ? 1 : -1;
        ai.evadeYaw = normalizeAngle(moveYaw + (0.5 + Math.random() * 0.25) * Math.PI * sign);
        ai.evadeUntil = now + 1200;
        ai.wanderAngle = ai.evadeYaw;
      }
      ai.stuckRefX = bot.x;
      ai.stuckRefZ = bot.z;
      ai.stuckTimer = 0;
    }

    const movedStep = Math.hypot(bot.x - prevX, bot.z - prevZ);
    bot.animWalk = movedStep > 0.01 ? bot.animWalk + dt * (moveSpeed > 6.5 ? 12 : 8.5) : bot.animWalk;
    bot.moveMode = bot.isSliding
      ? 'slide'
      : !bot.onGround
      ? bot.vy > 0.6
        ? 'jump'
        : 'fall'
      : movedStep > 0.01
      ? moveSpeed > 6.5
        ? 'sprint'
        : 'walk'
      : 'idle';
  }

  updateWildlife(dt, now) {
    for (const animal of this.wildlife.values()) {
      if (!animal.alive) continue;
      const spec = WILDLIFE_TYPES[animal.species];
      if (!spec) continue;

      if (spec.behavior === 'aerial') {
        animal.orbitAngle += (spec.walkSpeed / animal.orbitRadius) * dt;
        const nextX = animal.homeX + Math.cos(animal.orbitAngle) * animal.orbitRadius;
        const nextZ = animal.homeZ + Math.sin(animal.orbitAngle * 0.85) * animal.orbitRadius;
        animal.yaw = Math.atan2(nextX - animal.x, nextZ - animal.z);
        animal.x = nextX;
        animal.z = nextZ;
        const minSafeAlt = this.map.getGroundHeightAt(animal.x, animal.z) + 28;
        animal.y = Math.max(minSafeAlt, animal.baseAlt + Math.sin(animal.orbitAngle * 2) * 3.5);
        animal.animPhase += dt * 3.2;
        continue;
      }

      if (animal.aiState === 'hostile') {
        const target = animal.targetId ? this.players.get(animal.targetId) : null;
        if (!target || !target.alive || target.state !== 'ground' || now > animal.hostileUntil) {
          animal.aiState = 'peaceful';
          animal.pose = 'wander';
          animal.targetId = null;
        } else {
          const dx = target.x - animal.x;
          const dz = target.z - animal.z;
          const horizDist = Math.hypot(dx, dz);
          const contactReach = spec.attackRange + PLAYER_RADIUS;

          const animalMouth = { x: animal.x, y: animal.y + animal.height * 0.65, z: animal.z };
          const targetBody = { x: target.x, y: target.y + 0.9, z: target.z };
          const canReachTarget =
            horizDist <= contactReach &&
            Math.abs(target.y - animal.y) <= 1.8 &&
            hasLineOfSight(this.map, animalMouth, targetBody, 0.08);

          if (canReachTarget) {
            animal.yaw = Math.atan2(dx, dz);
            animal.pose = 'attack';
            if (now - animal.lastAttackAt >= spec.attackCooldownMs) {
              animal.lastAttackAt = now;
              this.io.emit('wildlife_attack', {
                animalId: animal.id,
                species: animal.species,
                targetId: target.id,
                x: animal.x,
                y: animal.y,
                z: animal.z
              });
              this.damagePlayer(target, spec.attackDamage, null, animal.species, false);
            }
          } else {
            const wp = this.resolveRiverCrossingWaypoint(animal.x, animal.z, target.x, target.z);
            const steered = this.steerWithWhiskers(
              animal,
              Math.atan2(wp.x - animal.x, wp.z - animal.z),
              3.2,
              animal.radius
            );
            animal.yaw = steered.yaw;
            animal.pose = 'run';
            if (steered.shouldJump && animal.onGround) {
              animal.vy = 7.4;
              animal.onGround = false;
            }
            stepCharacterPhysics(
              this.map,
              animal,
              Math.sin(animal.yaw) * spec.runSpeed,
              Math.cos(animal.yaw) * spec.runSpeed,
              dt,
              22,
              animal.radius,
              animal.height
            );
            animal.animPhase += dt * 14;

            animal.stuckTimer += dt;
            if (animal.stuckTimer >= 1.2) {
              if (Math.hypot(animal.x - animal.stuckRefX, animal.z - animal.stuckRefZ) < 0.45 && animal.onGround) {
                animal.vy = 7.4;
                animal.onGround = false;
                animal.yaw += Math.PI * 0.65;
              }
              animal.stuckRefX = animal.x;
              animal.stuckRefZ = animal.z;
              animal.stuckTimer = 0;
            }
          }
          const minG = this.map.getGroundHeightAt(animal.x, animal.z, animal.y);
          if (animal.y < minG) animal.y = minG;
          continue;
        }
      }

      if (animal.aiState === 'fleeing') {
        if (now > animal.fleeUntil) {
          animal.aiState = 'peaceful';
          animal.pose = 'wander';
        } else {
          const steered = this.steerWithWhiskers(
            animal,
            Math.atan2(animal.x - animal.fleeFromX, animal.z - animal.fleeFromZ),
            3.0,
            animal.radius
          );
          animal.yaw = steered.yaw;
          animal.pose = 'run';
          stepCharacterPhysics(
            this.map,
            animal,
            Math.sin(animal.yaw) * spec.runSpeed,
            Math.cos(animal.yaw) * spec.runSpeed,
            dt,
            22,
            animal.radius,
            animal.height
          );
          animal.animPhase += dt * 15;
          const minG = this.map.getGroundHeightAt(animal.x, animal.z, animal.y);
          if (animal.y < minG) animal.y = minG;
          continue;
        }
      }

      if (now >= animal.nextStateAt) {
        const roll = Math.random();
        if (roll < 0.48) {
          animal.pose = 'wander';
          const distHome = Math.hypot(animal.x - animal.homeX, animal.z - animal.homeZ);
          if (distHome > 38) {
            animal.yaw = Math.atan2(animal.homeX - animal.x, animal.homeZ - animal.z) + (Math.random() - 0.5) * 0.8;
          } else {
            animal.yaw = normalizeAngle(animal.yaw + (Math.random() - 0.5) * 2.2);
          }
          animal.nextStateAt = now + 2600 + Math.random() * 2800;
        } else if (roll < 0.8) {
          animal.pose = 'graze';
          animal.nextStateAt = now + 2200 + Math.random() * 2600;
        } else {
          animal.pose = 'rest';
          animal.nextStateAt = now + 2500 + Math.random() * 3000;
        }
      }

      if (animal.pose === 'wander') {
        const nextX = animal.x + Math.sin(animal.yaw) * 3.0;
        const nextZ = animal.z + Math.cos(animal.yaw) * 3.0;
        if (this.map.getGroundHeightAt(nextX, nextZ) < WATER_LEVEL - 0.2) {
          animal.yaw = normalizeAngle(animal.yaw + Math.PI * 0.75);
        }
        const steered = this.steerWithWhiskers(animal, animal.yaw, 2.8, animal.radius);
        animal.yaw = steered.yaw;
        stepCharacterPhysics(
          this.map,
          animal,
          Math.sin(animal.yaw) * spec.walkSpeed,
          Math.cos(animal.yaw) * spec.walkSpeed,
          dt,
          22,
          animal.radius,
          animal.height
        );
        animal.animPhase += dt * 5.5;
      } else {
        stepCharacterPhysics(this.map, animal, 0, 0, dt, 22, animal.radius, animal.height);
        animal.animPhase += dt * 1.8;
      }

      const minG = this.map.getGroundHeightAt(animal.x, animal.z, animal.y);
      if (animal.y < minG) animal.y = minG;
    }
  }

  updateStorm(dt) {
    const phaseCfg = STORM_PHASES[this.storm.phaseIndex];

    if (phaseCfg) {
      if (this.storm.state === 'waiting') {
        this.storm.dps = phaseCfg.dps;
        this.storm.timer -= dt;
        if (this.storm.timer <= 0) {
          this.storm.state = 'shrinking';
          this.storm.startRadius = this.storm.radius;
          this.storm.targetRadius = phaseCfg.targetRadius;
          this.storm.timer = phaseCfg.shrinkSec;
        }
      } else if (this.storm.state === 'shrinking') {
        this.storm.dps = phaseCfg.dps;
        this.storm.timer -= dt;
        const progress = Math.min(1, Math.max(0, 1 - this.storm.timer / phaseCfg.shrinkSec));
        this.storm.radius =
          this.storm.startRadius + (this.storm.targetRadius - this.storm.startRadius) * progress;

        if (this.storm.timer <= 0) {
          this.storm.radius = this.storm.targetRadius;
          this.storm.phaseIndex += 1;
          const nextCfg = STORM_PHASES[this.storm.phaseIndex];
          if (nextCfg) {
            this.storm.state = 'waiting';
            this.storm.timer = nextCfg.waitSec;
            this.storm.dps = nextCfg.dps;
            this.storm.targetRadius = nextCfg.targetRadius;
          } else {
            this.storm.state = 'closed';
            this.storm.timer = 0;
            this.storm.dps = STORM_CLOSED_DPS;
          }
        }
      }
    } else {
      this.storm.state = 'closed';
      this.storm.radius = 0;
      this.storm.dps = STORM_CLOSED_DPS;
    }

    this.stormDamageAccum += dt;
    while (this.stormDamageAccum >= 1.0) {
      this.stormDamageAccum -= 1.0;
      const dmgPerSec = Math.max(1, Math.round(this.storm.dps));

      for (const p of this.players.values()) {
        if (!p.alive || p.spectating || p.state === 'plane') continue;
        const distFromSafeCenter = Math.hypot(p.x - this.storm.centerX, p.z - this.storm.centerZ);
        if (distFromSafeCenter > this.storm.radius) {
          this.damagePlayer(p, dmgPerSec, null, 'storm', false);
        }
      }
    }
  }

  serializePlayers() {
    const out = {};
    for (const [id, p] of this.players.entries()) {
      if (p.spectating) continue;
      out[id] = {
        id: p.id,
        name: p.name,
        isBot: p.isBot,
        colorIdx: p.colorIdx,
        seatIndex: p.seatIndex || 0,
        alive: p.alive,
        hp: p.hp,
        maxHp: p.maxHp,
        kills: p.kills,
        state: p.state,
        x: Number(p.x.toFixed(2)),
        y: Number(p.y.toFixed(2)),
        z: Number(p.z.toFixed(2)),
        yaw: Number(p.yaw.toFixed(3)),
        pitch: Number(p.pitch.toFixed(3)),
        onGround: Boolean(p.onGround),
        animWalk: Number(p.animWalk.toFixed(2)),
        moveMode: p.moveMode || 'idle',
        isSliding: Boolean(p.isSliding),
        isCrouching: Boolean(p.isCrouching),
        jumpAltitude: Number((p.jumpAltitude || PARACHUTE_CONFIG.planeHeightAboveValley).toFixed(1)),
        equipped: p.equipped,
        mag: p.weapons[p.equipped] ? p.weapons[p.equipped].mag : 0,
        reserveAmmo: p.reserveAmmo,
        medkits: p.medkits,
        bandages: p.bandages,
        isHealing: p.healingUntil > Date.now(),
        healingItem: p.healingUntil > Date.now() ? p.healingItem : null,
        reloading: p.reloadingUntil > Date.now(),
        unlockedWeapons: {
          pistol: p.weapons.pistol.unlocked,
          shotgun: p.weapons.shotgun.unlocked,
          smg: p.weapons.smg.unlocked,
          rifle: p.weapons.rifle.unlocked,
          sniper: p.weapons.sniper.unlocked
        }
      };
    }
    return out;
  }

  serializeWildlife() {
    const out = [];
    for (const a of this.wildlife.values()) {
      if (!a.alive) continue;
      out.push({
        id: a.id,
        species: a.species,
        x: Number(a.x.toFixed(2)),
        y: Number(a.y.toFixed(2)),
        z: Number(a.z.toFixed(2)),
        yaw: Number(a.yaw.toFixed(3)),
        hp: a.hp,
        maxHp: a.maxHp,
        aiState: a.aiState,
        pose: a.pose,
        animPhase: Number(a.animPhase.toFixed(2))
      });
    }
    return out;
  }
}
