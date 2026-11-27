import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMERA_FEEL_CONFIG,
  stepCriticallyDampedSpring,
  stepCriticallyDampedSpring3D
} from '../shared/mapData.js';

test('stepCriticallyDampedSpring: converge sin sobreoscilación y es independiente de los FPS', () => {
  const s60 = { value: 0, vel: 0 };
  const s240 = { value: 0, vel: 0 };
  const omega = CAMERA_FEEL_CONFIG.followSpringOmega;

  for (let i = 0; i < 30; i++) {
    stepCriticallyDampedSpring(s60, 10, omega, 1 / 60);
    assert.ok(s60.value <= 10.0 + 1e-9, `sin sobreoscilación: ${s60.value}`);
  }
  for (let i = 0; i < 120; i++) {
    stepCriticallyDampedSpring(s240, 10, omega, 1 / 240);
  }

  // Solución analítica exacta -> 60 Hz y 240 Hz dan exactamente el mismo valor tras 0.5 s
  assert.ok(Math.abs(s60.value - s240.value) < 1e-9, `60Hz=${s60.value} vs 240Hz=${s240.value}`);
  assert.ok(Math.abs(s60.value - 10) < 0.01);
});

test('stepCriticallyDampedSpring3D: converge en los 3 ejes y el rango de FOV de sprint está entre +3° y +5°', () => {
  const pos = { x: -5, y: 12, z: 40 };
  const vel = { x: 0, y: 0, z: 0 };
  const target = { x: 10, y: 15, z: 20 };

  for (let i = 0; i < 45; i++) {
    stepCriticallyDampedSpring3D(pos, vel, target, CAMERA_FEEL_CONFIG.followSpringOmega, 1 / 60);
  }
  assert.ok(Math.hypot(pos.x - target.x, pos.y - target.y, pos.z - target.z) < 0.005);
  assert.ok(
    CAMERA_FEEL_CONFIG.sprintFovBoostDeg >= 3.0 && CAMERA_FEEL_CONFIG.sprintFovBoostDeg <= 5.0,
    `sprintFovBoostDeg=${CAMERA_FEEL_CONFIG.sprintFovBoostDeg}`
  );
  assert.equal(typeof CAMERA_FEEL_CONFIG.headBobEnabled, 'boolean');
});
