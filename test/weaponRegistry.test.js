// test/weaponRegistry.test.js
// El registro maestro de armas reproduce exactamente el inventario y la serialización que antes se escribían a mano.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WEAPONS,
  WEAPON_SLOTS,
  WEAPON_IDS,
  WEAPON_REGISTRY,
  createWeaponInventory,
  serializeUnlockedWeapons,
  applyUnlockedWeapons,
  getWeaponSpec,
  isWeaponId
} from '../shared/mapData.js';

const LEGACY_INVENTORY = {
  fists: { unlocked: true, mag: 0 },
  pistol: { unlocked: false, mag: 0 },
  revolver: { unlocked: false, mag: 0 },
  shotgun: { unlocked: false, mag: 0 },
  smg: { unlocked: false, mag: 0 },
  assault_rifle: { unlocked: false, mag: 0 },
  rifle: { unlocked: false, mag: 0 },
  sniper: { unlocked: false, mag: 0 }
};

test('armas: el inventario inicial es idéntico (incluido el orden de claves) y siempre nuevo', () => {
  const a = createWeaponInventory();
  assert.deepEqual(a, LEGACY_INVENTORY);
  assert.deepEqual(Object.keys(a), Object.keys(LEGACY_INVENTORY));
  const b = createWeaponInventory();
  a.pistol.unlocked = true;
  assert.equal(b.pistol.unlocked, false, 'cada jugador recibe su propio objeto');
});

test('armas: registro alineado con WEAPONS y WEAPON_SLOTS', () => {
  assert.deepEqual(WEAPON_IDS, ['fists', ...WEAPON_SLOTS]);
  assert.ok(Object.isFrozen(WEAPON_REGISTRY));
  for (const entry of WEAPON_REGISTRY) {
    assert.equal(entry.spec, WEAPONS[entry.id]);
    assert.equal(WEAPON_IDS[entry.slot], entry.id);
  }
  assert.equal(getWeaponSpec('no_existe'), WEAPONS.fists);
  assert.equal(isWeaponId('sniper'), true);
  assert.equal(isWeaponId('bazooka'), false);
});

test('armas: serialización de desbloqueadas ida y vuelta', () => {
  const server = createWeaponInventory();
  server.smg.unlocked = true;
  server.sniper.unlocked = true;
  const wire = serializeUnlockedWeapons(server);
  assert.deepEqual(wire, { pistol: false, revolver: false, shotgun: false, smg: true, assault_rifle: false, rifle: false, sniper: true });
  const client = createWeaponInventory();
  applyUnlockedWeapons(client, wire);
  assert.deepEqual(client, server);
});
