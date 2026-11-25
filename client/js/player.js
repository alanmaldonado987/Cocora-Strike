// client/js/player.js
// Dirección de Arte Low-Poly Estilizado y Orgánico en Escala Métrica Real (1.80 metros):
// - Avatares anatómicos estilizados (sin cabezas cuadradas): cabeza ovalada, torso estilizado, articulaciones redondeadas
//   (hombros, codos, caderas, rodillas), calzado táctico, mochila táctica, ruana ligera y sombrero vueltiao / gorra táctica.
// - 5 Armas 3D con siluetas reconocibles (Pistola 9mm, Escopeta Corredera, Subfusil SMG, Fusil AK/M4 y Francotirador Sniper).
// - Caída de ~8s desde 145m (apertura automática a 35m), Sigilo agachado (C), Derrape Táctico (Shift+W+C/Ctrl) y Zoom Sniper.

import * as THREE from 'three';
import {
  WEAPONS,
  WEAPON_SLOTS,
  SLIDE_CONFIG,
  HEAL_CONFIG,
  PARACHUTE_CONFIG,
  PLAYER_RADIUS,
  PLAYER_HEIGHT,
  PLAYER_CROUCH_HEIGHT,
  PLAYER_SLIDE_HEIGHT,
  PLAYER_EYE_HEIGHT,
  PLAYER_CROUCH_EYE_HEIGHT,
  PLAYER_SLIDE_EYE_HEIGHT,
  WATER_LEVEL,
  SWIM_CONFIG,
  computeTargetDescentSpeed,
  applyEntitySeparation,
  stepCharacterPhysics,
  findVaultableObstacle,
  raycastVoxels,
  getWaterDepthAt,
  isSwimmingAt,
  getSwimFloatY
} from '/shared/mapData.js';

let _sharedToonGradient = null;
export function getSharedToonGradient() {
  if (_sharedToonGradient) return _sharedToonGradient;
  const data = new Uint8Array([
    86, 86, 86, 255,
    148, 148, 148, 255,
    208, 208, 208, 255,
    255, 255, 255, 255
  ]);
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  _sharedToonGradient = tex;
  return tex;
}

let _sharedRuanaTexture = null;
let _sharedSombreroTexture = null;

function getSharedPaisaTextures() {
  if (!_sharedRuanaTexture) {
    _sharedRuanaTexture = createProceduralHDTexture(128, (ctx, S) => {
      // Fondo blanco cálido de lana tejida con franjas negras tradicionales de ruana paisa
      ctx.fillStyle = '#f8f6f0';
      ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = '#ebe6da';
      for (let y = 0; y < S; y += 4) {
        ctx.fillRect(0, y, S, 1);
      }
      const stripes = [
        [14, 10, '#18181b'],
        [28, 4, '#27272a'],
        [54, 12, '#111827'],
        [70, 4, '#dc2626'],
        [94, 10, '#18181b'],
        [108, 4, '#27272a']
      ];
      for (const [sy, sh, col] of stripes) {
        ctx.fillStyle = col;
        ctx.fillRect(0, sy, S, sh);
      }
    });
  }
  if (!_sharedSombreroTexture) {
    _sharedSombreroTexture = createProceduralHDTexture(128, (ctx, S) => {
      // Trenzado caña flecha blanco crema y negro del Sombrero Vueltiao
      ctx.fillStyle = '#f5e8c8';
      ctx.fillRect(0, 0, S, S);
      for (let y = 0; y < S; y += 16) {
        ctx.fillStyle = '#18181b';
        ctx.fillRect(0, y + 4, S, 6);
        ctx.fillStyle = '#d6c294';
        ctx.fillRect(0, y + 12, S, 2);
      }
    });
  }
  return { ruanaTex: _sharedRuanaTexture, sombreroTex: _sharedSombreroTexture };
}

export const AVATAR_COLORS = [
  '#10b981',
  '#f59e0b',
  '#3b82f6',
  '#ef4444',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
  '#eab308'
];

function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

// Vectores temporales reutilizables a nivel de módulo (CERO new THREE.Vector3 en animate / updateCamera / disparos)
const _fpHipPos = new THREE.Vector3();
const _fpAdsPos = new THREE.Vector3();
const _fpPos = new THREE.Vector3();
const _fireCamDir = new THREE.Vector3();
const _fireAimDir = new THREE.Vector3();
const _camLookDir = new THREE.Vector3();
const _camRightVec = new THREE.Vector3();
const _camBackDir = new THREE.Vector3();
const _camPivot = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _planeAnchor = new THREE.Vector3();

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

function createMuzzleFlashMesh(mat, radius) {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, radius * 2.6, 6), mat);
  cone.rotation.x = Math.PI / 2;
  cone.position.z = radius * 1.2;
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(radius * 0.85, 0), mat);
  g.add(cone, star);
  g.visible = false;
  return g;
}

// Modelos 3D Low-Poly Estilizados con cañones cilíndricos y siluetas claramente reconocibles en escala métrica real
export function createDetailedWeaponMesh(weaponId, scale = 1.0) {
  const M = getWeaponMaterials();
  const root = new THREE.Group();
  root.scale.setScalar(scale);

  const muzzleTip = new THREE.Object3D();
  root.add(muzzleTip);
  root.userData.muzzleTip = muzzleTip;

  if (weaponId === 'fists') {
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

  if (weaponId === 'pistol') {
    // 1. PISTOLA TÁCTICA 9MM (~0.24m)
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.11, 0.052), M.polymer);
    grip.position.set(0, -0.05, 0.01);
    grip.rotation.x = -0.24;

    const magGroup = new THREE.Group();
    const magPlate = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.014, 0.058), M.cyanAccent);
    magPlate.position.set(0, -0.105, -0.004);
    magGroup.add(magPlate);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.03, 0.19), M.polymer);
    frame.position.set(0, 0.006, 0.075);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.20, 10), M.steel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.034, 0.09);

    const tacLight = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.06, 8), M.darkMetal);
    tacLight.rotation.x = Math.PI / 2;
    tacLight.position.set(0, -0.014, 0.135);

    const slideGroup = new THREE.Group();
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.038, 0.195), M.gunmetal);
    slide.position.set(0, 0.036, 0.076);
    const sightRear = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.012, 0.012), M.tritium);
    sightRear.position.set(0, 0.06, -0.01);
    const sightFront = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.012), M.tritium);
    sightFront.position.set(0, 0.06, 0.16);
    slideGroup.add(slide, sightRear, sightFront);

    root.add(grip, magGroup, frame, barrel, tacLight, slideGroup);
    muzzleTip.position.set(0, 0.035, 0.20);
    const flash = createMuzzleFlashMesh(M.muzzleFlash, 0.08);
    muzzleTip.add(flash);
    root.userData.slideGroup = slideGroup;
    root.userData.magGroup = magGroup;
    root.userData.muzzleFlash = flash;
    return root;
  }

  if (weaponId === 'shotgun') {
    // 2. ESCOPETA DE CORREDERA PUMP-ACTION (~0.86m)
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.095, 0.26), M.walnut);
    stock.position.set(0, -0.025, -0.18);
    stock.rotation.x = -0.14;

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.068, 0.22), M.gunmetal);
    receiver.position.set(0, 0.022, 0.04);

    // Cartuchos rojos laterales en portacartuchos
    for (let i = 0; i < 4; i++) {
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.048, 8), M.shellRed);
      shell.position.set(-0.028, 0.024, -0.02 + i * 0.028);
      root.add(shell);
    }

    // Cañón superior largo + tubo cargador inferior paralelo
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.017, 0.56, 12), M.darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.042, 0.42);

    const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.48, 10), M.steel);
    magTube.rotation.x = Math.PI / 2;
    magTube.position.set(0, 0.008, 0.38);

    // Guardamanos corredizo de madera estriada (pump forend)
    const pumpGroup = new THREE.Group();
    const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.19, 10), M.walnut);
    pump.rotation.x = Math.PI / 2;
    pump.position.set(0, 0.008, 0.36);
    pumpGroup.add(pump);

    root.add(stock, receiver, barrel, magTube, pumpGroup);
    muzzleTip.position.set(0, 0.042, 0.71);
    const flash = createMuzzleFlashMesh(M.muzzleFlash, 0.15);
    muzzleTip.add(flash);
    root.userData.slideGroup = pumpGroup;
    root.userData.muzzleFlash = flash;
    return root;
  }

  if (weaponId === 'smg') {
    // 3. SUBFUSIL TÁCTICO SMG (~0.54m con empuñadura frontal y cargador recto extendido)
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.062, 0.28), M.gunmetal);
    upper.position.set(0, 0.032, 0.08);
    const accentRail = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.012, 0.24), M.purpleAccent);
    accentRail.position.set(0, 0.068, 0.08);

    const pistolGrip = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.105, 0.048), M.polymer);
    pistolGrip.position.set(0, -0.045, -0.01);
    pistolGrip.rotation.x = -0.22;

    const foreGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.016, 0.095, 8), M.polymer);
    foreGrip.position.set(0, -0.042, 0.18);

    const magGroup = new THREE.Group();
    const stickMag = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.21, 0.038), M.darkMetal);
    stickMag.position.set(0, -0.11, 0.10);
    stickMag.rotation.x = 0.1;
    magGroup.add(stickMag);

    const suppressor = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.18, 12), M.darkMetal);
    suppressor.rotation.x = Math.PI / 2;
    suppressor.position.set(0, 0.032, 0.30);

    const wireStock = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.075, 0.14), M.polymer);
    wireStock.position.set(0, 0.018, -0.12);

    root.add(upper, accentRail, pistolGrip, foreGrip, magGroup, suppressor, wireStock);
    muzzleTip.position.set(0, 0.032, 0.40);
    const flash = createMuzzleFlashMesh(M.muzzleFlash, 0.09);
    muzzleTip.add(flash);
    root.userData.magGroup = magGroup;
    root.userData.muzzleFlash = flash;
    return root;
  }

  if (weaponId === 'sniper') {
    // 5. RIFLE DE FRANCOTIRADOR DE CERROJO CON MIRA TELESCÓPICA (~1.12m)
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.062, 0.42), M.olivePolymer);
    chassis.position.set(0, 0.018, 0.10);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.095, 0.28), M.olivePolymer);
    stock.position.set(0, 0.008, -0.22);
    const cheekRest = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.032, 0.15), M.darkMetal);
    cheekRest.position.set(0, 0.064, -0.20);

    const pistolGrip = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.11, 0.05), M.polymer);
    pistolGrip.position.set(0, -0.055, -0.03);
    pistolGrip.rotation.x = -0.24;

    const magGroup = new THREE.Group();
    const boxMag = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.095, 0.095), M.darkMetal);
    boxMag.position.set(0, -0.048, 0.10);
    magGroup.add(boxMag);

    // Cañón flotante largo + freno de boca pesado
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.68, 12), M.steel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.038, 0.56);

    const muzzleBrake = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.034, 0.075), M.darkMetal);
    muzzleBrake.position.set(0, 0.038, 0.91);

    // Bípode plegado bajo el guardamanos
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.18, 6), M.darkMetal);
      leg.rotation.x = Math.PI / 2;
      leg.position.set(side * 0.024, -0.018, 0.36);
      root.add(leg);
    }

    // Mira telescópica de doble campana en la parte superior
    const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.28, 12), M.darkMetal);
    scopeTube.rotation.x = Math.PI / 2;
    scopeTube.position.set(0, 0.088, 0.08);
    const scopeFrontBell = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.017, 0.075, 12), M.gunmetal);
    scopeFrontBell.rotation.x = Math.PI / 2;
    scopeFrontBell.position.set(0, 0.088, 0.22);
    const scopeRearBell = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.022, 0.06, 12), M.gunmetal);
    scopeRearBell.rotation.x = Math.PI / 2;
    scopeRearBell.position.set(0, 0.088, -0.06);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.005, 12), M.opticGlass);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0.088, 0.258);

    // Cerrojo lateral
    const boltGroup = new THREE.Group();
    const boltKnob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), M.steel);
    boltKnob.position.set(-0.038, 0.028, 0.02);
    boltGroup.add(boltKnob);

    root.add(chassis, stock, cheekRest, pistolGrip, magGroup, barrel, muzzleBrake, scopeTube, scopeFrontBell, scopeRearBell, lens, boltGroup);
    muzzleTip.position.set(0, 0.038, 0.96);
    const flash = createMuzzleFlashMesh(M.muzzleFlash, 0.16);
    muzzleTip.add(flash);
    root.userData.slideGroup = boltGroup;
    root.userData.magGroup = magGroup;
    root.userData.muzzleFlash = flash;
    return root;
  }

  // 4. FUSIL DE ASALTO AK/M4 (~0.84m)
  const upperReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.056, 0.26), M.gunmetal);
  upperReceiver.position.set(0, 0.038, 0.06);
  const lowerReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.046, 0.22), M.polymer);
  lowerReceiver.position.set(0, -0.004, 0.05);

  const pistolGrip = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.11, 0.052), M.polymer);
  pistolGrip.position.set(0, -0.065, -0.025);
  pistolGrip.rotation.x = -0.26;

  const stockBody = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.078, 0.22), M.walnut);
  stockBody.position.set(0, 0.018, -0.18);

  const magGroup = new THREE.Group();
  const magUpper = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.11, 0.065), M.amberAccent);
  magUpper.position.set(0, -0.075, 0.105);
  magUpper.rotation.x = 0.18;
  const magLower = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.10, 0.064), M.amberAccent);
  magLower.position.set(0, -0.155, 0.128);
  magLower.rotation.x = 0.30;
  magGroup.add(magUpper, magLower);

  const handguard = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.030, 0.28, 8), M.walnut);
  handguard.rotation.x = Math.PI / 2;
  handguard.position.set(0, 0.034, 0.32);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.014, 0.26, 10), M.steel);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.036, 0.56);
  const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.055, 8), M.darkMetal);
  muzzleBrake.rotation.x = Math.PI / 2;
  muzzleBrake.position.set(0, 0.036, 0.70);

  // Mira reflex abierta
  const opticHood = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.034, 0.065), M.darkMetal);
  opticHood.position.set(0, 0.082, 0.05);
  const reticleDot = new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 6), M.holoReticle);
  reticleDot.position.set(0, 0.084, 0.05);

  const boltGroup = new THREE.Group();
  const dustCover = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.075), M.brass);
  dustCover.position.set(0, 0.042, 0.08);
  boltGroup.add(dustCover);

  root.add(upperReceiver, lowerReceiver, boltGroup, pistolGrip, stockBody, magGroup, handguard, barrel, muzzleBrake, opticHood, reticleDot);
  muzzleTip.position.set(0, 0.036, 0.74);
  const flash = createMuzzleFlashMesh(M.muzzleFlash, 0.12);
  muzzleTip.add(flash);

  root.userData.slideGroup = boltGroup;
  root.userData.magGroup = magGroup;
  root.userData.muzzleFlash = flash;
  return root;
}

// Placa flotante sobre enemigos (escala métrica para personaje de 1.80m)
function createEnemyOverheadPlate(name, accentHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 88;
  const ctx = canvas.getContext('2d');

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.65, 0.56, 1);
  sprite.position.set(0, 2.28, 0);

  let lastRenderedHp = -1;
  const renderPlate = (hp = 100, maxHp = 100) => {
    const clampedHp = Math.max(0, Math.min(maxHp, Math.ceil(hp)));
    if (clampedHp === lastRenderedHp) return;
    lastRenderedHp = clampedHp;

    const pct = Math.max(0, Math.min(1, clampedHp / (maxHp || 100)));
    ctx.clearRect(0, 0, 256, 88);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
    ctx.beginPath();
    ctx.roundRect(14, 8, 228, 70, 12);
    ctx.fill();
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.font = 'bold 22px Segoe UI, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.slice(0, 15), 128, 30);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.beginPath();
    ctx.roundRect(26, 50, 204, 16, 7);
    ctx.fill();

    ctx.fillStyle = pct > 0.55 ? '#10b981' : pct > 0.28 ? '#f59e0b' : '#ef4444';
    if (pct > 0) {
      ctx.beginPath();
      ctx.roundRect(28, 52, Math.max(8, 200 * pct), 12, 5);
      ctx.fill();
    }
    tex.needsUpdate = true;
  };

  renderPlate(100, 100);
  sprite.userData.renderPlate = renderPlate;
  return sprite;
}

// Paracaídas tipo parapente curvado Low-Poly tricolor colombiano (escala 1.80m)
function createParachuteCanopy() {
  const parachute = new THREE.Group();
  parachute.position.set(0, 2.85, 0);

  const yMat = new THREE.MeshLambertMaterial({ color: '#facc15' });
  const bMat = new THREE.MeshLambertMaterial({ color: '#2563eb' });
  const rMat = new THREE.MeshLambertMaterial({ color: '#dc2626' });

  const centerWing = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 1.35), yMat);
  const leftWing = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.13, 1.3), bMat);
  leftWing.position.set(0.96, -0.14, 0);
  leftWing.rotation.z = -0.28;
  const rightWing = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.13, 1.3), rMat);
  rightWing.position.set(-0.96, -0.14, 0);
  rightWing.rotation.z = 0.28;
  parachute.add(centerWing, leftWing, rightWing);

  const cordMat = new THREE.LineBasicMaterial({ color: '#e2e8f0' });
  [
    [-1.25, -0.5, -0.28],
    [1.25, -0.5, 0.28],
    [-1.25, 0.5, -0.28],
    [1.25, 0.5, 0.28]
  ].forEach(([cx, cz, hx]) => {
    const cGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(cx, -0.18, cz),
      new THREE.Vector3(hx, -1.12, 0.04)
    ]);
    parachute.add(new THREE.Line(cGeo, cordMat));
  });
  parachute.visible = false;
  return parachute;
}

// ==================== AVATAR LOW-POLY ESTILIZADO Y ANATÓMICO DE 1.80M (ADIÓS CABEZAS CUADRADAS) ====================
export function createVoxelAvatar(name, colorIdx = 0, isLocal = false) {
  const root = new THREE.Group();
  const pelvisGroup = new THREE.Group();
  pelvisGroup.position.set(0, 0.90, 0); // Caderas a 0.90m en un cuerpo humano de 1.80m
  root.add(pelvisGroup);

  const shirtHex = AVATAR_COLORS[colorIdx % AVATAR_COLORS.length];
  const toonGrad = getSharedToonGradient();
  const { ruanaTex, sombreroTex } = getSharedPaisaTextures();

  const skinMat = new THREE.MeshToonMaterial({ color: '#eab68c', gradientMap: toonGrad });
  const shirtMat = new THREE.MeshToonMaterial({ color: shirtHex, gradientMap: toonGrad });
  const pantsMat = new THREE.MeshToonMaterial({ color: '#1f242d', gradientMap: toonGrad }); // Pantalón oscuro
  const bootMat = new THREE.MeshToonMaterial({ color: '#1c1917', gradientMap: toonGrad });  // Botas oscuras
  const packMat = new THREE.MeshToonMaterial({ color: '#36492f', gradientMap: toonGrad });  // Mochila militar verde
  const ponchoMat = new THREE.MeshToonMaterial({ map: ruanaTex, color: '#ffffff', gradientMap: toonGrad }); // Ruana blanca con franjas negras
  const strawMat = new THREE.MeshToonMaterial({ map: sombreroTex, color: '#ffffff', gradientMap: toonGrad }); // Sombrero Vueltiao
  const darkMat = new THREE.MeshToonMaterial({ color: '#18181b', gradientMap: toonGrad });
  const outlineMat = new THREE.MeshBasicMaterial({ color: '#111827', side: THREE.BackSide });
  const hitFlashMats = [skinMat, shirtMat, pantsMat, ponchoMat, packMat];
  const allAvatarMats = [skinMat, shirtMat, pantsMat, bootMat, packMat, ponchoMat, strawMat, darkMat, outlineMat];

  // Cuenca pélvica estilizada
  const pelvisMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.135, 0.15, 10), pantsMat);
  pelvisMesh.scale.set(1.08, 1, 0.78);
  pelvisMesh.castShadow = true;
  pelvisMesh.receiveShadow = true;
  pelvisGroup.add(pelvisMesh);

  // Piernas estilizadas con articulación visible en cadera y rodilla + botas tácticas redondeadas
  const makeStylizedLeg = (offsetX) => {
    const hip = new THREE.Group();
    hip.position.set(offsetX, -0.04, 0);

    const hipJoint = new THREE.Mesh(new THREE.SphereGeometry(0.078, 8, 8), pantsMat);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.068, 0.40, 10), pantsMat);
    thigh.position.y = -0.21;
    thigh.castShadow = true;
    hip.add(hipJoint, thigh);

    const knee = new THREE.Group();
    knee.position.set(0, -0.42, 0);

    const kneeJoint = new THREE.Mesh(new THREE.SphereGeometry(0.068, 8, 8), darkMat);
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.052, 0.36, 10), pantsMat);
    shin.position.y = -0.19;
    shin.castShadow = true;

    // Bota táctica con caña y puntera redondeada
    const bootShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.062, 0.12, 10), bootMat);
    bootShaft.position.set(0, -0.38, 0);
    const bootFoot = new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 8), bootMat);
    bootFoot.scale.set(0.92, 0.65, 1.55);
    bootFoot.position.set(0, -0.41, 0.038);
    bootFoot.castShadow = true;

    knee.add(kneeJoint, shin, bootShaft, bootFoot);
    hip.add(knee);
    return { hip, knee };
  };

  const leftLeg = makeStylizedLeg(0.105);
  const rightLeg = makeStylizedLeg(-0.105);
  pelvisGroup.add(leftLeg.hip, rightLeg.hip);

  // Torso anatómico estilizado en V + Ruana colombiana ligera + Mochila táctica detallada
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 0.05, 0);
  pelvisGroup.add(torsoGroup);

  const chestMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.142, 0.48, 12), shirtMat);
  chestMesh.scale.set(1.08, 1.0, 0.72);
  chestMesh.position.y = 0.24;
  chestMesh.castShadow = true;
  torsoGroup.add(chestMesh);

  // Ruana / Poncho Paisa rayado blanco con franjas negras y contorno cel-shaded sobre los hombros
  const ruana = new THREE.Mesh(new THREE.ConeGeometry(0.285, 0.34, 14, 1, true), ponchoMat);
  ruana.scale.set(1.10, 1.0, 0.82);
  ruana.position.y = 0.34;
  ruana.castShadow = true;
  ruana.receiveShadow = true;
  const ruanaOutline = new THREE.Mesh(new THREE.ConeGeometry(0.296, 0.352, 14, 1, true), outlineMat);
  ruanaOutline.scale.set(1.10, 1.0, 0.82);
  ruanaOutline.position.y = 0.34;
  torsoGroup.add(ruana, ruanaOutline);

  // Botiquín 3D sostenido al frente durante la animación canalizada de 2.0 segundos
  const healProp = new THREE.Group();
  const healCaseMat = new THREE.MeshLambertMaterial({ color: '#f8fafc' });
  const healCrossMat = new THREE.MeshLambertMaterial({ color: '#10b981' });
  const healBox = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.18), healCaseMat);
  const hCross1 = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.025, 0.045), healCrossMat);
  hCross1.position.y = 0.075;
  const hCross2 = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.025, 0.13), healCrossMat);
  hCross2.position.y = 0.075;
  healProp.add(healBox, hCross1, hCross2);
  healProp.position.set(0, 0.15, 0.29);
  healProp.rotation.x = 0.35;
  healProp.visible = false;
  torsoGroup.add(healProp);

  // Mochila militar verde detallada en la espalda (-Z) con bolsillos y correas
  const backpack = new THREE.Group();
  backpack.position.set(0, 0.27, -0.175);
  const packBody = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.35, 0.14), packMat);
  packBody.castShadow = true;
  packBody.receiveShadow = true;
  const packOutline = new THREE.Mesh(new THREE.BoxGeometry(0.276, 0.366, 0.156), outlineMat);
  const bedroll = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.28, 10), darkMat);
  bedroll.rotation.z = Math.PI / 2;
  bedroll.position.set(0, 0.20, 0);
  bedroll.castShadow = true;
  const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.15, 0.055), packMat);
  pouch.position.set(0, -0.04, -0.085);
  pouch.castShadow = true;
  backpack.add(packBody, packOutline, bedroll, pouch);
  torsoGroup.add(backpack);

  // Cuello y Cabeza Ovalada Estilizada + Sombrero Vueltiao Colombiano con contorno definido
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.50, 0);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.09, 8), skinMat);
  neck.position.y = 0.04;
  headPivot.add(neck);

  const headOval = new THREE.Mesh(new THREE.SphereGeometry(0.125, 14, 12), skinMat);
  headOval.scale.set(0.92, 1.10, 0.98);
  headOval.position.y = 0.175;
  headOval.castShadow = true;
  const headOutline = new THREE.Mesh(new THREE.SphereGeometry(0.133, 14, 12), outlineMat);
  headOutline.scale.set(0.92, 1.10, 0.98);
  headOutline.position.y = 0.175;
  headPivot.add(headOval, headOutline);

  // Ojos estilizados
  const eyeGeo = new THREE.SphereGeometry(0.016, 6, 6);
  const eyeL = new THREE.Mesh(eyeGeo, darkMat);
  eyeL.position.set(0.042, 0.185, 0.112);
  const eyeR = eyeL.clone();
  eyeR.position.x = -0.042;
  headPivot.add(eyeL, eyeR);

  // Sombrero Vueltiao tradicional en todos los combatientes con cinta de color identificativo
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.27, 0.020, 18), strawMat);
  brim.position.y = 0.272;
  brim.castShadow = true;
  const brimOutline = new THREE.Mesh(new THREE.CylinderGeometry(0.266, 0.281, 0.028, 18), outlineMat);
  brimOutline.position.y = 0.272;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.108, 0.136, 0.108, 14), strawMat);
  crown.position.y = 0.33;
  crown.castShadow = true;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.138, 0.140, 0.028, 14), shirtMat);
  band.position.y = 0.292;
  headPivot.add(brim, brimOutline, crown, band);
  torsoGroup.add(headPivot);

  // Brazos estilizados con articulaciones esféricas visibles en hombros y codos
  const makeStylizedArm = (offsetX) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(offsetX, 0.44, 0);

    const shoulderJoint = new THREE.Mesh(new THREE.SphereGeometry(0.064, 8, 8), shirtMat);
    const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.048, 0.27, 10), shirtMat);
    upperArm.position.y = -0.14;
    shoulder.add(shoulderJoint, upperArm);

    const elbow = new THREE.Group();
    elbow.position.set(0, -0.28, 0);

    const elbowJoint = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 8), skinMat);
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.038, 0.25, 10), skinMat);
    forearm.position.y = -0.13;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.044, 8, 8), skinMat);
    hand.position.y = -0.265;
    elbow.add(elbowJoint, forearm, hand);
    shoulder.add(elbow);

    return { shoulder, elbow };
  };

  const leftArm = makeStylizedArm(0.245);
  const rightArm = makeStylizedArm(-0.245);
  torsoGroup.add(leftArm.shoulder, rightArm.shoulder);

  // Montura de las 5 armas + machete en la mano derecha
  const weaponMount = new THREE.Group();
  weaponMount.position.set(0.02, -0.265, 0.05);
  weaponMount.rotation.x = Math.PI / 2;
  rightArm.elbow.add(weaponMount);

  const weapons = {
    fists: createDetailedWeaponMesh('fists', 0.92),
    pistol: createDetailedWeaponMesh('pistol', 0.95),
    shotgun: createDetailedWeaponMesh('shotgun', 0.88),
    smg: createDetailedWeaponMesh('smg', 0.90),
    rifle: createDetailedWeaponMesh('rifle', 0.88),
    sniper: createDetailedWeaponMesh('sniper', 0.86)
  };
  for (const [k, m] of Object.entries(weapons)) {
    m.visible = k === 'fists';
    weaponMount.add(m);
  }

  const parachute = createParachuteCanopy();
  root.add(parachute);

  let overheadPlate = null;
  if (!isLocal) {
    overheadPlate = createEnemyOverheadPlate(name, shirtHex);
    root.add(overheadPlate);
  }

  const st = {
    breathClock: Math.random() * 6.28,
    recoilAmount: 0,
    flashTimer: 0,
    damageFlashTimer: 0,
    landingCompression: 0,
    wasAirborne: false,
    activeWeapon: 'fists',
    lastAlpha: 1.0,
    hideWeaponInAds: false
  };

  const tmpWorldVec = new THREE.Vector3();

  return {
    root,
    pelvisGroup,
    torsoGroup,
    headPivot,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    parachute,
    weapons,
    dispose() {
      root.traverse((child) => {
        if (child.isSprite && child.material?.map) {
          child.material.map.dispose();
          child.material.dispose();
          return;
        }
        if (child.geometry) child.geometry.dispose();
      });
      for (let i = 0; i < allAvatarMats.length; i++) {
        allAvatarMats[i].dispose();
      }
      healCaseMat.dispose();
      healCrossMat.dispose();
    },
    setOpacity(alpha = 1.0, hideWeapon = false) {
      const clamped = Math.max(0, Math.min(1, alpha));
      st.lastAlpha = clamped;
      st.hideWeaponInAds = hideWeapon;
      const isTrans = clamped < 0.98;
      for (let i = 0; i < allAvatarMats.length; i++) {
        const m = allAvatarMats[i];
        if (m.transparent !== isTrans) {
          m.transparent = isTrans;
          m.needsUpdate = true;
        }
        m.opacity = clamped;
      }
      weaponMount.visible = !hideWeapon && clamped > 0.25 && !healProp.visible;
    },
    setWeapon(weaponId) {
      const targetKey = weapons[weaponId] ? weaponId : 'fists';
      st.activeWeapon = targetKey;
      for (const [k, m] of Object.entries(weapons)) {
        m.visible = k === targetKey;
      }
    },
    setHealth(hp, maxHp = 100) {
      overheadPlate?.userData.renderPlate(hp, maxHp);
    },
    triggerDamageFlash() {
      st.damageFlashTimer = 0.14;
    },
    triggerFireEffect() {
      st.recoilAmount = 1.0;
      st.flashTimer = 0.055;
    },
    getMuzzleWorldPosition(fallbackOut) {
      const activeMesh = weapons[st.activeWeapon];
      const tip = activeMesh?.userData?.muzzleTip;
      if (tip) {
        root.updateMatrixWorld(true);
        tip.getWorldPosition(tmpWorldVec);
        return { x: tmpWorldVec.x, y: tmpWorldVec.y, z: tmpWorldVec.z };
      }
      return fallbackOut;
    },
    animate(
      walkPhase,
      state,
      equipped,
      pitch = 0,
      moveMode = 'idle',
      dt = 0.016,
      isSliding = false,
      isCrouching = false,
      isHealing = false
    ) {
      st.breathClock += dt * 2.3;
      st.recoilAmount = damp(st.recoilAmount, 0, 16, dt);
      parachute.visible = state === 'parachuting';
      const activeHeal = Boolean(isHealing && state === 'ground' && !isSliding);
      healProp.visible = activeHeal;
      weaponMount.visible = !activeHeal && !st.hideWeaponInAds && st.lastAlpha > 0.25;

      if (st.damageFlashTimer > 0) {
        st.damageFlashTimer -= dt;
        const activeHex = st.damageFlashTimer > 0 ? 0xdc2626 : 0x000000;
        for (let i = 0; i < hitFlashMats.length; i++) {
          hitFlashMats[i].emissive.setHex(activeHex);
        }
      }

      const activeW = weapons[equipped] || weapons.fists;
      const flash = activeW?.userData?.muzzleFlash;
      if (st.flashTimer > 0) {
        st.flashTimer -= dt;
        if (flash) {
          flash.visible = true;
          flash.rotation.z = Math.random() * Math.PI;
        }
      } else if (flash) {
        flash.visible = false;
      }

      const speed = 13;

      // Nado: crol al avanzar (cuerpo inclinado, brazadas alternas, patada) y pataleo vertical
      // en el sitio. El arma va guardada.
      if (moveMode === 'swim' || moveMode === 'swim_fast' || moveMode === 'swim_idle') {
        weaponMount.visible = false;
        const moving = moveMode !== 'swim_idle';
        const stroke = walkPhase;
        pelvisGroup.position.y = damp(pelvisGroup.position.y, moving ? 1.0 : 0.9, 8, dt);
        pelvisGroup.rotation.x = damp(pelvisGroup.rotation.x, moving ? 1.05 : 0.12, 6, dt);
        torsoGroup.rotation.set(
          damp(torsoGroup.rotation.x, moving ? 0.12 : 0.04, 8, dt),
          damp(torsoGroup.rotation.y, moving ? Math.sin(stroke) * 0.22 : 0, 8, dt),
          damp(torsoGroup.rotation.z, 0, 8, dt)
        );
        if (moving) {
          // Brazadas de crol: un brazo pasa por encima mientras el otro empuja bajo el agua
          rightArm.shoulder.rotation.set(-1.55 + Math.sin(stroke) * 1.55, 0, -0.18);
          leftArm.shoulder.rotation.set(-1.55 - Math.sin(stroke) * 1.55, 0, 0.18);
          rightArm.elbow.rotation.x = damp(rightArm.elbow.rotation.x, -0.25 - Math.max(0, Math.cos(stroke)) * 0.7, 14, dt);
          leftArm.elbow.rotation.x = damp(leftArm.elbow.rotation.x, -0.25 - Math.max(0, -Math.cos(stroke)) * 0.7, 14, dt);
          const kick = Math.sin(stroke * 3) * 0.32;
          leftLeg.hip.rotation.x = damp(leftLeg.hip.rotation.x, kick, 18, dt);
          rightLeg.hip.rotation.x = damp(rightLeg.hip.rotation.x, -kick, 18, dt);
          leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, 0.2 + Math.max(0, kick), 18, dt);
          rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, 0.2 + Math.max(0, -kick), 18, dt);
          headPivot.rotation.x = damp(headPivot.rotation.x, -0.85, 10, dt);
        } else {
          // Mantenerse a flote: brazos barriendo a los lados y piernas pedaleando
          const tread = Math.sin(st.breathClock * 2.6);
          rightArm.shoulder.rotation.set(-0.55 + tread * 0.2, 0, -0.75 - tread * 0.3);
          leftArm.shoulder.rotation.set(-0.55 - tread * 0.2, 0, 0.75 + tread * 0.3);
          rightArm.elbow.rotation.x = damp(rightArm.elbow.rotation.x, -0.5, 10, dt);
          leftArm.elbow.rotation.x = damp(leftArm.elbow.rotation.x, -0.5, 10, dt);
          leftLeg.hip.rotation.x = damp(leftLeg.hip.rotation.x, -0.35 + tread * 0.35, 10, dt);
          rightLeg.hip.rotation.x = damp(rightLeg.hip.rotation.x, -0.35 - tread * 0.35, 10, dt);
          leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, 0.75, 10, dt);
          rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, 0.75, 10, dt);
          headPivot.rotation.x = damp(headPivot.rotation.x, -pitch * 0.5, 10, dt);
        }
        return;
      }

      if (state === 'plane' || moveMode === 'seated') {
        const turb = Math.sin(st.breathClock * 1.4) * 0.035;
        pelvisGroup.position.y = damp(pelvisGroup.position.y, 0.50, speed, dt);
        pelvisGroup.rotation.x = damp(pelvisGroup.rotation.x, 0, speed, dt);
        torsoGroup.rotation.set(
          damp(torsoGroup.rotation.x, 0.06 + turb, speed, dt),
          0,
          damp(torsoGroup.rotation.z, turb * 1.1, speed, dt)
        );
        leftLeg.hip.rotation.x = damp(leftLeg.hip.rotation.x, -1.48, speed, dt);
        leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, 1.52, speed, dt);
        rightLeg.hip.rotation.x = damp(rightLeg.hip.rotation.x, -1.48, speed, dt);
        rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, 1.52, speed, dt);

        leftArm.shoulder.rotation.set(damp(leftArm.shoulder.rotation.x, -0.45, speed, dt), 0, 0.08);
        leftArm.elbow.rotation.x = damp(leftArm.elbow.rotation.x, -0.95, speed, dt);
        rightArm.shoulder.rotation.set(damp(rightArm.shoulder.rotation.x, -0.45, speed, dt), 0, -0.08);
        rightArm.elbow.rotation.x = damp(rightArm.elbow.rotation.x, -0.95, speed, dt);
        headPivot.rotation.x = damp(headPivot.rotation.x, -pitch * 0.5, speed, dt);
        return;
      }

      if (state === 'skydiving') {
        const flutter = Math.sin(st.breathClock * 8) * 0.075;
        pelvisGroup.position.y = damp(pelvisGroup.position.y, 0.85, speed, dt);
        pelvisGroup.rotation.x = damp(pelvisGroup.rotation.x, 0.92 - pitch * 0.35, 10, dt);
        torsoGroup.rotation.set(0, 0, flutter * 0.5);

        leftArm.shoulder.rotation.set(damp(leftArm.shoulder.rotation.x, -2.2 + flutter, 10, dt), 0, -0.5);
        leftArm.elbow.rotation.x = damp(leftArm.elbow.rotation.x, -0.35, 10, dt);
        rightArm.shoulder.rotation.set(damp(rightArm.shoulder.rotation.x, -2.2 - flutter, 10, dt), 0, 0.5);
        rightArm.elbow.rotation.x = damp(rightArm.elbow.rotation.x, -0.35, 10, dt);

        leftLeg.hip.rotation.x = damp(leftLeg.hip.rotation.x, 0.25 + flutter, 10, dt);
        leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, 0.45, 10, dt);
        rightLeg.hip.rotation.x = damp(rightLeg.hip.rotation.x, 0.15 - flutter, 10, dt);
        rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, 0.55, 10, dt);
        st.wasAirborne = true;
        return;
      }

      if (state === 'parachuting') {
        const sway = Math.sin(st.breathClock * 1.3) * 0.05;
        pelvisGroup.position.y = damp(pelvisGroup.position.y, 0.88, speed, dt);
        pelvisGroup.rotation.x = damp(pelvisGroup.rotation.x, 0.06, speed, dt);
        torsoGroup.rotation.set(0.04, 0, sway);
        parachute.rotation.z = sway;

        leftArm.shoulder.rotation.set(damp(leftArm.shoulder.rotation.x, -2.72, speed, dt), 0, 0.16);
        leftArm.elbow.rotation.x = damp(leftArm.elbow.rotation.x, -0.28, speed, dt);
        rightArm.shoulder.rotation.set(damp(rightArm.shoulder.rotation.x, -2.72, speed, dt), 0, -0.16);
        rightArm.elbow.rotation.x = damp(rightArm.elbow.rotation.x, -0.28, speed, dt);

        leftLeg.hip.rotation.x = damp(leftLeg.hip.rotation.x, 0.14, speed, dt);
        leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, 0.32, speed, dt);
        rightLeg.hip.rotation.x = damp(rightLeg.hip.rotation.x, 0.22, speed, dt);
        rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, 0.38, speed, dt);
        headPivot.rotation.x = damp(headPivot.rotation.x, -pitch * 0.5, speed, dt);
        st.wasAirborne = true;
        return;
      }

      pelvisGroup.rotation.x = damp(pelvisGroup.rotation.x, 0, speed, dt);

      if (moveMode === 'vault') {
        // Animación Parkour Vaulting: mano izquierda apoyada al frente sobre el obstáculo y piernas pasando de lado
        pelvisGroup.position.y = damp(pelvisGroup.position.y, 0.72, 18, dt);
        pelvisGroup.rotation.x = damp(pelvisGroup.rotation.x, 0.18, 18, dt);
        torsoGroup.rotation.set(
          damp(torsoGroup.rotation.x, 0.44, 18, dt),
          damp(torsoGroup.rotation.y, -0.22, 18, dt),
          damp(torsoGroup.rotation.z, 0.28, 18, dt)
        );
        leftLeg.hip.rotation.set(damp(leftLeg.hip.rotation.x, -1.05, 18, dt), 0, damp(leftLeg.hip.rotation.z || 0, 0.48, 18, dt));
        leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, 1.25, 18, dt);
        rightLeg.hip.rotation.set(damp(rightLeg.hip.rotation.x, -0.92, 18, dt), 0, damp(rightLeg.hip.rotation.z || 0, 0.42, 18, dt));
        rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, 1.18, 18, dt);

        leftArm.shoulder.rotation.set(damp(leftArm.shoulder.rotation.x, -0.58, 20, dt), -0.18, 0.34);
        leftArm.elbow.rotation.x = damp(leftArm.elbow.rotation.x, -0.12, 20, dt);
        rightArm.shoulder.rotation.set(damp(rightArm.shoulder.rotation.x, -1.15, 18, dt), 0.15, -0.22);
        rightArm.elbow.rotation.x = damp(rightArm.elbow.rotation.x, -0.45, 18, dt);
        headPivot.rotation.x = damp(headPivot.rotation.x, -0.18, 16, dt);
        st.wasAirborne = true;
        return;
      }

      leftLeg.hip.rotation.z = damp(leftLeg.hip.rotation.z || 0, 0, speed, dt);
      rightLeg.hip.rotation.z = damp(rightLeg.hip.rotation.z || 0, 0, speed, dt);

      if (isSliding || moveMode === 'slide') {
        pelvisGroup.position.y = damp(pelvisGroup.position.y, 0.36, 16, dt);
        torsoGroup.rotation.set(
          damp(torsoGroup.rotation.x, -0.46, 15, dt),
          damp(torsoGroup.rotation.y, 0.14, 15, dt),
          damp(torsoGroup.rotation.z, 0.22, 15, dt)
        );
        rightLeg.hip.rotation.x = damp(rightLeg.hip.rotation.x, -1.28, 16, dt);
        rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, 0.14, 16, dt);
        leftLeg.hip.rotation.x = damp(leftLeg.hip.rotation.x, -0.36, 16, dt);
        leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, 1.62, 16, dt);
      } else {
        const isJump = moveMode === 'jump';
        const isFall = moveMode === 'fall';
        const isAir = isJump || isFall;
        const isSprint = moveMode === 'sprint';
        const isWalk = moveMode === 'walk' || isSprint || moveMode === 'crouch_walk';

        if (st.wasAirborne && !isAir) {
          st.landingCompression = 0.18;
        }
        st.wasAirborne = isAir;
        st.landingCompression = damp(st.landingCompression, 0, 10, dt);

        const breath = Math.sin(st.breathClock) * 0.02;
        const strideAmp = isSprint ? 0.86 : activeHeal ? 0.32 : isCrouching ? 0.42 : isWalk ? 0.56 : 0;
        const hipSwing = Math.sin(walkPhase) * strideAmp;
        const vertBob = isWalk && !isAir ? Math.abs(Math.cos(walkPhase)) * (isSprint ? 0.065 : 0.035) : 0;
        const basePelvisY = isCrouching ? 0.58 : activeHeal ? 0.74 : 0.90;

        pelvisGroup.position.y = damp(
          pelvisGroup.position.y,
          basePelvisY + vertBob - st.landingCompression,
          15,
          dt
        );

        const targetTorsoPitch = activeHeal
          ? 0.38
          : isCrouching
          ? 0.32
          : isSprint
          ? 0.22
          : isAir
          ? -0.06
          : st.landingCompression * 0.5 + breath;
        const targetTorsoYaw = isWalk && !isAir ? Math.sin(walkPhase) * 0.08 : 0;
        torsoGroup.rotation.set(
          damp(torsoGroup.rotation.x, targetTorsoPitch, speed, dt),
          damp(torsoGroup.rotation.y, targetTorsoYaw, speed, dt),
          damp(torsoGroup.rotation.z, 0, speed, dt)
        );

        if (isAir) {
          leftLeg.hip.rotation.x = damp(leftLeg.hip.rotation.x, isJump ? -0.68 : -0.35, speed, dt);
          leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, isJump ? 0.95 : 0.65, speed, dt);
          rightLeg.hip.rotation.x = damp(rightLeg.hip.rotation.x, isJump ? 0.26 : 0.15, speed, dt);
          rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, 0.42, speed, dt);
        } else if (isCrouching) {
          leftLeg.hip.rotation.x = damp(leftLeg.hip.rotation.x, -0.78 - hipSwing * 0.5, 16, dt);
          leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, 1.38, 16, dt);
          rightLeg.hip.rotation.x = damp(rightLeg.hip.rotation.x, -0.78 + hipSwing * 0.5, 16, dt);
          rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, 1.38, 16, dt);
        } else {
          const landingKnee = st.landingCompression * 1.6;
          const kneeWalkL = Math.max(0, hipSwing) * (isSprint ? 1.05 : 0.72) + landingKnee;
          const kneeWalkR = Math.max(0, -hipSwing) * (isSprint ? 1.05 : 0.72) + landingKnee;

          leftLeg.hip.rotation.x = damp(leftLeg.hip.rotation.x, -hipSwing - landingKnee * 0.55, 16, dt);
          leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, kneeWalkL, 16, dt);
          rightLeg.hip.rotation.x = damp(rightLeg.hip.rotation.x, hipSwing - landingKnee * 0.55, 16, dt);
          rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, kneeWalkR, 16, dt);
        }
      }

      const recoilKick = st.recoilAmount * 0.28;
      const isTwoHandLongGun = equipped === 'rifle' || equipped === 'shotgun' || equipped === 'smg' || equipped === 'sniper';
      const isSprintingCarry = moveMode === 'sprint' && !isSliding && st.recoilAmount < 0.05;

      if (activeHeal) {
        // Animación 3D de curación (2.0s): ambas manos al frente sosteniendo y aplicando el botiquín
        const wrapMotion = Math.sin(st.breathClock * 6.5) * 0.09;
        healProp.position.y = 0.15 + Math.abs(wrapMotion) * 0.18;
        healProp.rotation.z = wrapMotion * 0.8;
        rightArm.shoulder.rotation.set(
          damp(rightArm.shoulder.rotation.x, -1.06 + wrapMotion, 16, dt),
          damp(rightArm.shoulder.rotation.y, 0.44, 16, dt),
          -0.14
        );
        rightArm.elbow.rotation.x = damp(rightArm.elbow.rotation.x, -0.96 - wrapMotion, 16, dt);
        leftArm.shoulder.rotation.set(
          damp(leftArm.shoulder.rotation.x, -1.06 - wrapMotion, 16, dt),
          damp(leftArm.shoulder.rotation.y, -0.44, 16, dt),
          0.14
        );
        leftArm.elbow.rotation.x = damp(leftArm.elbow.rotation.x, -0.96 + wrapMotion, 16, dt);
        headPivot.rotation.x = damp(headPivot.rotation.x, 0.32, 14, dt);
        return;
      }

      if (isTwoHandLongGun) {
        if (isSprintingCarry) {
          rightArm.shoulder.rotation.set(damp(rightArm.shoulder.rotation.x, -0.95, speed, dt), 0.35, 0);
          rightArm.elbow.rotation.x = damp(rightArm.elbow.rotation.x, -0.65, speed, dt);
          leftArm.shoulder.rotation.set(damp(leftArm.shoulder.rotation.x, -1.05, speed, dt), -0.45, 0);
          leftArm.elbow.rotation.x = damp(leftArm.elbow.rotation.x, -0.55, speed, dt);
        } else {
          rightArm.shoulder.rotation.set(
            damp(rightArm.shoulder.rotation.x, -1.32 - pitch * 0.75 + recoilKick, 18, dt),
            damp(rightArm.shoulder.rotation.y, -0.08, speed, dt),
            0
          );
          rightArm.elbow.rotation.x = damp(rightArm.elbow.rotation.x, -0.25 - recoilKick * 0.6, 18, dt);

          leftArm.shoulder.rotation.set(
            damp(leftArm.shoulder.rotation.x, -1.25 - pitch * 0.65 + recoilKick * 0.5, 18, dt),
            damp(leftArm.shoulder.rotation.y, -0.54, speed, dt),
            0
          );
          leftArm.elbow.rotation.x = damp(leftArm.elbow.rotation.x, -0.35, 18, dt);
        }
      } else if (equipped === 'pistol') {
        rightArm.shoulder.rotation.set(
          damp(rightArm.shoulder.rotation.x, -1.42 - pitch * 0.8 + recoilKick * 1.2, 18, dt),
          damp(rightArm.shoulder.rotation.y, -0.05, speed, dt),
          0
        );
        rightArm.elbow.rotation.x = damp(rightArm.elbow.rotation.x, -0.15 - recoilKick * 0.5, 18, dt);
        leftArm.shoulder.rotation.set(
          damp(leftArm.shoulder.rotation.x, -1.36 - pitch * 0.75, 16, dt),
          damp(leftArm.shoulder.rotation.y, -0.46, 16, dt),
          0
        );
        leftArm.elbow.rotation.x = damp(leftArm.elbow.rotation.x, -0.22, 16, dt);
      } else {
        const armSwing =
          moveMode === 'walk' || moveMode === 'sprint'
            ? Math.sin(walkPhase) * (moveMode === 'sprint' ? 0.8 : 0.48)
            : Math.sin(st.breathClock) * 0.04;
        const slash = st.recoilAmount * 1.35;
        rightArm.shoulder.rotation.set(
          damp(rightArm.shoulder.rotation.x, -0.58 + armSwing - slash, 16, dt),
          0.1,
          -0.12
        );
        rightArm.elbow.rotation.x = damp(rightArm.elbow.rotation.x, -0.55 + slash * 0.4, 16, dt);
        leftArm.shoulder.rotation.set(damp(leftArm.shoulder.rotation.x, -armSwing, 16, dt), 0, 0.06);
        leftArm.elbow.rotation.x = damp(leftArm.elbow.rotation.x, moveMode === 'sprint' ? -0.85 : -0.32, 16, dt);
      }

      headPivot.rotation.x = damp(headPivot.rotation.x, -pitch * 0.62, 16, dt);
    }
  };
}

// ==================== RIG VIEWMODEL EN 1RA PERSONA CON SOPORTE PARA LAS 5 ARMAS ====================
class FirstPersonWeaponRig {
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
      shotgun: this.buildArmedRig('shotgun'),
      smg: this.buildArmedRig('smg'),
      rifle: this.buildArmedRig('rifle'),
      sniper: this.buildArmedRig('sniper')
    };
    Object.values(this.models).forEach((m) => this.pivot.add(m));

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
    } else if (weaponId === 'pistol') {
      rightArm.position.set(0.015, -0.09, 0.04);
      rightArm.rotation.set(0.22, -0.06, 0);
      leftArm.position.set(-0.04, -0.095, 0.03);
      leftArm.rotation.set(0.24, 0.28, -0.08);
    } else {
      rightArm.position.set(0.015, -0.09, 0.08);
      rightArm.rotation.set(0.2, -0.05, 0);
      leftArm.position.set(-0.045, -0.045, -0.26);
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
    if (this.currentWeapon !== key && !instant) this.equipBlend = 0;
    this.currentWeapon = key;
    for (const [id, mesh] of Object.entries(this.models)) {
      mesh.visible = id === key;
    }
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
    const recoilScale = weaponId === 'shotgun' || weaponId === 'sniper' ? 0.085 : weaponId === 'smg' ? 0.032 : 0.05;
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
    } else if (this.currentWeapon === 'pistol') {
      _fpHipPos.set(0.21, -0.18, -0.38);
      _fpAdsPos.set(0.075, -0.148, -0.32);
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
        if (mag) mag.position.y = -rSin * 0.14;
      } else {
        if (mag) mag.position.y = 0;
        if (slide) slide.position.z = -this.recoilZ * 1.1;
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

// ==================== CONTROLADOR PRINCIPAL EN ESCALA MÉTRICA REAL (1.80M) ====================
export class LocalPlayerController {
  constructor(scene, camera, domElement, audio) {
    this.scene = scene;
    this.camera = camera;
    this.domElement = domElement;
    this.audio = audio;

    this.camera.near = 0.06;
    this.camera.fov = 72;
    this.camera.updateProjectionMatrix();

    this.cameraMode = 'third';
    this.planeViewMode = 'cabin_third';
    this.avatar = null;
    this.seatIndex = 0;

    this.fpCanopy = createParachuteCanopy();
    this.scene.add(this.fpCanopy);
    this.fpRig = new FirstPersonWeaponRig();

    this.active = false;
    this.alive = true;
    this.state = 'lobby';

    this.x = 0;
    this.y = 30;
    this.z = 0;
    this.vy = 0;
    this.yaw = 0;
    this.pitch = -0.1;
    this.onGround = false;
    this.walkPhase = 0;
    this.stepAccum = 0;
    this.moveMode = 'idle';

    this.airMomentumX = 0;
    this.airMomentumZ = 0;

    this.isCrouching = false;
    this.isSliding = false;
    this.isSwimming = false;
    this.swimStrokeAccum = 0;
    this.breath = SWIM_CONFIG.maxBreath; // lo fija el servidor (autoritativo)
    this.isVaulting = false;
    this.vaultTimer = 0;
    this.vaultDuration = 0.42;
    this.vaultStartX = 0;
    this.vaultStartY = 0;
    this.vaultStartZ = 0;
    this.vaultEndX = 0;
    this.vaultEndY = 0;
    this.vaultEndZ = 0;
    this.vaultApexY = 0;
    this.slideTimer = 0;
    this.slideCooldownUntil = 0;
    this.slideSpeed = 0;
    this.slideDirX = 0;
    this.slideDirZ = 0;
    this.slideDustAccum = 0;

    this.jumpStartAltitude = PARACHUTE_CONFIG.planeHeightAboveValley;
    this.currentDescentSpeed = 0;
    this.currentGroundClearance = 0;
    this.airPeakY = 0;

    this.smoothEyeHeight = PLAYER_EYE_HEIGHT;
    this.smoothCamDist = 3.35;
    this.smoothCamPos = new THREE.Vector3(0, 40, -30);
    this.cameraInitializedOnFoot = false;
    this.cameraLandingOffset = 0;

    this.hp = 100;
    this.kills = 0;
    this.equipped = 'fists';
    this.weapons = {
      fists: { unlocked: true, mag: 0 },
      pistol: { unlocked: false, mag: 0 },
      shotgun: { unlocked: false, mag: 0 },
      smg: { unlocked: false, mag: 0 },
      rifle: { unlocked: false, mag: 0 },
      sniper: { unlocked: false, mag: 0 }
    };
    this.reserveAmmo = 24;
    this.medkits = 0;
    this.bandages = 1;
    this.isHealing = false;
    this.healStart = 0;
    this.healDuration = HEAL_CONFIG.durationMs || 2000;
    this.healItemType = 'medkit';
    this.healParticleAccum = 0;
    this.shakeTimer = 0;
    this.shakeDuration = 0.35;
    this.shakeIntensity = 0;
    this.reloading = false;
    this.reloadStart = 0;
    this.reloadDuration = 1500;
    this.lastShotAt = 0;

    this.keys = {};
    this.mouseDownLeft = false;
    this.aimingZoom = false;
    this.pointerLocked = false;

    this.onJumpRequest = null;
    this.onShootRequest = null;
    this.onReloadRequest = null;
    this.onSwitchWeaponRequest = null;
    this.onHealRequest = null;
    this.onCancelHealRequest = null;
    this.onHealCancelledLocal = null;
    this.onSpawnHealParticles = null;
    this.onSlideChange = null;
    this.onSpawnSlideDust = null;
    this.onCameraModeChanged = null;
    this.onInteractRequest = null;
    this.onBreakWindowRequest = null;

    this.bindInputs();
  }

  onResize(aspect) {
    this.fpRig.setAspect(aspect);
  }

  spawnAvatar(name, colorIdx = 0, seatIndex = 0) {
    this.seatIndex = seatIndex;
    if (this.avatar) {
      this.scene.remove(this.avatar.root);
      this.avatar.dispose?.();
    }
    this.avatar = createVoxelAvatar(name, colorIdx, true);
    this.scene.add(this.avatar.root);

    const hex = AVATAR_COLORS[colorIdx % AVATAR_COLORS.length];
    this.fpRig.setShirtColor(hex);
    this.setEquippedWeaponVisual(this.equipped, true);
    this.cameraInitializedOnFoot = false;
  }

  triggerCameraShake(intensity = 0.24, durationSec = 0.36) {
    this.shakeIntensity = intensity;
    this.shakeDuration = Math.max(0.05, durationSec);
    this.shakeTimer = this.shakeDuration;
  }

  tryRequestHeal(preferredType = 'medkit') {
    if (!this.alive || this.state !== 'ground' || !this.onGround || this.hp >= 100 || this.isHealing) return;
    if (this.isSwimming) return; // no se puede vendar nadando
    if (this.medkits <= 0 && this.bandages <= 0) return;
    this.endSlide();
    this.reloading = false;
    this.onHealRequest?.(preferredType);
  }

  beginClientHeal(itemType = 'medkit', durationMs = 2000) {
    this.isHealing = true;
    this.healItemType = itemType;
    this.healStart = performance.now();
    this.healDuration = durationMs;
    this.healParticleAccum = 0;
  }

  cancelClientHeal(notifyServer = false) {
    if (!this.isHealing) return;
    this.isHealing = false;
    this.audio.stopBandaging?.();
    if (notifyServer) {
      this.onCancelHealRequest?.();
      this.onHealCancelledLocal?.();
    }
  }

  setEquippedWeaponVisual(weaponId, instant = false) {
    this.avatar?.setWeapon(weaponId);
    this.fpRig.setWeapon(weaponId, instant);
  }

  toggleCameraMode() {
    if (this.state === 'plane') {
      if (this.planeViewMode === 'cabin_third') {
        this.planeViewMode = 'cabin_first';
        this.cameraMode = 'first';
        this.onCameraModeChanged?.('cabin_first');
      } else if (this.planeViewMode === 'cabin_first') {
        this.planeViewMode = 'plane_exterior';
        this.cameraMode = 'third';
        this.onCameraModeChanged?.('plane_exterior');
      } else {
        this.planeViewMode = 'cabin_third';
        this.cameraMode = 'third';
        this.onCameraModeChanged?.('cabin_third');
      }
      return;
    }

    this.cameraMode = this.cameraMode === 'third' ? 'first' : 'third';
    this.onCameraModeChanged?.(this.cameraMode);
  }

  tryStartSlideOrCrouch(code) {
    if (!this.alive || this.state !== 'ground' || !this.onGround || this.isSwimming) return;

    const sprintingForward =
      (this.keys['ShiftLeft'] || this.keys['ShiftRight']) &&
      (this.keys['KeyW'] || this.keys['ArrowUp']);

    if (sprintingForward && !this.isSliding) {
      const nowSec = performance.now() / 1000;
      if (nowSec >= this.slideCooldownUntil) {
        this.isCrouching = false;
        this.isSliding = true;
        this.slideTimer = SLIDE_CONFIG.durationSec;
        this.slideCooldownUntil = nowSec + SLIDE_CONFIG.cooldownSec;
        this.slideSpeed = SLIDE_CONFIG.initialSpeed;
        this.slideDirX = Math.sin(this.yaw);
        this.slideDirZ = Math.cos(this.yaw);
        this.slideDustAccum = 0;
        this.audio.playSlide(0);
        this.onSlideChange?.(true);
        return;
      }
    }

    // Si no está esprintando hacia adelante, 'C' alterna agacharse en modo sigilo (para ocultarse en arbustos altos)
    if (code === 'KeyC' && !this.isSliding) {
      this.isCrouching = !this.isCrouching;
    }
  }

  endSlide() {
    if (!this.isSliding) return;
    this.isSliding = false;
    this.slideTimer = 0;
    this.onSlideChange?.(false);
  }

  initiateLocalJumpFromPlane(planeState, worldInstance) {
    if (worldInstance && worldInstance.planeMesh) {
      const rampExit = worldInstance.getPlaneSmoothAnchor(0, -1.4, -7.8);
      this.x = rampExit.x;
      this.y = rampExit.y;
      this.z = rampExit.z;
      this.smoothCamPos.set(rampExit.x, rampExit.y + 3, rampExit.z);
    }
    if (planeState) {
      this.airMomentumX = (planeState.vx || 0) * 0.35;
      this.airMomentumZ = (planeState.vz || 0) * 0.35;
    }
    const groundY = this.currentMap ? this.currentMap.getFloorBelowY(this.x, this.y, this.z) : 8;
    this.jumpStartAltitude = Math.max(15, this.y - groundY);
    this.currentDescentSpeed = PARACHUTE_CONFIG.freefallInitialSpeed;
    this.state = 'skydiving';
    this.onGround = false;
    this.cameraInitializedOnFoot = true;
  }

  cycleWeapon(delta) {
    const order = ['fists', ...WEAPON_SLOTS].filter((w) => this.weapons[w]?.unlocked);
    if (order.length <= 1) return;
    const idx = Math.max(0, order.indexOf(this.equipped));
    const next = order[(idx + delta + order.length) % order.length];
    this.trySwitchWeapon(next);
  }

  bindInputs() {
    window.addEventListener('keydown', (e) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT') return;
      this.keys[e.code] = true;

      if (!this.active) return;

      if (e.code === 'KeyV') this.toggleCameraMode();
      if (!this.alive) return;

      if (e.code === 'KeyC' || e.code === 'ControlLeft' || e.code === 'ControlRight') {
        this.tryStartSlideOrCrouch(e.code);
      }

      if (e.code === 'Space' || e.code === 'KeyF') {
        if (this.state === 'plane') {
          this.initiateLocalJumpFromPlane(this.lastPlaneState, this.lastWorldInstance);
          this.onJumpRequest?.();
        } else if (this.state === 'skydiving') {
          if (this.currentGroundClearance >= PARACHUTE_CONFIG.minClearanceToOpen) {
            this.state = 'parachuting';
            this.audio.playParachuteOpen();
            this.onJumpRequest?.();
          }
        } else if (this.state === 'ground') {
          if (this.onGround && e.code === 'Space' && !this.isVaulting && !this.isSwimming) {
            const pressingForward = Boolean(this.keys['KeyW'] || this.keys['ArrowUp']);
            const vaultTarget = pressingForward
              ? findVaultableObstacle(this.currentMap, this.x, this.y, this.z, this.yaw)
              : null;
            if (vaultTarget) {
              this.endSlide();
              this.isCrouching = false;
              if (this.isHealing) this.cancelClientHeal(true);
              this.isVaulting = true;
              this.vaultTimer = 0;
              this.vaultDuration = 0.42;
              this.vaultStartX = this.x;
              this.vaultStartY = this.y;
              this.vaultStartZ = this.z;
              this.vaultEndX = vaultTarget.endX;
              this.vaultEndY = vaultTarget.endY;
              this.vaultEndZ = vaultTarget.endZ;
              this.vaultApexY = vaultTarget.apexY;
              this.vy = 0;
              this.onGround = false;
              this.moveMode = 'vault';
              this.audio.playVault?.();
              if (vaultTarget.breakWindowId) {
                this.onBreakWindowRequest?.(vaultTarget.breakWindowId);
              }
            } else {
              this.endSlide();
              this.isCrouching = false;
              this.vy = 7.6;
              this.onGround = false;
              this.airPeakY = this.y;
            }
          } else if (
            !this.onGround &&
            this.currentGroundClearance >= PARACHUTE_CONFIG.minClearanceToOpen &&
            this.airPeakY - (this.y - this.currentGroundClearance) >= PARACHUTE_CONFIG.minJumpHeightRef
          ) {
            const floorY = this.y - this.currentGroundClearance;
            this.jumpStartAltitude = Math.max(PARACHUTE_CONFIG.minJumpHeightRef, this.airPeakY - floorY);
            this.currentDescentSpeed = Math.max(4, -this.vy);
            this.state = 'parachuting';
            this.audio.playParachuteOpen();
            this.onJumpRequest?.();
          }
        }
      }

      if (e.code === 'KeyR') this.tryReload();
      if (e.code === 'Digit1') this.trySwitchWeapon('pistol');
      if (e.code === 'Digit2') this.trySwitchWeapon('shotgun');
      if (e.code === 'Digit3') this.trySwitchWeapon('smg');
      if (e.code === 'Digit4') {
        if (this.weapons.rifle.unlocked) this.trySwitchWeapon('rifle');
        else this.tryRequestHeal('medkit');
      }
      if (e.code === 'Digit5') {
        if (this.weapons.sniper.unlocked) this.trySwitchWeapon('sniper');
        else this.tryRequestHeal('bandage');
      }
      if (e.code === 'Backquote' || e.code === 'Digit0') this.trySwitchWeapon('fists');

      if (e.code === 'KeyE') this.onInteractRequest?.();
      if (e.code === 'KeyH') this.tryRequestHeal('medkit');
      if (e.code === 'KeyG' || e.code === 'KeyQ') this.tryRequestHeal('bandage');
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.active || !this.alive || this.state !== 'ground') return;
        this.cycleWeapon(e.deltaY > 0 ? 1 : -1);
      },
      { passive: true }
    );

    this.domElement.addEventListener('mousedown', (e) => {
      this.audio.init();
      if (!this.active) return;

      if (!this.pointerLocked) {
        this.domElement.requestPointerLock?.();
        return;
      }

      if (e.button === 0) {
        this.mouseDownLeft = true;
        this.tryFireShot();
      } else if (e.button === 2) {
        this.aimingZoom = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDownLeft = false;
      if (e.button === 2) this.aimingZoom = false;
    });

    window.addEventListener('contextmenu', (e) => {
      if (this.active) e.preventDefault();
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.domElement;
      if (!this.pointerLocked) {
        this.mouseDownLeft = false;
        this.aimingZoom = false;
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked || !this.active) return;
      const isSniperAds = this.aimingZoom && this.equipped === 'sniper';
      const sens = isSniperAds ? 0.00075 : this.aimingZoom ? 0.0014 : 0.0022;
      this.yaw -= e.movementX * sens;
      this.pitch = Math.max(-1.35, Math.min(1.25, this.pitch - e.movementY * sens));
      this.fpRig.addMouseSway(e.movementX, e.movementY);
    });
  }

  trySwitchWeapon(weaponId) {
    if (!this.weapons[weaponId]?.unlocked || this.equipped === weaponId) return;
    this.equipped = weaponId;
    this.reloading = false;
    this.setEquippedWeaponVisual(weaponId, false);
    this.onSwitchWeaponRequest?.(weaponId);
  }

  tryReload() {
    const wSpec = WEAPONS[this.equipped];
    const wState = this.weapons[this.equipped];
    if (!wSpec || wSpec.magSize === 0 || this.reloading) return;
    if (wState.mag >= wSpec.magSize || this.reserveAmmo <= 0) return;

    this.reloading = true;
    this.reloadStart = performance.now();
    this.reloadDuration = wSpec.reloadMs;
    this.audio.playReload();
    this.onReloadRequest?.();
  }

  tryFireShot(mapData = this.currentMap) {
    if (!this.alive || this.state !== 'ground' || this.reloading || !mapData) return;
    if (this.isSwimming) return; // el arma va guardada mientras se nada

    if (this.isHealing) {
      this.cancelClientHeal(true);
    }

    const now = performance.now();
    const wSpec = WEAPONS[this.equipped];
    const wState = this.weapons[this.equipped];
    if (!wSpec || !wState?.unlocked) return;
    if (now - this.lastShotAt < wSpec.fireRateMs) return;

    if (wSpec.magSize > 0) {
      if (wState.mag <= 0) {
        this.tryReload();
        return;
      }
      wState.mag -= 1;
    }

    this.lastShotAt = now;
    this.pitch = Math.min(1.25, this.pitch + (wSpec.recoil || 0.016));
    this.avatar?.triggerFireEffect();
    this.fpRig.triggerFire(this.equipped);

    this.camera.getWorldDirection(_fireCamDir);

    const eyeH = this.isSliding
      ? PLAYER_SLIDE_EYE_HEIGHT
      : this.isCrouching
      ? PLAYER_CROUCH_EYE_HEIGHT
      : PLAYER_EYE_HEIGHT;
    let origin = { x: this.x, y: this.y + eyeH, z: this.z };
    _fireAimDir.copy(_fireCamDir);

    const sniperAds = this.aimingZoom && this.equipped === 'sniper';
    if (this.cameraMode === 'third' && !sniperAds) {
      const camOrigin = {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z
      };
      const camHit = raycastVoxels(mapData, camOrigin, _fireCamDir, wSpec.range + 20);
      if (this.avatar && this.equipped !== 'fists') {
        origin = this.avatar.getMuzzleWorldPosition(origin);
      }
      _fireAimDir.set(
        camHit.point.x - origin.x,
        camHit.point.y - origin.y,
        camHit.point.z - origin.z
      ).normalize();
    }

    if ((wSpec.pellets || 1) === 1) {
      const spread = this.aimingZoom ? wSpec.spread * (this.equipped === 'sniper' ? 0.08 : 0.35) : wSpec.spread;
      _fireAimDir.x += (Math.random() - 0.5) * spread;
      _fireAimDir.y += (Math.random() - 0.5) * spread;
      _fireAimDir.z += (Math.random() - 0.5) * spread;
      _fireAimDir.normalize();
    }

    this.onShootRequest?.({
      origin,
      dir: { x: _fireAimDir.x, y: _fireAimDir.y, z: _fireAimDir.z },
      weapon: this.equipped
    });
  }

  isSniperScoped() {
    return this.alive && this.state === 'ground' && this.equipped === 'sniper' && this.aimingZoom && !this.reloading;
  }

  update(dt, mapData, planeState, worldInstance = null, remoteEntities = []) {
    this.currentMap = mapData;
    this.lastPlaneState = planeState;
    this.lastWorldInstance = worldInstance;

    if (!this.active) {
      if (this.avatar) this.avatar.root.visible = false;
      this.fpCanopy.visible = false;
      this.fpRig.update(dt, { visible: false, state: 'lobby' });
      const t = performance.now() * 0.00012;
      this.camera.position.set(Math.cos(t) * 145 + 35, 58, Math.sin(t) * 145);
      this.camera.lookAt(45, 10, 6);
      return;
    }

    if (this.mouseDownLeft && WEAPONS[this.equipped]?.auto) {
      this.tryFireShot(mapData);
    }

    let movingHoriz = false;
    const sprinting =
      Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']) &&
      !this.aimingZoom &&
      !this.reloading &&
      !this.isSliding;

    if (sprinting && this.isCrouching) {
      this.isCrouching = false;
    }

    if (this.alive && mapData) {
      const fwdX = Math.sin(this.yaw);
      const fwdZ = Math.cos(this.yaw);
      const rightX = -Math.cos(this.yaw);
      const rightZ = Math.sin(this.yaw);

      let wishX = 0;
      let wishZ = 0;
      if (this.keys['KeyW'] || this.keys['ArrowUp']) { wishX += fwdX; wishZ += fwdZ; }
      if (this.keys['KeyS'] || this.keys['ArrowDown']) { wishX -= fwdX; wishZ -= fwdZ; }
      if (this.keys['KeyD'] || this.keys['ArrowRight']) { wishX += rightX; wishZ += rightZ; }
      if (this.keys['KeyA'] || this.keys['ArrowLeft']) { wishX -= rightX; wishZ -= rightZ; }
      const wLen = Math.hypot(wishX, wishZ);
      if (wLen > 0) { wishX /= wLen; wishZ /= wLen; }

      if (this.state === 'plane' && planeState && worldInstance) {
        const seat = worldInstance.getCabinSeatTransform(this.seatIndex);
        this.x = seat.x;
        this.y = seat.y;
        this.z = seat.z;
        const groundBelow = mapData.getFloorBelowY(seat.x, seat.y, seat.z);
        this.currentGroundClearance = Math.max(0, seat.y - groundBelow);
        this.jumpStartAltitude = Math.max(15, this.currentGroundClearance);
        this.moveMode = 'seated';

        if (this.avatar) {
          this.avatar.root.visible = this.planeViewMode !== 'cabin_first';
          this.avatar.root.position.set(seat.x, seat.y, seat.z);
          this.avatar.root.rotation.set(seat.pitch || 0, seat.yaw, seat.roll || 0);
          this.avatar.setWeapon(this.equipped);
          this.avatar.animate(0, 'plane', this.equipped, 0, 'seated', dt, false, false);
        }
      } else if (this.state === 'skydiving' || this.state === 'parachuting') {
        this.endSlide();
        this.isCrouching = false;
        const floorY = mapData.getFloorBelowY(this.x, this.y, this.z);
        this.currentGroundClearance = Math.max(0, this.y - floorY);

        this.airMomentumX *= Math.exp(-1.9 * dt);
        this.airMomentumZ *= Math.exp(-1.9 * dt);

        const hSpeed =
          this.state === 'skydiving'
            ? PARACHUTE_CONFIG.freefallHorizontalSpeed
            : PARACHUTE_CONFIG.canopyHorizontalSpeed;

        const targetDescent = computeTargetDescentSpeed(
          this.jumpStartAltitude,
          this.state,
          this.pitch,
          PARACHUTE_CONFIG
        );

        if (this.state === 'parachuting' && this.currentDescentSpeed > targetDescent) {
          this.currentDescentSpeed = Math.max(
            targetDescent,
            this.currentDescentSpeed - PARACHUTE_CONFIG.canopyOpenDecel * dt
          );
        } else if (this.currentDescentSpeed < targetDescent) {
          const ratio = this.currentDescentSpeed / Math.max(1, targetDescent);
          const aeroAccel = PARACHUTE_CONFIG.freefallGravityAccel * Math.max(0.25, 1 - ratio * ratio * 0.72);
          this.currentDescentSpeed = Math.min(targetDescent, this.currentDescentSpeed + aeroAccel * dt);
        } else {
          this.currentDescentSpeed = damp(this.currentDescentSpeed, targetDescent, 5.0, dt);
        }

        stepCharacterPhysics(
          mapData,
          this,
          wishX * hSpeed + this.airMomentumX,
          wishZ * hSpeed + this.airMomentumZ,
          dt,
          0
        );
        this.vy = -this.currentDescentSpeed;
        this.y += this.vy * dt;

        // Apertura automática calibrada a los 35 metros sobre el suelo (descenso total ~8s)
        if (this.state === 'skydiving' && this.y - floorY <= PARACHUTE_CONFIG.autoDeployHeight) {
          this.state = 'parachuting';
          this.audio.playParachuteOpen();
          this.onJumpRequest?.();
        }

        const updatedFloorY = mapData.getFloorBelowY(this.x, this.y + 0.7, this.z);
        if (this.y <= updatedFloorY + 0.12) {
          const impactSpeed = this.currentDescentSpeed;
          this.y = updatedFloorY;
          this.vy = 0;
          this.currentDescentSpeed = 0;
          this.airMomentumX = 0;
          this.airMomentumZ = 0;
          this.onGround = true;
          this.state = 'ground';
          this.airPeakY = updatedFloorY;
          this.cameraLandingOffset = -0.14 * Math.min(2.0, impactSpeed / 12);
          this.audio.playFootstep(false);
        }
        this.moveMode = 'fall';
      } else if (this.state === 'ground') {
        const wasOnGround = this.onGround;
        const preVy = this.vy;
        const prevX = this.x;
        const prevY = this.y;
        const prevZ = this.z;

        // Agua profunda: nadar a flote con la cabeza y los hombros fuera
        const swimmingNow = !this.isVaulting && isSwimmingAt(mapData, this.x, this.y, this.z);
        if (swimmingNow) {
          if (!this.isSwimming) {
            this.isSwimming = true;
            this.endSlide();
            this.isCrouching = false;
            if (this.isHealing) this.cancelClientHeal(true);
            this.audio.playSplash?.(Math.min(1.4, 0.5 + Math.abs(preVy) / 12));
          }
          const swimSpeed = sprinting ? SWIM_CONFIG.swimSprintSpeed : SWIM_CONFIG.swimSpeed;
          stepCharacterPhysics(mapData, this, wishX * swimSpeed, wishZ * swimSpeed, dt, 0, PLAYER_RADIUS, PLAYER_HEIGHT);
          if (remoteEntities.length > 0) {
            applyEntitySeparation(this, remoteEntities, PLAYER_RADIUS, dt, mapData);
          }
          this.y = damp(this.y, getSwimFloatY(mapData, this.x, this.z), 5, dt);
          this.vy = 0;
          this.onGround = true;
          this.airPeakY = this.y;
          this.currentGroundClearance = 0;

          const moved = Math.hypot(this.x - prevX, this.z - prevZ);
          movingHoriz = moved > 0.004;
          if (movingHoriz) {
            this.walkPhase += dt * (sprinting ? 7.5 : 5.2);
            this.moveMode = sprinting ? 'swim_fast' : 'swim';
            this.swimStrokeAccum += moved;
            if (this.swimStrokeAccum >= 1.6) {
              this.swimStrokeAccum = 0;
              this.audio.playSwimStroke?.();
            }
          } else {
            this.moveMode = 'swim_idle';
          }
        } else if (this.isSwimming) {
          this.isSwimming = false;
        }

        if (swimmingNow) {
          // (todo el movimiento de nado ya se resolvió arriba)
        } else if (this.isVaulting) {
          this.vaultTimer += dt;
          const vt = Math.min(1, this.vaultTimer / Math.max(0.1, this.vaultDuration));
          const smoothT = vt * vt * (3 - 2 * vt);
          this.x = this.vaultStartX + (this.vaultEndX - this.vaultStartX) * smoothT;
          this.z = this.vaultStartZ + (this.vaultEndZ - this.vaultStartZ) * smoothT;
          const baseLinearY = this.vaultStartY + (this.vaultEndY - this.vaultStartY) * smoothT;
          const arcLift = Math.sin(vt * Math.PI) * Math.max(0.35, this.vaultApexY - baseLinearY);
          this.y = baseLinearY + arcLift;
          this.vy = 0;
          this.moveMode = 'vault';
          movingHoriz = true;
          if (vt >= 1) {
            this.isVaulting = false;
            this.y = this.vaultEndY;
            this.onGround = true;
            this.airPeakY = this.y;
            this.cameraLandingOffset = -0.06;
            this.audio.playFootstep(false);
          }
        } else if (this.isSliding) {
          this.slideTimer -= dt;
          const aheadGround = mapData.getGroundHeightAt(
            this.x + this.slideDirX * 1.4,
            this.z + this.slideDirZ * 1.4,
            this.y
          );
          const curGround = mapData.getGroundHeightAt(this.x, this.z, this.y);
          const downhillSlope = (curGround - aheadGround) / 1.4;

          if (downhillSlope > 0.08) {
            this.slideSpeed = Math.min(16.5, this.slideSpeed + downhillSlope * SLIDE_CONFIG.downhillBoostFactor * dt);
            if (downhillSlope > 0.22 && this.slideTimer > 0.05) {
              this.slideTimer = Math.min(SLIDE_CONFIG.durationSec, this.slideTimer + dt * 0.35);
            }
          } else {
            const uphillBrake = downhillSlope < -0.05 ? Math.abs(downhillSlope) * 12 : 0;
            this.slideSpeed = Math.max(
              SLIDE_CONFIG.minEndSpeed,
              this.slideSpeed - (SLIDE_CONFIG.frictionDecay + uphillBrake) * dt
            );
          }

          stepCharacterPhysics(
            mapData,
            this,
            this.slideDirX * this.slideSpeed,
            this.slideDirZ * this.slideSpeed,
            dt,
            22,
            PLAYER_RADIUS,
            PLAYER_SLIDE_HEIGHT
          );

          this.slideDustAccum += dt;
          if (this.slideDustAccum >= 0.065) {
            this.slideDustAccum = 0;
            this.onSpawnSlideDust?.(this.x, this.y, this.z, Math.atan2(this.slideDirX, this.slideDirZ));
          }

          if (this.slideTimer <= 0 || !this.onGround) {
            this.endSlide();
          }
          this.moveMode = 'slide';
          movingHoriz = true;
        } else {
          if (this.isHealing && ((sprinting && wLen > 0) || !this.onGround)) {
            this.cancelClientHeal(true);
          }

          const wMoveMult = WEAPONS[this.equipped]?.moveSpeedMult || 1.0;
          const healMult = this.isHealing ? HEAL_CONFIG.moveSpeedMult || 0.45 : 1.0;
          const baseSpeed = this.isCrouching ? 3.4 : sprinting ? 8.2 : 5.5;
          // Vadear: con el agua por encima de la rodilla se avanza más lento
          const wading = this.y < WATER_LEVEL - 0.4 && getWaterDepthAt(mapData, this.x, this.z) > 0.45;
          const wadeMult = wading ? SWIM_CONFIG.wadeSpeedMult : 1.0;
          const speed = baseSpeed * wMoveMult * healMult * wadeMult;
          const effH = this.isCrouching ? PLAYER_CROUCH_HEIGHT : PLAYER_HEIGHT;

          if (this.isHealing) {
            this.healParticleAccum += dt;
            if (this.healParticleAccum >= 0.085) {
              this.healParticleAccum = 0;
              this.onSpawnHealParticles?.(this.x, this.y, this.z);
            }
          }

          stepCharacterPhysics(mapData, this, wishX * speed, wishZ * speed, dt, 22, PLAYER_RADIUS, effH);

          if (remoteEntities.length > 0) {
            applyEntitySeparation(this, remoteEntities, PLAYER_RADIUS, dt, mapData);
          }

          const floorY = mapData.getFloorBelowY(this.x, this.y + 0.35, this.z);
          this.currentGroundClearance = Math.max(0, this.y - floorY);

          if (!this.onGround) {
            if (wasOnGround) this.airPeakY = prevY;
            else this.airPeakY = Math.max(this.airPeakY, this.y);
            this.moveMode = this.vy > 0.6 ? 'jump' : 'fall';
          } else {
            if (!wasOnGround && preVy < -4.5) {
              this.cameraLandingOffset = -0.12 * Math.min(1.8, Math.abs(preVy) / 10);
              this.audio.playFootstep(false);
            }
            this.airPeakY = this.y;

            const moved = Math.hypot(this.x - prevX, this.z - prevZ);
            movingHoriz = moved > 0.008;
            if (movingHoriz) {
              this.walkPhase += dt * (sprinting ? 13 : this.isCrouching ? 7 : 9.5);
              this.moveMode = sprinting ? 'sprint' : this.isCrouching ? 'crouch_walk' : 'walk';
              this.stepAccum += moved;
              if (this.stepAccum >= 2.2) {
                this.stepAccum = 0;
                this.audio.playFootstep(mapData.isInWater(this.x, this.y, this.z));
              }
            } else {
              this.moveMode = this.isCrouching ? 'crouch_idle' : 'idle';
            }
          }
        }
      }

      if (this.state !== 'plane') {
        const minG = mapData.getTerrainHeightAt
          ? mapData.getTerrainHeightAt(this.x, this.z)
          : mapData.getGroundHeightAt(this.x, this.z, this.y);
        if (this.y < minG) this.y = minG;
      }
    }

    const sniperAds = this.isSniperScoped();
    if (this.avatar && this.state !== 'plane') {
      const camCloseFade =
        this.cameraMode === 'third'
          ? Math.max(0, Math.min(1, (this.smoothCamDist - 0.72) / 1.05))
          : 0;
      const adsAlpha = this.aimingZoom ? Math.min(camCloseFade, 0.85) : camCloseFade;
      const showLocalBody = this.alive && this.cameraMode === 'third' && !sniperAds && adsAlpha > 0.08;
      this.avatar.root.visible = showLocalBody;
      if (showLocalBody) {
        this.avatar.setOpacity(adsAlpha, this.aimingZoom && this.smoothCamDist < 1.65);
        this.avatar.root.position.set(this.x, this.y, this.z);
        this.avatar.root.rotation.set(0, this.yaw, 0);
        this.avatar.setWeapon(this.equipped);
        this.avatar.animate(
          this.walkPhase,
          this.state,
          this.equipped,
          this.pitch,
          this.moveMode,
          dt,
          this.isSliding,
          this.isCrouching,
          this.isHealing
        );
      }
    }

    this.fpCanopy.visible = this.alive && this.cameraMode === 'first' && this.state === 'parachuting';
    if (this.fpCanopy.visible) {
      this.fpCanopy.position.set(this.x, this.y + 2.85, this.z);
      this.fpCanopy.rotation.y = this.yaw;
    }

    const reloadProgress = this.reloading
      ? Math.min(1, (performance.now() - this.reloadStart) / Math.max(1, this.reloadDuration))
      : 0;

    this.fpRig.update(dt, {
      visible: this.alive && this.cameraMode === 'first',
      state: this.state,
      aimingZoom: this.aimingZoom,
      sprinting,
      isSliding: this.isSliding,
      isHealing: this.isHealing,
      moving: movingHoriz,
      onGround: this.onGround,
      reloading: this.reloading,
      reloadProgress
    });

    this.updateCamera(dt, mapData, planeState, worldInstance, movingHoriz, sprinting, sniperAds);
  }

  updateCamera(dt, mapData, planeState, worldInstance, movingHoriz, sprinting, sniperAds) {
    this.cameraLandingOffset = damp(this.cameraLandingOffset, 0, 10, dt);

    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      const decay = this.shakeTimer / this.shakeDuration;
      const amp = this.shakeIntensity * decay;
      shakeX = (Math.random() - 0.5) * 2 * amp;
      shakeY = (Math.random() - 0.5) * 2 * amp;
    }

    const cosP = Math.cos(this.pitch);
    _camLookDir.set(Math.sin(this.yaw) * cosP, Math.sin(this.pitch), Math.cos(this.yaw) * cosP).normalize();
    _camRightVec.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));

    if (this.alive && this.state === 'plane' && planeState && worldInstance) {
      this.camera.fov = damp(this.camera.fov, this.planeViewMode === 'plane_exterior' ? 74 : 76, 12, dt);
      this.camera.updateProjectionMatrix();

      if (this.planeViewMode === 'cabin_first') {
        this.camera.position.set(this.x, this.y + 1.15, this.z);
        _camTarget.copy(this.camera.position).addScaledVector(_camLookDir, 30);
        this.camera.lookAt(_camTarget);
      } else if (this.planeViewMode === 'plane_exterior') {
        worldInstance.getPlaneSmoothAnchor(0, 1.2, 0, _planeAnchor);
        _camPos.copy(_planeAnchor).addScaledVector(_camLookDir, -20);
        _camPos.y = Math.max(_planeAnchor.y - 5, _camPos.y);
        this.camera.position.copy(_camPos);
        this.camera.lookAt(_planeAnchor);
      } else {
        worldInstance.getPlaneSmoothAnchor(0, 0.35, -1.5, _planeAnchor);
        this.camera.position.copy(_planeAnchor);
        _camTarget.copy(_planeAnchor).addScaledVector(_camLookDir, 30);
        this.camera.lookAt(_camTarget);
      }

      this.smoothCamPos.copy(this.camera.position);
      return;
    }

    const wSpec = WEAPONS[this.equipped] || WEAPONS.fists;

    if ((this.cameraMode === 'first' || sniperAds) && this.alive) {
      let targetFov = 78;
      if (this.state === 'skydiving') targetFov = 86 + Math.min(8, this.currentDescentSpeed * 0.18);
      else if (this.aimingZoom && this.equipped !== 'fists') targetFov = wSpec.adsFov || 56;
      else if ((sprinting || this.isSliding) && movingHoriz) targetFov = 84;
      this.camera.fov = damp(this.camera.fov, targetFov, 14, dt);
      this.camera.updateProjectionMatrix();

      const targetEye = this.isSliding
        ? PLAYER_SLIDE_EYE_HEIGHT
        : this.isCrouching
        ? PLAYER_CROUCH_EYE_HEIGHT
        : PLAYER_EYE_HEIGHT;
      this.smoothEyeHeight = damp(this.smoothEyeHeight, targetEye, 14, dt);

      let bobY = 0;
      if (this.state === 'ground' && movingHoriz && this.onGround && !this.isSliding && !this.aimingZoom) {
        bobY = Math.sin(this.walkPhase * 2) * (sprinting ? 0.038 : 0.022);
      }

      this.camera.position.set(
        this.x + shakeX,
        this.y + this.smoothEyeHeight + bobY + this.cameraLandingOffset + shakeY,
        this.z
      );
      _camTarget.copy(this.camera.position).addScaledVector(_camLookDir, 35);
      this.camera.lookAt(_camTarget);
      this.smoothCamPos.copy(this.camera.position);
      return;
    }

    let targetFov = this.aimingZoom ? (wSpec.adsFov || 54) : sprinting || this.isSliding ? 75 : 70;
    if (this.state === 'skydiving') targetFov = 76 + Math.min(8, this.currentDescentSpeed * 0.2);
    this.camera.fov = damp(this.camera.fov, targetFov, 12, dt);
    this.camera.updateProjectionMatrix();

    let desiredDist = this.aimingZoom ? 2.15 : 3.35;
    let shoulderOffset = this.aimingZoom ? 0.78 : 0.54;
    let targetPivotH = this.isSliding ? 1.05 : this.isCrouching ? 1.30 : this.aimingZoom ? 1.74 : 1.66;

    if (this.state === 'skydiving' || this.state === 'parachuting') {
      desiredDist = 5.8;
      shoulderOffset = 0.18;
      targetPivotH = 1.75;
    } else if (!this.alive) {
      desiredDist = 10;
      shoulderOffset = 0;
      targetPivotH = 4.5;
    }

    this.smoothEyeHeight = damp(this.smoothEyeHeight, targetPivotH, 14, dt);

    _camPivot.set(
      this.x + _camRightVec.x * shoulderOffset,
      this.y + this.smoothEyeHeight + this.cameraLandingOffset,
      this.z + _camRightVec.z * shoulderOffset
    );

    _camBackDir.copy(_camLookDir).negate();
    let unobstructedDist = desiredDist;

    if (mapData) {
      const hit = raycastVoxels(mapData, _camPivot, _camBackDir, desiredDist + 0.35);
      if (hit.hit) {
        unobstructedDist = Math.max(0.55, hit.dist - 0.28);
      }
    }

    const distRate = unobstructedDist < this.smoothCamDist ? 30 : 11;
    this.smoothCamDist = damp(this.smoothCamDist, unobstructedDist, distRate, dt);

    _camPos.copy(_camPivot).addScaledVector(_camBackDir, this.smoothCamDist);
    if (mapData) {
      const minGroundCamY = mapData.getGroundHeightAt(_camPos.x, _camPos.z, _camPivot.y) + 0.34;
      if (_camPos.y < minGroundCamY) _camPos.y = minGroundCamY;
    }

    if (!this.cameraInitializedOnFoot) {
      this.smoothCamPos.copy(_camPos);
      this.cameraInitializedOnFoot = true;
    } else {
      this.smoothCamPos.lerp(_camPos, 1 - Math.exp(-22 * dt));
    }

    this.camera.position.set(
      this.smoothCamPos.x + shakeX,
      this.smoothCamPos.y + shakeY,
      this.smoothCamPos.z
    );
    _camTarget.copy(_camPivot).addScaledVector(_camLookDir, 35);
    this.camera.lookAt(_camTarget);
  }

  renderViewmodel(renderer) {
    // Nadando el arma va guardada: no se dibuja en primera persona
    if (this.cameraMode === 'first' && this.state !== 'plane' && !this.isSwimming) {
      this.fpRig.render(renderer);
    }
  }
}
