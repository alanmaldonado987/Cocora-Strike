import * as THREE from 'three';
import { WeaponMaterialLibrary } from './types';

function createBrushedMetalBumpTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);

    // Fine directional machined steel brush streaks
    for (let y = 0; y < size; y++) {
      const lum = 112 + Math.floor(Math.random() * 32);
      ctx.fillStyle = `rgb(${lum},${lum},${lum})`;
      ctx.fillRect(0, y, size, 1);
    }
    for (let i = 0; i < 420; i++) {
      const y = Math.floor(Math.random() * size);
      const x = Math.floor(Math.random() * size);
      const w = 18 + Math.floor(Math.random() * 75);
      const v = 90 + Math.floor(Math.random() * 76);
      ctx.fillStyle = `rgba(${v},${v},${v},0.45)`;
      ctx.fillRect(x, y, w, 1);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

function createKnurledGripBumpTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
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
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  return tex;
}

function createWoodTextures(variant: 'walnut' | 'laminate'): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const width = 512;
  const height = 256;

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = width;
  colorCanvas.height = height;
  const cCtx = colorCanvas.getContext('2d');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = width;
  bumpCanvas.height = height;
  const bCtx = bumpCanvas.getContext('2d');

  if (cCtx && bCtx) {
    const baseColors =
      variant === 'walnut'
        ? { r: 92, g: 56, b: 34, darkR: 46, darkG: 26, darkB: 15 }
        : { r: 146, g: 76, b: 36, darkR: 78, darkG: 34, darkB: 16 };

    const cImg = cCtx.createImageData(width, height);
    const bImg = bCtx.createImageData(width, height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const nx = x / width;
        const ny = y / height;
        // Layered sinusoidal wood grain rings + subtle longitudinal fibers
        const wave =
          Math.sin(ny * 36 + Math.sin(nx * 6.5) * 2.2 + Math.cos(nx * 14 + ny * 8) * 0.5) * 0.5 +
          0.5;
        const fineGrain =
          Math.sin(ny * 145 + Math.sin(nx * 24) * 1.4) * 0.25 +
          Math.sin(nx * 18 + ny * 60) * 0.12;
        const t = Math.min(1, Math.max(0, wave * 0.72 + fineGrain * 0.28 + 0.1));

        // Laminate has distinct warm/dark horizontal plywood strata
        const strata =
          variant === 'laminate' ? (Math.sin(ny * 44) * 0.18 + 0.1) : 0;
        const mix = Math.min(1, Math.max(0, t + strata));

        const r = Math.round(baseColors.darkR + (baseColors.r - baseColors.darkR) * mix);
        const g = Math.round(baseColors.darkG + (baseColors.g - baseColors.darkG) * mix);
        const b = Math.round(baseColors.darkB + (baseColors.b - baseColors.darkB) * mix);

        const idx = (y * width + x) * 4;
        cImg.data[idx] = r;
        cImg.data[idx + 1] = g;
        cImg.data[idx + 2] = b;
        cImg.data[idx + 3] = 255;

        const bumpVal = Math.round(90 + mix * 120);
        bImg.data[idx] = bumpVal;
        bImg.data[idx + 1] = bumpVal;
        bImg.data[idx + 2] = bumpVal;
        bImg.data[idx + 3] = 255;
      }
    }

    cCtx.putImageData(cImg, 0, 0);
    bCtx.putImageData(bImg, 0, 0);
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1.5, 1.5);

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(1.5, 1.5);

  return { map, bumpMap };
}

export function createWeaponMaterialLibrary(): WeaponMaterialLibrary {
  const brushedBump = createBrushedMetalBumpTexture();
  const knurledBump = createKnurledGripBumpTexture();
  const walnut = createWoodTextures('walnut');
  const laminate = createWoodTextures('laminate');

  const textures: THREE.Texture[] = [
    brushedBump,
    knurledBump,
    walnut.map,
    walnut.bumpMap,
    laminate.map,
    laminate.bumpMap,
  ];

  const gunmetal = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#343942'),
    metalness: 0.86,
    roughness: 0.34,
    bumpMap: brushedBump,
    bumpScale: 0.008,
  });

  const bluedSteel = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#232934'),
    metalness: 0.92,
    roughness: 0.24,
    bumpMap: brushedBump,
    bumpScale: 0.005,
  });

  const anodizedAlloy = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#2a2e36'),
    metalness: 0.78,
    roughness: 0.42,
    bumpMap: brushedBump,
    bumpScale: 0.004,
  });

  const matteSteel = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#444a54'),
    metalness: 0.84,
    roughness: 0.46,
    bumpMap: brushedBump,
    bumpScale: 0.01,
  });

  const chromeSteel = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#cfd6df'),
    metalness: 0.96,
    roughness: 0.16,
    bumpMap: brushedBump,
    bumpScale: 0.003,
  });

  const darkBore = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#08090c'),
    metalness: 0.15,
    roughness: 0.94,
  });

  const polymerDark = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#25282f'),
    metalness: 0.06,
    roughness: 0.76,
  });

  const polymerGrip = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#1f2228'),
    metalness: 0.05,
    roughness: 0.84,
    bumpMap: knurledBump,
    bumpScale: 0.022,
  });

  const polymerAccent = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#3c4149'),
    metalness: 0.1,
    roughness: 0.68,
  });

  const rubber = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#181a1e'),
    metalness: 0.02,
    roughness: 0.94,
    bumpMap: knurledBump,
    bumpScale: 0.01,
  });

  const woodWalnut = new THREE.MeshPhysicalMaterial({
    map: walnut.map,
    bumpMap: walnut.bumpMap,
    bumpScale: 0.015,
    metalness: 0.04,
    roughness: 0.46,
    clearcoat: 0.35,
    clearcoatRoughness: 0.32,
  });

  const woodLaminate = new THREE.MeshPhysicalMaterial({
    map: laminate.map,
    bumpMap: laminate.bumpMap,
    bumpScale: 0.014,
    metalness: 0.04,
    roughness: 0.38,
    clearcoat: 0.48,
    clearcoatRoughness: 0.24,
  });

  const bakelite = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#6f3220'),
    metalness: 0.06,
    roughness: 0.45,
    bumpMap: knurledBump,
    bumpScale: 0.014,
  });

  const brass = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#d2aa52'),
    metalness: 0.94,
    roughness: 0.22,
  });

  const copperJacket = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#b86f44'),
    metalness: 0.9,
    roughness: 0.28,
  });

  const shellRed = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#a42026'),
    metalness: 0.05,
    roughness: 0.36,
  });

  const opticGlass = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#144a56'),
    metalness: 0.18,
    roughness: 0.06,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    reflectivity: 1.0,
    transparent: true,
    opacity: 0.86,
  });

  const sightGreen = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#6cffaa'),
    emissive: new THREE.Color('#27db74'),
    emissiveIntensity: 1.5,
    roughness: 0.25,
    metalness: 0.1,
  });

  const sightRed = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ff453a'),
    emissive: new THREE.Color('#ff2d20'),
    emissiveIntensity: 1.9,
    roughness: 0.2,
    metalness: 0.1,
  });

  const allMaterials: THREE.Material[] = [
    gunmetal,
    bluedSteel,
    anodizedAlloy,
    matteSteel,
    chromeSteel,
    darkBore,
    polymerDark,
    polymerGrip,
    polymerAccent,
    rubber,
    woodWalnut,
    woodLaminate,
    bakelite,
    brass,
    copperJacket,
    shellRed,
    opticGlass,
    sightGreen,
    sightRed,
  ];

  // Cached highlighted material variants for hover inspection
  const highlightCache = new Map<THREE.Material, THREE.Material>();

  const getHighlightMaterial = (base: THREE.Material): THREE.Material => {
    const existing = highlightCache.get(base);
    if (existing) return existing;

    const cloned = base.clone();
    if (
      cloned instanceof THREE.MeshStandardMaterial ||
      cloned instanceof THREE.MeshPhysicalMaterial
    ) {
      cloned.emissive = new THREE.Color('#3b82f6');
      cloned.emissiveIntensity = Math.max(cloned.emissiveIntensity || 0, 0.38);
    }
    highlightCache.set(base, cloned);
    return cloned;
  };

  return {
    gunmetal,
    bluedSteel,
    anodizedAlloy,
    matteSteel,
    chromeSteel,
    darkBore,
    polymerDark,
    polymerGrip,
    polymerAccent,
    rubber,
    woodWalnut,
    woodLaminate,
    bakelite,
    brass,
    copperJacket,
    shellRed,
    opticGlass,
    sightGreen,
    sightRed,
    getHighlightMaterial,
    dispose: () => {
      textures.forEach((t) => t.dispose());
      allMaterials.forEach((m) => m.dispose());
      highlightCache.forEach((m) => m.dispose());
      highlightCache.clear();
    },
  };
}
