// client/js/player/avatar.js
// Avatar estilizado low-poly en escala métrica (1.80 m): rig externo (Modelos 3D), ruana, sombrero, mochila,
// armas montadas, paracaídas, placa de nombre/vida sobre la cabeza y API de opacidad, flash de daño y muzzle.
// La pose por fotograma (animate) vive en ./animation.js.

import * as THREE from 'three';
import { isSharedArmasV1Geometry } from '/Modelos%203D/armasV1.js';
import { buildExternalCharacterRig } from '/Modelos%203D/cocoraModels.js';
import {
  createPoseWeights
} from '/shared/mapData.js';
import {
  prepareAvatarMaterialsForFade,
  applyAvatarOpacity,
  applyActiveWeaponVisibility,
  readMuzzleWorldPosition
} from './avatarPerf.js';
import { createDetailedWeaponMesh } from './weapons.js';
import { createAvatarAnimator } from './animation.js';





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
export function createParachuteCanopy() {
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

  // Preconfigurar transparencia estable una sola vez para el avatar local (evita recompilar shaders en combate)
  prepareAvatarMaterialsForFade(allAvatarMats, isLocal);

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
  const weaponKeys = Object.keys(weapons);
  for (let i = 0; i < weaponKeys.length; i++) {
    const k = weaponKeys[i];
    const m = weapons[k];
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
    poseWeights: createPoseWeights(),
    activeWeapon: 'fists',
    lastAlpha: 1.0,
    hideWeaponInAds: false
  };

  const tmpWorldVec = new THREE.Vector3();
  const muzzleWorldOut = new THREE.Vector3();

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
      applyAvatarOpacity(st, allAvatarMats, weaponMount, healProp.visible, alpha, hideWeapon);
    },
    setWeapon(weaponId) {
      st.activeWeapon = applyActiveWeaponVisibility(weapons, weaponKeys, st.activeWeapon, weaponId);
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
    getMuzzleWorldPosition(fallbackOut, targetOut = muzzleWorldOut) {
      return readMuzzleWorldPosition(root, weapons, st.activeWeapon, tmpWorldVec, targetOut, fallbackOut);
    },
    // Pose procedural por fotograma (ver ./animation.js)
    animate: createAvatarAnimator({
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
      hitFlashMats,
      weapons,
      parachute,
      st
    })
  };
}
