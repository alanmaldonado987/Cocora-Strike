import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INTERP_DELAY_MS,
  MAX_EXTRAPOLATION_MS,
  ServerClock,
  SnapshotBuffer,
  createSampleOut,
  lerpAngle
} from '../client/js/interpolation.js';

test('lerpAngle toma el camino corto', () => {
  assert.ok(Math.abs(lerpAngle(3.0, -3.0, 0.5) - Math.PI) < 0.3);
  assert.equal(lerpAngle(0, 1, 0.5), 0.5);
});

test('SnapshotBuffer interpola entre los snapshots que rodean el instante', () => {
  const b = new SnapshotBuffer();
  const out = createSampleOut();
  b.push(1000, 0, 0, 0, 0);
  b.push(1050, 1, 0, 0, 0);
  b.push(1100, 2, 0, 0, 0);
  b.sample(1025, out);
  assert.ok(Math.abs(out.x - 0.5) < 1e-9);
  b.sample(1075, out);
  assert.ok(Math.abs(out.x - 1.5) < 1e-9);
});

test('movimiento continuo: velocidad constante aunque los paquetes lleguen irregulares', () => {
  // Entidad a 6 m/s, snapshots cada 50 ms. El render a 60 FPS debe avanzar parejo.
  const b = new SnapshotBuffer();
  const out = createSampleOut();
  for (let i = 0; i <= 10; i++) b.push(i * 50, i * 0.3, 0, 0, 0);
  let prev = null;
  for (let t = 100; t <= 450; t += 1000 / 60) {
    b.sample(t, out);
    if (prev !== null) {
      const step = out.x - prev;
      assert.ok(Math.abs(step - 0.1) < 1e-6, `paso irregular ${step}`);
    }
    prev = out.x;
  }
});

test('sin datos nuevos extrapola poco y luego se detiene', () => {
  const b = new SnapshotBuffer();
  const out = createSampleOut();
  b.push(0, 0, 0, 0, 0);
  b.push(50, 1, 0, 0, 0);
  b.sample(50 + MAX_EXTRAPOLATION_MS * 3, out);
  const maxX = 1 + MAX_EXTRAPOLATION_MS / 50;
  assert.ok(out.x <= maxX + 1e-9, `extrapoló hasta ${out.x}`);
});

test('un salto grande (teletransporte) no se interpola', () => {
  const b = new SnapshotBuffer();
  const out = createSampleOut();
  b.push(0, 0, 0, 0, 0);
  b.push(50, 100, 0, 0, 0);
  b.sample(25, out);
  assert.equal(out.x, 0);
  assert.equal(out.teleported, true);
  b.push(100, 101, 0, 0, 0);
  b.sample(75, out);
  assert.ok(out.x > 100 && out.x < 101);
});

test('snapshots repetidos o fuera de orden se ignoran', () => {
  const b = new SnapshotBuffer();
  const out = createSampleOut();
  b.push(100, 1, 0, 0, 0);
  b.push(50, 99, 0, 0, 0);
  b.push(150, 2, 0, 0, 0);
  b.sample(125, out);
  assert.ok(Math.abs(out.x - 1.5) < 1e-9);
});

test('ServerClock adapta el retardo al jitter, de forma gradual y acotada', () => {
  const c = new ServerClock();
  const local = 10000;
  // Red limpia: snapshots cada 50 ms con 20 ms de latencia constante
  for (let i = 0; i < 40; i++) c.observe(i * 50, local + i * 50 + 20);
  assert.ok(c.targetDelay() <= 80, `limpia: ${c.targetDelay()}`);
  // Wi-Fi irregular: retrasos de hasta 90 ms
  for (let i = 40; i < 120; i++) c.observe(i * 50, local + i * 50 + 20 + (i % 3) * 45);
  const target = c.targetDelay();
  assert.ok(target >= 130 && target <= 250, `irregular: ${target}`);
  // El retardo aplicado se acerca al objetivo sin saltos (máx. 5 % del tiempo transcurrido)
  let t = local + 6000;
  c.renderTime(t);
  const before = c.delay;
  c.renderTime(t + 16);
  assert.ok(Math.abs(c.delay - before) <= 16 * 0.05 + 1e-9);
  for (let i = 0; i < 2000; i++) { t += 16; c.renderTime(t); }
  assert.ok(Math.abs(c.delay - c.targetDelay()) < 1);
});

test('ServerClock usa el paquete más rápido y no se deja arrastrar por uno retrasado', () => {
  const c = new ServerClock();
  c.observe(1000, 5030); // 30 ms de latencia
  c.observe(1050, 5080);
  c.observe(1100, 5250); // paquete retrasado 120 ms
  assert.ok(Math.abs(c.serverNow(5300) - (5300 - 4030)) < 1);
  assert.equal(c.renderTime(5300), c.serverNow(5300) - INTERP_DELAY_MS);
});
