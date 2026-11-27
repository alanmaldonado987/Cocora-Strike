// client/js/world/terrain.js
// Terreno orgánico por bloques de 80 m (40 celdas) y cauce del río, más los oclusores de cámara usados por el
// anti-clipping de la cámara en 3ra persona.

import * as THREE from 'three';
import {
  CELL_SIZE,
  GRID_SIZE,
  WORLD_SIZE,
  WORLD_HALF,
  WATER_LEVEL,
  LAGOON_CONFIG,
  SURFACE,
  getWaterChannelAt,
  getWaterProfileAt
} from '/shared/mapData.js';
import { getSharedToonGradient } from '../player/avatar.js';
import { _occSphere, _tmpVecA } from './common.js';

// ==================== PRESUPUESTO DE RENDER (sin pérdida de calidad) ====================
// Terreno y vegetación se dividen en bloques para que la cámara y la sombra solar solo
// dibujen lo que cae dentro de su volumen. El resultado en pantalla es idéntico.
const TERRAIN_CHUNK_CELLS = 40; // 40 celdas x 2 m = bloques de 80 m

export const terrainMethods = {
  /**
   * Precalcula las esferas envolventes de todas las mallas opacas de terreno y estructuras
   * para el Raycaster de colisión de cámara en 3ra persona (cero allocs por fotograma).
   */
  rebuildCameraOccluders() {
    this.cameraOccluders.length = 0;
    this.terrainGroup.updateMatrixWorld(true);
    this.structuresGroup.updateMatrixWorld(true);

    const registerGroup = (group) => {
      group.traverse((obj) => {
        if (!obj.isMesh || obj.isInstancedMesh || obj.userData?.noCameraBlock) return;
        const mat = obj.material;
        if (!mat || Array.isArray(mat) || mat.transparent) return;
        const geo = obj.geometry;
        if (!geo) return;
        if (!geo.boundingSphere) geo.computeBoundingSphere();
        if (!geo.boundingBox) geo.computeBoundingBox();
        _occSphere.copy(geo.boundingSphere).applyMatrix4(obj.matrixWorld);
        this.cameraOccluders.push({
          mesh: obj,
          cx: _occSphere.center.x,
          cz: _occSphere.center.z,
          r: _occSphere.radius
        });
      });
    };

    registerGroup(this.terrainGroup);
    registerGroup(this.structuresGroup);
  },

  /**
   * Llena outMeshes (sin asignar memoria) con las mallas opacas cercanas al pivote de cámara.
   */
  collectCameraOccludersNear(x, z, searchRadius, outMeshes) {
    outMeshes.length = 0;
    const list = this.cameraOccluders;
    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      if (!entry.mesh.visible || (entry.mesh.parent && !entry.mesh.parent.visible)) continue;
      const dx = entry.cx - x;
      const dz = entry.cz - z;
      const lim = entry.r + searchRadius;
      if (dx * dx + dz * dz <= lim * lim) {
        outMeshes.push(entry.mesh);
      }
    }
    return outMeshes;
  },

  buildOrganicTerrainAndRiver(map) {
    const V = GRID_SIZE + 1;
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, GRID_SIZE, GRID_SIZE);
    geo.rotateX(-Math.PI / 2);

    const posAttr = geo.attributes.position;
    const colors = new Float32Array(posAttr.count * 3);
    const tmpCol = new THREE.Color();
    const rockCol = new THREE.Color('#646e7c');

    const palette = {
      [SURFACE.GRASS_VALLEY]: new THREE.Color('#42b049'),
      [SURFACE.GRASS_MOUNTAIN]: new THREE.Color('#2d7e3f'),
      [SURFACE.COFFEE_TERRACE]: new THREE.Color('#5e4e2f'),
      [SURFACE.DIRT_TRAIL]: new THREE.Color('#b58250'),
      [SURFACE.ROCK_CLIFF]: new THREE.Color('#687280'),
      [SURFACE.RIVER_SAND]: new THREE.Color('#ded09c'),
      [SURFACE.RIVER_BED]: new THREE.Color('#3b5d69'),
      [SURFACE.TOWN_COBBLESTONE]: new THREE.Color('#8e97a2'),
      [SURFACE.LUMBER_EARTH]: new THREE.Color('#7c5a3a'),
      [SURFACE.RUINS_STONE]: new THREE.Color('#7b848c'),
      [SURFACE.CAVE_ROCK]: new THREE.Color('#47505c'),
      [SURFACE.SCORCHED_EARTH]: new THREE.Color('#382c25')
    };

    for (let i = 0; i < posAttr.count; i++) {
      const wx = posAttr.getX(i);
      const wz = posAttr.getZ(i);
      const vx = Math.max(0, Math.min(GRID_SIZE, Math.round((wx + WORLD_HALF) / CELL_SIZE)));
      const vz = Math.max(0, Math.min(GRID_SIZE, Math.round((wz + WORLD_HALF) / CELL_SIZE)));

      const h = map.heightGrid[vz * V + vx];
      const surf = map.surfaceGrid[vz * V + vx];
      posAttr.setY(i, h);

      tmpCol.copy(palette[surf] || palette[SURFACE.GRASS_VALLEY]);
      const wp = getWaterProfileAt(wx, wz);
      // Mezcla orgánica gradual en la ribera: grava/piedra húmeda junto al agua -> arena cálida -> pasto verde del valle
      if (wp.active && wp.distFromEdge >= -1.2 && wp.distFromEdge < 9.5 && surf !== SURFACE.TOWN_COBBLESTONE) {
        const wetFactor = Math.max(0, Math.min(1, 1 - (wp.distFromEdge + 1.2) / 5.2));
        if (wetFactor > 0) {
          tmpCol.lerp(rockCol, wetFactor * 0.42);
        }
        if (wp.distFromEdge > 3.2 && surf === SURFACE.GRASS_VALLEY) {
          const sandBlend = Math.max(0, 1 - (wp.distFromEdge - 3.2) / 5.5);
          tmpCol.lerp(palette[SURFACE.RIVER_SAND], sandBlend * 0.45);
        }
      }
      const slope = map.getSlopeAt(wx, wz);
      if (slope > 0.48 && h > WATER_LEVEL + 1.0 && surf !== SURFACE.CAVE_ROCK && surf !== SURFACE.SCORCHED_EARTH) {
        tmpCol.lerp(rockCol, Math.min(1, (slope - 0.48) * 1.6));
      }
      const variation = Math.sin(wx * 0.09 + wz * 0.07) * 0.03 + Math.min(0.10, h * 0.0022);
      colors[i * 3] = Math.max(0, Math.min(1, tmpCol.r + variation * 0.6));
      colors[i * 3 + 1] = Math.max(0, Math.min(1, tmpCol.g + variation));
      colors[i * 3 + 2] = Math.max(0, Math.min(1, tmpCol.b + variation * 0.5));
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const terrainMat = new THREE.MeshToonMaterial({
      vertexColors: true,
      gradientMap: getSharedToonGradient()
    });
    // Terreno en bloques de 80 m que comparten los mismos atributos (posición, normal, color):
    // misma malla y mismas normales que antes, pero la cámara y la sombra solar descartan los
    // bloques fuera de su volumen en vez de procesar los ~205k triángulos completos.
    const fullIndex = geo.index.array;
    const posArr = geo.attributes.position.array;
    for (let cz0 = 0; cz0 < GRID_SIZE; cz0 += TERRAIN_CHUNK_CELLS) {
      for (let cx0 = 0; cx0 < GRID_SIZE; cx0 += TERRAIN_CHUNK_CELLS) {
        const czEnd = Math.min(GRID_SIZE, cz0 + TERRAIN_CHUNK_CELLS);
        const cxEnd = Math.min(GRID_SIZE, cx0 + TERRAIN_CHUNK_CELLS);
        const chunkIndex = new Uint32Array((czEnd - cz0) * (cxEnd - cx0) * 6);
        const box = new THREE.Box3();
        let k = 0;
        for (let iy = cz0; iy < czEnd; iy++) {
          for (let ix = cx0; ix < cxEnd; ix++) {
            const base = (iy * GRID_SIZE + ix) * 6; // PlaneGeometry: 6 índices por celda
            for (let n = 0; n < 6; n++) {
              const vi = fullIndex[base + n];
              chunkIndex[k++] = vi;
              _tmpVecA.set(posArr[vi * 3], posArr[vi * 3 + 1], posArr[vi * 3 + 2]);
              box.expandByPoint(_tmpVecA);
            }
          }
        }
        const chunkGeo = new THREE.BufferGeometry();
        for (const name of Object.keys(geo.attributes)) chunkGeo.setAttribute(name, geo.attributes[name]);
        chunkGeo.setIndex(new THREE.BufferAttribute(chunkIndex, 1));
        chunkGeo.boundingBox = box;
        chunkGeo.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
        const chunkMesh = new THREE.Mesh(chunkGeo, terrainMat);
        chunkMesh.castShadow = true;
        chunkMesh.receiveShadow = true;
        this.terrainGroup.add(chunkMesh);
      }
    }

    // Malla continua de superficie de agua para el Río Quindío elevado y su Desembocadura / Laguna Andina nadable
    const zSegs = 230;
    const xSegs = 14;
    const zMin = -WORLD_HALF;
    const zMax = Math.min(WORLD_HALF, LAGOON_CONFIG.endZ + 5.5);
    const riverPositions = [];
    const riverUVs = [];
    const riverIndices = [];
    const colsPerRow = xSegs + 1;

    for (let s = 0; s <= zSegs; s++) {
      const t = s / zSegs;
      const wz = zMin + t * (zMax - zMin);
      const ch = getWaterChannelAt(wz);
      const asymOffset = ch.lagoonFactor * (4.2 * Math.sin((wz - 210) * 0.045));
      const cx = ch.centerX + asymOffset;
      const halfWidth = ch.active ? ch.halfWidth + 1.45 : 0.0;

      for (let uIdx = 0; uIdx <= xSegs; uIdx++) {
        const u = uIdx / xSegs;
        const wx = cx + (u * 2 - 1) * halfWidth;
        riverPositions.push(wx, WATER_LEVEL + 0.02, wz);
        riverUVs.push(u * (1 + ch.lagoonFactor * 2.4), t * 34);
      }

      if (s < zSegs) {
        const row0 = s * colsPerRow;
        const row1 = (s + 1) * colsPerRow;
        for (let uIdx = 0; uIdx < xSegs; uIdx++) {
          const a = row0 + uIdx;
          const b = a + 1;
          const c = row1 + uIdx;
          const d = c + 1;
          riverIndices.push(a, c, b, b, c, d);
        }
      }
    }

    const riverGeo = new THREE.BufferGeometry();
    riverGeo.setAttribute('position', new THREE.Float32BufferAttribute(riverPositions, 3));
    riverGeo.setAttribute('uv', new THREE.Float32BufferAttribute(riverUVs, 2));
    riverGeo.setIndex(riverIndices);
    riverGeo.computeVertexNormals();

    const riverMat = new THREE.MeshStandardMaterial({
      map: this.waterTexture,
      color: '#18b8d4',
      transparent: true,
      opacity: 0.84,
      roughness: 0.12,
      metalness: 0.35,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const riverMesh = new THREE.Mesh(riverGeo, riverMat);
    riverMesh.receiveShadow = true;
    this.terrainGroup.add(riverMesh);
  }
};
