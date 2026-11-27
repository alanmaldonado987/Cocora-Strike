import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MAP_SEED,
  SIM_DT,
  MOVEMENT_CONFIG,
  PLAYER_INPUT_BUTTONS,
  generateCocoraMap,
  createPlayerKinematicState,
  stepPlayer
} from '../shared/mapData.js';
import { GameRoom } from '../server/gameRoom.js';

const map = generateCocoraMap(DEFAULT_MAP_SEED);

// Explanada nivelada de la Plaza de Salento (56, 4) para pruebas cinemáticas limpias
const PLAZA_X = 56;
const PLAZA_Z = 4;
const PLAZA_Y = map.getFloorBelowY(PLAZA_X, 40, PLAZA_Z);

test('stepPlayer: aceleración progresiva en suelo alcanza velocidad exacta sin salto instantáneo', () => {
  const st = createPlayerKinematicState({
    x: PLAZA_X,
    y: PLAZA_Y,
    z: PLAZA_Z,
    onGround: true,
    state: 'ground'
  });

  // En el primer tick (16.67 ms) la velocidad crece progresivamente pero aún está lejos del tope
  stepPlayer(st, { moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: 0 }, SIM_DT, map);
  const firstFrameSpeed = Math.hypot(st.vx, st.vz);
  assert.ok(firstFrameSpeed > 0.5 && firstFrameSpeed < MOVEMENT_CONFIG.walkSpeed * 0.45, `v inicial=${firstFrameSpeed}`);

  // Tras ~0.25 s sosteniendo dirección, converge a walkSpeed exacto (5.5 m/s * moveSpeedMult 1.04 de fists)
  for (let i = 0; i < 20; i++) {
    stepPlayer(st, { moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: 0 }, SIM_DT, map);
  }
  const expectedWalk = MOVEMENT_CONFIG.walkSpeed * 1.04;
  assert.ok(Math.abs(Math.hypot(st.vx, st.vz) - expectedWalk) < 0.02, `v estabilizada=${Math.hypot(st.vx, st.vz)}`);
});

test('stepPlayer: fricción progresiva en suelo desacelera suavemente hasta detenerse', () => {
  const st = createPlayerKinematicState({
    x: PLAZA_X,
    y: PLAZA_Y,
    z: PLAZA_Z,
    vx: 0,
    vz: 8.2,
    onGround: true,
    state: 'ground'
  });

  stepPlayer(st, { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: 0 }, SIM_DT, map);
  const afterOneTick = Math.hypot(st.vx, st.vz);
  assert.ok(afterOneTick > 6.0 && afterOneTick < 8.2, `no frena en seco en 1 tick: ${afterOneTick}`);

  for (let i = 0; i < 35; i++) {
    stepPlayer(st, { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: 0 }, SIM_DT, map);
  }
  assert.equal(Math.hypot(st.vx, st.vz), 0, 'se detiene completamente por debajo de stopSpeed');
});

test('stepPlayer: conserva el impulso horizontal al saltar y limita la aceleración aérea', () => {
  const st = createPlayerKinematicState({
    x: PLAZA_X,
    y: PLAZA_Y,
    z: PLAZA_Z,
    onGround: true,
    state: 'ground'
  });

  // Acelerar a sprint completo
  for (let i = 0; i < 20; i++) {
    stepPlayer(st, { moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: PLAYER_INPUT_BUTTONS.SPRINT }, SIM_DT, map);
  }
  const preJumpSpeed = Math.hypot(st.vx, st.vz);
  assert.ok(preJumpSpeed > 8.0);

  // Saltar manteniendo sprint: conserva impulso horizontal en el aire
  const evJump = stepPlayer(
    st,
    { moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: PLAYER_INPUT_BUTTONS.SPRINT | PLAYER_INPUT_BUTTONS.JUMP },
    SIM_DT,
    map
  );
  assert.equal(evJump.jumped, true);
  assert.equal(st.onGround, false);

  for (let i = 0; i < 10; i++) {
    stepPlayer(st, { moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: PLAYER_INPUT_BUTTONS.SPRINT }, SIM_DT, map);
  }
  const midAirSpeed = Math.hypot(st.vx, st.vz);
  assert.ok(midAirSpeed > preJumpSpeed * 0.9, `conserva >90% del impulso en el aire (${midAirSpeed} vs ${preJumpSpeed})`);
  assert.ok(midAirSpeed <= preJumpSpeed + 0.05, 'no gana velocidad infinita en el aire');

  // Salto desde parado intentando acelerar en el aire: control aéreo más lento que en suelo
  const airFromRest = createPlayerKinematicState({
    x: PLAZA_X,
    y: PLAZA_Y + 3.0,
    z: PLAZA_Z,
    onGround: false,
    vy: 2.0,
    state: 'ground'
  });
  stepPlayer(airFromRest, { moveX: 1, moveZ: 0, yaw: 0, pitch: 0, buttons: 0 }, SIM_DT, map);
  assert.ok(Math.abs(airFromRest.vx - MOVEMENT_CONFIG.airAccel * SIM_DT) < 0.02);
});

test('stepPlayer: cliente y servidor convergen con 0.000m de desincronización bajo secuencia idéntica', () => {
  const io = { emit() {}, to() { return io; } };
  const room = new GameRoom(io);
  clearInterval(room.tickInterval);
  room.phase = 'playing';

  const serverPlayer = room.createFreshParticipant('p1', 'LocalTest');
  Object.assign(serverPlayer, {
    alive: true,
    state: 'ground',
    x: PLAZA_X,
    y: PLAZA_Y,
    z: PLAZA_Z,
    onGround: true,
    airPeakY: PLAZA_Y,
    fallPeakY: PLAZA_Y
  });
  room.players.set('p1', serverPlayer);

  const clientState = createPlayerKinematicState({
    x: PLAZA_X,
    y: PLAZA_Y,
    z: PLAZA_Z,
    onGround: true,
    airPeakY: PLAZA_Y,
    state: 'ground'
  });

  const batch = [];
  for (let seq = 1; seq <= 45; seq++) {
    const buttons =
      seq === 18
        ? PLAYER_INPUT_BUTTONS.SPRINT | PLAYER_INPUT_BUTTONS.JUMP
        : seq < 32
        ? PLAYER_INPUT_BUTTONS.SPRINT
        : 0;
    const cmd = {
      seq,
      moveX: Math.cos(seq * 0.06),
      moveZ: Math.sin(seq * 0.06),
      yaw: seq * 0.04,
      pitch: -0.1,
      buttons
    };
    stepPlayer(clientState, cmd, SIM_DT, room.map);
    batch.push(cmd);
    if (batch.length === 3) {
      room.handlePlayerInput('p1', { yaw: cmd.yaw, pitch: cmd.pitch, steps: batch.splice(0, batch.length) });
    }
  }

  const desync = Math.hypot(
    clientState.x - serverPlayer.x,
    clientState.y - serverPlayer.y,
    clientState.z - serverPlayer.z
  );
  assert.ok(desync < 1e-6, `desincronización cliente-servidor debe ser 0, actual=${desync}`);
});
