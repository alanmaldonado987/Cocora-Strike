// Contador de FPS del HUD: cifra correcta, refresco espaciado y niveles de color
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFpsMeter, fpsLevel, FPS_REFRESH_MS } from '../client/js/ui/fpsMeter.js';

test('fpsMeter: mide 60 FPS reales y solo avisa cada FPS_REFRESH_MS', () => {
  const updates = [];
  const meter = createFpsMeter({ onUpdate: (fps, level, worst) => updates.push({ fps, level, worst }) });
  let t = 1000;
  for (let i = 0; i <= 120; i++) { meter.tick(t); t += 1000 / 60; }
  assert.ok(updates.length >= 3 && updates.length <= 4, `refrescos: ${updates.length}`);
  assert.ok(Math.abs(updates[0].fps - 60) <= 1);
  assert.equal(updates[0].level, 'good');
  assert.ok(updates[0].worst <= 17);
  assert.ok(FPS_REFRESH_MS >= 250, 'no debe tocar el DOM en cada fotograma');
});

test('fpsMeter: registra el peor fotograma (tirones) y baja el nivel', () => {
  const updates = [];
  const meter = createFpsMeter({ onUpdate: (fps, level, worst) => updates.push({ fps, level, worst }) });
  let t = 0;
  for (let i = 0; i < 20; i++) { meter.tick(t); t += i === 5 ? 200 : 25; }
  assert.equal(updates[0].worst, 200);
  assert.equal(fpsLevel(20), 'bad');
  assert.equal(fpsLevel(40), 'ok');
});
