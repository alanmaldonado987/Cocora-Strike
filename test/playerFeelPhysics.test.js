import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIM_DT,
  MOVEMENT_CONFIG,
  PLAYER_INPUT_BUTTONS,
  PLAYER_RADIUS,
  PLAYER_HEIGHT,
  SpatialCollisionIndex,
  createPlayerKinematicState,
  stepPlayer
} from '../shared/mapData.js';

// Entorno sintético controlado para validar al milímetro escalones, bordes, pendientes y techos
function createTestArena({ groundFn = () => 10.0 } = {}) {
  const colliders = new SpatialCollisionIndex(8);
  return {
    colliders,
    windows: [],
    getTerrainHeightAt(x, z) {
      return groundFn(x, z);
    },
    getGroundHeightAt(x, z) {
      return groundFn(x, z);
    },
    getFloorBelowY(wx, wy, wz) {
      let bestY = groundFn(wx, wz);
      const near = colliders.queryNear(wx, wz, 0.9);
      for (let i = 0; i < near.length; i++) {
        const c = near[i];
        if (c.enabled === false || !c.walkableTop) continue;
        if (wx >= c.minX - 0.12 && wx <= c.maxX + 0.12 && wz >= c.minZ - 0.12 && wz >= c.maxZ + 0.12) {
          if (c.maxY <= wy + 1.05 && c.maxY > bestY) {
            bestY = c.maxY;
          }
        }
      }
      return bestY;
    },
    isInWater() {
      return false;
    }
  };
}

test('coyote time: permite saltar dentro de 100 ms tras caer de una cornisa y bloquea pasado el umbral', () => {
  // Plataforma alta en z <= 0 (y = 14m) y caída vertical en z > 0 (y = 10m)
  const arena = createTestArena({ groundFn: (_x, z) => (z <= 0 ? 14.0 : 10.0) });

  const pOk = createPlayerKinematicState({
    x: 0,
    y: 14.0,
    z: -0.05,
    vx: 0,
    vz: 6.0,
    onGround: true
  });

  // Paso 1: cruza el borde z > 0 y queda en el aire
  stepPlayer(pOk, { moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: 0 }, SIM_DT, arena);
  assert.equal(pOk.onGround, false, 'debe haber abandonado la plataforma');

  // Avanzar ~66 ms en el aire (< 100 ms de coyoteTimeSec) y pulsar salto
  for (let i = 0; i < 3; i++) {
    stepPlayer(pOk, { moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: 0 }, SIM_DT, arena);
  }
  const evCoyote = stepPlayer(
    pOk,
    { moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: PLAYER_INPUT_BUTTONS.JUMP },
    SIM_DT,
    arena
  );
  assert.equal(evCoyote.jumped, true, 'debe permitir el salto por coyote time');
  const expectedPostTickVy = MOVEMENT_CONFIG.jumpVelocity - MOVEMENT_CONFIG.gravity * SIM_DT;
  assert.ok(Math.abs(pOk.vy - expectedPostTickVy) < 1e-4, `vy tras 1 tick=${pOk.vy}`);

  // Imposible hacer doble salto tras consumir coyote time
  stepPlayer(pOk, { moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: 0 }, SIM_DT, arena);
  const evDouble = stepPlayer(
    pOk,
    { moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: PLAYER_INPUT_BUTTONS.JUMP },
    SIM_DT,
    arena
  );
  assert.equal(evDouble.jumped, false, 'no permite doble salto');

  // Caso expirado: esperar > 130 ms en el aire antes de pulsar salto
  const pLate = createPlayerKinematicState({
    x: 0,
    y: 14.0,
    z: -0.05,
    vx: 0,
    vz: 6.0,
    onGround: true
  });
  for (let i = 0; i < 9; i++) {
    stepPlayer(pLate, { moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: 0 }, SIM_DT, arena);
  }
  assert.equal(pLate.coyoteTimer, 0);
  const evLate = stepPlayer(
    pLate,
    { moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: PLAYER_INPUT_BUTTONS.JUMP },
    SIM_DT,
    arena
  );
  assert.equal(evLate.jumped, false, 'pasados 100 ms no dispara salto en el aire');
});

test('jump buffering: registra salto pulsado <= 120 ms antes de tocar suelo y lo ejecuta al aterrizar', () => {
  const arena = createTestArena({ groundFn: () => 10.0 });

  // Jugador cayendo a ~0.42 m del suelo con vy = -6 m/s (aterriza en ~70 ms < 120 ms)
  const p = createPlayerKinematicState({
    x: 0,
    y: 10.42,
    z: 0,
    vx: 0,
    vz: 5.0,
    vy: -6.0,
    onGround: false
  });

  // Pulsa y suelta salto en el aire ~70 ms antes de tocar tierra
  const evPress = stepPlayer(
    p,
    { moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: PLAYER_INPUT_BUTTONS.JUMP },
    SIM_DT,
    arena
  );
  assert.equal(evPress.jumped, false, 'aún está en el aire al pulsar');
  assert.ok(p.jumpBufferTimer > 0, 'jumpBufferTimer queda armado');

  let jumpedOnTouchdown = false;
  for (let i = 0; i < 6; i++) {
    const ev = stepPlayer(p, { moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: 0 }, SIM_DT, arena);
    if (ev.jumped) {
      jumpedOnTouchdown = true;
      break;
    }
  }
  assert.equal(jumpedOnTouchdown, true, 'ejecuta el salto automáticamente al tocar el suelo');
  assert.ok(p.vy > 7.0);
});

test('stepUp: sube automáticamente escalones de hasta 0.45 m y bloquea muros > 0.45 m o sin techo libre', () => {
  const arena = createTestArena({ groundFn: () => 10.0 });
  // Escalón sólido de 0.42 m (<= 0.45 m) en z = [1.0, 4.0]
  arena.colliders.addBox(-3, 3, 10.0, 10.42, 1.0, 4.0, false, 'step_curb');

  const p = createPlayerKinematicState({
    x: 0,
    y: 10.0,
    z: 0.3,
    onGround: true
  });

  let climbed = false;
  for (let i = 0; i < 25; i++) {
    const ev = stepPlayer(p, { moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: 0 }, SIM_DT, arena);
    if (ev.stepUpDeltaY > 0.3) climbed = true;
  }
  assert.equal(climbed, true, 'subió automáticamente el escalón de 0.42 m');
  assert.ok(Math.abs(p.y - 10.42) < 0.03, `altura final sobre el escalón=${p.y}`);
  assert.ok(p.z > 1.2, `avanzó sobre el escalón z=${p.z}`);

  // Muro de 0.65 m (> 0.45 m): NO debe subirlo automáticamente con stepUp
  const arenaTall = createTestArena({ groundFn: () => 10.0 });
  arenaTall.colliders.addBox(-3, 3, 10.0, 10.65, 1.0, 4.0, false, 'low_wall');
  const pBlocked = createPlayerKinematicState({ x: 0, y: 10.0, z: 0.3, onGround: true });
  for (let i = 0; i < 25; i++) {
    stepPlayer(pBlocked, { moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: 0 }, SIM_DT, arenaTall);
  }
  assert.ok(pBlocked.y < 10.1, 'no sube obstáculos mayores a 0.45 m');
  assert.ok(pBlocked.z <= 1.0 - PLAYER_RADIUS + 0.03, 'queda detenido frente al muro');

  // Escalón de 0.40 m pero con techo bajo que impide caber erguido (10.40 + 1.80 > 11.95)
  const arenaLowCeiling = createTestArena({ groundFn: () => 10.0 });
  arenaLowCeiling.colliders.addBox(-3, 3, 10.0, 10.40, 1.0, 4.0, true, 'step_curb');
  arenaLowCeiling.colliders.addBox(-3, 3, 11.95, 12.50, 0.9, 4.0, false, 'ceiling');
  const pCeil = createPlayerKinematicState({ x: 0, y: 10.0, z: 0.3, onGround: true });
  for (let i = 0; i < 20; i++) {
    stepPlayer(pCeil, { moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: 0 }, SIM_DT, arenaLowCeiling);
  }
  assert.ok(pCeil.y < 10.05 + (PLAYER_HEIGHT * 0), 'no sube escalón si la cabeza chocaría contra el techo');
});

test('snapToGround: mantiene onGround=true sin rebotes al bajar pendientes pronunciadas en sprint', () => {
  // Rampa descendente continua de 35% (baja 0.35 m por cada metro en +Z)
  const arena = createTestArena({
    groundFn: (_x, z) => (z <= 0 ? 20.0 : Math.max(5.0, 20.0 - z * 0.35))
  });

  const p = createPlayerKinematicState({
    x: 0,
    y: 20.0,
    z: -1.0,
    onGround: true
  });

  let lostGroundFrames = 0;
  for (let i = 0; i < 90; i++) {
    stepPlayer(p, { moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: PLAYER_INPUT_BUTTONS.SPRINT }, SIM_DT, arena);
    if (!p.onGround) lostGroundFrames++;
  }

  assert.equal(lostGroundFrames, 0, `cero frames despegado bajando rampa (actual=${lostGroundFrames})`);
  assert.ok(p.z > 8.0 && p.y < 17.5, 'descendió por la rampa pegado al suelo');
});
