// test/playerZeroAlloc.test.js
// Tests unitarios de cero allocaciones por frame y cero recompilación de shaders en avatarPerf / player.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  prepareAvatarMaterialsForFade,
  applyAvatarOpacity,
  applyActiveWeaponVisibility,
  readMuzzleWorldPosition
} from '../client/js/player/avatarPerf.js';

test('prepareAvatarMaterialsForFade y applyAvatarOpacity nunca activan needsUpdate ni alternan transparent en combate', () => {
  const mats = [
    new THREE.MeshToonMaterial({ color: '#10b981' }),
    new THREE.MeshToonMaterial({ color: '#343942' })
  ];
  prepareAvatarMaterialsForFade(mats, true);
  assert.equal(mats[0].transparent, true);
  assert.equal(mats[0].depthWrite, true);

  let needsUpdateWrites = 0;
  let opacityWrites = 0;
  const trackedMats = mats.map((m) =>
    new Proxy(m, {
      set(target, prop, val) {
        if (prop === 'needsUpdate') needsUpdateWrites++;
        if (prop === 'opacity') opacityWrites++;
        if (prop === 'transparent') {
          throw new Error('No se debe mutar material.transparent en tiempo real');
        }
        target[prop] = val;
        return true;
      }
    })
  );

  const st = { lastAlpha: 1.0, hideWeaponInAds: false };
  const weaponMount = { visible: true };

  // Misma opacidad 1.0 durante 120 frames -> 0 escrituras de opacity y 0 needsUpdate
  for (let i = 0; i < 120; i++) {
    applyAvatarOpacity(st, trackedMats, weaponMount, false, 1.0, false);
  }
  assert.equal(opacityWrites, 0);
  assert.equal(needsUpdateWrites, 0);

  // Acercar cámara a 0.45 y luego volver a 1.0 -> actualiza solo opacity sin recompilar shader
  applyAvatarOpacity(st, trackedMats, weaponMount, false, 0.45, false);
  assert.equal(opacityWrites, 2);
  assert.equal(mats[0].opacity, 0.45);
  assert.equal(weaponMount.visible, true);

  applyAvatarOpacity(st, trackedMats, weaponMount, false, 0.15, false);
  assert.equal(weaponMount.visible, false);

  applyAvatarOpacity(st, trackedMats, weaponMount, false, 1.0, false);
  assert.equal(mats[0].opacity, 1.0);
  assert.equal(needsUpdateWrites, 0);
});

test('applyActiveWeaponVisibility retorna en O(1) sin allocaciones cuando el arma no cambia', () => {
  const weapons = {
    fists: { visible: true },
    pistol: { visible: false },
    rifle: { visible: false },
    sniper: { visible: false }
  };
  const keys = Object.keys(weapons);
  let visibleWrites = 0;
  for (const k of keys) {
    let v = weapons[k].visible;
    Object.defineProperty(weapons[k], 'visible', {
      get: () => v,
      set: (nv) => {
        visibleWrites++;
        v = nv;
      }
    });
  }

  let active = 'fists';
  for (let i = 0; i < 500; i++) {
    active = applyActiveWeaponVisibility(weapons, keys, active, 'fists');
  }
  assert.equal(visibleWrites, 0);
  assert.equal(active, 'fists');

  active = applyActiveWeaponVisibility(weapons, keys, active, 'rifle');
  assert.equal(active, 'rifle');
  assert.equal(weapons.rifle.visible, true);
  assert.equal(weapons.fists.visible, false);
  assert.equal(visibleWrites, keys.length);
});

test('readMuzzleWorldPosition reutiliza el mismo objeto de salida sin crear literales {x,y,z} por disparo', () => {
  const root = new THREE.Group();
  root.position.set(10, 2, -5);
  const rifle = new THREE.Group();
  const muzzleTip = new THREE.Object3D();
  muzzleTip.position.set(0, 0.1, 0.65);
  rifle.add(muzzleTip);
  rifle.userData.muzzleTip = muzzleTip;
  root.add(rifle);

  const weapons = { fists: new THREE.Group(), rifle };
  const tmpVec = new THREE.Vector3();
  const reusableOut = { x: 0, y: 0, z: 0 };
  const fallback = { x: 1, y: 2, z: 3 };

  const r1 = readMuzzleWorldPosition(root, weapons, 'rifle', tmpVec, reusableOut, fallback);
  assert.equal(r1, reusableOut);
  assert.ok(Math.abs(r1.x - 10) < 1e-6);
  assert.ok(Math.abs(r1.y - 2.1) < 1e-6);
  assert.ok(Math.abs(r1.z - -4.35) < 1e-6);

  root.position.set(-4, 5, 12);
  const r2 = readMuzzleWorldPosition(root, weapons, 'rifle', tmpVec, reusableOut, fallback);
  assert.equal(r2, r1, 'Debe reutilizar exactamente la misma instancia preasignada');
  assert.ok(Math.abs(r2.x - -4) < 1e-6);
  assert.ok(Math.abs(r2.y - 5.1) < 1e-6);
  assert.ok(Math.abs(r2.z - 12.65) < 1e-6);
});
