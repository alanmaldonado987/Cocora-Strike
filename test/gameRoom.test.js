import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../server/gameRoom.js';

function createFakeIo() {
  const events = [];
  const io = {
    events,
    emit(name, data) { events.push({ name, data }); },
    to() { return io; }
  };
  return io;
}

function createFakeSocket(id) {
  const sent = [];
  return { id, sent, emit(name, data) { sent.push({ name, data }); } };
}

function withFakeClock(fn) {
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try {
    return fn((ms) => { now += ms; });
  } finally {
    Date.now = realNow;
  }
}

test('GameRoom: una partida con bots corre sin errores y respeta invariantes', () => {
  const io = createFakeIo();
  const room = new GameRoom(io);
  clearInterval(room.tickInterval);

  const human = createFakeSocket('human-1');
  room.addHumanPlayer(human, 'Tester');
  room.configureBots({ botDifficulty: 'normal', botCount: 6 });
  room.startGame({ autoFillBots: false, botCount: 6 });
  assert.equal(room.phase, 'playing');
  assert.equal(room.players.size, 7);

  withFakeClock((advance) => {
    for (let i = 0; i < 20 * 90 && room.phase === 'playing'; i++) {
      advance(50);
      room.tick();
      for (const p of room.players.values()) {
        assert.ok(p.hp >= 0 && p.hp <= p.maxHp, `hp fuera de rango: ${p.hp}`);
        assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
      }
    }
  });

  const tick = io.events.findLast((e) => e.name === 'world_tick');
  assert.ok(tick, 'no se emitió world_tick');
  assert.ok(tick.data.players['human-1']);
  assert.ok(Array.isArray(tick.data.wildlife));
  assert.equal(typeof tick.data.aliveCount, 'number');
});

test('GameRoom: entrar al lobby limpia y recorta el apodo', () => {
  const room = new GameRoom(createFakeIo());
  clearInterval(room.tickInterval);
  const p = room.addHumanPlayer(createFakeSocket('s1'), '   Un apodo demasiado largo   ');
  assert.equal(p.name, 'Un apodo demasia');
  const q = room.addHumanPlayer(createFakeSocket('s2'), '');
  assert.ok(q.name.length > 0);
});
