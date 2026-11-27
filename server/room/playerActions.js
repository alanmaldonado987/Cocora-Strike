// server/room/playerActions.js
// Acciones del jugador: salto/paracaídas, slide, movimiento, armas, recarga y curación.
// Métodos mezclados en GameRoom.prototype (usan `this` como la sala).

import {
  WORLD_HALF,
  WATER_LEVEL,
  SWIM_CONFIG,
  SIM_DT,
  PLAYER_RADIUS,
  PLAYER_HEIGHT,
  PLAYER_CROUCH_HEIGHT,
  PLAYER_SLIDE_HEIGHT,
  PLAYER_EYE_HEIGHT,
  PLAYER_CROUCH_EYE_HEIGHT,
  PLAYER_SLIDE_EYE_HEIGHT,
  WEAPONS,
  PARACHUTE_CONFIG,
  CABIN_DISEMBARK_MS,
  HEAL_CONFIG,
  computeFallDamage,
  computeTargetDescentSpeed,
  resolveSlidingHorizontal,
  getWaterDepthAt,
  getSwimFloatY,
  isSwimmingAt,
  createStepEvents,
  stepPlayer,
  GAME_PHASE,
  MOVE_MODE,
  PLAYER_STATE
} from '../../shared/mapData.js';
import { consumeMoveBudget } from '../validation.js';
import { S2C } from '../../shared/protocol.js';

const _serverStepEvents = createStepEvents();

export const playerActionsMethods = {
  handlePlayerJump(socketId) {
    if (this.phase !== GAME_PHASE.PLAYING) return;
    const p = this.players.get(socketId);
    if (!p || !p.alive) return;

    const floorY = this.map.getFloorBelowY(p.x, p.y, p.z);
    const clearance = Math.max(0, p.y - floorY);

    if (p.state === PLAYER_STATE.PLANE && this.plane) {
      if (p.cabinDisembarkStartAt > 0) return;
      p.cabinDisembarkStartAt = Date.now();
      p.cabinProgress = 0.01;
      p.moveMode = MOVE_MODE.STAND;
      this.io.emit(S2C.PLAYER_CABIN_DISEMBARK, {
        playerId: p.id,
        seatIndex: p.seatIndex || 0,
        durationMs: CABIN_DISEMBARK_MS
      });
    } else if (p.state === PLAYER_STATE.SKYDIVING && clearance >= PARACHUTE_CONFIG.minClearanceToOpen) {
      p.state = PLAYER_STATE.PARACHUTING;
      p.fallPeakY = p.y;
      p.vy = -computeTargetDescentSpeed(p.jumpAltitude, 'parachuting', p.pitch);
      this.io.emit(S2C.PLAYER_JUMPED, { playerId: p.id, state: PLAYER_STATE.PARACHUTING });
    } else if (p.state === PLAYER_STATE.GROUND && clearance >= PARACHUTE_CONFIG.minClearanceToOpen) {
      p.jumpAltitude = Math.max(PARACHUTE_CONFIG.minJumpHeightRef, clearance);
      p.state = PLAYER_STATE.PARACHUTING;
      p.isSliding = false;
      p.isCrouching = false;
      p.onGround = false;
      p.fallPeakY = p.y;
      p.vy = -computeTargetDescentSpeed(p.jumpAltitude, 'parachuting', p.pitch);
      this.io.emit(S2C.PLAYER_JUMPED, { playerId: p.id, state: PLAYER_STATE.PARACHUTING });
    }
  },

  completePlaneExit(p) {
    if (!p || !p.alive || p.state !== PLAYER_STATE.PLANE || !this.plane) return;
    const backDist = this.plane.aircraftType === 'ch47' ? 7.95 : 7.75;
    const backX = -Math.sin(this.plane.yaw) * backDist;
    const backZ = -Math.cos(this.plane.yaw) * backDist;
    p.cabinDisembarkStartAt = 0;
    p.cabinProgress = 1;
    p.state = PLAYER_STATE.SKYDIVING;
    p.moveMode = MOVE_MODE.FALL;
    p.isSliding = false;
    p.isCrouching = false;
    p.onGround = false;
    p.x = this.plane.x + backX + (Math.random() - 0.5) * 0.5;
    p.y = this.plane.y - 1.48;
    p.z = this.plane.z + backZ + (Math.random() - 0.5) * 0.5;
    const groundAtDrop = this.map.getFloorBelowY(p.x, p.y, p.z);
    p.jumpAltitude = Math.max(15, p.y - groundAtDrop);
    p.jumpStartAltitude = p.jumpAltitude;
    p.currentDescentSpeed = PARACHUTE_CONFIG.freefallInitialSpeed;
    p.airMomentumX = (this.plane.vx || 0) * 0.42;
    p.airMomentumZ = (this.plane.vz || 0) * 0.42;
    p.fallPeakY = p.y;
    p.airPeakY = p.y;
    p.vy = -PARACHUTE_CONFIG.freefallInitialSpeed;
    this.io.emit(S2C.PLAYER_JUMPED, {
      playerId: p.id,
      state: PLAYER_STATE.SKYDIVING,
      jumpAltitude: p.jumpAltitude,
      x: p.x,
      y: p.y,
      z: p.z
    });
  },

  handlePlayerSlide(socketId, payload = {}) {
    if (this.phase !== GAME_PHASE.PLAYING) return;
    const p = this.players.get(socketId);
    if (!p || !p.alive || p.state !== PLAYER_STATE.GROUND) return;
    // El slide lo decide SOLO la simulación compartida (botón SLIDE en los pasos de player_input), que además
    // emite PLAYER_SLID. Este aviso llega antes que el lote de pasos: si forzaba isSliding aquí, el servidor
    // deslizaba con la dirección/velocidad del slide anterior y el cliente era devuelto a ese punto en cada
    // snapshot. Se acepta por compatibilidad pero no toca el estado.
    void payload;
  },

  getParticipantHeight(p) {
    if (p.isSliding) return PLAYER_SLIDE_HEIGHT;
    if (p.isCrouching) return PLAYER_CROUCH_HEIGHT;
    return PLAYER_HEIGHT;
  },

  getParticipantEyeHeight(p) {
    if (p.isSliding) return PLAYER_SLIDE_EYE_HEIGHT;
    if (p.isCrouching) return PLAYER_CROUCH_EYE_HEIGHT;
    return PLAYER_EYE_HEIGHT;
  },

  handlePlayerInput(socketId, data) {
    if (this.phase !== GAME_PHASE.PLAYING) return;
    const p = this.players.get(socketId);
    if (!p || !p.alive || p.isBot) return;

    if (typeof data.yaw === 'number' && Number.isFinite(data.yaw)) p.yaw = data.yaw;
    if (typeof data.pitch === 'number' && Number.isFinite(data.pitch)) {
      p.pitch = Math.max(-1.45, Math.min(1.45, data.pitch));
    }
    if (p.state === PLAYER_STATE.PLANE) return;

    // Simulación cinemática compartida paso a paso (stepPlayer idéntico en cliente y servidor)
    if (Array.isArray(data.steps) && data.steps.length > 0) {
      const now = Date.now();
      for (let i = 0; i < data.steps.length; i++) {
        const cmd = data.steps[i];
        if (!p.alive || p.state === PLAYER_STATE.PLANE) break;
        if (cmd.seq <= (p.lastProcessedSeq || 0)) continue;
        p.lastProcessedSeq = cmd.seq;
        p.isHealing = p.healingUntil > now;

        const ev = stepPlayer(p, cmd, SIM_DT, this.map, {
          reloading: p.reloadingUntil > now,
          eventsOut: _serverStepEvents
        });
        p.animWalk = p.walkPhase || 0;
        p.fallPeakY = p.airPeakY ?? p.y;

        if (ev.cancelHeal && p.healingUntil > 0) {
          this.cancelHealForPlayer(p);
        }
        if (ev.slideStarted) {
          this.io.emit(S2C.PLAYER_SLID, { playerId: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw });
        }
        if (ev.parachuteOpened) {
          this.io.emit(S2C.PLAYER_JUMPED, { playerId: p.id, state: PLAYER_STATE.PARACHUTING });
        }
        if (ev.vaultBreakWindowId) {
          this.handleBreakWindow(socketId, ev.vaultBreakWindowId);
        }
        if (ev.landed && !ev.fromParachute && ev.fallDistance > 0 && !ev.landedInDeepWater) {
          const fallDmg =
            ev.waterDepth > SWIM_CONFIG.swimDepth
              ? 0
              : computeFallDamage(ev.waterDepth > 0.45 ? ev.fallDistance * 0.5 : ev.fallDistance);
          if (fallDmg > 0) this.damagePlayer(p, fallDmg, null, 'fall', false);
        }
      }
      return;
    }

    if (typeof data.animWalk === 'number' && Number.isFinite(data.animWalk)) p.animWalk = data.animWalk;
    if (typeof data.moveMode === 'string') p.moveMode = data.moveMode;
    if (typeof data.isSliding === 'boolean') p.isSliding = p.state === PLAYER_STATE.GROUND ? data.isSliding : false;
    if (typeof data.isCrouching === 'boolean') p.isCrouching = p.state === PLAYER_STATE.GROUND && !p.isSliding ? data.isCrouching : false;

    // Si corre rápido (sprint), derrapa o salta, cancelar curación canalizada de 2.0s
    if (p.healingUntil > 0 && (p.moveMode === MOVE_MODE.SPRINT || p.isSliding || data.onGround === false)) {
      this.cancelHealForPlayer(p);
    }

    if ((p.state === PLAYER_STATE.SKYDIVING || p.state === PLAYER_STATE.GROUND) && data.state === PLAYER_STATE.PARACHUTING) {
      p.state = PLAYER_STATE.PARACHUTING;
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
      const isVaulting = p.moveMode === MOVE_MODE.VAULT || Boolean(data.isVaulting);
      if (horizDist < 16.0) {
        // Limitar la velocidad: el servidor avanza como máximo lo que el presupuesto de movimiento permite
        const allowed = consumeMoveBudget(p, p.state, horizDist);
        let targetX = clampedX;
        let targetZ = clampedZ;
        if (allowed < horizDist) {
          const k = horizDist > 0 ? allowed / horizDist : 0;
          targetX = p.x + (clampedX - p.x) * k;
          targetZ = p.z + (clampedZ - p.z) * k;
        }
        const effHeight = this.getParticipantHeight(p);
        if (isVaulting && horizDist < 4.5) {
          p.x = targetX;
          p.z = targetZ;
        } else {
          const slid = resolveSlidingHorizontal(this.map, targetX, clampedY, targetZ, PLAYER_RADIUS, effHeight);
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

      if (p.state === PLAYER_STATE.SKYDIVING || p.state === PLAYER_STATE.PARACHUTING) {
        if (p.state === PLAYER_STATE.SKYDIVING && p.y - floorY <= PARACHUTE_CONFIG.autoDeployHeight) {
          p.state = PLAYER_STATE.PARACHUTING;
          p.fallPeakY = p.y;
        }

        const wasUnprotectedSkydive = p.state === PLAYER_STATE.SKYDIVING;
        if (wasUnprotectedSkydive) p.fallPeakY = Math.max(p.fallPeakY, p.y);
        else p.fallPeakY = p.y;

        const waterDepthHere = getWaterDepthAt(this.map, p.x, p.z);
        const landedInDeepWater = waterDepthHere > SWIM_CONFIG.swimDepth && p.y <= WATER_LEVEL + 0.35;

        if (landedInDeepWater || nearFloor || ((data.state === PLAYER_STATE.GROUND || data.state === PLAYER_STATE.SWIMMING) && p.y - floorY <= 2.8)) {
          const landingY = landedInDeepWater ? getSwimFloatY(this.map, p.x, p.z) : floorY;
          const fallDist = p.fallPeakY - landingY;
          p.y = landingY;
          p.state = PLAYER_STATE.GROUND;
          p.isSwimming = landedInDeepWater || isSwimmingAt(this.map, p.x, p.y, p.z);
          p.onGround = true;
          p.vy = 0;
          p.fallPeakY = landingY;

          // Caer en agua profunda nadable desactiva por completo el daño por caída (0 HP)
          if (wasUnprotectedSkydive && !p.isSwimming && waterDepthHere <= SWIM_CONFIG.swimDepth) {
            const fallDmg = computeFallDamage(fallDist);
            if (fallDmg > 0) this.damagePlayer(p, fallDmg, null, 'fall', false);
          }
        }
      } else if (p.state === PLAYER_STATE.GROUND) {
        const clientAirborne = data.onGround === false || !nearFloor;
        const swimming = isSwimmingAt(this.map, p.x, p.y, p.z);
        p.isSwimming = swimming;
        if (swimming) {
          // Aterrizar en cuerpo de agua nadable (> 1.25m) anula 100% el daño por caída y activa flotabilidad
          if (p.healingUntil > 0) this.cancelHealForPlayer(p);
          p.isSliding = false;
          p.isCrouching = false;
          p.onGround = true;
          p.fallPeakY = p.y;
        } else if (clientAirborne && !nearFloor) {
          p.fallPeakY = p.onGround ? p.y : Math.max(p.fallPeakY, p.y);
          p.onGround = false;
        } else {
          if (!p.onGround) {
            const fallDist = p.fallPeakY - floorY;
            const waterDepth = getWaterDepthAt(this.map, p.x, p.z);
            const fallDmg =
              waterDepth > SWIM_CONFIG.swimDepth
                ? 0
                : computeFallDamage(waterDepth > 0.45 ? fallDist * 0.5 : fallDist);
            if (fallDmg > 0) this.damagePlayer(p, fallDmg, null, 'fall', false);
          }
          p.onGround = true;
          p.fallPeakY = p.y;
        }
      }
    }
  },

  handleSwitchWeapon(socketId, weaponId) {
    const p = this.players.get(socketId);
    if (!p || !p.alive) return;
    if (p.weapons[weaponId] && p.weapons[weaponId].unlocked) {
      p.equipped = weaponId;
      p.reloadingUntil = 0;
      p.reloadWeapon = null;
    }
  },

  handleReload(socketId) {
    const p = this.players.get(socketId);
    if (!p || !p.alive || p.state !== PLAYER_STATE.GROUND) return;
    this.startReloadForPlayer(p);
  },

  startReloadForPlayer(p) {
    const wSpec = WEAPONS[p.equipped];
    const wState = p.weapons[p.equipped];
    if (!wSpec || !wState || wSpec.magSize === 0) return false;
    if (p.reloadingUntil > Date.now()) return false;
    if (wState.mag >= wSpec.magSize || p.reserveAmmo <= 0) return false;

    p.reloadingUntil = Date.now() + wSpec.reloadMs;
    p.reloadWeapon = p.equipped;
    return true;
  },

  cancelHealForPlayer(p) {
    if (!p || p.healingUntil <= 0) return;
    p.healingUntil = 0;
    p.healingItem = null;
    if (!p.isBot) {
      this.io.to(p.id).emit(S2C.HEAL_CANCELLED, { playerId: p.id });
    }
  },

  handleCancelHeal(socketId) {
    const p = this.players.get(socketId);
    if (p) this.cancelHealForPlayer(p);
  },

  handleHeal(socketId, preferredItem = 'medkit') {
    const p = this.players.get(socketId);
    if (!p || !p.alive || p.state !== PLAYER_STATE.GROUND || p.hp >= p.maxHp) return;
    if (p.isSwimming) return; // no se puede vendar nadando
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

    this.io.to(socketId).emit(S2C.HEAL_STARTED, {
      playerId: p.id,
      itemType: chosen,
      durationMs: HEAL_CONFIG.durationMs || 2000
    });
  }
};
