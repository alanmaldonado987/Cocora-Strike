// Regresión: al deslizarse, la reconciliación con el servidor devolvía al jugador al punto de inicio del slide en
// cada snapshot ("me manda a un punto y se queda pegado"). Cliente y servidor simulan los MISMOS pasos; el servidor
// los recibe con 100 ms de retardo y envía snapshots a 20 Hz. Con entradas idénticas la corrección debe ser ~0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MAP_SEED,
  PLAYER_INPUT_BUTTONS,
  SIM_DT,
  generateCocoraMap,
  createPlayerKinematicState,
  stepPlayer
} from '../shared/mapData.js';
import { capturePredictionCarry, resimulateFromServer } from '../shared/physics/reconcile.js';

const map = generateCocoraMap(DEFAULT_MAP_SEED);
const PLAZA_X = 56;
const PLAZA_Z = 4;
const PLAZA_Y = map.getFloorBelowY(PLAZA_X, 40, PLAZA_Z);

const LAG_STEPS = 6; // 100 ms a 60 Hz
const SNAPSHOT_EVERY = 3; // 20 Hz

function snapshotOf(s, lastSeq) {
  return {
    x: s.x, y: s.y, z: s.z, vx: s.vx, vy: s.vy, vz: s.vz, yaw: s.yaw, pitch: s.pitch, onGround: s.onGround,
    state: s.state, moveMode: s.moveMode, animWalk: s.walkPhase, isSliding: s.isSliding, isCrouching: s.isCrouching,
    isSwimming: s.isSwimming, isHealing: false, equipped: s.equipped, jumpAltitude: s.jumpStartAltitude, lastSeq
  };
}

/**
 * Ejecuta una carrera con slide y devuelve la mayor corrección que habría aplicado el cliente.
 * @param {boolean} useAckCarry true = estado interno en lastSeq (arreglo); false = estado actual (bug antiguo)
 */
function runSlideSession(useAckCarry, { legacySlideMessage = false, legacyProbe = false } = {}) {
  const opts = { y: PLAZA_Y, x: PLAZA_X, z: PLAZA_Z, onGround: true };
  const client = createPlayerKinematicState(opts);
  const server = createPlayerKinematicState(opts);
  const probe = createPlayerKinematicState(opts);
  const sent = [];
  const unacked = [];
  let serverSeq = 0;
  let lastAckCarry = null;
  let maxErr = 0;
  let slid = false;

  for (let seq = 1; seq <= 150; seq++) {
    let buttons = PLAYER_INPUT_BUTTONS.SPRINT;
    // Pulsa deslizar (Ctrl = SLIDE | CROUCH) durante unos pasos tras coger velocidad
    if (seq >= 40 && seq < 46) buttons |= PLAYER_INPUT_BUTTONS.SLIDE | PLAYER_INPUT_BUTTONS.CROUCH;
    const cmd = { seq, moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons };
    const ev = stepPlayer(client, cmd, SIM_DT, map);
    if (ev.slideStarted) {
      slid = true;
      // Bug antiguo del servidor: el mensaje PLAYER_SLIDE llega antes que el lote de pasos y fuerza isSliding
      // fuera de la simulación (con dirección/velocidad/temporizador del slide anterior)
      if (legacySlideMessage) {
        server.isSliding = true;
        server.isCrouching = false;
      }
    }
    cmd.carry = capturePredictionCarry(client);
    sent.push(cmd);
    unacked.push(cmd);

    // El servidor procesa con retardo
    while (sent.length > LAG_STEPS) {
      const s = sent.shift();
      stepPlayer(server, s, SIM_DT, map);
      serverSeq = s.seq;
    }

    if (seq % SNAPSHOT_EVERY === 0 && serverSeq > 0) {
      while (unacked.length > 0 && unacked[0].seq <= serverSeq) lastAckCarry = unacked.shift().carry;
      const fallback = legacyProbe ? { ...client, prevJumpHeld: false, prevCrouchHeld: false, prevSlideHeld: false } : client;
      resimulateFromServer(probe, snapshotOf(server, serverSeq), useAckCarry ? lastAckCarry : null, fallback, unacked, map);
      const err = Math.hypot(client.x - probe.x, client.y - probe.y, client.z - probe.z);
      maxErr = Math.max(maxErr, err);
    }
  }
  return { maxErr, slid, finalGap: Math.hypot(client.x - server.x, client.z - server.z) };
}

test('reconciliación: con el estado interno de lastSeq, un slide no genera correcciones', () => {
  const { maxErr, slid } = runSlideSession(true);
  assert.ok(slid, 'el escenario debe iniciar un slide');
  assert.ok(maxErr < 0.02, `corrección máxima ${maxErr.toFixed(3)} m (debería ser ~0)`);
});

test('reconciliación: el código antiguo (mensaje PLAYER_SLIDE + temporizadores actuales) desincroniza el slide', () => {
  const { maxErr } = runSlideSession(false, { legacySlideMessage: true, legacyProbe: true });
  assert.ok(maxErr > 0.5, `el bug antiguo debía producir saltos grandes (fue ${maxErr.toFixed(3)} m)`);
});

test('reconciliación: cada causa por separado ya produce correcciones visibles', () => {
  // Forzar isSliding en el servidor fuera de la simulación (mensaje PLAYER_SLIDE)
  assert.ok(runSlideSession(false, { legacySlideMessage: true }).maxErr > 0.5);
  // Re-simular con los temporizadores actuales del cliente en vez de los de lastSeq
  assert.ok(runSlideSession(false, { legacyProbe: true }).maxErr > 0.2);
});
