// Modelos 3D/cocoraModels.js
// Integración completa y reparada de los modelos externos de "Modelos 3D/" (Cocora 3D):
// - Cargadores estándar de Three.js (GLTFLoader, OBJLoader, FontLoader) apuntando a "/Modelos 3D/..."
// - Modelos integrados directamente: Personaje Paisa (1.80m), Fusil AK-47 (anclado a mano derecha),
//   Helicóptero UH-1 estrellado, Palma de Cera, Letrero COCORA + Cóndor, Danta/Cóndor, Cafeto, Rocas, Cerca y Botiquín.
// - Casa Colonial REPARADA: normales recalculadas + material cálido en tejas (cero techo negro) y cristales
//   con transparencia real (transparent: true, opacity: 0.35, depthWrite: false) sin muros opacos detrás.
// - Puente de Piedra REPARADA: sin EdgesGeometry/contornos negros sucios, sin bloques desfasados flotantes
//   y con geometría alineada y computeVertexNormals() suavizado.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const MODELOS_BASE_URL = '/Modelos%203D';
const TYPEFACE_URL = `${MODELOS_BASE_URL}/helvetiker_bold.typeface.json`;

let _parsedFont = null;
let _gltfLoader = null;
let _objLoader = null;
let _sharedToonGrad = null;
const _externalAssetCache = new Map();

export function getExternalToonGradient() {
  if (_sharedToonGrad) return _sharedToonGrad;
  const data = new Uint8Array([
    86, 86, 86, 255,
    148, 148, 148, 255,
    208, 208, 208, 255,
    255, 255, 255, 255
  ]);
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  _sharedToonGrad = tex;
  return tex;
}

/**
 * Precarga recursos estáticos servidos desde Express en "/Modelos 3D"
 * (fuente tipográfica 3D del monumento COCORA y cualquier .glb/.gltf/.obj opcional).
 */
export async function preloadExternalModelAssets(optionalFiles = []) {
  if (!_parsedFont) {
    try {
      const res = await fetch(TYPEFACE_URL);
      if (res.ok) {
        const fontJson = await res.json();
        _parsedFont = new FontLoader().parse(fontJson);
      }
    } catch {
      // Si se ejecuta en entorno sin red, buildCocoraSignGroup usa geometría de respaldo
    }
  }

  for (const relPath of optionalFiles) {
    try {
      await loadExternalModelFile(relPath);
    } catch {
      // Archivo opcional no presente
    }
  }
}

/**
 * Cargador compatible con archivos .glb, .gltf y .obj dentro de "/Modelos 3D/".
 */
export async function loadExternalModelFile(relativePath) {
  const cleanRel = relativePath.replace(/^\/+/, '');
  const url = `${MODELOS_BASE_URL}/${encodeURI(cleanRel)}`;
  if (_externalAssetCache.has(url)) {
    return _externalAssetCache.get(url).clone(true);
  }

  const ext = cleanRel.split('.').pop()?.toLowerCase();
  let rootObj = null;

  if (ext === 'glb' || ext === 'gltf') {
    if (!_gltfLoader) _gltfLoader = new GLTFLoader();
    const gltf = await _gltfLoader.loadAsync(url);
    rootObj = gltf.scene;
  } else if (ext === 'obj') {
    if (!_objLoader) _objLoader = new OBJLoader();
    rootObj = await _objLoader.loadAsync(url);
  } else {
    throw new Error(`Formato de modelo no soportado: ${relativePath}`);
  }

  rootObj.traverse((child) => {
    if (child.isMesh && child.geometry) {
      child.geometry.computeVertexNormals();
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  _externalAssetCache.set(url, rootObj);
  return rootObj.clone(true);
}

/* ============================================================================
 * PRNG determinista y Constructor de Geometrías Fusionadas con Normales Limpias
 * ============================================================================ */
export function modelRng(seed) {
  let a = (seed * 9301 + 49297) >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class GeoBuilder {
  constructor() {
    this.list = [];
  }

  add(geo, p = [0, 0, 0], r = [0, 0, 0], s = 1, order = 'XYZ') {
    const m = new THREE.Matrix4();
    const sc = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(s[0], s[1], s[2]);
    m.compose(
      new THREE.Vector3(p[0], p[1], p[2]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], order)),
      sc
    );
    return this.addM(geo, m);
  }

  addM(geo, m) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(m);
    if (m.determinant() < 0) {
      for (const attrName of Object.keys(g.attributes)) {
        const attr = g.attributes[attrName];
        const sz = attr.itemSize;
        const arr = attr.array;
        for (let v = 0; v < attr.count; v += 3) {
          for (let c = 0; c < sz; c++) {
            const ia = (v + 1) * sz + c;
            const ib = (v + 2) * sz + c;
            const tmp = arr[ia];
            arr[ia] = arr[ib];
            arr[ib] = tmp;
          }
        }
      }
    }
    this.list.push(g);
    return this;
  }

  addColored(geo, colorHex, p = [0, 0, 0], r = [0, 0, 0], s = 1, order = 'XYZ') {
    const m = new THREE.Matrix4();
    const sc = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(s[0], s[1], s[2]);
    m.compose(
      new THREE.Vector3(p[0], p[1], p[2]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], order)),
      sc
    );
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(m);
    const count = g.attributes.position.count;
    const col = new THREE.Color(colorHex);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const py = g.attributes.position.getY(i);
      const shade = 0.92 + Math.min(0.14, Math.max(0, py) * 0.012);
      colors[i * 3] = Math.min(1, col.r * shade);
      colors[i * 3 + 1] = Math.min(1, col.g * shade);
      colors[i * 3 + 2] = Math.min(1, col.b * shade);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.list.push(g);
    return this;
  }

  build(recomputeNormals = true) {
    if (!this.list.length) return new THREE.BufferGeometry();
    const anyColor = this.list.some((g) => Boolean(g.attributes.color));
    for (const g of this.list) {
      for (const name of Object.keys(g.attributes)) {
        if (!['position', 'normal', 'uv', 'color'].includes(name)) {
          g.deleteAttribute(name);
        }
      }
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) {
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      }
      if (anyColor && !g.attributes.color) {
        g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
      }
    }
    const merged = mergeGeometries(this.list, false) || new THREE.BufferGeometry();
    for (const g of this.list) g.dispose();
    this.list = [];
    if (recomputeNormals && merged.attributes.position) {
      merged.computeVertexNormals();
    } else if (merged.attributes.normal) {
      merged.normalizeNormals();
    }
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
  }
}

/** Roca facetada o canto rodado con desplazamiento orgánico, coordenadas UV y musgo superior por vértice. */
export function rockGeometry(seed, radius = 1, detail = 2, flatten = 0.72, moss = true, smoothRound = false) {
  const r = modelRng(seed);
  const o1 = r() * 10;
  const o2 = r() * 10;
  const o3 = r() * 10;
  const base = new THREE.IcosahedronGeometry(radius, detail);
  const g = smoothRound ? base : (base.index ? base.toNonIndexed() : base);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const ampScale = smoothRound ? 0.52 : 1.0;

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.copy(v).normalize();
    const d =
      ampScale *
      (0.18 * Math.sin(n.x * 3.1 + o1) * Math.cos(n.z * 2.7 + o2) +
        0.12 * Math.sin(n.y * 4.3 + o3) * Math.sin(n.x * 2.2 + o2) +
        0.06 * Math.cos(n.z * 6.1 + o1));
    v.multiplyScalar(1 + d);
    v.y *= flatten;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();

  const colors = new Float32Array(pos.count * 3);
  const uvs = new Float32Array(pos.count * 2);
  const grey = new THREE.Color(smoothRound ? '#858d94' : '#969a94');
  const dark = new THREE.Color(smoothRound ? '#4c5661' : '#5e635e');
  const green = new THREE.Color('#5a8f38');
  const nrm = g.attributes.normal;
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    const ny = nrm.getY(i);
    const h = py / Math.max(0.05, radius * flatten);
    c.copy(dark).lerp(grey, THREE.MathUtils.clamp(0.48 + h * 0.58, 0, 1));
    if (moss) {
      const mossMask = THREE.MathUtils.smoothstep(ny, 0.48, 0.93) * (smoothRound ? 0.55 : 0.85);
      c.lerp(green, mossMask);
    }
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
    uvs[i * 2] = (px + py * 0.35) * 0.85 + 0.5;
    uvs[i * 2 + 1] = (pz + py * 0.35) * 0.85 + 0.5;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/* ============================================================================
 * Texturas Procedurales Compartidas en Caché (Cero duplicación en VRAM)
 * ============================================================================ */
const _texCache = new Map();

function getCachedTex(key, factory) {
  let t = _texCache.get(key);
  if (!t) {
    t = factory();
    _texCache.set(key, t);
  }
  return t;
}

function makeCanvasTex(w, h, draw, repeat = [1, 1]) {
  if (typeof document === 'undefined') {
    const dt = new THREE.DataTexture(new Uint8Array([240, 240, 240, 255]), 1, 1, THREE.RGBAFormat);
    dt.wrapS = THREE.RepeatWrapping;
    dt.wrapT = THREE.RepeatWrapping;
    dt.repeat.set(repeat[0], repeat[1]);
    dt.needsUpdate = true;
    return dt;
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  return t;
}

function drawRoundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawSpeckle(ctx, w, h, n, colors, r, maxR = 2, alpha = 0.25) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.globalAlpha = alpha * (0.4 + r() * 0.6);
    ctx.beginPath();
    ctx.arc(r() * w, r() * h, 0.5 + r() * maxR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export const MODEL_TEX = {
  rockDiffuse() {
    return getCachedTex('rockDiffuse|512', () =>
      makeCanvasTex(512, 512, (ctx, w, h) => {
        ctx.fillStyle = '#cfcfcb';
        ctx.fillRect(0, 0, w, h);
        const r = modelRng(411);
        drawSpeckle(ctx, w, h, 2400, ['#a3a6a0', '#e2e3de', '#7c817c', '#b7bab4'], r, 3.4, 0.28);
        // Vetas oscuras de erosión hídrica y grietas naturales
        for (let i = 0; i < 42; i++) {
          ctx.strokeStyle = i % 3 === 0 ? '#555b56' : '#737974';
          ctx.globalAlpha = 0.22 + r() * 0.26;
          ctx.lineWidth = 1.0 + r() * 2.6;
          let x = r() * w;
          let y = r() * h;
          ctx.beginPath();
          ctx.moveTo(x, y);
          for (let s = 0; s < 5; s++) {
            x += (r() - 0.5) * 86;
            y += 18 + r() * 44;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        // Manchas orgánicas suaves de musgo y liquen andino
        for (let m = 0; m < 28; m++) {
          const mx = r() * w;
          const my = r() * h;
          const mr = 14 + r() * 36;
          const grad = ctx.createRadialGradient(mx, my, 2, mx, my, mr);
          grad.addColorStop(0, 'rgba(94, 148, 62, 0.44)');
          grad.addColorStop(0.65, 'rgba(78, 126, 54, 0.22)');
          grad.addColorStop(1, 'rgba(78, 126, 54, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(mx, my, mr, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }, [1.6, 1.6])
    );
  },

  rockBumpRoughness() {
    return getCachedTex('rockBumpRough|512', () => {
      const tex = makeCanvasTex(512, 512, (ctx, w, h) => {
        ctx.fillStyle = '#9a9a9a';
        ctx.fillRect(0, 0, w, h);
        const r = modelRng(411);
        drawSpeckle(ctx, w, h, 3000, ['#666666', '#d4d4d4', '#4d4d4d', '#bcbcbc'], r, 3.0, 0.36);
        // Surcos profundos de erosión (oscuros = hendidura en bumpMap)
        for (let i = 0; i < 42; i++) {
          ctx.strokeStyle = '#222222';
          ctx.globalAlpha = 0.45 + r() * 0.35;
          ctx.lineWidth = 1.2 + r() * 3.0;
          let x = r() * w;
          let y = r() * h;
          ctx.beginPath();
          ctx.moveTo(x, y);
          for (let s = 0; s < 5; s++) {
            x += (r() - 0.5) * 86;
            y += 18 + r() * 44;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        // Relieve esponjoso de parches de musgo (rugosidad alta = claro)
        for (let m = 0; m < 28; m++) {
          const mx = r() * w;
          const my = r() * h;
          const mr = 12 + r() * 32;
          const grad = ctx.createRadialGradient(mx, my, 2, mx, my, mr);
          grad.addColorStop(0, 'rgba(235, 235, 235, 0.55)');
          grad.addColorStop(1, 'rgba(154, 154, 154, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(mx, my, mr, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }, [1.6, 1.6]);
      tex.colorSpace = THREE.NoColorSpace;
      return tex;
    });
  },

  wood(rep = [1, 1], base = '#8a5a2b', dark = '#4f2f12') {
    return getCachedTex(`wood|${rep.join(',')}|${base}|${dark}`, () =>
      makeCanvasTex(256, 256, (ctx, w, h) => {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, w, h);
        const r = modelRng(11);
        for (let i = 0; i < 90; i++) {
          ctx.strokeStyle = r() > 0.45 ? dark : '#ffffff';
          ctx.globalAlpha = 0.08 + r() * 0.3;
          ctx.lineWidth = 0.8 + r() * 3;
          const x = r() * w;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.bezierCurveTo(
            x + (r() - 0.5) * 26,
            h * 0.33,
            x + (r() - 0.5) * 26,
            h * 0.66,
            x + (r() - 0.5) * 12,
            h
          );
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }, rep)
    );
  },

  stone(rep = [1, 1], seed = 3) {
    return getCachedTex(`stone|${rep.join(',')}|${seed}`, () =>
      makeCanvasTex(512, 512, (ctx, w, h) => {
        ctx.fillStyle = '#625f57';
        ctx.fillRect(0, 0, w, h);
        const r = modelRng(seed);
        const cols = 5;
        const rows = 5;
        const cw = w / cols;
        const ch = h / rows;
        const palette = ['#9d9a90', '#8d8a81', '#a8a59b', '#817e76', '#948f84', '#b0aba0', '#8a8f86'];
        for (let j = 0; j < rows; j++) {
          for (let i = -1; i < cols; i++) {
            const off = (j % 2) * cw * 0.5;
            const x = i * cw + off + 5 + (r() - 0.5) * 6;
            const y = j * ch + 5 + (r() - 0.5) * 6;
            const sw = cw - 11 - r() * 10;
            const sh = ch - 11 - r() * 8;
            const col = palette[Math.floor(r() * palette.length)];
            for (const dx of [0, w]) {
              ctx.fillStyle = col;
              drawRoundRect(ctx, x + dx, y, sw, sh, 10 + r() * 12);
              ctx.fill();
              ctx.fillStyle = 'rgba(255,255,255,0.13)';
              drawRoundRect(ctx, x + dx + 4, y + 4, sw - 8, sh * 0.35, 8);
              ctx.fill();
              ctx.fillStyle = 'rgba(0,0,0,0.18)';
              drawRoundRect(ctx, x + dx + 4, y + sh * 0.7, sw - 8, sh * 0.26, 8);
              ctx.fill();
            }
          }
        }
        drawSpeckle(ctx, w, h, 700, ['#000000', '#ffffff', '#6f8a4a'], r, 2.0, 0.18);
      }, rep)
    );
  },

  stucco(rep = [1, 1]) {
    return getCachedTex(`stucco|${rep.join(',')}`, () =>
      makeCanvasTex(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#f6f1e6';
        ctx.fillRect(0, 0, w, h);
        const r = modelRng(5);
        drawSpeckle(ctx, w, h, 1100, ['#dfd7c4', '#ffffff', '#cfc5b0'], r, 1.5, 0.3);
      }, rep)
    );
  },

  ruana() {
    return getCachedTex('ruana', () =>
      makeCanvasTex(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#f5f2e8';
        ctx.fillRect(0, 0, w, h);
        const r = modelRng(2);
        ctx.strokeStyle = '#e7e1d0';
        ctx.lineWidth = 1;
        for (let y = 0; y < h; y += 3) {
          ctx.globalAlpha = 0.55;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        const band = (y, t, c = '#1a1a1a') => {
          ctx.fillStyle = c;
          ctx.fillRect(0, y, w, t);
        };
        band(h - 54, 8);
        band(h - 40, 3);
        band(h - 30, 13);
        band(h - 11, 4);
        band(Math.round(h * 0.46), 5, '#232323');
        band(Math.round(h * 0.46) + 9, 2, '#232323');
        band(Math.round(h * 0.2), 4, '#232323');
        ctx.fillStyle = '#8a8378';
        for (let x = 0; x < w; x += 6) ctx.fillRect(x, h - 5, 3, 5);
        drawSpeckle(ctx, w, h, 420, ['#dcd6c6', '#ffffff'], r, 1.2, 0.35);
      }, [2, 1])
    );
  },

  sombreroBrim() {
    return getCachedTex('sombreroBrim', () =>
      makeCanvasTex(512, 512, (ctx, w, h) => {
        const cx = w / 2;
        const cy = h / 2;
        const R = w / 2;
        ctx.fillStyle = '#e9dfc2';
        ctx.fillRect(0, 0, w, h);
        const ring = (r0, r1, color) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(cx, cy, r1 * R, 0, Math.PI * 2);
          ctx.arc(cx, cy, r0 * R, 0, Math.PI * 2, true);
          ctx.fill();
        };
        ring(0.955, 1.0, '#1a1a1a');
        ring(0.9, 0.925, '#1a1a1a');
        ctx.fillStyle = '#1a1a1a';
        const N = 40;
        for (let i = 0; i < N; i++) {
          const a0 = (i / N) * Math.PI * 2;
          const a1 = ((i + 0.5) / N) * Math.PI * 2;
          const a2 = ((i + 1) / N) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a0) * 0.86 * R, cy + Math.sin(a0) * 0.86 * R);
          ctx.lineTo(cx + Math.cos(a1) * 0.7 * R, cy + Math.sin(a1) * 0.7 * R);
          ctx.lineTo(cx + Math.cos(a2) * 0.86 * R, cy + Math.sin(a2) * 0.86 * R);
          ctx.closePath();
          ctx.fill();
        }
        ring(0.66, 0.685, '#1a1a1a');
        ring(0.56, 0.6, '#1a1a1a');
        ring(0, 0.47, '#1a1a1a');
        const r = modelRng(4);
        drawSpeckle(ctx, w, h, 450, ['#b9ad8a'], r, 1.5, 0.32);
      })
    );
  },

  sombreroBand() {
    return getCachedTex('sombreroBand', () =>
      makeCanvasTex(256, 64, (ctx, w, h) => {
        ctx.fillStyle = '#e9dfc2';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, w, 6);
        ctx.fillRect(0, h - 6, w, 6);
        const n = 10;
        for (let i = 0; i < n; i++) {
          ctx.beginPath();
          ctx.moveTo((i / n) * w, 10);
          ctx.lineTo(((i + 0.5) / n) * w, h - 10);
          ctx.lineTo(((i + 1) / n) * w, 10);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = '#e9dfc2';
        for (let i = 0; i < n; i++) {
          ctx.beginPath();
          ctx.moveTo((i / n) * w + 6, 14);
          ctx.lineTo(((i + 0.5) / n) * w, h - 22);
          ctx.lineTo(((i + 1) / n) * w - 6, 14);
          ctx.closePath();
          ctx.fill();
        }
      }, [3, 1])
    );
  },

  heliSkin() {
    return getCachedTex('heliSkin', () =>
      makeCanvasTex(512, 512, (ctx, w, h) => {
        ctx.fillStyle = '#56653f';
        ctx.fillRect(0, 0, w, h);
        const r = modelRng(21);
        for (let i = 0; i < 24; i++) {
          ctx.fillStyle = r() > 0.5 ? '#48573a' : '#62714a';
          ctx.globalAlpha = 0.35;
          ctx.beginPath();
          ctx.ellipse(r() * w, r() * h, 30 + r() * 80, 20 + r() * 50, r() * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(30,38,24,0.5)';
        ctx.lineWidth = 2;
        for (let y = 60; y < h; y += 110) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
        for (let x = 90; x < w; x += 140) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(25,30,20,0.6)';
        for (let y = 52; y < h; y += 110) {
          for (let x = 6; x < w; x += 14) {
            ctx.beginPath();
            ctx.arc(x, y, 1.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        const grd = ctx.createRadialGradient(w * 0.12, h * 0.55, 10, w * 0.12, h * 0.55, w * 0.42);
        grd.addColorStop(0, 'rgba(10,10,10,0.95)');
        grd.addColorStop(0.5, 'rgba(20,18,14,0.6)');
        grd.addColorStop(1, 'rgba(20,18,14,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);
        drawSpeckle(ctx, w, h, 360, ['#000000', '#ffffff'], r, 1.5, 0.2);
      })
    );
  },

  medLabel() {
    return getCachedTex('medLabel', () =>
      makeCanvasTex(256, 128, (ctx, w, h) => {
        ctx.fillStyle = '#f8fbff';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#19c7e6';
        ctx.fillRect(0, 0, w, 10);
        ctx.fillRect(0, h - 10, w, 10);
        ctx.fillStyle = '#e8313b';
        for (const x of [64, 192]) {
          ctx.fillRect(x - 10, 28, 20, 72);
          ctx.fillRect(x - 36, 54, 72, 20);
        }
        ctx.fillStyle = '#1b2a38';
        ctx.font = 'bold 26px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('SALUD', 128, 64);
      }, [2, 1])
    );
  }
};

/* ============================================================================
 * 1. FUSIL AK-47 EXTERNO (AK47.tsx) — Anclado al punto de agarre de mano derecha
 * ============================================================================ */
let _sharedAkMagGeo = null;
let _sharedAkMaterials = null;

function getSharedAkAssets() {
  if (!_sharedAkMagGeo) {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(0.07, 0);
    s.quadraticCurveTo(0.1, -0.09, 0.075, -0.19);
    s.lineTo(0.06, -0.215);
    s.quadraticCurveTo(0.03, -0.235, 0.0, -0.21);
    s.quadraticCurveTo(0.012, -0.12, -0.005, -0.04);
    s.lineTo(0, 0);
    _sharedAkMagGeo = new THREE.ExtrudeGeometry(s, {
      depth: 0.028,
      bevelEnabled: true,
      bevelSize: 0.003,
      bevelThickness: 0.003,
      bevelSegments: 2,
      curveSegments: 10
    });
    _sharedAkMagGeo.translate(0, 0, -0.014);
    _sharedAkMagGeo.computeVertexNormals();
  }

  if (!_sharedAkMaterials) {
    const woodTex = MODEL_TEX.wood([1, 1], '#8a5a2b', '#4a2a0e');
    _sharedAkMaterials = {
      darkMetal: new THREE.MeshStandardMaterial({ color: '#2a2c30', metalness: 0.7, roughness: 0.38 }),
      coverMetal: new THREE.MeshStandardMaterial({ color: '#33363b', metalness: 0.7, roughness: 0.36 }),
      midMetal: new THREE.MeshStandardMaterial({ color: '#44474d', metalness: 0.72, roughness: 0.35 }),
      magMetal: new THREE.MeshStandardMaterial({ color: '#35383d', metalness: 0.68, roughness: 0.4 }),
      muzzleMetal: new THREE.MeshStandardMaterial({ color: '#1f2124', metalness: 0.75, roughness: 0.35 }),
      rodMetal: new THREE.MeshStandardMaterial({ color: '#6b7280', metalness: 0.8, roughness: 0.3 }),
      wood: new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.56, metalness: 0.06 }),
      gripWood: new THREE.MeshStandardMaterial({ map: woodTex, color: '#6e4019', roughness: 0.66, metalness: 0.05 }),
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
  }

  return { magGeo: _sharedAkMagGeo, M: _sharedAkMaterials };
}

function addPrim(parent, geo, mat, p = null, r = null, cast = true) {
  const mesh = new THREE.Mesh(geo, mat);
  if (p) mesh.position.set(p[0], p[1], p[2]);
  if (r) mesh.rotation.set(r[0], r[1], r[2]);
  mesh.castShadow = cast;
  mesh.receiveShadow = cast;
  parent.add(mesh);
  return mesh;
}

/**
 * Construye el modelo externo AK-47 alineando el centro de la empuñadura con (0, -0.045, 0)
 * y el cañón apuntando hacia +Z (convención de armas del jugador y vista 1ra/3ra persona).
 */
export function createExternalAK47Mesh(scale = 1.0) {
  const { magGeo, M } = getSharedAkAssets();
  const root = new THREE.Group();
  root.scale.setScalar(scale);

  // En AK47.tsx el cañón apunta en +X y la empuñadura está en x = -0.075, y = -0.075.
  // Rotamos -90° en Y (+X -> +Z) y trasladamos +0.066 en Z y +0.032 en Y para anclar
  // la empuñadura exactamente en la palma de la mano derecha (0, -0.04, 0).
  const akInner = new THREE.Group();
  akInner.scale.setScalar(0.92);
  akInner.rotation.y = -Math.PI / 2;
  akInner.position.set(0, 0.032, 0.068);
  root.add(akInner);

  // Cajón de mecanismos
  addPrim(akInner, new THREE.BoxGeometry(0.3, 0.065, 0.034), M.darkMetal);
  const slideGroup = new THREE.Group();
  addPrim(slideGroup, new THREE.BoxGeometry(0.27, 0.022, 0.036), M.coverMetal, [0, 0.043, 0]);
  addPrim(slideGroup, new THREE.CylinderGeometry(0.008, 0.008, 0.03, 8), M.midMetal, [0.07, 0.012, 0.03], [Math.PI / 2, 0, 0]);
  akInner.add(slideGroup);

  addPrim(akInner, new THREE.BoxGeometry(0.045, 0.03, 0.03), M.darkMetal, [0.125, 0.06, 0]);
  addPrim(akInner, new THREE.BoxGeometry(0.06, 0.004, 0.014), M.darkMetal, [0.095, 0.078, 0]);
  addPrim(akInner, new THREE.BoxGeometry(0.07, 0.006, 0.004), M.midMetal, [-0.02, 0.0, 0.019], [0, 0, -0.25]);
  addPrim(akInner, new THREE.BoxGeometry(0.075, 0.004, 0.02), M.darkMetal, [-0.02, -0.066, 0]);
  addPrim(akInner, new THREE.BoxGeometry(0.004, 0.034, 0.02), M.darkMetal, [0.016, -0.05, 0]);
  addPrim(akInner, new THREE.BoxGeometry(0.004, 0.034, 0.02), M.darkMetal, [-0.056, -0.05, 0]);
  addPrim(akInner, new THREE.BoxGeometry(0.006, 0.03, 0.008), M.midMetal, [-0.012, -0.048, 0], [0, 0, 0.3]);
  addPrim(akInner, new THREE.BoxGeometry(0.02, 0.012, 0.012), M.darkMetal, [0.08, -0.038, 0]);

  // Culata de madera
  addPrim(akInner, new THREE.BoxGeometry(0.25, 0.055, 0.036), M.wood, [-0.27, -0.012, 0], [0, 0, -0.12]);
  addPrim(akInner, new THREE.BoxGeometry(0.03, 0.125, 0.04), M.muzzleMetal, [-0.395, -0.03, 0], [0, 0, -0.12]);
  addPrim(akInner, new THREE.TorusGeometry(0.012, 0.003, 6, 12), M.midMetal, [-0.33, -0.045, 0], [Math.PI / 2, 0, 0]);

  // Empuñadura trasera (punto exacto de agarre de la mano derecha)
  addPrim(akInner, new THREE.BoxGeometry(0.036, 0.1, 0.03), M.gripWood, [-0.075, -0.075, 0], [0, 0, 0.35]);

  // Cargador curvo extruido
  const magGroup = new THREE.Group();
  const magMesh = new THREE.Mesh(magGeo.clone(), M.magMetal);
  magMesh.position.set(0.012, -0.033, 0);
  magMesh.castShadow = true;
  magGroup.add(magMesh);
  akInner.add(magGroup);

  // Guardamanos de madera
  addPrim(akInner, new THREE.BoxGeometry(0.13, 0.04, 0.04), M.wood, [0.225, -0.004, 0]);
  addPrim(akInner, new THREE.BoxGeometry(0.12, 0.022, 0.032), M.wood, [0.225, 0.042, 0]);
  addPrim(akInner, new THREE.BoxGeometry(0.012, 0.07, 0.042), M.darkMetal, [0.165, 0.01, 0]);

  // Cañón, tubo de gases, guion delantero y freno de boca
  addPrim(akInner, new THREE.CylinderGeometry(0.0095, 0.0095, 0.42, 12), M.darkMetal, [0.36, 0.004, 0], [0, 0, Math.PI / 2]);
  addPrim(akInner, new THREE.CylinderGeometry(0.011, 0.011, 0.17, 10), M.midMetal, [0.32, 0.042, 0], [0, 0, Math.PI / 2]);
  addPrim(akInner, new THREE.BoxGeometry(0.035, 0.05, 0.03), M.darkMetal, [0.405, 0.02, 0]);
  addPrim(akInner, new THREE.BoxGeometry(0.03, 0.055, 0.026), M.darkMetal, [0.5, 0.025, 0]);
  addPrim(akInner, new THREE.CylinderGeometry(0.0025, 0.0025, 0.028, 6), M.rodMetal, [0.5, 0.065, 0]);
  addPrim(akInner, new THREE.BoxGeometry(0.006, 0.03, 0.004), M.darkMetal, [0.5, 0.07, 0.011]);
  addPrim(akInner, new THREE.BoxGeometry(0.006, 0.03, 0.004), M.darkMetal, [0.5, 0.07, -0.011]);
  addPrim(akInner, new THREE.CylinderGeometry(0.013, 0.013, 0.04, 12), M.muzzleMetal, [0.585, 0.004, 0], [0, 0, Math.PI / 2]);
  addPrim(akInner, new THREE.BoxGeometry(0.03, 0.03, 0.028), M.muzzleMetal, [0.59, 0.006, 0], [0, 0, 0.6]);
  addPrim(akInner, new THREE.CylinderGeometry(0.003, 0.003, 0.3, 6), M.rodMetal, [0.36, -0.016, 0], [0, 0, Math.PI / 2]);
  addPrim(akInner, new THREE.TorusGeometry(0.012, 0.003, 6, 12), M.midMetal, [0.41, -0.012, 0]);

  // Punto de boca de cañón y fogonazo triple (alineado a +Z)
  const muzzleTip = new THREE.Object3D();
  muzzleTip.position.set(0, 0.036, 0.656);
  root.add(muzzleTip);

  const flash = new THREE.Group();
  addPrim(flash, new THREE.ConeGeometry(0.046, 0.15, 8), M.flashOuter, [0, 0, 0.055], [Math.PI / 2, 0, 0], false);
  addPrim(flash, new THREE.ConeGeometry(0.082, 0.085, 6), M.flashMid, [0, 0, -0.01], [-Math.PI / 2, 0, 0], false);
  addPrim(flash, new THREE.SphereGeometry(0.042, 8, 8), M.flashCore, [0, 0, 0], null, false);
  flash.visible = false;
  muzzleTip.add(flash);

  root.userData.muzzleTip = muzzleTip;
  root.userData.slideGroup = slideGroup;
  root.userData.magGroup = magGroup;
  root.userData.muzzleFlash = flash;
  return root;
}

/* ============================================================================
 * 2. PERSONAJE PAISA EXTERNO (Character.tsx) — Escala 1.80m y Rig Jerárquico
 * ============================================================================ */
let _sharedFringeGeo = null;
let _sharedHatBrimGeo = null;
let _sharedHatCrownGeo = null;

function getSharedCharacterGeos() {
  if (!_sharedFringeGeo) {
    const b = new GeoBuilder();
    const thread = new THREE.BoxGeometry(0.02, 0.095, 0.014);
    const n = 70;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const sx = Math.sin(a);
      const cz = Math.cos(a);
      if (Math.abs(sx) > 0.93) continue; // Aperturas laterales libres para los brazos
      b.add(thread, [sx * 0.43, -0.37, cz * 0.29], [0, a, (i % 2 ? 1 : -1) * 0.06]);
    }
    thread.dispose();
    _sharedFringeGeo = b.build(true);
  }

  if (!_sharedHatBrimGeo) {
    const prof = [
      [0.155, 0.0], [0.24, 0.004], [0.33, 0.018], [0.4, 0.042], [0.44, 0.072], [0.452, 0.095],
      [0.446, 0.098], [0.434, 0.078], [0.39, 0.05], [0.32, 0.026], [0.235, 0.012], [0.155, 0.008]
    ];
    const pts = prof.map(([x, y]) => new THREE.Vector2(x * 0.72, y * 0.78));
    _sharedHatBrimGeo = new THREE.LatheGeometry(pts, 36);
    _sharedHatBrimGeo.computeVertexNormals();
  }

  if (!_sharedHatCrownGeo) {
    const prof = [
      [0.158, 0.0], [0.172, 0.03], [0.176, 0.075], [0.168, 0.115],
      [0.148, 0.145], [0.11, 0.165], [0.06, 0.176], [0.0, 0.179]
    ];
    const pts = prof.map(([x, y]) => new THREE.Vector2(x * 0.74, y * 0.76));
    _sharedHatCrownGeo = new THREE.LatheGeometry(pts, 32);
    _sharedHatCrownGeo.computeVertexNormals();
  }

  return {
    fringeGeo: _sharedFringeGeo,
    hatBrimGeo: _sharedHatBrimGeo,
    hatCrownGeo: _sharedHatCrownGeo
  };
}

/**
 * Construye el modelo detallado del Personaje Paisa de "Modelos 3D/" (1.80m exactos,
 * suelas en y = 0.00, cadera en y = 0.985, ruana abierta con flecos, mochila táctica oliva,
 * manos articuladas con dedos, sombrero vueltiao en LatheGeometry y anclaje exacto en mano derecha).
 */
export function buildExternalCharacterRig(shirtHex, toonGrad) {
  const { fringeGeo, hatBrimGeo, hatCrownGeo } = getSharedCharacterGeos();
  const ruanaTex = MODEL_TEX.ruana();
  const hatBrimTex = MODEL_TEX.sombreroBrim();
  const hatBandTex = MODEL_TEX.sombreroBand();

  const skinMat = new THREE.MeshToonMaterial({ color: '#c88d65', gradientMap: toonGrad });
  const shirtMat = new THREE.MeshToonMaterial({ color: shirtHex, gradientMap: toonGrad });
  const creamSleeveMat = new THREE.MeshToonMaterial({ color: '#f3efe4', gradientMap: toonGrad });
  const pantsMat = new THREE.MeshToonMaterial({ color: '#343942', gradientMap: toonGrad });
  const bootMat = new THREE.MeshToonMaterial({ color: '#4a2f1a', gradientMap: toonGrad });
  const soleMat = new THREE.MeshToonMaterial({ color: '#22150c', gradientMap: toonGrad });
  const beltMat = new THREE.MeshToonMaterial({ color: '#2c2118', gradientMap: toonGrad });
  const buckleMat = new THREE.MeshToonMaterial({
    color: '#c9a24a',
    emissive: '#7a5a1a',
    emissiveIntensity: 0.15,
    gradientMap: toonGrad
  });
  const ruanaMat = new THREE.MeshToonMaterial({
    map: ruanaTex,
    color: '#f6f3ea',
    side: THREE.DoubleSide,
    gradientMap: toonGrad
  });
  const fringeMat = new THREE.MeshToonMaterial({ color: '#efe9db', gradientMap: toonGrad });
  const packMainMat = new THREE.MeshToonMaterial({ color: '#4b5320', gradientMap: toonGrad });
  const packSubMat = new THREE.MeshToonMaterial({ color: '#556b2f', gradientMap: toonGrad });
  const packDarkMat = new THREE.MeshToonMaterial({ color: '#3d4419', gradientMap: toonGrad });
  const strapMat = new THREE.MeshToonMaterial({ color: '#23261f', gradientMap: toonGrad });
  const bedrollMat = new THREE.MeshToonMaterial({ color: '#c9b48a', gradientMap: toonGrad });
  const hairMat = new THREE.MeshToonMaterial({ color: '#241812', gradientMap: toonGrad });
  const scleraMat = new THREE.MeshToonMaterial({ color: '#f7f4ee', gradientMap: toonGrad });
  const hatBrimMat = new THREE.MeshToonMaterial({ map: hatBrimTex, color: '#efe6cc', side: THREE.DoubleSide, gradientMap: toonGrad });
  const hatCrownMat = new THREE.MeshToonMaterial({ map: hatBandTex, color: '#f0e8d2', gradientMap: toonGrad });

  const allAvatarMats = [
    skinMat, shirtMat, creamSleeveMat, pantsMat, bootMat, soleMat, beltMat, buckleMat,
    ruanaMat, fringeMat, packMainMat, packSubMat, packDarkMat, strapMat, bedrollMat,
    hairMat, scleraMat, hatBrimMat, hatCrownMat
  ];
  const hitFlashMats = [skinMat, shirtMat, creamSleeveMat, pantsMat, ruanaMat, packMainMat];
  const sharedGeos = new Set([fringeGeo, hatBrimGeo, hatCrownGeo]);

  const root = new THREE.Group();
  const pelvisGroup = new THREE.Group();
  pelvisGroup.position.set(0, 0.985, 0);
  root.add(pelvisGroup);

  // Pelvis + Cinturón de cuero con hebilla dorada
  const hipSphere = addPrim(pelvisGroup, new THREE.SphereGeometry(0.135, 14, 12), pantsMat);
  hipSphere.scale.set(1.1, 0.8, 0.9);
  addPrim(pelvisGroup, new THREE.CylinderGeometry(0.145, 0.14, 0.075, 16), beltMat, [0, 0.04, 0]);
  addPrim(pelvisGroup, new THREE.BoxGeometry(0.075, 0.05, 0.02), buckleMat, [0, 0.04, 0.145]);

  // Piernas articuladas (cadera -> rodilla -> tobillo -> bota montañera con labrado)
  // Nota anatómica (+Z al frente, +Y arriba): izquierda = +X, derecha = -X
  const makeDetailedLeg = (sideX) => {
    const hip = new THREE.Group();
    hip.position.set(sideX * 0.11, -0.06, 0);

    const hipJoint = addPrim(hip, new THREE.SphereGeometry(0.098, 12, 10), pantsMat);
    hipJoint.scale.set(1, 1.1, 1);
    addPrim(hip, new THREE.CapsuleGeometry(0.082, 0.24, 4, 12), pantsMat, [0, -0.2, 0]);

    const knee = new THREE.Group();
    knee.position.set(0, -0.44, 0);
    addPrim(knee, new THREE.SphereGeometry(0.076, 10, 8), pantsMat, [0, 0.01, 0.01]);
    addPrim(knee, new THREE.CapsuleGeometry(0.066, 0.22, 4, 10), pantsMat, [0, -0.18, 0]);
    addPrim(knee, new THREE.CylinderGeometry(0.068, 0.07, 0.06, 10), bootMat, [0, -0.3, 0]);

    const ankle = new THREE.Group();
    ankle.position.set(0, -0.34, 0);
    addPrim(ankle, new THREE.BoxGeometry(0.132, 0.15, 0.16), bootMat, [0, -0.05, 0.01]);
    addPrim(ankle, new THREE.BoxGeometry(0.126, 0.10, 0.19), bootMat, [0, -0.075, 0.1]);
    addPrim(ankle, new THREE.BoxGeometry(0.128, 0.02, 0.05), soleMat, [0, -0.045, 0.17]);
    addPrim(ankle, new THREE.BoxGeometry(0.142, 0.035, 0.35), soleMat, [0, -0.128, 0.045]);
    for (let t = 0; t < 3; t++) {
      addPrim(ankle, new THREE.BoxGeometry(0.144, 0.012, 0.03), strapMat, [0, -0.11, -0.05 + t * 0.09]);
    }
    knee.add(ankle);
    hip.add(knee);
    return { hip, knee, ankle };
  };

  const leftLeg = makeDetailedLeg(1);
  const rightLeg = makeDetailedLeg(-1);
  pelvisGroup.add(leftLeg.hip, rightLeg.hip);

  // Columna / Torso
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 0.10, 0);
  pelvisGroup.add(torsoGroup);

  const chestGroup = new THREE.Group();
  const upperChest = addPrim(chestGroup, new THREE.CapsuleGeometry(0.15, 0.28, 4, 14), shirtMat, [0, 0.17, 0]);
  upperChest.scale.set(1.24, 1, 0.78);
  const waistCyl = addPrim(chestGroup, new THREE.CylinderGeometry(0.115, 0.138, 0.16, 14), shirtMat, [0, 0, 0]);
  waistCyl.scale.set(1.18, 1, 0.85);
  torsoGroup.add(chestGroup);

  // Ruana Paisa articulada en 2 paneles independientes (delantero ruanaF y trasero ruanaB — Animación v2)
  const ruanaGroup = new THREE.Group();
  const ruanaFrontPivot = new THREE.Group();
  ruanaFrontPivot.position.set(0, 0.38, 0);
  const ruanaFront = addPrim(
    ruanaFrontPivot,
    new THREE.CylinderGeometry(0.255, 0.38, 0.70, 18, 1, true, -Math.PI / 2 + 0.36, Math.PI - 0.72),
    ruanaMat,
    [0, -0.31, 0]
  );
  ruanaFront.scale.set(1.08, 1, 0.74);

  const ruanaBackPivot = new THREE.Group();
  ruanaBackPivot.position.set(0, 0.38, 0);
  const ruanaBack = addPrim(
    ruanaBackPivot,
    new THREE.CylinderGeometry(0.255, 0.38, 0.70, 18, 1, true, Math.PI / 2 + 0.36, Math.PI - 0.72),
    ruanaMat,
    [0, -0.31, 0]
  );
  ruanaBack.scale.set(1.08, 1, 0.74);

  const ruanaYoke = addPrim(
    ruanaGroup,
    new THREE.CylinderGeometry(0.225, 0.265, 0.13, 18, 1, true),
    ruanaMat,
    [0, 0.39, 0]
  );
  ruanaYoke.scale.set(1.08, 1, 0.74);
  const fringeMesh = new THREE.Mesh(fringeGeo, fringeMat);
  fringeMesh.position.y = 0.08;
  fringeMesh.castShadow = true;
  ruanaGroup.add(ruanaFrontPivot, ruanaBackPivot, fringeMesh);
  torsoGroup.add(ruanaGroup);

  // Mochila táctica militar detallada en la espalda (-Z)
  const backpackGroup = new THREE.Group();
  backpackGroup.position.set(0, 0.16, -0.25);
  addPrim(backpackGroup, new THREE.BoxGeometry(0.36, 0.46, 0.19), packMainMat, [0, 0, 0]);
  const packTopDome = addPrim(backpackGroup, new THREE.SphereGeometry(0.09, 10, 8), packMainMat, [0, 0.18, 0]);
  packTopDome.scale.set(1.85, 0.7, 1);
  addPrim(backpackGroup, new THREE.BoxGeometry(0.34, 0.15, 0.22), packSubMat, [0, 0.27, -0.01]);
  addPrim(backpackGroup, new THREE.BoxGeometry(0.32, 0.045, 0.225), packDarkMat, [0, 0.34, -0.01]);
  for (const sx of [-1, 1]) {
    addPrim(backpackGroup, new THREE.BoxGeometry(0.045, 0.18, 0.024), strapMat, [sx * 0.095, 0.27, 0.11]);
    addPrim(backpackGroup, new THREE.BoxGeometry(0.09, 0.22, 0.14), packSubMat, [sx * 0.22, -0.05, 0]);
    addPrim(backpackGroup, new THREE.BoxGeometry(0.095, 0.07, 0.15), packDarkMat, [sx * 0.22, 0.07, 0]);
    addPrim(
      backpackGroup,
      new THREE.BoxGeometry(0.065, 0.32, 0.032),
      strapMat,
      [sx * 0.12, 0.27, 0.095],
      [-0.3, 0, sx * 0.06]
    );
  }
  addPrim(backpackGroup, new THREE.BoxGeometry(0.28, 0.18, 0.055), packDarkMat, [0, -0.12, -0.12]);
  addPrim(
    backpackGroup,
    new THREE.CylinderGeometry(0.055, 0.055, 0.32, 10),
    bedrollMat,
    [0, 0.39, -0.025],
    [0, 0, Math.PI / 2]
  );
  torsoGroup.add(backpackGroup);

  // Botiquín sostenido en manos durante curación canalizada
  const healProp = new THREE.Group();
  const healCaseMat = new THREE.MeshLambertMaterial({ color: '#f2f4f4' });
  const healCrossMat = new THREE.MeshLambertMaterial({ color: '#e02b2b' });
  addPrim(healProp, new THREE.BoxGeometry(0.22, 0.13, 0.11), healCaseMat);
  addPrim(healProp, new THREE.BoxGeometry(0.038, 0.016, 0.115), healCrossMat, [0, 0.066, 0]);
  addPrim(healProp, new THREE.BoxGeometry(0.11, 0.016, 0.038), healCrossMat, [0, 0.066, 0]);
  addPrim(healProp, new THREE.BoxGeometry(0.06, 0.028, 0.02), strapMat, [0, 0.075, 0]);
  healProp.position.set(0, 0.18, 0.34);
  healProp.rotation.x = 0.32;
  healProp.visible = false;
  torsoGroup.add(healProp);

  // Cuello, Cabeza detallada y Sombrero Vueltiao en LatheGeometry
  const neckGroup = new THREE.Group();
  neckGroup.position.set(0, 0.41, 0);
  addPrim(neckGroup, new THREE.CylinderGeometry(0.054, 0.064, 0.11, 12), skinMat, [0, 0.035, 0]);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.085, 0);
  neckGroup.add(headPivot);

  const cranium = addPrim(headPivot, new THREE.SphereGeometry(0.117, 16, 14), skinMat, [0, 0.06, 0]);
  cranium.scale.set(0.92, 1.06, 1);
  const jaw = addPrim(headPivot, new THREE.SphereGeometry(0.082, 12, 10), skinMat, [0, 0.005, 0.025]);
  jaw.scale.set(0.92, 0.78, 1);
  const hairCap = addPrim(
    headPivot,
    new THREE.SphereGeometry(0.119, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    hairMat,
    [0, 0.058, -0.006]
  );
  hairCap.scale.set(0.94, 1.05, 1.02);
  addPrim(headPivot, new THREE.BoxGeometry(0.02, 0.07, 0.09), hairMat, [0.093, 0.02, -0.02]);
  addPrim(headPivot, new THREE.BoxGeometry(0.02, 0.07, 0.09), hairMat, [-0.093, 0.02, -0.02]);
  const beard = addPrim(headPivot, new THREE.SphereGeometry(0.078, 12, 8), hairMat, [0, -0.012, 0.05]);
  beard.scale.set(0.9, 0.6, 0.75);
  addPrim(headPivot, new THREE.BoxGeometry(0.054, 0.014, 0.014), hairMat, [0, -0.026, 0.10]);

  for (const sx of [-1, 1]) {
    addPrim(headPivot, new THREE.BoxGeometry(0.044, 0.012, 0.015), hairMat, [sx * 0.046, 0.086, 0.094], [0, 0, sx * 0.14]);
    const eyeWhite = addPrim(headPivot, new THREE.SphereGeometry(0.021, 10, 8), scleraMat, [sx * 0.048, 0.058, 0.086]);
    eyeWhite.scale.set(1, 0.88, 0.6);
    addPrim(headPivot, new THREE.SphereGeometry(0.011, 8, 8), hairMat, [sx * 0.05, 0.058, 0.10]);
    const ear = addPrim(headPivot, new THREE.SphereGeometry(0.027, 8, 8), skinMat, [sx * 0.108, 0.045, -0.005]);
    ear.scale.set(0.4, 1, 1);
  }
  const nose = addPrim(headPivot, new THREE.SphereGeometry(0.029, 10, 8), skinMat, [0, 0.032, 0.108]);
  nose.scale.set(0.75, 1.05, 1.25);

  const hatGroup = new THREE.Group();
  hatGroup.position.set(0, 0.112, 0);
  hatGroup.rotation.set(0.05, 0, 0.025);
  addPrim(hatGroup, hatBrimGeo, hatBrimMat);
  addPrim(hatGroup, hatCrownGeo, hatCrownMat);
  addPrim(hatGroup, new THREE.CylinderGeometry(0.132, 0.131, 0.036, 28, 1, true), shirtMat, [0, 0.026, 0]);
  headPivot.add(hatGroup);
  torsoGroup.add(neckGroup);

  // Brazos articulados con manos y dedos (izquierdo = +X, derecho = -X)
  const makeDetailedArm = (sideX) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(sideX * 0.245, 0.37, 0);

    const deltoid = addPrim(shoulder, new THREE.SphereGeometry(0.072, 12, 10), creamSleeveMat);
    deltoid.scale.set(1, 1.05, 1);
    addPrim(shoulder, new THREE.CapsuleGeometry(0.052, 0.18, 4, 10), creamSleeveMat, [0, -0.14, 0]);
    addPrim(shoulder, new THREE.CylinderGeometry(0.055, 0.055, 0.032, 10), shirtMat, [0, -0.095, 0]);

    const elbow = new THREE.Group();
    elbow.position.set(0, -0.28, 0);
    addPrim(elbow, new THREE.SphereGeometry(0.052, 10, 8), creamSleeveMat);
    addPrim(elbow, new THREE.CapsuleGeometry(0.045, 0.21, 4, 10), creamSleeveMat, [0, -0.145, 0]);
    addPrim(elbow, new THREE.CylinderGeometry(0.048, 0.048, 0.028, 10), strapMat, [0, -0.235, 0]);

    const hand = new THREE.Group();
    hand.position.set(0, -0.265, 0);
    addPrim(hand, new THREE.BoxGeometry(0.068, 0.082, 0.048), skinMat, [0, -0.036, 0.004]);
    for (let f = 0; f < 4; f++) {
      addPrim(
        hand,
        new THREE.BoxGeometry(0.014, 0.056, 0.024),
        skinMat,
        [-0.023 + f * 0.0155, -0.092, 0.016],
        [0.55, 0, 0]
      );
    }
    // Pulgar orientado hacia el interior del cuerpo (-sideX)
    addPrim(
      hand,
      new THREE.BoxGeometry(0.018, 0.046, 0.026),
      skinMat,
      [-sideX * 0.036, -0.052, 0.032],
      [0.4, 0, -sideX * 0.55]
    );
    elbow.add(hand);
    shoulder.add(elbow);

    return { shoulder, elbow, hand };
  };

  const leftArm = makeDetailedArm(1);
  const rightArm = makeDetailedArm(-1);
  torsoGroup.add(leftArm.shoulder, rightArm.shoulder);

  // Punto exacto de anclaje de armas en el agarre de la mano derecha
  const weaponMount = new THREE.Group();
  weaponMount.position.set(0.012, -0.045, 0.026);
  weaponMount.rotation.x = Math.PI / 2;
  rightArm.hand.add(weaponMount);

  return {
    root,
    pelvisGroup,
    torsoGroup,
    chestGroup,
    ruanaGroup,
    ruanaFrontPivot,
    ruanaBackPivot,
    backpackGroup,
    neckGroup,
    headPivot,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    weaponMount,
    healProp,
    healCaseMat,
    healCrossMat,
    allAvatarMats,
    hitFlashMats,
    sharedGeos
  };
}

// Temporales estáticos de IK analítico de 2 huesos (Animación v2: cero asignaciones por fotograma)
const _ikT = new THREE.Vector3();
const _ikD = new THREE.Vector3();
const _ikN = new THREE.Vector3();
const _ikU = new THREE.Vector3();
const _ikF = new THREE.Vector3();
const _ikX = new THREE.Vector3();
const _ikY = new THREE.Vector3();
const _ikZ = new THREE.Vector3();
const _ikM = new THREE.Matrix4();

/**
 * IK analítico de 2 huesos portado de "Modelos 3D/Animación v2/src/three/models/character/rig.ts".
 * El hueso en reposo apunta hacia -Y y el codo flexiona sobre X local.
 */
export function solveArmIK(shoulder, elbow, targetInParent, poleInParent, L1 = 0.28, L2 = 0.31) {
  _ikT.copy(targetInParent).sub(shoulder.position);
  const d = Math.min(L1 + L2 - 1e-3, Math.max(Math.abs(L1 - L2) + 1e-3, _ikT.length()));
  _ikD.copy(_ikT).normalize();
  const a = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const bend = Math.PI - Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2))));
  _ikN.copy(poleInParent).addScaledVector(_ikD, -poleInParent.dot(_ikD));
  if (_ikN.lengthSq() < 1e-8) _ikN.set(0, -1, 0);
  _ikN.normalize();
  _ikU.copy(_ikD).multiplyScalar(Math.cos(a)).addScaledVector(_ikN, Math.sin(a));
  _ikF.copy(_ikD).multiplyScalar(d).addScaledVector(_ikU, -L1).normalize();
  _ikY.copy(_ikU).negate();
  _ikZ.copy(_ikF).addScaledVector(_ikU, -_ikF.dot(_ikU));
  if (_ikZ.lengthSq() < 1e-8) _ikZ.copy(_ikN).negate();
  _ikZ.normalize();
  _ikX.crossVectors(_ikY, _ikZ);
  _ikM.makeBasis(_ikX, _ikY, _ikZ);
  shoulder.quaternion.setFromRotationMatrix(_ikM);
  elbow.rotation.set(-bend, 0, 0);
}

/* ============================================================================
 * 3. HELICÓPTERO MILITAR ESTRELLADO (Helicopter.tsx)
 * ============================================================================ */
function buildHelicopterDebrisGeo() {
  const r = modelRng(77);
  const b = new GeoBuilder();
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 28; i++) {
    const a = r() * Math.PI * 2;
    const d = 1.6 + r() * 4.4;
    b.add(
      box,
      [Math.cos(a) * d, 0.07 + r() * 0.1, Math.sin(a) * d - 0.8],
      [r() * 0.5, r() * 6, r() * 0.5],
      [0.12 + r() * 0.38, 0.05 + r() * 0.18, 0.12 + r() * 0.45]
    );
  }
  box.dispose();
  return b.build(true);
}

function buildTailAssemblyGroup(len, broken, skinMat, metalMat, darkMat) {
  const g = new THREE.Group();
  addPrim(
    g,
    new THREE.CylinderGeometry(0.24, broken ? 0.42 : 0.52, len, 14),
    skinMat,
    [0, 0, -len / 2],
    [-Math.PI / 2, 0, 0]
  );

  if (broken) {
    addPrim(g, new THREE.CylinderGeometry(0.41, 0.41, 0.12, 14), darkMat, [0, 0, -len + 0.04], [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 5; i++) {
      const ang = i * 1.26;
      addPrim(
        g,
        new THREE.BoxGeometry(0.12, 0.3, 0.25),
        metalMat,
        [Math.cos(ang) * 0.34, Math.sin(ang) * 0.34, -len - 0.05],
        [0.3, 0, ang]
      );
    }
  } else {
    addPrim(g, new THREE.BoxGeometry(0.12, 1.5, 0.95), skinMat, [0, 0.75, -len + 0.25], [-0.25, 0, 0]);
    addPrim(g, new THREE.BoxGeometry(2.2, 0.08, 0.55), skinMat, [0, 0.15, -len + 1.0]);
    addPrim(g, new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8), metalMat, [0, -0.35, -len + 0.35], [0.6, 0, 0]);
    const tailRotor = new THREE.Group();
    tailRotor.position.set(0.18, 1.0, -len + 0.1);
    addPrim(tailRotor, new THREE.CylinderGeometry(0.1, 0.1, 0.16, 10), metalMat, [0, 0, 0], [0, 0, Math.PI / 2]);
    addPrim(tailRotor, new THREE.BoxGeometry(0.04, 1.75, 0.16), darkMat, [0.05, 0, 0]);
    addPrim(tailRotor, new THREE.BoxGeometry(0.04, 1.75, 0.16), darkMat, [0.05, 0, 0], [Math.PI / 2, 0, 0]);
    g.add(tailRotor);
  }
  return g;
}

export function buildExternalHelicopterWreck(wreck, structuresGroup, addLightAnchor) {
  if (!wreck) return null;

  const skinTex = MODEL_TEX.heliSkin();
  const skinMat = new THREE.MeshStandardMaterial({ map: skinTex, roughness: 0.72, metalness: 0.12 });
  const bellyMat = new THREE.MeshStandardMaterial({ color: '#3b4531', roughness: 0.8 });
  const metalMat = new THREE.MeshStandardMaterial({ color: '#3a3f3a', metalness: 0.62, roughness: 0.45 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#262926', roughness: 0.75 });
  const darkGlassMat = new THREE.MeshStandardMaterial({ color: '#10161c', roughness: 0.18, metalness: 0.35 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#8fd3ff',
    transparent: true,
    opacity: 0.45,
    roughness: 0.08,
    metalness: 0.1,
    depthWrite: false
  });
  const tipYellowMat = new THREE.MeshStandardMaterial({ color: '#e0b63b', roughness: 0.5 });
  const scorchedMat = new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 1.0 });
  const debrisMat = new THREE.MeshStandardMaterial({ color: '#30342a', roughness: 0.9 });

  // Sección 1: Fuselaje UH-1 Huey estrellado en (wreck.x, wreck.y, wreck.z)
  const hullAnchor = new THREE.Group();
  hullAnchor.position.set(wreck.x, wreck.y, wreck.z);
  hullAnchor.rotation.set(0, wreck.yaw, 0);

  const fuselage = new THREE.Group();
  fuselage.position.set(0, -0.10, 0);
  fuselage.rotation.set(-0.05, 0, 0.17);
  hullAnchor.add(fuselage);

  const cabinGeo = new RoundedBoxGeometry(2.3, 1.85, 4.4, 4, 0.3);
  cabinGeo.computeVertexNormals();
  addPrim(fuselage, cabinGeo, skinMat, [0, 1.42, 0.1]);
  addPrim(fuselage, new THREE.BoxGeometry(1.6, 0.4, 3.6), bellyMat, [0, 0.55, 0.2]);
  const nose = addPrim(fuselage, new THREE.SphereGeometry(1, 20, 14), skinMat, [0, 1.3, 2.3]);
  nose.scale.set(1.05, 0.85, 1.1);

  // Parabrisas translúcido y ventanillas laterales
  addPrim(fuselage, new THREE.BoxGeometry(2.0, 1.0, 0.05), darkMat, [0, 2.0, 2.42], [-0.55, 0, 0]);
  addPrim(fuselage, new THREE.BoxGeometry(1.86, 0.86, 0.06), glassMat, [0, 2.0, 2.45], [-0.55, 0, 0], false);
  for (const sx of [-1, 1]) {
    addPrim(fuselage, new THREE.BoxGeometry(0.6, 0.5, 0.05), glassMat, [sx * 0.5, 1.15, 3.0], [0.6, 0, 0], false);
    addPrim(fuselage, new THREE.BoxGeometry(0.06, 0.6, 0.9), darkGlassMat, [sx * 1.16, 1.95, 1.3]);
  }

  // Puertas laterales y carga interior
  addPrim(fuselage, new THREE.BoxGeometry(0.1, 1.3, 1.6), darkMat, [-1.14, 1.35, -0.3]);
  addPrim(fuselage, new THREE.BoxGeometry(0.06, 1.3, 1.5), skinMat, [-1.2, 1.35, -1.75]);
  addPrim(fuselage, new THREE.BoxGeometry(0.05, 0.5, 0.8), darkGlassMat, [-1.24, 1.65, -1.75]);
  addPrim(fuselage, new THREE.BoxGeometry(0.06, 1.3, 1.55), skinMat, [1.18, 1.35, -0.3]);
  addPrim(fuselage, new THREE.BoxGeometry(0.05, 0.5, 0.8), darkGlassMat, [1.22, 1.65, -0.3]);
  addPrim(fuselage, new THREE.BoxGeometry(0.3, 0.5, 0.6), bellyMat, [-0.6, 1.1, -0.3]);

  // Motor superior y escape
  addPrim(fuselage, new THREE.BoxGeometry(1.1, 0.55, 2.0), skinMat, [0, 2.55, -1.1]);
  addPrim(fuselage, new THREE.CylinderGeometry(0.22, 0.22, 0.5, 12), metalMat, [0.4, 2.6, -2.2], [Math.PI / 2, 0, 0]);
  addPrim(fuselage, new THREE.BoxGeometry(0.7, 0.3, 0.6), bellyMat, [0, 2.5, 0.2]);
  addPrim(fuselage, new THREE.CylinderGeometry(0.12, 0.14, 0.7, 12), metalMat, [0, 2.95, -0.2]);

  // Rotor principal con aspa doblada por el impacto (keepSeparate para animación suave)
  const rotorPivot = new THREE.Group();
  rotorPivot.position.set(0, 3.35, -0.2);
  const rotorHead = new THREE.Group();
  rotorHead.userData.keepSeparate = true;
  addPrim(rotorHead, new THREE.BoxGeometry(0.7, 0.3, 0.5), metalMat);
  addPrim(rotorHead, new THREE.CylinderGeometry(0.04, 0.04, 2.4, 8), metalMat, [0, -0.2, 0], [0, 0, Math.PI / 2]);
  for (let k = 0; k < 2; k++) {
    const bladeArm = new THREE.Group();
    bladeArm.rotation.y = k * Math.PI;
    addPrim(bladeArm, new THREE.BoxGeometry(0.45, 0.06, 3.5), darkMat, [0, 0, 2.05]);
    const outerTip = new THREE.Group();
    outerTip.position.set(0, 0, 3.8);
    if (k === 0) outerTip.rotation.x = 0.4;
    addPrim(outerTip, new THREE.BoxGeometry(0.45, 0.06, 3.4), darkMat, [0, 0, 1.7]);
    addPrim(outerTip, new THREE.BoxGeometry(0.46, 0.065, 0.4), tipYellowMat, [0, 0, 3.2]);
    bladeArm.add(outerTip);
    rotorHead.add(bladeArm);
  }
  rotorHead.traverse((o) => {
    if (o.isMesh) {
      o.userData.keepSeparate = true;
      o.userData.noCameraBlock = true;
    }
  });
  rotorPivot.add(rotorHead);
  fuselage.add(rotorPivot);

  // Patines de aterrizaje (izquierdo deformado por el choque)
  for (const sx of [1, -1]) {
    const skidGrp = new THREE.Group();
    if (sx === -1) {
      skidGrp.position.set(-0.1, -0.05, 0);
      skidGrp.rotation.set(0, 0, 0.25);
    }
    addPrim(skidGrp, new THREE.CylinderGeometry(0.07, 0.07, 3.8, 10), metalMat, [sx * 1.0, 0.12, 0.2], [Math.PI / 2, 0, 0]);
    addPrim(skidGrp, new THREE.CylinderGeometry(0.07, 0.07, 0.6, 10), metalMat, [sx * 1.0, 0.3, 2.35], [Math.PI / 2 + 0.9, 0, 0]);
    for (const zStrut of [1.2, -1.0]) {
      addPrim(skidGrp, new THREE.CapsuleGeometry(0.05, 0.85, 4, 8), metalMat, [sx * 0.85, 0.52, zStrut], [0, 0, sx * 0.36]);
    }
    fuselage.add(skidGrp);
  }

  // Botalón trasero fracturado en cabina
  const stubWrap = new THREE.Group();
  stubWrap.position.set(0, 1.65, -2.1);
  stubWrap.rotation.x = -0.06;
  stubWrap.add(buildTailAssemblyGroup(2.4, true, skinMat, metalMat, darkMat));
  fuselage.add(stubWrap);

  // Disco de tierra quemada y escombros alrededor del impacto
  addPrim(hullAnchor, new THREE.CylinderGeometry(3.9, 4.4, 0.04, 32), scorchedMat, [0, 0.02, -0.5], null, false);
  const debrisMesh = addPrim(hullAnchor, buildHelicopterDebrisGeo(), debrisMat);
  debrisMesh.userData.noCameraBlock = true;

  // Llamas animadas vivas sobre el motor y el costado siniestrado (cero allocs por frame)
  const fireMeshes = [];
  const innerFireMat = new THREE.MeshBasicMaterial({
    color: '#ffd23a',
    transparent: true,
    opacity: 0.94,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const outerFireMat = new THREE.MeshBasicMaterial({
    color: '#ff6a1a',
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const coreFireMat = new THREE.MeshBasicMaterial({
    color: '#fff1b0',
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const fireSpots = [[-0.45, 2.65, -1.15], [-1.3, 0.95, -0.2]];
  fireSpots.forEach((spot, si) => {
    const fg = new THREE.Group();
    fg.position.set(spot[0], spot[1], spot[2]);
    fg.userData.keepSeparate = true;
    const count = si === 0 ? 8 : 5;
    const rad = si === 0 ? 0.44 : 0.25;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const inner = i % 2 === 0;
      const idx = si * 10 + i;
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(inner ? 0.28 : 0.42, inner ? 1.55 : 1.18, 8),
        inner ? innerFireMat : outerFireMat
      );
      cone.position.set(Math.cos(a) * rad, inner ? 0.68 : 0.48, Math.sin(a) * rad);
      cone.rotation.set(Math.sin(idx * 3.1) * 0.12, 0, Math.cos(idx * 2.3) * 0.12);
      cone.userData.keepSeparate = true;
      cone.userData.noCameraBlock = true;
      fg.add(cone);
      fireMeshes.push({ mesh: cone, phase: idx });
    }
    const core = addPrim(fg, new THREE.ConeGeometry(0.2, 0.9, 8), coreFireMat, [0, 0.85, 0], null, false);
    core.userData.keepSeparate = true;
    core.userData.noCameraBlock = true;
    hullAnchor.add(fg);
  });

  if (addLightAnchor) {
    addLightAnchor(hullAnchor, '#ff7a1f', 2.0, 16, 1.6, -0.4, 2.8, -1.1);
  }
  structuresGroup.add(hullAnchor);

  // Sección 2: Cola desprendida posicionada exactamente en (wreck.tailX, wreck.tailY, wreck.tailZ)
  const detachedTail = new THREE.Group();
  detachedTail.position.set(wreck.tailX, wreck.tailY + 0.44, wreck.tailZ);
  detachedTail.rotation.set(0.18, wreck.tailYaw, 1.12);
  // Orientar el eje longitudinal (-Z de TailAssembly) a lo largo de tailYaw
  const tailInner = buildTailAssemblyGroup(3.6, false, skinMat, metalMat, darkMat);
  tailInner.position.set(0, 0, 1.8);
  detachedTail.add(tailInner);
  structuresGroup.add(detachedTail);

  return {
    rotorHead,
    fireMeshes
  };
}

/* ============================================================================
 * 4. CASA COLONIAL REPARADA (ColonialHouse.tsx)
 *    - Techo reparado: computeVertexNormals() + material cálido terracota (nunca negro)
 *    - Ventanas reparadas: cristal con transparencia real (opacity: 0.35, depthWrite: false)
 *      y muros recortados alrededor de vanos reales para ver el interior amoblado.
 * ============================================================================ */
let _colonialSharedMaterials = null;

export function getColonialHouseMaterials() {
  if (_colonialSharedMaterials) return _colonialSharedMaterials;
  const stoneTex = MODEL_TEX.stone([3, 0.8]);
  const stuccoTex = MODEL_TEX.stucco([2, 2]);
  const woodTex = MODEL_TEX.wood([1, 1]);

  _colonialSharedMaterials = {
    stoneFoundation: new THREE.MeshStandardMaterial({ map: stoneTex, color: '#a39e93', roughness: 0.92, metalness: 0.02 }),
    stuccoBaseTex: stuccoTex,
    woodTex,
    woodDeck: new THREE.MeshStandardMaterial({ map: woodTex, color: '#8a582c', roughness: 0.78, metalness: 0.04 }),
    woodBeam: new THREE.MeshStandardMaterial({ map: woodTex, color: '#5c381b', roughness: 0.8, metalness: 0.04 }),
    cornice: new THREE.MeshStandardMaterial({ color: '#c8652f', roughness: 0.72, metalness: 0.04 }),
    // REPARACIÓN 1 (Techo oscuro corregido): rugosidad/metalicidad calibradas + emisivo cálido sutil
    roofUnderlay: new THREE.MeshStandardMaterial({
      color: '#9e4727',
      emissive: '#2e1106',
      emissiveIntensity: 0.14,
      roughness: 0.68,
      metalness: 0.03
    }),
    roofTiles: new THREE.MeshStandardMaterial({
      color: '#d96538',
      emissive: '#421809',
      emissiveIntensity: 0.18,
      roughness: 0.62,
      metalness: 0.04
    }),
    // REPARACIÓN 2 (Ventanas transparentes reales para ver el interior amoblado):
    windowGlass: new THREE.MeshStandardMaterial({
      color: '#9ad8ff',
      emissive: '#38bdf8',
      emissiveIntensity: 0.08,
      transparent: true,
      opacity: 0.35,
      roughness: 0.12,
      metalness: 0.1,
      depthWrite: false,
      side: THREE.DoubleSide
    }),
    windowSill: new THREE.MeshStandardMaterial({ color: '#c8c0b0', roughness: 0.85 }),
    windowMullion: new THREE.MeshStandardMaterial({ color: '#5a3a1c', roughness: 0.75 }),
    potClay: new THREE.MeshStandardMaterial({ color: '#b8552d', roughness: 0.8 }),
    potFoliage: new THREE.MeshStandardMaterial({ color: '#3f8a35', roughness: 0.75 }),
    potFlower: new THREE.MeshStandardMaterial({ color: '#e03a3a', roughness: 0.6 }),
    lanternMetal: new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.5, metalness: 0.6 }),
    lanternGlow: new THREE.MeshStandardMaterial({
      color: '#ffd27a',
      emissive: '#ffb347',
      emissiveIntensity: 0.85,
      roughness: 0.3
    })
  };
  return _colonialSharedMaterials;
}

export function buildColonialRoofTilesGeo(roofW, slopeLen, slopeAng, wallTopY, halfD, roofRise) {
  const main = new GeoBuilder();
  const tile = new THREE.CylinderGeometry(0.095, 0.095, slopeLen + 0.12, 8);
  tile.rotateX(Math.PI / 2);

  for (const sigma of [1, -1]) {
    const sub = new GeoBuilder();
    for (let x = -roofW / 2 + 0.14; x <= roofW / 2 - 0.12; x += 0.34) {
      sub.add(tile, [x, 0.09, 0]);
    }
    const g = sub.build(true);
    main.add(g, [0, wallTopY + roofRise / 2 + 0.03, (sigma * halfD) / 2], [sigma * slopeAng, 0, 0]);
    g.dispose();
  }

  const ridge = new THREE.CylinderGeometry(0.13, 0.13, roofW + 0.08, 10);
  main.add(ridge, [0, wallTopY + roofRise + 0.10, 0], [0, 0, Math.PI / 2]);
  tile.dispose();
  ridge.dispose();

  // Recalcular normales explícitamente tras fusionar tejas inclinadas
  const finalGeo = main.build(true);
  finalGeo.computeVertexNormals();
  return finalGeo;
}

export function buildColonialGablesGeo(D, rise, W) {
  const s = new THREE.Shape();
  s.moveTo(-D / 2, 0);
  s.lineTo(D / 2, 0);
  s.lineTo(D / 2, 0.24);
  s.lineTo(0, rise - 0.04);
  s.lineTo(-D / 2, 0.24);
  s.closePath();

  const tri = new THREE.ExtrudeGeometry(s, { depth: 0.26, bevelEnabled: false });
  const b = new GeoBuilder();
  b.add(tri, [W / 2 - 0.26, 0, 0], [0, Math.PI / 2, 0]);
  b.add(tri, [-W / 2, 0, 0], [0, Math.PI / 2, 0]);
  tri.dispose();

  const finalGeo = b.build(true);
  finalGeo.computeVertexNormals();
  return finalGeo;
}

export function buildColonialRailingGeo(len) {
  const b = new GeoBuilder();
  const post = new THREE.CylinderGeometry(0.036, 0.036, 0.96, 8);
  const bal = new THREE.BoxGeometry(0.042, 0.76, 0.042);
  const n = Math.max(2, Math.round(len / 0.95));
  for (let i = 0; i <= n; i++) {
    b.add(post, [-len / 2 + (i / n) * len, 0.48, 0]);
  }
  const nb = Math.max(2, Math.round(len / 0.20));
  for (let i = 0; i < nb; i++) {
    b.add(bal, [-len / 2 + ((i + 0.5) / nb) * len, 0.48, 0]);
  }
  const rail = new THREE.BoxGeometry(len + 0.08, 0.08, 0.095);
  b.add(rail, [0, 0.96, 0]);
  b.add(rail, [0, 0.10, 0]);
  post.dispose();
  bal.dispose();
  rail.dispose();
  return b.build(true);
}

/**
 * Construye una ventana colonial con cristal transparente real (opacity: 0.35, depthWrite: false),
 * montantes de madera, alféizar y contraventanas laterales abiertas (sin planos negros opacos).
 */
export function buildColonialWindowGroup(wData, frameColor = '#2b6cb0') {
  const CM = getColonialHouseMaterials();
  const wg = new THREE.Group();
  wg.position.set(wData.x, wData.y + wData.height * 0.5, wData.z);
  if (wData.axis === 'x') {
    wg.rotation.y = Math.PI / 2;
  }

  const W = wData.width;
  const H = wData.height;
  const frameMat = new THREE.MeshStandardMaterial({ color: frameColor, roughness: 0.68, metalness: 0.05 });

  // Marco perimetral abierto (sin caja central opaca que bloquee la visión)
  const barT = 0.065;
  const frameDepth = 0.12;
  addPrim(wg, new THREE.BoxGeometry(W + 0.08, barT, frameDepth), frameMat, [0, H * 0.5 - barT * 0.5, 0]);
  addPrim(wg, new THREE.BoxGeometry(W + 0.08, barT, frameDepth), frameMat, [0, -H * 0.5 + barT * 0.5, 0]);
  addPrim(wg, new THREE.BoxGeometry(barT, H, frameDepth), frameMat, [-W * 0.5 + barT * 0.5, 0, 0]);
  addPrim(wg, new THREE.BoxGeometry(barT, H, frameDepth), frameMat, [W * 0.5 - barT * 0.5, 0, 0]);

  // Cristal con transparencia real (permite ver el interior amoblado desde afuera y viceversa)
  const glassPane = new THREE.Mesh(new THREE.BoxGeometry(W - 0.10, H - 0.10, 0.025), CM.windowGlass);
  glassPane.userData.noCameraBlock = true;
  glassPane.castShadow = false;
  glassPane.receiveShadow = false;
  wg.add(glassPane);

  // Montantes de madera coloniales
  for (const k of [-0.25, 0, 0.25]) {
    const vBar = addPrim(wg, new THREE.BoxGeometry(0.032, H - 0.10, 0.045), CM.windowMullion, [W * k, 0, 0]);
    vBar.userData.noCameraBlock = true;
  }
  const hBar = addPrim(wg, new THREE.BoxGeometry(W - 0.10, 0.032, 0.045), CM.windowMullion, [0, 0, 0]);
  hBar.userData.noCameraBlock = true;

  // Alféizar de piedra y contraventanas exteriores abiertas a los lados
  addPrim(wg, new THREE.BoxGeometry(W + 0.24, 0.08, 0.34), CM.windowSill, [0, -H * 0.5 - 0.03, 0]);
  const shutW = Math.min(0.46, W * 0.26);
  for (const side of [-1, 1]) {
    for (const zSide of [-0.15, 0.15]) {
      addPrim(
        wg,
        new THREE.BoxGeometry(shutW, H - 0.06, 0.035),
        frameMat,
        [side * (W * 0.5 + shutW * 0.5 + 0.03), 0, zSide]
      );
    }
  }

  return { group: wg, glassPane };
}

/* ============================================================================
 * 5. PUENTE DE PIEDRA REPARADO (StoneBridge.tsx)
 *    - Sin wireframe/EdgesGeometry ni contornos negros sobresalientes
 *    - Sin bloques aleatorios desfasados (parapetStones eliminado)
 *    - Cuerpo arqueado extruido + dovelas alineadas + normales suavizadas
 * ============================================================================ */
let _bridgeSharedMats = null;

function getStoneBridgeMaterials() {
  if (_bridgeSharedMats) return _bridgeSharedMats;
  const stoneTex = MODEL_TEX.stone([3.2, 1.2], 3);
  const deckTex = MODEL_TEX.stone([6.0, 1.8], 7);
  _bridgeSharedMats = {
    masonry: new THREE.MeshStandardMaterial({ map: stoneTex, color: '#a8a49a', roughness: 0.88, metalness: 0.02 }),
    voussoir: new THREE.MeshStandardMaterial({ color: '#8d8980', roughness: 0.86, metalness: 0.03 }),
    deck: new THREE.MeshStandardMaterial({ map: deckTex, color: '#9c988d', roughness: 0.88, metalness: 0.02 }),
    cap: new THREE.MeshStandardMaterial({ color: '#837f75', roughness: 0.84, metalness: 0.03 })
  };
  return _bridgeSharedMats;
}

export function buildCleanStoneBridge(br, map) {
  const BM = getStoneBridgeMaterials();
  const g = new THREE.Group();

  const flatLen = br.spanFlatHalf * 2; // 35.0 m
  const fullW = br.widthHalf * 2;      // 6.2 m
  const deckThick = 0.34;
  const archCenters = [-11.2, 0.0, 11.2];
  const archR = 3.9;

  // Base inferior del cuerpo de mampostería hasta el lecho del río
  let minBedY = br.deckY - 4.8;
  for (const px of [-16.5, -5.6, 0, 5.6, 16.5]) {
    const th = map.getTerrainHeightAt ? map.getTerrainHeightAt(br.x + px, br.z) : 0.6;
    if (th - 0.6 < minBedY) minBedY = th - 0.6;
  }
  const bodyH = Math.max(2.6, br.deckY - deckThick - minBedY);
  const springY = Math.max(0.7, bodyH - archR - 0.65);

  // 1. Cuerpo continuo extruido con 3 arcos limpios (curvas suaves de 32 segmentos, sin huecos ni desfaces)
  const shape = new THREE.Shape();
  shape.moveTo(-flatLen * 0.5, 0);
  for (const ac of archCenters) {
    shape.lineTo(ac - archR, 0);
    shape.lineTo(ac - archR, springY);
    shape.absarc(ac, springY, archR, Math.PI, 0, true);
    shape.lineTo(ac + archR, 0);
  }
  shape.lineTo(flatLen * 0.5, 0);
  shape.lineTo(flatLen * 0.5, bodyH);
  shape.lineTo(-flatLen * 0.5, bodyH);
  shape.closePath();

  const bodyGeo = new THREE.ExtrudeGeometry(shape, {
    depth: fullW - 0.16,
    bevelEnabled: false,
    curveSegments: 32
  });
  bodyGeo.translate(0, 0, -(fullW - 0.16) * 0.5);
  bodyGeo.computeVertexNormals();

  const bodyMesh = addPrim(g, bodyGeo, BM.masonry, [br.x, minBedY, br.z]);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;

  // 2. Dovelas (voussoirs) perfectamente alineadas y soldadas al radio de cada arco
  const voussoirBuilder = new GeoBuilder();
  const vBlock = new THREE.BoxGeometry(0.46, 0.58, fullW - 0.04);
  const vCount = 19;
  for (const ac of archCenters) {
    for (let i = 0; i < vCount; i++) {
      const a = ((i + 0.5) / vCount) * Math.PI;
      const rr = archR + 0.16;
      const isKeystone = i === Math.floor(vCount / 2);
      voussoirBuilder.add(
        vBlock,
        [ac + Math.cos(a) * rr, springY + Math.sin(a) * rr, 0],
        [0, 0, a - Math.PI * 0.5],
        isKeystone ? [1.18, 1.12, 1.02] : 1
      );
    }
  }
  vBlock.dispose();
  const voussoirGeo = voussoirBuilder.build(true);
  addPrim(g, voussoirGeo, BM.voussoir, [br.x, minBedY, br.z]);

  // 3. Tablero superior continuo y nivelado exactamente a br.deckY
  addPrim(
    g,
    new THREE.BoxGeometry(flatLen + 0.24, deckThick, fullW + 0.12),
    BM.deck,
    [br.x, br.deckY - deckThick * 0.5, br.z]
  );

  // 4. Estribos macizos de transición en ambos extremos del tramo central
  for (const sx of [-1, 1]) {
    const abutY = sx < 0 ? br.leftGround : br.rightGround;
    const abutH = Math.max(1.2, br.deckY - abutY + 0.8);
    addPrim(
      g,
      new THREE.BoxGeometry(1.15, abutH, fullW + 0.36),
      BM.masonry,
      [br.x + sx * (br.spanFlatHalf - 0.25), br.deckY - abutH * 0.5, br.z]
    );
  }

  // 5. Rampas suaves conectadas sin escalones a la altura real de cada orilla
  const leftDrop = br.deckY - br.leftGround;
  const leftSlopeLen = Math.hypot(br.rampLen, leftDrop);
  const leftAng = Math.atan2(leftDrop, br.rampLen);
  addPrim(
    g,
    new THREE.BoxGeometry(leftSlopeLen + 0.24, deckThick, fullW + 0.08),
    BM.deck,
    [
      br.x - br.spanFlatHalf - br.rampLen * 0.5,
      (br.deckY + br.leftGround) * 0.5 - deckThick * 0.5 * Math.cos(leftAng),
      br.z
    ],
    [0, 0, leftAng]
  );

  const rightDrop = br.deckY - br.rightGround;
  const rightSlopeLen = Math.hypot(br.rampLen, rightDrop);
  const rightAng = -Math.atan2(rightDrop, br.rampLen);
  addPrim(
    g,
    new THREE.BoxGeometry(rightSlopeLen + 0.24, deckThick, fullW + 0.08),
    BM.deck,
    [
      br.x + br.spanFlatHalf + br.rampLen * 0.5,
      (br.deckY + br.rightGround) * 0.5 - deckThick * 0.5 * Math.cos(rightAng),
      br.z
    ],
    [0, 0, rightAng]
  );

  // 6. Pretiles laterales limpios y continuos con albardilla superior (cero piedras sueltas desfasadas)
  for (const sz of [-1, 1]) {
    const railZ = br.z + sz * (br.widthHalf - 0.16);
    addPrim(g, new THREE.BoxGeometry(flatLen + 0.2, 0.84, 0.30), BM.masonry, [br.x, br.deckY + 0.42, railZ]);
    addPrim(g, new THREE.BoxGeometry(flatLen + 0.3, 0.12, 0.38), BM.cap, [br.x, br.deckY + 0.90, railZ]);

    addPrim(
      g,
      new THREE.BoxGeometry(leftSlopeLen + 0.1, 0.80, 0.28),
      BM.masonry,
      [br.x - br.spanFlatHalf - br.rampLen * 0.5, (br.deckY + br.leftGround) * 0.5 + 0.40, railZ],
      [0, 0, leftAng]
    );
    addPrim(
      g,
      new THREE.BoxGeometry(leftSlopeLen + 0.16, 0.11, 0.36),
      BM.cap,
      [br.x - br.spanFlatHalf - br.rampLen * 0.5, (br.deckY + br.leftGround) * 0.5 + 0.85, railZ],
      [0, 0, leftAng]
    );

    addPrim(
      g,
      new THREE.BoxGeometry(rightSlopeLen + 0.1, 0.80, 0.28),
      BM.masonry,
      [br.x + br.spanFlatHalf + br.rampLen * 0.5, (br.deckY + br.rightGround) * 0.5 + 0.40, railZ],
      [0, 0, rightAng]
    );
    addPrim(
      g,
      new THREE.BoxGeometry(rightSlopeLen + 0.16, 0.11, 0.36),
      BM.cap,
      [br.x + br.spanFlatHalf + br.rampLen * 0.5, (br.deckY + br.rightGround) * 0.5 + 0.85, railZ],
      [0, 0, rightAng]
    );
  }

  return g;
}

/* ============================================================================
 * 6. PROTOTIPOS DE VEGETACIÓN Y PROPS EXTERNOS PARA INSTANCEDMESH (60 FPS)
 *    - Palma de Cera (WaxPalm.tsx)
 *    - Cafeto (Props.tsx -> CoffeeBush)
 *    - Roca con musgo (helpers.tsx -> rockGeometry)
 *    - Cerca con pilares de piedra (Props.tsx -> Fence)
 *    - Botiquín (Props.tsx -> Medkit)
 * ============================================================================ */
function buildWaxPalmFrondGeo(len, droop, rnd, leafletMax = 0.72) {
  const b = new GeoBuilder();
  const n = 10;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(new THREE.Vector3(t * len, -droop * t * t * len, 0));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const stem = new THREE.TubeGeometry(curve, 8, 0.032, 5, false);
  b.add(stem);
  stem.dispose();

  const leaf = new THREE.BoxGeometry(1, 0.014, 0.10);
  leaf.translate(0.5, 0, 0);
  const tmp = new THREE.Matrix4();
  const rz = new THREE.Matrix4();
  const ry = new THREE.Matrix4();
  const rz2 = new THREE.Matrix4();
  const sc = new THREE.Matrix4();

  for (let i = 2; i <= n; i++) {
    const t = i / n;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const pitch = Math.atan2(tan.y, tan.x);
    const L = leafletMax * (1.05 - 0.58 * t);
    for (const side of [-1, 1]) {
      const yaw = side * (1.05 - 0.3 * t + (rnd() - 0.5) * 0.22);
      const dip = 0.44 + rnd() * 0.32;
      tmp.makeTranslation(p.x, p.y, p.z);
      rz.makeRotationZ(pitch);
      ry.makeRotationY(yaw);
      rz2.makeRotationZ(-dip);
      sc.makeScale(L, 1, 1);
      tmp.multiply(rz).multiply(ry).multiply(rz2).multiply(sc);
      b.addM(leaf, tmp);
    }
  }
  leaf.dispose();
  return b.build(true);
}

export function createExternalWaxPalmPrototypeGeo() {
  const rnd = modelRng(20);
  const main = new GeoBuilder();
  const H = 16.2;
  const segs = 12;
  const segH = H / segs;

  // Raíz basal, tronco esbelto anillado y cogollo verde
  const rootBase = new THREE.CylinderGeometry(0.32, 0.44, 0.38, 10);
  main.addColored(rootBase, '#8a8a78', [0, 0.19, 0]);
  rootBase.dispose();

  for (let s = 0; s < segs; s++) {
    const t0 = s / segs;
    const t1 = (s + 1) / segs;
    const rBot = 0.30 * (1 - t0 * 0.46);
    const rTop = 0.30 * (1 - t1 * 0.46);
    const segGeo = new THREE.CylinderGeometry(rTop, rBot, segH + 0.02, 10);
    main.addColored(segGeo, s % 2 === 0 ? '#dbd9c8' : '#c4c2b0', [0, s * segH + segH * 0.5, 0]);
    segGeo.dispose();

    const ringGeo = new THREE.CylinderGeometry(rTop * 1.05, rTop * 1.05, 0.09, 10);
    main.addColored(ringGeo, '#7d8070', [0, (s + 0.9) * segH, 0]);
    ringGeo.dispose();
  }

  const cogollo = new THREE.CylinderGeometry(0.11, 0.18, 1.0, 10);
  main.addColored(cogollo, '#6a933e', [0, H + 0.45, 0]);
  cogollo.dispose();

  const crownY = H + 0.9;
  const layers = [
    { n: 5, len: 2.6, tilt: [0.92, 0.72], droop: 0.25, col: '#489d38' },
    { n: 7, len: 3.4, tilt: [0.45, 0.20], droop: 0.32, col: '#3a892c' },
    { n: 6, len: 3.5, tilt: [-0.05, -0.34], droop: 0.30, col: '#2f7624' }
  ];
  layers.forEach((L, k) => {
    const f = buildWaxPalmFrondGeo(L.len, L.droop, rnd);
    for (let i = 0; i < L.n; i++) {
      const theta = (i / L.n) * Math.PI * 2 + k * 0.7 + (rnd() - 0.5) * 0.28;
      const tilt = L.tilt[0] + (L.tilt[1] - L.tilt[0]) * rnd();
      main.addColored(f, L.col, [0, crownY, 0], [0, theta, tilt], 1, 'YZX');
    }
    f.dispose();
  });

  // Hojas secas colgantes y racimos de frutos rojos
  const deadFrond = buildWaxPalmFrondGeo(2.4, 0.12, rnd, 0.5);
  for (let i = 0; i < 4; i++) {
    main.addColored(deadFrond, '#b08e45', [0, crownY - 0.25, 0], [0, (i / 4) * Math.PI * 2 + 0.4, -1.25], 1, 'YZX');
  }
  deadFrond.dispose();

  const stalk = new THREE.CylinderGeometry(0.03, 0.04, 0.75, 6);
  const cluster = new THREE.IcosahedronGeometry(0.20, 1);
  for (let c = 0; c < 2; c++) {
    const ang = c * 2.5 + 0.5;
    const cx = Math.cos(ang) * 0.34;
    const cz = Math.sin(ang) * 0.34;
    main.addColored(stalk, '#785a28', [cx, crownY - 0.52, cz]);
    main.addColored(cluster, '#c9452a', [cx, crownY - 0.82, cz], [0, 0, 0], [1, 1.35, 1]);
  }
  stalk.dispose();
  cluster.dispose();

  return main.build(true);
}

export function createExternalCoffeeBushPrototypeGeo() {
  const r = modelRng(38);
  const main = new GeoBuilder();

  const trunk = new THREE.CylinderGeometry(0.032, 0.058, 1.38, 7);
  main.addColored(trunk, '#5b3a1e', [0, 0.69, 0]);
  trunk.dispose();

  const leaf = new THREE.SphereGeometry(0.088, 6, 5);
  leaf.scale(1.5, 0.24, 0.88);
  const berry = new THREE.IcosahedronGeometry(0.032, 0);

  const nb = 10;
  for (let i = 0; i < nb; i++) {
    const y = 0.28 + (i / nb) * 0.98;
    const L = 0.78 - (i / nb) * 0.42;
    const yaw = i * 2.4 + r() * 0.6;
    const pitch = 0.35 + r() * 0.25;
    const branch = new THREE.CylinderGeometry(0.012, 0.022, L, 5);
    branch.translate(0, L / 2, 0);
    main.addColored(branch, '#5b3a1e', [0, y, 0], [0, yaw, -(Math.PI / 2 - pitch)], 1, 'YZX');
    branch.dispose();

    const dir = new THREE.Vector3(Math.cos(pitch), Math.sin(pitch), 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    for (let k = 1; k <= 5; k++) {
      const t = (k / 5) * L;
      const px = dir.x * t;
      const py = y + dir.y * t;
      const pz = dir.z * t;
      for (const s of [-1, 1]) {
        main.addColored(
          leaf,
          k % 2 === 0 ? '#2f6f2c' : '#388034',
          [px + (r() - 0.5) * 0.04, py - 0.02, pz + (r() - 0.5) * 0.04],
          [r() * 0.4 - 0.5, yaw + s * 0.9, s * 0.28],
          1,
          'YXZ'
        );
      }
      if (k < 5) {
        for (let q = 0; q < 2; q++) {
          const a = r() * Math.PI * 2;
          const isGreen = r() > 0.74;
          main.addColored(
            berry,
            isGreen ? '#86b63a' : '#d1261f',
            [px + Math.cos(a) * 0.038, py - 0.02, pz + Math.sin(a) * 0.038]
          );
        }
      }
    }
  }
  for (let k = 0; k < 5; k++) {
    main.addColored(leaf, '#388034', [0, 1.4, 0], [-0.45, k * 1.25, 0], 1, 'YXZ');
  }
  leaf.dispose();
  berry.dispose();
  return main.build(true);
}

export function createExternalRockPrototypeGeo() {
  const b = new GeoBuilder();
  const mainRock = rockGeometry(1, 0.58, 2, 0.74, true, false);
  const sideRockA = rockGeometry(22, 0.35, 1, 0.70, true, false);
  const sideRockB = rockGeometry(37, 0.29, 1, 0.66, false, false);
  b.add(mainRock, [0, 0.36, 0], [0.08, 0.3, -0.06]);
  b.add(sideRockA, [0.28, 0.22, 0.16], [-0.1, 1.4, 0.08]);
  b.add(sideRockB, [-0.26, 0.20, -0.14], [0.12, 2.5, -0.1]);
  mainRock.dispose();
  sideRockA.dispose();
  sideRockB.dispose();
  return b.build(false);
}

/** Variante de cantos rodados pulidos por el agua para el lecho, riberas y laguna andina. */
export function createRiverCobblePrototypeGeo() {
  const b = new GeoBuilder();
  const mainCobble = rockGeometry(108, 0.56, 2, 0.62, true, true);
  const pebbleA = rockGeometry(214, 0.33, 2, 0.56, true, true);
  const pebbleB = rockGeometry(319, 0.26, 1, 0.54, false, true);
  b.add(mainCobble, [0, 0.30, 0], [0.04, 0.5, 0.03]);
  b.add(pebbleA, [0.30, 0.17, -0.14], [0.06, 1.9, -0.08]);
  b.add(pebbleB, [-0.27, 0.15, 0.18], [-0.08, 2.8, 0.05]);
  mainCobble.dispose();
  pebbleA.dispose();
  pebbleB.dispose();
  return b.build(true);
}

export function createExternalFencePrototypeGeo() {
  // Centrada en X = [-1.80, +1.80], Y = [0, 1.15], Z = [-0.22, +0.22] para alinear 1:1 con colliders
  const r = modelRng(3);
  const b = new GeoBuilder();
  const postGeo = new THREE.BoxGeometry(0.14, 1.12, 0.14);
  const capGeo = new THREE.BoxGeometry(0.16, 0.06, 0.16);
  const railGeo = new THREE.BoxGeometry(1.72, 0.11, 0.07);
  const boltGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.025, 6);

  for (const px of [-1.68, 0, 1.68]) {
    b.addColored(postGeo, '#7a4c22', [px, 0.56, 0], [0, 0, (r() - 0.5) * 0.04]);
    b.addColored(capGeo, '#4a2d12', [px, 1.13, 0], [0.16, 0, 0]);
  }
  for (const cx of [-0.84, 0.84]) {
    b.addColored(railGeo, '#8a5a2b', [cx, 0.48, 0.08], [0, 0, (r() - 0.5) * 0.03]);
    b.addColored(railGeo, '#8a5a2b', [cx, 0.86, 0.08], [0, 0, (r() - 0.5) * 0.03]);
    for (const bx of [cx - 0.74, cx + 0.74]) {
      for (const by of [0.48, 0.86]) {
        b.addColored(boltGeo, '#22262b', [bx, by, 0.12], [Math.PI / 2, 0, 0]);
      }
    }
  }
  // Pilares extremos de piedra apilada (Props.tsx -> Fence)
  for (const sx of [-1.72, 1.72]) {
    let py = 0;
    for (let i = 0; i < 4; i++) {
      const rad = 0.24 - i * 0.028;
      const rg = rockGeometry(50 + i, rad, 1, 0.62, false);
      py += rad * 0.54;
      b.add(rg, [sx, py, -0.04], [0, r() * 3, 0]);
      py += rad * 0.48;
      rg.dispose();
    }
  }

  postGeo.dispose();
  capGeo.dispose();
  railGeo.dispose();
  boltGeo.dispose();
  return b.build(false);
}

export function createExternalMedkitLootMesh() {
  const g = new THREE.Group();
  const caseMat = new THREE.MeshStandardMaterial({ color: '#f4f4f2', roughness: 0.45 });
  const seamMat = new THREE.MeshStandardMaterial({ color: '#d8d8d4', roughness: 0.5 });
  const crossMat = new THREE.MeshStandardMaterial({
    color: '#e02b2b',
    emissive: '#dc2626',
    emissiveIntensity: 0.38,
    roughness: 0.35
  });
  const latchMat = new THREE.MeshStandardMaterial({ color: '#9aa0a6', metalness: 0.7, roughness: 0.3 });
  const handleMat = new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.6 });

  const boxGeo = new RoundedBoxGeometry(0.5, 0.28, 0.36, 3, 0.04);
  boxGeo.computeVertexNormals();
  addPrim(g, boxGeo, caseMat, [0, 0.14, 0]);
  addPrim(g, new THREE.BoxGeometry(0.505, 0.02, 0.37), seamMat, [0, 0.19, 0]);
  addPrim(g, new THREE.BoxGeometry(0.06, 0.014, 0.20), crossMat, [0, 0.285, 0]);
  addPrim(g, new THREE.BoxGeometry(0.20, 0.014, 0.06), crossMat, [0, 0.285, 0]);
  addPrim(g, new THREE.BoxGeometry(0.04, 0.13, 0.014), crossMat, [0, 0.14, 0.184]);
  addPrim(g, new THREE.BoxGeometry(0.13, 0.04, 0.014), crossMat, [0, 0.14, 0.184]);
  addPrim(g, new THREE.TorusGeometry(0.068, 0.012, 8, 14, Math.PI), handleMat, [0, 0.28, 0]);
  for (const lx of [-0.15, 0.15]) {
    addPrim(g, new THREE.BoxGeometry(0.05, 0.05, 0.02), latchMat, [lx, 0.20, 0.184]);
  }

  return { group: g, highlightMats: [crossMat] };
}

/* ============================================================================
 * 7. FAUNA EXTERNA (Fauna.tsx: Cóndor Andino y Danta de Montaña) + LETRERO COCORA
 * ============================================================================ */
export function populateExternalCondorModel(targets, registerMat) {
  const { bodyPivot, headPivot, wingL, wingR, tailPivot } = targets;
  const blackMat = registerMat('#161616');
  const whiteMat = registerMat('#f2f2f2');
  const featherGreyMat = registerMat('#dcdcdc');
  const skinNeckMat = registerMat('#b86a6a');
  const crestMat = registerMat('#8e3a3a');
  const beakMat = registerMat('#e7dcc0');
  const legMat = registerMat('#7a7a7a');

  const torso = addPrim(bodyPivot, new THREE.SphereGeometry(0.3, 16, 12), blackMat);
  torso.scale.set(1, 0.85, 1.9);
  const ruff = addPrim(bodyPivot, new THREE.SphereGeometry(0.22, 14, 10), whiteMat, [0, 0.1, 0.46]);
  ruff.scale.set(1.3, 0.75, 0.95);
  addPrim(bodyPivot, new THREE.CylinderGeometry(0.06, 0.09, 0.22, 8), skinNeckMat, [0, 0.16, 0.6], [0.9, 0, 0]);

  headPivot.position.set(0, 0.2, 0.74);
  addPrim(headPivot, new THREE.SphereGeometry(0.1, 12, 10), skinNeckMat);
  addPrim(headPivot, new THREE.BoxGeometry(0.03, 0.08, 0.14), crestMat, [0, 0.09, 0]);
  addPrim(headPivot, new THREE.ConeGeometry(0.045, 0.17, 8), beakMat, [0, -0.01, 0.15], [Math.PI / 2, 0, 0]);
  addPrim(headPivot, new THREE.ConeGeometry(0.03, 0.07, 8), blackMat, [0, -0.02, 0.22], [Math.PI / 2 + 0.3, 0, 0]);
  bodyPivot.add(headPivot);

  const buildCondorWing = (side, wingRoot) => {
    wingRoot.position.set(side * 0.22, 0.08, 0.05);
    addPrim(wingRoot, new THREE.BoxGeometry(0.78, 0.035, 0.6), blackMat, [side * 0.39, 0, -0.08]);
    addPrim(wingRoot, new THREE.BoxGeometry(0.64, 0.016, 0.24), whiteMat, [side * 0.36, 0.024, 0.06]);

    const outer = new THREE.Group();
    outer.position.set(side * 0.78, 0, 0);
    addPrim(outer, new THREE.BoxGeometry(0.5, 0.03, 0.52), blackMat, [side * 0.25, 0, -0.1]);
    addPrim(outer, new THREE.BoxGeometry(0.4, 0.014, 0.18), featherGreyMat, [side * 0.22, 0.02, 0.06]);
    for (let i = 0; i < 7; i++) {
      const spread = (i - 3) * 0.16;
      const len = 0.5 + (3 - Math.abs(i - 3)) * 0.06;
      const fGrp = new THREE.Group();
      fGrp.position.set(side * 0.48, 0, -0.12 - i * 0.02);
      fGrp.rotation.y = -side * spread;
      addPrim(fGrp, new THREE.BoxGeometry(len, 0.012, 0.085), blackMat, [side * len * 0.5, 0, 0]);
      outer.add(fGrp);
    }
    wingRoot.add(outer);
    return outer;
  };

  const wingOuterL = buildCondorWing(1, wingL);
  const wingOuterR = buildCondorWing(-1, wingR);
  bodyPivot.add(wingL, wingR);

  tailPivot.position.set(0, 0, -0.5);
  for (let i = 0; i < 7; i++) {
    const tf = new THREE.Group();
    tf.rotation.y = (i - 3) * 0.13;
    addPrim(tf, new THREE.BoxGeometry(0.085, 0.012, 0.55), blackMat, [0, 0, -0.27]);
    tailPivot.add(tf);
  }
  bodyPivot.add(tailPivot);

  for (const sx of [-1, 1]) {
    const claw = new THREE.Group();
    claw.position.set(sx * 0.09, -0.18, -0.05);
    claw.rotation.x = 1.1;
    addPrim(claw, new THREE.CylinderGeometry(0.025, 0.03, 0.2, 7), legMat);
    addPrim(claw, new THREE.BoxGeometry(0.07, 0.02, 0.1), legMat, [0, -0.1, 0.03]);
    bodyPivot.add(claw);
  }

  return { wingOuterL, wingOuterR };
}

/**
 * Oso de Anteojos articulado de "Modelos 3D/Animación v2/src/three/models/Bear.tsx"
 * con torso/grupa/cruz, babero crema, antifaz de anteojos y 4 patas con zarpas articuladas.
 */
export function populateExternalBearModel(targets, registerMat) {
  const { bodyPivot, headPivot, legFL, legFR, legBL, legBR } = targets;
  const furMat = registerMat('#211915');
  const fur2Mat = registerMat('#2d221c');
  const creamMat = registerMat('#e8d6a8');
  const snoutMat = registerMat('#b99a6c');
  const noseMat = registerMat('#141010');
  const clawMat = registerMat('#d9d2c4');

  const bearShift = new THREE.Group();
  bearShift.position.set(0, 0, -0.55);
  bodyPivot.add(bearShift);

  const torso = addPrim(bearShift, new THREE.SphereGeometry(0.5, 18, 14), furMat, [0, 0.82, 0.55]);
  torso.scale.set(1, 0.95, 1.25);
  const rump = addPrim(bearShift, new THREE.SphereGeometry(0.45, 16, 12), fur2Mat, [0, 0.8, 0.1]);
  rump.scale.set(1, 0.95, 1);
  addPrim(bearShift, new THREE.SphereGeometry(0.42, 16, 12), furMat, [0, 0.95, 0.95]);
  const bib = addPrim(bearShift, new THREE.SphereGeometry(0.24, 14, 10), creamMat, [0, 0.82, 1.27]);
  bib.scale.set(1.05, 1.25, 0.5);
  addPrim(bearShift, new THREE.SphereGeometry(0.08, 8, 8), furMat, [0, 0.78, -0.33]);

  headPivot.position.set(0, 1.05, 1.32);
  const skull = addPrim(headPivot, new THREE.SphereGeometry(0.27, 16, 12), furMat);
  skull.scale.set(1, 0.92, 1);
  addPrim(headPivot, new THREE.CylinderGeometry(0.1, 0.14, 0.24, 12), snoutMat, [0, -0.06, 0.26], [Math.PI / 2, 0, 0]);
  const nose = addPrim(headPivot, new THREE.SphereGeometry(0.075, 10, 8), noseMat, [0, -0.04, 0.39]);
  nose.scale.set(1.2, 0.8, 0.8);
  for (const sx of [-1, 1]) {
    addPrim(headPivot, new THREE.TorusGeometry(0.06, 0.022, 7, 14), creamMat, [sx * 0.1, 0.06, 0.2], [0, sx * 0.45, 0]);
    addPrim(headPivot, new THREE.SphereGeometry(0.03, 8, 8), noseMat, [sx * 0.1, 0.06, 0.225]);
    const earOuter = addPrim(headPivot, new THREE.SphereGeometry(0.085, 10, 8), furMat, [sx * 0.18, 0.2, -0.02]);
    earOuter.scale.set(1, 1, 0.45);
    const earInner = addPrim(headPivot, new THREE.SphereGeometry(0.045, 8, 6), snoutMat, [sx * 0.18, 0.2, 0.01]);
    earInner.scale.set(1, 1, 0.4);
  }
  addPrim(headPivot, new THREE.ConeGeometry(0.12, 0.2, 10), creamMat, [0, -0.16, 0.2], [Math.PI, 0, 0]);
  bearShift.add(headPivot);

  const paws = [];
  const setupBearLeg = (legGrp, lx, lz, isFront) => {
    const mount = new THREE.Group();
    mount.position.set(lx, 0.78, lz);
    mount.add(legGrp);
    legGrp.position.set(0, 0, 0);
    addPrim(legGrp, new THREE.CapsuleGeometry(0.13, 0.32, 5, 12), isFront ? furMat : fur2Mat, [0, -0.27, 0]);
    const pawPivot = new THREE.Group();
    pawPivot.position.set(0, -0.6, 0.03);
    const pawPad = addPrim(pawPivot, new THREE.SphereGeometry(0.13, 12, 8), furMat, [0, -0.04, 0.05]);
    pawPad.scale.set(1, 0.62, 1.3);
    for (const cx of [-0.06, 0, 0.06]) {
      addPrim(pawPivot, new THREE.ConeGeometry(0.015, 0.06, 5), clawMat, [cx, -0.07, 0.21], [Math.PI / 2, 0, 0]);
    }
    legGrp.add(pawPivot);
    bearShift.add(mount);
    paws.push(pawPivot);
  };

  setupBearLeg(legFL, 0.27, 1.05, true);
  setupBearLeg(legFR, -0.27, 1.05, true);
  setupBearLeg(legBL, 0.29, 0.12, false);
  setupBearLeg(legBR, -0.29, 0.12, false);
  return { paws };
}

export function populateExternalTapirModel(targets, registerMat) {
  const { bodyPivot, headPivot, legFL, legFR, legBL, legBR } = targets;
  const furMat = registerMat('#3a2a22');
  const earTipMat = registerMat('#efe9e2');
  const hoofMat = registerMat('#221e1c');

  // Escala ajustada a la fauna ribereña/andina del mapa (~0.74x de la danta adulta)
  const scaleWrap = new THREE.Group();
  scaleWrap.scale.setScalar(0.74);
  bodyPivot.add(scaleWrap);

  addPrim(scaleWrap, new THREE.CapsuleGeometry(0.42, 0.75, 6, 14), furMat, [0, 0.84, 0], [Math.PI / 2, 0, 0]);
  addPrim(scaleWrap, new THREE.SphereGeometry(0.44, 14, 10), furMat, [0, 0.84, -0.42]);
  addPrim(scaleWrap, new THREE.SphereGeometry(0.37, 14, 10), furMat, [0, 0.96, 0.5]);
  addPrim(scaleWrap, new THREE.ConeGeometry(0.04, 0.14, 7), furMat, [0, 0.82, -0.9], [-2.5, 0, 0]);

  headPivot.position.set(0, 1.02, 0.78);
  const skull = addPrim(headPivot, new THREE.SphereGeometry(0.27, 14, 10), furMat);
  skull.scale.set(0.85, 0.9, 1.1);
  // Trompa característica de la Danta Colombiana (Tapirus pinchaque)
  addPrim(headPivot, new THREE.CylinderGeometry(0.1, 0.15, 0.28, 10), furMat, [0, -0.1, 0.3], [Math.PI / 2 + 0.6, 0, 0]);
  addPrim(headPivot, new THREE.SphereGeometry(0.11, 10, 8), furMat, [0, -0.2, 0.4]);
  addPrim(headPivot, new THREE.CylinderGeometry(0.112, 0.112, 0.04, 10), earTipMat, [0, -0.26, 0.37], [0.5, 0, 0]);
  for (const sx of [-1, 1]) {
    const earOuter = addPrim(headPivot, new THREE.SphereGeometry(0.075, 8, 6), earTipMat, [sx * 0.17, 0.24, -0.08]);
    earOuter.scale.set(0.85, 1.25, 0.32);
    const earInner = addPrim(headPivot, new THREE.SphereGeometry(0.062, 8, 6), furMat, [sx * 0.17, 0.23, -0.065]);
    earInner.scale.set(0.8, 1.18, 0.3);
    addPrim(headPivot, new THREE.SphereGeometry(0.028, 6, 6), hoofMat, [sx * 0.18, 0.06, 0.16]);
  }
  scaleWrap.add(headPivot);

  const setupTapirLeg = (legGrp, lx, lz) => {
    legGrp.position.set(lx, 0.62, lz);
    addPrim(legGrp, new THREE.CylinderGeometry(0.1, 0.085, 0.55, 10), furMat, [0, -0.27, 0]);
    addPrim(legGrp, new THREE.CylinderGeometry(0.09, 0.1, 0.09, 10), hoofMat, [0, -0.58, 0.02]);
    scaleWrap.add(legGrp);
  };
  setupTapirLeg(legFL, 0.2, 0.45);
  setupTapirLeg(legFR, -0.2, 0.45);
  setupTapirLeg(legBL, 0.22, -0.45);
  setupTapirLeg(legBR, -0.22, -0.45);
}

/**
 * Construye el Monumento 3D "COCORA" con letras biseladas (TextGeometry + helvetiker_bold),
 * estructura trasera metálica y el Cóndor Andino posado en la letra "R" (Props.tsx -> CocoraSign).
 */
export function buildExternalCocoraSignGroup(mon, stoneMat) {
  if (!mon) return null;
  const g = new THREE.Group();
  g.position.set(mon.x, mon.y, mon.z);

  // Basamento escalonado de piedra transitable
  addPrim(g, new THREE.BoxGeometry(27.6, 0.42, 4.2), stoneMat, [0, 0.21, 0]);
  addPrim(g, new THREE.BoxGeometry(26.2, 0.34, 3.0), stoneMat, [0, 0.56, 0]);

  const letterMat = new THREE.MeshStandardMaterial({ color: '#f4f1e8', roughness: 0.52, metalness: 0.04 });
  const trussMat = new THREE.MeshStandardMaterial({ color: '#4b4f52', metalness: 0.55, roughness: 0.48 });

  const letterHeight = mon.letterHeight || 4.4;
  const letterCentersX = [-10.5, -6.3, -2.1, 2.1, 6.3, 10.5];
  const y0 = 0.70;

  if (_parsedFont) {
    const word = 'COCORA';
    for (let i = 0; i < word.length; i++) {
      const ch = word[i];
      const textGeo = new TextGeometry(ch, {
        font: _parsedFont,
        size: letterHeight * 0.88,
        depth: 0.92,
        curveSegments: 10,
        bevelEnabled: true,
        bevelThickness: 0.07,
        bevelSize: 0.055,
        bevelSegments: 2
      });
      textGeo.computeBoundingBox();
      const bb = textGeo.boundingBox;
      const w = bb.max.x - bb.min.x;
      textGeo.translate(-bb.min.x - w * 0.5, -bb.min.y, -0.46);
      textGeo.computeVertexNormals();
      addPrim(g, textGeo, letterMat, [letterCentersX[i], y0, 0]);
    }
  } else {
    // Respaldo geométrico si aún no cargó la fuente
    for (let i = 0; i < letterCentersX.length; i++) {
      addPrim(
        g,
        new THREE.BoxGeometry(2.8, letterHeight, 0.9),
        letterMat,
        [letterCentersX[i], y0 + letterHeight * 0.5, 0]
      );
    }
  }

  // Estructura metálica trasera de soporte (Props.tsx -> supports)
  const suppBuilder = new GeoBuilder();
  const post = new THREE.CylinderGeometry(0.08, 0.10, 1, 8);
  post.translate(0, 0.5, 0);
  const bar = new THREE.BoxGeometry(1, 0.12, 0.12);
  for (let i = 0; i < letterCentersX.length; i++) {
    const lx = letterCentersX[i];
    const bw = 1.75;
    for (const dx of [-bw * 0.5, bw * 0.5]) {
      suppBuilder.add(post, [lx + dx, y0 - 0.1, -0.68], [0, 0, 0], [1, letterHeight * 0.85, 1]);
    }
    suppBuilder.add(bar, [lx, y0 + letterHeight * 0.78, -0.68], [0, 0, 0], [bw, 1, 1]);
    suppBuilder.add(bar, [lx, y0 + letterHeight * 0.25, -0.68], [0, 0, 0], [bw, 1, 1]);
    const diagLen = Math.hypot(letterHeight * 0.53, bw);
    suppBuilder.add(
      bar,
      [lx, y0 + letterHeight * 0.51, -0.68],
      [0, 0, Math.atan2(letterHeight * 0.53, bw)],
      [diagLen, 0.85, 0.85]
    );
  }
  post.dispose();
  bar.dispose();
  addPrim(g, suppBuilder.build(true), trussMat);

  // Escultura de Cóndor Andino posado sobre la letra "R" (índice 4)
  const condorHolder = new THREE.Group();
  condorHolder.position.set(letterCentersX[4], y0 + letterHeight + 0.34, 0.08);
  condorHolder.scale.setScalar(1.38);
  condorHolder.rotation.set(0, 0.32, 0.03);

  const bodyPivot = new THREE.Group();
  const headPivot = new THREE.Group();
  const wingL = new THREE.Group();
  const wingR = new THREE.Group();
  const tailPivot = new THREE.Group();
  const toonGrad = getExternalToonGradient();
  populateExternalCondorModel(
    { bodyPivot, headPivot, wingL, wingR, tailPivot },
    (hex) => new THREE.MeshToonMaterial({ color: hex, gradientMap: toonGrad })
  );
  wingL.rotation.z = 0.18;
  wingR.rotation.z = -0.18;
  condorHolder.add(bodyPivot);
  g.add(condorHolder);

  return g;
}
