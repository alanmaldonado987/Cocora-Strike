import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANIMATION_FEEL_CONFIG,
  createPoseWeights,
  stepPoseWeights
} from '../shared/mapData.js';
import { SnapshotBuffer, createSampleOut } from '../client/js/net/interpolation.js';

test('stepPoseWeights: mantiene suma unitaria (1.0) y mezcla suavemente entre estados sin saltos bruscos', () => {
  const w = createPoseWeights();
  assert.equal(w.idle, 1);

  // Pasar de idle a sprint: en 1 frame (16.6 ms) el peso de sprint sube gradualmente sin saltar directo a 1.0
  stepPoseWeights(w, { isSprint: true, isWalk: true, horizSpeed: 8.2 }, 1 / 60, ANIMATION_FEEL_CONFIG);
  const sumAfterOne = w.idle + w.walk + w.sprint + w.crouch + w.slide + w.air;
  assert.ok(Math.abs(sumAfterOne - 1.0) < 1e-6, `suma=${sumAfterOne}`);
  assert.ok(w.sprint > 0.1 && w.sprint < 0.45, `mezcla progresiva en 1 frame: sprint=${w.sprint}`);

  // Tras ~0.4 s esprintando, sprint domina (> 0.98)
  for (let i = 0; i < 25; i++) {
    stepPoseWeights(w, { isSprint: true, isWalk: true, horizSpeed: 8.2 }, 1 / 60, ANIMATION_FEEL_CONFIG);
  }
  assert.ok(w.sprint > 0.98);

  // Transición de sprint -> slide -> crouch manteniendo partición de la unidad en todo instante
  for (let i = 0; i < 10; i++) {
    stepPoseWeights(w, { isSliding: true, horizSpeed: 11.5 }, 1 / 60, ANIMATION_FEEL_CONFIG);
    const s = w.idle + w.walk + w.sprint + w.crouch + w.slide + w.air;
    assert.ok(Math.abs(s - 1.0) < 1e-6);
  }
  assert.ok(w.slide > 0.65);

  for (let i = 0; i < 15; i++) {
    stepPoseWeights(w, { isCrouching: true, isWalk: true, horizSpeed: 3.4 }, 1 / 60, ANIMATION_FEEL_CONFIG);
    const s = w.idle + w.walk + w.sprint + w.crouch + w.slide + w.air;
    assert.ok(Math.abs(s - 1.0) < 1e-6);
  }
  assert.ok(w.crouch > 0.8);
});

test('SnapshotBuffer.sample: calcula el vector de velocidad instantánea (m/s) para adelantar animación remota', () => {
  const buf = new SnapshotBuffer();
  const out = createSampleOut();

  // Jugador remoto avanzando a +8.0 m/s en Z (0.4 m cada 50 ms)
  buf.push(1000, 10, 14, 0.0, 0, { animWalk: 0, moveMode: 'sprint', state: 'ground' });
  buf.push(1050, 10, 14, 0.4, 0, { animWalk: 0.65, moveMode: 'sprint', state: 'ground' });
  buf.push(1100, 10, 14, 0.8, 0, { animWalk: 1.30, moveMode: 'sprint', state: 'ground' });

  buf.sample(1025, out);
  assert.ok(Math.abs(out.vz - 8.0) < 1e-6, `vz interpolada esperada 8.0 m/s, actual=${out.vz}`);
  assert.equal(out.vx, 0);

  // Extrapolación corta también conserva velocidad; pasado MAX_EXTRAPOLATION_MS la velocidad cae a 0
  buf.sample(1140, out);
  assert.ok(Math.abs(out.vz - 8.0) < 1e-6);
  buf.sample(1500, out);
  assert.equal(out.vz, 0, 'detiene velocidad cuando expira extrapolación máxima');
});
