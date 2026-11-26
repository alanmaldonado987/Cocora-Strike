import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../server/gameRoom.js';
import {
  WATER_LEVEL,
  SWIM_CONFIG,
  RIVER_CENTER_DEPTH,
  getRiverCenterWorldX,
  getWaterDepthAt,
  isSwimmingAt,
  getSwimFloatY
} from '../shared/mapData.js';

function createRoom() {
  const io = { emit() {}, to() { return io; } };
  const room = new GameRoom(io);
  clearInterval(room.tickInterval);
  return room;
}

// Punto del río con agua profunda y otro en la orilla a la misma altura de z
function findRiverSpot(map) {
  for (let z = -250; z <= 250; z += 5) {
    const cx = getRiverCenterWorldX(z);
    if (getWaterDepthAt(map, cx, z) >= 2.3) return { cx, z };
  }
  throw new Error('sin río profundo');
}

test('el río tiene la superficie a WATER_LEVEL y la profundidad esperada', () => {
  const room = createRoom();
  const { cx, z } = findRiverSpot(room.map);
  const depth = getWaterDepthAt(room.map, cx, z);
  assert.ok(Math.abs(depth - RIVER_CENTER_DEPTH) < 0.4, `profundidad ${depth}`);
  assert.equal(getWaterDepthAt(room.map, cx + 40, z), 0);
  assert.ok(WATER_LEVEL >= 8, 'el agua debe estar más alta que antes (3.2 m)');
});

test('isSwimmingAt: agua profunda sí; orilla, puente o caída desde arriba no', () => {
  const room = createRoom();
  const { cx, z } = findRiverSpot(room.map);
  const floatY = getSwimFloatY(room.map, cx, z);
  assert.ok(isSwimmingAt(room.map, cx, floatY, z));
  assert.ok(!isSwimmingAt(room.map, cx, WATER_LEVEL + 5, z), 'cayendo desde arriba aún no nada');
  assert.ok(!isSwimmingAt(room.map, cx + 40, floatY, z), 'fuera del río no se nada');
  // Al flotar, la cabeza (ojos a 1.64 m) queda fuera del agua
  assert.ok(floatY + 1.64 > WATER_LEVEL);
});

function enterRiver(room) {
  const p = room.createFreshParticipant('h1', 'Nadador');
  room.players.set('h1', p);
  room.phase = 'playing';
  const { cx, z } = findRiverSpot(room.map);
  const startX = cx + 30;
  Object.assign(p, { alive: true, state: 'ground', x: startX, z, y: room.map.getTerrainHeightAt(startX, z), onGround: true });
  p.fallPeakY = p.y;
  // Entrar caminando al río a 5 m/s (mensajes cada 50 ms), como un cliente real
  let now = Date.now();
  const realNow = Date.now;
  Date.now = () => now;
  try {
    for (let i = 0; i < 160; i++) {
      now += 50;
      const tx = Math.max(cx, p.x - 0.25);
      const swimming = isSwimmingAt(room.map, tx, p.y, z) || p.isSwimming;
      const ty = swimming ? getSwimFloatY(room.map, tx, z) : room.map.getFloorBelowY(tx, p.y + 1, z);
      room.handlePlayerInput('h1', { x: tx, y: ty, z, yaw: 0, pitch: 0, onGround: true, moveMode: 'swim' });
      room.tick();
      if (Math.abs(p.x - cx) < 0.3 && p.isSwimming) break;
    }
  } finally {
    Date.now = realNow;
  }
  return { p, now };
}

test('nadar gasta aliento, a 0 se ahoga y fuera del agua se recupera', () => {
  const room = createRoom();
  const { p } = enterRiver(room);
  assert.equal(p.isSwimming, true, 'el servidor debe detectar que nada');
  assert.equal(p.hp, 100, 'entrar al agua caminando no hace daño');

  // Seguir nadando: con ~4/s de gasto, el aliento lleno dura ~25 s de juego
  assert.ok(SWIM_CONFIG.maxBreath / SWIM_CONFIG.drainPerSec >= 20);
  const ticksToEmpty = Math.ceil(p.breath / SWIM_CONFIG.drainPerSec / 0.05);
  for (let i = 0; i < ticksToEmpty; i++) room.updateSwimmingAndBreath(p, 0.05);
  assert.equal(p.breath, 0);
  assert.equal(p.hp, 100, 'justo al agotarse aún no hubo daño');

  // 3 s sin aliento: ~30 de daño por ahogamiento
  for (let i = 0; i < 60; i++) room.updateSwimmingAndBreath(p, 0.05);
  assert.ok(p.hp <= 72 && p.hp >= 68, `vida tras 3 s ahogándose: ${p.hp}`);

  // Salir del agua: deja de perder vida y recupera el aliento
  p.isSwimming = false;
  p.y = WATER_LEVEL + 5;
  p.state = 'ground';
  const hpOut = p.hp;
  for (let i = 0; i < 100; i++) room.updateSwimmingAndBreath(p, 0.05);
  assert.equal(p.hp, hpOut);
  assert.equal(p.breath, SWIM_CONFIG.maxBreath);
});

test('ahogarse hasta el final elimina al jugador con motivo "drown"', () => {
  const events = [];
  const io = { emit(name, data) { events.push({ name, data }); }, to() { return io; } };
  const room = new GameRoom(io);
  clearInterval(room.tickInterval);
  const { p } = enterRiver(room);
  const other = room.createFreshParticipant('h2', 'Otro');
  Object.assign(other, { alive: true, state: 'ground', x: 0, z: 0, y: 30 });
  room.players.set('h2', other);
  p.breath = 0;
  for (let i = 0; i < 400 && p.alive; i++) room.updateSwimmingAndBreath(p, 0.05);
  assert.equal(p.alive, false);
  const elim = events.find((e) => e.name === 'player_eliminated');
  assert.ok(elim, 'debe emitirse la eliminación');
  assert.equal(elim.data.reason, 'drown');
});

test('nadando no se puede disparar ni curar', () => {
  const room = createRoom();
  const { p } = enterRiver(room);
  p.weapons.pistol.unlocked = true;
  p.weapons.pistol.mag = 5;
  p.equipped = 'pistol';
  room.handleShoot('h1', { origin: { x: p.x, y: p.y + 1.64, z: p.z }, dir: { x: 0, y: 0, z: 1 } });
  assert.equal(p.weapons.pistol.mag, 5);
  p.hp = 50;
  p.medkits = 1;
  room.handleHeal('h1', 'medkit');
  assert.equal(p.healingUntil || 0, 0);
});

test('caer desde gran altura en agua profunda nadable (laguna o río) inflige 0 daño por caída', () => {
  const room = createRoom();
  const p = room.createFreshParticipant('h_dive', 'Clavadista');
  room.players.set('h_dive', p);
  room.phase = 'playing';

  const lagoonZ = 252;
  const lagoonX = getRiverCenterWorldX(lagoonZ);
  const lagoonDepth = getWaterDepthAt(room.map, lagoonX, lagoonZ);
  assert.ok(lagoonDepth > SWIM_CONFIG.swimDepth, `laguna profunda esperada, actual=${lagoonDepth}`);

  Object.assign(p, {
    alive: true,
    hp: 100,
    state: 'skydiving',
    x: lagoonX,
    y: WATER_LEVEL + 48,
    z: lagoonZ,
    fallPeakY: WATER_LEVEL + 48,
    onGround: false
  });

  const floatY = getSwimFloatY(room.map, lagoonX, lagoonZ);
  room.handlePlayerInput('h_dive', {
    x: lagoonX,
    y: floatY,
    z: lagoonZ,
    yaw: 0,
    pitch: 0,
    onGround: true,
    isSwimming: true,
    state: 'swimming',
    moveMode: 'swim_idle'
  });

  assert.equal(p.hp, 100, 'el agua profunda debe desactivar el daño por caída');
  assert.equal(p.isSwimming, true, 'debe quedar flotando en estado swimming');
});
