// test/hudPerf.test.js
// Tests unitarios de dirty-checking del HUD, throttling a 10 Hz y limpieza de timeout en flashDamage.

import test from 'node:test';
import assert from 'node:assert/strict';
import { CLIENT_PERF_CONFIG } from '../shared/mapData.js';
import {
  createHudCache,
  setTextIfChanged,
  setStyleIfChanged,
  toggleClassIfChanged,
  updateWeaponSlotIfChanged,
  createHudSensorState,
  stepHudSensorThrottle,
  invalidateHudSensors,
  createDamageFlashState,
  triggerDamageFlash
} from '../client/js/hudUpdater.js';

// Importación relativa alternativa si Node no resuelve ruta raíz '/shared/config.js'
test('CLIENT_PERF_CONFIG define frecuencia de 10 Hz para sensores del HUD', () => {
  assert.equal(CLIENT_PERF_CONFIG.hudSensorHz, 10);
  assert.equal(CLIENT_PERF_CONFIG.hudSensorIntervalSec, 0.10);
});

test('dirty-checking evita mutar el DOM cuando los valores permanecen iguales', () => {
  const cache = createHudCache();
  let textWrites = 0;
  let styleWrites = 0;
  let classToggles = 0;
  let classWrites = 0;

  const mockEl = {
    _text: '',
    set textContent(v) {
      textWrites++;
      this._text = v;
    },
    style: new Proxy(
      {},
      {
        set(target, prop, val) {
          styleWrites++;
          target[prop] = val;
          return true;
        }
      }
    ),
    classList: {
      toggle() {
        classToggles++;
      }
    },
    set className(v) {
      classWrites++;
      this._cls = v;
    }
  };

  assert.equal(setTextIfChanged(cache, 'hp', mockEl, '100/100'), true);
  for (let i = 0; i < 60; i++) {
    assert.equal(setTextIfChanged(cache, 'hp', mockEl, '100/100'), false);
    setStyleIfChanged(cache, 'hpW', mockEl, 'width', '100%');
    toggleClassIfChanged(cache, 'stealth', mockEl, 'hidden', true);
    updateWeaponSlotIfChanged(cache, 'slot1', mockEl, true, false);
  }

  assert.equal(textWrites, 1);
  assert.equal(styleWrites, 1);
  assert.equal(classToggles, 1);
  assert.equal(classWrites, 1);

  // Al cambiar el estado sí actualiza exactamente una vez
  assert.equal(setTextIfChanged(cache, 'hp', mockEl, '80/100'), true);
  assert.equal(updateWeaponSlotIfChanged(cache, 'slot1', mockEl, true, true), true);
  assert.equal(textWrites, 2);
  assert.equal(classWrites, 2);
});

test('stepHudSensorThrottle limita consultas pesadas a máximo 10 Hz (10 veces/s a 60 FPS)', () => {
  const st = createHudSensorState(CLIENT_PERF_CONFIG.hudSensorIntervalSec);
  let evaluations = 0;
  const dt = 1 / 60;

  // Primer frame válido evalúa inmediatamente y los siguientes ~59 frames totalizan <= 11 llamadas en 1.0 s
  for (let f = 0; f < 60; f++) {
    if (stepHudSensorThrottle(st, dt, true)) {
      evaluations++;
    }
  }
  assert.ok(evaluations >= 10 && evaluations <= 11, `Evaluaciones fuera de rango 10 Hz: ${evaluations}`);

  // En estado estacionario durante otro segundo completo a 120 FPS ejecuta exactamente 10 veces
  evaluations = 0;
  for (let f = 0; f < 120; f++) {
    if (stepHudSensorThrottle(st, 1 / 120, true)) {
      evaluations++;
    }
  }
  assert.equal(evaluations, 10);

  // Invalidar fuerza actualización en el frame inmediato
  invalidateHudSensors(st);
  assert.equal(stepHudSensorThrottle(st, 0.001, true), true);
});

test('triggerDamageFlash limpia el setTimeout anterior evitando apagados prematuros', async () => {
  const flashState = createDamageFlashState();
  const el = { style: { background: '', opacity: '0' } };

  triggerDamageFlash(flashState, el, 'rgba(239, 68, 68, 0.65)', 50);
  const firstTimer = flashState.timeoutId;
  assert.equal(el.style.opacity, '1');

  await new Promise((r) => setTimeout(r, 30));
  // Nuevo impacto a los 30 ms: debe cancelar el timer de 50 ms y extender otros 50 ms
  triggerDamageFlash(flashState, el, 'rgba(220, 38, 38, 0.78)', 50);
  assert.notEqual(flashState.timeoutId, firstTimer);

  await new Promise((r) => setTimeout(r, 30));
  // A los 60 ms totales (pasado el primer timer de 50 ms), sigue encendido ('1')
  assert.equal(el.style.opacity, '1');

  await new Promise((r) => setTimeout(r, 30));
  // A los 90 ms totales, el segundo timer ya expiró limpiamente
  assert.equal(el.style.opacity, '0');
  assert.equal(flashState.timeoutId, null);
});
