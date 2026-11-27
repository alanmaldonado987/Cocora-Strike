// client/js/world/wildlife.js
// Fauna (oso de anteojos, jaguar, cóndor, danta): modelos, barra de vida, interpolación con el reloj del servidor
// y animación por fotograma.

import * as THREE from 'three';
import { populateExternalBearModel, populateExternalCondorModel, populateExternalTapirModel } from '/Modelos%203D/cocoraModels.js';
import { damp, WILDLIFE_STATE } from '/shared/mapData.js';
import { SnapshotBuffer, createSampleOut } from '../net/interpolation.js';
import { getSharedToonGradient } from '../player/avatar.js';

const _wildSample = createSampleOut();

function createAnimalHealthBarSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 36;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
  );
  sprite.scale.set(1.35, 0.30, 1);
  sprite.position.set(0, 1.85, 0);
  sprite.visible = false;

  sprite.userData.updateBar = (hp, maxHp, isHostile) => {
    if (hp >= maxHp && !isHostile) {
      sprite.visible = false;
      return;
    }
    sprite.visible = true;
    const pct = Math.max(0, Math.min(1, hp / (maxHp || 100)));
    ctx.clearRect(0, 0, 160, 36);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.beginPath();
    ctx.roundRect(10, 8, 140, 20, 8);
    ctx.fill();
    ctx.fillStyle = isHostile ? '#ef4444' : pct > 0.45 ? '#10b981' : '#f59e0b';
    if (pct > 0) {
      ctx.beginPath();
      ctx.roundRect(13, 11, Math.max(6, 134 * pct), 14, 5);
      ctx.fill();
    }
    tex.needsUpdate = true;
  };
  return sprite;
}

function createWildlifeModel(species) {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const headPivot = new THREE.Group();
  const legFL = new THREE.Group();
  const legFR = new THREE.Group();
  const legBL = new THREE.Group();
  const legBR = new THREE.Group();
  const tailPivot = new THREE.Group();
  const wingL = new THREE.Group();
  const wingR = new THREE.Group();
  const flashMaterials = [];
  const toonGrad = getSharedToonGradient();

  const registerMat = (hex) => {
    const m = new THREE.MeshToonMaterial({ color: hex, gradientMap: toonGrad });
    flashMaterials.push(m);
    return m;
  };

  const alertCanvas = document.createElement('canvas');
  alertCanvas.width = 64;
  alertCanvas.height = 64;
  const actx = alertCanvas.getContext('2d');
  actx.fillStyle = 'rgba(220, 38, 38, 0.92)';
  actx.beginPath();
  actx.arc(32, 32, 26, 0, Math.PI * 2);
  actx.fill();
  actx.fillStyle = '#fef08a';
  actx.font = 'bold 40px Segoe UI, sans-serif';
  actx.textAlign = 'center';
  actx.textBaseline = 'middle';
  actx.fillText('!', 32, 34);
  const alertSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(alertCanvas), transparent: true, depthTest: false })
  );
  alertSprite.scale.set(0.68, 0.68, 1);
  alertSprite.position.set(0, 2.35, 0);
  alertSprite.visible = false;
  root.add(alertSprite);

  const hpBarSprite = createAnimalHealthBarSprite();
  root.add(hpBarSprite);

  let paws = null;
  let wingOuterL = null;
  let wingOuterR = null;

  if (species === 'bear') {
    // Oso de Anteojos articulado integrado desde "Animación v2" (Bear.tsx: torso/grupa/cruz, babero y 4 zarpas con garras)
    const bearBuilt = populateExternalBearModel({ bodyPivot, headPivot, legFL, legFR, legBL, legBR }, registerMat);
    paws = bearBuilt.paws;
  } else if (species === 'jaguar') {
    const coatMat = registerMat('#d99326');
    const spotMat = registerMat('#291d12');
    const creamMat = registerMat('#fef3c7');

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 1.25, 10), coatMat);
    torso.rotation.x = Math.PI / 2;
    torso.position.set(0, 0.64, 0);
    torso.castShadow = true;
    torso.receiveShadow = true;
    bodyPivot.add(torso);

    for (const [sx, sy, sz] of [[0.24, 0.68, -0.28], [-0.24, 0.68, -0.22], [0.23, 0.64, 0.22], [-0.23, 0.66, 0.26], [0.16, 0.84, 0]]) {
      const spot = new THREE.Mesh(new THREE.DodecahedronGeometry(0.075, 0), spotMat);
      spot.position.set(sx, sy, sz);
      bodyPivot.add(spot);
    }

    headPivot.position.set(0, 0.78, 0.56);
    const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.21, 1), coatMat);
    skull.position.z = 0.16;
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.18, 8), creamMat);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, -0.05, 0.34);
    for (const sx of [-0.13, 0.13]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.11, 5), spotMat);
      ear.position.set(sx, 0.19, 0.12);
      headPivot.add(ear);
    }
    headPivot.add(skull, muzzle);
    bodyPivot.add(headPivot);

    tailPivot.position.set(0, 0.72, -0.60);
    const tail1 = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.038, 0.52, 7), coatMat);
    tail1.rotation.x = -1.15;
    tail1.position.set(0, -0.10, -0.22);
    const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), spotMat);
    tailTip.position.set(0, -0.20, -0.45);
    tailPivot.add(tail1, tailTip);
    bodyPivot.add(tailPivot);

    const makeCatLeg = (lx, lz) => {
      const g = new THREE.Group();
      g.position.set(lx, 0.48, lz);
      const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.068, 0.48, 8), coatMat);
      limb.position.y = -0.24;
      limb.castShadow = true;
      g.add(limb);
      return g;
    };
    legFL.copy(makeCatLeg(0.18, 0.44));
    legFR.copy(makeCatLeg(-0.18, 0.44));
    legBL.copy(makeCatLeg(0.18, -0.44));
    legBR.copy(makeCatLeg(-0.18, -0.44));
    bodyPivot.add(legFL, legFR, legBL, legBR);
    hpBarSprite.position.y = 1.45;
    alertSprite.position.y = 1.85;
  } else if (species === 'capybara' || species === 'tapir') {
    // Danta Andina / Fauna ribereña integrada desde "Modelos 3D/" (Fauna.tsx -> Tapir)
    populateExternalTapirModel({ bodyPivot, headPivot, legFL, legFR, legBL, legBR }, registerMat);
    hpBarSprite.position.y = 1.25;
  } else {
    // Cóndor Andino integrado desde "Modelos 3D/" + "Animación v2" (alas bi-articuladas con retardo de punta)
    const condorBuilt = populateExternalCondorModel({ bodyPivot, headPivot, wingL, wingR, tailPivot }, registerMat);
    wingOuterL = condorBuilt.wingOuterL;
    wingOuterR = condorBuilt.wingOuterR;
    hpBarSprite.position.y = 1.15;
  }

  return {
    root, bodyPivot, headPivot, legFL, legFR, legBL, legBR, paws, tailPivot, wingL, wingR, wingOuterL, wingOuterR,
    alertSprite, hpBarSprite, flashMaterials, species
  };
}

export const wildlifeMethods = {
  syncWildlife(list = [], serverTime) {
    const hasTime = Number.isFinite(serverTime);
    if (hasTime) this.wildlifeClock.observe(serverTime, performance.now());
    const t = hasTime ? serverTime : (this.wildlifeClock.serverNow(performance.now()) ?? 0);
    const activeIds = new Set(list.map((a) => a.id));
    for (const [id, entry] of this.wildlifeEntries.entries()) {
      if (!activeIds.has(id)) {
        this.wildlifeGroup.remove(entry.model.root);
        this.disposeObjectTree(entry.model.root);
        this.wildlifeEntries.delete(id);
      }
    }

    for (const data of list) {
      let entry = this.wildlifeEntries.get(data.id);
      if (!entry) {
        const model = createWildlifeModel(data.species);
        model.root.position.set(data.x, data.y, data.z);
        model.root.rotation.set(0, data.yaw, 0);
        model.hpBarSprite.userData.updateBar(data.hp, data.maxHp, data.aiState === WILDLIFE_STATE.HOSTILE);
        this.wildlifeGroup.add(model.root);
        entry = {
          model,
          buffer: new SnapshotBuffer(),
          barKey: `${data.hp}|${data.maxHp}|${data.aiState === WILDLIFE_STATE.HOSTILE}`,
          hp: data.hp,
          maxHp: data.maxHp,
          aiState: data.aiState,
          pose: data.pose,
          animPhase: data.animPhase || 0,
          localPhase: data.animPhase || 0,
          rear: 0,
          flashTimer: 0
        };
        this.wildlifeEntries.set(data.id, entry);
      } else {
        entry.hp = data.hp;
        entry.maxHp = data.maxHp;
        entry.aiState = data.aiState;
        entry.pose = data.pose;
        if (entry.localPhase === undefined) entry.localPhase = data.animPhase || 0;
        // Redibujar la barra de vida (canvas + subida de textura) solo si cambió
        const barKey = `${data.hp}|${data.maxHp}|${data.aiState === WILDLIFE_STATE.HOSTILE}`;
        if (barKey !== entry.barKey) {
          entry.barKey = barKey;
          entry.model.hpBarSprite.userData.updateBar(data.hp, data.maxHp, data.aiState === WILDLIFE_STATE.HOSTILE);
        }
      }
      if (!hasTime) entry.buffer.clear();
      entry.buffer.push(t, data.x, data.y, data.z, data.yaw, null);
    }
  },

  triggerWildlifeHitFlash(animalId, hp, maxHp) {
    const entry = this.wildlifeEntries.get(animalId);
    if (!entry) return;
    entry.flashTimer = 0.15;
    if (typeof hp === 'number') {
      entry.hp = hp;
      entry.model.hpBarSprite.userData.updateBar(hp, maxHp || entry.maxHp, entry.aiState === WILDLIFE_STATE.HOSTILE);
    }
  },

  removeWildlife(animalId) {
    const entry = this.wildlifeEntries.get(animalId);
    if (entry) {
      this.wildlifeGroup.remove(entry.model.root);
      this.disposeObjectTree(entry.model.root);
      this.wildlifeEntries.delete(animalId);
    }
  },

  updateWildlifeVisuals(dt, timeSec) {
    const lerpF = 1 - Math.exp(-12 * dt);
    const renderTime = this.wildlifeClock.renderTime(performance.now());
    for (const entry of this.wildlifeEntries.values()) {
      const m = entry.model;
      // Posición y orientación interpoladas entre snapshots del servidor (sin tirones)
      if (entry.buffer.sample(renderTime, _wildSample)) {
        m.root.position.set(_wildSample.x, _wildSample.y, _wildSample.z);
        m.root.rotation.set(0, _wildSample.yaw, 0);
      }

      if (m.species !== 'condor' && this.mapData) {
        const minG = this.mapData.getGroundHeightAt(m.root.position.x, m.root.position.z, _wildSample.y);
        if (m.root.position.y < minG) m.root.position.y = minG;
      }

      m.alertSprite.visible = entry.aiState === WILDLIFE_STATE.HOSTILE;

      if (entry.flashTimer > 0) {
        entry.flashTimer -= dt;
        for (const mat of m.flashMaterials) {
          mat.emissive.setHex(entry.flashTimer > 0 ? 0xdc2626 : 0x000000);
        }
      }

      if (m.species === 'condor') {
        // Animación v2 de Cóndor Andino: aleteo bi-articulado con retardo en puntas de ala (wingOuter) y cabeceo suave
        const freq = 2.1;
        const amp = 0.26;
        const base = 0.16;
        const tWing = timeSec * freq + entry.localPhase;
        const flap = Math.sin(tWing) * amp;
        const lag = Math.sin(tWing - 0.7) * amp * 0.9;
        m.wingL.rotation.z = base + flap;
        m.wingR.rotation.z = -(base + flap);
        if (m.wingOuterL) m.wingOuterL.rotation.z = lag * 0.8;
        if (m.wingOuterR) m.wingOuterR.rotation.z = -lag * 0.8;
        m.bodyPivot.position.y = Math.sin(tWing) * 0.05;
        m.bodyPivot.rotation.x = Math.sin(timeSec * 0.6 + entry.localPhase) * 0.04;
        m.bodyPivot.rotation.z = Math.cos(timeSec * 1.15 + entry.localPhase) * 0.16;
        if (m.tailPivot) m.tailPivot.rotation.x = Math.sin(timeSec * 0.8 + entry.localPhase) * 0.08;
        continue;
      }

      const isMoving = entry.pose === 'wander' || entry.pose === 'run' || entry.pose === 'attack';
      const stepFreq = entry.pose === 'run' ? 10.0 : isMoving ? 4.6 : 0.0;
      entry.localPhase += dt * stepFreq;
      const phase = entry.localPhase;

      if (m.species === 'bear') {
        // Animación v2 de Oso de Anteojos: erguido feroz con zarpazos al atacar, galope asimétrico y flexión de zarpas
        const isAttack = entry.pose === 'attack';
        const atkCycle = (timeSec * 1.25 + entry.animPhase) % 1;
        const targetRear = isAttack ? Math.sin(Math.PI * Math.min(1, atkCycle * 1.25)) : 0;
        entry.rear = damp(entry.rear || 0, targetRear, 10, dt);

        m.bodyPivot.rotation.x = -entry.rear * 0.92;
        m.bodyPivot.position.y =
          entry.rear * 0.24 + (isMoving ? Math.abs(Math.sin(phase)) * (entry.pose === 'run' ? 0.08 : 0.04) : 0);

        const legs = [m.legFL, m.legFR, m.legBL, m.legBR];
        for (let i = 0; i < 4; i++) {
          const front = i < 2;
          const ph = phase + (i === 0 || i === 3 ? 0 : Math.PI) + (entry.pose === 'run' && front ? 0.6 : 0);
          let ang = isMoving ? Math.sin(ph) * (entry.pose === 'run' ? 0.7 : 0.42) : 0;
          if (front && entry.rear > 0.05) {
            ang = -entry.rear * (i === 0 ? 1.58 + Math.sin(atkCycle * 18) * 0.48 : 1.0);
          } else if (!front && entry.rear > 0.05) {
            ang = entry.rear * 0.88;
          }
          legs[i].rotation.x = ang;
          if (m.paws && m.paws[i]) {
            m.paws[i].rotation.x =
              isMoving && entry.rear < 0.1
                ? Math.max(0, -Math.sin(phase + (i === 0 || i === 3 ? 0 : Math.PI))) * 0.58
                : 0;
          }
        }

        const idleLike = entry.pose === 'graze' || entry.pose === 'rest' || !isMoving;
        const targetHeadX = isAttack
          ? -0.35 * entry.rear
          : idleLike
          ? 0.35 + Math.sin(timeSec * 1.1 + entry.animPhase) * 0.12
          : Math.sin(phase * 2) * 0.05;
        const targetHeadY = idleLike && !isAttack ? Math.sin(timeSec * 0.6 + entry.animPhase) * 0.28 : 0;
        m.headPivot.rotation.x += (targetHeadX - m.headPivot.rotation.x) * lerpF;
        m.headPivot.rotation.y += (targetHeadY - m.headPivot.rotation.y) * lerpF;
        continue;
      }

      const legAmp = entry.pose === 'run' ? 0.68 : isMoving ? 0.38 : 0.0;
      const swing = Math.sin(phase) * legAmp;

      m.legFL.rotation.x = swing;
      m.legBR.rotation.x = swing;
      m.legFR.rotation.x = -swing;
      m.legBL.rotation.x = -swing;

      if (entry.pose === 'graze') {
        m.headPivot.rotation.x += (0.52 + Math.sin(timeSec * 1.4 + entry.animPhase) * 0.08 - m.headPivot.rotation.x) * lerpF;
        m.bodyPivot.position.y += (0 - m.bodyPivot.position.y) * lerpF;
      } else if (entry.pose === 'rest') {
        m.headPivot.rotation.x += (0.15 - m.headPivot.rotation.x) * lerpF;
        m.bodyPivot.position.y += (-0.14 - m.bodyPivot.position.y) * lerpF;
      } else if (entry.pose === 'attack') {
        m.headPivot.rotation.x = Math.sin(timeSec * 15) * 0.45 - 0.18;
        m.bodyPivot.position.y += (0.10 - m.bodyPivot.position.y) * lerpF;
      } else {
        m.headPivot.rotation.x += ((isMoving ? Math.sin(phase) * 0.05 : 0) - m.headPivot.rotation.x) * lerpF;
        m.bodyPivot.position.y += (Math.abs(Math.cos(phase)) * 0.04 * (isMoving ? 1 : 0) - m.bodyPivot.position.y) * lerpF;
      }

      if (m.tailPivot) {
        m.tailPivot.rotation.y = Math.sin(timeSec * 3.5 + entry.animPhase) * 0.32;
      }
    }
  }
};
