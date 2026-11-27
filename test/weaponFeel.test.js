import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WEAPON_FEEL_CONFIG,
  stepFireAccumulator,
  stepRecoilSpring
} from '../shared/mapData.js';

function simulateAutoBurst(fps, durationSec, fireIntervalSec) {
  const state = { cooldownSec: 0, burstActive: false };
  const dt = 1 / fps;
  const frames = Math.round(durationSec * fps);
  let totalShots = 0;
  for (let i = 0; i < frames; i++) {
    totalShots += stepFireAccumulator(state, dt, true, i === 0, fireIntervalSec, true);
  }
  return totalShots;
}

test('stepFireAccumulator: cadencia automática idéntica a 30 FPS, 60 FPS y 144 FPS', () => {
  // Subfusil MP-9: 75 ms entre disparos en una ventana de 3.0 s -> 40 disparos exactos sin importar FPS
  const shots30 = simulateAutoBurst(30, 3.0, 0.075);
  const shots60 = simulateAutoBurst(60, 3.0, 0.075);
  const shots144 = simulateAutoBurst(144, 3.0, 0.075);

  assert.equal(shots30, 40);
  assert.equal(shots60, 40);
  assert.equal(shots144, 40);
});

test('stepFireAccumulator: arma semiautomática exige nueva pulsación y respeta cooldown', () => {
  const state = { cooldownSec: 0, burstActive: false };
  assert.equal(stepFireAccumulator(state, 1 / 60, true, true, 0.21, false), 1);
  // Mantener presionado sin nuevo clic no vuelve a disparar
  for (let i = 0; i < 30; i++) {
    assert.equal(stepFireAccumulator(state, 1 / 60, true, false, 0.21, false), 0);
  }
  // Nuevo clic tras expirar cooldown dispara otra vez
  assert.equal(stepFireAccumulator(state, 1 / 60, true, true, 0.21, false), 1);
});

test('stepRecoilSpring: impulsa la vista rápidamente hacia arriba y retorna suavemente al centro', () => {
  const recoil = { targetPitch: 0.08, targetYaw: -0.02, pitch: 0, pitchVel: 0, yaw: 0, yawVel: 0 };

  let peakPitch = 0;
  for (let i = 0; i < 90; i++) {
    stepRecoilSpring(recoil, 1 / 60, WEAPON_FEEL_CONFIG);
    if (recoil.pitch > peakPitch) peakPitch = recoil.pitch;
  }

  assert.ok(peakPitch > 0.025, `alcanza pico de retroceso perceptible: ${peakPitch}`);
  assert.ok(Math.abs(recoil.pitch) < 0.001 && Math.abs(recoil.yaw) < 0.001, 'retorna al centro tras dejar de disparar');
});
