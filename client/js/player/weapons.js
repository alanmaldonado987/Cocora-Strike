// client/js/player/weapons.js
// Armas del jugador local: materiales procedurales del arsenal, mallas 3D de armas, cambio/recarga, cadencia de
// disparo tras actualizar la cámara (raycast desde el centro de la vista) y mira telescópica.
// Los métodos se mezclan en LocalPlayerController.prototype.

import * as THREE from 'three';
import { createArmasV1WeaponMesh } from '/Modelos%203D/armasV1.js';
import {
  WEAPONS,
  WEAPON_SLOTS,
  WEAPON_FEEL_CONFIG,
  PLAYER_EYE_HEIGHT,
  PLAYER_CROUCH_EYE_HEIGHT,
  PLAYER_SLIDE_EYE_HEIGHT,
  stepFireAccumulator,
  raycastVoxels,
  PLAYER_STATE
} from '/shared/mapData.js';

const _fireCamDir = new THREE.Vector3();
const _fireAimDir = new THREE.Vector3();
const _fireCamOrigin = new THREE.Vector3();
const _fireShotOrigin = new THREE.Vector3();

const _shotPayloadPool = Array.from({ length: 8 }, () => ({
  origin: { x: 0, y: 0, z: 0 },
  dir: { x: 0, y: 0, z: 0 },
  weapon: 'fists'
}));

let _shotPayloadCursor = 0;

// ==================== MATERIALES PBR / LOW-POLY ESTILIZADOS PARA EL ARSENAL ====================
let WEAPON_MATERIALS = null;

function createProceduralHDTexture(size, drawFn) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 8;
  return tex;
}

function getWeaponMaterials() {
  if (WEAPON_MATERIALS) return WEAPON_MATERIALS;

  let seed = 94821;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const gunmetalTex = createProceduralHDTexture(256, (ctx, S) => {
    const grad = ctx.createLinearGradient(0, 0, 0, S);
    grad.addColorStop(0, '#3a4659');
    grad.addColorStop(0.5, '#263142');
    grad.addColorStop(1, '#1a2230');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y++) {
      ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
      ctx.fillRect(0, y, S, 1);
    }
  });

  const walnutTex = createProceduralHDTexture(256, (ctx, S) => {
    ctx.fillStyle = '#734222';
    ctx.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y++) {
      const wave = Math.sin(y * 0.09) * 10;
      for (let x = 0; x < S; x += 2) {
        const grain = Math.sin((x + wave) * 0.16 + rand() * 0.25);
        ctx.fillStyle = grain > 0 ? 'rgba(42, 20, 8, 0.16)' : 'rgba(190, 124, 72, 0.13)';
        ctx.fillRect(x, y, 2, 2);
      }
    }
  });

  WEAPON_MATERIALS = {
    gunmetal: new THREE.MeshStandardMaterial({ map: gunmetalTex, roughness: 0.35, metalness: 0.74 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.42, metalness: 0.80 }),
    steel: new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.25, metalness: 0.86 }),
    polymer: new THREE.MeshStandardMaterial({ color: '#1e2532', roughness: 0.75, metalness: 0.16 }),
    olivePolymer: new THREE.MeshStandardMaterial({ color: '#365314', roughness: 0.65, metalness: 0.2 }),
    walnut: new THREE.MeshStandardMaterial({ map: walnutTex, roughness: 0.48, metalness: 0.08 }),
    brass: new THREE.MeshStandardMaterial({ color: '#eab308', roughness: 0.28, metalness: 0.85 }),
    shellRed: new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.45, metalness: 0.2 }),
    cyanAccent: new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0284c7', emissiveIntensity: 0.35, roughness: 0.3 }),
    purpleAccent: new THREE.MeshStandardMaterial({ color: '#a855f7', emissive: '#7e22ce', emissiveIntensity: 0.28, roughness: 0.35 }),
    amberAccent: new THREE.MeshStandardMaterial({ color: '#f59e0b', roughness: 0.38, metalness: 0.45 }),
    tritium: new THREE.MeshBasicMaterial({ color: '#4ade80' }),
    holoReticle: new THREE.MeshBasicMaterial({ color: '#fb7185' }),
    opticGlass: new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.26, depthWrite: false }),
    muzzleFlash: new THREE.MeshBasicMaterial({ color: '#fef08a', transparent: true, opacity: 0.94, depthWrite: false })
  };
  return WEAPON_MATERIALS;
}

// Modelos 3D completos de "Armas v1" en escala métrica real (con geometrías y materiales PBR compartidos en caché)
export function createDetailedWeaponMesh(weaponId, scale = 1.0) {
  if (weaponId === 'fists') {
    const M = getWeaponMaterials();
    const root = new THREE.Group();
    root.scale.setScalar(scale);

    const muzzleTip = new THREE.Object3D();
    root.add(muzzleTip);
    root.userData.muzzleTip = muzzleTip;

    // Machete Cafetero Estilizado (~0.52m)
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.14, 8), M.walnut);
    grip.rotation.x = Math.PI / 2;
    grip.position.set(0, -0.01, 0.02);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.09, 0.016), M.brass);
    guard.position.set(0, 0, 0.095);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.048, 0.38), M.steel);
    blade.position.set(0, 0.004, 0.29);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.09, 4), M.steel);
    tip.rotation.x = Math.PI / 2;
    tip.rotation.z = Math.PI / 4;
    tip.position.set(0, 0.006, 0.50);
    root.add(grip, guard, blade, tip);
    muzzleTip.position.set(0, 0, 0.54);
    return root;
  }

  return createArmasV1WeaponMesh(weaponId, scale);
}

export const weaponMethods = {
  setEquippedWeaponVisual(weaponId, instant = false) {
    this.avatar?.setWeapon(weaponId);
    this.fpRig.setWeapon(weaponId, instant);
  },

  cycleWeapon(delta) {
    const order = ['fists', ...WEAPON_SLOTS].filter((w) => this.weapons[w]?.unlocked);
    if (order.length <= 1) return;
    const idx = Math.max(0, order.indexOf(this.equipped));
    const next = order[(idx + delta + order.length) % order.length];
    this.trySwitchWeapon(next);
  },

  trySwitchWeapon(weaponId) {
    if (!this.weapons[weaponId]?.unlocked || this.equipped === weaponId) return;
    this.equipped = weaponId;
    this.reloading = false;
    this.fireCadenceState.burstActive = false;
    this.fireCadenceState.cooldownSec = Math.max(this.fireCadenceState.cooldownSec, 0.08);
    this.setEquippedWeaponVisual(weaponId, false);
    this.onSwitchWeaponRequest?.(weaponId);
  },

  tryReload() {
    const wSpec = WEAPONS[this.equipped];
    const wState = this.weapons[this.equipped];
    if (!wSpec || wSpec.magSize === 0 || this.reloading) return;
    if (wState.mag >= wSpec.magSize || this.reserveAmmo <= 0) return;

    this.reloading = true;
    this.fireCadenceState.burstActive = false;
    this.reloadStart = performance.now();
    this.reloadDuration = wSpec.reloadMs;
    this.audio.playReload();
    this.onReloadRequest?.();
  },

  processWeaponFireAfterCamera(dt, mapData = this.currentMap) {
    const wSpec = WEAPONS[this.equipped];
    const wState = this.weapons[this.equipped];
    const canShootNow =
      this.alive &&
      this.state === PLAYER_STATE.GROUND &&
      !this.reloading &&
      !this.isSwimming &&
      Boolean(mapData) &&
      Boolean(wSpec && wState?.unlocked);

    const pressed = this.pendingShotPress;
    this.pendingShotPress = false;

    if (!canShootNow) {
      stepFireAccumulator(this.fireCadenceState, dt, false, false, (wSpec?.fireRateMs || 200) / 1000, false);
      return;
    }

    const fireIntervalSec = Math.max(0.03, (wSpec.fireRateMs || 200) / 1000);
    const shots = stepFireAccumulator(
      this.fireCadenceState,
      dt,
      this.mouseDownLeft,
      pressed,
      fireIntervalSec,
      Boolean(wSpec.auto)
    );

    for (let s = 0; s < shots; s++) {
      if (!this.executeSinglePostCameraShot(mapData, wSpec, wState)) {
        this.fireCadenceState.burstActive = false;
        break;
      }
    }
  },

  executeSinglePostCameraShot(mapData, wSpec, wState) {
    if (this.isHealing) {
      this.cancelClientHeal(true);
    }

    if (wSpec.magSize > 0) {
      if (wState.mag <= 0) {
        this.tryReload();
        return false;
      }
      wState.mag -= 1;
    }

    // Orientación exacta del fotograma actual (calculada justo después de updateCamera)
    this.camera.updateMatrixWorld();
    this.camera.getWorldDirection(_fireCamDir);

    const camX = this.x + (this.reconcileOffsetX || 0);
    const camY = this.y + (this.reconcileOffsetY || 0);
    const camZ = this.z + (this.reconcileOffsetZ || 0);
    const eyeH = this.isSliding
      ? PLAYER_SLIDE_EYE_HEIGHT
      : this.isCrouching
      ? PLAYER_CROUCH_EYE_HEIGHT
      : PLAYER_EYE_HEIGHT;
    _fireShotOrigin.set(camX, camY + eyeH, camZ);
    _fireAimDir.copy(_fireCamDir);

    const sniperAds = this.aimingZoom && this.equipped === 'sniper';
    if (this.cameraMode === 'third' && !sniperAds) {
      _fireCamOrigin.set(
        this.camera.position.x,
        this.camera.position.y,
        this.camera.position.z
      );
      const camHit = raycastVoxels(mapData, _fireCamOrigin, _fireCamDir, wSpec.range + 20);
      if (this.avatar && this.equipped !== 'fists') {
        this.avatar.getMuzzleWorldPosition(_fireShotOrigin, _fireShotOrigin);
      }
      _fireAimDir.set(
        camHit.point.x - _fireShotOrigin.x,
        camHit.point.y - _fireShotOrigin.y,
        camHit.point.z - _fireShotOrigin.z
      ).normalize();
    }

    if ((wSpec.pellets || 1) === 1) {
      const spread = this.aimingZoom ? wSpec.spread * (this.equipped === 'sniper' ? 0.08 : 0.35) : wSpec.spread;
      _fireAimDir.x += (Math.random() - 0.5) * spread;
      _fireAimDir.y += (Math.random() - 0.5) * spread;
      _fireAimDir.z += (Math.random() - 0.5) * spread;
      _fireAimDir.normalize();
    }

    // Retroceso visual impulsado por resorte con retorno suave (tras emitir el rayo actual)
    const kickBase = (wSpec.recoil || 0.016) * WEAPON_FEEL_CONFIG.recoilVisualMult * (this.aimingZoom ? 0.78 : 1.0);
    this.recoilState.targetPitch = Math.min(0.28, this.recoilState.targetPitch + kickBase);
    const yawJitter = (Math.random() - 0.5) * 2 * kickBase * WEAPON_FEEL_CONFIG.recoilHorizontalJitter;
    this.recoilState.targetYaw = Math.max(-0.10, Math.min(0.10, this.recoilState.targetYaw + yawJitter));

    this.avatar?.triggerFireEffect();
    this.fpRig.triggerFire(this.equipped);

    const slot = _shotPayloadPool[_shotPayloadCursor];
    _shotPayloadCursor = (_shotPayloadCursor + 1) & 7;
    slot.origin.x = _fireShotOrigin.x;
    slot.origin.y = _fireShotOrigin.y;
    slot.origin.z = _fireShotOrigin.z;
    slot.dir.x = _fireAimDir.x;
    slot.dir.y = _fireAimDir.y;
    slot.dir.z = _fireAimDir.z;
    slot.weapon = this.equipped;
    this.onShootRequest?.(slot);
    return true;
  },

  isSniperScoped() {
    return this.alive && this.state === PLAYER_STATE.GROUND && this.equipped === 'sniper' && this.aimingZoom && !this.reloading;
  }
};
