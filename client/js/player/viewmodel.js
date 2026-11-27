// client/js/player/viewmodel.js
// Arma y brazos en primera persona (viewmodel) con escena y cámara propias: balanceo, retroceso, ADS y fogonazo.
// renderViewmodel se mezcla en LocalPlayerController.prototype.

import * as THREE from 'three';
import { damp } from '/shared/mapData.js';
import { applyActiveWeaponVisibility } from './avatarPerf.js';
import { createDetailedWeaponMesh } from './weapons.js';

// Vectores temporales reutilizables a nivel de módulo (CERO new THREE.Vector3 en animate / updateCamera / disparos)
const _fpHipPos = new THREE.Vector3();
const _fpAdsPos = new THREE.Vector3();
const _fpPos = new THREE.Vector3();

// ==================== RIG VIEWMODEL EN 1RA PERSONA CON SOPORTE PARA LAS 5 ARMAS ====================
export class FirstPersonWeaponRig {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.04, 10);

    this.scene.add(new THREE.HemisphereLight('#eef8ff', '#3a5a40', 1.05));
    const keyLight = new THREE.DirectionalLight('#fff5db', 1.45);
    keyLight.position.set(2.2, 3.8, 2.5);
    this.scene.add(keyLight);

    this.flashLight = new THREE.PointLight('#fbbf24', 0, 3.2);
    this.flashLight.position.set(0.2, -0.1, -0.8);
    this.scene.add(this.flashLight);

    this.pivot = new THREE.Group();
    this.scene.add(this.camera);
    this.camera.add(this.pivot);

    this.models = {
      fists: this.buildArmedRig('fists'),
      pistol: this.buildArmedRig('pistol'),
      revolver: this.buildArmedRig('revolver'),
      shotgun: this.buildArmedRig('shotgun'),
      smg: this.buildArmedRig('smg'),
      assault_rifle: this.buildArmedRig('assault_rifle'),
      rifle: this.buildArmedRig('rifle'),
      sniper: this.buildArmedRig('sniper')
    };
    this.modelKeys = Object.keys(this.models);
    for (let i = 0; i < this.modelKeys.length; i++) {
      const k = this.modelKeys[i];
      const m = this.models[k];
      m.visible = k === 'fists';
      this.pivot.add(m);
    }

    this.currentWeapon = 'fists';
    this.adsBlend = 0;
    this.sprintBlend = 0;
    this.slideBlend = 0;
    this.equipBlend = 1;
    this.swayX = 0;
    this.swayY = 0;
    this.bobTime = 0;
    this.recoilZ = 0;
    this.recoilPitch = 0;
    this.meleeProgress = 0;
    this.flashTimer = 0;
    this.setWeapon('fists', true);
  }

  buildArmedRig(weaponId) {
    const holder = new THREE.Group();
    const weapon = createDetailedWeaponMesh(weaponId, 1.15);
    weapon.rotation.y = Math.PI;
    holder.add(weapon);

    const skinMat = new THREE.MeshStandardMaterial({ color: '#eab68c', roughness: 0.65 });
    const cuffMat = new THREE.MeshStandardMaterial({ color: '#10b981', roughness: 0.7 });

    const makeForearm = () => {
      const g = new THREE.Group();
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.24, 10), cuffMat);
      sleeve.rotation.x = Math.PI / 2;
      sleeve.position.z = 0.16;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 8), skinMat);
      hand.position.z = 0.01;
      g.add(sleeve, hand);
      g.userData.sleeve = sleeve;
      return g;
    };

    const rightArm = makeForearm();
    const leftArm = makeForearm();
    if (weaponId === 'fists') {
      rightArm.position.set(0.02, -0.05, 0.02);
      rightArm.rotation.set(0.28, -0.14, 0.08);
      leftArm.visible = false;
    } else if (weaponId === 'pistol' || weaponId === 'revolver') {
      rightArm.position.set(0.015, -0.09, 0.04);
      rightArm.rotation.set(0.22, -0.06, 0);
      leftArm.position.set(-0.04, -0.095, 0.03);
      leftArm.rotation.set(0.24, 0.28, -0.08);
    } else {
      const fg = weapon.userData.forendGripPos;
      rightArm.position.set(0.015, -0.085, 0.06);
      rightArm.rotation.set(0.2, -0.05, 0);
      leftArm.position.set(-0.042, fg ? fg.y * 1.15 - 0.026 : -0.045, fg ? -fg.z * 1.15 : -0.26);
      leftArm.rotation.set(0.14, 0.36, -0.15);
    }

    holder.add(rightArm, leftArm);
    holder.userData.weaponMesh = weapon;
    holder.userData.rightArm = rightArm;
    holder.userData.leftArm = leftArm;
    return holder;
  }

  setShirtColor(hex) {
    for (const m of Object.values(this.models)) {
      m.userData.rightArm.userData.sleeve.material.color.set(hex);
      m.userData.leftArm.userData.sleeve.material.color.set(hex);
    }
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  setWeapon(weaponId, instant = false) {
    const key = this.models[weaponId] ? weaponId : 'fists';
    if (this.currentWeapon === key) return;
    if (!instant) this.equipBlend = 0;
    this.currentWeapon = applyActiveWeaponVisibility(this.models, this.modelKeys, this.currentWeapon, key);
  }

  addMouseSway(dx, dy) {
    this.swayX = Math.max(-0.04, Math.min(0.04, this.swayX - dx * 0.00014));
    this.swayY = Math.max(-0.035, Math.min(0.035, this.swayY + dy * 0.00014));
  }

  triggerFire(weaponId) {
    if (weaponId === 'fists') {
      this.meleeProgress = 0.001;
      return;
    }
    const recoilScale =
      weaponId === 'shotgun' || weaponId === 'sniper'
        ? 0.085
        : weaponId === 'revolver'
        ? 0.068
        : weaponId === 'smg'
        ? 0.032
        : weaponId === 'assault_rifle'
        ? 0.042
        : 0.05;
    this.recoilZ = Math.min(0.12, this.recoilZ + recoilScale);
    this.recoilPitch = Math.min(0.22, this.recoilPitch + recoilScale * 1.1);
    this.flashTimer = 0.05;
  }

  update(dt, info) {
    // Ocultar modelo 3D cuando está en mira telescópica completa de francotirador
    const sniperScoped = this.currentWeapon === 'sniper' && info.aimingZoom && !info.reloading;
    this.pivot.visible = info.visible && info.state === 'ground' && !sniperScoped;
    if (!this.pivot.visible) {
      this.flashLight.intensity = 0;
      return;
    }

    this.equipBlend = Math.min(1, this.equipBlend + dt * 4.5);
    const canAds = info.aimingZoom && this.currentWeapon !== 'fists' && !info.reloading;
    const canSprint = info.sprinting && info.moving && info.onGround && !info.isSliding && !canAds && !info.reloading;

    this.adsBlend = damp(this.adsBlend, canAds ? 1 : 0, 15, dt);
    this.sprintBlend = damp(this.sprintBlend, canSprint ? 1 : 0, 11, dt);
    this.slideBlend = damp(this.slideBlend, info.isSliding ? 1 : 0, 14, dt);

    const freq = info.moving && info.onGround && !info.isSliding ? (info.sprinting ? 12.5 : 8.5) : 1.9;
    this.bobTime += dt * freq;
    const bobAmp = info.moving && info.onGround && !info.isSliding ? (info.sprinting ? 1 : 0.55) : 0.08;
    const bobX = Math.cos(this.bobTime * 0.5) * 0.014 * bobAmp * (1 - this.adsBlend * 0.8);
    const bobY = Math.abs(Math.sin(this.bobTime * 0.5)) * -0.013 * bobAmp * (1 - this.adsBlend * 0.8);

    this.swayX *= Math.exp(-12 * dt);
    this.swayY *= Math.exp(-12 * dt);
    this.recoilZ *= Math.exp(-16 * dt);
    this.recoilPitch *= Math.exp(-14 * dt);

    // Posición ADS despejada sin asignaciones new THREE.Vector3 por fotograma
    _fpHipPos.set(0.24, -0.21, -0.44);
    _fpAdsPos.set(0.095, -0.172, -0.35);
    if (this.currentWeapon === 'fists') {
      _fpHipPos.set(0.28, -0.22, -0.42);
      _fpAdsPos.copy(_fpHipPos);
    } else if (this.currentWeapon === 'pistol' || this.currentWeapon === 'revolver') {
      _fpHipPos.set(0.21, -0.18, -0.38);
      _fpAdsPos.set(0.075, -0.152, -0.32);
    } else if (this.currentWeapon === 'assault_rifle') {
      _fpHipPos.set(0.23, -0.205, -0.43);
      _fpAdsPos.set(0.085, -0.178, -0.34);
    }

    _fpPos.copy(_fpHipPos).lerp(_fpAdsPos, this.adsBlend);
    _fpPos.x += bobX + this.swayX - this.sprintBlend * 0.07;
    _fpPos.y += bobY + this.swayY - this.sprintBlend * 0.04 - (1 - this.equipBlend) * 0.22 - (info.isHealing ? 0.18 : 0);
    _fpPos.z += this.recoilZ + this.sprintBlend * 0.05;

    let rotX = this.recoilPitch + this.swayY * 1.4 - (info.isHealing ? 0.35 : 0);
    let rotY = -0.035 * (1 - this.adsBlend) + this.sprintBlend * 0.45 + this.swayX * 1.5;
    let rotZ = -this.slideBlend * 0.25 * (1 - this.adsBlend * 0.6) + this.sprintBlend * 0.22 - this.swayX * 1.6;

    if (this.meleeProgress > 0) {
      this.meleeProgress += dt * 3.8;
      if (this.meleeProgress >= 1) this.meleeProgress = 0;
      else {
        const arc = Math.sin(this.meleeProgress * Math.PI);
        _fpPos.x -= arc * 0.22;
        _fpPos.z -= arc * 0.15;
        rotX -= arc * 0.85;
        rotY += arc * 0.72;
      }
    }

    const wMesh = this.models[this.currentWeapon]?.userData.weaponMesh;
    if (wMesh) {
      const slide = wMesh.userData.slideGroup;
      const mag = wMesh.userData.magGroup;
      const flash = wMesh.userData.muzzleFlash;
      if (info.reloading) {
        const rSin = Math.sin(Math.min(1, info.reloadProgress) * Math.PI);
        rotZ += rSin * 0.45;
        rotX += rSin * 0.2;
        if (mag) {
          if (wMesh.userData.isRevolver) {
            mag.position.x = rSin * 0.036;
            mag.position.y = -rSin * 0.012;
          } else {
            mag.position.y = -rSin * 0.14;
          }
        }
      } else {
        if (mag) {
          mag.position.x = 0;
          mag.position.y = 0;
        }
        if (slide && !wMesh.userData.isRevolver) slide.position.z = -this.recoilZ * 1.1;
      }

      if (this.flashTimer > 0) {
        this.flashTimer -= dt;
        if (flash) {
          flash.visible = true;
          flash.rotation.z = Math.random() * Math.PI;
        }
        this.flashLight.intensity = 2.6;
      } else {
        if (flash) flash.visible = false;
        this.flashLight.intensity = 0;
      }
    }

    this.pivot.position.copy(_fpPos);
    this.pivot.rotation.set(rotX, rotY, rotZ);
  }

  render(renderer) {
    if (!this.pivot.visible) return;
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = prevAutoClear;
  }
}

export const viewmodelMethods = {
  renderViewmodel(renderer) {
    // Nadando el arma va guardada: no se dibuja en primera persona
    if (this.cameraMode === 'first' && this.state !== 'plane' && !this.isSwimming) {
      this.fpRig.render(renderer);
    }
  }
};
