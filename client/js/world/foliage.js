// client/js/world/foliage.js
// Vegetación instanciada (palmas de cera, cafetos, rocas, cercas, cantos rodados) por bloques de 160 m con
// límites ampliados por el balanceo del viento. El pasto denso cercano está en ./groundCover.js.

import * as THREE from 'three';
import {
  createExternalWaxPalmPrototypeGeo,
  createExternalCoffeeBushPrototypeGeo,
  createExternalRockPrototypeGeo,
  createRiverCobblePrototypeGeo,
  createExternalFencePrototypeGeo
} from '/Modelos%203D/cocoraModels.js';
import { WORLD_HALF } from '/shared/mapData.js';
import {
  _tmpVecA,
  _tmpScale,
  _tmpEuler,
  _tmpQuatA,
  _tmpMat4,
  _tmpInstColor
} from './common.js';
import { perturbGeometry, mergeOrganicParts } from './materials.js';

const FOLIAGE_TILE_SIZE = 160; // metros por bloque de instancias

const FOLIAGE_BOUNDS_PADDING = 3.0; // margen por el balanceo del viento en GPU

// Prototipos unificados para todos los lotes de InstancedMesh (modelos externos integrados + vegetación + mobiliario + nubes)
export function createAllInstancedPrototypes() {
  // 1. Palma de Cera integrada desde "Modelos 3D/" (WaxPalm: tronco anillado + 18 frondas curvas con foliolos + frutos)
  const waxPalmGeo = createExternalWaxPalmPrototypeGeo();

  // 2. Árbol Frondoso de Bosque de Niebla
  const treeParts = [
    { geo: new THREE.CylinderGeometry(0.26, 0.42, 4.2, 8), x: 0, y: 2.1, z: 0, color: '#583b26' },
    { geo: new THREE.CylinderGeometry(0.14, 0.22, 2.6, 7), x: 0.68, y: 4.4, z: 0.28, rz: -0.52, color: '#60412b' },
    { geo: new THREE.CylinderGeometry(0.14, 0.22, 2.5, 7), x: -0.65, y: 4.2, z: -0.32, rz: 0.48, color: '#60412b' },
    { geo: perturbGeometry(new THREE.IcosahedronGeometry(2.35, 1), 0.14, 11), x: 0, y: 6.4, z: 0, sy: 0.82, color: '#1b7a43' },
    { geo: perturbGeometry(new THREE.IcosahedronGeometry(1.85, 1), 0.15, 23), x: 1.55, y: 5.7, z: 0.65, sy: 0.80, color: '#3f7d20' },
    { geo: perturbGeometry(new THREE.IcosahedronGeometry(1.80, 1), 0.15, 37), x: -1.45, y: 5.5, z: -0.60, sy: 0.80, color: '#2d6a4f' },
    { geo: perturbGeometry(new THREE.IcosahedronGeometry(1.65, 1), 0.14, 51), x: 0.15, y: 8.1, z: -0.20, sy: 0.85, color: '#2b9348' },
    { geo: perturbGeometry(new THREE.IcosahedronGeometry(1.45, 1), 0.14, 67), x: -0.45, y: 6.8, z: 1.35, sy: 0.78, color: '#4d7c0f' }
  ];

  // 3. Arbusto Alto de Sigilo
  const stealthBushParts = [
    { geo: perturbGeometry(new THREE.IcosahedronGeometry(0.88, 1), 0.16, 5), x: 0, y: 0.78, z: 0, sy: 0.92, color: '#1e6b38' },
    { geo: perturbGeometry(new THREE.IcosahedronGeometry(0.68, 1), 0.16, 17), x: 0.48, y: 0.62, z: 0.32, color: '#2b8a3e' },
    { geo: perturbGeometry(new THREE.IcosahedronGeometry(0.66, 1), 0.16, 29), x: -0.46, y: 0.60, z: -0.28, color: '#3b7a28' },
    { geo: perturbGeometry(new THREE.IcosahedronGeometry(0.58, 1), 0.15, 43), x: 0.08, y: 1.22, z: -0.12, color: '#40916c' }
  ];

  // 4. Cafeto detallado integrado desde "Modelos 3D/" (CoffeeBush: ramas + hojas planas + cerezas rojas y verdes)
  const coffeeBushGeo = createExternalCoffeeBushPrototypeGeo();

  // 5. Helecho Gigante
  const fernParts = [];
  for (let i = 0; i < 9; i++) {
    const ang = (i / 9) * Math.PI * 2;
    fernParts.push({
      geo: new THREE.ConeGeometry(0.18, 1.15, 4),
      x: Math.sin(ang) * 0.48,
      y: 0.44 + (i % 2) * 0.06,
      z: Math.cos(ang) * 0.48,
      rx: Math.PI / 2 - 0.42,
      ry: ang,
      sx: 1.1,
      sy: 1.0,
      sz: 0.22,
      color: i % 2 === 0 ? '#2b9348' : '#65a30d'
    });
  }

  // 6. Hierba Alta
  const grassParts = [];
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * Math.PI * 2;
    const r = (i % 3) * 0.14;
    grassParts.push({
      geo: new THREE.ConeGeometry(0.055, 0.82, 4),
      x: Math.sin(ang) * r,
      y: 0.40,
      z: Math.cos(ang) * r,
      rx: (i % 2 === 0 ? 1 : -1) * 0.12,
      rz: (i % 3 - 1) * 0.1,
      color: i % 2 === 0 ? '#40916c' : '#52b788'
    });
  }
  grassParts.push({ geo: new THREE.DodecahedronGeometry(0.09, 0), x: 0.06, y: 0.82, z: 0.04, color: '#f43f5e' });
  grassParts.push({ geo: new THREE.DodecahedronGeometry(0.08, 0), x: -0.12, y: 0.74, z: -0.08, color: '#facc15' });

  // 7. Peñascos Rocosos con musgo superior integrados desde "Modelos 3D/" (Rock / rockGeometry)
  const rockGeo = createExternalRockPrototypeGeo();

  // 7B. Anillo de Espuma Blanca alrededor de rocas del cauce del río
  const riverFoamParts = [];
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    riverFoamParts.push({
      geo: new THREE.CylinderGeometry(0.28, 0.32, 0.05, 7),
      x: Math.cos(ang) * 0.62,
      y: 0.02,
      z: Math.sin(ang) * 0.72 + (i % 2 === 0 ? 0.16 : -0.08),
      sx: 1.25,
      sy: 1.0,
      sz: 1.55,
      color: i % 2 === 0 ? '#f8fafc' : '#e0f2fe'
    });
  }

  // 8. Muro Bajo de Piedra / Adobe
  const stoneWallParts = [
    { geo: new THREE.BoxGeometry(3.4, 0.96, 0.48), x: 0, y: 0.44, z: 0, color: '#8d867e' },
    { geo: new THREE.BoxGeometry(3.52, 0.16, 0.56), x: 0, y: 1.00, z: 0, color: '#6b7280' },
    { geo: perturbGeometry(new THREE.DodecahedronGeometry(0.34, 0), 0.15, 12), x: -1.4, y: 1.08, z: 0, sy: 0.45, color: '#78716c' },
    { geo: perturbGeometry(new THREE.DodecahedronGeometry(0.32, 0), 0.15, 29), x: 1.25, y: 1.06, z: 0, sy: 0.45, color: '#78716c' }
  ];

  // 9. Pila de Sacos de Café
  const coffeeSackParts = [
    { geo: perturbGeometry(new THREE.IcosahedronGeometry(0.46, 1), 0.08, 7), x: -0.34, y: 0.30, z: 0.18, sx: 1.15, sy: 0.68, sz: 0.85, color: '#c89f6c' },
    { geo: perturbGeometry(new THREE.IcosahedronGeometry(0.46, 1), 0.08, 19), x: 0.34, y: 0.30, z: 0.16, sx: 1.15, sy: 0.68, sz: 0.85, color: '#b98f5c' },
    { geo: perturbGeometry(new THREE.IcosahedronGeometry(0.45, 1), 0.08, 31), x: 0.0, y: 0.30, z: -0.28, sx: 1.20, sy: 0.68, sz: 0.85, color: '#cfa674' },
    { geo: perturbGeometry(new THREE.IcosahedronGeometry(0.44, 1), 0.08, 43), x: -0.04, y: 0.74, z: 0.02, sx: 1.12, sy: 0.66, sz: 0.84, color: '#d4ae7e' }
  ];

  // 10. Barriles de Madera con Aros Metálicos
  const barrelParts = [
    { geo: new THREE.CylinderGeometry(0.39, 0.39, 1.08, 10), x: 0, y: 0.54, z: 0, color: '#85532c' },
    { geo: new THREE.CylinderGeometry(0.405, 0.405, 0.07, 10), x: 0, y: 0.24, z: 0, color: '#334155' },
    { geo: new THREE.CylinderGeometry(0.405, 0.405, 0.07, 10), x: 0, y: 0.84, z: 0, color: '#334155' }
  ];

  // 11. Carreta Tradicional Cafetera
  const cartParts = [
    { geo: new THREE.BoxGeometry(2.2, 0.14, 1.35), x: 0, y: 0.62, z: 0, color: '#8f5b34' },
    { geo: new THREE.BoxGeometry(2.2, 0.48, 0.10), x: 0, y: 0.92, z: 0.64, color: '#a46b3f' },
    { geo: new THREE.BoxGeometry(2.2, 0.48, 0.10), x: 0, y: 0.92, z: -0.64, color: '#a46b3f' },
    { geo: new THREE.BoxGeometry(0.10, 0.48, 1.35), x: -1.06, y: 0.92, z: 0, color: '#784b26' },
    { geo: new THREE.CylinderGeometry(0.05, 0.05, 0.95, 6), x: 1.45, y: 0.56, z: 0.38, rz: Math.PI / 2 - 0.18, color: '#5c3a21' },
    { geo: new THREE.CylinderGeometry(0.05, 0.05, 0.95, 6), x: 1.45, y: 0.56, z: -0.38, rz: Math.PI / 2 - 0.18, color: '#5c3a21' },
    { geo: new THREE.CylinderGeometry(0.52, 0.52, 0.12, 12), x: -0.1, y: 0.52, z: 0.74, rx: Math.PI / 2, color: '#47301e' },
    { geo: new THREE.CylinderGeometry(0.52, 0.52, 0.12, 12), x: -0.1, y: 0.52, z: -0.74, rx: Math.PI / 2, color: '#47301e' }
  ];

  // 12. Cerca Rural con Postes de Madera y Pilares de Piedra Apilada integrada desde "Modelos 3D/" (Fence)
  const fenceGeo = createExternalFencePrototypeGeo();

  // 13. Tronco Partido / Caído con veta interior detallada y musgo
  const fallenLogParts = [
    { geo: new THREE.CylinderGeometry(0.28, 0.31, 3.9, 9), x: 0, y: 0.28, z: 0, rz: Math.PI / 2, color: '#5c3a1e' },
    { geo: new THREE.CylinderGeometry(0.24, 0.26, 3.94, 9), x: 0, y: 0.28, z: 0, rz: Math.PI / 2, color: '#deb887' },
    { geo: new THREE.BoxGeometry(1.6, 0.14, 0.34), x: -0.8, y: 0.44, z: 0.05, ry: 0.12, color: '#e7cba2' },
    { geo: perturbGeometry(new THREE.IcosahedronGeometry(0.22, 0), 0.15, 5), x: -0.5, y: 0.52, z: 0.08, sx: 1.8, sy: 0.5, color: '#3f7d20' },
    { geo: perturbGeometry(new THREE.IcosahedronGeometry(0.20, 0), 0.15, 17), x: 0.8, y: 0.50, z: -0.06, sx: 1.6, sy: 0.5, color: '#2b8a3e' }
  ];

  // 14. Mobiliario Interior Paisa en InstancedMesh (Camas, Mesas, Sillas, Alacenas y Cuadros)
  const bedParts = [
    { geo: new THREE.BoxGeometry(1.30, 0.26, 1.98), x: 0, y: 0.26, z: 0, color: '#6b4226' },
    { geo: new THREE.BoxGeometry(1.32, 0.88, 0.10), x: 0, y: 0.48, z: -0.96, color: '#54331d' },
    { geo: new THREE.BoxGeometry(1.22, 0.20, 1.84), x: 0, y: 0.46, z: 0.02, color: '#f8fafc' },
    { geo: new THREE.BoxGeometry(1.24, 0.14, 1.22), x: 0, y: 0.52, z: 0.32, color: '#dc2626' }, // Cobija roja paisa
    { geo: new THREE.BoxGeometry(0.84, 0.12, 0.38), x: 0, y: 0.60, z: -0.64, color: '#fef3c7' }
  ];

  const tableParts = [
    { geo: new THREE.BoxGeometry(1.44, 0.09, 0.92), x: 0, y: 0.76, z: 0, color: '#8f5b34' },
    { geo: new THREE.CylinderGeometry(0.05, 0.05, 0.74, 6), x: -0.60, y: 0.37, z: -0.36, color: '#54351e' },
    { geo: new THREE.CylinderGeometry(0.05, 0.05, 0.74, 6), x: 0.60, y: 0.37, z: -0.36, color: '#54351e' },
    { geo: new THREE.CylinderGeometry(0.05, 0.05, 0.74, 6), x: -0.60, y: 0.37, z: 0.36, color: '#54351e' },
    { geo: new THREE.CylinderGeometry(0.05, 0.05, 0.74, 6), x: 0.60, y: 0.37, z: 0.36, color: '#54351e' }
  ];

  const chairParts = [
    { geo: new THREE.BoxGeometry(0.46, 0.06, 0.46), x: 0, y: 0.45, z: 0, color: '#9c6639' },
    { geo: new THREE.BoxGeometry(0.46, 0.48, 0.06), x: 0, y: 0.71, z: -0.20, color: '#784b26' },
    { geo: new THREE.BoxGeometry(0.05, 0.44, 0.05), x: -0.19, y: 0.22, z: -0.19, color: '#54351e' },
    { geo: new THREE.BoxGeometry(0.05, 0.44, 0.05), x: 0.19, y: 0.22, z: -0.19, color: '#54351e' },
    { geo: new THREE.BoxGeometry(0.05, 0.44, 0.05), x: -0.19, y: 0.22, z: 0.19, color: '#54351e' },
    { geo: new THREE.BoxGeometry(0.05, 0.44, 0.05), x: 0.19, y: 0.22, z: 0.19, color: '#54351e' }
  ];

  const cabinetParts = [
    { geo: new THREE.BoxGeometry(1.42, 1.82, 0.62), x: 0, y: 0.91, z: 0, color: '#784b26' },
    { geo: new THREE.BoxGeometry(1.50, 0.10, 0.68), x: 0, y: 1.84, z: 0, color: '#54331d' },
    { geo: new THREE.BoxGeometry(0.62, 1.54, 0.05), x: -0.34, y: 0.92, z: 0.32, color: '#9c6639' },
    { geo: new THREE.BoxGeometry(0.62, 1.54, 0.05), x: 0.34, y: 0.92, z: 0.32, color: '#9c6639' }
  ];

  const paintingParts = [
    { geo: new THREE.BoxGeometry(1.12, 0.78, 0.06), x: 0, y: 0, z: 0, color: '#452815' },
    { geo: new THREE.BoxGeometry(0.98, 0.64, 0.07), x: 0, y: 0, z: 0.01, color: '#38bdf8' },
    { geo: new THREE.BoxGeometry(0.98, 0.26, 0.075), x: 0, y: -0.19, z: 0.012, color: '#22c55e' },
    { geo: new THREE.ConeGeometry(0.22, 0.32, 4), x: -0.18, y: 0.02, z: 0.02, sx: 1.2, sz: 0.2, color: '#15803d' },
    { geo: new THREE.SphereGeometry(0.09, 8, 8), x: 0.26, y: 0.16, z: 0.02, sz: 0.2, color: '#facc15' }
  ];

  const lampParts = [
    { geo: new THREE.CylinderGeometry(0.03, 0.03, 0.26, 6), x: 0, y: 0.10, z: 0, color: '#27272a' },
    { geo: new THREE.ConeGeometry(0.26, 0.16, 10), x: 0, y: -0.02, z: 0, color: '#b45309' },
    { geo: new THREE.SphereGeometry(0.11, 8, 8), x: 0, y: -0.09, z: 0, color: '#fef08a' }
  ];

  // 15. Nube Volumétrica Unitaria para InstancedMesh global de cielo
  const cloudPuffGeo = perturbGeometry(new THREE.IcosahedronGeometry(1.0, 1), 0.15, 47);

  return {
    waxPalms: waxPalmGeo,
    cloudTrees: mergeOrganicParts(treeParts),
    stealthBushes: mergeOrganicParts(stealthBushParts),
    coffeeBushes: coffeeBushGeo,
    ferns: mergeOrganicParts(fernParts),
    tallGrass: mergeOrganicParts(grassParts),
    boulders: rockGeo,
    riverCobbles: createRiverCobblePrototypeGeo(),
    riverFoam: mergeOrganicParts(riverFoamParts),
    stoneWalls: mergeOrganicParts(stoneWallParts),
    coffeeSacks: mergeOrganicParts(coffeeSackParts),
    barrels: mergeOrganicParts(barrelParts),
    woodenCarts: mergeOrganicParts(cartParts),
    fences: fenceGeo,
    fallenLogs: mergeOrganicParts(fallenLogParts),
    interiorBed: mergeOrganicParts(bedParts),
    interiorTable: mergeOrganicParts(tableParts),
    interiorChair: mergeOrganicParts(chairParts),
    interiorCabinet: mergeOrganicParts(cabinetParts),
    interiorPainting: mergeOrganicParts(paintingParts),
    interiorLamp: mergeOrganicParts(lampParts),
    cloudPuff: cloudPuffGeo
  };
}

export const foliageMethods = {
  // Agrupación 100% en THREE.InstancedMesh para vegetación, rocas, espuma, cercas, coberturas y mobiliario interior
  buildInstancedEnvironment(map) {
    const addBatch = (list, geo, mat, castShadow = false, receiveShadow = false, yOffset = -0.03) => {
      if (!list || list.length === 0) return;

      // Repartir las instancias en bloques de 160 m, cada uno con su volumen envolvente,
      // para que la cámara y la sombra solar descarten los bloques que no ven.
      const tiles = new Map();
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const key = Math.floor((p.x + WORLD_HALF) / FOLIAGE_TILE_SIZE) * 1000 +
          Math.floor((p.z + WORLD_HALF) / FOLIAGE_TILE_SIZE);
        let tile = tiles.get(key);
        if (!tile) {
          tile = [];
          tiles.set(key, tile);
        }
        tile.push(p);
      }

      for (const tile of tiles.values()) {
        const inst = new THREE.InstancedMesh(geo, mat, tile.length);
        inst.castShadow = castShadow;
        inst.receiveShadow = receiveShadow;

        let usedInstColor = false;
        for (let i = 0; i < tile.length; i++) {
          const p = tile[i];
          _tmpVecA.set(p.x, p.y + yOffset, p.z);
          _tmpEuler.set(p.rotX || 0, p.rotY || 0, p.rotZ || 0);
          _tmpQuatA.setFromEuler(_tmpEuler);
          const s = p.scale || 1;
          _tmpScale.set(p.sx ?? s, p.sy ?? s, p.sz ?? s);
          _tmpMat4.compose(_tmpVecA, _tmpQuatA, _tmpScale);
          inst.setMatrixAt(i, _tmpMat4);
          if (p.colorHex) {
            inst.setColorAt(i, _tmpInstColor.set(p.colorHex));
            usedInstColor = true;
          }
        }
        inst.instanceMatrix.needsUpdate = true;
        if (usedInstColor && inst.instanceColor) inst.instanceColor.needsUpdate = true;
        inst.computeBoundingSphere();
        inst.boundingSphere.radius += FOLIAGE_BOUNDS_PADDING;
        this.foliageGroup.add(inst);
      }
    };

    const allCoffeeSacks = [...(map.props.coffeeSacks || [])];
    for (const b of map.buildings || []) {
      if (b.furniture) {
        allCoffeeSacks.push({ x: b.furniture.crateX, y: b.floorY, z: b.furniture.crateZ, scale: 0.78, rotY: 0.4 });
      }
    }

    const allLogs = [...(map.props.fallenLogs || [])];
    for (const lp of map.logPiles || []) {
      const cosR = Math.cos(lp.rotY || 0);
      const sinR = Math.sin(lp.rotY || 0);
      const rows = [[-0.85, -0.28, 0.28, 0.85], [-0.56, 0, 0.56], [-0.28, 0.28]];
      rows.forEach((zList, rowIdx) => {
        for (const zOff of zList) {
          allLogs.push({
            x: lp.x - sinR * zOff,
            y: lp.y + rowIdx * 0.48,
            z: lp.z + cosR * zOff,
            scale: 1.08,
            rotY: lp.rotY || 0
          });
        }
      });
    }

    // Sombras reales activadas en palmas de cera, árboles, rocas, cercas y coberturas
    addBatch(map.props.waxPalms, this.prototypes.waxPalms, this.windMatTall, true, true);
    addBatch(map.props.cloudTrees, this.prototypes.cloudTrees, this.windMatTall, true, true);
    addBatch(map.props.stealthBushes, this.prototypes.stealthBushes, this.windMatLow, false, true);
    addBatch(map.props.coffeeBushes, this.prototypes.coffeeBushes, this.windMatLow, false, true);
    addBatch(map.props.ferns, this.prototypes.ferns, this.windMatLow, false, true);
    addBatch(map.props.tallGrass, this.prototypes.tallGrass, this.windMatLow, false, false);
    // Rocas angulosas de montaña y cantos rodados de río/laguna con textura de erosión/musgo y hundimiento -0.2m en Y
    addBatch(map.props.boulders, this.prototypes.boulders, this.rockInstancedMat, true, true, -0.2);
    addBatch(map.props.riverCobbles, this.prototypes.riverCobbles, this.rockInstancedMat, true, true, -0.2);
    addBatch(map.props.riverFoam, this.prototypes.riverFoam, this.foamInstancedMat, false, false, 0.0);

    // Obstáculos tácticos y cercas con postes de piedra
    addBatch(map.props.stoneWalls, this.prototypes.stoneWalls, this.sharedInstancedMat, true, true);
    addBatch(allCoffeeSacks, this.prototypes.coffeeSacks, this.sharedInstancedMat, true, true);
    addBatch(map.props.barrels, this.prototypes.barrels, this.sharedInstancedMat, true, true);
    addBatch(map.props.woodenCarts, this.prototypes.woodenCarts, this.sharedInstancedMat, true, true);
    addBatch(map.props.fences, this.prototypes.fences, this.sharedInstancedMat, true, true);
    addBatch(allLogs, this.prototypes.fallenLogs, this.sharedInstancedMat, true, true);

    // Interiores variados de casas Paisas en InstancedMesh (cero sobrecarga de draw calls)
    if (map.interiorItems) {
      addBatch(map.interiorItems.beds, this.prototypes.interiorBed, this.sharedInstancedMat, false, true, 0.0);
      addBatch(map.interiorItems.tables, this.prototypes.interiorTable, this.sharedInstancedMat, false, true, 0.0);
      addBatch(map.interiorItems.chairs, this.prototypes.interiorChair, this.sharedInstancedMat, false, true, 0.0);
      addBatch(map.interiorItems.cabinets, this.prototypes.interiorCabinet, this.sharedInstancedMat, false, true, 0.0);
      addBatch(map.interiorItems.paintings, this.prototypes.interiorPainting, this.sharedInstancedMat, false, false, 0.0);
      addBatch(map.interiorItems.lamps, this.prototypes.interiorLamp, this.sharedInstancedMat, false, false, 0.0);
    }
  }
};
