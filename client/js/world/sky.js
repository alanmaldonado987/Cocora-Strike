// client/js/world/sky.js
// Cielo y atmósfera: luces hemisférica/solar, nubes instanciadas (1 draw call), pools de partículas,
// cilindro de tormenta y transición de niebla/cielo (andina, tormenta púrpura, incendio del helicóptero).

import * as THREE from 'three';
import { createRNG, damp, PLAYER_STATE } from '/shared/mapData.js';
import { getSharedToonGradient } from '../player/avatar.js';
import {
  _tmpVecA,
  _tmpScale,
  _tmpEuler,
  _tmpQuatA,
  _tmpMat4
} from './common.js';
import { MAX_ACTIVE_POINT_LIGHTS } from './lights.js';

export const skyMethods = {
  initLightingInstancedCloudsAndPools() {
    this.scene.background = this.clearSkyColor.clone();
    this.scene.fog = new THREE.FogExp2(this.clearFogColor.clone(), 0.00155);

    this.hemiLight = new THREE.HemisphereLight('#eef8ff', '#3a5f41', 0.98);
    this.scene.add(this.hemiLight);

    // Luz solar cálida con sombras dinámicas PCFSoftShadowMap de 2048x2048 siguiendo al jugador
    this.sunLight = new THREE.DirectionalLight('#fff2c4', 1.48);
    this.sunLight.position.set(120, 180, 90);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 265;
    const shadowHalf = 92;
    this.sunLight.shadow.camera.left = -shadowHalf;
    this.sunLight.shadow.camera.right = shadowHalf;
    this.sunLight.shadow.camera.top = shadowHalf;
    this.sunLight.shadow.camera.bottom = -shadowHalf;
    this.sunLight.shadow.bias = -0.00045;
    this.sunLight.shadow.normalBias = 0.032;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);
    this.shadowTexelSize = (shadowHalf * 2) / this.sunLight.shadow.mapSize.x;

    // Pool fijo de luces puntuales que se reparten entre los "anclajes" de luz del mapa
    this.lightAnchors = [];
    this.lightCandidates = [];
    this.pointLightSlots = [];
    for (let i = 0; i < MAX_ACTIVE_POINT_LIGHTS; i++) {
      const light = new THREE.PointLight('#ffffff', 0, 1, 2);
      this.scene.add(light);
      this.pointLightSlots.push({ light, anchor: null, weight: 0 });
    }
    this.compareLightCandidates = (a, b) => a.userData.lightScore - b.userData.lightScore;

    // Nubes Volumétricas Low-Poly agrupadas en UN SOLO THREE.InstancedMesh
    const cloudRng = createRNG(88421);
    const puffsFlat = [];
    for (let i = 0; i < 44; i++) {
      const puffCount = 5 + Math.floor(cloudRng() * 5);
      const overallScale = 0.65 + cloudRng() * 1.25;
      const cluster = {
        x: (cloudRng() - 0.5) * 740,
        y: 104 + cloudRng() * 64,
        z: (cloudRng() - 0.5) * 740,
        speedX: 1.6 + cloudRng() * 2.4,
        speedZ: (cloudRng() - 0.5) * 0.8,
        puffs: []
      };
      for (let p = 0; p < puffCount; p++) {
        const pAng = cloudRng() * Math.PI * 2;
        const pDist = Math.sqrt(cloudRng()) * 12.5 * overallScale;
        const puffDesc = {
          ox: Math.cos(pAng) * pDist,
          oy: (cloudRng() - 0.45) * 3.8 * overallScale,
          oz: Math.sin(pAng) * pDist * 0.8,
          sx: (6.5 + cloudRng() * 8.5) * overallScale,
          sy: (3.2 + cloudRng() * 4.0) * overallScale,
          sz: (6.0 + cloudRng() * 8.0) * overallScale,
          rx: cloudRng() * 0.4,
          ry: cloudRng() * Math.PI * 2,
          rz: cloudRng() * 0.4,
          instIdx: puffsFlat.length
        };
        cluster.puffs.push(puffDesc);
        puffsFlat.push(puffDesc);
      }
      this.cloudClusters.push(cluster);
    }

    const cloudMat = new THREE.MeshToonMaterial({
      color: '#ffffff',
      gradientMap: getSharedToonGradient(),
      transparent: true,
      opacity: 0.88
    });
    this.sharedMaterials.add(cloudMat);
    this.cloudInstancedMesh = new THREE.InstancedMesh(this.prototypes.cloudPuff, cloudMat, puffsFlat.length);
    // Frustum Culling nativo de GPU con esfera envolvente global del cielo: oculta solo el draw call si la cámara
    // mira al suelo, mientras update() avanza posiciones y matrices en cada frame sin pausar jamás el cielo.
    this.cloudInstancedMesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 136, 0), 580);
    this.cloudInstancedMesh.frustumCulled = true;
    this.cloudInstancedMesh.castShadow = false;
    this.cloudInstancedMesh.receiveShadow = false;
    this.scene.add(this.cloudInstancedMesh);
    this.updateCloudInstancedMatrices();

    // Partículas atmosféricas flotantes de tormenta
    const moteCount = 260;
    const motePositions = new Float32Array(moteCount * 3);
    const moteSeeds = new Float32Array(moteCount);
    for (let i = 0; i < moteCount; i++) {
      motePositions[i * 3] = (Math.random() - 0.5) * 46;
      motePositions[i * 3 + 1] = Math.random() * 18;
      motePositions[i * 3 + 2] = (Math.random() - 0.5) * 46;
      moteSeeds[i] = Math.random() * Math.PI * 2;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
    moteGeo.userData.seeds = moteSeeds;
    const moteMat = new THREE.PointsMaterial({
      color: '#c084fc',
      size: 0.24,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    this.sharedGeometries.add(moteGeo);
    this.sharedMaterials.add(moteMat);
    this.stormParticles = new THREE.Points(moteGeo, moteMat);
    this.stormParticles.visible = false;
    this.poolGroup.add(this.stormParticles);

    // Nube reutilizable de cenizas y brasas flotantes alrededor del AH-64D siniestrado (0 allocs en animate)
    const ashCount = 190;
    const ashPositions = new Float32Array(ashCount * 3);
    const ashColors = new Float32Array(ashCount * 3);
    const ashSeeds = new Float32Array(ashCount);
    const emberCol = new THREE.Color('#ff8c38');
    const ashCol = new THREE.Color('#57534e');
    for (let i = 0; i < ashCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(Math.random()) * 36;
      ashPositions[i * 3] = Math.cos(ang) * rad;
      ashPositions[i * 3 + 1] = Math.random() * 17;
      ashPositions[i * 3 + 2] = Math.sin(ang) * rad;
      ashSeeds[i] = Math.random() * Math.PI * 2;
      const c = i % 3 === 0 ? emberCol : ashCol;
      ashColors[i * 3] = c.r;
      ashColors[i * 3 + 1] = c.g;
      ashColors[i * 3 + 2] = c.b;
    }
    const ashGeo = new THREE.BufferGeometry();
    ashGeo.setAttribute('position', new THREE.BufferAttribute(ashPositions, 3));
    ashGeo.setAttribute('color', new THREE.BufferAttribute(ashColors, 3));
    ashGeo.userData.seeds = ashSeeds;
    const ashMat = new THREE.PointsMaterial({
      size: 0.22,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    this.sharedGeometries.add(ashGeo);
    this.sharedMaterials.add(ashMat);
    this.crashAshParticles = new THREE.Points(ashGeo, ashMat);
    this.crashAshParticles.visible = false;
    this.crashAshParticles.frustumCulled = false;
    this.poolGroup.add(this.crashAshParticles);

    // ==================== OBJECT POOL AMPLIADO (220 PARTÍCULAS + 36 TRAZADORES) ====================
    const poolPartGeo = new THREE.OctahedronGeometry(0.095, 0);
    this.sharedGeometries.add(poolPartGeo);
    this.poolMats = {
      dust: new THREE.MeshBasicMaterial({ color: '#b89768', transparent: true, opacity: 0.85 }),
      hitRed: new THREE.MeshBasicMaterial({ color: '#ef4444' }),
      sparkGold: new THREE.MeshBasicMaterial({ color: '#facc15' }),
      healGreen: new THREE.MeshBasicMaterial({ color: '#34d399', transparent: true, opacity: 0.92 }),
      darkSmoke: new THREE.MeshBasicMaterial({ color: '#1f2937', transparent: true, opacity: 0.72 }),
      fireOrange: new THREE.MeshBasicMaterial({ color: '#f97316', transparent: true, opacity: 0.92 }),
      woodSplinter: new THREE.MeshBasicMaterial({ color: '#8f5b34' }),
      glassShard: new THREE.MeshBasicMaterial({ color: '#bae6fd', transparent: true, opacity: 0.88 }),
      waterRipple: new THREE.MeshBasicMaterial({ color: '#bae6fd', transparent: true, opacity: 0.78 }),
      waterFoam: new THREE.MeshBasicMaterial({ color: '#f0f9ff', transparent: true, opacity: 0.88 })
    };
    Object.values(this.poolMats).forEach((m) => this.sharedMaterials.add(m));

    for (let i = 0; i < 220; i++) {
      const mesh = new THREE.Mesh(poolPartGeo, this.poolMats.sparkGold);
      mesh.visible = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.poolGroup.add(mesh);
      this.particlePool.push({
        active: false,
        mesh,
        vx: 0,
        vy: 0,
        vz: 0,
        gravity: 14,
        growRate: 0,
        scale: 1,
        ttl: 0,
        maxTtl: 0.3
      });
    }

    for (let i = 0; i < 36; i++) {
      const positions = new Float32Array(6);
      const lineGeo = new THREE.BufferGeometry();
      const posAttr = new THREE.BufferAttribute(positions, 3);
      posAttr.setUsage(THREE.DynamicDrawUsage);
      lineGeo.setAttribute('position', posAttr);
      const lineMat = new THREE.LineBasicMaterial({
        color: '#bae6fd',
        transparent: true,
        opacity: 0.88
      });
      this.sharedGeometries.add(lineGeo);
      this.sharedMaterials.add(lineMat);

      const line = new THREE.Line(lineGeo, lineMat);
      line.visible = false;
      line.frustumCulled = false;
      this.poolGroup.add(line);
      this.tracerPool.push({
        active: false,
        line,
        posAttr,
        mat: lineMat,
        ttl: 0,
        maxTtl: 0.08
      });
    }
  },

  updateCloudInstancedMatrices() {
    if (!this.cloudInstancedMesh) return;
    for (let i = 0; i < this.cloudClusters.length; i++) {
      const cl = this.cloudClusters[i];
      for (let p = 0; p < cl.puffs.length; p++) {
        const pf = cl.puffs[p];
        _tmpVecA.set(cl.x + pf.ox, cl.y + pf.oy, cl.z + pf.oz);
        _tmpEuler.set(pf.rx, pf.ry, pf.rz);
        _tmpQuatA.setFromEuler(_tmpEuler);
        _tmpScale.set(pf.sx, pf.sy, pf.sz);
        _tmpMat4.compose(_tmpVecA, _tmpQuatA, _tmpScale);
        this.cloudInstancedMesh.setMatrixAt(pf.instIdx, _tmpMat4);
      }
    }
    this.cloudInstancedMesh.instanceMatrix.needsUpdate = true;
  },

  createStormCylinder() {
    const geo = new THREE.CylinderGeometry(1, 1, 250, 64, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: '#7c3aed',
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 110;
    mesh.visible = false;
    return mesh;
  },

  updateStormAtmosphere(dt, timeSec, stormState, viewerPos) {
    let targetFactor = 0;
    let targetCrashFactor = 0;
    const hw = this.mapData?.helicopterWreck;

    if (viewerPos && viewerPos.active && viewerPos.state !== PLAYER_STATE.PLANE) {
      if (stormState) {
        const distCenter = Math.hypot(viewerPos.x - stormState.centerX, viewerPos.z - stormState.centerZ);
        const distToEdge = stormState.radius - distCenter;

        if (distToEdge <= 0) {
          targetFactor = Math.min(1.0, 0.64 + (Math.abs(distToEdge) / 28.0) * 0.36);
        } else if (distToEdge < 44) {
          const nearT = 1 - distToEdge / 44;
          targetFactor = nearT * nearT * 0.60;
        }
      }

      if (hw) {
        const crashCenterX = (hw.x + (hw.tailX ?? hw.x)) * 0.5;
        const crashCenterZ = (hw.z + (hw.tailZ ?? hw.z)) * 0.5;
        const radius = hw.atmosphereRadius || 45.0;
        const distCrash = Math.hypot(viewerPos.x - crashCenterX, viewerPos.z - crashCenterZ);
        if (distCrash < radius) {
          const raw = 1 - distCrash / radius;
          targetCrashFactor = raw * raw * (3 - 2 * raw);
        }
      }
    }

    this.stormAtmosphereFactor = damp(this.stormAtmosphereFactor, targetFactor, 3.6, dt);
    this.crashAtmosphereFactor = damp(this.crashAtmosphereFactor, targetCrashFactor, 3.2, dt);
    const sf = this.stormAtmosphereFactor;
    const cf = this.crashAtmosphereFactor;

    this.scene.fog.color.copy(this.clearFogColor).lerp(this.crashFogColor, cf * 0.78).lerp(this.stormFogColor, sf);
    this.scene.fog.density = 0.00155 + cf * 0.0068 + sf * sf * 0.025;
    this.scene.background.copy(this.clearSkyColor).lerp(this.crashSkyColor, cf * 0.65).lerp(this.stormSkyColor, sf);

    if (this.hemiLight && this.sunLight) {
      this.hemiLight.color.copy(this.baseHemiSky).lerp(this.crashHemiSky, cf * 0.85);
      this.hemiLight.groundColor.copy(this.baseHemiGround).lerp(this.crashHemiGround, cf * 0.85);
      this.sunLight.color.copy(this.baseSunColor).lerp(this.crashSunColor, cf * 0.75);
      this.hemiLight.intensity = 0.98 + cf * 0.14 - sf * 0.38;
      this.sunLight.intensity = 1.48 - cf * 0.18 - sf * 0.78;
    }

    if (this.crashAshParticles && hw) {
      const distForAsh = viewerPos ? Math.hypot(viewerPos.x - hw.x, viewerPos.z - hw.z) : 999;
      if (distForAsh < 95) {
        this.crashAshParticles.visible = true;
        this.crashAshParticles.position.set((hw.x + hw.tailX) * 0.5, hw.y, (hw.z + hw.tailZ) * 0.5);
        this.crashAshParticles.material.opacity = Math.min(0.92, 0.26 + cf * 0.68);
        const posAttr = this.crashAshParticles.geometry.attributes.position;
        const seeds = this.crashAshParticles.geometry.userData.seeds;
        for (let i = 0; i < posAttr.count; i++) {
          let px = posAttr.getX(i) + Math.sin(timeSec * 1.4 + seeds[i]) * dt * 1.6;
          let py = posAttr.getY(i) + dt * (i % 3 === 0 ? 2.2 : 0.95);
          let pz = posAttr.getZ(i) + Math.cos(timeSec * 1.2 + seeds[i]) * dt * 1.5;
          if (py > 18) {
            py = 0.2;
            const a = seeds[i] + timeSec * 0.3;
            const rad = (i % 19) * 1.7;
            px = Math.cos(a) * rad;
            pz = Math.sin(a) * rad;
          }
          posAttr.setXYZ(i, px, py, pz);
        }
        posAttr.needsUpdate = true;
      } else {
        this.crashAshParticles.visible = false;
      }
    }

    if (this.stormParticles) {
      if (sf > 0.05 && viewerPos) {
        this.stormParticles.visible = true;
        this.stormParticles.position.set(viewerPos.x, viewerPos.y, viewerPos.z);
        this.stormParticles.material.opacity = Math.min(0.85, sf * 0.9);

        const posAttr = this.stormParticles.geometry.attributes.position;
        const seeds = this.stormParticles.geometry.userData.seeds;
        for (let i = 0; i < posAttr.count; i++) {
          let px = posAttr.getX(i) + Math.sin(timeSec * 1.8 + seeds[i]) * dt * 2.6;
          let py = posAttr.getY(i) - dt * (1.8 + (i % 3) * 0.6);
          let pz = posAttr.getZ(i) + Math.cos(timeSec * 1.5 + seeds[i]) * dt * 2.4;
          if (py < -2) py = 16;
          if (px > 23) px = -23;
          if (px < -23) px = 23;
          if (pz > 23) pz = -23;
          if (pz < -23) pz = 23;
          posAttr.setXYZ(i, px, py, pz);
        }
        posAttr.needsUpdate = true;
      } else {
        this.stormParticles.visible = false;
      }
    }
  }
};
