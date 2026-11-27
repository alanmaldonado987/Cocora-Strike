// server/room/bots.js
// IA de bots: navegación, visión y toma de decisiones.
// Métodos mezclados en GameRoom.prototype (usan `this` como la sala).

import {
  SWIM_CONFIG,
  PLAYER_RADIUS,
  PLAYER_EYE_HEIGHT,
  WEAPONS,
  WEAPON_SLOTS,
  BOT_DIFFICULTIES,
  BOT_AI_CONFIG,
  PARACHUTE_CONFIG,
  HEAL_CONFIG,
  computeFallDamage,
  computeTargetDescentSpeed,
  getRiverCenterWorldX,
  getWaterDepthAt,
  getSwimFloatY,
  isSwimmingAt,
  applyEntitySeparation,
  stepCharacterPhysics,
  senseObstacleAhead,
  hasLineOfSight,
  MOVE_MODE,
  PLAYER_STATE
} from '../../shared/mapData.js';
import { normalizeAngle } from './constants.js';

const BOT_GUN_TYPES = new Set(WEAPON_SLOTS);
const _botEyeVec = { x: 0, y: 0, z: 0 };
const _botTargetProbe = { x: 0, y: 0, z: 0 };
const _botShotOrigin = { x: 0, y: 0, z: 0 };
const _botShotDir = { x: 0, y: 0, z: 0 };
const _steerOut = { yaw: 0, shouldJump: false };

export const botsMethods = {
  steerWithWhiskers(entity, desiredYaw, lookDist = 3.4, radius = PLAYER_RADIUS) {
    const front = senseObstacleAhead(this.map, entity.x, entity.y, entity.z, desiredYaw, lookDist, radius);
    if (!front.blocked) {
      _steerOut.yaw = desiredYaw;
      _steerOut.shouldJump = false;
      return _steerOut;
    }

    const leftAngle = desiredYaw + 0.7;
    const rightAngle = desiredYaw - 0.7;
    const left = senseObstacleAhead(this.map, entity.x, entity.y, entity.z, leftAngle, lookDist, radius);
    const right = senseObstacleAhead(this.map, entity.x, entity.y, entity.z, rightAngle, lookDist, radius);

    const shouldJump = front.reason === 'steep' && front.dist < 1.8;
    _steerOut.shouldJump = shouldJump;

    if (!left.blocked && right.blocked) {
      _steerOut.yaw = leftAngle;
      return _steerOut;
    }
    if (!right.blocked && left.blocked) {
      _steerOut.yaw = rightAngle;
      return _steerOut;
    }
    if (!left.blocked && !right.blocked) {
      _steerOut.yaw = left.dist >= right.dist ? leftAngle : rightAngle;
      return _steerOut;
    }
    _steerOut.yaw = left.dist >= right.dist ? desiredYaw + 1.45 : desiredYaw - 1.45;
    return _steerOut;
  },

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
  },

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

    _botEyeVec.x = bot.x;
    _botEyeVec.y = bot.y + PLAYER_EYE_HEIGHT;
    _botEyeVec.z = bot.z;
    const otherHeight = this.getParticipantHeight(other);
    _botTargetProbe.x = other.x;
    _botTargetProbe.y = other.y + otherHeight * 0.62;
    _botTargetProbe.z = other.z;
    if (hasLineOfSight(this.map, _botEyeVec, _botTargetProbe, 0.1)) {
      return true;
    }
    _botTargetProbe.y = other.y + otherHeight * 0.88;
    return hasLineOfSight(this.map, _botEyeVec, _botTargetProbe, 0.1);
  },

  updateBot(bot, dt, now, allParticipants) {
    const ai = bot.ai;
    if (!ai) return;
    const diffCfg = BOT_DIFFICULTIES[this.botDifficulty] || BOT_DIFFICULTIES.easy;

    if (bot.state === PLAYER_STATE.PLANE) {
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

    if (bot.state === PLAYER_STATE.SKYDIVING || bot.state === PLAYER_STATE.PARACHUTING) {
      const tx = ai.targetPoint ? ai.targetPoint.x : 56;
      const tz = ai.targetPoint ? ai.targetPoint.z : 4;
      const dx = tx - bot.x;
      const dz = tz - bot.z;
      const d = Math.hypot(dx, dz) || 1;
      const hSpeed =
        bot.state === PLAYER_STATE.SKYDIVING
          ? PARACHUTE_CONFIG.freefallHorizontalSpeed * 0.85
          : PARACHUTE_CONFIG.canopyHorizontalSpeed * 0.85;

      bot.yaw = Math.atan2(dx, dz);
      stepCharacterPhysics(this.map, bot, (dx / d) * hSpeed, (dz / d) * hSpeed, dt, 0);

      const targetDescent = computeTargetDescentSpeed(bot.jumpAltitude || PARACHUTE_CONFIG.planeHeightAboveValley, bot.state, 0);
      const currentDesc = Math.max(0, -bot.vy);
      const accel =
        bot.state === PLAYER_STATE.PARACHUTING
          ? PARACHUTE_CONFIG.canopyOpenDecel
          : PARACHUTE_CONFIG.freefallGravityAccel;
      const nextDesc =
        currentDesc < targetDescent
          ? Math.min(targetDescent, currentDesc + accel * dt)
          : Math.max(targetDescent, currentDesc - accel * dt);

      bot.vy = -nextDesc;
      bot.y += bot.vy * dt;
      bot.moveMode = MOVE_MODE.FALL;

      const supportY = this.map.getFloorBelowY(bot.x, bot.y + 1.2, bot.z);
      if (bot.state === PLAYER_STATE.SKYDIVING && bot.y - supportY <= PARACHUTE_CONFIG.autoDeployHeight) {
        bot.state = PLAYER_STATE.PARACHUTING;
        bot.fallPeakY = bot.y;
      }
      if (bot.y <= supportY + 0.16) {
        bot.y = supportY;
        bot.vy = 0;
        bot.onGround = true;
        bot.state = PLAYER_STATE.GROUND;
        bot.fallPeakY = supportY;
        bot.moveMode = MOVE_MODE.IDLE;
        ai.stuckRefX = bot.x;
        ai.stuckRefZ = bot.z;
        ai.stuckTimer = 0;
      }
      return;
    }

    if (bot.healingUntil <= 0 && bot.onGround) {
      // Consultar puertas cercanas mediante la grilla espacial (tag === 'door') en vez de iterar doorsById completo
      this.openNearbyClosedDoorsForEntity(bot);
      if (bot.hp < 60 && bot.medkits > 0) {
        bot.healingItem = 'medkit';
        bot.healingUntil = now + (HEAL_CONFIG.durationMs || 2000);
      } else if (bot.hp < 75 && bot.bandages > 0) {
        bot.healingItem = 'bandage';
        bot.healingUntil = now + (HEAL_CONFIG.durationMs || 2000);
      }
    }

    // Selección de objetivo y raycasts LOS escalonados por bot a 8 Hz (BOT_AI_CONFIG.visionIntervalMs)
    let nearestEnemy = null;
    let nearestEnemyDist = diffCfg.visionRange;
    if (now >= (ai.nextVisionCheckAt || 0)) {
      ai.nextVisionCheckAt = now + BOT_AI_CONFIG.visionIntervalMs;
      for (let i = 0; i < allParticipants.length; i++) {
        const other = allParticipants[i];
        if (other.id === bot.id || !other.alive || other.state === PLAYER_STATE.PLANE || other.spectating) continue;
        const d = Math.hypot(other.x - bot.x, other.z - bot.z);
        if (d < nearestEnemyDist && this.canBotSeeTarget(bot, other, nearestEnemyDist, now)) {
          nearestEnemy = other;
          nearestEnemyDist = d;
        }
      }
      ai.cachedTargetId = nearestEnemy ? nearestEnemy.id : null;
    } else if (ai.cachedTargetId) {
      const cached = this.players.get(ai.cachedTargetId);
      if (cached && cached.alive && cached.state !== PLAYER_STATE.PLANE && !cached.spectating) {
        const d = Math.hypot(cached.x - bot.x, cached.z - bot.z);
        if (d <= diffCfg.visionRange) {
          nearestEnemy = cached;
          nearestEnemyDist = d;
        } else {
          ai.cachedTargetId = null;
        }
      } else {
        ai.cachedTargetId = null;
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
        const isGun = BOT_GUN_TYPES.has(item.type);
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
          : bot.equipped === 'revolver'
          ? 18
          : bot.equipped === 'assault_rifle'
          ? 28
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
    const botInSwimWater = isSwimmingAt(this.map, bot.x, bot.y, bot.z);
    // Si el bot tiene poco aliento en la laguna o el río, prioriza salir suavemente hacia la orilla más cercana
    let targetYaw = desiredYaw;
    if (botInSwimWater && (bot.breath ?? 100) < 55) {
      const riverCenter = getRiverCenterWorldX(bot.z);
      const escapeSide = bot.x >= riverCenter ? 1 : -1;
      targetYaw = Math.atan2(escapeSide * 48, 0);
    }
    const steered = this.steerWithWhiskers(bot, targetYaw, 3.4, PLAYER_RADIUS);
    const moveYaw = steered.yaw;

    if (steered.shouldJump && bot.onGround && !botInSwimWater) {
      bot.vy = 7.6;
      bot.onGround = false;
      bot.fallPeakY = bot.y;
    }

    if (
      this.botDifficulty === 'hard' &&
      bot.onGround &&
      !botInSwimWater &&
      moveSpeed > 7.0 &&
      now > ai.nextSlideAllowedAt &&
      nearestEnemy &&
      Math.random() < 0.02
    ) {
      ai.slideUntil = now + 850;
      ai.nextSlideAllowedAt = now + 4500;
    }
    bot.isSliding = !botInSwimWater && bot.healingUntil <= now && now < ai.slideUntil && bot.onGround;
    if (botInSwimWater) {
      moveSpeed = moveSpeed > 6.5 ? SWIM_CONFIG.swimSprintSpeed : SWIM_CONFIG.swimSpeed;
    } else if (bot.isSliding) {
      moveSpeed = 10.5;
    }
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
      botInSwimWater ? 0 : 22,
      PLAYER_RADIUS,
      effH
    );
    applyEntitySeparation(bot, allParticipants, PLAYER_RADIUS, dt, this.map);
    if (botInSwimWater) {
      bot.y = getSwimFloatY(this.map, bot.x, bot.z);
      bot.vy = 0;
      bot.onGround = true;
    }

    if (!bot.onGround) {
      bot.fallPeakY = wasOnGround ? bot.y : Math.max(bot.fallPeakY, bot.y);
    } else if (!wasOnGround) {
      const waterDepth = getWaterDepthAt(this.map, bot.x, bot.z);
      const fallDmg = waterDepth > SWIM_CONFIG.swimDepth ? 0 : computeFallDamage(bot.fallPeakY - bot.y);
      bot.fallPeakY = bot.y;
      if (fallDmg > 0) this.damagePlayer(bot, fallDmg, null, 'fall', false);
    } else {
      bot.fallPeakY = bot.y;
    }

    if (nearestEnemy && bot.alive && !botInSwimWater && !bot.isSwimming && bot.healingUntil <= now) {
      bot.yaw = Math.atan2(nearestEnemy.x - bot.x, nearestEnemy.z - bot.z);
      const reacted = now - ai.spottedSince >= diffCfg.reactionMs;
      const pauseOver = now >= ai.nextBurstAllowedAt;

      if (reacted && pauseOver && Math.random() < diffCfg.fireChance) {
        const wSpec = WEAPONS[bot.equipped];
        const aimTargetY = nearestEnemy.y + this.getParticipantHeight(nearestEnemy) * 0.62;
        _botShotOrigin.x = bot.x;
        _botShotOrigin.y = bot.y + PLAYER_EYE_HEIGHT;
        _botShotOrigin.z = bot.z;
        _botTargetProbe.x = nearestEnemy.x;
        _botTargetProbe.y = aimTargetY;
        _botTargetProbe.z = nearestEnemy.z;
        const clearShot = hasLineOfSight(this.map, _botShotOrigin, _botTargetProbe, 0.1);

        if (wSpec && clearShot && nearestEnemyDist <= wSpec.range * 0.85) {
          const baseJitter = 0.055 * diffCfg.spreadMult;
          _botShotDir.x = nearestEnemy.x - _botShotOrigin.x + (Math.random() - 0.5) * baseJitter * nearestEnemyDist;
          _botShotDir.y = aimTargetY - _botShotOrigin.y + (Math.random() - 0.5) * baseJitter * nearestEnemyDist;
          _botShotDir.z = nearestEnemy.z - _botShotOrigin.z + (Math.random() - 0.5) * baseJitter * nearestEnemyDist;
          this.executeAuthoritativeShot(bot, _botShotOrigin, _botShotDir, bot.equipped, diffCfg.damageMult);

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
      ? MOVE_MODE.SLIDE
      : !bot.onGround
      ? bot.vy > 0.6
        ? MOVE_MODE.JUMP
        : MOVE_MODE.FALL
      : movedStep > 0.01
      ? moveSpeed > 6.5
        ? MOVE_MODE.SPRINT
        : MOVE_MODE.WALK
      : MOVE_MODE.IDLE;
  }
};
