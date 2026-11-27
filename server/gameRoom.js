// server/gameRoom.js
// Servidor autoritativo (20 Hz) en escala métrica (1.80m):
// - Avión a ~198m sobre el valle con caída libre de ~10s (apertura automática a 25m)
// - Soporte multinivel completo (getGroundHeightAt con cota de referencia para pisos 2/3, puentes y cuevas)
// - Oso de Anteojos letal (42 dmg, persecución veloz y triple drop de alto nivel) + Arsenal de 5 armas + Bots configurables
//
// La lógica está repartida en server/room/*.js y se mezcla en GameRoom.prototype.

import {
  DEFAULT_MAP_SEED,
  PLAYER_RADIUS,
  WEAPONS,
  LOOT_TYPES,
  STORM_PHASES,
  PARACHUTE_CONFIG,
  CABIN_DISEMBARK_MS,
  SWIM_CONFIG,
  BOT_AI_CONFIG,
  generateCocoraMap,
  applyEntitySeparation
} from '../shared/mapData.js';
import { TICK_RATE, TICK_DT } from './room/constants.js';
import { lobbyMethods } from './room/lobby.js';
import { interactablesMethods } from './room/interactables.js';
import { lootMethods } from './room/loot.js';
import { playerActionsMethods } from './room/playerActions.js';
import { combatMethods } from './room/combat.js';
import { botsMethods } from './room/bots.js';
import { wildlifeMethods } from './room/wildlife.js';
import { stormMethods } from './room/storm.js';
import { lagCompensationMethods } from './room/lagCompensation.js';
import { swimmingMethods } from './room/swimming.js';
import { S2C, quantize } from '../shared/protocol.js';

export class GameRoom {
  constructor(io) {
    this.io = io;
    this.phase = 'lobby';
    this.seed = DEFAULT_MAP_SEED;
    this.map = generateCocoraMap(this.seed);

    this.botDifficulty = 'easy';
    this.desiredBotCount = 6;
    this.aircraftPreference = 'auto';
    this.matchCounter = 0;

    this.players = new Map();
    this.loot = new Map();
    this.wildlife = new Map();
    this.doorsById = new Map();
    this.windowsById = new Map();
    this.syncMapInteractiveIndex();
    this.nextLootId = 1;
    this.nextAnimalId = 1;
    this.nextColorIdx = 0;
    this.nextBotStaggerIdx = 0;
    this._participantsBuf = [];

    this.plane = null;
    this.storm = this.createInitialStorm();
    this.lobbyCountdown = null;
    this.matchStartTime = 0;
    this.stormDamageAccum = 0;

    this.tickInterval = setInterval(() => this.tick(), 1000 / TICK_RATE);
  }

  createFreshWeaponsMap() {
    return {
      fists: { unlocked: true, mag: 0 },
      pistol: { unlocked: false, mag: 0 },
      revolver: { unlocked: false, mag: 0 },
      shotgun: { unlocked: false, mag: 0 },
      smg: { unlocked: false, mag: 0 },
      assault_rifle: { unlocked: false, mag: 0 },
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
      cabinDisembarkStartAt: 0,
      cabinProgress: 0,
      alive: true,
      spectating: false,
      hp: 100,
      maxHp: 100,
      breath: SWIM_CONFIG.maxBreath, // aliento para nadar; a 0 empieza a ahogarse
      isSwimming: false,
      drownDamageAccum: 0,
      kills: 0,
      placement: 0,
      state: 'lobby',
      x: 0,
      y: 20,
      z: 0,
      vx: 0,
      vz: 0,
      vy: 0,
      yaw: 0,
      pitch: 0,
      onGround: false,
      isSliding: false,
      isCrouching: false,
      isVaulting: false,
      animWalk: 0,
      walkPhase: 0,
      moveMode: 'idle',
      jumpAltitude: PARACHUTE_CONFIG.planeHeightAboveValley,
      jumpStartAltitude: PARACHUTE_CONFIG.planeHeightAboveValley,
      currentDescentSpeed: 0,
      airMomentumX: 0,
      airMomentumZ: 0,
      fallPeakY: 20,
      airPeakY: 20,
      lastProcessedSeq: 0,
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
        ? (() => {
            const staggerOffsetMs = (this.nextBotStaggerIdx++ % 8) * BOT_AI_CONFIG.staggerStepMs;
            return {
              jumpDelay: 1.5 + Math.random() * 9.5,
              wanderAngle: Math.random() * Math.PI * 2,
              nextDecisionAt: 0,
              strafeDir: Math.random() < 0.5 ? -1 : 1,
              targetPoint: null,
              spottedTargetId: null,
              spottedSince: 0,
              staggerOffsetMs,
              nextVisionCheckAt: staggerOffsetMs,
              cachedTargetId: null,
              nextBurstAllowedAt: 0,
              stuckRefX: 0,
              stuckRefZ: 0,
              stuckTimer: 0,
              evadeUntil: 0,
              evadeYaw: 0,
              slideUntil: 0,
              nextSlideAllowedAt: 0
            };
          })()
        : null
    };
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
          if (p.cabinDisembarkStartAt > 0) {
            const prog = Math.min(1, (now - p.cabinDisembarkStartAt) / CABIN_DISEMBARK_MS);
            p.cabinProgress = prog;
            p.moveMode = prog < 0.24 ? 'stand' : prog < 0.82 ? 'walk_cabin' : 'ramp_jump';
            if (prog >= 1) {
              this.completePlaneExit(p);
            }
          }
        }
      }

      if (this.plane.elapsed >= this.plane.maxDuration) {
        for (const p of this.players.values()) {
          if (p.alive && p.state === 'plane') {
            this.completePlaneExit(p);
          }
        }
        this.plane.active = false;
      }
    }

    const allParticipants = this._participantsBuf;
    let partCount = 0;
    for (const p of this.players.values()) {
      allParticipants[partCount++] = p;
    }
    allParticipants.length = partCount;

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
            this.io.to(p.id).emit(S2C.PLAYER_HEALED, { hp: p.hp, medkits: p.medkits, bandages: p.bandages, itemType: 'bandage' });
          }
        } else if (itemType === 'medkit' && p.medkits > 0 && p.hp < p.maxHp) {
          p.medkits -= 1;
          p.hp = Math.min(p.maxHp, p.hp + LOOT_TYPES.medkit.heal);
          if (!p.isBot) {
            this.io.to(p.id).emit(S2C.PLAYER_HEALED, { hp: p.hp, medkits: p.medkits, bandages: p.bandages, itemType: 'medkit' });
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
          this.io.to(p.id).emit(S2C.RELOAD_COMPLETE, {
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

      if (p.alive) this.updateSwimmingAndBreath(p, TICK_DT);
    }

    this.updateWildlife(TICK_DT, now);
    this.updateStorm(TICK_DT);

    this.recordPositionHistory(now);

    this.io.emit(S2C.WORLD_TICK, {
      t: now, // hora del servidor (ms): el cliente interpola las entidades remotas con ella
      players: this.serializePlayers(),
      wildlife: this.serializeWildlife(),
      plane: this.plane,
      storm: {
        centerX: quantize(this.storm.centerX, 1),
        centerZ: quantize(this.storm.centerZ, 1),
        radius: quantize(this.storm.radius, 2),
        targetRadius: this.storm.targetRadius,
        state: this.storm.state,
        timer: Math.ceil(this.storm.timer),
        phaseIndex: Math.min(STORM_PHASES.length, this.storm.phaseIndex + 1),
        dps: this.storm.dps
      },
      aliveCount: this.getAliveCount()
    });
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
        cabinProgress: quantize(p.cabinProgress || 0, 3),
        alive: p.alive,
        hp: p.hp,
        maxHp: p.maxHp,
        kills: p.kills,
        state: p.state,
        x: quantize(p.x, 3),
        y: quantize(p.y, 3),
        z: quantize(p.z, 3),
        vx: quantize(p.vx || 0, 3),
        vz: quantize(p.vz || 0, 3),
        vy: quantize(p.vy || 0, 3),
        lastSeq: p.lastProcessedSeq || 0,
        yaw: quantize(p.yaw, 3),
        pitch: quantize(p.pitch, 3),
        onGround: Boolean(p.onGround),
        animWalk: quantize(p.animWalk, 2),
        moveMode: p.moveMode || 'idle',
        isSliding: Boolean(p.isSliding),
        isCrouching: Boolean(p.isCrouching),
        jumpAltitude: quantize(p.jumpAltitude || PARACHUTE_CONFIG.planeHeightAboveValley, 1),
        equipped: p.equipped,
        mag: p.weapons[p.equipped] ? p.weapons[p.equipped].mag : 0,
        reserveAmmo: p.reserveAmmo,
        medkits: p.medkits,
        bandages: p.bandages,
        isSwimming: Boolean(p.isSwimming),
        breath: Math.round(p.breath ?? SWIM_CONFIG.maxBreath),
        isHealing: p.healingUntil > Date.now(),
        healingItem: p.healingUntil > Date.now() ? p.healingItem : null,
        reloading: p.reloadingUntil > Date.now(),
        unlockedWeapons: {
          pistol: p.weapons.pistol.unlocked,
          revolver: p.weapons.revolver.unlocked,
          shotgun: p.weapons.shotgun.unlocked,
          smg: p.weapons.smg.unlocked,
          assault_rifle: p.weapons.assault_rifle.unlocked,
          rifle: p.weapons.rifle.unlocked,
          sniper: p.weapons.sniper.unlocked
        }
      };
    }
    return out;
  }
}

Object.assign(
  GameRoom.prototype,
  lobbyMethods,
  interactablesMethods,
  lootMethods,
  playerActionsMethods,
  combatMethods,
  botsMethods,
  wildlifeMethods,
  stormMethods,
  lagCompensationMethods,
  swimmingMethods
);
