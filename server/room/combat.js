// server/room/combat.js
// Combate autoritativo: disparos, impactos, daño, eliminaciones y condición de victoria.
// Métodos mezclados en GameRoom.prototype (usan `this` como la sala).

import {
  PLAYER_RADIUS,
  WEAPONS,
  raycastVoxels,
  hasLineOfSight
} from '../../shared/mapData.js';
import { positionAt, resolveRewindTime } from './lagCompensation.js';
import { S2C } from '../../shared/protocol.js';

export const combatMethods = {
  handleShoot(socketId, payload) {
    if (this.phase !== 'playing') return;
    const shooter = this.players.get(socketId);
    if (!shooter || !shooter.alive || shooter.state !== 'ground') return;
    if (shooter.isSwimming) return; // nadando el arma va guardada
    if (!payload || !payload.origin || !payload.dir) return;

    if (shooter.healingUntil > 0) {
      this.cancelHealForPlayer(shooter);
    }
    this.executeAuthoritativeShot(shooter, payload.origin, payload.dir, shooter.equipped, 1.0, payload.viewTime);
  },

  // viewTime: instante (hora del servidor) en que el tirador veía a los demás; los bots no lo usan.
  executeAuthoritativeShot(shooter, rawOrigin, rawDir, weaponId, damageMult = 1.0, viewTime = null) {
    const now = Date.now();
    const rewindTime = shooter.isBot ? null : resolveRewindTime(viewTime, now);
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
        const pos = rewindTime === null ? target : positionAt(target, rewindTime);
        const hit = this.intersectRayPlayer(origin, dir, target, bestDist, pos);
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
        const aPos = rewindTime === null ? animal : positionAt(animal, rewindTime);
        const hit = this.intersectRayCylinder(
          origin,
          dir,
          aPos.x,
          aPos.y,
          aPos.z,
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

    this.io.emit(S2C.SHOT_FIRED, {
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
  },

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
  },

  // pos: posición a usar para el objetivo (por defecto la actual; con compensación de latencia, la rebobinada)
  intersectRayPlayer(origin, dir, target, maxDist, pos = target) {
    const effHeight = this.getParticipantHeight(target);
    const hit = this.intersectRayCylinder(
      origin,
      dir,
      pos.x,
      pos.y,
      pos.z,
      PLAYER_RADIUS + 0.15,
      effHeight,
      maxDist
    );
    if (!hit) return null;
    const headThreshold = pos.y + effHeight * 0.74;
    return {
      ...hit,
      isHeadshot: hit.point.y >= headThreshold
    };
  },

  damagePlayer(victim, amount, attacker, sourceName, isHeadshot = false, hitPoint = null) {
    if (!victim.alive || this.phase !== 'playing' || amount <= 0) return;

    victim.hp = Math.max(0, victim.hp - amount);

    this.io.emit(S2C.PLAYER_DAMAGED, {
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
        ['sniper', 'rifle', 'assault_rifle', 'shotgun', 'smg', 'revolver', 'pistol'].find(
          (w) => victim.weapons[w]?.unlocked
        ) || 'ammo';
      this.spawnDroppedLootPair(bestDrop, 'medkit', victim.x, victim.y, victim.z);

      let killerLabel = attacker ? attacker.name : 'La Tormenta';
      if (sourceName === 'bear') killerLabel = 'Oso de Anteojos';
      else if (sourceName === 'jaguar') killerLabel = 'Jaguar Colombiano';
      else if (sourceName === 'fall') killerLabel = 'Caída de Altura';
      else if (sourceName === 'drown') killerLabel = 'El Río Quindío';

      this.io.emit(S2C.PLAYER_ELIMINATED, {
        victimId: victim.id,
        victimName: victim.name,
        killerId: attacker ? attacker.id : null,
        killerName: killerLabel,
        reason: sourceName
      });

      this.checkWinCondition();
    }
  },

  getAliveCount() {
    let count = 0;
    for (const p of this.players.values()) {
      if (p.alive && !p.spectating) count++;
    }
    return count;
  },

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

      this.io.emit(S2C.GAME_OVER, {
        winnerId: winner ? winner.id : null,
        winnerName: winner ? winner.name : 'Nadie',
        winnerKills: winner ? winner.kills : 0,
        ranking
      });
    }
  }
};
