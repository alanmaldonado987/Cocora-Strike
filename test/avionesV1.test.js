import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  CABIN_DISEMBARK_MS,
  DEFAULT_MAP_SEED,
  generateCocoraMap
} from '../shared/mapData.js';
import { buildAC130Transport } from '../Modelos 3D/ac130Transport.js';
import { buildCH47Transport } from '../Modelos 3D/ch47Transport.js';
import { buildAH64ApacheWreckSite } from '../Modelos 3D/ah64Wreck.js';
import {
  isSharedAircraftGeometry,
  isSharedAircraftMaterial
} from '../Modelos 3D/avionesShared.js';
import { GameRoom } from '../server/gameRoom.js';

function assertValidAircraftHierarchy(root, label) {
  let meshCount = 0;
  let glassFound = false;
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    meshCount++;
    const pos = obj.geometry.attributes.position;
    assert.ok(pos && pos.count > 0, `${label}: malla vacía`);
    assert.ok(
      Number.isFinite(pos.getX(0)) && Number.isFinite(pos.getY(0)) && Number.isFinite(pos.getZ(0)),
      `${label}: coordenadas NaN`
    );
    if (obj.material && obj.material.transparent && Math.abs(obj.material.opacity - 0.35) < 0.02) {
      assert.equal(obj.material.depthWrite, false, `${label}: cristal de cabina debe tener depthWrite=false`);
      glassFound = true;
    }
    assert.equal(isSharedAircraftGeometry(obj.geometry), true, `${label}: geometría debe registrarse en caché`);
    assert.equal(isSharedAircraftMaterial(obj.material), true, `${label}: material debe registrarse en caché`);
  });
  assert.ok(meshCount >= 10, `${label}: mallas insuficientes (${meshCount})`);
  assert.equal(glassFound, true, `${label}: debe incluir cristal semitransparente (opacity 0.35)`);
}

test('Aviones v1: AC-130J y CH-47F construyen cabina, bodega, pistones y secuencia de desembarco', () => {
  const ac130 = buildAC130Transport();
  const ch47 = buildCH47Transport();

  assertValidAircraftHierarchy(ac130.group, 'AC-130J');
  assertValidAircraftHierarchy(ch47.group, 'CH-47F');

  for (const rig of [ac130, ch47]) {
    assert.ok(rig.cabinBayGroup instanceof THREE.Group, `${rig.id}: falta cabinBayGroup`);
    assert.equal(rig.cabinBayGroup.parent, rig.group, `${rig.id}: cabinBayGroup debe ser hijo directo de la aeronave`);

    const pSit = rig.sampleDisembarkLocalPose(0, 0.0);
    const pStand = rig.sampleDisembarkLocalPose(0, 0.12);
    const pWalk = rig.sampleDisembarkLocalPose(0, 0.55);
    const pJump = rig.sampleDisembarkLocalPose(0, 0.95);

    assert.equal(pSit.phase, 'sit');
    assert.equal(pStand.phase, 'stand');
    assert.equal(pWalk.phase, 'walk_cabin');
    assert.equal(pJump.phase, 'ramp_jump');
    // El pasillo central está cerca de x = 0 y la salida retrocede hacia la rampa trasera (-Z)
    assert.ok(Math.abs(pWalk.x) < 0.35, `${rig.id}: walk_cabin debe ir por el pasillo central`);
    assert.ok(pJump.z < pWalk.z && pWalk.z < pSit.z, `${rig.id}: avance progresivo hacia la rampa trasera`);

    // Avanzar varios pasos de simulación para validar hélices/rotores, pistones y armamento sin errores
    for (let i = 0; i < 10; i++) {
      rig.update(0.05, { pitch: 0.01, roll: -0.02 });
    }
  }
});

test('Aviones v1: AH-64D Apache siniestrado construye secciones, fragmentos, fuegos y colliders alineados', () => {
  const map = generateCocoraMap(DEFAULT_MAP_SEED);
  assert.equal(map.helicopterWreck.modelId, 'ah64d');
  assert.equal(map.helicopterWreck.atmosphereRadius, 45.0);

  const structuresGroup = new THREE.Group();
  const anchors = [];
  const wreckCtrl = buildAH64ApacheWreckSite(
    map.helicopterWreck,
    structuresGroup,
    (_parent, color, intensity, distance) => anchors.push({ color, intensity, distance })
  );

  assert.ok(wreckCtrl);
  assert.equal(wreckCtrl.fireMeshes.length, 4);
  assert.ok(anchors.length >= 2);
  assertValidAircraftHierarchy(wreckCtrl.siteRoot, 'AH-64D Wreck');

  const rotBefore = wreckCtrl.rotorHead.rotation.y;
  wreckCtrl.update(0.1, 1.5);
  assert.ok(wreckCtrl.rotorHead.rotation.y > rotBefore, 'rotor dañado debe girar suavemente en update()');
});

test('Aviones v1: GameRoom alterna/selecciona aeronave y ejecuta secuencia sit -> stand -> walk_cabin -> ramp_jump -> skydiving', () => {
  const events = [];
  const io = {
    emit(ev, data) {
      events.push({ ev, data });
    },
    to() {
      return io;
    }
  };

  const room = new GameRoom(io);
  clearInterval(room.tickInterval);

  let fakeNow = 100000;
  const realNow = Date.now;
  Date.now = () => fakeNow;

  try {
    room.addHumanPlayer({ id: 'p1', emit() {} }, 'Piloto');
    room.configureBots({ botCount: 2, botDifficulty: 'easy', aircraftType: 'ch47' });
    room.startGame({ autoFillBots: false, botCount: 2, aircraftType: 'ch47' });

    assert.equal(room.plane.aircraftType, 'ch47');
    const p1 = room.players.get('p1');
    assert.equal(p1.state, 'plane');
    assert.equal(p1.moveMode, 'seated');

    // Al pulsar saltar, inicia la secuencia dentro de la bodega antes de desacoplarse
    room.handlePlayerJump('p1');
    assert.equal(p1.state, 'plane');
    assert.equal(p1.moveMode, 'stand');
    assert.ok(events.some((e) => e.ev === 'player_cabin_disembark' && e.data.playerId === 'p1'));

    fakeNow += Math.round(CABIN_DISEMBARK_MS * 0.55);
    room.tick();
    assert.equal(p1.state, 'plane');
    assert.equal(p1.moveMode, 'walk_cabin');

    fakeNow += Math.round(CABIN_DISEMBARK_MS * 0.35);
    room.tick();
    assert.equal(p1.state, 'plane');
    assert.equal(p1.moveMode, 'ramp_jump');

    fakeNow += Math.round(CABIN_DISEMBARK_MS * 0.20);
    room.tick();
    assert.equal(p1.state, 'skydiving');
    assert.ok(events.some((e) => e.ev === 'player_jumped' && e.data.playerId === 'p1'));
  } finally {
    Date.now = realNow;
  }
});
