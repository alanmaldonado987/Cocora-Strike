// Modelos 3D/avionesShared.js
// Núcleo compartido de geometría aerodinámica (lofting Hermite monótono, perfiles NACA, recortes reales
// sin Z-fighting, pistones hidráulicos telescópicos, aspas torsionadas con puntas amarillas y discos motion-blur)
// y biblioteca PBR procedural (<canvas> con respaldo DataTexture para Node) adaptado desde "Modelos 3D/Aviones v1".

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const TAU = Math.PI * 2;

const _sharedGeometries = new Set();
const _sharedMaterials = new Set();
const _textureCache = new Map();

export function registerSharedAircraftGeo(geo) {
  if (geo) _sharedGeometries.add(geo);
  return geo;
}

export function registerSharedAircraftMat(mat) {
  if (mat) _sharedMaterials.add(mat);
  return mat;
}

export function isSharedAircraftGeometry(geo) {
  return _sharedGeometries.has(geo);
}

export function isSharedAircraftMaterial(mat) {
  return _sharedMaterials.has(mat);
}

export function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const lerp = THREE.MathUtils.lerp;
export const clamp = THREE.MathUtils.clamp;
export const easeInOutCubic = (t) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
export const dampValue = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const approachValue = (a, b, step) => (a < b ? Math.min(b, a + step) : Math.max(b, a - step));

function makeProceduralTexture(key, w, h, drawFn, isSRGB = true, repeat = [1, 1]) {
  if (_textureCache.has(key)) return _textureCache.get(key);

  let tex;
  if (typeof document === 'undefined') {
    const data = new Uint8Array(16 * 4);
    for (let i = 0; i < 16; i++) {
      data[i * 4] = 158;
      data[i * 4 + 1] = 162;
      data[i * 4 + 2] = 160;
      data[i * 4 + 3] = 255;
    }
    tex = new THREE.DataTexture(data, 4, 4, THREE.RGBAFormat);
    tex.needsUpdate = true;
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    drawFn(ctx, w, h);
    tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
  }

  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  if (isSRGB) tex.colorSpace = THREE.SRGBColorSpace;
  _textureCache.set(key, tex);
  return tex;
}

/**
 * Texturas procedurales en <canvas> con líneas de panelado, remaches sutiles, desgaste en bordes,
 * hollín/impacto, piso antideslizante, banda de neumáticos, disco de rotor y pantallas MFD.
 */
function buildSkinPanelSet(prefix, baseRgb, wearRgb, seedBase, repeat = [2.4, 1.6], scorched = false) {
  const drawMode = (mode) =>
    makeProceduralTexture(
      `${prefix}_${mode}`,
      512,
      512,
      (c, W, H) => {
        const r = seededRng(seedBase);
        const base =
          mode === 'albedo'
            ? baseRgb
            : mode === 'rough'
            ? [168, 168, 168]
            : [128, 128, 128];
        const shade = (k) =>
          `rgb(${base.map((v) => clamp(Math.round(v + k), 0, 255)).join(',')})`;

        c.fillStyle = shade(0);
        c.fillRect(0, 0, W, H);

        // Variación tonal por placas de aluminio aeronáutico
        for (let x = 0; x < W; x += 128) {
          for (let y = 0; y < H; y += 128) {
            const delta = mode === 'bump' ? 0 : (r() - 0.5) * (mode === 'rough' ? 28 : 12);
            c.fillStyle = shade(delta);
            c.fillRect(x + 1, y + 1, 126, 126);
          }
        }

        // Estelas aerodinámicas de aceite/lluvia
        if (mode !== 'bump') {
          for (let i = 0; i < 210; i++) {
            c.fillStyle =
              mode === 'albedo'
                ? `rgba(38, 42, 44, ${r() * 0.08})`
                : `rgba(232, 232, 232, ${r() * 0.14})`;
            c.fillRect(r() * W, r() * H, 2 + r() * 5, 18 + r() * 84);
          }
        }

        // Juntas de panelado grabadas + desgaste metálico sutil en bordes
        c.lineWidth = 2;
        for (let x = 0; x <= W; x += 128) {
          c.strokeStyle = mode === 'albedo' ? '#3d4347' : mode === 'rough' ? '#dedede' : '#363636';
          c.beginPath();
          c.moveTo(x, 0);
          c.lineTo(x, H);
          c.stroke();

          if (mode === 'albedo') {
            c.strokeStyle = `rgba(${wearRgb[0]}, ${wearRgb[1]}, ${wearRgb[2]}, 0.34)`;
            c.lineWidth = 1;
            c.beginPath();
            c.moveTo(x + 2, 0);
            c.lineTo(x + 2, H);
            c.stroke();
            c.lineWidth = 2;
          }
        }

        for (let y = 0; y <= H; y += 128) {
          c.strokeStyle = mode === 'albedo' ? '#3d4347' : mode === 'rough' ? '#dedede' : '#363636';
          c.beginPath();
          c.moveTo(0, y);
          c.lineTo(W, y);
          c.stroke();

          if (mode === 'albedo') {
            c.strokeStyle = `rgba(${wearRgb[0]}, ${wearRgb[1]}, ${wearRgb[2]}, 0.30)`;
            c.lineWidth = 1;
            c.beginPath();
            c.moveTo(0, y + 2);
            c.lineTo(W, y + 2);
            c.stroke();
            c.lineWidth = 2;
          }
        }

        // Registros de inspección y compuertas remachadas
        c.lineWidth = 1.4;
        c.strokeStyle = mode === 'albedo' ? '#4a5156' : '#505050';
        for (let i = 0; i < 8; i++) {
          const rx = Math.floor(r() * 4) * 128 + 20;
          const ry = Math.floor(r() * 4) * 128 + 24;
          c.strokeRect(rx, ry, 48 + r() * 34, 30 + r() * 24);
        }

        // Hileras de remaches sutiles a ambos lados de las costuras
        c.fillStyle = mode === 'albedo' ? `rgba(${wearRgb[0]}, ${wearRgb[1]}, ${wearRgb[2]}, 0.55)` : mode === 'rough' ? '#8c8c8c' : '#ababab';
        for (let x = 0; x < W; x += 128) {
          for (let y = 8; y < H; y += 14) {
            c.fillRect(x + 5, y, 2, 2);
            c.fillRect(x + 121, y, 2, 2);
          }
        }
        for (let y = 0; y < H; y += 128) {
          for (let x = 8; x < W; x += 14) {
            c.fillRect(x, y + 5, 2, 2);
          }
        }

        // Hollín y quemaduras intensas para el AH-64D siniestrado
        if (scorched && mode === 'albedo') {
          for (let s = 0; s < 7; s++) {
            const cx = r() * W;
            const cy = r() * H;
            const rad = 55 + r() * 115;
            const grd = c.createRadialGradient(cx, cy, 6, cx, cy, rad);
            grd.addColorStop(0, 'rgba(12, 11, 10, 0.88)');
            grd.addColorStop(0.55, 'rgba(34, 26, 20, 0.48)');
            grd.addColorStop(1, 'rgba(20, 18, 16, 0)');
            c.fillStyle = grd;
            c.fillRect(0, 0, W, H);
          }
          // Rasguños de aluminio expuesto por impacto
          c.strokeStyle = 'rgba(188, 196, 204, 0.48)';
          c.lineWidth = 1.6;
          for (let k = 0; k < 26; k++) {
            const sx = r() * W;
            const sy = r() * H;
            c.beginPath();
            c.moveTo(sx, sy);
            c.lineTo(sx + (r() - 0.3) * 44, sy + (r() - 0.5) * 18);
            c.stroke();
          }
        }
      },
      mode === 'albedo',
      repeat
    );

  return {
    albedo: drawMode('albedo'),
    rough: drawMode('rough'),
    bump: drawMode('bump')
  };
}

function buildDeckDiamondTexture() {
  return makeProceduralTexture(
    'aircraft_nonslip_deck',
    256,
    256,
    (c, W, H) => {
      c.fillStyle = '#2d3338';
      c.fillRect(0, 0, W, H);
      c.strokeStyle = '#475057';
      c.lineWidth = 2;
      for (let y = 0; y < H; y += 16) {
        for (let x = 0; x < W; x += 16) {
          c.beginPath();
          c.moveTo(x + 4, y + 4);
          c.lineTo(x + 12, y + 12);
          c.moveTo(x + 12, y + 4);
          c.lineTo(x + 4, y + 12);
          c.stroke();
        }
      }
      // Carriles guía longitudinales
      c.fillStyle = '#202529';
      c.fillRect(36, 0, 8, H);
      c.fillRect(W - 44, 0, 8, H);
    },
    true,
    [4, 10]
  );
}

function buildTireTreadBump() {
  return makeProceduralTexture(
    'aircraft_tire_tread',
    128,
    128,
    (c, W, H) => {
      c.fillStyle = '#707070';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#dcdcdc';
      for (let x = 6; x < W; x += 16) {
        c.fillRect(x, 0, 9, H);
      }
      c.strokeStyle = '#303030';
      c.lineWidth = 2;
      for (let y = 0; y < H; y += 12) {
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(W, y + 4);
        c.stroke();
      }
    },
    false,
    [6, 1]
  );
}

function buildCockpitScreenTexture(damaged = false) {
  return makeProceduralTexture(
    damaged ? 'aircraft_mfd_damaged' : 'aircraft_mfd_clean',
    256,
    128,
    (c, W, H) => {
      c.fillStyle = '#151b1e';
      c.fillRect(0, 0, W, H);
      for (let i = 0; i < 4; i++) {
        const x = 8 + i * 62;
        c.fillStyle = '#061012';
        c.fillRect(x, 12, 52, 62);
        c.strokeStyle = damaged && i === 1 ? '#ef4444' : i % 2 ? '#f59e0b' : '#34d399';
        c.lineWidth = 2;
        c.beginPath();
        for (let j = 0; j < 15; j++) {
          const px = x + 4 + j * 3.1;
          const py = 44 + Math.sin(j * 0.65 + i) * 11;
          if (j === 0) c.moveTo(px, py);
          else c.lineTo(px, py);
        }
        c.stroke();
        // Horizonte artificial / barras
        c.fillStyle = damaged ? '#fb923c' : '#6ee7b7';
        c.fillRect(x + 5, 18, 42, 2);
      }
      for (let j = 0; j < 14; j++) {
        c.fillStyle = j % 4 === 0 ? '#facc15' : '#64748b';
        c.fillRect(10 + j * 17, 90, 9, 10);
      }
    },
    true,
    [1, 1]
  );
}

function buildRotorBlurTexture() {
  return makeProceduralTexture(
    'aircraft_rotor_blur',
    256,
    256,
    (c, W, H) => {
      c.clearRect(0, 0, W, H);
      const cx = W * 0.5;
      const cy = H * 0.5;
      const grd = c.createRadialGradient(cx, cy, W * 0.08, cx, cy, W * 0.49);
      grd.addColorStop(0.0, 'rgba(32, 36, 40, 0.0)');
      grd.addColorStop(0.22, 'rgba(36, 40, 44, 0.42)');
      grd.addColorStop(0.76, 'rgba(36, 40, 44, 0.30)');
      grd.addColorStop(0.90, 'rgba(227, 181, 62, 0.52)'); // anillo sutil de puntas amarillas a altas RPM
      grd.addColorStop(0.98, 'rgba(227, 181, 62, 0.16)');
      grd.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
      c.fillStyle = grd;
      c.beginPath();
      c.arc(cx, cy, W * 0.49, 0, TAU);
      c.fill();
    },
    true,
    [1, 1]
  );
}

export function createTacticalStencilMaterial(text, lightText = true) {
  const key = `stencil_${text}_${lightText ? 'L' : 'D'}`;
  const tex = makeProceduralTexture(
    key,
    512,
    128,
    (c, W, H) => {
      c.clearRect(0, 0, W, H);
      c.fillStyle = lightText ? 'rgba(216, 222, 226, 0.82)' : 'rgba(32, 38, 42, 0.85)';
      c.font = 'bold 54px Segoe UI, Arial, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(text, W * 0.5, H * 0.52, W - 28);
    },
    true,
    [1, 1]
  );
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    roughness: 0.72,
    metalness: 0.1,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  return registerSharedAircraftMat(mat);
}

let _sharedMaterialsLib = null;

export function getAircraftMaterials() {
  if (_sharedMaterialsLib) return _sharedMaterialsLib;

  const ac130Panels = buildSkinPanelSet('ac130', [122, 130, 138], [186, 194, 202], 11, [2.6, 1.7], false);
  const ch47Panels = buildSkinPanelSet('ch47', [82, 95, 74], [156, 168, 148], 37, [2.4, 1.5], false);
  const ah64Panels = buildSkinPanelSet('ah64_wreck', [66, 76, 58], [168, 174, 164], 73, [2.2, 1.5], true);
  const deckTex = buildDeckDiamondTexture();
  const treadTex = buildTireTreadBump();
  const mfdClean = buildCockpitScreenTexture(false);
  const mfdDamaged = buildCockpitScreenTexture(true);
  const blurTex = buildRotorBlurTexture();

  const reg = (m) => registerSharedAircraftMat(m);

  const interiorBase = reg(
    new THREE.MeshStandardMaterial({
      color: 0x4b5358,
      roughness: 0.84,
      metalness: 0.14
    })
  );

  _sharedMaterialsLib = {
    // Fuselajes pintados mate/satinados con panelado, remaches y desgaste
    ac130Paint: reg(
      new THREE.MeshStandardMaterial({
        map: ac130Panels.albedo,
        roughnessMap: ac130Panels.rough,
        bumpMap: ac130Panels.bump,
        bumpScale: 0.022,
        roughness: 0.66,
        metalness: 0.22
      })
    ),
    ac130Trim: reg(
      new THREE.MeshStandardMaterial({
        color: 0x677078,
        roughnessMap: ac130Panels.rough,
        roughness: 0.58,
        metalness: 0.34
      })
    ),
    ch47Paint: reg(
      new THREE.MeshStandardMaterial({
        map: ch47Panels.albedo,
        roughnessMap: ch47Panels.rough,
        bumpMap: ch47Panels.bump,
        bumpScale: 0.022,
        roughness: 0.68,
        metalness: 0.20
      })
    ),
    ch47Trim: reg(
      new THREE.MeshStandardMaterial({
        color: 0x3b4535,
        roughnessMap: ch47Panels.rough,
        roughness: 0.62,
        metalness: 0.28
      })
    ),
    apacheWreckOlive: reg(
      new THREE.MeshStandardMaterial({
        map: ah64Panels.albedo,
        roughnessMap: ah64Panels.rough,
        bumpMap: ah64Panels.bump,
        bumpScale: 0.028,
        roughness: 0.74,
        metalness: 0.24
      })
    ),
    apacheWreckDark: reg(
      new THREE.MeshStandardMaterial({
        map: ah64Panels.albedo,
        color: 0x555c50,
        roughness: 0.78,
        metalness: 0.26
      })
    ),
    scorchedChar: reg(
      new THREE.MeshStandardMaterial({
        color: 0x1c1917,
        roughness: 0.94,
        metalness: 0.08
      })
    ),
    emberGlow: reg(
      new THREE.MeshStandardMaterial({
        color: 0x3b180c,
        emissive: 0xea580c,
        emissiveIntensity: 1.35,
        roughness: 0.82,
        metalness: 0.12
      })
    ),

    // Interiores de cabina y bodega (separados >= 0.025m para Cero Z-Fighting)
    interior: interiorBase,
    liningBack: reg(
      Object.assign(interiorBase.clone(), {
        side: THREE.BackSide
      })
    ),
    interiorDouble: reg(
      Object.assign(interiorBase.clone(), {
        side: THREE.DoubleSide
      })
    ),
    nonSlipDeck: reg(
      new THREE.MeshStandardMaterial({
        map: deckTex,
        bumpMap: deckTex,
        bumpScale: 0.015,
        roughness: 0.86,
        metalness: 0.38
      })
    ),
    troopWebbingRed: reg(
      new THREE.MeshStandardMaterial({
        color: 0x992b2b,
        roughness: 0.85,
        metalness: 0.06
      })
    ),
    cockpitSeatBlack: reg(
      new THREE.MeshStandardMaterial({
        color: 0x1d2228,
        roughness: 0.72,
        metalness: 0.16
      })
    ),
    crewSuit: reg(
      new THREE.MeshStandardMaterial({
        color: 0x4f5b46,
        roughness: 0.88,
        metalness: 0.04
      })
    ),
    crewHelmet: reg(
      new THREE.MeshStandardMaterial({
        color: 0x6b756f,
        roughness: 0.46,
        metalness: 0.18
      })
    ),
    crewVisor: reg(
      new THREE.MeshStandardMaterial({
        color: 0x111820,
        roughness: 0.12,
        metalness: 0.78
      })
    ),

    // Vidrio semitransparente exacto (Directriz Parte B.2: opacity 0.35, roughness 0.1, depthWrite false)
    cockpitGlass: reg(
      new THREE.MeshPhysicalMaterial({
        color: 0x5c9aa3,
        transparent: true,
        opacity: 0.35,
        roughness: 0.1,
        metalness: 0.08,
        clearcoat: 1.0,
        clearcoatRoughness: 0.06,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    ),

    // Metales de armamento, motores, trenes de aterrizaje y caucho
    weaponSteel: reg(
      new THREE.MeshStandardMaterial({
        color: 0x232830,
        roughness: 0.32,
        metalness: 0.88
      })
    ),
    titanium: reg(
      new THREE.MeshStandardMaterial({
        color: 0x7b848e,
        roughness: 0.30,
        metalness: 0.86
      })
    ),
    burntTitanium: reg(
      new THREE.MeshStandardMaterial({
        color: 0x463d39,
        roughness: 0.40,
        metalness: 0.82
      })
    ),
    chrome: reg(
      new THREE.MeshStandardMaterial({
        color: 0xd8e0e8,
        roughness: 0.14,
        metalness: 0.96
      })
    ),
    brass: reg(
      new THREE.MeshStandardMaterial({
        color: 0xc89d3c,
        roughness: 0.28,
        metalness: 0.90
      })
    ),
    ordnanceOlive: reg(
      new THREE.MeshStandardMaterial({
        color: 0x485236,
        roughness: 0.56,
        metalness: 0.28
      })
    ),
    warningYellow: reg(
      new THREE.MeshStandardMaterial({
        color: 0xeab308,
        roughness: 0.44,
        metalness: 0.16
      })
    ),
    tireRubber: reg(
      new THREE.MeshStandardMaterial({
        color: 0x16181b,
        bumpMap: treadTex,
        bumpScale: 0.03,
        roughness: 0.91,
        metalness: 0.04
      })
    ),
    bladeVertexMat: reg(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.42,
        metalness: 0.26
      })
    ),
    rotorBlurTemplate: reg(
      new THREE.MeshBasicMaterial({
        map: blurTex,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    ),

    // Pantallas emisivas, ópticas FLIR, HUD y luces de navegación
    mfdScreen: reg(
      new THREE.MeshStandardMaterial({
        map: mfdClean,
        emissiveMap: mfdClean,
        emissive: 0x86efac,
        emissiveIntensity: 0.62,
        roughness: 0.45
      })
    ),
    mfdDamaged: reg(
      new THREE.MeshStandardMaterial({
        map: mfdDamaged,
        emissiveMap: mfdDamaged,
        emissive: 0xf97316,
        emissiveIntensity: 0.55,
        roughness: 0.55
      })
    ),
    hudGlass: reg(
      new THREE.MeshStandardMaterial({
        color: 0x34d399,
        emissive: 0x10b981,
        emissiveIntensity: 1.35,
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    ),
    opticEmerald: reg(
      new THREE.MeshPhysicalMaterial({
        color: 0x10b981,
        emissive: 0x065f46,
        emissiveIntensity: 0.65,
        roughness: 0.06,
        metalness: 0.38,
        clearcoat: 1.0
      })
    ),
    opticAmber: reg(
      new THREE.MeshPhysicalMaterial({
        color: 0xf59e0b,
        emissive: 0x78350f,
        emissiveIntensity: 0.6,
        roughness: 0.08,
        metalness: 0.4,
        clearcoat: 1.0
      })
    ),
    cabinLamp: reg(
      new THREE.MeshStandardMaterial({
        color: 0xffe4b5,
        emissive: 0xfbbf24,
        emissiveIntensity: 1.45,
        roughness: 0.3
      })
    ),
    navRed: reg(
      new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xdc2626,
        emissiveIntensity: 1.65,
        roughness: 0.2
      })
    ),
    navGreen: reg(
      new THREE.MeshStandardMaterial({
        color: 0x22c55e,
        emissive: 0x16a34a,
        emissiveIntensity: 1.65,
        roughness: 0.2
      })
    ),
    muzzleFlashTemplate: reg(
      new THREE.MeshBasicMaterial({
        color: 0xffd584,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      })
    ),
    fireCoreMat: reg(
      new THREE.MeshBasicMaterial({
        color: 0xfff3b0,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      })
    ),
    fireOuterMat: reg(
      new THREE.MeshBasicMaterial({
        color: 0xf97316,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      })
    )
  };

  return _sharedMaterialsLib;
}

/* ============================================================================
 * CONSTRUCTORES GEOMÉTRICOS ORGÁNICOS Y AERODINÁMICOS ("Aviones v1")
 * ============================================================================ */

const signedPow = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);

export function hullSampler(input) {
  const s = [...input].sort((a, b) => a.z - b.z);
  const keys = ['halfWidth', 'topHeight', 'bottomHeight', 'yCenter', 'squareness', 'chinePinch'];
  const slopes = s.map((_, i) =>
    keys.map((k) => {
      const a = Math.max(0, i - 1);
      const b = Math.min(s.length - 1, i + 1);
      const left = ((s[i][k] ?? 0) - (s[a][k] ?? 0)) / (s[i].z - s[a].z || 1);
      const right = ((s[b][k] ?? 0) - (s[i][k] ?? 0)) / (s[b].z - s[i].z || 1);
      if (a === i) return right;
      if (b === i) return left;
      return left * right <= 0 ? 0 : (2 * left * right) / (left + right);
    })
  );

  return (z, angle) => {
    let i = 0;
    while (i < s.length - 2 && z > s[i + 1].z) i++;
    const a = s[i];
    const b = s[i + 1];
    const dz = b.z - a.z || 1e-6;
    const t = clamp((z - a.z) / dz, 0, 1);
    const t2 = t * t;
    const t3 = t2 * t;
    const vals = keys.map(
      (k, j) =>
        (2 * t3 - 3 * t2 + 1) * (a[k] ?? 0) +
        (t3 - 2 * t2 + t) * dz * slopes[i][j] +
        (-2 * t3 + 3 * t2) * (b[k] ?? 0) +
        (t3 - t2) * dz * slopes[i + 1][j]
    );
    const [w, h, l, center, square, chine] = vals;
    const sn = Math.sin(angle);
    const cs = Math.cos(angle);
    const p = 1 - 0.55 * square;
    return new THREE.Vector3(
      signedPow(sn, p) * w,
      center + signedPow(cs, p) * (cs >= 0 ? h : l) * (1 - chine * Math.pow(Math.abs(sn), 2.2)),
      z
    );
  };
}

export function parametricPatch(sampleFn, nu, nv, texcoordFn = null) {
  const positions = [];
  const uv = [];
  const indices = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const v = j / nv;
      const pt = sampleFn(u, v);
      positions.push(pt.x, pt.y, pt.z);
      const tc = texcoordFn ? texcoordFn(u, v) : [u, v];
      uv.push(tc[0], tc[1]);
      if (i < nu && j < nv) {
        const a = j * (nu + 1) + i;
        const b = a + nu + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export function orientOutward(g, centerYFn) {
  const idx = g.index;
  const pos = g.getAttribute('position');
  const t = Math.floor(idx.count / 6) * 3;
  const a = new THREE.Vector3().fromBufferAttribute(pos, idx.getX(t));
  const b = new THREE.Vector3().fromBufferAttribute(pos, idx.getX(t + 1));
  const c = new THREE.Vector3().fromBufferAttribute(pos, idx.getX(t + 2));
  const n = b.clone().sub(a).cross(c.clone().sub(a));
  const cy = centerYFn ? centerYFn(a.z) : 0;
  if (n.dot(new THREE.Vector3(a.x, a.y - cy, 0)) < 0) {
    const arr = idx.array;
    for (let i = 0; i < arr.length; i += 3) {
      const tmp = arr[i + 1];
      arr[i + 1] = arr[i + 2];
      arr[i + 2] = tmp;
    }
    idx.needsUpdate = true;
    g.computeVertexNormals();
  }
  return g;
}

export function weldSeamNormals(g, nu, nv) {
  const normal = g.getAttribute('normal');
  const n = new THREE.Vector3();
  for (let i = 0; i <= nu; i++) {
    const k = nv * (nu + 1) + i;
    n.set(
      normal.getX(i) + normal.getX(k),
      normal.getY(i) + normal.getY(k),
      normal.getZ(i) + normal.getZ(k)
    ).normalize();
    normal.setXYZ(i, n.x, n.y, n.z);
    normal.setXYZ(k, n.x, n.y, n.z);
  }
  return g;
}

export function clipGeometry(g, keepSignedDistFn) {
  const idx = g.index;
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const uv = g.getAttribute('uv');
  const P = [];
  const N = [];
  const U = [];

  const read = (k) => {
    const p = new THREE.Vector3().fromBufferAttribute(pos, k);
    return {
      p,
      n: new THREE.Vector3().fromBufferAttribute(nor, k),
      u: new THREE.Vector2(uv ? uv.getX(k) : 0, uv ? uv.getY(k) : 0),
      d: keepSignedDistFn(p)
    };
  };

  const mix = (a, b, t) => ({
    p: a.p.clone().lerp(b.p, t),
    n: a.n.clone().lerp(b.n, t).normalize(),
    u: a.u.clone().lerp(b.u, t),
    d: 0
  });

  const count = idx ? idx.count : pos.count;
  for (let i = 0; i < count; i += 3) {
    const i0 = idx ? idx.getX(i) : i;
    const i1 = idx ? idx.getX(i + 1) : i + 1;
    const i2 = idx ? idx.getX(i + 2) : i + 2;
    const tri = [read(i0), read(i1), read(i2)];
    const poly = [];
    for (let j = 0; j < 3; j++) {
      const a = tri[j];
      const b = tri[(j + 1) % 3];
      if (a.d >= 0) poly.push(a);
      if ((a.d >= 0) !== (b.d >= 0)) {
        poly.push(mix(a, b, a.d / (a.d - b.d)));
      }
    }
    for (let j = 1; j < poly.length - 1; j++) {
      for (const v of [poly[0], poly[j], poly[j + 1]]) {
        P.push(v.p.x, v.p.y, v.p.z);
        N.push(v.n.x, v.n.y, v.n.z);
        U.push(v.u.x, v.u.y);
      }
    }
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  return out;
}

export function createLoftedFuselage(stations, segments = 24, capEnds = [true, true]) {
  const s = [...stations].sort((a, b) => a.z - b.z);
  const at = hullSampler(s);
  const z0 = s[0].z;
  const z1 = s[s.length - 1].z;
  const rows = (s.length - 1) * 3;

  const g = parametricPatch(
    (u, v) => {
      const t = u * (s.length - 1);
      const i = Math.min(s.length - 2, Math.floor(t));
      return at(lerp(s[i].z, s[i + 1].z, t - i), (v - 0.5) * TAU);
    },
    rows,
    segments,
    (u, v) => {
      const t = u * (s.length - 1);
      const i = Math.min(s.length - 2, Math.floor(t));
      return [(lerp(s[i].z, s[i + 1].z, t - i) - z0) / (z1 - z0 || 1), v];
    }
  );

  orientOutward(g, (z) => (at(z, 0).y + at(z, Math.PI).y) * 0.5);
  weldSeamNormals(g, rows, segments);

  const positions = Array.from(g.getAttribute('position').array);
  const uvs = Array.from(g.getAttribute('uv').array);
  const normals = Array.from(g.getAttribute('normal').array);
  const ix = Array.from(g.index.array);

  for (const end of [0, 1]) {
    if (!capEnds[end]) continue;
    const z = end ? z1 : z0;
    const center = positions.length / 3;
    positions.push(0, s[end ? s.length - 1 : 0].yCenter ?? 0, z);
    uvs.push(0.5, 0.5);
    normals.push(0, 0, end ? 1 : -1);
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * TAU;
      const p = at(z, a);
      positions.push(p.x, p.y, p.z);
      uvs.push(0.5 + 0.5 * Math.sin(a), 0.5 + 0.5 * Math.cos(a));
      normals.push(0, 0, end ? 1 : -1);
      const b = center + 1 + j;
      const c = center + 1 + ((j + 1) % segments);
      ix.push(center, end ? c : b, end ? b : c);
    }
  }

  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(ix);
  return g;
}

export function createSmoothFairingGeo(width, height, length, square = 0.16, segments = 18) {
  const stations = [
    [-0.5, 0.03],
    [-0.38, 0.68],
    [-0.16, 0.98],
    [0.2, 1.0],
    [0.4, 0.68],
    [0.5, 0.03]
  ].map(([zf, k]) => ({
    z: zf * length,
    halfWidth: (width * k) * 0.5,
    topHeight: (height * k) * 0.5,
    bottomHeight: (height * k) * 0.5,
    squareness: square
  }));
  return createLoftedFuselage(stations, segments);
}

export function createWingGeometry(o) {
  const { span, side, rootChord, tipChord, sweepZ } = o;
  const stations = [0, 0.06, 0.2, 0.5, 0.76, 0.94, 1];
  const points = [];
  const uv = [];
  const index = [];
  const detail = 20;

  for (const t of stations) {
    const round = t <= 0.94 ? 1 : 1 - 0.18 * Math.pow((t - 0.94) / 0.06, 2);
    const c = lerp(rootChord, tipChord, t) * round;
    const thickness =
      lerp(o.rootThickness ?? rootChord * 0.12, o.tipThickness ?? tipChord * 0.1, t) *
      (t === 1 ? 0.45 : 1);
    for (let i = 0; i <= detail; i++) {
      const a = (TAU * i) / detail;
      const d = (1 - Math.cos(a)) * 0.5;
      const y =
        5 *
        thickness *
        (0.2969 * Math.sqrt(d) -
          0.126 * d -
          0.3516 * d * d +
          0.2843 * Math.pow(d, 3) -
          0.1015 * Math.pow(d, 4));
      points.push(
        side * span * t,
        (o.dihedralY ?? 0) * t +
          (i <= detail / 2 ? y : -y) +
          (o.camber ?? 0.014) * c * 4 * d * (1 - d),
        sweepZ * t + (0.5 - d) * c
      );
      uv.push(t, d * 0.8 + 0.1);
    }
  }

  for (let j = 0; j < stations.length - 1; j++) {
    for (let i = 0; i < detail; i++) {
      const a = j * (detail + 1) + i;
      const b = a + detail + 1;
      if (side > 0) index.push(a, b, a + 1, b, b + 1, a + 1);
      else index.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }

  for (const j of [0, stations.length - 1]) {
    const s = j * (detail + 1);
    for (let i = 1; i < detail - 1; i++) {
      if ((j === 0) === (side > 0)) index.push(s, s + i, s + i + 1);
      else index.push(s, s + i + 1, s + i);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** Aspa perfilada y torsionada con punta amarilla pintada por vértice. */
export function createAirfoilBladeGeometry(length, chord, isRotor = false, bendFactor = 0) {
  const spans = [0, 0.14, 0.36, 0.62, 0.85, 0.86, 1.0];
  const P = [];
  const C = [];
  const U = [];
  const I = [];
  const dark = new THREE.Color(0x1f2428);
  const leadEdge = new THREE.Color(0x646b72);
  const yellowTip = new THREE.Color(0xeab308);

  spans.forEach((t, j) => {
    const w = chord * (0.52 + 0.64 * Math.sin(Math.PI * (0.14 + t * 0.72))) * (t === 1 ? 0.72 : 1);
    const twist = (1 - t) * (isRotor ? 0.12 : 0.52) + 0.10;
    const sweep = chord * (isRotor ? 0.42 : 0.36) * t * t;
    const droopZ = bendFactor * length * t * t;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const x = (Math.cos(a) * w) * 0.5;
      const h = Math.sin(a) * chord * 0.06;
      P.push(x * Math.cos(twist) + sweep, t * length, h + x * Math.sin(twist) + droopZ);
      const col = t > 0.855 ? yellowTip : i === 0 ? leadEdge : dark;
      C.push(col.r, col.g, col.b);
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
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  geo.setIndex(I);
  geo.computeVertexNormals();
  return geo;
}

export function roundedBox(w, h, d, r = Math.min(w, h, d) * 0.2) {
  return r > 0.004 ? new RoundedBoxGeometry(w, h, d, 1, r) : new THREE.BoxGeometry(w, h, d);
}

export function makeMesh(geo, mat, x = 0, y = 0, z = 0, castShadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = castShadow && !mat.transparent;
  m.receiveShadow = true;
  return m;
}

export function zCylinder(r0, r1, length, mat, seg = 12) {
  const g = new THREE.CylinderGeometry(r1, r0, length, seg);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, length * 0.5);
  return makeMesh(g, mat);
}

export function latheMesh(profile, mat, seg = 20) {
  const g = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    seg
  );
  g.computeVertexNormals();
  return makeMesh(g, mat);
}

export function tubeMesh(points, radius, mat, closed = false, radialSegs = 6) {
  const curve = new THREE.CatmullRomCurve3(points, closed);
  const segs = Math.max(6, Math.round(points.length * 1.4));
  const g = new THREE.TubeGeometry(curve, segs, radius, radialSegs, closed);
  return makeMesh(g, mat);
}

export function buildFlightCrewFigure(M, seated = true, scale = 1.0) {
  const g = new THREE.Group();
  g.scale.setScalar(scale);
  const base = seated ? 0 : 0.27;
  const torso = makeMesh(new THREE.CapsuleGeometry(0.062, 0.12, 2, 7), M.crewSuit, 0, base + 0.13, seated ? -0.02 : 0);
  const head = makeMesh(new THREE.SphereGeometry(0.046, 10, 8), M.crewHelmet, 0, base + 0.29, seated ? -0.015 : 0);
  head.scale.set(1, 1.08, 1.05);
  const visor = makeMesh(new THREE.SphereGeometry(0.041, 10, 6, 0, TAU, 0, Math.PI / 2.3), M.crewVisor, 0, base + 0.285, seated ? 0.014 : 0.028);
  visor.rotation.x = Math.PI / 2;
  g.add(torso, head, visor);

  for (const s of [-1, 1]) {
    const arm = makeMesh(new THREE.CapsuleGeometry(0.022, 0.12, 2, 6), M.crewSuit, s * 0.078, base + 0.13, seated ? 0.05 : 0.04);
    arm.rotation.x = seated ? -1.0 : -0.7;
    g.add(arm);
    if (seated) {
      const thigh = makeMesh(new THREE.CapsuleGeometry(0.03, 0.12, 2, 6), M.crewSuit, s * 0.04, 0.02, 0.09);
      thigh.rotation.x = Math.PI / 2;
      const shin = makeMesh(new THREE.CapsuleGeometry(0.026, 0.12, 2, 6), M.crewSuit, s * 0.04, -0.07, 0.17);
      g.add(thigh, shin);
    } else {
      const leg = makeMesh(new THREE.CapsuleGeometry(0.03, 0.2, 2, 6), M.crewSuit, s * 0.038, 0.13, 0);
      g.add(leg);
    }
  }
  return g;
}

export function buildArmoredCockpitSeat(M, scale = 1.0) {
  const g = new THREE.Group();
  g.scale.setScalar(scale);
  g.add(makeMesh(roundedBox(0.18, 0.048, 0.18), M.cockpitSeatBlack, 0, -0.022, 0));
  const back = makeMesh(roundedBox(0.17, 0.28, 0.048), M.cockpitSeatBlack, 0, 0.135, -0.095);
  back.rotation.x = -0.12;
  g.add(back);
  for (const s of [-1, 1]) {
    g.add(makeMesh(roundedBox(0.022, 0.22, 0.07), M.titanium, s * 0.095, 0.13, -0.065));
  }
  g.add(makeMesh(new THREE.CylinderGeometry(0.022, 0.028, 0.13, 8), M.weaponSteel, 0, -0.1, 0));
  return g;
}

export function buildOleoWheelAssembly(M, topPos, wheelR, dualWheel = true) {
  const g = new THREE.Group();
  g.position.copy(topPos);
  const h = Math.max(0.18, topPos.y - wheelR);
  g.add(makeMesh(new THREE.CylinderGeometry(0.036, 0.042, h * 0.56, 10), M.titanium, 0, -h * 0.28, 0));
  g.add(makeMesh(new THREE.CylinderGeometry(0.024, 0.024, h * 0.5, 10), M.chrome, 0, -h * 0.72, 0));

  for (const [yy, rx] of [
    [-h * 0.5, 0.52],
    [-h * 0.72, -0.52]
  ]) {
    const link = makeMesh(roundedBox(0.016, h * 0.24, 0.055), M.weaponSteel, 0, yy, -0.036);
    link.rotation.x = rx;
    g.add(link);
  }

  const axleW = dualWheel ? wheelR * 1.72 : wheelR * 0.9;
  const axle = makeMesh(new THREE.CylinderGeometry(0.016, 0.016, axleW, 8), M.weaponSteel, 0, -h, 0);
  axle.rotation.z = Math.PI / 2;
  g.add(axle);

  const offsets = dualWheel ? [-wheelR * 0.54, wheelR * 0.54] : [0];
  const w = wheelR * 0.35;
  for (const ox of offsets) {
    const tire = latheMesh(
      [
        [wheelR * 0.48, -w],
        [wheelR * 0.80, -w],
        [wheelR * 0.95, -w * 0.72],
        [wheelR, -w * 0.30],
        [wheelR, w * 0.30],
        [wheelR * 0.95, w * 0.72],
        [wheelR * 0.80, w],
        [wheelR * 0.48, w],
        [wheelR * 0.48, -w]
      ],
      M.tireRubber,
      16
    );
    tire.rotation.z = Math.PI / 2;
    tire.position.set(ox, -h, 0);

    const hub = latheMesh(
      [
        [0, -w * 1.06],
        [wheelR * 0.28, -w * 1.06],
        [wheelR * 0.48, -w * 0.88],
        [wheelR * 0.48, w * 0.88],
        [wheelR * 0.28, w * 1.06],
        [0, w * 1.06]
      ],
      M.titanium,
      12
    );
    hub.rotation.z = Math.PI / 2;
    hub.position.set(ox, -h, 0);
    g.add(tire, hub);
  }
  return g;
}

/**
 * Actuador hidráulico telescópico real entre un anclaje fijo del fuselaje y un anclaje de rampa/puerta.
 * Reutiliza vectores internos (CERO allocs en update()).
 */
export class TelescopicPiston {
  constructor(anchorA, localA, anchorB, localB, closedLength, radius, M) {
    this.anchorA = anchorA;
    this.localA = localA.clone();
    this.anchorB = anchorB;
    this.localB = localB.clone();
    this.sleeveLen = Math.max(0.08, closedLength * 0.62);

    this._worldA = new THREE.Vector3();
    this._worldB = new THREE.Vector3();
    this._localParentA = new THREE.Vector3();

    this.group = new THREE.Group();
    this.group.add(zCylinder(radius, radius, this.sleeveLen, M.weaponSteel, 10));
    this.group.add(makeMesh(new THREE.SphereGeometry(radius * 1.28, 8, 6), M.titanium));

    const rodGeo = new THREE.CylinderGeometry(radius * 0.56, radius * 0.56, 1, 8);
    rodGeo.rotateX(Math.PI / 2);
    rodGeo.translate(0, 0, 0.5);
    this.rod = makeMesh(rodGeo, M.chrome);
    this.eye = makeMesh(new THREE.SphereGeometry(radius * 1.12, 8, 6), M.weaponSteel);
    this.group.add(this.rod, this.eye);
  }

  update() {
    if (!this.group.parent) return;
    this.anchorA.localToWorld(this._worldA.copy(this.localA));
    this.anchorB.localToWorld(this._worldB.copy(this.localB));
    this._localParentA.copy(this._worldA);
    this.group.parent.worldToLocal(this._localParentA);
    this.group.position.copy(this._localParentA);
    this.group.lookAt(this._worldB);

    const dist = this._worldA.distanceTo(this._worldB);
    const rodLen = Math.max(0.03, dist - this.sleeveLen * 0.88);
    this.rod.scale.set(1, 1, rodLen);
    this.rod.position.z = dist - rodLen;
    this.eye.position.z = dist;
  }
}

/**
 * Fusiona hojas opacas estáticas dentro de cada pivote rígido por material para reducir drásticamente
 * las draw calls a 60 FPS sin alterar pivotes animados ni mallas semitransparentes.
 */
export function bakeRigidAircraftBatches(root, dynamicObjects = []) {
  root.updateMatrixWorld(true);
  const dynamicSet = new Set(dynamicObjects);
  const buckets = new Map();

  root.traverse((obj) => {
    if (
      !obj.isMesh ||
      obj.isInstancedMesh ||
      obj.children.length > 0 ||
      dynamicSet.has(obj) ||
      Array.isArray(obj.material) ||
      !obj.material ||
      obj.material.transparent
    ) {
      return;
    }

    let anchor = obj.parent;
    while (anchor && anchor !== root && !dynamicSet.has(anchor)) {
      anchor = anchor.parent;
    }
    if (!anchor) anchor = root;

    const attrKey = Object.keys(obj.geometry.attributes).sort().join(',');
    const key = `${anchor.uuid}|${obj.material.uuid}|${obj.castShadow}|${attrKey}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { anchor, mat: obj.material, castShadow: obj.castShadow, meshes: [] };
      buckets.set(key, bucket);
    }
    bucket.meshes.push(obj);
  });

  const invAnchor = new THREE.Matrix4();
  const relMat = new THREE.Matrix4();

  for (const bucket of buckets.values()) {
    if (bucket.meshes.length < 2) {
      for (const single of bucket.meshes) registerSharedAircraftGeo(single.geometry);
      continue;
    }

    invAnchor.copy(bucket.anchor.matrixWorld).invert();
    const parts = [];
    for (const m of bucket.meshes) {
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      relMat.multiplyMatrices(invAnchor, m.matrixWorld);
      g.applyMatrix4(relMat);
      for (const attr of Object.keys(g.attributes)) {
        if (attr !== 'position' && attr !== 'normal' && attr !== 'uv' && attr !== 'color') {
          g.deleteAttribute(attr);
        }
      }
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) {
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      }
      parts.push(g);
    }

    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    if (!merged) continue;

    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    registerSharedAircraftGeo(merged);

    const batchedMesh = new THREE.Mesh(merged, bucket.mat);
    batchedMesh.castShadow = bucket.castShadow;
    batchedMesh.receiveShadow = true;
    bucket.anchor.add(batchedMesh);

    for (const m of bucket.meshes) {
      const oldGeo = m.geometry;
      m.removeFromParent();
      if (!_sharedGeometries.has(oldGeo)) oldGeo.dispose();
    }
  }

  root.traverse((obj) => {
    if (obj.isMesh && obj.geometry) registerSharedAircraftGeo(obj.geometry);
    if (obj.isMesh && obj.material && !Array.isArray(obj.material)) registerSharedAircraftMat(obj.material);
  });
}

// ---------------------------------------------------------------------------------------------
// Controles articulados compartidos (Bloque 6A): setThrottle / setDoorsOpen / aimTurrets / setFiring.
// Cada campo en `null` significa "modo demostración autónomo" (barridos y ráfagas procedurales),
// de modo que el avión de transporte sigue animándose solo si el juego no le da órdenes.
// ---------------------------------------------------------------------------------------------

export function createAircraftControls() {
  return {
    throttle: null, // 0..1 o null (automático)
    doorsOpen: null, // true/false o null (sigue rampTarget interno)
    hasAim: false,
    aimTarget: new THREE.Vector3(), // punto del mundo al que apuntan los afustes
    firing: null // true/false o null (ráfagas de demostración)
  };
}

/** Añade al rig los métodos públicos de control sobre un objeto `controls` de createAircraftControls(). */
export function attachAircraftControlApi(rig, controls) {
  rig.controls = controls;
  rig.setThrottle = (v) => {
    controls.throttle = v === null || v === undefined ? null : clamp(Number(v) || 0, 0, 1);
  };
  rig.setDoorsOpen = (open) => {
    controls.doorsOpen = open === null || open === undefined ? null : Boolean(open);
  };
  rig.aimTurrets = (worldTarget) => {
    if (!worldTarget) {
      controls.hasAim = false;
      return;
    }
    controls.aimTarget.set(worldTarget.x, worldTarget.y, worldTarget.z);
    controls.hasAim = true;
  };
  rig.setFiring = (on) => {
    controls.firing = on === null || on === undefined ? null : Boolean(on);
  };
  return rig;
}

const _aimLocal = new THREE.Vector3();

/**
 * Resuelve el pan/tilt de un afuste (grupo `pan` con hijo `tilt`, cañón hacia +Z local) para apuntar a un
 * punto del mundo, limitado a su arco de tiro para que el cañón nunca atraviese el marco de la ventana.
 * Devuelve false si el objetivo es degenerado; en `out` deja { pan, tilt }. Sin asignaciones por fotograma.
 */
export function solveMountAim(pan, worldTarget, panCenter, panRange, tiltMin, tiltMax, out) {
  const parent = pan.parent;
  if (!parent) return false;
  _aimLocal.copy(worldTarget);
  parent.worldToLocal(_aimLocal).sub(pan.position);
  const horiz = Math.hypot(_aimLocal.x, _aimLocal.z);
  if (horiz + Math.abs(_aimLocal.y) < 1e-5) return false;
  let d = Math.atan2(_aimLocal.x, _aimLocal.z) - panCenter;
  d = Math.atan2(Math.sin(d), Math.cos(d)); // envolver a [-π, π]
  out.pan = panCenter + clamp(d, -panRange, panRange);
  // Rotación +X lleva +Z hacia -Y: tilt positivo = cañón hacia abajo
  out.tilt = clamp(Math.atan2(-_aimLocal.y, horiz), tiltMin, tiltMax);
  return true;
}
