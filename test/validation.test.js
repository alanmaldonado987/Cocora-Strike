import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizers, sanitizeName, RateLimiter, consumeMoveBudget, MAX_HORIZONTAL_SPEED } from '../server/validation.js';

test('player_input: descarta tipos inválidos y posiciones incompletas', () => {
  assert.equal(sanitizers.player_input(null), null);
  assert.equal(sanitizers.player_input('hola'), null);

  const ok = sanitizers.player_input({ x: 1, y: 2, z: 3, yaw: 0.5, moveMode: 'sprint', state: 'ground', onGround: true });
  assert.deepEqual([ok.x, ok.y, ok.z, ok.yaw, ok.moveMode, ok.state, ok.onGround], [1, 2, 3, 0.5, 'sprint', 'ground', true]);

  const bad = sanitizers.player_input({ x: NaN, y: 2, z: 3, yaw: 'a', moveMode: '<script>', state: 'dead', onGround: 'yes' });
  assert.equal(bad.x, undefined);
  assert.equal(bad.y, undefined);
  assert.equal(bad.yaw, undefined);
  assert.equal(bad.moveMode, undefined);
  assert.equal(bad.state, undefined);
  assert.equal(bad.onGround, undefined);

  assert.equal(sanitizers.player_input({ x: 1e9, y: 0, z: 0 }).x, undefined);
});

test('player_shoot: exige vectores finitos y normaliza la dirección', () => {
  assert.equal(sanitizers.player_shoot({ origin: { x: 0, y: 0, z: 0 } }), null);
  assert.equal(sanitizers.player_shoot({ origin: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: 0 } }), null);
  assert.equal(sanitizers.player_shoot({ origin: { x: Infinity, y: 0, z: 0 }, dir: { x: 1, y: 0, z: 0 } }), null);
  const s = sanitizers.player_shoot({ origin: { x: 1, y: 2, z: 3 }, dir: { x: 0, y: 0, z: 5 } });
  assert.deepEqual(s.dir, { x: 0, y: 0, z: 1 });
});

test('armas, curación e ids', () => {
  assert.deepEqual(sanitizers.player_switch_weapon({ weapon: 'rifle' }), { weapon: 'rifle' });
  assert.equal(sanitizers.player_switch_weapon({ weapon: '__proto__' }), null);
  assert.equal(sanitizers.player_switch_weapon({ weapon: 7 }), null);
  assert.deepEqual(sanitizers.player_heal({ itemType: 'x' }), { itemType: 'medkit' });
  assert.deepEqual(sanitizers.player_heal({ itemType: 'bandage' }), { itemType: 'bandage' });
  assert.deepEqual(sanitizers.player_pickup({ lootId: 'loot_12' }), { lootId: 'loot_12' });
  assert.equal(sanitizers.player_pickup({ lootId: { $gt: 1 } }), null);
  assert.equal(sanitizers.player_interact_door({ doorId: 'x'.repeat(200) }), null);
});

test('configuración de bots: dificultad conocida y cantidad acotada', () => {
  assert.deepEqual(sanitizers.configure_bots({ botDifficulty: 'hard', botCount: 99 }).botCount, 8);
  assert.equal(sanitizers.configure_bots({ botDifficulty: 'imposible' }).botDifficulty, undefined);
  assert.deepEqual(sanitizers.start_game(true), { autoFillBots: false });
});

test('sanitizeName quita caracteres de control y bidi', () => {
  assert.equal(sanitizeName('Ana\u0000\u202eBot'), 'AnaBot');
  assert.equal(sanitizeName(42), '');
});

test('RateLimiter: permite la ráfaga y luego limita, y se recupera con el tiempo', () => {
  let now = 0;
  const rl = new RateLimiter({ ev: 10 }, 1, () => now);
  let allowed = 0;
  for (let i = 0; i < 50; i++) if (rl.allow('ev')) allowed++;
  assert.equal(allowed, 10);
  now += 500;
  allowed = 0;
  for (let i = 0; i < 50; i++) if (rl.allow('ev')) allowed++;
  assert.equal(allowed, 5);
  assert.equal(rl.allow('sin_limite'), true);
});

test('consumeMoveBudget: velocidad normal pasa, teletransporte se recorta', () => {
  const p = {};
  let t = 1000;
  consumeMoveBudget(p, 'ground', 0, t);
  // 20 paquetes a 9 m/s cada 50 ms: todo permitido
  for (let i = 0; i < 20; i++) {
    t += 50;
    assert.equal(consumeMoveBudget(p, 'ground', 0.45, t), 0.45);
  }
  // Intento de avanzar 15 m en 50 ms: se recorta muy por debajo
  t += 50;
  const allowed = consumeMoveBudget(p, 'ground', 15, t);
  assert.ok(allowed < MAX_HORIZONTAL_SPEED.ground * 0.6 + 1.01, `permitió ${allowed}`);
  // Sostener 15 m por paquete no supera la velocidad máxima
  let total = 0;
  for (let i = 0; i < 40; i++) {
    t += 50;
    total += consumeMoveBudget(p, 'ground', 15, t);
  }
  assert.ok(total <= MAX_HORIZONTAL_SPEED.ground * 2 + 0.01, `total ${total} en 2 s`);
});
