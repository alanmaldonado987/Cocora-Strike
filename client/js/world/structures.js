// client/js/world/structures.js
// Estructuras y POIs: casas coloniales, puentes, monumento COCORA, helicóptero siniestrado, fusión estática de
// geometrías por material, puertas interactivas/destructibles y ventanas rompibles.

import * as THREE from 'three';
import { buildAH64ApacheWreckSite } from '/Modelos%203D/ah64Wreck.js';
import { isSharedArmasV1Geometry } from '/Modelos%203D/armasV1.js';
import { isSharedAircraftGeometry } from '/Modelos%203D/avionesShared.js';
import {
  MODEL_TEX,
  getColonialHouseMaterials,
  buildColonialRoofTilesGeo,
  buildColonialGablesGeo,
  buildColonialRailingGeo,
  buildColonialWindowGroup,
  buildCleanStoneBridge,
  buildExternalCocoraSignGroup
} from '/Modelos%203D/cocoraModels.js';
import { createCelToonMaterial, perturbGeometry } from './materials.js';

function zocaloOrBeamMat(beamMat) {
  return beamMat;
}

export const structureMethods = {
  buildCocoraMonument(mon, stoneMat) {
    const signGroup = buildExternalCocoraSignGroup(mon, stoneMat);
    if (signGroup) this.structuresGroup.add(signGroup);
  },

  buildCrashedHelicopter(wreck) {
    this.heliAnimState = buildAH64ApacheWreckSite(
      wreck,
      this.structuresGroup,
      this.addLightAnchor.bind(this)
    );
  },

  buildRealisticStructuresAndPOIs(map) {
    const stoneMat = createCelToonMaterial({ color: '#788290' });
    const darkStoneMat = createCelToonMaterial({ color: '#535d6b' });
    const ruinStoneMat = createCelToonMaterial({ color: '#64707d' });
    const doorWoodMat = createCelToonMaterial({ color: '#7c4722' });
    const beamMat = createCelToonMaterial({ color: '#4d301b' });
    const clayRoofMat = createCelToonMaterial({ color: '#be4b26' });
    const goldMat = createCelToonMaterial({ color: '#facc15' }, 0.35);
    const CM = getColonialHouseMaterials();
    for (const sharedMat of Object.values(CM)) {
      if (sharedMat && sharedMat.isMaterial) this.sharedMaterials.add(sharedMat);
    }
    const crystalMat = new THREE.MeshStandardMaterial({
      color: '#fbbf24',
      emissive: '#f59e0b',
      emissiveIntensity: 0.9,
      roughness: 0.2
    });

    // Monumento "COCORA" con Cóndor en la colina y Helicóptero UH-1 Militar Estrellado ("Modelos 3D/")
    this.buildCocoraMonument(map.cocoraMonument, stoneMat);
    this.buildCrashedHelicopter(map.helicopterWreck);

    // Fuente circular en Plaza de Salento
    const plazaY = map.getTerrainHeightAt ? map.getTerrainHeightAt(56, 4) : map.getGroundHeightAt(56, 4);
    const fountain = new THREE.Group();
    fountain.position.set(56, plazaY, 4);
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.7, 0.72, 16), stoneMat);
    basin.position.y = 0.36;
    basin.castShadow = true;
    basin.receiveShadow = true;
    const fWater = new THREE.Mesh(
      new THREE.CylinderGeometry(2.15, 2.15, 0.08, 16),
      new THREE.MeshStandardMaterial({ color: '#38bdf8', roughness: 0.12, metalness: 0.35 })
    );
    fWater.position.y = 0.70;
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.55, 1.8, 12), stoneMat);
    pedestal.position.y = 0.90;
    pedestal.castShadow = true;
    fountain.add(basin, fWater, pedestal);
    this.structuresGroup.add(fountain);

    // 4 Puentes de Piedra Reparados ("Modelos 3D/": sin wireframe/contornos negros sucios ni bloques desfasados)
    for (const br of map.bridges) {
      const cleanBridge = buildCleanStoneBridge(br, map);
      cleanBridge.traverse((o) => {
        if (o.isMesh && o.material) this.sharedMaterials.add(o.material);
      });
      this.structuresGroup.add(cleanBridge);
    }

    // Cuevas Rocosas Explorables
    const caveRockGeo = perturbGeometry(new THREE.DodecahedronGeometry(1.0, 1), 0.22, 141);
    for (const cv of map.caves || []) {
      const g = new THREE.Group();
      g.position.set(cv.x, cv.floorY, cv.z);
      g.rotation.y = cv.yaw;

      const halfW = cv.width * 0.5;
      const halfL = cv.length * 0.5;

      for (let lz = -halfL; lz <= halfL; lz += 2.3) {
        for (const side of [-1, 1]) {
          const wallRock = new THREE.Mesh(caveRockGeo.clone(), darkStoneMat);
          wallRock.scale.set(1.9, 3.6, 2.1);
          wallRock.position.set(side * (halfW + 1.15), 2.3, lz);
          wallRock.rotation.y = lz * 0.5 + side;
          wallRock.castShadow = true;
          wallRock.receiveShadow = true;
          g.add(wallRock);
        }
      }
      for (let lx = -halfW - 0.8; lx <= halfW + 0.8; lx += 2.2) {
        const backRock = new THREE.Mesh(caveRockGeo.clone(), darkStoneMat);
        backRock.scale.set(2.2, 4.0, 2.2);
        backRock.position.set(lx, 2.6, -halfL - 1.1);
        backRock.castShadow = true;
        g.add(backRock);
      }

      const vaultThick = cv.roofTopY - (cv.floorY + cv.clearanceH);
      const roofBlock = new THREE.Mesh(
        new THREE.BoxGeometry(cv.width + 3.4, vaultThick, cv.length + 2.4),
        darkStoneMat
      );
      roofBlock.position.set(0, cv.clearanceH + vaultThick * 0.5, -0.3);
      roofBlock.castShadow = true;
      roofBlock.receiveShadow = true;
      g.add(roofBlock);

      for (const side of [-1, 1]) {
        const archPillar = new THREE.Mesh(caveRockGeo.clone(), stoneMat);
        archPillar.scale.set(1.6, 3.2, 1.7);
        archPillar.position.set(side * (halfW + 0.6), 2.2, halfL + 0.6);
        archPillar.castShadow = true;
        g.add(archPillar);
      }
      const archCrown = new THREE.Mesh(caveRockGeo.clone(), stoneMat);
      archCrown.scale.set(halfW + 2.4, 2.1, 2.4);
      archCrown.position.set(0, cv.clearanceH + 1.5, halfL + 0.4);
      g.add(archCrown);

      for (const [sx, sz] of [[-1.8, -2.5], [2.1, 0.5], [-0.5, -5.2], [1.6, 3.2]]) {
        const stal = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.95, 6), stoneMat);
        stal.rotation.x = Math.PI;
        stal.position.set(sx, cv.clearanceH - 0.42, sz);
        g.add(stal);
      }

      for (const [cxOff, czOff] of [[-halfW + 0.45, -2.2], [halfW - 0.45, 1.8]]) {
        const crys = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), crystalMat);
        crys.scale.set(0.7, 1.6, 0.7);
        crys.position.set(cxOff, 0.55, czOff);
        g.add(crys);
      }
      this.addLightAnchor(g, '#fbbf24', 1.45, 18, 1.6, 0, 2.9, -1.2);

      this.structuresGroup.add(g);
    }

    // Casas Destruidas / En Ruinas
    for (const rh of map.ruinedHouses || []) {
      const g = new THREE.Group();
      const foundH = Math.max(0.6, rh.floorY - rh.minGroundY);
      const found = new THREE.Mesh(new THREE.BoxGeometry(rh.w + 0.6, foundH, rh.d + 0.6), ruinStoneMat);
      found.position.set(rh.x, rh.floorY - foundH * 0.5, rh.z);
      found.castShadow = true;
      found.receiveShadow = true;
      g.add(found);

      const weatheredWall = createCelToonMaterial({ color: '#d6d3d1' });
      const addBrokenWall = (wx, wz, sx, sy, sz) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), weatheredWall);
        m.position.set(wx, rh.floorY + sy * 0.5, wz);
        m.castShadow = true;
        m.receiveShadow = true;
        g.add(m);
      };

      addBrokenWall(rh.x - rh.w * 0.25 - 0.5, rh.z + rh.d * 0.5, rh.w * 0.5 - 1.1, 1.85, 0.30);
      addBrokenWall(rh.x + rh.w * 0.25 + 0.6, rh.z + rh.d * 0.5, rh.w * 0.5 - 1.2, 1.15, 0.30);
      addBrokenWall(rh.x - rh.w * 0.18, rh.z - rh.d * 0.5, rh.w * 0.62, 1.35, 0.30);
      addBrokenWall(rh.x - rh.w * 0.5, rh.z - 0.6, 0.30, 2.15, rh.d * 0.62);
      addBrokenWall(rh.x + rh.w * 0.5, rh.z + 0.8, 0.30, 1.05, rh.d * 0.58);

      const collapsedRoof = new THREE.Mesh(new THREE.BoxGeometry(rh.w * 0.44, 0.16, rh.d * 0.48), clayRoofMat);
      collapsedRoof.position.set(rh.x - rh.w * 0.24, rh.floorY + 1.75, rh.z - rh.d * 0.18);
      collapsedRoof.rotation.set(0.28, 0.08, -0.36);
      collapsedRoof.castShadow = true;
      g.add(collapsedRoof);

      for (const [bx, bz, rzAng] of [[-1.5, 1.2, 0.52], [0.8, -1.5, -0.44], [2.0, 1.8, 0.68]]) {
        const brokenBeam = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 3.6), beamMat);
        brokenBeam.position.set(rh.x + bx, rh.floorY + 0.85, rh.z + bz);
        brokenBeam.rotation.set(0.38, rzAng, 0.25);
        g.add(brokenBeam);
      }

      const rubble = new THREE.Mesh(caveRockGeo.clone(), ruinStoneMat);
      rubble.scale.set(1.3, 0.75, 1.15);
      rubble.position.set(rh.x + 2.1, rh.floorY + 0.42, rh.z - 1.15);
      rubble.castShadow = true;
      g.add(rubble);

      this.structuresGroup.add(g);
    }
    caveRockGeo.dispose();

    // Ruinas Precolombinas
    for (const r of map.ruins) {
      const g = new THREE.Group();
      const platform = new THREE.Mesh(new THREE.CylinderGeometry(10.8, 11.8, 3.0, 12), ruinStoneMat);
      platform.position.set(r.x, r.y - 1.5, r.z);
      platform.receiveShadow = true;
      const altar = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.15, 2.2), stoneMat);
      altar.position.set(r.x, r.y + 0.57, r.z);
      altar.castShadow = true;
      g.add(platform, altar);

      for (const p of r.pillars) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.56, p.h, 10), ruinStoneMat);
        col.position.set(p.x, p.y + p.h * 0.5, p.z);
        col.castShadow = true;
        const cap = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.28, 1.25), stoneMat);
        cap.position.set(p.x, p.y + p.h + 0.12, p.z);
        g.add(col, cap);
      }
      this.structuresGroup.add(g);
    }

    // Casas Coloniales Reparadas ("Modelos 3D/": tejas 3D con computeVertexNormals() + luz cálida y ventanas con cristal transparente real)
    let warmHouseLights = 0;
    for (const b of map.buildings) {
      const g = new THREE.Group();
      const foundH = Math.max(0.8, b.floorY - b.minGroundY);
      const foundation = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.72, foundH, b.d + 0.72), CM.stoneFoundation);
      foundation.position.set(b.x, b.floorY - foundH * 0.5, b.z);
      foundation.castShadow = true;
      foundation.receiveShadow = true;
      const groundFloor = new THREE.Mesh(new THREE.BoxGeometry(b.w - 0.06, 0.06, b.d - 0.06), CM.woodDeck);
      groundFloor.position.set(b.x, b.floorY + 0.01, b.z);
      groundFloor.receiveShadow = true;
      g.add(foundation, groundFloor);

      if (b.kind === 'mirador') {
        for (const [px, pz] of [[-4.2, -4.2], [4.2, -4.2], [-4.2, 4.2], [4.2, 4.2]]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, b.wallH, 10), CM.woodBeam);
          post.position.set(b.x + px, b.floorY + b.wallH * 0.5, b.z + pz);
          post.castShadow = true;
          g.add(post);
        }
        const roof = new THREE.Mesh(new THREE.ConeGeometry(7.6, 2.2, 4), CM.roofTiles);
        roof.rotation.y = Math.PI / 4;
        roof.position.set(b.x, b.floorY + b.wallH + 1.1, b.z);
        roof.geometry.computeVertexNormals();
        roof.castShadow = true;
        roof.receiveShadow = true;
        g.add(roof);
        this.structuresGroup.add(g);
        continue;
      }

      const wallMat = new THREE.MeshStandardMaterial({
        map: MODEL_TEX.stucco([2, 2]),
        color: b.wallColor,
        roughness: 0.88,
        metalness: 0.02
      });
      const zocaloMat = new THREE.MeshStandardMaterial({
        color: b.zocaloColor,
        roughness: 0.74,
        metalness: 0.04
      });
      const wt = 0.26;
      const doorW = 1.76;
      const doorH = 2.44;
      const floorH = b.floorH || 3.60;
      const floors = b.floors || 1;

      const buildLevelFacade = (axis, fixedCoord, length, yBase, hasDoor, showZocalo) => {
        const zocH = showZocalo ? 0.94 : 0.28;
        const center = axis === 'z' ? b.x : b.z;
        const halfL = length * 0.5;

        const addSeg = (cCenter, segLen, y0, h, mat, extraThick = 0) => {
          if (segLen <= 0.05 || h <= 0.04) return;
          const m =
            axis === 'z'
              ? new THREE.Mesh(new THREE.BoxGeometry(segLen, h, wt + extraThick), mat)
              : new THREE.Mesh(new THREE.BoxGeometry(wt + extraThick, h, segLen), mat);
          if (axis === 'z') m.position.set(cCenter, y0 + h * 0.5, fixedCoord);
          else m.position.set(fixedCoord, y0 + h * 0.5, cCenter);
          m.castShadow = true;
          m.receiveShadow = true;
          g.add(m);
        };

        if (!hasDoor) {
          // Vanos reales abiertos en el muro para que las ventanas transparentes dejen ver el interior amoblado
          const winW = Math.min(2.35, length * 0.44);
          const sideL = halfL - winW * 0.5;
          addSeg(center, length, yBase, zocH, zocaloMat, 0.03);
          if (zocH < 0.94) addSeg(center, length, yBase + zocH, 0.94 - zocH, wallMat, 0.0);
          addSeg(center - winW * 0.5 - sideL * 0.5, sideL, yBase + 0.94, 1.44, wallMat);
          addSeg(center + winW * 0.5 + sideL * 0.5, sideL, yBase + 0.94, 1.44, wallMat);
          addSeg(center, length, yBase + 2.38, floorH - 2.38, wallMat);
          addSeg(center, winW + 0.26, yBase + 2.38, 0.10, CM.woodBeam, 0.08);
        } else {
          const sideLen = halfL - doorW * 0.5;
          const leftC = center - doorW * 0.5 - sideLen * 0.5;
          const rightC = center + doorW * 0.5 + sideLen * 0.5;
          addSeg(leftC, sideLen, yBase, zocH, zocaloMat, 0.03);
          addSeg(rightC, sideLen, yBase, zocH, zocaloMat, 0.03);
          addSeg(leftC, sideLen, yBase + zocH, floorH - zocH, wallMat);
          addSeg(rightC, sideLen, yBase + zocH, floorH - zocH, wallMat);
          addSeg(center, doorW + 0.04, yBase + doorH + 0.02, floorH - doorH - 0.02, wallMat);
          addSeg(center, doorW + 0.28, yBase + doorH + 0.01, 0.12, CM.woodBeam, 0.08);
        }
      };

      const balconyFrontSouth = b.doorSide !== 'north';
      for (let f = 0; f < floors; f++) {
        const yBase = b.floorY + f * floorH;
        const isGround = f === 0;
        const southDoor = isGround ? b.doorSide === 'south' || b.doorSide === 'both' : b.hasBalcony && balconyFrontSouth;
        const northDoor = isGround ? b.doorSide === 'north' || b.doorSide === 'both' : b.hasBalcony && !balconyFrontSouth;
        const westDoor = isGround && floors === 1 && b.doorSide === 'west';
        const eastDoor = isGround && floors === 1 && b.doorSide === 'east';

        buildLevelFacade('z', b.z + b.d * 0.5, b.w, yBase, southDoor, isGround);
        buildLevelFacade('z', b.z - b.d * 0.5, b.w, yBase, northDoor, isGround);
        buildLevelFacade('x', b.x - b.w * 0.5, b.d - wt, yBase, westDoor, isGround);
        buildLevelFacade('x', b.x + b.w * 0.5, b.d - wt, yBase, eastDoor, isGround);

        // Cornisa colonial de terracota entre niveles (ColonialHouse.tsx)
        if (f > 0) {
          const cornice = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.24, 0.14, b.d + 0.24), CM.cornice);
          cornice.position.set(b.x, yBase, b.z);
          cornice.castShadow = true;
          g.add(cornice);
        }
      }

      for (let sIdx = 1; sIdx < (b.walkableSlabs?.length || 0); sIdx++) {
        const sl = b.walkableSlabs[sIdx];
        const sw = sl.maxX - sl.minX;
        const sd = sl.maxZ - sl.minZ;
        const slabMesh = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.20, sd), CM.woodDeck);
        slabMesh.position.set((sl.minX + sl.maxX) * 0.5, sl.y - 0.10, (sl.minZ + sl.maxZ) * 0.5);
        slabMesh.castShadow = true;
        slabMesh.receiveShadow = true;
        g.add(slabMesh);
      }

      for (const st of b.stairs || []) {
        const sw = st.maxX - st.minX;
        const cxStair = (st.minX + st.maxX) * 0.5;
        const runZ = st.zEnd - st.zStart;
        const riseY = st.y1 - st.y0;
        const slopeLen = Math.hypot(runZ, riseY);
        const dirSign = runZ >= 0 ? 1 : -1;
        const pitchAng = -dirSign * Math.atan2(riseY, Math.abs(runZ));

        const stringer = new THREE.Mesh(new THREE.BoxGeometry(sw - 0.08, 0.18, slopeLen), CM.woodBeam);
        stringer.position.set(cxStair, (st.y0 + st.y1) * 0.5 - 0.10, (st.zStart + st.zEnd) * 0.5);
        stringer.rotation.x = pitchAng;
        g.add(stringer);

        const stepCount = 12;
        for (let k = 0; k < stepCount; k++) {
          const t = (k + 0.5) / stepCount;
          const stepMesh = new THREE.Mesh(new THREE.BoxGeometry(sw - 0.04, 0.08, Math.abs(runZ) / stepCount + 0.06), CM.woodDeck);
          stepMesh.position.set(cxStair, st.y0 + riseY * t - 0.04, st.zStart + runZ * t);
          g.add(stepMesh);
        }

        const railX = st.eastSide ? st.minX - 0.08 : st.maxX + 0.08;
        const railLen = Math.abs(runZ) - 0.6;
        const guardRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.94, railLen), CM.woodBeam);
        guardRail.position.set(railX, st.y1 + 0.47, (st.zStart + st.zEnd) * 0.5);
        g.add(guardRail);
      }

      // Balcones Coloniales con barandal torneado, ménsulas y materas de geranios (ColonialHouse.tsx)
      for (const bal of b.balconies || []) {
        const bw = bal.maxX - bal.minX;
        const bd = bal.maxZ - bal.minZ;
        const cxBal = (bal.minX + bal.maxX) * 0.5;
        const czBal = (bal.minZ + bal.maxZ) * 0.5;
        const outerZ = bal.south ? bal.maxZ - 0.06 : bal.minZ + 0.06;

        const frontRailMesh = new THREE.Mesh(buildColonialRailingGeo(bw), zocaloMat);
        frontRailMesh.position.set(cxBal, bal.y, outerZ);
        frontRailMesh.castShadow = true;
        g.add(frontRailMesh);

        const sideRailGeo = buildColonialRailingGeo(Math.max(0.6, bd - 0.12));
        for (const sx of [-1, 1]) {
          const sRail = new THREE.Mesh(sx < 0 ? sideRailGeo : sideRailGeo.clone(), zocaloMat);
          sRail.position.set(cxBal + sx * (bw * 0.5 - 0.04), bal.y, czBal);
          sRail.rotation.y = Math.PI * 0.5;
          sRail.castShadow = true;
          g.add(sRail);
        }

        for (const bxOff of [-bw * 0.36, 0, bw * 0.36]) {
          const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.15), CM.woodBeam);
          bracket.position.set(cxBal + bxOff, bal.y - 0.46, czBal);
          bracket.rotation.x = bal.south ? -0.68 : 0.68;
          g.add(bracket);
        }

        for (const pxOff of [-bw * 0.32, 0.05, bw * 0.30]) {
          const potZ = bal.south ? outerZ - 0.18 : outerZ + 0.18;
          const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.075, 0.18, 8), CM.potClay);
          pot.position.set(cxBal + pxOff, bal.y + 0.09, potZ);
          const bush = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), CM.potFoliage);
          bush.position.set(cxBal + pxOff, bal.y + 0.25, potZ);
          const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), CM.potFlower);
          bloom.position.set(cxBal + pxOff + 0.05, bal.y + 0.34, potZ + 0.04);
          g.add(pot, bush, bloom);
        }
      }

      // Farol colonial exterior en fachada principal
      const lanternZ = b.doorSide === 'north' ? b.z - b.d * 0.5 - 0.16 : b.z + b.d * 0.5 + 0.16;
      const lanternArm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.28), CM.lanternMetal);
      lanternArm.position.set(b.x - 1.35, b.floorY + 2.52, lanternZ);
      const lanternGlow = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.20, 0.14), CM.lanternGlow);
      lanternGlow.position.set(b.x - 1.35, b.floorY + 2.38, lanternZ + (b.doorSide === 'north' ? -0.10 : 0.10));
      g.add(lanternArm, lanternGlow);

      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const col = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.21, b.wallH + 0.06, 10), CM.woodBeam);
          col.position.set(b.x + sx * (b.w * 0.5), b.floorY + b.wallH * 0.5, b.z + sz * (b.d * 0.5));
          col.castShadow = true;
          g.add(col);
        }
      }

      const topWallY = b.floorY + b.wallH;
      if (b.hasAzotea) {
        const pH = 1.02;
        const sideSegW = b.w * 0.5 - 1.1;
        for (const sz of [-1, 1]) {
          for (const sx of [-1, 1]) {
            const pSeg = new THREE.Mesh(new THREE.BoxGeometry(sideSegW, pH, 0.28), CM.stoneFoundation);
            pSeg.position.set(b.x + sx * (1.1 + sideSegW * 0.5), topWallY + pH * 0.5, b.z + sz * (b.d * 0.5 - 0.05));
            pSeg.castShadow = true;
            g.add(pSeg);
          }
        }
        for (const sx of [-1, 1]) {
          const pSide = new THREE.Mesh(new THREE.BoxGeometry(0.28, pH, b.d), CM.stoneFoundation);
          pSide.position.set(b.x + sx * (b.w * 0.5 - 0.05), topWallY + pH * 0.5, b.z);
          pSide.castShadow = true;
          g.add(pSide);
        }
      } else {
        // Techo Colonial Reparado: hastiales de estuco + faldones + tejas 3D con computeVertexNormals() y luz cálida
        const over = 0.65;
        const halfD = b.d * 0.5 + over;
        const rise = 1.78;
        const slopeLen = Math.hypot(halfD, rise);
        const slopeAng = Math.atan2(rise, halfD);
        const roofW = b.w + over * 2;

        const gablesGeo = buildColonialGablesGeo(b.d, rise, b.w);
        const gablesMesh = new THREE.Mesh(gablesGeo, wallMat);
        gablesMesh.position.set(b.x, topWallY, b.z);
        gablesMesh.castShadow = true;
        gablesMesh.receiveShadow = true;
        g.add(gablesMesh);

        for (const sg of [1, -1]) {
          const deckSlope = new THREE.Mesh(new THREE.BoxGeometry(roofW, 0.12, slopeLen), CM.roofUnderlay);
          deckSlope.position.set(b.x, topWallY + rise * 0.5 + 0.02, b.z + sg * halfD * 0.5);
          deckSlope.rotation.x = sg * slopeAng;
          deckSlope.geometry.computeVertexNormals();
          deckSlope.castShadow = true;
          deckSlope.receiveShadow = true;
          g.add(deckSlope);

          const eaveBeam = new THREE.Mesh(new THREE.BoxGeometry(roofW, 0.12, 0.14), CM.woodBeam);
          eaveBeam.position.set(b.x, topWallY - 0.02, b.z + sg * (halfD - 0.07));
          g.add(eaveBeam);
        }

        const tilesGeo = buildColonialRoofTilesGeo(roofW, slopeLen, slopeAng, topWallY, halfD, rise);
        const tilesMesh = new THREE.Mesh(tilesGeo, CM.roofTiles);
        tilesMesh.position.set(b.x, 0, b.z);
        tilesMesh.castShadow = true;
        tilesMesh.receiveShadow = true;
        g.add(tilesMesh);
      }

      if (b.hasTower) {
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.65, 4.2, 8), zocaloMat);
        tower.position.set(b.x - b.w * 0.24, topWallY + 2.4, b.z);
        tower.castShadow = true;
        const spire = new THREE.Mesh(new THREE.ConeGeometry(2.1, 2.2, 8), CM.roofTiles);
        spire.geometry.computeVertexNormals();
        spire.position.set(b.x - b.w * 0.24, topWallY + 5.6, b.z);
        spire.castShadow = true;
        const cross = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), goldMat);
        cross.position.set(b.x - b.w * 0.24, topWallY + 6.9, b.z);
        g.add(tower, spire, cross);
      }

      // Iluminación interior cálida en las casas principales del pueblo
      if (warmHouseLights < 6) {
        warmHouseLights++;
        this.addLightAnchor(g, '#ffcf75', 1.15, 13.5, 1.7, b.x, b.floorY + 2.75, b.z);
      }

      this.structuresGroup.add(g);
    }

    // Construir Puertas Interactivas/Destructibles (E para abrir/cerrar, destructibles a disparos)
    for (const d of map.doors || []) {
      const pivot = new THREE.Group();
      const halfW = d.width * 0.5;
      if (d.axis === 'z') {
        pivot.position.set(d.x - halfW, d.y, d.z);
      } else {
        pivot.position.set(d.x, d.y, d.z - halfW);
      }

      const panelGroup = new THREE.Group();
      if (d.axis === 'z') {
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(d.width, d.height, 0.11), doorWoodMat);
        leaf.position.set(halfW, d.height * 0.5, 0);
        leaf.castShadow = true;
        leaf.receiveShadow = true;
        const inset = new THREE.Mesh(new THREE.BoxGeometry(d.width * 0.72, d.height * 0.36, 0.14), zocaloOrBeamMat(beamMat));
        inset.position.set(halfW, d.height * 0.70, 0);
        const handle = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), goldMat);
        handle.position.set(d.width - 0.20, 1.05, 0.08);
        panelGroup.add(leaf, inset, handle);
      } else {
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.11, d.height, d.width), doorWoodMat);
        leaf.position.set(0, d.height * 0.5, halfW);
        leaf.castShadow = true;
        leaf.receiveShadow = true;
        const inset = new THREE.Mesh(new THREE.BoxGeometry(0.14, d.height * 0.36, d.width * 0.72), beamMat);
        inset.position.set(0, d.height * 0.70, halfW);
        const handle = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), goldMat);
        handle.position.set(0.08, 1.05, d.width - 0.20);
        panelGroup.add(leaf, inset, handle);
      }
      pivot.add(panelGroup);
      this.structuresGroup.add(pivot);

      this.doorVisuals.set(d.id, {
        data: d,
        pivot,
        curAngle: 0,
        targetAngle: 0
      });
    }

    // Construir Ventanas Coloniales Transparentes y Rompibles (transparent: true, opacity: 0.35, depthWrite: false)
    const shutterPalette = ['#2b6cb0', '#2f7a4f', '#c8652f', '#0284c7'];
    let winIdx = 0;
    for (const w of map.windows || []) {
      const frameHex = shutterPalette[winIdx % shutterPalette.length];
      winIdx++;
      const { group: wg } = buildColonialWindowGroup(w, frameHex);
      this.structuresGroup.add(wg);
      this.windowVisuals.set(w.id, { data: w, group: wg });
    }

    this.mergeStaticStructures();
  },

  // Fusiona las piezas estáticas de las estructuras (muros, techos, escalones, barandas, cimientos,
  // monumento, restos del helicóptero...) que comparten material y banderas de sombra, agrupadas por
  // zonas de 64 m. Los triángulos, materiales y sombras son exactamente los mismos; solo cambia que
  // se envían en muchas menos llamadas de dibujo. Puertas, ventanas, piezas transparentes, ocultas
  // o con lógica propia quedan intactas.
  mergeStaticStructures() {
    const root = this.structuresGroup;
    const keepRoots = new Set();
    for (const entry of this.doorVisuals.values()) keepRoots.add(entry.pivot);
    for (const entry of this.windowVisuals.values()) keepRoots.add(entry.group);
    for (const anchor of this.lightAnchors) keepRoots.add(anchor);
    if (this.heliAnimState?.rotorHead) keepRoots.add(this.heliAnimState.rotorHead);
    if (this.heliAnimState?.chinGun) keepRoots.add(this.heliAnimState.chinGun);
    if (this.heliAnimState?.fireMeshes) {
      for (const f of this.heliAnimState.fireMeshes) keepRoots.add(f.mesh);
    }

    root.updateMatrixWorld(true);
    const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const defaultOnBeforeRender = THREE.Object3D.prototype.onBeforeRender;
    const CELL = 64;

    const buckets = new Map();
    const visit = (obj, chainVisible) => {
      if (keepRoots.has(obj)) return;
      const visible = chainVisible && obj.visible;
      for (let i = 0; i < obj.children.length; i++) visit(obj.children[i], visible);
      if (!obj.isMesh || obj.isInstancedMesh || obj.isSkinnedMesh || !visible) return;
      const mat = obj.material;
      const geo = obj.geometry;
      if (!mat || Array.isArray(mat) || mat.transparent) return;
      if (obj.onBeforeRender !== defaultOnBeforeRender || obj.userData.keepSeparate) return;
      // (los grupos de la geometría solo importan con materiales en arreglo, ya excluidos arriba)
      if (!geo.attributes.position || geo.morphAttributes.position) return;
      const names = Object.keys(geo.attributes).sort();
      for (const n of names) if (geo.attributes[n].isInterleavedBufferAttribute) return;
      const signature = names.map((n) => n + geo.attributes[n].itemSize).join(',');
      const e = obj.matrixWorld.elements;
      const cell = Math.floor(e[12] / CELL) + ':' + Math.floor(e[14] / CELL);
      const key = [cell, mat.uuid, obj.castShadow, obj.receiveShadow, obj.renderOrder, obj.frustumCulled, signature].join('|');
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { material: mat, names, meshes: [], castShadow: obj.castShadow, receiveShadow: obj.receiveShadow, renderOrder: obj.renderOrder, frustumCulled: obj.frustumCulled };
        buckets.set(key, bucket);
      }
      bucket.meshes.push(obj);
    };
    visit(root, true);

    const toMatrix = new THREE.Matrix4();
    for (const bucket of buckets.values()) {
      if (bucket.meshes.length < 2) continue;

      // Pasar cada pieza a triángulos sueltos en coordenadas del grupo raíz
      const parts = [];
      let vertexCount = 0;
      for (const mesh of bucket.meshes) {
        const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        toMatrix.multiplyMatrices(rootInverse, mesh.matrixWorld);
        g.applyMatrix4(toMatrix);
        // Una escala en espejo invierte el sentido de los triángulos: restaurarlo
        if (toMatrix.determinant() < 0) {
          for (const n of bucket.names) {
            const attr = g.attributes[n];
            const size = attr.itemSize;
            const arr = attr.array;
            for (let v = 0; v < attr.count; v += 3) {
              for (let c = 0; c < size; c++) {
                const a = (v + 1) * size + c;
                const b = (v + 2) * size + c;
                const tmp = arr[a];
                arr[a] = arr[b];
                arr[b] = tmp;
              }
            }
          }
        }
        parts.push(g);
        vertexCount += g.attributes.position.count;
      }

      const merged = new THREE.BufferGeometry();
      for (const n of bucket.names) {
        const first = parts[0].attributes[n];
        const out = new first.array.constructor(vertexCount * first.itemSize);
        let offset = 0;
        for (const g of parts) {
          out.set(g.attributes[n].array, offset);
          offset += g.attributes[n].array.length;
        }
        merged.setAttribute(n, new THREE.BufferAttribute(out, first.itemSize, first.normalized));
      }
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      for (const g of parts) g.dispose();

      const mergedMesh = new THREE.Mesh(merged, bucket.material);
      mergedMesh.castShadow = bucket.castShadow;
      mergedMesh.receiveShadow = bucket.receiveShadow;
      mergedMesh.renderOrder = bucket.renderOrder;
      mergedMesh.frustumCulled = bucket.frustumCulled;
      mergedMesh.matrixAutoUpdate = false;
      mergedMesh.updateMatrix();

      for (const mesh of bucket.meshes) {
        mesh.removeFromParent();
        if (
          !this.sharedGeometries.has(mesh.geometry) &&
          !isSharedArmasV1Geometry(mesh.geometry) &&
          !isSharedAircraftGeometry(mesh.geometry)
        ) {
          mesh.geometry.dispose();
        }
      }
      root.add(mergedMesh);
    }

    // Quitar los grupos que quedaron vacíos (menos objetos que recorrer cada fotograma)
    const prune = (obj) => {
      for (let i = obj.children.length - 1; i >= 0; i--) {
        const child = obj.children[i];
        prune(child);
        if (child.children.length === 0 && !child.isMesh && !child.isLight && !keepRoots.has(child) &&
          child.type === 'Group') {
          child.removeFromParent();
        }
      }
    };
    prune(root);

    // Las piezas estáticas restantes no necesitan recalcular su matriz cada fotograma
    const freeze = (obj) => {
      if (keepRoots.has(obj)) return;
      obj.matrixAutoUpdate = false;
      obj.updateMatrix();
      for (let i = 0; i < obj.children.length; i++) freeze(obj.children[i]);
    };
    for (let i = 0; i < root.children.length; i++) freeze(root.children[i]);
    root.updateMatrixWorld(true);
  },

  syncDoors(doorsList = []) {
    for (const s of doorsList) {
      this.applyDoorState({
        doorId: s.id,
        isOpen: s.isOpen,
        hp: s.hp,
        destroyed: s.destroyed
      }, false);
    }
  },

  applyDoorState(payload, spawnDebris = true) {
    if (!payload) return;
    const entry = this.doorVisuals.get(payload.doorId);
    if (!entry) return;
    const d = entry.data;
    d.isOpen = Boolean(payload.isOpen);
    d.hp = payload.hp ?? d.hp;
    const justDestroyed = Boolean(payload.destroyed) && !d.destroyed;
    d.destroyed = Boolean(payload.destroyed);
    if (d.collider) d.collider.enabled = !d.isOpen && !d.destroyed;

    if (d.destroyed) {
      entry.pivot.visible = false;
      if (justDestroyed && spawnDebris) {
        this.spawnDoorBreakFX(d.x, d.y + 1.1, d.z);
      }
    } else {
      entry.pivot.visible = true;
      entry.targetAngle = d.isOpen ? d.swingSign * 1.48 : 0;
    }
  },

  syncBrokenWindows(brokenIds = []) {
    const set = new Set(brokenIds);
    for (const [id, entry] of this.windowVisuals.entries()) {
      const isBrk = set.has(id);
      entry.data.broken = isBrk;
      if (entry.data.collider) entry.data.collider.enabled = !isBrk;
      entry.group.visible = !isBrk;
    }
  },

  applyWindowBroken(payload, spawnFX = true) {
    if (!payload) return;
    const entry = this.windowVisuals.get(payload.windowId);
    if (!entry) return;
    entry.data.broken = true;
    if (entry.data.collider) entry.data.collider.enabled = false;
    entry.group.visible = false;
    if (spawnFX) {
      this.spawnWindowShatterFX(
        payload.x ?? entry.data.x,
        payload.y ?? (entry.data.y + entry.data.height * 0.5),
        payload.z ?? entry.data.z
      );
    }
  }
};
