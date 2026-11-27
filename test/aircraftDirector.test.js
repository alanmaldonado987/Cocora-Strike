// Bloque 6A (integración): órdenes deterministas de la aeronave en partida real
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAircraftCommands,
  computeAircraftCommands,
  isPlaneOccupied,
  FIRE_CYCLE_S,
  FIRE_WINDOW_START_S,
  TAKEOFF_POWER_S
} from '../client/js/world/aircraftDirector.js';
import { PLAYER_STATE } from '../shared/mapData.js';

const pos = { x: 10, y: 120, z: -5 };

test('director: potencia de despegue, crucero y reducción al vaciarse la bodega', () => {
  const out = createAircraftCommands();
  assert.equal(computeAircraftCommands({ elapsed: 0.5 }, pos, true, out).throttle, 1);
  assert.ok(computeAircraftCommands({ elapsed: TAKEOFF_POWER_S + 1 }, pos, true, out).throttle < 1);
  const empty = computeAircraftCommands({ elapsed: TAKEOFF_POWER_S + 1 }, pos, false, out).throttle;
  assert.ok(empty < 0.92);
});

test('director: la rampa sigue a la ocupación y el fuego va en ráfagas deterministas', () => {
  const out = createAircraftCommands();
  assert.equal(computeAircraftCommands({ elapsed: 10 }, pos, true, out).doorsOpen, true);
  assert.equal(computeAircraftCommands({ elapsed: 10 }, pos, false, out).doorsOpen, false);
  assert.equal(computeAircraftCommands({ elapsed: 1 }, pos, true, out).firing, false, 'periodo de gracia');
  assert.equal(computeAircraftCommands({ elapsed: FIRE_CYCLE_S + FIRE_WINDOW_START_S + 0.5 }, pos, true, out).firing, true);
  assert.equal(computeAircraftCommands({ elapsed: FIRE_CYCLE_S + 1 }, pos, true, out).firing, false);
});

test('director: apunta a estribor y por debajo; el CH-47 alterna de costado', () => {
  const out = createAircraftCommands();
  // yaw 0: avance +Z, estribor +X
  computeAircraftCommands({ elapsed: 5, yaw: 0, aircraftType: 'ac130' }, pos, true, out);
  assert.ok(out.aimX > pos.x + 50 && out.aimY < pos.y);
  computeAircraftCommands({ elapsed: FIRE_CYCLE_S + 5, yaw: 0, aircraftType: 'ac130' }, pos, true, out);
  assert.equal(out.aimSide, 1, 'el AC-130 solo dispara por estribor');
  computeAircraftCommands({ elapsed: FIRE_CYCLE_S + 5, yaw: 0, aircraftType: 'ch47' }, pos, true, out);
  assert.equal(out.aimSide, -1);
  assert.ok(out.aimX < pos.x - 50);
});

test('director: ocupación a partir del snapshot de jugadores', () => {
  assert.equal(isPlaneOccupied(null, PLAYER_STATE.PLANE), false);
  assert.equal(isPlaneOccupied({ a: { state: PLAYER_STATE.GROUND, alive: true } }, PLAYER_STATE.PLANE), false);
  assert.equal(isPlaneOccupied({ a: { state: PLAYER_STATE.PLANE, alive: false } }, PLAYER_STATE.PLANE), false);
  assert.equal(isPlaneOccupied({ a: { state: PLAYER_STATE.PLANE, alive: true } }, PLAYER_STATE.PLANE), true);
});
