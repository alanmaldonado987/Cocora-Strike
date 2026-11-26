import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { GeoBuilder, rng } from '../../helpers'

/* ============================ Dimensiones (m) ============================ */
export const DIM = {
  hipY: 0.965, hipX: 0.098, thigh: 0.45, shin: 0.43, ankleH: 0.085,
  spineY: 0.08, chestY: 0.2, neckY: 0.27, headY: 0.07,
  shoulderX: 0.19, shoulderY: 0.24, upperArm: 0.3, foreArm: 0.27, palm: 0.075,
}

export const COL = {
  skin: '#c4875f', skinDark: '#9c6544', beard: '#2b1d14', shirt: '#efe9dc', pants: '#2f3441', boot: '#3b2b20',
  sole: '#17120e', leather: '#4a2f1c', olive: '#556b2f', oliveDark: '#4b5320', strap: '#1f2117', buckle: '#b9b4a6',
  cream: '#f3eedf',
}

/* ============================ Texturas canvas ============================ */
const cache = new Map<string, THREE.Texture>()
function canvasTex(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, rep: [number, number] = [1, 1]) {
  const hit = cache.get(key)
  if (hit) return hit
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  draw(cv.getContext('2d')!, w, h)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(rep[0], rep[1])
  t.anisotropy = 8
  cache.set(key, t)
  return t
}

/** Trenzado del vueltiao: bandas de "pintas" geométricas blanco/negro. */
function drawBraid(c: CanvasRenderingContext2D, w: number, h: number, bands: ('solid' | 'dark' | 'zig' | 'diamond' | 'teeth')[]) {
  const cream = '#ece2c6', black = '#151311'
  c.fillStyle = cream; c.fillRect(0, 0, w, h)
  const bh = h / bands.length
  bands.forEach((b, k) => {
    const y0 = k * bh
    c.fillStyle = black
    if (b === 'dark') c.fillRect(0, y0, w, bh)
    if (b === 'zig') {
      c.beginPath(); c.moveTo(0, y0 + bh)
      for (let i = 0; i <= 4; i++) { c.lineTo((i + 0.5) * (w / 4), y0 + bh * 0.15); c.lineTo((i + 1) * (w / 4), y0 + bh) }
      c.closePath(); c.fill()
    }
    if (b === 'diamond') {
      for (let i = 0; i < 2; i++) {
        const cx = (i + 0.5) * (w / 2), cy = y0 + bh / 2
        c.beginPath(); c.moveTo(cx, y0 + 2); c.lineTo(cx + w / 4 - 2, cy); c.lineTo(cx, y0 + bh - 2); c.lineTo(cx - w / 4 + 2, cy); c.closePath(); c.fill()
        c.fillStyle = cream; c.fillRect(cx - 3, cy - 3, 6, 6); c.fillStyle = black
      }
    }
    if (b === 'teeth') for (let i = 0; i < 4; i++) c.fillRect(i * (w / 4), y0 + bh * 0.2, w / 8, bh * 0.6)
  })
  // fibra trenzada
  c.strokeStyle = 'rgba(80,60,30,0.22)'; c.lineWidth = 1
  for (let y = 0; y < h; y += 4) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y + 3); c.stroke() }
}

export const CTEX = {
  hatBrim: () => canvasTex('hatBrim', 64, 512, (c, w, h) => drawBraid(c, w, h, ['dark', 'solid', 'zig', 'solid', 'dark', 'solid', 'dark', 'diamond', 'solid', 'zig', 'solid', 'dark', 'teeth', 'solid', 'dark']), [22, 1]),
  hatCrown: () => canvasTex('hatCrown', 64, 256, (c, w, h) => drawBraid(c, w, h, ['dark', 'solid', 'zig', 'solid', 'diamond', 'solid', 'dark']), [12, 1]),
  ruana: () => canvasTex('ruana', 512, 512, (c, w, h) => {
    c.fillStyle = COL.cream; c.fillRect(0, 0, w, h)
    const r = rng(3)
    c.globalAlpha = 0.18
    for (let i = 0; i < 2200; i++) { c.fillStyle = r() > 0.5 ? '#d8cfb8' : '#ffffff'; c.fillRect(r() * w, r() * h, 2, 1) }
    c.globalAlpha = 1
    c.fillStyle = '#141414'
    // franjas laterales verticales (dobles)
    for (const x of [0.06, 0.09, 0.91, 0.94]) c.fillRect(x * w, 0, 5, h * 0.8)
    // franjas horizontales triples en el borde inferior
    for (const [y, t] of [[0.8, 6], [0.835, 12], [0.875, 6], [0.93, 5]] as [number, number][]) c.fillRect(0, y * h, w, t)
  }),
  canopy: () => canvasTex('canopy', 256, 64, (c, w, h) => {
    const cols = ['#b83a2c', '#f1ece0', '#556b2f', '#f1ece0']
    for (let i = 0; i < 12; i++) { c.fillStyle = cols[i % 4]; c.fillRect((i / 12) * w, 0, w / 12 + 1, h) }
  }),
  medkit: () => canvasTex('medkitHeal', 128, 64, (c, w, h) => {
    c.fillStyle = '#f5f6f4'; c.fillRect(0, 0, w, h)
    c.fillStyle = '#e02b2b'; c.fillRect(w / 2 - 7, 10, 14, h - 20); c.fillRect(w / 2 - 22, h / 2 - 7, 44, 14)
  }),
}

/* ============================ Ruana (cascarón con grosor) ============================ */
const FRONT = new THREE.CatmullRomCurve3([[0, 0.31, 0], [0, 0.29, 0.09], [0, 0.2, 0.158], [0, 0.02, 0.188], [0, -0.22, 0.208], [0, -0.53, 0.238]].map((p) => new THREE.Vector3(...p)))
const BACK = new THREE.CatmullRomCurve3([[0, 0.31, 0], [0, 0.29, -0.09], [0, 0.2, -0.152], [0, 0.0, -0.168], [0, -0.25, -0.182], [0, -0.53, -0.202]].map((p) => new THREE.Vector3(...p)))
const _cp = new THREE.Vector3()
/** Punto de la superficie de la ruana (espacio del pecho). side 1 = delante, -1 = detrás. u∈[0,1] ancho, v∈[0,1] alto. */
export function ruanaPoint(side: 1 | -1, u: number, v: number, out: THREE.Vector3) {
  ;(side === 1 ? FRONT : BACK).getPoint(Math.min(1, Math.max(0, v)), _cp)
  const uu = u * 2 - 1
  const W = 0.272 + 0.075 * v
  const bulge = (side === 1 ? 0.034 : 0.03) * (1 - uu * uu) * Math.min(1, v * 6)
  return out.set(uu * W, _cp.y - 0.035 * uu * uu * v, _cp.z + side * bulge)
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3()
export function ruanaOffsetPoint(side: 1 | -1, u: number, v: number, off: number, out: THREE.Vector3) {
  ruanaPoint(side, u, v, out)
  ruanaPoint(side, u + 0.01, v, _a).sub(out)
  ruanaPoint(side, u, v + 0.01, _b).sub(out)
  _c.crossVectors(_a, _b).normalize()
  if (_c.z * side < 0) _c.negate()
  return out.addScaledVector(_c, off)
}

function shellGeometry(nu: number, nv: number, fn: (u: number, v: number, o: THREE.Vector3) => void, thick: number, outwardZ: number) {
  const cols = nu + 1, rows = nv + 1, N = cols * rows
  const front = new Float32Array(N * 3), uvs = new Float32Array(N * 2)
  const t = new THREE.Vector3()
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const k = j * cols + i
    fn(i / nu, j / nv, t)
    front.set([t.x, t.y, t.z], k * 3)
    uvs.set([i / nu, 1 - j / nv], k * 2)
  }
  const faces: number[] = []
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1
    faces.push(a, c, b, b, c, d)
  }
  // orientar hacia afuera
  const tmp = new THREE.BufferGeometry()
  tmp.setAttribute('position', new THREE.BufferAttribute(front, 3)); tmp.setIndex(faces); tmp.computeVertexNormals()
  const nrm = tmp.attributes.normal as THREE.BufferAttribute
  const mid = Math.floor(rows / 2) * cols + Math.floor(cols / 2)
  if (nrm.getZ(mid) * outwardZ < 0) { for (let f = 0; f < faces.length; f += 3) { const x = faces[f + 1]; faces[f + 1] = faces[f + 2]; faces[f + 2] = x } tmp.setIndex(faces); tmp.computeVertexNormals() }
  const n2 = tmp.attributes.normal as THREE.BufferAttribute
  const pos = new Float32Array(N * 6), uv = new Float32Array(N * 4)
  pos.set(front); uv.set(uvs); uv.set(uvs, N * 2)
  for (let k = 0; k < N; k++) pos.set([front[k * 3] - n2.getX(k) * thick, front[k * 3 + 1] - n2.getY(k) * thick, front[k * 3 + 2] - n2.getZ(k) * thick], (N + k) * 3)
  const idx = faces.slice()
  for (let f = 0; f < faces.length; f += 3) idx.push(faces[f] + N, faces[f + 2] + N, faces[f + 1] + N)
  const loop: number[] = []
  for (let i = 0; i < cols; i++) loop.push(i)
  for (let j = 1; j < rows; j++) loop.push(j * cols + nu)
  for (let i = nu - 1; i >= 0; i--) loop.push(nv * cols + i)
  for (let j = nv - 1; j > 0; j--) loop.push(j * cols)
  for (let q = 0; q < loop.length; q++) {
    const k0 = loop[q], k1 = loop[(q + 1) % loop.length]
    idx.push(k0, k1, k1 + N, k0, k1 + N, k0 + N, k0, k1 + N, k1, k0, k0 + N, k1 + N)
  }
  tmp.dispose()
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

function fringe(side: 1 | -1) {
  const b = new GeoBuilder()
  const strand = new THREE.BoxGeometry(0.007, 0.055, 0.007); strand.translate(0, -0.0275, 0)
  const p = new THREE.Vector3()
  const r = rng(side === 1 ? 5 : 6)
  for (let i = 0; i <= 44; i++) {
    ruanaPoint(side, i / 44, 1, p)
    b.add(strand, [p.x, p.y + 0.004, p.z], [(r() - 0.5) * 0.25, 0, (r() - 0.5) * 0.25], [1, 0.75 + r() * 0.5, 1])
  }
  strand.dispose()
  return b.build()
}

/* ============================ Utilidades ============================ */
function lathe(pts: [number, number][], seg = 20, sz = 1) {
  const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg)
  if (sz !== 1) g.scale(1, 1, sz)
  return g
}
function sphere(r: number, s: [number, number, number] = [1, 1, 1], p: [number, number, number] = [0, 0, 0], ws = 20, hs = 14) {
  const g = new THREE.SphereGeometry(r, ws, hs)
  g.scale(...s); g.translate(...p)
  return g
}
function rbox(w: number, h: number, d: number, r: number, p: [number, number, number] = [0, 0, 0]) {
  const g = new RoundedBoxGeometry(w, h, d, 3, r)
  g.translate(...p)
  return g
}
function box(w: number, h: number, d: number, p: [number, number, number] = [0, 0, 0], rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d)
  if (rz) g.rotateZ(rz)
  g.translate(...p)
  return g
}
const UP = new THREE.Vector3(0, 1, 0)
function rodBetween(b: GeoBuilder, a: THREE.Vector3, c: THREE.Vector3, rad: number) {
  const dir = c.clone().sub(a)
  const len = dir.length()
  const geo = new THREE.CylinderGeometry(rad, rad, 1, 5)
  const m = new THREE.Matrix4().compose(a.clone().add(c).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()), new THREE.Vector3(1, len, 1))
  b.addM(geo, m)
  geo.dispose()
}
function strapGeometry(pts: THREE.Vector3[]) {
  const shape = new THREE.Shape()
  shape.moveTo(-0.006, -0.026); shape.lineTo(0.006, -0.026); shape.lineTo(0.006, 0.026); shape.lineTo(-0.006, 0.026); shape.closePath()
  return new THREE.ExtrudeGeometry(shape, { steps: 48, bevelEnabled: false, extrudePath: new THREE.CatmullRomCurve3(pts) })
}

/* ============================ Geometrías del personaje ============================ */
let G: ReturnType<typeof buildAll> | null = null
export function charGeo() { return (G ??= buildAll()) }

function buildAll() {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
  const P = new THREE.Vector3()
  // ----- correas de la mochila (por encima de la ruana) -----
  const straps = ([1, -1] as const).map((sx) => {
    const u = 0.5 + sx * 0.2
    const pts = [v(sx * 0.105, 0.2, -0.205)]
    pts.push(ruanaOffsetPoint(-1, u, 0.13, 0.024, new THREE.Vector3()))
    pts.push(v(sx * 0.11, 0.335, 0.0))
    for (const vv of [0.12, 0.26, 0.4, 0.52]) pts.push(ruanaOffsetPoint(1, u, vv, 0.022, new THREE.Vector3()))
    return strapGeometry(pts)
  })
  ruanaOffsetPoint(1, 0.5, 0.3, 0.03, P)
  const sternumZ = P.z, sternumY = P.y

  // ----- botas -----
  const footShape = new THREE.Shape()
  footShape.moveTo(-0.065, 0); footShape.lineTo(0.15, 0); footShape.quadraticCurveTo(0.19, 0.005, 0.185, 0.045)
  footShape.quadraticCurveTo(0.17, 0.085, 0.09, 0.1); footShape.lineTo(0.035, 0.135); footShape.lineTo(-0.065, 0.135); footShape.closePath()
  const foot = new THREE.ExtrudeGeometry(footShape, { depth: 0.09, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 8 })
  foot.rotateY(-Math.PI / 2); foot.translate(0.045, -DIM.ankleH + 0.022, 0)
  const lugs = new GeoBuilder()
  const lug = new THREE.BoxGeometry(0.1, 0.012, 0.022)
  for (let i = 0; i < 7; i++) lugs.add(lug, [0, -DIM.ankleH - 0.004, -0.06 + i * 0.036])
  lug.dispose()

  // ----- paracaídas -----
  const canopy = new THREE.SphereGeometry(1.45, 36, 10, 0, Math.PI * 2, 0, 1.05)
  canopy.scale(1.3, 0.55, 1.0)
  const lines = new GeoBuilder()
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2
    const rim = v(Math.cos(a) * 1.45 * Math.sin(1.05) * 1.3, 2.75 + 1.45 * Math.cos(1.05) * 0.55, Math.sin(a) * 1.45 * Math.sin(1.05))
    rodBetween(lines, rim, v(Math.cos(a) > 0 ? 0.3 : -0.3, 0.98, 0.05), 0.005)
  }
  for (const sx of [1, -1]) rodBetween(lines, v(sx * 0.3, 0.98, 0.05), v(sx * 0.17, 0.5, 0.0), 0.008)

  return {
    // cabeza
    skull: sphere(0.1, [0.9, 1.08, 1.0], [0, 0.1, 0], 32, 24),
    jaw: sphere(0.08, [0.95, 0.82, 1.0], [0, 0.045, 0.022], 24, 16),
    nose: sphere(0.019, [0.75, 1.25, 1.0], [0, 0.085, 0.1], 12, 10),
    ear: sphere(0.026, [0.42, 1.0, 0.72], [0, 0, 0], 12, 10),
    eye: sphere(0.0135, [1, 1, 1], [0, 0, 0], 12, 10),
    iris: sphere(0.0075, [1, 1, 0.6], [0, 0, 0], 10, 8),
    brow: box(0.04, 0.011, 0.014),
    beard: (() => { const g = new THREE.SphereGeometry(0.084, 24, 12, Math.PI / 2 - 1.95, 3.9, 1.5, 1.25); g.scale(0.98, 0.86, 1.04); g.translate(0, 0.045, 0.024); return g })(),
    mustache: (() => { const g = new THREE.TorusGeometry(0.026, 0.0075, 6, 14, Math.PI); g.rotateZ(Math.PI); g.scale(1, 0.55, 1); g.translate(0, 0.067, 0.1); return g })(),
    sideburn: box(0.014, 0.05, 0.03),
    hair: (() => { const g = new THREE.SphereGeometry(0.104, 28, 14, 0, Math.PI * 2, 0, 1.55); g.scale(0.92, 1.06, 1.02); g.translate(0, 0.1, -0.004); return g })(),
    neck: new THREE.CylinderGeometry(0.047, 0.056, 0.13, 16).translate(0, 0.03, 0),
    // torso
    torso: lathe([[0, -0.24], [0.15, -0.235], [0.155, -0.12], [0.17, 0.0], [0.188, 0.14], [0.193, 0.22], [0.168, 0.28], [0.09, 0.31], [0, 0.315]], 28, 0.62),
    waist: lathe([[0, -0.08], [0.15, -0.078], [0.146, 0.05], [0.15, 0.2], [0, 0.205]], 24, 0.7),
    pelvis: sphere(0.165, [1, 0.62, 0.72], [0, 0, 0], 24, 16),
    belt: new THREE.CylinderGeometry(0.153, 0.153, 0.042, 28).scale(1, 1, 0.73).translate(0, 0.075, 0),
    buckle: box(0.05, 0.034, 0.012),
    collar: new THREE.TorusGeometry(0.068, 0.022, 10, 24).rotateX(Math.PI / 2).translate(0, 0.3, 0),
    // brazos
    shoulderBall: sphere(0.058, [1, 1, 1], [0, 0, 0], 16, 12),
    upperArm: lathe([[0, -0.3], [0.046, -0.29], [0.05, -0.2], [0.055, -0.08], [0.058, 0], [0.04, 0.04], [0, 0.05]], 18),
    elbowBall: sphere(0.047, [1, 1, 1], [0, 0, 0], 14, 10),
    foreArm: lathe([[0, -0.255], [0.037, -0.25], [0.041, -0.2], [0.05, -0.08], [0.048, -0.01], [0.03, 0.02], [0, 0.025]], 18),
    cuff: new THREE.CylinderGeometry(0.043, 0.04, 0.035, 16).translate(0, -0.24, 0),
    palm: rbox(0.078, 0.082, 0.036, 0.014, [0, -0.04, 0]),
    phal1: new THREE.CapsuleGeometry(0.0105, 0.026, 4, 8).translate(0, -0.018, 0),
    phal2: new THREE.CapsuleGeometry(0.0098, 0.02, 4, 8).translate(0, -0.015, 0),
    thumb: new THREE.CapsuleGeometry(0.0115, 0.032, 4, 8).translate(0, -0.02, 0),
    // piernas
    thigh: lathe([[0, -0.46], [0.058, -0.455], [0.066, -0.4], [0.078, -0.25], [0.088, -0.1], [0.09, -0.02], [0.06, 0.03], [0, 0.035]], 20),
    knee: sphere(0.062, [1, 1, 1], [0, 0, 0], 16, 12),
    shin: lathe([[0, -0.36], [0.05, -0.355], [0.052, -0.3], [0.063, -0.16], [0.06, -0.07], [0.055, -0.01], [0.03, 0.02], [0, 0.025]], 20),
    bootShaft: new THREE.CylinderGeometry(0.066, 0.062, 0.17, 18).translate(0, 0.02, 0),
    bootCuff: new THREE.TorusGeometry(0.064, 0.012, 8, 18).rotateX(Math.PI / 2).translate(0, 0.105, 0),
    foot,
    sole: (() => { const g = new THREE.ExtrudeGeometry(footShape, { depth: 0.112, bevelEnabled: false, curveSegments: 8 }); g.scale(1.04, 0.2, 1); g.rotateY(-Math.PI / 2); g.translate(0.056, -DIM.ankleH + 0.005, 0); return g })(),
    lugs: lugs.build(),
    laces: (() => { const b = new GeoBuilder(); const l = new THREE.BoxGeometry(0.06, 0.006, 0.01); for (let i = 0; i < 4; i++) b.add(l, [0, 0.0 - i * 0.025, 0.07 - i * 0.012], [0.5, 0, 0]); l.dispose(); return b.build() })(),
    // ruana
    ruanaFront: shellGeometry(22, 26, (u, vv, o) => ruanaPoint(1, u, vv, o), 0.012, 1),
    ruanaBack: shellGeometry(22, 26, (u, vv, o) => ruanaPoint(-1, u, vv, o), 0.012, -1),
    fringeFront: fringe(1),
    fringeBack: fringe(-1),
    // sombrero vueltiao (perfil antihorario => normales hacia afuera)
    hatBrim: lathe((() => {
      const pts: [number, number][] = []
      const up = (r: number) => 0.003 + 0.04 * Math.pow((r - 0.104) / 0.256, 2.3)
      for (let i = 0; i <= 12; i++) { const r = 0.104 + (i / 12) * 0.256; pts.push([r, up(r) - 0.008]) }
      pts.push([0.364, up(0.36) + 0.003])
      for (let i = 12; i >= 0; i--) { const r = 0.104 + (i / 12) * 0.256; pts.push([r, up(r) + 0.004]) }
      return pts
    })(), 56),
    hatCrown: lathe([[0, 0], [0.106, 0], [0.106, 0.02], [0.101, 0.085], [0.094, 0.115], [0.075, 0.13], [0.04, 0.136], [0, 0.138]], 40),
    hatBand: new THREE.CylinderGeometry(0.1075, 0.109, 0.026, 40).translate(0, 0.022, 0),
    // mochila
    packBody: rbox(0.34, 0.44, 0.19, 0.055),
    packFlapTop: rbox(0.352, 0.05, 0.212, 0.022),
    packFlapFront: rbox(0.352, 0.16, 0.03, 0.014),
    packStrap: box(0.034, 0.2, 0.012),
    packBuckle: box(0.046, 0.03, 0.016),
    pocket: rbox(0.13, 0.15, 0.06, 0.02),
    pocketFlap: rbox(0.138, 0.05, 0.068, 0.016),
    sidePocket: rbox(0.055, 0.2, 0.12, 0.022),
    bedroll: new THREE.CylinderGeometry(0.056, 0.056, 0.38, 18).rotateZ(Math.PI / 2),
    bedrollTie: new THREE.TorusGeometry(0.058, 0.007, 6, 18).rotateY(Math.PI / 2),
    strapL: straps[0],
    strapR: straps[1],
    sternum: box(0.25, 0.022, 0.012, [0, sternumY, sternumZ]),
    // equipo
    canopy,
    chuteLines: lines.build(),
    medkit: rbox(0.2, 0.13, 0.09, 0.02),
    healCross: (() => { const b = new GeoBuilder(); b.add(new THREE.BoxGeometry(0.06, 0.02, 0.02)); b.add(new THREE.BoxGeometry(0.02, 0.06, 0.02)); return b.build() })(),
    dust: new THREE.IcosahedronGeometry(0.09, 0),
    flashCone: new THREE.ConeGeometry(0.05, 0.18, 8).rotateZ(-Math.PI / 2).translate(0.09, 0, 0),
    flashStar: new THREE.ConeGeometry(0.1, 0.07, 6).rotateZ(Math.PI / 2),
  }
}
