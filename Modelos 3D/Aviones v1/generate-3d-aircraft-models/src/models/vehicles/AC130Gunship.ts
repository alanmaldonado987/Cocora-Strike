import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { computeGeometryStats, tagPart } from "../materials";
import {
  createLoftedFuselage,
  createWingGeometry,
  hullSampler,
  parametricPatch,
  type LoftStation,
} from "../surfaces";
import type { AnimatedPart, BuiltModelResult, VehicleController } from "../types";

/*
 * AC-130J Ghostrider: articulated mid-poly gunship.
 * Axes: +Z nose, +Y up, +X port (left). Gun stations are on the port side.
 * The hull is a single sampled surface with real openings cut out of it; glass,
 * doors and the ramp are sampled from that same surface so they fit exactly.
 */

const FUS_Y = 1.18;
const TAU = Math.PI * 2;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const ease = (t: number) => t * t * (3 - 2 * t);
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const approach = (a: number, b: number, step: number) => (a < b ? Math.min(b, a + step) : Math.max(b, a - step));

/* ------------------------------------------------------------------ */
/* Procedural textures                                                 */
/* ------------------------------------------------------------------ */

function rng(seed: number) {
  return () => (seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296;
}

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, color = true) {
  if (typeof document === "undefined") return null;
  const el = document.createElement("canvas");
  el.width = w;
  el.height = h;
  draw(el.getContext("2d")!);
  const tex = new THREE.CanvasTexture(el);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  if (color) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Same panel layout drawn three ways so albedo, roughness and relief line up. */
function panelTexture(mode: "albedo" | "rough" | "bump") {
  return canvasTexture(
    1024,
    512,
    (c) => {
      const r = rng(11);
      const base = mode === "albedo" ? [138, 145, 150] : mode === "rough" ? [166, 166, 166] : [128, 128, 128];
      const shade = (k: number) => `rgb(${base.map((v) => Math.round(v + k)).join(",")})`;
      c.fillStyle = shade(0);
      c.fillRect(0, 0, 1024, 512);
      for (let x = 0; x < 1024; x += 128)
        for (let y = 0; y < 512; y += 128) {
          c.fillStyle = shade(mode === "bump" ? 0 : (r() - 0.5) * (mode === "rough" ? 30 : 10));
          c.fillRect(x + 1, y + 1, 126, 126);
        }
      if (mode !== "bump")
        for (let i = 0; i < 320; i++) {
          // Exhaust grime and rain streaks: darker paint, rougher finish.
          c.fillStyle = mode === "albedo" ? `rgba(58,62,64,${r() * 0.07})` : `rgba(230,230,230,${r() * 0.14})`;
          c.fillRect(r() * 1024, r() * 512, 2 + r() * 6, 24 + r() * 110);
        }
      c.strokeStyle = mode === "albedo" ? "#5c6165" : mode === "rough" ? "#dadada" : "#383838";
      c.lineWidth = 2;
      for (let x = 0; x <= 1024; x += 128) {
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x, 512);
        c.stroke();
      }
      for (let y = 0; y <= 512; y += 128) {
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(1024, y);
        c.stroke();
      }
      c.lineWidth = 1.5;
      for (let i = 0; i < 12; i++) {
        const x = Math.floor(r() * 8) * 128 + 18;
        const y = Math.floor(r() * 4) * 128 + 26;
        c.strokeRect(x, y, 56 + r() * 34, 36 + r() * 24);
      }
      c.fillStyle = mode === "albedo" ? "#a8adb1" : mode === "rough" ? "#888888" : "#a2a2a2";
      for (let x = 0; x <= 1024; x += 128) for (let y = 6; y < 512; y += 12) c.fillRect(x + 4, y, 2, 2);
      for (let y = 0; y <= 512; y += 128) for (let x = 6; x < 1024; x += 12) c.fillRect(x, y + 4, 2, 2);
    },
    mode === "albedo",
  );
}

function noiseTexture(lo: number, hi: number, seed: number, stripes = false) {
  return canvasTexture(
    256,
    256,
    (c) => {
      const r = rng(seed);
      const img = c.createImageData(256, 256);
      for (let i = 0; i < 256 * 256; i++) {
        const x = i % 256;
        const t = stripes ? 0.65 * (0.5 + 0.5 * Math.sin(x * 0.75)) + 0.35 * r() : r();
        const v = lo + (hi - lo) * t;
        img.data.set([v, v, v, 255], i * 4);
      }
      c.putImageData(img, 0, 0);
    },
    false,
  );
}

function instrumentTexture() {
  return canvasTexture(256, 128, (c) => {
    c.fillStyle = "#1a2023";
    c.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 4; i++) {
      const x = 8 + i * 62;
      c.fillStyle = "#071012";
      c.fillRect(x, 14, 52, 58);
      c.strokeStyle = i % 2 ? "#e2b55c" : "#7cc4ae";
      c.lineWidth = 2;
      c.beginPath();
      for (let j = 0; j < 16; j++) c.lineTo(x + 4 + j * 3, 44 + Math.sin(j * 0.6 + i) * 11);
      c.stroke();
      c.fillStyle = "#6f9c8e";
      c.fillRect(x + 4, 18, 44, 2);
    }
    for (let j = 0; j < 14; j++) {
      c.fillStyle = j % 4 === 0 ? "#c9a25b" : "#59666a";
      c.fillRect(10 + j * 17, 92, 9, 10);
    }
  });
}

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

function createMaterials() {
  const paintMap = panelTexture("albedo");
  const paintRough = panelTexture("rough");
  const paintBump = panelTexture("bump");
  for (const t of [paintMap, paintRough, paintBump]) t?.repeat.set(2.6, 1.7);
  const steelRough = noiseTexture(60, 150, 3);
  const steelMetal = noiseTexture(175, 255, 5);
  const tread = noiseTexture(25, 235, 9, true);
  tread?.repeat.set(10, 1);
  const deck = noiseTexture(80, 205, 13, true);
  deck?.repeat.set(6, 14);
  const screens = instrumentTexture();

  const std = (name: string, p: THREE.MeshStandardMaterialParameters) =>
    Object.assign(new THREE.MeshStandardMaterial(p), { name });
  const interior = std("ac130Interior", { color: 0x5b6367, roughness: 0.84, metalness: 0.12 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x5c9aa3,
    transparent: true,
    opacity: 0.35,
    roughness: 0.1,
    metalness: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  glass.name = "canopySmoke";

  return {
    // Matte painted airframe: albedo + roughness + relief from one panel layout.
    paint: std("ac130Paint", {
      map: paintMap,
      roughnessMap: paintRough,
      bumpMap: paintBump,
      bumpScale: 0.9,
      roughness: 1,
      metalness: 0.18,
    }),
    trim: std("ac130Trim", { color: 0x737a80, roughnessMap: paintRough, roughness: 0.85, metalness: 0.3 }),
    interior,
    lining: Object.assign(interior.clone(), { side: THREE.BackSide, name: "ac130Lining" }),
    interiorDouble: Object.assign(interior.clone(), { side: THREE.DoubleSide, name: "ac130Reveal" }),
    deck: std("ac130Deck", { color: 0x343a3e, roughnessMap: deck, roughness: 1, metalness: 0.55 }),
    // Weapon steel: noisy roughness, worn metalness.
    steel: std("ac130Steel", {
      color: 0x2c3137,
      roughnessMap: steelRough,
      metalnessMap: steelMetal,
      roughness: 1,
      metalness: 1,
    }),
    chrome: std("ac130Chrome", { color: 0xd5dde4, roughness: 0.12, metalness: 1 }),
    brass: std("ac130Brass", { color: 0xc29a46, roughness: 0.3, metalness: 0.9 }),
    burnt: std("ac130Burnt", { color: 0x4a413c, roughness: 0.45, metalness: 0.8 }),
    exhaust: std("ac130Exhaust", {
      color: 0x3e3633,
      roughness: 0.4,
      metalness: 0.75,
      emissive: 0xff5a1f,
      emissiveIntensity: 0,
    }),
    rubber: std("ac130Rubber", { color: 0x17181a, bumpMap: tread, bumpScale: 2, roughness: 0.93, metalness: 0 }),
    hub: std("ac130Hub", { color: 0x9aa1a6, roughness: 0.35, metalness: 0.75 }),
    black: std("ac130Black", { color: 0x202427, roughness: 0.55, metalness: 0.3 }),
    suit: std("ac130Suit", { color: 0x57614b, roughness: 0.9, metalness: 0 }),
    helmet: std("ac130Helmet", { color: 0x737e77, roughness: 0.5, metalness: 0.1 }),
    visor: std("ac130Visor", { color: 0x182024, roughness: 0.12, metalness: 0.7 }),
    ordnance: std("ac130Ordnance", { color: 0x4b5439, roughness: 0.55, metalness: 0.3 }),
    yellow: std("ac130Yellow", { color: 0xe3b53e, roughness: 0.45, metalness: 0.15 }),
    blade: std("ac130Blade", { vertexColors: true, roughness: 0.45, metalness: 0.25 }),
    blur: std("ac130PropDisc", {
      color: 0x24282b,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      roughness: 0.6,
    }),
    flash: std("ac130Flash", {
      color: 0xffd28a,
      emissive: 0xffa040,
      emissiveIntensity: 3,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    screen: std("ac130Screens", {
      map: screens,
      emissiveMap: screens,
      emissive: 0x9cc4b1,
      emissiveIntensity: 0.55,
      roughness: 0.6,
    }),
    lamp: std("ac130Lamp", { color: 0xffe2b0, emissive: 0xffc27a, emissiveIntensity: 1.6 }),
    lens: Object.assign(
      new THREE.MeshPhysicalMaterial({
        color: 0x1f8f6c,
        emissive: 0x0b3d2c,
        roughness: 0.05,
        metalness: 0.4,
        clearcoat: 1,
      }),
      { name: "ac130Lens" },
    ),
    hud: std("ac130Hud", {
      color: 0x58e0a6,
      emissive: 0x23b97c,
      emissiveIntensity: 1.2,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    navRed: std("ac130NavRed", { color: 0xff5040, emissive: 0xe0281c, emissiveIntensity: 1.5 }),
    navGreen: std("ac130NavGreen", { color: 0x4cff7a, emissive: 0x16b34a, emissiveIntensity: 1.5 }),
    glass,
  };
}

type Mats = ReturnType<typeof createMaterials>;
let materialCache: Mats | null = null;
const materials = () => (materialCache ??= createMaterials());

/* ------------------------------------------------------------------ */
/* Hull definition and sampling                                        */
/* ------------------------------------------------------------------ */

const SECTIONS: LoftStation[] = [
  [-3.94, 0.04, 0.09, 0.07, 1.64],
  [-3.55, 0.31, 0.27, 0.19, 1.59],
  [-2.85, 0.52, 0.45, 0.32, 1.48],
  [-2.2, 0.7, 0.62, 0.47, 1.34],
  [-1.42, 0.795, 0.75, 0.685, 1.19],
  [-0.65, 0.81, 0.77, 0.69, 1.18],
  [1.25, 0.81, 0.77, 0.69, 1.18],
  [1.81, 0.794, 0.75, 0.686, 1.18],
  [2.22, 0.758, 0.665, 0.64, 1.15],
  [2.67, 0.67, 0.505, 0.564, 1.085],
  [3.05, 0.56, 0.361, 0.44, 1.02],
  [3.42, 0.414, 0.275, 0.318, 0.97],
  [3.71, 0.225, 0.17, 0.191, 0.96],
  [3.86, 0.022, 0.018, 0.022, 0.97],
].map(([z, halfWidth, topHeight, bottomHeight, yCenter]) => ({
  z,
  halfWidth,
  topHeight,
  bottomHeight,
  yCenter,
  squareness: 0.22,
}));
const hullAt = hullSampler(SECTIONS);
const Z0 = -3.94;
const Z1 = 3.86;
const centerY = (z: number) => (hullAt(z, 0).y + hullAt(z, Math.PI).y) / 2;

/** Bisection on the hull angle; f(from) < 0 and f(to) > 0. */
function angleWhere(z: number, from: number, to: number, f: (p: THREE.Vector3) => number) {
  let a = from;
  let b = to;
  for (let i = 0; i < 26; i++) {
    const mid = (a + b) / 2;
    if (f(hullAt(z, mid)) < 0) a = mid;
    else b = mid;
  }
  return (a + b) / 2;
}
/** Point on the hull side (s = +1 port, -1 starboard) at a given height. */
const sidePoint = (z: number, y: number, s: number) => hullAt(z, angleWhere(z, 0, s * Math.PI, (p) => y - p.y));

/* Real openings (signed distance, negative inside the hole). */
type Opening = (p: THREE.Vector3) => number;
const rect =
  (s: number, z0: number, z1: number, y0: number, y1: number): Opening =>
  (p) =>
    Math.max(z0 - p.z, p.z - z1, y0 - p.y, p.y - y1, -s * p.x);

const WIND = { z0: 2.3, z1: 2.96 };
const windLow = (z: number) => 1.31 - (0.17 * (z - WIND.z0)) / (WIND.z1 - WIND.z0);
const SIDE_WINDOW = { z0: 2.02, z1: 2.22, y0: 1.02, y1: 1.22 };
const PORTS = {
  rotary: { z0: 1.04, z1: 1.46, y0: 0.8, y1: 1.36, z: 1.25 },
  howitzer: { z0: -1.07, z1: -0.49, y0: 0.8, y1: 1.36, z: -0.78 },
};
const DOOR = { z0: -1.45, z1: -0.95, y0: 0.68, y1: 1.52 };
const RAMP = { z0: -1.55, z1: -3.0, halfWidth: 0.6 };
const rampTop = (z: number) => lerp(0.86, 1.42, (RAMP.z0 - z) / (RAMP.z0 - RAMP.z1));

const OPENINGS: Opening[] = [
  (p) => Math.max(WIND.z0 - p.z, p.z - WIND.z1, windLow(p.z) - p.y),
  rect(1, SIDE_WINDOW.z0, SIDE_WINDOW.z1, SIDE_WINDOW.y0, SIDE_WINDOW.y1),
  rect(-1, SIDE_WINDOW.z0, SIDE_WINDOW.z1, SIDE_WINDOW.y0, SIDE_WINDOW.y1),
  rect(1, PORTS.rotary.z0, PORTS.rotary.z1, PORTS.rotary.y0, PORTS.rotary.y1),
  rect(1, PORTS.howitzer.z0, PORTS.howitzer.z1, PORTS.howitzer.y0, PORTS.howitzer.y1),
  rect(-1, DOOR.z0, DOOR.z1, DOOR.y0, DOOR.y1),
  (p) => Math.max(RAMP.z1 - p.z, p.z - RAMP.z0, Math.abs(p.x) - RAMP.halfWidth, p.y - rampTop(p.z)),
];
const outsideOpenings = (p: THREE.Vector3) => Math.min(...OPENINGS.map((o) => o(p)));

/** Ensures a hull-sampled patch faces outward so the BackSide lining reads inside. */
function orientOutward(g: THREE.BufferGeometry) {
  const idx = g.index!;
  const pos = g.getAttribute("position");
  const t = Math.floor(idx.count / 6) * 3;
  const [a, b, c] = [0, 1, 2].map((k) => V().fromBufferAttribute(pos, idx.getX(t + k)));
  const n = b.clone().sub(a).cross(c.clone().sub(a));
  if (n.dot(V(a.x, a.y - centerY(a.z), 0)) < 0) {
    const arr = idx.array as Uint16Array | Uint32Array;
    for (let i = 0; i < arr.length; i += 3) [arr[i + 1], arr[i + 2]] = [arr[i + 2], arr[i + 1]];
    idx.needsUpdate = true;
    g.computeVertexNormals();
  }
  return g;
}

/** Removes every triangle portion inside an opening (open topology, no overlap). */
function clipGeometry(g: THREE.BufferGeometry, keep: (p: THREE.Vector3) => number) {
  type Vx = { p: THREE.Vector3; n: THREE.Vector3; u: THREE.Vector2; d: number };
  const idx = g.index!;
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const uv = g.getAttribute("uv");
  const P: number[] = [];
  const N: number[] = [];
  const U: number[] = [];
  const read = (k: number): Vx => {
    const p = V().fromBufferAttribute(pos, k);
    return { p, n: V().fromBufferAttribute(nor, k), u: new THREE.Vector2(uv.getX(k), uv.getY(k)), d: keep(p) };
  };
  const mix = (a: Vx, b: Vx, t: number): Vx => ({
    p: a.p.clone().lerp(b.p, t),
    n: a.n.clone().lerp(b.n, t).normalize(),
    u: a.u.clone().lerp(b.u, t),
    d: 0,
  });
  for (let i = 0; i < idx.count; i += 3) {
    const tri = [read(idx.getX(i)), read(idx.getX(i + 1)), read(idx.getX(i + 2))];
    const poly: Vx[] = [];
    for (let j = 0; j < 3; j++) {
      const a = tri[j];
      const b = tri[(j + 1) % 3];
      if (a.d >= 0) poly.push(a);
      if (a.d >= 0 !== b.d >= 0) poly.push(mix(a, b, a.d / (a.d - b.d)));
    }
    for (let j = 1; j < poly.length - 1; j++)
      for (const v of [poly[0], poly[j], poly[j + 1]]) {
        P.push(v.p.x, v.p.y, v.p.z);
        N.push(v.n.x, v.n.y, v.n.z);
        U.push(v.u.x, v.u.y);
      }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
  return out;
}

function hullGeometry() {
  const nu = 88;
  const nv = 46;
  const g = orientOutward(parametricPatch((u, v) => hullAt(lerp(Z0, Z1, u), (v - 0.5) * TAU), nu, nv));
  // Weld shading across the bottom seam (v = 0 / v = 1 share positions).
  const normal = g.getAttribute("normal");
  const n = V();
  for (let i = 0; i <= nu; i++) {
    const k = nv * (nu + 1) + i;
    n.set(normal.getX(i) + normal.getX(k), normal.getY(i) + normal.getY(k), normal.getZ(i) + normal.getZ(k));
    n.normalize();
    normal.setXYZ(i, n.x, n.y, n.z);
    normal.setXYZ(k, n.x, n.y, n.z);
  }
  const clipped = clipGeometry(g, outsideOpenings);
  g.dispose();
  return clipped;
}

/* ------------------------------------------------------------------ */
/* Small geometry helpers                                              */
/* ------------------------------------------------------------------ */

const rounded = (w: number, h: number, d: number, r = Math.min(w, h, d) * 0.22) =>
  new RoundedBoxGeometry(w, h, d, 1, r);
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const out = new THREE.Mesh(g, m);
  out.position.set(x, y, z);
  return out;
};
const line = (n: number, f: (t: number) => THREE.Vector3) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
function tube(points: THREE.Vector3[], r: number, m: THREE.Material, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(6, Math.round(points.length * 1.2)), r, 5, closed), m);
}
function lathe(profile: number[][], m: THREE.Material, seg = 24) {
  return new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg), m);
}
/** Cylinder whose axis runs along +Z, from z = 0 to z = length. */
function zCylinder(r0: number, r1: number, length: number, m: THREE.Material, seg = 12) {
  const g = new THREE.CylinderGeometry(r1, r0, length, seg);
  g.rotateX(Math.PI / 2).translate(0, 0, length / 2);
  return new THREE.Mesh(g, m);
}

/** Perimeter of a rectangular side opening, sampled on the hull. */
function sideLoop(s: number, o: { z0: number; z1: number; y0: number; y1: number }, n = 5) {
  const pts: THREE.Vector3[] = [];
  const edge = (za: number, ya: number, zb: number, yb: number) => {
    for (let i = 0; i < n; i++) pts.push(sidePoint(lerp(za, zb, i / n), lerp(ya, yb, i / n), s));
  };
  edge(o.z0, o.y0, o.z1, o.y0);
  edge(o.z1, o.y0, o.z1, o.y1);
  edge(o.z1, o.y1, o.z0, o.y1);
  edge(o.z0, o.y1, o.z0, o.y0);
  return pts;
}

/** Bevelled frame: outer rim tube plus an inward reveal that gives the skin thickness. */
function openingTrim(loop: THREE.Vector3[], m: Mats, depth = 0.07, radius = 0.018) {
  const g = new THREE.Group();
  g.add(tube(loop, radius, m.trim, true));
  const P: number[] = [];
  const U: number[] = [];
  const I: number[] = [];
  loop.forEach((p, i) => {
    const n = V(p.x, (p.y - centerY(p.z)) * 0.4, 0).normalize();
    P.push(...p.toArray(), ...p.clone().addScaledVector(n, -depth).toArray());
    U.push(i / loop.length, 0, i / loop.length, 1);
    const a = i * 2;
    const b = ((i + 1) % loop.length) * 2;
    I.push(a, b, a + 1, b, b + 1, a + 1);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
  geo.setIndex(I);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, m.interiorDouble));
  return g;
}

/** Twisted, tapered blade with a yellow painted tip (vertex colours). */
function bladeGeometry(length: number, chord: number) {
  const spans = [0, 0.15, 0.4, 0.68, 0.87, 0.875, 1];
  const P: number[] = [];
  const C: number[] = [];
  const U: number[] = [];
  const I: number[] = [];
  const dark = new THREE.Color(0x1f2326);
  const edge = new THREE.Color(0x60656a);
  const tip = new THREE.Color(0xe3b53e);
  spans.forEach((t, j) => {
    const w = chord * (0.55 + 0.6 * Math.sin(Math.PI * (0.15 + t * 0.7))) * (t === 1 ? 0.7 : 1);
    const twist = 0.55 * (1 - t) + 0.12;
    const sweep = chord * 0.35 * t * t;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const x = (Math.cos(a) * w) / 2;
      const h = Math.sin(a) * chord * 0.06;
      P.push(x * Math.cos(twist) + sweep, t * length, h + x * Math.sin(twist));
      const c = t > 0.87 ? tip : i === 0 ? edge : dark;
      C.push(c.r, c.g, c.b);
      U.push(i / 8, t);
      if (j < spans.length - 1) {
        const k = j * 8 + i;
        const n = j * 8 + ((i + 1) % 8);
        I.push(k, k + 8, n, n, k + 8, n + 8);
      }
    }
  });
  const last = (spans.length - 1) * 8;
  for (let i = 1; i < 7; i++) I.push(last, last + i + 1, last + i);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
  geo.setIndex(I);
  geo.computeVertexNormals();
  return geo;
}

/* ------------------------------------------------------------------ */
/* Crew, seats, landing gear                                           */
/* ------------------------------------------------------------------ */

function crewFigure(m: Mats, seated: boolean) {
  const g = new THREE.Group();
  g.name = "Crew station";
  const capsule = (r: number, l: number, mat: THREE.Material) =>
    new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 2, 7), mat);
  const base = seated ? 0 : 0.27;
  const torso = capsule(0.062, 0.12, m.suit);
  torso.position.set(0, base + 0.13, seated ? -0.02 : 0);
  g.add(torso);
  const head = mesh(new THREE.SphereGeometry(0.045, 12, 8), m.helmet, 0, base + 0.29, seated ? -0.015 : 0);
  head.scale.set(1, 1.08, 1.05);
  g.add(head);
  const visor = mesh(new THREE.SphereGeometry(0.04, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), m.visor);
  visor.rotation.x = Math.PI / 2;
  visor.position.set(0, base + 0.285, seated ? 0.012 : 0.028);
  g.add(visor);
  for (const s of [-1, 1]) {
    const arm = capsule(0.022, 0.12, m.suit);
    arm.position.set(s * 0.078, base + 0.13, seated ? 0.05 : 0.04);
    arm.rotation.x = seated ? -1.0 : -0.7;
    g.add(arm);
    if (seated) {
      const thigh = capsule(0.03, 0.12, m.suit);
      thigh.rotation.x = Math.PI / 2;
      thigh.position.set(s * 0.04, 0.02, 0.09);
      const shin = capsule(0.026, 0.12, m.suit);
      shin.position.set(s * 0.04, -0.07, 0.17);
      g.add(thigh, shin);
    } else {
      const leg = capsule(0.03, 0.2, m.suit);
      leg.position.set(s * 0.038, 0.13, 0);
      g.add(leg);
    }
  }
  return g;
}

function seat(m: Mats) {
  const g = new THREE.Group();
  g.add(mesh(rounded(0.17, 0.045, 0.17), m.black, 0, -0.022, 0));
  const back = mesh(rounded(0.16, 0.27, 0.045), m.black, 0, 0.13, -0.095);
  back.rotation.x = -0.12;
  g.add(back);
  g.add(mesh(new THREE.CylinderGeometry(0.02, 0.026, 0.13, 8), m.steel, 0, -0.1, 0));
  return g;
}

function tireMesh(r: number, m: Mats) {
  const w = r * 0.36;
  const tire = lathe(
    [
      [r * 0.5, -w],
      [r * 0.8, -w],
      [r * 0.95, -w * 0.72],
      [r, -w * 0.32],
      [r, w * 0.32],
      [r * 0.95, w * 0.72],
      [r * 0.8, w],
      [r * 0.5, w],
      [r * 0.5, -w],
    ],
    m.rubber,
    16,
  );
  const hub = lathe(
    [
      [0, -w * 1.05],
      [r * 0.26, -w * 1.05],
      [r * 0.4, -w * 0.8],
      [r * 0.52, -w * 0.9],
      [r * 0.52, w * 0.9],
      [r * 0.4, w * 0.8],
      [r * 0.26, w * 1.05],
      [0, w * 1.05],
    ],
    m.hub,
    12,
  );
  const g = new THREE.Group();
  g.add(tire, hub);
  g.rotation.z = Math.PI / 2;
  return g;
}

/** Oleo strut with chrome piston, torque links and twin wheels resting on y = 0. */
function landingGear(m: Mats, top: THREE.Vector3, wheelR: number) {
  const g = new THREE.Group();
  g.position.copy(top);
  const h = top.y - wheelR;
  g.add(mesh(new THREE.CylinderGeometry(0.034, 0.04, h * 0.56, 12), m.trim, 0, -h * 0.28, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.023, 0.023, h * 0.5, 10), m.chrome, 0, -h * 0.72, 0));
  for (const [y, rx] of [
    [-h * 0.5, 0.55],
    [-h * 0.72, -0.55],
  ]) {
    const link = mesh(rounded(0.014, h * 0.25, 0.05, 0.005), m.steel, 0, y, -0.035);
    link.rotation.x = rx;
    g.add(link);
  }
  const axle = mesh(new THREE.CylinderGeometry(0.016, 0.016, wheelR * 1.75, 8), m.steel, 0, -h, 0);
  axle.rotation.z = Math.PI / 2;
  g.add(axle);
  for (const s of [-1, 1]) {
    const w = tireMesh(wheelR, m);
    w.position.set(s * wheelR * 0.55, -h, 0);
    g.add(w);
  }
  return g;
}

/* ------------------------------------------------------------------ */
/* Engines                                                             */
/* ------------------------------------------------------------------ */

const NACELLE = { L: 1.38, R: 0.25, prop: 0.64, blades: 6 };

function turboprop(m: Mats) {
  const { L, R } = NACELLE;
  const group = new THREE.Group();
  const shape = [
    [-0.87, 0.1],
    [-0.65, 0.55],
    [-0.42, 0.92],
    [0, 1.05],
    [0.36, 0.99],
    [0.49, 0.86],
    [0.54, 0.64],
  ];
  group.add(
    new THREE.Mesh(
      createLoftedFuselage(
        shape.map(([z, w]) => ({ z: z * L, halfWidth: R * w, topHeight: R * w, bottomHeight: R * w * 1.14 })),
        28,
      ),
      m.paint,
    ),
  );
  // Integrated chin oil-cooler scoop with a dark open mouth.
  const scoop = new THREE.Mesh(
    createLoftedFuselage(
      [
        { z: -0.2, halfWidth: 0.02, topHeight: 0.02, bottomHeight: 0.02 },
        { z: 0.05, halfWidth: R * 0.5, topHeight: R * 0.3, bottomHeight: R * 0.3 },
        { z: 0.3, halfWidth: R * 0.56, topHeight: R * 0.34, bottomHeight: R * 0.34 },
      ],
      16,
    ),
    m.paint,
  );
  scoop.position.set(0, -R * 0.88, L * 0.22);
  group.add(scoop);
  group.add(mesh(new THREE.CircleGeometry(R * 0.4, 16), m.black, 0, -R * 0.88, L * 0.22 + 0.302));
  const pipe = lathe(
    [
      [R * 0.42, 0],
      [R * 0.44, 0.03],
      [R * 0.4, 0.2],
      [R * 0.33, 0.2],
      [R * 0.33, 0],
    ],
    m.exhaust,
    16,
  );
  pipe.rotation.x = -Math.PI / 2;
  pipe.position.set(0, -R * 0.35, -L * 0.53);
  group.add(pipe);

  const propRotor = new THREE.Group();
  propRotor.position.z = L * 0.56;
  const spinner = lathe(
    [
      [0, -0.06],
      [R * 0.66, -0.06],
      [R * 0.66, 0.02],
      [R * 0.57, R * 0.4],
      [R * 0.36, R * 0.8],
      [R * 0.09, R * 1.06],
      [0, R * 1.1],
    ],
    m.black,
    24,
  );
  spinner.rotation.x = Math.PI / 2;
  propRotor.add(spinner);
  const blade = bladeGeometry(NACELLE.prop * 0.86, NACELLE.prop * 0.2);
  for (let i = 0; i < NACELLE.blades; i++) {
    const holder = new THREE.Group();
    holder.rotation.z = ((i + 0.25) * TAU) / NACELLE.blades;
    holder.add(mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.08, 8), m.steel, 0, R * 0.62, 0));
    holder.add(mesh(blade, m.blade, 0, NACELLE.prop * 0.14, 0));
    propRotor.add(holder);
  }
  group.add(propRotor);
  // Motion-blur disc: fades in with RPM (depthWrite disabled).
  const disc = mesh(new THREE.RingGeometry(R * 0.66, NACELLE.prop, 40), m.blur, 0, 0, propRotor.position.z + 0.02);
  disc.renderOrder = 4;
  group.add(disc);
  return { group, propRotor };
}

/* ------------------------------------------------------------------ */
/* Gun mounts                                                          */
/* ------------------------------------------------------------------ */

interface GunMount {
  kind: "rotary" | "howitzer";
  pan: THREE.Group;
  tilt: THREE.Group;
  recoil: THREE.Group;
  spin?: THREE.Group;
  flash: THREE.Mesh;
  flashMaterial: THREE.MeshStandardMaterial;
  feed: THREE.Group;
  recoilOffset: number;
  flashLevel: number;
  timer: number;
  spinRate: number;
}

const MOUNT_X = 0.42;
const MOUNT_Y = 1.1;
const FLOOR_Y = 0.62;

/** Floor-anchored pan/tilt mount; breech and feed inside, barrel out of the port. */
function gunMount(kind: GunMount["kind"], z: number, m: Mats) {
  const base = new THREE.Group();
  base.add(mesh(rounded(0.26, 0.03, 0.26), m.steel, MOUNT_X - 0.02, FLOOR_Y + 0.015, z));
  base.add(mesh(new THREE.CylinderGeometry(0.03, 0.045, MOUNT_Y - FLOOR_Y - 0.06, 10), m.steel, MOUNT_X, (MOUNT_Y + FLOOR_Y) / 2 - 0.03, z));
  // Brace from pedestal to the window frame keeps the mount structurally tied to the hull.
  base.add(tube([V(MOUNT_X, FLOOR_Y + 0.18, z), V(0.6, 0.72, z), sidePoint(z, 0.78, 1).addScaledVector(V(1, 0, 0), -0.03)], 0.012, m.steel));

  const pan = new THREE.Group();
  pan.position.set(MOUNT_X, MOUNT_Y, z);
  pan.rotation.y = Math.PI / 2;
  pan.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 16), m.steel, 0, -0.045, 0));
  for (const s of [-1, 1]) pan.add(mesh(rounded(0.02, 0.09, 0.08, 0.008), m.steel, s * 0.075, -0.01, 0));
  const tilt = new THREE.Group();
  pan.add(tilt);
  tilt.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.17, 8).rotateZ(Math.PI / 2), m.chrome));
  const recoil = new THREE.Group();
  tilt.add(recoil);
  const feed = new THREE.Group();
  tilt.add(feed);

  const flashMaterial = m.flash.clone();
  const flashGeo = new THREE.ConeGeometry(kind === "rotary" ? 0.05 : 0.08, kind === "rotary" ? 0.18 : 0.28, 10, 1, true);
  flashGeo.rotateX(Math.PI / 2);
  const flash = new THREE.Mesh(flashGeo, flashMaterial);
  flash.renderOrder = 5;
  let spin: THREE.Group | undefined;

  if (kind === "rotary") {
    // GAU-12 25 mm five-barrel rotary cannon.
    recoil.add(mesh(rounded(0.11, 0.11, 0.26), m.steel, 0, 0, -0.08));
    const motor = zCylinder(0.026, 0.026, 0.15, m.black);
    motor.position.set(0.07, 0.03, -0.18);
    recoil.add(motor);
    recoil.add(tube([V(-0.03, 0.02, -0.21), V(-0.03, 0.08, -0.25), V(0, 0.08, -0.3), V(0.03, 0.02, -0.25)], 0.008, m.black)); // spade grip
    spin = new THREE.Group();
    spin.position.z = 0.05;
    recoil.add(spin);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      const barrel = zCylinder(0.0105, 0.009, 0.55, m.steel, 8);
      barrel.position.set(Math.cos(a) * 0.03, Math.sin(a) * 0.03, 0);
      spin.add(barrel);
    }
    for (const cz of [0.18, 0.4, 0.53]) {
      const clampRing = zCylinder(0.046, 0.046, 0.016, m.steel, 14);
      clampRing.position.z = cz;
      spin.add(clampRing);
    }
    flash.position.z = 0.71;
    recoil.add(flash);
    // Mounted linkless drum and feed chute travel with the gun.
    const drum = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.15, 16).rotateZ(Math.PI / 2), m.ordnance, -0.13, -0.03, -0.12);
    feed.add(drum, mesh(new THREE.TorusGeometry(0.076, 0.008, 6, 18).rotateY(Math.PI / 2), m.steel, -0.13, -0.03, -0.12));
    feed.add(tube([V(-0.11, 0.04, -0.1), V(-0.09, 0.08, -0.06), V(-0.055, 0.05, -0.04)], 0.016, m.steel));
    for (let i = 0; i < 4; i++) feed.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.04, 6), m.brass, -0.1 + i * 0.012, 0.075 - i * 0.008, -0.08 + i * 0.012));
  } else {
    // M102 105 mm howitzer on a sliding recoil cradle.
    recoil.add(mesh(rounded(0.13, 0.13, 0.2), m.steel, 0, 0, -0.12));
    const barrel = zCylinder(0.032, 0.026, 0.82, m.steel, 14);
    barrel.position.z = 0;
    recoil.add(barrel);
    recoil.add(mesh(rounded(0.075, 0.05, 0.09, 0.012), m.burnt, 0, 0, 0.85));
    flash.position.z = 1.02;
    recoil.add(flash);
    const sleeve = zCylinder(0.046, 0.046, 0.3, m.steel, 14);
    sleeve.position.z = -0.03;
    tilt.add(sleeve);
    for (const y of [-0.058, 0.058]) {
      const cyl = zCylinder(0.016, 0.016, 0.3, m.chrome, 8);
      cyl.position.set(0, y, -0.06);
      tilt.add(cyl);
    }
    feed.add(mesh(rounded(0.05, 0.06, 0.12, 0.01), m.ordnance, -0.1, -0.04, -0.12));
  }

  const state: GunMount = { kind, pan, tilt, recoil, spin, flash, flashMaterial, feed, recoilOffset: 0, flashLevel: 0, timer: 0, spinRate: 0 };
  return { base, state };
}

/* ------------------------------------------------------------------ */
/* Hydraulic piston                                                    */
/* ------------------------------------------------------------------ */

/** Telescopic actuator between an anchor on the airframe and one on a moving part. */
class Piston {
  readonly group = new THREE.Group();
  readonly rod: THREE.Mesh;
  private readonly sleeve: number;
  private readonly eye: THREE.Mesh;
  private readonly a = V();
  private readonly b = V();

  constructor(
    private readonly anchorA: THREE.Object3D,
    private readonly localA: THREE.Vector3,
    private readonly anchorB: THREE.Object3D,
    private readonly localB: THREE.Vector3,
    closedLength: number,
    radius: number,
    m: Mats,
  ) {
    this.sleeve = closedLength * 0.62;
    this.group.add(zCylinder(radius, radius, this.sleeve, m.steel, 10));
    this.group.add(mesh(new THREE.SphereGeometry(radius * 1.3, 8, 6), m.steel));
    const rodGeo = new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, 1, 8);
    rodGeo.rotateX(Math.PI / 2).translate(0, 0, 0.5);
    this.rod = new THREE.Mesh(rodGeo, m.chrome);
    this.eye = mesh(new THREE.SphereGeometry(radius * 1.1, 8, 6), m.steel);
    this.group.add(this.rod, this.eye);
  }

  update() {
    this.anchorA.localToWorld(this.a.copy(this.localA));
    this.anchorB.localToWorld(this.b.copy(this.localB));
    this.group.position.copy(this.group.parent!.worldToLocal(this.a.clone()));
    this.group.lookAt(this.b);
    const d = this.a.distanceTo(this.b);
    const rodLength = Math.max(0.04, d - this.sleeve * 0.9);
    this.rod.scale.set(1, 1, rodLength);
    this.rod.position.z = d - rodLength;
    this.eye.position.z = d;
  }
}

/* ------------------------------------------------------------------ */
/* Mechanical controller                                               */
/* ------------------------------------------------------------------ */

const RAMP_OPEN = -0.7;
const DOOR_OPEN = 1.45;
const MAX_PROP_SPEED = 34;

class GunshipRig implements VehicleController {
  readonly dynamicObjects: THREE.Object3D[];
  private throttle = 0.65;
  private rpm = 0.65;
  private doorTarget = 0;
  private doorT = 0;
  private firing = false;
  private readonly aimLocal = V(5.5, 0, 0.6);
  private readonly world = V();

  constructor(
    private readonly root: THREE.Group,
    private readonly props: THREE.Group[],
    private readonly ramp: THREE.Group,
    private readonly door: THREE.Group,
    private readonly pistons: Piston[],
    private readonly mounts: GunMount[],
    private readonly sensor: { yaw: THREE.Group; pitch: THREE.Group },
    private readonly m: Mats,
  ) {
    this.dynamicObjects = [
      ramp,
      door,
      ...props,
      ...pistons.flatMap((p) => [p.group, p.rod]),
      ...mounts.flatMap((g) => [g.pan, g.tilt, g.recoil, g.feed, ...(g.spin ? [g.spin] : [])]),
      sensor.yaw,
      sensor.pitch,
    ];
  }

  setThrottle(value: number) {
    this.throttle = clamp(value, 0, 1);
  }
  setDoorsOpen(open: boolean) {
    this.doorTarget = open ? 1 : 0;
  }
  setFiring(firing: boolean) {
    if (firing && !this.firing) for (const g of this.mounts) g.timer = g.kind === "howitzer" ? 0.25 : 0;
    this.firing = firing;
  }
  aimTurrets(target: THREE.Vector3) {
    this.root.updateMatrixWorld(true);
    this.aimLocal.copy(this.root.worldToLocal(target.clone()));
  }

  private aim(pan: THREE.Group, tilt: THREE.Group, yawLimits: [number, number], pitchLimits: [number, number], dt: number) {
    const d = pan.parent!.worldToLocal(this.world.clone()).sub(pan.position);
    const yaw = clamp(Math.atan2(d.x, d.z), ...yawLimits);
    const pitch = clamp(Math.atan2(-d.y, Math.hypot(d.x, d.z)), ...pitchLimits);
    pan.rotation.y = damp(pan.rotation.y, yaw, 5, dt);
    tilt.rotation.x = damp(tilt.rotation.x, pitch, 5, dt);
  }

  update(delta: number) {
    const dt = Math.min(delta, 0.1);
    this.root.updateMatrixWorld(true);
    this.root.localToWorld(this.world.copy(this.aimLocal));

    // Propellers: RPM inertia, slight gyroscopic tilt while spooling, blur disc.
    const lag = this.throttle - this.rpm;
    this.rpm = damp(this.rpm, this.throttle, lag > 0 ? 0.9 : 0.5, dt);
    for (const rotor of this.props) {
      rotor.rotation.z += this.rpm * MAX_PROP_SPEED * dt;
      rotor.rotation.x = damp(rotor.rotation.x, lag * 0.12, 3, dt);
    }
    this.m.blur.opacity = THREE.MathUtils.smoothstep(this.rpm, 0.45, 0.95) * 0.34;
    this.m.exhaust.emissiveIntensity = this.rpm * 0.9;

    // Ramp and paratroop door: eased interpolation, pistons follow the anchors.
    this.doorT = approach(this.doorT, this.doorTarget, dt * 0.42);
    this.ramp.rotation.x = RAMP_OPEN * ease(this.doorT);
    this.door.rotation.y = DOOR_OPEN * ease(clamp(this.doorT * 1.5, 0, 1));
    this.root.updateMatrixWorld(true);
    for (const p of this.pistons) p.update();

    // Turrets and sensor follow the shared target.
    for (const g of this.mounts) this.aim(g.pan, g.tilt, [Math.PI / 2 - 0.32, Math.PI / 2 + 0.32], [-0.08, 0.5], dt);
    this.aim(this.sensor.yaw, this.sensor.pitch, [0.2, 2.9], [-0.2, 1.3], dt);

    for (const g of this.mounts) {
      if (g.kind === "rotary") {
        g.spinRate = damp(g.spinRate, this.firing ? 42 : 0, this.firing ? 4 : 1.4, dt);
        g.spin!.rotation.z += g.spinRate * dt;
        if (this.firing && g.spinRate > 28) {
          g.timer -= dt;
          while (g.timer <= 0) {
            g.timer += 0.06;
            g.recoilOffset = Math.min(0.03, g.recoilOffset + 0.012);
            g.flashLevel = 1;
          }
        }
        g.recoilOffset = damp(g.recoilOffset, 0, 18, dt);
      } else {
        if (this.firing) {
          g.timer -= dt;
          if (g.timer <= 0) {
            g.timer = 2.2;
            g.recoilOffset = 0.16;
            g.flashLevel = 1;
          }
        }
        g.recoilOffset = damp(g.recoilOffset, 0, 3, dt); // slow counter-recoil
      }
      g.recoil.position.z = -g.recoilOffset;
      g.flashLevel = Math.max(0, g.flashLevel - dt * (g.kind === "rotary" ? 16 : 7));
      g.flashMaterial.opacity = g.flashLevel * 0.9;
      g.flash.scale.setScalar(0.5 + g.flashLevel * (0.6 + Math.random() * 0.3));
    }
  }
}

/* ------------------------------------------------------------------ */
/* Assembly                                                            */
/* ------------------------------------------------------------------ */

export function buildAC130Gunship(): BuiltModelResult {
  const m = materials();
  const root = new THREE.Group();
  root.name = "AC-130J Ghostrider";
  const airframe = new THREE.Group();
  const cannonGroup = new THREE.Group();
  const magazineGroup = new THREE.Group();
  const thrustersGroup = new THREE.Group();
  const sightGroup = new THREE.Group();
  const mechanismsGroup = new THREE.Group();
  const animatedParts: AnimatedPart[] = [];

  /* Hull with real openings, lined inside (BackSide) so cut edges read as cabin. */
  const hullGeo = hullGeometry();
  const hull = new THREE.Mesh(hullGeo, m.paint);
  hull.name = "Hull skin";
  const lining = new THREE.Mesh(hullGeo, m.lining);
  lining.name = "Cabin lining";
  airframe.add(hull, lining);

  /* Windscreen: glass sampled on the hull inside the cut; frames on the boundary. */
  const windAngle = (z: number) => angleWhere(z, 0, Math.PI, (p) => windLow(z) - p.y);
  const windAt = (u: number, f: number) => {
    const z = lerp(WIND.z0, WIND.z1, u);
    return hullAt(z, f * windAngle(z));
  };
  const windscreen = new THREE.Mesh(parametricPatch((u, v) => windAt(u, v * 2 - 1), 12, 18), m.glass);
  windscreen.renderOrder = 3;
  airframe.add(windscreen);
  for (const f of [-1, -0.66, -0.33, 0, 0.33, 0.66, 1])
    airframe.add(tube(line(10, (t) => windAt(t, f)), Math.abs(f) === 1 ? 0.022 : 0.015, m.trim));
  for (const u of [0, 0.5, 1]) airframe.add(tube(line(20, (t) => windAt(u, t * 2 - 1)), u === 0.5 ? 0.014 : 0.022, m.trim));

  for (const s of [-1, 1]) {
    const glass = new THREE.Mesh(
      parametricPatch((u, v) => sidePoint(lerp(SIDE_WINDOW.z0, SIDE_WINDOW.z1, u), lerp(SIDE_WINDOW.y0, SIDE_WINDOW.y1, v), s), 4, 4),
      m.glass,
    );
    glass.renderOrder = 3;
    airframe.add(glass, openingTrim(sideLoop(s, SIDE_WINDOW), m, 0.05, 0.015));
  }
  airframe.add(openingTrim(sideLoop(1, PORTS.rotary), m), openingTrim(sideLoop(1, PORTS.howitzer), m));
  airframe.add(openingTrim(sideLoop(-1, DOOR), m, 0.06, 0.02));

  /* Interior: floors, bulkhead with doorway, ribs, lamps and lights. */
  airframe.add(mesh(new THREE.BoxGeometry(0.98, 0.03, 3.36), m.deck, 0, FLOOR_Y - 0.015, 0.125));
  for (const x of [-0.3, 0.3]) airframe.add(mesh(new THREE.BoxGeometry(0.03, 0.012, 3.3), m.steel, x, FLOOR_Y + 0.006, 0.12));
  airframe.add(mesh(new THREE.BoxGeometry(1.04, 0.04, 0.96), m.deck, 0, 0.98, 2.3));
  const bulkhead = new THREE.Shape();
  for (let i = 0; i <= 40; i++) {
    const p = hullAt(1.82, (i / 40) * TAU);
    const y = Math.max(FLOOR_Y, centerY(1.82) + (p.y - centerY(1.82)) * 0.97);
    if (i === 0) bulkhead.moveTo(p.x * 0.97, y);
    else bulkhead.lineTo(p.x * 0.97, y);
  }
  const doorway = new THREE.Path();
  doorway.moveTo(-0.2, 0.64);
  doorway.lineTo(0.2, 0.64);
  doorway.lineTo(0.2, 1.46);
  doorway.lineTo(-0.2, 1.46);
  doorway.closePath();
  bulkhead.holes.push(doorway);
  airframe.add(mesh(new THREE.ShapeGeometry(bulkhead, 6), m.interiorDouble, 0, 0, 1.82));
  for (const z of [-1.5, -0.3, 0.25, 0.75, 1.6]) {
    const a = angleWhere(z, 0, Math.PI, (p) => FLOOR_Y + 0.02 - p.y);
    const c = centerY(z);
    airframe.add(
      tube(
        line(18, (t) => {
          const p = hullAt(z, lerp(-a, a, t));
          return p.add(V(-p.x, c - p.y, 0).normalize().multiplyScalar(0.03));
        }),
        0.016,
        m.interior,
      ),
    );
  }
  for (const z of [-1.0, 0.4]) airframe.add(mesh(rounded(0.16, 0.025, 0.08, 0.008), m.lamp, 0, 1.9, z));
  const cargoLight = new THREE.PointLight(0xffc98f, 2.4, 3.2, 2);
  cargoLight.position.set(0, 1.72, -0.2);
  const cockpitLight = new THREE.PointLight(0x9fd6ff, 0.7, 1.3, 2);
  cockpitLight.position.set(0, 1.5, 2.35);
  airframe.add(cargoLight, cockpitLight);

  /* Flight deck: seats, crew, yokes, pedestal, panel with emissive displays. */
  for (const x of [-0.27, 0.27]) {
    const s = seat(m);
    s.position.set(x, 1.14, 2.42);
    const pilot = crewFigure(m, true);
    pilot.position.set(x, 1.14, 2.42);
    airframe.add(s, pilot);
    airframe.add(tube([V(x, 1.0, 2.6), V(x, 1.18, 2.58), V(x, 1.27, 2.55)], 0.012, m.black));
    airframe.add(mesh(new THREE.TorusGeometry(0.05, 0.01, 6, 14, Math.PI), m.black, x, 1.28, 2.55));
  }
  airframe.add(mesh(rounded(0.18, 0.16, 0.42), m.black, 0, 1.08, 2.42));
  for (let i = 0; i < 4; i++) {
    const lever = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 6), m.chrome, -0.045 + i * 0.03, 1.19, 2.47);
    lever.rotation.x = 0.4;
    airframe.add(lever, mesh(new THREE.SphereGeometry(0.012, 8, 6), m.black, -0.045 + i * 0.03, 1.225, 2.485));
  }
  const panel = mesh(rounded(0.9, 0.16, 0.06, 0.02), m.black, 0, 1.2, 2.68);
  panel.rotation.x = -0.25;
  const displays = mesh(new THREE.PlaneGeometry(0.84, 0.12), m.screen, 0, 0, 0.031);
  panel.add(displays);
  airframe.add(panel, mesh(rounded(0.5, 0.04, 0.3, 0.01), m.black, 0, 1.74, 2.18));
  for (const x of [-0.27, 0.27]) {
    const hud = mesh(new THREE.PlaneGeometry(0.11, 0.08), m.hud, x, 1.34, 2.64);
    hud.rotation.x = -0.3;
    sightGroup.add(hud, mesh(rounded(0.1, 0.03, 0.06, 0.008), m.black, x, 1.29, 2.66));
  }

  /* Gun stations: floor-anchored mounts, gunners and ready racks. */
  const rotary = gunMount("rotary", PORTS.rotary.z, m);
  const howitzer = gunMount("howitzer", PORTS.howitzer.z, m);
  for (const g of [rotary, howitzer]) cannonGroup.add(g.base, g.state.pan);
  const gunner = crewFigure(m, false);
  gunner.position.set(0.1, FLOOR_Y, PORTS.rotary.z - 0.1);
  gunner.rotation.y = Math.PI / 2;
  const loader = crewFigure(m, false);
  loader.position.set(0.05, FLOOR_Y, PORTS.howitzer.z + 0.32);
  loader.rotation.y = 2.1;
  airframe.add(gunner, loader);
  for (let i = 0; i < 3; i++) magazineGroup.add(mesh(rounded(0.16, 0.1, 0.11, 0.012), m.ordnance, 0.28, FLOOR_Y + 0.05 + i * 0.105, 1.66));
  magazineGroup.add(mesh(rounded(0.3, 0.02, 0.2, 0.006), m.steel, 0.3, FLOOR_Y + 0.38, -0.32));
  for (let i = 0; i < 6; i++) {
    const shell = new THREE.Group();
    shell.add(mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.24, 10), m.brass, 0, 0.12, 0));
    shell.add(mesh(new THREE.ConeGeometry(0.026, 0.08, 10), m.ordnance, 0, 0.28, 0));
    shell.position.set(0.2 + (i % 3) * 0.07, FLOOR_Y, -0.36 + Math.floor(i / 3) * 0.08);
    magazineGroup.add(shell);
  }

  /* Wings blended into the hull shoulder, flaps, tanks, pylons, missiles. */
  const wingY = FUS_Y + 0.78;
  const props: THREE.Group[] = [];
  for (const side of [1, -1] as const) {
    airframe.add(
      mesh(
        createWingGeometry({ span: 0.72, rootChord: 2.48, tipChord: 1.45, side, rootThickness: 0.48, tipThickness: 0.2, dihedralY: 0.07, sweepZ: 0, camber: 0.025 }),
        m.paint,
        0,
        FUS_Y + 0.71,
        0.32,
      ),
      mesh(
        createWingGeometry({ span: 3.72, rootChord: 1.45, tipChord: 0.74, sweepZ: -0.24, dihedralY: -0.1, rootThickness: 0.2, tipThickness: 0.08, camber: 0.025, side }),
        m.paint,
        side * 0.72,
        wingY,
        0.32,
      ),
    );
    const flap = mesh(createWingGeometry({ span: 2.1, rootChord: 0.39, tipChord: 0.25, sweepZ: -0.06, side, rootThickness: 0.045, tipThickness: 0.022 }), m.trim, side * 0.8, FUS_Y + 0.725, -0.32);
    flap.rotation.x = 0.1;
    mechanismsGroup.add(flap);
    const tank = new THREE.Mesh(
      createLoftedFuselage([-0.5, -0.3, 0.2, 0.5].map((z, i) => ({ z: z * 1.52, halfWidth: [0.03, 0.15, 0.155, 0.03][i], topHeight: [0.03, 0.16, 0.165, 0.03][i], bottomHeight: [0.03, 0.16, 0.165, 0.03][i] })), 18),
      m.paint,
    );
    tank.position.set(side * 2.32, FUS_Y + 0.45, 0.35);
    const pylon = mesh(rounded(0.06, 0.36, 0.5, 0.025), m.paint, side * 2.32, FUS_Y + 0.62, 0.32);
    airframe.add(tank, pylon);
    airframe.add(mesh(new THREE.SphereGeometry(0.035, 10, 6), side > 0 ? m.navRed : m.navGreen, side * 4.42, wingY - 0.37, 0.13));
    const missile = new THREE.Group();
    missile.add(zCylinder(0.05, 0.05, 0.85, m.ordnance, 12), mesh(new THREE.SphereGeometry(0.05, 10, 8), m.yellow, 0, 0, 0.85));
    for (const r of [0, Math.PI / 2]) {
      const fin = mesh(new THREE.BoxGeometry(0.2, 0.008, 0.12), m.steel, 0, 0, 0.08);
      fin.rotation.z = r;
      missile.add(fin);
    }
    missile.position.set(side * 3.55, FUS_Y + 0.44, -0.2);
    cannonGroup.add(missile, mesh(rounded(0.05, 0.12, 0.4, 0.02), m.paint, side * 3.55, FUS_Y + 0.55, 0.22));

    // Four turboprops; prop pivots keep their original local transform (z = L * 0.56).
    [1.62, 3.02].forEach((ex, idx) => {
      const tp = turboprop(m);
      tp.group.position.set(side * ex, FUS_Y + 0.66 - idx * 0.04, 0.86 - idx * 0.08);
      thrustersGroup.add(tp.group);
      props.push(tp.propRotor);
      animatedParts.push({ object: tp.propRotor, axis: "z", speed: 19, mode: "spin" });
    });

    airframe.add(
      mesh(createWingGeometry({ span: 1.65, rootChord: 1.02, tipChord: 0.55, sweepZ: -0.22, rootThickness: 0.1, tipThickness: 0.05, camber: 0, side }), m.paint, side * 0.28, FUS_Y + 0.46, -3.28),
    );
  }

  /* Tail: fin and a blended dorsal fillet. */
  const fin = mesh(createWingGeometry({ span: 1.98, rootChord: 1.68, tipChord: 0.72, sweepZ: -0.68, rootThickness: 0.14, tipThickness: 0.06, camber: 0, side: 1 }), m.paint, 0, FUS_Y + 0.48, -3.02);
  fin.rotation.z = Math.PI / 2;
  airframe.add(fin);
  airframe.add(
    new THREE.Mesh(
      createLoftedFuselage(
        [
          { z: -3.65, halfWidth: 0.055, topHeight: 0.71, bottomHeight: 0.13, yCenter: 1.75 },
          { z: -2.92, halfWidth: 0.14, topHeight: 0.76, bottomHeight: 0.21, yCenter: 1.76 },
          { z: -2.46, halfWidth: 0.167, topHeight: 0.5, bottomHeight: 0.19, yCenter: 1.78 },
          { z: -1.86, halfWidth: 0.15, topHeight: 0.2, bottomHeight: 0.18, yCenter: 1.84 },
          { z: -1.28, halfWidth: 0.06, topHeight: 0.04, bottomHeight: 0.12, yCenter: 1.91 },
        ],
        24,
      ),
      m.paint,
    ),
  );
  for (const z of [1.3, -0.8]) {
    const antenna = mesh(createWingGeometry({ span: 0.14, side: 1, rootChord: 0.11, tipChord: 0.04, sweepZ: -0.04, rootThickness: 0.02, tipThickness: 0.008 }), m.trim, 0, hullAt(z, 0).y - 0.01, z);
    antenna.rotation.z = Math.PI / 2;
    airframe.add(antenna);
  }

  /* Sponsons fair the main gear into the lower hull. */
  for (const s of [-1, 1]) {
    const sponson = new THREE.Mesh(
      createLoftedFuselage(
        [
          // Low fairing: its crown stays below the gun-port sills (y = 0.80).
          { z: -1.15, halfWidth: 0.06, topHeight: 0.07, bottomHeight: 0.07 },
          { z: -0.6, halfWidth: 0.22, topHeight: 0.17, bottomHeight: 0.19, squareness: 0.4 },
          { z: 0.65, halfWidth: 0.22, topHeight: 0.17, bottomHeight: 0.19, squareness: 0.4 },
          { z: 1.3, halfWidth: 0.05, topHeight: 0.06, bottomHeight: 0.06 },
        ],
        18,
      ),
      m.paint,
    );
    sponson.position.set(s * 0.74, 0.5, 0.05);
    airframe.add(sponson);
    for (const z of [-0.25, 0.28]) mechanismsGroup.add(landingGear(m, V(s * 0.9, 0.5, z), 0.19));
  }
  mechanismsGroup.add(landingGear(m, V(0, 0.6, 2.45), 0.14));

  /* EO/IR sensor: faired base, gimballed ball that tracks the target. */
  airframe.add(mesh(new THREE.SphereGeometry(0.09, 14, 8, 0, TAU, 0, Math.PI / 2).scale(1, 0.7, 1.4), m.paint, 0.4, 0.52, 1.95).rotateX(Math.PI));
  const sensorYaw = new THREE.Group();
  sensorYaw.position.set(0.4, 0.43, 1.95);
  const sensorPitch = new THREE.Group();
  sensorYaw.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.06, 10), m.steel, 0, 0.04, 0), sensorPitch);
  sensorPitch.add(mesh(new THREE.SphereGeometry(0.075, 16, 12), m.trim));
  const lens = zCylinder(0.032, 0.032, 0.02, m.lens, 14);
  lens.position.z = 0.066;
  sensorPitch.add(lens, mesh(new THREE.SphereGeometry(0.018, 8, 6), m.lens, 0.04, -0.02, 0.06));
  sightGroup.add(sensorYaw);

  /* Ramp: hinged at its forward lower edge, sampled from the hull it replaces. */
  const rampEdge = (z: number) =>
    angleWhere(z, Math.PI, Math.PI / 2, (p) => Math.max(Math.abs(p.x) - RAMP.halfWidth, p.y - rampTop(z)));
  const rampAt = (u: number, v: number) => {
    const z = lerp(RAMP.z0, RAMP.z1, u);
    const a = rampEdge(z);
    return hullAt(z, lerp(a, TAU - a, v));
  };
  const rampHinge = hullAt(RAMP.z0, Math.PI);
  const ramp = new THREE.Group();
  ramp.position.copy(rampHinge);
  const rampGeo = orientOutward(parametricPatch(rampAt, 14, 10)).translate(-rampHinge.x, -rampHinge.y, -rampHinge.z);
  ramp.add(new THREE.Mesh(rampGeo, m.paint), new THREE.Mesh(rampGeo, m.lining));
  const rampLoop = [
    ...line(10, (t) => rampAt(t, 0)),
    ...line(10, (t) => rampAt(1, t)),
    ...line(10, (t) => rampAt(1 - t, 1)),
    ...line(10, (t) => rampAt(0, 1 - t)),
  ];
  ramp.add(tube(rampLoop.map((p) => p.clone().sub(rampHinge)), 0.012, m.trim, true));
  mechanismsGroup.add(tube(rampLoop, 0.02, m.trim, true), ramp);
  for (let i = 0; i < 6; i++) {
    const knuckle = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.08, 10), m.steel, -0.45 + i * 0.18, rampHinge.y + 0.01, RAMP.z0);
    knuckle.rotation.z = Math.PI / 2;
    mechanismsGroup.add(knuckle);
  }

  /* Paratroop door: vertical hinge on its forward edge, swings outboard. */
  const doorHinge = sidePoint(DOOR.z1, (DOOR.y0 + DOOR.y1) / 2, -1);
  const door = new THREE.Group();
  door.position.copy(doorHinge);
  const doorAt = (u: number, v: number) => sidePoint(lerp(DOOR.z1, DOOR.z0, u), lerp(DOOR.y0, DOOR.y1, v), -1);
  const doorGeo = orientOutward(parametricPatch(doorAt, 6, 8)).translate(-doorHinge.x, -doorHinge.y, -doorHinge.z);
  door.add(new THREE.Mesh(doorGeo, m.paint), new THREE.Mesh(doorGeo, m.lining));
  door.add(tube(sideLoop(-1, DOOR).map((p) => p.clone().sub(doorHinge)), 0.012, m.trim, true));
  door.add(mesh(rounded(0.02, 0.025, 0.09, 0.006), m.steel, -0.02, 0.05, -0.38));
  mechanismsGroup.add(door);
  for (const y of [DOOR.y0 + 0.1, (DOOR.y0 + DOOR.y1) / 2, DOOR.y1 - 0.1])
    mechanismsGroup.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.07, 8), m.steel, sidePoint(DOOR.z1, y, -1).x - 0.01, y, DOOR.z1));

  /* Hydraulic actuators. */
  const rampPoint = (z: number, x: number) => hullAt(z, angleWhere(z, Math.PI, Math.PI / 2, (p) => p.x - x));
  const pistons: Piston[] = [];
  for (const x of [-0.5, 0.5]) {
    const b = rampPoint(-2.35, Math.abs(x)).setX(x).add(V(0, 0.05, 0)).sub(rampHinge);
    const a = V(x, 1.18, -1.72);
    const p = new Piston(mechanismsGroup, a, ramp, b, a.distanceTo(b.clone().add(rampHinge)), 0.022, m);
    mechanismsGroup.add(p.group);
    pistons.push(p);
  }
  {
    const b = sidePoint(-1.15, 1.35, -1).add(V(0.05, 0, 0)).sub(doorHinge);
    const a = V(-0.62, 1.42, -0.8);
    const p = new Piston(mechanismsGroup, a, door, b, a.distanceTo(b.clone().add(doorHinge)), 0.012, m);
    mechanismsGroup.add(p.group);
    pistons.push(p);
  }

  root.add(
    tagPart(airframe, "airframe"),
    tagPart(cannonGroup, "cannon"),
    tagPart(magazineGroup, "magazine"),
    tagPart(thrustersGroup, "thrusters"),
    tagPart(sightGroup, "sight"),
    tagPart(mechanismsGroup, "mechanisms"),
  );
  // Gun-mounted drums ride on the tilt pivots but belong to the magazine system.
  for (const g of [rotary, howitzer]) tagPart(g.state.feed, "magazine");

  const controller = new GunshipRig(root, props, ramp, door, pistons, [rotary.state, howitzer.state], { yaw: sensorYaw, pitch: sensorPitch }, m);
  root.updateMatrixWorld(true);
  for (const p of pistons) p.update();

  const stats = computeGeometryStats(root);
  return { group: root, animatedParts, controller, ...stats };
}
