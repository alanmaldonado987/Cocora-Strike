// client/js/world/world.js
// Mundo 3D Cel-Shaded / Low-Poly (VoxelWorld): grupos de escena, construcción del mapa desde la semilla compartida,
// liberación de recursos y actualización por fotograma. La lógica está repartida en mixins de client/js/world/:
// materials, foliage, lights, sky, terrain, structures, aircraft, loot, wildlife y effects (agua en water.js).

import * as THREE from 'three';
import { isSharedArmasV1Geometry, isSharedArmasV1Material } from '/Modelos%203D/armasV1.js';
import { isSharedAircraftGeometry, isSharedAircraftMaterial } from '/Modelos%203D/avionesShared.js';
import { generateCocoraMap, damp } from '/shared/mapData.js';
import { mixMethods } from '../core/mixin.js';
import { ServerClock } from '../net/interpolation.js';
import { aircraftMethods } from './aircraft.js';
import { _tmpEuler, _tmpQuatB } from './common.js';
import { effectMethods } from './effects.js';
import { foliageMethods } from './foliage.js';
import { lightMethods } from './lights.js';
import { LOOT_VISIBLE_DISTANCE, lootMethods } from './loot.js';
import { materialMethods } from './materials.js';
import { skyMethods } from './sky.js';
import { structureMethods } from './structures.js';
import { terrainMethods } from './terrain.js';
import { wildlifeMethods } from './wildlife.js';

export class VoxelWorld {
  constructor(scene) {
    this.scene = scene;
    this.mapData = null;

    this.terrainGroup = new THREE.Group();
    this.structuresGroup = new THREE.Group();
    this.foliageGroup = new THREE.Group();
    this.wildlifeGroup = new THREE.Group();
    this.lootGroup = new THREE.Group();
    this.poolGroup = new THREE.Group();

    this.scene.add(
      this.terrainGroup,
      this.structuresGroup,
      this.foliageGroup,
      this.wildlifeGroup,
      this.lootGroup,
      this.poolGroup
    );

    // Caché de materiales y geometrías compartidas (ver world/materials.js)
    this.initSharedMaterialCache();

    this.lootMeshes = new Map();
    this.lootItemsData = new Map();
    this.wildlifeEntries = new Map();
    this.wildlifeClock = new ServerClock();
    this.doorVisuals = new Map();
    this.windowVisuals = new Map();

    // Estado atmosférico dinámico:
    // - Niebla andina gris-azulada suave -> Niebla púrpura oscura en tormenta
    // - Transición cálida de incendio (ámbar/anaranjado humeante + cenizas/brasas) a < 45m del AH-64D siniestrado
    this.stormAtmosphereFactor = 0;
    this.crashAtmosphereFactor = 0;
    this.clearSkyColor = new THREE.Color('#8bc6e6');
    this.stormSkyColor = new THREE.Color('#211132');
    this.crashSkyColor = new THREE.Color('#703c1f');
    this.clearFogColor = new THREE.Color('#b6d0e4');
    this.stormFogColor = new THREE.Color('#261338');
    this.crashFogColor = new THREE.Color('#582814');
    this.baseHemiSky = new THREE.Color('#eef8ff');
    this.baseHemiGround = new THREE.Color('#3a5f41');
    this.crashHemiSky = new THREE.Color('#ffb273');
    this.crashHemiGround = new THREE.Color('#4a2615');
    this.baseSunColor = new THREE.Color('#fff2c4');
    this.crashSunColor = new THREE.Color('#ff9d52');
    this.hemiLight = null;
    this.sunLight = null;
    this.stormParticles = null;
    this.crashAshParticles = null;
    this.heliSmokeAccum = 0;
    this.heliAnimState = null;
    this.aircraftRigs = null;
    this.activeAircraftId = 'ac130';
    this.cameraOccluders = [];

    // Buffer reutilizable sin allocs para detección contextual [E]
    this._interactResult = { kind: null, id: null, promptText: '' };

    // InstancedMesh global de Nubes Dispersas (1 único draw call para todo el cielo)
    this.cloudClusters = [];
    this.cloudInstancedMesh = null;

    // Object Pools fijos (Cero new THREE.* por disparo, derrape, curación, humo/fuego, cristales o puertas)
    this.particlePool = [];
    this.particleCursor = 0;
    this.tracerPool = [];
    this.tracerCursor = 0;

    this.planeInitialized = false;
    this.lastPlaneServerRef = null;
    this.planeServerPredPos = new THREE.Vector3();
    this.planeSmoothPos = new THREE.Vector3();
    this.planeVelocity = new THREE.Vector3();
    this.planeSmoothQuat = new THREE.Quaternion();
    this.planeSmoothYaw = 0;

    this.initLightingInstancedCloudsAndPools();
    this.planeMesh = this.createPlaneModel();
    this.planeMesh.visible = false;
    this.scene.add(this.planeMesh);

    this.stormMesh = this.createStormCylinder();
    this.scene.add(this.stormMesh);
  }

  disposeObjectTree(obj) {
    if (!obj) return;
    obj.traverse((child) => {
      if (
        child.geometry &&
        !this.sharedGeometries.has(child.geometry) &&
        !isSharedArmasV1Geometry(child.geometry) &&
        !isSharedAircraftGeometry(child.geometry)
      ) {
        child.geometry.dispose();
      }
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (let i = 0; i < mats.length; i++) {
          const m = mats[i];
          if (
            !m ||
            this.sharedMaterials.has(m) ||
            isSharedArmasV1Material(m) ||
            isSharedAircraftMaterial(m)
          ) {
            continue;
          }
          if (m.map && m.map !== this.waterTexture && m.map.isCanvasTexture && child.isSprite) {
            m.map.dispose();
          }
          m.dispose();
        }
      }
    });
  }

  clearGroup(group) {
    while (group.children.length > 0) {
      const child = group.children.pop();
      this.disposeObjectTree(child);
    }
  }

  buildFromSeed(seed) {
    this.clearGroup(this.terrainGroup);
    this.clearGroup(this.structuresGroup);
    this.clearGroup(this.foliageGroup);
    this.doorVisuals.clear();
    this.windowVisuals.clear();
    this.resetMapLightAnchors();
    this.planeInitialized = false;
    this.lastPlaneServerRef = null;

    for (let i = 0; i < this.particlePool.length; i++) {
      this.particlePool[i].active = false;
      this.particlePool[i].mesh.visible = false;
    }
    for (let i = 0; i < this.tracerPool.length; i++) {
      this.tracerPool[i].active = false;
      this.tracerPool[i].line.visible = false;
    }

    this.mapData = generateCocoraMap(seed);
    this.groundCover.reset(this.mapData, seed);
    this.buildOrganicTerrainAndRiver(this.mapData);
    this.buildRealisticStructuresAndPOIs(this.mapData);
    this.buildInstancedEnvironment(this.mapData);
    this.rebuildCameraOccluders();
    return this.mapData;
  }

  update(dt, timeSec, planeState, stormState, viewerPos = null) {
    this.windUniform.value = timeSec;
    this.waterTexture.offset.y -= dt * 0.44;

    // El sol (frustum de sombras) y las luces puntuales se actualizan en updateRenderBudget(),
    // que main.js llama justo antes de renderizar, ya con la cámara del fotograma.

    // Humo denso ascendente, llamas vivas, chispas recicladas por Object Pool y rotor del AH-64D Apache siniestrado
    if (this.mapData && this.mapData.helicopterWreck) {
      const hw = this.mapData.helicopterWreck;
      if (this.heliAnimState?.update) {
        this.heliAnimState.update(dt, timeSec);
      }
      const nearHeli = !viewerPos || Math.hypot(viewerPos.x - hw.x, viewerPos.z - hw.z) < 250;
      if (nearHeli) {
        this.heliSmokeAccum += dt;
        if (this.heliSmokeAccum >= 0.075) {
          this.heliSmokeAccum = 0;
          const emitters = this.heliAnimState?.emitterPoints;
          const em =
            emitters && emitters.length > 0
              ? emitters[Math.floor(Math.random() * emitters.length)]
              : { x: hw.x, y: hw.y + 1.6, z: hw.z - 0.4, scale: 1.0 };

          this._acquireParticle(
            em.x + (Math.random() - 0.5) * 0.95,
            em.y + 0.55,
            em.z + (Math.random() - 0.5) * 0.95,
            0.35 + (Math.random() - 0.5) * 0.75,
            2.7 + Math.random() * 1.35,
            (Math.random() - 0.5) * 0.75,
            this.poolMats.darkSmoke,
            2.15,
            -0.35,
            2.35 * (em.scale || 1),
            2.85
          );
          this._acquireParticle(
            em.x + (Math.random() - 0.5) * 0.75,
            em.y + 0.15,
            em.z + (Math.random() - 0.5) * 0.75,
            (Math.random() - 0.5) * 1.35,
            2.1 + Math.random() * 1.9,
            (Math.random() - 0.5) * 1.35,
            Math.random() > 0.34 ? this.poolMats.fireOrange : this.poolMats.sparkGold,
            0.52,
            Math.random() > 0.5 ? -0.8 : 6.5,
            1.55 * (em.scale || 1),
            -1.3
          );
        }
      }
    }

    // Animar giro suave de puertas interactivas abiertas/cerradas de forma continua
    for (const dEntry of this.doorVisuals.values()) {
      if (Math.abs(dEntry.curAngle - dEntry.targetAngle) > 0.005) {
        dEntry.curAngle = damp(dEntry.curAngle, dEntry.targetAngle, 12, dt);
        dEntry.pivot.rotation.y = dEntry.curAngle;
      }
    }

    // Actualizar matrices del InstancedMesh único de nubes sin crear objetos
    for (let i = 0; i < this.cloudClusters.length; i++) {
      const c = this.cloudClusters[i];
      c.x += dt * c.speedX;
      c.z += dt * c.speedZ;
      if (c.x > 380) c.x = -380;
      if (c.z > 380) c.z = -380;
      if (c.z < -380) c.z = 380;
    }
    this.updateCloudInstancedMatrices();

    if (planeState && planeState.active) {
      this.planeMesh.visible = true;
      if (planeState.aircraftType && planeState.aircraftType !== this.activeAircraftId) {
        this.setActiveAircraft(planeState.aircraftType);
      }

      const turbPitch = Math.cos(timeSec * 1.15) * 0.012;
      const turbRoll = Math.sin(timeSec * 1.5) * 0.022;

      if (!this.planeInitialized) {
        this.resetPlaneTracking(planeState);
      } else {
        if (this.lastPlaneServerRef !== planeState) {
          this.lastPlaneServerRef = planeState;
          this.planeServerPredPos.set(planeState.x, planeState.y, planeState.z);
          this.planeVelocity.set(planeState.vx || 0, 0, planeState.vz || 0);
        } else {
          this.planeServerPredPos.addScaledVector(this.planeVelocity, dt);
        }

        this.planeSmoothPos.addScaledVector(this.planeVelocity, dt);
        const corr = 1 - Math.exp(-8 * dt);
        this.planeSmoothPos.lerp(this.planeServerPredPos, corr);

        this.planeSmoothYaw = planeState.yaw || 0;
        _tmpEuler.set(turbPitch, this.planeSmoothYaw, turbRoll, 'YXZ');
        _tmpQuatB.setFromEuler(_tmpEuler);
        this.planeSmoothQuat.slerp(_tmpQuatB, corr);

        this.planeMesh.position.copy(this.planeSmoothPos);
        this.planeMesh.quaternion.copy(this.planeSmoothQuat);
        this.planeMesh.updateMatrixWorld(true);
      }

      const activeRig = this.getActiveAircraftRig();
      this.driveActiveAircraft(planeState, viewerPos);
      activeRig?.update(dt, { pitch: turbPitch, roll: turbRoll });
    } else {
      this.planeMesh.visible = false;
      this.planeInitialized = false;
    }

    if (stormState) {
      this.stormMesh.visible = stormState.radius > 0.2;
      const r = Math.max(0.5, stormState.radius);
      this.stormMesh.position.x = stormState.centerX;
      this.stormMesh.position.z = stormState.centerZ;
      this.stormMesh.scale.set(r, 1, r);
      this.stormMesh.material.opacity = 0.22 + Math.sin(timeSec * 3.5) * 0.04;
    }

    this.updateStormAtmosphere(dt, timeSec, stormState, viewerPos);

    // Botín: cada objeto son ~10 piezas; más allá de LOOT_VISIBLE_DISTANCE mide pocos píxeles,
    // así que no se dibuja (antes el botín de todo el mapa sumaba ~2000 llamadas de dibujo).
    const lootMaxD2 = LOOT_VISIBLE_DISTANCE * LOOT_VISIBLE_DISTANCE;
    for (const obj of this.lootMeshes.values()) {
      if (viewerPos) {
        const dx = obj.position.x - viewerPos.x;
        const dz = obj.position.z - viewerPos.z;
        obj.visible = dx * dx + dz * dz < lootMaxD2;
        if (!obj.visible) continue;
      }
      const mats = obj.userData.highlightMats;
      const pulse = 0.20 + Math.sin(timeSec * 3.6 + obj.userData.phase) * 0.10;
      if (mats && mats.length > 0) {
        for (let i = 0; i < mats.length; i++) {
          mats[i].emissiveIntensity = pulse;
        }
      }
      if (obj.userData.glowRingMat) {
        obj.userData.glowRingMat.opacity = 0.28 + Math.sin(timeSec * 3.6 + obj.userData.phase) * 0.16;
      }
    }

    this.updateWildlifeVisuals(dt, timeSec);

    // Actualizar trazadores del Object Pool
    for (let i = 0; i < this.tracerPool.length; i++) {
      const t = this.tracerPool[i];
      if (!t.active) continue;
      t.ttl -= dt;
      if (t.ttl <= 0) {
        t.active = false;
        t.line.visible = false;
      } else {
        t.mat.opacity = t.ttl / t.maxTtl;
      }
    }

    // Actualizar partículas del Object Pool
    for (let i = 0; i < this.particlePool.length; i++) {
      const p = this.particlePool[i];
      if (!p.active) continue;
      p.ttl -= dt;
      if (p.ttl <= 0) {
        p.active = false;
        p.mesh.visible = false;
      } else {
        p.vy -= p.gravity * dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        if (p.growRate !== 0) {
          p.scale = Math.max(0.15, p.scale + p.growRate * dt);
          p.mesh.scale.setScalar(p.scale);
        }
      }
    }
  }
}

mixMethods(
  VoxelWorld,
  materialMethods,
  foliageMethods,
  lightMethods,
  skyMethods,
  terrainMethods,
  structureMethods,
  aircraftMethods,
  lootMethods,
  wildlifeMethods,
  effectMethods
);
