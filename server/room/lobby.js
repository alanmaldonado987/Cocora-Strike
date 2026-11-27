// server/room/lobby.js
// Lobby: entrada/salida de jugadores, bots de sala, inicio y reinicio de partida.
// Métodos mezclados en GameRoom.prototype (usan `this` como la sala).

import {
  DEFAULT_MAP_SEED,
  BOT_DIFFICULTIES,
  TRANSPORT_AIRCRAFT_TYPES,
  PARACHUTE_CONFIG,
  SWIM_CONFIG,
  generateCocoraMap,
  createRNG
} from '../../shared/mapData.js';
import { BOT_NAMES } from './constants.js';
import { S2C, quantize } from '../../shared/protocol.js';

export const lobbyMethods = {
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
      socket.emit(S2C.JOINED_MIDGAME, {
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
  },

  removePlayer(socketId) {
    const p = this.players.get(socketId);
    if (!p) return;
    const wasPlayingAlive = this.phase === 'playing' && p.alive && !p.spectating;
    this.players.delete(socketId);

    if (wasPlayingAlive) {
      this.io.emit(S2C.PLAYER_ELIMINATED, {
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
  },

  configureBots({ botDifficulty, botCount, aircraftType } = {}) {
    if (this.phase !== 'lobby') return;
    if (botDifficulty && BOT_DIFFICULTIES[botDifficulty]) {
      this.botDifficulty = botDifficulty;
    }
    if (typeof botCount === 'number' && Number.isFinite(botCount)) {
      this.desiredBotCount = Math.max(0, Math.min(8, Math.round(botCount)));
      this.syncLobbyBotsCount(this.desiredBotCount);
    }
    if (aircraftType && TRANSPORT_AIRCRAFT_TYPES.includes(aircraftType)) {
      this.aircraftPreference = aircraftType;
    }
    this.broadcastLobbyState();
  },

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
  },

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
  },

  addBot() {
    if (this.phase !== 'lobby') return;
    this._spawnOneBot();
    this.desiredBotCount = Array.from(this.players.values()).filter((p) => p.isBot).length;
    this.broadcastLobbyState();
  },

  clearBots() {
    if (this.phase !== 'lobby') return;
    for (const [id, p] of this.players.entries()) {
      if (p.isBot) this.players.delete(id);
    }
    this.desiredBotCount = 0;
    this.broadcastLobbyState();
  },

  checkAutoLobbyStart() {
    if (this.phase !== 'lobby') return;
    const humans = Array.from(this.players.values()).filter((p) => !p.isBot);
    if (humans.length >= 2 && this.lobbyCountdown === null) {
      this.lobbyCountdown = 10;
    } else if (humans.length < 2 && this.lobbyCountdown !== null) {
      this.lobbyCountdown = null;
    }
  },

  broadcastLobbyState() {
    const list = Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      colorIdx: p.colorIdx,
      spectating: p.spectating
    }));
    const botCount = list.filter((p) => p.isBot).length;
    this.io.emit(S2C.LOBBY_STATE, {
      phase: this.phase,
      players: list,
      botCount,
      botDifficulty: this.botDifficulty,
      aircraftType: this.aircraftPreference || 'auto',
      countdown: this.lobbyCountdown !== null ? Math.ceil(this.lobbyCountdown) : null
    });
  },

  startGame({ autoFillBots = false, botCount, botDifficulty, aircraftType } = {}) {
    if (this.phase === 'playing') return;

    if (botDifficulty && BOT_DIFFICULTIES[botDifficulty]) {
      this.botDifficulty = botDifficulty;
    }
    if (aircraftType && TRANSPORT_AIRCRAFT_TYPES.includes(aircraftType)) {
      this.aircraftPreference = aircraftType;
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
    const planeY = quantize(valleyRefY + PARACHUTE_CONFIG.planeHeightAboveValley, 1);

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

    const activeAircraft =
      this.aircraftPreference === 'ac130' || this.aircraftPreference === 'ch47'
        ? this.aircraftPreference
        : ((this.matchCounter = (this.matchCounter || 0) + 1) % 2 === 1 ? 'ac130' : 'ch47');

    this.plane = {
      active: true,
      aircraftType: activeAircraft,
      label: activeAircraft === 'ch47' ? 'CH-47F Chinook' : 'AC-130J Ghostrider',
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
      p.cabinDisembarkStartAt = 0;
      p.cabinProgress = 0;
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
      p.moveMode = 'seated';
      p.jumpAltitude = PARACHUTE_CONFIG.planeHeightAboveValley;
      p.fallPeakY = this.plane.y;
      p.lastAlertedById = null;
      p.alertedUntil = 0;
      p.breath = SWIM_CONFIG.maxBreath;
      p.isSwimming = false;
      p.drownDamageAccum = 0;
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

    this.io.emit(S2C.GAME_STARTED, {
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
  },

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
    this.io.emit(S2C.RETURNED_TO_LOBBY);
  }
};
