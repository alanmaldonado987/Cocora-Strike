// Bloque 6A: API de control articulado de las aeronaves (setThrottle, setDoorsOpen, aimTurrets, setFiring)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildAC130Transport } from '../Modelos 3D/ac130Transport.js';
import { buildCH47Transport } from '../Modelos 3D/ch47Transport.js';
import { solveMountAim } from '../Modelos 3D/avionesShared.js';

function step(rig, seconds) {
  const n = Math.ceil(seconds / 0.05);
  for (let i = 0; i < n; i++) rig.update(0.05, { pitch: 0, roll: 0 });
}

const rigs = [buildAC130Transport(), buildCH47Transport()];

for (const rig of rigs) {
  test(`${rig.id}: expone la API de control articulado`, () => {
    for (const fn of ['setThrottle', 'setDoorsOpen', 'aimTurrets', 'setFiring', 'setInteriorLight', 'getState']) {
      assert.equal(typeof rig[fn], 'function', `${rig.id}: falta ${fn}()`);
    }
    assert.ok(rig.turrets.length >= 2, `${rig.id}: debe tener al menos dos afustes`);
  });

  test(`${rig.id}: setThrottle aplica inercia de RPM (no salta instantáneamente)`, () => {
    rig.setThrottle(0);
    const before = rig.getState().rpm;
    step(rig, 0.1);
    const mid = rig.getState().rpm;
    assert.ok(mid < before && mid > 0.3, `${rig.id}: la RPM debe caer gradualmente (${before} -> ${mid})`);
    step(rig, 8);
    assert.ok(rig.getState().rpm < 0.05, `${rig.id}: la RPM debe llegar casi a cero`);
    rig.setThrottle(1);
    step(rig, 6);
    assert.ok(rig.getState().rpm > 0.9, `${rig.id}: la RPM debe recuperarse con el acelerador`);
    rig.setThrottle(null);
  });

  test(`${rig.id}: setDoorsOpen cierra y abre la rampa suavemente`, () => {
    rig.setDoorsOpen(false);
    step(rig, 0.5);
    const partial = rig.getState().rampOpen;
    assert.ok(partial > 0 && partial < 1, `${rig.id}: la rampa debe interpolarse (${partial})`);
    step(rig, 4);
    assert.equal(rig.getState().rampOpen, 0);
    rig.setDoorsOpen(true);
    step(rig, 4);
    assert.equal(rig.getState().rampOpen, 1);
    rig.setDoorsOpen(null);
  });

  test(`${rig.id}: aimTurrets orienta cada afuste dentro de su arco de tiro`, () => {
    rig.group.updateMatrixWorld(true);
    const out = { pan: 0, tilt: 0 };
    for (const t of rig.turrets) {
      // Objetivo hacia el exterior del costado de cada afuste y por debajo de la aeronave
      const side = t.side ?? 1;
      const target = new THREE.Vector3(side * 60, -40, 5);
      rig.aimTurrets(target);
      step(rig, 3);
      assert.ok(solveMountAim(t.pan, target, side * (rig.id === 'ac130' ? Math.PI / 2 : 1.22), 2, -1, 1, out));
      assert.ok(Math.abs(t.pan.rotation.y - out.pan) < 0.05, `${rig.id}: pan no converge al objetivo`);
      assert.ok(t.tilt.rotation.x > 0, `${rig.id}: el objetivo bajo debe inclinar el cañón hacia abajo`);
    }
    // Objetivo directamente encima: el tilt queda limitado y nunca atraviesa el techo de la ventana
    rig.aimTurrets(new THREE.Vector3(0, 5000, 0));
    step(rig, 3);
    for (const t of rig.turrets) assert.ok(t.tilt.rotation.x >= -0.31, `${rig.id}: tilt fuera de límite`);
    rig.aimTurrets(null);
  });

  test(`${rig.id}: setFiring acelera cañones rotativos, produce retroceso y se detiene al soltar`, () => {
    rig.setFiring(false);
    step(rig, 6);
    for (const t of rig.turrets) {
      if (t.spinCluster) assert.ok(t.spinRate < 1, `${rig.id}: los cañones deben detenerse`);
      assert.equal(t.flash.visible, false, `${rig.id}: sin fogonazo sin disparar`);
    }
    rig.setFiring(true);
    let maxRecoil = 0;
    for (let i = 0; i < 80; i++) {
      rig.update(0.05, null);
      for (const t of rig.turrets) maxRecoil = Math.max(maxRecoil, t.recoilOffset);
    }
    assert.ok(maxRecoil > 0.005, `${rig.id}: debe haber retroceso al disparar`);
    for (const t of rig.turrets) if (t.spinCluster) assert.ok(t.spinRate > 25, `${rig.id}: cañones en giro`);
    rig.setFiring(null);
  });
}
