// client/js/world/materials.js
// Materiales del mundo: toon cel-shaded con contorno, follaje con viento en GPU, deformación orgánica de geometrías
// y la caché de materiales/geometrías compartidas (sharedMaterials/sharedGeometries) que disposeObjectTree respeta.

import * as THREE from 'three';
import { MODEL_TEX } from '/Modelos%203D/cocoraModels.js';
import { getSharedToonGradient } from '../player/avatar.js';
import { createAllInstancedPrototypes } from './foliage.js';
import { GroundCover } from './groundCover.js';
import { createRiverFlowTexture, createFoamShaderMaterial } from './water.js';

export function createCelToonMaterial(options = {}, rimStrength = 0.58) {
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

export function perturbGeometry(geo, amount = 0.14, seedOffset = 1) {
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

export function mergeOrganicParts(parts) {
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

export const materialMethods = {
  initSharedMaterialCache() {
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
  }
};
