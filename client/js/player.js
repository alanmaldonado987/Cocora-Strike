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
  CABIN_DISEMBARK_MS,
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
import {
  buildExternalCharacterRig,
  solveArmIK
} from '/Modelos%203D/cocoraModels.js';
import {
  createArmasV1WeaponMesh,
  isSharedArmasV1Geometry
} from '/Modelos%203D/armasV1.js';

const _ikTargetWorld = new THREE.Vector3();
const _ikTargetTorso = new THREE.Vector3();
const _ikPoleL = new THREE.Vector3();
const _ikPoleR = new THREE.Vector3();

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

// Margen de seguridad (0.3 unidades) y estructuras reutilizables para anti-clipping de cámara en 3ra persona
export const CAMERA_COLLISION_OFFSET = 0.30;
const _camRaycaster = new THREE.Raycaster();
const _camRayHits = [];
const _camNearbyMeshes = [];
const _camWhiskerOrigin = new THREE.Vector3();

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

// ==================== AVATAR PAISA INTEGRADO DESDE "MODELOS 3D/" (ESCALA 1.80M) ====================
export function createVoxelAvatar(name, colorIdx = 0, isLocal = false) {
  const shirtHex = AVATAR_COLORS[colorIdx % AVATAR_COLORS.length];
  const toonGrad = getSharedToonGradient();

  const {
    root,
    pelvisGroup,
    torsoGroup,
    chestGroup,
    ruanaGroup,
    ruanaFrontPivot,
    ruanaBackPivot,
    backpackGroup,
    neckGroup,
    headPivot,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    weaponMount,
    healProp,
    healCaseMat,
    healCrossMat,
    allAvatarMats,
    hitFlashMats,
    sharedGeos
  } = buildExternalCharacterRig(shirtHex, toonGrad);

  // Montura de las 7 armas de "Armas v1" + machete anclada exactamente al agarre de la mano derecha (rightArm.hand)
  const weapons = {
    fists: createDetailedWeaponMesh('fists', 0.92),
    pistol: createDetailedWeaponMesh('pistol', 0.96),
    revolver: createDetailedWeaponMesh('revolver', 0.95),
    shotgun: createDetailedWeaponMesh('shotgun', 0.90),
    smg: createDetailedWeaponMesh('smg', 0.92),
    assault_rifle: createDetailedWeaponMesh('assault_rifle', 0.92),
    rifle: createDetailedWeaponMesh('rifle', 0.93),
    sniper: createDetailedWeaponMesh('sniper', 0.88)
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
        if (
          child.geometry &&
          !sharedGeos.has(child.geometry) &&
          !isSharedArmasV1Geometry(child.geometry)
        ) {
          child.geometry.dispose();
        }
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
      const slideGrp = activeW?.userData?.slideGroup;
      if (slideGrp && !activeW.userData.isRevolver) {
        slideGrp.position.z = -st.recoilAmount * 0.042;
      }

      const speed = 13;

      // Nado ("swimming" / swim / swim_fast / swim_idle): crol fluido con brazadas alternas, pataleo con tobillo
      // extendido y flotabilidad horizontal; o pataleo vertical suave al mantenerse en el sitio. El arma va guardada.
      const isSwimPose =
        state === 'swimming' ||
        moveMode === 'swimming' ||
        moveMode === 'swim' ||
        moveMode === 'swim_fast' ||
        moveMode === 'swim_idle';

      if (isSwimPose) {
        weaponMount.visible = false;
        const moving = moveMode !== 'swim_idle';
        const stroke = walkPhase;
        pelvisGroup.position.y = damp(pelvisGroup.position.y, moving ? 1.02 : 0.90, 8, dt);
        pelvisGroup.rotation.set(
          damp(pelvisGroup.rotation.x, moving ? 1.08 : 0.14, 7, dt),
          damp(pelvisGroup.rotation.y || 0, moving ? Math.sin(stroke) * 0.08 : 0, 8, dt),
          damp(pelvisGroup.rotation.z || 0, moving ? Math.cos(stroke) * 0.06 : 0, 8, dt)
        );
        torsoGroup.rotation.set(
          damp(torsoGroup.rotation.x, moving ? 0.10 : 0.04, 8, dt),
          damp(torsoGroup.rotation.y, moving ? Math.sin(stroke) * 0.24 : 0, 8, dt),
          damp(torsoGroup.rotation.z, 0, 8, dt)
        );
        if (ruanaFrontPivot) ruanaFrontPivot.rotation.x = damp(ruanaFrontPivot.rotation.x, moving ? 0.16 : 0.06, 8, dt);
        if (ruanaBackPivot) ruanaBackPivot.rotation.x = damp(ruanaBackPivot.rotation.x, moving ? -0.38 : -0.14, 8, dt);
        if (neckGroup) neckGroup.rotation.set(damp(neckGroup.rotation.x, moving ? -0.32 : -0.05, 8, dt), 0, 0);

        if (moving) {
          rightArm.shoulder.rotation.set(-1.55 + Math.sin(stroke) * 1.55, 0, -0.18);
          leftArm.shoulder.rotation.set(-1.55 - Math.sin(stroke) * 1.55, 0, 0.18);
          rightArm.elbow.rotation.set(damp(rightArm.elbow.rotation.x, -0.25 - Math.max(0, Math.cos(stroke)) * 0.72, 14, dt), 0, 0);
          leftArm.elbow.rotation.set(damp(leftArm.elbow.rotation.x, -0.25 - Math.max(0, -Math.cos(stroke)) * 0.72, 14, dt), 0, 0);
          const kick = Math.sin(stroke * 3) * 0.34;
          leftLeg.hip.rotation.set(damp(leftLeg.hip.rotation.x, kick, 18, dt), 0, 0.04);
          rightLeg.hip.rotation.set(damp(rightLeg.hip.rotation.x, -kick, 18, dt), 0, -0.04);
          leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, 0.22 + Math.max(0, kick), 18, dt);
          rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, 0.22 + Math.max(0, -kick), 18, dt);
          if (leftLeg.ankle) leftLeg.ankle.rotation.x = damp(leftLeg.ankle.rotation.x, 0.42, 14, dt);
          if (rightLeg.ankle) rightLeg.ankle.rotation.x = damp(rightLeg.ankle.rotation.x, 0.42, 14, dt);
          headPivot.rotation.set(damp(headPivot.rotation.x, -0.68, 10, dt), Math.sin(stroke) * 0.14, 0);
        } else {
          const tread = Math.sin(st.breathClock * 2.6);
          rightArm.shoulder.rotation.set(-0.55 + tread * 0.22, 0, -0.75 - tread * 0.28);
          leftArm.shoulder.rotation.set(-0.55 - tread * 0.22, 0, 0.75 + tread * 0.28);
          rightArm.elbow.rotation.set(damp(rightArm.elbow.rotation.x, -0.52, 10, dt), 0, 0);
          leftArm.elbow.rotation.set(damp(leftArm.elbow.rotation.x, -0.52, 10, dt), 0, 0);
          leftLeg.hip.rotation.set(damp(leftLeg.hip.rotation.x, -0.35 + tread * 0.35, 10, dt), 0, 0.06);
          rightLeg.hip.rotation.set(damp(rightLeg.hip.rotation.x, -0.35 - tread * 0.35, 10, dt), 0, -0.06);
          leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, 0.78, 10, dt);
          rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, 0.78, 10, dt);
          if (leftLeg.ankle) leftLeg.ankle.rotation.x = damp(leftLeg.ankle.rotation.x, 0.24 - tread * 0.18, 10, dt);
          if (rightLeg.ankle) rightLeg.ankle.rotation.x = damp(rightLeg.ankle.rotation.x, 0.24 + tread * 0.18, 10, dt);
          headPivot.rotation.set(damp(headPivot.rotation.x, -pitch * 0.5, 10, dt), 0, 0);
        }
        return;
      }

      if (state === 'plane') {
        if (moveMode === 'stand') {
          // 1. Levantarse suavemente desde el banco lateral de la bodega (~0.35s)
          const u = Math.max(0, Math.min(1, walkPhase / 1.6));
          pelvisGroup.position.y = damp(pelvisGroup.position.y, 0.50 + u * 0.46, 14, dt);
          pelvisGroup.rotation.set(damp(pelvisGroup.rotation.x, 0.14 * (1 - u), 14, dt), 0, 0);
          torsoGroup.rotation.set(damp(torsoGroup.rotation.x, 0.28 - u * 0.18, 14, dt), 0, 0);
          if (ruanaFrontPivot) ruanaFrontPivot.rotation.x = damp(ruanaFrontPivot.rotation.x, 0.26 - u * 0.18, 14, dt);
          if (ruanaBackPivot) ruanaBackPivot.rotation.x = damp(ruanaBackPivot.rotation.x, -0.06, 14, dt);
          if (neckGroup) neckGroup.rotation.set(0, 0, 0);

          const hipTarget = -1.48 + u * 1.38;
          const kneeTarget = 1.52 - u * 1.38;
          leftLeg.hip.rotation.set(damp(leftLeg.hip.rotation.x, hipTarget, 14, dt), 0, 0.05);
          leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, kneeTarget, 14, dt);
          rightLeg.hip.rotation.set(damp(rightLeg.hip.rotation.x, hipTarget + 0.08 * u, 14, dt), 0, -0.05);
          rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, kneeTarget, 14, dt);
          if (leftLeg.ankle) leftLeg.ankle.rotation.x = damp(leftLeg.ankle.rotation.x, -0.10 * u, 14, dt);
          if (rightLeg.ankle) rightLeg.ankle.rotation.x = damp(rightLeg.ankle.rotation.x, -0.10 * u, 14, dt);

          leftArm.shoulder.rotation.set(damp(leftArm.shoulder.rotation.x, -0.45 + u * 0.15, 14, dt), 0, 0.10);
          leftArm.elbow.rotation.set(damp(leftArm.elbow.rotation.x, -0.85 + u * 0.30, 14, dt), 0, 0);
          rightArm.shoulder.rotation.set(damp(rightArm.shoulder.rotation.x, -0.45 + u * 0.15, 14, dt), 0, -0.10);
          rightArm.elbow.rotation.set(damp(rightArm.elbow.rotation.x, -0.85 + u * 0.30, 14, dt), 0, 0);
          headPivot.rotation.set(damp(headPivot.rotation.x, 0.05 * (1 - u), 14, dt), 0, 0);
          return;
        }

        if (moveMode === 'walk_cabin') {
          // 2. Avanzar por el pasillo central antideslizante hacia el borde de la rampa trasera abierta
          const sPhi = Math.sin(walkPhase);
          const cPhi = Math.cos(walkPhase);
          const thL = -0.52 * sPhi;
          const thR = 0.52 * sPhi;
          const kneeL = 0.12 + 0.92 * Math.pow(Math.max(0, cPhi), 1.4);
          const kneeR = 0.12 + 0.92 * Math.pow(Math.max(0, -cPhi), 1.4);

          pelvisGroup.position.y = damp(pelvisGroup.position.y, 0.95 - 0.03 * sPhi * sPhi, 16, dt);
          pelvisGroup.rotation.set(damp(pelvisGroup.rotation.x, 0.08, 14, dt), 0.06 * sPhi, 0);
          torsoGroup.rotation.set(damp(torsoGroup.rotation.x, 0.14, 14, dt), -0.05 * sPhi, 0);
          if (ruanaFrontPivot) ruanaFrontPivot.rotation.x = damp(ruanaFrontPivot.rotation.x, 0.12, 14, dt);
          if (ruanaBackPivot) ruanaBackPivot.rotation.x = damp(ruanaBackPivot.rotation.x, -0.18, 14, dt);
          if (neckGroup) neckGroup.rotation.set(-0.04, 0, 0);

          leftLeg.hip.rotation.set(damp(leftLeg.hip.rotation.x, thL, 18, dt), 0, 0.04);
          leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, kneeL, 18, dt);
          rightLeg.hip.rotation.set(damp(rightLeg.hip.rotation.x, thR, 18, dt), 0, -0.04);
          rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, kneeR, 18, dt);
          if (leftLeg.ankle) leftLeg.ankle.rotation.x = damp(leftLeg.ankle.rotation.x, -(thL + kneeL) * 0.55, 16, dt);
          if (rightLeg.ankle) rightLeg.ankle.rotation.x = damp(rightLeg.ankle.rotation.x, -(thR + kneeR) * 0.55, 16, dt);

          leftArm.shoulder.rotation.set(damp(leftArm.shoulder.rotation.x, -0.35 - 0.42 * sPhi, 16, dt), 0, 0.08);
          leftArm.elbow.rotation.set(damp(leftArm.elbow.rotation.x, -0.62, 16, dt), 0, 0);
          rightArm.shoulder.rotation.set(damp(rightArm.shoulder.rotation.x, -0.45 + 0.36 * sPhi, 16, dt), 0, -0.08);
          rightArm.elbow.rotation.set(damp(rightArm.elbow.rotation.x, -0.68, 16, dt), 0, 0);
          headPivot.rotation.set(damp(headPivot.rotation.x, -0.04, 14, dt), 0, 0);
          return;
        }

        if (moveMode === 'ramp_jump') {
          // 3. Salto atlético desde el labio de la rampa hacia el vacío antes de desacoplarse a skydiving
          pelvisGroup.position.y = damp(pelvisGroup.position.y, 0.92, 18, dt);
          pelvisGroup.rotation.set(damp(pelvisGroup.rotation.x, 0.48, 18, dt), 0, 0);
          torsoGroup.rotation.set(damp(torsoGroup.rotation.x, 0.28, 18, dt), 0, 0);
          if (ruanaFrontPivot) ruanaFrontPivot.rotation.x = damp(ruanaFrontPivot.rotation.x, -0.18, 18, dt);
          if (ruanaBackPivot) ruanaBackPivot.rotation.x = damp(ruanaBackPivot.rotation.x, -0.62, 18, dt);
          if (neckGroup) neckGroup.rotation.set(-0.22, 0, 0);

          leftLeg.hip.rotation.set(damp(leftLeg.hip.rotation.x, -0.92, 18, dt), 0, 0.12);
          leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, 1.24, 18, dt);
          rightLeg.hip.rotation.set(damp(rightLeg.hip.rotation.x, 0.38, 18, dt), 0, -0.12);
          rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, 0.32, 18, dt);
          if (leftLeg.ankle) leftLeg.ankle.rotation.x = damp(leftLeg.ankle.rotation.x, 0.35, 18, dt);
          if (rightLeg.ankle) rightLeg.ankle.rotation.x = damp(rightLeg.ankle.rotation.x, 0.45, 18, dt);

          leftArm.shoulder.rotation.set(damp(leftArm.shoulder.rotation.x, -1.55, 18, dt), 0, -0.42);
          leftArm.elbow.rotation.set(damp(leftArm.elbow.rotation.x, -0.35, 18, dt), 0, 0);
          rightArm.shoulder.rotation.set(damp(rightArm.shoulder.rotation.x, -1.55, 18, dt), 0, 0.42);
          rightArm.elbow.rotation.set(damp(rightArm.elbow.rotation.x, -0.35, 18, dt), 0, 0);
          headPivot.rotation.set(damp(headPivot.rotation.x, -0.24, 18, dt), 0, 0);
          st.wasAirborne = true;
          return;
        }
      }

      if (state === 'plane' || moveMode === 'seated') {
        const turb = Math.sin(st.breathClock * 1.4) * 0.035;
        pelvisGroup.position.y = damp(pelvisGroup.position.y, 0.50, speed, dt);
        pelvisGroup.rotation.set(damp(pelvisGroup.rotation.x, 0, speed, dt), 0, 0);
        torsoGroup.rotation.set(
          damp(torsoGroup.rotation.x, 0.06 + turb, speed, dt),
          0,
          damp(torsoGroup.rotation.z, turb * 1.1, speed, dt)
        );
        if (ruanaFrontPivot) ruanaFrontPivot.rotation.x = damp(ruanaFrontPivot.rotation.x, 0.28, speed, dt);
        if (ruanaBackPivot) ruanaBackPivot.rotation.x = damp(ruanaBackPivot.rotation.x, -0.04, speed, dt);
        if (neckGroup) neckGroup.rotation.set(0, 0, 0);
        leftLeg.hip.rotation.set(damp(leftLeg.hip.rotation.x, -1.48, speed, dt), 0, 0.05);
        leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, 1.52, speed, dt);
        rightLeg.hip.rotation.set(damp(rightLeg.hip.rotation.x, -1.48, speed, dt), 0, -0.05);
        rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, 1.52, speed, dt);
        if (leftLeg.ankle) leftLeg.ankle.rotation.x = damp(leftLeg.ankle.rotation.x, 0, speed, dt);
        if (rightLeg.ankle) rightLeg.ankle.rotation.x = damp(rightLeg.ankle.rotation.x, 0, speed, dt);

        leftArm.shoulder.rotation.set(damp(leftArm.shoulder.rotation.x, -0.45, speed, dt), 0, 0.08);
        leftArm.elbow.rotation.set(damp(leftArm.elbow.rotation.x, -0.95, speed, dt), 0, 0);
        rightArm.shoulder.rotation.set(damp(rightArm.shoulder.rotation.x, -0.45, speed, dt), 0, -0.08);
        rightArm.elbow.rotation.set(damp(rightArm.elbow.rotation.x, -0.95, speed, dt), 0, 0);
        headPivot.rotation.set(damp(headPivot.rotation.x, -pitch * 0.5, speed, dt), 0, 0);
        return;
      }

      if (state === 'skydiving') {
        // Animación v2 ('fall'): caída libre en arco de paracaidista con aleteo independiente de ruanaF y ruanaB
        const t = st.breathClock * 0.44;
        const flutter = Math.sin(st.breathClock * 8) * 0.075;
        pelvisGroup.position.y = damp(pelvisGroup.position.y, 0.86, speed, dt);
        pelvisGroup.rotation.set(damp(pelvisGroup.rotation.x, 1.05 - pitch * 0.32, 10, dt), 0, 0);
        torsoGroup.rotation.set(damp(torsoGroup.rotation.x, -0.22, 10, dt), 0, flutter * 0.5);
        if (neckGroup) neckGroup.rotation.set(damp(neckGroup.rotation.x, -0.35, 10, dt), 0, 0);
        headPivot.rotation.set(damp(headPivot.rotation.x, -0.28, 10, dt), 0, 0);

        if (ruanaFrontPivot) ruanaFrontPivot.rotation.x = damp(ruanaFrontPivot.rotation.x, -0.46 + 0.10 * Math.sin(t * 13), 14, dt);
        if (ruanaBackPivot) ruanaBackPivot.rotation.x = damp(ruanaBackPivot.rotation.x, -0.76 + 0.10 * Math.sin(t * 11), 14, dt);

        leftArm.shoulder.rotation.set(damp(leftArm.shoulder.rotation.x, -2.18 + flutter, 10, dt), 0, -0.52);
        leftArm.elbow.rotation.set(damp(leftArm.elbow.rotation.x, -0.38, 10, dt), 0, 0);
        rightArm.shoulder.rotation.set(damp(rightArm.shoulder.rotation.x, -2.18 - flutter, 10, dt), 0, 0.52);
        rightArm.elbow.rotation.set(damp(rightArm.elbow.rotation.x, -0.38, 10, dt), 0, 0);

        leftLeg.hip.rotation.set(damp(leftLeg.hip.rotation.x, 0.25, 10, dt), 0, 0.18);
        leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, 0.90 + 0.10 * Math.sin(t * 7), 10, dt);
        rightLeg.hip.rotation.set(damp(rightLeg.hip.rotation.x, 0.25, 10, dt), 0, -0.18);
        rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, 0.90 + 0.10 * Math.sin(t * 7 + 2), 10, dt);
        if (leftLeg.ankle) leftLeg.ankle.rotation.x = damp(leftLeg.ankle.rotation.x, 0.40, 10, dt);
        if (rightLeg.ankle) rightLeg.ankle.rotation.x = damp(rightLeg.ankle.rotation.x, 0.40, 10, dt);
        st.wasAirborne = true;
        return;
      }

      if (state === 'parachuting') {
        // Animación v2 ('parachute'): manos en las bandas resueltas con IK analítico de 2 huesos (solveArmIK)
        const sway = Math.sin(st.breathClock * 1.3) * 0.05;
        pelvisGroup.position.y = damp(pelvisGroup.position.y, 0.88, speed, dt);
        pelvisGroup.rotation.set(damp(pelvisGroup.rotation.x, 0.05 + sway, speed, dt), 0, sway * 0.6);
        torsoGroup.rotation.set(damp(torsoGroup.rotation.x, -0.04, speed, dt), 0, sway);
        parachute.rotation.z = sway;
        if (ruanaFrontPivot) ruanaFrontPivot.rotation.x = damp(ruanaFrontPivot.rotation.x, -0.06 + sway * 0.8, 10, dt);
        if (ruanaBackPivot) ruanaBackPivot.rotation.x = damp(ruanaBackPivot.rotation.x, 0.04, 10, dt);
        if (neckGroup) neckGroup.rotation.set(damp(neckGroup.rotation.x, -0.12, speed, dt), 0, 0);

        _ikTargetTorso.set(0.30, 0.94, 0.06);
        _ikPoleL.set(1.0, -0.3, 0);
        solveArmIK(leftArm.shoulder, leftArm.elbow, _ikTargetTorso, _ikPoleL, 0.28, 0.31);

        _ikTargetTorso.set(-0.30, 0.94, 0.06);
        _ikPoleR.set(-1.0, -0.3, 0);
        solveArmIK(rightArm.shoulder, rightArm.elbow, _ikTargetTorso, _ikPoleR, 0.28, 0.31);

        leftLeg.hip.rotation.set(damp(leftLeg.hip.rotation.x, -0.30, speed, dt), 0, 0.08);
        leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, 0.40, speed, dt);
        rightLeg.hip.rotation.set(damp(rightLeg.hip.rotation.x, -0.12, speed, dt), 0, -0.08);
        rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, 0.25, speed, dt);
        if (leftLeg.ankle) leftLeg.ankle.rotation.x = damp(leftLeg.ankle.rotation.x, 0.35, speed, dt);
        if (rightLeg.ankle) rightLeg.ankle.rotation.x = damp(rightLeg.ankle.rotation.x, 0.30, speed, dt);
        headPivot.rotation.set(damp(headPivot.rotation.x, -0.15 - pitch * 0.35, speed, dt), sway * 0.8, 0);
        st.wasAirborne = true;
        return;
      }

      pelvisGroup.rotation.set(
        damp(pelvisGroup.rotation.x, 0, speed, dt),
        damp(pelvisGroup.rotation.y || 0, 0, speed, dt),
        damp(pelvisGroup.rotation.z || 0, 0, speed, dt)
      );

      if (moveMode === 'vault') {
        // Animación v2 ('vault'): pierna derecha flexionada sobre el obstáculo, pierna izquierda impulsando,
        // torso inclinado lateralmente y mano izquierda apoyada al frente mediante IK de 2 huesos.
        pelvisGroup.position.y = damp(pelvisGroup.position.y, 0.92, 18, dt);
        pelvisGroup.rotation.set(
          damp(pelvisGroup.rotation.x, 0.15, 18, dt),
          0,
          damp(pelvisGroup.rotation.z || 0, -0.15, 18, dt)
        );
        torsoGroup.rotation.set(
          damp(torsoGroup.rotation.x, 0.22, 18, dt),
          damp(torsoGroup.rotation.y, 0.12, 18, dt),
          damp(torsoGroup.rotation.z, -0.20, 18, dt)
        );
        if (ruanaFrontPivot) ruanaFrontPivot.rotation.x = damp(ruanaFrontPivot.rotation.x, 0.50, 18, dt);
        if (ruanaBackPivot) ruanaBackPivot.rotation.x = damp(ruanaBackPivot.rotation.x, -0.30, 18, dt);
        if (neckGroup) neckGroup.rotation.set(0, 0.18, 0.05);

        rightLeg.hip.rotation.set(damp(rightLeg.hip.rotation.x, -1.45, 18, dt), 0, damp(rightLeg.hip.rotation.z || 0, -0.42, 18, dt));
        rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, 1.85, 18, dt);
        if (rightLeg.ankle) rightLeg.ankle.rotation.x = damp(rightLeg.ankle.rotation.x, 0.20, 18, dt);

        leftLeg.hip.rotation.set(damp(leftLeg.hip.rotation.x, 0.50, 18, dt), 0, damp(leftLeg.hip.rotation.z || 0, 0.12, 18, dt));
        leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, 0.45, 18, dt);
        if (leftLeg.ankle) leftLeg.ankle.rotation.x = damp(leftLeg.ankle.rotation.x, 0.55, 18, dt);

        _ikTargetTorso.set(0.22, -0.02, 0.36);
        _ikPoleL.set(0.7, -1.0, -0.2);
        solveArmIK(leftArm.shoulder, leftArm.elbow, _ikTargetTorso, _ikPoleL, 0.28, 0.31);

        rightArm.shoulder.rotation.set(damp(rightArm.shoulder.rotation.x, -1.15, 18, dt), 0.15, -0.22);
        rightArm.elbow.rotation.set(damp(rightArm.elbow.rotation.x, -0.45, 18, dt), 0, 0);
        headPivot.rotation.set(damp(headPivot.rotation.x, -0.14, 16, dt), 0.08, 0.12);
        st.wasAirborne = true;
        return;
      }

      leftLeg.hip.rotation.z = damp(leftLeg.hip.rotation.z || 0, 0.04, speed, dt);
      rightLeg.hip.rotation.z = damp(rightLeg.hip.rotation.z || 0, -0.04, speed, dt);

      if (isSliding || moveMode === 'slide') {
        // Animación v2 ('slide'): cadera baja, torso reclinado, pierna izquierda extendida y derecha recogida (kneeR = 2.05)
        pelvisGroup.position.y = damp(pelvisGroup.position.y, 0.44, 16, dt);
        pelvisGroup.rotation.set(damp(pelvisGroup.rotation.x, -0.48, 16, dt), 0, 0);
        torsoGroup.rotation.set(
          damp(torsoGroup.rotation.x, 0.38 - pitch * 0.45, 15, dt),
          damp(torsoGroup.rotation.y, -0.18, 15, dt),
          damp(torsoGroup.rotation.z, 0.12, 15, dt)
        );
        if (ruanaFrontPivot) ruanaFrontPivot.rotation.x = damp(ruanaFrontPivot.rotation.x, 0.58, 15, dt);
        if (ruanaBackPivot) ruanaBackPivot.rotation.x = damp(ruanaBackPivot.rotation.x, -0.16, 15, dt);

        leftLeg.hip.rotation.set(damp(leftLeg.hip.rotation.x, -1.02, 16, dt), 0, 0.08);
        leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, 0.12, 16, dt);
        if (leftLeg.ankle) leftLeg.ankle.rotation.x = damp(leftLeg.ankle.rotation.x, -0.15, 16, dt);

        rightLeg.hip.rotation.set(damp(rightLeg.hip.rotation.x, -0.18, 16, dt), 0, -0.38);
        rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, 2.02, 16, dt);
        if (rightLeg.ankle) rightLeg.ankle.rotation.x = damp(rightLeg.ankle.rotation.x, 0.35, 16, dt);
      } else {
        // Ciclo completo de locomoción Animación v2 (cadera -> rodilla -> despegue de puntera en tobillo + ruanaF/B + mochila)
        const isJump = moveMode === 'jump';
        const isFall = moveMode === 'fall';
        const isAir = isJump || isFall;
        const isSprint = moveMode === 'sprint';
        const isWalk = moveMode === 'walk' || isSprint || moveMode === 'crouch_walk';
        const runFactor = isSprint ? 1.0 : 0.0;

        if (st.wasAirborne && !isAir) {
          st.landingCompression = 0.18;
        }
        st.wasAirborne = isAir;
        st.landingCompression = damp(st.landingCompression, 0, 10, dt);

        const breath = Math.sin(st.breathClock * 0.75);
        const sPhi = Math.sin(walkPhase);
        const cPhi = Math.cos(walkPhase);
        const strideAmp = isSprint ? 0.78 : activeHeal ? 0.28 : isCrouching ? 0.40 : isWalk ? 0.44 : 0;
        const thL = -strideAmp * sPhi;
        const thR = strideAmp * sPhi;
        const vertBob =
          isWalk && !isAir
            ? -(0.02 + 0.03 * runFactor) - (0.035 + 0.03 * runFactor) * sPhi * sPhi
            : -0.008 * (1 + Math.sin(st.breathClock * 0.8));
        const basePelvisY = isCrouching ? 0.64 : activeHeal ? 0.92 : 0.985;

        pelvisGroup.position.y = damp(
          pelvisGroup.position.y,
          basePelvisY + vertBob - st.landingCompression,
          16,
          dt
        );
        if (isWalk && !isAir) {
          pelvisGroup.rotation.set(
            damp(pelvisGroup.rotation.x, 0.04 + 0.08 * runFactor, 14, dt),
            damp(pelvisGroup.rotation.y || 0, 0.07 * sPhi, 14, dt),
            damp(pelvisGroup.rotation.z || 0, 0.025 * cPhi, 14, dt)
          );
        }

        if (chestGroup) {
          chestGroup.scale.y = 1 + breath * 0.015;
        }
        if (ruanaFrontPivot && ruanaBackPivot) {
          const targetRuanaF = isAir
            ? 0.35
            : isWalk
            ? 0.05 + Math.max(0, Math.max(-thL, -thR) - 0.15) * 0.6
            : 0.04;
          const targetRuanaB = isAir
            ? -0.25
            : isWalk
            ? -0.05 - 0.28 * runFactor + 0.05 * Math.sin(st.breathClock * 3.8) * runFactor
            : -0.03;
          ruanaFrontPivot.rotation.x = damp(ruanaFrontPivot.rotation.x, targetRuanaF, 14, dt);
          ruanaBackPivot.rotation.x = damp(ruanaBackPivot.rotation.x, targetRuanaB, 14, dt);
        }
        if (ruanaGroup) {
          const targetRuanaZ = isWalk && !isAir ? thL * 0.07 : breath * 0.012;
          ruanaGroup.rotation.set(0, 0, damp(ruanaGroup.rotation.z, targetRuanaZ, 12, dt));
        }
        if (backpackGroup) {
          const targetPack = isWalk && !isAir ? 0.05 * Math.sin(walkPhase * 2) * (0.5 + runFactor) : 0.012 * breath;
          backpackGroup.rotation.x = damp(backpackGroup.rotation.x, targetPack, 14, dt);
        }

        const targetTorsoPitch = activeHeal
          ? 0.16
          : isCrouching
          ? 0.32
          : isSprint
          ? 0.26
          : isAir
          ? 0.14
          : 0.06 - pitch * 0.35 + st.landingCompression * 0.5 + breath * 0.015;
        const targetTorsoYaw = isWalk && !isAir ? -0.06 * sPhi : 0;
        torsoGroup.rotation.set(
          damp(torsoGroup.rotation.x, targetTorsoPitch - st.recoilAmount * 0.05, speed, dt),
          damp(torsoGroup.rotation.y, targetTorsoYaw, speed, dt),
          damp(torsoGroup.rotation.z, 0, speed, dt)
        );
        if (neckGroup) {
          neckGroup.rotation.set(
            damp(neckGroup.rotation.x, isSprint ? -0.12 : activeHeal ? 0.22 : 0, 14, dt),
            0,
            0
          );
        }

        if (isAir) {
          const rising = isJump ? 1.0 : 0.25;
          leftLeg.hip.rotation.x = damp(leftLeg.hip.rotation.x, -0.55 - 0.35 * rising, speed, dt);
          leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, 0.78 + 0.52 * rising, speed, dt);
          rightLeg.hip.rotation.x = damp(rightLeg.hip.rotation.x, -0.25 - 0.30 * rising, speed, dt);
          rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, 0.58 + 0.40 * rising, speed, dt);
          if (leftLeg.ankle) leftLeg.ankle.rotation.x = damp(leftLeg.ankle.rotation.x, 0.34, speed, dt);
          if (rightLeg.ankle) rightLeg.ankle.rotation.x = damp(rightLeg.ankle.rotation.x, 0.28, speed, dt);
        } else if (isCrouching) {
          leftLeg.hip.rotation.x = damp(leftLeg.hip.rotation.x, -0.78 + thL * 0.5, 16, dt);
          leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, 1.38, 16, dt);
          rightLeg.hip.rotation.x = damp(rightLeg.hip.rotation.x, -0.78 + thR * 0.5, 16, dt);
          rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, 1.38, 16, dt);
          if (leftLeg.ankle) leftLeg.ankle.rotation.x = damp(leftLeg.ankle.rotation.x, -0.25, 16, dt);
          if (rightLeg.ankle) rightLeg.ankle.rotation.x = damp(rightLeg.ankle.rotation.x, -0.25, 16, dt);
        } else if (isWalk) {
          const kAmp = 0.85 + 0.70 * runFactor;
          const landingKnee = st.landingCompression * 1.5;
          const kneeL = 0.10 + kAmp * Math.pow(Math.max(0, cPhi), 1.5) + 0.12 * Math.max(0, sPhi) * runFactor + landingKnee;
          const kneeR = 0.10 + kAmp * Math.pow(Math.max(0, -cPhi), 1.5) + 0.12 * Math.max(0, -sPhi) * runFactor + landingKnee;
          const pushL = strideAmp > 0 ? Math.max(0, thL / strideAmp) : 0;
          const pushR = strideAmp > 0 ? Math.max(0, thR / strideAmp) : 0;
          const ankleL = -(thL + kneeL) * 0.65 + 0.32 * pushL * (0.6 + runFactor);
          const ankleR = -(thR + kneeR) * 0.65 + 0.32 * pushR * (0.6 + runFactor);

          leftLeg.hip.rotation.x = damp(leftLeg.hip.rotation.x, thL - landingKnee * 0.5, 16, dt);
          leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, kneeL, 16, dt);
          rightLeg.hip.rotation.x = damp(rightLeg.hip.rotation.x, thR - landingKnee * 0.5, 16, dt);
          rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, kneeR, 16, dt);
          if (leftLeg.ankle) leftLeg.ankle.rotation.x = damp(leftLeg.ankle.rotation.x, ankleL, 16, dt);
          if (rightLeg.ankle) rightLeg.ankle.rotation.x = damp(rightLeg.ankle.rotation.x, ankleR, 16, dt);
        } else {
          // Postura táctica escalonada en reposo/apuntado (Animación v2 'idle' / 'aim')
          const sw = Math.sin(st.breathClock * 0.35);
          const landingKnee = st.landingCompression * 1.5;
          const kL = 0.11 + 0.03 * sw + landingKnee;
          const kR = 0.11 - 0.03 * sw + landingKnee;
          leftLeg.hip.rotation.x = damp(leftLeg.hip.rotation.x, -0.10 - landingKnee * 0.5, 12, dt);
          rightLeg.hip.rotation.x = damp(rightLeg.hip.rotation.x, 0.08 - landingKnee * 0.5, 12, dt);
          leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, kL, 12, dt);
          rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, kR, 12, dt);
          if (leftLeg.ankle) leftLeg.ankle.rotation.x = damp(leftLeg.ankle.rotation.x, -kL * 0.85, 12, dt);
          if (rightLeg.ankle) rightLeg.ankle.rotation.x = damp(rightLeg.ankle.rotation.x, -kR * 0.85, 12, dt);
        }
      }

      const recoilKick = st.recoilAmount * 0.28;
      const isTwoHandLongGun =
        equipped === 'assault_rifle' ||
        equipped === 'rifle' ||
        equipped === 'shotgun' ||
        equipped === 'smg' ||
        equipped === 'sniper';
      const isSprintingCarry = moveMode === 'sprint' && !isSliding && st.recoilAmount < 0.05;

      if (activeHeal) {
        // Animación v2 ('heal'): botiquín sostenido entre ambas manos mediante IK analítico de 2 huesos
        const wrapMotion = Math.sin(st.breathClock * 6.5) * 0.035;
        healProp.position.set(0, 0.20 + Math.abs(wrapMotion) * 0.6, 0.34);
        healProp.rotation.z = wrapMotion * 2.2;

        _ikTargetTorso.set(0.10, 0.22 + wrapMotion, 0.33);
        _ikPoleL.set(0.8, -1.0, -0.2);
        solveArmIK(leftArm.shoulder, leftArm.elbow, _ikTargetTorso, _ikPoleL, 0.28, 0.31);

        _ikTargetTorso.set(-0.10, 0.22 - wrapMotion, 0.33);
        _ikPoleR.set(-0.8, -1.0, -0.2);
        solveArmIK(rightArm.shoulder, rightArm.elbow, _ikTargetTorso, _ikPoleR, 0.28, 0.31);

        headPivot.rotation.set(damp(headPivot.rotation.x, 0.26, 14, dt), 0, 0);
        return;
      }

      if (isTwoHandLongGun) {
        if (isSprintingCarry) {
          // Porte cruzado táctico ('high port' de Animación v2) + mano izquierda en el guardamanos con IK
          rightArm.shoulder.rotation.set(damp(rightArm.shoulder.rotation.x, -0.98, speed, dt), 0.38, -0.06);
          rightArm.elbow.rotation.set(damp(rightArm.elbow.rotation.x, -0.68, speed, dt), 0, 0);
        } else {
          rightArm.shoulder.rotation.set(
            damp(rightArm.shoulder.rotation.x, -1.34 - pitch * 0.72 + recoilKick, 18, dt),
            damp(rightArm.shoulder.rotation.y, -0.08, speed, dt),
            0
          );
          rightArm.elbow.rotation.set(damp(rightArm.elbow.rotation.x, -0.26 - recoilKick * 0.6, 18, dt), 0, 0);
        }
        // IK analítico de 2 huesos (solveArmIK): mano izquierda sujeta exactamente el guardamanos de cada arma de Armas v1
        torsoGroup.updateMatrixWorld(true);
        if (activeW?.userData?.forendGripPos) {
          _ikTargetWorld.copy(activeW.userData.forendGripPos);
          activeW.localToWorld(_ikTargetWorld);
        } else {
          _ikTargetWorld.set(0.0, 0.02, 0.24);
          weaponMount.localToWorld(_ikTargetWorld);
        }
        _ikTargetTorso.copy(_ikTargetWorld);
        torsoGroup.worldToLocal(_ikTargetTorso);
        _ikPoleL.set(0.55, -1.0, 0.10);
        solveArmIK(leftArm.shoulder, leftArm.elbow, _ikTargetTorso, _ikPoleL, 0.28, 0.31);
      } else if (equipped === 'pistol' || equipped === 'revolver') {
        const handgunKick = equipped === 'revolver' ? recoilKick * 1.55 : recoilKick * 1.2;
        rightArm.shoulder.rotation.set(
          damp(rightArm.shoulder.rotation.x, -1.42 - pitch * 0.8 + handgunKick, 18, dt),
          damp(rightArm.shoulder.rotation.y, -0.05, speed, dt),
          0
        );
        rightArm.elbow.rotation.set(damp(rightArm.elbow.rotation.x, -0.15 - recoilKick * 0.5, 18, dt), 0, 0);
        torsoGroup.updateMatrixWorld(true);
        _ikTargetWorld.set(0.03, -0.02, 0.04);
        weaponMount.localToWorld(_ikTargetWorld);
        _ikTargetTorso.copy(_ikTargetWorld);
        torsoGroup.worldToLocal(_ikTargetTorso);
        _ikPoleL.set(0.65, -1.0, 0.05);
        solveArmIK(leftArm.shoulder, leftArm.elbow, _ikTargetTorso, _ikPoleL, 0.28, 0.31);
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
        rightArm.elbow.rotation.set(damp(rightArm.elbow.rotation.x, -0.55 + slash * 0.4, 16, dt), 0, 0);
        leftArm.shoulder.rotation.set(damp(leftArm.shoulder.rotation.x, -armSwing, 16, dt), 0, 0.06);
        leftArm.elbow.rotation.set(damp(leftArm.elbow.rotation.x, moveMode === 'sprint' ? -0.85 : -0.32, 16, dt), 0, 0);
      }

      headPivot.rotation.set(damp(headPivot.rotation.x, -pitch * 0.58 - st.recoilAmount * 0.03, 16, dt), 0, 0);
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
      revolver: this.buildArmedRig('revolver'),
      shotgun: this.buildArmedRig('shotgun'),
      smg: this.buildArmedRig('smg'),
      assault_rifle: this.buildArmedRig('assault_rifle'),
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
    this.isCabinDisembarking = false;
    this.cabinDisembarkTimer = 0;
    this.cabinDisembarkDuration = CABIN_DISEMBARK_MS / 1000;

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
      revolver: { unlocked: false, mag: 0 },
      shotgun: { unlocked: false, mag: 0 },
      smg: { unlocked: false, mag: 0 },
      assault_rifle: { unlocked: false, mag: 0 },
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

  ensureAvatarInWorldScene() {
    if (this.avatar && this.avatar.root.parent !== this.scene) {
      this.scene.add(this.avatar.root);
    }
  }

  spawnAvatar(name, colorIdx = 0, seatIndex = 0) {
    this.seatIndex = seatIndex;
    this.isCabinDisembarking = false;
    this.cabinDisembarkTimer = 0;
    if (this.avatar) {
      this.avatar.root.removeFromParent();
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

  startCabinDisembarkSequence() {
    if (this.state !== 'plane' || this.isCabinDisembarking) return;
    this.isCabinDisembarking = true;
    this.cabinDisembarkTimer = 0;
    this.onJumpRequest?.();
  }

  completeLocalRampJump(planeState, worldInstance) {
    this.ensureAvatarInWorldScene();
    if (worldInstance && worldInstance.planeMesh) {
      const exitLocal = worldInstance.sampleCabinDisembarkLocalPose(this.seatIndex, 1.0);
      const bay = worldInstance.getActiveCabinBayGroup();
      _planeAnchor.set(exitLocal.x, exitLocal.y, exitLocal.z);
      bay.updateMatrixWorld(true);
      bay.localToWorld(_planeAnchor);
      this.x = _planeAnchor.x;
      this.y = _planeAnchor.y;
      this.z = _planeAnchor.z;
      this.smoothCamPos.set(_planeAnchor.x, _planeAnchor.y + 2.6, _planeAnchor.z);
    }
    if (planeState) {
      // Ligera inercia hacia adelante al saltar, quedando visiblemente atrás mientras el avión sigue a 38 m/s
      this.airMomentumX = (planeState.vx || 0) * 0.42;
      this.airMomentumZ = (planeState.vz || 0) * 0.42;
    }
    const groundY = this.currentMap ? this.currentMap.getFloorBelowY(this.x, this.y, this.z) : 8;
    this.jumpStartAltitude = Math.max(15, this.y - groundY);
    this.currentDescentSpeed = PARACHUTE_CONFIG.freefallInitialSpeed;
    this.isCabinDisembarking = false;
    this.cabinDisembarkTimer = 0;
    this.state = 'skydiving';
    this.moveMode = 'fall';
    this.onGround = false;
    this.cameraInitializedOnFoot = true;
  }

  forceSyncExitFromServer(meSnapshot) {
    this.ensureAvatarInWorldScene();
    this.isCabinDisembarking = false;
    this.cabinDisembarkTimer = 0;
    this.state = meSnapshot.state;
    this.x = meSnapshot.x;
    this.y = meSnapshot.y;
    this.z = meSnapshot.z;
    if (this.lastPlaneState) {
      this.airMomentumX = (this.lastPlaneState.vx || 0) * 0.42;
      this.airMomentumZ = (this.lastPlaneState.vz || 0) * 0.42;
    }
    this.jumpStartAltitude = meSnapshot.jumpAltitude || PARACHUTE_CONFIG.planeHeightAboveValley;
    this.currentDescentSpeed = PARACHUTE_CONFIG.freefallInitialSpeed;
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
          this.startCabinDisembarkSequence();
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
      if (e.code === 'Digit2') this.trySwitchWeapon('revolver');
      if (e.code === 'Digit3') this.trySwitchWeapon('shotgun');
      if (e.code === 'Digit4') this.trySwitchWeapon('smg');
      if (e.code === 'Digit5') this.trySwitchWeapon('assault_rifle');
      if (e.code === 'Digit6') this.trySwitchWeapon('rifle');
      if (e.code === 'Digit7') this.trySwitchWeapon('sniper');
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
        if (this.isCabinDisembarking) {
          this.cabinDisembarkTimer += dt;
          if (this.cabinDisembarkTimer >= this.cabinDisembarkDuration) {
            this.completeLocalRampJump(planeState, worldInstance);
          }
        }

        if (this.state === 'plane') {
          const normProg = this.isCabinDisembarking
            ? Math.min(1, this.cabinDisembarkTimer / Math.max(0.1, this.cabinDisembarkDuration))
            : 0;
          const bayGroup = worldInstance.getActiveCabinBayGroup();
          const localPose = worldInstance.sampleCabinDisembarkLocalPose(this.seatIndex, normProg);

          // Anclar el avatar directamente como hijo del THREE.Group local de la bodega (hereda movimiento y balanceo)
          if (this.avatar) {
            if (bayGroup && this.avatar.root.parent !== bayGroup) {
              bayGroup.add(this.avatar.root);
            }
            this.avatar.root.visible = this.planeViewMode !== 'cabin_first';
            this.avatar.root.position.set(localPose.x, localPose.y, localPose.z);
            this.avatar.root.rotation.set(0, localPose.yaw, 0);
            this.avatar.setOpacity(1.0, false);
            this.avatar.setWeapon(this.equipped);
          }

          bayGroup.updateMatrixWorld(true);
          _planeAnchor.set(localPose.x, localPose.y, localPose.z);
          bayGroup.localToWorld(_planeAnchor);
          this.x = _planeAnchor.x;
          this.y = _planeAnchor.y;
          this.z = _planeAnchor.z;

          const groundBelow = mapData.getFloorBelowY(this.x, this.y, this.z);
          this.currentGroundClearance = Math.max(0, this.y - groundBelow);
          this.jumpStartAltitude = Math.max(15, this.currentGroundClearance);
          this.moveMode = localPose.phase === 'sit' ? 'seated' : localPose.phase;
          this.walkPhase = localPose.walkCycle;

          if (this.avatar) {
            this.avatar.animate(localPose.walkCycle, 'plane', this.equipped, 0, this.moveMode, dt, false, false);
          }
        }
      } else if (this.state === 'skydiving' || this.state === 'parachuting') {
        this.ensureAvatarInWorldScene();
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
        const splashWaterDepth = getWaterDepthAt(mapData, this.x, this.z);
        if (splashWaterDepth > SWIM_CONFIG.swimDepth && this.y <= WATER_LEVEL + 0.20) {
          // Aterrizaje directo en la laguna o río profundo: cero sacudida de impacto y transición limpia a nado
          this.y = getSwimFloatY(mapData, this.x, this.z);
          this.vy = 0;
          this.currentDescentSpeed = 0;
          this.airMomentumX = 0;
          this.airMomentumZ = 0;
          this.onGround = true;
          this.isSwimming = true;
          this.state = 'ground';
          this.moveMode = 'swim_idle';
          this.airPeakY = this.y;
          this.audio.playSplash?.(1.2);
          this.onSpawnWaterRipples?.(this.x, this.z, true, 1.35);
        } else if (this.y <= updatedFloorY + 0.12) {
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
          this.moveMode = 'fall';
        } else {
          this.moveMode = 'fall';
        }
      } else if (this.state === 'ground') {
        const wasOnGround = this.onGround;
        const preVy = this.vy;
        const prevX = this.x;
        const prevY = this.y;
        const prevZ = this.z;

        // Agua profunda (> 1.25m): estado swimming con flotabilidad en superficie, ondas por Object Pooling y salida suave
        const swimmingNow = !this.isVaulting && isSwimmingAt(mapData, this.x, this.y, this.z);
        if (swimmingNow) {
          if (!this.isSwimming) {
            this.isSwimming = true;
            this.endSlide();
            this.isCrouching = false;
            if (this.isHealing) this.cancelClientHeal(true);
            this.audio.playSplash?.(Math.min(1.4, 0.5 + Math.abs(preVy) / 12));
            this.onSpawnWaterRipples?.(this.x, this.z, true, 1.15);
          }
          const swimSpeed = sprinting ? SWIM_CONFIG.swimSprintSpeed : SWIM_CONFIG.swimSpeed;
          stepCharacterPhysics(mapData, this, wishX * swimSpeed, wishZ * swimSpeed, dt, 0, PLAYER_RADIUS, PLAYER_HEIGHT);
          if (remoteEntities.length > 0) {
            applyEntitySeparation(this, remoteEntities, PLAYER_RADIUS, dt, mapData);
          }
          const targetFloatY = getSwimFloatY(mapData, this.x, this.z);
          this.y = damp(this.y, targetFloatY, 6, dt);
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

          this.swimRippleAccum = (this.swimRippleAccum || 0) + dt;
          if (this.swimRippleAccum >= (movingHoriz ? 0.13 : 0.32)) {
            this.swimRippleAccum = 0;
            this.onSpawnWaterRipples?.(this.x, this.z, movingHoriz, sprinting ? 1.15 : 0.85);
          }
        } else if (this.isSwimming) {
          this.isSwimming = false;
          this.onSpawnWaterRipples?.(this.x, this.z, false, 0.65);
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
      this.ensureAvatarInWorldScene();
      const camCloseFade =
        this.cameraMode === 'third'
          ? Math.max(0, Math.min(1, (this.smoothCamDist - 0.72) / 1.05))
          : 0;
      const adsAlpha = this.aimingZoom ? Math.min(camCloseFade, 0.85) : camCloseFade;
      const showLocalBody = this.alive && this.cameraMode === 'third' && !sniperAds && adsAlpha > 0.08;
      this.avatar.root.visible = showLocalBody;
      if (this.alive) {
        // Actualizar siempre posición, rotación, IK y fase de animación aunque esté en 1ra persona o mira telescópica
        if (showLocalBody) {
          this.avatar.setOpacity(adsAlpha, this.aimingZoom && this.smoothCamDist < 1.65);
        }
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
      const rig = worldInstance.getActiveAircraftRig?.();
      this.camera.fov = damp(this.camera.fov, this.planeViewMode === 'plane_exterior' ? 74 : 76, 12, dt);
      this.camera.updateProjectionMatrix();

      if (this.planeViewMode === 'cabin_first') {
        const eyeLift = this.isCabinDisembarking ? 1.56 : 1.18;
        this.camera.position.set(this.x, this.y + eyeLift, this.z);
        _camTarget.copy(this.camera.position).addScaledVector(_camLookDir, 30);
        this.camera.lookAt(_camTarget);
      } else if (this.planeViewMode === 'plane_exterior') {
        const extDist = rig?.cameraExteriorDistance || 24.5;
        worldInstance.getPlaneSmoothAnchor(0, 1.2, 0, _planeAnchor);
        _camPos.copy(_planeAnchor).addScaledVector(_camLookDir, -extDist);
        _camPos.y = Math.max(_planeAnchor.y - 6, _camPos.y);
        this.camera.position.copy(_camPos);
        this.camera.lookAt(_planeAnchor);
      } else {
        const camLocal = rig?.cameraInteriorAnchor;
        worldInstance.getPlaneSmoothAnchor(
          camLocal ? camLocal.x : 0,
          camLocal ? camLocal.y : 0.48,
          camLocal ? camLocal.z : 1.85,
          _planeAnchor
        );
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
    const maxRayCheckDist = desiredDist + CAMERA_COLLISION_OFFSET + 0.05;
    let closestHitDist = Infinity;

    // 1. Raycaster 3D exacto de Three.js desde el pivote de cabeza/hombro contra muros, techos, puentes y terreno
    if (worldInstance && worldInstance.collectCameraOccludersNear) {
      const occluders = worldInstance.collectCameraOccludersNear(
        _camPivot.x,
        _camPivot.z,
        maxRayCheckDist + 16,
        _camNearbyMeshes
      );
      if (occluders.length > 0) {
        _camRaycaster.set(_camPivot, _camBackDir);
        _camRaycaster.near = 0.05;
        _camRaycaster.far = maxRayCheckDist;
        _camRayHits.length = 0;
        _camRaycaster.intersectObjects(occluders, false, _camRayHits);
        if (_camRayHits.length > 0 && _camRayHits[0].distance < closestHitDist) {
          closestHitDist = _camRayHits[0].distance;
        }
      }
    }

    // 2. Respaldo analítico contra volúmenes de colisión y sondas laterales (tipo esfera) para evitar roce en esquinas
    if (mapData) {
      const centerHit = raycastVoxels(mapData, _camPivot, _camBackDir, maxRayCheckDist);
      if (centerHit.hit && centerHit.dist < closestHitDist) {
        closestHitDist = centerHit.dist;
      }
      for (const sideSign of [-1, 1]) {
        _camWhiskerOrigin.copy(_camPivot).addScaledVector(_camRightVec, sideSign * 0.16);
        const sideHit = raycastVoxels(mapData, _camWhiskerOrigin, _camBackDir, maxRayCheckDist);
        if (sideHit.hit && sideHit.dist < closestHitDist) {
          closestHitDist = sideHit.dist;
        }
      }
    }

    if (closestHitDist < Infinity) {
      unobstructedDist = Math.max(0.42, closestHitDist - CAMERA_COLLISION_OFFSET);
    }

    const distRate = unobstructedDist < this.smoothCamDist ? 34 : 11;
    this.smoothCamDist = damp(this.smoothCamDist, unobstructedDist, distRate, dt);

    _camPos.copy(_camPivot).addScaledVector(_camBackDir, this.smoothCamDist);
    if (mapData) {
      const minGroundCamY = mapData.getGroundHeightAt(_camPos.x, _camPos.z, _camPivot.y) + CAMERA_COLLISION_OFFSET;
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
