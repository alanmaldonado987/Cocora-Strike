// Modelos 3D/armasV1.js
// Integración completa del catálogo "Armas v1" (7 armas 3D de alta precisión en Three.js):
// - Pistola Semiautomática 9mm ('pistol')
// - Revólver Clásico .357 ('revolver')
// - Escopeta de Corredera 12G ('shotgun')
// - Subfusil Compacto MP-9 ('smg')
// - Rifle de Asalto M4-T ('assault_rifle')
// - Fusil Clásico AK-M ('rifle')
// - Rifle de Francotirador .338 ('sniper')
//
// Incluye biblioteca PBR procedural en caché (acero pavonado, cromo, polímero moleteado, nogal, madera laminada,
// baquelita, latón, tritio verde, fibra roja y cristal óptico) y fusión automática de sub-mallas por material
// (manteniendo independientes corredera/cerrojo/tambor, cargador y boca de cañón) para 60 FPS estables.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function makeSafeCanvasTexture(width, height, drawFn, repeat = [1, 1], srgb = true) {
  if (typeof document === 'undefined') {
    const dt = new THREE.DataTexture(new Uint8Array([160, 160, 160, 255]), 1, 1, THREE.RGBAFormat);
    dt.wrapS = THREE.RepeatWrapping;
    dt.wrapT = THREE.RepeatWrapping;
    dt.repeat.set(repeat[0], repeat[1]);
    dt.needsUpdate = true;
    return dt;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) drawFn(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 8;
  return tex;
}

function createDeterministicRng(seed = 71829) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function createBrushedMetalBumpTexture() {
  const rand = createDeterministicRng(104729);
  return makeSafeCanvasTexture(
    256,
    256,
    (ctx, size) => {
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, size, size);
      for (let y = 0; y < size; y++) {
        const lum = 112 + Math.floor(rand() * 32);
        ctx.fillStyle = `rgb(${lum},${lum},${lum})`;
        ctx.fillRect(0, y, size, 1);
      }
      for (let i = 0; i < 420; i++) {
        const y = Math.floor(rand() * size);
        const x = Math.floor(rand() * size);
        const w = 18 + Math.floor(rand() * 75);
        const v = 90 + Math.floor(rand() * 76);
        ctx.fillStyle = `rgba(${v},${v},${v},0.45)`;
        ctx.fillRect(x, y, w, 1);
      }
    },
    [3, 3],
    false
  );
}

function createKnurledGripBumpTexture() {
  return makeSafeCanvasTexture(
    128,
    128,
    (ctx, size) => {
      ctx.fillStyle = '#404040';
      ctx.fillRect(0, 0, size, size);
      const step = 8;
      for (let y = 0; y < size; y += step) {
        for (let x = 0; x < size; x += step) {
          const offset = ((y / step) % 2) * (step / 2);
          const cx = (x + offset) % size;
          const cy = y + step / 2;
          const grad = ctx.createRadialGradient(cx, cy, 0.5, cx, cy, step * 0.55);
          grad.addColorStop(0, '#f0f0f0');
          grad.addColorStop(0.65, '#929292');
          grad.addColorStop(1, '#262626');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(cx, cy, step * 0.52, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
    [6, 6],
    false
  );
}

function createWoodTextures(variant) {
  const width = 256;
  const height = 128;
  const baseColors =
    variant === 'walnut'
      ? { r: 92, g: 56, b: 34, darkR: 46, darkG: 26, darkB: 15 }
      : { r: 146, g: 76, b: 36, darkR: 78, darkG: 34, darkB: 16 };

  const map = makeSafeCanvasTexture(
    width,
    height,
    (cCtx, w, h) => {
      const cImg = cCtx.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const nx = x / w;
          const ny = y / h;
          const wave =
            Math.sin(ny * 36 + Math.sin(nx * 6.5) * 2.2 + Math.cos(nx * 14 + ny * 8) * 0.5) * 0.5 + 0.5;
          const fineGrain =
            Math.sin(ny * 145 + Math.sin(nx * 24) * 1.4) * 0.25 + Math.sin(nx * 18 + ny * 60) * 0.12;
          const t = Math.min(1, Math.max(0, wave * 0.72 + fineGrain * 0.28 + 0.1));
          const strata = variant === 'laminate' ? Math.sin(ny * 44) * 0.18 + 0.1 : 0;
          const mix = Math.min(1, Math.max(0, t + strata));
          const idx = (y * w + x) * 4;
          cImg.data[idx] = Math.round(baseColors.darkR + (baseColors.r - baseColors.darkR) * mix);
          cImg.data[idx + 1] = Math.round(baseColors.darkG + (baseColors.g - baseColors.darkG) * mix);
          cImg.data[idx + 2] = Math.round(baseColors.darkB + (baseColors.b - baseColors.darkB) * mix);
          cImg.data[idx + 3] = 255;
        }
      }
      cCtx.putImageData(cImg, 0, 0);
    },
    [1.5, 1.5],
    true
  );

  const bumpMap = makeSafeCanvasTexture(
    width,
    height,
    (bCtx, w, h) => {
      const bImg = bCtx.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const nx = x / w;
          const ny = y / h;
          const wave =
            Math.sin(ny * 36 + Math.sin(nx * 6.5) * 2.2 + Math.cos(nx * 14 + ny * 8) * 0.5) * 0.5 + 0.5;
          const fineGrain =
            Math.sin(ny * 145 + Math.sin(nx * 24) * 1.4) * 0.25 + Math.sin(nx * 18 + ny * 60) * 0.12;
          const t = Math.min(1, Math.max(0, wave * 0.72 + fineGrain * 0.28 + 0.1));
          const strata = variant === 'laminate' ? Math.sin(ny * 44) * 0.18 + 0.1 : 0;
          const mix = Math.min(1, Math.max(0, t + strata));
          const bumpVal = Math.round(90 + mix * 120);
          const idx = (y * w + x) * 4;
          bImg.data[idx] = bumpVal;
          bImg.data[idx + 1] = bumpVal;
          bImg.data[idx + 2] = bumpVal;
          bImg.data[idx + 3] = 255;
        }
      }
      bCtx.putImageData(bImg, 0, 0);
    },
    [1.5, 1.5],
    false
  );

  return { map, bumpMap };
}

let _weaponMaterialLibrary = null;
const _sharedWeaponGeometries = new Set();
const _sharedWeaponMaterials = new Set();

export function getArmasV1MaterialLibrary() {
  if (_weaponMaterialLibrary) return _weaponMaterialLibrary;

  const brushedBump = createBrushedMetalBumpTexture();
  const knurledBump = createKnurledGripBumpTexture();
  const walnut = createWoodTextures('walnut');
  const laminate = createWoodTextures('laminate');

  const lib = {
    gunmetal: new THREE.MeshStandardMaterial({
      color: '#343942',
      metalness: 0.84,
      roughness: 0.34,
      bumpMap: brushedBump,
      bumpScale: 0.008
    }),
    bluedSteel: new THREE.MeshStandardMaterial({
      color: '#232934',
      metalness: 0.88,
      roughness: 0.26,
      bumpMap: brushedBump,
      bumpScale: 0.005
    }),
    anodizedAlloy: new THREE.MeshStandardMaterial({
      color: '#2a2e36',
      metalness: 0.76,
      roughness: 0.42,
      bumpMap: brushedBump,
      bumpScale: 0.004
    }),
    matteSteel: new THREE.MeshStandardMaterial({
      color: '#444a54',
      metalness: 0.82,
      roughness: 0.46,
      bumpMap: brushedBump,
      bumpScale: 0.01
    }),
    chromeSteel: new THREE.MeshStandardMaterial({
      color: '#cfd6df',
      metalness: 0.94,
      roughness: 0.18,
      bumpMap: brushedBump,
      bumpScale: 0.003
    }),
    darkBore: new THREE.MeshStandardMaterial({
      color: '#08090c',
      metalness: 0.15,
      roughness: 0.94
    }),
    polymerDark: new THREE.MeshStandardMaterial({
      color: '#25282f',
      metalness: 0.06,
      roughness: 0.76
    }),
    polymerGrip: new THREE.MeshStandardMaterial({
      color: '#1f2228',
      metalness: 0.05,
      roughness: 0.84,
      bumpMap: knurledBump,
      bumpScale: 0.022
    }),
    polymerAccent: new THREE.MeshStandardMaterial({
      color: '#3c4149',
      metalness: 0.1,
      roughness: 0.68
    }),
    rubber: new THREE.MeshStandardMaterial({
      color: '#181a1e',
      metalness: 0.02,
      roughness: 0.94,
      bumpMap: knurledBump,
      bumpScale: 0.01
    }),
    woodWalnut: new THREE.MeshStandardMaterial({
      map: walnut.map,
      bumpMap: walnut.bumpMap,
      bumpScale: 0.015,
      metalness: 0.04,
      roughness: 0.44
    }),
    woodLaminate: new THREE.MeshStandardMaterial({
      map: laminate.map,
      bumpMap: laminate.bumpMap,
      bumpScale: 0.014,
      metalness: 0.04,
      roughness: 0.38
    }),
    bakelite: new THREE.MeshStandardMaterial({
      color: '#6f3220',
      metalness: 0.06,
      roughness: 0.45,
      bumpMap: knurledBump,
      bumpScale: 0.014
    }),
    brass: new THREE.MeshStandardMaterial({
      color: '#d2aa52',
      metalness: 0.92,
      roughness: 0.22
    }),
    copperJacket: new THREE.MeshStandardMaterial({
      color: '#b86f44',
      metalness: 0.88,
      roughness: 0.28
    }),
    shellRed: new THREE.MeshStandardMaterial({
      color: '#a42026',
      metalness: 0.05,
      roughness: 0.36
    }),
    opticGlass: new THREE.MeshStandardMaterial({
      color: '#185c6b',
      metalness: 0.25,
      roughness: 0.08,
      transparent: true,
      opacity: 0.72,
      depthWrite: false
    }),
    sightGreen: new THREE.MeshStandardMaterial({
      color: '#6cffaa',
      emissive: '#27db74',
      emissiveIntensity: 1.4,
      roughness: 0.25,
      metalness: 0.1
    }),
    sightRed: new THREE.MeshStandardMaterial({
      color: '#ff453a',
      emissive: '#ff2d20',
      emissiveIntensity: 1.8,
      roughness: 0.2,
      metalness: 0.1
    }),
    flashOuter: new THREE.MeshBasicMaterial({
      color: '#ffb13b',
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }),
    flashMid: new THREE.MeshBasicMaterial({
      color: '#ffe08a',
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }),
    flashCore: new THREE.MeshBasicMaterial({
      color: '#fff4c4',
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  };

  for (const m of Object.values(lib)) {
    _sharedWeaponMaterials.add(m);
  }
  _weaponMaterialLibrary = lib;
  return lib;
}

export function isSharedArmasV1Geometry(geo) {
  return _sharedWeaponGeometries.has(geo);
}

export function isSharedArmasV1Material(mat) {
  return _sharedWeaponMaterials.has(mat);
}

// ==================== HELPERS GEOMÉTRICOS DE "ARMAS V1" ====================

function createExtrudedProfile(points, depth, bevel = {}) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], index) => {
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();

  const bevelThickness = bevel.bevelThickness ?? Math.min(depth * 0.12, 0.02);
  const bevelSize = bevel.bevelSize ?? Math.min(depth * 0.12, 0.02);
  const bevelSegments = bevel.bevelSegments ?? 2;

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevelThickness > 0 && bevelSize > 0,
    bevelThickness,
    bevelSize,
    bevelSegments,
    curveSegments: 8
  });
  geom.translate(0, 0, -depth * 0.5);
  geom.computeVertexNormals();
  return geom;
}

function createRoundedBox(width, height, depth, radius = 0.02, bevel = 0.012) {
  const r = Math.min(radius, width * 0.45, height * 0.45);
  const hw = width * 0.5;
  const hh = height * 0.5;

  const shape = new THREE.Shape();
  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);

  const innerDepth = Math.max(0.004, depth - bevel * 2);
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: innerDepth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 5
  });
  geom.translate(0, 0, -innerDepth * 0.5);
  geom.computeVertexNormals();
  return geom;
}

function createLatheAlongX(profile, radialSegments = 18) {
  const lathePoints = profile.map(([x, r]) => new THREE.Vector2(Math.max(0.0001, r), x));
  const geom = new THREE.LatheGeometry(lathePoints, radialSegments);
  geom.rotateZ(-Math.PI / 2);
  geom.computeVertexNormals();
  return geom;
}

function createCylinderX(radiusTop, radiusBottom, length, radialSegments = 16, openEnded = false) {
  const geom = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, radialSegments, 1, openEnded);
  geom.rotateZ(-Math.PI / 2);
  return geom;
}

function createCylinderZ(radius, length, radialSegments = 12) {
  const geom = new THREE.CylinderGeometry(radius, radius, length, radialSegments);
  geom.rotateX(Math.PI / 2);
  return geom;
}

function createCurvedTube(points, radius, tubularSegments = 16, radialSegments = 8) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  return new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
}

function buildHollowBarrel(options) {
  const {
    xStart,
    yCenter,
    length,
    outerRadiusStart,
    outerRadiusEnd = outerRadiusStart,
    innerRadius,
    steelMaterial,
    boreMaterial,
    radialSegments = 18,
    crownChamfer = 0.015
  } = options;

  const group = new THREE.Group();
  const xEnd = xStart + length;
  const boreDepth = Math.min(length * 0.45, 0.45);
  const profile = [
    [xStart, 0.001],
    [xStart, outerRadiusStart],
    [xEnd - crownChamfer, outerRadiusEnd],
    [xEnd, Math.max(innerRadius + 0.006, outerRadiusEnd - crownChamfer * 0.6)],
    [xEnd, innerRadius],
    [xEnd - boreDepth, innerRadius]
  ];
  const outerGeom = createLatheAlongX(profile, radialSegments);
  const outerMesh = new THREE.Mesh(outerGeom, steelMaterial);
  outerMesh.position.y = yCenter;
  group.add(outerMesh);

  const boreCapGeom = createCylinderX(innerRadius * 0.99, innerRadius * 0.99, boreDepth, 12);
  const boreCap = new THREE.Mesh(boreCapGeom, boreMaterial);
  boreCap.position.set(xEnd - boreDepth * 0.55, yCenter, 0);
  group.add(boreCap);
  return group;
}

function buildPicatinnyRail({ length, width = 0.21, height = 0.085, pitch = 0.1, material }) {
  const group = new THREE.Group();
  const stemGeom = new THREE.BoxGeometry(length, height * 0.48, width * 0.68);
  const stem = new THREE.Mesh(stemGeom, material);
  stem.position.y = height * 0.24;
  group.add(stem);

  const toothLength = pitch * 0.54;
  const count = Math.max(2, Math.floor(length / pitch));
  const startX = -((count - 1) * pitch) * 0.5;
  const toothGeom = new THREE.BoxGeometry(toothLength, height * 0.56, width);
  for (let i = 0; i < count; i++) {
    const tooth = new THREE.Mesh(toothGeom, material);
    tooth.position.set(startX + i * pitch, height * 0.72, 0);
    group.add(tooth);
  }
  return group;
}

function placeMesh(parent, geometry, material, position = null, rotation = null) {
  const mesh = new THREE.Mesh(geometry, material);
  if (position) mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  parent.add(mesh);
  return mesh;
}

function createPartGroup(id) {
  const group = new THREE.Group();
  group.name = id;
  return { id, group };
}

// ==================== CONSTRUCTORES DE LOS 7 MODELOS DE "ARMAS V1" ====================

function buildPistolParts(materials) {
  const slidePart = createPartGroup('corredera');
  const barrelPart = createPartGroup('canon');
  const framePart = createPartGroup('empunadura');
  const magPart = createPartGroup('cargador');
  const sightsPart = createPartGroup('mira');
  const mechPart = createPartGroup('mecanismo');

  const slideCrossSection = new THREE.Shape();
  slideCrossSection.moveTo(-0.145, 0.085);
  slideCrossSection.lineTo(0.145, 0.085);
  slideCrossSection.lineTo(0.145, 0.315);
  slideCrossSection.lineTo(0.105, 0.39);
  slideCrossSection.lineTo(-0.105, 0.39);
  slideCrossSection.lineTo(-0.145, 0.315);
  slideCrossSection.closePath();

  const rearSlideGeom = new THREE.ExtrudeGeometry(slideCrossSection, {
    depth: 0.81, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 2
  });
  rearSlideGeom.rotateY(Math.PI / 2);
  placeMesh(slidePart.group, rearSlideGeom, materials.bluedSteel, [-0.96, 0, 0]);

  const frontSlideGeom = new THREE.ExtrudeGeometry(slideCrossSection, {
    depth: 0.76, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 2
  });
  frontSlideGeom.rotateY(Math.PI / 2);
  placeMesh(slidePart.group, frontSlideGeom, materials.bluedSteel, [0.28, 0, 0]);

  placeMesh(slidePart.group, createRoundedBox(0.47, 0.295, 0.075, 0.012, 0.008), materials.bluedSteel, [0.065, 0.238, -0.11]);
  placeMesh(slidePart.group, createRoundedBox(0.47, 0.085, 0.08, 0.01, 0.006), materials.bluedSteel, [0.065, 0.13, 0.108]);
  placeMesh(slidePart.group, createRoundedBox(0.06, 0.26, 0.24, 0.02, 0.01), materials.bluedSteel, [1.035, 0.23, 0]);
  placeMesh(slidePart.group, createRoundedBox(0.025, 0.21, 0.19, 0.015, 0.006), materials.matteSteel, [-0.97, 0.21, 0]);

  const serrationGeom = new THREE.BoxGeometry(0.024, 0.21, 0.016);
  for (const x of [-0.84, -0.77, -0.7, -0.63, -0.56, -0.49, 0.56, 0.63, 0.7, 0.77]) {
    placeMesh(slidePart.group, serrationGeom, materials.matteSteel, [x, 0.205, 0.146], [0, 0, -0.14]);
    placeMesh(slidePart.group, serrationGeom, materials.matteSteel, [x, 0.205, -0.146], [0, 0, -0.14]);
  }
  placeMesh(slidePart.group, createRoundedBox(0.24, 0.055, 0.024, 0.008, 0.004), materials.gunmetal, [-0.28, 0.26, 0.142]);

  barrelPart.group.add(buildHollowBarrel({
    xStart: -0.12, yCenter: 0.265, length: 1.24, outerRadiusStart: 0.072, outerRadiusEnd: 0.072,
    innerRadius: 0.046, steelMaterial: materials.chromeSteel, boreMaterial: materials.darkBore, crownChamfer: 0.016
  }));
  placeMesh(barrelPart.group, createRoundedBox(0.41, 0.17, 0.175, 0.02, 0.012), materials.chromeSteel, [0.06, 0.285, 0.01]);
  placeMesh(barrelPart.group, new THREE.BoxGeometry(0.04, 0.15, 0.15), materials.darkBore, [-0.15, 0.265, 0.01]);
  placeMesh(barrelPart.group, createCylinderX(0.032, 0.032, 0.96, 12), materials.matteSteel, [0.56, 0.145, 0]);
  const springCoilGeom = new THREE.TorusGeometry(0.044, 0.008, 6, 12);
  springCoilGeom.rotateY(Math.PI / 2);
  for (let i = 0; i < 10; i++) {
    placeMesh(barrelPart.group, springCoilGeom, materials.chromeSteel, [0.24 + i * 0.075, 0.145, 0]);
  }
  placeMesh(barrelPart.group, createCylinderX(0.042, 0.042, 0.04, 12), materials.gunmetal, [1.045, 0.145, 0]);

  placeMesh(framePart.group, createExtrudedProfile([
    [-1.06, 0.06], [-0.92, 0.085], [1.01, 0.085], [1.01, -0.02], [0.95, -0.065], [0.36, -0.065],
    [0.32, -0.04], [-0.25, -0.04], [-0.36, -0.14], [-0.9, -0.14], [-0.95, -0.01], [-1.06, 0.02]
  ], 0.25, { bevelThickness: 0.014, bevelSize: 0.012 }), materials.polymerDark);

  const underRail = buildPicatinnyRail({ length: 0.52, width: 0.21, height: 0.065, pitch: 0.14, material: materials.polymerDark });
  underRail.rotation.x = Math.PI;
  underRail.position.set(0.68, -0.06, 0);
  framePart.group.add(underRail);

  placeMesh(framePart.group, createExtrudedProfile([
    [-0.89, -0.02], [-0.34, -0.04], [-0.4, -0.18], [-0.45, -0.34], [-0.5, -0.54], [-0.56, -0.74],
    [-0.61, -0.92], [-1.12, -0.92], [-1.09, -0.74], [-1.06, -0.52], [-0.98, -0.26], [-0.92, -0.09]
  ], 0.255, { bevelThickness: 0.022, bevelSize: 0.02 }), materials.polymerDark);

  placeMesh(framePart.group, createExtrudedProfile([
    [-0.86, -0.16], [-0.47, -0.18], [-0.64, -0.82], [-1.02, -0.82]
  ], 0.292, { bevelThickness: 0.008, bevelSize: 0.008 }), materials.polymerGrip);

  placeMesh(framePart.group, createRoundedBox(0.58, 0.075, 0.31, 0.025, 0.012), materials.polymerAccent, [-0.865, -0.91, 0]);

  const guardCurve = createCurvedTube([[-0.36, -0.34, 0], [0.24, -0.35, 0], [0.34, -0.31, 0], [0.36, -0.16, 0], [0.32, -0.05, 0]], 0.036, 18, 8);
  guardCurve.scale(1, 1, 1.45);
  placeMesh(framePart.group, guardCurve, materials.polymerDark);

  const magSubGroup = new THREE.Group();
  magSubGroup.position.set(-0.74, -0.58, 0);
  magSubGroup.rotation.z = -0.27;
  placeMesh(magSubGroup, createRoundedBox(0.32, 0.94, 0.195, 0.025, 0.01), materials.bluedSteel, [0, 0.04, 0]);
  const witnessDot = new THREE.CylinderGeometry(0.015, 0.015, 0.012, 8);
  witnessDot.rotateZ(Math.PI / 2);
  for (let i = 0; i < 4; i++) placeMesh(magSubGroup, witnessDot, materials.brass, [-0.162, -0.22 + i * 0.14, 0]);
  placeMesh(magSubGroup, createCylinderX(0.048, 0.048, 0.18, 12), materials.brass, [-0.01, 0.54, 0]);
  placeMesh(magSubGroup, createLatheAlongX([[0.08, 0.046], [0.14, 0.04], [0.18, 0.022], [0.2, 0.002]], 12), materials.copperJacket, [0, 0.54, 0]);
  magPart.group.add(magSubGroup);

  placeMesh(magPart.group, createExtrudedProfile([
    [-1.14, -0.945], [-0.57, -0.945], [-0.55, -1.03], [-0.63, -1.08], [-1.13, -1.08], [-1.16, -1.01]
  ], 0.25, { bevelThickness: 0.015, bevelSize: 0.015 }), materials.polymerGrip);

  placeMesh(sightsPart.group, createRoundedBox(0.11, 0.028, 0.22, 0.008, 0.004), materials.gunmetal, [-0.84, 0.4, 0]);
  const rearWing = createRoundedBox(0.085, 0.082, 0.068, 0.008, 0.005);
  placeMesh(sightsPart.group, rearWing, materials.gunmetal, [-0.85, 0.445, 0.068]);
  placeMesh(sightsPart.group, rearWing, materials.gunmetal, [-0.85, 0.445, -0.068]);
  const dotGeom = createCylinderX(0.015, 0.015, 0.012, 10);
  placeMesh(sightsPart.group, dotGeom, materials.sightGreen, [-0.892, 0.448, 0.068]);
  placeMesh(sightsPart.group, dotGeom, materials.sightGreen, [-0.892, 0.448, -0.068]);
  placeMesh(sightsPart.group, createRoundedBox(0.12, 0.088, 0.036, 0.006, 0.004), materials.gunmetal, [0.92, 0.432, 0]);
  placeMesh(sightsPart.group, dotGeom, materials.sightGreen, [0.858, 0.446, 0]);

  placeMesh(mechPart.group, createExtrudedProfile([
    [-0.03, -0.02], [0.05, -0.02], [0.02, -0.14], [0.08, -0.25], [0.02, -0.27], [-0.05, -0.15]
  ], 0.065, { bevelThickness: 0.006, bevelSize: 0.006 }), materials.gunmetal, [0.02, -0.01, 0]);
  const slideStop = createRoundedBox(0.24, 0.042, 0.026, 0.008, 0.004);
  placeMesh(mechPart.group, slideStop, materials.gunmetal, [-0.26, 0.06, 0.148]);
  placeMesh(mechPart.group, slideStop, materials.gunmetal, [-0.26, 0.06, -0.148]);
  placeMesh(mechPart.group, createRoundedBox(0.11, 0.042, 0.305, 0.012, 0.005), materials.matteSteel, [0.16, 0.042, 0]);
  placeMesh(mechPart.group, createRoundedBox(0.075, 0.068, 0.305, 0.012, 0.006), materials.gunmetal, [-0.39, -0.16, 0]);
  const pinGeom = createCylinderZ(0.018, 0.278, 10);
  placeMesh(mechPart.group, pinGeom, materials.chromeSteel, [-0.04, 0.025, 0]);
  placeMesh(mechPart.group, pinGeom, materials.chromeSteel, [-0.72, 0.025, 0]);

  return {
    parts: [slidePart, barrelPart, framePart, magPart, sightsPart, mechPart],
    slideIds: new Set(['corredera', 'mira']),
    magIds: new Set(['cargador']),
    unitScale: 0.106,
    gripOrigin: [-0.74, -0.45, 0],
    muzzleRaw: [1.14, 0.265, 0],
    forendRaw: [-0.62, -0.52, 0],
    flashScale: 0.85
  };
}

function createFlutedCylinderBody(outerRadius, length, fluteCount = 6) {
  const shape = new THREE.Shape();
  const steps = 72;
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    const fluteWave = Math.cos(fluteCount * theta);
    const carve = fluteWave > 0.2 ? Math.pow((fluteWave - 0.2) / 0.8, 1.35) * 0.036 : 0;
    const r = outerRadius - carve;
    const x = Math.cos(theta) * r;
    const y = Math.sin(theta) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: length, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.008, bevelSegments: 2, curveSegments: 1
  });
  geom.translate(0, 0, -length * 0.5);
  geom.rotateY(Math.PI / 2);
  geom.computeVertexNormals();
  return geom;
}

function buildRevolverParts(materials) {
  const barrelPart = createPartGroup('canon');
  const cylinderPart = createPartGroup('tambor');
  const framePart = createPartGroup('armazon');
  const gripPart = createPartGroup('empunadura');
  const sightsPart = createPartGroup('mira');
  const mechPart = createPartGroup('mecanismo');

  const barrelAxisY = 0.39;
  const cylinderCenterX = -0.02;
  const cylinderCenterY = 0.265;
  const cylinderLength = 0.46;
  const cylinderRadius = 0.21;

  barrelPart.group.add(buildHollowBarrel({
    xStart: 0.24, yCenter: barrelAxisY, length: 1.42, outerRadiusStart: 0.095, outerRadiusEnd: 0.088,
    innerRadius: 0.048, steelMaterial: materials.bluedSteel, boreMaterial: materials.darkBore, crownChamfer: 0.02
  }));
  placeMesh(barrelPart.group, createExtrudedProfile([
    [0.24, 0.38], [1.64, 0.38], [1.64, 0.245], [1.58, 0.215], [0.32, 0.215], [0.24, 0.24]
  ], 0.14, { bevelThickness: 0.016, bevelSize: 0.014 }), materials.bluedSteel);
  placeMesh(barrelPart.group, createRoundedBox(1.22, 0.045, 0.172, 0.012, 0.006), materials.gunmetal, [0.95, 0.3, 0]);
  placeMesh(barrelPart.group, createRoundedBox(1.36, 0.036, 0.105, 0.008, 0.006), materials.bluedSteel, [0.95, 0.545, 0]);
  const postGeom = createRoundedBox(0.085, 0.09, 0.088, 0.008, 0.005);
  for (const px of [0.32, 0.64, 0.98, 1.32, 1.59]) {
    placeMesh(barrelPart.group, postGeom, materials.bluedSteel, [px, 0.495, 0]);
  }
  placeMesh(barrelPart.group, createCylinderX(0.085, 0.095, 0.06, 16), materials.chromeSteel, [0.225, barrelAxisY, 0]);

  placeMesh(cylinderPart.group, createFlutedCylinderBody(cylinderRadius, cylinderLength * 0.72, 6), materials.bluedSteel, [cylinderCenterX, cylinderCenterY, 0]);
  placeMesh(cylinderPart.group, createCylinderX(cylinderRadius, cylinderRadius, 0.095, 22), materials.bluedSteel, [cylinderCenterX - cylinderLength * 0.39, cylinderCenterY, 0]);
  placeMesh(cylinderPart.group, createCylinderX(cylinderRadius * 0.98, cylinderRadius, 0.065, 22), materials.bluedSteel, [cylinderCenterX + cylinderLength * 0.41, cylinderCenterY, 0]);
  placeMesh(cylinderPart.group, createCylinderX(0.042, 0.042, cylinderLength + 0.08, 12), materials.chromeSteel, [cylinderCenterX, cylinderCenterY, 0]);

  const chamberOrbit = 0.125;
  const rimGeom = createCylinderX(0.052, 0.052, 0.022, 12);
  const primerGeom = createCylinderX(0.02, 0.02, 0.026, 8);
  const boreHoleGeom = createCylinderX(0.047, 0.047, 0.03, 12);
  const bulletNoseGeom = createLatheAlongX([[0, 0.043], [0.045, 0.036], [0.075, 0.018], [0.085, 0.002]], 10);
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 2 + (i * Math.PI * 2) / 6;
    const cy = cylinderCenterY + Math.sin(angle) * chamberOrbit;
    const cz = Math.cos(angle) * chamberOrbit;
    placeMesh(cylinderPart.group, rimGeom, materials.brass, [cylinderCenterX - cylinderLength * 0.505, cy, cz]);
    placeMesh(cylinderPart.group, primerGeom, materials.chromeSteel, [cylinderCenterX - cylinderLength * 0.508, cy, cz]);
    placeMesh(cylinderPart.group, boreHoleGeom, materials.darkBore, [cylinderCenterX + cylinderLength * 0.485, cy, cz]);
    placeMesh(cylinderPart.group, bulletNoseGeom, materials.copperJacket, [cylinderCenterX + cylinderLength * 0.34, cy, cz]);
  }
  placeMesh(cylinderPart.group, createRoundedBox(0.16, 0.19, 0.075, 0.018, 0.008), materials.bluedSteel, [0.22, 0.12, 0]);

  placeMesh(framePart.group, createRoundedBox(0.86, 0.075, 0.18, 0.016, 0.01), materials.bluedSteel, [-0.12, 0.525, 0]);
  placeMesh(framePart.group, createExtrudedProfile([
    [-0.58, 0.52], [-0.27, 0.52], [-0.27, 0.02], [0.24, 0.02], [0.32, 0.16], [0.32, 0.52], [0.22, 0.52],
    [0.22, 0.04], [-0.25, 0.04], [-0.25, -0.04], [-0.45, -0.08], [-0.56, 0.02], [-0.68, 0.24], [-0.64, 0.44]
  ], 0.19, { bevelThickness: 0.018, bevelSize: 0.014 }), materials.bluedSteel);
  placeMesh(framePart.group, createCylinderX(0.205, 0.215, 0.12, 20), materials.bluedSteel, [-0.32, cylinderCenterY, 0]);
  placeMesh(framePart.group, createExtrudedProfile([
    [-0.52, 0.12], [0.24, 0.06], [0.22, -0.07], [-0.38, -0.14], [-0.56, -0.05]
  ], 0.175, { bevelThickness: 0.015, bevelSize: 0.012 }), materials.bluedSteel);

  const guardCurve = createCurvedTube([[-0.44, -0.14, 0], [-0.42, -0.28, 0], [-0.18, -0.34, 0], [0.08, -0.29, 0], [0.16, -0.16, 0], [0.14, -0.04, 0]], 0.028, 18, 8);
  guardCurve.scale(1, 1, 1.4);
  placeMesh(framePart.group, guardCurve, materials.bluedSteel);
  const screwGeom = createCylinderZ(0.022, 0.225, 10);
  placeMesh(framePart.group, screwGeom, materials.chromeSteel, [-0.42, 0.14, 0]);
  placeMesh(framePart.group, screwGeom, materials.chromeSteel, [-0.34, -0.02, 0]);
  placeMesh(framePart.group, screwGeom, materials.chromeSteel, [-0.08, -0.02, 0]);

  placeMesh(gripPart.group, createExtrudedProfile([
    [-0.58, 0.22], [-0.46, 0.12], [-0.46, -0.1], [-0.64, -0.45], [-0.76, -0.82],
    [-1.16, -0.78], [-1.08, -0.46], [-0.86, -0.06], [-0.68, 0.16]
  ], 0.15, { bevelThickness: 0.015, bevelSize: 0.012 }), materials.bluedSteel);
  placeMesh(gripPart.group, createExtrudedProfile([
    [-0.64, 0.18], [-0.48, 0.06], [-0.5, -0.16], [-0.64, -0.44], [-0.75, -0.85],
    [-1.18, -0.81], [-1.12, -0.52], [-0.95, -0.18], [-0.78, 0.08]
  ], 0.245, { bevelThickness: 0.032, bevelSize: 0.028 }), materials.woodWalnut);
  placeMesh(gripPart.group, createCylinderZ(0.042, 0.312, 12), materials.brass, [-0.74, -0.18, 0]);
  placeMesh(gripPart.group, createCylinderZ(0.024, 0.305, 10), materials.chromeSteel, [-0.88, -0.54, 0]);

  placeMesh(sightsPart.group, createRoundedBox(0.34, 0.055, 0.145, 0.008, 0.005), materials.gunmetal, [-0.36, 0.585, 0]);
  const rearBladeEar = createRoundedBox(0.045, 0.06, 0.052, 0.006, 0.003);
  placeMesh(sightsPart.group, rearBladeEar, materials.matteSteel, [-0.51, 0.625, 0.052]);
  placeMesh(sightsPart.group, rearBladeEar, materials.matteSteel, [-0.51, 0.625, -0.052]);
  placeMesh(sightsPart.group, createExtrudedProfile([
    [1.26, 0.56], [1.61, 0.56], [1.61, 0.68], [1.54, 0.68], [1.36, 0.61]
  ], 0.052, { bevelThickness: 0.006, bevelSize: 0.005 }), materials.bluedSteel);
  placeMesh(sightsPart.group, createRoundedBox(0.11, 0.052, 0.032, 0.005, 0.003), materials.sightRed, [1.47, 0.638, 0], [0, 0, 0.42]);

  placeMesh(mechPart.group, createExtrudedProfile([
    [-0.56, 0.3], [-0.46, 0.34], [-0.5, 0.5], [-0.64, 0.58], [-0.76, 0.58], [-0.75, 0.52], [-0.65, 0.48], [-0.61, 0.36]
  ], 0.072, { bevelThickness: 0.008, bevelSize: 0.006 }), materials.chromeSteel);
  placeMesh(mechPart.group, createExtrudedProfile([
    [-0.18, -0.02], [-0.08, -0.02], [-0.12, -0.14], [-0.06, -0.25], [-0.13, -0.265], [-0.21, -0.15]
  ], 0.062, { bevelThickness: 0.006, bevelSize: 0.006 }), materials.chromeSteel);
  placeMesh(mechPart.group, createCylinderX(0.028, 0.028, 0.72, 12), materials.chromeSteel, [0.64, 0.255, 0]);
  placeMesh(mechPart.group, createCylinderX(0.04, 0.036, 0.085, 12), materials.chromeSteel, [1.02, 0.255, 0]);
  placeMesh(mechPart.group, createRoundedBox(0.16, 0.09, 0.04, 0.015, 0.008), materials.gunmetal, [-0.46, 0.3, -0.118]);

  return {
    parts: [barrelPart, cylinderPart, framePart, gripPart, sightsPart, mechPart],
    slideIds: new Set(['mecanismo']),
    magIds: new Set(['tambor']),
    unitScale: 0.105,
    gripOrigin: [-0.80, -0.36, 0],
    muzzleRaw: [1.68, barrelAxisY, 0],
    forendRaw: [-0.68, -0.44, 0],
    flashScale: 1.05
  };
}

function buildShotgunShell(materials) {
  const shell = new THREE.Group();
  placeMesh(shell, new THREE.CylinderGeometry(0.088, 0.088, 0.44, 12), materials.shellRed, [0, 0.06, 0]);
  placeMesh(shell, new THREE.CylinderGeometry(0.072, 0.088, 0.04, 12), materials.shellRed, [0, 0.3, 0]);
  placeMesh(shell, new THREE.CylinderGeometry(0.091, 0.091, 0.16, 12), materials.brass, [0, -0.22, 0]);
  placeMesh(shell, new THREE.CylinderGeometry(0.104, 0.104, 0.025, 12), materials.brass, [0, -0.305, 0]);
  placeMesh(shell, new THREE.CylinderGeometry(0.028, 0.028, 0.015, 10), materials.chromeSteel, [0, -0.315, 0]);
  return shell;
}

function buildShotgunParts(materials) {
  const receiverPart = createPartGroup('cajon');
  const barrelPart = createPartGroup('canon');
  const magPart = createPartGroup('cargador');
  const pumpPart = createPartGroup('corredera');
  const stockPart = createPartGroup('culata');
  const sightsPart = createPartGroup('mira');

  const barrelY = 0.28;
  const magTubeY = 0.01;

  placeMesh(receiverPart.group, createExtrudedProfile([
    [-1.34, 0.26], [-1.08, 0.42], [0.58, 0.42], [0.64, 0.34], [0.64, -0.12], [0.52, -0.16], [-1.04, -0.16], [-1.34, -0.06]
  ], 0.36, { bevelThickness: 0.032, bevelSize: 0.028 }), materials.bluedSteel);
  placeMesh(receiverPart.group, createRoundedBox(0.84, 0.2, 0.055, 0.025, 0.008), materials.darkBore, [-0.04, 0.22, 0.19]);
  placeMesh(receiverPart.group, createRoundedBox(0.76, 0.165, 0.052, 0.02, 0.008), materials.chromeSteel, [-0.05, 0.22, 0.175]);
  placeMesh(receiverPart.group, new THREE.BoxGeometry(0.32, 0.032, 0.02), materials.matteSteel, [0.1, 0.24, 0.205]);
  placeMesh(receiverPart.group, createRoundedBox(0.86, 0.04, 0.22, 0.02, 0.006), materials.darkBore, [-0.06, -0.175, 0]);
  placeMesh(receiverPart.group, createRoundedBox(0.74, 0.026, 0.17, 0.014, 0.004), materials.chromeSteel, [-0.06, -0.155, 0]);

  const guardCurve = createCurvedTube([[-1.02, -0.18, 0], [-0.98, -0.45, 0], [-0.72, -0.5, 0], [-0.46, -0.44, 0], [-0.4, -0.18, 0]], 0.032, 18, 8);
  guardCurve.scale(1, 1, 1.5);
  placeMesh(receiverPart.group, guardCurve, materials.gunmetal);
  placeMesh(receiverPart.group, createExtrudedProfile([
    [-0.78, -0.15], [-0.68, -0.15], [-0.72, -0.32], [-0.65, -0.44], [-0.72, -0.45], [-0.82, -0.32]
  ], 0.065, { bevelThickness: 0.006, bevelSize: 0.005 }), materials.matteSteel);
  placeMesh(receiverPart.group, createRoundedBox(0.18, 0.05, 0.11, 0.012, 0.006), materials.matteSteel, [-1.19, 0.37, 0], [0, 0, 0.54]);
  placeMesh(receiverPart.group, new THREE.CylinderGeometry(0.018, 0.018, 0.015, 10), materials.sightRed, [-1.06, 0.435, 0]);
  const pinGeom = createCylinderZ(0.032, 0.42, 12);
  placeMesh(receiverPart.group, pinGeom, materials.matteSteel, [-0.88, -0.04, 0]);
  placeMesh(receiverPart.group, pinGeom, materials.matteSteel, [-0.46, -0.04, 0]);

  barrelPart.group.add(buildHollowBarrel({
    xStart: 0.56, yCenter: barrelY, length: 4.62, outerRadiusStart: 0.132, outerRadiusEnd: 0.118,
    innerRadius: 0.09, steelMaterial: materials.bluedSteel, boreMaterial: materials.darkBore, crownChamfer: 0.018
  }));
  placeMesh(barrelPart.group, createLatheAlongX([[4.96, 0.118], [5.0, 0.134], [5.22, 0.134], [5.24, 0.12], [5.24, 0.092], [5.04, 0.092]], 18), materials.gunmetal, [0, barrelY, 0]);

  const shieldShape = new THREE.Shape();
  const outerShieldR = 0.158;
  const innerShieldR = 0.138;
  const arcSpan = Math.PI * 0.64;
  const arcSegs = 16;
  for (let i = 0; i <= arcSegs; i++) {
    const a = -arcSpan + (i / arcSegs) * (arcSpan * 2);
    if (i === 0) shieldShape.moveTo(Math.sin(a) * outerShieldR, Math.cos(a) * outerShieldR);
    else shieldShape.lineTo(Math.sin(a) * outerShieldR, Math.cos(a) * outerShieldR);
  }
  for (let i = arcSegs; i >= 0; i--) {
    const a = -arcSpan + (i / arcSegs) * (arcSpan * 2);
    shieldShape.lineTo(Math.sin(a) * innerShieldR, Math.cos(a) * innerShieldR);
  }
  shieldShape.closePath();
  const shieldGeom = new THREE.ExtrudeGeometry(shieldShape, {
    depth: 3.04, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 2
  });
  shieldGeom.rotateY(Math.PI / 2);
  shieldGeom.computeVertexNormals();
  placeMesh(barrelPart.group, shieldGeom, materials.gunmetal, [0.86, barrelY + 0.006, 0]);

  const ventGeom = new THREE.CylinderGeometry(0.026, 0.026, 0.02, 8);
  for (let c = 0; c < 14; c++) {
    const vx = 1.04 + c * 0.205;
    for (let r = 0; r < 3; r++) {
      const ang = (r - 1) * 0.72;
      const rad = 0.153;
      placeMesh(barrelPart.group, ventGeom, materials.darkBore, [vx, barrelY + 0.012 + Math.cos(ang) * rad, Math.sin(ang) * rad], [ang, 0, 0]);
    }
  }
  const shieldClamp = createCylinderX(0.158, 0.158, 0.11, 16);
  placeMesh(barrelPart.group, shieldClamp, materials.matteSteel, [0.88, barrelY + 0.005, 0]);
  placeMesh(barrelPart.group, shieldClamp, materials.matteSteel, [3.88, barrelY + 0.005, 0]);
  placeMesh(barrelPart.group, createRoundedBox(0.24, 0.44, 0.26, 0.035, 0.014), materials.gunmetal, [4.38, 0.15, 0]);
  placeMesh(barrelPart.group, createCylinderZ(0.028, 0.3, 10), materials.chromeSteel, [4.38, 0.15, 0]);

  placeMesh(magPart.group, createCylinderX(0.112, 0.112, 4.18, 18), materials.bluedSteel, [2.62, magTubeY, 0]);
  placeMesh(magPart.group, createLatheAlongX([[4.66, 0.112], [4.7, 0.128], [4.9, 0.128], [4.94, 0.105], [4.94, 0.001]], 16), materials.gunmetal, [0, magTubeY, 0]);
  placeMesh(magPart.group, new THREE.TorusGeometry(0.055, 0.014, 6, 12), materials.matteSteel, [4.95, magTubeY - 0.03, 0], [0, Math.PI / 2, 0]);
  placeMesh(magPart.group, createRoundedBox(1.28, 0.34, 0.06, 0.02, 0.01), materials.anodizedAlloy, [-0.34, 0.14, -0.23]);
  placeMesh(magPart.group, createRoundedBox(1.24, 0.16, 0.14, 0.02, 0.008), materials.polymerDark, [-0.34, 0.14, -0.29]);
  for (let i = 0; i < 5; i++) {
    const shell = buildShotgunShell(materials);
    shell.position.set(-0.82 + i * 0.24, 0.18, -0.34);
    magPart.group.add(shell);
  }

  const pumpProfile = [];
  const pStart = 1.48;
  const pEnd = 3.44;
  pumpProfile.push([pStart, 0.12], [pStart + 0.08, 0.195], [pStart + 0.22, 0.215]);
  const grooveCount = 9;
  const gSpan = 1.46;
  const gStart = pStart + 0.26;
  for (let i = 0; i < grooveCount; i++) {
    const gx = gStart + (i / grooveCount) * gSpan;
    const step = gSpan / grooveCount;
    pumpProfile.push([gx, 0.218], [gx + step * 0.22, 0.186], [gx + step * 0.62, 0.186], [gx + step * 0.84, 0.218]);
  }
  pumpProfile.push([pEnd - 0.16, 0.215], [pEnd - 0.06, 0.185], [pEnd, 0.12]);
  placeMesh(pumpPart.group, createLatheAlongX(pumpProfile, 20), materials.polymerGrip, [0, magTubeY, 0]);
  const actionBar = createRoundedBox(1.12, 0.055, 0.025, 0.008, 0.004);
  placeMesh(pumpPart.group, actionBar, materials.chromeSteel, [1.05, magTubeY + 0.04, 0.145]);
  placeMesh(pumpPart.group, actionBar, materials.chromeSteel, [1.05, magTubeY + 0.04, -0.145]);

  placeMesh(stockPart.group, createExtrudedProfile([
    [-1.24, 0.24], [-1.24, -0.08], [-1.58, -0.26], [-1.88, -0.58], [-2.24, -0.58], [-2.58, -0.46],
    [-3.68, -0.78], [-4.76, -1.16], [-4.8, 0.08], [-3.12, 0.12], [-2.2, 0.08], [-1.66, 0.18]
  ], 0.3, { bevelThickness: 0.042, bevelSize: 0.036 }), materials.polymerDark);
  placeMesh(stockPart.group, createExtrudedProfile([
    [-1.52, -0.06], [-2.08, -0.48], [-2.34, -0.42], [-1.82, 0.02]
  ], 0.365, { bevelThickness: 0.012, bevelSize: 0.01 }), materials.polymerGrip);
  placeMesh(stockPart.group, createRoundedBox(0.22, 1.32, 0.375, 0.04, 0.022), materials.rubber, [-4.86, -0.54, 0], [0, 0, -0.04]);
  placeMesh(stockPart.group, new THREE.TorusGeometry(0.055, 0.014, 6, 12), materials.matteSteel, [-4.32, -1.06, 0], [0, Math.PI / 2, 0]);

  const topRail = buildPicatinnyRail({ length: 1.24, width: 0.2, height: 0.072, pitch: 0.1, material: materials.anodizedAlloy });
  topRail.position.set(-0.22, 0.445, 0);
  sightsPart.group.add(topRail);
  placeMesh(sightsPart.group, createRoundedBox(0.24, 0.075, 0.25, 0.012, 0.006), materials.gunmetal, [-0.88, 0.51, 0]);
  const ghostRing = new THREE.TorusGeometry(0.068, 0.016, 8, 16);
  ghostRing.rotateY(Math.PI / 2);
  placeMesh(sightsPart.group, ghostRing, materials.matteSteel, [-0.88, 0.62, 0]);
  const ghostWing = createRoundedBox(0.18, 0.17, 0.026, 0.01, 0.005);
  placeMesh(sightsPart.group, ghostWing, materials.gunmetal, [-0.88, 0.62, 0.11]);
  placeMesh(sightsPart.group, ghostWing, materials.gunmetal, [-0.88, 0.62, -0.11]);
  placeMesh(sightsPart.group, createExtrudedProfile([[4.66, 0.39], [5.04, 0.39], [5.04, 0.56], [4.94, 0.56], [4.76, 0.45]], 0.085, { bevelThickness: 0.008, bevelSize: 0.006 }), materials.gunmetal);
  const frontGuardWing = createRoundedBox(0.14, 0.16, 0.022, 0.008, 0.004);
  placeMesh(sightsPart.group, frontGuardWing, materials.gunmetal, [4.95, 0.54, 0.072]);
  placeMesh(sightsPart.group, frontGuardWing, materials.gunmetal, [4.95, 0.54, -0.072]);
  placeMesh(sightsPart.group, createCylinderX(0.018, 0.018, 0.16, 10), materials.sightRed, [4.96, 0.575, 0]);

  return {
    parts: [receiverPart, barrelPart, magPart, pumpPart, stockPart, sightsPart],
    slideIds: new Set(['corredera']),
    magIds: new Set(),
    unitScale: 0.094,
    gripOrigin: [-1.72, -0.34, 0],
    muzzleRaw: [5.28, barrelY, 0],
    forendRaw: [2.46, 0.01, 0],
    flashScale: 1.45
  };
}

function buildSmgParts(materials) {
  const receiverPart = createPartGroup('cajon');
  const barrelPart = createPartGroup('canon');
  const magPart = createPartGroup('cargador');
  const gripPart = createPartGroup('empunadura');
  const stockPart = createPartGroup('culata');
  const sightsPart = createPartGroup('mira');
  const barrelY = 0.24;

  placeMesh(receiverPart.group, createCylinderX(0.162, 0.162, 2.38, 18), materials.bluedSteel, [-0.36, 0.34, 0]);
  placeMesh(receiverPart.group, createRoundedBox(2.36, 0.34, 0.31, 0.025, 0.015), materials.bluedSteel, [-0.36, 0.17, 0]);
  placeMesh(receiverPart.group, createExtrudedProfile([
    [0.14, 0.12], [0.72, 0.14], [0.72, -0.22], [0.24, -0.26], [0.14, -0.14]
  ], 0.3, { bevelThickness: 0.018, bevelSize: 0.014 }), materials.bluedSteel);
  placeMesh(receiverPart.group, createRoundedBox(0.56, 0.16, 0.04, 0.018, 0.006), materials.darkBore, [-0.08, 0.26, 0.15]);
  placeMesh(receiverPart.group, createRoundedBox(0.5, 0.125, 0.045, 0.014, 0.006), materials.chromeSteel, [-0.08, 0.26, 0.14]);
  placeMesh(receiverPart.group, createCylinderX(0.095, 0.095, 1.56, 16), materials.gunmetal, [1.56, 0.42, 0]);
  placeMesh(receiverPart.group, createCylinderX(0.1, 0.085, 0.07, 16), materials.matteSteel, [2.36, 0.42, 0]);
  placeMesh(receiverPart.group, new THREE.BoxGeometry(0.62, 0.045, 0.03), materials.darkBore, [1.52, 0.43, -0.092]);
  placeMesh(receiverPart.group, createCylinderZ(0.032, 0.22, 10), materials.gunmetal, [1.76, 0.46, -0.18], [0.38, 0, 0]);
  placeMesh(receiverPart.group, createCylinderZ(0.052, 0.14, 12), materials.polymerGrip, [1.76, 0.5, -0.28], [0.38, 0, 0]);
  const guideRail = createRoundedBox(1.56, 0.078, 0.055, 0.01, 0.005);
  placeMesh(receiverPart.group, guideRail, materials.gunmetal, [-0.75, 0.18, 0.175]);
  placeMesh(receiverPart.group, guideRail, materials.gunmetal, [-0.75, 0.18, -0.175]);
  placeMesh(receiverPart.group, createRoundedBox(0.24, 0.46, 0.36, 0.035, 0.018), materials.gunmetal, [-1.54, 0.24, 0]);
  const pinGeom = createCylinderZ(0.032, 0.39, 12);
  placeMesh(receiverPart.group, pinGeom, materials.matteSteel, [-1.42, 0.12, 0]);
  placeMesh(receiverPart.group, pinGeom, materials.matteSteel, [0.16, 0.02, 0]);

  barrelPart.group.add(buildHollowBarrel({
    xStart: 0.72, yCenter: barrelY, length: 2.18, outerRadiusStart: 0.088, outerRadiusEnd: 0.078,
    innerRadius: 0.048, steelMaterial: materials.bluedSteel, boreMaterial: materials.darkBore, crownChamfer: 0.016
  }));
  placeMesh(barrelPart.group, createCylinderX(0.102, 0.095, 0.18, 14), materials.gunmetal, [2.72, barrelY, 0]);
  const lugGeom = new THREE.BoxGeometry(0.08, 0.042, 0.045);
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    placeMesh(barrelPart.group, lugGeom, materials.gunmetal, [2.72, barrelY + Math.sin(a) * 0.105, Math.cos(a) * 0.105], [a, 0, 0]);
  }
  placeMesh(barrelPart.group, createLatheAlongX([[2.85, 0.088], [2.9, 0.112], [3.24, 0.112], [3.28, 0.095], [3.28, 0.052], [2.92, 0.052]], 16), materials.gunmetal, [0, barrelY, 0]);
  const slotGeom = new THREE.BoxGeometry(0.19, 0.036, 0.23);
  placeMesh(barrelPart.group, slotGeom, materials.darkBore, [3.08, barrelY + 0.04, 0]);
  placeMesh(barrelPart.group, slotGeom, materials.darkBore, [3.08, barrelY - 0.04, 0]);
  placeMesh(barrelPart.group, new THREE.BoxGeometry(0.19, 0.23, 0.036), materials.darkBore, [3.08, barrelY, 0]);

  placeMesh(barrelPart.group, createExtrudedProfile([
    [0.72, 0.34], [2.16, 0.34], [2.24, 0.22], [2.14, 0.06], [1.46, 0.0], [0.72, -0.02]
  ], 0.33, { bevelThickness: 0.032, bevelSize: 0.028 }), materials.polymerDark);
  placeMesh(barrelPart.group, createRoundedBox(1.18, 0.14, 0.395, 0.025, 0.01), materials.polymerGrip, [1.44, 0.16, 0]);
  placeMesh(barrelPart.group, createExtrudedProfile([
    [2.22, 0.14], [2.52, 0.14], [2.52, 0.56], [2.28, 0.56], [2.22, 0.44]
  ], 0.2, { bevelThickness: 0.014, bevelSize: 0.012 }), materials.gunmetal);
  placeMesh(barrelPart.group, new THREE.TorusGeometry(0.075, 0.016, 6, 12), materials.matteSteel, [2.37, 0.32, -0.14], [0, Math.PI / 2, 0]);

  placeMesh(magPart.group, createExtrudedProfile([
    [0.29, -0.12], [0.64, -0.12], [0.69, -0.58], [0.82, -1.12], [0.98, -1.62], [0.64, -1.7], [0.48, -1.16], [0.35, -0.62]
  ], 0.175, { bevelThickness: 0.014, bevelSize: 0.012 }), materials.bluedSteel);
  placeMesh(magPart.group, createRoundedBox(0.39, 0.055, 0.215, 0.012, 0.008), materials.matteSteel, [0.81, -1.67, 0], [0, 0, 0.24]);
  placeMesh(magPart.group, createRoundedBox(0.06, 1.38, 0.208, 0.01, 0.005), materials.gunmetal, [0.58, -0.88, 0], [0, 0, 0.24]);

  placeMesh(gripPart.group, createExtrudedProfile([
    [-1.44, 0.05], [0.14, 0.05], [0.14, -0.1], [-0.1, -0.14], [-0.58, -0.16],
    [-0.84, -0.34], [-1.08, -1.04], [-1.52, -0.96], [-1.36, -0.34], [-1.44, -0.06]
  ], 0.26, { bevelThickness: 0.024, bevelSize: 0.02 }), materials.polymerDark);
  placeMesh(gripPart.group, createExtrudedProfile([[-1.32, -0.32], [-0.92, -0.34], [-1.08, -0.94], [-1.44, -0.88]], 0.305, { bevelThickness: 0.01, bevelSize: 0.01 }), materials.polymerGrip);

  const guardCurve = createCurvedTube([[-0.86, -0.44, 0], [-0.4, -0.45, 0], [-0.18, -0.41, 0], [-0.12, -0.25, 0], [-0.14, -0.08, 0]], 0.032, 18, 8);
  guardCurve.scale(1, 1, 1.45);
  placeMesh(gripPart.group, guardCurve, materials.polymerDark);
  placeMesh(gripPart.group, createExtrudedProfile([
    [-0.58, -0.12], [-0.48, -0.12], [-0.52, -0.26], [-0.45, -0.38], [-0.52, -0.39], [-0.62, -0.26]
  ], 0.06, { bevelThickness: 0.006, bevelSize: 0.005 }), materials.gunmetal);
  placeMesh(gripPart.group, createRoundedBox(0.065, 0.24, 0.09, 0.01, 0.006), materials.gunmetal, [0.16, -0.28, 0], [0, 0, -0.15]);
  placeMesh(gripPart.group, createCylinderZ(0.065, 0.32, 12), materials.polymerAccent, [-0.96, -0.1, 0]);
  const selectorLever = createRoundedBox(0.22, 0.052, 0.036, 0.01, 0.005);
  placeMesh(gripPart.group, selectorLever, materials.gunmetal, [-0.88, -0.08, 0.165], [0, 0, 0.35]);
  placeMesh(gripPart.group, selectorLever, materials.gunmetal, [-0.88, -0.08, -0.165], [0, 0, 0.35]);
  const dot = new THREE.BoxGeometry(0.025, 0.025, 0.01);
  placeMesh(gripPart.group, dot, materials.sightRed, [-0.83, -0.01, 0.155]);
  placeMesh(gripPart.group, dot, materials.sightRed, [-0.79, -0.06, 0.155]);

  const railBarGeom = createRoundedBox(1.88, 0.068, 0.038, 0.008, 0.004);
  placeMesh(stockPart.group, railBarGeom, materials.gunmetal, [-2.42, 0.18, 0.18]);
  placeMesh(stockPart.group, railBarGeom, materials.gunmetal, [-2.42, 0.18, -0.18]);
  placeMesh(stockPart.group, createRoundedBox(0.16, 0.07, 0.12, 0.012, 0.006), materials.matteSteel, [-1.54, -0.03, 0]);
  placeMesh(stockPart.group, createExtrudedProfile([
    [-3.18, 0.32], [-3.38, 0.32], [-3.45, 0.16], [-3.42, -0.12], [-3.48, -0.44], [-3.34, -0.54], [-3.18, -0.42], [-3.18, 0.06]
  ], 0.34, { bevelThickness: 0.028, bevelSize: 0.022 }), materials.rubber);
  placeMesh(stockPart.group, createRoundedBox(0.18, 0.32, 0.38, 0.02, 0.01), materials.gunmetal, [-3.24, 0.14, 0]);

  placeMesh(sightsPart.group, createRoundedBox(0.24, 0.11, 0.22, 0.015, 0.008), materials.gunmetal, [-1.18, 0.52, 0]);
  placeMesh(sightsPart.group, new THREE.CylinderGeometry(0.105, 0.105, 0.14, 14), materials.bluedSteel, [-1.18, 0.62, 0], [0, 0, -0.45]);
  const frontHood = new THREE.TorusGeometry(0.125, 0.022, 8, 16);
  frontHood.rotateY(Math.PI / 2);
  placeMesh(sightsPart.group, frontHood, materials.bluedSteel, [2.38, 0.68, 0]);
  placeMesh(sightsPart.group, new THREE.BoxGeometry(0.032, 0.125, 0.022), materials.gunmetal, [2.38, 0.62, 0]);
  placeMesh(sightsPart.group, new THREE.BoxGeometry(0.036, 0.026, 0.024), materials.sightGreen, [2.38, 0.68, 0]);
  placeMesh(sightsPart.group, createRoundedBox(0.95, 0.09, 0.26, 0.015, 0.008), materials.anodizedAlloy, [-0.26, 0.51, 0]);
  const topRail = buildPicatinnyRail({ length: 0.92, width: 0.21, height: 0.075, pitch: 0.1, material: materials.anodizedAlloy });
  topRail.position.set(-0.26, 0.555, 0);
  sightsPart.group.add(topRail);
  placeMesh(sightsPart.group, createRoundedBox(0.38, 0.1, 0.23, 0.012, 0.006), materials.anodizedAlloy, [-0.22, 0.67, 0]);
  placeMesh(sightsPart.group, createLatheAlongX([
    [-0.5, 0.135], [-0.56, 0.135], [-0.56, 0.155], [-0.44, 0.16], [-0.32, 0.138],
    [-0.08, 0.138], [0.02, 0.165], [0.14, 0.165], [0.14, 0.135], [0.06, 0.135]
  ], 18), materials.anodizedAlloy, [0, 0.85, 0]);
  const lensDisc = createCylinderX(0.132, 0.132, 0.02, 16);
  placeMesh(sightsPart.group, lensDisc, materials.opticGlass, [0.11, 0.85, 0]);
  placeMesh(sightsPart.group, lensDisc, materials.opticGlass, [-0.53, 0.85, 0]);
  placeMesh(sightsPart.group, new THREE.SphereGeometry(0.015, 8, 8), materials.sightRed, [-0.22, 0.85, 0]);
  placeMesh(sightsPart.group, new THREE.CylinderGeometry(0.048, 0.052, 0.06, 12), materials.gunmetal, [-0.22, 1.01, 0]);
  placeMesh(sightsPart.group, createCylinderZ(0.062, 0.07, 12), materials.gunmetal, [-0.22, 0.88, 0.15]);

  return {
    parts: [receiverPart, barrelPart, magPart, gripPart, stockPart, sightsPart],
    slideIds: new Set(),
    magIds: new Set(['cargador']),
    unitScale: 0.095,
    gripOrigin: [-1.18, -0.56, 0],
    muzzleRaw: [3.32, barrelY, 0],
    forendRaw: [1.45, 0.12, 0],
    flashScale: 0.92
  };
}

function buildAssaultRifleParts(materials) {
  const receiverPart = createPartGroup('cajon');
  const barrelPart = createPartGroup('canon');
  const magPart = createPartGroup('cargador');
  const gripPart = createPartGroup('empunadura');
  const stockPart = createPartGroup('culata');
  const sightsPart = createPartGroup('mira');
  const barrelY = 0.28;

  placeMesh(receiverPart.group, createRoundedBox(2.04, 0.34, 0.35, 0.03, 0.018), materials.anodizedAlloy, [-0.14, 0.28, 0]);
  const upperRail = buildPicatinnyRail({ length: 1.98, width: 0.21, height: 0.085, pitch: 0.1, material: materials.anodizedAlloy });
  upperRail.position.set(-0.14, 0.45, 0);
  receiverPart.group.add(upperRail);

  placeMesh(receiverPart.group, createExtrudedProfile([
    [-1.14, 0.14], [0.88, 0.14], [0.88, -0.1], [0.78, -0.34], [0.14, -0.34], [0.06, -0.14], [-0.92, -0.14], [-1.14, -0.02]
  ], 0.32, { bevelThickness: 0.018, bevelSize: 0.015 }), materials.anodizedAlloy);
  placeMesh(receiverPart.group, createRoundedBox(0.68, 0.075, 0.38, 0.02, 0.012), materials.gunmetal, [0.46, -0.325, 0]);
  placeMesh(receiverPart.group, createRoundedBox(0.68, 0.16, 0.05, 0.016, 0.006), materials.darkBore, [0.16, 0.28, 0.165]);
  placeMesh(receiverPart.group, createRoundedBox(0.62, 0.13, 0.05, 0.015, 0.006), materials.chromeSteel, [0.16, 0.28, 0.155]);
  placeMesh(receiverPart.group, createRoundedBox(0.68, 0.14, 0.026, 0.01, 0.004), materials.gunmetal, [0.16, 0.13, 0.19], [0.28, 0, 0]);
  placeMesh(receiverPart.group, createExtrudedProfile([[-0.46, 0.21], [-0.24, 0.21], [-0.29, 0.38], [-0.44, 0.38]], 0.11, { bevelThickness: 0.012, bevelSize: 0.01 }), materials.anodizedAlloy, [0, 0, 0.2]);
  placeMesh(receiverPart.group, createCylinderX(0.068, 0.062, 0.38, 12), materials.anodizedAlloy, [-0.66, 0.22, 0.2], [0, 0.28, 0]);
  placeMesh(receiverPart.group, createCylinderX(0.074, 0.065, 0.06, 12), materials.gunmetal, [-0.85, 0.22, 0.255], [0, 0.28, 0]);
  placeMesh(receiverPart.group, createRoundedBox(0.24, 0.055, 0.16, 0.01, 0.005), materials.gunmetal, [-1.18, 0.37, 0]);
  placeMesh(receiverPart.group, createRoundedBox(0.08, 0.075, 0.42, 0.015, 0.008), materials.matteSteel, [-1.3, 0.37, 0]);
  placeMesh(receiverPart.group, createRoundedBox(0.11, 0.22, 0.045, 0.012, 0.006), materials.gunmetal, [0.02, 0.05, -0.185]);
  placeMesh(receiverPart.group, createRoundedBox(0.11, 0.075, 0.04, 0.012, 0.006), materials.gunmetal, [0.1, -0.02, 0.18]);
  const pinGeom = createCylinderZ(0.032, 0.375, 12);
  placeMesh(receiverPart.group, pinGeom, materials.matteSteel, [-1.02, 0.08, 0]);
  placeMesh(receiverPart.group, pinGeom, materials.matteSteel, [0.78, 0.08, 0]);

  placeMesh(barrelPart.group, createCylinderX(0.19, 0.19, 0.16, 16), materials.gunmetal, [0.96, barrelY, 0]);
  const hgShape = new THREE.Shape();
  const hgR = 0.225;
  const hgCut = 0.145;
  hgShape.moveTo(-hgCut, -hgR);
  hgShape.lineTo(hgCut, -hgR);
  hgShape.lineTo(hgR, -hgCut);
  hgShape.lineTo(hgR, hgCut);
  hgShape.lineTo(hgCut, hgR);
  hgShape.lineTo(-hgCut, hgR);
  hgShape.lineTo(-hgR, hgCut);
  hgShape.lineTo(-hgR, -hgCut);
  hgShape.closePath();
  const hgLength = 2.22;
  const hgGeom = new THREE.ExtrudeGeometry(hgShape, { depth: hgLength, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.012, bevelSegments: 2 });
  hgGeom.rotateY(Math.PI / 2);
  placeMesh(barrelPart.group, hgGeom, materials.anodizedAlloy, [0.94, barrelY, 0]);

  const hgTopRail = buildPicatinnyRail({ length: hgLength - 0.04, width: 0.21, height: 0.085, pitch: 0.1, material: materials.anodizedAlloy });
  hgTopRail.position.set(0.94 + hgLength * 0.5, barrelY + 0.17, 0);
  barrelPart.group.add(hgTopRail);

  const slotGeom = createRoundedBox(0.24, 0.068, 0.025, 0.018, 0.004);
  for (let i = 0; i < 5; i++) {
    const sx = 1.24 + i * 0.38;
    placeMesh(barrelPart.group, slotGeom, materials.darkBore, [sx, barrelY, 0.232]);
    placeMesh(barrelPart.group, slotGeom, materials.darkBore, [sx, barrelY, -0.232]);
    placeMesh(barrelPart.group, slotGeom, materials.darkBore, [sx, barrelY + 0.145, 0.165], [Math.PI / 4, 0, 0]);
    placeMesh(barrelPart.group, slotGeom, materials.darkBore, [sx, barrelY + 0.145, -0.165], [-Math.PI / 4, 0, 0]);
  }
  placeMesh(barrelPart.group, createCylinderX(0.022, 0.022, 1.85, 8), materials.chromeSteel, [1.88, barrelY + 0.125, 0]);
  placeMesh(barrelPart.group, createRoundedBox(0.24, 0.24, 0.16, 0.02, 0.008), materials.gunmetal, [2.78, barrelY + 0.04, 0]);
  placeMesh(barrelPart.group, createExtrudedProfile([
    [1.76, 0.05], [2.58, 0.05], [2.64, -0.04], [2.44, -0.18], [1.88, -0.24], [1.72, -0.1]
  ], 0.22, { bevelThickness: 0.018, bevelSize: 0.016 }), materials.polymerGrip);

  barrelPart.group.add(buildHollowBarrel({
    xStart: 0.94, yCenter: barrelY, length: 2.8, outerRadiusStart: 0.095, outerRadiusEnd: 0.082,
    innerRadius: 0.042, steelMaterial: materials.bluedSteel, boreMaterial: materials.darkBore, crownChamfer: 0.014
  }));
  placeMesh(barrelPart.group, createLatheAlongX([
    [3.68, 0.082], [3.73, 0.105], [3.76, 0.092], [3.82, 0.112], [4.14, 0.112], [4.18, 0.096], [4.18, 0.055], [3.8, 0.055]
  ], 18), materials.gunmetal, [0, barrelY, 0]);
  const portCut = new THREE.BoxGeometry(0.18, 0.036, 0.235);
  placeMesh(barrelPart.group, portCut, materials.darkBore, [3.99, barrelY + 0.038, 0]);
  placeMesh(barrelPart.group, portCut, materials.darkBore, [3.99, barrelY - 0.038, 0]);
  placeMesh(barrelPart.group, new THREE.BoxGeometry(0.18, 0.13, 0.038), materials.darkBore, [3.99, barrelY + 0.075, 0]);

  placeMesh(magPart.group, createExtrudedProfile([
    [0.18, -0.22], [0.74, -0.22], [0.79, -0.78], [0.92, -1.32], [1.08, -1.78], [0.52, -1.92], [0.36, -1.42], [0.24, -0.82]
  ], 0.22, { bevelThickness: 0.016, bevelSize: 0.014 }), materials.polymerDark);
  const ribGeom = createRoundedBox(0.54, 0.042, 0.265, 0.008, 0.005);
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    placeMesh(magPart.group, ribGeom, materials.polymerAccent, [0.5 + t * 0.25, -0.62 - t * 0.94, 0], [0, 0, 0.22]);
  }
  placeMesh(magPart.group, createRoundedBox(0.14, 0.42, 0.262, 0.025, 0.006), materials.darkBore, [0.58, -1.04, 0], [0, 0, 0.22]);
  const brassBar = createCylinderZ(0.024, 0.258, 8);
  for (let i = 0; i < 4; i++) placeMesh(magPart.group, brassBar, materials.brass, [0.55 + i * 0.018, -0.92 - i * 0.08, 0]);
  placeMesh(magPart.group, createRoundedBox(0.62, 0.08, 0.285, 0.018, 0.01), materials.rubber, [0.81, -1.88, 0], [0, 0, 0.24]);

  placeMesh(gripPart.group, createExtrudedProfile([
    [-1.12, -0.02], [-0.64, -0.14], [-0.7, -0.32], [-0.96, -1.08], [-1.44, -1.0], [-1.26, -0.34], [-1.18, -0.12]
  ], 0.27, { bevelThickness: 0.025, bevelSize: 0.022 }), materials.polymerDark);
  placeMesh(gripPart.group, createExtrudedProfile([[-1.2, -0.28], [-0.78, -0.32], [-0.98, -0.96], [-1.36, -0.9]], 0.312, { bevelThickness: 0.01, bevelSize: 0.008 }), materials.polymerGrip);

  const guardCurve = createCurvedTube([[-0.72, -0.44, 0], [-0.28, -0.46, 0], [0.06, -0.42, 0], [0.14, -0.28, 0], [0.12, -0.12, 0]], 0.03, 16, 8);
  guardCurve.scale(1, 1, 1.5);
  placeMesh(gripPart.group, guardCurve, materials.anodizedAlloy);
  placeMesh(gripPart.group, createRoundedBox(0.055, 0.28, 0.065, 0.01, 0.005), materials.matteSteel, [-0.42, -0.26, 0], [0, 0, 0.14]);
  placeMesh(gripPart.group, createCylinderZ(0.052, 0.365, 12), materials.gunmetal, [-0.78, -0.02, 0]);
  const selArm = createRoundedBox(0.18, 0.048, 0.032, 0.008, 0.004);
  placeMesh(gripPart.group, selArm, materials.gunmetal, [-0.72, -0.02, 0.185], [0, 0, -0.25]);
  placeMesh(gripPart.group, selArm, materials.gunmetal, [-0.72, -0.02, -0.185], [0, 0, -0.25]);

  placeMesh(stockPart.group, createCylinderX(0.185, 0.185, 0.14, 14), materials.gunmetal, [-1.22, 0.25, 0]);
  placeMesh(stockPart.group, createCylinderX(0.148, 0.148, 2.55, 16), materials.anodizedAlloy, [-2.52, 0.25, 0]);
  placeMesh(stockPart.group, createRoundedBox(2.2, 0.08, 0.09, 0.01, 0.005), materials.gunmetal, [-2.42, 0.1, 0]);
  placeMesh(stockPart.group, createExtrudedProfile([
    [-2.24, 0.42], [-4.12, 0.42], [-4.18, -0.82], [-3.94, -0.86], [-2.96, -0.44], [-2.38, -0.12], [-2.24, 0.06]
  ], 0.34, { bevelThickness: 0.028, bevelSize: 0.024 }), materials.polymerDark);
  const cheekPod = createCylinderX(0.125, 0.125, 1.72, 12);
  placeMesh(stockPart.group, cheekPod, materials.polymerAccent, [-3.18, 0.2, 0.185]);
  placeMesh(stockPart.group, cheekPod, materials.polymerAccent, [-3.18, 0.2, -0.185]);
  placeMesh(stockPart.group, createRoundedBox(0.56, 0.1, 0.16, 0.015, 0.008), materials.polymerGrip, [-2.95, -0.18, 0], [0, 0, 0.42]);
  placeMesh(stockPart.group, createRoundedBox(0.11, 0.46, 0.42, 0.025, 0.008), materials.darkBore, [-3.84, -0.3, 0]);
  placeMesh(stockPart.group, createRoundedBox(0.14, 1.24, 0.39, 0.035, 0.018), materials.rubber, [-4.19, -0.21, 0], [0, 0, -0.04]);

  placeMesh(sightsPart.group, createRoundedBox(0.92, 0.13, 0.32, 0.018, 0.01), materials.anodizedAlloy, [-0.04, 0.59, 0]);
  placeMesh(sightsPart.group, createRoundedBox(0.36, 0.22, 0.33, 0.035, 0.014), materials.polymerDark, [0.22, 0.72, 0]);
  placeMesh(sightsPart.group, createCylinderZ(0.085, 0.355, 12), materials.gunmetal, [0.26, 0.73, 0]);

  const hoodShape = new THREE.Shape();
  [[-0.17, 0], [0.17, 0], [0.15, 0.34], [0.1, 0.41], [-0.1, 0.41], [-0.15, 0.34]].forEach(([z, y], idx) => {
    if (idx === 0) hoodShape.moveTo(z, y);
    else hoodShape.lineTo(z, y);
  });
  hoodShape.closePath();
  const windowHole = new THREE.Path();
  [[-0.115, 0.05], [0.115, 0.05], [0.1, 0.31], [0.068, 0.355], [-0.068, 0.355], [-0.1, 0.31]].forEach(([z, y], idx) => {
    if (idx === 0) windowHole.moveTo(z, y);
    else windowHole.lineTo(z, y);
  });
  windowHole.closePath();
  hoodShape.holes.push(windowHole);
  const hoodGeom = new THREE.ExtrudeGeometry(hoodShape, { depth: 0.46, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 2 });
  hoodGeom.translate(0, 0, -0.23);
  hoodGeom.rotateY(Math.PI / 2);
  placeMesh(sightsPart.group, hoodGeom, materials.anodizedAlloy, [-0.22, 0.62, 0]);
  placeMesh(sightsPart.group, new THREE.BoxGeometry(0.018, 0.28, 0.21), materials.opticGlass, [-0.14, 0.82, 0], [0, 0, -0.1]);
  const reticleRing = new THREE.TorusGeometry(0.052, 0.006, 6, 16);
  reticleRing.rotateY(Math.PI / 2);
  placeMesh(sightsPart.group, reticleRing, materials.sightRed, [-0.16, 0.82, 0]);
  placeMesh(sightsPart.group, new THREE.SphereGeometry(0.011, 8, 8), materials.sightRed, [-0.16, 0.82, 0]);

  placeMesh(sightsPart.group, createRoundedBox(0.24, 0.08, 0.25, 0.012, 0.006), materials.gunmetal, [-0.98, 0.56, 0]);
  const rearAperture = new THREE.TorusGeometry(0.062, 0.016, 6, 12);
  rearAperture.rotateY(Math.PI / 2);
  placeMesh(sightsPart.group, rearAperture, materials.gunmetal, [-0.96, 0.67, 0]);
  placeMesh(sightsPart.group, createRoundedBox(0.22, 0.08, 0.25, 0.012, 0.006), materials.gunmetal, [2.98, 0.56, 0]);
  const frontWing = createRoundedBox(0.055, 0.16, 0.032, 0.008, 0.004);
  placeMesh(sightsPart.group, frontWing, materials.gunmetal, [3.0, 0.68, 0.068]);
  placeMesh(sightsPart.group, frontWing, materials.gunmetal, [3.0, 0.68, -0.068]);
  placeMesh(sightsPart.group, new THREE.BoxGeometry(0.028, 0.11, 0.022), materials.sightGreen, [3.0, 0.66, 0]);

  return {
    parts: [receiverPart, barrelPart, magPart, gripPart, stockPart, sightsPart],
    slideIds: new Set(),
    magIds: new Set(['cargador']),
    unitScale: 0.097,
    gripOrigin: [-1.04, -0.56, 0],
    muzzleRaw: [4.22, barrelY, 0],
    forendRaw: [2.10, -0.04, 0],
    flashScale: 1.08
  };
}

function buildClassicRifleParts(materials) {
  const receiverPart = createPartGroup('cajon');
  const barrelPart = createPartGroup('canon');
  const handguardPart = createPartGroup('guardamanos');
  const magPart = createPartGroup('cargador');
  const gripPart = createPartGroup('empunadura');
  const stockPart = createPartGroup('culata');
  const sightsPart = createPartGroup('mira');
  const boltCarrierPart = createPartGroup('corredera');
  const barrelY = 0.25;

  placeMesh(receiverPart.group, createRoundedBox(2.56, 0.38, 0.34, 0.02, 0.014), materials.bluedSteel, [-0.34, 0.08, 0]);
  placeMesh(receiverPart.group, createRoundedBox(0.28, 0.095, 0.362, 0.038, 0.008), materials.gunmetal, [0.32, 0.04, 0]);
  const rivetGeom = createCylinderZ(0.022, 0.378, 8);
  for (const [rx, ry] of [[-1.46, 0.16], [-1.46, 0.0], [-0.78, -0.02], [-0.45, -0.02], [0.68, 0.18], [0.72, 0.02]]) {
    placeMesh(receiverPart.group, rivetGeom, materials.matteSteel, [rx, ry, 0]);
  }

  const dustCoverCross = new THREE.Shape();
  dustCoverCross.moveTo(-0.16, 0.25);
  dustCoverCross.lineTo(0.16, 0.25);
  dustCoverCross.lineTo(0.15, 0.39);
  dustCoverCross.quadraticCurveTo(0, 0.48, -0.15, 0.39);
  dustCoverCross.closePath();
  const dustCoverGeom = new THREE.ExtrudeGeometry(dustCoverCross, { depth: 2.06, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.01, bevelSegments: 2 });
  dustCoverGeom.rotateY(Math.PI / 2);
  placeMesh(receiverPart.group, dustCoverGeom, materials.bluedSteel, [-1.58, 0, 0]);
  const coverRibGeom = createRoundedBox(0.055, 0.14, 0.345, 0.02, 0.008);
  for (const x of [-1.22, -0.82, -0.42]) placeMesh(receiverPart.group, coverRibGeom, materials.gunmetal, [x, 0.38, 0]);
  placeMesh(receiverPart.group, createRoundedBox(0.1, 0.095, 0.09, 0.014, 0.008), materials.matteSteel, [-1.63, 0.34, 0]);
  placeMesh(receiverPart.group, createRoundedBox(0.92, 0.12, 0.04, 0.014, 0.004), materials.darkBore, [0.02, 0.3, 0.158]);

  placeMesh(boltCarrierPart.group, createRoundedBox(0.76, 0.105, 0.055, 0.015, 0.006), materials.chromeSteel, [0.08, 0.3, 0.155]);
  placeMesh(boltCarrierPart.group, createCurvedTube([[0.24, 0.3, 0.16], [0.24, 0.3, 0.32], [0.24, 0.37, 0.42]], 0.036, 10, 8), materials.chromeSteel);

  placeMesh(receiverPart.group, createExtrudedProfile([
    [-1.34, 0.17], [-1.24, 0.24], [-0.1, 0.2], [0.08, 0.14], [0.06, 0.07], [-0.14, 0.12], [-1.26, 0.12]
  ], 0.026, { bevelThickness: 0.005, bevelSize: 0.004 }), materials.gunmetal, [0, 0, 0.19]);
  placeMesh(receiverPart.group, createRoundedBox(0.11, 0.068, 0.065, 0.01, 0.005), materials.gunmetal, [0.01, 0.11, 0.22]);

  barrelPart.group.add(buildHollowBarrel({
    xStart: 0.9, yCenter: barrelY, length: 3.24, outerRadiusStart: 0.096, outerRadiusEnd: 0.076,
    innerRadius: 0.044, steelMaterial: materials.bluedSteel, boreMaterial: materials.darkBore, crownChamfer: 0.014
  }));
  placeMesh(barrelPart.group, createCylinderX(0.098, 0.098, 0.16, 16), materials.gunmetal, [4.16, barrelY, 0]);

  const scoopShape = new THREE.Shape();
  const bOut = 0.096;
  const bIn = 0.062;
  const scoopSegs = 12;
  for (let i = 0; i <= scoopSegs; i++) {
    const a = Math.PI + (i / scoopSegs) * Math.PI;
    if (i === 0) scoopShape.moveTo(Math.cos(a) * bOut, Math.sin(a) * bOut);
    else scoopShape.lineTo(Math.cos(a) * bOut, Math.sin(a) * bOut);
  }
  for (let i = scoopSegs; i >= 0; i--) {
    const a = Math.PI + (i / scoopSegs) * Math.PI;
    scoopShape.lineTo(Math.cos(a) * bIn, Math.sin(a) * bIn);
  }
  scoopShape.closePath();
  const scoopGeom = new THREE.ExtrudeGeometry(scoopShape, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 2 });
  scoopGeom.rotateY(Math.PI / 2);
  scoopGeom.computeVertexNormals();
  placeMesh(barrelPart.group, scoopGeom, materials.gunmetal, [4.21, barrelY, 0]);
  placeMesh(barrelPart.group, createCylinderX(0.06, 0.06, 0.18, 12), materials.darkBore, [4.18, barrelY, 0]);

  placeMesh(barrelPart.group, createCylinderX(0.088, 0.088, 1.96, 14), materials.bluedSteel, [1.88, 0.48, 0]);
  placeMesh(barrelPart.group, createExtrudedProfile([[2.72, 0.15], [3.04, 0.15], [3.04, 0.34], [2.9, 0.56], [2.72, 0.56]], 0.175, { bevelThickness: 0.014, bevelSize: 0.012 }), materials.gunmetal);
  placeMesh(barrelPart.group, createCylinderX(0.022, 0.022, 2.75, 8), materials.matteSteel, [2.42, 0.125, 0]);
  placeMesh(barrelPart.group, createCylinderX(0.036, 0.028, 0.1, 10), materials.matteSteel, [3.8, 0.125, 0]);
  placeMesh(barrelPart.group, createExtrudedProfile([[3.74, 0.08], [4.04, 0.08], [4.04, 0.34], [3.96, 0.72], [3.82, 0.72], [3.74, 0.34]], 0.145, { bevelThickness: 0.012, bevelSize: 0.01 }), materials.gunmetal);
  placeMesh(barrelPart.group, new THREE.TorusGeometry(0.068, 0.016, 6, 12), materials.matteSteel, [2.38, 0.24, -0.17], [0, Math.PI / 2, 0]);

  placeMesh(handguardPart.group, createExtrudedProfile([
    [0.94, 0.34], [2.34, 0.34], [2.34, 0.08], [1.82, 0.0], [1.36, -0.02], [0.94, 0.0]
  ], 0.32, { bevelThickness: 0.036, bevelSize: 0.03 }), materials.woodLaminate);
  placeMesh(handguardPart.group, createRoundedBox(0.92, 0.12, 0.405, 0.04, 0.018), materials.woodLaminate, [1.56, 0.18, 0]);
  placeMesh(handguardPart.group, createCylinderX(0.145, 0.14, 1.32, 16), materials.woodLaminate, [1.64, 0.48, 0]);
  placeMesh(handguardPart.group, createRoundedBox(0.11, 0.34, 0.36, 0.02, 0.01), materials.bluedSteel, [2.38, 0.22, 0]);
  const upperFerrule = createCylinderX(0.135, 0.135, 0.09, 14);
  placeMesh(handguardPart.group, upperFerrule, materials.bluedSteel, [2.32, 0.48, 0]);
  placeMesh(handguardPart.group, upperFerrule, materials.bluedSteel, [0.98, 0.48, 0]);

  placeMesh(magPart.group, createExtrudedProfile([
    [0.02, -0.06], [0.64, -0.06], [0.74, -0.58], [0.96, -1.16], [1.26, -1.68],
    [1.56, -2.06], [0.98, -2.26], [0.64, -1.78], [0.32, -1.18], [0.12, -0.6]
  ], 0.23, { bevelThickness: 0.016, bevelSize: 0.014 }), materials.bluedSteel);
  placeMesh(magPart.group, createCurvedTube([[0.65, -0.1, 0], [0.86, -0.92, 0], [1.24, -1.66, 0], [1.54, -2.06, 0]], 0.045, 14, 8), materials.gunmetal);
  const magRibGeom = createRoundedBox(0.045, 0.52, 0.278, 0.008, 0.005);
  for (const [rx, ry, rot] of [[0.44, -0.64, 0.28], [0.68, -1.18, 0.42], [0.98, -1.7, 0.56]]) {
    placeMesh(magPart.group, magRibGeom, materials.gunmetal, [rx, ry, 0], [0, 0, rot]);
  }
  placeMesh(magPart.group, createRoundedBox(0.68, 0.065, 0.275, 0.012, 0.008), materials.matteSteel, [1.28, -2.18, 0], [0, 0, 0.58]);

  placeMesh(gripPart.group, createExtrudedProfile([
    [-1.24, -0.09], [-0.84, -0.09], [-0.92, -0.34], [-1.18, -1.08], [-1.56, -1.0], [-1.34, -0.32]
  ], 0.24, { bevelThickness: 0.025, bevelSize: 0.022 }), materials.bakelite);
  placeMesh(gripPart.group, createRoundedBox(0.42, 0.06, 0.28, 0.012, 0.006), materials.gunmetal, [-1.04, -0.12, 0]);
  const guardCurve = createCurvedTube([[-0.86, -0.38, 0], [-0.5, -0.44, 0], [-0.22, -0.4, 0], [-0.14, -0.24, 0], [-0.12, -0.08, 0]], 0.028, 16, 8);
  guardCurve.scale(1, 1, 1.5);
  placeMesh(gripPart.group, guardCurve, materials.bluedSteel);
  placeMesh(gripPart.group, createExtrudedProfile([
    [-0.64, -0.09], [-0.54, -0.09], [-0.58, -0.24], [-0.5, -0.36], [-0.57, -0.37], [-0.68, -0.24]
  ], 0.062, { bevelThickness: 0.006, bevelSize: 0.005 }), materials.gunmetal);
  placeMesh(gripPart.group, createRoundedBox(0.065, 0.28, 0.095, 0.01, 0.005), materials.gunmetal, [-0.04, -0.25, 0], [0, 0, -0.18]);

  placeMesh(stockPart.group, createExtrudedProfile([
    [-1.6, 0.26], [-1.6, -0.09], [-2.28, -0.26], [-3.32, -0.68], [-4.34, -1.16], [-4.38, 0.02], [-3.18, 0.1], [-2.14, 0.22]
  ], 0.29, { bevelThickness: 0.036, bevelSize: 0.03 }), materials.woodLaminate);
  placeMesh(stockPart.group, createRoundedBox(0.09, 1.24, 0.355, 0.03, 0.014), materials.bluedSteel, [-4.38, -0.57, 0], [0, 0, -0.04]);
  placeMesh(stockPart.group, new THREE.TorusGeometry(0.072, 0.016, 6, 12), materials.matteSteel, [-3.94, -1.04, 0], [0, Math.PI / 2, 0]);

  placeMesh(sightsPart.group, createExtrudedProfile([[0.46, 0.26], [0.98, 0.26], [0.98, 0.56], [0.74, 0.58], [0.46, 0.48]], 0.24, { bevelThickness: 0.014, bevelSize: 0.012 }), materials.bluedSteel);
  placeMesh(sightsPart.group, createRoundedBox(0.56, 0.048, 0.12, 0.008, 0.005), materials.matteSteel, [0.68, 0.57, 0], [0, 0, 0.16]);
  placeMesh(sightsPart.group, createRoundedBox(0.11, 0.07, 0.165, 0.01, 0.005), materials.gunmetal, [0.58, 0.56, 0]);
  const frontHood = new THREE.TorusGeometry(0.115, 0.022, 8, 16, Math.PI * 1.45);
  frontHood.rotateZ(-Math.PI * 0.225);
  frontHood.rotateY(Math.PI / 2);
  placeMesh(sightsPart.group, frontHood, materials.gunmetal, [3.89, 0.81, 0]);
  placeMesh(sightsPart.group, new THREE.CylinderGeometry(0.018, 0.022, 0.14, 8), materials.matteSteel, [3.89, 0.77, 0]);

  return {
    parts: [receiverPart, boltCarrierPart, barrelPart, handguardPart, magPart, gripPart, stockPart, sightsPart],
    slideIds: new Set(['corredera']),
    magIds: new Set(['cargador']),
    unitScale: 0.097,
    gripOrigin: [-1.18, -0.56, 0],
    muzzleRaw: [4.46, barrelY, 0],
    forendRaw: [1.64, 0.14, 0],
    flashScale: 1.15
  };
}

function buildSniperRifleParts(materials) {
  const chassisPart = createPartGroup('chasis');
  const boltPart = createPartGroup('cerrojo');
  const barrelPart = createPartGroup('canon');
  const scopePart = createPartGroup('mira');
  const magPart = createPartGroup('cargador');
  const stockPart = createPartGroup('culata');
  const bipodPart = createPartGroup('bipode');
  const barrelY = 0.26;
  const scopeY = 0.9;

  placeMesh(chassisPart.group, createExtrudedProfile([
    [-1.25, 0.24], [1.08, 0.24], [1.08, -0.14], [0.98, -0.28], [-0.12, -0.28], [-0.22, -0.16], [-1.25, -0.16]
  ], 0.36, { bevelThickness: 0.022, bevelSize: 0.018 }), materials.anodizedAlloy);
  placeMesh(chassisPart.group, createRoundedBox(2.12, 0.24, 0.42, 0.025, 0.012), materials.polymerAccent, [-0.1, 0.02, 0]);

  const fgShape = new THREE.Shape();
  const rOut = 0.245;
  const rCut = 0.16;
  fgShape.moveTo(-rCut, -rOut);
  fgShape.lineTo(rCut, -rOut);
  fgShape.lineTo(rOut, -rCut);
  fgShape.lineTo(rOut, rCut);
  fgShape.lineTo(rCut, rOut);
  fgShape.lineTo(-rCut, rOut);
  fgShape.lineTo(-rOut, rCut);
  fgShape.lineTo(-rOut, -rCut);
  fgShape.closePath();
  const fgGeom = new THREE.ExtrudeGeometry(fgShape, { depth: 2.42, bevelEnabled: true, bevelThickness: 0.016, bevelSize: 0.014, bevelSegments: 2 });
  fgGeom.rotateY(Math.PI / 2);
  placeMesh(chassisPart.group, fgGeom, materials.anodizedAlloy, [1.05, barrelY - 0.02, 0]);

  const fullTopRail = buildPicatinnyRail({ length: 4.54, width: 0.21, height: 0.088, pitch: 0.1, material: materials.anodizedAlloy });
  fullTopRail.position.set(1.16, 0.47, 0);
  chassisPart.group.add(fullTopRail);

  const bipodRail = buildPicatinnyRail({ length: 0.72, width: 0.2, height: 0.072, pitch: 0.1, material: materials.gunmetal });
  bipodRail.rotation.x = Math.PI;
  bipodRail.position.set(3.02, barrelY - 0.27, 0);
  chassisPart.group.add(bipodRail);

  const ventSlot = createRoundedBox(0.28, 0.078, 0.028, 0.02, 0.005);
  for (let i = 0; i < 6; i++) {
    const sx = 1.32 + i * 0.37;
    placeMesh(chassisPart.group, ventSlot, materials.darkBore, [sx, barrelY - 0.02, 0.25]);
    placeMesh(chassisPart.group, ventSlot, materials.darkBore, [sx, barrelY - 0.02, -0.25]);
    placeMesh(chassisPart.group, ventSlot, materials.darkBore, [sx, barrelY + 0.145, 0.18], [Math.PI / 4, 0, 0]);
    placeMesh(chassisPart.group, ventSlot, materials.darkBore, [sx, barrelY + 0.145, -0.18], [-Math.PI / 4, 0, 0]);
  }

  placeMesh(chassisPart.group, createExtrudedProfile([
    [-1.18, -0.12], [-0.7, -0.15], [-0.72, -0.34], [-0.86, -1.06], [-1.36, -1.04], [-1.24, -0.34]
  ], 0.28, { bevelThickness: 0.026, bevelSize: 0.022 }), materials.polymerGrip);
  placeMesh(chassisPart.group, createRoundedBox(0.56, 0.075, 0.36, 0.025, 0.012), materials.polymerAccent, [-1.11, -1.04, 0]);
  const guardCurve = createCurvedTube([[-0.74, -0.46, 0], [-0.36, -0.49, 0], [-0.14, -0.44, 0], [-0.1, -0.26, 0], [-0.12, -0.14, 0]], 0.032, 16, 8);
  guardCurve.scale(1, 1, 1.5);
  placeMesh(chassisPart.group, guardCurve, materials.anodizedAlloy);
  placeMesh(chassisPart.group, createRoundedBox(0.045, 0.28, 0.06, 0.008, 0.004), materials.chromeSteel, [-0.5, -0.3, 0], [0, 0, 0.08]);
  placeMesh(chassisPart.group, createRoundedBox(0.065, 0.2, 0.1, 0.01, 0.005), materials.gunmetal, [-0.04, -0.32, 0], [0, 0, -0.12]);

  const actionCross = new THREE.Shape();
  actionCross.moveTo(-0.18, 0.12);
  actionCross.lineTo(0.18, 0.12);
  actionCross.lineTo(0.195, 0.34);
  actionCross.lineTo(0.12, 0.46);
  actionCross.lineTo(-0.12, 0.46);
  actionCross.lineTo(-0.195, 0.34);
  actionCross.closePath();
  const actionGeom = new THREE.ExtrudeGeometry(actionCross, { depth: 2.3, bevelEnabled: true, bevelThickness: 0.016, bevelSize: 0.012, bevelSegments: 2 });
  actionGeom.rotateY(Math.PI / 2);
  placeMesh(chassisPart.group, actionGeom, materials.bluedSteel, [-1.24, 0, 0]);
  placeMesh(chassisPart.group, createRoundedBox(0.86, 0.18, 0.06, 0.022, 0.008), materials.darkBore, [0.1, 0.29, 0.18]);

  placeMesh(boltPart.group, createCylinderX(0.095, 0.095, 1.92, 16), materials.chromeSteel, [-0.14, 0.28, 0.04]);
  const boltFlute = createRoundedBox(0.68, 0.022, 0.025, 0.006, 0.002);
  placeMesh(boltPart.group, boltFlute, materials.matteSteel, [0.1, 0.33, 0.135]);
  placeMesh(boltPart.group, boltFlute, materials.matteSteel, [0.1, 0.28, 0.145]);
  placeMesh(boltPart.group, boltFlute, materials.matteSteel, [0.1, 0.23, 0.135]);
  placeMesh(boltPart.group, createLatheAlongX([[-1.44, 0.001], [-1.44, 0.078], [-1.38, 0.112], [-1.18, 0.118], [-1.18, 0.001]], 14), materials.gunmetal, [0, 0.28, 0]);
  placeMesh(boltPart.group, createCylinderX(0.024, 0.024, 0.05, 8), materials.sightRed, [-1.45, 0.28, 0]);
  placeMesh(boltPart.group, createCurvedTube([[-0.98, 0.28, 0.12], [-1.02, 0.26, 0.32], [-1.12, 0.14, 0.42], [-1.18, 0.02, 0.44]], 0.036, 12, 8), materials.gunmetal);
  placeMesh(boltPart.group, createLatheAlongX([[0, 0.038], [0.05, 0.064], [0.14, 0.082], [0.2, 0.072], [0.24, 0.038], [0.25, 0.001]], 14), materials.polymerGrip, [-1.18, 0.02, 0.44], [0, 0, -1.98]);

  barrelPart.group.add(buildHollowBarrel({
    xStart: 1.02, yCenter: barrelY, length: 4.94, outerRadiusStart: 0.135, outerRadiusEnd: 0.106,
    innerRadius: 0.048, steelMaterial: materials.bluedSteel, boreMaterial: materials.darkBore, crownChamfer: 0.018
  }));
  const fluteGeom = createRoundedBox(2.12, 0.028, 0.024, 0.01, 0.004);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI * 2) / 6;
    placeMesh(barrelPart.group, fluteGeom, materials.matteSteel, [4.62, barrelY + Math.sin(a) * 0.108, Math.cos(a) * 0.108], [a, 0, 0]);
  }
  placeMesh(barrelPart.group, createCylinderX(0.132, 0.132, 0.14, 14), materials.gunmetal, [5.95, barrelY, 0]);
  placeMesh(barrelPart.group, createRoundedBox(0.84, 0.24, 0.34, 0.028, 0.014), materials.gunmetal, [6.39, barrelY, 0]);
  const bafflePort = createRoundedBox(0.15, 0.16, 0.365, 0.02, 0.006);
  for (const bx of [6.15, 6.38, 6.61]) placeMesh(barrelPart.group, bafflePort, materials.darkBore, [bx, barrelY, 0], [0, 0.22, 0]);
  placeMesh(barrelPart.group, createCylinderX(0.062, 0.062, 0.08, 12), materials.darkBore, [6.79, barrelY, 0]);

  placeMesh(scopePart.group, createRoundedBox(1.48, 0.11, 0.25, 0.015, 0.008), materials.anodizedAlloy, [0.06, 0.56, 0]);
  for (const rx of [-0.48, 0.58]) {
    placeMesh(scopePart.group, createRoundedBox(0.24, 0.22, 0.22, 0.015, 0.008), materials.anodizedAlloy, [rx, 0.69, 0]);
    placeMesh(scopePart.group, createCylinderX(0.185, 0.185, 0.24, 16), materials.gunmetal, [rx, scopeY, 0]);
    placeMesh(scopePart.group, createRoundedBox(0.22, 0.07, 0.42, 0.012, 0.005), materials.gunmetal, [rx, scopeY, 0]);
    const screw = createCylinderX(0.016, 0.016, 0.25, 8);
    placeMesh(scopePart.group, screw, materials.chromeSteel, [rx, scopeY + 0.01, 0.195]);
    placeMesh(scopePart.group, screw, materials.chromeSteel, [rx, scopeY + 0.01, -0.195]);
  }
  placeMesh(scopePart.group, createLatheAlongX([
    [-1.84, 0.175], [-1.92, 0.175], [-1.92, 0.21], [-1.36, 0.205], [-1.28, 0.192], [-1.08, 0.192],
    [-1.02, 0.152], [0.86, 0.152], [1.18, 0.24], [1.46, 0.285], [2.42, 0.285], [2.42, 0.252], [1.92, 0.252]
  ], 20), materials.anodizedAlloy, [0, scopeY, 0]);
  placeMesh(scopePart.group, createRoundedBox(0.42, 0.34, 0.34, 0.03, 0.014), materials.gunmetal, [0.06, scopeY, 0]);
  placeMesh(scopePart.group, new THREE.CylinderGeometry(0.118, 0.125, 0.24, 16), materials.gunmetal, [0.06, scopeY + 0.27, 0]);
  placeMesh(scopePart.group, new THREE.CylinderGeometry(0.127, 0.127, 0.032, 16), materials.chromeSteel, [0.06, scopeY + 0.19, 0]);
  const sideTurret = createCylinderZ(0.105, 0.17, 14);
  placeMesh(scopePart.group, sideTurret, materials.gunmetal, [0.06, scopeY, 0.23]);
  placeMesh(scopePart.group, sideTurret, materials.gunmetal, [0.06, scopeY, -0.23]);
  placeMesh(scopePart.group, createRoundedBox(0.055, 0.16, 0.048, 0.012, 0.005), materials.matteSteel, [-1.18, scopeY + 0.24, 0.06], [0.25, 0, 0]);
  placeMesh(scopePart.group, createCylinderX(0.252, 0.252, 0.025, 18), materials.opticGlass, [1.94, scopeY, 0]);
  placeMesh(scopePart.group, createCylinderX(0.176, 0.176, 0.025, 16), materials.opticGlass, [-1.89, scopeY, 0]);

  placeMesh(magPart.group, createRoundedBox(0.92, 0.96, 0.255, 0.022, 0.012), materials.bluedSteel, [0.42, -0.62, 0], [0, 0, 0.06]);
  const magGroove = createRoundedBox(0.12, 0.68, 0.282, 0.016, 0.006);
  placeMesh(magPart.group, magGroove, materials.gunmetal, [0.22, -0.62, 0], [0, 0, 0.06]);
  placeMesh(magPart.group, magGroove, materials.gunmetal, [0.62, -0.62, 0], [0, 0, 0.06]);
  placeMesh(magPart.group, createRoundedBox(0.98, 0.1, 0.3, 0.02, 0.012), materials.polymerDark, [0.45, -1.11, 0], [0, 0, 0.06]);
  placeMesh(magPart.group, createLatheAlongX([[0.02, 0.062], [0.52, 0.058], [0.62, 0.042], [0.68, 0.042]], 10), materials.brass, [0, -0.1, 0]);
  placeMesh(magPart.group, createLatheAlongX([[0.67, 0.04], [0.82, 0.026], [0.92, 0.002]], 10), materials.copperJacket, [0, -0.1, 0]);

  placeMesh(stockPart.group, createRoundedBox(0.32, 0.42, 0.38, 0.028, 0.014), materials.gunmetal, [-1.36, 0.04, 0]);
  placeMesh(stockPart.group, createRoundedBox(3.72, 0.24, 0.32, 0.025, 0.014), materials.anodizedAlloy, [-3.34, 0.12, 0]);
  placeMesh(stockPart.group, createExtrudedProfile([
    [-1.48, -0.06], [-2.08, -0.58], [-4.96, -0.82], [-5.18, -0.82], [-5.18, -0.52], [-2.24, -0.34], [-1.66, 0.06]
  ], 0.26, { bevelThickness: 0.018, bevelSize: 0.016 }), materials.anodizedAlloy);
  placeMesh(stockPart.group, createRoundedBox(0.36, 1.18, 0.34, 0.03, 0.016), materials.polymerAccent, [-5.08, -0.26, 0]);
  placeMesh(stockPart.group, createRoundedBox(0.18, 1.24, 0.38, 0.035, 0.018), materials.rubber, [-5.34, -0.26, 0]);
  const riserPost = new THREE.CylinderGeometry(0.032, 0.032, 0.34, 10);
  placeMesh(stockPart.group, riserPost, materials.chromeSteel, [-2.72, 0.34, 0]);
  placeMesh(stockPart.group, riserPost, materials.chromeSteel, [-3.92, 0.34, 0]);
  placeMesh(stockPart.group, createRoundedBox(1.76, 0.14, 0.36, 0.05, 0.025), materials.polymerGrip, [-3.32, 0.5, 0]);
  placeMesh(stockPart.group, createCylinderZ(0.075, 0.39, 12), materials.gunmetal, [-3.32, 0.12, 0]);
  placeMesh(stockPart.group, new THREE.CylinderGeometry(0.062, 0.058, 0.52, 12), materials.gunmetal, [-4.72, -1.04, 0]);
  placeMesh(stockPart.group, new THREE.CylinderGeometry(0.088, 0.095, 0.09, 12), materials.rubber, [-4.72, -1.32, 0]);

  placeMesh(bipodPart.group, createRoundedBox(0.42, 0.16, 0.28, 0.02, 0.01), materials.gunmetal, [3.02, -0.1, 0]);
  placeMesh(bipodPart.group, createCylinderX(0.078, 0.078, 0.32, 12), materials.matteSteel, [3.02, -0.24, 0]);
  for (const side of [-1, 1]) {
    const legGroup = new THREE.Group();
    legGroup.position.set(3.02, -0.24, side * 0.12);
    legGroup.rotation.x = -side * 0.35;
    legGroup.rotation.z = -1.38; // Plegado táctico hacia el frente para combate dinámico sin atravesar el suelo
    placeMesh(legGroup, new THREE.CylinderGeometry(0.056, 0.052, 0.92, 10), materials.anodizedAlloy, [0, -0.46, 0]);
    placeMesh(legGroup, new THREE.CylinderGeometry(0.068, 0.068, 0.1, 10), materials.gunmetal, [0, -0.92, 0]);
    placeMesh(legGroup, new THREE.CylinderGeometry(0.04, 0.038, 0.62, 10), materials.chromeSteel, [0, -1.2, 0]);
    placeMesh(legGroup, new THREE.CylinderGeometry(0.075, 0.092, 0.12, 12), materials.rubber, [0, -1.52, 0]);
    placeMesh(legGroup, new THREE.CylinderGeometry(0.022, 0.022, 0.54, 8), materials.matteSteel, [0.06, -0.34, side * 0.03]);
    bipodPart.group.add(legGroup);
  }

  return {
    parts: [chassisPart, boltPart, barrelPart, scopePart, magPart, stockPart, bipodPart],
    slideIds: new Set(['cerrojo']),
    magIds: new Set(['cargador']),
    unitScale: 0.093,
    gripOrigin: [-1.04, -0.58, 0],
    muzzleRaw: [6.84, barrelY, 0],
    forendRaw: [2.05, 0.08, 0],
    flashScale: 1.55
  };
}

// ==================== COMPILADOR Y CACHÉ DE PLANTILLAS FUSIONADAS POR MATERIAL ====================

const _compiledWeaponTemplates = new Map();
const _alignMat = new THREE.Matrix4();
const _rotYNeg90 = new THREE.Matrix4().makeRotationY(-Math.PI / 2);

/**
 * Fusiona las mallas de una lista de grupos agrupándolas por Material y transformándolas directamente
 * a la convención métrica del juego: cañón en +Z, arriba en +Y, empuñadura anclada en (0, -0.04, 0).
 */
function bakeBucketByMaterial(partGroups, transformMat) {
  const byMat = new Map();
  const tempGeosToDispose = new Set();

  for (const grp of partGroups) {
    grp.updateMatrixWorld(true);
    grp.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry || !obj.material) return;
      tempGeosToDispose.add(obj.geometry);
      const g = obj.geometry.index ? obj.geometry.toNonIndexed() : obj.geometry.clone();
      const worldMat = new THREE.Matrix4().multiplyMatrices(transformMat, obj.matrixWorld);
      g.applyMatrix4(worldMat);

      for (const attrName of Object.keys(g.attributes)) {
        if (attrName !== 'position' && attrName !== 'normal' && attrName !== 'uv') {
          g.deleteAttribute(attrName);
        }
      }
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) {
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      }

      let list = byMat.get(obj.material);
      if (!list) {
        list = [];
        byMat.set(obj.material, list);
      }
      list.push(g);
    });
  }

  const bakedPairs = [];
  for (const [mat, geoList] of byMat.entries()) {
    const merged = geoList.length === 1 ? geoList[0] : mergeGeometries(geoList, false);
    if (geoList.length > 1) {
      for (const g of geoList) g.dispose();
    }
    if (merged) {
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      _sharedWeaponGeometries.add(merged);
      bakedPairs.push({ geo: merged, mat });
    }
  }

  for (const rawGeo of tempGeosToDispose) {
    rawGeo.dispose();
  }
  return bakedPairs;
}

function getCompiledWeaponTemplate(weaponId) {
  if (_compiledWeaponTemplates.has(weaponId)) {
    return _compiledWeaponTemplates.get(weaponId);
  }

  const materials = getArmasV1MaterialLibrary();
  let spec;
  switch (weaponId) {
    case 'pistol':
      spec = buildPistolParts(materials);
      break;
    case 'revolver':
      spec = buildRevolverParts(materials);
      break;
    case 'shotgun':
      spec = buildShotgunParts(materials);
      break;
    case 'smg':
      spec = buildSmgParts(materials);
      break;
    case 'assault_rifle':
      spec = buildAssaultRifleParts(materials);
      break;
    case 'sniper':
      spec = buildSniperRifleParts(materials);
      break;
    case 'rifle':
    default:
      spec = buildClassicRifleParts(materials);
      break;
  }

  const s = spec.unitScale;
  const [gx, gy, gz] = spec.gripOrigin;

  // Transformación unificada:
  // 1) Trasladar (-gx, -gy, -gz) para centrar la empuñadura en el origen,
  // 2) Escalar por unitScale métrico real,
  // 3) Rotar -90° en Y (+X cañón -> +Z al frente; +Z lado derecho -> -X lado exterior derecho),
  // 4) Desplazar suavemente (0, -0.04, 0.01) para encajar en la palma de rightArm.hand.
  const tOrigin = new THREE.Matrix4().makeTranslation(-gx, -gy, -gz);
  const tScale = new THREE.Matrix4().makeScale(s, s, s);
  const tPalm = new THREE.Matrix4().makeTranslation(0, -0.04, 0.01);
  _alignMat.copy(tPalm).multiply(_rotYNeg90).multiply(tScale).multiply(tOrigin);

  const staticGroups = [];
  const slideGroups = [];
  const magGroups = [];

  for (const p of spec.parts) {
    if (spec.slideIds.has(p.id)) slideGroups.push(p.group);
    else if (spec.magIds.has(p.id)) magGroups.push(p.group);
    else staticGroups.push(p.group);
  }

  const muzzlePos = new THREE.Vector3(spec.muzzleRaw[0], spec.muzzleRaw[1], spec.muzzleRaw[2]).applyMatrix4(_alignMat);
  const forendPos = new THREE.Vector3(spec.forendRaw[0], spec.forendRaw[1], spec.forendRaw[2]).applyMatrix4(_alignMat);

  const flashConeOuter = new THREE.ConeGeometry(0.044 * spec.flashScale, 0.145 * spec.flashScale, 8);
  flashConeOuter.rotateX(Math.PI / 2);
  flashConeOuter.translate(0, 0, 0.055 * spec.flashScale);
  const flashConeMid = new THREE.ConeGeometry(0.078 * spec.flashScale, 0.082 * spec.flashScale, 6);
  flashConeMid.rotateX(-Math.PI / 2);
  const flashSphereCore = new THREE.SphereGeometry(0.038 * spec.flashScale, 8, 8);
  _sharedWeaponGeometries.add(flashConeOuter);
  _sharedWeaponGeometries.add(flashConeMid);
  _sharedWeaponGeometries.add(flashSphereCore);

  const compiled = {
    staticPairs: bakeBucketByMaterial(staticGroups, _alignMat),
    slidePairs: bakeBucketByMaterial(slideGroups, _alignMat),
    magPairs: bakeBucketByMaterial(magGroups, _alignMat),
    muzzlePos,
    forendPos,
    flashGeos: { outer: flashConeOuter, mid: flashConeMid, core: flashSphereCore },
    isRevolver: weaponId === 'revolver'
  };

  _compiledWeaponTemplates.set(weaponId, compiled);
  return compiled;
}

/**
 * Instancia un modelo ligero (que comparte geometrías y materiales en caché) de cualquiera de las
 * 7 armas de "Armas v1", exponiendo `muzzleTip`, `slideGroup`, `magGroup`, `muzzleFlash` y `forendGripPos`.
 */
export function createArmasV1WeaponMesh(weaponId, scale = 1.0) {
  const tpl = getCompiledWeaponTemplate(weaponId);
  const M = getArmasV1MaterialLibrary();

  const root = new THREE.Group();
  root.scale.setScalar(scale);

  for (let i = 0; i < tpl.staticPairs.length; i++) {
    const { geo, mat } = tpl.staticPairs[i];
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  }

  let slideGroup = null;
  if (tpl.slidePairs.length > 0) {
    slideGroup = new THREE.Group();
    for (let i = 0; i < tpl.slidePairs.length; i++) {
      const { geo, mat } = tpl.slidePairs[i];
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      slideGroup.add(m);
    }
    root.add(slideGroup);
  }

  let magGroup = null;
  if (tpl.magPairs.length > 0) {
    magGroup = new THREE.Group();
    for (let i = 0; i < tpl.magPairs.length; i++) {
      const { geo, mat } = tpl.magPairs[i];
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      magGroup.add(m);
    }
    root.add(magGroup);
  }

  const muzzleTip = new THREE.Object3D();
  muzzleTip.position.copy(tpl.muzzlePos);
  root.add(muzzleTip);

  const flash = new THREE.Group();
  flash.add(
    new THREE.Mesh(tpl.flashGeos.outer, M.flashOuter),
    new THREE.Mesh(tpl.flashGeos.mid, M.flashMid),
    new THREE.Mesh(tpl.flashGeos.core, M.flashCore)
  );
  flash.visible = false;
  muzzleTip.add(flash);

  root.userData.muzzleTip = muzzleTip;
  root.userData.slideGroup = slideGroup;
  root.userData.magGroup = magGroup;
  root.userData.muzzleFlash = flash;
  root.userData.forendGripPos = tpl.forendPos;
  root.userData.isRevolver = tpl.isRevolver;
  return root;
}
