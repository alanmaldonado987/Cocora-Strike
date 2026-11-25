import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../server/gameRoom.js';
import { positionAt, resolveRewindTime, MAX_REWIND_MS } from '../server/room/lagCompensation.js';
import { sanitizers } from '../server/validation.js';

test('positionAt interpola el historial y usa la posición actual si no hay datos', () => {
  const e = { x: 10, y: 0, z: 0, posHistory: [{ t: 0, x: 0, y: 0, z: 0 }, { t: 100, x: 10, y: 0, z: 0 }] };
  assert.equal(positionAt(e, 50).x, 5);
  assert.equal(positionAt(e, -50).x, 0);
  assert.equal(positionAt(e, 500).x, 10);
  assert.equal(positionAt({ x: 3, y: 0, z: 0 }, 50).x, 3);
});

test('resolveRewindTime acota el rebobinado', () => {
  assert.equal(resolveRewindTime(undefined, 1000), null);
  assert.equal(resolveRewindTime(900, 1000), 900);
  assert.equal(resolveRewindTime(0, 1000), 1000 - MAX_REWIND_MS);
  assert.equal(resolveRewindTime(5000, 1000), 1000);
});

test('player_shoot conserva viewTime solo si es un número finito', () => {
  const base = { origin: { x: 0, y: 0, z: 0 }, dir: { x: 1, y: 0, z: 0 } };
  assert.equal(sanitizers.player_shoot({ ...base, viewTime: 123 }).viewTime, 123);
  assert.equal(sanitizers.player_shoot({ ...base, viewTime: 'x' }).viewTime, null);
});

test('un disparo acierta donde el tirador vio al objetivo, no donde está ahora', () => {
  const io = { emit() {}, to() { return io; } };
  const room = new GameRoom(io);
  clearInterval(room.tickInterval);
  room.phase = 'playing';
  const shooter = room.createFreshParticipant('a', 'A');
  const target = room.createFreshParticipant('b', 'B');
  // Campo abierto (sin muros entre tirador y objetivo)
  const sx = 100, sz = -150;
  const sy = room.map.getTerrainHeightAt(sx, sz);
  const ty = room.map.getTerrainHeightAt(sx + 0.5, sz + 8);
  Object.assign(shooter, { alive: true, state: 'ground', x: sx, y: sy, z: sz, equipped: 'pistol' });
  shooter.weapons.pistol.unlocked = true;
  shooter.weapons.pistol.mag = 10;
  Object.assign(target, { alive: true, state: 'ground', x: sx + 3, y: ty, z: sz + 8 });
  room.players.set('a', shooter);
  room.players.set('b', target);

  const now = Date.now();
  // Hace 150 ms el objetivo estaba en x = sx + 0.5; ahora se movió a sx + 3
  target.posHistory = [{ t: now - 200, x: sx, y: ty, z: sz + 8 }, { t: now - 100, x: sx + 1, y: ty, z: sz + 8 }];

  const eye = { x: sx, y: sy + 1.64, z: sz };
  const aim = { x: 0.5, y: ty + 1.0 - eye.y, z: 8 };
  const hpBefore = target.hp;
  room.executeAuthoritativeShot(shooter, eye, aim, 'pistol', 1, now - 150);
  assert.ok(target.hp < hpBefore, 'el disparo compensado debería acertar');

  // Sin viewTime, el mismo disparo falla (el objetivo ya no está ahí)
  const hpMid = target.hp;
  shooter.lastShotAt = 0;
  room.executeAuthoritativeShot(shooter, eye, aim, 'pistol', 1, null);
  assert.equal(target.hp, hpMid);
});
