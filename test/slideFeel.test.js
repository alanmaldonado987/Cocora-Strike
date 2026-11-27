import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIM_DT,
  SLIDE_FEEL_CONFIG,
  PLAYER_INPUT_BUTTONS,
  SpatialCollisionIndex,
  createPlayerKinematicState,
  stepPlayer
} from '../shared/mapData.js';

function createSlopeArena(slopeZ = 0) {
  const colliders = new SpatialCollisionIndex(8);
  // slopeZ > 0: terreno baja al avanzar hacia +Z (cuesta abajo); slopeZ < 0: sube al avanzar hacia +Z
  const groundFn = (_x, z) => 30.0 - z * slopeZ;
  return {
    colliders,
    windows: [],
    getTerrainHeightAt: groundFn,
    getGroundHeightAt: groundFn,
    getFloorBelowY(wx, _wy, wz) {
      return groundFn(wx, wz);
    },
    isInWater() {
      return false;
    }
  };
}

function sprintUpToSpeed(state, arena, steps = 18) {
  for (let i = 0; i < steps; i++) {
    stepPlayer(state, { moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: PLAYER_INPUT_BUTTONS.SPRINT }, SIM_DT, arena);
  }
}

test('slide: exige velocidad de carrera para activarse, inyecta impulso inicial y transiciona suave a agachado al frenar', () => {
  const arena = createSlopeArena(0); // terreno plano

  // Desde parado, pulsar SLIDE/CROUCH no lanza un slide artificial; alterna agachado normal
  const standing = createPlayerKinematicState({ x: 0, y: 30, z: 0, onGround: true });
  const evFromRest = stepPlayer(
    standing,
    { moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: PLAYER_INPUT_BUTTONS.SPRINT | PLAYER_INPUT_BUTTONS.CROUCH },
    SIM_DT,
    arena
  );
  assert.equal(evFromRest.slideStarted, false, 'no inicia slide sin haber alcanzado velocidad de carrera');

  // Acelerar en carrera y luego agacharse -> inicia slide con impulso inicial > sprintSpeed
  const runner = createPlayerKinematicState({ x: 0, y: 30, z: 0, onGround: true });
  sprintUpToSpeed(runner, arena, 18);
  const runSpeed = Math.hypot(runner.vx, runner.vz);
  assert.ok(runSpeed >= SLIDE_FEEL_CONFIG.minEntrySpeed);

  const evStart = stepPlayer(
    runner,
    { moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: PLAYER_INPUT_BUTTONS.SPRINT | PLAYER_INPUT_BUTTONS.SLIDE },
    SIM_DT,
    arena
  );
  assert.equal(evStart.slideStarted, true, 'inicia slide en carrera');
  assert.equal(runner.isSliding, true);
  const boostSpeed = Math.hypot(runner.vx, runner.vz);
  assert.ok(boostSpeed > runSpeed + 2.5, `impulso inicial efectivo (${boostSpeed} > ${runSpeed})`);

  // Dejar correr el slide en plano hasta que pierda velocidad -> debe pasar a isCrouching=true sin tirón
  let endedToCrouch = false;
  let speedRightBeforeEnd = 0;
  let speedRightAfterEnd = 0;
  for (let i = 0; i < 90; i++) {
    const preSpd = Math.hypot(runner.vx, runner.vz);
    const ev = stepPlayer(runner, { moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: 0 }, SIM_DT, arena);
    if (ev.slideEnded) {
      endedToCrouch = ev.slideEndedToCrouch;
      speedRightBeforeEnd = preSpd;
      speedRightAfterEnd = Math.hypot(runner.vx, runner.vz);
      break;
    }
  }

  assert.equal(endedToCrouch, true, 'al perder velocidad el slide transiciona a estado agachado');
  assert.equal(runner.isSliding, false);
  assert.equal(runner.isCrouching, true);
  assert.ok(Math.abs(speedRightAfterEnd - speedRightBeforeEnd) < 0.6, 'transición de velocidad continua sin corte brusco');
});

test('slide: desacelera más rápido cuesta arriba y gana/mantiene velocidad cuesta abajo', () => {
  const flatArena = createSlopeArena(0);
  const uphillArena = createSlopeArena(-0.28);   // +28% subida
  const downhillArena = createSlopeArena(0.42);  // -42% bajada

  const pFlat = createPlayerKinematicState({ x: 0, y: 30, z: 0, onGround: true });
  const pUp = createPlayerKinematicState({ x: 0, y: 30, z: 0, onGround: true });
  const pDown = createPlayerKinematicState({ x: 0, y: 30, z: 0, onGround: true });

  sprintUpToSpeed(pFlat, flatArena, 20);
  sprintUpToSpeed(pUp, uphillArena, 20);
  sprintUpToSpeed(pDown, downhillArena, 20);

  const slideCmd = { moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: PLAYER_INPUT_BUTTONS.SPRINT | PLAYER_INPUT_BUTTONS.SLIDE };
  stepPlayer(pFlat, slideCmd, SIM_DT, flatArena);
  stepPlayer(pUp, slideCmd, SIM_DT, uphillArena);
  stepPlayer(pDown, slideCmd, SIM_DT, downhillArena);

  // Simular 0.45 s de deslizamiento en las tres pendientes
  const holdCmd = { moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: 0 };
  for (let i = 0; i < 27; i++) {
    stepPlayer(pFlat, holdCmd, SIM_DT, flatArena);
    stepPlayer(pUp, holdCmd, SIM_DT, uphillArena);
    stepPlayer(pDown, holdCmd, SIM_DT, downhillArena);
  }

  const vFlat = Math.hypot(pFlat.vx, pFlat.vz);
  const vUp = Math.hypot(pUp.vx, pUp.vz);
  const vDown = Math.hypot(pDown.vx, pDown.vz);

  assert.ok(vDown > vFlat + 2.0, `cuesta abajo mantiene/gana mucha más velocidad (${vDown} vs ${vFlat})`);
  assert.ok(vFlat > vUp + 1.0, `cuesta arriba frena mucho antes que en plano (${vUp} vs ${vFlat})`);
  assert.ok(vDown <= SLIDE_FEEL_CONFIG.maxDownhillSpeed + 0.05);
});
