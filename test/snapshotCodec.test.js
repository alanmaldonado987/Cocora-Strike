// Códec compacto de world_tick: ida y vuelta exacta, envío diferencial de lo frío e interés de la fauna
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WorldTickEncoder,
  WorldTickDecoder,
  KEYFRAME_TICKS,
  WILDLIFE_INTEREST_RADIUS
} from '../shared/snapshotCodec.js';
import { GameRoom } from '../server/gameRoom.js';

function fullPlayer(id, overrides = {}) {
  return {
    id, name: `N-${id}`, isBot: false, colorIdx: 2, seatIndex: 1, cabinProgress: 0, alive: true, hp: 80,
    maxHp: 100, kills: 1, state: 'ground', x: 1.5, y: 2.25, z: -3.125, vx: 0.5, vz: -0.25, vy: 0, lastSeq: 42,
    yaw: 1.234, pitch: -0.1, onGround: true, animWalk: 0.5, moveMode: 'run', isSliding: false, isCrouching: true,
    jumpAltitude: 175.7, equipped: 'pistol', mag: 7, reserveAmmo: 24, medkits: 1, bandages: 2, isSwimming: false,
    breath: 100, isHealing: false, healingItem: null, reloading: false,
    unlockedWeapons: { pistol: true, rifle: false },
    ...overrides
  };
}

const plane = { active: true, aircraftType: 'ch47', label: 'CH-47F', x: 1, y: 200, z: 2, vx: 3, vz: 4, yaw: 0.6, speed: 5, elapsed: 1.5, maxDuration: 60 };
const storm = { centerX: 0, centerZ: 0, radius: 300, targetRadius: 200, state: 'waiting', timer: 30, phaseIndex: 1, dps: 1 };

test('códec: ida y vuelta reconstruye exactamente el snapshot completo', () => {
  const enc = new WorldTickEncoder();
  const dec = new WorldTickDecoder();
  const players = { a: fullPlayer('a'), b: fullPlayer('b', { isBot: true, state: 'plane', alive: false }) };
  const wildlife = [{ id: 'w1', species: 'cow', x: 1, y: 2, z: 3, yaw: 0.5, hp: 50, maxHp: 50, aiState: 'idle', pose: 'graze', animPhase: 0.3 }];
  const snap = dec.decode(enc.encode({ t: 1000, players, wildlife, plane, storm, aliveCount: 2 }));
  assert.deepEqual(snap.players, players);
  assert.deepEqual(snap.wildlife, wildlife);
  assert.deepEqual(snap.plane, plane);
  assert.deepEqual(snap.storm, storm);
  assert.equal(snap.aliveCount, 2);
  assert.equal(snap.t, 1000);
});

test('códec: lo frío solo viaja al cambiar o en fotograma clave; el avión es un objeto nuevo por tick', () => {
  const enc = new WorldTickEncoder();
  const dec = new WorldTickDecoder();
  const p = fullPlayer('a');
  const frame = () => enc.encode({ t: 0, players: { a: p }, wildlife: [], plane, storm, aliveCount: 1 });
  const first = frame();
  assert.ok(first.pc && first.plc && first.s, 'primer tick = fotograma clave');
  const s1 = dec.decode(first);
  const second = frame();
  assert.equal(second.pc, undefined, 'sin cambios no se reenvía lo frío');
  assert.equal(second.plc, undefined, 'la parte fija del avión no se reenvía');
  const s2 = dec.decode(second);
  assert.notEqual(s2.plane, s1.plane, 'objeto nuevo: el cliente lo detecta como dato fresco');
  assert.equal(s2.plane.aircraftType, 'ch47');
  assert.equal(s2.storm.radius, 300, 'la tormenta se mantiene entre envíos');
  assert.equal(s2.players.a.name, 'N-a', 'lo frío sale de la caché');

  p.medkits = 2;
  const third = frame();
  assert.ok(third.pc?.a, 'un cambio de inventario viaja de inmediato');
  assert.equal(dec.decode(third).players.a.medkits, 2);

  // Un cliente nuevo sin caché recibe todo en el siguiente fotograma clave
  const late = new WorldTickDecoder();
  let snap = null;
  for (let i = 0; i < KEYFRAME_TICKS; i++) snap = late.decode(frame());
  assert.equal(snap.players.a.medkits, 2);
});

test('códec: la fauna lejana de todos los humanos no se envía', () => {
  const enc = new WorldTickEncoder();
  const near = { id: 'n', species: 'cow', x: 10, y: 0, z: 10, yaw: 0, hp: 1, maxHp: 1, aiState: 'idle', pose: 'idle', animPhase: 0 };
  const far = { ...near, id: 'f', x: WILDLIFE_INTEREST_RADIUS * 3 };
  const msg = enc.encode({ t: 0, players: {}, wildlife: [near, far], plane: null, storm, aliveCount: 0, interest: [{ x: 0, z: 0 }] });
  assert.deepEqual(msg.w.map((w) => w[0]), ['n']);
  assert.equal(msg.pl, null);
});

test('códec: una partida real con 2 humanos + 2 bots cabe holgadamente en 30 KB/s', () => {
  let bytes = 0;
  let ticks = 0;
  const io = { emit(ev, d) { if (ev === 'world_tick') { bytes += JSON.stringify(d).length; ticks++; } }, to() { return io; } };
  const room = new GameRoom(io);
  clearInterval(room.tickInterval);
  room.addHumanPlayer({ id: 'h1', emit() {} }, 'Uno');
  room.addHumanPlayer({ id: 'h2', emit() {} }, 'Dos');
  room.startGame({ autoFillBots: false, botCount: 2 });
  const realNow = Date.now;
  let t = realNow();
  Date.now = () => t;
  try {
    for (let i = 0; i < 20 * 30; i++) { t += 50; room.tick(); }
  } finally {
    Date.now = realNow;
  }
  const kbps = bytes / 1024 / (ticks / 20);
  assert.ok(kbps < 20, `world_tick ocupa ${kbps.toFixed(2)} KB/s (antes ~160 KB/s)`);
});
