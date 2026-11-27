// server/room/wildlife.js
// Fauna silvestre: aparición, IA, daño y serialización.
// Métodos mezclados en GameRoom.prototype (usan `this` como la sala).

import {
  WATER_LEVEL,
  PLAYER_RADIUS,
  WILDLIFE_TYPES,
  stepCharacterPhysics,
  hasLineOfSight
} from '../../shared/mapData.js';
import { normalizeAngle } from './constants.js';
import { S2C, quantize } from '../../shared/protocol.js';

export const wildlifeMethods = {
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
  },

  damageWildlife(animal, amount, attacker, hitPoint) {
    if (!animal.alive || this.phase !== 'playing') return;
    const now = Date.now();
    const spec = WILDLIFE_TYPES[animal.species];
    animal.hp = Math.max(0, animal.hp - amount);

    this.io.emit(S2C.WILDLIFE_HIT, {
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
      this.io.emit(S2C.WILDLIFE_KILLED, {
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
        this.io.emit(S2C.WILDLIFE_AGGRO, {
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
  },

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
              this.io.emit(S2C.WILDLIFE_ATTACK, {
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
  },

  serializeWildlife() {
    const out = [];
    for (const a of this.wildlife.values()) {
      if (!a.alive) continue;
      out.push({
        id: a.id,
        species: a.species,
        x: quantize(a.x, 2),
        y: quantize(a.y, 2),
        z: quantize(a.z, 2),
        yaw: quantize(a.yaw, 3),
        hp: a.hp,
        maxHp: a.maxHp,
        aiState: a.aiState,
        pose: a.pose,
        animPhase: quantize(a.animPhase, 2)
      });
    }
    return out;
  }
};
