import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, WEAPON_SLOTS, LOOT_TYPES } from '../shared/mapData.js';
import {
  createArmasV1WeaponMesh,
  isSharedArmasV1Geometry,
  isSharedArmasV1Material
} from '../Modelos 3D/armasV1.js';
import { GameRoom } from '../server/gameRoom.js';

test('Armas v1: catálogo completo de 7 armas de fuego configurado en slots y botín', () => {
  assert.deepEqual(WEAPON_SLOTS, [
    'pistol',
    'revolver',
    'shotgun',
    'smg',
    'assault_rifle',
    'rifle',
    'sniper'
  ]);

  for (const id of WEAPON_SLOTS) {
    assert.ok(WEAPONS[id], `Falta configuración de WEAPONS.${id}`);
    assert.ok(LOOT_TYPES[id], `Falta configuración de LOOT_TYPES.${id}`);
    assert.ok(WEAPONS[id].magSize > 0 && WEAPONS[id].damage > 0);
  }
});

test('Armas v1: construcción 3D, anclajes métricos y reutilización de caché GPU', () => {
  for (const id of WEAPON_SLOTS) {
    const meshA = createArmasV1WeaponMesh(id, 1.0);
    const meshB = createArmasV1WeaponMesh(id, 0.92);

    assert.ok(meshA.userData.muzzleTip, `${id}: falta muzzleTip`);
    assert.ok(meshA.userData.muzzleTip.position.z > 0.12, `${id}: muzzleTip debe apuntar hacia +Z`);
    assert.ok(meshA.userData.muzzleFlash && meshA.userData.muzzleFlash.visible === false, `${id}: muzzleFlash oculto por defecto`);
    assert.ok(meshA.userData.forendGripPos && Number.isFinite(meshA.userData.forendGripPos.z), `${id}: forendGripPos válido`);

    let subMeshCount = 0;
    meshA.traverse((child) => {
      if (!child.isMesh) return;
      subMeshCount++;
      const pos = child.geometry.attributes.position;
      assert.ok(pos && pos.count > 0, `${id}: geometría vacía`);
      assert.ok(Number.isFinite(pos.getX(0)) && Number.isFinite(pos.getY(0)) && Number.isFinite(pos.getZ(0)), `${id}: vértices NaN`);
      assert.equal(isSharedArmasV1Geometry(child.geometry), true, `${id}: geometría debe estar registrada en caché compartida`);
      assert.equal(isSharedArmasV1Material(child.material), true, `${id}: material debe estar registrado en caché compartida`);
    });
    assert.ok(subMeshCount >= 3, `${id}: se esperaban mallas horneadas por material`);

    // Verificar que la segunda instancia reutiliza exactamente el mismo BufferGeometry estático
    const firstMeshA = meshA.children.find((c) => c.isMesh);
    const firstMeshB = meshB.children.find((c) => c.isMesh);
    assert.equal(firstMeshA.geometry, firstMeshB.geometry, `${id}: instancias deben compartir BufferGeometry`);
  }
});

test('Armas v1: servidor autoritativo permite recoger, equipar y disparar revólver y rifle M4-T', () => {
  const events = [];
  const fakeIo = {
    emit(ev, payload) {
      events.push({ ev, payload });
    },
    to() {
      return { emit() {} };
    }
  };

  const room = new GameRoom(fakeIo);
  try {
    room.addHumanPlayer({ id: 'p1', emit() {} }, 'Tester');
    room.startGame({ autoFillBots: true, botCount: 1, botDifficulty: 'easy' });

    const p = room.players.get('p1');
    assert.ok(p);
    p.state = 'ground';
    p.onGround = true;
    p.x = 10;
    p.z = 10;
    p.y = room.map.getTerrainHeightAt(10, 10);

    const revLoot = room.createLootItem('revolver', p.x, p.y, p.z, false);
    const m4Loot = room.createLootItem('assault_rifle', p.x, p.y, p.z, false);
    assert.equal(room.applyLootToPlayer(p, revLoot), true);
    assert.equal(room.applyLootToPlayer(p, m4Loot), true);

    assert.equal(p.weapons.revolver.unlocked, true);
    assert.equal(p.weapons.revolver.mag, WEAPONS.revolver.magSize);
    assert.equal(p.weapons.assault_rifle.unlocked, true);
    assert.equal(p.weapons.assault_rifle.mag, WEAPONS.assault_rifle.magSize);

    room.handleSwitchWeapon('p1', 'revolver');
    assert.equal(p.equipped, 'revolver');
    room.handleShoot('p1', {
      origin: { x: p.x, y: p.y + 1.6, z: p.z },
      dir: { x: 0, y: 0, z: 1 },
      weapon: 'revolver'
    });
    assert.equal(p.weapons.revolver.mag, WEAPONS.revolver.magSize - 1);

    room.handleSwitchWeapon('p1', 'assault_rifle');
    assert.equal(p.equipped, 'assault_rifle');
    p.lastShotAt = 0;
    room.handleShoot('p1', {
      origin: { x: p.x, y: p.y + 1.6, z: p.z },
      dir: { x: 0, y: 0, z: 1 },
      weapon: 'assault_rifle'
    });
    assert.equal(p.weapons.assault_rifle.mag, WEAPONS.assault_rifle.magSize - 1);

    const shotEvents = events.filter((e) => e.ev === 'shot_fired');
    assert.equal(shotEvents.length, 2);
  } finally {
    clearInterval(room.tickInterval);
  }
});
