// server/room/playerActions.js
// Acciones del jugador: salto/paracaídas, slide, movimiento, armas, recarga y curación.
// Métodos mezclados en GameRoom.prototype (usan `this` como la sala).

import {
  WORLD_HALF,
  WATER_LEVEL,
  PLAYER_RADIUS,
  PLAYER_HEIGHT,
  PLAYER_CROUCH_HEIGHT,
  PLAYER_SLIDE_HEIGHT,
  PLAYER_EYE_HEIGHT,
  PLAYER_CROUCH_EYE_HEIGHT,
  PLAYER_SLIDE_EYE_HEIGHT,
  WEAPONS,
  PARACHUTE_CONFIG,
  HEAL_CONFIG,
  computeFallDamage,
  computeTargetDescentSpeed,
  resolveSlidingHorizontal
} from '../../shared/mapData.js';
import { consumeMoveBudget } from '../validation.js';

export const playerActionsMethods = {
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
  },

  handlePlayerSlide(socketId, payload = {}) {
    if (this.phase !== 'playing') return;
    const p = this.players.get(socketId);
    if (!p || !p.alive || p.state !== 'ground') return;
    p.isSliding = Boolean(payload.active);
    if (p.isSliding) {
      p.isCrouching = false;
      this.io.emit('player_slid', { playerId: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw });
    }
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
    if (!p || !p.alive || p.state !== 'ground') return;
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
      this.io.to(p.id).emit('heal_cancelled', { playerId: p.id });
    }
  },

  handleCancelHeal(socketId) {
    const p = this.players.get(socketId);
    if (p) this.cancelHealForPlayer(p);
  },

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
};
