import * as THREE from "three";
import { skinAtlas } from "./finish";
import { PART_CATEGORY_META, PartCategory } from "./types";

let cachedPanelBump: THREE.CanvasTexture | null = null;

function getPanelBumpTexture(): THREE.CanvasTexture | null {
  if (cachedPanelBump) return cachedPanelBump;
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, 256, 256);

    // Subtle recessed aircraft skin panel seams
    ctx.strokeStyle = "#565656";
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, 252, 252);

    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(0, 128);
    ctx.lineTo(256, 128);
    ctx.moveTo(128, 0);
    ctx.lineTo(128, 256);
    ctx.moveTo(64, 0);
    ctx.lineTo(64, 128);
    ctx.moveTo(192, 128);
    ctx.lineTo(192, 256);
    ctx.stroke();

    // Subtle raised rivet lines along seams
    ctx.fillStyle = "#9c9c9c";
    for (let i = 12; i < 256; i += 16) {
      ctx.fillRect(i, 6, 2, 2);
      ctx.fillRect(i, 122, 2, 2);
      ctx.fillRect(i, 133, 2, 2);
      ctx.fillRect(6, i, 2, 2);
      ctx.fillRect(122, i, 2, 2);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.5, 1);
  cachedPanelBump = tex;
  return tex;
}

export interface MaterialLibrary {
  // Airframe finishes
  stealthDark: THREE.MeshStandardMaterial;
  stealthMid: THREE.MeshStandardMaterial;
  stealthEdge: THREE.MeshStandardMaterial;
  tacticalGrey: THREE.MeshStandardMaterial;
  tacticalLight: THREE.MeshStandardMaterial;
  gunshipSlate: THREE.MeshStandardMaterial;
  classicNavy: THREE.MeshStandardMaterial;
  classicYellow: THREE.MeshStandardMaterial;
  classicSilver: THREE.MeshStandardMaterial;
  apacheOlive: THREE.MeshStandardMaterial;
  apacheDark: THREE.MeshStandardMaterial;
  kaSlate: THREE.MeshStandardMaterial;
  kaBelly: THREE.MeshStandardMaterial;
  chinookSage: THREE.MeshStandardMaterial;
  specOpsBlack: THREE.MeshStandardMaterial;

  // Metals, weapons & engines
  gunmetal: THREE.MeshStandardMaterial;
  bluedBarrel: THREE.MeshStandardMaterial;
  titanium: THREE.MeshStandardMaterial;
  burntTitanium: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  oliveOrdnance: THREE.MeshStandardMaterial;
  whiteMissile: THREE.MeshStandardMaterial;
  mahoganyWood: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  cockpitInterior: THREE.MeshStandardMaterial;

  // Accents, glass, optics & thrusters
  warningRed: THREE.MeshStandardMaterial;
  warningYellow: THREE.MeshStandardMaterial;
  canopyGold: THREE.MeshPhysicalMaterial;
  canopySmoke: THREE.MeshPhysicalMaterial;
  opticEmerald: THREE.MeshPhysicalMaterial;
  opticAmber: THREE.MeshPhysicalMaterial;
  hudGlow: THREE.MeshStandardMaterial;
  afterburnerBlue: THREE.MeshStandardMaterial;
  afterburnerAmber: THREE.MeshStandardMaterial;
  navGreen: THREE.MeshStandardMaterial;
  navRed: THREE.MeshStandardMaterial;
}

let cachedLibrary: MaterialLibrary | null = null;

export function getMaterials(): MaterialLibrary {
  if (cachedLibrary) return cachedLibrary;

  const bump = getPanelBumpTexture();

  cachedLibrary = {
    stealthDark: new THREE.MeshStandardMaterial({
      color: 0x3b4452,
      roughness: 0.46,
      metalness: 0.52,
      bumpMap: bump,
      bumpScale: 0.008,
    }),
    stealthMid: new THREE.MeshStandardMaterial({
      color: 0x566273,
      roughness: 0.48,
      metalness: 0.44,
      bumpMap: bump,
      bumpScale: 0.006,
    }),
    stealthEdge: new THREE.MeshStandardMaterial({
      color: 0x7b8798,
      roughness: 0.42,
      metalness: 0.38,
    }),
    tacticalGrey: new THREE.MeshStandardMaterial({
      color: 0x777e80,
      roughness: 0.58,
      metalness: 0.28,
      bumpMap: bump,
      bumpScale: 0.01,
    }),
    tacticalLight: new THREE.MeshStandardMaterial({
      color: 0x959b9c,
      roughness: 0.55,
      metalness: 0.24,
      bumpMap: bump,
      bumpScale: 0.008,
    }),
    gunshipSlate: new THREE.MeshStandardMaterial({
      color: 0x737c86,
      roughness: 0.62,
      metalness: 0.26,
      bumpMap: bump,
      bumpScale: 0.01,
    }),
    classicNavy: new THREE.MeshStandardMaterial({
      color: 0x1e3a5f,
      roughness: 0.45,
      metalness: 0.22,
      bumpMap: bump,
      bumpScale: 0.006,
    }),
    classicYellow: new THREE.MeshStandardMaterial({
      color: 0xd99b26,
      roughness: 0.42,
      metalness: 0.15,
    }),
    classicSilver: new THREE.MeshStandardMaterial({
      color: 0xaab4c0,
      roughness: 0.34,
      metalness: 0.68,
    }),
    apacheOlive: new THREE.MeshStandardMaterial({
      color: 0x444d3c,
      roughness: 0.68,
      metalness: 0.22,
      bumpMap: bump,
      bumpScale: 0.01,
    }),
    apacheDark: new THREE.MeshStandardMaterial({
      color: 0x2d3329,
      roughness: 0.72,
      metalness: 0.2,
    }),
    kaSlate: new THREE.MeshStandardMaterial({
      color: 0x333e4a,
      roughness: 0.56,
      metalness: 0.3,
      bumpMap: bump,
      bumpScale: 0.009,
    }),
    kaBelly: new THREE.MeshStandardMaterial({
      color: 0x5c7c8e,
      roughness: 0.54,
      metalness: 0.22,
    }),
    chinookSage: new THREE.MeshStandardMaterial({
      color: 0x4f5a46,
      roughness: 0.65,
      metalness: 0.22,
      bumpMap: bump,
      bumpScale: 0.01,
    }),
    specOpsBlack: new THREE.MeshStandardMaterial({
      color: 0x22272e,
      roughness: 0.58,
      metalness: 0.32,
      bumpMap: bump,
      bumpScale: 0.007,
    }),

    gunmetal: new THREE.MeshStandardMaterial({
      color: 0x2b3038,
      roughness: 0.36,
      metalness: 0.82,
    }),
    bluedBarrel: new THREE.MeshStandardMaterial({
      color: 0x1d232b,
      roughness: 0.28,
      metalness: 0.9,
    }),
    titanium: new THREE.MeshStandardMaterial({
      color: 0x7a828c,
      roughness: 0.3,
      metalness: 0.86,
    }),
    burntTitanium: new THREE.MeshStandardMaterial({
      color: 0x453d3b,
      roughness: 0.38,
      metalness: 0.84,
    }),
    chrome: new THREE.MeshStandardMaterial({
      color: 0xd4dde8,
      roughness: 0.16,
      metalness: 0.95,
    }),
    brass: new THREE.MeshStandardMaterial({
      color: 0xc89d3c,
      roughness: 0.28,
      metalness: 0.88,
    }),
    oliveOrdnance: new THREE.MeshStandardMaterial({
      color: 0x4a5338,
      roughness: 0.52,
      metalness: 0.34,
    }),
    whiteMissile: new THREE.MeshStandardMaterial({
      color: 0xdce2e8,
      roughness: 0.38,
      metalness: 0.25,
    }),
    mahoganyWood: new THREE.MeshStandardMaterial({
      color: 0x6e3b23,
      roughness: 0.36,
      metalness: 0.08,
    }),
    rubber: new THREE.MeshStandardMaterial({
      color: 0x17191c,
      roughness: 0.88,
      metalness: 0.06,
    }),
    cockpitInterior: new THREE.MeshStandardMaterial({
      color: 0x1e242b,
      roughness: 0.75,
      metalness: 0.2,
    }),

    warningRed: new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.4,
      metalness: 0.25,
    }),
    warningYellow: new THREE.MeshStandardMaterial({
      color: 0xe3b83e,
      roughness: 0.42,
      metalness: 0.2,
    }),
    canopyGold: new THREE.MeshPhysicalMaterial({
      color: 0x6c9d9d,
      roughness: 0.1,
      metalness: 0.25,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
    }),
    canopySmoke: new THREE.MeshPhysicalMaterial({
      color: 0x246575,
      roughness: 0.1,
      metalness: 0.12,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
    }),
    opticEmerald: new THREE.MeshPhysicalMaterial({
      color: 0x10b981,
      emissive: 0x064e3b,
      emissiveIntensity: 0.65,
      roughness: 0.06,
      metalness: 0.35,
      clearcoat: 1.0,
    }),
    opticAmber: new THREE.MeshPhysicalMaterial({
      color: 0xf59e0b,
      emissive: 0x78350f,
      emissiveIntensity: 0.6,
      roughness: 0.08,
      metalness: 0.4,
      clearcoat: 1.0,
    }),
    hudGlow: new THREE.MeshStandardMaterial({
      color: 0x34d399,
      emissive: 0x10b981,
      emissiveIntensity: 1.5,
      roughness: 0.15,
      metalness: 0.1,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
    }),
    afterburnerBlue: new THREE.MeshStandardMaterial({
      color: 0x60a5fa,
      emissive: 0x2563eb,
      emissiveIntensity: 1.9,
      roughness: 0.2,
      metalness: 0.1,
      side: THREE.DoubleSide,
    }),
    afterburnerAmber: new THREE.MeshStandardMaterial({
      color: 0xfb923c,
      emissive: 0xea580c,
      emissiveIntensity: 1.7,
      roughness: 0.25,
      metalness: 0.1,
      side: THREE.DoubleSide,
    }),
    navGreen: new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x16a34a,
      emissiveIntensity: 1.6,
      roughness: 0.2,
    }),
    navRed: new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 1.6,
      roughness: 0.2,
    }),
  };

  const sheet = skinAtlas();
  for (const [key, mat] of Object.entries(cachedLibrary)) {
    mat.name = key;
    if (mat.bumpMap) {
      mat.map = sheet;
      mat.bumpScale = 0.0007;
    }
  }
  return cachedLibrary;
}

const highlightMatCache = new Map<string, THREE.MeshStandardMaterial>();
let dimmedGhostMaterial: THREE.MeshStandardMaterial | null = null;
let wireframeCache = new Map<THREE.Material, THREE.Material>();

function getHighlightMaterial(
  category: PartCategory,
): THREE.MeshStandardMaterial {
  const existing = highlightMatCache.get(category);
  if (existing) return existing;

  const hex = PART_CATEGORY_META[category].accentHex;
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    emissive: new THREE.Color(hex),
    emissiveIntensity: 0.42,
    roughness: 0.3,
    metalness: 0.55,
  });
  highlightMatCache.set(category, mat);
  return mat;
}

function getDimmedMaterial(): THREE.MeshStandardMaterial {
  if (!dimmedGhostMaterial) {
    dimmedGhostMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e2633,
      roughness: 0.85,
      metalness: 0.1,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    });
  }
  return dimmedGhostMaterial;
}

export function tagPart<T extends THREE.Object3D>(
  object: T,
  category: PartCategory,
): T {
  object.name = category;
  object.userData.partCategory = category;
  object.traverse((child) => {
    child.userData.partCategory = category;
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      if (!mesh.userData.baseMaterial) {
        mesh.userData.baseMaterial = mesh.material;
      }
      mesh.castShadow = !(mesh.material as THREE.Material).transparent;
      mesh.receiveShadow = true;
    }
  });
  return object;
}

export function applyVisualMode(
  root: THREE.Object3D,
  activeCategory: PartCategory | null,
  wireframe: boolean,
): void {
  root.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh || child.userData.renderSource) return;
    const mesh = child as THREE.Mesh;
    const baseMat = (mesh.userData.baseMaterial ||
      mesh.material) as THREE.Material;
    if (!mesh.userData.baseMaterial) {
      mesh.userData.baseMaterial = baseMat;
    }

    const cat: PartCategory = mesh.userData.partCategory || "airframe";
    let targetMat: THREE.Material = baseMat;

    if (activeCategory) {
      targetMat =
        cat === activeCategory
          ? getHighlightMaterial(cat)
          : getDimmedMaterial();
    }

    if (wireframe) {
      let wf = wireframeCache.get(targetMat);
      if (!wf) {
        wf = targetMat.clone();
        if ("wireframe" in wf) {
          (wf as THREE.MeshStandardMaterial).wireframe = true;
        }
        wireframeCache.set(targetMat, wf);
      }
      mesh.material = wf;
    } else {
      mesh.material = targetMat;
    }
  });
}

export function computeGeometryStats(root: THREE.Object3D): {
  triangleCount: number;
  meshCount: number;
} {
  let triangleCount = 0;
  let meshCount = 0;
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      meshCount += 1;
      const geom = (child as THREE.Mesh).geometry;
      if (geom) {
        if (geom.index) {
          triangleCount +=
            Math.round(geom.index.count / 3) *
            ((child as THREE.InstancedMesh).isInstancedMesh
              ? (child as THREE.InstancedMesh).count
              : 1);
        } else if (geom.attributes.position) {
          triangleCount += Math.round(geom.attributes.position.count / 3);
        }
      }
    }
  });
  return { triangleCount, meshCount };
}
