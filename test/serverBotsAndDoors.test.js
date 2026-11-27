// test/serverBotsAndDoors.test.js
// Tests unitarios de consulta espacial de puertas cercanas (tag === 'door') y escalonamiento de visión de bots (5–10 Hz).

import test from 'node:test';
import assert from 'node:assert/strict';
import { BOT_AI_CONFIG } from '../shared/mapData.js';
import { GameRoom } from '../server/gameRoom.js';

function createSilentIo(emitted = []) {
  return {
    to: () => ({ emit: () => {} }),
    emit(event, payload) {
      emitted.push({ event, payload });
    }
  };
}

test('BOT_AI_CONFIG mantiene frecuencia de visión de bots entre 5 y 10 Hz', () => {
  assert.ok(BOT_AI_CONFIG.visionHz >= 5 && BOT_AI_CONFIG.visionHz <= 10);
  assert.equal(BOT_AI_CONFIG.visionIntervalMs, Math.round(1000 / BOT_AI_CONFIG.visionHz));
});

test('openNearbyClosedDoorsForEntity abre puertas usando la grilla espacial sin escanear puertas lejanas', () => {
  const events = [];
  const room = new GameRoom(createSilentIo(events));
  clearInterval(room.tickInterval);

  const allDoors = Array.from(room.doorsById.values());
  assert.ok(allDoors.length > 5, 'El mapa debe contener puertas indexadas');
  const targetDoor = allDoors[0];
  assert.equal(targetDoor.isOpen, false);
  assert.equal(targetDoor.collider.enabled, true);

  // Entidad lejos de cualquier puerta -> 0 puertas abiertas
  const farOpened = room.openNearbyClosedDoorsForEntity({ x: -305, y: 40, z: -305 });
  assert.equal(farOpened, 0);
  assert.equal(targetDoor.isOpen, false);

  // Entidad al lado de targetDoor -> la abre, desactiva su colisionador y emite door_state_changed
  events.length = 0;
  const nearOpened = room.openNearbyClosedDoorsForEntity({
    x: targetDoor.x + 0.6,
    y: targetDoor.y + 0.1,
    z: targetDoor.z + 0.4
  });
  assert.ok(nearOpened >= 1);
  assert.equal(targetDoor.isOpen, true);
  assert.equal(targetDoor.collider.enabled, false);
  assert.equal(
    events.some((e) => e.event === 'door_state_changed' && e.payload.doorId === targetDoor.id && e.payload.isOpen === true),
    true
  );
});

test('bots escalonan su evaluación de visión a 5–10 Hz y reutilizan el objetivo cacheado entre ticks', () => {
  const room = new GameRoom(createSilentIo());
  clearInterval(room.tickInterval);
  room.configureBots({ botDifficulty: 'hard', botCount: 6 });

  const sock = { id: 'human_test', join: () => {}, emit: () => {}, leave: () => {} };
  room.addHumanPlayer(sock, 'Tester');
  room.startGame({ botCount: 6, botDifficulty: 'hard' });

  const bots = Array.from(room.players.values()).filter((p) => p.isBot);
  assert.equal(bots.length, 6);

  // Verificar que los offsets iniciales están escalonados entre distintos bots
  const offsets = new Set(bots.map((b) => b.ai.staggerOffsetMs));
  assert.ok(offsets.size > 1, 'Los bots deben tener desfases escalonados');

  // Colocar todos en suelo despejado cerca del jugador
  const human = room.players.get('human_test');
  human.x = 40;
  human.z = 10;
  human.y = room.map.getTerrainHeightAt(40, 10);
  human.state = 'ground';
  human.onGround = true;

  bots.forEach((b, idx) => {
    b.x = 40 + (idx + 1) * 3.5;
    b.z = 10;
    b.y = room.map.getTerrainHeightAt(b.x, b.z);
    b.state = 'ground';
    b.onGround = true;
  });

  // Contar cuántas veces se invoca canBotSeeTarget a lo largo de 20 ticks (1.0 segundo simulado)
  let visionCalls = 0;
  const origCanSee = room.canBotSeeTarget.bind(room);
  room.canBotSeeTarget = (...args) => {
    visionCalls++;
    return origCanSee(...args);
  };

  const all = Array.from(room.players.values());
  const baseNow = 100000;
  bots.forEach((b) => {
    b.ai.nextVisionCheckAt = baseNow + b.ai.staggerOffsetMs;
  });

  for (let t = 0; t < 20; t++) {
    const simNow = baseNow + t * 50;
    for (const b of bots) {
      room.updateBot(b, 0.05, simNow, all);
    }
  }

  // Sin throttling serían 20 ticks * 6 bots * 6 otros = 720 evaluaciones potenciales;
  // a 8 Hz (cada 125 ms -> 8 ventanas en 1000 ms) debe ser menos de la mitad (<= 320).
  assert.ok(visionCalls > 0 && visionCalls <= 320, `Demasiadas llamadas a visión en 1s: ${visionCalls}`);
});
