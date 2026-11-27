// client/js/world.js
// Mundo 3D Cel-Shaded / Low-Poly Estilizado de Referencia en Three.js (60 FPS estables, Cero GC en animate):
// - Materiales estilizados MeshToonMaterial con gradiente cel-shaded y borde/contorno oscuro en shader.
// - Sombras dinámicas PCFSoftShadowMap (2048x2048) con frustum local centrado en el jugador, bias calibrado
//   y castShadow/receiveShadow en terreno, casas, puentes, palmas, cercas, rocas, animales, helicóptero y avatares.
// - Niebla andina gris-azulada suave (THREE.FogExp2) con transición dinámica a niebla púrpura oscura en tormenta.
// - Monumento 3D "COCORA" con escultura de Cóndor Andino sobre la "R", Puente Arqueado de Piedra, Río con espuma,
//   Helicóptero Militar Estrellado en llamas (2 secciones + humo/fuego por Object Pooling), Cráter de explosión,
//   Puertas interactivas/destructibles (E / disparos), Ventanas de cristal rompibles e Interiores Paisas en InstancedMesh.

import * as THREE from 'three';
import {
  CELL_SIZE,
  GRID_SIZE,
  WORLD_SIZE,
  WORLD_HALF,
  WATER_LEVEL,
  LAGOON_CONFIG,
  SURFACE,
  LOOT_TYPES,
  createRNG,
  getWaterChannelAt,
  getWaterProfileAt,
  generateCocoraMap
} from '/shared/mapData.js';
import { createDetailedWeaponMesh } from './player/weapons.js';
import { getSharedToonGradient } from './player/avatar.js';
import { ServerClock, SnapshotBuffer, createSampleOut } from './net/interpolation.js';
import { GroundCover } from './groundCover.js';
import {
  MODEL_TEX,
  getColonialHouseMaterials,
  buildColonialRoofTilesGeo,
  buildColonialGablesGeo,
  buildColonialRailingGeo,
  buildColonialWindowGroup,
  buildCleanStoneBridge,
  createExternalWaxPalmPrototypeGeo,
  createExternalCoffeeBushPrototypeGeo,
  createExternalRockPrototypeGeo,
  createRiverCobblePrototypeGeo,
  createExternalFencePrototypeGeo,
  createExternalMedkitLootMesh,
  populateExternalBearModel,
  populateExternalCondorModel,
  populateExternalTapirModel,
  buildExternalCocoraSignGroup
} from '/Modelos%203D/cocoraModels.js';
import {
  isSharedArmasV1Geometry,
  isSharedArmasV1Material
} from '/Modelos%203D/armasV1.js';
import {
  isSharedAircraftGeometry,
  isSharedAircraftMaterial
} from '/Modelos%203D/avionesShared.js';
import { buildAC130Transport } from '/Modelos%203D/ac130Transport.js';
import { buildCH47Transport } from '/Modelos%203D/ch47Transport.js';
import { buildAH64ApacheWreckSite } from '/Modelos%203D/ah64Wreck.js';

const _wildSample = createSampleOut();
const _occSphere = new THREE.Sphere();

// Vectores, matrices y cuaterniones temporales reutilizables (CERO asignaciones por fotograma)
const _tmpVecA = new THREE.Vector3();
const _tmpVecB = new THREE.Vector3();
const _tmpScale = new THREE.Vector3();
const _tmpEuler = new THREE.Euler();
const _tmpQuatA = new THREE.Quaternion();
const _tmpQuatB = new THREE.Quaternion();
const _tmpMat4 = new THREE.Matrix4();
const _tmpInstColor = new THREE.Color();
const _yAxis = new THREE.Vector3(0, 1, 0);

// ==================== PRESUPUESTO DE RENDER (sin pérdida de calidad) ====================
// Terreno y vegetación se dividen en bloques para que la cámara y la sombra solar solo
// dibujen lo que cae dentro de su volumen. El resultado en pantalla es idéntico.
const TERRAIN_CHUNK_CELLS = 40; // 40 celdas x 2 m = bloques de 80 m
const FOLIAGE_TILE_SIZE = 160; // metros por bloque de instancias
const FOLIAGE_BOUNDS_PADDING = 3.0; // margen por el balanceo del viento en GPU

// Luces puntuales: número FIJO en la escena (evita recompilar shaders cuando una luz
// aparece/desaparece) y solo se encienden las que pueden iluminar algo visible.
const MAX_ACTIVE_POINT_LIGHTS = 6;
const LOOT_VISIBLE_DISTANCE = 150; // metros
const POINT_LIGHT_FADE_RATE = 6.0; // fundido de ~0.17 s al cambiar de luz

// Sol: desplazamiento fijo respecto al jugador y ajuste a la rejilla de texels del mapa de sombras
const SUN_OFFSET = new THREE.Vector3(68, 118, 52);
const _sunDir = SUN_OFFSET.clone().normalize();
const _sunRight = new THREE.Vector3().crossVectors(_yAxis, _sunDir).normalize();
const _sunUp = new THREE.Vector3().crossVectors(_sunDir, _sunRight);
const _sunSnapped = new THREE.Vector3();
const _viewerVec = new THREE.Vector3();
const _frustum = new THREE.Frustum();
const _projView = new THREE.Matrix4();
const _lightSphere = new THREE.Sphere();

function isVisibleInScene(obj) {
  let o = obj;
  while (o) {
    if (!o.visible) return false;
    if (o.isScene) return true;
    o = o.parent;
  }
  return false;
}

function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

function createCelToonMaterial(options = {}, rimStrength = 0.58) {
  const mat = new THREE.MeshToonMaterial({
    gradientMap: getSharedToonGradient(),
    ...options
  });
  if (rimStrength > 0) {
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `
        #ifdef FLAT_SHADED
          vec3 celNorm = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
        #else
          vec3 celNorm = normalize(vNormal);
        #endif
        float celRim = 1.0 - abs(dot(celNorm, normalize(vViewPosition)));
        outgoingLight *= mix(1.0, ${Number((1 - rimStrength).toFixed(2))}, smoothstep(0.76, 0.96, celRim));
        #include <opaque_fragment>
        `
      );
    };
  }
  return mat;
}

function perturbGeometry(geo, amount = 0.14, seedOffset = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const h = Math.sin(vx * 12.7 + vy * 7.3 + vz * 15.1 + seedOffset) * 43758.5453;
    const n = (h - Math.floor(h)) * 2 - 1;
    const scale = 1 + n * amount;
    pos.setXYZ(i, vx * scale, vy * scale, vz * scale);
  }
  g.computeVertexNormals();
  return g;
}

function mergeOrganicParts(parts) {
  const positions = [];
  const normals = [];
  const colors = [];
  const tmpColor = new THREE.Color();
  const mat4 = new THREE.Matrix4();
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();
  const posVec = new THREE.Vector3();
  const scaleVec = new THREE.Vector3();
  const normMat = new THREE.Matrix3();
  const v = new THREE.Vector3();

  for (const p of parts) {
    const baseGeo = p.geo;
    if (!baseGeo.attributes.normal) baseGeo.computeVertexNormals();
    const nonIdx = baseGeo.index ? baseGeo.toNonIndexed() : baseGeo;

    posVec.set(p.x || 0, p.y || 0, p.z || 0);
    euler.set(p.rx || 0, p.ry || 0, p.rz || 0);
    quat.setFromEuler(euler);
    scaleVec.set(p.sx || 1, p.sy || 1, p.sz || 1);
    mat4.compose(posVec, quat, scaleVec);
    normMat.getNormalMatrix(mat4);

    tmpColor.set(p.color || '#2b9348');
    const pAttr = nonIdx.attributes.position;
    const nAttr = nonIdx.attributes.normal;

    for (let i = 0; i < pAttr.count; i++) {
      v.fromBufferAttribute(pAttr, i).applyMatrix4(mat4);
      positions.push(v.x, v.y, v.z);

      v.fromBufferAttribute(nAttr, i).applyMatrix3(normMat).normalize();
      normals.push(v.x, v.y, v.z);

      const shade = 0.90 + Math.max(0, v.y) * 0.012;
      colors.push(
        Math.min(1, tmpColor.r * shade),
        Math.min(1, tmpColor.g * shade),
        Math.min(1, tmpColor.b * shade)
      );
    }

    if (nonIdx !== baseGeo) nonIdx.dispose();
    baseGeo.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.computeBoundingSphere();
  return merged;
}

function createRiverFlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, '#0e94b4');
  grad.addColorStop(0.2, '#1cb5d0');
  grad.addColorStop(0.5, '#26cbe3');
  grad.addColorStop(0.8, '#1cb5d0');
  grad.addColorStop(1, '#0e94b4');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Espuma blanca en orillas y vetas dinámicas en el cauce
  ctx.fillStyle = 'rgba(240, 249, 255, 0.55)';
  ctx.fillRect(0, 0, 10, 256);
  ctx.fillRect(246, 0, 10, 256);

  let s = 7719;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < 310; i++) {
    ctx.fillStyle = rand() > 0.30 ? 'rgba(240, 253, 255, 0.38)' : 'rgba(8, 51, 68, 0.20)';
    ctx.fillRect(rand() * 256, rand() * 256, 2 + rand() * 4, 18 + rand() * 56);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 28);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// rimOutline: oscurece las superficies vistas de canto (contorno cel-shaded). Las flores lo
// desactivan para que los pétalos conserven su color vivo.
function createWindFoliageMaterial(windUniform, swayAmp = 0.035, side = THREE.FrontSide, rimOutline = true) {
  const mat = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: getSharedToonGradient(),
    side
  });
  // El caché de shaders de three usa el texto de onBeforeCompile: distinguir la variante sin contorno
  mat.customProgramCacheKey = () => (rimOutline ? 'wind-foliage-rim' : 'wind-foliage-flat');
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windUniform;
    shader.uniforms.uSwayAmp = { value: swayAmp };
    shader.vertexShader =
      `uniform float uWindTime;\nuniform float uSwayAmp;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        float hMask = max(0.0, transformed.y - 0.35);
        #ifdef USE_INSTANCING
          vec3 instWorld = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 instWorld = vec3(0.0);
        #endif
        float gust = sin(uWindTime * 2.0 + instWorld.x * 0.08 + instWorld.z * 0.07) * hMask * uSwayAmp;
        transformed.x += gust;
        transformed.z += gust * 0.65;
        `
      );
    if (!rimOutline) return;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `
      float celRim = 1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition)));
      outgoingLight *= mix(1.0, 0.48, smoothstep(0.78, 0.96, celRim));
      #include <opaque_fragment>
      `
    );
  };
  return mat;
}

function createFoamShaderMaterial(windUniform) {
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.86,
    depthWrite: false
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windUniform;
    shader.vertexShader =
      `uniform float uWindTime;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          float fPhase = instanceMatrix[3][0] * 0.15 + instanceMatrix[3][2] * 0.17;
        #else
          float fPhase = 0.0;
        #endif
        float pulse = 1.0 + sin(uWindTime * 4.2 + fPhase) * 0.14;
        transformed.x *= pulse;
        transformed.z *= pulse;
        `
      );
  };
  return mat;
}

// Prototipos unificados para todos los lotes de InstancedMesh (modelos externos integrados + vegetación + mobiliario + nubes)
function createAllInstancedPrototypes() {
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

    this.windUniform = { value: 0 };
    this.waterTexture = createRiverFlowTexture();
    this.prototypes = createAllInstancedPrototypes();

    // Conjuntos protegidos de recursos compartidos para evitar eliminarlos en disposeObjectTree()
    this.sharedGeometries = new Set(Object.values(this.prototypes));
    this.sharedMaterials = new Set();

    // Materiales compartidos Cel-Shaded y material procedural de erosión/musgo para rocas instanciadas
    this.windMatTall = createWindFoliageMaterial(this.windUniform, 0.032);
    this.windMatLow = createWindFoliageMaterial(this.windUniform, 0.065);
    this.sharedInstancedMat = createCelToonMaterial({ vertexColors: true }, 0.52);
    const rockBumpRough = MODEL_TEX.rockBumpRoughness();
    this.rockInstancedMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: MODEL_TEX.rockDiffuse(),
      bumpMap: rockBumpRough,
      bumpScale: 0.16,
      roughnessMap: rockBumpRough,
      roughness: 0.85,
      metalness: 0.05
    });
    this.foamInstancedMat = createFoamShaderMaterial(this.windUniform);
    this.sharedMaterials.add(this.windMatTall);
    this.sharedMaterials.add(this.windMatLow);
    this.sharedMaterials.add(this.sharedInstancedMat);
    this.sharedMaterials.add(this.rockInstancedMat);
    this.sharedMaterials.add(this.foamInstancedMat);

    // Pasto denso y flores alrededor del jugador (hojas finas: se ven por ambas caras)
    this.groundCover = new GroundCover(
      this.scene,
      createWindFoliageMaterial(this.windUniform, 0.09, THREE.DoubleSide),
      createWindFoliageMaterial(this.windUniform, 0.12, THREE.DoubleSide, false)
    );

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

  // Registra una fuente de luz puntual del mapa. En lugar de crear un THREE.PointLight
  // (cada uno encarece todos los píxeles iluminados), se guarda un anclaje que sigue a su
  // objeto padre; updateRenderBudget() asigna las luces reales del pool a los anclajes visibles.
  addLightAnchor(parent, color, intensity, distance, decay, x, y, z, persistent = false) {
    const anchor = new THREE.Object3D();
    anchor.position.set(x, y, z);
    anchor.userData.light = { color: new THREE.Color(color), intensity, distance, decay, persistent };
    anchor.userData.worldPos = new THREE.Vector3();
    anchor.userData.lightScore = 0;
    parent.add(anchor);
    this.lightAnchors.push(anchor);
    return anchor;
  }

  resetMapLightAnchors() {
    this.lightAnchors = this.lightAnchors.filter((a) => a.userData.light.persistent);
    for (const slot of this.pointLightSlots) {
      slot.anchor = null;
      slot.weight = 0;
      slot.light.intensity = 0;
    }
  }

  // Llamar una vez por fotograma, justo antes de renderizar, con la cámara ya actualizada.
  updateRenderBudget(viewerPos, camera, dt) {
    // Sombra solar centrada en el jugador, ajustada a la rejilla de texels para que los
    // bordes de sombra no "tiemblen" al moverse.
    if (viewerPos && this.sunLight) {
      _viewerVec.set(viewerPos.x, viewerPos.y, viewerPos.z);
      const t = this.shadowTexelSize;
      const r = Math.round(_viewerVec.dot(_sunRight) / t) * t;
      const u = Math.round(_viewerVec.dot(_sunUp) / t) * t;
      const f = _viewerVec.dot(_sunDir);
      _sunSnapped.copy(_sunRight).multiplyScalar(r)
        .addScaledVector(_sunUp, u)
        .addScaledVector(_sunDir, f);
      this.sunLight.target.position.copy(_sunSnapped);
      this.sunLight.position.copy(_sunSnapped).add(SUN_OFFSET);
    }

    // Pasto y flores: generar/mostrar los bloques cercanos al jugador
    if (viewerPos && this.groundCover) this.groundCover.update(viewerPos);

    if (!camera) return;

    // Candidatas: luces visibles cuya esfera de alcance toca el campo de visión.
    // Una luz fuera de esa esfera no aporta nada a ningún píxel en pantalla.
    camera.updateMatrixWorld();
    _projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_projView);
    const candidates = this.lightCandidates;
    candidates.length = 0;
    for (let i = 0; i < this.lightAnchors.length; i++) {
      const a = this.lightAnchors[i];
      if (!isVisibleInScene(a)) continue;
      const wp = a.getWorldPosition(a.userData.worldPos);
      _lightSphere.set(wp, a.userData.light.distance);
      if (!_frustum.intersectsSphere(_lightSphere)) continue;
      a.userData.lightScore = wp.distanceToSquared(camera.position);
      candidates.push(a);
    }
    // Solo si hay más candidatas que luces se elige por cercanía y se funde el cambio;
    // si caben todas, entran a plena intensidad (idéntico a tenerlas siempre encendidas).
    const contested = candidates.length > MAX_ACTIVE_POINT_LIGHTS;
    if (contested) {
      candidates.sort(this.compareLightCandidates);
      candidates.length = MAX_ACTIVE_POINT_LIGHTS;
    }

    const slots = this.pointLightSlots;
    const step = Math.min(1, dt * POINT_LIGHT_FADE_RATE);
    // 1) Atenuar las luces que ya no están entre las elegidas
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot.anchor && !candidates.includes(slot.anchor)) {
        // Sin competencia, la luz salió del campo de visión: liberarla al instante no cambia nada en pantalla
        slot.weight -= contested ? step : 1;
        if (slot.weight <= 0) {
          slot.weight = 0;
          slot.anchor = null;
        }
      }
    }
    // 2) Asignar las elegidas nuevas a ranuras libres
    for (let i = 0; i < candidates.length; i++) {
      const a = candidates[i];
      let assigned = false;
      for (let j = 0; j < slots.length; j++) {
        if (slots[j].anchor === a) { assigned = true; break; }
      }
      if (assigned) continue;
      for (let j = 0; j < slots.length; j++) {
        if (!slots[j].anchor) {
          slots[j].anchor = a;
          slots[j].weight = contested ? 0 : 1;
          break;
        }
      }
    }
    // 3) Aplicar posición, color e intensidad
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const light = slot.light;
      if (!slot.anchor) {
        light.intensity = 0;
        continue;
      }
      if (candidates.includes(slot.anchor)) slot.weight = Math.min(1, slot.weight + step);
      const cfg = slot.anchor.userData.light;
      if (!isVisibleInScene(slot.anchor)) {
        slot.anchor = null;
        slot.weight = 0;
        light.intensity = 0;
        continue;
      }
      slot.anchor.getWorldPosition(light.position);
      light.color.copy(cfg.color);
      light.distance = cfg.distance;
      light.decay = cfg.decay;
      light.intensity = cfg.intensity * slot.weight;
    }
  }

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
  }

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
  }

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
  }

  resetPlaneTracking(planeState) {
    if (!planeState) {
      this.planeInitialized = false;
      return;
    }
    if (planeState.aircraftType) {
      this.setActiveAircraft(planeState.aircraftType);
    }
    this.getActiveAircraftRig()?.resetFlight();
    this.planeServerPredPos.set(planeState.x, planeState.y, planeState.z);
    this.planeSmoothPos.set(planeState.x, planeState.y, planeState.z);
    this.planeVelocity.set(planeState.vx || 0, 0, planeState.vz || 0);
    this.planeSmoothYaw = planeState.yaw || 0;
    this.planeSmoothQuat.setFromAxisAngle(_yAxis, this.planeSmoothYaw);
    this.lastPlaneServerRef = planeState;
    this.planeInitialized = true;

    this.planeMesh.position.copy(this.planeSmoothPos);
    this.planeMesh.quaternion.copy(this.planeSmoothQuat);
    this.planeMesh.updateMatrixWorld(true);
  }

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

  buildCocoraMonument(mon, stoneMat) {
    const signGroup = buildExternalCocoraSignGroup(mon, stoneMat);
    if (signGroup) this.structuresGroup.add(signGroup);
  }

  buildCrashedHelicopter(wreck) {
    this.heliAnimState = buildAH64ApacheWreckSite(
      wreck,
      this.structuresGroup,
      this.addLightAnchor.bind(this)
    );
  }

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
  }

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
  }

  syncDoors(doorsList = []) {
    for (const s of doorsList) {
      this.applyDoorState({
        doorId: s.id,
        isOpen: s.isOpen,
        hp: s.hp,
        destroyed: s.destroyed
      }, false);
    }
  }

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
  }

  syncBrokenWindows(brokenIds = []) {
    const set = new Set(brokenIds);
    for (const [id, entry] of this.windowVisuals.entries()) {
      const isBrk = set.has(id);
      entry.data.broken = isBrk;
      if (entry.data.collider) entry.data.collider.enabled = !isBrk;
      entry.group.visible = !isBrk;
    }
  }

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

  createPlaneModel() {
    const g = new THREE.Group();
    const addAnchor = this.addLightAnchor.bind(this);
    const ac130 = buildAC130Transport(addAnchor);
    const ch47 = buildCH47Transport(addAnchor);
    ch47.group.visible = false;
    g.add(ac130.group, ch47.group);
    this.aircraftRigs = { ac130, ch47 };
    this.activeAircraftId = 'ac130';
    return g;
  }

  setActiveAircraft(typeId = 'ac130') {
    if (!this.aircraftRigs) return;
    const nextId = typeId === 'ch47' ? 'ch47' : 'ac130';
    const prevRig = this.aircraftRigs[this.activeAircraftId];
    const nextRig = this.aircraftRigs[nextId];
    const changed = this.activeAircraftId !== nextId;
    this.activeAircraftId = nextId;
    this.aircraftRigs.ac130.group.visible = nextId === 'ac130';
    this.aircraftRigs.ch47.group.visible = nextId === 'ch47';
    if (changed && nextRig) {
      nextRig.resetFlight();
      if (prevRig?.cabinBayGroup && nextRig.cabinBayGroup) {
        while (prevRig.cabinBayGroup.children.length > 0) {
          nextRig.cabinBayGroup.add(prevRig.cabinBayGroup.children[0]);
        }
      }
    }
  }

  getActiveAircraftRig() {
    return this.aircraftRigs?.[this.activeAircraftId] || this.aircraftRigs?.ac130 || null;
  }

  getActiveCabinBayGroup() {
    return this.getActiveAircraftRig()?.cabinBayGroup || this.planeMesh;
  }

  sampleCabinDisembarkLocalPose(seatIndex = 0, normProgress = 0) {
    const rig = this.getActiveAircraftRig();
    if (rig) return rig.sampleDisembarkLocalPose(seatIndex, normProgress);
    return { x: 0, y: -1.14, z: 0, yaw: Math.PI, phase: 'sit', standBlend: 0, walkCycle: 0 };
  }

  getCabinSeatTransform(seatIndex = 0) {
    const rig = this.getActiveAircraftRig();
    const localSeat = rig
      ? rig.getSeatLocalPose(seatIndex)
      : {
          x: (seatIndex % 2 === 0 ? -1 : 1) * 1.32,
          y: -1.14,
          z: 4.2 - (Math.floor(seatIndex / 2) % 6) * 1.72,
          yaw: seatIndex % 2 === 0 ? Math.PI / 2 : -Math.PI / 2
        };
    _tmpVecA.set(localSeat.x, localSeat.y, localSeat.z);
    _tmpVecA.applyMatrix4(this.planeMesh.matrixWorld);

    return {
      x: _tmpVecA.x,
      y: _tmpVecA.y,
      z: _tmpVecA.z,
      yaw: this.planeSmoothYaw + localSeat.yaw,
      roll: this.planeMesh.rotation.z,
      pitch: this.planeMesh.rotation.x
    };
  }

  getPlaneSmoothAnchor(localOffsetX = 0, localOffsetY = 0, localOffsetZ = 0, outVec = null) {
    const target = outVec || _tmpVecB;
    target.set(localOffsetX, localOffsetY, localOffsetZ);
    return target.applyMatrix4(this.planeMesh.matrixWorld);
  }

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
  }

  syncLoot(items) {
    for (const obj of this.lootMeshes.values()) {
      this.lootGroup.remove(obj);
      this.disposeObjectTree(obj);
    }
    this.lootMeshes.clear();
    this.lootItemsData.clear();
    this.addLootItems(items);
  }

  addLootItems(items) {
    const slopeNorm = new THREE.Vector3();
    const bbox = new THREE.Box3();
    const firearmIds = new Set([
      'pistol',
      'revolver',
      'shotgun',
      'smg',
      'assault_rifle',
      'rifle',
      'sniper'
    ]);

    for (const item of items) {
      if (this.lootMeshes.has(item.id)) continue;
      this.lootItemsData.set(item.id, item);
      const spec = LOOT_TYPES[item.type] || LOOT_TYPES.ammo;
      const accentColor = new THREE.Color(spec.color);

      const root = new THREE.Group();
      root.position.set(item.x, item.y, item.z);

      // Halo brillante suave en el suelo para identificar el objeto claramente
      const ringMat = new THREE.MeshBasicMaterial({
        color: spec.color,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const glowRing = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.46, 18), ringMat);
      glowRing.rotation.x = -Math.PI / 2;
      glowRing.position.y = 0.03;

      const slopeHolder = new THREE.Group();
      if (!item.onFlatStructure && this.mapData) {
        const n = this.mapData.getTerrainNormalAt(item.x, item.z);
        slopeNorm.set(n.x, n.y, n.z).normalize();
        slopeHolder.quaternion.setFromUnitVectors(_yAxis, slopeNorm);
      }
      slopeHolder.add(glowRing);
      root.add(slopeHolder);

      const realShape = new THREE.Group();
      realShape.rotation.y = ((item.x * 13.7 + item.z * 7.3) % 6.28);
      const highlightMeshes = [];

      if (firearmIds.has(item.type)) {
        const wScale = item.type === 'pistol' || item.type === 'revolver' ? 1.38 : 1.15;
        const gunModel = createDetailedWeaponMesh(item.type, wScale);
        gunModel.rotation.z = Math.PI / 2 - 0.12;
        gunModel.rotation.x = 0.04;
        realShape.add(gunModel);

        realShape.traverse((child) => {
          if (child.isMesh && child.material && child.material.isMeshStandardMaterial) {
            const cloned = child.material.clone();
            cloned.emissive = accentColor;
            cloned.emissiveIntensity = 0.24;
            child.material = cloned;
            highlightMeshes.push(cloned);
          }
        });
      } else if (item.type === 'medkit') {
        const extMed = createExternalMedkitLootMesh();
        realShape.add(extMed.group);
        for (let i = 0; i < extMed.highlightMats.length; i++) {
          highlightMeshes.push(extMed.highlightMats[i]);
        }
      } else if (item.type === 'bandage') {
        const gauzeMat = new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.7 });
        const bandMat = new THREE.MeshStandardMaterial({
          color: '#2dd4bf',
          emissive: '#0d9488',
          emissiveIntensity: 0.42,
          roughness: 0.4
        });
        const r1 = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.22, 12), gauzeMat);
        r1.position.set(-0.09, 0.11, 0);
        const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.114, 0.114, 0.06, 12), bandMat);
        stripe.position.set(-0.09, 0.11, 0);
        const r2 = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.20, 12), gauzeMat);
        r2.rotation.z = Math.PI / 2;
        r2.position.set(0.12, 0.10, 0.04);
        realShape.add(r1, stripe, r2);
        highlightMeshes.push(bandMat);
      } else {
        const pouchMat = new THREE.MeshStandardMaterial({
          color: '#4d7c0f',
          emissive: '#3f6212',
          emissiveIntensity: 0.28,
          roughness: 0.55
        });
        const brassMat = new THREE.MeshStandardMaterial({
          color: '#facc15',
          emissive: '#ca8a04',
          emissiveIntensity: 0.34,
          roughness: 0.25,
          metalness: 0.85
        });
        const pack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.26), pouchMat);
        for (let b = 0; b < 4; b++) {
          const bullet = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.16, 8), brassMat);
          bullet.rotation.z = Math.PI / 2;
          bullet.position.set(0, 0.11, -0.075 + b * 0.05);
          realShape.add(bullet);
        }
        realShape.add(pack);
        highlightMeshes.push(brassMat, pouchMat);
      }

      realShape.updateMatrixWorld(true);
      bbox.setFromObject(realShape);
      if (Number.isFinite(bbox.min.y)) {
        realShape.position.y -= bbox.min.y - 0.015;
      }

      slopeHolder.add(realShape);
      root.userData.highlightMats = highlightMeshes;
      root.userData.glowRingMat = ringMat;
      root.userData.phase = Math.random() * Math.PI * 2;

      this.lootGroup.add(root);
      this.lootMeshes.set(item.id, root);
    }
  }

  removeLootItem(lootId) {
    const obj = this.lootMeshes.get(lootId);
    if (obj) {
      this.lootGroup.remove(obj);
      this.disposeObjectTree(obj);
      this.lootMeshes.delete(lootId);
    }
    this.lootItemsData.delete(lootId);
  }

  // Búsqueda sin allocs del mejor objeto o puerta interactiva cercana ([E] RECOGER... / [E] ABRIR PUERTA)
  findBestInteractable(px, py, pz, eyeY, lookDirX, lookDirY, lookDirZ) {
    const out = this._interactResult;
    out.kind = null;
    out.id = null;
    out.promptText = '';

    let bestScore = Infinity;

    for (const item of this.lootItemsData.values()) {
      const dx = item.x - px;
      const dz = item.z - pz;
      const horiz = Math.hypot(dx, dz);
      if (horiz > 3.45 || Math.abs(item.y - py) > 2.1) continue;

      const vx = item.x - px;
      const vy = (item.y + 0.2) - eyeY;
      const vz = item.z - pz;
      const dist3 = Math.hypot(vx, vy, vz) || 0.001;
      const dot = (vx * lookDirX + vy * lookDirY + vz * lookDirZ) / dist3;
      if (horiz > 1.85 && dot < 0.55) continue;

      const score = horiz - Math.max(0, dot) * 1.65;
      if (score < bestScore) {
        bestScore = score;
        const spec = LOOT_TYPES[item.type] || LOOT_TYPES.ammo;
        out.kind = 'loot';
        out.id = item.id;
        out.promptText = `[E] RECOGER ${spec.label.toUpperCase()}`;
      }
    }

    if (out.kind) return out;

    for (const entry of this.doorVisuals.values()) {
      const d = entry.data;
      if (d.destroyed) continue;
      const horiz = Math.hypot(d.x - px, d.z - pz);
      if (horiz > 3.1 || Math.abs(d.y - py) > 2.0) continue;
      const vx = d.x - px;
      const vy = (d.y + 1.1) - eyeY;
      const vz = d.z - pz;
      const dist3 = Math.hypot(vx, vy, vz) || 0.001;
      const dot = (vx * lookDirX + vy * lookDirY + vz * lookDirZ) / dist3;
      if (horiz > 1.7 && dot < 0.45) continue;

      const score = horiz - Math.max(0, dot) * 1.2;
      if (score < bestScore) {
        bestScore = score;
        out.kind = 'door';
        out.id = d.id;
        out.promptText = d.isOpen ? '[E] CERRAR PUERTA' : '[E] ABRIR PUERTA';
      }
    }

    return out.kind ? out : null;
  }

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
        model.hpBarSprite.userData.updateBar(data.hp, data.maxHp, data.aiState === 'hostile');
        this.wildlifeGroup.add(model.root);
        entry = {
          model,
          buffer: new SnapshotBuffer(),
          barKey: `${data.hp}|${data.maxHp}|${data.aiState === 'hostile'}`,
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
        const barKey = `${data.hp}|${data.maxHp}|${data.aiState === 'hostile'}`;
        if (barKey !== entry.barKey) {
          entry.barKey = barKey;
          entry.model.hpBarSprite.userData.updateBar(data.hp, data.maxHp, data.aiState === 'hostile');
        }
      }
      if (!hasTime) entry.buffer.clear();
      entry.buffer.push(t, data.x, data.y, data.z, data.yaw, null);
    }
  }

  triggerWildlifeHitFlash(animalId, hp, maxHp) {
    const entry = this.wildlifeEntries.get(animalId);
    if (!entry) return;
    entry.flashTimer = 0.15;
    if (typeof hp === 'number') {
      entry.hp = hp;
      entry.model.hpBarSprite.userData.updateBar(hp, maxHp || entry.maxHp, entry.aiState === 'hostile');
    }
  }

  removeWildlife(animalId) {
    const entry = this.wildlifeEntries.get(animalId);
    if (entry) {
      this.wildlifeGroup.remove(entry.model.root);
      this.disposeObjectTree(entry.model.root);
      this.wildlifeEntries.delete(animalId);
    }
  }

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

      m.alertSprite.visible = entry.aiState === 'hostile';

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

  _acquireParticle(x, y, z, vx, vy, vz, mat, ttl, gravity = 14, scale = 1.0, growRate = 0.0) {
    const slot = this.particlePool[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % this.particlePool.length;
    slot.active = true;
    slot.vx = vx;
    slot.vy = vy;
    slot.vz = vz;
    slot.gravity = gravity;
    slot.growRate = growRate;
    slot.scale = scale;
    slot.ttl = ttl;
    slot.maxTtl = ttl;
    slot.mesh.material = mat;
    slot.mesh.position.set(x, y, z);
    slot.mesh.scale.setScalar(scale);
    slot.mesh.visible = true;
  }

  _acquireTracer(ox, oy, oz, ex, ey, ez, hitPlayer) {
    const slot = this.tracerPool[this.tracerCursor];
    this.tracerCursor = (this.tracerCursor + 1) % this.tracerPool.length;
    slot.active = true;
    slot.ttl = 0.08;
    slot.maxTtl = 0.08;
    slot.posAttr.setXYZ(0, ox, oy, oz);
    slot.posAttr.setXYZ(1, ex, ey, ez);
    slot.posAttr.needsUpdate = true;
    slot.mat.color.setHex(hitPlayer ? 0xfde047 : 0xbae6fd);
    slot.mat.opacity = 0.88;
    slot.line.visible = true;
  }

  spawnDoorBreakFX(x, y, z) {
    for (let i = 0; i < 12; i++) {
      this._acquireParticle(
        x + (Math.random() - 0.5) * 1.1,
        y + (Math.random() - 0.5) * 1.4,
        z + (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 6.5,
        1.5 + Math.random() * 4.0,
        (Math.random() - 0.5) * 6.5,
        this.poolMats.woodSplinter,
        0.55,
        15,
        1.45,
        0
      );
    }
  }

  spawnWindowShatterFX(x, y, z) {
    for (let i = 0; i < 14; i++) {
      this._acquireParticle(
        x + (Math.random() - 0.5) * 1.2,
        y + (Math.random() - 0.5) * 0.9,
        z + (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 5.8,
        0.8 + Math.random() * 3.2,
        (Math.random() - 0.5) * 5.8,
        this.poolMats.glassShard,
        0.48,
        16,
        1.1,
        0
      );
    }
  }

  spawnSlideDust(x, y, z, yaw) {
    const backX = -Math.sin(yaw);
    const backZ = -Math.cos(yaw);
    for (let i = 0; i < 2; i++) {
      this._acquireParticle(
        x + (Math.random() - 0.5) * 0.35,
        y + 0.10,
        z + (Math.random() - 0.5) * 0.35,
        backX * (1.8 + Math.random() * 1.5) + (Math.random() - 0.5) * 1.4,
        0.9 + Math.random() * 1.4,
        backZ * (1.8 + Math.random() * 1.5) + (Math.random() - 0.5) * 1.4,
        this.poolMats.dust,
        0.34,
        12,
        1.15
      );
    }
  }

  spawnWaterRipples(x, z, isMoving = false, intensity = 1.0) {
    const count = isMoving ? 3 : 2;
    const surfY = WATER_LEVEL + 0.05;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = 0.22 + Math.random() * 0.38;
      const outSpeed = (isMoving ? 1.45 : 0.75) * intensity;
      this._acquireParticle(
        x + Math.cos(ang) * rad,
        surfY,
        z + Math.sin(ang) * rad,
        Math.cos(ang) * outSpeed,
        isMoving ? (0.45 + Math.random() * 0.85) * intensity : 0.12,
        Math.sin(ang) * outSpeed,
        i === 0 ? this.poolMats.waterFoam : this.poolMats.waterRipple,
        0.42,
        isMoving ? 4.8 : 0.5,
        0.75 * intensity,
        1.65
      );
    }
  }

  spawnHealParticles(x, y, z) {
    for (let i = 0; i < 2; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = 0.25 + Math.random() * 0.32;
      this._acquireParticle(
        x + Math.cos(ang) * rad,
        y + 0.75 + Math.random() * 0.45,
        z + Math.sin(ang) * rad,
        (Math.random() - 0.5) * 0.4,
        1.5 + Math.random() * 0.9,
        (Math.random() - 0.5) * 0.4,
        this.poolMats.healGreen,
        0.58,
        -0.4,
        0.95
      );
    }
  }

  spawnShotFX(origin, endPoint, hitPlayer = false, extraEnds = null) {
    if (endPoint) {
      this._acquireTracer(origin.x, origin.y, origin.z, endPoint.x, endPoint.y, endPoint.z, hitPlayer);
    }
    if (extraEnds && extraEnds.length > 0) {
      for (let i = 0; i < extraEnds.length; i++) {
        const ep = extraEnds[i];
        if (ep) this._acquireTracer(origin.x, origin.y, origin.z, ep.x, ep.y, ep.z, hitPlayer);
      }
    }

    if (endPoint) {
      const pCount = hitPlayer ? 6 : 4;
      const mat = hitPlayer ? this.poolMats.hitRed : this.poolMats.sparkGold;
      for (let i = 0; i < pCount; i++) {
        this._acquireParticle(
          endPoint.x,
          endPoint.y,
          endPoint.z,
          (Math.random() - 0.5) * 6,
          Math.random() * 4 + 0.8,
          (Math.random() - 0.5) * 6,
          mat,
          0.28,
          14,
          0.9
        );
      }
    }
  }

  updateStormAtmosphere(dt, timeSec, stormState, viewerPos) {
    let targetFactor = 0;
    let targetCrashFactor = 0;
    const hw = this.mapData?.helicopterWreck;

    if (viewerPos && viewerPos.active && viewerPos.state !== 'plane') {
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

function zocaloOrBeamMat(beamMat) {
  return beamMat;
}
